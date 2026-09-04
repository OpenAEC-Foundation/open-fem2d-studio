//! Kruislaaghout — toetsing PER LAMEL (laag).
//!
//! Elke lengtelaag krijgt twee toetsen als [`ResistanceCalc`], zodat het
//! rapport ze los van elkaar met volledige afleiding kan tonen:
//!
//! - buiging §6.1.6 (6.11), enkelvoudig om de sterke as: de grootste
//!   buigspanning in de laag tegen f_m,d van de sterkteklasse van die laag;
//! - dwarskracht §6.1.7 (6.13): de grootste schuifspanning in de laag tegen
//!   f_v,d van die laag, met b_ef = k_cr·b (6.13a).
//!
//! Elke dwarslaag krijgt de rolschuifspanning als INFORMATIEVE regel: de
//! spanning wordt uitgerekend (bijlage B (B.9) met γ = 1, constant over de
//! dwarslaag), maar er is geen unity check. De rekenwaarde van de
//! rolschuifsterkte staat niet in NEN-EN 1995-1-1+A2:2014/NB:2013 — de norm
//! noemt f_v,90,d alleen bij naam in §9.1.2 voor lijf- en flensplaten,
//! zonder waarde — en niet in de sterkteklassen van EN 338. Een waarde
//! aannemen zou een verzonnen normwaarde zijn; de toets is daarom expliciet
//! weggelaten en dat staat als melding bij de regel. De spanning zelf blijft
//! zichtbaar zodat hij naast een gedeclareerde f_v,rol uit een
//! productverklaring gelegd kan worden.
//!
//! Aannamen (zie ook `clt.rs`):
//! - k_h = 1,0: §3.2(3) geeft de hoogtefactor voor een rechthoekig
//!   gezaagd element; een lamel in een verlijmde opbouw is dat niet.
//!   Weglaten is veilig-zijdig.
//! - k_m speelt niet: alleen buiging om de sterke as (plaatstrook).
//! - Spanningen zijn lineair over de hoogte per laag (bijlage B (B.7)+(B.8)
//!   met γ = 1); de toets vergelijkt de randspanning van de laag met f_m,d.
//!   Een splitsing in een normaalkracht- en een buigdeel (§6.2.3/§6.2.4)
//!   is hier niet toegepast; dat zou voor de buitenste lagen strenger
//!   uitvallen omdat f_t,0,d < f_m,d. Deze keuze volgt de gangbare praktijk
//!   voor verlijmde opbouwen en is als aanname in de rapportnotitie gezet.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

use crate::clt::{CltLayerOrientation, CltMechanics};

fn laagnaam(mech: &CltMechanics, idx: usize) -> String {
    let l = &mech.layers[idx];
    format!("laag {} ({}, {})", idx + 1, l.orientation.label_nl(), l.class.name)
}

fn laagligging(mech: &CltMechanics, idx: usize) -> String {
    let l = &mech.layers[idx];
    format!(
        "Laag {} ligt van z = {:.0} tot {:.0} mm vanaf de bovenkant (t = {:.0} mm); zwaartelijn op z₀ = {:.1} mm.",
        idx + 1,
        l.z_top_mm,
        l.z_bot_mm,
        l.thickness_mm(),
        mech.z0_mm
    )
}

/// Toets-id per laag, stabiel voor rapport en markering van de maatgevende laag.
pub fn bending_check_id(idx: usize) -> String {
    format!("clt_6.1.6_laag_{}", idx + 1)
}

pub fn shear_check_id(idx: usize) -> String {
    format!("clt_6.1.7_laag_{}", idx + 1)
}

pub fn rolling_shear_check_id(idx: usize) -> String {
    format!("clt_rolschuif_laag_{}", idx + 1)
}

/// §6.1.6 (6.11), enkelvoudige buiging om de sterke as, voor lengtelaag `idx`:
///
///   σ_m,i,d = E_i · M_y,Ed · z_i / (EI)_ef  ≤  f_m,d
///
/// met z_i de afstand van de zwaartelijn tot de maatgevende (verste) vezel
/// van de laag. Eenheden in de afleiding: E_i in N/mm², M in kNm, z in mm,
/// (EI)_ef in kNm² — vandaar de factor 10³ in de noemer:
/// N/mm² · kNm · mm / kNm² = N/mm² · 10⁻³.
pub fn check_layer_bending(
    mech: &CltMechanics,
    idx: usize,
    f_md_mpa: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let l = &mech.layers[idx];
    debug_assert_eq!(l.orientation, CltLayerOrientation::Longitudinal);
    let m_ed = force_state.forces.my_ed;
    let (s_top, s_bot) = mech.layer_edge_stresses(idx, m_ed);
    // Maatgevende vezel: de grootste absolute spanning en haar afstand tot z₀.
    let (sigma, z_vezel) = if s_top.abs() >= s_bot.abs() {
        (s_top, l.z_top_mm)
    } else {
        (s_bot, l.z_bot_mm)
    };
    let z_i = (z_vezel - mech.z0_mm).abs();
    let sigma_abs = sigma.abs();
    let uc = if f_md_mpa > 0.0 { sigma_abs / f_md_mpa } else { 0.0 };
    let status = if m_ed.abs() < 1e-12 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    let teken = if sigma < 0.0 { "druk" } else { "trek" };
    let notes = vec![
        laagligging(mech, idx),
        format!(
            "Maatgevende vezel op z = {:.0} mm ({}); spanning lineair over de laag: {:.2} N/mm² boven, {:.2} N/mm² onder.",
            z_vezel, teken, s_top, s_bot
        ),
        "Samengestelde doorsnede, starre verbinding (bijlage B met γ = 1): dwarslagen dragen niet mee in de spanrichting; k_h = 1,0.".to_string(),
    ];

    let i = idx + 1;
    ResistanceCalc {
        id: bending_check_id(idx),
        title: format!("Buiging {}", laagnaam(mech, idx)),
        article: "art. 6.1.6 (6.11)".to_string(),
        force_state,
        formula_latex: format!(
            r"\sigma_{{m,{i},d}} = \frac{{E_{{{i}}} \cdot M_{{y,Ed}} \cdot z_{{{i}}}}}{{(EI)_{{ef}} \cdot 10^{{3}}}} \le f_{{m,d}}"
        ),
        variables: vec![
            NamedValue { symbol: format!("E_{{{i}}}"), value: l.e_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"M_{y,Ed}".to_string(), value: m_ed.abs(), unit: "kNm".to_string() },
            NamedValue { symbol: format!("z_{{{i}}}"), value: z_i, unit: "mm".to_string() },
            NamedValue { symbol: r"(EI)_{ef}".to_string(), value: mech.ei_ef_knm2(), unit: "kNm²".to_string() },
            NamedValue { symbol: r"f_{m,d}".to_string(), value: f_md_mpa, unit: "N/mm²".to_string() },
        ],
        value: sigma_abs,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: sigma_abs,
            rd: f_md_mpa,
            uc,
            formula_latex: format!(r"\sigma_{{m,{i},d}} / f_{{m,d}}"),
        }),
        status,
        notes,
    }
}

/// §6.1.7 (6.13) voor lengtelaag `idx`:
///
///   τ_i,d = V_z,Ed · (ES)_i / ((EI)_ef · b_ef)  ≤  f_v,d
///
/// met (ES)_i het E-gewogen statisch moment op de hoogte in de laag waar τ
/// maximaal is (bijlage B (B.9) met γ = 1) en b_ef = k_cr·b (6.13a; de
/// Nederlandse NB geeft k_cr = 1,0 voor prismatische doorsneden).
/// Eenheden: V in kN, (ES) in kNm, (EI)_ef in kNm², b_ef in mm →
/// kN·kNm/(kNm²·mm) = kN/(m·mm) = N/mm², dimensioneel sluitend.
pub fn check_layer_shear(
    mech: &CltMechanics,
    idx: usize,
    f_vd_mpa: f64,
    k_cr: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let l = &mech.layers[idx];
    debug_assert_eq!(l.orientation, CltLayerOrientation::Longitudinal);
    let v_ed = force_state.forces.vz_ed;
    let sh = mech.layer_max_shear(idx, v_ed, k_cr);
    let b_ef = k_cr * mech.width_mm;
    let uc = if f_vd_mpa > 0.0 { sh.tau_mpa / f_vd_mpa } else { 0.0 };
    let status = if v_ed.abs() < 1e-12 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    let mut notes = vec![
        laagligging(mech, idx),
        format!("τ maximaal op z = {:.1} mm (E-gewogen statisch moment van het deel daarboven).", sh.z_mm),
    ];
    if (k_cr - 1.0).abs() > 1e-9 {
        notes.push(format!("b_ef = k_cr · b met k_cr = {k_cr:.2} (6.13a)"));
    } else {
        notes.push("k_cr = 1,0: NB bij 6.1.7, liggers met een prismatische doorsnede.".to_string());
    }

    let i = idx + 1;
    ResistanceCalc {
        id: shear_check_id(idx),
        title: format!("Dwarskracht {}", laagnaam(mech, idx)),
        article: "art. 6.1.7 (6.13)".to_string(),
        force_state,
        formula_latex: format!(
            r"\tau_{{{i},d}} = \frac{{V_{{z,Ed}} \cdot (ES)_{{{i}}}}}{{(EI)_{{ef}} \cdot b_{{ef}}}} \le f_{{v,d}}"
        ),
        variables: vec![
            NamedValue { symbol: r"V_{z,Ed}".to_string(), value: v_ed.abs(), unit: "kN".to_string() },
            NamedValue { symbol: format!("(ES)_{{{i}}}"), value: sh.es_nmm * 1e-6, unit: "kNm".to_string() },
            NamedValue { symbol: r"(EI)_{ef}".to_string(), value: mech.ei_ef_knm2(), unit: "kNm²".to_string() },
            NamedValue { symbol: r"b_{ef}".to_string(), value: b_ef, unit: "mm".to_string() },
            NamedValue { symbol: r"k_{cr}".to_string(), value: k_cr, unit: "-".to_string() },
            NamedValue { symbol: r"f_{v,d}".to_string(), value: f_vd_mpa, unit: "N/mm²".to_string() },
        ],
        value: sh.tau_mpa,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: sh.tau_mpa,
            rd: f_vd_mpa,
            uc,
            formula_latex: format!(r"\tau_{{{i},d}} / f_{{v,d}}"),
        }),
        status,
        notes,
    }
}

/// Rolschuifspanning in dwarslaag `idx` — INFORMATIEF, zonder unity check.
///
/// τ_r,i,d = V_z,Ed · (ES)_i / ((EI)_ef · b_ef), constant over de dwarslaag
/// (bijlage B (B.9) met γ = 1; in een laag met E = 0 verandert (ES) niet).
/// Er is geen f_v,rol in NEN-EN 1995-1-1/NB:2013 en niet in EN 338; de toets
/// is daarom weggelaten en de status is "niet van toepassing", met de reden
/// als notitie. `uc` is `None`, zodat de regel niet meetelt in UC_max.
pub fn rolling_shear_info(
    mech: &CltMechanics,
    idx: usize,
    k_cr: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let l = &mech.layers[idx];
    debug_assert_eq!(l.orientation, CltLayerOrientation::Transverse);
    let v_ed = force_state.forces.vz_ed;
    let sh = mech.layer_max_shear(idx, v_ed, k_cr);
    let b_ef = k_cr * mech.width_mm;

    let i = idx + 1;
    ResistanceCalc {
        id: rolling_shear_check_id(idx),
        title: format!("Rolschuiving {} — ter informatie", laagnaam(mech, idx)),
        article: "bijlage B (B.9)".to_string(),
        force_state,
        formula_latex: format!(
            r"\tau_{{r,{i},d}} = \frac{{V_{{z,Ed}} \cdot (ES)_{{{i}}}}}{{(EI)_{{ef}} \cdot b_{{ef}}}}"
        ),
        variables: vec![
            NamedValue { symbol: r"V_{z,Ed}".to_string(), value: v_ed.abs(), unit: "kN".to_string() },
            NamedValue { symbol: format!("(ES)_{{{i}}}"), value: sh.es_nmm * 1e-6, unit: "kNm".to_string() },
            NamedValue { symbol: r"(EI)_{ef}".to_string(), value: mech.ei_ef_knm2(), unit: "kNm²".to_string() },
            NamedValue { symbol: r"b_{ef}".to_string(), value: b_ef, unit: "mm".to_string() },
        ],
        value: sh.tau_mpa,
        unit: "N/mm²".to_string(),
        uc: None,
        status: CheckStatus::NotApplicable,
        notes: vec![
            laagligging(mech, idx),
            "Geen toets: de rekenwaarde van de rolschuifsterkte f_v,rol staat niet in NEN-EN 1995-1-1+A2:2014/NB:2013 (§9.1.2 noemt f_v,90,d alleen bij naam) en niet in de sterkteklassen van EN 338. De spanning is uitgerekend zodat hij naast een gedeclareerde waarde uit een productverklaring gelegd kan worden.".to_string(),
            "De rolschuifspanning is constant over de dwarslaag en gelijk aan de schuifspanning op de grens met de aangrenzende lengtelaag.".to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clt::CltLayup;
    use approx::assert_relative_eq;
    use mechanics::InternalForces;

    fn snap(v: f64, my: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 1,
            position_mm: 2500.0,
            forces: InternalForces { vz_ed: v, my_ed: my, ..Default::default() },
        }
    }

    fn vijflaags() -> CltMechanics {
        CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0, 20.0, 40.0], "C24").mechanics().unwrap()
    }

    #[test]
    fn buiging_buitenlaag_handberekening() {
        // σ_rand = 5,263 N/mm²; f_m,d C24 middellang klimaatklasse 1 = 14,77
        // → UC = 0,356.
        let m = vijflaags();
        let r = check_layer_bending(&m, 0, 14.769, snap(0.0, 20.0));
        assert_relative_eq!(r.value, 5.263, max_relative = 1e-3);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.3563, max_relative = 1e-3);
        assert_eq!(r.status, CheckStatus::Ok);
        assert_eq!(r.id, "clt_6.1.6_laag_1");
        // De ingevulde formule moet dimensioneel sluiten: E·M·z/(EI·10³).
        let e = r.variables.iter().find(|v| v.symbol == "E_{1}").unwrap().value;
        let z = r.variables.iter().find(|v| v.symbol == "z_{1}").unwrap().value;
        let ei = r.variables.iter().find(|v| v.symbol == "(EI)_{ef}").unwrap().value;
        assert_relative_eq!(e * 20.0 * z / (ei * 1e3), r.value, max_relative = 1e-9);
        assert_relative_eq!(z, 80.0);
    }

    #[test]
    fn buiging_middenlaag_kleiner() {
        let m = vijflaags();
        let r = check_layer_bending(&m, 2, 14.769, snap(0.0, 20.0));
        assert_relative_eq!(r.value, 1.316, max_relative = 1e-3);
        let z = r.variables.iter().find(|v| v.symbol == "z_{3}").unwrap().value;
        assert_relative_eq!(z, 20.0);
    }

    #[test]
    fn buiging_niet_van_toepassing_zonder_moment() {
        let m = vijflaags();
        let r = check_layer_bending(&m, 0, 14.769, snap(5.0, 0.0));
        assert_eq!(r.status, CheckStatus::NotApplicable);
    }

    #[test]
    fn dwarskracht_middenlaag_handberekening() {
        // τ_max = 0,0855 N/mm²; f_v,d = 2,46 → UC = 0,0347.
        let m = vijflaags();
        let r = check_layer_shear(&m, 2, 2.4615, 1.0, snap(10.0, 0.0));
        assert_relative_eq!(r.value, 0.08553, max_relative = 1e-3);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.03475, max_relative = 1e-3);
        assert_eq!(r.status, CheckStatus::Ok);
        // Dimensioneel: V·ES/(EI·b) met V kN, ES kNm, EI kNm², b mm.
        let es = r.variables.iter().find(|v| v.symbol == "(ES)_{3}").unwrap().value;
        let ei = r.variables.iter().find(|v| v.symbol == "(EI)_{ef}").unwrap().value;
        let b = r.variables.iter().find(|v| v.symbol == "b_{ef}").unwrap().value;
        assert_relative_eq!(10.0 * es / (ei * b), r.value, max_relative = 1e-9);
        assert_relative_eq!(es, 2.86e4, max_relative = 1e-9);
    }

    #[test]
    fn dwarskracht_buitenlaag_gelijk_aan_rolschuif() {
        let m = vijflaags();
        let buiten = check_layer_shear(&m, 0, 2.4615, 1.0, snap(10.0, 0.0));
        let rol = rolling_shear_info(&m, 1, 1.0, snap(10.0, 0.0));
        assert_relative_eq!(buiten.value, rol.value, max_relative = 1e-12);
        assert_relative_eq!(rol.value, 0.07895, max_relative = 1e-3);
    }

    #[test]
    fn rolschuif_is_informatief_zonder_uc() {
        let m = vijflaags();
        let r = rolling_shear_info(&m, 1, 1.0, snap(10.0, 0.0));
        assert!(r.uc.is_none());
        assert_eq!(r.status, CheckStatus::NotApplicable);
        assert_eq!(r.id, "clt_rolschuif_laag_2");
        assert!(r.notes.iter().any(|n| n.contains("f_v,rol")));
    }

    #[test]
    fn overschrijding_wordt_gemeld() {
        let m = vijflaags();
        // M = 60 kNm → σ = 15,79 > 14,77.
        let r = check_layer_bending(&m, 4, 14.769, snap(0.0, 60.0));
        assert!(r.uc.as_ref().unwrap().uc > 1.0);
        assert_eq!(r.status, CheckStatus::NotOk);
    }
}
