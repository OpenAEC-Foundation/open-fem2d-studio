//! Het belastinggeval "Eigen gewicht" (`loadCases[].eigenGewicht`) langs de
//! MCP-weg — end-to-end over de echte binary: schema, droogloop, berekening en
//! weigering (issue #42).
//!
//! WAAROM ALS INTEGRATIETEST. De regel "welk geval krijgt het eigen gewicht"
//! zit in de solverbundel (`design-mockup/src/lib/eigenGewicht.ts`, gelezen door
//! `bouwMultiInput`). De bron- en bundeltests bewijzen die regel; deze test
//! bewijst dat het kenmerk ook door het STRIKTE MCP-schema, de sidecarpoort en
//! het antwoordformaat komt — en dat een model ZONDER kenmerk rekent als altijd.
//!
//! De getallen zijn handberekening, niets afgelezen uit de uitkomst zelf. Houten
//! balk C24 (ρ_mean = 420 kg/m³, EN 338 tabel 1), 100 × 400 mm, L = 3 m,
//! g = 9,81 m/s²:
//!   q = ρ·A·g = 420 · 0,04 · 9,81 = 164,808 N/m = 0,164808 kN/m
//!   W = q·L   = 0,494424 kN, per oplegging 0,247212 kN
//! De ingevoerde permanente last is 2 kN/m: ΣRz = 6,000 kN.
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
                "clientInfo": { "name": "eigen-gewicht-geval-mcp", "version": "0.0.0" }
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

/// Vrij opgelegde houten balk van 3 m met 2 kN/m permanent en eigen gewicht aan.
/// `met_kenmerk`: het model draagt het geval "Eigen gewicht" (id 5) vooraan.
fn balk(met_kenmerk: bool) -> Value {
    let mut gevallen = vec![json!({ "id": 1, "name": "Permanent (G)", "type": "dead" })];
    if met_kenmerk {
        gevallen.insert(0, json!({ "id": 5, "name": "Eigen gewicht", "type": "dead", "eigenGewicht": true }));
    }
    json!({
        "nodes": [ { "id": 1, "x": 0, "z": 0 }, { "id": 2, "x": 3000, "z": 0 } ],
        "beams": [ { "id": 1, "from": 1, "to": 2, "material": "C24", "profile": "100x400" } ],
        "supports": [ { "nodeId": 1, "type": "pinned" }, { "nodeId": 2, "type": "zRoller" } ],
        "loadCases": gevallen,
        "loads": [ { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 1, "q": -2 } ],
        "selfWeightEnabled": true
    })
}

const EIGEN_GEWICHT_KN: f64 = 420.0 * 0.04 * 9.81 * 3.0 / 1000.0; // 0,494424 kN
const LAST_KN: f64 = 2.0 * 3.0;

fn som_rz(uit: &Value, geval: &str) -> f64 {
    let reacties = &uit["structuredContent"]["per_case"][geval]["reactions"];
    ["1", "2"]
        .iter()
        .map(|k| reacties[*k]["fz"].as_f64().unwrap_or_else(|| panic!("geen reactie op knoop {k} in geval {geval}: {uit}")))
        .sum()
}

/// Het strikte schema van de belastinggevallen kent het kenmerk, in beide
/// tools die een model aannemen.
#[tokio::test]
async fn schema_kent_het_kenmerk_eigen_gewicht() {
    let lijst = verzoek("tools/list", json!({})).await;
    let tools = lijst["tools"].as_array().expect("tools");
    for naam in ["solve_fem_model", "check_fem_model", "validate_fem_model"] {
        let tool = tools
            .iter()
            .find(|t| t["name"] == naam)
            .unwrap_or_else(|| panic!("{naam} ontbreekt: {lijst}"));
        let geval = &tool["inputSchema"]["properties"]["model"]["properties"]["loadCases"]["items"];
        assert_eq!(geval["additionalProperties"], json!(false), "{naam}: {geval}");
        let veld = &geval["properties"]["eigenGewicht"];
        assert_eq!(veld["type"], json!("boolean"), "{naam}: eigenGewicht ontbreekt in het schema: {geval}");
        assert_eq!(veld["enum"], json!([true]), "{naam}: alleen true is toegestaan: {veld}");
        let beschrijving = veld["description"].as_str().unwrap_or("");
        assert!(beschrijving.contains("eerste") && beschrijving.contains("dead"), "{naam}: {beschrijving}");
    }
}

/// Mét kenmerk landt het eigen gewicht in het eigen geval en NIET in het
/// permanente geval; zonder kenmerk geldt de oude regel.
#[tokio::test]
async fn eigen_gewicht_landt_in_het_gekenmerkte_geval() {
    eis_node().await;

    let met = balk(true);
    let val = tool("validate_fem_model", json!({ "model": met.clone() })).await;
    assert_eq!(val["structuredContent"]["ok"], json!(true), "{val}");
    let uit = tool("solve_fem_model", json!({ "model": met })).await;
    assert_eq!(uit["isError"], json!(false), "de berekening hoort te slagen: {uit}");
    let eg = som_rz(&uit, "5");
    let g = som_rz(&uit, "1");
    assert!((eg - EIGEN_GEWICHT_KN).abs() < 1e-9, "geval 5 hoort {EIGEN_GEWICHT_KN} kN te dragen, niet {eg}");
    assert!((g - LAST_KN).abs() < 1e-9, "geval 1 hoort alleen de ingevoerde {LAST_KN} kN te dragen, niet {g}");

    // Oud model, geen kenmerk: eigen gewicht in het eerste blijvende geval.
    let uit = tool("solve_fem_model", json!({ "model": balk(false) })).await;
    assert_eq!(uit["isError"], json!(false), "{uit}");
    let g = som_rz(&uit, "1");
    assert!(
        (g - (LAST_KN + EIGEN_GEWICHT_KN)).abs() < 1e-9,
        "zonder kenmerk hoort geval 1 last + eigen gewicht te dragen ({}), niet {g}",
        LAST_KN + EIGEN_GEWICHT_KN
    );
}

/// Het kenmerk op een veranderlijk geval, op twee gevallen, met een andere
/// waarde dan true, of een last in het gekenmerkte geval: alle vier geweigerd
/// met een reden, nooit stil.
#[tokio::test]
async fn ongeldig_kenmerk_wordt_geweigerd_met_reden() {
    eis_node().await;

    let mut op_veranderlijk = balk(true);
    op_veranderlijk["loadCases"][0]["type"] = json!("live");
    let mut dubbel = balk(true);
    dubbel["loadCases"][1]["eigenGewicht"] = json!(true);
    let mut last_erin = balk(true);
    last_erin["loads"][0]["caseId"] = json!(5);

    for (model, trefwoord) in [
        (op_veranderlijk, "type \\\"dead\\\""),
        (dubbel, "hoogstens één"),
        (last_erin, "automatisch"),
    ] {
        let val = tool("validate_fem_model", json!({ "model": model.clone() })).await;
        assert_eq!(val["structuredContent"]["ok"], json!(false), "hoort geweigerd te worden: {val}");
        let fouten = val["structuredContent"]["errors"].to_string();
        assert!(fouten.contains(trefwoord), "verwacht {trefwoord:?} in {fouten}");
        let uit = tool("solve_fem_model", json!({ "model": model })).await;
        assert_eq!(uit["isError"], json!(true), "de berekening hoort te weigeren: {uit}");
    }

    // `false` haalt het strikte schema niet eens.
    let mut onwaar = balk(true);
    onwaar["loadCases"][0]["eigenGewicht"] = json!(false);
    let uit = tool("solve_fem_model", json!({ "model": onwaar })).await;
    assert_eq!(uit["isError"], json!(true), "eigenGewicht: false hoort geweigerd te worden: {uit}");
}
