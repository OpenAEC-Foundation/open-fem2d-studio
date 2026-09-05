//! De uitgebreide doorsnedegrootheden, door de hele keten heen.
//!
//! Deze tests gaan door dezelfde ingang als de app: JSON erin,
//! [`section_properties::opdracht::reken`] eroverheen, JSON eruit. Elke
//! grootheid krijgt een uitkomst die met de hand of uit de catalogus na te
//! rekenen is — een getal dat alleen "plausibel" is bewijst niets.

use section_properties::opdracht::{reken, Invoer};
use serde_json::Value;

fn lees(json: &str) -> Invoer {
    serde_json::from_str(json).expect("de JSON hoort op Invoer te passen")
}

fn draai(json: &str) -> Value {
    let u = reken(&lees(json)).expect("deze doorsnede hoort door de motor te komen");
    serde_json::to_value(&u).unwrap()
}

fn getal(v: &Value, sleutel: &str) -> f64 {
    v[sleutel]
        .as_f64()
        .unwrap_or_else(|| panic!("veld {sleutel} ontbreekt of is geen getal"))
}

fn vlag(v: &Value, sleutel: &str) -> bool {
    v[sleutel]
        .as_bool()
        .unwrap_or_else(|| panic!("veld {sleutel} ontbreekt of is geen vlag"))
}

fn dicht(gemeten: f64, verwacht: f64, marge: f64, wat: &str) {
    assert!(
        (gemeten - verwacht).abs() <= marge,
        "{wat}: {gemeten} tegen verwacht {verwacht} (marge {marge})"
    );
}

// ════════════════════════════════════════════════════════════════════════════
//  Rechthoek — alles met de hand
// ════════════════════════════════════════════════════════════════════════════

/// Een massieve rechthoek 100 × 300 is de doorsnede waarvan élke nieuwe
/// grootheid een gesloten vorm heeft:
///
/// * omtrek `2(b + h) = 800 mm`, geen gaten;
/// * massa `30 000 mm² · 10⁻⁶ · 7850 = 235,5 kg/m`;
/// * `Q_y = A·z_c = 30 000 · 150`, `Q_z = A·y_c = 30 000 · 50`;
/// * hoofdassen vallen samen met y en z, dus `W_u = W_y` en `i_u = h/√12`;
/// * plastisch zwaartepunt op `(50, 150)` — samen met het elastische;
/// * vormfactor exact `1,5` om beide assen;
/// * dubbelsymmetrisch, dus `z_j = 0` en `β_y = 0`.
#[test]
fn rechthoek_levert_elke_nieuwe_grootheid_met_de_hand() {
    let v = draai(r#"{ "naam": "100x300", "soort": "Rechthoek", "h": 300, "b": 100 }"#);
    let (b, h) = (100.0, 300.0);
    let a = b * h;

    // Omtrek en massa.
    assert!(vlag(&v, "omtrek_bepaald"));
    dicht(getal(&v, "omtrek_mm"), 2.0 * (b + h), 1e-9, "omtrek");
    dicht(getal(&v, "omtrek_gaten_mm"), 0.0, 1e-9, "gatomtrek");
    dicht(getal(&v, "dichtheid_kg_m3"), 7850.0, 0.0, "dichtheid");
    dicht(getal(&v, "massa_kg_per_m"), 235.5, 1e-9, "massa");

    // Statische momenten om de globale assen.
    dicht(getal(&v, "qy_mm3"), a * h / 2.0, 1e-6, "Q_y");
    dicht(getal(&v, "qz_mm3"), a * b / 2.0, 1e-6, "Q_z");
    // En om de zwaartepuntsassen zijn ze nul — dat is de controle op de eigen
    // rekengang: Q_y − A·z_c hoort exact weg te vallen.
    dicht(
        getal(&v, "qy_mm3") - getal(&v, "area_mm2") * getal(&v, "z_c_mm"),
        0.0,
        1e-6,
        "Q_y om de zwaartepuntsas",
    );
    dicht(
        getal(&v, "qz_mm3") - getal(&v, "area_mm2") * getal(&v, "y_c_mm"),
        0.0,
        1e-6,
        "Q_z om de zwaartepuntsas",
    );

    // Hoofdassen: α = 0, dus u ∥ y en v ∥ z.
    dicht(getal(&v, "alpha_hoofdas_rad"), 0.0, 1e-12, "α");
    dicht(getal(&v, "v_max_mm"), h / 2.0, 1e-9, "v_max");
    dicht(getal(&v, "v_min_mm"), -h / 2.0, 1e-9, "v_min");
    dicht(getal(&v, "u_max_mm"), b / 2.0, 1e-9, "u_max");
    dicht(getal(&v, "wel_u_plus_mm3"), b * h * h / 6.0, 1e-6, "W_u,+");
    dicht(getal(&v, "wel_u_min_mm3"), b * h * h / 6.0, 1e-6, "W_u,−");
    dicht(getal(&v, "wel_v_plus_mm3"), h * b * b / 6.0, 1e-6, "W_v,+");
    dicht(getal(&v, "wel_v_min_mm3"), h * b * b / 6.0, 1e-6, "W_v,−");
    dicht(getal(&v, "iu_radius_mm"), h / 12f64.sqrt(), 1e-9, "i_u");
    dicht(getal(&v, "iv_radius_mm"), b / 12f64.sqrt(), 1e-9, "i_v");

    // Plastisch.
    assert!(vlag(&v, "plastisch_bepaald"));
    dicht(getal(&v, "z_pna_mm"), h / 2.0, 1e-6, "z_pna");
    dicht(getal(&v, "y_pna_mm"), b / 2.0, 1e-6, "y_pna");
    dicht(getal(&v, "u_pna_mm"), 0.0, 1e-6, "u_pna");
    dicht(getal(&v, "v_pna_mm"), 0.0, 1e-6, "v_pna");
    dicht(getal(&v, "wpl_u_mm3"), b * h * h / 4.0, 1e-6, "W_pl,u");
    dicht(getal(&v, "wpl_v_mm3"), h * b * b / 4.0, 1e-6, "W_pl,v");
    for veld in ["vormfactor_y", "vormfactor_z", "vormfactor_u", "vormfactor_v"] {
        dicht(getal(&v, veld), 1.5, 1e-9, veld);
    }

    // Monosymmetrie: dubbelsymmetrisch ⇒ nul. De contourterm is exact nul,
    // maar `z_s` komt uit de torsiemesh; de marge is dus die van de mesh
    // (enkele duizendsten van een millimeter op 300 mm), niet die van de
    // contour. Dat is precies waarom `z_j` een numerieke en geen exacte nul is.
    assert!(vlag(&v, "monosymmetrie_bepaald"));
    dicht(getal(&v, "z_j_mm"), 0.0, 0.02, "z_j");
    dicht(getal(&v, "y_j_mm"), 0.0, 0.02, "y_j");
    dicht(getal(&v, "beta_y_mm"), -2.0 * getal(&v, "z_j_mm"), 1e-12, "β_y = −2·z_j");

    // Afschuiving in de hoofdrichtingen: α = 0, dus letterlijk Av;y en Av;z.
    assert!(vlag(&v, "av_hoofdas_bepaald"));
    dicht(getal(&v, "av_u_mm2"), getal(&v, "av_y_mm2"), 1e-9, "Av;u");
    dicht(getal(&v, "av_v_mm2"), getal(&v, "av_z_mm2"), 1e-9, "Av;v");
}

/// Een eigen soortelijke massa hoort gewoon gevolgd te worden — hout van
/// 500 kg/m³ geeft `30 000 · 10⁻⁶ · 500 = 15 kg/m`.
#[test]
fn eigen_dichtheid_wordt_gebruikt() {
    let v = draai(
        r#"{ "naam": "hout", "soort": "Rechthoek", "h": 300, "b": 100,
              "dichtheid_kg_m3": 500 }"#,
    );
    dicht(getal(&v, "dichtheid_kg_m3"), 500.0, 0.0, "dichtheid");
    dicht(getal(&v, "massa_kg_per_m"), 15.0, 1e-9, "massa");
}

// ════════════════════════════════════════════════════════════════════════════
//  IPE 300 — tegen de catalogus
// ════════════════════════════════════════════════════════════════════════════

/// IPE 300 uit de profieldatabase.
///
/// * massa `42,2 kg/m` (catalogus);
/// * omtrek ≈ `1,16 m/m` — de gepubliceerde omtrek `A_m` van een IPE 300;
/// * `W_pl;y = 628 356 mm³` (catalogus), vormfactor daarmee ongeveer 1,13;
/// * dubbelsymmetrisch, dus `z_j ≈ 0` (het schuifmiddelpunt komt uit de mesh,
///   dus dit is een numerieke nul, geen exacte).
#[test]
fn ipe300_tegen_de_catalogus() {
    let v = draai(
        r#"{ "naam": "IPE 300", "soort": "ISection",
              "h": 300, "b": 150, "tw": 7.1, "tf": 10.7, "r": 15 }"#,
    );

    dicht(getal(&v, "massa_kg_per_m"), 42.2, 0.1, "massa");
    // 1160 mm omtrek; de catalogus geeft A_m = 1,16 m²/m.
    dicht(getal(&v, "omtrek_mm"), 1160.0, 5.0, "omtrek");
    dicht(getal(&v, "omtrek_gaten_mm"), 0.0, 1e-9, "gatomtrek");

    let wpl_y = getal(&v, "wpl_y_mm3");
    dicht(wpl_y, 628_356.0, 3_500.0, "W_pl;y");
    let vf = getal(&v, "vormfactor_y");
    assert!((1.10..1.16).contains(&vf), "vormfactor_y = {vf:.4}");
    // Om de zwakke as is de vormfactor van een I-profiel ongeveer 1,55: bijna
    // twee massieve rechthoeken op hun kant.
    let vfz = getal(&v, "vormfactor_z");
    assert!((1.45..1.70).contains(&vfz), "vormfactor_z = {vfz:.4}");

    // Hoofdassen vallen samen met y en z.
    dicht(getal(&v, "alpha_hoofdas_rad"), 0.0, 1e-12, "α");
    dicht(getal(&v, "wel_u_plus_mm3"), getal(&v, "wel_y_mm3"), 1e-6, "W_u = W_y");
    dicht(getal(&v, "wpl_u_mm3"), wpl_y, 1e-6, "W_pl;u = W_pl;y");
    dicht(getal(&v, "iu_radius_mm"), getal(&v, "iy_radius_mm"), 1e-9, "i_u = i_y");
    assert!(vlag(&v, "av_hoofdas_bepaald"));

    // Plastisch zwaartepunt op halve hoogte, samen met het elastische.
    dicht(getal(&v, "z_pna_mm"), 150.0, 1e-6, "z_pna");
    dicht(getal(&v, "y_pna_mm"), 75.0, 1e-6, "y_pna");

    // z_j is nul; de marge is die van de mesh onder het schuifmiddelpunt.
    assert!(vlag(&v, "monosymmetrie_bepaald"));
    dicht(getal(&v, "z_j_mm"), 0.0, 0.5, "z_j");
    dicht(getal(&v, "beta_y_mm"), -2.0 * getal(&v, "z_j_mm"), 1e-9, "β_y = −2·z_j");
}

/// Een IPE 300 met een rond langsgat van 40 mm in het lijf: de gatomtrek is
/// `π·40 = 125,66 mm` en de buitenomtrek verandert niet.
#[test]
fn langsgat_telt_apart_mee_in_de_omtrek() {
    let vol = draai(
        r#"{ "naam": "IPE 300", "soort": "ISection",
              "h": 300, "b": 150, "tw": 7.1, "tf": 10.7, "r": 15 }"#,
    );
    let met_gat = draai(
        r#"{ "naam": "IPE 300 met langsgat", "soort": "ISection",
              "h": 300, "b": 150, "tw": 7.1, "tf": 10.7, "r": 15,
              "gaten": [{ "plaats": "vlak", "vorm": "rond", "y": 75, "z": 150, "d": 4 }] }"#,
    );
    dicht(
        getal(&met_gat, "omtrek_mm"),
        getal(&vol, "omtrek_mm"),
        1e-6,
        "buitenomtrek verandert niet",
    );
    dicht(
        getal(&met_gat, "omtrek_gaten_mm"),
        std::f64::consts::PI * 4.0,
        1e-6,
        "gatomtrek",
    );
    // En de massa daalt met precies het gatoppervlak.
    let weg = std::f64::consts::PI * 4.0;
    dicht(
        getal(&vol, "massa_kg_per_m") - getal(&met_gat, "massa_kg_per_m"),
        weg * 1e-6 * 7850.0,
        1e-9,
        "massaverschil",
    );
}

/// Een lijfgat laat twee losse T's over. Dan is er geen schuifmiddelpunt, dus
/// `z_j` hoort **niet bepaald** te zijn in plaats van nul te lijken. De omtrek
/// is er wél: de twee buitenranden tellen gewoon op.
///
/// Met de hand: de snede van 80 mm neemt aan weerszijden van het lijf 80 mm
/// rand weg (`−160 mm`) en legt er twee snijvlakken van `t_w = 7,1 mm` voor
/// terug (`+14,2 mm`). De omtrek gaat dus van 1 160,05 naar 1 014,25 mm — een
/// doorgesneden profiel heeft een **kortere** omtrek, want de weggenomen strook
/// bracht zijn eigen zijkanten mee.
#[test]
fn losse_delen_geven_geen_zj_maar_wel_een_omtrek() {
    let v = draai(
        r#"{ "naam": "IPE 300 lijfgat 80", "soort": "ISection",
              "h": 300, "b": 150, "tw": 7.1, "tf": 10.7, "r": 15,
              "gaten": [{ "plaats": "uitsnede", "y": 75, "z": 150, "b": 9.1, "h": 80,
                          "hoek_graden": 0 }] }"#,
    );
    assert!(vlag(&v, "losse_delen"));
    assert!(!vlag(&v, "monosymmetrie_bepaald"), "z_j hoort niet bepaald te zijn");
    dicht(getal(&v, "z_j_mm"), 0.0, 0.0, "z_j staat op nul");
    assert!(vlag(&v, "omtrek_bepaald"));
    let vol = 2.0 * 150.0
        + 4.0 * 10.7
        + 4.0 * ((150.0 - 7.1) / 2.0 - 15.0)
        + 2.0 * (300.0 - 2.0 * 10.7 - 2.0 * 15.0)
        + 2.0 * std::f64::consts::PI * 15.0;
    dicht(
        getal(&v, "omtrek_mm"),
        vol - 2.0 * 80.0 + 2.0 * 7.1,
        1e-6,
        "omtrek na de snede",
    );
}

// ════════════════════════════════════════════════════════════════════════════
//  T-profiel — de monosymmetrie
// ════════════════════════════════════════════════════════════════════════════

/// Hetzelfde T-profiel als in de eenheidstest van `uitgebreid`, maar nu als
/// samenstelling uit twee lamellen zoals de editor hem stuurt: lijf 180 × 10
/// staand, flens 150 × 20 liggend erbovenop.
///
/// Met de hand: `A = 1800 + 3000 = 4800 mm²`, `z_c = 152,5 mm`,
/// `I_y = 16 210 000 mm⁴`, `∬(y²+z²)z dA = −971 250 000 mm⁵` en het
/// schuifmiddelpunt in het snijpunt van de plaatmiddellijnen (`z = 190`).
/// Daarmee `z_j = 37,5 + 0,5·971 250 000/16 210 000 = 67,46 mm`.
fn t_profiel_json(spiegel: bool) -> String {
    // `spiegel = true` zet de flens onderaan: alles wat met z te maken heeft
    // klapt om, dus z_j hoort van teken te wisselen.
    let (z_lijf, z_flens) = if spiegel { (110.0, 10.0) } else { (90.0, 190.0) };
    format!(
        r#"{{ "naam": "T", "soort": "Samenstelling",
               "lamellen": [
                 {{ "b_mm": 180, "t_mm": 10, "y_mm": 0, "z_mm": {z_lijf}, "alpha_rad": 1.5707963267948966 }},
                 {{ "b_mm": 150, "t_mm": 20, "y_mm": 0, "z_mm": {z_flens}, "alpha_rad": 0 }}
               ] }}"#
    )
}

#[test]
fn t_profiel_heeft_een_plastisch_zwaartepunt_naast_het_elastische() {
    let v = draai(&t_profiel_json(false));

    dicht(getal(&v, "area_mm2"), 4800.0, 1e-6, "A");
    dicht(getal(&v, "z_c_mm"), 152.5, 1e-6, "z_c");
    dicht(getal(&v, "iy_mm4"), 16_210_000.0, 1.0, "I_y");

    // Q om de globale assen: A·z_c respectievelijk A·y_c (= 0).
    dicht(getal(&v, "qy_mm3"), 4800.0 * 152.5, 1e-3, "Q_y");
    dicht(getal(&v, "qz_mm3"), 0.0, 1e-6, "Q_z");

    // De plastische neutrale as ligt in de flens: (A/2 − A_lijf)/b boven de
    // flensonderkant, dus 180 + (2400 − 1800)/150 = 184 mm.
    assert!(vlag(&v, "plastisch_bepaald"));
    dicht(getal(&v, "z_pna_mm"), 184.0, 1e-4, "z_pna");
    assert!(
        getal(&v, "z_pna_mm") > getal(&v, "z_c_mm") + 1.0,
        "de PNA hoort boven het elastische zwaartepunt te liggen"
    );
    // Om de z-as is het T-profiel symmetrisch, dus daar vallen ze samen.
    dicht(getal(&v, "y_pna_mm"), getal(&v, "y_c_mm"), 1e-6, "y_pna = y_c");
}

#[test]
fn t_profiel_heeft_een_zj_met_het_juiste_teken() {
    let boven = draai(&t_profiel_json(false));
    assert!(vlag(&boven, "monosymmetrie_bepaald"));
    let z_j = getal(&boven, "z_j_mm");
    dicht(z_j, 67.46, 0.05, "z_j met de flens boven");
    assert!(z_j > 0.0, "flens boven ⇒ z_j positief");
    // β_y = −2·z_j, altijd.
    dicht(getal(&boven, "beta_y_mm"), -2.0 * z_j, 1e-9, "β_y");
    // Om de z-as blijft het profiel symmetrisch.
    dicht(getal(&boven, "y_j_mm"), 0.0, 1e-6, "y_j");

    // Zelfde profiel, ondersteboven: exact het tegengestelde teken.
    let onder = draai(&t_profiel_json(true));
    dicht(getal(&onder, "z_j_mm"), -z_j, 1e-6, "z_j met de flens onder");
}

/// Draai hetzelfde T-profiel een kwartslag tegen de klok in. Dan geldt
/// `y' = −z` en `z' = y`, en dus
///
/// ```text
/// ∬(y'²+z'²)y' dA = −∬(y²+z²)z dA,  I_z' = I_y,  y_s' = −z_s
/// ⇒ β_z' = −β_y  ⇒  y_j' = −z_j
/// ```
///
/// Dat toetst de `y`-tak van de rekengang tegen de `z`-tak, die hierboven al
/// exact tegen een handberekening ligt. En passant komt de hoofdas op `α = π/2`
/// te liggen, waarmee ook de tweede tak van de afschuifregel wordt gelopen.
#[test]
fn kwartslag_verwisselt_zj_en_yj() {
    let recht = draai(&t_profiel_json(false));
    let gedraaid = draai(
        r#"{ "naam": "T gedraaid", "soort": "Samenstelling",
              "lamellen": [
                { "b_mm": 180, "t_mm": 10, "y_mm": -90, "z_mm": 0, "alpha_rad": 3.141592653589793 },
                { "b_mm": 150, "t_mm": 20, "y_mm": -190, "z_mm": 0, "alpha_rad": 1.5707963267948966 }
              ] }"#,
    );

    dicht(getal(&gedraaid, "area_mm2"), 4800.0, 1e-6, "A");
    // De sterke hoofdas is nu de z-as.
    dicht(
        getal(&gedraaid, "alpha_hoofdas_rad").abs(),
        std::f64::consts::FRAC_PI_2,
        1e-9,
        "α",
    );
    dicht(getal(&gedraaid, "iu_mm4"), getal(&recht, "iu_mm4"), 1.0, "I_u invariant");

    assert!(vlag(&gedraaid, "monosymmetrie_bepaald"));
    dicht(
        getal(&gedraaid, "y_j_mm"),
        -getal(&recht, "z_j_mm"),
        1e-6,
        "y_j na een kwartslag",
    );
    dicht(getal(&gedraaid, "z_j_mm"), 0.0, 1e-6, "z_j na een kwartslag");

    // α = π/2: de afschuifoppervlakken wisselen van as, maar zijn bepaald.
    assert!(vlag(&gedraaid, "av_hoofdas_bepaald"));
    dicht(
        getal(&gedraaid, "av_u_mm2"),
        getal(&gedraaid, "av_z_mm2"),
        1e-9,
        "Av;u = Av;z bij α = π/2",
    );
}

/// Zodra er een catalogusdeel in de samenstelling zit is er geen contour meer
/// om derde momenten uit te halen: dan hoort `z_j` als **niet bepaald** terug
/// te komen, met een melding, in plaats van als nul.
#[test]
fn catalogusdeel_maakt_zj_niet_bepaald() {
    let v = draai(
        r#"{ "naam": "sfb", "soort": "Samenstelling",
              "lamellen": [{ "b_mm": 400, "t_mm": 15, "y_mm": 0, "z_mm": -107.5, "alpha_rad": 0 }],
              "catalogusdelen": [
                { "soort": "ISection", "h": 200, "b": 200, "tw": 9, "tf": 15, "r": 18,
                  "y_mm": 0, "z_mm": 0, "alpha_rad": 0, "gespiegeld": false }
              ] }"#,
    );
    assert!(!vlag(&v, "monosymmetrie_bepaald"));
    assert!(!vlag(&v, "plastisch_bepaald"));
    assert!(!vlag(&v, "omtrek_bepaald"));
    dicht(getal(&v, "z_j_mm"), 0.0, 0.0, "z_j staat op nul");
    dicht(getal(&v, "wpl_u_mm3"), 0.0, 0.0, "W_pl;u staat op nul");
    // De massa is er wél: die volgt alleen uit het oppervlak.
    dicht(getal(&v, "massa_kg_per_m"), 13_808.0 * 1e-6 * 7850.0, 0.05, "massa");
    let meldingen = v["meldingen"].as_array().unwrap();
    assert!(
        meldingen.iter().any(|m| m.as_str().unwrap().contains("z_j")),
        "er hoort een melding over z_j te staan: {meldingen:?}"
    );
}

// ════════════════════════════════════════════════════════════════════════════
//  Gedraaid profiel — de hoofdassen draaien mee
// ════════════════════════════════════════════════════════════════════════════

/// Een gelaste I uit drie platen, ongedraaid en over 30° gedraaid.
///
/// `I_y + I_z` is de spoor van de traagheidstensor en dus invariant onder
/// draaiing; `I_u` en `I_v` zijn de eigenwaarden en dus óók invariant. Elke
/// hoofdas-grootheid — `W_u`, `W_v`, `i_u`, `i_v`, `W_pl;u`, `W_pl;v` — hoort
/// daarom exact hetzelfde te blijven, en `α` hoort van 0° naar 30° te lopen.
fn gelaste_i_json(hoek_graden: f64) -> String {
    let a = hoek_graden.to_radians();
    let (s, c) = a.sin_cos();
    // De platen om de oorsprong, dan als geheel gedraaid: het zwaartepunt
    // draait mee en de plaathoek loopt met α op.
    let plaat = |b: f64, t: f64, y: f64, z: f64, eigen: f64| {
        format!(
            r#"{{ "b_mm": {b}, "t_mm": {t}, "y_mm": {}, "z_mm": {}, "alpha_rad": {} }}"#,
            y * c - z * s,
            y * s + z * c,
            eigen + a
        )
    };
    format!(
        r#"{{ "naam": "gelaste I", "soort": "Samenstelling", "lamellen": [{}, {}, {}] }}"#,
        plaat(200.0, 15.0, 0.0, 207.5, 0.0),
        plaat(200.0, 15.0, 0.0, -207.5, 0.0),
        plaat(400.0, 10.0, 0.0, 0.0, std::f64::consts::FRAC_PI_2),
    )
}

#[test]
fn gedraaid_profiel_houdt_dezelfde_hoofdasgrootheden() {
    let recht = draai(&gelaste_i_json(0.0));
    let scheef = draai(&gelaste_i_json(30.0));

    // Invarianten.
    dicht(
        getal(&scheef, "iy_mm4") + getal(&scheef, "iz_mm4"),
        getal(&recht, "iy_mm4") + getal(&recht, "iz_mm4"),
        1e-3,
        "I_y + I_z is invariant",
    );
    for veld in ["area_mm2", "iu_mm4", "iv_mm4", "it_mm4"] {
        let (a, b) = (getal(&recht, veld), getal(&scheef, veld));
        assert!((a - b).abs() <= 1e-6 * a.abs().max(1.0), "{veld}: {a} tegen {b}");
    }

    // α draait mee van 0° naar 30°.
    dicht(getal(&recht, "alpha_hoofdas_rad"), 0.0, 1e-12, "α ongedraaid");
    dicht(
        getal(&scheef, "alpha_hoofdas_rad"),
        30f64.to_radians(),
        1e-9,
        "α gedraaid",
    );

    // En elke hoofdas-grootheid is onveranderd.
    for veld in [
        "u_max_mm",
        "v_max_mm",
        "wel_u_plus_mm3",
        "wel_u_min_mm3",
        "wel_v_plus_mm3",
        "wel_v_min_mm3",
        "wel_u_mm3",
        "wel_v_mm3",
        "iu_radius_mm",
        "iv_radius_mm",
        "wpl_u_mm3",
        "wpl_v_mm3",
        "vormfactor_u",
        "vormfactor_v",
    ] {
        let (a, b) = (getal(&recht, veld), getal(&scheef, veld));
        assert!(
            (a - b).abs() <= 1e-6 * a.abs().max(1.0),
            "{veld} hoort mee te draaien: {a} tegen {b}"
        );
    }

    // Het gedraaide profiel is nog steeds dubbelsymmetrisch: z_j blijft nul.
    dicht(getal(&scheef, "z_j_mm"), 0.0, 1e-6, "z_j gedraaid");

    // De afschuifoppervlakken in de hoofdrichtingen zijn er alleen zolang de
    // hoofdassen met y en z samenvallen — daarna eerlijk "niet bepaald".
    assert!(vlag(&recht, "av_hoofdas_bepaald"));
    assert!(!vlag(&scheef, "av_hoofdas_bepaald"));
    dicht(getal(&scheef, "av_u_mm2"), 0.0, 0.0, "Av;u staat op nul");
    assert!(
        scheef["meldingen"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m.as_str().unwrap().contains("Av;u")),
        "er hoort een melding over Av;u te staan"
    );
}
