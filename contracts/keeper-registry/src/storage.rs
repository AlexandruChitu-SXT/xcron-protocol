multiversx_sc::imports!();

/// Storage mappers for the KeeperRegistry contract.
#[multiversx_sc::module]
pub trait StorageModule {
    #[storage_mapper("keepers")]
    fn keepers(&self, addr: &ManagedAddress) -> SingleValueMapper<common::types::KeeperInfo<Self::Api>>;

    #[storage_mapper("activeKeeperSet")]
    fn active_keeper_set(&self) -> UnorderedSetMapper<ManagedAddress>;

    #[storage_mapper("unstakeRequestRound")]
    fn unstake_request_round(&self, addr: &ManagedAddress) -> SingleValueMapper<u64>;

    #[storage_mapper("minStake")]
    fn min_stake(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("slashPctBps")]
    fn slash_pct_bps(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("cooldownRounds")]
    fn cooldown_rounds(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("treasuryAddr")]
    fn treasury_addr(&self) -> SingleValueMapper<ManagedAddress>;

    /// Addresses authorized to call slashKeeper and recordExecution
    #[storage_mapper("authorizedCallers")]
    fn authorized_callers(&self) -> UnorderedSetMapper<ManagedAddress>;
}
