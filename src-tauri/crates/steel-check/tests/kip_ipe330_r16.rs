//! Acceptatietest R16 — kip van een vrij opgelegde, zijdelings ongesteunde
//! IPE 330 van 5,70 m onder gelijkmatig verdeelde belasting.
//!
//! Dit is het ijkgeval van de kipreparatie. Het is de enige casus in de suite
//! met een gewalst I-profiel boven h/b = 2 (330/160 = 2,0625), en dus de enige
//! die de kipkromme uit tabel 6.5 werkelijk aanspreekt.
//!
//! Referentiewaarden uit de externe referentieberekening, vastgelegd in
//! docs/superpowers/plans/2026-09-02-referentieberekeningen.md, § R16:
//!
//!   M_y,Ed = 90,48 kNm · V_Ed = 63,50 kN · w = 8,8 mm
//!   M_cr = 113,90 kNm · λ_LT = 1,288 · χ_LT = 0,480
//!   M_b,Rd = 92,24 kNm · UC kip = 0,981
//!
//! De referentie rekent de algemene EN-formule voor M_cr, onze kern de
//! Nederlandse bijlage (NB.NB). Dat is een methodeverschil, geen rekenfout;
//! de toleranties hieronder zijn die van het dossier (§1.5): 2 % op de
//! afgeleide kipgrootheden, 0,02 absoluut op een unity check.
//!
//! Wat deze test afdwingt, per artikel:
//!  * NB.NB.4.3 — β uit de EINDMOMENTEN van het kipveld. Die zijn hier nul
//!    (vrij opgelegd, alleen veldbelasting), dus β = 0. Vóór de reparatie
//!    leidde de aanroeper β af uit het VELDmoment op L_st/4 en kwam op 0,75.
//!  * NB.NB.4.3 — L_kip = L_st tussen twee gaffels. Er zijn geen kipsteunen,
//!    dus het enige kipveld loopt van gaffel tot gaffel en L_kip = 5700 mm.
//!    De formule (1,4 − 0,8·β)·L_st geldt hier NIET; met β = 0 zou die
//!    7980 mm geven en M_cr 31 % te laag maken.
//!  * NB.NB.4.3(3) — B* = 8·M/(8·|M| + q·L_st²) met M het grootste
//!    eindmoment. Met M = 0 is B* = 0: zuivere veldbelasting.
//!  * art. 6.3.2.3 + tabel 6.5 + tabel 6.3 — gewalst I met h/b > 2 is
//!    kipkromme c, dus α_LT = 0,49. Vóór de reparatie stond α_LT vast op
//!    0,34 (kromme b), wat χ_LT en daarmee de capaciteit te hoog maakte.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use std::sync::OnceLock;
use steel_check::*;

/// Overspanning (m) en de daaruit afgeleide lijnlast van het R16-model.
const L_M: f64 = 5.7;
/// M_y,Ed uit onze eigen krachtsverdeling (de bron geeft 90,48 kNm).
const M_MAX_KNM: f64 = 90.473;
/// q = 8·M_max/L² — precies wat `equivalentUdlFromMoments` in de frontend
/// uit deze momentenlijn haalt. kN/m ≡ N/mm.
const Q_N_PER_MM: f64 = 8.0 * M_MAX_KNM / (L_M * L_M);

/// De momentenlijn van een vrij opgelegde ligger onder gelijkmatig verdeelde
/// belasting, bemonsterd op 21 stations zoals de frontend die aanlevert:
/// M(x) = q·x·(L − x)/2, dus M(0) = M(L) = 0.
fn envelop() -> Vec<ForcePoint> {
    (0..21)
        .map(|i| {
            let x_m = L_M * i as f64 / 20.0;
            let x_mm = x_m * 1000.0;
            let my = Q_N_PER_MM * x_m * (L_M - x_m) / 2.0;
            let vz = Q_N_PER_MM * (L_M / 2.0 - x_m);
            ForcePoint {
                combination_id: 1,
                position_mm: x_mm,
                forces: InternalForces { my_ed: my, vz_ed: vz, ..Default::default() },
            }
        })
        .collect()
}

fn run() -> &'static BeamCheckResult {
    static RESULT: OnceLock<BeamCheckResult> = OnceLock::new();
    RESULT.get_or_init(|| {
        check_beam(BeamCheckInput {
            beam_id: 1,
            profile_name: "IPE 330".to_string(),
            steel_grade: "S235".to_string(),
            length_m: L_M,
            forces_envelope: envelop(),
            // Zijdelings ongesteund: het enige kipveld loopt van gaffel tot
            // gaffel over de volle 5700 mm.
            lateral_bracing: LateralBracing {
                top_flange_positions: vec![],
                bottom_flange_positions: vec![],
            },
            buckling_length_y_m: L_M,
            buckling_length_z_m: L_M,
            deflection_limit_class: DeflectionClass::Floor,
            deflection_limit_numerator: 333,
            deflection_actual_max_mm: -8.7901,
            is_cantilever: false,
            consequence_class: ConsequenceClass::CC1,
            pre_camber_mm: 0.0,
            deflection_permanent_mm: 0.0,
            q_equiv_n_per_mm: Q_N_PER_MM,
            // Belasting op de bovenflens: z_a = h/2 = 165 mm (destabiliserend).
            z_a_mm: 165.0,
            custom_section: None,
        })
    })
}

fn kip() -> &'static nen_en_1993_1_1_stability::StabilityCalc {
    let check = run()
        .checks
        .iter()
        .find(|c| c.id == "6.3.2_ltb")
        .expect("kiptoets 6.3.2_ltb aanwezig");
    match &check.kind {
        CheckKind::Stability(s) => s,
        CheckKind::Resistance(_) => panic!("6.3.2_ltb hoort een StabilityCalc te zijn"),
    }
}

fn tussenwaarde(symbool: &str) -> f64 {
    kip()
        .intermediate_values
        .iter()
        .find(|v| v.symbol == symbool)
        .unwrap_or_else(|| panic!("tussenwaarde '{symbool}' ontbreekt"))
        .value
}

#[test]
fn r16_krachtsverdeling_klopt_met_de_bron() {
    // Voorwaarde voor de rest: als de momentenlijn al niet klopt, zegt de
    // kip-UC niets. Bron: M_y,Ed = 90,48 kNm, V_Ed = 63,50 kN.
    let r = run();
    let m_ed = kip().uc.as_ref().expect("UC").ed;
    assert_relative_eq!(m_ed, 90.48, max_relative = 1e-2);
    let schuif = r.checks.iter().find(|c| c.id == "6.2.6_shear_z").unwrap();
    let CheckKind::Resistance(s) = &schuif.kind else { unreachable!() };
    assert_relative_eq!(s.uc.as_ref().unwrap().ed, 63.50, max_relative = 1e-2);
    // V_pl,Rd = A_v,z·(f_y/√3) = 3080,3·135,67 = 417,9 kN (bron: 417,9 kN).
    assert_relative_eq!(s.value, 417.9, max_relative = 1e-2);
}

#[test]
fn r16_beta_komt_uit_de_eindmomenten_en_is_nul() {
    // NB.NB.4.3: β = M_y,1,Ed / M_y,2,Ed, de twee EINDmomenten van het
    // kipveld (index 1 = kleinste, 2 = grootste absolute waarde). Beide zijn
    // hier nul, dus β = 0 — niet 0,75, wat het VELDmoment op L_st/4 opleverde.
    assert_relative_eq!(tussenwaarde(r"\beta"), 0.0, epsilon = 1e-9);
}

#[test]
fn r16_b_ster_is_nul_bij_zuivere_veldbelasting() {
    // NB.NB.4.3(3): B* = 8·M/(8·|M| + q·L_st²) met M het grootste eindmoment.
    // M = 0 → B* = 0, het ankerpunt "zuivere veldbelasting" (C₁ = 1,13).
    assert_relative_eq!(tussenwaarde("B^*"), 0.0, epsilon = 1e-9);
}

#[test]
fn r16_kiplengte_tussen_twee_gaffels_is_de_staaflengte() {
    // NB.NB.4.3: "tussen twee gaffels: L_kip = L_st". De formule
    // (1,4 − 0,8·β)·L_st geldt alleen tussen één gaffel en één kipsteun of
    // tussen twee kipsteunen. Zou zij hier tóch worden toegepast, dan gaf
    // β = 0 een L_kip van 1,4·5700 = 7980 mm en een 31 % te lage M_cr.
    assert_relative_eq!(tussenwaarde("L_g"), 5700.0, max_relative = 1e-9);
    assert_relative_eq!(tussenwaarde("L_{st}"), 5700.0, max_relative = 1e-9);
    assert_relative_eq!(tussenwaarde("L_{kip}"), 5700.0, max_relative = 1e-9);
}

#[test]
fn r16_kipkromme_c_volgens_tabel_6_5() {
    // IPE 330 is gewalst met h/b = 330/160 = 2,0625 > 2 → tabel 6.5 geeft
    // kipkromme c → tabel 6.3 geeft α_LT = 0,49. χ_LT volgt daaruit; met de
    // oude vaste 0,34 (kromme b) zou χ_LT op ≈ 0,53 uitkomen.
    let lambda_lt = tussenwaarde(r"\bar{\lambda}_{LT}");
    let chi_lt = tussenwaarde(r"\chi_{LT}");
    // Onafhankelijke narekening van 6.3.2.3 (vgl. 6.57) mét α_LT = 0,49,
    // β = 0,75 en λ_LT,0 = 0,4 — de NB-waarden bij dat artikel.
    let phi = 0.5 * (1.0 + 0.49 * (lambda_lt - 0.4) + 0.75 * lambda_lt.powi(2));
    let verwacht = (1.0 / (phi + (phi.powi(2) - 0.75 * lambda_lt.powi(2)).sqrt()))
        .min(1.0)
        .min(1.0 / lambda_lt.powi(2));
    assert_relative_eq!(chi_lt, verwacht, max_relative = 1e-9);
    // En de bronwaarde zelf: χ_LT = 0,480 (2 %).
    assert_relative_eq!(chi_lt, 0.480, max_relative = 2e-2);
}

#[test]
fn r16_kip_unity_check_volgt_de_referentie() {
    // Het ijkpunt van de hele reparatie. Bron: M_cr = 113,90 kNm,
    // λ_LT = 1,288, M_b,Rd = 92,24 kNm, UC = 0,981.
    // Toleranties uit het dossier §1.5: 2 % op grootheden, 0,02 op een UC.
    assert_relative_eq!(tussenwaarde("M_{cr}"), 113.90, max_relative = 2e-2);
    assert_relative_eq!(tussenwaarde(r"\bar{\lambda}_{LT}"), 1.288, max_relative = 2e-2);

    let uc = kip().uc.as_ref().expect("UC");
    assert_relative_eq!(uc.rd, 92.24, max_relative = 2e-2);
    assert!(
        (uc.uc - 0.981).abs() <= 0.02,
        "UC kip = {} moet binnen 0,02 van de referentie 0,981 liggen \
         (vóór de reparatie: 0,850 — 13 procentpunt te gunstig)",
        uc.uc
    );
}

#[test]
fn r16_kip_is_maatgevend() {
    // De bron laat de ligger op kip net voldoen (UC 0,981). Bij ons komt de
    // kip-UC daar vlak boven uit; hij moet in elk geval de maatgevende toets
    // zijn — een dwarskracht-UC van 0,15 of een doorbuiging-UC van 0,51 mag
    // hem niet verdringen.
    let r = run();
    assert_eq!(r.governing_check_id, "6.3.2_ltb");
}
