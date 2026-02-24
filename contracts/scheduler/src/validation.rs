multiversx_sc::imports!();

/// Validation logic for the Scheduler contract.
#[multiversx_sc::module]
pub trait ValidationModule: crate::storage::StorageModule {
    /// Verify a keeper is authorized to execute tasks.
    /// Phase 1: checks whitelist. Phase 2+: cross-shard call to KeeperRegistry.
    fn require_registered_keeper(&self, keeper: &ManagedAddress) {
        require!(
            self.whitelisted_keepers().contains(keeper),
            "Not authorized"
        );
    }

    /// Verify a task's trigger condition is met (task is "ripe").
    fn require_task_ripe(&self, _task_id: u64, task: &common::types::Task<Self::Api>) {
        let current_time = self.blockchain().get_block_timestamp();

        // H-3: TTL expiry check — prevent execution of stale tasks
        if task.ttl_seconds > 0 {
            require!(
                current_time <= task.created_at + task.ttl_seconds,
                "Task expired (TTL exceeded)"
            );
        }

        match &task.trigger {
            common::types::Trigger::TimeOnce { target_time } => {
                require!(current_time >= *target_time, "Task not yet ripe");
            }
            common::types::Trigger::TimeRecurring { start_time, .. } => {
                require!(current_time >= *start_time, "Task not yet ripe");
            }
            common::types::Trigger::ConditionOnChain {
                oracle_contract,
                query_endpoint,
                query_args,
                comparator,
                threshold,
            } => {
                // On-chain oracle: query the oracle contract (e.g. xExchange getAmountOut)
                // and verify the condition is met before allowing execution.
                let mut call: ContractCallNoPayment<Self::Api, BigUint<Self::Api>> =
                    ContractCallNoPayment::new(
                        oracle_contract.clone(),
                        query_endpoint.clone(),
                    );

                for arg in query_args.iter() {
                    call.push_raw_argument((*arg).clone());
                }

                let oracle_value: BigUint = call.execute_on_dest_context();

                let condition_met = match comparator {
                    common::types::Comparator::Gt => oracle_value > *threshold,
                    common::types::Comparator::Lt => oracle_value < *threshold,
                    common::types::Comparator::Eq => oracle_value == *threshold,
                    common::types::Comparator::Gte => oracle_value >= *threshold,
                    common::types::Comparator::Lte => oracle_value <= *threshold,
                };

                require!(condition_met, "Oracle condition not met");
            }
        }
    }
}
