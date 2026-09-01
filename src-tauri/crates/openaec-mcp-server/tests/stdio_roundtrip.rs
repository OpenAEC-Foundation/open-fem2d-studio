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
    assert_eq!(tools.len(), 5, "expected 5 tools, got {}", tools.len());
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

    // Cleanup: drop stdin → server sees EOF → exits.
    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
