//! Het hoofdstuk "Platen — toetsing in het vlak" in de PDF.
//!
//! # Het bestek
//!
//! De papieren tweelingbroer van
//! `design-mockup/src/components/report/sections/PlateCheckSection.tsx`
//! (issue #25, onderdeel 5). Dezelfde opbouw:
//!
//! 1. een overzicht per plaat: materiaal, dikte, norm, hoogste UC met het
//!    maatgevende element en de maatgevende combinatie, en de status — of de
//!    reden waarom de plaat NIET getoetst is (een weigering van de kern of een
//!    plaat die de app niet naar de kern kon sturen);
//! 2. per getoetste plaat: wat niet getoetst is met de reden, de benodigde
//!    wapening (beton), het maatgevende element per combinatie, de UC per
//!    toets, de toelichting van de kern en de toetsblokken met de afleiding
//!    van de maatgevende toets.
//!
//! # Wat woordelijk uit de kern komt
//!
//! `geweigerd`, `niet_getoetst[].reden` en `notes`. Daarin staan de grenzen van
//! de toets — trek loodrecht op de vezel (6.1.3), plooi (EN 1993-1-5),
//! kruislaaghout zonder normgrondslag, de aanwezige wapening — en die zijn
//! veiligheidsrelevant. Ze worden dus letterlijk overgenomen, niet samengevat.
//!
//! # Wanneer het hoofdstuk wegblijft
//!
//! Zonder platen in de invoer staat er niets: geen kop, geen pagina-einde. Een
//! rapport zonder platen blijft daardoor byte voor byte wat het was.
//!
//! # De krachtregel
//!
//! Een plaat heeft geen N, V of M: de toetsen rekenen met elementgemiddelde
//! spanningen. De regel boven een toetsblok noemt daarom alleen de combinatie,
//! en niet de snedekrachten die in het staafblok staan — dezelfde keuze als de
//! krachtregel in het live rapport.

use openaec_layout::{
    flowable::Flowable,
    paragraph::Paragraph,
    spacer::{PageBreak, Spacer},
    table::{Table, TableStyleConfig},
    types::{Color, Padding, Pt},
};
use plaat_check::PlateCheckResult;
use serde::{Deserialize, Serialize};
use steel_check::result::CheckKind;
use ts_rs::TS;

use crate::{
    extend_with_check_block_regel, extend_with_deelstappen, status_label, style_body, style_h2,
    style_h3, style_note, ReportInput, C_DEEP,
};

/// De kop van het hoofdstuk.
pub const KOP: &str = "Platen — toetsing in het vlak";

/// De toelichting onder de kop, woordelijk die van het live rapport
/// (`report.plaatToetsNoot`).
pub const NOOT: &str = "Per element van het rekenmesh getoetst met de elementgemiddelde spanningen \
     in het vlak; per plaat de hoogste unity check over alle UGT-combinaties. Wat niet getoetst is, \
     staat per plaat met de reden.";

/// Een plaat die de app NIET naar de kern stuurde, met de reden — de spiegel
/// van `PlaatSkip` in `design-mockup/src/lib/plaatCheckBuilder.ts`.
///
/// Het live rapport toont deze platen in het overzicht; zonder dit type zou de
/// PDF er stil over zijn, en een plaat die ontbreekt zonder woord leest als een
/// plaat die voldoet.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct RapportPlaatOvergeslagen {
    pub plate_id: u32,
    pub reden: String,
}

/// Kan dit rapport dit hoofdstuk vullen? Alleen wanneer er platen in de invoer
/// zitten — getoetst, geweigerd of overgeslagen.
pub fn van_toepassing(input: &ReportInput) -> bool {
    !input.plate_results.is_empty() || !input.plate_skipped.is_empty()
}

/// De overzichtsregel van één plaat: de cellen van de overzichtstabel.
///
/// Publiek zodat de PDF-test de getallen precies zo kan opbouwen als ze op het
/// blad komen, in plaats van een tweede notatie te verzinnen.
pub fn overzichtsregel(r: &PlateCheckResult) -> Vec<String> {
    if r.geweigerd.is_some() {
        return vec![
            r.plate_id.to_string(),
            r.materiaal.clone(),
            dikte(r.thickness_mm),
            "—".into(),
            "—".into(),
            "—".into(),
            "—".into(),
            "Niet getoetst".into(),
        ];
    }
    vec![
        r.plate_id.to_string(),
        r.materiaal.clone(),
        dikte(r.thickness_mm),
        r.norm.clone(),
        uc_tekst(r.uc_max),
        r.governing_element_id.map_or("—".into(), |e| e.to_string()),
        r.governing_combination_id.map_or("—".into(), |c| c.to_string()),
        status_label(&r.status).into(),
    ]
}

/// Een unity check zoals dit hoofdstuk hem schrijft: twee decimalen, zoals de
/// samenvattingstabel van de staven.
pub fn uc_tekst(uc: f64) -> String {
    format!("{uc:.2}")
}

fn dikte(t: f64) -> String {
    if t.fract() == 0.0 {
        format!("{t:.0}")
    } else {
        format!("{t:.1}")
    }
}

/// Zet het hele hoofdstuk achter `flow`. Doet niets wanneer
/// [`van_toepassing`] `false` zegt.
pub fn extend_with_plaathoofdstuk(flow: &mut Vec<Box<dyn Flowable>>, input: &ReportInput) {
    if !van_toepassing(input) {
        return;
    }
    flow.push(Box::new(PageBreak));
    flow.push(Box::new(Paragraph::new(KOP, style_h2()).kop()));
    flow.push(Box::new(Paragraph::new(NOOT, style_body())));
    flow.push(Box::new(Spacer::from_mm(2.0)));

    // ── 1. Overzicht ──
    let mut rijen: Vec<Vec<String>> = input.plate_results.iter().map(overzichtsregel).collect();
    for s in &input.plate_skipped {
        rijen.push(vec![
            s.plate_id.to_string(),
            "—".into(),
            "—".into(),
            "—".into(),
            "—".into(),
            "—".into(),
            "—".into(),
            "Niet getoetst".into(),
        ]);
    }
    flow.push(Box::new(
        Table::new(
            ["Plaat", "Materiaal", "t [mm]", "Norm", "UC", "Element", "Combinatie", "Status"]
                .map(String::from)
                .to_vec(),
            rijen,
        )
        .with_col_widths_mm(vec![12.0, 30.0, 13.0, 45.0, 12.0, 16.0, 20.0, 22.0])
        .with_style(stijl_tabel())
        .with_repeat_header(true),
    ));
    flow.push(Box::new(Spacer::from_mm(3.0)));

    // De redenen van de platen zonder toets, woordelijk. In het live rapport
    // staan ze in de tabelrij zelf; hier eronder, omdat een alinea van vijf
    // regels in een tabelcel van 45 mm onleesbaar wordt.
    let geweigerd: Vec<&PlateCheckResult> =
        input.plate_results.iter().filter(|r| r.geweigerd.is_some()).collect();
    if !geweigerd.is_empty() || !input.plate_skipped.is_empty() {
        flow.push(Box::new(Paragraph::new("Niet getoetste platen", style_h3()).kop()));
        for r in &geweigerd {
            flow.push(Box::new(Paragraph::new(
                format!(
                    "Plaat {} ({}, t = {} mm): {}",
                    r.plate_id,
                    r.materiaal,
                    dikte(r.thickness_mm),
                    r.geweigerd.as_deref().unwrap_or_default()
                ),
                style_body(),
            )));
        }
        for s in &input.plate_skipped {
            flow.push(Box::new(Paragraph::new(
                format!("Plaat {}: {}", s.plate_id, s.reden),
                style_body(),
            )));
        }
        flow.push(Box::new(Spacer::from_mm(3.0)));
    }

    // ── 2. Per getoetste plaat ──
    for r in input.plate_results.iter().filter(|r| r.geweigerd.is_none()) {
        extend_met_plaat(flow, r);
    }
}

fn extend_met_plaat(flow: &mut Vec<Box<dyn Flowable>>, r: &PlateCheckResult) {
    flow.push(Box::new(
        Paragraph::new(
            format!("Plaat {} — {} (t = {} mm)", r.plate_id, r.materiaal, dikte(r.thickness_mm)),
            style_h3(),
        )
        .kop(),
    ));
    flow.push(Box::new(Paragraph::new(
        format!("{}    UC = {}    {}", r.norm, uc_tekst(r.uc_max), status_label(&r.status)),
        style_body(),
    )));

    // Wat NIET getoetst is: staat vóór de getallen, want het is de grens van
    // de conclusie die eronder staat.
    if !r.niet_getoetst.is_empty() {
        flow.push(Box::new(Paragraph::new("Niet getoetst:", style_body()).kop()));
        for n in &r.niet_getoetst {
            flow.push(Box::new(Paragraph::new(format!("{} — {}", n.titel, n.reden), style_body())));
        }
        flow.push(Box::new(Spacer::from_mm(1.5)));
    }

    if let Some(w) = &r.wapening {
        flow.push(Box::new(
            Paragraph::new("Benodigde wapening volgens bijlage F", style_body()).kop(),
        ));
        flow.push(Box::new(
            Table::new(
                ["Richting", "n_td,max [kN/m]", "Maatgevend element", "Maatgevende combinatie"]
                    .map(String::from)
                    .to_vec(),
                vec![
                    vec![
                        "x".into(),
                        format!("{:.1}", w.max_x.n_td_x_kn_per_m),
                        w.max_x.element_id.to_string(),
                        w.max_x.combination_x.to_string(),
                    ],
                    vec![
                        "z".into(),
                        format!("{:.1}", w.max_z.n_td_z_kn_per_m),
                        w.max_z.element_id.to_string(),
                        w.max_z.combination_z.to_string(),
                    ],
                ],
            )
            .with_col_widths_mm(vec![25.0, 40.0, 45.0, 60.0])
            .with_style(stijl_tabel()),
        ));
        flow.push(Box::new(Paragraph::new(
            "n_td = f'_td · t: de benodigde trekkracht in de wapening per meter wand, over beide \
             zijden samen, in de horizontale (x) en verticale (z) modelrichting; A_s = n_td / f_yd. \
             De aanwezige wapening is niet getoetst.",
            style_note(),
        )));
        flow.push(Box::new(Spacer::from_mm(1.5)));
    }

    // De UC per toets, op het maatgevende punt van díe toets.
    if !r.checks.is_empty() {
        let rijen = r
            .checks
            .iter()
            .map(|nc| {
                let (titel, artikel, uc, comb, status) = match &nc.kind {
                    CheckKind::Resistance(c) => (
                        &c.title,
                        &c.article,
                        c.uc.as_ref().map(|u| u.uc),
                        c.force_state.combination_id,
                        &c.status,
                    ),
                    CheckKind::Stability(c) => (
                        &c.title,
                        &c.article,
                        c.uc.as_ref().map(|u| u.uc),
                        c.force_state.combination_id,
                        &c.status,
                    ),
                };
                vec![
                    titel.clone(),
                    artikel.clone(),
                    uc.map_or("—".into(), uc_tekst),
                    comb.to_string(),
                    status_label(status).into(),
                ]
            })
            .collect();
        flow.push(Box::new(
            Table::new(
                ["Toets", "Artikel", "UC", "Combinatie", "Status"].map(String::from).to_vec(),
                rijen,
            )
            .with_col_widths_mm(vec![62.0, 45.0, 15.0, 25.0, 23.0])
            .with_style(stijl_tabel()),
        ));
        flow.push(Box::new(Spacer::from_mm(2.0)));
    }

    // Het maatgevende element per combinatie.
    if !r.combinaties.is_empty() {
        flow.push(Box::new(
            Table::new(
                ["Combinatie", "UC", "Maatgevend element", "Toets"].map(String::from).to_vec(),
                r.combinaties
                    .iter()
                    .map(|c| {
                        vec![
                            c.combination_id.to_string(),
                            uc_tekst(c.uc),
                            c.element_id.to_string(),
                            c.check_id.clone(),
                        ]
                    })
                    .collect(),
            )
            .with_col_widths_mm(vec![25.0, 15.0, 35.0, 95.0])
            .with_style(stijl_tabel())
            .with_repeat_header(true),
        ));
        flow.push(Box::new(Spacer::from_mm(2.0)));
    }

    for n in &r.notes {
        flow.push(Box::new(Paragraph::new(n.clone(), style_note())));
    }
    flow.push(Box::new(Spacer::from_mm(2.0)));

    let regel = |comb: u32| {
        format!(
            "Combinatie {comb}  ·  elementgemiddelde spanningen; het element staat in de toelichting"
        )
    };
    for nc in &r.checks {
        let comb = match &nc.kind {
            CheckKind::Resistance(c) => c.force_state.combination_id,
            CheckKind::Stability(c) => c.force_state.combination_id,
        };
        extend_with_check_block_regel(flow, &nc.kind, Some(regel(comb)));
    }

    // De afleiding van de maatgevende toets, uitgeschreven — dezelfde keuze
    // als bij de staven.
    if let Some(nc) = r.checks.iter().find(|c| c.id == r.governing_check_id) {
        let (titel, stappen) = match &nc.kind {
            CheckKind::Resistance(c) => (&c.title, &c.deelstappen),
            CheckKind::Stability(c) => (&c.title, &c.deelstappen),
        };
        if !stappen.is_empty() {
            flow.push(Box::new(
                Paragraph::new(format!("Maatgevende toets, uitgeschreven: {titel}"), style_h3())
                    .kop(),
            ));
            extend_with_deelstappen(flow, stappen);
        }
    }
}

fn stijl_tabel() -> TableStyleConfig {
    TableStyleConfig {
        header_background: Some(C_DEEP),
        header_text_color: Color::WHITE,
        grid_color: Color::rgb(228, 224, 216),
        grid_width: Pt(0.4),
        row_backgrounds: vec![None, Some(Color::rgb(250, 247, 240))],
        cell_padding: Padding::new(Pt(2.5), Pt(3.0), Pt(2.5), Pt(3.0)),
        font_name: "LiberationSans".into(),
        header_font_name: "LiberationSans-Bold".into(),
        font_size: Pt(8.0),
        // Een halve punt kleiner dan de cellen: de kop is vet en de motor
        // schat de breedte met de factor van gewone tekst (zie houthoofdstuk).
        header_font_size: Pt(7.5),
    }
}

