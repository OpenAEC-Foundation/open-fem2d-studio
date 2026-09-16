//! Platen in `check_fem_model` — end-to-end over de echte binary.
//!
//! WAT HIER VASTLIGT
//! * Een stalen wandschijf wordt doorgerekend én getoetst in één aanroep: de
//!   solverbundel bouwt `plate_check_inputs` met dezelfde bouwer als de app, en
//!   de server toetst ze met `plaat_check::check_all_plates`.
//! * Elke plaat is verantwoord: getoetst (`plate_results`), geweigerd met reden
//!   (`plate_results[].geweigerd`) of overgeslagen met reden
//!   (`skipped_plates`). Een plaat die nergens staat, leest als in orde.
//!
//! DE HANDBEREKENING — dezelfde trekwand als
//! `design-mockup/test-plaat-toets-staal.mjs`:
//!   B = 2000 mm, H = 3000 mm, t = 20 mm; onderrand op zRollers met het midden
//!   scharnierend (vrije dwarscontractie) → σ_y = p/t, σ_x = τ = 0.
//!   p = 1000 kN/m op de bovenrand → p/t = 50 N/mm².
//!   UGT 3,0·Q: σ_y = 150 N/mm²; S235, t ≤ 40 mm → f_y = 235 N/mm² (tabel 3.1),
//!   γ_M0 = 1,00 → UC = 150/235 = 0,638298 (elementgemiddeld, binnen 2 %).
//!
//! LET OP: hangt af van de ingebakken solverbundel. Na een wijziging in
//! `design-mockup/src` eerst `npm run build:sidecar`.

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

async fn check_fem_model(argumenten: Value) -> Value {
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
                "clientInfo": { "name": "plaat-in-check-fem-model", "version": "0.0.0" }
            }
        }),
        json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": { "name": "check_fem_model", "arguments": argumenten }
        }),
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
        let bericht: Value = serde_json::from_str(regel.trim()).unwrap();
        if bericht["id"] == 2 {
            assert!(bericht["error"].is_null(), "JSON-RPC-fout: {bericht}");
            let result = &bericht["result"];
            assert_eq!(result["isError"], false, "toolfout: {}", result["content"][0]["text"]);
            antwoord = result["structuredContent"].clone();
        }
    }
    drop(stdin);
    let _ = timeout(Duration::from_secs(10), kind.wait()).await;
    antwoord
}

fn wand(materiaal: Option<&str>) -> Value {
    let mut nodes: Vec<Value> = (0..=4).map(|i| json!({ "id": 1 + i, "x": i * 500, "z": 0 })).collect();
    nodes.push(json!({ "id": 6, "x": 0, "z": 3000 }));
    nodes.push(json!({ "id": 7, "x": 2000, "z": 3000 }));
    let supports: Vec<Value> = (1..=5)
        .map(|id| json!({ "nodeId": id, "type": if id == 3 { "pinned" } else { "zRoller" } }))
        .collect();
    let mut plaat = json!({ "id": 1, "nodeIds": [1, 5, 7, 6], "thickness": 20, "meshSize": 500 });
    match materiaal {
        Some(m) => plaat["materiaal"] = json!(m),
        None => {
            plaat["E"] = json!(210000);
            plaat["nu"] = json!(0.3);
            plaat["rho"] = json!(7850);
        }
    }
    json!({
        "nodes": nodes,
        "beams": [],
        "supports": supports,
        "plates": [plaat],
        "loadCases": [{ "id": 1, "name": "Q", "type": "live" }],
        "loads": [{ "id": 1, "type": "edgeLoad", "caseId": 1, "plateId": 1, "edge": "top", "q": 1000, "qDir": "z" }]
    })
}

fn combinaties() -> Value {
    json!([
        { "id": 1, "name": "UGT 1,5·Q", "type": "uls", "formula": "1,5·Q", "factors": { "1": 1.5 } },
        { "id": 2, "name": "UGT 3,0·Q", "type": "uls", "formula": "3,0·Q", "factors": { "1": 3.0 } }
    ])
}

#[tokio::test]
async fn stalen_wand_wordt_doorgerekend_en_getoetst() {
    eis_node().await;
    let uit = check_fem_model(json!({ "model": wand(Some("S235")), "combinations": combinaties() })).await;

    let invoer = uit["plate_check_inputs"].as_array().expect("plate_check_inputs");
    assert_eq!(invoer.len(), 1);
    assert_eq!(invoer[0]["materiaal"], "S235");
    assert_eq!(uit["skipped_plates"], json!([]));

    let r = &uit["plate_results"][0];
    assert!(r["geweigerd"].is_null(), "{r}");
    let uc = r["uc_max"].as_f64().unwrap();
    let hand = 150.0 / 235.0;
    assert!((uc - hand).abs() <= 0.02 * hand, "UC {uc} tegen hand {hand}");
    assert_eq!(r["governing_combination_id"], 2);
    assert_eq!(r["status"], "Ok");

    // Zelfde antwoord als het losse gereedschap met dezelfde invoer: de plaattoets
    // in `check_fem_model` is geen tweede rekengang.
    let los: Vec<plaat_check::PlateCheckInput> = serde_json::from_value(uit["plate_check_inputs"].clone()).unwrap();
    let los = serde_json::to_value(plaat_check::check_all_plates(los)).unwrap();
    assert_eq!(serde_json::to_string(&los).unwrap(), serde_json::to_string(&uit["plate_results"]).unwrap());

    let g = &uit["governing_plate"];
    assert_eq!(g["plate_id"], 1);
    assert_eq!(g["uc_max"], r["uc_max"]);
}

#[tokio::test]
async fn plaat_zonder_materiaal_staat_met_reden_in_skipped_plates() {
    eis_node().await;
    let uit = check_fem_model(json!({ "model": wand(None), "combinations": combinaties() })).await;
    assert_eq!(uit["plate_check_inputs"], json!([]));
    assert_eq!(uit["plate_results"], json!([]));
    assert!(uit["governing_plate"].is_null());
    let skip = uit["skipped_plates"].as_array().expect("skipped_plates");
    assert_eq!(skip.len(), 1);
    assert_eq!(skip[0]["plate_id"], 1);
    assert!(skip[0]["reason"].as_str().unwrap().contains("geen materiaal"), "{}", skip[0]);
}

#[tokio::test]
async fn betonnen_wand_wordt_geweigerd_met_reden_en_telt_niet_als_maatgevend() {
    eis_node().await;
    let uit = check_fem_model(json!({ "model": wand(Some("C30/37")), "combinations": combinaties() })).await;
    let r = &uit["plate_results"][0];
    assert_eq!(r["soort"], "Beton");
    assert_eq!(r["status"], "NotApplicable");
    assert!(r["geweigerd"].as_str().unwrap().contains("bijlage F"), "{r}");
    assert!(uit["governing_plate"].is_null(), "een weigering is geen oordeel: {}", uit["governing_plate"]);
}
