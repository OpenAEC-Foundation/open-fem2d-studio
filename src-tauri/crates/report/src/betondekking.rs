//! Het hoofdstuk "Beton — dekkingslijn" in de PDF: het inkorten van de op trek
//! belaste langswapening volgens art. 9.2.1.3, figuur 9.2.
//!
//! # De afweging: wat van zo'n lijn hoort er op papier?
//!
//! De rekenkern levert de dekkingslijn als een punt per station, en op elke
//! zonegrens twee. Bij een ligger van zes meter met een fijn stationsraster
//! zijn dat tientallen regels per zijde, en dan nog eens zoveel voor de
//! dwarskracht. Die hele lijst als tabel afdrukken maakt een rapport dikker en
//! niet beter: honderd regels waarvan er vijf iets zeggen, leest niemand na.
//!
//! Daarom doet dit hoofdstuk twee dingen die elkaar aanvullen:
//!
//! * **De hele lijn als FIGUUR.** Daar hoort zij thuis: figuur 9.2 is in de
//!   norm zelf een tekening, en het oog ziet in één keer waar B boven C
//!   uitkomt. De tekening gebruikt het native tekenpad dat het rapport al voor
//!   de betonfiguren heeft ([`crate::betonfiguren`], [`crate::figuur`]), dus
//!   zij is vectorieel en op schaal, net als de doorsnede en het M-κ-diagram.
//! * **Alleen de KRITIEKE plaatsen als tabel.** Een plaats is kritiek zodra de
//!   benodigde trekkracht de aanwezige nadert ([`DREMPEL_UC`]) of overschrijdt,
//!   en het maatgevende punt hoort er altijd bij. Wat er niet in staat, is per
//!   definitie ruim — en het aantal weggelaten plaatsen wordt genoemd, zodat de
//!   lezer weet dat er geselecteerd is en niet gefilterd.
//!
//! # Wat woordelijk uit de kern komt
//!
//! `notes` van de lijn, `toelichting` per zijde, per bundel en per steunpunt,
//! en `reden` bij een dwarskrachtpunt zonder V_Rd. Daarin staat waarom a_l zo
//! is gelezen, wat er met N_Ed is gebeurd, waarom art. 6.2.1(8) niet is
//! toegepast en waarom V_Rd,c en V_Rd,s nergens zijn opgeteld. Dat zijn
//! normuitspraken van de rekenkern en geen rapportproza; ze worden niet
//! herschreven en niet ingekort.
//!
//! # De eindzones staan erbuiten
//!
//! Binnen l_bd van een staafuiteinde geldt niet de vrije dekkingslijn maar
//! art. 9.2.1.4/art. 9.2.1.5. De kern zondert die punten daarom uit bij het
//! aanwijzen van het maatgevende punt, en dit hoofdstuk doet dat bij de
//! kritieke plaatsen net zo — met de eis van die twee artikelen als aparte
//! tabel eronder. Zonder die uitzondering zou het maatgevende punt altijd
//! x = 0 zijn, waar de weerstandslijn per definitie bij nul begint.

use openaec_layout::{
    flowable::Flowable,
    paragraph::Paragraph,
    spacer::{PageBreak, Spacer},
    table::{Table, TableStyleConfig},
    types::{Color, Mm, Padding, Pt},
};

use concrete_check::dekkingslijn::{
    DekkingslijnAntwoord, Dwarskrachtdekking, Dwarskrachtpunt, MomentBewijs, Momentdekking,
    Momentpunt, Snedezijde, Spoor, Staafbundel, Staafeinde, SteunpuntEis, Weerstandsroute,
};
use nen_en_1992_1_1::section::RebarSide;

use crate::betonfiguren::{nl, Figuurstijl};
use crate::figuur::{Figuur, FiguurFlowable};
use crate::{style_body, style_h2, style_h3, style_mono, style_note, ReportInput, C_DEEP, C_FAIL};

/// De kop van het hoofdstuk.
pub const KOP: &str = "Beton — dekkingslijn: inkorten van de trekwapening (9.2.1.3)";

/// Vanaf welke unity check een plaats op de lijn KRITIEK heet.
///
/// 0,85 en niet 1,00: een plaats die op 0,95 zit voldoet, maar zij is precies
/// wat een lezer wil zien — daar ligt de wapening op de rand, en daar kost een
/// wijziging in de belasting of een verschoven staafeinde meteen een tekort.
/// Een drempel op 1,00 zou alleen de fouten tonen en niet de krappe plaatsen,
/// en dan is de tabel pas nuttig als het te laat is.
pub const DREMPEL_UC: f64 = 0.85;

/// Hoeveel kritieke plaatsen er hoogstens per lijn in de tabel komen.
///
/// Een lijn waarin álles krap zit levert anders alsnog de volledige lijst op,
/// en dan is er niets gewonnen. Wat er afvalt wordt geteld en genoemd; het
/// maatgevende punt valt nooit af (het staat vooraan in de sortering).
const MAX_RIJEN: usize = 16;

/// Maximale hoogte van een figuur op de bladzijde — dezelfde maat als in
/// `betonhoofdstuk`, zodat de figuren van de twee hoofdstukken even groot zijn.
const FIGUUR_MAX_H: Pt = Pt(200.0);

// ═══════════════════════════════════════════════════════════════════════
// Toepasselijkheid
// ═══════════════════════════════════════════════════════════════════════

/// Kan dit rapport dit hoofdstuk ooit vullen? Alleen met een dekkingslijn in
/// de invoer.
///
/// Anders dan bij het betonhoofdstuk is hier geen tussenstand: de dekkingslijn
/// is een aparte vraag aan de rekenkern (`concrete_dekkingslijn`), die het
/// betonvenster stelt. Is zij niet gesteld, dan is er geen antwoord dat leeg
/// kan zijn — en dan hoort er ook geen hoofdstuk te staan dat om een antwoord
/// vraagt.
pub fn van_toepassing(input: &ReportInput) -> bool {
    !input.concrete_dekkingslijnen.is_empty()
}

// ═══════════════════════════════════════════════════════════════════════
// Het hoofdstuk
// ═══════════════════════════════════════════════════════════════════════

/// Zet het hele hoofdstuk achter `flow`. Doet niets wanneer
/// [`van_toepassing`] `false` zegt.
pub fn extend_with_dekkingshoofdstuk(flow: &mut Vec<Box<dyn Flowable>>, input: &ReportInput) {
    if !van_toepassing(input) {
        return;
    }
    let stijl = Figuurstijl::default();

    flow.push(Box::new(PageBreak));
    flow.push(Box::new(Paragraph::new(KOP, style_h2()).kop()));

    flow.push(Box::new(Paragraph::new(
        "Art. 9.2.1.3(2) verschuift de momentenlijn over a_l en eist dat de trekwapening op elke \
         plaats de dan optredende trekkracht kan opnemen. Figuur 9.2 zet dat uit als drie lijnen: \
         A is de omhullende van M_Ed/z op de plaats zelf, B is diezelfde omhullende ná de \
         verschuiving — de benodigde kracht F_s — en C is de weerstandbiedende kracht F_Rs van de \
         staven die daar liggen. Binnen l_bd van een staafeinde loopt C schuin op: art. 9.2.1.3(3) \
         staat toe met een lineair krachtverloop te rekenen.",
        style_body(),
    )));
    flow.push(Box::new(Paragraph::new(
        "a_l is een LENGTE en geen richting. Bij een omhullende is de benodigde trekkracht op \
         plaats x daarom het maximum van de omhullende over het venster [x − a_l; x + a_l]; naar \
         beide kanten kijken is de enige lezing die bij elke afzonderlijke combinatie aan de \
         veilige kant blijft.",
        style_body(),
    )));

    for lijn in &input.concrete_dekkingslijnen {
        extend_met_lijn(flow, lijn, &stijl);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Eén staaf
// ═══════════════════════════════════════════════════════════════════════

fn extend_met_lijn(
    flow: &mut Vec<Box<dyn Flowable>>,
    lijn: &DekkingslijnAntwoord,
    stijl: &Figuurstijl,
) {
    flow.push(Box::new(
        Paragraph::new(
            format!(
                "Staaf {} — {} ({}, {})",
                lijn.beam_id, lijn.section_name, lijn.concrete_class, lijn.reinforcement_grade
            ),
            style_h3(),
        )
        .kop(),
    ));

    // ── De uitgangspunten van deze lijn ──────────────────────────────────
    let rijen: Vec<Vec<String>> = vec![
        vec!["Wapening".into(), lijn.reinforcement_summary.clone()],
        vec!["Staaflengte".into(), format!("{} mm", nl(lijn.lengte_mm, 0))],
        vec![
            "Rekenwaarden".into(),
            format!(
                "f_yd = {} N/mm² · f_ctk;0,05 = {} N/mm² (tabel 3.1) — zonder f_ctk;0,05 is er \
                 geen f_bd en dus geen l_bd",
                nl(lijn.f_yd_mpa, 1),
                nl(lijn.f_ctk_005_mpa, 2)
            ),
        ],
        vec![
            "Verschuiving a_l".into(),
            format!(
                "{} mm — {}. Bepaald met z = {} mm; let op dat dit een ANDERE z is dan die \
                 waarmee M_Ed per snede op kracht wordt omgerekend: voor de KRACHT F = M_Ed/z is \
                 een kleine z ongunstig, voor de VERSCHUIVING juist een grote.",
                nl(lijn.a_l_mm, 0),
                // Woordelijk de vindplaats die de kern heeft aangehouden.
                lijn.a_l_artikel,
                nl(lijn.z_voor_a_l_mm, 0)
            ),
        ],
        vec![
            "Hoogste unity check".into(),
            format!(
                "momentendekking {} · dwarskrachtdekking {}",
                lijn.uc_moment_max.map(|v| nl(v, 2)).unwrap_or_else(|| "—".into()),
                lijn.uc_dwarskracht_max.map(|v| nl(v, 2)).unwrap_or_else(|| "—".into()),
            ),
        ],
    ];
    flow.push(Box::new(
        Table::new(vec!["Uitgangspunt".into(), "Waarde".into()], rijen)
            .with_col_widths(vec![Mm(38.0).into(), Mm(132.0).into()])
            .with_style(stijl_uitgangspunten())
            .with_repeat_header(true),
    ));
    flow.push(Box::new(Spacer::from_mm(2.0)));

    // ── De twee zijden ───────────────────────────────────────────────────
    extend_met_zijde(flow, &lijn.onder, lijn, stijl);
    extend_met_zijde(flow, &lijn.boven, lijn, stijl);

    // ── De dwarskracht ───────────────────────────────────────────────────
    extend_met_dwarskracht(flow, &lijn.dwarskracht);

    // ── De steunpunten ───────────────────────────────────────────────────
    extend_met_steunpunten(flow, &lijn.steunpunten);

    // ── Wat met de hele lijn mee moet reizen, woordelijk ─────────────────
    for n in &lijn.notes {
        flow.push(Box::new(Paragraph::new(n.clone(), style_note())));
    }
    flow.push(Box::new(Spacer::from_mm(3.0)));
}

// ═══════════════════════════════════════════════════════════════════════
// Eén zijde: de figuur, de kritieke plaatsen en de bundels
// ═══════════════════════════════════════════════════════════════════════

fn zijde_woord(side: RebarSide) -> &'static str {
    match side {
        RebarSide::Bottom => "onderwapening",
        RebarSide::Top => "bovenwapening",
    }
}

fn extend_met_zijde(
    flow: &mut Vec<Box<dyn Flowable>>,
    dekking: &Momentdekking,
    lijn: &DekkingslijnAntwoord,
    stijl: &Figuurstijl,
) {
    if dekking.punten.is_empty() {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Voor de {} is geen dekkingslijn geleverd.",
                zijde_woord(dekking.side)
            ),
            style_note(),
        )));
        return;
    }

    flow.push(Box::new(
        FiguurFlowable::nieuw(
            Figuur::Dekkingslijn {
                dekking: Box::new(dekking.clone()),
                lengte_mm: lijn.lengte_mm,
            },
            stijl.clone(),
            FIGUUR_MAX_H,
        )
        .met_bijschrift(
            format!(
                "Dekkingslijn van de {} van staaf {} — figuur 9.2. De grijze banden zijn de \
                 eindzones: binnen l_bd van een staafuiteinde geldt art. 9.2.1.4/art. 9.2.1.5 en \
                 niet deze lijn. Een rood vlak is een tekort (B boven C). Het ruitje is de \
                 maatgevende plaats buiten de eindzones.",
                zijde_woord(dekking.side),
                lijn.beam_id
            ),
            style_note(),
        ),
    ));

    // ── De kritieke plaatsen ─────────────────────────────────────────────
    let (kritiek, weggelaten) = kritieke_punten(dekking);
    if kritiek.is_empty() {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Geen enkele plaats op deze lijn komt boven een unity check van {}; buiten de \
                 eindzones is de {} overal ruim. Er is daarom geen tabel met plaatsen: de figuur \
                 hierboven toont de hele lijn.",
                nl(DREMPEL_UC, 2),
                zijde_woord(dekking.side)
            ),
            style_note(),
        )));
    } else {
        flow.push(Box::new(Paragraph::new(
            format!(
                "Kritieke plaatsen in de {} — unity check ≥ {} of een tekort:",
                zijde_woord(dekking.side),
                nl(DREMPEL_UC, 2)
            ),
            style_mono(),
        )));
        flow.push(Box::new(momenttabel(&kritiek)));
        if weggelaten > 0 {
            flow.push(Box::new(Paragraph::new(
                format!(
                    "{weggelaten} verdere kritieke plaats(en) zijn niet afgedrukt; de tabel toont \
                     de zwaarste. Het maatgevende punt staat er altijd in."
                ),
                style_note(),
            )));
        }
    }

    // ── De bundels waaruit de weerstandslijn is opgebouwd ────────────────
    if !dekking.bundels.is_empty() {
        flow.push(Box::new(bundeltabel(&dekking.bundels)));
        // De kanttekeningen die de kern bij ELKE bundel hetzelfde meegeeft —
        // waarom σ_sd gelijk aan f_yd is genomen, bijvoorbeeld — komen één keer
        // onder de tabel en niet twee of drie keer eronder elkaar. Er verdwijnt
        // geen zin: elke onderscheiden tekst wordt afgedrukt, alleen de
        // letterlijke herhaling niet. Zij gaan over de afleiding als geheel en
        // niet over één bundel, en drie identieke alinea's onder elkaar lezen
        // als drie verschillende mededelingen.
        let mut gezien: Vec<&str> = Vec::new();
        // De afleiding van l_bd per bundel: welke aanhechting gold, welke
        // alfa-factoren, en of de ondergrens van (8.6)/(8.7) won. Zonder die
        // regels is de schuine tak van figuur 9.2 een getal zonder herkomst.
        for b in &dekking.bundels {
            let v = &b.verankering;
            flow.push(Box::new(Paragraph::new(
                format!(
                    "{} — η₁ = {} ({}), η₂ = {}, f_bd = {} N/mm², σ_sd = {} N/mm², l_b,rqd = \
                     {} mm; α₁·α₂·α₃·α₄·α₅ = {}{}; (8.4) geeft {} mm, l_b,min = {} mm{}.",
                    b.label,
                    nl(v.eta_1, 2),
                    v.aanhechting,
                    nl(v.eta_2, 2),
                    nl(v.f_bd_mpa, 2),
                    nl(v.sigma_sd_mpa, 1),
                    nl(v.l_b_rqd_mm, 0),
                    nl(v.alpha_product, 3),
                    if v.begrensd_door_8_5 { " (door (8.5) opgetrokken tot 0,7)" } else { "" },
                    nl(v.l_bd_berekend_mm, 0),
                    nl(v.l_b_min_mm, 0),
                    if v.ondergrens_maatgevend { " — de ondergrens is maatgevend" } else { "" },
                ),
                style_note(),
            )));
            for t in &b.toelichting {
                if gezien.contains(&t.as_str()) {
                    continue;
                }
                gezien.push(t.as_str());
                flow.push(Box::new(Paragraph::new(t.clone(), style_note())));
            }
        }
    }

    for t in &dekking.toelichting {
        flow.push(Box::new(Paragraph::new(t.clone(), style_note())));
    }
    flow.push(Box::new(Spacer::from_mm(2.0)));
}

/// De kritieke plaatsen van één zijde, zwaarste eerst, met het aantal dat is
/// weggelaten.
///
/// Het maatgevende punt staat er altijd in: het wordt vooraan gezet en telt dus
/// nooit mee bij wat er afvalt. De EINDZONES blijven erbuiten, om dezelfde
/// reden als bij het aanwijzen van het maatgevende punt — daar geldt
/// art. 9.2.1.4/art. 9.2.1.5 en niet deze lijn.
fn kritieke_punten(dekking: &Momentdekking) -> (Vec<&Momentpunt>, usize) {
    let maatgevend = dekking.maatgevend.and_then(|i| dekking.punten.get(i as usize));
    let mut kandidaten: Vec<&Momentpunt> = dekking
        .punten
        .iter()
        .filter(|p| !p.in_eindzone)
        .filter(|p| p.tekort_kn > 0.0 || p.uc.is_some_and(|u| u >= DREMPEL_UC))
        // Het maatgevende punt staat hieronder al vooraan; hier niet nog eens.
        .filter(|p| !maatgevend.is_some_and(|m| std::ptr::eq(*p, m)))
        .collect();
    // Zwaarste eerst: een tekort weegt boven een hoge unity check, want zonder
    // wapening is er geen verhouding maar wel een tekort.
    kandidaten.sort_by(|a, b| {
        sleutel(b).partial_cmp(&sleutel(a)).unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut uit: Vec<&Momentpunt> = Vec::with_capacity(MAX_RIJEN);
    if let Some(m) = maatgevend {
        uit.push(m);
    }
    let ruimte = MAX_RIJEN.saturating_sub(uit.len());
    let weggelaten = kandidaten.len().saturating_sub(ruimte);
    uit.extend(kandidaten.into_iter().take(ruimte));
    // Op volgorde van de staaf afdrukken: een tabel die van links naar rechts
    // langs de staaf loopt is naast de figuur te leggen, een tabel op zwaarte
    // niet.
    uit.sort_by(|a, b| a.x_mm.partial_cmp(&b.x_mm).unwrap_or(std::cmp::Ordering::Equal));
    (uit, weggelaten)
}

/// Waarop de zwaarte van een plaats wordt gewogen: de unity check, en bij
/// ontbrekende wapening het tekort als verhouding tot zichzelf — dan is er geen
/// uc maar wel een gebrek, en dat moet bovenaan staan.
fn sleutel(p: &Momentpunt) -> f64 {
    match p.uc {
        Some(u) => u,
        None if p.tekort_kn > 0.0 => f64::INFINITY,
        None => 0.0,
    }
}

/// Welk bewijs op een plaats gold, in woorden — art. 9.2.1.3(1) of (3).
fn bewijs_woord(b: MomentBewijs) -> &'static str {
    match b {
        MomentBewijs::GeenWapening => "geen wapening",
        MomentBewijs::VolledigOntwikkeld => "volledig ontwikkeld",
        MomentBewijs::BinnenVerankeringslengte => "binnen l_bd — lineair, 9.2.1.3(3)",
    }
}

/// Aan welke kant van een sprong een punt ligt. Op een zonegrens staan er twee
/// met dezelfde x; zonder deze kolom zou de tabel twee gelijke regels lijken te
/// hebben.
fn snede_woord(z: Snedezijde) -> &'static str {
    match z {
        Snedezijde::Enkel => "",
        Snedezijde::Links => "links",
        Snedezijde::Rechts => "rechts",
    }
}

/// De kritieke plaatsen als tabel, op volgorde van de staaf.
///
/// Het maatgevende punt wordt hier NIET apart gemerkt. De kern wijst het aan
/// met een index in de VOLLE puntenlijst, en die lijst is hier al uitgedund;
/// die index opnieuw uitrekenen zou een tweede regel voor "wat is maatgevend"
/// opleveren naast die van de kern. De figuur erboven zet er wel een ruitje op
/// — daar is de hele lijn nog beschikbaar.
fn momenttabel(punten: &[&Momentpunt]) -> Table {
    let koppen: Vec<String> = vec![
        "x [mm]".into(),
        "".into(),
        "Comb".into(),
        "M_Ed [kNm]".into(),
        "N_Ed [kN]".into(),
        "z [mm]".into(),
        "A [kN]".into(),
        "B = F_s [kN]".into(),
        "C = F_Rs [kN]".into(),
        "Tekort [kN]".into(),
        "UC".into(),
        "Bewijs".into(),
    ];

    let rijen: Vec<Vec<String>> = punten
        .iter()
        .map(|p| {
            vec![
                nl(p.x_mm, 0),
                snede_woord(p.zijde).to_string(),
                p.combinatie_id.to_string(),
                nl(p.m_ed_knm, 1),
                nl(p.n_ed_kn, 1),
                nl(p.z_mm, 0),
                nl(p.omhullende_kn, 1),
                nl(p.benodigd_kn, 1),
                nl(p.aanwezig_kn, 1),
                if p.tekort_kn > 0.0 { nl(p.tekort_kn, 1) } else { "—".to_string() },
                p.uc.map(|u| nl(u, 2)).unwrap_or_else(|| "—".to_string()),
                bewijs_woord(p.bewijs).to_string(),
            ]
        })
        .collect();

    // Samen 169 mm binnen het inhoudsvlak van 170 mm. De kolom Bewijs is ruim
    // genomen omdat "binnen l_bd, lineair (9.2.1.3(3))" daar anders over drie
    // regels valt en élke rij van de tabel driemaal zo hoog maakt — nagemeten
    // op het gerenderde blad, niet geschat.
    Table::new(koppen, rijen)
        .with_col_widths(vec![
            Mm(13.0).into(),
            Mm(9.0).into(),
            Mm(9.0).into(),
            Mm(14.0).into(),
            Mm(12.0).into(),
            Mm(12.0).into(),
            Mm(13.0).into(),
            Mm(17.0).into(),
            Mm(16.0).into(),
            Mm(15.0).into(),
            Mm(9.0).into(),
            Mm(30.0).into(),
        ])
        .with_style(stijl_lijntabel())
        .with_repeat_header(true)
}

/// De bundels: waar het staal ligt en hoe lang het moet verankeren.
fn bundeltabel(bundels: &[Staafbundel]) -> Table {
    let rijen: Vec<Vec<String>> = bundels
        .iter()
        .map(|b| {
            vec![
                zijde_woord(b.side).to_string(),
                format!("{}Ø{}", b.aantal, nl(b.diameter_mm, 0)),
                nl(b.a_s_mm2, 0),
                format!("{} – {}", nl(b.x_start_mm, 0), nl(b.x_end_mm, 0)),
                nl(b.l_bd_mm, 0),
                nl(b.f_rs_vol_kn, 1),
            ]
        })
        .collect();

    Table::new(
        vec![
            "Zijde".into(),
            "Bundel".into(),
            "A_s [mm²]".into(),
            "x [mm]".into(),
            "l_bd [mm]".into(),
            "A_s·f_yd [kN]".into(),
        ],
        rijen,
    )
    .with_col_widths(vec![
        Mm(28.0).into(),
        Mm(20.0).into(),
        Mm(24.0).into(),
        Mm(34.0).into(),
        Mm(24.0).into(),
        Mm(30.0).into(),
    ])
    .with_style(stijl_uitgangspunten())
    .with_repeat_header(true)
}

// ═══════════════════════════════════════════════════════════════════════
// De dwarskracht
// ═══════════════════════════════════════════════════════════════════════

fn route_woord(r: Option<Weerstandsroute>) -> &'static str {
    match r {
        Some(Weerstandsroute::BetonZonderWapening) => "beton zonder dwarskrachtwapening (6.2.2)",
        Some(Weerstandsroute::Dwarskrachtwapening) => "vakwerkmodel met beugels (6.2.3)",
        None => "—",
    }
}

fn spoor_woord(s: Spoor) -> &'static str {
    match s {
        Spoor::GeenBerekendeWapening => "geen berekende dwarskrachtwapening nodig",
        Spoor::Vakwerkmodel => "vakwerkmodel",
    }
}

fn extend_met_dwarskracht(flow: &mut Vec<Box<dyn Flowable>>, d: &Dwarskrachtdekking) {
    if d.punten.is_empty() {
        return;
    }
    let maatgevend = d.maatgevend.and_then(|i| d.punten.get(i as usize));
    let mut kandidaten: Vec<&Dwarskrachtpunt> = d
        .punten
        .iter()
        // Kritiek is hier: krap, of helemaal geen weerstand. Dat tweede geval
        // heeft géén unity check en zou door een drempel op uc dus wegvallen,
        // terwijl het juist het ernstigste is.
        .filter(|p| p.uc.is_some_and(|u| u >= DREMPEL_UC) || p.aanwezig_kn.is_none())
        .filter(|p| !maatgevend.is_some_and(|m| std::ptr::eq(*p, m)))
        .collect();
    kandidaten.sort_by(|a, b| {
        let s = |p: &Dwarskrachtpunt| p.uc.unwrap_or(f64::INFINITY);
        s(b).partial_cmp(&s(a)).unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut punten: Vec<&Dwarskrachtpunt> = Vec::new();
    if let Some(m) = maatgevend {
        punten.push(m);
    }
    let ruimte = MAX_RIJEN.saturating_sub(punten.len());
    let weggelaten = kandidaten.len().saturating_sub(ruimte);
    punten.extend(kandidaten.into_iter().take(ruimte));
    if punten.is_empty() {
        return;
    }
    punten.sort_by(|a, b| a.x_mm.partial_cmp(&b.x_mm).unwrap_or(std::cmp::Ordering::Equal));

    flow.push(Box::new(Paragraph::new(
        format!(
            "Dwarskrachtdekking — de maatgevende plaats en elke plaats met een unity check ≥ {} of \
             zonder V_Rd. Er staat één V_Rd per plaats, met de bewijsvoering die hem leverde: \
             art. 6.2.1(2) geeft V_Rd = V_Rd,s + V_ccd + V_td zonder betonterm en art. 6.2.3(3) \
             noemt V_Rd \"de kleinste waarde van\" (6.8) en (6.9), dus V_Rd,c en V_Rd,s worden \
             nergens opgeteld.",
            nl(DREMPEL_UC, 2)
        ),
        style_mono(),
    )));

    let rijen: Vec<Vec<String>> = punten
        .iter()
        .map(|p| {
            vec![
                nl(p.x_mm, 0),
                snede_woord(p.zijde).to_string(),
                p.combinatie_id.to_string(),
                nl(p.benodigd_kn, 1),
                p.aanwezig_kn.map(|v| nl(v, 1)).unwrap_or_else(|| "—".to_string()),
                p.uc.map(|v| nl(v, 2)).unwrap_or_else(|| "—".to_string()),
                route_woord(p.route).to_string(),
                spoor_woord(p.spoor).to_string(),
                nl(p.a_sl_gebruikt_mm2, 0),
                nl(p.a_sl_doorlopend_mm2, 0),
            ]
        })
        .collect();

    flow.push(Box::new(
        Table::new(
            vec![
                "x [mm]".into(),
                "".into(),
                "Comb".into(),
                "V_Ed [kN]".into(),
                "V_Rd [kN]".into(),
                "UC".into(),
                "Bewijsvoering".into(),
                "Spoor".into(),
                "A_sl [mm²]".into(),
                "waarvan door [mm²]".into(),
            ],
            rijen,
        )
        .with_col_widths(vec![
            Mm(13.0).into(),
            Mm(9.0).into(),
            Mm(9.0).into(),
            Mm(14.0).into(),
            Mm(14.0).into(),
            Mm(9.0).into(),
            Mm(38.0).into(),
            Mm(26.0).into(),
            Mm(15.0).into(),
            Mm(22.0).into(),
        ])
        .with_style(stijl_lijntabel())
        .with_repeat_header(true),
    ));

    if weggelaten > 0 {
        flow.push(Box::new(Paragraph::new(
            format!("{weggelaten} verdere kritieke plaats(en) zijn niet afgedrukt."),
            style_note(),
        )));
    }
    // De reden dat er geen V_Rd is, woordelijk. Rood: een snede zonder
    // weerstand is geen ontbrekend getal maar een ontbrekend bewijs.
    for p in &punten {
        if let Some(reden) = &p.reden {
            flow.push(Box::new(Paragraph::new(
                format!("x = {} mm — {}", nl(p.x_mm, 0), reden),
                let_op_stijl(),
            )));
        }
    }
    for t in &d.toelichting {
        flow.push(Box::new(Paragraph::new(t.clone(), style_note())));
    }
    flow.push(Box::new(Spacer::from_mm(2.0)));
}

// ═══════════════════════════════════════════════════════════════════════
// De steunpunten — art. 9.2.1.4 en art. 9.2.1.5
// ═══════════════════════════════════════════════════════════════════════

fn extend_met_steunpunten(flow: &mut Vec<Box<dyn Flowable>>, eisen: &[SteunpuntEis]) {
    if eisen.is_empty() {
        return;
    }
    flow.push(Box::new(Paragraph::new(
        "Bij de steunpunten — art. 9.2.1.4(1) en art. 9.2.1.5(1). De oppervlakte-eis geldt aan elk \
         uiteinde: art. 9.2.1.5(1) verklaart die van art. 9.2.1.4(1) uitdrukkelijk ook van \
         toepassing op TUSSENsteunpunten. Over de vereiste LENGTE wordt geen oordeel geveld: \
         art. 9.2.1.4(3) meet haar vanaf de raaklijn tussen balk en oplegging, en die maat kent \
         dit model niet. Beide kandidaten staan er daarom naast elkaar.",
        style_mono(),
    )));

    let rijen: Vec<Vec<String>> = eisen
        .iter()
        .map(|e| {
            vec![
                match e.uiteinde {
                    Staafeinde::Begin => "begin (x = 0)".to_string(),
                    Staafeinde::Eind => "eind (x = L)".to_string(),
                },
                nl(e.x_mm, 0),
                format!(
                    "{} van {} (β₂ = 0,25)",
                    nl(e.a_s_aanwezig_mm2, 0),
                    nl(e.a_s_vereist_mm2, 0)
                ),
                if e.voldoet_oppervlakte { "voldoet".to_string() } else { "VOLDOET NIET".to_string() },
                format!(
                    "{} kN uit |V_Ed| = {} kN en N_Ed = {} kN (a_l = {} mm, z = {} mm)",
                    nl(e.f_ed_kn, 1),
                    nl(e.v_ed_kn, 1),
                    nl(e.n_ed_kn, 1),
                    nl(e.a_l_mm, 0),
                    nl(e.z_mm, 0)
                ),
                format!(
                    "l_bd = {} · 10Φ = {}",
                    e.l_bd_mm.map(|v| format!("{} mm", nl(v, 0))).unwrap_or_else(|| "—".into()),
                    e.min_lengte_recht_mm
                        .map(|v| format!("{} mm", nl(v, 0)))
                        .unwrap_or_else(|| "—".into()),
                ),
            ]
        })
        .collect();

    flow.push(Box::new(
        Table::new(
            vec![
                "Uiteinde".into(),
                "x [mm]".into(),
                "A_s aanwezig / vereist [mm²]".into(),
                "Oppervlakte-eis".into(),
                "F_Ed volgens (9.3)".into(),
                "Verankeringslengte".into(),
            ],
            rijen,
        )
        .with_col_widths(vec![
            Mm(20.0).into(),
            Mm(13.0).into(),
            Mm(32.0).into(),
            Mm(20.0).into(),
            Mm(53.0).into(),
            Mm(31.0).into(),
        ])
        .with_style(stijl_lijntabel())
        .with_repeat_header(true),
    ));
    for e in eisen {
        for t in &e.toelichting {
            flow.push(Box::new(Paragraph::new(t.clone(), style_note())));
        }
    }
    flow.push(Box::new(Spacer::from_mm(2.0)));
}

// ═══════════════════════════════════════════════════════════════════════
// Opmaak
// ═══════════════════════════════════════════════════════════════════════

/// Een melding waar de lezer overheen moet struikelen — rood, dezelfde keuze
/// als in `betonhoofdstuk`.
fn let_op_stijl() -> openaec_layout::paragraph::ParagraphStyle {
    openaec_layout::paragraph::ParagraphStyle { text_color: C_FAIL, ..style_note() }
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

/// Dezelfde maten als de segmenttabel van het betonhoofdstuk: veel smalle
/// kolommen, en een kop die een halve punt kleiner is omdat de motor de
/// breedte van vette tekst met dezelfde factor schat als die van gewone.
fn stijl_lijntabel() -> TableStyleConfig {
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
