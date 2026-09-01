//! §7.2 doorbuiging (BGT) met kruip via k_def.
//!
//! Conform de referentie-uitwerking:
//!   w_fin,z = w_z + k_def · w_quasi-blijvend,z
//!   w_add,z = w_fin,z − w_BGT-blijvend,z
//! met de Nederlandse NB-grenswaarden w_fin <= L/250 (0,004·L) en
//! w_add <= L/333 (0,003·L).
//!
//! Verificatie (staaf 2): w_fin = −24,5 + 0,6·−24,5 = −39,2 mm;
//! UC = 39,2/(6342/250) = 1,55. w_add = −39,2 + 24,5 = −14,7 mm;
//! UC = 14,7/(6342/333) = 0,77.

use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

/// Eindzakking met kruip: w_fin = w_inst + k_def · w_quasi_perm (mm, met teken).
pub fn w_fin_mm(w_inst_mm: f64, k_def: f64, w_quasi_perm_mm: f64) -> f64 {
    w_inst_mm + k_def * w_quasi_perm_mm
}

/// Bijkomende zakking: w_add = w_fin − w_perm (mm, met teken).
pub fn w_add_mm(w_fin_mm: f64, w_perm_mm: f64) -> f64 {
    w_fin_mm - w_perm_mm
}

/// Standaard NB-noemers zoals gebruikt in de referentie-uitwerking.
pub const NOEMER_W_FIN: f64 = 250.0;
pub const NOEMER_W_ADD: f64 = 333.0;

fn doorbuigingstoets(
    id: &str,
    titel: &str,
    w_mm: f64,
    lengte_mm: f64,
    noemer: f64,
    formule: &str,
    extra: Vec<NamedValue>,
) -> ResistanceCalc {
    let grens = if noemer > 0.0 { lengte_mm / noemer } else { f64::INFINITY };
    let uc = if grens.is_finite() && grens > 0.0 { w_mm.abs() / grens } else { 0.0 };
    let mut variables = vec![
        NamedValue { symbol: "L".to_string(), value: lengte_mm, unit: "mm".to_string() },
        NamedValue { symbol: "w".to_string(), value: w_mm, unit: "mm".to_string() },
        NamedValue { symbol: "n".to_string(), value: noemer, unit: "(L/n)".to_string() },
    ];
    variables.extend(extra);
    ResistanceCalc {
        id: id.to_string(),
        title: titel.to_string(),
        article: "art. 7.2 + NB".to_string(),
        force_state: ForceStateSnapshot {
            combination_id: 0,
            position_mm: 0.0,
            forces: InternalForces::default(),
        },
        formula_latex: formule.to_string(),
        variables,
        value: grens,
        unit: "mm".to_string(),
        uc: Some(UnityCheck {
            ed: w_mm.abs(),
            rd: grens,
            uc,
            formula_latex: r"|w| / w_{max}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![],
    }
}

/// Beide doorbuigingstoetsen: w_fin (L/`noemer_fin`) en w_add (L/`noemer_add`).
///
/// Alle zakkingen in mm met teken (negatief = omlaag), conform de
/// referentie-uitwerking. `w_inst_mm` is de zakking onder de karakteristieke
/// BGT-combinatie, `w_quasi_perm_mm` onder de quasi-blijvende en `w_perm_mm`
/// onder de blijvende combinatie.
#[allow(clippy::too_many_arguments)]
pub fn check_deflection_pair(
    w_inst_mm: f64,
    w_quasi_perm_mm: f64,
    w_perm_mm: f64,
    k_def: f64,
    lengte_mm: f64,
    noemer_fin: f64,
    noemer_add: f64,
) -> (ResistanceCalc, ResistanceCalc) {
    let w_fin = w_fin_mm(w_inst_mm, k_def, w_quasi_perm_mm);
    let w_add = w_add_mm(w_fin, w_perm_mm);
    (
        doorbuigingstoets(
            "deflection_w_fin",
            "Doorbuiging w_fin (BGT)",
            w_fin,
            lengte_mm,
            noemer_fin,
            r"w_{fin,z} = w_z + k_{def} \cdot w_{qp,z}",
            vec![
                NamedValue { symbol: r"k_{def}".to_string(), value: k_def, unit: "-".to_string() },
                NamedValue { symbol: r"w_{qp}".to_string(), value: w_quasi_perm_mm, unit: "mm".to_string() },
            ],
        ),
        doorbuigingstoets(
            "deflection_w_add",
            "Doorbuiging w_add (BGT)",
            w_add,
            lengte_mm,
            noemer_add,
            r"w_{add,z} = w_{fin,z} - w_{perm,z}",
            vec![NamedValue { symbol: r"w_{perm}".to_string(), value: w_perm_mm, unit: "mm".to_string() }],
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn referentie_staaf2_doorbuiging() {
        // w_fin = −39,2 → UC 1,55; w_add = −14,7 → UC 0,77.
        let (fin, add) = check_deflection_pair(-24.5, -24.5, -24.5, 0.6, 6342.0, NOEMER_W_FIN, NOEMER_W_ADD);
        assert_relative_eq!(fin.uc.as_ref().unwrap().ed, 39.2, max_relative = 1e-3);
        assert_relative_eq!(fin.uc.as_ref().unwrap().uc, 1.55, max_relative = 5e-3);
        assert_eq!(fin.status, CheckStatus::NotOk);
        assert_relative_eq!(add.uc.as_ref().unwrap().ed, 14.7, max_relative = 1e-3);
        assert_relative_eq!(add.uc.as_ref().unwrap().uc, 0.77, max_relative = 5e-3);
        assert_eq!(add.status, CheckStatus::Ok);
    }

    #[test]
    fn referentie_staaf1_doorbuiging() {
        // w_inst = 4,3 mm → w_fin = 6,88; UC = 6,88/(3313/250) = 0,52;
        // w_add = 2,58; UC = 2,58/(3313/333) = 0,26.
        let (fin, add) = check_deflection_pair(-4.3, -4.3, -4.3, 0.6, 3313.0, NOEMER_W_FIN, NOEMER_W_ADD);
        assert_relative_eq!(fin.uc.as_ref().unwrap().uc, 0.52, max_relative = 1e-2);
        assert_relative_eq!(add.uc.as_ref().unwrap().uc, 0.26, max_relative = 1e-2);
    }

    #[test]
    fn w_add_zonder_kruip_op_blijvend_deel() {
        // Wanneer de quasi-blijvende combinatie alleen het blijvende deel bevat
        // is w_add het niet-blijvende deel plus de kruip op het blijvende deel.
        let w_fin = w_fin_mm(-10.0, 0.8, -6.0);
        assert_relative_eq!(w_fin, -14.8, max_relative = 1e-9);
        assert_relative_eq!(w_add_mm(w_fin, -6.0), -8.8, max_relative = 1e-9);
    }
}
