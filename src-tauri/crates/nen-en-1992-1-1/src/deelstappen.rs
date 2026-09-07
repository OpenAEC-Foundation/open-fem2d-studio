//! De betonafleiding als uitgeschreven stappen, voor het rapport.
//!
//! De rekenkern liep de hele keten al door — f_cd, f_yd, λ, η, de nuttige
//! hoogte, het krachtenevenwicht, de drukzonehoogte, de rekverdeling, de
//! hefboomsarm en het momentenevenwicht — maar leverde alleen de UITKOMST af:
//! één formule `M_Rd = F_c z_c + F_s1 z_s1 + F_s2 z_s2`, een rij variabelen en
//! een getal. Een constructeur kan daarmee de uitkomst nálezen maar niet
//! navertellen. Deze module schrijft de weg ertussen op, in het patroon dat de
//! kiptoetsing van EN 1993 al voert ([`nen_en_1993_1_1_section::Deelstap`]).
//!
//! **Deze module rekent de toets niet opnieuw uit.** Zij krijgt de al berekende
//! grootheden aangereikt — [`StressBlockResult`] voor het spanningsblok,
//! [`MnKappaDiagram`] voor de M-N-κ-route — en schrijft ze op. Dat is een
//! bewuste keuze: elke stap die hier zijn eigen som zou maken, kan van de kern
//! af gaan drijven zonder dat een test dat ziet, en dan beschrijft het rapport
//! een berekening die niet is uitgevoerd. Waar toch iets wordt uitgerekend, is
//! dat óf een zuiver meetkundige herschrijving van getallen die de kern al
//! leverde (de hefboomsarm z = d − λx/2 uit x en d), óf een expliciete
//! kanttekening die niet in de toets zit (de grenzen van 6.1(2)P en 6.1(9), die
//! hieronder worden benoemd maar niet worden getoetst), óf — één keer — een
//! herhaalde aanroep van precies dezelfde kernfunctie met precies dezelfde
//! argumenten: [`doorsnedetoestand_bij_bezwijken`]. Zie de docstring daar.
//!
//! ## Twee routes, twee soorten afleiding
//!
//! * **Spanningsblok** (3.1.7(3), figuur 3.5). Bijna gesloten: de rekverdeling
//!   ligt vast op ε_cu3 aan de gedrukte rand, en alleen x volgt uit een
//!   evenwichtsvergelijking. Die vergelijking is niet gesloten op te lossen
//!   zodra een laag níét vloeit — σ_s hangt dan zelf van x af — en de kern lost
//!   hem dan ook op met bisectie. De afleiding schrijft daarom de
//!   evenwichtsvoorwaarde op en het gevonden x, en zet de bekende gesloten vorm
//!   `x = A_s f_yd / (η f_cd b λ)` er alléén bij als die vorm hier werkelijk
//!   geldt — één trekwapeningslaag die vloeit, geen drukwapening, N_Ed = 0 — en
//!   dan nog pas nadat is nagegaan dat zij hetzelfde getal oplevert.
//! * **M-N-κ** (3.1.7(1) met (3.17)/(3.18)). Daar IS geen gesloten formule:
//!   M_Rd is het grootste moment op een diagram dat door twee geneste iteraties
//!   is opgebouwd (bisectie naar ε₀ bij elke κ, bisectie naar de κ waarbij een
//!   rekgrens breekt). Wat daar wél navertelbaar is, is de doorsnedetoestand
//!   bij bezwijken: de rekverdeling, de drukzonehoogte, de spanning per
//!   wapeningslaag, de betondrukkracht met haar arm, en het evenwicht dat
//!   daarop sluit. Die toestand wordt uitgeschreven; er wordt geen gesloten
//!   formule verzonnen waar een iteratie staat.
//!
//! ## Vindplaatsen
//!
//! De artikelverwijzingen zijn overgenomen uit de doc-commentaren van de
//! functies die de stap uitrekenen ([`crate::factors`], [`crate::bending`],
//! [`crate::mnkappa`], [`crate::stress_strain`]). Drie verwijzingen stonden daar
//! niet en zijn in de norm zelf opgezocht:
//!
//! * **6.1(2)P**, de vijf aannamen achter de momentweerstand, met de door
//!   A1/NB gewijzigde vijfde opsommingsregel die de drukspanning in betonstaal
//!   op ten hoogste 435 MPa begrenst (bladzijde 107 van de PDF-uitgave,
//!   gerenderd gelezen — de tekstextractie plakt daar alle woorden aaneen).
//! * **6.1(9)**, de begrenzing van x_u/d. Formulebeeld; van de gerenderde
//!   bladzijde 108 gelezen, samen met figuur 6.1 en haar verklaring A/B/C.
//! * **4.4.1.1(2)P**, vergelijking (4.1): c_nom = c_min + Δc_dev — de dekking
//!   waaruit de nuttige hoogte volgt.
//!
//! Geen formule en geen normwaarde in deze module is uit het hoofd
//! opgeschreven.

use nen_en_1993_1_1_section::{Deelstap, NamedValue};

use crate::bending::StressBlockResult;
use crate::mnkappa::{
    solve_state, FailureMode, MnKappaDiagram, MnKappaOptions, SectionState,
};
use crate::section::{ConcreteSection, RebarLayer, RectConcreteSection, ReinforcementCage};
use crate::stress_strain::{DesignMaterial, SteelBranch};

// ── Opmaakhulpjes ─────────────────────────────────────────────────────────────

/// Een getal in LaTeX-mathmodus met de Nederlandse decimaalkomma.
///
/// `{,}` in plaats van een losse `,`: LaTeX zet achter een komma in mathmodus
/// een spatie, waardoor "1,13" als "1, 13" oogt. Dezelfde schrijfwijze als in de
/// kipafleiding en als `latexGetal` in de frontend, zodat de ingevulde regels
/// van staal en beton er in hetzelfde rapport hetzelfde uitzien.
pub(crate) fn lx(v: f64, decimalen: usize) -> String {
    if !v.is_finite() {
        return r"\text{n.v.t.}".to_string();
    }
    let mut s = format!("{v:.decimalen$}");
    // Alleen een decimaaldeel dat HELEMAAL nul is valt weg — 300,00 wordt 300,
    // maar 0,800 blijft 0,800. Elke nul afknabbelen zou van λ = 0,800 een "0,8"
    // maken en van ε_cu3 = 3,500 ‰ een "3,5 ‰"; dat oogt minder nauwkeurig dan
    // het is.
    if let Some((geheel, fractie)) = s.split_once('.') {
        if fractie.chars().all(|c| c == '0') {
            s = geheel.to_string();
        }
    }
    // "-0" is geen getal maar een afrondingsartefact.
    if s.trim_start_matches('-').chars().all(|c| c == '0' || c == '.') {
        s = s.trim_start_matches('-').to_string();
    }
    s.replace('.', "{,}")
}

/// Zelfde getal, maar tussen haakjes als het negatief is.
///
/// Zonder haakjes wordt `603{,}19 \cdot -434{,}78` een leesfout, en de kracht in
/// de trekwapening is in de tekenafspraak van deze kern (druk positief) altijd
/// negatief — dat geval is dus de regel en niet de uitzondering.
fn lxh(v: f64, decimalen: usize) -> String {
    let s = lx(v, decimalen);
    if s.starts_with('-') {
        format!("({s})")
    } else {
        s
    }
}

/// Zelfde getal, maar ZONDER de nul-afkapping van [`lx`].
///
/// Voor grootheden waarvan de norm zelf de decimaal schrijft. λ en η staan in
/// (3.19)–(3.22) als "0,8" en "1,0"; met de gewone afkapping zou η als "1"
/// verschijnen naast een λ van "0,8", en dan lijken twee getallen uit dezelfde
/// tabelregel in verschillende nauwkeurigheid te staan.
fn lxv(v: f64, decimalen: usize) -> String {
    if !v.is_finite() {
        return r"\text{n.v.t.}".to_string();
    }
    format!("{v:.decimalen$}").replace('.', "{,}")
}

/// Een getal in lopende tekst (kanttekeningen), met decimaalkomma.
pub(crate) fn nl(x: f64, decimalen: usize) -> String {
    format!("{x:.decimalen$}").replace('.', ",")
}

pub(crate) fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue { symbol: symbol.to_string(), value, unit: unit.to_string() }
}

/// Bouwt één deelstap. Alle velden expliciet, zodat er geen stap kan ontstaan
/// zonder vindplaats.
#[allow(clippy::too_many_arguments)]
pub(crate) fn stap(
    id: &str,
    titel: &str,
    symbol: &str,
    article: &str,
    formula_latex: String,
    ingevuld_latex: String,
    variables: Vec<NamedValue>,
    value: Option<f64>,
    unit: &str,
    notes: Vec<String>,
) -> Deelstap {
    Deelstap {
        id: id.to_string(),
        titel: titel.to_string(),
        symbol: symbol.to_string(),
        article: article.to_string(),
        formula_latex,
        ingevuld_latex,
        variables,
        value,
        unit: unit.to_string(),
        notes,
    }
}

// ── De invoer van de bouwers ──────────────────────────────────────────────────

/// Alles wat beide routes delen: de doorsnede, de korf, het materiaal en het
/// maatgevende krachtspunt. Niets hiervan wordt opnieuw berekend.
pub(crate) struct Betongegevens<'a> {
    pub section: &'a RectConcreteSection,
    pub cage: &'a ReinforcementCage,
    pub mat: &'a DesignMaterial,
    /// De wapeningslagen zoals de toets ze gebruikt, ongespiegeld (z vanaf de
    /// onderrand). De spiegeling bij een negatief moment zit in de kern; deze
    /// afleiding vertelt hem in plaats van hem na te doen.
    pub layers: &'a [RebarLayer],
    /// +1 = trek onder (drukzone boven), −1 = trek boven (drukzone onder).
    pub sign: f64,
    /// Rekenwaarde van de normaalkracht, kN, TREK POSITIEF.
    pub n_ed_kn: f64,
    /// Het moment waarop getoetst wordt, kNm, als absolute waarde. Bij de
    /// M-N-κ-route kan dit door de minimale excentriciteit van 6.1(4) hoger
    /// liggen dan |M_y,Ed|; die verhoging krijgt haar eigen stap.
    pub m_ed_knm: f64,
    /// De onbewerkte |M_y,Ed| van het krachtspunt, kNm.
    pub m_y_ed_knm: f64,
}

impl Betongegevens<'_> {
    fn h(&self) -> f64 {
        self.section.h_mm
    }

    fn b(&self) -> f64 {
        self.section.b_mm
    }

    /// De doorsnede zoals de TOETS hem ziet: bij een negatief moment
    /// omgeklapt, zodat de gedrukte rand boven ligt.
    ///
    /// Precies wat [`crate::bending::stress_block`] doet. Bij een rechthoek
    /// verandert het omklappen niets, bij een T brengt het de flens naar
    /// onderen — en dan ziet het spanningsblok het LIJF. Een afleiding die
    /// hier de ongespiegelde doorsnede zou aflezen, zou bij een negatief
    /// moment de flensbreedte opschrijven waar de toets met de lijfbreedte
    /// heeft gerekend.
    fn werkzame_doorsnede(&self) -> ConcreteSection {
        if self.sign < 0.0 {
            self.section.mirrored()
        } else {
            *self.section
        }
    }

    /// De breedte die het spanningsblok van hoogte `lambda_x` over zijn HELE
    /// hoogte ziet, als dat er één is.
    ///
    /// `Some(b)` bij een rechthoek altijd, en bij een T of L zolang het blok
    /// binnen de gedrukte band blijft; dan is de gesloten vorm van 3.1.7(3)
    /// met díé breedte exact goed. `None` zodra het blok over de bandgrens
    /// heen loopt — dan bestaat er geen enkele breedte waarmee de gesloten
    /// vorm klopt, en mag er in de afleiding ook geen staan.
    fn blokbreedte(&self, lambda_x: f64) -> Option<f64> {
        self.werkzame_doorsnede().uniform_top_width(lambda_x)
    }

    /// Heeft deze doorsnede een flens? Bepaalt of de afleiding de flensmaten
    /// moet noemen.
    fn heeft_flens(&self) -> bool {
        self.section.shape.has_flange()
    }

    /// Afstand van een laag tot de GEDRUKTE rand — de d_i van figuur 3.5.
    fn diepte(&self, l: &RebarLayer) -> f64 {
        if self.sign > 0.0 {
            self.h() - l.z_mm
        } else {
            l.z_mm
        }
    }

    /// De laag die het verst van de gedrukte rand ligt: de trekwapening waar de
    /// nuttige hoogte d bij hoort.
    fn trekleg(&self) -> Option<&RebarLayer> {
        self.layers
            .iter()
            .max_by(|a, b| self.diepte(a).total_cmp(&self.diepte(b)))
    }

    /// De nuttige hoogte d: de diepte van die laag. `None` bij een lege korf.
    fn d_mm(&self) -> Option<f64> {
        self.trekleg().map(|l| self.diepte(l))
    }

    /// Woordelijke aanduiding van de gedrukte rand, voor de kanttekeningen.
    fn gedrukte_rand(&self) -> &'static str {
        if self.sign > 0.0 {
            "bovenzijde"
        } else {
            "onderzijde"
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Stappen die beide routes delen
// ═══════════════════════════════════════════════════════════════════════════

/// Welke route de uitgangspuntenstap beschrijft.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Route {
    /// De rechthoekige spanningsverdeling van 3.1.7(3).
    Spanningsblok,
    /// Het parabool-rechthoekdiagram van 3.1.7(1), M-N-κ.
    MnKappa,
}

/// 1 ── De uitgangspunten: wat er getoetst wordt en waarop dat berust.
fn uitgangspunten(g: &Betongegevens, route: Route) -> Deelstap {
    let mut notes = vec![
        "Art. 6.1(2)P noemt de aannamen achter de uiterste momentweerstand met \
         zoveel woorden: vlakke doorsneden blijven vlak; de rek in het betonstaal met \
         aanhechting is, zowel onder trek als onder druk, gelijk aan die in het omliggende \
         beton; de treksterkte van het beton is verwaarloosd; de drukspanningen in het beton \
         zijn afgeleid uit het spanning-rekdiagram van 3.1.7; de spanningen in het betonstaal \
         zijn afgeleid uit het diagram van 3.2 (figuur 3.8). Alle vijf gelden hier onverkort — \
         ook de derde: er wordt in deze toets NERGENS betontrek meegerekend, ook niet vóór het \
         scheuren."
            .to_string(),
    ];
    notes.push(match route {
        Route::Spanningsblok =>
            "Deze toets rekent met de RECHTHOEKIGE SPANNINGSVERDELING die 3.1.7(3) toestaat \
             (figuur 3.5): de werkelijke, gekromde drukspanningsverdeling wordt vervangen door \
             een blok van hoogte λ·x met spanning η·f_cd. Dat is een toegestane \
             vereenvoudiging, geen exacte weergave; de M-N-κ-toets op hetzelfde krachtspunt \
             integreert het parabool-rechthoekdiagram van 3.1.7(1) wél voluit, en het verschil \
             tussen beide uitkomsten is de prijs van deze vereenvoudiging.",
        Route::MnKappa =>
            "Deze toets integreert het PARABOOL-RECHTHOEKDIAGRAM van 3.1.7(1) — vergelijkingen \
             (3.17) en (3.18) — over de hoogte van de doorsnede, en neemt als momentweerstand \
             het grootste moment op het M-κ-diagram bij deze normaalkracht. Er is dus GEEN \
             gesloten formule: de uitkomst komt uit een iteratie. Wat hieronder navertelbaar \
             wordt gemaakt, is de doorsnedetoestand waarin die iteratie eindigt — de \
             rekverdeling, de drukzonehoogte, de spanning per wapeningslaag en het evenwicht \
             dat daarop sluit.",
    }
    .to_string());
    notes.push(format!(
        "Tekenafspraak. Aan de buitengrens geldt de conventie van de krachtsverdeling: N_Ed \
         positief is TREK, M_y,Ed positief is trek in de onderste vezel. Inwendig rekent de \
         doorsnedeberekening met DRUK POSITIEF; een trekkracht in een wapeningslaag krijgt \
         hieronder dus een minteken. Het moment is hier {} kNm, dus de drukzone ligt aan de {}.",
        nl(g.m_y_ed_knm * g.sign, 2),
        g.gedrukte_rand()
    ));
    notes.push(
        "Vereenvoudiging die de norm niet noemt en die hier wél is gemaakt: het beton dat door \
         de wapeningsstaven wordt VERDRONGEN is niet van de betondrukkracht afgetrokken. In de \
         drukzone telt het oppervlak van de drukwapening dus twee keer mee — één keer als \
         beton, één keer als staal. Het effect is van de orde A_s/A_c (ongeveer een half \
         procent) en werkt naar de ONVEILIGE kant. Beide routes maken dezelfde \
         vereenvoudiging, zodat ze onderling vergelijkbaar blijven."
            .to_string(),
    );

    // Bij een T of een L is één breedte niet genoeg om de doorsnede vast te
    // leggen; dan horen de flens- en lijfmaten in de uitgangspunten te staan.
    // De vorm zelf staat in de kanttekening hieronder.
    if g.heeft_flens() {
        notes.push(format!(
            "De doorsnede is een {vorm}: een flens van {bf} mm breed en {hf} mm dik aan de \
             {kant}, met een lijf van {bw} mm. De flensbreedte wordt verondersteld de \
             MEEWERKENDE breedte b_eff van 5.3.2.1(3) te zijn; deze afleiding bepaalt hem niet.",
            vorm = g.section.shape.label(),
            bf = nl(g.section.b_mm, 0),
            hf = nl(g.section.h_f_mm(), 0),
            kant = if g.section.flange_on_top() { "bovenzijde" } else { "onderzijde" },
            bw = nl(g.section.b_w_mm(), 0),
        ));
    }

    let mut vars = if g.heeft_flens() {
        vec![
            nv("b_f", g.section.b_mm, "mm"),
            nv("h_f", g.section.h_f_mm(), "mm"),
            nv("b_w", g.section.b_w_mm(), "mm"),
        ]
    } else {
        vec![nv("b", g.b(), "mm")]
    };
    vars.extend([
        nv("h", g.h(), "mm"),
        nv("c_{nom}", g.cage.cover_mm, "mm"),
        nv(r"\varnothing_{beugel}", g.cage.stirrup_diameter_mm, "mm"),
        nv("A_{s1}", g.cage.a_s_bottom_mm2(), "mm²"),
        nv("A_{s2}", g.cage.a_s_top_mm2(), "mm²"),
        nv("N_{Ed}", g.n_ed_kn, "kN"),
        nv("M_{y,Ed}", g.m_y_ed_knm, "kNm"),
    ]);
    if g.cage.stirrup_diameter_mm <= 0.0 {
        vars.retain(|v| v.symbol != r"\varnothing_{beugel}");
        notes.push(
            "Er is geen beugel opgegeven. De hoofdwapening ligt in deze berekening dus direct \
             achter de dekking. Dat is een INVOERKEUZE: een balk zonder dwarskrachtwapening is \
             in de praktijk zeldzaam, en een beugel die er wel is maar hier ontbreekt, maakt de \
             nuttige hoogte te groot en de berekende weerstand te hoog."
                .to_string(),
        );
    }

    stap(
        "uitgangspunten",
        "Uitgangspunten van de doorsnedetoetsing",
        "",
        "art. 6.1(2)P",
        String::new(),
        String::new(),
        vars,
        None,
        "",
        notes,
    )
}

/// 2 ── f_cd uit f_ck.
fn f_cd_stap(g: &Betongegevens) -> Deelstap {
    let m = g.mat;
    let mut notes = vec![
        "α_cc = 1,0 is geen aanbeveling maar een NB-bepaling: de Nederlandse nationale bijlage \
         bij 3.1.6(1)P schrijft \"De waarde van α_cc moet gelijk aan 1,0 zijn genomen\". De \
         aanbevolen waarde van de Eurocode zelf (0,85) geldt hier dus NIET; wie met 0,85 rekent \
         komt op een 15 % lagere f_cd uit."
            .to_string(),
    ];
    notes.push(if m.gamma_c == 1.5 {
        "γ_C = 1,5 hoort bij de blijvende en tijdelijke ontwerpsituatie (tabel 2.1N, \
         2.4.2.4(1))."
            .to_string()
    } else {
        format!(
            "γ_C = {} hoort bij de BUITENGEWONE ontwerpsituatie (tabel 2.1N). Deze toets is dus \
             niet de gewone UGT-toets; de uitkomst mag niet met een blijvende of tijdelijke \
             belastingcombinatie worden vergeleken.",
            nl(m.gamma_c, 1)
        )
    });
    notes.push(format!(
        "f_ck = {} N/mm² is de karakteristieke cilinderdruksterkte van {} volgens tabel 3.1.",
        nl(m.f_ck, 0),
        m.concrete_name
    ));

    stap(
        "f_cd",
        "Rekenwaarde van de betondruksterkte",
        "f_{cd}",
        "art. 3.1.6(1)P (3.15)",
        r"f_{cd} = \alpha_{cc} \cdot \frac{f_{ck}}{\gamma_C}".to_string(),
        format!(
            r"f_{{cd}} = {a} \cdot \frac{{{fck}}}{{{gc}}}",
            a = lx(m.alpha_cc, 1),
            fck = lx(m.f_ck, 0),
            gc = lx(m.gamma_c, 2),
        ),
        vec![
            nv(r"\alpha_{cc}", m.alpha_cc, "-"),
            nv("f_{ck}", m.f_ck, "N/mm²"),
            nv(r"\gamma_C", m.gamma_c, "-"),
        ],
        Some(m.f_cd()),
        "N/mm²",
        notes,
    )
}

/// 3 ── f_yd uit f_yk, met ε_yd erbij.
fn f_yd_stap(g: &Betongegevens) -> Deelstap {
    let m = g.mat;
    let s = &m.steel;
    let mut notes = vec![format!(
        "γ_S = {} volgens tabel 2.1N (2.4.2.4(1)). De vloeirek volgt uit f_yd en de \
         elasticiteitsmodulus van 3.2.7(4), E_s = 200 000 N/mm²: ε_yd = f_yd/E_s = {} ‰. Een \
         laag met |ε_s| ≥ ε_yd vloeit; daaronder is de spanning E_s·ε_s.",
        nl(m.gamma_s, 2),
        nl(s.eps_yd * 1e3, 3)
    )];
    notes.push(match s.branch {
        SteelBranch::Horizontal => format!(
            "Aangehouden is de bilineaire spanning-rekrelatie MET HORIZONTALE bovenste tak, \
             3.2.7(2)b: boven ε_yd blijft de spanning f_yd = {} N/mm², hoe groot de rek ook \
             wordt. De norm eist bij deze tak geen rekgrens voor het staal. De \
             verstevigingsreserve tussen f_yk en f_t wordt daarmee NIET benut — dat is de \
             veilige kant.",
            nl(s.f_yd, 2)
        ),
        SteelBranch::Inclined => format!(
            "Aangehouden is de bilineaire relatie met HELLENDE bovenste tak, 3.2.7(2)a: boven \
             ε_yd loopt de spanning lineair op naar k·f_yk/γ_S = {} N/mm² bij ε_uk = {} ‰, met \
             k = {} uit tabel C.1 voor deze ductiliteitsklasse. Bij deze tak geldt wél een \
             rekgrens: ε_ud = 0,9·ε_uk = {} ‰, de waarde die de Nederlandse bijlage bij \
             3.2.7(2) voorschrijft.",
            nl(s.f_ud_inclined, 2),
            nl(s.eps_uk * 1e3, 1),
            nl(m.k, 2),
            nl(s.eps_ud * 1e3, 1)
        ),
    });
    if s.f_yd > 435.0 + 1e-9 {
        notes.push(format!(
            "LET OP, een normgrens die deze berekening NIET toepast. De door A1/NB gewijzigde \
             vijfde opsommingsregel van 6.1(2)P bepaalt dat voor de DRUKSPANNING in betonstaal \
             ten hoogste 435 MPa in rekening mag zijn gebracht. Hier is f_yd = {} N/mm², dus die \
             grens zou bijten zodra een wapeningslaag in de drukzone tot vloeien komt. De kern \
             kapt de drukspanning niet af op 435 MPa; waar drukwapening meetelt is de berekende \
             weerstand daardoor iets hoger dan de norm toestaat. Bij γ_S = 1,15 en f_yk = 500 \
             komt f_yd op 434,78 N/mm² en speelt dit niet.",
            nl(s.f_yd, 2)
        ));
    }

    stap(
        "f_yd",
        "Rekenwaarde van de vloeigrens van het betonstaal",
        "f_{yd}",
        "art. 3.2.7(2), figuur 3.8",
        // Eén stap, één grootheid: de ingevulde regel eindigt vóór de uitkomst,
        // zodat het rapport haar er zelf achter zet. ε_yd hoort bij deze stap
        // maar is niet háár uitkomst; die staat als grootheid en in de
        // toelichting, niet als tweede resultaat op dezelfde regel.
        r"f_{yd} = \frac{f_{yk}}{\gamma_S}".to_string(),
        format!(
            r"f_{{yd}} = \frac{{{fyk}}}{{{gs}}}",
            fyk = lx(m.f_yk, 0),
            gs = lx(m.gamma_s, 2),
        ),
        vec![
            nv("f_{yk}", m.f_yk, "N/mm²"),
            nv(r"\gamma_S", m.gamma_s, "-"),
            nv("E_s", s.e_s, "N/mm²"),
            nv(r"\varepsilon_{yd}", s.eps_yd * 1e3, "‰"),
        ],
        Some(s.f_yd),
        "N/mm²",
        notes,
    )
}

/// 4 ── De nuttige hoogte uit dekking, beugel en staafdiameter.
fn nuttige_hoogte_stap(g: &Betongegevens) -> Option<Deelstap> {
    let leg = g.trekleg()?;
    let d = g.diepte(leg);
    // Uit welke rij komt die laag? De laag die het verst van de gedrukte rand
    // ligt is bij een positief moment de onderwapening en bij een negatief
    // moment de bovenwapening — tenzij die rij leeg is; het label van de laag
    // zegt het zonder gissen.
    let uit_onder = leg.label.starts_with("onder");
    let rij = if uit_onder { &g.cage.bottom } else { &g.cage.top };
    let offset = g.cage.axis_offset_mm(rij);
    // Ligt de trekwapening aan de tegenoverliggende rand, dan is d = h − offset;
    // ligt zij aan de gedrukte rand zelf (een korf met maar één rij, aan de
    // verkeerde kant), dan is d = offset.
    let van_overzijde = d > offset + 1e-9;

    let mut notes = vec![format!(
        "d is de \"effectieve hoogte van een dwarsdoorsnede\" (§1.6): de afstand van de \
         gedrukte rand tot het zwaartepunt van de trekwapening. De norm geeft voor d géén \
         formule — d volgt uit de geometrie van de korf. De afstand van een staafas tot de \
         betonrand is de nominale dekking plus de beugeldiameter plus een halve staafdiameter: \
         {c} + {b} + {ph}/2 = {off} mm. c_nom is invoer van de gebruiker; 4.4.1.1(2)P \
         definieert hem als c_nom = c_min + Δc_dev (4.1), en deze berekening toetst hem NIET \
         aan de milieuklasse van 4.4.1.2.",
        c = nl(g.cage.cover_mm, 0),
        b = nl(g.cage.stirrup_diameter_mm, 0),
        ph = nl(rij.diameter_mm, 0),
        off = nl(offset, 1)
    )];
    notes.push(format!(
        "De trekwapening is hier de {}: die ligt het verst van de gedrukte rand ({}). \
         De staven van één rij liggen in deze berekening op één lijn, op de hoogte van hun \
         gezamenlijke zwaartepunt; een korf met staven in twee lagen boven elkaar wordt dus \
         niet als zodanig gerekend.",
        if uit_onder { "onderwapening" } else { "bovenwapening" },
        g.gedrukte_rand()
    ));
    if g.layers.len() > 1 {
        let druk = g.layers.iter().min_by(|a, b| g.diepte(a).total_cmp(&g.diepte(b)));
        if let Some(dl) = druk {
            notes.push(format!(
                "De andere laag ({}) ligt op d₂ = {} mm van de gedrukte rand. Of hij werkelijk \
                 gedrukt is, hangt af van de drukzonehoogte x en blijkt pas uit de \
                 rekverdeling verderop.",
                dl.label,
                nl(g.diepte(dl), 1)
            ));
        }
    }

    let (formule, ingevuld) = if van_overzijde {
        (
            r"d = h - \left( c_{nom} + \varnothing_{beugel} + \frac{\varnothing}{2} \right)"
                .to_string(),
            format!(
                r"d = {h} - \left( {c} + {b} + \frac{{{ph}}}{{2}} \right)",
                h = lx(g.h(), 0),
                c = lx(g.cage.cover_mm, 1),
                b = lx(g.cage.stirrup_diameter_mm, 1),
                ph = lx(rij.diameter_mm, 1),
            ),
        )
    } else {
        (
            r"d = c_{nom} + \varnothing_{beugel} + \frac{\varnothing}{2}".to_string(),
            format!(
                r"d = {c} + {b} + \frac{{{ph}}}{{2}}",
                c = lx(g.cage.cover_mm, 1),
                b = lx(g.cage.stirrup_diameter_mm, 1),
                ph = lx(rij.diameter_mm, 1),
            ),
        )
    };
    if !van_overzijde {
        notes.push(
            "De enige wapening ligt aan de GEDRUKTE zijde: er is aan de trekzijde geen staaf. \
             d wordt dan gemeten tot die ene laag, die dicht bij de gedrukte rand ligt, en de \
             weerstand blijft navenant klein. Dat is geen rekenfout maar een korf die bij dit \
             momentteken niet past."
                .to_string(),
        );
    }

    Some(stap(
        "nuttige_hoogte",
        "Nuttige hoogte van de doorsnede",
        "d",
        "§1.6; dekking volgens 4.4.1.1(2)P (4.1)",
        formule,
        ingevuld,
        vec![
            nv("h", g.h(), "mm"),
            nv("c_{nom}", g.cage.cover_mm, "mm"),
            nv(r"\varnothing_{beugel}", g.cage.stirrup_diameter_mm, "mm"),
            nv(r"\varnothing", rij.diameter_mm, "mm"),
        ],
        Some(d),
        "mm",
        notes,
    ))
}

// ═══════════════════════════════════════════════════════════════════════════
// De route van het spanningsblok — 3.1.7(3), figuur 3.5
// ═══════════════════════════════════════════════════════════════════════════

/// De volledige afleiding van de buigtoets met de rechthoekige
/// spanningsverdeling, in de volgorde waarin het rapport haar toont.
pub(crate) fn spanningsblok_deelstappen(
    g: &Betongegevens,
    r: &StressBlockResult,
) -> Vec<Deelstap> {
    let mut uit = Vec::with_capacity(11);
    uit.push(uitgangspunten(g, Route::Spanningsblok));
    uit.push(f_cd_stap(g));
    uit.push(f_yd_stap(g));
    uit.push(lambda_eta_stap(g, r));
    uit.extend(nuttige_hoogte_stap(g));
    uit.push(evenwicht_stap(g, r));
    uit.push(rekverdeling_stap(g, r));
    uit.push(betondrukkracht_stap(g, r));
    uit.push(wapeningskrachten_stap(g, r));
    uit.extend(hefboomsarm_stap(g, r));
    uit.push(m_rd_stap(g, r));
    uit
}

/// 5 ── λ en η van het spanningsblok.
fn lambda_eta_stap(g: &Betongegevens, r: &StressBlockResult) -> Deelstap {
    let hoge_klasse = g.mat.f_ck > 50.0;
    let mut notes = vec![format!(
        "λ bepaalt de hoogte van het spanningsblok (λ·x) en η de spanning erin (η·f_cd). \
         Voor f_ck = {} N/mm² geldt de tak f_ck ≤ 50 MPa: λ = 0,8 volgens (3.19) en η = 1,0 \
         volgens (3.21). Boven 50 MPa lopen beide af — (3.20) en (3.22) — omdat het \
         spanning-rekdiagram van hogesterktebeton spitser wordt.",
        nl(g.mat.f_ck, 0)
    )];
    if hoge_klasse {
        notes[0] = format!(
            "Voor f_ck = {} N/mm² geldt de tak 50 < f_ck ≤ 90 MPa: λ = 0,8 − (f_ck − 50)/400 \
             volgens (3.20) en η = 1,0 − (f_ck − 50)/200 volgens (3.22). Het blok wordt dus \
             zowel lager als zwakker dan bij een gewone sterkteklasse.",
            nl(g.mat.f_ck, 0)
        );
    }
    notes.push(
        "De OPMERKING bij 3.1.7(3) — \"Als de breedte van de drukzone afneemt in de richting \
         van de uiterste vezel onder druk, behoort de waarde η·f_cd met 10 % te zijn \
         verminderd\" — geldt hier NIET: de doorsnede is rechthoekig, dus de drukzone heeft \
         over haar hele hoogte dezelfde breedte b."
            .to_string(),
    );

    stap(
        "lambda_eta",
        "Factoren van de rechthoekige spanningsverdeling",
        r"\lambda",
        if hoge_klasse {
            "art. 3.1.7(3) (3.20) en (3.22)"
        } else {
            "art. 3.1.7(3) (3.19) en (3.21)"
        },
        if hoge_klasse {
            r"50 < f_{ck} \le 90\ \text{MPa} \;\Rightarrow\; \lambda = 0{,}8 - \frac{f_{ck} - 50}{400} \quad\text{en}\quad \eta = 1{,}0 - \frac{f_{ck} - 50}{200}"
                .to_string()
        } else {
            r"f_{ck} \le 50\ \text{MPa} \;\Rightarrow\; \lambda = 0{,}8 \quad\text{en}\quad \eta = 1{,}0"
                .to_string()
        },
        // De regel sluit zichzelf af met "λ = …": deze stap levert twee
        // grootheden, en het rapport mag er geen derde "= 0,8" achter zetten.
        format!(
            r"f_{{ck}} = {fck}\ \text{{MPa}} \;\Rightarrow\; \eta = {e} \quad\text{{en}}\quad \lambda = {l}",
            fck = lx(g.mat.f_ck, 0),
            e = lxv(r.eta, 1),
            l = lxv(r.lambda, 1),
        ),
        vec![
            nv("f_{ck}", g.mat.f_ck, "N/mm²"),
            nv(r"\lambda", r.lambda, "-"),
            nv(r"\eta", r.eta, "-"),
        ],
        Some(r.lambda),
        "-",
        notes,
    )
}

/// 6 ── Het krachtenevenwicht waaruit x volgt.
fn evenwicht_stap(g: &Betongegevens, r: &StressBlockResult) -> Deelstap {
    let m = g.mat;
    // De lagen in de volgorde waarin de kern ze doorloopt, met hun diepte.
    let termen: Vec<String> = g
        .layers
        .iter()
        .enumerate()
        .map(|(i, l)| format!(r"{a}\,\sigma_{{s,{n}}}(x)", a = lx(l.area_mm2, 2), n = i + 1))
        .collect();

    let mut notes = vec![
        "Dit is het KRACHTENEVENWICHT van de doorsnede: de betondrukkracht plus de krachten in \
         alle wapeningslagen houden de uitwendige normaalkracht in evenwicht. Druk is in deze \
         vergelijking positief, en N_Ed is trek-positief; vandaar het minteken rechts. De \
         factor 10³ zet N_Ed van kN naar N."
            .to_string(),
        "De onbekende is x, de hoogte van de drukzone. De vergelijking is NIET gesloten op te \
         lossen: σ_s hangt via de rekverdeling ε_s = ε_cu3·(1 − d_i/x) zelf van x af, en het \
         staaldiagram is bilineair, dus de linkerzijde is stuksgewijs. De kern lost hem op met \
         BISECTIE — de inwendige normaalkracht is monotoon stijgend in x, dus er is precies één \
         oplossing tussen x → 0 (alle staal op trek, geen beton) en x = h (de hele doorsnede \
         gedrukt). Wie deze regel naleest, leest een voorwaarde en geen formule."
            .to_string(),
    ];

    // Loopt het blok over een bandgrens heen, dan bestaat er geen enkele
    // breedte waarmee η·f_cd·b·λ·x de betondrukkracht is. Dan hoort de
    // afleiding de INTEGRAAL op te schrijven, en niet een breedte te kiezen.
    let blokbreedte = g.blokbreedte(r.lambda * r.x_mm);
    if blokbreedte.is_none() {
        let s = g.werkzame_doorsnede();
        let (a_blok, _) = s.top_strip(r.lambda * r.x_mm);
        notes.push(format!(
            "HET SPANNINGSBLOK LOOPT DE FLENS UIT. Het blok is λ·x = {lx} mm hoog en de flens \
             is {hf} mm dik, dus over de bovenste {hf} mm is de doorsnede {bf} mm breed en over \
             de overige {rest} mm nog {bw} mm. Er is dus geen ENKELE breedte b waarmee \
             F_c = η·f_cd·b·λ·x klopt; de betondrukkracht is de integraal van de werkelijke \
             breedte b(z) over de blokhoogte: A_c(λ·x) = {bf}·{hf} + {bw}·{rest} = {a} mm². Dat \
             is dezelfde grootheid die de toets zelf gebruikt — hier staat geen tweede \
             berekening. De splitsing over flens en lijf is een benoemde MODELKEUZE: \
             NEN-EN 1992-1-1 geeft in 3.1.7(3) alleen de rechthoekige spanningsverdeling zelf \
             en kent geen grenswaarde λ·x ≤ h_f.",
            lx = nl(r.lambda * r.x_mm, 1),
            hf = nl(s.h_f_mm(), 0),
            bf = nl(s.b_mm, 0),
            bw = nl(s.b_w_mm(), 0),
            rest = nl(r.lambda * r.x_mm - s.h_f_mm(), 1),
            a = nl(a_blok, 0),
        ));
    } else if g.heeft_flens() {
        notes.push(format!(
            "Het spanningsblok is λ·x = {lx} mm hoog en blijft daarmee binnen de gedrukte band \
             van {b} mm breed. De doorsnede gedraagt zich hier dus als een rechthoek van die \
             breedte, en de gesloten vorm van 3.1.7(3) is exact goed.",
            lx = nl(r.lambda * r.x_mm, 1),
            b = nl(blokbreedte.unwrap(), 0),
        ));
    }

    // De klassieke gesloten vorm — alleen als hij hier werkelijk geldt, en pas
    // nadat is nagegaan dat hij hetzelfde getal geeft.
    let klassiek = klassieke_x(g, r);
    if let Some((x_dicht, a_s, b_blok)) = klassiek {
        notes.push(format!(
            "In dit geval — één wapeningslaag, die vloeit en op trek staat, en N_Ed = 0 — valt \
             de vergelijking wél dicht: η·f_cd·b·λ·x = A_s·f_yd geeft x = A_s·f_yd/(η·f_cd·b·λ) \
             = {} · {} / ({} · {} · {} · {}) = {} mm. Dat is de bekende handformule, en zij \
             levert hier hetzelfde getal als de bisectie hierboven. Zodra er drukwapening is, \
             een laag niet vloeit, N_Ed ≠ 0, of het spanningsblok een bandgrens overschrijdt, \
             gaat die vereenvoudiging niet meer op.",
            nl(a_s, 2),
            nl(m.steel.f_yd, 2),
            nl(r.eta, 1),
            nl(m.f_cd(), 2),
            nl(b_blok, 0),
            nl(r.lambda, 1),
            nl(x_dicht, 3)
        ));
    }
    if r.x_mm > g.h() * (1.0 - 1e-9) {
        notes.push(
            "x valt samen met de volle hoogte h: de neutrale lijn ligt op de rand van de \
             doorsnede. Nog iets meer druk en de rechthoekige spanningsverdeling met ε_cu3 aan \
             de rand geldt niet meer — dan gaat het draaipunt C van figuur 6.1 gelden, en dat \
             is de M-N-κ-toets."
                .to_string(),
        );
    }
    if let Some(d) = g.d_mm() {
        if d > 0.0 {
            notes.push(x_u_grens_notitie(g, r.x_mm, d));
        }
    }

    let staaltermen = if termen.is_empty() { "0".to_string() } else { termen.join(" + ") };
    // Twee schrijfwijzen van dezelfde vergelijking. Welke er staat, hangt af
    // van wat de toets werkelijk heeft gedaan: b·λ·x als het blok één breedte
    // ziet, en A_c(λ·x) als het over een bandgrens loopt.
    let (formule, ingevuld, vars) = match blokbreedte {
        Some(b) => (
            r"\eta \cdot f_{cd} \cdot b \cdot \lambda \cdot x + \sum_i A_{s,i} \cdot \sigma_s\!\left( \varepsilon_{cu3} \left( 1 - \frac{d_i}{x} \right) \right) = -N_{Ed} \cdot 10^3"
                .to_string(),
            format!(
                r"{e} \cdot {f} \cdot {b} \cdot {l} \cdot x + {t} = {n} \cdot 10^3 \;\Rightarrow\; x = {x}\ \text{{mm}}",
                e = lx(r.eta, 1),
                f = lx(m.f_cd(), 2),
                b = lx(b, 0),
                l = lx(r.lambda, 1),
                t = staaltermen,
                n = lxh(-g.n_ed_kn, 2),
                x = lx(r.x_mm, 3),
            ),
            vec![
                nv(r"\eta", r.eta, "-"),
                nv("f_{cd}", m.f_cd(), "N/mm²"),
                nv("b", b, "mm"),
                nv(r"\lambda", r.lambda, "-"),
                nv("N_{Ed}", g.n_ed_kn, "kN"),
            ],
        ),
        None => {
            let s = g.werkzame_doorsnede();
            let (a_blok, _) = s.top_strip(r.lambda * r.x_mm);
            (
                r"\eta \cdot f_{cd} \cdot A_c(\lambda x) + \sum_i A_{s,i} \cdot \sigma_s\!\left( \varepsilon_{cu3} \left( 1 - \frac{d_i}{x} \right) \right) = -N_{Ed} \cdot 10^3, \qquad A_c(\lambda x) = \int_{h-\lambda x}^{h} b(z)\,dz"
                    .to_string(),
                format!(
                    r"{e} \cdot {f} \cdot A_c(\lambda x) + {t} = {n} \cdot 10^3 \;\Rightarrow\; x = {x}\ \text{{mm}}, \quad A_c = {bf} \cdot {hf} + {bw} \cdot {rest} = {a}\ \text{{mm}}^2",
                    e = lx(r.eta, 1),
                    f = lx(m.f_cd(), 2),
                    t = staaltermen,
                    n = lxh(-g.n_ed_kn, 2),
                    x = lx(r.x_mm, 3),
                    bf = lx(s.b_mm, 0),
                    hf = lx(s.h_f_mm(), 0),
                    bw = lx(s.b_w_mm(), 0),
                    rest = lx(r.lambda * r.x_mm - s.h_f_mm(), 1),
                    a = lx(a_blok, 0),
                ),
                vec![
                    nv(r"\eta", r.eta, "-"),
                    nv("f_{cd}", m.f_cd(), "N/mm²"),
                    nv("b_f", s.b_mm, "mm"),
                    nv("h_f", s.h_f_mm(), "mm"),
                    nv("b_w", s.b_w_mm(), "mm"),
                    nv(r"A_c(\lambda x)", a_blok, "mm²"),
                    nv(r"\lambda", r.lambda, "-"),
                    nv("N_{Ed}", g.n_ed_kn, "kN"),
                ],
            )
        }
    };

    stap(
        "evenwicht_x",
        "Krachtenevenwicht: hoogte van de drukzone",
        "x",
        "art. 6.1(2)P; figuur 3.5",
        formule,
        ingevuld,
        vars,
        Some(r.x_mm),
        "mm",
        notes,
    )
}

/// De klassieke gesloten vorm van x, maar alleen als hij hier écht geldt én
/// hetzelfde getal oplevert als de bisectie van de kern. Levert x, A_s en de
/// breedte waarmee de vorm is ingevuld.
///
/// Vier voorwaarden, alle vier nodig: precies één wapeningslaag, die laag staat
/// op trek en vloeit, er is geen normaalkracht, en het spanningsblok ziet over
/// zijn hele hoogte één breedte. Faalt er één, dan bestaat de gesloten vorm
/// niet en hoort er ook geen in het rapport te staan. Die vierde voorwaarde
/// zit er voor de T en de L: valt de drukzone geheel in de flens, dan IS de
/// gesloten vorm met de flensbreedte exact goed — loopt het blok het lijf in,
/// dan is er geen breedte die klopt. De numerieke controle erna is de laatste
/// zeef: hij vangt het geval waarin de voorwaarden formeel kloppen maar de kern
/// om een andere reden iets anders deed.
fn klassieke_x(g: &Betongegevens, r: &StressBlockResult) -> Option<(f64, f64, f64)> {
    if g.layers.len() != 1 || r.layers.len() != 1 || g.n_ed_kn.abs() > 1e-9 {
        return None;
    }
    let laag = &r.layers[0];
    if !laag.yields || laag.f_kn >= 0.0 {
        return None;
    }
    let b_blok = g.blokbreedte(r.lambda * r.x_mm)?;
    let a_s = g.layers[0].area_mm2;
    let noemer = r.eta * g.mat.f_cd() * b_blok * r.lambda;
    if noemer <= 0.0 {
        return None;
    }
    let x = a_s * g.mat.steel.f_yd / noemer;
    if (x - r.x_mm).abs() > 1e-6 * r.x_mm.abs().max(1.0) {
        return None;
    }
    Some((x, a_s, b_blok))
}

/// De kanttekening bij 6.1(9): de begrenzing van x_u/d die deze toets niet doet.
///
/// De formule is van de gerenderde bladzijde 108 van de PDF-uitgave gelezen, niet
/// uit het hoofd opgeschreven; de tekstextractie levert daar alleen het
/// omhulsel ("Voldaan moet zijn aan de voorwaarde:") en niet het formulebeeld.
fn x_u_grens_notitie(g: &Betongegevens, x: f64, d: f64) -> String {
    let f_cd = g.mat.f_cd();
    let a_c = g.section.area_mm2();
    let druk_kn = if g.n_ed_kn < 0.0 { -g.n_ed_kn } else { 0.0 };
    let drempel_kn = 0.1 * f_cd * a_c * 1e-3;
    if druk_kn > drempel_kn {
        return format!(
            "Art. 6.1(9) begrenst de drukzonehoogte x_u/d alleen bij buiging zonder \
             normaalkracht en bij een normaaldrukkracht kleiner dan 0,1·f_cd·A_c = {} kN. De \
             drukkracht is hier {} kN en dus groter; die begrenzing geldt voor deze doorsnede \
             niet.",
            nl(drempel_kn, 1),
            nl(druk_kn, 1)
        );
    }
    let f_yd = g.mat.steel.f_yd;
    let grens = if g.mat.f_ck <= 50.0 && f_yd > 0.0 {
        Some(500.0 / (500.0 + f_yd))
    } else {
        None
    };
    let verhouding = x / d;
    let mut t = String::from(
        "EEN NORMGRENS DIE DEZE TOETS NIET CONTROLEERT. Art. 6.1(9) eist dat bij buiging \
         zonder normaalkracht — en ook bij een normaaldrukkracht kleiner dan 0,1·f_cd·A_c — de \
         hoogte van de betondrukzone begrensd is: x_u/d ≤ ε_cu·10⁶/(ε_cu·10⁶ + 7f), met f de \
         naar oppervlak gewogen sterkte van de trekwapening. ",
    );
    if let Some(grenswaarde) = grens {
        t.push_str(&format!(
            "De OPMERKING bij dat artikel staat voor f_ck ≤ 50 MPa de eenvoudiger vorm \
             x_u/d ≤ 500/(500 + f) toe; zonder voorspanning is f = f_yd = {} N/mm², wat op een \
             grens van {} uitkomt. De verhouding in deze berekening is x/d = {}/{} = {}. ",
            nl(f_yd, 2),
            nl(grenswaarde, 3),
            nl(x, 1),
            nl(d, 1),
            nl(verhouding, 3)
        ));
    } else {
        t.push_str(&format!(
            "De verhouding in deze berekening is x/d = {}/{} = {}. ",
            nl(x, 1),
            nl(d, 1),
            nl(verhouding, 3)
        ));
    }
    t.push_str(
        "Die twee getallen zijn met opzet NIET tegen elkaar afgewogen: de x_u van 6.1(9) is \
         gedefinieerd als de drukzonehoogte \"bij dat deel van de wapening dat nodig is voor \
         het opnemen van de voorgeschreven belasting\" — dus bij M_Ed — en de x hierboven hoort \
         bij de volle weerstand M_Rd. Dat zijn verschillende grootheden, en ze vergelijken zou \
         een toets suggereren die hier niet is uitgevoerd. Wie de ductiliteitseis van 6.1(9) \
         wil aantonen, moet dat apart doen.",
    );
    t
}

/// 7 ── De rekverdeling en de aangenomen bezwijkvorm.
fn rekverdeling_stap(g: &Betongegevens, r: &StressBlockResult) -> Deelstap {
    let m = g.mat;
    let mut notes = vec![format!(
        "De rekverdeling ligt bij deze methode VAST, en dat is de kernaanname van de hele \
         toets: aan de gedrukte rand staat de stuik op de grenswaarde ε_cu3 = {} ‰ (tabel 3.1), \
         en daarvandaan loopt de rek lineair naar nul op afstand x. Er is dus AANGENOMEN dat de \
         doorsnede bezwijkt doordat het BETON zijn grensstuik bereikt. De rekverdeling is niet \
         uitgerekend maar opgelegd; alleen x volgde uit het evenwicht.",
        nl(m.eps_cu3 * 1e3, 1)
    )];
    notes.push(
        "ε_cu3 en niet ε_cu2: het spanningsblok is de rechthoekige benadering die bij het \
         BILINEAIRE diagram van 3.1.7(2) hoort, en 6.1(3)P koppelt de grensstuik aan het \
         gebruikte diagram — ε_cu2 bij het parabool-rechthoekdiagram, ε_cu3 bij het bilineaire. \
         Voor f_ck ≤ 50 MPa zijn beide 3,5 ‰, dus daar valt het verschil weg; bij een hogere \
         sterkteklasse niet."
            .to_string(),
    );

    // Bezwijkt het staal eerder dan het beton? Dat toetst deze route niet.
    let eps_trek_max = r
        .layers
        .iter()
        .fold(0.0_f64, |acc, l| acc.max(-l.eps));
    if eps_trek_max > m.steel.eps_ud {
        notes.push(format!(
            "EEN GRENS DIE DEZE ROUTE NIET BEWAAKT. De trekrek in de wapening komt op {} ‰ uit, \
             en dat is meer dan de rekgrens ε_ud = {} ‰ die 6.1(3)P via 3.2.7(2) oplegt. Het \
             staal is in dit rekbeeld dus eerder aan zijn grens dan het beton, terwijl de \
             berekening ε_cu3 aan de betonrand blijft aanhouden. De rechthoekige \
             spanningsverdeling kent die controle niet; de M-N-κ-toets op hetzelfde krachtspunt \
             wél — vergelijk de twee uitkomsten.",
            nl(eps_trek_max * 1e3, 2),
            nl(m.steel.eps_ud * 1e3, 1)
        ));
    } else if eps_trek_max > 0.0 {
        notes.push(format!(
            "De grootste trekrek in de wapening is {} ‰ en blijft daarmee onder de rekgrens \
             ε_ud = {} ‰ van 3.2.7(2). De aanname \"het beton is maatgevend\" is hier dus niet \
             in tegenspraak met de rekgrens van het staal. De rechthoekige spanningsverdeling \
             TOETST die grens overigens niet zelf; dit is een constatering achteraf.",
            nl(eps_trek_max * 1e3, 2),
            nl(m.steel.eps_ud * 1e3, 1)
        ));
    }

    let mut vars = vec![
        nv(r"\varepsilon_{cu3}", m.eps_cu3 * 1e3, "‰"),
        nv("x", r.x_mm, "mm"),
    ];
    for (i, l) in r.layers.iter().enumerate() {
        let diepte = g.h() / 2.0 - l.z_m * 1e3;
        vars.push(nv(&format!("d_{}", i + 1), diepte, "mm"));
        vars.push(nv(
            &format!(r"\varepsilon_{{s,{}}}", i + 1),
            l.eps * 1e3,
            "‰",
        ));
    }

    let regels: Vec<String> = r
        .layers
        .iter()
        .enumerate()
        .map(|(i, l)| {
            let diepte = g.h() / 2.0 - l.z_m * 1e3;
            format!(
                r"\varepsilon_{{s,{n}}} = {ecu} \left( 1 - \frac{{{d}}}{{{x}}} \right) = {e} \cdot 10^{{-3}}",
                n = i + 1,
                ecu = lx(m.eps_cu3, 5),
                d = lx(diepte, 1),
                x = lx(r.x_mm, 2),
                e = lx(l.eps * 1e3, 3),
            )
        })
        .collect();

    stap(
        "rekverdeling",
        "Rekverdeling en aangenomen bezwijkvorm",
        "",
        "art. 6.1(3)P, tabel 3.1, figuur 6.1",
        r"\varepsilon_{s,i} = \varepsilon_{cu3} \left( 1 - \frac{d_i}{x} \right), \qquad \varepsilon_c(\text{gedrukte rand}) = \varepsilon_{cu3}"
            .to_string(),
        regels.join(r" \qquad "),
        vars,
        None,
        "",
        notes,
    )
}

/// 8 ── De betondrukkracht en haar arm.
fn betondrukkracht_stap(g: &Betongegevens, r: &StressBlockResult) -> Deelstap {
    let m = g.mat;
    let lambda_x = r.lambda * r.x_mm;
    let blokbreedte = g.blokbreedte(lambda_x);
    // Diepte van het zwaartepunt van het blok onder de gedrukte rand, zoals de
    // toets hem heeft gebruikt: z_c is h/2 min die diepte. Bij één breedte is
    // dat λx/2; loopt het blok de flens uit, dan ligt het zwaartepunt hoger.
    let zwaartepunt_diepte = g.h() / 2.0 - r.z_c_m * 1e3;

    let mut notes = vec![match blokbreedte {
        Some(b) => format!(
            "F_c is de resultante van het spanningsblok: een rechthoek van hoogte λ·x en \
             spanning η·f_cd over de breedte {} mm. De factor 10⁻³ zet N naar kN.",
            nl(b, 0)
        ),
        None => format!(
            "F_c is de resultante van het spanningsblok. Het blok is λ·x = {lx} mm hoog en \
             loopt de flens uit, dus het staat NIET over één breedte: de spanning η·f_cd werkt \
             over het werkelijke betonoppervlak binnen die hoogte, A_c(λ·x) = {a} mm². De \
             factor 10⁻³ zet N naar kN.",
            lx = nl(lambda_x, 1),
            a = nl(g.werkzame_doorsnede().top_strip(lambda_x).0, 0),
        ),
    }];
    notes.push(match blokbreedte {
        Some(_) => format!(
            "z_c is de arm van die resultante ten opzichte van het MIDDEN van de doorsnede, \
             niet ten opzichte van de trekwapening. Het blok begint aan de gedrukte rand en is \
             λ·x = {lx} mm hoog, dus zijn zwaartepunt ligt λ·x/2 = {half} mm van die rand en \
             daarmee h/2 − λ·x/2 = {z} mm van het midden. Het midden is als momentpunt gekozen \
             omdat de normaalkracht N_Ed daar aangrijpt: alleen dan is het berekende M_Rd \
             hetzelfde moment als de M_y,Ed die uit de krachtsverdeling komt, en mogen ze in de \
             unity check tegen elkaar.",
            lx = nl(lambda_x, 1),
            half = nl(lambda_x / 2.0, 1),
            z = nl(r.z_c_m * 1e3, 1)
        ),
        None => format!(
            "z_c is de arm van die resultante ten opzichte van het MIDDEN van de doorsnede, \
             niet ten opzichte van de trekwapening. Omdat het blok over twee breedten loopt, \
             ligt zijn zwaartepunt NIET op λ·x/2 = {half} mm onder de gedrukte rand maar op \
             {diep} mm — het brede deel bij de rand trekt het omhoog. Vandaar \
             z_c = h/2 − {diep} = {z} mm. Het midden is als momentpunt gekozen omdat de \
             normaalkracht N_Ed daar aangrijpt: alleen dan is het berekende M_Rd hetzelfde \
             moment als de M_y,Ed die uit de krachtsverdeling komt, en mogen ze in de unity \
             check tegen elkaar.",
            half = nl(lambda_x / 2.0, 1),
            diep = nl(zwaartepunt_diepte, 1),
            z = nl(r.z_c_m * 1e3, 1)
        ),
    });

    // Ook hier: de schrijfwijze volgt wat de toets heeft gedaan.
    let (formule, ingevuld, vars) = match blokbreedte {
        Some(b) => (
            r"z_c = \frac{h}{2} - \frac{\lambda \cdot x}{2} \qquad F_c = \eta \cdot f_{cd} \cdot b \cdot \lambda \cdot x \cdot 10^{-3}"
                .to_string(),
            // De arm eerst, de kracht als laatste en zónder haar uitkomst: die
            // zet het rapport erachter. Andersom zou er achter de arm een
            // kracht in kN komen te staan.
            format!(
                r"z_c = \frac{{{h}}}{{2}} - \frac{{{l} \cdot {x}}}{{2}} = {zc}\ \text{{mm}} \qquad F_c = {e} \cdot {f} \cdot {b} \cdot {l} \cdot {x} \cdot 10^{{-3}}",
                h = lx(g.h(), 0),
                l = lx(r.lambda, 1),
                x = lx(r.x_mm, 2),
                zc = lx(r.z_c_m * 1e3, 1),
                e = lx(r.eta, 1),
                f = lx(m.f_cd(), 2),
                b = lx(b, 0),
            ),
            vec![
                nv(r"\eta", r.eta, "-"),
                nv("f_{cd}", m.f_cd(), "N/mm²"),
                nv("b", b, "mm"),
                nv(r"\lambda", r.lambda, "-"),
                nv("x", r.x_mm, "mm"),
                nv("z_c", r.z_c_m * 1e3, "mm"),
            ],
        ),
        None => {
            let s = g.werkzame_doorsnede();
            let (a_blok, _) = s.top_strip(lambda_x);
            (
                r"z_c = \frac{h}{2} - \frac{\int_{h-\lambda x}^{h} (h-z)\,b(z)\,dz}{A_c(\lambda x)} \qquad F_c = \eta \cdot f_{cd} \cdot A_c(\lambda x) \cdot 10^{-3}"
                    .to_string(),
                format!(
                    r"z_c = \frac{{{h}}}{{2}} - {diep} = {zc}\ \text{{mm}} \qquad F_c = {e} \cdot {f} \cdot {a} \cdot 10^{{-3}}",
                    h = lx(g.h(), 0),
                    diep = lx(zwaartepunt_diepte, 1),
                    zc = lx(r.z_c_m * 1e3, 1),
                    e = lx(r.eta, 1),
                    f = lx(m.f_cd(), 2),
                    a = lx(a_blok, 0),
                ),
                vec![
                    nv(r"\eta", r.eta, "-"),
                    nv("f_{cd}", m.f_cd(), "N/mm²"),
                    nv("b_f", s.b_mm, "mm"),
                    nv("h_f", s.h_f_mm(), "mm"),
                    nv("b_w", s.b_w_mm(), "mm"),
                    nv(r"A_c(\lambda x)", a_blok, "mm²"),
                    nv(r"\lambda", r.lambda, "-"),
                    nv("x", r.x_mm, "mm"),
                    nv("z_c", r.z_c_m * 1e3, "mm"),
                ],
            )
        }
    };

    stap(
        "f_c",
        "Betondrukkracht en haar arm",
        "F_c",
        "art. 3.1.7(3), figuur 3.5",
        formule,
        ingevuld,
        vars,
        Some(r.f_c_kn),
        "kN",
        notes,
    )
}

/// 9 ── De krachten in de wapening.
fn wapeningskrachten_stap(g: &Betongegevens, r: &StressBlockResult) -> Deelstap {
    let m = g.mat;
    let mut notes = vec![
        "Per laag: de rek uit de vorige stap gaat door het bilineaire staaldiagram van 3.2.7 \
         naar een spanning, en die maal het staaloppervlak geeft de kracht. Druk is positief, \
         dus een NEGATIEVE kracht is trek. De arm z_s,i is weer gemeten vanaf het midden van de \
         doorsnede, positief naar de gedrukte rand."
            .to_string(),
    ];
    for l in &r.layers {
        notes.push(format!(
            "{label}: ε_s = {eps} ‰ → σ_s = {sig} N/mm² ({tak}); F_s = {f} kN ({soort}), arm \
             {z} mm.",
            label = l.label,
            eps = nl(l.eps * 1e3, 3),
            sig = nl(l.sigma, 2),
            tak = if l.yields {
                "vloeit, dus op de bovenste tak van het diagram".to_string()
            } else {
                format!(
                    "elastisch: |ε_s| < ε_yd = {} ‰, dus σ_s = E_s·ε_s",
                    nl(m.steel.eps_yd * 1e3, 3)
                )
            },
            f = nl(l.f_kn, 2),
            soort = if l.f_kn < 0.0 { "trek" } else { "druk" },
            z = nl(l.z_m * 1e3, 1),
        ));
    }
    if r.layers.iter().any(|l| l.f_kn > 0.0 && l.sigma > 435.0 + 1e-9) {
        notes.push(
            "LET OP: een laag in de drukzone staat op meer dan 435 N/mm². De door A1/NB \
             gewijzigde vijfde opsommingsregel van 6.1(2)P laat voor de drukspanning in \
             betonstaal ten hoogste 435 MPa toe. Die afkapping is hier NIET toegepast; de \
             berekende weerstand is in zoverre hoger dan de norm toestaat."
                .to_string(),
        );
    }
    if r.layers.len() == 1 {
        notes.push(
            "Er is maar één wapeningslaag. Een tweede laag aan de gedrukte zijde zou de \
             drukzone helpen dragen, x verlagen en de hefboomsarm vergroten; die bijdrage is \
             hier eenvoudig afwezig, niet verwaarloosd."
                .to_string(),
        );
    }

    let mut vars = Vec::new();
    let regels: Vec<String> = r
        .layers
        .iter()
        .enumerate()
        .map(|(i, l)| {
            let n = i + 1;
            // De lagen van het resultaat lopen één op één met die van de korf:
            // `stress_block` bouwt zijn `layers` met `zip` over dezelfde reeks.
            // Het oppervlak komt daarom rechtstreeks uit de korf en wordt niet
            // uit kracht en spanning teruggerekend — dat zou bij σ_s = 0 op een
            // deling door nul uitlopen en anders alleen maar afrondingsruis
            // toevoegen aan een getal dat exact bekend is.
            let a_s = g.layers[i].area_mm2;
            vars.push(nv(&format!("A_{{s{n}}}"), a_s, "mm²"));
            vars.push(nv(&format!(r"\sigma_{{s,{n}}}"), l.sigma, "N/mm²"));
            vars.push(nv(&format!("F_{{s{n}}}"), l.f_kn, "kN"));
            vars.push(nv(&format!("z_{{s{n}}}"), l.z_m * 1e3, "mm"));
            format!(
                r"F_{{s{n}}} = {a} \cdot {s} \cdot 10^{{-3}} = {f}\ \text{{kN}}",
                a = lx(a_s, 2),
                s = lxh(l.sigma, 2),
                f = lx(l.f_kn, 2),
            )
        })
        .collect();

    stap(
        "f_s",
        "Krachten in de wapening",
        "",
        "art. 3.2.7, figuur 3.8",
        r"F_{s,i} = A_{s,i} \cdot \sigma_s(\varepsilon_{s,i}) \cdot 10^{-3}, \qquad z_{s,i} = \frac{h}{2} - d_i"
            .to_string(),
        regels.join(r" \qquad "),
        vars,
        None,
        "",
        notes,
    )
}

/// 10 ── De inwendige hefboomsarm.
fn hefboomsarm_stap(g: &Betongegevens, r: &StressBlockResult) -> Option<Deelstap> {
    let d = g.d_mm()?;
    let z = d - r.lambda * r.x_mm / 2.0;
    let mut notes = vec![format!(
        "z is de afstand tussen de resultante van de betondruk en het zwaartepunt van de \
         trekwapening. Dat is geen normformule maar zuivere meetkunde: de betondrukkracht \
         grijpt aan op λ·x/2 = {} mm van de gedrukte rand, de trekwapening ligt op d = {} mm \
         van diezelfde rand, dus de arm ertussen is d − λ·x/2 = {} mm.",
        nl(r.lambda * r.x_mm / 2.0, 1),
        nl(d, 1),
        nl(z, 1)
    )];
    let enkelvoudig = r.layers.len() == 1 && g.n_ed_kn.abs() <= 1e-9;
    if enkelvoudig {
        notes.push(
            "Bij één wapeningslaag en zonder normaalkracht zijn F_c en F_s een zuiver koppel: \
             de twee krachten zijn even groot en tegengesteld, en M_Rd is dan letterlijk \
             kracht maal arm — zie de volgende stap."
                .to_string(),
        );
    } else {
        notes.push(
            "Met drukwapening of met een normaalkracht is M_Rd géén kracht maal deze arm. De \
             krachten vormen dan geen zuiver koppel — hun som is immers −N_Ed en niet nul — en \
             het moment wordt opgeteld uit alle bijdragen om het midden van de doorsnede, zoals \
             de volgende stap doet. z staat hier als vertrouwde maat voor de slankheid van de \
             drukzone, niet als factor in de berekening."
                .to_string(),
        );
    }

    Some(stap(
        "hefboomsarm",
        "Inwendige hefboomsarm",
        "z",
        "meetkunde van figuur 3.5",
        r"z = d - \frac{\lambda \cdot x}{2}".to_string(),
        format!(
            r"z = {d} - \frac{{{l} \cdot {x}}}{{2}}",
            d = lx(d, 1),
            l = lx(r.lambda, 1),
            x = lx(r.x_mm, 2),
        ),
        vec![
            nv("d", d, "mm"),
            nv(r"\lambda", r.lambda, "-"),
            nv("x", r.x_mm, "mm"),
        ],
        Some(z),
        "mm",
        notes,
    ))
}

/// 11 ── Het momentenevenwicht.
fn m_rd_stap(g: &Betongegevens, r: &StressBlockResult) -> Deelstap {
    let bijdrage_c = r.f_c_kn * r.z_c_m;
    let mut termen = vec![format!(
        r"{f} \cdot {z}",
        f = lxh(r.f_c_kn, 2),
        z = lxh(r.z_c_m, 4)
    )];
    let mut notes = vec![format!(
        "Het moment is de som van alle inwendige krachten maal hun arm om het MIDDEN van de \
         doorsnede. Het beton levert {} · {} = {} kNm; ",
        nl(r.f_c_kn, 2),
        nl(r.z_c_m, 4),
        nl(bijdrage_c, 2)
    )];
    let mut staaltekst = String::new();
    for l in &r.layers {
        termen.push(format!(r"{f} \cdot {z}", f = lxh(l.f_kn, 2), z = lxh(l.z_m, 4)));
        staaltekst.push_str(&format!(
            "{} levert {} · {} = {} kNm; ",
            l.label,
            nl(l.f_kn, 2),
            nl(l.z_m, 4),
            nl(l.f_kn * l.z_m, 2)
        ));
    }
    notes[0].push_str(&staaltekst);
    notes[0].push_str(&format!("samen {} kNm.", nl(r.m_rd_knm, 5)));
    notes.push(
        "Let op de tekens: een trekkracht is negatief én ligt aan de andere kant van het \
         midden, dus haar arm is dat ook — het product is positief en telt bij het moment op. \
         Dat is geen toevallige samenloop maar de reden dat de doorsnede weerstand heeft."
            .to_string(),
    );
    if g.n_ed_kn.abs() > 1e-9 {
        notes.push(format!(
            "N_Ed = {} kN is in het KRACHTENevenwicht meegenomen (hij bepaalde x) en niet in \
             het momentenevenwicht: hij grijpt aan in het midden van de doorsnede en heeft \
             daar geen arm. M_Rd is daarmee de momentweerstand BIJ DEZE normaalkracht — een \
             andere N_Ed geeft een andere M_Rd, en dat is precies wat het \
             N-M-interactiediagram laat zien.",
            nl(g.n_ed_kn, 2)
        ));
    }
    if let Some((_, a_s, _)) = klassieke_x(g, r) {
        if let Some(d) = g.d_mm() {
            let z = d - r.lambda * r.x_mm / 2.0;
            notes.push(format!(
                "Voor dit geval is dat gelijk aan de bekende handformule M_Rd = A_s·f_yd·(d − \
                 λ·x/2) = {} · {} · {} · 10⁻⁶ = {} kNm.",
                nl(a_s, 2),
                nl(g.mat.steel.f_yd, 2),
                nl(z, 2),
                nl(a_s * g.mat.steel.f_yd * z * 1e-6, 5)
            ));
        }
    }

    stap(
        "m_rd",
        "Momentenevenwicht: de momentweerstand",
        "M_{Rd}",
        "art. 6.1",
        r"M_{Rd} = F_c \cdot z_c + \sum_i F_{s,i} \cdot z_{s,i}".to_string(),
        format!(r"M_{{Rd}} = {}", termen.join(" + ")),
        vec![nv("F_c", r.f_c_kn, "kN"), nv("z_c", r.z_c_m, "m")],
        Some(r.m_rd_knm),
        "kNm",
        notes,
    )
}

/// De afsluitende stap: wat er precies tegen elkaar wordt gezet.
///
/// De unity check zelf staat al als eigen regel onder de toets; deze stap
/// herhaalt dat getal niet om het getal, maar zegt wat M_Ed IS — welk punt van
/// de omhullende, welke combinatie, en of de minimale excentriciteit van 6.1(4)
/// hem heeft opgetild — en wat de breuk wel en niet betekent. Dat staat nergens
/// anders in het rapport.
fn unity_check_stap(g: &Betongegevens, m_rd_knm: f64, verhoogd_door_e0: Option<f64>) -> Deelstap {
    let uc = if m_rd_knm > 0.0 { g.m_ed_knm / m_rd_knm } else { f64::INFINITY };
    let mut notes = vec![format!(
        "M_Ed is de grootste waarde uit de omhullende van de UGT-combinaties op deze staaf, in \
         absolute waarde genomen: |M_y,Ed| = {} kNm. M_Rd is de momentweerstand BIJ DE \
         BIJBEHORENDE NORMAALKRACHT N_Ed = {} kN.",
        nl(g.m_y_ed_knm, 2),
        nl(g.n_ed_kn, 2)
    )];
    if let Some(e0) = verhoogd_door_e0 {
        notes.push(format!(
            "Niet |M_y,Ed| maar {} kNm is getoetst: art. 6.1(4) eist voor een doorsnede met een \
             drukkracht een minimale excentriciteit e₀ = h/30, maar niet kleiner dan 20 mm, en \
             dat geeft hier e₀ = {} mm en M_Ed ≥ |N_Ed|·e₀. Het toetsmoment is dus NIET het \
             moment dat uit de krachtsverdeling komt maar een door de norm opgelegde \
             ondergrens.",
            nl(g.m_ed_knm, 2),
            nl(e0, 1)
        ));
    }
    notes.push(
        "Wat deze breuk WEL is: een horizontale snede door het N-M-interactiediagram bij N_Ed. \
         Wat zij NIET is: de afstand van het rekenpunt (N_Ed; M_Ed) tot de bezwijkomhullende. \
         Bij een staaf waarvan N en M binnen dezelfde combinatie samen toenemen, geeft deze \
         maat een gunstiger beeld dan een radiale maat zou doen."
            .to_string(),
    );

    stap(
        "unity_check",
        "Unity check",
        "UC",
        "art. 6.1",
        r"UC = \frac{M_{Ed}}{M_{Rd}(N_{Ed})} \le 1{,}0".to_string(),
        format!(
            r"UC = \frac{{{ed}}}{{{rd}}}",
            ed = lx(g.m_ed_knm, 2),
            rd = lx(m_rd_knm, 2)
        ),
        vec![
            nv("M_{Ed}", g.m_ed_knm, "kNm"),
            nv("M_{Rd}", m_rd_knm, "kNm"),
            nv("N_{Ed}", g.n_ed_kn, "kN"),
        ],
        Some(uc),
        "-",
        notes,
    )
}

/// De afleiding als het spanningsblok NIET van toepassing is.
///
/// Een toets die niet doorgaat verdient evengoed een verantwoording: de lezer
/// moet kunnen zien wat er is geprobeerd en waarom het strandde.
pub(crate) fn spanningsblok_afgebroken(g: &Betongegevens, reden: &str) -> Vec<Deelstap> {
    let mut uit = vec![uitgangspunten(g, Route::Spanningsblok), f_cd_stap(g), f_yd_stap(g)];
    uit.extend(nuttige_hoogte_stap(g));
    uit.push(stap(
        "geen_evenwicht",
        "Geen evenwicht met de rechthoekige spanningsverdeling",
        "",
        "art. 6.1(3)P, figuur 6.1",
        String::new(),
        String::new(),
        vec![nv("N_{Ed}", g.n_ed_kn, "kN"), nv("M_{y,Ed}", g.m_y_ed_knm, "kNm")],
        None,
        "",
        vec![
            reden.to_string(),
            "De keten breekt hier af: zonder drukzonehoogte is er geen rekverdeling, geen \
             hefboomsarm en geen momentweerstand. De M-N-κ-toets op hetzelfde krachtspunt kent \
             deze beperking niet — die rekent met de volledige rekverdeling van figuur 6.1, \
             inclusief het draaipunt C voor een geheel gedrukte doorsnede."
                .to_string(),
        ],
    ));
    uit
}

// ═══════════════════════════════════════════════════════════════════════════
// De M-N-κ-route — 3.1.7(1), (3.17)/(3.18)
// ═══════════════════════════════════════════════════════════════════════════

/// De volledige afleiding van de M-N-κ-toets.
///
/// Het antwoord komt hier uit een iteratie en niet uit een gesloten formule. Er
/// wordt dan ook geen gesloten formule verzonnen: de stappen beschrijven het
/// model (de twee spanning-rekrelaties, de vlakke rekverdeling), de manier
/// waarop het evenwicht per kromming wordt gezocht, het criterium waarop de
/// iteratie stopt, en vervolgens de doorsnedetoestand bij bezwijken — de
/// rekverdeling, de drukzonehoogte, de spanning per laag en het evenwicht dat
/// daarop sluit. Dát is wat hier navertelbaar is.
pub(crate) fn mn_kappa_deelstappen(
    g: &Betongegevens,
    diagram: &MnKappaDiagram,
    opts: &MnKappaOptions,
    e0_mm: Option<f64>,
) -> Vec<Deelstap> {
    let mut uit = Vec::with_capacity(12);
    uit.push(uitgangspunten(g, Route::MnKappa));
    uit.push(f_cd_stap(g));
    uit.push(f_yd_stap(g));
    uit.push(betondiagram_stap(g));
    uit.extend(nuttige_hoogte_stap(g));
    uit.push(vlakke_doorsnede_stap(g));
    uit.push(integratie_stap(g, diagram));
    uit.push(bezwijkcriterium_stap(g, diagram));

    let toestand = doorsnedetoestand_bij_bezwijken(g, diagram, opts);
    uit.push(bezwijktoestand_stap(g, diagram, toestand.as_ref()));
    if let Some(s) = toestand.as_ref() {
        uit.push(evenwichtscontrole_stap(g, s));
    }
    uit.push(m_rd_max_stap(g, diagram));
    uit.push(unity_check_stap(g, diagram.m_max_knm, e0_mm));
    uit
}

/// De afleiding als er bij κ = 0 al geen evenwicht is.
pub(crate) fn mn_kappa_afgebroken(g: &Betongegevens, n_rd_kn: f64, reden: String) -> Vec<Deelstap> {
    let mut uit = vec![uitgangspunten(g, Route::MnKappa), f_cd_stap(g), f_yd_stap(g)];
    uit.push(betondiagram_stap(g));
    uit.push(stap(
        "geen_evenwicht",
        "Geen evenwicht bij zuivere normaalkracht",
        "N_{Rd}",
        "art. 6.1(4)",
        String::new(),
        String::new(),
        vec![nv("N_{Ed}", g.n_ed_kn, "kN"), nv("N_{Rd}", n_rd_kn, "kN")],
        Some(n_rd_kn),
        "kN",
        vec![
            reden,
            "Bij κ = 0 — de doorsnede nog ongebogen — kan de normaalkracht al niet in evenwicht \
             worden gebracht binnen de rekgrenzen van 6.1(3)P. Er is dan geen enkele kromming \
             waarbij dat wél lukt, dus er bestaat geen M-κ-diagram en geen momentweerstand. De \
             toets is daarom op de NORMAALKRACHT uitgevoerd en niet op het moment; dat is een \
             andere toets dan bij de overige staven, en de unity check hieronder vergelijkt dus \
             andere grootheden."
                .to_string(),
        ],
    ));
    uit
}

/// De doorsnedetoestand bij bezwijken, opnieuw opgevraagd bij de kern.
///
/// **Dit is de enige plek in deze module waar een kernfunctie opnieuw wordt
/// aangeroepen, en dat verdient uitleg.** [`MnKappaDiagram`] draagt van de
/// bezwijktoestand alleen de samenvatting: κ_u, x_u, ε_c,u, ε_s,u en M_u. De
/// spanning en de kracht per wapeningslaag zitten er niet in, en juist die
/// maken de toestand navertelbaar. Ze alsnog in het diagram opnemen zou het
/// serialisatiecontract van de M-N-κ-kern veranderen; dat is hier niet aan de
/// orde.
///
/// In plaats daarvan wordt [`solve_state`] aangeroepen met exact dezelfde
/// argumenten waarmee [`crate::mnkappa::mn_kappa_diagram`] zijn eigen
/// eindtoestand `su` heeft bepaald: dezelfde doorsnede, dezelfde (zo nodig
/// gespiegelde) lagen, hetzelfde materiaal, dezelfde normaalkracht, de κ_u uit
/// het diagram en dezelfde opties. De bisectie in `solve_eps0` is volledig
/// deterministisch — vaste grenzen, vast aantal halveringen, geen willekeur —
/// dus dit levert bit voor bit dezelfde toestand op en is geen tweede,
/// afwijkende berekening. De test `bezwijktoestand_is_die_van_het_diagram` pint
/// dat vast met een `assert_eq!` op f64.
///
/// De spiegeling wordt hier herhaald omdat `mn_kappa_diagram` haar intern
/// toepast en niet doorgeeft: bij een negatief moment rekent de kern de
/// doorsnede door alsof hij op zijn kop staat, zodat de drukzone altijd boven
/// ligt. Wie dat hier vergeet, krijgt een toestand die bij het spiegelbeeld
/// hoort en dus de verkeerde laag als trekwapening aanwijst.
fn doorsnedetoestand_bij_bezwijken(
    g: &Betongegevens,
    diagram: &MnKappaDiagram,
    opts: &MnKappaOptions,
) -> Option<SectionState> {
    if diagram.points.is_empty() {
        return None;
    }
    let gespiegeld: Vec<RebarLayer>;
    let lagen: &[RebarLayer] = if g.sign < 0.0 {
        gespiegeld = g
            .layers
            .iter()
            .map(|l| RebarLayer {
                z_mm: g.h() - l.z_mm,
                area_mm2: l.area_mm2,
                label: l.label.clone(),
            })
            .collect();
        &gespiegeld
    } else {
        g.layers
    };
    solve_state(g.section, lagen, g.mat, g.n_ed_kn, diagram.kappa_u_per_m, opts)
}

/// De twee spanning-rekrelaties waarmee deze route rekent.
fn betondiagram_stap(g: &Betongegevens) -> Deelstap {
    let c = &g.mat.concrete;
    let notes = vec![
        format!(
            "Dit is het parabool-rechthoekdiagram van figuur 3.3: een parabool met exponent n = \
             {n} tot de rek ε_c2 = {ec2} ‰, waar de spanning f_cd bereikt, en daarna een \
             horizontaal plateau tot de grensrek ε_cu2 = {ecu2} ‰. Alle drie de getallen komen \
             uit tabel 3.1 en horen bij {klasse}.",
            n = nl(c.n, 1),
            ec2 = nl(c.eps_c2 * 1e3, 1),
            ecu2 = nl(c.eps_cu2 * 1e3, 1),
            klasse = g.mat.concrete_name
        ),
        "Dit diagram is NIET hetzelfde als het spanningsblok van de vorige toets. Het blok is \
         de toegestane vereenvoudiging; dit is de kromme zelf, en zij wordt hier over de hoogte \
         van de doorsnede geïntegreerd. Daarom kunnen de twee toetsen op hetzelfde krachtspunt \
         een verschillende M_Rd geven — dat verschil is de vereenvoudiging, niet een fout in \
         een van beide."
            .to_string(),
        "De treksterkte van het beton is nul gezet: onder de rek nul geeft dit diagram geen \
         spanning. Dat is de derde aanname van 6.1(2)P."
            .to_string(),
    ];

    stap(
        "betondiagram",
        "Spanning-rekrelatie van het beton",
        r"\sigma_c",
        "art. 3.1.7(1) (3.17) en (3.18), tabel 3.1",
        r"\sigma_c = f_{cd} \left[ 1 - \left( 1 - \frac{\varepsilon_c}{\varepsilon_{c2}} \right)^{n} \right] \text{ voor } 0 \le \varepsilon_c \le \varepsilon_{c2}; \qquad \sigma_c = f_{cd} \text{ voor } \varepsilon_{c2} \le \varepsilon_c \le \varepsilon_{cu2}"
            .to_string(),
        format!(
            r"\sigma_c = {f} \left[ 1 - \left( 1 - \frac{{\varepsilon_c}}{{{ec2} \cdot 10^{{-3}}}} \right)^{{{n}}} \right]",
            f = lx(c.f_cd, 2),
            ec2 = lx(c.eps_c2 * 1e3, 1),
            n = lx(c.n, 1),
        ),
        vec![
            nv("f_{cd}", c.f_cd, "N/mm²"),
            nv(r"\varepsilon_{c2}", c.eps_c2 * 1e3, "‰"),
            nv(r"\varepsilon_{cu2}", c.eps_cu2 * 1e3, "‰"),
            nv("n", c.n, "-"),
        ],
        None,
        "",
        notes,
    )
}

/// De aanname "vlakke doorsneden blijven vlak", als vergelijking.
fn vlakke_doorsnede_stap(g: &Betongegevens) -> Deelstap {
    stap(
        "vlakke_doorsnede",
        "Rekverdeling over de hoogte",
        r"\varepsilon(z)",
        "art. 6.1(2)P",
        r"\varepsilon(z) = \varepsilon_0 + \kappa \left( z - \frac{h}{2} \right)".to_string(),
        format!(
            r"\varepsilon(z) = \varepsilon_0 + \kappa \left( z - \frac{{{h}}}{{2}} \right)",
            h = lx(g.h(), 0)
        ),
        vec![nv("h", g.h(), "mm")],
        None,
        "",
        vec![
            "\"Vlakke doorsneden blijven vlak\" (6.1(2)P) betekent precies dit: de rek is \
             LINEAIR over de hoogte. De hele doorsnedetoestand ligt daarmee vast in twee \
             getallen — de rek ε₀ in het midden en de kromming κ. Alles wat volgt is een \
             functie van dat paar."
                .to_string(),
            "De tweede aanname van 6.1(2)P zit hier ook in: de rek in een wapeningsstaaf is \
             gelijk aan die in het omringende beton, zowel onder trek als onder druk. Een staaf \
             op hoogte z krijgt dus zonder meer de ε(z) van deze regel. Dat veronderstelt \
             volledige aanhechting; verankeringslengte en aanhechtspanning (8.4) zijn niet \
             getoetst."
                .to_string(),
            "Druk is in deze vergelijking positief, en κ > 0 betekent druk boven en trek onder. \
             Bij een negatief moment rekent de kern de doorsnede gespiegeld door — de \
             wapeningslagen worden in de hoogte omgeklapt — zodat de drukzone altijd boven ligt; \
             de uitkomst wordt daarna teruggedraaid. Dat is een rekentruc en geen aanname."
                .to_string(),
        ],
    )
}

/// De numerieke integratie van de betonspanning en de bisectie naar ε₀.
fn integratie_stap(g: &Betongegevens, diagram: &MnKappaDiagram) -> Deelstap {
    let n = diagram.n_strips.max(1);
    let dz = g.h() / n as f64;
    // Bij meer dan één band krijgt elke band zijn eigen stroken, evenredig met
    // zijn hoogte — zie `mnkappa::internal_forces`. Er ligt dus nooit een
    // strook óver de sprong in b(z) heen, en er is dan ook geen enkele Δz en
    // geen enkele b om op te schrijven.
    let banden: Vec<(f64, f64, usize, f64)> = if g.section.bands().len() > 1 {
        g.section
            .bands()
            .iter()
            .map(|band| {
                let hb = band.height_mm();
                let nb = ((n as f64 * hb / g.h()).round() as usize).max(1);
                (band.b_mm, hb, nb, hb / nb as f64)
            })
            .collect()
    } else {
        Vec::new()
    };
    let bandregel = banden
        .iter()
        .map(|(b, hb, nb, dzb)| {
            format!(
                r"b = {b}\ \text{{mm}}: {nb} \times \Delta z = \frac{{{hb}}}{{{nb}}} = {dzb}\ \text{{mm}}",
                b = lx(*b, 0),
                nb = nb,
                hb = lx(*hb, 0),
                dzb = lx(*dzb, 3),
            )
        })
        .collect::<Vec<_>>()
        .join(r" \qquad ");
    stap(
        "integratie",
        "Evenwicht bij een gegeven kromming",
        // Geen symbool: deze stap levert geen getal maar een voorwaarde en een
        // zoekprocedure. Er is voor ε₀ geen formule om op te schrijven, en doen
        // alsof die er is zou juist verhullen waar het hier om gaat.
        "",
        "art. 6.1(2)P; numerieke uitwerking",
        if banden.is_empty() {
            r"N_c(\varepsilon_0, \kappa) = \sum_{i=1}^{n} \sigma_c\!\left( \varepsilon(z_i) \right) \cdot b \cdot \Delta z, \qquad N_c + \sum_j A_{s,j}\,\sigma_s\!\left( \varepsilon(z_j) \right) = -N_{Ed} \cdot 10^3"
                .to_string()
        } else {
            r"N_c(\varepsilon_0, \kappa) = \sum_{\text{banden}} \sum_{i=1}^{n_b} \sigma_c\!\left( \varepsilon(z_i) \right) \cdot b(z_i) \cdot \Delta z_b, \qquad N_c + \sum_j A_{s,j}\,\sigma_s\!\left( \varepsilon(z_j) \right) = -N_{Ed} \cdot 10^3"
                .to_string()
        },
        if banden.is_empty() {
            format!(
                r"\Delta z = \frac{{{h}}}{{{n}}} = {dz}\ \text{{mm}}, \qquad z_i = \left( i - \tfrac{{1}}{{2}} \right) \Delta z",
                h = lx(g.h(), 0),
                n = n,
                dz = lx(dz, 3),
            )
        } else {
            bandregel
        },
        {
            let mut v = vec![nv("h", g.h(), "mm")];
            if banden.is_empty() {
                v.push(nv("b", g.b(), "mm"));
            } else {
                v.push(nv("b_f", g.section.b_mm, "mm"));
                v.push(nv("h_f", g.section.h_f_mm(), "mm"));
                v.push(nv("b_w", g.section.b_w_mm(), "mm"));
            }
            v.push(nv("n_{stroken}", n as f64, "-"));
            if banden.is_empty() {
                v.push(nv(r"\Delta z", dz, "mm"));
            }
            v.push(nv("N_{Ed}", g.n_ed_kn, "kN"));
            v
        },
        None,
        "",
        {
            let mut notes = vec![if banden.is_empty() {
                format!(
                    "De betonspanning is niet analytisch te integreren zodra de neutrale lijn in \
                     de parabool ligt; zij wordt daarom NUMERIEK bepaald. De doorsnede is in {n} \
                     stroken van {dz} mm verdeeld en per strook is de spanning in het MIDDEN \
                     genomen (middelpuntregel). Dat is een benadering: de fout neemt kwadratisch \
                     af met het aantal stroken, en het aantal stroken is een instelling van de \
                     gebruiker en geen normwaarde. Wie het aantal verlaagt, verandert de \
                     uitkomst.",
                    n = n,
                    dz = nl(dz, 2)
                )
            } else {
                format!(
                    "De betonspanning is niet analytisch te integreren zodra de neutrale lijn in \
                     de parabool ligt; zij wordt daarom NUMERIEK bepaald, per strook met de \
                     spanning in het MIDDEN (middelpuntregel). Omdat de breedte hier SPRINGT, \
                     krijgt elke band zijn eigen stroken — {reeks} — in plaats van {n} stroken \
                     over de hele hoogte. Zo ligt er nooit een strook óver de sprong in b(z) \
                     heen; een strook die dat wél deed, zou daar een breedte tussen de flens en \
                     het lijf in aannemen die de doorsnede nergens heeft. Het aantal stroken is \
                     een instelling van de gebruiker en geen normwaarde.",
                    reeks = banden
                        .iter()
                        .map(|(b, _, nb, dzb)| format!(
                            "{nb} stroken van {dzb} mm over de {b} mm brede band",
                            nb = nb,
                            dzb = nl(*dzb, 2),
                            b = nl(*b, 0)
                        ))
                        .collect::<Vec<_>>()
                        .join(" en "),
                    n = n,
                )
            }];
            notes.push(
                "Bij elke kromming κ wordt ε₀ gezocht waarbij de inwendige normaalkracht gelijk \
                 is aan −N_Ed. Ook dat gaat met BISECTIE: de inwendige normaalkracht is monotoon \
                 niet-dalend in ε₀ omdat elke spanning niet-dalend is in de rek, dus er is \
                 precies één oplossing. Er is hier dus geen formule voor ε₀ — er is een \
                 voorwaarde en een zoekprocedure."
                    .to_string(),
            );
            notes.push(if banden.is_empty() {
                "Ook hier is het door de wapening verdrongen beton niet afgetrokken: de stroken \
                 lopen over de volle breedte b, ook op de hoogte waar staven liggen."
                    .to_string()
            } else {
                "Ook hier is het door de wapening verdrongen beton niet afgetrokken: de stroken \
                 lopen over de volle breedte b(z) van hun band, ook op de hoogte waar staven \
                 liggen."
                    .to_string()
            });
            notes
        },
    )
}

/// Het criterium waarop de iteratie stopt: de rekgrenzen van 6.1(3)P.
fn bezwijkcriterium_stap(g: &Betongegevens, diagram: &MnKappaDiagram) -> Deelstap {
    let c = &g.mat.concrete;
    let s = &g.mat.steel;
    let h_c = g.h() * (1.0 - c.eps_c2 / c.eps_cu2);

    let mut notes = vec![format!(
        "De kromming wordt opgevoerd tot een rekgrens breekt; die grenzen zijn die van 6.1(3)P \
         en figuur 6.1. Drie grenzen tegelijk: (A) de trekrek van het betonstaal ε_ud = {eud} \
         ‰; (B) de betonstuik aan de meest gedrukte vezel ε_cu2 = {ecu2} ‰, zolang de neutrale \
         lijn in de doorsnede ligt; (C) bij een GEHEEL gedrukte doorsnede niet de randstuik \
         maar de stuik op afstand h·(1 − ε_c2/ε_cu2) = {hc} mm van de meest gedrukte vezel, \
         begrensd op ε_c2 = {ec2} ‰. Die derde is het draaipunt C van figuur 6.1, dat de \
         verklaring bij die figuur aanduidt als \"grenswaarde van de betonstuik bij zuivere \
         druk\".",
        eud = nl(s.eps_ud * 1e3, 1),
        ecu2 = nl(c.eps_cu2 * 1e3, 1),
        hc = nl(h_c, 1),
        ec2 = nl(c.eps_c2 * 1e3, 1),
    )];
    notes.push(
        "De grens wordt met bisectie scherp gesteld tussen de laatste kromming die nog voldoet \
         en de eerste die niet meer voldoet. κ_u is dus de LAATSTE toelaatbare kromming, niet \
         de eerste ontoelaatbare."
            .to_string(),
    );
    notes.push(match diagram.failure_mode {
        FailureMode::ConcreteCrushing => format!(
            "Maatgevend is hier grens B/C: het BETON bereikt zijn grensstuik. ε_c = {} ‰ aan de \
             gedrukte rand, bij κ_u = {}·10⁻³/m. Het staal was op dat moment nog niet aan zijn \
             rekgrens (ε_s = {} ‰ tegen ε_ud = {} ‰). Dit is bros bezwijken: de doorsnede geeft \
             vooraf weinig vervorming te zien.",
            nl(diagram.eps_c_u * 1e3, 2),
            nl(diagram.kappa_u_per_m * 1e3, 2),
            nl(diagram.eps_s_u * 1e3, 1),
            nl(s.eps_ud * 1e3, 1)
        ),
        FailureMode::SteelRupture => format!(
            "Maatgevend is grens A: het STAAL bereikt de rekgrens ε_ud = {} ‰ bij κ_u = \
             {}·10⁻³/m, terwijl het beton nog niet bezweken was (ε_c = {} ‰). Bij de hellende \
             tak van 3.2.7(2)a is ε_ud een echte normgrens, dus dit is normbezwijken van het \
             staal.",
            nl(s.eps_ud * 1e3, 1),
            nl(diagram.kappa_u_per_m * 1e3, 2),
            nl(diagram.eps_c_u * 1e3, 2)
        ),
        FailureMode::SteelStrainLimit => format!(
            "Het diagram is beëindigd bij ε_s = ε_ud = {} ‰ (κ_u = {}·10⁻³/m), terwijl het \
             beton nog niet bezweken was (ε_c = {} ‰). LET OP: dit is GEEN normbezwijken. Bij \
             de horizontale tak van 3.2.7(2)b eist de norm geen rekgrens voor het staal; het \
             diagram moet echter ergens eindigen, en dan is ε_ud als praktisch eindpunt \
             aangehouden. Dat is een keuze van deze rekenkern. Zij werkt naar de veilige kant — \
             doorrekenen zou een hoger moment opleveren — maar zij is niet uit de norm af te \
             leiden.",
            nl(diagram.eps_s_u * 1e3, 1),
            nl(diagram.kappa_u_per_m * 1e3, 2),
            nl(diagram.eps_c_u * 1e3, 2)
        ),
        FailureMode::AxialCapacityExceeded | FailureMode::NoEquilibrium => {
            "Er is geen bezwijkpunt gevonden: bij deze normaalkracht bestaat er geen evenwicht \
             binnen de rekgrenzen."
                .to_string()
        }
    });

    stap(
        "bezwijkcriterium",
        "Bezwijkcriterium en uiterste kromming",
        r"\kappa_u",
        "art. 6.1(3)P, figuur 6.1",
        r"\varepsilon_c \le \varepsilon_{cu2} \quad\text{(niet geheel gedrukt)}; \qquad \varepsilon_c\!\left( h \left( 1 - \tfrac{\varepsilon_{c2}}{\varepsilon_{cu2}} \right) \right) \le \varepsilon_{c2} \quad\text{(geheel gedrukt)}; \qquad \varepsilon_s \le \varepsilon_{ud}"
            .to_string(),
        format!(
            r"\varepsilon_c = {ec} \cdot 10^{{-3}} \le {ecu2} \cdot 10^{{-3}} \qquad \varepsilon_s = {es} \cdot 10^{{-3}} \le {eud} \cdot 10^{{-3}} \;\Rightarrow\; \kappa_u = {k} \cdot 10^{{-3}}/\text{{m}}",
            ec = lx(diagram.eps_c_u * 1e3, 3),
            ecu2 = lx(c.eps_cu2 * 1e3, 1),
            es = lx(diagram.eps_s_u * 1e3, 3),
            eud = lx(s.eps_ud * 1e3, 1),
            k = lx(diagram.kappa_u_per_m * 1e3, 3),
        ),
        vec![
            nv(r"\varepsilon_{cu2}", c.eps_cu2 * 1e3, "‰"),
            nv(r"\varepsilon_{c2}", c.eps_c2 * 1e3, "‰"),
            nv(r"\varepsilon_{ud}", s.eps_ud * 1e3, "‰"),
            nv(r"\kappa_u", diagram.kappa_u_per_m * 1e3, "10⁻³/m"),
        ],
        Some(diagram.kappa_u_per_m * 1e3),
        "10⁻³/m",
        notes,
    )
}

/// De doorsnedetoestand bij bezwijken: rekken, drukzone, spanningen per laag.
fn bezwijktoestand_stap(
    g: &Betongegevens,
    diagram: &MnKappaDiagram,
    toestand: Option<&SectionState>,
) -> Deelstap {
    let mut notes = vec![
        "Dit is de toestand waarin de iteratie eindigt, en het dichtst bij een \"afleiding\" \
         dat deze route komt: de doorsnede zoals zij er bij bezwijken uitziet. Twee getallen — \
         ε₀ en κ_u — leggen de hele rekverdeling vast; al het andere volgt eruit."
            .to_string(),
    ];
    let mut vars = vec![
        nv(r"\kappa_u", diagram.kappa_u_per_m * 1e3, "10⁻³/m"),
        nv("x_u", diagram.x_u_mm, "mm"),
        nv(r"\varepsilon_{c,u}", diagram.eps_c_u * 1e3, "‰"),
        nv(r"\varepsilon_{s,u}", diagram.eps_s_u * 1e3, "‰"),
    ];
    // De ingevulde regel is de x_u-formule met de twee randrekken erin. De
    // spanningen per wapeningslaag staan NIET op die regel maar in de
    // toelichting: ze horen bij deze toestand, maar ze zijn niet de uitkomst
    // van deze formule, en achter elkaar op één wiskunderegel worden het zes
    // getallen zonder verband.
    let mut ingevuld = String::new();

    if let Some(s) = toestand {
        // Alleen invullen als de neutrale lijn werkelijk in de doorsnede ligt;
        // bij een geheel gedrukte of geheel getrokken doorsnede is de breuk
        // hieronder niet de formule die geldt.
        let (hoog, laag) = if s.eps_top >= s.eps_bottom {
            (s.eps_top, s.eps_bottom)
        } else {
            (s.eps_bottom, s.eps_top)
        };
        if laag < 0.0 && hoog > 0.0 {
            ingevuld = format!(
                r"x_u = {h} \cdot \frac{{{hoog}}}{{{hoog} - {laag}}}",
                h = lx(g.h(), 0),
                hoog = lxh(hoog * 1e3, 3),
                laag = lxh(laag * 1e3, 3),
            );
        }
    }

    if let Some(s) = toestand {
        notes.push(format!(
            "De rek in het midden van de doorsnede is ε₀ = {e0} ‰; aan de bovenrand {et} ‰ en \
             aan de onderrand {eb} ‰ (druk positief). De neutrale lijn ligt daarmee op x_u = \
             {x} mm van de gedrukte rand — dat is {p} % van de hoogte.",
            e0 = nl(s.eps_0 * 1e3, 3),
            et = nl(s.eps_top * 1e3, 3),
            eb = nl(s.eps_bottom * 1e3, 3),
            x = nl(diagram.x_u_mm, 1),
            p = nl(100.0 * diagram.x_u_mm / g.h(), 1)
        ));
        notes.push(format!(
            "De betondrukkracht is F_c = {fc} kN, met haar resultante op {zc} mm van het midden \
             van de doorsnede. Dat zwaartepunt is hier niet λ·x/2 vanaf de rand zoals bij het \
             spanningsblok, maar het werkelijke zwaartepunt van de geïntegreerde \
             spanningsverdeling.",
            fc = nl(s.f_c_kn, 2),
            zc = nl(s.z_c_mm, 1)
        ));
        vars.push(nv(r"\varepsilon_0", s.eps_0 * 1e3, "‰"));
        vars.push(nv("F_c", s.f_c_kn, "kN"));
        vars.push(nv("z_c", s.z_c_mm, "mm"));

        // De lagen staan in de volgorde van de (zo nodig gespiegelde) reeks
        // waarmee de kern rekende; hun labels lopen mee, dus ze zijn zonder
        // gissen te benoemen.
        for (i, l) in g.layers.iter().enumerate() {
            let (Some(&eps), Some(&sig), Some(&f)) =
                (s.eps_s.get(i), s.sigma_s.get(i), s.f_s_kn.get(i))
            else {
                continue;
            };
            notes.push(format!(
                "{label}: ε_s = {e} ‰ → σ_s = {sg} N/mm² ({tak}), F_s = {f} kN ({soort}).",
                label = l.label,
                e = nl(eps * 1e3, 3),
                sg = nl(sig, 2),
                tak = if eps.abs() >= g.mat.steel.eps_yd {
                    "vloeit".to_string()
                } else {
                    format!(
                        "elastisch, |ε_s| < ε_yd = {} ‰",
                        nl(g.mat.steel.eps_yd * 1e3, 3)
                    )
                },
                f = nl(f, 2),
                soort = if f < 0.0 { "trek" } else { "druk" },
            ));
            let n = i + 1;
            vars.push(nv(&format!(r"\varepsilon_{{s,{n}}}"), eps * 1e3, "‰"));
            vars.push(nv(&format!(r"\sigma_{{s,{n}}}"), sig, "N/mm²"));
            vars.push(nv(&format!("F_{{s{n}}}"), f, "kN"));
        }
        if let (Some(ky), Some(my)) = (diagram.kappa_y_per_m, diagram.m_y_knm) {
            notes.push(format!(
                "Onderweg naar dit punt is de wapening gaan vloeien bij κ_y = {}·10⁻³/m en M_y \
                 = {} kNm. Tussen dat vloeipunt en het bezwijkpunt ligt de vervormingsreserve \
                 van de doorsnede: de kromming groeit daar met factor {} terwijl het moment nog \
                 maar met {} % toeneemt.",
                nl(ky * 1e3, 2),
                nl(my, 2),
                nl(if ky > 0.0 { diagram.kappa_u_per_m / ky } else { f64::NAN }, 1),
                nl(if my > 0.0 { 100.0 * (diagram.m_u_knm / my - 1.0) } else { f64::NAN }, 1)
            ));
        } else {
            notes.push(
                "Er is geen vloeipunt aan te wijzen: de wapening vloeide al bij κ = 0, of zij \
                 vloeit ook bij bezwijken nog niet. In het laatste geval bezwijkt de doorsnede \
                 zonder dat het staal zijn vloeigrens haalt — bros, en een teken van te veel \
                 wapening."
                    .to_string(),
            );
        }
    } else {
        notes.push(
            "De doorsnedetoestand bij bezwijken kon niet opnieuw worden opgevraagd; alleen de \
             samenvattende grootheden uit het diagram staan hier."
                .to_string(),
        );
    }

    stap(
        "bezwijktoestand",
        "Doorsnedetoestand bij bezwijken",
        "x_u",
        "art. 6.1(2)P en 6.1(3)P",
        r"x_u = h \cdot \frac{\varepsilon_{druk}}{\varepsilon_{druk} - \varepsilon_{trek}} \quad (\varepsilon_{trek} < 0 < \varepsilon_{druk})"
            .to_string(),
        ingevuld,
        vars,
        Some(diagram.x_u_mm),
        "mm",
        notes,
    )
}

/// De controle dat het evenwicht bij bezwijken werkelijk sluit.
fn evenwichtscontrole_stap(g: &Betongegevens, s: &SectionState) -> Deelstap {
    let som_staal: f64 = s.f_s_kn.iter().sum();
    let som = s.f_c_kn + som_staal;
    let doel = -g.n_ed_kn;
    let mut termen = vec![lxh(s.f_c_kn, 3)];
    for f in &s.f_s_kn {
        termen.push(lxh(*f, 3));
    }

    stap(
        "evenwichtscontrole",
        "Controle van het krachtenevenwicht bij bezwijken",
        r"\sum F",
        "art. 6.1(2)P",
        r"F_c + \sum_j F_{s,j} = -N_{Ed}".to_string(),
        format!(
            r"{t} = {som}\ \text{{kN}} \quad \text{{tegenover}} \quad -N_{{Ed}} = {doel}\ \text{{kN}}",
            t = termen.join(" + "),
            som = lx(som, 3),
            doel = lx(doel, 3),
        ),
        vec![
            nv("F_c", s.f_c_kn, "kN"),
            nv(r"\sum F_s", som_staal, "kN"),
            nv("N_{Ed}", g.n_ed_kn, "kN"),
        ],
        // Geen eigen uitkomst: de regel hierboven zet beide zijden al naast
        // elkaar. Een derde getal erachter zou de som een derde keer tonen, en
        // het interessante — het RESTJE tussen beide — staat in de toelichting.
        None,
        "kN",
        vec![
            format!(
                "Deze regel bewijst niets over de norm maar wel iets over de berekening: de \
                 inwendige krachten sluiten op {} kN tegen de vereiste {} kN, een verschil van \
                 {} kN. Dat restje is de tolerantie van de bisectie naar ε₀; het is geen \
                 modelfout maar de prijs van een numerieke oplossing, en het hoort zichtbaar te \
                 zijn in plaats van weggerond.",
                nl(som, 4),
                nl(doel, 4),
                nl((som - doel).abs(), 6)
            ),
            "Het MOMENT is op dezelfde manier opgebouwd — elke kracht maal haar arm om het \
             midden van de doorsnede — en levert de M_u waarop de volgende stap teruggrijpt."
                .to_string(),
        ],
    )
}

/// M_Rd als het maximum over het diagram, en wat dat betekent.
fn m_rd_max_stap(g: &Betongegevens, diagram: &MnKappaDiagram) -> Deelstap {
    let piek_voor_einde = diagram.m_max_knm > diagram.m_u_knm + 1e-9;
    let mut notes = vec![format!(
        "De momentweerstand is het GROOTSTE moment dat op het M-κ-diagram bij N_Ed = {} kN \
         voorkomt, niet het moment bij een bepaalde formule. Het diagram is met {} punten \
         uitgeschreven, van κ = 0 tot κ_u.",
        nl(g.n_ed_kn, 2),
        diagram.points.len()
    )];
    if piek_voor_einde {
        notes.push(format!(
            "Het maximum ligt NIET op het bezwijkpunt: M_max = {} kNm tegen M_u = {} kNm aan \
             het einde van het diagram. De tak daalt dus vóór het bezwijken — dat gebeurt als \
             de betondrukzone spanning verliest sneller dan de arm groeit. De weerstand is het \
             maximum, want dáár houdt de doorsnede op meer moment te kunnen opnemen; het \
             verschil van {} kNm is de daling na de piek.",
            nl(diagram.m_max_knm, 3),
            nl(diagram.m_u_knm, 3),
            nl(diagram.m_max_knm - diagram.m_u_knm, 3)
        ));
    } else {
        notes.push(format!(
            "Het maximum valt samen met het bezwijkpunt: M_Rd = M_u = {} kNm. Het moment neemt \
             dus tot het laatst toe en de doorsnede bezwijkt op haar hoogste punt.",
            nl(diagram.m_u_knm, 3)
        ));
    }
    notes.push(
        "Omdat M_Rd het maximum over een DISCREET uitgeschreven diagram is, hangt hij van de \
         puntdichtheid af: een fijner diagram kan een iets hoger maximum vinden. Dat is een \
         eigenschap van deze numerieke aanpak en geen normregel."
            .to_string(),
    );

    stap(
        "m_rd_max",
        "Momentweerstand uit het M-κ-diagram",
        "M_{Rd}",
        "art. 6.1",
        r"M_{Rd} = \max_{0 \le \kappa \le \kappa_u} M(\kappa; N_{Ed})".to_string(),
        format!(
            r"M_{{Rd}} = \max_{{0 \le \kappa \le {ku} \cdot 10^{{-3}}/\text{{m}}}} M(\kappa; {n}\ \text{{kN}})",
            ku = lx(diagram.kappa_u_per_m * 1e3, 3),
            n = lxh(g.n_ed_kn, 2),
        ),
        vec![
            nv("N_{Ed}", g.n_ed_kn, "kN"),
            nv(r"\kappa_u", diagram.kappa_u_per_m * 1e3, "10⁻³/m"),
            nv("M_u", diagram.m_u_knm, "kNm"),
        ],
        Some(diagram.m_max_knm),
        "kNm",
        notes,
    )
}

/// De unity check van het spanningsblok — publiek voor [`crate::checks`].
pub(crate) fn spanningsblok_unity_check(g: &Betongegevens, m_rd_knm: f64) -> Deelstap {
    unity_check_stap(g, m_rd_knm, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bending::stress_block;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use crate::factors::DesignSituation;
    use crate::mnkappa::mn_kappa_diagram;
    use crate::section::RebarRow;

    fn opzet() -> (RectConcreteSection, ReinforcementCage, DesignMaterial) {
        (
            RectConcreteSection::new(300.0, 500.0),
            ReinforcementCage {
                cover_mm: 30.0,
                stirrup_diameter_mm: 8.0,
                top: RebarRow { count: 2, diameter_mm: 12.0 },
                bottom: RebarRow { count: 3, diameter_mm: 16.0 },
            },
            DesignMaterial::new(
                concrete_class_by_name("C30/37").unwrap(),
                reinforcement_grade_by_name("B500B").unwrap(),
                DesignSituation::PersistentTransient,
                SteelBranch::Horizontal,
            ),
        )
    }

    /// De keten beschrijft de berekening; zij mag hem niet veranderen. Deze
    /// test pint de twee getallen die de crate elders al met `assert_eq!` op
    /// f64 vastlegt.
    #[test]
    fn de_afleiding_verschuift_geen_uitkomst() {
        let (s, k, m) = opzet();
        let lagen = k.layers(s.h_mm);
        let r = stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap();
        assert_eq!(r.m_rd_knm, 113.29232963145907);
        let g = Betongegevens {
            section: &s,
            cage: &k,
            mat: &m,
            layers: &lagen,
            sign: 1.0,
            n_ed_kn: 0.0,
            m_ed_knm: 100.0,
            m_y_ed_knm: 100.0,
        };
        let stappen = spanningsblok_deelstappen(&g, &r);
        // De stap die M_Rd draagt, draagt exact hetzelfde getal.
        let m_rd = stappen.iter().find(|d| d.id == "m_rd").unwrap();
        assert_eq!(m_rd.value, Some(113.29232963145907));
        // En de keten heeft de gevraagde stappen, elk met een vindplaats.
        for id in [
            "uitgangspunten",
            "f_cd",
            "f_yd",
            "lambda_eta",
            "nuttige_hoogte",
            "evenwicht_x",
            "rekverdeling",
            "f_c",
            "f_s",
            "hefboomsarm",
            "m_rd",
        ] {
            let d = stappen.iter().find(|d| d.id == id).unwrap_or_else(|| panic!("stap {id} ontbreekt"));
            assert!(!d.article.is_empty(), "stap {id} zonder vindplaats");
            assert!(!d.titel.is_empty(), "stap {id} zonder titel");
        }
    }

    /// De nuttige hoogte en de hefboomsarm zijn de meetkunde van de korf, niet
    /// een tweede berekening.
    #[test]
    fn nuttige_hoogte_en_hefboomsarm() {
        let (s, k, m) = opzet();
        let lagen = k.layers(s.h_mm);
        let r = stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap();
        let g = Betongegevens {
            section: &s,
            cage: &k,
            mat: &m,
            layers: &lagen,
            sign: 1.0,
            n_ed_kn: 0.0,
            m_ed_knm: 100.0,
            m_y_ed_knm: 100.0,
        };
        // d = 500 − (30 + 8 + 16/2) = 454 mm, zoals `ReinforcementCage::d_mm`.
        let d = nuttige_hoogte_stap(&g).unwrap();
        assert_eq!(d.value, Some(454.0));
        assert_eq!(d.value, Some(k.d_mm(s.h_mm)));
        // z = d − λx/2, met x uit de kern.
        let z = hefboomsarm_stap(&g, &r).unwrap();
        assert_eq!(z.value, Some(454.0 - r.lambda * r.x_mm / 2.0));
    }

    /// De gesloten vorm verschijnt alleen als hij werkelijk geldt.
    #[test]
    fn klassieke_formule_alleen_waar_zij_geldt() {
        let (s, mut k, m) = opzet();
        // Mét drukwapening: geen gesloten vorm.
        let lagen = k.layers(s.h_mm);
        let r = stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap();
        let g = Betongegevens {
            section: &s, cage: &k, mat: &m, layers: &lagen,
            sign: 1.0, n_ed_kn: 0.0, m_ed_knm: 100.0, m_y_ed_knm: 100.0,
        };
        assert!(klassieke_x(&g, &r).is_none());

        // Zonder drukwapening en zonder normaalkracht: wél.
        k.top = RebarRow { count: 0, diameter_mm: 12.0 };
        let lagen = k.layers(s.h_mm);
        let r = stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap();
        let g = Betongegevens {
            section: &s, cage: &k, mat: &m, layers: &lagen,
            sign: 1.0, n_ed_kn: 0.0, m_ed_knm: 100.0, m_y_ed_knm: 100.0,
        };
        let (x, a_s, b_blok) = klassieke_x(&g, &r).expect("gesloten vorm hoort hier te gelden");
        assert_eq!(a_s, k.a_s_bottom_mm2());
        assert_eq!(b_blok, s.b_mm, "bij een rechthoek is de blokbreedte gewoon b");
        // Niet exact gelijk en dat hoort ook niet: de kern vindt x met bisectie
        // en stopt bij een intervalbreedte van 10⁻¹⁰·h, dus ongeveer 5·10⁻⁸ mm.
        // De gesloten vorm mag daar niet meer dan die zoekfout van afwijken —
        // wél meer, en dan is het niet dezelfde vergelijking.
        assert!(
            (x - r.x_mm).abs() < 1e-6 * r.x_mm,
            "gesloten vorm {x} tegen bisectie {}",
            r.x_mm
        );

        // Met normaalkracht: niet meer.
        let r_n = stress_block(&s, &lagen, &m, -200.0, 1.0).unwrap();
        let g_n = Betongegevens {
            section: &s, cage: &k, mat: &m, layers: &lagen,
            sign: 1.0, n_ed_kn: -200.0, m_ed_knm: 100.0, m_y_ed_knm: 100.0,
        };
        assert!(klassieke_x(&g_n, &r_n).is_none());
    }

    /// De bezwijktoestand die de afleiding toont, is bit voor bit de
    /// eindtoestand van het diagram zelf — geen tweede berekening.
    #[test]
    fn bezwijktoestand_is_die_van_het_diagram() {
        let (s, k, m) = opzet();
        let lagen = k.layers(s.h_mm);
        let o = MnKappaOptions { n_strips: 50 };
        for sign in [1.0_f64, -1.0] {
            let diagram = mn_kappa_diagram(&s, &lagen, &m, 0.0, sign, &o);
            let g = Betongegevens {
                section: &s, cage: &k, mat: &m, layers: &lagen,
                sign, n_ed_kn: 0.0, m_ed_knm: 50.0, m_y_ed_knm: 50.0 * sign,
            };
            let t = doorsnedetoestand_bij_bezwijken(&g, &diagram, &o).expect("toestand");
            assert_eq!(t.m_knm, diagram.m_u_knm, "moment bij bezwijken, teken {sign}");
            assert_eq!(t.x_mm.unwrap_or(0.0), diagram.x_u_mm, "x_u, teken {sign}");
            assert_eq!(t.kappa_per_m, diagram.kappa_u_per_m, "κ_u, teken {sign}");
        }
    }

    /// De M-N-κ-keten verschuift het vastgelegde getal niet.
    #[test]
    fn mn_kappa_keten_houdt_de_uitkomst() {
        let (s, k, m) = opzet();
        let lagen = k.layers(s.h_mm);
        let o = MnKappaOptions { n_strips: 50 };
        let diagram = mn_kappa_diagram(&s, &lagen, &m, 0.0, 1.0, &o);
        assert_eq!(diagram.m_max_knm, 113.12286139035288);
        let g = Betongegevens {
            section: &s, cage: &k, mat: &m, layers: &lagen,
            sign: 1.0, n_ed_kn: 0.0, m_ed_knm: 100.0, m_y_ed_knm: 100.0,
        };
        let stappen = mn_kappa_deelstappen(&g, &diagram, &o, None);
        let m_rd = stappen.iter().find(|d| d.id == "m_rd_max").unwrap();
        assert_eq!(m_rd.value, Some(113.12286139035288));
        for id in [
            "uitgangspunten",
            "f_cd",
            "f_yd",
            "betondiagram",
            "vlakke_doorsnede",
            "integratie",
            "bezwijkcriterium",
            "bezwijktoestand",
            "evenwichtscontrole",
            "m_rd_max",
            "unity_check",
        ] {
            let d = stappen.iter().find(|d| d.id == id).unwrap_or_else(|| panic!("stap {id} ontbreekt"));
            assert!(!d.article.is_empty(), "stap {id} zonder vindplaats");
        }
    }

    /// Elke aanname zichtbaar: geen enkele stap komt zonder toelichting.
    #[test]
    fn elke_stap_draagt_een_toelichting() {
        let (s, k, m) = opzet();
        let lagen = k.layers(s.h_mm);
        let o = MnKappaOptions { n_strips: 50 };
        let r = stress_block(&s, &lagen, &m, 0.0, 1.0).unwrap();
        let diagram = mn_kappa_diagram(&s, &lagen, &m, 0.0, 1.0, &o);
        let g = Betongegevens {
            section: &s, cage: &k, mat: &m, layers: &lagen,
            sign: 1.0, n_ed_kn: 0.0, m_ed_knm: 100.0, m_y_ed_knm: 100.0,
        };
        for d in spanningsblok_deelstappen(&g, &r)
            .iter()
            .chain(mn_kappa_deelstappen(&g, &diagram, &o, None).iter())
        {
            assert!(!d.notes.is_empty(), "stap {} zonder toelichting", d.id);
            assert!(
                d.notes.iter().all(|n| !n.trim().is_empty()),
                "stap {} met een lege toelichting",
                d.id
            );
        }
    }
}
