//! Schema en uitvoeringspad van de rapporttool, zonder een server te starten.
use super::{dispatch_tool, tool_definitions};
use base64::Engine;
use serde_json::{json, Value};

fn basis() -> Value {
    json!({"project_name": "Platen", "project_number": "P25", "engineer": "Test",
        "company": "Test", "date": "2026-09-17", "steel_check_results": []})
}

fn plaat() -> Value {
    let combinaties = [11, 22].map(|id| json!({"combination_id": id, "elements": [
        {"element_id": 701, "sigma_x_mpa": id, "sigma_y_mpa": 0, "tau_xy_mpa": 0}
    ]}));
    json!({"plate_id": 41, "soort": "Staal", "materiaal": "S235", "thickness_mm": 10,
        "combinations": combinaties})
}

#[test]
fn schema_biedt_plaatinvoer_resultaten_en_weigeringen_aan() {
    let defs = tool_definitions();
    let schema = &defs
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "generate_steel_report_pdf")
        .unwrap()["inputSchema"];
    let p = &schema["properties"];
    for naam in ["plate_inputs", "plate_results", "plate_skipped"] {
        assert_eq!(p[naam]["type"], "array", "{naam}");
        assert_eq!(p[naam]["items"]["type"], "object", "{naam}");
        assert!(!schema["required"]
            .as_array()
            .unwrap()
            .contains(&json!(naam)));
    }
    // Eén gedeeld schema: elke combinatie en elk element blijft invoerbaar.
    assert_eq!(
        p["plate_inputs"]["items"],
        crate::plate_tools::schema_plaat()
    );
    assert_eq!(
        p["plate_inputs"]["items"]["properties"]["combinations"]["items"]["properties"]["elements"]
            ["type"],
        "array"
    );
    assert_eq!(p["plate_skipped"]["items"]["additionalProperties"], false);
    assert_eq!(
        p["plate_skipped"]["items"]["required"],
        json!(["plate_id", "reden"])
    );
}

#[tokio::test]
async fn plaattoets_naar_rapporttool_met_alle_combinaties() {
    let inputs = json!([plaat()]);
    let uit = dispatch_tool("check_plates", json!({"inputs": inputs}))
        .await
        .unwrap();
    assert_eq!(
        uit["results"][0]["combinaties"].as_array().unwrap().len(),
        2
    );
    assert_eq!(uit["results"][0]["governing_combination_id"], 22);
    let mut args = basis();
    args["plate_inputs"] = inputs;
    args["plate_results"] = uit["results"].clone();
    args["plate_skipped"] = json!([{"plate_id": 42, "reden": "Geen elementspanningen"}]);
    let parsed: report::ReportInput = serde_json::from_value(args.clone()).unwrap();
    assert_eq!(parsed.plate_inputs[0].combinations.len(), 2);
    assert_eq!(parsed.plate_results[0].governing_element_id, Some(701));
    assert_eq!(parsed.plate_skipped[0].reden, "Geen elementspanningen");
    controleer_pdf(
        dispatch_tool("generate_steel_report_pdf", args)
            .await
            .unwrap(),
    );
    // De bestaande toolaanroep zonder enige plaatgegevens blijft geldig.
    controleer_pdf(
        dispatch_tool("generate_steel_report_pdf", basis())
            .await
            .unwrap(),
    );
}

fn controleer_pdf(uit: Value) {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(uit["pdf_base64"].as_str().unwrap())
        .unwrap();
    assert_eq!(bytes.len() as u64, uit["byte_count"].as_u64().unwrap());
    assert!(bytes.starts_with(b"%PDF-"));
    assert!(bytes.len() > 1000);
}

#[tokio::test]
async fn ongeldige_plaatgegevens_worden_niet_stil_genegeerd() {
    for (veld, waarde) in [
        ("plate_inputs", json!([{"plate_id": 41}])),
        ("plate_results", json!([{"plate_id": 41}])),
        (
            "plate_skipped",
            json!([{"plate_id": 41, "reason": "tikfout"}]),
        ),
    ] {
        let mut args = basis();
        args[veld] = waarde;
        let fout = dispatch_tool("generate_steel_report_pdf", args)
            .await
            .unwrap_err();
        assert_eq!(fout.code, -32602, "{veld}");
    }
    let mut args = basis();
    let mut p = plaat();
    p["combinations"][0]["elements"][0]["sigma_x_mpa_typo"] = json!(50);
    args["plate_inputs"] = json!([p]);
    assert_eq!(
        dispatch_tool("generate_steel_report_pdf", args)
            .await
            .unwrap_err()
            .code,
        -32602
    );
}
