//! SLS deflection check helper.

use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{ResistanceCalc, UnityCheck, CheckStatus, NamedValue};
use crate::input::DeflectionClass;

pub fn default_numerator(class: DeflectionClass, custom: u32) -> u32 {
    match class {
        DeflectionClass::Floor => 333,
        DeflectionClass::Roof => 250,
        DeflectionClass::Cantilever => 150,
        DeflectionClass::Custom => custom,
    }
}

pub fn check_deflection(
    actual_mm: f64,
    length_m: f64,
    class: DeflectionClass,
    limit_numerator: u32,
) -> ResistanceCalc {
    let numerator = default_numerator(class, limit_numerator);
    let limit_mm = (length_m * 1000.0) / numerator.max(1) as f64;
    let uc = if limit_mm > 0.0 { actual_mm / limit_mm } else { 0.0 };

    let class_label = match class {
        DeflectionClass::Floor => "Floor",
        DeflectionClass::Roof => "Roof",
        DeflectionClass::Cantilever => "Cantilever",
        DeflectionClass::Custom => "Custom",
    };

    ResistanceCalc {
        id: "sls_deflection".to_string(),
        title: "Deflection (SLS)".to_string(),
        article: "NEN-EN 1990 (SLS)".to_string(),
        force_state: ForceStateSnapshot { combination_id: 0, position_mm: 0.0, forces: InternalForces::default() },
        formula_latex: format!(r"\delta_{{lim}} = L / {}", numerator),
        variables: vec![
            NamedValue { symbol: "L".to_string(), value: length_m * 1000.0, unit: "mm".to_string() },
            NamedValue { symbol: "L_{type}".to_string(), value: numerator as f64, unit: format!("({})", class_label) },
        ],
        value: limit_mm,
        unit: "mm".to_string(),
        uc: Some(UnityCheck {
            ed: actual_mm, rd: limit_mm, uc,
            formula_latex: r"\delta / \delta_{lim}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![],
    }
}
