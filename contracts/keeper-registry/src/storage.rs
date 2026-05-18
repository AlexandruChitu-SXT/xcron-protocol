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

    // NOTE: `paused` storage mapper is provided by common::pausable::PausableModule

    /// Contract version for safe upgrades.
    #[storage_mapper("version")]
    fn version(&self) -> SingleValueMapper<u32>;

    // ── Staking V5 Mappers ─────────────────────────────────────

    /// The address of the Staking Provider (Validator) where EGLD is delegated.
    #[storage_mapper("stakingProviderAddr")]
    fn staking_provider_addr(&self) -> SingleValueMapper<ManagedAddress>;

    /// Total yield generated from delegated stakes.
    #[storage_mapper("totalYieldGenerated")]
    fn total_yield_generated(&self) -> SingleValueMapper<BigUint>;

    /// Slashing debt: EGLD that was slashed but is currently unbonding from a provider.
    /// Will be seized by the protocol once unbonding is complete.
    #[storage_mapper("slashedPendingUnbond")]
    fn slashed_pending_unbond(&self, addr: &ManagedAddress) -> SingleValueMapper<BigUint>;

    /// 🛡️ V3/V5: Total EGLD committed to keepers currently in unstake cooldown.
    /// Maintained atomically by requestUnstake (+) and withdrawStake (-).
    /// delegateStake reads this to prevent over-delegation.
    #[storage_mapper("totalCommittedCooldownEgld")]
    fn total_committed_cooldown_egld(&self) -> SingleValueMapper<BigUint>;
}
