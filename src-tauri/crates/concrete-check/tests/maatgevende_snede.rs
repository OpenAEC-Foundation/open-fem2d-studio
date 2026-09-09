//! **Op welke SNEDE wordt een toets afgerekend?**
//!
//! WAAROM DEZE TESTS BESTAAN
//! Een doorsnedetoets hoort te worden uitgevoerd op de snede waar hij het
//! zwaarst uitvalt. Dat is de snede met de hoogste UNITY CHECK en niet die met
//! de grootste belasting — die twee vallen alleen samen als de weerstand langs
//! de staaf constant is, en dat is zij niet. De trekzijde volgt uit het TEKEN
//! van M_Ed, en daarmee veranderen de nuttige hoogte d, de langswapening A_sl,
//! de aanwezige trekwapening en de momentweerstand M_Rd. Bij een asymmetrische
//! korf scheelt dat een factor.
//!
//! Elke proef hieronder legt daarom TWEE sneden naast elkaar waarvan de
//! zwaarst BELASTE niet de zwaarst BENUTTE is, en houdt vast dat de toetsing
//! de tweede kiest. Zou de keuze terugvallen op de belasting, dan meldt de
//! toetsing een TE LAGE unity check — en dat is onveilig.
//!
//! DE GETALLEN ZIJN MET DE HAND UITGEREKEND. De doorsnede is dezelfde
//! referentiebalk als in `referentie_balk.rs` en `nieuwe_toetsen.rs`:
//! 300 × 500 mm, C30/37, B500B, dekking 30 mm, beugel Ø8, onder 3Ø16,
//! boven 2Ø12. Vaste waarden die telkens terugkomen:
//!
//! ```text
//!   f_cd = 20 N/mm²   f_yd = 434,782609 N/mm²   f_ctm = 2,9 N/mm²
//!   A_s,onder = 3·π/4·16² = 603,185789 mm²   d      = 500 − 30 − 8 − 8 = 454 mm
//!   A_s,boven = 2·π/4·12² = 226,194671 mm²   h − d₂ = 500 − (30 + 8 + 6) = 456 mm
//! ```

use approx::assert_relative_eq;
use concrete_check::{
    check_concrete_beam, CheckKind, CheckStatus, ConcreteBeamCheckInput, ConcreteBeamCheckResult,
};
use mechanics::{ForcePoint, InternalForces};
use nen_en_1992_1_1::{
    ConcreteSectionInput, ExposureClass, RebarRow, ReinforcementCage, ReinforcementZones,
};
use nen_en_1993_1_1_section::ResistanceCalc;

const A_S_ONDER: f64 = 603.185789;
const A_S_BOVEN: f64 = 226.194671;

// ── Bouwstenen ──────────────────────────────────────────────────────────────

fn korf(beugelafstand: Option<f64>) -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        stirrup_spacing_mm: beugelafstand,
        stirrup_legs: beugelafstand.map(|_| 2),
        ..ReinforcementCage::default()
    }
}

fn punt(combi: u32, x_mm: f64, n: f64, v: f64, m: f64) -> ForcePoint {
    ForcePoint {
        combination_id: combi,
        position_mm: x_mm,
        forces: InternalForces { n_ed: n, vz_ed: v, my_ed: m, ..Default::default() },
    }
}

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

fn uc(rc: &ResistanceCalc) -> f64 {
    rc.uc.as_ref().unwrap_or_else(|| panic!("toets {} heeft geen unity check", rc.id)).uc
}

/// De toetsing van één losse snede: een omhullende van precies dat ene punt.
/// Zo is per snede na te rekenen wat de toets daar zou opleveren, en is te
/// bewijzen dat de keuze uit de volle omhullende de zwaarste van beide is.
fn los_punt(cage: ReinforcementCage, p: ForcePoint) -> ConcreteBeamCheckResult {
    check_concrete_beam(invoer(cage, vec![p]))
}

// ═══════════════════════════════════════════════════════════════════════════
// §6.2 — de dwarskrachtsnede
// ═══════════════════════════════════════════════════════════════════════════

/// **DE VONDST WAAR DEZE TAAK OM BEGON.** De snede met de grootste |V_Ed| is
/// niet de snede met de hoogste unity check.
///
/// Twee sneden op dezelfde balk:
///
/// ```text
///   A  x = 0    : V_Ed = 60 kN, M_Ed = +40 kNm  → TREK ONDER
///   B  x = 2500 : V_Ed = 55 kN, M_Ed = −40 kNm  → TREK BOVEN
/// ```
///
/// SNEDE A — trek onder, dus d = 454 mm en A_sl = A_s,onder = 603,185789 mm².
///
/// ```text
///   ρ_l  = 603,185789/(300·454) = 603,185789/136 200 = 0,00442868
///   k    = 1 + √(200/454) = 1 + 0,6637233 = 1,6637233        (≤ 2,0)
///   100·ρ_l·f_ck = 13,286045 ; ∛13,286045 = 2,3684556
///   C_Rd,c = 0,18/1,5 = 0,12
///   (6.2.a) = 0,12·1,6637233·2,3684556·136 200 = 64 402 N = 64,402 kN
///   v_min   = 0,035·1,6637233^1,5·√30 = 0,035·2,1459597·5,4772256 = 0,4113867
///   (6.2.b) = 0,4113867·136 200 = 56 031 N = 56,031 kN
///   V_Rd,c  = max = 64,402 kN  ≥ V_Ed = 60 kN → betonspoor
///   UC_A    = 60/64,402 = 0,93165
/// ```
///
/// SNEDE B — trek boven, dus d = 456 mm en A_sl = A_s,boven = 226,194671 mm².
///
/// ```text
///   ρ_l  = 226,194671/(300·456) = 226,194671/136 800 = 0,00165347
///   k    = 1 + √(200/456) = 1 + 0,6622662 = 1,6622662
///   100·ρ_l·f_ck = 4,9604094 ; ∛4,9604094 = 1,7053190
///   (6.2.a) = 0,12·1,6622662·1,7053190·136 800 = 46 534 N = 46,534 kN
///   v_min   = 0,035·1,6622662^1,5·√30 = 0,035·2,1431432·5,4772256 = 0,4108467
///   (6.2.b) = 0,4108467·136 800 = 56 204 N = 56,204 kN   ← nu MAATGEVEND
///   V_Rd,c  = max = 56,204 kN  ≥ V_Ed = 55 kN → betonspoor
///   UC_B    = 55/56,204 = 0,97858
/// ```
///
/// Zoeken op |V_Ed| wijst A aan en meldt 0,93 met een weerstand van 64,40 kN,
/// terwijl de werkelijk maatgevende weerstand 56,20 kN is en de unity check
/// 0,98. Dat verschil is precies de vondst uit het vooronderzoek, en het staat
/// aan de ONVEILIGE kant: het rapport zou een lagere benutting melden dan er is.
///
/// De kern levert V_Rd,c = 56,20379 kN tegen de 56,204 kN hierboven.
#[test]
fn de_dwarskracht_kiest_de_snede_met_de_hoogste_unity_check() {
    let a = punt(1, 0.0, 0.0, 60.0, 40.0);
    let b = punt(1, 2500.0, 0.0, 55.0, -40.0);

    // Eerst de twee sneden afzonderlijk: de handberekening hierboven moet
    // kloppen, anders bewijst de rest niets.
    let los_a = los_punt(korf(None), a);
    let rc_a = toets(&los_a, "6.2_shear");
    assert_relative_eq!(rc_a.value, 64.402, max_relative = 1e-4);
    assert_relative_eq!(uc(rc_a), 60.0 / 64.402, max_relative = 1e-4);

    let los_b = los_punt(korf(None), b);
    let rc_b = toets(&los_b, "6.2_shear");
    assert_relative_eq!(rc_b.value, 56.204, max_relative = 1e-4);
    assert_relative_eq!(uc(rc_b), 55.0 / 56.204, max_relative = 1e-4);

    // A is zwaarder BELAST, B is zwaarder BENUT.
    assert!(a.forces.vz_ed > b.forces.vz_ed, "A draagt de grootste dwarskracht");
    assert!(uc(rc_b) > uc(rc_a), "B heeft de hoogste unity check");

    // En dan de volle omhullende: B moet winnen.
    let r = check_concrete_beam(invoer(korf(None), vec![a, b]));
    let rc = toets(&r, "6.2_shear");
    assert_relative_eq!(rc.force_state.position_mm, 2500.0, max_relative = 1e-12);
    assert_relative_eq!(rc.force_state.forces.vz_ed, 55.0, max_relative = 1e-12);
    assert_relative_eq!(rc.force_state.forces.my_ed, -40.0, max_relative = 1e-12);
    assert_relative_eq!(rc.value, 56.204, max_relative = 1e-4);
    assert_relative_eq!(uc(rc), 55.0 / 56.204, max_relative = 1e-4);
    assert_relative_eq!(r.uc_max, 55.0 / 56.204, max_relative = 1e-4);
    assert_eq!(r.governing_check_id, "6.2_shear");

    // De afleiding vertelt WAAROM er niet op |V_Ed| is gezocht, en noemt de
    // grootste |V_Ed| van de staaf, zodat de lezer het verschil kan zien.
    let notes = rc.notes.join(" ");
    assert!(notes.contains("UNITY CHECK"), "de afleiding noemt het criterium niet: {notes}");
    assert!(
        notes.contains("60,0 kN") || notes.contains("60.0 kN"),
        "de grootste |V_Ed| van de staaf staat niet in de afleiding: {notes}"
    );
}

/// Een snede waar de dwarskrachttoets NIET kan worden afgerekend, gaat vóór
/// elke snede met een keurige unity check.
///
/// Zoeken op de hoogste unity check mag nooit een ONTBREKENDE unity check
/// verbergen. Twee sneden, zonder beugelgegevens in de korf:
///
/// ```text
///   A  V_Ed =  40 kN, M_Ed = +40 kNm → V_Rd,c = 64,402 kN, UC = 0,621
///   B  V_Ed = 100 kN, M_Ed = −40 kNm → V_Rd,c = 56,204 kN < 100 kN, dus
///      rekenkundig dwarskrachtwapening vereist; die gegevens ontbreken →
///      GEEN unity check
/// ```
///
/// Zou de zoektocht alleen op de unity check gaan, dan won A met 0,621 en zou
/// het rapport groen melden terwijl er bij B een beugelberekening ontbreekt.
#[test]
fn een_snede_zonder_uitkomst_verdringt_een_snede_met_een_lage_unity_check() {
    let a = punt(1, 0.0, 0.0, 40.0, 40.0);
    let b = punt(1, 2500.0, 0.0, 100.0, -40.0);

    let los_a = toets(&los_punt(korf(None), a), "6.2_shear").clone();
    assert_eq!(los_a.status, CheckStatus::Ok);
    assert_relative_eq!(uc(&los_a), 40.0 / 64.402, max_relative = 1e-4);

    let los_b = toets(&los_punt(korf(None), b), "6.2_shear").clone();
    assert_eq!(los_b.status, CheckStatus::NotApplicable);
    assert!(los_b.uc.is_none(), "bij B is er niets uit te rekenen");

    let r = check_concrete_beam(invoer(korf(None), vec![a, b]));
    let rc = toets(&r, "6.2_shear");
    assert_eq!(rc.status, CheckStatus::NotApplicable, "de onbepaalde snede hoort te winnen");
    assert!(rc.uc.is_none());
    assert_relative_eq!(rc.force_state.position_mm, 2500.0, max_relative = 1e-12);
    assert!(rc.notes.join(" ").contains("niet afgerekend"));
}

// ═══════════════════════════════════════════════════════════════════════════
// §6.1 — de buigsnede
// ═══════════════════════════════════════════════════════════════════════════

/// Het grootste |M_Ed| is niet de zwaarste buigsnede.
///
/// M_Rd hangt van het TEKEN van M_Ed af, want dat bepaalt welke rij op trek
/// staat. Bij trek onder (3Ø16) is M_Rd 113,3 kNm; bij trek boven (2Ø12) veel
/// minder. De handberekening van de tweede, met de rechthoekige
/// spanningsverdeling van 3.1.7(3) en de gedrukte rand ONDER:
///
/// ```text
///   lagen vanaf de gedrukte (onder)rand: 3Ø16 op 46 mm, 2Ø12 op 456 mm
///   evenwicht N = 0:  F_c + F_s,46 + F_s,456 = 0   (druk positief)
///   met x = 38,27 mm:
///     F_c     = η·f_cd·b·λ·x = 1,0·20·300·0,8·38,27 = 183,7 kN
///     ε(46)   = ε_cu3·(1 − 46/x) = 0,0035·(1 − 1,2020) = −0,000707 → elastisch
///               σ = −141,4 N/mm² → F_s,46 = 603,186·(−141,4) = −85,3 kN
///     ε(456)  = ver in trek → vloeit → F_s,456 = 226,195·(−434,78) = −98,3 kN
///     som     = 183,7 − 85,3 − 98,3 ≈ 0                                ✔
///   armen t.o.v. het midden (h/2 = 250 mm vanaf de gedrukte rand):
///     F_c    op λx/2 = 15,31 mm → arm  +234,69 mm
///     F_s,46 op 46 mm          → arm  +204 mm
///     F_s,456 op 456 mm        → arm  −206 mm
///   M_Rd = 183,7·0,23469 − 85,3·0,204 + 98,3·0,206
///        = 43,11 − 17,40 + 20,25 = 45,96 kNm
/// ```
///
/// De kern levert x = 38,26635 mm, F_c = 183,678 kN, F_s,46 = −85,333 kN en
/// M_Rd = 45,95939 kNm — de handberekening zit er 0,002 % naast.
///
/// Daarmee:
///
/// ```text
///   A  M_Ed = +100 kNm → UC = 100/113,29 = 0,8827
///   B  M_Ed =  −45 kNm → UC =  45/45,96  = 0,9791   ← maatgevend
/// ```
///
/// Zoeken op |M_Ed| wijst A aan en meldt 0,88 waar 0,98 hoort te staan.
#[test]
fn de_buiging_kiest_de_snede_met_de_hoogste_unity_check() {
    let a = punt(1, 2500.0, 0.0, 0.0, 100.0);
    let b = punt(1, 0.0, 0.0, 0.0, -45.0);

    // De twee weerstanden afzonderlijk, tegen de handberekening.
    let los_a = toets(&los_punt(korf(Some(150.0)), a), "6.1_bending_stress_block").clone();
    assert_relative_eq!(los_a.value, 113.29, max_relative = 1e-3);
    let los_b = toets(&los_punt(korf(Some(150.0)), b), "6.1_bending_stress_block").clone();
    // 45,96 kNm is met de hand uitgerekend via een iteratie op x; een halve
    // procent ruimte dekt het afronden in die iteratie en niets meer.
    assert_relative_eq!(los_b.value, 45.96, max_relative = 5e-3);
    assert!(uc(&los_b) > uc(&los_a), "B is zwaarder benut ondanks het kleinere moment");

    let r = check_concrete_beam(invoer(korf(Some(150.0)), vec![a, b]));
    for id in ["6.1_bending_stress_block", "6.1_mn_kappa"] {
        let rc = toets(&r, id);
        assert_relative_eq!(rc.force_state.forces.my_ed, -45.0, max_relative = 1e-12);
        assert_relative_eq!(rc.force_state.position_mm, 0.0, max_relative = 1e-12);
        assert!(uc(rc) > 0.95, "{id}: UC = {} hoort rond 0,98 te liggen", uc(rc));
    }
    // Het spanningsblok: 45/45,96 = 0,9791, met dezelfde halve procent ruimte.
    assert_relative_eq!(
        uc(toets(&r, "6.1_bending_stress_block")),
        45.0 / 45.96,
        max_relative = 5e-3
    );
    // De M-N-κ-tak rekent met het parabool-rechthoekdiagram en komt daar
    // binnen 2 % bij uit — dezelfde marge als in `referentie_balk.rs`.
    assert_relative_eq!(uc(toets(&r, "6.1_mn_kappa")), 45.0 / 45.96, max_relative = 0.02);

    // En de afleiding zegt uit hoeveel sneden er is gekozen.
    let notes = toets(&r, "6.1_bending_stress_block").notes.join(" ");
    assert!(notes.contains("UNITY CHECK"), "{notes}");
    assert!(notes.contains("2 sneden"), "het aantal sneden staat er niet: {notes}");
}

/// De M-N-κ-toets houdt zijn oude tweede kandidaat: het punt met de grootste
/// DRUK. Dat is nu een gevolg van de groepering en geen aparte regel meer —
/// een ander N_Ed is per definitie een eigen groep — maar het moet wél blijven
/// werken, want bij een kolom kan de minimale excentriciteit van 6.1(4) dat
/// punt maatgevend maken.
#[test]
fn het_drukpunt_blijft_een_eigen_snede() {
    let env = vec![
        punt(1, 0.0, -2000.0, 0.0, 25.0),
        punt(2, 0.0, -800.0, 0.0, 60.0),
        punt(2, 3000.0, -800.0, 0.0, 20.0),
    ];
    let r = check_concrete_beam(invoer(korf(Some(150.0)), env));
    let rc = toets(&r, "6.1_mn_kappa");
    // Drie punten, twee groepen: (M > 0; N = −2000) en (M > 0; N = −800). In
    // de tweede groep wint 60 kNm van 20 kNm.
    assert!(rc.notes.iter().any(|n| n.contains("3 sneden")), "{:?}", rc.notes);
    assert!(rc.notes.iter().any(|n| n.contains("blijven er 2 over")), "{:?}", rc.notes);
    assert!(uc(rc).is_finite());
    // Welke van de twee wint hangt van M_Rd(N) af; in beide gevallen komt de
    // toets uit een van de twee groepsafgevaardigden.
    let n = rc.force_state.forces.n_ed;
    let m = rc.force_state.forces.my_ed;
    assert!(
        (n == -2000.0 && m == 25.0) || (n == -800.0 && m == 60.0),
        "de toets staat op een snede die geen groepsafgevaardigde is: N = {n}, M = {m}"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// §7.3 — de scheursneden
// ═══════════════════════════════════════════════════════════════════════════

/// De scheurtoetsen kiezen hun snede uit de FREQUENTE envelop op hun eigen
/// unity check, en niet op het grootste moment.
///
/// Twee sneden onder de frequente combinatie:
///
/// ```text
///   A  x = 2500 : M = +60 kNm  (trek onder, 3Ø16)
///   B  x = 0    : M = −30 kNm  (trek boven, 2Ø12)   ← half zo groot
/// ```
///
/// GESCHEURDE DOORSNEDE BIJ B, klassiek met de omgerekende doorsnede
/// (α_e = E_s/E_cm = 200 000/33 000 = 6,060606; de drukzone ligt ONDER):
///
/// ```text
///   A_s,trek = 226,194671 (d = 456)   A_s,druk = 603,185789 (d' = 46)
///   150x² + 5,060606·603,186·(x − 46) = 6,060606·226,195·(456 − x)
///   150x² + 3 052,3(x − 46) = 1 370,9(456 − x)
///   150x² + 4 423,2x − 765 536 = 0
///   x = (−4 423,2 + √478 886 418)/300 = (−4 423,2 + 21 883,5)/300 = 58,20 mm
///   I_cr = 100x³ + 3 052,3(x − 46)² + 1 370,9(456 − x)²
///        = 19 713 700 + 454 300 + 216 934 000 = 237,10·10⁶ mm⁴
///   σ_s  = α_e·M·(d − x)/I_cr = 6,060606·30·10⁶·397,80/237,10·10⁶ = 305,0 N/mm²
/// ```
///
/// Bij A is σ_s 235,3 N/mm² (handberekening in `nieuwe_toetsen.rs`). Het HALVE
/// moment levert dus een DERTIG PROCENT HOGERE staalspanning, want er zit aan
/// die kant maar een derde van de wapening.
///
/// SCHEURWIJDTE BIJ B:
///
/// ```text
///   h_c,ef  = min{2,5·(500 − 456) = 110 ; (500 − 58,2)/3 = 147,3 ; 250} = 110 mm
///   A_c,eff = 300·110 = 33 000 mm²
///   ρ_p,eff = 226,194671/33 000 = 0,00685438
///   (7.9) hoofdterm
///     = (305,0 − 0,4·(2,9/0,00685438)·(1 + 6,060606·0,00685438))/200 000
///     = (305,0 − 0,4·423,08·1,041542)/200 000 = (305,0 − 176,26)/200 000
///     = 6,437·10⁻⁴
///     ondergrens 0,6·305,0/200 000 = 9,150·10⁻⁴ → DE ONDERGRENS is maatgevend
///   c (op de langswapening) = 30 + 8 = 38 mm
///   staafafstand (meetkunde): (300 − 2·38 − 12)/(2 − 1) = 212 mm
///     ≤ 5(c + Ø/2) = 5·44 = 220 mm → (7.11) mag
///   (7.11) s_r,max = 3,4·38 + 0,8·0,5·0,425·12/0,00685438 = 129,2 + 297,6 = 426,8 mm
///   NB-bovengrens = max{(50 − 0,8·30)·12 ; 15·12} = max{312 ; 180} = 312 mm
///     → de NB-bovengrens is BINDEND: s_r,max = 312 mm
///   (7.8) w_k = 312·9,150·10⁻⁴ = 0,28548 mm
///   w_max (XC3, betonstaal, NB-tabel 7.1N) = 0,30 mm → UC = 0,9516
/// ```
///
/// Bij A is w_k 0,23056 mm en de UC 0,7685. Zoeken op het grootste moment
/// wijst A aan en meldt 0,77 waar 0,95 hoort te staan.
///
/// MINIMUMWAPENING BIJ B (§7.3.2, zuivere buiging, rechthoek):
///
/// ```text
///   k_c = 0,4 ; k = 1,0 − (500 − 300)/500·0,35 = 0,86 ; f_ct,eff = 2,9
///   A_ct = b·h/2 = 75 000 mm²  (dezelfde helft, welke kant ook op trek staat)
///   σ_s  = f_yk = 500 N/mm²
///   (7.1) A_s,min = 0,4·0,86·2,9·75 000/500 = 149,64 mm²
///   aanwezig aan de TREKzijde: 226,194671 mm² → UC = 149,64/226,195 = 0,6616
/// ```
///
/// Bij A wordt dezelfde 149,64 mm² door 603,185789 mm² gedeeld en is de UC
/// 0,2481 — een factor 2,67 lager, precies de verhouding van de twee
/// wapeningsrijen.
///
/// WAT DE KERN LEVERT, naast de handberekening:
///
/// ```text
///   σ_s      305,0    → 305,341   (0,11 % ; de kern rekent met (3.14) van
///                                  3.1.5 en niet met de lineaire omrekening)
///   x         58,20   →  57,583   (1,1 %  ; zelfde oorzaak)
///   h_c,ef   110      → 110       exact
///   s_r,max  312      → 312       exact (de NB-bovengrens is bindend)
///   w_k        0,28548→   0,28580 (0,11 %)
///   A_s,min  149,64   → 149,64    exact ; UC = 0,66155 tegen 0,66155
/// ```
#[test]
fn de_scheurtoetsen_kiezen_hun_eigen_snede() {
    let mut inp = invoer(korf(Some(150.0)), vec![punt(1, 0.0, 0.0, 20.0, 60.0)]);
    inp.exposure_class = Some(ExposureClass::XC3);
    inp.sls_frequent_envelope =
        vec![punt(7, 2500.0, 0.0, 0.0, 60.0), punt(7, 0.0, 0.0, 0.0, -30.0)];
    let r = check_concrete_beam(inp);

    let wijdte = toets(&r, "7.3.4_scheurwijdte");
    // De toets staat op de snede met het KLEINSTE moment.
    assert_relative_eq!(wijdte.force_state.forces.my_ed, -30.0, max_relative = 1e-12);
    assert_relative_eq!(wijdte.force_state.position_mm, 0.0, max_relative = 1e-12);
    // De handberekening, met dezelfde 1,5 % ruimte als in `nieuwe_toetsen.rs`:
    // σ_s komt uit de niet-lineaire kromme (3.14) en niet uit de lineaire
    // omrekening hierboven.
    let var = |rc: &ResistanceCalc, s: &str| {
        rc.variables.iter().find(|v| v.symbol == s).unwrap_or_else(|| panic!("{s} ontbreekt")).value
    };
    assert_relative_eq!(var(wijdte, r"\sigma_s"), 305.0, max_relative = 0.015);
    assert_relative_eq!(var(wijdte, "x"), 58.20, max_relative = 0.015);
    assert_relative_eq!(var(wijdte, r"h_{c,ef}"), 110.0, max_relative = 1e-12);
    assert_relative_eq!(var(wijdte, r"s_{r,max}"), 312.0, max_relative = 1e-9);
    assert_relative_eq!(wijdte.value, 0.28548, max_relative = 0.02);
    assert_relative_eq!(uc(wijdte), 0.28548 / 0.30, max_relative = 0.02);

    let minimum = toets(&r, "7.3.2_minimumwapening");
    assert_relative_eq!(minimum.force_state.forces.my_ed, -30.0, max_relative = 1e-12);
    assert_relative_eq!(minimum.value, 149.64, max_relative = 1e-3);
    assert_relative_eq!(uc(minimum), 149.64 / A_S_BOVEN, max_relative = 1e-3);

    // De afleiding vertelt dat er per toets is gezocht.
    assert!(
        wijdte.notes.iter().any(|n| n.contains("UNITY CHECK van DEZE toets")),
        "{:?}",
        wijdte.notes
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// §9.2.1.1 — de enige detailleringseis die van de snede afhangt
// ═══════════════════════════════════════════════════════════════════════════

/// **A_s,min moet aan BEIDE trekzijden worden nagegaan.**
///
/// §9.2.1.1(1) zet de vereiste minimumwapening af tegen de AANWEZIGE
/// trekwapening, en welke rij dat is volgt uit het teken van M_Ed. A_s,min zelf
/// verandert nauwelijks tussen de twee zijden — het is dezelfde doorsnede,
/// dezelfde f_ctm en (bij een rechthoek) hetzelfde weerstandsmoment — maar de
/// noemer verschilt een factor A_s,onder/A_s,boven = 603,185789/226,194671 =
/// 2,667. De unity check aan de bovenzijde is dus ruim tweeënhalf keer zo hoog.
///
/// Deze test pint de ABSOLUTE A_s,min niet vast: die komt uit de omkering van
/// §6.1 en is in `nen-en-1992-1-1` met de hand nagerekend. Wat hier telt is de
/// AANSLUITING — dat de eis op de zwaarste trekzijde wordt afgerekend en door
/// de wapening van díe zijde wordt gedeeld — en dat is met de twee losse
/// sneden erbij volledig na te rekenen.
#[test]
fn de_minimumwapening_van_9_2_1_1_kijkt_naar_beide_trekzijden() {
    let a = punt(1, 0.0, 0.0, 0.0, 40.0);
    let b = punt(1, 2500.0, 0.0, 0.0, -40.0);

    let los_a = toets(&los_punt(korf(Some(150.0)), a), "9.2.1.1_as_min").clone();
    let los_b = toets(&los_punt(korf(Some(150.0)), b), "9.2.1.1_as_min").clone();
    // Elk deelt door de wapening van ZIJN trekzijde — dat is de kern van de
    // eis, en het is hier exact na te rekenen.
    assert_relative_eq!(uc(&los_a), los_a.value / A_S_ONDER, max_relative = 1e-9);
    assert_relative_eq!(uc(&los_b), los_b.value / A_S_BOVEN, max_relative = 1e-9);
    // A_s,min zelf ligt bij beide binnen een paar procent van elkaar; de unity
    // check scheelt daardoor bijna de volle verhouding van de twee rijen.
    assert_relative_eq!(los_b.value, los_a.value, max_relative = 0.05);
    assert!(
        uc(&los_b) / uc(&los_a) > 2.4,
        "de bovenzijde hoort ruim tweeënhalf keer zo zwaar te zijn: {} tegen {}",
        uc(&los_b),
        uc(&los_a)
    );

    // Uit de volle omhullende moet B komen, óók al is |M_Ed| aan beide zijden
    // even groot en wijst het grootste moment dus niets aan.
    let r = check_concrete_beam(invoer(korf(Some(150.0)), vec![a, b]));
    let rc = toets(&r, "9.2.1.1_as_min");
    assert_relative_eq!(rc.force_state.forces.my_ed, -40.0, max_relative = 1e-12);
    assert_relative_eq!(uc(rc), rc.value / A_S_BOVEN, max_relative = 1e-9);
    assert_relative_eq!(uc(rc), uc(&los_b), max_relative = 1e-9);

    // En de acht andere eisen blijven staan waar ze stonden: op de snede met
    // het grootste moment. Die zijn maten van de KORF en hangen niet van de
    // snede af; er wordt voor hen dus niets gezocht.
    for id in [
        "9.2.1.1_as_max",
        "9.2.1.1_min_diameter_langs",
        "9.2.2_rho_w_min",
        "9.2.2_sl_max",
        "9.2.2_st_max",
        "9.2.2_min_diameter_beugel",
        "9.2_min_balkbreedte",
    ] {
        let ander = toets(&r, id);
        assert_relative_eq!(
            ander.force_state.forces.my_ed,
            40.0,
            max_relative = 1e-12,
            epsilon = 1e-12
        );
    }
}

/// §9.2.2(6) leest "is er rekenkundig dwarskrachtwapening vereist?" over de
/// HELE staaf en niet op één snede.
///
/// Twee sneden, met beugels Ø8 h.o.h. 400 mm (A_sw = 2·π/4·8² = 100,530965 mm²,
/// A_sw/s = 0,25132741 mm²/mm, f_ywd = 434,782609 N/mm², ν₁ = 0,528):
///
/// ```text
///   A  V_Ed = 63 kN, M_Ed = +40 kNm → trek ONDER, d = 454 mm, z = 408,6 mm
///      V_Rd,c   = 64,4028 kN ≥ 63  → SPOOR A: geen BEREKENDE wapening nodig
///      teller (6.9) = 1,0·300·408,6·0,528·20 = 1 294 445 N
///      K = 1 294 445/63 000 = 20,55 → cot θ op de NB-bovengrens 2,5
///      (6.8) V_Rd,s = 0,25132741·408,6·434,782609·2,5 = 111 622 N = 111,6222 kN
///      (6.9) V_Rd,max = 1 294 445/2,9 = 446,360 kN → de beugels zijn maatgevend
///      V_Rd = max(64,4028 ; 111,6222) = 111,6222 kN
///      UC   = 63/111,6222 = 0,56440                 ← de hoogste unity check
///   B  V_Ed = 57 kN, M_Ed = −40 kNm → trek BOVEN, d = 456 mm, z = 410,4 mm
///      V_Rd,c   = 56,2038 kN < 57   → SPOOR B: 6.2.1(5) eist wapening
///      (6.8) V_Rd,s = 0,25132741·410,4·434,782609·2,5 = 112 114 N = 112,1139 kN
///      (6.9) V_Rd,max = 1 300 147/2,9 = 448,327 kN
///      V_Rd = min(112,1139 ; 448,327) = 112,1139 kN
///      UC   = 57/112,1139 = 0,50841
/// ```
///
/// De snede met de hoogste dwarskracht-unity-check (A, 0,564) ligt in SPOOR A;
/// alleen B vraagt rekenkundig om dwarskrachtwapening. Wie die vraag op één
/// snede beantwoordt, komt hier op "nee" uit en laat s_l,max in de ruime tak van
/// 300 mm belanden, terwijl de strengere tak min(0,75·d ; 300 mm) hoort te
/// gelden. Bij d = 454 mm is 0,75·d = 340,5 mm, dus het NB-plafond van 300 mm
/// blijft in beide takken bindend en de unity check verandert hier niet — maar
/// de TAK die het rapport noemt wel, en bij een lagere balk (d < 400 mm)
/// verandert ook het getal.
///
/// # WAAROM DE GETALLEN ZIJN VERSCHOVEN (was: A 60 kN/0,932, B 70 kN/0,624)
///
/// Deze proef stond op de oude regel "spoor A ⇒ V_Rd = V_Rd,c". Daardoor kwam
/// snede A op 60/64,402 = 0,932 uit — een unity check die niet uit de
/// constructie kwam maar uit de spoorgrens: waar V_Ed net onder V_Rd,c duikt is
/// die verhouding per definitie bijna 1,0, terwijl er op diezelfde snede
/// beugels liggen die 111,6 kN dragen. 6.2.1(2) geeft een element MET
/// dwarskrachtwapening de weerstand V_Rd,s, ongeacht of 6.2.1(3) daarom vraagt,
/// dus meldt de kern nu max(V_Rd,c ; V_Rd,s). Met de oude belastingen zou A
/// daarmee op 0,538 uitkomen en B op 0,624, en zou B de maatgevende snede
/// worden — precies de opstelling die deze proef NIET wil hebben. De twee
/// dwarskrachten zijn daarom zó gekozen dat A weer de zwaarst benutte snede is
/// (63 kN, nog net onder V_Rd,c = 64,4028 kN) en B er nog net boven zit
/// (57 kN tegen V_Rd,c = 56,2038 kN). Wat de proef bewijst is onveranderd.
///
/// De kern levert V_Rd,c = 56,20379 kN en V_Rd,s = 112,11388 kN tegen de
/// 56,2038 en 112,1139 kN hierboven.
#[test]
fn de_vraag_of_er_dwarskrachtwapening_vereist_is_geldt_voor_de_hele_staaf() {
    let a = punt(1, 0.0, 0.0, 63.0, 40.0);
    let b = punt(1, 2500.0, 0.0, 57.0, -40.0);
    let r = check_concrete_beam(invoer(korf(Some(400.0)), vec![a, b]));

    // De opzet klopt alleen als A werkelijk de hoogste dwarskracht-unity-check
    // heeft en tóch in spoor A ligt — dus dat 6.2.1(3) daar geen berekende
    // wapening eist, ook al leveren de beugels er wél de weerstand.
    let dwars = toets(&r, "6.2_shear");
    assert_relative_eq!(dwars.force_state.position_mm, 0.0, max_relative = 1e-12);
    assert_relative_eq!(dwars.value, 111.6222, max_relative = 1e-4);
    assert_relative_eq!(uc(dwars), 63.0 / 111.6222, max_relative = 1e-3);
    let los_b = toets(&los_punt(korf(Some(400.0)), b), "6.2_shear").clone();
    assert_relative_eq!(los_b.value, 112.1139, max_relative = 1e-4);
    assert_relative_eq!(uc(&los_b), 57.0 / 112.1139, max_relative = 1e-3);
    assert!(uc(&los_b) < uc(dwars), "B is minder benut dan A, en tóch beslist B hier");

    // En de detailleringseis leest de STRENGE tak.
    let sl = toets(&r, "9.2.2_sl_max");
    assert!(
        sl.notes
            .iter()
            .any(|n| n.contains("Er is rekenkundig dwarskrachtwapening vereist")),
        "s_l,max staat in de ruime tak terwijl er ergens wapening nodig is: {:?}",
        sl.notes
    );
    assert_relative_eq!(sl.value, 300.0, max_relative = 1e-12);
}

// ═══════════════════════════════════════════════════════════════════════════
// Wat er NIET verandert
// ═══════════════════════════════════════════════════════════════════════════

/// §7.4.2 blijft op het punt met het GROOTSTE MOMENT staan, en dat is geen
/// vergeetachtigheid maar de norm.
///
/// 7.4.2(2) omschrijft ρ als "de vereiste wapeningsverhouding van de
/// trekwapening IN HET MIDDEN VAN DE OVERSPANNING (bij uitkragingen ter plaatse
/// van de oplegging) waarmee het moment ten gevolge van de rekenwaarde van de
/// belastingen kan zijn opgenomen". De snede is dus VOORGESCHREVEN, en het
/// grootste |M_Ed| is daar de benadering van. Zoeken op de unity check zou hier
/// juist een ANDERE toets opleveren dan de norm vraagt.
///
/// De Nederlandse bijlage wijkt hier NIET van af: het enige NBP-artikel in §7.4
/// is 7.4.2(2), en dat gaat uitsluitend over de status van tabel 7.4N ("De
/// waarde van K moet aan tabel 7.4N zijn ontleend, welke tabel als normatief
/// moet zijn gelezen"). De omschrijving van ρ blijft de EN-tekst.
#[test]
fn de_slankheidstoets_blijft_op_het_grootste_moment() {
    use nen_en_1992_1_1::slankheid::StructuralSystem;
    let mut inp = invoer(
        korf(Some(150.0)),
        vec![punt(1, 2500.0, 0.0, 0.0, 100.0), punt(1, 0.0, 0.0, 0.0, -45.0)],
    );
    inp.structural_system = Some(StructuralSystem::SimplySupported);
    let r = check_concrete_beam(inp);

    let slank = toets(&r, "7.4.2_slankheid");
    assert_relative_eq!(slank.force_state.forces.my_ed, 100.0, max_relative = 1e-12);
    assert_relative_eq!(slank.force_state.position_mm, 2500.0, max_relative = 1e-12);
    // d hoort dan ook bij de onderwapening: 454 mm, niet 456 mm.
    let d = slank.variables.iter().find(|v| v.symbol == "d").expect("d").value;
    assert_relative_eq!(d, 454.0, max_relative = 1e-12);

    // Terwijl de buigtoetsen op dezelfde omhullende wél naar de andere snede
    // zijn verhuisd — het verschil is dus een keuze en geen toeval.
    assert_relative_eq!(
        toets(&r, "6.1_bending_stress_block").force_state.forces.my_ed,
        -45.0,
        max_relative = 1e-12
    );
}

/// Een symmetrische korf kent het probleem niet: dan is de weerstand aan beide
/// zijden gelijk en valt de zwaarst benutte snede samen met de zwaarst belaste.
/// De uitkomst mag daar dus NIET veranderen.
#[test]
fn bij_een_symmetrische_korf_verandert_er_niets() {
    let symmetrisch = ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 3, diameter_mm: 16.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        stirrup_spacing_mm: Some(150.0),
        stirrup_legs: Some(2),
        ..ReinforcementCage::default()
    };
    let a = punt(1, 0.0, 0.0, 60.0, 40.0);
    let b = punt(1, 2500.0, 0.0, 55.0, -40.0);
    let r = check_concrete_beam(invoer(symmetrisch, vec![a, b]));

    // De dwarskracht staat op de snede met de grootste |V_Ed| — hier zijn de
    // twee criteria het eens.
    let dwars = toets(&r, "6.2_shear");
    assert_relative_eq!(dwars.force_state.forces.vz_ed, 60.0, max_relative = 1e-12);
    // De buiging staat op de eerste van twee gelijkwaardige sneden.
    assert_relative_eq!(
        toets(&r, "6.1_bending_stress_block").forces_abs(),
        40.0,
        max_relative = 1e-12
    );
}

/// Kleine hulp voor de test hierboven: |M_Ed| van de getoetste snede.
trait MomentAbs {
    fn forces_abs(&self) -> f64;
}
impl MomentAbs for ResistanceCalc {
    fn forces_abs(&self) -> f64 {
        self.force_state.forces.my_ed.abs()
    }
}
