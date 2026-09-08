//! Het hoofdstuk "Beton — fysisch niet-lineaire tweede orde" in de PDF, mét
//! de vier betonfiguren.
//!
//! # Het bestek
//!
//! Dit hoofdstuk is de papieren tweelingbroer van twee secties van het live
//! rapport:
//!
//! * `design-mockup/src/components/report/sections/BetonStijfheidSection.tsx`
//!   — de uitgangspunten per combinatie, de segmenttabel per staaf, het
//!   convergentieverloop en de meldingen van de kern;
//! * `design-mockup/src/components/report/sections/BetonSection.tsx` — de
//!   doorsnede met de korf, het M-κ-diagram en het N-M-interactiediagram.
//!
//! # Wat woordelijk uit de kern komt en niet mag worden herschreven
//!
//! `creep_note` (de verplichte kruipvermelding), `notes`, de `message` per
//! segment, `segmentation_rule`, `limit_state_label` en de reden bij een
//! overgeslagen staaf worden **letterlijk** overgenomen. Het live rapport zet
//! daar met opzet geen vertaalsleutel omheen; die reden geldt hier net zo
//! goed. Een geklemde waarde die stilzwijgend in de tabel staat, of een
//! kruipvermelding in eigen woorden, is een verzonnen antwoord.
//!
//! # Wanneer het hoofdstuk er staat, en wanneer niet
//!
//! `design-mockup/src/lib/sectieRelevantie.ts` maakt één onderscheid dat hier
//! één op één is overgenomen: **"kan dit model dit ooit vullen" laat een
//! hoofdstuk weg, "is het nu leeg" niet.** Een zuiver stalen rapport krijgt
//! dus geen leeg betonhoofdstuk. Maar een rapport mét betonstaven waarin
//! eerste-orde gerekend is, krijgt het hoofdstuk wél — met de eerlijke melding
//! dat er niet fysisch gerekend is. Dat is een rekenstand, en een rapport dat
//! bij elke druk op Berekenen van omvang verandert is geen document.
//!
//! De PDF-invoer draagt geen model, dus de maat "kan dit ooit" wordt hier
//! afgeleid uit wat er aan betongegevens meekomt: betontoetsingen óf een
//! segmentspoor. Zie [`van_toepassing`].
//!
//! # Waarom er geen omhullende is
//!
//! De stijfheid volgt uit de krachten van één belastingtoestand, dus elke
//! combinatie heeft haar eigen EI-verdeling; superpositie is in dit pad
//! geometrisch én fysisch ongeldig. Daarom is het hoofdstuk per COMBINATIE
//! ingedeeld en niet per staaf, precies als in het live rapport.

use openaec_layout::{
    flowable::Flowable,
    paragraph::Paragraph,
    spacer::{PageBreak, Spacer},
    table::{Table, TableStyleConfig},
    types::{Color, Mm, Padding, Pt},
};

use concrete_check::segments::{SegmentStiffness, SegmentStiffnessResponse, SegmentStatus};
use nen_en_1992_1_1::mnkappa::MnKappaDiagram;
use nen_en_1992_1_1::stiffness::SolveMethod;
use nen_en_1992_1_1::stress_strain::NonlinearBasis;
use steel_check::result::CheckKind;

use crate::betonfiguren::{nl, Figuurstijl};
use crate::betonspoor::{BetonStijfheidSpoor, StijfheidCombinatie};
use crate::figuur::{Figuur, FiguurFlowable};
use crate::{
    style_body, style_h2, style_h3, style_mono, style_note, ReportInput, C_DEEP, C_FAIL,
};

use concrete_check::ConcreteBeamCheckResult;

/// De kop van het hoofdstuk — dezelfde als in het live rapport.
pub const KOP: &str = "Beton — fysisch niet-lineaire tweede orde";

/// Maximale hoogte van een figuur op de bladzijde.
///
/// Ruim genoeg om de labels leesbaar te houden (de tekenfuncties schalen hun
/// lettergroottes mee met het vlak) en klein genoeg dat er tekst naast de
/// figuur op het vel past.
const FIGUUR_MAX_H: Pt = Pt(200.0);

// ═══════════════════════════════════════════════════════════════════════
// Toepasselijkheid
// ═══════════════════════════════════════════════════════════════════════

/// Kan dit rapport dit hoofdstuk ooit vullen?
///
/// Ja zodra er iets van beton in zit: toetsresultaten of een segmentspoor.
/// Nee bij een zuiver stalen of houten rapport — dat krijgt geen leeg
/// betonhoofdstuk, en ook geen regel in de inhoudsopgave.
pub fn van_toepassing(input: &ReportInput) -> bool {
    !input.concrete_check_results.is_empty()
        || input
            .concrete_stiffness_trace
            .as_ref()
            .is_some_and(|s| s.heeft_ronden() || !s.overgeslagen.is_empty())
}

// ═══════════════════════════════════════════════════════════════════════
// Het hoofdstuk
// ═══════════════════════════════════════════════════════════════════════

/// Zet het hele hoofdstuk achter `flow`. Doet niets wanneer
/// [`van_toepassing`] `false` zegt.
pub fn extend_with_betonhoofdstuk(flow: &mut Vec<Box<dyn Flowable>>, input: &ReportInput) {
    if !van_toepassing(input) {
        return;
    }
    let leeg = BetonStijfheidSpoor {
        segment_lengte_mm: 0.0,
        combinaties: Vec::new(),
        overgeslagen: Vec::new(),
        staafdoorsneden: Vec::new(),
    };
    let spoor = input.concrete_stiffness_trace.as_ref().unwrap_or(&leeg);
    let stijl = Figuurstijl::default();

    flow.push(Box::new(PageBreak));
    flow.push(Box::new(Paragraph::new(KOP, style_h2()).kop()));

    // De methode, woordelijk zoals het live rapport hem stelt.
    flow.push(Box::new(Paragraph::new(
        "Methode: de algemene methode van NEN-EN 1992-1-1 5.8.6. Elke betonstaaf is in \
         segmenten geknipt en in het midden van elk segment (5.8.6(6)) is aan evenwicht en \
         compatibiliteit voldaan; daaruit volgt per segment de kromming κ bij de gevonden \
         (N_Ed, M_Ed) en de secante buigstijfheid EI = (M_Ed − M0)/κ, waarmee het raamwerk \
         opnieuw wordt opgelost tot de stijfheden niet meer veranderen. Tekenconventie: N \
         positief is trek, M positief is trek in de onderste vezel.",
        style_body(),
    )));
    flow.push(Box::new(Paragraph::new(
        "De stijfheid volgt uit de krachten van één belastingtoestand, dus elke combinatie \
         heeft haar eigen EI-verdeling en er bestaat geen omhullende stijfheid: superpositie \
         is in dit pad geometrisch én fysisch ongeldig.",
        style_body(),
    )));

    // ── Doorsneden en diagrammen (BetonSection) ──────────────────────────
    if !input.concrete_check_results.is_empty() {
        flow.push(Box::new(
            Paragraph::new("Doorsneden en diagrammen", style_h3()).kop(),
        ));
        for r in &input.concrete_check_results {
            extend_met_doorsnedeblok(flow, r, spoor, &stijl);
        }
    }

    // ── Segmentstijfheden per combinatie (BetonStijfheidSection) ─────────
    flow.push(Box::new(
        Paragraph::new("Segmentstijfheden per combinatie", style_h3()).kop(),
    ));

    if !spoor.overgeslagen.is_empty() {
        flow.push(Box::new(Paragraph::new(
            format!(
                "{} betonstaaf/-staven rekende NIET fysisch niet-lineair mee en hield de \
                 ongescheurde stijfheid E_cm·I_c van de bruto doorsnede — voor die staven is \
                 de uitkomst die van de tweede orde P-Δ alleen:",
                spoor.overgeslagen.len()
            ),
            style_body(),
        )));
        for o in &spoor.overgeslagen {
            // De reden komt woordelijk uit de rekengang.
            flow.push(Box::new(Paragraph::new(
                format!("Staaf {} — {}", o.beam_id, o.reden),
                style_note(),
            )));
        }
    }

    if !spoor.heeft_ronden() {
        flow.push(Box::new(Paragraph::new(
            "Er is niet fysisch niet-lineair gerekend. Dit hoofdstuk vult zich zodra het \
             analysetype \"2e orde + fysisch\" is gekozen én het model betonstaven met een \
             wapeningskorf bevat; de segmentstijfheden komen dan uit de rekenkern.",
            style_note(),
        )));
        return;
    }

    if spoor.combinaties.len() > 1 {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Alle {} fysisch gerekende combinaties staan hieronder.",
                spoor.combinaties.len()
            ),
            style_note(),
        )));
    }

    for c in &spoor.combinaties {
        extend_met_combinatie(flow, c, spoor.segment_lengte_mm, &stijl);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Doorsnede, M-κ en interactie — drie van de vier figuren
// ═══════════════════════════════════════════════════════════════════════

/// De kop, de invoerregel, de vormaannamen en de drie doorsnedefiguren van één
/// betonstaaf.
fn extend_met_doorsnedeblok(
    flow: &mut Vec<Box<dyn Flowable>>,
    r: &ConcreteBeamCheckResult,
    spoor: &BetonStijfheidSpoor,
    stijl: &Figuurstijl,
) {
    flow.push(Box::new(
        Paragraph::new(
            format!(
                "Staaf {} — {} ({}, {})",
                r.beam_id, r.section_name, r.concrete_class, r.reinforcement_grade
            ),
            style_h3(),
        )
        .kop(),
    ));
    // `.kop()` op de gegevensregel en op de vormaannamen: ze horen bij de
    // doorsnedefiguur eronder en mogen er niet van losraken.
    flow.push(Box::new(
        Paragraph::new(
            format!(
                "{} · d = {} mm · A_s,onder = {} mm² · A_s,boven = {} mm² · f_cd = {} N/mm² · \
                 f_yd = {} N/mm²",
                r.reinforcement_summary,
                nl(r.d_mm, 1),
                nl(r.a_s_bottom_mm2, 0),
                nl(r.a_s_top_mm2, 0),
                nl(r.f_cd_mpa, 2),
                nl(r.f_yd_mpa, 1),
            ),
            style_mono(),
        )
        .kop(),
    ));
    // De vormaannamen komen woordelijk uit `ConcreteSection::assumptions`.
    for a in &r.shape_assumptions {
        flow.push(Box::new(Paragraph::new(a.clone(), style_note()).kop()));
    }

    // 1. De doorsnede met de wapeningskorf. Alleen te tekenen als de frontend
    //    de doorsnede en de korf heeft meegestuurd; uit `section_name` en
    //    `reinforcement_summary` terugparsen zou een tweede waarheid opleveren.
    //
    //    Dat meesturen hangt NIET aan de fysische ronde: `staafdoorsneden` is
    //    tekengegeven en geen rekengegeven, en de frontend vult het bij elk
    //    analysetype (`rapportPdfInvoer.ts`). Een spoor met alleen doorsneden
    //    erin is dus normaal — dan staat deze figuur er wél en vult de rest van
    //    het hoofdstuk zich met de eerlijke melding hieronder.
    match spoor.doorsnede(r.beam_id) {
        Some(d) => match d.doorsnede.build() {
            Ok(section) => {
                flow.push(Box::new(
                    FiguurFlowable::nieuw(
                        Figuur::Doorsnede {
                            section,
                            korf: d.korf,
                        },
                        stijl.clone(),
                        FIGUUR_MAX_H,
                    )
                    .met_breedtefractie(0.55)
                    .met_bijschrift(
                        format!(
                            "Doorsnede van staaf {} op ware verhouding, met de wapeningskorf: \
                             {}.",
                            r.beam_id, r.reinforcement_summary
                        ),
                        style_note(),
                    ),
                ));
            }
            Err(e) => flow.push(Box::new(Paragraph::new(
                format!("Doorsnedefiguur niet getekend — {e}"),
                style_note(),
            ))),
        },
        None => flow.push(Box::new(Paragraph::new(
            "Doorsnedefiguur niet getekend: de doorsnede en de wapeningskorf zijn niet met de \
             rapportinvoer meegestuurd.",
            style_note(),
        ))),
    }

    // Het maatgevende punt: N_Ed, M_Ed en M_Rd van de maatgevende toets. Die
    // getallen komen uit de toets zelf, zodat de figuur hetzelfde zegt als de
    // tabel en niet een eigen interpolatie op de omhullende.
    let (n_ed, m_ed, m_rd) = maatgevend_punt(r);

    // 2. Het M-κ-diagram bij de normaalkracht van dat punt.
    flow.push(Box::new(
        FiguurFlowable::nieuw(
            Figuur::MnKappa {
                diagram: r.mn_kappa.clone(),
                m_ed_knm: m_ed,
            },
            stijl.clone(),
            FIGUUR_MAX_H,
        )
        .met_breedtefractie(0.78)
        .met_bijschrift(mn_kappa_bijschrift(r.beam_id, r.mn_kappa.as_ref(), n_ed), style_note()),
    ));

    // 3. Het N-M-interactiediagram met het rekenpunt en de horizontale snede.
    flow.push(Box::new(
        FiguurFlowable::nieuw(
            Figuur::Interactie {
                positief: r.interaction_positive.clone(),
                negatief: r.interaction_negative.clone(),
                n_ed_kn: n_ed,
                m_ed_knm: m_ed,
                m_rd_knm: m_rd,
            },
            stijl.clone(),
            FIGUUR_MAX_H,
        )
        .met_breedtefractie(0.72)
        .met_bijschrift(
            format!(
                "N-M-interactiediagram van staaf {}: de bezwijkomhullende met het rekenpunt. \
                 De unity check is de horizontale snede bij constante N_Ed — van de N-as tot \
                 de omhullende is M_Rd, het ruitje daarop is M_Ed. N positief is trek.",
                r.beam_id
            ),
            style_note(),
        ),
    ));
    flow.push(Box::new(Spacer::from_mm(2.0)));
}

/// Het bijschrift bij het M-κ-diagram; noemt de normaalkracht waarbij het
/// diagram hoort en de maximale waarden die de kern heeft gevonden.
fn mn_kappa_bijschrift(beam_id: u32, diagram: Option<&MnKappaDiagram>, n_ed: Option<f64>) -> String {
    let bij_n = match n_ed {
        Some(n) => format!("bij N_Ed = {} kN", nl(n, 1)),
        None => "bij de normaalkracht van het maatgevende punt".to_string(),
    };
    match diagram {
        Some(d) => format!(
            "M-κ-diagram van staaf {beam_id} {bij_n}: M_max = {} kNm, bezwijken bij \
             κ_u = {} 10^-3/m met M_u = {} kNm. De streeplijn is M_Ed.",
            nl(d.m_max_knm, 1),
            nl(d.kappa_u_per_m * 1e3, 3),
            nl(d.m_u_knm, 1),
        ),
        None => format!("M-κ-diagram van staaf {beam_id}: de rekenkern gaf geen diagram."),
    }
}

/// N_Ed, M_Ed en M_Rd van de MAATGEVENDE toets van deze staaf.
///
/// De figuren horen hetzelfde punt te tonen als de toetstabel; daarom niet uit
/// de omhullende geïnterpoleerd maar overgenomen uit de toets zelf. Is er geen
/// maatgevende toets te vinden, dan blijft alles leeg en tekenen de figuren
/// hun rekenpunt niet — beter geen punt dan een verzonnen punt.
fn maatgevend_punt(r: &ConcreteBeamCheckResult) -> (Option<f64>, Option<f64>, Option<f64>) {
    let nc = r
        .checks
        .iter()
        .find(|c| c.id == r.governing_check_id)
        .or_else(|| r.checks.first());
    let Some(nc) = nc else {
        return (None, None, None);
    };
    match &nc.kind {
        CheckKind::Resistance(res) => (
            Some(res.force_state.forces.n_ed),
            Some(res.force_state.forces.my_ed),
            res.uc.as_ref().map(|u| u.rd),
        ),
        CheckKind::Stability(s) => (
            Some(s.force_state.forces.n_ed),
            Some(s.force_state.forces.my_ed),
            s.uc.as_ref().map(|u| u.rd),
        ),
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Eén combinatie: uitgangspunten, convergentie en de staven
// ═══════════════════════════════════════════════════════════════════════

fn extend_met_combinatie(
    flow: &mut Vec<Box<dyn Flowable>>,
    c: &StijfheidCombinatie,
    segment_lengte_mm: f64,
    stijl: &Figuurstijl,
) {
    let eerste = c.staven.first();
    let conv = !c.staven.is_empty() && c.staven.iter().all(|r| r.converged);
    let (waarde, staaf, segment) = max_verandering(c);
    let geklemd: u32 = c.staven.iter().map(|r| r.clamped_count).sum();

    flow.push(Box::new(
        Paragraph::new(
            format!(
                "Combinatie {} — {}",
                c.combinatie_naam,
                eerste
                    .map(|r| r.limit_state_label.clone())
                    .unwrap_or_else(|| variant_kort(c.grenstoestand).to_string())
            ),
            style_h3(),
        )
        .kop(),
    ));

    let mut rijen: Vec<Vec<String>> = Vec::new();
    rijen.push(vec![
        "Analysetype".into(),
        "Tweede orde, geometrisch én fysisch niet-lineair (5.8.6)".into(),
    ]);
    rijen.push(vec![
        "Grenstoestand en diagram".into(),
        eerste.map(|r| r.limit_state_label.clone()).unwrap_or_else(|| "—".into()),
    ]);
    rijen.push(vec![
        "Segmentlengte".into(),
        format!(
            "gewenst {} mm; werkelijk {} mm ({} segmenten op de langste staaf). \
             Indelingsregel: {}",
            nl(segment_lengte_mm, 0),
            eerste.map(|r| nl(r.segment_length_mm, 1)).unwrap_or_else(|| "—".into()),
            c.staven.iter().map(|r| r.segment_count).max().unwrap_or(0),
            // Woordelijk uit de kern.
            eerste.map(|r| r.segmentation_rule.clone()).unwrap_or_else(|| "—".into()),
        ),
    ]);
    rijen.push(vec![
        "Aantal ronden".into(),
        format!(
            "{} raamwerkoplossing(en) na de segmentindeling (ronde 0). Elke ronde: oplossen, \
             per segment (N, M) naar de rekenkern, nieuwe EI terug. De tabellen hieronder \
             tonen de LAATSTE ronde.",
            c.ronden
        ),
    ]);
    rijen.push(vec![
        "Convergentiecriterium".into(),
        format!(
            "max |ΔEI| / max(|EI|, |EI_vorig|) ≤ {} — {} — {}",
            eerste
                .map(|r| format!("{} %", nl(100.0 * r.convergence_tolerance, 2)))
                .unwrap_or_else(|| "—".into()),
            match waarde {
                None => "geen maat beschikbaar".to_string(),
                Some(w) => format!(
                    "gehaald: {} % in de laatste ronde (staaf {}, segment {})",
                    nl(100.0 * w, 3),
                    staaf.map(|s| s.to_string()).unwrap_or_else(|| "—".into()),
                    segment.map(|s| (s + 1).to_string()).unwrap_or_else(|| "—".into()),
                ),
            },
            if conv { "geconvergeerd" } else { "NIET geconvergeerd" },
        ),
    ]);
    rijen.push(vec![
        "Verloop per ronde".into(),
        if c.verloop.is_empty() {
            "—".to_string()
        } else {
            c.verloop
                .iter()
                .map(|v| match v.max_relatieve_verandering {
                    None => format!("{}: —", v.ronde),
                    Some(m) => format!("{}: {} %", v.ronde, nl(100.0 * m, 3)),
                })
                .collect::<Vec<_>>()
                .join(" · ")
        },
    ]);
    rijen.push(vec![
        "Onderrelaxatie ω / ondergrens EI".into(),
        format!(
            "ω = {} · ondergrens EI = {} kNm²{}{}",
            eerste.map(|r| nl(r.relaxation, 3)).unwrap_or_else(|| "—".into()),
            eerste.map(|r| nl(r.min_ei_knm2, 0)).unwrap_or_else(|| "—".into()),
            match eerste {
                Some(r) if r.ei_uncracked_knm2 > 0.0 => format!(
                    " ({} % van E_c·I_c)",
                    nl(100.0 * r.min_ei_knm2 / r.ei_uncracked_knm2, 1)
                ),
                _ => String::new(),
            },
            if geklemd > 0 {
                format!(
                    " — {geklemd} segment(en) op die ondergrens geklemd; een geklemde waarde \
                     is een numerieke ondergrens en geen rekenuitkomst."
                )
            } else {
                String::new()
            },
        ),
    ]);
    rijen.push(vec![
        "Kruip".into(),
        format!(
            "φ_ef = {} — {}",
            eerste.map(|r| nl(r.phi_ef, 2)).unwrap_or_else(|| "—".into()),
            // DE VERPLICHTE VERMELDING. Woordelijk uit het kernantwoord; niet
            // herformuleren, niet vertalen, niet inkorten.
            eerste.map(|r| r.creep_note.clone()).unwrap_or_else(|| "—".into()),
        ),
    ]);

    flow.push(Box::new(
        Table::new(vec!["Uitgangspunt".into(), "Waarde".into()], rijen)
            .with_col_widths(vec![Mm(44.0).into(), Mm(126.0).into()])
            .with_style(stijl_uitgangspunten())
            .with_repeat_header(true),
    ));
    flow.push(Box::new(Spacer::from_mm(2.0)));

    for r in &c.staven {
        extend_met_staaf(flow, r, stijl);
    }
}

/// De grootste relatieve verandering van de laatste ronde over alle staven,
/// met de staaf en het segment waar hij zit.
fn max_verandering(c: &StijfheidCombinatie) -> (Option<f64>, Option<u32>, Option<u32>) {
    let mut waarde: Option<f64> = None;
    let mut staaf = None;
    let mut segment = None;
    for r in &c.staven {
        let Some(m) = r.max_relative_change else {
            continue;
        };
        if waarde.is_none_or(|w| m > w) {
            waarde = Some(m);
            staaf = Some(r.beam_id);
            segment = r.governing_segment;
        }
    }
    (waarde, staaf, segment)
}

// ═══════════════════════════════════════════════════════════════════════
// Eén staaf: de EI-figuur, de segmenttabel en de meldingen van de kern
// ═══════════════════════════════════════════════════════════════════════

fn extend_met_staaf(
    flow: &mut Vec<Box<dyn Flowable>>,
    r: &SegmentStiffnessResponse,
    stijl: &Figuurstijl,
) {
    let ei_ref = r.ei_uncracked_knm2;
    let gescheurd = r.segments.iter().filter(|s| s.cracked == Some(true)).count();
    let laagste = r
        .segments
        .iter()
        .filter_map(|s| s.ei_knm2)
        .fold(None::<f64>, |m, v| Some(m.map_or(v, |m| m.min(v))));

    flow.push(Box::new(
        Paragraph::new(
            format!(
                "Staaf {} — {} ({}, {}) · {}",
                r.beam_id, r.section_name, r.concrete_class, r.reinforcement_grade,
                r.reinforcement_summary
            ),
            style_h3(),
        )
        .kop(),
    ));
    // `.kop()` op de gegevensregel: hij hoort bij de EI-figuur eronder. Zonder
    // die schakel bleef de staafkop met zijn regel onderaan een vel achter en
    // begon de figuur op het volgende — een halve bladzijde wit.
    flow.push(Box::new(
        Paragraph::new(
            format!(
                "L = {} m · {} segmenten van {} mm · f_c = {} N/mm² · E_c = {} N/mm² · \
                 f_ctm = {} N/mm² · E_c·I_c = {} kNm² · {}",
                nl(r.length_m, 3),
                r.segment_count,
                nl(r.segment_length_mm, 1),
                nl(r.f_c_mpa, 2),
                nl(r.e_c_mpa, 0),
                nl(r.f_ctm_mpa, 2),
                nl(ei_ref, 0),
                r.limit_state_label,
            ),
            style_mono(),
        )
        .kop(),
    ));

    // 4. Het EI-verloop langs de staaf.
    flow.push(Box::new(
        FiguurFlowable::nieuw(
            Figuur::EiVerloop {
                respons: Box::new(r.clone()),
            },
            stijl.clone(),
            FIGUUR_MAX_H,
        )
        .met_bijschrift(
            format!(
                "Buigstijfheid EI per segment langs staaf {}. De streeplijn is de ongescheurde \
                 E_c·I_c = {} kNm²; {} van de {} segmenten is gescheurd. Laagste waarde {} kNm² \
                 ({}·E_c·I_c).",
                r.beam_id,
                nl(ei_ref, 0),
                gescheurd,
                r.segment_count,
                laagste.map(|v| nl(v, 0)).unwrap_or_else(|| "—".into()),
                match (laagste, ei_ref > 0.0) {
                    (Some(v), true) => nl(v / ei_ref, 2),
                    _ => "—".to_string(),
                },
            ),
            style_note(),
        ),
    ));

    flow.push(Box::new(segmenttabel(r)));

    // De uitleg onder de tabel — dezelfde tekst als in het live rapport, en
    // afhankelijk van de gebruikte variant.
    let uitleg = match r.limit_state {
        NonlinearBasis::DesignValues =>
            "In deze variant zegt de kolom Toestand alleen of |M_Ed| boven het scheurmoment \
             |M_cr| ligt. De stijfheid zelf wordt in beide gevallen zonder betontrek bepaald \
             (5.8.6(5)): zodra er trek in de doorsnede optreedt ligt EI daarom onder E_c·I_c, \
             ook bij een segment dat als ongescheurd staat aangemerkt, terwijl een segment \
             waarin de normaalkracht de hele doorsnede op druk houdt vlak bij E_c·I_c blijft.",
        NonlinearBasis::MeanValues =>
            "In deze variant interpoleert ζ van (7.19) tussen de ongescheurde en de volledig \
             gescheurde toestand (7.4.3): ζ = 0 is ongescheurd, ζ → 1 volledig gescheurd.",
    };
    flow.push(Box::new(Paragraph::new(uitleg, style_note())));
    flow.push(Box::new(Paragraph::new(
        format!(
            "Een verhouding boven 1 kan voorkomen: E_c·I_c is alleen de bruto betondoorsnede, \
             terwijl de wapening in de ongescheurde toestand meedraagt. M0 is het moment bij \
             κ = 0; het moment wordt om de geometrische middenvezel h/2 genomen en niet om het \
             plastisch zwaartepunt, dus bij een asymmetrische wapeningskorf onder druk is \
             M(κ = 0) niet nul en is de secans EI = (M_Ed − M0)/κ en niet M_Ed/κ. De kolom \
             EI / E_cI_c zet die stijfheid af tegen de ongescheurde E_c·I_c = {} kNm² — in de \
             uiterste grenstoestand een vergelijkingswaarde en geen rekenwaarde, want 5.8.6(5) \
             laat de betontrek weg en dan bestaat er geen ongescheurde tak.",
            nl(ei_ref, 0)
        ),
        style_note(),
    )));

    // De meldingen van de kern — woordelijk, en niet samengevat.
    for n in &r.notes {
        flow.push(Box::new(Paragraph::new(n.clone(), style_note())));
    }
    for s in &r.segments {
        if let Some(m) = &s.message {
            if !m.is_empty() {
                flow.push(Box::new(Paragraph::new(
                    format!("Segment {} — {}", s.index + 1, m),
                    let_op_stijl(),
                )));
            }
        }
    }
    flow.push(Box::new(Spacer::from_mm(3.0)));
}

/// De segmenttabel: letterlijk dezelfde kolommen als in het live rapport.
///
/// Twee schrijfwijzen wijken af, en om dezelfde reden als in `betonfiguren`:
/// het meegeleverde Liberation Sans heeft geen glief voor het
/// superschrift-minteken (U+207B) en geen subscript-nul (U+2080). Waar het
/// scherm `10⁻³` en `M₀` schrijft, staat hier `10^-3` en `M0`.
fn segmenttabel(r: &SegmentStiffnessResponse) -> Table {
    let ei_ref = r.ei_uncracked_knm2;
    let koppen: Vec<String> = vec![
        "#".into(),
        "x [m]".into(),
        "N_Ed [kN]".into(),
        "M_Ed [kNm]".into(),
        "M0 [kNm]".into(),
        "M_cr [kNm]".into(),
        "κ [10^-3/m]".into(),
        "EI [kNm²]".into(),
        "EI/EcIc".into(),
        "ΔEI [%]".into(),
        "Toestand".into(),
        // ζ in een EIGEN kolom. Achter "ongescheurd" aangeplakt liep elke
        // BGT-regel over twee tekstregels en werd de tabel twee keer zo hoog.
        "ζ".into(),
        "Var".into(),
    ];

    let rijen: Vec<Vec<String>> = r
        .segments
        .iter()
        .map(|s| {
            vec![
                (s.index + 1).to_string(),
                format!("{}–{}", nl(s.x_start_mm / 1000.0, 2), nl(s.x_end_mm / 1000.0, 2)),
                getal(s.n_ed_kn, 1),
                getal(s.m_ed_knm, 2),
                getal(s.m0_knm, 2),
                getal(s.m_cr_knm, 2),
                getal(s.kappa_per_m.map(|k| k * 1e3), 3),
                getal(s.ei_knm2, 0),
                match (s.ei_knm2, ei_ref > 0.0) {
                    (Some(v), true) => nl(v / ei_ref, 3),
                    _ => "—".to_string(),
                },
                getal(s.relative_change.map(|v| 100.0 * v), 2),
                toestand(s),
                getal(s.zeta, 2),
                variant_kort(s.basis).to_string(),
            ]
        })
        .collect();

    // Kolombreedtes samen 169 mm binnen het inhoudsvlak van 170 mm. De maten
    // zijn niet geraden maar op het GERENDERDE blad gecontroleerd: de motor
    // schat de tekstbreedte op 0,5 × korpsgrootte per teken, en dat is voor de
    // vette kopregel te krap — de koppen liepen daardoor over de kolomlijn
    // heen. Vandaar ook de kleinere kop in `stijl_segmenttabel`.
    Table::new(koppen, rijen)
        .with_col_widths(vec![
            Mm(6.0).into(),
            Mm(15.0).into(),
            Mm(14.0).into(),
            Mm(15.0).into(),
            Mm(13.0).into(),
            Mm(15.0).into(),
            Mm(16.0).into(),
            Mm(15.0).into(),
            Mm(12.0).into(),
            Mm(11.0).into(),
            Mm(20.0).into(),
            Mm(8.0).into(),
            Mm(9.0).into(),
        ])
        .with_style(stijl_segmenttabel())
        .with_repeat_header(true)
}

/// Een optioneel getal, of een gedachtestreepje. Vaste decimalen: alleen zo
/// staan de komma's in een kolom onder elkaar en is te zien hoe nauwkeurig een
/// waarde is.
fn getal(v: Option<f64>, decimalen: usize) -> String {
    match v {
        Some(x) => nl(x, decimalen),
        None => "—".to_string(),
    }
}

/// De kolom Toestand: gescheurd of niet, plus de ingrepen van de kern als
/// korte merktekens. ζ staat in zijn eigen kolom ernaast.
fn toestand(s: &SegmentStiffness) -> String {
    let mut uit = match s.cracked {
        None => "—".to_string(),
        Some(true) => "gescheurd".to_string(),
        Some(false) => "ongescheurd".to_string(),
    };
    let mut merk: Vec<&str> = Vec::new();
    if s.clamped {
        merk.push("geklemd");
    }
    if s.relaxed {
        merk.push("gerelaxeerd");
    }
    if s.beyond_eps_cu1 {
        merk.push("ε_cu1 overschreden");
    }
    if s.method == Some(SolveMethod::Bisection) {
        merk.push("insluiting");
    }
    if s.status == SegmentStatus::Failed {
        merk.push("geen stijfheid");
    }
    if !merk.is_empty() {
        uit.push_str(" · ");
        uit.push_str(&merk.join(", "));
    }
    uit
}

/// Korte aanduiding van de variant per segment.
fn variant_kort(basis: NonlinearBasis) -> &'static str {
    match basis {
        NonlinearBasis::DesignValues => "UGT",
        NonlinearBasis::MeanValues => "BGT",
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Opmaak
// ═══════════════════════════════════════════════════════════════════════

/// Een melding waar de lezer overheen moet struikelen (een geklemd segment,
/// een segment zonder stijfheid) — rood, zoals `.rpt-eis-note-let-op`.
fn let_op_stijl() -> openaec_layout::paragraph::ParagraphStyle {
    openaec_layout::paragraph::ParagraphStyle {
        text_color: C_FAIL,
        ..style_note()
    }
}

fn stijl_uitgangspunten() -> TableStyleConfig {
    TableStyleConfig {
        header_background: Some(C_DEEP),
        header_text_color: Color::WHITE,
        grid_color: Color::rgb(220, 215, 205),
        grid_width: Pt(0.5),
        row_backgrounds: vec![None, Some(Color::rgb(250, 247, 240))],
        cell_padding: Padding::new(Pt(3.0), Pt(4.0), Pt(3.0), Pt(4.0)),
        font_name: "LiberationSans".into(),
        header_font_name: "LiberationSans-Bold".into(),
        font_size: Pt(7.5),
        header_font_size: Pt(7.5),
    }
}

fn stijl_segmenttabel() -> TableStyleConfig {
    TableStyleConfig {
        header_background: Some(C_DEEP),
        header_text_color: Color::WHITE,
        grid_color: Color::rgb(228, 224, 216),
        grid_width: Pt(0.4),
        // Gescheurde segmenten tinten zou hier per RIJ moeten kunnen; de motor
        // kent alleen een vast rijpatroon. De kolom Toestand zegt het daarom
        // met zoveel woorden, en de figuur erboven toont hetzelfde beeld.
        row_backgrounds: vec![None, Some(Color::rgb(250, 247, 240))],
        cell_padding: Padding::new(Pt(2.0), Pt(2.5), Pt(2.0), Pt(2.5)),
        font_name: "LiberationSans".into(),
        header_font_name: "LiberationSans-Bold".into(),
        font_size: Pt(6.5),
        // De kop een halve punt kleiner dan de cellen: hij is VET en de motor
        // schat de breedte met dezelfde factor als voor gewone tekst, dus met
        // gelijke korpsgrootte loopt "M_Ed [kNm]" over de kolomlijn heen.
        header_font_size: Pt(6.0),
    }
}
