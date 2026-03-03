multiversx_sc::imports!();
multiversx_sc::derive_imports!();

/// A keeper's off-chain price report.
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, TypeAbi, Clone)]
pub struct KeeperReport<M: ManagedTypeApi> {
    /// Off-chain price scaled x1e18 (e.g. $15.00 = 15_000_000_000_000_000_000)
    pub price: BigUint<M>,
    /// Block number when the report was submitted
    pub block: u64,
}

/// Aggregated XWAP signal set returned by views.
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, TypeAbi, Clone)]
pub struct XwapSignals {
    /// Gate: pool spot vs off-chain median divergence < threshold
    pub gate_open: bool,
    /// Consensus: ≥ consensus_min keepers agree within 5%
    pub consensus_ok: bool,
    /// Freshness: latest keeper report is ≤ freshness_blocks old
    pub freshness_ok: bool,
    /// Stability: EWMA relative std-dev * 1000 (e.g. 5 = 0.5%)
    pub stability_permille: u64,
    /// All critical signals green → safe to execute
    pub safe: bool,
}

#[multiversx_sc::module]
pub trait StorageModule {
    // ─── EWMA State ────────────────────────────────────────────────────────

    #[storage_mapper("ewma_reserve_a")]
    fn ewma_reserve_a(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("ewma_reserve_b")]
    fn ewma_reserve_b(&self) -> SingleValueMapper<BigUint>;

    /// Derived XWAP price = ewma_b / ewma_a, scaled x1e18
    #[storage_mapper("xwap_price")]
    fn xwap_price(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("prev_xwap_price")]
    fn prev_xwap_price(&self) -> SingleValueMapper<BigUint>;

    /// Current alpha * 1000 (e.g. 50 = alpha 0.050, 700 = alpha 0.700)
    #[storage_mapper("alpha_x1000")]
    fn alpha_x1000(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("price_history")]
    fn price_history(&self, idx: u64) -> SingleValueMapper<BigUint>;

    #[storage_mapper("price_history_idx")]
    fn price_history_idx(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("update_count")]
    fn update_count(&self) -> SingleValueMapper<u64>;

    // ─── Keeper Reports ─────────────────────────────────────────────────────

    #[storage_mapper("keeper_report")]
    fn keeper_report(&self, keeper: &ManagedAddress) -> SingleValueMapper<KeeperReport<Self::Api>>;

    #[storage_mapper("registered_keepers")]
    fn registered_keepers(&self) -> UnorderedSetMapper<ManagedAddress>;

    // ─── Configuration ──────────────────────────────────────────────────────

    /// Gate divergence threshold * 1000 (default: 100 = 10%)
    #[storage_mapper("gate_threshold_permille")]
    fn gate_threshold_permille(&self) -> SingleValueMapper<u64>;

    /// Min alpha * 1000 (default: 50 = 0.05)
    #[storage_mapper("alpha_min_x1000")]
    fn alpha_min_x1000(&self) -> SingleValueMapper<u64>;

    /// Max alpha * 1000 (default: 700 = 0.70)
    #[storage_mapper("alpha_max_x1000")]
    fn alpha_max_x1000(&self) -> SingleValueMapper<u64>;

    /// Trend boost * 1000 (default: 250 = +0.25)
    #[storage_mapper("trend_boost_x1000")]
    fn trend_boost_x1000(&self) -> SingleValueMapper<u64>;

    /// Gate boost * 1000 (default: 250 = +0.25)
    #[storage_mapper("gate_boost_x1000")]
    fn gate_boost_x1000(&self) -> SingleValueMapper<u64>;

    /// Max age of keeper report in blocks (default: 2)
    #[storage_mapper("freshness_blocks")]
    fn freshness_blocks(&self) -> SingleValueMapper<u64>;

    /// Min fraction of keepers that must agree in permille (default: 800 = 80%)
    #[storage_mapper("consensus_min_permille")]
    fn consensus_min_permille(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("pool_address")]
    fn pool_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("owner_address")]
    fn owner_address(&self) -> SingleValueMapper<ManagedAddress>;
}
