//! `FiguurFlowable` — een rapportfiguur als volwaardig opmaakelement.
//!
//! Deze module begon als de betonkant en draagt sinds het houthoofdstuk ook de
//! opbouwfiguur van kruislaaghout. Dat is de bedoelde groei: [`Figuur`] is de
//! opsomming van álle figuren die het rapport kent, en [`Figuur::kader`] en
//! [`Figuur::teken`] gaan bij elke uitbreiding mee. De tekenfuncties zelf
//! blijven per materiaal in hun eigen module ([`crate::betonfiguren`],
//! [`crate::houtfiguren`]); hier staat alleen wat ze met de paginering te
//! maken hebben.
//!
//! # Waarom dit in `report` staat en niet in `openaec-layout`
//!
//! `openaec-layout` is de opmaakmotor en kent geen enkele norm: haar
//! `Cargo.toml` noemt alleen printpdf, ttf-parser, image, thiserror en
//! tracing. Een flowable die weet wat een [`MnKappaDiagram`] is, of wat de
//! verhouding van een M-κ-diagram hoort te zijn, zou `nen-en-1992-1-1` en
//! `concrete-check` de opmaakmotor in trekken en de laagverdeling omkeren:
//! de generieke motor zou dan van de Eurocode-kernen afhangen.
//!
//! Het alternatief — een generieke "teken zelf maar in dit vlak"-flowable met
//! een geboxte closure in `openaec-layout` — kost daar handwerk voor `Debug`
//! en `Send` en levert een abstractie op die vandaag precies één afnemer
//! heeft. Wat wél generiek is, is toegevoegd aan de motor zelf:
//! [`Flowable::keep_with_next`](openaec_layout::flowable::Flowable::keep_with_next),
//! want "een kop hoort bij wat eronder staat" is geen betonzaak.
//!
//! # Wat deze flowable in de paginering doet
//!
//! * Hij **splitst niet**. `Flowable::split` valt terug op `CannotSplit`, dus
//!   een figuur die niet meer past verhuist in zijn geheel naar het volgende
//!   vel; hij valt nooit half over een bladovergang.
//! * Hij houdt zijn **bijschrift bij zich**: dat zit ín de flowable en kan er
//!   dus niet van losraken.
//! * Hij houdt de **verhouding** van de schermfiguur aan. De tekenfuncties
//!   schalen alles — ook de lettergroottes — met het meegegeven vlak, dus een
//!   te smal of te laag vlak levert onleesbare labels op. Daarom wordt de
//!   breedte hier begrensd door zowel de kolombreedte als de opgegeven
//!   maximale hoogte, en houdt het vlak exact de kaderverhouding van de
//!   figuur: geen loze marge, en de figuur staat op schaal.

use openaec_layout::{
    draw::DrawList,
    flowable::{Flowable, LayoutContext},
    paragraph::{Paragraph, ParagraphStyle},
    types::{Pt, Rect, Size},
};

use concrete_check::segments::SegmentStiffnessResponse;
use nen_en_1992_1_1::mnkappa::{InteractionPoint, MnKappaDiagram};
use nen_en_1992_1_1::section::{ConcreteSection, ReinforcementCage};

use crate::betonfiguren::{
    doorsnede_kader, teken_doorsnede, teken_ei_verloop, teken_interactie, teken_mn_kappa,
    Figuurstijl, KADER_EI, KADER_INTERACTIE, KADER_MN_KAPPA,
};
use crate::houtfiguren::{clt_kader, teken_clt_opbouw, CltOpbouwFiguur, Houtstijl};

/// Welke figuur, met de gegevens die erbij horen.
///
/// Een enum en geen closure: een [`Flowable`] moet `Debug` en `Send` zijn, en
/// dat is een geboxte closure niet zonder handwerk. Bovendien is hiermee in
/// één oogopslag te zien wélke figuren het rapport kent.
#[derive(Clone, Debug)]
pub enum Figuur {
    /// De betondoorsnede met de wapeningskorf.
    Doorsnede {
        section: ConcreteSection,
        korf: ReinforcementCage,
    },
    /// Het M-κ-diagram bij vaste N, met de M_Ed-referentielijn.
    MnKappa {
        diagram: Option<MnKappaDiagram>,
        m_ed_knm: Option<f64>,
    },
    /// Het N-M-interactiediagram met het rekenpunt.
    Interactie {
        positief: Vec<InteractionPoint>,
        negatief: Vec<InteractionPoint>,
        n_ed_kn: Option<f64>,
        m_ed_knm: Option<f64>,
        m_rd_knm: Option<f64>,
    },
    /// Het EI-verloop langs één staaf, uit het segmentspoor.
    EiVerloop {
        respons: Box<SegmentStiffnessResponse>,
    },
    /// De opbouw van een kruislaaghout-doorsnede met het spanningsverloop.
    ///
    /// Geboxt omdat deze variant de lagen én twee spanningsverlopen draagt en
    /// daarmee veruit de grootste is; zonder box zou elke `Figuur` — ook een
    /// leeg M-κ-diagram — die omvang meedragen.
    CltOpbouw {
        opbouw: Box<CltOpbouwFiguur>,
    },
}

impl Figuur {
    /// De ontwerpmaat van deze figuur (breedte, hoogte) in de eenheden van de
    /// schermfiguur. Alleen de VERHOUDING telt.
    pub fn kader(&self) -> (f32, f32) {
        match self {
            Figuur::Doorsnede { section, .. } => doorsnede_kader(section),
            Figuur::MnKappa { .. } => KADER_MN_KAPPA,
            Figuur::Interactie { .. } => KADER_INTERACTIE,
            Figuur::EiVerloop { .. } => KADER_EI,
            Figuur::CltOpbouw { opbouw } => clt_kader(opbouw),
        }
    }

    /// Teken de figuur in `vlak`.
    pub fn teken(&self, dl: &mut DrawList, vlak: Rect, stijl: &Figuurstijl) {
        match self {
            Figuur::Doorsnede { section, korf } => {
                teken_doorsnede(dl, vlak, section, korf, stijl)
            }
            Figuur::MnKappa { diagram, m_ed_knm } => {
                teken_mn_kappa(dl, vlak, diagram.as_ref(), *m_ed_knm, stijl)
            }
            Figuur::Interactie {
                positief,
                negatief,
                n_ed_kn,
                m_ed_knm,
                m_rd_knm,
            } => teken_interactie(
                dl, vlak, positief, negatief, *n_ed_kn, *m_ed_knm, *m_rd_knm, stijl,
            ),
            Figuur::EiVerloop { respons } => teken_ei_verloop(dl, vlak, respons, stijl),
            // Het houtpalet komt NIET uit `Figuurstijl`: dat draagt de
            // betonkleuren, en houtvlak/arcering/dwarslaag hebben daar niets
            // mee te maken. Wat de twee wél delen is het lettertype, en dat
            // gaat hier over — één plaats waar het rapport zijn font doorgeeft.
            Figuur::CltOpbouw { opbouw } => {
                teken_clt_opbouw(dl, vlak, opbouw, &Houtstijl::met_font(&stijl.font))
            }
        }
    }
}

/// Eén betonfiguur met bijschrift, als opmaakelement.
#[derive(Debug)]
pub struct FiguurFlowable {
    figuur: Figuur,
    stijl: Figuurstijl,
    /// Bovengrens aan de hoogte van de figuur zelf (zonder bijschrift). Zonder
    /// die grens zou een liggende figuur op de volle kolombreedte een halve
    /// bladzijde vullen en een staande figuur (een hoge doorsnede) een hele.
    max_hoogte: Pt,
    /// Deel van de kolombreedte dat de figuur mag innemen (0 … 1).
    breedtefractie: f32,
    bijschrift: Option<Paragraph>,
    ruimte_boven: Pt,
    ruimte_onder: Pt,

    // ── berekend in `wrap` ──
    kolom_breedte: Pt,
    fig_breedte: Pt,
    fig_hoogte: Pt,
    bijschrift_hoogte: Pt,
    hoogte: Pt,
}

impl FiguurFlowable {
    /// Een figuur op de volle kolombreedte, hoogstens `max_hoogte` hoog.
    pub fn nieuw(figuur: Figuur, stijl: Figuurstijl, max_hoogte: Pt) -> Self {
        Self {
            figuur,
            stijl,
            max_hoogte,
            breedtefractie: 1.0,
            bijschrift: None,
            ruimte_boven: Pt(3.0),
            ruimte_onder: Pt(5.0),
            kolom_breedte: Pt::ZERO,
            fig_breedte: Pt::ZERO,
            fig_hoogte: Pt::ZERO,
            bijschrift_hoogte: Pt::ZERO,
            hoogte: Pt::ZERO,
        }
    }

    /// Laat de figuur maar een deel van de kolombreedte innemen (gecentreerd).
    pub fn met_breedtefractie(mut self, fractie: f32) -> Self {
        self.breedtefractie = fractie.clamp(0.05, 1.0);
        self
    }

    /// Het bijschrift onder de figuur. Het hoort bij de figuur en reist met
    /// hem mee over een bladovergang, want het zit in dezelfde flowable.
    pub fn met_bijschrift(mut self, tekst: impl Into<String>, stijl: ParagraphStyle) -> Self {
        self.bijschrift = Some(Paragraph::new(tekst, stijl));
        self
    }
}

impl Flowable for FiguurFlowable {
    fn wrap(&mut self, available_width: Pt, _available_height: Pt, ctx: &LayoutContext) -> Size {
        let (kw, kh) = self.figuur.kader();
        self.kolom_breedte = available_width;

        // Zowel de breedte als de hoogte begrenzen, mét behoud van de
        // verhouding. `available_height` doet bewust NIET mee: die hangt af van
        // wat er toevallig boven de figuur staat, en een figuur die per vel van
        // grootte verandert is geen figuur maar een verrassing.
        let breedte = (available_width.0 * self.breedtefractie).min(self.max_hoogte.0 * kw / kh);
        self.fig_breedte = Pt(breedte);
        self.fig_hoogte = Pt(breedte * kh / kw);

        self.bijschrift_hoogte = match self.bijschrift.as_mut() {
            Some(p) => p.wrap(available_width, Pt(f32::MAX), ctx).height,
            None => Pt::ZERO,
        };

        self.hoogte = Pt(self.ruimte_boven.0
            + self.fig_hoogte.0
            + self.bijschrift_hoogte.0
            + self.ruimte_onder.0);
        Size::new(available_width, self.hoogte)
    }

    fn draw(&self, x: Pt, y: Pt, draw_list: &mut DrawList) {
        let fig_x = Pt(x.0 + (self.kolom_breedte.0 - self.fig_breedte.0) / 2.0);
        let fig_y = Pt(y.0 + self.ruimte_boven.0);
        self.figuur.teken(
            draw_list,
            Rect::new(fig_x, fig_y, self.fig_breedte, self.fig_hoogte),
            &self.stijl,
        );
        if let Some(p) = &self.bijschrift {
            p.draw(x, Pt(fig_y.0 + self.fig_hoogte.0), draw_list);
        }
    }

    fn height(&self) -> Pt {
        self.hoogte
    }

    /// Een figuur splitst niet, dus "een beetje beginnen" bestaat niet: staat
    /// er een kop boven, dan moet de hele figuur mee. Zonder dit bleef de
    /// staafkop met zijn regel gegevens onderaan een vel achter en begon de
    /// figuur op het volgende — een halve bladzijde wit die je alleen op het
    /// gerenderde blad ziet.
    fn min_start_height(&self) -> Pt {
        self.hoogte
    }
}
