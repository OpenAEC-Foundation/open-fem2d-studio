use steel_check::{BeamCheckInput, BeamCheckResult};
use steel_profiles::SteelProfile;
use nen_en_1993_1_1_section::{S235, S275, S355, S420, S460, SteelGrade};

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
