//! De twee beslissingen die de aanroeper vóór de reparatie fout maakte, nu als
//! toetsbare functies: β/L_kip per kipveld (NB.NB.4.3) en de kipkromme uit
//! tabel 6.5 bij art. 6.3.2.3.

use approx::assert_relative_eq;
use nen_en_1993_1_1_ltb::{kipkromme_tabel_6_5, Kipprofiel, Kipveld};
use nen_en_1993_1_1_stability::buckling_curve::BucklingCurve;

fn veld(m_a: f64, m_b: f64, l_st: f64, tussen_gaffels: bool) -> Kipveld {
    Kipveld { l_st_mm: l_st, m_begin_knm: m_a, m_eind_knm: m_b, tussen_gaffels }
}

// ── β uit de eindmomenten (NB.NB.4.3) ─────────────────────────────────────

#[test]
fn beta_is_de_kleinste_gedeeld_door_de_grootste_eindmoment() {
    // M_1 = kleinste absolute waarde, M_2 = grootste. De volgorde waarin de
    // twee eindmomenten binnenkomen mag niets uitmaken.
    let (beta, groot) = veld(40.0, 100.0, 3000.0, false).beta_en_grootste_eindmoment();
    assert_relative_eq!(beta, 0.4, max_relative = 1e-12);
    assert_relative_eq!(groot, 100.0, max_relative = 1e-12);

    let (beta, groot) = veld(100.0, 40.0, 3000.0, false).beta_en_grootste_eindmoment();
    assert_relative_eq!(beta, 0.4, max_relative = 1e-12);
    assert_relative_eq!(groot, 100.0, max_relative = 1e-12);
}

#[test]
fn constant_moment_geeft_beta_plus_een() {
    // Tabel NB.NB.1 geval 1 met β = +1 geeft C₁ = 1,75 − 1,05 + 0,3 = 1,00,
    // en C₁ = 1 is het constante-momentgeval. β = +1 hoort dus bij twee gelijke
    // eindmomenten mét hetzelfde teken (enkelvoudige kromming).
    let (beta, _) = veld(90.0, 90.0, 4000.0, false).beta_en_grootste_eindmoment();
    assert_relative_eq!(beta, 1.0, max_relative = 1e-12);
    let (beta, _) = veld(-90.0, -90.0, 4000.0, false).beta_en_grootste_eindmoment();
    assert_relative_eq!(beta, 1.0, max_relative = 1e-12);
}

#[test]
fn dubbele_kromming_geeft_een_negatieve_beta() {
    // Tekenwisseling in de momentenlijn: het gunstigste geval, tot β = −1.
    let (beta, groot) = veld(50.0, -100.0, 4000.0, false).beta_en_grootste_eindmoment();
    assert_relative_eq!(beta, -0.5, max_relative = 1e-12);
    assert_relative_eq!(groot, -100.0, max_relative = 1e-12);

    let (beta, _) = veld(100.0, -100.0, 4000.0, false).beta_en_grootste_eindmoment();
    assert_relative_eq!(beta, -1.0, max_relative = 1e-12);
}

#[test]
fn zonder_eindmomenten_is_beta_nul() {
    // Vrij opgelegd onder alleen veldbelasting: beide eindmomenten nul. β is
    // dan onbepaald; 0 is de waarde die bij B* = 0 hoort, waar alle β-rijen
    // van figuur NB.NB.5 op C₁ = 1,13 samenkomen.
    let (beta, groot) = veld(0.0, 0.0, 5700.0, true).beta_en_grootste_eindmoment();
    assert_relative_eq!(beta, 0.0, epsilon = 1e-12);
    assert_relative_eq!(groot, 0.0, epsilon = 1e-12);
}

// ── L_kip: het gaffelgeval versus de formule (NB.NB.4.3) ──────────────────

#[test]
fn tussen_twee_gaffels_is_l_kip_gelijk_aan_l_st() {
    // "tussen twee gaffels: L_kip = L_st" — ongeacht β. Dit is de regel die
    // vóór de reparatie ontbrak: de formule werd onvoorwaardelijk toegepast en
    // maakte L_kip bij β = 0 een factor 1,4 te lang.
    for beta in [-1.0, -0.5, 0.0, 0.5, 1.0] {
        let v = veld(0.0, 0.0, 5700.0, true);
        assert_relative_eq!(v.l_kip_mm(beta), 5700.0, max_relative = 1e-12);
    }
}

#[test]
fn tussen_gaffel_en_kipsteun_geldt_de_formule_met_beta() {
    // L_kip = (1,4 − 0,8·β)·L_st, met 1,0 ≤ L_kip/L_st ≤ 1,4 — tweezijdig
    // begrensd, niet alleen naar beneden.
    let v = veld(0.0, 100.0, 2666.67, false);
    assert_relative_eq!(v.l_kip_mm(0.0), 3733.34, max_relative = 1e-5); // bovengrens exact geraakt
    assert_relative_eq!(v.l_kip_mm(0.25), 3200.0, max_relative = 1e-3);
    assert_relative_eq!(v.l_kip_mm(0.5), 2666.67, max_relative = 1e-9); // ondergrens 1,0
    assert_relative_eq!(v.l_kip_mm(1.0), 2666.67, max_relative = 1e-9); // rekenkundig 0,6 → 1,0
    assert_relative_eq!(v.l_kip_mm(-1.0), 3733.34, max_relative = 1e-5); // rekenkundig 2,2 → 1,4
}

// ── Kipkromme: tabel 6.5 bij art. 6.3.2.3 ─────────────────────────────────

#[test]
fn tabel_6_5_gewalste_i_profielen() {
    // h/b ≤ 2 → kromme b (α_LT = 0,34); h/b > 2 → kromme c (0,49).
    // HEB 300: 300/300 = 1,0 → b. IPE 330: 330/160 = 2,0625 → c.
    assert_eq!(kipkromme_tabel_6_5(Kipprofiel::GewalsteI, 300.0, 300.0), BucklingCurve::B);
    assert_eq!(kipkromme_tabel_6_5(Kipprofiel::GewalsteI, 330.0, 160.0), BucklingCurve::C);
    // Precies op de grens h/b = 2 telt nog als "≤ 2".
    assert_eq!(kipkromme_tabel_6_5(Kipprofiel::GewalsteI, 320.0, 160.0), BucklingCurve::B);
    assert_relative_eq!(
        kipkromme_tabel_6_5(Kipprofiel::GewalsteI, 330.0, 160.0).alpha(),
        0.49,
        max_relative = 1e-12
    );
}

#[test]
fn tabel_6_5_gelaste_i_profielen_zijn_een_kromme_ongunstiger() {
    // h/b ≤ 2 → kromme c (0,49); h/b > 2 → kromme d (0,76).
    assert_eq!(kipkromme_tabel_6_5(Kipprofiel::GelasteI, 300.0, 300.0), BucklingCurve::C);
    assert_eq!(kipkromme_tabel_6_5(Kipprofiel::GelasteI, 430.0, 200.0), BucklingCurve::D);
    assert_relative_eq!(
        kipkromme_tabel_6_5(Kipprofiel::GelasteI, 430.0, 200.0).alpha(),
        0.76,
        max_relative = 1e-12
    );
}

#[test]
fn tabel_6_5_kent_geen_rij_voor_overige_doorsneden() {
    // Kokers en buizen staan niet in tabel 6.5. Aangehouden is kromme d, de
    // ongunstigste rij van de tabel — een expliciete keuze buiten de tabel om.
    assert_eq!(kipkromme_tabel_6_5(Kipprofiel::Overig, 200.0, 200.0), BucklingCurve::D);
    assert_eq!(kipkromme_tabel_6_5(Kipprofiel::Overig, 350.0, 100.0), BucklingCurve::D);
}

#[test]
fn de_kipkromme_is_niet_de_kolomknikkromme_van_tabel_6_2() {
    // Valkuil met gevolgen: de profieldatabase draagt per profiel
    // `buckling_curves.y_axis/z_axis` mee. Dat zijn KOLOMKNIK-krommen (tabel
    // 6.2, grens h/b = 1,2). IPE 330 staat daar op a en b; voor KIP hoort hij
    // op c. Wie de databasewaarde voor α_LT hergebruikt, rekent te gunstig.
    let kip = kipkromme_tabel_6_5(Kipprofiel::GewalsteI, 330.0, 160.0);
    assert_eq!(kip, BucklingCurve::C);
    assert_ne!(kip, BucklingCurve::A);
    assert_ne!(kip, BucklingCurve::B);
}
