//! concrete_tools.rs — de betontoetsing (NEN-EN 1992-1-1) als MCP-tools.
//!
//! DE DERDE WEG
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn,
//! anders werkt hij maar in één omgeving:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. deze MCP-server.
//!
//! Voor beton bestonden alleen de eerste twee. Dit bestand is de derde. Er
//! wordt hier niet gerekend: elke tool leest zijn invoertype, roept dezelfde
//! functie uit `concrete_check` aan als de andere twee wegen en geeft het
//! resultaat door. Een tweede rekenimplementatie zou betekenen dat dezelfde
//! doorsnede twee plausibele antwoorden kan geven, en dat is bij
//! constructieve software een veiligheidsprobleem.
//!
//! DE NAMEN
//! `list_concrete_classes`, `list_reinforcement_grades` en `concrete_mn_kappa`
//! heten hier precies zoals in de andere twee wegen. `check_concrete_beam`
//! staat in het ENKELVOUD en toetst één staaf, gelijk aan `check_steel_beam`
//! hiernaast; de Tauri- en toetsbrug-weg heten `check_concrete_beams` en nemen
//! een lijst, net zoals `check_steel_beams` daar. Het invoertype
//! (`ConcreteBeamCheckInput`) en het uitvoertype (`ConcreteBeamCheckResult`)
//! zijn wél letterlijk dezelfde; `tests/drie_wegen_beton.rs` toont aan dat de
//! drie wegen op dezelfde invoer hetzelfde antwoord geven.
//!
//! DE LIJSTTOOLS ZIJN INGEPAKT
//! `list_concrete_classes` en `list_reinforcement_grades` leveren hun lijst in
//! een object (`{ "classes": [...] }` / `{ "grades": [...] }`) omdat
//! `structuredContent` in het MCP-antwoord een object moet zijn. Dat is
//! dezelfde keuze als bij `list_steel_grades`. De lijst binnen dat object is
//! byte-voor-byte wat de andere twee wegen kaal teruggeven.
//!
//! STRIKTE SCHEMA'S
//! `ConcreteBeamCheckInput`, `MnKappaRequest`, `ReinforcementCage` en
//! `RebarRow` staan alle vier op `#[serde(deny_unknown_fields)]`. De schema's
//! hieronder spiegelen dat met `additionalProperties: false` en noemen ALLE
//! velden, ook die met `#[serde(default)]`. Dat is niet cosmetisch: laat een
//! client `apply_min_eccentricity` weg, dan valt hij op `true` (veilig), maar
//! `n_strips` en `steel_branch` veranderen de uitkomst, en een tikfout in een
//! veldnaam zou zonder deze strengheid stil op de standaardwaarde terugvallen.

use serde_json::{json, Value};

use crate::RpcError;

/// De vier betontools. Eén lijst, gebruikt door `is_concrete_tool`, de
/// schema's en de dispatch — zodat een tool niet in `tools/list` kan staan
/// zonder afhandeling, of andersom.
pub const CONCRETE_TOOLS: [&str; 4] = [
    "list_concrete_classes",
    "list_reinforcement_grades",
    "check_concrete_beam",
    "concrete_mn_kappa",
];

pub fn is_concrete_tool(naam: &str) -> bool {
    CONCRETE_TOOLS.contains(&naam)
}

// ── Dispatch ────────────────────────────────────────────────────────────────

pub async fn dispatch(naam: &str, args: Value) -> Result<Value, RpcError> {
    match naam {
        "list_concrete_classes" => {
            Ok(json!({ "classes": nen_en_1992_1_1::CONCRETE_CLASSES }))
        }
        "list_reinforcement_grades" => {
            Ok(json!({ "grades": nen_en_1992_1_1::REINFORCEMENT_GRADES }))
        }
        "check_concrete_beam" => {
            let input: concrete_check::ConcreteBeamCheckInput = serde_json::from_value(args)
                .map_err(|e| RpcError::invalid_params(format!("ConcreteBeamCheckInput: {e}")))?;
            // Blokkerend werk: het M-N-κ-diagram integreert de doorsnede in
            // `n_strips` stroken en loopt daarna nog twee interactiediagrammen
            // af. Op de stdio-lus zou dat de lezer laten stilstaan.
            let result = tokio::task::spawn_blocking(move || {
                concrete_check::check_concrete_beam(input)
            })
            .await
            .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?;
            serde_json::to_value(result)
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        "concrete_mn_kappa" => {
            let req: concrete_check::MnKappaRequest = serde_json::from_value(args)
                .map_err(|e| RpcError::invalid_params(format!("MnKappaRequest: {e}")))?;
            let result = tokio::task::spawn_blocking(move || concrete_check::mn_kappa(req))
                .await
                .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?
                // Een onbekende sterkteklasse of een korf die niet in de
                // doorsnede past is een toolfout met de reden erbij, geen leeg
                // diagram: leeg zou als "geen capaciteit" kunnen lezen.
                .map_err(RpcError::invalid_params)?;
            serde_json::to_value(result)
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        _ => Err(RpcError::method_not_found(naam)),
    }
}

// ── Schema's ────────────────────────────────────────────────────────────────

/// De wapeningskorf (`ReinforcementCage`). Alle vier de velden zijn verplicht:
/// de Rust-kant kent er geen standaardwaarde voor, en een stilzwijgende korf
/// zou een toetsing opleveren die bij een andere staaf hoort.
fn schema_korf() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Wapeningskorf: dekking, beugel, boven- en onderwapening. Er is GEEN standaardkorf; alle velden zijn verplicht.",
        "required": ["cover_mm", "stirrup_diameter_mm", "top", "bottom"],
        "properties": {
            "cover_mm": { "type": "number", "minimum": 0,
                "description": "Nominale betondekking c_nom op de beugel in mm (EN 1992-1-1 §4.4.1)." },
            "stirrup_diameter_mm": { "type": "number", "minimum": 0,
                "description": "Beugeldiameter in mm; 0 = geen beugel, de hoofdwapening ligt dan direct achter de dekking." },
            "top": schema_wapeningsrij("Bovenwapening (zijde z = h)."),
            "bottom": schema_wapeningsrij("Onderwapening (zijde z = 0).")
        }
    })
}

/// Eén rij hoofdwapening (`RebarRow`): aantal staven en diameter.
fn schema_wapeningsrij(omschrijving: &str) -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": omschrijving,
        "required": ["count", "diameter_mm"],
        "properties": {
            "count": { "type": "integer", "minimum": 0, "description": "Aantal staven in de rij; 0 = geen wapening aan deze zijde." },
            "diameter_mm": { "type": "number", "minimum": 0, "description": "Staafdiameter in mm." }
        }
    })
}

fn schema_n_strips() -> Value {
    json!({
        "type": "integer", "minimum": 1, "default": 50,
        "description": "Aantal stroken waarin de doorsnede voor de integratie van de betonspanning wordt verdeeld. Default 50; hoger is nauwkeuriger en trager."
    })
}

fn schema_steel_branch() -> Value {
    json!({
        "type": "string", "enum": ["Horizontal", "Inclined"], "default": "Horizontal",
        "description": "Bovenste tak van het staaldiagram (3.2.7(2), figuur 3.8). \"Horizontal\" = 3.2.7(2)b, horizontaal op f_yd zonder rekgrens (default). \"Inclined\" = 3.2.7(2)a, hellend tot k·f_yk/gamma_S bij eps_uk, met rekgrens eps_ud = 0,9·eps_uk (NB)."
    })
}

fn schema_design_situation() -> Value {
    json!({
        "type": "string", "enum": ["PersistentTransient", "Accidental"], "default": "PersistentTransient",
        "description": "Ontwerpsituatie voor tabel 2.1N. \"PersistentTransient\" = blijvend en tijdelijk (gamma_C = 1,5; gamma_S = 1,15), \"Accidental\" = buitengewoon (gamma_C = 1,2; gamma_S = 1,0)."
    })
}

/// De vier tooldefinities voor `tools/list`.
pub fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_concrete_classes",
            "description": "List the EN 1992-1-1 table 3.1 concrete strength classes (C12/15 up to C90/105) with f_ck, f_ck,cube, f_cm, f_ctm, E_cm and the strain limits eps_c2/eps_cu2/eps_c3/eps_cu3. Same list as the Tauri command and the toetsbrug opdracht of the same name, wrapped in a 'classes' object.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        }),
        json!({
            "name": "list_reinforcement_grades",
            "description": "List the reinforcing-steel grades from EN 1992-1-1 annex C table C.1 (B500A/B500B/B500C) with f_yk, the ductility class, k = (f_t/f_y)_k and eps_uk. Same list as the Tauri command and the toetsbrug opdracht of the same name, wrapped in a 'grades' object.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        }),
        json!({
            "name": "check_concrete_beam",
            "description": "Run the EN 1992-1-1 concrete cross-section check on a single rectangular reinforced beam or column: bending with the rectangular stress block (§3.1.7(3)) and bending with axial force through the M-N-kappa relation, including the minimum eccentricity of §6.1(4). Returns a ConcreteBeamCheckResult with the full derivation, the M-kappa diagram at the governing axial force and both N-M interaction diagrams. Same input and output types as the Tauri command `check_concrete_beams` and the toetsbrug opdracht of that name — those take a list, this one takes a single beam, exactly like `check_steel_beam`. NOT included: shear, torsion, crack width, deflection, second-order effects.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "beam_id": { "type": "integer", "minimum": 0,
                        "description": "Staafnummer; komt onveranderd terug in het resultaat." },
                    "width_mm": { "type": "number", "exclusiveMinimum": 0,
                        "description": "Doorsnedebreedte b in mm." },
                    "height_mm": { "type": "number", "exclusiveMinimum": 0,
                        "description": "Doorsnedehoogte h in mm; de buiging gaat om de sterke as." },
                    "concrete_class": { "type": "string",
                        "description": "Betonsterkteklasse uit tabel 3.1, bijvoorbeeld \"C30/37\". Een onbekende naam levert een resultaat met 'governing_check_id' = \"ERROR: …\" en géén toetsen; vraag de geldige namen op met `list_concrete_classes`." },
                    "reinforcement_grade": { "type": "string",
                        "description": "Wapeningsstaal uit bijlage C, bijvoorbeeld \"B500B\". Zie `list_reinforcement_grades`." },
                    "cage": schema_korf(),
                    "length_m": { "type": "number",
                        "description": "Staaflengte in m. Alleen voor de rapportage; deze toets kent geen knik." },
                    "forces_envelope": crate::schema_krachtenomhullende(),
                    "n_strips": schema_n_strips(),
                    "steel_branch": schema_steel_branch(),
                    "design_situation": schema_design_situation(),
                    "apply_min_eccentricity": { "type": "boolean", "default": true,
                        "description": "Minimale excentriciteit e_0 = max(h/30; 20 mm) toepassen bij druk (6.1(4)). Default true; op false zetten maakt de toets GUNSTIGER en hoort alleen bij het narekenen van een uitwerking die die regel niet toepast." }
                },
                "required": [
                    "beam_id", "width_mm", "height_mm", "concrete_class",
                    "reinforcement_grade", "cage", "length_m", "forces_envelope"
                ]
            }
        }),
        json!({
            "name": "concrete_mn_kappa",
            "description": "M-N-kappa diagram and N-M interaction diagram of one reinforcement cage, without a beam or an internal-force envelope. Returns the moment-curvature curve at the given axial force, the curvature and moment at first yield and at failure, the failure mode, and the axial capacities N_Rd in compression and tension. Same name, same input type (MnKappaRequest) and same output type (MnKappaResponse) as the Tauri command and the toetsbrug opdracht.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "width_mm": { "type": "number", "exclusiveMinimum": 0, "description": "Doorsnedebreedte b in mm." },
                    "height_mm": { "type": "number", "exclusiveMinimum": 0, "description": "Doorsnedehoogte h in mm." },
                    "concrete_class": { "type": "string", "description": "Betonsterkteklasse, bijvoorbeeld \"C30/37\"." },
                    "reinforcement_grade": { "type": "string", "description": "Wapeningsstaal, bijvoorbeeld \"B500B\"." },
                    "cage": schema_korf(),
                    "n_ed_kn": { "type": "number", "default": 0,
                        "description": "Normaalkracht waarbij het M-kappa-diagram wordt bepaald, in kN. TREK IS POSITIEF, dus een drukkracht is negatief. Default 0." },
                    "moment_sign": { "type": "number", "enum": [1, -1], "default": 1,
                        "description": "Richting van het moment: +1 = trek onder (default), -1 = trek boven. Bij een asymmetrische korf verschilt het diagram per richting." },
                    "n_strips": schema_n_strips(),
                    "steel_branch": schema_steel_branch(),
                    "design_situation": schema_design_situation(),
                    "interaction_points": { "type": "integer", "minimum": 0, "default": 21,
                        "description": "Aantal punten van het N-M-interactiediagram per momentrichting. Minder dan 3 = niet berekenen; beide diagrammen komen dan leeg terug." }
                },
                "required": ["width_mm", "height_mm", "concrete_class", "reinforcement_grade", "cage"]
            }
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
        assert_eq!(definities.len(), CONCRETE_TOOLS.len());
        for def in &definities {
            let naam = def["name"].as_str().expect("naam");
            assert!(is_concrete_tool(naam), "{naam} ontbreekt in CONCRETE_TOOLS");
        }
    }

    /// De schema's beloven strengheid die de server ook waarmaakt: elk
    /// invoerschema weigert onbekende velden, gelijk aan
    /// `#[serde(deny_unknown_fields)]` op `ConcreteBeamCheckInput` en
    /// `MnKappaRequest`.
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

    /// Het korfschema is de spiegel van `ReinforcementCage`/`RebarRow`. Een
    /// ontbrekend veld hier zou door `additionalProperties: false` geweigerd
    /// worden terwijl de kern het wél nodig heeft.
    #[test]
    fn korfschema_kent_alle_velden_van_de_kern() {
        let korf = schema_korf();
        let velden = korf["properties"].as_object().expect("properties");
        for veld in ["cover_mm", "stirrup_diameter_mm", "top", "bottom"] {
            assert!(velden.contains_key(veld), "korfschema mist `{veld}`");
        }
        assert_eq!(velden.len(), 4, "korfschema kent een veld dat de kern weigert");
        for zijde in ["top", "bottom"] {
            let rij = &korf["properties"][zijde]["properties"];
            assert!(rij["count"].is_object());
            assert!(rij["diameter_mm"].is_object());
            assert_eq!(rij.as_object().unwrap().len(), 2);
        }
    }
}
