multiversx_sc::imports!();

/// Events emitted by the KeeperRegistry contract.
#[multiversx_sc::module]
pub trait EventsModule {
    #[event("keeperRegistered")]
    fn keeper_registered_event(&self, #[indexed] keeper: &ManagedAddress);

    #[event("keeperUnregistered")]
    fn keeper_unregistered_event(&self, #[indexed] keeper: &ManagedAddress);

    #[event("keeperSlashed")]
    fn keeper_slashed_event(
        &self,
        #[indexed] keeper: &ManagedAddress,
        #[indexed] amount: &BigUint,
        reason: &ManagedBuffer,
    );
}
