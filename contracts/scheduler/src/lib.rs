#![no_std]

multiversx_sc::imports!();

pub mod config;
pub mod events;
pub mod helpers;
pub mod storage;
pub mod validation;
pub mod views;

/// XCron Scheduler Contract
///
/// Core contract managing task registration, queueing, and execution dispatch.
/// Follows trait composition pattern: lib.rs composes module traits only.
#[multiversx_sc::contract]
pub trait SchedulerContract:
    storage::StorageModule
    + events::EventsModule
    + views::ViewsModule
    + config::ConfigModule
    + validation::ValidationModule
    + helpers::HelpersModule
{
    /// Initialize the Scheduler with protocol parameters.
    #[init]
    fn init(
        &self,
        keeper_registry: ManagedAddress,
        rewards_addr: ManagedAddress,
        min_deposit: BigUint,
        protocol_fee_bps: u64,
    ) {
        self.keeper_registry_addr().set(&keeper_registry);
        self.rewards_addr().set(&rewards_addr);
        self.min_deposit().set(&min_deposit);
        self.protocol_fee_bps().set(protocol_fee_bps);
        self.reveal_window()
            .set(common::constants::DEFAULT_REVEAL_WINDOW_SECONDS);
        self.commit_bond().set(BigUint::zero());
        self.task_nonce().set(0u64);
        self.paused().set(false);
        self.executing_guard().set(false);
        self.version().set(1u32);
        self.max_reward_per_exec().set(BigUint::from(common::constants::DEFAULT_MAX_REWARD_PER_EXEC));
    }

    /// Safe upgrade — preserves storage, bumps version.
    #[upgrade]
    fn upgrade(&self) {
        self.version().set(self.version().get() + 1);
    }

    // ── Circuit Breaker ─────────────────────────────────────

    #[only_owner]
    #[endpoint(pause)]
    fn pause(&self) {
        self.paused().set(true);
    }

    #[only_owner]
    #[endpoint(unpause)]
    fn unpause(&self) {
        self.paused().set(false);
    }

    fn require_not_paused(&self) {
        require!(!self.paused().get(), "Contract is paused");
    }

    // ═══════════════════════════════════════════════════════════
    //  TASK SCHEDULING
    // ═══════════════════════════════════════════════════════════

    /// Schedule a new automation task.
    ///
    /// Payment: EGLD deposit covering gas budget + protocol fee.
    #[payable("EGLD")]
    #[endpoint(scheduleTask)]
    fn schedule_task(
        &self,
        target_contract: ManagedAddress,
        target_endpoint: ManagedBuffer,
        target_args: ManagedVec<ManagedBuffer>,
        trigger: common::types::Trigger<Self::Api>,
        max_gas: u64,
        max_retries: u8,
        ttl_seconds: u64,
    ) -> u64 {
        self.require_not_paused();
        let deposit = self.call_value().egld_value().clone_value();

        // Checks
        require!(deposit >= self.min_deposit().get(), "Deposit below minimum");
        require!(max_gas >= common::constants::MIN_GAS_LIMIT, "max_gas too low");
        require!(ttl_seconds >= common::constants::MIN_TTL_SECONDS, "TTL too short");

        // S-1: Full target safety validation (blocks self, registry, rewards, blacklist, dangerous endpoints)
        self.require_safe_target(&target_contract, &target_endpoint);

        // S-8: Deposit cap — prevents catastrophic loss from a single exploited task
        self.require_deposit_within_cap(&deposit);

        // S-9: Rate limiting — max 100 active tasks per address
        let caller = self.blockchain().get_caller();
        let caller_active = self.owner_tasks(&caller).len();
        require!(caller_active < 100, "S-9: Too many active tasks (max 100)");

        // Effects
        let task_id = self.task_nonce().get() + 1;
        self.task_nonce().set(task_id);

        let current_time = self.blockchain().get_block_timestamp();

        let task = common::types::Task {
            id: task_id,
            owner: self.blockchain().get_caller(),
            target_contract,
            target_endpoint,
            target_args,
            trigger: trigger.clone(),
            max_gas,
            deposit,
            max_retries,
            retry_count: 0,
            ttl_seconds,
            created_at: current_time,
            status: common::types::TaskStatus::Pending,
            assigned_keeper: None,
            completed_at: 0,
        };

        self.tasks(task_id).set(&task);
        self.owner_tasks(&task.owner).insert(task_id);

        // Index for keeper discovery
        self.index_task(task_id, &trigger);

        // Emit event
        self.task_scheduled_event(task_id, &task.owner, &task.target_contract, current_time);
        task_id
    }

    /// Cancel a pending task and refund the deposit to the owner.
    #[endpoint(cancelTask)]
    fn cancel_task(&self, task_id: u64) {
        self.require_not_paused();
        let mut task = self.tasks(task_id).get();
        let caller = self.blockchain().get_caller();

        // Checks
        require!(task.owner == caller, "Not task owner");
        require!(task.status == common::types::TaskStatus::Pending, "Can only cancel Pending tasks");

        // Effects
        task.status = common::types::TaskStatus::Cancelled;
        self.tasks(task_id).set(&task);
        self.remove_from_indices(task_id, &task);
        self.owner_tasks(&caller).swap_remove(&task_id);

        // Interactions
        self.send().direct_egld(&caller, &task.deposit);

        self.task_cancelled_event(task_id);
    }

    /// Set metadata for a task (hybrid oracle conditions).
    ///
    /// The metadata is a JSON-encoded buffer evaluated off-chain by the keeper.
    /// Example: `{"price":{"token":"EGLD","condition":"above","threshold":50}}`
    /// Only the task owner can set metadata, and only on Pending tasks.
    #[endpoint(setTaskMetadata)]
    fn set_task_metadata(&self, task_id: u64, metadata: ManagedBuffer) {
        let task = self.tasks(task_id).get();
        let caller = self.blockchain().get_caller();

        require!(task.owner == caller, "Not task owner");
        require!(task.status == common::types::TaskStatus::Pending, "Can only set metadata on Pending tasks");
        require!(metadata.len() <= 512, "Metadata too large (max 512 bytes)");

        self.task_metadata(task_id).set(&metadata);
    }

    // ═══════════════════════════════════════════════════════════
    //  TASK EXECUTION (Phase 1 — Direct, no commit-reveal)
    // ═══════════════════════════════════════════════════════════

    /// Execute a ripe task. Keeper triggers execution, payment via async callback.
    ///
    /// Flow: keeper calls executeTask → target contract called async →
    /// execution_callback confirms result → keeper paid on success OR
    /// user refunded on failure.
    #[endpoint(executeTask)]
    fn execute_task(&self, task_id: u64) {
        self.require_not_paused();

        // H-2: Reentrancy guard
        require!(!self.executing_guard().get(), "Reentrancy blocked");
        self.executing_guard().set(true);

        let task = self.tasks(task_id).get();
        let keeper = self.blockchain().get_caller();

        // Checks
        require!(task.status == common::types::TaskStatus::Pending, "Task not Pending");
        self.require_registered_keeper(&keeper);
        self.require_task_ripe(task_id, &task);

        // S-1: Verify target is still safe (could have been blacklisted after scheduling)
        self.require_safe_target(&task.target_contract, &task.target_endpoint);

        // Round-robin assignment: fair task distribution among keepers
        let keeper_count = self.keeper_list().len();
        if keeper_count > 1 {
            let assigned_index = ((task_id - 1) % keeper_count as u64) as usize + 1;
            let assigned_keeper = self.keeper_list().get(assigned_index);

            if keeper != assigned_keeper {
                let ripe_time = match &task.trigger {
                    common::types::Trigger::TimeOnce { target_time } => *target_time,
                    common::types::Trigger::TimeRecurring { start_time, .. } => *start_time,
                    _ => self.blockchain().get_block_timestamp(),
                };
                let current_time = self.blockchain().get_block_timestamp();
                require!(
                    current_time >= ripe_time + common::constants::ROUND_ROBIN_GRACE_SECONDS,
                    "Task assigned to another keeper — wait 30s grace period"
                );
            }
        }

        // C-3: Validate gas budget with cross-shard awareness
        let callback_gas = common::constants::CALLBACK_GAS_RESERVE;

        // S-10: Cross-shard gas adjustment — add 30% buffer for cross-shard calls
        let target_shard = self.blockchain().get_shard_of_address(&task.target_contract);
        let self_shard = self.blockchain().get_shard_of_address(&self.blockchain().get_sc_address());
        let cross_shard_overhead = if target_shard != self_shard {
            task.max_gas * 30 / 100  // +30% gas for cross-shard latency
        } else {
            0u64
        };

        let min_gas_needed = task.max_gas + cross_shard_overhead + callback_gas + 10_000_000u64;
        require!(
            self.blockchain().get_gas_left() >= min_gas_needed,
            "Insufficient gas for full execution"
        );

        // CEI — Effects: mark as Executing (payment deferred to callback)
        let mut task = task;
        task.status = common::types::TaskStatus::Executing;
        task.assigned_keeper = Some(keeper.clone());
        self.tasks(task_id).set(&task);
        self.remove_from_indices(task_id, &task);

        // Build clean args for target call
        let mut clean_args = ManagedVec::new();
        for arg in task.target_args.into_iter() {
            if !arg.is_empty() {
                clean_args.push(arg);
            }
        }

        // Async call to target contract WITH callback
        // Payment to keeper happens ONLY in the callback if target succeeds
        self.tx()
            .to(&task.target_contract)
            .raw_call(task.target_endpoint.clone())
            .arguments_raw(clean_args.into())
            .gas(task.max_gas)
            .callback(self.callbacks().execution_callback(task_id, keeper))
            .gas_for_callback(callback_gas)
            .register_promise();

        // H-2: Release reentrancy guard
        self.executing_guard().set(false);
    }

    // ═══════════════════════════════════════════════════════════
    //  ASYNC CALLBACK — Execution result handler
    // ═══════════════════════════════════════════════════════════

    #[promises_callback]
    fn execution_callback(
        &self,
        task_id: u64,
        keeper: ManagedAddress,
        #[call_result] result: ManagedAsyncCallResult<MultiValueEncoded<ManagedBuffer>>,
    ) {
        let mut task = self.tasks(task_id).get();

        match result {
            ManagedAsyncCallResult::Ok(_) => {
                // ✅ Target executed successfully — pay keeper and protocol
                task.status = common::types::TaskStatus::Completed;
                task.completed_at = self.blockchain().get_block_timestamp();
                self.tasks(task_id).set(&task);

                // S-2: Record execution metrics
                self.total_successful_execs().update(|v| *v += 1);

                // S-6: Reset target failure count on success
                self.target_failure_count(&task.target_contract).set(0u64);

                let reward = self.calculate_keeper_reward(&task);
                let protocol_fee = self.calculate_protocol_fee(&task);

                // Pay keeper
                self.send().direct_egld(&keeper, &reward);

                // Calculate remaining deposit
                let total_spent = &reward + &protocol_fee;
                let remaining_deposit = if task.deposit > total_spent {
                    &task.deposit - &total_spent
                } else {
                    BigUint::zero()
                };

                // Handle recurring tasks
                if let common::types::Trigger::TimeRecurring {
                    interval,
                    remaining_execs,
                    ..
                } = &task.trigger
                {
                    let min_dep = self.min_deposit().get();
                    if *remaining_execs > 1 && remaining_deposit >= min_dep {
                        self.reschedule_recurring(&task, *interval, *remaining_execs - 1, remaining_deposit);
                    } else if remaining_deposit > BigUint::zero() {
                        self.send().direct_egld(&task.owner, &remaining_deposit);
                    }
                } else {
                    if remaining_deposit > BigUint::zero() {
                        self.send().direct_egld(&task.owner, &remaining_deposit);
                    }
                }

                // Send protocol fee to Rewards contract
                let rewards_addr = self.rewards_addr().get();
                if protocol_fee > BigUint::zero() {
                    self.tx()
                        .to(&rewards_addr)
                        .raw_call("receiveExecutionFee")
                        .argument(&keeper)
                        .argument(&task_id)
                        .egld(&protocol_fee)
                        .gas(5_000_000u64)
                        .transfer_execute();
                }

                self.task_executed_event(task_id, &keeper, true);
            }
            ManagedAsyncCallResult::Err(_) => {
                // ❌ Target execution failed — refund user, no keeper payment
                task.status = common::types::TaskStatus::Failed;
                task.completed_at = self.blockchain().get_block_timestamp();
                self.tasks(task_id).set(&task);

                // S-2: Record failure metrics
                self.total_failed_execs().update(|v| *v += 1);

                // S-6: Track per-target failure count for anomaly detection
                let failures = self.target_failure_count(&task.target_contract).get();
                let new_failures = failures + 1;
                self.target_failure_count(&task.target_contract).set(new_failures);

                // S-7: Auto-blacklist targets with >10 consecutive failures
                if new_failures >= 10 {
                    self.target_blacklist().insert(task.target_contract.clone());
                }

                // Refund entire deposit to task owner
                self.send().direct_egld(&task.owner, &task.deposit);

                self.task_executed_event(task_id, &keeper, false);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  STUCK TASK RECOVERY
    // ═══════════════════════════════════════════════════════════

    /// Recover tasks stuck in Executing state for over 24 hours.
    /// This can happen if the async callback fails due to insufficient gas.
    /// Only callable by owner. Refunds deposit to task owner.
    #[only_owner]
    #[endpoint(recoverStuckTask)]
    fn recover_stuck_task(&self, task_id: u64) {
        let mut task = self.tasks(task_id).get();
        require!(
            task.status == common::types::TaskStatus::Executing,
            "Task not in Executing state"
        );

        let current_time = self.blockchain().get_block_timestamp();
        let stuck_threshold = 24 * 60 * 60; // 24 hours
        require!(
            current_time > task.created_at + stuck_threshold,
            "Task not stuck yet (wait 24h)"
        );

        task.status = common::types::TaskStatus::Failed;
        self.tasks(task_id).set(&task);

        // Refund deposit to user
        self.send().direct_egld(&task.owner, &task.deposit);
        self.task_expired_event(task_id);
    }

    // ═══════════════════════════════════════════════════════════
    //  TIMEOUT HANDLING
    // ═══════════════════════════════════════════════════════════


    /// Mark tasks past their TTL as Expired and refund owners.
    /// H-1: Only keepers or owner can call. Capped at MAX_EXPIRE_BATCH.
    #[endpoint(expireStaleTasks)]
    fn expire_stale_tasks(&self, task_ids: MultiValueEncoded<u64>) {
        let caller = self.blockchain().get_caller();
        require!(
            self.whitelisted_keepers().contains(&caller)
                || caller == self.blockchain().get_owner_address(),
            "Not authorized to expire tasks"
        );

        let current_time = self.blockchain().get_block_timestamp();
        let mut processed: usize = 0;
        for task_id in task_ids {
            if processed >= common::constants::MAX_EXPIRE_BATCH {
                break;
            }
            let mut task = self.tasks(task_id).get();
            if task.status != common::types::TaskStatus::Pending {
                continue;
            }
            if current_time > task.created_at + task.ttl_seconds {
                task.status = common::types::TaskStatus::Expired;
                self.tasks(task_id).set(&task);
                self.remove_from_indices(task_id, &task);
                // M-4: Clean owner_tasks index on expiry
                self.owner_tasks(&task.owner).swap_remove(&task_id);
                self.send().direct_egld(&task.owner, &task.deposit);
                self.task_expired_event(task_id);
                processed += 1;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  COMMIT-REVEAL — Anti-MEV Protection (Phase 3)
    // ═══════════════════════════════════════════════════════════

    /// CR-1: Commit to execute a task (prevents frontrunning).
    /// Keeper submits hash(task_id, salt) + bond. Task moves to Committed status.
    /// The keeper has `reveal_window` seconds to reveal, or loses the bond.
    #[payable("EGLD")]
    #[endpoint(commitTask)]
    fn commit_task(&self, task_id: u64, commit_hash: ManagedByteArray<Self::Api, 32>) {
        self.require_not_paused();
        let keeper = self.blockchain().get_caller();
        self.require_registered_keeper(&keeper);

        let task = self.tasks(task_id).get();
        require!(task.status == common::types::TaskStatus::Pending, "Task not Pending");

        let bond = self.call_value().egld_value().clone_value();
        let min_bond = self.commit_bond().get();
        require!(bond >= min_bond, "Bond below minimum");

        let commit_info = common::types::CommitInfo {
            keeper: keeper.clone(),
            commit_hash,
            commit_timestamp: self.blockchain().get_block_timestamp(),
            bond,
        };

        self.commits(task_id).set(&commit_info);

        // Mark task as Committed
        let mut task = task;
        task.status = common::types::TaskStatus::Committed;
        task.assigned_keeper = Some(keeper);
        self.tasks(task_id).set(&task);
    }

    /// CR-2: Reveal commitment and execute the task.
    /// Keeper proves they committed by providing the salt that hashes to the stored commit.
    /// On valid reveal: bond is returned + task executes normally.
    /// On expired reveal: bond is slashed.
    #[endpoint(revealTask)]
    fn reveal_task(&self, task_id: u64, salt: ManagedBuffer) {
        self.require_not_paused();
        let keeper = self.blockchain().get_caller();

        let task = self.tasks(task_id).get();
        require!(task.status == common::types::TaskStatus::Committed, "Task not Committed");

        let commit_info = self.commits(task_id).get();
        require!(commit_info.keeper == keeper, "Not the committing keeper");

        // Check reveal window
        let current_time = self.blockchain().get_block_timestamp();
        let reveal_window = self.reveal_window().get();
        require!(
            current_time <= commit_info.commit_timestamp + reveal_window,
            "Reveal window expired — bond slashed"
        );

        // Verify hash: keccak256(task_id_bytes ++ salt) == commit_hash
        let mut data_to_hash = ManagedBuffer::new();
        data_to_hash.append(&ManagedBuffer::from(&task_id.to_be_bytes()[..]));
        data_to_hash.append(&salt);
        let computed_hash = self.crypto().keccak256(&data_to_hash);

        require!(
            computed_hash.as_managed_buffer() == commit_info.commit_hash.as_managed_buffer(),
            "Hash mismatch — invalid salt"
        );

        // Return bond to keeper
        self.send().direct_egld(&keeper, &commit_info.bond);

        // Move task back to Pending for normal execution
        let mut task = task;
        task.status = common::types::TaskStatus::Pending;
        self.tasks(task_id).set(&task);
        self.commits(task_id).clear();
    }

    /// CR-3: Slash expired commits (anyone can call).
    /// If a keeper committed but didn't reveal within the window, their bond is slashed.
    #[endpoint(slashExpiredCommit)]
    fn slash_expired_commit(&self, task_id: u64) {
        let commit_info = self.commits(task_id).get();
        let current_time = self.blockchain().get_block_timestamp();
        let reveal_window = self.reveal_window().get();

        require!(
            current_time > commit_info.commit_timestamp + reveal_window,
            "Reveal window not expired yet"
        );

        // Slash: send bond to protocol (rewards contract)
        let rewards_addr = self.rewards_addr().get();
        self.send().direct_egld(&rewards_addr, &commit_info.bond);

        // Reset task to Pending
        let mut task = self.tasks(task_id).get();
        task.status = common::types::TaskStatus::Pending;
        task.assigned_keeper = None;
        self.tasks(task_id).set(&task);
        self.commits(task_id).clear();
    }

    // ═══════════════════════════════════════════════════════════
    //  SECURITY ADMIN ENDPOINTS
    // ═══════════════════════════════════════════════════════════

    /// S-3: Blacklist a malicious target contract (owner only).
    #[only_owner]
    #[endpoint(blacklistTarget)]
    fn blacklist_target(&self, target: ManagedAddress) {
        self.target_blacklist().insert(target);
    }

    /// S-4: Remove a contract from the blacklist (owner only).
    #[only_owner]
    #[endpoint(removeBlacklist)]
    fn remove_blacklist(&self, target: ManagedAddress) {
        self.target_blacklist().swap_remove(&target);
    }

    /// S-5: Set maximum EGLD deposit per task (owner only).
    /// Set to 0 to disable the cap.
    #[only_owner]
    #[endpoint(setMaxExecValue)]
    fn set_max_exec_value(&self, max_value: BigUint) {
        self.max_exec_value_egld().set(&max_value);
    }

    /// S-10: Cache keeper shard for shard-aware task assignment (keeper calls this).
    #[endpoint(registerKeeperShard)]
    fn register_keeper_shard(&self) {
        let keeper = self.blockchain().get_caller();
        self.require_registered_keeper(&keeper);
        let shard = self.blockchain().get_shard_of_address(&keeper);
        self.keeper_shard(&keeper).set(shard);
    }

    /// View: get security metrics (success/failure/blacklist counts).
    #[view(getSecurityMetrics)]
    fn get_security_metrics(&self) -> MultiValue3<u64, u64, usize> {
        (
            self.total_successful_execs().get(),
            self.total_failed_execs().get(),
            self.target_blacklist().len(),
        ).into()
    }

    /// View: check if a target is blacklisted.
    #[view(isBlacklisted)]
    fn is_blacklisted(&self, target: ManagedAddress) -> bool {
        self.target_blacklist().contains(&target)
    }

    /// View: get target failure count.
    #[view(getTargetFailures)]
    fn get_target_failures(&self, target: ManagedAddress) -> u64 {
        self.target_failure_count(&target).get()
    }
}
