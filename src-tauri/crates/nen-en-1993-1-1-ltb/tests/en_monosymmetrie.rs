//! De monosymmetrieparameter z_j in de kiptoetsing.
//!
//! Vier dingen worden hier vastgelegd, en ze zijn alle vier een plek waar het
//! eerder mis kon gaan:
//!
//!  1. **De formule reduceert.** Met z_g = 0 en z_j = 0 levert de algemene vorm
//!     bit-identiek hetzelfde als de bestaande dubbelsymmetrische vorm. Zonder
//!     die eigenschap zou "monosymmetrie aanzetten" ongemerkt óók de
//!     symmetrische gevallen verschuiven.
//!  2. **Het teken volgt de gedrukte flens.** z_j is een vaste
//!     doorsnede-eigenschap; de norm meet hem naar de gedrukte flens. Bij een
//!     steunmoment klapt hij dus om. Wie dat vergeet, krijgt een te HOGE M_cr.
//!  3. **De gunstige tak wordt niet gecrediteerd.** C₃ is hier een bovengrens
//!     over een tabelkolom en geen aflezing; zo'n bovengrens is alleen veilig
//!     zolang z_j M_cr verlaagt en niet verhoogt.
//!  4. **De afleiding toont z_j.** Het rapport moet de waarde én de herkomst
//!     kunnen laten zien, ook wanneer die nul is.
//!
//! Daarnaast staan onderaan drie tests die elk één eerder geconstateerd gebrek
//! afdekken: een te kleine C₃, één z_j-teken voor een heel kipveld, en een
//! onbepaalde monosymmetrie die als "symmetrisch" werd gerapporteerd.
//!
//! De T-vorm hieronder is dezelfde als in de eigen test van de doorsnedemotor
//! (`section-properties/src/uitgebreid.rs`): h = 200, b = 150, t_w = 10,
//! t_f = 20. De motor geeft daar z_j = +67,458 mm voor de flens boven, en exact
//! het tegengestelde als hij op zijn kop staat.

use approx::assert_relative_eq;
use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_ltb::{
    en_general, m_b_rd_monosymmetrisch, nb_annex, Kipprofiel, Kipveld, Monosymmetrieinvoer,
};
use nen_en_1993_1_1_section::{CheckStatus, S235};
use nen_en_1993_1_1_stability::StabilityCalc;
use section_properties::composite::{CompositeSection, Lamella};
use section_properties::SectionProperties;

// ── Doorsneden ────────────────────────────────────────────────────────────────

/// T-profiel h = 200, flens 150 × 20, lijf 180 × 10.
///
/// `flens_boven = true` legt de flens bovenin; `false` zet hem onderin, wat
/// fysiek hetzelfde profiel is maar omgekeerd geplaatst.
fn t_profiel(flens_boven: bool) -> (SectionProperties, f64) {
    let (z_flens, z_lijf) = if flens_boven { (190.0, 90.0) } else { (10.0, 110.0) };
    let sec = CompositeSection {
        lamellen: vec![
            Lamella::liggend(150.0, 20.0, 0.0, z_flens),
            Lamella::staand(180.0, 10.0, 0.0, z_lijf),
        ],
        ..Default::default()
    };
    let r = sec.bereken();
    let mut p = r.props;
    // `composite` laat t_f en t_w op nul staan — een willekeurige
    // lamellendoorsnede heeft geen "flens" en geen "lijf". k_red vraagt er wél
    // om; de orchestrator vult ze op dezelfde manier in.
    p.tf_mm = 20.0;
    p.tw_mm = 10.0;
    (p, r.monosymmetrie.z_j_mm)
}

/// Dubbelsymmetrische gelaste I: flenzen 200 × 15, lijf 400 × 10.
fn gelaste_i_dubbelsymmetrisch() -> (SectionProperties, f64) {
    let sec = CompositeSection {
        lamellen: vec![
            Lamella::liggend(200.0, 15.0, 0.0, 207.5),
            Lamella::liggend(200.0, 15.0, 0.0, -207.5),
            Lamella::staand(400.0, 10.0, 0.0, 0.0),
        ],
        ..Default::default()
    };
    let r = sec.bereken();
    let mut p = r.props;
    p.tf_mm = 15.0;
    p.tw_mm = 10.0;
    (p, r.monosymmetrie.z_j_mm)
}

// ── Belastinggeval ────────────────────────────────────────────────────────────

const L_MM: f64 = 6000.0;

/// Eén kipveld tussen twee gaffels, zuivere veldbelasting.
///
/// Beide eindmomenten zijn nul, dus β = 0 en B* = 0: C₁ = 1,13 en
/// C₂ = 0,45 volgens tabel NB.NB.1. Alleen het TEKEN van het middenmoment
/// verschilt tussen de twee aanroepen, en dat is precies wat het teken van z_j
/// bepaalt. Zo isoleert deze opzet de tekenkeuze van alles wat er verder in
/// M_cr meespeelt.
fn veld(m_midden_knm: f64) -> Vec<Kipveld> {
    vec![Kipveld {
        l_st_mm: L_MM,
        m_begin_knm: 0.0,
        m_eind_knm: 0.0,
        m_midden_knm,
        tussen_gaffels: true,
    }]
}

fn krachten(my_knm: f64) -> ForceStateSnapshot {
    ForceStateSnapshot {
        combination_id: 1,
        position_mm: L_MM / 2.0,
        forces: InternalForces {
            n_ed: 0.0, vy_ed: 0.0, vz_ed: 0.0, mt_ed: 0.0,
            my_ed: my_knm, mz_ed: 0.0,
        },
    }
}

/// De kiptoets van een monosymmetrische doorsnede, met de belasting op een
/// opgegeven hoogte boven het zwaartepunt.
fn toets(p: &SectionProperties, z_j: f64, m_midden_knm: f64, z_a_mm: f64) -> StabilityCalc {
    toets_velden(p, z_j, &veld(m_midden_knm), m_midden_knm, z_a_mm)
}

/// Dezelfde toets, maar met een zelf samengestelde reeks kipvelden.
fn toets_velden(
    p: &SectionProperties,
    z_j: f64,
    velden: &[Kipveld],
    m_ed_knm: f64,
    z_a_mm: f64,
) -> StabilityCalc {
    m_b_rd_monosymmetrisch(
        p, &S235, L_MM, velden,
        // q = 0: de momentenlijn komt volledig uit het middenmoment, en B*
        // blijft nul omdat de eindmomenten nul zijn.
        0.0,
        z_a_mm,
        &Monosymmetrieinvoer { z_j_geometrisch_mm: z_j, bepaald: true, psi_f: None },
        Kipprofiel::Overig,
        krachten(m_ed_knm),
    )
}

fn m_cr_van(s: &StabilityCalc) -> f64 {
    s.intermediate_values.iter().find(|v| v.symbol == "M_{cr}").expect("M_cr").value
}

fn stap<'a>(s: &'a StabilityCalc, id: &str) -> &'a nen_en_1993_1_1_stability::Deelstap {
    s.deelstappen.iter().find(|d| d.id == id).unwrap_or_else(|| panic!("stap {id} ontbreekt"))
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 — De formule reduceert
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn reduceert_exact_naar_de_dubbelsymmetrische_vorm() {
    // Met z_g = 0 en z_j = 0 is D = 0, en dan mag er geen enkel bit verschil
    // zijn met `m_cr_algemeen`. `assert_eq!` op f64, geen tolerantie: dit is de
    // garantie dat een symmetrische doorsnede door de nieuwe formule heen
    // dezelfde uitkomst houdt.
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    for c1 in [1.0, 1.13, 1.75, 2.30] {
        for l in [3000.0, 6000.0, 12000.0] {
            let oud = en_general::m_cr_algemeen(c1, l, 69852972.0, iw, 1084313.0);
            let nieuw = en_general::m_cr_monosymmetrisch(
                c1, 0.45, en_general::c3_bovengrens(None), l, 69852972.0, iw, 1084313.0, 0.0, 0.0,
            );
            assert_eq!(
                oud, nieuw,
                "C₁ = {c1}, L = {l}: de algemene vorm hoort met z_g = z_j = 0 bit-identiek \
                 aan de dubbelsymmetrische te zijn"
            );
        }
    }
}

#[test]
fn c2_doet_niets_zolang_z_g_nul_is() {
    // Extra grendel op dezelfde eigenschap: C₂ komt in de formule alleen voor
    // als het product C₂·z_g. Een andere C₂ mag bij z_g = 0 niets veranderen.
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    let a = en_general::m_cr_monosymmetrisch(1.13, 0.0, 1.0, 6000.0, 69852972.0, iw, 1084313.0, 0.0, 0.0);
    let b = en_general::m_cr_monosymmetrisch(1.13, 0.45, 1.0, 6000.0, 69852972.0, iw, 1084313.0, 0.0, 0.0);
    assert_eq!(a, b);
}

#[test]
fn ongeldige_invoer_geeft_nul() {
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    assert_eq!(
        en_general::m_cr_monosymmetrisch(1.0, 0.45, 1.0, 0.0, 69852972.0, iw, 1084313.0, 50.0, -10.0),
        0.0
    );
    assert_eq!(
        en_general::m_cr_monosymmetrisch(1.0, 0.45, 1.0, 6000.0, 0.0, iw, 1084313.0, 50.0, -10.0),
        0.0
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  2 — M_cr is dalend in D = C₂·z_g − C₃·z_j
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn m_cr_daalt_monotoon_in_d() {
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    let m_cr = |z_g: f64, z_j: f64| {
        en_general::m_cr_monosymmetrisch(1.13, 0.45, 1.0, 6000.0, 69852972.0, iw, 1084313.0, z_g, z_j)
    };
    // Hoger aangrijpingspunt → grotere D → lagere M_cr.
    let mut vorige = f64::INFINITY;
    for z_g in [-200.0, -100.0, 0.0, 100.0, 200.0] {
        let m = m_cr(z_g, 0.0);
        assert!(m < vorige, "M_cr hoort te dalen bij een hoger aangrijpingspunt: {m} ≥ {vorige}");
        vorige = m;
    }
    // Positievere z_j → kleinere D → hogere M_cr.
    let mut vorige = 0.0;
    for z_j in [-100.0, -50.0, 0.0, 50.0, 100.0] {
        let m = m_cr(0.0, z_j);
        assert!(m > vorige, "M_cr hoort te stijgen bij een positievere z_j: {m} ≤ {vorige}");
        vorige = m;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 — Het teken van z_j
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn het_teken_volgt_de_gedrukte_flens() {
    let z_j = 67.458_359_037_631_08;
    // Veldmoment: bovenflens gedrukt, teken ongewijzigd.
    assert_relative_eq!(en_general::z_j_gedrukte_flens(z_j, 120.0), z_j, max_relative = 1e-12);
    // Steunmoment: onderflens gedrukt, teken omgeklapt.
    assert_relative_eq!(en_general::z_j_gedrukte_flens(z_j, -120.0), -z_j, max_relative = 1e-12);
    // Ook andersom: een profiel met een negatieve meetkundige z_j wordt bij een
    // steunmoment positief.
    assert_relative_eq!(en_general::z_j_gedrukte_flens(-z_j, -120.0), z_j, max_relative = 1e-12);
}

#[test]
fn zonder_moment_wordt_de_ongunstige_tak_genomen() {
    // Is het maatgevende moment nul, dan is niet te zeggen welke flens gedrukt
    // is. Dan hoort er GEEN gunstige aanname te vallen.
    for z_j in [67.5_f64, -67.5] {
        let uit = en_general::z_j_gedrukte_flens(z_j, 0.0);
        assert!(uit <= 0.0, "onbekend teken hoort de ongunstige tak te geven, kreeg {uit}");
        assert_relative_eq!(uit, -z_j.abs(), max_relative = 1e-12);
    }
}

#[test]
fn de_gunstige_tak_wordt_niet_gecrediteerd() {
    // z_j > 0 zou M_cr verhogen; die winst wordt niet toegekend zolang C₃ niet
    // uit de norm af te lezen is. z_j < 0 verlaagt M_cr en telt volledig mee.
    assert_eq!(en_general::z_j_rekenwaarde(67.5), 0.0);
    assert_eq!(en_general::z_j_rekenwaarde(0.0), 0.0);
    assert_eq!(en_general::z_j_rekenwaarde(-67.5), -67.5);
}

#[test]
fn steunmoment_geeft_een_lagere_m_cr_dan_veldmoment() {
    // DE test die de onveilige fout vangt. Zelfde profiel, zelfde ligger,
    // zelfde aangrijpingspunt — alleen het teken van het moment verschilt.
    // Bij een veldmoment is de grote flens gedrukt (gunstig, niet
    // gecrediteerd); bij een steunmoment de lijftip (ongunstig, telt mee).
    let (p, z_j) = t_profiel(true);
    assert!(z_j > 60.0, "de flens boven hoort een positieve z_j te geven: {z_j}");

    let veld_moment = toets(&p, z_j, 120.0, 47.5);
    let steun_moment = toets(&p, z_j, -120.0, 47.5);

    let (m_veld, m_steun) = (m_cr_van(&veld_moment), m_cr_van(&steun_moment));
    assert!(
        m_steun < m_veld,
        "een steunmoment drukt de kleine flens en hoort een LAGERE M_cr te geven: \
         veld {m_veld:.3} kNm, steun {m_steun:.3} kNm"
    );

    // En de gebruikte z_j staat er met het juiste teken bij.
    assert_relative_eq!(stap(&veld_moment, "z_j").value.unwrap(), 0.0, epsilon = 1e-12);
    assert_relative_eq!(stap(&steun_moment, "z_j").value.unwrap(), -z_j, max_relative = 1e-9);
}

#[test]
fn het_omgekeerde_profiel_bij_veldmoment_is_hetzelfde_geval_als_het_steunmoment() {
    // Een T met de flens ONDER, belast met een veldmoment, is stabiliteits-
    // technisch hetzelfde als een T met de flens boven onder een steunmoment:
    // in beide gevallen is de lijftip de gedrukte flens. Bij gelijke
    // belastinggeometrie hoort er dan ook hetzelfde uit te komen.
    let (p_boven, z_j_boven) = t_profiel(true);
    let (p_onder, z_j_onder) = t_profiel(false);
    assert_relative_eq!(z_j_onder, -z_j_boven, max_relative = 1e-9);

    // De belasting grijpt in beide gevallen op het SCHUIFMIDDELPUNT aan, zodat
    // z_g = 0 en alleen z_j nog verschil kan maken.
    //
    // Waarom niet op de bovenrand: `z_a` veronderstelt een NEERWAARTSE
    // belasting — de docstring van `m_b_rd` noemt "positief = boven het
    // zwaartepunt (destabiliserend)". Een echte spiegeling keert ook de
    // richting van de belasting om, en dat kan deze invoer niet uitdrukken. Op
    // het schuifmiddelpunt speelt die vraag niet.
    let z_s_rel_boven = p_boven.z_s_mm - p_boven.z_c_mm;
    let z_s_rel_onder = p_onder.z_s_mm - p_onder.z_c_mm;
    assert_relative_eq!(z_s_rel_onder, -z_s_rel_boven, max_relative = 1e-9);

    let steun_boven = toets(&p_boven, z_j_boven, -120.0, z_s_rel_boven);
    let veld_onder = toets(&p_onder, z_j_onder, 120.0, z_s_rel_onder);
    for s in [&steun_boven, &veld_onder] {
        let z_g = s.intermediate_values.iter().find(|v| v.symbol == "z_g").unwrap().value;
        assert_relative_eq!(z_g, 0.0, epsilon = 1e-9);
        // In beide gevallen is de LIJFTIP de gedrukte flens, dus dezelfde
        // negatieve rekenwaarde.
        assert_relative_eq!(stap(s, "z_j").value.unwrap(), -z_j_boven, max_relative = 1e-9);
    }
    assert_relative_eq!(
        m_cr_van(&steun_boven), m_cr_van(&veld_onder), max_relative = 1e-9
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  4 — De afleiding
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn de_afleiding_toont_z_j_en_laat_de_nb_keten_weg() {
    let (p, z_j) = t_profiel(true);
    let s = toets(&p, z_j, -120.0, 47.5);
    let ids: Vec<&str> = s.deelstappen.iter().map(|d| d.id.as_str()).collect();

    // z_j staat er, ná L_kip en vóór M_cr.
    assert!(ids.contains(&"z_j"), "de afleiding hoort een z_j-stap te bevatten: {ids:?}");
    let i_zj = ids.iter().position(|x| *x == "z_j").unwrap();
    let i_lkip = ids.iter().position(|x| *x == "l_kip").unwrap();
    let i_mcr = ids.iter().position(|x| *x == "m_cr").unwrap();
    assert!(i_lkip < i_zj && i_zj < i_mcr, "volgorde klopt niet: {ids:?}");

    // S, C en de C₂-correctie horen hier NIET: die zijn van de NB-vorm, die
    // deze doorsnede niet dekt.
    for weg in ["s", "c", "c2"] {
        assert!(!ids.contains(&weg), "stap {weg} hoort niet op de algemene route: {ids:?}");
    }
    // De ongecorrigeerde C₂ staat er wél — de algemene formule gebruikt hem.
    assert!(ids.contains(&"c2_tabel"));
}

#[test]
fn de_afleiding_noemt_de_c3_keuze_en_de_normgrens() {
    let (p, z_j) = t_profiel(true);
    let s = toets(&p, z_j, -120.0, 47.5);

    let m_cr = stap(&s, "m_cr");
    let tekst = m_cr.notes.join(" ");
    assert!(tekst.contains("KEUZE"), "de C₃-keuze hoort in de afleiding te staan: {tekst}");
    assert!(tekst.contains("geen normwaarde") || tekst.contains("NIET de vorm"));
    assert!(m_cr.notes.iter().any(|n| n.contains("NB.NB.1(1)")),
            "de afleiding hoort de normgrens NB.NB.1(1) te noemen");

    // En de toets zelf zegt dat dit geen NB-waarde is.
    assert!(s.notes.iter().any(|n| n.contains("GEEN Nederlandse NB-waarde")));
}

#[test]
fn de_getoonde_d_is_de_d_die_gerekend_is() {
    // De afleiding toont D = C₂·z_g − C₃·z_j. Dat getal moet exact het getal
    // zijn dat in M_cr is ingevuld, niet een tweede som die ernaast kan
    // afdrijven.
    let (p, z_j) = t_profiel(true);
    let s = toets(&p, z_j, -120.0, 47.5);
    let waarde = |sym: &str| {
        s.intermediate_values.iter().find(|v| v.symbol == sym).unwrap().value
    };
    let m_cr = stap(&s, "m_cr");
    let d_getoond = m_cr.variables.iter().find(|v| v.symbol == "D").unwrap().value;
    let d_verwacht = en_general::d_parameter(
        waarde("C_{2,tabel}"), waarde("z_g"), waarde("C_3"), waarde("z_j"),
    );
    assert_eq!(d_getoond, d_verwacht);
    assert!(d_getoond > 0.0, "een gedrukte kleine flens hoort D te verhogen: {d_getoond}");
}

#[test]
fn bij_een_symmetrische_doorsnede_zegt_de_stap_dat_z_j_nul_is() {
    // Requirement uit de opdracht: de stap moet ook kunnen zeggen "nul omdat de
    // doorsnede symmetrisch is".
    let (p, z_j) = gelaste_i_dubbelsymmetrisch();
    assert!(z_j.abs() < 1e-6, "een dubbelsymmetrische I hoort z_j = 0 te geven: {z_j}");

    let s = toets(&p, z_j, 300.0, 207.5);
    let zj = stap(&s, "z_j");
    assert_relative_eq!(zj.value.unwrap(), 0.0, epsilon = 1e-9);
    assert!(
        zj.notes.iter().any(|n| n.contains("symmetrisch is om de buigingsas")),
        "de reden hoort erbij te staan: {:?}", zj.notes
    );
}

#[test]
fn een_symmetrische_doorsnede_krijgt_langs_deze_route_de_algemene_vorm_zonder_z_j() {
    // Loopt een doorsnede met z_j = 0 door de monosymmetrische route, dan valt
    // de z_j-term weg en blijft alleen C₂·z_g over. Dat legt vast dat de nieuwe
    // route niets stilzwijgend toevoegt.
    let (p, z_j) = gelaste_i_dubbelsymmetrisch();
    let s = toets(&p, z_j, 300.0, 0.0); // belasting op het zwaartepunt
    let k_red = nb_annex::k_red(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, L_MM);
    let verwacht = k_red
        * en_general::m_cr_algemeen(
            s.intermediate_values.iter().find(|v| v.symbol == "C_1").unwrap().value,
            L_MM, p.iz_mm4, p.iw_mm6, p.it_mm4,
        );
    assert_relative_eq!(m_cr_van(&s), verwacht, max_relative = 1e-12);
}

// ═══════════════════════════════════════════════════════════════════════════
//  5 — De toets als geheel
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn de_toets_levert_een_unity_check_met_een_status() {
    let (p, z_j) = t_profiel(true);
    let s = toets(&p, z_j, -120.0, 47.5);
    let uc = s.uc.as_ref().expect("de monosymmetrische kiptoets hoort een UC te leveren");
    assert!(uc.rd > 0.0, "M_b,Rd hoort positief te zijn: {}", uc.rd);
    assert_relative_eq!(uc.uc, uc.ed / uc.rd, max_relative = 1e-12);
    assert!(matches!(s.status, CheckStatus::Ok | CheckStatus::NotOk));
    // `value` is de uitkomst van `formula_latex`, dus M_b,Rd — dezelfde afspraak
    // als bij `m_b_rd`.
    assert_relative_eq!(s.value, uc.rd, max_relative = 1e-12);
    assert_eq!(s.id, "6.3.2_ltb_monosymmetrisch");
}

// ═══════════════════════════════════════════════════════════════════════════
//  6 — Gebrek 1: C₃ = 1,0 is onveilig
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn c3_ligt_boven_een_en_is_op_de_psi_f_band_gesleuteld() {
    // C₃ = 1,0 was de oude waarde en is onveilig: M_cr is dalend in
    // D = C₂·z_g − C₃·z_j, en z_j is na de afkapping nooit positief, dus een te
    // kleine C₃ geeft een te HOGE M_cr. De ongunstigste waarden in de banden
    // ψ_f ≤ 0 van NEN-EN 1999-1-1 tabel I.1 en I.2 liggen ruim boven 1,0.
    // Via `c3_bovengrens` en niet via de constanten zelf: dit is de functie
    // die de toetsing werkelijk aanroept, en een assertie op twee constanten
    // zou de compiler al kunnen wegstrepen.
    for psi_f in [None, Some(-1.0), Some(-0.95), Some(-0.5), Some(0.0), Some(1.0)] {
        let c3 = en_general::c3_bovengrens(psi_f);
        assert!(
            c3 > 1.0,
            "C₃ = 1,0 was de oude, onveilige waarde; bij ψ_f = {psi_f:?} kwam {c3} eruit"
        );
    }
    // De band ψ_f = −1 is de ongunstigste van de twee, en geldt zodra ψ_f
    // onbekend is.
    assert!(en_general::c3_bovengrens(Some(-1.0)) > en_general::c3_bovengrens(Some(0.0)));
    assert_eq!(en_general::c3_bovengrens(None), en_general::C3_BAND_PSI_F_MIN_EEN);
    assert_eq!(en_general::c3_bovengrens(Some(-1.0)), en_general::C3_BAND_PSI_F_MIN_EEN);
    assert_eq!(en_general::c3_bovengrens(Some(-0.95)), en_general::C3_BAND_PSI_F_MIN_EEN);
    assert_eq!(en_general::c3_bovengrens(Some(-0.5)), en_general::C3_BAND_PSI_F_NUL);
    assert_eq!(en_general::c3_bovengrens(Some(0.0)), en_general::C3_BAND_PSI_F_NUL);
}

#[test]
fn c3_staat_vast_op_de_waarde_die_in_de_tabel_te_lezen_is() {
    // Deze test pint het getal, niet alleen het gedrag.
    //
    // De test hierboven werkt met de constanten in plaats van met getallen,
    // waardoor een verkeerd overgenomen tabelwaarde er ongemerkt doorheen komt.
    // Dat is één keer gebeurd: C₃ voor ψ_f = −1 stond op 2,70, en 2,70 komt in
    // de hele bijlage niet voor — het is de C₁,₁ van diezelfde tabelregel.
    //
    // Zo lopen de regels van tabel I.1:
    //
    //     k_z  | C₁,₀  | C₁,₁  | C₃(ψ_f = −1) | C₃(−0,9 ≤ ψ_f ≤ 0)
    //     0,7L | 2,592 | 2,770 |     2,00     |       0,850
    //     1,0  | 2,547 | 2,852 |     2,00     |       1,000
    //     0,7R | 1,829 | 2,027 |     1,55     |       0,700
    //     0,7L | 1,853 | 2,059 |     1,600    |       1,260
    //
    // De grootste C₃ in de eerste band is 2,00, in de tweede 1,26. Wie deze
    // test moet aanpassen, hoort de tabel er weer bij te pakken.
    assert_eq!(en_general::C3_BAND_PSI_F_MIN_EEN, 2.00);
    assert_eq!(en_general::C3_BAND_PSI_F_NUL, 1.26);
}

#[test]
fn een_grotere_c3_verlaagt_m_cr_dus_c3_is_een_veiligheidsknop() {
    // Het mechanisme achter gebrek 1, expliciet vastgelegd: bij een negatieve
    // z_j is M_cr strikt dalend in C₃. Wie C₃ te laag kiest, rekent te ruim.
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    let m_cr = |c3: f64| {
        en_general::m_cr_monosymmetrisch(
            1.13, 0.45, c3, 6000.0, 69852972.0, iw, 1084313.0, 0.0, -67.5,
        )
    };
    let met_een = m_cr(1.0);
    let met_band = m_cr(en_general::C3_BAND_PSI_F_MIN_EEN);
    assert!(
        met_band < met_een,
        "een grotere C₃ hoort M_cr te VERLAGEN: C₃ = 1,0 gaf {met_een:.3} kNm, \
         C₃ = {} gaf {met_band:.3} kNm",
        en_general::C3_BAND_PSI_F_MIN_EEN
    );
}

#[test]
fn de_afleiding_noemt_de_aluminiumnorm_en_niet_de_onleesbaarheid() {
    // De onware onderbouwing ("de tabellen zijn niet af te lezen") mag niet
    // terugkomen, en de herkomst van de formule — de aluminium-Eurocode —
    // hoort de gebruiker te lezen.
    let (p, z_j) = t_profiel(true);
    let s = toets(&p, z_j, -120.0, 47.5);
    let tekst = stap(&s, "m_cr").notes.join(" ");

    assert!(
        !tekst.contains("niet volledig af te lezen"),
        "de onware onleesbaarheidsclaim staat nog in de afleiding: {tekst}"
    );
    assert!(
        tekst.contains("BOVENGRENS"),
        "de afleiding hoort te zeggen dat C₃ een bovengrens is: {tekst}"
    );
    assert!(
        tekst.contains("ALUMINIUM-Eurocode"),
        "de afleiding hoort te zeggen dat de formule uit de aluminium-Eurocode komt: {tekst}"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  7 — Gebrek 2: één teken voor een heel kipveld
// ═══════════════════════════════════════════════════════════════════════════

/// Eén kipveld met opgegeven begin-, midden- en eindmoment.
fn veld_met(m_begin: f64, m_midden: f64, m_eind: f64) -> Vec<Kipveld> {
    vec![Kipveld {
        l_st_mm: L_MM,
        m_begin_knm: m_begin,
        m_eind_knm: m_eind,
        m_midden_knm: m_midden,
        tussen_gaffels: true,
    }]
}

#[test]
fn spiegelbeeldige_belastinggevallen_geven_dezelfde_m_cr() {
    // DE test voor gebrek 2. Twee velden die elkaars spiegelbeeld zijn — alle
    // momenten van teken gewisseld — beschrijven fysiek hetzelfde geval en
    // horen dezelfde M_cr te geven.
    //
    // Met de oude regel ("neem het teken van het moment met de grootste
    // absolute waarde") gebeurde dat niet: bij (+100, 0, −99) won +100 en werd
    // de monosymmetriestraf weggekapt, bij (−100, 0, +99) won −100 en kwam de
    // straf er wél op.
    let (p, z_j) = t_profiel(true);
    // De belasting grijpt op het schuifmiddelpunt aan, zodat z_g = 0 en alleen
    // z_j nog verschil kan maken.
    let z_s_rel = p.z_s_mm - p.z_c_mm;

    let heen = toets_velden(&p, z_j, &veld_met(100.0, 0.0, -99.0), 100.0, z_s_rel);
    let terug = toets_velden(&p, z_j, &veld_met(-100.0, 0.0, 99.0), 100.0, z_s_rel);

    assert_relative_eq!(m_cr_van(&heen), m_cr_van(&terug), max_relative = 1e-12);
    assert_relative_eq!(
        stap(&heen, "z_j").value.unwrap(),
        stap(&terug, "z_j").value.unwrap(),
        max_relative = 1e-12
    );
}

#[test]
fn een_veld_met_wisselende_kromming_krijgt_de_ongunstige_tak() {
    // Wisselt het veld van kromming, dan is er geen gedrukte flens aan te
    // wijzen en hoort −|z_j| te gelden — niet de nul die de oude regel opleverde.
    let (p, z_j) = t_profiel(true);
    assert!(z_j > 60.0);
    let z_s_rel = p.z_s_mm - p.z_c_mm;

    let wisselend = toets_velden(&p, z_j, &veld_met(100.0, 0.0, -99.0), 100.0, z_s_rel);
    assert_relative_eq!(stap(&wisselend, "z_j").value.unwrap(), -z_j, max_relative = 1e-9);

    // Zonder tekenwisseling is de bovenflens overal gedrukt en valt de straf
    // door de afkapping weg. Let op: dit veld heeft een ándere β en dus een
    // andere C₁, dus de M_cr's van deze twee velden zijn NIET vergelijkbaar —
    // alleen de z_j-tak is dat.
    let enkel_teken = toets_velden(&p, z_j, &veld_met(100.0, 50.0, 99.0), 100.0, z_s_rel);
    assert_relative_eq!(stap(&enkel_teken, "z_j").value.unwrap(), 0.0, epsilon = 1e-12);

    // De vergelijking die het gebrek wél isoleert: hetzelfde veld, dezelfde β,
    // B*, C₁, C₂ en L_kip — alleen z_j verschilt. Met z_j = 0 komt er precies
    // uit wat de OUDE regel opleverde (die koos het teken van +100, waarna de
    // afkapping op nul zette). De nieuwe regel hoort daar strikt onder te
    // liggen.
    let oude_regel = toets_velden(&p, 0.0, &veld_met(100.0, 0.0, -99.0), 100.0, z_s_rel);
    assert_relative_eq!(stap(&oude_regel, "z_j").value.unwrap(), 0.0, epsilon = 1e-12);
    assert!(
        m_cr_van(&wisselend) < m_cr_van(&oude_regel),
        "de wisselende kromming hoort M_cr te VERLAGEN ten opzichte van de oude regel: \
         nieuw {:.3} kNm, oud {:.3} kNm",
        m_cr_van(&wisselend),
        m_cr_van(&oude_regel)
    );

    // De afleiding zegt waarom.
    let tekst = stap(&wisselend, "z_j").notes.join(" ");
    assert!(
        tekst.contains("WISSELT van kromming"),
        "de afleiding hoort de tekenwisseling te benoemen: {tekst}"
    );
}

#[test]
fn de_flensbepaling_kijkt_naar_alle_drie_de_momenten() {
    use en_general::GedrukteFlens;
    assert_eq!(
        en_general::gedrukte_flens_in_kipveld([100.0, 0.0, -99.0]),
        GedrukteFlens::Beide
    );
    // Spiegelbeeld: dezelfde uitkomst, want de regel kijkt alleen naar WELKE
    // tekens voorkomen, niet naar hun volgorde of onderlinge grootte.
    assert_eq!(
        en_general::gedrukte_flens_in_kipveld([-100.0, 0.0, 99.0]),
        GedrukteFlens::Beide
    );
    assert_eq!(
        en_general::gedrukte_flens_in_kipveld([100.0, 50.0, 99.0]),
        GedrukteFlens::Boven
    );
    assert_eq!(
        en_general::gedrukte_flens_in_kipveld([-100.0, -50.0, -99.0]),
        GedrukteFlens::Onder
    );
    assert_eq!(
        en_general::gedrukte_flens_in_kipveld([0.0, 0.0, 0.0]),
        GedrukteFlens::Onbekend
    );
    // En het middenmoment telt volwaardig mee: alleen daar wisselt dit veld.
    assert_eq!(
        en_general::gedrukte_flens_in_kipveld([100.0, -20.0, 99.0]),
        GedrukteFlens::Beide
    );

    // z_j volgt die bepaling, en "beide" en "onbekend" geven allebei −|z_j|.
    for momenten in [[100.0, 0.0, -99.0], [-100.0, 0.0, 99.0], [0.0, 0.0, 0.0]] {
        assert_relative_eq!(en_general::z_j_kipveld(67.5, momenten), -67.5, max_relative = 1e-12);
        assert_relative_eq!(en_general::z_j_kipveld(-67.5, momenten), -67.5, max_relative = 1e-12);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  8 — Gebrek 3: "niet bepaald" is geen nul
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn een_onbepaalde_monosymmetrie_wordt_geweigerd_en_niet_als_symmetrisch_gerapporteerd() {
    // De doorsnedemotor vult bij een catalogusdeel of een gesloten cel
    // stilzwijgend z_j = 0 in. Zonder vlag was dat niet te onderscheiden van
    // een echte nul, en rapporteerde de toets "de doorsnede is symmetrisch om
    // de buigingsas" — met normverwijzing en al — bij een M_cr die tientallen
    // procenten te hoog kon zijn.
    let (p, _) = t_profiel(true);
    let s = m_b_rd_monosymmetrisch(
        &p, &S235, L_MM, &veld(-120.0), 0.0, 47.5,
        &Monosymmetrieinvoer { z_j_geometrisch_mm: 0.0, bepaald: false, psi_f: None },
        Kipprofiel::Overig,
        krachten(-120.0),
    );

    assert!(
        matches!(s.status, CheckStatus::NotApplicable),
        "een onbepaalde monosymmetrie hoort de toets te weigeren, kreeg {:?}",
        s.status
    );
    assert!(s.uc.is_none(), "een geweigerde toets hoort geen unity check te leveren");

    let tekst = s.notes.join(" ");
    assert!(
        tekst.contains("NIET uitgevoerd"),
        "de weigering hoort met zoveel woorden in het rapport te staan: {tekst}"
    );
    // De bewering die niet mag vallen, is de bevestigende zin die `z_j_stap`
    // op de normale route uitschrijft. Dat de weigering die bewering benoemt
    // om hem juist af te wijzen, is iets anders — vandaar de hele zin.
    assert!(
        !tekst.contains("z_j = 0 omdat de doorsnede symmetrisch is"),
        "een geweigerde toets mag NIET beweren dat de doorsnede symmetrisch is: {tekst}"
    );
    // En er hangt geen afleiding onder die een berekening suggereert.
    assert!(s.deelstappen.is_empty(), "een geweigerde toets hoort geen afleiding te tonen");
}

#[test]
fn dezelfde_doorsnede_mét_vlag_rekent_gewoon_door() {
    // De keerzijde: de vlag mag geen bruikbare gevallen blokkeren. Dezelfde
    // T-doorsnede met `bepaald: true` levert wél een unity check.
    let (p, z_j) = t_profiel(true);
    let s = toets(&p, z_j, -120.0, 47.5);
    assert!(s.uc.is_some());
    assert!(matches!(s.status, CheckStatus::Ok | CheckStatus::NotOk));
}

#[test]
fn de_doorsnedemotor_meldt_zelf_wanneer_z_j_niet_bepaald_is() {
    // De vlag die `m_b_rd_monosymmetrisch` nu eist, komt hiervandaan. Deze
    // test legt vast dat een T uit lamellen hem op `true` zet — anders zou de
    // weigering hierboven alles blokkeren.
    let sec = CompositeSection {
        lamellen: vec![
            Lamella::liggend(150.0, 20.0, 0.0, 190.0),
            Lamella::staand(180.0, 10.0, 0.0, 90.0),
        ],
        ..Default::default()
    };
    let r = sec.bereken();
    assert!(r.monosymmetrie_bepaald, "een T uit lamellen hoort z_j te kunnen bepalen");
    assert!(r.monosymmetrie.z_j_mm.abs() > 60.0);
}

#[test]
fn z_g_wordt_vanaf_het_schuifmiddelpunt_gemeten() {
    // Het schuifmiddelpunt van een T ligt in de flens, 37,5 mm boven het
    // zwaartepunt. z_a = 47,5 (bovenrand) hoort dus z_g = 10 mm te geven, niet
    // 47,5. Verwar je die twee, dan is C₂·z_g bijna vijf keer te groot.
    let (p, z_j) = t_profiel(true);
    let s = toets(&p, z_j, 120.0, 47.5);
    let z_g = s.intermediate_values.iter().find(|v| v.symbol == "z_g").unwrap().value;
    assert_relative_eq!(z_g, 10.0, max_relative = 1e-9);
    assert_relative_eq!(p.z_s_mm - p.z_c_mm, 37.5, max_relative = 1e-9);
}
