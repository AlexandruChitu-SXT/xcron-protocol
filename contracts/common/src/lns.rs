/// Minimum LNS value to represent log2(0) which theoretically tends to -infinity.
pub const MIN_LNS: i64 = -1_000_000;

/// Base scale factor for fractional log bits (2^16 = 65536).
pub const LNS_SCALE_BITS: u8 = 16;
pub const LNS_SCALE: i64 = 1 << LNS_SCALE_BITS;

/// Convert a standard u64 integer to its LNS fixed-point representation.
/// Uses the fast Count Leading Zeros (clz) assembly instruction and an iterative
/// squaring algorithm to compute the fractional part with 16-bit precision.
pub fn to_lns(val: u64) -> i64 {
    if val == 0 {
        return MIN_LNS;
    }

    let leading_zeros = val.leading_zeros();
    let k = 63 - leading_zeros; // Integer part of log2

    // Normalize val to [2^63, 2^64) to compute the fractional part
    let mut y = val << leading_zeros;
    let mut frac = 0i64;
    let mut b = 1i64 << 15; // Bit weight for the 16 fractional bits (bit 15 down to 0)

    for _ in 0..16 {
        // y = y^2 / 2^63
        let y_128 = y as u128;
        let mut y_sq = (y_128 * y_128) >> 63;
        if y_sq >= (1u128 << 64) {
            frac |= b;
            y_sq >>= 1;
        }
        y = y_sq as u64;
        b >>= 1;
    }

    ((k as i64) << LNS_SCALE_BITS) + frac
}

/// Lookup table for 2^(i/16) for i in 0..=16, scaled by 2^16 (65536).
const EXP_LUT: [u64; 17] = [
    65536, 68418, 71424, 74561, 77830, 81240, 84799, 88513,
    92388, 96435, 100659, 105069, 109673, 114479, 119495, 124732,
    131072
];

/// Convert an LNS fixed-point value back to a standard u64 integer.
/// Uses linear interpolation on a 17-point lookup table for 2^t, ensuring
/// high precision and round-to-nearest scaling.
pub fn from_lns(lns_val: i64) -> u64 {
    if lns_val <= MIN_LNS {
        return 0;
    }

    let k = lns_val >> LNS_SCALE_BITS;
    let f = (lns_val & 0xFFFF) as u64; // Fractional part in [0, 65535]

    let idx = (f >> 12) as usize; // f / 4096 (range 0 to 15)
    let rem = f & 0x0FFF; // fractional remainder (0 to 4095)
    let y0 = EXP_LUT[idx];
    let y1 = EXP_LUT[idx + 1];
    
    let frac_part = y0 + ((y1 - y0) * rem) / 4096;

    let res = if k >= 16 {
        frac_part << (k - 16)
    } else {
        let shift = 16 - k;
        let half = 1u64 << (shift - 1);
        (frac_part + half) >> shift
    };

    res as u64
}

/// Multiply two real numbers in LNS representation (corresponds to addition).
pub fn lns_mul(a: i64, b: i64) -> i64 {
    if a <= MIN_LNS || b <= MIN_LNS {
        return MIN_LNS;
    }
    a + b
}

/// Divide two real numbers in LNS representation (corresponds to subtraction).
pub fn lns_div(a: i64, b: i64) -> i64 {
    if a <= MIN_LNS {
        return MIN_LNS;
    }
    if b <= MIN_LNS {
        return i64::MAX;
    }
    a - b
}

/// Add two real numbers in LNS representation.
/// Computes log2(A + B) using the identity:
/// log2(A + B) = max(a, b) + log2(1 + 2^-|a - b|)
/// Where R = 2^|a-b| = from_lns(|a-b|), and log2(1 + 1/R) = log2(R + 1) - |a-b|
/// To preserve precision, we scale the relation R to a 16-bit fixed point representation.
pub fn lns_add(a: i64, b: i64) -> i64 {
    if a <= MIN_LNS {
        return b;
    }
    if b <= MIN_LNS {
        return a;
    }

    let max_val = core::cmp::max(a, b);
    let min_val = core::cmp::min(a, b);
    let diff = max_val - min_val;

    if diff >= (16 << LNS_SCALE_BITS) {
        return max_val;
    }

    // Scale R to 16-bit fixed point: R_fixed = 2^(diff + 16)
    let r_fixed = from_lns(diff + (16 << LNS_SCALE_BITS));
    if r_fixed == 0 {
        return max_val;
    }
    
    // R_fixed + 1.0 in 16-bit scale is R_fixed + 65536
    let r_plus_1_fixed = r_fixed + (1 << LNS_SCALE_BITS);
    
    // log2(R + 1) = log2(R_fixed + 65536) - 16
    let log2_r_plus_1 = to_lns(r_plus_1_fixed) - (16 << LNS_SCALE_BITS);

    max_val + log2_r_plus_1 - diff
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_lns_zero() {
        assert_eq!(to_lns(0), MIN_LNS);
    }

    #[test]
    fn test_roundtrip_precision() {
        let values = [1, 2, 3, 4, 5, 8, 10, 100, 1000, 65536, 1_000_000, 4_294_967_296];
        for &val in values.iter() {
            let lns = to_lns(val);
            let back = from_lns(lns);
            let diff = if val > back { val - back } else { back - val };
            let max_allowed_diff = core::cmp::max(1, val / 100); // 1% tolerance
            assert!(diff <= max_allowed_diff, "Value {} roundtrip failed: got {}, expected close to {}", val, back, val);
        }
    }

    #[test]
    fn test_lns_multiplication() {
        let val_a = 50;
        let val_b = 20;
        let lns_a = to_lns(val_a);
        let lns_b = to_lns(val_b);
        let lns_res = lns_mul(lns_a, lns_b);
        let res = from_lns(lns_res);
        let diff = if res > 1000 { res - 1000 } else { 1000 - res };
        assert!(diff <= 5, "Multiplication failed: expected ~1000, got {}", res);
    }

    #[test]
    fn test_lns_division() {
        let val_a = 1000;
        let val_b = 20;
        let lns_a = to_lns(val_a);
        let lns_b = to_lns(val_b);
        let lns_res = lns_div(lns_a, lns_b);
        let res = from_lns(lns_res);
        assert_eq!(res, 50);
    }

    #[test]
    fn test_lns_addition() {
        let val_a = 400;
        let val_b = 600;
        let lns_a = to_lns(val_a);
        let lns_b = to_lns(val_b);
        let lns_res = lns_add(lns_a, lns_b);
        let res = from_lns(lns_res);
        let diff = if res > 1000 { res - 1000 } else { 1000 - res };
        assert!(diff <= 10, "Addition failed: expected ~1000, got {}", res);
    }

    #[test]
    fn test_lns_benchmark() {
        extern crate std;
        use std::time::Instant;
        use std::hint::black_box;

        let iterations = 10_000_000;

        // Benchmark de Aritmética Tradicional (Multiplicación y División)
        let start_trad = Instant::now();
        let mut val_trad = 50u64;
        for _ in 1..iterations {
            val_trad = black_box((val_trad * 20) / 19);
            if val_trad > 1_000_000 {
                val_trad = 50;
            }
        }
        let duration_trad = start_trad.elapsed();

        // Benchmark de Aritmética LNS (Operaciones de suma y resta directa)
        let start_lns = Instant::now();
        let mut lns_val = to_lns(50);
        let lns_mul_factor = to_lns(20);
        let lns_div_factor = to_lns(19);
        let limit_lns = to_lns(1_000_000);
        let reset_lns = to_lns(50);
        for _ in 1..iterations {
            lns_val = black_box(lns_div(lns_mul(lns_val, lns_mul_factor), lns_div_factor));
            if lns_val > limit_lns {
                lns_val = reset_lns;
            }
        }
        let duration_lns = start_lns.elapsed();

        std::println!("\n[BENCHMARK] Tradicional: {:?}", duration_trad);
        std::println!("[BENCHMARK] LNS: {:?}", duration_lns);
        let speedup = duration_trad.as_nanos() as f64 / duration_lns.as_nanos() as f64;
        std::println!("[BENCHMARK] Speedup de velocidad LNS: {:.2}x\n", speedup);
    }
}
