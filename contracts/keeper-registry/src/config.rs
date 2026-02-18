multiversx_sc::imports!();

/// Owner-only configuration endpoints for KeeperRegistry.
#[multiversx_sc::module]
pub trait ConfigModule: crate::storage::StorageModule {
    #[only_owner]
    #[endpoint(setMinStake)]
    fn set_min_stake(&self, value: BigUint) {
        self.min_stake().set(&value);
    }

    #[only_owner]
    #[endpoint(setSlashPctBps)]
    fn set_slash_pct_bps(&self, value: u64) {
        require!(
            value <= common::constants::BPS_DENOMINATOR,
            "Slash exceeds 100%"
        );
        self.slash_pct_bps().set(value);
    }

    #[only_owner]
    #[endpoint(setCooldownRounds)]
    fn set_cooldown_rounds(&self, value: u64) {
        self.cooldown_rounds().set(value);
    }

    #[only_owner]
    #[endpoint(setTreasuryAddr)]
    fn set_treasury_addr(&self, addr: ManagedAddress) {
        self.treasury_addr().set(&addr);
    }

    /// Add an address authorized to call slashKeeper/recordExecution.
    #[only_owner]
    #[endpoint(addAuthorizedCaller)]
    fn add_authorized_caller(&self, addr: ManagedAddress) {
        self.authorized_callers().insert(addr);
    }

    /// Remove an authorized caller.
    #[only_owner]
    #[endpoint(removeAuthorizedCaller)]
    fn remove_authorized_caller(&self, addr: ManagedAddress) {
        self.authorized_callers().swap_remove(&addr);
    }
}
