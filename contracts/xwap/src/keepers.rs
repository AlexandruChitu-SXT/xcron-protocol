multiversx_sc::imports!();

/// Tolerance for consensus: reports within 5% of median count as "agreeing"
const CONSENSUS_TOLERANCE_PERMILLE: u64 = 50u64;

#[multiversx_sc::module]
pub trait KeepersModule: crate::storage::StorageModule + crate::events::EventsModule {
    /// Submit an off-chain price report.
    /// Only registered keeper addresses can call this.
    #[endpoint(reportPrice)]
    fn report_price(&self, price_x1e18: BigUint) {
        let caller = self.blockchain().get_caller();
        require!(
            self.registered_keepers().contains(&caller),
            "caller is not a registered keeper"
        );
        require!(price_x1e18 > BigUint::zero(), "price cannot be zero");

        let block = self.blockchain().get_block_nonce();
        let report = crate::storage::KeeperReport {
            price: price_x1e18.clone(),
            block,
        };

        self.keeper_report(&caller).set(&report);
        self.keeper_reported_event(&caller, &price_x1e18, block);
    }

    /// Compute the median of all fresh keeper reports.
    fn get_median_off_chain(&self) -> BigUint {
        let (median, _, _) = self.process_keepers_summary();
        median
    }

    /// Check if ≥ consensus_min_permille fraction of keepers agree within 5% of median.
    fn check_consensus(&self) -> bool {
        let (_, consensus_ok, _) = self.process_keepers_summary();
        consensus_ok
    }

    /// O(N) optimized keepers state aggregation in a single storage pass and native WASM sorting
    fn process_keepers_summary(&self) -> (BigUint, bool, bool) {
        let current_block = self.blockchain().get_block_nonce();
        let max_age = self.freshness_blocks().get();
        let total_keepers = self.registered_keepers().len();
        
        if total_keepers == 0 {
            return (BigUint::zero(), false, false);
        }

        let mut prices = alloc::vec::Vec::new();
        let mut has_fresh_reports = false;

        for keeper in self.registered_keepers().iter() {
            let report_mapper = self.keeper_report(&keeper);
            if !report_mapper.is_empty() {
                let report = report_mapper.get();
                if current_block.saturating_sub(report.block) <= max_age {
                    prices.push(report.price);
                    has_fresh_reports = true;
                }
            }
        }

        let n = prices.len();
        if n == 0 {
            return (BigUint::zero(), false, false);
        }

        // Require a simple majority of registered keepers to be active/fresh for quorum
        let min_active = (total_keepers + 1) / 2;
        if n < min_active {
            return (BigUint::zero(), false, has_fresh_reports);
        }

        prices.sort();

        let mid = n / 2;
        let median = if n % 2 == 1 {
            prices[mid].clone()
        } else {
            let a = &prices[mid - 1];
            let b = &prices[mid];
            (a + b) / 2u64
        };

        let mut agreeing: u64 = 0;
        for price in &prices {
            let divergence = if price > &median {
                (price - &median) * 1000u64 / &median
            } else {
                (&median - price) * 1000u64 / &median
            };
            let div_u64 = divergence.to_u64().unwrap_or(u64::MAX);
            if div_u64 <= CONSENSUS_TOLERANCE_PERMILLE {
                agreeing += 1;
            }
        }

        let consensus_min = self.consensus_min_permille().get();
        let agreeing_permille = agreeing * 1000u64 / n as u64; // Divisor is n (active keepers)
        let consensus_ok = agreeing_permille >= consensus_min;

        (median, consensus_ok, has_fresh_reports)
    }
}
