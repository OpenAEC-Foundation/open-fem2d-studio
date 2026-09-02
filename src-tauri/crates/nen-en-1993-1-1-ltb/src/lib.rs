//! NEN-EN 1993-1-1 §6.3.2 — lateral-torsional buckling + NB-annex Mcr.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{SteelGrade, NamedValue, UnityCheck, CheckStatus};
use nen_en_1993_1_1_stability::StabilityCalc;
use section_properties::SectionProperties;

pub mod nb_annex;
pub mod lambda_chi;
pub mod en_general;

/// Kipsteunen, als fracties van de staaflengte.
///
/// `Default` is afgeleid, maar de velden hebben **geen** `#[serde(default)]`:
/// een leeg object `{}` in de JSON levert daarom een fout ("missing field")
/// in plaats van stilzwijgend "geen kipsteunen". Dat is gewild — geen
/// kipsteunen moet je opschrijven als twee lege arrays, niet per ongeluk
/// krijgen. `deny_unknown_fields` maakt bovendien een tikfout in een
/// veldnaam zichtbaar in plaats van dat hij ongemerkt wegvalt.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct LateralBracing {
    pub top_flange_positions: Vec<f64>,
    pub bottom_flange_positions: Vec<f64>,
}

/// LTB for channel sections (monosymmetric). Same flow as m_b_rd but uses
/// reduced Mcr per nb_annex::m_cr_channel_section.
pub fn m_b_rd_channel(
    p: &SectionProperties, grade: &SteelGrade,
    length_m: f64,
    bracing: &LateralBracing,
    m_y_ed_max_knm: f64,
    m_y_ed_at_lst_quarter_knm: f64,
    _m_y_ed_at_lst_half_knm: f64,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let l_st_mm = lambda_chi::unbraced_length_mm(length_m, bracing);
    let l_g_mm = l_st_mm;
    let l_kip_mm = l_st_mm;

    let beta = if m_y_ed_max_knm.abs() > 0.0 {
        m_y_ed_at_lst_quarter_knm / m_y_ed_max_knm
    } else {
        0.0
    };
    let (c1, c2) = nb_annex::c1_c2_factors(beta, 1.0); // B* = 1: alleen eindmomenten
    let s_mm = nb_annex::s_parameter(p.h_mm, 210000.0, p.iz_mm4, 80769.0, p.it_mm4);
    let c = nb_annex::c_coefficient(c1, l_g_mm, l_kip_mm, s_mm, c2);
    let k_red = nb_annex::k_red(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, l_g_mm);
    let m_cr_knm = nb_annex::m_cr_channel_section(c, l_g_mm, p.iz_mm4, p.it_mm4, k_red);

    let lambda_lt = lambda_chi::lambda_lt(p.wpl_y_mm3, grade.fy_mpa, m_cr_knm);
    let lambda_lt_0 = 0.4;
    let chi_lt = if lambda_lt < lambda_lt_0 {
        1.0
    } else {
        let alpha_lt = 0.49; // Curve c for monosymmetric (more conservative than I-section's b)
        lambda_chi::chi_lt(lambda_lt, alpha_lt)
    };

    let m_b_rd_knm = chi_lt * p.wpl_y_mm3 * grade.fy_mpa / grade.gamma_m1 * 1e-6;
    let m_y_ed_abs = force_state.forces.my_ed.abs();
    let uc = if m_b_rd_knm > 0.0 { m_y_ed_abs / m_b_rd_knm } else { 0.0 };

    StabilityCalc {
        id: "6.3.2_ltb_channel".to_string(),
        title: "Lateral-torsional buckling (channel, monosym)".to_string(),
        article: "art. 6.3.2.1 + Annex F (simplified)".to_string(),
        force_state,
        formula_latex: r"M_{b,Rd} = \chi_{LT} \cdot W_{pl,y} \cdot f_y / \gamma_{M1}".to_string(),
        variables: vec![
            NamedValue { symbol: "W_{pl,y}".to_string(), value: p.wpl_y_mm3, unit: "mm³".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M1}".to_string(), value: grade.gamma_m1, unit: "-".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: "L_{st}".to_string(), value: l_st_mm, unit: "mm".to_string() },
            NamedValue { symbol: r"\beta".to_string(), value: beta, unit: "-".to_string() },
            NamedValue { symbol: "C_1".to_string(), value: c1, unit: "-".to_string() },
            NamedValue { symbol: "S".to_string(), value: s_mm, unit: "mm".to_string() },
            NamedValue { symbol: "C".to_string(), value: c, unit: "-".to_string() },
            NamedValue { symbol: "M_{cr}".to_string(), value: m_cr_knm, unit: "kNm".to_string() },
            NamedValue { symbol: r"\bar{\lambda}_{LT}".to_string(), value: lambda_lt, unit: "-".to_string() },
            NamedValue { symbol: r"\chi_{LT}".to_string(), value: chi_lt, unit: "-".to_string() },
        ],
        value: chi_lt,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: m_y_ed_abs, rd: m_b_rd_knm, uc,
            formula_latex: r"M_{y,Ed} / M_{b,Rd}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![
            "Conservative monosymmetric reduction (Mcr × 0.7) — full Annex F not implemented v1".to_string(),
        ],
    }
}

/// Kipcontrole voor dubbelsymmetrische I-profielen volgens de Nederlandse
/// nationale bijlage (NB.NB).
///
/// `q_equiv_n_per_mm`: equivalente gelijkmatig verdeelde belasting in het
/// kipveld (N/mm), voor B* volgens NB.NB.4.3(3). 0 = alleen eindmomenten.
/// `z_a_mm`: afstand zwaartepunt → aangrijpingspunt van de belasting (mm,
/// positief = boven het zwaartepunt, destabiliserend).
pub fn m_b_rd(
    p: &SectionProperties, grade: &SteelGrade,
    length_m: f64,
    bracing: &LateralBracing,
    m_y_ed_max_knm: f64,
    m_y_ed_at_lst_quarter_knm: f64,
    _m_y_ed_at_lst_half_knm: f64,
    q_equiv_n_per_mm: f64,
    z_a_mm: f64,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    // L_st = afstand tussen zijdelingse steunen; L_g = volledige overspanning
    // tussen de gaffels; L_kip = de daaruit afgeleide vervangende kiplengte.
    let l_st_mm = lambda_chi::unbraced_length_mm(length_m, bracing);
    let l_g_mm = length_m * 1000.0;

    // β = M_y,1,Ed / M_y,2,Ed, met M_1 het kleinste en M_2 het grootste eindmoment.
    let beta = if m_y_ed_max_knm.abs() > 1e-9 {
        (m_y_ed_at_lst_quarter_knm / m_y_ed_max_knm).clamp(-1.0, 1.0)
    } else {
        0.0
    };

    let b_ster = nb_annex::b_ster(m_y_ed_max_knm * 1e6, q_equiv_n_per_mm, l_st_mm);
    let (c1, c2_tabel) = nb_annex::c1_c2_factors(beta, b_ster);
    let c2 = nb_annex::c2_gecorrigeerd(c2_tabel, z_a_mm, p.h_mm, p.tf_mm);

    let l_kip_mm = nb_annex::l_kip(beta, l_st_mm);
    let s_mm = nb_annex::s_parameter(p.h_mm, nb_annex::E_MPA, p.iz_mm4, nb_annex::G_MPA, p.it_mm4);
    let c = nb_annex::c_coefficient(c1, l_g_mm, l_kip_mm, s_mm, c2);
    let k_red = nb_annex::k_red(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, l_g_mm);
    let m_cr_knm = nb_annex::m_cr_i_section(c, l_g_mm, p.iz_mm4, p.it_mm4, k_red);

    let lambda_lt = lambda_chi::lambda_lt(p.wpl_y_mm3, grade.fy_mpa, m_cr_knm);

    let lambda_lt_0 = 0.4;
    let chi_lt = if lambda_lt < lambda_lt_0 {
        1.0
    } else {
        let alpha_lt = 0.34;
        lambda_chi::chi_lt(lambda_lt, alpha_lt)
    };

    let m_b_rd_knm = chi_lt * p.wpl_y_mm3 * grade.fy_mpa / grade.gamma_m1 * 1e-6;

    let m_y_ed_abs = force_state.forces.my_ed.abs();
    let uc = if m_b_rd_knm > 0.0 { m_y_ed_abs / m_b_rd_knm } else { 0.0 };

    StabilityCalc {
        id: "6.3.2_ltb".to_string(),
        title: "Lateral-torsional buckling resistance".to_string(),
        article: "art. 6.3.2.1 + NB.NB.2/NB.4/NB.7/NB.11/NB.13".to_string(),
        force_state,
        formula_latex: r"M_{b,Rd} = \chi_{LT} \cdot W_{pl,y} \cdot f_y / \gamma_{M1}".to_string(),
        variables: vec![
            NamedValue { symbol: "W_{pl,y}".to_string(), value: p.wpl_y_mm3, unit: "mm³".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M1}".to_string(), value: grade.gamma_m1, unit: "-".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: "L_g".to_string(), value: l_g_mm, unit: "mm".to_string() },
            NamedValue { symbol: "L_{st}".to_string(), value: l_st_mm, unit: "mm".to_string() },
            NamedValue { symbol: "L_{kip}".to_string(), value: l_kip_mm, unit: "mm".to_string() },
            NamedValue { symbol: r"\beta".to_string(), value: beta, unit: "-".to_string() },
            NamedValue { symbol: "B^*".to_string(), value: b_ster, unit: "-".to_string() },
            NamedValue { symbol: "C_1".to_string(), value: c1, unit: "-".to_string() },
            NamedValue { symbol: "C_2".to_string(), value: c2, unit: "-".to_string() },
            NamedValue { symbol: "S".to_string(), value: s_mm, unit: "mm".to_string() },
            NamedValue { symbol: "C".to_string(), value: c, unit: "-".to_string() },
            NamedValue { symbol: "k_{red}".to_string(), value: k_red, unit: "-".to_string() },
            NamedValue { symbol: "M_{cr}".to_string(), value: m_cr_knm, unit: "kNm".to_string() },
            NamedValue { symbol: r"\bar{\lambda}_{LT}".to_string(), value: lambda_lt, unit: "-".to_string() },
            NamedValue { symbol: r"\chi_{LT}".to_string(), value: chi_lt, unit: "-".to_string() },
        ],
        value: chi_lt,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: m_y_ed_abs, rd: m_b_rd_knm, uc,
            formula_latex: r"M_{y,Ed} / M_{b,Rd}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: {
            let mut n = Vec::new();
            if nb_annex::vereist_toets_gedrukte_rand(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, l_g_mm) {
                n.push(
                    "α > 5000 (NB.NB.4.2(3)): de nationale bijlage geeft hier geen \
                     reductiefactor k_red. De gedrukte rand — de flens plus 1/6 van de \
                     lijfhoogte — moet volgens 6.3.3 worden getoetst op druk en buiging \
                     uit het vlak van het lijf."
                        .to_string(),
                );
            }
            if b_ster < 0.0 {
                n.push(
                    "B* < 0: C₁ en C₂ zijn afgelezen bij |B*|. De negatieve tak van \
                     figuur NB.NB.5/NB.NB.6 is niet gedigitaliseerd; deze benadering \
                     ligt onder de werkelijke waarden en is dus veilig-zijdig, maar nog \
                     niet geverifieerd."
                        .to_string(),
                );
            }
            n
        },
    }
}
