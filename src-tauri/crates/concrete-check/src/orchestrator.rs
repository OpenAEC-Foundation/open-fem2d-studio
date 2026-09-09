//! Orchestrator: neem ConcreteBeamCheckInput, voer de EN 1992-toetsen uit,
//! lever ConcreteBeamCheckResult met volledige afleiding.
//!
//! # Welke toetsen er in het rapport komen
//!
//! | § | toets | bron |
//! |---|-------|------|
//! | 6.1 | buiging met de rechthoekige spanningsverdeling | [`nen_en_1992_1_1::checks`] |
//! | 6.1 | buiging met normaalkracht (M-N-κ) | idem |
//! | 6.2 | dwarskracht | [`nen_en_1992_1_1::dwarskracht`] |
//! | 7.3.2 | minimumwapening voor scheurbeheersing | [`nen_en_1992_1_1::scheurwijdte`] |
//! | 7.3.4 | scheurwijdte, berekend | idem |
//! | 7.4.2 | slankheid l/d | [`nen_en_1992_1_1::slankheid`] |
//! | 9.2.1, 9.2.2, 8.2 | negen detailleringseisen | [`nen_en_1992_1_1::detaillering`] |
//!
//! # Een toets die niet kan, zegt dat
//!
//! Elke toets waarvoor een gegeven ontbreekt — geen beugelafstand, geen
//! frequente BGT-combinatie, geen milieuklasse, geen constructievorm — komt
//! als [`CheckStatus::NotApplicable`] in `checks` te staan, met de reden als
//! eerste `note`. Hij wordt dus NIET overgeslagen en NIET groen gemeld. De
//! rapportlaag drukt zo'n toets af met "N/A" en de reden eronder.
//!
//! Dat betekent wel dat een N/A-toets niet meetelt in `uc_max` (zie
//! [`uc_of`]): er is geen unity check om mee te tellen. Een staaf waarvan de
//! dwarskrachttoets niet kon worden afgerekend, kan dus `uc_max ≤ 1` houden.
//! De reden staat in het rapport; het getal kan niet liegen over iets wat
//! niet is uitgerekend.
//!
//! # Wat "maatgevend" hier betekent
//!
//! `governing_check_id` en `uc_max` wijzen de toets aan die de staaf
//! BEGRENST. Een detailleringseis waaraan wordt VOLDAAN begrenst niets — hij
//! is een uitvoeringsregel, geen draagvermogen — en doet daarom niet mee aan
//! die keuze; faalt hij, dan doet hij wél mee. Zie `mag_maatgevend_zijn`.
//! Alle toetsen blijven onverkort in `checks` staan.
//!
//! # De twee grenstoestanden naast elkaar
//!
//! `forces_envelope` is de UGT-envelop en voedt §6.1, §6.2, §7.4.2 en §9.2.
//! `sls_frequent_envelope` is de FREQUENTE BGT-combinatie (NEN-EN 1990
//! (6.15)) en voedt uitsluitend §7.3 — de nationale bijlage bij 7.3.1(5)
//! schrijft die combinatie voor waar de EN-tekst de quasi-blijvende noemt.
//! De twee worden nergens door elkaar gehaald.

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::checks::{check_bending_stress_block, check_mn_kappa};
use nen_en_1992_1_1::detaillering::{
    benodigde_trekwapening_mm2, detailleringstoetsen, is_detailleringstoets, DetailleringInvoer,
};
use nen_en_1992_1_1::dwarskracht::{check_shear, shear_resistance, ShearOptions, Spoor};
use nen_en_1992_1_1::mnkappa::{
    axial_compression_capacity_kn, axial_tension_capacity_kn, interaction_diagram,
    mn_kappa_diagram, MnKappaOptions,
};
use nen_en_1992_1_1::scheurwijdte::{
    check_minimumwapening, check_scheurwijdte_berekend, Belastingsduur, Rekverdeling,
    Scheurgegevens, Scheurinvoer, COMBINATIE_SCHEURWIJDTE,
};
use nen_en_1992_1_1::slankheid::{check_span_depth_ratio, SlendernessRequest};
use nen_en_1992_1_1::stiffness::kappa_from_nm;
use nen_en_1992_1_1::{
    concrete_class_by_name, reinforcement_grade_by_name, ConcreteClass, ConcreteSection,
    ConcreteSectionInput, ConcreteTension, DesignMaterial, NonlinearBasis, ReinforcementCage,
    ReinforcementGrade,
};
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use steel_check::{CheckKind, NamedCheck};

use crate::input::{ConcreteBeamCheckInput, MnKappaRequest};
use crate::result::{ConcreteBeamCheckResult, MnKappaResponse};

/// Zoek het envelop-punt dat `score` maximaliseert — zelfde aanpak als de
/// staal- en hout-orchestrator.
fn governing_for<F>(env: &[ForcePoint], score: F) -> ForcePoint
where
    F: Fn(&InternalForces) -> f64,
{
    if env.is_empty() {
        return ForcePoint { combination_id: 0, position_mm: 0.0, forces: Default::default() };
    }
    let mut best = env[0];
    let mut best_score = score(&best.forces);
    for p in &env[1..] {
        let s = score(&p.forces);
        if s > best_score {
            best = *p;
            best_score = s;
        }
    }
    best
}

fn make_resistance(check: ResistanceCalc) -> NamedCheck {
    NamedCheck { id: check.id.clone(), kind: CheckKind::Resistance(check) }
}

fn uc_of(c: &NamedCheck) -> f64 {
    match &c.kind {
        CheckKind::Resistance(r) => {
            if matches!(r.status, CheckStatus::NotApplicable) {
                0.0
            } else {
                r.uc.as_ref().map(|u| u.uc).unwrap_or(0.0)
            }
        }
        CheckKind::Stability(s) => {
            if matches!(s.status, CheckStatus::NotApplicable) {
                0.0
            } else {
                s.uc.as_ref().map(|u| u.uc).unwrap_or(0.0)
            }
        }
    }
}

/// Faalt deze toets? Alleen [`CheckStatus::NotOk`] telt als falen; N/A is
/// "niet uitgerekend" en Ok is "voldoet".
fn faalt(c: &NamedCheck) -> bool {
    match &c.kind {
        CheckKind::Resistance(r) => matches!(r.status, CheckStatus::NotOk),
        CheckKind::Stability(s) => matches!(s.status, CheckStatus::NotOk),
    }
}

/// Mag deze toets de MAATGEVENDE toets van de staaf worden?
///
/// # Wat "maatgevend" moet betekenen
///
/// Maatgevend is de toets die de staaf BEGRENST: die aanwijst waar het
/// ontwerp tegenaan loopt en wat er dus moet veranderen als de belasting
/// omhoog gaat. Een sterkte- of bruikbaarheidstoets doet dat altijd — zijn
/// unity check is belasting gedeeld door capaciteit, en 0,63 zegt dat er nog
/// 37 % capaciteit over is.
///
/// Een DETAILLERINGSEIS zegt iets heel anders. Hij vergelijkt een aanwezige
/// maat met een voorgeschreven maat: een uitvoeringsregel, geen grens aan het
/// draagvermogen. Bij een MINIMUM-eis wordt die vergelijking als "vereist
/// gedeeld door aanwezig" uitgedrukt zodat "te weinig" opnieuw uc > 1 geeft
/// (zie de moduledoc van [`nen_en_1992_1_1::detaillering`]) — maar dat maakt
/// de uitkomst nog geen benuttingsgraad. De minimumdiameter van een beugel
/// (NB §9.2.2(9): ten minste Ø5) levert met de gebruikelijke Ø8 een uc van
/// 5/8 = 0,625, en die 0,625 is geen reserve maar de mate waarin de eis is
/// overtroffen. Zo'n eis mocht tot nu toe met 0,625 de maatgevende toets van
/// een hele balk worden zodra de sterktetoetsen daar onder lagen — bij deze
/// balk al vanaf een beugelafstand onder 187,5 mm, want dan zakt ook
/// s_l,max = s/300 onder 0,625. Voor de constructeur wees het rapport dan een
/// eis aan waaraan hij ruim voldoet, terwijl de werkelijke grens elders lag.
///
/// # De regel
///
/// Een detailleringseis doet niet mee aan de KEUZE zolang hij VOLDOET, en wél
/// zodra hij FAALT: een korf die niet aan §8.2 of §9.2 voldoet is niet uit te
/// voeren zoals hij is getekend, en dát begrenst het ontwerp wel degelijk.
///
/// De toets zelf blijft onveranderd in `checks` staan, met zijn unity check,
/// zijn status en zijn afleiding. Er verdwijnt geen informatie; alleen de
/// rangschikking verandert. En omdat een falende eis blijft meetellen, kan
/// `uc_max` nooit onder 1 zakken terwijl een detailleringseis wordt
/// overschreden — de staaf blijft dan NotOk.
///
/// Staal, hout en kruislaaghout kennen deze vraag niet: die kernen toetsen
/// uitsluitend sterkte, stabiliteit en doorbuiging, en dat zijn stuk voor
/// stuk toetsen die de staaf begrenzen. Hun aggregatielus blijft dus zoals
/// hij is; er komt hier geen vierde eigen regel bij, alleen een filter op de
/// ene toetssoort die zij niet hebben.
fn mag_maatgevend_zijn(c: &NamedCheck) -> bool {
    !is_detailleringstoets(&c.id) || faalt(c)
}

/// Het resultaat waarin alleen de reden staat. De doorsnede kán hier
/// onbouwbaar zijn — een T zonder lijfbreedte bijvoorbeeld — dus de naam en de
/// hoogte komen uit de INVOER en niet uit een doorsnede die er niet is.
fn error_result(input: &ConcreteBeamCheckInput, fout: String) -> ConcreteBeamCheckResult {
    ConcreteBeamCheckResult {
        beam_id: input.beam_id,
        section_name: input.section.name(),
        // Er is geen bouwbare doorsnede, dus er zijn ook geen vormaannamen om
        // mee te geven. Ze uit de INVOER afleiden zou aannamen tonen bij een
        // doorsnede die niet bestaat.
        shape_assumptions: Vec::new(),
        concrete_class: input.concrete_class.clone(),
        reinforcement_grade: input.reinforcement_grade.clone(),
        reinforcement_summary: input.cage.summary(),
        a_s_bottom_mm2: input.cage.a_s_bottom_mm2(),
        a_s_top_mm2: input.cage.a_s_top_mm2(),
        d_mm: input.cage.d_mm(input.section.h_mm),
        f_cd_mpa: 0.0,
        f_yd_mpa: 0.0,
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::NotApplicable,
        governing_check_id: format!("ERROR: {fout}"),
        mn_kappa: None,
        interaction_positive: vec![],
        interaction_negative: vec![],
    }
}

/// Materiaal en geometrie uit de invoer; `Err` met een leesbare reden.
///
/// De betonklasse en de staalsoort komen er ZELF ook uit en niet alleen als
/// [`DesignMaterial`]: §7.3 heeft f_ctm en E_cm nodig (tabel 3.1) en §9.2.1.1
/// heeft f_ctm nodig, en `DesignMaterial` draagt die niet.
fn setup(
    section: &ConcreteSectionInput,
    concrete_class: &str,
    reinforcement_grade: &str,
    cage: &ReinforcementCage,
    situation: nen_en_1992_1_1::DesignSituation,
    branch: nen_en_1992_1_1::SteelBranch,
) -> Result<
    (
        ConcreteSection,
        DesignMaterial,
        &'static ConcreteClass,
        &'static ReinforcementGrade,
    ),
    String,
> {
    let section = section.build()?;
    let beton = concrete_class_by_name(concrete_class)
        .ok_or_else(|| format!("betonsterkteklasse {concrete_class} onbekend"))?;
    let staal = reinforcement_grade_by_name(reinforcement_grade)
        .ok_or_else(|| format!("wapeningsstaal {reinforcement_grade} onbekend"))?;
    cage.validate(&section)?;
    Ok((
        section,
        DesignMaterial::new(beton, staal, situation, branch),
        beton,
        staal,
    ))
}

// ═══════════════════════════════════════════════════════════════════════════
// Een toets die niet kan
// ═══════════════════════════════════════════════════════════════════════════

/// De twee toetsen van §7.3 die deze orchestrator uitvoert, met hun id, titel
/// en artikelverwijzing. Ze staan hier apart omdat ze ook als "niet
/// uitgevoerd" in het rapport moeten kunnen verschijnen, met exact dezelfde
/// id en titel als wanneer ze wél lopen — anders zou een rapport twee
/// verschillende namen voor dezelfde toets tonen.
const SCHEURTOETSEN: [(&str, &str, &str); 2] = [
    (
        "7.3.2_minimumwapening",
        "Minimumwapening voor scheurbeheersing",
        "art. 7.3.2(2) (7.1), (7.2) en (7.4)",
    ),
    (
        "7.3.4_scheurwijdte",
        "Scheurwijdte",
        "art. 7.3.4 (7.8)-(7.11), met de NB-bovengrens op (7.11)",
    ),
];

/// Idem voor §7.4.2.
const SLANKHEIDSTOETS: (&str, &str, &str) = (
    "7.4.2_slankheid",
    "Doorbuiging - grenswaarde van de slankheid l/d",
    "art. 7.4.2(2) (7.16), tabel 7.4N",
);

/// De reden bij een ontbrekende milieuklasse. Eén tekst, want hij komt bij
/// beide scheurtoetsen terug.
const GEEN_MILIEUKLASSE: &str =
    "de milieuklasse van tabel 4.1 is niet opgegeven. De nationale bijlage bij 7.3.1(5)      vervangt tabel 7.1N, en die tabel heeft de milieuklasse als enige ingang voor w_max;      er is met opzet geen standaardklasse, want die zou een scheurwijdte kunnen goedkeuren      die bij het werkelijke milieu veel te groot is.";

/// Een [`NamedCheck`] die alleen een reden draagt: dit gegeven ontbreekt, dus
/// deze toets is niet uitgevoerd.
///
/// Hij staat met opzet in `checks` en niet in een aparte lijst: dan verschijnt
/// hij vanzelf in de toetstabel van het rapport, met status "N/A" en de reden
/// eronder, op de plaats waar de lezer hem verwacht. Overslaan zou betekenen
/// dat een lege regel in het rapport niet te onderscheiden is van een toets
/// die wél is gedaan en slaagde.
fn niet_uitgevoerd(
    id: &str,
    title: &str,
    article: &str,
    force_state: ForceStateSnapshot,
    reden: String,
) -> NamedCheck {
    make_resistance(ResistanceCalc {
        id: id.to_string(),
        title: title.to_string(),
        article: article.to_string(),
        force_state,
        formula_latex: String::new(),
        variables: vec![],
        deelstappen: vec![],
        value: 0.0,
        unit: String::new(),
        uc: None,
        status: CheckStatus::NotApplicable,
        notes: vec![reden],
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// De gescheurde doorsnede in de BGT — waar sigma_s vandaan komt
// ═══════════════════════════════════════════════════════════════════════════

/// De toestand van de GESCHEURDE doorsnede onder de frequente combinatie.
///
/// §7.3.4(2) vraagt sigma_s "uitgaande van een gescheurde doorsnede". Dat is
/// geen getal dat deze orchestrator verzint: het komt uit dezelfde
/// M-N-kappa-motor die de rest van de crate gebruikt, met
///
/// * (3.14) van 3.1.5 op **gemiddelde** waarden (f_cm, E_cm) — de basis die
///   3.1.5/7.4.3 voor de bruikbaarheidsgrenstoestand voorschrijft, en dus NIET
///   de rekenwaarden van de uiterste grenstoestand;
/// * betontrek **verwaarloosd** ([`ConcreteTension::None`]) — precies wat
///   "volledig gescheurd" in 7.4.3(3) betekent en wat 7.3.4 bedoelt;
/// * phi_ef = 0, dus zonder kruip. Kruip verlaagt E_c, verhoogt de drukzone en
///   VERLAAGT sigma_s; zonder kruip rekenen is hier dus de veilige kant.
struct BgtToestand {
    /// Het maatgevende punt uit de frequente envelop.
    punt: ForcePoint,
    /// sigma_s in de meest getrokken wapeningslaag, N/mm², trek positief.
    sigma_s_mpa: f64,
    /// Hoogte van de drukzone x vanaf de meest gedrukte rand, mm.
    x_mm: f64,
    /// Trekrek aan de boven- en onderrand (positief = trek). Bepaalt of er
    /// sprake is van buiging of van excentrische trek, zie (7.13).
    eps_trek_boven: f64,
    eps_trek_onder: f64,
    /// Ligt de trekzone onder?
    trek_onder: bool,
}

fn bgt_toestand(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    beton: &ConcreteClass,
    staal: &ReinforcementGrade,
    input: &ConcreteBeamCheckInput,
) -> Result<BgtToestand, String> {
    if input.sls_frequent_envelope.is_empty() {
        return Err(format!(
            "er is geen krachtsverloop onder de frequente BGT-combinatie meegestuurd. \
             §7.3 vraagt de staalspanning in de gescheurde doorsnede onder de \
             {COMBINATIE_SCHEURWIJDTE}; die is uit de UGT-envelop niet af te leiden. Reken \
             NEN-EN 1990 uitdrukking (6.15) door en stuur het krachtsverloop mee in \
             `sls_frequent_envelope`. Er wordt hier met opzet geen UGT-spanning voor in de \
             plaats gezet: dat zou een andere en een verkeerde toets zijn."
        ));
    }

    // Hetzelfde criterium als bij de buigtoets: het grootste |M| beslist, met
    // de normaalkracht als scheidsrechter. De scheurwijdte loopt met sigma_s
    // mee en sigma_s met M, dus dit is ook het punt met de grootste
    // scheurwijdte.
    let punt = governing_for(&input.sls_frequent_envelope, |f| {
        f.my_ed.abs() + f.n_ed.abs() * 0.01
    });
    let m_knm = punt.forces.my_ed;
    let n_kn = punt.forces.n_ed;

    let mat_bgt = DesignMaterial::nonlinear(
        beton,
        staal,
        input.design_situation,
        input.steel_branch,
        NonlinearBasis::MeanValues,
        0.0,
    )
    .with_concrete_tension(ConcreteTension::None);

    let layers = cage.layers(section.h_mm);
    let opts = MnKappaOptions { n_strips: input.n_strips.max(1) as usize };
    let k = kappa_from_nm(section, &layers, &mat_bgt, n_kn, m_knm, &opts).map_err(|e| {
        format!(
            "de gescheurde doorsnede is onder de frequente combinatie (M = {m_knm:.1} kNm, \
             N = {n_kn:.1} kN) niet op te lossen: {e}. Zonder die oplossing is er geen \
             sigma_s, en er wordt niets aangenomen."
        )
    })?;

    // De crate rekent inwendig met DRUK POSITIEF; de trekspanning is dus −sigma.
    let sigma_s = k.state.sigma_s.iter().fold(0.0_f64, |m, &s| m.max(-s));
    Ok(BgtToestand {
        punt,
        sigma_s_mpa: sigma_s,
        // `x_mm` is `None` als de hele doorsnede onder trek staat; de drukzone
        // is dan nul, en dat is precies wat (h − x)/3 in h_c,ef nodig heeft.
        x_mm: k.state.x_mm.unwrap_or(0.0),
        eps_trek_boven: -k.state.eps_top,
        eps_trek_onder: -k.state.eps_bottom,
        trek_onder: m_knm >= 0.0,
    })
}

/// Hart-op-hartafstand van de staven in de TREKrij, afgeleid uit de korf.
///
/// **Zuivere meetkunde, geen normregel.** Eén rij, gelijkmatig verdeeld tussen
/// de beugelbenen: de buitenste staafassen liggen op c_nom + Ø_beugel + Ø/2
/// van hun eigen zijkant, dus
///
/// ```text
///   s = (b(z) − 2·(c_nom + Ø_beugel) − Ø) / (n − 1)
/// ```
///
/// Dit is dezelfde meetkunde die [`nen_en_1992_1_1::detaillering`] voor de
/// vrije afstand van §8.2(2) gebruikt (s = a_vrij + Ø); ze uiteen laten lopen
/// zou betekenen dat twee toetsen van dezelfde korf een andere staafafstand
/// zien. Bij één staaf in de rij is er geen afstand: dan `None`, en valt
/// 7.3.4 terug op (7.14) — precies zoals de module dat bedoelt.
fn staafafstand_uit_korf_mm(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    trek_onder: bool,
) -> Option<f64> {
    let rij = if trek_onder { &cage.bottom } else { &cage.top };
    if rij.count < 2 || rij.diameter_mm <= 0.0 {
        return None;
    }
    let z = if trek_onder {
        cage.axis_offset_mm(rij)
    } else {
        section.h_mm - cage.axis_offset_mm(rij)
    };
    let binnen = section.width_at_mm(z) - 2.0 * (cage.cover_mm + cage.stirrup_diameter_mm);
    let s = (binnen - rij.diameter_mm) / (rij.count as f64 - 1.0);
    if s > 0.0 {
        Some(s)
    } else {
        None
    }
}

pub fn check_concrete_beam(input: ConcreteBeamCheckInput) -> ConcreteBeamCheckResult {
    let (section, mat, beton, staal) = match setup(
        &input.section,
        &input.concrete_class,
        &input.reinforcement_grade,
        &input.cage,
        input.design_situation,
        input.steel_branch,
    ) {
        Ok(v) => v,
        Err(e) => return error_result(&input, e),
    };
    let opts = MnKappaOptions { n_strips: input.n_strips.max(1) as usize };
    let layers = input.cage.layers(section.h_mm);

    // Maatgevende krachtspunten. Buiging: grootste |M| (met N als
    // scheidsrechter). M-N: daarnaast het punt met de grootste druk — bij
    // een kolom kan dát maatgevend zijn door de minimale excentriciteit.
    let gov_bending = governing_for(&input.forces_envelope, |f| f.my_ed.abs() + f.n_ed.abs() * 0.01);
    let gov_compression =
        governing_for(&input.forces_envelope, |f| if f.n_ed < 0.0 { f.n_ed.abs() } else { 0.0 });
    let bend_state = ForceStateSnapshot::from_point(&gov_bending);
    let comp_state = ForceStateSnapshot::from_point(&gov_compression);

    let mut checks: Vec<NamedCheck> = Vec::new();

    // 1. Buiging met de rechthoekige spanningsverdeling (handberekening).
    checks.push(make_resistance(check_bending_stress_block(&section, &input.cage, &mat, bend_state)));

    // 2. M-N-κ op het buigpunt, en op het drukpunt als dat een ander punt is;
    //    de zwaarste van de twee telt.
    let mut mn = check_mn_kappa(&section, &input.cage, &mat, &opts, input.apply_min_eccentricity, bend_state);
    let ander_punt = gov_compression.forces.n_ed < 0.0
        && (gov_compression.position_mm != gov_bending.position_mm
            || gov_compression.combination_id != gov_bending.combination_id);
    if ander_punt {
        let mn2 = check_mn_kappa(&section, &input.cage, &mat, &opts, input.apply_min_eccentricity, comp_state);
        let uc1 = mn.calc.uc.as_ref().map(|u| u.uc).unwrap_or(0.0);
        let uc2 = mn2.calc.uc.as_ref().map(|u| u.uc).unwrap_or(0.0);
        if uc2 > uc1 {
            mn = mn2;
        }
    }
    let diagram = mn.diagram.clone();
    checks.push(make_resistance(mn.calc));

    // ── 3. Dwarskracht (§6.2) ──────────────────────────────────────────────
    //
    // Eigen maatgevend punt: de grootste |V_Ed|. Dat is bijna nooit het punt
    // met het grootste moment — bij een ligger op twee steunpunten liggen ze
    // precies aan weerskanten van de staaf. De dwarskracht op het buigpunt
    // toetsen zou de toets stilzwijgend op het gunstigste punt uitvoeren.
    let gov_shear = governing_for(&input.forces_envelope, |f| f.vz_ed.abs());
    let shear_state = ForceStateSnapshot::from_point(&gov_shear);
    // Geen enkele optie ingevuld: A_sl uit de korf, cot θ automatisch binnen
    // de NB-grenzen, z = 0,9·d (alleen zonder normaalkracht) en géén
    // vermindering volgens 6.2.2(6) — voor die laatste heeft een doorsnedetoets
    // de gegevens niet, en niet toepassen is de veilige kant. De module meldt
    // elk van die keuzes zelf in haar afleiding.
    let shear_opts = ShearOptions::default();
    // Twee aanroepen op dezelfde gegevens: de eerste levert de uitkomst waar
    // §9.2.2 op leunt (welk spoor, en V_Rd,max voor de tak van s_t,max), de
    // tweede de toets zoals het rapport hem toont. Dezelfde invoer, dus
    // dezelfde uitkomst; er is hier geen tweede rekengang.
    let sr = shear_resistance(&section, &input.cage, &mat, &shear_state, &shear_opts);
    let mut shear_calc = check_shear(&section, &input.cage, &mat, shear_state, &shear_opts);
    // WELK PUNT ER IS GETOETST, MET HET MOMENT ERBIJ — en dat laatste is geen
    // opsmuk. De dwarskrachtmodule leest aan het TEKEN van M_Ed af welke rij op
    // trek staat, en daarmee zowel d als A_sl. Bij een vrij opgelegde ligger is
    // het moment bij het steunpunt nul, en dan beslist het laatste cijfer van
    // de oplosser (−1·10⁻¹⁴ is negatief) welke rij dat wordt. Dat is de VEILIGE
    // kant — de kleinste A_sl geeft de laagste V_Rd,c — maar de lezer hoort te
    // kunnen zien dat het moment daar nul was, in plaats van zich af te vragen
    // waarom de bovenwapening meetelt.
    shear_calc.notes.push(format!(
        "Getoetst op combinatie {} op x = {} mm: V_Ed = {:.1} kN, M_Ed = {:.1} kNm, \
         N_Ed = {:.1} kN. Dat is het punt met de grootste |V_Ed| uit de UGT-omhullende, en \
         dus niet het punt van de buigtoets. Ligt M_Ed hier op nul, zoals bij het steunpunt \
         van een vrij opgelegde ligger, dan is de trekzijde uit het moment niet te bepalen en \
         volgt de toets het teken dat de oplosser levert; de rij die daarbij wordt gekozen \
         staat hierboven bij A_sl. Geef A_sl zelf op als de werkelijke doorlopende \
         trekwapening daarvan afwijkt.",
        gov_shear.combination_id,
        gov_shear.position_mm.round() as i64,
        gov_shear.forces.vz_ed,
        gov_shear.forces.my_ed,
        gov_shear.forces.n_ed,
    ));
    checks.push(make_resistance(shear_calc));

    // ── 4. Scheurbeheersing (§7.3) ─────────────────────────────────────────
    //
    // Dit is de enige plaats in de hele toetsing waar de BRUIKBAARHEIDS-
    // grenstoestand meedoet, en wel met de FREQUENTE combinatie (6.15) die de
    // nationale bijlage bij 7.3.1(5) voorschrijft.
    let bgt = bgt_toestand(&section, &input.cage, beton, staal, &input);
    let scheur_state = match &bgt {
        Ok(b) => ForceStateSnapshot::from_point(&b.punt),
        // Er is geen BGT-punt; het krachtenpunt van de buigtoets zet de
        // N/A-melding tenminste bij de juiste doorsnede in het rapport.
        Err(_) => bend_state,
    };
    let scheur_reden: Option<String> = match (input.exposure_class, &bgt) {
        (Some(_), Ok(_)) => None,
        (None, Ok(_)) => Some(GEEN_MILIEUKLASSE.to_string()),
        (Some(_), Err(e)) => Some(e.clone()),
        (None, Err(e)) => Some(format!(
            "er ontbreken twee gegevens. (1) {GEEN_MILIEUKLASSE} (2) En {e}"
        )),
    };
    match scheur_reden {
        Some(reden) => {
            for (id, title, article) in SCHEURTOETSEN {
                checks.push(niet_uitgevoerd(id, title, article, scheur_state, reden.clone()));
            }
        }
        None => {
            // Beide zijn hier per constructie gevuld; de `match` hierboven
            // heeft elk ander geval al afgevangen.
            let b = bgt.as_ref().expect("scheur_reden is None, dus bgt is Ok");
            let klasse = input.exposure_class.expect("scheur_reden is None, dus er is een klasse");

            let (staafafstand, s_bron) = match input.bar_spacing_mm {
                Some(s) => (Some(s), format!("opgegeven: s = {s:.0} mm")),
                None => match staafafstand_uit_korf_mm(&section, &input.cage, b.trek_onder) {
                    Some(s) => (
                        Some(s),
                        format!(
                            "afgeleid uit de korf: s = {s:.0} mm (zuivere meetkunde — één rij, \
                             gelijkmatig verdeeld tussen de beugelbenen; dit staat niet zo in de \
                             norm)"
                        ),
                    ),
                    None => (
                        None,
                        "niet bekend: de trekrij telt minder dan twee staven. (7.11) is dan niet \
                         te gebruiken en 7.3.4 valt terug op (7.14)"
                            .to_string(),
                    ),
                },
            };

            let mut inv =
                Scheurinvoer::buiging(b.sigma_s_mpa, b.x_mm, klasse, Belastingsduur::Langdurend);
            // (7.4) vraagt N_Ed met DRUK POSITIEF; de envelop levert trek
            // positief. Deze omkering staat op één plaats en nergens anders.
            inv.n_ed_druk_positief_n = -b.punt.forces.n_ed * 1e3;
            inv.axiale_trek = b.punt.forces.n_ed > 0.0;
            inv.trek_onder = b.trek_onder;
            inv.staafafstand_mm = staafafstand;
            // k_2 volgens (7.13) zodra BEIDE randen onder trek staan — dan is
            // het excentrische trek en niet buiging, en is k_2 = 0,5 te
            // gunstig (k_2 staat in de teller van (7.11)). Welke van de twee
            // het is, volgt uit de randrekken van de gescheurde doorsnede en
            // is dus mechanica, geen keuze.
            if b.eps_trek_boven > 0.0 && b.eps_trek_onder > 0.0 {
                inv.rekverdeling = Rekverdeling::ExcentrischeTrek {
                    eps_1: b.eps_trek_boven.max(b.eps_trek_onder),
                    eps_2: b.eps_trek_boven.min(b.eps_trek_onder),
                };
            }

            let g = Scheurgegevens {
                section: &section,
                cage: &input.cage,
                beton,
                staal,
                invoer: &inv,
            };
            // Waar sigma_s vandaan komt, hoort in de afleiding te staan en niet
            // alleen in deze code: anders leest een constructeur een
            // scheurwijdte zonder te zien onder welke belasting hij hoort.
            let herkomst = vec![
                format!(
                    "sigma_s en x komen uit de GESCHEURDE doorsnede onder de {}: combinatie {} \
                     op x = {} mm, M = {:.1} kNm en N = {:.1} kN (trek positief) geven \
                     sigma_s = {:.1} N/mm² en x = {:.1} mm. Gerekend met (3.14) van 3.1.5 op \
                     gemiddelde waarden (f_cm, E_cm), betontrek verwaarloosd en zonder kruip \
                     (phi_ef = 0); kruip zou x verhogen en sigma_s verlagen, dus dit is de \
                     veilige kant.",
                    COMBINATIE_SCHEURWIJDTE,
                    b.punt.combination_id,
                    b.punt.position_mm.round() as i64,
                    b.punt.forces.my_ed,
                    b.punt.forces.n_ed,
                    b.sigma_s_mpa,
                    b.x_mm,
                ),
                format!(
                    "Hart-op-hartafstand van de trekstaven — {s_bron}. Zij bepaalt of (7.11) \
                     mag worden gebruikt (voorwaarde s <= 5(c + Ø/2)) en of tabel 7.3N te \
                     lezen is."
                ),
                "k_t = 0,4 (langdurende belasting, 7.3.4(2)). De frequente combinatie draagt de \
                 blijvende belasting mee, dus \"een enkele kortdurende belasting\" is hier niet \
                 aan de orde; 0,4 geeft bovendien het grootste rekverschil in (7.9) en dus de \
                 grootste scheurwijdte."
                    .to_string(),
                "k_1 = 0,8: aangenomen is geribd wapeningsstaal (hoge aanhechting). Bijlage C \
                 kent alleen geribde staven, en het staalmodel van deze app draagt geen \
                 oppervlaktetype. Voor een staaf met een in wezen glad oppervlak geldt \
                 k_1 = 1,6 en is deze toets te gunstig."
                    .to_string(),
                "De tabelweg van 7.3.3 (\"zonder directe berekening\") is NIET daarnaast \
                 uitgevoerd. 7.3.3(2) en 7.3.4 zijn alternatieven — hier is de DIRECTE \
                 berekening gemaakt — en ze allebei afrekenen zou een unity check opleveren die \
                 de norm niet vraagt."
                    .to_string(),
            ];
            let mut minimumwapening = check_minimumwapening(&g, None, None, scheur_state);
            let mut scheurwijdte = check_scheurwijdte_berekend(&g, scheur_state);
            minimumwapening.notes.extend(herkomst.iter().cloned());
            scheurwijdte.notes.extend(herkomst);
            checks.push(make_resistance(minimumwapening));
            checks.push(make_resistance(scheurwijdte));
        }
    }

    // ── 5. Slankheid (§7.4.2) ──────────────────────────────────────────────
    let (slank_id, slank_title, slank_article) = SLANKHEIDSTOETS;
    match input.structural_system {
        None => checks.push(niet_uitgevoerd(
            slank_id,
            slank_title,
            slank_article,
            bend_state,
            "de constructievorm van tabel 7.4N is niet opgegeven. Of een staaf een vrij \
             opgelegde ligger, een eind- of tussenveld, een vlakke plaatvloer of een uitkraging \
             is, hangt van de constructie af en niet van de staaf; een raamwerkmodel kent dat \
             onderscheid niet. Zonder K is er geen grenswaarde voor l/d en wordt er niets \
             aangenomen."
                .to_string(),
        )),
        Some(system) => {
            let trek_onder = gov_bending.forces.my_ed >= 0.0;
            let d_mm = if trek_onder {
                input.cage.d_mm(section.h_mm)
            } else {
                section.h_mm - input.cage.d2_mm()
            };
            let a_s_prov = if trek_onder {
                input.cage.a_s_bottom_mm2()
            } else {
                input.cage.a_s_top_mm2()
            };
            match benodigde_trekwapening_mm2(
                &section,
                &input.cage,
                &mat,
                gov_bending.forces.my_ed,
                gov_bending.forces.n_ed,
            ) {
                Err(e) => checks.push(niet_uitgevoerd(
                    slank_id,
                    slank_title,
                    slank_article,
                    bend_state,
                    format!(
                        "de vereiste trekwapening A_s,req is niet te bepalen: {e}. Zonder \
                         A_s,req is er geen wapeningsverhouding rho voor (7.16) en geen (7.17)."
                    ),
                )),
                Ok(a_s_req) => {
                    // rho = A_s,req/(b_w·d). DE NORM ZEGT NIET t.o.v. WELKE
                    // BREEDTE, en de slankheidsmodule kiest daarom niet. Hier
                    // wél, want er moet een getal in: de LIJFbreedte b_w, de
                    // breedte die de doorsnede over haar volle hoogte heeft.
                    // Bij een rechthoek is dat b en is er geen keuze; bij een
                    // T geeft b_w een HOGERE rho dan de flensbreedte en dus
                    // een LAGERE grenswaarde voor l/d — de veilige kant. De
                    // keuze staat hieronder in de afleiding.
                    let b_w = section.b_w_mm();
                    let rho = if b_w > 0.0 && d_mm > 0.0 {
                        a_s_req / (b_w * d_mm)
                    } else {
                        0.0
                    };
                    let req = SlendernessRequest {
                        beam_id: input.beam_id,
                        system,
                        f_ck_mpa: beton.f_ck,
                        span_mm: input.length_m * 1000.0,
                        d_mm,
                        rho,
                        // Drukwapening telt NIET mee in (7.16.b). Dat is de
                        // veilige kant: rho' verhoogt zowel de tweede als de
                        // derde term en dus de grenswaarde. Welk deel van de
                        // bovenwapening rekenkundig VEREIST is, weet deze
                        // orchestrator niet — alleen wat er ligt.
                        rho_prime: 0.0,
                        sigma_s_mpa: None,
                        f_yk_mpa: Some(staal.f_yk),
                        a_s_req_mm2: Some(a_s_req),
                        a_s_prov_mm2: Some(a_s_prov),
                        b_flange_mm: section.b_mm,
                        b_web_mm: b_w,
                        l_eff_mm: None,
                        carries_brittle_partitions: None,
                        n_ed_kn: Some(gov_bending.forces.n_ed),
                    };
                    let mut calc = check_span_depth_ratio(&req, bend_state);
                    calc.notes.push(format!(
                        "rho = A_s,req/(b_w·d) = {a_s_req:.0}/({b_w:.0}·{d_mm:.0}) = {rho:.5}. \
                         A_s,req is de trekwapening die volgens §6.1 nodig is voor het \
                         maatgevende UGT-punt (M = {:.1} kNm, N = {:.1} kN), numeriek omgekeerd \
                         uit de rechthoekige spanningsverdeling. De norm laat in het midden ten \
                         opzichte van welke breedte rho is genomen; hier is de LIJFbreedte b_w \
                         gebruikt — bij een rechthoek is dat b, bij een T geeft het een hogere \
                         rho en dus een lagere grenswaarde voor l/d.",
                        gov_bending.forces.my_ed, gov_bending.forces.n_ed,
                    ));
                    calc.notes.push(format!(
                        "rho' = 0: de drukwapening telt niet mee. Wat er rekenkundig aan \
                         drukwapening VEREIST is, volgt niet uit deze toetsing; er ligt \
                         {:.0} mm² aan de drukzijde. rho' weglaten verlaagt de grenswaarde en is \
                         dus de veilige kant.",
                        if trek_onder {
                            input.cage.a_s_top_mm2()
                        } else {
                            input.cage.a_s_bottom_mm2()
                        }
                    ));
                    checks.push(make_resistance(calc));
                }
            }
        }
    }

    // ── 6. Detaillering (§9.2.1, §9.2.2 en §8.2) ───────────────────────────
    //
    // Negen eisen. Ze leunen op de uitkomst van de dwarskrachttoets hierboven:
    // welke tak van s_l,max geldt hangt ervan af of er rekenkundig
    // dwarskrachtwapening nodig is, en de tak van s_t,max hangt aan
    // V_Ed <= 0,5·V_Rd,max. Die twee komen dus uit `sr` en worden hier niet
    // opnieuw bepaald.
    let detail_invoer = DetailleringInvoer {
        section: &section,
        cage: &input.cage,
        mat: &mat,
        f_ctm_mpa: beton.f_ctm,
        force_state: bend_state,
        d_g_mm: input.aggregate_size_mm,
        dwarskrachtwapening_vereist: Some(matches!(sr.spoor, Spoor::Vakwerkmodel)),
        // De dwarskracht van het maatgevende dwarskrachtpunt, niet die van het
        // buigpunt: s_t,max hoort bij de plaats waar de beugels het zwaarst
        // belast zijn.
        v_ed_kn: Some(gov_shear.forces.vz_ed.abs()),
        // `None` zodra het vakwerkmodel niet kon worden opgebouwd — dan is er
        // geen V_Rd,max en zegt de toets dat, in plaats van in de ruime tak
        // van 500 mm te belanden.
        v_rd_max_kn: sr.vakwerk.as_ref().map(|v| v.v_rd_max_kn),
        blijvend_bekiste_oppervlakken: None,
        dubbel_wapeningsnet: None,
    };
    for c in detailleringstoetsen(&detail_invoer) {
        checks.push(make_resistance(c));
    }

    // 7. Interactiediagrammen voor de weergave (grover: 21 punten).
    let inter_opts = MnKappaOptions { n_strips: opts.n_strips.min(50) };
    let interaction_positive = interaction_diagram(&section, &layers, &mat, 1.0, 21, &inter_opts);
    let interaction_negative = interaction_diagram(&section, &layers, &mat, -1.0, 21, &inter_opts);

    // 8. Aggregatie. De maatgevende toets van een staaf kan de buiging, de
    //    dwarskracht, de scheurwijdte, de slankheid of een FALENDE
    //    detailleringseis zijn. Een detailleringseis waaraan wordt voldaan
    //    doet niet mee: zie [`mag_maatgevend_zijn`] voor het waarom.
    //
    //    `uc_max` volgt dezelfde keuze, en dat moet ook: het rapport zet in de
    //    samenvattingstabel de kolommen "UC" en "Governing" naast elkaar. Zou
    //    uc_max wél de vervulde detailleringseis tonen, dan stond er een
    //    getal van de ene toets naast de naam van een andere. Veilig blijft
    //    het: een detailleringseis die voldoet heeft per definitie uc ≤ 1, dus
    //    deze keuze kan uc_max alleen verlagen binnen het gebied waar de staaf
    //    toch al voldoet — nooit een overschrijding wegpoetsen.
    let mut uc_max = 0.0_f64;
    let mut governing_check_id = String::new();
    for c in &checks {
        let uc = uc_of(c);
        if uc > uc_max && mag_maatgevend_zijn(c) {
            uc_max = uc;
            governing_check_id = c.id.clone();
        }
    }
    let status = if uc_max <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };

    ConcreteBeamCheckResult {
        beam_id: input.beam_id,
        section_name: section.name(),
        // Dezelfde aanroep als in `checks.rs`, dus letterlijk dezelfde teksten
        // als vooraan in de notes van elke toets — één bron, geen tweede versie.
        shape_assumptions: section.assumptions(),
        concrete_class: mat.concrete_name.to_string(),
        reinforcement_grade: mat.steel_name.to_string(),
        reinforcement_summary: input.cage.summary(),
        a_s_bottom_mm2: input.cage.a_s_bottom_mm2(),
        a_s_top_mm2: input.cage.a_s_top_mm2(),
        d_mm: input.cage.d_mm(section.h_mm),
        f_cd_mpa: mat.f_cd(),
        f_yd_mpa: mat.f_yd(),
        checks,
        uc_max,
        status,
        governing_check_id,
        mn_kappa: Some(diagram),
        interaction_positive,
        interaction_negative,
    }
}

pub fn check_all_concrete_beams(inputs: Vec<ConcreteBeamCheckInput>) -> Vec<ConcreteBeamCheckResult> {
    inputs.into_iter().map(check_concrete_beam).collect()
}

/// M-N-κ-diagram en interactiediagram voor een korf, los van een staaf.
pub fn mn_kappa(req: MnKappaRequest) -> Result<MnKappaResponse, String> {
    let (section, mat, _beton, _staal) = setup(
        &req.section,
        &req.concrete_class,
        &req.reinforcement_grade,
        &req.cage,
        req.design_situation,
        req.steel_branch,
    )?;
    let opts = MnKappaOptions { n_strips: req.n_strips.max(1) as usize };
    let layers = req.cage.layers(section.h_mm);
    let diagram = mn_kappa_diagram(&section, &layers, &mat, req.n_ed_kn, req.moment_sign, &opts);
    let (interaction_positive, interaction_negative) = if req.interaction_points >= 3 {
        let inter_opts = MnKappaOptions { n_strips: opts.n_strips.min(50) };
        (
            interaction_diagram(&section, &layers, &mat, 1.0, req.interaction_points as usize, &inter_opts),
            interaction_diagram(&section, &layers, &mat, -1.0, req.interaction_points as usize, &inter_opts),
        )
    } else {
        (vec![], vec![])
    };
    Ok(MnKappaResponse {
        section_name: section.name(),
        reinforcement_summary: req.cage.summary(),
        f_cd_mpa: mat.f_cd(),
        f_yd_mpa: mat.f_yd(),
        d_mm: req.cage.d_mm(section.h_mm),
        a_s_bottom_mm2: req.cage.a_s_bottom_mm2(),
        a_s_top_mm2: req.cage.a_s_top_mm2(),
        n_rd_compression_kn: axial_compression_capacity_kn(&section, &layers, &mat, &opts),
        n_rd_tension_kn: axial_tension_capacity_kn(&layers, &mat),
        diagram,
        interaction_positive,
        interaction_negative,
    })
}
