multiversx_sc::imports!();

/// View functions for the Scheduler contract.
///
/// Views never panic — they return default/empty values instead.
#[multiversx_sc::module]
pub trait ViewsModule: crate::storage::StorageModule {
    /// Returns task data. Returns empty/default values if task does not exist.
    #[view(getTask)]
    fn get_task(&self, task_id: u64) -> OptionalValue<common::types::Task<Self::Api>> {
        if self.tasks(task_id).is_empty() {
            OptionalValue::None
        } else {
            OptionalValue::Some(self.tasks(task_id).get())
        }
    }

    #[view(getTaskNonce)]
    fn get_task_nonce(&self) -> u64 {
        self.task_nonce().get()
    }

    #[view(getPendingTasksForRound)]
    fn get_pending_tasks_for_round(&self, round: u64) -> MultiValueEncoded<u64> {
        let mut result = MultiValueEncoded::new();
        for task_id in self.round_index(round).iter() {
            result.push(task_id);
        }
        result
    }

    #[view(getConditionTasks)]
    fn get_condition_tasks(&self) -> MultiValueEncoded<u64> {
        let mut result = MultiValueEncoded::new();
        for task_id in self.condition_tasks().iter() {
            result.push(task_id);
        }
        result
    }

    #[view(getOwnerTasks)]
    fn get_owner_tasks(&self, owner: &ManagedAddress) -> MultiValueEncoded<u64> {
        let mut result = MultiValueEncoded::new();
        for task_id in self.owner_tasks(owner).iter() {
            result.push(task_id);
        }
        result
    }

    #[view(getMinDeposit)]
    fn get_min_deposit(&self) -> BigUint {
        self.min_deposit().get()
    }

    #[view(getProtocolFeeBps)]
    fn get_protocol_fee_bps(&self) -> u64 {
        self.protocol_fee_bps().get()
    }
}
