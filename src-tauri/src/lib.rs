use concrete_check::{
    ConcreteBeamCheckInput, ConcreteBeamCheckResult, MnKappaRequest, MnKappaResponse,
    SegmentStiffnessRequest, SegmentStiffnessResponse,
};
use nen_en_1992_1_1::{
    ConcreteClass, ConcreteCoverRequest, ConcreteCoverResponse, EffectiveFlangeWidthRequest,
    EffectiveFlangeWidthResponse, ExposureClassInfo, ReinforcementGrade,
};
use nen_en_1993_1_1_section::{S235, S275, S355, S420, S460, SteelGrade};
use nen_en_1993_1_8_las::{LasInput, LasResultaat};
use nen_en_1995_1_1::clt::CltPreset;
use report::{ReportInput, generate_report_pdf};
use section_properties::opdracht::{Invoer as DoorsnedeInvoer, Uitvoer as DoorsnedeUitvoer};
use spanning_check::{SpanningBeamCheckInput, SpanningBeamCheckResult};
use steel_check::{BeamCheckInput, BeamCheckResult};
use steel_profiles::SteelProfile;
use timber_check::clt::{CltBeamCheckInput, CltBeamCheckResult};
use timber_check::{TimberBeamCheckInput, TimberBeamCheckResult};

// De commands hieronder zijn één-op-één gespiegeld in `crates/toetsbrug`
// (dezelfde functies als JSON-in/JSON-uit voor de browser) en in de MCP-server
// `crates/openaec-mcp-server`. Wie hier een command toevoegt, voegt hem daar
// ook toe — anders werkt hij alleen in de desktop-app.
//
// Die drie lijsten worden tegen elkaar gehouden door
// `crates/openaec-mcp-server/tests/drie_wegen_kruistabel.rs`. Die test valt in
// beide richtingen om, dus een command dat maar twee wegen krijgt komt niet
// ongemerkt langs; wat bewust geen derde weg heeft, staat daar met reden in de
// uitzonderingslijst.

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
    nen_en_1995_1_1::strength_class_names()
}

#[tauri::command]
async fn check_timber_beams(
    inputs: Vec<TimberBeamCheckInput>,
) -> Result<Vec<TimberBeamCheckResult>, String> {
    Ok(timber_check::check_all_timber_beams(inputs))
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
    Ok(timber_check::clt::check_all_clt_beams(inputs))
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

/// De stateloze stijfheidsdienst voor de fysisch niet-lineaire tweede orde
/// (5.8.6): één betonstaaf, in segmenten, elk met zijn eigen secante
/// buigstijfheid.
///
/// Eén verzoek is één ronde. Zonder `segment_forces` komt alleen de
/// segmentindeling terug — die is de bron van de elementgrenzen voor de mesh en
/// hoort daarom uit de kern te komen en niet uit de frontend. Mét krachten komt
/// per segment de EI terug waarmee de volgende ronde gerekend wordt, plus het
/// convergentie-oordeel. Er blijft niets achter tussen twee aanroepen.
#[tauri::command]
async fn concrete_segment_stiffness(
    inputs: SegmentStiffnessRequest,
) -> Result<SegmentStiffnessResponse, String> {
    concrete_check::segment_stiffness(inputs)
}

/// De meewerkende flensbreedte b_eff van een T- of L-ligger (5.3.2.1), per
/// gebied uit figuur 5.2 (eindveld, tussensteunpunt, binnenveld, uitkraging).
///
/// De rekengang staat in `nen_en_1992_1_1::beff` en kent geen knopen, staven
/// of opleggingen: de invoer is de liggerlijn (overspanningen + de twee
/// uiteinden) plus de flensmaten. Het omzetten van de modeltopologie naar zo'n
/// liggerlijn gebeurt in de frontend (`lib/beffLiggerlijn.ts`); de crate zou
/// die topologie niet kennen.
///
/// Een geval dat buiten figuur 5.2 valt — een losstaande uitkraging, een
/// uitkraging langer dan de halve aangrenzende overspanning, een
/// overspanningsverhouding buiten 2/3 … 1,5 — levert een FOUT met de reden en
/// geen getal. Een verkeerde b_eff is onzichtbaar en stuurt naast de sterkte
/// ook I_c, M_cr en de tweede orde.
#[tauri::command]
async fn concrete_effective_flange_width(
    inputs: EffectiveFlangeWidthRequest,
) -> Result<EffectiveFlangeWidthResponse, String> {
    nen_en_1992_1_1::beff::effective_flange_width_request(inputs)
}

/// De milieuklassen van tabel 4.1, met hun omschrijving en de voorbeelden uit
/// de tabel. Bedoeld voor de keuzelijst in de invoer: die hoort de tekst van
/// de norm te tonen en niet een eigen samenvatting.
#[tauri::command]
fn list_exposure_classes() -> Vec<ExposureClassInfo> {
    nen_en_1992_1_1::EXPOSURE_CLASSES.to_vec()
}

/// De betondekking toetsen aan de milieuklasse (4.4.1).
///
/// Uit de milieuklasse en de constructieklasse volgt c_min,dur (tabel 4.4N in
/// de versie van de nationale bijlage), uit de staafdiameters c_min,b (tabel
/// 4.2); samen met de ondergrens van 10 mm geeft (4.2) de minimumdekking en
/// (4.1) de vereiste nominale dekking. Het antwoord draagt de hele keten, zodat
/// de invoer kan laten zien wáárom een dekking te klein is.
#[tauri::command]
async fn concrete_cover_check(
    inputs: ConcreteCoverRequest,
) -> Result<ConcreteCoverResponse, String> {
    nen_en_1992_1_1::dekking::concrete_cover_request(inputs)
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

/// Doorlopende langslassen in een samengestelde doorsnede, getoetst volgens
/// NEN-EN 1993-1-8 4.5.3.3 (vereenvoudigde methode).
///
/// De schuifstroom per naad (`F_w,Ed` in N/mm) komt van de aanroeper: die kent
/// de meetkunde van de doorsnede en dus welk deel er aan welke naad hangt.
/// Deze kern doet uitsluitend de normkant — correlatiefactor uit tabel 4.1,
/// `f_vw,d` uit (4.4), weerstand uit (4.3) en de unity check.
#[tauri::command]
async fn check_fillet_welds(inputs: Vec<LasInput>) -> Result<Vec<LasResultaat>, String> {
    Ok(nen_en_1993_1_8_las::toets_lassen(&inputs))
}

/// Doorsnede-eigenschappen van een of meer geometrieën — de motor achter de
/// profieleditor.
///
/// Dezelfde rekengang als de binary `doorsnedemotor` en als het eindpunt
/// `/api/doorsnede` van de dev-server: alle drie roepen ze
/// `section_properties::opdracht::reken` aan. Zonder dit command werkte de
/// profieleditor alleen op de dev-server en bleef hij in de geïnstalleerde app
/// wachten op een motor die er niet was.
///
/// Eén geometrie die niet door de motor komt laat de hele aanroep falen, met
/// de naam erbij: een halve lijst met stilzwijgend ontbrekende doorsneden is
/// erger dan een duidelijke fout.
#[tauri::command]
async fn bereken_doorsneden(
    invoer: Vec<DoorsnedeInvoer>,
) -> Result<Vec<DoorsnedeUitvoer>, String> {
    let mut uit = Vec::with_capacity(invoer.len());
    for i in &invoer {
        match section_properties::opdracht::reken(i) {
            Ok(u) => uit.push(u),
            Err(e) => {
                let naam = i.naam();
                return Err(if naam.is_empty() {
                    e
                } else {
                    format!("{naam}: {e}")
                });
            }
        }
    }
    Ok(uit)
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
            concrete_segment_stiffness,
            concrete_effective_flange_width,
            list_exposure_classes,
            concrete_cover_check,
            check_stress_beams,
            check_fillet_welds,
            bereken_doorsneden,
            generate_steel_report_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
