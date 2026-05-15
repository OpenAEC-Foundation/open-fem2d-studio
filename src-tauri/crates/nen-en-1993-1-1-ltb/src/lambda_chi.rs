//! Lambda_LT + chi_LT helpers + unbraced length resolution.

use crate::LateralBracing;

pub fn unbraced_length_mm(length_m: f64, bracing: &LateralBracing) -> f64 {
    let length_mm = length_m * 1000.0;
    if bracing.top_flange_positions.is_empty() {
        return length_mm;
    }
    let mut positions: Vec<f64> = std::iter::once(0.0)
        .chain(bracing.top_flange_positions.iter().copied().map(|f| f * length_mm))
        .chain(std::iter::once(length_mm))
        .collect();
    positions.sort_by(|a, b| a.partial_cmp(b).unwrap());
    positions.windows(2).map(|w| w[1] - w[0]).fold(0.0_f64, f64::max)
}

pub fn lambda_lt(wpl_y_mm3: f64, fy_mpa: f64, m_cr_knm: f64) -> f64 {
    if m_cr_knm <= 0.0 { return f64::INFINITY; }
    let m_cr_nmm = m_cr_knm * 1e6;
    (wpl_y_mm3 * fy_mpa / m_cr_nmm).sqrt()
}

pub fn chi_lt(lambda_lt: f64, alpha_lt: f64) -> f64 {
    let beta = 0.75;
    let lambda_lt_0 = 0.4;
    let phi = 0.5 * (1.0 + alpha_lt * (lambda_lt - lambda_lt_0) + beta * lambda_lt.powi(2));
    let denom = phi + (phi.powi(2) - beta * lambda_lt.powi(2)).sqrt();
    if denom > 0.0 {
        let chi = 1.0 / denom;
        chi.min(1.0).min(1.0 / lambda_lt.powi(2))
    } else {
        1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn calc2_beam1_lambda_lt() {
        let l = lambda_lt(354113.0, 235.0, 650.886);
        assert_relative_eq!(l, 0.358, max_relative = 0.01);
    }

    #[test]
    fn calc2_beam1_chi_lt_below_lambda_0() {
        let chi = chi_lt(0.5, 0.34);
        assert!(chi > 0.9 && chi <= 1.0);
    }
}
