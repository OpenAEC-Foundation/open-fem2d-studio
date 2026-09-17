//! Handberekeningen voor de betonplaattoets (NEN-EN 1992-1-1 bijlage F en de
//! betondrukdiagonaal).
//!
//! C30/37: f_ck = 30 N/mm² (tabel 3.1); α_cc = 1,0 (NB 3.1.6(1)P), γ_C = 1,5
//! (tabel 2.1N) → f_cd = 20 N/mm² (3.15).
//! ν' = 1 − 30/250 = 0,88 (6.57N, NB) → σ_Rd,max = 0,6·0,88·20 = 10,56 N/mm² (6.56).
//! Dikte t = 200 mm. De solver levert TREK positief; bijlage F rekent DRUK positief.

use approx::assert_relative_eq;
use nen_en_1993_1_1_section::CheckStatus;
use plaat_check::beton::{bijlage_f, DIAGONAAL_ID, DRUK_ID};
use plaat_check::{
    check_plate, PlaatCombinatie, PlaatElementSpanning, PlaatMateriaalSoort, PlateCheckInput,
};

fn el(id: u32, sx: f64, sz: f64, t: f64) -> PlaatElementSpanning {
    PlaatElementSpanning { element_id: id, sigma_x_mpa: sx, sigma_y_mpa: sz, tau_xy_mpa: t }
}

fn plaat(klasse: &str, elementen: Vec<PlaatElementSpanning>) -> PlateCheckInput {
    PlateCheckInput {
        bijlage: Default::default(),
        plate_id: 9,
        soort: PlaatMateriaalSoort::Beton,
        materiaal: klasse.to_string(),
        thickness_mm: 200.0,
        plooi: None,
        hoofdrichting_graden: 0.0,
        service_class: None,
        load_duration_per_combination: vec![],
        notities: vec![],
        combinations: vec![PlaatCombinatie { combination_id: 3, elements: elementen }],
        wapening_aanwezig: None,
        frequente_combinaties: vec![],
    }
}

// ── 1. Zuivere afschuiving ───────────────────────────────────────────────
// σ_Edx = σ_Edy = 0, |τ| = 3 → F.1(4) (0·0 ≤ 9), σ_Edx ≤ |τ|:
//   (F.2) f'_tdx = 3 − 0 = 3;  (F.3) f'_tdy = 3;  (F.4) σ_cd = 2·3 = 6
//   UC = 6/10,56 = 0,568182;  n_td = 3·200 = 600 kN/m in beide richtingen.
#[test]
fn zuivere_afschuiving() {
    let f = bijlage_f(0.0, 0.0, 3.0);
    assert_eq!(f.tak, "F.2–F.4");
    assert_relative_eq!(f.f_td_x, 3.0);
    assert_relative_eq!(f.f_td_z, 3.0);
    assert_relative_eq!(f.sigma_c, 6.0);
    let r = check_plate(&plaat("C30/37", vec![el(1, 0.0, 0.0, 3.0)]));
    assert!(r.geweigerd.is_none(), "{:?}", r.geweigerd);
    assert_eq!(r.governing_check_id, DIAGONAAL_ID);
    assert_relative_eq!(r.uc_max, 0.568_182, max_relative = 1e-5);
    let w = r.wapening.as_ref().unwrap();
    assert_relative_eq!(w.max_x.n_td_x_kn_per_m, 600.0, max_relative = 1e-12);
    assert_relative_eq!(w.max_z.n_td_z_kn_per_m, 600.0, max_relative = 1e-12);
    // Wapening nodig en niet getoetst → niet "voldoet".
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.niet_getoetst.iter().any(|n| n.id == "wapening_aanwezig" && n.bepaalt_status));
    let calc = match &r.checks[0].kind {
        steel_check::CheckKind::Resistance(c) => c,
        _ => panic!(),
    };
    let rd = calc.deelstappen.iter().find(|d| d.id == "sigma_rd_max").unwrap();
    assert_relative_eq!(rd.value.unwrap(), 10.56, max_relative = 1e-12);
    let fcd = calc.deelstappen.iter().find(|d| d.id == "f_cd").unwrap();
    assert_relative_eq!(fcd.value.unwrap(), 20.0, max_relative = 1e-12);
    assert!(r.norm.contains("1992-1-1"));
}

// ── 2. Tweeassige druk: geen berekende wapening ──────────────────────────
// σ_x = −8, σ_z = −4, τ = 2 → druk positief 8 en 4; 8·4 = 32 > 4 → F.1(3).
//   σ_c,max = (8+4)/2 + √(((8−4)/2)² + 2²) = 6 + √8 = 8,828427
//   UC = 8,828427/20 = 0,441421 (6.55); geen wapening → status Ok.
#[test]
fn tweeassige_druk_zonder_wapening() {
    let r = check_plate(&plaat("C30/37", vec![el(1, -8.0, -4.0, 2.0)]));
    assert_eq!(r.governing_check_id, DRUK_ID);
    assert_relative_eq!(r.uc_max, 0.441_421, max_relative = 1e-5);
    assert_eq!(r.status, CheckStatus::Ok);
    assert!(!r.niet_getoetst.iter().any(|n| n.bepaalt_status));
    let w = r.wapening.as_ref().unwrap();
    assert_eq!(w.max_x.n_td_x_kn_per_m, 0.0);
    assert_eq!(w.max_z.n_td_z_kn_per_m, 0.0);
}

// ── 3. Druk overheersend in x, trek in z ─────────────────────────────────
// σ_x = −6, σ_z = +1, τ = 2 → druk positief: σ_Edx = 6 (x), σ_Edy = −1 (z);
// σ_Edy is trek → F.1(4); σ_Edx = 6 > |τ| = 2:
//   (F.5) f'_tdx = 0
//   (F.6) f'_tdy = 2²/6 − (−1) = 0,666667 + 1 = 1,666667
//   (F.7) σ_cd = 6·(1 + (2/6)²) = 6·1,111111 = 6,666667
//   UC = 6,666667/10,56 = 0,631313;  n_td,z = 1,666667·200 = 333,333 kN/m, n_td,x = 0.
#[test]
fn druk_in_x_trek_in_z() {
    let f = bijlage_f(-6.0, 1.0, 2.0);
    assert_eq!(f.tak, "F.5–F.7");
    assert!(!f.x_is_z);
    assert_relative_eq!(f.f_td_x, 0.0);
    assert_relative_eq!(f.f_td_z, 1.666_667, max_relative = 1e-6);
    let r = check_plate(&plaat("C30/37", vec![el(1, -6.0, 1.0, 2.0)]));
    assert_relative_eq!(r.uc_max, 0.631_313, max_relative = 1e-5);
    let w = r.wapening.as_ref().unwrap();
    assert_relative_eq!(w.elementen[0].n_td_z_kn_per_m, 333.333_3, max_relative = 1e-6);
    assert_eq!(w.elementen[0].n_td_x_kn_per_m, 0.0);
}

// ── 4. Dezelfde toestand gedraaid: σ_Edx ligt langs z ────────────────────
// σ_x = +1, σ_z = −6, τ = 2 → nu is z de richting met de grootste druk; de
// wapening komt in x: n_td,x = 333,333 kN/m, n_td,z = 0; UC gelijk.
#[test]
fn gedraaide_toestand_verwisselt_de_richtingen() {
    let f = bijlage_f(1.0, -6.0, 2.0);
    assert!(f.x_is_z);
    assert_relative_eq!(f.f_td_x, 1.666_667, max_relative = 1e-6);
    assert_relative_eq!(f.f_td_z, 0.0);
    let r = check_plate(&plaat("C30/37", vec![el(1, 1.0, -6.0, 2.0)]));
    assert_relative_eq!(r.uc_max, 0.631_313, max_relative = 1e-5);
}

// ── 5. Zuivere trek in x ─────────────────────────────────────────────────
// σ_x = +2 → druk positief: x = −2, z = 0 → σ_Edx = 0 (z), σ_Edy = −2 (x).
// F.1(4), σ_Edx = 0 ≤ |τ| = 0: f'_td(z) = 0 − 0 = 0, f'_td(x) = 0 − (−2) = 2;
// σ_cd = 0 → UC 0.  n_td,x = 2·200 = 400 kN/m. Status NotApplicable.
#[test]
fn zuivere_trek_vraagt_wapening_zonder_betondruk() {
    let r = check_plate(&plaat("C30/37", vec![el(1, 2.0, 0.0, 0.0)]));
    assert_eq!(r.uc_max, 0.0);
    let w = r.wapening.as_ref().unwrap();
    assert_relative_eq!(w.elementen[0].n_td_x_kn_per_m, 400.0, max_relative = 1e-12);
    assert_eq!(w.elementen[0].n_td_z_kn_per_m, 0.0);
    assert_eq!(r.status, CheckStatus::NotApplicable);
}

// ── 5b. Eenassige druk zonder dwarsspanning ─────────────────────────────
// σ_z = −7,5 → druk positief: σ_Edx = 7,5 (z), σ_Edy = 0; formeel F.1(4)
// (7,5·0 ≤ 0) met (F.5)–(F.7): f'_td = 0 en σ_cd = 7,5. Geen trek in
// dwarsrichting → 6.5.2(1) (6.55): UC = 7,5/20 = 0,375 (en NIET 7,5/10,56).
// Geen wapening nodig → status Ok.
#[test]
fn eenassige_druk_zonder_dwarsspanning_rekent_met_f_cd() {
    let r = check_plate(&plaat("C30/37", vec![el(1, 0.0, -7.5, 0.0)]));
    assert_eq!(r.governing_check_id, DRUK_ID);
    assert_relative_eq!(r.uc_max, 0.375, max_relative = 1e-12);
    assert_eq!(r.status, CheckStatus::Ok);
}

// ── 6. Drukdiagonaal bezwijkt ────────────────────────────────────────────
// τ = 6 → σ_cd = 12 > 10,56 → UC 1,136364, NotOk (gaat voor NotApplicable).
#[test]
fn drukdiagonaal_boven_de_sterkte() {
    let r = check_plate(&plaat("C30/37", vec![el(1, 0.0, 0.0, 6.0)]));
    assert_relative_eq!(r.uc_max, 1.136_364, max_relative = 1e-5);
    assert_eq!(r.status, CheckStatus::NotOk);
}

// ── 7. Alleen de volledige klassenaam ────────────────────────────────────
// "C30" is een HOUTsterkteklasse (EN 338); als beton wordt hij geweigerd.
#[test]
fn korte_klassenaam_wordt_geweigerd() {
    let r = check_plate(&plaat("C30", vec![el(1, 0.0, 0.0, 1.0)]));
    assert!(r.geweigerd.as_deref().unwrap().contains("C30/37"), "{:?}", r.geweigerd);
}
