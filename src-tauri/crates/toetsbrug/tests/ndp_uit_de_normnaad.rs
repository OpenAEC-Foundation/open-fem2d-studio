//! Elke nationaal bepaalde parameter komt UIT DE NAAD — niet uit een los getal
//! in een normcrate.
//!
//! # Waarom deze test bestaat, en waarom hij hier staat
//!
//! De normnaad (`nationale-bijlage`) is alleen iets waard als de rekenkernen
//! haar werkelijk lezen. Een `const` die per ongeluk weer een cijfer krijgt in
//! plaats van een verwijzing, compileert zonder één klacht en levert precies
//! hetzelfde antwoord — tot de dag dat er een tweede bijlage is, en dan rekent
//! die met een Nederlands getal.
//!
//! Deze test legt de BRON (de rij van de bijlage) naast de WAARDE die de
//! normcrate werkelijk gebruikt, voor elke parameter afzonderlijk. Hij staat in
//! `toetsbrug` omdat dat de enige crate is die alle normcrates tegelijk in
//! beeld heeft; `nationale-bijlage` zelf kan ze niet zien (dat zou een cirkel
//! zijn) en een test per crate kan de tabel niet als geheel aflopen.
//!
//! # Wat GEEN NDP is, en hier dus niet hoort
//!
//! k_mod (tabel 3.1) en k_def (tabel 3.2) van EN 1995-1-1, en lambda en eta van
//! (3.19)-(3.22) van EN 1992-1-1. Die legt de Eurocode zelf vast — ze staan
//! niet in de NDP-lijst van het voorwoord, en ze in de naad zetten zou de
//! indruk wekken dat een ander land ze mag wijzigen.

use nationale_bijlage::{
    Aanduidingen, Kipmethode, NationaleBijlage, Ndp1990, Ndp1992, Ndp1993, Ndp1993Las, Ndp1995,
};

const B: NationaleBijlage = NationaleBijlage::NL;

// ── NEN-EN 1990 ─────────────────────────────────────────────────────────────

#[test]
fn en_1990_partiele_factoren_en_psi_komen_uit_de_naad() {
    let bron = Ndp1990::voor(B);
    use nen_en_1990::ConsequenceClass::{CC1, CC2, CC3};
    for (klasse, rij) in [(CC1, bron.uls_cc1), (CC2, bron.uls_cc2), (CC3, bron.uls_cc3)] {
        let (a, b) = klasse.uls_factoren();
        assert_eq!(
            (a.gamma_g_sup, a.gamma_g_inf, a.gamma_q, b.gamma_g_sup, b.gamma_g_inf, b.gamma_q),
            (
                rij.0.gamma_g_sup, rij.0.gamma_g_inf, rij.0.gamma_q,
                rij.1.gamma_g_sup, rij.1.gamma_g_inf, rij.1.gamma_q
            ),
            "tabel NB.4/NB.5 voor {}",
            klasse.name()
        );
    }
    assert_eq!((CC1.k_fi(), CC2.k_fi(), CC3.k_fi()), bron.k_fi, "K_FI bij tabel NB.4");
    assert_eq!(
        (nen_en_1990::EQU.gamma_g_sup, nen_en_1990::EQU.gamma_g_inf, nen_en_1990::EQU.gamma_q),
        (bron.equ.gamma_g_sup, bron.equ.gamma_g_inf, bron.equ.gamma_q),
        "tabel NB.3, EQU"
    );
    // Alle dertien rijen van tabel NB.2-A1.1, in volgorde.
    let hier = [
        nen_en_1990::PSI_A, nen_en_1990::PSI_B, nen_en_1990::PSI_C, nen_en_1990::PSI_C_MENIGTE,
        nen_en_1990::PSI_D, nen_en_1990::PSI_E, nen_en_1990::PSI_F, nen_en_1990::PSI_G,
        nen_en_1990::PSI_H, nen_en_1990::PSI_INDUSTRIE_KORT, nen_en_1990::PSI_INDUSTRIE_LANG,
        nen_en_1990::PSI_WIND, nen_en_1990::PSI_SNOW,
    ];
    assert_eq!(hier.len(), bron.psi.len());
    for (h, d) in hier.iter().zip(bron.psi.iter()) {
        assert_eq!(h.category, d.category);
        assert_eq!((h.psi0, h.psi1, h.psi2), (d.psi0, d.psi1, d.psi2), "psi {}", d.category);
    }
}

/// De doorbuigingsgrenzen van A1.4.3(3) zoals de staalkern ze werkelijk
/// gebruikt. Er is geen constante om naast te leggen — de getallen zaten in
/// `w_add_grens` — dus wordt de gebruikte noemer opgevraagd bij de kern zelf.
#[test]
fn en_1990_doorbuigingsgrenzen_komen_uit_de_naad() {
    use steel_check::deflection::w_add_grens;
    use steel_check::DeflectionClass;
    let bron = Ndp1990::voor(B);
    for (klasse, noemer) in [
        (DeflectionClass::FloorBrittlePartitions, bron.w_add_noemer_scheurgevoelig),
        (DeflectionClass::Roof, bron.w_add_noemer_overige_daken),
        (DeflectionClass::Floor, bron.w_add_noemer_intensief),
    ] {
        let g = w_add_grens(1000.0, klasse, 0, 0.0, false);
        assert_eq!(g.noemer, noemer, "A1.4.3(3) bij {klasse:?}");
    }
}

// ── NEN-EN 1992-1-1 ─────────────────────────────────────────────────────────

#[test]
fn en_1992_ndp_komen_uit_de_naad() {
    use nen_en_1992_1_1::factors::{eps_ud, gamma_c, gamma_s, DesignSituation};
    let bron = Ndp1992::voor(B);
    assert_eq!(gamma_c(DesignSituation::PersistentTransient), bron.gamma_c_blijvend);
    assert_eq!(gamma_s(DesignSituation::PersistentTransient), bron.gamma_s_blijvend);
    assert_eq!(gamma_c(DesignSituation::Accidental), bron.gamma_c_buitengewoon);
    assert_eq!(gamma_s(DesignSituation::Accidental), bron.gamma_s_buitengewoon);
    assert_eq!(nen_en_1992_1_1::ALPHA_CC, bron.alpha_cc);
    assert_eq!(nen_en_1992_1_1::GAMMA_CE, bron.gamma_ce);
    // eps_ud = f * eps_uk: de factor terugrekenen uit de functie zelf.
    assert_eq!(eps_ud(1.0), bron.eps_ud_factor);

    use nen_en_1992_1_1::dekking::{
        c_min_dur_mm, ExposureClass, StructuralClass, DEFAULT_STRUCTURAL_CLASS, DELTA_C_DEV_MM,
        DELTA_C_DUR_ADD_MM, DELTA_C_DUR_GAMMA_MM, DELTA_C_DUR_ST_MM,
    };
    assert_eq!(DELTA_C_DUR_GAMMA_MM, bron.delta_c_dur_gamma_mm);
    assert_eq!(DELTA_C_DUR_ST_MM, bron.delta_c_dur_st_mm);
    assert_eq!(DELTA_C_DUR_ADD_MM, bron.delta_c_dur_add_mm);
    assert_eq!(DELTA_C_DEV_MM, bron.delta_c_dev_mm);
    assert_eq!(
        Some(DEFAULT_STRUCTURAL_CLASS),
        StructuralClass::van_nummer(bron.constructieklasse_50_jaar),
        "NB bij 4.4.1.2(5)"
    );
    // Tabel 4.4N: elke cel die de dekkingsmodule teruggeeft staat in de rij van
    // de bijlage die bij die constructieklasse hoort.
    let klassen = [
        StructuralClass::S1, StructuralClass::S2, StructuralClass::S3,
        StructuralClass::S4, StructuralClass::S5, StructuralClass::S6,
    ];
    let kolommen = [
        ExposureClass::X0, ExposureClass::XC1, ExposureClass::XC2, ExposureClass::XC4,
        ExposureClass::XD1, ExposureClass::XD2, ExposureClass::XD3,
    ];
    for (r, klasse) in klassen.iter().enumerate() {
        for kolom in kolommen {
            let waarde = c_min_dur_mm(kolom, *klasse).expect("tabel 4.4N geeft een waarde");
            assert!(
                bron.c_min_dur_betonstaal[r].contains(&waarde),
                "c_min,dur {waarde} staat niet in rij {r} van tabel 4.4N in de naad"
            );
        }
    }
    // lambda_lim = coefficient * A * B * C / sqrt(n): met A = B = C = n = 1 is
    // de uitkomst de coefficient zelf.
    assert_eq!(
        nen_en_1992_1_1::kolom::lambda_lim_5_13n(1.0, 1.0, 1.0, 1.0).unwrap(),
        bron.lambda_lim_coefficient,
        "(5.13N) bij 5.8.3.1"
    );
    assert!(bron.lambda_lim_is_eis, "de NB stelt 5.8.3.1 als eis, niet als aanbeveling");
    assert_eq!(
        nen_en_1992_1_1::verankering::alpha_6(
            50.0,
            nen_en_1992_1_1::verankering::Verankeringssoort::Druk
        ),
        bron.alpha_6_druk,
        "tabel NB 8.3, regel Druk"
    );
}

// ── NEN-EN 1993-1-1 en NEN-EN 1993-1-8 ──────────────────────────────────────

#[test]
fn en_1993_ndp_komen_uit_de_naad() {
    let bron = Ndp1993::voor(B);
    for g in [
        nen_en_1993_1_1_section::S235, nen_en_1993_1_1_section::S275,
        nen_en_1993_1_1_section::S355, nen_en_1993_1_1_section::S420,
        nen_en_1993_1_1_section::S460,
    ] {
        assert_eq!(
            (g.gamma_m0, g.gamma_m1, g.gamma_m2),
            (bron.gamma_m0, bron.gamma_m1, bron.gamma_m2),
            "NB bij 6.1(1) voor {}",
            g.name
        );
    }
    assert_eq!(nen_en_1993_1_1_ltb::lambda_chi::LAMBDA_LT_0, bron.lambda_lt_0, "NB bij 6.3.2.3(1)");
    assert_eq!(nen_en_1993_1_1_ltb::lambda_chi::BETA_LT, bron.beta_lt, "NB bij 6.3.2.3(1)");
    // De kipmethode is geen getal maar een werkwijze; de naad draagt hem, en de
    // kipkern heeft er een uitputtende match op staan.
    assert_eq!(bron.kipmethode, Kipmethode::NbNbFiguren);

    assert_eq!(nen_en_1993_1_8_las::GAMMA_M2, Ndp1993Las::voor(B).gamma_m2, "NB:2011, tabel 2.1");
}

// ── NEN-EN 1995-1-1 ─────────────────────────────────────────────────────────

#[test]
fn en_1995_ndp_komen_uit_de_naad() {
    use nen_en_1995_1_1::factors::{gamma_m, TimberType};
    let bron = Ndp1995::voor(B);
    assert_eq!(gamma_m(TimberType::Solid), bron.gamma_m_massief, "tabel 2.3 / 2.4.1");
    assert_eq!(gamma_m(TimberType::Glulam), bron.gamma_m_gelamineerd, "tabel 2.3 / 2.4.1");
    // k_cr: een prismatische doorsnede (b_lijf >= b_flens) geeft de ene grens,
    // een lijf van minder dan de halve flensbreedte de andere.
    assert_eq!(
        nen_en_1995_1_1::shear::k_cr_nb(100.0, 100.0),
        bron.k_cr_prismatisch,
        "NB bij 6.1.7"
    );
    assert_eq!(nen_en_1995_1_1::shear::k_cr_nb(20.0, 100.0), bron.k_cr_dun_lijf, "NB bij 6.1.7");
    assert_eq!(nen_en_1995_1_1::deflection::NOEMER_W_FIN, bron.noemer_w_fin, "NB bij 7.2");
    assert_eq!(nen_en_1995_1_1::deflection::NOEMER_W_ADD, bron.noemer_w_add, "NB bij 7.2");
}

// ── De normaanduidingen ─────────────────────────────────────────────────────

#[test]
fn de_normaanduidingen_komen_uit_de_naad() {
    let a = Aanduidingen::voor(B);
    assert_eq!(report::NORM_STEEL, a.norm_staal_kort);
    assert_eq!(report::NORM_TIMBER, a.norm_hout_kort);
    assert_eq!(report::NORM_CONCRETE, a.norm_beton_kort);
    assert_eq!(report::NORM_TIMBER_FULL, a.norm_hout_omslag);
    // De kruislaaghouttoets schreef een derde schrijfwijze op papier; nu
    // dezelfde bron.
    assert_eq!(nen_en_1995_1_1::clt_toets::NORM_HOUT_AANDUIDING, a.norm_hout_vol);
}
