//! **Leest de toetsing de wapeningszones werkelijk?**
//!
//! WAAROM DEZE TESTS BESTAAN
//! `ReinforcementZones` beschrijft de wapening die LANGS de staaf verandert:
//! de onderwapening die inkort (§9.2.1.3) en de beugels die bij het steunpunt
//! verdichten (§9.2.2). Dat model reisde al door alle drie de wegen naar de
//! kern, maar werd door geen enkele toets gelezen — elke toets rekende met de
//! ene korf uit `cage`. Het gevolg daarvan is niet zichtbaar: er komt een
//! keurig rapport uit, met een geloofwaardige unity check, dat bij een ANDERE
//! balk hoort dan de gebruiker heeft ingevoerd.
//!
//! Een proef die alleen laat zien dat de zones "aankomen" bewijst daar niets
//! over. Wat er bewezen moet worden is dat de toetsing een ZWAKKE ZONE VINDT
//! die de staafkorf zou verbergen. Elke proef hieronder is daarom zo opgezet
//! dat de staafkorf de zwakke plek juist NIET aanwijst, en houdt vast dat de
//! toetsing hem toch vindt — met daarnaast telkens de tegenproef met LEGE
//! zonelijsten, die aantoont dat het verschil van de zones komt en niet van de
//! opzet.
//!
//! DE BALK is dezelfde referentiebalk als in `referentie_balk.rs` en
//! `maatgevende_snede.rs`: 300 × 500 mm, C30/37, B500B, dekking 30 mm,
//! beugel Ø8, boven 2Ø12.
//!
//! ```text
//!   f_cd = 20 N/mm²   f_yd = 434,782609 N/mm²   λ = 0,8   η = 1,0
//!   d = 500 − 30 − 8 − 8 = 454 mm  (de staafdiameter is in beide zones Ø16,
//!                                   dus d verandert NIET met het aantal)
//!
//!   3Ø16: A_s = 603,185789 mm²   F_s = 262 254,69 N
//!         x = F_s/(0,8·20·300) = 54,64 mm   z = 454 − 0,4x = 432,15 mm
//!         M_Rd ≈ 113,3 kNm   (de kern levert 113,292 kNm)
//!   5Ø16: A_s = 1005,309649 mm²  F_s = 437 091,15 N
//!         x = 91,06 mm                      z = 417,58 mm
//!         M_Rd ≈ 182,5 kNm   (de kern levert 184,091 kNm)
//! ```
//!
//! DIE TWEE MOMENTWEERSTANDEN ZIJN BENADERINGEN, en met opzet niet de
//! ankerwaarde van de asserts. De handberekening hierboven laat de BOVENWAPENING
//! buiten beschouwing, terwijl de drukzone in beide gevallen dieper reikt dan de
//! bovenstaven (die liggen op 30 + 8 + 6 = 44 mm van de bovenrand, tegen x =
//! 54,6 respectievelijk 91,1 mm). De kern telt die drukwapening wél mee, zoals
//! het hoort — vandaar het verschil van 0,03 % bij 3Ø16 en 0,9 % bij 5Ø16, dat
//! met de diepere drukzone meegroeit. De asserts leggen de zone-uitkomst daarom
//! naast een REFERENTIERUN van dezelfde balk zonder zones met die korf als
//! staafkorf: "de zone met 3Ø16 hoort dezelfde M_Rd te geven als een staaf die
//! overal 3Ø16 heeft". Dat is een scherpere eis dan een met de hand afgerond
//! getal, en de handwaarde blijft er als grove controle naast staan.

use std::time::Instant;

use approx::assert_relative_eq;
use concrete_check::{
    check_concrete_beam, CheckKind, CheckStatus, ConcreteBeamCheckInput, ConcreteBeamCheckResult,
};
use mechanics::{ForcePoint, InternalForces};
use nen_en_1992_1_1::{
    ConcreteSectionInput, LongitudinalZone, RebarRow, RebarSide, ReinforcementCage,
    ReinforcementZones, StirrupZone,
};
use nen_en_1993_1_1_section::ResistanceCalc;

/// De momentweerstand van de referentiedoorsnede met 3 respectievelijk 5 Ø16
/// onder, MET de drukwapening die de handberekening hierboven weglaat. Grove
/// controle op de referentierun; de asserts zelf leggen de zone-uitkomst naast
/// die run en niet naast dit afgeronde getal.
const M_RD_3PHI16_KNM: f64 = 113.29;
const M_RD_5PHI16_KNM: f64 = 184.09;
const LENGTE_MM: f64 = 5000.0;

// ── Bouwstenen ──────────────────────────────────────────────────────────────

/// De staafkorf. `onder` is het aantal Ø16 onder; dat is de knop waarmee elke
/// proef instelt wat de staafkorf ZOU zeggen als niemand de zones las.
fn korf(onder: u32, beugelafstand: Option<f64>) -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: onder, diameter_mm: 16.0 },
        stirrup_spacing_mm: beugelafstand,
        stirrup_legs: beugelafstand.map(|_| 2),
        ..ReinforcementCage::default()
    }
}

fn onderzone(aantal: u32, van: f64, tot: f64) -> LongitudinalZone {
    LongitudinalZone {
        side: RebarSide::Bottom,
        row: RebarRow { count: aantal, diameter_mm: 16.0 },
        x_start_mm: van,
        x_end_mm: tot,
        bar_shape: Default::default(),
        casting_position: Default::default(),
    }
}

fn beugelzone(van: f64, tot: f64, s: f64) -> StirrupZone {
    StirrupZone { x_start_mm: van, x_end_mm: tot, spacing_mm: s, legs: 2, diameter_mm: 8.0 }
}

fn punt(x_mm: f64, m_knm: f64, v_kn: f64) -> ForcePoint {
    ForcePoint {
        combination_id: 1,
        position_mm: x_mm,
        forces: InternalForces { n_ed: 0.0, vz_ed: v_kn, my_ed: m_knm, ..Default::default() },
    }
}

fn invoer(
    cage: ReinforcementCage,
    zones: ReinforcementZones,
    envelop: Vec<ForcePoint>,
) -> ConcreteBeamCheckInput {
    ConcreteBeamCheckInput {
        beam_id: 7,
        section: ConcreteSectionInput::rectangle(300.0, 500.0),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        cage,
        reinforcement_zones: zones,
        length_m: LENGTE_MM / 1000.0,
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

fn notes(rc: &ResistanceCalc) -> String {
    rc.notes.join(" ")
}

/// M_Rd van de referentiebalk met `onder` staven Ø16, ZONDER zones — de
/// ankerwaarde waar de zone-uitkomst naast wordt gelegd. Eén punt in de
/// omhullende, dus er valt niets te kiezen.
fn m_rd_referentie(onder: u32) -> f64 {
    let r = check_concrete_beam(invoer(
        korf(onder, Some(150.0)),
        ReinforcementZones::default(),
        vec![punt(2500.0, 100.0, 0.0)],
    ));
    toets(&r, "6.1_bending_stress_block").value
}

// ═══════════════════════════════════════════════════════════════════════════
// DE TEGENPROEF: de zwakke zone die de staafkorf zou verbergen
// ═══════════════════════════════════════════════════════════════════════════

/// **De proef waar deze taak om draait.** Een staaf met twee
/// langswapeningszones, waarvan de tweede aantoonbaar zwakker is, en een
/// omhullende waarin die zwakke zone NIET het grootste moment draagt.
///
/// ```text
///   staafkorf `cage`   : onder 5Ø16 over de hele staaf   M_Rd = 184,09 kNm
///   zone [0; 2500]     : onder 5Ø16                      M_Rd = 184,09 kNm
///   zone [2500; 5000]  : onder 3Ø16   ← de zwakke zone   M_Rd = 113,29 kNm
///
///   A  x = 1250 mm, M = 150 kNm, in de STERKE zone
///      UC = 150/184,09 = 0,815
///   B  x = 2500 mm, M = 110 kNm, op de grens — daar begint de ZWAKKE zone
///      UC met zones        = 110/113,29 = 0,971   ← de maatgevende snede
///      UC met de staafkorf = 110/184,09 = 0,598
/// ```
///
/// Zonder zones wijst zowel het grootste moment als de hoogste unity check
/// snede A aan, en meldt het rapport 0,82. Met zones is B de zwaarste, en dat is
/// ruim 19 % hoger. De staafkorf verbergt de zwakke zone dus niet bij toeval
/// maar stelselmatig: hij is hier de STERKSTE korf van de staaf, en juist die
/// maakt elke andere zone onzichtbaar.
///
/// Dat B precies op de zonegrens ligt is met opzet. `cage_at_mm` is links
/// gesloten en rechts open, dus op x = 2500 geldt de zone die daar BEGINT — de
/// zwakke. Ligt de zwakke zone links van de grens, dan draagt de gesloten
/// rechterkant van het vak diezelfde snede; zie
/// `de_zwakke_zone_links_van_de_grens_wordt_ook_gevonden`.
#[test]
fn de_zwakke_langswapeningszone_wordt_gevonden_terwijl_de_staafkorf_hem_verbergt() {
    let envelop = vec![punt(1250.0, 150.0, 0.0), punt(2500.0, 110.0, 0.0)];
    let zones = ReinforcementZones {
        longitudinal: vec![onderzone(5, 0.0, 2500.0), onderzone(3, 2500.0, LENGTE_MM)],
        stirrups: vec![],
    };
    let m_rd_zwak = m_rd_referentie(3);
    let m_rd_sterk = m_rd_referentie(5);
    // De handberekening als grove controle op de referentierun zelf.
    assert_relative_eq!(m_rd_zwak, M_RD_3PHI16_KNM, max_relative = 1e-4);
    assert_relative_eq!(m_rd_sterk, M_RD_5PHI16_KNM, max_relative = 1e-4);

    // MET zones: de zwakke zone is maatgevend, en met exact de weerstand die
    // een staaf met die korf overal zou hebben.
    let met = check_concrete_beam(invoer(korf(5, Some(150.0)), zones, envelop.clone()));
    let blok = toets(&met, "6.1_bending_stress_block");
    assert_relative_eq!(blok.force_state.position_mm, 2500.0, max_relative = 1e-12);
    assert_relative_eq!(blok.force_state.forces.my_ed, 110.0, max_relative = 1e-12);
    assert_relative_eq!(blok.value, m_rd_zwak, max_relative = 1e-12);
    assert_relative_eq!(uc(blok), 110.0 / m_rd_zwak, max_relative = 1e-9);

    // ZONDER zones: dezelfde balk, dezelfde belasting, en de toetsing wijst de
    // andere snede aan met een ruim 18 % lagere unity check.
    let zonder = check_concrete_beam(invoer(
        korf(5, Some(150.0)),
        ReinforcementZones::default(),
        envelop,
    ));
    let blok_zonder = toets(&zonder, "6.1_bending_stress_block");
    assert_relative_eq!(blok_zonder.force_state.position_mm, 1250.0, max_relative = 1e-12);
    assert_relative_eq!(blok_zonder.value, m_rd_sterk, max_relative = 1e-12);
    assert_relative_eq!(uc(blok_zonder), 150.0 / m_rd_sterk, max_relative = 1e-9);

    assert!(
        uc(blok) > uc(blok_zonder) * 1.15,
        "de zones horen een merkbaar hogere unity check op te leveren: {} tegen {}",
        uc(blok),
        uc(blok_zonder)
    );
    // En het rapport zégt dat de wapening langs de staaf verandert.
    assert!(
        notes(blok).contains("DE WAPENING VERANDERT LANGS DE STAAF"),
        "de afleiding meldt de zone-indeling niet: {}",
        notes(blok)
    );
    assert!(
        !notes(blok_zonder).contains("DE WAPENING VERANDERT LANGS DE STAAF"),
        "zonder zones hoort die mededeling er NIET te staan"
    );
}

/// Dezelfde proef, maar nu ligt de zwakke zone LINKS van de grens en valt het
/// maatgevende moment precies OP die grens.
///
/// ```text
///   zone [0; 2000]     : onder 3Ø16   ← de zwakke zone, eindigt op x = 2000
///   zone [2000; 5000]  : onder 5Ø16
///   omhullende: x = 2000 mm, M = 110 kNm  en  x = 3500 mm, M = 150 kNm
/// ```
///
/// `cage_at_mm(2000)` levert de korf van RECHTS — 5Ø16, de sterke — want het
/// interval is links gesloten en rechts open. Zou de toetsing alleen dáárop
/// leunen, dan werd de zwakke zone op haar zwaarste snede nooit getoetst: het
/// staal van [0; 2000] ligt er tot en met x = 2000, en de grootste
/// belastinginvloed op dat stuk zit juist aan het eind. Elk vak neemt daarom
/// zijn rechtergrens mee (gesloten aan beide kanten), zodat die snede twee keer
/// wordt doorgerekend — met de korf links en met de korf rechts — en de
/// zwaarste van de twee wint.
#[test]
fn de_zwakke_zone_links_van_de_grens_wordt_ook_gevonden() {
    let envelop = vec![punt(2000.0, 110.0, 0.0), punt(3500.0, 150.0, 0.0)];
    let zones = ReinforcementZones {
        longitudinal: vec![onderzone(3, 0.0, 2000.0), onderzone(5, 2000.0, LENGTE_MM)],
        stirrups: vec![],
    };
    let m_rd_zwak = m_rd_referentie(3);
    let r = check_concrete_beam(invoer(korf(5, Some(150.0)), zones, envelop));

    let blok = toets(&r, "6.1_bending_stress_block");
    assert_relative_eq!(blok.force_state.position_mm, 2000.0, max_relative = 1e-12);
    assert_relative_eq!(blok.value, m_rd_zwak, max_relative = 1e-12);
    assert_relative_eq!(uc(blok), 110.0 / m_rd_zwak, max_relative = 1e-9);
}

// ═══════════════════════════════════════════════════════════════════════════
// §9.2.2 — de detailleringseisen die PER BEUGELZONE gelden
// ═══════════════════════════════════════════════════════════════════════════

/// **s_l,max per beugelzone.** De beugels staan bij de steunpunten om de
/// 150 mm en in het veld om de 350 mm. De staafkorf draagt de 150 mm.
///
/// ```text
///   beugelzone [0; 1000]    s = 150 mm   →  UC = 150/300 = 0,5
///   beugelzone [1000; 4000] s = 350 mm   →  UC = 350/300 = 1,16667   ← FAALT
///   beugelzone [4000; 5000] s = 150 mm   →  UC = 0,5
/// ```
///
/// s_l,max is 300 mm: de nationale bijlage vervangt (9.6N) door de kleinste van
/// 0,75·d·(1 + cot α) en 300 mm, en bij d = 454 mm is 0,75·d = 340,5 mm, dus het
/// plafond van 300 mm is bindend — in beide takken van de NB-regel, dus ook als
/// er nergens rekenkundig dwarskrachtwapening vereist is.
///
/// Eén uitkomst voor de hele staaf zou hier 0,5 melden en de staaf goedkeuren.
/// Dat is precies de fout die een detailleringseis niet mag maken: hij is een
/// UITVOERINGSregel, en de zone die niet uitvoerbaar is verdwijnt niet doordat
/// een andere zone het wel is.
#[test]
fn s_l_max_wordt_per_beugelzone_getoetst() {
    let envelop = vec![
        punt(500.0, 40.0, 60.0),
        punt(2500.0, 150.0, 5.0),
        punt(4500.0, 40.0, -60.0),
    ];
    let zones = ReinforcementZones {
        longitudinal: vec![],
        stirrups: vec![
            beugelzone(0.0, 1000.0, 150.0),
            beugelzone(1000.0, 4000.0, 350.0),
            beugelzone(4000.0, LENGTE_MM, 150.0),
        ],
    };

    let met = check_concrete_beam(invoer(korf(3, Some(150.0)), zones, envelop.clone()));
    let sl = toets(&met, "9.2.2_sl_max");
    // `value` is bij een MAXIMUM-eis de grenswaarde; de aanwezige maat staat in
    // de unity check als `ed`.
    assert_relative_eq!(sl.value, 300.0, max_relative = 1e-12);
    assert_relative_eq!(sl.uc.as_ref().unwrap().ed, 350.0, max_relative = 1e-12);
    assert_relative_eq!(uc(sl), 350.0 / 300.0, max_relative = 1e-9);
    assert_eq!(sl.status, CheckStatus::NotOk);
    assert!(
        notes(sl).contains("PER STUK STAAF"),
        "de afleiding zegt niet dat de eis per stuk is afgerekend: {}",
        notes(sl)
    );
    assert!(
        notes(sl).contains("x = 1000 tot 4000 mm"),
        "de afleiding noemt het maatgevende stuk niet: {}",
        notes(sl)
    );

    // De tegenproef: zonder zones is dezelfde balk 0,5 en groen.
    let zonder = check_concrete_beam(invoer(
        korf(3, Some(150.0)),
        ReinforcementZones::default(),
        envelop,
    ));
    let sl_zonder = toets(&zonder, "9.2.2_sl_max");
    assert_relative_eq!(uc(sl_zonder), 0.5, max_relative = 1e-9);
    assert_eq!(sl_zonder.status, CheckStatus::Ok);
}

/// **ρ_w,min per beugelzone.** Dezelfde balk, dezelfde beugelzones, maar nu de
/// minimum-dwarskrachtwapening van §9.2.2(5) met (9.5N).
///
/// ```text
///   A_sw = 2 benen × π/4 × 8² = 100,53096 mm²   b_w = 300 mm   α = 90°
///   ρ_w,min = 0,08·√30/500 = 0,00087636
///   s = 150 mm → ρ_w = 100,53096/(150·300) = 0,00223402  → UC = 0,39228
///   s = 350 mm → ρ_w = 100,53096/(350·300) = 0,00095744  → UC = 0,91532
/// ```
///
/// Een MINIMUM-eis in de vorm "vereist gedeeld door aanwezig": de zone met de
/// wijdste beugels heeft de hoogste unity check. Eén uitkomst voor de staaf zou
/// hier de gunstigste zone melden — 0,392 in plaats van 0,915 — en dus een
/// reserve tonen die in het veld niet bestaat.
#[test]
fn rho_w_min_wordt_per_beugelzone_getoetst() {
    let envelop = vec![punt(500.0, 40.0, 60.0), punt(2500.0, 150.0, 5.0)];
    let zones = ReinforcementZones {
        longitudinal: vec![],
        stirrups: vec![beugelzone(0.0, 1000.0, 150.0), beugelzone(1000.0, LENGTE_MM, 350.0)],
    };

    let a_sw = 2.0 * std::f64::consts::PI / 4.0 * 64.0;
    let rho_min = 0.08 * 30.0_f64.sqrt() / 500.0;
    let rho_bij = |s: f64| a_sw / (s * 300.0);

    let met = check_concrete_beam(invoer(korf(3, Some(150.0)), zones, envelop.clone()));
    let rho = toets(&met, "9.2.2_rho_w_min");
    // `value` is bij een MINIMUM-eis de vereiste waarde; de aanwezige ρ_w staat
    // in de unity check als `rd`.
    assert_relative_eq!(rho.value, rho_min, max_relative = 1e-9);
    assert_relative_eq!(rho.uc.as_ref().unwrap().rd, rho_bij(350.0), max_relative = 1e-9);
    assert_relative_eq!(uc(rho), rho_min / rho_bij(350.0), max_relative = 1e-9);

    let zonder = check_concrete_beam(invoer(
        korf(3, Some(150.0)),
        ReinforcementZones::default(),
        envelop,
    ));
    let rho_zonder = toets(&zonder, "9.2.2_rho_w_min");
    assert_relative_eq!(uc(rho_zonder), rho_min / rho_bij(150.0), max_relative = 1e-9);
    assert!(
        uc(rho) > uc(rho_zonder) * 2.0,
        "de wijde beugelzone hoort een veel hogere unity check te geven"
    );
}

/// **De minimumdiameter van de beugel per zone (NB §9.2.2(9)).** Deze eis leest
/// de KRACHTEN niet — hij vergelijkt Ø_sw met 5 mm — en hoort daarom ook te
/// worden afgerekend op een stuk staaf waar de omhullende geen rekenpunt
/// draagt. Zonder die regel zou een te dunne beugel in een rustig stuk staaf
/// stilzwijgend ongetoetst blijven.
///
/// ```text
///   beugelzone [0; 2000]    Ø8 → UC = 5/8 = 0,625
///   beugelzone [2000; 5000] Ø4 → UC = 5/4 = 1,25   ← FAALT, en er ligt geen
///                                                     rekenpunt in dat stuk
/// ```
#[test]
fn een_te_dunne_beugel_in_een_stuk_zonder_rekenpunt_wordt_toch_gevonden() {
    // Alle rekenpunten liggen in het EERSTE stuk.
    let envelop = vec![punt(0.0, 0.0, 60.0), punt(1000.0, 80.0, 20.0)];
    let zones = ReinforcementZones {
        longitudinal: vec![],
        stirrups: vec![
            beugelzone(0.0, 2000.0, 150.0),
            StirrupZone { diameter_mm: 4.0, ..beugelzone(2000.0, LENGTE_MM, 150.0) },
        ],
    };
    let r = check_concrete_beam(invoer(korf(3, Some(150.0)), zones, envelop));

    let d = toets(&r, "9.2.2_min_diameter_beugel");
    assert_relative_eq!(d.value, 5.0, max_relative = 1e-12);
    assert_relative_eq!(d.uc.as_ref().unwrap().rd, 4.0, max_relative = 1e-12);
    assert_relative_eq!(uc(d), 5.0 / 4.0, max_relative = 1e-9);
    assert_eq!(d.status, CheckStatus::NotOk);
    assert!(
        notes(d).contains("leest de krachten niet"),
        "de afleiding zegt niet waarom dit stuk zonder rekenpunt tóch is getoetst: {}",
        notes(d)
    );
}

/// De keerzijde: een eis die de krachten WÉL leest, wordt op een stuk zonder
/// rekenpunt NIET afgerekend, en dat staat er met zoveel woorden bij.
///
/// s_l,max heeft d nodig, en d volgt uit het teken van M_Ed (de nuttige hoogte
/// van de trekzijde). Zonder krachtenpunt zou een nul stilzwijgend "trek onder"
/// kiezen en dus een d — en daarmee een grenswaarde — verzinnen. Dat gebeurt
/// niet; het stuk wordt overgeslagen en genoemd.
#[test]
fn een_krachtafhankelijke_eis_wordt_op_een_stuk_zonder_rekenpunt_overgeslagen() {
    let envelop = vec![punt(0.0, 0.0, 60.0), punt(1000.0, 80.0, 20.0)];
    let zones = ReinforcementZones {
        longitudinal: vec![],
        stirrups: vec![beugelzone(0.0, 2000.0, 150.0), beugelzone(2000.0, LENGTE_MM, 350.0)],
    };
    let r = check_concrete_beam(invoer(korf(3, Some(150.0)), zones, envelop));

    let sl = toets(&r, "9.2.2_sl_max");
    // De 350 mm van het tweede stuk komt NIET in de uitkomst — daar is niet
    // getoetst — maar het rapport verzwijgt dat niet.
    assert_relative_eq!(sl.uc.as_ref().unwrap().ed, 150.0, max_relative = 1e-12);
    assert!(
        notes(sl).contains("NIET afgerekend op x = 2000 tot 5000 mm"),
        "het overgeslagen stuk staat niet in de afleiding: {}",
        notes(sl)
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// De zonegrenzen in de sneden — en wat er gebeurt als ze er niet zijn
// ═══════════════════════════════════════════════════════════════════════════

/// Draagt de omhullende geen rekenpunt op een zonegrens, dan wordt dat GEMELD
/// en niet weggerekend.
///
/// Er wordt met opzet niet tussen de buurpunten geïnterpoleerd. Een zonegrens
/// is de plaats waar de rekenkern een echte rekenknoop hoort te zetten, en op
/// zo'n knoop staat het station DUBBEL omdat V bij een puntlast en M bij een
/// aangrijpend moment kunnen springen. Middelen over die sprong heen levert een
/// krachtsverloop op dat nergens optreedt — en dat is in een rapport niet als
/// verzinsel te herkennen.
#[test]
fn een_zonegrens_zonder_rekenpunt_wordt_gemeld_en_niet_geinterpoleerd() {
    // De grens ligt op x = 2500; de omhullende draagt daar niets. Ook de
    // staafuiteinden x = 0 en x = 5000 dragen niets, en die horen NIET als
    // gemiste grens te worden gemeld: daar verandert de korf niet, dat is
    // alleen het begin en het eind van de staaf.
    let envelop = vec![punt(1250.0, 150.0, 30.0), punt(3750.0, 110.0, -30.0)];
    let zones = ReinforcementZones {
        longitudinal: vec![onderzone(5, 0.0, 2500.0), onderzone(3, 2500.0, LENGTE_MM)],
        stirrups: vec![],
    };
    let m_rd_zwak = m_rd_referentie(3);
    let r = check_concrete_beam(invoer(korf(5, Some(150.0)), zones, envelop));

    let blok = toets(&r, "6.1_bending_stress_block");
    let n = notes(blok);
    assert!(
        n.contains("zonegrens/-grenzen x = 2500 mm"),
        "de onbereikte zonegrens wordt niet genoemd: {n}"
    );
    assert!(
        n.contains("niet tussen de buurpunten geïnterpoleerd"),
        "de afleiding legt niet uit waarom er niet geïnterpoleerd wordt: {n}"
    );
    assert!(
        n.contains("extra sneden"),
        "de afleiding zegt niet hoe de gebruiker het kan verhelpen: {n}"
    );
    assert!(
        !n.contains("x = 0, 2500") && !n.contains("2500, 5000"),
        "de staafuiteinden worden ten onrechte als gemiste zonegrens gemeld: {n}"
    );

    // De toetsing gaat wél gewoon door op de punten die er zijn: x = 3750 ligt
    // in de zwakke zone en is daar maatgevend.
    assert_relative_eq!(blok.force_state.position_mm, 3750.0, max_relative = 1e-12);
    assert_relative_eq!(uc(blok), 110.0 / m_rd_zwak, max_relative = 1e-9);
}

// ═══════════════════════════════════════════════════════════════════════════
// Wat er NIET mag veranderen
// ═══════════════════════════════════════════════════════════════════════════

/// **De harde eis.** Zones die de korf van de staaf letterlijk herhalen mogen
/// GEEN enkele uitkomst verschuiven — en ook geen enkele mededeling toevoegen.
///
/// Één zone per zijde over de volle lengte plus één beugelzone levert
/// `boundaries_mm() == [0; 5000]`, dus één vak, dus precies de rekengang van
/// vóór de zones. Zou hier iets bewegen, dan is dat een fout in de
/// zone-aansluiting en geen verbetering.
#[test]
fn zones_die_de_staafkorf_herhalen_veranderen_niets() {
    let envelop = vec![
        punt(0.0, 0.0, 80.0),
        punt(1250.0, 90.0, 40.0),
        punt(2500.0, 120.0, 0.0),
        punt(3750.0, 90.0, -40.0),
        punt(LENGTE_MM, -45.0, -80.0),
    ];
    let herhaling = ReinforcementZones {
        longitudinal: vec![
            onderzone(3, 0.0, LENGTE_MM),
            LongitudinalZone {
                side: RebarSide::Top,
                row: RebarRow { count: 2, diameter_mm: 12.0 },
                x_start_mm: 0.0,
                x_end_mm: LENGTE_MM,
                bar_shape: Default::default(),
                casting_position: Default::default(),
            },
        ],
        stirrups: vec![beugelzone(0.0, LENGTE_MM, 150.0)],
    };

    let met = check_concrete_beam(invoer(korf(3, Some(150.0)), herhaling, envelop.clone()));
    let zonder = check_concrete_beam(invoer(
        korf(3, Some(150.0)),
        ReinforcementZones::default(),
        envelop,
    ));

    assert_eq!(met.checks.len(), zonder.checks.len());
    assert_relative_eq!(met.uc_max, zonder.uc_max, max_relative = 1e-12);
    assert_eq!(met.governing_check_id, zonder.governing_check_id);
    for (a, b) in met.checks.iter().zip(zonder.checks.iter()) {
        assert_eq!(a.id, b.id, "de volgorde van de toetsen is veranderd");
        let (ra, rb) = match (&a.kind, &b.kind) {
            (CheckKind::Resistance(ra), CheckKind::Resistance(rb)) => (ra, rb),
            _ => unreachable!("betontoetsen zijn geen stabiliteitstoetsen"),
        };
        assert_eq!(ra.status, rb.status, "{}: de status is veranderd", a.id);
        assert_relative_eq!(ra.value, rb.value, max_relative = 1e-12);
        assert_eq!(
            ra.uc.as_ref().map(|u| u.uc),
            rb.uc.as_ref().map(|u| u.uc),
            "{}: de unity check is veranderd",
            a.id
        );
        assert_eq!(ra.notes, rb.notes, "{}: de afleiding is veranderd", a.id);
    }
}

/// De volgorde waarin de negen detailleringseisen in het rapport staan is
/// onveranderd, ook nu ze niet meer als één blok maar stuk voor stuk worden
/// aangeroepen. Het rapport en de tabellen erop leunen op die volgorde.
#[test]
fn de_negen_detailleringseisen_staan_nog_in_dezelfde_volgorde() {
    let zones = ReinforcementZones {
        longitudinal: vec![onderzone(5, 0.0, 2500.0), onderzone(3, 2500.0, LENGTE_MM)],
        stirrups: vec![beugelzone(0.0, 1000.0, 150.0), beugelzone(1000.0, LENGTE_MM, 250.0)],
    };
    let r = check_concrete_beam(invoer(
        korf(5, Some(150.0)),
        zones,
        vec![punt(500.0, 40.0, 60.0), punt(2500.0, 120.0, 0.0), punt(4500.0, 30.0, -60.0)],
    ));

    let verwacht = [
        "9.2.1.1_as_min",
        "9.2.1.1_as_max",
        "9.2.1.1_min_diameter_langs",
        "9.2.2_rho_w_min",
        "9.2.2_sl_max",
        "9.2.2_st_max",
        "9.2.2_min_diameter_beugel",
        "9.2_min_balkbreedte",
        "8.2_vrije_staafafstand",
    ];
    let gevonden: Vec<&str> = r
        .checks
        .iter()
        .map(|c| c.id.as_str())
        .filter(|id| verwacht.contains(id))
        .collect();
    assert_eq!(gevonden, verwacht.to_vec());
}

/// De minimale balkbreedte van NB §9.2(1) is de ENIGE van de negen die de korf
/// niet leest, en hij hoort dus bij het ELEMENT en niet bij een stuk staaf. Hij
/// krijgt daarom geen zone-mededeling, ook niet als de staaf vol zones staat.
#[test]
fn de_balkbreedte_blijft_een_eis_van_het_element() {
    let zones = ReinforcementZones {
        longitudinal: vec![onderzone(5, 0.0, 2500.0), onderzone(3, 2500.0, LENGTE_MM)],
        stirrups: vec![],
    };
    let r = check_concrete_beam(invoer(
        korf(5, Some(150.0)),
        zones,
        vec![punt(1250.0, 150.0, 0.0), punt(3750.0, 110.0, 0.0)],
    ));
    let b = toets(&r, "9.2_min_balkbreedte");
    assert!(
        !notes(b).contains("PER STUK STAAF"),
        "de balkbreedte hoort niet per stuk te worden afgerekend: {}",
        notes(b)
    );
    // De aanwezige breedte is de LIJFbreedte van de doorsnede, niet iets uit
    // een zone.
    let b_w = b
        .variables
        .iter()
        .find(|v| v.symbol == "b_w")
        .expect("b_w staat in de afleiding")
        .value;
    assert_relative_eq!(b_w, 300.0, max_relative = 1e-12);
}

/// Een zone-indeling die als INDELING niet kan bestaan — hier een gat tussen
/// x = 2000 en x = 2500 — wordt geweigerd en niet stilzwijgend dichtgetrokken.
/// Een gat dichttrekken zou wapening aannemen die niemand heeft ingevoerd.
#[test]
fn een_zone_indeling_met_een_gat_wordt_geweigerd() {
    let zones = ReinforcementZones {
        longitudinal: vec![onderzone(5, 0.0, 2000.0), onderzone(3, 2500.0, LENGTE_MM)],
        stirrups: vec![],
    };
    let r = check_concrete_beam(invoer(
        korf(5, Some(150.0)),
        zones,
        vec![punt(1250.0, 150.0, 0.0)],
    ));
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(
        r.governing_check_id.contains("wapeningszones") && r.governing_check_id.contains("GAT"),
        "de reden noemt het gat niet: {}",
        r.governing_check_id
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Wat het kost
// ═══════════════════════════════════════════════════════════════════════════

/// **De meting.** Hoeveel duurder wordt de toetsing van één staaf als de
/// zonegrenzen erbij komen?
///
/// Draaien met:
/// ```text
///   cargo test -p concrete-check --release --test wapeningszones -- \
///       --ignored --nocapture wat_de_zones_kosten
/// ```
///
/// De meting staat op `#[ignore]` omdat een tijdmeting geen uitspraak over
/// juistheid is en op een belaste machine wisselt; de uitkomst hoort in het
/// commentaar van de orchestrator en niet in een assert.
#[test]
#[ignore = "tijdmeting, geen juistheidstoets — draai met --ignored --nocapture"]
fn wat_de_zones_kosten() {
    // De omhullende zoals de rekenkern hem levert: 21 stations per combinatie.
    let stations = |combi: u32| -> Vec<ForcePoint> {
        (0..21)
            .map(|i| {
                let x = LENGTE_MM * i as f64 / 20.0;
                let m = 150.0 * (x / LENGTE_MM) * (1.0 - x / LENGTE_MM) * 4.0;
                let v = 80.0 * (1.0 - 2.0 * x / LENGTE_MM);
                ForcePoint {
                    combination_id: combi,
                    position_mm: x,
                    forces: InternalForces { n_ed: 0.0, vz_ed: v, my_ed: m, ..Default::default() },
                }
            })
            .collect()
    };
    let omhullende = |aantal: u32| -> Vec<ForcePoint> { (1..=aantal).flat_map(stations).collect() };

    // Zes zonegrenzen (vier langswapeningszones met VIER VERSCHILLENDE korven en
    // vier beugelzones met dezelfde grenzen): de staaf valt in vier vakken
    // uiteen. Vier verschillende korven is met opzet — dat is de dure kant. Een
    // symmetrische indeling (3-5-3) levert maar twee VERSCHILLENDE korven en dus
    // maar twee M-N-κ-groepen; met vier korven zijn het er vier, en één M-κ-
    // diagram is duizend keer zo duur als een dwarskrachtsnede.
    let zones = ReinforcementZones {
        longitudinal: vec![
            onderzone(2, 0.0, 1000.0),
            onderzone(3, 1000.0, 2500.0),
            onderzone(4, 2500.0, 4000.0),
            onderzone(5, 4000.0, LENGTE_MM),
        ],
        stirrups: vec![
            beugelzone(0.0, 1000.0, 150.0),
            beugelzone(1000.0, 2500.0, 200.0),
            beugelzone(2500.0, 4000.0, 250.0),
            beugelzone(4000.0, LENGTE_MM, 150.0),
        ],
    };

    // Uit de afleiding van de M-N-κ-toets is af te lezen hoeveel sneden er zijn
    // doorgerekend en hoeveel M-κ-groepen daaruit overbleven. Dat zijn de twee
    // getallen waar de rekentijd aan hangt.
    let tel = |r: &ConcreteBeamCheckResult| -> (String, String) {
        let n = notes(toets(r, "6.1_mn_kappa"));
        let na_van_de = n.split("Van de ").nth(1).unwrap_or("").to_string();
        let sneden = na_van_de.split(' ').next().unwrap_or("?").to_string();
        let groepen = na_van_de
            .split("blijven er ")
            .nth(1)
            .and_then(|s| s.split(' ').next())
            .unwrap_or("?")
            .to_string();
        (sneden, groepen)
    };

    let meet = |naam: &str, zones: ReinforcementZones, combis: u32| {
        let env = omhullende(combis);
        let punten = env.len();
        let inp = invoer(korf(3, Some(150.0)), zones, env);
        // Eén keer warmdraaien, dan vijf metingen en de mediaan.
        let eerste = check_concrete_beam(inp.clone());
        let (sneden, groepen) = tel(&eerste);
        let mut tijden: Vec<f64> = (0..5)
            .map(|_| {
                let t = Instant::now();
                let r = check_concrete_beam(inp.clone());
                std::hint::black_box(r.uc_max);
                t.elapsed().as_secs_f64() * 1e3
            })
            .collect();
        tijden.sort_by(|a, b| a.partial_cmp(b).unwrap());
        println!(
            "{naam:>16} | {combis:>2} comb. ({punten:>4} punten) | {sneden:>4} sneden | \
             {groepen:>2} M-κ-groepen | {:8.1} ms",
            tijden[2]
        );
    };

    println!();
    for combis in [1u32, 5, 20, 50] {
        meet("zonder zones", ReinforcementZones::default(), combis);
        meet("met 4 vakken", zones.clone(), combis);
    }
    println!();
}
