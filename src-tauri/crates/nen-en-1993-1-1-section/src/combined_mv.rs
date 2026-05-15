//! NEN-EN 1993-1-1 §6.2.8 — bending and shear interaction.

use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use crate::{SteelGrade, ResistanceCalc, UnityCheck, CheckStatus, NamedValue};
use crate::classification::CrossSectionClass;

pub fn check_combined_mv(
    _p: &SectionProperties, _grade: &SteelGrade, _class: CrossSectionClass,
    v_pl_rd_kn: f64, m_c_rd_knm: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let v_ed = force_state.forces.vz_ed.abs();
    let m_ed = force_state.forces.my_ed.abs();
    let v_threshold = v_pl_rd_kn / 2.0;
    let mut notes = Vec::new();

    let m_v_rd = if v_ed <= v_threshold {
        notes.push(format!(
            "V_z,Ed = {:.3} kN < V_z,pl,Rd / 2 = {:.3} kN — The effect of shear on the moment resistance can be neglected.",
            v_ed, v_threshold
        ));
        m_c_rd_knm
    } else {
        let rho = ((2.0 * v_ed / v_pl_rd_kn) - 1.0).powi(2);
        let m_red = (1.0 - rho) * m_c_rd_knm;
        notes.push(format!("rho = (2 V_Ed/V_pl,Rd - 1)^2 = {:.4}; M_y,V,Rd = (1-rho) M_y,c,Rd = {:.3} kNm", rho, m_red));
        m_red
    };

    let uc = if m_v_rd > 0.0 { m_ed / m_v_rd } else { 0.0 };

    ResistanceCalc {
        id: "6.2.8_combined_mv".to_string(),
        title: "Bending and shear".to_string(),
        article: "art. 6.2.8".to_string(),
        force_state,
        formula_latex: r"M_{y,V,Rd} = M_{y,c,Rd} \text{ if } V_{z,Ed} \leq V_{z,pl,Rd}/2".to_string(),
        variables: vec![
            NamedValue { symbol: "V_{z,Ed}".to_string(), value: v_ed, unit: "kN".to_string() },
            NamedValue { symbol: "V_{z,pl,Rd}".to_string(), value: v_pl_rd_kn, unit: "kN".to_string() },
            NamedValue { symbol: "M_{y,c,Rd}".to_string(), value: m_c_rd_knm, unit: "kNm".to_string() },
        ],
        value: m_v_rd,
        unit: "kNm".to_string(),
        uc: Some(UnityCheck { ed: m_ed, rd: m_v_rd, uc, formula_latex: r"M_{y,Ed} / M_{y,V,Rd}".to_string() }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes,
    }
}
