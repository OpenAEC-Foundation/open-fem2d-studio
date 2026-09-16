//! §6.3.2 kolomknik en §6.3.3 kipstabiliteit.
//!
//! Verificatie: alle tussenwaarden en unity checks zijn getoetst aan de
//! uitgewerkte berekening van de referentie-uitwerking (staaf 2, C24 96x450):
//! lambda_y = 48,82 → lambda_rel,y = 0,828; lambda_z = 45,77 →
//! lambda_rel,z = 0,776; k_y = 0,90; k_c,y = 0,81; k_z = 0,85; k_c,z = 0,84;
//! (6.23) = 1,64; (6.24) = 1,18; sigma_m,crit = 93,2 N/mm2;
//! lambda_rel,m = 0,507 → k_crit = 1,00; (6.35) = 2,40.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, UnityCheck};
use nen_en_1993_1_1_stability::StabilityCalc;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use nen_en_1993_1_1_stability::kniklengte::{kniklengte_deelstap, vlak_label, Kniklengte};
use nen_en_1993_1_1_stability::opmaak::{lx, nl, nv, stap};
use nen_en_1993_1_1_stability::Deelstap;

use crate::bending::sigma_m_mpa;
use crate::compression::sigma_axial_mpa;
use crate::section::TimberSection;

// ---------------------------------------------------------------------------
// §6.3.2 — kolomknik
// ---------------------------------------------------------------------------

/// Slankheid lambda = L_cr / i.
pub fn slenderness(l_cr_mm: f64, radius_mm: f64) -> f64 {
    if radius_mm <= 0.0 {
        return 0.0;
    }
    l_cr_mm / radius_mm
}

/// Relatieve slankheid, vergelijkingen (6.21)/(6.22):
/// lambda_rel = (lambda / pi) · sqrt(f_c,0,k / E_0,05).
pub fn lambda_rel(lambda: f64, f_c0k: f64, e0_05: f64) -> f64 {
    if e0_05 <= 0.0 {
        return 0.0;
    }
    lambda / std::f64::consts::PI * (f_c0k / e0_05).sqrt()
}

/// Instabiliteitsfactor k, vergelijkingen (6.27)/(6.28):
/// k = 0,5·(1 + beta_c·(lambda_rel − 0,3) + lambda_rel²).
pub fn k_factor(lambda_rel: f64, beta_c: f64) -> f64 {
    0.5 * (1.0 + beta_c * (lambda_rel - 0.3) + lambda_rel * lambda_rel)
}

/// Knikfactor k_c, vergelijkingen (6.25)/(6.26):
/// k_c = 1 / (k + sqrt(k² − lambda_rel²)), afgekapt op 1,0.
pub fn k_c(k: f64, lambda_rel: f64) -> f64 {
    let discr = k * k - lambda_rel * lambda_rel;
    let kc = 1.0 / (k + discr.max(0.0).sqrt());
    kc.min(1.0)
}

/// Invoer voor de kolomkniktoets §6.3.2.
///
/// De kniklengten komen als [`Kniklengte`] binnen en niet als kale getallen:
/// de toets moet in zijn afleiding kunnen zeggen waar L_cr vandaan komt
/// (opgegeven, uit de zijdelingse steunen, of de staaflengte als terugval) en
/// of de raamwerkberekening die knikrichting ziet. Om de z-as ziet zij hem in
/// het vlakke model nooit.
#[derive(Clone, Debug)]
pub struct ColumnStabilityInput {
    /// Kniklengte om de y-as (doorbuiging in de z-richting, art. 6.3.2(1)).
    pub kniklengte_y: Kniklengte,
    /// Kniklengte om de z-as (doorbuiging in de y-richting, art. 6.3.2(1)).
    pub kniklengte_z: Kniklengte,
    pub f_c0k_mpa: f64,
    pub e0_05_mpa: f64,
    pub beta_c: f64,
    pub f_c0d_mpa: f64,
    pub f_myd_mpa: f64,
    pub f_mzd_mpa: f64,
    pub k_m: f64,
}

/// §6.3.2: druk of gecombineerde druk en buiging met kniktoeslag.
///
/// Wanneer lambda_rel,y én lambda_rel,z <= 0,3 geldt §6.3.2(2) en worden
/// (6.19)/(6.20) gebruikt (kwadratische drukterm, geen k_c); anders
/// (6.23)/(6.24). UC = maximum van beide vergelijkingen.
///
/// EEN TOETS, TWEE TAKKEN. (6.23) hoort bij knik om de y-as (k_c,y) en (6.24)
/// bij knik om de z-as (k_c,z). De afleiding schrijft ze als twee volledige
/// takken uit — L_cr met herkomst, i, λ, λ_rel, k, k_c en de vergelijking — en
/// zet ze aan het eind tegen elkaar. Het id `6.3.2_column_stability` blijft
/// daarmee de toets die het altijd was; zie `column_buckling` in
/// `nen-en-1993-1-1-stability` voor dezelfde afweging bij staal.
///
/// De formulebeelden van (6.25), (6.28) en (6.29) ontbreken in de lokale
/// uitdraai van de norm; (6.21)–(6.24), (6.26) en (6.27) zijn leesbaar. De
/// afleiding schrijft op wat `k_factor` en `k_c` rekenen en voegt geen formule
/// toe.
pub fn check_column_stability(
    section: &TimberSection,
    input: &ColumnStabilityInput,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let n_ed = force_state.forces.n_ed;
    let sigma_c = sigma_axial_mpa(n_ed, section.a_mm2);
    let sigma_my = sigma_m_mpa(force_state.forces.my_ed, section.w_y_mm3);
    let sigma_mz = sigma_m_mpa(force_state.forces.mz_ed, section.w_z_mm3);
    let l_cr_y_mm = input.kniklengte_y.l_cr_mm;
    let l_cr_z_mm = input.kniklengte_z.l_cr_mm;

    let lambda_y = slenderness(l_cr_y_mm, section.radius_y_mm);
    let lambda_z = slenderness(l_cr_z_mm, section.radius_z_mm);
    let lambda_rel_y = lambda_rel(lambda_y, input.f_c0k_mpa, input.e0_05_mpa);
    let lambda_rel_z = lambda_rel(lambda_z, input.f_c0k_mpa, input.e0_05_mpa);
    let k_y = k_factor(lambda_rel_y, input.beta_c);
    let k_z = k_factor(lambda_rel_z, input.beta_c);
    let k_c_y = k_c(k_y, lambda_rel_y);
    let k_c_z = k_c(k_z, lambda_rel_z);

    let term_c_y = sigma_c / (k_c_y * input.f_c0d_mpa);
    let term_c_z = sigma_c / (k_c_z * input.f_c0d_mpa);
    let term_my = if input.f_myd_mpa > 0.0 { sigma_my / input.f_myd_mpa } else { 0.0 };
    let term_mz = if input.f_mzd_mpa > 0.0 { sigma_mz / input.f_mzd_mpa } else { 0.0 };

    let low_slenderness = lambda_rel_y <= 0.3 && lambda_rel_z <= 0.3;
    let ratio_c = sigma_c / input.f_c0d_mpa;
    let (eq_a, eq_b, formula, article) = if low_slenderness {
        // §6.3.2(2) → (6.19)/(6.20): kwadratische drukterm zonder k_c.
        (
            ratio_c * ratio_c + term_my + input.k_m * term_mz,
            ratio_c * ratio_c + input.k_m * term_my + term_mz,
            r"\left(\frac{\sigma_{c,0,d}}{f_{c,0,d}}\right)^2 + \frac{\sigma_{m,y,d}}{f_{m,y,d}} + k_m\frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string(),
            "art. 6.3.2 (6.19)(6.20)".to_string(),
        )
    } else {
        (
            term_c_y + term_my + input.k_m * term_mz,
            term_c_z + input.k_m * term_my + term_mz,
            r"\frac{\sigma_{c,0,d}}{k_{c,y} f_{c,0,d}} + \frac{\sigma_{m,y,d}}{f_{m,y,d}} + k_m\frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string(),
            "art. 6.3.2 (6.23)(6.24)".to_string(),
        )
    };
    let uc = eq_a.max(eq_b);

    let status = if n_ed >= 0.0 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    let takken = [
        Tak {
            k: &input.kniklengte_y,
            radius_mm: section.radius_y_mm,
            traagheid_mm4: section.i_y_mm4,
            lambda: lambda_y,
            lambda_rel: lambda_rel_y,
            k_fac: k_y,
            k_c: k_c_y,
            vergelijking: eq_a,
            drukterm: if low_slenderness { ratio_c * ratio_c } else { term_c_y },
            buigterm_y: term_my,
            buigterm_z: input.k_m * term_mz,
            nr: if low_slenderness { "(6.19)" } else { "(6.23)" },
            nr_rel: "(6.21)",
            nr_k: "(6.27)",
            nr_kc: "(6.25)",
            doorbuiging: "z",
        },
        Tak {
            k: &input.kniklengte_z,
            radius_mm: section.radius_z_mm,
            traagheid_mm4: section.i_z_mm4,
            lambda: lambda_z,
            lambda_rel: lambda_rel_z,
            k_fac: k_z,
            k_c: k_c_z,
            vergelijking: eq_b,
            drukterm: if low_slenderness { ratio_c * ratio_c } else { term_c_z },
            buigterm_y: input.k_m * term_my,
            buigterm_z: term_mz,
            nr: if low_slenderness { "(6.20)" } else { "(6.24)" },
            nr_rel: "(6.22)",
            nr_k: "(6.28)",
            nr_kc: "(6.26)",
            doorbuiging: "y",
        },
    ];
    // Bij gelijke uitkomst de eerste tak; de UC is dan toch dezelfde.
    let maatgevend = if eq_b > eq_a { 1 } else { 0 };

    let mut notes: Vec<String> = takken
        .iter()
        .map(|t| {
            format!(
                "Om de {a}-as ({vlak}): {lcr}, λ_rel,{a} = {lr}, k_c,{a} = {kc}, {nr} = {v}.",
                a = t.k.as_naam,
                vlak = vlak_label(t.k),
                lcr = t.k.samenvatting(),
                lr = nl(t.lambda_rel, 3),
                kc = nl(t.k_c, 3),
                nr = t.nr,
                v = nl(t.vergelijking, 3),
            )
        })
        .collect();
    let deelstappen = if n_ed < 0.0 {
        notes.push(format!(
            "Maatgevend is {} — knik om de {}-as ({}).",
            takken[maatgevend].nr,
            takken[maatgevend].k.as_naam,
            vlak_label(takken[maatgevend].k)
        ));
        kolom_deelstappen(
            section,
            input,
            &force_state,
            &takken,
            maatgevend,
            Spanningen { sigma_c, sigma_my, sigma_mz },
            low_slenderness,
            uc,
        )
    } else {
        notes.push(
            "N_Ed is geen drukkracht: kolomknik is hier niet van toepassing en er is niets af te \
             leiden. De kniklengten hierboven gelden zodra de staaf wél gedrukt wordt."
                .to_string(),
        );
        Vec::new()
    };
    if let Some(t) = takken.iter().find(|t| !t.k.in_rekenvlak) {
        notes.push(format!(
            "Knik om de {}-as ziet de raamwerkberekening nooit, ook niet in een tweede-orde-berekening: \
             de toets met k_c is daarvoor altijd nodig.",
            t.k.as_naam
        ));
    }

    StabilityCalc {
        id: "6.3.2_column_stability".to_string(),
        title: format!(
            "Kolomknik (druk en buiging) — {}",
            takken
                .iter()
                .map(|t| format!("om {} ({})", t.k.as_naam, vlak_label(t.k)))
                .collect::<Vec<_>>()
                .join(" en ")
        ),
        article,
        force_state,
        formula_latex: formula,
        variables: vec![
            NamedValue { symbol: r"\sigma_{c,0,d}".to_string(), value: sigma_c, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{m,y,d}".to_string(), value: sigma_my, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{m,z,d}".to_string(), value: sigma_mz, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{c,0,d}".to_string(), value: input.f_c0d_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{m,y,d}".to_string(), value: input.f_myd_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{m,z,d}".to_string(), value: input.f_mzd_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: "k_m".to_string(), value: input.k_m, unit: "-".to_string() },
            NamedValue { symbol: r"L_{cr,y}".to_string(), value: l_cr_y_mm, unit: "mm".to_string() },
            NamedValue { symbol: r"L_{cr,z}".to_string(), value: l_cr_z_mm, unit: "mm".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: r"\lambda_y".to_string(), value: lambda_y, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_z".to_string(), value: lambda_z, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_{rel,y}".to_string(), value: lambda_rel_y, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_{rel,z}".to_string(), value: lambda_rel_z, unit: "-".to_string() },
            NamedValue { symbol: "k_y".to_string(), value: k_y, unit: "-".to_string() },
            NamedValue { symbol: "k_z".to_string(), value: k_z, unit: "-".to_string() },
            NamedValue { symbol: r"k_{c,y}".to_string(), value: k_c_y, unit: "-".to_string() },
            NamedValue { symbol: r"k_{c,z}".to_string(), value: k_c_z, unit: "-".to_string() },
            NamedValue { symbol: "(6.23)".to_string(), value: eq_a, unit: "-".to_string() },
            NamedValue { symbol: "(6.24)".to_string(), value: eq_b, unit: "-".to_string() },
        ],
        deelstappen,
        value: uc,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: uc,
            rd: 1.0,
            uc,
            formula_latex: r"\max\left[(6.23), (6.24)\right]".to_string(),
        }),
        status,
        notes,
    }
}

/// Eén tak van de kolomtoets: alles wat bij knik om één as hoort.
struct Tak<'a> {
    k: &'a Kniklengte,
    radius_mm: f64,
    traagheid_mm4: f64,
    lambda: f64,
    lambda_rel: f64,
    k_fac: f64,
    k_c: f64,
    vergelijking: f64,
    drukterm: f64,
    buigterm_y: f64,
    buigterm_z: f64,
    /// Nummer van de vergelijking van deze tak: (6.23)/(6.24), of
    /// (6.19)/(6.20) bij lage slankheid.
    nr: &'static str,
    nr_rel: &'static str,
    nr_k: &'static str,
    nr_kc: &'static str,
    /// De richting van de doorbuiging die bij deze as hoort (art. 6.3.2(1)).
    doorbuiging: &'static str,
}

/// De drie rekenspanningen op de getoetste plaats (N/mm²).
#[derive(Clone, Copy)]
struct Spanningen {
    sigma_c: f64,
    sigma_my: f64,
    sigma_mz: f64,
}

#[allow(clippy::too_many_arguments)]
fn kolom_deelstappen(
    section: &TimberSection,
    input: &ColumnStabilityInput,
    force_state: &ForceStateSnapshot,
    takken: &[Tak<'_>],
    maatgevend: usize,
    s: Spanningen,
    low_slenderness: bool,
    uc: f64,
) -> Vec<Deelstap> {
    let Spanningen { sigma_c, sigma_my, sigma_mz } = s;
    let n_c = force_state.forces.n_ed.abs();
    let mut uit = Vec::with_capacity(2 + 7 * takken.len() + 1);

    uit.push(stap(
        "uitgangspunten",
        "Uitgangspunten van de kolomtoets",
        "",
        "art. 6.3.2",
        String::new(),
        String::new(),
        vec![
            nv("N_{c,Ed}", n_c, "kN"),
            nv("A", section.a_mm2, "mm²"),
            nv("f_{c,0,k}", input.f_c0k_mpa, "N/mm²"),
            nv("E_{0,05}", input.e0_05_mpa, "N/mm²"),
            nv(r"\beta_c", input.beta_c, "-"),
            nv("f_{c,0,d}", input.f_c0d_mpa, "N/mm²"),
            nv(r"\sigma_{m,y,d}", sigma_my, "N/mm²"),
            nv("f_{m,y,d}", input.f_myd_mpa, "N/mm²"),
            nv(r"\sigma_{m,z,d}", sigma_mz, "N/mm²"),
            nv("f_{m,z,d}", input.f_mzd_mpa, "N/mm²"),
            nv("k_m", input.k_m, "-"),
        ],
        None,
        "",
        vec![
            format!(
                "De toets is gedaan op de plaats van het maatgevende buigmoment (combinatie {}, x = {} \
                 mm), met de normaalkracht die daar werkt.",
                force_state.combination_id,
                nl(force_state.position_mm, 0)
            ),
            "E_0,05 is de 5-percentielwaarde van de elasticiteitsmodulus evenwijdig aan de vezel; \
             art. 6.3.1(2) schrijft voor dat de stabiliteit met de karakteristieke stijfheid wordt \
             getoetst. β_c is de factor van (6.29) voor elementen binnen de rechtheidsgrenzen van \
             hoofdstuk 10."
                .to_string(),
            "Elke as krijgt hieronder een eigen, volledige tak. (6.23) hoort bij knik om de y-as en \
             (6.24) bij knik om de z-as; de toets is de grootste van de twee."
                .to_string(),
        ],
    ));

    uit.push(stap(
        "sigma_c",
        "Drukspanning evenwijdig aan de vezel",
        r"\sigma_{c,0,d}",
        "art. 6.1.4",
        r"\sigma_{c,0,d} = \frac{N_{c,Ed} \cdot 10^3}{A}".to_string(),
        format!(r"\sigma_{{c,0,d}} = \frac{{{} \cdot 10^3}}{{{}}}", lx(n_c, 2), lx(section.a_mm2, 0)),
        vec![nv("N_{c,Ed}", n_c, "kN"), nv("A", section.a_mm2, "mm²")],
        Some(sigma_c),
        "N/mm²",
        Vec::new(),
    ));

    for t in takken {
        let a = t.k.as_naam.as_str();
        let lcr = t.k.symbool();
        uit.push(kniklengte_deelstap(t.k, "art. 6.3.2(1)", ""));

        uit.push(stap(
            &format!("i_{a}"),
            &format!("Traagheidsstraal om de {a}-as"),
            &format!("i_{{{a}}}"),
            "art. 6.3.2(1)",
            format!(r"i_{{{a}}} = \sqrt{{\frac{{I_{{{a}}}}}{{A}}}}"),
            format!(r"i_{{{a}}} = \sqrt{{\frac{{{}}}{{{}}}}}", lx(t.traagheid_mm4, 0), lx(section.a_mm2, 0)),
            vec![nv(&format!("I_{{{a}}}"), t.traagheid_mm4, "mm⁴"), nv("A", section.a_mm2, "mm²")],
            Some(t.radius_mm),
            "mm",
            Vec::new(),
        ));

        uit.push(stap(
            &format!("lambda_{a}"),
            &format!("Slankheid om de {a}-as"),
            &format!(r"\lambda_{{{a}}}"),
            "art. 6.3.2(1)",
            format!(r"\lambda_{{{a}}} = \frac{{{lcr}}}{{i_{{{a}}}}}"),
            format!(r"\lambda_{{{a}}} = \frac{{{}}}{{{}}}", lx(t.k.l_cr_mm, 0), lx(t.radius_mm, 2)),
            vec![nv(&lcr, t.k.l_cr_mm, "mm"), nv(&format!("i_{{{a}}}"), t.radius_mm, "mm")],
            Some(t.lambda),
            "-",
            vec![format!(
                "De slankheid overeenkomend met de buiging om de {a}-as (doorbuiging in de {}-richting), \
                 zoals art. 6.3.2(1) haar omschrijft.",
                t.doorbuiging
            )],
        ));

        uit.push(stap(
            &format!("lambda_rel_{a}"),
            &format!("Relatieve slankheid om de {a}-as"),
            &format!(r"\lambda_{{rel,{a}}}"),
            &format!("art. 6.3.2(1) {}", t.nr_rel),
            format!(r"\lambda_{{rel,{a}}} = \frac{{\lambda_{{{a}}}}}{{\pi}} \sqrt{{\frac{{f_{{c,0,k}}}}{{E_{{0,05}}}}}}"),
            format!(
                r"\lambda_{{rel,{a}}} = \frac{{{}}}{{\pi}} \sqrt{{\frac{{{}}}{{{}}}}}",
                lx(t.lambda, 2),
                lx(input.f_c0k_mpa, 1),
                lx(input.e0_05_mpa, 0)
            ),
            vec![
                nv(&format!(r"\lambda_{{{a}}}"), t.lambda, "-"),
                nv("f_{c,0,k}", input.f_c0k_mpa, "N/mm²"),
                nv("E_{0,05}", input.e0_05_mpa, "N/mm²"),
            ],
            Some(t.lambda_rel),
            "-",
            Vec::new(),
        ));

        if low_slenderness {
            uit.push(stap(
                &format!("vergelijking_{a}"),
                &format!("Toets om de {a}-as — {}", t.nr),
                t.nr,
                &format!("art. 6.3.2(2), art. 6.2.4 {}", t.nr),
                if a == "y" {
                    r"\left(\frac{\sigma_{c,0,d}}{f_{c,0,d}}\right)^2 + \frac{\sigma_{m,y,d}}{f_{m,y,d}} + k_m\frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string()
                } else {
                    r"\left(\frac{\sigma_{c,0,d}}{f_{c,0,d}}\right)^2 + k_m\frac{\sigma_{m,y,d}}{f_{m,y,d}} + \frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string()
                },
                format!(r"{} + {} + {}", lx(t.drukterm, 4), lx(t.buigterm_y, 4), lx(t.buigterm_z, 4)),
                Vec::new(),
                Some(t.vergelijking),
                "-",
                vec![format!(
                    "λ_rel,y én λ_rel,z ≤ 0,3: art. 6.3.2(2) verwijst naar (6.19) en (6.20) in 6.2.4, \
                     zonder knikfactor. Drukterm {}, buigterm om y {}, buigterm om z {}.",
                    nl(t.drukterm, 4),
                    nl(t.buigterm_y, 4),
                    nl(t.buigterm_z, 4)
                )],
            ));
            continue;
        }

        uit.push(stap(
            &format!("k_{a}"),
            &format!("Instabiliteitsfactor om de {a}-as"),
            &format!("k_{{{a}}}"),
            &format!("art. 6.3.2(3) {}", t.nr_k),
            format!(
                r"k_{{{a}}} = 0{{,}}5 \left( 1 + \beta_c \left( \lambda_{{rel,{a}}} - 0{{,}}3 \right) + \lambda_{{rel,{a}}}^2 \right)"
            ),
            format!(
                r"k_{{{a}}} = 0{{,}}5 \left( 1 + {} \left( {} - 0{{,}}3 \right) + {}^2 \right)",
                lx(input.beta_c, 2),
                lx(t.lambda_rel, 4),
                lx(t.lambda_rel, 4)
            ),
            vec![nv(r"\beta_c", input.beta_c, "-"), nv(&format!(r"\lambda_{{rel,{a}}}"), t.lambda_rel, "-")],
            Some(t.k_fac),
            "-",
            Vec::new(),
        ));

        let wortel = t.k_fac * t.k_fac - t.lambda_rel * t.lambda_rel;
        let kc_ruw = 1.0 / (t.k_fac + wortel.max(0.0).sqrt());
        let mut notes_kc = Vec::new();
        if kc_ruw > 1.0 {
            notes_kc.push(format!(
                "De breuk geeft {}; de kern begrenst k_c op 1,0 — een knikfactor boven 1 zou de \
                 drukterm kleiner maken dan zonder knik.",
                nl(kc_ruw, 4)
            ));
        }
        uit.push(stap(
            &format!("k_c_{a}"),
            &format!("Knikfactor om de {a}-as"),
            &format!("k_{{c,{a}}}"),
            &format!("art. 6.3.2(3) {}", t.nr_kc),
            format!(r"k_{{c,{a}}} = \frac{{1}}{{k_{{{a}}} + \sqrt{{k_{{{a}}}^2 - \lambda_{{rel,{a}}}^2}}}}"),
            format!(
                r"k_{{c,{a}}} = \frac{{1}}{{{} + \sqrt{{{}^2 - {}^2}}}}",
                lx(t.k_fac, 4),
                lx(t.k_fac, 4),
                lx(t.lambda_rel, 4)
            ),
            vec![nv(&format!("k_{{{a}}}"), t.k_fac, "-"), nv(&format!(r"\lambda_{{rel,{a}}}"), t.lambda_rel, "-")],
            Some(t.k_c),
            "-",
            notes_kc,
        ));

        let (formule, ingevuld) = if a == "y" {
            (
                r"\frac{\sigma_{c,0,d}}{k_{c,y} f_{c,0,d}} + \frac{\sigma_{m,y,d}}{f_{m,y,d}} + k_m\frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string(),
                format!(
                    r"\frac{{{sc}}}{{{kc} \cdot {fc}}} + \frac{{{smy}}}{{{fmy}}} + {km} \cdot \frac{{{smz}}}{{{fmz}}}",
                    sc = lx(sigma_c, 3),
                    kc = lx(t.k_c, 4),
                    fc = lx(input.f_c0d_mpa, 3),
                    smy = lx(sigma_my, 3),
                    fmy = lx(input.f_myd_mpa, 3),
                    km = lx(input.k_m, 2),
                    smz = lx(sigma_mz, 3),
                    fmz = lx(input.f_mzd_mpa, 3),
                ),
            )
        } else {
            (
                r"\frac{\sigma_{c,0,d}}{k_{c,z} f_{c,0,d}} + k_m\frac{\sigma_{m,y,d}}{f_{m,y,d}} + \frac{\sigma_{m,z,d}}{f_{m,z,d}} \le 1".to_string(),
                format!(
                    r"\frac{{{sc}}}{{{kc} \cdot {fc}}} + {km} \cdot \frac{{{smy}}}{{{fmy}}} + \frac{{{smz}}}{{{fmz}}}",
                    sc = lx(sigma_c, 3),
                    kc = lx(t.k_c, 4),
                    fc = lx(input.f_c0d_mpa, 3),
                    km = lx(input.k_m, 2),
                    smy = lx(sigma_my, 3),
                    fmy = lx(input.f_myd_mpa, 3),
                    smz = lx(sigma_mz, 3),
                    fmz = lx(input.f_mzd_mpa, 3),
                ),
            )
        };
        uit.push(stap(
            &format!("vergelijking_{a}"),
            &format!("Toets om de {a}-as — {}", t.nr),
            t.nr,
            &format!("art. 6.3.2(3) {}", t.nr),
            formule,
            ingevuld,
            vec![
                nv(&format!("k_{{c,{a}}}"), t.k_c, "-"),
                nv(r"\sigma_{c,0,d}", sigma_c, "N/mm²"),
                nv("f_{c,0,d}", input.f_c0d_mpa, "N/mm²"),
            ],
            Some(t.vergelijking),
            "-",
            vec![format!(
                "Drukterm {}, buigterm om y {}, buigterm om z {}. {}",
                nl(t.drukterm, 4),
                nl(t.buigterm_y, 4),
                nl(t.buigterm_z, 4),
                if t.vergelijking <= 1.0 { "Om deze as voldoet de staaf." } else { "Om deze as voldoet de staaf NIET." }
            )],
        ));
    }

    let nrs: Vec<&str> = takken.iter().map(|t| t.nr).collect();
    let waarden: Vec<String> = takken.iter().map(|t| lx(t.vergelijking, 4)).collect();
    uit.push(stap(
        "maatgevend",
        "Unity check — de grootste van de takken",
        "UC",
        "art. 6.3.2(3)",
        format!(r"UC = \max\left[ {} \right]", nrs.join(r" \,;\, ")),
        format!(r"UC = \max\left[ {} \right]", waarden.join(r" \,;\, ")),
        Vec::new(),
        Some(uc),
        "-",
        vec![format!(
            "Maatgevend is {} — knik om de {}-as ({}).",
            takken[maatgevend].nr,
            takken[maatgevend].k.as_naam,
            vlak_label(takken[maatgevend].k)
        )],
    ));
    uit
}

// ---------------------------------------------------------------------------
// §6.3.3 — kipstabiliteit
// ---------------------------------------------------------------------------

/// Belastinggeval voor de effectieve kiplengte (tabel 6.1).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub enum LtbLoadCase {
    /// Vrij opgelegd, constant moment: l_ef/l = 1,0.
    ConstantMoment,
    /// Vrij opgelegd, gelijkmatig verdeelde belasting: l_ef/l = 0,9.
    UniformLoad,
    /// Vrij opgelegd, puntlast in het midden: l_ef/l = 0,8.
    ConcentratedMidspan,
    /// Uitkraging, gelijkmatig verdeelde belasting: l_ef/l = 0,5.
    CantileverUniform,
    /// Uitkraging, puntlast aan het vrije einde: l_ef/l = 0,8.
    CantileverConcentratedEnd,
}

/// Aangrijpingspunt van de belasting t.o.v. het zwaartepunt (tabel 6.1,
/// voetnoot): drukzijde → l_ef + 2h; trekzijde → l_ef − 0,5h.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub enum LtbLoadPosition {
    CentreOfGravity,
    CompressionEdge,
    TensionEdge,
}

/// De verhouding l_ef/ℓ van tabel 6.1 voor het belastinggeval.
pub fn l_ef_verhouding(case: LtbLoadCase) -> f64 {
    match case {
        LtbLoadCase::ConstantMoment => 1.0,
        LtbLoadCase::UniformLoad => 0.9,
        LtbLoadCase::ConcentratedMidspan => 0.8,
        LtbLoadCase::CantileverUniform => 0.5,
        LtbLoadCase::CantileverConcentratedEnd => 0.8,
    }
}

/// Het belastinggeval van tabel 6.1 in woorden, voor de notitie bij de kiptoets.
pub fn l_ef_geval_tekst(case: LtbLoadCase) -> &'static str {
    match case {
        LtbLoadCase::ConstantMoment => "ligger op twee steunpunten, constant moment",
        LtbLoadCase::UniformLoad => "ligger op twee steunpunten, gelijkmatig verdeelde belasting",
        LtbLoadCase::ConcentratedMidspan => "ligger op twee steunpunten, puntlast in het midden",
        LtbLoadCase::CantileverUniform => "uitkraging, gelijkmatig verdeelde belasting",
        LtbLoadCase::CantileverConcentratedEnd => "uitkraging, puntlast aan het vrije einde",
    }
}

/// Het aangrijpingspunt van tabel 6.1 (voetnoot a) in woorden, met de
/// correctie op l_ef erbij, voor de notitie bij de kiptoets.
pub fn lastpositie_tekst(position: LtbLoadPosition) -> &'static str {
    match position {
        LtbLoadPosition::CentreOfGravity => "belasting aangrijpend in het zwaartepunt (geen correctie)",
        LtbLoadPosition::CompressionEdge => "belasting aangrijpend aan de DRUKzijde (l_ef + 2h)",
        LtbLoadPosition::TensionEdge => "belasting aangrijpend aan de TREKzijde (l_ef − 0,5h)",
    }
}

/// De notitie die zegt hoe l_ef tot stand kwam: uit tabel 6.1 met het
/// belastinggeval, de ℓ waar het van uitging en het aangrijpingspunt van de
/// belasting. Zonder deze regel staat er in de kiptoets wél een l_ef maar
/// niet waar hij vandaan komt — en juist het aangrijpingspunt is sinds
/// september 2026 een keuze van de gebruiker (`ltb_load_position`), die
/// l_ef met 2h kan laten groeien. Die keuze hoort in het rapport te staan.
pub fn l_ef_toelichting(
    l_mm: f64,
    l_herkomst: &str,
    case: LtbLoadCase,
    position: LtbLoadPosition,
    h_mm: f64,
) -> String {
    let l_ef = effective_length_mm(l_mm, case, position, h_mm);
    let correctie = match position {
        LtbLoadPosition::CentreOfGravity => String::new(),
        LtbLoadPosition::CompressionEdge => format!(" + 2 · {h_mm:.0}"),
        LtbLoadPosition::TensionEdge => format!(" − 0,5 · {h_mm:.0}"),
    };
    format!(
        "l_ef = {ratio} · {l_mm:.0}{correctie} = {l_ef:.0} mm volgens tabel 6.1 ({geval}), \
         met ℓ = {l_mm:.0} mm ({l_herkomst}); {positie}.",
        // Nederlandse komma, zoals de rest van de notitie (0,5 · h).
        ratio = format!("{:.1}", l_ef_verhouding(case)).replace('.', ","),
        geval = l_ef_geval_tekst(case),
        positie = lastpositie_tekst(position),
    )
}

/// Effectieve kiplengte volgens tabel 6.1: l_ef = ratio·l, daarna
/// gecorrigeerd voor het aangrijpingspunt van de belasting.
///
/// LET OP: de referentie-uitwerking print "l_ef = 0,9·1268 = 1142" gevolgd
/// door "l_ef = l_ef + 2h = 1142 + 2·450 = 1268", wat rekenkundig niet klopt
/// (1142 + 900 = 2042); zij rekent feitelijk met l_ef = 1268 mm (= de
/// kipsteunafstand). Deze functie implementeert tabel 6.1 zoals afgedrukt in
/// de normtekst; wie het referentiegedrag wil reproduceren geeft l_ef
/// rechtstreeks op (zie `check_beam_stability`).
pub fn effective_length_mm(l_mm: f64, case: LtbLoadCase, position: LtbLoadPosition, h_mm: f64) -> f64 {
    let base = l_ef_verhouding(case) * l_mm;
    match position {
        LtbLoadPosition::CentreOfGravity => base,
        LtbLoadPosition::CompressionEdge => base + 2.0 * h_mm,
        LtbLoadPosition::TensionEdge => (base - 0.5 * h_mm).max(0.0),
    }
}

/// Kritieke buigspanning voor een rechthoekige naaldhoutdoorsnede,
/// vergelijking (6.32): sigma_m,crit = 0,78·b² / (h·l_ef) · E_0,05.
///
/// LET OP HET TOEPASSINGSGEBIED. Art. 6.3.3(2) geeft (6.32) uitdrukkelijk
/// "voor naaldhout met een gezaagde rechthoekige doorsnede". De algemene
/// uitdrukking is (6.31), sigma_m,crit = pi·sqrt(E_0,05·I_z·G_0,05·I_tor) /
/// (l_ef·W_y), en die vraagt G_0,05 en I_tor — twee grootheden die deze
/// toetsing niet kent. (6.32) op een samengestelde doorsnede loslaten zou de
/// omhullende breedte als lijfbreedte gebruiken en dus een veel te hoge
/// kritieke spanning geven; daarom weigert `check_beam_stability` dat en
/// meldt hij het. Zie de vlag `rechthoekig` op [`TimberSection`].
pub fn sigma_m_crit_rect_mpa(section: &TimberSection, l_ef_mm: f64, e0_05_mpa: f64) -> f64 {
    if section.h_mm <= 0.0 || l_ef_mm <= 0.0 || !section.rechthoekig {
        return 0.0;
    }
    0.78 * section.b_mm * section.b_mm / (section.h_mm * l_ef_mm) * e0_05_mpa
}

/// Relatieve kipslankheid, vergelijking (6.30):
/// lambda_rel,m = sqrt(f_m,k / sigma_m,crit).
pub fn lambda_rel_m(f_mk_mpa: f64, sigma_m_crit_mpa: f64) -> f64 {
    if sigma_m_crit_mpa <= 0.0 {
        return f64::INFINITY;
    }
    (f_mk_mpa / sigma_m_crit_mpa).sqrt()
}

/// Kipfactor k_crit, vergelijking (6.34):
/// lambda_rel,m <= 0,75 → 1,0; 0,75 < lambda_rel,m <= 1,4 →
/// 1,56 − 0,75·lambda_rel,m; > 1,4 → 1/lambda_rel,m².
pub fn k_crit(lambda_rel_m: f64) -> f64 {
    if lambda_rel_m <= 0.75 {
        1.0
    } else if lambda_rel_m <= 1.4 {
        1.56 - 0.75 * lambda_rel_m
    } else {
        1.0 / (lambda_rel_m * lambda_rel_m)
    }
}

/// Invoer voor de kiptoets §6.3.3.
#[derive(Clone, Copy, Debug)]
pub struct BeamStabilityInput {
    /// Effectieve kiplengte l_ef in mm (kipsteunafstand na tabel 6.1-correctie).
    pub l_ef_mm: f64,
    /// Kniklengte voor knik om z binnen het kipveld (voor de drukterm in 6.35).
    pub l_cr_z_mm: f64,
    pub f_mk_mpa: f64,
    pub f_c0k_mpa: f64,
    pub e0_05_mpa: f64,
    pub beta_c: f64,
    pub f_myd_mpa: f64,
    pub f_c0d_mpa: f64,
}

/// §6.3.3: kip bij zuivere buiging (6.33) of buiging + druk (6.35).
///
/// Zuivere buiging: sigma_m,d <= k_crit · f_m,d (6.33).
/// Met drukkracht:  (sigma_m,d / (k_crit·f_m,d))² + sigma_c,d / (k_c,z·f_c,0,d)
/// <= 1 (6.35), met k_c,z volgens §6.3.2 voor knik om de zwakke as.
pub fn check_beam_stability(
    section: &TimberSection,
    input: &BeamStabilityInput,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let n_ed = force_state.forces.n_ed;
    let sigma_m = sigma_m_mpa(force_state.forces.my_ed, section.w_y_mm3);
    let sigma_c = if n_ed < 0.0 { sigma_axial_mpa(n_ed, section.a_mm2) } else { 0.0 };

    // Niet-rechthoekig: (6.32) geldt niet en (6.31) is met de beschikbare
    // gegevens niet te maken. Dan wordt de toets NIET uitgevoerd én dat
    // hardop gezegd — een kipfactor uit de omhullende breedte zou een te
    // gunstig antwoord geven zonder dat iemand het ziet.
    if !section.rechthoekig {
        return kip_niet_bepaalbaar(section, input, force_state, sigma_m, sigma_c);
    }

    let s_crit = sigma_m_crit_rect_mpa(section, input.l_ef_mm, input.e0_05_mpa);
    let l_rel_m = lambda_rel_m(input.f_mk_mpa, s_crit);
    let kcrit = k_crit(l_rel_m);

    // k_c,z voor de drukterm in (6.35).
    let lambda_z = slenderness(input.l_cr_z_mm, section.radius_z_mm);
    let lambda_rel_z = lambda_rel(lambda_z, input.f_c0k_mpa, input.e0_05_mpa);
    let k_z = k_factor(lambda_rel_z, input.beta_c);
    let k_c_z = k_c(k_z, lambda_rel_z);

    let bending_ratio = if input.f_myd_mpa > 0.0 { sigma_m / (kcrit * input.f_myd_mpa) } else { 0.0 };
    let has_compression = sigma_c > 0.0;
    let (uc, formula, uc_formula) = if has_compression {
        (
            bending_ratio * bending_ratio + sigma_c / (k_c_z * input.f_c0d_mpa),
            r"\left(\frac{\sigma_{m,d}}{k_{crit} f_{m,d}}\right)^2 + \frac{\sigma_{c,d}}{k_{c,z} f_{c,0,d}} \le 1".to_string(),
            r"(6.35)".to_string(),
        )
    } else {
        (
            bending_ratio,
            r"\sigma_{m,d} \le k_{crit} \cdot f_{m,d}".to_string(),
            r"\sigma_{m,d} / (k_{crit} f_{m,d})".to_string(),
        )
    };

    let status = if sigma_m <= 0.0 && !has_compression {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    StabilityCalc {
        id: "6.3.3_beam_stability".to_string(),
        title: "Kipstabiliteit (buiging en druk)".to_string(),
        article: if has_compression { "art. 6.3.3 (6.35)".to_string() } else { "art. 6.3.3 (6.33)".to_string() },
        force_state,
        formula_latex: formula,
        variables: vec![
            NamedValue { symbol: r"\sigma_{m,y,d}".to_string(), value: sigma_m, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{c,0,d}".to_string(), value: sigma_c, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{m,y,d}".to_string(), value: input.f_myd_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"f_{c,0,d}".to_string(), value: input.f_c0d_mpa, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"l_{ef}".to_string(), value: input.l_ef_mm, unit: "mm".to_string() },
            NamedValue { symbol: r"E_{0,05}".to_string(), value: input.e0_05_mpa, unit: "N/mm²".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: r"\sigma_{m,crit}".to_string(), value: s_crit, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\lambda_{rel,m}".to_string(), value: l_rel_m, unit: "-".to_string() },
            NamedValue { symbol: r"k_{crit}".to_string(), value: kcrit, unit: "-".to_string() },
            NamedValue { symbol: r"\lambda_{rel,z}".to_string(), value: lambda_rel_z, unit: "-".to_string() },
            NamedValue { symbol: r"k_{c,z}".to_string(), value: k_c_z, unit: "-".to_string() },
        ],
        // Zie hierboven: hout krijgt zijn afleiding later.
        deelstappen: vec![],
        value: uc,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: uc,
            rd: 1.0,
            uc,
            formula_latex: uc_formula,
        }),
        status,
        notes: vec![],
    }
}

/// De kiptoets van §6.3.3 voor een doorsnede die geen rechthoek is: niet
/// uitgevoerd, met de reden erbij.
///
/// WAAROM GEEN GETAL
/// (6.32) — sigma_m,crit = 0,78·b²/(h·l_ef)·E_0,05 — geldt volgens
/// art. 6.3.3(2) alleen voor naaldhout met een gezaagde rechthoekige
/// doorsnede. Bij een I- of kokervorm zou `b` daarin de omhullende breedte
/// zijn, en die is een veelvoud van wat er werkelijk aan zijdelingse
/// stijfheid is: de uitkomst zou te gunstig zijn. De algemene (6.31) vraagt
/// G_0,05 en het torsietraagheidsmoment; die staan niet in de sterkteklassen
/// van deze kern en worden hier dus niet geraden.
///
/// De toets komt wél in het resultaat te staan, als `NotApplicable` met een
/// notitie. Weglaten zou de indruk wekken dat er niets te toetsen viel.
fn kip_niet_bepaalbaar(
    section: &TimberSection,
    input: &BeamStabilityInput,
    force_state: ForceStateSnapshot,
    sigma_m: f64,
    sigma_c: f64,
) -> StabilityCalc {
    StabilityCalc {
        id: "6.3.3_beam_stability".to_string(),
        title: "Kipstabiliteit (buiging en druk)".to_string(),
        article: "art. 6.3.3 (6.31)".to_string(),
        force_state,
        formula_latex:
            r"\sigma_{m,crit} = \frac{\pi \sqrt{E_{0,05} I_z \, G_{0,05} I_{tor}}}{l_{ef} W_y}"
                .to_string(),
        variables: vec![
            NamedValue { symbol: r"\sigma_{m,y,d}".to_string(), value: sigma_m, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{c,0,d}".to_string(), value: sigma_c, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"l_{ef}".to_string(), value: input.l_ef_mm, unit: "mm".to_string() },
            NamedValue { symbol: "I_z".to_string(), value: section.i_z_mm4, unit: "mm⁴".to_string() },
            NamedValue { symbol: "W_y".to_string(), value: section.w_y_mm3, unit: "mm³".to_string() },
        ],
        intermediate_values: vec![],
        deelstappen: vec![],
        value: 0.0,
        unit: "-".to_string(),
        uc: None,
        status: CheckStatus::NotApplicable,
        notes: vec![
            concat!(
                "Kip is NIET getoetst. De doorsnede is niet rechthoekig, en de ",
                "vereenvoudigde sigma_m,crit van (6.32) geldt volgens art. 6.3.3(2) ",
                "alleen voor naaldhout met een gezaagde rechthoekige doorsnede. De ",
                "algemene (6.31) vraagt G_0,05 en het torsietraagheidsmoment I_tor; ",
                "die zijn hier niet beschikbaar en worden niet geschat. Toets de ",
                "kipstabiliteit van deze ligger apart, of steun hem zijdelings af.",
            )
            .to_string(),
        ],
    }
}

/// De kiptoets van §6.3.3 wanneer de invoer hem uitzet
/// (`perform_ltb_check = false`): niet uitgevoerd, met de reden erbij.
///
/// WAT DIE VLAG BETEKENT
/// Eén ding: de gedrukte rand is over de volle lengte zijdelings gesteund
/// (dakbeschot, vloerplaat, doorgaande koppeling aan de bovenrand) en de
/// opleggingen laten geen torsie toe. Art. 6.3.3(5) staat dan k_crit = 1,0
/// toe. Met k_crit = 1 wordt (6.33) de gewone buigtoets van art. 6.1.6, en
/// (6.35) — (σ_m/f_m)² + σ_c/(k_c,z·f_c,0,d) ≤ 1 — kan niet strenger uitvallen
/// dan (6.23)/(6.24) van art. 6.3.2, waar dezelfde termen lineair staan. Wat
/// de kiptoets zou toetsen, is dus al getoetst.
///
/// De toets komt wél in het resultaat, als `NotApplicable` met deze notitie.
/// Een kiptoets die stil verdwijnt is precies de fout waar een balklaag zonder
/// beschot onopgemerkt doorheen glipt; hier staat de aanname zwart op wit,
/// zodat het rapport haar toont en de lezer haar kan betwisten.
pub fn kip_overgeslagen_drukzijde_gesteund(
    section: &TimberSection,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let n_ed = force_state.forces.n_ed;
    let sigma_m = sigma_m_mpa(force_state.forces.my_ed, section.w_y_mm3);
    let sigma_c = if n_ed < 0.0 { sigma_axial_mpa(n_ed, section.a_mm2) } else { 0.0 };
    StabilityCalc {
        id: "6.3.3_beam_stability".to_string(),
        title: "Kipstabiliteit (buiging en druk)".to_string(),
        article: "art. 6.3.3 (5)".to_string(),
        force_state,
        formula_latex: r"k_{crit} = 1{,}0".to_string(),
        variables: vec![
            NamedValue { symbol: r"\sigma_{m,y,d}".to_string(), value: sigma_m, unit: "N/mm²".to_string() },
            NamedValue { symbol: r"\sigma_{c,0,d}".to_string(), value: sigma_c, unit: "N/mm²".to_string() },
        ],
        intermediate_values: vec![
            NamedValue { symbol: r"k_{crit}".to_string(), value: 1.0, unit: "-".to_string() },
        ],
        deelstappen: vec![],
        value: 0.0,
        unit: "-".to_string(),
        uc: None,
        status: CheckStatus::NotApplicable,
        notes: vec![
            concat!(
                "Kiptoets overgeslagen op aanwijzing van de invoer (kiptoets uit): de gedrukte ",
                "rand geldt als over de volle lengte zijdelings gesteund en de opleggingen als ",
                "torsievast, zodat k_crit = 1,0 mag worden genomen (art. 6.3.3(5)). De buiging is ",
                "dan getoetst in art. 6.1.6 en de druk in art. 6.3.2; (6.35) met k_crit = 1 kan ",
                "daar niet strenger uitvallen. Deze aanname is een keuze van de constructeur en ",
                "geen uitkomst van de berekening: controleer dat de steun er werkelijk is.",
            )
            .to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;
    use mechanics::InternalForces;

    fn sectie() -> TimberSection {
        TimberSection::rechthoek(96.0, 450.0)
    }

    /// De toelichting noemt de verhouding, ℓ, de correctie voor het
    /// aangrijpingspunt en de uitkomst — en die uitkomst is dezelfde als
    /// `effective_length_mm` geeft.
    #[test]
    fn l_ef_toelichting_noemt_verhouding_correctie_en_uitkomst() {
        let drukzijde = l_ef_toelichting(
            6000.0, "kipsteunafstand", LtbLoadCase::UniformLoad, LtbLoadPosition::CompressionEdge, 450.0,
        );
        assert!(drukzijde.contains("0,9 · 6000 + 2 · 450 = 6300 mm"), "{drukzijde}");
        assert!(drukzijde.contains("DRUKzijde"), "{drukzijde}");
        assert!(drukzijde.contains("kipsteunafstand"), "{drukzijde}");
        let zwaartepunt = l_ef_toelichting(
            6000.0, "staaflengte", LtbLoadCase::UniformLoad, LtbLoadPosition::CentreOfGravity, 450.0,
        );
        assert!(zwaartepunt.contains("0,9 · 6000 = 5400 mm"), "{zwaartepunt}");
        assert!(zwaartepunt.contains("zwaartepunt"), "{zwaartepunt}");
        let trekzijde = l_ef_toelichting(
            6000.0, "staaflengte", LtbLoadCase::UniformLoad, LtbLoadPosition::TensionEdge, 450.0,
        );
        assert!(trekzijde.contains("− 0,5 · 450 = 5175 mm"), "{trekzijde}");
    }

    /// Kiptoets uit: niet van toepassing, geen UC, met de reden en het
    /// normartikel in de notitie — nooit stil.
    #[test]
    fn kip_overgeslagen_staat_als_niet_van_toepassing_met_reden() {
        let snap = ForceStateSnapshot {
            combination_id: 1,
            position_mm: 3000.0,
            forces: InternalForces { n_ed: -10.0, my_ed: 40.0, ..Default::default() },
        };
        let k = kip_overgeslagen_drukzijde_gesteund(&sectie(), snap);
        assert_eq!(k.id, "6.3.3_beam_stability");
        assert!(matches!(k.status, CheckStatus::NotApplicable));
        assert!(k.uc.is_none());
        assert_eq!(k.notes.len(), 1);
        assert!(k.notes[0].contains("6.3.3(5)"), "{}", k.notes[0]);
        assert!(k.notes[0].contains("zijdelings gesteund"), "{}", k.notes[0]);
    }

    fn snap(n: f64, my: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 12,
            position_mm: 3688.0,
            forces: InternalForces { n_ed: n, my_ed: my, ..Default::default() },
        }
    }

    fn kolom_invoer() -> ColumnStabilityInput {
        ColumnStabilityInput {
            kniklengte_y: Kniklengte::opgegeven("y", 6342.0, true),
            kniklengte_z: Kniklengte::opgegeven("z", 1268.0, false),
            f_c0k_mpa: 21.0,
            e0_05_mpa: 7400.0,
            beta_c: 0.2,
            f_c0d_mpa: 12.923,
            f_myd_mpa: 14.769,
            f_mzd_mpa: 16.149,
            k_m: 0.7,
        }
    }

    #[test]
    fn slankheden_referentie_staaf2() {
        // lambda_y = 6342/129,9 = 48,82; lambda_z = 1268/27,7 = 45,77.
        let s = sectie();
        assert_relative_eq!(slenderness(6342.0, s.radius_y_mm), 48.82, max_relative = 1e-3);
        assert_relative_eq!(slenderness(1268.0, s.radius_z_mm), 45.77, max_relative = 1e-3);
        // lambda_rel,y = 0,828; lambda_rel,z = 0,776.
        assert_relative_eq!(lambda_rel(48.821, 21.0, 7400.0), 0.828, max_relative = 1e-3);
        assert_relative_eq!(lambda_rel(45.755, 21.0, 7400.0), 0.776, max_relative = 1e-3);
    }

    #[test]
    fn instabiliteits_en_knikfactoren_referentie() {
        // k_y = 0,90 → k_c,y = 0,81; k_z = 0,85 → k_c,z = 0,84.
        let k_y = k_factor(0.8278, 0.2);
        assert_relative_eq!(k_y, 0.895, max_relative = 2e-3);
        assert_relative_eq!(k_c(k_y, 0.8278), 0.81, max_relative = 3e-3);
        let k_z = k_factor(0.7758, 0.2);
        assert_relative_eq!(k_z, 0.849, max_relative = 2e-3);
        assert_relative_eq!(k_c(k_z, 0.7758), 0.84, max_relative = 3e-3);
    }

    #[test]
    fn kolomtoets_referentie_staaf2() {
        // (6.23) = 1,64 (maatgevend); (6.24) = 1,18.
        let r = check_column_stability(&sectie(), &kolom_invoer(), snap(-57.64, 72.170));
        let iv = |sym: &str| {
            r.intermediate_values
                .iter()
                .find(|v| v.symbol == sym)
                .unwrap_or_else(|| panic!("tussenwaarde {sym} ontbreekt"))
                .value
        };
        assert_relative_eq!(iv("(6.23)"), 1.64, max_relative = 5e-3);
        assert_relative_eq!(iv("(6.24)"), 1.18, max_relative = 5e-3);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 1.64, max_relative = 5e-3);
        assert_eq!(r.status, CheckStatus::NotOk);
    }

    #[test]
    fn kolomtoets_referentie_staaf1() {
        // Staaf 1 (gereconstrueerd uit de UC-tabel): L_cr = 3313 om beide assen,
        // N = -92,812 kN, M = -66,964 kNm → (6.24) maatgevend = 1,74.
        let invoer = ColumnStabilityInput {
            kniklengte_y: Kniklengte::opgegeven("y", 3313.0, true),
            kniklengte_z: Kniklengte::opgegeven("z", 3313.0, false),
            ..kolom_invoer()
        };
        let r = check_column_stability(&sectie(), &invoer, snap(-92.812, -66.964));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 1.74, max_relative = 5e-3);
    }

    #[test]
    fn kolomtoets_nvt_zonder_druk() {
        let r = check_column_stability(&sectie(), &kolom_invoer(), snap(10.0, 72.170));
        assert_eq!(r.status, CheckStatus::NotApplicable);
    }

    #[test]
    fn lage_slankheid_gebruikt_kwadratische_drukterm() {
        // Zeer korte kniklengten → lambda_rel <= 0,3 → (6.19)/(6.20).
        let invoer = ColumnStabilityInput {
            kniklengte_y: Kniklengte::opgegeven("y", 300.0, true),
            kniklengte_z: Kniklengte::opgegeven("z", 100.0, false),
            ..kolom_invoer()
        };
        let r = check_column_stability(&sectie(), &invoer, snap(-57.64, 0.0));
        assert!(r.article.contains("6.19"));
        // (sigma_c/f_c)² = (1,334/12,923)² = 0,0107.
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.01066, max_relative = 1e-2);
    }

    #[test]
    fn effectieve_kiplengte_tabel_6_1() {
        // Vrij opgelegd, q-last: 0,9·l; puntlast: 0,8·l; constant moment: 1,0·l.
        assert_relative_eq!(effective_length_mm(1268.0, LtbLoadCase::UniformLoad, LtbLoadPosition::CentreOfGravity, 450.0), 1141.2, max_relative = 1e-9);
        assert_relative_eq!(effective_length_mm(1000.0, LtbLoadCase::ConcentratedMidspan, LtbLoadPosition::CentreOfGravity, 450.0), 800.0, max_relative = 1e-9);
        assert_relative_eq!(effective_length_mm(1000.0, LtbLoadCase::ConstantMoment, LtbLoadPosition::CentreOfGravity, 450.0), 1000.0, max_relative = 1e-9);
        // Drukzijde: +2h; trekzijde: −0,5h.
        assert_relative_eq!(effective_length_mm(1000.0, LtbLoadCase::UniformLoad, LtbLoadPosition::CompressionEdge, 450.0), 1800.0, max_relative = 1e-9);
        assert_relative_eq!(effective_length_mm(1000.0, LtbLoadCase::UniformLoad, LtbLoadPosition::TensionEdge, 450.0), 675.0, max_relative = 1e-9);
    }

    #[test]
    fn sigma_m_crit_referentie() {
        // 0,78·96²/(450·1268)·7400 = 93,2 N/mm2.
        let s = sectie();
        assert_relative_eq!(sigma_m_crit_rect_mpa(&s, 1268.0, 7400.0), 93.2, max_relative = 1e-3);
    }

    #[test]
    fn lambda_rel_m_en_k_crit_referentie() {
        // lambda_rel,m = sqrt(24/93,2) = 0,507 < 0,75 → k_crit = 1,00.
        let l = lambda_rel_m(24.0, 93.227);
        assert_relative_eq!(l, 0.507, max_relative = 2e-3);
        assert_relative_eq!(k_crit(l), 1.0, max_relative = 1e-9);
    }

    #[test]
    fn k_crit_takken_van_6_34() {
        assert_relative_eq!(k_crit(0.75), 1.0);
        assert_relative_eq!(k_crit(1.0), 0.81, max_relative = 1e-9);
        assert_relative_eq!(k_crit(1.4), 1.56 - 0.75 * 1.4, max_relative = 1e-9);
        assert_relative_eq!(k_crit(2.0), 0.25, max_relative = 1e-9);
    }

    #[test]
    fn kiptoets_referentie_staaf2() {
        // (6.35): (22,3/14,8)² + 1,3/(0,84·12,9) = 2,40.
        let invoer = BeamStabilityInput {
            l_ef_mm: 1268.0,
            l_cr_z_mm: 1268.0,
            f_mk_mpa: 24.0,
            f_c0k_mpa: 21.0,
            e0_05_mpa: 7400.0,
            beta_c: 0.2,
            f_myd_mpa: 14.769,
            f_c0d_mpa: 12.923,
        };
        let r = check_beam_stability(&sectie(), &invoer, snap(-57.64, 72.170));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 2.40, max_relative = 5e-3);
        assert_eq!(r.status, CheckStatus::NotOk);
        let kcrit = r.intermediate_values.iter().find(|v| v.symbol == r"k_{crit}").unwrap().value;
        assert_relative_eq!(kcrit, 1.0, max_relative = 1e-9);
    }

    #[test]
    fn kiptoets_zuivere_buiging_6_33() {
        // Zonder drukkracht geldt (6.33): UC = sigma_m/(k_crit·f_m,d).
        let invoer = BeamStabilityInput {
            l_ef_mm: 1268.0,
            l_cr_z_mm: 1268.0,
            f_mk_mpa: 24.0,
            f_c0k_mpa: 21.0,
            e0_05_mpa: 7400.0,
            beta_c: 0.2,
            f_myd_mpa: 14.769,
            f_c0d_mpa: 12.923,
        };
        let r = check_beam_stability(&sectie(), &invoer, snap(0.0, 72.170));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 22.2747 / 14.769, max_relative = 1e-3);
        assert!(r.article.contains("6.33"));
    }
}
