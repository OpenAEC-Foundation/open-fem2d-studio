//! Onafhankelijke handwaarden: E=210000, nu=0.3, t=10, a=2000, b=1000 mm.
//! D=pi²E/[12(1-nu²)]=189800.084636; sigma_E=18.980008464 MPa.
//! kx=4, kz=4 (breedte 2000), kt=5.34+4/2²=6.34.
//! sigma_cr,x=75.920033855; sigma_cr,z=18.980008464; tau_cr=120.333253659 MPa.
use approx::assert_relative_eq;
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use plaat_check::staal_plooi::PLOOI_ID;
use plaat_check::{check_plate, PlateCheckInput, VLOEI_ID};
use serde_json::json;
use steel_check::CheckKind;

fn input(sx: f64, sz: f64, tau: f64) -> PlateCheckInput {
    serde_json::from_value(json!({
        "plate_id":1,"soort":"Staal","materiaal":"S235","thickness_mm":10,
        "plooi":{"expected_element_ids":[1,2],"a_mm":2000,"b_mm":1000,"randvoorwaarden":"vierzijdig_scharnierend",
            "steun_bron":"constructiedetail met continue randsteun","onverstijfd":true,
            "uniforme_spanning":true,"rechthoek_zonder_openingen":true},
        "combinations":[{"combination_id":1,"elements":[
            {"element_id":1,"sigma_x_mpa":sx,"sigma_y_mpa":sz,"tau_xy_mpa":tau},
            {"element_id":2,"sigma_x_mpa":sx,"sigma_y_mpa":sz,"tau_xy_mpa":tau}
        ]}]
    }))
    .unwrap()
}
fn calc(r: &plaat_check::PlateCheckResult) -> &ResistanceCalc {
    assert!(r.geweigerd.is_none(), "{:?}", r.geweigerd);
    let CheckKind::Resistance(c) = &r.checks.iter().find(|c| c.id == PLOOI_ID).unwrap().kind else {
        panic!()
    };
    c
}
fn step(c: &ResistanceCalc, id: &str) -> f64 {
    c.deelstappen
        .iter()
        .find(|s| s.id == id)
        .unwrap()
        .value
        .unwrap()
}
fn refused(p: &PlateCheckInput, reason: &str) {
    let r = check_plate(p);
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.checks.is_empty());
    assert!(
        r.geweigerd.as_ref().unwrap().contains(reason),
        "{:?}",
        r.geweigerd
    );
}

#[test]
fn uniforme_druk_handwaarde_en_veldrapportage() {
    // alpha_ult=2.35, alpha_cr=.7592003385; lambda=1.7593641352.
    // rho=(lambda-.22)/lambda²=.4973130947; UC=100/(235*rho).
    let r = check_plate(&input(-100.0, 0.0, 0.0));
    let c = calc(&r);
    assert_relative_eq!(r.uc_max, 0.855661995248593, epsilon = 1e-12);
    assert_relative_eq!(step(c, "lambda"), 1.759364135212895, epsilon = 1e-12);
    assert_relative_eq!(step(c, "rho"), 0.497313094722629, epsilon = 1e-12);
    assert_eq!(r.governing_check_id, PLOOI_ID);
    assert!(r
        .elementen
        .iter()
        .all(|e| e.uc == r.uc_max && e.check_id == PLOOI_ID));
    assert_eq!(r.combinaties[0].uc, r.uc_max);
    assert!(!r.niet_getoetst.iter().any(|n| n.id == "en1993_1_5_plooi"));
    assert!(c.notes.iter().any(|n| n.contains("constructiedetail")));
}

#[test]
fn gecombineerde_druk_schuif_faalt_terwijl_vloeien_voldoet() {
    // sigma_eq=sqrt(10000+7500)=132.287565553; alpha_ult=1.776432.
    // A=.6585876937; inv_alpha_cr=A+sqrt(A²+(50/120.333253659)²)=1.4372972594.
    // lambda=1.5978930864; rho_p=.5396598219, chi_w=.5194340016 (maatgevend).
    let r = check_plate(&input(-100.0, 0.0, 50.0));
    assert_relative_eq!(r.uc_max, 1.083729230553457, epsilon = 1e-12);
    assert_eq!(r.status, CheckStatus::NotOk);
    assert_relative_eq!(
        step(calc(&r), "inv_alpha_cr"),
        1.437297259411460,
        epsilon = 1e-12
    );
    let CheckKind::Resistance(vloei) = &r.checks.iter().find(|c| c.id == VLOEI_ID).unwrap().kind
    else {
        panic!()
    };
    assert!(vloei.uc.as_ref().unwrap().uc < 1.0);
}

#[test]
fn zuivere_schuif_handwaarde_en_teken() {
    // alpha_ult=235/(sqrt(3)*50); inv_alpha_cr=50/120.333253659.
    // lambda=1.0618441718; chi=.7816589497; UC=.4714606653.
    let r = check_plate(&input(0.0, 0.0, 50.0));
    assert_relative_eq!(
        calc(&r).uc.as_ref().unwrap().uc,
        0.471460665266183,
        epsilon = 1e-12
    );
    assert_relative_eq!(
        check_plate(&input(0.0, 0.0, -50.0)).uc_max,
        r.uc_max,
        epsilon = 1e-12
    );
}

#[test]
fn biaxiale_druk_in_vierkant_handwaarde() {
    let mut p = input(-100.0, -100.0, 0.0);
    p.plooi.as_mut().unwrap().a_mm = 1000.0;
    // alpha_cr=75.920033855/200; sigma_eq=100; lambda=2.4881166212.
    let r = check_plate(&p);
    assert_relative_eq!(
        calc(&r).uc.as_ref().unwrap().uc,
        1.161470600811007,
        epsilon = 1e-12
    );
}

#[test]
fn nb_eta_stocky_shear_is_begrensd_door_bestaand_vloeicriterium() {
    let mut p = input(0.0, 0.0, 50.0);
    p.thickness_mm = 40.0;
    let r = check_plate(&p);
    assert_eq!(step(calc(&r), "chi_w"), 1.2);
    assert_relative_eq!(
        calc(&r).uc.as_ref().unwrap().uc,
        0.307101207015758,
        epsilon = 1e-12
    );
    assert_eq!(r.governing_check_id, VLOEI_ID);
}

#[test]
fn materiaal_dikteklasse_en_grens() {
    let mut p = input(-100.0, 0.0, 0.0);
    p.thickness_mm = 50.0;
    p.plooi.as_mut().unwrap().a_mm = 5000.0;
    p.plooi.as_mut().unwrap().b_mm = 5000.0;
    assert_relative_eq!(check_plate(&p).uc_max, 0.900427690665932, epsilon = 1e-12);
    p.thickness_mm = 81.0;
    refused(&p, "80");
}

#[test]
fn nulspanningen_eindig_en_lastschaling_en_assenwissel() {
    let r = check_plate(&input(0.0, 0.0, 0.0));
    assert_eq!(calc(&r).uc.as_ref().unwrap().uc, 0.0);
    assert!(serde_json::to_string(&r).unwrap().contains("0.0"));
    let r = check_plate(&input(-100.0, 0.0, 50.0));
    let double = check_plate(&input(-200.0, 0.0, 100.0));
    assert_relative_eq!(double.uc_max, 2.0 * r.uc_max, epsilon = 1e-12);
    let mut p = input(0.0, -100.0, 50.0);
    p.plooi.as_mut().unwrap().a_mm = 1000.0;
    p.plooi.as_mut().unwrap().b_mm = 2000.0;
    assert_relative_eq!(check_plate(&p).uc_max, r.uc_max, epsilon = 1e-12);
}

#[test]
fn randvoorwaarden_geometrie_en_ongeldige_getallen_worden_geweigerd() {
    let base = input(-100.0, 0.0, 0.0);
    let mut p = base.clone();
    p.plooi.as_mut().unwrap().randvoorwaarden = "ingeklemd".into();
    refused(&p, "UIT HET VLAK");
    let mut p = base.clone();
    p.plooi.as_mut().unwrap().steun_bron = " ".into();
    refused(&p, "bron");
    let mut p = base.clone();
    p.plooi.as_mut().unwrap().onverstijfd = false;
    refused(&p, "verstijfde");
    let mut p = base.clone();
    p.plooi.as_mut().unwrap().rechthoek_zonder_openingen = false;
    refused(&p, "zonder openingen");
    let mut p = base.clone();
    p.plooi.as_mut().unwrap().geometrie_fout = Some("maten wijken af".into());
    refused(&p, "maten wijken af");
    let mut p = base.clone();
    p.plooi.as_mut().unwrap().uniforme_spanning = false;
    refused(&p, "uniform");
    for v in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        let mut p = base.clone();
        p.plooi.as_mut().unwrap().a_mm = v;
        refused(&p, "eindig en positief");
    }
    let mut p = base.clone();
    p.plooi.as_mut().unwrap().b_mm = 50.0;
    refused(&p, "dunne-plaat");
    let mut p = base.clone();
    p.combinations[0].elements[0].tau_xy_mpa = f64::NAN;
    refused(&p, "geen getal");
    let mut p = base.clone();
    p.soort = plaat_check::PlaatMateriaalSoort::Hout;
    refused(&p, "alleen beschikbaar voor staal");
}

#[test]
fn trek_niet_uniform_en_kolominteractie_krijgen_exacte_redenen() {
    refused(&input(100.0, 0.0, 0.0), "trekcomponent");
    refused(&input(-100.0, 10.0, 0.0), "trekcomponent");
    let mut p = input(-100.0, 0.0, 0.0);
    p.combinations[0].elements[1].sigma_x_mpa = -99.0;
    refused(&p, "niet-uniform");
    let mut p = input(-100.0, 0.0, 0.0);
    p.plooi.as_mut().unwrap().a_mm = 500.0;
    refused(&p, "kolomachtig");
    // Lang veld kan onder overwegende schuif alsnog de aanvullende interactie vragen.
    refused(&input(-1.0, 0.0, 100.0), "kolomachtig");
}

#[test]
fn xi_een_grens_is_inclusief_en_net_eronder_wordt_geweigerd() {
    // Vierkant: sigma_cr,x=4*sigma_cr,c, sx=sigma_cr,x, dus A=1/2.
    // tau/tau_cr=sqrt(2) geeft inv_alpha_cr=1/2+sqrt(1/4+2)=2.
    // alpha_cr/alpha_cr,c=4/2=2: xi=1, precies de plaatgedraggrens.
    let ex = std::f64::consts::PI.powi(2) * 210000.0 / (12.0 * 0.91) * 0.01_f64.powi(2);
    let mut p = input(-4.0 * ex, 0.0, 9.34 * ex * 2.0_f64.sqrt());
    p.plooi.as_mut().unwrap().a_mm = 1000.0;
    let r = check_plate(&p);
    assert_eq!(step(calc(&r), "inv_alpha_cr"), 2.0);
    for e in &mut p.combinations[0].elements {
        e.tau_xy_mpa *= 1.000001;
    }
    refused(&p, "kolomachtig");
    for e in &mut p.combinations[0].elements {
        e.tau_xy_mpa *= 0.999998;
    }
    assert!(check_plate(&p).geweigerd.is_none());
}

#[test]
fn volledige_combinatiedekking_en_maatgevende_combinatie() {
    let mut p = input(-100.0, 0.0, 0.0);
    let mut c = p.combinations[0].clone();
    c.combination_id = 2;
    for e in &mut c.elements {
        e.sigma_x_mpa = -200.0;
    }
    p.combinations.push(c);
    let r = check_plate(&p);
    assert_eq!(r.governing_combination_id, Some(2));
    assert_eq!(calc(&r).force_state.combination_id, 2);
    p.combinations[1].elements.pop();
    refused(&p, "elementdekking");
    p.combinations[1].elements.clear();
    refused(&p, "geen veldspanningen");
    p.combinations.clear();
    refused(&p, "geen UGT");
    let mut p = input(-100.0, 0.0, 0.0);
    p.combinations.push(p.combinations[0].clone());
    refused(&p, "dubbel combinatienummer");
    let mut p = input(-100.0, 0.0, 0.0);
    p.combinations[0].elements[1].element_id = 1;
    refused(&p, "elementdekking");
}

#[test]
fn oude_invoer_blijft_zonder_plooi_en_onbekende_velden_worden_geweigerd() {
    let mut p = input(-100.0, 0.0, 0.0);
    p.plooi = None;
    let raw = serde_json::to_value(&p).unwrap();
    assert!(raw.get("plooi").is_none());
    let r = check_plate(&serde_json::from_value(raw).unwrap());
    assert_eq!(r.checks.len(), 1);
    assert_eq!(r.governing_check_id, VLOEI_ID);
    assert_relative_eq!(r.uc_max, 100.0 / 235.0, epsilon = 1e-12);
    assert_eq!(r.niet_getoetst[0].id, "en1993_1_5_plooi");
    let mut raw = serde_json::to_value(input(-100.0, 0.0, 0.0)).unwrap();
    raw["plooi"]["a_m"] = json!(2);
    assert!(serde_json::from_value::<PlateCheckInput>(raw).is_err());
}

#[test]
fn ontbrekend_element_in_eerste_of_alle_combinaties_wordt_geweigerd() {
    let mut p = input(-100.0, 0.0, 0.0);
    p.combinations[0].elements.pop();
    refused(&p, "elementdekking");
    let mut c = p.combinations[0].clone();
    c.combination_id = 2;
    p.combinations.push(c);
    refused(&p, "elementdekking");
    p.plooi.as_mut().unwrap().expected_element_ids.clear();
    refused(&p, "expected_element_ids");
    p.plooi.as_mut().unwrap().expected_element_ids = vec![1, 1];
    refused(&p, "duplicaten");
    let mut raw = serde_json::to_value(input(-100.0, 0.0, 0.0)).unwrap();
    raw["plooi"]
        .as_object_mut()
        .unwrap()
        .remove("expected_element_ids");
    assert!(serde_json::from_value::<PlateCheckInput>(raw).is_err());
}

#[test]
fn extreme_eindige_biaxiale_druk_mag_nooit_uc_nul_opleveren() {
    assert_relative_eq!(
        plaat_check::staal::sigma_eq(-1e155, -1e155, 0.0),
        1e155,
        max_relative = 1e-14
    );
    for magnitude in [1e155, 1e308] {
        let mut p = input(-magnitude, -magnitude, 0.0);
        p.plooi.as_mut().unwrap().a_mm = 1000.0;
        for buckling in [true, false] {
            if !buckling {
                p.plooi = None;
            }
            let r = check_plate(&p);
            assert!(
                r.geweigerd.is_some()
                    || (r.status == CheckStatus::NotOk && r.uc_max.is_finite() && r.uc_max > 1.0)
            );
        }
    }
}
