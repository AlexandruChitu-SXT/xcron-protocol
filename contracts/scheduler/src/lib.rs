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
    }

    #[upgrade]
    fn upgrade(&self) {}

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
        let deposit = self.call_value().egld_value().clone_value();

        // Checks
        require!(deposit >= self.min_deposit().get(), "Deposit below minimum");
        require!(max_gas >= common::constants::MIN_GAS_LIMIT, "max_gas too low");
        require!(ttl_rounds >= common::constants::MIN_TTL_ROUNDS, "TTL too short");

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

    /// Execute a ripe task. Phase 1: keeper calls directly (no commit-reveal).
    #[endpoint(executeTask)]
    fn execute_task(&self, task_id: u64) {
        let task = self.tasks(task_id).get();
        let caller = self.blockchain().get_caller();

        // Checks
        require!(task.status == common::types::TaskStatus::Pending, "Task not Pending");
        self.require_registered_keeper(&caller);
        self.require_task_ripe(task_id, &task);

        // Effects — update status BEFORE external call (CEI pattern)
        let mut task = task;
        task.status = common::types::TaskStatus::Executing;
        task.assigned_keeper = Some(caller.clone());
        self.tasks(task_id).set(&task);

        // Interactions — async call to target contract
        let gas_for_callback = common::constants::CALLBACK_GAS_RESERVE;
        let gas_for_execution = task.max_gas;

        self.tx()
            .to(&task.target_contract)
            .raw_call(task.target_endpoint.clone())
            .arguments_raw(task.target_args.clone().into())
            .gas(gas_for_execution)
            .callback(
                self.callbacks()
                    .execution_callback(task_id, caller),
            )
            .gas_for_callback(gas_for_callback)
            .register_promise();
    }

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
                // Effects
                task.status = common::types::TaskStatus::Completed;
                self.tasks(task_id).set(&task);
                self.remove_from_indices(task_id, &task);

                // Calculate reward
                let reward = self.calculate_keeper_reward(&task);
                let protocol_fee = self.calculate_protocol_fee(&task);

                // Interactions — pay keeper directly
                self.send().direct_egld(&keeper, &reward);

                // Send protocol fee to Rewards contract via receiveExecutionFee
                // so it properly tracks per-keeper pending rewards
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

                // Record execution success on KeeperRegistry for reputation
                let registry_addr = self.keeper_registry_addr().get();
                self.tx()
                    .to(&registry_addr)
                    .raw_call("recordExecution")
                    .argument(&keeper)
                    .argument(&true)
                    .gas(5_000_000u64)
                    .transfer_execute();

                // Handle recurring tasks — reschedule next occurrence
                if let common::types::Trigger::TimeRecurring {
                    interval,
                    remaining_execs,
                    ..
                } = &task.trigger
                {
                    if *remaining_execs > 1 {
                        // Refund remaining deposit to the new recurring task
                        let total_spent = &reward + &protocol_fee;
                        let remaining_deposit = if task.deposit > total_spent {
                            &task.deposit - &total_spent
                        } else {
                            BigUint::zero()
                        };
                        // Create a temporary task with updated deposit for rescheduling
                        let mut recurring_task = task.clone();
                        recurring_task.deposit = remaining_deposit;
                        self.reschedule_recurring(
                            &recurring_task,
                            *interval,
                            *remaining_execs - 1,
                        );
                    } else {
                        // Last execution — refund remaining deposit to owner
                        let total_spent = &reward + &protocol_fee;
                        if task.deposit > total_spent {
                            let refund = &task.deposit - &total_spent;
                            self.send().direct_egld(&task.owner, &refund);
                        }
                    }
                } else {
                    // One-time task — refund remaining deposit to owner
                    let total_spent = &reward + &protocol_fee;
                    if task.deposit > total_spent {
                        let refund = &task.deposit - &total_spent;
                        self.send().direct_egld(&task.owner, &refund);
                    }
                }

                self.task_executed_event(task_id, &keeper, true);
            }
            ManagedAsyncCallResult::Err(_) => {
                task.retry_count += 1;
                if task.retry_count >= task.max_retries {
                    task.status = common::types::TaskStatus::Failed;
                    self.tasks(task_id).set(&task);
                    self.remove_from_indices(task_id, &task);
                    self.send().direct_egld(&task.owner, &task.deposit);
                } else {
                    task.status = common::types::TaskStatus::Pending;
                    task.assigned_keeper = None;
                    self.tasks(task_id).set(&task);
                    self.reindex_task(task_id, &task);
                }

                // Record execution failure on KeeperRegistry for reputation
                let registry_addr = self.keeper_registry_addr().get();
                self.tx()
                    .to(&registry_addr)
                    .raw_call("recordExecution")
                    .argument(&keeper)
                    .argument(&false)
                    .gas(5_000_000u64)
                    .transfer_execute();

                self.task_executed_event(task_id, &keeper, false);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  TIMEOUT HANDLING
    // ═══════════════════════════════════════════════════════════

    /// Mark tasks past their TTL as Expired and refund owners.
    #[endpoint(expireStaleTasks)]
    fn expire_stale_tasks(&self, task_ids: MultiValueEncoded<u64>) {
        let current_round = self.blockchain().get_block_round();
        for task_id in task_ids {
            let mut task = self.tasks(task_id).get();
            if task.status != common::types::TaskStatus::Pending {
                continue;
            }
            if current_round > task.created_round + task.ttl_rounds {
                task.status = common::types::TaskStatus::Expired;
                self.tasks(task_id).set(&task);
                self.remove_from_indices(task_id, &task);
                self.send().direct_egld(&task.owner, &task.deposit);
                self.task_expired_event(task_id);
            }
        }
    }
}
