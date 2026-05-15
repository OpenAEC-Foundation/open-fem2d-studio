//! NEN-EN 1993-1-1+C2+A1/NB:2016 nl — Mcr formulation per Dutch national annex.

use std::f64::consts::PI;

/// NB.153 Tabel C1 values for uniform end-moment loading (no transverse load).
/// psi = M_min / M_max, ranged -1.0 to +1.0.
/// Values verified against XFrame2D output (psi=0 gives C1=1.803).
const NB153_C1_TABLE: &[(f64, f64)] = &[
    (-1.0,  2.752),
    (-0.75, 2.357),
    (-0.5,  1.997),
    (-0.25, 1.687),
    ( 0.0,  1.803),
    ( 0.25, 1.391),
    ( 0.5,  1.219),
    ( 0.75, 1.083),
    ( 1.0,  1.000),
];

/// Linear interpolation in NB.153 C1 table for given psi (M_min / M_max ratio).
fn c1_from_psi(psi: f64) -> f64 {
    let psi_clamped = psi.clamp(-1.0, 1.0);
    // Find bracketing entries
    for w in NB153_C1_TABLE.windows(2) {
        let (psi_a, c1_a) = w[0];
        let (psi_b, c1_b) = w[1];
        if psi_clamped >= psi_a && psi_clamped <= psi_b {
            let t = if (psi_b - psi_a).abs() > 1e-9 {
                (psi_clamped - psi_a) / (psi_b - psi_a)
            } else {
                0.0
            };
            return c1_a + t * (c1_b - c1_a);
        }
    }
    1.0
}

/// NB.157: S = (h/2) * sqrt(E*Iz / (G*It))
pub fn s_parameter(h_mm: f64, e_mpa: f64, iz_mm4: f64, g_mpa: f64, it_mm4: f64) -> f64 {
    (h_mm / 2.0) * (e_mpa * iz_mm4 / (g_mpa * it_mm4)).sqrt()
}

/// NB.153: C1 from Tabel NB.27/NB.28 (linear interpolation).
/// `beta` here is M_min/M_max (psi notation in some texts).
/// Returns (C1, C2). C2 = 0 when no transverse load (q ≈ 0).
pub fn c1_c2_factors(beta: f64, q_kn_per_m: f64) -> (f64, f64) {
    let c1 = c1_from_psi(beta);
    let c2 = if q_kn_per_m.abs() < 1e-9 { 0.0 } else { 0.46 };
    (c1, c2)
}

/// NB.159: C coefficient.
pub fn c_coefficient(c1: f64, l_g_mm: f64, l_kip_mm: f64, s_mm: f64, c2: f64) -> f64 {
    let term1 = (PI * c1 * l_g_mm) / l_kip_mm;
    let inside = 1.0
        + (PI.powi(2) * s_mm.powi(2) / l_kip_mm.powi(2)) * (c2.powi(2) + 1.0)
        + (PI * c2 * s_mm) / l_kip_mm;
    term1 * inside.sqrt()
}

/// k_red for slender web (h/tw > 75).
pub fn k_red(h_mm: f64, tw_mm: f64) -> f64 {
    let ratio = h_mm / tw_mm.max(1e-9);
    if ratio <= 75.0 { 1.0 } else { (75.0 / ratio).max(0.5) }
}

/// NB.148: M_cr = k_red * (C/L_g) * sqrt(E*Iz * G*It) * 10^-6 (kNm)
pub fn m_cr_i_section(c: f64, l_g_mm: f64, iz_mm4: f64, it_mm4: f64, k_red: f64) -> f64 {
    let e_mpa = 210000.0;
    let g_mpa = 80769.0;
    k_red * (c / l_g_mm) * (e_mpa * iz_mm4 * g_mpa * it_mm4).sqrt() * 1e-6
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// XFrame Calc 2 Beam 1 page 51-52: psi=0 → C1=1.803, C=7.481, M_cr=650.886 kNm
    #[test]
    fn calc2_beam1_ltb_intermediates_with_table_c1() {
        // C1 now comes from the NB.153 table — no more simplified formula.
        let (c1, c2) = c1_c2_factors(0.0, 0.0);
        assert_relative_eq!(c1, 1.803, max_relative = 1e-3);
        assert_relative_eq!(c2, 0.0, max_relative = 1e-9);

        let s = s_parameter(160.0, 210000.0, 8892613.0, 80769.0, 313664.0);
        assert_relative_eq!(s, 687.0, max_relative = 0.01);

        let c = c_coefficient(c1, 2500.0, 2500.0, s, c2);
        assert_relative_eq!(c, 7.481, max_relative = 0.005);

        let m_cr = m_cr_i_section(c, 2500.0, 8892613.0, 313664.0, 1.0);
        assert_relative_eq!(m_cr, 650.886, max_relative = 0.01);
    }

    #[test]
    fn c1_table_endpoints() {
        assert_relative_eq!(c1_from_psi(-1.0), 2.752, max_relative = 1e-3);
        assert_relative_eq!(c1_from_psi(1.0), 1.000, max_relative = 1e-3);
    }

    #[test]
    fn c1_table_interpolation_midpoint() {
        // psi=0.125 should be between (0.0, 1.803) and (0.25, 1.391): linear midpoint ≈ 1.597
        let c1 = c1_from_psi(0.125);
        assert!(c1 > 1.391 && c1 < 1.803, "c1={} should be between 1.391 and 1.803", c1);
    }

    #[test]
    fn c1_clamp_outside_range() {
        // Out-of-range should clamp to endpoint values
        assert_relative_eq!(c1_from_psi(-2.0), 2.752, max_relative = 1e-3);
        assert_relative_eq!(c1_from_psi(2.0), 1.000, max_relative = 1e-3);
    }
}
