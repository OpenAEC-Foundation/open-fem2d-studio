//! Knik om de zwakke as: een eigen, na te rekenen tak — met de herkomst van
//! L_cr,z.
//!
//! WAAROM DEZE TEST BESTAAT
//! De kern rekende χ_y en χ_z al, maar leverde één getal (de kleinste
//! knikweerstand) met "Governing axis: z" als Engelse notitie, zonder L_cr in
//! de grootheden en zonder afleiding. En de kniklengte uit het vlak viel stil
//! terug op de staaflengte: de invoerbouwer vulde hem in, de toets wist van
//! niets. Dat is voor knik uit het vlak de gevaarlijkste plek voor een stille
//! aanname, want het vlakke raamwerkmodel ziet die richting nooit.
//!
//! WAT HIER VASTLIGT
//! 1. Een IPE 200-kolom met L_cr,z = 2·L_cr,y: z is maatgevend, en elke stap
//!    van beide takken staat in de afleiding. χ_z en χ_y worden hieronder MET
//!    DE HAND uit tabel 6.1/6.2 en (6.49) nagerekend.
//! 2. Een ligger met kipsteunen: aan één flens verkorten ze L_cr,z niet, aan
//!    boven- én onderflens wel — en dan verandert de toets. Een opgegeven
//!    L_cr,z gaat voor.
//! 3. Zonder opgave valt de kern terug op de staaflengte en ZEGT dat; een
//!    onzinwaarde wordt hardop genegeerd.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_stability::kniklengte::{
    HERKOMST_KIPSTEUNEN, HERKOMST_OPGEGEVEN, HERKOMST_STAAFLENGTE,
};
use nen_en_1993_1_1_stability::{Deelstap, StabilityCalc};
use steel_check::*;

const L_KOLOM_MM: f64 = 4000.0;

/// IPE 200 uit de catalogus: A, i_y en i_z zoals `profiles.json` ze voert.
const A_IPE200: f64 = 2850.0;
const I_Y_IPE200: f64 = 82.504_651_649_829_11;
const I_Z_IPE200: f64 = 22.321_416_040_096_73;
const FY: f64 = 235.0;

/// 21 stations met een constante normaalkracht en een parabolisch moment.
fn envelop(l_mm: f64, n_kn: f64, m_top_knm: f64) -> Vec<ForcePoint> {
    (0..=20)
        .map(|i| {
            let x = l_mm * i as f64 / 20.0;
            ForcePoint {
                combination_id: 1,
                position_mm: x,
                forces: InternalForces {
                    n_ed: n_kn,
                    my_ed: m_top_knm * 4.0 * (x / l_mm) * (1.0 - x / l_mm),
                    ..Default::default()
                },
            }
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn staaf(
    l_mm: f64,
    n_kn: f64,
    m_top_knm: f64,
    l_cr_y_m: f64,
    l_cr_z_m: f64,
    bracing: LateralBracing,
) -> BeamCheckResult {
    check_beam(BeamCheckInput {
        bijlage: Default::default(),
        beam_id: 1,
        profile_name: "IPE 200".to_string(),
        steel_grade: "S235".to_string(),
        length_m: l_mm / 1000.0,
        forces_envelope: envelop(l_mm, n_kn, m_top_knm),
        lateral_bracing: bracing,
        buckling_length_y_m: l_cr_y_m,
        buckling_length_z_m: l_cr_z_m,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: 0.0,
        deflection_notes: vec![],
        q_equiv_n_per_mm: 8.0 * m_top_knm * 1e6 / (l_mm * l_mm),
        z_a_mm: 100.0,
        custom_section: None,
        staafstand: None,
        staafstand_notities: None,
        staafeinden: None,
        staaf_notities: None,
        profile_end: None,
    })
}

fn knik(r: &BeamCheckResult) -> &StabilityCalc {
    let c = r
        .checks
        .iter()
        .find(|c| c.id == "6.3.1_buckling")
        .expect("6.3.1_buckling hoort in de lijst te staan");
    let CheckKind::Stability(s) = &c.kind else { panic!("knik is een stabiliteitstoets") };
    s
}

fn stap<'a>(s: &'a StabilityCalc, id: &str) -> &'a Deelstap {
    s.deelstappen.iter().find(|d| d.id == id).unwrap_or_else(|| {
        panic!(
            "stap {id} ontbreekt; wel aanwezig: {:?}",
            s.deelstappen.iter().map(|d| d.id.as_str()).collect::<Vec<_>>()
        )
    })
}

fn waarde(s: &StabilityCalc, id: &str) -> f64 {
    stap(s, id).value.unwrap_or_else(|| panic!("stap {id} heeft geen uitkomst"))
}

fn herkomst(s: &StabilityCalc, id: &str) -> String {
    stap(s, id).notes[0].clone()
}

/// (6.50): λ₁ = π·√(E/f_y), met E = 210 000 N/mm².
fn lambda_1() -> f64 {
    std::f64::consts::PI * (210_000.0_f64 / FY).sqrt()
}

/// De tak van één as met de hand: λ̄ (6.50), Φ en χ (6.49), N_b,Rd (6.47).
fn tak_met_de_hand(l_cr_mm: f64, i_mm: f64, alpha: f64) -> (f64, f64, f64, f64) {
    let lb = l_cr_mm / (i_mm * lambda_1());
    let phi = 0.5 * (1.0 + alpha * (lb - 0.2) + lb * lb);
    let chi = (1.0 / (phi + (phi * phi - lb * lb).sqrt())).min(1.0);
    let n_b_rd_kn = chi * A_IPE200 * FY / 1.0 * 1e-3;
    (lb, phi, chi, n_b_rd_kn)
}

#[test]
fn kolom_ipe200_knikt_om_z_en_de_afleiding_toont_beide_takken() {
    // L_cr,y = 2 m en L_cr,z = 4 m: L_cr,z = 2·L_cr,y.
    let r = staaf(L_KOLOM_MM, -100.0, 0.0, 2.0, 4.0, LateralBracing::default());
    let s = knik(&r);

    // ── De handberekening ──────────────────────────────────────────────────
    // IPE 200: h/b = 200/100 = 2 > 1,2 en t_f = 8,5 mm ≤ 40 mm, dus tabel 6.2
    // (gewalste profielen, S 235): knikkromme a om y-y en b om z-z. Tabel 6.1:
    // α = 0,21 en 0,34. γ_M1 = 1,0.
    //
    // λ₁ = π·√(210 000/235) = 93,913
    assert_relative_eq!(lambda_1(), 93.913, max_relative = 1e-4);
    // Om z: λ̄_z = 4000/(22,321·93,913) = 1,9081
    //       Φ_z = 0,5·[1 + 0,34·(1,9081 − 0,2) + 1,9081²] = 2,6109
    //       χ_z = 1/(2,6109 + √(2,6109² − 1,9081²)) = 0,2276
    //       N_b,Rd,z = 0,2276·2850·235/1,0 = 152,46 kN
    let (lb_z, phi_z, chi_z, n_z) = tak_met_de_hand(4000.0, I_Z_IPE200, 0.34);
    assert_relative_eq!(lb_z, 1.9081, max_relative = 1e-4);
    assert_relative_eq!(phi_z, 2.6109, max_relative = 1e-4);
    assert_relative_eq!(chi_z, 0.2276, max_relative = 2e-4);
    assert_relative_eq!(n_z, 152.46, max_relative = 1e-4);
    // Om y: λ̄_y = 2000/(82,505·93,913) = 0,2581 → Φ_y = 0,5394 → χ_y = 0,9871
    //       → N_b,Rd,y = 661,11 kN
    let (lb_y, phi_y, chi_y, n_y) = tak_met_de_hand(2000.0, I_Y_IPE200, 0.21);
    assert_relative_eq!(lb_y, 0.2581, max_relative = 2e-4);
    assert_relative_eq!(phi_y, 0.5394, max_relative = 2e-4);
    assert_relative_eq!(chi_y, 0.9871, max_relative = 1e-4);
    assert_relative_eq!(n_y, 661.11, max_relative = 1e-4);

    // ── De kern schrijft precies die keten op ─────────────────────────────
    assert_eq!(waarde(s, "l_cr_y"), 2000.0);
    assert_eq!(waarde(s, "l_cr_z"), 4000.0);
    assert_eq!(waarde(s, "l_cr_z"), 2.0 * waarde(s, "l_cr_y"));
    assert_relative_eq!(waarde(s, "i_z"), I_Z_IPE200, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "lambda_bar_z"), lb_z, max_relative = 1e-12);
    assert_eq!(waarde(s, "kromme_z"), 0.34);
    assert_eq!(waarde(s, "kromme_y"), 0.21);
    assert!(stap(s, "kromme_z").formula_latex.contains("knikkromme b"));
    assert_relative_eq!(waarde(s, "phi_z"), phi_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "chi_z"), chi_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "n_b_rd_z"), n_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "uc_z"), 100.0 / n_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "lambda_bar_y"), lb_y, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "chi_y"), chi_y, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "n_b_rd_y"), n_y, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "uc_y"), 100.0 / n_y, max_relative = 1e-12);

    // Beide takken zijn volledig, in de volgorde van de norm, en de laatste
    // stap zet ze tegen elkaar.
    let ids: Vec<&str> = s.deelstappen.iter().map(|d| d.id.as_str()).collect();
    for a in ["y", "z"] {
        let posities: Vec<usize> = ["l_cr", "i", "lambda_bar", "kromme", "phi", "chi", "n_b_rd", "uc"]
            .iter()
            .map(|k| {
                let id = format!("{k}_{a}");
                ids.iter()
                    .position(|i| *i == id)
                    .unwrap_or_else(|| panic!("{id} ontbreekt in {ids:?}"))
            })
            .collect();
        assert!(posities.windows(2).all(|w| w[0] < w[1]), "tak {a} niet op volgorde: {ids:?}");
    }
    assert_eq!(ids.last(), Some(&"maatgevend"));

    // z is maatgevend, en dat staat erbij — ook buiten de afleiding.
    assert_relative_eq!(s.value, n_z, max_relative = 1e-12);
    assert_relative_eq!(s.uc.as_ref().unwrap().uc, 100.0 / n_z, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "maatgevend"), n_z, max_relative = 1e-12);
    assert!(stap(s, "maatgevend").notes[0].contains("z-as (uit het vlak)"));
    assert!(
        s.notes.iter().any(|n| n.starts_with("Om de z-as (uit het vlak): L_cr,z = 4000 mm (opgegeven)")),
        "{:?}",
        s.notes
    );
    assert!(s.title.contains("om z (uit het vlak)"), "{}", s.title);

    // Herkomst en vlak in de kniklengtestap.
    assert_eq!(herkomst(s, "l_cr_z"), format!("Herkomst: {HERKOMST_OPGEGEVEN}."));
    assert!(stap(s, "l_cr_z").notes.iter().any(|n| n.contains("UIT het vlak") && n.contains("nooit")));
    assert!(stap(s, "l_cr_y").notes.iter().any(|n| n.contains("IN het vlak") && n.contains("5.2.2(7)")));

    // De gebruikte kniklengten staan bij de grootheden, zodat ze ook zonder de
    // afleiding te lezen zijn (de PDF toont bij een niet-maatgevende toets
    // alleen de grootheden en de kanttekeningen).
    assert!(s.variables.iter().any(|v| v.symbol == "L_{cr,y}" && v.value == 2000.0));
    assert!(s.variables.iter().any(|v| v.symbol == "L_{cr,z}" && v.value == 4000.0));
}

#[test]
fn kipsteunen_aan_een_flens_verkorten_lcr_z_niet_aan_beide_flenzen_wel() {
    let l = 6000.0;
    let derde = vec![1.0 / 3.0, 2.0 / 3.0];
    let alleen_boven = staaf(l, -60.0, 20.0, 0.0, 0.0, LateralBracing {
        top_flange_positions: derde.clone(),
        bottom_flange_positions: vec![],
    });
    let beide = staaf(l, -60.0, 20.0, 0.0, 0.0, LateralBracing {
        top_flange_positions: derde.clone(),
        bottom_flange_positions: derde.clone(),
    });
    let opgegeven = staaf(l, -60.0, 20.0, 0.0, 3.0, LateralBracing {
        top_flange_positions: derde.clone(),
        bottom_flange_positions: derde.clone(),
    });

    // (a) Gordingen op alleen de bovenflens: goed voor de kip, niet voor knik
    //     om z. De staaflengte blijft, en de afleiding zegt waarom.
    let s_a = knik(&alleen_boven);
    assert_eq!(waarde(s_a, "l_cr_z"), 6000.0);
    assert_eq!(herkomst(s_a, "l_cr_z"), format!("Herkomst: {HERKOMST_STAAFLENGTE}."));
    assert!(
        stap(s_a, "l_cr_z").notes.iter().any(|n| n.contains("alleen de bovenflens (2)")),
        "{:?}",
        stap(s_a, "l_cr_z").notes
    );

    // (b) Boven- én onderflens gesteund op 1/3 en 2/3: drie velden van 2000 mm.
    let s_b = knik(&beide);
    assert_relative_eq!(waarde(s_b, "l_cr_z"), 2000.0, max_relative = 1e-12);
    assert_eq!(herkomst(s_b, "l_cr_z"), format!("Herkomst: {HERKOMST_KIPSTEUNEN}."));
    assert!(stap(s_b, "l_cr_z").ingevuld_latex.contains(r"\max"));
    assert!(stap(s_b, "l_cr_z").notes.iter().any(|n| n.contains("REGEL") && n.contains("6.3.5.2(2)")));

    // De handberekening van beide gevallen om z (kromme b, α = 0,34):
    //  6000 mm: λ̄_z = 2,8622 → Φ_z = 5,0488 → χ_z = 0,1086 → N_b,Rd,z = 72,74 kN
    //  2000 mm: λ̄_z = 0,9541 → Φ_z = 1,0833 → χ_z = 0,6264 → N_b,Rd,z = 419,52 kN
    let (_, _, chi_6000, n_6000) = tak_met_de_hand(6000.0, I_Z_IPE200, 0.34);
    let (_, _, chi_2000, n_2000) = tak_met_de_hand(2000.0, I_Z_IPE200, 0.34);
    assert_relative_eq!(chi_6000, 0.1086, max_relative = 5e-4);
    assert_relative_eq!(n_6000, 72.74, max_relative = 1e-4);
    assert_relative_eq!(chi_2000, 0.6264, max_relative = 2e-4);
    assert_relative_eq!(n_2000, 419.52, max_relative = 1e-4);
    assert_relative_eq!(waarde(s_a, "n_b_rd_z"), n_6000, max_relative = 1e-12);
    assert_relative_eq!(waarde(s_b, "n_b_rd_z"), n_2000, max_relative = 1e-9);

    // De toets verandert: UC gaat van 60/72,7 = 0,825 naar 60/419,5 = 0,143.
    let uc_a = s_a.uc.as_ref().unwrap().uc;
    let uc_b = s_b.uc.as_ref().unwrap().uc;
    assert_relative_eq!(uc_a, 60.0 / n_6000, max_relative = 1e-12);
    assert_relative_eq!(uc_b, 60.0 / n_2000, max_relative = 1e-9);
    assert!(uc_b < 0.2 * uc_a, "uc {uc_a} → {uc_b}");

    // (c) Een opgegeven L_cr,z gaat voor, en de afleiding noemt wat de steunen
    //     hadden gegeven.
    let s_c = knik(&opgegeven);
    assert_eq!(waarde(s_c, "l_cr_z"), 3000.0);
    assert_eq!(herkomst(s_c, "l_cr_z"), format!("Herkomst: {HERKOMST_OPGEGEVEN}."));
    assert!(stap(s_c, "l_cr_z").notes.iter().any(|n| n.contains("uit de kipsteunen gevolgd: 2000 mm")));
}

#[test]
fn zonder_opgave_valt_de_kern_hoorbaar_terug_op_de_staaflengte() {
    let r = staaf(L_KOLOM_MM, -100.0, 0.0, 0.0, 0.0, LateralBracing::default());
    let s = knik(&r);
    for a in ["y", "z"] {
        assert_eq!(waarde(s, &format!("l_cr_{a}")), L_KOLOM_MM);
        assert_eq!(herkomst(s, &format!("l_cr_{a}")), format!("Herkomst: {HERKOMST_STAAFLENGTE}."));
    }
    assert!(
        s.notes.iter().any(|n| n.contains("L_cr,z = 4000 mm (staaflengte (terugval))")),
        "{:?}",
        s.notes
    );

    // De terugval verandert alleen de tekst, niet de getallen: dezelfde staaf
    // met de staaflengte expliciet opgegeven geeft exact dezelfde weerstand.
    let expliciet = staaf(L_KOLOM_MM, -100.0, 0.0, 4.0, 4.0, LateralBracing::default());
    assert_eq!(knik(&expliciet).value, s.value);

    // Een onzinwaarde wordt niet stil een knikweerstand zonder knikreductie.
    let fout = staaf(L_KOLOM_MM, -100.0, 0.0, 0.0, -1.0, LateralBracing::default());
    let s_f = knik(&fout);
    assert_eq!(waarde(s_f, "l_cr_z"), L_KOLOM_MM);
    assert!(stap(s_f, "l_cr_z").notes.iter().any(|n| n.contains("genegeerd")));
}
