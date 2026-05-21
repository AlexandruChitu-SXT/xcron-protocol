//! Fixed-point trigonometry via CORDIC (COordinate Rotation DIgital Computer).
//!
//! All angles are represented in Q16.16 fixed-point **radians**:
//!   - 1.0 rad  = 65536
//!   - π        ≈ 205887
//!   - 2π       ≈ 411775
//!
//! Precision: ≤ 0.5 % error for sin/cos over the full circle.
//! Gas cost:  16 iterations × (2 adds + 2 shifts + 1 compare) = ~80 integer ops.

// ───────────────────────── constants (Q16.16) ──────────────────────────

/// π in Q16.16  (3.14159265… × 65536 ≈ 205887)
pub const PI: i32 = 205_887;

/// 2π in Q16.16
pub const TWO_PI: i32 = 411_775;

/// π/2 in Q16.16
pub const HALF_PI: i32 = 102_944;

/// 3π/2 in Q16.16
const THREE_HALF_PI: i32 = 308_831;

/// CORDIC gain K₁₆ = ∏ᵢ cos(arctan 2⁻ⁱ) ≈ 0.607253 → Q16.16 = 39797
const CORDIC_GAIN: i32 = 39_797;

// ─────────────── arctan(2⁻ⁱ) lookup table, Q16.16 ─────────────────────
//
// Pre-computed: round(atan(2^(-i)) * 65536) for i = 0..15
static ATAN_LUT: [i32; 16] = [
    51472,  // atan(1)       = 0.7854… rad
    30386,  // atan(1/2)     = 0.4636… rad
    16055,  // atan(1/4)     = 0.2449… rad
    8150,   // atan(1/8)     = 0.1244… rad
    4091,   // atan(1/16)    = 0.0624… rad
    2047,   // atan(1/32)    = 0.0312… rad
    1024,   // atan(1/64)    = 0.0156… rad
    512,    // atan(1/128)   = 0.0078… rad
    256,    // atan(1/256)   = 0.0039… rad
    128,    // atan(1/512)   = 0.0020… rad
    64,     // atan(1/1024)  = 0.00098… rad
    32,     // atan(1/2048)
    16,     // atan(1/4096)
    8,      // atan(1/8192)
    4,      // atan(1/16384)
    2,      // atan(1/32768)
];

// ══════════════════════════ public API ══════════════════════════════════

/// Sine of `angle` (Q16.16 radians). Returns Q16.16 result in [-65536, 65536].
pub fn sin(angle: i32) -> i32 {
    let (_, y) = cordic_rotate(angle);
    y
}

/// Cosine of `angle` (Q16.16 radians). Returns Q16.16 result in [-65536, 65536].
pub fn cos(angle: i32) -> i32 {
    let (x, _) = cordic_rotate(angle);
    x
}

/// Simultaneously returns (cos, sin) — saves repeating the CORDIC loop.
pub fn sincos(angle: i32) -> (i32, i32) {
    let (x, y) = cordic_rotate(angle);
    (x, y) // (cos, sin)
}

/// Four-quadrant arctangent. Returns angle in Q16.16 radians, range (-π, π].
pub fn atan2(y: i32, x: i32) -> i32 {
    if x == 0 && y == 0 {
        return 0;
    }

    // CORDIC vectoring mode: drive y → 0, accumulate angle.
    let mut xi = x;
    let mut yi = y;
    let mut angle: i32 = 0;

    // Pre-rotate into right half-plane so |θ| ≤ π/2.
    if x < 0 {
        if y >= 0 {
            xi = y;
            yi = -x;
            angle = HALF_PI;
        } else {
            xi = -y;
            yi = x;
            angle = -HALF_PI;
        }
    }

    for i in 0..16 {
        let d = if yi >= 0 { 1i32 } else { -1i32 };
        let new_x = xi + d * (yi >> i);
        let new_y = yi - d * (xi >> i);
        angle += d * ATAN_LUT[i];
        xi = new_x;
        yi = new_y;
    }

    angle
}

// ══════════════════════════ internals ═══════════════════════════════════

/// Normalize angle to [0, 2π) in Q16.16.
fn normalize_angle(mut angle: i32) -> i32 {
    // Fast modular reduction
    angle %= TWO_PI;
    if angle < 0 {
        angle += TWO_PI;
    }
    angle
}

/// Core CORDIC rotation mode: given angle θ, compute (cos θ, sin θ) in Q16.16.
fn cordic_rotate(angle: i32) -> (i32, i32) {
    let angle = normalize_angle(angle);

    // Map to [-π/2, π/2] for CORDIC convergence zone.
    let (mut target, negate_x, negate_y) = if angle <= HALF_PI {
        // Q1: θ ∈ [0, π/2]
        (angle, false, false)
    } else if angle <= PI {
        // Q2: θ ∈ (π/2, π] → compute (π − θ), negate cos
        (PI - angle, true, false)
    } else if angle <= THREE_HALF_PI {
        // Q3: θ ∈ (π, 3π/2] → compute (θ − π), negate both
        (angle - PI, true, true)
    } else {
        // Q4: θ ∈ (3π/2, 2π) → compute (2π − θ), negate sin
        (TWO_PI - angle, false, true)
    };

    // Start with the vector (1, 0) scaled by CORDIC_GAIN so the product
    // of cos(atan(2⁻ⁱ)) across iterations equals 1.0 in Q16.16.
    // We use (1/K, 0) to cancel the CORDIC gain: x₀ = CORDIC_GAIN ≈ 0.6073.
    let mut x = CORDIC_GAIN; // ≈ 0.6073 in Q16.16
    let mut y: i32 = 0;

    for i in 0..16 {
        let d = if target >= 0 { 1i32 } else { -1i32 };
        let new_x = x - d * (y >> i);
        let new_y = y + d * (x >> i);
        target -= d * ATAN_LUT[i];
        x = new_x;
        y = new_y;
    }

    if negate_x {
        x = -x;
    }
    if negate_y {
        y = -y;
    }

    (x, y) // (cos, sin)
}

// ══════════════════════════ tests ═══════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: absolute difference
    fn abs_diff(a: i32, b: i32) -> i32 {
        (a - b).abs()
    }

    /// Tolerance: 0.5 % of 65536 (1.0 in Q16.16) = 328
    const TOL: i32 = 328;

    // ─── sin/cos at cardinal angles ───

    #[test]
    fn test_sin_cos_0() {
        // sin(0) = 0, cos(0) = 1
        let s = sin(0);
        let c = cos(0);
        assert!(abs_diff(s, 0) <= TOL, "sin(0) = {} expected 0", s);
        assert!(abs_diff(c, 65536) <= TOL, "cos(0) = {} expected 65536", c);
    }

    #[test]
    fn test_sin_cos_pi_2() {
        // sin(π/2) = 1, cos(π/2) = 0
        let s = sin(HALF_PI);
        let c = cos(HALF_PI);
        assert!(abs_diff(s, 65536) <= TOL, "sin(π/2) = {} expected 65536", s);
        assert!(abs_diff(c, 0) <= TOL, "cos(π/2) = {} expected 0", c);
    }

    #[test]
    fn test_sin_cos_pi() {
        // sin(π) = 0, cos(π) = -1
        let s = sin(PI);
        let c = cos(PI);
        assert!(abs_diff(s, 0) <= TOL, "sin(π) = {} expected 0", s);
        assert!(abs_diff(c, -65536) <= TOL, "cos(π) = {} expected -65536", c);
    }

    #[test]
    fn test_sin_cos_3pi_2() {
        // sin(3π/2) = -1, cos(3π/2) = 0
        let s = sin(THREE_HALF_PI);
        let c = cos(THREE_HALF_PI);
        assert!(abs_diff(s, -65536) <= TOL, "sin(3π/2) = {} expected -65536", s);
        assert!(abs_diff(c, 0) <= TOL, "cos(3π/2) = {} expected 0", c);
    }

    // ─── Pythagorean identity: sin²θ + cos²θ = 1 ───

    #[test]
    fn test_pythagorean_identity() {
        // Sample 12 angles evenly around the circle
        for i in 0..12 {
            let angle = (TWO_PI as i64 * i as i64 / 12) as i32;
            let (c, s) = sincos(angle);
            // sin² + cos² in Q16.16: need to divide by 65536 to get Q16.16
            let sin2 = (s as i64 * s as i64) >> 16;
            let cos2 = (c as i64 * c as i64) >> 16;
            let sum = (sin2 + cos2) as i32;
            // Expected: 65536 (= 1.0)
            let err = abs_diff(sum, 65536);
            assert!(
                err <= 700, // ~1% tolerance for accumulated rounding
                "sin²+cos² at step {} = {} (err {}), expected 65536",
                i, sum, err
            );
        }
    }

    // ─── atan2 basic tests ───

    #[test]
    fn test_atan2_axes() {
        // atan2(0, 1) = 0
        let a1 = atan2(0, 65536);
        assert!(abs_diff(a1, 0) <= TOL, "atan2(0,1) = {} expected 0", a1);

        // atan2(1, 0) = π/2
        let a2 = atan2(65536, 0);
        assert!(abs_diff(a2, HALF_PI) <= TOL, "atan2(1,0) = {} expected {}", a2, HALF_PI);

        // atan2(0, -1) = π
        let a3 = atan2(0, -65536);
        assert!(abs_diff(a3, PI) <= 700, "atan2(0,-1) = {} expected {}", a3, PI);

        // atan2(-1, 0) = -π/2
        let a4 = atan2(-65536, 0);
        assert!(abs_diff(a4, -HALF_PI) <= TOL, "atan2(-1,0) = {} expected {}", a4, -HALF_PI);
    }

    // ─── benchmark: CORDIC vs libm ───

    #[test]
    fn test_cordic_benchmark() {
        extern crate std;
        use std::time::Instant;
        use std::hint::black_box;

        let iterations = 1_000_000u32;

        // CORDIC fixed-point benchmark
        let start_cordic = Instant::now();
        let mut acc_cordic: i64 = 0;
        for i in 0..iterations {
            let angle = (i as i32 * 41) % TWO_PI; // pseudorandom sweep
            let (c, s) = sincos(black_box(angle));
            acc_cordic += (c as i64) + (s as i64);
        }
        let dur_cordic = start_cordic.elapsed();

        // libm f64 benchmark (control)
        let start_libm = Instant::now();
        let mut acc_libm: f64 = 0.0;
        for i in 0..iterations {
            let angle = (i as f64 * 41.0 * core::f64::consts::TAU) / (TWO_PI as f64);
            let s = black_box(angle).sin();
            let c = black_box(angle).cos();
            acc_libm += s + c;
        }
        let dur_libm = start_libm.elapsed();

        // Prevent dead-code elimination
        let _ = black_box(acc_cordic);
        let _ = black_box(acc_libm);

        std::println!("\n[BENCHMARK] CORDIC fixed-point: {:?}", dur_cordic);
        std::println!("[BENCHMARK] libm f64:           {:?}", dur_libm);
        let speedup = dur_libm.as_nanos() as f64 / dur_cordic.as_nanos() as f64;
        std::println!("[BENCHMARK] CORDIC speedup:     {:.2}x\n", speedup);
    }

    // ─── demo: print values for visual inspection ───

    #[test]
    fn demo_trig_table() {
        extern crate std;

        std::println!("\n╔══════════════╦══════════════╦══════════════╗");
        std::println!("║  Angle (deg) ║   sin (fp)   ║   cos (fp)   ║");
        std::println!("╠══════════════╬══════════════╬══════════════╣");

        let steps = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 270, 315, 360];
        for &deg in steps.iter() {
            // degrees → Q16.16 radians: angle = deg * π / 180
            let angle = ((deg as i64) * (PI as i64) / 180) as i32;
            let s = sin(angle);
            let c = cos(angle);
            std::println!(
                "║  {:>10}° ║  {:>10.6} ║  {:>10.6} ║",
                deg,
                s as f64 / 65536.0,
                c as f64 / 65536.0
            );
        }

        std::println!("╚══════════════╩══════════════╩══════════════╝");
    }
}
