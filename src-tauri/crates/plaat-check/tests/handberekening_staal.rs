//! Handberekeningen voor de staalplaattoets (NEN-EN 1993-1-1 6.2.1(5)).
//!
//! Elke verwachte waarde is hieronder met de hand voorgerekend, zodat de test
//! niet met de implementatie meeschuift. f_y uit tabel 3.1, γ_M0 = 1,00 (NB bij
//! 6.1(1)).

use approx::assert_relative_eq;
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use plaat_check::{
    check_all_plates, check_plate, PlaatCombinatie, PlaatElementSpanning, PlaatMateriaalSoort,
    PlateCheckInput, PlateCheckResult, VLOEI_ID,
};
use steel_check::CheckKind;

fn el(id: u32, sx: f64, sy: f64, t: f64) -> PlaatElementSpanning {
    PlaatElementSpanning { element_id: id, sigma_x_mpa: sx, sigma_y_mpa: sy, tau_xy_mpa: t }
}

fn plaat(materiaal: &str, t_mm: f64, combinaties: Vec<(u32, Vec<PlaatElementSpanning>)>) -> PlateCheckInput {
    PlateCheckInput {
        bijlage: Default::default(),
        plate_id: 3,
        soort: PlaatMateriaalSoort::Staal,
        materiaal: materiaal.to_string(),
        thickness_mm: t_mm,
        plooi: None,
        notities: vec![],
        hoofdrichting_graden: 0.0,
        service_class: None,
        load_duration_per_combination: vec![],
        combinations: combinaties
            .into_iter()
            .map(|(id, elements)| PlaatCombinatie { combination_id: id, elements })
            .collect(),
        wapening_aanwezig: None,
        frequente_combinaties: vec![],
    }
}

fn vloei(r: &PlateCheckResult) -> &ResistanceCalc {
    let c = r.checks.iter().find(|c| c.id == VLOEI_ID).expect("vloeicriterium aanwezig");
    let CheckKind::Resistance(calc) = &c.kind else { panic!("geen weerstandstoets") };
    calc
}

fn deelstap_waarde(calc: &ResistanceCalc, id: &str) -> f64 {
    calc.deelstappen
        .iter()
        .find(|d| d.id == id)
        .and_then(|d| d.value)
        .unwrap_or_else(|| panic!("deelstap {id} ontbreekt"))
}

// ── 1. Zuivere trek ──────────────────────────────────────────────────────
//
// S235, t = 15 mm ≤ 40 mm → f_y = 235 N/mm², γ_M0 = 1,00 → f_y,d = 235.
// σ_x = 200, σ_z = 0, τ = 0.
//   (6.1): (200/235)² = 0,851064² = 0,724310 ≤ 1
//   σ_eq = 200 → UC = 200/235 = 0,851064
#[test]
fn zuivere_trek() {
    let r = check_plate(&plaat("S235", 15.0, vec![(1, vec![el(1, 200.0, 0.0, 0.0)])]));
    assert!(r.geweigerd.is_none(), "{:?}", r.geweigerd);
    assert_relative_eq!(r.uc_max, 0.851_064, max_relative = 1e-6);
    assert_eq!(r.status, CheckStatus::Ok);
    let calc = vloei(&r);
    assert_relative_eq!(calc.value, 200.0, max_relative = 1e-12);
    assert_relative_eq!(deelstap_waarde(calc, "f_y"), 235.0);
    assert_relative_eq!(deelstap_waarde(calc, "f_d"), 235.0);
    assert_relative_eq!(deelstap_waarde(calc, "criterium_6_1"), 0.724_310, max_relative = 1e-5);
    assert_eq!(calc.article, "art. 6.2.1(5) (6.1)");
}

// ── 2. Zuivere afschuiving ───────────────────────────────────────────────
//
// S235, t = 15 mm, τ = 100 N/mm².
//   (6.1): 3·(100/235)² = 3 · 0,181077 = 0,543232 ≤ 1
//   σ_eq = √3 · 100 = 173,2051 → UC = 173,2051/235 = 0,737043
// Dat is de grens τ = f_y,d/√3 = 135,68 N/mm² bij UC 1.
#[test]
fn zuivere_afschuiving() {
    let r = check_plate(&plaat("S235", 15.0, vec![(1, vec![el(1, 0.0, 0.0, 100.0)])]));
    assert_relative_eq!(r.uc_max, 0.737_043, max_relative = 1e-6);
    let calc = vloei(&r);
    assert_relative_eq!(calc.value, 173.205_08, max_relative = 1e-6);
    assert_relative_eq!(deelstap_waarde(calc, "criterium_6_1"), 0.543_232, max_relative = 1e-5);
    // Op de grens: τ = 235/√3.
    let grens = check_plate(&plaat("S235", 15.0, vec![(1, vec![el(1, 0.0, 0.0, 235.0 / 3f64.sqrt())])]));
    assert_relative_eq!(grens.uc_max, 1.0, max_relative = 1e-12);
    // Negatieve schuifspanning: zelfde UC.
    let neg = check_plate(&plaat("S235", 15.0, vec![(1, vec![el(1, 0.0, 0.0, -100.0)])]));
    assert_relative_eq!(neg.uc_max, r.uc_max, max_relative = 1e-12);
}

// ── 3. Combinatie, dikke plaat ───────────────────────────────────────────
//
// S355, t = 50 mm: 40 < t ≤ 80 → tabel 3.1: f_y = 335 N/mm².
// σ_x = 150, σ_z = −80, τ = 60.
//   σ_x² + σ_z² − σ_x·σ_z + 3τ² = 22500 + 6400 − (150·−80) + 3·3600
//                               = 22500 + 6400 + 12000 + 10800 = 51700
//   σ_eq = √51700 = 227,3763
//   (6.1) = 51700/335² = 51700/112225 = 0,460682
//   UC = 227,3763/335 = 0,678735
#[test]
fn combinatie_in_de_dikteklasse_40_tot_80() {
    let r = check_plate(&plaat("S355", 50.0, vec![(4, vec![el(9, 150.0, -80.0, 60.0)])]));
    assert_relative_eq!(r.uc_max, 0.678_735, max_relative = 1e-6);
    let calc = vloei(&r);
    assert_relative_eq!(calc.value, 227.376_3, max_relative = 1e-6);
    assert_relative_eq!(deelstap_waarde(calc, "f_y"), 335.0);
    assert_relative_eq!(deelstap_waarde(calc, "criterium_6_1"), 0.460_682, max_relative = 1e-5);
    // De dikteklasse staat bij f_y.
    let fy = calc.deelstappen.iter().find(|d| d.id == "f_y").unwrap();
    assert!(fy.notes[0].contains("40 mm < t ≤ 80 mm"), "{:?}", fy.notes);
    // Het negatieve getal staat tussen haakjes in de ingevulde regel.
    let seq = calc.deelstappen.iter().find(|d| d.id == "sigma_eq").unwrap();
    assert!(seq.ingevuld_latex.contains("(-80)^2"), "{}", seq.ingevuld_latex);
    assert_eq!(r.governing_element_id, Some(9));
    assert_eq!(r.governing_combination_id, Some(4));
}

// ── 4. Gelijke trek in twee richtingen ───────────────────────────────────
//
// σ_x = σ_z = 200: 200² + 200² − 200·200 = 200² → σ_eq = 200, zelfde UC als
// zuivere trek (0,851064). Zonder de kruisterm kwam er √2 · 200 uit.
#[test]
fn gelijke_trek_in_twee_richtingen() {
    let r = check_plate(&plaat("S235", 10.0, vec![(1, vec![el(1, 200.0, 200.0, 0.0)])]));
    assert_relative_eq!(r.uc_max, 0.851_064, max_relative = 1e-6);
}

// ── 5. Maatgevend element per combinatie en omhullende ───────────────────
//
// S235, f_y,d = 235.
//   combinatie 1: e1 σ_x = 100 → 100/235 = 0,425532
//                 e2 τ = 150    → √3·150/235 = 259,8076/235 = 1,105564
//   combinatie 2: e1 σ_x = 250 → 250/235 = 1,063830
//                 e2 τ = 50     → √3·50/235 = 86,6025/235 = 0,368521
// Per combinatie: 1 → e2 (1,105564); 2 → e1 (1,063830).
// Omhullende: e1 1,063830 uit combinatie 2; e2 1,105564 uit combinatie 1.
// Maatgevend: e2 in combinatie 1, NotOk.
#[test]
fn maatgevend_per_combinatie_en_omhullende() {
    let r = check_plate(&plaat(
        "S235",
        20.0,
        vec![
            (1, vec![el(1, 100.0, 0.0, 0.0), el(2, 0.0, 0.0, 150.0)]),
            (2, vec![el(1, 250.0, 0.0, 0.0), el(2, 0.0, 0.0, 50.0)]),
        ],
    ));
    assert_eq!(r.status, CheckStatus::NotOk);
    assert_relative_eq!(r.uc_max, 1.105_564, max_relative = 1e-6);
    assert_eq!((r.governing_element_id, r.governing_combination_id), (Some(2), Some(1)));

    assert_eq!(r.combinaties.len(), 2);
    assert_eq!((r.combinaties[0].combination_id, r.combinaties[0].element_id), (1, 2));
    assert_relative_eq!(r.combinaties[0].uc, 1.105_564, max_relative = 1e-6);
    assert_eq!((r.combinaties[1].combination_id, r.combinaties[1].element_id), (2, 1));
    assert_relative_eq!(r.combinaties[1].uc, 1.063_830, max_relative = 1e-6);

    assert_eq!(r.elementen.len(), 2);
    assert_eq!((r.elementen[0].element_id, r.elementen[0].combination_id), (1, 2));
    assert_relative_eq!(r.elementen[0].uc, 1.063_830, max_relative = 1e-6);
    assert_eq!((r.elementen[1].element_id, r.elementen[1].combination_id), (2, 1));
    assert_relative_eq!(r.elementen[1].uc, 1.105_564, max_relative = 1e-6);
}

// ── 6. Plooi staat als niet getoetst, bepaalt de status niet ─────────────
#[test]
fn plooi_staat_als_niet_getoetst() {
    let r = check_plate(&plaat("S235", 15.0, vec![(1, vec![el(1, -100.0, 0.0, 0.0)])]));
    assert_eq!(r.status, CheckStatus::Ok);
    let plooi = r.niet_getoetst.iter().find(|n| n.id == "en1993_1_5_plooi").expect("plooi vermeld");
    assert!(!plooi.bepaalt_status);
    assert!(plooi.reden.contains("NEN-EN 1993-1-5"));
    assert!(plooi.reden.contains("6.2.1(2)"));
    assert!(r.norm.contains("1993-1-1"));
}

// ── 7. Weigeringen: nooit een UC die als "voldoet" leest ─────────────────
#[test]
fn weigeringen_met_reden() {
    let geweigerd = |r: PlateCheckResult, woord: &str| {
        let reden = r.geweigerd.clone().unwrap_or_else(|| panic!("niet geweigerd: {r:?}"));
        assert!(reden.contains(woord), "{reden}");
        assert_eq!(r.status, CheckStatus::NotApplicable);
        assert!(r.checks.is_empty());
        assert!(r.elementen.is_empty());
    };
    let e = || vec![(1, vec![el(1, 10.0, 0.0, 0.0)])];
    // Boven 80 mm geeft tabel 3.1 geen f_y.
    geweigerd(check_plate(&plaat("S355", 81.0, e())), "80 mm");
    geweigerd(check_plate(&plaat("S500", 10.0, e())), "S500");
    geweigerd(check_plate(&plaat("S235", 0.0, e())), "dikte");
    geweigerd(check_plate(&plaat("S235", 10.0, vec![])), "geen elementspanningen");
    geweigerd(check_plate(&plaat("S235", 10.0, vec![(1, vec![el(1, f64::NAN, 0.0, 0.0)])])), "geen getal");
    for (soort, woord) in [
        (PlaatMateriaalSoort::Kruislaaghout, "kruislaaghout"),
        // Beton wordt sinds stap 3 getoetst; een onbekende klasse weigert.
        (PlaatMateriaalSoort::Beton, "betonklasse"),
        (PlaatMateriaalSoort::Vrij, "vrij materiaal"),
    ] {
        let mut p = plaat("X", 100.0, e());
        p.soort = soort;
        geweigerd(check_plate(&p), woord);
    }
}

// ── 8. De drie wegen lezen dezelfde JSON ─────────────────────────────────
#[test]
fn json_is_streng_en_rondreis_is_gelijk() {
    let invoer = plaat("S275", 12.0, vec![(1, vec![el(1, 120.0, -30.0, 40.0)])]);
    let tekst = serde_json::to_string(&invoer).unwrap();
    let terug: PlateCheckInput = serde_json::from_str(&tekst).unwrap();
    assert_eq!(terug, invoer);
    let fout = serde_json::from_str::<PlateCheckInput>(&tekst.replace("\"thickness_mm\"", "\"dikte\""))
        .unwrap_err()
        .to_string();
    assert!(fout.contains("unknown field"), "{fout}");
    let lijst = check_all_plates(vec![invoer.clone(), invoer]);
    assert_eq!(lijst.len(), 2);
    assert_eq!(
        serde_json::to_string(&lijst[0]).unwrap(),
        serde_json::to_string(&lijst[1]).unwrap()
    );
}
