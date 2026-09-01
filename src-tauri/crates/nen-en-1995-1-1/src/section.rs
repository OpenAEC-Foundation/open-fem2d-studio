//! Rechthoekige houten doorsnede — afgeleide grootheden.
//!
//! Verificatie: alle afgeleiden zijn getoetst aan de profieltabel van de
//! referentie-uitwerking (96 x 450): A = 43200 mm2, W_y = 3,24e6 mm3,
//! I_y = 7,29e8 mm4, i_y = 129,9 mm, S_y = 2,43e6 mm3, W_z = 691200 mm3,
//! I_z = 33.177.600 mm4, i_z = 27,7 mm.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Rechthoek b x h. Conventie conform de referentie-uitwerking:
/// `b` = breedte (dwars op het buigvlak om y), `h` = hoogte.
/// Buiging om y = sterke as.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
pub struct RectTimberSection {
    pub b_mm: f64,
    pub h_mm: f64,
}

impl RectTimberSection {
    pub fn new(b_mm: f64, h_mm: f64) -> Self {
        Self { b_mm, h_mm }
    }

    /// Oppervlakte A = b·h (mm2).
    pub fn area_mm2(&self) -> f64 {
        self.b_mm * self.h_mm
    }

    /// Elastisch weerstandsmoment sterke as W_y = b·h²/6 (mm3).
    pub fn w_y_mm3(&self) -> f64 {
        self.b_mm * self.h_mm * self.h_mm / 6.0
    }

    /// Elastisch weerstandsmoment zwakke as W_z = h·b²/6 (mm3).
    pub fn w_z_mm3(&self) -> f64 {
        self.h_mm * self.b_mm * self.b_mm / 6.0
    }

    /// Traagheidsmoment sterke as I_y = b·h³/12 (mm4).
    pub fn i_y_mm4(&self) -> f64 {
        self.b_mm * self.h_mm.powi(3) / 12.0
    }

    /// Traagheidsmoment zwakke as I_z = h·b³/12 (mm4).
    pub fn i_z_mm4(&self) -> f64 {
        self.h_mm * self.b_mm.powi(3) / 12.0
    }

    /// Traagheidsstraal sterke as i_y = h/√12 (mm).
    pub fn radius_y_mm(&self) -> f64 {
        self.h_mm / 12.0_f64.sqrt()
    }

    /// Traagheidsstraal zwakke as i_z = b/√12 (mm).
    pub fn radius_z_mm(&self) -> f64 {
        self.b_mm / 12.0_f64.sqrt()
    }

    /// Statisch moment van de halve doorsnede S_y = b·h²/8 (mm3),
    /// voor de schuifspanning tau = V·S/(I·b).
    pub fn s_y_mm3(&self) -> f64 {
        self.b_mm * self.h_mm * self.h_mm / 8.0
    }

    /// Profielnaam zoals in de referentie-uitwerking ("96 x 450").
    pub fn name(&self) -> String {
        format!("{:.0} x {:.0}", self.b_mm, self.h_mm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn profiel_96x450_referentiewaarden() {
        let s = RectTimberSection::new(96.0, 450.0);
        assert_relative_eq!(s.area_mm2(), 43200.0);
        assert_relative_eq!(s.w_y_mm3(), 3.24e6);
        assert_relative_eq!(s.w_z_mm3(), 691200.0);
        assert_relative_eq!(s.i_y_mm4(), 7.29e8);
        assert_relative_eq!(s.i_z_mm4(), 33_177_600.0);
        assert_relative_eq!(s.radius_y_mm(), 129.9, max_relative = 1e-3);
        assert_relative_eq!(s.radius_z_mm(), 27.7, max_relative = 1e-3);
        assert_relative_eq!(s.s_y_mm3(), 2.43e6);
        assert_eq!(s.name(), "96 x 450");
    }
}
