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

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// De vorm van de doorsnede — het **etiket**, voor het rapport en de
/// meldingen. De rekengang vertakt hier niet op; die kijkt naar
/// [`ConcreteSection::bands`].
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
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
                "{} {} x {} (flens {} x {}, lijf {})",
                if self.shape == ConcreteShape::Tee { "T" } else { "L" },
                fmt_mm(self.b_mm),
                fmt_mm(self.h_mm),
                fmt_mm(self.b_mm),
                fmt_mm(self.h_f_mm()),
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

/// Eén rij hoofdwapening: aantal staven en diameter.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
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

/// Wapeningskorf: dekking, beugel, boven- en onderwapening.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
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

    /// "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm".
    pub fn summary(&self) -> String {
        let beugel = if self.stirrup_diameter_mm > 0.0 {
            format!("beugel Ø{}", fmt_mm(self.stirrup_diameter_mm))
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
}
