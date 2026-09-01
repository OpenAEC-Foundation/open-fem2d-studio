//! Doorsnedetoetsen 6.2.5 / 6.2.6 / 6.2.8 tegen de referentie-uitwerking 2867.
//! Roept de echte crate-functies aan met de profielen uit de database.

use approx::assert_relative_eq;
use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::classification::CrossSectionClass;
use nen_en_1993_1_1_section::{bending, combined_mv, shear, S235};

fn snapshot(my_ed_knm: f64, vz_ed_kn: f64) -> ForceStateSnapshot {
    ForceStateSnapshot {
        combination_id: 21,
        position_mm: 4000.0,
        forces: InternalForces { my_ed: my_ed_knm, vz_ed: vz_ed_kn, ..Default::default() },
    }
}

#[test]
fn buiging_hea320() {
    let p = &steel_profiles::db().find("HEA 320").unwrap().properties;
    let r = bending::m_y_c_rd(p, &S235, CrossSectionClass::Class1, snapshot(111.84, 0.0));
    assert_relative_eq!(r.value, 382.666, max_relative = 1e-3);
    assert_relative_eq!(r.uc.unwrap().uc, 0.29, max_relative = 3e-2);
}

#[test]
fn buiging_hea400() {
    let p = &steel_profiles::db().find("HEA 400").unwrap().properties;
    let r = bending::m_y_c_rd(p, &S235, CrossSectionClass::Class1, snapshot(227.04, 0.0));
    assert_relative_eq!(r.value, 602.106, max_relative = 1e-3);
    assert_relative_eq!(r.uc.unwrap().uc, 0.38, max_relative = 3e-2);
}

#[test]
fn dwarskracht_hea320() {
    let p = &steel_profiles::db().find("HEA 320").unwrap().properties;
    let r = shear::v_z_c_rd(p, &S235, snapshot(0.0, 55.92));
    assert_relative_eq!(r.value, 558.4, max_relative = 1e-3);
    assert_relative_eq!(r.uc.unwrap().uc, 0.10, max_relative = 5e-2);
}

#[test]
fn dwarskracht_hea400() {
    let p = &steel_profiles::db().find("HEA 400").unwrap().properties;
    let r = shear::v_z_c_rd(p, &S235, snapshot(0.0, 113.52));
    assert_relative_eq!(r.value, 778.1, max_relative = 1e-3);
    assert_relative_eq!(r.uc.unwrap().uc, 0.15, max_relative = 3e-2);
}

#[test]
fn profielnaam_werkt_met_en_zonder_spatie() {
    // De database slaat "HEA 320" op; aanroepers gebruiken vaak "HEA320".
    let db = steel_profiles::db();
    assert!(db.find("HEA 320").is_some());
    assert!(db.find("HEA320").is_some());
}

#[test]
fn dwarskracht_effect_verwaarloosbaar_in_referentiecasus() {
    // 6.2.8(2): V_Ed = 0 kN < V_pl,Rd/2 = 279,19 kN → geen reductie op M_Rd
    assert!(combined_mv::dwarskracht_verwaarloosbaar(0.0, 558.38));
    // HEA 400: V_Ed = 0 < 389,055
    assert!(combined_mv::dwarskracht_verwaarloosbaar(0.0, 778.109));
}

#[test]
fn dwarskracht_effect_telt_mee_boven_de_helft() {
    // Net boven de helft → wél reductie
    assert!(!combined_mv::dwarskracht_verwaarloosbaar(300.0, 558.38));
    // Exact op de helft telt als verwaarloosbaar (≤-grens)
    assert!(combined_mv::dwarskracht_verwaarloosbaar(279.19, 558.38));
}
