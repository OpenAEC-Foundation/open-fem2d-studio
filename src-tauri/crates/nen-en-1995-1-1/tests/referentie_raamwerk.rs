//! Integratietest: de volledige afleiding van staaf 2 uit de
//! referentie-uitwerking (C24 96x450, klimaatklasse 1, middellang),
//! opgebouwd uit de losse normfuncties.

use approx::assert_relative_eq;
use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1995_1_1::stability::{
    check_beam_stability, check_column_stability, BeamStabilityInput, ColumnStabilityInput,
};
use nen_en_1995_1_1::*;

fn c24() -> &'static StrengthClass {
    strength_class_by_name("C24").expect("C24 aanwezig")
}

fn rekenwaarden() -> (f64, f64, f64, f64) {
    let mat = c24();
    let g = gamma_m(mat.timber_type);
    let km = k_mod(mat.timber_type, ServiceClass::Sc1, LoadDurationClass::MediumTerm);
    let f_c0d = design_strength(mat.f_c0k, km, g, 1.0, 1.0);
    let f_myd = design_strength(mat.f_mk, km, g, k_h(mat.timber_type, 450.0), 1.0);
    let f_mzd = design_strength(mat.f_mk, km, g, k_h(mat.timber_type, 96.0), 1.0);
    let f_vd = design_strength(mat.f_vk, km, g, 1.0, 1.0);
    (f_c0d, f_myd, f_mzd, f_vd)
}

#[test]
fn rekenwaarden_conform_referentietabel() {
    let (f_c0d, f_myd, f_mzd, f_vd) = rekenwaarden();
    assert_relative_eq!(f_c0d, 12.92, max_relative = 1e-3);
    assert_relative_eq!(f_myd, 14.77, max_relative = 1e-3);
    assert_relative_eq!(f_mzd, 16.1, max_relative = 5e-3); // via k_h = (150/96)^0,2
    assert_relative_eq!(f_vd, 2.46, max_relative = 2e-3);
}

#[test]
fn staaf2_volledige_afleiding() {
    let sectie = RectTimberSection::new(96.0, 450.0);
    let mat = c24();
    let (f_c0d, f_myd, f_mzd, f_vd) = rekenwaarden();

    // --- art. 6.1.4 (6.2): sigma_c,0,d = 1,3 < 12,9 → UC 0,10
    let druk = compression::check_compression_parallel(
        &sectie,
        f_c0d,
        ForceStateSnapshot {
            combination_id: 12,
            position_mm: 1034.0,
            forces: InternalForces { n_ed: -57.64, ..Default::default() },
        },
    );
    assert_relative_eq!(druk.value, 1.33, max_relative = 5e-3);
    assert_relative_eq!(druk.uc.as_ref().unwrap().uc, 0.10, max_relative = 4e-2);

    // --- art. 6.1.7 (6.13): tau = 2,6 > 2,5 → UC 1,07
    let dwars = shear::check_shear(
        &sectie,
        f_vd,
        1.0, // referentie rekent met volle breedte
        ForceStateSnapshot {
            combination_id: 12,
            position_mm: 0.0,
            forces: InternalForces { vz_ed: 75.5676, ..Default::default() },
        },
    );
    assert_relative_eq!(dwars.value, 2.62, max_relative = 3e-3);
    assert_relative_eq!(dwars.uc.as_ref().unwrap().uc, 1.07, max_relative = 5e-3);

    // --- art. 6.3.2 (6.23)/(6.24): UC 1,64 / 1,18
    let veld = ForceStateSnapshot {
        combination_id: 12,
        position_mm: 3688.0,
        forces: InternalForces { n_ed: -57.64, my_ed: 72.170, ..Default::default() },
    };
    let kolom = check_column_stability(
        &sectie,
        &ColumnStabilityInput {
            l_cr_y_mm: 6342.0,
            l_cr_z_mm: 1268.0,
            f_c0k_mpa: mat.f_c0k,
            e0_05_mpa: mat.e0_05,
            beta_c: beta_c(mat.timber_type),
            f_c0d_mpa: f_c0d,
            f_myd_mpa: f_myd,
            f_mzd_mpa: f_mzd,
            k_m: k_m(true),
        },
        veld,
    );
    assert_relative_eq!(kolom.uc.as_ref().unwrap().uc, 1.64, max_relative = 5e-3);

    // --- art. 6.3.3 (6.35): UC 2,40 (maatgevend)
    let kip = check_beam_stability(
        &sectie,
        &BeamStabilityInput {
            // De referentie rekent feitelijk met l_ef = 1268 mm
            // (de kipsteunafstand); zie doc bij effective_length_mm.
            l_ef_mm: 1268.0,
            l_cr_z_mm: 1268.0,
            f_mk_mpa: mat.f_mk,
            f_c0k_mpa: mat.f_c0k,
            e0_05_mpa: mat.e0_05,
            beta_c: beta_c(mat.timber_type),
            f_myd_mpa: f_myd,
            f_c0d_mpa: f_c0d,
        },
        veld,
    );
    assert_relative_eq!(kip.uc.as_ref().unwrap().uc, 2.40, max_relative = 5e-3);

    // --- doorbuiging: UC 1,55 / 0,77
    let kdef = k_def(mat.timber_type, ServiceClass::Sc1);
    assert_relative_eq!(kdef, 0.60);
    let (fin, add) = deflection::check_deflection_pair(
        -24.5, -24.5, -24.5, kdef, 6342.0,
        deflection::NOEMER_W_FIN, deflection::NOEMER_W_ADD,
    );
    assert_relative_eq!(fin.uc.as_ref().unwrap().uc, 1.55, max_relative = 5e-3);
    assert_relative_eq!(add.uc.as_ref().unwrap().uc, 0.77, max_relative = 5e-3);
}
