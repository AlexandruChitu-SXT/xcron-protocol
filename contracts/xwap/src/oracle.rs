multiversx_sc::imports!();

/// Scaling factor for alpha values (1000 = 1.0)
const ALPHA_SCALE: u64 = 1_000u64;

/// Number of prices in the trend ring buffer
const HISTORY_LEN: u64 = 10u64;

/// Minimum entries before trend detection activates
const TREND_MIN_HISTORY: u64 = 8u64;

/// Steps in the trend window
const TREND_WINDOW: u64 = 8u64;

/// Required same-direction steps for trend signal
const TREND_THRESHOLD: u64 = 7u64;

#[multiversx_sc::module]
pub trait OracleModule:
  crate::storage::StorageModule
  + crate::events::EventsModule
  + crate::keepers::KeepersModule
{
  /// Called by keepers to refresh the EWMA using current pool reserves.
  /// `raw_reserve_a`: token A reserves (raw units from xExchange pool)
  /// `raw_reserve_b`: token B reserves (raw units from xExchange pool)
  #[endpoint(updatePrice)]
  fn update_price(&self, raw_reserve_a: BigUint, raw_reserve_b: BigUint) {
    require!(raw_reserve_a > BigUint::zero(), "reserve_a cannot be zero");
    require!(raw_reserve_b > BigUint::zero(), "reserve_b cannot be zero");

    let scale = BigUint::from(1_000_000_000_000_000_000u64);

    // Pool spot price = reserve_b / reserve_a (x1e18)
    let spot_price = &raw_reserve_b * &scale / &raw_reserve_a;

    let (gate_open, divergence_permille) = self.check_gate_internal(&spot_price);
    let alpha = self.compute_alpha(gate_open);

    let reserve_a_scaled = &raw_reserve_a * &scale;
    let reserve_b_scaled = &raw_reserve_b * &scale;
    self.update_ewma_reserves(&reserve_a_scaled, &reserve_b_scaled, alpha);

    let ewma_a = self.ewma_reserve_a().get();
    let ewma_b = self.ewma_reserve_b().get();
    require!(ewma_a > BigUint::zero(), "ewma_reserve_a is zero after update");

    let new_xwap = &ewma_b * &scale / &ewma_a;

    let idx = self.price_history_idx().get();
    self.price_history(idx).set(&new_xwap);
    self.price_history_idx().set((idx + 1) % HISTORY_LEN);
    self.update_count().update(|c| *c += 1);

    let prev = self.xwap_price().get();
    self.prev_xwap_price().set(&prev);
    self.xwap_price().set(&new_xwap);
    self.alpha_x1000().set(alpha);

    self.price_updated_event(
      &new_xwap,
      alpha,
      gate_open,
      self.blockchain().get_block_nonce(),
    );

    if !gate_open {
      let median = self.get_median_off_chain();
      self.gate_closed_event(&spot_price, &median, divergence_permille);
    }
  }

  fn update_ewma_reserves(&self, reserve_a: &BigUint, reserve_b: &BigUint, alpha_x1000: u64) {
    let alpha = BigUint::from(alpha_x1000);
    let one_minus = BigUint::from(ALPHA_SCALE - alpha_x1000);
    let scale = BigUint::from(ALPHA_SCALE);

    let ewma_a = self.ewma_reserve_a().get();
    let ewma_b = self.ewma_reserve_b().get();

    let new_a = if ewma_a == BigUint::zero() {
      reserve_a.clone()
    } else {
      (&alpha * reserve_a + &one_minus * &ewma_a) / &scale
    };

    let new_b = if ewma_b == BigUint::zero() {
      reserve_b.clone()
    } else {
      (&alpha * reserve_b + &one_minus * &ewma_b) / &scale
    };

    self.ewma_reserve_a().set(new_a);
    self.ewma_reserve_b().set(new_b);
  }

  fn compute_alpha(&self, gate_open: bool) -> u64 {
    let alpha_min = self.alpha_min_x1000().get();
    let alpha_max = self.alpha_max_x1000().get();

    let count = self.update_count().get();
    if count < 5 {
      return alpha_min;
    }

    let current = self.xwap_price().get();
    let prev = self.prev_xwap_price().get();

    if prev== BigUint::zero() {
      return alpha_min;
    }

    let vol_permille_big = if current > prev {
      (&current - &prev) * 1000u64 / &prev
    } else {
      (&prev - &current) * 1000u64 / &prev
    };

    let vol_u64 = vol_permille_big.to_u64().unwrap_or(alpha_max * 1000 / 3);
    let vol_alpha = (vol_u64 * 3).min(alpha_max);
    let mut alpha = vol_alpha.max(alpha_min);

    if self.detect_trend() {
      alpha = (alpha + self.trend_boost_x1000().get()).min(alpha_max);
    }

    if gate_open {
      alpha = (alpha + self.gate_boost_x1000().get()).min(alpha_max);
    }

    alpha
  }

  fn detect_trend(&self) -> bool {
    let count = self.update_count().get();
    if count < TREND_MIN_HISTORY {
      return false;
    }

    let current_idx = self.price_history_idx().get();
    let mut up: u64 = 0;
    let mut down: u64 = 0;

    for i in 0..TREND_WINDOW {
      let idx_a = (current_idx + HISTORY_LEN - i - 1) % HISTORY_LEN;
      let idx_b = (current_idx + HISTORY_LEN - i - 2) % HISTORY_LEN;
      let pa = self.price_history(idx_a).get();
      let pb = self.price_history(idx_b).get();
      if pa > pb {
        up += 1;
      } else if pa < pb {
        down += 1;
      }
    }

    up >= TREND_THRESHOLD || down >= TREND_THRESHOLD
  }

  fn check_gate_internal(&self, spot_price_x1e18: &BigUint) -> (bool, u64) {
    let median = self.get_median_off_chain();

    if median== BigUint::zero() {
      // ️ SECURITY PATCH (Performance Benchmarks): Fail-Safe in case of Oracle offline
      return (false, u64::MAX);
    }

    let threshold_permille = self.gate_threshold_permille().get();

    let divergence_big = if spot_price_x1e18 > &median {
      (spot_price_x1e18 - &median) * 1000u64 / &median
    } else {
      (&median - spot_price_x1e18) * 1000u64 / &median
    };

    let divergence_permille = divergence_big.to_u64().unwrap_or(u64::MAX);
    let gate_open = divergence_permille < threshold_permille;
    (gate_open, divergence_permille)
  }

  fn compute_signals(&self) -> crate::storage::XwapSignals {
    let current_block = self.blockchain().get_block_nonce();
    let xwap = self.xwap_price().get();

    let (gate_open, _) = self.check_gate_internal(&xwap);
    let consensus_ok = self.check_consensus();
    let max_age = self.freshness_blocks().get();
    let freshness_ok = self.check_freshness_internal(current_block, max_age);

    let prev = self.prev_xwap_price().get();
    let stability_permille: u64 = if prev== BigUint::zero() || xwap== BigUint::zero() {
      0u64
    } else {
      let diff = if xwap > prev {
        (&xwap - &prev) * 1000u64 / &prev
      } else {
        (&prev - &xwap) * 1000u64 / &prev
      };
      diff.to_u64().unwrap_or(999u64)
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

  fn check_freshness_internal(&self, current_block: u64, max_age: u64) -> bool {
    for keeper in self.registered_keepers().iter() {
      if !self.keeper_report(&keeper).is_empty() {
        let report = self.keeper_report(&keeper).get();
        if current_block.saturating_sub(report.block) <= max_age {
          return true;
        }
      }
    }
    false
  }

  fn check_gate_view(&self) -> bool {
    let xwap = self.xwap_price().get();
    let (gate_open, _) = self.check_gate_internal(&xwap);
    gate_open
  }
}
