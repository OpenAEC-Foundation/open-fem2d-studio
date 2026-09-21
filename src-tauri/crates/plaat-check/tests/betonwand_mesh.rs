use nen_en_1993_1_1_section::CheckStatus;
use plaat_check::{check_plate, PlateCheckInput, PlateCheckResult};
use serde_json::{json, Value};

fn element(id: u32) -> Value {
    json!({"element_id": id, "sigma_x_mpa": -1, "sigma_y_mpa": 0, "tau_xy_mpa": 0})
}

fn invoer() -> Value {
    let laag = json!({"diameter_mm":12,"hoh_mm":100,"dekking_mm":30});
    json!({
        "plate_id":1,"soort":"Beton","materiaal":"C30/37","thickness_mm":200,
        "expected_element_ids":[7,8],
        "combinations":[{"combination_id":1,"elements":[element(7),element(8)]}],
        "frequente_combinaties":[{"combination_id":2,"elements":[element(7),element(8)]}],
        "wapening_aanwezig":{"staalsoort":"B500B",
            "horizontaal":{"zijde_1":laag,"zijde_2":laag},"verticaal":{},
            "milieuklasse":"XC3","f_ct_eff_mpa":2.9,"langdurend":true,"hoge_aanhechting":true}
    })
}

fn toets(v: Value) -> PlateCheckResult {
    check_plate(&serde_json::from_value::<PlateCheckInput>(v).unwrap())
}

fn geen_toets(v: Value) {
    let r = toets(v);
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.checks.is_empty(), "geen positieve deeltoets op onbewezen meshdekking");
    assert!(r.elementen.is_empty());
    assert!(r.combinaties.is_empty());
    assert!(r.wapening.is_none());
    assert!(r.niet_getoetst.iter().any(|n| n.id == "beton_mesh_onvolledig" && n.bepaalt_status));
}

#[test]
fn ontbrekende_onafhankelijke_mesh_mag_geen_betontoets_opleveren() {
    let input: PlateCheckInput = serde_json::from_value(json!({
        "plate_id": 1, "soort": "Beton", "materiaal": "C30/37", "thickness_mm": 200,
        "combinations": [{"combination_id": 1, "elements": [
            {"element_id": 7, "sigma_x_mpa": -1, "sigma_y_mpa": 0, "tau_xy_mpa": 0}
        ]}]
    })).unwrap();
    let r = check_plate(&input);
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.checks.is_empty(), "geen positieve deeltoets op onbewezen meshdekking");
    assert!(r.niet_getoetst.iter().any(|n| n.id == "beton_mesh_onvolledig" && n.bepaalt_status));
}

#[test]
fn hetzelfde_element_ontbreekt_in_alle_combinaties() {
    let mut v = invoer();
    for veld in ["combinations", "frequente_combinaties"] {
        v[veld][0]["elements"] = json!([element(7)]);
    }
    geen_toets(v);
}

#[test]
fn elke_ugt_en_bgt_combinatie_moet_exact_de_mesh_bevatten() {
    for veld in ["combinations", "frequente_combinaties"] {
        for ids in [vec![], vec![7], vec![7,7], vec![7,8,9], vec![7,9]] {
            for index in [0, 1] {
                let mut v = invoer();
                let mut tweede = v[veld][0].clone();
                tweede["combination_id"] = json!(3);
                v[veld].as_array_mut().unwrap().push(tweede);
                v[veld][index]["elements"] = Value::Array(ids.iter().copied().map(element).collect());
                geen_toets(v);
            }
        }
    }
}

#[test]
fn ongeldige_meshverklaring_en_bouwerfout_blokkeren() {
    for ids in [json!([]), json!([7,7]), Value::Null] {
        let mut v = invoer();
        v["expected_element_ids"] = ids;
        geen_toets(v);
    }
    for fout in ["", "BGT-mesh verschilt van UGT"] {
        let mut v = invoer();
        v["mesh_fout"] = json!(fout);
        geen_toets(v);
    }
}

#[test]
fn dubbele_combinatie_ids_binnen_en_tussen_grenstoestanden() {
    for veld in ["combinations", "frequente_combinaties"] {
        let mut v = invoer();
        let dubbel = v[veld][0].clone();
        v[veld].as_array_mut().unwrap().push(dubbel);
        geen_toets(v);
    }
    let mut v = invoer();
    v["frequente_combinaties"][0]["combination_id"] = json!(1);
    geen_toets(v);
}

#[test]
fn ontbrekende_ugt_en_onvolledige_bgt_zonder_scheurbasis() {
    let mut v = invoer();
    v["combinations"] = json!([]);
    geen_toets(v);
    let mut v = invoer();
    v["wapening_aanwezig"].as_object_mut().unwrap().remove("f_ct_eff_mpa");
    v["frequente_combinaties"][0]["elements"] = json!([element(7)]);
    geen_toets(v);
}

#[test]
fn controle_geldt_ook_zonder_aanwezige_wapening() {
    let mut v = invoer();
    v.as_object_mut().unwrap().remove("wapening_aanwezig");
    v.as_object_mut().unwrap().remove("frequente_combinaties");
    v["combinations"][0]["elements"] = json!([element(7)]);
    geen_toets(v);
}

#[test]
fn volledige_mesh_behoudt_rekenwaarde_en_volgorde_is_vrij() {
    let v = invoer();
    let a = toets(v.clone());
    assert!(a.geweigerd.is_none());
    assert!(!a.checks.is_empty());
    assert!(!a.niet_getoetst.iter().any(|n| n.id == "beton_mesh_onvolledig"));
    let mut v = v;
    v["expected_element_ids"] = json!([8,7]);
    v["frequente_combinaties"][0]["elements"].as_array_mut().unwrap().reverse();
    assert_eq!(toets(v).uc_max, a.uc_max);
}

#[test]
fn geen_frequente_combinaties_betekent_geen_scheurtoets() {
    let mut v = invoer();
    v["frequente_combinaties"] = json!([]);
    let r = toets(v);
    assert!(r.geweigerd.is_none());
    assert!(r.niet_getoetst.iter().any(|n| n.id == "7.3_scheurwijdte" && n.bepaalt_status));
    assert!(!r.checks.iter().any(|c| c.id.starts_with("7.3.4")));
}
