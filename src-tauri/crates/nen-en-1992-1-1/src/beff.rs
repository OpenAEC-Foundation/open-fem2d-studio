//! Meewerkende flensbreedte b_eff — NEN-EN 1992-1-1 art. 5.3.2.1
//! (alle grenstoestanden).
//!
//! # Wat de norm letterlijk zegt
//!
//! **5.3.2.1 Meewerkende flensbreedte (alle grenstoestanden)**
//!
//! > (1) P In T-liggers hangt de meewerkende flensbreedte, waarover een
//! > gelijkmatige spanningsverdeling kan zijn aangenomen, af van de afmetingen
//! > van het lijf en de flens, de wijze van belasten, de overspanning, de wijze
//! > van ondersteunen en de dwarswapening.
//! >
//! > (2) De meewerkende flensbreedte behoort te zijn gebaseerd op de afstand
//! > l₀ tussen de momentnulpunten die uit figuur 5.2 mogen zijn verkregen.
//!
//! **Figuur 5.2 — Definitie van l₀, voor het berekenen van de meewerkende
//! flensbreedte.** Een ligger op drie steunpunten met een uitkraging; van
//! links naar rechts de overspanningen l₁, l₂ en de uitkraging l₃, met vier
//! gebieden:
//!
//! ```text
//!   l0 = 0,85 l1   |  l0 = 0,15(l1 + l2)  |  l0 = 0,7 l2  |  l0 = 0,15 l2 + l3
//!   |<---- l1 ---->|<-------------- l2 -------------->|<------- l3 ------->|
//! ```
//!
//! > OPMERKING (bij figuur 5.2)
//! > De lengte van de uitkraging l₃ behoort kleiner te zijn dan de helft van
//! > de aangrenzende overspanning en de verhouding van aangrenzende
//! > overspanningen behoort te liggen tussen 2/3 en 1,5.
//!
//! > (3) De meewerkende flensbreedte b_eff kan voor een T- of L-ligger worden
//! > afgeleid uit:
//! >
//! > ```text
//! >   b_eff = Σ b_eff,i + b_w ≤ b                               (5.7)
//! > ```
//! >
//! > waarin:
//! >
//! > ```text
//! >   b_eff,i = 0,2 b_i + 0,1 l0 ≤ 0,2 l0                       (5.7a)
//! > ```
//! >
//! > en
//! >
//! > ```text
//! >   b_eff,i ≤ b_i                                             (5.7b)
//! > ```
//! >
//! > (voor de notaties zie de figuren 5.2 hierboven en 5.3 hieronder).
//!
//! **Figuur 5.3 — Parameters voor de meewerkende flensbreedte.** b_i is het
//! uitkragende flensdeel aan één zijde van het lijf: de HALVE vrije afstand
//! tot het naastliggende lijf (in de figuur staat b₁ tweemaal tussen twee
//! lijven), of bij een randligger het werkelijke overstek. b = b_w + Σ b_i.
//!
//! > (4) Voor constructieve berekeningen, waarin geen grote nauwkeurigheid is
//! > vereist, mag een constante breedte over de gehele overspanning zijn
//! > aangenomen. De waarde die van toepassing is op de velddoorsnede behoort
//! > hiervoor te zijn aangenomen.
//!
//! Vindplaats: NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020, blz. 71 van de
//! PDF-uitgave in `normen/eurocodes/`. Formules en figuren staan daar als
//! afbeelding; ze zijn van de gerenderde bladzijde afgelezen, niet uit de
//! tekstextractie — die levert `≤` als spatie en de figuren helemaal niet.
//!
//! **De nationale bijlage zegt hier niets over.** De lijst nationaal bepaalde
//! parameters van hoofdstuk 5 bevat 5.1.3(1)P, 5.2(5), 5.5(4), 5.6.3(4),
//! 5.8.3.1(1), 5.8.3.3(1), 5.8.3.3(2), 5.8.5(1), 5.8.6(3), 5.10.1(6),
//! 5.10.2.1(1)P, 5.10.2.1(2), 5.10.2.2(4), 5.10.2.2(5), 5.10.3(2), 5.10.8(2),
//! 5.10.8(3) en 5.10.9(1)P — 5.3.2.1 staat er niet bij, en op de bladzijde
//! zelf staat geen NB-tekst.
//!
//! # Waarom dit hier staat en niet in de aanroeper
//!
//! Deze module rekent ALLEEN de norm. Zij kent geen knopen, geen staven en
//! geen opleggingen: de invoer is een rij overspanningen met de twee
//! uiteinden ([`BeamLine`]) plus de flensmaten ([`FlangeGeometry`]). Dat is
//! precies wat figuur 5.2 tekent. Het omzetten van de modeltopologie naar zo'n
//! liggerlijn — welke staven één doorgaande ligger vormen, waar de steunpunten
//! zitten — kan de crate niet doen en gebeurt in de aanroeper (frontend:
//! `design-mockup/src/lib/beffLiggerlijn.ts`). Die grens houdt deze module
//! toetsbaar tegen de normuitdrukking en niets anders.
//!
//! # Gebieden, niet één getal
//!
//! Figuur 5.2 geeft per gebied een andere l₀ en dus een andere b_eff. De
//! gebieden sluiten precies op elkaar aan: hun LENGTEN zijn gelijk aan de
//! l₀-waarden zelf (0,85l₁ + 0,15(l₁+l₂) = l₁ + 0,15l₂, enzovoort), zodat ze
//! samen de hele liggerlijn beslaan. [`beff_distribution`] levert die
//! verdeling. Boven een tussensteunpunt is b_eff veel kleiner dan in het veld;
//! wie daar met de veldwaarde rekent, rekent de doorsnede te stijf en dus te
//! weinig doorbuiging én te weinig tweede-orde-effect — de onveilige kant.
//! Daarom is de verdeling het antwoord en de constante waarde van 5.3.2.1(4)
//! alleen de expliciet gevraagde terugvaloptie
//! ([`BeffDistribution::constant_for_span`]).
//!
//! # Niet raden
//!
//! Elke uitkomst die buiten figuur 5.2 valt is een [`BeffError`] met de reden,
//! nooit een stilzwijgend getal: een verkeerde b_eff is onzichtbaar en stuurt
//! naast de sterkte ook I_c, M_cr en de tweede orde.

use nen_en_1993_1_1_section::Deelstap;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Inzetfactor van een momentnulpunt bij een steunpunt, als fractie van de
/// overspanning. Uit figuur 5.2: het gebied bij een tussensteunpunt is
/// 0,15·l₁ + 0,15·l₂ lang, dus 0,15 aan elke kant.
const INSET: f64 = 0.15;

/// Ondergrens van de toegestane verhouding tussen aangrenzende overspanningen
/// (OPMERKING bij figuur 5.2).
pub const SPAN_RATIO_MIN: f64 = 2.0 / 3.0;
/// Bovengrens van diezelfde verhouding.
pub const SPAN_RATIO_MAX: f64 = 1.5;
/// De uitkraging behoort kleiner te zijn dan deze fractie van de aangrenzende
/// overspanning (OPMERKING bij figuur 5.2).
pub const CANTILEVER_MAX_RATIO: f64 = 0.5;

/// Relatieve speling op de geldigheidsvoorwaarden. Alleen om te voorkomen dat
/// een ontwerp dat de grens exact raakt (6000 naast 4000 mm is precies 1,5)
/// op een afrondbit afketst. Niet bedoeld om de grens op te rekken.
const RATIO_TOL: f64 = 1e-9;

// ───────────────────────────────────────────────────────────────────────────
// Invoer
// ───────────────────────────────────────────────────────────────────────────

/// Wat er aan één uiteinde van de liggerlijn zit.
///
/// De steunpunten TUSSEN twee overspanningen zijn impliciet; alleen de twee
/// buitenste uiteinden hebben een keuze.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum LineEnd {
    /// Buitensteunpunt dat de hoekverdraaiing niet verhindert — het linker
    /// steunpunt van figuur 5.2. Het moment is er nul, dus het momentnulpunt
    /// valt samen met het steunpunt en het veldgebied loopt tot aan de rand
    /// door (l₀ = 0,85·l₁ voor een eindveld).
    Support,
    /// Momentvast buitensteunpunt: een inklemming, of een raamwerkknoop waar
    /// de ligger op een kolom aansluit.
    ///
    /// **Dit geval staat NIET in figuur 5.2** — die tekent alleen vrij
    /// opgelegde steunpunten. Mechanisch is het wél hetzelfde beeld als een
    /// tussensteunpunt: een steunpuntsmoment met een momentnulpunt op ~0,15·l
    /// in het veld. Deze module leest het daarom als een tussensteunpunt met
    /// maar één aangrenzende overspanning: het veldgebied begint 0,15·l naar
    /// binnen en het steunpuntgebied is 0,15·l lang, dus l₀ = 0,15·l.
    ///
    /// Het veldgebied wordt daarmee ALTIJD 0,15·l korter dan met de
    /// vrij-opgelegde lezing — een enkele overspanning gaat van l naar 0,85·l,
    /// een eindveld van 0,85·l naar 0,7·l — en het steunpuntgebied is er met
    /// 0,15·l ook korter dan een echt tussensteunpunt (0,15·(l₁+l₂)). Een
    /// kleinere l₀ geeft een kleinere b_eff, en dat is aan de veilige kant:
    /// minder drukflens bij de sterkte, en een lagere I dus meer doorbuiging en
    /// meer tweede orde. De keuze staat als melding in
    /// [`BeffDistribution::notes`] — zichtbaar, niet impliciet.
    Restrained,
    /// Vrij einde: de laatste overspanning is een uitkraging (l₃ in figuur
    /// 5.2). Een uitkraging ZONDER aangrenzende overspanning valt buiten de
    /// figuur en levert een fout.
    Free,
}

/// Eén doorgaande liggerlijn zoals figuur 5.2 hem tekent: de overspanningen op
/// volgorde plus de twee uiteinden. Tussen twee opeenvolgende overspanningen
/// zit per definitie een tussensteunpunt.
///
/// De lengtemaat is mm; de coördinaat x loopt vanaf het uiteinde `start`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BeamLine {
    /// Overspanningen in mm, op volgorde van `start` naar `end`.
    pub spans_mm: Vec<f64>,
    /// Wat er aan het begin van de lijn zit (x = 0).
    pub start: LineEnd,
    /// Wat er aan het eind van de lijn zit (x = Σ spans_mm).
    pub end: LineEnd,
}

impl BeamLine {
    pub fn total_length_mm(&self) -> f64 {
        self.spans_mm.iter().sum()
    }

    /// Is overspanning `i` een uitkraging? Alleen de buitenste twee kunnen dat
    /// zijn, en alleen als het bijbehorende uiteinde vrij is.
    fn is_cantilever(&self, i: usize) -> bool {
        (i == 0 && self.start == LineEnd::Free)
            || (i + 1 == self.spans_mm.len() && self.end == LineEnd::Free)
    }
}

/// De flensmaten van figuur 5.3, in mm.
///
/// `b_i_mm` bevat één waarde per uitkragend flensdeel: twee voor een T-ligger,
/// één voor een L-ligger (randligger), geen voor een rechthoek. Elke b_i is de
/// halve vrije afstand tot het naastliggende lijf, of het werkelijke overstek
/// bij een rand. b = b_w + Σ b_i.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct FlangeGeometry {
    /// Lijfbreedte b_w in mm.
    pub b_w_mm: f64,
    /// De uitkragende flensdelen b_i in mm (0, 1 of 2 stuks).
    pub b_i_mm: Vec<f64>,
}

impl FlangeGeometry {
    /// b = b_w + Σ b_i (figuur 5.3).
    pub fn b_mm(&self) -> f64 {
        self.b_w_mm + self.b_i_mm.iter().sum::<f64>()
    }
}

// ───────────────────────────────────────────────────────────────────────────
// Uitvoer
// ───────────────────────────────────────────────────────────────────────────

/// Welk geval uit figuur 5.2 een gebied is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum L0Case {
    /// Veldgebied van een eindveld: één uiteinde vrij opgelegd, het andere een
    /// steunpunt. l₀ = 0,85·l.
    EndSpan,
    /// Veldgebied van een binnenveld: aan beide kanten een steunpunt.
    /// l₀ = 0,7·l.
    InteriorSpan,
    /// Veldgebied van een enkele overspanning die aan beide kanten vrij is
    /// opgelegd. Staat niet in figuur 5.2, maar volgt rechtstreeks uit
    /// 5.3.2.1(2): de momentnulpunten liggen dan in de steunpunten zelf, dus
    /// l₀ = l.
    SingleSpan,
    /// Steunpuntgebied tussen twee overspanningen. l₀ = 0,15·(l_links +
    /// l_rechts).
    InteriorSupport,
    /// Steunpuntgebied bij een momentvast buitenuiteinde. l₀ = 0,15·l.
    /// Zie [`LineEnd::Restrained`] — dit geval staat niet in figuur 5.2.
    RestrainedEnd,
    /// Het gebied dat van binnen de aangrenzende overspanning over het
    /// steunpunt tot het vrije einde loopt. l₀ = 0,15·l_aangrenzend + l_uitkraging.
    Cantilever,
}

impl L0Case {
    /// De vindplaats van dit geval, voor het rapport.
    pub fn source(&self) -> &'static str {
        match self {
            L0Case::EndSpan | L0Case::InteriorSpan | L0Case::InteriorSupport
            | L0Case::Cantilever => "NEN-EN 1992-1-1, figuur 5.2",
            L0Case::SingleSpan => "NEN-EN 1992-1-1, 5.3.2.1(2)",
            L0Case::RestrainedEnd => {
                "NEN-EN 1992-1-1, figuur 5.2 — momentvast uiteinde, projectkeuze"
            }
        }
    }

    /// Is dit een veldgebied? 5.3.2.1(4) vraagt om de VELDwaarde.
    pub fn is_span_region(&self) -> bool {
        matches!(
            self,
            L0Case::EndSpan | L0Case::InteriorSpan | L0Case::SingleSpan
        )
    }
}

/// Eén gebied uit figuur 5.2, met zijn plaats langs de liggerlijn en zijn l₀.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct L0Zone {
    /// Begin van het gebied langs de liggerlijn, mm vanaf `BeamLine::start`.
    pub x_start_mm: f64,
    /// Einde van het gebied langs de liggerlijn, mm.
    pub x_end_mm: f64,
    /// De afstand tussen de momentnulpunten voor dit gebied, mm.
    pub l0_mm: f64,
    pub case: L0Case,
    /// Bij een veldgebied: de overspanning waar het gebied bij hoort
    /// (0-gebaseerd). Bij een steunpuntgebied leeg — dat ligt op twee
    /// overspanningen tegelijk.
    pub span_index: Option<u32>,
    /// De uitdrukking uit figuur 5.2 met de overspanningen ingevuld, bijv.
    /// `"l0 = 0,15·(l1 + l2) = 0,15·(6000 + 5000) = 1650 mm"`.
    pub expression: String,
}

/// Welke van de drie grenzen van (5.7a)/(5.7b) een b_eff,i bepaalde.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum BeffBound {
    /// 0,2·b_i + 0,1·l₀ is maatgevend (5.7a, eerste lid).
    Formula,
    /// De bovengrens 0,2·l₀ is maatgevend (5.7a, tweede lid).
    CapL0,
    /// De bovengrens b_i is maatgevend (5.7b) — het flensdeel is er gewoon
    /// niet breder dan dit.
    CapBi,
}

/// b_eff,i van één uitkragend flensdeel, met alle drie de kandidaten erbij
/// zodat het rapport kan laten zien welke won.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BeffPart {
    /// Het uitkragende flensdeel b_i, mm.
    pub b_i_mm: f64,
    /// 0,2·b_i + 0,1·l₀ (5.7a, eerste lid), mm.
    pub formula_mm: f64,
    /// 0,2·l₀ (5.7a, tweede lid), mm.
    pub cap_l0_mm: f64,
    /// De uitkomst: min van de drie, mm.
    pub b_eff_i_mm: f64,
    pub governing: BeffBound,
}

/// De meewerkende flensbreedte bij één l₀, met de hele afleiding erbij.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BeffAtL0 {
    /// De gebruikte afstand tussen de momentnulpunten, mm.
    pub l0_mm: f64,
    /// Σ b_eff,i + b_w, begrensd op b (5.7), mm.
    pub b_eff_mm: f64,
    /// De totale beschikbare breedte b = b_w + Σ b_i (figuur 5.3), mm.
    pub b_mm: f64,
    /// Per uitkragend flensdeel de afleiding van b_eff,i.
    pub parts: Vec<BeffPart>,
    /// Heeft de bovengrens b van (5.7) ingegrepen? Zie [`BeffZone`].
    pub limited_by_b: bool,
}

/// Eén gebied mét zijn meewerkende flensbreedte.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BeffZone {
    pub zone: L0Zone,
    /// Σ b_eff,i + b_w, begrensd op b (5.7), mm.
    pub b_eff_mm: f64,
    /// De totale beschikbare breedte b = b_w + Σ b_i (figuur 5.3), mm.
    pub b_mm: f64,
    /// Per uitkragend flensdeel de afleiding van b_eff,i.
    pub parts: Vec<BeffPart>,
    /// Heeft de bovengrens b van (5.7) ingegrepen? Met (5.7b) toegepast kan
    /// dat niet meer gebeuren — Σb_eff,i ≤ Σb_i — dus dit hoort altijd false
    /// te zijn. Het veld staat er omdat (5.7) die grens wél noemt en een stille
    /// aanname hier niet past.
    pub limited_by_b: bool,
}

/// De meewerkende flensbreedte over de hele liggerlijn, per gebied.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BeffDistribution {
    /// De gebieden op volgorde; ze sluiten aan en beslaan samen de hele lijn.
    pub zones: Vec<BeffZone>,
    /// Σ overspanningen, mm.
    pub total_length_mm: f64,
    /// Keuzes en aannamen die de uitkomst raken. Leeg betekent: figuur 5.2 is
    /// letterlijk toegepast.
    pub notes: Vec<String>,
}

impl BeffDistribution {
    /// Het gebied waarin een plaats x (mm vanaf het lijnbegin) valt.
    ///
    /// Op een gebiedsgrens wint het LINKER gebied, behalve op x = 0 (dan het
    /// eerste). Buiten de lijn: `None`. De grens ligt op een momentnulpunt en
    /// beide gebieden zijn daar even geldig; de keuze is willekeurig maar
    /// vast, zodat twee aanroepen nooit verschillen.
    pub fn zone_at_mm(&self, x_mm: f64) -> Option<&BeffZone> {
        if self.zones.is_empty() {
            return None;
        }
        let eps = 1e-9 * self.total_length_mm.max(1.0);
        if x_mm < -eps || x_mm > self.total_length_mm + eps {
            return None;
        }
        for (i, z) in self.zones.iter().enumerate() {
            let laatste = i + 1 == self.zones.len();
            if x_mm <= z.zone.x_end_mm + eps || laatste {
                return Some(z);
            }
        }
        self.zones.last()
    }

    /// b_eff op een plaats x langs de liggerlijn, mm.
    pub fn b_eff_at_mm(&self, x_mm: f64) -> Option<f64> {
        self.zone_at_mm(x_mm).map(|z| z.b_eff_mm)
    }

    /// De constante breedte van **5.3.2.1(4)** voor overspanning `span_index`:
    /// "een constante breedte over de gehele overspanning … De waarde die van
    /// toepassing is op de velddoorsnede behoort hiervoor te zijn aangenomen."
    ///
    /// Dat is dus de b_eff van het VELDgebied van die overspanning. Een
    /// uitkraging heeft geen veldgebied en levert `None`; daar is de
    /// vereenvoudiging van (4) niet gedefinieerd.
    pub fn constant_for_span(&self, span_index: usize) -> Option<f64> {
        self.zones
            .iter()
            .find(|z| {
                z.zone.case.is_span_region() && z.zone.span_index == Some(span_index as u32)
            })
            .map(|z| z.b_eff_mm)
    }

    /// De kleinste b_eff over alle gebieden — de waarde die je aanhoudt als je
    /// per se één getal wilt en aan de veilige kant wilt blijven.
    pub fn min_b_eff_mm(&self) -> f64 {
        self.zones
            .iter()
            .map(|z| z.b_eff_mm)
            .fold(f64::INFINITY, f64::min)
    }
}

// ───────────────────────────────────────────────────────────────────────────
// Fouten
// ───────────────────────────────────────────────────────────────────────────

/// Waarom er geen b_eff is. Elke variant draagt zijn eigen reden; er komt
/// nooit een getal terug dat op een aanname berust.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum BeffError {
    /// Geen enkele overspanning: er is geen liggerlijn.
    NoSpans,
    /// Een overspanning is nul of negatief.
    NonPositiveSpan { index: u32, value_mm: f64 },
    /// Beide uiteinden vrij: dat is geen ligger maar een los stuk.
    BothEndsFree,
    /// Een uitkraging zonder aangrenzende overspanning. Figuur 5.2 geeft l₀
    /// voor een uitkraging alleen als 0,15·l₂ + l₃, dus samen met de
    /// aangrenzende overspanning; zonder die overspanning is er geen geval.
    CantileverWithoutAdjacentSpan,
    /// De uitkraging is niet kleiner dan de helft van de aangrenzende
    /// overspanning (OPMERKING bij figuur 5.2).
    CantileverTooLong {
        index: u32,
        cantilever_mm: f64,
        adjacent_mm: f64,
    },
    /// De verhouding van twee aangrenzende overspanningen ligt buiten 2/3 …
    /// 1,5 (OPMERKING bij figuur 5.2).
    SpanRatioOutOfRange {
        first_index: u32,
        first_mm: f64,
        second_mm: f64,
        ratio: f64,
    },
    /// De lijfbreedte is nul of negatief.
    NonPositiveWeb { b_w_mm: f64 },
    /// Een uitkragend flensdeel is negatief.
    NegativeFlange { index: u32, value_mm: f64 },
    /// Meer dan twee uitkragende flensdelen: figuur 5.3 kent er hoogstens twee
    /// (links en rechts van het lijf).
    TooManyFlanges { count: u32 },
}

impl std::fmt::Display for BeffError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BeffError::NoSpans => write!(
                f,
                "geen overspanningen: er is geen liggerlijn om l0 uit af te leiden (5.3.2.1(2))"
            ),
            BeffError::NonPositiveSpan { index, value_mm } => write!(
                f,
                "overspanning {} is {} mm; een overspanning moet groter dan nul zijn",
                index + 1,
                fmt_mm(*value_mm)
            ),
            BeffError::BothEndsFree => write!(
                f,
                "beide uiteinden zijn vrij: dit is geen opgelegde ligger, dus figuur 5.2 \
                 kent er geen geval voor"
            ),
            BeffError::CantileverWithoutAdjacentSpan => write!(
                f,
                "uitkraging zonder aangrenzende overspanning: figuur 5.2 geeft voor een \
                 uitkraging alleen l0 = 0,15·l2 + l3, dus samen met de aangrenzende \
                 overspanning. Voor een losstaande uitkraging geeft de norm geen l0"
            ),
            BeffError::CantileverTooLong {
                index,
                cantilever_mm,
                adjacent_mm,
            } => write!(
                f,
                "uitkraging {} is {} mm en daarmee niet kleiner dan de helft van de \
                 aangrenzende overspanning ({} mm; helft = {} mm). De OPMERKING bij figuur \
                 5.2 stelt die voorwaarde, dus l0 uit die figuur geldt hier niet",
                index + 1,
                fmt_mm(*cantilever_mm),
                fmt_mm(*adjacent_mm),
                fmt_mm(adjacent_mm * CANTILEVER_MAX_RATIO)
            ),
            BeffError::SpanRatioOutOfRange {
                first_index,
                first_mm,
                second_mm,
                ratio,
            } => write!(
                f,
                "de aangrenzende overspanningen {} en {} zijn {} en {} mm; hun verhouding \
                 {:.3} ligt buiten 2/3 … 1,5. De OPMERKING bij figuur 5.2 stelt die \
                 voorwaarde, dus l0 uit die figuur geldt hier niet",
                first_index + 1,
                first_index + 2,
                fmt_mm(*first_mm),
                fmt_mm(*second_mm),
                ratio
            ),
            BeffError::NonPositiveWeb { b_w_mm } => write!(
                f,
                "lijfbreedte b_w is {} mm; die moet groter dan nul zijn",
                fmt_mm(*b_w_mm)
            ),
            BeffError::NegativeFlange { index, value_mm } => write!(
                f,
                "flensdeel b_{} is {} mm; een uitkragend flensdeel kan niet negatief zijn",
                index + 1,
                fmt_mm(*value_mm)
            ),
            BeffError::TooManyFlanges { count } => write!(
                f,
                "{count} uitkragende flensdelen opgegeven; figuur 5.3 kent er hoogstens \
                 twee (links en rechts van het lijf)"
            ),
        }
    }
}

impl std::error::Error for BeffError {}

// ───────────────────────────────────────────────────────────────────────────
// (5.7), (5.7a), (5.7b)
// ───────────────────────────────────────────────────────────────────────────

/// De meewerkende flensbreedte bij één gegeven l₀ — (5.7), (5.7a) en (5.7b).
///
/// ```text
///   b_eff,i = min(0,2·b_i + 0,1·l0 ; 0,2·l0 ; b_i)      (5.7a) + (5.7b)
///   b_eff   = min(Σ b_eff,i + b_w ; b)                  (5.7)
/// ```
///
/// De bovengrens b van (5.7) kan met (5.7b) nooit meer ingrijpen — elke
/// b_eff,i is al ≤ b_i en b = b_w + Σb_i. Zij wordt toch geëvalueerd en het
/// resultaat draagt `limited_by_b`, zodat die redenering in het rapport
/// controleerbaar blijft in plaats van als aanname te verdwijnen.
///
/// Een l₀ ≤ 0 levert b_eff = b_w met alle b_eff,i op nul: zonder afstand
/// tussen momentnulpunten werkt er geen flens mee. Dat geval kan uit
/// [`beff_distribution`] niet komen (die eist positieve overspanningen) maar
/// is hier vastgelegd zodat de losse functie geen NaN kan opleveren.
pub fn effective_flange_width(
    flange: &FlangeGeometry,
    l0_mm: f64,
) -> Result<BeffAtL0, BeffError> {
    validate_flange(flange)?;
    let l0 = l0_mm.max(0.0);

    let mut parts = Vec::with_capacity(flange.b_i_mm.len());
    for &b_i in &flange.b_i_mm {
        let formula = 0.2 * b_i + 0.1 * l0;
        let cap_l0 = 0.2 * l0;
        // Volgorde van de vergelijking: eerst (5.7a) met zijn eigen bovengrens,
        // daarna (5.7b). Bij gelijkspel wint de eerder genoemde grens, zodat de
        // gemelde reden dezelfde volgorde volgt als de norm.
        let (waarde, bound) = if formula <= cap_l0 && formula <= b_i {
            (formula, BeffBound::Formula)
        } else if cap_l0 <= b_i {
            (cap_l0, BeffBound::CapL0)
        } else {
            (b_i, BeffBound::CapBi)
        };
        parts.push(BeffPart {
            b_i_mm: b_i,
            formula_mm: formula,
            cap_l0_mm: cap_l0,
            b_eff_i_mm: waarde,
            governing: bound,
        });
    }

    let som: f64 = parts.iter().map(|p| p.b_eff_i_mm).sum();
    let ongelimiteerd = som + flange.b_w_mm;
    let b = flange.b_mm();
    Ok(BeffAtL0 {
        l0_mm: l0,
        b_eff_mm: ongelimiteerd.min(b),
        b_mm: b,
        parts,
        limited_by_b: ongelimiteerd > b,
    })
}

fn validate_flange(flange: &FlangeGeometry) -> Result<(), BeffError> {
    if !(flange.b_w_mm > 0.0) {
        return Err(BeffError::NonPositiveWeb {
            b_w_mm: flange.b_w_mm,
        });
    }
    if flange.b_i_mm.len() > 2 {
        return Err(BeffError::TooManyFlanges {
            count: flange.b_i_mm.len() as u32,
        });
    }
    for (i, &b_i) in flange.b_i_mm.iter().enumerate() {
        if b_i < 0.0 || !b_i.is_finite() {
            return Err(BeffError::NegativeFlange {
                index: i as u32,
                value_mm: b_i,
            });
        }
    }
    Ok(())
}

// ───────────────────────────────────────────────────────────────────────────
// Figuur 5.2 → gebieden met l₀
// ───────────────────────────────────────────────────────────────────────────

/// De gebieden van figuur 5.2 met hun l₀, over de hele liggerlijn.
///
/// De gebieden sluiten op elkaar aan en beslaan samen [0, Σl]. De lengte van
/// elk gebied is gelijk aan zijn eigen l₀ — dat is precies wat figuur 5.2
/// tekent, en de reden dat de vier uitdrukkingen samen de ligger volmaken.
pub fn l0_zones(line: &BeamLine) -> Result<Vec<L0Zone>, BeffError> {
    validate_line(line)?;

    let n = line.spans_mm.len();
    // Beginafstand van elke overspanning langs de lijn.
    let mut x0 = Vec::with_capacity(n + 1);
    let mut acc = 0.0;
    for &l in &line.spans_mm {
        x0.push(acc);
        acc += l;
    }
    x0.push(acc);

    let mut zones: Vec<L0Zone> = Vec::new();

    // 1. Momentvast buitenuiteinde aan het begin: een steunpuntgebied van
    //    0,15·l1 (zie `LineEnd::Restrained`).
    if line.start == LineEnd::Restrained {
        let l1 = line.spans_mm[0];
        let lengte = INSET * l1;
        zones.push(L0Zone {
            x_start_mm: 0.0,
            x_end_mm: lengte,
            l0_mm: lengte,
            case: L0Case::RestrainedEnd,
            span_index: Some(0),
            expression: format!(
                "l0 = 0,15·l1 = 0,15·{} = {} mm",
                fmt_mm(l1),
                fmt_mm(lengte)
            ),
        });
    }

    for i in 0..n {
        let l = line.spans_mm[i];

        // 2. Veldgebied van overspanning i — behalve bij een uitkraging: die
        //    hoort helemaal bij het gebied van het naastliggende steunpunt.
        if !line.is_cantilever(i) {
            let inzet_links = if i == 0 {
                match line.start {
                    LineEnd::Support => 0.0,
                    LineEnd::Restrained => INSET * l,
                    // Onbereikbaar: een uitkraging is al afgevangen.
                    LineEnd::Free => INSET * l,
                }
            } else {
                INSET * l
            };
            let inzet_rechts = if i + 1 == n {
                match line.end {
                    LineEnd::Support => 0.0,
                    LineEnd::Restrained => INSET * l,
                    LineEnd::Free => INSET * l,
                }
            } else {
                INSET * l
            };
            let start = x0[i] + inzet_links;
            let eind = x0[i + 1] - inzet_rechts;
            let l0 = eind - start;

            let vrij_links = i == 0 && line.start == LineEnd::Support;
            let vrij_rechts = i + 1 == n && line.end == LineEnd::Support;
            let (case, expr) = match (vrij_links, vrij_rechts) {
                (true, true) => (
                    L0Case::SingleSpan,
                    format!("l0 = l{} = {} mm", i + 1, fmt_mm(l0)),
                ),
                (true, false) | (false, true) => (
                    L0Case::EndSpan,
                    format!(
                        "l0 = 0,85·l{} = 0,85·{} = {} mm",
                        i + 1,
                        fmt_mm(l),
                        fmt_mm(l0)
                    ),
                ),
                (false, false) => (
                    L0Case::InteriorSpan,
                    format!(
                        "l0 = 0,7·l{} = 0,7·{} = {} mm",
                        i + 1,
                        fmt_mm(l),
                        fmt_mm(l0)
                    ),
                ),
            };
            zones.push(L0Zone {
                x_start_mm: start,
                x_end_mm: eind,
                l0_mm: l0,
                case,
                span_index: Some(i as u32),
                expression: expr,
            });
        }

        // 3. Steunpuntgebied tussen overspanning i en i+1.
        if i + 1 < n {
            let l_links = line.spans_mm[i];
            let l_rechts = line.spans_mm[i + 1];
            let links_uitkraging = line.is_cantilever(i);
            let rechts_uitkraging = line.is_cantilever(i + 1);

            let start = if links_uitkraging {
                x0[i]
            } else {
                x0[i + 1] - INSET * l_links
            };
            let eind = if rechts_uitkraging {
                x0[i + 2]
            } else {
                x0[i + 1] + INSET * l_rechts
            };
            let l0 = eind - start;

            let (case, expr) = if links_uitkraging {
                (
                    L0Case::Cantilever,
                    format!(
                        "l0 = l{} + 0,15·l{} = {} + 0,15·{} = {} mm",
                        i + 1,
                        i + 2,
                        fmt_mm(l_links),
                        fmt_mm(l_rechts),
                        fmt_mm(l0)
                    ),
                )
            } else if rechts_uitkraging {
                (
                    L0Case::Cantilever,
                    format!(
                        "l0 = 0,15·l{} + l{} = 0,15·{} + {} = {} mm",
                        i + 1,
                        i + 2,
                        fmt_mm(l_links),
                        fmt_mm(l_rechts),
                        fmt_mm(l0)
                    ),
                )
            } else {
                (
                    L0Case::InteriorSupport,
                    format!(
                        "l0 = 0,15·(l{} + l{}) = 0,15·({} + {}) = {} mm",
                        i + 1,
                        i + 2,
                        fmt_mm(l_links),
                        fmt_mm(l_rechts),
                        fmt_mm(l0)
                    ),
                )
            };
            zones.push(L0Zone {
                x_start_mm: start,
                x_end_mm: eind,
                l0_mm: l0,
                case,
                span_index: None,
                expression: expr,
            });
        }
    }

    // 4. Momentvast buitenuiteinde aan het eind.
    if line.end == LineEnd::Restrained {
        let ln = line.spans_mm[n - 1];
        let lengte = INSET * ln;
        let totaal = acc;
        zones.push(L0Zone {
            x_start_mm: totaal - lengte,
            x_end_mm: totaal,
            l0_mm: lengte,
            case: L0Case::RestrainedEnd,
            span_index: Some((n - 1) as u32),
            expression: format!(
                "l0 = 0,15·l{} = 0,15·{} = {} mm",
                n,
                fmt_mm(ln),
                fmt_mm(lengte)
            ),
        });
    }

    zones.sort_by(|a, b| a.x_start_mm.partial_cmp(&b.x_start_mm).unwrap());
    Ok(zones)
}

/// De geldigheidsvoorwaarden van 5.3.2.1 plus de eisen aan de invoer.
fn validate_line(line: &BeamLine) -> Result<(), BeffError> {
    let n = line.spans_mm.len();
    if n == 0 {
        return Err(BeffError::NoSpans);
    }
    for (i, &l) in line.spans_mm.iter().enumerate() {
        if !(l > 0.0) || !l.is_finite() {
            return Err(BeffError::NonPositiveSpan {
                index: i as u32,
                value_mm: l,
            });
        }
    }
    if line.start == LineEnd::Free && line.end == LineEnd::Free {
        return Err(BeffError::BothEndsFree);
    }
    // Een uitkraging heeft in figuur 5.2 altijd een aangrenzende overspanning
    // nodig; zonder die overspanning is er geen l0.
    if n == 1 && (line.start == LineEnd::Free || line.end == LineEnd::Free) {
        return Err(BeffError::CantileverWithoutAdjacentSpan);
    }

    // OPMERKING bij figuur 5.2, eerste voorwaarde: de uitkraging kleiner dan de
    // helft van de aangrenzende overspanning.
    if line.start == LineEnd::Free {
        let uitkraging = line.spans_mm[0];
        let naast = line.spans_mm[1];
        if uitkraging > CANTILEVER_MAX_RATIO * naast * (1.0 + RATIO_TOL) {
            return Err(BeffError::CantileverTooLong {
                index: 0,
                cantilever_mm: uitkraging,
                adjacent_mm: naast,
            });
        }
    }
    if line.end == LineEnd::Free {
        let uitkraging = line.spans_mm[n - 1];
        let naast = line.spans_mm[n - 2];
        if uitkraging > CANTILEVER_MAX_RATIO * naast * (1.0 + RATIO_TOL) {
            return Err(BeffError::CantileverTooLong {
                index: (n - 1) as u32,
                cantilever_mm: uitkraging,
                adjacent_mm: naast,
            });
        }
    }

    // Tweede voorwaarde: de verhouding van AANGRENZENDE OVERSPANNINGEN tussen
    // 2/3 en 1,5. Een uitkraging telt hier niet mee — daarvoor geldt de eerste
    // voorwaarde, en de OPMERKING noemt de twee eisen naast elkaar.
    for i in 0..n.saturating_sub(1) {
        if line.is_cantilever(i) || line.is_cantilever(i + 1) {
            continue;
        }
        let a = line.spans_mm[i];
        let b = line.spans_mm[i + 1];
        let ratio = a / b;
        if ratio < SPAN_RATIO_MIN * (1.0 - RATIO_TOL)
            || ratio > SPAN_RATIO_MAX * (1.0 + RATIO_TOL)
        {
            return Err(BeffError::SpanRatioOutOfRange {
                first_index: i as u32,
                first_mm: a,
                second_mm: b,
                ratio,
            });
        }
    }

    Ok(())
}

// ───────────────────────────────────────────────────────────────────────────
// De hele verdeling
// ───────────────────────────────────────────────────────────────────────────

/// De meewerkende flensbreedte over de hele liggerlijn: figuur 5.2 voor l₀ per
/// gebied, (5.7)/(5.7a)/(5.7b) voor b_eff in elk gebied.
pub fn beff_distribution(
    line: &BeamLine,
    flange: &FlangeGeometry,
) -> Result<BeffDistribution, BeffError> {
    validate_flange(flange)?;
    let zones = l0_zones(line)?;

    let mut uit = Vec::with_capacity(zones.len());
    for zone in zones {
        let bij = effective_flange_width(flange, zone.l0_mm)?;
        uit.push(BeffZone {
            zone,
            b_eff_mm: bij.b_eff_mm,
            b_mm: bij.b_mm,
            parts: bij.parts,
            limited_by_b: bij.limited_by_b,
        });
    }

    let mut notes = Vec::new();
    if flange.b_i_mm.is_empty() {
        notes.push(
            "Geen uitkragende flensdelen opgegeven: de doorsnede is rechthoekig en \
             b_eff = b_w in elk gebied. 5.3.2.1 gaat over T- en L-liggers."
                .to_string(),
        );
    }
    if line.start == LineEnd::Restrained || line.end == LineEnd::Restrained {
        notes.push(
            "Een momentvast buitenuiteinde (inklemming of raamwerkknoop) staat niet in \
             figuur 5.2; die tekent alleen vrij opgelegde buitensteunpunten. Zo'n \
             uiteinde is hier gelezen als een tussensteunpunt met één aangrenzende \
             overspanning: het veldgebied begint er 0,15·l naar binnen (een eindveld \
             wordt daarmee 0,7·l in plaats van 0,85·l) en het steunpuntgebied is \
             0,15·l lang. Beide zijn kleiner dan de vrij-opgelegde lezing, en een \
             kleinere b_eff is aan de veilige kant — minder drukflens bij de sterkte, \
             en een lagere I dus meer doorbuiging en meer tweede-orde-effect."
                .to_string(),
        );
    }
    if uit.iter().any(|z| z.zone.case == L0Case::SingleSpan) {
        notes.push(
            "Een enkele, aan beide zijden vrij opgelegde overspanning staat niet in \
             figuur 5.2. l0 = l volgt daar rechtstreeks uit 5.3.2.1(2): de \
             momentnulpunten liggen in de steunpunten zelf."
                .to_string(),
        );
    }
    notes.push(
        "b_eff verschilt per gebied (figuur 5.2). Boven een steunpunt is hij kleiner dan \
         in het veld; met de veldwaarde boven het steunpunt wordt de doorsnede te stijf \
         gerekend en dat is de onveilige kant. 5.3.2.1(4) staat één constante breedte \
         per overspanning toe, gelijk aan de velddoorsnede — dat is een vereenvoudiging \
         'waarin geen grote nauwkeurigheid is vereist', geen gelijkwaardig alternatief."
            .to_string(),
    );

    Ok(BeffDistribution {
        zones: uit,
        total_length_mm: line.total_length_mm(),
        notes,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// Het verzoek voor de drie wegen
// ───────────────────────────────────────────────────────────────────────────

/// Eén verzoek om de meewerkende flensbreedte, zoals het over het
/// Tauri-command, de toetsbrug en de MCP-server gaat.
///
/// `deny_unknown_fields`: een tikfout in `b_i_mm` zou anders een lege lijst
/// opleveren en dus b_eff = b_w, stilzwijgend en aan de andere kant van de
/// werkelijkheid.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct EffectiveFlangeWidthRequest {
    /// Vrij te kiezen nummer; komt onveranderd terug. 0 als het niet om een
    /// staaf uit een model gaat.
    #[serde(default)]
    pub beam_id: u32,
    /// De doorgaande liggerlijn waar de staaf deel van is.
    pub line: BeamLine,
    /// De flensmaten van figuur 5.3.
    pub flange: FlangeGeometry,
    /// De plaats langs de liggerlijn (mm vanaf `line.start`) waarvoor de
    /// afleiding wordt uitgeschreven — meestal het midden van de staaf die de
    /// b_eff gaat gebruiken.
    ///
    /// Blijft dit veld weg, dan komt alleen de verdeling terug en is
    /// [`EffectiveFlangeWidthResponse::applied`] leeg. Dat is geen gebrek maar
    /// de eerlijke uitkomst: zonder plaats is er geen gebied, en zonder gebied
    /// is er geen afleiding om op te schrijven.
    ///
    /// Waarom de plaats in het VERZOEK zit en niet een keten per gebied in het
    /// antwoord: één keten per gebied maakt het antwoord voor élke aanroeper
    /// groter, en "welk gebied geldt hier" is precies de vraag die 5.3.2.1(4)
    /// stelt. Zo staat die vraag in het verzoek en het antwoord erop in het
    /// antwoord.
    #[serde(default)]
    pub x_mm: Option<f64>,
}

/// Het gebied dat werkelijk is aangehouden, met de afleiding uitgeschreven.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct BeffApplied {
    /// Index in [`BeffDistribution::zones`] van het gebied waarin `x_mm` valt.
    pub zone_index: u32,
    /// De plaats die is aangehouden, mm vanaf het lijnbegin — onveranderd
    /// terug, zodat het rapport hem kan noemen.
    pub x_mm: f64,
    /// De meewerkende flensbreedte van dat gebied, mm.
    pub b_eff_mm: f64,
    /// De afleiding, stap voor stap. Zie [`crate::beff_deelstappen`].
    pub deelstappen: Vec<Deelstap>,
}

/// Het antwoord: het staafnummer terug plus de verdeling.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct EffectiveFlangeWidthResponse {
    pub beam_id: u32,
    pub distribution: BeffDistribution,
    /// Het aangehouden gebied met de uitgeschreven afleiding, of `None` als het
    /// verzoek geen `x_mm` droeg.
    pub applied: Option<BeffApplied>,
}

/// De rekengang achter alle drie de wegen. Eén implementatie, drie aanroepers.
pub fn effective_flange_width_request(
    req: EffectiveFlangeWidthRequest,
) -> Result<EffectiveFlangeWidthResponse, String> {
    let distribution =
        beff_distribution(&req.line, &req.flange).map_err(|e| e.to_string())?;
    // Het gebied wordt met dezelfde regel gezocht als `zone_at_mm`: op een
    // gebiedsgrens wint het linker gebied. Een plaats buiten de lijn levert
    // geen afleiding — dan hoort de staaf niet bij deze liggerlijn, en een
    // keten over een willekeurig gebied zou een verkeerd verhaal vertellen.
    let applied = req.x_mm.and_then(|x| {
        let zone_index = zone_index_at_mm(&distribution, x)?;
        Some(BeffApplied {
            zone_index: zone_index as u32,
            x_mm: x,
            b_eff_mm: distribution.zones[zone_index].b_eff_mm,
            deelstappen: crate::beff_deelstappen::beff_deelstappen(
                &req.line,
                &req.flange,
                &distribution,
                zone_index,
            ),
        })
    });
    Ok(EffectiveFlangeWidthResponse {
        beam_id: req.beam_id,
        distribution,
        applied,
    })
}

/// De index van het gebied waarin `x_mm` valt — dezelfde keuze als
/// [`BeffDistribution::zone_at_mm`], maar met het volgnummer erbij zodat het
/// antwoord ernaar kan verwijzen.
fn zone_index_at_mm(verdeling: &BeffDistribution, x_mm: f64) -> Option<usize> {
    if verdeling.zones.is_empty() {
        return None;
    }
    let eps = 1e-9 * verdeling.total_length_mm.max(1.0);
    if x_mm < -eps || x_mm > verdeling.total_length_mm + eps {
        return None;
    }
    for (i, z) in verdeling.zones.iter().enumerate() {
        if x_mm <= z.zone.x_end_mm + eps || i + 1 == verdeling.zones.len() {
            return Some(i);
        }
    }
    Some(verdeling.zones.len() - 1)
}

// ───────────────────────────────────────────────────────────────────────────

/// Getal in mm voor een rapporttekst: geheel als het geheel is, anders één
/// decimaal, met de Nederlandse komma.
fn fmt_mm(v: f64) -> String {
    if (v - v.round()).abs() < 5e-4 {
        format!("{}", v.round() as i64)
    } else {
        format!("{v:.1}").replace('.', ",")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t_ligger() -> FlangeGeometry {
        FlangeGeometry {
            b_w_mm: 300.0,
            b_i_mm: vec![1000.0, 1000.0],
        }
    }

    /// Figuur 5.2 letterlijk: l₁ = 6000 (eindveld), l₂ = 5000 (binnenveld),
    /// l₃ = 2000 (uitkraging), links vrij opgelegd, rechts vrij.
    fn figuur_5_2() -> BeamLine {
        BeamLine {
            spans_mm: vec![6000.0, 5000.0, 2000.0],
            start: LineEnd::Support,
            end: LineEnd::Free,
        }
    }

    #[test]
    fn figuur_5_2_levert_de_vier_gevallen_op_volgorde() {
        let z = l0_zones(&figuur_5_2()).unwrap();
        assert_eq!(z.len(), 4);
        assert_eq!(z[0].case, L0Case::EndSpan);
        assert_eq!(z[1].case, L0Case::InteriorSupport);
        assert_eq!(z[2].case, L0Case::InteriorSpan);
        assert_eq!(z[3].case, L0Case::Cantilever);

        // Met de hand uit figuur 5.2:
        //   0,85·6000                = 5100
        //   0,15·(6000 + 5000)       = 1650
        //   0,7·5000                 = 3500
        //   0,15·5000 + 2000         = 2750
        assert!((z[0].l0_mm - 5100.0).abs() < 1e-9);
        assert!((z[1].l0_mm - 1650.0).abs() < 1e-9);
        assert!((z[2].l0_mm - 3500.0).abs() < 1e-9);
        assert!((z[3].l0_mm - 2750.0).abs() < 1e-9);
    }

    #[test]
    fn de_gebieden_sluiten_aan_en_beslaan_de_hele_lijn() {
        let lijn = figuur_5_2();
        let z = l0_zones(&lijn).unwrap();
        assert!((z[0].x_start_mm - 0.0).abs() < 1e-9);
        for p in z.windows(2) {
            assert!(
                (p[0].x_end_mm - p[1].x_start_mm).abs() < 1e-9,
                "gat of overlap tussen {:?} en {:?}",
                p[0].case,
                p[1].case
            );
        }
        assert!((z.last().unwrap().x_end_mm - lijn.total_length_mm()).abs() < 1e-9);
        // De lengte van elk gebied is zijn eigen l0 — dat is wat figuur 5.2
        // tekent.
        for g in &z {
            assert!((g.x_end_mm - g.x_start_mm - g.l0_mm).abs() < 1e-9);
        }
    }

    /// (5.7a) met de hand: b_i = 1000, l₀ = 5100.
    ///   0,2·1000 + 0,1·5100 = 200 + 510 = 710
    ///   0,2·5100 = 1020  → niet maatgevend
    ///   b_i = 1000       → niet maatgevend
    ///   b_eff = 2·710 + 300 = 1720; b = 2300 → geen begrenzing
    #[test]
    fn beff_bij_l0_5100_handberekend() {
        let r = effective_flange_width(&t_ligger(), 5100.0).unwrap();
        assert!((r.parts[0].b_eff_i_mm - 710.0).abs() < 1e-9);
        assert_eq!(r.parts[0].governing, BeffBound::Formula);
        assert!((r.b_eff_mm - 1720.0).abs() < 1e-9);
        assert!(!r.limited_by_b);
    }

    /// Bij een klein l₀ wint 0,2·l₀. l₀ = 1650:
    ///   0,2·1000 + 0,1·1650 = 365;  0,2·1650 = 330 → 330 wint
    ///   b_eff = 2·330 + 300 = 960
    #[test]
    fn boven_het_steunpunt_wint_de_bovengrens_0_2_l0() {
        let r = effective_flange_width(&t_ligger(), 1650.0).unwrap();
        assert_eq!(r.parts[0].governing, BeffBound::CapL0);
        assert!((r.parts[0].b_eff_i_mm - 330.0).abs() < 1e-9);
        assert!((r.b_eff_mm - 960.0).abs() < 1e-9);
    }

    /// (5.7b) wint bij een smal flensdeel: b_i = 150, l₀ = 5100.
    ///   0,2·150 + 0,1·5100 = 540;  0,2·5100 = 1020;  b_i = 150 → 150 wint
    #[test]
    fn een_smal_flensdeel_wordt_door_5_7b_begrensd() {
        let smal = FlangeGeometry {
            b_w_mm: 300.0,
            b_i_mm: vec![150.0],
        };
        let r = effective_flange_width(&smal, 5100.0).unwrap();
        assert_eq!(r.parts[0].governing, BeffBound::CapBi);
        assert!((r.parts[0].b_eff_i_mm - 150.0).abs() < 1e-9);
        assert!((r.b_eff_mm - 450.0).abs() < 1e-9);
        assert!(
            !r.limited_by_b,
            "met (5.7b) kan de grens b nooit meer ingrijpen"
        );
    }

    #[test]
    fn een_te_lange_uitkraging_wordt_geweigerd() {
        let lijn = BeamLine {
            spans_mm: vec![6000.0, 5000.0, 2600.0],
            start: LineEnd::Support,
            end: LineEnd::Free,
        };
        match l0_zones(&lijn) {
            Err(BeffError::CantileverTooLong { .. }) => {}
            anders => panic!("verwacht CantileverTooLong, kreeg {anders:?}"),
        }
    }

    #[test]
    fn een_uitkraging_van_precies_de_helft_wordt_nog_aanvaard() {
        let lijn = BeamLine {
            spans_mm: vec![6000.0, 5000.0, 2500.0],
            start: LineEnd::Support,
            end: LineEnd::Free,
        };
        assert!(l0_zones(&lijn).is_ok());
    }

    #[test]
    fn een_scheve_overspanningsverhouding_wordt_geweigerd() {
        let lijn = BeamLine {
            spans_mm: vec![8000.0, 4000.0],
            start: LineEnd::Support,
            end: LineEnd::Support,
        };
        match l0_zones(&lijn) {
            Err(BeffError::SpanRatioOutOfRange { ratio, .. }) => {
                assert!((ratio - 2.0).abs() < 1e-12);
            }
            anders => panic!("verwacht SpanRatioOutOfRange, kreeg {anders:?}"),
        }
    }

    #[test]
    fn een_losstaande_uitkraging_wordt_geweigerd() {
        let lijn = BeamLine {
            spans_mm: vec![2000.0],
            start: LineEnd::Restrained,
            end: LineEnd::Free,
        };
        assert_eq!(
            l0_zones(&lijn).unwrap_err(),
            BeffError::CantileverWithoutAdjacentSpan
        );
    }

    #[test]
    fn constante_breedte_van_5_3_2_1_4_is_de_veldwaarde() {
        let v = beff_distribution(&figuur_5_2(), &t_ligger()).unwrap();
        // Veldgebied van l1: l0 = 5100 → b_eff = 1720 (zie handberekening
        // hierboven).
        assert!((v.constant_for_span(0).unwrap() - 1720.0).abs() < 1e-9);
        // De uitkraging heeft geen veldgebied.
        assert_eq!(v.constant_for_span(2), None);
    }

    #[test]
    fn zone_at_geeft_het_gebied_waarin_x_valt() {
        let v = beff_distribution(&figuur_5_2(), &t_ligger()).unwrap();
        assert_eq!(v.zone_at_mm(0.0).unwrap().zone.case, L0Case::EndSpan);
        assert_eq!(
            v.zone_at_mm(6000.0).unwrap().zone.case,
            L0Case::InteriorSupport
        );
        assert_eq!(
            v.zone_at_mm(13000.0).unwrap().zone.case,
            L0Case::Cantilever
        );
        assert!(v.zone_at_mm(-1.0).is_none());
        assert!(v.zone_at_mm(20000.0).is_none());
    }
}
