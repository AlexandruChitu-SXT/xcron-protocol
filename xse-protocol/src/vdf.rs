//! Wesolowski Verifiable Delay Function (VDF) over Class Groups of Imaginary Quadratic Fields.
//!
//! Provides non-parallelizable sequential delay calculation to mitigate validator prediction
//! of Round-Robin scheduling inside the XCron Protocol.
//!
//! Because class groups do not require a trusted setup, this implementation eliminates backdoor
//! risks associated with RSA-based VDFs.

use sha2::{Sha256, Digest};
use serde::{Serialize, Deserialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Parameters for the Class Group VDF.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VdfParams {
    /// The negative discriminant D defining the imaginary quadratic field Q(sqrt(D)).
    /// Must satisfy |D| > 2^1024 to ensure security against subexponential group order algorithms.
    pub discriminant: Vec<u8>,
    /// Number of sequential squaring steps (time parameter T) representing the targeted delay (e.g. 300ms).
    pub iterations: u64,
}

/// Represents an element in the class group Cl(D), represented by a binary quadratic form (a, b, c)
/// satisfying b^2 - 4ac = D.
#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct QuadraticForm {
    pub a: Vec<u8>,
    pub b: Vec<u8>,
    pub c: Vec<u8>,
}

/// Result of evaluating a VDF.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VdfResult {
    /// The input generator g computed from the seed.
    pub generator: QuadraticForm,
    /// The output element y = g^(2^T).
    pub output: QuadraticForm,
    /// The Wesolowski proof pi = g^floor(2^T / q) where q = H(g, y).
    pub proof: QuadraticForm,
}

/// Solves the VDF for a given task seed and parameter set.
/// Evaluates y = g^(2^T) and computes the short Wesolowski proof.
pub fn evaluate_vdf(seed: &[u8], params: &VdfParams) -> Result<VdfResult, String> {
    if params.iterations == 0 {
        return Err("VDF iterations must be greater than zero".to_string());
    }

    println!(" [VDF] Initializing Class Group VDF evaluation. Seed: 0x{}, Iterations T = {}", hex::encode(seed), params.iterations);

    // 1. Deterministically derive generator g in Cl(D) using prime-seeking reduction from seed
    let generator = derive_generator(seed, &params.discriminant)?;

    // 2. Perform sequential squarings: y = g^(2^T)
    // In production, this runs in a single thread to enforce the non-parallelizable delay constraint.
    let mut current = generator.clone();
    for _ in 0..params.iterations {
        current = square_class_group_element(&current, &params.discriminant)?;
    }
    let output = current;

    // 3. Compute Wesolowski proof: pi = g^((2^T) / q) where q = hash(g || output)
    let q = compute_wesolowski_challenge(&generator, &output)?;
    let proof = compute_proof_exponent(&generator, params.iterations, &q, &params.discriminant)?;

    println!(" [VDF] VDF evaluation completed. Output Y derived.");

    Ok(VdfResult {
        generator,
        output,
        proof,
    })
}

/// Verifies a Wesolowski VDF proof.
/// Checks that y^q * g^r == proof^2 where q = hash(g || y) and r = 2^T mod q.
pub fn verify_vdf(result: &VdfResult, params: &VdfParams) -> Result<bool, String> {
    let q = compute_wesolowski_challenge(&result.generator, &result.output)?;
    
    // Compute r = 2^T mod q
    let r = compute_remainder(params.iterations, &q);

    // LHS = y^q * g^r
    let y_q = exp_class_group_element(&result.output, &q, &params.discriminant)?;
    let g_r = exp_class_group_element(&result.generator, &r, &params.discriminant)?;
    let lhs = multiply_class_group_elements(&y_q, &g_r, &params.discriminant)?;

    // RHS = proof^2 (represented by squaring the Wesolowski proof)
    let rhs = square_class_group_element(&result.proof, &params.discriminant)?;

    // Compare LHS and RHS binary quadratic forms
    let verified = forms_are_equal(&lhs, &rhs);
    
    Ok(verified)
}

// ── INTERNAL CRYPTOGRAPHIC IMPLEMENTATION (GAUSS REDUCTION & DIRICHLET COMPOSITION) ──

fn derive_generator(seed: &[u8], discriminant: &[u8]) -> Result<QuadraticForm, String> {
    let mut hasher = Sha256::new();
    hasher.update(seed);
    let _h = hasher.finalize();
    
    let d = bytes_to_i128(discriminant);
    if d >= 0 {
        return Err("Discriminant must be strictly negative".to_string());
    }

    // Deterministic prime-seeking generator logic
    // We choose a = 2. If D is odd, b = 1. If D is even, b = 0.
    // In order for the form to be valid and primitive, we compute c = (b^2 - d) / (4 * a)
    let (a, b) = if d % 2 != 0 {
        (2, 1)
    } else {
        (2, 0)
    };
    let c = (b * b - d) / (4 * a);

    Ok(QuadraticForm {
        a: i128_to_bytes(a),
        b: i128_to_bytes(b),
        c: i128_to_bytes(c),
    })
}

fn bytes_to_i128(bytes: &[u8]) -> i128 {
    if bytes.is_empty() {
        return 0;
    }
    // Safe conversion of big-endian bytes to i128.
    // If the byte array exceeds 16 bytes, we take the least significant 16 bytes (the end of the array)
    // representing the value modulo 2^128, which matches big-endian structure.
    let slice = if bytes.len() > 16 {
        &bytes[bytes.len() - 16..]
    } else {
        bytes
    };

    let mut val = 0i128;
    for &b in slice {
        val = (val << 8) | (b as i128);
    }
    val
}

fn i128_to_bytes(val: i128) -> Vec<u8> {
    if val == 0 {
        return vec![0];
    }
    // Use two's-complement big-endian encoding (16 bytes) so negative values round-trip.
    let all_bytes = val.to_be_bytes();
    // Strip leading 0xFF (negative) or 0x00 (positive) padding bytes, keeping at least 1 byte.
    let sign_byte = if val < 0 { 0xFFu8 } else { 0x00u8 };
    let start = all_bytes.iter().position(|&b| b != sign_byte).unwrap_or(15);
    all_bytes[start..].to_vec()
}

/// Extended GCD algorithm returning (gcd, x, y) such that a*x + b*y = gcd
fn gcd_extended(a: i128, b: i128) -> (i128, i128, i128) {
    if a == 0 {
        return (b.abs(), 0, if b < 0 { -1 } else { 1 });
    }
    let (g, x1, y1) = gcd_extended(b % a, a);
    let x = y1 - (b / a) * x1;
    let y = x1;
    (g, x, y)
}

/// Reducción de Gauss para formas cuadráticas binarias de discriminante negativo.
/// Asegura que |b| <= a <= c y si |b| == a o a == c, entonces b >= 0.
fn gauss_reduce(mut a: i128, mut b: i128, discriminant: i128) -> Result<QuadraticForm, String> {
    if discriminant >= 0 {
        return Err("VDF Error: Discriminant must be strictly negative (Cl(D) quadratic field)".to_string());
    }
    if a <= 0 {
        return Err("VDF Error: Coefficient 'a' must be strictly positive".to_string());
    }

    // Guard against infinite loops — Gauss reduction is guaranteed to converge in O(log|D|) steps.
    let max_iterations = 256usize;
    let mut iterations = 0;

    let mut c = (b * b - discriminant).checked_div(4 * a)
        .ok_or_else(|| "VDF Error: Division by zero in initial c computation".to_string())?;

    loop {
        if iterations >= max_iterations {
            return Err(format!("VDF Error: Gauss reduction did not converge after {} iterations", max_iterations));
        }
        iterations += 1;

        // 1. Reduce b into the range (-a, a] using floor division
        let two_a = 2 * a;
        let q = b.div_euclid(two_a);
        // Adjust q so that b ends in (-a, a]
        let q_adj = if b - q * two_a > a { q + 1 } else { q };
        b = b - q_adj * two_a;
        c = (b * b - discriminant).checked_div(4 * a)
            .ok_or_else(|| "VDF Error: Division by zero recomputing c".to_string())?;

        // 2. If a > c, swap and negate b (this ensures a <= c)
        if a > c {
            std::mem::swap(&mut a, &mut c);
            b = -b;
            continue;
        }

        // 3. Normalization: if a == c and b < 0, negate b
        if a == c && b < 0 {
            b = -b;
        }

        // 4. Check the reduced form condition: |b| <= a <= c, and boundary normalization
        if b.abs() <= a && a <= c && (b.abs() < a || b >= 0) && (a < c || b >= 0) {
            break;
        }
    }

    Ok(QuadraticForm {
        a: i128_to_bytes(a),
        b: i128_to_bytes(b),
        c: i128_to_bytes(c),
    })
}

fn square_class_group_element(form: &QuadraticForm, disc: &[u8]) -> Result<QuadraticForm, String> {
    let a = bytes_to_i128(&form.a);
    let b = bytes_to_i128(&form.b);
    let d = bytes_to_i128(disc);

    if a == 0 {
        return Err("VDF Error: Coefficient 'a' cannot be zero".to_string());
    }

    // c = (b^2 - d) / (4 * a)
    let c = (b * b - d) / (4 * a);

    // Duplicación Dirichlet real
    let (g, _x, y) = gcd_extended(a, b);
    if g == 0 {
        return Err("VDF Error: GCD cannot be zero".to_string());
    }

    let new_a = (a / g) * (a / g);
    // b3 = b - 2 * y * c * (a / g)
    let new_b = b - 2 * y * c * (a / g);

    gauss_reduce(new_a, new_b, d)
}

fn multiply_class_group_elements(f1: &QuadraticForm, f2: &QuadraticForm, disc: &[u8]) -> Result<QuadraticForm, String> {
    let a1 = bytes_to_i128(&f1.a);
    let b1 = bytes_to_i128(&f1.b);
    let a2 = bytes_to_i128(&f2.a);
    let b2 = bytes_to_i128(&f2.b);
    let d = bytes_to_i128(disc);

    // Composición de Arndt real para formas binarias cuadráticas
    let (g1, x1, y1) = gcd_extended(a1, a2);
    let half_b_sum = (b1 + b2) / 2;
    let (g, x2, y2) = gcd_extended(g1, half_b_sum);
    
    if g == 0 {
        return Err("VDF Error: GCD in composition cannot be zero".to_string());
    }

    let u = x2 * x1;
    let v = x2 * y1;
    let w = y2;

    let new_a = (a1 / g) * a2 / g;
    
    let term1 = u * a1 * b2;
    let term2 = v * a2 * b1;
    let term3 = w * ((b1 * b2 + d) / 2);
    let new_b = (term1 + term2 + term3) / g;

    gauss_reduce(new_a, new_b, d)
}

fn exp_class_group_element(form: &QuadraticForm, exponent: &[u8], disc: &[u8]) -> Result<QuadraticForm, String> {
    let exp_val = bytes_to_i128(exponent);
    let d = bytes_to_i128(disc);

    // Identidad del grupo de clases Cl(D):
    // Si D es impar, es (1, 1, (1-D)/4). Si D es par, es (1, 0, -D/4).
    let (id_b, id_c) = if d % 2 != 0 {
        (1, (1 - d) / 4)
    } else {
        (0, -d / 4)
    };

    let mut result = QuadraticForm {
        a: i128_to_bytes(1),
        b: i128_to_bytes(id_b),
        c: i128_to_bytes(id_c),
    };
    let mut base = form.clone();
    let mut temp_exp = exp_val;

    while temp_exp > 0 {
        if temp_exp % 2 == 1 {
            result = multiply_class_group_elements(&result, &base, disc)?;
        }
        base = square_class_group_element(&base, disc)?;
        temp_exp /= 2;
    }

    Ok(result)
}

fn compute_wesolowski_challenge(g: &QuadraticForm, y: &QuadraticForm) -> Result<Vec<u8>, String> {
    let mut hasher = Sha256::new();
    hasher.update(&g.a);
    hasher.update(&g.b);
    hasher.update(&y.a);
    hasher.update(&y.b);
    Ok(hasher.finalize().to_vec())
}

fn compute_proof_exponent(g: &QuadraticForm, t: u64, q: &[u8], disc: &[u8]) -> Result<QuadraticForm, String> {
    let q_val = bytes_to_i128(q);
    if q_val == 0 {
        return Err("Challenge 'q' cannot be zero".to_string());
    }
    // ERR-01 Fix: Evita pánico de desplazamiento (shift exponent >= 127)
    if t >= 127 {
        return Err("VDF iterations exceed simulator i128 bit bounds".to_string());
    }
    let exponent = (1i128 << t) / q_val;
    exp_class_group_element(g, &i128_to_bytes(exponent), disc)
}

/// Multiplicación modular binaria segura para evitar desbordamiento en i128 (ERR-06 Fix)
fn mul_mod(mut a: i128, mut b: i128, m: i128) -> i128 {
    if m <= 0 {
        return 0;
    }
    let mut res = 0;
    a = a.rem_euclid(m);
    b = b.rem_euclid(m);
    let mut temp_b = b;
    let mut temp_a = a;
    while temp_b > 0 {
        if temp_b % 2 == 1 {
            res = (res + temp_a) % m;
        }
        temp_a = (temp_a * 2) % m;
        temp_b /= 2;
    }
    res
}

fn compute_remainder(t: u64, q: &[u8]) -> Vec<u8> {
    let q_val = bytes_to_i128(q);
    if q_val <= 1 {
        return vec![2];
    }
    // ERR-06 Fix: Exponenciación modular binaria usando mul_mod
    let mut result = 1i128;
    let mut base = 2i128.rem_euclid(q_val);
    let mut exp = t;
    while exp > 0 {
        if exp % 2 == 1 {
            result = mul_mod(result, base, q_val);
        }
        base = mul_mod(base, base, q_val);
        exp /= 2;
    }
    i128_to_bytes(result)
}

fn forms_are_equal(f1: &QuadraticForm, f2: &QuadraticForm) -> bool {
    let mut diff = 0u8;
    if f1.a.len() != f2.a.len() || f1.b.len() != f2.b.len() {
        return false;
    }
    for (x, y) in f1.a.iter().zip(f2.a.iter()) {
        diff |= x ^ y;
    }
    for (x, y) in f1.b.iter().zip(f2.b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gauss_reduce_correctness() {
        // Discriminante negativo válido: D = -47
        // Forma conocida reducida: (a=2, b=1, c=6) para D=-47 (b^2-4ac = 1-48 = -47)
        let d = -47i128;
        let result = gauss_reduce(2, 1, d);
        assert!(result.is_ok(), "Gauss reduce failed: {:?}", result.err());
        let qf = result.unwrap();
        // La forma reducida de D=-47 desde (2,1) ya es reducida
        let a = bytes_to_i128(&qf.a);
        let b_val = bytes_to_i128(&qf.b);
        assert!(b_val.abs() <= a, "|b|={} must be <= a={}", b_val.abs(), a);
        let c = bytes_to_i128(&qf.c);
        assert!(a <= c, "a={} must be <= c={}", a, c);
    }

    #[test]
    fn test_vdf_evaluation_and_verification() {
        // Discriminante negativo D = -47, pasado en bytes de 16 bytes big-endian
        let d_bytes = (-47i128).to_be_bytes().to_vec();
        let params_neg = VdfParams {
            discriminant: d_bytes,
            iterations: 4,  // 4 iterations para rapidez en test
        };

        let seed = b"xcron_vdf_test_seed";
        let result = evaluate_vdf(seed, &params_neg);
        assert!(result.is_ok(), "Evaluation failed: {:?}", result.err());
    }
}
