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
///
/// Doorbuigingsgrenzen zijn nationaal bepaald (7.2(2) staat in de NDP-lijst van
/// het voorwoord), dus komen de getallen uit de normnaad.
pub const NOEMER_W_FIN: f64 = crate::NDP.noemer_w_fin;
pub const NOEMER_W_ADD: f64 = crate::NDP.noemer_w_add;

/// Keurt de twee opgegeven noemers VOORDAT er getoetst wordt.
///
/// Een grenswaarde L/n bestaat alleen voor een eindige n > 0. Tot september
/// 2026 maakte [`check_deflection_pair`] van n <= 0 een oneindige grens met
/// UC 0 en status Ok: een toets die niets toetste maar slaagde. Hier is geen
/// "0 = afleiden" zoals bij de staalkern — beide velden hebben een
/// standaardwaarde (NB: L/250 en L/333) die geldt als het veld WEGBLIJFT; een
/// opgegeven 0 of negatief getal is dus altijd een invoerfout. De hout- en de
/// CLT-orkestratie weigeren de staaf dan met deze reden, zonder een noemer te
/// raden.
pub fn keur_noemers(noemer_fin: f64, noemer_add: f64) -> Result<(), String> {
    for (naam, n) in [("w_fin", noemer_fin), ("w_add", noemer_add)] {
        if !n.is_finite() || n <= 0.0 {
            return Err(format!(
                "noemer voor de doorbuiging {naam} is {n}: de grens L/n (art. 7.2 + NB) \
                 bestaat alleen voor n > 0 — er is niet getoetst"
            ));
        }
    }
    Ok(())
}

fn doorbuigingstoets(
    id: &str,
    titel: &str,
    w_mm: f64,
    lengte_mm: f64,
    noemer: f64,
    formule: &str,
    extra: Vec<NamedValue>,
) -> ResistanceCalc {
    let grens = if noemer.is_finite() && noemer > 0.0 { lengte_mm / noemer } else { f64::INFINITY };
    // Zonder eindige, positieve grens is er niets getoetst: geen UC (een UC
    // van 0 leest als "ruim voldaan") en geen status Ok. Via de orkestratie
    // komt het zover niet — `keur_noemers` weigert de staaf eerder — maar een
    // rechtstreekse aanroep mag evenmin een Ok zonder toets opleveren.
    let getoetst = grens.is_finite() && grens > 0.0;
    let uc = if getoetst { w_mm.abs() / grens } else { 0.0 };
    let mut variables = vec![
        NamedValue { symbol: "L".to_string(), value: lengte_mm, unit: "mm".to_string() },
        NamedValue { symbol: "w".to_string(), value: w_mm, unit: "mm".to_string() },
        NamedValue { symbol: "n".to_string(), value: noemer, unit: "(L/n)".to_string() },
    ];
    variables.extend(extra);
    ResistanceCalc {
        deelstappen: Vec::new(),
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
        uc: getoetst.then(|| UnityCheck {
            ed: w_mm.abs(),
            rd: grens,
            uc,
            formula_latex: r"|w| / w_{max}".to_string(),
        }),
        status: if !getoetst {
            CheckStatus::NotApplicable
        } else if uc <= 1.0 {
            CheckStatus::Ok
        } else {
            CheckStatus::NotOk
        },
        notes: if getoetst {
            vec![]
        } else {
            vec![format!(
                "Niet getoetst: noemer n = {noemer} geeft geen grenswaarde L/n (n moet groter dan nul zijn)."
            )]
        },
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

    /// Issue #9: een noemer van 0, negatief of niet eindig geeft geen grens.
    #[test]
    fn noemer_zonder_grens_is_nooit_ok() {
        for n in [0.0, -250.0, f64::NAN] {
            assert!(keur_noemers(n, NOEMER_W_ADD).unwrap_err().contains("w_fin"));
            assert!(keur_noemers(NOEMER_W_FIN, n).unwrap_err().contains("w_add"));
            let (fin, add) = check_deflection_pair(-5.0, -5.0, -5.0, 0.6, 5000.0, n, n);
            for c in [&fin, &add] {
                assert_eq!(c.status, CheckStatus::NotApplicable, "{} bij n = {n}", c.id);
                assert!(c.uc.is_none(), "{} bij n = {n}", c.id);
                assert!(c.notes.iter().any(|t| t.starts_with("Niet getoetst")));
            }
        }
        assert!(keur_noemers(NOEMER_W_FIN, NOEMER_W_ADD).is_ok());
    }
}
