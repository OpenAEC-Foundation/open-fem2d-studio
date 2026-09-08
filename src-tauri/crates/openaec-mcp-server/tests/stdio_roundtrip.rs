//! End-to-end round-trip test for the MCP stdio loop.
//!
//! Spawns the actual `openaec-mcp-server` binary as a subprocess, drives the
//! protocol handshake (`initialize` → `notifications/initialized` →
//! `tools/list` → `tools/call list_steel_profiles`) over stdin/stdout, and
//! asserts every response is well-formed JSON-RPC and the tool returns a
//! non-empty profiles array.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

/// Read one newline-terminated JSON-RPC message and parse it. Times out after
/// 30s — the first call may need to JIT-init the steel-profiles DB.
async fn read_message<R>(reader: &mut R) -> Value
where
    R: AsyncBufReadExt + Unpin,
{
    let mut line = String::new();
    let n = timeout(Duration::from_secs(30), reader.read_line(&mut line))
        .await
        .expect("timeout waiting for response")
        .expect("read_line failed");
    assert!(n > 0, "EOF on stdout — server exited unexpectedly");
    serde_json::from_str(line.trim())
        .unwrap_or_else(|e| panic!("invalid JSON-RPC line {:?}: {}", line, e))
}

#[tokio::test]
async fn stdio_roundtrip_initialize_list_call() {
    let mut child = Command::new(BIN_PATH)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn server");

    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let mut reader = BufReader::new(stdout);

    // ── 1. initialize ────────────────────────────────────────────────────
    let init = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": { "name": "stdio-roundtrip-test", "version": "0.0.0" }
        }
    });
    let mut req = serde_json::to_string(&init).unwrap();
    req.push('\n');
    stdin.write_all(req.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();

    let resp = read_message(&mut reader).await;
    assert_eq!(resp["jsonrpc"], "2.0");
    assert_eq!(resp["id"], 1);
    assert_eq!(resp["result"]["serverInfo"]["name"], "openaec-fem");
    assert!(resp["result"]["protocolVersion"].is_string());
    assert!(resp["error"].is_null());

    // ── 2. notifications/initialized (no response expected) ──────────────
    let init_notif = json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    });
    let mut req = serde_json::to_string(&init_notif).unwrap();
    req.push('\n');
    stdin.write_all(req.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();

    // ── 3. tools/list ────────────────────────────────────────────────────
    let list = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {}
    });
    let mut req = serde_json::to_string(&list).unwrap();
    req.push('\n');
    stdin.write_all(req.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();

    let resp = read_message(&mut reader).await;
    assert_eq!(resp["jsonrpc"], "2.0");
    assert_eq!(resp["id"], 2);
    let tools = resp["result"]["tools"]
        .as_array()
        .expect("tools must be an array");
    assert_eq!(tools.len(), 22, "expected 22 tools, got {}", tools.len());
    let names: Vec<&str> = tools
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    for expected in [
        "list_steel_profiles",
        "list_steel_grades",
        "check_steel_beam",
        "compute_section_properties",
        "generate_steel_report_pdf",
        // De vijf FEM-tools (T10). Ze staan hier ALTIJD in, ook zonder
        // Node-runtime: verbergen zou de client laten melden dat de functie
        // niet bestaat, en dan is de storing niet meer te diagnosticeren.
        "fem_solver_status",
        "validate_fem_model",
        "load_fem_project",
        "solve_fem_model",
        "check_fem_model",
        // De acht betontools (NEN-EN 1992-1-1). Dezelfde rekengang als het
        // Tauri-command en de toetsbrug; zie `tests/drie_wegen_beton.rs`,
        // `tests/drie_wegen_beff.rs` en `tests/drie_wegen_dekking.rs`.
        "list_concrete_classes",
        "list_reinforcement_grades",
        "check_concrete_beam",
        "concrete_mn_kappa",
        // De stateloze stijfheidsdienst voor de fysisch niet-lineaire tweede
        // orde (5.8.6): segmentindeling, secante EI per segment en het
        // convergentie-oordeel.
        "concrete_segment_stiffness",
        // De meewerkende flensbreedte b_eff per gebied van figuur 5.2
        // (5.3.2.1, alle grenstoestanden).
        "concrete_effective_flange_width",
        // De milieuklassen van tabel 4.1 en de dekkingstoets van 4.4.1, met
        // c_min,dur uit de door de nationale bijlage voorgeschreven tabel 4.4N.
        "list_exposure_classes",
        "concrete_cover_check",
        // De vier houttools (NEN-EN 1995-1-1), hout en kruislaaghout. Ze
        // ontbraken hier terwijl `generate_steel_report_pdf` hierboven wél
        // `timber_check_results` accepteert; zie `tests/drie_wegen_hout.rs` en
        // `tests/drie_wegen_kruistabel.rs`. Deze vier heten precies zoals het
        // Tauri-command en de toetsbrug-opdracht — meervoud, want ze nemen net
        // als die twee een lijst staven.
        "list_timber_grades",
        "check_timber_beams",
        "list_clt_presets",
        "check_clt_beams",
    ] {
        assert!(names.contains(&expected), "missing tool: {expected} (have {names:?})");
    }

    // ── 4. tools/call list_steel_profiles ────────────────────────────────
    let call = json!({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "list_steel_profiles",
            "arguments": {}
        }
    });
    let mut req = serde_json::to_string(&call).unwrap();
    req.push('\n');
    stdin.write_all(req.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();

    let resp = read_message(&mut reader).await;
    assert_eq!(resp["jsonrpc"], "2.0");
    assert_eq!(resp["id"], 3);
    assert!(resp["error"].is_null(), "error: {resp:?}");

    let result = &resp["result"];
    assert_eq!(result["isError"], false);

    // The profiles array must be present in structuredContent and
    // also embedded as JSON text in content[0].text — verify both.
    let profiles_struct = result["structuredContent"]["profiles"]
        .as_array()
        .expect("structuredContent.profiles must be an array");
    assert!(!profiles_struct.is_empty(), "profile list is empty");

    let text = result["content"][0]["text"]
        .as_str()
        .expect("content[0].text must be a string");
    let parsed: Value = serde_json::from_str(text).expect("content text must be parseable JSON");
    assert!(
        parsed["profiles"].as_array().map(|a| !a.is_empty()).unwrap_or(false),
        "embedded text profiles must be a non-empty array"
    );

    // Spot-check a profile has a recognisable shape.
    let first = &profiles_struct[0];
    assert!(first["name"].is_string());
    assert!(first["properties"]["area_mm2"].is_number());

    // ── 5. tools/call fem_solver_status ──────────────────────────────────
    // Bewijst dat de FEM-tools ook écht bereikbaar zijn en niet alleen in
    // `tools/list` staan. Deze tool is met opzet de enige die nooit faalt: een
    // storing IS zijn antwoord. Hij werkt daarmee mét en zónder Node-runtime,
    // wat hem geschikt maakt als eerste stap bij een storing én als test die
    // niets over de machine hoeft aan te nemen.
    let call = json!({
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": { "name": "fem_solver_status", "arguments": {} }
    });
    let mut req = serde_json::to_string(&call).unwrap();
    req.push('\n');
    stdin.write_all(req.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();

    let resp = read_message(&mut reader).await;
    assert_eq!(resp["id"], 4);
    assert!(resp["error"].is_null(), "error: {resp:?}");
    let status = &resp["result"]["structuredContent"];
    assert_eq!(resp["result"]["isError"], false);
    assert!(status["available"].is_boolean(), "status: {status}");
    assert_eq!(status["protocol_version"], 1);
    // De ingebakken bundelhash weet de binary altijd van zichzelf, ook als er
    // geen Node is om mee te rekenen.
    let hash = status["bundle_hash"].as_str().expect("bundle_hash");
    assert!(hash.starts_with("sha256:"), "bundle_hash: {hash}");
    // Werkt het niet, dan moet de reden Nederlands zijn en een remedie noemen —
    // een ontbrekende runtime mag nooit op een rekenfout lijken.
    if status["available"] == json!(false) {
        assert!(status["error_code"].is_string(), "status: {status}");
        assert!(status["reason"].is_string(), "status: {status}");
        assert!(status["remedie"].is_string(), "status: {status}");
    }

    // ── 6. tools/call solve_fem_model zonder model ───────────────────────
    // Een aanroep zonder `model` én zonder `project_path` moet worden
    // geweigerd. Zonder deze poort zou de server een "leeg model" kunnen
    // doorrekenen en nullen teruggeven die als uitkomst lezen.
    let call = json!({
        "jsonrpc": "2.0",
        "id": 5,
        "method": "tools/call",
        "params": { "name": "solve_fem_model", "arguments": {} }
    });
    let mut req = serde_json::to_string(&call).unwrap();
    req.push('\n');
    stdin.write_all(req.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();

    let resp = read_message(&mut reader).await;
    assert_eq!(resp["id"], 5);
    assert_eq!(resp["result"]["isError"], true, "resp: {resp:?}");
    let tekst = resp["result"]["content"][0]["text"].as_str().unwrap_or("");
    assert!(
        tekst.contains("project_path") && tekst.contains("model"),
        "de melding moet beide uitwegen noemen: {tekst}"
    );

    // Cleanup: drop stdin → server sees EOF → exits.
    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
