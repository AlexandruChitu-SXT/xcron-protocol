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
        let current_block = self.blockchain().get_block_nonce();
        let last_update = self.cached_last_update_block().get();
        let max_age = self.freshness_blocks().get();
        
        let freshness_ok = current_block.saturating_sub(last_update) <= max_age;
        let gate_open = self.cached_gate_open().get();
        let consensus_ok = self.cached_consensus_ok().get();
        
        let xwap = self.xwap_price().get();
        let prev = self.prev_xwap_price().get();
        let stability_permille: u64 = if prev == BigUint::zero() || xwap == BigUint::zero() {
            0u64
        } else {
            let diff = if xwap > prev { &xwap - &prev } else { &prev - &xwap };
            let half_prev = &prev / 2u64;
            let stability = (diff * 1000u64 + &half_prev) / &prev;
            stability.to_u64().unwrap_or(999u64)
        };

        let safe = gate_open && consensus_ok && freshness_ok;

        crate::storage::XwapSignals {
            gate_open,
            consensus_ok,
            freshness_ok,
            stability_permille,
            safe,
        }
    }

    /// True if all critical signals are green.
    #[view(isSafeToExecute)]
    fn is_safe_to_execute(&self) -> bool {
        let current_block = self.blockchain().get_block_nonce();
        let last_update = self.cached_last_update_block().get();
        let max_age = self.freshness_blocks().get();
        
        let freshness_ok = current_block.saturating_sub(last_update) <= max_age;
        if !freshness_ok {
            return false;
        }
        
        self.cached_gate_open().get() && self.cached_consensus_ok().get()
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

    /// Last update block nonce.
    #[view(getLastUpdateBlock)]
    fn get_last_update_block(&self) -> u64 {
        self.cached_last_update_block().get()
    }
}
