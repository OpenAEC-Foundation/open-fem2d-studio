//! Betondoorsnede en wapeningskorf.
//!
//! # De doorsnede: een etiket en een paar banden
//!
//! De doorsnede kent drie vormen — rechthoek, T en L — maar de rekengang
//! kijkt niet naar de vorm. Zij kijkt naar de **banden**: een kleine, vaste
//! reeks horizontale stroken met elk een breedte en een hoogtebereik. Twee
//! banden volstaan voor alle drie de vormen, en daardoor blijft
//! [`ConcreteSection`] `Copy` — geen `Vec` die zich door elke signatuur van
//! [`crate::mnkappa`], [`crate::bending`] en [`crate::stiffness`] heen vreet.
//!
//! De ontwerpregel: **vertak op de meetkunde waar een getal uitkomt, vertak
//! op het etiket waar een zin uitkomt.** Het etiket ([`ConcreteShape`]) reist
//! mee voor het rapport en de meldingen; b(z) van een T en van een L zijn in
//! dit uniaxiale model identiek, dus vertakken op de vorm in elke rekenstap
//! zou twee takken opleveren die hetzelfde doen.
//!
//! ```text
//!   rechthoek            T                     L
//!   ┌─────────┐     ┌─────────────┐      ┌─────────────┐   z = h
//!   │         │     └──┐       ┌──┘      └──────────┐  │
//!   │    b    │        │  b_w  │                    │  │
//!   │         │        │       │                    │  │
//!   └─────────┘        └───────┘                    └──┘   z = 0
//!   1 band          2 banden              2 banden — dezelfde b(z)
//! ```
//!
//! **De L wordt aangeboden mét zijn aanname erbij.** Zie
//! [`ConcreteSection::assumptions`]: in dit model levert een L exact dezelfde
//! getallen als een T met dezelfde banden, omdat de doorsnedetoestand één rek
//! en één kromming draagt en een wapeningslaag geen y-coördinaat heeft. Die
//! aanname reist als tekst mee, zodat elk resultaat en het rapport hem kunnen
//! afdrukken; stilzwijgend een L aanbieden zou misleidend zijn.
//!
//! **De flens/lijf-splitsing is een modelkeuze, geen normvoorschrift.** Er is
//! in NEN-EN 1992-1-1 geen grenswaarde λ·x ≤ h_f en geen tweetermsformule.
//! 3.1.7(3) geeft de rechthoekige spanningsverdeling zelf (λ, η bij ε_cu3);
//! de splitsing volgt uitsluitend uit het toepassen daarvan op de werkelijke
//! meetkunde. De enige plaats waar de norm de T- en de L-ligger als zodanig
//! noemt, is 5.3.2.1(3) met vergelijking (5.7) — de **meewerkende**
//! flensbreedte b_eff. Die bepaalt deze crate niet; de opgegeven flensbreedte
//! wordt verondersteld al b_eff te zijn.
//!
//! # De korf
//!
//! De korf is beschreven zoals een constructeur hem opgeeft: dekking,
//! beugeldiameter, en per zijde het aantal en de diameter van de
//! hoofdwapening. Daaruit volgt de ligging van de staafassen:
//!
//! ```text
//!   afstand staafas tot betonrand = c_nom + Ø_beugel + Ø_hoofd / 2
//! ```
//!
//! Alle maten in mm. De lengteas `z` loopt van de onderrand (z = 0) naar de
//! bovenrand (z = h).
//!
//! # De dwarskrachtwapening in de korf
//!
//! De beugeldiameter alleen zegt waar de hoofdwapening ligt, maar zegt niets
//! over de weerstand: §9.2.2(5) rekent met A_sw **binnen de lengte s**, en
//! (6.8) met A_sw/s. Daarvoor zijn drie dingen nodig die uit een diameter niet
//! zijn af te leiden — de hart-op-hartafstand s, het aantal benen n dat één
//! verticale doorsnede kruist, en (voor §9.2.2(8)) de hart-op-hartafstand s_t
//! van die benen in dwarsrichting.
//!
//! **Ze zijn alle drie `Option`, en `None` betekent niet-opgegeven.** Niet nul,
//! en niet een stilzwijgend aangenomen waarde. De norm geeft voor geen van
//! drieën een aanbevolen waarde — §9.2.2(6) en (8) geven alleen bovengrenzen —
//! dus elke ingevulde standaardwaarde zou een ontwerpbeslissing zijn die de
//! app voor de constructeur neemt. Een toets die deze gegevens mist hoort te
//! zeggen dat hij niet kan; zie [`ReinforcementCage::shear_reinforcement`],
//! die daarvoor een leesbare reden teruggeeft in plaats van een getal.
//!
//! Bestaande projectbestanden blijven daardoor laden: de velden staan op
//! `#[serde(default)]` en komen als `None` binnen.
//!
//! **De hoek α is vastgelegd op 90°** — rechte beugels. Zie
//! [`STIRRUP_ALPHA_DEG`] voor de afweging.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// De vorm van de doorsnede — het **etiket**, voor het rapport en de
/// meldingen. De rekengang vertakt hier niet op; die kijkt naar
/// [`ConcreteSection::bands`].
///
/// Dit etiket is óók het eerste veld van [`ConcreteSectionInput`] en reist
/// daarmee over alle drie de wegen mee; vandaar de ts-export.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum ConcreteShape {
    /// Rechthoek b × h.
    #[default]
    Rectangle,
    /// T-vorm: flens over de volle breedte aan één zijde, lijf in het midden.
    Tee,
    /// L-vorm: flens aan één kant van het lijf. In dit uniaxiale model
    /// gelijk aan de T met dezelfde banden — zie
    /// [`ConcreteSection::assumptions`].
    Ell,
}

impl ConcreteShape {
    /// Woordelijke aanduiding voor het rapport.
    pub fn label(&self) -> &'static str {
        match self {
            ConcreteShape::Rectangle => "rechthoek",
            ConcreteShape::Tee => "T-vorm",
            ConcreteShape::Ell => "L-vorm",
        }
    }

    /// Heeft deze vorm een flens, en dus meer dan één band?
    pub fn has_flange(&self) -> bool {
        matches!(self, ConcreteShape::Tee | ConcreteShape::Ell)
    }
}

/// Eén horizontale band van de doorsnede: een breedte over een hoogtebereik.
///
/// `z0_mm` en `z1_mm` zijn gemeten vanaf de onderrand (z = 0), met
/// z0 < z1. De banden van een doorsnede sluiten op elkaar aan en beslaan
/// samen precies [0, h].
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Band {
    pub z0_mm: f64,
    pub z1_mm: f64,
    pub b_mm: f64,
}

impl Band {
    pub fn height_mm(&self) -> f64 {
        self.z1_mm - self.z0_mm
    }

    pub fn area_mm2(&self) -> f64 {
        self.b_mm * self.height_mm()
    }
}

const LEGE_BAND: Band = Band { z0_mm: 0.0, z1_mm: 0.0, b_mm: 0.0 };

/// Betondoorsnede: rechthoek, T of L.
///
/// `b_mm` is de **grootste** breedte (bij een T en een L dus de
/// flensbreedte) en `h_mm` de totale hoogte; die twee velden zijn er altijd
/// geweest en blijven het buitenaanzicht. De rekengang gebruikt
/// [`Self::bands`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ConcreteSection {
    /// Het etiket. Draagt geen rekenwaarde — zie de moduledoc.
    pub shape: ConcreteShape,
    /// Grootste breedte: b bij een rechthoek, de flensbreedte bij T en L, mm.
    pub b_mm: f64,
    /// Totale hoogte, mm.
    pub h_mm: f64,
    bands: [Band; 2],
    n_bands: u8,
}

/// De naam waaronder de rechthoekige doorsnede door de hele werkruimte heen
/// bekend is. [`ConcreteSection::new`] is onveranderd `new(b, h)` en levert
/// nog steeds een rechthoek, dus elke bestaande aanroep blijft precies doen
/// wat hij deed.
pub type RectConcreteSection = ConcreteSection;

impl ConcreteSection {
    /// Rechthoekige doorsnede b × h — de constructor die er altijd al was.
    pub fn new(b_mm: f64, h_mm: f64) -> Self {
        Self {
            shape: ConcreteShape::Rectangle,
            b_mm,
            h_mm,
            bands: [Band { z0_mm: 0.0, z1_mm: h_mm, b_mm }, LEGE_BAND],
            n_bands: 1,
        }
    }

    /// Hetzelfde als [`Self::new`], met de vorm in de naam.
    pub fn rectangle(b_mm: f64, h_mm: f64) -> Self {
        Self::new(b_mm, h_mm)
    }

    /// T-vorm: een flens van `h_f_mm` dik en `b_f_mm` breed aan de BOVENZIJDE,
    /// met daaronder een lijf van `b_w_mm` breed; totale hoogte `h_mm`.
    ///
    /// `b_f_mm` wordt verondersteld de meewerkende flensbreedte b_eff van
    /// 5.3.2.1(3) te zijn; die bepaalt deze crate niet.
    pub fn tee(b_f_mm: f64, h_f_mm: f64, b_w_mm: f64, h_mm: f64) -> Result<Self, String> {
        Self::flanged(ConcreteShape::Tee, b_f_mm, h_f_mm, b_w_mm, h_mm)
    }

    /// L-vorm met dezelfde maten als [`Self::tee`]. Dezelfde banden, dus
    /// dezelfde getallen; het verschil zit in het etiket en in de aanname die
    /// [`Self::assumptions`] meelevert.
    pub fn ell(b_f_mm: f64, h_f_mm: f64, b_w_mm: f64, h_mm: f64) -> Result<Self, String> {
        Self::flanged(ConcreteShape::Ell, b_f_mm, h_f_mm, b_w_mm, h_mm)
    }

    fn flanged(
        shape: ConcreteShape,
        b_f_mm: f64,
        h_f_mm: f64,
        b_w_mm: f64,
        h_mm: f64,
    ) -> Result<Self, String> {
        if !(b_f_mm > 0.0 && h_f_mm > 0.0 && b_w_mm > 0.0 && h_mm > 0.0) {
            return Err(format!(
                "{}: alle maten moeten positief zijn (b_f = {b_f_mm}, h_f = {h_f_mm}, b_w = {b_w_mm}, h = {h_mm} mm)",
                shape.label()
            ));
        }
        if h_f_mm >= h_mm {
            return Err(format!(
                "{}: de flensdikte h_f = {h_f_mm} mm laat geen lijf over binnen h = {h_mm} mm",
                shape.label()
            ));
        }
        Ok(Self {
            shape,
            b_mm: b_f_mm.max(b_w_mm),
            h_mm,
            bands: [
                Band { z0_mm: 0.0, z1_mm: h_mm - h_f_mm, b_mm: b_w_mm },
                Band { z0_mm: h_mm - h_f_mm, z1_mm: h_mm, b_mm: b_f_mm },
            ],
            n_bands: 2,
        })
    }

    /// De banden, van onder (z = 0) naar boven (z = h).
    pub fn bands(&self) -> &[Band] {
        &self.bands[..self.n_bands as usize]
    }

    /// Lijfbreedte: de kleinste breedte in de doorsnede. Bij een rechthoek
    /// gelijk aan `b_mm`.
    pub fn b_w_mm(&self) -> f64 {
        self.bands().iter().map(|b| b.b_mm).fold(f64::INFINITY, f64::min)
    }

    /// Flensdikte: de hoogte van de band met de grootste breedte. 0 bij een
    /// rechthoek — daar is geen flens.
    pub fn h_f_mm(&self) -> f64 {
        if self.n_bands < 2 {
            return 0.0;
        }
        let b_max = self.b_mm;
        self.bands()
            .iter()
            .filter(|b| b.b_mm >= b_max)
            .map(|b| b.height_mm())
            .fold(0.0, f64::max)
    }

    /// Ligt de flens aan de bovenzijde? Na spiegelen ligt hij onder.
    pub fn flange_on_top(&self) -> bool {
        match self.bands() {
            [_, boven] => boven.b_mm >= self.b_mm,
            _ => false,
        }
    }

    /// Betonoppervlak A_c, mm².
    ///
    /// Bij één band letterlijk b·h: dezelfde uitdrukking als vóór de
    /// veralgemening, dus de rechthoek verschuift geen bit.
    pub fn area_mm2(&self) -> f64 {
        match self.bands() {
            [enige] => enige.b_mm * enige.height_mm(),
            banden => banden.iter().map(|b| b.area_mm2()).sum(),
        }
    }

    /// De breedte die op hoogte `z_mm` werkelijk aanwezig is, mm.
    ///
    /// Op een bandgrens de kleinste van de twee: een staaf die precies op de
    /// overgang ligt, moet in het smalste deel passen. Buiten de doorsnede 0.
    pub fn width_at_mm(&self, z_mm: f64) -> f64 {
        let mut w = f64::INFINITY;
        for b in self.bands() {
            if z_mm >= b.z0_mm && z_mm <= b.z1_mm {
                w = w.min(b.b_mm);
            }
        }
        if w.is_finite() {
            w
        } else {
            0.0
        }
    }

    /// De breedte van de bovenste `t_mm` van de doorsnede, als die over die
    /// hele hoogte **ononderbroken één breedte** is.
    ///
    /// `Some(b)` bij een rechthoek altijd, en bij een T of L zolang het
    /// spanningsblok binnen de bovenste band blijft (λ·x ≤ h_f bij een flens
    /// boven). Dan is de gesloten vorm van 3.1.7(3) exact goed met díé
    /// breedte — de klassieke "gedraagt zich als een rechthoek". `None` zodra
    /// het blok over een bandgrens heen loopt; dan moet er over de banden
    /// worden geïntegreerd.
    pub fn uniform_top_width(&self, t_mm: f64) -> Option<f64> {
        let boven = self.bands().last()?;
        if self.h_mm - t_mm >= boven.z0_mm {
            Some(boven.b_mm)
        } else {
            None
        }
    }

    /// Oppervlak (mm²) en statisch moment om de BOVENRAND (mm³) van de
    /// bovenste `t_mm` van de doorsnede.
    ///
    /// Het statisch moment is ∫ (h − z)·b(z) dz over die strook, dus positief
    /// naar beneden gemeten; de diepte van het zwaartepunt onder de bovenrand
    /// is S/A.
    pub fn top_strip(&self, t_mm: f64) -> (f64, f64) {
        let onder = (self.h_mm - t_mm).max(0.0);
        let mut a = 0.0;
        let mut s = 0.0;
        for band in self.bands() {
            let lo = band.z0_mm.max(onder);
            let hi = band.z1_mm.min(self.h_mm);
            if hi <= lo {
                continue;
            }
            let opp = band.b_mm * (hi - lo);
            a += opp;
            s += opp * (self.h_mm - 0.5 * (lo + hi));
        }
        (a, s)
    }

    /// Hoogte van het betonzwaartepunt boven de onderrand, mm.
    ///
    /// Bij een rechthoek h/2; bij een T ligt het naar de flens toe, en dáárom
    /// heeft een T twee verschillende weerstandsmomenten.
    pub fn centroid_z_mm(&self) -> f64 {
        match self.bands() {
            [enige] => 0.5 * (enige.z0_mm + enige.z1_mm),
            banden => {
                let a: f64 = banden.iter().map(|b| b.area_mm2()).sum();
                if a <= 0.0 {
                    return 0.5 * self.h_mm;
                }
                let s: f64 =
                    banden.iter().map(|b| b.area_mm2() * 0.5 * (b.z0_mm + b.z1_mm)).sum();
                s / a
            }
        }
    }

    /// Traagheidsmoment van de bruto betondoorsnede om het eigen
    /// zwaartepunt, mm⁴. Bij één band de gesloten vorm b·h³/12.
    pub fn i_centroid_mm4(&self) -> f64 {
        match self.bands() {
            [enige] => enige.b_mm * enige.height_mm().powi(3) / 12.0,
            banden => {
                let z_g = self.centroid_z_mm();
                banden
                    .iter()
                    .map(|b| {
                        let hb = b.height_mm();
                        let d = 0.5 * (b.z0_mm + b.z1_mm) - z_g;
                        b.b_mm * hb * hb * hb / 12.0 + b.b_mm * hb * d * d
                    })
                    .sum()
            }
        }
    }

    /// Weerstandsmoment voor de ONDERSTE vezel: W = I / z_g, mm³.
    /// Bij één band de gesloten vorm b·h²/6.
    pub fn w_bottom_mm3(&self) -> f64 {
        match self.bands() {
            [enige] => enige.b_mm * enige.height_mm() * enige.height_mm() / 6.0,
            _ => {
                let c = self.centroid_z_mm();
                if c > 0.0 {
                    self.i_centroid_mm4() / c
                } else {
                    0.0
                }
            }
        }
    }

    /// Weerstandsmoment voor de BOVENSTE vezel: W = I / (h − z_g), mm³.
    /// Bij één band gelijk aan [`Self::w_bottom_mm3`].
    pub fn w_top_mm3(&self) -> f64 {
        match self.bands() {
            [enige] => enige.b_mm * enige.height_mm() * enige.height_mm() / 6.0,
            _ => {
                let c = self.h_mm - self.centroid_z_mm();
                if c > 0.0 {
                    self.i_centroid_mm4() / c
                } else {
                    0.0
                }
            }
        }
    }

    /// De doorsnede gespiegeld in de hoogte (z → h − z).
    ///
    /// Voor een negatief moment wordt de hele doorsnede omgeklapt en als
    /// positief doorgerekend. Bij een rechthoek verandert er dan niets, maar
    /// bij een T **hoort de flens onder**: een negatief moment drukt op het
    /// lijf en trekt aan de flens. Wie alleen de wapening spiegelt en de
    /// doorsnede laat staan, rekent de verkeerde meetkunde door.
    ///
    /// Het etiket blijft staan: een omgeklapte T is nog steeds een T.
    pub fn mirrored(&self) -> Self {
        let mut bands = [LEGE_BAND; 2];
        let n = self.n_bands as usize;
        for (i, band) in self.bands().iter().enumerate() {
            bands[n - 1 - i] = Band {
                z0_mm: self.h_mm - band.z1_mm,
                z1_mm: self.h_mm - band.z0_mm,
                b_mm: band.b_mm,
            };
        }
        Self { shape: self.shape, b_mm: self.b_mm, h_mm: self.h_mm, bands, n_bands: self.n_bands }
    }

    /// Naam zoals in het rapport: "300 x 500", of
    /// "T 400 x 450 (flens 400 x 50, lijf 200)".
    pub fn name(&self) -> String {
        match self.shape {
            ConcreteShape::Rectangle => {
                format!("{} x {}", fmt_mm(self.b_mm), fmt_mm(self.h_mm))
            }
            ConcreteShape::Tee | ConcreteShape::Ell => format!(
                "{} {} x {} (flens {} x {}{}, lijf {})",
                if self.shape == ConcreteShape::Tee { "T" } else { "L" },
                fmt_mm(self.b_mm),
                fmt_mm(self.h_mm),
                fmt_mm(self.b_mm),
                fmt_mm(self.h_f_mm()),
                // Een omgekeerde T verschilt alleen in de ligging van de
                // flens; die mag dus niet uit de naam wegvallen.
                if self.flange_on_top() { "" } else { " onder" },
                fmt_mm(self.b_w_mm())
            ),
        }
    }

    /// De aannamen die bij deze vorm horen en die in **elk** resultaat en in
    /// het rapport moeten meereizen. Leeg bij een rechthoek.
    ///
    /// Twee dingen mogen niet stilzwijgend blijven:
    ///
    /// * dat de splitsing van het spanningsblok over flens en lijf een
    ///   benoemde modelkeuze is en geen normvoorschrift — NEN-EN 1992-1-1
    ///   kent geen grenswaarde λ·x ≤ h_f en geen tweetermsformule;
    /// * dat een L in dit uniaxiale model exact een T is, omdat de
    ///   zijdelingse kromming verhinderd wordt verondersteld.
    pub fn assumptions(&self) -> Vec<String> {
        if !self.shape.has_flange() {
            return Vec::new();
        }
        let mut uit = vec![
            format!(
                "{}: de betondrukkracht is geïntegreerd over de WERKELIJKE breedte b(z) van de \
                 doorsnede — {:.0} mm over de flens, {:.0} mm over het lijf — en niet over één \
                 breedte. Dat is een benoemde MODELKEUZE en geen normvoorschrift: NEN-EN 1992-1-1 \
                 geeft in 3.1.7(3) alleen de rechthoekige spanningsverdeling zelf (λ, η bij \
                 ε_cu3), zonder grenswaarde λ·x ≤ h_f en zonder tweetermsformule. De splitsing \
                 volgt uitsluitend uit het toepassen van 3.1.7(3) op de werkelijke meetkunde. \
                 Valt de drukzone geheel in de flens, dan is de gesloten vorm met de \
                 flensbreedte exact goed.",
                self.shape.label(),
                self.b_mm,
                self.b_w_mm()
            ),
            format!(
                "De opgegeven flensbreedte van {:.0} mm wordt verondersteld de MEEWERKENDE \
                 flensbreedte b_eff te zijn — 5.3.2.1(3), vergelijking (5.7). Deze berekening \
                 bepaalt b_eff niet; zij rekent met de breedte die is opgegeven.",
                self.b_mm
            ),
        ];
        if self.shape == ConcreteShape::Ell {
            uit.push(
                "L-VORM — AANNAME. In dit uniaxiale doorsnedemodel levert een L exact dezelfde \
                 getallen als een T met dezelfde banden: de doorsnedetoestand draagt één rek en \
                 één kromming, en een wapeningslaag heeft geen y-coördinaat. De zijdelingse \
                 kromming die de eenzijdige flens werkelijk oproept, wordt dus VERHINDERD \
                 verondersteld — bijvoorbeeld door een vloerschijf. NEN-EN 1992-1-1 geeft daar \
                 geen apart artikel voor; de norm noemt de L-ligger alleen bij de meewerkende \
                 flensbreedte (5.3.2.1(3)). Is de zijdelingse kromming niet verhinderd, dan valt \
                 het geval buiten dit model en moet scheve buiging worden beschouwd."
                    .to_string(),
            );
        }
        uit
    }
}

fn fmt_mm(v: f64) -> String {
    if (v - v.round()).abs() < 1e-9 {
        format!("{}", v.round() as i64)
    } else {
        format!("{v:.1}")
    }
}

/// De doorsnede zoals de **invoer** hem beschrijft: een vorm met de maten die
/// bij die vorm horen.
///
/// Dit is het buitenaanzicht van [`ConcreteSection`] — het type dat over het
/// Tauri-command, de toetsbrug en de MCP-server gaat. Waarom een apart type en
/// niet `ConcreteSection` zelf: die draagt de **banden**, en banden zijn een
/// rekenkundige afgeleide. Wie ze als invoer zou aanbieden, kan een reeks
/// stroken opgeven die geen rechthoek, geen T en geen L is; de vormen die deze
/// crate kent zijn er dan drie in naam en oneindig veel in werkelijkheid.
///
/// # Verplichte en verboden maten
///
/// `b_w_mm` en `h_f_mm` horen bij een flens: bij `Tee` en `Ell` zijn ze
/// verplicht, bij `Rectangle` moeten ze wegblijven. Een rechthoek mét
/// flensdikte is geen tikfout die stilzwijgend genegeerd mag worden — hij
/// betekent dat de aanroeper iets anders bedoelde dan hij opschreef, en
/// negeren zou een doorsnede opleveren die niemand heeft ingevoerd. Zie
/// [`Self::build`], de enige plaats waar dit type een `ConcreteSection` wordt.
///
/// ```text
///        Rectangle              Tee / Ell            Tee met flange_at_bottom
///     ┌───── b ─────┐      ┌────── b ──────┐            ┌──┐
///     │             │      └──┐  h_f    ┌──┘            │  │
///     │             h         │         │  h            │  │  h
///     │             │         │  b_w    │               │  │
///     └─────────────┘         └─────────┘            ┌──┴──┴──┐  h_f
/// ```
///
/// `b_mm` is bij een T en een L de **flensbreedte**, en die wordt verondersteld
/// de meewerkende b_eff van 5.3.2.1(3) te zijn — zie [`crate::beff`], die hem
/// afleidt, en [`ConcreteSection::assumptions`], die de aanname als tekst
/// meelevert.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteSectionInput {
    /// De vorm. Bepaalt welke maten verplicht zijn en welke verboden.
    /// Ontbreekt hij, dan is het een rechthoek.
    #[serde(default)]
    pub shape: ConcreteShape,
    /// Grootste breedte in mm: b bij een rechthoek, de flensbreedte b_f bij
    /// een T en een L.
    pub b_mm: f64,
    /// Totale hoogte h in mm (buiging om de sterke as).
    pub h_mm: f64,
    /// Lijfbreedte b_w in mm. Verplicht bij `Tee` en `Ell`; bij `Rectangle`
    /// moet dit veld wegblijven.
    #[serde(default)]
    pub b_w_mm: Option<f64>,
    /// Flensdikte h_f in mm. Zelfde regel als `b_w_mm`.
    #[serde(default)]
    pub h_f_mm: Option<f64>,
    /// Ligt de flens aan de ONDERZIJDE — de omgekeerde T? Standaard `false`:
    /// de flens ligt boven, zoals bij een ligger onder een vloer.
    ///
    /// De banden en [`ConcreteSection::mirrored`] dragen dit geval volledig;
    /// deze vlag is de enige plaats waar het gekozen wordt. Bij `Rectangle`
    /// heeft hij geen betekenis en moet hij `false` blijven.
    #[serde(default)]
    pub flange_at_bottom: bool,
}

impl ConcreteSectionInput {
    /// Rechthoek b × h.
    pub fn rectangle(b_mm: f64, h_mm: f64) -> Self {
        Self {
            shape: ConcreteShape::Rectangle,
            b_mm,
            h_mm,
            b_w_mm: None,
            h_f_mm: None,
            flange_at_bottom: false,
        }
    }

    /// T-vorm met de flens boven.
    pub fn tee(b_f_mm: f64, h_mm: f64, b_w_mm: f64, h_f_mm: f64) -> Self {
        Self {
            shape: ConcreteShape::Tee,
            b_mm: b_f_mm,
            h_mm,
            b_w_mm: Some(b_w_mm),
            h_f_mm: Some(h_f_mm),
            flange_at_bottom: false,
        }
    }

    /// L-vorm met de flens boven.
    pub fn ell(b_f_mm: f64, h_mm: f64, b_w_mm: f64, h_f_mm: f64) -> Self {
        Self { shape: ConcreteShape::Ell, ..Self::tee(b_f_mm, h_mm, b_w_mm, h_f_mm) }
    }

    /// Woordelijke aanduiding van de INVOER, ook wanneer die geen doorsnede
    /// oplevert. Bij een geldige invoer letterlijk [`ConcreteSection::name`];
    /// bij een ongeldige staat er wat er is opgegeven, met een `?` op de
    /// plaats van de ontbrekende maat. Een foutmelding zonder de doorsnede
    /// erbij is voor de lezer niet thuis te brengen.
    pub fn name(&self) -> String {
        if let Ok(s) = self.build() {
            return s.name();
        }
        let maat = |v: Option<f64>| v.map(fmt_mm).unwrap_or_else(|| "?".to_string());
        match self.shape {
            ConcreteShape::Rectangle => format!("{} x {}", fmt_mm(self.b_mm), fmt_mm(self.h_mm)),
            ConcreteShape::Tee | ConcreteShape::Ell => format!(
                "{} {} x {} (flens {} x {}{}, lijf {})",
                if self.shape == ConcreteShape::Tee { "T" } else { "L" },
                fmt_mm(self.b_mm),
                fmt_mm(self.h_mm),
                fmt_mm(self.b_mm),
                maat(self.h_f_mm),
                if self.flange_at_bottom { " onder" } else { "" },
                maat(self.b_w_mm)
            ),
        }
    }

    /// De doorsnede waarmee gerekend wordt, of een Nederlandse reden waarom
    /// deze invoer er geen oplevert.
    ///
    /// **De enige omzetting.** Elke weg — command, toetsbrug, MCP — komt hier
    /// langs, zodat een T in alle drie dezelfde banden krijgt.
    pub fn build(&self) -> Result<ConcreteSection, String> {
        if self.shape == ConcreteShape::Rectangle {
            if self.b_w_mm.is_some() || self.h_f_mm.is_some() {
                return Err(
                    "een rechthoek heeft geen flens: laat `b_w_mm` en `h_f_mm` weg, of zet \
                     `shape` op \"Tee\" of \"Ell\""
                        .to_string(),
                );
            }
            if self.flange_at_bottom {
                return Err(
                    "`flange_at_bottom` zegt aan welke zijde de flens ligt; een rechthoek heeft \
                     geen flens"
                        .to_string(),
                );
            }
            if !(self.b_mm > 0.0 && self.h_mm > 0.0) {
                return Err(format!(
                    "rechthoek: b = {} mm en h = {} mm moeten beide positief zijn",
                    self.b_mm, self.h_mm
                ));
            }
            return Ok(ConcreteSection::new(self.b_mm, self.h_mm));
        }

        let naam = self.shape.label();
        let b_w = self.b_w_mm.ok_or_else(|| {
            format!("{naam}: `b_w_mm` ontbreekt — een flensdoorsnede heeft een lijfbreedte nodig")
        })?;
        let h_f = self.h_f_mm.ok_or_else(|| {
            format!("{naam}: `h_f_mm` ontbreekt — een flensdoorsnede heeft een flensdikte nodig")
        })?;
        if b_w >= self.b_mm {
            return Err(format!(
                "{naam}: de lijfbreedte b_w = {b_w} mm is niet kleiner dan de flensbreedte \
                 b_f = {} mm. Dan is er geen uitkragend flensdeel en is de doorsnede een \
                 rechthoek; kies `shape` = \"Rectangle\".",
                self.b_mm
            ));
        }
        let s = match self.shape {
            ConcreteShape::Tee => ConcreteSection::tee(self.b_mm, h_f, b_w, self.h_mm)?,
            ConcreteShape::Ell => ConcreteSection::ell(self.b_mm, h_f, b_w, self.h_mm)?,
            ConcreteShape::Rectangle => unreachable!("hierboven al afgehandeld"),
        };
        Ok(if self.flange_at_bottom { s.mirrored() } else { s })
    }
}

/// Eén rij hoofdwapening: aantal staven en diameter.
///
/// `Default` is de LEGE rij (0 staven, Ø 0) — geen bruikbare wapening, maar
/// wel wat [`ReinforcementCage::default`] nodig heeft om te bestaan.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct RebarRow {
    pub count: u32,
    pub diameter_mm: f64,
}

impl RebarRow {
    /// Totale staaldoorsnede van de rij in mm².
    pub fn area_mm2(&self) -> f64 {
        self.count as f64 * std::f64::consts::PI * (self.diameter_mm / 2.0).powi(2)
    }

    pub fn is_empty(&self) -> bool {
        self.count == 0 || self.diameter_mm <= 0.0
    }

    /// "3Ø16" of "—".
    pub fn label(&self) -> String {
        if self.is_empty() {
            "—".to_string()
        } else {
            format!("{}Ø{}", self.count, fmt_mm(self.diameter_mm))
        }
    }
}

/// De hoek α van de dwarskrachtwapening ten opzichte van de lengteas, in
/// graden. In dit model **vast op 90°**: rechte beugels.
///
/// §9.2.2(1) laat 45° ≤ α ≤ 90° toe. Dat is een toestemming, geen invoereis:
/// de norm noemt geen aanbevolen waarde en de nationale bijlage wijzigt het
/// artikel niet. De keuze om α niet als invoerveld op te nemen berust op drie
/// dingen.
///
/// 1. **Een leeg veld blokkeert de toets.** α is niet af te leiden uit
///    dekking, diameter of doorsnede. Een `Option<f64>` die niemand invult zou
///    de dwarskrachttoets voor iedereen laten uitvallen, of anders alsnog
///    stilzwijgend 90° invullen — precies wat we bij s en n vermijden.
/// 2. **90° is de veilige tak, niet zomaar de gemakkelijke.** In (9.4) staat
///    sin α in de noemer, dus α = 90° geeft de KLEINSTE ρ_w en daarmee de
///    scherpste toets tegen ρ_w,min. In (9.6N) staat cot α, dus α = 90° geeft
///    de KLEINSTE s_l,max. En (6.8) levert minder weerstand dan (6.13). Wie
///    werkelijk hellende beugels toepast en hier 90° rekent, rekent dus aan de
///    veilige kant.
/// 3. **Hellende dwarskrachtwapening komt zelden alleen.** Zij hangt samen met
///    opgebogen staven, en die brengen §9.2.2(4) (β₃ = 0,5) en §9.2.2(7)
///    (s_b,max) mee — een tweede wapeningsfamilie die dit model niet kent.
///
/// Deze beperking is dus geen stilzwijgende aanname maar een vastgelegde
/// modelgrens; [`ReinforcementCage::assumptions`] schrijft haar uit, zodat zij
/// in elke afleiding meeloopt.
pub const STIRRUP_ALPHA_DEG: f64 = 90.0;

/// Wapeningskorf: dekking, beugel, boven- en onderwapening.
///
/// # `Default` is een LEGE korf, geen standaardkorf
///
/// `ReinforcementCage::default()` levert dekking 0, geen beugel en geen
/// hoofdwapening. Dat is met opzet géén bruikbare korf: [`Self::validate`]
/// weigert hem met "de korf bevat geen hoofdwapening". `Default` bestaat
/// alleen zodat code die de beugelvelden niet invult
/// `..ReinforcementCage::default()` kan schrijven; er is nergens in de norm
/// een standaardkorf, en die zou hier ook niet mogen ontstaan.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ReinforcementCage {
    /// Nominale betondekking c_nom op de beugel, in mm (§4.4.1).
    pub cover_mm: f64,
    /// Beugeldiameter in mm (0 = geen beugel; de hoofdwapening ligt dan direct
    /// achter de dekking).
    pub stirrup_diameter_mm: f64,
    /// Bovenwapening (aan de zijde z = h).
    pub top: RebarRow,
    /// Onderwapening (aan de zijde z = 0).
    pub bottom: RebarRow,
    /// Hart-op-hartafstand s van de beugels, gemeten LANGS de lengteas, in mm
    /// (§9.2.2(5), symbool s in (9.4); begrensd door s_l,max in §9.2.2(6)).
    ///
    /// `None` = niet opgegeven. Dat is iets anders dan 0 (dat zou een
    /// oneindige hoeveelheid wapening betekenen) en iets anders dan een
    /// aangenomen waarde: de norm geeft geen aanbevolen s, alleen een
    /// bovengrens. Zonder s zijn A_sw/s in (6.8) en ρ_w in (9.4) onbepaald.
    #[serde(default)]
    #[ts(optional)]
    pub stirrup_spacing_mm: Option<f64>,
    /// Aantal beugelbenen n dat één verticale doorsnede kruist.
    ///
    /// §9.2.2(5) omschrijft A_sw als "de oppervlakte van de doorsnede van de
    /// dwarskrachtwapening binnen de lengte s"; bij een gesloten tweebenige
    /// beugel is dat 2·(π/4)·Ø², bij een vierbenige het dubbele. Dit getal is
    /// uit dekking of diameter niet af te leiden en is de grootste enkele
    /// foutbron in een dwarskrachttoets: hij schaalt V_Rd,s recht evenredig.
    ///
    /// `None` = niet opgegeven.
    #[serde(default)]
    #[ts(optional)]
    pub stirrup_legs: Option<u32>,
    /// Hart-op-hartafstand s_t van de beugelbenen in DWARSRICHTING, in mm
    /// (§9.2.2(8); de nationale bijlage begrenst hem op 500 mm).
    ///
    /// `None` = niet opgegeven. Bij een gesloten tweebenige beugel is s_t
    /// zuivere meetkunde en hoeft hij niet te worden gevraagd; zie
    /// [`Self::leg_spacing_mm`]. Bij meer benen hangt hij af van de verdeling
    /// over de breedte en is hij niet af te leiden.
    #[serde(default)]
    #[ts(optional)]
    pub stirrup_leg_spacing_mm: Option<f64>,
    /// Karakteristieke vloeigrens f_ywk van de DWARSKRACHTWAPENING, in N/mm².
    ///
    /// `None` = dezelfde staalsoort als de langswapening. De beugelkwaliteit
    /// mág afwijken en is niet uit de langswapening af te leiden, dus het veld
    /// bestaat; maar `None` is hier geen ontbrekend gegeven, want de
    /// staalsoort van de staaf is wél bekend. Wie het invult, moet het in de
    /// afleiding terugzien.
    #[serde(default)]
    #[ts(optional)]
    pub stirrup_fywk_mpa: Option<f64>,
}

/// Waar de dwarsafstand s_t van de beugelbenen vandaan komt.
///
/// De herkomst reist mee omdat een afgeleide s_t een meetkundige gevolgtrekking
/// is en geen invoer: hij geldt alléén voor een gesloten tweebenige beugel, en
/// dat hoort in de afleiding te staan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LegSpacingSource {
    /// Door de gebruiker opgegeven.
    Given,
    /// Afgeleid uit b_w, c_nom en Ø_beugel bij een tweebenige beugel:
    /// s_t = b_w − 2·c_nom − Ø_beugel (zuivere meetkunde, geen normregel).
    DerivedTwoLeg,
}

/// De dwarskrachtwapening zoals §6.2.3 en §9.2.2 haar nodig hebben, met alles
/// er al uit gerekend wat meetkunde is.
///
/// Dit type bestaat zodat elke toets die de beugels nodig heeft langs één
/// poort binnenkomt ([`ReinforcementCage::shear_reinforcement`]) en dus
/// dezelfde A_sw en dezelfde α gebruikt.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShearReinforcement {
    /// Beugeldiameter Ø in mm.
    pub diameter_mm: f64,
    /// Hart-op-hartafstand s in de lengterichting, mm (§9.2.2(5)).
    pub s_mm: f64,
    /// Aantal benen n dat één verticale doorsnede kruist.
    pub legs: u32,
    /// A_sw = n·(π/4)·Ø², mm² — de wapening binnen de lengte s (§9.2.2(5)).
    pub a_sw_mm2: f64,
    /// A_sw/s in mm²/mm; de maat die in (6.8) en (6.13) staat.
    pub a_sw_per_s_mm: f64,
    /// Hoek α t.o.v. de lengteas, graden. Altijd [`STIRRUP_ALPHA_DEG`].
    pub alpha_deg: f64,
    /// f_ywk in N/mm² als er een afwijkende beugelkwaliteit is opgegeven;
    /// `None` = dezelfde staalsoort als de langswapening.
    pub f_ywk_mpa: Option<f64>,
}

/// Eén wapeningslaag in de doorsnedeberekening: ligging en oppervlakte.
#[derive(Clone, Debug, PartialEq)]
pub struct RebarLayer {
    /// Afstand van de staafas tot de onderrand, in mm.
    pub z_mm: f64,
    pub area_mm2: f64,
    /// "onder 3Ø16" / "boven 2Ø12".
    pub label: String,
}

/// Spiegel de wapeningslagen in de hoogte (z → h − z), om een negatief moment
/// als positief door te rekenen.
///
/// Hoort samen met [`ConcreteSection::mirrored`]: wie de lagen spiegelt en de
/// doorsnede laat staan, klapt bij een T de wapening om maar laat de flens
/// boven liggen. Dat is de verkeerde meetkunde. Deze functie stond eerder in
/// twee kopieën in de crate (in `mnkappa` en in `stiffness`); dit is de enige.
pub fn mirrored_layers(layers: &[RebarLayer], h_mm: f64) -> Vec<RebarLayer> {
    layers
        .iter()
        .map(|l| RebarLayer { z_mm: h_mm - l.z_mm, area_mm2: l.area_mm2, label: l.label.clone() })
        .collect()
}

impl ReinforcementCage {
    /// Afstand van de staafas van een rij tot de betonrand waar hij tegenaan ligt.
    pub fn axis_offset_mm(&self, row: &RebarRow) -> f64 {
        self.cover_mm + self.stirrup_diameter_mm + row.diameter_mm / 2.0
    }

    /// Nuttige hoogte d van de onderwapening (voor positief moment), mm.
    pub fn d_mm(&self, h_mm: f64) -> f64 {
        h_mm - self.axis_offset_mm(&self.bottom)
    }

    /// Afstand d₂ van de bovenwapening tot de bovenrand, mm.
    pub fn d2_mm(&self) -> f64 {
        self.axis_offset_mm(&self.top)
    }

    pub fn a_s_bottom_mm2(&self) -> f64 {
        self.bottom.area_mm2()
    }

    pub fn a_s_top_mm2(&self) -> f64 {
        self.top.area_mm2()
    }

    /// De wapeningslagen voor de doorsnedeberekening. Lege rijen (0 staven)
    /// leveren geen laag.
    pub fn layers(&self, h_mm: f64) -> Vec<RebarLayer> {
        let mut lagen = Vec::with_capacity(2);
        if !self.bottom.is_empty() {
            lagen.push(RebarLayer {
                z_mm: self.axis_offset_mm(&self.bottom),
                area_mm2: self.bottom.area_mm2(),
                label: format!("onder {}", self.bottom.label()),
            });
        }
        if !self.top.is_empty() {
            lagen.push(RebarLayer {
                z_mm: h_mm - self.axis_offset_mm(&self.top),
                area_mm2: self.top.area_mm2(),
                label: format!("boven {}", self.top.label()),
            });
        }
        lagen
    }

    /// De dwarskrachtwapening, of de reden waarom zij niet bekend is.
    ///
    /// De reden is bewust een leesbare zin en geen `None`: een toets die
    /// hierop stukloopt moet in het rapport kunnen zeggen wát er ontbreekt,
    /// zodat de constructeur het kan invullen. Alle ontbrekende gegevens staan
    /// in één melding — drie keer achter elkaar hetzelfde formulier openen om
    /// er één veld bij te leren is geen dienst.
    ///
    /// De geleverde A_sw volgt §9.2.2(5): "de oppervlakte van de doorsnede van
    /// de dwarskrachtwapening binnen de lengte s", dus n benen × π/4 × Ø².
    pub fn shear_reinforcement(&self) -> Result<ShearReinforcement, String> {
        let mut ontbreekt: Vec<&str> = Vec::new();
        if !(self.stirrup_diameter_mm > 0.0) {
            ontbreekt.push("de beugeldiameter (nu 0 = geen beugel)");
        }
        let s = match self.stirrup_spacing_mm {
            Some(s) if s > 0.0 => Some(s),
            _ => {
                ontbreekt.push("de hart-op-hartafstand s van de beugels (§9.2.2(5))");
                None
            }
        };
        let benen = match self.stirrup_legs {
            Some(n) if n >= 1 => Some(n),
            _ => {
                ontbreekt.push("het aantal beugelbenen n");
                None
            }
        };
        if !ontbreekt.is_empty() {
            return Err(format!(
                "de dwarskrachtwapening is onvolledig opgegeven: {} ontbreekt. \
                 De norm kent hiervoor geen standaardwaarde — §9.2.2(6) en (8) geven \
                 alleen bovengrenzen — dus er wordt niets aangenomen.",
                ontbreekt.join(", ")
            ));
        }
        let (s, benen) = (s.expect("hierboven gecontroleerd"), benen.expect("idem"));
        let a_sw = benen as f64 * std::f64::consts::PI * (self.stirrup_diameter_mm / 2.0).powi(2);
        Ok(ShearReinforcement {
            diameter_mm: self.stirrup_diameter_mm,
            s_mm: s,
            legs: benen,
            a_sw_mm2: a_sw,
            a_sw_per_s_mm: a_sw / s,
            alpha_deg: STIRRUP_ALPHA_DEG,
            f_ywk_mpa: self.stirrup_fywk_mpa,
        })
    }

    /// De dwarsafstand s_t van de beugelbenen (§9.2.2(8)), met de herkomst
    /// erbij. `None` = niet bekend en niet af te leiden.
    ///
    /// Opgegeven gaat vóór. Is er niets opgegeven en heeft de beugel precies
    /// **twee** benen, dan volgt s_t uit de meetkunde: beide benen liggen met
    /// hun hart op c_nom + Ø_beugel/2 van hun eigen zijkant, dus
    ///
    /// ```text
    ///   s_t = b_w − 2·(c_nom + Ø_beugel/2) = b_w − 2·c_nom − Ø_beugel
    /// ```
    ///
    /// Dat is zuivere meetkunde en staat als zodanig NIET in de norm; daarom
    /// draagt de uitkomst [`LegSpacingSource::DerivedTwoLeg`]. Bij meer dan
    /// twee benen wordt niets afgeleid: hoe die over de breedte verdeeld zijn
    /// is een ontwerpkeuze, en gelijkmatig verdelen zou een aanname zijn.
    ///
    /// De breedte is b_w — de kleinste breedte van de doorsnede (§6.2.3(1)) —
    /// en niet de flensbreedte: de beugel zit in het lijf.
    pub fn leg_spacing_mm(&self, section: &ConcreteSection) -> Option<(f64, LegSpacingSource)> {
        if let Some(s_t) = self.stirrup_leg_spacing_mm {
            if s_t > 0.0 {
                return Some((s_t, LegSpacingSource::Given));
            }
        }
        if self.stirrup_legs != Some(2) || !(self.stirrup_diameter_mm > 0.0) {
            return None;
        }
        let s_t = section.b_w_mm() - 2.0 * self.cover_mm - self.stirrup_diameter_mm;
        if s_t > 0.0 {
            Some((s_t, LegSpacingSource::DerivedTwoLeg))
        } else {
            None
        }
    }

    /// De modelaannames van de korf, als zinnen voor de afleiding.
    ///
    /// Naar de vorm gelijk aan [`ConcreteSection::assumptions`]: wat het model
    /// vastlegt en de gebruiker niet kan kiezen, reist als tekst mee in plaats
    /// van stilzwijgend in een formule te zitten.
    pub fn assumptions(&self) -> Vec<String> {
        let mut uit = Vec::new();
        if self.stirrup_diameter_mm > 0.0 {
            uit.push(format!(
                "De dwarskrachtwapening wordt als RECHTE beugels gerekend: α = {}° ten opzichte \
                 van de lengteas. §9.2.2(1) laat 45° t/m 90° toe, maar hellende \
                 dwarskrachtwapening en opgebogen staven zijn in dit model niet opgenomen; \
                 α = 90° geeft de kleinste ρ_w in (9.4), de kleinste s_l,max in (9.6N) en de \
                 kleinste weerstand — het is dus de veilige tak.",
                fmt_mm(STIRRUP_ALPHA_DEG)
            ));
        }
        if let Some(f_ywk) = self.stirrup_fywk_mpa {
            uit.push(format!(
                "Voor de dwarskrachtwapening is een eigen vloeigrens f_ywk = {} N/mm² \
                 opgegeven; die wijkt af van de staalsoort van de langswapening.",
                fmt_mm(f_ywk)
            ));
        }
        uit
    }

    /// "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm".
    ///
    /// Zijn de beugelgegevens ingevuld, dan staan ze erbij:
    /// "… beugel Ø8 h.o.h. 150 mm, 2-benig, …". Ontbreken ze, dan blijft de
    /// regel letterlijk zoals hij was — een korf zonder beugelafstand mag niet
    /// als een korf mét gaan lezen.
    pub fn summary(&self) -> String {
        let beugel = if self.stirrup_diameter_mm > 0.0 {
            let mut s = format!("beugel Ø{}", fmt_mm(self.stirrup_diameter_mm));
            if let Some(a) = self.stirrup_spacing_mm.filter(|v| *v > 0.0) {
                s.push_str(&format!(" h.o.h. {} mm", fmt_mm(a)));
            }
            if let Some(n) = self.stirrup_legs.filter(|n| *n >= 1) {
                s.push_str(&format!(", {n}-benig"));
            }
            s
        } else {
            "geen beugel".to_string()
        };
        format!(
            "onder {}, boven {}, {}, dekking {} mm",
            self.bottom.label(),
            self.top.label(),
            beugel,
            fmt_mm(self.cover_mm)
        )
    }

    /// Controleer of de korf in de doorsnede past. Geen normtoets — alleen
    /// geometrie: negatieve maten, staven die elkaar of de tegenoverliggende
    /// rand raken, of een doorsnede zonder wapening.
    ///
    /// De breedtecontrole kijkt naar de breedte die op de hoogte van de rij
    /// **werkelijk aanwezig** is, niet naar de grootste breedte van de
    /// doorsnede. Voor een T-lijf zou dat laatste te ruim zijn (er past dan
    /// op papier een rij in die er in werkelijkheid niet in kan) en voor een
    /// flens te beperkt.
    pub fn validate(&self, section: &ConcreteSection) -> Result<(), String> {
        if section.b_mm <= 0.0 || section.h_mm <= 0.0 {
            return Err("doorsnedeafmetingen moeten positief zijn".into());
        }
        if self.cover_mm < 0.0 || self.stirrup_diameter_mm < 0.0 {
            return Err("dekking en beugeldiameter mogen niet negatief zijn".into());
        }
        if self.bottom.is_empty() && self.top.is_empty() {
            return Err("de korf bevat geen hoofdwapening".into());
        }
        // De beugelvelden. Nog steeds geen normtoets: alleen of het opgegeven
        // getal als maat kán bestaan. Een LEEG veld is hier geldig — dat
        // betekent "niet opgegeven" en wordt pas een probleem bij een toets
        // die het nodig heeft (zie `shear_reinforcement`).
        for (naam, waarde) in [
            ("de beugelafstand s", self.stirrup_spacing_mm),
            ("de dwarsafstand s_t van de beugelbenen", self.stirrup_leg_spacing_mm),
            ("de vloeigrens f_ywk van de dwarskrachtwapening", self.stirrup_fywk_mpa),
        ] {
            if let Some(v) = waarde {
                if !(v > 0.0) {
                    return Err(format!(
                        "{naam} is {v} opgegeven; dat is geen maat. Laat het veld leeg als \
                         hij niet is opgegeven — leeg en nul betekenen hier niet hetzelfde."
                    ));
                }
            }
        }
        if self.stirrup_legs == Some(0) {
            return Err("het aantal beugelbenen is 0 opgegeven; laat het veld leeg als er \
                        geen beugels zijn, of geef het werkelijke aantal benen"
                .into());
        }
        let beugelgegeven = self.stirrup_spacing_mm.is_some()
            || self.stirrup_legs.is_some()
            || self.stirrup_leg_spacing_mm.is_some();
        if beugelgegeven && !(self.stirrup_diameter_mm > 0.0) {
            return Err("er zijn beugelgegevens (afstand, benen of dwarsafstand) opgegeven \
                        terwijl de beugeldiameter 0 is; kies een beugeldiameter of laat de \
                        beugelgegevens leeg"
                .into());
        }
        // s_t is een afstand tussen benen die beide binnen het lijf liggen; de
        // buitenste twee liggen op c_nom + Ø_beugel/2 van hun eigen zijkant.
        // Verder uit elkaar dan dat kunnen ze niet staan.
        if let Some(s_t) = self.stirrup_leg_spacing_mm {
            let ruimte = section.b_w_mm() - 2.0 * self.cover_mm - self.stirrup_diameter_mm;
            if s_t > ruimte + 1e-9 {
                return Err(format!(
                    "de dwarsafstand van de beugelbenen is {s_t:.0} mm, maar tussen de \
                     buitenste beenassen past hoogstens {ruimte:.0} mm \
                     (b_w = {:.0} mm, dekking {:.0} mm, beugel Ø{:.0} mm)",
                    section.b_w_mm(),
                    self.cover_mm,
                    self.stirrup_diameter_mm
                ));
            }
        }
        for (naam, rij, z) in [
            ("onderwapening", &self.bottom, self.axis_offset_mm(&self.bottom)),
            ("bovenwapening", &self.top, section.h_mm - self.axis_offset_mm(&self.top)),
        ] {
            if rij.is_empty() {
                continue;
            }
            let breedte = section.width_at_mm(z);
            let binnenbreedte = breedte - 2.0 * (self.cover_mm + self.stirrup_diameter_mm);
            let benodigd = rij.count as f64 * rij.diameter_mm;
            if benodigd > binnenbreedte + 1e-9 {
                return Err(format!(
                    "{naam} {} past niet in de breedte: {benodigd:.0} mm staal in {binnenbreedte:.0} mm binnenmaat (de doorsnede is op z = {z:.0} mm {breedte:.0} mm breed)",
                    rij.label()
                ));
            }
        }
        let onder = if self.bottom.is_empty() { 0.0 } else { self.axis_offset_mm(&self.bottom) };
        let boven = if self.top.is_empty() { 0.0 } else { self.axis_offset_mm(&self.top) };
        if onder + boven >= section.h_mm {
            return Err("boven- en onderwapening overlappen elkaar in de hoogte".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    fn korf() -> ReinforcementCage {
        ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
            ..ReinforcementCage::default()
        }
    }

    #[test]
    fn ligging_en_oppervlakten() {
        let k = korf();
        // 3Ø16: 3 · π · 8² = 603,19 mm²; 2Ø12: 226,19 mm².
        assert_relative_eq!(k.a_s_bottom_mm2(), 603.186, max_relative = 1e-4);
        assert_relative_eq!(k.a_s_top_mm2(), 226.195, max_relative = 1e-4);
        // d = 500 − (30 + 8 + 8) = 454 mm; d₂ = 30 + 8 + 6 = 44 mm.
        assert_relative_eq!(k.d_mm(500.0), 454.0);
        assert_relative_eq!(k.d2_mm(), 44.0);
        let lagen = k.layers(500.0);
        assert_eq!(lagen.len(), 2);
        assert_relative_eq!(lagen[0].z_mm, 46.0);
        assert_relative_eq!(lagen[1].z_mm, 456.0);
        assert_eq!(lagen[0].label, "onder 3Ø16");
        assert_eq!(k.summary(), "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm");
        assert_eq!(ConcreteSection::new(300.0, 500.0).name(), "300 x 500");
    }

    #[test]
    fn validatie() {
        let s = ConcreteSection::new(300.0, 500.0);
        assert!(korf().validate(&s).is_ok());
        let mut te_breed = korf();
        te_breed.bottom = RebarRow { count: 20, diameter_mm: 16.0 };
        assert!(te_breed.validate(&s).is_err());
        let mut leeg = korf();
        leeg.top.count = 0;
        leeg.bottom.count = 0;
        assert!(leeg.validate(&s).is_err());
        let mut alleen_onder = korf();
        alleen_onder.top.count = 0;
        assert!(alleen_onder.validate(&s).is_ok());
        assert_eq!(alleen_onder.layers(500.0).len(), 1);
    }

    /// De rechthoek is één band die de hele hoogte beslaat.
    #[test]
    fn rechthoek_is_een_band() {
        let s = ConcreteSection::new(300.0, 500.0);
        assert_eq!(s.shape, ConcreteShape::Rectangle);
        assert_eq!(s.bands(), &[Band { z0_mm: 0.0, z1_mm: 500.0, b_mm: 300.0 }]);
        assert_eq!(s.area_mm2(), 150_000.0);
        assert_eq!(s.b_w_mm(), 300.0);
        assert_eq!(s.h_f_mm(), 0.0);
        assert_eq!(s.centroid_z_mm(), 250.0);
        assert_eq!(s.w_bottom_mm3(), s.w_top_mm3());
        assert_eq!(s.width_at_mm(46.0), 300.0);
        assert_eq!(s.uniform_top_width(400.0), Some(300.0));
        assert!(s.assumptions().is_empty());
        // Spiegelen laat een rechthoek onveranderd.
        assert_eq!(s.mirrored(), s);
    }

    /// De T: twee banden, flens boven. Handberekening van de meetkunde voor
    /// b_f = 400, h_f = 50, b_w = 200, h = 450:
    ///   A   = 400·50 + 200·400 = 100 000 mm²
    ///   z_g = (80 000·200 + 20 000·425)/100 000 = 245 mm
    ///   I   = 200·400³/12 + 80 000·45² + 400·50³/12 + 20 000·180²
    ///       = 1 066 666 667 + 162 000 000 + 4 166 667 + 648 000 000
    ///       = 1 880 833 333 mm⁴
    ///   W_onder = I/245 = 7 676 871 mm³ ;  W_boven = I/205 = 9 174 797 mm³
    #[test]
    fn t_vorm_meetkunde_met_de_hand() {
        let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
        assert_eq!(s.shape, ConcreteShape::Tee);
        assert_eq!(
            s.bands(),
            &[
                Band { z0_mm: 0.0, z1_mm: 400.0, b_mm: 200.0 },
                Band { z0_mm: 400.0, z1_mm: 450.0, b_mm: 400.0 },
            ]
        );
        assert_eq!(s.b_mm, 400.0);
        assert_eq!(s.b_w_mm(), 200.0);
        assert_eq!(s.h_f_mm(), 50.0);
        assert!(s.flange_on_top());
        assert_relative_eq!(s.area_mm2(), 100_000.0);
        assert_relative_eq!(s.centroid_z_mm(), 245.0);
        assert_relative_eq!(s.i_centroid_mm4(), 1_880_833_333.3333333, max_relative = 1e-12);
        assert_relative_eq!(s.w_bottom_mm3(), 1_880_833_333.3333333 / 245.0, max_relative = 1e-12);
        assert_relative_eq!(s.w_top_mm3(), 1_880_833_333.3333333 / 205.0, max_relative = 1e-12);
        // Twee VERSCHILLENDE weerstandsmomenten — dat is precies het punt.
        assert!(s.w_bottom_mm3() < s.w_top_mm3());
        assert_eq!(s.name(), "T 400 x 450 (flens 400 x 50, lijf 200)");
    }

    /// Breedte op hoogte: lijf onder, flens boven, en op de grens de kleinste.
    #[test]
    fn breedte_op_hoogte() {
        let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
        assert_eq!(s.width_at_mm(0.0), 200.0);
        assert_eq!(s.width_at_mm(399.0), 200.0);
        assert_eq!(s.width_at_mm(400.0), 200.0, "op de bandgrens de kleinste");
        assert_eq!(s.width_at_mm(401.0), 400.0);
        assert_eq!(s.width_at_mm(450.0), 400.0);
        assert_eq!(s.width_at_mm(-1.0), 0.0);
        assert_eq!(s.width_at_mm(451.0), 0.0);
    }

    /// Het spanningsblok binnen één band, en het blok dat de grens overschrijdt.
    #[test]
    fn blok_binnen_een_band_en_eroverheen() {
        let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
        assert_eq!(s.uniform_top_width(30.0), Some(400.0));
        assert_eq!(s.uniform_top_width(50.0), Some(400.0), "precies de flens");
        assert_eq!(s.uniform_top_width(50.0001), None);
        // Blok van 90 mm: 50 mm flens (400 breed) + 40 mm lijf (200 breed).
        let (a, statisch) = s.top_strip(90.0);
        assert_relative_eq!(a, 400.0 * 50.0 + 200.0 * 40.0);
        assert_relative_eq!(statisch, 20_000.0 * 25.0 + 8_000.0 * 70.0);
        // Zwaartepunt op 500 000 + 560 000 = 1 060 000 / 28 000 = 37,857 mm.
        assert_relative_eq!(statisch / a, 1_060_000.0 / 28_000.0, max_relative = 1e-12);
    }

    /// Spiegelen brengt de flens naar ONDEREN — de kern van punt 3.
    #[test]
    fn spiegelen_brengt_de_flens_naar_onderen() {
        let s = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
        let g = s.mirrored();
        assert_eq!(
            g.bands(),
            &[
                Band { z0_mm: 0.0, z1_mm: 50.0, b_mm: 400.0 },
                Band { z0_mm: 50.0, z1_mm: 450.0, b_mm: 200.0 },
            ]
        );
        assert!(!g.flange_on_top());
        assert_eq!(g.shape, ConcreteShape::Tee, "een omgeklapte T blijft een T");
        // Oppervlak en traagheidsmoment veranderen niet; het zwaartepunt klapt mee.
        assert_relative_eq!(g.area_mm2(), s.area_mm2());
        assert_relative_eq!(g.i_centroid_mm4(), s.i_centroid_mm4(), max_relative = 1e-12);
        assert_relative_eq!(g.centroid_z_mm(), 450.0 - s.centroid_z_mm(), max_relative = 1e-12);
        assert_relative_eq!(g.w_top_mm3(), s.w_bottom_mm3(), max_relative = 1e-12);
        // Twee keer spiegelen is de identiteit.
        assert_eq!(g.mirrored().bands(), s.bands());
    }

    /// De L heeft dezelfde banden als de T, en dus dezelfde getallen — maar
    /// een ander etiket en een extra aanname.
    #[test]
    fn de_l_is_de_t_met_een_aanname_erbij() {
        let t = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
        let l = ConcreteSection::ell(400.0, 50.0, 200.0, 450.0).unwrap();
        assert_eq!(l.bands(), t.bands());
        assert_eq!(l.area_mm2(), t.area_mm2());
        assert_eq!(l.i_centroid_mm4(), t.i_centroid_mm4());
        assert_ne!(l.shape, t.shape);
        assert_eq!(l.name(), "L 400 x 450 (flens 400 x 50, lijf 200)");
        // De aanname reist mee.
        assert_eq!(t.assumptions().len(), 2);
        assert_eq!(l.assumptions().len(), 3);
        assert!(l.assumptions().iter().any(|a| a.contains("VERHINDERD")));
        assert!(l.assumptions().iter().any(|a| a.contains("geen apart artikel")));
        assert!(t.assumptions().iter().any(|a| a.contains("MODELKEUZE")));
        assert!(t.assumptions().iter().any(|a| a.contains("5.3.2.1(3)")));
    }

    #[test]
    fn onmogelijke_flens_wordt_geweigerd() {
        assert!(ConcreteSection::tee(400.0, 450.0, 200.0, 450.0).is_err());
        assert!(ConcreteSection::tee(400.0, 500.0, 200.0, 450.0).is_err());
        assert!(ConcreteSection::tee(0.0, 50.0, 200.0, 450.0).is_err());
        assert!(ConcreteSection::ell(400.0, 50.0, -1.0, 450.0).is_err());
    }

    /// De breedtecontrole van de korf kijkt naar de breedte OP DIE HOOGTE.
    /// Een rij die in de flens past, hoeft in het lijf niet te passen.
    #[test]
    fn korfcontrole_gebruikt_de_breedte_op_die_hoogte() {
        // Lijf 200 mm: binnenmaat 200 − 2·38 = 124 mm. Flens 600 mm:
        // binnenmaat 600 − 76 = 524 mm.
        let s = ConcreteSection::tee(600.0, 80.0, 200.0, 500.0).unwrap();
        let k = ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            // Boven, in de flens: 8Ø20 = 160 mm ≤ 524 mm → past.
            top: RebarRow { count: 8, diameter_mm: 20.0 },
            // Onder, in het lijf: 5Ø20 = 100 mm ≤ 124 mm → past.
            bottom: RebarRow { count: 5, diameter_mm: 20.0 },
            ..ReinforcementCage::default()
        };
        assert!(k.validate(&s).is_ok());
        // Dezelfde rij van 8Ø20 onderin het lijf past NIET, terwijl hij tegen
        // de grootste breedte (600 mm) getoetst wél door zou komen.
        let mut te_veel = k;
        te_veel.bottom = RebarRow { count: 8, diameter_mm: 20.0 };
        let fout = te_veel.validate(&s).unwrap_err();
        assert!(fout.contains("onderwapening"), "{fout}");
        assert!(fout.contains("200 mm breed"), "{fout}");
        // In een rechthoek van 600 mm zou diezelfde korf wél passen.
        assert!(te_veel.validate(&ConcreteSection::new(600.0, 500.0)).is_ok());
    }

    // ── Het invoercontract ────────────────────────────────────────────────

    /// De rechthoek uit de invoer is dezelfde doorsnede als `new(b, h)`.
    #[test]
    fn invoer_rechthoek_is_new() {
        let s = ConcreteSectionInput::rectangle(300.0, 500.0).build().unwrap();
        assert_eq!(s, ConcreteSection::new(300.0, 500.0));
        assert_eq!(s.name(), "300 x 500");
    }

    /// De T uit de invoer is dezelfde doorsnede als `tee(...)`, en de volgorde
    /// van de argumenten wisselt daarbij niet stilzwijgend om: in de invoer
    /// staat (b_f, h, b_w, h_f), in de kern (b_f, h_f, b_w, h).
    #[test]
    fn invoer_t_en_l_leveren_dezelfde_banden_als_de_constructors() {
        let t = ConcreteSectionInput::tee(400.0, 450.0, 200.0, 50.0).build().unwrap();
        assert_eq!(t, ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap());
        let l = ConcreteSectionInput::ell(400.0, 450.0, 200.0, 50.0).build().unwrap();
        assert_eq!(l, ConcreteSection::ell(400.0, 50.0, 200.0, 450.0).unwrap());
    }

    /// De omgekeerde T: één vlag, en de flens ligt onder. De banden zijn
    /// letterlijk die van de gespiegelde T.
    #[test]
    fn de_omgekeerde_t_is_een_vlag() {
        let mut invoer = ConcreteSectionInput::tee(400.0, 450.0, 200.0, 50.0);
        invoer.flange_at_bottom = true;
        let s = invoer.build().unwrap();
        assert_eq!(s.bands(), ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap().mirrored().bands());
        assert!(!s.flange_on_top());
        assert_eq!(s.shape, ConcreteShape::Tee);
        // Oppervlak en traagheidsmoment veranderen niet door het omklappen;
        // het zwaartepunt wel.
        let rechtop = ConcreteSectionInput::tee(400.0, 450.0, 200.0, 50.0).build().unwrap();
        assert_relative_eq!(s.area_mm2(), rechtop.area_mm2());
        assert_relative_eq!(s.i_centroid_mm4(), rechtop.i_centroid_mm4(), max_relative = 1e-12);
        assert_relative_eq!(s.centroid_z_mm(), 450.0 - rechtop.centroid_z_mm(), max_relative = 1e-12);
    }

    /// Een maat die bij de vorm hoort mag niet ontbreken, en een maat die er
    /// niet bij hoort mag er niet zijn. Beide leveren een reden, geen
    /// doorsnede.
    #[test]
    fn de_maten_horen_bij_de_vorm() {
        // Flensmaten op een rechthoek: geweigerd.
        let mut r = ConcreteSectionInput::rectangle(300.0, 500.0);
        r.h_f_mm = Some(100.0);
        assert!(r.build().unwrap_err().contains("geen flens"));
        let mut r = ConcreteSectionInput::rectangle(300.0, 500.0);
        r.flange_at_bottom = true;
        assert!(r.build().unwrap_err().contains("flange_at_bottom"));
        // Ontbrekende flensmaten op een T: geweigerd, met de naam van het veld.
        let mut t = ConcreteSectionInput::tee(400.0, 450.0, 200.0, 50.0);
        t.b_w_mm = None;
        assert!(t.build().unwrap_err().contains("b_w_mm"));
        let mut t = ConcreteSectionInput::tee(400.0, 450.0, 200.0, 50.0);
        t.h_f_mm = None;
        assert!(t.build().unwrap_err().contains("h_f_mm"));
        // Een lijf dat even breed of breder is dan de flens is geen T.
        assert!(ConcreteSectionInput::tee(400.0, 450.0, 400.0, 50.0).build().is_err());
        assert!(ConcreteSectionInput::tee(400.0, 450.0, 500.0, 50.0).build().is_err());
        // Een flens die de hele hoogte opeet: de kern weigert hem al.
        assert!(ConcreteSectionInput::tee(400.0, 450.0, 200.0, 450.0).build().is_err());
        // Nulmaten.
        assert!(ConcreteSectionInput::rectangle(0.0, 500.0).build().is_err());
        assert!(ConcreteSectionInput::rectangle(300.0, -1.0).build().is_err());
    }

    /// De JSON-vorm van het contract: `shape` mag weg (dan rechthoek), een
    /// onbekend veld wordt geweigerd.
    #[test]
    fn de_json_vorm_van_het_contract() {
        let r: ConcreteSectionInput =
            serde_json::from_str(r#"{"b_mm": 300, "h_mm": 500}"#).unwrap();
        assert_eq!(r.shape, ConcreteShape::Rectangle);
        assert_eq!(r.build().unwrap(), ConcreteSection::new(300.0, 500.0));

        let t: ConcreteSectionInput = serde_json::from_str(
            r#"{"shape": "Tee", "b_mm": 400, "h_mm": 450, "b_w_mm": 200, "h_f_mm": 50}"#,
        )
        .unwrap();
        assert_eq!(t.build().unwrap().name(), "T 400 x 450 (flens 400 x 50, lijf 200)");

        // Een tikfout in een veldnaam is een fout en geen standaardwaarde.
        assert!(serde_json::from_str::<ConcreteSectionInput>(
            r#"{"b_mm": 300, "h_mm": 500, "width_mm": 300}"#
        )
        .is_err());
    }

    // ── De dwarskrachtwapening in de korf ────────────────────────────────
    //
    // De getallen hieronder zijn met de hand gerekend; ze staan telkens als
    // som in het commentaar zodat een afwijking van de code niet als
    // "de code zegt het" wegkomt.

    /// De referentiekorf mét beugelgegevens: Ø8, h.o.h. 150 mm, 2-benig.
    fn korf_met_beugels() -> ReinforcementCage {
        ReinforcementCage {
            stirrup_spacing_mm: Some(150.0),
            stirrup_legs: Some(2),
            ..korf()
        }
    }

    /// A_sw = n·(π/4)·Ø² (§9.2.2(5)) en A_sw/s, de maat uit (6.8).
    ///
    /// Handberekening, Ø8 en twee benen:
    ///   π/4 · 8²   = 0,7853982 · 64 = 50,265482 mm² per been
    ///   A_sw = 2 · = 100,530965 mm²
    ///   A_sw/s     = 100,530965 / 150 = 0,6702064 mm²/mm
    #[test]
    fn dwarskrachtwapening_uit_diameter_afstand_en_benen() {
        let b = korf_met_beugels().shear_reinforcement().expect("volledig opgegeven");
        assert_relative_eq!(b.a_sw_mm2, 100.530965, max_relative = 1e-8);
        assert_relative_eq!(b.a_sw_per_s_mm, 0.6702064327, max_relative = 1e-8);
        assert_eq!(b.legs, 2);
        assert_relative_eq!(b.s_mm, 150.0);
        assert_relative_eq!(b.diameter_mm, 8.0);
        // α ligt vast op 90° — rechte beugels; zie STIRRUP_ALPHA_DEG.
        assert_relative_eq!(b.alpha_deg, 90.0);
        assert_eq!(b.f_ywk_mpa, None);

        // Vier benen is exact het dubbele: A_sw = 4 · 50,265482 = 201,061930 mm².
        let vier = ReinforcementCage { stirrup_legs: Some(4), ..korf_met_beugels() };
        let b4 = vier.shear_reinforcement().unwrap();
        assert_relative_eq!(b4.a_sw_mm2, 201.061930, max_relative = 1e-8);

        // Ø10, 2-benig, h.o.h. 200: π/4 · 10² = 78,539816 mm² per been,
        // A_sw = 157,079633 mm², A_sw/s = 157,079633 / 200 = 0,7853982 mm²/mm.
        let dik = ReinforcementCage {
            stirrup_diameter_mm: 10.0,
            stirrup_spacing_mm: Some(200.0),
            ..korf_met_beugels()
        };
        let b10 = dik.shear_reinforcement().unwrap();
        assert_relative_eq!(b10.a_sw_mm2, 157.0796327, max_relative = 1e-8);
        assert_relative_eq!(b10.a_sw_per_s_mm, 0.7853981634, max_relative = 1e-8);
    }

    /// Ontbrekende beugelgegevens leveren een REDEN en geen aangenomen getal.
    /// Dat is de kern van de keuze voor `Option`: een toets die zonder s of n
    /// niet kan, hoort dat te zeggen.
    #[test]
    fn onvolledige_beugelgegevens_leveren_een_reden_en_geen_aanname() {
        // De oude korf: alleen een beugeldiameter. Beide gegevens ontbreken en
        // ze staan beide in één melding.
        let fout = korf().shear_reinforcement().unwrap_err();
        assert!(fout.contains("hart-op-hartafstand"), "kreeg: {fout}");
        assert!(fout.contains("aantal beugelbenen"), "kreeg: {fout}");

        // Alleen s, geen benen.
        let alleen_s = ReinforcementCage { stirrup_spacing_mm: Some(150.0), ..korf() };
        let fout = alleen_s.shear_reinforcement().unwrap_err();
        assert!(!fout.contains("hart-op-hartafstand"), "kreeg: {fout}");
        assert!(fout.contains("aantal beugelbenen"), "kreeg: {fout}");

        // Geen beugel: dan is de diameter het eerste dat ontbreekt.
        let zonder = ReinforcementCage { stirrup_diameter_mm: 0.0, ..korf() };
        assert!(zonder.shear_reinforcement().unwrap_err().contains("beugeldiameter"));
    }

    /// s_t bij een gesloten tweebenige beugel is meetkunde, geen invoer:
    ///   s_t = b_w − 2·c_nom − Ø_beugel = 300 − 60 − 8 = 232 mm.
    /// Bij een T telt de LIJFbreedte, niet de flensbreedte:
    ///   s_t = 200 − 60 − 8 = 132 mm.
    #[test]
    fn dwarsafstand_van_de_beugelbenen() {
        let rechthoek = ConcreteSection::new(300.0, 500.0);
        let (s_t, herkomst) = korf_met_beugels().leg_spacing_mm(&rechthoek).unwrap();
        assert_relative_eq!(s_t, 232.0);
        assert_eq!(herkomst, LegSpacingSource::DerivedTwoLeg);

        let t = ConcreteSection::tee(400.0, 50.0, 200.0, 450.0).unwrap();
        let (s_t_t, _) = korf_met_beugels().leg_spacing_mm(&t).unwrap();
        assert_relative_eq!(s_t_t, 132.0);

        // Opgegeven gaat vóór afgeleid.
        let opgegeven =
            ReinforcementCage { stirrup_leg_spacing_mm: Some(180.0), ..korf_met_beugels() };
        assert_eq!(opgegeven.leg_spacing_mm(&rechthoek), Some((180.0, LegSpacingSource::Given)));

        // Vier benen: de verdeling over de breedte is een ontwerpkeuze, dus er
        // wordt niets afgeleid.
        let vier = ReinforcementCage { stirrup_legs: Some(4), ..korf_met_beugels() };
        assert_eq!(vier.leg_spacing_mm(&rechthoek), None);
    }

    /// De meetkundige controles op de nieuwe velden. Geen normtoets — alleen
    /// of het opgegeven getal als maat kán bestaan.
    #[test]
    fn validatie_van_de_beugelgegevens() {
        let s = ConcreteSection::new(300.0, 500.0);
        assert!(korf_met_beugels().validate(&s).is_ok());

        // Nul is geen afstand; leeglaten is de manier om "niet opgegeven" te zeggen.
        let nul = ReinforcementCage { stirrup_spacing_mm: Some(0.0), ..korf() };
        assert!(nul.validate(&s).unwrap_err().contains("beugelafstand"));

        // Nul benen evenmin.
        let geen_benen = ReinforcementCage { stirrup_legs: Some(0), ..korf() };
        assert!(geen_benen.validate(&s).unwrap_err().contains("beugelbenen"));

        // Beugelgegevens zonder beugel is tegenstrijdig.
        let zonder_beugel = ReinforcementCage {
            stirrup_diameter_mm: 0.0,
            stirrup_spacing_mm: Some(150.0),
            ..korf()
        };
        assert!(zonder_beugel.validate(&s).unwrap_err().contains("beugeldiameter"));

        // s_t past hoogstens tussen de buitenste beenassen: 300 − 60 − 8 = 232 mm.
        let precies = ReinforcementCage { stirrup_leg_spacing_mm: Some(232.0), ..korf() };
        assert!(precies.validate(&s).is_ok());
        let teveel = ReinforcementCage { stirrup_leg_spacing_mm: Some(233.0), ..korf() };
        assert!(teveel.validate(&s).unwrap_err().contains("232"));
    }

    /// De samenvattingsregel groeit alleen mee als er iets te melden is; een
    /// korf zonder beugelafstand mag niet als een korf mét gaan lezen.
    #[test]
    fn samenvatting_noemt_de_beugelgegevens_alleen_als_ze_er_zijn() {
        assert_eq!(korf().summary(), "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm");
        assert_eq!(
            korf_met_beugels().summary(),
            "onder 3Ø16, boven 2Ø12, beugel Ø8 h.o.h. 150 mm, 2-benig, dekking 30 mm"
        );
        let alleen_benen = ReinforcementCage { stirrup_legs: Some(4), ..korf() };
        assert_eq!(
            alleen_benen.summary(),
            "onder 3Ø16, boven 2Ø12, beugel Ø8, 4-benig, dekking 30 mm"
        );
    }

    /// De vastgelegde hoek reist als tekst mee; hij zit niet stilzwijgend in
    /// een formule (§9.2.2(1) laat 45°–90° toe, dit model rekent 90°).
    #[test]
    fn de_vaste_hoek_staat_in_de_aannamen() {
        let a = korf().assumptions();
        assert_eq!(a.len(), 1);
        assert!(a[0].contains("90°"), "kreeg: {}", a[0]);
        assert!(a[0].contains("9.2.2(1)"), "kreeg: {}", a[0]);

        // Geen beugel: dan valt er over de beugelhoek niets te melden.
        let zonder = ReinforcementCage { stirrup_diameter_mm: 0.0, ..korf() };
        assert!(zonder.assumptions().is_empty());

        // Een eigen beugelkwaliteit is óók een gegeven dat zichtbaar hoort te zijn.
        let eigen = ReinforcementCage { stirrup_fywk_mpa: Some(500.0), ..korf() };
        assert_eq!(eigen.assumptions().len(), 2);
        assert!(eigen.assumptions()[1].contains("f_ywk"));
    }

    /// Bestaande projectbestanden blijven laden: een korf zonder de nieuwe
    /// velden komt binnen als "niet opgegeven", niet als nul.
    #[test]
    fn oude_korf_zonder_beugelgegevens_laadt_nog() {
        let j = r#"{"cover_mm": 30, "stirrup_diameter_mm": 8,
                    "top": {"count": 2, "diameter_mm": 12},
                    "bottom": {"count": 3, "diameter_mm": 16}}"#;
        let k: ReinforcementCage = serde_json::from_str(j).unwrap();
        assert_eq!(k, korf());
        assert_eq!(k.stirrup_spacing_mm, None);
        assert_eq!(k.stirrup_legs, None);
        assert_eq!(k.stirrup_leg_spacing_mm, None);
        assert_eq!(k.stirrup_fywk_mpa, None);
        assert!(k.shear_reinforcement().is_err());

        // Mét de nieuwe velden leest hij ze wél.
        let j2 = r#"{"cover_mm": 30, "stirrup_diameter_mm": 8,
                     "top": {"count": 2, "diameter_mm": 12},
                     "bottom": {"count": 3, "diameter_mm": 16},
                     "stirrup_spacing_mm": 150, "stirrup_legs": 2}"#;
        let k2: ReinforcementCage = serde_json::from_str(j2).unwrap();
        assert_eq!(k2, korf_met_beugels());

        // En een tikfout blijft een fout — `deny_unknown_fields` geldt nog.
        let fout = r#"{"cover_mm": 30, "stirrup_diameter_mm": 8,
                       "top": {"count": 2, "diameter_mm": 12},
                       "bottom": {"count": 3, "diameter_mm": 16},
                       "stirrup_spacing": 150}"#;
        assert!(serde_json::from_str::<ReinforcementCage>(fout).is_err());
    }
}
