//! §6.1.6 buiging (enkel en dubbel).

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

use crate::section::RectTimberSection;

/// Buigspanning |M|/W in N/mm2 (M in kNm, W in mm3).
pub fn sigma_m_mpa(m_ed_knm: f64, w_mm3: f64) -> f64 {
    if w_mm3 <= 0.0 {
        return 0.0;
    }
    m_ed_knm.abs() * 1e6 / w_mm3
}

/// §6.1.6, vergelijkingen (6.11) en (6.12):
///
///   sigma_m,y,d / f_m,y,d + k_m · sigma_m,z,d / f_m,z,d <= 1   (6.11)
///   k_m · sigma_m,y,d / f_m,y,d + sigma_m,z,d / f_m,z,d <= 1   (6.12)
///
/// UC = maximum van beide. k_m = 0,7 voor rechthoekige doorsneden.
///
/// Verificatie: de referentie-uitwerking voert geen zuivere buigingstoets op
/// (overal is ook normaalkracht aanwezig, waardoor §6.3.2 maatgevend is),
/// maar dezelfde buigtermen sigma_m,y,d/f_m,y,d + k_m·sigma_m,z,d/f_m,z,d
/// komen geverifieerd terug in (6.23): 22,3/14,8 + 0,7·0/16,1.
pub fn check_bending(
    section: &RectTimberSection,
    f_myd_mpa: f64,
    f_mzd_mpa: f64,
    k_m: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let sigma_my = sigma_m_mpa(force_state.forces.my_ed, section.w_y_mm3());
    let sigma_mz = sigma_m_mpa(force_state.forces.mz_ed, section.w_z_mm3());

    let term_y = if f_myd_mpa > 0.0 { sigma_my / f_myd_mpa } else { 0.0 };
    let term_z = if f_mzd_mpa > 0.0 { sigma_mz / f_mzd_mpa } else { 0.0 };
    let eq_6_11 = term_y + k_m * term_z;
    let eq_6_12 = k_m * term_y + term_z;
    let uc = eq_6_11.max(eq_6_12);

    let has_moment = sigma_my > 0.0 || sigma_mz > 0.0;
    let status = if !has_moment {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    ResistanceCalc {
        id: "6.1.6_bending".to_string(),
        title: "Buiging".to_string(),
        article: "art. 6.1.6 (6.11)(6.12)".to_string(),
        force_state,
        formula_latex: r"\frac{\sigma_{m,y,d}}{f_{m,y,d}} + k_m \frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1 \quad ; \quad k_m \frac{\sigma_{m,y,d}}{f_{m,y,d}} + \frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string(),
        variables: vec![
            NamedValue { symbol: r"\sigma_{m,y,d}".to_string(), value: sigma_my, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{m,z,d}".to_string(), value: sigma_mz, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{m,y,d}".to_string(), value: f_myd_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{m,z,d}".to_string(), value: f_mzd_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: "k_m".to_string(), value: k_m, unit: "-".to_string() },
            NamedValue { symbol: "(6.11)".to_string(), value: eq_6_11, unit: "-".to_string() },
            NamedValue { symbol: "(6.12)".to_string(), value: eq_6_12, unit: "-".to_string() },
        ],
        value: uc,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: uc,
            rd: 1.0,
            uc,
            formula_latex: r"\max\left[(6.11), (6.12)\right]".to_string(),
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

    fn snap(my: f64, mz: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 12,
            position_mm: 3688.0,
            forces: InternalForces { my_ed: my, mz_ed: mz, ..Default::default() },
        }
    }

    #[test]
    fn buigspanning_referentie() {
        // Referentie: sigma_m,y,d = 72,170e6 / 3,24e6 = 22,3 N/mm2.
        let s = RectTimberSection::new(96.0, 450.0);
        assert_relative_eq!(sigma_m_mpa(72.170, s.w_y_mm3()), 22.27, max_relative = 1e-3);
    }

    #[test]
    fn enkelvoudige_buiging_uc_conform_referentietermen() {
        // Buigterm uit (6.23): 22,3/14,8 = 1,51.
        let s = RectTimberSection::new(96.0, 450.0);
        let r = check_bending(&s, 14.769, 16.149, 0.7, snap(72.170, 0.0));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 1.508, max_relative = 2e-3);
        assert_eq!(r.status, CheckStatus::NotOk);
    }

    #[test]
    fn dubbele_buiging_beide_vergelijkingen() {
        // Symmetrische controle van (6.11)/(6.12) met k_m = 0,7:
        // termen 0,5 en 0,4 → 6.11: 0,5+0,7·0,4 = 0,78; 6.12: 0,7·0,5+0,4 = 0,75.
        let s = RectTimberSection::new(100.0, 100.0);
        // W_y = W_z = 166667 mm3; f_d = 10 → M voor sigma=5: 0,833 kNm; sigma=4: 0,667.
        let m_y = 5.0 * s.w_y_mm3() / 1e6;
        let m_z = 4.0 * s.w_z_mm3() / 1e6;
        let r = check_bending(&s, 10.0, 10.0, 0.7, snap(m_y, m_z));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.78, max_relative = 1e-6);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn zonder_moment_niet_van_toepassing() {
        let s = RectTimberSection::new(96.0, 450.0);
        let r = check_bending(&s, 14.769, 16.149, 0.7, snap(0.0, 0.0));
        assert_eq!(r.status, CheckStatus::NotApplicable);
    }
}
