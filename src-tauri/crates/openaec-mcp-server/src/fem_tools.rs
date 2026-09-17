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
//! `steel_check::check_all_beams`, `timber_check::check_all_timber_beams` en
//! `timber_check::clt::check_all_clt_beams` — letterlijk dezelfde functies die
//! de app via `src-tauri/src/lib.rs` aanroept. De solve en de invoerbouw
//! blijven in Node (dezelfde bouwers als de app), de toetsing blijft in Rust, en
//! niets wordt op twee plaatsen uitgerekend.
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
        // Een fout in wat de aanroeper aanleverde — de payload zelf of een staaf
        // waarvan de doorsnede niet te bepalen is — is -32602; de rest is
        // uitvoering.
        code: if matches!(f.code.as_str(), "INVOER_ONGELDIG" | "DOORSNEDE_ONBEKEND") {
            -32602
        } else {
            -32000
        },
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
    gevolgklasse: Option<String>,
    #[serde(default)]
    nonlinear: Option<bool>,
    #[serde(default)]
    detail: Option<String>,
    #[serde(default)]
    timeout_s: Option<u64>,
}

/// Het schema van `bijlage` bij `check_fem_model`: dezelfde enum als elke
/// toetstool, met de uitleg over de voorrang boven het projectbestand.
fn schema_bijlage_verzoek() -> Value {
    let mut s = crate::schema_bijlage();
    s["description"] = json!(
        "Nationale bijlage waarmee getoetst wordt; zij bepaalt de partiële factoren en psi-waarden van de standaardcombinaties en de nationaal bepaalde parameters van elke toets. HEEFT VOORRANG boven de bijlage in de projectgegevens van `project_path`. Alleen de bijlagen in deze lijst hebben rekenwaarden; een andere waarde wordt GEWEIGERD met reden, er wordt nooit stil op een andere bijlage teruggevallen. Weglaten = de bijlage uit het projectbestand, anders de enige gevulde bijlage."
    );
    s
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
    gevolgklasse: Option<String>,
    #[serde(default)]
    nonlinear: Option<bool>,
    #[serde(default)]
    timeout_s: Option<u64>,
    #[serde(default)]
    check_config: Option<Value>,
    #[serde(default)]
    beam_ids: Option<Vec<i64>>,
    /// De nationale bijlage waarmee getoetst wordt (normnaad, issue #17).
    /// Heeft VOORRANG boven `projectInfo.uitgangspunten.nationaleBijlage` in
    /// het projectbestand: wie hem uitdrukkelijk meegeeft, bedoelt deze. Een
    /// bijlage die deze uitgave niet kent, wordt al bij het lezen van de
    /// argumenten GEWEIGERD met dezelfde reden als in elke andere toetsinvoer
    /// — het type is `NationaleBijlage`, niet een vrije tekst.
    #[serde(default)]
    bijlage: Option<nationale_bijlage::NationaleBijlage>,
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
            if let Some(g) = a.gevolgklasse {
                payload.insert("gevolgklasse".to_owned(), json!(g));
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
///
/// STAAL, HOUT EN KRUISLAAGHOUT. Sinds september 2026 toetst deze tool ook hout:
/// de bundel bouwt `timber_check_inputs` en `clt_check_inputs` met dezelfde
/// `buildTimberCheckInputs`/`buildCltCheckInputs` als de app — inclusief de
/// belastingduur PER UGT-combinatie (EN 1995-1-1 3.1.3(2)) — en hier gaan ze
/// door dezelfde kernfuncties als in de app. Daarvóór verwees een houten staaf
/// alleen naar `check_timber_beams`, en moest een aanroeper zelf omhullende en
/// zakkingen samenstellen en k_mod omzeilen.
///
/// De resultaten staan onder APARTE sleutels (`results` staal,
/// `timber_results`, `clt_results`), zodat een bestaande client die `results`
/// als staalresultaat leest niet breekt. `governing` gaat over alle materialen
/// en noemt het materiaal.
///
/// Wat niet getoetst is, hoort zichtbaar te zijn: beton, vrij materiaal, of een
/// staaf die niet herkend is, komt met reden in `skipped_beams` via
/// [`meld_niet_getoetste_staven`].
async fn check_fem_model(naam: &str, args: Value) -> Result<Value, RpcError> {
    let a: CheckArgumenten = lees_argumenten(naam, args)?;
    let timeout_s = a.timeout_s;
    let beam_ids_filter = a.beam_ids.clone();
    let mut payload = model_payload(naam, a.model, a.project_path)?;
    // Het model blijft hier bewaard: na de solve wordt eruit afgelezen welke
    // staven niet getoetst zijn, zodat die niet stil wegvallen. Zie
    // `meld_niet_getoetste_staven`.
    let model_voor_beton = model_uit_payload(&payload);
    payload.insert("profiles".to_owned(), profielen().clone());
    // De houtsterkteklassen komen uit de kern zelf, net als de profielen: de
    // bundel draagt alleen een statische terugval, en een tweede lijst kan uit
    // de pas lopen.
    payload.insert(
        "timber_grades".to_owned(),
        json!(nen_en_1995_1_1::strength_class_names()),
    );
    if let Some(c) = a.combinations {
        payload.insert("combinations".to_owned(), c);
    }
    if let Some(g) = a.gevolgklasse {
        payload.insert("gevolgklasse".to_owned(), json!(g));
    }
    if let Some(c) = a.check_config {
        payload.insert("check_config".to_owned(), c);
    }
    if let Some(ids) = a.beam_ids {
        payload.insert("beam_ids".to_owned(), json!(ids));
    }
    // De bijlage uit het verzoek gaat naar de bundel, die haar vóór die uit het
    // projectbestand laat gaan — voor de standaardcombinaties (γ en ψ) én voor
    // elke toetsinvoer die hij bouwt.
    if let Some(b) = a.bijlage {
        payload.insert("bijlage".to_owned(), json!(b.code()));
    }
    payload.insert("nonlinear".to_owned(), json!(a.nonlinear.unwrap_or(false)));

    let mut uit = roep("check", Value::Object(payload), timeout_s).await?;

    // De toetsing zelf: dezelfde functies die `src-tauri/src/lib.rs` voor de app
    // aanroept. Wordt een invoer hier niet geaccepteerd, dan zijn bundel en
    // server uit elkaar gelopen — dat is een fout, geen leeg resultaat: leeg zou
    // als "niets te toetsen" lezen.
    let staal: Vec<steel_check::BeamCheckInput> =
        lees_toetsinvoer(&uit, "steel_check_inputs", "BeamCheckInput")?.unwrap_or_default();
    // `None` = de bundel kent de sleutel niet: een bundel van vóór hout in
    // `check_fem_model`. Dat is iets anders dan een lege lijst — dan is hout
    // hier NIET getoetst, en dat zegt `meld_niet_getoetste_staven` per staaf in
    // plaats van "nul houtstaven" te laten lezen.
    let hout: Option<Vec<timber_check::TimberBeamCheckInput>> =
        lees_toetsinvoer(&uit, "timber_check_inputs", "TimberBeamCheckInput")?;
    let clt: Option<Vec<timber_check::clt::CltBeamCheckInput>> =
        lees_toetsinvoer(&uit, "clt_check_inputs", "CltBeamCheckInput")?;
    let hout_ondersteund = hout.is_some() && clt.is_some();
    // Platen (wandschijven): `None` = een bundel van vóór de plaattoets. Dan is
    // er geen plaat getoetst, en `meld_niet_getoetste_platen` zegt dat per plaat.
    let platen: Option<Vec<plaat_check::PlateCheckInput>> =
        lees_toetsinvoer(&uit, "plate_check_inputs", "PlateCheckInput")?;
    let platen_ondersteund = platen.is_some();

    let (staal_res, hout_res, clt_res, plaat_res) = tokio::task::spawn_blocking(move || {
        (
            steel_check::check_all_beams(staal),
            timber_check::check_all_timber_beams(hout.unwrap_or_default()),
            timber_check::clt::check_all_clt_beams(clt.unwrap_or_default()),
            plaat_check::check_all_plates(platen.unwrap_or_default()),
        )
    })
    .await
    .map_err(|e| {
        fout(
            "INTERN",
            format!("De toetsing kon niet worden uitgevoerd ({e})."),
            "Meld deze fout met het model; de solve zelf was geslaagd.",
        )
    })?;

    // Maatgevend: de hoogste unity check over ALLE getoetste staven, met het
    // materiaal erbij. `null` als er niets te toetsen viel — expres niet 0, want
    // 0 leest als "ruim voldoende".
    let maatgevend = staal_res
        .iter()
        .map(|r| ("staal", r.beam_id, r.uc_max, r.governing_check_id.as_str()))
        .chain(hout_res.iter().map(|r| ("hout", r.beam_id, r.uc_max, r.governing_check_id.as_str())))
        .chain(clt_res.iter().map(|r| ("kruislaaghout", r.beam_id, r.uc_max, r.governing_check_id.as_str())))
        .filter(|(_, _, uc, _)| uc.is_finite())
        .max_by(|a, b| a.2.total_cmp(&b.2))
        .map(|(materiaal, beam_id, uc_max, check)| {
            json!({
                "beam_id": beam_id,
                "uc_max": uc_max,
                "check": check,
                "material": materiaal,
            })
        })
        .unwrap_or(Value::Null);

    let serialiseer = |v: serde_json::Result<Value>| {
        v.map_err(|e| {
            fout(
                "INTERN",
                format!("Het toetsingsresultaat kon niet worden geserialiseerd ({e})."),
                "Meld deze fout met het model.",
            )
        })
    };
    let resultaten = serialiseer(serde_json::to_value(&staal_res))?;
    let hout_resultaten = serialiseer(serde_json::to_value(&hout_res))?;
    let clt_resultaten = serialiseer(serde_json::to_value(&clt_res))?;
    // Maatgevende plaat: apart van `governing`, dat over staven gaat en een
    // `beam_id` draagt. Een geweigerde plaat telt niet mee — haar UC 0 is geen
    // oordeel. `null` als er geen plaat getoetst is.
    let maatgevende_plaat = plaat_res
        .iter()
        .filter(|r| r.geweigerd.is_none() && r.uc_max.is_finite())
        .max_by(|a, b| a.uc_max.total_cmp(&b.uc_max))
        .map(|r| {
            json!({
                "plate_id": r.plate_id,
                "uc_max": r.uc_max,
                "check": r.governing_check_id,
                "element_id": r.governing_element_id,
                "combination_id": r.governing_combination_id,
                "material": r.materiaal,
                "status": r.status,
            })
        })
        .unwrap_or(Value::Null);
    let plaat_resultaten = serialiseer(serde_json::to_value(&plaat_res))?;

    if let Some(map) = uit.as_object_mut() {
        map.insert("results".to_owned(), resultaten);
        map.insert("timber_results".to_owned(), hout_resultaten);
        map.insert("clt_results".to_owned(), clt_resultaten);
        map.insert("governing".to_owned(), maatgevend);
        map.insert("plate_results".to_owned(), plaat_resultaten);
        map.insert("governing_plate".to_owned(), maatgevende_plaat);
    }
    meld_niet_getoetste_staven(
        &mut uit,
        model_voor_beton.as_ref(),
        beam_ids_filter.as_deref(),
        hout_ondersteund,
    );
    meld_niet_getoetste_platen(&mut uit, model_voor_beton.as_ref(), platen_ondersteund);
    Ok(uit)
}

/// Zorgt dat ELKE plaat van het model in het antwoord verantwoord is: in
/// `plate_check_inputs` (en dus `plate_results`) of in `skipped_plates` met een
/// reden. Hetzelfde vangnet als [`meld_niet_getoetste_staven`], om dezelfde
/// reden: een plaat die nergens in het antwoord staat, leest als een plaat die
/// in orde is.
///
/// `platen_ondersteund` = de bundel leverde `plate_check_inputs`. Zonder die
/// sleutel is de bundel ouder dan deze server en is geen enkele plaat getoetst.
fn meld_niet_getoetste_platen(uit: &mut Value, model: Option<&Value>, platen_ondersteund: bool) {
    let Some(model) = model else { return };
    let Some(platen) = model.get("plates").and_then(Value::as_array) else { return };
    let mut bekend: Vec<i64> = Vec::new();
    if let Some(lijst) = uit.get("plate_check_inputs").and_then(Value::as_array) {
        bekend.extend(lijst.iter().filter_map(|e| e.get("plate_id")?.as_i64()));
    }
    if let Some(lijst) = uit.get("skipped_plates").and_then(Value::as_array) {
        bekend.extend(lijst.iter().filter_map(|e| e.get("plate_id")?.as_i64()));
    }
    let nieuw: Vec<Value> = platen
        .iter()
        .filter_map(|p| p.get("id").and_then(Value::as_i64))
        .filter(|id| !bekend.contains(id))
        .map(|id| {
            let reden = if platen_ondersteund {
                "de plaatbouwer leverde voor deze plaat geen toetsinvoer en geen reden. Deze plaat                  is NIET getoetst; meld dit met het model."
            } else {
                "de ingebakken solverbundel levert geen plaattoetsinvoer (`plate_check_inputs`                  ontbreekt): de bundel is ouder dan de plaattoets. Deze plaat is NIET getoetst.                  Herbouw de MCP-server (`npm run build:sidecar` en daarna `cargo build`)."
            };
            json!({ "plate_id": id, "reason": reden })
        })
        .collect();
    if nieuw.is_empty() {
        return;
    }
    let Some(map) = uit.as_object_mut() else { return };
    match map.get_mut("skipped_plates").and_then(Value::as_array_mut) {
        Some(lijst) => lijst.extend(nieuw),
        None => {
            map.insert("skipped_plates".to_owned(), Value::Array(nieuw));
        }
    }
}

/// Eén toetsinvoerlijst uit het bundelantwoord. `Ok(None)` als de sleutel
/// ontbreekt; een lijst die niet op het Rust-type past is een fout.
fn lees_toetsinvoer<T: for<'de> Deserialize<'de>>(
    uit: &Value,
    veld: &str,
    typenaam: &str,
) -> Result<Option<Vec<T>>, RpcError> {
    let Some(rauw) = uit.get(veld) else { return Ok(None) };
    serde_json::from_value(rauw.clone()).map(Some).map_err(|e| {
        fout(
            TOETSING_ONMOGELIJK,
            format!(
                "Het model is doorgerekend, maar `{veld}` uit de solverbundel past niet op \
                 `{typenaam}` ({e}). Er is niet getoetst."
            ),
            "Server en solverbundel zijn uit elkaar gelopen. Herbouw de MCP-server \
             (`npm run build:sidecar` en daarna `cargo build`), of haal \
             OPENAEC_FEM_KERNEL weg.",
        )
    })
}

/// Het model als JSON, uit de payload die naar de sidecar gaat.
///
/// Bewust uit de payload en niet opnieuw van schijf: zo staat er geen tweede
/// leesactie naast de eerste die iets anders zou kunnen opleveren. `model` is
/// het model zelf; bij `project_path` staat het model op het bovenste niveau van
/// het projectbestand (zelfde velden, zie `tests/golden/portaal.ifcfem2d`).
/// Ontleedt de inhoud niet, dan komt er `None` terug en gebeurt er verder
/// niets: de sidecar leest dezelfde tekst en meldt de fout met meer detail dan
/// hier mogelijk is.
fn model_uit_payload(payload: &serde_json::Map<String, Value>) -> Option<Value> {
    if let Some(m) = payload.get("model") {
        return Some(m.clone());
    }
    let inhoud = payload.get("project")?.get("inhoud")?.as_str()?;
    serde_json::from_str(inhoud).ok()
}

/// Is deze materiaalnaam een betonsterkteklasse zoals het REKENMODEL hem
/// bedoelt?
///
/// De namen komen uit `nen_en_1992_1_1::CONCRETE_CLASSES` — dezelfde tabel 3.1
/// die de betontoetsing gebruikt, dus geen tweede lijst hier. Maar bewust NIET
/// via `concrete_class_by_name`: die herkent ook de korte vorm ("C30" naast
/// "C30/37"), en "C30" en "C35" zijn in EN 338 juist HOUTsterkteklassen. De
/// solverbundel maakt dat onderscheid net zo: `resolveSection` zoekt beton op
/// de volledige naam ("C30/37") en laat "C30" naar de houttak gaan. Zou hier de
/// korte vorm meetellen, dan kreeg een houten C30-staaf een melding dat hij van
/// beton is.
fn is_betonklasse(materiaal: &str) -> bool {
    let naam = materiaal.trim().replace(' ', "");
    nen_en_1992_1_1::CONCRETE_CLASSES
        .iter()
        .any(|c| c.name.eq_ignore_ascii_case(&naam))
}

/// Waarom een staaf NIET door de toetsing van `check_fem_model` ging, afgeleid
/// uit zijn materiaal. Elke tak noemt het materiaal en, waar die bestaat, de
/// tool die de toetsing wél doet.
///
/// `hout_ondersteund` = de bundel leverde `timber_check_inputs` en
/// `clt_check_inputs`. Zonder die twee is de bundel ouder dan deze server; een
/// houten staaf is dan niet getoetst omdat de BUNDEL het niet kan, en dat hoort
/// er zo te staan — niet alsof het model geen hout had.
///
/// De herkenning gebruikt de tabellen van de kernen zelf — tabel 3.1 van
/// NEN-EN 1992-1-1 via [`is_betonklasse`] en de sterkteklassen van
/// `nen_en_1995_1_1::strength_class_by_name` (EN 338 / EN 14080) — dus er wordt
/// geen tweede lijst met namen aangelegd. Beton gaat vóór hout, en beton alleen
/// op de volledige naam: "C30" is in EN 338 een HOUTsterkteklasse.
fn reden_niet_getoetst(materiaal: &str, profiel: &str, hout_ondersteund: bool) -> String {
    if is_betonklasse(materiaal) {
        return format!(
            "materiaal \"{materiaal}\" is een betonsterkteklasse — `check_fem_model` \
             toetst staal (EN 1993) en hout (EN 1995), geen beton. De EN 1992-toetsing \
             loopt via de tool `check_concrete_beam`, met de wapeningskorf uit \
             `checkConfig.betonKorf` van deze staaf."
        );
    }
    if nen_en_1995_1_1::strength_class_by_name(materiaal.trim()).is_some() {
        if !hout_ondersteund {
            return format!(
                "materiaal \"{materiaal}\" is een houtsterkteklasse (EN 338 / EN 14080), maar \
                 de ingebakken solverbundel levert geen houttoetsingsinvoer \
                 (`timber_check_inputs` ontbreekt): de bundel ondersteunt hout in \
                 `check_fem_model` niet. Deze staaf is NIET getoetst. Herbouw de MCP-server \
                 (`npm run build:sidecar` en daarna `cargo build`), of toets via \
                 `check_timber_beams` / `check_clt_beams`."
            );
        }
        return format!(
            "materiaal \"{materiaal}\" is een houtsterkteklasse, maar de houtbouwer leverde \
             voor deze staaf geen toetsingsinvoer en geen reden. Deze staaf is NIET \
             getoetst; meld dit met het model."
        );
    }
    if materiaal.trim_start().to_ascii_uppercase().starts_with("VRIJ:") {
        return format!(
            "vrij materiaal \"{materiaal}\" — `check_fem_model` toetst staal en hout; de \
             spanningstoets voor vrij materiaal loopt niet via deze server. Deze staaf is \
             NIET getoetst."
        );
    }
    format!(
        "niet getoetst: materiaal \"{materiaal}\" met profiel \"{profiel}\" is niet \
         herkend als staal met een profiel uit de EN 1993-profieldatabase of als hout, en \
         `check_fem_model` toetst alleen staal en hout."
    )
}

/// De reden bij een nummer uit `beam_ids` dat geen staaf in het model is.
/// Dezelfde woorden als `redenBestaatNiet` in `design-mockup/src/mcp/sidecar.ts`.
fn reden_bestaat_niet(id: i64) -> String {
    format!(
        "bestaat niet in het model — staaf {id} is gevraagd in `beam_ids`, maar het model \
         heeft geen staaf met dit nummer; er is niets getoetst"
    )
}

/// Zorgt dat ELKE gevraagde staaf in het antwoord verantwoord is: in `results`,
/// `timber_results` of `clt_results` (via de toetsinvoer) of in `skipped_beams`
/// met een reden — ook een gevraagd nummer dat geen staaf in het model is.
///
/// WAAROM DIT BESTAAT
/// `check_fem_model` toetst uitsluitend via `steel_check::check_all_beams`. De
/// solverbundel bouwt alleen staal-toetsinvoer; een staaf met een ander
/// materiaal komt daar niet doorheen en verdween zonder spoor uit het
/// antwoord. Voor een client is een staaf die nergens in het antwoord staat
/// niet te onderscheiden van een staaf die is goedgekeurd, en `governing` leest
/// dan als het oordeel over het hele model. Gemeten: een portaal met een
/// houten ligger (C24 96×450) gaf `results` [1, 3], `skipped_beams` [] en
/// `warnings` [], terwijl die ligger apart getoetst UC 2,856 had.
///
/// Eerst gold dit vangnet alleen voor beton. Het is nu een vangnet voor ALLES
/// wat niet getoetst is — hout, vrij materiaal, of een staaf die de bundel om
/// een andere reden niet als staal herkende — zodat een volgende materiaalsoort
/// niet opnieuw spoorloos kan verdwijnen.
///
/// WAAROM HIER EN NIET IN DE BUNDEL
/// Dit is de laatste laag vóór de client, en hij hangt niet af van de versie
/// van de ingebakken bundel: wat de bundel ook (niet) meldt, hier wordt het
/// antwoord sluitend gemaakt. Het materiaal staat gewoon in het model dat deze
/// server zelf heeft ingelezen.
///
/// WAT DIT NIET DOET
/// Er wordt niet getoetst. Beton vraagt een wapeningskorf; die hier aannemen
/// zou een unity check opleveren die bij een andere staaf hoort.
fn meld_niet_getoetste_staven(
    uit: &mut Value,
    model: Option<&Value>,
    beam_ids: Option<&[i64]>,
    hout_ondersteund: bool,
) {
    let Some(model) = model else { return };
    let Some(staven) = model.get("beams").and_then(Value::as_array) else { return };

    // Alles wat al in het antwoord staat blijft ongemoeid: een staaf twee keer
    // melden leest als twee staven.
    let mut bekend: Vec<i64> = Vec::new();
    for veld in ["steel_check_inputs", "timber_check_inputs", "clt_check_inputs", "skipped_beams"] {
        if let Some(lijst) = uit.get(veld).and_then(Value::as_array) {
            bekend.extend(lijst.iter().filter_map(|e| e.get("beam_id")?.as_i64()));
        }
    }

    let mut nieuw: Vec<Value> = Vec::new();
    for staaf in staven {
        let Some(id) = staaf.get("id").and_then(Value::as_i64) else { continue };
        if bekend.contains(&id) {
            continue;
        }
        // `beam_ids` beperkt de toetsing; buiten die selectie is niets
        // overgeslagen, want er is niets gevraagd.
        if let Some(selectie) = beam_ids {
            if !selectie.is_empty() && !selectie.contains(&id) {
                continue;
            }
        }
        // Een ontbrekend materiaal of profiel is hier alleen tekst voor de
        // reden; de solve zelf weigert een staaf zonder materiaal al.
        let materiaal = staaf.get("material").and_then(Value::as_str).unwrap_or("");
        let profiel = staaf.get("profile").and_then(Value::as_str).unwrap_or("");
        nieuw.push(json!({
            "beam_id": id,
            "reason": reden_niet_getoetst(materiaal, profiel, hout_ondersteund),
        }));
    }
    // Een gevraagd NUMMER dat geen staaf in het model is. Tot september 2026
    // kwam het nergens terug: `beam_ids` [1, 99] gaf staaf 1 en zweeg over 99.
    // De bundel meldt het sindsdien zelf; dit vangt een oudere bundel op.
    if let Some(selectie) = beam_ids {
        let in_model: Vec<i64> =
            staven.iter().filter_map(|s| s.get("id").and_then(Value::as_i64)).collect();
        for &id in selectie {
            let al_gemeld = bekend.contains(&id)
                || nieuw.iter().any(|n| n.get("beam_id").and_then(Value::as_i64) == Some(id));
            if in_model.contains(&id) || al_gemeld {
                continue;
            }
            nieuw.push(json!({ "beam_id": id, "reason": reden_bestaat_niet(id) }));
        }
    }
    if nieuw.is_empty() {
        return;
    }
    let Some(map) = uit.as_object_mut() else { return };
    match map.get_mut("skipped_beams").and_then(Value::as_array_mut) {
        Some(lijst) => lijst.extend(nieuw),
        None => {
            map.insert("skipped_beams".to_owned(), Value::Array(nieuw));
        }
    }
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

/// Verende aansluiting per staafeinde (`BeamEindVeren`). De SPIEGEL van
/// `VEER_VELDEN` in de veldpoort van de sidecar: nul wordt daar geweigerd,
/// want een veer met stijfheid nul is een scharnier en hoort in `releases`.
fn schema_veren() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Verende aansluiting per staafeinde: stijfheid in kN/mm (startTx/startTz/endTx/endTz) of kNm/rad (startRy/endRy). Ontbreekt het object, dan is de staaf star verbonden (op de scharnieren van `releases` na). Laat een veld WEG als er geen veer is; nul wordt geweigerd omdat dat een scharnier is.",
        "properties": {
            "startTx": { "type": "number", "exclusiveMinimum": 0 },
            "startTz": { "type": "number", "exclusiveMinimum": 0 },
            "startRy": { "type": "number", "exclusiveMinimum": 0 },
            "endTx":   { "type": "number", "exclusiveMinimum": 0 },
            "endTz":   { "type": "number", "exclusiveMinimum": 0 },
            "endRy":   { "type": "number", "exclusiveMinimum": 0 }
        }
    })
}

/// Staaf op bedding (`BeamBedding`, Winkler). Beide getallen zijn verplicht:
/// de adapter rekent de lijnstijfheid uit k·b, en met een nul valt de bedding
/// stil weg.
fn schema_bedding() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["k", "b"],
        "description": "Staaf op bedding (Winkler): beddingsconstante k in kN/m³ en contactbreedte b in mm. De adapter rekent de lijnstijfheid k·b en knipt de staaf op de karakteristieke lengte (4EI/(k·b))^¼ op. Ontbreekt het object, dan ligt de staaf niet op een bedding.",
        "properties": {
            "k": { "type": "number", "exclusiveMinimum": 0, "description": "Beddingsconstante in kN/m³ (typisch 10 000 - 100 000 voor grond)." },
            "b": { "type": "number", "exclusiveMinimum": 0, "description": "Contactbreedte in mm: de breedte van de staaf op de bedding." }
        }
    })
}

/// Het schema van `checkConfig`: de SPIEGEL van `CHECKCONFIG_VELDEN` in
/// `design-mockup/src/mcp/valideerModel.ts`, de veldpoort van de sidecar. Een
/// test hieronder leest die lijst uit het bronbestand en eist dat beide
/// dezelfde velden kennen. Tot september 2026 was dit een eigen, kortere
/// lijst: `ltbSupportSpacing_m`, `floorBrittle`, `deflectionAddLimitNumerator`,
/// de betonvelden en `spanningSigmaZ` ontbraken, zodat het schema een model
/// weigerde dat de app opslaat en de server aanvaardt.
fn schema_checkconfig() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Toetsinstellingen van deze staaf. Elk ontbrekend veld krijgt de gedocumenteerde default van de app; de staalsoort komt NIET hier vandaan maar uit `material`. Een onbekend veld wordt geweigerd.",
        "properties": {
            "bucklingLengthY_m": { "type": "number", "exclusiveMinimum": 0,
                "description": "Kniklengte om de sterke as in m; default = de systeemlengte." },
            "bucklingLengthZ_m": { "type": "number", "exclusiveMinimum": 0,
                "description": "Kniklengte om de zwakke as in m; default = de systeemlengte." },
            "lateralRestraints": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 },
                "description": "Kipsteunen BOVENFLENS als fractie 0..1 van de staaflengte." },
            "lateralRestraintsBottom": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 },
                "description": "Kipsteunen ONDERFLENS, zelfde conventie. Relevant waar het moment de onderflens op druk zet." },
            "deflectionClass": { "type": "string", "enum": ["floor", "floorBrittle", "roof", "cantilever", "custom"],
                "description": "Doorbuigingsklasse volgens NEN-EN 1990:2002/NB:2019 A1.4.3(3); default \"floor\". \"floor\" = w_add ≤ 3/1000·ℓ_rep (overige vloeren en intensief gebruikte daken), \"floorBrittle\" = ℓ_rep/500 (vloeren met scheurgevoelige scheidingswanden), \"roof\" = ℓ_rep/250 (overige daken), \"cantilever\" = als vloer met ℓ_rep = 2 × de uitkraging, \"custom\" = de opgegeven n." },
            "deflectionLimitNumerator": { "type": "number", "exclusiveMinimum": 0,
                "description": "De n in de eis L/n; telt alleen bij klasse \"custom\". Moet groter dan nul zijn; 0 of negatief wordt geweigerd met reden." },
            "deflectionAddLimitNumerator": { "type": "number", "exclusiveMinimum": 0,
                "description": "Losse noemer n voor de BIJKOMENDE doorbuiging w_add; alleen staal. Weglaten = de NB-waarde bij de klasse. Alleen bedoeld om een externe referentie-uitwerking met een vaste noemer na te rekenen; het rapport vermeldt dan dat de noemer is opgegeven." },
            "preCamber_mm": { "type": "number",
                "description": "Zeeg in mm, POSITIEF = OMHOOG (tegen een doorhangende ligger in). Alleen bij een liggende staaf (minder dan 75 graden met de horizontaal); bij een staande staaf wordt geen zeeg verrekend. Telt niet mee in w_add." },
            "serviceClass": { "type": "integer", "enum": [1, 2, 3],
                "description": "Klimaatklasse EN 1995 §2.3.1.3; alleen voor hout." },
            "loadDuration": { "type": "string",
                "enum": ["permanent", "long", "medium", "short", "instantaneous"],
                "description": "Belastingduurklasse EN 1995 §2.3.1.2; alleen hout en kruislaaghout. WEGLATEN = automatisch: de toetsing leidt de klasse PER UGT-combinatie af uit de belastinggevallen (EN 1995-1-1 3.1.3(2), de kortstdurende belasting bepaalt k_mod; NB tabel 2.2: eigen gewicht blijvend, opslag (categorie E, industrie-lang) lang, vloerbelasting (A-D) middellang, sneeuw en wind kort; categorie H (daken) kort; F, G, C-menigte en industrie-kort middellang). OPGEGEVEN werkt het als ONDERGRENS: het maakt de duur alleen langer, nooit korter." },
            "ltbSupportSpacing_m": { "type": "number", "exclusiveMinimum": 0,
                "description": "Kipsteunafstand in m voor EN 1995-1-1 art. 6.3.3 (tabel 6.1, l_ef); alleen hout. Weglaten = de staaflengte, de ongunstigste keuze. Staat los van `lateralRestraints`: die zijn per flens en horen bij staal." },
            "kCr": { "type": "number", "exclusiveMinimum": 0, "maximum": 1,
                "description": "Scheurfactor k_cr voor de dwarskrachttoets van hout en kruislaaghout, b_ef = k_cr · b (EN 1995-1-1 6.1.7(2), 6.13a). Weglaten = 1,0: de waarde die NEN-EN 1995-1-1/NB bij 6.1.7 voorschrijft voor een prismatische doorsnede. De Europese aanbeveling van 6.1.7(2) is 0,67 voor gezaagd en gelijmd gelamineerd hout; wie daarmee wil rekenen zet dat hier. Buiten (0, 1] wordt geweigerd. Bij een samengestelde doorsnede bepaalt de kern k_cr zelf uit lijfdikte/flensbreedte." },
            "performLtbCheck": { "type": "boolean",
                "description": "Kiptoets EN 1995-1-1 art. 6.3.3 uitvoeren; weglaten = true. `false` betekent: de gedrukte rand is over de volle lengte zijdelings gesteund (dakbeschot, vloerplaat) en de opleggingen zijn torsievast, zodat k_crit = 1,0 (art. 6.3.3(5)). De toets staat dan als 'niet van toepassing' met die reden in het resultaat — nooit stil weggelaten." },
            "ltbLoadPosition": { "type": "string", "enum": ["centreOfGravity", "compressionEdge", "tensionEdge"],
                "description": "Aangrijpingspunt van de belasting voor tabel 6.1 (voetnoot a) van EN 1995-1-1 art. 6.3.3; alleen hout. \"compressionEdge\" = last aan de drukzijde, l_ef + 2h (een dak of vloer op de bovenrand van een vrij opgelegde ligger; ongunstig); \"tensionEdge\" = last aan de trekzijde, l_ef − 0,5h; weglaten = \"centreOfGravity\", geen correctie." },
            "cltKdef": { "type": "number", "minimum": 0,
                "description": "Vervormingsfactor k_def voor de kruip van EN 1995-1-1 §7.2 bij KRUISLAAGHOUT (w_fin = w_inst + k_def · w_qp). Weglaten = de doorbuigingstoets van die staaf wordt NIET uitgevoerd en staat met die reden als 'niet van toepassing' in het resultaat. Er is met opzet geen standaardwaarde: tabel 3.2 kent rijen voor gezaagd hout, gelijmd gelamineerd hout, LVL, multiplex, OSB, spaanplaat, vezelplaat en MDF, maar GEEN rij voor kruislaaghout, en de nationale bijlage voegt er geen toe. Neem de waarde uit de productverklaring of de ETA van de plaat, per klimaatklasse. Alleen gelezen bij een CLT-profiel; massief hout haalt k_def uit tabel 3.2." },
            "cltKdefBron": { "type": "string",
                "description": "Waar `cltKdef` vandaan komt, bijvoorbeeld \"ETA-00/0000, tabel 8, klimaatklasse 1\". VERPLICHT zodra `cltKdef` is opgegeven: zonder herkomst is de waarde in het rapport niet te onderscheiden van een aangenomen getal, en dan blijft de toets uit." },
            "betonKorf": schema_betonkorf(),
            "betonMilieuklasse": crate::concrete_tools::schema_milieuklasse(),
            "betonConstructieklasse": crate::concrete_tools::schema_constructieklasse(),
            "betonStaalsoort": { "type": "string",
                "description": "Wapeningsstaal, bijvoorbeeld \"B500B\"; zie `list_reinforcement_grades`. Weglaten = de standaardsoort van de betontoetsing." },
            "betonStroken": { "type": "number", "exclusiveMinimum": 0,
                "description": "Aantal stroken voor de integratie van de betonspanning (`n_strips` van `check_concrete_beam`)." },
            "betonStaaltak": crate::concrete_tools::schema_steel_branch(),
            "betonKolom": crate::concrete_tools::schema_kolom(),
            "spanningSigmaZ": { "type": "number",
                "description": "Dwarsspanning σ_z in N/mm² voor de vergelijkspanning van een vrij materiaal; weglaten = 0 (een staafelement kent alleen N, V en M)." },
            "betonZones": crate::concrete_tools::schema_wapeningszones()
        }
    })
}

/// De wapeningskorf ZOALS HET PROJECTBESTAND HEM DRAAGT: precies de velden die
/// `keurKorf` in de sidecar aanvaardt. Dat is minder dan `cage` van
/// `check_concrete_beam` (geen dekking per zijde, geen zijstaven); het schema
/// belooft hier dus niet meer dan de server doorlaat.
fn schema_betonkorf() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Wapeningskorf van een betonstaaf: dekking, beugel, boven- en onderwapening, en optioneel de beugelgegevens. Er is GEEN standaardkorf; zonder korf wordt een betonstaaf niet getoetst.",
        "required": ["cover_mm", "stirrup_diameter_mm", "top", "bottom"],
        "properties": {
            "cover_mm": { "type": "number", "minimum": 0,
                "description": "Nominale betondekking c_nom op de beugel in mm (EN 1992-1-1 §4.4.1)." },
            "stirrup_diameter_mm": { "type": "number", "minimum": 0,
                "description": "Beugeldiameter in mm; 0 = geen beugel." },
            "top": crate::concrete_tools::schema_wapeningsrij("Bovenwapening (zijde z = h)."),
            "bottom": crate::concrete_tools::schema_wapeningsrij("Onderwapening (zijde z = 0)."),
            "stirrup_spacing_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Hart-op-hartafstand s van de beugels langs de lengteas in mm (§9.2.2(5)). Weglaten = niet opgegeven; de dwarskrachttoets meldt dan dat hij niet kan." },
            "stirrup_legs": { "type": "integer", "minimum": 1,
                "description": "Aantal beugelbenen dat een verticale doorsnede kruist. Weglaten = niet opgegeven." },
            "stirrup_leg_spacing_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Hart-op-hartafstand s_t van de beugelbenen in dwarsrichting in mm (§9.2.2(8)). Weglaten mag bij een tweebenige beugel." },
            "stirrup_fywk_mpa": { "type": "number", "exclusiveMinimum": 0,
                "description": "f_ywk van de dwarskrachtwapening in N/mm². Weglaten = dezelfde staalsoort als de langswapening." }
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
                    "description": "Profielnaam uit de catalogus ('HEA160', 'IPE300') of een houtrechthoek ('96x450'). Default \"HEA160\". Bij een verlopend profiel: het profiel aan het BEGIN (knoop `from`)." },
                "profileEnd": { "type": "string",
                    "description": "Optioneel: profiel aan het EINDE (knoop `to`) van een verlopende staaf; de maten verlopen lineair van `profile` naar `profileEnd`. Beide moeten van dezelfde doorsnedesoort zijn: rechthoek↔rechthoek (hout, '96x450' → '96x300') of I/H↔I/H uit de staalcatalogus ('IPE300' → 'IPE200', gerekend als gelast I-profiel). Kokers, buizen, hoeklijnen, U-profielen, kruislaaghout en beton kennen geen verloop; een model met platen evenmin. Een eigen doorsnede ('EIGEN:…') mag alleen als zij een gelast, dubbelsymmetrisch I-profiel uit drie platen is — zo bewaart het splitsen van een verlopende staaf de tussendoorsnede. Weggelaten of gelijk aan `profile` = prismatisch." },
                "releases": schema_releases(),
                "checkConfig": schema_checkconfig(),
                "loadRole": { "type": "string",
                    "enum": ["gevelLinks", "gevelRechts", "dakPlat", "dakHellend", "overstek", "vloer", "binnen"],
                    "description": "Constructieve rol, alleen gebruikt door de belastinggeneratoren." },
                "veren": schema_veren(),
                "bedding": schema_bedding()
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
        "description": "Voorgebouwd CDT-mesh van een polygoonplaat (of van een rechthoek met een niet-rechthoekige opening), zoals het projectbestand hem bewaart. De `signature` dekt hoeken, meshSize, openingen en elementkeuze. Klopt zij niet met de geometrie, of ontbreken of kloppen de randknopen niet, dan weigert de engine met een Nederlandse melding in plaats van te benaderen.",
        "required": ["signature", "points", "triangles", "edgeNodeIndices"],
        "properties": {
            "signature": { "type": "string" },
            "points": { "type": "array", "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["x", "z"],
                "properties": { "x": { "type": "number" }, "z": { "type": "number" } } } },
            "triangles": { "type": "array",
                "description": "CST-driehoeken als drietallen puntindices; mag leeg zijn bij een net van louter vierhoeken.",
                "items": {
                "type": "array", "minItems": 3, "maxItems": 3,
                "items": { "type": "integer", "minimum": 0 } } },
            "quads": { "type": "array",
                "description": "Quad4-vierhoeken als viertallen puntindices (convex; de engine normaliseert de omloopzin en weigert een niet-convexe vierhoek).",
                "items": {
                "type": "array", "minItems": 4, "maxItems": 4,
                "items": { "type": "integer", "minimum": 0 } } },
            "meshSoort": { "type": "string", "enum": ["driehoeken", "vierhoeken", "gemengd"],
                "description": "Wat de mesher opleverde; \"gemengd\" = vierhoeken waar de koppeling van driehoeken lukte, elders driehoeken." },
            "edgeNodeIndices": { "type": "array",
                "description": "Per plaatrand (rand i loopt van hoek i naar hoek i+1) de indices in `points` van de meshknopen op die rand, van hoek tot hoek. Precies één lijst per hoek van de plaat; zonder deze lijsten kan geen randlast, randpuntlast of staafaansluiting zijn rand vinden.",
                "items": {
                "type": "array", "minItems": 2, "items": { "type": "integer", "minimum": 0 } } },
            "openingEdgeNodeIndices": { "type": "array",
                "description": "Per opening (volgorde van `openingen`), per openingsrand de indices van de meshknopen op die rand, van hoek tot hoek. Verplicht zodra de plaat openingen heeft: zo keurt de engine dat het net de opening werkelijk volgt.",
                "items": { "type": "array", "items": {
                    "type": "array", "minItems": 2, "items": { "type": "integer", "minimum": 0 } } } }
        }
    })
}

fn schema_openingen() -> Value {
    json!({
        "type": "array",
        "description": "Openingen (sparingen) in de plaat: polygonen in mm, volledig binnen de omtrek, minstens 10 mm van de rand en van elkaar. Een opening die de omtrek raakt of een andere opening overlapt, wordt geweigerd met reden. Rechthoekige openingen in een rechthoekige plaat meshet de engine zelf (raster); elke andere vorm vereist een `meshCache`. Een staafeinde op de rand van een opening wordt net als op de omtrek aan die rand gekoppeld (ook tussen twee randknopen); een vrij staafeinde tussen 1 en 50 mm van een plaatrand wordt geweigerd met rand en afstand.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "punten"],
            "properties": {
                "id": { "type": "integer", "description": "Uniek binnen de plaat." },
                "punten": { "type": "array", "minItems": 3,
                    "description": "Hoekpunten in omtrekvolgorde (mm).",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["x", "z"],
                        "properties": { "x": { "type": "number" }, "z": { "type": "number" } } } }
            }
        }
    })
}

fn schema_plates() -> Value {
    json!({
        "type": "array",
        "description": "Platen (wandschijven, in het vlak belast). Een asgelijnde rechthoek — ook met asgelijnde rechthoekige openingen — rekent zonder meer via het raster; elke andere vorm vereist een geldige `meshCache` uit een projectbestand — zonder cache volgt een expliciete weigering en geen benadering.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "nodeIds"],
            "properties": {
                "id": { "type": "integer" },
                "nodeIds": { "type": "array", "minItems": 3, "items": { "type": "integer" },
                    "description": "Hoekknopen in klikvolgorde." },
                "thickness": { "type": "number", "exclusiveMinimum": 0, "description": "mm, default 20." },
                "materiaal": { "type": "string",
                    "description": "Materiaal van de plaat, DEZELFDE grammatica als `material` van een staaf: staalsoort (S235-S460), betonklasse (C12/15-C90/105), houtsterkteklasse (C14-C35, GL24h-GL36h), kruislaaghout (\"CLT C24 40/20/40/20/40\" - bij een plaat mag de sterkteklasse voor de opbouw staan, omdat een plaat geen profielveld heeft) of vrij materiaal (\"VRIJ:<naam> E=<N/mm2> rho=<kg/m3> f=<N/mm2>\"). Hieruit volgen E, nu en rho. Hout en kruislaaghout rekenen RICHTINGSAFHANKELIJK (E_0,mean langs de vezel, E_90,mean dwars; bij massief hout G_mean in het vlak); zie `hoofdrichting`. KRUISLAAGHOUT vraagt daarnaast een G12-keuze: `cltG12` met `cltG12Bron`, of bewust `cltG12Bovengrens` - zonder een van beide wordt de plaat GEWEIGERD met reden. Een naam die niet herkend wordt, wordt GEWEIGERD met reden - er wordt nooit staal aangenomen. Ontbreekt het veld, dan rekent de plaat isotroop met E/nu/rho hieronder, precies als voorheen." },
                "hoofdrichting": { "type": "number",
                    "description": "Hoek in GRADEN, tegen de klok in vanaf de globale x-as, naar hoofdrichting 1 van een richtingsafhankelijk materiaal (de vezelrichting; bij kruislaaghout de richting van de lengtelagen). Ontbreekt = 0 graden. Zonder richtingsafhankelijk materiaal heeft het veld geen invloed." },
                "cltG12": { "type": "number", "exclusiveMinimum": 0,
                    "description": "Alleen bij KRUISLAAGHOUT: glijdingsmodulus G12 in het vlak (N/mm2) uit de productverklaring of de ETA van de plaat. VERPLICHT samen met `cltG12Bron`. Er is met opzet geen standaardwaarde: NEN-EN 1995-1-1 en EN 338 geven geen G in het vlak voor een gekruiste opbouw, en de uitgesmeerde G_mean van de lamellen is zonder reductie voor de niet-verlijmde smalle zijden en de wringing in de kruisingsvlakken een bovengrens. Bij elk ander materiaal (of zonder materiaal) wordt het veld geweigerd. Niet samen met `cltG12Bovengrens`." },
                "cltG12Bron": { "type": "string",
                    "description": "Herkomst van `cltG12`, bijvoorbeeld \"ETA-00/0000, tabel 3\"; komt letterlijk in het rapport. VERPLICHT zodra `cltG12` is opgegeven - zonder bron wordt de plaat geweigerd." },
                "cltG12Bovengrens": { "type": "boolean",
                    "description": "Alleen bij KRUISLAAGHOUT: `true` = bewust rekenen met de uitgesmeerde G_mean (Sum t*G_mean/Sum t) ZONDER reductie - een bovengrens, de schijf is in afschuiving te stijf; het rapport draagt een waarschuwing. Dit is de G12 van voor deze keuze, dus een model met `true` rekent bit-gelijk aan toen. Niet samen met `cltG12`." },
                "wapening": crate::plate_tools::schema_wapening_aanwezig(),
                "klimaatklasse": { "type": "integer", "enum": [1, 2, 3],
                    "description": "Alleen bij HOUT (massief of gelijmd gelamineerd): klimaatklasse volgens NEN-EN 1995-1-1 2.3.1.3 voor de plaattoets (k_mod, tabel 3.1). Ontbreekt = klimaatklasse 1, met een notitie in het toetsresultaat. Rekent niet mee in de stijfheid. Bij elk ander materiaal wordt het veld geweigerd." },
                "plooi": crate::plate_tools::schema_plooi(true),
                "E":  { "type": "number", "exclusiveMinimum": 0, "description": "N/mm2, default 210000. MET `materiaal` is dit de expliciete overschrijving van E, en die geldt in BEIDE richtingen: de plaat rekent dan isotroop en de richtingsafhankelijkheid vervalt." },
                "nu": { "type": "number", "description": "Dwarscontractie, default 0,3. Met `materiaal` de overschrijving van nu_12 (staal 0,3, beton 0,2). Bij hout en kruislaaghout is nu_12 zonder dit veld 0: een AANNAME, want NEN-EN 1995-1-1 en EN 338 geven geen dwarscontractie; het rapport vermeldt dat. Een nu_12 waarbij nu_12*nu_21 >= 1 (nu_21 = nu_12*E2/E1) wordt geweigerd." },
                "rho": { "type": "number", "exclusiveMinimum": 0, "description": "kg/m3, default 7850. Met `materiaal` de overschrijving van rho, en daarmee van het eigen gewicht rho*t*A." },
                "meshSize": { "type": "number", "exclusiveMinimum": 0, "description": "mm, default 500." },
                "meshCache": schema_meshcache(),
                "meshType": { "type": "string", "enum": ["driehoeken", "vierhoeken"],
                    "description": "Elementkeuze: \"vierhoeken\" = Quad4 (bilineair), \"driehoeken\" = CST (constante rek). Ontbreekt = de standaard voor de vorm: rechthoekraster vierhoeken, CDT-mesh driehoeken — precies de getallen van vóór deze keuze." },
                "openingen": schema_openingen()
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
                    "description": "Aard van het geval. Bepaalt de factoren in de standaardcombinaties (NEN-EN 1990 NB tabel NB.4/NB.5 en NB.2–A1.1). \"other\" of geen type = GEEN factor: zo'n geval met een last komt als FOUT in `warnings` en telt als nul. Het eigen gewicht komt in het eerste \"dead\"-geval; zonder \"dead\"-geval wordt het NIET meegerekend (ook dat staat in `warnings`)." },
                "categorie": { "type": "string",
                    "enum": ["A", "B", "C", "C-menigte", "D", "E", "F", "G", "H", "industrie-kort", "industrie-lang"],
                    "description": "Gebruikscategorie van een \"live\"-geval volgens NB tabel NB.2–A1.1; bepaalt ψ₀/ψ₁/ψ₂. Ontbreekt = A (woon- en verblijfsruimtes: 0,4/0,5/0,3). \"C\" = bijeenkomstruimte, overige delen (ψ₀ = 0,4); \"C-menigte\" = delen die bij een calamiteit zwaar door een mensenmenigte belast kunnen worden (ψ₀ = 0,6)." },
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
        "description": "Lasten. `type` bepaalt welke velden meetellen: pointForce (fx/fz op nodeId, op beamId met posFrac, of op een plaatrand met plateId + edgeIndex/edge + posFrac), pointMoment (my), lineLoad (q of qStart/qEnd op beamId), thermal (deltaT op beamId), edgeLoad (q langs een plaatrand, desgewenst als deellast of trapezium met startFrac/endFrac/qStart/qEnd). Een plaatrand heeft precies één adres: `edgeIndex` (werkt bij elke plaat) of `edge` (alleen bij een asgelijnde rechthoek); beide, geen, of een benoemde rand op een polygoon wordt geweigerd met een reden. Staat er ook een `openingId`, dan ligt de last op de rand van DIE OPENING (edgeIndex telt dan langs de openingshoeken) in plaats van op de omtrek; een opening die niet bestaat of een benoemde rand op een opening wordt geweigerd — er wordt nooit stil op de omtrek teruggevallen.",
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
                "plateId": { "type": "integer", "description": "Doelplaat bij edgeLoad en bij een puntlast op een plaatrand (pointForce); dan geen nodeId of beamId." },
                "fx": { "type": "number", "description": "Puntlast in kN, globale x." },
                "fz": { "type": "number", "description": "Puntlast in kN, globale z (negatief = omlaag)." },
                "my": { "type": "number", "description": "Koppel in kNm." },
                "posFrac": { "type": "number", "minimum": 0, "maximum": 1,
                    "description": "Positie van een staafgebonden puntlast als fractie van de staaflengte vanaf `from`; bij een puntlast op een plaatrand de fractie langs de rand vanaf de beginhoek (edgeIndex i: hoek i; edge: de kleinste x of z) — daar verplicht. De kracht gaat consistent naar de twee randknopen van de elementrand waarop hij staat." },
                "q": { "type": "number", "description": "Gelijkmatige lijnlast in kN/m staaflengte (negatief = omlaag bij qDir \"z\"); bij edgeLoad in kN/m randlengte." },
                "qStart": { "type": "number", "description": "Trapeziumlast: waarde aan het begin van het belaste deel (staaf of plaatrand)." },
                "qEnd":   { "type": "number", "description": "Trapeziumlast: waarde aan het einde van het belaste deel (staaf of plaatrand)." },
                "qDir": { "type": "string", "enum": ["x", "z"], "description": "Richting van de lijnlast; default \"z\"." },
                "qCoord": { "type": "string", "enum": ["global", "local"],
                    "description": "Assenstelsel van de lijnlast; default \"global\". \"local\" + \"z\" = loodrecht op de staafas, \"local\" + \"x\" = axiaal." },
                "startFrac": { "type": "number", "minimum": 0, "maximum": 1,
                    "description": "Deellast: begin van het belaste deel als fractie; default 0. Bij edgeLoad langs de rand vanaf de beginhoek." },
                "endFrac": { "type": "number", "minimum": 0, "maximum": 1,
                    "description": "Deellast: einde van het belaste deel als fractie; default 1. Moet groter zijn dan startFrac." },
                "deltaT": { "type": "number", "description": "Temperatuurverschil in K bij type \"thermal\"." },
                "edge": { "type": "string", "enum": ["bottom", "top", "left", "right"],
                    "description": "Benoemde plaatrand, alleen bij een asgelijnde rechthoek (op een polygoon: weigering). Fracties tellen vanaf de kleinste x (bottom/top) of z (left/right). Niet samen met edgeIndex." },
                "edgeIndex": { "type": "integer", "minimum": 0,
                    "description": "Plaatrand als index: rand i loopt van hoek i naar hoek i+1 (volgorde van nodeIds), bij elke plaatvorm; fracties tellen vanaf hoek i. Niet samen met edge. Met openingId erbij telt de index langs de hoeken van die opening." },
                "openingId": { "type": "integer",
                    "description": "De last ligt op de rand van de OPENING met dit id (`plates[].openingen[].id`) in plaats van op de omtrek. Verplicht samen met edgeIndex (rand j loopt van openingshoek j naar hoek j+1); een benoemde rand (edge) bestaat bij een opening niet. Fracties en posFrac tellen vanaf openingshoek j. Ontbreekt het veld, dan ligt de last op de omtrek." },
                "gegenereerdDoor": { "type": "string", "enum": ["wind"],
                    "description": "Herkomst; ontbreekt = handmatig ingevoerd." },
                "omschrijving": { "type": "string",
                    "description": "Vrije naam van de gebruiker voor deze last (\"sneeuw op overstek\", \"reactie spant 3\"). Documentatie: verandert niets aan de berekening, maar komt wel in de lastentabel van het rapport." }
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
                "description": "Richting van de equivalente horizontale krachten: 1 = +x, -1 = -x." },
            "scheefstandBron": { "type": "string", "enum": ["vast", "en1993", "en1992", "en1995", "ongunstigste"], "default": "vast",
                "description": "Waar phi vandaan komt: \"vast\" = 1/scheefstandNoemer; \"en1993\" = EN 1993-1-1 (5.5), \"en1992\" = EN 1992-1-1 (5.1), \"en1995\" = EN 1995-1-1 (5.1), met alpha_h en alpha_m uit h en m; \"ongunstigste\" = de grootste phi van de normen die op het model van toepassing zijn. Bij een norm telt scheefstandNoemer niet; de sidecar rekent dezelfde phi als de app en meldt hem in warnings." },
            "scheefstandHoogteM": { "type": ["number", "null"], "exclusiveMinimum": 0, "default": null,
                "description": "Hoogte h in m voor alpha_h; null = uit het model afleiden." },
            "scheefstandAantalElementen": { "type": ["integer", "null"], "minimum": 1, "default": null,
                "description": "Aantal dragende verticale elementen m voor alpha_m; null = uit het model afleiden." }
        }
    })
}


fn schema_combinations() -> Value {
    json!({
        "type": "array",
        "description": "Belastingcombinaties. Ontbreekt dit veld, dan gelden de combinaties uit het projectbestand, en anders de standaardset die de app afleidt uit `loadCases` (type en categorie) en de gevolgklasse: 6.10a, 6.10b per leidende veranderlijke last (ook met gunstig werkende blijvende last), 6.14b en 6.15b per leidende last, en 6.16b — met γ uit NEN-EN 1990 NB tabel NB.4/NB.5 en ψ uit tabel NB.2–A1.1. Elke uitdrukking komt in elke opstelling van de veranderlijke gevallen: ieder veranderlijk geval aan- of afwezig (naam \"… zonder <geval>\"), want een veranderlijke belasting telt alleen waar ze ongunstig werkt (NEN-EN 1991-1-1 6.2.1(1)P). Boven 4 gebruiksbelastinggevallen gaan de gevallen van één categorie samen aan of uit, en dat staat in `warnings`. Wind- en sneeuwgevallen zijn alternatieven en staan nooit samen in één combinatie. Combinaties uit een projectbestand gaan door dezelfde functie als het openen in de app: de standaardset van versie 0.3.11 en ouder (herkend op naam en factoren), standaardcombinaties van een andere gevolgklasse en verouderde combinaties van de windgenerator worden vervangen door de huidige afleiding, en `warnings` zegt wat er vervangen is; eigen combinaties blijven staan en worden gecontroleerd. Een set is nooit stil een deel van de standaardset: ontbreekt er in een set met (ook hernoemde) standaardcombinaties een die geen andere combinatie met dezelfde factoren vervangt, dan staat er `FOUT: … standaardcombinatie(s) ontbreken` in `warnings`. Voor elke set geeft ook een FOUT: een blijvend belastinggeval met factoren die niet bij een blijvende belasting passen (in de BGT anders dan 1,0), twee veranderlijke gevallen van dezelfde gebruikscategorie met verschillende factoren in één combinatie, een veranderlijke belasting die in geen UGT-combinatie overheerst (factor ten minste 1,35), en windgeneratorcombinaties die niet bij de gevallen en de gevolgklasse passen.",
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

fn schema_gevolgklasse() -> Value {
    json!({
        "type": "string",
        "enum": ["CC1", "CC2", "CC3"],
        "description": "Gevolgklasse volgens NEN-EN 1990 bijlage B. Bepaalt de partiële factoren van de STANDAARDcombinaties (NB tabel NB.4 voor CC2: 6.10b γ_G = 1,2 / γ_Q = 1,5; NB.5 voor CC1: 1,1 / 1,35 en CC3: 1,3 / 1,65) en gaat ter vermelding mee in `steel_check_inputs`. Geen invloed op meegegeven `combinations`. Uit een projectbestand telt de klasse uit de projectgegevens; staat die er niet in, dan deze `gevolgklasse`, en anders de klasse uit het kenmerk van de standaardcombinaties in het bestand. Ontbreekt alles: CC2, met een waarschuwing. K_FI wordt nergens nog eens op een uitkomst toegepast."
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
            "description": "Leest een opgeslagen .ifcfem2d-projectbestand en geeft het model, de combinaties en tellingen terug — zodat een constructeur op zijn eigen model kan laten rekenen in plaats van het over te typen. De combinaties zijn die waarmee `solve_fem_model` met `project_path` zou rekenen: ze gaan door dezelfde functie als het openen in de app, dus de standaardset van versie 0.3.11 en ouder, standaardcombinaties van een andere gevolgklasse en verouderde windgeneratorcombinaties komen vervangen terug, en een bestand zonder combinaties geeft de standaardset (`combinations_source` = \"bestand\" of \"standaard\"). `gevolgklasse` is de klasse waarvoor ze zijn opgesteld: uit de projectgegevens, anders uit het kenmerk van de standaardcombinaties in het bestand, anders CC2. Wat er vervangen is, een aangenomen klasse en elke FOUT in de combinatieset staan in `warnings`. Geef de combinaties ongewijzigd terug aan `solve_fem_model`, samen met die `gevolgklasse`. Alleen-lezen: er is geen tool die naar de schijf schrijft.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["path"],
                "properties": { "path": schema_project_path() }
            }
        }),
        json!({
            "name": "solve_fem_model",
            "description": "Rekent het model door met dezelfde solver die de app gebruikt en levert reacties, verplaatsingen en staafkrachten per belastinggeval, per combinatie en als omhullende. Eenheden kN, kNm, mm en rad; N positief = trek, z positief omhoog. Sluitstuk is `steel_check_inputs`: een lijst die ongewijzigd aan `check_steel_beam` kan worden gevoerd. Let op `cases_skipped_empty` — een belastinggeval zonder werkzame last wordt overgeslagen en zou anders als 'nul' lezen. Let ook op `combinations_skipped`: bij een zuivere staalconstructie waarin elke staaf overwegend verticaal staat zonder gekozen doorbuigingsklasse worden de ongewijzigde standaardcombinaties 6.15 (frequent) en 6.16 (quasi-blijvend) niet doorgerekend — de zijdelingse eis van NEN-EN 1990 A1.4.3(7) leest ze niet — en dat staat daar met reden vermeld. Krijgt een staaf de vloer- of dakeis (A1.4.3(3)/(4)), dan worden ze wel doorgerekend.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "description": "Geef precies één van `model` of `project_path`.",
                "properties": {
                    "model": schema_fem_model(),
                    "project_path": schema_project_path(),
                    "combinations": schema_combinations(),
                    "gevolgklasse": schema_gevolgklasse(),
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
            "description": "Doorrekenen EN toetsen in één aanroep: de solve loopt in dezelfde solver als de app, de toetsing in dezelfde Rust-kernen als de app. STAAL (EN 1993) staat in `results`, HOUT (EN 1995, EN 338 / EN 14080 zoals \"C24\" of \"GL28h\") in `timber_results` en KRUISLAAGHOUT (profiel \"CLT …\") in `clt_results`. Gebruik deze tool in plaats van solve_fem_model gevolgd door check_steel_beam / check_timber_beams — zo kan er geen veld tussenuit vallen. De toetsinvoer komt zichtbaar mee terug (`steel_check_inputs`, `timber_check_inputs`, `clt_check_inputs`) en kan ongewijzigd aan de losse toetstools worden gevoerd. Hout: k_mod volgt PER UGT-COMBINATIE uit de kortstdurende belasting erin (EN 1995-1-1 3.1.3(2), NB tabel 2.2: eigen gewicht blijvend, opslag lang, vloerbelasting middellang, sneeuw, wind en daken (categorie H) kort); `timber_check_inputs[].load_duration_per_combination` noemt per combinatie de klasse en de basis, en elk houtresultaat draagt `k_mod_per_load_duration` en `governing_combination_id`. Een opgegeven `checkConfig.loadDuration` werkt als ondergrens. BGT-combinaties die niet als 6.14b/6.15b/6.16b herkend worden, tellen bij staal en hout veilig-zijdig mee in de doorbuiging (melding in `warnings`). Beton wordt hier NIET getoetst en krijgt een verwijzing naar `check_concrete_beam`. Elke (gevraagde) staaf staat in precies één van `results`, `timber_results`, `clt_results` of `skipped_beams` (met reden) — nooit geen van beide en nooit dubbel. `governing` is de hoogste unity check over alle getoetste staven, met `material`; lees `skipped_beams` en de FOUT-regels in `warnings` altijd. PLATEN (wandschijven, altijd alle platen, `beam_ids` beperkt ze niet): de toetsinvoer staat in `plate_check_inputs` (zelfde vorm als `check_plates`), het resultaat per plaat in `plate_results` en de hoogste UC over de getoetste platen in `governing_plate`. Staal wordt getoetst met het vloeicriterium van NEN-EN 1993-1-1 6.2.1(5) per element (optionele plooi-invoer: begrensde EN 1993-1-5 §10(5a), met weigering voor trek, niet-uniforme velden en kolominteractie; zonder invoer blijft plooi niet getoetst); hout (massief en gelijmd gelamineerd) volgens NEN-EN 1995-1-1 6.1.2, 6.1.4, 6.1.5, 6.1.7 en 6.2.2 in de materiaalassen met k_mod per combinatie en de klimaatklasse van de plaat (`klimaatklasse`, ontbreekt = 1 met notitie); trek loodrecht op de vezel (6.1.3) is NIET toetsbaar en maakt de status NotApplicable waar hij optreedt. beton volgens NEN-EN 1992-1-1 bijlage F: benodigde wapening per richting (`wapening`, kN/m) en de betondrukdiagonaal (6.55)/(6.56), aanwezige wapening NIET getoetst (status NotApplicable waar wapening nodig is). Kruislaaghout en vrij materiaal komen terug met `geweigerd` en een reden, een plaat zonder (bruikbaar) materiaal staat met reden in `skipped_plates`. Elke plaat staat in `plate_check_inputs` of in `skipped_plates`.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "description": "Geef precies één van `model` of `project_path`.",
                "properties": {
                    "model": schema_fem_model(),
                    "project_path": schema_project_path(),
                    "combinations": schema_combinations(),
                    "gevolgklasse": schema_gevolgklasse(),
                    "bijlage": schema_bijlage_verzoek(),
                    "nonlinear": { "type": "boolean", "default": false,
                        "description": "Tweede orde (P-Delta). Uit een projectbestand telt de keuze uit dat bestand." },
                    "timeout_s": { "type": "integer", "minimum": 1, "maximum": 600, "default": 60,
                        "description": "Klok voor deze aanroep; bij overschrijding komt er geen gedeeltelijk resultaat terug." },
                    "check_config": {
                        "type": "object",
                        "additionalProperties": false,
                        "description": "Toetsinstellingen per staaf-id (sleutel = het id als tekst), samengevoegd over de `checkConfig` van die staaf. Ontbreekt een staaf, dan gelden de defaults van de app. De staalsoort staat NIET hier maar in `material` van de staaf. Gekeurd met dezelfde veldpoort als `checkConfig` in het model: een onbekend veld of een nummer dat geen staaf is, geeft een invoerfout.",
                        "patternProperties": { "^[0-9]+$": schema_checkconfig() }
                    },
                    "beam_ids": { "type": "array", "items": { "type": "integer" },
                        "description": "Beperk de toetsing tot deze staven. Leeg of afwezig = alle staven (staal, hout en kruislaaghout). Een nummer dat geen staaf in het model is, staat in `skipped_beams` met de reden \"bestaat niet in het model\"." }
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
            "scheefstandBron", "scheefstandHoogteM", "scheefstandAantalElementen",
        ] {
            assert!(velden.contains_key(veld), "modelschema mist `{veld}`");
        }
        assert_eq!(velden.len(), 13, "modelschema kent een veld dat de sidecar weigert");
        assert_eq!(model["additionalProperties"], json!(false));
    }

    /// De randknopen van een meshcache zijn verplicht: zonder `edgeNodeIndices`
    /// vindt geen randlast, randpuntlast of staafaansluiting zijn rand, en de
    /// sidecar weigert zo'n cache daarom. Het schema mag hem dus niet als
    /// optioneel aanbieden (dat deed het tot september 2026).
    #[test]
    fn meshcache_eist_randknopen() {
        let cache = schema_meshcache();
        let verplicht: Vec<&str> = cache["required"]
            .as_array()
            .expect("required")
            .iter()
            .filter_map(Value::as_str)
            .collect();
        for veld in ["signature", "points", "triangles", "edgeNodeIndices"] {
            assert!(verplicht.contains(&veld), "meshCache.required mist `{veld}`: {verplicht:?}");
        }
    }

    /// `schema_checkconfig` is de spiegel van `CHECKCONFIG_VELDEN`, de veldpoort
    /// van de sidecar (`design-mockup/src/mcp/valideerModel.ts`). De lijst wordt
    /// uit dat bronbestand gelezen, dus een veld dat aan één kant bijkomt valt
    /// hier op. Zo liep het uit elkaar: de UI schreef `ltbSupportSpacing_m`
    /// weg, de houtbouwer las hem, maar poort en schema kenden hem niet.
    #[test]
    fn schema_checkconfig_spiegelt_de_veldpoort_van_de_sidecar() {
        let pad = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../design-mockup/src/mcp/valideerModel.ts");
        let bron = std::fs::read_to_string(&pad)
            .unwrap_or_else(|e| panic!("{} niet leesbaar: {e}", pad.display()));
        let start = bron
            .find("const CHECKCONFIG_VELDEN = [")
            .expect("CHECKCONFIG_VELDEN staat niet (meer) in valideerModel.ts");
        let rest = &bron[start..];
        let blok = &rest[..rest.find("] as const;").expect("CHECKCONFIG_VELDEN is niet gesloten")];
        let poort: std::collections::BTreeSet<String> = blok
            .lines()
            .skip(1)
            .filter(|l| !l.trim_start().starts_with("//"))
            .flat_map(|l| l.split('"').skip(1).step_by(2).map(str::to_owned).collect::<Vec<_>>())
            .collect();
        let schema: std::collections::BTreeSet<String> = schema_checkconfig()["properties"]
            .as_object()
            .expect("properties")
            .keys()
            .cloned()
            .collect();
        assert!(poort.contains("ltbSupportSpacing_m") && poort.len() >= 19, "{poort:?}");
        assert_eq!(schema, poort, "schema_checkconfig en CHECKCONFIG_VELDEN lopen uiteen");
        assert_eq!(schema_checkconfig()["additionalProperties"], json!(false));
        assert_eq!(
            schema_checkconfig()["properties"]["deflectionClass"]["enum"],
            json!(["floor", "floorBrittle", "roof", "cantilever", "custom"])
        );
    }

    /// `schema_beams` is de spiegel van `BEAM_VELDEN`, de staafpoort van de
    /// sidecar (`design-mockup/src/mcp/valideerModel.ts`). Dezelfde bewaking
    /// als bij `schema_checkconfig`: een veld dat aan één kant bijkomt
    /// (september 2026: `profileEnd` voor verlopende profielen) valt hier op,
    /// zodat het schema nooit een veld belooft dat de poort weigert of
    /// andersom.
    #[test]
    fn schema_beams_spiegelt_de_staafpoort_van_de_sidecar() {
        let pad = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../design-mockup/src/mcp/valideerModel.ts");
        let bron = std::fs::read_to_string(&pad)
            .unwrap_or_else(|e| panic!("{} niet leesbaar: {e}", pad.display()));
        let start = bron
            .find("const BEAM_VELDEN = [")
            .expect("BEAM_VELDEN staat niet (meer) in valideerModel.ts");
        let rest = &bron[start..];
        let blok = &rest[..rest.find("] as const;").expect("BEAM_VELDEN is niet gesloten")];
        let poort: std::collections::BTreeSet<String> = blok
            .lines()
            .skip(1)
            .filter(|l| !l.trim_start().starts_with("//"))
            .flat_map(|l| l.split('"').skip(1).step_by(2).map(str::to_owned).collect::<Vec<_>>())
            .collect();
        let items = &schema_beams()["items"];
        let schema: std::collections::BTreeSet<String> = items["properties"]
            .as_object()
            .expect("properties")
            .keys()
            .cloned()
            .collect();
        assert!(poort.contains("profileEnd") && poort.contains("profile"), "{poort:?}");
        assert_eq!(schema, poort, "schema_beams en BEAM_VELDEN lopen uiteen");
        assert_eq!(items["additionalProperties"], json!(false));
    }

    /// `schema_plates` en `schema_meshcache` zijn de spiegel van `PLATE_VELDEN`
    /// en `MESHCACHE_VELDEN`, de plaatpoort van de sidecar
    /// (`design-mockup/src/mcp/valideerModel.ts`). Dezelfde bewaking als bij
    /// de staven: een veld dat aan één kant bijkomt (september 2026:
    /// `meshType`, `openingen`, `quads`, `meshSoort`, `openingEdgeNodeIndices`)
    /// valt hier op, zodat het schema nooit een veld belooft dat de poort
    /// weigert of andersom.
    #[test]
    fn schema_plates_en_meshcache_spiegelen_de_plaatpoort_van_de_sidecar() {
        let pad = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../design-mockup/src/mcp/valideerModel.ts");
        let bron = std::fs::read_to_string(&pad)
            .unwrap_or_else(|e| panic!("{} niet leesbaar: {e}", pad.display()));
        let poort = |naam: &str| -> std::collections::BTreeSet<String> {
            let start = bron
                .find(&format!("const {naam} = ["))
                .unwrap_or_else(|| panic!("{naam} staat niet (meer) in valideerModel.ts"));
            let rest = &bron[start..];
            let blok = &rest[..rest.find("] as const;").unwrap_or_else(|| panic!("{naam} is niet gesloten"))];
            // GEEN `.skip(1)` hier: `OPENING_VELDEN` staat op ÉÉN regel
            // (`const OPENING_VELDEN = ["id", "punten"] as const;`), en de eerste
            // regel overslaan gaf daar een LEGE verzameling — de spiegeltest
            // zou dan een lijst vergelijken met niets. Bij een lijst over
            // meerdere regels bevat de openingsregel geen aanhalingstekens en
            // levert hij vanzelf niets op, dus dit werkt voor beide vormen.
            blok.lines()
                .filter(|l| !l.trim_start().starts_with("//"))
                .flat_map(|l| l.split('"').skip(1).step_by(2).map(str::to_owned).collect::<Vec<_>>())
                .collect()
        };
        let sleutels = |v: &Value| -> std::collections::BTreeSet<String> {
            v["properties"].as_object().expect("properties").keys().cloned().collect()
        };
        let platen = &schema_plates()["items"];
        assert_eq!(sleutels(platen), poort("PLATE_VELDEN"), "schema_plates en PLATE_VELDEN lopen uiteen");
        let plooi = &platen["properties"]["plooi"];
        assert_eq!(sleutels(plooi), poort("PLOOI_VELDEN"));
        assert_eq!(plooi["additionalProperties"], false);
        assert_eq!(platen["additionalProperties"], json!(false));
        assert_eq!(platen["properties"]["meshType"]["enum"], json!(["driehoeken", "vierhoeken"]));
        let cache = schema_meshcache();
        assert_eq!(sleutels(&cache), poort("MESHCACHE_VELDEN"), "schema_meshcache en MESHCACHE_VELDEN lopen uiteen");
        assert_eq!(cache["additionalProperties"], json!(false));
        let opening = &schema_openingen()["items"];
        assert_eq!(sleutels(opening), poort("OPENING_VELDEN"), "schema_openingen en OPENING_VELDEN lopen uiteen");
        assert_eq!(opening["additionalProperties"], json!(false));
    }

    /// `schema_loads` is de spiegel van `LOAD_VELDEN`, de lastpoort van de
    /// sidecar. Zonder deze test kon een lastveld aan één kant bijkomen
    /// (september 2026: `openingId`, het adres van een last op een
    /// OPENINGSRAND) en beloofde het schema iets dat de poort weigerde — of
    /// weigerde de poort iets wat het schema niet noemde. Beide gevallen zijn
    /// stille wegval: de last verdwijnt of de aanroep struikelt zonder dat het
    /// schema uitlegt waarom.
    #[test]
    fn schema_loads_spiegelt_de_lastpoort_van_de_sidecar() {
        let pad = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../design-mockup/src/mcp/valideerModel.ts");
        let bron = std::fs::read_to_string(&pad)
            .unwrap_or_else(|e| panic!("{} niet leesbaar: {e}", pad.display()));
        let start = bron
            .find("const LOAD_VELDEN = [")
            .expect("LOAD_VELDEN staat niet (meer) in valideerModel.ts");
        let rest = &bron[start..];
        let blok = &rest[..rest.find("] as const;").expect("LOAD_VELDEN is niet gesloten")];
        let poort: std::collections::BTreeSet<String> = blok
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .flat_map(|l| l.split('"').skip(1).step_by(2).map(str::to_owned).collect::<Vec<_>>())
            .collect();
        let items = &schema_loads()["items"];
        let schema: std::collections::BTreeSet<String> = items["properties"]
            .as_object()
            .expect("properties")
            .keys()
            .cloned()
            .collect();
        assert!(poort.contains("openingId"), "{poort:?}");
        assert_eq!(schema, poort, "schema_loads en LOAD_VELDEN lopen uiteen");
        assert_eq!(items["additionalProperties"], json!(false));
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

    // ── meld_niet_getoetste_staven ─────────────────────────────────────────
    //
    // Het end-to-end-gedrag staat in `tests/beton_in_check_fem_model.rs` en
    // `tests/hout_in_check_fem_model.rs`. Deze tests dekken de randen die daar
    // niet langskomen en hebben geen Node nodig.

    fn model_met(materiaal: &str) -> Value {
        json!({ "beams": [ { "id": 5, "from": 1, "to": 2, "material": materiaal } ] })
    }

    fn reden_van(uit: &Value, id: i64) -> String {
        uit["skipped_beams"]
            .as_array()
            .and_then(|l| l.iter().find(|s| s["beam_id"] == json!(id)))
            .and_then(|s| s["reason"].as_str())
            .unwrap_or("")
            .to_owned()
    }

    fn gemelde_ids(uit: &Value) -> Vec<i64> {
        uit["skipped_beams"]
            .as_array()
            .map(|l| l.iter().filter_map(|s| s["beam_id"].as_i64()).collect())
            .unwrap_or_default()
    }

    /// Een staaf die al getoetst is of al gemeld staat, wordt niet nóg een keer
    /// gemeld: dubbel melden leest als twee staven.
    #[test]
    fn een_al_verantwoorde_staaf_wordt_niet_dubbel_gemeld() {
        let model = model_met("C30/37");

        let mut al_getoetst = json!({ "steel_check_inputs": [ { "beam_id": 5 } ] });
        meld_niet_getoetste_staven(&mut al_getoetst, Some(&model), None, false);
        assert!(gemelde_ids(&al_getoetst).is_empty());

        let mut al_gemeld = json!({
            "steel_check_inputs": [],
            "skipped_beams": [ { "beam_id": 5, "reason": "andere reden" } ]
        });
        meld_niet_getoetste_staven(&mut al_gemeld, Some(&model), None, false);
        assert_eq!(gemelde_ids(&al_gemeld), vec![5]);
        assert_eq!(reden_van(&al_gemeld, 5), "andere reden", "de eerste reden blijft staan");
    }

    /// ELKE staaf die niet getoetst is wordt gemeld, en de reden volgt het
    /// materiaal. Beton alleen op de VOLLEDIGE klassenaam: "C30" en "C35" zijn
    /// houtsterkteklassen uit EN 338 en horen de houtreden te krijgen, net zoals
    /// `resolveSection` in de solverbundel ze als hout rekent.
    #[test]
    fn elke_niet_getoetste_staaf_wordt_gemeld_met_de_reden_van_zijn_materiaal() {
        for materiaal in ["C30/37", "c30/37", " C30/37 ", "C90/105"] {
            let mut uit = json!({ "steel_check_inputs": [] });
            meld_niet_getoetste_staven(&mut uit, Some(&model_met(materiaal)), None, false);
            assert_eq!(gemelde_ids(&uit), vec![5], "`{materiaal}`");
            assert!(
                reden_van(&uit, 5).contains("check_concrete_beam"),
                "`{materiaal}` is beton: {}",
                reden_van(&uit, 5)
            );
        }
        // Hout komt hier alleen nog als vangnet: de bundel levert
        // `timber_check_inputs`, en een houten staaf die daar ontbreekt is
        // alleen onverklaard bij een OUDE bundel (`hout_ondersteund` = false).
        // De reden zegt dan dat de bundel het niet kan, en niet dat het model
        // geen hout had.
        for materiaal in ["C24", "GL28h", "C30", "C35"] {
            let mut uit = json!({ "steel_check_inputs": [] });
            meld_niet_getoetste_staven(&mut uit, Some(&model_met(materiaal)), None, false);
            assert_eq!(gemelde_ids(&uit), vec![5], "`{materiaal}`");
            let r = reden_van(&uit, 5);
            assert!(
                r.contains("solverbundel") && r.contains("check_timber_beams") && !r.contains("check_concrete_beam"),
                "`{materiaal}` is hout, oude bundel: {r}"
            );
            let mut nieuw = json!({ "steel_check_inputs": [], "timber_check_inputs": [], "clt_check_inputs": [] });
            meld_niet_getoetste_staven(&mut nieuw, Some(&model_met(materiaal)), None, true);
            assert!(
                reden_van(&nieuw, 5).contains("NIET getoetst"),
                "`{materiaal}` zonder houtinvoer bij een nieuwe bundel: {}",
                reden_van(&nieuw, 5)
            );
        }
        // Een houten staaf in de houtinvoer is verantwoord en wordt niet gemeld.
        let mut getoetst = json!({ "steel_check_inputs": [], "timber_check_inputs": [ { "beam_id": 5 } ], "clt_check_inputs": [] });
        meld_niet_getoetste_staven(&mut getoetst, Some(&model_met("C24")), None, true);
        assert!(gemelde_ids(&getoetst).is_empty(), "{getoetst}");
        for materiaal in ["S235", "", "VRIJ:Natuursteen E=60000 rho=2700 f=8", "onzin"] {
            let mut uit = json!({ "steel_check_inputs": [] });
            meld_niet_getoetste_staven(&mut uit, Some(&model_met(materiaal)), None, false);
            assert_eq!(
                gemelde_ids(&uit),
                vec![5],
                "`{materiaal}`: ook een staaf zonder herkend materiaal mag niet spoorloos zijn"
            );
            assert!(reden_van(&uit, 5).contains("NIET getoetst") || reden_van(&uit, 5).contains("niet getoetst"));
        }
    }

    /// Een gevraagd nummer dat geen staaf in het model is, staat met reden in
    /// `skipped_beams` — één keer, ook als het dubbel gevraagd is of als de
    /// bundel het al meldde. Gemeten vóór deze regel: `beam_ids` [1, 99] gaf
    /// staaf 1 en zweeg over 99.
    #[test]
    fn een_gevraagd_nummer_dat_niet_bestaat_staat_in_skipped_beams() {
        let model = model_met("S235");

        let mut uit = json!({ "steel_check_inputs": [ { "beam_id": 5 } ] });
        meld_niet_getoetste_staven(&mut uit, Some(&model), Some(&[5, 99, 99]), false);
        assert_eq!(gemelde_ids(&uit), vec![99], "{uit}");
        assert!(
            reden_van(&uit, 99).starts_with("bestaat niet in het model"),
            "{}",
            reden_van(&uit, 99)
        );

        let mut al_gemeld = json!({
            "steel_check_inputs": [],
            "skipped_beams": [ { "beam_id": 99, "reason": "bestaat niet in het model (bundel)" } ]
        });
        meld_niet_getoetste_staven(&mut al_gemeld, Some(&model), Some(&[99]), false);
        assert_eq!(gemelde_ids(&al_gemeld), vec![99], "niet dubbel: {al_gemeld}");

        // Zonder selectie is er niets gevraagd, dus ook niets dat niet bestaat.
        let mut alles = json!({ "steel_check_inputs": [ { "beam_id": 5 } ] });
        meld_niet_getoetste_staven(&mut alles, Some(&model), None, false);
        assert!(gemelde_ids(&alles).is_empty(), "{alles}");
    }

    /// Zonder model gebeurt er niets. Dat pad ontstaat als `check_fem_model`
    /// zowel `model` als `project_path` kreeg (dan weigert `model_payload` al
    /// eerder) of als het projectbestand niet te ontleden was — in dat laatste
    /// geval meldt de solve zelf de fout, met meer detail dan hier mogelijk is.
    #[test]
    fn zonder_model_verandert_er_niets() {
        let mut uit = json!({ "steel_check_inputs": [] });
        let voor = uit.clone();
        meld_niet_getoetste_staven(&mut uit, None, None, false);
        assert_eq!(uit, voor);
    }
}
