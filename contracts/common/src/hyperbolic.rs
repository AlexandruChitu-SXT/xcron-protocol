use crate::lns::{to_lns, from_lns, lns_add, LNS_SCALE_BITS};

/// A point in the Poincaré unit disk model: D = { (x,y) in R^2 : x^2 + y^2 < 1 }
/// Coordinates are stored as 16-bit fixed-point integers (scaled by 2^16 = 65536).
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct PoincarePoint {
    pub x: i64,
    pub y: i64,
}

impl PoincarePoint {
    pub fn new(x: i64, y: i64) -> Self {
        // Enforce the point lies strictly inside the unit disk
        let norm_sq = x * x + y * y;
        let limit = 1i64 << 32;
        assert!(norm_sq < limit, "Point must lie strictly inside the Poincaré unit disk (norm^2 < 1)");
        Self { x, y }
    }
}

/// Calculate the hyperbolic distance between two points in the Poincaré disk model using LNS:
/// d_H(u, v) = arcosh( 1 + 2 * |u - v|^2 / ((1 - |u|^2) * (1 - |v|^2)) )
/// Output is returned as a 16-bit fixed-point integer (scaled by 65536).
pub fn hyperbolic_distance(u: PoincarePoint, v: PoincarePoint) -> u64 {
    let dx = u.x - v.x;
    let dy = u.y - v.y;
    let dist_sq_scaled = (dx * dx + dy * dy) as u64;

    if dist_sq_scaled == 0 {
        return 0;
    }

    // 1. Numerador: 2 * |u - v|^2
    // dx^2 + dy^2 está en escala 2^32. El numerador real es 2 * (dist_sq / 2^32) = dist_sq / 2^31.
    // Representamos el numerador en LNS con escala de 16 bits (log2 + 16):
    // L_num = to_lns(dist_sq) - 31 + 16 = to_lns(dist_sq) - 15
    let l_num = to_lns(dist_sq_scaled) - (15 << LNS_SCALE_BITS);

    // 2. Denominador: (1 - |u|^2) * (1 - |v|^2)
    // Cada componente está en escala 2^32.
    // L_u_den (en escala 16 bits) = to_lns(1 - |u|^2) - 16
    let one_minus_u_sq = (1i64 << 32) - (u.x * u.x + u.y * u.y);
    let one_minus_v_sq = (1i64 << 32) - (v.x * v.x + v.y * v.y);

    let l_u_den = to_lns(one_minus_u_sq as u64) - (16 << LNS_SCALE_BITS);
    let l_v_den = to_lns(one_minus_v_sq as u64) - (16 << LNS_SCALE_BITS);
    let l_den = l_u_den + l_v_den;

    // 3. Fracción en LNS: l_num (escala 16) - l_den (escala 32) = l_frac (escala -16)
    let l_frac = l_num - l_den;

    // Escalamos a 16 bits sumando 32 (log2 + 16)
    let l_frac_scaled = l_frac + (32 << LNS_SCALE_BITS);

    // Convertimos de vuelta al dominio real de punto fijo (escalado por 2^16)
    let frac_real_scaled = from_lns(l_frac_scaled) as i64;
    let x_scaled = (1i64 << LNS_SCALE_BITS) + frac_real_scaled;

    if x_scaled <= (1i64 << LNS_SCALE_BITS) {
        return 0;
    }

    // 4. Calcular arcosh(X) = ln(X + sqrt(X^2 - 1))
    // X^2 - 1 en escala 2^16:
    let x_sq_scaled = (x_scaled * x_scaled) >> LNS_SCALE_BITS;
    let x_sq_minus_1_scaled = x_sq_scaled - (1i64 << LNS_SCALE_BITS);

    if x_sq_minus_1_scaled <= 0 {
        return 0;
    }

    // Convertimos a LNS para la raíz cuadrada
    let l_sqrt_arg = to_lns(x_sq_minus_1_scaled as u64);
    // sqrt es >> 1. Como l_sqrt_arg tiene escala 16, al dividir por 2 nos queda escala 8.
    // Sumamos 8 para restaurar la escala de 16 bits (log2 + 16)
    let l_sqrt = (l_sqrt_arg >> 1) + (8 << LNS_SCALE_BITS);

    let l_x = to_lns(x_scaled as u64);
    
    // Suma en LNS: X + sqrt(X^2 - 1)
    let l_sum = lns_add(l_x, l_sqrt);

    // Convertir de log2 a ln: ln(z) = (log2(z) - 16) * ln(2)
    let l_pure = l_sum - (16 << LNS_SCALE_BITS);
    
    // Multiplicamos por ln(2) * 65536 = 45426
    let res = (l_pure * 45426) >> 16;

    res as u64
}

#[cfg(test)]
mod tests {
extern crate std;
    use super::*;
    #[test]
    fn test_zero_distance() {
        let p = PoincarePoint::new(0, 0);
        assert_eq!(hyperbolic_distance(p, p), 0);
    }

    #[test]
    fn test_hyperbolic_distance_mid() {
        // u=(0,0) y v=(0.5, 0) -> d_H = arcosh(1.6666) = ln(3) = 1.098612
        // Escalado: 1.098612 * 65536 = 71998
        let u = PoincarePoint::new(0, 0);
        let v = PoincarePoint::new(32768, 0); // 0.5 in fixed-point
        
        let d = hyperbolic_distance(u, v);
        let expected = 71998;
        let diff = if d > expected { d - expected } else { expected - d };
        assert!(diff <= 500, "Distance calculation failed: got {}, expected {}", d, expected);
    }

    #[test]
    fn demo_multiple_points() {
        // Punto A (0,0)
        let a = PoincarePoint::new(0, 0);
        // Punto B (0.3, 0.4) → 0.3*65536≈19660, 0.4*65536≈26214
        let b = PoincarePoint::new(19660, 26214);
        // Punto C (-0.6, 0.2) → -0.6*65536≈-39322, 0.2*65536≈13107
        let c = PoincarePoint::new(-39322, 13107);

        let d_ab = hyperbolic_distance(a, b);
        let d_ac = hyperbolic_distance(a, c);
        let d_bc = hyperbolic_distance(b, c);

        std::println!("dist(A,B) fixed = {}, float = {:.6}", d_ab, d_ab as f64 / 65536.0);
        std::println!("dist(A,C) fixed = {}, float = {:.6}", d_ac, d_ac as f64 / 65536.0);
        std::println!("dist(B,C) fixed = {}, float = {:.6}", d_bc, d_bc as f64 / 65536.0);
    }
}

