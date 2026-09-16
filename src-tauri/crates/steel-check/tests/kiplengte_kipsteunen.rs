//! Kiplengte bij kipsteunen: waarom L_kip GROTER is dan de steunafstand.
//!
//! ## Waarom deze test bestaat
//!
//! Een vrij opgelegde stalen ligger met kipsteunen aan de bovenflens op 1/3 en
//! 2/3 krijgt van de kiptoets bij élke overspanning L_kip = 0,467·L: bij
//! L = 6 m 2800 mm, terwijl de steunafstand 2000 mm is. Dat is 1,4 × L/3, en
//! een vaste factor die bij elk profiel en elke overspanning terugkomt oogt als
//! een fout in de veldkeuze. Dat is het niet. Het is de regel van
//! NEN-EN 1993-1-1 NB:2016, bijlage NB.NB, art. NB.NB.4.3:
//!
//! * tussen twee gaffels: L_kip = L_st;
//! * tussen één gaffel en één kipsteun, of tussen twee kipsteunen:
//!   L_kip = (1,4 − 0,8·β)·L_st, met 1,0 ≤ L_kip/L_st ≤ 1,4;
//! * β = M_y,1,Ed / M_y,2,Ed — het eindmoment met de kleinste over dat met de
//!   grootste absolute waarde.
//!
//! In het eindveld [0 ; L/3] is het moment op de gaffel nul, dus β = 0 en
//! L_kip = 1,4·L_st. Het middenveld heeft β = +1 en dus L_kip = L_st, maar het
//! eindveld heeft de laagste M_cr en is maatgevend. Deze test legt dat vast
//! tegen een HANDBEREKENING volgens die regel — niet tegen een opgeslagen
//! uitkomst — en legt vast dat de afleiding de reden uitschrijft, in de
//! deelstap L_kip, in de uitgangspunten (overzicht per veld) en in de notities
//! van de toets zelf.
//!
//! Daarnaast de varianten die bij deze vraag horen: steunen op de kwartpunten,
//! één steun in het midden, een constant moment, windzuiging met steunen aan de
//! onderflens, en een gespiegelde ligger (beide tekenrichtingen).

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_stability::{Deelstap, StabilityCalc};
use steel_check::*;

const L_M: f64 = 6.0;
/// Gelijkmatig verdeelde rekenbelasting, 15 kN/m ≡ 15 N/mm.
const Q: f64 = 15.0;
/// Belasting op de bovenflens: z_a = h/2 van een IPE 300.
const Z_A: f64 = 150.0;

/// De momentenlijn bemonsterd om de 100 mm (61 stations), zodat de
/// veldgrenzen op 2000, 3000 en 4000 mm op een station vallen en de
/// eindmomenten niet door interpolatie tussen stations worden vertroebeld.
fn envelop(m_knm: impl Fn(f64) -> f64) -> Vec<ForcePoint> {
    (0..=60)
        .map(|i| {
            let x_mm = L_M * 1000.0 * i as f64 / 60.0;
            ForcePoint {
                combination_id: 1,
                position_mm: x_mm,
                forces: InternalForces { my_ed: m_knm(x_mm), ..Default::default() },
            }
        })
        .collect()
}

/// M(x) = q·x·(L − x)/2 voor een vrij opgelegde ligger, in kNm (x in mm).
fn veldmoment(x_mm: f64) -> f64 {
    let x = x_mm / 1000.0;
    Q * x * (L_M - x) / 2.0
}

fn ligger(
    m_knm: impl Fn(f64) -> f64,
    q_equiv: f64,
    boven: Vec<f64>,
    onder: Vec<f64>,
) -> BeamCheckResult {
    check_beam(BeamCheckInput {
        beam_id: 1,
        profile_name: "IPE 300".to_string(),
        steel_grade: "S235".to_string(),
        length_m: L_M,
        forces_envelope: envelop(m_knm),
        lateral_bracing: LateralBracing {
            top_flange_positions: boven,
            bottom_flange_positions: onder,
        },
        buckling_length_y_m: L_M,
        buckling_length_z_m: L_M,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: 0.0,
        deflection_notes: vec![],
        q_equiv_n_per_mm: q_equiv,
        z_a_mm: Z_A,
        custom_section: None,
        staafstand: None,
        staafstand_notities: None,
        staafeinden: None,
        staaf_notities: None,
        profile_end: None,
    })
}

fn derdepunten() -> BeamCheckResult {
    ligger(veldmoment, Q, vec![1.0 / 3.0, 2.0 / 3.0], vec![])
}

fn kip(r: &BeamCheckResult) -> &StabilityCalc {
    let c = r
        .checks
        .iter()
        .find(|c| c.id == "6.3.2_ltb")
        .expect("kiptoets 6.3.2_ltb ontbreekt");
    match &c.kind {
        CheckKind::Stability(s) => s,
        CheckKind::Resistance(_) => panic!("de kiptoets hoort een StabilityCalc te zijn"),
    }
}

fn waarde(s: &StabilityCalc, symbool: &str) -> f64 {
    s.intermediate_values
        .iter()
        .find(|v| v.symbol == symbool)
        .unwrap_or_else(|| panic!("tussenwaarde '{symbool}' ontbreekt"))
        .value
}

fn stap<'a>(s: &'a StabilityCalc, id: &str) -> &'a Deelstap {
    s.deelstappen
        .iter()
        .find(|d| d.id == id)
        .unwrap_or_else(|| panic!("deelstap '{id}' ontbreekt"))
}

/// De toelichting "Waarom L_kip groter is dan de steunafstand", als die er is.
fn waarom(notes: &[String]) -> Option<&String> {
    notes.iter().find(|n| n.starts_with("Waarom L_kip groter is dan de steunafstand"))
}

// ── De handberekening ─────────────────────────────────────────────────────────

/// Het veld volgens NB.NB.4, met de hand: IPE 300 uit de catalogus
/// (h = 300, t_f = 10,7 mm, I_z = 6,04·10⁶ mm⁴, I_t = 2,01·10⁵ mm⁴), E = 210 000
/// en G = 80 769 MPa, L_g = 6000 mm. Geen enkele kernfunctie; de C₁- en
/// C₂-waarden zijn de rasterwaarden van figuur NB.NB.5/NB.NB.6 bij B* = 0,85 en
/// 0,90, lineair geïnterpoleerd.
struct Handveld {
    b_ster: f64,
    c1: f64,
    c2: f64,
    l_kip: f64,
    c: f64,
    m_cr: f64,
}

fn handveld(l_st: f64, m1_knm: f64, m2_knm: f64, c1_raster: (f64, f64), c2_raster: (f64, f64)) -> Handveld {
    use std::f64::consts::PI;
    let (e, g, iz, it, h, tf, l_g): (f64, f64, f64, f64, f64, f64, f64) =
        (210_000.0, 80_769.0, 6.04e6, 2.01e5, 300.0, 10.7, 6000.0);
    let beta = m1_knm / m2_knm;
    // NB.NB.4.3(3): B* = 8·M/(8·|M| + q·L_st²), M in N·mm.
    let b_ster = 8.0 * m2_knm * 1e6 / (8.0 * m2_knm.abs() * 1e6 + Q * l_st * l_st);
    let t = (b_ster - 0.85) / 0.05;
    assert!((0.0..=1.0).contains(&t), "B* = {b_ster} valt buiten de rasterkolommen 0,85–0,90");
    let c1 = c1_raster.0 + t * (c1_raster.1 - c1_raster.0);
    let c2_tabel = c2_raster.0 + t * (c2_raster.1 - c2_raster.0);
    // NB.NB.4.3(1): lineair naar het aangrijpingspunt; boven het zwaartepunt negatief.
    let c2 = -c2_tabel * Z_A / ((h - tf) / 2.0);
    // NB.NB.4.3: tussen een gaffel en een kipsteun of tussen twee kipsteunen.
    let l_kip = (1.4 - 0.8 * beta).clamp(1.0, 1.4) * l_st;
    // NB.NB.13 en NB.NB.11.
    let s = h / 2.0 * (e * iz / (g * it)).sqrt();
    let c = PI * c1 * l_g / l_kip
        * ((1.0 + PI * PI * s * s / (l_kip * l_kip) * (c2 * c2 + 1.0)).sqrt() + PI * c2 * s / l_kip);
    // NB.148 met k_red = 1 (h/t_w = 300/7,1 = 42,3 ≤ 75, NB.NB.7).
    let m_cr = c / l_g * (e * iz * g * it).sqrt() * 1e-6;
    Handveld { b_ster, c1, c2, l_kip, c, m_cr }
}

#[test]
fn derdepunten_ipe300_het_eindveld_krijgt_l_kip_1_4_maal_de_steunafstand() {
    // Eindveld [0 ; 2000]: M(0) = 0, M(2000) = 15·2·4/2 = 60 kNm → β = 0.
    //   B* = 8·60·10⁶ / (8·60·10⁶ + 15·2000²) = 480/540 = 0,8889
    //   C₁ = 1,423 + 0,7778·(1,547 − 1,423) = 1,5194       (figuur NB.NB.5, β = 0)
    //   C₂ = −[0,100 + 0,7778·(0,067 − 0,100)]·150/144,65 = −0,07708
    //   L_kip = (1,4 − 0,8·0)·2000 = 2800 mm
    //   S = 150·√(210 000·6,04·10⁶ / (80 769·2,01·10⁵)) = 1325,86 mm
    //   C = 17,1996 → M_cr = 17,1996/6000 · 1,43499·10¹¹ · 10⁻⁶ = 411,35 kNm
    // Middenveld [2000 ; 4000]: M = 60 aan beide einden → β = +1, B* = 0,8889.
    //   C₁ = 1,024 + 0,7778·(1,015 − 1,024) = 1,0170      (figuur NB.NB.5, β = +1)
    //   C₂ = −[0,059 + 0,7778·(0,043 − 0,059)]·150/144,65 = −0,04828
    //   L_kip = max(1,4 − 0,8; 1,0)·2000 = 2000 mm = L_st
    //   C = 21,2014 → M_cr = 507,06 kNm
    // Het eindveld heeft de laagste M_cr (411,35 < 507,06) en is maatgevend.
    //   λ̄_LT = √(628 000·235 / 411,35·10⁶) = 0,59897
    //   h/b = 2,0 ≤ 2 → kromme b, α_LT = 0,34 (tabel 6.5, 6.3)
    //   Φ_LT = 0,5·[1 + 0,34·(0,59897 − 0,4) + 0,75·0,59897²] = 0,66836
    //   χ_LT = 1/(0,66836 + √(0,66836² − 0,75·0,59897²)) = 0,91758
    //   M_b,Rd = 0,91758·628 000·235/1,0 = 135,42 kNm
    //   M_y,Ed = 15·6²/8 = 67,5 kNm → UC = 0,4985
    let eind = handveld(2000.0, 0.0, 60.0, (1.423, 1.547), (0.100, 0.067));
    let midden = handveld(2000.0, 60.0, 60.0, (1.024, 1.015), (0.059, 0.043));
    // De handgetallen hierboven, zodat een typefout in `handveld` zelf opvalt.
    assert_relative_eq!(eind.b_ster, 0.888889, max_relative = 1e-6);
    assert_relative_eq!(eind.c1, 1.519444, max_relative = 1e-6);
    assert_relative_eq!(eind.c2, -0.077083, max_relative = 1e-5);
    assert_relative_eq!(eind.l_kip, 2800.0, max_relative = 1e-12);
    assert_relative_eq!(eind.c, 17.19964, max_relative = 1e-5);
    assert_relative_eq!(eind.m_cr, 411.3549, max_relative = 1e-5);
    assert_relative_eq!(midden.l_kip, 2000.0, max_relative = 1e-12);
    assert_relative_eq!(midden.m_cr, 507.0640, max_relative = 1e-5);
    assert!(eind.m_cr < midden.m_cr, "het eindveld hoort maatgevend te zijn");

    let lambda = (628_000.0 * 235.0 / (eind.m_cr * 1e6)).sqrt();
    let phi = 0.5 * (1.0 + 0.34 * (lambda - 0.4) + 0.75 * lambda * lambda);
    let chi = (1.0 / (phi + (phi * phi - 0.75 * lambda * lambda).sqrt())).min(1.0);
    let m_b_rd = chi * 628_000.0 * 235.0 / 1.0 * 1e-6;
    assert_relative_eq!(lambda, 0.598970, max_relative = 1e-5);
    assert_relative_eq!(chi, 0.917576, max_relative = 1e-5);
    assert_relative_eq!(m_b_rd, 135.4158, max_relative = 1e-5);

    // En dan de kern ertegen.
    let r = derdepunten();
    let s = kip(&r);
    assert_relative_eq!(waarde(s, "L_g"), 6000.0, max_relative = 1e-12);
    assert_relative_eq!(waarde(s, "L_{st}"), 2000.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, "L_{kip}"), 2800.0, max_relative = 1e-9);
    // 1,4 × L/3 = 0,4667·L — de waargenomen vaste fractie.
    assert_relative_eq!(waarde(s, "L_{kip}") / waarde(s, "L_g"), 1.4 / 3.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, r"\beta"), 0.0, epsilon = 1e-9);
    assert_relative_eq!(waarde(s, "B^*"), eind.b_ster, max_relative = 1e-6);
    assert_relative_eq!(waarde(s, "C_1"), eind.c1, max_relative = 1e-6);
    assert_relative_eq!(waarde(s, "C_2"), eind.c2, max_relative = 1e-6);
    assert_relative_eq!(waarde(s, "S"), 1325.864, max_relative = 1e-6);
    assert_relative_eq!(waarde(s, "C"), eind.c, max_relative = 1e-6);
    assert_relative_eq!(waarde(s, "M_{cr}"), eind.m_cr, max_relative = 1e-6);
    assert_relative_eq!(waarde(s, r"\bar{\lambda}_{LT}"), lambda, max_relative = 1e-6);
    assert_relative_eq!(waarde(s, r"\chi_{LT}"), chi, max_relative = 1e-6);
    let uc = s.uc.as_ref().expect("de kiptoets heeft een UC");
    assert_relative_eq!(uc.rd, m_b_rd, max_relative = 1e-6);
    assert_relative_eq!(uc.ed, 67.5, max_relative = 1e-9);
    assert_relative_eq!(uc.uc, 67.5 / m_b_rd, max_relative = 1e-6);
}

#[test]
fn de_afleiding_schrijft_uit_waarom_l_kip_groter_is_dan_de_steunafstand() {
    let r = derdepunten();
    let s = kip(&r);

    // De deelstap L_kip: de formule met β, ingevuld met β = 0 en L_st = 2000.
    let d = stap(s, "l_kip");
    assert_eq!(d.article, "NB.NB.4.3");
    assert!(
        d.ingevuld_latex.contains(r"0{,}8 \cdot 0 \right) \cdot 2000"),
        "de ingevulde regel hoort β = 0 en L_st = 2000 te tonen: {}",
        d.ingevuld_latex
    );
    let tekst = waarom(&d.notes).unwrap_or_else(|| {
        panic!("de deelstap L_kip hoort uit te leggen waarom L_kip > L_st: {:?}", d.notes)
    });
    for deel in [
        "L_kip = 2800 mm tegen L_st = 2000 mm, L_kip/L_st = 1,400.",
        "Dat is de regel van NB.NB.4.3 zelf",
        "L_kip = (1,4 − 0,8·β)·L_st met 1,0 ≤ L_kip/L_st ≤ 1,4",
        "pas gelijk aan L_st bij β ≥ 0,5",
        "van 3)",
        "β = M_y,1,Ed/M_y,2,Ed = 0,000/60,000 = 0,000.",
        "Het moment op die gaffel is nul, dus β = 0 en L_kip = 1,4·L_st",
    ] {
        assert!(tekst.contains(deel), "ontbreekt: {deel:?}\nin: {tekst}");
    }
    // De twee eindvelden zijn gelijkwaardig; welk van beide wint hangt aan de
    // laatste bits. Beide zijn een veld tussen een gaffel en een kipsteun.
    assert!(
        tekst.contains("tussen de gaffel bij het staafbegin en de eerste kipsteun")
            || tekst.contains("tussen de laatste kipsteun en de gaffel bij het staafeind"),
        "{tekst}"
    );

    // Dezelfde tekst staat in de notities van de toets: die toont het rapport
    // ook als de kiptoets niet maatgevend is en de afleiding ontbreekt.
    assert!(
        s.notes.iter().any(|n| n == tekst),
        "de notities van de kiptoets horen dezelfde toelichting te dragen: {:?}",
        s.notes
    );

    // De uitgangspunten: het overzicht per veld, zodat te zien is waarom het
    // eindveld wint van het middenveld met L_kip = L_st.
    let u = stap(s, "uitgangspunten");
    let overzicht = u
        .notes
        .iter()
        .find(|n| n.starts_with("Overzicht per kipveld"))
        .unwrap_or_else(|| panic!("het overzicht per kipveld ontbreekt: {:?}", u.notes));
    for deel in [
        "veld 1: L_st = 2000 mm, β = 0,000, L_kip = 2800 mm, M_cr = 411,4 kNm",
        "veld 2: L_st = 2000 mm, β = 1,000, L_kip = 2000 mm, M_cr = 507,1 kNm",
        "veld 3: L_st = 2000 mm, β = 0,000, L_kip = 2800 mm, M_cr = 411,4 kNm",
        "laagste M_cr",
        "NB.NB.2(1)",
    ] {
        assert!(overzicht.contains(deel), "ontbreekt: {deel:?}\nin: {overzicht}");
    }
}

#[test]
fn zonder_kipsteun_geen_toelichting_en_geen_overzicht() {
    let r = ligger(veldmoment, Q, vec![], vec![]);
    let s = kip(&r);
    assert_relative_eq!(waarde(s, "L_{kip}"), 6000.0, max_relative = 1e-12);
    assert!(waarom(&s.notes).is_none(), "{:?}", s.notes);
    assert!(waarom(&stap(s, "l_kip").notes).is_none());
    assert!(!stap(s, "uitgangspunten").notes.iter().any(|n| n.starts_with("Overzicht per kipveld")));
}

// ── Varianten ─────────────────────────────────────────────────────────────────

#[test]
fn kwartpunten_en_middensteun_volgen_dezelfde_regel() {
    // Kwartpunten [0,25; 0,5; 0,75]: vier velden van 1500 mm. Eindveld:
    // M(0) = 0 → β = 0 → L_kip = 1,4·1500 = 2100 mm = 0,35·L.
    let r = ligger(veldmoment, Q, vec![0.25, 0.5, 0.75], vec![]);
    let s = kip(&r);
    assert_relative_eq!(waarde(s, "L_{st}"), 1500.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, "L_{kip}"), 2100.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, r"\beta"), 0.0, epsilon = 1e-9);
    assert!(waarom(&s.notes).unwrap().contains("van 4)"));

    // Eén steun halverwege: twee velden van 3000 mm, elk tussen een gaffel
    // (M = 0) en de kipsteun → β = 0 → L_kip = 1,4·3000 = 4200 mm = 0,7·L.
    let r = ligger(veldmoment, Q, vec![0.5], vec![]);
    let s = kip(&r);
    assert_relative_eq!(waarde(s, "L_{st}"), 3000.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, "L_{kip}"), 4200.0, max_relative = 1e-9);
    assert!(waarom(&s.notes).unwrap().contains("Het moment op die gaffel is nul"));
}

#[test]
fn bij_een_constant_moment_is_l_kip_gelijk_aan_de_steunafstand() {
    // β = +1 in elk veld → 1,4 − 0,8 = 0,6, afgekapt op de ondergrens 1,0:
    // L_kip = L_st. Met één middensteun is dat 0,5·L_g — de waarde die de
    // opmerking bij figuur NB.NB.3 bij benadering noemt voor een staaf onder
    // constant moment met een kipsteun. De toelichting blijft dan weg.
    let constant = |_x: f64| 50.0;
    for (steunen, l_st) in [(vec![0.5], 3000.0), (vec![1.0 / 3.0, 2.0 / 3.0], 2000.0)] {
        let r = ligger(constant, 0.0, steunen.clone(), vec![]);
        let s = kip(&r);
        assert_relative_eq!(waarde(s, r"\beta"), 1.0, max_relative = 1e-9);
        assert_relative_eq!(waarde(s, "L_{st}"), l_st, max_relative = 1e-9);
        assert_relative_eq!(waarde(s, "L_{kip}"), l_st, max_relative = 1e-9);
        assert!(waarom(&s.notes).is_none(), "steunen {steunen:?}: {:?}", s.notes);
        assert!(waarom(&stap(s, "l_kip").notes).is_none());
    }
}

#[test]
fn windzuiging_steunen_aan_de_onderflens_tellen_aan_de_bovenflens_niet() {
    // Windzuiging: dezelfde lijn met omgekeerd teken (hogging), dus de
    // ONDERflens is gedrukt.
    let zuiging = |x: f64| -veldmoment(x);

    // Steunen aan de onderflens op 1/3 en 2/3: dezelfde regel, L_kip = 2800.
    let r = ligger(zuiging, Q, vec![], vec![1.0 / 3.0, 2.0 / 3.0]);
    let s = kip(&r);
    assert_relative_eq!(waarde(s, "L_{st}"), 2000.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, "L_{kip}"), 2800.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, r"\beta"), 0.0, epsilon = 1e-9);
    let t = waarom(&s.notes).expect("ook bij hogging hoort de toelichting erbij");
    assert!(t.contains("0,000/-60,000 = 0,000"), "{t}");

    // Dezelfde steunen aan de (getrokken) bovenflens tellen niet: één veld van
    // gaffel tot gaffel, L_kip = L_st = L_g, en geen toelichting.
    let r = ligger(zuiging, Q, vec![1.0 / 3.0, 2.0 / 3.0], vec![]);
    let s = kip(&r);
    assert_relative_eq!(waarde(s, "L_{st}"), 6000.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(s, "L_{kip}"), 6000.0, max_relative = 1e-9);
    assert!(waarom(&s.notes).is_none());
}

#[test]
fn beide_tekenrichtingen_geven_dezelfde_kiplengte() {
    // De tekenrichting komt in de kern binnen als een gespiegelde staaf: de
    // frontend spiegelt krachten (x → L − x) en kipsteunfracties (f → 1 − f),
    // zie `referentierichting.ts` en test-tekenrichting.mjs. Hier de kernkant:
    // een ONSYMMETRISCHE momentenlijn (veldlast plus 40 kNm aan één eind) met
    // één steun op 1500 mm, en haar spiegelbeeld met de steun op 4500 mm vanaf
    // het andere eind. Dezelfde fysieke ligger → dezelfde L_kip, β en M_cr.
    let l_mm = L_M * 1000.0;
    let heen = |x: f64| veldmoment(x) + 40.0 * x / l_mm;
    let terug = |x: f64| heen(l_mm - x);

    let a = ligger(heen, Q, vec![0.25], vec![]);
    let b = ligger(terug, Q, vec![0.75], vec![]);
    let (sa, sb) = (kip(&a), kip(&b));
    for sym in ["L_{st}", "L_{kip}", r"\beta", "B^*", "C_1", "C_2", "M_{cr}", r"\chi_{LT}"] {
        assert_relative_eq!(waarde(sa, sym), waarde(sb, sym), max_relative = 1e-9, epsilon = 1e-12);
    }
    assert_relative_eq!(sa.uc.as_ref().unwrap().uc, sb.uc.as_ref().unwrap().uc, max_relative = 1e-9);

    // Handcontrole van de uitkomst: het veld van 1500 mm tegen de gaffel met
    // M = 0 heeft β = 0 en L_kip = 2100; het veld van 4500 mm heeft
    // M(1500) = 50,625 + 10 = 60,625 en M(6000) = 40 kNm, dus
    // β = 40/60,625 = 0,660 → 1,4 − 0,528 = 0,872 → afgekapt op 1,0 →
    // L_kip = 4500 mm. Het lange veld heeft de laagste M_cr.
    assert_relative_eq!(waarde(sa, "L_{st}"), 4500.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(sa, "L_{kip}"), 4500.0, max_relative = 1e-9);
    assert_relative_eq!(waarde(sa, r"\beta"), 40.0 / 60.625, max_relative = 1e-9);
}
