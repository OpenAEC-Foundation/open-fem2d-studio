//! §7.3 Scheurbeheersing — acceptatieproef tegen een externe
//! referentie-berekening, plus de handberekeningen die de keten vastpinnen.
//!
//! # De referentie
//!
//! `verificatie calculations/original/3066-5.3 bg-vloer.pdf` rekent een
//! plaatstrook van 1000 mm breed door en toetst de scheurbeheersing
//! uitdrukkelijk volgens **7.3.3** ("Control of cracking without direct
//! calculation … EN 1992-1-1 art.7.3.3"). Uit de invoer van dat rapport:
//!
//! * doorsnede 1: 1000 × 280 mm, Ø10-150 boven én onder;
//! * doorsnede 3: 1000 × 140 mm, Ø10-150 boven én onder;
//! * C20/25, B500B, milieuklasse XC1 aan beide zijden;
//! * toegepaste dekking 25 mm onder (40 mm boven), vereiste c_nom 15 mm;
//! * elementtype plaat, constructieklasse S4, geen beugels.
//!
//! Met dekking 25 mm en Ø10 ligt de staafas op 30 mm van de onderrand, dus
//! d = 250 mm bij h = 280 mm en d = 110 mm bij h = 140 mm; h − d = 30 mm in
//! beide gevallen.
//!
//! Het rapport meldt in de SLS-tabel per station: M_k, M_Rk, de toegepaste en
//! de maximale staafafstand, en de toegepaste en de maximale staafdiameter.
//!
//! | x [mm] | dsn. | M_k | M_Rk | s | s,max | Ø | Ø,max |
//! |---|---|---|---|---|---|---|---|
//! | 2458 | 1 | 24,6 | 38,4 | 150,0 | 150,0 | 10,0 | 8,5 |
//! | 4006 | 3 | 14,9 | 11,7 | 150,0 | 150,0 | 10,0 | 4,3 (voldoet niet) |
//! | 5000 | 3 | 1,0 | 16,8 | 150,0 | 150,0 | 10,0 | 4,3 |
//!
//! # Wat de kolommen s,max en Ø,max blijken te zijn
//!
//! Zij zijn per doorsnede CONSTANT — bij x = 5000 staat er dezelfde 4,3 mm als
//! bij x = 4006, terwijl M_k daar van 14,9 naar 1,0 kNm zakt. Het zijn dus niet
//! de grenzen bij de wérkelijke staalspanning, maar de grenzen bij de
//! **hoogst toelaatbare** staalspanning σ_s,max; M_Rk is het bijbehorende
//! moment en de eigenlijke toets is M_k ≤ M_Rk.
//!
//! Die σ_s,max is met deze tests teruggerekend en blijkt **320 N/mm²** te zijn.
//! Dat ene getal verklaart twee van de gerapporteerde kolommen tegelijk:
//!
//! * tabel 7.3N geeft bij σ_s = 320 N/mm² en w_k = 0,4 mm exact **150 mm** —
//!   de s,max uit het rapport;
//! * tabel 7.2N geeft daar Ø\*_s = 12 mm, en (7.6N) maakt daar
//!   12 · (2,2/2,9) · (0,4·140)/(2·30) = **8,50 mm** van — de Ø,max uit het
//!   rapport, bij h = 280 mm.
//!
//! De overgebleven verschillen staan bij de betreffende test, met de reden.

use mechanics::ForceStateSnapshot;
use nen_en_1992_1_1::data::{concrete_class_by_name, reinforcement_grade_by_name};
use nen_en_1992_1_1::dekking::ExposureClass;
use nen_en_1992_1_1::scheurwijdte::*;
use nen_en_1992_1_1::section::{ConcreteSection, RebarRow, ReinforcementCage};
use nen_en_1992_1_1::CheckStatus;

/// De staalspanning die de referentie als hoogst toelaatbare aanhoudt. Zie de
/// moduletekst: zij volgt uit s,max = 150 mm in tabel 7.3N bij w_k = 0,4 mm.
const SIGMA_S_MAX_REFERENTIE: f64 = 320.0;

/// Ø10-150 in een strook van 1000 mm. Het aantal staven is alleen voor A_s van
/// belang; de tabelweg van 7.3.3 gebruikt A_s niet, alleen Ø en s.
fn plaatkorf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 25.0,
        stirrup_diameter_mm: 0.0,
        top: RebarRow {
            count: 7,
            diameter_mm: 10.0,
        },
        bottom: RebarRow {
            count: 7,
            diameter_mm: 10.0,
        },
        ..ReinforcementCage::default()
    }
}

fn plaatinvoer(sigma_s: f64) -> Scheurinvoer {
    let mut inv = Scheurinvoer::buiging(
        sigma_s,
        // De drukzonehoogte doet in de tabelweg van 7.3.3 niet mee; hij is
        // alleen voor 7.3.4 nodig. Een reële waarde, zodat er niets raars
        // gebeurt als de invoer ooit ook in 7.3.4 wordt gebruikt.
        40.0,
        ExposureClass::XC1,
        Belastingsduur::Langdurend,
    );
    inv.staafafstand_mm = Some(150.0);
    // De referentie is een plaat in een gebouw, maar de vrijstelling van
    // 7.3.3(1) geldt pas bij h ≤ 200 mm — en zij toetst hier wél. Wij zetten
    // `plaat_in_gebouw` daarom uit bij h = 280 mm en aan noch uit bij h = 140:
    // zie de aparte test over de vrijstelling.
    inv.plaat_in_gebouw = false;
    inv.detaillering_9_3_toegepast = false;
    inv
}

fn snapshot(x_mm: f64) -> ForceStateSnapshot {
    ForceStateSnapshot {
        combination_id: 15,
        position_mm: x_mm,
        forces: Default::default(),
    }
}

// ---------------------------------------------------------------------------
// De acceptatieproef
// ---------------------------------------------------------------------------

#[test]
fn referentie_de_grenswaarde_xc1_is_0_40_mm_onder_de_frequente_combinatie() {
    // De referentie rekent XC1 met betonstaal. De door de nationale bijlage
    // GEAMENDEERDE tabel 7.1N geeft daar 0,40 mm, en wel onder de FREQUENTE
    // belastingscombinatie — niet de quasi-blijvende van de doorgehaalde
    // EN-tekst.
    assert_eq!(
        w_max_mm(ExposureClass::XC1, Elementtype::Betonstaal),
        Ok(0.40)
    );
    assert!(COMBINATIE_SCHEURWIJDTE.contains("frequente"));

    // De toegepaste dekking is 25 mm, de vereiste c_nom 15 mm. De NB staat dan
    // k_x = 25/15 = 1,667 toe (≤ 2). Ook dán blijft de kolom 0,4 mm van tabel
    // 7.2N/7.3N de hoogste die nog onder w_max past, dus de aflezing verandert
    // niet — precies wat de referentie laat zien.
    let kx = k_x(25.0, 15.0).unwrap();
    assert!((kx - 25.0 / 15.0).abs() < 1e-12);
    assert_eq!(
        phi_ster_s_mm(
            SIGMA_S_MAX_REFERENTIE,
            0.40 * kx,
            Tabelaflezing::Conservatief
        ),
        Ok(12.0)
    );
}

#[test]
fn referentie_doorsnede_1_1000x280_staafdiameter_en_staafafstand() {
    // Handberekening, zonder de code:
    //   d      = 280 − (25 + 0 + 10/2) = 250 mm  → h − d = 30 mm
    //   h_cr   = h/2 = 140 mm (rechthoek, zuivere buiging: de nullijn ligt vlak
    //            vóór het scheuren in het zwaartepunt van de bruto doorsnede)
    //   k_c    = 0,4·[1 − 0/(…)] = 0,4  (σ_c = 0, geen normaalkracht)
    //   Ø*_s   = 12 mm      (tabel 7.2N, σ_s = 320 N/mm², w_k = 0,4 mm)
    //   f_ctm  = 2,2 N/mm²  (tabel 3.1, C20/25)
    //   (7.6N) Ø_s = 12 · (2,2/2,9) · (0,4·140)/(2·30)
    //              = 12 · 0,75862069 · 0,93333333
    //              = 8,4965517 mm  → afgerond 8,5 mm
    //   s,max  = 150 mm     (tabel 7.3N, σ_s = 320 N/mm², w_k = 0,4 mm)
    let sec = ConcreteSection::rectangle(1000.0, 280.0);
    let cage = plaatkorf();
    let beton = concrete_class_by_name("C20/25").unwrap();
    let staal = reinforcement_grade_by_name("B500B").unwrap();
    let inv = plaatinvoer(SIGMA_S_MAX_REFERENTIE);
    let g = Scheurgegevens {
        section: &sec,
        cage: &cage,
        beton,
        staal,
        invoer: &inv,
    };

    // d en h_cr komen uit de module, niet uit de test.
    assert!((cage.d_mm(280.0) - 250.0).abs() < 1e-9);
    let (h_cr, afgeleid) = h_cr_of_afgeleid(&sec, &inv).unwrap();
    assert!((h_cr - 140.0).abs() < 1e-9);
    assert!(afgeleid);

    // Tabel 7.2N en (7.6N).
    let phi_ster =
        phi_ster_s_mm(SIGMA_S_MAX_REFERENTIE, 0.40, Tabelaflezing::Conservatief).unwrap();
    assert_eq!(phi_ster, 12.0);
    let phi_max = aangepaste_staafdiameter(
        phi_ster,
        beton.f_ctm,
        0.4,
        h_cr,
        280.0,
        250.0,
        Belastingsgeval::Buiging,
    )
    .unwrap();
    assert!(
        (phi_max - 8.496_551_724_137_93).abs() < 1e-9,
        "Ø_max = {phi_max}"
    );
    // Op de decimaal die de referentie afdrukt: 8,5 mm.
    assert_eq!(format!("{phi_max:.1}"), "8.5");

    // Tabel 7.3N.
    let s_max = staafafstand_max_mm(
        SIGMA_S_MAX_REFERENTIE,
        0.40,
        false,
        Tabelaflezing::Conservatief,
    )
    .unwrap();
    assert_eq!(s_max, 150.0);

    // En dezelfde twee getallen uit de toets zelf. De referentie meldt dat deze
    // doorsnede VOLDOET terwijl Ø = 10,0 mm groter is dan Ø,max = 8,5 mm: dat
    // mag, want 7.3.3(2) laat bij scheuren door belasting toe dat aan tabel
    // 7.2N ÓF aan tabel 7.3N wordt voldaan, en de staafafstand haalt het net
    // (150 tegen 150 mm).
    let r = check_scheurbeheersing_tabel(&g, snapshot(2458.0));
    assert_eq!(r.status, CheckStatus::Ok, "notes: {:?}", r.notes);
    let uc = r.uc.as_ref().unwrap();
    assert!((uc.uc - 1.0).abs() < 1e-9, "unity check = {}", uc.uc);
    assert!((uc.ed - 150.0).abs() < 1e-9);
    assert!((uc.rd - 150.0).abs() < 1e-9);
    assert!(
        r.notes
            .iter()
            .any(|n| n.contains("Staafdiameter: unity check 1.18")),
        "notes: {:?}",
        r.notes
    );
}

#[test]
fn referentie_doorsnede_3_1000x140_staafdiameter() {
    // Zelfde keten, halve hoogte:
    //   d     = 140 − 30 = 110 mm, h_cr = 70 mm, k_c = 0,4, Ø*_s = 12 mm
    //   (7.6N) Ø_s = 12 · (2,2/2,9) · (0,4·70)/(2·30)
    //              = 12 · 0,75862069 · 0,46666667 = 4,2482759 mm
    //
    // De referentie drukt 4,3 mm af, wij komen op 4,25 mm. VERSCHIL: 0,05 mm
    // (1,2 %). Het zit in f_ct,eff, niet in de tabel:
    //   * tabel 3.1 geeft voor C20/25 f_ctm = 2,2 N/mm² (afgerond), en dat is
    //     wat deze crate gebruikt;
    //   * de analytische betrekking in dezelfde tabel, f_ctm = 0,30 · f_ck^(2/3),
    //     geeft 0,30 · 20^(2/3) = 2,2104 N/mm².
    // Met 2,21042 wordt de uitkomst 12 · (2,21042/2,9) · 0,46666667 = 4,2684 mm,
    // en dát rondt af op 4,3. Bij h = 280 mm is het verschil onzichtbaar
    // (8,4966 tegen 8,5367; beide 8,5). De tabellen zijn dus niet aangeraakt;
    // het verschil zit in één invoergetal.
    let sec = ConcreteSection::rectangle(1000.0, 140.0);
    let cage = plaatkorf();
    let beton = concrete_class_by_name("C20/25").unwrap();

    let (h_cr, _) = h_cr_of_afgeleid(&sec, &plaatinvoer(SIGMA_S_MAX_REFERENTIE)).unwrap();
    assert!((h_cr - 70.0).abs() < 1e-9);
    assert!((cage.d_mm(140.0) - 110.0).abs() < 1e-9);

    let phi_max = aangepaste_staafdiameter(
        12.0,
        beton.f_ctm,
        0.4,
        h_cr,
        140.0,
        110.0,
        Belastingsgeval::Buiging,
    )
    .unwrap();
    assert!(
        (phi_max - 4.248_275_862_068_965).abs() < 1e-9,
        "Ø_max = {phi_max}"
    );

    // Met de onafgeronde f_ctm van de analytische betrekking uit tabel 3.1
    // komt er wél 4,3 uit. Deze regel toont dat het verschil één invoergetal is.
    let f_ctm_analytisch = 0.30 * 20f64.powf(2.0 / 3.0);
    assert!((f_ctm_analytisch - 2.210_418_899_184_231_7).abs() < 1e-12);
    let phi_max_analytisch = aangepaste_staafdiameter(
        12.0,
        f_ctm_analytisch,
        0.4,
        h_cr,
        140.0,
        110.0,
        Belastingsgeval::Buiging,
    )
    .unwrap();
    assert_eq!(format!("{phi_max_analytisch:.1}"), "4.3");
}

#[test]
fn referentie_het_oordeel_per_station_komt_overeen() {
    // De referentie toetst niet bij σ_s,max maar bij de wérkelijke
    // staalspanning: zij vergelijkt M_k met M_Rk. Omdat de staalspanning in een
    // gescheurde doorsnede evenredig met het moment loopt, volgt de werkelijke
    // σ_s uit haar eigen kolommen:
    //
    //   x = 2458: σ_s = 320 · 24,6/38,4 = 205,0 N/mm²   (M_k/M_Rk = 0,64)
    //   x = 4006: σ_s = 320 · 14,9/11,7 = 407,5 N/mm²   (M_k/M_Rk = 1,27)
    //
    // Die twee spanningen door onze eigen tabelweg gehaald moeten hetzelfde
    // oordeel geven: het eerste station voldoet, het tweede niet.
    let beton = concrete_class_by_name("C20/25").unwrap();
    let staal = reinforcement_grade_by_name("B500B").unwrap();
    let cage = plaatkorf();

    // --- x = 2458, doorsnede 1 (1000 × 280) ---
    let sigma_1 = SIGMA_S_MAX_REFERENTIE * 24.6 / 38.4;
    assert!((sigma_1 - 205.0).abs() < 0.05, "σ_s = {sigma_1}");
    let sec1 = ConcreteSection::rectangle(1000.0, 280.0);
    let inv1 = plaatinvoer(sigma_1);
    let g1 = Scheurgegevens {
        section: &sec1,
        cage: &cage,
        beton,
        staal,
        invoer: &inv1,
    };
    let r1 = check_scheurbeheersing_tabel(&g1, snapshot(2458.0));
    assert_eq!(r1.status, CheckStatus::Ok, "notes: {:?}", r1.notes);
    // Conservatief afgelezen valt σ_s = 205 op de regel 240 N/mm²:
    //   tabel 7.3N → s,max = 250 mm; 150/250 = 0,60
    //   tabel 7.2N → Ø*_s = 20 mm → (7.6N) 20·0,75862069·0,93333333 = 14,161 mm;
    //                10/14,161 = 0,706
    // De gunstigste van de twee is 0,60 (7.3.3(2) laat de keuze toe).
    let uc1 = r1.uc.as_ref().unwrap();
    assert!((uc1.uc - 0.60).abs() < 1e-9, "unity check = {}", uc1.uc);

    // --- x = 4006, doorsnede 3 (1000 × 140) ---
    let sigma_2 = SIGMA_S_MAX_REFERENTIE * 14.9 / 11.7;
    assert!((sigma_2 - 407.52).abs() < 0.01, "σ_s = {sigma_2}");
    let sec2 = ConcreteSection::rectangle(1000.0, 140.0);
    let inv2 = plaatinvoer(sigma_2);
    let g2 = Scheurgegevens {
        section: &sec2,
        cage: &cage,
        beton,
        staal,
        invoer: &inv2,
    };
    let r2 = check_scheurbeheersing_tabel(&g2, snapshot(4006.0));
    // Tabel 7.3N houdt op bij 360 N/mm²; die weg valt hier dus weg, en dat
    // wordt gemeld in plaats van stilzwijgend doorgerekend.
    assert!(
        r2.notes
            .iter()
            .any(|n| n.contains("boven de laatste regel van tabel 7.3N")),
        "notes: {:?}",
        r2.notes
    );
    // Tabel 7.2N, conservatief → regel 450 N/mm² → Ø*_s = 6 mm.
    //   (7.6N): 6 · (2,2/2,9) · (0,4·70)/(2·30) = 6·0,75862069·0,46666667
    //         = 2,1241 mm; 10/2,1241 = 4,708 > 1 → voldoet niet.
    assert_eq!(r2.status, CheckStatus::NotOk, "notes: {:?}", r2.notes);
    let uc2 = r2.uc.as_ref().unwrap();
    assert!(
        (uc2.rd - 2.124_137_931_034_482_7).abs() < 1e-9,
        "Ø_max = {}",
        uc2.rd
    );
    assert!(uc2.uc > 4.0, "unity check = {}", uc2.uc);
}

#[test]
fn referentie_wat_wij_niet_reproduceren_en_waarom() {
    // De kolom M_Rk van de referentie is een grootheid die deze module NIET
    // levert: het moment waarbij de staalspanning σ_s,max = 320 N/mm² wordt
    // bereikt. Onze module krijgt σ_s van de aanroeper en rekent geen
    // doorsnedeanalyse in de BGT. Ter controle is M_Rk hier met de klassieke
    // hefboomsarm z = 0,9 d nagerekend, zodat het verschil zichtbaar is:
    //
    //   A_s = (1000/150) · π/4 · 10² = 6,6667 · 78,53982 = 523,5988 mm²/m
    //   doorsnede 1: M_Rk = 523,5988 · 0,9·250 · 320 = 37,70 kNm  (ref. 38,4)
    //   doorsnede 3: M_Rk = 523,5988 · 0,9·110 · 320 = 16,59 kNm  (ref. 16,8
    //                bij x = 5000)
    //
    // Beide liggen binnen 2 % van de referentie; het restant zit in de
    // hefboomsarm (0,9 d is een benadering; de referentie rekent met de
    // gescheurde doorsnede, inclusief de drukwapening Ø10-150 boven en met een
    // door kruip verlaagde E_c,eff — haar profielinvoer noemt φ = 2,70).
    let a_s = (1000.0 / 150.0) * std::f64::consts::PI / 4.0 * 100.0;
    assert!((a_s - 523.598_775_598_298_9).abs() < 1e-9);
    let m_rk_1 = a_s * 0.9 * 250.0 * SIGMA_S_MAX_REFERENTIE / 1e6;
    let m_rk_3 = a_s * 0.9 * 110.0 * SIGMA_S_MAX_REFERENTIE / 1e6;
    assert!((m_rk_1 - 37.699).abs() < 0.01, "M_Rk,1 = {m_rk_1}");
    assert!((m_rk_3 - 16.588).abs() < 0.01, "M_Rk,3 = {m_rk_3}");
    assert!((m_rk_1 - 38.4).abs() / 38.4 < 0.02);
    assert!((m_rk_3 - 16.8).abs() / 16.8 < 0.02);

    // Het derde station van de referentie, x = 4006, valt hier BUITEN: daar
    // meldt zij M_Rk = 11,7 kNm terwijl dezelfde doorsnede bij x = 5000 op
    // 16,8 kNm komt. Dat verschil komt niet uit §7.3 maar uit de verankering:
    // de onderwapening van doorsnede 3 begint volgens haar wapeningsstaat op
    // x = 3819 met een verankeringslengte van 284 mm, zodat bij x = 4006 pas
    // (4006 − 3819)/284 = 66 % van de staafkracht is opgebouwd. Diezelfde
    // reductie zit in haar UGT-tabel (M_Rd = 20,0 kNm bij x = 4006 tegen
    // 25,6 kNm bij x = 5000). Verankering valt onder hoofdstuk 8 en zit niet
    // in deze module.
    let ontwikkeld: f64 = (4006.0 - 3819.0) / 284.0;
    assert!((ontwikkeld - 0.658).abs() < 0.001);
}

// ---------------------------------------------------------------------------
// De rekenweg van 7.3.4 op dezelfde plaatstrook
// ---------------------------------------------------------------------------

#[test]
fn rekenweg_7_3_4_op_de_plaatstrook_handberekend() {
    // Zelfde plaatstrook 1000 × 280, C20/25, Ø10-150, dekking 25 mm, XC1,
    // σ_s = 205 N/mm² (het station x = 2458 van de referentie), langdurend.
    // De drukzonehoogte in de gescheurde doorsnede is hier op 45 mm gesteld;
    // die komt in het echte gebruik van de aanroeper.
    //
    // Handberekening:
    //   d      = 250 mm
    //   h_c,ef = min{2,5·(280−250) = 75; (280−45)/3 = 78,333; 280/2 = 140} = 75 mm
    //   A_c,eff= 1000 · 75 = 75 000 mm²
    //   A_s    = 7 · π/4 · 10² = 549,77872 mm²  (de korf in deze test)
    //   ρ_p,eff= 549,77872/75 000 = 0,00733038
    //   α_e    = 200 000/30 000 = 6,6666667
    //   f/ρ    = 2,2/0,0073303829 = 300,1208...
    //   1+α_eρ = 1 + 0,0488692 = 1,0488692
    //   k_t    = 0,4 → aftrek = 0,4·300,1208·1,0488692 = 125,9146
    //   teller = 205 − 125,9146 = 79,0854 → /200 000 = 3,9542517e-4
    //   ondergrens = 0,6·205/200 000 = 6,15e-4  → DE ONDERGRENS IS MAATGEVEND
    //   c      = 25 mm (dekking op de langswapening; geen beugel)
    //   5(c+Ø/2) = 5·30 = 150 mm ≥ 150 mm → (7.11) mag
    //   s_r,max = 3,4·25 + 0,8·0,5·0,425·10/0,0073303829
    //           = 85 + 1,7/0,0073303829 = 85 + 231,9114885 = 316,9114885 mm
    //   NB-bovengrens: max{(50 − 0,8·20)·10; 15·10} = max{340; 150} = 340 mm
    //           → 316,91 ≤ 340, dus niet maatgevend
    //   w_k    = 316,9114885 · 6,15e-4 = 0,1949006 mm
    //   w_max  = 0,40 mm (XC1, NB) → unity check 0,48725
    let sec = ConcreteSection::rectangle(1000.0, 280.0);
    let cage = plaatkorf();
    let beton = concrete_class_by_name("C20/25").unwrap();
    let staal = reinforcement_grade_by_name("B500B").unwrap();
    let mut inv = plaatinvoer(205.0);
    inv.x_mm = 45.0;
    let g = Scheurgegevens {
        section: &sec,
        cage: &cage,
        beton,
        staal,
        invoer: &inv,
    };
    let r = check_scheurwijdte_berekend(&g, snapshot(2458.0));

    let a_s = 7.0 * std::f64::consts::PI / 4.0 * 100.0;
    let h_c_ef = h_c_ef_mm(280.0, 250.0, 45.0);
    assert!((h_c_ef - 75.0).abs() < 1e-9, "h_c,ef = {h_c_ef}");
    let rho = a_s / (1000.0 * 75.0);
    assert!((rho - 0.007_330_382_858_376_184).abs() < 1e-12, "ρ = {rho}");
    let (eps, ondergrens) = rekverschil(205.0, 0.4, 2.2, rho, 200_000.0 / 30_000.0).unwrap();
    assert!(
        ondergrens,
        "de ondergrens 0,6·σ_s/E_s hoort hier maatgevend te zijn"
    );
    assert!((eps - 6.15e-4).abs() < 1e-15, "ε = {eps}");
    let sr = scheurafstand(25.0, 10.0, rho, 0.8, 0.5, 20.0, Some(150.0), 280.0, 45.0).unwrap();
    assert_eq!(sr.bron, ScheurafstandBron::Vergelijking7_11);
    assert!(
        (sr.s_r_max_mm - 316.911_488_5).abs() < 1e-6,
        "s_r,max = {}",
        sr.s_r_max_mm
    );
    assert!((nb_bovengrens_s_r_max_mm(20.0, 10.0) - 340.0).abs() < 1e-12);

    let w_hand = sr.s_r_max_mm * eps;
    assert!((w_hand - 0.194_900_565).abs() < 1e-8, "w_k = {w_hand}");
    assert!(
        (r.value - w_hand).abs() < 1e-12,
        "toets: {} tegen hand: {w_hand}",
        r.value
    );
    assert!((r.uc.as_ref().unwrap().rd - 0.40).abs() < 1e-12);
    assert!((r.uc.as_ref().unwrap().uc - w_hand / 0.40).abs() < 1e-12);
    assert_eq!(r.status, CheckStatus::Ok);
    assert!(
        r.notes.iter().any(|n| n.contains("ondergrens 0,6")),
        "notes: {:?}",
        r.notes
    );
}

// ---------------------------------------------------------------------------
// De vrijstelling van 7.3.3(1)
// ---------------------------------------------------------------------------

#[test]
fn de_plaat_van_140_mm_is_pas_vrijgesteld_als_alle_voorwaarden_gelden() {
    let sec = ConcreteSection::rectangle(1000.0, 140.0);
    let cage = plaatkorf();
    let beton = concrete_class_by_name("C20/25").unwrap();
    let staal = reinforcement_grade_by_name("B500B").unwrap();

    // Zonder de bevestiging dat 9.3 is toegepast: gewoon toetsen.
    let inv = plaatinvoer(SIGMA_S_MAX_REFERENTIE);
    let g = Scheurgegevens {
        section: &sec,
        cage: &cage,
        beton,
        staal,
        invoer: &inv,
    };
    assert_ne!(
        check_scheurbeheersing_tabel(&g, snapshot(4006.0)).status,
        CheckStatus::NotApplicable
    );

    // Mét alle voorwaarden: 7.3.3(1) stelt vrij. h = 140 ≤ 200 mm.
    let mut inv2 = inv;
    inv2.plaat_in_gebouw = true;
    inv2.detaillering_9_3_toegepast = true;
    let g2 = Scheurgegevens {
        section: &sec,
        cage: &cage,
        beton,
        staal,
        invoer: &inv2,
    };
    let r = check_scheurbeheersing_tabel(&g2, snapshot(4006.0));
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.notes[0].contains("200 mm"));

    // Maar bij axiale trek vervalt de vrijstelling weer — de norm eist
    // "belast op buiging zonder significante axiale trek".
    let mut inv3 = inv2;
    inv3.axiale_trek = true;
    let g3 = Scheurgegevens {
        section: &sec,
        cage: &cage,
        beton,
        staal,
        invoer: &inv3,
    };
    assert_ne!(
        check_scheurbeheersing_tabel(&g3, snapshot(4006.0)).status,
        CheckStatus::NotApplicable
    );

    // En de doorsnede van 280 mm is nooit vrijgesteld.
    let sec4 = ConcreteSection::rectangle(1000.0, 280.0);
    let g4 = Scheurgegevens {
        section: &sec4,
        cage: &cage,
        beton,
        staal,
        invoer: &inv2,
    };
    assert_ne!(
        check_scheurbeheersing_tabel(&g4, snapshot(2458.0)).status,
        CheckStatus::NotApplicable
    );
}

// ---------------------------------------------------------------------------
// De NB-afwijkingen, elk apart vastgepind
// ---------------------------------------------------------------------------

#[test]
fn de_vijf_nb_afwijkingen_in_paragraaf_7_3() {
    // 1. De belastingscombinatie: frequent in plaats van quasi-blijvend, voor
    //    ALLE elementtypen.
    assert!(COMBINATIE_SCHEURWIJDTE.contains("frequente"));
    assert!(COMBINATIE_H_CR.contains("quasi-blijvende"));

    // 2. De grenswaarden van de geamendeerde tabel 7.1N, in hun geheel.
    for (klasse, betonstaal, combinatie, dsigma) in [
        (ExposureClass::X0, 0.40, 0.30, 275.0),
        (ExposureClass::XC1, 0.40, 0.30, 275.0),
        (ExposureClass::XC2, 0.30, 0.20, 175.0),
        (ExposureClass::XC3, 0.30, 0.20, 175.0),
        (ExposureClass::XC4, 0.30, 0.20, 175.0),
        (ExposureClass::XD1, 0.20, 0.10, 75.0),
        (ExposureClass::XD2, 0.20, 0.10, 75.0),
        (ExposureClass::XD3, 0.20, 0.10, 75.0),
        (ExposureClass::XS1, 0.20, 0.10, 75.0),
        (ExposureClass::XS2, 0.20, 0.10, 75.0),
        (ExposureClass::XS3, 0.20, 0.10, 75.0),
    ] {
        assert_eq!(
            w_max_mm(klasse, Elementtype::Betonstaal),
            Ok(betonstaal),
            "{klasse:?}"
        );
        assert_eq!(
            w_max_mm(klasse, Elementtype::CombinatieMetAanhechting),
            Ok(combinatie),
            "{klasse:?}"
        );
        assert_eq!(delta_sigma_p_grens(klasse), Ok(dsigma), "{klasse:?}");
    }

    // 3. k_x — een factor die de EN niet kent.
    assert!((k_x(50.0, 25.0).unwrap() - 2.0).abs() < 1e-12);
    assert!((k_x(60.0, 25.0).unwrap() - 2.0).abs() < 1e-12); // afgekapt

    // 4. De bovengrens op (7.11) — eveneens een NB-toevoeging.
    //    C20/25, Ø10: max{(50 − 16)·10; 150} = max{340; 150} = 340 mm.
    assert!((nb_bovengrens_s_r_max_mm(20.0, 10.0) - 340.0).abs() < 1e-12);
    //    C60/75, Ø10: max{(50 − 48)·10; 150} = max{20; 150} = 150 mm.
    assert!((nb_bovengrens_s_r_max_mm(60.0, 10.0) - 150.0).abs() < 1e-12);

    // 5. De halvering van de staafafstanden uit tabel 7.3N bij axiale trek.
    let a = Tabelaflezing::Conservatief;
    assert_eq!(staafafstand_max_mm(160.0, 0.4, false, a), Ok(300.0));
    assert_eq!(staafafstand_max_mm(160.0, 0.4, true, a), Ok(150.0));

    // Plus de twee normatief vastgelegde coëfficiënten van (7.11).
    assert_eq!(K_3, 3.4);
    assert_eq!(K_4, 0.425);
}
