//! NEN-EN 1993-1-1 §6.2.4 — compression resistance.

use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use crate::{SteelGrade, ResistanceCalc, UnityCheck, CheckStatus, NamedValue};

pub fn n_c_rd(
    p: &SectionProperties,
    grade: &SteelGrade,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let n_c_rd_kn = p.area_mm2 * grade.fy_mpa / grade.gamma_m0 * 1e-3;
    let n_ed_abs = force_state.forces.n_ed.abs();
    let uc = if n_ed_abs > 0.0 { n_ed_abs / n_c_rd_kn } else { 0.0 };
    let status = if force_state.forces.n_ed >= 0.0 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };

    ResistanceCalc {
        id: "6.2.4_compression".to_string(),
        title: "Druk".to_string(),
        article: "art. 6.2.4 (6.10)".to_string(),
        force_state,
        formula_latex: r"N_{c,Rd} = \frac{A \cdot f_y}{\gamma_{M0}}".to_string(),
        variables: vec![
            NamedValue { symbol: "A".to_string(), value: p.area_mm2, unit: "mm²".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M0}".to_string(), value: grade.gamma_m0, unit: "-".to_string() },
        ],
        value: n_c_rd_kn,
        unit: "kN".to_string(),
        uc: Some(UnityCheck {
            ed: n_ed_abs,
            rd: n_c_rd_kn,
            uc,
            formula_latex: r"N_{Ed} / N_{c,Rd}".to_string(),
        }),
        status,
        notes: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;
    use section_properties::i_section::i_section_props;
    use mechanics::InternalForces;
    use crate::S235;

    #[test]
    fn calc2_beam1_compression() {
        let mut p = i_section_props(160.0, 160.0, 8.0, 13.0, 15.0);
        p.area_mm2 = 5427.5;
        let f = InternalForces { n_ed: -226.027, vz_ed: -35.136, ..Default::default() };
        let snap = ForceStateSnapshot { combination_id: 2, position_mm: 0.0, forces: f };
        let result = n_c_rd(&p, &S235, snap);
        assert_relative_eq!(result.value, 1275.472, max_relative = 1e-3);
        assert_relative_eq!(result.uc.unwrap().uc, 0.18, max_relative = 0.02);
        assert_eq!(result.status, CheckStatus::Ok);
    }
}
