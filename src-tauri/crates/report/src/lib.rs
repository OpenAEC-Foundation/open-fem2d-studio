//! Constructieve-toetsing PDF report (EN 1993-1-1 staal, EN 1995-1-1 hout én
//! kruislaaghout, EN 1992-1-1 beton, plus de norm-onafhankelijke vrije
//! spanningstoets) — built on **OpenAEC Foundation `openaec-layout`**.
//!
//! `openaec-layout` is the Rust equivalent of ReportLab Platypus: Flowables
//! (Paragraph, Table, Spacer, PageBreak) flow through Frames in PageTemplates,
//! and the DocTemplate runs the page-break engine and renders to PDF via
//! printpdf 0.7.
//!
//! Fonts: Liberation Sans (OFL), bundled via include_bytes!.
//!
//! # Het rapport claimt alleen wat het draagt
//!
//! Alle vijf de kernen leveren hetzelfde `NamedCheck`-contract, dus ze lopen
//! door één renderpad ([`report_members`]). Dat pad is ook de ENIGE bron voor
//! wat het rapport over normen zegt: [`norms_line`] en het infoblok op het
//! omslag noemen uitsluitend kaders waarvan er resultaten in de invoer zitten,
//! en de vrije spanningstoets zegt met zoveel woorden dat zij bij géén norm
//! hoort. Een rapport zonder ook maar één getoetste staaf noemt dus geen enkele
//! norm en toont geen samenvattingstabel, maar de reden waarom het leeg is.
//!
//! # De betonkant
//!
//! Vier modules dragen samen het hoofdstuk "Beton — fysisch niet-lineaire
//! tweede orde":
//!
//! * [`betonfiguren`] tekent de vier figuren native op een `DrawList`
//!   (doorsnede met korf, M-κ, N-M-interactie en het EI-verloop);
//! * [`figuur`] maakt daar een opmaakelement van dat meedoet in de paginering;
//! * [`betonspoor`] is het invoertype van het segmentspoor — de spiegel van
//!   `betonStijfheidStore` in de frontend;
//! * [`betonhoofdstuk`] zet die drie om in het hoofdstuk zelf, en bepaalt of
//!   het hoofdstuk überhaupt van toepassing is.

pub mod betonfiguren;
pub mod betonhoofdstuk;
pub mod betonspoor;
pub mod figuur;

use openaec_layout::{
    doc_template::{DocTemplate, RawPage},
    draw::DrawList,
    flowable::Flowable,
    fonts::shared_font_registry,
    frame::Frame,
    page_template::{PageCallback, PageTemplate},
    paragraph::{Paragraph, ParagraphStyle},
    spacer::{PageBreak, Spacer},
    table::{Table, TableStyleConfig},
    types::{Color, Mm, Padding, Pt, Rect, Size, A4},
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use concrete_check::ConcreteBeamCheckResult;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue};
use spanning_check::SpanningBeamCheckResult;
use steel_check::result::{BeamCheckResult, CheckKind, NamedCheck};
use timber_check::clt::CltBeamCheckResult;
use timber_check::TimberBeamCheckResult;

// ── Bundled fonts (Liberation Sans, OFL licence) ──────────────────────────────

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");
const FONT_ITALIC: &[u8] = include_bytes!("../fonts/LiberationSans-Italic.ttf");
const FONT_BOLD_ITALIC: &[u8] = include_bytes!("../fonts/LiberationSans-BoldItalic.ttf");

// ── OpenAEC colour palette ────────────────────────────────────────────────────

pub(crate) const C_AMBER: Color = Color::rgb(217, 119, 6); //  #D97706
pub(crate) const C_DEEP: Color = Color::rgb(54, 54, 62); //  #36363E
pub(crate) const C_TEXT: Color = Color::rgb(38, 38, 46); //  near-black
pub(crate) const C_MUTED: Color = Color::rgb(87, 83, 78); //  warm grey
pub(crate) const C_OK: Color = Color::rgb(22, 163, 74); //  #16A34A
pub(crate) const C_FAIL: Color = Color::rgb(220, 38, 38); //  #DC2626
pub(crate) const C_HEADER_BG: Color = Color::rgb(245, 240, 230); //  faint warm tint
pub(crate) const C_DIVIDER: Color = Color::rgb(217, 119, 6); //  amber rule

// ── Input types ───────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct ReportInput {
    pub project_name: String,
    pub project_number: String,
    pub engineer: String,
    pub company: String,
    pub date: String,
    pub steel_check_results: Vec<BeamCheckResult>,
    /// Houttoetsingen (EN 1995-1-1). `#[serde(default)]` zodat bestaande
    /// aanroepen zonder dit veld geldig blijven; in TypeScript daarom
    /// optioneel.
    #[serde(default)]
    #[ts(as = "Option<Vec<TimberBeamCheckResult>>", optional)]
    pub timber_check_results: Vec<TimberBeamCheckResult>,
    /// Kruislaaghout (EN 1995-1-1, een toets per lamel plus de rolschuif uit
    /// bijlage B). Draagt dezelfde velden als een houtresultaat en volgt
    /// daarom hetzelfde renderpad; alleen de laagtabel en de laagtekening uit
    /// het live rapport blijven hier weg.
    ///
    /// `#[serde(default)]` om dezelfde reden als bij hout: een bestaande
    /// aanroep zonder dit veld blijft geldig.
    #[serde(default)]
    #[ts(as = "Option<Vec<CltBeamCheckResult>>", optional)]
    pub clt_check_results: Vec<CltBeamCheckResult>,
    /// Betontoetsingen (EN 1992-1-1): buiging met normaalkracht op de
    /// doorsnede. `#[serde(default)]` om dezelfde reden als bij hout —
    /// bestaande aanroepen zonder dit veld blijven geldig.
    ///
    /// LET OP bij het lezen van deze resultaten: de betonkern toetst
    /// uitsluitend de doorsnede op M en N. Dwarskracht, wringing, pons,
    /// scheurwijdte, doorbuiging, tweede-orde-effecten en de
    /// detailleringsregels zitten er NIET in; zie het beperkingenblok van de
    /// betonsectie in het live rapport.
    ///
    /// De tweede orde is daarmee niet per se afwezig uit de BEREKENING: het
    /// analysetype "2e orde + fysisch" bepaalt de krachtsverdeling met de
    /// algemene methode van 5.8.6, via `concrete_check::segments` en de lus in
    /// de frontend. Dat spoor reist mee in [`Self::concrete_stiffness_trace`],
    /// en daaruit bouwt [`crate::betonhoofdstuk`] het hoofdstuk "Beton —
    /// fysisch niet-lineaire tweede orde" mét de vier figuren.
    #[serde(default)]
    #[ts(as = "Option<Vec<ConcreteBeamCheckResult>>", optional)]
    pub concrete_check_results: Vec<ConcreteBeamCheckResult>,
    /// De vrije spanningstoets: een doorsnede en een OPGEGEVEN toelaatbare
    /// spanning, getoetst op de vergelijkspanning van von Mises. Hoort bij géén
    /// norm, en het rapport zegt dat ook zo — zie [`ReportMember::norm`].
    ///
    /// Zonder dit veld levert een model met uitsluitend vrije materialen een
    /// rapport zonder één getoetste staaf, terwijl de gebruiker wél heeft
    /// getoetst. Daarom reist het mee.
    ///
    /// `#[serde(default)]` om dezelfde reden als bij de andere kernen.
    #[serde(default)]
    #[ts(as = "Option<Vec<SpanningBeamCheckResult>>", optional)]
    pub stress_check_results: Vec<SpanningBeamCheckResult>,
    /// Het segmentspoor van de fysisch niet-lineaire tweede orde: per
    /// belastingcombinatie de segmenttabel van de laatste ronde, het
    /// convergentieverloop, de doorsnede en de korf per staaf, en de
    /// verplichte kruipvermelding zoals de kern die teruggeeft.
    ///
    /// `#[serde(default)]` om dezelfde reden als bij hout en beton: een
    /// bestaande aanroep zonder dit veld blijft geldig, en in TypeScript is
    /// het daarom optioneel.
    ///
    /// Ontbreekt het spoor, dan blijft het betonhoofdstuk weg wanneer er ook
    /// geen betontoetsingen zijn; zijn die er wél, dan staat het hoofdstuk er
    /// met de eerlijke melding dat er niet fysisch gerekend is. Dat verschil is
    /// hetzelfde onderscheid dat `design-mockup/src/lib/sectieRelevantie.ts`
    /// maakt: "kan dit model dit ooit vullen" laat een hoofdstuk weg, "is het
    /// nu leeg" is een rekenstand en laat het staan.
    #[serde(default)]
    #[ts(optional)]
    pub concrete_stiffness_trace: Option<betonspoor::BetonStijfheidSpoor>,
}

// ── Materiaal-neutrale rapportweergave ────────────────────────────────────────

/// Kort normlabel voor staaltoetsingen.
pub const NORM_STEEL: &str = "EN 1993-1-1";
/// Kort normlabel voor houttoetsingen.
pub const NORM_TIMBER: &str = "EN 1995-1-1";
/// Kort normlabel voor betontoetsingen.
pub const NORM_CONCRETE: &str = "EN 1992-1-1";
/// Wat er staat waar bij de andere kernen een norm staat. De vrije
/// spanningstoets vergelijkt met een opgegeven toelaatbare spanning; "EN …"
/// suggereren zou de lezer op het verkeerde been zetten. Zelfde bewoording als
/// `normLabel` in de frontend.
pub const GEEN_NORM: &str = "geen norm";

/// Volledige normaanduiding (cover) voor staal.
const NORM_STEEL_FULL: &str = "NEN-EN 1993-1-1+C2+A1/NB:2016 nl";
/// Volledige normaanduiding (cover) voor hout.
const NORM_TIMBER_FULL: &str = "NEN-EN 1995-1-1+C1+A1:2011/NB:2013 nl";
/// Volledige normaanduiding (cover) voor beton — dezelfde uitgave als waaruit
/// de `nen-en-1992-1-1`-crate haar waarden leest (zie de crate-doc daar).
const NORM_CONCRETE_FULL: &str = "NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020 nl";
/// Wat er in het infoblok op het omslag staat voor de vrije spanningstoets:
/// geen normaanduiding maar de vermelding dát er geen norm achter zit, zodat
/// het omslag ook zonder Eurocode-toets iets waars zegt. Kort gehouden, want
/// deze regel wordt als één lijn getekend en niet afgebroken, en hij begint al
/// 55 mm van de linkerrand.
const NORM_VRIJ_FULL: &str = "geen norm — tegen een opgegeven toelaatbare spanning";

/// Uniforme, materiaal-neutrale kijk op één getoetste staaf. De
/// samenvattingstabel en de per-staaf-blokken worden hieruit gerenderd, zodat
/// staal, hout, kruislaaghout, beton en de vrije spanningstoets gegarandeerd
/// hetzelfde pad volgen.
pub struct ReportMember<'a> {
    pub beam_id: u32,
    /// Kort normlabel: [`NORM_STEEL`], [`NORM_TIMBER`] of [`NORM_CONCRETE`] —
    /// of `None` wanneer er géén norm achter de toets zit (de vrije
    /// spanningstoets). Het rapport mag geen norm noemen die niet is
    /// toegepast, en dat onderscheid moet dus in de gegevens staan en niet in
    /// een tekstuele terugval.
    pub norm: Option<&'static str>,
    /// Profiel- of doorsnedenaam ("HEB160", "96 x 450", "300 x 500").
    pub section_label: &'a str,
    /// Staalsoort, sterkteklasse, betonsterkteklasse of vrije materiaalnaam
    /// ("S235", "C24", "C30/37", "natuursteen").
    pub grade_label: &'a str,
    pub uc_max: f64,
    pub status: &'a CheckStatus,
    pub governing_check_id: &'a str,
    pub checks: &'a [NamedCheck],
}

impl ReportMember<'_> {
    /// Wat er in de kolom "Standard" en achter de kopregel van de staaf komt.
    pub fn norm_label(&self) -> &'static str {
        self.norm.unwrap_or(GEEN_NORM)
    }
}

/// Alle staven als [`ReportMember`], gesorteerd op staaf-id. Bij gelijk id
/// blijft de invoegvolgorde staal → hout → kruislaaghout → beton → vrije
/// spanning staan (stabiele sortering).
pub fn report_members(input: &ReportInput) -> Vec<ReportMember<'_>> {
    let mut members: Vec<ReportMember<'_>> = Vec::with_capacity(
        input.steel_check_results.len()
            + input.timber_check_results.len()
            + input.clt_check_results.len()
            + input.concrete_check_results.len()
            + input.stress_check_results.len(),
    );

    for r in &input.steel_check_results {
        members.push(ReportMember {
            beam_id: r.beam_id,
            norm: Some(NORM_STEEL),
            section_label: &r.profile_name,
            grade_label: &r.steel_grade,
            uc_max: r.uc_max,
            status: &r.status,
            governing_check_id: &r.governing_check_id,
            checks: &r.checks,
        });
    }

    for r in &input.timber_check_results {
        members.push(ReportMember {
            beam_id: r.beam_id,
            norm: Some(NORM_TIMBER),
            section_label: &r.section_name,
            grade_label: &r.strength_class,
            uc_max: r.uc_max,
            status: &r.status,
            governing_check_id: &r.governing_check_id,
            checks: &r.checks,
        });
    }

    // Kruislaaghout draagt dezelfde norm als massief hout: de lamellen worden
    // per stuk op art. 6.1.6 en 6.1.7 getoetst, de samenwerking op bijlage B.
    for r in &input.clt_check_results {
        members.push(ReportMember {
            beam_id: r.beam_id,
            norm: Some(NORM_TIMBER),
            section_label: &r.section_name,
            grade_label: &r.strength_class,
            uc_max: r.uc_max,
            status: &r.status,
            governing_check_id: &r.governing_check_id,
            checks: &r.checks,
        });
    }

    for r in &input.concrete_check_results {
        members.push(ReportMember {
            beam_id: r.beam_id,
            norm: Some(NORM_CONCRETE),
            section_label: &r.section_name,
            grade_label: &r.concrete_class,
            uc_max: r.uc_max,
            status: &r.status,
            governing_check_id: &r.governing_check_id,
            checks: &r.checks,
        });
    }

    for r in &input.stress_check_results {
        members.push(ReportMember {
            beam_id: r.beam_id,
            // Geen norm, en dat is hier geen omissie maar de aard van de
            // toets: de weerstand is een OPGEGEVEN toelaatbare spanning. De
            // artikelregel van elke toets zegt daarom "vrije spanningstoets".
            norm: None,
            section_label: &r.section_name,
            grade_label: &r.material_name,
            uc_max: r.uc_max,
            status: &r.status,
            governing_check_id: &r.governing_check_id,
            checks: &r.checks,
        });
    }

    members.sort_by_key(|m| m.beam_id);
    members
}

/// Welke toetsingskaders zitten er daadwerkelijk in deze invoer?
///
/// Alles wat het rapport over normen zegt — de regel op het omslag, de kop van
/// élk vel en het infoblok — komt hieruit. Eén plaats dus, want de fout die
/// hier voorkomen wordt is dat de PDF een norm claimt waar niet naar gerekend
/// is, en die claim staat op elke bladzijde.
struct ToegepasteKaders {
    staal: bool,
    /// Massief hout én kruislaaghout: dezelfde norm, één vermelding.
    hout: bool,
    beton: bool,
    /// Wél getoetst, maar tegen géén norm.
    vrij: bool,
}

impl ToegepasteKaders {
    fn van(input: &ReportInput) -> Self {
        Self {
            staal: !input.steel_check_results.is_empty(),
            hout: !input.timber_check_results.is_empty() || !input.clt_check_results.is_empty(),
            beton: !input.concrete_check_results.is_empty(),
            vrij: !input.stress_check_results.is_empty(),
        }
    }
}

/// Normenregel voor cover en paginakop: alleen kaders waarvan resultaten
/// aanwezig zijn, gescheiden door " / " ("EN 1993-1-1 / EN 1995-1-1").
///
/// LEEG wanneer er niets getoetst is. Er wordt niet teruggevallen op een norm:
/// een omslag dat "EN 1993-1-1" claimt boven een model zonder één stalen staaf
/// is onwaar, en onwaar is erger dan leeg. De aanroepers laten de regel dan
/// weg — zie [`generate_report_pdf`].
pub fn norms_line(input: &ReportInput) -> String {
    let k = ToegepasteKaders::van(input);
    let mut delen: Vec<&str> = Vec::with_capacity(4);
    if k.staal {
        delen.push(NORM_STEEL);
    }
    if k.hout {
        delen.push(NORM_TIMBER);
    }
    if k.beton {
        delen.push(NORM_CONCRETE);
    }
    if k.vrij {
        delen.push(GEEN_NORM);
    }
    delen.join(" / ")
}

/// Volledige normaanduidingen voor het cover-infoblok, in rapportvolgorde.
///
/// Eén regel per kader waarvan resultaten aanwezig zijn. Zonder resultaten
/// blijft de lijst LEEG en staat er geen regel "Standard" op het omslag, in
/// plaats van een geleende norm.
fn full_norm_designations(input: &ReportInput) -> Vec<&'static str> {
    let k = ToegepasteKaders::van(input);
    let mut norms: Vec<&'static str> = Vec::with_capacity(4);
    if k.staal {
        norms.push(NORM_STEEL_FULL);
    }
    if k.hout {
        norms.push(NORM_TIMBER_FULL);
    }
    if k.beton {
        norms.push(NORM_CONCRETE_FULL);
    }
    if k.vrij {
        norms.push(NORM_VRIJ_FULL);
    }
    norms
}

// ── Style helpers ─────────────────────────────────────────────────────────────
// Stylesheet palette — some helpers are unused right now but kept so the
// cover/page-decoration code can pick them up without re-deriving values.
#[allow(dead_code)]
pub(crate) fn style_h1() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(22.0),
        leading: Pt(26.0),
        text_color: C_TEXT,
        space_before: Pt(0.0),
        space_after: Pt(6.0),
        bold: true,
        ..Default::default()
    }
}

pub(crate) fn style_h2() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(14.0),
        leading: Pt(17.0),
        text_color: C_TEXT,
        space_before: Pt(8.0),
        space_after: Pt(4.0),
        bold: true,
        ..Default::default()
    }
}

pub(crate) fn style_h3() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(11.0),
        leading: Pt(14.0),
        text_color: C_TEXT,
        space_before: Pt(6.0),
        space_after: Pt(2.0),
        bold: true,
        ..Default::default()
    }
}

#[allow(dead_code)]
pub(crate) fn style_label() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(8.5),
        leading: Pt(11.0),
        text_color: C_AMBER,
        space_after: Pt(1.0),
        bold: true,
        ..Default::default()
    }
}

pub(crate) fn style_body() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(9.5),
        leading: Pt(12.5),
        text_color: C_TEXT,
        space_after: Pt(2.0),
        ..Default::default()
    }
}

pub(crate) fn style_mono() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(8.5),
        leading: Pt(11.0),
        text_color: C_MUTED,
        space_after: Pt(1.0),
        ..Default::default()
    }
}

pub(crate) fn style_note() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(7.5),
        leading: Pt(10.0),
        text_color: C_MUTED,
        space_after: Pt(1.0),
        italic: true,
        ..Default::default()
    }
}

pub(crate) fn style_amber_value() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(10.0),
        leading: Pt(13.0),
        text_color: C_AMBER,
        space_after: Pt(2.0),
        bold: true,
        ..Default::default()
    }
}

pub(crate) fn style_uc(uc_color: Color) -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(9.5),
        leading: Pt(12.5),
        text_color: uc_color,
        space_after: Pt(2.0),
        bold: true,
        ..Default::default()
    }
}

// ── Public entry point ────────────────────────────────────────────────────────

pub fn generate_report_pdf(input: ReportInput) -> Vec<u8> {
    // 1. Font registry — register Liberation Sans variants by their OpenAEC names.
    let fonts = shared_font_registry();
    {
        let mut reg = fonts.lock().unwrap();
        reg.register_ttf_bytes("LiberationSans-Regular", FONT_REGULAR.to_vec())
            .expect("register regular font");
        reg.register_ttf_bytes("LiberationSans-Bold", FONT_BOLD.to_vec())
            .expect("register bold font");
        reg.register_ttf_bytes("LiberationSans-Italic", FONT_ITALIC.to_vec())
            .expect("register italic font");
        reg.register_ttf_bytes(
            "LiberationSans-BoldItalic",
            FONT_BOLD_ITALIC.to_vec(),
        )
        .expect("register bold-italic font");
        // Alias so `style.font_name = "LiberationSans"` resolves.
        reg.register_alias("LiberationSans", "LiberationSans-Regular");
    }

    // 2. DocTemplate + page template with header/footer callback.
    //    De normenregel is leeg wanneer er niets getoetst is; de titel draagt
    //    dan alleen het onderwerp en geen streepje met niets erachter.
    let norms = norms_line(&input);
    let titel = if norms.is_empty() {
        "Constructieve toetsing".to_string()
    } else {
        format!("Constructieve toetsing — {}", norms)
    };
    let mut doc = DocTemplate::new(&titel, fonts.clone());

    let margin_x: Pt = Mm(20.0).into();
    let margin_top: Pt = Mm(28.0).into(); // header band
    let margin_bottom: Pt = Mm(20.0).into();

    let frame = Frame::new(Rect::new(
        margin_x,
        margin_top,
        Pt(A4.width.0 - 2.0 * margin_x.0),
        Pt(A4.height.0 - margin_top.0 - margin_bottom.0),
    ))
    .with_padding(Padding::all(Pt(0.0)));

    let template = PageTemplate::new("content", A4, frame).with_callback(Box::new(
        OpenAecHeaderFooter {
            project: input.project_name.clone(),
            norms: norms.clone(),
        },
    ));
    doc.add_page_template(template);

    // 3. Cover page (RawPage — drawn directly).
    doc.add_pre_page(build_cover_page(&input, &norms));

    // 4. Build content flowables — alle vijf de kernen delen één pad (ze
    //    leveren hetzelfde NamedCheck-contract).
    let members = report_members(&input);

    let mut flow: Vec<Box<dyn Flowable>> = Vec::new();

    if members.is_empty() {
        // Geen enkele getoetste staaf. Een samenvattingshoofdstuk met een lege
        // tabel zou de lezer laten zoeken naar wat er weggevallen is; deze
        // melding zegt wat er aan de hand is en wat hij eraan kan doen.
        extend_with_lege_toetsing(&mut flow);
    } else {
        flow.push(Box::new(
            Paragraph::new("Summary — Unity Checks", style_h2()).kop(),
        ));
        flow.push(Box::new(Spacer::from_mm(2.0)));

        flow.push(Box::new(build_summary_table(&members)));
        flow.push(Box::new(Spacer::from_mm(6.0)));
    }

    for (idx, m) in members.iter().enumerate() {
        flow.push(Box::new(PageBreak));

        flow.push(Box::new(
            Paragraph::new(
                format!(
                    "{}. Beam {} — {} ({})    [{}]",
                    idx + 1,
                    m.beam_id,
                    m.section_label,
                    m.grade_label,
                    m.norm_label()
                ),
                style_h2(),
            )
            .kop(),
        ));
        flow.push(Box::new(Spacer::from_mm(3.0)));

        for nc in m.checks {
            extend_with_check_block(&mut flow, &nc.kind);
        }
    }

    // 4b. Beton — fysisch niet-lineaire tweede orde: de segmenttabellen, het
    //     convergentiespoor en de vier figuren. Blijft in zijn geheel weg bij
    //     een rapport zonder beton; zie `betonhoofdstuk::van_toepassing`.
    betonhoofdstuk::extend_with_betonhoofdstuk(&mut flow, &input);

    // 5. Render.
    doc.build_to_bytes(flow).expect("openaec-layout build")
}

// ── Een rapport zonder getoetste staven ───────────────────────────────────────

/// Het hoofdstuk dat in de plaats komt van de samenvattingstabel wanneer er
/// geen enkele getoetste staaf in de invoer zit.
///
/// Zo'n rapport ontstaat wanneer de toetsing niets heeft opgeleverd — geen
/// enkele staaf die een van de vijf kernen kan verwerken, of alle staven
/// overgeslagen. De PDF noemt dan ook geen norm (zie [`norms_line`]); zonder
/// deze melding blijft de lezer met een omslag en niets erachter zitten.
fn extend_with_lege_toetsing(flow: &mut Vec<Box<dyn Flowable>>) {
    flow.push(Box::new(
        Paragraph::new("Geen toetsresultaten", style_h2()).kop(),
    ));
    flow.push(Box::new(Spacer::from_mm(2.0)));
    flow.push(Box::new(Paragraph::new(
        "Dit rapport bevat geen enkele getoetste staaf. Daarom staat er geen \
         samenvattingstabel in, en noemt het geen norm: een rapport hoort niets \
         te beweren over materiaal dat niet in de invoer zit.",
        style_body(),
    )));
    flow.push(Box::new(Paragraph::new(
        "Toets het model (knop Toetsen) en maak het rapport opnieuw aan. Blijft \
         het leeg, dan is geen van de staven door een van de rekenkernen \
         opgepakt — staal, hout, kruislaaghout, beton of een vrij materiaal met \
         een toelaatbare spanning — en zegt het toetsingspaneel per staaf \
         waarom.",
        style_body(),
    )));
}

// ── Cover page (drawn manually onto a RawPage) ────────────────────────────────

fn build_cover_page(input: &ReportInput, norms: &str) -> RawPage {
    let mut dl = DrawList::new();

    // Background tint band at top
    dl.set_fill_color(C_HEADER_BG);
    dl.draw_rect(
        Pt(0.0),
        Pt(0.0),
        A4.width,
        Mm(70.0).into(),
        true,
        false,
    );

    // Amber rule under the band
    let band_bottom: Pt = Mm(70.0).into();
    dl.set_fill_color(C_DIVIDER);
    dl.draw_rect(
        Pt(0.0),
        band_bottom,
        A4.width,
        Pt(2.0),
        true,
        false,
    );

    let left: Pt = Mm(20.0).into();

    // "Open" + "AEC" + "Foundation" wordmark — built from text draws
    dl.set_font("LiberationSans-Bold", Pt(46.0));
    dl.set_fill_color(C_DEEP);
    dl.draw_text(left, Mm(45.0).into(), "Open");

    dl.set_font("LiberationSans-Bold", Pt(46.0));
    dl.set_fill_color(C_AMBER);
    // 4 chars × ~28pt each ≈ 112pt advance for "Open" — tune empirically.
    dl.draw_text(Pt(left.0 + 110.0), Mm(45.0).into(), "AEC");

    dl.set_font("LiberationSans-Regular", Pt(20.0));
    dl.set_fill_color(C_MUTED);
    dl.draw_text(Pt(left.0 + 200.0), Mm(45.0).into(), "Foundation");

    // Title block — material-neutral: "Constructieve toetsing" plus the
    // norms actually present in the results.
    dl.set_font("LiberationSans-Bold", Pt(28.0));
    dl.set_fill_color(C_TEXT);
    dl.draw_text(left, Mm(95.0).into(), "Constructieve toetsing");

    // Zonder toetsresultaten blijft deze regel WEG. Hier stond de terugval op
    // de staalnorm, en die zette een "EN 1993-1-1" op het omslag van een model
    // zonder één stalen staaf.
    if !norms.is_empty() {
        dl.set_font("LiberationSans-Bold", Pt(22.0));
        dl.set_fill_color(C_TEXT);
        dl.draw_text(left, Mm(108.0).into(), norms);
    }

    dl.set_font("LiberationSans-Italic", Pt(13.0));
    dl.set_fill_color(C_MUTED);
    dl.draw_text(left, Mm(118.0).into(), &input.project_name);

    // Project info — manual two-column layout
    let label_x = left;
    let value_x: Pt = Pt(left.0 + Mm(35.0).0 * 2.834_645_7);
    let mut y_mm = 145.0_f32;

    let mut rows: Vec<(&str, &str)> = vec![
        ("Project", input.project_name.as_str()),
        ("Number", input.project_number.as_str()),
        ("Engineer", input.engineer.as_str()),
        ("Company", input.company.as_str()),
        ("Date", input.date.as_str()),
    ];
    for (i, designation) in full_norm_designations(input).iter().enumerate() {
        rows.push((if i == 0 { "Standard" } else { "" }, designation));
    }

    for (label, val) in &rows {
        dl.set_font("LiberationSans-Bold", Pt(9.5));
        dl.set_fill_color(C_AMBER);
        dl.draw_text(label_x, Mm(y_mm).into(), label);

        dl.set_font("LiberationSans-Regular", Pt(10.5));
        dl.set_fill_color(C_TEXT);
        dl.draw_text(value_x, Mm(y_mm).into(), val);

        y_mm += 8.5;
    }

    // Footer mark on cover
    dl.set_font("LiberationSans-Italic", Pt(8.0));
    dl.set_fill_color(C_MUTED);
    dl.draw_text(
        left,
        Pt(A4.height.0 - Mm(15.0).0 * 2.834_645_7),
        "OpenAEC Foundation — open structural analysis tooling",
    );

    RawPage {
        page_size: A4,
        draw_list: dl,
    }
}

// ── Header/footer callback (per content page) ─────────────────────────────────

#[derive(Debug)]
struct OpenAecHeaderFooter {
    project: String,
    norms: String,
}

impl PageCallback for OpenAecHeaderFooter {
    fn on_page(
        &self,
        dl: &mut DrawList,
        page_num: usize,
        total_pages: usize,
        page_size: Size,
    ) {
        // Header strip (light tint, top 18mm)
        let header_h: Pt = Mm(18.0).into();
        dl.set_fill_color(C_HEADER_BG);
        dl.draw_rect(Pt(0.0), Pt(0.0), page_size.width, header_h, true, false);

        // Amber rule under header
        dl.set_fill_color(C_DIVIDER);
        dl.draw_rect(
            Pt(0.0),
            Pt(header_h.0),
            page_size.width,
            Pt(1.2),
            true,
            false,
        );

        // Header text — wordmark + project name
        let left: Pt = Mm(20.0).into();
        let baseline: Pt = Mm(11.0).into();

        dl.set_font("LiberationSans-Bold", Pt(11.0));
        dl.set_fill_color(C_DEEP);
        dl.draw_text(left, baseline, "Open");
        dl.set_font("LiberationSans-Bold", Pt(11.0));
        dl.set_fill_color(C_AMBER);
        dl.draw_text(Pt(left.0 + 28.0), baseline, "AEC");

        // Zonder normen alleen de projectnaam: een streepje met niets ervoor
        // leest als een weggevallen norm.
        let kopregel = if self.norms.is_empty() {
            self.project.clone()
        } else {
            format!("{} — {}", self.norms, self.project)
        };
        dl.set_font("LiberationSans-Regular", Pt(8.5));
        dl.set_fill_color(C_MUTED);
        dl.draw_text(Pt(left.0 + 60.0), baseline, &kopregel);

        // Page-number on the right of the header
        let right: Pt = Pt(page_size.width.0 - Mm(20.0).0 * 2.834_645_7);
        dl.set_font("LiberationSans-Regular", Pt(8.5));
        dl.set_fill_color(C_MUTED);
        dl.draw_text_right(
            right,
            baseline,
            &format!("page {} of {}", page_num, total_pages),
        );

        // Footer rule + text
        let footer_y: Pt = Pt(page_size.height.0 - Mm(13.0).0 * 2.834_645_7);
        dl.set_fill_color(C_DIVIDER);
        dl.draw_rect(
            Pt(0.0),
            footer_y,
            page_size.width,
            Pt(0.6),
            true,
            false,
        );

        dl.set_font("LiberationSans-Italic", Pt(7.5));
        dl.set_fill_color(C_MUTED);
        dl.draw_text(
            left,
            Pt(footer_y.0 + 12.0),
            "Generated by Open FEM2D Studio — OpenAEC Foundation",
        );
    }
}

// ── Summary table ─────────────────────────────────────────────────────────────

fn build_summary_table(members: &[ReportMember<'_>]) -> Table {
    let headers: Vec<String> = vec![
        "Beam".into(),
        "Section".into(),
        "Grade".into(),
        "Standard".into(),
        "UC".into(),
        "Governing".into(),
        "Status".into(),
    ];

    let body: Vec<Vec<String>> = members
        .iter()
        .map(|m| {
            vec![
                m.beam_id.to_string(),
                m.section_label.to_string(),
                m.grade_label.to_string(),
                m.norm_label().to_string(),
                format!("{:.2}", m.uc_max),
                m.governing_check_id.to_string(),
                status_label(m.status).into(),
            ]
        })
        .collect();

    let style = TableStyleConfig {
        header_background: Some(C_DEEP),
        header_text_color: Color::WHITE,
        grid_color: Color::rgb(220, 215, 205),
        grid_width: Pt(0.5),
        row_backgrounds: vec![None, Some(Color::rgb(250, 247, 240))],
        cell_padding: Padding::new(Pt(4.0), Pt(5.0), Pt(4.0), Pt(5.0)),
        font_name: "LiberationSans".into(),
        header_font_name: "LiberationSans-Bold".into(),
        font_size: Pt(9.0),
        header_font_size: Pt(9.0),
    };

    // Column widths chosen to fit within the inner content frame (~170mm)
    Table::new(headers, body)
        .with_col_widths(vec![
            Mm(13.0).into(),
            Mm(30.0).into(),
            Mm(16.0).into(),
            Mm(26.0).into(),
            Mm(13.0).into(),
            Mm(50.0).into(),
            Mm(18.0).into(),
        ])
        .with_style(style)
        .with_repeat_header(true)
}

// ── Per-check block (heading + force state + formula + UC + notes) ────────────

fn extend_with_check_block(flow: &mut Vec<Box<dyn Flowable>>, kind: &CheckKind) {
    let f = extract(kind);

    // Title with article reference appended in muted amber
    flow.push(Box::new(Paragraph::new(
        format!("{}    [{}]", f.title, f.article),
        style_h3(),
    )));

    // Force state line
    flow.push(Box::new(Paragraph::new(
        format!(
            "Comb {}  ·  x = {:.0} mm  ·  N_Ed = {:.2} kN  ·  V_Ed = {:.2} kN  ·  M_Ed = {:.2} kNm",
            f.combo, f.pos_mm, f.n_ed, f.vz_ed, f.my_ed
        ),
        style_mono(),
    )));

    // Formula (LaTeX rendered as plain text — KaTeX rendering is a future
    // enhancement; we already strip the dollars upstream).
    flow.push(Box::new(Paragraph::new(f.formula.to_string(), style_body())));

    // Variables on one condensed line
    if !f.variables.is_empty() {
        let vars: String = f
            .variables
            .iter()
            .map(|v| format!("{} = {:.3} {}", v.symbol, v.value, v.unit))
            .collect::<Vec<_>>()
            .join("   ");
        flow.push(Box::new(Paragraph::new(vars, style_mono())));
    }

    // Result value
    flow.push(Box::new(Paragraph::new(
        format!("= {:.3} {}", f.value, f.unit),
        style_amber_value(),
    )));

    // UC + status
    if let (Some(ed), Some(rd), Some(uc)) = (f.uc_ed, f.uc_rd, f.uc_uc) {
        let uc_color = if uc > 1.0 { C_FAIL } else { C_OK };
        let line = format!(
            "UC = {:.3} / {:.3} = {:.3}     {}",
            ed,
            rd,
            uc,
            status_label(f.status)
        );
        flow.push(Box::new(Paragraph::new(line, style_uc(uc_color))));
    } else {
        let (sl, sc) = (status_label(f.status), status_color(f.status));
        flow.push(Box::new(Paragraph::new(sl, style_uc(sc))));
    }

    // Intermediate values
    if !f.intermediates.is_empty() {
        let line: String = f
            .intermediates
            .iter()
            .map(|v| format!("{} = {:.3}", v.symbol, v.value))
            .collect::<Vec<_>>()
            .join("   ");
        flow.push(Box::new(Paragraph::new(line, style_mono())));
    }

    // Notes
    for note in f.notes {
        flow.push(Box::new(Paragraph::new(note.clone(), style_note())));
    }

    flow.push(Box::new(Spacer::from_mm(2.5)));
}

// ── Field extraction (mirrors the previous genpdf version) ────────────────────

struct ExtractedFields<'a> {
    title: &'a str,
    article: &'a str,
    combo: u32,
    pos_mm: f64,
    n_ed: f64,
    vz_ed: f64,
    my_ed: f64,
    formula: &'a str,
    variables: &'a [NamedValue],
    value: f64,
    unit: &'a str,
    uc_ed: Option<f64>,
    uc_rd: Option<f64>,
    uc_uc: Option<f64>,
    status: &'a CheckStatus,
    notes: &'a [String],
    intermediates: &'a [NamedValue],
}

fn extract(kind: &CheckKind) -> ExtractedFields<'_> {
    match kind {
        CheckKind::Resistance(r) => ExtractedFields {
            title: &r.title,
            article: &r.article,
            combo: r.force_state.combination_id,
            pos_mm: r.force_state.position_mm,
            n_ed: r.force_state.forces.n_ed,
            vz_ed: r.force_state.forces.vz_ed,
            my_ed: r.force_state.forces.my_ed,
            formula: &r.formula_latex,
            variables: &r.variables,
            value: r.value,
            unit: &r.unit,
            uc_ed: r.uc.as_ref().map(|u| u.ed),
            uc_rd: r.uc.as_ref().map(|u| u.rd),
            uc_uc: r.uc.as_ref().map(|u| u.uc),
            status: &r.status,
            notes: &r.notes,
            intermediates: &[],
        },
        CheckKind::Stability(s) => ExtractedFields {
            title: &s.title,
            article: &s.article,
            combo: s.force_state.combination_id,
            pos_mm: s.force_state.position_mm,
            n_ed: s.force_state.forces.n_ed,
            vz_ed: s.force_state.forces.vz_ed,
            my_ed: s.force_state.forces.my_ed,
            formula: &s.formula_latex,
            variables: &s.variables,
            value: s.value,
            unit: &s.unit,
            uc_ed: s.uc.as_ref().map(|u| u.ed),
            uc_rd: s.uc.as_ref().map(|u| u.rd),
            uc_uc: s.uc.as_ref().map(|u| u.uc),
            status: &s.status,
            notes: &s.notes,
            intermediates: &s.intermediate_values,
        },
    }
}

// ── Utility ───────────────────────────────────────────────────────────────────

fn status_label(s: &CheckStatus) -> &'static str {
    match s {
        CheckStatus::Ok => "OK",
        CheckStatus::NotOk => "FAIL",
        CheckStatus::NotApplicable => "N/A",
    }
}

fn status_color(s: &CheckStatus) -> Color {
    match s {
        CheckStatus::Ok => C_OK,
        CheckStatus::NotOk => C_FAIL,
        CheckStatus::NotApplicable => C_MUTED,
    }
}
