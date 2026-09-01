//! Doorsnedegrootheden HEA320/HEA400 conform de referentie-uitwerking 2867.

use approx::assert_relative_eq;

#[test]
fn hea320_conform_referentie() {
    let p = steel_profiles::db().find("HEA320").expect("HEA320 in database");
    assert_relative_eq!(p.properties.area_mm2, 12438.9, max_relative = 1e-3);
    assert_relative_eq!(p.properties.iy_mm4, 229321969.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.iz_mm4, 69852972.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.it_mm4, 1084313.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.wpl_y_mm3, 1628366.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.wel_y_mm3, 1479497.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.av_z_mm2, 4116.0, max_relative = 1e-3);
    assert_relative_eq!(p.geometry.h, 310.0, max_relative = 1e-6);
    assert_relative_eq!(p.geometry.b, 300.0, max_relative = 1e-6);
    assert_relative_eq!(p.geometry.tf, 15.5, max_relative = 1e-6);
    assert_relative_eq!(p.geometry.tw, 9.0, max_relative = 1e-6);
}

#[test]
fn hea400_conform_referentie() {
    let p = steel_profiles::db().find("HEA400").expect("HEA400 in database");
    assert_relative_eq!(p.properties.area_mm2, 15900.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.iz_mm4, 85638935.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.it_mm4, 1897649.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.wpl_y_mm3, 2562154.0, max_relative = 1e-3);
    assert_relative_eq!(p.properties.av_z_mm2, 5735.0, max_relative = 1e-3);
    assert_relative_eq!(p.geometry.h, 390.0, max_relative = 1e-6);
    assert_relative_eq!(p.geometry.tf, 19.0, max_relative = 1e-6);
    assert_relative_eq!(p.geometry.tw, 11.0, max_relative = 1e-6);
}

/// De database schrijft de namen met spatie ("HEA 320"), maar de frontend en
/// externe aanroepers gebruiken vaak "HEA320". Beide moeten hetzelfde profiel
/// opleveren, anders valt de toetsing stil op een naamverschil.
#[test]
fn lookup_negeert_spaties_en_hoofdletters() {
    let db = steel_profiles::db();
    let met_spatie = db.find("HEA 320").expect("'HEA 320' in database");
    let zonder_spatie = db.find("HEA320").expect("'HEA320' moet ook vinden");
    let kleine_letters = db.find("hea 320").expect("'hea 320' moet ook vinden");
    assert_eq!(met_spatie.name, zonder_spatie.name);
    assert_eq!(met_spatie.name, kleine_letters.name);
    assert_eq!(met_spatie.name, "HEA 320", "de opgeslagen naam houdt zijn spatie");

    // Hetzelfde voor de andere profielfamilies die met spatie zijn opgeslagen.
    assert!(db.find("IPE300").is_some(), "'IPE300' moet 'IPE 300' vinden");
    assert!(db.find("HEB 300").is_some());
    assert!(db.find("HEB300").is_some());

    // Een niet-bestaand profiel blijft None.
    assert!(db.find("HEA 999").is_none());
}
