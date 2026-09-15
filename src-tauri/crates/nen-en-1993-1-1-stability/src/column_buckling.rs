//! NEN-EN 1993-1-1 §6.3.1 — uniform members in compression.
//!
//! ## Eén toets, een volledige tak per as
//!
//! Knik om de zwakke as hoort als eigen, na te rekenen toets zichtbaar te zijn.
//! Twee inrichtingen lagen voor de hand: twee losse toetsen met elk een eigen
//! id, of één toets waarvan de afleiding per as een volledige tak draagt. Het
//! is de tweede geworden, om twee redenen:
//!
//! 1. **Het bestaande id blijft precies wat het was.** `6.3.1_buckling` heeft
//!    dezelfde waarde (de kleinste knikweerstand), dezelfde unity check en
//!    dezelfde tussenwaarden als voorheen. De referentietoetsen, de
//!    snapshots en afnemers die op dat id zoeken, blijven kloppen; een splitsing
//!    had hun "maatgevende toets" van naam laten veranderen.
//! 2. **Het rapport toont de takken naast elkaar.** Wie de afleiding opent,
//!    ziet per as L_cr met herkomst, i, λ̄, knikkromme en α, Φ, χ, N_b,Rd en de
//!    unity check; de laatste stap zet de takken tegen elkaar. Op het scherm en
//!    in de PDF staat bovendien per as een kanttekening met diezelfde getallen,
//!    ook als deze toets niet maatgevend is.
//!
//! De houttoets (`nen-en-1995-1-1::stability`) is om dezelfde redenen zo
//! ingericht: (6.23) en (6.24) zijn twee takken van één toets.
//!
//! ## Wat hier niet opnieuw wordt uitgerekend
//!
//! De afleiding schrijft op wat de kern rekent: λ̄ volgens (6.50), Φ en χ uit
//! [`crate::buckling_curve`] (dezelfde functies, geen tweede som), N_b,Rd als
//! χ·A·f_y/γ_M1. De formulebeelden van (6.46), (6.47) en (6.49) ontbreken in de
//! lokale uitdraai van de norm; tabel 6.1, tabel 6.2, (6.50) en 6.3.1.2(4) zijn
//! daar wel leesbaar. Er is hier dan ook geen formule bijgekomen — alleen
//! opgeschreven wat `chi` en deze functie al deden.

use std::f64::consts::PI;
use section_properties::SectionProperties;
use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{SteelGrade, NamedValue, UnityCheck, CheckStatus, Deelstap};
use crate::buckling_curve::{BucklingCurve, chi, phi};
use crate::kniklengte::{kniklengte_deelstap, vlak_label, Kniklengte};
use crate::opmaak::{lx, nl, nv, stap};
use crate::StabilityCalc;

const E_MPA: f64 = 210000.0;

/// De vindplaats die zegt wanneer een staaftoets na een tweede-orde-berekening
/// van het raamwerk nog nodig is.
const NORM_IN_VLAK: &str = "NEN-EN 1993-1-1 5.2.2(7)";

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
    /// Traagheidsmoment (mm⁴) om de eerste as — alleen voor de afleiding,
    /// `i = √(I/A)`.
    pub traagheid_1_mm4: f64,
    /// Traagheidsmoment (mm⁴) om de tweede as.
    pub traagheid_2_mm4: f64,
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
            traagheid_1_mm4: p.iy_mm4,
            traagheid_2_mm4: p.iz_mm4,
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
            traagheid_1_mm4: p.iu_mm4,
            traagheid_2_mm4: p.iv_mm4,
            naam_1: "u",
            naam_2: "v",
        }
    }
}

/// Eén as waarom geknikt kan worden, met alles wat de tak van de afleiding
/// nodig heeft.
///
/// De functie [`n_b_rd`] neemt een LIJST hiervan: het aantal assen ligt niet in
/// het type vast. Het vlakke model levert er twee; wat "in het vlak" is, draagt
/// elke as zelf in [`Kniklengte::in_rekenvlak`].
#[derive(Clone, Debug)]
pub struct Knikas {
    pub kniklengte: Kniklengte,
    /// Traagheidsstraal om deze as (mm), zoals hij in λ̄ gaat.
    pub i_mm: f64,
    /// Traagheidsmoment om deze as (mm⁴), alleen voor de afleiding van i.
    pub traagheid_mm4: f64,
    pub kromme: BucklingCurve,
    /// Waarom deze kromme: de rij van tabel 6.2 die geldt.
    pub kromme_toelichting: String,
}

/// De uitkomst van één tak.
#[derive(Clone, Debug)]
pub struct Asuitkomst {
    pub as_naam: String,
    pub l_cr_mm: f64,
    /// L_cr / i
    pub lambda: f64,
    pub lambda_bar: f64,
    pub alpha: f64,
    pub phi: f64,
    pub chi: f64,
    pub n_b_rd_kn: f64,
    pub uc: f64,
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
    /// Eén uitkomst per as, in de volgorde van de invoer.
    pub per_as: Vec<Asuitkomst>,
}

pub fn n_b_rd(
    p: &SectionProperties,
    grade: &SteelGrade,
    assen: &[Knikas],
    force_state: ForceStateSnapshot,
) -> Knikuitkomst {
    let lambda_1 = PI * (E_MPA / grade.fy_mpa).sqrt();
    let n_pl_rd = p.area_mm2 * grade.fy_mpa * 1e-3;
    let n_ed = force_state.forces.n_ed.abs();

    let per_as: Vec<Asuitkomst> = assen
        .iter()
        .map(|a| {
            let lambda = a.kniklengte.l_cr_mm / a.i_mm;
            let lambda_bar = lambda / lambda_1;
            let alpha = a.kromme.alpha();
            let chi_a = chi(lambda_bar, alpha);
            let n_b = chi_a * n_pl_rd / grade.gamma_m1;
            Asuitkomst {
                as_naam: a.kniklengte.as_naam.clone(),
                l_cr_mm: a.kniklengte.l_cr_mm,
                lambda,
                lambda_bar,
                alpha,
                phi: phi(lambda_bar, alpha),
                chi: chi_a,
                n_b_rd_kn: n_b,
                uc: if n_b > 0.0 { n_ed / n_b } else { 0.0 },
            }
        })
        .collect();

    // De kleinste knikweerstand; bij gelijke waarden de eerste as, zoals
    // voorheen (`n_b_y <= n_b_z`).
    let maatgevend = per_as
        .iter()
        .enumerate()
        .fold(None::<usize>, |best, (i, u)| match best {
            Some(b) if !(u.n_b_rd_kn < per_as[b].n_b_rd_kn) => Some(b),
            _ => Some(i),
        });
    let (n_b_rd_kn, chi_used) = maatgevend
        .map(|m| (per_as[m].n_b_rd_kn, per_as[m].chi))
        .unwrap_or((0.0, 1.0));
    let uc = if n_b_rd_kn > 0.0 { n_ed / n_b_rd_kn } else { 0.0 };
    let status = if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };

    // De asnaam staat in élk symbool: bij een hoekprofiel heet de sterke as
    // u en de zwakke v, en dan hoort er in het rapport ook λ_u en χ_v te
    // staan — niet λ_y en χ_z met stilzwijgend andere getallen erin.
    let mut variables = vec![
        NamedValue { symbol: "A".to_string(), value: p.area_mm2, unit: "mm²".to_string() },
        NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
        NamedValue { symbol: r"\gamma_{M1}".to_string(), value: grade.gamma_m1, unit: "-".to_string() },
    ];
    for a in assen {
        variables.push(nv(&format!("i_{}", a.kniklengte.as_naam), a.i_mm, "mm"));
    }
    // De gebruikte kniklengten staan bij de grootheden, zodat zij óók in een
    // weergave zonder afleiding (de PDF bij een niet-maatgevende toets) te
    // lezen zijn. De herkomst staat in de kanttekeningen.
    for a in assen {
        variables.push(nv(&a.kniklengte.symbool(), a.kniklengte.l_cr_mm, "mm"));
    }

    let mut intermediate_values = Vec::new();
    for u in &per_as {
        intermediate_values.push(nv(&format!(r"\lambda_{}", u.as_naam), u.lambda, "-"));
    }
    for u in &per_as {
        intermediate_values.push(nv(&format!(r"\bar{{\lambda}}_{}", u.as_naam), u.lambda_bar, "-"));
    }
    for u in &per_as {
        intermediate_values.push(nv(&format!(r"\chi_{}", u.as_naam), u.chi, "-"));
    }
    intermediate_values.push(nv(r"\chi", chi_used, "-"));
    for u in &per_as {
        intermediate_values.push(nv(&format!("N_{{b,Rd,{}}}", u.as_naam), u.n_b_rd_kn, "kN"));
    }

    let deelstappen = knik_deelstappen(p, grade, assen, &per_as, maatgevend, lambda_1, n_ed, &force_state);

    let mut notes: Vec<String> = assen
        .iter()
        .zip(&per_as)
        .map(|(a, u)| {
            format!(
                "Om de {n}-as ({vlak}): {lcr}, λ̄_{n} = {lb}, knikkromme {k} (α = {al}), χ_{n} = {chi}, \
                 N_b,Rd,{n} = {nb} kN, UC = {uc}.",
                n = u.as_naam,
                vlak = vlak_label(&a.kniklengte),
                lcr = a.kniklengte.samenvatting(),
                lb = nl(u.lambda_bar, 3),
                k = a.kromme.letter(),
                al = nl(u.alpha, 2),
                chi = nl(u.chi, 4),
                nb = nl(u.n_b_rd_kn, 1),
                uc = nl(u.uc, 3),
            )
        })
        .collect();
    if let Some(m) = maatgevend {
        notes.push(format!(
            "Maatgevend is knik om de {}-as ({}): N_b,Rd = {} kN.",
            per_as[m].as_naam,
            vlak_label(&assen[m].kniklengte),
            nl(n_b_rd_kn, 1)
        ));
    }
    if let Some(uit) = assen.iter().find(|a| !a.kniklengte.in_rekenvlak) {
        notes.push(format!(
            "Knik om de {}-as ziet de raamwerkberekening nooit, ook niet in een tweede-orde-berekening: \
             de toets met χ is daarvoor altijd nodig.",
            uit.kniklengte.as_naam
        ));
    }

    let calc = StabilityCalc {
        id: "6.3.1_buckling".to_string(),
        title: format!(
            "Kolomknik — {}",
            assen
                .iter()
                .map(|a| format!("om {} ({})", a.kniklengte.as_naam, vlak_label(&a.kniklengte)))
                .collect::<Vec<_>>()
                .join(" en ")
        ),
        article: "art. 6.3.1 (6.46)".to_string(),
        force_state,
        formula_latex: r"N_{b,Rd} = \chi \cdot A \cdot f_y / \gamma_{M1}".to_string(),
        variables,
        intermediate_values,
        deelstappen,
        value: n_b_rd_kn,
        unit: "kN".to_string(),
        uc: Some(UnityCheck { ed: n_ed, rd: n_b_rd_kn, uc, formula_latex: r"N_{Ed} / N_{b,Rd}".to_string() }),
        status,
        notes,
    };

    Knikuitkomst { calc, per_as }
}

/// De afleiding: gemeenschappelijke uitgangspunten, per as een volledige tak,
/// en tot slot de keuze van de maatgevende tak.
#[allow(clippy::too_many_arguments)]
fn knik_deelstappen(
    p: &SectionProperties,
    grade: &SteelGrade,
    assen: &[Knikas],
    per_as: &[Asuitkomst],
    maatgevend: Option<usize>,
    lambda_1: f64,
    n_ed: f64,
    force_state: &ForceStateSnapshot,
) -> Vec<Deelstap> {
    let mut uit = Vec::with_capacity(2 + 8 * assen.len() + 1);

    uit.push(stap(
        "uitgangspunten",
        "Uitgangspunten van de knikcontrole",
        "",
        "art. 6.3.1.1",
        String::new(),
        String::new(),
        vec![
            nv("N_{Ed}", n_ed, "kN"),
            nv("A", p.area_mm2, "mm²"),
            nv("f_y", grade.fy_mpa, "MPa"),
            nv("E", E_MPA, "MPa"),
            nv(r"\gamma_{M1}", grade.gamma_m1, "-"),
        ],
        None,
        "",
        vec![
            format!(
                "N_Ed is de grootste drukkracht uit de omhullende (combinatie {}, x = {} mm). De \
                 toets rekent met die kracht over de hele staaf.",
                force_state.combination_id,
                nl(force_state.position_mm, 0)
            ),
            "(6.47) geldt voor doorsneden van klasse 1, 2 en 3. Een doorsnede van klasse 4 wordt \
             eerder in de toetsing geweigerd, dus (6.48) komt hier niet voor."
                .to_string(),
            "Elke as krijgt hieronder een eigen, volledige tak: kniklengte met herkomst, \
             traagheidsstraal, relatieve slankheid, knikkromme, reductiefactor, knikweerstand en \
             unity check. De knikweerstand van de staaf is de kleinste van de takken."
                .to_string(),
        ],
    ));

    uit.push(stap(
        "lambda_1",
        "Referentieslankheid",
        r"\lambda_1",
        "art. 6.3.1.3(1)",
        r"\lambda_1 = \pi \sqrt{\frac{E}{f_y}}".to_string(),
        format!(r"\lambda_1 = \pi \sqrt{{\frac{{{}}}{{{}}}}}", lx(E_MPA, 0), lx(grade.fy_mpa, 0)),
        vec![nv("E", E_MPA, "MPa"), nv("f_y", grade.fy_mpa, "MPa")],
        Some(lambda_1),
        "-",
        vec![format!(
            "Gelijk aan 93,9·ε met ε = √(235/f_y) = {}.",
            nl((235.0 / grade.fy_mpa).sqrt(), 3)
        )],
    ));

    for (a, u) in assen.iter().zip(per_as) {
        let n = u.as_naam.as_str();
        let k = &a.kniklengte;
        let lcr = k.symbool();

        // Kniklengte — met herkomst en met wat het model voor deze richting
        // wel en niet ziet.
        uit.push(kniklengte_deelstap(k, "art. 6.3.1.3(1)", NORM_IN_VLAK));

        let i_ingevuld = if a.traagheid_mm4 > 0.0 && p.area_mm2 > 0.0 {
            format!(
                r"i_{{{n}}} = \sqrt{{\frac{{{}}}{{{}}}}}",
                lx(a.traagheid_mm4, 0),
                lx(p.area_mm2, 1)
            )
        } else {
            String::new()
        };
        uit.push(stap(
            &format!("i_{n}"),
            &format!("Traagheidsstraal om de {n}-as"),
            &format!("i_{{{n}}}"),
            "art. 6.3.1.3(1)",
            format!(r"i_{{{n}}} = \sqrt{{\frac{{I_{{{n}}}}}{{A}}}}"),
            i_ingevuld,
            vec![nv(&format!("I_{{{n}}}"), a.traagheid_mm4, "mm⁴"), nv("A", p.area_mm2, "mm²")],
            Some(a.i_mm),
            "mm",
            vec!["Bepaald uitgaande van de brutodoorsnede, zoals 6.3.1.3(1) voorschrijft.".to_string()],
        ));

        let mut notes_lb = vec![format!(
            "De slankheid zelf is λ_{n} = L_cr,{n}/i_{n} = {}.",
            nl(u.lambda, 2)
        )];
        if u.lambda_bar <= 0.2 {
            notes_lb.push(format!(
                "λ̄_{n} = {} ≤ 0,2: volgens 6.3.1.2(4) mogen de knikeffecten om deze as worden \
                 verwaarloosd. De begrenzing χ ≤ 1,0 levert hieronder dan ook 1,0.",
                nl(u.lambda_bar, 3)
            ));
        }
        uit.push(stap(
            &format!("lambda_bar_{n}"),
            &format!("Relatieve slankheid om de {n}-as"),
            &format!(r"\bar{{\lambda}}_{{{n}}}"),
            "art. 6.3.1.3(1) (6.50)",
            format!(r"\bar{{\lambda}}_{{{n}}} = \frac{{{lcr}}}{{i_{{{n}}}}} \cdot \frac{{1}}{{\lambda_1}}"),
            format!(
                r"\bar{{\lambda}}_{{{n}}} = \frac{{{}}}{{{}}} \cdot \frac{{1}}{{{}}}",
                lx(u.l_cr_mm, 0),
                lx(a.i_mm, 2),
                lx(lambda_1, 3)
            ),
            vec![nv(&lcr, u.l_cr_mm, "mm"), nv(&format!("i_{{{n}}}"), a.i_mm, "mm"), nv(r"\lambda_1", lambda_1, "-")],
            Some(u.lambda_bar),
            "-",
            notes_lb,
        ));

        uit.push(stap(
            &format!("kromme_{n}"),
            &format!("Knikkromme en imperfectiefactor om de {n}-as"),
            &format!(r"\alpha_{{{n}}}"),
            "tabel 6.2 en tabel 6.1",
            format!(r"\text{{knikkromme {}}} \;\Rightarrow\; \alpha_{{{n}}}", a.kromme.letter()),
            String::new(),
            vec![nv(&format!(r"\alpha_{{{n}}}"), u.alpha, "-")],
            Some(u.alpha),
            "-",
            vec![
                a.kromme_toelichting.clone(),
                "Tabel 6.1: knikkromme a0 / a / b / c / d → imperfectiefactor α = 0,13 / 0,21 / \
                 0,34 / 0,49 / 0,76."
                    .to_string(),
            ],
        ));

        uit.push(stap(
            &format!("phi_{n}"),
            &format!("Hulpgrootheid Φ om de {n}-as"),
            &format!(r"\Phi_{{{n}}}"),
            "art. 6.3.1.2(1) (6.49)",
            format!(
                r"\Phi_{{{n}}} = 0{{,}}5 \left[ 1 + \alpha_{{{n}}} \left( \bar{{\lambda}}_{{{n}}} - 0{{,}}2 \right) + \bar{{\lambda}}_{{{n}}}^2 \right]"
            ),
            format!(
                r"\Phi_{{{n}}} = 0{{,}}5 \left[ 1 + {} \left( {} - 0{{,}}2 \right) + {}^2 \right]",
                lx(u.alpha, 2),
                lx(u.lambda_bar, 4),
                lx(u.lambda_bar, 4)
            ),
            vec![nv(&format!(r"\alpha_{{{n}}}"), u.alpha, "-"), nv(&format!(r"\bar{{\lambda}}_{{{n}}}"), u.lambda_bar, "-")],
            Some(u.phi),
            "-",
            Vec::new(),
        ));

        let chi_ruw = {
            let d = u.phi + (u.phi.powi(2) - u.lambda_bar.powi(2)).sqrt();
            if d > 0.0 { 1.0 / d } else { f64::INFINITY }
        };
        let mut notes_chi = Vec::new();
        if chi_ruw > 1.0 {
            notes_chi.push(format!(
                "De breuk geeft {}; de begrenzing χ ≤ 1,0 is bindend.",
                nl(chi_ruw, 4)
            ));
        }
        uit.push(stap(
            &format!("chi_{n}"),
            &format!("Reductiefactor om de {n}-as"),
            &format!(r"\chi_{{{n}}}"),
            "art. 6.3.1.2(1) (6.49)",
            format!(
                r"\chi_{{{n}}} = \frac{{1}}{{\Phi_{{{n}}} + \sqrt{{\Phi_{{{n}}}^2 - \bar{{\lambda}}_{{{n}}}^2}}}} \le 1{{,}}0"
            ),
            format!(
                r"\chi_{{{n}}} = \frac{{1}}{{{} + \sqrt{{{}^2 - {}^2}}}}",
                lx(u.phi, 4),
                lx(u.phi, 4),
                lx(u.lambda_bar, 4)
            ),
            vec![nv(&format!(r"\Phi_{{{n}}}"), u.phi, "-"), nv(&format!(r"\bar{{\lambda}}_{{{n}}}"), u.lambda_bar, "-")],
            Some(u.chi),
            "-",
            notes_chi,
        ));

        uit.push(stap(
            &format!("n_b_rd_{n}"),
            &format!("Knikweerstand om de {n}-as"),
            &format!("N_{{b,Rd,{n}}}"),
            "art. 6.3.1.1(3) (6.47)",
            format!(r"N_{{b,Rd,{n}}} = \frac{{\chi_{{{n}}} \cdot A \cdot f_y}}{{\gamma_{{M1}}}} \cdot 10^{{-3}}"),
            format!(
                r"N_{{b,Rd,{n}}} = \frac{{{} \cdot {} \cdot {}}}{{{}}} \cdot 10^{{-3}}",
                lx(u.chi, 4),
                lx(p.area_mm2, 1),
                lx(grade.fy_mpa, 0),
                lx(grade.gamma_m1, 2)
            ),
            vec![
                nv(&format!(r"\chi_{{{n}}}"), u.chi, "-"),
                nv("A", p.area_mm2, "mm²"),
                nv("f_y", grade.fy_mpa, "MPa"),
                nv(r"\gamma_{M1}", grade.gamma_m1, "-"),
            ],
            Some(u.n_b_rd_kn),
            "kN",
            vec!["De factor 10⁻³ zet N om in kN.".to_string()],
        ));

        uit.push(stap(
            &format!("uc_{n}"),
            &format!("Unity check om de {n}-as"),
            &format!("UC_{{{n}}}"),
            "art. 6.3.1.1(1) (6.46)",
            format!(r"UC_{{{n}}} = \frac{{N_{{Ed}}}}{{N_{{b,Rd,{n}}}}} \le 1{{,}}0"),
            format!(r"UC_{{{n}}} = \frac{{{}}}{{{}}}", lx(n_ed, 2), lx(u.n_b_rd_kn, 2)),
            vec![nv("N_{Ed}", n_ed, "kN"), nv(&format!("N_{{b,Rd,{n}}}"), u.n_b_rd_kn, "kN")],
            Some(u.uc),
            "-",
            vec![if u.uc <= 1.0 {
                format!("Om de {n}-as voldoet de staaf.")
            } else {
                format!("Om de {n}-as voldoet de staaf NIET.")
            }],
        ));
    }

    if let Some(m) = maatgevend {
        let namen: Vec<String> = per_as.iter().map(|u| format!("N_{{b,Rd,{}}}", u.as_naam)).collect();
        let waarden: Vec<String> = per_as.iter().map(|u| lx(u.n_b_rd_kn, 2)).collect();
        uit.push(stap(
            "maatgevend",
            "Knikweerstand van de staaf — de kleinste van de takken",
            "N_{b,Rd}",
            "art. 6.3.1.1(1)",
            format!(r"N_{{b,Rd}} = \min\left( {} \right)", namen.join(r" \,;\, ")),
            format!(r"N_{{b,Rd}} = \min\left( {} \right)", waarden.join(r" \,;\, ")),
            per_as.iter().map(|u| nv(&format!("N_{{b,Rd,{}}}", u.as_naam), u.n_b_rd_kn, "kN")).collect(),
            Some(per_as[m].n_b_rd_kn),
            "kN",
            vec![format!(
                "Maatgevend is knik om de {}-as ({}).",
                per_as[m].as_naam,
                vlak_label(&assen[m].kniklengte)
            )],
        ));
    }
    uit
}
