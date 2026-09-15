//! §5.8 aangesloten — de kolomtoets zoals de orchestrator en het losse
//! `concrete_column_check` hem draaien.
//!
//! WAAROM DEZE TESTS BESTAAN
//! `nen-en-1992-1-1/tests/kolom_5_8.rs` bewaakt de FORMULES. Hier gaat het om
//! de AANSLUITING: komt de slankheidsgrens werkelijk in het resultaat, met de
//! juiste snede uit de omhullende, met de eindmomenten die uit het
//! krachtsverloop zijn gelezen, en — als een gegeven ontbreekt — met de reden
//! in plaats van met stilte of met een aangenomen waarde.
//!
//! DE KOLOM EN DE GETALLEN
//! Vierkante kolom 300 × 300 mm, C30/37, B500B, dekking 30 mm, beugel Ø8,
//! boven 2Ø16 en onder 2Ø16. Vrije lengte l = 3,0 m.
//!
//! ```text
//!   A_c   = 300 · 300                        = 90 000 mm²
//!   f_cd  = 1,0 · 30/1,5                     = 20 N/mm²        (NB bij 3.1.6)
//!   f_yd  = 500/1,15                         = 434,7826 N/mm²
//!   A_s   = 4 · π/4 · 16²                    = 804,2477 mm²   (boven + onder)
//!   i     = h/√12 = 300/3,4641016            = 86,60254 mm     (5.8.3.2(1))
//!   ω     = 804,2477 · 434,7826/(90 000·20)  = 0,1942627       (5.8.3.1(1))
//!   B     = √(1 + 2·0,1942627)               = 1,1783571
//!   n     = 600 000/(90 000 · 20)            = 0,3333333
//!   A     = 0,7 (φ_ef onbekend)
//! ```
//!
//! Bij een GESCHOORDE kolom met M₀₁ = −20 kNm en M₀₂ = +40 kNm:
//!
//! ```text
//!   r_m     = −20/40 = −0,5   →   C = 1,7 − (−0,5) = 2,2
//!   l₀      = 1,0 · 3000 = 3000 mm            (figuur 5.7 a)
//!   λ       = 3000/86,60254 = 34,64102        (5.14)
//!   λ_lim   = 20·0,7·1,1783571·2,2/√0,3333333 = 62,86201  (NB bij 5.8.3.1(1))
//!   λ < λ_lim → de tweede-orde-effecten mogen worden verwaarloosd
//! ```
//!
//! Dezelfde kolom als CONSOLE (figuur 5.7 b, ongeschoord):
//!
//! ```text
//!   C       = 0,7 ("voor niet-geschoorde elementen in het algemeen")
//!   l₀      = 2,0 · 3000 = 6000 mm
//!   λ       = 6000/86,60254 = 69,28203
//!   λ_lim   = 20·0,7·1,1783571·0,7/√0,3333333 = 20,00155
//!   λ ≥ λ_lim → er MOET tweede orde worden gerekend
//! ```

use approx::assert_relative_eq;
use concrete_check::{
    check_concrete_beam, column_check, CheckKind, CheckStatus, ConcreteBeamCheckInput,
    ConcreteBeamCheckResult, ConcreteColumnCheckRequest, ConcreteColumnInput, Kniklengtekeuze,
};
use mechanics::{ForcePoint, InternalForces};
use nen_en_1992_1_1::kolom::{Beugelzone, Knikgeval, Overlappingssituatie, Schoring};
use nen_en_1992_1_1::{
    ConcreteSectionInput, RebarRow, ReinforcementCage, ReinforcementZones, ResistanceCalc,
};

const SLANKHEIDSGRENS: &str = "5.8.3.1_slankheidsgrens";
const KRUIP: &str = "5.8.4_kruip";

// ── Bouwstenen ──────────────────────────────────────────────────────────────

/// De kolomkorf: dekking 30, beugel Ø8 h.o.h. 200, boven 2Ø16, onder 2Ø16.
///
/// Symmetrisch, want een kolom heeft geen trek- en drukzijde die vastligt. Deze
/// korf heeft GEEN zijstaven — vier staven in de vier hoeken, en verder niets.
/// Dat is met opzet: hij is de proef dat een korf zonder `sides` blijft rekenen
/// zoals hij deed, en tegelijk het eenvoudigste geval waarin §9.5.2(4) en
/// §9.5.3(6) een uitkomst hebben (vier hoeken bezet, a_max = 0 mm).
fn korf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        stirrup_spacing_mm: Some(200.0),
        stirrup_legs: Some(2),
        top: RebarRow { count: 2, diameter_mm: 16.0 },
        bottom: RebarRow { count: 2, diameter_mm: 16.0 },
        ..ReinforcementCage::default()
    }
}

fn punt(combi: u32, x_mm: f64, n: f64, m: f64) -> ForcePoint {
    ForcePoint {
        combination_id: combi,
        position_mm: x_mm,
        forces: InternalForces { n_ed: n, my_ed: m, ..Default::default() },
    }
}

/// De UGT-omhullende van de kolom: 600 kN DRUK (dus n_ed = −600) over de hele
/// lengte, met de opgegeven momenten aan de twee einden en in het midden.
fn ugt(m_onder: f64, m_midden: f64, m_boven: f64) -> Vec<ForcePoint> {
    vec![
        punt(1, 0.0, -600.0, m_onder),
        punt(1, 1500.0, -600.0, m_midden),
        punt(1, 3000.0, -600.0, m_boven),
    ]
}

/// Het geschoorde geval: M₀₁ = −20 aan de bovenkant, M₀₂ = +40 aan de
/// onderkant, en in het midden 10 — kleiner dan beide einden, dus GEEN
/// dwarsbelasting.
fn ugt_geschoord() -> Vec<ForcePoint> {
    ugt(40.0, 10.0, -20.0)
}

fn kolomgegevens(bracing: Schoring, geval: Knikgeval) -> ConcreteColumnInput {
    ConcreteColumnInput {
        bracing,
        buckling_length: Kniklengtekeuze::Figuur57 { geval },
        phi_inf_t0: None,
        stirrup_zone: None,
        lap_situation: None,
        bracing_z: None,
        buckling_length_z: None,
        m0_edz_knm: None,
    }
}

fn verzoek(kolom: ConcreteColumnInput, envelop: Vec<ForcePoint>) -> ConcreteColumnCheckRequest {
    ConcreteColumnCheckRequest {
        beam_id: 3,
        section: ConcreteSectionInput::rectangle(300.0, 300.0),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        cage: korf(),
        length_m: 3.0,
        column: kolom,
        forces_envelope: envelop,
        sls_quasi_permanent_envelope: vec![],
        design_situation: Default::default(),
        steel_branch: Default::default(),
    }
}

/// Dezelfde kolom als volledige staaftoetsing, zodat aantoonbaar is dat de
/// orchestrator en het losse verzoek dezelfde rekengang lopen.
fn staaf(kolom: Option<ConcreteColumnInput>, envelop: Vec<ForcePoint>) -> ConcreteBeamCheckInput {
    ConcreteBeamCheckInput {
        beam_id: 3,
        section: ConcreteSectionInput::rectangle(300.0, 300.0),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        cage: korf(),
        reinforcement_zones: ReinforcementZones::default(),
        length_m: 3.0,
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
        sls_quasi_permanent_envelope: vec![],
        column: kolom,
        staafstand: None,
        staafstand_notities: None,
    }
}

fn toets<'a>(checks: &'a [concrete_check::NamedCheck], id: &str) -> &'a ResistanceCalc {
    let c = checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("toets {id} ontbreekt in het resultaat"));
    match &c.kind {
        CheckKind::Resistance(r) => r,
        _ => panic!("toets {id} is geen ResistanceCalc"),
    }
}

fn toets_van_staaf<'a>(r: &'a ConcreteBeamCheckResult, id: &str) -> &'a ResistanceCalc {
    toets(&r.checks, id)
}

// ── De poort zelf ───────────────────────────────────────────────────────────

/// HANDBEREKENING — geschoorde kolom, figuur 5.7 a).
///
/// Alle tussenstappen staan in de moduledoc hierboven. Wat deze test bewaakt
/// is de KETEN: de traagheidsstraal uit de niet-gescheurde doorsnede, de
/// eindmomenten uit de omhullende, en λ_lim met C = 2,2 die daaruit volgt.
#[test]
fn geschoorde_kolom_handberekend() {
    let a = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt_geschoord(),
    ))
    .expect("de kolomtoets hoort te lopen");

    assert_relative_eq!(a.l0_mm.unwrap(), 3000.0, max_relative = 1e-12);
    assert_relative_eq!(a.lambda.unwrap(), 34.6410162, max_relative = 1e-6);
    assert_relative_eq!(a.lambda_lim.unwrap(), 62.86201, max_relative = 1e-6);
    assert!(a.tweede_orde_verwaarloosbaar.unwrap());

    let poort = toets(&a.checks, SLANKHEIDSGRENS);
    assert_eq!(poort.status, CheckStatus::Ok);
    let uc = poort.uc.as_ref().expect("de poort hoort een unity check te hebben");
    assert_relative_eq!(uc.ed, 34.6410162, max_relative = 1e-6);
    assert_relative_eq!(uc.rd, 62.86201, max_relative = 1e-6);
    assert_relative_eq!(uc.uc, 34.6410162 / 62.86201, max_relative = 1e-6);

    // C = 2,2 is de enige manier waarop λ_lim boven 40 uitkomt; de afleiding
    // hoort de twee eindmomenten dus met naam en toenaam te noemen.
    let tekst = poort.notes.join(" ");
    assert!(tekst.contains("M₀₁"), "de afleiding noemt de eindmomenten niet: {tekst}");
    assert!(
        tekst.contains("geen dwarsbelasting"),
        "de afleiding hoort te melden dat er geen veldmoment groter dan de einden is"
    );
}

/// De ONGESCHOORDE console: dezelfde kolom, l₀ = 2l, en C = 0,7 die de norm
/// voor een niet-geschoord element voorschrijft. λ loopt daarmee van 34,6 naar
/// 69,3 en λ_lim zakt van 62,9 naar 20,0 — samen bijna een factor tien in de
/// unity check. Dát is waarom geschoord invoer is en geen aanname.
#[test]
fn ongeschoorde_console_moet_tweede_orde_rekenen() {
    let a = column_check(verzoek(
        kolomgegevens(Schoring::Ongeschoord, Knikgeval::Console),
        ugt_geschoord(),
    ))
    .expect("de kolomtoets hoort te lopen");

    assert_relative_eq!(a.l0_mm.unwrap(), 6000.0, max_relative = 1e-12);
    assert_relative_eq!(a.lambda.unwrap(), 69.2820323, max_relative = 1e-6);
    assert_relative_eq!(a.lambda_lim.unwrap(), 20.00155, max_relative = 1e-6);
    assert!(!a.tweede_orde_verwaarloosbaar.unwrap());

    let poort = toets(&a.checks, SLANKHEIDSGRENS);
    assert_eq!(
        poort.status,
        CheckStatus::NotOk,
        "λ ≥ λ_lim hoort NIET groen te zijn: de doorsnedetoetsen zijn dan op de verkeerde \
         krachten gedraaid zolang er geen tweede orde is gerekend"
    );
    let tekst = poort.notes.join(" ");
    assert!(
        tekst.contains("GEEN bezwijken"),
        "de melding moet uitleggen dat dit geen bezwijken is maar een eis om tweede orde te \
         rekenen: {tekst}"
    );
    assert!(
        tekst.contains("5.8.6"),
        "de melding hoort de weg te noemen die dan gelopen moet worden"
    );
}

/// Het verschil tussen de twee hierboven is uitsluitend het ONTWERPBESLUIT.
/// Deze test legt dat als één vergelijking vast, zodat een latere wijziging
/// die het onderscheid wegpoetst hier omvalt.
#[test]
fn geschoord_en_ongeschoord_geven_een_andere_uitkomst() {
    let g = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt_geschoord(),
    ))
    .unwrap();
    let o = column_check(verzoek(
        kolomgegevens(Schoring::Ongeschoord, Knikgeval::TweezijdigIngeklemdOngeschoord),
        ugt_geschoord(),
    ))
    .unwrap();
    // Zelfde l₀ (allebei 1,0·l), maar C = 2,2 tegen C = 0,7.
    assert_relative_eq!(g.l0_mm.unwrap(), o.l0_mm.unwrap(), max_relative = 1e-12);
    assert_relative_eq!(g.lambda.unwrap(), o.lambda.unwrap(), max_relative = 1e-12);
    assert!(
        g.lambda_lim.unwrap() > 3.0 * o.lambda_lim.unwrap(),
        "C = 2,2 tegen C = 0,7 hoort λ_lim ruim een factor drie te schelen: {} tegen {}",
        g.lambda_lim.unwrap(),
        o.lambda_lim.unwrap()
    );
    assert!(g.tweede_orde_verwaarloosbaar.unwrap());
    assert!(!o.tweede_orde_verwaarloosbaar.unwrap());
}

/// l₀ RECHTSTREEKS OPGEGEVEN — de uitweg voor wie (5.15), (5.16) of (5.17)
/// zelf heeft doorgerekend. λ = 2100/86,60254 = 24,2487.
#[test]
fn opgegeven_kniklengte_wordt_gebruikt() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.buckling_length = Kniklengtekeuze::Opgegeven { l0_m: 2.1 };
    let a = column_check(verzoek(k, ugt_geschoord())).unwrap();
    assert_relative_eq!(a.l0_mm.unwrap(), 2100.0, max_relative = 1e-12);
    assert_relative_eq!(a.lambda.unwrap(), 24.2487113, max_relative = 1e-6);
}

/// EEN l₀ VAN NUL IS GEEN LENGTE. (5.14) weigert alleen een i van nul; een l₀
/// van nul zou een λ van nul opleveren, en die ligt onder ELKE λ_lim. Het
/// rapport zou dan groen melden dat de tweede orde mag vervallen op grond van
/// een leeg veld — precies het soort stilte dat deze toetsing hoort te
/// voorkomen.
#[test]
fn een_opgegeven_l0_van_nul_wordt_geweigerd() {
    for l0 in [0.0, -2.5] {
        let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
        k.buckling_length = Kniklengtekeuze::Opgegeven { l0_m: l0 };
        let a = column_check(verzoek(k, ugt_geschoord())).unwrap();
        assert!(a.lambda.is_none(), "l₀ = {l0} hoort geen λ op te leveren");
        let poort = toets(&a.checks, SLANKHEIDSGRENS);
        assert_eq!(poort.status, CheckStatus::NotApplicable);
        assert!(
            poort.notes.join(" ").contains("geen lengte"),
            "de reden hoort te zeggen dat dit geen lengte is"
        );
    }
}

/// EEN NEGATIEVE KRUIPCOËFFICIËNT BESTAAT NIET. `factor_a` valt bij een
/// negatieve φ_ef stilzwijgend terug op 0,7 en §5.8.4(4) leest φ ≤ 2 dan als
/// "vervuld"; allebei zouden de kolom gunstiger maken dan hij is.
#[test]
fn een_negatieve_kruipcoefficient_wordt_geweigerd() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.phi_inf_t0 = Some(-1.0);
    let a = column_check(verzoek(k, ugt_geschoord())).unwrap();
    assert!(a.lambda.is_none());
    assert!(toets(&a.checks, SLANKHEIDSGRENS)
        .notes
        .join(" ")
        .contains("nooit negatief"));
}

/// EEN KNIKGEVAL DAT NIET BIJ DE SCHORING PAST is een tegenspraak in de
/// invoer, geen getal. Een console is per definitie niet-geschoord.
#[test]
fn console_met_geschoord_wordt_geweigerd() {
    let a = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::Console),
        ugt_geschoord(),
    ))
    .unwrap();
    assert!(a.lambda.is_none());
    let poort = toets(&a.checks, SLANKHEIDSGRENS);
    assert_eq!(poort.status, CheckStatus::NotApplicable);
    assert!(
        poort.notes.join(" ").contains("ongeschoord"),
        "de melding hoort te zeggen dat figuur 5.7 b) een ongeschoord geval is"
    );
}

// ── Dwarsbelasting wordt gemeten, niet gevraagd ────────────────────────────

/// Staat er tussen de einden een groter |M| dan aan de einden, dan werkt er
/// dwarsbelasting en schrijft §5.8.3.1(1) r_m = 1,0 voor — C = 0,7. Dezelfde
/// eindmomenten als hierboven, maar nu een veldmoment van 60 kNm.
///
/// Zonder deze vaststelling zou de kolom C = 1,7 − (−0,5) = 2,2 krijgen en dus
/// een λ_lim die ruim drie keer te hoog is.
#[test]
fn een_veldmoment_duwt_de_kolom_in_de_r_m_is_1_tak() {
    let zonder = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt(40.0, 10.0, -20.0),
    ))
    .unwrap();
    let met = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt(40.0, 60.0, -20.0),
    ))
    .unwrap();

    assert_relative_eq!(zonder.lambda_lim.unwrap(), 62.86201, max_relative = 1e-6);
    // C valt terug van 2,2 op 0,7: λ_lim = 62,8656 · 0,7/2,2 = 20,0027.
    assert_relative_eq!(met.lambda_lim.unwrap(), 20.00155, max_relative = 1e-6);

    let tekst = toets(&met.checks, SLANKHEIDSGRENS).notes.join(" ");
    assert!(
        tekst.contains("dwarsbelasting"),
        "de afleiding hoort te zeggen dat er dwarsbelasting is vastgesteld: {tekst}"
    );
    assert!(
        tekst.contains("MOMENTVERLOOP"),
        "en dat die vaststelling uit het momentverloop komt en niet uit een vinkje"
    );
}

/// EEN CENTRISCH GEDRUKTE KOLOM heeft geen eindmomenten. r_m = M₀₁/M₀₂ is dan
/// geen deelbaar getal; de toets hoort daar de tak r_m = 1,0 te kiezen en NIET
/// om te vallen. Juist deze kolom is waar §5.8 voor is bedoeld.
#[test]
fn zonder_eindmomenten_valt_de_toets_niet_om() {
    let a = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt(0.0, 0.0, 0.0),
    ))
    .expect("een centrisch gedrukte kolom hoort gewoon getoetst te worden");
    assert_relative_eq!(a.lambda.unwrap(), 34.6410162, max_relative = 1e-6);
    // C = 0,7, dus dezelfde λ_lim als de ongeschoorde tak.
    assert_relative_eq!(a.lambda_lim.unwrap(), 20.00155, max_relative = 1e-6);
    assert!(toets(&a.checks, SLANKHEIDSGRENS)
        .notes
        .join(" ")
        .contains("Aan geen van beide einden"));
}

// ── De kruip ────────────────────────────────────────────────────────────────

/// ZONDER φ(∞,t₀) is er geen φ_ef, en dat hoort in het rapport te staan — met
/// de waarschuwing dat A = 0,7 geen veilige kant is.
#[test]
fn zonder_kruipcoefficient_meldt_de_toets_dat_hij_niet_kan() {
    let a = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt_geschoord(),
    ))
    .unwrap();
    assert!(a.phi_ef.is_none());
    let kruip = toets(&a.checks, KRUIP);
    assert_eq!(kruip.status, CheckStatus::NotApplicable);
    let tekst = kruip.notes.join(" ");
    assert!(tekst.contains("3.1.4"), "de reden hoort naar §3.1.4 te wijzen: {tekst}");
    assert!(
        tekst.contains("geen veilige kant"),
        "A = 0,7 is de waarde bij φ_ef ≈ 2,14 en dat hoort er te staan"
    );
}

/// HANDBEREKENING (5.19). φ(∞,t₀) = 2,0 en M₀Eqp/M₀Ed = 20/40 geeft
/// φ_ef = 1,0, dus A = 1/(1 + 0,2·1,0) = 0,8333333 in plaats van 0,7.
///
/// ```text
///   λ_lim = 20 · 0,8333333 · 1,1783571 · 2,2 / √0,3333333 = 74,83572
/// ```
#[test]
fn phi_ef_uit_de_quasi_blijvende_combinatie_handberekend() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.phi_inf_t0 = Some(2.0);
    let mut v = verzoek(k, ugt_geschoord());
    // De maatgevende snede ligt op x = 0 (de grootste druk, en bij gelijke
    // druk het eerste punt). Daar is M₀Ed = 40 kNm; de quasi-blijvende
    // combinatie geeft er 20 kNm.
    v.sls_quasi_permanent_envelope = vec![
        punt(9, 0.0, -350.0, 20.0),
        punt(9, 1500.0, -350.0, 5.0),
        punt(9, 3000.0, -350.0, -10.0),
    ];
    let a = column_check(v).unwrap();
    assert_relative_eq!(a.phi_ef.unwrap(), 1.0, max_relative = 1e-12);
    assert_relative_eq!(a.lambda_lim.unwrap(), 74.83572, max_relative = 1e-6);

    let kruip = toets(&a.checks, KRUIP);
    assert_eq!(kruip.status, CheckStatus::Ok);
    let tekst = kruip.notes.join(" ");
    assert!(
        tekst.contains("QUASI-BLIJVENDE"),
        "de afleiding hoort te zeggen uit welke combinatie M₀Eqp komt: {tekst}"
    );
    // §5.8.4(4): φ(∞,t₀) = 2,0 ≤ 2 (ja), λ = 34,6 ≤ 75 (ja), maar
    // e₀ = 40·10⁶/(600·10³) = 66,7 mm < h = 300 mm (nee). φ_ef = 0 mag dus niet.
    assert!(
        tekst.contains("mag NIET"),
        "de derde voorwaarde van §5.8.4(4) is niet vervuld, en dat hoort er te staan: {tekst}"
    );
}

/// φ(∞,t₀) WEL, maar geen quasi-blijvende omhullende: dan is (5.19) niet in te
/// vullen. De toets meldt dat en noemt het veld dat ontbreekt.
#[test]
fn kruipcoefficient_zonder_quasi_blijvende_combinatie() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.phi_inf_t0 = Some(2.0);
    let a = column_check(verzoek(k, ugt_geschoord())).unwrap();
    assert!(a.phi_ef.is_none());
    // A blijft 0,7, dus λ_lim is die van de eerste handberekening.
    assert_relative_eq!(a.lambda_lim.unwrap(), 62.86201, max_relative = 1e-6);
    let tekst = toets(&a.checks, KRUIP).notes.join(" ");
    assert!(
        tekst.contains("sls_quasi_permanent_envelope"),
        "de reden hoort het veld te noemen dat ontbreekt: {tekst}"
    );
}

// ── §9.5 ────────────────────────────────────────────────────────────────────

/// De negen kolomdetailleringseisen staan in het resultaat, en de twee die een
/// keuze nodig hebben melden dat zij die niet hebben. Er wordt NIET stilzwijgend
/// de ruimste tak aangehouden.
#[test]
fn de_negen_kolomdetailleringseisen_staan_in_het_resultaat() {
    let a = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt_geschoord(),
    ))
    .unwrap();
    for id in [
        "9.5.1_toepassingsgebied",
        "9.5.1_min_dwarsafmeting",
        "9.5.2_min_diameter_langs",
        "9.5.2_as_min",
        "9.5.2_as_max",
        "9.5.2_hoekstaven",
        "9.5.3_min_diameter_dwars",
        "9.5.3_s_cl_tmax",
        "9.5.3_opgesloten_staven",
    ] {
        let _ = toets(&a.checks, id);
    }
    // Twee toetsen van §5.8 om y, drie om de z-as (de poort om z, het moment om
    // z en §5.8.9) plus negen van §9.5.
    assert_eq!(a.checks.len(), 14);

    assert_eq!(toets(&a.checks, "9.5.2_as_max").status, CheckStatus::NotApplicable);
    assert!(toets(&a.checks, "9.5.2_as_max")
        .notes
        .join(" ")
        .contains("overlappingssituatie"));
    assert_eq!(toets(&a.checks, "9.5.3_s_cl_tmax").status, CheckStatus::NotApplicable);
    assert!(toets(&a.checks, "9.5.3_s_cl_tmax")
        .notes
        .join(" ")
        .contains("beugelzone"));
}

/// Mét de twee keuzen worden ze wél gerekend.
///
/// ```text
///   A_s,max = 0,04 · 90 000 = 3 600 mm²  (buiten een las)
///   A_s     = 804,2477 mm²               → UC = 804,2/3600 = 0,2234
///   s_cl,tmax = min(20·16 ; 300 ; 400) = 300 mm, ×0,6 = 180 mm bij een balk
///   s       = 200 mm > 180 mm            → voldoet NIET
/// ```
#[test]
fn met_de_twee_keuzen_worden_as_max_en_s_cl_tmax_gerekend() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.lap_situation = Some(Overlappingssituatie::LassenBuitenDezeDoorsnede);
    k.stirrup_zone = Some(Beugelzone::BijBalkOfPlaat);
    let a = column_check(verzoek(k, ugt_geschoord())).unwrap();

    let as_max = toets(&a.checks, "9.5.2_as_max");
    assert_eq!(as_max.status, CheckStatus::Ok);
    assert_relative_eq!(as_max.value, 3600.0, max_relative = 1e-9);

    let s_max = toets(&a.checks, "9.5.3_s_cl_tmax");
    assert_relative_eq!(s_max.value, 180.0, max_relative = 1e-9);
    assert_eq!(
        s_max.status,
        CheckStatus::NotOk,
        "200 mm beugelafstand past niet binnen de 180 mm van §9.5.3(4)"
    );
}

// ── De poort in de VOLLEDIGE staaftoetsing ─────────────────────────────────

/// GEEN NORMAALDRUK, GEEN §5.8 — maar wél een regel in het rapport. Een
/// weggelaten toets is niet te onderscheiden van een toets die slaagde.
#[test]
fn zonder_normaaldruk_meldt_de_toets_dat_5_8_niet_van_toepassing_is() {
    let r = check_concrete_beam(staaf(
        None,
        vec![
            punt(1, 0.0, 0.0, 0.0),
            punt(1, 1500.0, 0.0, 40.0),
            punt(1, 3000.0, 0.0, 0.0),
        ],
    ));
    let poort = toets_van_staaf(&r, SLANKHEIDSGRENS);
    assert_eq!(poort.status, CheckStatus::NotApplicable);
    assert!(poort.notes.join(" ").contains("op DRUK belaste elementen"));
    // Eén regel, en niet de hele §9.5-reeks: die geldt voor een kolom.
    assert!(r.checks.iter().all(|c| !c.id.starts_with("9.5")));
}

/// WÉL NORMAALDRUK MAAR GEEN KOLOMGEGEVENS: de toets meldt dat het
/// ontwerpbesluit ontbreekt en neemt er geen. Dit is de kern van §5.8.1.
#[test]
fn met_normaaldruk_zonder_kolomgegevens_meldt_de_toets_de_reden() {
    let r = check_concrete_beam(staaf(None, ugt_geschoord()));
    let poort = toets_van_staaf(&r, SLANKHEIDSGRENS);
    assert_eq!(poort.status, CheckStatus::NotApplicable);
    let tekst = poort.notes.join(" ");
    assert!(tekst.contains("geschoord"), "{tekst}");
    assert!(tekst.contains("5.8.1"), "{tekst}");
    assert!(
        tekst.contains("windverband"),
        "de reden hoort uit te leggen waarom het model dit niet kan afleiden"
    );
}

/// DE ORCHESTRATOR EN HET LOSSE VERZOEK LOPEN DEZELFDE REKENGANG. Zou er ooit
/// een tweede implementatie ontstaan, dan valt deze test om.
#[test]
fn de_staaftoetsing_en_het_losse_verzoek_geven_dezelfde_poort() {
    let kolom = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    let los = column_check(verzoek(kolom, ugt_geschoord())).unwrap();
    let staaftoets = check_concrete_beam(staaf(Some(kolom), ugt_geschoord()));

    let a = toets(&los.checks, SLANKHEIDSGRENS);
    let b = toets_van_staaf(&staaftoets, SLANKHEIDSGRENS);
    assert_eq!(a.status, b.status);
    assert_relative_eq!(
        a.uc.as_ref().unwrap().uc,
        b.uc.as_ref().unwrap().uc,
        max_relative = 1e-12
    );
    assert_relative_eq!(a.value, b.value, max_relative = 1e-12);
}

/// EEN SLANKE KOLOM MAAKT DE STAAF ROOD. Dat is het punt van de poort: het
/// rapport mag niet groen melden terwijl de doorsnedetoetsen op
/// eerste-orde-krachten zijn gedraaid.
#[test]
fn een_te_slanke_kolom_wordt_de_maatgevende_toets() {
    let r = check_concrete_beam(staaf(
        Some(kolomgegevens(Schoring::Ongeschoord, Knikgeval::Console)),
        ugt_geschoord(),
    ));
    assert_eq!(r.governing_check_id, SLANKHEIDSGRENS);
    assert!(r.uc_max > 1.0);
    assert_eq!(r.status, CheckStatus::NotOk);
}

/// EEN VERVULDE §9.5-EIS WORDT NIET DE MAATGEVENDE TOETS — dezelfde regel als
/// voor de §9.2-eisen van een balk. `min_diameter_dwarswapening` levert met
/// Ø8 tegen de eis Ø6 een uc van 0,75, en dat is geen benuttingsgraad.
#[test]
fn een_vervulde_kolomdetailleringseis_wordt_niet_maatgevend() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.lap_situation = Some(Overlappingssituatie::LassenBuitenDezeDoorsnede);
    k.stirrup_zone = Some(Beugelzone::Regulier);
    let r = check_concrete_beam(staaf(Some(k), ugt_geschoord()));

    let dwars = toets_van_staaf(&r, "9.5.3_min_diameter_dwars");
    assert_eq!(dwars.status, CheckStatus::Ok);
    assert!(dwars.uc.is_some(), "de unity check blijft gewoon in het rapport staan");
    assert_ne!(
        r.governing_check_id, "9.5.3_min_diameter_dwars",
        "een vervulde detailleringseis begrenst het ontwerp niet"
    );
}

/// WAT §9.5 NIET KAN, STAAT IN HET RAPPORT — en wat het wél kan, staat als
/// toets in de tabel en niet als excuus in de kanttekeningen.
///
/// §9.5.2(4) en §9.5.3(6) worden sinds de korf staven per zijde kent werkelijk
/// getoetst; zij mogen dus NIET meer in de opsomming van niet-getoetste eisen
/// voorkomen. Wat er overblijft zijn de drie eisen die geen rekenregel zijn.
/// Met de hand voor deze kolom 300 × 300 met 2Ø16 onder en 2Ø16 boven: de
/// asafstand is 30 + 8 + 8 = 46 mm, dus er staan vier staven in de vier hoeken
/// en is er geen staaf die niet zelf opgesloten is — a_max = 0 mm ≤ 150 mm.
#[test]
fn de_ontbrekende_9_5_eisen_staan_met_reden_in_het_rapport() {
    let r = check_concrete_beam(staaf(
        Some(kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend)),
        ugt_geschoord(),
    ));
    let tekst = toets_van_staaf(&r, SLANKHEIDSGRENS).notes.join(" ");
    for artikel in ["§9.5.3(2)", "§9.5.3(4)ii", "§9.5.3(5)"] {
        assert!(tekst.contains(artikel), "{artikel} hoort genoemd te worden: {tekst}");
    }
    for artikel in ["§9.5.2(4)", "§9.5.3(6)"] {
        assert!(
            !tekst.contains(artikel),
            "{artikel} wordt getoetst en hoort niet meer als ongetoetst te worden gemeld"
        );
    }
    assert!(
        tekst.contains("TOTALE langswapening"),
        "en de afleiding hoort te zeggen dat A_s alle drie de rijen omvat"
    );

    let hoeken = toets_van_staaf(&r, "9.5.2_hoekstaven");
    assert_eq!(hoeken.status, CheckStatus::Ok);
    assert_relative_eq!(hoeken.value, 4.0, max_relative = 1e-12);

    let opgesloten = toets_van_staaf(&r, "9.5.3_opgesloten_staven");
    assert_eq!(opgesloten.status, CheckStatus::Ok);
    assert_relative_eq!(opgesloten.value, 0.0, max_relative = 1e-12);
}

// ═══════════════════════════════════════════════════════════════════════════
// De tweede as en §5.8.9 — dubbele buiging, met handberekening.
//
// Dezelfde kolom als hierboven: 300 × 300, C30/37, B500B, 2Ø16 boven en
// 2Ø16 onder (vier hoekstaven), dekking 30, beugel Ø8. Wat daar voor de tweede
// as uit volgt:
//
// ```text
//   N_Rd  = A_c·f_cd + A_s·f_yd = 90 000·20 + 804,2477·434,7826 = 2 149,673 kN
//   i_z   = b/√12 = 86,60254 mm (vierkant: gelijk aan i_y)
//   Om z liggen de vier hoekstaven op x = ±(150 − 30 − 8 − 8) = ±104 mm, dus na
//   draaien op 46 en 254 mm: DEZELFDE korf als om y. M_Rdz = M_Rdy, exact.
//   θ_i (l = 3 m): α_h = 2/√3 = 1,155 → 1; α_m = 1; θ_i = 1/300
//   e_i (l₀ = 3 m) = θ_i·l₀/2 = 3000/600 = 5,0 mm
// ```
// ═══════════════════════════════════════════════════════════════════════════

use concrete_check::{DUBBELE_BUIGING_ID, MOMENT_Z_ID, SLANKHEIDSGRENS_Z_ID};

/// N_Rd met de hand: 2 149 672,9 N.
fn n_rd_hand_kn() -> f64 {
    (90_000.0 * 20.0 + 4.0 * std::f64::consts::PI * 64.0 * (500.0 / 1.15)) / 1000.0
}

/// Een omhullende met constante N, M_y en M_z over drie stations.
fn ugt_z(l_mm: f64, n_druk: f64, my: f64, mz: f64) -> Vec<ForcePoint> {
    [0.0, 0.5 * l_mm, l_mm]
        .iter()
        .map(|&x| ForcePoint {
            combination_id: 1,
            position_mm: x,
            forces: InternalForces { n_ed: -n_druk, my_ed: my, mz_ed: mz, ..Default::default() },
        })
        .collect()
}

fn verzoek_z(l_m: f64, kolom: ConcreteColumnInput, envelop: Vec<ForcePoint>) -> ConcreteColumnCheckRequest {
    ConcreteColumnCheckRequest { length_m: l_m, ..verzoek(kolom, envelop) }
}

fn uc_van(c: &ResistanceCalc) -> f64 {
    c.uc.as_ref().expect("unity check").uc
}

fn var(c: &ResistanceCalc, symbool: &str) -> f64 {
    c.variables
        .iter()
        .find(|v| v.symbol == symbool)
        .unwrap_or_else(|| panic!("{symbool} ontbreekt in {}", c.id))
        .value
}

/// ZONDER NORMAALDRUK IS §5.8.9 NIET AAN DE ORDE — en dan staan de drie
/// toetsen om de tweede as er ook niet. §5.8 als geheel gaat over op druk
/// belaste elementen; de poort meldt dat, en verder niets.
#[test]
fn zonder_normaaldruk_geen_tweede_as() {
    let a = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        vec![punt(1, 0.0, 0.0, 30.0), punt(1, 1500.0, 0.0, 30.0), punt(1, 3000.0, 0.0, 30.0)],
    ))
    .unwrap();
    assert_eq!(toets(&a.checks, SLANKHEIDSGRENS).status, CheckStatus::NotApplicable);
    for id in [SLANKHEIDSGRENS_Z_ID, MOMENT_Z_ID, DUBBELE_BUIGING_ID] {
        assert!(!a.checks.iter().any(|c| c.id == id), "{id} hoort er zonder druk niet te zijn");
    }
    assert!(a.lambda_z.is_none() && a.m_edz_knm.is_none() && a.interactie_5_39.is_none());

    // Ook een trekstaaf niet.
    let trek = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        vec![punt(1, 0.0, 200.0, 30.0), punt(1, 3000.0, 200.0, 30.0)],
    ))
    .unwrap();
    assert!(!trek.checks.iter().any(|c| c.id == DUBBELE_BUIGING_ID));
}

/// M_z = 0 UIT HET MODEL BETEKENT NIET M_Edz = 0. Een slanke kolom (l = 12 m,
/// scharnierend, N_Ed = 400 kN, alleen M_y = 60 kNm) krijgt om z de imperfectie
/// én de tweede orde, en die tillen M_Edz boven de minimale excentriciteit uit.
///
/// ```text
///   α_h = 2/√12 = 0,577 < 2/3 → α_h = 2/3;  θ_i = (2/3)/300 = 1/450
///   e_i = θ_i·l₀/2 = 12 000/900 = 13,333 mm
///   λ_z = 12 000/86,603 = 138,6 ≥ λ_lim,z → e₂ wordt gerekend, en e₂ > 0
///   N_Ed·e₀ = 400 · 20 mm = 8,0 kNm (6.1(4))
///   M_Edz = N_Ed·(e_i + e₂) > 8,0 kNm, dus de ondergrens is NIET bindend
///   (5.38b): e_y = e_i + e₂ ≈ 22,7 mm tegen e_z = 60/400 = 150 mm → 0,15 ≤ 0,2:
///   apart toetsen mag. Met M_y = 20 kNm (e_z = 50 mm) is het 0,45 > 0,2 en
///   is de interactie (5.39) vereist — een moment om z dat het model niet
///   kent, kan dus wél de toets bepalen.
/// ```
#[test]
fn een_slanke_kolom_heeft_een_moment_om_z_door_imperfectie_en_tweede_orde() {
    let klein_my = column_check(verzoek_z(
        12.0,
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt_z(12_000.0, 400.0, 20.0, 0.0),
    ))
    .unwrap();
    let db = toets(&klein_my.checks, DUBBELE_BUIGING_ID);
    assert!(db.uc.is_some(), "bij M_y = 20 kNm is e_y/e_z ≈ 0,45 > 0,2: (5.39) is vereist");

    let a = column_check(verzoek_z(
        12.0,
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt_z(12_000.0, 400.0, 60.0, 0.0),
    ))
    .unwrap();
    assert_relative_eq!(a.e_i_z_mm.unwrap(), 12_000.0 / 900.0, max_relative = 1e-12);
    assert_eq!(a.tweede_orde_verwaarloosbaar_z, Some(false));
    let e_2 = a.e_2_z_mm.expect("e₂ om z is gerekend");
    assert!(e_2 > 0.0, "e₂ = {e_2}");
    let m_edz = a.m_edz_knm.unwrap();
    assert!(m_edz > 8.0, "M_Edz = {m_edz} hoort boven N_Ed·e₀ = 8,0 kNm te liggen");
    assert_relative_eq!(m_edz, 400.0 * (12_000.0 / 900.0 + e_2) * 1e-3, max_relative = 1e-12);

    let mz = toets(&a.checks, MOMENT_Z_ID);
    assert_eq!(mz.status, CheckStatus::Ok);
    assert_relative_eq!(var(mz, "e_i"), 12_000.0 / 900.0, max_relative = 1e-12);
    assert!(mz.deelstappen.iter().any(|d| d.id == "e_2" && d.value == Some(e_2)));
    assert!(mz.notes.iter().any(|n| n.contains("betekent dus NIET M_Edz = 0")));

    // Met alleen M_y en een kleine M_Edz is (5.38b) vervuld: apart toetsen
    // mag, en de interactie is geen unity check.
    let db = toets(&a.checks, DUBBELE_BUIGING_ID);
    assert_eq!(db.status, CheckStatus::Ok);
    assert!(db.uc.is_none());
    assert!(db.notes.iter().any(|n| n.contains("Geen verdere controle nodig")));
}

/// (5.38a) NET WEL EN NET NIET. l₀,y = l = 3 m (figuur 5.7 a); l₀,z rechtstreeks
/// opgegeven als 6,000 m → λ_z/λ_y = 2,000 precies: vervuld. Als 6,003 m →
/// 2,001: niet vervuld, en dan is de interactie (5.39) vereist.
///
/// M_y = 60 kNm bij N_Ed = 600 kN geeft e_z = 100 mm; om z is er alleen de
/// imperfectie (e_i = θ_i·6000/2 = 10 mm) en een kleine e₂, dus e_y ≈ 12 mm en
/// (5.38b) is met 0,12 ≤ 0,2 vervuld. Het verschil tussen de twee gevallen zit
/// dus uitsluitend in (5.38a).
#[test]
fn voorwaarde_5_38a_net_wel_en_net_niet() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.buckling_length_z = Some(Kniklengtekeuze::Opgegeven { l0_m: 6.0 });
    let wel = column_check(verzoek_z(3.0, k, ugt_z(3000.0, 600.0, 60.0, 0.0))).unwrap();
    assert_relative_eq!(wel.lambda_z.unwrap() / wel.lambda.unwrap(), 2.0, max_relative = 1e-12);
    assert_relative_eq!(wel.e_i_z_mm.unwrap(), 10.0, max_relative = 1e-12);
    let db = toets(&wel.checks, DUBBELE_BUIGING_ID);
    assert_eq!(db.status, CheckStatus::Ok);
    assert!(db.uc.is_none(), "op de grens is (5.38a) vervuld en mag het apart");
    assert_relative_eq!(var(db, "λ_z") / var(db, "λ_y"), 2.0, max_relative = 1e-12);
    assert!(wel.interactie_5_39.is_none());

    k.buckling_length_z = Some(Kniklengtekeuze::Opgegeven { l0_m: 6.003 });
    let niet = column_check(verzoek_z(3.0, k, ugt_z(3000.0, 600.0, 60.0, 0.0))).unwrap();
    assert_relative_eq!(niet.lambda_z.unwrap() / niet.lambda.unwrap(), 2.001, max_relative = 1e-12);
    let db = toets(&niet.checks, DUBBELE_BUIGING_ID);
    assert!(db.uc.is_some(), "net boven de grens is (5.39) vereist");
    assert!(db.notes.iter().any(|n| n.contains("(5.38a)") && n.contains("factor 2")));
    assert_eq!(niet.interactie_5_39.map(|s| s > 0.0), Some(true));
}

/// (5.39) MAATGEVEND MET a = 1,0. N_Ed = 150 kN → N_Ed/N_Rd = 0,0698 ≤ 0,1.
/// Extern M₀Edz = 30 kNm naast M_y = 30 kNm; l = 3 m.
///
/// ```text
///   n = 150 000/(90 000·20) = 0,08333;  ω = 0,19426;  B = 1,17836;  C = 0,7
///   λ_lim = 20·0,7·1,17836·0,7/√0,08333 = 40,003 > λ = 34,641 → e₂ = 0 om z
///   e_i = 5,0 mm → M_Edz = 30 + 150·5,0/1000 = 30,75 kNm   (hand, exact)
///   e_y = 30,75/150 = 205 mm, e_z = 30/150 = 200 mm → (5.38b) niet vervuld
///   M_Rdz = M_Rdy = M_Rd(N = 150 kN) — de vier hoekstaven zijn om beide assen
///   dezelfde korf. Rechthoekige spanningsverdeling (3.1.7(3)), λ = 0,8,
///   η = 1, ε_cu3 = 3,5 ‰, d = 254, d₂ = 46, A_s1 = A_s2 = 402,12 mm²:
///     x ≈ 56,6 mm: F_c = 0,8·56,6·300·20 = 271,7 kN, ε_s2 = 3,5‰·10,6/56,6 =
///     0,655 ‰ → σ_s2 = 131 N/mm² → F_s2 = 52,7 kN, F_s1 = 174,8 kN (vloeit);
///     N = 271,7 + 52,7 − 174,8 = 149,6 ✓
///     M = 271,7·(150 − 22,6) + 52,7·104 + 174,8·104 ≈ 58,3 kNm
///   Het parabool-rechthoekdiagram van de kern ligt daar binnen 2 % bij.
///   (5.39): a = 1 → 30,75/M_Rd + 30/M_Rd = 60,75/M_Rd ≈ 1,04 > 1 → NIET OK
/// ```
#[test]
fn interactie_5_39_maatgevend_met_a_1_0() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.m0_edz_knm = Some(30.0);
    let a = column_check(verzoek_z(3.0, k, ugt_z(3000.0, 150.0, 30.0, 0.0))).unwrap();

    assert_eq!(a.tweede_orde_verwaarloosbaar_z, Some(true));
    assert_relative_eq!(a.e_2_z_mm.unwrap(), 0.0);
    assert_relative_eq!(a.m_edz_knm.unwrap(), 30.75, max_relative = 1e-12);

    let db = toets(&a.checks, DUBBELE_BUIGING_ID);
    assert_relative_eq!(var(db, "a"), 1.0, max_relative = 1e-12);
    assert_relative_eq!(var(db, "N_Rd"), n_rd_hand_kn(), max_relative = 1e-9);
    let m_rdz = var(db, "M_Rdz");
    let m_rdy = var(db, "M_Rdy");
    assert_relative_eq!(m_rdz, m_rdy, max_relative = 1e-9, epsilon = 1e-9);
    assert_relative_eq!(m_rdz, 58.3, max_relative = 0.02);
    assert_relative_eq!(var(db, "M_Edz"), 30.75, max_relative = 1e-12);
    assert_relative_eq!(var(db, "M_Edy"), 30.0, max_relative = 1e-12);
    let som = uc_van(db);
    assert_relative_eq!(som, 60.75 / m_rdz, max_relative = 1e-12);
    assert!(som > 1.0);
    assert_eq!(db.status, CheckStatus::NotOk);
    assert!(db.deelstappen.iter().any(|d| d.id == "exponent_a"
        && d.notes.iter().any(|n| n.contains("N_Ed/N_Rd ≤ 0,1"))));

    // In de volledige staaftoetsing is dit de MAATGEVENDE toets: de
    // afzonderlijke richtingen halen het (30/58 en 30,75/58), samen niet.
    let staaftoets = check_concrete_beam(ConcreteBeamCheckInput {
        length_m: 3.0,
        ..staaf(Some(k), ugt_z(3000.0, 150.0, 30.0, 0.0))
    });
    assert_eq!(staaftoets.governing_check_id, DUBBELE_BUIGING_ID);
    assert_relative_eq!(staaftoets.uc_max, som, max_relative = 1e-12);
    assert_eq!(staaftoets.status, CheckStatus::NotOk);
}

/// (5.39) MET a = 1,5: N_Ed = 0,7·N_Rd = 1504,771 kN, precies het tweede
/// ankerpunt van de tabel. Bij die druk is λ_lim,z = 12,6 < λ_z = 34,6, dus e₂
/// om z wordt met de algemene methode gerekend en is groter dan nul.
#[test]
fn interactie_5_39_met_a_1_5() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.m0_edz_knm = Some(30.0);
    let n = 0.7 * n_rd_hand_kn();
    let a = column_check(verzoek_z(3.0, k, ugt_z(3000.0, n, 30.0, 0.0))).unwrap();
    let db = toets(&a.checks, DUBBELE_BUIGING_ID);
    assert_relative_eq!(var(db, "a"), 1.5, max_relative = 1e-9);
    assert_relative_eq!(var(db, "N_Ed") / var(db, "N_Rd"), 0.7, max_relative = 1e-9);
    assert_eq!(a.tweede_orde_verwaarloosbaar_z, Some(false));
    assert!(a.e_2_z_mm.unwrap() > 0.0);
    // De som is precies de formule met de gerapporteerde delen.
    let som = (var(db, "M_Edz") / var(db, "M_Rdz")).powf(1.5)
        + (var(db, "M_Edy") / var(db, "M_Rdy")).powf(1.5);
    assert_relative_eq!(uc_van(db), som, max_relative = 1e-12);
    assert!(db.deelstappen.iter().any(|d| d.id == "exponent_a"
        && d.notes.iter().any(|n| n.contains("lineaire interpolatie"))));
}

/// (5.39) MET EEN GEÏNTERPOLEERDE a: N_Ed = 600 kN.
///
/// ```text
///   N_Ed/N_Rd = 600/2149,673 = 0,279112
///   a = 1,0 + (0,279112 − 0,1)/0,6 · 0,5 = 1,149260
/// ```
#[test]
fn interactie_5_39_met_geinterpoleerde_a() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.m0_edz_knm = Some(30.0);
    let a = column_check(verzoek_z(3.0, k, ugt_z(3000.0, 600.0, 30.0, 0.0))).unwrap();
    let db = toets(&a.checks, DUBBELE_BUIGING_ID);
    let verwacht = 1.0 + (600.0 / n_rd_hand_kn() - 0.1) / 0.6 * 0.5;
    assert_relative_eq!(verwacht, 1.149_260_19, max_relative = 1e-8);
    assert_relative_eq!(var(db, "a"), verwacht, max_relative = 1e-9);
    assert_eq!(db.status, CheckStatus::Ok);
    assert!(uc_van(db) < 1.0);
    assert_relative_eq!(a.interactie_5_39.unwrap(), uc_van(db), max_relative = 1e-12);
}

/// DE SCHORING EN DE KNIKLENGTE OM Z ZIJN EIGEN INVOER. Dezelfde kolom
/// (geschoord, figuur 5.7 a) in het vlak) krijgt om z "ongeschoord, console":
/// l₀,z = 2·l en λ_z = 2·λ_y, en de afleiding zegt dat beide apart zijn
/// opgegeven. Zonder die twee velden worden de keuzen van het vlak overgenomen
/// — met die melding.
#[test]
fn de_tweede_as_heeft_een_eigen_schoring_en_kniklengte() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.bracing_z = Some(Schoring::Ongeschoord);
    k.buckling_length_z = Some(Kniklengtekeuze::Figuur57 { geval: Knikgeval::Console });
    let eigen = column_check(verzoek(k, ugt_geschoord())).unwrap();
    assert_relative_eq!(eigen.l0_z_mm.unwrap(), 6000.0, max_relative = 1e-12);
    assert_relative_eq!(eigen.lambda_z.unwrap(), 2.0 * eigen.lambda.unwrap(), max_relative = 1e-12);
    let poort_z = toets(&eigen.checks, SLANKHEIDSGRENS_Z_ID);
    assert_eq!(poort_z.status, CheckStatus::Ok);
    assert!(poort_z.uc.is_none(), "de poort om z keurt niets af: e₂ wordt zelf verwerkt");
    assert!(poort_z.notes.iter().any(|n| n.contains("apart opgegeven voor deze as")));
    assert!(poort_z.notes.iter().any(|n| n.contains("C = 0,7")));

    // DE AFLEIDING OM Z DRAAGT DE ASNAAM. Dezelfde keten als om y, maar met
    // l₀,z, λ_z en λ_lim,z in de symbolen: een losse stap "λ = 138,6" zei in
    // het rapport niet om welke as het ging. En de uitkomsten in die stappen
    // zijn de getallen om z, niet die van het vlak.
    let stap = |id: &str| {
        poort_z
            .deelstappen
            .iter()
            .find(|d| d.id == id)
            .unwrap_or_else(|| panic!("stap {id} ontbreekt in de afleiding om z"))
    };
    assert_eq!(stap("l0").symbol, "l_{0,z}");
    assert_relative_eq!(stap("l0").value.unwrap(), eigen.l0_z_mm.unwrap(), max_relative = 1e-12);
    assert!(stap("l0").formula_latex.contains("l_{0,z}"), "{}", stap("l0").formula_latex);
    assert_eq!(stap("lambda").symbol, r"\lambda_{z}");
    assert_relative_eq!(stap("lambda").value.unwrap(), eigen.lambda_z.unwrap(), max_relative = 1e-12);
    assert!(stap("lambda").formula_latex.contains(r"\frac{l_{0,z}}{i_z}"), "{}", stap("lambda").formula_latex);
    assert_eq!(stap("lambda_lim").symbol, r"\lambda_{lim,z}");
    assert!(poort_z.deelstappen.iter().all(|d| d.titel.ends_with("om de z-as")));
    // En het model ziet deze richting niet — dat staat bij de toets.
    assert!(poort_z.notes.iter().any(|n| n.contains("UIT het vlak")));

    let overgenomen = column_check(verzoek(
        kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
        ugt_geschoord(),
    ))
    .unwrap();
    assert_relative_eq!(overgenomen.lambda_z.unwrap(), overgenomen.lambda.unwrap(), max_relative = 1e-12);
    let poort_z = toets(&overgenomen.checks, SLANKHEIDSGRENS_Z_ID);
    assert!(poort_z.notes.iter().any(|n| n.contains("overgenomen van het rekenvlak")));

    // Een vakje dat niet bij de schoring om z past: de reden en geen getal.
    let mut fout = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    fout.bracing_z = Some(Schoring::Geschoord);
    fout.buckling_length_z = Some(Kniklengtekeuze::Figuur57 { geval: Knikgeval::Console });
    let a = column_check(verzoek(fout, ugt_geschoord())).unwrap();
    for id in [SLANKHEIDSGRENS_Z_ID, MOMENT_Z_ID, DUBBELE_BUIGING_ID] {
        let c = toets(&a.checks, id);
        assert_eq!(c.status, CheckStatus::NotApplicable, "{id}");
        assert!(c.notes.iter().any(|n| n.contains("ontwerpbesluit")), "{id}: {:?}", c.notes);
    }
    assert!(a.lambda_z.is_none());
    // De poort om y blijft gewoon staan.
    assert_eq!(toets(&a.checks, SLANKHEIDSGRENS).status, CheckStatus::Ok);
}

/// EEN T IS GEEN KOLOM VOOR DE TWEEDE AS: de drie toetsen komen als
/// niet-uitgevoerd terug, met de reden, en de poort om y blijft.
#[test]
fn een_t_doorsnede_krijgt_de_tweede_as_niet() {
    let req = ConcreteColumnCheckRequest {
        section: ConcreteSectionInput::tee(600.0, 500.0, 300.0, 150.0),
        ..verzoek(
            kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend),
            ugt_geschoord(),
        )
    };
    let a = column_check(req).unwrap();
    for id in [SLANKHEIDSGRENS_Z_ID, MOMENT_Z_ID, DUBBELE_BUIGING_ID] {
        let c = toets(&a.checks, id);
        assert_eq!(c.status, CheckStatus::NotApplicable, "{id}");
        assert!(c.notes.iter().any(|n| n.contains("rechthoek")), "{id}");
    }
    assert!(a.lambda.is_some());
}

/// DE STAAFTOETSING EN HET LOSSE VERZOEK LOPEN OOK OM Z DEZELFDE WEG.
#[test]
fn de_staaftoetsing_en_het_losse_verzoek_geven_dezelfde_tweede_as() {
    let mut k = kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend);
    k.m0_edz_knm = Some(15.0);
    let los = column_check(verzoek(k, ugt_geschoord())).unwrap();
    let staaftoets = check_concrete_beam(staaf(Some(k), ugt_geschoord()));
    for id in [SLANKHEIDSGRENS_Z_ID, MOMENT_Z_ID, DUBBELE_BUIGING_ID] {
        let a = toets(&los.checks, id);
        let b = toets_van_staaf(&staaftoets, id);
        assert_eq!(a.status, b.status, "{id}");
        assert_relative_eq!(a.value, b.value, max_relative = 1e-12);
        assert_eq!(a.uc.as_ref().map(|u| u.uc), b.uc.as_ref().map(|u| u.uc), "{id}");
    }
}
