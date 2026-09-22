//! `gui_tools` — de MCP-tools die de DRAAIENDE desktop-app bedienen.
//!
//! Dit zijn geen rekenkern-opdrachten en ze horen dus niet in de drie-wegen-
//! regel: zij *zijn* de weg naar de GUI. Elke tool is één-op-één een actie van
//! `bediening/bediening.ts` in de app (of, voor `gui_screenshot`, van
//! `gui_control.rs` in Rust), aangesproken over het bedieningskanaal:
//! `POST http://127.0.0.1:<poort>/opdracht` met een sessietoken.
//!
//! De app wordt gevonden via `gui-control.json` in haar app-datamap
//! (`%LOCALAPPDATA%\org.openaec.fem2d-studio\`), te overschrijven met
//! `OPENAEC_GUI_CONTROL_FILE`. Ontbreekt het bestand of luistert er niets, dan
//! komt er één duidelijke fout: start de app met `OPENAEC_GUI_CONTROL=1`. Deze
//! server start de app niet zelf — dat hoort bij een testscript, niet bij een
//! tool die ook door een assistent wordt aangeroepen.
//!
//! Antwoorden gaan ongewijzigd door: `structuredContent` is precies wat de
//! actie teruggaf, en een toolfout draagt de tekst van de app.

use base64::Engine as _;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

use crate::RpcError;

/// De vijftien tools. Eén lijst, gebruikt door `is_gui_tool`, de schema's en de
/// dispatch — zodat een tool niet in de lijst kan staan zonder afhandeling.
pub const GUI_TOOLS: [&str; 15] = [
    "gui_quit",
    "gui_status",
    "gui_load_model",
    "gui_build_model",
    "gui_select_member",
    "gui_set_cage",
    "gui_set_analysis",
    "gui_solve",
    "gui_run_checks",
    "gui_open_curtailment",
    "gui_set_view",
    "gui_detach_report",
    "gui_read_checks",
    "gui_screenshot",
    "gui_export_report_pdf",
];

pub fn is_gui_tool(naam: &str) -> bool {
    GUI_TOOLS.contains(&naam)
}

// ── Het kanaal vinden ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Vindbestand {
    pid: u32,
    poort: u16,
    token: String,
    #[serde(default)]
    versie: String,
}

fn vindbestand_pad() -> Result<std::path::PathBuf, RpcError> {
    if let Ok(p) = std::env::var("OPENAEC_GUI_CONTROL_FILE") {
        return Ok(p.into());
    }
    let basis = std::env::var("LOCALAPPDATA")
        .map_err(|_| niet_bereikbaar("LOCALAPPDATA is niet gezet; zet OPENAEC_GUI_CONTROL_FILE"))?;
    Ok(std::path::Path::new(&basis)
        .join("org.openaec.fem2d-studio")
        .join("gui-control.json"))
}

fn niet_bereikbaar(reden: impl std::fmt::Display) -> RpcError {
    RpcError::tool_exec(format!(
        "De app draait niet met bediening aan ({reden}). Start Open FEM2D Studio met de \
         omgevingsvariabele OPENAEC_GUI_CONTROL=1; hij schrijft dan gui-control.json in zijn \
         app-datamap en deze tools vinden hem daar."
    ))
}

fn kanaal() -> Result<Vindbestand, RpcError> {
    let pad = vindbestand_pad()?;
    let tekst = std::fs::read_to_string(&pad)
        .map_err(|e| niet_bereikbaar(format!("{} niet leesbaar: {e}", pad.display())))?;
    serde_json::from_str(&tekst)
        .map_err(|e| niet_bereikbaar(format!("{} onleesbaar: {e}", pad.display())))
}

/// Roep één actie aan over het kanaal. Synchroon; de dispatch zet dit op een
/// blocking-thread zodat de stdio-lus niet stilstaat.
fn roep(naam: &str, args: Value, tijdslimiet_s: u64) -> Result<Value, RpcError> {
    let k = kanaal()?;
    let url = format!("http://127.0.0.1:{}/opdracht", k.poort);
    let antwoord = ureq::post(&url)
        .set("Authorization", &format!("Bearer {}", k.token))
        .timeout(Duration::from_secs(tijdslimiet_s + 15))
        .send_json(json!({ "naam": naam, "args": args, "tijdslimiet_s": tijdslimiet_s }));

    let body: Value = match antwoord {
        Ok(r) => r
            .into_json()
            .map_err(|e| RpcError::tool_exec(format!("antwoord van de app onleesbaar: {e}")))?,
        Err(ureq::Error::Status(code, r)) => {
            let tekst = r.into_string().unwrap_or_default();
            return Err(RpcError::tool_exec(format!("de app antwoordde HTTP {code}: {tekst}")));
        }
        Err(ureq::Error::Transport(t)) => {
            return Err(niet_bereikbaar(format!(
                "pid {} op poort {} antwoordt niet: {t}",
                k.pid, k.poort
            )));
        }
    };

    if body.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(body.get("uitkomst").cloned().unwrap_or(Value::Null))
    } else {
        Err(RpcError::tool_exec(
            body.get("fout")
                .and_then(Value::as_str)
                .unwrap_or("de app meldde een fout zonder tekst")
                .to_string(),
        ))
    }
}

fn status() -> Result<Value, RpcError> {
    let k = kanaal()?;
    let url = format!("http://127.0.0.1:{}/status", k.poort);
    let basis: Value = ureq::get(&url)
        .timeout(Duration::from_secs(5))
        .call()
        .map_err(|e| niet_bereikbaar(format!("pid {} op poort {}: {e}", k.pid, k.poort)))?
        .into_json()
        .map_err(|e| RpcError::tool_exec(format!("status onleesbaar: {e}")))?;
    // De pagina weet meer (weergave, selectie, aantallen); haal dat erbij.
    let pagina = roep("status", json!({}), 10).unwrap_or(Value::Null);
    Ok(json!({
        "bereikbaar": true,
        "pid": k.pid,
        "poort": k.poort,
        "versie": if k.versie.is_empty() { basis["versie"].clone() } else { json!(k.versie) },
        "pagina": pagina,
    }))
}

// ── Dispatch ────────────────────────────────────────────────────────────────

fn lees<T: for<'de> Deserialize<'de>>(naam: &str, args: Value) -> Result<T, RpcError> {
    serde_json::from_value(args).map_err(|e| RpcError::invalid_params(format!("{naam}: {e}")))
}

#[derive(Deserialize)]
struct Leeg {}
#[derive(Deserialize)]
struct MetPad { path: String }
#[derive(Deserialize)]
struct MetId { id: u64 }
#[derive(Deserialize)]
struct MetBeamId { beam_id: u64 }
#[derive(Deserialize)]
struct Korf { beam_id: u64, cage: Value }
#[derive(Deserialize)]
struct Analyse { analysis_type: String }
#[derive(Deserialize)]
struct Weergave { view: String }
#[derive(Deserialize)]
struct Schermafdruk {
    #[serde(default = "hoofdvenster")]
    window: String,
    path: String,
    #[serde(default)]
    dom: bool,
}
fn hoofdvenster() -> String { "main".into() }

/// `gui_export_report_pdf`. Strikt: een tikfout in een veldnaam (bijvoorbeeld
/// `reporttype`) is een fout, geen stil genegeerd veld dat een ander rapport
/// oplevert dan gevraagd.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RapportExport {
    path: String,
    #[serde(default)]
    report_type: Option<String>,
    #[serde(default)]
    page_size: Option<String>,
    #[serde(default)]
    orientation: Option<String>,
    #[serde(default)]
    project: Option<ProjectKop>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectKop {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    number: Option<String>,
    #[serde(default)]
    engineer: Option<String>,
    #[serde(default)]
    company: Option<String>,
    #[serde(default)]
    date: Option<String>,
}

/// Eén keuze uit een vaste lijst, of een invalid_params met de toegestane waarden.
fn keuze(veld: &str, waarde: Option<String>, toegestaan: &[&str]) -> Result<Option<String>, RpcError> {
    match waarde {
        None => Ok(None),
        Some(v) if toegestaan.contains(&v.as_str()) => Ok(Some(v)),
        Some(v) => Err(RpcError::invalid_params(format!(
            "gui_export_report_pdf: `{veld}` must be one of {}, not {v:?}",
            toegestaan.join(" | ")
        ))),
    }
}

/// Vertaal de MCP-argumenten naar de kanaalopdracht `rapport_pdf` (Nederlandse
/// veldnamen, zoals alle opdrachten van `gui_control.rs`). Los van het aanroepen,
/// zodat de vertaling zonder draaiende app te toetsen is.
fn rapport_pdf_args(a: RapportExport) -> Result<Value, RpcError> {
    let pad = std::path::Path::new(&a.path);
    if !pad.is_absolute() {
        return Err(RpcError::invalid_params(format!(
            "gui_export_report_pdf: `path` must be absolute, not {:?}",
            a.path
        )));
    }
    let is_pdf = pad
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err(RpcError::invalid_params(format!(
            "gui_export_report_pdf: `path` must end in .pdf, not {:?}",
            a.path
        )));
    }
    let mut uit = serde_json::Map::new();
    uit.insert("pad".into(), json!(a.path));
    if let Some(t) = keuze("report_type", a.report_type, &["volledig", "beperkt"])? {
        uit.insert("type".into(), json!(t));
    }
    if let Some(f) = keuze("page_size", a.page_size, &["A4", "A3"])? {
        uit.insert("formaat".into(), json!(f));
    }
    if let Some(o) = keuze("orientation", a.orientation, &["portrait", "landscape"])? {
        uit.insert("orientatie".into(), json!(o));
    }
    if let Some(p) = a.project {
        let mut kop = serde_json::Map::new();
        for (k, v) in [
            ("naam", p.name),
            ("nummer", p.number),
            ("constructeur", p.engineer),
            ("bedrijf", p.company),
            ("datum", p.date),
        ] {
            if let Some(v) = v {
                kop.insert(k.into(), json!(v));
            }
        }
        uit.insert("project".into(), Value::Object(kop));
    }
    Ok(Value::Object(uit))
}

/// Het rapport exporteren en de PDF terugleveren. De bytes komen uit het
/// GESCHREVEN BESTAND, niet uit een tweede afdruk: wat de client als base64
/// krijgt, is precies wat op schijf staat en wat de app heeft gecontroleerd.
fn export_report_pdf(args: Value) -> Result<Value, RpcError> {
    let a: RapportExport = lees("gui_export_report_pdf", args)?;
    let kanaal_args = rapport_pdf_args(a)?;
    // Ruim: de app wacht op rekenen, toetsen en paginering vóór hij print.
    let uit = roep("rapport_pdf", kanaal_args, 300)?;
    let geschreven = uit
        .get("pad")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::tool_exec("de app gaf geen pad van de PDF terug"))?
        .to_string();
    let bytes = std::fs::read(&geschreven)
        .map_err(|e| RpcError::tool_exec(format!("de PDF op {geschreven} is niet te lezen: {e}")))?;
    if let Some(gemeld) = uit.get("bytes").and_then(Value::as_u64) {
        if gemeld != bytes.len() as u64 {
            return Err(RpcError::tool_exec(format!(
                "de PDF op {geschreven} is veranderd tussen schrijven en lezen ({gemeld} → {} bytes)",
                bytes.len()
            )));
        }
    }
    if !bytes.starts_with(b"%PDF-") {
        return Err(RpcError::tool_exec(format!("{geschreven} is geen PDF")));
    }
    Ok(json!({
        "path": geschreven,
        "bytes": bytes.len(),
        "pages": uit.get("paginas").cloned().unwrap_or(Value::Null),
        "sheets": uit.get("vellen").cloned().unwrap_or(Value::Null),
        "report_type": uit.get("rapportType").cloned().unwrap_or(Value::Null),
        "page_size": uit.get("formaat").cloned().unwrap_or(Value::Null),
        "orientation": uit.get("orientatie").cloned().unwrap_or(Value::Null),
        "pdf_base64": base64::engine::general_purpose::STANDARD.encode(&bytes),
        // Wat de app over dit document meldt (kop, toetsing, analysetype, wat er
        // is teruggezet) — in de woorden van de app.
        "details": uit,
    }))
}

pub async fn dispatch(naam: &str, args: Value) -> Result<Value, RpcError> {
    let naam = naam.to_string();
    // ureq is synchroon; buiten de stdio-lus houden.
    tokio::task::spawn_blocking(move || dispatch_sync(&naam, args))
        .await
        .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?
}

fn dispatch_sync(naam: &str, args: Value) -> Result<Value, RpcError> {
    match naam {
        "gui_status" => {
            let _: Leeg = lees(naam, args)?;
            status()
        }
        "gui_load_model" => {
            let a: MetPad = lees(naam, args)?;
            roep("model_laden", json!({ "pad": a.path }), 60)
        }
        "gui_build_model" => roep("model_bouwen", args, 60),
        "gui_select_member" => {
            let a: MetId = lees(naam, args)?;
            roep("staaf_selecteren", json!({ "id": a.id }), 30)
        }
        "gui_set_cage" => {
            let a: Korf = lees(naam, args)?;
            roep("korf_zetten", json!({ "beamId": a.beam_id, "korf": a.cage }), 30)
        }
        "gui_set_analysis" => {
            let a: Analyse = lees(naam, args)?;
            roep("analysetype_zetten", json!({ "analysetype": a.analysis_type }), 30)
        }
        "gui_solve" => {
            let _: Leeg = lees(naam, args)?;
            roep("rekenen", json!({}), 120)
        }
        "gui_run_checks" => {
            let _: Leeg = lees(naam, args)?;
            roep("toetsen", json!({}), 300)
        }
        "gui_open_curtailment" => {
            let a: MetBeamId = lees(naam, args)?;
            roep("dekkingslijn_openen", json!({ "beamId": a.beam_id }), 180)
        }
        "gui_set_view" => {
            let a: Weergave = lees(naam, args)?;
            roep("weergave_zetten", json!({ "view": a.view }), 30)
        }
        "gui_detach_report" => {
            let _: Leeg = lees(naam, args)?;
            roep("rapport_losmaken", json!({}), 60)
        }
        "gui_read_checks" => {
            let _: Leeg = lees(naam, args)?;
            roep("toetsen_uitlezen", json!({}), 30)
        }
        "gui_screenshot" => {
            let a: Schermafdruk = lees(naam, args)?;
            roep(
                "screenshot",
                json!({ "venster": a.window, "pad": a.path, "dom": a.dom }),
                60,
            )
        }
        "gui_quit" => {
            let _: Leeg = lees(naam, args)?;
            roep("afsluiten", json!({}), 10)
        }
        "gui_export_report_pdf" => export_report_pdf(args),
        anders => Err(RpcError::method_not_found(anders)),
    }
}

// ── Schema's ────────────────────────────────────────────────────────────────

fn leeg_schema() -> Value {
    json!({ "type": "object", "properties": {}, "additionalProperties": false })
}

pub fn tool_definitions() -> Vec<Value> {
    let vooraf = "Drives the RUNNING Open FEM2D Studio desktop app through its control channel \
                  (the app must be started with OPENAEC_GUI_CONTROL=1). ";
    vec![
        json!({
            "name": "gui_status",
            "description": format!("{vooraf}Reports whether the app is reachable, its pid/port/version, and what the page sees: active view, selection, member count, whether checks are running."),
            "inputSchema": leeg_schema()
        }),
        json!({
            "name": "gui_load_model",
            "description": format!("{vooraf}Loads a project file (.femp / .ifcfem2d) into the app. The file is read by the app process itself, so any path the app can read works."),
            "inputSchema": { "type": "object", "additionalProperties": false, "required": ["path"],
                "properties": { "path": { "type": "string", "description": "Absolute path to the project file." } } }
        }),
        json!({
            "name": "gui_build_model",
            "description": format!("{vooraf}Builds a model in the app from scratch through the same store actions the canvas uses. Coordinates in mm; loads per the app's Load type. A new project already holds the load cases \"Eigen gewicht\" (id 5, marked `eigenGewicht`: filled automatically with q = ρ·A·g per member, read-only — a load with that caseId is refused), \"Permanent (G)\" (id 1), \"Variabel (Q)\" (2), \"Sneeuw (S)\" (3) and \"Wind (W)\" (4); the result returns the load cases as they stand (`loadCases`, with `eigenGewicht` on the automatic one) and `selfWeightEnabled`."),
            "inputSchema": { "type": "object", "additionalProperties": false,
                "properties": {
                    "nodes": { "type": "array", "items": { "type": "object", "properties": { "x": {"type":"number"}, "z": {"type":"number"} }, "required": ["x","z"] } },
                    "beams": { "type": "array", "items": { "type": "object", "properties": { "from": {"type":"integer"}, "to": {"type":"integer"}, "updates": {"type":"object"} }, "required": ["from","to"] }, "description": "from/to are 1-based indices into `nodes`; `updates` is a Partial<Beam> applied after creation (material, profileName, betonKorf, ...)." },
                    "supports": { "type": "array", "items": { "type": "object", "properties": { "node": {"type":"integer"}, "type": {"type":"string"}, "k": {"type":"number"} }, "required": ["node","type"] } },
                    "loads": { "type": "array", "items": { "type": "object" }, "description": "Load objects without id (the app assigns ids)." },
                    "load_cases": { "type": "array", "items": { "type": "string" } }
                } }
        }),
        json!({
            "name": "gui_select_member",
            "description": format!("{vooraf}Selects one member (beam) in the app, as if clicked on the canvas."),
            "inputSchema": { "type": "object", "additionalProperties": false, "required": ["id"],
                "properties": { "id": { "type": "integer" } } }
        }),
        json!({
            "name": "gui_set_cage",
            "description": format!("{vooraf}Sets the reinforcement cage of a concrete member — the same ReinforcementCage shape `check_concrete_beam` takes (cover_mm, stirrup_diameter_mm, top/bottom rows, stirrup_spacing_mm, stirrup_legs). The app validates it with its own `controleerKorf`; a rejected cage comes back as the app's own message."),
            "inputSchema": { "type": "object", "additionalProperties": false, "required": ["beam_id", "cage"],
                "properties": { "beam_id": { "type": "integer" }, "cage": { "type": "object" } } }
        }),
        json!({
            "name": "gui_set_analysis",
            "description": format!("{vooraf}Sets the analysis type: eersteOrde, tweedeOrdeGeometrisch (P-Delta) or tweedeOrdeFysisch (P-Delta + physically non-linear concrete)."),
            "inputSchema": { "type": "object", "additionalProperties": false, "required": ["analysis_type"],
                "properties": { "analysis_type": { "type": "string", "enum": ["eersteOrde", "tweedeOrdeGeometrisch", "tweedeOrdeFysisch"] } } }
        }),
        json!({
            "name": "gui_solve",
            "description": format!("{vooraf}Runs the full calculation exactly as the Bereken button does: all load cases and combinations, the physically non-linear concrete round when the analysis type is tweedeOrdeFysisch, and the code checks. Returns only when all of that is done (a recalculation that was already scheduled after a model change runs first). Returns per combination the extreme M, V, N and deflection, which non-linear round ran, and a summary of the checks."),
            "inputSchema": leeg_schema()
        }),
        json!({
            "name": "gui_run_checks",
            "description": format!("{vooraf}Runs the code checks (steel, timber, concrete) as the Toetsing button does, waits until the check store reports done, and returns the results per member — or the app's error text."),
            "inputSchema": leeg_schema()
        }),
        json!({
            "name": "gui_open_curtailment",
            "description": format!("{vooraf}Selects a concrete member and opens the curtailment (dekkingslijn) panel, waits for the kernel answer, and returns {{verzoek, antwoord}}: the exact DekkingslijnVerzoek the panel sent and the DekkingslijnAntwoord it got back — replay `verzoek` through `concrete_dekkingslijn` to verify the GUI against the engine. Or the panel's error text."),
            "inputSchema": { "type": "object", "additionalProperties": false, "required": ["beam_id"],
                "properties": { "beam_id": { "type": "integer" } } }
        }),
        json!({
            "name": "gui_set_view",
            "description": format!("{vooraf}Switches the main window view: default (canvas), check, report, insights, ifc, viewer."),
            "inputSchema": { "type": "object", "additionalProperties": false, "required": ["view"],
                "properties": { "view": { "type": "string" } } }
        }),
        json!({
            "name": "gui_detach_report",
            "description": format!("{vooraf}Opens the live report in its own window and returns that window's Tauri label (for gui_screenshot)."),
            "inputSchema": leeg_schema()
        }),
        json!({
            "name": "gui_read_checks",
            "description": format!("{vooraf}Reads the current check results from the app without re-running them."),
            "inputSchema": leeg_schema()
        }),
        json!({
            "name": "gui_screenshot",
            "description": format!("{vooraf}Captures a window of the app to a PNG file: real pixels via PrintWindow (default), or with dom=true a DOM render via html2canvas. `window` is the Tauri label: main, or the label gui_detach_report returned."),
            "inputSchema": { "type": "object", "additionalProperties": false, "required": ["path"],
                "properties": {
                    "window": { "type": "string", "default": "main" },
                    "path": { "type": "string", "description": "Absolute path of the PNG to write." },
                    "dom": { "type": "boolean", "default": false }
                } }
        }),
        json!({
            "name": "gui_export_report_pdf",
            "description": format!("{vooraf}Exports the app's STANDARD REPORT — the live report, volledig or beperkt, the same document File → Print → Save as PDF gives — to a PDF file, and returns it as base64 as well. Requires a current calculation and check (call gui_solve first): the tool REFUSES with the reason when there are no results, when they are stale, when a calculation or check is still running or scheduled, or when the check failed. A model without checkable members is valid; the report then states that nothing was checked. report_type, page_size, orientation and project apply to THIS export only and are restored afterwards — the user's settings and what Save writes to the project file do not change. Waits for an explicit ready signal (pagination done, table of contents settled, fonts loaded) instead of a fixed delay. The main window switches to the report during the export and back afterwards; a minimized window is restored for the export and minimized again. Windows only (WebView2 PrintToPdf). The PDF is checked — %PDF header and page count equal to the report's sheet count — and on a mismatch no file is left at `path`. Returns {{path, bytes, pages, sheets, report_type, page_size, orientation, pdf_base64, details}}."),
            "inputSchema": { "type": "object", "additionalProperties": false, "required": ["path"],
                "properties": {
                    "path": { "type": "string", "description": "Absolute path of the PDF to write; must end in .pdf. An existing file is replaced." },
                    "report_type": { "type": "string", "enum": ["volledig", "beperkt"], "description": "Report preset: volledig (complete calculation, all chapters and derivations) or beperkt (the summary for the client). Omitted: the report settings currently in the app." },
                    "page_size": { "type": "string", "enum": ["A4", "A3"] },
                    "orientation": { "type": "string", "enum": ["portrait", "landscape"] },
                    "project": { "type": "object", "additionalProperties": false,
                        "description": "Project header for this export only. When given, ALL header text fields come from here (fields left out stay empty), so nothing of a previous project leaks into the header; the design basis (consequence class, design life) stays the one the calculation used. Omitted: the app's project settings.",
                        "properties": {
                            "name": { "type": "string" },
                            "number": { "type": "string" },
                            "engineer": { "type": "string" },
                            "company": { "type": "string" },
                            "date": { "type": "string", "description": "Printed as given; an ISO date (2026-09-15) is written out in Dutch." }
                        } }
                } }
        }),
        json!({
            "name": "gui_quit",
            "description": format!("{vooraf}Closes the app gracefully (through the app's own exit path, so its control file is cleaned up). Unsaved work is discarded — the app does not ask."),
            "inputSchema": leeg_schema()
        }),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn elke_tool_heeft_een_schema_en_andersom() {
        let defs = tool_definitions();
        assert_eq!(defs.len(), GUI_TOOLS.len());
        for d in &defs {
            let naam = d["name"].as_str().unwrap();
            assert!(is_gui_tool(naam), "{naam} ontbreekt in GUI_TOOLS");
        }
    }

    fn export(args: Value) -> Result<Value, RpcError> {
        rapport_pdf_args(lees("gui_export_report_pdf", args)?)
    }

    fn absoluut(naam: &str) -> String {
        std::env::temp_dir().join(naam).to_string_lossy().into_owned()
    }

    #[test]
    fn export_vertaalt_naar_de_kanaalopdracht() {
        let pad = absoluut("rapport.pdf");
        let uit = export(json!({
            "path": pad,
            "report_type": "beperkt",
            "page_size": "A3",
            "orientation": "landscape",
            "project": { "name": "Loods", "number": "P-12", "date": "2026-09-15" }
        }))
        .unwrap();
        assert_eq!(
            uit,
            json!({
                "pad": pad,
                "type": "beperkt",
                "formaat": "A3",
                "orientatie": "landscape",
                "project": { "naam": "Loods", "nummer": "P-12", "datum": "2026-09-15" }
            })
        );
        // Alleen het pad: de app gebruikt dan haar eigen rapportinstellingen.
        assert_eq!(export(json!({ "path": pad })).unwrap(), json!({ "pad": pad }));
    }

    #[test]
    fn export_weigert_onbekende_velden_en_waarden() {
        let pad = absoluut("rapport.pdf");
        assert!(export(json!({ "path": pad, "reporttype": "beperkt" })).is_err());
        assert!(export(json!({ "path": pad, "report_type": "kort" })).is_err());
        assert!(export(json!({ "path": pad, "page_size": "A5" })).is_err());
        assert!(export(json!({ "path": pad, "orientation": "staand" })).is_err());
        assert!(export(json!({ "path": pad, "project": { "naam": "Loods" } })).is_err());
        assert!(export(json!({ "path": "rapport.pdf" })).is_err(), "relatief pad");
        assert!(export(json!({ "path": absoluut("rapport.png") })).is_err(), "geen .pdf");
        assert!(export(json!({})).is_err(), "pad ontbreekt");
    }

    #[test]
    fn het_schema_van_de_export_is_strikt() {
        let defs = tool_definitions();
        let d = defs
            .iter()
            .find(|d| d["name"] == "gui_export_report_pdf")
            .expect("gui_export_report_pdf heeft een schema");
        let s = &d["inputSchema"];
        assert_eq!(s["additionalProperties"], json!(false));
        assert_eq!(s["required"], json!(["path"]));
        assert_eq!(s["properties"]["project"]["additionalProperties"], json!(false));
        assert_eq!(s["properties"]["report_type"]["enum"], json!(["volledig", "beperkt"]));
    }
}
