//! De zijden in wereldtermen bij een STAANDE betonstaaf (`mechanics::Staafstand`).
//!
//! De frontend levert elke staaf in zijn referentierichting aan: liggend van
//! links naar rechts, staand van voet naar kop. "M_y positief = trek in de
//! onderste vezel" is dan bij een liggende staaf letterlijk. Bij een staande
//! staaf ligt die onderste vezel RECHTS: lokaal +y staat 90° tegen de klok in
//! vanaf de as, en die as wijst omhoog. De afleiding noemt de trekzijde
//! "onderwapening" of "bovenwapening"; bij een staande staaf hoort ze erbij te
//! zeggen welke kant dat is.
//!
//! Wat hier vastligt:
//!  1. élke toets die in zijn tekst een zijde noemt, krijgt bij een staande
//!     staaf de kanttekening — ook een toets die er later bij komt;
//!  2. een liggende staaf krijgt hem nergens;
//!  3. de staafstand rekent nergens mee: dezelfde toetsen, dezelfde UC's;
//!  4. ook de dekkingslijn zegt het.

use concrete_check::{
    check_concrete_beam, dekkingslijn, CheckKind, ConcreteBeamCheckInput, ConcreteBeamCheckResult,
    DekkingslijnVerzoek,
};
use mechanics::{ForcePoint, InternalForces, Staafstand};
use nen_en_1992_1_1::slankheid::StructuralSystem;
use nen_en_1992_1_1::{
    ConcreteSectionInput, ExposureClass, RebarRow, ReinforcementCage, ReinforcementZones,
};

/// Woorden waarmee een afleiding een zijde van de doorsnede aanwijst.
const ZIJDEWOORDEN: [&str; 9] = [
    "onderwapening",
    "bovenwapening",
    "onderzijde",
    "bovenzijde",
    "onderrand",
    "bovenrand",
    "trekzijde",
    "onderste vezel",
    "bovenste vezel",
];

const KANTTEKENING: &str = "Zijden in wereldtermen";

/// 300 × 500 C30/37 met een ONGELIJKE korf — boven 2Ø12, onder 3Ø16 — en
/// beugels, zodat de keuze van de trekzijde er werkelijk toe doet.
fn korf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        stirrup_spacing_mm: Some(150.0),
        stirrup_legs: Some(2),
        ..ReinforcementCage::default()
    }
}

/// Paraboolvormige momentenlijn met top `m` kNm halverwege een staaf van 5 m,
/// met de bijbehorende dwarskracht, op elf stations.
fn omhullende(combi: u32, m: f64) -> Vec<ForcePoint> {
    const L: f64 = 5000.0;
    (0..=10)
        .map(|i| {
            let x = L * i as f64 / 10.0;
            let t = x / L;
            ForcePoint {
                combination_id: combi,
                position_mm: x,
                forces: InternalForces {
                    my_ed: 4.0 * m * t * (1.0 - t),
                    // V = dM/dx in kN bij x in m.
                    vz_ed: 4.0 * m * (1.0 - 2.0 * t) / (L / 1000.0),
                    ..Default::default()
                },
            }
        })
        .collect()
}

fn invoer(stand: Option<Staafstand>, m: f64) -> ConcreteBeamCheckInput {
    ConcreteBeamCheckInput {
        bijlage: Default::default(),
        beam_id: 3,
        section: ConcreteSectionInput::rectangle(300.0, 500.0),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        cage: korf(),
        reinforcement_zones: ReinforcementZones::default(),
        length_m: 5.0,
        forces_envelope: omhullende(1, m),
        n_strips: 50,
        steel_branch: Default::default(),
        design_situation: Default::default(),
        apply_min_eccentricity: true,
        // Zoveel mogelijk toetsen laten rekenen: scheurbeheersing, slankheid
        // en detaillering hebben deze gegevens nodig.
        sls_frequent_envelope: omhullende(7, 0.6 * m),
        exposure_class: Some(ExposureClass::XC1),
        structural_class: None,
        aggregate_size_mm: Some(16.0),
        structural_system: Some(StructuralSystem::SimplySupported),
        bar_spacing_mm: None,
        column: None,
        sls_quasi_permanent_envelope: vec![],
        first_order_envelope: None,
        staafstand: stand,
        staafstand_notities: None,
    }
}

fn notities(r: &ConcreteBeamCheckResult, id: &str) -> Vec<String> {
    let c = r.checks.iter().find(|c| c.id == id).expect("toets aanwezig");
    match &c.kind {
        CheckKind::Resistance(rc) => rc.notes.clone(),
        CheckKind::Stability(s) => s.notes.clone(),
    }
}

fn uc(r: &ConcreteBeamCheckResult, id: &str) -> Option<f64> {
    let c = r.checks.iter().find(|c| c.id == id).expect("toets aanwezig");
    match &c.kind {
        CheckKind::Resistance(rc) => rc.uc.as_ref().map(|u| u.uc),
        CheckKind::Stability(s) => s.uc.as_ref().map(|u| u.uc),
    }
}

#[test]
fn elke_toets_die_een_zijde_noemt_zegt_bij_een_staande_staaf_welke_kant_dat_is() {
    // Beide tekens: bij +80 kNm staat de onderwapening op trek, bij −80 de
    // bovenwapening. Welke woorden een afleiding gebruikt hangt daarvan af.
    for m in [80.0, -80.0] {
        let liggend = check_concrete_beam(invoer(None, m));
        let staand = check_concrete_beam(invoer(Some(Staafstand::Staand), m));
        assert_eq!(liggend.checks.len(), staand.checks.len());

        let mut met_zijde = 0;
        for c in &liggend.checks {
            // De tekst van de LIGGENDE staaf: daar staat de kanttekening niet
            // in, dus alles wat hier een zijde noemt komt uit de afleiding zelf.
            let tekst = serde_json::to_string(c).unwrap().to_lowercase();
            let noemt_zijde = ZIJDEWOORDEN.iter().any(|w| tekst.contains(w));
            let heeft = notities(&staand, &c.id).iter().any(|n| n.starts_with(KANTTEKENING));
            if noemt_zijde {
                met_zijde += 1;
                assert!(
                    heeft,
                    "toets {} (M = {m} kNm) noemt een zijde van de doorsnede, maar zegt bij een \
                     staande staaf niet welke kant dat is — zet hem in KIEZEN_EEN_TREKZIJDE",
                    c.id
                );
            }
            assert!(
                notities(&liggend, &c.id).iter().all(|n| !n.starts_with(KANTTEKENING)),
                "een liggende staaf hoort geen zijdenkanttekening te krijgen ({})",
                c.id
            );
            // Rekenen doet de staafstand niet.
            assert_eq!(uc(&liggend, &c.id), uc(&staand, &c.id), "UC van {} veranderde", c.id);
        }
        assert!(met_zijde >= 3, "de proef moet toetsen raken die een zijde noemen (M = {m})");

        // De kanttekening zegt het met zoveel woorden.
        let buiging = notities(&staand, "6.1_bending_stress_block");
        let tekst = buiging.iter().find(|n| n.starts_with(KANTTEKENING)).expect("kanttekening bij 6.1");
        assert!(tekst.contains("RECHTERzijde"));
        assert!(tekst.contains("LINKERzijde"));
        assert_eq!(liggend.uc_max, staand.uc_max);
        assert_eq!(liggend.governing_check_id, staand.governing_check_id);
    }
}

#[test]
fn de_dekkingslijn_noemt_de_zijden_bij_een_staande_staaf() {
    let verzoek = |stand| DekkingslijnVerzoek {
        beam: invoer(stand, 80.0),
        z_mm: None,
        c_d_mm: None,
        a_sl_mm2: None,
        cot_theta: None,
    };
    let staand = dekkingslijn(verzoek(Some(Staafstand::Staand))).expect("dekkingslijn staand");
    assert!(staand.notes.iter().any(|n| n.starts_with(KANTTEKENING)));
    let liggend = dekkingslijn(verzoek(None)).expect("dekkingslijn liggend");
    assert!(liggend.notes.iter().all(|n| !n.starts_with(KANTTEKENING)));
    assert_eq!(staand.uc_moment_max, liggend.uc_moment_max);
}

/// De kanttekeningen van de bouwer bij de staafstand — bij een naar links
/// hellende staaf dicht bij 75° de waarschuwing dat de bovenwapening daar van
/// bovenvlak naar ondervlak springt — staan letterlijk bij precies de toetsen
/// die ook de zijdenkanttekening krijgen, en bij de dekkingslijn. Ook bij een
/// liggende staaf: daar ligt de helft van de sprongband. Rekenen doen ze niet.
#[test]
fn staafstandnotities_staan_bij_de_toetsen_die_een_zijde_kiezen_en_rekenen_niet_mee() {
    const PROEF: &str = "Richtingssprong nabij. Proeftekst.";
    for m in [80.0, -80.0] {
        // Welke toetsen een zijde kiezen, leest de staande staaf zonder
        // kanttekeningen voor: die krijgen de zijdenkanttekening.
        let kiezers = check_concrete_beam(invoer(Some(Staafstand::Staand), m));
        for stand in [None, Some(Staafstand::Staand)] {
            let zonder = check_concrete_beam(invoer(stand, m));
            let mut inv = invoer(stand, m);
            inv.staafstand_notities = Some(vec![PROEF.to_string()]);
            let met = check_concrete_beam(inv);
            assert_eq!(met.checks.len(), zonder.checks.len());

            let mut geraakt = 0;
            for c in &kiezers.checks {
                let kiest = notities(&kiezers, &c.id).iter().any(|n| n.starts_with(KANTTEKENING));
                let aantal = notities(&met, &c.id).iter().filter(|n| *n == PROEF).count();
                assert_eq!(
                    aantal,
                    usize::from(kiest),
                    "toets {} (M = {m}, {stand:?}): kanttekening {aantal} keer",
                    c.id
                );
                geraakt += aantal;
                assert_eq!(uc(&met, &c.id), uc(&zonder, &c.id), "UC van {} veranderde", c.id);
            }
            assert!(geraakt >= 3, "de proef moet toetsen raken die een zijde kiezen");
            assert_eq!(met.uc_max, zonder.uc_max);
            assert_eq!(met.governing_check_id, zonder.governing_check_id);
        }
    }

    let mut beam = invoer(None, 80.0);
    beam.staafstand_notities = Some(vec![PROEF.to_string()]);
    let lijn = dekkingslijn(DekkingslijnVerzoek {
        beam,
        z_mm: None,
        c_d_mm: None,
        a_sl_mm2: None,
        cot_theta: None,
    })
    .expect("dekkingslijn");
    assert_eq!(lijn.notes.iter().filter(|n| *n == PROEF).count(), 1);

    // Een lege lijst is geen kanttekening.
    let mut leeg = invoer(None, 80.0);
    leeg.staafstand_notities = Some(vec![]);
    assert_eq!(
        serde_json::to_string(&check_concrete_beam(leeg).checks).unwrap(),
        serde_json::to_string(&check_concrete_beam(invoer(None, 80.0)).checks).unwrap()
    );
}

#[test]
fn rekenruis_aan_de_oplegging_kiest_geen_trekzijde_in_de_scheurtoets() {
    // Een vrij opgelegde ligger: aan de opleggingen is M nul, maar de solver
    // levert daar ±1e-13 kNm, en het TEKEN van die ruis draait om als de staaf
    // andersom getekend is. Tot september 2026 koos §7.3 met −1e-13 een
    // trekzijde boven, die snede was niet af te rekenen, en "niet af te
    // rekenen" gaat in de rangorde vóór elke uitkomst: de scheurwijdte in het
    // veld verdween achter een "niet van toepassing" aan de oplegging.
    //
    // Hetzelfde met de normaalkracht: een staaf onder 180° krijgt uit sin(π)
    // een axiale ruis van −3,7e-15 kN (gemeten), en die las als druk over de
    // hele doorsnede (A_c,eff = 0, "niet af te rekenen").
    //
    // Hier dezelfde envelop drie keer, met aan het eind ruis +, 0 en − op M én
    // N: de scheurtoets hoort alle drie keer dezelfde uitkomst te geven, in het
    // veld en met een unity check.
    let met_ruis = |ruis: f64| {
        let mut inv = invoer(None, 80.0);
        for env in [&mut inv.sls_frequent_envelope, &mut inv.forces_envelope] {
            let laatste = env.last_mut().unwrap();
            laatste.forces.my_ed = ruis;
            laatste.forces.n_ed = ruis;
        }
        check_concrete_beam(inv)
    };
    let nul = met_ruis(0.0);
    let scheur_nul = uc(&nul, "7.3.4_scheurwijdte");
    assert!(scheur_nul.is_some(), "zonder ruis heeft de scheurwijdte een unity check");
    for ruis in [1e-13, -1e-13] {
        let r = met_ruis(ruis);
        assert_eq!(uc(&r, "7.3.4_scheurwijdte"), scheur_nul, "scheurwijdte bij ruis {ruis}");
        assert_eq!(uc(&r, "7.3.2_minimumwapening"), uc(&nul, "7.3.2_minimumwapening"));
        assert_eq!(r.uc_max, nul.uc_max);
    }
}
