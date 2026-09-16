//! De houttoetsing met een SAMENGESTELDE doorsnede (NEN-EN 1995-1-1).
//!
//! WAAROM DEZE TEST BESTAAT
//! De houttoetsing kende alleen een rechthoek b x h. Bij het narekenen van een
//! externe referentie-berekening bleek dat niet alleen een gemis: die
//! berekening gebruikt een samengestelde ligger (flenzen 1000 x 40 boven en
//! onder, lijf 71 x 40, totale hoogte 120 mm) en toetst de dwarskracht met de
//! breedte van het LIJF en met de eigen S en I. Wie diezelfde ligger als
//! "1000 x 120" invoert, krijgt volgens 1,5*V/A een schuifspanning die ruim
//! een orde van grootte te laag is -- en de berekening loopt gewoon door.
//!
//! WAT HIER WORDT VASTGELEGD
//!  1. De doorsnedegrootheden komen uit de lamellen en niet uit b x h.
//!  2. tau = V*S/(I*b) met b de breedte op de maatgevende vezel (het lijf),
//!     conform art. 6.1.7(1)P en (6.13a).
//!  3. k_cr volgt de Nederlandse nationale bijlage bij 6.1.7: 0,8 zodra het
//!     lijf dunner is dan de halve flensbreedte.
//!  4. k_m is 1,0 en niet 0,7 -- art. 6.1.6(2) geeft 0,7 alleen aan een
//!     rechthoekige doorsnede.
//!  5. De kiptoets wordt NIET uitgevoerd maar wel gemeld: (6.32) geldt alleen
//!     voor een gezaagde rechthoekige naaldhoutdoorsnede.
//!  6. Een doorsnede zonder lamellen (alleen kant-en-klare eigenschappen)
//!     wordt geweigerd met een leesbare reden, niet stil vervangen.
//!
//! DE GETALLEN, met de hand na te rekenen:
//!   A   = 2*1000*40 + 71*40                     =      82 840 mm2
//!   I_y = 2*(1000*40^3/12 + 40000*40^2) + 71*40^3/12 = 139 045 333 mm4
//!   S   = 40000*40 + 71*20*10                   =   1 614 200 mm3
//!   b   = 71 mm (lijf), b_flens = 1000 mm

use mechanics::{ForcePoint, InternalForces};
use nen_en_1993_1_1_section::CheckStatus;
use nen_en_1995_1_1::stability::{LtbLoadCase, LtbLoadPosition};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use steel_check::{CheckKind, CustomLamella, CustomSection};
use timber_check::{check_timber_beam, TimberBeamCheckInput};

const A_MM2: f64 = 82_840.0;
const IY_MM4: f64 = 139_045_333.333_333_3;
const S_MM3: f64 = 1_614_200.0;
const B_LIJF_MM: f64 = 71.0;

/// Flenzen 1000 x 40 op z = 20 en z = 100, lijf 71 x 40 op z = 60.
fn samengestelde_ligger() -> CustomSection {
    let plaat = |b: f64, t: f64, z: f64| CustomLamella { b_mm: b, t_mm: t, y_mm: 0.0, z_mm: z, alpha_rad: 0.0 };
    CustomSection {
        naam: "Samengestelde ligger 1000/71/1000".to_string(),
        lamellen: vec![plaat(1000.0, 40.0, 20.0), plaat(71.0, 40.0, 60.0), plaat(1000.0, 40.0, 100.0)],
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: Default::default(),
    }
}

fn punt(vz_kn: f64, my_knm: f64) -> ForcePoint {
    ForcePoint {
        combination_id: 1,
        position_mm: 0.0,
        forces: InternalForces { vz_ed: vz_kn, my_ed: my_knm, ..Default::default() },
    }
}

fn invoer(custom: Option<CustomSection>, vz_kn: f64, my_knm: f64) -> TimberBeamCheckInput {
    TimberBeamCheckInput {
        beam_id: 1,
        // De omhullende maten; met een samengestelde doorsnede mogen die de
        // uitkomst niet meer sturen.
        width_mm: 1000.0,
        height_mm: 120.0,
        custom_section: custom,
        strength_class: "C24".to_string(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        load_duration_per_combination: vec![],
        length_m: 4.0,
        forces_envelope: vec![punt(vz_kn, my_knm)],
        buckling_length_y_m: 4.0,
        buckling_length_z_m: 4.0,
        lateral_bracing: None,
        ltb_segment_length_m: 0.0,
        ltb_load_case: LtbLoadCase::UniformLoad,
        ltb_load_position: LtbLoadPosition::CentreOfGravity,
        ltb_effective_length_override_m: 0.0,
        perform_ltb_check: true,
        k_cr: 1.0,
        load_sharing: false,
        deflection_inst_mm: 0.0,
        deflection_quasi_perm_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_limit_fin: 250.0,
        deflection_limit_add: 333.0,
        deflection_notes: vec![],
        staaf_notities: None,
    }
}

/// De dwarskrachttoets pakt de grootheden van de werkelijke doorsnede.
#[test]
fn dwarskracht_rekent_met_lijfbreedte_en_eigen_s_en_i() {
    let r = check_timber_beam(invoer(Some(samengestelde_ligger()), 30.0, 0.0));
    let shear = r
        .checks
        .iter()
        .find(|c| c.id == "6.1.7_shear")
        .expect("dwarskrachttoets aanwezig");
    let CheckKind::Resistance(calc) = &shear.kind else { panic!("dwarskracht is een weerstandstoets") };

    let waarde = |symbool: &str| {
        calc.variables
            .iter()
            .find(|v| v.symbol == symbool)
            .unwrap_or_else(|| panic!("variabele {symbool} ontbreekt"))
            .value
    };
    assert!((waarde("S_y") - S_MM3).abs() < 1.0, "S_y = {}", waarde("S_y"));
    assert!((waarde("I_y") - IY_MM4).abs() < 10.0, "I_y = {}", waarde("I_y"));
    assert!((waarde("b") - B_LIJF_MM).abs() < 1e-6, "b = {}", waarde("b"));

    // k_cr volgens de NB: lijf 71 < halve flensbreedte 500 -> 0,8.
    assert!((waarde("k_{cr}") - 0.8).abs() < 1e-9, "k_cr = {}", waarde("k_{cr}"));

    // tau = 30e3 * 1 614 200 / (139 045 333 * 0,8*71) = 6,132 N/mm2.
    let verwacht = 30.0e3 * S_MM3 / (IY_MM4 * 0.8 * B_LIJF_MM);
    assert!((calc.value - verwacht).abs() / verwacht < 1e-9, "tau = {}", calc.value);

    // En het punt van de hele oefening: de rechthoekvereenvoudiging over de
    // omhullende doorsnede is een orde van grootte lager.
    let vereenvoudigd = 1.5 * 30.0e3 / (1000.0 * 120.0);
    assert!(calc.value / vereenvoudigd > 10.0, "verhouding {}", calc.value / vereenvoudigd);
    // Ook tegen de VOLLE doorsnede (A = 82 840) blijft er een factor negen over.
    let over_a = 1.5 * 30.0e3 / A_MM2;
    assert!(calc.value / over_a > 9.0, "verhouding {}", calc.value / over_a);
}

/// Buiging gaat over W_y van de samenstelling, niet over b*h^2/6.
#[test]
fn buiging_rekent_met_het_eigen_weerstandsmoment() {
    let r = check_timber_beam(invoer(Some(samengestelde_ligger()), 0.0, 40.0));
    let buiging = r.checks.iter().find(|c| c.id == "6.1.6_bending").expect("buigtoets aanwezig");
    let CheckKind::Resistance(calc) = &buiging.kind else { panic!("buiging is een weerstandstoets") };
    let sigma = calc
        .variables
        .iter()
        .find(|v| v.symbol == r"\sigma_{m,y,d}")
        .expect("sigma_m,y,d aanwezig")
        .value;
    // W_y = I_y / 60 = 2 317 422 mm3 -> sigma = 40e6 / W_y = 17,26 N/mm2.
    let w_y = IY_MM4 / 60.0;
    assert!((sigma - 40.0e6 / w_y).abs() < 1e-6, "sigma = {sigma}");
    // Met b x h zou W = 1000*120^2/6 = 2,4e6 zijn geweest -- bijna hetzelfde
    // getal, en juist daarom is de dwarskracht de gevaarlijke: de buiging
    // valt niet op.
    let km = calc
        .variables
        .iter()
        .find(|v| v.symbol == "k_m")
        .expect("k_m aanwezig")
        .value;
    assert!((km - 1.0).abs() < 1e-9, "k_m hoort 1,0 te zijn bij een niet-rechthoek, is {km}");
}

/// De kiptoets wordt niet uitgevoerd, maar staat er wel met de reden bij.
#[test]
fn kip_wordt_niet_stilzwijgend_overgeslagen() {
    let r = check_timber_beam(invoer(Some(samengestelde_ligger()), 0.0, 40.0));
    let kip = r
        .checks
        .iter()
        .find(|c| c.id == "6.3.3_beam_stability")
        .expect("kiptoets staat in het resultaat");
    let CheckKind::Stability(calc) = &kip.kind else { panic!("kip is een stabiliteitstoets") };
    assert_eq!(calc.status, CheckStatus::NotApplicable);
    assert!(calc.uc.is_none(), "geen unity check zonder sigma_m,crit");
    assert!(
        calc.notes.iter().any(|n| n.contains("NIET getoetst")),
        "notities: {:?}",
        calc.notes
    );
}

/// Zonder lamellen is er geen contour, en dus geen breedte op een vezel.
/// De toetsing weigert dan met een reden in plaats van door te rekenen.
#[test]
fn doorsnede_zonder_lamellen_wordt_geweigerd_met_reden() {
    let cs = CustomSection {
        naam: "Alleen eigenschappen".to_string(),
        lamellen: vec![],
        gesloten_cellen: vec![],
        eigenschappen: Some(Default::default()),
        vorm: Default::default(),
    };
    let r = check_timber_beam(invoer(Some(cs), 30.0, 0.0));
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.checks.is_empty(), "geen enkele toets mag zijn uitgevoerd");
    assert!(
        r.governing_check_id.starts_with("ERROR:")
            && r.governing_check_id.contains("lamellen"),
        "melding: {}",
        r.governing_check_id
    );
}

/// Een eigen doorsnede die in werkelijkheid een enkele rechthoek is, hoort
/// gewoon als rechthoek behandeld te worden: k_m = 0,7 en de kiptoets erbij.
#[test]
fn enkele_plaat_blijft_een_rechthoek() {
    let cs = CustomSection {
        naam: "Balk 96 x 450".to_string(),
        lamellen: vec![CustomLamella { b_mm: 96.0, t_mm: 450.0, y_mm: 0.0, z_mm: 0.0, alpha_rad: 0.0 }],
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: Default::default(),
    };
    let r = check_timber_beam(invoer(Some(cs), 30.0, 40.0));
    assert_eq!(r.section_name, "Balk 96 x 450");
    let buiging = r.checks.iter().find(|c| c.id == "6.1.6_bending").unwrap();
    let CheckKind::Resistance(calc) = &buiging.kind else { panic!() };
    let km = calc.variables.iter().find(|v| v.symbol == "k_m").unwrap().value;
    assert!((km - 0.7).abs() < 1e-9, "k_m = {km}");
    let kip = r.checks.iter().find(|c| c.id == "6.3.3_beam_stability").unwrap();
    let CheckKind::Stability(calc) = &kip.kind else { panic!() };
    assert!(calc.uc.is_some(), "een rechthoek houdt zijn kiptoets");
}

/// Zonder `custom_section` verandert er niets: dezelfde rechthoek, dezelfde
/// dwarskracht als de bestaande referentie.
#[test]
fn zonder_eigen_doorsnede_blijft_het_de_oude_rechthoek() {
    let mut inv = invoer(None, 75.5676, 0.0);
    inv.width_mm = 96.0;
    inv.height_mm = 450.0;
    let r = check_timber_beam(inv);
    assert_eq!(r.section_name, "96 x 450");
    let shear = r.checks.iter().find(|c| c.id == "6.1.7_shear").unwrap();
    let CheckKind::Resistance(calc) = &shear.kind else { panic!() };
    // 1,5 * 75567,6 / 43200 = 2,624 N/mm2 -- de referentiewaarde.
    assert!((calc.value - 2.624).abs() < 2e-3, "tau = {}", calc.value);
}
