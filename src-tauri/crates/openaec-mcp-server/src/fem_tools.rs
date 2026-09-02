//! fem_tools.rs — de vijf FEM-tools van de MCP-server (taak T10).
//!
//! WAT HIER NIET GEBEURT
//! Hier wordt niet gerekend. Geen stijfheidsmatrix, geen doorsnedegrootheid,
//! geen eenheidsomrekening. Elke tool hieronder zet een verzoek klaar voor de
//! Node-sidecar en geeft het antwoord door. De reden staat in het plan §1: een
//! tweede rekenimplementatie betekent dat hetzelfde model twee plausibele
//! antwoorden kan geven, en in constructieve software is dat een
//! veiligheidsprobleem, geen onderhoudslast. Deze repo heeft die fout één keer
//! gemaakt (`linalg.ts`, `loads.ts`, `stiffness.ts` — "was part of the
//! fake/parallel in-process solver") en opgeruimd; hij wordt niet herhaald.
//!
//! DE ENIGE UITZONDERING is `check_fem_model`, en die is geen uitzondering op
//! de regel maar de bevestiging ervan: de toetsing gaat door
//! `steel_check::check_all_beams` — letterlijk dezelfde functie die de app via
//! `src-tauri/src/lib.rs` aanroept. De solve blijft in Node, de toetsing blijft
//! in Rust, en niets wordt op twee plaatsen uitgerekend.
//!
//! DE MODELVORM IS DIE VAN HET PROJECTBESTAND
//! Het `model`-object in de schema's hieronder is exact de vorm die in een
//! `.ifcfem2d`-bestand staat en die `bouwMultiInput` leest — dezelfde velden,
//! dezelfde namen, dezelfde enum-waarden. Bewust geen eigen, vereenvoudigd
//! vocabulaire aan de buitenkant: dat zou hier een handgeschreven vertaling
//! vergen (welke veer bij `type: "spring"` hoort, een lastpositie in mm naar
//! een fractie van de staaflengte, A en I los van het profiel), en zo'n
//! vertaling is precies de tweede waarheid die dit ontwerp elimineert. Wie het
//! model uit een bestand haalt (`project_path`) merkt hier niets van; wie het
//! inline meestuurt, stuurt hetzelfde als wat hij zou opslaan.
//!
//! DE TOOLS BLIJVEN ALTIJD ZICHTBAAR
//! Ook zonder Node staan alle vijf in `tools/list`. Verbergen zou de storing
//! ondiagnosticeerbaar maken: de client meldt dan dat de functie niet bestaat,
//! terwijl de gebruiker weet dat hij hem geïnstalleerd heeft. In plaats daarvan
//! komt er een Nederlandse melding met foutcode en remedie, en blijft
//! `fem_solver_status` het eerste dat je vraagt bij een storing.

use openaec_mcp_server::sidecar::{self, SidecarFout, SidecarOpties};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::OnceLock;

use crate::RpcError;

/// De namen van de vijf tools. Eén lijst, gebruikt door `is_fem_tool`, de
/// schema's en de dispatch — zodat een tool niet in de lijst kan staan zonder
/// afhandeling, of andersom.
pub const FEM_TOOLS: [&str; 5] = [
    "fem_solver_status",
    "validate_fem_model",
    "load_fem_project",
    "solve_fem_model",
    "check_fem_model",
];

pub fn is_fem_tool(naam: &str) -> bool {
    FEM_TOOLS.contains(&naam)
}

// ── Foutcodes van deze laag ─────────────────────────────────────────────────
// De sidecar heeft zijn eigen codes (`protocol.ts`) en de sidecar-aansturing de
// hare (`sidecar.rs`). Dit zijn de twee die alleen hier kunnen ontstaan.

/// De tool-argumenten deugen niet (onbekend veld, verkeerd type, beide of geen
/// van `model`/`project_path`).
const ARGUMENT_ONGELDIG: &str = "ARGUMENT_ONGELDIG";
/// Het projectbestand kon niet van schijf worden gelezen.
const BESTAND_ONLEESBAAR: &str = "BESTAND_ONLEESBAAR";
/// De solve slaagde, maar de teruggekomen toetsingsinvoer was niet te lezen.
const TOETSING_ONMOGELIJK: &str = "TOETSING_ONMOGELIJK";

/// Bouwt een `RpcError` die de foutcode en de Nederlandse remedie MEEDRAAGT in
/// `data`.
///
/// Waarom `data` en niet alleen een tekst: zonder machineleesbare code leest
/// "Node ontbreekt" voor een client identiek aan "je raamwerk is een
/// mechanisme". Een ontbrekende runtime mag bij constructieve software nooit op
/// een rekenfout lijken.
fn fout(code: &str, melding: impl Into<String>, remedie: impl Into<String>) -> RpcError {
    let melding = melding.into();
    let remedie = remedie.into();
    RpcError {
        // Een argumentfout is een fout van de aanroeper; de rest is uitvoering.
        code: if code == ARGUMENT_ONGELDIG { -32602 } else { -32000 },
        message: format!("[{code}] {melding} — {remedie}"),
        data: Some(json!({
            "error_code": code,
            "melding": melding,
            "remedie": remedie,
        })),
    }
}

/// Fout uit de sidecar-aansturing → `RpcError`, met code, melding, remedie en
/// detail onaangetast. Er wordt hier niets samengevat: `detail` bevat het veld
/// dat de sidecar aanwees, en dat is bij een invoerfout het enige bruikbare.
fn van_sidecar(f: SidecarFout) -> RpcError {
    let remedie = f.remedie.clone().unwrap_or_default();
    RpcError {
        code: if f.code == "INVOER_ONGELDIG" { -32602 } else { -32000 },
        message: if remedie.is_empty() {
            format!("[{}] {}", f.code, f.melding)
        } else {
            format!("[{}] {} — {remedie}", f.code, f.melding)
        },
        data: Some(json!({
            "error_code": f.code,
            "melding": f.melding,
            "remedie": f.remedie,
            "detail": f.detail,
        })),
    }
}

// ── Argumenten ──────────────────────────────────────────────────────────────
// `deny_unknown_fields` op alle vier de typen, spiegelbeeld van
// `additionalProperties: false` in de schema's. Een tikfout in een argumentnaam
// is daarmee een fout en geen stille terugval op de standaardwaarde — precies
// de reden dat `check_steel_beam` in T12 dezelfde behandeling kreeg.

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusArgumenten {}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ValidateArgumenten {
    #[serde(default)]
    model: Option<Value>,
    #[serde(default)]
    project_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LoadProjectArgumenten {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SolveArgumenten {
    #[serde(default)]
    model: Option<Value>,
    #[serde(default)]
    project_path: Option<String>,
    #[serde(default)]
    combinations: Option<Value>,
    #[serde(default)]
    nonlinear: Option<bool>,
    #[serde(default)]
    detail: Option<String>,
    #[serde(default)]
    timeout_s: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CheckArgumenten {
    #[serde(default)]
    model: Option<Value>,
    #[serde(default)]
    project_path: Option<String>,
    #[serde(default)]
    combinations: Option<Value>,
    #[serde(default)]
    nonlinear: Option<bool>,
    #[serde(default)]
    timeout_s: Option<u64>,
    #[serde(default)]
    check_config: Option<Value>,
    #[serde(default)]
    beam_ids: Option<Vec<i64>>,
}

fn lees_argumenten<T: for<'de> Deserialize<'de>>(
    tool: &str,
    args: Value,
) -> Result<T, RpcError> {
    serde_json::from_value(args).map_err(|e| {
        fout(
            ARGUMENT_ONGELDIG,
            format!("De argumenten van `{tool}` deugen niet: {e}."),
            "Vergelijk de aanroep met het inputSchema uit `tools/list`. Onbekende \
             velden worden geweigerd en niet genegeerd: een genegeerd veld levert \
             een geslaagde berekening op die bij een ander model hoort.",
        )
    })
}

// ── Model uit argumenten ────────────────────────────────────────────────────

/// Zet `model` of `project_path` om in het payload-deel dat de sidecar leest.
///
/// De sidecar raakt de schijf NOOIT aan: alle bestandstoegang zit hier, zodat
/// aantoonbaar is dat de FEM-tools alleen-lezen zijn en de solverbundel geen
/// `node:fs` nodig heeft (die mag hij ook niet hebben — de bundel moet nul
/// externe imports bevatten).
fn model_payload(
    tool: &str,
    model: Option<Value>,
    project_path: Option<String>,
) -> Result<serde_json::Map<String, Value>, RpcError> {
    let mut payload = serde_json::Map::new();
    match (model, project_path) {
        (Some(m), None) => {
            payload.insert("model".to_owned(), m);
        }
        (None, Some(pad)) => {
            payload.insert(
                "project".to_owned(),
                json!({ "inhoud": lees_projectbestand(&pad)? }),
            );
        }
        (Some(_), Some(_)) => {
            return Err(fout(
                ARGUMENT_ONGELDIG,
                format!(
                    "`{tool}` kreeg zowel `model` als `project_path`. Welke van de twee \
                     doorgerekend zou worden is dan niet af te lezen aan de aanroep."
                ),
                "Geef precies één van beide: `model` voor een model in het verzoek, \
                 `project_path` voor een opgeslagen .ifcfem2d-bestand.",
            ));
        }
        (None, None) => {
            return Err(fout(
                ARGUMENT_ONGELDIG,
                format!("`{tool}` kreeg geen model: `model` en `project_path` ontbreken beide."),
                "Geef `model` (het model zelf) of `project_path` (een absoluut pad naar \
                 een .ifcfem2d-bestand).",
            ));
        }
    }
    Ok(payload)
}

/// Eén projectbestand van schijf.
///
/// Blokkerende bestandstoegang, met opzet en om dezelfde reden als in
/// `sidecar.rs`: het gaat om één leesactie van hooguit enkele honderden kB, en
/// die valt weg tegen het opstarten van het Node-proces daarna (~80–110 ms).
/// Een asynchrone lezer erbij halen zou meer machinerie zijn dan het probleem
/// groot is.
fn lees_projectbestand(pad: &str) -> Result<String, RpcError> {
    std::fs::read_to_string(pad).map_err(|e| {
        fout(
            BESTAND_ONLEESBAAR,
            format!("Het projectbestand `{pad}` kon niet worden gelezen ({e})."),
            "Geef een absoluut pad naar een .ifcfem2d-bestand dat met deze versie is \
             opgeslagen, en controleer de leesrechten.",
        )
    })
}

/// De staalprofielencatalogus als JSON, één keer geserialiseerd.
///
/// Deze lijst gaat mee naar de sidecar omdat `buildSteelCheckInputs` hem nodig
/// heeft om `steel_check_inputs` te vullen. De bron is en blijft de Rust-crate
/// `steel-profiles`: de bundel draagt bewust geen eigen kopie van de catalogus,
/// zodat er één profielwaarheid is. Ontbreekt de lijst, dan blijft
/// `steel_check_inputs` leeg — met waarschuwing, nooit stil.
fn profielen() -> &'static Value {
    static PROFIELEN: OnceLock<Value> = OnceLock::new();
    PROFIELEN.get_or_init(|| {
        serde_json::to_value(steel_profiles::db().all()).unwrap_or(Value::Null)
    })
}

// ── De vijf tools ───────────────────────────────────────────────────────────

pub async fn dispatch(naam: &str, args: Value) -> Result<Value, RpcError> {
    match naam {
        "fem_solver_status" => {
            let _: StatusArgumenten = lees_argumenten(naam, args)?;
            // Faalt nooit: een storing IS het antwoord. Daarom geen `?`.
            let status = sidecar::status(&SidecarOpties::uit_omgeving()).await;
            serde_json::to_value(status).map_err(|e| {
                fout(
                    "INTERN",
                    format!("De statusuitvoer kon niet worden geserialiseerd ({e})."),
                    "Meld deze fout; er is geen berekening bij betrokken.",
                )
            })
        }
        "validate_fem_model" => {
            let a: ValidateArgumenten = lees_argumenten(naam, args)?;
            let payload = model_payload(naam, a.model, a.project_path)?;
            roep("validate", Value::Object(payload), None).await
        }
        "load_fem_project" => {
            let a: LoadProjectArgumenten = lees_argumenten(naam, args)?;
            let inhoud = lees_projectbestand(&a.path)?;
            roep(
                "load_project",
                json!({ "path": a.path, "inhoud": inhoud }),
                None,
            )
            .await
        }
        "solve_fem_model" => {
            let a: SolveArgumenten = lees_argumenten(naam, args)?;
            let timeout_s = a.timeout_s;
            let mut payload = model_payload(naam, a.model, a.project_path)?;
            payload.insert("profiles".to_owned(), profielen().clone());
            if let Some(c) = a.combinations {
                payload.insert("combinations".to_owned(), c);
            }
            payload.insert("nonlinear".to_owned(), json!(a.nonlinear.unwrap_or(false)));
            payload.insert(
                "detail".to_owned(),
                json!(a.detail.unwrap_or_else(|| "samenvatting".to_owned())),
            );
            roep("solve", Value::Object(payload), timeout_s).await
        }
        "check_fem_model" => check_fem_model(naam, args).await,
        _ => Err(RpcError::method_not_found(naam)),
    }
}

/// Eén sidecar-aanroep; het `result` komt onveranderd terug.
async fn roep(op: &str, payload: Value, timeout_s: Option<u64>) -> Result<Value, RpcError> {
    let opties = SidecarOpties::uit_omgeving();
    sidecar::roep_aan(op, payload, &opties, timeout_s)
        .await
        .map(|uit| uit.result)
        .map_err(van_sidecar)
}

/// `check_fem_model` — doorrekenen én toetsen in één aanroep.
///
/// Dit is de tool die het grootste gat dicht: de keten solve → toetsing loopt
/// server-zijdig, zodat er geen veld tussenuit kan vallen. De vijf
/// `#[serde(default)]`-velden die een client anders zou weglaten
/// (`pre_camber_mm`, `deflection_permanent_mm`, `q_equiv_n_per_mm`, `z_a_mm`,
/// `custom_section`) worden door `buildSteelCheckInputs` gevuld — niet door de
/// client. Bij `q_equiv_n_per_mm` en `z_a_mm` scheelt dat een kiptoets die
/// anders GUNSTIGER uitvalt dan hij hoort te zijn.
///
/// `steel_check_inputs` gaat expres mee terug: de client ziet wát er getoetst
/// is en kan één invoer desgewenst opnieuw door `check_steel_beam` halen,
/// zonder ooit zelf een invoer te hoeven verzinnen.
async fn check_fem_model(naam: &str, args: Value) -> Result<Value, RpcError> {
    let a: CheckArgumenten = lees_argumenten(naam, args)?;
    let timeout_s = a.timeout_s;
    let mut payload = model_payload(naam, a.model, a.project_path)?;
    payload.insert("profiles".to_owned(), profielen().clone());
    if let Some(c) = a.combinations {
        payload.insert("combinations".to_owned(), c);
    }
    if let Some(c) = a.check_config {
        payload.insert("check_config".to_owned(), c);
    }
    if let Some(ids) = a.beam_ids {
        payload.insert("beam_ids".to_owned(), json!(ids));
    }
    payload.insert("nonlinear".to_owned(), json!(a.nonlinear.unwrap_or(false)));

    let mut uit = roep("check", Value::Object(payload), timeout_s).await?;

    // De toetsing zelf: dezelfde functie die `src-tauri/src/lib.rs` voor de app
    // aanroept. Wordt de invoer hier niet geaccepteerd, dan is er iets uit
    // elkaar gelopen tussen `buildSteelCheckInputs` en `BeamCheckInput` — dat
    // is een fout, geen leeg resultaat: leeg zou als "niets te toetsen" lezen.
    let rauw = uit
        .get("steel_check_inputs")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let inputs: Vec<steel_check::BeamCheckInput> =
        serde_json::from_value(rauw).map_err(|e| {
            fout(
                TOETSING_ONMOGELIJK,
                format!(
                    "Het model is doorgerekend, maar de toetsingsinvoer uit de \
                     solverbundel past niet op `BeamCheckInput` ({e}). Er is niet \
                     getoetst."
                ),
                "Server en solverbundel zijn uit elkaar gelopen. Herbouw de MCP-server \
                 (`npm run build:sidecar` en daarna `cargo build`), of haal \
                 OPENAEC_FEM_KERNEL weg.",
            )
        })?;

    let results = tokio::task::spawn_blocking(move || steel_check::check_all_beams(inputs))
        .await
        .map_err(|e| {
            fout(
                "INTERN",
                format!("De toetsing kon niet worden uitgevoerd ({e})."),
                "Meld deze fout met het model; de solve zelf was geslaagd.",
            )
        })?;

    // Maatgevend: de hoogste unity check over alle getoetste staven. `null` als
    // er niets te toetsen viel — expres niet 0, want 0 leest als "ruim voldoende".
    let maatgevend = results
        .iter()
        .filter(|r| r.uc_max.is_finite())
        .max_by(|a, b| a.uc_max.total_cmp(&b.uc_max))
        .map(|r| {
            json!({
                "beam_id": r.beam_id,
                "uc_max": r.uc_max,
                "check": r.governing_check_id,
            })
        })
        .unwrap_or(Value::Null);

    let resultaten = serde_json::to_value(&results).map_err(|e| {
        fout(
            "INTERN",
            format!("Het toetsingsresultaat kon niet worden geserialiseerd ({e})."),
            "Meld deze fout met het model.",
        )
    })?;

    if let Some(map) = uit.as_object_mut() {
        map.insert("results".to_owned(), resultaten);
        map.insert("governing".to_owned(), maatgevend);
    }
    Ok(uit)
}

// ── Schema's ────────────────────────────────────────────────────────────────
//
// Tool- en veldnamen zijn ENGELS, gelijk aan de bestaande tools en aan
// `BeamCheckInput`; beschrijvingen zijn Nederlands. De modelvelden dragen de
// namen uit het projectbestand, inclusief de paar Nederlandse
// (`gegenereerd`, `gegenereerdDoor`): hernoemen zou een mappinglaag zijn die
// kan afwijken.
//
// `additionalProperties: false` staat overal. De sidecar weigert onbekende
// modelvelden hard (`controleerVelden`), dus het schema belooft hier niet
// strenger te zijn dan de server werkelijk is — het beschrijft precies wat er
// gebeurt.

fn schema_releases() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Scharnieren per staafeinde; `true` = vrijheidsgraad ontkoppeld. Ontbreekt het object, dan is de staaf aan beide einden star verbonden.",
        "properties": {
            "startTx": { "type": "boolean" }, "startTz": { "type": "boolean" },
            "startRy": { "type": "boolean" }, "endTx":   { "type": "boolean" },
            "endTz":   { "type": "boolean" }, "endRy":   { "type": "boolean" }
        }
    })
}

fn schema_checkconfig() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Toetsinstellingen van deze staaf. Elk ontbrekend veld krijgt de gedocumenteerde default van de app; de staalsoort komt NIET hier vandaan maar uit `material`.",
        "properties": {
            "bucklingLengthY_m": { "type": "number", "exclusiveMinimum": 0,
                "description": "Kniklengte om de sterke as in m; default = de systeemlengte." },
            "bucklingLengthZ_m": { "type": "number", "exclusiveMinimum": 0,
                "description": "Kniklengte om de zwakke as in m; default = de systeemlengte." },
            "lateralRestraints": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 },
                "description": "Kipsteunen BOVENFLENS als fractie 0..1 van de staaflengte." },
            "lateralRestraintsBottom": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 },
                "description": "Kipsteunen ONDERFLENS, zelfde conventie. Relevant waar het moment de onderflens op druk zet." },
            "deflectionClass": { "type": "string", "enum": ["floor", "roof", "cantilever", "custom"],
                "description": "Doorbuigingsklasse; default \"floor\"." },
            "deflectionLimitNumerator": { "type": "number", "exclusiveMinimum": 0,
                "description": "De n in de eis L/n; telt alleen bij klasse \"custom\"." },
            "preCamber_mm": { "type": "number",
                "description": "Zeeg in mm, zelfde tekenconventie als de zakking (negatief = omlaag)." },
            "serviceClass": { "type": "integer", "enum": [1, 2, 3],
                "description": "Klimaatklasse EN 1995 §2.3.1.3; alleen voor hout." },
            "loadDuration": { "type": "string",
                "enum": ["permanent", "long", "medium", "short", "instantaneous"],
                "description": "Belastingduurklasse EN 1995 §2.3.1.2; alleen voor hout." }
        }
    })
}

// Het modelschema staat opgesplitst in één functie per objectsoort. Dat is
// niet alleen leesbaarder: `json!` in één blok liep tegen de macro-recursielimiet
// aan, en die grens verhogen zou de compilatie van elke wijziging hier duurder
// maken zonder iets duidelijker te krijgen.

fn schema_nodes() -> Value {
    json!({
        "type": "array",
        "description": "Knopen. Elke staaf en oplegging verwijst naar een `id` hieruit.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "x", "z"],
            "properties": {
                "id": { "type": "integer" },
                "x": { "type": "number", "description": "mm." },
                "z": { "type": "number", "description": "mm, positief omhoog." }
            }
        }
    })
}

fn schema_beams() -> Value {
    json!({
        "type": "array",
        "description": "Staven. E, A en I volgen uit `material` en `profile` — ze kunnen NIET rechtstreeks worden opgegeven, zodat er één bron voor de doorsnede is.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "from", "to"],
            "properties": {
                "id":   { "type": "integer" },
                "from": { "type": "integer", "description": "Knoop-id van het staafbegin." },
                "to":   { "type": "integer", "description": "Knoop-id van het staafeinde." },
                "material": { "type": "string",
                    "description": "Staalsoort (S235, S275, S355, S420, S460) of houtsterkteklasse (C14..C35, GL24h..GL36h). Default \"S235\"." },
                "profile": { "type": "string",
                    "description": "Profielnaam uit de catalogus ('HEA160', 'IPE300') of een houtrechthoek ('96x450'). Default \"HEA160\"." },
                "releases": schema_releases(),
                "checkConfig": schema_checkconfig(),
                "loadRole": { "type": "string",
                    "enum": ["gevelLinks", "gevelRechts", "dakPlat", "dakHellend", "overstek", "vloer", "binnen"],
                    "description": "Constructieve rol, alleen gebruikt door de belastinggeneratoren." }
            }
        }
    })
}

fn schema_supports() -> Value {
    json!({
        "type": "array",
        "description": "Opleggingen. Zonder opleggingen is het model een mechanisme en weigert de solver.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["nodeId", "type"],
            "properties": {
                "nodeId": { "type": "integer" },
                "type": { "type": "string",
                    "enum": ["pinned", "fixed", "xRoller", "zRoller", "zSpring", "xSpring", "rotSpring"],
                    "description": "fixed = inklemming; pinned = scharnier; xRoller/zRoller = rol die alleen die richting vasthoudt; de drie veertypen vragen `k`." },
                "k": { "type": "number",
                    "description": "Veerstijfheid: kN/mm bij xSpring/zSpring, kNm/rad bij rotSpring. Wordt genegeerd bij een starre oplegging." }
            }
        }
    })
}

fn schema_meshcache() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Voorgebouwd CDT-mesh van een polygoonplaat, zoals het projectbestand hem bewaart. Klopt de `signature` niet met de geometrie, dan weigert de engine met een Nederlandse melding in plaats van te benaderen.",
        "required": ["signature", "points", "triangles"],
        "properties": {
            "signature": { "type": "string" },
            "points": { "type": "array", "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["x", "z"],
                "properties": { "x": { "type": "number" }, "z": { "type": "number" } } } },
            "triangles": { "type": "array", "items": {
                "type": "array", "minItems": 3, "maxItems": 3,
                "items": { "type": "integer", "minimum": 0 } } },
            "edgeNodeIndices": { "type": "array", "items": {
                "type": "array", "items": { "type": "integer", "minimum": 0 } } }
        }
    })
}

fn schema_plates() -> Value {
    json!({
        "type": "array",
        "description": "Platen (schijven). Een asgelijnde rechthoek rekent zonder meer; een polygoon vereist een geldige `meshCache` uit een projectbestand — zonder cache volgt een expliciete weigering en geen benadering.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "nodeIds"],
            "properties": {
                "id": { "type": "integer" },
                "nodeIds": { "type": "array", "minItems": 3, "items": { "type": "integer" },
                    "description": "Hoekknopen in klikvolgorde." },
                "thickness": { "type": "number", "exclusiveMinimum": 0, "description": "mm, default 20." },
                "E":  { "type": "number", "exclusiveMinimum": 0, "description": "N/mm2, default 210000." },
                "nu": { "type": "number", "description": "Dwarscontractie, default 0,3." },
                "rho": { "type": "number", "exclusiveMinimum": 0, "description": "kg/m3, default 7850." },
                "meshSize": { "type": "number", "exclusiveMinimum": 0, "description": "mm, default 500." },
                "meshCache": schema_meshcache()
            }
        }
    })
}

fn schema_loadcases() -> Value {
    json!({
        "type": "array",
        "description": "Belastinggevallen. Een geval zonder werkzame last wordt overgeslagen en staat dan in `cases_skipped_empty`.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "name"],
            "properties": {
                "id": { "type": "integer" },
                "name": { "type": "string" },
                "type": { "type": "string", "enum": ["dead", "live", "snow", "wind", "other"],
                    "description": "Aard van het geval. Het eigen gewicht komt in het eerste \"dead\"-geval terecht." },
                "gegenereerd": {
                    "type": "object",
                    "additionalProperties": false,
                    "description": "Herkomst bij een automatisch gegenereerd geval.",
                    "required": ["bron", "sleutel"],
                    "properties": {
                        "bron": { "type": "string", "enum": ["wind"] },
                        "sleutel": { "type": "string" }
                    }
                }
            }
        }
    })
}

fn schema_loads() -> Value {
    json!({
        "type": "array",
        "description": "Lasten. `type` bepaalt welke velden meetellen: pointForce (fx/fz op nodeId, of op beamId met posFrac), pointMoment (my), lineLoad (q of qStart/qEnd op beamId), thermal (deltaT op beamId), edgeLoad (q op een plaatrand).",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "type", "caseId"],
            "properties": {
                "id": { "type": "integer" },
                "type": { "type": "string",
                    "enum": ["pointForce", "pointMoment", "lineLoad", "thermal", "edgeLoad"] },
                "caseId": { "type": "integer", "description": "Id van het belastinggeval." },
                "nodeId": { "type": "integer", "description": "Doelknoop bij pointForce/pointMoment." },
                "beamId": { "type": "integer", "description": "Doelstaaf bij lineLoad, thermal en een staafgebonden puntlast." },
                "plateId": { "type": "integer", "description": "Doelplaat bij edgeLoad." },
                "fx": { "type": "number", "description": "Puntlast in kN, globale x." },
                "fz": { "type": "number", "description": "Puntlast in kN, globale z (negatief = omlaag)." },
                "my": { "type": "number", "description": "Koppel in kNm." },
                "posFrac": { "type": "number", "minimum": 0, "maximum": 1,
                    "description": "Positie van een staafgebonden puntlast als fractie van de staaflengte vanaf `from`." },
                "q": { "type": "number", "description": "Gelijkmatige lijnlast in kN/m staaflengte (negatief = omlaag bij qDir \"z\")." },
                "qStart": { "type": "number", "description": "Trapeziumlast: waarde aan het begin van het belaste deel." },
                "qEnd":   { "type": "number", "description": "Trapeziumlast: waarde aan het einde van het belaste deel." },
                "qDir": { "type": "string", "enum": ["x", "z"], "description": "Richting van de lijnlast; default \"z\"." },
                "qCoord": { "type": "string", "enum": ["global", "local"],
                    "description": "Assenstelsel van de lijnlast; default \"global\". \"local\" + \"z\" = loodrecht op de staafas, \"local\" + \"x\" = axiaal." },
                "startFrac": { "type": "number", "minimum": 0, "maximum": 1,
                    "description": "Deellast: begin van het belaste deel als fractie; default 0." },
                "endFrac": { "type": "number", "minimum": 0, "maximum": 1,
                    "description": "Deellast: einde van het belaste deel als fractie; default 1." },
                "deltaT": { "type": "number", "description": "Temperatuurverschil in K bij type \"thermal\"." },
                "edge": { "type": "string", "enum": ["bottom", "top", "left", "right"],
                    "description": "Belaste rand van een asgelijnde plaat." },
                "edgeIndex": { "type": "integer", "minimum": 0,
                    "description": "Belaste rand van een polygoonplaat: rand i loopt van hoek i naar hoek i+1." },
                "gegenereerdDoor": { "type": "string", "enum": ["wind"],
                    "description": "Herkomst; ontbreekt = handmatig ingevoerd." }
            }
        }
    })
}

/// Het model, in exact de vorm van een `.ifcfem2d`-projectbestand.
fn schema_fem_model() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Het rekenmodel in de vorm van een .ifcfem2d-projectbestand. Geometrie in mm met z positief omhoog; krachten in kN, koppels in kNm, lijnlasten in kN/m staaflengte. Onbekende velden worden GEWEIGERD, niet genegeerd.",
        "required": ["nodes", "beams", "supports", "loadCases"],
        "properties": {
            "nodes": schema_nodes(),
            "beams": schema_beams(),
            "supports": schema_supports(),
            "plates": schema_plates(),
            "loadCases": schema_loadcases(),
            "loads": schema_loads(),
            "selfWeightEnabled": { "type": "boolean", "default": false,
                "description": "Eigen gewicht van staven en platen meerekenen in het eerste \"dead\"-geval." },
            "scheefstandEnabled": { "type": "boolean", "default": false,
                "description": "Initiële scheefstand (imperfectie) als equivalente horizontale krachten meerekenen." },
            "scheefstandNoemer": { "type": "number", "exclusiveMinimum": 0, "default": 200,
                "description": "Noemer van de scheefstand: phi = 1/noemer." },
            "scheefstandRichting": { "type": "integer", "enum": [-1, 1], "default": 1,
                "description": "Richting van de equivalente horizontale krachten: 1 = +x, -1 = -x." }
        }
    })
}


fn schema_combinations() -> Value {
    json!({
        "type": "array",
        "description": "Belastingcombinaties. Ontbreekt dit veld, dan gelden de combinaties uit het projectbestand, en anders de EN 1990-standaardset van de app.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "name", "type", "factors"],
            "properties": {
                "id": { "type": "integer" },
                "name": { "type": "string" },
                "type": { "type": "string", "enum": ["uls", "sls"],
                    "description": "uls = uiterste grenstoestand (sterkte), sls = bruikbaarheidsgrenstoestand (doorbuiging)." },
                "formula": { "type": "string", "description": "Leesbare formule voor het rapport." },
                "factors": { "type": "object", "additionalProperties": { "type": "number" },
                    "description": "Sleutel = belastinggeval-id als tekst, waarde = factor." }
            }
        }
    })
}

fn schema_project_path() -> Value {
    json!({
        "type": "string",
        "description": "Absoluut pad naar een .ifcfem2d-bestand. Alleen-lezen; de server schrijft nooit naar de schijf."
    })
}

/// De vijf tooldefinities voor `tools/list`.
pub fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "fem_solver_status",
            "description": "Diagnose van de FEM-rekenketen zonder rekenpoging: is er een Node-runtime (>= 20), welke solverbundel zit in deze binary, en spreken server en bundel dezelfde protocolversie. DIT IS DE EERSTE STAP BIJ EEN STORING. Bij available:false staan `reason` en `remedie` in het Nederlands; de vijf staaltools werken dan gewoon door.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        }),
        json!({
            "name": "validate_fem_model",
            "description": "Droogloop zonder rekenen: controleert het model op losse knopen, mechanismen, staven met lengte nul, dubbele knopen, onbekende profiel/materiaal-combinaties, belastinggevallen zonder werkzame last, polygoonplaten zonder geldige meshcache, en ONBEKENDE VELDEN. Bestaat omdat een tikfout in een lastveld anders een geslaagde berekening oplevert waarin die last ontbreekt — een uitkomst die als 'nul' leest.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "description": "Geef precies één van `model` of `project_path`.",
                "properties": {
                    "model": schema_fem_model(),
                    "project_path": schema_project_path()
                },
                "oneOf": [ { "required": ["model"] }, { "required": ["project_path"] } ]
            }
        }),
        json!({
            "name": "load_fem_project",
            "description": "Leest een opgeslagen .ifcfem2d-projectbestand en geeft het model, de combinaties en tellingen terug — zodat een constructeur op zijn eigen model kan laten rekenen in plaats van het over te typen. Alleen-lezen: er is geen tool die naar de schijf schrijft.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["path"],
                "properties": { "path": schema_project_path() }
            }
        }),
        json!({
            "name": "solve_fem_model",
            "description": "Rekent het model door met dezelfde solver die de app gebruikt en levert reacties, verplaatsingen en staafkrachten per belastinggeval, per combinatie en als omhullende. Eenheden kN, kNm, mm en rad; N positief = trek, z positief omhoog. Sluitstuk is `steel_check_inputs`: een lijst die ongewijzigd aan `check_steel_beam` kan worden gevoerd. Let op `cases_skipped_empty` — een belastinggeval zonder werkzame last wordt overgeslagen en zou anders als 'nul' lezen.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "description": "Geef precies één van `model` of `project_path`.",
                "properties": {
                    "model": schema_fem_model(),
                    "project_path": schema_project_path(),
                    "combinations": schema_combinations(),
                    "nonlinear": { "type": "boolean", "default": false,
                        "description": "Tweede orde (P-Delta). Komt het model uit een projectbestand, dan telt de keuze uit dat bestand en overschrijft deze vlag hem NIET." },
                    "detail": { "type": "string", "enum": ["samenvatting", "stations"], "default": "samenvatting",
                        "description": "\"stations\" geeft alle 21 stations per staaf terug (N, V, M, zakking) en is fors groter." },
                    "timeout_s": { "type": "integer", "minimum": 1, "maximum": 600, "default": 60,
                        "description": "Klok voor deze aanroep. Bij overschrijding wordt het rekenproces gedood; er komt GEEN gedeeltelijk resultaat terug." }
                },
                "oneOf": [ { "required": ["model"] }, { "required": ["project_path"] } ]
            }
        }),
        json!({
            "name": "check_fem_model",
            "description": "Doorrekenen EN toetsen in één aanroep: de solve loopt in dezelfde solver als de app, de EN 1993-toetsing in dezelfde Rust-kern als de app. Gebruik deze tool in plaats van solve_fem_model gevolgd door check_steel_beam — zo kan er geen veld tussenuit vallen dat de kiptoets gunstiger maakt dan hij is. `steel_check_inputs` komt zichtbaar mee terug. Houten staven worden gemeld in `skipped_beams`; houttoetsing loopt nog niet via deze server.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "description": "Geef precies één van `model` of `project_path`.",
                "properties": {
                    "model": schema_fem_model(),
                    "project_path": schema_project_path(),
                    "combinations": schema_combinations(),
                    "nonlinear": { "type": "boolean", "default": false,
                        "description": "Tweede orde (P-Delta). Uit een projectbestand telt de keuze uit dat bestand." },
                    "timeout_s": { "type": "integer", "minimum": 1, "maximum": 600, "default": 60,
                        "description": "Klok voor deze aanroep; bij overschrijding komt er geen gedeeltelijk resultaat terug." },
                    "check_config": {
                        "type": "object",
                        "additionalProperties": false,
                        "description": "Toetsinstellingen per staaf-id (sleutel = het id als tekst). Ontbreekt een staaf, dan gelden de defaults van de app. De staalsoort staat NIET hier maar in `material` van de staaf.",
                        "patternProperties": { "^[0-9]+$": schema_checkconfig() }
                    },
                    "beam_ids": { "type": "array", "items": { "type": "integer" },
                        "description": "Beperk de toetsing tot deze staven. Leeg of afwezig = alle staalstaven." }
                },
                "oneOf": [ { "required": ["model"] }, { "required": ["project_path"] } ]
            }
        }),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Elke gedefinieerde tool moet ook afgehandeld worden, en andersom. Een
    /// tool die in `tools/list` staat maar in de dispatch ontbreekt, meldt bij
    /// de client "onbekende methode" — precies de ondiagnosticeerbare storing
    /// die dit ontwerp wil vermijden.
    #[test]
    fn elke_gedefinieerde_tool_staat_in_de_namenlijst() {
        let definities = tool_definitions();
        assert_eq!(definities.len(), FEM_TOOLS.len());
        for def in &definities {
            let naam = def["name"].as_str().expect("naam");
            assert!(is_fem_tool(naam), "{naam} ontbreekt in FEM_TOOLS");
        }
    }

    /// De schema's beloven strengheid die de server ook waarmaakt: elk
    /// invoerschema weigert onbekende velden, gelijk aan
    /// `#[serde(deny_unknown_fields)]` op de argumenttypen hierboven.
    #[test]
    fn elk_invoerschema_weigert_onbekende_velden() {
        for def in tool_definitions() {
            let naam = def["name"].as_str().unwrap().to_owned();
            assert_eq!(
                def["inputSchema"]["additionalProperties"],
                json!(false),
                "{naam} laat onbekende argumenten toe"
            );
        }
    }

    /// Het modelschema is de spiegel van `controleerVelden` in de sidecar.
    /// Loopt dat uit elkaar, dan belooft het schema iets anders dan de server
    /// aanvaardt en krijgt de client een fout op een veld dat het schema wél
    /// toestond.
    #[test]
    fn modelschema_kent_de_velden_van_het_projectbestand() {
        let model = schema_fem_model();
        let velden = model["properties"].as_object().expect("properties");
        for veld in [
            "nodes", "beams", "supports", "plates", "loadCases", "loads",
            "selfWeightEnabled", "scheefstandEnabled", "scheefstandNoemer",
            "scheefstandRichting",
        ] {
            assert!(velden.contains_key(veld), "modelschema mist `{veld}`");
        }
        assert_eq!(velden.len(), 10, "modelschema kent een veld dat de sidecar weigert");
        assert_eq!(model["additionalProperties"], json!(false));
    }

    /// E, A en I mogen niet los op een staaf: de doorsnede volgt uit
    /// (materiaal, profiel), zodat er één bron voor A en I is. De sidecar
    /// weigert ze hard; het schema mag ze dus ook niet aanbieden.
    #[test]
    fn staafschema_biedt_geen_losse_doorsnedegrootheden() {
        let beam = &schema_fem_model()["properties"]["beams"]["items"];
        let velden = beam["properties"].as_object().expect("properties");
        for verboden in ["E", "A", "I"] {
            assert!(
                !velden.contains_key(verboden),
                "`{verboden}` hoort niet los op een staaf te kunnen"
            );
        }
    }

    /// De profielcatalogus komt uit de Rust-crate en gaat als lijst mee naar de
    /// sidecar; zonder die lijst blijft `steel_check_inputs` leeg.
    #[test]
    fn profielenlijst_is_een_gevulde_array() {
        let lijst = profielen().as_array().expect("profielen moeten een array zijn");
        assert!(!lijst.is_empty());
        assert!(lijst[0]["name"].is_string());
    }
}
