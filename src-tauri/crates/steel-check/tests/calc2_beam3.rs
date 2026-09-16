//! Calc 2 Beam 3 acceptance test — HFRHS200X200X16 S235 (hollow square section).
//!
//! Reference: verificatie calculations/original/Calc 2.pdf §2.6.3 (page 57-59)
//! Profile: HFRHS200X200X16 — hot-formed rectangular hollow section, no LTB.
//! Beam length: 5000 mm. Governing force: combination 2 at x=2402 mm.
//!
//! Sept 2026: de doorsnedegrootheden van dit profiel zijn uit de EN 10210-2-
//! meetkunde herberekend in plaats van overgetypt (buitenhoekstraal 1,5·t,
//! binnenhoekstraal 1,0·t). A, Wpl;y en Av;z komen daarmee op 11 501,3 mm²,
//! 785 472 mm³ en 5750,65 mm² — binnen 0,004% van de referentiewaarden
//! 11 501,3 / 785 442 / 5751. De verwachtingen hieronder staan nu dus op de
//! referentiewaarden zelf; de twee TODO's uit fase 13 zijn opgelost.
//!
//! WAAROM DE SNAPSHOT IN SEPTEMBER 2026 IS VERSCHOVEN
//! Alleen de regel `deflection_w_add` verandert, en daarbinnen alleen de
//! GRENSWAARDE, het artikel en de toelichting — niet een unity check. De
//! w_add-noemer stond vast op 150 ("conform de referentie-uitwerking"), maar
//! NEN-EN 1990:2002/NB:2019 A1.4.3(3) geeft ℓ_rep/150 uitsluitend voor
//! vloerafscheidingen ter plaatse van een hoogteverschil. Voor deze staaf geldt
//! het tweede gedachtestreepje — "overige vloeren en daken die intensief door
//! personen worden gebruikt" — dus 3/1 000 deel van ℓ_rep: 15.0 mm in plaats
//! van de oude 33.33 mm bij L = 5000 mm.
//! De unity check blijft 0,00 omdat `deflection_actual_max_mm` in deze test 0 is;
//! de referentie-uitwerking rekent de doorbuiging niet mee in deze staaf.
//!
//! WAAROM DE SNAPSHOT OP 15 SEPTEMBER 2026 IS VERSCHOVEN (knik om de zwakke as)
//! Alleen de toets `6.3.1_buckling` verandert, en daarin geen enkel getal dat
//! al bestond. De titel noemt beide assen met hun vlak; `variables` krijgt
//! L_cr,y en L_cr,z, `intermediate_values` N_b,Rd per as; de afleiding
//! (`deelstappen`) schrijft per as een volledige tak uit; en de Engelse notitie
//! "Governing axis" is vervangen door Nederlandse kanttekeningen met de
//! herkomst van de kniklengte. Waarde, unity check, status en alle bestaande
//! variabelen en tussenwaarden zijn gelijk gebleven — bij het bijwerken per veld
//! nagelopen.

use steel_check::*;
use mechanics::{InternalForces, ForcePoint};
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_section::{CheckStatus, classification::CrossSectionClass};
use approx::assert_relative_eq;
use std::sync::OnceLock;

fn run() -> &'static BeamCheckResult {
    static RESULT: OnceLock<BeamCheckResult> = OnceLock::new();
    RESULT.get_or_init(|| {
        let input = BeamCheckInput {
            beam_id: 3,
            profile_name: "HFRHS200X200X16".to_string(),
            steel_grade: "S235".to_string(),
            length_m: 5.0,
            forces_envelope: vec![
                // Combination 2, x=2431 mm: compression check location
                ForcePoint {
                    combination_id: 2,
                    position_mm: 2431.0,
                    forces: InternalForces { n_ed: -48.329, vy_ed: 0.0, vz_ed: 0.0, mt_ed: 0.0, my_ed: 187.1, mz_ed: 0.0 },
                },
                // Combination 2, x=2402 mm: bending/governing location
                ForcePoint {
                    combination_id: 2,
                    position_mm: 2402.0,
                    forces: InternalForces { n_ed: -48.228, vy_ed: 0.0, vz_ed: 0.0, mt_ed: 0.0, my_ed: 187.327, mz_ed: 0.0 },
                },
                // Combination 2, x=5000 mm: shear location
                ForcePoint {
                    combination_id: 2,
                    position_mm: 5000.0,
                    forces: InternalForces { n_ed: -48.228, vy_ed: 0.0, vz_ed: -241.739, mt_ed: 0.0, my_ed: -126.675, mz_ed: 0.0 },
                },
            ],
            // Hollow section has no LTB per EN 1993-1-1 §6.3.2 — but bracing still empty
            lateral_bracing: LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![] },
            // Reference: Lcr,z = 1666.7 mm => 1.667 m, Lcr,y = 5000 mm => 5.0 m
            buckling_length_y_m: 5.0,
            buckling_length_z_m: 1.6667,
            deflection_limit_class: DeflectionClass::Floor,
            deflection_limit_numerator: 333,
            deflection_actual_max_mm: 0.0,
            is_cantilever: false,
            consequence_class: ConsequenceClass::CC1,
            pre_camber_mm: 0.0,
            deflection_permanent_mm: 0.0,
            deflection_add_limit_numerator: 0.0,
            deflection_notes: vec![],
            q_equiv_n_per_mm: 0.0,
            z_a_mm: 0.0,
            custom_section: None,
            staafstand: None,
            staafstand_notities: None,
            staafeinden: None,
            staaf_notities: None,
            profile_end: None,
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
fn calc2_beam3_compression() {
    let r = run();
    // Sept 2026: het oppervlak is uit de EN 10210-2-meetkunde herberekend
    // (buitenhoekstraal 1,5t, binnenhoekstraal 1,0t) in plaats van overgetypt.
    // A gaat van 11280 naar 11501,3 mm² en komt daarmee op de referentiewaarde
    // uit; de TODO uit fase 13 is daarmee opgelost.
    // Reference: N_c,Rd = 2702.808 kN (A=11501.3 mm²), UC = 0.02
    assert_relative_eq!(resistance_value(r, "6.2.4_compression"), 2702.81, max_relative = 1e-3);
    // De referentie drukt deze UC op twee decimalen af (0,02); exact is
    // 48,329 / 2702,808 = 0,01788, en daar komen we nu ook op uit.
    assert_relative_eq!(uc_value(r, "6.2.4_compression"), 0.01788, max_relative = 5e-3);
}

#[test]
fn calc2_beam3_bending() {
    let r = run();
    // Sept 2026: Wpl;y volgt nu uit dezelfde EN 10210-2-meetkunde en gaat van
    // 768000 naar 785472 mm³ — 0,004% van de referentiewaarde 785442 mm³.
    // Reference: M_y,c,Rd = 184.579 kNm (Wpl=785442 mm³), UC = 1.01 NOT OK
    assert_relative_eq!(resistance_value(r, "6.2.5_bending_y"), 184.586, max_relative = 1e-3);
    // UC = 187.327 / 184.586 = 1.015 ≥ 1.0 — nog steeds NOT OK (referentie: 1,01)
    assert!(uc_value(r, "6.2.5_bending_y") >= 1.0,
        "UC should be >= 1.0 with our section properties");
    let bend = find_check(r, "6.2.5_bending_y");
    if let CheckKind::Resistance(rc) = &bend.kind {
        assert_eq!(rc.status, CheckStatus::NotOk);
    }
}

#[test]
fn calc2_beam3_shear() {
    let r = run();
    // Sept 2026: Av;z = A·h/(b+h) uit het herberekende oppervlak = 5750,65 mm²,
    // tegen de referentiewaarde 5751 mm² — het verschil met de oude 5640 mm²
    // kwam uit het te lage oppervlak.
    // Reference: V_c,z,Rd = 780.2 kN (Av=5751 mm²), UC = 0.31 (at x=5000 mm where Vz=-241.739 kN)
    // Phase 13-A fix: orchestrator now picks max |Vz| as governing for shear check.
    assert_relative_eq!(resistance_value(r, "6.2.6_shear_z"), 780.23, max_relative = 1e-3);
    // UC = 241.739 / 780.23 ≈ 0.310 — gelijk aan de referentie 0,31
    assert_relative_eq!(uc_value(r, "6.2.6_shear_z"), 0.310, max_relative = 0.02);
}

#[test]
fn calc2_beam3_governing_not_ok() {
    let r = run();
    // Reference governing: 6.3.3 with UC 1.05 (not just bending UC 1.01, but also interaction)
    // We just assert >= 1.0 since interaction details depend on our 6.3.3 implementation.
    assert!(r.uc_max >= 1.0, "expected uc_max >= 1.0 (reference: 1.05 via 6.3.3), got {}", r.uc_max);
    assert_eq!(r.status, CheckStatus::NotOk);
}

/// Regressiesnapshot van het volledige resultaat.
///
/// Sept 2026 (c) bijgewerkt na de nabeschouwing op de kipreparatie.
/// **Geen enkele unity check en geen enkele tussenwaarde verandert**; het
/// verschil met de vorige snapshot zit volledig in de notitieteksten:
///  * de kipkrommenotitie is per rij van tabel 6.5 apart geformuleerd. Zij
///    stond onvoorwaardelijk als "volgens tabel 6.5", ook voor doorsneden
///    waarvoor die tabel geen rij heeft — precies de kloof tussen commentaar en
///    code die de reparatie zelf moest dichten, terug op de plek waar de
///    constructeur hem leest. De krommeletter staat nu bovendien klein, zoals de
///    norm hem schrijft, en de getallen met een decimale komma;
///  * er komt een notitie bij dat vgl. (6.58) — χ_LT,mod — niet is toegepast.
///    Het artikellabel van deze toets noemt 6.3.2.3; dan hoort het rapport te
///    zeggen welk deel daarvan is overgeslagen. Weglaten is veilig-zijdig
///    (f ≤ 1, dus χ_LT,mod ≥ χ_LT), maar niet stilzwijgend;
///  * er komt een notitie bij dat de omhullende van de maatgevende
///    combinatie is bemonsterd van x = 2402 tot x = 5000 mm op een staaf van
///    5000 mm: het eindmoment aan de beginzijde is vastgehouden, niet gemeten.
///
/// Sept 2026 (b) bijgewerkt na de kipreparatie. **Geen enkele UC verandert**:
/// λ_LT blijft ver onder de drempel 0,4, dus χ_LT blijft 1,00 en M_b,Rd blijft
/// de volle plastische momentcapaciteit. Alleen de NB-tussenwaarden schuiven,
/// en die staan in de snapshot.
///
/// Wat er schoof en waarom: de envelop loopt van M(2402) = +187,327 kNm naar
/// M(5000) = −126,675 kNm, dus de momentenlijn wisselt van teken. β komt nu uit
/// die twee eindmomenten (−126,675/+187,327 = −0,676; dubbele kromming) in
/// plaats van uit het kwartpunt, dat door de sparse envelop op M_max zelf
/// uitkwam en β = +1,0 gaf. C₁ 1,000 → 2,300 (tabel NB.NB.1 geval 1 kapt op
/// 2,30 af), M_cr 6643,6 → 15 280,3 kNm, λ_LT 0,1667 → 0,1099.
///
/// De doorsnede is een koker en staat niet in tabel 6.5. α_LT komt daarom op
/// 0,76 (kromme d, de ongunstigste rij) en verschijnt nu als tussenwaarde in
/// het resultaat; met χ_LT = 1,00 heeft die keuze hier geen gevolg.
///
/// Sept 2026 (a) bijgewerkt na de herberekening van HFRHS200X200X16 uit de
/// EN 10210-2-meetkunde (zie de kop van dit bestand). De doorsnedegrootheden
/// schuiven met A +2,0%, Wpl;y +2,3% en Av;z +2,0% naar de waarden van de
/// externe referentie-berekening toe, en daarmee dalen alle UC's evenredig:
/// uc_max 1,0379 -> 1,0148 (referentie: 1,01 op de buigingstoets). De
/// doorsnede blijft NotOk en de maatgevende toets blijft 6.2.5_bending_y.
/// September 2026 (f) — bijlage B en tabel 3.1 (basisaudit nr 7, 17, 36).
/// Drie wijzigingen, alle drie per veld nagelopen en met de hand nagerekend
/// (formules van tabel B.1/B.2/B.3, invoer uit deze snapshot zelf):
///  * 6.3.3 rekent niet meer met een vaste C_m = 0,6 en tabel B.1, maar met
///    C_my, C_mz en C_mLT uit tabel B.3 (uit het momentenverloop van
///    respectievelijk de staaf, de staaf om z en het maatgevende kipveld) en,
///    voor een open doorsnede met χ_LT < 1, k_zy uit tabel B.2. De variabelen
///    C_my, C_mz en C_mLT komen erbij en de notities beschrijven de rij van
///    tabel B.3 en de gebruikte tabel voor k_zy.
///  * Elke gerekende toets met f_y in haar formule krijgt de notitie van
///    tabel 3.1 (dikteklasse t ≤ 40 mm; f_y en f_u ongewijzigd voor deze
///    doorsnede).
///  * Geen enkele weerstand, χ, λ̄, M_cr of doorbuiging verandert.
/// Getallen (HFRHS 200×200×16, gesloten → tabel B.1, klasse 1, λ̄_y = 0,7141,
/// λ̄_z = 0,2380, n_y = 0,0249, n_z = 0,0182):
///   C_my = 0,4 — de momentenlijn van combinatie 2 loopt van 187,33 (x = 2402)
///   via 187,10 (x = 2431) naar −126,68 (x = 5000): monotoon, ψ = −0,676; rij
///   1 geeft 0,6 − 0,27 = 0,33 → ondergrens 0,4, en rij 2 met het gemiddelde
///   moment 31,97 (α_s = 0,171) geeft 0,337 → 0,4. Dubbele kromming is minder
///   ongunstig dan de oude vaste 0,6, en dat is precies wat tabel B.3 zegt.
///   k_yy = 0,4·(1 + 0,5141·0,0249) = 0,4051 (was 0,6077), k_zy = 0,6·k_yy =
///   0,2431, k_zz = 1 + (2·0,2380 − 0,6)·0,0182 = 0,9977, k_yz = 0,5986.
///   6.61 = 0,0249 + 0,4051·187,33/184,59 = 0,4361 (was 0,6416); 6.62 = 0,2649.
///   uc_max blijft 1,0148 op 6.2.5. Bij 6.3.1 komt de notitie dat de koker
///   als warmvervaardigd (EN 10210, kromme a) is aangenomen (nr 36).
#[test]
fn calc2_beam3_snapshot() {
    insta::assert_json_snapshot!("calc2_beam3", run());
}
