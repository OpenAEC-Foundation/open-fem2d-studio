//! NEN-EN 1993-1-1 Annex B — interaction factors for combined N+M (Method 2).

#[derive(Clone, Copy, Debug)]
pub struct InteractionFactors {
    pub k_yy: f64, pub k_yz: f64,
    pub k_zy: f64, pub k_zz: f64,
}

pub fn interaction_factors_method_2(
    n_ed_kn: f64, n_b_rd_y_kn: f64, n_b_rd_z_kn: f64,
    lambda_bar_y: f64, lambda_bar_z: f64,
    cm_y: f64, cm_z: f64,
    is_class_1_or_2: bool,
) -> InteractionFactors {
    let n_ratio_y = n_ed_kn / n_b_rd_y_kn;
    let n_ratio_z = n_ed_kn / n_b_rd_z_kn;

    if is_class_1_or_2 {
        let k_yy_a = cm_y * (1.0 + (lambda_bar_y - 0.2) * n_ratio_y);
        let k_yy_b = cm_y * (1.0 + 0.8 * n_ratio_y);
        let k_yy = k_yy_a.min(k_yy_b);

        let k_zz_a = cm_z * (1.0 + (2.0 * lambda_bar_z - 0.6) * n_ratio_z);
        let k_zz_b = cm_z * (1.0 + 1.4 * n_ratio_z);
        let k_zz = k_zz_a.min(k_zz_b);

        let k_yz = 0.6 * k_zz;
        let k_zy = 0.6 * k_yy;

        InteractionFactors { k_yy, k_yz, k_zy, k_zz }
    } else {
        let k_yy = (cm_y * (1.0 + 0.6 * lambda_bar_y * n_ratio_y)).min(cm_y * (1.0 + 0.6 * n_ratio_y));
        let k_zz = (cm_z * (1.0 + 0.6 * lambda_bar_z * n_ratio_z)).min(cm_z * (1.0 + 0.6 * n_ratio_z));
        let k_yz = k_zz;
        let k_zy = 0.8 * k_yy;
        InteractionFactors { k_yy, k_yz, k_zy, k_zz }
    }
}

pub fn cm_uniform_or_psi(psi: f64) -> f64 {
    (0.6 + 0.4 * psi).max(0.4)
}
