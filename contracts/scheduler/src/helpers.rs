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
    /// Keeper gets: deposit - protocol_fee (exact split, no rounding loss).
    fn calculate_keeper_reward(
        &self,
        task: &common::types::Task<Self::Api>,
    ) -> BigUint {
        let protocol_fee = self.calculate_protocol_fee(task);
        &task.deposit - &protocol_fee
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
            common::types::Trigger::TimeOnce { target_round } => {
                self.round_index(*target_round).insert(task_id);
            }
            common::types::Trigger::TimeRecurring { start_round, .. } => {
                self.round_index(*start_round).insert(task_id);
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
            common::types::Trigger::TimeOnce { target_round } => {
                self.round_index(*target_round).swap_remove(&task_id);
            }
            common::types::Trigger::TimeRecurring { start_round, .. } => {
                self.round_index(*start_round).swap_remove(&task_id);
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
                // Time-based: re-index at current round + 1
                let next_round = self.blockchain().get_block_round() + 1;
                self.round_index(next_round).insert(task_id);
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
        let next_round = self.blockchain().get_block_round() + interval;
        let new_id = self.task_nonce().get() + 1;
        self.task_nonce().set(new_id);

        let new_task = common::types::Task {
            id: new_id,
            owner: original_task.owner.clone(),
            target_contract: original_task.target_contract.clone(),
            target_endpoint: original_task.target_endpoint.clone(),
            target_args: original_task.target_args.clone(),
            trigger: common::types::Trigger::TimeRecurring {
                start_round: next_round,
                interval,
                remaining_execs,
            },
            max_gas: original_task.max_gas,
            deposit: remaining_deposit,
            max_retries: original_task.max_retries,
            retry_count: 0,
            ttl_rounds: original_task.ttl_rounds,
            created_round: self.blockchain().get_block_round(),
            status: common::types::TaskStatus::Pending,
            assigned_keeper: None,
        };

        self.tasks(new_id).set(&new_task);
        self.round_index(next_round).insert(new_id);
        self.owner_tasks(&new_task.owner).insert(new_id);
    }
}
