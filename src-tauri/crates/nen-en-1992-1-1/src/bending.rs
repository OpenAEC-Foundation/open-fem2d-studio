//! Momentweerstand met de rechthoekige spanningsverdeling — 3.1.7(3),
//! figuur 3.5, vergelijkingen (3.19)–(3.22) — de klassieke handberekening.
//!
//! Rekverdeling bij bezwijken: ε_cu3 aan de gedrukte rand (tabel 3.1), lineair
//! naar nul op afstand x (hoogte van de drukzone). De betondrukkracht is
//!
//! ```text
//!   F_c = η · f_cd · b · λ·x          (arm t.o.v. de gedrukte rand: λ·x / 2)
//! ```
//!
//! De wapeningslagen krijgen hun rek uit de lineaire verdeling en hun spanning
//! uit het bilineaire diagram (3.2.7). Krachtenevenwicht met N_Ed levert x;
//! momentenevenwicht om het midden van de doorsnede levert M_Rd.
//!
//! Toepassingsgebied: de neutrale lijn ligt in de doorsnede (0 < x ≤ h). Staat
//! de doorsnede geheel onder druk, dan geldt het draaipunt C van figuur 6.1
//! en niet ε_cu3 aan de rand; die situatie is aan de M-N-κ-berekening
//! (`mnkappa`) overgelaten en levert hier [`StressBlockError::WhollyCompressed`].
//!
//! Voor N_Ed = 0, één trekwapeningslaag die vloeit en geen drukwapening is
//! dit exact de bekende formule
//!
//! ```text
//!   x = A_s·f_yd / (η·f_cd·b·λ),   M_Rd = A_s·f_yd·(d − λ·x/2).
//! ```
//!
//! Zelfde vereenvoudiging als in `mnkappa`: verdrongen beton bij de
//! drukwapening wordt niet afgetrokken.

use crate::section::{RebarLayer, RectConcreteSection};
use crate::stress_strain::DesignMaterial;

/// Kracht en arm van één wapeningslaag in het spanningsblok-evenwicht.
#[derive(Clone, Debug, PartialEq)]
pub struct LayerForce {
    pub label: String,
    /// Rek (druk positief), dimensieloos.
    pub eps: f64,
    /// Spanning in N/mm² (druk positief).
    pub sigma: f64,
    /// Kracht in kN (druk positief).
    pub f_kn: f64,
    /// Arm t.o.v. het midden van de doorsnede, in m; positief naar de gedrukte rand.
    pub z_m: f64,
    /// Vloeit de laag (|ε| ≥ ε_yd)?
    pub yields: bool,
}

/// Uitkomst van de spanningsblokberekening.
#[derive(Clone, Debug, PartialEq)]
pub struct StressBlockResult {
    /// Hoogte van de drukzone vanaf de gedrukte rand, mm.
    pub x_mm: f64,
    pub lambda: f64,
    pub eta: f64,
    /// Betondrukkracht in kN.
    pub f_c_kn: f64,
    /// Arm van F_c t.o.v. het midden, m: h/2 − λx/2.
    pub z_c_m: f64,
    pub layers: Vec<LayerForce>,
    /// Momentweerstand in kNm (positief getal, in de richting van het opgegeven moment).
    pub m_rd_knm: f64,
    /// Normaalkracht waarmee is gerekend (kN, trek positief).
    pub n_kn: f64,
    /// Richting van het moment (+1: trek onder / druk boven).
    pub moment_sign: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StressBlockError {
    /// Ook bij x = h is de inwendige druk kleiner dan N_Ed: geheel gedrukt.
    WhollyCompressed,
    /// Ook bij x → 0 is de inwendige trek kleiner dan |N_Ed|: trekcapaciteit overschreden.
    TensionCapacityExceeded,
    /// Geen wapening in de doorsnede.
    NoReinforcement,
}

/// Inwendige normaalkracht (N, druk positief) bij drukzonehoogte `x` (mm),
/// gemeten vanaf de gedrukte rand; `depth` per laag is de afstand van de
/// staafas tot de gedrukte rand.
fn n_internal(section: &RectConcreteSection, depths: &[(f64, f64)], mat: &DesignMaterial, x: f64) -> f64 {
    let f_c = mat.eta * mat.concrete.f_cd * section.b_mm * mat.lambda * x;
    let f_s: f64 = depths
        .iter()
        .map(|&(depth, area)| {
            let eps = mat.eps_cu3 * (1.0 - depth / x);
            area * mat.steel.sigma(eps)
        })
        .sum();
    f_c + f_s
}

/// Momentweerstand met de rechthoekige spanningsverdeling bij normaalkracht
/// `n_ed_kn` (kN, trek positief) voor een moment met teken `moment_sign`.
pub fn stress_block(
    section: &RectConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_ed_kn: f64,
    moment_sign: f64,
) -> Result<StressBlockResult, StressBlockError> {
    if layers.is_empty() {
        return Err(StressBlockError::NoReinforcement);
    }
    let sign = if moment_sign < 0.0 { -1.0 } else { 1.0 };
    let h = section.h_mm;
    // Afstand van elke laag tot de gedrukte rand: boven bij positief moment,
    // onder bij negatief moment.
    let depths: Vec<(f64, f64)> = layers
        .iter()
        .map(|l| {
            let depth = if sign > 0.0 { h - l.z_mm } else { l.z_mm };
            (depth, l.area_mm2)
        })
        .collect();
    let n_target = -n_ed_kn * 1e3;

    // Bereik van N(x): x → 0⁺ geeft alle staal op trek; x = h de grootste druk.
    let x_min = 1e-9 * h;
    let n_at_min = n_internal(section, &depths, mat, x_min);
    let n_at_h = n_internal(section, &depths, mat, h);
    if n_target > n_at_h {
        return Err(StressBlockError::WhollyCompressed);
    }
    if n_target < n_at_min {
        return Err(StressBlockError::TensionCapacityExceeded);
    }
    // N(x) is monotoon stijgend in x: bisectie.
    let mut lo = x_min;
    let mut hi = h;
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if n_internal(section, &depths, mat, mid) < n_target {
            lo = mid;
        } else {
            hi = mid;
        }
        if hi - lo < 1e-10 * h {
            break;
        }
    }
    let x = 0.5 * (lo + hi);

    let f_c = mat.eta * mat.concrete.f_cd * section.b_mm * mat.lambda * x; // N
    let z_c = (h / 2.0 - mat.lambda * x / 2.0) * 1e-3; // m
    let mut m = f_c * z_c; // N·m
    let mut lf = Vec::with_capacity(layers.len());
    for (l, &(depth, area)) in layers.iter().zip(depths.iter()) {
        let eps = mat.eps_cu3 * (1.0 - depth / x);
        let sigma = mat.steel.sigma(eps);
        let f = area * sigma; // N, druk positief
        let z = (h / 2.0 - depth) * 1e-3; // m, positief naar de gedrukte rand
        m += f * z;
        lf.push(LayerForce {
            label: l.label.clone(),
            eps,
            sigma,
            f_kn: f * 1e-3,
            z_m: z,
            yields: eps.abs() >= mat.steel.eps_yd - 1e-12,
        });
    }
    Ok(StressBlockResult {
        x_mm: x,
        lambda: mat.lambda,
        eta: mat.eta,
        f_c_kn: f_c * 1e-3,
        z_c_m: z_c,
        layers: lf,
        m_rd_knm: m * 1e-3,
        n_kn: n_ed_kn,
        moment_sign: sign,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use crate::factors::DesignSituation;
    use crate::section::{RebarRow, ReinforcementCage};
    use crate::stress_strain::SteelBranch;
    use approx::assert_relative_eq;

    fn mat() -> DesignMaterial {
        DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
        )
    }

    #[test]
    fn enkelvoudig_gewapend_is_de_bekende_formule() {
        // b = 300, h = 500, 3Ø16 onder (A_s = 603,19 mm²), d = 454 mm,
        // f_cd = 20, f_yd = 434,78 N/mm², λ = 0,8, η = 1,0:
        //   x = 603,19·434,78 / (1,0·20·300·0,8) = 54,64 mm
        //   M_Rd = 603,19·434,78·(454 − 0,4·54,64) = 113,33 kNm
        let s = RectConcreteSection::new(300.0, 500.0);
        let k = ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 0, diameter_mm: 12.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        };
        let r = stress_block(&s, &k.layers(500.0), &mat(), 0.0, 1.0).unwrap();
        let a_s = 3.0 * std::f64::consts::PI * 64.0;
        let f_yd = 500.0 / 1.15;
        let x = a_s * f_yd / (1.0 * 20.0 * 300.0 * 0.8);
        let m_rd = a_s * f_yd * (454.0 - 0.4 * x) * 1e-6;
        assert_relative_eq!(r.x_mm, x, max_relative = 1e-6);
        assert_relative_eq!(r.m_rd_knm, m_rd, max_relative = 1e-6);
        assert!(r.layers[0].yields);
        assert!(r.layers[0].f_kn < 0.0, "trekwapening: kracht negatief (druk positief)");
    }

    #[test]
    fn geheel_gedrukt_wordt_geweigerd() {
        let s = RectConcreteSection::new(300.0, 500.0);
        let k = ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        };
        let r = stress_block(&s, &k.layers(500.0), &mat(), -3000.0, 1.0);
        assert_eq!(r, Err(StressBlockError::WhollyCompressed));
        let r = stress_block(&s, &k.layers(500.0), &mat(), 1000.0, 1.0);
        assert_eq!(r, Err(StressBlockError::TensionCapacityExceeded));
    }
}
