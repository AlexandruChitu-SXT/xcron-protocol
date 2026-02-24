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

        // C-2: Block targeting protocol contracts (prevents call injection)
        let sc_self = self.blockchain().get_sc_address();
        require!(target_contract != sc_self, "Cannot target self");
        require!(target_contract != self.keeper_registry_addr().get(), "Cannot target registry");
        require!(target_contract != self.rewards_addr().get(), "Cannot target rewards");

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

        // C-3: Validate gas budget
        let callback_gas = common::constants::CALLBACK_GAS_RESERVE;
        let min_gas_needed = task.max_gas + callback_gas + 10_000_000u64;
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
                self.tasks(task_id).set(&task);

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
                self.tasks(task_id).set(&task);

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
}
