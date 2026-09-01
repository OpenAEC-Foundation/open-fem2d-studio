//! §6.1.2 trek en §6.1.4 druk evenwijdig aan de vezel.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

use crate::section::RectTimberSection;

/// Normaalspanning |N|/A in N/mm2 (N in kN, A in mm2).
pub fn sigma_axial_mpa(n_ed_kn: f64, area_mm2: f64) -> f64 {
    if area_mm2 <= 0.0 {
        return 0.0;
    }
    n_ed_kn.abs() * 1e3 / area_mm2
}

/// §6.1.4, vergelijking (6.2): sigma_c,0,d <= f_c,0,d.
///
/// Verificatie: referentie-uitwerking staaf 2 — sigma_c,0,d = 57640/43200
/// = 1,3 N/mm2 < f_c,0,d = 12,9 N/mm2 → UC 0,10.
/// N-tekenconventie: druk negatief (conform `mechanics`).
pub fn check_compression_parallel(
    section: &RectTimberSection,
    f_c0d_mpa: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let area = section.area_mm2();
    let n_ed = force_state.forces.n_ed;
    let sigma = sigma_axial_mpa(n_ed, area);
    let uc = if f_c0d_mpa > 0.0 { sigma / f_c0d_mpa } else { 0.0 };
    let status = if n_ed >= 0.0 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    ResistanceCalc {
        id: "6.1.4_compression".to_string(),
        title: "Druk evenwijdig aan de vezel".to_string(),
        article: "art. 6.1.4 (6.2)".to_string(),
        force_state,
        formula_latex: r"\sigma_{c,0,d} = \frac{N_{c,Ed}}{A} \le f_{c,0,d}".to_string(),
        variables: vec![
            NamedValue { symbol: r"N_{c,Ed}".to_string(), value: n_ed.abs(), unit: "kN".to_string() },
            NamedValue { symbol: "A".to_string(), value: area, unit: "mm²".to_string() },
            NamedValue { symbol: r"f_{c,0,d}".to_string(), value: f_c0d_mpa, unit: "N/mm²".to_string() },
        ],
        value: sigma,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: sigma,
            rd: f_c0d_mpa,
            uc,
            formula_latex: r"\sigma_{c,0,d} / f_{c,0,d}".to_string(),
        }),
        status,
        notes: vec![],
    }
}

/// §6.1.2, vergelijking (6.1): sigma_t,0,d <= f_t,0,d.
///
/// De referentie-uitwerking bevat geen trekstaaf; de formule volgt de
/// normtekst (NIET-GEVERIFIEERD tegen een uitwerking). `f_t0d_mpa` moet
/// inclusief een eventuele k_h worden aangeleverd (§3.2(3)).
pub fn check_tension_parallel(
    section: &RectTimberSection,
    f_t0d_mpa: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let area = section.area_mm2();
    let n_ed = force_state.forces.n_ed;
    let sigma = sigma_axial_mpa(n_ed, area);
    let uc = if f_t0d_mpa > 0.0 { sigma / f_t0d_mpa } else { 0.0 };
    let status = if n_ed <= 0.0 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    ResistanceCalc {
        id: "6.1.2_tension".to_string(),
        title: "Trek evenwijdig aan de vezel".to_string(),
        article: "art. 6.1.2 (6.1)".to_string(),
        force_state,
        formula_latex: r"\sigma_{t,0,d} = \frac{N_{t,Ed}}{A} \le f_{t,0,d}".to_string(),
        variables: vec![
            NamedValue { symbol: r"N_{t,Ed}".to_string(), value: n_ed.abs(), unit: "kN".to_string() },
            NamedValue { symbol: "A".to_string(), value: area, unit: "mm²".to_string() },
            NamedValue { symbol: r"f_{t,0,d}".to_string(), value: f_t0d_mpa, unit: "N/mm²".to_string() },
        ],
        value: sigma,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: sigma,
            rd: f_t0d_mpa,
            uc,
            formula_latex: r"\sigma_{t,0,d} / f_{t,0,d}".to_string(),
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

    fn snap(n_kn: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 12,
            position_mm: 1034.0,
            forces: InternalForces { n_ed: n_kn, ..Default::default() },
        }
    }

    #[test]
    fn referentie_staaf2_druk() {
        // sigma = 57640/43200 = 1,334; UC = 1,334/12,923 = 0,10.
        let s = RectTimberSection::new(96.0, 450.0);
        let r = check_compression_parallel(&s, 12.923, snap(-57.64));
        assert_relative_eq!(r.value, 1.334, max_relative = 1e-3);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.10, max_relative = 5e-2);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn referentie_staaf1_druk() {
        // N = 93,854 kN (comb 1.1) → sigma = 2,172; UC = 0,17.
        let s = RectTimberSection::new(96.0, 450.0);
        let r = check_compression_parallel(&s, 12.923, snap(-93.854));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.17, max_relative = 2e-2);
    }

    #[test]
    fn trekstaaf_niet_van_toepassing_bij_druk() {
        let s = RectTimberSection::new(96.0, 450.0);
        let r = check_tension_parallel(&s, 8.62, snap(-10.0));
        assert_eq!(r.status, CheckStatus::NotApplicable);
        // En andersom: druktoets n.v.t. bij trek.
        let r = check_compression_parallel(&s, 12.923, snap(10.0));
        assert_eq!(r.status, CheckStatus::NotApplicable);
    }

    #[test]
    fn trek_conform_normtekst() {
        // sigma_t = 43,2 kN / 43200 mm2 = 1,0 N/mm2; f_t,0,d = 8,62 → UC 0,116.
        let s = RectTimberSection::new(96.0, 450.0);
        let r = check_tension_parallel(&s, 8.62, snap(43.2));
        assert_relative_eq!(r.value, 1.0, max_relative = 1e-9);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.116, max_relative = 1e-2);
        assert_eq!(r.status, CheckStatus::Ok);
    }
}
