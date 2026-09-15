//! Polygoonplaat met meshcache en rand-index — end-to-end over de echte binary.
//!
//! WAT HIER MISGING (gemeten, september 2026)
//! 1. `solve_fem_model` met een geldige polygoonplaat en meshcache weigerde met
//!    "CDT-rekenmesh ontbreekt", terwijl `validate_fem_model` hetzelfde model
//!    goedkeurde: de mapping gaf de cache niet door en de engine zocht hem in
//!    een doorgeefluik dat alleen de GUI vulde.
//! 2. Kreeg de engine de cache wél, dan viel een randlast met `edgeIndex` stil
//!    weg (de mapping gaf `edgeIndex` niet door): een geslaagde berekening
//!    zonder die last.
//! 3. Een benoemde rand (`edge`) op een polygoonplaat verdween zonder melding.
//! 4. Een meshcache zonder `edgeNodeIndices` kwam door schema en poort en liet
//!    de engine crashen.
//!
//! De getallen zijn evenwicht: −10 kN/m over rand 5 van 1 m lengte geeft
//! ΣRz = +10 kN. Niets afgelezen uit de uitkomst zelf.
//!
//! LET OP: dit hangt af van de ingebakken solverbundel. Na een wijziging in
//! `design-mockup/src` eerst `npm run build:sidecar`, anders meet deze test de
//! oude bundel. Node ≥ 20 is een harde eis.

use openaec_mcp_server::sidecar::{self, SidecarOpties};
use serde_json::{json, Value};
use std::collections::HashMap;
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
                "clientInfo": { "name": "plaat-polygoon-mcp", "version": "0.0.0" }
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

// ── De L-schijf ─────────────────────────────────────────────────────────────
// Hoeken (mm) (0,0)-(2000,0)-(2000,1000)-(1000,1000)-(1000,2000)-(0,2000),
// meshSize 500: 21 punten en 24 driehoeken, randconform — dezelfde schijf als
// `design-mockup/test-plaat-polygoon.mjs`.

const HOEKEN: [(i64, i64); 6] = [(0, 0), (2000, 0), (2000, 1000), (1000, 1000), (1000, 2000), (0, 2000)];
const S: i64 = 500;

fn meshcache(met_randknopen: bool) -> Value {
    let mut punten: Vec<(i64, i64)> = Vec::new();
    let mut index: HashMap<(i64, i64), usize> = HashMap::new();
    let mut punt = |p: (i64, i64), punten: &mut Vec<(i64, i64)>| -> usize {
        *index.entry(p).or_insert_with(|| {
            punten.push(p);
            punten.len() - 1
        })
    };
    let binnen = |x: i64, z: i64| (x <= 2000 && z <= 1000) || (x <= 1000 && z <= 2000);
    let mut driehoeken: Vec<[usize; 3]> = Vec::new();
    for x in (0..2000).step_by(S as usize) {
        for z in (0..2000).step_by(S as usize) {
            if !binnen(x + S / 2, z + S / 2) {
                continue;
            }
            let bl = punt((x, z), &mut punten);
            let br = punt((x + S, z), &mut punten);
            let tr = punt((x + S, z + S), &mut punten);
            let tl = punt((x, z + S), &mut punten);
            driehoeken.push([bl, br, tr]);
            driehoeken.push([bl, tr, tl]);
        }
    }
    let mut randen: Vec<Vec<usize>> = Vec::new();
    for i in 0..HOEKEN.len() {
        let (ax, az) = HOEKEN[i];
        let (bx, bz) = HOEKEN[(i + 1) % HOEKEN.len()];
        let lengte = (((bx - ax).pow(2) + (bz - az).pow(2)) as f64).sqrt();
        let n = (lengte / S as f64).round() as i64;
        randen.push(
            (0..=n)
                .map(|s| punt((ax + s * (bx - ax) / n, az + s * (bz - az) / n), &mut punten))
                .collect(),
        );
    }
    let handtekening = format!(
        "m{S}|{}",
        HOEKEN.iter().map(|(x, z)| format!("{x},{z}")).collect::<Vec<_>>().join(";")
    );
    let mut cache = json!({
        "signature": handtekening,
        "points": punten.iter().map(|(x, z)| json!({ "x": x, "z": z })).collect::<Vec<_>>(),
        "triangles": driehoeken,
    });
    if met_randknopen {
        cache["edgeNodeIndices"] = json!(randen);
    }
    cache
}

fn l_schijf(last: Value, met_randknopen: bool) -> Value {
    let mut randlast = json!({ "id": 1, "type": "edgeLoad", "caseId": 1, "plateId": 1, "q": -10, "qDir": "z" });
    for (k, v) in last.as_object().unwrap() {
        randlast[k] = v.clone();
    }
    json!({
        "nodes": HOEKEN.iter().enumerate()
            .map(|(i, (x, z))| json!({ "id": i + 1, "x": x, "z": z })).collect::<Vec<_>>(),
        "beams": [],
        "supports": [
            { "nodeId": 1, "type": "pinned" },
            { "nodeId": 2, "type": "zRoller" },
            { "nodeId": 6, "type": "xRoller" }
        ],
        "plates": [{
            "id": 1, "nodeIds": [1, 2, 3, 4, 5, 6],
            "thickness": 20, "E": 210000, "nu": 0.3, "rho": 7850, "meshSize": 500,
            "meshCache": meshcache(met_randknopen)
        }],
        "loadCases": [{ "id": 1, "name": "Q", "type": "live" }],
        "loads": [randlast]
    })
}

// ── De tests ────────────────────────────────────────────────────────────────

/// Het schema dat een client ziet, eist de randknopen van een meshcache.
#[tokio::test]
async fn schema_van_de_meshcache_eist_randknopen() {
    let lijst = verzoek("tools/list", json!({})).await;
    let solve = lijst["tools"]
        .as_array()
        .expect("tools")
        .iter()
        .find(|t| t["name"] == "solve_fem_model")
        .expect("solve_fem_model staat in tools/list")
        .clone();
    let cache = &solve["inputSchema"]["properties"]["model"]["properties"]["plates"]["items"]["properties"]["meshCache"];
    let verplicht: Vec<&str> = cache["required"]
        .as_array()
        .expect("required")
        .iter()
        .filter_map(Value::as_str)
        .collect();
    assert!(verplicht.contains(&"edgeNodeIndices"), "required: {verplicht:?}");
}

/// Geldige polygoonplaat met cache en `edgeIndex`: de droogloop keurt hem goed
/// én de berekening rekent de randlast mee.
#[tokio::test]
async fn polygoonplaat_met_rand_index_rekent_de_randlast_mee() {
    eis_node().await;
    let model = l_schijf(json!({ "edgeIndex": 4 }), true);

    let val = tool("validate_fem_model", json!({ "model": model.clone() })).await;
    assert_eq!(val["isError"], json!(false), "{val}");
    assert_eq!(val["structuredContent"]["ok"], json!(true), "{val}");

    let uit = tool("solve_fem_model", json!({ "model": model })).await;
    assert_eq!(uit["isError"], json!(false), "de berekening hoort te slagen: {uit}");
    let reacties = uit["structuredContent"]["per_case"]["1"]["reactions"]
        .as_object()
        .unwrap_or_else(|| panic!("geen reacties: {uit}"));
    let som: f64 = reacties.values().map(|r| r["fz"].as_f64().unwrap()).sum();
    assert!(
        (som - 10.0).abs() < 1e-6,
        "ΣRz hoort +10 kN te zijn (−10 kN/m over 1 m), niet {som} — valt de randlast weg?"
    );
}

/// Een benoemde rand op een polygoon is geen rand: weigeren, met de remedie.
#[tokio::test]
async fn benoemde_rand_op_een_polygoon_wordt_geweigerd_met_reden() {
    eis_node().await;
    let uit = tool("solve_fem_model", json!({ "model": l_schijf(json!({ "edge": "top" }), true) })).await;
    assert_eq!(uit["isError"], json!(true), "hoort geweigerd te worden, niet stil zonder last: {uit}");
    let fout = &uit["structuredContent"];
    assert_eq!(fout["error_code"], json!("MODEL_ONOPLOSBAAR"), "{fout}");
    let melding = fout["melding"].as_str().unwrap_or_default();
    assert!(
        melding.contains("polygoon") && melding.contains("edgeIndex"),
        "de melding hoort de oorzaak en de remedie te noemen: {melding}"
    );

    let val = tool("validate_fem_model", json!({ "model": l_schijf(json!({ "edge": "top" }), true) })).await;
    assert_eq!(val["structuredContent"]["ok"], json!(false), "de droogloop hoort het ook te melden: {val}");
}

/// Een meshcache zonder randknopen: invoerfout vóór het rekenen, geen crash.
#[tokio::test]
async fn meshcache_zonder_randknopen_is_een_invoerfout() {
    eis_node().await;
    let uit = tool("solve_fem_model", json!({ "model": l_schijf(json!({ "edgeIndex": 4 }), false) })).await;
    assert_eq!(uit["isError"], json!(true), "{uit}");
    let fout = &uit["structuredContent"];
    assert_eq!(fout["error_code"], json!("INVOER_ONGELDIG"), "{fout}");
    assert!(fout.to_string().contains("edgeNodeIndices"), "de melding hoort het veld te noemen: {fout}");
}
