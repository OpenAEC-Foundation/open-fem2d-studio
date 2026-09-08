//! **T en L: wat er anders is dan bij een rechthoek, en wat niet.**
//!
//! Vier dingen moeten hier hard staan:
//!
//! 1. valt de drukzone geheel in de flens, dan is de uitkomst EXACT die van
//!    een rechthoek met de flensbreedte — de klassieke "gedraagt zich als een
//!    rechthoek";
//! 2. valt de drukzone in het lijf, dan is de uitkomst met de hand na te
//!    rekenen, en ligt hij tussen de twee naïeve antwoorden in (rekenen met
//!    de flensbreedte is ONVEILIG, rekenen met de lijfbreedte conservatief);
//! 3. het scheurmoment verschilt voor een positief en een negatief moment,
//!    want een T heeft twee verschillende weerstandsmomenten;
//! 4. spiegelen brengt de flens naar ONDEREN, en dus rekent een negatief
//!    moment met de lijfbreedte in de drukzone.
//!
//! Materiaal overal: C30/37 (f_cd = 20 N/mm², f_ctm = 2,9 N/mm², λ = 0,8,
//! η = 1,0, ε_cu3 = 3,5 ‰) met B500B (f_yd = 434,78 N/mm²).

use approx::assert_relative_eq;
use nen_en_1992_1_1::bending::stress_block;
use nen_en_1992_1_1::section::{mirrored_layers, ConcreteSection, ConcreteShape};
use nen_en_1992_1_1::stiffness::{ei_secant, m_cr_knm, StiffnessOptions};
use nen_en_1992_1_1::{
    concrete_class_by_name, internal_forces, mn_kappa_diagram, reinforcement_grade_by_name,
    DesignMaterial, DesignSituation, MnKappaOptions, NonlinearBasis, RebarLayer, RebarRow,
    ReinforcementCage, SteelBranch,
};

const PI: f64 = std::f64::consts::PI;
const F_CD: f64 = 20.0;
const LAMBDA: f64 = 0.8;
const F_CTM: f64 = 2.9;

fn materiaal() -> DesignMaterial {
    DesignMaterial::new(
        concrete_class_by_name("C30/37").unwrap(),
        reinforcement_grade_by_name("B500B").unwrap(),
        DesignSituation::PersistentTransient,
        SteelBranch::Horizontal,
    )
}

fn stijfheidsmateriaal() -> DesignMaterial {
    DesignMaterial::nonlinear(
        concrete_class_by_name("C30/37").unwrap(),
        reinforcement_grade_by_name("B500B").unwrap(),
        DesignSituation::PersistentTransient,
        SteelBranch::Horizontal,
        NonlinearBasis::MeanValues,
        0.0,
    )
}

fn f_yd() -> f64 {
    500.0 / 1.15
}

fn korf(onder: (u32, f64), boven: (u32, f64)) -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: boven.0, diameter_mm: boven.1 },
        bottom: RebarRow { count: onder.0, diameter_mm: onder.1 },
        ..ReinforcementCage::default()
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 — Drukzone in de flens: exact een rechthoek met de flensbreedte
// ═══════════════════════════════════════════════════════════════════════════

/// Een T met een ruime flens en gewone wapening houdt de neutrale lijn in de
/// flens. Het lijf zit dan geheel in de trekzone en draagt niets — de
/// treksterkte van het beton is verwaarloosd (6.1(2)P) — dus de doorsnede is
/// voor het spanningsblok niet te onderscheiden van een rechthoek b_f × h.
///
/// Dit is `assert_eq!` en geen tolerantie: de gesloten vorm van 3.1.7(3)
/// wordt in beide gevallen met dezelfde breedte en in dezelfde volgorde
/// uitgerekend, dus het antwoord hoort tot op het laatste bit gelijk te zijn.
#[test]
fn drukzone_in_de_flens_is_exact_een_rechthoek_met_de_flensbreedte() {
    let t = ConcreteSection::tee(600.0, 150.0, 250.0, 600.0).unwrap();
    let rechthoek = ConcreteSection::new(600.0, 600.0);
    let m = materiaal();
    let k = korf((3, 16.0), (2, 12.0));
    let lagen = k.layers(600.0);

    let r_t = stress_block(&t, &lagen, &m, 0.0, 1.0).unwrap();
    let r_r = stress_block(&rechthoek, &lagen, &m, 0.0, 1.0).unwrap();

    // De drukzone blijft binnen de flens — dát is de voorwaarde.
    assert!(
        LAMBDA * r_t.x_mm <= 150.0,
        "λ·x = {} mm komt de flens uit; dan geldt deze test niet",
        LAMBDA * r_t.x_mm
    );
    assert_eq!(t.uniform_top_width(LAMBDA * r_t.x_mm), Some(600.0));

    assert_eq!(r_t.x_mm, r_r.x_mm, "x");
    assert_eq!(r_t.f_c_kn, r_r.f_c_kn, "F_c");
    assert_eq!(r_t.z_c_m, r_r.z_c_m, "z_c");
    assert_eq!(r_t.m_rd_knm, r_r.m_rd_knm, "M_Rd");
    println!(
        "T 600/150-250/600: x = {:.2} mm, λ·x = {:.2} mm ≤ h_f = 150 mm, M_Rd = {:.3} kNm \
         (rechthoek 600 × 600: idem)",
        r_t.x_mm,
        LAMBDA * r_t.x_mm,
        r_t.m_rd_knm
    );

    // Het lijf mag dan wél smaller worden zonder dat er iets verandert.
    let smal = ConcreteSection::tee(600.0, 150.0, 150.0, 600.0).unwrap();
    assert_eq!(stress_block(&smal, &lagen, &m, 0.0, 1.0).unwrap().m_rd_knm, r_r.m_rd_knm);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 — Drukzone in het lijf: met de hand nagerekend
// ═══════════════════════════════════════════════════════════════════════════

/// **Handberekening.** T met b_f = 400, h_f = 50, b_w = 200, h = 450 mm,
/// onder 4Ø20, geen bovenwapening, N_Ed = 0, positief moment.
///
/// ```text
///   A_s      = 4·π·10²                        = 1 256,637 mm²
///   d        = 450 − (30 + 8 + 10)            = 402 mm
///   F_s      = A_s·f_yd = 1 256,637·434,783   = 546 363,9 N     (staal vloeit, zie hieronder)
///   A_blok   = F_s/(η·f_cd) = 546 363,9/20    = 27 318,19 mm²   ← krachtenevenwicht
///   flens    = b_f·h_f = 400·50               = 20 000 mm²  < A_blok  ⇒ het blok komt de flens uit
///   lijfdeel = A_blok − 20 000 = 7 318,19 mm² ⇒ diepte 7 318,19/200 = 36,591 mm
///   λ·x      = 50 + 36,591                    = 86,591 mm  ⇒ x = 108,239 mm
///   ε_s      = ε_cu3·(d − x)/x = 3,5‰·(402 − 108,239)/108,239 = 9,50 ‰ > ε_yd = 2,17 ‰  ✓ vloeit
///   d_c      = [20 000·25 + 7 318,19·(50 + 18,295)] / 27 318,19 = 36,598 mm
///   M_Rd     = F_s·(d − d_c) = 546 363,9·(402 − 36,598)         = 199,64 kNm
/// ```
///
/// De arm is hier `d − d_c` omdat bij N_Ed = 0 de betondrukkracht en de
/// staaltrekkracht even groot zijn; het moment om welk punt dan ook is dan
/// het koppel F·z.
#[test]
fn drukzone_in_het_lijf_handberekening() {
    let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let m = materiaal();
    let k = korf((4, 20.0), (0, 0.0));
    let lagen = k.layers(450.0);

    // ── de handberekening, onafhankelijk van de kern ──────────────────────
    let a_s = 4.0 * PI * 10.0 * 10.0;
    let d = 450.0 - (30.0 + 8.0 + 10.0);
    let f_s = a_s * f_yd();
    let a_blok = f_s / F_CD;
    let flens = 400.0 * 50.0;
    assert!(a_blok > flens, "het blok blijft in de flens; dan toetst deze test niets");
    let lijfdiepte = (a_blok - flens) / 200.0;
    let lambda_x = 50.0 + lijfdiepte;
    let x_hand = lambda_x / LAMBDA;
    let d_c = (flens * 25.0 + (a_blok - flens) * (50.0 + lijfdiepte / 2.0)) / a_blok;
    let m_hand = f_s * (d - d_c) * 1e-6;
    let eps_s = 0.0035 * (d - x_hand) / x_hand;

    assert_relative_eq!(a_s, 1256.637, max_relative = 1e-6);
    assert_relative_eq!(f_s, 546_363.9, max_relative = 1e-6);
    assert_relative_eq!(a_blok, 27_318.19, max_relative = 1e-6);
    assert_relative_eq!(lijfdiepte, 36.591, max_relative = 1e-4);
    assert_relative_eq!(lambda_x, 86.591, max_relative = 1e-5);
    assert_relative_eq!(x_hand, 108.239, max_relative = 1e-5);
    assert_relative_eq!(d_c, 36.598, max_relative = 1e-4);
    assert_relative_eq!(m_hand, 199.64, max_relative = 1e-4);
    assert!(eps_s > 0.002174, "het staal vloeit niet: ε_s = {eps_s}");

    // ── de kern ───────────────────────────────────────────────────────────
    let r = stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap();
    assert!(s.uniform_top_width(LAMBDA * r.x_mm).is_none(), "het blok loopt over de bandgrens");
    assert_relative_eq!(r.x_mm, x_hand, max_relative = 1e-9);
    assert_relative_eq!(r.f_c_kn, f_s * 1e-3, max_relative = 1e-9);
    // De arm van F_c om het midden: h/2 − d_c.
    assert_relative_eq!(r.z_c_m, (225.0 - d_c) * 1e-3, max_relative = 1e-9);
    assert_relative_eq!(r.m_rd_knm, m_hand, max_relative = 1e-9);
    assert!(r.layers[0].yields);

    // ── de twee naïeve antwoorden liggen eromheen ─────────────────────────
    let met_flensbreedte =
        stress_block(&ConcreteSection::new(400.0, 450.0), &lagen, &m, 0.0, 1.0).unwrap().m_rd_knm;
    let met_lijfbreedte =
        stress_block(&ConcreteSection::new(200.0, 450.0), &lagen, &m, 0.0, 1.0).unwrap().m_rd_knm;
    println!(
        "T 400/50-200/450, onder 4Ø20:\n  \
         met b_f = 400 overal : {met_flensbreedte:.2} kNm  (ONVEILIG — het lijfdeel te breed)\n  \
         over de banden       : {:.2} kNm  (handberekening {m_hand:.2})\n  \
         met b_w = 200 overal : {met_lijfbreedte:.2} kNm  (conservatief — de flens te smal)",
        r.m_rd_knm
    );
    assert!(r.m_rd_knm < met_flensbreedte, "de flensbreedte overal is niet onveilig?");
    assert!(r.m_rd_knm > met_lijfbreedte, "de lijfbreedte overal is niet conservatief?");
    // Het verschil met de onveilige aanname is klein maar echt; met de
    // conservatieve aanname loopt het op tot ruim 8 %.
    assert!((met_flensbreedte - r.m_rd_knm) / r.m_rd_knm > 5e-3);
    assert!((r.m_rd_knm - met_lijfbreedte) / r.m_rd_knm > 0.08);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — Twee weerstandsmomenten, twee scheurmomenten
// ═══════════════════════════════════════════════════════════════════════════

/// Het zwaartepunt van een T ligt niet op halve hoogte, dus W_onder ≠ W_boven
/// en het scheurmoment verschilt tussen een positief en een negatief moment.
/// Bij een rechthoek zijn ze elkaars tegengestelde; dat is de vergelijking.
///
/// ```text
///   A   = 400·50 + 200·400 = 100 000 mm² ;  z_g = 245 mm
///   I   = 1 880 833 333 mm⁴
///   W_onder = I/245 = 7 676 871 mm³ → M_cr(+) = 2,9·W_onder = 22,26 kNm
///   W_boven = I/205 = 9 174 797 mm³ → M_cr(−) = −2,9·W_boven = −26,61 kNm
/// ```
#[test]
fn scheurmoment_verschilt_voor_positief_en_negatief_moment() {
    let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let i_c = 1_880_833_333.3333333_f64;
    let m_plus = m_cr_knm(&s, F_CTM, 0.0, 1.0);
    let m_min = m_cr_knm(&s, F_CTM, 0.0, -1.0);
    assert_relative_eq!(m_plus, F_CTM * (i_c / 245.0) * 1e-6, max_relative = 1e-12);
    assert_relative_eq!(m_min, -F_CTM * (i_c / 205.0) * 1e-6, max_relative = 1e-12);
    assert_relative_eq!(m_plus, 22.2629, max_relative = 1e-4);
    assert_relative_eq!(m_min, -26.6069, max_relative = 1e-4);
    // NIET elkaars tegengestelde — dat is het hele punt.
    assert!(m_min.abs() > m_plus * 1.15, "{m_plus} vs {m_min}");
    println!("T 400/50-200/450: M_cr(+) = {m_plus:.3} kNm, M_cr(−) = {m_min:.3} kNm");

    // Bij een rechthoek zijn ze wél elkaars tegengestelde.
    let r = ConcreteSection::new(400.0, 450.0);
    assert_eq!(m_cr_knm(&r, F_CTM, 0.0, -1.0), -m_cr_knm(&r, F_CTM, 0.0, 1.0));

    // De normaalkracht zit er in beide richtingen in (σ = N/A_c).
    let met_druk = m_cr_knm(&s, F_CTM, -500.0, 1.0);
    assert_relative_eq!(
        met_druk,
        (F_CTM + 500e3 / 100_000.0) * (i_c / 245.0) * 1e-6,
        max_relative = 1e-12
    );
    assert!(met_druk > m_plus);
}

/// Het verschil in scheurmoment is niet academisch: er is een moment waarbij
/// de doorsnede in de ene richting wél en in de andere niet gescheurd is, en
/// [`ei_secant`] moet dat verschil laten zien (7.4.3(3): ζ = 0 voor
/// ongescheurde doorsneden).
#[test]
fn gescheurd_in_de_ene_richting_en_niet_in_de_andere() {
    let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let m = stijfheidsmateriaal();
    let lagen = korf((4, 20.0), (4, 20.0)).layers(450.0);
    let o = StiffnessOptions::default();
    // M_cr(+) = 22,26 kNm, |M_cr(−)| = 26,61 kNm; 24 kNm ligt ertussenin.
    let plus = ei_secant(&s, &lagen, &m, 0.0, 24.0, &o).unwrap();
    let min = ei_secant(&s, &lagen, &m, 0.0, -24.0, &o).unwrap();
    assert!(plus.cracked, "+24 kNm zou boven M_cr(+) = {:.2} moeten liggen", plus.m_cr_knm);
    assert!(!min.cracked, "−24 kNm zou onder |M_cr(−)| = {:.2} moeten liggen", min.m_cr_knm);
    assert!(plus.tension_stiffening.unwrap().zeta > 0.0);
    assert_relative_eq!(min.tension_stiffening.unwrap().zeta, 0.0);
    println!(
        "M = ±24 kNm: gescheurd (+) = {}, gescheurd (−) = {}; M_cr(+) = {:.2}, M_cr(−) = {:.2} kNm",
        plus.cracked, min.cracked, plus.m_cr_knm, min.m_cr_knm
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 — Spiegelen brengt de flens naar onderen
// ═══════════════════════════════════════════════════════════════════════════

/// Bij een negatief moment drukt de doorsnede op het LIJF en trekt zij aan de
/// flens. Wie alleen de wapening spiegelt en de doorsnede laat staan, rekent
/// de drukzone met de flensbreedte door — en dat is fout, en onveilig.
///
/// De proef: een T met alleen bovenwapening, belast op een negatief moment.
/// De drukzone ligt dan onderin het lijf en blijft daar (λ·x = 136,6 mm, het
/// lijf is 400 mm hoog), dus de uitkomst moet EXACT die van een rechthoek
/// b_w × h zijn — en aantoonbaar niet die van b_f × h.
#[test]
fn spiegelen_zet_de_drukzone_in_het_lijf() {
    let t = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let m = materiaal();
    let lagen = korf((0, 0.0), (4, 20.0)).layers(450.0);

    let r_t = stress_block(&t, &lagen, &m, 0.0, -1.0).unwrap();
    let als_lijf = stress_block(&ConcreteSection::new(200.0, 450.0), &lagen, &m, 0.0, -1.0).unwrap();
    let als_flens = stress_block(&ConcreteSection::new(400.0, 450.0), &lagen, &m, 0.0, -1.0).unwrap();

    // De drukzone blijft binnen het lijf (400 mm hoog).
    assert!(LAMBDA * r_t.x_mm < 400.0, "λ·x = {}", LAMBDA * r_t.x_mm);
    assert_eq!(r_t.m_rd_knm, als_lijf.m_rd_knm, "negatief moment ⇒ lijfbreedte");
    assert_eq!(r_t.f_c_kn, als_lijf.f_c_kn);
    assert!(r_t.m_rd_knm < als_flens.m_rd_knm, "de oude fout zou hier een hogere M_Rd geven");
    println!(
        "T 400/50-200/450, boven 4Ø20, negatief moment: M_Rd = {:.2} kNm (lijf 200 mm) — \
         met de flensbreedte zou er {:.2} kNm uitkomen, {:.1} % te hoog",
        r_t.m_rd_knm,
        als_flens.m_rd_knm,
        100.0 * (als_flens.m_rd_knm / r_t.m_rd_knm - 1.0)
    );

    // En de spiegeling is ook letterlijk wat er gebeurt: het negatieve moment
    // op de T is het positieve moment op de gespiegelde T met de gespiegelde korf.
    let handmatig =
        stress_block(&t.mirrored(), &mirrored_layers(&lagen, 450.0), &m, 0.0, 1.0).unwrap();
    assert_eq!(r_t.m_rd_knm, handmatig.m_rd_knm);
    assert_eq!(r_t.x_mm, handmatig.x_mm);
}

/// Dezelfde spiegeling in de M-N-κ-motor: een T met een SYMMETRISCHE korf
/// draagt een positief moment beter dan een negatief, want de brede flens
/// ligt boven. Bij een rechthoek met dezelfde korf zijn beide gelijk.
#[test]
fn mn_kappa_ziet_de_asymmetrie_van_de_t() {
    let t = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let r = ConcreteSection::new(400.0, 450.0);
    let m = materiaal();
    let o = MnKappaOptions::default();
    let lagen = korf((4, 20.0), (4, 20.0)).layers(450.0);

    let t_plus = mn_kappa_diagram(&t, &lagen, &m, 0.0, 1.0, &o).m_max_knm;
    let t_min = mn_kappa_diagram(&t, &lagen, &m, 0.0, -1.0, &o).m_max_knm;
    let r_plus = mn_kappa_diagram(&r, &lagen, &m, 0.0, 1.0, &o).m_max_knm;
    let r_min = mn_kappa_diagram(&r, &lagen, &m, 0.0, -1.0, &o).m_max_knm;
    println!("T: M_Rd(+) = {t_plus:.2}, M_Rd(−) = {t_min:.2} kNm");
    println!("rechthoek 400 × 450: M_Rd(+) = {r_plus:.2}, M_Rd(−) = {r_min:.2} kNm");
    assert!(t_plus > t_min * 1.015, "{t_plus} vs {t_min}");
    // De symmetrische rechthoek met een symmetrische korf is wél symmetrisch.
    assert_relative_eq!(r_plus, r_min, max_relative = 1e-9);
    // En de positieve richting van de T lijkt op de rechthoek met de
    // flensbreedte (de drukzone zit in de flens), de negatieve niet.
    assert_relative_eq!(t_plus, r_plus, max_relative = 5e-3);
    assert!(t_min < 0.99 * r_min, "{t_min} vs {r_min}");
}

// ═══════════════════════════════════════════════════════════════════════════
// De bandenintegratie zelf
// ═══════════════════════════════════════════════════════════════════════════

/// Analytische controle van de strookintegratie over twee banden: bij een
/// UNIFORME rek is de betondrukkracht exact f_cd·A_c en het moment om het
/// midden exact f_cd·A_c·(z_g − h/2), ongeacht het aantal stroken.
///
/// Dit toetst precies wat de bandenlus toevoegt: dat elke band zijn eigen
/// stroken krijgt en dat het oppervlak van beide banden volledig meetelt.
#[test]
fn bandenintegratie_is_exact_bij_uniforme_rek() {
    let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let m = materiaal();
    let eps_c2 = m.concrete.eps_c2;
    let a_c = 100_000.0;
    let z_g = 245.0;
    for n in [1usize, 2, 3, 7, 50, 400] {
        let fi = internal_forces(&s, &[], &m, eps_c2, 0.0, n);
        assert_relative_eq!(fi.n_c, F_CD * a_c, max_relative = 1e-12);
        assert_relative_eq!(fi.m_c, F_CD * a_c * (z_g - 225.0), max_relative = 1e-12);
    }
}

/// De middelpuntregel blijft kwadratisch convergeren, ook met twee banden:
/// geen enkele strook ligt óver de sprong in b(z) heen. Ligt hij dat wel, dan
/// wordt de fout bij de overgang eerste-orde en zakt de convergentie in.
#[test]
fn bandenintegratie_convergeert_kwadratisch() {
    let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let m = materiaal();
    // Parabolische spanning over de hoogte: rek 0 onder, ε_c2 boven.
    let eps_c2 = m.concrete.eps_c2;
    let referentie = internal_forces(&s, &[], &m, eps_c2 / 2.0, eps_c2 / 450.0, 40_000).n_c;
    println!("stroken   fout N_c [rel]   verhouding   1/(8n²)");
    let mut vorige: Option<f64> = None;
    for n in [10usize, 20, 40, 80, 160, 320] {
        let fout = ((internal_forces(&s, &[], &m, eps_c2 / 2.0, eps_c2 / 450.0, n).n_c - referentie)
            / referentie)
            .abs();
        let rechthoek = 1.0 / (8.0 * (n * n) as f64);
        let verhouding = vorige.map(|v: f64| v / fout).unwrap_or(f64::NAN);
        println!("{n:>7}   {fout:.3e}       {verhouding:.2}     {rechthoek:.3e}");
        if let Some(v) = vorige {
            assert!(fout < v / 3.0, "n = {n}: {fout} tegen {v} — niet kwadratisch");
        }
        // De rechthoek haalt met de middelpuntregel op de parabool precies
        // 1/(8n²). De T mag daar niet noemenswaardig bij achterblijven: bleef
        // er één strook óver de sprong in b(z) heen liggen, dan zou de fout
        // daar eerste-orde worden en deze grens ruim overschrijden.
        assert!(fout < 1.5 * rechthoek, "n = {n}: {fout} tegen 1/(8n²) = {rechthoek}");
        vorige = Some(fout);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// De L
// ═══════════════════════════════════════════════════════════════════════════

/// **De L is de T, plus een aanname.** In dit uniaxiale model levert een L
/// exact dezelfde getallen als een T met dezelfde banden. Dat is geen
/// slordigheid maar een modelgrens, en de kern levert hem als tekst mee zodat
/// elk resultaat en het rapport hem kunnen afdrukken.
#[test]
fn de_l_rekent_als_de_t_en_zegt_dat_erbij() {
    let t = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let l = ConcreteSection::ell(400.0, 50.0, 200.0, 450.0).unwrap();
    let m = materiaal();
    let o = MnKappaOptions::default();
    let lagen: Vec<RebarLayer> = korf((4, 20.0), (2, 12.0)).layers(450.0);

    for sign in [1.0_f64, -1.0] {
        assert_eq!(
            stress_block(&l, &lagen, &m, 0.0, sign).unwrap(),
            stress_block(&t, &lagen, &m, 0.0, sign).unwrap(),
            "spanningsblok, sign = {sign}"
        );
        assert_eq!(
            mn_kappa_diagram(&l, &lagen, &m, -300.0, sign, &o),
            mn_kappa_diagram(&t, &lagen, &m, -300.0, sign, &o),
            "M-N-κ, sign = {sign}"
        );
    }
    assert_eq!(m_cr_knm(&l, F_CTM, 0.0, 1.0), m_cr_knm(&t, F_CTM, 0.0, 1.0));

    // Het etiket verschilt, en de L draagt één aanname méér.
    assert_eq!(l.shape, ConcreteShape::Ell);
    assert_eq!(l.name(), "L 400 x 450 (flens 400 x 50, lijf 200)");
    let aannamen = l.assumptions();
    assert_eq!(aannamen.len(), t.assumptions().len() + 1);
    let l_tekst = aannamen.join(" ");
    assert!(l_tekst.contains("VERHINDERD"), "{l_tekst}");
    assert!(l_tekst.contains("geen apart artikel"), "{l_tekst}");
    assert!(l_tekst.contains("MODELKEUZE"), "{l_tekst}");
    assert!(l_tekst.contains("5.3.2.1(3)"), "{l_tekst}");
    // En de rechthoek draagt er geen enkele.
    assert!(ConcreteSection::new(300.0, 500.0).assumptions().is_empty());
    for a in &aannamen {
        println!("• {a}\n");
    }
}

/// De aannamen moeten niet alleen op de doorsnede te vinden zijn, maar
/// **in elk resultaat staan** — anders kan het rapport ze niet afdrukken en
/// is de L stilzwijgend aangeboden.
#[test]
fn de_aannamen_staan_in_elke_toets() {
    use mechanics::{ForceStateSnapshot, InternalForces};
    use nen_en_1992_1_1::checks::{check_bending_stress_block, check_mn_kappa};

    let m = materiaal();
    let k = korf((4, 20.0), (2, 12.0));
    let snap = ForceStateSnapshot {
        combination_id: 1,
        position_mm: 2500.0,
        forces: InternalForces { n_ed: 0.0, my_ed: 100.0, ..Default::default() },
    };
    let o = MnKappaOptions { n_strips: 20 };

    for (vorm, s) in [
        ("rechthoek", ConcreteSection::new(400.0, 450.0)),
        ("T", ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap()),
        ("L", ConcreteSection::ell(400.0, 50.0, 200.0, 450.0).unwrap()),
    ] {
        let blok = check_bending_stress_block(&s, &k, &m, snap);
        let mnk = check_mn_kappa(&s, &k, &m, &o, true, snap);
        for (route, notes) in [("spanningsblok", &blok.notes), ("M-N-κ", &mnk.calc.notes)] {
            let tekst = notes.join(" ");
            for aanname in s.assumptions() {
                assert!(
                    notes.contains(&aanname),
                    "{vorm}/{route}: de aanname ontbreekt in het resultaat"
                );
            }
            match s.shape {
                ConcreteShape::Rectangle => {
                    assert!(!tekst.contains("MODELKEUZE"), "{vorm}/{route}: {tekst}")
                }
                ConcreteShape::Tee => {
                    assert!(tekst.contains("MODELKEUZE"), "{vorm}/{route}");
                    assert!(!tekst.contains("VERHINDERD"), "{vorm}/{route}");
                }
                ConcreteShape::Ell => assert!(tekst.contains("VERHINDERD"), "{vorm}/{route}"),
            }
        }
        // b_w en h_f staan als variabele in de tabel zodra er een flens is.
        let heeft = |v: &[nen_en_1992_1_1::NamedValue], s: &str| v.iter().any(|n| n.symbol == s);
        assert_eq!(heeft(&blok.variables, "b_w"), s.shape.has_flange(), "{vorm}");
        assert_eq!(heeft(&mnk.calc.variables, "h_f"), s.shape.has_flange(), "{vorm}");
    }
}

/// **De afleiding moet dezelfde x tonen als de toets gebruikt.**
///
/// Voor een rechthoek is x = F/(η·f_cd·b·λ) exact, en die gesloten vorm stond
/// dan ook in de afleiding. Voor een T waarvan het spanningsblok het lijf in
/// loopt, geeft diezelfde uitdrukking met de FLENSBREEDTE een andere x dan de
/// bisectie over de werkelijke meetkunde — en een afleiding die iets anders
/// zegt dan de berekening is erger dan geen afleiding.
///
/// De doorsnede is die van `drukzone_in_het_lijf_handberekening`: T 400/50 —
/// 200/450 met 4Ø20 onder, x = 108,239 mm met de hand.
#[test]
fn de_afleiding_toont_dezelfde_x_als_de_toets() {
    use mechanics::{ForceStateSnapshot, InternalForces};
    use nen_en_1992_1_1::checks::check_bending_stress_block;
    use nen_en_1992_1_1::{Deelstap, ResistanceCalc};

    let m = materiaal();
    let k = korf((4, 20.0), (0, 0.0));
    let snap = ForceStateSnapshot {
        combination_id: 1,
        position_mm: 2500.0,
        forces: InternalForces { n_ed: 0.0, my_ed: 150.0, ..Default::default() },
    };
    let stap = |calc: &ResistanceCalc, id: &str| -> Deelstap {
        calc.deelstappen
            .iter()
            .find(|d| d.id == id)
            .unwrap_or_else(|| panic!("stap {id} ontbreekt"))
            .clone()
    };

    // ── Blok in het lijf: geen gesloten vorm, wel dezelfde x ──────────────
    let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    let r = stress_block(&s, &k.layers(450.0), &m, 0.0, 1.0).unwrap();
    assert!(s.uniform_top_width(LAMBDA * r.x_mm).is_none(), "het blok blijft in de flens");
    assert_relative_eq!(r.x_mm, 108.239, max_relative = 1e-5);

    let calc = check_bending_stress_block(&s, &k, &m, snap);
    let ev = stap(&calc, "evenwicht_x");
    assert_eq!(ev.value, Some(r.x_mm), "de afleiding toont een andere x dan de toets");
    // De formule is de integraal en niet η·f_cd·b·λ·x — er is hier geen b die
    // klopt, dus mag er ook geen in staan.
    assert!(ev.formula_latex.contains(r"A_c(\lambda x)"), "{}", ev.formula_latex);
    assert!(!ev.formula_latex.contains(r"f_{cd} \cdot b \cdot"), "{}", ev.formula_latex);
    // De naïeve gesloten vorm met de flensbreedte zou een ANDERE x geven; dat
    // is precies waarom hij hier niet mag staan.
    let x_naief = k.a_s_bottom_mm2() * f_yd() / (1.0 * F_CD * 400.0 * LAMBDA);
    assert!((x_naief - r.x_mm).abs() > 20.0, "x_naief = {x_naief}, x = {}", r.x_mm);
    let tekst = ev.notes.join(" ");
    assert!(tekst.contains("LOOPT DE FLENS UIT"), "{tekst}");
    assert!(!tekst.contains("de bekende handformule"), "{tekst}");

    // De drukkracht en haar arm zijn die van de toets, niet die van λx/2.
    let fc = stap(&calc, "f_c");
    assert_eq!(fc.value, Some(r.f_c_kn));
    let diepte = 225.0 - r.z_c_m * 1e3;
    assert!(
        (diepte - LAMBDA * r.x_mm / 2.0).abs() > 5.0,
        "het zwaartepunt valt toevallig op λx/2; dan toetst dit niets"
    );
    assert!(fc.notes.join(" ").contains("over twee breedten"), "{:?}", fc.notes);

    // ── Blok in de flens: dan geldt de gesloten vorm wél, met b_f ─────────
    let dun = korf((2, 12.0), (0, 0.0));
    let r2 = stress_block(&s, &dun.layers(450.0), &m, 0.0, 1.0).unwrap();
    assert_eq!(s.uniform_top_width(LAMBDA * r2.x_mm), Some(400.0));
    let calc2 = check_bending_stress_block(&s, &dun, &m, snap);
    let ev2 = stap(&calc2, "evenwicht_x");
    assert_eq!(ev2.value, Some(r2.x_mm));
    assert!(ev2.formula_latex.contains(r"f_{cd} \cdot b \cdot"), "{}", ev2.formula_latex);
    // De breedte in de variabelentabel is de FLENSbreedte, want die ziet het
    // blok — en de gesloten handformule wordt genoemd omdat hij hier klopt.
    assert!(ev2.variables.iter().any(|v| v.symbol == "b" && v.value == 400.0));
    let tekst2 = ev2.notes.join(" ");
    assert!(tekst2.contains("de bekende handformule"), "{tekst2}");
    assert!(tekst2.contains("binnen de gedrukte band"), "{tekst2}");

    // ── Negatief moment: de flens klapt naar onderen, dus het blok ziet het
    //    LIJF. De afleiding moet dan 200 mm noemen en geen 400 mm ──────────
    let neg = ForceStateSnapshot {
        forces: InternalForces { n_ed: 0.0, my_ed: -40.0, ..Default::default() },
        ..snap
    };
    let boven = korf((0, 0.0), (2, 12.0));
    let calc3 = check_bending_stress_block(&s, &boven, &m, neg);
    let ev3 = stap(&calc3, "evenwicht_x");
    let r3 = stress_block(&s, &boven.layers(450.0), &m, 0.0, -1.0).unwrap();
    assert_eq!(ev3.value, Some(r3.x_mm));
    assert!(
        ev3.variables.iter().any(|v| v.symbol == "b" && v.value == 200.0),
        "bij een negatief moment hoort de LIJFbreedte in de afleiding: {:?}",
        ev3.variables
    );
}

/// De korfcontrole en de vormcontrole geven een leesbare fout in plaats van
/// een stil verkeerd getal.
#[test]
fn onmogelijke_invoer_wordt_geweigerd() {
    assert!(ConcreteSection::tee(400.0, 450.0, 200.0, 450.0).is_err());
    let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
    // 8Ø20 = 160 mm past niet in het lijf (200 − 76 = 124 mm binnenmaat),
    // maar wel in de flens (400 − 76 = 324 mm).
    let onder = korf((8, 20.0), (0, 0.0));
    assert!(onder.validate(&s).is_err());
    let boven = korf((0, 0.0), (8, 20.0));
    assert!(boven.validate(&s).is_ok());
}
