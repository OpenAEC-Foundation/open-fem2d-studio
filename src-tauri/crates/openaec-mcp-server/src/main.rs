//! openaec-mcp-server — Model Context Protocol server exposing the
//! OpenAEC steel-check engine over stdio (JSON-RPC 2.0).
//!
//! Speaks newline-delimited JSON-RPC on stdin/stdout. stderr is reserved
//! for human-readable tracing (so it never collides with protocol traffic).
//!
//! Implements the minimal subset of MCP needed for tool calls from
//! Claude Desktop / Claude Code: `initialize`, `notifications/initialized`,
//! `tools/list`, `tools/call`. Protocol version: 2025-06-18.
//!
//! Heavy work (PDF generation, steel checks) runs on
//! `tokio::task::spawn_blocking` so the stdio reader never stalls.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;

const PROTOCOL_VERSION: &str = "2025-06-18";
const SERVER_NAME: &str = "openaec-fem";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

// ── JSON-RPC types ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct Request {
    jsonrpc: String,
    #[serde(default)]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct Response {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
struct RpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

impl RpcError {
    fn invalid_params(msg: impl Into<String>) -> Self {
        Self { code: -32602, message: msg.into(), data: None }
    }
    fn tool_exec(msg: impl Into<String>) -> Self {
        Self { code: -32000, message: msg.into(), data: None }
    }
    fn method_not_found(method: &str) -> Self {
        Self { code: -32601, message: format!("Method not found: {method}"), data: None }
    }
}

fn ok(id: Value, result: Value) -> Response {
    Response { jsonrpc: "2.0", id, result: Some(result), error: None }
}
fn err(id: Value, error: RpcError) -> Response {
    Response { jsonrpc: "2.0", id, result: None, error: Some(error) }
}

// ── Tool registry ────────────────────────────────────────────────────────────

/// Schema van `forces_envelope` (`Vec<ForcePoint>`).
///
/// Geen `additionalProperties: false` op de punten zelf: `ForcePoint` en
/// `InternalForces` kennen geen `#[serde(default)]`, dus daar levert een
/// tikfout altijd al een "missing field"-fout op. Het schema belooft hier dus
/// niet strenger te zijn dan de server werkelijk is.
fn schema_krachtenomhullende() -> Value {
    json!({
        "type": "array",
        "description": "Omhullende van de snedekrachten: per combinatie en per station een punt. Eenheden kN en kNm; N positief = trek.",
        "items": {
            "type": "object",
            "required": ["combination_id", "position_mm", "forces"],
            "properties": {
                "combination_id": { "type": "integer", "minimum": 0 },
                "position_mm": { "type": "number", "description": "Afstand vanaf het staafbegin in mm." },
                "forces": {
                    "type": "object",
                    "required": ["n_ed", "vy_ed", "vz_ed", "mt_ed", "my_ed", "mz_ed"],
                    "properties": {
                        "n_ed":  { "type": "number", "description": "Normaalkracht kN, positief = trek." },
                        "vy_ed": { "type": "number", "description": "Dwarskracht kN." },
                        "vz_ed": { "type": "number", "description": "Dwarskracht kN." },
                        "mt_ed": { "type": "number", "description": "Wringend moment kNm." },
                        "my_ed": { "type": "number", "description": "Buigend moment kNm." },
                        "mz_ed": { "type": "number", "description": "Buigend moment kNm." }
                    }
                }
            }
        }
    })
}

/// Schema van `custom_section` (D4.3, inline opgegeven doorsnede).
///
/// Alle geneste objecten staan op `additionalProperties: false`, gelijk aan
/// `#[serde(deny_unknown_fields)]` op `CustomSection`, `CustomLamella`,
/// `CustomGeslotenCel` en `CustomPunt`. Uitzondering: `eigenschappen`
/// (`SectionProperties`) blijft los — dat type staat in een andere crate en
/// is hier niet aangepast.
fn schema_custom_section() -> Value {
    json!({
        "type": ["object", "null"],
        "additionalProperties": false,
        "description": "Inline opgegeven doorsnede. Gevuld = de profielendatabase wordt niet geraadpleegd. Weglaten of null = het gewone pad via 'profile_name'.",
        "required": ["naam"],
        "properties": {
            "naam": { "type": "string", "description": "Naam zoals hij in het rapport verschijnt." },
            "lamellen": {
                "type": "array",
                "description": "Rechthoekige platen waaruit de doorsnede is opgebouwd.",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["b_mm", "t_mm", "y_mm", "z_mm"],
                    "properties": {
                        "b_mm": { "type": "number", "description": "Lengte in de lengterichting van de plaat." },
                        "t_mm": { "type": "number", "description": "Dikte loodrecht daarop." },
                        "y_mm": { "type": "number" },
                        "z_mm": { "type": "number" },
                        "alpha_rad": { "type": "number", "default": 0,
                            "description": "Hoek van de lengterichting met de y-as; 0 = liggend, pi/2 = staand." }
                    }
                }
            },
            "gesloten_cellen": {
                "type": "array",
                "description": "Expliciet gedeclareerde gesloten cellen voor de Bredt-torsie. Ontbreken ze terwijl de lamellen wel een cel sluiten, dan wordt I_t met de open formule bepaald en verschijnt daarover een melding.",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["midlijn", "dikte_mm", "lamellen"],
                    "properties": {
                        "midlijn": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["y_mm", "z_mm"],
                                "properties": {
                                    "y_mm": { "type": "number" },
                                    "z_mm": { "type": "number" }
                                }
                            }
                        },
                        "dikte_mm": { "type": "array", "items": { "type": "number" } },
                        "lamellen": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                    }
                }
            },
            "eigenschappen": {
                "type": ["object", "null"],
                "description": "Kant-en-klare doorsnede-eigenschappen (SectionProperties); alleen gebruikt als 'lamellen' leeg is."
            },
            "vorm": {
                "type": "string",
                "enum": ["Onbekend", "GelasteIDubbelsymmetrisch", "GelasteIMonosymmetrisch", "Koker", "RondeBuis"],
                "default": "Onbekend",
                "description": "Vormaanduiding; alleen gebruikt als 'lamellen' leeg is. 'Onbekend' leidt tot weigering van de toetsing."
            }
        }
    })
}

/// Levert de payload van `tools/list`.
///
/// `check_steel_beam` heeft een **volledig en strikt** schema: elk veld dat de
/// Rust-kant kent staat erin, en `additionalProperties` staat op `false`. Dat
/// spiegelt `#[serde(deny_unknown_fields)]` op `BeamCheckInput`, zodat een
/// tikfout in een veldnaam een fout oplevert in plaats van een stille
/// terugval op de standaardwaarde. Dat verschil is niet cosmetisch: de vijf
/// `#[serde(default)]`-velden (onder andere `q_equiv_n_per_mm` en `z_a_mm`)
/// maken de kiptoets **gunstiger** als ze op nul vallen — onveilig aan de
/// verkeerde kant.
///
/// `generate_steel_report_pdf` staat nog wél op `additionalProperties: true`;
/// dat is een rapportage-invoer zonder rekengevolg.
fn tool_definitions() -> Value {
    json!([
        {
            "name": "list_steel_profiles",
            "description": "List all steel cross-section profiles in the OpenAEC database (HEA, HEB, IPE, HEM, UNP, RHS, SHS, CHS). Each profile includes geometry, section properties, and EN 1993-1-1 buckling curves.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "list_steel_grades",
            "description": "List supported EN 10025 structural-steel grades (S235, S275, S355, S420, S460) with yield strength, ultimate strength and partial factors gamma_M0/M1/M2.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "check_steel_beam",
            "description": "Run the full EN 1993-1-1 steel check (cross-section resistance §6.2, member stability §6.3, deflection SLS) on a single beam. Input is a BeamCheckInput (profile name, grade, length, force envelope, lateral bracing, etc.). Returns BeamCheckResult with full derivation trace.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "beam_id": { "type": "integer", "minimum": 0,
                        "description": "Staafnummer; komt onveranderd terug in het resultaat." },
                    "profile_name": { "type": "string",
                        "description": "Profielnaam uit de catalogus, bijvoorbeeld 'HEA200' of 'IPE300'. Wordt genegeerd als 'custom_section' is ingevuld." },
                    "steel_grade": { "type": "string", "enum": ["S235", "S275", "S355", "S420", "S460"],
                        "description": "Staalsoort. Alleen deze vijf worden herkend; een andere waarde valt in de kern stilzwijgend terug op S235." },
                    "length_m": { "type": "number",
                        "description": "Staaflengte in m." },
                    "forces_envelope": schema_krachtenomhullende(),
                    "lateral_bracing": {
                        "type": "object",
                        "additionalProperties": false,
                        "description": "Kipsteunen als fracties van de staaflengte (0..1). Beide arrays zijn verplicht; een leeg object wordt geweigerd omdat de Rust-kant hier geen standaardwaarden kent. Geen kipsteunen = twee lege arrays.",
                        "required": ["top_flange_positions", "bottom_flange_positions"],
                        "properties": {
                            "top_flange_positions":    { "type": "array", "items": { "type": "number" } },
                            "bottom_flange_positions": { "type": "array", "items": { "type": "number" } }
                        }
                    },
                    "buckling_length_y_m": { "type": "number", "description": "Kniklengte om de sterke as, m." },
                    "buckling_length_z_m": { "type": "number", "description": "Kniklengte om de zwakke as, m." },
                    "deflection_limit_class": { "type": "string",
                        "enum": ["Floor", "Roof", "Cantilever", "Custom"],
                        "description": "Doorbuigingsklasse. De noemer uit 'deflection_limit_numerator' telt alleen bij 'Custom'." },
                    "deflection_limit_numerator": { "type": "integer", "minimum": 0,
                        "description": "Noemer x in de eis L/x; alleen gebruikt bij klasse 'Custom'." },
                    "deflection_actual_max_mm": { "type": "number",
                        "description": "Gerekende veldzakking in mm, met teken (negatief = omlaag)." },
                    "is_cantilever": { "type": "boolean" },
                    "consequence_class": { "type": "string", "enum": ["CC1", "CC2", "CC3"] },
                    "pre_camber_mm": { "type": "number", "default": 0,
                        "description": "Zeeg in mm, zelfde tekenconventie als de doorbuiging." },
                    "deflection_permanent_mm": { "type": "number", "default": 0,
                        "description": "Doorbuiging onder de permanente BGT-combinatie (mm), voor w_add. 0 betekent w_add = w_fin (veilig-zijdig)." },
                    "q_equiv_n_per_mm": { "type": "number", "default": 0,
                        "description": "Equivalente gelijkmatig verdeelde belasting in het kipveld (N/mm), voor B* volgens NB.4.3(3). 0 = alleen eindmomenten en dat is GUNSTIGER; laat dit veld niet per ongeluk weg." },
                    "z_a_mm": { "type": "number", "default": 0,
                        "description": "Afstand zwaartepunt tot aangrijpingspunt van de belasting (mm). Positief = boven het zwaartepunt, destabiliserend (last op de bovenflens: z_a = h/2). 0 is GUNSTIGER dan een last op de bovenflens." },
                    "custom_section": schema_custom_section()
                },
                "required": [
                    "beam_id", "profile_name", "steel_grade", "length_m",
                    "forces_envelope", "lateral_bracing",
                    "buckling_length_y_m", "buckling_length_z_m",
                    "deflection_limit_class", "deflection_limit_numerator",
                    "deflection_actual_max_mm", "is_cantilever", "consequence_class"
                ]
            }
        },
        {
            "name": "compute_section_properties",
            "description": "Recompute section properties (A, Iy, Iz, Wel, Wpl, It, Iw, etc.) from the catalogue geometry of a named profile. Uses the analytical helpers in section-properties (i_section_props, channel_section_props, rhs_section_props). For CHS profiles falls back to catalogue values.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "profile_name": { "type": "string", "description": "e.g. 'HEA200'" }
                },
                "required": ["profile_name"],
                "additionalProperties": false
            }
        },
        {
            "name": "generate_steel_report_pdf",
            "description": "Generate a complete EN 1993-1-1 steel-check PDF report from a list of BeamCheckResult. Returns the PDF as base64 plus byte_count. Heavy operation — runs on a blocking task.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_name":        { "type": "string" },
                    "project_number":      { "type": "string" },
                    "engineer":            { "type": "string" },
                    "company":             { "type": "string" },
                    "date":                { "type": "string" },
                    "steel_check_results": { "type": "array" }
                },
                "required": [
                    "project_name", "project_number", "engineer",
                    "company", "date", "steel_check_results"
                ],
                "additionalProperties": true
            }
        }
    ])
}

// ── Tool dispatch ────────────────────────────────────────────────────────────

async fn dispatch_tool(name: &str, args: Value) -> Result<Value, RpcError> {
    match name {
        "list_steel_profiles" => {
            let profiles = tokio::task::spawn_blocking(|| {
                steel_profiles::db().all().to_vec()
            })
            .await
            .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?;
            Ok(json!({ "profiles": profiles }))
        }
        "list_steel_grades" => {
            use nen_en_1993_1_1_section::{S235, S275, S355, S420, S460};
            let grades = vec![S235, S275, S355, S420, S460];
            Ok(json!({ "grades": grades }))
        }
        "check_steel_beam" => {
            let input: steel_check::BeamCheckInput = serde_json::from_value(args)
                .map_err(|e| RpcError::invalid_params(format!("BeamCheckInput: {e}")))?;
            let result = tokio::task::spawn_blocking(move || {
                steel_check::check_beam(input)
            })
            .await
            .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?;
            serde_json::to_value(result)
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        "compute_section_properties" => {
            let profile_name = args
                .get("profile_name")
                .and_then(Value::as_str)
                .ok_or_else(|| RpcError::invalid_params("missing string field 'profile_name'"))?
                .to_owned();
            let result = tokio::task::spawn_blocking(move || compute_section_props(&profile_name))
                .await
                .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))??;
            serde_json::to_value(result)
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        "generate_steel_report_pdf" => {
            let input: report::ReportInput = serde_json::from_value(args)
                .map_err(|e| RpcError::invalid_params(format!("ReportInput: {e}")))?;
            let bytes = tokio::task::spawn_blocking(move || {
                report::generate_report_pdf(input)
            })
            .await
            .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?;
            let byte_count = bytes.len();
            let pdf_b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            Ok(json!({ "pdf_base64": pdf_b64, "byte_count": byte_count }))
        }
        other => Err(RpcError::method_not_found(other)),
    }
}

fn compute_section_props(
    profile_name: &str,
) -> Result<section_properties::SectionProperties, RpcError> {
    use steel_profiles::ProfileKind;
    let profile = steel_profiles::db()
        .find(profile_name)
        .ok_or_else(|| RpcError::invalid_params(format!("unknown profile: {profile_name}")))?;
    let g = &profile.geometry;
    let props = match profile.kind {
        ProfileKind::ISection => {
            section_properties::i_section::i_section_props(g.h, g.b, g.tw, g.tf, g.r)
        }
        ProfileKind::Channel => {
            section_properties::channel::channel_section_props(g.h, g.b, g.tw, g.tf, g.r)
        }
        ProfileKind::Rhs | ProfileKind::Shs => {
            section_properties::rhs::rhs_section_props(g.h, g.b, g.t, g.r)
        }
        ProfileKind::Chs => {
            // Not implemented analytically — fall back to catalogue values.
            profile.properties
        }
    };
    Ok(props)
}

// ── JSON-RPC method dispatch ────────────────────────────────────────────────

/// Returns `None` for notifications (no response should be written).
async fn handle_request(req: Request) -> Option<Response> {
    if req.jsonrpc != "2.0" {
        if let Some(id) = req.id {
            return Some(err(id, RpcError {
                code: -32600,
                message: format!("Invalid Request: jsonrpc must be '2.0', got '{}'", req.jsonrpc),
                data: None,
            }));
        }
        return None;
    }

    let id = req.id.clone();
    let is_notification = id.is_none();

    let response_payload: Result<Value, RpcError> = match req.method.as_str() {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION }
        })),
        "notifications/initialized" | "initialized" => {
            tracing::info!("client initialized");
            return None;
        }
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => {
            let params = req.params.unwrap_or_else(|| json!({}));
            let name = match params.get("name").and_then(Value::as_str) {
                Some(n) => n.to_owned(),
                None => {
                    let resp = err(
                        id.unwrap_or(Value::Null),
                        RpcError::invalid_params("tools/call requires 'name' string param"),
                    );
                    return Some(resp);
                }
            };
            let arguments = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            match dispatch_tool(&name, arguments).await {
                Ok(value) => {
                    // Per MCP spec: tool result is wrapped as { content: [{type: "text", text: <json>}], isError: false }
                    let text = serde_json::to_string(&value)
                        .unwrap_or_else(|e| format!("{{\"error\":\"serialize: {e}\"}}"));
                    Ok(json!({
                        "content": [{ "type": "text", "text": text }],
                        "isError": false,
                        "structuredContent": value
                    }))
                }
                Err(e) => {
                    // Tool execution errors are reported in result, not as JSON-RPC errors,
                    // per MCP spec for tools/call (so the model can see them).
                    Ok(json!({
                        "content": [{ "type": "text", "text": format!("Error: {}", e.message) }],
                        "isError": true
                    }))
                }
            }
        }
        "ping" => Ok(json!({})),
        other => Err(RpcError::method_not_found(other)),
    };

    if is_notification {
        return None;
    }
    let id = id.unwrap_or(Value::Null);
    Some(match response_payload {
        Ok(v) => ok(id, v),
        Err(e) => err(id, e),
    })
}

// ── Stdio loop ───────────────────────────────────────────────────────────────

async fn run_stdio() -> std::io::Result<()> {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    let stdout = Arc::new(Mutex::new(stdout));

    let mut reader = BufReader::new(stdin).lines();
    while let Some(line) = reader.next_line().await? {
        let line = line.trim().to_string();
        if line.is_empty() { continue; }

        let stdout = stdout.clone();
        tokio::spawn(async move {
            let resp = match serde_json::from_str::<Request>(&line) {
                Ok(req) => handle_request(req).await,
                Err(e) => {
                    tracing::warn!(error = %e, raw = %line, "failed to parse request");
                    Some(err(Value::Null, RpcError {
                        code: -32700,
                        message: format!("Parse error: {e}"),
                        data: None,
                    }))
                }
            };
            if let Some(resp) = resp {
                match serde_json::to_string(&resp) {
                    Ok(mut s) => {
                        s.push('\n');
                        let mut out = stdout.lock().await;
                        if let Err(e) = out.write_all(s.as_bytes()).await {
                            tracing::error!(error = %e, "stdout write failed");
                        }
                        if let Err(e) = out.flush().await {
                            tracing::error!(error = %e, "stdout flush failed");
                        }
                    }
                    Err(e) => tracing::error!(error = %e, "failed to serialize response"),
                }
            }
        });
    }
    Ok(())
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> std::io::Result<()> {
    // Tracing → stderr only. stdout is exclusively for protocol traffic.
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("OPENAEC_MCP_LOG")
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!(version = SERVER_VERSION, "openaec-mcp-server starting on stdio");
    run_stdio().await?;
    tracing::info!("openaec-mcp-server shutting down (stdin closed)");
    Ok(())
}
