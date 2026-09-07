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
//! `list_concrete_classes`, `list_reinforcement_grades`, `concrete_mn_kappa`,
//! `concrete_segment_stiffness` en `concrete_effective_flange_width` heten hier
//! precies zoals in de andere twee wegen. `check_concrete_beam`
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
//! `ConcreteBeamCheckInput`, `MnKappaRequest`, `SegmentStiffnessRequest`,
//! `SegmentForces`, `ReinforcementCage` en `RebarRow` staan alle zes op
//! `#[serde(deny_unknown_fields)]`. De schema's
//! hieronder spiegelen dat met `additionalProperties: false` en noemen ALLE
//! velden, ook die met `#[serde(default)]`. Dat is niet cosmetisch: laat een
//! client `apply_min_eccentricity` weg, dan valt hij op `true` (veilig), maar
//! `n_strips` en `steel_branch` veranderen de uitkomst, en een tikfout in een
//! veldnaam zou zonder deze strengheid stil op de standaardwaarde terugvallen.

use serde_json::{json, Value};

use crate::RpcError;

/// De zes betontools. Eén lijst, gebruikt door `is_concrete_tool`, de
/// schema's en de dispatch — zodat een tool niet in `tools/list` kan staan
/// zonder afhandeling, of andersom.
pub const CONCRETE_TOOLS: [&str; 6] = [
    "list_concrete_classes",
    "list_reinforcement_grades",
    "check_concrete_beam",
    "concrete_mn_kappa",
    "concrete_segment_stiffness",
    "concrete_effective_flange_width",
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
        "concrete_segment_stiffness" => {
            let req: concrete_check::SegmentStiffnessRequest = serde_json::from_value(args)
                .map_err(|e| {
                    RpcError::invalid_params(format!("SegmentStiffnessRequest: {e}"))
                })?;
            // Blokkerend werk: per segment wordt de doorsnede in `n_strips`
            // stroken geïntegreerd en wordt er op de kromming geïtereerd. Een
            // staaf van 10 m in segmenten van 400 mm is 25 van die oplossingen.
            let result = tokio::task::spawn_blocking(move || concrete_check::segment_stiffness(req))
                .await
                .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?
                // Een onuitvoerbaar verzoek — onbekende sterkteklasse, een korf
                // die niet past, een lijst krachten die niet bij de indeling
                // hoort — is een toolfout met de reden erbij. Een segment dat
                // niet convergeert is dat NIET: dat staat als `Failed` in de
                // tabel, met de reden en zonder getal.
                .map_err(RpcError::invalid_params)?;
            serde_json::to_value(result)
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        // De meewerkende flensbreedte (5.3.2.1). Geen blokkerend werk: dit is
        // een handvol vermenigvuldigingen per gebied, geen integratie over de
        // doorsnede. Een ongeldig geval — een losstaande uitkraging, een
        // uitkraging langer dan de halve aangrenzende overspanning, een
        // overspanningsverhouding buiten 2/3 … 1,5 — is een toolfout MET de
        // reden. Een teruggegeven getal zou hier onzichtbaar fout zijn: b_eff
        // stuurt naast de sterkte ook I_c, M_cr en de tweede orde.
        "concrete_effective_flange_width" => {
            let req: nen_en_1992_1_1::EffectiveFlangeWidthRequest = serde_json::from_value(args)
                .map_err(|e| {
                    RpcError::invalid_params(format!("EffectiveFlangeWidthRequest: {e}"))
                })?;
            let result = nen_en_1992_1_1::beff::effective_flange_width_request(req)
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

/// De doorsnede (`ConcreteSectionInput`): een vorm met de maten die bij die
/// vorm horen.
///
/// `additionalProperties: false` spiegelt `deny_unknown_fields` op het
/// Rust-type. `b_w_mm` en `h_f_mm` staan hier als optionele velden omdat een
/// JSON-schema "verplicht zodra shape = Tee" niet kan uitdrukken zonder
/// `oneOf`; de kern zelf weigert een T zonder lijfbreedte en een rechthoek
/// mét flensdikte, met de reden erbij. De beschrijving zegt dat met zoveel
/// woorden, zodat een aanroeper het niet hoeft uit te proberen.
fn schema_doorsnede() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "De betondoorsnede: een vorm met benoemde maten. RECHTHOEK: alleen b_mm en h_mm; b_w_mm en h_f_mm moeten dan WEGBLIJVEN. T-VORM en L-VORM: b_mm is de flensbreedte b_f, en b_w_mm (lijfbreedte) en h_f_mm (flensdikte) zijn dan VERPLICHT. De flensbreedte wordt verondersteld de meewerkende breedte b_eff van 5.3.2.1(3) te zijn; die leidt de tool `concrete_effective_flange_width` af, niet deze.",
        "required": ["b_mm", "h_mm"],
        "properties": {
            "shape": { "type": "string", "enum": ["Rectangle", "Tee", "Ell"], "default": "Rectangle",
                "description": "De vorm. \"Rectangle\" (default) = massieve rechthoek b x h. \"Tee\" = T-ligger, flens aan beide zijden van het lijf. \"Ell\" = L-ligger (randligger), flens aan een kant; die rekent in dit uniaxiale model identiek aan de T en levert daarom een expliciete aanname mee, namelijk dat de zijdelingse kromming verhinderd is." },
            "b_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Grootste breedte in mm: b bij een rechthoek, de flensbreedte b_f bij een T en een L." },
            "h_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Totale hoogte h in mm; de buiging gaat om de sterke as." },
            "b_w_mm": { "type": ["number", "null"], "exclusiveMinimum": 0,
                "description": "Lijfbreedte b_w in mm. Verplicht bij \"Tee\" en \"Ell\", en kleiner dan b_mm; bij \"Rectangle\" weglaten." },
            "h_f_mm": { "type": ["number", "null"], "exclusiveMinimum": 0,
                "description": "Flensdikte h_f in mm. Verplicht bij \"Tee\" en \"Ell\", en kleiner dan h_mm; bij \"Rectangle\" weglaten." },
            "flange_at_bottom": { "type": "boolean", "default": false,
                "description": "Ligt de flens aan de ONDERZIJDE (de omgekeerde T)? Default false: de flens ligt boven, zoals bij een ligger onder een vloer. Alleen zinvol bij \"Tee\" en \"Ell\"." }
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

/// Eén paar snedekrachten van een segment (`SegmentForces`). Beide velden zijn
/// verplicht: de Rust-kant kent er geen standaardwaarde voor, en een
/// stilzwijgende nul zou een stijfheid opleveren die bij een ander lastgeval
/// hoort.
fn schema_segmentkrachten() -> Value {
    json!({
        "type": "array",
        "description": "De snedekrachten per segment uit de vorige raamwerkronde, in de volgorde van de segmentindeling. LEEG (of weggelaten) = ronde 0: dan komt alleen de indeling terug en wordt er niets gerekend. Is de lijst niet leeg, dan moet hij precies zoveel elementen tellen als er segmenten zijn; een afwijkend aantal is een fout en geen stilzwijgende bijsnijding.",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["n_ed_kn", "m_ed_knm"],
            "properties": {
                "n_ed_kn": { "type": "number",
                    "description": "Normaalkracht in kN. TREK IS POSITIEF, dus een drukkracht is negatief." },
                "m_ed_knm": { "type": "number",
                    "description": "Buigend moment in kNm om de sterke as; positief = trek in de onderste vezel." }
            }
        }
    })
}

/// De zes tooldefinities voor `tools/list`.
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
                    "section": schema_doorsnede(),
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
                    "beam_id", "section", "concrete_class",
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
                    "section": schema_doorsnede(),
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
                "required": ["section", "concrete_class", "reinforcement_grade", "cage"]
            }
        }),
        json!({
            "name": "concrete_segment_stiffness",
            "description": "Stateless secant-bending-stiffness service for the physically non-linear second-order analysis of EN 1992-1-1 §5.8.6. One request describes ONE reinforced-concrete member: it is divided into equal segments (rule n = max(1, round(L / target)), the same rule the mesh adapter uses for its element boundaries) and each segment gets its own EI = (M - M_0)/kappa from the (3.14) stress-strain relation of §3.1.5 that §5.8.6(3) prescribes. Send it WITHOUT 'segment_forces' to get only the segment layout (round 0, load-case independent). Send it WITH the (N, M) of the previous frame analysis to get the stiffnesses for the next round, plus the convergence verdict. Nothing is kept between calls. The response is the report table: per segment x_start/x_end, N_Ed, M_Ed, M_0, M_cr, kappa, EI, cracked yes/no, the limit state used and the status. Same input type (SegmentStiffnessRequest) and output type (SegmentStiffnessResponse) as the Tauri command and the toetsbrug opdracht of the same name. NOT included: the global iteration loop itself, shear, torsion, crack width.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "beam_id": { "type": "integer", "minimum": 0,
                        "description": "Staafnummer; komt onveranderd terug in het antwoord." },
                    "section": schema_doorsnede(),
                    "concrete_class": { "type": "string",
                        "description": "Betonsterkteklasse uit tabel 3.1, bijvoorbeeld \"C30/37\". Zie `list_concrete_classes`." },
                    "reinforcement_grade": { "type": "string",
                        "description": "Wapeningsstaal uit bijlage C, bijvoorbeeld \"B500B\". Zie `list_reinforcement_grades`." },
                    "cage": schema_korf(),
                    "length_m": { "type": "number", "exclusiveMinimum": 0,
                        "description": "Staaflengte in m. Bepaalt samen met `target_segment_length_mm` de segmentindeling." },
                    "target_segment_length_mm": { "type": "number", "exclusiveMinimum": 0, "default": 400,
                        "description": "Gewenste segmentlengte in mm; 400 is de beginwaarde. De werkelijke lengte is L/n met n = max(1, round(L / doel)), dus alle segmenten zijn even lang en de werkelijke lengte ligt tussen 0,75x en 1,5x de gewenste. De uitkomst staat in het antwoord." },
                    "max_segments": { "type": "integer", "minimum": 1, "default": 2000,
                        "description": "Vangnet: meer segmenten dan dit is een verzoekfout in plaats van een berekening. Beschermt tegen een doelwaarde van bijna nul." },
                    "limit_state": { "type": "string", "enum": ["DesignValues", "MeanValues"], "default": "DesignValues",
                        "description": "Grenstoestand. \"DesignValues\" = UGT volgens 5.8.6(3): (3.14) met f_cd en E_cd = E_cm/1,2, betontrek verwaarloosd (5.8.6(5)). \"MeanValues\" = BGT volgens 3.1.5/7.4.3: (3.14) met f_cm en E_cm, met de tension stiffening van (7.18)/(7.19). De gebruikte variant staat per segment in het antwoord en is nooit impliciet." },
                    "phi_ef": { "type": "number", "minimum": 0, "default": 0,
                        "description": "Effectieve kruipcoefficient volgens 5.8.4, verwerkt volgens 5.8.6(4) (alle rekwaarden maal (1 + phi_ef)). Default 0: er wordt dan ZONDER kruip gerekend, en het antwoord meldt dat met zoveel woorden, inclusief dat de uitkomst voor blijvend belaste kolommen aan de onveilige kant is." },
                    "segment_forces": schema_segmentkrachten(),
                    "previous_ei_knm2": {
                        "type": "array",
                        "items": { "type": "number" },
                        "description": "De stijfheden in kNm2 van de vorige ronde, in dezelfde volgorde als de segmenten. Leeg = eerste ronde met krachten; convergentie is dan niet te beoordelen en het antwoord meldt dat. Een niet-lege lijst moet precies zoveel elementen tellen als er segmenten zijn."
                    },
                    "relaxation": { "type": "number", "exclusiveMinimum": 0, "maximum": 1, "default": 1,
                        "description": "Onderrelaxatie omega: EI = EI_vorig + omega*(EI_berekend - EI_vorig). 1,0 = geen relaxatie. De onbewerkte waarde blijft in `ei_raw_knm2` staan, en het convergentie-oordeel rekent met die onbewerkte waarde — relaxatie kan dus geen convergentie voorwenden." },
                    "convergence_tolerance": { "type": "number", "exclusiveMinimum": 0, "default": 0.01,
                        "description": "Tolerantie op max |EI - EI_vorig| / max(|EI|, |EI_vorig|) over alle segmenten. Default 0,01 (1 %). Een keuze, geen normwaarde." },
                    "min_ei_ratio": { "type": "number", "minimum": 0, "exclusiveMaximum": 1, "default": 0.01,
                        "description": "Ondergrens voor EI als fractie van E_c*I_c, om het globale stelsel oplosbaar te houden als een segment vrijwel op zijn momentweerstand staat. 0 = niet klemmen. Grijpt de klem in, dan staat dat per segment in `clamped` met een melding, en geldt de ronde NIET als geconvergeerd: een geklemde waarde is een numerieke ondergrens en geen rekenuitkomst. Een keuze, geen normwaarde." },
                    "n_strips": schema_n_strips(),
                    "steel_branch": schema_steel_branch(),
                    "design_situation": schema_design_situation(),
                    "load_duration": { "type": "string", "enum": ["ShortTerm", "Sustained"], "default": "ShortTerm",
                        "description": "beta van (7.19), alleen in de BGT van invloed. \"ShortTerm\" = 1,0 voor een enkele kortdurende belasting, \"Sustained\" = 0,5 voor aanhoudende belastingen of meervoudige cycli van zich herhalende belastingen (7.4.3(3))." }
                },
                "required": [
                    "beam_id", "section", "concrete_class",
                    "reinforcement_grade", "cage", "length_m"
                ]
            }
        }),
        json!({
            "name": "concrete_effective_flange_width",
            "description": "Derive the effective flange width b_eff of a T- or L-beam from EN 1992-1-1 §5.3.2.1 (all limit states): l_0 per region from figure 5.2 (end span 0,85*l1, interior support 0,15*(l1+l2), interior span 0,7*l2, cantilever 0,15*l2+l3) and then b_eff = sum(b_eff,i) + b_w <= b with b_eff,i = 0,2*b_i + 0,1*l_0 <= 0,2*l_0 and b_eff,i <= b_i, equations (5.7)/(5.7a)/(5.7b). Returns one region per figure-5.2 case with its x-range along the beam line, its l_0, the governing bound per flange part and the resulting b_eff, plus the constant-per-span fallback of §5.3.2.1(4). This tool takes the BEAM LINE (the ordered spans plus the two outer end conditions), not a model: turning nodes, beams and supports into a beam line is the caller's job. Cases outside figure 5.2 are an ERROR with the reason, never a number: a standalone cantilever, a cantilever not shorter than half the adjacent span, or an adjacent-span ratio outside 2/3 … 1,5. Same input and output types as the Tauri command and the toetsbrug opdracht of the same name.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "beam_id": { "type": "integer", "minimum": 0, "default": 0,
                        "description": "Vrij te kiezen nummer; komt onveranderd terug in het antwoord." },
                    "line": {
                        "type": "object",
                        "additionalProperties": false,
                        "description": "De doorgaande liggerlijn zoals figuur 5.2 hem tekent. Tussen twee opeenvolgende overspanningen zit per definitie een tussensteunpunt; alleen de twee buitenste uiteinden hebben een keuze.",
                        "properties": {
                            "spans_mm": {
                                "type": "array",
                                "items": { "type": "number", "exclusiveMinimum": 0 },
                                "minItems": 1,
                                "description": "De overspanningen in mm, op volgorde van `start` naar `end`. Een uitkraging is de eerste respectievelijk laatste overspanning, met het bijbehorende uiteinde op \"Free\"."
                            },
                            "start": schema_lijnuiteinde("begin (x = 0)"),
                            "end": schema_lijnuiteinde("eind (x = som van de overspanningen)")
                        },
                        "required": ["spans_mm", "start", "end"]
                    },
                    "flange": {
                        "type": "object",
                        "additionalProperties": false,
                        "description": "De flensmaten van figuur 5.3, in mm.",
                        "properties": {
                            "b_w_mm": { "type": "number", "exclusiveMinimum": 0,
                                "description": "Lijfbreedte b_w in mm." },
                            "b_i_mm": {
                                "type": "array",
                                "items": { "type": "number", "minimum": 0 },
                                "maxItems": 2,
                                "description": "De uitkragende flensdelen b_i in mm: twee voor een T-ligger, één voor een L-ligger (randligger), geen voor een rechthoek. Elke b_i is de HALVE vrije afstand tot het naastliggende lijf, of bij een rand het werkelijke overstek. b = b_w + som(b_i)."
                            }
                        },
                        "required": ["b_w_mm", "b_i_mm"]
                    }
                },
                "required": ["line", "flange"]
            }
        }),
    ]
}

/// Het uiteinde van een liggerlijn (`LineEnd`). De drie namen zijn die van de
/// Rust-enum, dus wat hier staat is wat de kern accepteert.
fn schema_lijnuiteinde(waar: &str) -> Value {
    json!({
        "type": "string",
        "enum": ["Support", "Restrained", "Free"],
        "description": format!(
            "Wat er aan het {waar} van de lijn zit. \"Support\" = buitensteunpunt dat de \
             hoekverdraaiing niet verhindert (het linker steunpunt van figuur 5.2). \
             \"Restrained\" = momentvast buitenuiteinde (inklemming of raamwerkknoop); dat \
             geval staat NIET in figuur 5.2 en wordt gelezen als een tussensteunpunt met \
             één aangrenzende overspanning — het antwoord meldt dat in `notes`. \"Free\" = \
             vrij einde, dus de buitenste overspanning is een uitkraging; zonder \
             aangrenzende overspanning is dat een fout."
        )
    })
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

    /// Het schema van `concrete_segment_stiffness` is de spiegel van
    /// `SegmentStiffnessRequest`. Dat type staat op `deny_unknown_fields` en
    /// het schema op `additionalProperties: false`, dus een veld dat aan één
    /// van de twee kanten ontbreekt maakt de tool onbruikbaar: de kern zou het
    /// weigeren, of de server zou het al voor de kern wegfilteren. De lijst
    /// hieronder is met de hand overgetypt uit `concrete-check/src/segments.rs`
    /// — juist daarom vangt hij een wijziging aan één van beide kanten.
    #[test]
    fn segmentschema_kent_alle_velden_van_het_verzoektype() {
        let def = tool_definitions()
            .into_iter()
            .find(|d| d["name"] == "concrete_segment_stiffness")
            .expect("de tool staat in de lijst");
        let velden = def["inputSchema"]["properties"]
            .as_object()
            .expect("properties");
        let verwacht = [
            "beam_id",
            "section",
            "concrete_class",
            "reinforcement_grade",
            "cage",
            "length_m",
            "target_segment_length_mm",
            "max_segments",
            "limit_state",
            "phi_ef",
            "segment_forces",
            "previous_ei_knm2",
            "relaxation",
            "convergence_tolerance",
            "min_ei_ratio",
            "n_strips",
            "steel_branch",
            "design_situation",
            "load_duration",
        ];
        for v in verwacht {
            assert!(velden.contains_key(v), "het segmentschema mist `{v}`");
        }
        assert_eq!(
            velden.len(),
            verwacht.len(),
            "het segmentschema kent een veld dat het verzoektype weigert"
        );
        // De verplichte velden zijn precies die zonder `#[serde(default)]`.
        let verplicht: Vec<&str> = def["inputSchema"]["required"]
            .as_array()
            .expect("required")
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(
            verplicht,
            vec![
                "beam_id",
                "section",
                "concrete_class",
                "reinforcement_grade",
                "cage",
                "length_m"
            ]
        );
        // De segmentkrachten weigeren zelf ook onbekende velden.
        assert_eq!(
            def["inputSchema"]["properties"]["segment_forces"]["items"]["additionalProperties"],
            json!(false)
        );
    }

    /// Het schema van `concrete_effective_flange_width` is de spiegel van
    /// `EffectiveFlangeWidthRequest`, `BeamLine` en `FlangeGeometry`. Alle drie
    /// staan op `deny_unknown_fields`, dus een veld dat aan één van beide
    /// kanten ontbreekt maakt de tool onbruikbaar. Het schema mag óók de
    /// geneste objecten geen onbekende velden laten doorlaten: een tikfout in
    /// `spans_mm` zou anders een lege lijst opleveren, en dat is een andere
    /// ligger.
    #[test]
    fn flensbreedteschema_spiegelt_het_verzoektype() {
        let def = tool_definitions()
            .into_iter()
            .find(|d| d["name"] == "concrete_effective_flange_width")
            .expect("de tool staat in de lijst");
        let velden = def["inputSchema"]["properties"]
            .as_object()
            .expect("properties");
        for v in ["beam_id", "line", "flange"] {
            assert!(velden.contains_key(v), "het flensbreedteschema mist `{v}`");
        }
        assert_eq!(velden.len(), 3);
        // `beam_id` heeft `#[serde(default)]` en is dus niet verplicht.
        let verplicht: Vec<&str> = def["inputSchema"]["required"]
            .as_array()
            .expect("required")
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(verplicht, vec!["line", "flange"]);

        let lijn = &velden["line"];
        assert_eq!(lijn["additionalProperties"], json!(false));
        let lijnvelden = lijn["properties"].as_object().expect("line.properties");
        for v in ["spans_mm", "start", "end"] {
            assert!(lijnvelden.contains_key(v), "de liggerlijn mist `{v}`");
        }
        assert_eq!(lijnvelden.len(), 3);

        let flens = &velden["flange"];
        assert_eq!(flens["additionalProperties"], json!(false));
        let flensvelden = flens["properties"].as_object().expect("flange.properties");
        for v in ["b_w_mm", "b_i_mm"] {
            assert!(flensvelden.contains_key(v), "de flens mist `{v}`");
        }
        assert_eq!(flensvelden.len(), 2);

        // De drie namen van `LineEnd` staan letterlijk in het schema; een
        // vierde naam zou de kern weigeren, een ontbrekende naam zou een
        // geldig geval onbereikbaar maken.
        assert_eq!(
            lijn["properties"]["start"]["enum"],
            json!(["Support", "Restrained", "Free"])
        );
        assert_eq!(
            lijn["properties"]["end"]["enum"],
            json!(["Support", "Restrained", "Free"])
        );
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
