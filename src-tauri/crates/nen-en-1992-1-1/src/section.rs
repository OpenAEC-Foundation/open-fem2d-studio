//! Rechthoekige betondoorsnede en wapeningskorf.
//!
//! De korf is beschreven zoals een constructeur hem opgeeft: dekking,
//! beugeldiameter, en per zijde het aantal en de diameter van de
//! hoofdwapening. Daaruit volgt de ligging van de staafassen:
//!
//! ```text
//!   afstand staafas tot betonrand = c_nom + Ø_beugel + Ø_hoofd / 2
//! ```
//!
//! Alle maten in mm. De lengteas `z` loopt van de onderrand (z = 0) naar de
//! bovenrand (z = h).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Rechthoekige doorsnede b × h.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RectConcreteSection {
    pub b_mm: f64,
    pub h_mm: f64,
}

impl RectConcreteSection {
    pub fn new(b_mm: f64, h_mm: f64) -> Self {
        Self { b_mm, h_mm }
    }

    pub fn area_mm2(&self) -> f64 {
        self.b_mm * self.h_mm
    }

    /// Naam zoals in het rapport: "300 x 500".
    pub fn name(&self) -> String {
        format!("{} x {}", fmt_mm(self.b_mm), fmt_mm(self.h_mm))
    }
}

fn fmt_mm(v: f64) -> String {
    if (v - v.round()).abs() < 1e-9 {
        format!("{}", v.round() as i64)
    } else {
        format!("{v:.1}")
    }
}

/// Eén rij hoofdwapening: aantal staven en diameter.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct RebarRow {
    pub count: u32,
    pub diameter_mm: f64,
}

impl RebarRow {
    /// Totale staaldoorsnede van de rij in mm².
    pub fn area_mm2(&self) -> f64 {
        self.count as f64 * std::f64::consts::PI * (self.diameter_mm / 2.0).powi(2)
    }

    pub fn is_empty(&self) -> bool {
        self.count == 0 || self.diameter_mm <= 0.0
    }

    /// "3Ø16" of "—".
    pub fn label(&self) -> String {
        if self.is_empty() {
            "—".to_string()
        } else {
            format!("{}Ø{}", self.count, fmt_mm(self.diameter_mm))
        }
    }
}

/// Wapeningskorf: dekking, beugel, boven- en onderwapening.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ReinforcementCage {
    /// Nominale betondekking c_nom op de beugel, in mm (§4.4.1).
    pub cover_mm: f64,
    /// Beugeldiameter in mm (0 = geen beugel; de hoofdwapening ligt dan direct
    /// achter de dekking).
    pub stirrup_diameter_mm: f64,
    /// Bovenwapening (aan de zijde z = h).
    pub top: RebarRow,
    /// Onderwapening (aan de zijde z = 0).
    pub bottom: RebarRow,
}

/// Eén wapeningslaag in de doorsnedeberekening: ligging en oppervlakte.
#[derive(Clone, Debug, PartialEq)]
pub struct RebarLayer {
    /// Afstand van de staafas tot de onderrand, in mm.
    pub z_mm: f64,
    pub area_mm2: f64,
    /// "onder 3Ø16" / "boven 2Ø12".
    pub label: String,
}

impl ReinforcementCage {
    /// Afstand van de staafas van een rij tot de betonrand waar hij tegenaan ligt.
    pub fn axis_offset_mm(&self, row: &RebarRow) -> f64 {
        self.cover_mm + self.stirrup_diameter_mm + row.diameter_mm / 2.0
    }

    /// Nuttige hoogte d van de onderwapening (voor positief moment), mm.
    pub fn d_mm(&self, h_mm: f64) -> f64 {
        h_mm - self.axis_offset_mm(&self.bottom)
    }

    /// Afstand d₂ van de bovenwapening tot de bovenrand, mm.
    pub fn d2_mm(&self) -> f64 {
        self.axis_offset_mm(&self.top)
    }

    pub fn a_s_bottom_mm2(&self) -> f64 {
        self.bottom.area_mm2()
    }

    pub fn a_s_top_mm2(&self) -> f64 {
        self.top.area_mm2()
    }

    /// De wapeningslagen voor de doorsnedeberekening. Lege rijen (0 staven)
    /// leveren geen laag.
    pub fn layers(&self, h_mm: f64) -> Vec<RebarLayer> {
        let mut lagen = Vec::with_capacity(2);
        if !self.bottom.is_empty() {
            lagen.push(RebarLayer {
                z_mm: self.axis_offset_mm(&self.bottom),
                area_mm2: self.bottom.area_mm2(),
                label: format!("onder {}", self.bottom.label()),
            });
        }
        if !self.top.is_empty() {
            lagen.push(RebarLayer {
                z_mm: h_mm - self.axis_offset_mm(&self.top),
                area_mm2: self.top.area_mm2(),
                label: format!("boven {}", self.top.label()),
            });
        }
        lagen
    }

    /// "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm".
    pub fn summary(&self) -> String {
        let beugel = if self.stirrup_diameter_mm > 0.0 {
            format!("beugel Ø{}", fmt_mm(self.stirrup_diameter_mm))
        } else {
            "geen beugel".to_string()
        };
        format!(
            "onder {}, boven {}, {}, dekking {} mm",
            self.bottom.label(),
            self.top.label(),
            beugel,
            fmt_mm(self.cover_mm)
        )
    }

    /// Controleer of de korf in de doorsnede past. Geen normtoets — alleen
    /// geometrie: negatieve maten, staven die elkaar of de tegenoverliggende
    /// rand raken, of een doorsnede zonder wapening.
    pub fn validate(&self, section: &RectConcreteSection) -> Result<(), String> {
        if section.b_mm <= 0.0 || section.h_mm <= 0.0 {
            return Err("doorsnedeafmetingen moeten positief zijn".into());
        }
        if self.cover_mm < 0.0 || self.stirrup_diameter_mm < 0.0 {
            return Err("dekking en beugeldiameter mogen niet negatief zijn".into());
        }
        if self.bottom.is_empty() && self.top.is_empty() {
            return Err("de korf bevat geen hoofdwapening".into());
        }
        for (naam, rij) in [("onderwapening", &self.bottom), ("bovenwapening", &self.top)] {
            if rij.is_empty() {
                continue;
            }
            let binnenbreedte = section.b_mm - 2.0 * (self.cover_mm + self.stirrup_diameter_mm);
            let benodigd = rij.count as f64 * rij.diameter_mm;
            if benodigd > binnenbreedte + 1e-9 {
                return Err(format!(
                    "{naam} {} past niet in de breedte: {benodigd:.0} mm staal in {binnenbreedte:.0} mm binnenmaat",
                    rij.label()
                ));
            }
        }
        let onder = if self.bottom.is_empty() { 0.0 } else { self.axis_offset_mm(&self.bottom) };
        let boven = if self.top.is_empty() { 0.0 } else { self.axis_offset_mm(&self.top) };
        if onder + boven >= section.h_mm {
            return Err("boven- en onderwapening overlappen elkaar in de hoogte".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    fn korf() -> ReinforcementCage {
        ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        }
    }

    #[test]
    fn ligging_en_oppervlakten() {
        let k = korf();
        // 3Ø16: 3 · π · 8² = 603,19 mm²; 2Ø12: 226,19 mm².
        assert_relative_eq!(k.a_s_bottom_mm2(), 603.186, max_relative = 1e-4);
        assert_relative_eq!(k.a_s_top_mm2(), 226.195, max_relative = 1e-4);
        // d = 500 − (30 + 8 + 8) = 454 mm; d₂ = 30 + 8 + 6 = 44 mm.
        assert_relative_eq!(k.d_mm(500.0), 454.0);
        assert_relative_eq!(k.d2_mm(), 44.0);
        let lagen = k.layers(500.0);
        assert_eq!(lagen.len(), 2);
        assert_relative_eq!(lagen[0].z_mm, 46.0);
        assert_relative_eq!(lagen[1].z_mm, 456.0);
        assert_eq!(lagen[0].label, "onder 3Ø16");
        assert_eq!(k.summary(), "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm");
        assert_eq!(RectConcreteSection::new(300.0, 500.0).name(), "300 x 500");
    }

    #[test]
    fn validatie() {
        let s = RectConcreteSection::new(300.0, 500.0);
        assert!(korf().validate(&s).is_ok());
        let mut te_breed = korf();
        te_breed.bottom = RebarRow { count: 20, diameter_mm: 16.0 };
        assert!(te_breed.validate(&s).is_err());
        let mut leeg = korf();
        leeg.top.count = 0;
        leeg.bottom.count = 0;
        assert!(leeg.validate(&s).is_err());
        let mut alleen_onder = korf();
        alleen_onder.top.count = 0;
        assert!(alleen_onder.validate(&s).is_ok());
        assert_eq!(alleen_onder.layers(500.0).len(), 1);
    }
}
