//! Lambda_LT + chi_LT helpers + de indeling van de ligger in kipvelden.

/// De grenzen van de kipvelden, in mm vanaf het staafbegin.
///
/// NB.NB.4.3 noemt L_st "de ongesteunde lengte tussen twee gaffels, tussen één
/// gaffel en één kipsteun of tussen twee kipsteunen". De staafeinden zijn
/// gaffels (vorkopleggingen — dat is de aanname van de hele keten, zie
/// `en_general`), dus de grenzen zijn 0, de kipsteunen, en L.
///
/// `kipsteun_fracties` zijn fracties van de staaflengte (0 < f < 1) van de
/// steunen aan de **gedrukte** flens; zie [`crate::LateralBracing::gedrukte_flens_posities`].
/// Waarden buiten (0;1) en dubbele waarden worden genegeerd: het staafeinde is
/// al een gaffel en een dubbele steun voegt geen veldgrens toe.
///
/// De teruggegeven vector is oplopend gesorteerd en heeft altijd minstens twee
/// elementen, zodat er altijd minstens één kipveld is.
pub fn kipveld_grenzen_mm(length_mm: f64, kipsteun_fracties: &[f64]) -> Vec<f64> {
    let mut grenzen: Vec<f64> = std::iter::once(0.0)
        .chain(
            kipsteun_fracties
                .iter()
                .copied()
                .filter(|f| f.is_finite() && *f > 0.0 && *f < 1.0)
                .map(|f| f * length_mm),
        )
        .chain(std::iter::once(length_mm))
        .collect();
    grenzen.sort_by(|a, b| a.partial_cmp(b).unwrap());
    grenzen.dedup_by(|a, b| (*a - *b).abs() < 1e-6);
    if grenzen.len() < 2 {
        grenzen = vec![0.0, length_mm.max(1e-9)];
    }
    grenzen
}

pub fn lambda_lt(wpl_y_mm3: f64, fy_mpa: f64, m_cr_knm: f64) -> f64 {
    if m_cr_knm <= 0.0 { return f64::INFINITY; }
    let m_cr_nmm = m_cr_knm * 1e6;
    (wpl_y_mm3 * fy_mpa / m_cr_nmm).sqrt()
}

pub fn chi_lt(lambda_lt: f64, alpha_lt: f64) -> f64 {
    let beta = 0.75;
    let lambda_lt_0 = 0.4;
    let phi = 0.5 * (1.0 + alpha_lt * (lambda_lt - lambda_lt_0) + beta * lambda_lt.powi(2));
    let denom = phi + (phi.powi(2) - beta * lambda_lt.powi(2)).sqrt();
    if denom > 0.0 {
        let chi = 1.0 / denom;
        chi.min(1.0).min(1.0 / lambda_lt.powi(2))
    } else {
        1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn calc2_beam1_lambda_lt() {
        let l = lambda_lt(354113.0, 235.0, 650.886);
        assert_relative_eq!(l, 0.358, max_relative = 0.01);
    }

    #[test]
    fn calc2_beam1_chi_lt_below_lambda_0() {
        let chi = chi_lt(0.5, 0.34);
        assert!(chi > 0.9 && chi <= 1.0);
    }

    #[test]
    fn zonder_kipsteunen_is_er_precies_een_veld() {
        assert_eq!(kipveld_grenzen_mm(5700.0, &[]), vec![0.0, 5700.0]);
    }

    #[test]
    fn kipsteunen_op_de_derdepunten_geven_drie_velden() {
        let g = kipveld_grenzen_mm(8000.0, &[1.0 / 3.0, 2.0 / 3.0]);
        assert_eq!(g.len(), 4);
        assert_relative_eq!(g[1], 2666.667, max_relative = 1e-5);
        assert_relative_eq!(g[2], 5333.333, max_relative = 1e-5);
        assert_relative_eq!(g[3], 8000.0, max_relative = 1e-12);
    }

    #[test]
    fn fracties_worden_gesorteerd_en_de_uiteinden_genegeerd() {
        // 0 en 1 vallen samen met de gaffels; ze voegen geen veldgrens toe.
        // Ongesorteerde invoer mag geen negatieve veldlengte opleveren.
        let g = kipveld_grenzen_mm(1000.0, &[0.75, 0.0, 0.25, 1.0, 0.25]);
        assert_eq!(g, vec![0.0, 250.0, 750.0, 1000.0]);
    }
}
