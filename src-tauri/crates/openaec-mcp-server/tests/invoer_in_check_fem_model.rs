//! Invoerfouten en gevraagde staafnummers in de FEM-tools — end-to-end over de
//! echte binary.
//!
//! WAT HIER MISGING (gemeten, september 2026)
//! 1. Een staaf zonder of met leeg materiaal, S235 met een profiel dat niet
//!    bestaat (HEA 999) en C24 met een staalprofiel (HEA 200) kwamen via
//!    `check_fem_model` en `solve_fem_model` terug als "[INTERN] Onverwachte
//!    fout in de sidecar — Meld deze fout …". De juiste Nederlandse reden stond
//!    er wel in, maar alleen in een stacktrace in `detail`. Het zijn
//!    invoerfouten die de gebruiker zelf herstelt, geen storingen.
//! 2. `beam_ids` [1, 99], met 99 niet in het model: 99 stond nergens in het
//!    antwoord, en een staaf die nergens staat leest als een staaf die in orde
//!    is.
//! 3. `beam_ids` [] — volgens het schema "alle staalstaven" — toetste niets en
//!    meldde de S235-ligger als "niet herkend als staal".
//!
//! LET OP: dit hangt af van de ingebakken solverbundel. Na een wijziging in
//! `design-mockup/src/mcp/sidecar.ts` eerst `npm run build:sidecar`, anders
//! meet deze test de oude bundel. Node ≥ 20 is een harde eis; ontbreekt hij,
//! dan faalt de test met die melding in plaats van zichzelf stil uit te zetten.

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

/// Eén toolaanroep op een verse server; geeft het `result`-object terug.
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
                "clientInfo": { "name": "invoer-check-fem", "version": "0.0.0" }
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

/// Een vrij opgelegde ligger van 5 m met één staaf (id 1) en q = 5 kN/m.
fn ligger(staaf: Value) -> Value {
    json!({
        "nodes": [ { "id": 1, "x": 0, "z": 0 }, { "id": 2, "x": 5000, "z": 0 } ],
        "beams": [ staaf ],
        "supports": [
            { "nodeId": 1, "type": "pinned" },
            { "nodeId": 2, "type": "zRoller" }
        ],
        "loadCases": [ { "id": 1, "name": "G", "type": "dead" } ],
        "loads": [ { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 1, "q": -5 } ]
    })
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

/// Elke gevraagde staaf precies één keer: getoetst of overgeslagen.
fn eis_sluitend(uit: &Value, gevraagd: &[i64]) {
    let getoetst = ids(uit, "results");
    let overgeslagen = ids(uit, "skipped_beams");
    let mut alle: Vec<i64> = getoetst.iter().chain(overgeslagen.iter()).copied().collect();
    alle.sort_unstable();
    assert_eq!(
        alle, gevraagd,
        "niet elke gevraagde staaf is precies één keer verantwoord (results {getoetst:?}, skipped {overgeslagen:?})"
    );
}

#[tokio::test]
async fn een_doorsnede_die_niet_te_bepalen_is_is_een_invoerfout_met_remedie() {
    eis_node().await;

    // (naam, staaf, woorden die de reden in de melding én in `detail` noemt)
    let gevallen = [
        ("geen materiaal", json!({ "id": 1, "from": 1, "to": 2, "profile": "HEA 200" }), "geen materiaal"),
        (
            "leeg materiaal",
            json!({ "id": 1, "from": 1, "to": 2, "material": "", "profile": "HEA 200" }),
            "geen materiaal",
        ),
        (
            "S235 met HEA 999",
            json!({ "id": 1, "from": 1, "to": 2, "material": "S235", "profile": "HEA 999" }),
            "\"HEA 999\"",
        ),
        (
            "C24 met HEA 200",
            json!({ "id": 1, "from": 1, "to": 2, "material": "C24", "profile": "HEA 200" }),
            "hoort niet bij materiaal \"C24\"",
        ),
    ];

    for tool in ["check_fem_model", "solve_fem_model"] {
        for (naam, staaf, reden) in &gevallen {
            let result = roep_tool(tool, json!({ "model": ligger(staaf.clone()) })).await;
            assert_eq!(result["isError"], true, "{tool} / {naam} had moeten weigeren: {result}");
            let fout = &result["structuredContent"];
            assert_eq!(
                fout["error_code"], "DOORSNEDE_ONBEKEND",
                "{tool} / {naam}: een invoerfout, geen INTERN: {fout}"
            );

            let melding = fout["melding"].as_str().unwrap_or("");
            assert!(melding.contains("staaf 1") && melding.contains(reden), "{tool} / {naam}: {melding}");

            // De remedie zegt wat de gebruiker doet — niet "meld deze fout".
            let remedie = fout["remedie"].as_str().unwrap_or("");
            assert!(
                remedie.contains("materiaal") && !remedie.contains("Meld deze fout"),
                "{tool} / {naam}: remedie {remedie:?}"
            );

            let staven = fout["detail"]["staven"].as_array().unwrap_or_else(|| panic!("{fout}"));
            assert_eq!(staven.len(), 1, "{tool} / {naam}: {fout}");
            assert_eq!(staven[0]["beam_id"], 1, "{tool} / {naam}: {fout}");
            assert!(
                staven[0]["reason"].as_str().is_some_and(|r| r.contains(reden)),
                "{tool} / {naam}: {fout}"
            );

            // De leesbare regel noemt de code ook.
            let tekst = result["content"][0]["text"].as_str().unwrap_or("");
            assert!(tekst.contains("DOORSNEDE_ONBEKEND"), "{tool} / {naam}: {tekst}");
        }
    }
}

#[tokio::test]
async fn een_gevraagd_staafnummer_dat_niet_bestaat_staat_in_skipped_beams() {
    eis_node().await;

    let model = ligger(json!({ "id": 1, "from": 1, "to": 2, "material": "S235", "profile": "IPE 200" }));
    let result = roep_tool("check_fem_model", json!({ "model": model, "beam_ids": [1, 99] })).await;
    assert_eq!(
        result["isError"], false,
        "check_fem_model gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    let uit = &result["structuredContent"];
    assert_eq!(ids(uit, "results"), vec![1], "staaf 1 hoort getoetst te zijn: {uit}");
    let reden = uit["skipped_beams"]
        .as_array()
        .and_then(|l| l.iter().find(|s| s["beam_id"] == 99))
        .and_then(|s| s["reason"].as_str())
        .unwrap_or_else(|| panic!("99 is gevraagd en hoort in skipped_beams te staan: {uit}"));
    assert!(reden.starts_with("bestaat niet in het model"), "{reden}");
    eis_sluitend(uit, &[1, 99]);
}

#[tokio::test]
async fn lege_beam_ids_toetst_alle_staven() {
    eis_node().await;

    let model = ligger(json!({ "id": 1, "from": 1, "to": 2, "material": "S235", "profile": "IPE 200" }));
    let result = roep_tool("check_fem_model", json!({ "model": model, "beam_ids": [] })).await;
    assert_eq!(result["isError"], false, "{result}");
    let uit = &result["structuredContent"];
    assert_eq!(ids(uit, "results"), vec![1], "leeg = alle staalstaven: {uit}");
    eis_sluitend(uit, &[1]);
}
