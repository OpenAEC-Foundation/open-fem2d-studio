//! NEN-EN 1993-1-1 §6.2.5 — bending resistance.

use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use crate::{SteelGrade, ResistanceCalc, UnityCheck, CheckStatus, NamedValue};
use crate::classification::CrossSectionClass;

pub fn m_y_c_rd(
    p: &SectionProperties,
    grade: &SteelGrade,
    class: CrossSectionClass,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let (w_used, w_symbol, w_unit) = match class {
        CrossSectionClass::Class1 | CrossSectionClass::Class2 =>
            (p.wpl_y_mm3, r"W_{pl,y}", "mm³"),
        CrossSectionClass::Class3 =>
            (p.wel_y_mm3, r"W_{el,y}", "mm³"),
        CrossSectionClass::Class4 =>
            (p.wel_y_mm3, r"W_{eff,y}", "mm³"),
    };
    let m_c_rd_knm = w_used * grade.fy_mpa / grade.gamma_m0 * 1e-6;
    let m_ed_abs = force_state.forces.my_ed.abs();
    let uc = if m_c_rd_knm > 0.0 { m_ed_abs / m_c_rd_knm } else { 0.0 };
    let status = if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };

    let title = if matches!(class, CrossSectionClass::Class1 | CrossSectionClass::Class2) {
        "Buigend moment (maatgevend)"
    } else {
        "Buigend moment"
    };

    ResistanceCalc {
        id: "6.2.5_bending_y".to_string(),
        title: title.to_string(),
        article: "art. 6.2.5 (6.13)".to_string(),
        force_state,
        formula_latex: format!(r"M_{{y,c,Rd}} = M_{{pl,y,Rd}} = \frac{{{} \cdot f_y}}{{\gamma_{{M0}}}}", w_symbol),
        variables: vec![
            NamedValue { symbol: w_symbol.to_string(), value: w_used, unit: w_unit.to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M0}".to_string(), value: grade.gamma_m0, unit: "-".to_string() },
        ],
        value: m_c_rd_knm,
        unit: "kNm".to_string(),
        uc: Some(UnityCheck {
            ed: m_ed_abs, rd: m_c_rd_knm, uc,
            formula_latex: r"M_{y,Ed} / M_{y,c,Rd}".to_string(),
        }),
        status,
        notes: vec![],
    }
}

pub fn m_z_c_rd(
    p: &SectionProperties,
    grade: &SteelGrade,
    class: CrossSectionClass,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let (w_used, w_symbol) = match class {
        CrossSectionClass::Class1 | CrossSectionClass::Class2 => (p.wpl_z_mm3, r"W_{pl,z}"),
        _ => (p.wel_z_mm3, r"W_{el,z}"),
    };
    let m_c_rd = w_used * grade.fy_mpa / grade.gamma_m0 * 1e-6;
    let m_ed = force_state.forces.mz_ed.abs();
    let uc = if m_c_rd > 0.0 { m_ed / m_c_rd } else { 0.0 };

    ResistanceCalc {
        id: "6.2.5_bending_z".to_string(),
        title: "Buigend moment (z-as)".to_string(),
        article: "art. 6.2.5".to_string(),
        force_state,
        formula_latex: format!(r"M_{{z,c,Rd}} = \frac{{{} \cdot f_y}}{{\gamma_{{M0}}}}", w_symbol),
        variables: vec![
            NamedValue { symbol: w_symbol.to_string(), value: w_used, unit: "mm³".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M0}".to_string(), value: grade.gamma_m0, unit: "-".to_string() },
        ],
        value: m_c_rd,
        unit: "kNm".to_string(),
        uc: Some(UnityCheck { ed: m_ed, rd: m_c_rd, uc, formula_latex: r"M_{z,Ed} / M_{z,c,Rd}".to_string() }),
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
    use crate::{S235, classification::CrossSectionClass};

    /// Calc 2 Beam 1 page 50: M_y,c,Rd = M_pl,y,Rd = 354113 × 235 / 1.00 × 10⁻⁶ = 83.217 kNm
    /// M_y,Ed = 87.84 kNm → UC = 1.06 NOT OK
    #[test]
    fn calc2_beam1_bending() {
        let mut p = i_section_props(160.0, 160.0, 8.0, 13.0, 15.0);
        p.wpl_y_mm3 = 354113.0;
        let f = InternalForces { n_ed: -226.027, vz_ed: -35.136, my_ed: -87.84, ..Default::default() };
        let snap = ForceStateSnapshot { combination_id: 2, position_mm: 2500.0, forces: f };
        let result = m_y_c_rd(&p, &S235, CrossSectionClass::Class1, snap);
        assert_relative_eq!(result.value, 83.217, max_relative = 1e-3);
        assert_relative_eq!(result.uc.unwrap().uc, 1.06, max_relative = 0.02);
        assert_eq!(result.status, CheckStatus::NotOk);
    }
}
