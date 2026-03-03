multiversx_sc::imports!();

#[multiversx_sc::module]
pub trait ViewsModule:
    crate::storage::StorageModule
    + crate::events::EventsModule
    + crate::oracle::OracleModule
    + crate::keepers::KeepersModule
{
    /// Current XWAP price scaled x1e18.
    #[view(getXwapPrice)]
    fn get_xwap_price(&self) -> BigUint {
        self.xwap_price().get()
    }

    /// Human-readable XWAP price as integer USD (truncated, for display only).
    #[view(getXwapPriceInteger)]
    fn get_xwap_price_integer(&self) -> u64 {
        let price = self.xwap_price().get();
        let scale = BigUint::from(1_000_000_000_000_000_000u64);
        (price / scale).to_u64().unwrap_or(0)
    }

    /// Current alpha * 1000.
    #[view(getAlpha)]
    fn get_alpha_view(&self) -> u64 {
        self.alpha_x1000().get()
    }

    /// All four XWAP signals.
    #[view(getSignals)]
    fn get_signals(&self) -> crate::storage::XwapSignals {
        self.compute_signals()
    }

    /// True if all critical signals are green.
    #[view(isSafeToExecute)]
    fn is_safe_to_execute(&self) -> bool {
        self.compute_signals().safe
    }

    /// Current gate status: true = open (prices aligned).
    #[view(isGateOpen)]
    fn is_gate_open(&self) -> bool {
        self.check_gate_view()
    }

    /// Number of registered keepers.
    #[view(getKeeperCount)]
    fn get_keeper_count(&self) -> usize {
        self.registered_keepers().len()
    }

    /// Median off-chain price from all fresh keeper reports, scaled x1e18.
    #[view(getMedianOffChain)]
    fn get_median_off_chain_view(&self) -> BigUint {
        self.get_median_off_chain()
    }

    /// Gate threshold in permille (e.g. 100 = 10%).
    #[view(getGateThreshold)]
    fn get_gate_threshold_view(&self) -> u64 {
        self.gate_threshold_permille().get()
    }

    /// Alpha bounds: (min * 1000, max * 1000).
    #[view(getAlphaBounds)]
    fn get_alpha_bounds(&self) -> MultiValue2<u64, u64> {
        (self.alpha_min_x1000().get(), self.alpha_max_x1000().get()).into()
    }
}
