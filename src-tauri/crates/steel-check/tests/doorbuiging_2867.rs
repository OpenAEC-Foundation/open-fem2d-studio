//! Doorbuigingstoets tegen de referentie-uitwerking 2867.

use approx::assert_relative_eq;
use steel_check::deflection;

#[test]
fn w_fin_hea320() {
    // w_fin = w_z - w_zeeg = -11 - 0 = -11 mm
    let w_fin = deflection::w_fin_mm(-11.0, 0.0);
    assert_relative_eq!(w_fin, -11.0, max_relative = 1e-6);
    // Grens L/333 = 8000/333 = 24,0 mm → UC = 11/24 = 0,46
    let grens = deflection::grens_mm(8000.0, 333.0);
    assert_relative_eq!(grens, 24.02, max_relative = 2e-3);
    assert_relative_eq!(w_fin.abs() / grens, 0.46, max_relative = 2e-2);
}

#[test]
fn w_add_hea320() {
    // w_add = w_fin - w_BGT,permanent = -11 - (-3,2) = -7,8 mm
    let w_add = deflection::w_add_mm(-11.0, -3.2);
    assert_relative_eq!(w_add, -7.8, max_relative = 1e-3);
    // Grens L/150 = 53,3 mm → UC = 7,8/53,3 = 0,15
    let grens = deflection::grens_mm(8000.0, 150.0);
    assert_relative_eq!(grens, 53.33, max_relative = 2e-3);
    assert_relative_eq!(w_add.abs() / grens, 0.15, max_relative = 3e-2);
}

#[test]
fn w_fin_hea400() {
    let w_fin = deflection::w_fin_mm(-11.2, 0.0);
    let grens = deflection::grens_mm(8000.0, 333.0);
    assert_relative_eq!(w_fin.abs() / grens, 0.47, max_relative = 3e-2);
}

#[test]
fn zeeg_vermindert_de_doorbuiging() {
    // Een zeeg van 10 mm omhoog compenseert een zakking van 11 mm.
    let w_fin = deflection::w_fin_mm(-11.0, -10.0);
    assert_relative_eq!(w_fin, -1.0, max_relative = 1e-6);
}

#[test]
fn paar_levert_twee_checks_met_eigen_id_en_grens() {
    use steel_check::DeflectionClass;
    let (fin, add) = deflection::check_deflection_pair(
        -11.0, 0.0, -3.2, 8.0, DeflectionClass::Floor, 333,
    );
    assert_eq!(fin.id, "deflection_w_fin");
    assert_eq!(add.id, "deflection_w_add");
    // w_fin toetst op L/333, w_add op de vaste L/150
    assert_relative_eq!(fin.value, 24.02, max_relative = 2e-3);
    assert_relative_eq!(add.value, 53.33, max_relative = 2e-3);
    assert_relative_eq!(fin.uc.clone().unwrap().uc, 0.46, max_relative = 2e-2);
    assert_relative_eq!(add.uc.clone().unwrap().uc, 0.15, max_relative = 3e-2);
}
