//! NEN-EN 1993-1-1 §6.3.1 — uniform members in compression.

use std::f64::consts::PI;
use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{SteelGrade, NamedValue, UnityCheck, CheckStatus};
use crate::buckling_curve::{BucklingCurve, chi};
use crate::StabilityCalc;

const E_MPA: f64 = 210000.0;

/// Om welke twee assen §6.3.1 knik toetst, en met welke traagheidsstralen.
///
/// Voor bijna elke doorsnede zijn dat de eigen assen y-y en z-z, en dan is
/// deze keuze onzichtbaar. Voor een **hoekprofiel** niet. NEN-EN 1993-1-1 par.
/// 1.7(2) legt bij hoekprofielen de y-as evenwijdig aan het kleinste been, en
/// de OPMERKING erbij zegt dat alle regels in de Eurocode betrekking hebben op
/// de eigenschappen van de HOOFDassen — die voor hoekprofielen `u-u` en `v-v`
/// heten. De slankheid `λ = L_cr / i` (6.50) hoort dus met `i_u` en `i_v`
/// bepaald te worden en niet met `i_y` en `i_z`.
///
/// Dat is bovendien de veilige kant: bij een hoeklijn is `i_v < i_z`, dus de
/// zwakke hoofdas geeft een lagere knikweerstand dan de z-as zou geven.
#[derive(Clone, Copy, Debug)]
pub struct Knikassen {
    /// Traagheidsstraal (mm) die bij de **eerste** kniklengte hoort.
    pub i_1_mm: f64,
    /// Traagheidsstraal (mm) die bij de **tweede** kniklengte hoort.
    pub i_2_mm: f64,
    /// Naam van de eerste as in het rapport: `"y"` of `"u"`.
    pub naam_1: &'static str,
    /// Naam van de tweede as in het rapport: `"z"` of `"v"`.
    pub naam_2: &'static str,
}

impl Knikassen {
    /// De gewone keuze: de eigen assen y-y en z-z van de doorsnede.
    pub fn eigen_assen(p: &SectionProperties) -> Self {
        Self {
            i_1_mm: p.iy_radius_mm,
            i_2_mm: p.iz_radius_mm,
            naam_1: "y",
            naam_2: "z",
        }
    }

    /// De hoofdassen u-u en v-v, met `i = √(I/A)` uit `iu_mm4` en `iv_mm4`.
    /// Voor een doorsnede zonder oppervlak valt hij terug op de eigen assen,
    /// zodat er nooit door nul wordt gedeeld.
    pub fn hoofdassen(p: &SectionProperties) -> Self {
        if !(p.area_mm2 > 0.0) || !(p.iu_mm4 > 0.0) || !(p.iv_mm4 > 0.0) {
            return Self::eigen_assen(p);
        }
        Self {
            i_1_mm: (p.iu_mm4 / p.area_mm2).sqrt(),
            i_2_mm: (p.iv_mm4 / p.area_mm2).sqrt(),
            naam_1: "u",
            naam_2: "v",
        }
    }
}

/// De uitkomst van §6.3.1: de toets zelf plus de getallen die §6.3.3 eruit
/// nodig heeft.
///
/// Die getallen komen hier als velden mee en niet als op te zoeken symbolen in
/// `intermediate_values`. Dat scheelt een stilzwijgende afspraak: zodra de
/// asnamen veranderen (`\chi_y` wordt `\chi_u` bij een hoekprofiel) zou een
/// zoekopdracht op de symboolnaam niets meer vinden en ongemerkt op de
/// standaardwaarde 1,0 terugvallen — een knikreductie die er niet is.
pub struct Knikuitkomst {
    pub calc: StabilityCalc,
    /// Reductiefactor om de eerste as (y-y, of u-u bij een hoekprofiel).
    pub chi_1: f64,
    /// Reductiefactor om de tweede as (z-z, of v-v).
    pub chi_2: f64,
    /// Relatieve slankheid om de eerste as.
    pub lambda_bar_1: f64,
    /// Relatieve slankheid om de tweede as.
    pub lambda_bar_2: f64,
}

#[allow(clippy::too_many_arguments)]
pub fn n_b_rd(
    p: &SectionProperties, grade: &SteelGrade,
    length_y_m: f64, length_z_m: f64,
    assen: Knikassen,
    curve_y: BucklingCurve, curve_z: BucklingCurve,
    force_state: ForceStateSnapshot,
) -> Knikuitkomst {
    let lambda_y = (length_y_m * 1000.0) / assen.i_1_mm;
    let lambda_z = (length_z_m * 1000.0) / assen.i_2_mm;

    let lambda_1 = PI * (E_MPA / grade.fy_mpa).sqrt();
    let lambda_bar_y = lambda_y / lambda_1;
    let lambda_bar_z = lambda_z / lambda_1;

    let chi_y = chi(lambda_bar_y, curve_y.alpha());
    let chi_z = chi(lambda_bar_z, curve_z.alpha());

    let n_pl_rd = p.area_mm2 * grade.fy_mpa * 1e-3;
    let n_b_y = chi_y * n_pl_rd / grade.gamma_m1;
    let n_b_z = chi_z * n_pl_rd / grade.gamma_m1;
    let (n_b_rd_kn, governing_axis, chi_used) = if n_b_y <= n_b_z {
        (n_b_y, assen.naam_1, chi_y)
    } else {
        (n_b_z, assen.naam_2, chi_z)
    };

    let n_ed = force_state.forces.n_ed.abs();
    let uc = if n_b_rd_kn > 0.0 { n_ed / n_b_rd_kn } else { 0.0 };

    // De asnaam staat in élk symbool: bij een hoekprofiel heet de sterke as
    // u en de zwakke v, en dan hoort er in het rapport ook λ_u en χ_v te
    // staan — niet λ_y en χ_z met stilzwijgend andere getallen erin.
    let (a1, a2) = (assen.naam_1, assen.naam_2);
    let calc = StabilityCalc {
        id: "6.3.1_buckling".to_string(),
        title: "Kolomknik".to_string(),
        article: "art. 6.3.1 (6.46)".to_string(),
        force_state,
        formula_latex: r"N_{b,Rd} = \chi \cdot A \cdot f_y / \gamma_{M1}".to_string(),
        variables: vec![
            NamedValue { symbol: "A".to_string(), value: p.area_mm2, unit: "mm²".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M1}".to_string(), value: grade.gamma_m1, unit: "-".to_string() },
            NamedValue { symbol: format!("i_{a1}"), value: assen.i_1_mm, unit: "mm".to_string() },
            NamedValue { symbol: format!("i_{a2}"), value: assen.i_2_mm, unit: "mm".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: format!(r"\lambda_{a1}"), value: lambda_y, unit: "-".to_string() },
            NamedValue { symbol: format!(r"\lambda_{a2}"), value: lambda_z, unit: "-".to_string() },
            NamedValue { symbol: format!(r"\bar{{\lambda}}_{a1}"), value: lambda_bar_y, unit: "-".to_string() },
            NamedValue { symbol: format!(r"\bar{{\lambda}}_{a2}"), value: lambda_bar_z, unit: "-".to_string() },
            NamedValue { symbol: format!(r"\chi_{a1}"), value: chi_y, unit: "-".to_string() },
            NamedValue { symbol: format!(r"\chi_{a2}"), value: chi_z, unit: "-".to_string() },
            NamedValue { symbol: r"\chi".to_string(), value: chi_used, unit: "-".to_string() },
        ],
        // Kolomknik heeft (nog) geen uitgeschreven afleiding; de tussenwaarden
        // blijven hier de weergave.
        deelstappen: vec![],
        value: n_b_rd_kn,
        unit: "kN".to_string(),
        uc: Some(UnityCheck { ed: n_ed, rd: n_b_rd_kn, uc, formula_latex: r"N_{Ed} / N_{b,Rd}".to_string() }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![format!("Governing axis: {governing_axis}")],
    };

    Knikuitkomst {
        calc,
        chi_1: chi_y,
        chi_2: chi_z,
        lambda_bar_1: lambda_bar_y,
        lambda_bar_2: lambda_bar_z,
    }
}
