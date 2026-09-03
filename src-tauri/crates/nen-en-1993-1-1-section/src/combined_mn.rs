//! NEN-EN 1993-1-1 §6.2.9 — bending and axial interaction.

use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use crate::{SteelGrade, ResistanceCalc, UnityCheck, CheckStatus, NamedValue};
use crate::classification::CrossSectionClass;

pub fn check_combined_mn(
    p: &SectionProperties, _grade: &SteelGrade, class: CrossSectionClass,
    n_pl_rd_kn: f64, m_pl_y_rd_knm: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let n_ed = force_state.forces.n_ed.abs();
    let m_ed = force_state.forces.my_ed.abs();
    let mut notes = Vec::new();

    let m_n_rd = match class {
        CrossSectionClass::Class1 | CrossSectionClass::Class2 => {
            let n = n_ed / n_pl_rd_kn;
            let a = ((p.area_mm2 - 2.0 * p.b_mm * p.tf_mm) / p.area_mm2).min(0.5);
            if n <= a {
                notes.push(format!("n = {:.3} <= a = {:.3} -> M_N,y,Rd = M_pl,y,Rd (no reduction)", n, a));
                m_pl_y_rd_knm
            } else {
                let m_red = m_pl_y_rd_knm * (1.0 - n) / (1.0 - 0.5 * a);
                notes.push(format!("n = {:.3}, a = {:.3}, M_N,y,Rd = M_pl (1-n)/(1-0.5a) = {:.3} kNm", n, a, m_red));
                m_red
            }
        }
        CrossSectionClass::Class3 | CrossSectionClass::Class4 => {
            let combined_uc = (n_ed / n_pl_rd_kn) + (m_ed / m_pl_y_rd_knm);
            return ResistanceCalc {
                id: "6.2.9_combined_mn".to_string(),
                title: "Buiging en normaalkracht".to_string(),
                article: "art. 6.2.9".to_string(),
                force_state,
                formula_latex: r"\frac{N_{Ed}}{N_{Rd}} + \frac{M_{y,Ed}}{M_{y,Rd}} \leq 1".to_string(),
                variables: vec![
                    NamedValue { symbol: "N_{Ed}".to_string(), value: n_ed, unit: "kN".to_string() },
                    NamedValue { symbol: "N_{Rd}".to_string(), value: n_pl_rd_kn, unit: "kN".to_string() },
                    NamedValue { symbol: "M_{y,Ed}".to_string(), value: m_ed, unit: "kNm".to_string() },
                    NamedValue { symbol: "M_{y,Rd}".to_string(), value: m_pl_y_rd_knm, unit: "kNm".to_string() },
                ],
                value: combined_uc,
                unit: "-".to_string(),
                uc: Some(UnityCheck { ed: combined_uc, rd: 1.0, uc: combined_uc, formula_latex: r"N_{Ed}/N_{Rd} + M_{y,Ed}/M_{y,Rd}".to_string() }),
                status: if combined_uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
                notes: vec!["Class 3/4: linear elastic interaction".to_string()],
            };
        }
    };

    let uc = if m_n_rd > 0.0 { m_ed / m_n_rd } else { 0.0 };

    ResistanceCalc {
        id: "6.2.9_combined_mn".to_string(),
        title: "Buiging en normaalkracht".to_string(),
        article: "art. 6.2.9".to_string(),
        force_state,
        formula_latex: r"M_{N,y,Rd} = M_{pl,y,Rd} \cdot (1-n)/(1-0.5a)".to_string(),
        variables: vec![
            NamedValue { symbol: "N_{Ed}".to_string(), value: n_ed, unit: "kN".to_string() },
            NamedValue { symbol: "N_{pl,Rd}".to_string(), value: n_pl_rd_kn, unit: "kN".to_string() },
            NamedValue { symbol: "M_{pl,y,Rd}".to_string(), value: m_pl_y_rd_knm, unit: "kNm".to_string() },
        ],
        value: m_n_rd, unit: "kNm".to_string(),
        uc: Some(UnityCheck { ed: m_ed, rd: m_n_rd, uc, formula_latex: r"M_{y,Ed} / M_{N,y,Rd}".to_string() }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes,
    }
}
