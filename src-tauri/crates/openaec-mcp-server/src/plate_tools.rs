//! plate_tools.rs — de plaattoets (wandschijven, belast in het vlak) als
//! MCP-gereedschap.
//!
//! DE DERDE WEG
//! `check_plates` heet hier precies zoals het Tauri-command en de
//! toetsbrug-opdracht, neemt net als die twee een LIJST platen onder `inputs`,
//! en loopt door dezelfde functie: `plaat_check::check_all_plates`. Er wordt
//! hier niet gerekend.
//!
//! Binnen `check_fem_model` gebeurt hetzelfde: de solverbundel levert
//! `plate_check_inputs` (dezelfde bouwer als de app, `lib/plaatCheckBuilder.ts`)
//! en `fem_tools.rs` roept er deze functie mee aan.
//!
//! HET SCHEMA IS STRIKT
//! `PlateCheckInput`, `PlaatCombinatie` en `PlaatElementSpanning` staan op
//! `deny_unknown_fields`; het schema zet daarom `additionalProperties` op
//! `false` en noemt elk veld.

use serde::Deserialize;
use serde_json::{json, Value};

use crate::RpcError;

pub const PLATE_TOOLS: [&str; 1] = ["check_plates"];

pub fn is_plate_tool(naam: &str) -> bool {
    PLATE_TOOLS.contains(&naam)
}

/// Het omhulsel `{ "inputs": [...] }`, zoals bij de houttools.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Plaatinvoer {
    inputs: Vec<plaat_check::PlateCheckInput>,
}

pub async fn dispatch(naam: &str, args: Value) -> Result<Value, RpcError> {
    match naam {
        "check_plates" => {
            let args: Plaatinvoer = serde_json::from_value(args)
                .map_err(|e| RpcError::invalid_params(format!("PlateCheckInput: {e}")))?;
            // Blokkerend werk: een wand kan duizenden elementen hebben, maal het
            // aantal combinaties.
            let uit = tokio::task::spawn_blocking(move || plaat_check::check_all_plates(args.inputs))
                .await
                .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?;
            serde_json::to_value(uit)
                .map(|v| json!({ "results": v }))
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        _ => Err(RpcError::method_not_found(naam)),
    }
}

/// Het schema van één plaat (`PlateCheckInput`). Ook gebruikt door
/// `check_fem_model` om `plate_check_inputs` in de uitvoer te beschrijven.
pub fn schema_plaat() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Eén plaat (wandschijf, belast in het vlak) met de elementspanningen per UGT-combinatie. Een onbekende veldnaam wordt geweigerd.",
        "properties": {
            "bijlage": crate::schema_bijlage(),
            "plate_id": { "type": "integer", "minimum": 0,
                "description": "Plaatnummer; komt onveranderd terug." },
            "soort": { "type": "string", "enum": ["Staal", "Hout", "Kruislaaghout", "Beton", "Vrij"],
                "description": "Materiaalsoort van de plaat, zoals de app hem bij de stijfheid herkende. Getoetst worden Staal (NEN-EN 1993-1-1 6.2.1(5)) en Hout — massief (EN 338) en gelijmd gelamineerd (EN 14080) — volgens NEN-EN 1995-1-1 in de materiaalassen; elke andere soort komt terug met `geweigerd` en een reden." },
            "materiaal": { "type": "string",
                "description": "Materiaalnaam, bijvoorbeeld \"S355\". Moet bij de soort in de tabel van de kern staan; anders volgt een weigering." },
            "thickness_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Plaatdikte in mm. Bij staal de elementdikte van tabel 3.1 (t ≤ 40 mm, 40 < t ≤ 80 mm; dikker wordt geweigerd)." },
            "hoofdrichting_graden": { "type": "number", "default": 0,
                "description": "Hout: hoofdrichting (vezel) in graden tegen de klok in vanaf de globale x-as — dezelfde hoek als `hoofdrichting` van de plaat in het model. Weglaten = 0°." },
            "service_class": { "type": "string", "enum": ["Sc1", "Sc2", "Sc3"],
                "description": "Hout: klimaatklasse (2.3.1.3), samen met de belastingduur de ingang van k_mod (tabel 3.1). VERPLICHT bij hout: zonder klimaatklasse weigert de kern; er wordt geen klasse aangenomen." },
            "load_duration_per_combination": {
                "type": "array",
                "default": [],
                "description": "Hout: de belastingduurklasse per UGT-combinatie (3.1.3(2)). Elke combinatie in `combinations` moet erin staan; anders weigert de kern. `check_fem_model` vult deze lijst uit de belastinggevallen.",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["combination_id", "load_duration"],
                    "properties": {
                        "combination_id": { "type": "integer", "minimum": 0 },
                        "load_duration": { "type": "string", "enum": ["Permanent", "LongTerm", "MediumTerm", "ShortTerm", "Instantaneous"] },
                        "basis": { "type": "string", "description": "Waarop de klasse berust; alleen voor het rapport." }
                    }
                }
            },
            "notities": { "type": "array", "items": { "type": "string" }, "default": [],
                "description": "Kanttekeningen; rekenen nergens mee en komen letterlijk in `notes`." },
            "combinations": {
                "type": "array",
                "description": "De elementspanningen per UGT-combinatie.",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["combination_id", "elements"],
                    "properties": {
                        "combination_id": { "type": "integer", "minimum": 0 },
                        "elements": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["element_id", "sigma_x_mpa", "sigma_y_mpa", "tau_xy_mpa"],
                                "properties": {
                                    "element_id": { "type": "integer", "minimum": 0,
                                        "description": "Element-id in het rekenmesh." },
                                    "sigma_x_mpa": { "type": "number",
                                        "description": "Normaalspanning in de horizontale modelrichting, N/mm², trek positief, elementgemiddeld." },
                                    "sigma_y_mpa": { "type": "number",
                                        "description": "Normaalspanning in de verticale modelrichting (model-z), N/mm², trek positief." },
                                    "tau_xy_mpa": { "type": "number",
                                        "description": "Schuifspanning in het vlak, N/mm²." }
                                }
                            }
                        }
                    }
                }
            }
        },
        "required": ["plate_id", "soort", "materiaal", "thickness_mm", "combinations"]
    })
}

pub fn tool_definitions() -> Vec<Value> {
    vec![json!({
        "name": "check_plates",
        "description": "Check wall plates (membranes loaded in their plane) element by element. Input per plate: material kind and name, thickness and the element-averaged stresses sigma_x, sigma_y (vertical model direction) and tau_xy per ULS combination, as the FEM solver delivers them. Steel: yield criterion of NEN-EN 1993-1-1 6.2.1(5) eq. (6.1) with f_y from table 3.1 for the plate thickness and gamma_M0 from the National Annex; the unity check is sqrt(left-hand side) = sigma_eq,Ed/(f_y/gamma_M0). Returns per plate the envelope UC per element (`elementen`), the governing element per combination (`combinaties`), the derivation at the governing point (`checks`) and `niet_getoetst` with reasons — plate buckling (NEN-EN 1993-1-5) is NOT checked. Timber (solid EN 338 and glulam EN 14080): NEN-EN 1995-1-1 in the material axes (fibre direction `hoofdrichting_graden`) — tension and compression parallel (6.1.2, 6.1.4), compression perpendicular (6.1.5, k_c,90 = 1,0), shear (6.1.7) and compression at an angle (6.2.2 eq. 6.16) on each principal compressive stress, with k_mod per combination from `load_duration_per_combination` and `service_class`; tension perpendicular to the grain (6.1.3) is NOT checked because the code gives no expression for the volume effect, and where it occurs the plate status is NotApplicable. Every other material (cross-laminated timber, concrete, free material) comes back with `geweigerd` and a reason, never with a UC that reads as passing. Same input and output types as the Tauri command and the toetsbrug opdracht `check_plates`; all three run through `plaat_check::check_all_plates`, as does the plate check inside `check_fem_model`.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "inputs": {
                    "type": "array",
                    "description": "De platen die getoetst moeten worden. De volgorde van de lijst is de volgorde van de resultaten.",
                    "items": schema_plaat()
                }
            },
            "required": ["inputs"]
        }
    })]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn elke_gedefinieerde_tool_staat_in_de_namenlijst() {
        let definities = tool_definitions();
        assert_eq!(definities.len(), PLATE_TOOLS.len());
        for def in &definities {
            let naam = def["name"].as_str().unwrap();
            assert!(is_plate_tool(naam), "{naam}");
        }
    }

    /// Het schema noemt precies de velden van het invoertype, op elk niveau:
    /// met `additionalProperties: false` zou een vergeten veld een geldige
    /// invoer laten weigeren door een client die het schema volgt.
    #[test]
    fn schema_noemt_elk_veld_van_het_invoertype() {
        let invoer = plaat_check::PlateCheckInput {
            bijlage: Default::default(),
            plate_id: 1,
            soort: plaat_check::PlaatMateriaalSoort::Staal,
            materiaal: "S235".into(),
            thickness_mm: 10.0,
            notities: vec!["x".into()],
            hoofdrichting_graden: 30.0,
            service_class: Some(nen_en_1995_1_1::ServiceClass::Sc1),
            load_duration_per_combination: vec![timber_check::CombinationLoadDuration { combination_id: 1, load_duration: nen_en_1995_1_1::LoadDurationClass::MediumTerm, basis: "b".into() }],
            combinations: vec![plaat_check::PlaatCombinatie {
                combination_id: 1,
                elements: vec![plaat_check::PlaatElementSpanning {
                    element_id: 0,
                    sigma_x_mpa: 1.0,
                    sigma_y_mpa: 0.0,
                    tau_xy_mpa: 0.0,
                }],
            }],
        };
        let waarde = serde_json::to_value(&invoer).unwrap();
        let sleutels = |v: &Value| {
            let mut k: Vec<String> = v.as_object().unwrap().keys().cloned().collect();
            k.sort();
            k
        };
        let schema = schema_plaat();
        assert_eq!(sleutels(&schema["properties"]), sleutels(&waarde));
        let comb = &schema["properties"]["combinations"]["items"];
        assert_eq!(sleutels(&comb["properties"]), sleutels(&waarde["combinations"][0]));
        let el = &comb["properties"]["elements"]["items"];
        assert_eq!(sleutels(&el["properties"]), sleutels(&waarde["combinations"][0]["elements"][0]));
        for niveau in [&schema, comb, el] {
            assert_eq!(niveau["additionalProperties"], false);
        }
    }
}
