//! Chaotic Maps — Deterministic pseudo-random number generation using
//! discrete chaotic dynamical systems (Logistic Map, Tent Map).
//!
//! # Use Cases
//! - Fair, non-manipulable task→keeper assignment
//! - On-chain shuffling without external oracles (no Chainlink VRF needed)
//! - Deterministic replay: same seed → same permutation, always
//!
//! # Gas Profile
//! One PRNG step = 1 multiply + 1 subtract + 1 shift ≈ 3 WASM instructions.

// ═══════════════════════════ constants ══════════════════════════════════

/// Internal state precision: 2^30 = 1,073,741,824
const SCALE_BITS: u32 = 30;
const SCALE: u64 = 1 << SCALE_BITS;

// ═══════════════════════════ PRNG core ═════════════════════════════════

/// Chaotic PRNG powered by the Logistic Map in fully chaotic regime (r = 4).
///
/// ```text
/// x_{n+1} = 4 · x_n · (1 − x_n)
/// ```
///
/// State lives in (0, 1) mapped to integer range [1, SCALE-1].
/// All arithmetic is u64; max intermediate value = 4·(2^29)² = 2^60 → no overflow.
pub struct ChaoticPrng {
    state: u64,
    counter: u64,
}

impl ChaoticPrng {
    /// Create a new PRNG from a `seed`.
    ///
    /// The seed is mixed (splitmix64-style) to avoid degenerate initial states,
    /// then 20 warm-up iterations break seed→output correlation.
    pub fn new(seed: u64) -> Self {
        // ── splitmix64 mixing ──
        let mut s = seed;
        s ^= s >> 33;
        s = s.wrapping_mul(0xff51afd7ed558ccd);
        s ^= s >> 33;
        s = s.wrapping_mul(0xc4ceb9fe1a85ec53);
        s ^= s >> 33;

        // Map to valid range [1, SCALE-1]
        let state = (s % (SCALE - 2)) + 1;

        let mut prng = Self { state, counter: 0 };

        // Warm-up: decorrelate from seed
        for _ in 0..20 {
            prng.step_logistic();
        }
        prng
    }

    /// Advance the logistic map one step.
    #[inline]
    fn step_logistic(&mut self) -> u64 {
        let x = self.state;
        // x' = 4·x·(SCALE − x) >> SCALE_BITS
        self.state = (4 * x * (SCALE - x)) >> SCALE_BITS;

        // Guard against fixed-point collapse (x=0 or x=SCALE)
        if self.state == 0 || self.state >= SCALE {
            self.state = (self.counter.wrapping_mul(2_654_435_761) % (SCALE - 2)) + 1;
        }
        self.counter += 1;
        self.state
    }

    /// Next pseudo-random `u32` in full range.
    pub fn next_u32(&mut self) -> u32 {
        self.step_logistic() as u32
    }

    /// Next pseudo-random value in `[0, max)`.
    pub fn next_bounded(&mut self, max: u32) -> u32 {
        if max <= 1 {
            return 0;
        }
        (self.step_logistic() % (max as u64)) as u32
    }

    /// Returns the raw state (useful for on-chain commitments).
    pub fn raw_state(&self) -> u64 {
        self.state
    }
}

// ═══════════════════════════ public API ════════════════════════════════

/// Fisher–Yates shuffle of `slice` using a chaotic PRNG seeded with `seed`.
///
/// Deterministic: same seed + same slice length → identical permutation.
/// Gas: O(n) iterations × 3 WASM ops per iteration.
pub fn chaotic_shuffle<T>(slice: &mut [T], seed: u64) {
    let len = slice.len();
    if len <= 1 {
        return;
    }
    let mut prng = ChaoticPrng::new(seed);
    for i in (1..len).rev() {
        let j = prng.next_bounded((i + 1) as u32) as usize;
        slice.swap(i, j);
    }
}

/// Fill `buf` with pseudo-random `u32` values from the chaotic sequence.
pub fn chaotic_fill(buf: &mut [u32], seed: u64) {
    let mut prng = ChaoticPrng::new(seed);
    for slot in buf.iter_mut() {
        *slot = prng.next_u32();
    }
}

/// Generate a deterministic assignment of `n_tasks` tasks to `n_keepers` keepers.
///
/// Returns an array (stack-allocated up to `MAX`) where `result[task_i] = keeper_id`.
/// Each keeper gets roughly `n_tasks / n_keepers` tasks (±1).
///
/// # Panics
/// Panics if `n_keepers == 0`.
pub fn assign_tasks(n_tasks: u32, n_keepers: u32, seed: u64) -> [u32; 64] {
    assert!(n_keepers > 0, "need at least 1 keeper");
    let mut result = [0u32; 64];
    let cap = if (n_tasks as usize) < 64 { n_tasks as usize } else { 64 };

    // Build task indices [0, 1, 2, … cap-1]
    let mut indices = [0u32; 64];
    for i in 0..cap {
        indices[i] = i as u32;
    }

    // Shuffle task indices
    chaotic_shuffle(&mut indices[..cap], seed);

    // Round-robin assign shuffled tasks to keepers
    for i in 0..cap {
        result[indices[i] as usize] = (i as u32) % n_keepers;
    }
    result
}

// ═══════════════════════════ tests ═════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    // ─── basic PRNG properties ───

    #[test]
    fn test_determinism() {
        // Same seed → same sequence
        let mut a = ChaoticPrng::new(42);
        let mut b = ChaoticPrng::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    #[test]
    fn test_different_seeds_diverge() {
        let mut a = ChaoticPrng::new(1);
        let mut b = ChaoticPrng::new(2);
        let mut same = 0u32;
        for _ in 0..100 {
            if a.next_u32() == b.next_u32() {
                same += 1;
            }
        }
        // Probability of even 5 collisions in 100 draws from 2^30 space ≈ 0
        assert!(same < 5, "seeds 1 and 2 produced {} collisions", same);
    }

    #[test]
    fn test_no_fixed_points() {
        // Verify the PRNG doesn't get stuck
        let mut prng = ChaoticPrng::new(12345);
        let first = prng.next_u32();
        let mut stuck = true;
        for _ in 0..1000 {
            if prng.next_u32() != first {
                stuck = false;
                break;
            }
        }
        assert!(!stuck, "PRNG stuck on value {}", first);
    }

    #[test]
    fn test_bounded_range() {
        let mut prng = ChaoticPrng::new(999);
        for _ in 0..10_000 {
            let v = prng.next_bounded(10);
            assert!(v < 10, "next_bounded(10) returned {}", v);
        }
    }

    // ─── distribution quality ───

    #[test]
    fn test_uniform_distribution() {
        extern crate std;

        let mut prng = ChaoticPrng::new(0xDEAD_BEEF);
        let mut buckets = [0u32; 10];
        let n = 100_000u32;

        for _ in 0..n {
            let v = prng.next_bounded(10);
            buckets[v as usize] += 1;
        }

        // Expected: 10,000 each. Allow ±15% (8500..11500)
        for (i, &count) in buckets.iter().enumerate() {
            assert!(
                count > 8_500 && count < 11_500,
                "bucket {} has {} hits (expected ~10000)",
                i, count
            );
        }

        std::println!("\n[DISTRIBUTION] 100k draws → 10 buckets:");
        for (i, &count) in buckets.iter().enumerate() {
            let bar_len = (count / 500) as usize;
            let bar: std::string::String = core::iter::repeat('█').take(bar_len).collect();
            std::println!("  bucket[{}]: {:>6} {}", i, count, bar);
        }
    }

    // ─── shuffle tests ───

    #[test]
    fn test_shuffle_permutation() {
        let mut arr: [u32; 10] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        chaotic_shuffle(&mut arr, 42);

        // Must still contain all elements 0..9
        let mut sorted = arr;
        sorted.sort();
        assert_eq!(sorted, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

        // Must NOT be in original order (astronomically unlikely with seed 42)
        assert_ne!(arr, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }

    #[test]
    fn test_shuffle_determinism() {
        let mut a: [u32; 8] = [0, 1, 2, 3, 4, 5, 6, 7];
        let mut b: [u32; 8] = [0, 1, 2, 3, 4, 5, 6, 7];
        chaotic_shuffle(&mut a, 777);
        chaotic_shuffle(&mut b, 777);
        assert_eq!(a, b);
    }

    #[test]
    fn test_shuffle_sensitivity() {
        // Seeds 100 vs 101 → completely different permutations (butterfly effect)
        let mut a: [u32; 20] = core::array::from_fn(|i| i as u32);
        let mut b: [u32; 20] = core::array::from_fn(|i| i as u32);
        chaotic_shuffle(&mut a, 100);
        chaotic_shuffle(&mut b, 101);

        let matching = a.iter().zip(b.iter()).filter(|(x, y)| x == y).count();
        // With 20 elements, expected matches by chance ≈ 1. Allow up to 5.
        assert!(
            matching <= 5,
            "seeds 100 vs 101 share {} positions (too correlated)",
            matching
        );
    }

    // ─── task assignment ───

    #[test]
    fn test_assign_tasks_fairness() {
        extern crate std;

        let n_tasks = 12u32;
        let n_keepers = 4u32;
        let result = assign_tasks(n_tasks, n_keepers, 0xCAFE);

        // Count tasks per keeper
        let mut counts = [0u32; 4];
        for i in 0..(n_tasks as usize) {
            counts[result[i] as usize] += 1;
        }

        std::println!("\n[ASSIGN] {} tasks → {} keepers:", n_tasks, n_keepers);
        for (k, &c) in counts.iter().enumerate() {
            std::println!("  keeper[{}]: {} tasks", k, c);
        }

        // Each keeper should get exactly 3 tasks (12/4)
        for (k, &c) in counts.iter().enumerate() {
            assert_eq!(c, 3, "keeper {} got {} tasks, expected 3", k, c);
        }
    }

    // ─── butterfly effect demo ───

    #[test]
    fn demo_butterfly_effect() {
        extern crate std;

        std::println!("\n[BUTTERFLY] Seeds 1000 vs 1001 — first 10 outputs:");
        let mut a = ChaoticPrng::new(1000);
        let mut b = ChaoticPrng::new(1001);
        for i in 0..10 {
            let va = a.next_u32();
            let vb = b.next_u32();
            let diff = if va > vb { va - vb } else { vb - va };
            std::println!("  step {:>2}: seed=1000 → {:>10}  |  seed=1001 → {:>10}  |  Δ = {}", i, va, vb, diff);
        }
    }

    // ─── benchmark ───

    #[test]
    fn test_chaotic_benchmark() {
        extern crate std;
        use std::time::Instant;
        use std::hint::black_box;

        let iterations = 10_000_000u32;

        // Chaotic PRNG benchmark
        let start = Instant::now();
        let mut prng = ChaoticPrng::new(42);
        let mut acc: u64 = 0;
        for _ in 0..iterations {
            acc = acc.wrapping_add(black_box(prng.next_u32()) as u64);
        }
        let dur = start.elapsed();
        let _ = black_box(acc);

        let ns_per_op = dur.as_nanos() as f64 / iterations as f64;
        std::println!("\n[BENCHMARK] Chaotic PRNG: {:?} for {}M iterations", dur, iterations / 1_000_000);
        std::println!("[BENCHMARK] {:.1} ns/op", ns_per_op);
        std::println!("[BENCHMARK] ~{:.0} ops/sec\n", 1e9 / ns_per_op);
    }
}
