//! NEN-EN 1993-1-1 tabel 6.1 (imperfectiefactoren per knikkromme) en tabel 6.2
//! (welke knikkromme bij welke doorsnede hoort).
//!
//! [`BucklingCurve::alpha`] bedient twee tabellen tegelijk: tabel 6.1 koppelt
//! de KOLOMKNIK-krommen a₀/a/b/c/d aan α = 0,13 / 0,21 / 0,34 / 0,49 / 0,76, en
//! tabel 6.3 koppelt de KIP-krommen a/b/c/d aan diezelfde α_LT = 0,21 / 0,34 /
//! 0,49 / 0,76. De getallen vallen samen, de tabellen niet: wélke kromme bij
//! een doorsnede hoort verschilt per verschijnsel — tabel 6.2 voor kolomknik,
//! tabel 6.4/6.5 voor kip. De aanroeper kiest de kromme en citeert de tabel die
//! daarbij hoort; zie `nen_en_1993_1_1_ltb::kipkromme_tabel_6_5`.

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
