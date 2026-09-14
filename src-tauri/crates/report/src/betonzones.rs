//! De wapeningszones van een betonstaaf, en de korf die op de MAATGEVENDE
//! snede gold.
//!
//! # Waarom dit in het rapport hoort
//!
//! Sinds [`nen_en_1992_1_1::section::ReinforcementZones`] bestaat, toetst de
//! betonkern niet meer met één korf voor de hele staaf: op elke snede wordt
//! `cage_at_mm` gevraagd, en er wordt dus gerekend met de wapening die dáár
//! ligt. Het rapport toonde tot nu toe alleen de korf van de staaf
//! (`reinforcement_summary`) — de basiskorf, en juist die geldt op een
//! ingekorte plaats NIET.
//!
//! Daarmee was een unity check niet na te rekenen. Wie bij x = 4200 mm een
//! M_Rd ziet staan met daarboven "onder 5Ø20", kan die twee niet met elkaar
//! rijmen zodra de veldwapening al op 3000 mm ophoudt. Het getal is goed, de
//! verantwoording ontbreekt. Dit blok vult dat gat: het toont de zone-indeling
//! en noemt de korf op de plaats van de maatgevende toets.
//!
//! # Er wordt hier niets afgeleid
//!
//! De korf op een plaats komt uit
//! [`ReinforcementZones::cage_at_mm`] — dezelfde functie waarmee de toetsing
//! zelf rekent. Een tweede regel voor "welke zone geldt hier" zou precies het
//! soort verschil opleveren dat in een rapport onzichtbaar blijft: de tabel zou
//! een andere korf noemen dan de toets erboven heeft gebruikt. Om dezelfde
//! reden komen de regels "3Ø16" en de beugelmaten uit `RebarRow::label` van
//! de kern, en niet uit een eigen opmaakregel hier.
//!
//! # Wanneer dit blok wegblijft
//!
//! Bij een staaf zonder zones. Dan geldt de basiskorf over de hele lengte en
//! dat staat al in de gegevensregel van die staaf; een tabel met één rij die
//! datzelfde herhaalt maakt het rapport langer en niet duidelijker.

use openaec_layout::{
    flowable::Flowable,
    paragraph::Paragraph,
    spacer::Spacer,
    table::{Table, TableStyleConfig},
    types::{Color, Mm, Padding, Pt},
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use nen_en_1992_1_1::section::{RebarSide, ReinforcementCage, ReinforcementZones};
use nen_en_1992_1_1::verankering::{Staafvorm, Stortpositie};
use steel_check::result::{CheckKind, NamedCheck};

use crate::betonfiguren::nl;
use crate::{style_h3, style_note, C_DEEP};

/// De zone-indeling van één betonstaaf, zoals de toetsing hem gekregen heeft.
///
/// Spiegel van de drie velden van `ConcreteBeamCheckInput` die hierover gaan
/// (`cage`, `reinforcement_zones` en `length_m`), plus het staafnummer. Bewust
/// niet het hele invoertype: dat draagt ook de omhullende, de milieuklasse en
/// de kolomgegevens, en die zouden dan meereizen door een rapportinvoer die er
/// niets mee doet.
///
/// De lengte staat er in MILLIMETER in, want de zonegrenzen staan dat ook; een
/// tabel waarin de ene kolom meters en de andere millimeters is, leest verkeerd.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BetonStaafZones {
    pub beam_id: u32,
    /// Staaflengte, mm — waar de laatste zone uiterlijk ophoudt.
    pub lengte_mm: f64,
    /// De korf van de staaf: wat geldt waar de zonelijsten niets zeggen.
    pub korf: ReinforcementCage,
    /// De zone-indeling zoals de kern hem kreeg. Beide lijsten leeg = geen
    /// indeling, en dan blijft dit blok weg.
    pub zones: ReinforcementZones,
}

/// De zones van staaf `beam_id`, als ze zijn meegestuurd ÉN er iets te verdelen
/// valt.
///
/// Een meegestuurde maar lege indeling telt als "geen zones": `is_empty()` op
/// [`ReinforcementZones`] betekent letterlijk dat overal dezelfde korf geldt.
pub fn zones_van(alle: &[BetonStaafZones], beam_id: u32) -> Option<&BetonStaafZones> {
    alle.iter().find(|z| z.beam_id == beam_id && !z.zones.is_empty())
}

/// De twee hoofdwapeningsrijen van een korf op één regel, in de schrijfwijze
/// van de kern zelf.
fn korf_kort(korf: &ReinforcementCage) -> String {
    format!("onder {} · boven {}", korf.bottom.label(), korf.top.label())
}

/// De vorm van het staafeinde in woorden — tabel 8.2, regel "Vorm van de
/// staaf". Uitgeschreven en niet als `{:?}`: een rapport dat `AndersDanRecht`
/// afdrukt, laat de lezer de broncode raden.
fn vorm_woord(v: Staafvorm) -> &'static str {
    match v {
        Staafvorm::Recht => "recht",
        Staafvorm::AndersDanRecht => "anders dan recht (fig. 8.1 b/c/d)",
    }
}

/// De stortpositie in woorden — figuur 8.2, bepaalt eta_1 in (8.2).
fn stort_woord(p: Stortpositie) -> &'static str {
    match p {
        Stortpositie::Onderzijde => "gestort aan de onderzijde",
        Stortpositie::Bovenzijde => "gestort aan de bovenzijde",
        Stortpositie::Glijbekisting => "glijbekisting",
        Stortpositie::GoedAangetoond => "aanhechting aangetoond goed",
    }
}

/// De zone-indeling en de korf op de maatgevende snede, achter de kop van één
/// staaf in het rapport.
///
/// `checks` zijn de toetsen van die staaf en `governing_check_id` de
/// maatgevende; daaruit volgt de PLAATS waarvoor de korf wordt opgezocht.
/// Zonder maatgevende toets — een staaf die de kern heeft geweigerd — blijft
/// die regel weg en staat alleen de indeling er; een korf bij een plaats die
/// niet bestaat zou een verzonnen verantwoording zijn.
pub fn extend_met_zoneblok(
    flow: &mut Vec<Box<dyn Flowable>>,
    zones: &BetonStaafZones,
    checks: &[NamedCheck],
    governing_check_id: &str,
) {
    flow.push(Box::new(
        Paragraph::new(
            "Wapeningszones langs de staaf — art. 9.2.1.3 (langswapening) en art. 9.2.2 (beugels)",
            style_h3(),
        )
        .kop(),
    ));

    let mut rijen: Vec<Vec<String>> = Vec::new();
    for z in &zones.zones.longitudinal {
        rijen.push(vec![
            match z.side {
                RebarSide::Bottom => "onder".to_string(),
                RebarSide::Top => "boven".to_string(),
            },
            format!("{} - {}", nl(z.x_start_mm, 0), nl(z.x_end_mm, 0)),
            z.row.label(),
            // Vorm en stortpositie zijn UITVOERINGSgegevens die l_bd sturen
            // (tabel 8.2 alpha_1 en (8.2) eta_1). Zonder die twee in het rapport
            // is de verankeringslengte — en daarmee de schuine tak van
            // figuur 9.2 — niet na te rekenen.
            format!("{} · {}", vorm_woord(z.bar_shape), stort_woord(z.casting_position)),
        ]);
    }
    for z in &zones.zones.stirrups {
        rijen.push(vec![
            "beugels".to_string(),
            format!("{} - {}", nl(z.x_start_mm, 0), nl(z.x_end_mm, 0)),
            format!("Ø{} — {}-benig, s = {} mm", nl(z.diameter_mm, 0), z.legs, nl(z.spacing_mm, 0)),
            String::new(),
        ]);
    }

    flow.push(Box::new(
        Table::new(
            vec!["Zijde".into(), "x [mm]".into(), "Wapening".into(), "Uitvoering".into()],
            rijen,
        )
        .with_col_widths(vec![
            Mm(18.0).into(),
            Mm(32.0).into(),
            Mm(48.0).into(),
            Mm(72.0).into(),
        ])
        .with_style(stijl_zonetabel())
        .with_repeat_header(true),
    ));

    // Buiten elke zone geldt de korf van de staaf zelf. Dat staat er
    // uitdrukkelijk bij, want een lezer die alleen de tabel ziet zou denken dat
    // er buiten de genoemde stukken géén wapening ligt.
    flow.push(Box::new(Paragraph::new(
        format!(
            "Staaflengte {} mm. Waar geen zone iets zegt, geldt de korf van de staaf: {}. De \
             beugelvelden van die korf gelden op dezelfde manier waar de beugellijst zwijgt.",
            nl(zones.lengte_mm, 0),
            korf_kort(&zones.korf)
        ),
        style_note(),
    )));

    match plaats_van(checks, governing_check_id) {
        Some(x_mm) => {
            // DEZELFDE functie als de toetsing zelf gebruikt — zie de moduletekst.
            let korf = zones.zones.cage_at_mm(&zones.korf, x_mm);
            flow.push(Box::new(Paragraph::new(
                format!(
                    "Op de maatgevende snede x = {} mm gold: {} (A_s,onder = {} mm², A_s,boven = \
                     {} mm²). Dat is de korf waarmee de maatgevende unity check hierboven is \
                     gerekend; met de basiskorf van de staaf is die niet na te rekenen.",
                    nl(x_mm, 0),
                    korf_kort(&korf),
                    nl(korf.a_s_bottom_mm2(), 0),
                    nl(korf.a_s_top_mm2(), 0),
                ),
                style_note(),
            )));
        }
        None => flow.push(Box::new(Paragraph::new(
            "De maatgevende toets staat niet in de toetslijst van deze staaf, dus de plaats ervan \
             is onbekend en de geldende korf wordt niet genoemd. Een korf bij een plaats die er \
             niet is, zou een verzonnen verantwoording zijn.",
            style_note(),
        ))),
    }
    flow.push(Box::new(Spacer::from_mm(1.5)));
}

/// De plaats van de maatgevende toets langs de staaf, mm.
fn plaats_van(checks: &[NamedCheck], governing_check_id: &str) -> Option<f64> {
    let nc = checks.iter().find(|c| c.id == governing_check_id)?;
    Some(match &nc.kind {
        CheckKind::Resistance(r) => r.force_state.position_mm,
        CheckKind::Stability(s) => s.force_state.position_mm,
    })
}

/// Dezelfde opmaak als de uitgangspuntentabel van het betonhoofdstuk: dit is
/// INVOER die verantwoord wordt, geen rekenuitkomst.
fn stijl_zonetabel() -> TableStyleConfig {
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
