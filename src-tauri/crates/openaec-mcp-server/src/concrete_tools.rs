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
//! `concrete_segment_stiffness`, `concrete_dekkingslijn`,
//! `concrete_effective_flange_width`,
//! `list_exposure_classes` en `concrete_cover_check` heten hier
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
//! ÉÉN SCHEMA VOOR DE BETONSTAAF
//! `check_concrete_beam` en `concrete_dekkingslijn` voeren allebei
//! `ConcreteBeamCheckInput` in — de eerste kaal, de tweede genest onder `beam`.
//! Dat is aan de Rust-kant letterlijk hetzelfde type, en daarom staat het
//! schema ervan hier in één functie ([`schema_betonstaaf`]) en niet twee keer
//! uitgeschreven: met `additionalProperties: false` zou een nieuw veld dat maar
//! aan één van beide plekken wordt bijgewerkt bij de andere tool worden
//! weggefilterd vóórdat de kern het ziet.
//!
//! STRIKTE SCHEMA'S
//! `ConcreteBeamCheckInput`, `MnKappaRequest`, `SegmentStiffnessRequest`,
//! `SegmentForces`, `DekkingslijnVerzoek`, `ReinforcementCage`, `RebarRow`,
//! `ReinforcementZones`, `LongitudinalZone` en `StirrupZone` staan alle tien op
//! `#[serde(deny_unknown_fields)]`. De schema's
//! hieronder spiegelen dat met `additionalProperties: false` en noemen ALLE
//! velden, ook die met `#[serde(default)]`. Dat is niet cosmetisch: laat een
//! client `apply_min_eccentricity` weg, dan valt hij op `true` (veilig), maar
//! `n_strips` en `steel_branch` veranderen de uitkomst, en een tikfout in een
//! veldnaam zou zonder deze strengheid stil op de standaardwaarde terugvallen.

use serde_json::{json, Value};

use crate::RpcError;

/// De tien betontools. Eén lijst, gebruikt door `is_concrete_tool`, de
/// schema's en de dispatch — zodat een tool niet in `tools/list` kan staan
/// zonder afhandeling, of andersom.
pub const CONCRETE_TOOLS: [&str; 10] = [
    "list_concrete_classes",
    "list_reinforcement_grades",
    "check_concrete_beam",
    "concrete_mn_kappa",
    "concrete_segment_stiffness",
    "concrete_column_check",
    "concrete_dekkingslijn",
    "concrete_effective_flange_width",
    "list_exposure_classes",
    "concrete_cover_check",
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
        // §5.8 los van een volledige staaftoetsing. Geen `spawn_blocking`: dit
        // is een handvol formules — l₀, λ = l₀/i, λ_lim = 20·A·B·C/√n, φ_ef en
        // zeven detailleringseisen — en geen enkele integratie over de
        // doorsnede. Dezelfde rekengang (`concrete_check::kolomtoetsen`) die
        // ook in `check_concrete_beam` zit; er is er maar één.
        "concrete_column_check" => {
            let req: concrete_check::ConcreteColumnCheckRequest = serde_json::from_value(args)
                .map_err(|e| {
                    RpcError::invalid_params(format!("ConcreteColumnCheckRequest: {e}"))
                })?;
            // Een onuitvoerbaar verzoek — onbekende sterkteklasse, een korf die
            // niet in de doorsnede past, een knikgeval dat niet bij de opgegeven
            // schoring hoort — is een toolfout MET de reden. Een leeg antwoord
            // zou als "geen tweede orde nodig" kunnen lezen, en dat is precies
            // de verkeerde kant.
            let result = concrete_check::column_check(req).map_err(RpcError::invalid_params)?;
            serde_json::to_value(result)
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        "concrete_dekkingslijn" => {
            let req: concrete_check::DekkingslijnVerzoek = serde_json::from_value(args)
                .map_err(|e| RpcError::invalid_params(format!("DekkingslijnVerzoek: {e}")))?;
            // Blokkerend werk: de lijn loopt over een raster dat per zonegrens,
            // per bundeleinde en per station ± a_l een punt krijgt, en op elk
            // van die punten wordt de hele dwarskrachttoets van §6.2 gedraaid,
            // voor elke combinatie van de omhullende. Op de stdio-lus zou dat
            // de lezer laten stilstaan.
            let result = tokio::task::spawn_blocking(move || concrete_check::dekkingslijn(req))
                .await
                .map_err(|e| RpcError::tool_exec(format!("join error: {e}")))?
                // Een onuitvoerbaar verzoek — onbekende sterkteklasse, een korf
                // die niet past, zones met een gat of een overlap, een lege
                // omhullende, of z = 0,9·d terwijl er een normaalkracht werkt —
                // is een toolfout MET de reden. Een lege lijst punten zou als
                // "overal gedekt" kunnen lezen.
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
        // Tabel 4.1, ingepakt in een object om dezelfde reden als de andere
        // lijsttools: `structuredContent` moet een object zijn.
        "list_exposure_classes" => Ok(json!({ "classes": nen_en_1992_1_1::EXPOSURE_CLASSES })),
        // De dekkingstoets (4.4.1). Geen blokkerend werk: een tabelopzoeking en
        // drie vergelijkingen. Onzinnige maten (negatief of niet-eindig) zijn
        // een toolfout MÉT de reden en geen getal — een stilzwijgend
        // teruggegeven dekking zou een balk kunnen goedkeuren die er niet is.
        "concrete_cover_check" => {
            let req: nen_en_1992_1_1::ConcreteCoverRequest = serde_json::from_value(args)
                .map_err(|e| RpcError::invalid_params(format!("ConcreteCoverRequest: {e}")))?;
            let result = nen_en_1992_1_1::dekking::concrete_cover_request(req)
                .map_err(RpcError::invalid_params)?;
            serde_json::to_value(result)
                .map_err(|e| RpcError::tool_exec(format!("serialize result: {e}")))
        }
        _ => Err(RpcError::method_not_found(naam)),
    }
}

// ── Schema's ────────────────────────────────────────────────────────────────

/// De wapeningskorf (`ReinforcementCage`). De eerste vier velden zijn
/// verplicht: de Rust-kant kent er geen standaardwaarde voor, en een
/// stilzwijgende korf zou een toetsing opleveren die bij een andere staaf
/// hoort.
///
/// De vier BEUGELVELDEN zijn optioneel en staan bewust niet in `required`.
/// Weglaten betekent "niet opgegeven": de dwarskrachttoets zegt dan dat hij
/// niet kan. Dat is iets anders dan ze op 0 zetten — een beugelafstand van 0
/// bestaat niet en wordt door de kern geweigerd. Ze moeten hier wél staan,
/// want `additionalProperties: false` zou ze anders wegfilteren voordat de
/// kern ze ziet.
///
/// De drie ZIJDEVELDEN (`cover_top`, `cover_bottom`, `cover_sides`) zijn om
/// dezelfde reden optioneel: weglaten betekent dat die zijde de dekking en de
/// milieuklasse van het ELEMENT volgt, en dat is precies het gedrag van vóór
/// deze velden.
fn schema_korf() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "Wapeningskorf: dekking, beugel, boven- en onderwapening. Er is GEEN standaardkorf; de eerste vier velden zijn verplicht. De beugelvelden (stirrup_spacing_mm, stirrup_legs, stirrup_leg_spacing_mm, stirrup_fywk_mpa) zijn optioneel; laat ze WEG als ze niet bekend zijn — 0 invullen is iets anders en wordt geweigerd. De dekking en de milieuklasse mogen PER ZIJDE afwijken via cover_top, cover_bottom en cover_sides; 4.4.1.1(1)P meet de dekking tot het DICHTSTBIJZIJNDE betonoppervlak, dus een vloer met de bovenzijde binnen (XC1) en de onderzijde buiten (XC4) heeft twee verschillende dekkingen en twee verschillende nuttige hoogtes. Weglaten = die zijde volgt cover_mm en de exposure_class van het element.",
        "required": ["cover_mm", "stirrup_diameter_mm", "top", "bottom"],
        "properties": {
            "cover_mm": { "type": "number", "minimum": 0,
                "description": "Nominale betondekking c_nom op de beugel in mm (EN 1992-1-1 §4.4.1) — de dekking van het ELEMENT, die geldt aan elke zijde die niets eigens zegt." },
            "cover_top": schema_zijdedekking(
                "de BOVENZIJDE (z = h)",
                "Stuurt de ligging van de bovenwapening en daarmee d_2."),
            "cover_bottom": schema_zijdedekking(
                "de ONDERZIJDE (z = 0)",
                "Stuurt de ligging van de onderwapening en daarmee de nuttige hoogte d."),
            "cover_sides": schema_zijdedekking(
                "de twee verticale ZIJKANTEN samen",
                "Stuurt de dwarsafstand s_t van de beugelbenen (9.2.2(8)), de vrije staafafstand (8.2(2)) en de binnenmaat waarin een rij staven moet passen - niet de nuttige hoogte. Links en rechts staan met opzet niet apart: in elke formule komt de zijdelingse dekking alleen als PAAR voor (b_w - 2c), dus een splitsing zou geen enkel getal veranderen en alleen de staafrij uit het midden schuiven. Verschillen de twee zijkanten werkelijk van milieu, vul dan de zwaarste van de twee in."),
            "stirrup_diameter_mm": { "type": "number", "minimum": 0,
                "description": "Beugeldiameter in mm; 0 = geen beugel, de hoofdwapening ligt dan direct achter de dekking." },
            "top": schema_wapeningsrij("Bovenwapening (zijde z = h)."),
            "bottom": schema_wapeningsrij("Onderwapening (zijde z = 0)."),
            "stirrup_spacing_mm": { "type": ["number", "null"], "exclusiveMinimum": 0,
                "description": "Hart-op-hartafstand s van de beugels LANGS de lengteas, in mm (§9.2.2(5)). Weglaten = niet opgegeven; zonder s zijn A_sw/s in (6.8) en rho_w in (9.4) onbepaald en meldt de dwarskrachttoets dat hij niet kan. De norm geeft hier geen aanbevolen waarde, alleen de bovengrens s_l,max." },
            "stirrup_legs": { "type": ["integer", "null"], "minimum": 1,
                "description": "Aantal beugelbenen n dat een verticale doorsnede kruist (2 bij een gewone gesloten beugel, 4 bij een dubbele). A_sw = n·(pi/4)·diameter^2. Weglaten = niet opgegeven; niet af te leiden uit dekking of diameter." },
            "stirrup_leg_spacing_mm": { "type": ["number", "null"], "exclusiveMinimum": 0,
                "description": "Hart-op-hartafstand s_t van de beugelbenen in DWARSRICHTING, in mm (§9.2.2(8)). Weglaten mag: bij een tweebenige beugel leidt de kern hem meetkundig af uit b_w, c_nom en de beugeldiameter. Bij meer benen is hij niet af te leiden en blijft 9.2.2(8) ongetoetst." },
            "stirrup_fywk_mpa": { "type": ["number", "null"], "exclusiveMinimum": 0,
                "description": "Karakteristieke vloeigrens f_ywk van de DWARSKRACHTWAPENING in N/mm². Weglaten = dezelfde staalsoort als de langswapening (reinforcement_grade); alleen invullen als de beugelkwaliteit werkelijk afwijkt." }
        }
    })
}

/// De eigen dekking en milieuklasse van één betonoppervlak (`FaceCover`).
///
/// `type: ["object","null"]`: `null` en weglaten betekenen allebei "deze zijde
/// zegt niets eigens". Dat is dezelfde vorm als de vier beugelvelden hierboven
/// en dezelfde als op de Rust-kant, waar het veld een `Option` is.
fn schema_zijdedekking(welke: &str, gevolg: &str) -> Value {
    json!({
        "type": ["object", "null"],
        "additionalProperties": false,
        "description": format!(
            "Eigen dekking en milieuklasse van {welke}. {gevolg} Weglaten of null = deze zijde \
             volgt cover_mm en de exposure_class van het element; dat is het gedrag van voor dit \
             veld en verandert geen enkel getal."
        ),
        "properties": {
            "cover_mm": { "type": ["number", "null"], "minimum": 0,
                "description": "Nominale dekking c_nom van DEZE zijde in mm. Weglaten = de dekking van het element (cover_mm van de korf)." },
            "exposure_class": {
                "type": ["string", "null"],
                "enum": [
                    "X0", "XC1", "XC2", "XC3", "XC4",
                    "XD1", "XD2", "XD3", "XS1", "XS2", "XS3",
                    "XF1", "XF2", "XF3", "XF4", "XA1", "XA2", "XA3", null
                ],
                "description": "Milieuklasse van DEZE zijde uit tabel 4.1, de ingang van tabel 4.4N voor c_min,dur. Weglaten = de milieuklasse van het element. Zie `list_exposure_classes` en `concrete_cover_check`."
            }
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

/// De acht tooldefinities voor `tools/list`.
/// Schema van `sls_frequent_envelope`.
///
/// Dezelfde vorm als de UGT-omhullende — het is dezelfde `Vec<ForcePoint>` —
/// maar met een eigen beschrijving, want het is een ANDERE
/// belastingcombinatie. De twee verwisselen is precies de fout die niemand
/// ziet: de scheurwijdte komt er dan een derde te hoog uit en de toets blijft
/// geloofwaardig ogen.
fn schema_frequente_omhullende() -> Value {
    let mut v = crate::schema_krachtenomhullende();
    v["description"] = json!(
        "Omhullende van de snedekrachten onder de FREQUENTE BGT-combinatie \
         (NEN-EN 1990 uitdrukking (6.15)) - NIET de UGT-omhullende en NIET de \
         quasi-blijvende. De nationale bijlage bij 7.3.1(5) vervangt tabel 7.1N \
         door een tabel waarvan alle kolommen de frequente combinatie noemen. \
         Art. 7.3 vraagt de staalspanning sigma_s in de gescheurde doorsnede \
         onder die combinatie; die is uit de UGT-omhullende niet af te leiden. \
         Weglaten = niet opgegeven: 7.3.2 en 7.3.4 komen dan als NotApplicable \
         terug met de reden, en er wordt geen UGT-spanning voor in de plaats \
         gezet. Eenheden kN en kNm; N positief = trek."
    );
    v
}

/// Schema van `reinforcement_zones` — de wapening die LANGS de staaf
/// verandert.
///
/// Twee gescheiden lijsten, omdat de grenzen van de langswapening (§9.2.1.3,
/// inkorting) en die van de beugels (§9.2.2, verdichting bij het steunpunt) in
/// de praktijk niet samenvallen en door verschillende toetsen worden gelezen.
/// Beide lijsten zijn optioneel en BEIDE LEEG betekent: `cage` geldt over de
/// hele staaf — het gedrag van vóór dit veld.
///
/// Het veld moet hier staan ook al is het optioneel: `additionalProperties:
/// false` zou het anders wegfilteren voordat de kern het ziet, en dan zou een
/// gebruiker die de wapening netjes per zone opgeeft langs deze weg
/// stilzwijgend met één korf over de hele staaf worden doorgerekend.
fn schema_wapeningszones() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "De wapening die LANGS de staaf verandert, in twee gescheiden lijsten: 'longitudinal' voor de inkorting van de langswapening (EN 1992-1-1 §9.2.1.3) en 'stirrups' voor de beugelverdichting (§9.2.2). BEIDE LEEG (of het hele veld weglaten) = de korf uit 'cage' geldt over de hele staaf; dat is het gedrag van voor dit veld. Is een lijst NIET leeg, dan moeten haar zones de hele staaf beslaan zonder gat en zonder overlap: een stuk zonder wapening wordt uitgedrukt met een zone met 0 staven, niet met een gat.",
        "properties": {
            "longitudinal": {
                "type": "array",
                "description": "De langswapening per stuk (§9.2.1.3 'Inkorting van op trek belaste langswapening'). Per ZIJDE (top/bottom) moeten de zones aaneensluiten en samen de hele staaf beslaan; boven en onder korten los van elkaar in en worden dus apart beoordeeld. Leeg = de rijen 'top' en 'bottom' van 'cage' gelden overal.",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["side", "row", "x_start_mm", "x_end_mm"],
                    "properties": {
                        "side": { "type": "string", "enum": ["Bottom", "Top"],
                            "description": "Aan welke zijde deze staven liggen: \"Bottom\" = onderwapening (z = 0), \"Top\" = bovenwapening (z = h). Vult respectievelijk cage.bottom en cage.top op dit stuk." },
                        "row": schema_wapeningsrij("Het aantal staven en de diameter op dit stuk. Een LEGE rij (count = 0) is geldig en betekent 'hier ligt aan deze zijde geen langswapening' - zo wordt een afgekorte staaf uitgedrukt."),
                        "x_start_mm": { "type": "number", "minimum": 0,
                            "description": "Begin van het STAAL langs de staaf, in mm vanaf het beginknoop. Dit is het fysieke staafuiteinde, niet de plaats waar de staaf zijn volle kracht levert: binnen l_bd vanaf het uiteinde telt de staaf volgens §9.2.1.3(3) LINEAIR mee (figuur 9.2)." },
                        "x_end_mm": { "type": "number", "exclusiveMinimum": 0,
                            "description": "Einde van het staal langs de staaf, in mm vanaf het beginknoop; groter dan x_start_mm en niet groter dan de staaflengte." },
                        "bar_shape": { "type": "string", "enum": ["Recht", "AndersDanRecht"], "default": "Recht",
                            "description": "Vorm van de staafeinden - tabel 8.2, regel 'Vorm van de staaf'. \"Recht\" (default) geeft alpha_1 = 1,0; \"AndersDanRecht\" (ombuiging, haak of lus volgens figuur 8.1 b/c/d) geeft bij een trekstaaf met c_d > 3*diameter alpha_1 = 0,7 en verkort l_bd dus met 30 %. Alleen invullen als de staaf werkelijk zo is gebogen." },
                        "casting_position": { "type": "string",
                            "enum": ["Onderzijde", "Bovenzijde", "Glijbekisting", "GoedAangetoond"],
                            "default": "Onderzijde",
                            "description": "Waar deze staven lagen ten opzichte van de STORTRICHTING - figuur 8.2, bepaalt eta_1 in (8.2) en dus l_bd. \"Onderzijde\" (default) = de gewone situatie bij werk ter plaatse. \"Bovenzijde\" = eta_1 = 0,7 zodra h > 250 mm. \"Glijbekisting\" = altijd eta_1 = 0,7. \"GoedAangetoond\" = eta_1 = 1,0 omdat is aangetoond dat de aanhechting goed is (art. 8.4.2(2) laat dat uitdrukkelijk toe). Dit is een UITVOERINGSgegeven dat het rekenmodel niet kan afleiden; het scheelt in l_bd een factor 1/0,7 = 1,43." }
                    }
                }
            },
            "stirrups": {
                "type": "array",
                "description": "De beugels per stuk (§9.2.2). De zones moeten aaneensluiten en samen de hele staaf beslaan. Leeg = de beugelvelden van 'cage' gelden overal. Een stuk ZONDER beugels is hierin niet uit te drukken: §6.2.1(4) eist ook zonder rekenkundige noodzaak de minimumwapening van §9.2.2, behalve bij platen met dwarsverdeling en bij elementen van ondergeschikt belang - laat voor die gevallen deze lijst leeg.",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["x_start_mm", "x_end_mm", "spacing_mm", "legs", "diameter_mm"],
                    "properties": {
                        "x_start_mm": { "type": "number", "minimum": 0,
                            "description": "Begin van de zone langs de staaf, in mm vanaf het beginknoop." },
                        "x_end_mm": { "type": "number", "exclusiveMinimum": 0,
                            "description": "Einde van de zone langs de staaf, in mm vanaf het beginknoop; groter dan x_start_mm en niet groter dan de staaflengte." },
                        "spacing_mm": { "type": "number", "exclusiveMinimum": 0,
                            "description": "Hart-op-hartafstand s van de beugels LANGS de lengteas, in mm - symbool s in (9.4), begrensd door s_l,max in §9.2.2(6). In een zone VERPLICHT: wie een stuk staaf apart benoemt, zegt daarmee wat er ligt." },
                        "legs": { "type": "integer", "minimum": 1,
                            "description": "Aantal beugelbenen n dat een verticale doorsnede kruist (§9.2.2(5)); A_sw = n*(pi/4)*diameter^2. In een zone VERPLICHT en ten minste 1." },
                        "diameter_mm": { "type": "number", "exclusiveMinimum": 0,
                            "description": "Beugeldiameter in mm. In een zone VERPLICHT en groter dan 0; de nationale bijlage bij §9.2.2(9) eist bovendien ten minste 5 mm, wat de detailleringstoets nakijkt." }
                    }
                }
            }
        }
    })
}

/// Schema van `exposure_class`. Dezelfde opsomming als bij
/// `concrete_cover_check`; hier is hij de ingang van tabel 7.1N in plaats van
/// tabel 4.4N.
fn schema_milieuklasse() -> Value {
    json!({
        "type": "string",
        "enum": ["X0", "XC1", "XC2", "XC3", "XC4", "XD1", "XD2", "XD3",
                 "XS1", "XS2", "XS3", "XF1", "XF2", "XF3", "XF4",
                 "XA1", "XA2", "XA3"],
        "description": "Milieuklasse van het ELEMENT uit tabel 4.1 - de enige ingang van de door de nationale bijlage vervangen tabel 7.1N, en dus van w_max. Betonstaal: X0/XC1 -> 0,40 mm; XC2-XC4 -> 0,30 mm; XD en XS -> 0,20 mm. Voor XF en XA geeft tabel 7.1N geen w_max en meldt de toets dat. Dit is tevens de terugval voor de zijden die in de korf (cover_top / cover_bottom / cover_sides) geen eigen klasse dragen. Weglaten = niet opgegeven; er is met opzet geen standaardklasse, want die zou een scheurwijdte kunnen goedkeuren die bij het werkelijke milieu veel te groot is. Zie `list_exposure_classes`."
    })
}

/// Schema van `structural_class`. Dezelfde opsomming als bij
/// `concrete_cover_check`.
fn schema_constructieklasse() -> Value {
    json!({
        "type": "string",
        "enum": ["S1", "S2", "S3", "S4", "S5", "S6"],
        "description": "Constructieklasse van het ELEMENT (4.4.1.2(5)), de rij-ingang van tabel 4.4N. Weglaten = S4, de waarde die de nationale bijlage voorschrijft voor een ontwerplevensduur van 50 jaar. De klasse staat NIET per zijde: alle vijf de criteria van de door de nationale bijlage vervangen tabel 4.3N (ontwerplevensduur 100 jaar, ontwerplevensduur 75 jaar, sterkteklasse, element met plaatgeometrie, gewaarborgde kwaliteitsbeheersing) zijn eigenschappen van het element. De klasse wordt niet uit die tabel afgeleid; zij is invoer."
    })
}

/// Schema van `column` — de §5.8-gegevens van een op druk belast element.
///
/// GESCHOORD IS VERPLICHT ZODRA DIT BLOK BESTAAT, en dat is geen strengheid om
/// de strengheid: §5.8.1 definieert geschoord als een ONTWERPAANNAME en niet
/// als een eigenschap van de constructie, en het verschil is groot — een factor
/// twee in l₀ tussen (5.15) en (5.16), en C = 0,7 die voor een ongeschoord
/// element is voorgeschreven terwijl een geschoorde kolom C > 1,7 kan halen.
/// Een standaardwaarde zou dat besluit stilzwijgend nemen.
fn schema_kolom() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "description": "De §5.8-gegevens van een op DRUK belast element: het ontwerpbesluit geschoord/ongeschoord, de kniklengte, de kruip en de twee keuzen die §9.5 nodig heeft. Weglaten = niet opgegeven; staat er normaaldruk op de staaf, dan komt §5.8.3.1 als NotApplicable terug met de reden, en staat er geen druk op, dan meldt de toets dat §5.8 niet van toepassing is. Er wordt nooit iets aangenomen.",
        "properties": {
            "bracing": {
                "type": "string",
                "enum": ["Geschoord", "Ongeschoord"],
                "description": "Draagt dit element bij aan de horizontale stabiliteit? (§5.8.1). VERPLICHT en zonder standaardwaarde: de norm noemt dit tweemaal letterlijk iets dat 'in de berekeningen is aangenomen'. Geschoord = het element draagt NIET bij aan de stabiliteit; Ongeschoord (schorend) = het draagt er wel aan bij en krijgt daarmee C = 0,7 opgelegd."
            },
            "buckling_length": {
                "type": "object",
                "description": "Hoe l0 wordt bepaald. Twee wegen: een vast geval uit figuur 5.7, of l0 rechtstreeks. De vakjes f) en g) van figuur 5.7 (gedeeltelijke inklemming, vergelijkingen (5.15) en (5.16)) worden hier NIET aangeboden: die vragen k = (theta/M)*(EI/l) per staafeind, inclusief het effect van scheurvorming in de verhinderende elementen (§5.8.3.2(5)), en dat getal is uit een raamwerkmodel niet af te lezen. Wie het wel heeft, rekent (5.15)/(5.16) uit en vult de uitkomst in als 'Opgegeven'.",
                "oneOf": [
                    {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "soort": { "const": "Figuur57" },
                            "geval": {
                                "type": "string",
                                "enum": ["ScharnierendScharnierend", "Console", "IngeklemdScharnierend",
                                         "TweezijdigIngeklemdGeschoord", "TweezijdigIngeklemdOngeschoord"],
                                "description": "Het vakje uit figuur 5.7. a) ScharnierendScharnierend: l0 = l, geschoord. b) Console: l0 = 2l, ongeschoord (een console houdt zichzelf overeind). c) IngeklemdScharnierend: l0 = 0,7l, geschoord. d) TweezijdigIngeklemdGeschoord: l0 = l/2. e) TweezijdigIngeklemdOngeschoord: l0 = l, rotatie verhinderd maar bovenaan zijdelings vrij. Het geval moet bij `bracing` passen; doet het dat niet, dan komt er een leesbare fout en geen getal."
                            }
                        },
                        "required": ["soort", "geval"]
                    },
                    {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "soort": { "const": "Opgegeven" },
                            "l0_m": { "type": "number", "exclusiveMinimum": 0,
                                "description": "De kniklengte l0 in m, rechtstreeks. Voor wie (5.15), (5.16) of (5.17) zelf heeft doorgerekend of een aparte knikanalyse heeft gedaan; de afleiding legt dan vast DAT l0 is opgegeven en niet waaruit." }
                        },
                        "required": ["soort", "l0_m"]
                    }
                ]
            },
            "phi_inf_t0": { "type": "number", "minimum": 0,
                "description": "Eindwaarde van de kruipcoefficient phi(oneindig,t0) volgens §3.1.4. Weglaten = niet opgegeven; §3.1.4 wordt niet gerekend (dat vraagt de relatieve luchtvochtigheid, de fictieve dikte h0, de cementklasse en de ouderdom t0). Zonder deze waarde blijft phi_ef onbekend en staat §5.8.3.1(1) A = 0,7 toe - GEEN veilige kant maar de waarde bij phi_ef van ongeveer 2,14." },
            "stirrup_zone": {
                "type": "string",
                "enum": ["Regulier", "BijBalkOfPlaat", "BijOverlappingslas"],
                "description": "Waar in de kolom ligt de beschouwde doorsnede, voor s_cl,tmax (§9.5.3(4))? Regulier = de volle waarde van §9.5.3(3). BijBalkOfPlaat = binnen een afstand gelijk aan de grootste kolomafmeting boven of onder een balk of plaat: maal 0,6. BijOverlappingslas = nabij een overlappingslas met Phi_l groter dan 14 mm: maal 0,6. Weglaten = niet opgegeven; s_cl,tmax komt dan als NotApplicable terug. 'Regulier' wordt NIET aangenomen: dat is de ruimste tak."
            },
            "lap_situation": {
                "type": "string",
                "enum": ["GeenLassen", "LassenBuitenDezeDoorsnede", "TerPlaatseVanLas"],
                "description": "Overlappingssituatie voor A_s,max (NB bij §9.5.2(3)): GeenLassen en TerPlaatseVanLas geven 0,08*A_c, LassenBuitenDezeDoorsnede 0,04*A_c. Weglaten = niet opgegeven; A_s,max komt dan als NotApplicable terug. Er wordt niets aangenomen: het verschil is een factor twee en 'geen lassen' is de ruimste tak."
            }
        },
        "required": ["bracing", "buckling_length"]
    })
}

/// Schema van `sls_quasi_permanent_envelope` — de derde omhullende.
fn schema_quasi_blijvende_omhullende() -> Value {
    let mut v = crate::schema_krachtenomhullende();
    v["description"] = json!(
        "Krachtsverloop onder de QUASI-BLIJVENDE BGT-combinatie, NEN-EN 1990 uitdrukking (6.16). \
         Uitsluitend voor M_0Eqp in (5.19), de effectieve kruipcoefficient van §5.8.4 - die \
         paragraaf koppelt phi_ef uitdrukkelijk aan deze combinatie. Niet uitwisselbaar met \
         `sls_frequent_envelope` (6.15), die voor de scheurwijdte van §7.3 dient: (6.15) als \
         (6.16) lezen geeft een te grote phi_ef en andersom een te kleine. Weglaten = phi_ef blijft \
         onbekend en §5.8.3.1(1) staat dan A = 0,7 toe, met die melding in het rapport."
    );
    v
}

/// Het schema van `ConcreteBeamCheckInput` — de betonstaaf zelf.
///
/// EEN FUNCTIE EN GEEN TWEE INLINE BLOKKEN. Twee tools voeren dit type in:
/// `check_concrete_beam` (kaal, als het hele verzoek) en
/// `concrete_dekkingslijn` (genest, als het veld `beam`). De Rust-kant deelt
/// letterlijk hetzelfde type — dat is de reden dat de dekkingslijn geen tweede,
/// bijna gelijk invoertype heeft gekregen — en een tweede overgetypt schema
/// hier zou dat weer uit elkaar trekken: een nieuw veld op de betonstaaf zou
/// dan door `additionalProperties: false` bij één van de twee tools worden
/// weggefilterd vóórdat de kern het ziet.
fn schema_betonstaaf() -> Value {
    json!({
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
            "reinforcement_zones": schema_wapeningszones(),
            "length_m": { "type": "number",
                "description": "Staaflengte in m. Alleen voor de rapportage; deze toets kent geen knik." },
            "forces_envelope": crate::schema_krachtenomhullende(),
            "n_strips": schema_n_strips(),
            "steel_branch": schema_steel_branch(),
            "design_situation": schema_design_situation(),
            "apply_min_eccentricity": { "type": "boolean", "default": true,
                "description": "Minimale excentriciteit e_0 = max(h/30; 20 mm) toepassen bij druk (6.1(4)). Default true; op false zetten maakt de toets GUNSTIGER en hoort alleen bij het narekenen van een uitwerking die die regel niet toepast." },
            "sls_frequent_envelope": schema_frequente_omhullende(),
            "exposure_class": schema_milieuklasse(),
            "structural_class": schema_constructieklasse(),
            "aggregate_size_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Grootste nominale korrelafmeting d_g in mm, voor de vrije staafafstand van 8.2(2) en de minimale balkbreedte van 9.2(1)e. Weglaten = niet opgegeven; de norm kent GEEN standaardwaarde (d_g hoort bij de betonspecificatie), dus er wordt er ook geen aangenomen en 8.2(2) doet dan alleen de uitspraak die hoe dan ook geldt." },
            "structural_system": schema_constructievorm(),
            "bar_spacing_mm": { "type": "number", "exclusiveMinimum": 0,
                "description": "Werkelijke hart-op-hartafstand van de trekstaven in mm, voor (7.11) en tabel 7.3N. Weglaten = de afstand wordt uit de korf afgeleid (zuivere meetkunde: een rij gelijkmatig verdeeld tussen de beugelbenen), en dat staat dan in de afleiding." },
            "sls_quasi_permanent_envelope": schema_quasi_blijvende_omhullende(),
            "column": schema_kolom()
        },
        "required": [
            "beam_id", "section", "concrete_class",
            "reinforcement_grade", "cage", "length_m", "forces_envelope"
        ]
    })
}

/// Schema van `structural_system` - de regel uit tabel 7.4N.
fn schema_constructievorm() -> Value {
    json!({
        "type": "string",
        "enum": ["SimplySupported", "EndSpan", "InteriorSpan", "FlatSlab", "Cantilever"],
        "description": "De regel uit tabel 7.4N voor de slankheidstoets van 7.4.2, met K = 1,0 / 1,3 / 1,5 / 1,2 / 0,4. SimplySupported = vrij opgelegde ligger of vrij opgelegde plaat; EndSpan = eindveld van een doorgaande ligger of plaat; InteriorSpan = tussenveld; FlatSlab = vlakke plaatvloer, op basis van de LANGSTE overspanning; Cantilever = uitkraging. Weglaten = niet opgegeven: dit is niet uit een raamwerkmodel af te leiden, dus 7.4.2 komt dan als NotApplicable terug met de reden."
    })
}

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
            "description": "Run the EN 1992-1-1 concrete cross-section check on a single reinforced beam or column (rectangle, T or L). Fifteen checks: bending with the rectangular stress block (3.1.7(3)); bending with axial force through the M-N-kappa relation including the minimum eccentricity of 6.1(4); shear 6.2 (V_Rd,c per (6.2.a)/(6.2.b) or the truss model (6.8)/(6.9)); minimum reinforcement for crack control 7.3.2 and the calculated crack width 7.3.4, both under the FREQUENT SLS combination that the Dutch national annex to 7.3.1(5) prescribes; the span/depth ratio of 7.4.2; and nine detailing rules from 9.2.1, 9.2.2 and 8.2. A check whose input is missing (no stirrup spacing, no sls_frequent_envelope, no exposure_class, no structural_system, no aggregate_size_mm) comes back with status NotApplicable and the reason in its notes: it is never silently dropped, never reported as passing, and nothing is assumed in its place. Returns a ConcreteBeamCheckResult with the full derivation, the M-kappa diagram at the governing axial force and both N-M interaction diagrams. Same input and output types as the Tauri command `check_concrete_beams` and the toetsbrug opdracht of that name - those take a list, this one takes a single beam, exactly like `check_steel_beam`. The reinforcement may VARY ALONG THE MEMBER through `reinforcement_zones` (curtailment of the longitudinal bars per 9.2.1.3, stirrup spacing per 9.2.2); leaving that field out means the single cage in `cage` applies over the whole member. NOT included: torsion, punching shear, fatigue, second-order effects, and the table route of 7.3.3 (the direct calculation of 7.3.4 is made instead; the two are alternatives).",
            "inputSchema": schema_betonstaaf()
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
            "name": "concrete_column_check",
            "description": "Run the EN 1992-1-1 §5.8 slenderness gate on ONE compression member, plus the column detailing rules of §9.5 - without running a full cross-section check. Returns the effective length l0 (figure 5.7, or given directly), the slenderness lambda = l0/i of (5.14) computed on the UNCRACKED concrete section per 5.8.3.2(1), and the limit lambda_lim = 20*A*B*C/sqrt(n). That limit is NOT the EN recommendation: the Dutch national annex struck the note containing (5.13N) and reinstated the identical formula as a REQUIREMENT ('De waarde van lambda_lim moet gelijk aan 20*A*B*C/sqrt(n) zijn genomen'). lambda < lambda_lim means 5.8.3.1(1) permits SECOND-ORDER EFFECTS TO BE NEGLECTED; lambda >= lambda_lim does NOT mean the column fails - it means the internal forces must come from a second-order analysis (§5.8.6; in this app the physically non-linear route through `concrete_segment_stiffness`). This tool cannot see whether the envelope you pass already is second order, and says so in its notes. BRACED OR UNBRACED IS INPUT, NEVER DERIVED: §5.8.1 defines it twice over as something 'assumed in the design', a frame with a bracing wall looks identical to one without in a 2D model, and the difference is a factor two in l0 between (5.15) and (5.16) plus C = 0,7 imposed on any unbraced member. Also computes the effective creep ratio phi_ef of (5.19) from the QUASI-PERMANENT SLS combination (6.16) when phi(inf,t0) and that envelope are supplied, and evaluates the three conditions of 5.8.4(4) under which phi_ef = 0 may be used. The two end moments M01 and M02 for C = 1,7 - rm are read from the envelope of the governing combination, and the presence of TRANSVERSE LOADING is established from the moment diagram (a larger |M| between the ends than at either end) rather than asked - a member with wind on it falls in the rm = 1,0 branch whether the user knows it or not. §9.5.2(4) (a bar in every corner) and §9.5.3(6) (every corner bar restrained, no bar further than 150 mm from a restrained bar) are NOT checked: the cage model has only a top and a bottom row, so the position of each bar in the plane of the section is unknown; the reasons are returned as notes. Same input type (ConcreteColumnCheckRequest), output type (ConcreteColumnCheckResponse) and calculation path as the Tauri command `concrete_column_check` and the toetsbrug opdracht of that name; the same path also runs inside `check_concrete_beam`.",
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
                        "description": "De VRIJE lengte l tussen de eindaansluitingen, in m (§5.8.3.2(3)) - de lengte waarmee de l0-factor van figuur 5.7 wordt vermenigvuldigd." },
                    "forces_envelope": crate::schema_krachtenomhullende(),
                    "sls_quasi_permanent_envelope": schema_quasi_blijvende_omhullende(),
                    "column": schema_kolom(),
                    "steel_branch": schema_steel_branch(),
                    "design_situation": schema_design_situation()
                },
                "required": [
                    "beam_id", "section", "concrete_class", "reinforcement_grade",
                    "cage", "length_m", "column", "forces_envelope"
                ]
            }
        }),
        json!({
            "name": "concrete_dekkingslijn",
            "description": "Curtailment diagram (Dutch: dekkingslijn) of ONE reinforced-concrete member as DATA, not as a picture: EN 1992-1-1 figure 9.2 of §9.2.1.3 for the longitudinal bars, and §6.2 for the shear. Per position along the member you get the REQUIRED and the AVAILABLE value with the evidence that applied there. For bending these are FORCES, exactly as figure 9.2 draws them: line A = the envelope of M_Ed/z + N_Ed, line B = A after the shift over a_l of 9.2.1.3(2)/(9.2), line C = the resisting tensile force of the bars actually present, full where they are developed and dropping LINEARLY to zero within l_bd of each bar end (9.2.1.3(3)). With an ENVELOPE of many combinations 'the unfavourable direction' of 6.2.2(5) has no single direction, so the shift is read pointwise as the maximum of A over the closed window [x - a_l, x + a_l]; that coincides with the norm wherever the norm is unambiguous and is never below it elsewhere. For shear each point carries ONE V_Rd with the route that produced it: V_Rd,c and V_Rd,s are NOT added anywhere - 6.2.1(2) gives V_Rd = V_Rd,s + V_ccd + V_td without a concrete term, 6.2.3(3) calls V_Rd 'the smallest value of' (6.8) and (6.9), and 6.2.1(3) is a second, separate line of proof. At every reinforcement-zone boundary the resistance JUMPS, so two points share the same x, one marked Links (left) and one Rechts (right); interpolating across a jump has no meaning. Also returns the bar bundles with the full l_bd derivation of §8.4, and the end-support requirements of §9.2.1.4/§9.2.1.5 at both member ends (the required LENGTH is reported, not judged: 9.2.1.4(3) measures it from the tangent between beam and support, and this model has point supports without a bearing face). A COMPRESSIVE N_Ed is deliberately not offset against the tensile force (the safe side); the value is reported per point so the report can show what was left out. 6.2.1(8) is not applied, for the same reason: no bearing face, no face of support. NOT included: bent-up bars (9.2.1.3(4)), lap lengths (8.7.3), and the beta reduction of 6.2.2(6) - that applies to ONE section with a caller-supplied a_v and would be wrong to apply along a whole line. The member is described by the SAME ConcreteBeamCheckInput type as `check_concrete_beam`, nested under `beam`, so there is no second input type and no second caller-side builder. Same input type (DekkingslijnVerzoek) and output type (DekkingslijnAntwoord) as the Tauri command `concrete_dekkingslijn` and the toetsbrug opdracht of that name.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "beam": schema_betonstaaf(),
                    "z_mm": { "type": "number", "exclusiveMinimum": 0,
                        "description": "De inwendige hefboomsarm z in mm waarmee figuur 9.2 het moment op kracht omrekent (F = M_Ed/z). Weglaten = z = 0,9*d per snede volgens 6.2.3(1), maar dat mag UITSLUITEND \"voor gewapend beton zonder normaalkracht\". Werkt er wel een normaalkracht in de omhullende, dan is het verzoek een FOUT met die reden en komt er geen lijn: stilzwijgend 0,9*d invullen zou de benodigde trekkracht te laag maken." },
                    "c_d_mm": { "type": "number", "minimum": 0,
                        "description": "c_d volgens figuur 8.3 in mm - de maat die alpha_2 van tabel 8.2 bepaalt. Weglaten = 0 mm, de ONBEPAALDE waarde: alle alfa-factoren worden 1,0 en l_bd is maximaal, dus de schuine takken van figuur 9.2 zijn zo lang als de norm ze kan maken. Dat is de veilige kant. Gevolg: een omgebogen staafeinde verkort l_bd dan NIET, want alpha_1 = 0,7 vergt c_d > 3*Phi." },
                    "a_sl_mm2": { "type": "number", "minimum": 0,
                        "description": "A_sl in mm2 volgens 6.2.2(1): de trekwapening die >= (l_bd + d) voorbij de beschouwde doorsnede DOORLOOPT (figuur 6.3). Weglaten = de trekrij van de korf die op die plaats geldt; met wapeningszones volgt dat de staffeling, maar het is nog niet de doorloopeis. Elk punt van de dwarskrachtlijn meldt daarom zowel de gebruikte A_sl als de deelverzameling die aantoonbaar naar beide kanten ver genoeg doorloopt." },
                    "cot_theta": { "type": "number", "minimum": 1, "maximum": 2.5,
                        "description": "cot theta van de betondrukdiagonaal, binnen 1,0 <= cot theta <= 2,5 (NB bij 6.2.3(2)). Weglaten = de dwarskrachttoets kiest theta per snede zelf, en voor de verschuiving a_l wordt de bovengrens 2,5 aangehouden: een grotere cot theta geeft volgens (9.2) een grotere a_l en dus een zwaardere eis." }
                },
                "required": ["beam"]
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
                    },
                    "x_mm": { "type": "number",
                        "description": "Optioneel. De plaats langs de liggerlijn (mm vanaf `line.start`) waarvoor de afleiding wordt uitgeschreven — meestal het midden van de staaf die b_eff gaat gebruiken. Staat hij erin, dan draagt het antwoord `applied` met het gebied waarin die plaats valt, de b_eff van dat gebied en de UITGESCHREVEN AFLEIDING: de liggerlijn met haar uiteinden, l_0 met de overspanningen ingevuld, b_eff,i per flensdeel met de drie grenzen van (5.7a)/(5.7b) naast elkaar en de grens die won, b_eff volgens (5.7), en de geldigheidsvoorwaarden uit de OPMERKING bij figuur 5.2 met hun getallen. Blijft hij weg, dan is `applied` null en komt alleen de verdeling terug. Een plaats buiten [0, som van de overspanningen] levert eveneens null." }
                },
                "required": ["line", "flange"]
            }
        }),
        json!({
            "name": "list_exposure_classes",
            "description": "List the EN 1992-1-1 table 4.1 exposure classes (X0, XC1-XC4, XD1-XD3, XS1-XS3, XF1-XF4, XA1-XA3) with the environment description and the informative examples straight from the table, plus the column each class maps to in table 4.4N ('cover_column'); XF and XA have no column because table 4.4N does not list them. Same list as the Tauri command and the toetsbrug opdracht of the same name, wrapped in a 'classes' object.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        }),
        json!({
            "name": "concrete_cover_check",
            "description": "Check a nominal concrete cover against the exposure class per EN 1992-1-1 §4.4.1 AS AMENDED BY THE DUTCH NATIONAL ANNEX. c_min,dur comes from table 4.4N in the NB version (which differs from the EN version in the XD3/XS3 column), c_min,b from table 4.2 (bar diameter), and then c_min = max{c_min,b; c_min,dur + 0 - 0 - 0; 10 mm} (4.2) and c_nom = c_min + 5 mm (4.1, NB value of delta c_dev; the EN recommends 10 mm). Returns the whole chain plus a unity check c_nom,required / c_nom,provided. THIS IS A CHECK OF ONE CONCRETE SURFACE: 4.4.1.1(1)P measures the cover to 'the nearest concrete surface', so a member whose top is indoors (XC1) and whose soffit is outdoors (XC4) has two different covers and two different effective depths. Call the tool once per side and say which one through 'side'; that field changes no number, it labels the answer. The structural class is INPUT (default S4, the NB value for a 50-year design life), is not derived from table 4.3N, and belongs to the MEMBER, not to a side - all five criteria of the NB version of table 4.3N are member properties. NOT included: the +5 mm for aggregate over 32 mm, uneven surfaces (4.4.1.2(11)), abrasion classes XM1-XM3, and prestressing steel (table 4.5N). Same input and output types as the Tauri command and the toetsbrug opdracht of the same name.",
            "inputSchema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "beam_id": { "type": "integer", "minimum": 0,
                        "description": "Staafnummer; komt onveranderd terug in het resultaat." },
                    "side": {
                        "type": ["string", "null"],
                        "enum": ["Top", "Bottom", "Sides", null],
                        "description": "Welk betonoppervlak dit verzoek betreft (4.4.1.1(1)P): \"Top\" = bovenzijde, \"Bottom\" = onderzijde, \"Sides\" = de twee verticale zijkanten samen. Weglaten of null = niet benoemd, en dan is het antwoord een dekkingstoets zonder zijde. Het veld verandert de berekening niet; het reist mee zodat drie antwoorden naast elkaar uit elkaar te houden zijn."
                    },
                    "exposure_class": {
                        "type": "string",
                        "enum": ["X0", "XC1", "XC2", "XC3", "XC4", "XD1", "XD2", "XD3",
                                 "XS1", "XS2", "XS3", "XF1", "XF2", "XF3", "XF4",
                                 "XA1", "XA2", "XA3"],
                        "description": "Milieuklasse uit tabel 4.1 van de zijde in 'side' (of van het element als er geen zijde is benoemd). Bij XF en XA geeft tabel 4.4N geen c_min,dur — 4.4.1.2(12) regelt die klassen via de betonsamenstelling (EN 206-1) — en blijven alleen de aanhechtingseis en de ondergrens van 10 mm over."
                    },
                    "structural_class": {
                        "type": ["string", "null"],
                        "enum": ["S1", "S2", "S3", "S4", "S5", "S6", null],
                        "description": "Constructieklasse van het ELEMENT. Weglaten of null = S4, de NB-waarde voor een ontwerplevensduur van 50 jaar. Wordt NIET automatisch aangepast volgens tabel 4.3N, en staat niet per zijde: alle vijf de criteria van die tabel zijn eigenschappen van het element."
                    },
                    "cover_mm": { "type": "number", "minimum": 0,
                        "description": "De opgegeven nominale dekking c_nom in mm, gemeten tot de buitenste wapening (4.4.1.1(1)P)." },
                    "stirrup_diameter_mm": { "type": "number", "minimum": 0,
                        "description": "Beugeldiameter in mm; 0 of weglaten = geen beugel, en dan is de hoofdwapening de buitenste wapening." },
                    "max_bar_diameter_mm": { "type": "number", "minimum": 0,
                        "description": "De grootste diameter van de hoofdwapening in mm, voor c_min,b uit tabel 4.2." }
                },
                "required": ["exposure_class", "cover_mm"]
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
        for v in ["beam_id", "line", "flange", "x_mm"] {
            assert!(velden.contains_key(v), "het flensbreedteschema mist `{v}`");
        }
        assert_eq!(velden.len(), 4);
        // `beam_id` en `x_mm` hebben `#[serde(default)]` en zijn dus niet
        // verplicht. Zonder `x_mm` komt er geen uitgeschreven afleiding terug —
        // dat is de bedoelde uitkomst en geen fout.
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
        for veld in [
            "cover_mm",
            "stirrup_diameter_mm",
            "top",
            "bottom",
            "stirrup_spacing_mm",
            "stirrup_legs",
            "stirrup_leg_spacing_mm",
            "stirrup_fywk_mpa",
            // De dekking per betonoppervlak (4.4.1.1(1)P).
            "cover_top",
            "cover_bottom",
            "cover_sides",
        ] {
            assert!(velden.contains_key(veld), "korfschema mist `{veld}`");
        }
        assert_eq!(velden.len(), 11, "korfschema kent een veld dat de kern weigert");
        // Elke zijde draagt precies twee gegevens: zijn dekking en zijn
        // milieuklasse. Meer zou `additionalProperties: false` op de kern
        // laten stuklopen, minder zou een geldig geval onbereikbaar maken.
        for zijde in ["cover_top", "cover_bottom", "cover_sides"] {
            let z = &korf["properties"][zijde]["properties"];
            assert!(z["cover_mm"].is_object(), "{zijde}");
            assert!(z["exposure_class"].is_object(), "{zijde}");
            assert_eq!(z.as_object().unwrap().len(), 2, "{zijde}");
            // `null` moet mogen: dat is hoe "deze zijde volgt het element"
            // over de lijn gaat.
            assert_eq!(korf["properties"][zijde]["type"], json!(["object", "null"]));
        }
        for zijde in ["top", "bottom"] {
            let rij = &korf["properties"][zijde]["properties"];
            assert!(rij["count"].is_object());
            assert!(rij["diameter_mm"].is_object());
            assert_eq!(rij.as_object().unwrap().len(), 2);
        }
    }

    /// De vier beugelvelden zijn OPTIONEEL. Zouden ze in `required` komen te
    /// staan, dan zou geen enkel bestaand project nog door de MCP-weg passen —
    /// en zou de app de gebruiker dwingen een ontwerpkeuze te verzinnen die de
    /// norm nergens voorschrijft.
    #[test]
    fn de_beugelvelden_staan_niet_in_required() {
        let korf = schema_korf();
        assert_eq!(korf["required"], json!(["cover_mm", "stirrup_diameter_mm", "top", "bottom"]));
        // En nul is geen geldige waarde: leeglaten is de manier om "niet
        // opgegeven" te zeggen, precies zoals `ReinforcementCage::validate`.
        for veld in ["stirrup_spacing_mm", "stirrup_leg_spacing_mm", "stirrup_fywk_mpa"] {
            assert_eq!(korf["properties"][veld]["exclusiveMinimum"], json!(0), "{veld}");
        }
        assert_eq!(korf["properties"]["stirrup_legs"]["minimum"], json!(1));
    }
}
