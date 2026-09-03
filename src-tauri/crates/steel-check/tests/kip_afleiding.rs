//! De kipafleiding zoals het rapport haar toont: de NB-keten als uitgeschreven
//! stappen in plaats van als een rij losse getallen.
//!
//! Wat deze test bewaakt, en waarom elk stuk ervan er staat:
//!
//!  * **Dat de keten compleet is en in de goede volgorde staat.** Een
//!    ontbrekende stap valt in het rapport niet op — de lezer ziet gewoon een
//!    keten die van B* naar M_cr springt — maar maakt de afleiding
//!    onnavolgbaar. De volgorde is die van de norm: eerst de uitgangspunten,
//!    dan de grootheden die van elkaar afhangen, dan χ_LT.
//!  * **Dat elke stap zijn vindplaats draagt.** Een formule zonder artikel- of
//!    vergelijkingsnummer is in een normrapport waardeloos.
//!  * **Dat de getoonde uitkomsten de GEREKENDE uitkomsten zijn.** Dit is de
//!    scherpste assertie van het stel: elke stapwaarde wordt vergeleken met de
//!    tussenwaarde van dezelfde grootheid, op bit-niveau. Een deelstap die zijn
//!    eigen som zou gaan maken — en daarmee van de kern zou kunnen afdrijven —
//!    valt hier onmiddellijk om.
//!  * **Dat de ingevulde regel werkelijk ingevuld is.** Een regel die nog een
//!    symbool bevat, is een halve tussenstap: het rapport toont dan een formule
//!    die niet in getallen overgaat.
//!
//! Draai met `-- --nocapture` om de keten uitgeschreven te zien.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_stability::{Deelstap, StabilityCalc};
use steel_check::*;

// ── Casussen ──────────────────────────────────────────────────────────────────

/// R16 — vrij opgelegde, zijdelings ongesteunde IPE 330 van 5,70 m onder
/// gelijkmatig verdeelde belasting. Het ijkgeval van de kipreparatie: één
/// kipveld tussen twee gaffels, β = 0, B* = 0.
const L_M: f64 = 5.7;
const M_MAX_KNM: f64 = 90.473;
const Q_N_PER_MM: f64 = 8.0 * M_MAX_KNM / (L_M * L_M);

fn envelop(l_m: f64, q_n_per_mm: f64, combo: u32) -> Vec<ForcePoint> {
    (0..21)
        .map(|i| {
            let x_m = l_m * i as f64 / 20.0;
            let my = q_n_per_mm * x_m * (l_m - x_m) / 2.0;
            ForcePoint {
                combination_id: combo,
                position_mm: x_m * 1000.0,
                forces: InternalForces {
                    my_ed: my,
                    vz_ed: q_n_per_mm * (l_m / 2.0 - x_m),
                    ..Default::default()
                },
            }
        })
        .collect()
}

fn invoer(profiel: &str, l_m: f64, q: f64, steunen: Vec<f64>, z_a_mm: f64) -> BeamCheckInput {
    BeamCheckInput {
        beam_id: 1,
        profile_name: profiel.to_string(),
        steel_grade: "S235".to_string(),
        length_m: l_m,
        forces_envelope: envelop(l_m, q, 1),
        lateral_bracing: LateralBracing {
            top_flange_positions: steunen,
            bottom_flange_positions: vec![],
        },
        buckling_length_y_m: l_m,
        buckling_length_z_m: l_m,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: -8.79,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        q_equiv_n_per_mm: q,
        z_a_mm,
        custom_section: None,
    }
}

/// Eén kipveld, van gaffel tot gaffel.
fn r16() -> BeamCheckResult {
    check_beam(invoer("IPE 330", L_M, Q_N_PER_MM, vec![], 165.0))
}

/// Drie kipvelden: twee kipsteunen op de derdepunten, zodat de β-tak van
/// NB.NB.4.3 geldt in plaats van het gaffelgeval.
fn met_kipsteunen() -> BeamCheckResult {
    check_beam(invoer(
        "HEA 320",
        8.0,
        8.115,
        vec![1.0 / 3.0, 2.0 / 3.0],
        155.0,
    ))
}

/// Het kanaalpad: een U-profiel, met de M_cr-vorm die buiten de norm om gaat.
fn kanaal() -> BeamCheckResult {
    check_beam(invoer("UNP350", 5.0, 10.0, vec![], 175.0))
}

/// Een gelaste ligger met een slank lijf, om de NB.NB.8-tak van k_red te
/// bereiken.
///
/// Waarom inline en niet uit de catalogus: geen enkel catalogusprofiel haalt
/// h/t_w > 75 — de slankste is een HEA 1000 met 60. De tak NB.NB.8, en daarmee
/// de hele α-stap van NB.NB.9, is uit de catalogus dus onbereikbaar. Een
/// gelaste plaatligger is precies het geval waarvoor die tak bestaat.
///
/// 900 × 10 lijf met flenzen 400 × 25 geeft h = 950 mm en h/t_w = 95. De
/// overspanning stuurt α: α = h·t_f·10¹²/(t_w³·b·L_g²), dus korter is slanker
/// gerekend.
fn gelaste_ligger(l_m: f64, q: f64) -> BeamCheckResult {
    let (hw, tw, bf, tf) = (900.0, 10.0, 400.0, 25.0);
    let z = hw / 2.0 + tf / 2.0;
    let mut input = invoer("gelast", l_m, q, vec![], (hw + 2.0 * tf) / 2.0);
    input.custom_section = Some(CustomSection {
        naam: "Gelaste ligger 900x10 + 400x25".to_string(),
        lamellen: vec![
            CustomLamella { b_mm: hw, t_mm: tw, y_mm: 0.0, z_mm: 0.0, alpha_rad: std::f64::consts::FRAC_PI_2 },
            CustomLamella { b_mm: bf, t_mm: tf, y_mm: 0.0, z_mm: -z, alpha_rad: 0.0 },
            CustomLamella { b_mm: bf, t_mm: tf, y_mm: 0.0, z_mm: z, alpha_rad: 0.0 },
        ],
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    });
    check_beam(input)
}

// ── Hulpjes ───────────────────────────────────────────────────────────────────

fn kip(r: &BeamCheckResult) -> &StabilityCalc {
    let id = if r.checks.iter().any(|c| c.id == "6.3.2_ltb_channel") {
        "6.3.2_ltb_channel"
    } else {
        "6.3.2_ltb"
    };
    let check = r
        .checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("kiptoets '{id}' ontbreekt"));
    match &check.kind {
        CheckKind::Stability(s) => s,
        CheckKind::Resistance(_) => panic!("{id} hoort een StabilityCalc te zijn"),
    }
}

fn stap<'a>(s: &'a StabilityCalc, id: &str) -> &'a Deelstap {
    s.deelstappen
        .iter()
        .find(|d| d.id == id)
        .unwrap_or_else(|| {
            panic!(
                "deelstap '{id}' ontbreekt; aanwezig: {:?}",
                s.deelstappen.iter().map(|d| d.id.as_str()).collect::<Vec<_>>()
            )
        })
}

fn ids(s: &StabilityCalc) -> Vec<&str> {
    s.deelstappen.iter().map(|d| d.id.as_str()).collect()
}

fn tussenwaarde(s: &StabilityCalc, symbool: &str) -> f64 {
    s.intermediate_values
        .iter()
        .find(|v| v.symbol == symbool)
        .unwrap_or_else(|| panic!("tussenwaarde '{symbool}' ontbreekt"))
        .value
}

/// Schrijft de keten uit zoals het rapport haar zal tonen. Zichtbaar met
/// `cargo test ... -- --nocapture`.
fn toon(naam: &str, s: &StabilityCalc) {
    println!("\n══ {naam} — {} ══", s.title);
    for d in &s.deelstappen {
        println!("\n  {}   [{}]", d.titel, d.article);
        if !d.formula_latex.is_empty() {
            println!("    {}", d.formula_latex);
        }
        if !d.ingevuld_latex.is_empty() {
            println!("    {}", d.ingevuld_latex);
        }
        if let Some(v) = d.value {
            println!("    = {v:.4} {}", d.unit);
        }
        if !d.variables.is_empty() {
            let vars: Vec<String> = d
                .variables
                .iter()
                .map(|v| format!("{} = {:.4} {}", v.symbol, v.value, v.unit))
                .collect();
            println!("    ({})", vars.join("   "));
        }
        for n in &d.notes {
            println!("    · {n}");
        }
    }
}

// ── De keten is compleet en staat in de goede volgorde ────────────────────────

#[test]
fn de_keten_staat_er_in_de_volgorde_van_de_norm() {
    let r = r16();
    let s = kip(&r);
    toon("R16 · IPE 330 · 5,70 m · geen kipsteunen", s);

    // De volgorde is die van de afhankelijkheden: B* en β voeden de aflezing
    // van C₁ en C₂, C₂ wordt naar het aangrijpingspunt geschaald, L_kip volgt
    // uit β, S uit de doorsnede, C uit alles daarvoor, en pas dan M_cr.
    // `alpha` ontbreekt hier terecht: h/t_w van een IPE 330 blijft onder 75,
    // dus NB.NB.7 geeft k_red = 1 zonder dat α wordt bepaald. `phi_lt` staat er
    // wél: deze ligger zit met λ̄_LT ≈ 1,28 ruim boven de grensslankheid, dus
    // vgl. (6.57) wordt werkelijk doorgerekend.
    assert_eq!(
        ids(s),
        vec![
            "uitgangspunten", "b_ster", "beta", "c1", "c2_tabel", "c2",
            "l_kip", "s", "c", "k_red", "m_cr", "lambda_lt", "phi_lt", "chi_lt",
        ]
    );
}

#[test]
fn elke_stap_draagt_een_vindplaats_en_een_nederlandse_kop() {
    for (naam, r) in [
        ("R16", r16()),
        ("kipsteunen", met_kipsteunen()),
        ("kanaal", kanaal()),
        ("gelast (slank lijf)", gelaste_ligger(6.0, 40.0)),
    ] {
        for d in &kip(&r).deelstappen {
            assert!(
                !d.article.trim().is_empty(),
                "{naam}: deelstap '{}' heeft geen vindplaats",
                d.id
            );
            assert!(
                !d.titel.trim().is_empty(),
                "{naam}: deelstap '{}' heeft geen kop",
                d.id
            );
            // Een stap die een grootheid oplevert, hoort te zeggen wélke.
            if d.value.is_some() {
                assert!(
                    !d.symbol.trim().is_empty(),
                    "{naam}: deelstap '{}' levert een waarde zonder symbool",
                    d.id
                );
            }
        }
    }
}

// ── De getoonde getallen zijn de gerekende getallen ───────────────────────────

#[test]
fn elke_stapwaarde_is_exact_de_gerekende_tussenwaarde() {
    // Bit-voor-bit gelijk, geen tolerantie: de deelstappen mogen niets
    // opnieuw uitrekenen. Zodra hier een tolerantie nodig zou zijn, is er
    // ergens een tweede som ontstaan die van de kern kan afdrijven.
    for (naam, r) in [
        ("R16", r16()),
        ("kipsteunen", met_kipsteunen()),
        ("kanaal", kanaal()),
        ("gelast (slank lijf)", gelaste_ligger(6.0, 40.0)),
    ] {
        let s = kip(&r);
        for (stap_id, symbool) in [
            ("l_kip", "L_{kip}"),
            ("beta", r"\beta"),
            ("b_ster", "B^*"),
            ("c1", "C_1"),
            ("c2", "C_2"),
            ("s", "S"),
            ("c", "C"),
            ("k_red", "k_{red}"),
            ("m_cr", "M_{cr}"),
            ("lambda_lt", r"\bar{\lambda}_{LT}"),
            ("chi_lt", r"\chi_{LT}"),
        ] {
            let gerekend = tussenwaarde(s, symbool);
            let getoond = stap(s, stap_id)
                .value
                .unwrap_or_else(|| panic!("{naam}: deelstap '{stap_id}' heeft geen waarde"));
            assert_eq!(
                getoond, gerekend,
                "{naam}: deelstap '{stap_id}' toont {getoond} maar de kern rekende \
                 {gerekend} voor {symbool}"
            );
        }
    }
}

#[test]
fn de_uitgangspunten_dragen_de_lengtes_en_de_drie_momenten() {
    let r = r16();
    let s = kip(&r);
    let u = stap(s, "uitgangspunten");
    let w = |sym: &str| {
        u.variables
            .iter()
            .find(|v| v.symbol == sym)
            .unwrap_or_else(|| panic!("uitgangspunt '{sym}' ontbreekt"))
            .value
    };

    assert_relative_eq!(w("L_g"), 5700.0, max_relative = 1e-9);
    assert_relative_eq!(w("L_{st}"), 5700.0, max_relative = 1e-9);
    // Zonder kipsteun aan de gedrukte flens: nul steunen, één kipveld.
    assert_relative_eq!(w("n_{kipsteunen}"), 0.0, epsilon = 1e-12);
    // Vrij opgelegd onder alleen veldbelasting: beide eindmomenten nul, en het
    // moment op halve kiplengte is het maximum q·L²/8. Dát derde getal is de
    // reden dat het in het rapport staat: aan twee nullen is niet te zien of
    // de ligger belast is.
    assert_relative_eq!(w("M_{y,1,Ed}"), 0.0, epsilon = 1e-9);
    assert_relative_eq!(w("M_{y,2,Ed}"), 0.0, epsilon = 1e-9);
    assert_relative_eq!(w("M_{y,Ed}(L_{st}/2)"), M_MAX_KNM, max_relative = 1e-6);
    assert_relative_eq!(w("q"), Q_N_PER_MM, max_relative = 1e-12);
    assert_relative_eq!(w("z_a"), 165.0, max_relative = 1e-12);

    assert!(u.value.is_none(), "de uitgangspunten leveren geen grootheid op");
    assert!(
        u.formula_latex.is_empty() && u.ingevuld_latex.is_empty(),
        "de uitgangspunten hebben geen formule"
    );
}

// ── De ingevulde regel is werkelijk ingevuld ──────────────────────────────────

#[test]
fn geen_ingevulde_regel_bevat_nog_een_symbool() {
    // Alleen samengestelde symbolen (met `_` of `{`) worden getoetst. Een losse
    // hoofdletter als `E` of `C` is niet betrouwbaar te zoeken: `\frac`,
    // `\sqrt` en `\left` bevatten zelf letters.
    for (naam, r) in [
        ("R16", r16()),
        ("kipsteunen", met_kipsteunen()),
        ("kanaal", kanaal()),
        ("gelast (slank lijf)", gelaste_ligger(6.0, 40.0)),
    ] {
        for d in &kip(&r).deelstappen {
            if d.ingevuld_latex.is_empty() {
                continue;
            }
            for v in &d.variables {
                if !(v.symbol.contains('_') || v.symbol.contains('{')) {
                    continue;
                }
                assert!(
                    !d.ingevuld_latex.contains(&v.symbol),
                    "{naam}: de ingevulde regel van '{}' bevat nog het symbool {} — \
                     '{}'",
                    d.id,
                    v.symbol,
                    d.ingevuld_latex
                );
            }
        }
    }
}

#[test]
fn elke_variabele_komt_in_haar_eigen_formule_voor() {
    // Andersom: een variabelenlijst die iets noemt wat niet in de formule
    // staat, wekt de indruk dat het meerekent.
    for (naam, r) in [
        ("R16", r16()),
        ("kipsteunen", met_kipsteunen()),
        ("kanaal", kanaal()),
        ("gelast (slank lijf)", gelaste_ligger(6.0, 40.0)),
    ] {
        for d in &kip(&r).deelstappen {
            if d.formula_latex.is_empty() {
                continue;
            }
            for v in &d.variables {
                assert!(
                    d.formula_latex.contains(&v.symbol),
                    "{naam}: '{}' noemt {} als variabele, maar de formule '{}' gebruikt \
                     hem niet",
                    d.id,
                    v.symbol,
                    d.formula_latex
                );
            }
        }
    }
}

// ── De twee takken van L_kip (NB.NB.4.3) ──────────────────────────────────────

#[test]
fn tussen_twee_gaffels_toont_de_keten_de_gaffeltak() {
    let r = r16();
    let s = kip(&r);
    let d = stap(s, "l_kip");
    assert_eq!(d.formula_latex, r"L_{kip} = L_{st}");
    assert_relative_eq!(d.value.unwrap(), 5700.0, max_relative = 1e-9);
    assert!(
        d.notes.iter().any(|n| n.contains("TWEE GAFFELS")),
        "de gaffeltak hoort zichzelf te benoemen: {:?}",
        d.notes
    );
    // De formule met β mag hier niet opduiken — zij zou L_kip 1,4× te lang
    // maken en M_cr ruim 30 % te laag.
    assert!(!d.formula_latex.contains("1{,}4"));
}

#[test]
fn met_kipsteunen_toont_de_keten_de_formule_met_beta() {
    let r = met_kipsteunen();
    let s = kip(&r);
    let d = stap(s, "l_kip");
    assert!(
        d.formula_latex.contains("1{,}4") && d.formula_latex.contains(r"\beta"),
        "de β-tak hoort de formule (1,4 − 0,8·β)·L_st te tonen: {}",
        d.formula_latex
    );
    // Maatgevend is het eindveld met β = 0, dus de bovengrens 1,4 wordt exact
    // geraakt: L_kip = 1,4 · 2666,67 = 3733,33 mm.
    assert_relative_eq!(d.value.unwrap(), 3733.33, max_relative = 1e-4);

    // En de uitgangspunten tellen dan twee kipsteunen, met een aanwijzing welk
    // van de drie velden maatgevend werd.
    let u = stap(s, "uitgangspunten");
    let n = u
        .variables
        .iter()
        .find(|v| v.symbol == "n_{kipsteunen}")
        .unwrap()
        .value;
    assert_relative_eq!(n, 2.0, epsilon = 1e-12);
    assert!(
        u.notes.iter().any(|x| x.contains("maatgevend")),
        "bij meer dan één kipveld hoort erbij te staan wélk veld maatgevend is"
    );
}

// ── De twee takken van χ_LT (art. 6.3.2.3) ────────────────────────────────────

#[test]
fn onder_de_grensslankheid_blijft_chi_lt_op_een_en_vervalt_phi() {
    // De galerijcasus zit met λ̄_LT ≈ 0,37 onder λ̄_LT,0 = 0,4.
    let r = met_kipsteunen();
    let s = kip(&r);
    assert!(
        tussenwaarde(s, r"\bar{\lambda}_{LT}") < 0.4,
        "deze casus hoort onder de grensslankheid te liggen"
    );
    assert!(
        !ids(s).contains(&"phi_lt"),
        "onder de grensslankheid wordt Φ_LT niet gebruikt en hoort hij niet in de keten"
    );
    let d = stap(s, "chi_lt");
    assert_relative_eq!(d.value.unwrap(), 1.0, max_relative = 1e-12);
    assert_eq!(d.article, "art. 6.3.2.3(1)");
}

#[test]
fn boven_de_grensslankheid_verschijnt_phi_lt_met_zijn_kromme() {
    // R16 zit met λ̄_LT ≈ 1,29 ruim boven de grens.
    let r = r16();
    let s = kip(&r);
    assert!(tussenwaarde(s, r"\bar{\lambda}_{LT}") > 0.4);
    let phi = stap(s, "phi_lt");
    // Φ_LT wordt niet apart opnieuw uitgerekend maar via dezelfde functie als
    // χ_LT; narekenen met vgl. (6.57) moet exact hetzelfde geven.
    let l = tussenwaarde(s, r"\bar{\lambda}_{LT}");
    let a = tussenwaarde(s, r"\alpha_{LT}");
    assert_relative_eq!(
        phi.value.unwrap(),
        0.5 * (1.0 + a * (l - 0.4) + 0.75 * l * l),
        max_relative = 1e-12
    );
    // IPE 330 is gewalst met h/b > 2 → kipkromme c. Dát hoort in de notities
    // van de stap te staan waar α_LT werkelijk meerekent.
    assert!(
        phi.notes.iter().any(|n| n.contains("tabel 6.5")),
        "de herkomst van α_LT hoort bij Φ_LT te staan: {:?}",
        phi.notes
    );
}

// ── k_red en zijn h/t_w-toets (NB.NB.7 / NB.NB.8) ─────────────────────────────

#[test]
fn k_red_toont_de_h_tw_toets_die_hem_bepaalt() {
    let r = r16();
    let s = kip(&r);
    let d = stap(s, "k_red");
    // IPE 330: h/t_w = 330/7,5 = 44 ≤ 75 → NB.NB.7 geeft k_red = 1, en α van
    // NB.NB.9 hoeft niet te worden bepaald.
    assert_eq!(d.article, "NB.NB.7");
    assert!(
        d.formula_latex.contains("75"),
        "de drempel hoort in de formule zichtbaar te zijn: {}",
        d.formula_latex
    );
    assert!(
        d.ingevuld_latex.contains("44"),
        "de ingevulde regel hoort h/t_w = 44 te tonen: {}",
        d.ingevuld_latex
    );
    assert_relative_eq!(d.value.unwrap(), 1.0, max_relative = 1e-12);
    assert!(!ids(s).contains(&"alpha"));
}

#[test]
fn een_slank_lijf_schakelt_over_op_nb_nb_8_en_toont_alpha() {
    // h/t_w = 95 > 75, dus NB.NB.7 vervalt en NB.NB.8 geldt — met α uit
    // NB.NB.9 als eigen stap ervóór, want zonder α is de formule van k_red
    // niet na te rekenen.
    let r = gelaste_ligger(6.0, 40.0);
    let s = kip(&r);
    toon("Gelaste ligger 950 mm · L = 6 m · h/t_w = 95", s);

    let a = stap(s, "alpha");
    assert_eq!(a.article, "NB.NB.9");
    // α = 950·25·10¹² / (10³·400·6000²) = 1649,3
    assert_relative_eq!(a.value.unwrap(), 1649.31, max_relative = 1e-4);

    let d = stap(s, "k_red");
    assert_eq!(d.article, "NB.NB.8");
    // k_red = −5,4·10⁻⁵·1649,3 + 1,03 = 0,9409 — hier bijt de reductie echt,
    // en dat is precies wat deze tak moet laten zien.
    assert_relative_eq!(d.value.unwrap(), 0.940937, max_relative = 1e-5);
    assert!(d.value.unwrap() < 1.0);
    // De α-stap staat vóór de k_red-stap die hem gebruikt.
    let v = ids(s);
    assert!(
        v.iter().position(|x| *x == "alpha") < v.iter().position(|x| *x == "k_red"),
        "α hoort vóór k_red te komen: {v:?}"
    );
}

#[test]
fn boven_alpha_5000_meldt_de_keten_dat_de_norm_daar_ophoudt() {
    // NB.NB.4.2(3): boven α = 5000 geeft de bijlage géén k_red meer, maar
    // schrijft zij een toets van de gedrukte rand volgens 6.3.3 voor. De kern
    // trekt NB.NB.8 door zodat de berekening niet stilvalt; dat mag het rapport
    // niet als normwaarde presenteren.
    let r = gelaste_ligger(3.0, 80.0);
    let s = kip(&r);
    let a = stap(s, "alpha");
    assert!(
        a.value.unwrap() > 5000.0,
        "deze casus hoort boven de grens uit te komen: α = {:?}",
        a.value
    );
    assert!(
        a.notes.iter().any(|n| n.contains("NB.NB.4.2(3)")),
        "de overschrijding hoort bij de α-stap te staan: {:?}",
        a.notes
    );
}

// ── Het kanaalpad: gelijk waar het gelijk is, expliciet waar het afwijkt ──────

#[test]
fn het_kanaalpad_deelt_de_keten_tot_en_met_c() {
    let i_pad = r16();
    let u_pad = kanaal();
    let (a, b) = (kip(&i_pad), kip(&u_pad));

    // Tot en met C is de keten woordelijk dezelfde: zelfde stappen, zelfde
    // formules, zelfde vindplaatsen. Dat is geen toeval maar de opzet — beide
    // paden lopen door dezelfde bouwer.
    for id in ["b_ster", "beta", "c1", "c2_tabel", "c2", "l_kip", "s", "c"] {
        let (x, y) = (stap(a, id), stap(b, id));
        assert_eq!(x.formula_latex, y.formula_latex, "formule van '{id}' wijkt af");
        assert_eq!(x.article, y.article, "vindplaats van '{id}' wijkt af");
        assert_eq!(x.titel, y.titel, "kop van '{id}' wijkt af");
    }
}

#[test]
fn het_kanaalpad_zet_zijn_afwijking_van_de_norm_in_de_m_cr_stap() {
    let r = kanaal();
    let s = kip(&r);
    let d = stap(s, "m_cr");

    // De reductie staat in de formule zelf — niet alleen in een voetnoot, want
    // dan toont het rapport een normformule met een getal dat er niet uit volgt.
    assert!(
        d.formula_latex.contains("0{,}7"),
        "de benaderingsfactor hoort in de formule te staan: {}",
        d.formula_latex
    );
    // En de vindplaats zegt met zoveel woorden dat dit deel niet uit de norm komt.
    assert!(
        d.article.contains("buiten de norm"),
        "de vindplaats mag de factor niet als normwaarde presenteren: {}",
        d.article
    );
    assert!(
        d.notes.iter().any(|n| n.contains("GEEN normwaarde")),
        "de notitie hoort de factor als niet-normatief te merken: {:?}",
        d.notes
    );

    // Het I-pad heeft die factor juist NIET.
    let i = r16();
    assert!(!stap(kip(&i), "m_cr").formula_latex.contains("0{,}7"));
    assert_eq!(stap(kip(&i), "m_cr").article, "NB.148");
}

#[test]
fn het_kanaalpad_verantwoordt_zijn_kipkromme_bij_phi_lt() {
    let r = kanaal();
    let s = kip(&r);
    // Alleen zinvol als deze casus boven de grensslankheid uitkomt; anders
    // rekent α_LT niet mee en bestaat de Φ_LT-stap terecht niet.
    if !ids(s).contains(&"phi_lt") {
        return;
    }
    let phi = stap(s, "phi_lt");
    assert!(
        phi.notes
            .iter()
            .any(|n| n.contains("geen rij voor U-profielen")),
        "tabel 6.5 kent geen rij voor U-profielen; dat hoort erbij te staan: {:?}",
        phi.notes
    );
}

// ── De uitkomst van de toets hoort bij de formule van de toets ────────────────

#[test]
fn de_uitkomst_van_de_kiptoets_is_m_b_rd_en_niet_chi_lt() {
    // `formula_latex` van de kiptoets luidt M_b,Rd = χ_LT·W_pl,y·f_y/γ_M1, dus
    // `value` hoort M_b,Rd te zijn — in kNm. Hier stond χ_LT, en het rapport
    // zette daardoor onder diezelfde formule "= 0,9" (dimensieloos), twee
    // regels boven een unity check die met M_b,Rd = 51,8 kNm rekende.
    //
    // De koppeling aan `uc.rd` is de scherpe kant van deze test: die noemer is
    // de M_b,Rd waarmee werkelijk getoetst is, dus wie `value` losweekt van de
    // toets, ziet het hier meteen.
    for (naam, r) in [
        ("R16", r16()),
        ("kipsteunen", met_kipsteunen()),
        ("kanaal", kanaal()),
        ("gelast (slank lijf)", gelaste_ligger(6.0, 40.0)),
    ] {
        let s = kip(&r);
        assert_eq!(s.unit, "kNm", "{naam}: de kipweerstand is een moment");
        let rd = s.uc.as_ref().expect("de kiptoets heeft een UC").rd;
        assert_eq!(
            s.value, rd,
            "{naam}: de toets toont {} maar rekent met M_b,Rd = {rd}",
            s.value
        );
        // En χ_LT is niet zoekgeraakt: hij staat nog in de tussenwaarden en als
        // eigen deelstap.
        let chi = tussenwaarde(s, r"\chi_{LT}");
        assert!(chi > 0.0 && chi <= 1.0, "{naam}: χ_LT = {chi}");
        assert_eq!(stap(s, "chi_lt").value, Some(chi));
    }
}

// ── De keten laat de bestaande tussenwaarden ongemoeid ────────────────────────

#[test]
fn de_tussenwaarden_blijven_volledig_bestaan() {
    // De deelstappen komen ERBIJ; ze vervangen `intermediate_values` niet.
    // Vijf acceptatietests zoeken daar op symbool, en de PDF-weg leest hem ook.
    // Het rapport onderdrukt de dubbele regel aan de weergavekant.
    let r = r16();
    let s = kip(&r);
    for sym in [
        "L_g", "L_{st}", "L_{kip}", r"\beta", "B^*", "C_1", "C_2", "S", "C",
        "k_{red}", "M_{cr}", r"\bar{\lambda}_{LT}", r"\alpha_{LT}", r"\chi_{LT}",
    ] {
        assert!(
            s.intermediate_values.iter().any(|v| v.symbol == sym),
            "tussenwaarde '{sym}' is verdwenen"
        );
    }
    assert!(!s.deelstappen.is_empty());
}
