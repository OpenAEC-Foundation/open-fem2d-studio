//! Drie-wegen-verificatie voor de betontoetsing.
//!
//! DE REGEL
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. de MCP-server (deze crate).
//!
//! Drie wegen betekenen drie kansen dat er één uit de pas loopt: een weg die
//! een veld anders leest, een andere standaardwaarde invult, of een andere
//! functie aanroept. Dan geeft dezelfde doorsnede twee plausibele antwoorden en
//! is niet te zien welk van de twee klopt. Deze test sluit dat af: dezelfde
//! JSON-invoer gaat door alle drie de wegen en de antwoorden moeten
//! GELIJK zijn, veld voor veld.
//!
//! HOE ELKE WEG WORDT AANGESPROKEN
//! * **Weg 3 (MCP)** het echtst: de test start de werkelijke binary, doet de
//!   `initialize`-handshake en roept `tools/call` aan over stdio. Er wordt niets
//!   omzeild.
//! * **Weg 2 (toetsbrug)** roept `toetsbrug::behandel` aan — dezelfde functie
//!   die de binary op elke regel stdin uitvoert. Alleen het proces eromheen
//!   ontbreekt; de opdrachtnaam, het lezen van `inputs` en het antwoord zijn
//!   die van de echte toetsbrug.
//! * **Weg 1 (Tauri-command)** kan niet als command worden aangeroepen zonder de
//!   hele Tauri-runtime op te tuigen. Daarom twee dingen: de rekengang van het
//!   command wordt hier letterlijk uitgevoerd
//!   (`concrete_check::check_all_concrete_beams`, precies de body van
//!   `check_concrete_beams`), én de bedrading wordt gecontroleerd op de bron
//!   van `src-tauri/src/lib.rs`. Dat laatste is de enige plek waar deze weg
//!   kan breken zonder dat de rekengang verandert: een command dat niet in
//!   `generate_handler!` staat, bestaat voor de app niet.
//!
//! DE GETALLEN
//! De invoer is de referentiedoorsnede uit
//! `concrete-check/tests/referentie_balk.rs` en
//! `nen-en-1992-1-1/tests/handberekening.rs`: 300 × 500 mm, C30/37, B500B,
//! dekking 30 mm, beugel Ø8, onder 3Ø16, boven 2Ø12. Hier is geen getal
//! verzonnen. De ankerwaarden onderaan pinnen de uitkomst vast, zodat deze test
//! ook merkt dat alle drie de wegen tegelijk verschuiven.
//!
//! WEGLATEN IS OOK EEN TEST
//! De optionele velden (`n_strips`, `steel_branch`, `design_situation`,
//! `apply_min_eccentricity`) staan met opzet NIET in de invoer. Zo toont de
//! test aan dat de drie wegen dezelfde standaardwaarden invullen — een weg die
//! zijn eigen default zou kiezen, valt hier door de mand.
//!
//! STAAL HEEFT ZO'N TEST NOG NIET. Voor `check_steel_beam`/`check_steel_beams`
//! bestaat geen vergelijking tussen de drie wegen; `tests/schema_strikt.rs`
//! toetst alleen de MCP-weg. Deze test is naar vorm bruikbaar om die er alsnog
//! bij te maken.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

// ── De invoer ───────────────────────────────────────────────────────────────

/// De wapeningskorf van de referentiedoorsnede.
fn korf() -> Value {
    json!({
        "cover_mm": 30,
        "stirrup_diameter_mm": 8,
        "top": { "count": 2, "diameter_mm": 12 },
        "bottom": { "count": 3, "diameter_mm": 16 }
    })
}

/// Vrij opgelegde balk, veldmoment 100 kNm, geen normaalkracht.
fn invoer_balk() -> Value {
    json!({
        "beam_id": 7,
        "width_mm": 300,
        "height_mm": 500,
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "length_m": 5,
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 0,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 80, "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } },
            { "combination_id": 1, "position_mm": 2500,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0, "mt_ed": 0, "my_ed": 100, "mz_ed": 0 } },
            { "combination_id": 1, "position_mm": 5000,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": -80, "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } }
        ]
    })
}

/// Kolom onder 800 kN druk met een moment van 60 kNm. Andere tak van de
/// orchestrator dan de balk: het drukpunt telt mee en de minimale
/// excentriciteit van 6.1(4) kan het overnemen.
fn invoer_kolom() -> Value {
    json!({
        "beam_id": 3,
        "width_mm": 300,
        "height_mm": 500,
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "length_m": 3,
        "forces_envelope": [
            { "combination_id": 2, "position_mm": 0,
              "forces": { "n_ed": -800, "vy_ed": 0, "vz_ed": 20, "mt_ed": 0, "my_ed": 60, "mz_ed": 0 } },
            { "combination_id": 2, "position_mm": 3000,
              "forces": { "n_ed": -800, "vy_ed": 0, "vz_ed": -20, "mt_ed": 0, "my_ed": 20, "mz_ed": 0 } }
        ]
    })
}

/// M-N-κ van dezelfde korf bij 800 kN druk.
fn invoer_mn_kappa() -> Value {
    json!({
        "width_mm": 300,
        "height_mm": 500,
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "n_ed_kn": -800,
        "interaction_points": 11
    })
}

// ── Weg 1: de rekengang achter het Tauri-command ────────────────────────────

/// Letterlijk de body van `check_concrete_beams` uit `src-tauri/src/lib.rs`.
fn weg_tauri_check(invoer: &Value) -> Value {
    let inputs: Vec<concrete_check::ConcreteBeamCheckInput> =
        serde_json::from_value(json!([invoer])).expect("ConcreteBeamCheckInput");
    let uit = concrete_check::check_all_concrete_beams(inputs);
    serde_json::to_value(&uit[0]).expect("resultaat serialiseren")
}

/// Letterlijk de body van `concrete_mn_kappa` uit `src-tauri/src/lib.rs`.
fn weg_tauri_mn_kappa(invoer: &Value) -> Value {
    let req: concrete_check::MnKappaRequest =
        serde_json::from_value(invoer.clone()).expect("MnKappaRequest");
    let uit = concrete_check::mn_kappa(req).expect("geldig verzoek");
    serde_json::to_value(uit).expect("resultaat serialiseren")
}

/// De bron van het Tauri-pakket, om de bedrading te controleren.
fn tauri_lib_bron() -> String {
    let pad = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("src")
        .join("lib.rs");
    std::fs::read_to_string(&pad)
        .unwrap_or_else(|e| panic!("{} niet leesbaar: {e}", pad.display()))
}

// ── Weg 2: de toetsbrug ─────────────────────────────────────────────────────

/// Dezelfde functie die de toetsbrug-binary op zijn invoer uitvoert.
fn weg_toetsbrug(opdracht: &str, inputs: Value) -> Value {
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": opdracht, "inputs": inputs }))
            .expect("toetsbrug-verzoek");
    toetsbrug::behandel(verzoek).unwrap_or_else(|e| panic!("toetsbrug {opdracht}: {e}"))
}

// ── Weg 3: de MCP-server over stdio ─────────────────────────────────────────

async fn lees_bericht<R>(reader: &mut R) -> Value
where
    R: AsyncBufReadExt + Unpin,
{
    let mut regel = String::new();
    let n = timeout(Duration::from_secs(60), reader.read_line(&mut regel))
        .await
        .expect("timeout bij het wachten op een antwoord")
        .expect("read_line mislukt");
    assert!(n > 0, "EOF op stdout — de server is onverwacht gestopt");
    serde_json::from_str(regel.trim())
        .unwrap_or_else(|e| panic!("ongeldige JSON-RPC-regel {regel:?}: {e}"))
}

async fn schrijf(stdin: &mut ChildStdin, waarde: Value) {
    let mut regel = serde_json::to_string(&waarde).unwrap();
    regel.push('\n');
    stdin.write_all(regel.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();
}

async fn start_server() -> (Child, ChildStdin, BufReader<ChildStdout>) {
    let mut child = Command::new(BIN_PATH)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("server starten");
    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let mut reader = BufReader::new(stdout);

    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "drie-wegen-beton", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Roep één tool aan en geef `structuredContent` terug. Een toolfout laat de
/// test vallen met de melding erbij — een fout mag hier nooit als "leeg
/// resultaat" doorglippen.
async fn weg_mcp(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    tool: &str,
    argumenten: Value,
) -> Value {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": tool, "arguments": argumenten }
        }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    let result = &resp["result"];
    assert_eq!(
        result["isError"], false,
        "MCP-tool {tool} gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    result["structuredContent"].clone()
}

// ── Vergelijking ────────────────────────────────────────────────────────────

/// Eerste verschil tussen twee antwoorden, met het pad erbij. `None` = gelijk.
///
/// Bewust géén `assert_eq!` op de hele boom: die drukt bij een
/// betontoetsresultaat honderden regels JSON af en dan is niet te zien wélk
/// veld verschilt.
fn verschil(a: &Value, b: &Value, pad: &str) -> Option<String> {
    match (a, b) {
        (Value::Object(ma), Value::Object(mb)) => {
            for (k, va) in ma {
                match mb.get(k) {
                    Some(vb) => {
                        if let Some(v) = verschil(va, vb, &format!("{pad}.{k}")) {
                            return Some(v);
                        }
                    }
                    None => return Some(format!("{pad}.{k} ontbreekt aan de tweede kant")),
                }
            }
            for k in mb.keys() {
                if !ma.contains_key(k) {
                    return Some(format!("{pad}.{k} ontbreekt aan de eerste kant"));
                }
            }
            None
        }
        (Value::Array(la), Value::Array(lb)) => {
            if la.len() != lb.len() {
                return Some(format!(
                    "{pad}: lengte {} tegen {}",
                    la.len(),
                    lb.len()
                ));
            }
            for (i, (va, vb)) in la.iter().zip(lb).enumerate() {
                if let Some(v) = verschil(va, vb, &format!("{pad}[{i}]")) {
                    return Some(v);
                }
            }
            None
        }
        _ => {
            if a == b {
                None
            } else {
                Some(format!("{pad}: {a} tegen {b}"))
            }
        }
    }
}

fn eis_gelijk(naam_a: &str, a: &Value, naam_b: &str, b: &Value) {
    if let Some(v) = verschil(a, b, "") {
        panic!("{naam_a} en {naam_b} lopen uiteen — {v}");
    }
}

fn getal(v: &Value, pad: &[&str]) -> f64 {
    let mut cur = v;
    for p in pad {
        cur = &cur[*p];
    }
    cur.as_f64()
        .unwrap_or_else(|| panic!("{} is geen getal: {cur}", pad.join(".")))
}

// ── De tests ────────────────────────────────────────────────────────────────

/// Weg 1 bestaat: beide betoncommands staan als `#[tauri::command]` in
/// `src-tauri/src/lib.rs` én in `generate_handler!`. Zonder dat tweede is het
/// command voor de app onbereikbaar, terwijl de functie er wél staat — een
/// storing die geen enkele Rust-test opmerkt.
#[test]
fn weg_1_de_tauri_commands_zijn_geregistreerd() {
    let bron = tauri_lib_bron();
    let handler_start = bron
        .find("generate_handler![")
        .expect("`generate_handler!` staat niet in src-tauri/src/lib.rs");
    let handler = &bron[handler_start..];
    let handler_eind = handler.find(']').expect("`generate_handler!` is niet gesloten");
    let handler = &handler[..handler_eind];

    for command in ["check_concrete_beams", "concrete_mn_kappa"] {
        assert!(
            bron.contains(&format!("async fn {command}(")),
            "`{command}` staat niet als functie in src-tauri/src/lib.rs"
        );
        assert!(
            handler.contains(command),
            "`{command}` staat niet in generate_handler! — de app kan hem niet aanroepen"
        );
    }
}

/// De kern van deze taak: dezelfde staaf, drie wegen, één antwoord.
#[tokio::test]
async fn de_drie_wegen_toetsen_dezelfde_staaf_gelijk() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    for (naam, invoer) in [("balk", invoer_balk()), ("kolom", invoer_kolom())] {
        let tauri = weg_tauri_check(&invoer);
        let brug = weg_toetsbrug("check_concrete_beams", json!([invoer]));
        let brug = brug
            .as_array()
            .expect("de toetsbrug levert een lijst")
            .first()
            .expect("één staaf erin, één resultaat eruit")
            .clone();
        let mcp = weg_mcp(&mut stdin, &mut reader, 100, "check_concrete_beam", invoer).await;

        eis_gelijk(
            &format!("{naam}: Tauri-command"),
            &tauri,
            "toetsbrug",
            &brug,
        );
        eis_gelijk(&format!("{naam}: toetsbrug"), &brug, "MCP-server", &mcp);

        // De uitkomst is ook echt een toetsing en geen leeg omhulsel.
        assert!(
            !mcp["checks"].as_array().expect("checks").is_empty(),
            "{naam}: er is geen enkele toets uitgevoerd"
        );
        assert!(
            !mcp["governing_check_id"]
                .as_str()
                .unwrap_or("")
                .starts_with("ERROR"),
            "{naam}: {}",
            mcp["governing_check_id"]
        );
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Hetzelfde voor het M-N-κ-diagram.
#[tokio::test]
async fn de_drie_wegen_leveren_hetzelfde_mn_kappa_diagram() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    let invoer = invoer_mn_kappa();

    let tauri = weg_tauri_mn_kappa(&invoer);
    let brug = weg_toetsbrug("concrete_mn_kappa", invoer.clone());
    let mcp = weg_mcp(&mut stdin, &mut reader, 200, "concrete_mn_kappa", invoer).await;

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    assert!(
        mcp["diagram"]["points"].as_array().expect("points").len() > 10,
        "het diagram is leeg"
    );
    assert_eq!(mcp["interaction_positive"].as_array().unwrap().len(), 11);
    assert_eq!(mcp["interaction_negative"].as_array().unwrap().len(), 11);

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// De twee lijsttools. De MCP-weg pakt de lijst in een object omdat
/// `structuredContent` een object moet zijn; de lijst erbinnen is dezelfde die
/// de andere twee wegen kaal teruggeven.
#[tokio::test]
async fn de_drie_wegen_kennen_dezelfde_sterkteklassen() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    for (tool, sleutel) in [
        ("list_concrete_classes", "classes"),
        ("list_reinforcement_grades", "grades"),
    ] {
        let brug = weg_toetsbrug(tool, Value::Null);
        let mcp = weg_mcp(&mut stdin, &mut reader, 300, tool, json!({})).await;
        eis_gelijk(
            &format!("{tool}: toetsbrug"),
            &brug,
            "MCP-server",
            &mcp[sleutel],
        );
        assert!(!brug.as_array().expect("lijst").is_empty(), "{tool} is leeg");
    }

    // Weg 1: de bron van de lijsten is dezelfde constante uit `nen-en-1992-1-1`
    // die het Tauri-command teruggeeft.
    let bron = tauri_lib_bron();
    assert!(bron.contains("nen_en_1992_1_1::CONCRETE_CLASSES.to_vec()"));
    assert!(bron.contains("nen_en_1992_1_1::REINFORCEMENT_GRADES.to_vec()"));

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Ankerwaarden. Gelijklopen is niet genoeg: drie wegen kunnen samen
/// verschuiven. Deze getallen komen uit de referentie-handberekening
/// (`nen-en-1992-1-1/tests/handberekening.rs`, M_Rd = 113,33 kNm bij deze korf)
/// en uit de kern zelf; ze pinnen de uitkomst van alle drie de wegen vast.
#[tokio::test]
async fn de_uitkomst_zelf_staat_vast() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    let mcp = weg_mcp(&mut stdin, &mut reader, 400, "check_concrete_beam", invoer_balk()).await;

    // Rekenwaarden: f_cd = alpha_cc · f_ck / gamma_C = 1,0 · 30 / 1,5 = 20,0
    // N/mm² (alpha_cc = 1,0 volgens de NB bij 3.1.6(1)P); f_yd = 500 / 1,15 =
    // 434,78 N/mm².
    assert!((getal(&mcp, &["f_cd_mpa"]) - 20.0).abs() < 1e-9);
    assert!((getal(&mcp, &["f_yd_mpa"]) - 434.7826).abs() < 1e-3);
    // Nuttige hoogte d = 500 − 30 − 8 − 16/2 = 454 mm.
    assert!((getal(&mcp, &["d_mm"]) - 454.0).abs() < 1e-9);
    // UC = 100 / 113,33 = 0,882 met het spanningsblok; de M-N-κ-tak komt daar
    // binnen 2 % bij uit, dus uc_max ligt tussen 0,85 en 0,92.
    let uc = getal(&mcp, &["uc_max"]);
    assert!(uc > 0.85 && uc < 0.92, "uc_max = {uc}");
    assert_eq!(mcp["status"], "Ok");
    assert_eq!(mcp["section_name"], "300 x 500");
    assert_eq!(
        mcp["reinforcement_summary"],
        "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
