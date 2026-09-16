//! Drie-wegen-verificatie voor de kruipcoëfficiënt volgens NEN-EN 1992-1-1
//! bijlage B (B.1–B.9).
//!
//! Dezelfde JSON gaat door het Tauri-command (de body letterlijk), de toetsbrug
//! en de draaiende MCP-server; de antwoorden moeten veld voor veld gelijk zijn.
//! Daarnaast een ankerwaarde uit de handberekening in
//! `nen-en-1992-1-1/tests/kruip_bijlage_b.rs` — drie wegen kunnen ook samen
//! verschuiven — en de weigeringen, want een toolfout met reden is óók een
//! uitkomst die langs alle drie de wegen gelijk moet zijn.
//!
//! ANKER. Rechthoek 300 × 500: A_c = 150 000 mm², u = 1600 mm, h₀ = 187,5 mm.
//! C30/37 (f_cm = 38 MPa > 35), RH 50 %, t₀ = 28 d, cement N:
//!
//! ```text
//! (B.8c) α₁ = 0,944059; α₂ = 0,983687
//! (B.3b) ∛187,5 = 5,723571; (1 − 0,5)/(0,1 · 5,723571) = 0,873580
//!        φ_RH = [1 + 0,873580 · 0,944059] · 0,983687 = 1,794945
//! (B.4)  β(f_cm) = 2,725320      (B.5) β(t₀) = 0,488450
//! (B.2)  φ(∞,t₀) = 1,794945 · 2,725320 · 0,488450 = 2,389397
//! ```

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");
const TOOL: &str = "concrete_creep_coefficient";

fn invoer_doorsnede() -> Value {
    json!({
        "concrete_class": "C30/37",
        "relative_humidity_pct": 50.0,
        "t0_days": 28.0,
        "cement_class": "N",
        "section": { "shape": "Rectangle", "b_mm": 300.0, "h_mm": 500.0 }
    })
}

fn invoer_h0_met_tijdstip() -> Value {
    json!({
        "beam_id": 4,
        "concrete_class": "C45/55",
        "relative_humidity_pct": 80.0,
        "t0_days": 7.0,
        "cement_class": "R",
        "h0_mm": 300.0,
        "t_days": 25550.0
    })
}

fn invoer_twee_bronnen() -> Value {
    json!({
        "concrete_class": "C30/37",
        "relative_humidity_pct": 50.0,
        "t0_days": 28.0,
        "cement_class": "N",
        "section": { "shape": "Rectangle", "b_mm": 300.0, "h_mm": 500.0 },
        "h0_mm": 150.0
    })
}

fn invoer_rh_te_hoog() -> Value {
    json!({
        "concrete_class": "C30/37",
        "relative_humidity_pct": 120.0,
        "t0_days": 28.0,
        "cement_class": "N",
        "h0_mm": 150.0
    })
}

/// Letterlijk de body van `concrete_creep_coefficient` uit `src-tauri/src/lib.rs`.
fn weg_tauri(invoer: &Value) -> Result<Value, String> {
    let req: nen_en_1992_1_1::CreepCoefficientRequest =
        serde_json::from_value(invoer.clone()).map_err(|e| e.to_string())?;
    let uit = nen_en_1992_1_1::kruip::creep_coefficient_request(req)?;
    Ok(serde_json::to_value(uit).expect("resultaat serialiseren"))
}

fn weg_toetsbrug(inputs: Value) -> Result<Value, String> {
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": TOOL, "inputs": inputs }))
            .expect("toetsbrug-verzoek");
    toetsbrug::behandel(verzoek)
}

async fn lees_bericht<R: AsyncBufReadExt + Unpin>(reader: &mut R) -> Value {
    let mut regel = String::new();
    let n = timeout(Duration::from_secs(60), reader.read_line(&mut regel))
        .await
        .expect("timeout bij het wachten op een antwoord")
        .expect("read_line mislukt");
    assert!(n > 0, "EOF op stdout — de server is onverwacht gestopt");
    serde_json::from_str(regel.trim()).expect("geldige JSON-RPC-regel")
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
    let mut reader = BufReader::new(child.stdout.take().expect("stdout"));
    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "drie-wegen-kruip", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");
    (child, stdin, reader)
}

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
        return Err(resp["error"]["message"].as_str().unwrap_or_default().to_string());
    }
    let result = &resp["result"];
    if result["isError"] == json!(true) {
        return Err(result["content"][0]["text"].as_str().unwrap_or_default().to_string());
    }
    Ok(result["structuredContent"].clone())
}

#[test]
fn weg_1_het_tauri_command_is_geregistreerd() {
    let pad = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src/lib.rs");
    let bron = std::fs::read_to_string(&pad).expect("src-tauri/src/lib.rs leesbaar");
    assert!(bron.contains(&format!("async fn {TOOL}(")));
    let start = bron.find("generate_handler![").expect("generate_handler!");
    let handler = &bron[start..];
    let handler = &handler[..handler.find(']').unwrap()];
    assert!(handler.contains(TOOL), "`{TOOL}` staat niet in generate_handler!");
}

#[tokio::test]
async fn de_drie_wegen_leveren_hetzelfde_antwoord() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    for (id, invoer) in [(900, invoer_doorsnede()), (901, invoer_h0_met_tijdstip())] {
        let tauri = weg_tauri(&invoer).expect("Tauri-weg");
        let brug = weg_toetsbrug(invoer.clone()).expect("toetsbrug");
        let mcp = weg_mcp(&mut stdin, &mut reader, id, invoer.clone()).await.expect("MCP");
        assert_eq!(tauri, brug, "Tauri en toetsbrug lopen uiteen");
        assert_eq!(tauri, mcp, "Tauri en MCP lopen uiteen");
    }

    // Anker uit de handberekening in de moduletekst.
    let uit = weg_tauri(&invoer_doorsnede()).unwrap();
    let h0 = uit["uitkomst"]["h0_mm"].as_f64().unwrap();
    let phi = uit["uitkomst"]["phi_inf_t0"].as_f64().unwrap();
    assert!((h0 - 187.5).abs() < 1e-9, "h₀ = {h0}");
    assert!(((phi - 2.389397) / 2.389397).abs() < 1e-5, "φ(∞,t₀) = {phi}");

    // De tweede invoer draagt t: β_c en φ(t,t₀) moeten er zijn; 1,472752 uit
    // de handberekening van C45/55 in de kern-tests.
    let uit = weg_tauri(&invoer_h0_met_tijdstip()).unwrap();
    assert_eq!(uit["beam_id"], 4);
    let phi_t = uit["uitkomst"]["phi_t_t0"].as_f64().unwrap();
    assert!(((phi_t - 1.472752) / 1.472752).abs() < 1e-5, "φ(t,t₀) = {phi_t}");

    child.kill().await.ok();
}

#[tokio::test]
async fn weigeringen_zijn_langs_alle_drie_de_wegen_gelijk() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    for (id, invoer, kern) in [
        (910, invoer_twee_bronnen(), "niet allebei"),
        (911, invoer_rh_te_hoog(), "RH"),
    ] {
        let tauri = weg_tauri(&invoer).unwrap_err();
        let brug = weg_toetsbrug(invoer.clone()).unwrap_err();
        assert!(tauri.contains(kern), "Tauri: {tauri}");
        assert!(brug.contains(kern), "toetsbrug: {brug}");
        let mcp = weg_mcp(&mut stdin, &mut reader, id, invoer).await;
        // Het strikte schema mag RH = 120 al vóór de kern weigeren; dan is de
        // melding anders maar blijft het een weigering.
        assert!(mcp.is_err(), "MCP gaf een getal op onzinnige invoer: {mcp:?}");
    }
    // Een onbekend veld wordt geweigerd, niet stil genegeerd.
    let mut tik = invoer_doorsnede();
    tik["relative_humidity"] = json!(50.0);
    assert!(weg_tauri(&tik).is_err());
    assert!(weg_toetsbrug(tik.clone()).is_err());
    assert!(weg_mcp(&mut stdin, &mut reader, 920, tik).await.is_err());
    child.kill().await.ok();
}
