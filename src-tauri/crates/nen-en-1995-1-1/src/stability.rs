//! §6.3.2 kolomknik en §6.3.3 kipstabiliteit.
//!
//! Verificatie: alle tussenwaarden en unity checks zijn getoetst aan de
//! uitgewerkte berekening van de referentie-uitwerking (staaf 2, C24 96x450):
//! lambda_y = 48,82 → lambda_rel,y = 0,828; lambda_z = 45,77 →
//! lambda_rel,z = 0,776; k_y = 0,90; k_c,y = 0,81; k_z = 0,85; k_c,z = 0,84;
//! (6.23) = 1,64; (6.24) = 1,18; sigma_m,crit = 93,2 N/mm2;
//! lambda_rel,m = 0,507 → k_crit = 1,00; (6.35) = 2,40.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, UnityCheck};
use nen_en_1993_1_1_stability::StabilityCalc;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::bending::sigma_m_mpa;
use crate::compression::sigma_axial_mpa;
use crate::section::RectTimberSection;

// ---------------------------------------------------------------------------
// §6.3.2 — kolomknik
// ---------------------------------------------------------------------------

/// Slankheid lambda = L_cr / i.
pub fn slenderness(l_cr_mm: f64, radius_mm: f64) -> f64 {
    if radius_mm <= 0.0 {
        return 0.0;
    }
    l_cr_mm / radius_mm
}

/// Relatieve slankheid, vergelijkingen (6.21)/(6.22):
/// lambda_rel = (lambda / pi) · sqrt(f_c,0,k / E_0,05).
pub fn lambda_rel(lambda: f64, f_c0k: f64, e0_05: f64) -> f64 {
    if e0_05 <= 0.0 {
        return 0.0;
    }
    lambda / std::f64::consts::PI * (f_c0k / e0_05).sqrt()
}

/// Instabiliteitsfactor k, vergelijkingen (6.27)/(6.28):
/// k = 0,5·(1 + beta_c·(lambda_rel − 0,3) + lambda_rel²).
pub fn k_factor(lambda_rel: f64, beta_c: f64) -> f64 {
    0.5 * (1.0 + beta_c * (lambda_rel - 0.3) + lambda_rel * lambda_rel)
}

/// Knikfactor k_c, vergelijkingen (6.25)/(6.26):
/// k_c = 1 / (k + sqrt(k² − lambda_rel²)), afgekapt op 1,0.
pub fn k_c(k: f64, lambda_rel: f64) -> f64 {
    let discr = k * k - lambda_rel * lambda_rel;
    let kc = 1.0 / (k + discr.max(0.0).sqrt());
    kc.min(1.0)
}

/// Invoer voor de kolomkniktoets §6.3.2.
#[derive(Clone, Copy, Debug)]
pub struct ColumnStabilityInput {
    pub l_cr_y_mm: f64,
    pub l_cr_z_mm: f64,
    pub f_c0k_mpa: f64,
    pub e0_05_mpa: f64,
    pub beta_c: f64,
    pub f_c0d_mpa: f64,
    pub f_myd_mpa: f64,
    pub f_mzd_mpa: f64,
    pub k_m: f64,
}

/// §6.3.2: druk of gecombineerde druk en buiging met kniktoeslag.
///
/// Wanneer lambda_rel,y én lambda_rel,z <= 0,3 geldt §6.3.2(3) en worden
/// (6.19)/(6.20) gebruikt (kwadratische drukterm, geen k_c); anders
/// (6.23)/(6.24). UC = maximum van beide vergelijkingen.
pub fn check_column_stability(
    section: &RectTimberSection,
    input: &ColumnStabilityInput,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let n_ed = force_state.forces.n_ed;
    let sigma_c = sigma_axial_mpa(n_ed, section.area_mm2());
    let sigma_my = sigma_m_mpa(force_state.forces.my_ed, section.w_y_mm3());
    let sigma_mz = sigma_m_mpa(force_state.forces.mz_ed, section.w_z_mm3());

    let lambda_y = slenderness(input.l_cr_y_mm, section.radius_y_mm());
    let lambda_z = slenderness(input.l_cr_z_mm, section.radius_z_mm());
    let lambda_rel_y = lambda_rel(lambda_y, input.f_c0k_mpa, input.e0_05_mpa);
    let lambda_rel_z = lambda_rel(lambda_z, input.f_c0k_mpa, input.e0_05_mpa);
    let k_y = k_factor(lambda_rel_y, input.beta_c);
    let k_z = k_factor(lambda_rel_z, input.beta_c);
    let k_c_y = k_c(k_y, lambda_rel_y);
    let k_c_z = k_c(k_z, lambda_rel_z);

    let term_c_y = sigma_c / (k_c_y * input.f_c0d_mpa);
    let term_c_z = sigma_c / (k_c_z * input.f_c0d_mpa);
    let term_my = if input.f_myd_mpa > 0.0 { sigma_my / input.f_myd_mpa } else { 0.0 };
    let term_mz = if input.f_mzd_mpa > 0.0 { sigma_mz / input.f_mzd_mpa } else { 0.0 };

    let low_slenderness = lambda_rel_y <= 0.3 && lambda_rel_z <= 0.3;
    let (eq_a, eq_b, formula, article) = if low_slenderness {
        // §6.3.2(3) → (6.19)/(6.20): kwadratische drukterm zonder k_c.
        let ratio_c = sigma_c / input.f_c0d_mpa;
        (
            ratio_c * ratio_c + term_my + input.k_m * term_mz,
            ratio_c * ratio_c + input.k_m * term_my + term_mz,
            r"\left(\frac{\sigma_{c,0,d}}{f_{c,0,d}}\right)^2 + \frac{\sigma_{m,y,d}}{f_{m,y,d}} + k_m\frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string(),
            "art. 6.3.2 (6.19)(6.20)".to_string(),
        )
    } else {
        (
            term_c_y + term_my + input.k_m * term_mz,
            term_c_z + input.k_m * term_my + term_mz,
            r"\frac{\sigma_{c,0,d}}{k_{c,y} f_{c,0,d}} + \frac{\sigma_{m,y,d}}{f_{m,y,d}} + k_m\frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string(),
            "art. 6.3.2 (6.23)(6.24)".to_string(),
        )
    };
    let uc = eq_a.max(eq_b);

    let status = if n_ed >= 0.0 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    StabilityCalc {
        id: "6.3.2_column_stability".to_string(),
        title: "Kolomknik (druk en buiging)".to_string(),
        article,
        force_state,
        formula_latex: formula,
        variables: vec![
            NamedValue { symbol: r"\sigma_{c,0,d}".to_string(), value: sigma_c, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{m,y,d}".to_string(), value: sigma_my, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{m,z,d}".to_string(), value: sigma_mz, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{c,0,d}".to_string(), value: input.f_c0d_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{m,y,d}".to_string(), value: input.f_myd_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{m,z,d}".to_string(), value: input.f_mzd_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: "k_m".to_string(), value: input.k_m, unit: "-".to_string() },
            NamedValue { symbol: r"L_{cr,y}".to_string(), value: input.l_cr_y_mm, unit: "mm".to_string() },
            NamedValue { symbol: r"L_{cr,z}".to_string(), value: input.l_cr_z_mm, unit: "mm".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: r"\lambda_y".to_string(), value: lambda_y, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_z".to_string(), value: lambda_z, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_{rel,y}".to_string(), value: lambda_rel_y, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_{rel,z}".to_string(), value: lambda_rel_z, unit: "-".to_string() },
            NamedValue { symbol: "k_y".to_string(), value: k_y, unit: "-".to_string() },
            NamedValue { symbol: "k_z".to_string(), value: k_z, unit: "-".to_string() },
            NamedValue { symbol: r"k_{c,y}".to_string(), value: k_c_y, unit: "-".to_string() },
            NamedValue { symbol: r"k_{c,z}".to_string(), value: k_c_z, unit: "-".to_string() },
            NamedValue { symbol: "(6.23)".to_string(), value: eq_a, unit: "-".to_string() },
            NamedValue { symbol: "(6.24)".to_string(), value: eq_b, unit: "-".to_string() },
        ],
        value: uc,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: uc,
            rd: 1.0,
            uc,
            formula_latex: r"\max\left[(6.23), (6.24)\right]".to_string(),
        }),
        status,
        notes: vec![],
    }
}

// ---------------------------------------------------------------------------
// §6.3.3 — kipstabiliteit
// ---------------------------------------------------------------------------

/// Belastinggeval voor de effectieve kiplengte (tabel 6.1).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum LtbLoadCase {
    /// Vrij opgelegd, constant moment: l_ef/l = 1,0.
    ConstantMoment,
    /// Vrij opgelegd, gelijkmatig verdeelde belasting: l_ef/l = 0,9.
    UniformLoad,
    /// Vrij opgelegd, puntlast in het midden: l_ef/l = 0,8.
    ConcentratedMidspan,
    /// Uitkraging, gelijkmatig verdeelde belasting: l_ef/l = 0,5.
    CantileverUniform,
    /// Uitkraging, puntlast aan het vrije einde: l_ef/l = 0,8.
    CantileverConcentratedEnd,
}

/// Aangrijpingspunt van de belasting t.o.v. het zwaartepunt (tabel 6.1,
/// voetnoot): drukzijde → l_ef + 2h; trekzijde → l_ef − 0,5h.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum LtbLoadPosition {
    CentreOfGravity,
    CompressionEdge,
    TensionEdge,
}

/// Effectieve kiplengte volgens tabel 6.1: l_ef = ratio·l, daarna
/// gecorrigeerd voor het aangrijpingspunt van de belasting.
///
/// LET OP: de referentie-uitwerking print "l_ef = 0,9·1268 = 1142" gevolgd
/// door "l_ef = l_ef + 2h = 1142 + 2·450 = 1268", wat rekenkundig niet klopt
/// (1142 + 900 = 2042); zij rekent feitelijk met l_ef = 1268 mm (= de
/// kipsteunafstand). Deze functie implementeert tabel 6.1 zoals afgedrukt in
/// de normtekst; wie het referentiegedrag wil reproduceren geeft l_ef
/// rechtstreeks op (zie `check_beam_stability`).
pub fn effective_length_mm(l_mm: f64, case: LtbLoadCase, position: LtbLoadPosition, h_mm: f64) -> f64 {
    let ratio = match case {
        LtbLoadCase::ConstantMoment => 1.0,
        LtbLoadCase::UniformLoad => 0.9,
        LtbLoadCase::ConcentratedMidspan => 0.8,
        LtbLoadCase::CantileverUniform => 0.5,
        LtbLoadCase::CantileverConcentratedEnd => 0.8,
    };
    let base = ratio * l_mm;
    match position {
        LtbLoadPosition::CentreOfGravity => base,
        LtbLoadPosition::CompressionEdge => base + 2.0 * h_mm,
        LtbLoadPosition::TensionEdge => (base - 0.5 * h_mm).max(0.0),
    }
}

/// Kritieke buigspanning voor een rechthoekige naaldhoutdoorsnede,
/// vergelijking (6.32): sigma_m,crit = 0,78·b² / (h·l_ef) · E_0,05.
pub fn sigma_m_crit_rect_mpa(section: &RectTimberSection, l_ef_mm: f64, e0_05_mpa: f64) -> f64 {
    if section.h_mm <= 0.0 || l_ef_mm <= 0.0 {
        return 0.0;
    }
    0.78 * section.b_mm * section.b_mm / (section.h_mm * l_ef_mm) * e0_05_mpa
}

/// Relatieve kipslankheid, vergelijking (6.30):
/// lambda_rel,m = sqrt(f_m,k / sigma_m,crit).
pub fn lambda_rel_m(f_mk_mpa: f64, sigma_m_crit_mpa: f64) -> f64 {
    if sigma_m_crit_mpa <= 0.0 {
        return f64::INFINITY;
    }
    (f_mk_mpa / sigma_m_crit_mpa).sqrt()
}

/// Kipfactor k_crit, vergelijking (6.34):
/// lambda_rel,m <= 0,75 → 1,0; 0,75 < lambda_rel,m <= 1,4 →
/// 1,56 − 0,75·lambda_rel,m; > 1,4 → 1/lambda_rel,m².
pub fn k_crit(lambda_rel_m: f64) -> f64 {
    if lambda_rel_m <= 0.75 {
        1.0
    } else if lambda_rel_m <= 1.4 {
        1.56 - 0.75 * lambda_rel_m
    } else {
        1.0 / (lambda_rel_m * lambda_rel_m)
    }
}

/// Invoer voor de kiptoets §6.3.3.
#[derive(Clone, Copy, Debug)]
pub struct BeamStabilityInput {
    /// Effectieve kiplengte l_ef in mm (kipsteunafstand na tabel 6.1-correctie).
    pub l_ef_mm: f64,
    /// Kniklengte voor knik om z binnen het kipveld (voor de drukterm in 6.35).
    pub l_cr_z_mm: f64,
    pub f_mk_mpa: f64,
    pub f_c0k_mpa: f64,
    pub e0_05_mpa: f64,
    pub beta_c: f64,
    pub f_myd_mpa: f64,
    pub f_c0d_mpa: f64,
}

/// §6.3.3: kip bij zuivere buiging (6.33) of buiging + druk (6.35).
///
/// Zuivere buiging: sigma_m,d <= k_crit · f_m,d (6.33).
/// Met drukkracht:  (sigma_m,d / (k_crit·f_m,d))² + sigma_c,d / (k_c,z·f_c,0,d)
/// <= 1 (6.35), met k_c,z volgens §6.3.2 voor knik om de zwakke as.
pub fn check_beam_stability(
    section: &RectTimberSection,
    input: &BeamStabilityInput,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let n_ed = force_state.forces.n_ed;
    let sigma_m = sigma_m_mpa(force_state.forces.my_ed, section.w_y_mm3());
    let sigma_c = if n_ed < 0.0 { sigma_axial_mpa(n_ed, section.area_mm2()) } else { 0.0 };

    let s_crit = sigma_m_crit_rect_mpa(section, input.l_ef_mm, input.e0_05_mpa);
    let l_rel_m = lambda_rel_m(input.f_mk_mpa, s_crit);
    let kcrit = k_crit(l_rel_m);

    // k_c,z voor de drukterm in (6.35).
    let lambda_z = slenderness(input.l_cr_z_mm, section.radius_z_mm());
    let lambda_rel_z = lambda_rel(lambda_z, input.f_c0k_mpa, input.e0_05_mpa);
    let k_z = k_factor(lambda_rel_z, input.beta_c);
    let k_c_z = k_c(k_z, lambda_rel_z);

    let bending_ratio = if input.f_myd_mpa > 0.0 { sigma_m / (kcrit * input.f_myd_mpa) } else { 0.0 };
    let has_compression = sigma_c > 0.0;
    let (uc, formula, uc_formula) = if has_compression {
        (
            bending_ratio * bending_ratio + sigma_c / (k_c_z * input.f_c0d_mpa),
            r"\left(\frac{\sigma_{m,d}}{k_{crit} f_{m,d}}\right)^2 + \frac{\sigma_{c,d}}{k_{c,z} f_{c,0,d}} \le 1".to_string(),
            r"(6.35)".to_string(),
        )
    } else {
        (
            bending_ratio,
            r"\sigma_{m,d} \le k_{crit} \cdot f_{m,d}".to_string(),
            r"\sigma_{m,d} / (k_{crit} f_{m,d})".to_string(),
        )
    };

    let status = if sigma_m <= 0.0 && !has_compression {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    StabilityCalc {
        id: "6.3.3_beam_stability".to_string(),
        title: "Kipstabiliteit (buiging en druk)".to_string(),
        article: if has_compression { "art. 6.3.3 (6.35)".to_string() } else { "art. 6.3.3 (6.33)".to_string() },
        force_state,
        formula_latex: formula,
        variables: vec![
            NamedValue { symbol: r"\sigma_{m,y,d}".to_string(), value: sigma_m, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{c,0,d}".to_string(), value: sigma_c, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{m,y,d}".to_string(), value: input.f_myd_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{c,0,d}".to_string(), value: input.f_c0d_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"l_{ef}".to_string(), value: input.l_ef_mm, unit: "mm".to_string() },
            NamedValue { symbol: r"E_{0,05}".to_string(), value: input.e0_05_mpa, unit: "N/mm²".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: r"\sigma_{m,crit}".to_string(), value: s_crit, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\lambda_{rel,m}".to_string(), value: l_rel_m, unit: "-".to_string() },
            NamedValue { symbol: r"k_{crit}".to_string(), value: kcrit, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_{rel,z}".to_string(), value: lambda_rel_z, unit: "-".to_string() },
            NamedValue { symbol: r"k_{c,z}".to_string(), value: k_c_z, unit: "-".to_string() },
        ],
        value: uc,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: uc,
            rd: 1.0,
            uc,
            formula_latex: uc_formula,
        }),
        status,
        notes: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;
    use mechanics::InternalForces;

    fn sectie() -> RectTimberSection {
        RectTimberSection::new(96.0, 450.0)
    }

    fn snap(n: f64, my: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 12,
            position_mm: 3688.0,
            forces: InternalForces { n_ed: n, my_ed: my, ..Default::default() },
        }
    }

    fn kolom_invoer() -> ColumnStabilityInput {
        ColumnStabilityInput {
            l_cr_y_mm: 6342.0,
            l_cr_z_mm: 1268.0,
            f_c0k_mpa: 21.0,
            e0_05_mpa: 7400.0,
            beta_c: 0.2,
            f_c0d_mpa: 12.923,
            f_myd_mpa: 14.769,
            f_mzd_mpa: 16.149,
            k_m: 0.7,
        }
    }

    #[test]
    fn slankheden_referentie_staaf2() {
        // lambda_y = 6342/129,9 = 48,82; lambda_z = 1268/27,7 = 45,77.
        let s = sectie();
        assert_relative_eq!(slenderness(6342.0, s.radius_y_mm()), 48.82, max_relative = 1e-3);
        assert_relative_eq!(slenderness(1268.0, s.radius_z_mm()), 45.77, max_relative = 1e-3);
        // lambda_rel,y = 0,828; lambda_rel,z = 0,776.
        assert_relative_eq!(lambda_rel(48.821, 21.0, 7400.0), 0.828, max_relative = 1e-3);
        assert_relative_eq!(lambda_rel(45.755, 21.0, 7400.0), 0.776, max_relative = 1e-3);
    }

    #[test]
    fn instabiliteits_en_knikfactoren_referentie() {
        // k_y = 0,90 → k_c,y = 0,81; k_z = 0,85 → k_c,z = 0,84.
        let k_y = k_factor(0.8278, 0.2);
        assert_relative_eq!(k_y, 0.895, max_relative = 2e-3);
        assert_relative_eq!(k_c(k_y, 0.8278), 0.81, max_relative = 3e-3);
        let k_z = k_factor(0.7758, 0.2);
        assert_relative_eq!(k_z, 0.849, max_relative = 2e-3);
        assert_relative_eq!(k_c(k_z, 0.7758), 0.84, max_relative = 3e-3);
    }

    #[test]
    fn kolomtoets_referentie_staaf2() {
        // (6.23) = 1,64 (maatgevend); (6.24) = 1,18.
        let r = check_column_stability(&sectie(), &kolom_invoer(), snap(-57.64, 72.170));
        let iv = |sym: &str| {
            r.intermediate_values
                .iter()
                .find(|v| v.symbol == sym)
                .unwrap_or_else(|| panic!("tussenwaarde {sym} ontbreekt"))
                .value
        };
        assert_relative_eq!(iv("(6.23)"), 1.64, max_relative = 5e-3);
        assert_relative_eq!(iv("(6.24)"), 1.18, max_relative = 5e-3);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 1.64, max_relative = 5e-3);
        assert_eq!(r.status, CheckStatus::NotOk);
    }

    #[test]
    fn kolomtoets_referentie_staaf1() {
        // Staaf 1 (gereconstrueerd uit de UC-tabel): L_cr = 3313 om beide assen,
        // N = -92,812 kN, M = -66,964 kNm → (6.24) maatgevend = 1,74.
        let invoer = ColumnStabilityInput {
            l_cr_y_mm: 3313.0,
            l_cr_z_mm: 3313.0,
            ..kolom_invoer()
        };
        let r = check_column_stability(&sectie(), &invoer, snap(-92.812, -66.964));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 1.74, max_relative = 5e-3);
    }

    #[test]
    fn kolomtoets_nvt_zonder_druk() {
        let r = check_column_stability(&sectie(), &kolom_invoer(), snap(10.0, 72.170));
        assert_eq!(r.status, CheckStatus::NotApplicable);
    }

    #[test]
    fn lage_slankheid_gebruikt_kwadratische_drukterm() {
        // Zeer korte kniklengten → lambda_rel <= 0,3 → (6.19)/(6.20).
        let invoer = ColumnStabilityInput {
            l_cr_y_mm: 300.0,
            l_cr_z_mm: 100.0,
            ..kolom_invoer()
        };
        let r = check_column_stability(&sectie(), &invoer, snap(-57.64, 0.0));
        assert!(r.article.contains("6.19"));
        // (sigma_c/f_c)² = (1,334/12,923)² = 0,0107.
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.01066, max_relative = 1e-2);
    }

    #[test]
    fn effectieve_kiplengte_tabel_6_1() {
        // Vrij opgelegd, q-last: 0,9·l; puntlast: 0,8·l; constant moment: 1,0·l.
        assert_relative_eq!(effective_length_mm(1268.0, LtbLoadCase::UniformLoad, LtbLoadPosition::CentreOfGravity, 450.0), 1141.2, max_relative = 1e-9);
        assert_relative_eq!(effective_length_mm(1000.0, LtbLoadCase::ConcentratedMidspan, LtbLoadPosition::CentreOfGravity, 450.0), 800.0, max_relative = 1e-9);
        assert_relative_eq!(effective_length_mm(1000.0, LtbLoadCase::ConstantMoment, LtbLoadPosition::CentreOfGravity, 450.0), 1000.0, max_relative = 1e-9);
        // Drukzijde: +2h; trekzijde: −0,5h.
        assert_relative_eq!(effective_length_mm(1000.0, LtbLoadCase::UniformLoad, LtbLoadPosition::CompressionEdge, 450.0), 1800.0, max_relative = 1e-9);
        assert_relative_eq!(effective_length_mm(1000.0, LtbLoadCase::UniformLoad, LtbLoadPosition::TensionEdge, 450.0), 675.0, max_relative = 1e-9);
    }

    #[test]
    fn sigma_m_crit_referentie() {
        // 0,78·96²/(450·1268)·7400 = 93,2 N/mm2.
        let s = sectie();
        assert_relative_eq!(sigma_m_crit_rect_mpa(&s, 1268.0, 7400.0), 93.2, max_relative = 1e-3);
    }

    #[test]
    fn lambda_rel_m_en_k_crit_referentie() {
        // lambda_rel,m = sqrt(24/93,2) = 0,507 < 0,75 → k_crit = 1,00.
        let l = lambda_rel_m(24.0, 93.227);
        assert_relative_eq!(l, 0.507, max_relative = 2e-3);
        assert_relative_eq!(k_crit(l), 1.0, max_relative = 1e-9);
    }

    #[test]
    fn k_crit_takken_van_6_34() {
        assert_relative_eq!(k_crit(0.75), 1.0);
        assert_relative_eq!(k_crit(1.0), 0.81, max_relative = 1e-9);
        assert_relative_eq!(k_crit(1.4), 1.56 - 0.75 * 1.4, max_relative = 1e-9);
        assert_relative_eq!(k_crit(2.0), 0.25, max_relative = 1e-9);
    }

    #[test]
    fn kiptoets_referentie_staaf2() {
        // (6.35): (22,3/14,8)² + 1,3/(0,84·12,9) = 2,40.
        let invoer = BeamStabilityInput {
            l_ef_mm: 1268.0,
            l_cr_z_mm: 1268.0,
            f_mk_mpa: 24.0,
            f_c0k_mpa: 21.0,
            e0_05_mpa: 7400.0,
            beta_c: 0.2,
            f_myd_mpa: 14.769,
            f_c0d_mpa: 12.923,
        };
        let r = check_beam_stability(&sectie(), &invoer, snap(-57.64, 72.170));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 2.40, max_relative = 5e-3);
        assert_eq!(r.status, CheckStatus::NotOk);
        let kcrit = r.intermediate_values.iter().find(|v| v.symbol == r"k_{crit}").unwrap().value;
        assert_relative_eq!(kcrit, 1.0, max_relative = 1e-9);
    }

    #[test]
    fn kiptoets_zuivere_buiging_6_33() {
        // Zonder drukkracht geldt (6.33): UC = sigma_m/(k_crit·f_m,d).
        let invoer = BeamStabilityInput {
            l_ef_mm: 1268.0,
            l_cr_z_mm: 1268.0,
            f_mk_mpa: 24.0,
            f_c0k_mpa: 21.0,
            e0_05_mpa: 7400.0,
            beta_c: 0.2,
            f_myd_mpa: 14.769,
            f_c0d_mpa: 12.923,
        };
        let r = check_beam_stability(&sectie(), &invoer, snap(0.0, 72.170));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 22.2747 / 14.769, max_relative = 1e-3);
        assert!(r.article.contains("6.33"));
    }
}
