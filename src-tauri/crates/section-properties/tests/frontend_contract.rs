//! Het contract tussen de profieleditor en de doorsnedemotor.
//!
//! De editor bouwt zijn JSON in `design-mockup/src/lib/profieleditor/
//! motorInvoer.ts` en stuurt die langs drie wegen naar deze crate: de binary
//! `doorsnedemotor` (generatiescript), het dev-eindpunt `/api/doorsnede` en
//! het Tauri-command `bereken_doorsneden`. Alle drie komen ze uit bij
//! `opdracht::reken`, maar geen van drieën controleert of de VELDNAMEN nog
//! kloppen: `serde` kent geen strikte velden hier, dus een hernoemd veld in
//! TypeScript wordt hier stil een nul.
//!
//! Deze tests bevriezen daarom letterlijk de JSON die de editor verstuurt,
//! overgenomen uit de draaiende app, en leggen er uitkomsten naast die met de
//! hand na te rekenen zijn. Wijkt de frontend af, dan zakt de uitkomst hier
//! zichtbaar in — in plaats van dat de gebruiker een verkeerde doorsnede
//! krijgt.

use section_properties::opdracht::{reken, Invoer};

fn lees(json: &str) -> Invoer {
    serde_json::from_str(json).expect("de JSON van de editor hoort te passen op Invoer")
}

/// De startvorm "SFB-ligger": een HEB 200 met een onderplaat 400 × 15.
///
/// Met de hand: A = 7 808 (HEB 200 uit de catalogus) + 400 · 15 = 6 000, samen
/// 13 808 mm². De buitenmaten zijn 400 breed en 200 + 15 = 215 hoog.
#[test]
fn sfb_uit_de_editor() {
    let invoer = lees(
        r#"{
          "naam": "sfb",
          "soort": "Samenstelling",
          "lamellen": [
            { "b_mm": 400, "t_mm": 15, "y_mm": 0, "z_mm": -107.5, "alpha_rad": 0 }
          ],
          "catalogusdelen": [
            { "soort": "ISection", "h": 200, "b": 200, "tw": 9, "tf": 15, "r": 18,
              "y_mm": 0, "z_mm": 0, "alpha_rad": 0, "gespiegeld": false }
          ],
          "gesloten_cellen": []
        }"#,
    );

    let u = reken(&invoer).expect("de SFB-ligger hoort door de motor te komen");
    let json = serde_json::to_value(&u).unwrap();

    let a = json["area_mm2"].as_f64().unwrap();
    assert!(
        (a - 13_808.0).abs() < 2.0,
        "A hoort 7 808 (HEB 200) + 6 000 (plaat) = 13 808 mm² te zijn, kreeg {a}"
    );

    let hoogte = json["z_max_mm"].as_f64().unwrap() - json["z_min_mm"].as_f64().unwrap();
    let breedte = json["y_max_mm"].as_f64().unwrap() - json["y_min_mm"].as_f64().unwrap();
    assert!((hoogte - 215.0).abs() < 0.5, "hoogte hoort 215 mm te zijn, kreeg {hoogte}");
    assert!((breedte - 400.0).abs() < 0.5, "breedte hoort 400 mm te zijn, kreeg {breedte}");

    // Het zwaartepunt zakt door de onderplaat onder het hart van de HEB.
    let z_c = json["z_c_mm"].as_f64().unwrap();
    assert!(z_c < -30.0 && z_c > -60.0, "zwaartepunt hoort rond −47 mm te liggen, kreeg {z_c}");

    // De plaat is een los stuk plaatwerk: W_pl kan de motor dan niet bepalen,
    // en dat hoort hij te zeggen in plaats van een nul te leveren.
    assert_eq!(json["wpl_bepaald"].as_bool(), Some(false));
}

/// Een catalogusprofiel met een gat door het lijf, zoals de editor het stuurt.
///
/// IPE 300 met een gat van 80 mm door het lijf: er verdwijnt 80 · 7,1 =
/// 568 mm², dus A gaat van 5 381,2 naar 4 813,2 mm².
#[test]
fn lijfgat_uit_de_editor() {
    let invoer = lees(
        r#"{
          "naam": "IPE 300 lijfgat 80",
          "soort": "ISection",
          "h": 300, "b": 150, "tw": 7.1, "tf": 10.7, "r": 15,
          "gaten": [
            { "plaats": "uitsnede", "y": 75, "z": 150, "b": 9.1, "h": 80, "hoek_graden": 0 }
          ]
        }"#,
    );

    let u = reken(&invoer).expect("het lijfgat hoort door de motor te komen");
    let json = serde_json::to_value(&u).unwrap();

    let a = json["area_mm2"].as_f64().unwrap();
    assert!(
        (a - 4_813.2).abs() < 1.0,
        "A hoort 5 381,2 − 80 · 7,1 = 4 813,2 mm² te zijn, kreeg {a}"
    );
    // Twee losse T's: de doorsnede valt uiteen, en dat staat in het antwoord.
    assert_eq!(json["losse_delen"].as_bool(), Some(true));
    assert!(!json["meldingen"].as_array().unwrap().is_empty());
}

/// Een kale rechthoek — de eenvoudigste weg, met gesloten formules ernaast.
#[test]
fn rechthoek_uit_de_editor() {
    let invoer = lees(r#"{ "naam": "100x300", "soort": "Rechthoek", "h": 300, "b": 100 }"#);
    let u = reken(&invoer).expect("een rechthoek hoort altijd te lukken");
    let json = serde_json::to_value(&u).unwrap();

    assert!((json["area_mm2"].as_f64().unwrap() - 30_000.0).abs() < 1e-6);
    // I_y = b·h³/12 = 100 · 300³/12
    assert!((json["iy_mm4"].as_f64().unwrap() - 225_000_000.0).abs() < 1e-3);
    // W_pl,y = b·h²/4 = 100 · 300²/4
    assert!((json["wpl_y_mm3"].as_f64().unwrap() - 2_250_000.0).abs() < 1e-3);
}
