multiversx_sc::imports!();

/// Storage mappers for the Rewards contract.
#[multiversx_sc::module]
pub trait StorageModule {
    #[storage_mapper("keeperRegistryAddr")]
    fn keeper_registry_addr(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("treasurySplitBps")]
    fn treasury_split_bps(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("pendingRewards")]
    fn pending_rewards(&self, keeper: &ManagedAddress) -> SingleValueMapper<BigUint>;

    #[storage_mapper("treasuryBalance")]
    fn treasury_balance(&self) -> SingleValueMapper<BigUint>;

    /// Addresses authorized to call receiveExecutionFee (Scheduler contracts)
    #[storage_mapper("authorizedSchedulers")]
    fn authorized_schedulers(&self) -> UnorderedSetMapper<ManagedAddress>;

    // NOTE: `paused` storage mapper is provided by common::pausable::PausableModule

    /// Contract version for safe upgrades.
    #[storage_mapper("version")]
    fn version(&self) -> SingleValueMapper<u32>;
}
