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
    let caller = self.blockchain().get_caller();
    require!(
        self.registered_keepers().contains(&caller) || caller == self.owner_address().get(),
        "caller is not a registered keeper or owner"
    );

    let current_block = self.blockchain().get_block_nonce();
    let last_update = self.cached_last_update_block().get();
    require!(
        current_block > last_update || self.update_count().get() == 0,
        "cooldown: only one update per block allowed"
    );

    require!(raw_reserve_a > BigUint::zero(), "reserve_a cannot be zero");
    require!(raw_reserve_b > BigUint::zero(), "reserve_b cannot be zero");

    let scale = BigUint::from(1_000_000_000_000_000_000u64);

    // Apply decimal scaling offset: spot_price = (reserve_b * scale * multiplier) / (reserve_a * divisor)
    let mult = if self.price_scale_multiplier().is_empty() {
      BigUint::from(1u64)
    } else {
      self.price_scale_multiplier().get()
    };
    let div = if self.price_scale_divisor().is_empty() {
      BigUint::from(1u64)
    } else {
      self.price_scale_divisor().get()
    };

    let denominator = &raw_reserve_a * &div;
    let half_denominator = &denominator / 2u64;
    let spot_price = (&raw_reserve_b * &scale * &mult + &half_denominator) / &denominator;

    let (median, consensus_ok, _) = self.process_keepers_summary();

    let (gate_open, divergence_permille) = if median == BigUint::zero() {
        if self.ewma_reserve_a().get() == BigUint::zero() {
            (true, 0u64) // Bootstrap phase bypass
        } else {
            (false, u64::MAX) // Keepers offline
        }
    } else {
        self.check_gate_internal(&spot_price)
    };

    require!(gate_open, "Gate closed: spot price deviates too much from median");

    let alpha = self.compute_alpha(gate_open);

    let reserve_a_scaled = &raw_reserve_a * &scale * &div;
    let reserve_b_scaled = &raw_reserve_b * &scale * &mult;
    self.update_ewma_reserves(&reserve_a_scaled, &reserve_b_scaled, alpha);

    let ewma_a = self.ewma_reserve_a().get();
    let ewma_b = self.ewma_reserve_b().get();
    require!(ewma_a > BigUint::zero(), "ewma_reserve_a is zero after update");

    // Half-Up rounding for oracle final price
    let half_ewma_a = &ewma_a / 2u64;
    let new_xwap = (&ewma_b * &scale + &half_ewma_a) / &ewma_a;

    // Update circular history using single storage key
    let mut history = if self.price_history_vec().is_empty() {
        ManagedVec::new()
    } else {
        self.price_history_vec().get()
    };
    let idx = self.price_history_idx().get() as usize;
    if history.len() < HISTORY_LEN as usize {
        history.push(new_xwap.clone());
    } else {
        let _ = history.set(idx, new_xwap.clone());
    }
    self.price_history_idx().set(((idx + 1) % HISTORY_LEN as usize) as u64);
    self.price_history_vec().set(&history);

    self.update_count().update(|c| *c += 1);

    let prev = self.xwap_price().get();
    self.prev_xwap_price().set(&prev);
    self.xwap_price().set(&new_xwap);
    self.alpha_x1000().set(alpha);

    // Commit to cache for Scheduler optimized lookups
    self.cached_median().set(&median);
    self.cached_consensus_ok().set(consensus_ok);
    self.cached_gate_open().set(gate_open);
    self.cached_last_update_block().set(current_block);

    self.price_updated_event(
      &new_xwap,
      alpha,
      gate_open,
      current_block,
    );
  }

  fn update_ewma_reserves(&self, reserve_a: &BigUint, reserve_b: &BigUint, alpha_x1000: u64) {
    let alpha = BigUint::from(alpha_x1000);
    let one_minus = BigUint::from(ALPHA_SCALE - alpha_x1000);
    let scale = BigUint::from(ALPHA_SCALE);
    let half_scale = &scale / 2u64;

    let ewma_a = self.ewma_reserve_a().get();
    let ewma_b = self.ewma_reserve_b().get();

    let new_a = if ewma_a == BigUint::zero() {
      reserve_a.clone()
    } else {
      ((&alpha * reserve_a + &one_minus * &ewma_a) + &half_scale) / &scale
    };

    let new_b = if ewma_b == BigUint::zero() {
      reserve_b.clone()
    } else {
      ((&alpha * reserve_b + &one_minus * &ewma_b) + &half_scale) / &scale
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

    if prev == BigUint::zero() {
      return alpha_min;
    }

    // Half-Up rounding for volatility to prevent rounding errors
    let diff = if current > prev { &current - &prev } else { &prev - &current };
    let half_prev = &prev / 2u64;
    let vol_permille_big = (diff * 1000u64 + &half_prev) / &prev;

    let vol_u64 = vol_permille_big.to_u64().unwrap_or(0u64);
    
    // Inverted volatility dampening: higher volatility reduces alpha to keep the EWMA price sticky.
    let volatility_penalty = vol_u64 * 3;
    let mut alpha = if alpha_max > volatility_penalty {
      alpha_max - volatility_penalty
    } else {
      alpha_min
    };
    alpha = alpha.max(alpha_min).min(alpha_max);

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
    if self.price_history_vec().is_empty() {
      return false;
    }
    let history = self.price_history_vec().get();
    let history_len = history.len();
    if history_len < TREND_MIN_HISTORY as usize {
      return false;
    }

    let current_idx = self.price_history_idx().get() as usize;
    let mut up: u64 = 0;
    let mut down: u64 = 0;

    for i in 0..TREND_WINDOW as usize {
      let idx_a = (current_idx + HISTORY_LEN as usize - i - 1) % HISTORY_LEN as usize;
      let idx_b = (current_idx + HISTORY_LEN as usize - i - 2) % HISTORY_LEN as usize;
      
      if idx_a >= history_len || idx_b >= history_len {
        continue;
      }

      let pa = history.get(idx_a);
      let pb = history.get(idx_b);
      if *pa > *pb {
        up += 1;
      } else if *pa < *pb {
        down += 1;
      }
    }

    up >= TREND_THRESHOLD || down >= TREND_THRESHOLD
  }

  fn check_gate_internal(&self, spot_price_x1e18: &BigUint) -> (bool, u64) {
    let (median, _, _) = self.process_keepers_summary();

    if median == BigUint::zero() {
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

    let (median, consensus_ok, freshness_ok) = self.process_keepers_summary();
    
    let gate_open = if median == BigUint::zero() {
      false
    } else {
      let threshold_permille = self.gate_threshold_permille().get();
      let divergence_big = if xwap > median {
        (&xwap - &median) * 1000u64 / &median
      } else {
        (&median - &xwap) * 1000u64 / &median
      };
      let div_permille = divergence_big.to_u64().unwrap_or(u64::MAX);
      div_permille < threshold_permille
    };

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

  fn check_freshness_internal(&self, current_block: u64, max_age: u64) -> bool {
    let last_update = self.cached_last_update_block().get();
    current_block.saturating_sub(last_update) <= max_age
  }

  fn check_gate_view(&self) -> bool {
    let xwap = self.xwap_price().get();
    let (gate_open, _) = self.check_gate_internal(&xwap);
    gate_open
  }
}
