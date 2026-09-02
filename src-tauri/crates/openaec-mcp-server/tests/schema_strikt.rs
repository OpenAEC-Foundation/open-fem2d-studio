//! Strikt schema en strikte invoer voor `check_steel_beam`.
//!
//! Waarom deze test bestaat: het oude schema zette `additionalProperties` op
//! `true` en verzweeg vijf velden met `#[serde(default)]`. Een client die dat
//! schema volgde liet `q_equiv_n_per_mm` en `z_a_mm` op nul vallen en toetste
//! kip daarmee **gunstiger** dan de app — onveilig aan de verkeerde kant. En
//! omdat nergens `deny_unknown_fields` stond, werd een tikfout in een veldnaam
//! volledig stil genegeerd: de toetsing liep door met een standaardwaarde.
//!
//! De test drijft de echte binary over stdio, net als `stdio_roundtrip.rs`.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

/// Lees één regel JSON-RPC en ontleed hem. Ruime timeout: de eerste aanroep
/// initialiseert de profielendatabase.
async fn lees_bericht<R>(reader: &mut R) -> Value
where
    R: AsyncBufReadExt + Unpin,
{
    let mut regel = String::new();
    let n = timeout(Duration::from_secs(30), reader.read_line(&mut regel))
        .await
        .expect("timeout bij het wachten op een antwoord")
        .expect("read_line mislukt");
    assert!(n > 0, "EOF op stdout — de server is onverwacht gestopt");
    serde_json::from_str(regel.trim())
        .unwrap_or_else(|e| panic!("ongeldige JSON-RPC-regel {regel:?}: {e}"))
}

async fn schrijf(stdin: &mut ChildStdin, waarde: Value) {
    let mut regel = serde_json::to_string(&waarde).unwrap();
    regel.push('\n');
    stdin.write_all(regel.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();
}

/// Start de server en doe de `initialize`-handshake.
async fn start_server() -> (Child, ChildStdin, BufReader<ChildStdout>) {
    let mut child = Command::new(BIN_PATH)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("server starten");
    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let mut reader = BufReader::new(stdout);

    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "schema-strikt-test", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert_eq!(resp["id"], 1);
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Geldige invoer: het referentieportaal, kolom HEB160 S235 — dezelfde
/// getallen als `steel-check/tests/portal_beam2.rs`, zodat hier geen enkel
/// getal verzonnen is.
fn geldige_invoer() -> Value {
    json!({
        "beam_id": 2,
        "profile_name": "HEB160",
        "steel_grade": "S235",
        "length_m": 2.5,
        "forces_envelope": [
            { "combination_id": 22, "position_mm": 0.0,
              "forces": { "n_ed": -233.911, "vy_ed": 0.0, "vz_ed": 17.357,
                          "mt_ed": 0.0, "my_ed": -63.139, "mz_ed": 0.0 } },
            { "combination_id": 21, "position_mm": 0.0,
              "forces": { "n_ed": -232.435, "vy_ed": 0.0, "vz_ed": 19.817,
                          "mt_ed": 0.0, "my_ed": -66.036, "mz_ed": 0.0 } },
            { "combination_id": 11, "position_mm": 0.0,
              "forces": { "n_ed": -201.988, "vy_ed": 0.0, "vz_ed": 17.184,
                          "mt_ed": 0.0, "my_ed": -57.423, "mz_ed": 0.0 } }
        ],
        "lateral_bracing": { "top_flange_positions": [], "bottom_flange_positions": [] },
        "buckling_length_y_m": 2.5,
        "buckling_length_z_m": 2.5,
        "deflection_limit_class": "Floor",
        "deflection_limit_numerator": 333,
        "deflection_actual_max_mm": 0.0,
        "is_cantilever": false,
        "consequence_class": "CC1",
        "pre_camber_mm": 0.0,
        "deflection_permanent_mm": 0.0,
        "q_equiv_n_per_mm": 0.0,
        "z_a_mm": 0.0
    })
}

/// Roep `check_steel_beam` aan en geef het `result`-object terug.
async fn roep_check_aan(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    argumenten: Value,
) -> Value {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": "check_steel_beam", "arguments": argumenten }
        }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    resp["result"].clone()
}

/// De foutmelding zoals de client hem te zien krijgt.
fn foutmelding(result: &Value) -> String {
    result["content"][0]["text"].as_str().unwrap_or("").to_string()
}

// ── 1. Het schema zelf ──────────────────────────────────────────────────────

#[tokio::test]
async fn schema_van_check_steel_beam_is_volledig_en_strikt() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    schrijf(
        &mut stdin,
        json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    let tools = resp["result"]["tools"].as_array().expect("tools is een array");
    let tool = tools
        .iter()
        .find(|t| t["name"] == "check_steel_beam")
        .expect("check_steel_beam ontbreekt in tools/list");
    let schema = &tool["inputSchema"];
    let props = &schema["properties"];

    // Onbekende velden worden geweigerd — spiegelt deny_unknown_fields.
    assert_eq!(
        schema["additionalProperties"], false,
        "check_steel_beam moet additionalProperties: false hebben"
    );

    // De vijf velden met #[serde(default)] stonden niet in het oude schema.
    for veld in [
        "pre_camber_mm",
        "deflection_permanent_mm",
        "q_equiv_n_per_mm",
        "z_a_mm",
        "custom_section",
    ] {
        assert!(
            props[veld].is_object(),
            "veld '{veld}' ontbreekt in het schema; een client laat het dan op de standaardwaarde vallen"
        );
    }

    // Enums die de kern werkelijk kent.
    assert_eq!(
        props["deflection_limit_class"]["enum"],
        json!(["Floor", "Roof", "Cantilever", "Custom"])
    );
    assert_eq!(props["consequence_class"]["enum"], json!(["CC1", "CC2", "CC3"]));
    assert_eq!(
        props["steel_grade"]["enum"],
        json!(["S235", "S275", "S355", "S420", "S460"])
    );

    // lateral_bracing: beide arrays verplicht, geen extra velden.
    let bracing = &props["lateral_bracing"];
    assert_eq!(bracing["additionalProperties"], false);
    assert_eq!(
        bracing["required"],
        json!(["top_flange_positions", "bottom_flange_positions"])
    );
    assert!(bracing["properties"]["top_flange_positions"]["items"].is_object());
    assert!(bracing["properties"]["bottom_flange_positions"]["items"].is_object());

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

// ── 2. Het gedrag van de server op geldige en ongeldige invoer ──────────────

#[tokio::test]
async fn geldige_invoer_wordt_gewoon_getoetst() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let result = roep_check_aan(&mut stdin, &mut reader, 10, geldige_invoer()).await;
    assert_eq!(
        result["isError"], false,
        "geldige invoer moet gewoon rekenen, kreeg: {}",
        foutmelding(&result)
    );
    let checks = result["structuredContent"]["checks"]
        .as_array()
        .expect("resultaat moet een 'checks'-array bevatten");
    assert!(!checks.is_empty(), "er is geen enkele toets uitgevoerd");

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn tikfout_in_veldnaam_wordt_geweigerd_in_plaats_van_stil_genegeerd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    // q_equiv_n_per_m in plaats van q_equiv_n_per_mm. Vóór deze fix rekende de
    // server door met q = 0 en viel de kiptoets gunstiger uit.
    let mut invoer = geldige_invoer();
    let obj = invoer.as_object_mut().unwrap();
    obj.remove("q_equiv_n_per_mm");
    obj.insert("q_equiv_n_per_m".to_string(), json!(12.5));

    let result = roep_check_aan(&mut stdin, &mut reader, 11, invoer).await;
    let melding = foutmelding(&result);
    assert_eq!(
        result["isError"], true,
        "een onbekend veld moet een fout geven, kreeg een resultaat: {result}"
    );
    assert!(
        melding.contains("q_equiv_n_per_m"),
        "de melding moet het onbekende veld noemen, kreeg: {melding}"
    );
    assert!(
        melding.contains("unknown field"),
        "de melding moet aangeven dat het veld onbekend is, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn leeg_lateral_bracing_geeft_een_begrijpelijke_fout() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut invoer = geldige_invoer();
    invoer["lateral_bracing"] = json!({});

    let result = roep_check_aan(&mut stdin, &mut reader, 12, invoer).await;
    let melding = foutmelding(&result);
    assert_eq!(
        result["isError"], true,
        "'lateral_bracing: {{}}' moet een fout geven, kreeg: {result}"
    );
    assert!(
        melding.contains("top_flange_positions"),
        "de melding moet zeggen welk veld ontbreekt, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn onbekend_veld_in_lateral_bracing_wordt_geweigerd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut invoer = geldige_invoer();
    // Enkelvoud in plaats van meervoud: zonder deny_unknown_fields zou dit
    // "missing field top_flange_positions" heten en niet de tikfout noemen.
    invoer["lateral_bracing"] = json!({
        "top_flange_position": [0.5],
        "bottom_flange_positions": []
    });

    let result = roep_check_aan(&mut stdin, &mut reader, 13, invoer).await;
    let melding = foutmelding(&result);
    assert_eq!(result["isError"], true, "kreeg: {result}");
    assert!(
        melding.contains("top_flange_position"),
        "de melding moet het onbekende veld noemen, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
