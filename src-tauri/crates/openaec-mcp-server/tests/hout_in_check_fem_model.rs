//! `check_fem_model` en houten staven — end-to-end over de echte binary.
//!
//! WAT HIER MISGING
//! Een portaal met een houten ligger (C24 96×450) tussen twee stalen kolommen
//! (HEA160 S235) gaf als antwoord `results` [1, 3], `skipped_beams` [] en
//! `warnings` [], met staaf 3 als "maatgevend" (UC 0,641). De houten ligger
//! stond nergens — terwijl hij apart getoetst UC 2,856 had (kip, 6.3.3). Met
//! `beam_ids: [2]` was het antwoord zelfs volledig leeg, zonder reden. De
//! betonvariant van dit gat was al gedicht (`beton_in_check_fem_model.rs`);
//! voor hout gold alleen een waarschuwing in de tooldescription.
//!
//! En een tweede weg naar hetzelfde gat: de staalbouwer herkende staal aan een
//! lijst profielvoorvoegsels (HEA, HEB, …, CHS). INP, DIE, DIL, DIN en L
//! stonden daar niet in, dus een S235-staaf op zo'n catalogusprofiel verdween
//! op dezelfde manier. Gemeten: vier liggers op IPE 200, INP 200, DIN 20 en
//! L 100x100x10 gaven één resultaat (IPE 200) en verder niets.
//!
//! WAT DEZE TEST VASTLEGT
//! Elke gevraagde staaf staat in `results` óf in `skipped_beams`, en een houten
//! staaf noemt de tool die hem wél toetst. Catalogusprofielen worden getoetst
//! ongeacht hun voorvoegsel.
//!
//! LET OP: het tweede deel hangt af van de ingebakken solverbundel. Na een
//! wijziging in `design-mockup/src/lib/steelCheckBuilder.ts` eerst
//! `npm run build:sidecar`, anders meet deze test de oude bundel.
//!
//! Node ≥ 20 is een harde eis; ontbreekt hij, dan faalt deze test met die
//! melding in plaats van zichzelf stil uit te zetten.

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

/// Het portaal uit het faalscenario: staaf 2 is de houten ligger.
fn portaal_met_houten_ligger() -> Value {
    json!({
        "nodes": [
            { "id": 1, "x": 0,    "z": 0 },
            { "id": 2, "x": 0,    "z": 4000 },
            { "id": 3, "x": 6000, "z": 4000 },
            { "id": 4, "x": 6000, "z": 0 }
        ],
        "beams": [
            { "id": 1, "from": 1, "to": 2, "material": "S235", "profile": "HEA160" },
            { "id": 2, "from": 2, "to": 3, "material": "C24",  "profile": "96x450" },
            { "id": 3, "from": 3, "to": 4, "material": "S235", "profile": "HEA160" }
        ],
        "supports": [
            { "nodeId": 1, "type": "fixed" },
            { "nodeId": 4, "type": "fixed" }
        ],
        "loadCases": [ { "id": 1, "name": "Permanent", "type": "dead" } ],
        "loads": [
            { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 2, "q": -5 }
        ]
    })
}

async fn roep_tool(naam: &str, argumenten: Value) -> Value {
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
                "clientInfo": { "name": "hout-check-fem", "version": "0.0.0" }
            }
        }),
        json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": { "name": naam, "arguments": argumenten }
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
    antwoord
}

fn ids(uit: &Value, veld: &str) -> Vec<i64> {
    let mut v: Vec<i64> = uit[veld]
        .as_array()
        .unwrap_or_else(|| panic!("`{veld}` ontbreekt: {uit}"))
        .iter()
        .filter_map(|r| r["beam_id"].as_i64())
        .collect();
    v.sort_unstable();
    v
}

fn reden(uit: &Value, beam_id: i64) -> Option<String> {
    uit["skipped_beams"]
        .as_array()?
        .iter()
        .find(|s| s["beam_id"] == json!(beam_id))?["reason"]
        .as_str()
        .map(str::to_owned)
}

/// Elke staaf precies één keer: getoetst of overgeslagen, nooit geen van beide
/// en nooit allebei.
fn eis_sluitend(uit: &Value, gevraagd: &[i64]) {
    let getoetst = ids(uit, "results");
    let overgeslagen = ids(uit, "skipped_beams");
    let mut alle: Vec<i64> = getoetst.iter().chain(overgeslagen.iter()).copied().collect();
    alle.sort_unstable();
    assert_eq!(
        alle, gevraagd,
        "niet elke staaf is precies één keer verantwoord (results {getoetst:?}, skipped {overgeslagen:?})"
    );
}

#[tokio::test]
async fn een_houten_staaf_verdwijnt_niet_meer_stil_uit_check_fem_model() {
    eis_node().await;

    let result = roep_tool(
        "check_fem_model",
        json!({ "model": portaal_met_houten_ligger() }),
    )
    .await;
    assert_eq!(
        result["isError"], false,
        "check_fem_model gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    let uit = &result["structuredContent"];

    assert_eq!(ids(uit, "results"), vec![1, 3], "de twee stalen kolommen horen getoetst te zijn");
    let r = reden(uit, 2).unwrap_or_else(|| panic!("de houten ligger staat niet in skipped_beams: {uit}"));
    assert!(r.contains("C24"), "de reden moet het materiaal noemen: {r}");
    assert!(
        r.contains("check_timber_beams"),
        "de reden moet doorverwijzen naar de tool die hout wél toetst: {r}"
    );
    eis_sluitend(uit, &[1, 2, 3]);
}

/// Met alleen de houten staaf gevraagd was het antwoord volledig leeg — geen
/// resultaat, geen reden. Leeg leest als "niets mis".
#[tokio::test]
async fn alleen_de_houten_staaf_gevraagd_geeft_een_reden_en_geen_leeg_antwoord() {
    eis_node().await;

    let result = roep_tool(
        "check_fem_model",
        json!({ "model": portaal_met_houten_ligger(), "beam_ids": [2] }),
    )
    .await;
    assert_eq!(result["isError"], false, "{result}");
    let uit = &result["structuredContent"];
    assert!(ids(uit, "results").is_empty());
    assert!(reden(uit, 2).is_some(), "staaf 2 is gevraagd en moet gemeld zijn: {uit}");
    eis_sluitend(uit, &[2]);
    assert_eq!(uit["governing"], Value::Null, "zonder getoetste staaf is er geen maatgevende");
}

/// Catalogusprofielen buiten de oude voorvoegsellijst worden getoetst. Het
/// faalscenario van de audit: vier vrij opgelegde liggers S235 van 5 m met
/// q = 5 kN/m op IPE 200, INP 200, DIN 20 en L 100x100x10. Hier wordt geen
/// unity check vastgelegd — alleen dat alle vier de kern bereiken en een
/// uitslag hebben.
#[tokio::test]
async fn catalogusprofielen_buiten_de_oude_voorvoegsellijst_worden_getoetst() {
    eis_node().await;

    let profielen = ["IPE 200", "INP 200", "DIN 20", "L 100x100x10"];
    let mut nodes = Vec::new();
    let mut beams = Vec::new();
    let mut supports = Vec::new();
    let mut loads = Vec::new();
    for (k, profiel) in profielen.iter().enumerate() {
        let (a, b, x0) = (2 * k + 1, 2 * k + 2, (k * 10_000) as f64);
        nodes.push(json!({ "id": a, "x": x0, "z": 0 }));
        nodes.push(json!({ "id": b, "x": x0 + 5000.0, "z": 0 }));
        beams.push(json!({ "id": k + 1, "from": a, "to": b, "material": "S235", "profile": profiel }));
        supports.push(json!({ "nodeId": a, "type": "pinned" }));
        supports.push(json!({ "nodeId": b, "type": "zRoller" }));
        loads.push(json!({ "id": k + 1, "type": "lineLoad", "caseId": 1, "beamId": k + 1, "q": -5 }));
    }
    let model = json!({
        "nodes": nodes, "beams": beams, "supports": supports, "loads": loads,
        "loadCases": [ { "id": 1, "name": "G", "type": "dead" } ]
    });

    let result = roep_tool("check_fem_model", json!({ "model": model })).await;
    assert_eq!(
        result["isError"], false,
        "check_fem_model gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    let uit = &result["structuredContent"];
    assert_eq!(
        ids(uit, "results"),
        vec![1, 2, 3, 4],
        "alle vier de catalogusprofielen horen getoetst te worden: skipped = {}",
        uit["skipped_beams"]
    );
    for r in uit["results"].as_array().unwrap() {
        let gov = r["governing_check_id"].as_str().unwrap_or("");
        assert!(
            !gov.starts_with("ERROR"),
            "staaf {} ({}) is niet werkelijk getoetst: {gov}",
            r["beam_id"], r["profile_name"]
        );
        assert!(!r["checks"].as_array().unwrap().is_empty());
    }
    eis_sluitend(uit, &[1, 2, 3, 4]);
}
