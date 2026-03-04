multiversx_sc::imports!();

/// Internal helper functions for the Scheduler contract.
///
/// Contains reward calculations, index management, and task rescheduling.
#[multiversx_sc::module]
pub trait HelpersModule: crate::storage::StorageModule {
    /// Calculate keeper reward for a successful execution.
    ///
    /// Keeper gets: min(deposit - protocol_fee, max_reward_per_exec).
    /// Excess is refunded to the task owner via remaining_deposit.
    fn calculate_keeper_reward(&self, task: &common::types::Task<Self::Api>) -> BigUint {
        let protocol_fee = self.calculate_protocol_fee(task);
        let uncapped_reward = &task.deposit - &protocol_fee;

        let max_reward = self.max_reward_per_exec().get();
        if max_reward > BigUint::zero() && uncapped_reward > max_reward {
            max_reward
        } else {
            uncapped_reward
        }
    }

    /// Calculate protocol fee for a single execution.
    ///
    /// For recurring tasks: fee is based on deposit/remaining_execs (per-execution share).
    /// For one-time tasks: fee is based on the full deposit.
    /// Formula: per_exec_deposit × protocol_fee_bps / BPS_DENOMINATOR
    fn calculate_protocol_fee(&self, task: &common::types::Task<Self::Api>) -> BigUint {
        let fee_bps = self.protocol_fee_bps().get();

        // For recurring tasks, calculate fee on per-execution deposit
        let per_exec_deposit = match &task.trigger {
            common::types::Trigger::TimeRecurring {
                remaining_execs, ..
            } => {
                if *remaining_execs > 0 {
                    &task.deposit / *remaining_execs
                } else {
                    task.deposit.clone()
                }
            }
            _ => task.deposit.clone(),
        };

        &per_exec_deposit * fee_bps / common::constants::BPS_DENOMINATOR
    }

    /// Index a task for keeper discovery based on its trigger type.
    /// Also indexes by target shard for shard-aware keeper routing.
    fn index_task(&self, task_id: u64, trigger: &common::types::Trigger<Self::Api>) {
        match trigger {
            common::types::Trigger::TimeOnce { target_time } => {
                self.time_index(*target_time).insert(task_id);
            }
            common::types::Trigger::TimeRecurring { start_time, .. } => {
                self.time_index(*start_time).insert(task_id);
            }
            common::types::Trigger::ConditionOnChain { .. } => {
                self.condition_tasks().insert(task_id);
            }
        }

        // Cross-shard optimization: Index task by target shard
        let task = self.tasks(task_id).get();
        let target_shard = self
            .blockchain()
            .get_shard_of_address(&task.target_contract);
        self.shard_task_index(target_shard).insert(task_id);
    }

    /// Remove a task from all discovery indices (time, condition, shard).
    fn remove_from_indices(&self, task_id: u64, task: &common::types::Task<Self::Api>) {
        match &task.trigger {
            common::types::Trigger::TimeOnce { target_time } => {
                self.time_index(*target_time).swap_remove(&task_id);
            }
            common::types::Trigger::TimeRecurring { start_time, .. } => {
                self.time_index(*start_time).swap_remove(&task_id);
            }
            common::types::Trigger::ConditionOnChain { .. } => {
                self.condition_tasks().swap_remove(&task_id);
            }
        }

        // Cross-shard optimization: Remove from shard index
        let target_shard = self
            .blockchain()
            .get_shard_of_address(&task.target_contract);
        self.shard_task_index(target_shard).swap_remove(&task_id);
    }

    /// Re-index a task for retry pickup.
    fn reindex_task(&self, task_id: u64, task: &common::types::Task<Self::Api>) {
        match &task.trigger {
            common::types::Trigger::ConditionOnChain { .. } => {
                self.condition_tasks().insert(task_id);
            }
            _ => {
                // Time-based: re-index at current time + 10s (grace period for retry)
                let next_time = self
                    .blockchain()
                    .get_block_timestamp_seconds()
                    .as_u64_seconds()
                    + 10;
                self.time_index(next_time).insert(task_id);
            }
        }
    }

    /// Reschedule the next occurrence of a recurring task.
    ///
    /// Uses the actual remaining deposit (after keeper reward + protocol fee),
    /// NOT the original deposit which has already been distributed.
    fn reschedule_recurring(
        &self,
        original_task: &common::types::Task<Self::Api>,
        interval: u64,
        remaining_execs: u64,
        remaining_deposit: BigUint,
    ) {
        let next_time = self
            .blockchain()
            .get_block_timestamp_seconds()
            .as_u64_seconds()
            + interval;
        let new_id = self.task_nonce().get() + 1;
        self.task_nonce().set(new_id);

        let new_task = common::types::Task {
            id: new_id,
            owner: original_task.owner.clone(),
            target_contract: original_task.target_contract.clone(),
            target_endpoint: original_task.target_endpoint.clone(),
            target_args: original_task.target_args.clone(),
            trigger: common::types::Trigger::TimeRecurring {
                start_time: next_time,
                interval,
                remaining_execs,
            },
            max_gas: original_task.max_gas,
            deposit: remaining_deposit,
            max_retries: original_task.max_retries,
            retry_count: 0,
            ttl_seconds: original_task.ttl_seconds,
            created_at: self
                .blockchain()
                .get_block_timestamp_seconds()
                .as_u64_seconds(),
            status: common::types::TaskStatus::Pending,
            assigned_keeper: None,
            completed_at: 0,
            post_task_id: None,
            require_xwap_safe: original_task.require_xwap_safe,
            confidential: original_task.confidential,
        };

        self.tasks(new_id).set(&new_task);
        self.time_index(next_time).insert(new_id);
        self.owner_tasks(&new_task.owner).insert(new_id);
    }

    // ── Cross-contract call helpers ─────────────────────────

    /// M-3 Fix: Accumulate protocol fee instead of transfer_execute.
    ///
    /// Inside `#[promises_callback]`, `.transfer_execute()` sends EGLD
    /// but does NOT invoke the target endpoint — the `receiveExecutionFee`
    /// function never runs, so fees aren't tracked in the Rewards contract.
    ///
    /// Solution: accumulate fees in `accrued_protocol_fees` storage mapper.
    /// Owner/keeper can call `flushProtocolFees` to bulk-send them to the
    /// Rewards contract outside of a callback context.
    fn forward_protocol_fee(
        &self,
        _keeper: &ManagedAddress,
        _task_id: u64,
        protocol_fee: &BigUint,
    ) {
        if protocol_fee > &BigUint::zero() {
            self.accrued_protocol_fees()
                .update(|total| *total += protocol_fee);
        }
    }

    /// P5: Notify KeeperRegistry of execution result for reputation tracking.
    ///
    /// Enables progressive slashing: keepers with consecutive failures get
    /// penalized (Strike 1: 5%, Strike 2: 15%, Strike 3: 20% + expulsion).
    /// Fire-and-forget — this runs inside the callback so no further callback is possible.
    fn forward_keeper_result(&self, keeper: &ManagedAddress, success: bool) {
        let registry_addr = self.keeper_registry_addr().get();
        self.tx()
            .to(&registry_addr)
            .raw_call("recordExecution")
            .argument(keeper)
            .argument(&success)
            .gas(5_000_000u64)
            .transfer_execute();
    }
}
