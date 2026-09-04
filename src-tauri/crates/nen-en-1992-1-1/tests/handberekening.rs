//! Validatie tegen handberekeningen en analytische uitkomsten, plus de
//! convergentie van de strokenverdeling.
//!
//! Referentiedoorsnede in alle tests: b × h = 300 × 500 mm, C30/37
//! (f_cd = 1,0·30/1,5 = 20 N/mm²; tabel 3.1: ε_c2 = 2,0 ‰, ε_cu2 = ε_cu3 =
//! 3,5 ‰, n = 2), B500B (f_yd = 500/1,15 = 434,78 N/mm², ε_yd = 2,174 ‰),
//! dekking 30 mm, beugel Ø8, onder 3Ø16 (A_s1 = 603,19 mm², d = 454 mm),
//! waar vermeld boven 2Ø12 (A_s2 = 226,19 mm², d₂ = 44 mm).

use approx::assert_relative_eq;
use nen_en_1992_1_1::bending::stress_block;
use nen_en_1992_1_1::mnkappa::{
    axial_compression_capacity_kn, internal_forces, mn_kappa_diagram, solve_state, FailureMode,
    MnKappaOptions,
};
use nen_en_1992_1_1::{
    concrete_class_by_name, reinforcement_grade_by_name, DesignMaterial, DesignSituation,
    RebarLayer, RebarRow, RectConcreteSection, ReinforcementCage, SteelBranch,
};

const PI: f64 = std::f64::consts::PI;

fn materiaal(branch: SteelBranch) -> DesignMaterial {
    DesignMaterial::new(
        concrete_class_by_name("C30/37").unwrap(),
        reinforcement_grade_by_name("B500B").unwrap(),
        DesignSituation::PersistentTransient,
        branch,
    )
}

fn doorsnede() -> RectConcreteSection {
    RectConcreteSection::new(300.0, 500.0)
}

fn korf(boven: u32) -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: boven, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
    }
}

/// Handberekening 1 — momentweerstand van een enkelvoudig gewapende balk met
/// de rechthoekige spanningsverdeling (3.1.7(3)):
///
/// ```text
///   A_s  = 3·π·8² = 603,19 mm²
///   F_s  = A_s·f_yd = 603,19 · 434,78 = 262 255 N
///   x    = F_s / (η·f_cd·b·λ) = 262 255 / (1,0·20·300·0,8) = 54,64 mm
///   ε_s  = ε_cu3·(d − x)/x = 3,5·(454 − 54,64)/54,64 = 25,6 ‰ > ε_yd  → vloeit ✓
///   z    = d − λx/2 = 454 − 0,4·54,64 = 432,15 mm
///   M_Rd = F_s·z = 262 255 · 432,15 = 113,33 kNm
/// ```
#[test]
fn handberekening_1_enkelvoudig_gewapende_balk_spanningsblok() {
    let s = doorsnede();
    let k = korf(0);
    let m = materiaal(SteelBranch::Horizontal);
    let r = stress_block(&s, &k.layers(s.h_mm), &m, 0.0, 1.0).expect("evenwicht");

    let a_s = 3.0 * PI * 8.0_f64.powi(2);
    let f_yd = 500.0 / 1.15;
    let x = a_s * f_yd / (1.0 * 20.0 * 300.0 * 0.8);
    let m_rd = a_s * f_yd * (454.0 - 0.4 * x) * 1e-6;

    assert_relative_eq!(a_s, 603.19, max_relative = 1e-4);
    assert_relative_eq!(x, 54.64, max_relative = 1e-3);
    assert_relative_eq!(m_rd, 113.33, max_relative = 1e-3);

    assert_relative_eq!(r.x_mm, x, max_relative = 1e-6);
    assert_relative_eq!(r.f_c_kn, a_s * f_yd * 1e-3, max_relative = 1e-6);
    assert_relative_eq!(r.m_rd_knm, m_rd, max_relative = 1e-6);
    assert!(r.layers[0].yields);
    assert_relative_eq!(r.layers[0].eps, -0.0035 * (454.0 - x) / x, max_relative = 1e-6);
}

/// Handberekening 2 — punt van het M-N-diagram: zuivere druk (6.1(4), rek
/// begrensd op ε_c2 = 2,0 ‰ over de hele doorsnede). Het staal vloeit dan
/// nét niet (ε_c2 = 2,0 ‰ < ε_yd = 2,174 ‰): σ_s = E_s·ε_c2 = 400 N/mm².
///
/// ```text
///   N_Rd = f_cd·b·h + (A_s1 + A_s2)·σ_s
///        = 20·300·500 + (603,19 + 226,19)·400 = 3 000 000 + 331 752 = 3 331,8 kN
/// ```
#[test]
fn handberekening_2_zuivere_druk() {
    let s = doorsnede();
    let k = korf(2);
    let m = materiaal(SteelBranch::Horizontal);
    let lagen = k.layers(s.h_mm);
    let n_rd = axial_compression_capacity_kn(&s, &lagen, &m, &MnKappaOptions::default());
    let hand = (20.0 * 300.0 * 500.0 + (603.186 + 226.195) * 400.0) * 1e-3;
    assert_relative_eq!(hand, 3331.75, max_relative = 1e-4);
    // Uniforme rek: de strookintegratie is exact, onafhankelijk van het aantal stroken.
    assert_relative_eq!(n_rd, hand, max_relative = 1e-6);
    let n_rd_3 = axial_compression_capacity_kn(&s, &lagen, &m, &MnKappaOptions { n_strips: 3 });
    assert_relative_eq!(n_rd_3, hand, max_relative = 1e-6);

    // Boven N_Rd is het M-κ-diagram leeg: geen evenwicht meer mogelijk.
    let d = mn_kappa_diagram(&s, &lagen, &m, -n_rd * 1.0001, 1.0, &MnKappaOptions::default());
    assert_eq!(d.failure_mode, FailureMode::AxialCapacityExceeded);

    // Bij zuivere druk (κ = 0) is het moment om het midden van de doorsnede
    // NIET nul: de korf is asymmetrisch, het plastisch zwaartepunt ligt onder
    // het midden. Handberekening: beton symmetrisch → 0; staal
    //   boven 2Ø12: 226,19·400 = 90,48 kN op +206 mm → +18,64 kNm
    //   onder 3Ø16: 603,19·400 = 241,27 kN op −204 mm → −49,22 kNm
    //   M(κ = 0) = −30,58 kNm.
    let st = solve_state(&s, &lagen, &m, -n_rd * 0.9999, 0.0, &MnKappaOptions::default()).unwrap();
    let m_hand = (226.195 * 400.0 * 206.0 - 603.186 * 400.0 * 204.0) * 1e-6;
    assert_relative_eq!(m_hand, -30.58, max_relative = 1e-3);
    assert_relative_eq!(st.m_knm, m_hand, max_relative = 2e-3);

    // Net onder N_Rd kan de doorsnede dus geen positief moment dragen: de
    // weerstand voor een positief moment is negatief, de toets meldt dat.
    let d = mn_kappa_diagram(&s, &lagen, &m, -n_rd * 0.999, 1.0, &MnKappaOptions::default());
    println!(
        "M_Rd bij 0,999·N_Rd = {:.2} kNm (om het midden), κ_u = {:.3e} /m, bezwijken {:?}",
        d.m_max_knm, d.kappa_u_per_m, d.failure_mode
    );
    assert_eq!(d.failure_mode, FailureMode::ConcreteCrushing);
    assert!(d.m_max_knm < 0.0 && d.m_max_knm > -32.0);
}

/// Handberekening 3 — punt van het M-N-diagram met de neutrale lijn precies
/// op de onderrand (x = h): ε = 0 onder, ε_cu2 = 3,5 ‰ boven, dus
/// κ = 3,5 ‰ / 500 mm = 7,0·10⁻³ /m.
///
/// Beton (parabool tot z_p = h·ε_c2/ε_cu2 = 285,71 mm, daarboven f_cd):
/// ```text
///   F_c   = f_cd·b·[(2/3)·z_p + (h − z_p)] = 20·300·[190,48 + 214,29] = 2 428,6 kN
///   ∫σz   = f_cd·b·[(5/12)·z_p² + (h² − z_p²)/2] = 20·300·[34 013,6 + 84 183,7] = 709,18·10⁶ Nmm
///   M_c   = ∫σz − F_c·h/2 = 709,18·10⁶ − 607,14·10⁶ = 102,04 kNm (om het midden)
/// ```
/// Staal (rek lineair, druk positief):
/// ```text
///   onder 3Ø16 op z = 46:  ε = 3,5‰·46/500 = 0,322 ‰ → σ = 64,4 N/mm², F = 38,85 kN, arm −204 mm → M = −7,92 kNm
///   boven 2Ø12 op z = 456: ε = 3,192 ‰ > ε_yd → σ = 434,78, F = 98,34 kN, arm +206 mm → M = +20,26 kNm
///   N = 2 428,6 + 38,85 + 98,34 = 2 565,8 kN (druk);  M = 102,04 − 7,92 + 20,26 = 114,38 kNm
/// ```
#[test]
fn handberekening_3_punt_van_het_mn_diagram_x_gelijk_h() {
    let s = doorsnede();
    let k = korf(2);
    let m = materiaal(SteelBranch::Horizontal);
    let lagen = k.layers(s.h_mm);

    // Analytisch.
    let (f_cd, b, h): (f64, f64, f64) = (20.0, 300.0, 500.0);
    let z_p = h * 0.002 / 0.0035;
    let f_c = f_cd * b * (2.0 / 3.0 * z_p + (h - z_p));
    let int_sz = f_cd * b * (5.0 / 12.0 * z_p.powi(2) + (h.powi(2) - z_p.powi(2)) / 2.0);
    let m_c = int_sz - f_c * h / 2.0;
    let a_s1 = 3.0 * PI * 64.0;
    let a_s2 = 2.0 * PI * 36.0;
    let f_s1 = a_s1 * 200_000.0 * (0.0035 * 46.0 / 500.0);
    let f_s2 = a_s2 * 500.0 / 1.15;
    let n_hand = (f_c + f_s1 + f_s2) * 1e-3;
    let m_hand = (m_c + f_s1 * (46.0 - 250.0) + f_s2 * (456.0 - 250.0)) * 1e-6;
    assert_relative_eq!(n_hand, 2565.8, max_relative = 1e-3);
    assert_relative_eq!(m_hand, 114.38, max_relative = 1e-3);

    // Rekenkern: leg N op en de kromming 7,0·10⁻³/m; verwacht exact deze
    // toestand. Met 400 stroken is de integratiefout < 10⁻⁴ (zie de
    // convergentietests); met de standaard van 50 stroken 4·10⁻⁴.
    let fijn = MnKappaOptions { n_strips: 400 };
    let st = solve_state(&s, &lagen, &m, -n_hand, 0.007, &fijn).expect("evenwicht");
    assert_relative_eq!(st.eps_top, 0.0035, max_relative = 1e-4);
    assert!(st.eps_bottom.abs() < 1e-6, "onderrand ε = {}", st.eps_bottom);
    assert_relative_eq!(st.m_knm, m_hand, max_relative = 1e-4);
    assert_relative_eq!(st.x_mm.unwrap(), 500.0, max_relative = 1e-3);
    let st50 = solve_state(&s, &lagen, &m, -n_hand, 0.007, &MnKappaOptions::default()).expect("evenwicht");
    assert_relative_eq!(st50.m_knm, m_hand, max_relative = 6e-4);

    // En dit is ook het bezwijkpunt op het M-κ-diagram bij deze N.
    let d = mn_kappa_diagram(&s, &lagen, &m, -n_hand, 1.0, &MnKappaOptions::default());
    assert_eq!(d.failure_mode, FailureMode::ConcreteCrushing);
    assert_relative_eq!(d.kappa_u_per_m, 0.007, max_relative = 2e-3);
    assert_relative_eq!(d.m_u_knm, m_hand, max_relative = 3e-3);
    println!(
        "handberekening 3: N = {n_hand:.1} kN, M_hand = {m_hand:.2} kNm; kern: M = {:.2} kNm bij κ = {:.4e} /m, M_u = {:.2} kNm",
        st.m_knm, st.kappa_per_m, d.m_u_knm
    );
}

/// De M-N-κ-motor (parabool-rechthoek) en het spanningsblok (rechthoek)
/// geven voor een ondergewapende balk bij N = 0 nagenoeg hetzelfde
/// bezwijkmoment: de arm verschilt maar enkele mm.
#[test]
fn mn_kappa_bij_n_nul_nadert_het_spanningsblok() {
    let s = doorsnede();
    let k = korf(0);
    let m = materiaal(SteelBranch::Horizontal);
    let lagen = k.layers(s.h_mm);
    let blok = stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap().m_rd_knm;
    let d = mn_kappa_diagram(&s, &lagen, &m, 0.0, 1.0, &MnKappaOptions::default());
    assert_relative_eq!(d.m_max_knm, blok, max_relative = 0.02);
    // Het staal vloeit ruim vóór bezwijken; het vloeipunt ligt op het diagram.
    assert!(d.kappa_y_per_m.unwrap() < d.kappa_u_per_m);
    assert!(d.m_y_knm.unwrap() < d.m_max_knm);
    assert!(d.m_y_knm.unwrap() > 0.9 * d.m_max_knm);
    // Met de horizontale tak eindigt het diagram op het beton (ε_cu2) —
    // de staalrek blijft ver onder ε_ud = 45 ‰.
    assert_eq!(d.failure_mode, FailureMode::ConcreteCrushing);
    assert!(d.eps_s_u < 0.045);
}

/// Met de hellende tak (3.2.7(2)a) is de weerstand iets hoger (staal boven
/// f_yd) en gelden dezelfde bezwijkregels.
#[test]
fn hellende_tak_geeft_iets_hogere_weerstand() {
    let s = doorsnede();
    let k = korf(0);
    let lagen = k.layers(s.h_mm);
    let d_h = mn_kappa_diagram(&s, &lagen, &materiaal(SteelBranch::Horizontal), 0.0, 1.0, &MnKappaOptions::default());
    let d_i = mn_kappa_diagram(&s, &lagen, &materiaal(SteelBranch::Inclined), 0.0, 1.0, &MnKappaOptions::default());
    assert!(d_i.m_max_knm > d_h.m_max_knm);
    assert!(d_i.m_max_knm < 1.08 * d_h.m_max_knm);
}

/// Convergentie van de strokenverdeling: analytische integraal van de
/// parabool over de volle hoogte (rek 0 onder, ε_c2 boven):
/// F = (2/3)·f_cd·b·h en M = f_cd·b·h²/12 (om het midden). De fout van de
/// middelpuntregel neemt kwadratisch af.
#[test]
fn stroken_convergentie_analytisch() {
    let s = doorsnede();
    let m = materiaal(SteelBranch::Horizontal);
    let f_exact = 2.0 / 3.0 * 20.0 * 300.0 * 500.0;
    let m_exact = 20.0 * 300.0 * 500.0_f64.powi(2) / 12.0;
    let mut vorige: Option<f64> = None;
    println!("stroken   fout F [rel]   fout M [rel]");
    for n in [2usize, 4, 8, 16, 32, 64, 128, 256] {
        let fi = internal_forces(&s, &[], &m, 0.001, 0.002 / 500.0, n);
        let ef = ((fi.n_c - f_exact) / f_exact).abs();
        let em = ((fi.m_c - m_exact) / m_exact).abs();
        println!("{n:>7}   {ef:.3e}     {em:.3e}");
        // Middelpuntregel op de parabool: fout F = 1/(8n²) exact.
        assert_relative_eq!(ef, 1.0 / (8.0 * (n * n) as f64), max_relative = 1e-6);
        if let Some(v) = vorige {
            // Verdubbeling van n → fout 4× kleiner (kwadratisch).
            assert!(ef < v / 3.0, "n = {n}: {ef} vs vorige {v}");
        }
        vorige = Some(ef);
    }
    // Bij de standaard van 50 stroken: fout in F = 1/(8·50²) = 5·10⁻⁵, in M 4·10⁻⁴.
    let fi = internal_forces(&s, &[], &m, 0.001, 0.002 / 500.0, 50);
    let ef = ((fi.n_c - f_exact) / f_exact).abs();
    let em = ((fi.m_c - m_exact) / m_exact).abs();
    println!("{:>7}   {ef:.3e}     {em:.3e}", 50);
    assert!(ef < 1e-4);
    assert!(em < 5e-4);
}

/// Convergentie van het bezwijkmoment zelf (N = 0, dubbel gewapend) met het
/// aantal stroken; de afwijking ten opzichte van 800 stroken.
#[test]
fn stroken_convergentie_bezwijkmoment() {
    let s = doorsnede();
    let k = korf(2);
    let m = materiaal(SteelBranch::Horizontal);
    let lagen: Vec<RebarLayer> = k.layers(s.h_mm);
    let referentie = mn_kappa_diagram(&s, &lagen, &m, 0.0, 1.0, &MnKappaOptions { n_strips: 800 }).m_max_knm;
    println!("stroken   M_Rd [kNm]   afwijking t.o.v. 800 stroken");
    let mut vorige = f64::INFINITY;
    for n in [5usize, 10, 20, 50, 100, 200, 400] {
        let d = mn_kappa_diagram(&s, &lagen, &m, 0.0, 1.0, &MnKappaOptions { n_strips: n });
        let afw = ((d.m_max_knm - referentie) / referentie).abs();
        println!("{n:>7}   {:>9.3}   {afw:.2e}", d.m_max_knm);
        assert!(afw <= vorige + 1e-9, "afwijking neemt niet af bij n = {n}");
        vorige = afw;
        if n >= 50 {
            assert!(afw < 1e-3, "n = {n}: afwijking {afw}");
        }
    }
}
