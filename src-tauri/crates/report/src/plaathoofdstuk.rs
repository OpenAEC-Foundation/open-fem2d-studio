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
use plaat_check::{PlateCheckInput, PlateCheckResult};
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
     in het vlak; per plaat de hoogste unity check over de relevante UGT- en BGT-combinaties. Wat niet getoetst is, \
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
    !input.plate_results.is_empty()
        || !input.plate_skipped.is_empty()
        || !input.plate_inputs.is_empty()
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
        // Spaties bij de uitgaveonderdelen voorkomen een afgebroken jaartal
        // in de smalle normkolom; de volledige aanduiding staat ook eronder.
        r.norm.replace('+', " + ").replace('/', " / "),
        uc_tekst(r.uc_max),
        r.governing_element_id.map_or("—".into(), |e| e.to_string()),
        r.governing_combination_id
            .map_or("—".into(), |c| c.to_string()),
        status_label(&r.status).into(),
    ]
}

/// Een unity check zoals dit hoofdstuk hem schrijft: twee decimalen, zoals de
/// samenvattingstabel van de staven.
pub fn uc_tekst(uc: f64) -> String {
    crate::getal_tekst(uc, 2)
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
    if !flow.is_empty() {
        flow.push(Box::new(PageBreak));
    }
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
    for p in &input.plate_inputs {
        if !input.plate_results.iter().any(|r| r.plate_id == p.plate_id)
            && !input.plate_skipped.iter().any(|s| s.plate_id == p.plate_id)
        {
            rijen.push(vec![
                p.plate_id.to_string(),
                p.materiaal.clone(),
                dikte(p.thickness_mm),
                "—".into(),
                "—".into(),
                "—".into(),
                "—".into(),
                "Niet getoetst".into(),
            ]);
        }
    }
    flow.push(Box::new(
        Table::new(
            [
                "Plaat",
                "Materiaal",
                "t [mm]",
                "Norm",
                "UC",
                "Element",
                "Combinatie",
                "Status",
            ]
            .map(String::from)
            .to_vec(),
            rijen,
        )
        .with_col_widths_mm(vec![10.0, 23.0, 13.0, 40.0, 23.0, 16.0, 23.0, 22.0])
        .with_style(stijl_tabel())
        .with_repeat_header(true),
    ));
    flow.push(Box::new(Spacer::from_mm(3.0)));

    // De redenen van de platen zonder toets, woordelijk. In het live rapport
    // staan ze in de tabelrij zelf; hier eronder, omdat een alinea van vijf
    // regels in een tabelcel van 45 mm onleesbaar wordt.
    let geweigerd: Vec<&PlateCheckResult> = input
        .plate_results
        .iter()
        .filter(|r| r.geweigerd.is_some())
        .collect();
    if !geweigerd.is_empty() || !input.plate_skipped.is_empty() {
        flow.push(Box::new(
            Paragraph::new("Niet getoetste platen", style_h3()).kop(),
        ));
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
            for note in &r.notes {
                flow.push(Box::new(Paragraph::new(note.clone(), style_note())));
            }
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
        let bron = input.plate_inputs.iter().find(|p| p.plate_id == r.plate_id);
        if bron.is_none() {
            flow.push(Box::new(Paragraph::new(
                format!("Plaat {}: oorspronkelijke toetsinvoer niet meegestuurd; hieronder staan de aangeleverde resultaten.", r.plate_id),
                style_note(),
            )));
        }
        extend_met_plaat(flow, r);
    }
    for p in &input.plate_inputs {
        let resultaat = input
            .plate_results
            .iter()
            .find(|r| r.plate_id == p.plate_id);
        extend_met_invoer(flow, p, resultaat);
    }
}

/// Eén regel per aangeleverde combinatie. De volledige mesh reist mee in de
/// invoer; op papier staan het aantal elementen en de spanningen bij het
/// maatgevende element, zodat grote meshes geen onleesbare tabellen geven.
fn extend_met_invoer(
    flow: &mut Vec<Box<dyn Flowable>>,
    p: &PlateCheckInput,
    r: Option<&PlateCheckResult>,
) {
    flow.push(Box::new(
        Paragraph::new(format!("Plaat {} — toetsinvoer", p.plate_id), style_h3()).kop(),
    ));
    flow.push(Box::new(Paragraph::new(
        format!(
            "Materiaal: {}; dikte: {} mm; nationale bijlage: {:?}.",
            p.materiaal,
            dikte(p.thickness_mm),
            p.bijlage
        ),
        style_body(),
    )));
    if p.soort == plaat_check::PlaatMateriaalSoort::Hout {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Vezelrichting: {}° vanaf de globale x-as; klimaatklasse: {}.",
                p.hoofdrichting_graden,
                p.service_class
                    .map_or("niet opgegeven".into(), |s| format!("{s:?}"))
            ),
            style_body(),
        )));
        for d in &p.load_duration_per_combination {
            flow.push(Box::new(Paragraph::new(
                format!(
                    "Combinatie {}: belastingduur {}. {}",
                    d.combination_id,
                    timber_check::belastingduur::duurklasse_naam(d.load_duration),
                    d.basis
                ),
                style_body(),
            )));
        }
    }
    if r.is_none() {
        flow.push(Box::new(Paragraph::new(
            "Niet getoetst: geen toetsresultaat aangeleverd voor deze plaat.",
            style_body(),
        )));
    }
    extend_met_wandinvoer(flow, p);
    extend_met_meshdekking(flow, p);
    if p.combinations.is_empty() && p.frequente_combinaties.is_empty() {
        flow.push(Box::new(Paragraph::new(
            "Geen combinaties aangeleverd.",
            style_note(),
        )));
        return;
    }
    flow.push(Box::new(Paragraph::new(
        "Alle aangeleverde combinaties (UGT en BGT). Spanningen in N/mm², trek positief; x horizontaal, z verticaal. Per combinatie het maatgevende element van de uitgevoerde toetsen.",
        style_note(),
    )));
    let rows = p
        .combinations
        .iter()
        .map(|c| ("UGT", c))
        .chain(p.frequente_combinaties.iter().map(|c| ("BGT freq.", c)))
        .map(|(soort, c)| {
            let maatgevend = r.and_then(|r| {
                r.combinaties
                    .iter()
                    .find(|u| u.combination_id == c.combination_id)
            });
            let spanning =
                maatgevend.and_then(|u| c.elements.iter().find(|e| e.element_id == u.element_id));
            vec![
                format!("{soort} {}", c.combination_id),
                c.elements.len().to_string(),
                maatgevend.map_or("—".into(), |u| u.element_id.to_string()),
                spanning.map_or("—".into(), |e| format!("{:.3}", e.sigma_x_mpa)),
                spanning.map_or("—".into(), |e| format!("{:.3}", e.sigma_y_mpa)),
                spanning.map_or("—".into(), |e| format!("{:.3}", e.tau_xy_mpa)),
            ]
        })
        .collect();
    flow.push(Box::new(
        Table::new(
            [
                "Combinatie",
                "Aantal elementen",
                "Maatgevend element",
                "σ_x",
                "σ_z",
                "τ_xz",
            ]
            .map(String::from)
            .to_vec(),
            rows,
        )
        .with_col_widths_mm(vec![30.0, 25.0, 40.0, 25.0, 25.0, 25.0])
        .with_style(stijl_tabel())
        .with_repeat_header(true),
    ));
    for c in p.combinations.iter().chain(&p.frequente_combinaties) {
        let maatgevend = r.and_then(|r| {
            r.combinaties
                .iter()
                .find(|u| u.combination_id == c.combination_id)
        });
        let melding = match maatgevend {
            None => Some("geen toetsuitkomst beschikbaar; niet getoetst"),
            Some(u) if !c.elements.iter().any(|e| e.element_id == u.element_id) => {
                Some("invoerspanningen van het maatgevende element ontbreken")
            }
            _ => None,
        };
        if let Some(tekst) = melding {
            flow.push(Box::new(Paragraph::new(
                format!("Combinatie {}: {}.", c.combination_id, tekst),
                style_note(),
            )));
        }
    }
}

/// Alleen de opgegeven laaggegevens afdrukken; geen ontbrekende invoer afleiden.
fn extend_met_wandinvoer(flow: &mut Vec<Box<dyn Flowable>>, p: &PlateCheckInput) {
    if p.soort != plaat_check::PlaatMateriaalSoort::Beton {
        return;
    }
    let Some(w) = &p.wapening_aanwezig else {
        flow.push(Box::new(Paragraph::new(
            "Aanwezige wandwapening: niet ingevoerd.",
            style_note(),
        )));
        return;
    };
    flow.push(Box::new(
        Paragraph::new(
            format!("Aanwezige wandwapening - {}", w.staalsoort),
            style_body(),
        )
        .kop(),
    ));
    let getal = |v: Option<f64>| v.map_or("—".into(), |v| format!("{v:.3}"));
    let mut rows = Vec::new();
    for (richting, lagen) in [("horizontaal", &w.horizontaal), ("verticaal", &w.verticaal)] {
        for (zijde, laag) in [(1, lagen.zijde_1), (2, lagen.zijde_2)] {
            rows.push(match laag {
                Some(l) => vec![
                    format!("{richting}, zijde {zijde}"),
                    getal(l.diameter_mm),
                    getal(l.hoh_mm),
                    getal(l.as_mm2_per_m),
                    getal(Some(l.dekking_mm)),
                ],
                None => vec![
                    format!("{richting}, zijde {zijde}"),
                    "niet ingevoerd".into(),
                    "—".into(),
                    "—".into(),
                    "—".into(),
                ],
            });
        }
    }
    flow.push(Box::new(
        Table::new(
            [
                "Laag",
                "Ø [mm]",
                "h.o.h. [mm]",
                "A_s [mm²/m]",
                "Dekking [mm]",
            ]
            .map(String::from)
            .to_vec(),
            rows,
        )
        .with_col_widths_mm(vec![55.0, 30.0, 25.0, 30.0, 30.0])
        .with_style(stijl_tabel())
        .with_repeat_header(true),
    ));
    flow.push(Box::new(Paragraph::new("Opgave per zijde en richting. Een streep betekent niet opgegeven, niet nul. A_s wordt hier niet uit Ø en h.o.h. berekend.", style_note())));
    let milieu = w
        .milieuklasse
        .map_or("niet opgegeven".into(), |v| format!("{v:?}"));
    let sterkte = w
        .f_ct_eff_mpa
        .map_or("f_ct,eff: niet opgegeven".into(), |v| {
            format!("f_ct,eff = {v:.3} N/mm²")
        });
    let duur = match w.langdurend {
        Some(true) => "langdurend",
        Some(false) => "kortdurend",
        None => "Belastingsduur: niet opgegeven",
    };
    let hechting = match w.hoge_aanhechting {
        Some(true) => "hoge aanhechting",
        Some(false) => "glad",
        None => "Aanhechting: niet opgegeven",
    };
    flow.push(Box::new(Paragraph::new(
        format!("Scheurbasis - Milieuklasse: {milieu}; {sterkte}; {duur}; {hechting}."),
        style_body(),
    )));
}

/// Vergelijk alleen de aangeleverde element-ID's; dit is geen normtoets of bewijs
/// dat de aanroeper alle belastingcombinaties heeft meegestuurd.
fn extend_met_meshdekking(flow: &mut Vec<Box<dyn Flowable>>, p: &PlateCheckInput) {
    use std::collections::BTreeSet;
    if let Some(fout) = &p.mesh_fout {
        flow.push(Box::new(Paragraph::new(
            format!("Meshmelding: {fout}"),
            style_body(),
        )));
    }
    let ids = p
        .expected_element_ids
        .as_ref()
        .or_else(|| p.plooi.as_ref().map(|v| &v.expected_element_ids));
    let Some(ids) = ids else {
        if p.soort == plaat_check::PlaatMateriaalSoort::Beton {
            flow.push(Box::new(Paragraph::new(
                "Onafhankelijke meshverklaring: niet opgegeven; volledigheid niet vastgesteld.",
                style_note(),
            )));
        }
        return;
    };
    let verwacht: BTreeSet<_> = ids.iter().copied().collect();
    flow.push(Box::new(Paragraph::new(format!("Onafhankelijke meshverklaring: {} unieke elementen; {} dubbele ID's in de verklaring. Dit vergelijkt alleen elementsets van aangeleverde combinaties, niet de normgeldigheid.", verwacht.len(), ids.len() - verwacht.len()), style_note())));
    if verwacht.is_empty() {
        flow.push(Box::new(Paragraph::new(
            "Lege meshverklaring: volledigheid niet vastgesteld.",
            style_note(),
        )));
    }
    for (soort, c) in p
        .combinations
        .iter()
        .map(|c| ("UGT", c))
        .chain(p.frequente_combinaties.iter().map(|c| ("BGT freq.", c)))
    {
        let aanwezig: BTreeSet<_> = c.elements.iter().map(|e| e.element_id).collect();
        flow.push(Box::new(Paragraph::new(
            format!(
                "Meshdekking {soort} {}: {} ontbrekend, {} extra, {} dubbel.",
                c.combination_id,
                verwacht.difference(&aanwezig).count(),
                aanwezig.difference(&verwacht).count(),
                c.elements.len() - aanwezig.len()
            ),
            style_note(),
        )));
    }
}

fn extend_met_plaat(flow: &mut Vec<Box<dyn Flowable>>, r: &PlateCheckResult) {
    flow.push(Box::new(
        Paragraph::new(
            format!(
                "Plaat {} — {} (t = {} mm)",
                r.plate_id,
                r.materiaal,
                dikte(r.thickness_mm)
            ),
            style_h3(),
        )
        .kop(),
    ));
    flow.push(Box::new(Paragraph::new(
        format!(
            "{}    UC = {}    {}",
            r.norm,
            uc_tekst(r.uc_max),
            status_label(&r.status)
        ),
        style_body(),
    )));

    // Wat NIET getoetst is: staat vóór de getallen, want het is de grens van
    // de conclusie die eronder staat.
    if !r.niet_getoetst.is_empty() {
        flow.push(Box::new(
            Paragraph::new("Niet getoetst:", style_body()).kop(),
        ));
        for n in &r.niet_getoetst {
            flow.push(Box::new(Paragraph::new(
                format!("{} — {}", n.titel, n.reden),
                style_body(),
            )));
        }
        flow.push(Box::new(Spacer::from_mm(1.5)));
    }

    if let Some(w) = &r.wapening {
        flow.push(Box::new(
            Paragraph::new("Benodigde wapening volgens bijlage F", style_body()).kop(),
        ));
        flow.push(Box::new(
            Table::new(
                [
                    "Richting",
                    "n_td,max [kN/m]",
                    "Maatgevend element",
                    "Maatgevende combinatie",
                ]
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
             zijden samen, in de horizontale (x) en verticale (z) modelrichting. \
             De toetsing van aanwezige wapening en eventuele beperkingen staan bij de toetsen en niet-getoetste onderdelen.",
            style_note(),
        )));
        flow.push(Box::new(Paragraph::new(
            "A_s = 1000 · n_td / f_yd, met A_s in mm²/m, n_td in kN/m en f_yd in N/mm².",
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
                ["Toets", "Artikel", "UC", "Combinatie", "Status"]
                    .map(String::from)
                    .to_vec(),
                rijen,
            )
            .with_col_widths_mm(vec![62.0, 37.0, 23.0, 25.0, 23.0])
            .with_style(stijl_tabel()),
        ));
        flow.push(Box::new(Spacer::from_mm(2.0)));
    }

    // Het maatgevende element per combinatie.
    if !r.combinaties.is_empty() {
        flow.push(Box::new(
            Table::new(
                ["Combinatie", "UC", "Maatgevend element", "Toets"]
                    .map(String::from)
                    .to_vec(),
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
            .with_col_widths_mm(vec![25.0, 23.0, 35.0, 87.0])
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
                Paragraph::new(
                    format!("Maatgevende toets, uitgeschreven: {titel}"),
                    style_h3(),
                )
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
