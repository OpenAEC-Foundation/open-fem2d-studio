//! `check_fem_model` en betonstaven — end-to-end over de echte binary.
//!
//! WAT HIER MISGING
//! `check_fem_model` toetst uitsluitend via `steel_check::check_all_beams`. De
//! solverbundel bouwt alleen staal-toetsinvoer; een staaf met een ander
//! materiaal valt daar uit met `if (!isSteelProfile(profileName)) continue;` en
//! verscheen daarna NERGENS meer in het antwoord — niet in `results`, niet in
//! `skipped_beams`. Voor een client is een betonkolom die ontbreekt niet te
//! onderscheiden van een betonkolom die is goedgekeurd, en `governing` (de
//! hoogste unity check over alles wat wél getoetst is) leest dan als het
//! oordeel over het hele model.
//!
//! De solve zelf klopte wél: `resolveSection` kent beton en levert
//! E_cm met een rechthoekige, ongescheurde doorsnede (`bron: "beton-bxh"`). De
//! staaf rekent dus mee in de krachtsverdeling en verdwijnt pas bij de
//! toetsing. Dat maakt het stille wegvallen extra misleidend.
//!
//! Deze test legt vast dat zo'n staaf nu met reden in `skipped_beams` staat,
//! mét de naam van de tool die de EN 1992-toetsing wél doet.
//!
//! Node ≥ 20 is een harde eis voor de FEM-tools; ontbreekt hij, dan faalt deze
//! test met die melding in plaats van zichzelf stil uit te zetten.

use openaec_mcp_server::sidecar::{self, SidecarOpties};
use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

/// Het gouden portaal: drie STALEN staven. Zie `fem_golden.rs`.
const STAAL_MODELPAD: &str =
    concat!(env!("CARGO_MANIFEST_DIR"), "/tests/golden/portaal.ifcfem2d");

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

/// Portaal met twee BETONNEN kolommen (C30/37, 300 × 500) en een STALEN
/// ligger (S235, IPE300). Bewust gemengd: alleen zo is te zien dat de staalstaaf
/// wél wordt getoetst en de betonstaven met reden overblijven.
fn gemengd_portaal() -> Value {
    json!({
        "nodes": [
            { "id": 1, "x": 0,    "z": 0 },
            { "id": 2, "x": 0,    "z": 4000 },
            { "id": 3, "x": 6000, "z": 4000 },
            { "id": 4, "x": 6000, "z": 0 }
        ],
        "beams": [
            { "id": 1, "from": 1, "to": 2, "material": "C30/37", "profile": "300x500" },
            { "id": 2, "from": 2, "to": 3, "material": "S235",   "profile": "IPE300" },
            { "id": 3, "from": 3, "to": 4, "material": "C30/37", "profile": "300x500" }
        ],
        "supports": [
            { "nodeId": 1, "type": "fixed" },
            { "nodeId": 4, "type": "fixed" }
        ],
        "loadCases": [ { "id": 1, "name": "Permanent", "type": "dead" } ],
        "loads": [
            { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 2, "q": -10 }
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
                "clientInfo": { "name": "beton-check-fem", "version": "0.0.0" }
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

/// De reden bij een overgeslagen staaf, of `None` als de staaf niet gemeld is.
fn reden(uit: &Value, beam_id: i64) -> Option<String> {
    uit["skipped_beams"]
        .as_array()?
        .iter()
        .find(|s| s["beam_id"] == json!(beam_id))?["reason"]
        .as_str()
        .map(str::to_owned)
}

#[tokio::test]
async fn betonstaven_verdwijnen_niet_meer_stil_uit_check_fem_model() {
    eis_node().await;

    let result = roep_tool("check_fem_model", json!({ "model": gemengd_portaal() })).await;
    assert_eq!(
        result["isError"], false,
        "check_fem_model gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    let uit = &result["structuredContent"];

    // De stalen ligger is gewoon getoetst.
    let getoetst: Vec<i64> = uit["results"]
        .as_array()
        .expect("results")
        .iter()
        .filter_map(|r| r["beam_id"].as_i64())
        .collect();
    assert_eq!(getoetst, vec![2], "alleen de stalen ligger hoort getoetst te zijn");

    // De twee betonnen kolommen staan met reden bij de overgeslagen staven.
    for id in [1, 3] {
        let r = reden(uit, id)
            .unwrap_or_else(|| panic!("staaf {id} (beton) staat niet in skipped_beams: {uit}"));
        assert!(
            r.contains("C30/37"),
            "de reden bij staaf {id} moet het materiaal noemen: {r}"
        );
        assert!(
            r.contains("check_concrete_beam"),
            "de reden bij staaf {id} moet doorverwijzen naar de tool die beton wél toetst: {r}"
        );
    }

    // Elke staaf komt precies één keer voor: één keer getoetst of één keer
    // overgeslagen. Dubbel melden leest als twee staven.
    let overgeslagen: Vec<i64> = uit["skipped_beams"]
        .as_array()
        .expect("skipped_beams")
        .iter()
        .filter_map(|s| s["beam_id"].as_i64())
        .collect();
    let mut alle: Vec<i64> = getoetst.iter().chain(overgeslagen.iter()).copied().collect();
    alle.sort_unstable();
    assert_eq!(alle, vec![1, 2, 3], "niet elke staaf is precies één keer verantwoord");
}

/// Een volledig stalen model uit een PROJECTBESTAND krijgt geen enkele
/// betonmelding. Twee dingen tegelijk: de betondetectie leest ook het model dat
/// via `project_path` binnenkomt (dat staat op het bovenste niveau van het
/// bestand, niet onder een `model`-sleutel), en ze geeft daar geen vals alarm.
#[tokio::test]
async fn een_staalmodel_uit_een_projectbestand_krijgt_geen_betonmelding() {
    eis_node().await;

    let result = roep_tool(
        "check_fem_model",
        json!({ "project_path": STAAL_MODELPAD }),
    )
    .await;
    assert_eq!(
        result["isError"], false,
        "check_fem_model gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    let uit = &result["structuredContent"];

    let getoetst = uit["results"].as_array().expect("results").len();
    assert_eq!(getoetst, 3, "het gouden portaal heeft drie stalen staven");
    let overgeslagen = uit["skipped_beams"].as_array().expect("skipped_beams");
    assert!(
        overgeslagen.is_empty(),
        "een volledig stalen model hoort niets over te slaan: {overgeslagen:?}"
    );
}

/// De wapeningskorf hoort NIET in het rekenmodel dat deze server aanvaardt.
///
/// De app bewaart hem wel: `beam.checkConfig.betonKorf`. De veldpoort van de
/// solverbundel (`controleerVelden`, `CHECKCONFIG_VELDEN`) kent dat veld niet en
/// weigert het model daarom hard. Dat is bewust gedrag van die poort — een
/// onbekend veld wordt niet genegeerd — maar het betekent wel dat een
/// projectbestand mét korven niet door `check_fem_model` heen komt.
///
/// Deze test legt dat vast zodat het zichtbaar blijft en niet als verrassing
/// bij een gebruiker terechtkomt. Repareren vraagt een wijziging in de
/// solverbundel en valt buiten deze taak.
#[tokio::test]
async fn een_model_met_een_wapeningskorf_wordt_geweigerd_door_de_veldpoort() {
    eis_node().await;

    let mut model = gemengd_portaal();
    model["beams"][0]["checkConfig"] = json!({
        "betonKorf": {
            "cover_mm": 30, "stirrup_diameter_mm": 8,
            "top": { "count": 2, "diameter_mm": 12 },
            "bottom": { "count": 3, "diameter_mm": 16 }
        }
    });

    let result = roep_tool("check_fem_model", json!({ "model": model })).await;
    assert_eq!(
        result["isError"], true,
        "de veldpoort hoort `betonKorf` te weigeren, kreeg een resultaat: {result}"
    );
    let fout = &result["structuredContent"];
    assert_eq!(fout["error_code"], "INVOER_ONGELDIG");
    // De meldingstekst verwijst naar `detail`; het geweigerde veld staat daar.
    let detail = fout["detail"].to_string();
    assert!(
        detail.contains("betonKorf"),
        "`detail` moet het geweigerde veld noemen, kreeg: {detail}"
    );
}

/// `beam_ids` beperkt de toetsing; wat er buiten valt is niet overgeslagen maar
/// niet gevraagd. Een melding daarover zou de lijst met overgeslagen staven
/// verwateren tot ruis.
#[tokio::test]
async fn buiten_de_beam_ids_selectie_wordt_niets_gemeld() {
    eis_node().await;

    let result = roep_tool(
        "check_fem_model",
        json!({ "model": gemengd_portaal(), "beam_ids": [1, 2] }),
    )
    .await;
    assert_eq!(result["isError"], false);
    let uit = &result["structuredContent"];

    assert!(reden(uit, 1).is_some(), "staaf 1 is gevraagd en moet gemeld zijn");
    assert!(
        reden(uit, 3).is_none(),
        "staaf 3 viel buiten `beam_ids` en hoort niet in skipped_beams te staan"
    );
}
