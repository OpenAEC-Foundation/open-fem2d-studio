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
//! * [`betonfiguren`] tekent de figuren native op een `DrawList` (doorsnede met
//!   korf, M-κ, N-M-interactie, het EI-verloop en de dekkingslijn);
//! * [`figuur`] maakt daar een opmaakelement van dat meedoet in de paginering;
//! * [`betonspoor`] is het invoertype van het segmentspoor — de spiegel van
//!   `betonStijfheidStore` in de frontend;
//! * [`betonhoofdstuk`] zet die drie om in het hoofdstuk zelf, en bepaalt of
//!   het hoofdstuk überhaupt van toepassing is.
//!
//! Daarnaast dragen drie modules wat de betonkern verder oplevert en het
//! rapport eerder niet toonde:
//!
//! * [`betonkolom`] — art. 5.8.3.1 met de afleiding van λ_lim, de kruip van
//!   art. 5.8.4 en de detailleringseisen van art. 9.5, inclusief de eisen die
//!   de kern niet KAN toetsen en die dus nergens anders in het rapport staan;
//! * [`betondekking`] — de dekkingslijn van art. 9.2.1.3 (figuur 9.2) met de
//!   figuur per zijde, de kritieke plaatsen, de bundels met hun l_bd, de
//!   dwarskrachtdekking en de eisen bij de steunpunten;
//! * [`betonzones`] — de wapeningszones en de korf die op de MAATGEVENDE snede
//!   gold. Dat blok staat niet in een eigen hoofdstuk maar achter de kop van de
//!   staaf zelf: het is de verantwoording van de unity check die er direct
//!   onder staat.
//!
//! # De kruislaaghoutkant
//!
//! Twee modules dragen het hoofdstuk "Kruislaaghout — opbouw, I_y en toetsing
//! per lamel":
//!
//! * [`houtfiguren`] tekent de opbouw met het spanningsverloop, en bemonstert
//!   dat verloop uit `CltMechanics` — dezelfde mechanica als de toets;
//! * [`houthoofdstuk`] zet daar het hoofdstuk omheen: de ontleding van I_y per
//!   laag, de tabel per lamel en de meldingen van de kern.
//!
//! [`figuur`] draagt beide: het is de opsomming van álle figuren die het
//! rapport kent.
//!
//! # Wat het rapport nu wél verantwoordt
//!
//! Drie dingen kwamen er sinds de eerste uitdraai bij, en alle drie om dezelfde
//! reden: zonder hen is een getal in het rapport niet NA TE REKENEN.
//!
//! * **De uitgangspunten** (`extend_with_uitgangspunten`) — nu de initiële
//!   scheefstand, die in élke kracht zit waarop getoetst is.
//! * **De afleiding van de maatgevende toets**
//!   (`extend_with_maatgevende_afleiding`) — de `deelstappen` die de kernen
//!   al leveren en die tot nu toe alleen op het scherm stonden. Materiaal-
//!   neutraal: een toets zonder keten levert een lege lijst en dus niets.
//! * **De wapeningszones** — welke korf op de maatgevende snede gold.

pub mod betondekking;
pub mod betonfiguren;
pub mod betonhoofdstuk;
pub mod betonkolom;
pub mod betonspoor;
pub mod betonzones;
pub mod figuur;
pub mod houtfiguren;
pub mod houthoofdstuk;
/// Verlopend profiel: de toetsdoorsneden van één staaf op papier
/// (ontwerp 15-09-2026, §6). Zie de moduledocumentatie.
pub mod verloopblok;

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

use concrete_check::dekkingslijn::DekkingslijnAntwoord;
use concrete_check::ConcreteBeamCheckResult;
use nen_en_1993_1_1_section::{CheckStatus, Deelstap, NamedValue};
use spanning_check::SpanningBeamCheckResult;
use steel_check::result::{BeamCheckResult, CheckKind, NamedCheck, VerloopRapport};
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
    /// De dekkingslijnen die de rekenkern heeft geleverd — figuur 9.2 van
    /// art. 9.2.1.3 als gegevens, per staaf.
    ///
    /// Dit is een APARTE vraag aan de kern (`concrete_dekkingslijn`) en geen
    /// bijproduct van de toetsing: de dekkingslijn vraagt om een z, een c_d en
    /// eventueel een A_sl die de doorsnedetoets niet nodig heeft. Zij komt er
    /// dus alleen in als iemand haar heeft opgevraagd, en het hoofdstuk blijft
    /// anders weg — zie [`crate::betondekking::van_toepassing`].
    ///
    /// `#[serde(default)]` om dezelfde reden als bij de andere kernen: een
    /// bestaande aanroep zonder dit veld blijft geldig.
    #[serde(default)]
    #[ts(as = "Option<Vec<DekkingslijnAntwoord>>", optional)]
    pub concrete_dekkingslijnen: Vec<DekkingslijnAntwoord>,
    /// De wapeningszones per betonstaaf, zoals de toetsing ze gekregen heeft.
    ///
    /// Zonder dit veld toont het rapport bij een staaf met ingekorte wapening
    /// alleen de BASISkorf, terwijl er per snede met `cage_at_mm` is gerekend —
    /// en dan is een unity check niet na te rekenen. Zie [`crate::betonzones`].
    ///
    /// `#[serde(default)]`: een aanroeper die geen zones kent, stuurt niets mee
    /// en het blok blijft weg.
    #[serde(default)]
    #[ts(as = "Option<Vec<betonzones::BetonStaafZones>>", optional)]
    pub concrete_reinforcement_zones: Vec<betonzones::BetonStaafZones>,
    /// De scheefstand die deze berekening in is gegaan, als tekstblok met alle
    /// tussenwaarden en normartikelen.
    ///
    /// WOORDELIJK uit `design-mockup/src/lib/scheefstandNorm.ts`
    /// (`scheefstandToelichting`), en dat is de hele reden dat dit een String
    /// is en geen verzameling getallen: die functie kent de drie normen
    /// (EN 1993-1-1 (5.5), EN 1992-1-1 (5.1) en EN 1995-1-1 (5.1)), de stand
    /// "ongunstigste", de vraag of h en m handmatig zijn opgegeven of uit de
    /// meetkunde volgen, en de waarschuwingen die daarbij horen. Dat hier
    /// naspelen zou een tweede lezing van dezelfde norm opleveren, en de twee
    /// zouden uiteen gaan lopen zonder dat iemand het ziet.
    ///
    /// Leeg of afwezig = de aanroeper heeft de scheefstand niet meegestuurd;
    /// het rapport zwijgt er dan over in plaats van een vaste 1/200 te
    /// suggereren.
    #[serde(default)]
    #[ts(optional)]
    pub scheefstand_toelichting: Option<String>,
    /// Het analysetype en de kritieke lastfactor α_cr per UGT-combinatie, als
    /// tekstblok — woordelijk uit `solver/alphaCr.ts` (`analyseToelichting`).
    ///
    /// Waarom dit in het rapport hoort (basisaudit nr 27): het staalrapport
    /// noemde nergens of de krachten eerste of tweede orde waren, terwijl
    /// NEN-EN 1993-1-1 5.2.1(3) eerste orde alleen bij α_cr ≥ 10 toestaat en
    /// 5.2.2(7)b de terugval van de kniklengte op de systeemlengte aan een
    /// tweede-orde-berekening met imperfecties bindt. Een regel die met "!"
    /// begint is een waarschuwing of fout en wordt rood gezet.
    ///
    /// Leeg of afwezig = niet meegestuurd; het rapport zwijgt dan.
    #[serde(default)]
    #[ts(optional)]
    pub analyse_toelichting: Option<String>,
    /// De windbelasting zoals de windgenerator haar in het model zette, als
    /// tekstblok — woordelijk uit `lib/wind/windGenerator.ts`
    /// (`vrijstaandDakUitgangspunten`): een kopregel met de normgrondslag
    /// (NEN-EN 1991-1-4 §7.3) en per gegenereerd belastinggeval de omschrijving
    /// van zijn lasten (tabel, α, φ en de gebruikte coëfficiënt).
    ///
    /// Waarom (issue #16): het live rapport noemde per windlast waar het getal
    /// vandaan kwam, het papier niet. Een windlast zonder tabel en cel is niet
    /// na te rekenen, en de PDF is het stuk dat wordt ingediend.
    ///
    /// Een String en geen getallen om dezelfde reden als de scheefstand: de
    /// generator kent de tabelopzoeking en de interpolatie; die hier naspelen
    /// zou een tweede lezing van dezelfde norm opleveren.
    ///
    /// Leeg of afwezig = geen gegenereerde windlast met omschrijving; het
    /// rapport zwijgt dan.
    #[serde(default)]
    #[ts(optional)]
    pub wind_toelichting: Option<String>,
}

// ── Materiaal-neutrale rapportweergave ────────────────────────────────────────

/// De normaanduidingen van de gekozen nationale bijlage, uit de normnaad.
///
/// Welke UITGAVE geldt hangt samen met welke bijlage geldt; ze horen dus in
/// dezelfde rij. Tot september 2026 stonden deze zes constanten hier los, naast
/// drie in de frontend en vier i18n-kopieën — en hout en beton waren al
/// uiteengelopen.
const AANDUIDINGEN: nationale_bijlage::Aanduidingen =
    nationale_bijlage::Aanduidingen::voor(nationale_bijlage::NationaleBijlage::NL);

/// Kort normlabel voor staaltoetsingen.
pub const NORM_STEEL: &str = AANDUIDINGEN.norm_staal_kort;
/// Kort normlabel voor houttoetsingen.
pub const NORM_TIMBER: &str = AANDUIDINGEN.norm_hout_kort;
/// Kort normlabel voor betontoetsingen.
pub const NORM_CONCRETE: &str = AANDUIDINGEN.norm_beton_kort;
/// Wat er staat waar bij de andere kernen een norm staat. De vrije
/// spanningstoets vergelijkt met een opgegeven toelaatbare spanning; "EN …"
/// suggereren zou de lezer op het verkeerde been zetten. Zelfde bewoording als
/// `normLabel` in de frontend.
pub const GEEN_NORM: &str = "geen norm";

/// Volledige normaanduiding (cover) voor staal.
const NORM_STEEL_FULL: &str = AANDUIDINGEN.norm_staal_omslag;
/// Volledige normaanduiding (cover) voor hout: de aanduiding waarmee de
/// uitgave zichzelf op elk vel noemt, plus de taal.
///
/// Hier stond "NEN-EN 1995-1-1+C1+A1:2011/NB:2013 nl" — de aanduiding van de
/// nationale bijlage alléén, en van vóór A2:2014 — terwijl de
/// kruislaaghouttoets in haar eigen notitie een derde schrijfwijze op papier
/// zette. Eén PDF noemde zo twee uitgaven van dezelfde norm.
///
/// Publiek omdat een test hem naast de notitie van de kruislaaghouttoets legt
/// (`nen_en_1995_1_1::clt_toets::NORM_HOUT_AANDUIDING`, dev-dependency): dat is
/// de enige manier waarop die twee plaatsen aan elkaar vastzitten.
pub const NORM_TIMBER_FULL: &str = AANDUIDINGEN.norm_hout_omslag;
/// Volledige normaanduiding (cover) voor beton — dezelfde uitgave als waaruit
/// de `nen-en-1992-1-1`-crate haar waarden leest (zie de crate-doc daar).
const NORM_CONCRETE_FULL: &str = AANDUIDINGEN.norm_beton_omslag;
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
    /// Het verlooprapport van een VERLOPENDE staaf: de zes toetsdoorsneden,
    /// het maatgevende punt en de doorsnede waarmee de stabiliteit is
    /// gerekend. `None` bij elke prismatische staaf — en bij elke kern die het
    /// begrip niet kent (beton, kruislaaghout, de vrije spanningstoets), want
    /// een verlopende doorsnede wordt daar geweigerd en niet stil benaderd.
    pub verloop: Option<&'a VerloopRapport>,
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
            verloop: r.verloop.as_ref(),
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
            verloop: r.verloop.as_ref(),
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
            // Kruislaaghout kan niet verlopen (ontwerp §9).
            verloop: None,
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
            // Een verlopende betonstaaf wordt geweigerd, niet benaderd.
            verloop: None,
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
            // De vrije spanningstoets draagt een veld `verloop`, maar dat is
            // het verloop van de SPANNING langs de staaf — iets anders dan een
            // verlopende doorsnede. Ze hier op naam gelijkstellen zou twee
            // ongelijke dingen in één tabel zetten.
            verloop: None,
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

// ── De normenregel op het OMSLAG ─────────────────────────────────────────────

/// De lettergrootte waarin de normenregel op het omslag staat.
///
/// Publiek omdat de test die de regel NAMEET met precies dezelfde maat moet
/// meten als de tekenaar; twee losse getallen zouden geruisloos uiteen lopen.
pub const OMSLAG_NORM_PT: Pt = Pt(22.0);

/// De marge links op het omslag, mm. Alles op het omslag begint hier, en
/// rechts wordt dezelfde marge aangehouden.
const OMSLAG_MARGE_MM: f32 = 20.0;

/// De regelafstand van de normenregel wanneer hij over meer dan één regel
/// gaat, mm. Ruim boven de 22 pt (≈ 7,8 mm) van de letter zelf.
const OMSLAG_NORM_REGEL_MM: f32 = 8.5;

/// De hoogte waarop de normenregel begint, mm vanaf de bovenrand.
const OMSLAG_NORM_TOP_MM: f32 = 108.0;

/// De ruimte onder de laatste normenregel tot de projectnaam, mm.
const OMSLAG_NA_NORM_MM: f32 = 10.0;

/// De ruimte tussen de projectnaam en het infoblok, mm.
const OMSLAG_NA_PROJECT_MM: f32 = 27.0;

/// Hoe breed een regel op het omslag hoogstens mag zijn.
///
/// `DrawList::draw_text` breekt niets af en knipt niets weg: wat hier niet in
/// past wordt gewoon voorbij de papierrand getekend en is in de PDF
/// onzichtbaar. Er is dus geen vangnet ná deze grens — de regel moet vóór het
/// tekenen al passen.
pub fn omslag_tekstbreedte() -> Pt {
    Pt(A4.width.0 - 2.0 * Pt::from(Mm(OMSLAG_MARGE_MM)).0)
}

/// De normenregel opgeknipt in regels die elk binnen `max_breedte` blijven.
///
/// WAAROM DIT MOET. Met alle vier de kaders erin is
/// "EN 1993-1-1 / EN 1995-1-1 / EN 1992-1-1 / geen norm" bij 22 pt breder dan
/// een A4: de regel liep dan rechts van het papier af, zonder waarschuwing en
/// zonder zichtbaar spoor. Met drie kaders paste hij nog net, dus het gebrek
/// kwam pas boven water bij een model dat staal, hout, beton én een vrij
/// materiaal draagt — en dat is juist het rapport waarin de lezer het meest
/// aan die regel heeft.
///
/// Er wordt uitsluitend geknipt op de scheiding " / " tussen twee kaders: een
/// normaanduiding zelf mag niet middendoor. Het scheidingsteken blijft aan het
/// eind van de afgesloten regel staan, zodat de lezer ziet dat de opsomming
/// doorloopt. Een vijfde kader knipt vanzelf mee; er is niets dat op vier
/// staat.
///
/// Is één kader in zijn eentje al te breed, dan krijgt het toch zijn eigen
/// regel. Dat kan met de huidige aanduidingen niet gebeuren, en afkappen zou
/// een halve norm op het omslag zetten — erger dan een te brede regel.
///
/// `meet` levert de gerenderde breedte van een stuk tekst; de aanroeper vult
/// daar de fontregistratie in waarmee ook getekend wordt.
pub fn omslag_normregels(
    norms: &str,
    max_breedte: Pt,
    meet: &mut dyn FnMut(&str) -> Pt,
) -> Vec<String> {
    if norms.is_empty() {
        return Vec::new();
    }
    let mut regels: Vec<String> = Vec::new();
    let mut huidig = String::new();
    for kader in norms.split(" / ") {
        if huidig.is_empty() {
            huidig = kader.to_string();
            continue;
        }
        let kandidaat = format!("{huidig} / {kader}");
        // Gemeten MÉT het scheidingsteken dat er komt te staan zodra er nog
        // een kader achteraan gaat: zonder dat toevoegsel past een regel
        // tijdens het opbouwen wél en na het afsluiten niet meer.
        if meet(&format!("{kandidaat} /")).0 <= max_breedte.0 {
            huidig = kandidaat;
        } else {
            regels.push(format!("{huidig} /"));
            huidig = kader.to_string();
        }
    }
    regels.push(huidig);
    regels
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

/// De kop boven één deelstap van een afleiding: vet maar klein.
///
/// Bewust geen [`style_h3`]: een keten heeft er acht tot twaalf achter elkaar,
/// en met een kopregel van 11 pt leest zo'n afleiding als twaalf paragrafen in
/// plaats van als één redenering.
pub(crate) fn style_stap() -> ParagraphStyle {
    ParagraphStyle {
        font_name: "LiberationSans".into(),
        font_size: Pt(9.0),
        leading: Pt(12.0),
        text_color: C_TEXT,
        space_before: Pt(4.0),
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
    //    De normenregel wordt hier al OPGEDEELD, want alleen hier is de
    //    fontregistratie bij de hand waarmee straks ook getekend wordt. Meten
    //    met een ander font of een andere maat dan de tekenaar gebruikt, is
    //    niet meten.
    let norm_regels = {
        let mut reg = fonts.lock().unwrap();
        let vet = reg
            .get("LiberationSans-Bold")
            .expect("bold font is hierboven geregistreerd");
        let mut meet = |s: &str| reg.text_width(vet, s, OMSLAG_NORM_PT);
        omslag_normregels(&norms, omslag_tekstbreedte(), &mut meet)
    };
    doc.add_pre_page(build_cover_page(&input, &norm_regels));

    // 4. Build content flowables — alle vijf de kernen delen één pad (ze
    //    leveren hetzelfde NamedCheck-contract).
    let members = report_members(&input);

    let mut flow: Vec<Box<dyn Flowable>> = Vec::new();

    // 3b. Uitgangspunten — wat er vóór de toetsing is aangenomen en dus overal
    //     in doorwerkt. Dit blok staat met opzet VOOR de samenvatting: een
    //     aanname die pas achterin het rapport opduikt, is een aanname die de
    //     lezer al vier hoofdstukken lang niet had.
    extend_with_uitgangspunten(&mut flow, &input);

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

        // De wapeningszones van deze staaf, mét de korf die op de maatgevende
        // snede gold. Blijft weg bij elke staaf die geen zones draagt — dus bij
        // staal, hout en elke betonstaaf met één korf over de hele lengte.
        if let Some(z) = betonzones::zones_van(&input.concrete_reinforcement_zones, m.beam_id) {
            betonzones::extend_met_zoneblok(&mut flow, z, m.checks, m.governing_check_id);
        }

        // VERLOPEND PROFIEL: de zes toetsdoorsneden, het maatgevende punt en
        // de doorsnede waarmee de stabiliteit is gerekend. Staat VÓÓR de
        // toetsblokken, want wie een unity check van een verlopende staaf
        // leest, moet eerst weten wáár die doorsnede zit. Blijft weg bij elke
        // prismatische staaf, zodat de PDF van een bestaand model ongewijzigd
        // blijft.
        if let Some(v) = m.verloop {
            verloopblok::extend_met_verloopblok(&mut flow, v);
        }

        for nc in m.checks {
            extend_with_check_block(&mut flow, &nc.kind);
        }

        // De afleiding van de MAATGEVENDE toets, uitgeschreven. Dezelfde keuze
        // als in het live rapport ("Maatgevende toets, uitgeschreven"): elke
        // toets zijn hele keten geven zou het rapport verdubbelen, en de keten
        // die telt is die van de toets die het ontwerp begrenst.
        extend_with_maatgevende_afleiding(&mut flow, m);
    }

    // 4b. Beton — fysisch niet-lineaire tweede orde: de segmenttabellen, het
    //     convergentiespoor en de vier figuren. Blijft in zijn geheel weg bij
    //     een rapport zonder beton; zie `betonhoofdstuk::van_toepassing`.
    betonhoofdstuk::extend_with_betonhoofdstuk(&mut flow, &input);

    // 4c. Kruislaaghout — de opbouw, de ontleding van I_y en de toetsing per
    //     lamel, met de opbouwfiguur. Blijft weg bij een rapport zonder
    //     kruislaaghout; zie `houthoofdstuk::van_toepassing`.
    houthoofdstuk::extend_with_houthoofdstuk(&mut flow, &input);

    // 4d. Beton — de kolommen: de slankheidsgrens van art. 5.8.3.1 met haar
    //     afleiding, de kruip van art. 5.8.4 en de detailleringseisen van
    //     art. 9.5, inclusief de eisen die de kern NIET kan toetsen. Blijft weg
    //     bij een rapport zonder art. 5.8-toets; zie `betonkolom::van_toepassing`.
    betonkolom::extend_with_kolomhoofdstuk(&mut flow, &input);

    // 4e. Beton — de dekkingslijn (art. 9.2.1.3, figuur 9.2): per zijde de
    //     figuur, de kritieke plaatsen, de bundels met hun l_bd, de
    //     dwarskrachtdekking en de eisen bij de steunpunten. Blijft weg zolang
    //     er geen dekkingslijn is opgevraagd; zie `betondekking::van_toepassing`.
    betondekking::extend_with_dekkingshoofdstuk(&mut flow, &input);

    // 5. Render.
    doc.build_to_bytes(flow).expect("openaec-layout build")
}

// ── Uitgangspunten ────────────────────────────────────────────────────────────

/// Het hoofdstuk "Uitgangspunten": wat er vóór de toetsing is aangenomen en
/// daarom in élke uitkomst erachter doorwerkt.
///
/// Nu draagt het één ding — de initiële scheefstand — en het blijft in zijn
/// geheel weg zolang de aanroeper die niet meestuurt. Dat is geen bescheiden
/// begin maar het hele punt: een uitgangspuntenblok dat een aanname noemt die
/// de rekengang niet heeft gebruikt, is erger dan geen blok.
///
/// De scheefstand is een eigenschap van de CONSTRUCTIE en niet van een staaf —
/// één bouwwerk staat één keer scheef — en hoort daarom vooraan en niet bij een
/// staaf. Zij levert bovendien een vervangende horizontale kracht H = φ·V op
/// élke verticale lastcomponent, dus zij zit in alle krachten waarop de
/// toetsingen hierna zijn gedraaid.
///
/// De tekst gaat WOORDELIJK mee zoals `scheefstandToelichting` hem opstelt:
/// regel voor regel het symbool, de waarde en het normartikel, daarna de
/// afleiding van h en m, en tot slot de waarschuwingen. Hij wordt hier per
/// regel als eigen alinea gezet omdat de opmaakmotor geen harde regeleinden in
/// één alinea kent; er wordt niets aan de inhoud veranderd.
fn extend_with_uitgangspunten(flow: &mut Vec<Box<dyn Flowable>>, input: &ReportInput) {
    let scheefstand = input.scheefstand_toelichting.as_ref().filter(|t| !t.trim().is_empty());
    let analyse = input.analyse_toelichting.as_ref().filter(|t| !t.trim().is_empty());
    let wind = input.wind_toelichting.as_ref().filter(|t| !t.trim().is_empty());
    if scheefstand.is_none() && analyse.is_none() && wind.is_none() {
        return;
    }

    flow.push(Box::new(Paragraph::new("Uitgangspunten", style_h2()).kop()));

    // Eerst de berekeningswijze: welke krachten er zijn bepaald (eerste of
    // tweede orde) en of de norm dat toestaat — dat gaat aan alles vooraf.
    if let Some(tekst) = analyse {
        flow.push(Box::new(
            Paragraph::new("Berekeningswijze en stabiliteit (α_cr)", style_h3()).kop(),
        ));
        flow.push(Box::new(Paragraph::new(
            "Het analysetype bepaalt of de tweede-orde-effecten in de krachten zitten. NEN-EN 1993-1-1 \
             5.2.1(3) staat een eerste-orde-berekening alleen toe bij α_cr ≥ 10; de terugval van de \
             kniklengte op de systeemlengte in de staaftoets (5.2.2(7)b) veronderstelt bovendien \
             krachten uit een tweede-orde-berekening met imperfecties.",
            style_body(),
        )));
        zet_regels(flow, tekst);
        flow.push(Box::new(Spacer::from_mm(3.0)));
    }

    // De windbelasting: per gegenereerd geval de tabel, α, φ en coëfficiënt
    // waaruit de lasten in de lastentabel volgen (NEN-EN 1991-1-4). Een
    // belasting, dus vóór de scheefstand, die op alle verticale lasten rust.
    if let Some(tekst) = wind {
        flow.push(Box::new(Paragraph::new("Windbelasting", style_h3()).kop()));
        flow.push(Box::new(Paragraph::new(
            "De windlasten zijn door de windgenerator in het model gezet. Per belastinggeval staat              hieronder waar de coëfficiënt vandaan komt: de paragraaf en tabel van NEN-EN 1991-1-4,              de dakhelling α, de blokkering φ en de gebruikte waarde. De lijnlast is steeds              q_p(z_e) · coëfficiënt · belastingbreedte.",
            style_body(),
        )));
        zet_regels(flow, tekst);
        flow.push(Box::new(Spacer::from_mm(3.0)));
    }

    let Some(tekst) = scheefstand else {
        flow.push(Box::new(Spacer::from_mm(4.0)));
        return;
    };
    flow.push(Box::new(
        Paragraph::new("Initiële scheefstand", style_h3()).kop(),
    ));
    flow.push(Box::new(Paragraph::new(
        "De scheefstand is een eigenschap van de constructie als geheel en niet van een staaf: zij \
         beschrijft hoe scheef het bouwwerk staat. Zij is als vervangende horizontale kracht \
         H = φ·V op elke verticale lastcomponent gezet, en werkt dus door in alle krachten waarop \
         de toetsingen hieronder zijn gedraaid.",
        style_body(),
    )));
    zet_regels(flow, tekst);
    flow.push(Box::new(Spacer::from_mm(4.0)));
}

/// Een tekstblok regel voor regel, zoals de bouwer het opstelde.
///
/// Een regel die met "!" begint is een WAARSCHUWING of FOUT. Die hoort op te
/// vallen, en niet in dezelfde grijze kleur te verdwijnen als de tussenwaarden
/// eromheen.
fn zet_regels(flow: &mut Vec<Box<dyn Flowable>>, tekst: &str) {
    for regel in tekst.lines() {
        if regel.trim().is_empty() {
            flow.push(Box::new(Spacer::from_mm(1.5)));
            continue;
        }
        let stijl = if regel.starts_with('!') {
            ParagraphStyle { text_color: C_FAIL, ..style_note() }
        } else {
            style_mono()
        };
        flow.push(Box::new(Paragraph::new(regel.to_string(), stijl)));
    }
}

// ── De afleiding van een toets, uitgeschreven ─────────────────────────────────

/// De keten die aan de MAATGEVENDE toets van deze staaf voorafgaat.
///
/// Materiaal-neutraal, net als de rest van dit renderpad: de betontoetsen
/// vullen `deelstappen`, de kipketen van staal ook, en een toets die er geen
/// heeft levert een lege lijst en dus geen enkel opmaakelement. Er hoeft dus
/// nergens naar het materiaal te worden gekeken.
///
/// ALLEEN de maatgevende toets, en dat is dezelfde keuze als in het live
/// rapport. Elke toets zijn hele keten geven zou een rapport van vijftien
/// bladzijden er dertig maken, en de keten die telt is die van de toets die het
/// ontwerp begrenst. Wie de afleiding van een NIET-maatgevende toets nodig
/// heeft — de slankheidsgrens van een kolom die op buiging bezwijkt,
/// bijvoorbeeld — vindt haar in het hoofdstuk van die toets; `betonkolom` doet
/// dat met zoveel woorden.
fn extend_with_maatgevende_afleiding(flow: &mut Vec<Box<dyn Flowable>>, m: &ReportMember<'_>) {
    let Some(nc) = m.checks.iter().find(|c| c.id == m.governing_check_id) else {
        return;
    };
    let (titel, stappen) = match &nc.kind {
        CheckKind::Resistance(r) => (&r.title, &r.deelstappen),
        CheckKind::Stability(s) => (&s.title, &s.deelstappen),
    };
    if stappen.is_empty() {
        return;
    }
    flow.push(Box::new(
        Paragraph::new(format!("Maatgevende toets, uitgeschreven: {titel}"), style_h3()).kop(),
    ));
    extend_with_deelstappen(flow, stappen);
}

/// Een reeks deelstappen als opmaakelementen: per stap de kop met het artikel,
/// de formule symbolisch, dezelfde formule met de getallen ingevuld, de
/// uitkomst en de kanttekeningen.
///
/// `ingevuld_latex` komt KANT-EN-KLAAR uit de rekenkern en wordt hier dus niet
/// uit `formula_latex` en `variables` in elkaar gezet. Zie de doctekst van
/// [`Deelstap`]: zo'n tekstvervanging loopt stuk op wortels met losse
/// hoofdletters, sommaties over wapeningslagen en eenheidsomrekeningen die
/// helemaal geen symbool hebben.
///
/// De grootheden komen alleen als lijst in beeld bij een stap ZONDER formule —
/// de uitgangspuntenstap. Bij de overige stappen staan diezelfde grootheden al
/// ingevuld in de formule, en zou een lijst eronder ze een tweede keer
/// herhalen. Dezelfde regel als in `components/report/Deelstappen.tsx`.
pub(crate) fn extend_with_deelstappen(flow: &mut Vec<Box<dyn Flowable>>, stappen: &[Deelstap]) {
    for (i, stap) in stappen.iter().enumerate() {
        flow.push(Box::new(
            Paragraph::new(
                if stap.article.is_empty() {
                    format!("{}. {}", i + 1, stap.titel)
                } else {
                    format!("{}. {}    [{}]", i + 1, stap.titel, stap.article)
                },
                style_stap(),
            )
            // De kop van een stap hoort bij de formule eronder; zonder deze
            // schakel blijft hij onderaan een vel achter.
            .kop(),
        ));
        if !stap.formula_latex.is_empty() {
            flow.push(Box::new(Paragraph::new(stap.formula_latex.clone(), style_body())));
        }
        if !stap.ingevuld_latex.is_empty() {
            flow.push(Box::new(Paragraph::new(stap.ingevuld_latex.clone(), style_body())));
        }
        if stap.formula_latex.is_empty() && !stap.variables.is_empty() {
            let vars: String = stap
                .variables
                .iter()
                .map(|v| format!("{} = {:.3} {}", v.symbol, v.value, v.unit))
                .collect::<Vec<_>>()
                .join("   ");
            flow.push(Box::new(Paragraph::new(vars, style_mono())));
        }
        if let Some(v) = stap.value {
            let symbool = if stap.symbol.is_empty() { String::new() } else { format!("{} = ", stap.symbol) };
            flow.push(Box::new(Paragraph::new(
                format!("{symbool}{:.3} {}", v, stap.unit),
                style_amber_value(),
            )));
        }
        // De kanttekeningen van de stap: welke tak van de norm gold, welke
        // aanname eronder ligt, welke grens NIET is getoetst. Een afleiding die
        // stilzwijgend een aanname doet is erger dan geen afleiding.
        for n in &stap.notes {
            flow.push(Box::new(Paragraph::new(n.clone(), style_note())));
        }
    }
    flow.push(Box::new(Spacer::from_mm(2.0)));
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

/// Het omslag. `norm_regels` is de normenregel zoals [`omslag_normregels`] hem
/// heeft opgedeeld: één regel als hij past, meer als hij niet past. Alles
/// eronder — de projectnaam en het infoblok — zakt mee, zodat een tweede
/// normregel niet over de projectnaam heen valt.
fn build_cover_page(input: &ReportInput, norm_regels: &[String]) -> RawPage {
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
    //
    // Met alle vier de kaders past de regel niet op één regel; hij komt hier
    // dan al opgedeeld binnen (zie [`omslag_normregels`]) en de rest van het
    // omslag zakt eronder mee.
    let mut norm_onder_mm = OMSLAG_NORM_TOP_MM;
    if !norm_regels.is_empty() {
        dl.set_font("LiberationSans-Bold", OMSLAG_NORM_PT);
        dl.set_fill_color(C_TEXT);
        for (i, regel) in norm_regels.iter().enumerate() {
            norm_onder_mm = OMSLAG_NORM_TOP_MM + i as f32 * OMSLAG_NORM_REGEL_MM;
            dl.draw_text(left, Mm(norm_onder_mm).into(), regel);
        }
    }

    let project_y_mm = norm_onder_mm + OMSLAG_NA_NORM_MM;
    dl.set_font("LiberationSans-Italic", Pt(13.0));
    dl.set_fill_color(C_MUTED);
    dl.draw_text(left, Mm(project_y_mm).into(), &input.project_name);

    // Project info — manual two-column layout
    let label_x = left;
    let value_x: Pt = Pt(left.0 + Mm(35.0).0 * 2.834_645_7);
    let mut y_mm = project_y_mm + OMSLAG_NA_PROJECT_MM;

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

pub(crate) fn status_label(s: &CheckStatus) -> &'static str {
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
