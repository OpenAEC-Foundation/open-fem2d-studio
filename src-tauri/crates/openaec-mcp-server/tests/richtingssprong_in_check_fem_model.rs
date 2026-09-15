//! De waarschuwing bij de sprong van "boven" langs de MCP-weg — end-to-end over
//! de echte binary.
//!
//! WAT HIER VASTLIGT
//! Bij een staaf die naar LINKS helt, springt "bovenflens" op 75° van het
//! fysieke bovenvlak naar het fysieke ondervlak (zie
//! `design-mockup/src/lib/referentierichting.ts`, DE SPRONG BIJ 75°). Gemeten
//! met een IPE 330 van 9 m onder zuiging, kipsteunen aan de bovenflens op ¼, ½
//! en ¾: 74,9° telt 0 steunen, 75,1° telt 3. Dat is geen rekenfout, maar wie
//! "bovenflens" als bovenvlak leest, mist hem. `check_fem_model` bouwt de
//! toetsinvoer met dezelfde bouwer als de app, dus de waarschuwing hoort ook
//! hier in de kiptoets te staan — en alleen binnen de band, alleen bij een naar
//! links hellende staaf.
//!
//! LET OP: dit hangt af van de ingebakken solverbundel; na een wijziging in
//! `referentierichting.ts` of `steelCheckBuilder.ts` eerst
//! `npm run build:sidecar`. Node ≥ 20 is een harde eis.

use openaec_mcp_server::sidecar::{self, SidecarOpties};
use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");
const WAARSCHUWING: &str = "Richtingssprong nabij";

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

async fn check_fem_model(model: Value) -> Value {
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
                "clientInfo": { "name": "richtingssprong", "version": "0.0.0" }
            }
        }),
        json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": { "name": "check_fem_model", "arguments": { "model": model } }
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
        let bericht: Value = serde_json::from_str(regel.trim())
            .unwrap_or_else(|e| panic!("ongeldige JSON-RPC-regel {regel:?}: {e}"));
        if bericht["id"] == 2 {
            antwoord = bericht["result"].clone();
        }
    }
    drop(stdin);
    let _ = timeout(Duration::from_secs(10), kind.wait()).await;
    assert_eq!(
        antwoord["isError"], false,
        "check_fem_model gaf een fout: {}",
        antwoord["content"][0]["text"].as_str().unwrap_or("")
    );
    antwoord["structuredContent"].clone()
}

/// IPE 330 S235 van 9 m, scharnierend opgelegd, onder `helling` graden, met
/// de voet in de oorsprong; zuiging q = +6 kN/m en kipsteunen aan de
/// bovenflens op ¼, ½ en ¾.
fn schuine_ligger(helling: f64, naar_links: bool) -> Value {
    let t = helling.to_radians();
    let l = 9000.0;
    let x = if naar_links { -l * t.cos() } else { l * t.cos() };
    json!({
        "nodes": [ { "id": 1, "x": 0, "z": 0 }, { "id": 2, "x": x, "z": l * t.sin() } ],
        "beams": [ {
            "id": 1, "from": 1, "to": 2, "material": "S235", "profile": "IPE330",
            "checkConfig": { "lateralRestraints": [0.25, 0.5, 0.75] }
        } ],
        "supports": [
            { "nodeId": 1, "type": "pinned" },
            { "nodeId": 2, "type": "pinned" }
        ],
        "loadCases": [
            { "id": 1, "name": "Permanent", "type": "dead" },
            { "id": 2, "name": "Variabel", "type": "live" }
        ],
        "loads": [ { "id": 1, "type": "lineLoad", "caseId": 2, "beamId": 1, "q": 6 } ]
    })
}

/// Hoe vaak de waarschuwing in de kiptoets en in de toetsinvoer staat.
fn waarschuwingen(uit: &Value) -> (usize, usize) {
    let resultaat = &uit["results"][0];
    let kip = resultaat["checks"]
        .as_array()
        .and_then(|l| l.iter().find(|c| c["id"] == "6.3.2_ltb"))
        .unwrap_or_else(|| panic!("geen kiptoets in {resultaat}"));
    let in_kip = kip["kind"]["data"]["notes"]
        .as_array()
        .map(|n| n.iter().filter(|t| t.as_str().is_some_and(|t| t.starts_with(WAARSCHUWING))).count())
        .unwrap_or(0);
    let in_invoer = uit["steel_check_inputs"][0]["staafstand_notities"]
        .as_array()
        .map(|n| n.iter().filter(|t| t.as_str().is_some_and(|t| t.starts_with(WAARSCHUWING))).count())
        .unwrap_or(0);
    (in_kip, in_invoer)
}

#[tokio::test]
async fn een_naar_links_hellende_staaf_bij_75_graden_krijgt_de_waarschuwing_in_de_kiptoets() {
    eis_node().await;

    // (helling, naar links, verwacht): aan beide kanten van de grens, en er
    // net buiten de band van 10° en bij een naar rechts hellende staaf niet.
    for (helling, naar_links, verwacht) in [
        (74.9, true, true),
        (75.1, true, true),
        (64.9, true, false),
        (85.1, true, false),
        (75.1, false, false),
    ] {
        let uit = check_fem_model(schuine_ligger(helling, naar_links)).await;
        let (in_kip, in_invoer) = waarschuwingen(&uit);
        let wat = format!("{helling}° {}", if naar_links { "naar links" } else { "naar rechts" });
        if verwacht {
            assert_eq!((in_kip, in_invoer), (1, 1), "{wat}: de waarschuwing hoort er één keer te staan");
        } else {
            assert_eq!((in_kip, in_invoer), (0, 0), "{wat}: hier hoort geen waarschuwing: {uit}");
        }
    }
}
