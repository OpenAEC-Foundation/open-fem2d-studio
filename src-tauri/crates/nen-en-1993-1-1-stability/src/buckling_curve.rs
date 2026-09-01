//! NEN-EN 1993-1-1 Tabel 6.1 + 6.2 — buckling curves and imperfection factors.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum BucklingCurve { A0, A, B, C, D }

impl BucklingCurve {
    pub fn alpha(self) -> f64 {
        match self {
            Self::A0 => 0.13, Self::A => 0.21, Self::B => 0.34,
            Self::C => 0.49, Self::D => 0.76,
        }
    }

    pub fn from_char(c: char) -> Option<Self> {
        match c {
            'a' | 'A' => Some(Self::A),
            'b' | 'B' => Some(Self::B),
            'c' | 'C' => Some(Self::C),
            'd' | 'D' => Some(Self::D),
            _ => None,
        }
    }
}

/// chi = 1 / (Phi + sqrt(Phi^2 - lambda^2)), with chi <= 1.0 (eq. 6.49)
pub fn chi(lambda_bar: f64, alpha: f64) -> f64 {
    let phi = 0.5 * (1.0 + alpha * (lambda_bar - 0.2) + lambda_bar.powi(2));
    let denom = phi + (phi.powi(2) - lambda_bar.powi(2)).sqrt();
    if denom > 0.0 { (1.0 / denom).min(1.0) } else { 1.0 }
}
