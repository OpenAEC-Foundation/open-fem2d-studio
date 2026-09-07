//! Drie-wegen-verificatie voor de meewerkende flensbreedte (NEN-EN 1992-1-1
//! art. 5.3.2.1).
//!
//! DE REGEL
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. de MCP-server (deze crate).
//!
//! Vergeet er één en de rekengang werkt maar in één omgeving. Deze test stuurt
//! dezelfde JSON door alle drie de wegen en eist veld voor veld hetzelfde
//! antwoord, plus ankerwaarden die met de hand uit figuur 5.2 en (5.7a) zijn
//! nagerekend — want drie wegen kunnen ook samen verschuiven.
//!
//! DE GETALLEN
//! De referentieligger is figuur 5.2 letterlijk: l₁ = 6000 mm (eindveld),
//! l₂ = 5000 mm (binnenveld), l₃ = 2000 mm (uitkraging), links vrij opgelegd.
//! T-doorsnede b_w = 300 mm, b₁ = b₂ = 1000 mm. De handberekening staat in
//! `nen-en-1992-1-1/tests/meewerkende_flensbreedte.rs` en is hieronder per
//! gebied herhaald.
//!
//! WEGLATEN IS OOK EEN TEST
//! `beam_id` staat met opzet NIET in de invoer: het veld heeft
//! `#[serde(default)]`, en een weg die daar zijn eigen waarde zou invullen
//! valt hier door de mand.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");
const TOOL: &str = "concrete_effective_flange_width";

// ── De invoer ───────────────────────────────────────────────────────────────

/// De ligger van figuur 5.2 met een T-doorsnede.
fn invoer_figuur_5_2() -> Value {
    json!({
        "line": {
            "spans_mm": [6000.0, 5000.0, 2000.0],
            "start": "Support",
            "end": "Free"
        },
        "flange": { "b_w_mm": 300.0, "b_i_mm": [1000.0, 1000.0] }
    })
}

/// Het portaal uit de proef, MET een plaats: één overspanning van 12 m tussen
/// twee kolommen, dus twee momentvaste uiteinden, en het staafmidden op
/// x = 6000 mm. Daarmee draagt het antwoord de uitgeschreven afleiding.
///
/// Handberekening (figuur 5.2 en (5.7a)):
/// l₀ = 0,7·12000 = 8400; b_i = 2000; b_eff,i = min(1240; 1680; 2000) = 1240;
/// b_eff = 2·1240 + 300 = 2780.
fn invoer_portaal_met_plaats() -> Value {
    json!({
        "line": { "spans_mm": [12000.0], "start": "Restrained", "end": "Restrained" },
        "flange": { "b_w_mm": 300.0, "b_i_mm": [2000.0, 2000.0] },
        "x_mm": 6000.0
    })
}

/// Een geval dat de geldigheidsvoorwaarde van de OPMERKING bij figuur 5.2 niet
/// haalt: de uitkraging is 2600 mm en de helft van de aangrenzende
/// overspanning is 2500 mm.
fn invoer_te_lange_uitkraging() -> Value {
    json!({
        "line": {
            "spans_mm": [6000.0, 5000.0, 2600.0],
            "start": "Support",
            "end": "Free"
        },
        "flange": { "b_w_mm": 300.0, "b_i_mm": [1000.0, 1000.0] }
    })
}

// ── Weg 1: de rekengang achter het Tauri-command ────────────────────────────

/// Letterlijk de body van `concrete_effective_flange_width` uit
/// `src-tauri/src/lib.rs`.
fn weg_tauri(invoer: &Value) -> Result<Value, String> {
    let req: nen_en_1992_1_1::EffectiveFlangeWidthRequest =
        serde_json::from_value(invoer.clone()).expect("EffectiveFlangeWidthRequest");
    let uit = nen_en_1992_1_1::beff::effective_flange_width_request(req)?;
    Ok(serde_json::to_value(uit).expect("resultaat serialiseren"))
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

fn weg_toetsbrug(inputs: Value) -> Result<Value, String> {
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": TOOL, "inputs": inputs }))
            .expect("toetsbrug-verzoek");
    toetsbrug::behandel(verzoek)
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
                "clientInfo": { "name": "drie-wegen-beff", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Roep de tool aan. Bij succes `structuredContent`, bij een toolfout de
/// meldingstekst — want dat is hier óók een uitkomst die moet kloppen.
async fn weg_mcp(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    argumenten: Value,
) -> Result<Value, String> {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": TOOL, "arguments": argumenten }
        }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    if !resp["error"].is_null() {
        return Err(resp["error"]["message"]
            .as_str()
            .unwrap_or_default()
            .to_string());
    }
    let result = &resp["result"];
    if result["isError"] == json!(true) {
        return Err(result["content"][0]["text"]
            .as_str()
            .unwrap_or_default()
            .to_string());
    }
    Ok(result["structuredContent"].clone())
}

// ── Vergelijking ────────────────────────────────────────────────────────────

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
                return Some(format!("{pad}: lengte {} tegen {}", la.len(), lb.len()));
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

// ── De tests ────────────────────────────────────────────────────────────────

/// Weg 1 bestaat: het command staat als `#[tauri::command]` in
/// `src-tauri/src/lib.rs` én in `generate_handler!`. Zonder dat tweede is het
/// voor de app onbereikbaar terwijl de functie er wél staat — een storing die
/// geen enkele andere Rust-test opmerkt.
#[test]
fn weg_1_het_tauri_command_is_geregistreerd() {
    let bron = tauri_lib_bron();
    let handler_start = bron
        .find("generate_handler![")
        .expect("`generate_handler!` staat niet in src-tauri/src/lib.rs");
    let handler = &bron[handler_start..];
    let handler_eind = handler.find(']').expect("`generate_handler!` is niet gesloten");
    let handler = &handler[..handler_eind];

    assert!(
        bron.contains(&format!("async fn {TOOL}(")),
        "`{TOOL}` staat niet als functie in src-tauri/src/lib.rs"
    );
    assert!(
        handler.contains(TOOL),
        "`{TOOL}` staat niet in generate_handler! — de app kan hem niet aanroepen"
    );
}

/// Dezelfde ligger, drie wegen, één antwoord.
#[tokio::test]
async fn de_drie_wegen_leveren_dezelfde_verdeling() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let invoer = invoer_figuur_5_2();
    let tauri = weg_tauri(&invoer).expect("Tauri-weg");
    let brug = weg_toetsbrug(invoer.clone()).expect("toetsbrug-weg");
    let mcp = weg_mcp(&mut stdin, &mut reader, 600, invoer)
        .await
        .expect("MCP-weg");

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Ankerwaarden, met de hand uit figuur 5.2 en (5.7a) nagerekend:
///
/// ```text
///   eindveld        l0 = 0,85·6000        = 5100   b_eff,i = 0,2·1000+0,1·5100 = 710
///                                                  b_eff   = 710+710+300      = 1720
///   tussensteunpunt l0 = 0,15·(6000+5000) = 1650   0,2·l0 = 330 is maatgevend
///                                                  b_eff   = 330+330+300      =  960
///   binnenveld      l0 = 0,7·5000         = 3500   b_eff,i = 200+350          =  550
///                                                  b_eff   = 550+550+300      = 1400
///   uitkraging      l0 = 0,15·5000+2000   = 2750   b_eff,i = 200+275          =  475
///                                                  b_eff   = 475+475+300      = 1250
/// ```
#[tokio::test]
async fn de_uitkomst_zelf_staat_vast() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let uit = weg_mcp(&mut stdin, &mut reader, 601, invoer_figuur_5_2())
        .await
        .expect("MCP-weg");
    let zones = uit["distribution"]["zones"]
        .as_array()
        .expect("zones")
        .clone();
    assert_eq!(zones.len(), 4, "vier gebieden, precies figuur 5.2");

    let verwacht = [
        ("EndSpan", 5100.0, 1720.0),
        ("InteriorSupport", 1650.0, 960.0),
        ("InteriorSpan", 3500.0, 1400.0),
        ("Cantilever", 2750.0, 1250.0),
    ];
    for (i, (geval, l0, b_eff)) in verwacht.iter().enumerate() {
        assert_eq!(zones[i]["zone"]["case"], json!(geval), "geval van gebied {i}");
        let gemeten_l0 = zones[i]["zone"]["l0_mm"].as_f64().expect("l0_mm");
        let gemeten_b = zones[i]["b_eff_mm"].as_f64().expect("b_eff_mm");
        assert!(
            (gemeten_l0 - l0).abs() < 1e-9,
            "gebied {i}: l0 {gemeten_l0} ≠ {l0}"
        );
        assert!(
            (gemeten_b - b_eff).abs() < 1e-9,
            "gebied {i}: b_eff {gemeten_b} ≠ {b_eff}"
        );
    }
    // `beam_id` stond niet in de invoer en valt op 0 terug.
    assert_eq!(uit["beam_id"], json!(0));

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// De UITGESCHREVEN AFLEIDING reist ook langs alle drie de wegen, en zij
/// bevat de getallen van de handberekening.
///
/// Zonder deze test kan de keten in één weg wél en in een andere niet
/// meekomen — precies de storing waarvoor deze hele testset bestaat. Dat de
/// keten uit de kern komt en niet uit de frontend is juist waarom hij hier
/// hoort: een rapport dat in de app een afleiding toont en via de MCP-server
/// niet, is twee producten.
#[tokio::test]
async fn de_uitgeschreven_afleiding_gaat_langs_alle_drie_de_wegen_mee() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let invoer = invoer_portaal_met_plaats();
    let tauri = weg_tauri(&invoer).expect("Tauri-weg");
    let brug = weg_toetsbrug(invoer.clone()).expect("toetsbrug-weg");
    let mcp = weg_mcp(&mut stdin, &mut reader, 603, invoer)
        .await
        .expect("MCP-weg");

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    let toegepast = &mcp["applied"];
    assert!(!toegepast.is_null(), "`applied` ontbreekt terwijl x_mm meeging");
    assert_eq!(toegepast["x_mm"], json!(6000.0));
    let b_eff = toegepast["b_eff_mm"].as_f64().expect("b_eff_mm");
    assert!((b_eff - 2780.0).abs() < 1e-9, "b_eff {b_eff} ≠ 2780");

    let stappen = toegepast["deelstappen"].as_array().expect("deelstappen");
    let ids: Vec<&str> = stappen
        .iter()
        .map(|d| d["id"].as_str().expect("id"))
        .collect();
    assert_eq!(
        ids,
        vec![
            "beff_liggerlijn",
            "beff_l0",
            "beff_deel_1",
            "beff_deel_2",
            "beff_totaal",
            "beff_geldigheid"
        ]
    );
    // De drie getallen van de handberekening staan in de ingevulde regels.
    let l0 = &stappen[1];
    assert_eq!(l0["value"], json!(8400.0));
    assert!(
        l0["ingevuld_latex"].as_str().unwrap().contains("12000"),
        "l0-regel toont de overspanning niet: {}",
        l0["ingevuld_latex"]
    );
    assert_eq!(stappen[2]["value"], json!(1240.0));
    assert_eq!(stappen[4]["value"], json!(2780.0));
    // Elke stap draagt zijn vindplaats.
    for stap in stappen {
        let artikel = stap["article"].as_str().expect("article");
        assert!(
            artikel.starts_with("NEN-EN 1992-1-1"),
            "stap {} heeft vindplaats {artikel:?}",
            stap["id"]
        );
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Zonder `x_mm` is er geen gebied en dus geen afleiding — langs alle drie de
/// wegen `null`, en geen weg die zelf een plaats verzint.
#[tokio::test]
async fn zonder_plaats_komt_er_geen_afleiding_terug() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let uit = weg_mcp(&mut stdin, &mut reader, 604, invoer_figuur_5_2())
        .await
        .expect("MCP-weg");
    assert_eq!(uit["applied"], Value::Null);
    let tauri = weg_tauri(&invoer_figuur_5_2()).expect("Tauri-weg");
    assert_eq!(tauri["applied"], Value::Null);
    let brug = weg_toetsbrug(invoer_figuur_5_2()).expect("toetsbrug-weg");
    assert_eq!(brug["applied"], Value::Null);

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een niet-gehaalde geldigheidsvoorwaarde is langs alle drie de wegen een
/// FOUT met de reden, en nergens een getal.
#[tokio::test]
async fn een_ongeldig_geval_faalt_langs_alle_drie_de_wegen() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let invoer = invoer_te_lange_uitkraging();
    let tauri = weg_tauri(&invoer).unwrap_err();
    let brug = weg_toetsbrug(invoer.clone()).unwrap_err();
    let mcp = weg_mcp(&mut stdin, &mut reader, 602, invoer)
        .await
        .unwrap_err();

    for (weg, melding) in [("Tauri", &tauri), ("toetsbrug", &brug), ("MCP", &mcp)] {
        assert!(
            melding.contains("2600") && melding.contains("2500"),
            "{weg} meldt de reden niet met getallen: {melding}"
        );
        assert!(
            melding.contains("figuur"),
            "{weg} meldt de vindplaats niet: {melding}"
        );
    }
    assert_eq!(tauri, brug, "Tauri en toetsbrug melden verschillend");
    assert!(
        mcp.contains(&tauri),
        "de MCP-melding bevat de kernmelding niet:\n  MCP:   {mcp}\n  kern:  {tauri}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
