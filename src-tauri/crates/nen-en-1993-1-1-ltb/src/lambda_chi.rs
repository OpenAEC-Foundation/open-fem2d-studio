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
///
/// De tolerantie [`MIN_VELDFRACTIE`] is niet cosmetisch: zonder haar overleeft
/// een steun op f = 10⁻⁹ het filter, maakt een kipveld van een paar nanometer
/// en zet daarmee de hele staaf van het gaffelgeval (L_kip = L_st) op de
/// formule met β. Gemeten op een ligger van 6000 mm: L_kip 6000 → 8400 mm en
/// de UC 1,0232 → 1,3349, op invoer die numeriek niet van "geen kipsteun" te
/// onderscheiden is.
pub fn kipveld_grenzen_mm(length_mm: f64, kipsteun_fracties: &[f64]) -> Vec<f64> {
    let tol_mm = (MIN_VELDFRACTIE * length_mm.abs()).max(1e-9);
    let mut grenzen: Vec<f64> = std::iter::once(0.0)
        .chain(
            kipsteun_fracties
                .iter()
                .copied()
                .filter(|f| f.is_finite() && *f > MIN_VELDFRACTIE && *f < 1.0 - MIN_VELDFRACTIE)
                .map(|f| f * length_mm),
        )
        .chain(std::iter::once(length_mm))
        .collect();
    grenzen.sort_by(|a, b| a.partial_cmp(b).unwrap());
    grenzen.dedup_by(|a, b| (*a - *b).abs() < tol_mm);
    if grenzen.len() < 2 {
        grenzen = vec![0.0, length_mm.max(1e-9)];
    }
    grenzen
}

/// Een kipveld korter dan één promille van de staaflengte is geen kipveld maar
/// invoerruis. Op een ligger van 6 m is dat 6 mm.
///
/// Geen normwaarde — de norm kent geen ondergrens aan L_st. Dit is een
/// numerieke drempel die voorkomt dat een steun die met een staafeind samenvalt
/// het gaffelgeval van NB.NB.4.3 wegneemt.
pub const MIN_VELDFRACTIE: f64 = 1e-3;

pub fn lambda_lt(wpl_y_mm3: f64, fy_mpa: f64, m_cr_knm: f64) -> f64 {
    if m_cr_knm <= 0.0 { return f64::INFINITY; }
    let m_cr_nmm = m_cr_knm * 1e6;
    (wpl_y_mm3 * fy_mpa / m_cr_nmm).sqrt()
}

/// EN 1993-1-1 vgl. (6.57) — de kipreductiefactor voor gewalste profielen en
/// equivalente gelaste profielen (art. 6.3.2.3(1)):
///
/// ```text
/// Φ_LT = 0,5·[1 + α_LT·(λ̄_LT − λ̄_LT,0) + β·λ̄_LT²]
/// χ_LT = 1 / (Φ_LT + √(Φ_LT² − β·λ̄_LT²)),   met χ_LT ≤ 1,0 en χ_LT ≤ 1/λ̄_LT²
/// ```
///
/// De twee getallen hieronder zijn nationale keuzes, en de Nederlandse bijlage
/// schrapt bij 6.3.2.3(1) het woord "aanbevolen": *"de waarde van λ_LT,0 moet
/// gelijk zijn genomen aan 0,4; de waarde van β moet gelijk zijn genomen aan
/// 0,75"*. Ze zijn dus voorschrift, geen keuze.
///
/// Dát deze crate met deze twee waarden rekent, is precies waarom de kipkromme
/// uit tabel 6.5 komt en niet uit tabel 6.4 — zie
/// [`crate::kipkromme_tabel_6_5`]. De algemene methode 6.3.2.2 (vgl. 6.56)
/// hoort bij λ̄_LT,0 = 0,2, β = 1,0 en tabel 6.4, en geeft dezelfde doorsnede
/// één kromme gunstiger.
///
/// Vgl. (6.58) uit 6.3.2.3(2) — χ_LT,mod = χ_LT/f, met f uit de
/// correctiefactor k_c — is NIET geïmplementeerd. Omdat f ≤ 1 geldt
/// χ_LT,mod ≥ χ_LT: weglaten is veilig-zijdig. Zie bevinding B12 van het
/// validatiedossier; `m_b_rd` zet die kanttekening in het rapport.
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
    fn een_steun_die_praktisch_op_het_staafeind_ligt_maakt_geen_kipveld() {
        // Zonder drempel overleeft f = 1e-9 het filter: een kipveld van 6
        // nanometer op een ligger van 6000 mm, dat het gaffelgeval van
        // NB.NB.4.3 wegneemt en L_kip van 6000 naar 8400 mm brengt. Invoer die
        // numeriek niet van "geen kipsteun" te onderscheiden is, mag de
        // uitkomst niet 30 % verschuiven.
        assert_eq!(kipveld_grenzen_mm(6000.0, &[1e-9]), vec![0.0, 6000.0]);
        assert_eq!(kipveld_grenzen_mm(6000.0, &[1.0 - 1e-9]), vec![0.0, 6000.0]);
        // Eén promille van de lengte is de drempel; daarboven telt de steun.
        assert_eq!(kipveld_grenzen_mm(6000.0, &[0.01]), vec![0.0, 60.0, 6000.0]);
    }

    #[test]
    fn fracties_worden_gesorteerd_en_de_uiteinden_genegeerd() {
        // 0 en 1 vallen samen met de gaffels; ze voegen geen veldgrens toe.
        // Ongesorteerde invoer mag geen negatieve veldlengte opleveren.
        let g = kipveld_grenzen_mm(1000.0, &[0.75, 0.0, 0.25, 1.0, 0.25]);
        assert_eq!(g, vec![0.0, 250.0, 750.0, 1000.0]);
    }
}
