//! NEN-EN 1993-1-1 §6.3.3 — uniform members in bending and axial compression.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{NamedValue, UnityCheck, CheckStatus};
use crate::StabilityCalc;
use crate::interaction_factors::InteractionFactors;

pub fn check_combined_n_my(
    n_ed_kn: f64, n_b_rd_y_kn: f64,
    m_y_ed_knm: f64, m_b_rd_knm: f64,
    m_z_ed_knm: f64, m_z_rd_knm: f64,
    factors: InteractionFactors,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let term_n = n_ed_kn / n_b_rd_y_kn;
    let term_my = factors.k_yy * m_y_ed_knm.abs() / m_b_rd_knm;
    let term_mz = if m_z_rd_knm > 0.0 { factors.k_yz * m_z_ed_knm.abs() / m_z_rd_knm } else { 0.0 };
    let uc = term_n + term_my + term_mz;

    StabilityCalc {
        id: "6.3.3_eq_6_61".to_string(),
        title: "Combined N + M (member y)".to_string(),
        article: "art. 6.3.3 (6.61)".to_string(),
        force_state,
        formula_latex: r"\frac{N_{Ed}}{\chi_y N_{Rk}/\gamma_{M1}} + k_{yy}\frac{M_{y,Ed}}{\chi_{LT} M_{y,Rk}/\gamma_{M1}} + k_{yz}\frac{M_{z,Ed}}{M_{z,Rk}/\gamma_{M1}} \leq 1".to_string(),
        variables: vec![
            NamedValue { symbol: "k_{yy}".to_string(), value: factors.k_yy, unit: "-".to_string() },
            NamedValue { symbol: "k_{yz}".to_string(), value: factors.k_yz, unit: "-".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: "term_N".to_string(), value: term_n, unit: "-".to_string() },
            NamedValue { symbol: "term_{M_y}".to_string(), value: term_my, unit: "-".to_string() },
            NamedValue { symbol: "term_{M_z}".to_string(), value: term_mz, unit: "-".to_string() },
        ],
        value: uc,
        unit: "-".to_string(),
        uc: Some(UnityCheck { ed: uc, rd: 1.0, uc, formula_latex: "Sum of terms".to_string() }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![],
    }
}

pub fn check_combined_n_mz(
    n_ed_kn: f64, n_b_rd_z_kn: f64,
    m_y_ed_knm: f64, m_b_rd_knm: f64,
    m_z_ed_knm: f64, m_z_rd_knm: f64,
    factors: InteractionFactors,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let term_n = n_ed_kn / n_b_rd_z_kn;
    let term_my = factors.k_zy * m_y_ed_knm.abs() / m_b_rd_knm;
    let term_mz = if m_z_rd_knm > 0.0 { factors.k_zz * m_z_ed_knm.abs() / m_z_rd_knm } else { 0.0 };
    let uc = term_n + term_my + term_mz;

    StabilityCalc {
        id: "6.3.3_eq_6_62".to_string(),
        title: "Combined N + M (member z)".to_string(),
        article: "art. 6.3.3 (6.62)".to_string(),
        force_state,
        formula_latex: r"\frac{N_{Ed}}{\chi_z N_{Rk}/\gamma_{M1}} + k_{zy}\frac{M_{y,Ed}}{\chi_{LT} M_{y,Rk}/\gamma_{M1}} + k_{zz}\frac{M_{z,Ed}}{M_{z,Rk}/\gamma_{M1}} \leq 1".to_string(),
        variables: vec![
            NamedValue { symbol: "k_{zy}".to_string(), value: factors.k_zy, unit: "-".to_string() },
            NamedValue { symbol: "k_{zz}".to_string(), value: factors.k_zz, unit: "-".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: "term_N".to_string(), value: term_n, unit: "-".to_string() },
            NamedValue { symbol: "term_{M_y}".to_string(), value: term_my, unit: "-".to_string() },
            NamedValue { symbol: "term_{M_z}".to_string(), value: term_mz, unit: "-".to_string() },
        ],
        value: uc,
        unit: "-".to_string(),
        uc: Some(UnityCheck { ed: uc, rd: 1.0, uc, formula_latex: "Sum of terms".to_string() }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![],
    }
}
