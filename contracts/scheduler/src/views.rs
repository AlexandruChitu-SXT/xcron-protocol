multiversx_sc::imports!();

/// View functions for the Scheduler contract.
///
/// Views never panic — they return default/empty values instead.
#[multiversx_sc::module]
pub trait ViewsModule: crate::storage::StorageModule {
    #[view(getTaskNonce)]
    fn get_task_nonce(&self) -> u64 {
        self.task_nonce().get()
    }

    #[view(getOwnerTasksQuantum)]
    fn get_owner_tasks_quantum(&self, owner: &ManagedAddress) -> MultiValueEncoded<ManagedByteArray<Self::Api, 32>> {
        let mut result = MultiValueEncoded::new();
        for task_hash in self.owner_tasks(owner).iter() {
            result.push(task_hash);
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
