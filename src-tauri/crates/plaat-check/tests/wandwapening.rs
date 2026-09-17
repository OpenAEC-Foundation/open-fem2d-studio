use approx::assert_relative_eq;
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use plaat_check::{check_plate, PlateCheckInput, PlateCheckResult};
use serde_json::{json, Value};
use steel_check::CheckKind;

fn invoer() -> Value {
    let h = json!({"diameter_mm":12.0,"hoh_mm":100.0,"dekking_mm":30.0});
    let v = json!({"diameter_mm":12.0,"hoh_mm":100.0,"dekking_mm":42.0});
    json!({"plate_id":1,"soort":"Beton","materiaal":"C30/37","thickness_mm":200.0,
        "combinations":[{"combination_id":1,"elements":[
            {"element_id":7,"sigma_x_mpa":2.0,"sigma_y_mpa":0.0,"tau_xy_mpa":0.0}]}],
        "frequente_combinaties":[{"combination_id":2,"elements":[
            {"element_id":7,"sigma_x_mpa":1.5,"sigma_y_mpa":0.0,"tau_xy_mpa":0.0}]}],
        "wapening_aanwezig":{"staalsoort":"B500B","horizontaal":{"zijde_1":h,"zijde_2":h},
            "verticaal":{"zijde_1":v,"zijde_2":v},"milieuklasse":"XC3",
            "f_ct_eff_mpa":2.9,"langdurend":true,"hoge_aanhechting":true}})
}
fn toets(v: Value) -> PlateCheckResult {
    check_plate(&serde_json::from_value::<PlateCheckInput>(v).unwrap())
}
fn calc<'a>(r: &'a PlateCheckResult, id: &str) -> &'a ResistanceCalc {
    match &r
        .checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("ontbreekt: {id}"))
        .kind
    {
        CheckKind::Resistance(c) => c,
        _ => panic!(),
    }
}

#[test]
fn handberekening_trek_en_scheurwijdte() {
    let r = toets(invoer());
    // Twee zijden Ø12-100: A_s = 720π = 2261,94671 mm²/m.
    // UGT: 2·200·1000/(500/1,15) = 920 mm²/m.
    assert_relative_eq!(
        calc(&r, "F_wapening_x").uc.as_ref().unwrap().uc,
        920.0 / (720.0 * std::f64::consts::PI),
        epsilon = 1e-12
    );
    // (7.1), bovengrens volledige trek: 1·1·2,9·200000/500 = 1160.
    assert_relative_eq!(calc(&r, "7.3.2_min_x").value, 1160.0, epsilon = 1e-9);
    // BGT: σ_s=300000/(720π)=132,6291. Per zijde h_eff=min(2,5·36;100)=90.
    // ρ_eff=360π/90000=0,01256637; s_r=102+0,272·12/ρ=361,7409 (NB-cap 312).
    // ε=max((132,6291−99,3410)/200000;0,6·132,6291/200000)=0,000397887.
    // w=312·0,000397887=0,1241408556 mm; w_max=0,30.
    assert_relative_eq!(
        calc(&r, "7.3.4_x_zijde_1").value,
        0.12414085561167835,
        epsilon = 1e-10
    );
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r
        .niet_getoetst
        .iter()
        .any(|n| n.id == "F.1(5)_verankering" && n.bepaalt_status));
    assert!(r
        .niet_getoetst
        .iter()
        .any(|n| n.id == "wand_knik" && n.bepaalt_status));
}

#[test]
fn onvoldoende_en_alle_combinaties_assen_en_tekens() {
    let mut v = invoer();
    v["combinations"]
        .as_array_mut()
        .unwrap()
        .push(json!({"combination_id":9,"elements":[
        {"element_id":8,"sigma_x_mpa":0.0,"sigma_y_mpa":8.0,"tau_xy_mpa":0.0}]}));
    let r = toets(v);
    assert_eq!(r.status, CheckStatus::NotOk);
    assert_eq!(r.governing_combination_id, Some(9));
    assert_eq!(r.governing_element_id, Some(8));
    assert_eq!(r.governing_check_id, "F_wapening_z");
    assert_relative_eq!(calc(&r, "F_wapening_z").value, 3680.0, epsilon = 1e-9);
    assert!(r
        .elementen
        .iter()
        .any(|e| e.element_id == 8 && e.check_id == "F_wapening_z"));
}

#[test]
fn ongeldige_invoer_wordt_geweigerd() {
    let mut te_sterk = invoer();
    te_sterk["wapening_aanwezig"]["f_ct_eff_mpa"] = json!(3.0);
    assert!(toets(te_sterk).geweigerd.is_some());
    for (veld, waarde) in [
        ("diameter_mm", 0.0),
        ("hoh_mm", -1.0),
        ("dekking_mm", 199.0),
    ] {
        let mut v = invoer();
        v["wapening_aanwezig"]["horizontaal"]["zijde_1"][veld] = json!(waarde);
        assert!(toets(v).geweigerd.is_some(), "{veld}");
    }
    let mut v = invoer();
    v["wapening_aanwezig"]["verticaal"]["zijde_1"]["dekking_mm"] = json!(31.0);
    assert!(toets(v).geweigerd.is_some());
}

#[test]
fn ontbrekende_scheurbasis_wordt_niet_ingevuld() {
    let mut v = invoer();
    v["wapening_aanwezig"]
        .as_object_mut()
        .unwrap()
        .remove("f_ct_eff_mpa");
    let r = toets(v);
    assert!(!r.checks.iter().any(|c| c.id.starts_with("7.3")));
    assert!(r
        .niet_getoetst
        .iter()
        .any(|n| n.id == "7.3.2_minimum" && n.bepaalt_status));
}

#[test]
fn frequente_bgt_omhullende_bepaalt_ook_element_en_plaat() {
    let mut v = invoer();
    v["combinations"][0]["elements"][0]["sigma_x_mpa"] = json!(0.1);
    let mut tweede = v["frequente_combinaties"][0].clone();
    tweede["combination_id"] = json!(12);
    tweede["elements"][0]["sigma_x_mpa"] = json!(4.8);
    v["frequente_combinaties"]
        .as_array_mut()
        .unwrap()
        .push(tweede);
    let r = toets(v.clone());
    assert_eq!(r.status, CheckStatus::NotOk);
    assert_eq!(r.governing_combination_id, Some(12));
    assert!(r.governing_check_id.starts_with("7.3.4"));
    assert_eq!(r.elementen[0].combination_id, 12);
    // UGT blijft 0,1·200000/434,7826=46 mm²/m, ongeacht BGT.
    assert_relative_eq!(calc(&r, "F_wapening_x").value, 46.0, epsilon = 1e-9);
    v["frequente_combinaties"].as_array_mut().unwrap().reverse();
    let omgekeerd = toets(v);
    assert_eq!(omgekeerd.uc_max, r.uc_max);
    assert_eq!(omgekeerd.governing_combination_id, Some(12));
}

#[test]
fn bijlage_f_assenwissel_en_beide_schuiftekens() {
    for tau in [-2.0, 2.0] {
        for wissel in [false, true] {
            let mut v = invoer();
            let e = &mut v["combinations"][0]["elements"][0];
            e["sigma_x_mpa"] = json!(if wissel { 1.0 } else { -6.0 });
            e["sigma_y_mpa"] = json!(if wissel { -6.0 } else { 1.0 });
            e["tau_xy_mpa"] = json!(tau);
            let r = toets(v);
            // F.6: (4/6+1)·200000/(500/1,15)=766,6667 mm²/m.
            assert_relative_eq!(
                calc(
                    &r,
                    if wissel {
                        "F_wapening_x"
                    } else {
                        "F_wapening_z"
                    }
                )
                .value,
                766.6666666666666,
                epsilon = 1e-9
            );
            assert_eq!(
                calc(
                    &r,
                    if wissel {
                        "F_wapening_z"
                    } else {
                        "F_wapening_x"
                    }
                )
                .value,
                0.0
            );
        }
    }
}

#[test]
fn nul_wapening_en_nul_belasting_blijven_eindig() {
    let mut v = invoer();
    v["wapening_aanwezig"]["horizontaal"] = json!({});
    let r = toets(v.clone());
    assert_eq!(r.status, CheckStatus::NotOk);
    assert_eq!(calc(&r, "F_wapening_x").uc.as_ref().unwrap().uc, f64::MAX);
    let json = serde_json::to_value(&r).unwrap();
    assert!(json["uc_max"].is_number());
    for c in &r.checks {
        if let CheckKind::Resistance(c) = &c.kind {
            if let Some(uc) = &c.uc {
                assert!(uc.uc.is_finite());
            }
        }
    }
    v["combinations"][0]["elements"][0]["sigma_x_mpa"] = json!(0.0);
    v["frequente_combinaties"][0]["elements"][0]["sigma_x_mpa"] = json!(0.0);
    let r = toets(v);
    assert_eq!(calc(&r, "F_wapening_x").uc.as_ref().unwrap().uc, 0.0);
    assert_eq!(r.status, CheckStatus::NotApplicable); // Geen aangetoonde trekzone voor 7.3.2.
}

#[test]
fn mm2_invoer_zonder_staafzwaartepunten_bewijst_geen_membraancapaciteit() {
    let mut v = invoer();
    v["wapening_aanwezig"]["horizontaal"] = json!({
        "zijde_1":{"as_mm2_per_m":400.0,"dekking_mm":30.0},
        "zijde_2":{"as_mm2_per_m":800.0,"dekking_mm":30.0}});
    let r = toets(v);
    assert!(!r.checks.iter().any(|c| c.id == "F_wapening_x"));
    assert!(r
        .niet_getoetst
        .iter()
        .any(|n| n.id == "F_evenwicht_x" && n.bepaalt_status));
    assert!(r
        .niet_getoetst
        .iter()
        .any(|n| n.id == "9.6_geometrie_x_zijde_2"));
    assert!(r.niet_getoetst.iter().any(|n| n.id == "7.3_lagen_x"));
}

#[test]
fn staafafstand_per_zijde_en_nb_minima() {
    let mut v = invoer();
    v["wapening_aanwezig"]["horizontaal"]["zijde_2"]["hoh_mm"] = json!(450.0);
    let r = toets(v);
    assert_relative_eq!(
        calc(&r, "9.6_afstand_x_zijde_2").uc.as_ref().unwrap().uc,
        1.125,
        epsilon = 1e-12
    );
    assert_relative_eq!(
        calc(&r, "9.6_afstand_x_zijde_1").uc.as_ref().unwrap().uc,
        0.25,
        epsilon = 1e-12
    );
    assert_eq!(calc(&r, "9.6_min_x").value, 0.0);
    assert_eq!(calc(&r, "9.6_min_z").value, 0.0);
    assert_eq!(calc(&r, "9.6_v_max").uc.as_ref().unwrap().rd, 8000.0);
}

#[test]
fn basisdekking_en_te_dunne_wand() {
    let mut v = invoer();
    for zijde in ["zijde_1", "zijde_2"] {
        v["wapening_aanwezig"]["horizontaal"][zijde]["dekking_mm"] = json!(8.0);
        v["wapening_aanwezig"]["verticaal"][zijde]["dekking_mm"] = json!(20.0);
    }
    v["thickness_mm"] = json!(100.0);
    let r = toets(v);
    assert!(r.geweigerd.is_none());
    assert_relative_eq!(
        calc(&r, "4.4_dekking_x_zijde_1").uc.as_ref().unwrap().uc,
        1.5,
        epsilon = 1e-12
    );
    assert_relative_eq!(
        calc(&r, "9.6_dikte").uc.as_ref().unwrap().uc,
        1.2,
        epsilon = 1e-12
    );
    assert!(!r.checks.iter().any(|c| c.id.starts_with("7.3.4")));
}

#[test]
fn ontbrekende_of_niet_ondersteunde_scheurdata() {
    for veld in ["langdurend", "hoge_aanhechting", "milieuklasse"] {
        let mut v = invoer();
        v["wapening_aanwezig"].as_object_mut().unwrap().remove(veld);
        let r = toets(v);
        assert!(r.niet_getoetst.iter().any(|n| n.id == "7.3_scheurwijdte"));
        assert!(!r.checks.iter().any(|c| c.id.starts_with("7.3.4")));
    }
    for wijziging in ["geen_bgt", "schuif", "tweeassig", "XF1", "asymmetrisch"] {
        let mut v = invoer();
        match wijziging {
            "geen_bgt" => v["frequente_combinaties"] = json!([]),
            "schuif" => v["frequente_combinaties"][0]["elements"][0]["tau_xy_mpa"] = json!(1.0),
            "tweeassig" => v["frequente_combinaties"][0]["elements"][0]["sigma_y_mpa"] = json!(1.0),
            "XF1" => v["wapening_aanwezig"]["milieuklasse"] = json!("XF1"),
            _ => v["wapening_aanwezig"]["horizontaal"]["zijde_2"]["hoh_mm"] = json!(125.0),
        }
        let r = toets(v);
        assert!(
            !r.checks.iter().any(|c| c.id.starts_with("7.3.4")),
            "{wijziging}"
        );
        assert!(r
            .niet_getoetst
            .iter()
            .any(|n| n.id.starts_with("7.3") && n.bepaalt_status));
    }
}

#[test]
fn bgt_vloeien_geeft_falen_geen_elastische_scheurwijdte() {
    let mut v = invoer();
    v["frequente_combinaties"][0]["elements"][0]["sigma_x_mpa"] = json!(10.0);
    let r = toets(v);
    assert_eq!(r.status, CheckStatus::NotOk);
    assert_eq!(calc(&r, "7.3_staal_x").status, CheckStatus::NotOk);
    assert!(!r.checks.iter().any(|c| c.id.starts_with("7.3.4")));
}

#[test]
fn ongeldige_bgt_en_dubbele_combinaties_worden_geweigerd() {
    let mut i: PlateCheckInput = serde_json::from_value(invoer()).unwrap();
    i.frequente_combinaties[0].elements[0].sigma_x_mpa = f64::NAN;
    assert!(check_plate(&i).geweigerd.is_some());
    let mut v = invoer();
    v["frequente_combinaties"][0]["combination_id"] = json!(1);
    assert!(toets(v).geweigerd.is_some());
    let mut v = invoer();
    v["frequente_combinaties"][0]["elements"] = json!([]);
    let r = toets(v);
    assert!(r.geweigerd.is_none());
    assert!(r
        .niet_getoetst
        .iter()
        .any(|n| n.id == "7.3_mesh_onvolledig"));
    let mut v = invoer();
    v["wapening_aanwezig"]["horizontaal"]["zijde_1"]["as_mm2_per_m"] = json!(100.0);
    assert!(toets(v).geweigerd.is_some());
}

#[test]
fn oude_invoer_blijft_exact_het_oude_resultaat_geven() {
    let mut v = invoer();
    v.as_object_mut().unwrap().remove("wapening_aanwezig");
    v.as_object_mut().unwrap().remove("frequente_combinaties");
    let i: PlateCheckInput = serde_json::from_value(v).unwrap();
    assert_eq!(
        serde_json::to_value(check_plate(&i)).unwrap(),
        serde_json::to_value(plaat_check::beton::toets(&i)).unwrap()
    );
}

#[test]
fn asymmetrische_lagen_mogen_geen_positieve_somtoets_geven() {
    let mut v = invoer();
    v["wapening_aanwezig"]["horizontaal"] = json!({
        "zijde_1":{"diameter_mm":6.0,"hoh_mm":300.0,"dekking_mm":33.0},
        "zijde_2":{"diameter_mm":12.0,"hoh_mm":75.0,"dekking_mm":30.0}});
    let r = toets(v);
    assert_ne!(calc(&r, "F_wapening_x").status, CheckStatus::Ok);
    // Beide zwaartepunten liggen 64 mm uit het midden: per zijde 200 kN/m.
    // Zijde 1: A_s=30π=94,24778; benodigd 200000/(500/1,15)=460 mm²/m.
    assert_relative_eq!(
        calc(&r, "F_wapening_x_zijde_1").uc.as_ref().unwrap().uc,
        460.0 / (30.0 * std::f64::consts::PI),
        epsilon = 1e-12
    );
}

#[test]
fn alleen_druk_is_geen_bewezen_scheurminimumtekort() {
    let mut v = invoer();
    for r in ["horizontaal", "verticaal"] {
        for z in ["zijde_1", "zijde_2"] {
            v["wapening_aanwezig"][r][z]["diameter_mm"] = json!(8.0);
            v["wapening_aanwezig"][r][z]["hoh_mm"] = json!(300.0);
        }
    }
    v["combinations"][0]["elements"][0]["sigma_x_mpa"] = json!(-1.0);
    v["frequente_combinaties"][0]["elements"][0]["sigma_x_mpa"] = json!(-1.0);
    let r = toets(v);
    assert_ne!(r.status, CheckStatus::NotOk);
    assert!(!r.checks.iter().any(|c| c.id.starts_with("7.3.2_min_")));
}

#[test]
fn verschillende_dekkingen_veranderen_het_evenwichtsaandeel() {
    let mut v = invoer();
    v["wapening_aanwezig"]["horizontaal"]["zijde_2"]["dekking_mm"] = json!(20.0);
    let r = toets(v);
    let a = calc(&r, "F_wapening_x_zijde_1");
    let b = calc(&r, "F_wapening_x_zijde_2");
    assert_relative_eq!(a.value, 920.0 * 74.0 / 138.0, epsilon = 1e-9);
    assert_relative_eq!(b.value, 920.0 * 64.0 / 138.0, epsilon = 1e-9);
    assert_relative_eq!(a.value * 64.0, b.value * 74.0, epsilon = 1e-8);
    assert_eq!(a.status, CheckStatus::Ok);
    assert_eq!(b.status, CheckStatus::Ok);
}

#[test]
fn onvoldoende_conservatieve_scheurbovengrens_is_geen_bewezen_normfalen() {
    let mut v = invoer();
    for r in ["horizontaal", "verticaal"] {
        for z in ["zijde_1", "zijde_2"] {
            v["wapening_aanwezig"][r][z]["diameter_mm"] = json!(8.0);
            v["wapening_aanwezig"][r][z]["hoh_mm"] = json!(300.0);
        }
    }
    v["combinations"][0]["elements"][0]["sigma_x_mpa"] = json!(0.2);
    v["frequente_combinaties"][0]["elements"][0]["sigma_x_mpa"] = json!(0.2);
    let r = toets(v);
    let c = calc(&r, "7.3.2_min_x");
    assert_eq!(c.status, CheckStatus::NotApplicable);
    assert!(c.uc.is_none());
    assert_eq!(c.value, 1160.0);
    assert!(!r.checks.iter().any(|c| c.id == "7.3.2_min_z"));
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.uc_max <= 1.0);
}
