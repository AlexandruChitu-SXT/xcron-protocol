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
        let current_round = self.blockchain().get_block_round();
        match &task.trigger {
            common::types::Trigger::TimeOnce { target_round } => {
                require!(current_round >= *target_round, "Task not yet ripe");
            }
            common::types::Trigger::TimeRecurring { start_round, .. } => {
                require!(current_round >= *start_round, "Task not yet ripe");
            }
            common::types::Trigger::ConditionOnChain { .. } => {
                // Phase 2+: condition evaluation delegated to keeper
            }
        }
    }
}
