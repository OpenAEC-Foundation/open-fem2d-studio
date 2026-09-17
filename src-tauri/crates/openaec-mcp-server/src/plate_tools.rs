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
                "description": "Materiaalsoort van de plaat, zoals de app hem bij de stijfheid herkende. Getoetst worden Staal (NEN-EN 1993-1-1 6.2.1(5)) en Hout — massief (EN 338) en gelijmd gelamineerd (EN 14080) — volgens NEN-EN 1995-1-1 in de materiaalassen, en Beton volgens NEN-EN 1992-1-1 bijlage F (benodigde wapening) met de betondrukdiagonaal; Kruislaaghout en Vrij komen terug met `geweigerd` en een reden." },
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
            "combinations": schema_combinaties("De elementspanningen per UGT-combinatie."),
            "wapening_aanwezig": schema_wapening_aanwezig(),
            "frequente_combinaties": schema_combinaties("Alleen beton, alleen gelezen samen met `wapening_aanwezig`: de elementspanningen per FREQUENTE BGT-combinatie (6.15b), de combinatie waaronder de nationale bijlage bij 7.3.1(5) de scheurwijdte laat toetsen. Weglaten = scheurwijdte niet getoetst, met reden. `check_fem_model` vult deze lijst alleen bij een plaat met ingevoerde wapening."),
        },
        "required": ["plate_id", "soort", "materiaal", "thickness_mm", "combinations"]
    })
}

/// Het schema van een lijst combinaties met elementspanningen (`PlaatCombinatie`).
fn schema_combinaties(beschrijving: &str) -> Value {
    json!({
                "type": "array",
                "description": beschrijving,
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
    })
}

/// Eén wapeningslaag (`PlaatWapeningLaag`).
fn schema_wapeningslaag() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["dekking_mm"],
        "description": "Eén wapeningslaag: OF `diameter_mm` met `hoh_mm`, OF `as_mm2_per_m` — niet beide. Met alleen `as_mm2_per_m` worden diameter- en staafafstandseisen (9.6.1(3), 9.6.2(3), 9.6.3(2)) en (7.11) niet getoetst, met reden.",
        "properties": {
            "diameter_mm": { "type": "number", "exclusiveMinimum": 0, "description": "Staafdiameter Ø in mm." },
            "hoh_mm": { "type": "number", "exclusiveMinimum": 0, "description": "Hart-op-hartafstand van de staven in mm." },
            "as_mm2_per_m": { "type": "number", "exclusiveMinimum": 0, "description": "Wapeningsoppervlakte in mm² per meter wand (alternatief voor Ø + h.o.h.)." },
            "dekking_mm": { "type": "number", "exclusiveMinimum": 0, "description": "Betondekking op deze staven, van het wandoppervlak tot de staaf, in mm." }
        }
    })
}

/// De wapening in één richting (`PlaatWapeningRichting`).
fn schema_wapeningsrichting(beschrijving: &str) -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": beschrijving,
        "properties": {
            "zijde_1": schema_wapeningslaag(),
            "zijde_2": schema_wapeningslaag()
        }
    })
}

/// De aanwezige wapening van een betonwand (`PlaatWapeningInvoer`).
pub fn schema_wapening_aanwezig() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["staalsoort", "horizontaal", "verticaal"],
        "description": "Alleen beton: de aanwezige wapening van de wand, per richting en per zijde. Dan toetst de kern per element de aanwezige tegen de benodigde wapening van bijlage F (UC = n_td/(A_s·f_yd)), de wandregels van 9.6, de minimumwapening van 7.3.2 en, met `milieuklasse` en `frequente_combinaties`, de scheurwijdte (7.3.4) waar dat onderbouwd kan. Weglaten = alleen benodigde wapening en betondruk, met de melding dat de aanwezige wapening niet is ingevoerd. Bij een ander materiaal wordt de plaat geweigerd.",
        "properties": {
            "staalsoort": { "type": "string", "enum": ["B500A", "B500B", "B500C"], "description": "Betonstaalsoort (f_yk)." },
            "horizontaal": schema_wapeningsrichting("Wapening in de horizontale modelrichting (x). Aan beide zijden verplicht (9.6.3(1))."),
            "verticaal": schema_wapeningsrichting("Wapening in de verticale modelrichting (z). Ten minste één zijde."),
            "milieuklasse": {
                "type": "string",
                "enum": ["X0", "XC1", "XC2", "XC3", "XC4", "XD1", "XD2", "XD3", "XS1", "XS2", "XS3", "XF1", "XF2", "XF3", "XF4", "XA1", "XA2", "XA3"],
                "description": "Milieuklasse (tabel 4.1): de ingang van tabel 7.1N (NB) voor w_max. Weglaten = scheurwijdte niet getoetst; er wordt geen klasse aangenomen."
            }
        }
    })
}

pub fn tool_definitions() -> Vec<Value> {
    vec![json!({
        "name": "check_plates",
        "description": "Check wall plates (membranes loaded in their plane) element by element. Input per plate: material kind and name, thickness and the element-averaged stresses sigma_x, sigma_y (vertical model direction) and tau_xy per ULS combination, as the FEM solver delivers them. Steel: yield criterion of NEN-EN 1993-1-1 6.2.1(5) eq. (6.1) with f_y from table 3.1 for the plate thickness and gamma_M0 from the National Annex; the unity check is sqrt(left-hand side) = sigma_eq,Ed/(f_y/gamma_M0). Returns per plate the envelope UC per element (`elementen`), the governing element per combination (`combinaties`), the derivation at the governing point (`checks`) and `niet_getoetst` with reasons — plate buckling (NEN-EN 1993-1-5) is NOT checked. Timber (solid EN 338 and glulam EN 14080): NEN-EN 1995-1-1 in the material axes (fibre direction `hoofdrichting_graden`) — tension and compression parallel (6.1.2, 6.1.4), compression perpendicular (6.1.5, k_c,90 = 1,0), shear (6.1.7) and compression at an angle (6.2.2 eq. 6.16) on each principal compressive stress, with k_mod per combination from `load_duration_per_combination` and `service_class`; tension perpendicular to the grain (6.1.3) is NOT checked because the code gives no expression for the volume effect, and where it occurs the plate status is NotApplicable. Concrete (full class name such as C30/37): NEN-EN 1992-1-1 annex F — per element the required tensile force in the reinforcement in the model directions x and z (`wapening`, n_td = f'_td·t in kN/m, eqs. F.2–F.7) and the concrete check: principal compression ≤ f_cd where no reinforcement is needed (F.1(3), 6.55), σ_cd ≤ 0,6·ν'·f_cd in cracked regions (F.1(4), 6.56); the provided reinforcement is NOT checked, so where reinforcement is needed the status is NotApplicable; minimum wall reinforcement (9.6), crack width and wall buckling are not checked. Every other material (cross-laminated timber, free material) comes back with `geweigerd` and a reason, never with a UC that reads as passing. Same input and output types as the Tauri command and the toetsbrug opdracht `check_plates`; all three run through `plaat_check::check_all_plates`, as does the plate check inside `check_fem_model`.",
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
        let laag = plaat_check::PlaatWapeningLaag { diameter_mm: Some(10.0), hoh_mm: Some(150.0), as_mm2_per_m: None, dekking_mm: 30.0 };
        let laag_as = plaat_check::PlaatWapeningLaag { diameter_mm: None, hoh_mm: None, as_mm2_per_m: Some(524.0), dekking_mm: 30.0 };
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
            wapening_aanwezig: Some(plaat_check::PlaatWapeningInvoer {
                staalsoort: "B500B".into(),
                horizontaal: plaat_check::PlaatWapeningRichting { zijde_1: Some(laag), zijde_2: Some(laag_as) },
                verticaal: plaat_check::PlaatWapeningRichting { zijde_1: Some(laag), zijde_2: None },
                milieuklasse: Some(nen_en_1992_1_1::ExposureClass::XC3),
            }),
            frequente_combinaties: vec![plaat_check::PlaatCombinatie { combination_id: 2, elements: vec![] }],
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
        let w = &schema["properties"]["wapening_aanwezig"];
        assert_eq!(sleutels(&w["properties"]), sleutels(&waarde["wapening_aanwezig"]));
        let r = &w["properties"]["horizontaal"];
        assert_eq!(sleutels(&r["properties"]), sleutels(&waarde["wapening_aanwezig"]["horizontaal"]));
        let l = &r["properties"]["zijde_1"];
        let mut beide = sleutels(&waarde["wapening_aanwezig"]["horizontaal"]["zijde_1"]);
        beide.extend(sleutels(&waarde["wapening_aanwezig"]["horizontaal"]["zijde_2"]));
        beide.sort();
        beide.dedup();
        assert_eq!(sleutels(&l["properties"]), beide);
        let fc = &schema["properties"]["frequente_combinaties"]["items"];
        assert_eq!(sleutels(&fc["properties"]), sleutels(&waarde["frequente_combinaties"][0]));
        for niveau in [w, r, l, fc] {
            assert_eq!(niveau["additionalProperties"], false);
        }
    }
}
