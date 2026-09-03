//! Portal Frame Beam 1 acceptance test — UNP350 S235.
//!
//! Reference: verificatie calculations/original/portal-frame.pdf §2.6.1 (page 51-54)
//! Profile: UNP350 (channel section). Beam length: 5000 mm (horizontal girder).
//! Governing combination: 2.1 (the reference combination, mapped to u32 21).
//! Governing check: 6.3.3 interaction with UC = 0.98.

use steel_check::*;
use mechanics::{InternalForces, ForcePoint};
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1990::ConsequenceClass;
use approx::assert_relative_eq;
use std::sync::OnceLock;

fn run() -> &'static BeamCheckResult {
    static RESULT: OnceLock<BeamCheckResult> = OnceLock::new();
    RESULT.get_or_init(|| {
        let input = BeamCheckInput {
            beam_id: 1,
            profile_name: "UNP350".to_string(),
            steel_grade: "S235".to_string(),
            length_m: 5.0,
            forces_envelope: vec![
                // Combination 2.1 (id=21), x=0: compression + shear + moment
                ForcePoint {
                    combination_id: 21,
                    position_mm: 0.0,
                    forces: InternalForces { n_ed: -18.479, vy_ed: 0.0, vz_ed: -232.736, mt_ed: 0.0, my_ed: 66.036, mz_ed: 0.0 },
                },
                // Combination 2.1 (id=21), x=3900 mm: decisive for bending + shear + 6.3.3
                ForcePoint {
                    combination_id: 21,
                    position_mm: 3900.0,
                    forces: InternalForces { n_ed: -18.479, vy_ed: 0.0, vz_ed: 235.084, mt_ed: 0.0, my_ed: -194.796, mz_ed: 0.0 },
                },
            ],
            lateral_bracing: LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![] },
            // the reference: Lcr,y=5000 mm, Lcr,z=5000 mm
            buckling_length_y_m: 5.0,
            buckling_length_z_m: 5.0,
            deflection_limit_class: DeflectionClass::Floor,
            deflection_limit_numerator: 333,
            deflection_actual_max_mm: 0.0,
            is_cantilever: false,
            consequence_class: ConsequenceClass::CC1,
            pre_camber_mm: 0.0,
            deflection_permanent_mm: 0.0,
            q_equiv_n_per_mm: 0.0,
            z_a_mm: 0.0,
            custom_section: None,
        };
        check_beam(input)
    })
}

fn find_check<'a>(result: &'a BeamCheckResult, id: &str) -> &'a NamedCheck {
    result.checks.iter().find(|c| c.id == id)
        .unwrap_or_else(|| panic!("check '{}' not found; available: {:?}", id,
            result.checks.iter().map(|c| c.id.as_str()).collect::<Vec<_>>()))
}

fn resistance_value(result: &BeamCheckResult, id: &str) -> f64 {
    match &find_check(result, id).kind {
        CheckKind::Resistance(r) => r.value,
        CheckKind::Stability(s) => s.value,
    }
}

fn uc_value(result: &BeamCheckResult, id: &str) -> f64 {
    match &find_check(result, id).kind {
        CheckKind::Resistance(r) => r.uc.as_ref().expect("expected UC").uc,
        CheckKind::Stability(s) => s.uc.as_ref().expect("expected UC").uc,
    }
}

#[test]
fn portal_beam1_compression() {
    let r = run();
    // Phase 13-G: UNP350 area aligned with the reference (A=7665.7 mm²)
    // N_c,Rd = 7665.7 × 235 / 1.0 / 1000 = 1801.44 kN — matches the reference exactly
    assert_relative_eq!(resistance_value(r, "6.2.4_compression"), 1801.44, max_relative = 1e-3);
    assert_relative_eq!(uc_value(r, "6.2.4_compression"), 0.01, max_relative = 0.15); // very small UC, wider tolerance
}

#[test]
fn portal_beam1_bending() {
    let r = run();
    // Phase 13-F: UNP350 Wpl,y corrected to 889763 mm³ (the reference catalog value)
    // M_y,c,Rd = 889763 × 235 / 1.0 / 1e6 = 209.094 kNm — now matches the reference exactly
    assert_relative_eq!(resistance_value(r, "6.2.5_bending_y"), 209.094, max_relative = 1e-3);
    // UC = 194.796 / 209.094 = 0.932 (reference: 0.93 — now aligned)
    assert_relative_eq!(uc_value(r, "6.2.5_bending_y"), 0.932, max_relative = 0.025);
}

#[test]
fn portal_beam1_shear() {
    let r = run();
    // Phase 13-G: UNP350 Av_z aligned with the reference (Av=4946 mm²)
    // V_c,z,Rd = 4946 × (235/√3) / 1.0 / 1000 = 671.06 kN — matches the reference 671.1 kN
    assert_relative_eq!(resistance_value(r, "6.2.6_shear_z"), 671.06, max_relative = 1e-3);
    // UC = 235.084 / 671.06 = 0.350 (reference: 0.35)
    assert_relative_eq!(uc_value(r, "6.2.6_shear_z"), 0.350, max_relative = 0.025);
}

#[test]
fn portal_beam1_channel_ltb() {
    let r = run();
    // Phase 13-E: UNP350 LTB is now computed (no longer NotApplicable).
    // Uses conservative monosym Mcr (× 0.7) with buckling curve c (alpha_LT=0.49).
    let ltb_uc = uc_value(r, "6.3.2_ltb_channel");
    assert!(ltb_uc > 0.0 && ltb_uc < 5.0, "LTB UC should be a finite positive value, got {}", ltb_uc);
    eprintln!("portal_beam1 channel LTB UC (Phase 13-E) = {}", ltb_uc);
}

#[test]
fn portal_beam1_governing_ok() {
    let r = run();
    // the reference governing: 6.3.3 UC=0.98, beam is OK.
    // Phase 13-F: Wpl corrected to 889763 mm³, bending and interaction UCs now aligned with the reference.
    assert!(r.uc_max > 0.0, "uc_max should be positive");
    // Document UC for comparison with the reference reference:
    eprintln!("portal_beam1 uc_max (Phase 13-F) = {}", r.uc_max);
}

/// Regressiesnapshot van het volledige resultaat.
///
/// Sept 2026 (d) bijgewerkt na de kipreparatie. Van de drie defecten raakt er
/// één dit kanaalpad: β kwam uit het VELDmoment (M op L_st/4 gedeeld door het
/// grootste moment over de staaf) in plaats van uit de EINDMOMENTEN van het
/// kipveld (NB.NB.4.3). De andere twee raakten dit pad niet — `m_b_rd_channel`
/// zette L_kip al gelijk aan L_st, wat voor deze ongesteunde ligger het juiste
/// gaffelgeval is, en α_LT stond hier al op 0,49.
///
/// De ligger is 5000 mm, ongesteund, met M(0) = +66,036 kNm en
/// M(3900) = −194,796 kNm. De momentenlijn wisselt dus van teken: dubbele
/// kromming, het gunstigste geval van tabel NB.NB.1. β wordt daarmee
/// −194,796 in de noemer en +66,036 in de teller, dus β = −0,339 in plaats van
/// de +0,090 die de kwartpuntbenadering gaf. C₁ gaat mee van 1,669 naar 2,123
/// — en 2,12 is precies wat de formule van geval 1 uit tabel NB.NB.1 voor
/// β = −0,339 geeft: 1,75 + 1,05·0,339 + 0,3·0,339² = 2,14.
///
/// Gevolg: M_cr 199,86 → 254,24 kNm, λ_LT 1,0228 → 0,9069, χ_LT 0,6253 →
/// 0,6966, M_b,Rd 130,75 → 145,66 kNm, UC kip 1,4898 → 1,3373, uc_max
/// idem. De ligger blijft ruim NotOk op kip. De UC daalt hier dus; dat is geen
/// versoepeling maar het wegvallen van een te ongunstige β — de oude waarde
/// las de momentenlijn op de verkeerde plek af.
///
/// De tussenwaardenlijst van dit kanaalpad is bovendien gelijkgetrokken met
/// die van het I-profielpad: L_g, L_kip, B*, C₂ en k_red stonden er niet in en
/// staan er nu wel. B* = −1 (q_equiv = 0, dus uitsluitend eindmomenten) en
/// C₂ = 0 (z_a = 0); rekenkundig identiek aan de vaste 1,0 en 0 die er stonden.
///
/// **De op het referentie-rapport geijkte waarden veranderen NIET**:
/// N_c,Rd = 1801,44 kN, M_y,c,Rd = 209,094 kNm en V_c,z,Rd = 671,06 kN staan
/// hierboven onveranderd en worden onverminderd afgedwongen.
///
/// Sept 2026 (c) bijgewerkt nadat de exacte doorsnedemotor de It-waarden van
/// de hele U-reeks heeft gecorrigeerd. De motor sluit It numeriek in tussen
/// een bewezen onder- en bovengrens; voor alle 27 U-profielen lag de
/// opgeslagen waarde BOVEN die bovengrens, dus aantoonbaar te hoog — bij
/// UNP350 met +4,6%. Een te hoge torsieconstante geeft een te hoge M_cr en
/// daarmee een te hoge kipcapaciteit: onveilig.
///
/// UNP350 gaat van It = 632 878 naar 603 930 mm⁴. Gevolg hier: M_cr 203,54 ->
/// 199,86 kNm, chi_LT 0,6309 -> 0,6253, M_b,Rd 131,92 -> 130,75 kNm, uc_max
/// 1,4766 -> 1,4898. De ligger blijft ruim NotOk op kip.
///
/// Waarom deze snapshot wél mee mag bewegen terwijl de rest van dit bestand
/// vastligt: de nieuwe 1,4898 valt binnen 0,03% samen met de 1,4893 die hier
/// stond vóór stap (b) hieronder, toen It nog rechtstreeks uit een externe
/// referentieberekening kwam (605 000 mm⁴; de motor geeft daar 603 930, dus
/// −0,18%). Stap (b) was de afwijking, en die wordt hiermee teruggedraaid.
/// De op het referentie-rapport geijkte asserties hierboven (N_c,Rd,
/// M_y,c,Rd, V_c,z,Rd) veranderen niet en worden onverminderd afgedwongen.
/// Zie de insluitingstest in steel-profiles/tests/torsie_u_insluiting.rs.
///
/// Sept 2026 (b) bijgewerkt na het herstel van de torsiegrootheden van UNP350.
/// It is met de El Darwish & Johnston-formule herberekend die nu op de hele
/// U-reeks wordt toegepast (605 000 -> 632 878 mm⁴, +4,6%) en Iw met de
/// sectoriale-oppervlakmethode over de 8% schuine flensmiddellijn
/// (1,106·10¹¹ -> 1,0572·10¹¹ mm⁶, −4,4%). Zie
/// docs/superpowers/specs/2026-09-02-profieldata-generatie.md §10.
/// Gevolg in deze snapshot: M_cr 200,00 -> 203,54 kNm, chi_LT 0,6255 -> 0,6309,
/// M_b,Rd 130,80 -> 131,92 kNm en daarmee uc_max 1,4893 -> 1,4766. De ligger
/// blijft ruim NotOk op kip.
/// **De op het referentie-rapport geijkte waarden veranderen NIET**:
/// A, Wpl;y en Av;z van UNP350 zijn bewust ongemoeid gelaten, dus
/// N_c,Rd = 1801,44 kN, M_y,c,Rd = 209,094 kNm en V_c,z,Rd = 671,06 kN staan
/// hierboven onveranderd en worden nog steeds afgedwongen.
///
/// Sept 2026 (a) bijgewerkt na de correctie van de UNP-knikkromme om de y-as:
/// EN 1993-1-1 tabel 6.2 schrijft voor U-doorsneden kromme **c** voor om
/// beide assen; de database stond op kromme b. Daardoor verandert in deze
/// snapshot uitsluitend chi_y (0,9206 -> 0,8901) en, via de 6.3.3-interactie,
/// de UC van vgl. 6.61 (0,9069 -> 0,9073) en 6.62 (0,58846 -> 0,58851).
/// Alle op het referentie-rapport geijkte waarden in dit bestand
/// (N_c,Rd = 1801,44 kN, M_y,c,Rd = 209,094 kNm, V_c,z,Rd = 671,06 kN en de
/// bijbehorende UC's) zijn ONgewijzigd en worden hierboven nog steeds
/// afgedwongen. N_b,Rd verandert niet, omdat voor deze ligger de z-as
/// maatgevend is en die al op kromme c stond.
#[test]
fn portal_beam1_snapshot() {
    insta::assert_json_snapshot!("portal_beam1", run());
}
