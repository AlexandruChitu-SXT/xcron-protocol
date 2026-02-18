multiversx_sc::imports!();

/// Owner-only configuration endpoints for Rewards.
#[multiversx_sc::module]
pub trait ConfigModule: crate::storage::StorageModule {
    #[only_owner]
    #[endpoint(setTreasurySplitBps)]
    fn set_treasury_split_bps(&self, value: u64) {
        require!(
            value <= common::constants::BPS_DENOMINATOR,
            "Split exceeds 100%"
        );
        self.treasury_split_bps().set(value);
    }

    #[only_owner]
    #[endpoint(setKeeperRegistryAddr)]
    fn set_keeper_registry_addr(&self, addr: ManagedAddress) {
        self.keeper_registry_addr().set(&addr);
    }

    /// Add a Scheduler address authorized to call receiveExecutionFee.
    #[only_owner]
    #[endpoint(addAuthorizedScheduler)]
    fn add_authorized_scheduler(&self, addr: ManagedAddress) {
        self.authorized_schedulers().insert(addr);
    }

    /// Remove an authorized Scheduler.
    #[only_owner]
    #[endpoint(removeAuthorizedScheduler)]
    fn remove_authorized_scheduler(&self, addr: ManagedAddress) {
        self.authorized_schedulers().swap_remove(&addr);
    }
}
