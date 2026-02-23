multiversx_sc::imports!();

/// Internal helper functions for the Scheduler contract.
///
/// Contains reward calculations, index management, and task rescheduling.
#[multiversx_sc::module]
pub trait HelpersModule: crate::storage::StorageModule {
    /// Determine the applicable protocol fee BPS based on deposit size (progressive tiers).
    ///
    /// Tier 1: deposit ≤ 5 EGLD  → 15% (1,500 BPS)
    /// Tier 2: 5 < deposit ≤ 25 EGLD → 12% (1,200 BPS)
    /// Tier 3: deposit > 25 EGLD → 10% (1,000 BPS)
    fn get_tiered_fee_bps(&self, deposit: &BigUint) -> u64 {
        let decimals = BigUint::from(common::constants::EGLD_DECIMALS);
        let tier1 = BigUint::from(common::constants::TIER1_EGLD) * &decimals;
        let tier2 = BigUint::from(common::constants::TIER2_EGLD) * &decimals;

        if *deposit <= tier1 {
            common::constants::TIER1_FEE_BPS
        } else if *deposit <= tier2 {
            common::constants::TIER2_FEE_BPS
        } else {
            common::constants::TIER3_FEE_BPS
        }
    }

    /// Calculate keeper reward for a successful execution.
    ///
    /// Keeper gets: min(deposit - protocol_fee, max_reward_per_exec).
    /// This prevents disproportionate rewards on large deposits.
    /// Excess is refunded to the task owner via remaining_deposit.
    fn calculate_keeper_reward(
        &self,
        task: &common::types::Task<Self::Api>,
    ) -> BigUint {
        let protocol_fee = self.calculate_protocol_fee(task);
        let uncapped_reward = &task.deposit - &protocol_fee;

        let max_reward = self.max_reward_per_exec().get();
        if max_reward > BigUint::zero() && uncapped_reward > max_reward {
            max_reward
        } else {
            uncapped_reward
        }
    }

    /// Calculate protocol fee from task deposit using progressive tiers.
    ///
    /// Formula: deposit × tiered_fee_bps / BPS_DENOMINATOR
    fn calculate_protocol_fee(
        &self,
        task: &common::types::Task<Self::Api>,
    ) -> BigUint {
        let fee_bps = self.get_tiered_fee_bps(&task.deposit);
        &task.deposit * fee_bps / common::constants::BPS_DENOMINATOR
    }

    /// Index a task for keeper discovery based on its trigger type.
    fn index_task(
        &self,
        task_id: u64,
        trigger: &common::types::Trigger<Self::Api>,
    ) {
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
    }

    /// Remove a task from all discovery indices.
    fn remove_from_indices(
        &self,
        task_id: u64,
        task: &common::types::Task<Self::Api>,
    ) {
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
    }

    /// Re-index a task for retry pickup.
    fn reindex_task(
        &self,
        task_id: u64,
        task: &common::types::Task<Self::Api>,
    ) {
        match &task.trigger {
            common::types::Trigger::ConditionOnChain { .. } => {
                self.condition_tasks().insert(task_id);
            }
            _ => {
                // Time-based: re-index at current time + 10s (grace period for retry)
                let next_time = self.blockchain().get_block_timestamp() + 10;
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
        let next_time = self.blockchain().get_block_timestamp() + interval;
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
            created_at: self.blockchain().get_block_timestamp(),
            status: common::types::TaskStatus::Pending,
            assigned_keeper: None,
        };

        self.tasks(new_id).set(&new_task);
        self.time_index(next_time).insert(new_id);
        self.owner_tasks(&new_task.owner).insert(new_id);
    }
}
