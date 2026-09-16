//! timber_tools.rs — hout en kruislaaghout (NEN-EN 1995-1-1) als MCP-tools.
//!
//! DE DERDE WEG
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn,
//! anders werkt hij maar in één omgeving:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. deze MCP-server.
//!
//! Voor hout bestonden alleen de eerste twee. Dit bestand is de derde. Dat het
//! ontbrak was extra scheef omdat `generate_steel_report_pdf` hiernaast wél
//! `timber_check_results` accepteert: de rapportweg beloofde een houtrapport
//! dat langs deze weg niet te maken was.
//!
//! Er wordt hier niet gerekend. Elke tool leest zijn invoertype, roept dezelfde
//! functie uit `timber_check` aan als de andere twee wegen en geeft het
//! resultaat door. Een tweede rekenimplementatie zou betekenen dat dezelfde
//! doorsnede twee plausibele antwoorden kan geven, en dat is bij constructieve
//! software een veiligheidsprobleem.
//!
//! DE NAMEN — HIER MEERVOUD
//! `list_timber_grades`, `check_timber_beams`, `list_clt_presets` en
//! `check_clt_beams` heten precies zoals het Tauri-command en de
//! toetsbrug-opdracht, meervoud inbegrepen, en nemen net als die twee een
//! LIJST staven onder de sleutel `inputs`. Dat wijkt af van `check_steel_beam`
//! en `check_concrete_beam` hiernaast, die in het enkelvoud staan en één staaf
//! nemen. Die twee zijn zo ontstaan voordat de kern een batch-instap had;
//! sindsdien schreef elke schil zijn eigen lus over de staven. Hout krijgt die
//! lus niet: alle drie de wegen lopen door
//! `timber_check::check_all_timber_beams` respectievelijk
//! `timber_check::clt::check_all_clt_beams`, zodat er geen plek is waar de
//! volgorde of de volledigheid van de lijst per omgeving kan gaan afwijken.
//! `tests/drie_wegen_kruistabel.rs` houdt de drie namenlijsten met een
//! zichtbare koppeltabel tegen elkaar aan, juist omdat de namen niet overal
//! gelijk zijn.
//!
//! DE LIJSTTOOLS ZIJN INGEPAKT
//! `list_timber_grades` en `list_clt_presets` leveren hun lijst in een object
//! (`{ "grades": [...] }` / `{ "presets": [...] }`) omdat `structuredContent`
//! in het MCP-antwoord een object moet zijn. Dat is dezelfde keuze als bij
//! `list_steel_grades` en de betonlijsten. De lijst binnen dat object is
//! byte-voor-byte wat de andere twee wegen kaal teruggeven. Om dezelfde reden
//! komen de toetsresultaten terug als `{ "results": [...] }`.
//!
//! DE SCHEMA'S ZIJN STRIKT — EN DAT IS WAAR TE MAKEN
//! `TimberBeamCheckInput`, `CltBeamCheckInput`, `CltLayup` en `CltLayer` staan
//! op `#[serde(deny_unknown_fields)]`, net als `BeamCheckInput` en
//! `ConcreteBeamCheckInput`. Tot september 2026 was dat niet zo: een tikfout in
//! een veldnaam werd door de kern stil genegeerd en het veld viel op zijn
//! standaardwaarde terug (gemeten: `kcr` in plaats van `k_cr` gaf een
//! dwarskracht-UC van 1,066 in plaats van 1,591). Nu weigert de kern zo'n veld,
//! en daarom zetten de schema's hieronder `additionalProperties` op `false` —
//! het schema belooft precies wat de server doet. Omdat `false` elk veld dat
//! het schema NIET noemt uitsluit, moet elk veld van het invoertype erin staan;
//! `custom_section` ontbrak en staat er nu bij. Elk veld met een
//! standaardwaarde is benoemd, met de kant waarop die standaard uitwerkt. Het
//! omhulsel (`{ "inputs": [...] }`) was al strikt.

use serde::Deserialize;
use serde_json::{json, Value};

use crate::RpcError;

/// De vier houttools. Eén lijst, gebruikt door `is_timber_tool`, de schema's en
/// de dispatch — zodat een tool niet in `tools/list` kan staan zonder
/// afhandeling, of andersom.
pub const TIMBER_TOOLS: [&str; 4] = [
    "list_timber_grades",
    "check_timber_beams",
    "list_clt_presets",
    "check_clt_beams",
];

pub fn is_timber_tool(naam: &str) -> bool {
    TIMBER_TOOLS.contains(&naam)
}

/// Het omhulsel van de twee toetstools: één sleutel `inputs` met de staven.
///
/// De sleutel heet `inputs` en niet `beams`, omdat de parameter van het
/// Tauri-command en het veld van het toetsbrug-verzoek ook zo heten. Zo kan
/// dezelfde JSON langs alle drie de wegen zonder hernoemen — en een hernoeming
/// is precies het soort verschil dat pas in de app opvalt.
///
/// `deny_unknown_fields`: dit type staat hier en nergens anders, dus deze
/// strengheid is waar te maken. Een aanroep met `beams` in plaats van `inputs`
/// levert een fout op in plaats van een lege toetsing die als "geen staven,
/// dus niets mis" leest.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Staafinvoer<T> {
    inputs: Vec<T>,
}

// ── Dispatch ────────────────────────────────────────────────────────────────

pub async fn dispatch(naam: &str, args: Value) -> Result<Value, RpcError> {
    match naam {
        // De sterkteklassen komen uit `nen_en_1995_1_1::strength_class_names`,
        // dezelfde functie die het Tauri-command en de toetsbrug aanroepen; de
        // lijst wordt hier niet opnieuw samengesteld.
        "list_timber_grades" => Ok(json!({ "grades": nen_en_1995_1_1::strength_class_names() })),
        "check_timber_beams" => {
            let args: Staafinvoer<timber_check::TimberBeamCheckInput> =
                serde_json::from_value(args)
                    .map_err(|e| RpcError::invalid_params(format!("TimberBeamCheckInput: {e}")))?;
            // Blokkerend werk: per staaf lopen er zeven doorsnede- en
            // stabiliteitstoetsen langs, en een raamwerk levert er tientallen
            // tegelijk aan. Op de stdio-lus zou dat de lezer laten stilstaan.
            let uit = tokio::task::spawn_blocking(move || {
                timber_check::check_all_timber_beams(args.inputs)
            })
            .await
            .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?;
            serde_json::to_value(uit)
                .map(|v| json!({ "results": v }))
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        // De voorinstellingen komen uit `nen_en_1995_1_1::clt::clt_presets`,
        // dezelfde functie als bij de andere twee wegen.
        "list_clt_presets" => Ok(json!({ "presets": nen_en_1995_1_1::clt::clt_presets() })),
        "check_clt_beams" => {
            let args: Staafinvoer<timber_check::clt::CltBeamCheckInput> =
                serde_json::from_value(args)
                    .map_err(|e| RpcError::invalid_params(format!("CltBeamCheckInput: {e}")))?;
            // Blokkerend werk: per staaf wordt de opbouw doorgerekend en krijgt
            // elke lamel zijn eigen toetsen.
            let uit = tokio::task::spawn_blocking(move || {
                timber_check::clt::check_all_clt_beams(args.inputs)
            })
            .await
            .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?;
            serde_json::to_value(uit)
                .map(|v| json!({ "results": v }))
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        _ => Err(RpcError::method_not_found(naam)),
    }
}

// ── Schema's ────────────────────────────────────────────────────────────────

fn schema_klimaatklasse() -> Value {
    json!({
        "type": "string",
        "enum": ["Sc1", "Sc2", "Sc3"],
        "description": "Klimaatklasse volgens §2.3.1.3. Bepaalt samen met de belastingduurklasse k_mod (tabel 3.1) en met het materiaaltype k_def (tabel 3.2)."
    })
}

fn schema_belastingduur() -> Value {
    json!({
        "type": "string",
        "enum": ["Permanent", "LongTerm", "MediumTerm", "ShortTerm", "Instantaneous"],
        "description": "Belastingduurklasse (§2.3.1.2). §3.1.3(2): de KORTST durende belasting in een combinatie bepaalt k_mod, dus een klasse die te lang is gekozen maakt de toets ongunstiger en een die te kort is gekozen gunstiger. LET OP: zonder `load_duration_per_combination` geldt deze ene klasse voor ALLE combinaties — dan wordt de combinatie met alleen de blijvende belasting NIET met k_mod 'blijvend' getoetst. Met die lijst is dit alleen de terugval voor een combinatie die er niet in staat."
    })
}

/// `load_duration_per_combination` (`CombinationLoadDuration`), gedeeld door
/// de houten staaf en de CLT-staaf.
fn schema_belastingduur_per_combinatie() -> Value {
    json!({
        "type": "array",
        "default": [],
        "description": "De belastingduurklasse PER UGT-combinatie (EN 1995-1-1 3.1.3(2): de kortstdurende belasting in die combinatie bepaalt k_mod). Gevuld: de kern groepeert `forces_envelope` per klasse, toetst elke klasse met haar eigen k_mod en neemt per toets de hoogste unity check; het resultaat draagt `k_mod_per_load_duration` en `governing_combination_id`, en elke sterktetoets noemt zijn k_mod in de notities. Leeg of weggelaten: één klasse (`load_duration`) voor alles. `check_fem_model` vult deze lijst zelf uit de belastinggevallen (NB tabel 2.2).",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["combination_id", "load_duration"],
            "properties": {
                "combination_id": { "type": "integer", "minimum": 0,
                    "description": "Id van de UGT-combinatie, gelijk aan `combination_id` in `forces_envelope`." },
                "load_duration": { "type": "string",
                    "enum": ["Permanent", "LongTerm", "MediumTerm", "ShortTerm", "Instantaneous"],
                    "description": "De kortste belastingsduur in deze combinatie." },
                "basis": { "type": "string",
                    "description": "Waarop de klasse berust, leesbaar voor het rapport. Weglaten mag." }
            }
        }
    })
}

/// De doorbuigingsvelden en de kipinvoer van één houten staaf; ze staan apart
/// omdat er zoveel standaardwaarden bij zitten dat ze in de tooldefinitie
/// onleesbaar zouden worden.
fn schema_houten_staaf() -> Value {
    json!({
        "type": "object",
        // Zie de moduletoelichting: `TimberBeamCheckInput` staat op
        // `deny_unknown_fields`, dus het schema mag (en moet) even streng zijn.
        "additionalProperties": false,
        "description": "Eén houten staaf met een rechthoekige doorsnede b x h, of een samengestelde doorsnede via 'custom_section'. Een onbekende veldnaam wordt geweigerd (ook een tikfout in een optioneel veld): de toetsing loopt dan niet stil door met een standaardwaarde.",
        "properties": {
            "bijlage": crate::schema_bijlage(),
            "beam_id": { "type": "integer", "minimum": 0,
                "description": "Staafnummer; komt onveranderd terug in het resultaat." },
            "width_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Doorsnedebreedte b in mm. Bij 'custom_section' de omhullende breedte; de toetsing rekent dan met de grootheden uit die doorsnede." },
            "height_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Doorsnedehoogte h in mm; de buiging gaat om de sterke as." },
            "custom_section": crate::schema_custom_section(),
            "strength_class": { "type": "string",
                "description": "Sterkteklasse, bijvoorbeeld \"C24\" (EN 338) of \"GL28h\" (EN 14080). Zie `list_timber_grades`. Een onbekende naam levert een resultaat met 'governing_check_id' = \"ERROR: …\" en géén toetsen." },
            "service_class": schema_klimaatklasse(),
            "load_duration": schema_belastingduur(),
            "load_duration_per_combination": schema_belastingduur_per_combinatie(),
            "length_m": { "type": "number",
                "description": "Staaflengte in m; noemer van de doorbuigingseis en terugvalwaarde voor de kipsteunafstand." },
            "forces_envelope": crate::schema_krachtenomhullende(),
            "buckling_length_y_m": { "type": "number", "default": 0,
                "description": "Kniklengte om de sterke y-as in m (§6.3.2): knik IN het vlak van het model. 0 (of weglaten) = niet opgegeven; de kern houdt dan de staaflengte aan en zet in de kolomtoets dat die lengte een terugval is." },
            "buckling_length_z_m": { "type": "number", "default": 0,
                "description": "Kniklengte om de zwakke z-as in m (§6.3.2): knik UIT het vlak van het model, een richting die de raamwerkberekening nooit ziet. 0 (of weglaten) = niet opgegeven; de kern leidt L_cr,z dan af uit 'lateral_bracing', maar ALLEEN op plaatsen waar een steun aan de boven- EN aan de onderrand zit (binnen 1 mm). Anders de staaflengte. De gebruikte waarde en haar herkomst staan in de kolomtoets en in de drukterm van de kiptoets." },
            "lateral_bracing": {
                "type": "object",
                "additionalProperties": false,
                "description": "Zijdelingse steunen als fracties van de staaflengte (0..1), per rand: 'top_flange_positions' = bovenrand, 'bottom_flange_positions' = onderrand. ALLEEN voor de kniklengte om de z-as (zie 'buckling_length_z_m'); de kiptoets gebruikt 'ltb_segment_length_m' en leidt uit deze posities niets af. Weglaten = geen steunen.",
                "required": ["top_flange_positions", "bottom_flange_positions"],
                "properties": {
                    "top_flange_positions":    { "type": "array", "items": { "type": "number" } },
                    "bottom_flange_positions": { "type": "array", "items": { "type": "number" } }
                }
            },
            "ltb_segment_length_m": { "type": "number", "default": 0,
                "description": "Kipsteunafstand in m voor tabel 6.1. 0 (of weglaten) = de staaflengte, en dat is de LANGSTE keuze en dus de ongunstigste." },
            "ltb_load_case": {
                "type": "string",
                "enum": ["ConstantMoment", "UniformLoad", "ConcentratedMidspan",
                         "CantileverUniform", "CantileverConcentratedEnd"],
                "default": "UniformLoad",
                "description": "Belastinggeval voor l_ef volgens tabel 6.1: l_ef/l = 1,0 bij \"ConstantMoment\", 0,9 bij \"UniformLoad\" (default), 0,8 bij \"ConcentratedMidspan\", 0,5 bij \"CantileverUniform\" en 0,8 bij \"CantileverConcentratedEnd\"."
            },
            "ltb_load_position": {
                "type": "string",
                "enum": ["CentreOfGravity", "CompressionEdge", "TensionEdge"],
                "default": "CentreOfGravity",
                "description": "Aangrijpingspunt van de belasting volgens de voetnoot bij tabel 6.1: \"CompressionEdge\" (drukzijde) telt 2h bij l_ef op, \"TensionEdge\" (trekzijde) trekt 0,5h eraf. Default \"CentreOfGravity\" doet geen van beide en is dus GUNSTIGER dan een last op de drukzijde."
            },
            "ltb_effective_length_override_m": { "type": "number", "default": 0,
                "description": "Expliciete effectieve kiplengte in m. 0 (of weglaten) = via tabel 6.1 berekenen. Gebruik dit alleen om een externe referentie-uitwerking na te rekenen die l_ef zelf voorschrijft." },
            "perform_ltb_check": { "type": "boolean", "default": true,
                "description": "Kiptoets §6.3.3 uitvoeren. Default true; op false zetten laat een toets WEG en kan de maatgevende unity check verbergen — doe dat alleen voor een staaf waarvoor kip aantoonbaar niet aan de orde is, zoals een kolom." },
            "k_cr": { "type": "number", "default": 1,
                "description": "Scheurfactor voor dwarskracht, (6.13a): b_ef = k_cr * b. Default 1,0; de in A1 aanbevolen waarde is 0,67. 1,0 geeft dus een GROTERE dwarskrachtweerstand dan die aanbeveling — laat dit veld niet per ongeluk weg als je met 0,67 wilt rekenen." },
            "load_sharing": { "type": "boolean", "default": false,
                "description": "Lastverdelend systeem aanwezig (§6.6): true geeft k_sys = 1,1 en dus HOGERE rekenwaarden. Default false (k_sys = 1,0)." },
            "deflection_inst_mm": { "type": "number", "default": 0,
                "description": "Zakking onder de karakteristieke BGT-combinatie in mm, met teken (negatief = omlaag). 0 betekent dat er geen doorbuiging wordt getoetst, niet dat de staaf niet doorbuigt." },
            "deflection_quasi_perm_mm": { "type": "number", "default": 0,
                "description": "Zakking onder de quasi-blijvende BGT-combinatie in mm; het kruipdeel k_def * w_qp van w_fin (§7.2). 0 laat de kruipterm vervallen en dat is GUNSTIGER." },
            "deflection_permanent_mm": { "type": "number", "default": 0,
                "description": "Zakking onder de blijvende BGT-combinatie in mm, voor w_add = w_fin - w_perm. 0 betekent w_add = w_fin, veilig-zijdig." },
            "deflection_limit_fin": { "type": "number", "exclusiveMinimum": 0, "default": 250,
                "description": "Noemer n in de eis L/n voor de eindzakking w_fin. Default 250, de NB-waarde." },
            "deflection_limit_add": { "type": "number", "exclusiveMinimum": 0, "default": 333,
                "description": "Noemer n in de eis L/n voor de bijkomende zakking w_add. Default 333, de NB-waarde." },
            "deflection_notes": { "type": "array", "items": { "type": "string" }, "default": [],
                "description": "Vrije toelichtingen bij de doorbuigingstoets; ze komen letterlijk in de 'notes' van de w_fin-regel van het resultaat. Bedoeld om zichtbaar te maken uit welke combinatie 'deflection_quasi_perm_mm' komt — of dat die combinatie niet gevonden is en er op de volle last is teruggevallen." },
            "staaf_notities": { "type": "array", "items": { "type": "string" }, "default": [],
                "description": "Toelichtingen bij de staaf als geheel; rekenen nergens mee en komen letterlijk in de 'notes' van de kolomtoets (6.3.2), de kiptoets (6.3.3) en de eindzakking. De app en `check_fem_model` zetten hier dat een door tussenknopen geknipte staaf als één doorgaande lijn is getoetst, over welke lengte, en welke tussenknopen niet als steun tellen. Weglaten = niets te melden." }
        },
        "required": [
            "beam_id", "width_mm", "height_mm", "strength_class",
            "service_class", "load_duration", "length_m", "forces_envelope"
        ]
    })
}

/// De opbouw van een CLT-plaatstrook (`CltLayup`): breedte plus de lagen van
/// boven naar beneden.
fn schema_opbouw() -> Value {
    json!({
        "type": "object",
        // `CltLayup` staat op `deny_unknown_fields`.
        "additionalProperties": false,
        "description": "De opbouw: een plaatstrook van 'width_mm' breed met haar lagen van BOVEN (index 0) naar beneden.",
        "properties": {
            "width_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Breedte van de beschouwde plaatstrook in mm; gebruikelijk 1000." },
            "layers": {
                "type": "array",
                "minItems": 1,
                "description": "De lagen van boven naar beneden. Een gebruikelijke opbouw wisselt lengte- en dwarslagen af en begint en eindigt met een lengtelaag; een dwarslaag als buitenlaag levert een melding op.",
                "items": {
                    "type": "object",
                    // `CltLayer` staat op `deny_unknown_fields`.
                    "additionalProperties": false,
                    "required": ["thickness_mm", "orientation", "strength_class"],
                    "properties": {
                        "thickness_mm": { "type": "number", "exclusiveMinimum": 0,
                            "description": "Laagdikte in mm." },
                        "orientation": {
                            "type": "string",
                            "enum": ["Longitudinal", "Transverse"],
                            "description": "Vezelrichting ten opzichte van de spanrichting. \"Longitudinal\" (lengtelaag) draagt buiging en dwarskracht met E = E_0,mean; \"Transverse\" (dwarslaag) telt in de spanrichting met E = 0 mee en ondervindt rolschuiving."
                        },
                        "strength_class": { "type": "string",
                            "description": "Sterkteklasse van de lamellen in deze laag, bijvoorbeeld \"C24\". Zie `list_timber_grades`; een onbekende naam maakt de hele opbouw niet-rekenbaar en levert een resultaat met 'governing_check_id' = \"ERROR: …\"." }
                    }
                }
            }
        },
        "required": ["width_mm", "layers"]
    })
}

/// Eén CLT-staaf (`CltBeamCheckInput`).
fn schema_clt_staaf() -> Value {
    json!({
        "type": "object",
        // Zelfde reden als bij `schema_houten_staaf`: `CltBeamCheckInput`
        // staat op `deny_unknown_fields`.
        "additionalProperties": false,
        "description": "Eén CLT-staaf (plaatstrook). Een onbekende veldnaam wordt geweigerd, ook in de opbouw en in een laag.",
        "properties": {
            "bijlage": crate::schema_bijlage(),
            "beam_id": { "type": "integer", "minimum": 0,
                "description": "Staafnummer; komt onveranderd terug in het resultaat." },
            "layup": schema_opbouw(),
            "service_class": schema_klimaatklasse(),
            "load_duration": schema_belastingduur(),
            "load_duration_per_combination": schema_belastingduur_per_combinatie(),
            "length_m": { "type": "number", "exclusiveMinimum": 0,
                "description": "Staaflengte in m. Wordt alleen gebruikt voor de slankheid L/h, die aangeeft of de aanname van een starre verbinding tussen de lagen nog opgaat; beneden L/h = 20 komt daarover een waarschuwing in de notities." },
            "forces_envelope": crate::schema_krachtenomhullende(),
            "k_cr": { "type": "number", "default": 1,
                "description": "Scheurfactor voor dwarskracht, (6.13a). Default 1,0, de NB-waarde voor prismatische doorsneden; een lagere waarde geeft een KLEINERE dwarskrachtweerstand." },
            "load_sharing": { "type": "boolean", "default": false,
                "description": "Lastverdelend systeem aanwezig (§6.6): true geeft k_sys = 1,1 en dus hogere rekenwaarden. Default false." }
        },
        "required": [
            "beam_id", "layup", "service_class", "load_duration",
            "length_m", "forces_envelope"
        ]
    })
}

/// Het omhulsel van een toetstool: `{ "inputs": [ <staaf>, … ] }`.
fn schema_invoerlijst(staaf: Value, wat: &str) -> Value {
    json!({
        "type": "object",
        // Dit omhulsel is `Staafinvoer` uit dit bestand, en dat type staat op
        // `deny_unknown_fields` — hier is de strengheid dus waar te maken.
        "additionalProperties": false,
        "properties": {
            "inputs": {
                "type": "array",
                "description": format!("{wat} De volgorde van de lijst is de volgorde van de resultaten."),
                "items": staaf
            }
        },
        "required": ["inputs"]
    })
}

/// De vier tooldefinities voor `tools/list`.
pub fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_timber_grades",
            "description": "List the timber strength classes the EN 1995-1-1 engine supports: the EN 338 softwood C-classes (C14 up to C35) followed by the EN 14080 homogeneous glulam GL-h classes (GL24h up to GL36h). Returns the class names only — the names accepted by `strength_class` in `check_timber_beams` and by `strength_class` of a CLT layer. Same list as the Tauri command and the toetsbrug opdracht of the same name, wrapped in a 'grades' object.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        }),
        json!({
            "name": "check_timber_beams",
            "description": "Run the EN 1995-1-1 (+C1+A1:2011/NB:2013) timber check on a list of rectangular b x h members: tension and compression parallel to the grain (§6.1), bending with k_m (§6.1.6), shear with k_cr (§6.1.7), column buckling (§6.3.2), lateral-torsional buckling (§6.3.3) and the deflection pair w_fin/w_add including creep k_def (§7.2). k_mod: `load_duration` applies to ALL combinations unless `load_duration_per_combination` gives the class per ULS combination (EN 1995-1-1 3.1.3(2), the shortest-duration load in a combination governs); without that list the permanent-only combination is NOT checked with k_mod 'Permanent'. `check_fem_model` builds the list from the load cases. Returns one TimberBeamCheckResult per member with the full derivation, in the order of the input list. Same input and output types as the Tauri command `check_timber_beams` and the toetsbrug opdracht of that name; all three run through `timber_check::check_all_timber_beams`. NOT included: compression perpendicular to the grain, notched members, connections, fire and vibration.",
            "inputSchema": schema_invoerlijst(
                schema_houten_staaf(),
                "De houten staven die getoetst moeten worden.",
            )
        }),
        json!({
            "name": "list_clt_presets",
            "description": "List the built-in cross-laminated-timber layups for the section picker: 3-, 5- and 7-layer symmetric build-ups with their layer thicknesses and total height. These are PRESETS with round 20/30/40 mm lamella thicknesses, not code values and not product dimensions — they are meant to be edited. Same list as the Tauri command and the toetsbrug opdracht of the same name, wrapped in a 'presets' object.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        }),
        json!({
            "name": "check_clt_beams",
            "description": "Check a list of cross-laminated-timber plate strips per lamella. EN 1995-1-1 has no CLT product, so the model is annex B with gamma_i = 1 (composite section, rigid bond): only the longitudinal layers carry in the span direction (E = E_0,mean), the transverse layers act as the shear connection (E = 0). Per layer it returns the edge stresses, the maximum shear stress, the design strengths and the unity checks for bending (§6.1.6) and shear (§6.1.7); transverse layers get their rolling-shear stress for information only, because f_v,rol is in neither the National Annex nor EN 338. The response also carries (EI)_ef, (EA)_ef, the neutral axis, the slenderness L/h and the assumptions as notes. Same input and output types as the Tauri command `check_clt_beams` and the toetsbrug opdracht of that name; all three run through `timber_check::clt::check_all_clt_beams`. NOT included: axial force, bending about the weak axis, buckling, lateral-torsional buckling and deflection §7.2 (table 3.2 has no k_def row for cross-laminated timber).",
            "inputSchema": schema_invoerlijst(
                schema_clt_staaf(),
                "De CLT-staven die getoetst moeten worden.",
            )
        }),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Elke gedefinieerde tool moet ook afgehandeld worden, en andersom. Een
    /// tool die in `tools/list` staat maar in de dispatch ontbreekt, meldt bij
    /// de client "onbekende methode" — een ondiagnosticeerbare storing.
    #[test]
    fn elke_gedefinieerde_tool_staat_in_de_namenlijst() {
        let definities = tool_definitions();
        assert_eq!(definities.len(), TIMBER_TOOLS.len());
        for def in &definities {
            let naam = def["name"].as_str().expect("naam");
            assert!(is_timber_tool(naam), "{naam} ontbreekt in TIMBER_TOOLS");
        }
    }

    /// Het omhulsel van de twee toetstools is strikt, en dat is waar te maken:
    /// `Staafinvoer` staat op `deny_unknown_fields`. Zou dit op `true` staan,
    /// dan zou een aanroep met `beams` in plaats van `inputs` een lege lijst
    /// opleveren, en een lege toetsing leest als "niets mis".
    #[test]
    fn het_omhulsel_van_de_toetstools_weigert_onbekende_sleutels() {
        for naam in ["check_timber_beams", "check_clt_beams"] {
            let def = tool_definitions()
                .into_iter()
                .find(|d| d["name"] == naam)
                .expect("de tool staat in de lijst");
            assert_eq!(
                def["inputSchema"]["additionalProperties"],
                json!(false),
                "{naam} laat onbekende argumenten toe"
            );
            assert_eq!(def["inputSchema"]["required"], json!(["inputs"]));
        }
    }

    /// De twee lijsttools nemen geen argumenten, gelijk aan `list_steel_grades`
    /// en de betonlijsten.
    #[test]
    fn de_lijsttools_nemen_geen_argumenten() {
        for naam in ["list_timber_grades", "list_clt_presets"] {
            let def = tool_definitions()
                .into_iter()
                .find(|d| d["name"] == naam)
                .expect("de tool staat in de lijst");
            assert_eq!(def["inputSchema"]["additionalProperties"], json!(false));
            assert_eq!(
                def["inputSchema"]["properties"],
                json!({}),
                "{naam} belooft argumenten die de dispatch niet leest"
            );
        }
    }

    /// Het staafschema is de spiegel van `TimberBeamCheckInput`. De lijst
    /// hieronder is met de hand overgetypt uit `timber-check/src/input.rs` —
    /// juist daarom vangt hij een wijziging aan één van beide kanten. Een veld
    /// dat hier ontbreekt is voor een client onvindbaar en valt in de kern
    /// stilzwijgend op zijn standaardwaarde terug; dat is bij `k_cr` de
    /// ongunstige kant op.
    #[test]
    fn het_staafschema_kent_alle_velden_van_het_invoertype() {
        let def = tool_definitions()
            .into_iter()
            .find(|d| d["name"] == "check_timber_beams")
            .expect("de tool staat in de lijst");
        let velden = def["inputSchema"]["properties"]["inputs"]["items"]["properties"]
            .as_object()
            .expect("properties");
        // `additionalProperties: false` spiegelt `deny_unknown_fields`; daardoor
        // is een veld dat hier ontbreekt voor een client niet eens meer op te
        // geven.
        assert_eq!(
            def["inputSchema"]["properties"]["inputs"]["items"]["additionalProperties"],
            json!(false),
            "het houten staafschema moet onbekende velden weigeren, net als de kern"
        );
        let verwacht = [
            // De nationale bijlage waarmee getoetst wordt (normnaad, september
            // 2026): zij bepaalt gamma_M, k_cr en de doorbuigingsnoemers.
            "bijlage",
            "beam_id",
            "width_mm",
            "height_mm",
            "custom_section",
            "strength_class",
            "service_class",
            "load_duration",
            "load_duration_per_combination",
            "length_m",
            "forces_envelope",
            "buckling_length_y_m",
            "buckling_length_z_m",
            "lateral_bracing",
            "ltb_segment_length_m",
            "ltb_load_case",
            "ltb_load_position",
            "ltb_effective_length_override_m",
            "perform_ltb_check",
            "k_cr",
            "load_sharing",
            "deflection_inst_mm",
            "deflection_quasi_perm_mm",
            "deflection_permanent_mm",
            "deflection_limit_fin",
            "deflection_limit_add",
            "deflection_notes",
            "staaf_notities",
        ];
        for v in verwacht {
            assert!(velden.contains_key(v), "het staafschema mist `{v}`");
        }
        assert_eq!(
            velden.len(),
            verwacht.len(),
            "het staafschema kent een veld dat het invoertype niet heeft"
        );
        // De verplichte velden zijn precies die zonder `#[serde(default)]`.
        let verplicht: Vec<&str> = def["inputSchema"]["properties"]["inputs"]["items"]["required"]
            .as_array()
            .expect("required")
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(
            verplicht,
            vec![
                "beam_id",
                "width_mm",
                "height_mm",
                "strength_class",
                "service_class",
                "load_duration",
                "length_m",
                "forces_envelope"
            ]
        );
    }

    /// Het CLT-schema is de spiegel van `CltBeamCheckInput` en `CltLayup`.
    #[test]
    fn het_clt_schema_kent_alle_velden_van_het_invoertype() {
        let def = tool_definitions()
            .into_iter()
            .find(|d| d["name"] == "check_clt_beams")
            .expect("de tool staat in de lijst");
        let staaf = &def["inputSchema"]["properties"]["inputs"]["items"];
        // Alle drie de niveaus staan op `deny_unknown_fields` in de kern.
        assert_eq!(staaf["additionalProperties"], json!(false), "CLT-staaf");
        assert_eq!(staaf["properties"]["layup"]["additionalProperties"], json!(false), "opbouw");
        assert_eq!(
            staaf["properties"]["layup"]["properties"]["layers"]["items"]["additionalProperties"],
            json!(false),
            "laag"
        );
        let velden = staaf["properties"].as_object().expect("properties");
        let verwacht = [
            // Zie het staafschema hierboven: de bijlage reist mee.
            "bijlage",
            "beam_id",
            "layup",
            "service_class",
            "load_duration",
            "load_duration_per_combination",
            "length_m",
            "forces_envelope",
            "k_cr",
            "load_sharing",
        ];
        for v in verwacht {
            assert!(velden.contains_key(v), "het CLT-schema mist `{v}`");
        }
        assert_eq!(velden.len(), verwacht.len());

        let opbouw = &velden["layup"];
        let opbouwvelden = opbouw["properties"].as_object().expect("layup.properties");
        for v in ["width_mm", "layers"] {
            assert!(opbouwvelden.contains_key(v), "de opbouw mist `{v}`");
        }
        assert_eq!(opbouwvelden.len(), 2);

        let laag = &opbouw["properties"]["layers"]["items"]["properties"];
        for v in ["thickness_mm", "orientation", "strength_class"] {
            assert!(laag[v].is_object(), "de laag mist `{v}`");
        }
        assert_eq!(laag.as_object().unwrap().len(), 3);
        // De twee namen van `CltLayerOrientation` staan letterlijk in het
        // schema; een derde naam zou de kern weigeren.
        assert_eq!(
            opbouw["properties"]["layers"]["items"]["properties"]["orientation"]["enum"],
            json!(["Longitudinal", "Transverse"])
        );
    }

    /// De opsommingen in het schema zijn die van de Rust-enums. Ze staan hier
    /// nog een keer met de hand, zodat een variant die in de kern verdwijnt of
    /// bijkomt hier opvalt in plaats van pas bij de eerste aanroep.
    #[test]
    fn de_opsommingen_komen_overeen_met_de_kern() {
        assert_eq!(schema_klimaatklasse()["enum"], json!(["Sc1", "Sc2", "Sc3"]));
        assert_eq!(
            schema_belastingduur()["enum"],
            json!([
                "Permanent",
                "LongTerm",
                "MediumTerm",
                "ShortTerm",
                "Instantaneous"
            ])
        );
        let staaf = schema_houten_staaf();
        assert_eq!(
            staaf["properties"]["ltb_load_case"]["enum"],
            json!([
                "ConstantMoment",
                "UniformLoad",
                "ConcentratedMidspan",
                "CantileverUniform",
                "CantileverConcentratedEnd"
            ])
        );
        assert_eq!(
            staaf["properties"]["ltb_load_position"]["enum"],
            json!(["CentreOfGravity", "CompressionEdge", "TensionEdge"])
        );
    }

    /// De standaardwaarden in het schema zijn die van de kern. Ze staan in het
    /// schema omdat een client anders niet kan zien wat er gebeurt als hij een
    /// veld weglaat — en bij `k_cr` en de doorbuigingsnoemers scheelt dat een
    /// unity check.
    #[test]
    fn de_standaardwaarden_in_het_schema_zijn_die_van_de_kern() {
        let staaf = schema_houten_staaf();
        let p = &staaf["properties"];
        assert_eq!(p["k_cr"]["default"], json!(1));
        assert_eq!(p["perform_ltb_check"]["default"], json!(true));
        assert_eq!(p["load_sharing"]["default"], json!(false));
        assert_eq!(p["ltb_load_case"]["default"], json!("UniformLoad"));
        assert_eq!(p["ltb_load_position"]["default"], json!("CentreOfGravity"));
        assert_eq!(
            p["deflection_limit_fin"]["default"].as_f64(),
            Some(nen_en_1995_1_1::deflection::NOEMER_W_FIN)
        );
        assert_eq!(
            p["deflection_limit_add"]["default"].as_f64(),
            Some(nen_en_1995_1_1::deflection::NOEMER_W_ADD)
        );
        let clt = schema_clt_staaf();
        assert_eq!(clt["properties"]["k_cr"]["default"], json!(1));
        assert_eq!(clt["properties"]["load_sharing"]["default"], json!(false));
    }
}
