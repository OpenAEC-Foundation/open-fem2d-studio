use steel_check::{BeamCheckInput, BeamCheckResult};
use steel_profiles::SteelProfile;
use nen_en_1993_1_1_section::{S235, S275, S355, S420, S460, SteelGrade};
use report::{ReportInput, generate_report_pdf};
use timber_check::{TimberBeamCheckInput, TimberBeamCheckResult};

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
            generate_steel_report_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
