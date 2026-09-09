//! De vier normmodules van fase 2, zoals de orchestrator ze aanroept.
//!
//! WAAROM DEZE TESTS BESTAAN
//! `referentie_balk.rs` bewaakt §6.1. Hier gaat het om de AANSLUITING: komen de
//! dwarskracht, de scheurwijdte, de slankheid en de negen detailleringseisen
//! werkelijk in het resultaat, met de juiste krachten, de juiste
//! belastingcombinatie en — als een gegeven ontbreekt — met de reden in plaats
//! van met stilte of met een aangenomen getal.
//!
//! DE GETALLEN ZIJN MET DE HAND UITGEREKEND. De doorsnede is dezelfde
//! referentiebalk als in `referentie_balk.rs` en
//! `nen-en-1992-1-1/tests/handberekening.rs`: 300 × 500 mm, C30/37, B500B,
//! dekking 30 mm, beugel Ø8, onder 3Ø16, boven 2Ø12. Elke verwachte waarde
//! staat met haar rekengang in het commentaar erboven, zodat een test die
//! omvalt aanwijst wélke stap is verschoven.

use approx::assert_relative_eq;
use concrete_check::{
    check_concrete_beam, CheckKind, CheckStatus, ConcreteBeamCheckInput, ConcreteBeamCheckResult,
};
use mechanics::{ForcePoint, InternalForces};
use nen_en_1992_1_1::slankheid::StructuralSystem;
use nen_en_1992_1_1::{
    ConcreteSectionInput, ExposureClass, RebarRow, ReinforcementCage, ReinforcementZones,
};
use nen_en_1993_1_1_section::ResistanceCalc;

// ── Bouwstenen ──────────────────────────────────────────────────────────────

/// De referentiekorf ZONDER beugelgegevens: dekking 30, beugel Ø8,
/// onder 3Ø16, boven 2Ø12.
fn korf_kaal() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        ..ReinforcementCage::default()
    }
}

/// Dezelfde korf mét beugels: Ø8, tweebenig, h.o.h. `s` mm.
fn korf_met_beugels(s_mm: f64) -> ReinforcementCage {
    ReinforcementCage {
        stirrup_spacing_mm: Some(s_mm),
        stirrup_legs: Some(2),
        ..korf_kaal()
    }
}

fn punt(combi: u32, x_mm: f64, n: f64, v: f64, m: f64) -> ForcePoint {
    ForcePoint {
        combination_id: combi,
        position_mm: x_mm,
        forces: InternalForces { n_ed: n, vz_ed: v, my_ed: m, ..Default::default() },
    }
}

/// Vrij opgelegde balk van 5 m: V = ±`v` aan de einden, M = `m` in het midden.
fn ugt(v: f64, m: f64) -> Vec<ForcePoint> {
    vec![
        punt(1, 0.0, 0.0, v, 0.0),
        punt(1, 2500.0, 0.0, 0.0, m),
        punt(1, 5000.0, 0.0, -v, 0.0),
    ]
}

/// Dezelfde balk onder de FREQUENTE BGT-combinatie (combinatie 7).
fn bgt(m: f64) -> Vec<ForcePoint> {
    vec![punt(7, 0.0, 0.0, 0.0, 0.0), punt(7, 2500.0, 0.0, 0.0, m)]
}

/// De referentiebalk 300 × 500. Alle nieuwe gegevens leeg; de tests vullen
/// aan wat ze nodig hebben.
fn invoer(cage: ReinforcementCage, envelop: Vec<ForcePoint>) -> ConcreteBeamCheckInput {
    ConcreteBeamCheckInput {
        beam_id: 7,
        section: ConcreteSectionInput::rectangle(300.0, 500.0),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        cage,
        // Brok 3 heeft `reinforcement_zones` toegevoegd. LEEG betekent hier:
        // de korf hierboven geldt over de hele staaf, precies zoals voor dat
        // veld bestond. Deze tests gaan daar dus onveranderd doorheen.
        reinforcement_zones: ReinforcementZones::default(),
        length_m: 5.0,
        forces_envelope: envelop,
        n_strips: 50,
        steel_branch: Default::default(),
        design_situation: Default::default(),
        apply_min_eccentricity: true,
        sls_frequent_envelope: vec![],
        exposure_class: None,
        structural_class: None,
        aggregate_size_mm: None,
        structural_system: None,
        bar_spacing_mm: None,
        // §5.8: deze staaf is geen kolom in de zin van de toets — er zijn
        // geen kniklengte en geen schoring opgegeven, dus de slankheidsgrens
        // komt als "niet uitgevoerd" terug. Leeg laten is hier het punt: zo
        // blijft deze test precies de test die hij was.
        column: None,
        sls_quasi_permanent_envelope: vec![],
    }
}

fn toets<'a>(r: &'a ConcreteBeamCheckResult, id: &str) -> &'a ResistanceCalc {
    let c = r
        .checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("toets {id} ontbreekt in het resultaat"));
    match &c.kind {
        CheckKind::Resistance(rc) => rc,
        CheckKind::Stability(_) => unreachable!("betontoetsen zijn geen stabiliteitstoetsen"),
    }
}

fn var(rc: &ResistanceCalc, symbool: &str) -> f64 {
    rc.variables
        .iter()
        .find(|v| v.symbol == symbool)
        .unwrap_or_else(|| panic!("variabele {symbool} ontbreekt in toets {}", rc.id))
        .value
}

fn uc(rc: &ResistanceCalc) -> f64 {
    rc.uc.as_ref().unwrap_or_else(|| panic!("toets {} heeft geen unity check", rc.id)).uc
}

// ═══════════════════════════════════════════════════════════════════════════
// §6.2 Dwarskracht
// ═══════════════════════════════════════════════════════════════════════════

/// HANDBEREKENING, referentiebalk met beugel Ø8 tweebenig h.o.h. 150,
/// V_Ed = 80 kN, M_Ed = 100 kNm.
///
/// ```text
///   d      = 500 − (30 + 8 + 8) = 454 mm
///   A_sl   = 3·π/4·16² = 603,185789 mm²
///   ρ_l    = 603,185789/(300·454) = 603,185789/136 200 = 0,00442868
///   k      = 1 + √(200/454) = 1 + 0,6637233 = 1,6637233        (≤ 2,0)
///   100·ρ_l·f_ck = 13,286045 ; ∛13,286045 = 2,3684556
///   C_Rd,c = 0,18/1,5 = 0,12
///   (6.2.a) = 0,12·1,6637233·2,3684556·136 200 = 64 402 N
///   v_min  = 0,035·1,6637233^1,5·√30 = 0,035·2,14595965·5,47722558 = 0,41138668
///   (6.2.b) = 0,41138668·136 200 = 56 031 N     → (6.2.a) is maatgevend
///   V_Rd,c = 64,402 kN  <  V_Ed = 80 kN  → het VAKWERKMODEL, V_Rd,c vervalt
///
///   A_sw   = 2·π/4·8² = 100,530965 mm²  ;  A_sw/s = 0,67020643 mm²/mm
///   z      = 0,9·454 = 408,6 mm (geen normaalkracht, 6.2.3(1))
///   ν₁     = 0,6(1 − 30/250) = 0,528  ;  f_cd = 20  ;  α_cw = 1,0
///   teller (6.9) = 1·300·408,6·0,528·20 = 1 294 444,8 N
///   K = 1 294 444,8/80 000 = 16,18 → cot θ uit de gesloten oplossing valt ver
///   boven 2,5 en wordt op de NB-bovengrens 2,5 afgekapt
///   (6.8) V_Rd,s = 0,67020643·408,6·434,782609·2,5 = 297 659 N
///   (6.9) V_Rd,max = 1 294 444,8/(2,5 + 0,4) = 446 360 N
///   V_Rd = min = 297,659 kN  ;  UC = 80/297,659 = 0,26877
/// ```
#[test]
fn dwarskracht_referentiebalk_handberekend() {
    let r = check_concrete_beam(invoer(korf_met_beugels(150.0), ugt(80.0, 100.0)));
    let rc = toets(&r, "6.2_shear");

    assert_eq!(rc.status, CheckStatus::Ok);
    assert_relative_eq!(var(rc, "d"), 454.0, max_relative = 1e-12);
    assert_relative_eq!(var(rc, r"\rho_l"), 0.00442868, max_relative = 1e-5);
    assert_relative_eq!(var(rc, "k"), 1.6637233, max_relative = 1e-6);
    assert_relative_eq!(var(rc, r"V_{Rd,c}"), 64.402, max_relative = 1e-4);
    assert_relative_eq!(var(rc, "z"), 408.6, max_relative = 1e-12);
    assert_relative_eq!(var(rc, r"\cot\theta"), 2.5, max_relative = 1e-12);
    assert_relative_eq!(var(rc, r"V_{Rd,s}"), 297.659, max_relative = 1e-5);
    assert_relative_eq!(var(rc, r"V_{Rd,max}"), 446.360, max_relative = 1e-5);
    assert_relative_eq!(rc.value, 297.659, max_relative = 1e-5);
    assert_relative_eq!(uc(rc), 80.0 / 297.659, max_relative = 1e-5);

    // DE DWARSKRACHT KOMT VAN HET STEUNPUNT, NIET VAN HET BUIGPUNT. In het
    // midden van deze balk is V = 0; wie daar zou toetsen, toetst de gunstigste
    // doorsnede.
    assert_relative_eq!(rc.force_state.forces.vz_ed.abs(), 80.0, max_relative = 1e-12);
    assert_relative_eq!(rc.force_state.position_mm, 0.0, max_relative = 1e-12);
}

/// De startmodelbalk: 300 × 600, C30/37, dekking 20, beugel Ø8, onder 4Ø20,
/// boven 2Ø12, V_Ed = 99 kN — en GEEN beugelafstand en GEEN aantal benen.
///
/// ```text
///   d      = 600 − (20 + 8 + 10) = 562 mm
///   A_sl   = 4·π/4·20² = 1 256,637 mm²
///   ρ_l    = 1 256,637/(300·562) = 1 256,637/168 600 = 0,00745336
///   k      = 1 + √(200/562) = 1 + 0,5965502 = 1,5965502
///   100·ρ_l·f_ck = 22,36008 ; ∛22,36008 = 2,817216
///   (6.2.a) = 0,12·1,5965502·2,817216·168 600 = 90 993 N = 90,99 kN
///   v_min  = 0,035·1,5965502^1,5·√30 = 0,035·2,0172047·5,47722558 = 0,3867054
///   (6.2.b) = 0,3867054·168 600 = 65 199 N = 65,20 kN
///   V_Rd,c = 90,99 kN  <  V_Ed = 99 kN
/// ```
///
/// Er is dus rekenkundig dwarskrachtwapening nodig, en de gegevens daarvoor
/// ontbreken. De toets mag dan NIET slagen en ook niet stil verdwijnen: hij
/// hoort met een reden in het rapport te staan.
#[test]
fn zonder_beugelgegevens_meldt_de_dwarskrachttoets_dat_hij_niet_kan() {
    let mut inp = invoer(korf_kaal(), ugt(99.0, 150.0));
    inp.section = ConcreteSectionInput::rectangle(300.0, 600.0);
    inp.cage.cover_mm = 20.0;
    inp.cage.bottom = RebarRow { count: 4, diameter_mm: 20.0 };
    let r = check_concrete_beam(inp);
    let rc = toets(&r, "6.2_shear");

    assert_relative_eq!(var(rc, "d"), 562.0, max_relative = 1e-12);
    assert_relative_eq!(var(rc, r"V_{Rd,c}"), 90.99, max_relative = 1e-3);
    assert!(
        var(rc, r"V_{Rd,c}") < 99.0,
        "de proef gaat er juist over dat V_Ed boven V_Rd,c ligt"
    );

    assert_eq!(rc.status, CheckStatus::NotApplicable);
    assert!(rc.uc.is_none(), "een toets die niet kon, mag geen unity check tonen");
    let reden = rc.notes.join(" ");
    assert!(
        reden.contains("niet afgerekend"),
        "de reden ontbreekt in het rapport: {reden}"
    );
    assert!(
        reden.contains("beugel") || reden.contains("hart-op-hart") || reden.contains("benen"),
        "de reden noemt niet welk gegeven ontbreekt: {reden}"
    );

    // En hij is NIET stilzwijgend groen: de status is N/A, niet Ok.
    assert_ne!(rc.status, CheckStatus::Ok);
}

/// Een korte, zwaar belaste balk: de DWARSKRACHT is maatgevend en niet de
/// buiging. Tot fase 3 kon `governing_check_id` alleen een van de twee
/// buigtoetsen aanwijzen.
///
/// ```text
///   beugel Ø8 tweebenig h.o.h. 300 → A_sw/s = 100,530965/300 = 0,33510322
///   cot θ = 2,5 (K = 1 294 444,8/250 000 = 5,18 → gesloten oplossing 4,98,
///                afgekapt op de NB-bovengrens)
///   V_Rd,s = 0,33510322·408,6·434,782609·2,5 = 148 830 N = 148,83 kN
///   V_Rd,max = 1 294 444,8/2,9 = 446 360 N → V_Rd = 148,83 kN
///   UC dwarskracht = 250/148,83 = 1,680
///   UC buiging     = 20/113,3   = 0,177
/// ```
#[test]
fn de_maatgevende_toets_kan_de_dwarskracht_zijn() {
    let r = check_concrete_beam(invoer(korf_met_beugels(300.0), ugt(250.0, 20.0)));

    assert_eq!(r.governing_check_id, "6.2_shear");
    assert_eq!(r.status, CheckStatus::NotOk);
    assert_relative_eq!(uc(toets(&r, "6.2_shear")), 250.0 / 148.830, max_relative = 1e-3);
    assert!(uc(toets(&r, "6.1_bending_stress_block")) < 0.2);
    assert_relative_eq!(r.uc_max, 250.0 / 148.830, max_relative = 1e-3);
}

// ═══════════════════════════════════════════════════════════════════════════
// §7.3 Scheurbeheersing — en de FREQUENTE combinatie
// ═══════════════════════════════════════════════════════════════════════════

/// HANDBEREKENING van de gescheurde doorsnede onder M = 60 kNm, klassiek met
/// de omgerekende doorsnede (lineair-elastisch, betontrek verwaarloosd).
///
/// ```text
///   α_e = E_s/E_cm = 200 000/33 000 = 6,060606
///   A_s1 = 603,185789 mm² (d = 454)   A_s2 = 226,194671 mm² (d₂ = 44)
///   b·x²/2 + (α_e−1)·A_s2·(x−d₂) = α_e·A_s1·(d−x)
///   150x² + 5,060606·226,194671·(x−44) = 6,060606·603,185789·(454−x)
///   150x² + 1 144,68(x−44) = 3 655,67(454−x)
///   150x² + 4 800,35x − 1 710 054 = 0
///   x = (−4 800,35 + √(23 043 360 + 1 026 032 400))/300 = 27 588,9/300
///     = 91,96 mm
///   I_cr = 100x³ + 1 144,68(x−44)² + 3 655,67(454−x)²
///        = 77 766 800 + 2 632 900 + 479 113 000 = 559,51·10⁶ mm⁴
///   σ_s  = α_e·M·(d−x)/I_cr = 6,060606·60·10⁶·362,04/559,51·10⁶
///        = 235,3 N/mm²
/// ```
///
/// De kern rekent niet lineair maar met (3.14) van 3.1.5 op gemiddelde
/// waarden. Bij deze spanningen (σ_c ≈ 9,9 N/mm² tegen f_cm = 38) loopt die
/// kromme nog vrijwel recht, dus de twee horen binnen een procent te liggen.
/// Ze doen dat ook — en juist daarom is dit een echte controle: een
/// α_e-verwisseling, een verkeerde combinatie of een gespiegelde doorsnede zou
/// er tientallen procenten naast zitten.
#[test]
fn sigma_s_uit_de_gescheurde_doorsnede_handberekend() {
    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.sls_frequent_envelope = bgt(60.0);
    inp.exposure_class = Some(ExposureClass::XC3);
    let r = check_concrete_beam(inp);
    let rc = toets(&r, "7.3.4_scheurwijdte");

    assert_relative_eq!(var(rc, r"\alpha_e"), 200_000.0 / 33_000.0, max_relative = 1e-6);
    assert_relative_eq!(var(rc, r"\sigma_s"), 235.3, max_relative = 0.01);
    assert_relative_eq!(var(rc, "x"), 91.96, max_relative = 0.01);
}

/// DE COMBINATIE IS DE FREQUENTE, NIET DE UGT. Bij hetzelfde model staat in de
/// UGT-envelop 100 kNm en in de frequente 60 kNm. σ_s loopt in een gescheurde
/// doorsnede vrijwel evenredig met M, dus met de UGT-envelop zou er
/// 235,3·100/60 ≈ 392 N/mm² uitkomen — een derde te hoog, en de toets zou
/// zonder enig signaal een andere zijn.
#[test]
fn de_scheurwijdte_leest_de_frequente_combinatie_en_niet_de_ugt_envelop() {
    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.sls_frequent_envelope = bgt(60.0);
    inp.exposure_class = Some(ExposureClass::XC3);
    let r = check_concrete_beam(inp);
    let rc = toets(&r, "7.3.4_scheurwijdte");

    let sigma = var(rc, r"\sigma_s");
    assert!(
        (sigma - 235.3).abs() < 10.0,
        "σ_s = {sigma:.1} hoort bij M = 60 kNm; met de UGT-envelop zou hier ≈ 392 staan"
    );
    // Het krachtenpunt van de toets komt uit de frequente envelop: combinatie 7.
    assert_eq!(rc.force_state.combination_id, 7);
    assert_relative_eq!(rc.force_state.forces.my_ed, 60.0, max_relative = 1e-12);
    // En de afleiding zegt dat er met zoveel woorden bij.
    assert!(
        rc.notes.iter().any(|n| n.contains("frequente")),
        "de afleiding noemt de gebruikte belastingcombinatie niet"
    );
}

/// HANDBEREKENING van (7.9), (7.11) en (7.8) met de σ_s hierboven.
///
/// ```text
///   h_c,ef = min{2,5(500−454) = 115 ; (500−92)/3 = 136 ; 500/2 = 250} = 115 mm
///   A_c,eff = 300·115 = 34 500 mm²
///   ρ_p,eff = 603,185789/34 500 = 0,01748365
///   k_t = 0,4 (langdurend) ; f_ct,eff = f_ctm = 2,9 N/mm²
///   (7.9) hoofdterm
///     = (235,3 − 0,4·(2,9/0,01748365)·(1 + 6,060606·0,01748365))/200 000
///     = (235,3 − 0,4·165,864·1,105961)/200 000
///     = (235,3 − 73,371)/200 000 = 8,0965·10⁻⁴
///     ondergrens 0,6·235,3/200 000 = 7,059·10⁻⁴ → de hoofdterm is maatgevend
///   c (op de LANGSwapening) = c_nom + Ø_beugel = 30 + 8 = 38 mm
///   staafafstand (meetkunde): (300 − 2·38 − 16)/(3 − 1) = 104 mm
///     ≤ 5(c + Ø/2) = 5·46 = 230 mm → (7.11) mag
///   (7.11) s_r,max = 3,4·38 + 0,8·0,5·0,425·16/0,01748365
///                  = 129,2 + 155,57 = 284,77 mm
///   NB-bovengrens = max{(50 − 0,8·30)·16 ; 15·16} = max{416 ; 240} = 416 mm
///                   → niet maatgevend
///   (7.8) w_k = 284,77·8,0965·10⁻⁴ = 0,23056 mm
///   w_max (XC3, betonstaal, NB-tabel 7.1N) = 0,30 mm → UC = 0,7685
/// ```
#[test]
fn scheurwijdte_handberekend() {
    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.sls_frequent_envelope = bgt(60.0);
    inp.exposure_class = Some(ExposureClass::XC3);
    let r = check_concrete_beam(inp);
    let rc = toets(&r, "7.3.4_scheurwijdte");

    assert_eq!(rc.status, CheckStatus::Ok);
    assert_relative_eq!(var(rc, r"h_{c,ef}"), 115.0, max_relative = 1e-12);
    assert_relative_eq!(var(rc, r"A_{c,eff}"), 34_500.0, max_relative = 1e-12);
    assert_relative_eq!(var(rc, r"\rho_{p,eff}"), 0.01748365, max_relative = 1e-6);
    assert_relative_eq!(var(rc, "k_t"), 0.4, max_relative = 1e-12);
    assert_relative_eq!(var(rc, r"s_{r,max}"), 284.77, max_relative = 1e-3);
    assert_relative_eq!(var(rc, r"w_{max}"), 0.30, max_relative = 1e-12);
    // w_k volgt uit σ_s, en die komt uit de niet-lineaire kromme; 1,5 % ruimte
    // dekt precies dat verschil en niets meer.
    assert_relative_eq!(rc.value, 0.23056, max_relative = 0.015);
    assert_relative_eq!(uc(rc), 0.23056 / 0.30, max_relative = 0.015);

    // De afgeleide staafafstand staat in de afleiding, mét de mededeling dat
    // hij meetkunde is en geen normregel.
    let notes = rc.notes.join(" ");
    assert!(notes.contains("104 mm"), "de gebruikte staafafstand staat er niet: {notes}");
    assert!(notes.contains("meetkunde"), "de herkomst van de staafafstand ontbreekt");
}

/// De milieuklasse stuurt w_max en dus de unity check. XC1 geeft 0,40 mm in
/// plaats van 0,30 mm (NB-tabel 7.1N, kolom betonstaal), dus dezelfde
/// scheurwijdte levert een lagere UC.
#[test]
fn de_milieuklasse_stuurt_w_max() {
    let bouw = |klasse| {
        let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
        inp.sls_frequent_envelope = bgt(60.0);
        inp.exposure_class = Some(klasse);
        check_concrete_beam(inp)
    };
    let xc1 = bouw(ExposureClass::XC1);
    let xd1 = bouw(ExposureClass::XD1);
    assert_relative_eq!(var(toets(&xc1, "7.3.4_scheurwijdte"), r"w_{max}"), 0.40);
    assert_relative_eq!(var(toets(&xd1, "7.3.4_scheurwijdte"), r"w_{max}"), 0.20);
    assert_relative_eq!(
        uc(toets(&xc1, "7.3.4_scheurwijdte")),
        uc(toets(&xd1, "7.3.4_scheurwijdte")) / 2.0,
        max_relative = 1e-9
    );
}

/// Zonder frequente BGT-combinatie staan BEIDE scheurtoetsen in het rapport,
/// met de reden. Niet weggelaten, en niet groen.
#[test]
fn zonder_frequente_combinatie_staan_de_scheurtoetsen_er_met_reden() {
    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.exposure_class = Some(ExposureClass::XC3);
    let r = check_concrete_beam(inp);

    for id in ["7.3.2_minimumwapening", "7.3.4_scheurwijdte"] {
        let rc = toets(&r, id);
        assert_eq!(rc.status, CheckStatus::NotApplicable, "{id}");
        assert!(rc.uc.is_none(), "{id} toont een unity check die er niet is");
        let reden = rc.notes.join(" ");
        assert!(reden.contains("6.15"), "{id}: de reden noemt (6.15) niet: {reden}");
        assert!(
            reden.contains("frequente"),
            "{id}: de reden noemt de frequente combinatie niet"
        );
    }
    // De staaf blijft op de UGT-toetsen beoordeeld; de scheurtoetsen tellen
    // niet mee in uc_max, want er is niets uitgerekend om mee te tellen.
    assert_eq!(r.governing_check_id, "6.1_mn_kappa");
}

/// Zonder milieuklasse ook niet — en de reden wijst tabel 7.1N aan.
#[test]
fn zonder_milieuklasse_noemt_de_reden_tabel_7_1n() {
    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.sls_frequent_envelope = bgt(60.0);
    let r = check_concrete_beam(inp);

    let rc = toets(&r, "7.3.4_scheurwijdte");
    assert_eq!(rc.status, CheckStatus::NotApplicable);
    let reden = rc.notes.join(" ");
    assert!(reden.contains("milieuklasse"), "{reden}");
    assert!(reden.contains("7.1N"), "{reden}");
}

/// HANDBEREKENING §7.3.2 op dezelfde balk, zuivere buiging.
///
/// ```text
///   k_c = 0,4  (σ_c = 0, (7.2))
///   k   = 1,0 − (500 − 300)/500 · 0,35 = 0,86      (h = 500 mm)
///   f_ct,eff = f_ctm = 2,9 N/mm²
///   A_ct = b·h/2 = 300·250 = 75 000 mm²  (trekzone vóór het scheuren)
///   σ_s  = f_yk = 500 N/mm²  (7.3.2(2) staat dat toe)
///   (7.1) A_s,min = 0,4·0,86·2,9·75 000/500 = 149,64 mm²
///   aanwezig 603,19 mm² → UC = 149,64/603,19 = 0,2481
/// ```
#[test]
fn minimumwapening_handberekend() {
    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.sls_frequent_envelope = bgt(60.0);
    inp.exposure_class = Some(ExposureClass::XC3);
    let r = check_concrete_beam(inp);
    let rc = toets(&r, "7.3.2_minimumwapening");

    assert_relative_eq!(var(rc, "k_c"), 0.4, max_relative = 1e-12);
    assert_relative_eq!(var(rc, "k"), 0.86, max_relative = 1e-9);
    assert_relative_eq!(var(rc, r"A_{ct}"), 75_000.0, max_relative = 1e-12);
    assert_relative_eq!(rc.value, 149.64, max_relative = 1e-3);
    assert_relative_eq!(uc(rc), 149.64 / 603.185789, max_relative = 1e-3);
}

// ═══════════════════════════════════════════════════════════════════════════
// §7.4.2 Slankheid
// ═══════════════════════════════════════════════════════════════════════════

/// Zonder constructievorm geen K uit tabel 7.4N, dus geen grenswaarde — en dat
/// staat er.
#[test]
fn slankheid_zonder_constructievorm_meldt_dat_hij_niet_kan() {
    let r = check_concrete_beam(invoer(korf_met_beugels(150.0), ugt(80.0, 100.0)));
    let rc = toets(&r, "7.4.2_slankheid");
    assert_eq!(rc.status, CheckStatus::NotApplicable);
    assert!(rc.uc.is_none());
    let reden = rc.notes.join(" ");
    assert!(reden.contains("7.4N"), "{reden}");
}

/// HANDBEREKENING §7.4.2 voor de vrij opgelegde referentiebalk, M_Ed = 100 kNm.
///
/// ```text
///   K   = 1,0                                  (tabel 7.4N, vrij opgelegd)
///   ρ₀  = 10⁻³·√30 = 0,00547723
///   A_s,req volgt uit de omkering van §6.1 en ligt rond 530 mm²;
///   ρ   = A_s,req/(b_w·d) ligt daarmee onder ρ₀ → (7.16.a)
///   l/d werkelijk = 5000/454 = 11,0132
/// ```
///
/// De grenswaarde zelf komt uit de module en is daar met de hand nagerekend;
/// hier gaat het erom dat de aansluiting de juiste getallen aanlevert: K uit de
/// opgegeven vorm, f_ck uit de betonklasse, d van de trekzijde en de
/// overspanning uit `length_m`. Vandaar dat die vier apart worden vastgepind.
#[test]
fn slankheid_met_constructievorm() {
    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.structural_system = Some(StructuralSystem::SimplySupported);
    let r = check_concrete_beam(inp);
    let rc = toets(&r, "7.4.2_slankheid");

    assert_eq!(rc.status, CheckStatus::Ok);
    assert_relative_eq!(var(rc, "K"), 1.0, max_relative = 1e-12);
    assert_relative_eq!(var(rc, "f_{ck}"), 30.0, max_relative = 1e-12);
    assert_relative_eq!(var(rc, "l"), 5000.0, max_relative = 1e-12);
    assert_relative_eq!(var(rc, "d"), 454.0, max_relative = 1e-12);
    assert_relative_eq!(var(rc, r"\rho_0"), 1e-3 * 30f64.sqrt(), max_relative = 1e-9);
    assert_relative_eq!(var(rc, r"(l/d)_{werkelijk}"), 5000.0 / 454.0, max_relative = 1e-9);
    assert_relative_eq!(uc(rc), (5000.0 / 454.0) / rc.value, max_relative = 1e-9);

    // ρ' = 0 en de herkomst van ρ staan in de afleiding — anders is niet te
    // zien dat de drukwapening bewust buiten beschouwing is gelaten.
    let notes = rc.notes.join(" ");
    assert!(notes.contains("A_s,req"), "{notes}");
    assert!(notes.contains("b_w"), "{notes}");
}

// ═══════════════════════════════════════════════════════════════════════════
// §9.2.1, §9.2.2 en §8.2 — de detaillering
// ═══════════════════════════════════════════════════════════════════════════

/// Alle negen detailleringseisen staan in het resultaat, in de volgorde van de
/// module.
#[test]
fn de_negen_detailleringstoetsen_staan_in_het_resultaat() {
    let r = check_concrete_beam(invoer(korf_met_beugels(150.0), ugt(80.0, 100.0)));
    for id in [
        "9.2.1.1_as_min",
        "9.2.1.1_as_max",
        "9.2.1.1_min_diameter_langs",
        "9.2.2_rho_w_min",
        "9.2.2_sl_max",
        "9.2.2_st_max",
        "9.2.2_min_diameter_beugel",
        "9.2_min_balkbreedte",
        "8.2_vrije_staafafstand",
    ] {
        let _ = toets(&r, id);
    }
    // Zestien en niet vijftien: naast de vijftien hierboven staat er sinds
    // §5.8 altijd één kolomregel in de lijst. Deze balk draagt geen
    // normaaldruk, dus die regel zegt dat §5.8 niet van toepassing is — met
    // de reden, en niet door hem weg te laten.
    assert_eq!(
        r.checks.len(),
        16,
        "6.1 (2×), 6.2, 7.3 (2×), 7.4.2, negen keer 9.2/8.2 en één keer 5.8"
    );
}

/// HANDBEREKENING §9.2.2 — de twee eisen die op de UITKOMST van §6.2 leunen.
///
/// ```text
///   ρ_w      = A_sw/(s·b_w·sin α) = 100,530965/(150·300·1) = 0,00223402
///   ρ_w,min  = 0,08·√30/500 = 0,08·5,4772256/500 = 0,00087636   (NB (9.5N))
///   UC       = 0,00087636/0,00223402 = 0,39229
///
///   s_l,max  = min{0,75·454·(1 + cot 90°) ; 300} = min{340,5 ; 300} = 300 mm
///   UC       = 150/300 = 0,5
///
///   s_t      = 300 − 2·30 − 8 = 232 mm  (tweebenige beugel, meetkunde)
///   V_Ed = 80 kN ≤ 0,5·V_Rd,max = 0,5·446,36 = 223,18 kN → ruime tak, 500 mm
///   UC       = 232/500 = 0,464
/// ```
///
/// De tak van s_t,max hangt aan V_Rd,max, en die komt uit de dwarskrachttoets.
/// Zonder die doorgifte zou de toets in de verkeerde tak belanden.
#[test]
fn de_detaillering_leunt_op_de_uitkomst_van_de_dwarskrachttoets() {
    let r = check_concrete_beam(invoer(korf_met_beugels(150.0), ugt(80.0, 100.0)));

    let rho_w = toets(&r, "9.2.2_rho_w_min");
    assert_relative_eq!(var(rho_w, r"\rho_w"), 0.00223402, max_relative = 1e-5);
    assert_relative_eq!(var(rho_w, r"\rho_{w,\min}"), 0.00087636, max_relative = 1e-5);
    assert_relative_eq!(uc(rho_w), 0.39229, max_relative = 1e-4);

    let sl = toets(&r, "9.2.2_sl_max");
    assert_relative_eq!(sl.value, 300.0, max_relative = 1e-12);
    assert_relative_eq!(uc(sl), 0.5, max_relative = 1e-12);

    let st = toets(&r, "9.2.2_st_max");
    // V_Rd,max is doorgegeven uit §6.2 — dít is de aansluiting.
    assert_relative_eq!(var(st, r"V_{Rd,\max}"), 446.360, max_relative = 1e-4);
    assert_relative_eq!(var(st, r"V_{Ed}"), 80.0, max_relative = 1e-12);
    assert_relative_eq!(var(st, "s_t"), 232.0, max_relative = 1e-12);
    assert_relative_eq!(st.value, 500.0, max_relative = 1e-12);
    assert_relative_eq!(uc(st), 232.0 / 500.0, max_relative = 1e-9);
}

/// Zonder korrelafmeting doet §8.2(2) geen uitspraak — met reden — en met
/// korrelafmeting wél.
///
/// ```text
///   a_vrij  = (300 − 2·(30 + 8) − 3·16)/(3 − 1) = (224 − 48)/2 = 88 mm
///   vereist = max{1·16 ; 32 + 5 ; 20} = 37 mm  → UC = 37/88 = 0,42045
/// ```
#[test]
fn de_korrelafmeting_wordt_niet_aangenomen() {
    let zonder = check_concrete_beam(invoer(korf_met_beugels(150.0), ugt(80.0, 100.0)));
    let rc = toets(&zonder, "8.2_vrije_staafafstand");
    assert_eq!(rc.status, CheckStatus::NotApplicable);
    assert!(rc.notes.join(" ").contains("d_g"));

    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.aggregate_size_mm = Some(32.0);
    let met = check_concrete_beam(inp);
    let rc = toets(&met, "8.2_vrije_staafafstand");
    assert_eq!(rc.status, CheckStatus::Ok);
    assert_relative_eq!(var(rc, r"a_{vrij}"), 88.0, max_relative = 1e-12);
    assert_relative_eq!(uc(rc), 37.0 / 88.0, max_relative = 1e-9);
}

// ═══════════════════════════════════════════════════════════════════════════
// De regel die over alle toetsen heen geldt
// ═══════════════════════════════════════════════════════════════════════════

/// GEEN ENKELE TOETS MELDT GROEN ZONDER TE HEBBEN GEREKEND, en geen enkele
/// toets die niet kon, zwijgt over de reden. Dit loopt alle gevallen af die de
/// orchestrator kent: alles ingevuld, alles leeg, en de twee tussenvormen.
#[test]
fn een_toets_die_niet_kon_zwijgt_niet_en_meldt_niet_groen() {
    let gevallen: Vec<(&str, ConcreteBeamCheckInput)> = vec![
        ("niets ingevuld", invoer(korf_kaal(), ugt(80.0, 100.0))),
        ("alleen beugels", invoer(korf_met_beugels(150.0), ugt(80.0, 100.0))),
        ("alles ingevuld", {
            let mut i = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
            i.sls_frequent_envelope = bgt(60.0);
            i.exposure_class = Some(ExposureClass::XC3);
            i.aggregate_size_mm = Some(32.0);
            i.structural_system = Some(StructuralSystem::SimplySupported);
            i
        }),
        ("alleen de BGT-combinatie, geen milieuklasse", {
            let mut i = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
            i.sls_frequent_envelope = bgt(60.0);
            i
        }),
    ];

    for (naam, inp) in gevallen {
        let r = check_concrete_beam(inp);
        // Vijftien toetsen plus de ene kolomregel van §5.8; zie
        // `de_negen_detailleringstoetsen_staan_in_het_resultaat`.
        assert_eq!(r.checks.len(), 16, "{naam}: er ontbreekt een toets");
        for c in &r.checks {
            let CheckKind::Resistance(rc) = &c.kind else {
                unreachable!()
            };
            if rc.status == CheckStatus::NotApplicable {
                assert!(
                    !rc.notes.is_empty(),
                    "{naam}: toets {} is niet uitgevoerd maar noemt geen reden",
                    rc.id
                );
            } else {
                assert!(
                    rc.uc.is_some(),
                    "{naam}: toets {} meldt {:?} zonder unity check",
                    rc.id,
                    rc.status
                );
            }
        }
    }
}

/// Een T-ligger loopt door dezelfde keten: b_w en niet de flensbreedte in
/// §6.2 en §9.2.2, en de flensbreedte wél in §7.4.2.
#[test]
fn de_t_ligger_gebruikt_b_w_waar_de_norm_b_w_vraagt() {
    let mut inp = invoer(korf_met_beugels(150.0), ugt(80.0, 100.0));
    inp.section = ConcreteSectionInput {
        shape: nen_en_1992_1_1::ConcreteShape::Tee,
        b_mm: 600.0,
        h_mm: 500.0,
        b_w_mm: Some(300.0),
        h_f_mm: Some(120.0),
        flange_at_bottom: false,
    };
    inp.structural_system = Some(StructuralSystem::SimplySupported);
    let r = check_concrete_beam(inp);

    assert_relative_eq!(var(toets(&r, "6.2_shear"), "b_w"), 300.0, max_relative = 1e-12);
    assert_relative_eq!(var(toets(&r, "9.2.2_rho_w_min"), "b_w"), 300.0, max_relative = 1e-12);
    // 7.4.2 kent beide breedten: de flenscorrectie 0,8 geldt zodra
    // b_flens/b_rib > 3. Hier is 600/300 = 2 en geldt zij dus niet.
    let slank = toets(&r, "7.4.2_slankheid");
    assert_relative_eq!(var(slank, r"k_{flens}"), 1.0, max_relative = 1e-12);
}

// ═══════════════════════════════════════════════════════════════════════════
// Wat is de MAATGEVENDE toets? — een eis waaraan je voldoet begrenst niets
// ═══════════════════════════════════════════════════════════════════════════

/// De toets met de hoogste unity check van het hele resultaat, ongeacht soort.
fn hoogste_uc(r: &ConcreteBeamCheckResult) -> (String, f64) {
    let mut top = (String::new(), 0.0_f64);
    for c in &r.checks {
        let CheckKind::Resistance(rc) = &c.kind else {
            unreachable!("betontoetsen zijn geen stabiliteitstoetsen")
        };
        if rc.status == CheckStatus::NotApplicable {
            continue;
        }
        let u = rc.uc.as_ref().map(|u| u.uc).unwrap_or(0.0);
        if u > top.1 {
            top = (rc.id.clone(), u);
        }
    }
    top
}

/// **Een detailleringseis waaraan ruim wordt voldaan, mag de maatgevende
/// toets van de staaf NIET zijn.**
///
/// Referentiebalk 300 × 500, beugel Ø8 tweebenig h.o.h. 150 mm, M_Ed = 60 kNm
/// en V_Ed = 20 kN. Alles is met de hand na te rekenen uit de getallen die
/// eerder in dit bestand zijn afgeleid:
///
/// ```text
///   STERKTE
///   6.1 spanningsblok : 60/113,33  = 0,5294     (M_Rd uit handberekening 1)
///   6.1 M-N-κ         : binnen 2 % daarvan
///   6.2 dwarskracht   : V_Ed = 20 kN < V_Rd,c = 64,402 kN → de betontak,
///                       UC = 20/64,402 = 0,3106
///   7.3 en 7.4.2      : N/A — geen BGT-combinatie, geen constructievorm
///
///   DETAILLERING
///   9.2.2(9) Ø_sw,min : 5/8       = 0,625   ← de HOOGSTE UC van de staaf
///   9.2.2(6) s_l,max  : geen dwarskrachtwapening vereist → 300 mm,
///                       UC = 150/300 = 0,5
///   9.2.1.1(5) Ø_langs: 6/12      = 0,5
///   9.2.2(5) ρ_w,min  : 0,00087636/0,00223402 = 0,3923
/// ```
///
/// De beugel is Ø8 waar Ø5 volstaat. Die eis is dus ruim vervuld en begrenst
/// niets: het ontwerp loopt vast op de buiging, niet op de beugeldiameter.
/// Zonder de regel uit `mag_maatgevend_zijn` wees `governing_check_id` hier
/// `9.2.2_min_diameter_beugel` aan met 0,625 — een uitvoeringsregel als
/// maatgevende toets van de staaf.
#[test]
fn een_vervulde_detailleringseis_wordt_niet_de_maatgevende_toets() {
    let r = check_concrete_beam(invoer(korf_met_beugels(150.0), ugt(20.0, 60.0)));

    // De opzet klopt alleen als de detailleringseis werkelijk de hoogste UC
    // van het hele resultaat heeft — anders bewijst de test niets.
    let beugel = toets(&r, "9.2.2_min_diameter_beugel");
    assert_eq!(beugel.status, CheckStatus::Ok, "de eis hoort te VOLDOEN");
    assert_relative_eq!(uc(beugel), 5.0 / 8.0, max_relative = 1e-12);
    let (top_id, top_uc) = hoogste_uc(&r);
    assert_eq!(top_id, "9.2.2_min_diameter_beugel", "de opzet is verschoven: {top_id} = {top_uc}");

    // En tóch is de maatgevende toets een STERKTEtoets, met de bijbehorende UC.
    assert_eq!(r.governing_check_id, "6.1_mn_kappa");
    assert_relative_eq!(r.uc_max, uc(toets(&r, "6.1_mn_kappa")), max_relative = 1e-12);
    assert!(
        r.uc_max < uc(beugel),
        "uc_max {} zou onder de vervulde detailleringseis {} moeten liggen",
        r.uc_max,
        uc(beugel)
    );
    assert_eq!(r.status, CheckStatus::Ok);

    // Er verdwijnt niets: alle zestien toetsen staan er nog, mét hun unity
    // check. Alleen de RANGSCHIKKING is anders.
    assert_eq!(r.checks.len(), 16);
    assert!(beugel.uc.is_some());
}

/// **Een detailleringseis die FAALT is wél maatgevend** — dan is de korf niet
/// uit te voeren zoals hij is getekend, en dát begrenst het ontwerp.
///
/// Dezelfde balk en dezelfde krachten, maar de beugel staat op 400 mm:
///
/// ```text
///   9.2.2(6) s_l,max  : V_Ed = 20 kN < V_Rd,c = 64,402 kN, dus rekenkundig
///                       geen dwarskrachtwapening vereist → s_l,max = 300 mm
///                       (het NB-plafond), UC = 400/300 = 1,3333  → VOLDOET NIET
///   9.2.2(5) ρ_w,min  : ρ_w = 100,530965/(400·300) = 0,000837758
///                       UC = 0,00087636/0,000837758 = 1,0461      → VOLDOET NIET
///   9.2.2(9) Ø_sw,min : 5/8 = 0,625                               → voldoet
///   6.1 en 6.2        : ongewijzigd, alle onder 0,55
/// ```
///
/// De hoogste UC is nu 1,3333 en die hóórt bovenaan te staan: de staaf is
/// NotOk en het rapport moet aanwijzen waarom.
#[test]
fn een_falende_detailleringseis_is_wel_maatgevend() {
    let r = check_concrete_beam(invoer(korf_met_beugels(400.0), ugt(20.0, 60.0)));

    let sl = toets(&r, "9.2.2_sl_max");
    assert_eq!(sl.status, CheckStatus::NotOk);
    assert_relative_eq!(uc(sl), 400.0 / 300.0, max_relative = 1e-12);

    assert_eq!(r.governing_check_id, "9.2.2_sl_max");
    assert_relative_eq!(r.uc_max, 400.0 / 300.0, max_relative = 1e-12);
    assert_eq!(r.status, CheckStatus::NotOk);

    // De vervulde eis met 0,625 blijft ondergeschikt, ook al staat hij in
    // dezelfde lijst — het onderscheid zit in "faalt hij", niet in "is het
    // een detailleringseis".
    let beugel = toets(&r, "9.2.2_min_diameter_beugel");
    assert_eq!(beugel.status, CheckStatus::Ok);
    assert_relative_eq!(uc(beugel), 5.0 / 8.0, max_relative = 1e-12);
}
