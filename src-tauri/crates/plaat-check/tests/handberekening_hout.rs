//! Handberekeningen voor de houtplaattoets (NEN-EN 1995-1-1 in de
//! materiaalassen).
//!
//! C24 (EN 338): f_t,0,k = 14, f_c,0,k = 21, f_c,90,k = 2,5, f_v,k = 4,0 N/mm².
//! γ_M = 1,30 massief hout (tabel 2.3 met de NB); GL24h: f_t,0,k = 19,2 en
//! γ_M = 1,25. Klimaatklasse 1, k_mod uit tabel 3.1: blijvend 0,60,
//! middellang 0,80, kort 0,90.
//!
//! Rekenwaarden C24 middellang (2.14), f_d = k_mod·f_k/γ_M:
//!   f_t,0,d  = 0,8·14/1,3  = 8,615385
//!   f_c,0,d  = 0,8·21/1,3  = 12,923077
//!   f_c,90,d = 0,8·2,5/1,3 = 1,538462
//!   f_v,d    = 0,8·4,0/1,3 = 2,461538

use approx::assert_relative_eq;
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use plaat_check::hout::{AFSCHUIF_ID, DRUK_0_ID, DRUK_90_ID, DRUK_HOEK_ID, TREK_0_ID, TREK_90_ID};
use plaat_check::{
    check_plate, PlaatCombinatie, PlaatElementSpanning, PlaatMateriaalSoort, PlateCheckInput,
    PlateCheckResult,
};
use steel_check::CheckKind;
use timber_check::CombinationLoadDuration;

fn el(id: u32, sx: f64, sy: f64, t: f64) -> PlaatElementSpanning {
    PlaatElementSpanning { element_id: id, sigma_x_mpa: sx, sigma_y_mpa: sy, tau_xy_mpa: t }
}

fn plaat(
    klasse: &str,
    hoek: f64,
    combinaties: Vec<(u32, LoadDurationClass, Vec<PlaatElementSpanning>)>,
) -> PlateCheckInput {
    PlateCheckInput {
        bijlage: Default::default(),
        plate_id: 5,
        soort: PlaatMateriaalSoort::Hout,
        materiaal: klasse.to_string(),
        thickness_mm: 100.0,
        plooi: None,
        hoofdrichting_graden: hoek,
        service_class: Some(ServiceClass::Sc1),
        load_duration_per_combination: combinaties
            .iter()
            .map(|(id, d, _)| CombinationLoadDuration { combination_id: *id, load_duration: *d, basis: String::new() })
            .collect(),
        notities: vec![],
        combinations: combinaties
            .into_iter()
            .map(|(id, _, elements)| PlaatCombinatie { combination_id: id, elements })
            .collect(),
        wapening_aanwezig: None,
        expected_element_ids: None,
        mesh_fout: None,
        frequente_combinaties: vec![],
    }
}

fn toets<'a>(r: &'a PlateCheckResult, id: &str) -> &'a ResistanceCalc {
    let c = r.checks.iter().find(|c| c.id == id).unwrap_or_else(|| {
        panic!("toets {id} ontbreekt in {:?}", r.checks.iter().map(|c| &c.id).collect::<Vec<_>>())
    });
    let CheckKind::Resistance(calc) = &c.kind else { panic!() };
    calc
}

fn uc(r: &PlateCheckResult, id: &str) -> f64 {
    toets(r, id).uc.as_ref().unwrap().uc
}

const MID: LoadDurationClass = LoadDurationClass::MediumTerm;

// ── 1. Trek langs de vezel ───────────────────────────────────────────────
// Vezel horizontaal (0°), σ_x = 5 → σ₁ = 5, σ₂ = τ₁₂ = 0.
//   6.1.2: 5/8,615385 = 0,580357. Geen trek loodrecht → status Ok.
#[test]
fn trek_langs_de_vezel() {
    let r = check_plate(&plaat("C24", 0.0, vec![(1, MID, vec![el(1, 5.0, 0.0, 0.0)])]));
    assert!(r.geweigerd.is_none(), "{:?}", r.geweigerd);
    assert_relative_eq!(uc(&r, TREK_0_ID), 0.580_357, max_relative = 1e-5);
    assert_relative_eq!(r.uc_max, 0.580_357, max_relative = 1e-5);
    assert_eq!(r.status, CheckStatus::Ok);
    let fd = toets(&r, TREK_0_ID).deelstappen.iter().find(|d| d.id == "f_d").unwrap();
    assert_relative_eq!(fd.value.unwrap(), 8.615_385, max_relative = 1e-6);
    assert!(!r.niet_getoetst.iter().any(|n| n.id == TREK_90_ID));
    assert!(r.norm.contains("1995-1-1"));
}

// ── 2. Druk onder 30° met de vezel ───────────────────────────────────────
// σ_x = −6, vezel onder θ = 30°: c² = 0,75, s² = 0,25, s·c = 0,433013.
//   σ₁ = −6·0,75 = −4,5;  σ₂ = −6·0,25 = −1,5;  τ₁₂ = 6·0,433013 = 2,598076
//   6.1.4: 4,5/12,923077            = 0,348214
//   6.1.5: 1,5/(1,0·1,538462)       = 0,975000
//   6.1.7: 2,598076/2,461538        = 1,055469
//   6.2.2: hoofddrukspanning 6 langs x, α = 0 − 30 = −30°:
//          f_c,α,d = 12,923077/((12,923077/1,538462)·0,25 + 0,75)
//                  = 12,923077/(8,4·0,25 + 0,75) = 12,923077/2,85 = 4,534413
//          UC = 6/4,534413 = 1,323214 → maatgevend, NotOk.
#[test]
fn druk_onder_een_hoek_met_de_vezel() {
    let r = check_plate(&plaat("C24", 30.0, vec![(2, MID, vec![el(3, -6.0, 0.0, 0.0)])]));
    assert_relative_eq!(uc(&r, DRUK_0_ID), 0.348_214, max_relative = 1e-5);
    assert_relative_eq!(uc(&r, DRUK_90_ID), 0.975_000, max_relative = 1e-5);
    assert_relative_eq!(uc(&r, AFSCHUIF_ID), 1.055_469, max_relative = 1e-5);
    assert_relative_eq!(uc(&r, DRUK_HOEK_ID), 1.323_214, max_relative = 1e-5);
    assert_eq!(r.governing_check_id, DRUK_HOEK_ID);
    assert_eq!(r.status, CheckStatus::NotOk);
    let fca = toets(&r, DRUK_HOEK_ID).deelstappen.iter().find(|d| d.id == "f_c_alfa_d").unwrap();
    assert_relative_eq!(fca.value.unwrap(), 4.534_413, max_relative = 1e-6);
    assert_eq!(toets(&r, DRUK_HOEK_ID).article, "art. 6.2.2 (6.16)");
}

// ── 3. Trek loodrecht op de vezel: niet getoetst, bepaalt de status ──────
// Vezel verticaal (90°), σ_x = 0,2 → σ₂ = 0,2 (trek loodrecht), σ₁ = 0.
// 6.1.3 geeft geen uitdrukking → niet getoetst, status NotApplicable.
#[test]
fn trek_loodrecht_op_de_vezel_is_niet_getoetst() {
    let r = check_plate(&plaat("C24", 90.0, vec![(1, MID, vec![el(1, 0.2, -1.0, 0.0)])]));
    assert!(r.geweigerd.is_none());
    let n = r.niet_getoetst.iter().find(|n| n.id == TREK_90_ID).expect("6.1.3 vermeld");
    assert!(n.bepaalt_status);
    assert!(n.reden.contains("volume-effect"), "{}", n.reden);
    assert!(n.reden.contains("0,2"), "{}", n.reden);
    // Issue #25 (3): de reden is normgebaseerd en expliciet — 6.1.3 zonder
    // uitdrukking, k_vol (6.51) alleen voor 6.4.3(6), geen aangenomen regel, en
    // de uitweg binnen de norm: trek loodrecht op de vezel vermijden.
    for woord in ["6.1.3(1)P", "k_vol", "(6.51)", "6.4.3(6)", "geen uitdrukking", "n.v.t.", "niet optreedt"] {
        assert!(n.reden.contains(woord), "{woord:?} ontbreekt in: {}", n.reden);
    }
    assert_eq!(
        n.reden,
        plaat_check::hout::reden_trek_loodrecht(0.2, 1, 1, nen_en_1995_1_1::TimberType::Solid)
    );
    // σ₁ = σ_y = −1 → druk langs de vezel: 1/12,923077 = 0,077381, getoetst.
    assert_relative_eq!(uc(&r, DRUK_0_ID), 0.077_381, max_relative = 1e-5);
    assert_eq!(r.status, CheckStatus::NotApplicable);
}

// ── 4. k_mod per combinatie ──────────────────────────────────────────────
// σ_x = 5, vezel 0°:
//   blijvend: f_t,0,d = 0,6·14/1,3 = 6,461538 → UC 0,773810
//   kort:     f_t,0,d = 0,9·14/1,3 = 9,692308 → UC 0,515873
// Maatgevend: de blijvende combinatie, ook al is de spanning gelijk.
#[test]
fn k_mod_per_combinatie() {
    let r = check_plate(&plaat(
        "C24",
        0.0,
        vec![
            (1, LoadDurationClass::ShortTerm, vec![el(1, 5.0, 0.0, 0.0)]),
            (2, LoadDurationClass::Permanent, vec![el(1, 5.0, 0.0, 0.0)]),
        ],
    ));
    assert_relative_eq!(r.uc_max, 0.773_810, max_relative = 1e-5);
    assert_eq!(r.governing_combination_id, Some(2));
    let kort = r.combinaties.iter().find(|c| c.combination_id == 1).unwrap();
    assert_relative_eq!(kort.uc, 0.515_873, max_relative = 1e-5);
    let km = toets(&r, TREK_0_ID).deelstappen.iter().find(|d| d.id == "k_mod").unwrap();
    assert_relative_eq!(km.value.unwrap(), 0.60);
}

// ── 5. Gelijmd gelamineerd hout ──────────────────────────────────────────
// GL24h, middellang: f_t,0,d = 0,8·19,2/1,25 = 12,288; σ = 6,144 → UC 0,5.
#[test]
fn gelijmd_gelamineerd_hout_met_zijn_gamma_m() {
    let r = check_plate(&plaat("GL24h", 0.0, vec![(1, MID, vec![el(1, 6.144, 0.0, 0.0)])]));
    assert_relative_eq!(r.uc_max, 0.5, max_relative = 1e-9);
}

// ── 6. Zuivere afschuiving, vezel horizontaal ────────────────────────────
// τ_xy = 1 → τ₁₂ = 1: 6.1.7 1/2,461538 = 0,406250.
// Hoofdspanningen ±1 onder 45°; druk −1 met α = −45°:
//   f_c,α,d = 12,923077/(8,4·0,5 + 0,5) = 12,923077/4,7 = 2,749591 → UC 0,363690.
// σ₁ = σ₂ = 0: geen trek loodrecht, status Ok.
#[test]
fn zuivere_afschuiving() {
    let r = check_plate(&plaat("C24", 0.0, vec![(1, MID, vec![el(1, 0.0, 0.0, 1.0)])]));
    assert_relative_eq!(uc(&r, AFSCHUIF_ID), 0.406_250, max_relative = 1e-5);
    assert_relative_eq!(uc(&r, DRUK_HOEK_ID), 0.363_690, max_relative = 1e-5);
    assert_eq!(r.governing_check_id, AFSCHUIF_ID);
    assert_eq!(r.status, CheckStatus::Ok);
}

// ── 7. Weigeringen: niets aannemen ───────────────────────────────────────
#[test]
fn weigeringen_zonder_aanname() {
    let e = || vec![(1, MID, vec![el(1, 1.0, 0.0, 0.0)])];
    let mut zonder_klimaat = plaat("C24", 0.0, e());
    zonder_klimaat.service_class = None;
    let r = check_plate(&zonder_klimaat);
    assert!(r.geweigerd.as_deref().unwrap().contains("klimaatklasse"), "{r:?}");

    let mut zonder_duur = plaat("C24", 0.0, e());
    zonder_duur.load_duration_per_combination.clear();
    let r = check_plate(&zonder_duur);
    assert!(r.geweigerd.as_deref().unwrap().contains("belastingduurklasse"), "{r:?}");

    let r = check_plate(&plaat("C99", 0.0, e()));
    assert!(r.geweigerd.as_deref().unwrap().contains("C99"), "{r:?}");
    assert_eq!(r.status, CheckStatus::NotApplicable);
}

// ── 8. Kruislaaghout als plaat: geen normgrondslag, geweigerd met reden ──
// Issue #25 (4). Ook met een volledige, geldige houtinvoer (klimaatklasse,
// belastingduur, spanningen) komt er geen UC: de reden noemt het ontbreken
// van de normgrondslag, de productnorm/ETA die nodig is en het ontbrekende
// invoerveld voor die bron.
#[test]
fn kruislaaghout_als_plaat_geweigerd_met_reden() {
    let mut p = plaat("CLT C24 40/20/40", 0.0, vec![(1, MID, vec![el(1, 1.0, 0.0, 0.0)])]);
    p.soort = PlaatMateriaalSoort::Kruislaaghout;
    let r = check_plate(&p);
    let reden = r.geweigerd.as_deref().expect("kruislaaghout wordt geweigerd");
    assert_eq!(reden, plaat_check::REDEN_KRUISLAAGHOUT);
    for woord in ["NEN-EN 1995-1-1", "normgrondslag", "productnorm", "ETA", "invoerveld", "niet getoetst"] {
        assert!(reden.contains(woord), "{woord:?} ontbreekt in: {reden}");
    }
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert_eq!(r.uc_max, 0.0);
    assert!(r.checks.is_empty() && r.elementen.is_empty() && r.combinaties.is_empty());
}
