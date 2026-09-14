//! Het hoofdstuk "Beton — kolommen: slankheid, kruip en detaillering" in de
//! PDF: art. 5.8.3.1, art. 5.8.4 en de eisen van art. 9.5.
//!
//! # Wat hier staat wat elders NIET staat
//!
//! De toetsen zelf — de poort art. 5.8.3.1, de kruip art. 5.8.4 en de zeven
//! detailleringseisen van art. 9.5 — komen al langs in het blok per staaf: ze
//! zitten in `checks` van het betonresultaat en lopen dus door dezelfde
//! materiaal-neutrale renderer als elke andere toets. Dit hoofdstuk herhaalt
//! die regels niet. Het draagt de drie dingen die daar niet passen:
//!
//! 1. **De afleiding van λ_lim.** `kolom_deelstappen` schrijft de hele weg uit
//!    — l₀ uit figuur 5.7, i uit de niet-gescheurde doorsnede, n, ω, A, B, C —
//!    en die afleiding wordt in het blok per staaf alleen getoond als de poort
//!    toevallig de MAATGEVENDE toets is. Bij een kolom die op buiging bezwijkt
//!    is dat niet zo, en dan verdwijnt de hele redenering achter twee getallen.
//! 2. **Een overzicht over alle kolommen heen.** λ en λ_lim per staaf naast
//!    elkaar laten zien welke kolom de tweede orde in trekt; dat is een
//!    ontwerpvraag en geen staafvraag.
//! 3. **De eisen van art. 9.5 die de kern NIET heeft getoetst.**
//!    [`niet_getoetste_9_5_eisen`] levert ze woordelijk. Zij hebben géén
//!    `NamedCheck` en verschijnen dus nergens anders in het rapport — en juist
//!    daarom moeten ze hier staan. Een detailleringshoofdstuk dat zwijgt over
//!    wat het niet heeft nagekeken, laat de lezer denken dat art. 9.5 rond is.
//!
//! # Niet-van-toepassing is een uitkomst, geen leegte
//!
//! Zowel de poort als de kruip kan terugkomen met [`CheckStatus::NotApplicable`]
//! en een REDEN in `notes`: geen normaaldruk in de omhullende, geen
//! kolomgegevens opgegeven, l₀ = 0 ingevuld, φ(∞,t₀) onbekend. Die reden wordt
//! hier woordelijk overgenomen en niet samengevat. Een rapport dat een
//! ongetoetste eis verzwijgt is erger dan een dat hem afkeurt: bij een
//! afkeuring weet de lezer dat er iets moet gebeuren, bij een stilte niet.
//!
//! # Wanneer het hoofdstuk er staat
//!
//! Zodra er een betonstaaf is waarvoor de kern een art. 5.8- of art. 9.5-toets
//! heeft geleverd. Dezelfde maat als in `betonhoofdstuk`: "kan dit model dit
//! ooit vullen" laat een hoofdstuk weg, "is het nu leeg" niet. Een balk zonder
//! normaaldruk krijgt van de kern wél een poort-toets (met de reden dat art. 5.8
//! niet over haar gaat), en die staat hier dus ook — met die reden.

use openaec_layout::{
    flowable::Flowable,
    paragraph::Paragraph,
    spacer::{PageBreak, Spacer},
    table::{Table, TableStyleConfig},
    types::{Color, Mm, Padding, Pt},
};

use nen_en_1992_1_1::kolom::{is_kolomdetailleringstoets, niet_getoetste_9_5_eisen};
use nen_en_1993_1_1_section::{CheckStatus, NamedValue};
use steel_check::result::{CheckKind, NamedCheck};

use concrete_check::kolom::DUBBELE_BUIGING_ID;
use concrete_check::{ConcreteBeamCheckResult, KRUIP_ID, SLANKHEIDSGRENS_ID};

use crate::betonfiguren::nl;
use crate::{
    extend_with_deelstappen, status_label, style_body, style_h2, style_h3, style_mono, style_note,
    ReportInput, C_DEEP, C_FAIL,
};

/// De kop van het hoofdstuk.
pub const KOP: &str = "Beton — kolommen: slankheid (5.8.3), kruip (5.8.4) en detaillering (9.5)";

// ═══════════════════════════════════════════════════════════════════════
// Toepasselijkheid
// ═══════════════════════════════════════════════════════════════════════

/// Draagt deze toets een art. 5.8- of art. 9.5-uitspraak?
fn is_kolomtoets(id: &str) -> bool {
    id == SLANKHEIDSGRENS_ID
        || id == KRUIP_ID
        || id == DUBBELE_BUIGING_ID
        || is_kolomdetailleringstoets(id)
}

/// Kan dit rapport dit hoofdstuk ooit vullen? Ja zodra één betonstaaf een
/// art. 5.8- of art. 9.5-toets draagt.
pub fn van_toepassing(input: &ReportInput) -> bool {
    input
        .concrete_check_results
        .iter()
        .any(|r| r.checks.iter().any(|c| is_kolomtoets(&c.id)))
}

// ═══════════════════════════════════════════════════════════════════════
// Het hoofdstuk
// ═══════════════════════════════════════════════════════════════════════

/// Zet het hele hoofdstuk achter `flow`. Doet niets wanneer
/// [`van_toepassing`] `false` zegt.
pub fn extend_with_kolomhoofdstuk(flow: &mut Vec<Box<dyn Flowable>>, input: &ReportInput) {
    if !van_toepassing(input) {
        return;
    }
    let staven: Vec<&ConcreteBeamCheckResult> = input
        .concrete_check_results
        .iter()
        .filter(|r| r.checks.iter().any(|c| is_kolomtoets(&c.id)))
        .collect();

    flow.push(Box::new(PageBreak));
    flow.push(Box::new(Paragraph::new(KOP, style_h2()).kop()));

    flow.push(Box::new(Paragraph::new(
        "Art. 5.8.3.1(1) is een POORT en geen sterktetoets: zij beantwoordt de vraag of de \
         tweede-orde-effecten mogen vervallen. λ = l₀/i wordt vergeleken met λ_lim = 20·A·B·C/√n, \
         waarbij de nationale bijlage die uitdrukking voorschrijft. Blijft λ eronder, dan mag de \
         berekening eerste orde blijven; komt λ erboven, dan moeten de krachten waarop de \
         doorsnedetoetsen zijn gedraaid uit een tweede-orde-berekening komen — in deze app de \
         algemene methode van art. 5.8.6, het hoofdstuk met de segmentstijfheden.",
        style_body(),
    )));
    flow.push(Box::new(Paragraph::new(
        "De maatgevende snede voor de poort is die met de grootste normaalDRUK en niet die met het \
         grootste moment: n = N_Ed/(A_c·f_cd) staat onder een wortel in de NOEMER van λ_lim, dus \
         hoe groter de druk, hoe kleiner λ_lim. M₀Ed komt uit diezelfde snede en dus uit dezelfde \
         combinatie.",
        style_body(),
    )));

    // ── Het overzicht over alle kolommen heen ────────────────────────────
    flow.push(Box::new(
        Paragraph::new("Slankheid per staaf", style_h3()).kop(),
    ));
    flow.push(Box::new(overzichtstabel(&staven)));
    flow.push(Box::new(Paragraph::new(
        "Een gedachtestreepje betekent dat de grootheid niet is vastgesteld; de reden staat bij de \
         staaf hieronder, woordelijk zoals de rekenkern haar heeft gegeven.",
        style_note(),
    )));
    flow.push(Box::new(Spacer::from_mm(2.0)));

    for r in &staven {
        extend_met_staaf(flow, r);
    }

    // ── Wat art. 9.5 nog meer eist, en hier NIET is getoetst ─────────────
    flow.push(Box::new(
        Paragraph::new("Eisen van art. 9.5 die niet zijn getoetst", style_h3()).kop(),
    ));
    flow.push(Box::new(Paragraph::new(
        "Deze eisen hebben geen toetsregel in de tabellen hierboven, en zijn dus ook niet \
         goedgekeurd. Ze staan hier woordelijk zoals de rekenkern ze meelevert, met de reden \
         waarom zij ze niet kan nagaan. Wie art. 9.5 wil afronden, doet deze punten met de hand.",
        style_body(),
    )));
    for eis in niet_getoetste_9_5_eisen() {
        flow.push(Box::new(Paragraph::new(eis, style_note())));
    }
}

// ═══════════════════════════════════════════════════════════════════════
// De overzichtstabel
// ═══════════════════════════════════════════════════════════════════════

/// De waarde van grootheid `symbool` uit een lijst, als hij erin staat.
///
/// De symbolen komen uit de kern (`NamedValue::symbol`) en worden hier dus
/// niet omgerekend of hernoemd: wat de toets λ_lim noemt, heet in deze tabel
/// ook λ_lim.
fn waarde(vars: &[NamedValue], symbool: &str) -> Option<f64> {
    vars.iter().find(|v| v.symbol == symbool).map(|v| v.value)
}

/// De grootheden van een toets van deze staaf, als die toets er is.
fn vars_van<'a>(r: &'a ConcreteBeamCheckResult, id: &str) -> Option<&'a [NamedValue]> {
    let nc = r.checks.iter().find(|c| c.id == id)?;
    Some(match &nc.kind {
        CheckKind::Resistance(res) => &res.variables,
        CheckKind::Stability(s) => &s.variables,
    })
}

/// De status van een toets van deze staaf, als die toets er is.
fn status_van<'a>(r: &'a ConcreteBeamCheckResult, id: &str) -> Option<&'a CheckStatus> {
    let nc = r.checks.iter().find(|c| c.id == id)?;
    Some(match &nc.kind {
        CheckKind::Resistance(res) => &res.status,
        CheckKind::Stability(s) => &s.status,
    })
}

/// De kanttekeningen van een toets van deze staaf — woordelijk uit de kern.
fn notes_van<'a>(r: &'a ConcreteBeamCheckResult, id: &str) -> Option<&'a [String]> {
    let nc = r.checks.iter().find(|c| c.id == id)?;
    Some(match &nc.kind {
        CheckKind::Resistance(res) => &res.notes,
        CheckKind::Stability(s) => &s.notes,
    })
}

/// Een optioneel getal, of een gedachtestreepje. Vaste decimalen, zodat de
/// komma's in een kolom onder elkaar staan.
fn getal(v: Option<f64>, decimalen: usize) -> String {
    match v {
        Some(x) => nl(x, decimalen),
        None => "—".to_string(),
    }
}

/// λ, λ_lim en het oordeel van elke kolom naast elkaar.
fn overzichtstabel(staven: &[&ConcreteBeamCheckResult]) -> Table {
    let koppen: Vec<String> = vec![
        "Staaf".into(),
        "Doorsnede".into(),
        "l₀ [mm]".into(),
        "i [mm]".into(),
        "λ".into(),
        "n".into(),
        "ω".into(),
        "A".into(),
        "B".into(),
        "C".into(),
        "λ_lim".into(),
        "φ_ef".into(),
        "2e orde".into(),
    ];

    let rijen: Vec<Vec<String>> = staven
        .iter()
        .map(|r| {
            let poort = vars_van(r, SLANKHEIDSGRENS_ID).unwrap_or(&[]);
            let kruip = vars_van(r, KRUIP_ID).unwrap_or(&[]);
            vec![
                r.beam_id.to_string(),
                r.section_name.clone(),
                getal(waarde(poort, "l_0"), 0),
                getal(waarde(poort, "i"), 1),
                getal(waarde(poort, "λ"), 1),
                getal(waarde(poort, "n"), 3),
                getal(waarde(poort, "ω"), 3),
                getal(waarde(poort, "A"), 3),
                getal(waarde(poort, "B"), 3),
                getal(waarde(poort, "C"), 3),
                getal(waarde(poort, "λ_lim"), 1),
                getal(waarde(kruip, "φ_ef"), 2),
                // Het OORDEEL van de poort, in de bewoording van de toets zelf:
                // "OK" = de tweede-orde-effecten mogen vervallen, "FAIL" = niet.
                // Dat is geen bezwijken; de tekst onder de tabel zegt dat ook.
                match status_van(r, SLANKHEIDSGRENS_ID) {
                    Some(CheckStatus::Ok) => "mag vervallen".to_string(),
                    Some(CheckStatus::NotOk) => "VEREIST".to_string(),
                    Some(CheckStatus::NotApplicable) => "n.v.t.".to_string(),
                    None => "—".to_string(),
                },
            ]
        })
        .collect();

    // Samen 169 mm binnen het inhoudsvlak van 170 mm, net als de segmenttabel;
    // de kop een halve punt kleiner omdat de motor de breedte van vette tekst
    // met dezelfde factor schat als die van gewone.
    Table::new(koppen, rijen)
        .with_col_widths(vec![
            Mm(11.0).into(),
            Mm(24.0).into(),
            Mm(14.0).into(),
            Mm(13.0).into(),
            Mm(11.0).into(),
            Mm(12.0).into(),
            Mm(12.0).into(),
            Mm(11.0).into(),
            Mm(11.0).into(),
            Mm(11.0).into(),
            Mm(13.0).into(),
            Mm(11.0).into(),
            Mm(15.0).into(),
        ])
        .with_style(stijl_overzicht())
        .with_repeat_header(true)
}

// ═══════════════════════════════════════════════════════════════════════
// Eén staaf
// ═══════════════════════════════════════════════════════════════════════

fn extend_met_staaf(flow: &mut Vec<Box<dyn Flowable>>, r: &ConcreteBeamCheckResult) {
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

    // ── De poort: de afleiding, of de reden dat er geen is ───────────────
    match r.checks.iter().find(|c| c.id == SLANKHEIDSGRENS_ID) {
        Some(nc) => extend_met_poort(flow, nc),
        None => flow.push(Box::new(Paragraph::new(
            "Voor deze staaf heeft de rekenkern geen slankheidstoets geleverd; art. 5.8.3.1 is dus \
             niet nagegaan.",
            style_note(),
        ))),
    }

    // ── De kruip ─────────────────────────────────────────────────────────
    if let Some(notes) = notes_van(r, KRUIP_ID) {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Kruip (art. 5.8.4) — {}: φ_ef = {}.",
                status_label(status_van(r, KRUIP_ID).unwrap_or(&CheckStatus::NotApplicable)),
                getal(waarde(vars_van(r, KRUIP_ID).unwrap_or(&[]), "φ_ef"), 2),
            ),
            style_mono(),
        )));
        // Woordelijk: de drie voorwaarden van art. 5.8.4(4), de herkomst van
        // M₀Eqp en — bij een ontbrekende φ(∞,t₀) — de waarschuwing dat A = 0,7
        // géén veilige kant is.
        for n in notes {
            flow.push(Box::new(Paragraph::new(n.clone(), style_note())));
        }
    }

    // ── Dubbele buiging: alleen als de kern hem gemeld heeft ─────────────
    if let Some(notes) = notes_van(r, DUBBELE_BUIGING_ID) {
        flow.push(Box::new(Paragraph::new(
            "Dubbele buiging (art. 5.8.9) — NIET uitgevoerd:",
            style_mono(),
        )));
        for n in notes {
            // Rood: hier staat dat er een halve belasting buiten beschouwing is
            // gebleven. Daar moet de lezer over struikelen.
            flow.push(Box::new(Paragraph::new(n.clone(), let_op_stijl())));
        }
    }

    // ── De detailleringseisen van art. 9.5 ───────────────────────────────
    let eisen: Vec<&NamedCheck> = r
        .checks
        .iter()
        .filter(|c| is_kolomdetailleringstoets(&c.id))
        .collect();
    if eisen.is_empty() {
        flow.push(Box::new(Paragraph::new(
            "Voor deze staaf zijn geen detailleringseisen van art. 9.5 geleverd.",
            style_note(),
        )));
    } else {
        flow.push(Box::new(detailleringstabel(&eisen)));
        // De reden bij elke eis die NIET is uitgevoerd of niet voldoet. Zonder
        // deze regels zegt de tabel "n.v.t." en verzwijgt waarom.
        for nc in &eisen {
            let (status, titel, notes) = match &nc.kind {
                CheckKind::Resistance(c) => (&c.status, &c.title, &c.notes),
                CheckKind::Stability(c) => (&c.status, &c.title, &c.notes),
            };
            if matches!(status, CheckStatus::Ok) {
                continue;
            }
            for n in notes {
                flow.push(Box::new(Paragraph::new(
                    format!("{titel} — {n}"),
                    if matches!(status, CheckStatus::NotOk) { let_op_stijl() } else { style_note() },
                )));
            }
        }
    }
    flow.push(Box::new(Spacer::from_mm(3.0)));
}

/// De poort: de afleiding van λ_lim en de kanttekeningen van de kern.
fn extend_met_poort(flow: &mut Vec<Box<dyn Flowable>>, nc: &NamedCheck) {
    let CheckKind::Resistance(c) = &nc.kind else {
        // De poort is in de kern een `ResistanceCalc`. Zou zij ooit als
        // stabiliteitstoets terugkomen, dan blijft de afleiding weg in plaats
        // van dat er een lege plek valt zonder uitleg.
        flow.push(Box::new(Paragraph::new(
            "De slankheidstoets kwam in een andere vorm terug dan verwacht; de afleiding is niet \
             uitgeschreven.",
            style_note(),
        )));
        return;
    };

    if c.deelstappen.is_empty() {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Slankheidsgrens (art. 5.8.3.1) — {}. Er is geen afleiding: de rekengang is niet \
                 doorlopen.",
                status_label(&c.status)
            ),
            style_mono(),
        )));
    } else {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Slankheidsgrens λ_lim (art. 5.8.3.1), uitgeschreven — uitkomst: {}",
                status_label(&c.status)
            ),
            style_mono(),
        )));
        extend_with_deelstappen(flow, &c.deelstappen);
        if let Some(uc) = &c.uc {
            flow.push(Box::new(Paragraph::new(
                format!(
                    "λ / λ_lim = {} / {} = {}. Boven 1 mogen de tweede-orde-effecten NIET worden \
                     verwaarloosd; dat is geen bezwijken van de doorsnede.",
                    nl(uc.ed, 1),
                    nl(uc.rd, 1),
                    nl(uc.uc, 3)
                ),
                style_mono(),
            )));
        }
    }
    // De kanttekeningen woordelijk: de gekozen snede, de grondslag van C, de
    // ω zonder zijstaven, en bij n.v.t. de reden dat art. 5.8 niet kon.
    for n in &c.notes {
        flow.push(Box::new(Paragraph::new(n.clone(), style_note())));
    }
}

/// De zeven detailleringseisen van art. 9.5 als tabel: wat de eis is, waar hij
/// staat, wat er aanwezig is en of dat voldoet.
fn detailleringstabel(eisen: &[&NamedCheck]) -> Table {
    let koppen: Vec<String> = vec![
        "Eis".into(),
        "Vindplaats".into(),
        "Aanwezig".into(),
        "Vereist".into(),
        "Status".into(),
    ];

    let rijen: Vec<Vec<String>> = eisen
        .iter()
        .map(|nc| {
            let (titel, artikel, value, unit, uc, status) = match &nc.kind {
                CheckKind::Resistance(c) => {
                    (&c.title, &c.article, c.value, &c.unit, c.uc.as_ref(), &c.status)
                }
                CheckKind::Stability(c) => {
                    (&c.title, &c.article, c.value, &c.unit, c.uc.as_ref(), &c.status)
                }
            };
            vec![
                titel.clone(),
                artikel.clone(),
                // Ed is wat er LIGT, Rd is wat de norm eist. Bij een eis zonder
                // unity check blijft de kolom leeg en staat alleen de waarde
                // die de eis zelf heeft opgeleverd.
                match uc {
                    Some(u) => format!("{} {}", nl(u.ed, 2), unit),
                    None => format!("{} {}", nl(value, 2), unit),
                },
                match uc {
                    Some(u) => format!("{} {}", nl(u.rd, 2), unit),
                    None => "—".to_string(),
                },
                status_label(status).to_string(),
            ]
        })
        .collect();

    Table::new(koppen, rijen)
        .with_col_widths(vec![
            Mm(56.0).into(),
            Mm(40.0).into(),
            Mm(24.0).into(),
            Mm(24.0).into(),
            Mm(25.0).into(),
        ])
        .with_style(stijl_eisen())
        .with_repeat_header(true)
}

// ═══════════════════════════════════════════════════════════════════════
// Opmaak
// ═══════════════════════════════════════════════════════════════════════

/// Een melding waar de lezer overheen moet struikelen — rood, dezelfde keuze
/// als in `betonhoofdstuk`.
fn let_op_stijl() -> openaec_layout::paragraph::ParagraphStyle {
    openaec_layout::paragraph::ParagraphStyle { text_color: C_FAIL, ..style_note() }
}

fn stijl_overzicht() -> TableStyleConfig {
    TableStyleConfig {
        header_background: Some(C_DEEP),
        header_text_color: Color::WHITE,
        grid_color: Color::rgb(228, 224, 216),
        grid_width: Pt(0.4),
        row_backgrounds: vec![None, Some(Color::rgb(250, 247, 240))],
        cell_padding: Padding::new(Pt(2.0), Pt(2.5), Pt(2.0), Pt(2.5)),
        font_name: "LiberationSans".into(),
        header_font_name: "LiberationSans-Bold".into(),
        font_size: Pt(6.5),
        header_font_size: Pt(6.0),
    }
}

fn stijl_eisen() -> TableStyleConfig {
    TableStyleConfig {
        header_background: Some(C_DEEP),
        header_text_color: Color::WHITE,
        grid_color: Color::rgb(220, 215, 205),
        grid_width: Pt(0.5),
        row_backgrounds: vec![None, Some(Color::rgb(250, 247, 240))],
        cell_padding: Padding::new(Pt(3.0), Pt(4.0), Pt(3.0), Pt(4.0)),
        font_name: "LiberationSans".into(),
        header_font_name: "LiberationSans-Bold".into(),
        font_size: Pt(7.0),
        header_font_size: Pt(7.0),
    }
}
