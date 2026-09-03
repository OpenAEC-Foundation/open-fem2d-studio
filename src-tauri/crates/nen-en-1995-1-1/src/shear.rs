//! §6.1.7 dwarskracht.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

use crate::section::RectTimberSection;

/// Schuifspanning voor een rechthoek: tau_d = V·S / (I·b_ef) = 1,5·V / (b_ef·h),
/// met b_ef = k_cr·b (vergelijking 6.13a uit A1).
/// V in kN, afmetingen in mm, resultaat in N/mm2.
pub fn tau_d_rect_mpa(v_ed_kn: f64, section: &RectTimberSection, k_cr: f64) -> f64 {
    let b_ef = k_cr * section.b_mm;
    if b_ef <= 0.0 || section.h_mm <= 0.0 {
        return 0.0;
    }
    1.5 * v_ed_kn.abs() * 1e3 / (b_ef * section.h_mm)
}

/// §6.1.7, vergelijking (6.13): tau_d <= f_v,d.
///
/// `k_cr` is de scheurfactor uit A1 (6.13a). De Eurocode zelf beveelt 0,67
/// aan voor gezaagd hout en voor gelijmd gelamineerd hout, en 1,0 voor
/// houtachtige producten volgens EN 13986 en EN 14374, met de uitdrukkelijke
/// aantekening dat de nationale keuze in de nationale bijlage staat.
///
/// De Nederlandse nationale bijlage (NEN-EN 1995-1-1:2005+A2:2014/NB:2013,
/// bij 6.1.7) maakt die keuze: **voor liggers met een prismatische doorsnede
/// geldt k_cr = 1,0**. De waarde 0,8 komt daar alleen voor bij I- en
/// T-profielen waarvan het lijf dunner is dan de halve flensbreedte; die
/// vormen kent deze toetsing niet, want [`RectTimberSection`] is per
/// definitie prismatisch en rechthoekig.
///
/// Voor het Nederlandse toepassingsgebied is 1,0 dus de normwaarde en geen
/// onveilige vereenvoudiging. Rekenen met 0,67 zou de dwarskrachtcapaciteit
/// een derde lager maken dan de norm toestaat. De parameter blijft
/// instelbaar voor een ander nationaal toepassingsgebied.
///
/// Ter controle, met de volle breedte (k_cr = 1,0):
/// tau = 75567,6 · 2,43e6 / (96 · 7,29e8) = 2,6 N/mm2 > f_v,d = 2,5 → UC 1,07.
pub fn check_shear(
    section: &RectTimberSection,
    f_vd_mpa: f64,
    k_cr: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let v_ed = force_state.forces.vz_ed;
    let tau = tau_d_rect_mpa(v_ed, section, k_cr);
    let uc = if f_vd_mpa > 0.0 { tau / f_vd_mpa } else { 0.0 };
    let status = if v_ed.abs() < 1e-12 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    let mut notes = vec![];
    if (k_cr - 1.0).abs() > 1e-9 {
        notes.push(format!("b_ef = k_cr · b met k_cr = {k_cr:.2} (6.13a)"));
    }

    ResistanceCalc {
        id: "6.1.7_shear".to_string(),
        title: "Dwarskracht".to_string(),
        article: "art. 6.1.7 (6.13)".to_string(),
        force_state,
        formula_latex: r"\tau_d = \frac{V_{z,Ed} \cdot S_y}{I_y \cdot b_{ef}} = \frac{1{,}5 \cdot V_{z,Ed}}{b_{ef} \cdot h} \le f_{v,d}".to_string(),
        variables: vec![
            NamedValue { symbol: r"V_{z,Ed}".to_string(), value: v_ed.abs(), unit: "kN".to_string() },
            NamedValue { symbol: "S_y".to_string(), value: section.s_y_mm3(), unit: "mm³".to_string() },
            NamedValue { symbol: "I_y".to_string(), value: section.i_y_mm4(), unit: "mm⁴".to_string() },
            NamedValue { symbol: "b".to_string(), value: section.b_mm, unit: "mm".to_string() },
            NamedValue { symbol: "k_{cr}".to_string(), value: k_cr, unit: "-".to_string() },
            NamedValue { symbol: r"f_{v,d}".to_string(), value: f_vd_mpa, unit: "N/mm²".to_string() },
        ],
        value: tau,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: tau,
            rd: f_vd_mpa,
            uc,
            formula_latex: r"\tau_d / f_{v,d}".to_string(),
        }),
        status,
        notes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;
    use mechanics::InternalForces;

    fn snap(v_kn: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 12,
            position_mm: 0.0,
            forces: InternalForces { vz_ed: v_kn, ..Default::default() },
        }
    }

    #[test]
    fn referentie_staaf2_dwarskracht() {
        // tau = 1,5 · 75567,6 / 43200 = 2,624 N/mm2; UC = 2,624/2,462 = 1,07.
        let s = RectTimberSection::new(96.0, 450.0);
        let r = check_shear(&s, 2.4615, 1.0, snap(75.5676));
        assert_relative_eq!(r.value, 2.624, max_relative = 1e-3);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 1.07, max_relative = 5e-3);
        assert_eq!(r.status, CheckStatus::NotOk);
    }

    #[test]
    fn referentie_staaf1_dwarskracht() {
        // V = 20,463 kN → tau = 0,7105; UC = 0,29.
        let s = RectTimberSection::new(96.0, 450.0);
        let r = check_shear(&s, 2.4615, 1.0, snap(20.463));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.29, max_relative = 1e-2);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn vs_over_ib_is_gelijk_aan_anderhalf_v_over_a() {
        // Voor een rechthoek: V·S/(I·b) = 1,5·V/A.
        let s = RectTimberSection::new(96.0, 450.0);
        let v_kn = 75.5676;
        let via_s = v_kn * 1e3 * s.s_y_mm3() / (s.i_y_mm4() * s.b_mm);
        assert_relative_eq!(tau_d_rect_mpa(v_kn, &s, 1.0), via_s, max_relative = 1e-12);
    }

    #[test]
    fn k_cr_reduceert_de_werkzame_breedte() {
        let s = RectTimberSection::new(96.0, 450.0);
        let vol = tau_d_rect_mpa(60.0, &s, 1.0);
        let gereduceerd = tau_d_rect_mpa(60.0, &s, 0.67);
        assert_relative_eq!(gereduceerd, vol / 0.67, max_relative = 1e-12);
    }
}
