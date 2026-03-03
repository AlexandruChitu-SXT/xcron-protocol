multiversx_sc::imports!();

#[multiversx_sc::module]
pub trait EventsModule {
    #[event("price_updated")]
    fn price_updated_event(
        &self,
        #[indexed] xwap_price: &BigUint,
        #[indexed] alpha_x1000: u64,
        #[indexed] gate_open: bool,
        block: u64,
    );

    #[event("gate_closed")]
    fn gate_closed_event(
        &self,
        #[indexed] pool_spot_x1e18: &BigUint,
        #[indexed] median_off_chain_x1e18: &BigUint,
        #[indexed] divergence_permille: u64,
    );

    #[event("keeper_reported")]
    fn keeper_reported_event(
        &self,
        #[indexed] keeper: &ManagedAddress,
        #[indexed] price_x1e18: &BigUint,
        block: u64,
    );

    #[event("keeper_registry_updated")]
    fn keeper_registry_updated_event(
        &self,
        #[indexed] keeper: &ManagedAddress,
        registered: bool,
    );
}
