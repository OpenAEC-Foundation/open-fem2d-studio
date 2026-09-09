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
/// Symmetrisch, want een kolom heeft geen trek- en drukzijde die vastligt. Wat
/// er ONTBREEKT is de wapening langs de twee zijkanten; het korfmodel kent
/// alleen een boven- en een onderrij. Zie de toets zelf: A_s is hier dus de som
/// van die twee rijen, en dat staat ook in de afleiding.
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

/// De zeven kolomdetailleringseisen staan in het resultaat, en de twee die een
/// keuze nodig hebben melden dat zij die niet hebben. Er wordt NIET stilzwijgend
/// de ruimste tak aangehouden.
#[test]
fn de_zeven_kolomdetailleringseisen_staan_in_het_resultaat() {
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
        "9.5.3_min_diameter_dwars",
        "9.5.3_s_cl_tmax",
    ] {
        let _ = toets(&a.checks, id);
    }
    // Twee toetsen van §5.8 plus zeven van §9.5.
    assert_eq!(a.checks.len(), 9);

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

/// WAT §9.5 NIET KAN, STAAT IN HET RAPPORT. De twee eisen die de ligging van
/// elke staaf in het vlak van de doorsnede vragen, kunnen met een korf van twee
/// rijen niet — en dat hoort er te staan, niet als groen vinkje en niet als
/// stilte.
#[test]
fn de_ontbrekende_9_5_eisen_staan_met_reden_in_het_rapport() {
    let r = check_concrete_beam(staaf(
        Some(kolomgegevens(Schoring::Geschoord, Knikgeval::ScharnierendScharnierend)),
        ugt_geschoord(),
    ));
    let tekst = toets_van_staaf(&r, SLANKHEIDSGRENS).notes.join(" ");
    assert!(tekst.contains("§9.5.2(4)"), "de hoekstaafeis hoort genoemd te worden: {tekst}");
    assert!(tekst.contains("§9.5.3(6)"), "de 150 mm-eis hoort genoemd te worden");
    assert!(
        tekst.contains("ZIJKANTEN"),
        "en de afleiding hoort te zeggen dat A_s alleen de twee gemodelleerde rijen is"
    );
}
