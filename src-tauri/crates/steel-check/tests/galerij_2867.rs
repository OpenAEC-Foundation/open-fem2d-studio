//! Acceptatietest: beide liggers uit de referentie-uitwerking 2867 (galerij).
//!
//! Twee liggers van 8000 mm, S 235, CC2, elk met 2 zijdelingse steunen op de
//! derdepunten (L_st = 2667 mm), belasting aangrijpend op de bovenflens.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use steel_check::*;

fn uc_van(r: &BeamCheckResult, id: &str) -> f64 {
    let check = r
        .checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| {
            panic!(
                "toets '{id}' ontbreekt; aanwezig: {:?}",
                r.checks.iter().map(|c| c.id.as_str()).collect::<Vec<_>>()
            )
        });
    match &check.kind {
        CheckKind::Resistance(x) => x.uc.as_ref().expect("UC aanwezig").uc,
        CheckKind::Stability(x) => x.uc.as_ref().expect("UC aanwezig").uc,
    }
}

/// Bouwt de invoer voor één ligger uit de referentie.
///
/// `m_max_knm` het maatgevende veldmoment, `v_max_kn` de maatgevende
/// dwarskracht bij de oplegging, `q_n_per_mm` de equivalente veldbelasting in
/// het kipveld, `w_z_mm` de doorbuiging (negatief = zakking).
fn ligger(
    profiel: &str,
    m_max_knm: f64,
    v_max_kn: f64,
    q_n_per_mm: f64,
    w_z_mm: f64,
) -> BeamCheckResult {
    let input = BeamCheckInput {
        beam_id: 1,
        profile_name: profiel.to_string(),
        steel_grade: "S235".to_string(),
        length_m: 8.0,
        forces_envelope: vec![
            // x = 0: maatgevende dwarskracht bij de oplegging
            ForcePoint {
                combination_id: 21,
                position_mm: 0.0,
                forces: InternalForces {
                    vz_ed: v_max_kn,
                    ..Default::default()
                },
            },
            // x = 4000: maatgevend veldmoment
            ForcePoint {
                combination_id: 21,
                position_mm: 4000.0,
                forces: InternalForces {
                    my_ed: m_max_knm,
                    ..Default::default()
                },
            },
        ],
        // 2 zijdelingse steunen op de derdepunten → L_st = 2667 mm
        lateral_bracing: LateralBracing {
            top_flange_positions: vec![1.0 / 3.0, 2.0 / 3.0],
            bottom_flange_positions: vec![],
        },
        buckling_length_y_m: 8.0,
        buckling_length_z_m: 8.0,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: w_z_mm,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC2,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: -3.2,
        q_equiv_n_per_mm: q_n_per_mm,
        z_a_mm: 155.0,
    };
    check_beam(input)
}

fn ligger1() -> BeamCheckResult {
    ligger("HEA 320", 111.84, 55.92, 8.115, -11.0)
}
fn ligger2() -> BeamCheckResult {
    ligger("HEA 400", 227.04, 113.52, 15.615, -11.2)
}

#[test]
fn ligger1_hea320_buiging_en_dwarskracht() {
    let r = ligger1();
    // 6.2.5 (6.13): M_y,c,Rd = 382,666 kNm → UC = 111,84/382,666 = 0,29
    assert_relative_eq!(uc_van(&r, "6.2.5_bending_y"), 0.29, max_relative = 3e-2);
    // 6.2.6 (6.18): V_c,z,Rd = 558,4 kN → UC = 55,92/558,4 = 0,10
    assert_relative_eq!(uc_van(&r, "6.2.6_shear_z"), 0.10, max_relative = 5e-2);
}

#[test]
fn ligger2_hea400_buiging_en_dwarskracht() {
    let r = ligger2();
    // M_y,c,Rd = 602,106 kNm → UC = 227,04/602,106 = 0,38
    assert_relative_eq!(uc_van(&r, "6.2.5_bending_y"), 0.38, max_relative = 3e-2);
    // V_c,z,Rd = 778,1 kN → UC = 113,52/778,1 = 0,15
    assert_relative_eq!(uc_van(&r, "6.2.6_shear_z"), 0.15, max_relative = 3e-2);
}

#[test]
fn doorbuiging_beide_liggers() {
    // w_fin = -11 mm, grens L/333 = 24,0 → UC = 0,46
    // w_add = -11 - (-3,2) = -7,8 mm, grens L/150 = 53,3 → UC = 0,15
    let r1 = ligger1();
    assert_relative_eq!(uc_van(&r1, "deflection_w_fin"), 0.46, max_relative = 3e-2);
    assert_relative_eq!(uc_van(&r1, "deflection_w_add"), 0.15, max_relative = 5e-2);

    // w_fin = -11,2 mm → UC = 0,47
    let r2 = ligger2();
    assert_relative_eq!(uc_van(&r2, "deflection_w_fin"), 0.47, max_relative = 3e-2);
}

#[test]
fn kip_levert_geen_reductie_in_deze_casus() {
    // In de referentie is λ_LT = 0,378 respectievelijk 0,385, beide onder de
    // drempel λ_LT,0 = 0,4, dus χ_LT = 1,00. De kiptoets mag de buigtoets dan
    // niet verzwaren.
    for (naam, r) in [("HEA 320", ligger1()), ("HEA 400", ligger2())] {
        let uc_buiging = uc_van(&r, "6.2.5_bending_y");
        let uc_kip = uc_van(&r, "6.3.2_ltb");
        assert!(
            uc_kip <= uc_buiging * 1.05,
            "{naam}: kip-UC {uc_kip} mag niet boven buiging-UC {uc_buiging} liggen (χ_LT = 1,00)"
        );
    }
}

#[test]
fn beide_liggers_voldoen() {
    for (naam, r) in [("HEA 320", ligger1()), ("HEA 400", ligger2())] {
        assert!(
            r.uc_max < 1.0,
            "{naam} moet voldoen, uc_max = {} (maatgevend: {})",
            r.uc_max,
            r.governing_check_id
        );
    }
}

#[test]
fn de_nb_tussenwaarden_staan_in_het_resultaat() {
    // Het rapport moet de NB-tussenwaarden kunnen tonen; controleer dat ze
    // aanwezig zijn en plausibel, zodat een lege kolom in het rapport opvalt.
    let r = ligger1();
    let ltb = r
        .checks
        .iter()
        .find(|c| c.id == "6.3.2_ltb")
        .expect("kiptoets aanwezig");
    let CheckKind::Stability(s) = &ltb.kind else {
        panic!("kiptoets hoort een StabilityCalc te zijn");
    };
    let waarde = |sym: &str| {
        s.intermediate_values
            .iter()
            .find(|v| v.symbol == sym)
            .unwrap_or_else(|| panic!("tussenwaarde '{sym}' ontbreekt"))
            .value
    };
    // L_g = volledige overspanning, L_st = afstand tussen de steunen.
    // Vroeger waren deze twee aan elkaar gelijkgesteld; dat is de kern van de
    // reparatie, dus deze twee moeten echt verschillen.
    assert_relative_eq!(waarde("L_g"), 8000.0, max_relative = 1e-9);
    assert_relative_eq!(waarde("L_{st}"), 2666.67, max_relative = 1e-3);
    assert!(
        waarde("L_g") > waarde("L_{st}"),
        "L_g en L_st horen niet gelijk te zijn"
    );
    assert_relative_eq!(waarde("k_{red}"), 1.0, max_relative = 1e-9);
    // S volgens NB.NB.13, referentie 2006 mm
    assert_relative_eq!(waarde("S"), 2006.0, max_relative = 5e-3);

    // L_kip moet binnen de normbegrenzing 1,0 ≤ L_kip/L_st ≤ 1,4 liggen.
    let verhouding = waarde("L_{kip}") / waarde("L_{st}");
    assert!(
        (1.0..=1.4).contains(&verhouding),
        "L_kip/L_st = {verhouding} valt buiten de normbegrenzing [1,0 ; 1,4]"
    );
}

/// BEKENDE AFWIJKING — β wordt nog niet volgens de norm bepaald.
///
/// De norm definieert β als M_y,1,Ed / M_y,2,Ed: de verhouding van de twee
/// EINDMOMENTEN VAN HET KIPVELD, met M_1 de kleinste en M_2 de grootste in
/// absolute waarde. Voor deze ligger loopt het maatgevende kipveld van x = 0
/// tot x = 2667 mm met eindmomenten 0 en M(2667), dus β = 0 en daarmee
/// L_kip = 1,4 · 2667 = 3733 mm — precies wat de referentie-uitwerking geeft.
///
/// De orchestrator gebruikt in plaats daarvan een benadering: het moment op
/// L_st/4 gedeeld door het maximale moment over de hele staaf. Dat levert hier
/// β ≈ 0,167 en L_kip ≈ 3378 mm, oftewel een 10% kortere kiplengte en dus een
/// te hoge M_cr.
///
/// Deze test legt de afwijking vast zodat zij niet ongemerkt blijft bestaan.
/// Hij moet worden vervangen zodra β uit de werkelijke veldeindmomenten wordt
/// bepaald.
#[test]
fn bekend_gat_beta_wordt_benaderd_niet_volgens_de_norm() {
    let r = ligger1();
    let ltb = r.checks.iter().find(|c| c.id == "6.3.2_ltb").unwrap();
    let CheckKind::Stability(s) = &ltb.kind else { unreachable!() };
    let beta = s
        .intermediate_values
        .iter()
        .find(|v| v.symbol == r"\beta")
        .expect("β aanwezig")
        .value;
    assert!(
        beta.abs() > 1e-6,
        "β is nu {beta}; als dit 0 is geworden, is het gat gedicht — \
         vervang deze test door een controle op L_kip = 3733 mm"
    );
}
