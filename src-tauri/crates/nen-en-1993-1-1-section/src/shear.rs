//! NEN-EN 1993-1-1 §6.2.6 — shear resistance.

use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use crate::{SteelGrade, ResistanceCalc, UnityCheck, CheckStatus, NamedValue};

pub fn v_z_c_rd(p: &SectionProperties, grade: &SteelGrade, force_state: ForceStateSnapshot) -> ResistanceCalc {
    let v_rd = p.av_z_mm2 * (grade.fy_mpa / 3f64.sqrt()) / grade.gamma_m0 * 1e-3;
    let v_ed = force_state.forces.vz_ed.abs();
    let uc = if v_rd > 0.0 { v_ed / v_rd } else { 0.0 };

    ResistanceCalc {
        id: "6.2.6_shear_z".to_string(),
        title: "Shear".to_string(),
        article: "art. 6.2.6 (6.18)".to_string(),
        force_state,
        formula_latex: r"V_{c,z,Rd} = V_{pl,z,Rd} = \frac{A_v \cdot (f_y / \sqrt{3})}{\gamma_{M0}}".to_string(),
        variables: vec![
            NamedValue { symbol: "A_v".to_string(), value: p.av_z_mm2, unit: "mm²".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M0}".to_string(), value: grade.gamma_m0, unit: "-".to_string() },
        ],
        value: v_rd,
        unit: "kN".to_string(),
        uc: Some(UnityCheck { ed: v_ed, rd: v_rd, uc, formula_latex: r"V_{z,Ed} / V_{c,z,Rd}".to_string() }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![],
    }
}

pub fn v_y_c_rd(p: &SectionProperties, grade: &SteelGrade, force_state: ForceStateSnapshot) -> ResistanceCalc {
    let v_rd = p.av_y_mm2 * (grade.fy_mpa / 3f64.sqrt()) / grade.gamma_m0 * 1e-3;
    let v_ed = force_state.forces.vy_ed.abs();
    let uc = if v_rd > 0.0 { v_ed / v_rd } else { 0.0 };
    ResistanceCalc {
        id: "6.2.6_shear_y".to_string(),
        title: "Shear (y-axis)".to_string(),
        article: "art. 6.2.6".to_string(),
        force_state,
        formula_latex: r"V_{c,y,Rd} = \frac{A_v \cdot (f_y/\sqrt{3})}{\gamma_{M0}}".to_string(),
        variables: vec![
            NamedValue { symbol: "A_v".to_string(), value: p.av_y_mm2, unit: "mm²".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M0}".to_string(), value: grade.gamma_m0, unit: "-".to_string() },
        ],
        value: v_rd, unit: "kN".to_string(),
        uc: Some(UnityCheck { ed: v_ed, rd: v_rd, uc, formula_latex: r"V_{y,Ed}/V_{c,y,Rd}".to_string() }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
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
    fn calc2_beam1_shear() {
        let mut p = i_section_props(160.0, 160.0, 8.0, 13.0, 15.0);
        p.av_z_mm2 = 1762.0;
        let f = InternalForces { vz_ed: -35.136, ..Default::default() };
        let snap = ForceStateSnapshot { combination_id: 2, position_mm: 0.0, forces: f };
        let result = v_z_c_rd(&p, &S235, snap);
        assert_relative_eq!(result.value, 239.1, max_relative = 1e-3);
        assert_relative_eq!(result.uc.unwrap().uc, 0.15, max_relative = 0.025);
    }
}
