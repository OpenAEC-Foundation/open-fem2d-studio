use concrete_check::{
    ConcreteBeamCheckInput, ConcreteBeamCheckResult, MnKappaRequest, MnKappaResponse,
};
use nen_en_1992_1_1::{ConcreteClass, ReinforcementGrade};
use nen_en_1993_1_1_section::{S235, S275, S355, S420, S460, SteelGrade};
use nen_en_1995_1_1::clt::CltPreset;
use report::{ReportInput, generate_report_pdf};
use spanning_check::{SpanningBeamCheckInput, SpanningBeamCheckResult};
use steel_check::{BeamCheckInput, BeamCheckResult};
use steel_profiles::SteelProfile;
use timber_check::clt::{CltBeamCheckInput, CltBeamCheckResult};
use timber_check::{TimberBeamCheckInput, TimberBeamCheckResult};

// De commands hieronder zijn één-op-één gespiegeld in `crates/toetsbrug`
// (dezelfde functies als JSON-in/JSON-uit voor de browser). Wie hier een
// command toevoegt, voegt hem daar ook toe — anders werkt hij alleen in de
// desktop-app.

#[tauri::command]
fn list_steel_profiles() -> Vec<SteelProfile> {
    steel_profiles::db().all().to_vec()
}

#[tauri::command]
fn list_steel_grades() -> Vec<SteelGrade> {
    vec![S235, S275, S355, S420, S460]
}

#[tauri::command]
async fn check_steel_beams(inputs: Vec<BeamCheckInput>) -> Result<Vec<BeamCheckResult>, String> {
    Ok(steel_check::check_all_beams(inputs))
}

/// Sterkteklassen die de EN 1995-kern ondersteunt (EN 338 naaldhout +
/// EN 14080 gelamineerd hout). De frontend gebruikt deze lijst om te bepalen
/// welke houtmaterialen toetsbaar zijn.
#[tauri::command]
fn list_timber_grades() -> Vec<String> {
    nen_en_1995_1_1::data::SOFTWOOD
        .iter()
        .chain(nen_en_1995_1_1::data::GLULAM.iter())
        .map(|c| c.name.to_string())
        .collect()
}

#[tauri::command]
async fn check_timber_beams(
    inputs: Vec<TimberBeamCheckInput>,
) -> Result<Vec<TimberBeamCheckResult>, String> {
    Ok(inputs
        .into_iter()
        .map(timber_check::check_timber_beam)
        .collect())
}

/// Kruislaaghout: standaardopbouwen voor de profielkiezer.
#[tauri::command]
fn list_clt_presets() -> Vec<CltPreset> {
    nen_en_1995_1_1::clt::clt_presets()
}

/// Kruislaaghout: toetsing per lamel (samengestelde doorsnede, bijlage B
/// met starre verbinding).
#[tauri::command]
async fn check_clt_beams(
    inputs: Vec<CltBeamCheckInput>,
) -> Result<Vec<CltBeamCheckResult>, String> {
    Ok(inputs
        .into_iter()
        .map(timber_check::clt::check_clt_beam)
        .collect())
}

/// Beton (NEN-EN 1992-1-1): sterkteklassen met alle waarden uit tabel 3.1.
#[tauri::command]
fn list_concrete_classes() -> Vec<ConcreteClass> {
    nen_en_1992_1_1::CONCRETE_CLASSES.to_vec()
}

/// Wapeningsstaal: B500A/B/C (bijlage C).
#[tauri::command]
fn list_reinforcement_grades() -> Vec<ReinforcementGrade> {
    nen_en_1992_1_1::REINFORCEMENT_GRADES.to_vec()
}

#[tauri::command]
async fn check_concrete_beams(
    inputs: Vec<ConcreteBeamCheckInput>,
) -> Result<Vec<ConcreteBeamCheckResult>, String> {
    Ok(concrete_check::check_all_concrete_beams(inputs))
}

/// Het losse M-N-κ-diagram voor de korfeditor in de staafeigenschappen —
/// zonder dat er een hele toetsrun voor nodig is.
#[tauri::command]
async fn concrete_mn_kappa(inputs: MnKappaRequest) -> Result<MnKappaResponse, String> {
    concrete_check::mn_kappa(inputs)
}

/// Vrije spanningstoets (geen norm): een doorsnede plus een toelaatbare
/// spanning, getoetst op de vergelijkspanning van von Mises. Bedoeld voor
/// materialen die buiten EN 1992/1993/1995 vallen — natuursteen, een
/// gietstuk, een kunststof — en voor een snelle spanningscontrole op een
/// bestaand profiel.
#[tauri::command]
async fn check_stress_beams(
    inputs: Vec<SpanningBeamCheckInput>,
) -> Result<Vec<SpanningBeamCheckResult>, String> {
    Ok(spanning_check::check_all_spanning_beams(inputs))
}

#[tauri::command]
async fn generate_steel_report_pdf(input: ReportInput) -> Result<Vec<u8>, String> {
    Ok(generate_report_pdf(input))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            list_steel_profiles,
            list_steel_grades,
            check_steel_beams,
            list_timber_grades,
            check_timber_beams,
            list_clt_presets,
            check_clt_beams,
            list_concrete_classes,
            list_reinforcement_grades,
            check_concrete_beams,
            concrete_mn_kappa,
            check_stress_beams,
            generate_steel_report_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
