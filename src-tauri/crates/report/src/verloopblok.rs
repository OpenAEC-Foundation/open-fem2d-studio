//! Verlopend profiel in de PDF: de toetsdoorsneden van één staaf
//! (ontwerp 15-09-2026, §6).
//!
//! # WAT HIER OP PAPIER KOMT
//!
//! Bij een prismatische staaf zegt "UC = 0,87 op 6.2.5" alles: er is één
//! doorsnede en die staat in de kop van het hoofdstukje. Bij een VERLOPENDE
//! staaf zegt datzelfde getal de helft, want de lezer weet dan niet wélke
//! doorsnede het was. Erger nog: de maatgevende plek ligt bij een verlopende
//! staaf lang niet altijd bij de grootste snedekracht — wat telt is de
//! verhouding van kracht tot plaatselijke weerstand, en die kan bij een
//! uitkrager met verlopende hoogte ver van de inklemming liggen.
//!
//! Daarom staat er per verlopende staaf:
//! * een tabel met de ZES toetsdoorsneden (x ≈ 0, L/5, …, L): hun plaats, hun
//!   maten, A, W_y, de doorsnedeklasse ter plaatse en de hoogste unity check
//!   die daar gevonden is;
//! * één regel die het MAATGEVENDE punt noemt, met toets en unity check;
//! * de doorsnede waarmee elke STABILITEITStoets is gerekend, met de reden
//!   die de kern erbij geeft.
//!
//! # NIETS WORDT HIER UITGEREKEND
//!
//! Alle getallen komen uit [`VerloopRapport`], dat de kern al heeft gevuld
//! (`steel_check::verlopend` en `timber_check::verlopend`). Dit bestand zet ze
//! alleen. Zou het hier iets narekenen, dan zouden er twee waarheden in het
//! rapport staan; de reden bij de stabiliteitsdoorsnede wordt om dezelfde
//! reden WOORDELIJK overgenomen en niet samengevat.
//!
//! Dit is de papieren tweelingbroer van `VerloopBlok` in
//! `design-mockup/src/components/report/sections/CheckDetailSection.tsx`:
//! dezelfde kolommen, dezelfde volgorde, dezelfde teksten.

use openaec_layout::{
    flowable::Flowable,
    paragraph::Paragraph,
    spacer::Spacer,
    table::{Table, TableStyleConfig},
    types::{Color, Mm, Padding, Pt},
};

use steel_check::result::{Toetsdoorsnede, VerloopMaten, VerloopRapport};

use crate::betonfiguren::nl;
use crate::{style_h3, style_note, C_DEEP};

/// De maten van één doorsnede in één cel: bij staal de vier plaatmaten, bij
/// hout de rechthoek b × h. Wat er niet is (t_w, t_f bij hout) wordt niet
/// verzonnen en ook niet als 0 getoond.
fn maten_cel(m: &VerloopMaten) -> String {
    match (m.tw_mm, m.tf_mm) {
        (Some(tw), Some(tf)) => format!(
            "h {} · b {} · t_w {} · t_f {}",
            nl(m.h_mm, 1),
            nl(m.b_mm, 1),
            nl(tw, 1),
            nl(tf, 1)
        ),
        _ => format!("{} × {}", nl(m.b_mm, 1), nl(m.h_mm, 1)),
    }
}

/// De hoogste unity check op één toetsdoorsnede, met het toets-id erbij.
///
/// Een toets die op deze plek NIET gerekend is, draagt geen unity check en
/// telt hier dus niet mee — dat is iets anders dan een unity check van 0,00,
/// en het verschil hoort in het rapport zichtbaar te blijven (een streepje).
fn hoogste_uc(d: &Toetsdoorsnede) -> Option<(&str, f64)> {
    let mut beste: Option<(&str, f64)> = None;
    for t in &d.toetsen {
        let Some(uc) = t.uc else { continue };
        if beste.is_none_or(|(_, b)| uc > b) {
            beste = Some((t.id.as_str(), uc));
        }
    }
    beste
}

/// Het artikelnummer uit een toets-id ("6.2.5_bending_y" → "6.2.5").
fn artikel(id: &str) -> &str {
    id.split('_').next().unwrap_or(id)
}

fn stijl_tabel() -> TableStyleConfig {
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
        // Zelfde reden als bij de tabellen van het houthoofdstuk: de vette kop
        // wordt met dezelfde factor gemeten als gewone tekst en loopt bij
        // gelijke korpsgrootte over de kolomlijn heen.
        header_font_size: Pt(6.0),
    }
}

/// De tabel met de zes toetsdoorsneden. Het maatgevende rekenpunt krijgt een
/// sterretje bij de plaats: een lezer die de tabel scant, moet die regel
/// kunnen vinden zonder de zin eronder te lezen.
fn tabel_toetsdoorsneden(v: &VerloopRapport) -> Table {
    let koppen: Vec<String> = vec![
        "x [mm]".into(),
        "t = x/L".into(),
        "Doorsnede [mm]".into(),
        "A [mm\u{b2}]".into(),
        "W_y [mm\u{b3}]".into(),
        "Klasse".into(),
        "hoogste UC".into(),
    ];
    let maat_x = v.maatgevend.as_ref().map(|m| m.doorsnede.x_mm);
    let rij = |d: &Toetsdoorsnede, maatgevend: bool| -> Vec<String> {
        vec![
            format!("{}{}", nl(d.x_mm, 0), if maatgevend { " *" } else { "" }),
            nl(d.t, 3),
            maten_cel(&d.maten),
            nl(d.area_mm2, 0),
            nl(d.w_y_mm3, 0),
            d.klasse.map(|k| format!("{k:?}")).unwrap_or_else(|| "\u{2013}".into()),
            match hoogste_uc(d) {
                Some((id, uc)) => format!("{} ({})", nl(uc, 2), artikel(id)),
                None => "\u{2013}".into(),
            },
        ]
    };
    let hoort_erbij = |x: f64| maat_x.is_some_and(|m| (m - x).abs() < 1e-9);
    let mut rijen: Vec<Vec<String>> =
        v.toetsdoorsneden.iter().map(|d| rij(d, hoort_erbij(d.x_mm))).collect();
    // HET MAATGEVENDE PUNT ERBIJ, als het niet toevallig op een van de zes
    // ligt. Dat is bij een verlopende staaf eerder regel dan uitzondering: de
    // toetsing zoekt over ALLE rekenpunten en de hoogste verhouding van kracht
    // tot plaatselijke weerstand valt zelden precies op een vijfde van de
    // lengte. Zonder deze regel zou de tabel de zes gevraagde plaatsen tonen en
    // de plaats die het ontwerp begrenst juist niet.
    if let Some(m) = &v.maatgevend {
        if !v.toetsdoorsneden.iter().any(|d| (d.x_mm - m.doorsnede.x_mm).abs() < 1e-9) {
            let mut extra = rij(&m.doorsnede, true);
            // Op deze regel is de unity check die van de maatgevende toets
            // zelf; die staat niet per se als hoogste in `toetsen` wanneer de
            // kern daar meer toetsen heeft gerekend.
            extra[6] = format!("{} ({})", nl(m.uc, 2), artikel(&m.toets_id));
            rijen.push(extra);
        }
    }
    // Kolombreedtes samen 169 mm binnen het inhoudsvlak van 170 mm.
    Table::new(koppen, rijen)
        .with_col_widths(vec![
            Mm(18.0).into(),
            Mm(16.0).into(),
            Mm(52.0).into(),
            Mm(21.0).into(),
            Mm(25.0).into(),
            Mm(14.0).into(),
            Mm(23.0).into(),
        ])
        .with_style(stijl_tabel())
        .with_repeat_header(true)
}

/// De doorsnede waarmee elke stabiliteitstoets is gerekend.
fn tabel_stabiliteit(v: &VerloopRapport) -> Table {
    let koppen: Vec<String> = vec![
        "Toets".into(),
        "x [mm]".into(),
        "Doorsnede [mm]".into(),
        "A [mm\u{b2}]".into(),
        "W_y [mm\u{b3}]".into(),
    ];
    let rijen: Vec<Vec<String>> = v
        .stabiliteit
        .iter()
        .map(|s| {
            vec![
                artikel(&s.toets_id).to_string(),
                nl(s.x_mm, 0),
                maten_cel(&s.maten),
                nl(s.area_mm2, 0),
                nl(s.w_y_mm3, 0),
            ]
        })
        .collect();
    Table::new(koppen, rijen)
        .with_col_widths(vec![
            Mm(24.0).into(),
            Mm(18.0).into(),
            Mm(72.0).into(),
            Mm(24.0).into(),
            Mm(31.0).into(),
        ])
        .with_style(stijl_tabel())
        .with_repeat_header(true)
}

/// Het hele blok voor één staaf. Doet niets wanneer de staaf niet verloopt —
/// dan draagt het resultaat geen [`VerloopRapport`] en blijft de PDF van dat
/// model byte-gelijk aan die van vóór dit spoor.
pub fn extend_met_verloopblok(flow: &mut Vec<Box<dyn Flowable>>, v: &VerloopRapport) {
    flow.push(Box::new(
        Paragraph::new("Verlopend profiel \u{2014} toetsdoorsneden", style_h3()).kop(),
    ));
    flow.push(Box::new(Paragraph::new(
        format!(
            "De maten verlopen lineair van {} bij x = 0 naar {} bij x = L. Elke doorsnedetoets is \
             op alle {} rekenpunten met de plaatselijke doorsnede uitgevoerd; hieronder staan er \
             zes, plus \u{2014} met een * achter de plaats \u{2014} het maatgevende rekenpunt.",
            v.begin_naam, v.eind_naam, v.aantal_rekenpunten
        ),
        style_note(),
    )));
    flow.push(Box::new(Spacer::from_mm(1.0)));
    flow.push(Box::new(tabel_toetsdoorsneden(v)));
    flow.push(Box::new(Spacer::from_mm(1.5)));

    if let Some(m) = &v.maatgevend {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Maatgevend punt: x = {} mm (t = {}), toets {}, UC = {}. Bij een verlopende staaf \
                 hoeft dat punt niet bij de grootste snedekracht te liggen: wat telt is de \
                 verhouding van kracht tot plaatselijke weerstand.",
                nl(m.doorsnede.x_mm, 0),
                nl(m.doorsnede.t, 3),
                artikel(&m.toets_id),
                nl(m.uc, 2)
            ),
            style_note(),
        )));
        flow.push(Box::new(Spacer::from_mm(1.5)));
    }

    if !v.stabiliteit.is_empty() {
        flow.push(Box::new(
            Paragraph::new("Doorsnede voor de stabiliteitstoetsen", style_h3()).kop(),
        ));
        flow.push(Box::new(tabel_stabiliteit(v)));
        flow.push(Box::new(Spacer::from_mm(1.0)));
        // De reden woordelijk uit de kern: hij noemt welke kandidaatdoorsneden
        // zijn doorgerekend en waarom déze maatgevend is. Samenvatten zou hier
        // betekenen dat het rapport iets anders beweert dan de toetsing.
        for s in &v.stabiliteit {
            flow.push(Box::new(Paragraph::new(
                format!("{}: {}", artikel(&s.toets_id), s.reden),
                style_note(),
            )));
        }
        flow.push(Box::new(Spacer::from_mm(1.5)));
    }

    for n in &v.notities {
        flow.push(Box::new(Paragraph::new(n.clone(), style_note())));
    }
    if !v.notities.is_empty() {
        flow.push(Box::new(Spacer::from_mm(1.5)));
    }
}
