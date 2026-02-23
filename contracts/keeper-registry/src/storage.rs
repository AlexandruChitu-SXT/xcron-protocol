multiversx_sc::imports!();

/// Storage mappers for the KeeperRegistry contract.
#[multiversx_sc::module]
pub trait StorageModule {
    #[storage_mapper("keepers")]
    fn keepers(&self, addr: &ManagedAddress) -> SingleValueMapper<common::types::KeeperInfo<Self::Api>>;

    #[storage_mapper("activeKeeperSet")]
    fn active_keeper_set(&self) -> UnorderedSetMapper<ManagedAddress>;

    #[storage_mapper("unstakeRequestTime")]
    fn unstake_request_time(&self, addr: &ManagedAddress) -> SingleValueMapper<u64>;

    #[storage_mapper("minStake")]
    fn min_stake(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("slashPctBps")]
    fn slash_pct_bps(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("cooldownSeconds")]
    fn cooldown_seconds(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("treasuryAddr")]
    fn treasury_addr(&self) -> SingleValueMapper<ManagedAddress>;

    /// Addresses authorized to call slashKeeper and recordExecution
    #[storage_mapper("authorizedCallers")]
    fn authorized_callers(&self) -> UnorderedSetMapper<ManagedAddress>;

    /// Circuit breaker.
    #[storage_mapper("paused")]
    fn paused(&self) -> SingleValueMapper<bool>;

    /// Contract version for safe upgrades.
    #[storage_mapper("version")]
    fn version(&self) -> SingleValueMapper<u32>;
}
