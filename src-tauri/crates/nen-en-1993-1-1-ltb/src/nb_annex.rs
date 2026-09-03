//! NEN-EN 1993-1-1+C2+A1/NB:2016 nl — Mcr formulation per Dutch national annex.

use std::f64::consts::PI;

/// Elasticiteitsmodulus staal (EN 1993-1-1 art. 3.2.6).
pub const E_MPA: f64 = 210000.0;
/// Schuifmodulus staal. De referentie-uitwerking rekent met exact deze waarde
/// (E / (2·(1+ν)) met ν = 0,3 geeft 80769,2).
pub const G_MPA: f64 = 80769.0;

/// Rijen van [`NB_C1_UDL`] en [`NB_C2_UDL`]: de momentverhouding β.
const NB_BETAS: [f64; 5] = [-1.0, -0.5, 0.0, 0.5, 1.0];
/// Kolomstap van [`NB_C1_UDL`] en [`NB_C2_UDL`]: B* van 0,00 tot 1,00.
const NB_B_STAP: f64 = 0.05;

/// Figuur NB.NB.5 — C₁ voor gelijkmatig verdeelde belasting met eindmomenten,
/// als functie van β en B*.
///
/// Rijen: β = −1,0 / −0,5 / 0,0 / +0,5 / +1,0.
/// Kolommen: B* = 0,00 … 1,00 in stappen van 0,05.
///
/// Afgelezen uit de figuur, met de uiteinden verankerd op tabel NB.NB.1:
/// bij B* = 0 (zuivere veldbelasting) geldt C₁ = 1,13 voor alle β, en bij
/// B* = 1 (zuivere eindmomenten) geldt C₁ = min(1,75 − 1,05β + 0,3β² ; 2,30).
/// Controlepunt uit de referentie-uitwerking: β = 0 en B* = 0,889 geeft 1,513
/// tegen 1,529 in de referentie (1,0% afwijking — de aflezingsnauwkeurigheid
/// van de figuur).
const NB_C1_UDL: [[f64; 21]; 5] = [
    [1.130, 1.145, 1.159, 1.174, 1.189, 1.203, 1.218, 1.233, 1.247, 1.262, 1.276,
     1.333, 1.422, 1.558, 1.787, 1.982, 2.187, 2.298, 2.297, 2.297, 2.300],
    [1.130, 1.135, 1.140, 1.145, 1.150, 1.155, 1.160, 1.165, 1.170, 1.176, 1.181,
     1.208, 1.252, 1.310, 1.402, 1.556, 1.734, 1.902, 2.073, 2.238, 2.300],
    [1.130, 1.129, 1.128, 1.127, 1.127, 1.126, 1.125, 1.124, 1.123, 1.122, 1.122,
     1.128, 1.137, 1.153, 1.186, 1.239, 1.312, 1.423, 1.547, 1.673, 1.750],
    [1.130, 1.125, 1.121, 1.116, 1.111, 1.106, 1.102, 1.097, 1.092, 1.087, 1.083,
     1.077, 1.077, 1.073, 1.073, 1.077, 1.088, 1.115, 1.162, 1.234, 1.300],
    [1.130, 1.124, 1.118, 1.112, 1.106, 1.100, 1.094, 1.088, 1.082, 1.076, 1.070,
     1.064, 1.060, 1.051, 1.046, 1.037, 1.032, 1.024, 1.015, 1.010, 1.000],
];

/// Figuur NB.NB.6 — C₂ voor gelijkmatig verdeelde belasting met eindmomenten.
///
/// Zelfde raster als [`NB_C1_UDL`]. Verankerd op tabel NB.NB.1: C₂ = 0,45 bij
/// B* = 0 en C₂ = 0 bij B* = 1. Controlepunt: β = 0 en B* = 0,889 geeft 0,075
/// tegen 0,074 in de referentie-uitwerking (1,1% afwijking).
///
/// De waarden zijn positief; de tekenomkering voor een destabiliserend
/// aangrijpingspunt gebeurt in [`c2_gecorrigeerd`].
const NB_C2_UDL: [[f64; 21]; 5] = [
    [0.450, 0.450, 0.450, 0.449, 0.449, 0.449, 0.444, 0.438, 0.429, 0.418, 0.408,
     0.378, 0.350, 0.315, 0.285, 0.245, 0.202, 0.160, 0.109, 0.054, 0.000],
    [0.450, 0.446, 0.442, 0.437, 0.433, 0.421, 0.411, 0.392, 0.374, 0.356, 0.336,
     0.310, 0.287, 0.260, 0.231, 0.198, 0.163, 0.128, 0.089, 0.044, 0.000],
    [0.450, 0.440, 0.430, 0.420, 0.410, 0.388, 0.375, 0.354, 0.334, 0.314, 0.290,
     0.264, 0.240, 0.214, 0.185, 0.159, 0.132, 0.100, 0.067, 0.034, 0.000],
    [0.450, 0.433, 0.416, 0.399, 0.383, 0.364, 0.346, 0.326, 0.300, 0.281, 0.255,
     0.235, 0.211, 0.186, 0.160, 0.134, 0.111, 0.082, 0.056, 0.028, 0.000],
    [0.450, 0.428, 0.405, 0.383, 0.360, 0.338, 0.313, 0.292, 0.265, 0.245, 0.221,
     0.195, 0.172, 0.151, 0.128, 0.107, 0.086, 0.059, 0.043, 0.021, 0.000],
];

/// NB.NB.13 — S = (h/2)·√(E·I_z / (G·I_t)), in mm.
pub fn s_parameter(h_mm: f64, e_mpa: f64, iz_mm4: f64, g_mpa: f64, it_mm4: f64) -> f64 {
    (h_mm / 2.0) * (e_mpa * iz_mm4 / (g_mpa * it_mm4)).sqrt()
}

/// Bilineaire interpolatie in een NB-tabel van 5 β-rijen × 21 B*-kolommen.
fn interpoleer(tabel: &[[f64; 21]; 5], beta: f64, b_abs: f64) -> f64 {
    // Kolom: B* op het raster van 0,05.
    let pos = (b_abs / NB_B_STAP).clamp(0.0, 20.0);
    let j = (pos.floor() as usize).min(19);
    let tb = pos - j as f64;

    // Rij: β op het raster van 0,5.
    let bpos = ((beta.clamp(-1.0, 1.0) + 1.0) / 0.5).clamp(0.0, 4.0);
    let i = (bpos.floor() as usize).min(3);
    let ta = bpos - i as f64;

    let boven = tabel[i][j] + tb * (tabel[i][j + 1] - tabel[i][j]);
    let onder = tabel[i + 1][j] + tb * (tabel[i + 1][j + 1] - tabel[i + 1][j]);
    boven + ta * (onder - boven)
}

/// NB.NB.4.3(3) — C₁ en C₂ voor gelijkmatig verdeelde belasting met
/// eindmomenten, bilineair geïnterpoleerd uit figuur NB.NB.5 en NB.NB.6.
///
/// `beta` = M_y,1,Ed / M_y,2,Ed (kleinste over grootste eindmoment),
/// `b_ster` volgens [`b_ster`]. De teruggegeven C₂ is de tabelwaarde; pas
/// [`c2_gecorrigeerd`] toe voor het aangrijpingspunt van de belasting.
///
/// LET OP: alleen de tak B* ≥ 0 is uit de figuren gedigitaliseerd. Op de
/// negatieve tak kruisen de krommen elkaar en liggen pieken tot C₁ = 2,3; die
/// is niet uitgelezen. Voor B* < 0 wordt daarom de waarde bij |B*| gebruikt.
/// Die ligt lager dan de werkelijke piekwaarden, dus het resultaat is
/// veilig-zijdig, maar het is een benadering die nog geverifieerd moet worden
/// voordat liggers met een negatieve B* worden vrijgegeven.
pub fn c1_c2_factors(beta: f64, b_ster: f64) -> (f64, f64) {
    let b_abs = b_ster.abs().clamp(0.0, 1.0);
    (
        interpoleer(&NB_C1_UDL, beta, b_abs),
        interpoleer(&NB_C2_UDL, beta, b_abs),
    )
}

/// Ondersteunt tests en aanroepers die willen weten welke β-rijen de tabel kent.
pub fn nb_beta_raster() -> [f64; 5] { NB_BETAS }

/// NB.NB.11 — C-coëfficiënt.
///
/// C = (π·C₁·L_g / L_kip) · ( √(1 + π²·S²/L_kip² · (C₂² + 1)) + π·C₂·S/L_kip )
///
/// Let op de haakjes: de term π·C₂·S/L_kip staat BUITEN de wortel. Hij is
/// negatief wanneer de belasting boven het zwaartepunt aangrijpt (C₂ < 0) en
/// verlaagt dan de C-waarde, en daarmee M_cr.
pub fn c_coefficient(c1: f64, l_g_mm: f64, l_kip_mm: f64, s_mm: f64, c2: f64) -> f64 {
    if l_kip_mm <= 0.0 { return 0.0; }
    let voorfactor = (PI * c1 * l_g_mm) / l_kip_mm;
    let onder_wortel = 1.0 + (PI.powi(2) * s_mm.powi(2) / l_kip_mm.powi(2)) * (c2.powi(2) + 1.0);
    let losse_term = (PI * c2 * s_mm) / l_kip_mm;
    voorfactor * (onder_wortel.sqrt() + losse_term)
}

/// NB.NB.9 — vervormbaarheidsmaat van de liggerdoorsnede:
///
/// α = (h · t_f · 10¹²) / (t_w³ · b · L_g²)
///
/// Alle lengtematen in mm. Hoe groter α, hoe vervormbaarder het lijf ten
/// opzichte van de liggerlengte, en hoe sterker M_cr gereduceerd moet worden.
pub fn alpha_nb9(h_mm: f64, tf_mm: f64, tw_mm: f64, b_mm: f64, l_g_mm: f64) -> f64 {
    let noemer = tw_mm.powi(3) * b_mm * l_g_mm.powi(2);
    if noemer.abs() < 1e-9 { return 0.0; }
    (h_mm * tf_mm * 1e12) / noemer
}

/// Bovengrens voor α waarboven de NB geen k_red meer geeft (NB.NB.4.2(3)).
pub const ALPHA_MAX: f64 = 5000.0;

/// NB.NB.4.2(3) — boven deze α geeft de norm geen reductiefactor meer, maar
/// moet de gedrukte rand van de ligger volgens 6.3.3 worden getoetst op druk
/// en buiging uit het vlak van het lijf.
///
/// De gedrukte rand is dan de flens plus 1/6 van de lijfhoogte.
pub fn vereist_toets_gedrukte_rand(h_mm: f64, tf_mm: f64, tw_mm: f64, b_mm: f64, l_g_mm: f64) -> bool {
    h_mm / tw_mm.max(1e-9) > 75.0 && alpha_nb9(h_mm, tf_mm, tw_mm, b_mm, l_g_mm) > ALPHA_MAX
}

/// NB.NB.7 / NB.NB.8 — reductiefactor k_red voor de vervormbaarheid van de
/// liggerdoorsnede.
///
/// - `h/t_w ≤ 75`            → k_red = 1                              (NB.NB.7)
/// - `h/t_w > 75` en `α ≤ 5000` → k_red = min(−5,4·10⁻⁵·α + 1,03 ; 1) (NB.NB.8)
///
/// Bij α > 5000 geeft de norm géén k_red; dan moet de gedrukte rand volgens
/// 6.3.3 worden getoetst — zie [`vereist_toets_gedrukte_rand`]. Deze functie
/// levert in dat geval de NB.NB.8-waarde als ondergrens-benadering, zodat de
/// berekening niet stilvalt; de aanroeper hoort de aanvullende toets te
/// signaleren.
///
/// Geverifieerd tegen de referentie-uitwerking: HEA 320 (h/t_w = 34,4,
/// α = 343) en HEA 400 (h/t_w = 35,5, α = 290) geven beide k_red = 1.
pub fn k_red(h_mm: f64, tf_mm: f64, tw_mm: f64, b_mm: f64, l_g_mm: f64) -> f64 {
    if h_mm / tw_mm.max(1e-9) <= 75.0 {
        return 1.0;
    }
    let alpha = alpha_nb9(h_mm, tf_mm, tw_mm, b_mm, l_g_mm);
    (-5.4e-5 * alpha + 1.03).min(1.0)
}

/// NB.148: M_cr = k_red * (C/L_g) * sqrt(E*Iz * G*It) * 10^-6 (kNm)
pub fn m_cr_i_section(c: f64, l_g_mm: f64, iz_mm4: f64, it_mm4: f64, k_red: f64) -> f64 {
    let e_mpa = 210000.0;
    let g_mpa = 80769.0;
    k_red * (c / l_g_mm) * (e_mpa * iz_mm4 * g_mpa * it_mm4).sqrt() * 1e-6
}

/// Monosymmetric (channel) Mcr — simplified per Annex F approach.
/// Uses I-section formula with monosym warping reduction.
/// Returns Mcr in kNm.
///
/// For mono-symmetric channels (UNP, UPE), the shear center is offset from
/// the centroid by ~0.4-0.5·b. The actual Mcr involves the monosymmetry
/// parameter zj. This v1 implementation applies a conservative ~0.7 factor
/// to the I-section Mcr to approximate the reduction without the full
/// Annex F derivation.
pub fn m_cr_channel_section(c: f64, l_g_mm: f64, iz_mm4: f64, it_mm4: f64, k_red: f64) -> f64 {
    let m_cr_isection = m_cr_i_section(c, l_g_mm, iz_mm4, it_mm4, k_red);
    // Conservative reduction for monosymmetric channel
    m_cr_isection * 0.7
}

/// NB.NB.4.3 — vervangende ongesteunde kiplengte L_kip.
///
/// Tussen één gaffel en één kipsteun, of tussen twee kipsteunen:
///   L_kip = (1,4 − 0,8·β)·L_st,  met  1,0 ≤ L_kip / L_st ≤ 1,4
///
/// Ligt het veld tussen twee gaffels, dan geldt L_kip = L_st; dat geval hoort
/// bij de aanroeper, niet hier.
///
/// β = M_y,1,Ed / M_y,2,Ed, met M_1 het eindmoment met de kleinste absolute
/// waarde en M_2 dat met de grootste.
pub fn l_kip(beta: f64, l_st_mm: f64) -> f64 {
    let factor = (1.4 - 0.8 * beta).clamp(1.0, 1.4);
    factor * l_st_mm
}

/// NB.NB.4.3(3) — B* voor gelijkmatig verdeelde belasting met eindmomenten:
/// B* = 8·M / (8·|M| + q·L_st²).
///
/// Maat voor het aandeel eindmoment in de momentlijn: B* = ±1 betekent
/// uitsluitend eindmomenten (basisgeval 1 uit tabel NB.NB.1), B* = 0
/// uitsluitend veldbelasting (basisgeval 2). `m_nmm` is het eindmoment met de
/// grootste absolute waarde in N·mm (met teken), `q_n_per_mm` de gelijkmatig
/// verdeelde belasting in N/mm.
/// `q_n_per_mm` wordt op zijn grootte genomen: de richting van de belasting
/// zit al in het teken van M, en een negatieve q zou de noemer door nul kunnen
/// laten gaan en B* buiten [−1; +1] kunnen brengen (gemeten: −1,333), waarna de
/// tabelopzoeking betekenisloos is. Het veld is publiek en `#[serde(default)]`,
/// dus die waarde kan van elke aanroeper komen.
pub fn b_ster(m_nmm: f64, q_n_per_mm: f64, l_st_mm: f64) -> f64 {
    let noemer = 8.0 * m_nmm.abs() + q_n_per_mm.abs() * l_st_mm.powi(2);
    if noemer < 1e-9 { return 0.0; }
    (8.0 * m_nmm / noemer).clamp(-1.0, 1.0)
}

/// NB.NB.4.3 — C₂ geschaald naar het werkelijke aangrijpingspunt van de
/// belasting.
///
/// De norm geeft: C₂ = 0 als de belasting in het zwaartepunt van de doorsnede
/// aangrijpt; de tabelwaarde geldt als zij in het zwaartepunt van de
/// bovenflens aangrijpt; daartussen lineair interpoleren, en tot ten hoogste
/// 0,1·h daarboven lineair extrapoleren. De arm tussen beide zwaartepunten is
/// (h − t_f)/2, dus de schaalfactor is z_a / ((h − t_f)/2).
///
/// `z_a_mm` is positief boven het zwaartepunt (destabiliserend).
/// Tekenconventie: de tabelwaarde is positief. Grijpt de belasting BOVEN het
/// zwaartepunt aan (`z_a_mm` > 0), dan werkt zij destabiliserend en moet de
/// C-waarde omlaag; in de formule van [`c_coefficient`] staat C₂ in een
/// optelterm, dus levert deze functie dan een NEGATIEVE C₂. Onder het
/// zwaartepunt (z_a < 0) is de belasting stabiliserend en is C₂ positief.
///
/// **Ondergrens.** De norm geeft alleen extrapolatie naar BOVEN, en alleen tot
/// 0,1·h boven het zwaartepunt van de bovenflens (zie [`z_a_max_nb`]). Onder
/// het zwaartepunt van de onderflens geeft zij niets. Doorschalen zou daar een
/// stabiliserend effect crediteren dat de bijlage niet toekent: voor een
/// IPE 330 met z_a = −165 mm levert dat C₂ = +0,466 in plaats van de
/// tabelwaarde +0,450, en daarmee een 0,96 % te hoge M_cr — onveilig. De
/// schaalfactor wordt daarom bij −1 (het zwaartepunt van de onderflens)
/// afgekapt. Naar boven wordt niet afgekapt: dóórextrapoleren is daar de
/// veilig-zijdige richting, en de aanroeper meldt de overschrijding.
pub fn c2_gecorrigeerd(c2_tabel: f64, z_a_mm: f64, h_mm: f64, tf_mm: f64) -> f64 {
    let arm = (h_mm - tf_mm) / 2.0;
    if arm.abs() < 1e-9 { return 0.0; }
    let schaal = (z_a_mm / arm).max(-1.0);
    -c2_tabel * schaal
}

/// NB.NB.4.3(1) — het hoogste aangrijpingspunt waarvoor de bijlage nog een C₂
/// geeft: *"Indien de belasting aangrijpt tussen het zwaartepunt van de
/// bovenflens en een niveau ten hoogste 0,1·h daarboven, moet de waarde van C₂
/// door lineaire extrapolatie zijn bepaald."*
///
/// Dat is (h − t_f)/2 + 0,1·h, gemeten vanaf het zwaartepunt van de doorsnede.
pub fn z_a_max_nb(h_mm: f64, tf_mm: f64) -> f64 {
    (h_mm - tf_mm) / 2.0 + 0.1 * h_mm
}

/// NB — welvingstraagheidsmoment voor gewalste I-profielen:
/// I_w = (d')²·b³·t_f / 24, met d' = h − t_f (hart-op-hart flenzen).
pub fn i_w_nb(h_mm: f64, b_mm: f64, tf_mm: f64) -> f64 {
    let d_accent = h_mm - tf_mm;
    d_accent.powi(2) * b_mm.powi(3) * tf_mm / 24.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    // De tests `calc2_beam1_ltb_intermediates_with_table_c1`, `c1_table_endpoints`,
    // `c1_table_interpolation_midpoint` en `c1_clamp_outside_range` zijn verwijderd.
    // Ze toetsten de tabel `NB153_C1_TABLE`, die niet in de norm voorkomt: hij gaf
    // bij β = 0 een C₁ van 1,803 waar tabel NB.NB.1 (geval 1) 1,75 voorschrijft, en
    // hij was bovendien niet-monotoon (β = −0,25 gaf 1,687, β = 0 gaf 1,803). C₁ en
    // C₂ komen nu uit figuur NB.NB.5 en NB.NB.6; zie tests/nb_referentie.rs.

    /// IPE 330 uit de catalogus: h = 330, t_f = 11,5 → arm = 159,25 mm.
    const H: f64 = 330.0;
    const TF: f64 = 11.5;

    #[test]
    fn c2_volgt_de_norm_binnen_het_bereik_dat_zij_dekt() {
        // NB.NB.4.3(1): tabelwaarde mét minteken op het zwaartepunt van de
        // BOVENflens, mét plusteken op dat van de ONDERflens, lineair ertussen,
        // en nul in het zwaartepunt van de doorsnede.
        let arm = (H - TF) / 2.0;
        assert_relative_eq!(c2_gecorrigeerd(0.45, arm, H, TF), -0.45, max_relative = 1e-12);
        assert_relative_eq!(c2_gecorrigeerd(0.45, -arm, H, TF), 0.45, max_relative = 1e-12);
        assert_relative_eq!(c2_gecorrigeerd(0.45, 0.0, H, TF), 0.0, epsilon = 1e-12);
        assert_relative_eq!(
            c2_gecorrigeerd(0.45, arm / 2.0, H, TF),
            -0.225,
            max_relative = 1e-12
        );
    }

    #[test]
    fn onder_de_onderflens_wordt_c2_niet_verder_gecrediteerd() {
        // De norm geeft alleen extrapolatie naar BOVEN. Doorschalen onder het
        // zwaartepunt van de onderflens zou een stabiliserend effect
        // crediteren dat de bijlage niet toekent: bij z_a = −165 mm gaf de
        // ongeklemde schaling C₂ = +0,4662 in plaats van +0,45, en daarmee een
        // 0,96 % te hoge M_cr — onveilig.
        assert_relative_eq!(c2_gecorrigeerd(0.45, -165.0, H, TF), 0.45, max_relative = 1e-12);
        assert_relative_eq!(c2_gecorrigeerd(0.45, -1e6, H, TF), 0.45, max_relative = 1e-12);
    }

    #[test]
    fn boven_de_norm_grens_loopt_de_extrapolatie_door() {
        // z_a,max = (h − t_f)/2 + 0,1·h = 159,25 + 33 = 192,25 mm. Daarboven
        // geeft de norm niets; doorextrapoleren is de destabiliserende en dus
        // veilig-zijdige richting. De aanroeper meldt de overschrijding.
        assert_relative_eq!(z_a_max_nb(H, TF), 192.25, max_relative = 1e-12);
        let c2 = c2_gecorrigeerd(0.45, 250.0, H, TF);
        assert!(c2 < -0.45, "verder boven de bovenflens hoort C₂ verder te dalen: {c2}");
        assert_relative_eq!(c2, -0.45 * 250.0 / 159.25, max_relative = 1e-12);
    }

    #[test]
    fn b_ster_blijft_binnen_min_een_en_plus_een() {
        // De grootte van q telt, niet zijn richting — die zit al in het teken
        // van M. Een negatieve q kon de noemer door nul laten gaan en B* op
        // −1,333 brengen, waarna de tabelopzoeking betekenisloos is.
        assert_relative_eq!(b_ster(100e6, 0.0, 5000.0), 1.0, max_relative = 1e-12);
        assert_relative_eq!(b_ster(-100e6, 0.0, 5000.0), -1.0, max_relative = 1e-12);
        assert_relative_eq!(b_ster(0.0, 10.0, 5000.0), 0.0, epsilon = 1e-12);
        for q in [-10.0, -1e6] {
            let b = b_ster(-100e6, q, 5000.0);
            assert!((-1.0..=1.0).contains(&b), "B* = {b} valt buiten [−1; +1]");
        }
    }

    #[test]
    fn unp350_channel_mcr_reduced_vs_isection() {
        let (c1, _) = c1_c2_factors(0.0, 1.0);
        let c = c_coefficient(c1, 5000.0, 5000.0, 100.0, 0.0);
        let m_cr_iso = m_cr_i_section(c, 5000.0, 5703000.0, 605000.0, 1.0);
        let m_cr_chan = m_cr_channel_section(c, 5000.0, 5703000.0, 605000.0, 1.0);
        assert!(m_cr_chan < m_cr_iso, "channel Mcr should be reduced vs I-section");
        assert!((m_cr_chan / m_cr_iso - 0.7).abs() < 0.01, "channel Mcr ≈ 0.7 × isection");
    }
}
