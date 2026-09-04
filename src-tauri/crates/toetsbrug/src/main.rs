//! `toetsbrug` — de normtoetsing als JSON-in / JSON-uit, zodat de browser er
//! ook bij kan.
//!
//! De toetsing draait in Rust en was daardoor alleen bereikbaar vanuit de
//! desktop-app: de frontend roept hem aan via Tauri's `invoke`, en dat bestaat
//! in een gewone browser niet. Wie de app op de dev-server bekeek, kreeg overal
//! waar toetsing hoort te staan een melding dat de desktop-app nodig is — in
//! het canvas én in het rapport.
//!
//! Deze binary biedt dezelfde functies aan als de Tauri-commands, met
//! precies dezelfde typen, zodat er geen tweede implementatie ontstaat. De
//! dev-server roept hem aan (zie `vite.config.ts`) en geeft het antwoord door.
//!
//! ```text
//! echo '{"opdracht":"check_steel_beams","inputs":[…]}' | toetsbrug
//! ```
//!
//! Invoer op stdin, uitvoer op stdout, beide JSON. Een fout komt terug als
//! `{"fout": "…"}` met afsluitcode 1; de aanroeper hoeft stderr niet te lezen.

use std::io::{Read, Write};

use concrete_check::{ConcreteBeamCheckInput, MnKappaRequest};
use nen_en_1993_1_1_section::{S235, S275, S355, S420, S460};
use serde::Deserialize;
use serde_json::{json, Value};
use steel_check::BeamCheckInput;
use timber_check::clt::CltBeamCheckInput;
use timber_check::TimberBeamCheckInput;

/// Eén verzoek. `opdracht` kiest de functie; de rest hangt daarvan af.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Verzoek {
    opdracht: String,
    /// Staaltoetsing: de staven die getoetst moeten worden.
    #[serde(default)]
    inputs: Option<Value>,
}

fn main() {
    let mut ruw = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut ruw) {
        klaar(Err(format!("stdin niet leesbaar: {e}")));
    }

    let verzoek: Verzoek = match serde_json::from_str(&ruw) {
        Ok(v) => v,
        Err(e) => klaar(Err(format!("verzoek niet te lezen: {e}"))),
    };

    klaar(behandel(verzoek));
}

fn behandel(v: Verzoek) -> Result<Value, String> {
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
        // voor de wapeningskorf in de eigenschappen.
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
        andere => Err(format!("onbekende opdracht: {andere}")),
    }
}

/// Schrijf het antwoord en stop. Een fout gaat als JSON naar stdout, zodat de
/// aanroeper altijd hetzelfde formaat krijgt.
fn klaar(uitkomst: Result<Value, String>) -> ! {
    let (tekst, code) = match uitkomst {
        Ok(v) => (v.to_string(), 0),
        Err(f) => (json!({ "fout": f }).to_string(), 1),
    };
    let mut uit = std::io::stdout();
    let _ = uit.write_all(tekst.as_bytes());
    let _ = uit.flush();
    std::process::exit(code);
}
