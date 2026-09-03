//! NEN-EN 1993-1-1 §6.3.1 — uniform members in compression.

use std::f64::consts::PI;
use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{SteelGrade, NamedValue, UnityCheck, CheckStatus};
use crate::buckling_curve::{BucklingCurve, chi};
use crate::StabilityCalc;

const E_MPA: f64 = 210000.0;

pub fn n_b_rd(
    p: &SectionProperties, grade: &SteelGrade,
    length_y_m: f64, length_z_m: f64,
    curve_y: BucklingCurve, curve_z: BucklingCurve,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let lambda_y = (length_y_m * 1000.0) / p.iy_radius_mm;
    let lambda_z = (length_z_m * 1000.0) / p.iz_radius_mm;

    let lambda_1 = PI * (E_MPA / grade.fy_mpa).sqrt();
    let lambda_bar_y = lambda_y / lambda_1;
    let lambda_bar_z = lambda_z / lambda_1;

    let chi_y = chi(lambda_bar_y, curve_y.alpha());
    let chi_z = chi(lambda_bar_z, curve_z.alpha());

    let n_pl_rd = p.area_mm2 * grade.fy_mpa * 1e-3;
    let n_b_y = chi_y * n_pl_rd / grade.gamma_m1;
    let n_b_z = chi_z * n_pl_rd / grade.gamma_m1;
    let (n_b_rd_kn, governing_axis, chi_used) = if n_b_y <= n_b_z {
        (n_b_y, "y", chi_y)
    } else {
        (n_b_z, "z", chi_z)
    };

    let n_ed = force_state.forces.n_ed.abs();
    let uc = if n_b_rd_kn > 0.0 { n_ed / n_b_rd_kn } else { 0.0 };

    StabilityCalc {
        id: "6.3.1_buckling".to_string(),
        title: "Kolomknik".to_string(),
        article: "art. 6.3.1 (6.46)".to_string(),
        force_state,
        formula_latex: r"N_{b,Rd} = \chi \cdot A \cdot f_y / \gamma_{M1}".to_string(),
        variables: vec![
            NamedValue { symbol: "A".to_string(), value: p.area_mm2, unit: "mm²".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M1}".to_string(), value: grade.gamma_m1, unit: "-".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: r"\lambda_y".to_string(), value: lambda_y, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_z".to_string(), value: lambda_z, unit: "-".to_string() },
            NamedValue { symbol: r"\bar{\lambda}_y".to_string(), value: lambda_bar_y, unit: "-".to_string() },
            NamedValue { symbol: r"\bar{\lambda}_z".to_string(), value: lambda_bar_z, unit: "-".to_string() },
            NamedValue { symbol: r"\chi_y".to_string(), value: chi_y, unit: "-".to_string() },
            NamedValue { symbol: r"\chi_z".to_string(), value: chi_z, unit: "-".to_string() },
            NamedValue { symbol: r"\chi".to_string(), value: chi_used, unit: "-".to_string() },
        ],
        // Kolomknik heeft (nog) geen uitgeschreven afleiding; de tussenwaarden
        // blijven hier de weergave.
        deelstappen: vec![],
        value: n_b_rd_kn,
        unit: "kN".to_string(),
        uc: Some(UnityCheck { ed: n_ed, rd: n_b_rd_kn, uc, formula_latex: r"N_{Ed} / N_{b,Rd}".to_string() }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![format!("Governing axis: {}", governing_axis)],
    }
}
