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
        self.reveal_window().set(common::constants::DEFAULT_REVEAL_WINDOW);
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
        ttl_rounds: u64,
    ) -> u64 {
        self.require_not_paused();
        let deposit = self.call_value().egld_value().clone_value();

        // Checks
        require!(deposit >= self.min_deposit().get(), "Deposit below minimum");
        require!(max_gas >= common::constants::MIN_GAS_LIMIT, "max_gas too low");
        require!(ttl_rounds >= common::constants::MIN_TTL_ROUNDS, "TTL too short");

        // C-2: Block targeting protocol contracts (prevents call injection)
        let sc_self = self.blockchain().get_sc_address();
        require!(target_contract != sc_self, "Cannot target self");
        require!(target_contract != self.keeper_registry_addr().get(), "Cannot target registry");
        require!(target_contract != self.rewards_addr().get(), "Cannot target rewards");

        // Effects
        let task_id = self.task_nonce().get() + 1;
        self.task_nonce().set(task_id);

        let current_round = self.blockchain().get_block_round();

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
            ttl_rounds,
            created_round: current_round,
            status: common::types::TaskStatus::Pending,
            assigned_keeper: None,
        };

        self.tasks(task_id).set(&task);
        self.owner_tasks(&task.owner).insert(task_id);

        // Index for keeper discovery
        self.index_task(task_id, &trigger);

        // Emit event
        self.task_scheduled_event(task_id, &task.owner, &task.target_contract, current_round);
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

    // ═══════════════════════════════════════════════════════════
    //  TASK EXECUTION (Phase 1 — Direct, no commit-reveal)
    // ═══════════════════════════════════════════════════════════

    /// Execute a ripe task. Phase 1: keeper calls directly (synchronous).
    ///
    /// **Phase 1 limitation:** Uses `transfer_execute` (fire-and-forget).
    /// The target contract call may fail silently after the keeper reward
    /// has been sent. Phase 2 will migrate to async calls with callbacks
    /// to confirm target execution before finalizing rewards.
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

        // C-3: Validate gas budget for all calls
        let min_gas_needed = 5_000_000u64 + 5_000_000u64 + task.max_gas + 5_000_000u64;
        require!(
            self.blockchain().get_gas_left() >= min_gas_needed,
            "Insufficient gas for full execution"
        );

        // CEI — Effects first
        // Phase 1: mark as Executing (fire-and-forget, no callback to confirm).
        // Phase 2+: async callback will transition to Completed or Failed.
        let mut task = task;
        task.status = common::types::TaskStatus::Executing;
        task.assigned_keeper = Some(keeper.clone());
        self.tasks(task_id).set(&task);
        self.remove_from_indices(task_id, &task);

        // Calculate reward
        let reward = self.calculate_keeper_reward(&task);
        let protocol_fee = self.calculate_protocol_fee(&task);

        // Pay keeper directly
        self.send().direct_egld(&keeper, &reward);

        // Calculate remaining deposit after keeper reward + protocol fee
        let total_spent = &reward + &protocol_fee;
        let remaining_deposit = if task.deposit > total_spent {
            &task.deposit - &total_spent
        } else {
            BigUint::zero()
        };

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

        // Record execution on KeeperRegistry
        let registry_addr = self.keeper_registry_addr().get();
        self.tx()
            .to(&registry_addr)
            .raw_call("recordExecution")
            .argument(&keeper)
            .argument(&true)
            .gas(5_000_000u64)
            .transfer_execute();

        // Call the target contract (fire-and-forget)
        // Phase 1: no callback. Phase 2+: use async call with callback.
        self.tx()
            .to(&task.target_contract)
            .raw_call(task.target_endpoint.clone())
            .arguments_raw(task.target_args.clone().into())
            .gas(task.max_gas)
            .transfer_execute();

        // ═══════════════════════════════════════════════════════════
        //  RECURRING TASK RESCHEDULING
        // ═══════════════════════════════════════════════════════════
        // Only reschedule if:
        //  1. Task is recurring with remaining executions
        //  2. Remaining deposit covers at least min_deposit
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
                // Not enough for another execution — refund remainder to owner
                self.send().direct_egld(&task.owner, &remaining_deposit);
            }
        } else {
            // Non-recurring: refund any remaining deposit to owner
            if remaining_deposit > BigUint::zero() {
                self.send().direct_egld(&task.owner, &remaining_deposit);
            }
        }

        self.task_executed_event(task_id, &keeper, true);

        // H-2: Release reentrancy guard
        self.executing_guard().set(false);
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

        let current_round = self.blockchain().get_block_round();
        let mut processed: usize = 0;
        for task_id in task_ids {
            if processed >= common::constants::MAX_EXPIRE_BATCH {
                break;
            }
            let mut task = self.tasks(task_id).get();
            if task.status != common::types::TaskStatus::Pending {
                continue;
            }
            if current_round > task.created_round + task.ttl_rounds {
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
