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
        let current_block = self.blockchain().get_block_nonce();
        let max_age = self.freshness_blocks().get();

        let mut prices: ManagedVec<BigUint> = ManagedVec::new();

        for keeper in self.registered_keepers().iter() {
            if !self.keeper_report(&keeper).is_empty() {
                let report = self.keeper_report(&keeper).get();
                if current_block.saturating_sub(report.block) <= max_age {
                    prices.push(report.price);
                }
            }
        }

        let n = prices.len();
        if n == 0 {
            return BigUint::zero();
        }

        // Insertion sort ascending (small N, ≤ ~20)
        for i in 1..n {
            let mut j = i;
            while j > 0 {
                let p_prev = prices.get(j - 1).clone();
                let p_cur = prices.get(j).clone();
                if p_prev > p_cur {
                    let _ = prices.set(j - 1, p_cur);
                    let _ = prices.set(j, p_prev);
                    j -= 1;
                } else {
                    break;
                }
            }
        }

        let mid = n / 2;
        if n % 2 == 1 {
            prices.get(mid).clone()
        } else {
            let a = prices.get(mid - 1).clone();
            let b = prices.get(mid).clone();
            (a + b) / 2u64
        }
    }

    /// Check if ≥ consensus_min_permille fraction of keepers agree within 5% of median.
    fn check_consensus(&self) -> bool {
        let median = self.get_median_off_chain();
        if median == BigUint::zero() {
            return false;
        }

        let current_block = self.blockchain().get_block_nonce();
        let max_age = self.freshness_blocks().get();
        let total = self.registered_keepers().len();
        if total == 0 {
            return false;
        }

        let mut agreeing: u64 = 0;

        for keeper in self.registered_keepers().iter() {
            if self.keeper_report(&keeper).is_empty() {
                continue;
            }
            let report = self.keeper_report(&keeper).get();
            if current_block.saturating_sub(report.block) > max_age {
                continue;
            }

            let divergence = if report.price > median {
                (&report.price - &median) * 1000u64 / &median
            } else {
                (&median - &report.price) * 1000u64 / &median
            };

            let div_u64 = divergence.to_u64().unwrap_or(u64::MAX);
            if div_u64 <= CONSENSUS_TOLERANCE_PERMILLE {
                agreeing += 1;
            }
        }

        let consensus_min = self.consensus_min_permille().get();
        let agreeing_permille = agreeing * 1000u64 / total as u64;
        agreeing_permille >= consensus_min
    }
}
