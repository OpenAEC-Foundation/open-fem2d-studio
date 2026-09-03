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
        title: "Doorbuiging (BGT)".to_string(),
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

/// Eindzakking: w_fin = w_z − w_zeeg.
///
/// Beide in mm met teken (negatief = naar beneden). Een zeeg (pre-camber)
/// wordt in dezelfde tekenconventie opgegeven en compenseert de zakking.
pub fn w_fin_mm(w_z_mm: f64, w_pre_camber_mm: f64) -> f64 {
    w_z_mm - w_pre_camber_mm
}

/// Bijkomende zakking na oplevering: w_add = w_fin − w_BGT,permanent.
pub fn w_add_mm(w_fin_mm: f64, w_sls_permanent_mm: f64) -> f64 {
    w_fin_mm - w_sls_permanent_mm
}

/// Grenswaarde L/noemer in mm (bijv. noemer = 333 voor w_fin, 150 voor w_add).
pub fn grens_mm(lengte_mm: f64, noemer: f64) -> f64 {
    if noemer.abs() < 1e-9 { return f64::INFINITY; }
    lengte_mm / noemer
}

/// Noemer voor de bijkomende zakking w_add. Vast op 150 conform de
/// referentie-uitwerking (L/150), onafhankelijk van de klasse voor w_fin.
const W_ADD_NOEMER: f64 = 150.0;

/// Beide doorbuigingstoetsen: eindzakking w_fin (L/klasse) en bijkomende
/// zakking w_add (L/150).
pub fn check_deflection_pair(
    w_z_mm: f64,
    w_pre_camber_mm: f64,
    w_sls_permanent_mm: f64,
    length_m: f64,
    class: DeflectionClass,
    limit_numerator: u32,
) -> (ResistanceCalc, ResistanceCalc) {
    let lengte_mm = length_m * 1000.0;
    let noemer_fin = default_numerator(class, limit_numerator) as f64;

    let w_fin = w_fin_mm(w_z_mm, w_pre_camber_mm);
    let w_add = w_add_mm(w_fin, w_sls_permanent_mm);

    let calc = |id: &str, titel: &str, w: f64, noemer: f64, latex: &str| {
        let grens = grens_mm(lengte_mm, noemer);
        let uc = if grens.is_finite() && grens > 0.0 { w.abs() / grens } else { 0.0 };
        ResistanceCalc {
            id: id.to_string(),
            title: titel.to_string(),
            article: "NEN-EN 1990 (BGT)".to_string(),
            force_state: ForceStateSnapshot {
                combination_id: 0, position_mm: 0.0, forces: InternalForces::default(),
            },
            formula_latex: latex.to_string(),
            variables: vec![
                NamedValue { symbol: "L".to_string(), value: lengte_mm, unit: "mm".to_string() },
                NamedValue { symbol: "w".to_string(), value: w, unit: "mm".to_string() },
                NamedValue { symbol: "L/n".to_string(), value: noemer, unit: "-".to_string() },
            ],
            value: grens,
            unit: "mm".to_string(),
            uc: Some(UnityCheck {
                ed: w.abs(), rd: grens, uc,
                formula_latex: r"|w| / w_{max}".to_string(),
            }),
            status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
            notes: vec![],
        }
    };

    (
        calc(
            "deflection_w_fin", "Deflection w_fin (BGT)", w_fin, noemer_fin,
            r"w_{fin,z} = w_z - w_{zeeg,z}",
        ),
        calc(
            "deflection_w_add", "Deflection w_add (BGT)", w_add, W_ADD_NOEMER,
            r"w_{add,z} = w_{fin,z} - w_{BGT,perm,z}",
        ),
    )
}
