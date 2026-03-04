multiversx_sc::imports!();

/// View functions for the Scheduler contract.
///
/// Views never panic — they return default/empty values instead.
#[multiversx_sc::module]
pub trait ViewsModule: crate::storage::StorageModule {
    /// Returns task data if it exists, or None for unknown task IDs.
    /// Single storage read — avoids double-read from is_empty() + get().
    #[view(getTask)]
    fn get_task(&self, task_id: u64) -> OptionalValue<common::types::Task<Self::Api>> {
        let mapper = self.tasks(task_id);
        if mapper.is_empty() {
            OptionalValue::None
        } else {
            OptionalValue::Some(mapper.get())
        }
    }

    #[view(getTaskNonce)]
    fn get_task_nonce(&self) -> u64 {
        self.task_nonce().get()
    }

    #[view(getPendingTasksForTime)]
    fn get_pending_tasks_for_time(&self, timestamp: u64) -> MultiValueEncoded<u64> {
        let mut result = MultiValueEncoded::new();
        for task_id in self.time_index(timestamp).iter() {
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

    /// Returns the metadata JSON for a task (used by keeper for hybrid price conditions).
    #[view(getTaskMetadata)]
    fn get_task_metadata(&self, task_id: u64) -> ManagedBuffer {
        if self.task_metadata(task_id).is_empty() {
            ManagedBuffer::new()
        } else {
            self.task_metadata(task_id).get()
        }
    }

    /// Returns all whitelisted keeper addresses.
    #[view(getWhitelistedKeepers)]
    fn get_whitelisted_keepers(&self) -> MultiValueEncoded<ManagedAddress> {
        let mut result = MultiValueEncoded::new();
        for keeper in self.whitelisted_keepers().iter() {
            result.push(keeper);
        }
        result
    }

    /// Returns the ordered keeper list used for round-robin assignment.
    #[view(getKeeperList)]
    fn get_keeper_list(&self) -> MultiValueEncoded<ManagedAddress> {
        let mut result = MultiValueEncoded::new();
        let len = self.keeper_list().len();
        for i in 1..=len {
            result.push(self.keeper_list().get(i));
        }
        result
    }

    // ── Cross-shard optimization views ──────────────────────

    /// Returns pending task IDs whose target contract is in the given shard.
    /// Allows keepers to prioritize tasks in their own shard (0% gas overhead).
    #[view(getTasksForShard)]
    fn get_tasks_for_shard(&self, shard_id: u32) -> MultiValueEncoded<u64> {
        let mut result = MultiValueEncoded::new();
        for task_id in self.shard_task_index(shard_id).iter() {
            result.push(task_id);
        }
        result
    }

    /// Returns cross-shard vs intra-shard execution counts.
    /// Useful for protocol analytics and optimizer calibration.
    #[view(getCrossShardStats)]
    fn get_cross_shard_stats(&self) -> MultiValue2<u64, u64> {
        (
            self.cross_shard_execs().get(),
            self.intra_shard_execs().get(),
        )
            .into()
    }

    /// Returns the cached shard ID for a keeper address.
    #[view(getKeeperShard)]
    fn get_keeper_shard(&self, keeper: &ManagedAddress) -> u32 {
        self.keeper_shard(keeper).get()
    }
}
