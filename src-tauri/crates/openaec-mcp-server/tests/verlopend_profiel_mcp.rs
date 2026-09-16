//! Verlopend profiel (`profileEnd`) langs de MCP-weg — end-to-end over de echte
//! binary: schema, droogloop, berekening en weigering.
//!
//! WAAROM ALS INTEGRATIETEST. De opdeling van een verlopende staaf in
//! segmenten zit in de solverbundel (`design-mockup/src/lib/modelNaarSolverInput`).
//! De bron- en bundeltests bewijzen die opdeling; deze test bewijst dat het
//! veld ook door het MCP-schema, de sidecarpoort en het antwoordformaat komt,
//! zodat een aanroeper van buiten niet stil een prismatische staaf met het
//! beginprofiel terugkrijgt.
//!
//! De getallen zijn evenwicht, niets afgelezen uit de uitkomst zelf: het eigen
//! gewicht van een houten balk (C24, ρ = 420 kg/m³, EN 338 tabel 1) met
//! b = 100 mm en h lineair van 400 naar 200 mm over L = 3 m is
//!   W = ρ·g·b·(h0+h1)/2·L = 420·9,81·(0,1·0,3)·3 = 370,818 N = 0,370818 kN
//! — de middenregel is exact voor een lineair verlopende A, dus ΣRz is dat
//! gewicht tot op afrondnauwkeurigheid, en de zware kant (knoop 1) draagt meer.
//!
//! LET OP: dit hangt af van de ingebakken solverbundel. Na een wijziging in
//! `design-mockup/src` eerst `npm run build:sidecar`, anders meet deze test de
//! oude bundel. Node ≥ 20 is een harde eis.

use openaec_mcp_server::sidecar::{self, SidecarOpties};
use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

async fn eis_node() {
    let status = sidecar::status(&SidecarOpties::default()).await;
    assert!(
        status.available,
        "Deze test vereist Node.js {} of nieuwer. Gemeld: [{}] {}",
        sidecar::MINIMALE_NODE_MAJOR,
        status.error_code.unwrap_or_default(),
        status.reason.unwrap_or_default()
    );
}

/// Eén JSON-RPC-verzoek op een verse server (na `initialize`); geeft `result`.
async fn verzoek(methode: &str, params: Value) -> Value {
    let mut kind = Command::new(BIN_PATH)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("de MCP-server starten");
    let mut stdin = kind.stdin.take().expect("stdin");
    let mut reader = BufReader::new(kind.stdout.take().expect("stdout"));

    for bericht in [
        json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18", "capabilities": {},
                "clientInfo": { "name": "verlopend-profiel-mcp", "version": "0.0.0" }
            }
        }),
        json!({ "jsonrpc": "2.0", "id": 2, "method": methode, "params": params }),
    ] {
        let mut regel = serde_json::to_string(&bericht).unwrap();
        regel.push('\n');
        stdin.write_all(regel.as_bytes()).await.unwrap();
        stdin.flush().await.unwrap();
    }

    let mut antwoord = Value::Null;
    for _ in 0..2 {
        let mut regel = String::new();
        let n = timeout(Duration::from_secs(120), reader.read_line(&mut regel))
            .await
            .expect("de server antwoordde niet binnen 120 s")
            .expect("read_line mislukte");
        assert!(n > 0, "EOF op stdout — de server stopte onverwacht");
        let bericht: Value = serde_json::from_str(regel.trim())
            .unwrap_or_else(|e| panic!("ongeldige JSON-RPC-regel {regel:?}: {e}"));
        if bericht["id"] == 2 {
            assert!(bericht["error"].is_null(), "JSON-RPC-fout: {bericht}");
            antwoord = bericht["result"].clone();
        }
    }
    drop(stdin);
    let _ = timeout(Duration::from_secs(10), kind.wait()).await;
    antwoord
}

async fn tool(naam: &str, argumenten: Value) -> Value {
    verzoek("tools/call", json!({ "name": naam, "arguments": argumenten })).await
}

/// Vrij opgelegde houten balk van 3 m met eigen gewicht; `eind` is het eindprofiel.
fn balk(eind: &str) -> Value {
    json!({
        "nodes": [ { "id": 1, "x": 0, "z": 0 }, { "id": 2, "x": 3000, "z": 0 } ],
        "beams": [ { "id": 1, "from": 1, "to": 2, "material": "C24", "profile": "100x400", "profileEnd": eind } ],
        "supports": [ { "nodeId": 1, "type": "pinned" }, { "nodeId": 2, "type": "zRoller" } ],
        "loadCases": [ { "id": 1, "name": "G", "type": "dead" } ],
        "loads": [],
        "selfWeightEnabled": true
    })
}

/// Het schema van `solve_fem_model` biedt `profileEnd` aan op de staaf.
#[tokio::test]
async fn schema_kent_het_eindprofiel() {
    let lijst = verzoek("tools/list", json!({})).await;
    let tools = lijst["tools"].as_array().expect("tools");
    let solve = tools
        .iter()
        .find(|t| t["name"] == "solve_fem_model")
        .unwrap_or_else(|| panic!("solve_fem_model ontbreekt: {lijst}"));
    let staaf = &solve["inputSchema"]["properties"]["model"]["properties"]["beams"]["items"];
    assert_eq!(staaf["additionalProperties"], json!(false), "{staaf}");
    let beschrijving = staaf["properties"]["profileEnd"]["description"]
        .as_str()
        .unwrap_or_else(|| panic!("profileEnd ontbreekt in het staafschema: {staaf}"));
    assert!(beschrijving.contains("verlopend"), "{beschrijving}");
}

/// De droogloop keurt de verlopende balk goed en de berekening weegt hem als
/// gemiddelde A · ρ · g · L, met de zware kant op knoop 1.
#[tokio::test]
async fn verlopende_balk_rekent_met_het_plaatselijke_eigen_gewicht() {
    eis_node().await;
    let model = balk("100x200");

    let val = tool("validate_fem_model", json!({ "model": model.clone() })).await;
    assert_eq!(val["isError"], json!(false), "{val}");
    assert_eq!(val["structuredContent"]["ok"], json!(true), "{val}");

    let uit = tool("solve_fem_model", json!({ "model": model })).await;
    assert_eq!(uit["isError"], json!(false), "de berekening hoort te slagen: {uit}");
    let reacties = &uit["structuredContent"]["per_case"]["1"]["reactions"];
    let r1 = reacties["1"]["fz"].as_f64().unwrap_or_else(|| panic!("geen reactie op knoop 1: {uit}"));
    let r2 = reacties["2"]["fz"].as_f64().unwrap_or_else(|| panic!("geen reactie op knoop 2: {uit}"));
    let gewicht_kn = 420.0 * 9.81 * (0.1 * 0.3) * 3.0 / 1000.0; // 0,370818 kN
    assert!(
        (r1 + r2 - gewicht_kn).abs() < 1e-9,
        "ΣRz hoort {gewicht_kn} kN te zijn, niet {} — rekent de MCP prismatisch?",
        r1 + r2
    );
    // Prismatisch met het beginprofiel zou 0,494 kN wegen en symmetrisch dragen.
    assert!(r1 > r2 + 0.01, "de zware kant (h = 400, knoop 1) hoort meer te dragen: R1 {r1}, R2 {r2}");
}

/// Een eindprofiel van een andere doorsnedesoort is een invoerfout met reden —
/// in de droogloop én in de berekening, nooit stil prismatisch.
#[tokio::test]
async fn eindprofiel_van_een_andere_soort_wordt_geweigerd_met_reden() {
    eis_node().await;
    let model = balk("IPE200");

    let val = tool("validate_fem_model", json!({ "model": model.clone() })).await;
    assert_eq!(val["structuredContent"]["ok"], json!(false), "de droogloop hoort het te melden: {val}");
    let fouten = val["structuredContent"]["errors"].to_string();
    assert!(fouten.contains("Staaf 1") && fouten.contains("rechthoek"), "{fouten}");

    let uit = tool("solve_fem_model", json!({ "model": model })).await;
    assert_eq!(uit["isError"], json!(true), "hoort geweigerd te worden: {uit}");
    let fout = &uit["structuredContent"];
    assert_eq!(fout["error_code"], "DOORSNEDE_ONBEKEND", "een invoerfout, geen INTERN: {fout}");
    let melding = fout["melding"].as_str().unwrap_or("");
    assert!(melding.contains("staaf 1") && melding.contains("rechthoek"), "{melding}");
}
