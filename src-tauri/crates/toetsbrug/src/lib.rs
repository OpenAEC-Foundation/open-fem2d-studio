//! `toetsbrug` — de normtoetsing als JSON-in / JSON-uit, zodat de browser er
//! ook bij kan.
//!
//! De toetsing draait in Rust en was daardoor alleen bereikbaar vanuit de
//! desktop-app: de frontend roept hem aan via Tauri's `invoke`, en dat bestaat
//! in een gewone browser niet. Wie de app op de dev-server bekeek, kreeg overal
//! waar toetsing hoort te staan een melding dat de desktop-app nodig is — in
//! het canvas én in het rapport.
//!
//! Deze crate biedt dezelfde functies aan als de Tauri-commands, met precies
//! dezelfde typen, zodat er geen tweede implementatie ontstaat. De dev-server
//! roept de binary aan (zie `vite.config.ts`) en geeft het antwoord door.
//!
//! ```text
//! echo '{"opdracht":"check_steel_beams","inputs":[…]}' | toetsbrug
//! ```
//!
//! WAAROM LIB + BIN
//! [`behandel`] staat in het libdeel en niet in `main.rs`, om dezelfde reden
//! als bij `openaec-mcp-server`: zo kan een test bij de werkelijke
//! opdrachtafhandeling zonder een proces te hoeven starten. De
//! drie-wegen-verificatie (`openaec-mcp-server/tests/drie_wegen_beton.rs`)
//! vergelijkt het antwoord van déze functie met dat van de MCP-server en van
//! de rekengang achter het Tauri-command. Zonder libdeel zou die vergelijking
//! de toetsbrug moeten naprogrammeren, en dan toont ze niets aan.
//!
//! De binary is een doorgeefluik: invoer op stdin, uitvoer op stdout, beide
//! JSON. Een fout komt terug als `{"fout": "…"}` met afsluitcode 1; de
//! aanroeper hoeft stderr niet te lezen.

use concrete_check::{ConcreteBeamCheckInput, MnKappaRequest, SegmentStiffnessRequest};
use nen_en_1992_1_1::{ConcreteCoverRequest, EffectiveFlangeWidthRequest};
use nen_en_1993_1_1_section::{S235, S275, S355, S420, S460};
use nen_en_1993_1_8_las::LasInput;
use serde::Deserialize;
use serde_json::Value;
use spanning_check::SpanningBeamCheckInput;
use steel_check::BeamCheckInput;
use timber_check::clt::CltBeamCheckInput;
use timber_check::TimberBeamCheckInput;

/// Eén verzoek. `opdracht` kiest de functie; de rest hangt daarvan af.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Verzoek {
    pub opdracht: String,
    /// Staaltoetsing: de staven die getoetst moeten worden.
    #[serde(default)]
    pub inputs: Option<Value>,
}

pub fn behandel(v: Verzoek) -> Result<Value, String> {
    match v.opdracht.as_str() {
        "list_steel_profiles" => {
            serde_json::to_value(steel_profiles::db().all()).map_err(|e| e.to_string())
        }
        "list_steel_grades" => {
            serde_json::to_value(vec![S235, S275, S355, S420, S460]).map_err(|e| e.to_string())
        }
        "list_timber_grades" => {
            let klassen: Vec<String> = nen_en_1995_1_1::data::SOFTWOOD
                .iter()
                .chain(nen_en_1995_1_1::data::GLULAM.iter())
                .map(|c| c.name.to_string())
                .collect();
            serde_json::to_value(klassen).map_err(|e| e.to_string())
        }
        "check_steel_beams" => {
            let inputs = v.inputs.ok_or("check_steel_beams vraagt om `inputs`")?;
            let inputs: Vec<BeamCheckInput> =
                serde_json::from_value(inputs).map_err(|e| format!("staafinvoer: {e}"))?;
            serde_json::to_value(steel_check::check_all_beams(inputs)).map_err(|e| e.to_string())
        }
        "check_timber_beams" => {
            let inputs = v.inputs.ok_or("check_timber_beams vraagt om `inputs`")?;
            let inputs: Vec<TimberBeamCheckInput> =
                serde_json::from_value(inputs).map_err(|e| format!("staafinvoer: {e}"))?;
            let uit: Vec<_> = inputs
                .into_iter()
                .map(timber_check::check_timber_beam)
                .collect();
            serde_json::to_value(uit).map_err(|e| e.to_string())
        }
        // Kruislaaghout: standaardopbouwen (voorinstellingen) en de toetsing
        // per lamel. Zelfde typen als de Tauri-commands.
        "list_clt_presets" => {
            serde_json::to_value(nen_en_1995_1_1::clt::clt_presets()).map_err(|e| e.to_string())
        }
        "check_clt_beams" => {
            let inputs = v.inputs.ok_or("check_clt_beams vraagt om `inputs`")?;
            let inputs: Vec<CltBeamCheckInput> =
                serde_json::from_value(inputs).map_err(|e| format!("CLT-staafinvoer: {e}"))?;
            let uit: Vec<_> = inputs
                .into_iter()
                .map(timber_check::clt::check_clt_beam)
                .collect();
            serde_json::to_value(uit).map_err(|e| e.to_string())
        }
        // Beton (NEN-EN 1992-1-1): sterkteklassen met alle tabel 3.1-waarden,
        // de B500-klassen, de toetsing per staaf en het losse M-N-κ-diagram
        // voor de wapeningskorf in de eigenschappen. Deze vier zijn ook als
        // MCP-tool bereikbaar (`openaec-mcp-server/src/concrete_tools.rs`);
        // de drie wegen delen dezelfde typen en dezelfde rekengang.
        "list_concrete_classes" => {
            serde_json::to_value(nen_en_1992_1_1::CONCRETE_CLASSES).map_err(|e| e.to_string())
        }
        "list_reinforcement_grades" => {
            serde_json::to_value(nen_en_1992_1_1::REINFORCEMENT_GRADES).map_err(|e| e.to_string())
        }
        "check_concrete_beams" => {
            let inputs = v.inputs.ok_or("check_concrete_beams vraagt om `inputs`")?;
            let inputs: Vec<ConcreteBeamCheckInput> =
                serde_json::from_value(inputs).map_err(|e| format!("betonstaafinvoer: {e}"))?;
            serde_json::to_value(concrete_check::check_all_concrete_beams(inputs))
                .map_err(|e| e.to_string())
        }
        "concrete_mn_kappa" => {
            let inputs = v.inputs.ok_or("concrete_mn_kappa vraagt om `inputs`")?;
            let verzoek: MnKappaRequest =
                serde_json::from_value(inputs).map_err(|e| format!("korfinvoer: {e}"))?;
            let uit = concrete_check::mn_kappa(verzoek)?;
            serde_json::to_value(uit).map_err(|e| e.to_string())
        }
        // De stateloze stijfheidsdienst voor de fysisch niet-lineaire tweede
        // orde (5.8.6): één staaf, in segmenten, elk met zijn eigen secante
        // buigstijfheid. Zonder `segment_forces` komt alleen de indeling terug.
        "concrete_segment_stiffness" => {
            let inputs = v.inputs.ok_or("concrete_segment_stiffness vraagt om `inputs`")?;
            let verzoek: SegmentStiffnessRequest = serde_json::from_value(inputs)
                .map_err(|e| format!("segmentstijfheidsinvoer: {e}"))?;
            let uit = concrete_check::segment_stiffness(verzoek)?;
            serde_json::to_value(uit).map_err(|e| e.to_string())
        }
        // De meewerkende flensbreedte van een T- of L-ligger (5.3.2.1), per
        // gebied uit figuur 5.2. Zelfde typen als het Tauri-command en de
        // MCP-tool; er wordt hier niet gerekend.
        "concrete_effective_flange_width" => {
            let inputs = v
                .inputs
                .ok_or("concrete_effective_flange_width vraagt om `inputs`")?;
            let verzoek: EffectiveFlangeWidthRequest = serde_json::from_value(inputs)
                .map_err(|e| format!("flensbreedte-invoer: {e}"))?;
            let uit = nen_en_1992_1_1::beff::effective_flange_width_request(verzoek)?;
            serde_json::to_value(uit).map_err(|e| e.to_string())
        }
        // De milieuklassen van tabel 4.1 en de dekkingstoets van 4.4.1. Zelfde
        // typen als het Tauri-command en de MCP-tool; de rekengang staat in
        // `nen_en_1992_1_1::dekking` en nergens anders.
        "list_exposure_classes" => {
            serde_json::to_value(nen_en_1992_1_1::EXPOSURE_CLASSES).map_err(|e| e.to_string())
        }
        "concrete_cover_check" => {
            let inputs = v.inputs.ok_or("concrete_cover_check vraagt om `inputs`")?;
            let verzoek: ConcreteCoverRequest =
                serde_json::from_value(inputs).map_err(|e| format!("dekkingsinvoer: {e}"))?;
            let uit = nen_en_1992_1_1::dekking::concrete_cover_request(verzoek)?;
            serde_json::to_value(uit).map_err(|e| e.to_string())
        }
        // Vrije spanningstoets: geen norm, alleen een doorsnede en een
        // toelaatbare spanning, getoetst op de vergelijkspanning van von
        // Mises. Zelfde typen als het Tauri-command.
        "check_stress_beams" => {
            let inputs = v.inputs.ok_or("check_stress_beams vraagt om `inputs`")?;
            let inputs: Vec<SpanningBeamCheckInput> =
                serde_json::from_value(inputs).map_err(|e| format!("spanningsinvoer: {e}"))?;
            serde_json::to_value(spanning_check::check_all_spanning_beams(inputs))
                .map_err(|e| e.to_string())
        }
        // Doorlopende langslassen in een samengestelde doorsnede, getoetst
        // volgens NEN-EN 1993-1-8 4.5.3.3. De schuifstroom per naad komt van de
        // aanroeper mee (die kent de meetkunde van de doorsnede); deze kern
        // doet de normkant. Zelfde typen als het Tauri-command.
        "check_fillet_welds" => {
            let inputs = v.inputs.ok_or("check_fillet_welds vraagt om `inputs`")?;
            let inputs: Vec<LasInput> =
                serde_json::from_value(inputs).map_err(|e| format!("lasinvoer: {e}"))?;
            serde_json::to_value(nen_en_1993_1_8_las::toets_lassen(&inputs))
                .map_err(|e| e.to_string())
        }
        andere => Err(format!("onbekende opdracht: {andere}")),
    }
}
