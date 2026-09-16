//! De normaanduidingen die in het rapport terechtkomen.
//!
//! # Waarom dit bij de normnaad hoort
//!
//! Welke UITGAVE van een Eurocode geldt, is onlosmakelijk verbonden met welke
//! nationale bijlage geldt: "NEN-EN 1993-1-1+C2+A1/NB:2016" is de Nederlandse
//! uitgave mét bijlage. Stond de aanduiding los van de bijlagekeuze, dan kon
//! een rapport een bijlage noemen en een uitgave tonen die daar niet bij hoort.
//!
//! # Waarom dit één plaats moest worden
//!
//! De aanduidingen stonden op acht plaatsen: drie constanten in
//! `report/src/lib.rs`, drie in `design-mockup/.../checkReportUtils.ts`, vier
//! i18n-kopieën (nl/en/de/fr) en een derde schrijfwijze in de crate-doc van
//! `nen-en-1995-1-1`. Hout en beton waren daardoor al uiteengelopen: één PDF
//! kon twee uitgaven van dezelfde norm noemen. De frontend leest deze rij nu
//! via `design-mockup/src/lib/normAanduidingen.ts`, dat door
//! `design-mockup/test-rapportnormen.mjs` tegen dit bestand wordt gelegd.
//!
//! # Twee velden per norm, met opzet
//!
//! Het omslag van het PDF-rapport noemt de uitgave MET taalaanduiding
//! ("… nl"), het toetsbasis-regeltje in het scherm ZONDER. Beide vormen staan
//! hier naast elkaar in dezelfde rij, zodat ze niet uit elkaar kunnen lopen —
//! in plaats van dat de ene plek de andere met tekstplakwerk nabouwt.

use crate::NationaleBijlage;

/// De normaanduidingen die bij één nationale bijlage horen.
#[derive(Clone, Copy, Debug)]
pub struct Aanduidingen {
    /// Het land, zoals het in de projectgegevens van het rapport staat.
    pub land: &'static str,
    /// Hoe de bijlage in lopende tekst heet ("de Nederlandse nationale
    /// bijlage").
    pub bijlage_naam: &'static str,
    /// Kort normlabel voor staal, voor tabelkolommen en de paginakop.
    pub norm_staal_kort: &'static str,
    /// Kort normlabel voor hout.
    pub norm_hout_kort: &'static str,
    /// Kort normlabel voor beton.
    pub norm_beton_kort: &'static str,
    /// Volledige aanduiding staal, zonder taalaanduiding.
    pub norm_staal_vol: &'static str,
    /// Volledige aanduiding hout, zonder taalaanduiding.
    ///
    /// Hier stond in de frontend "NEN-EN 1995-1-1+C1+A1:2011/NB:2013" — de
    /// aanduiding van de nationale bijlage alléén, en van vóór A2:2014.
    pub norm_hout_vol: &'static str,
    /// Volledige aanduiding beton, zonder taalaanduiding.
    pub norm_beton_vol: &'static str,
    /// Volledige aanduiding staal zoals het omslag van het PDF-rapport hem
    /// zet: met de taalaanduiding van de uitgave erachter.
    pub norm_staal_omslag: &'static str,
    /// Volledige aanduiding hout voor het omslag.
    pub norm_hout_omslag: &'static str,
    /// Volledige aanduiding beton voor het omslag.
    pub norm_beton_omslag: &'static str,
}

impl Aanduidingen {
    /// De rij van deze bijlage. Uitputtende `match`.
    pub const fn voor(bijlage: NationaleBijlage) -> Self {
        match bijlage {
            NationaleBijlage::NL => AANDUIDINGEN_NL,
        }
    }
}

/// De Nederlandse rij.
pub const AANDUIDINGEN_NL: Aanduidingen = Aanduidingen {
    land: "Nederland",
    bijlage_naam: "Nederlandse nationale bijlage",
    norm_staal_kort: "EN 1993-1-1",
    norm_hout_kort: "EN 1995-1-1",
    norm_beton_kort: "EN 1992-1-1",
    norm_staal_vol: "NEN-EN 1993-1-1+C2+A1/NB:2016",
    norm_hout_vol: "NEN-EN 1995-1-1:2005+A2:2014+NB:2013",
    norm_beton_vol: "NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020",
    norm_staal_omslag: "NEN-EN 1993-1-1+C2+A1/NB:2016 nl",
    norm_hout_omslag: "NEN-EN 1995-1-1:2005+A2:2014+NB:2013 nl",
    norm_beton_omslag: "NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020 nl",
};

#[cfg(test)]
mod tests {
    use super::*;

    /// De omslagvorm is de gewone vorm plus de taalaanduiding — niets anders.
    /// Zou iemand er twee verschillende uitgaven van maken, dan noemt het
    /// rapport op het omslag een andere norm dan in de toetsbasis.
    #[test]
    fn omslagvorm_is_de_gewone_vorm_plus_de_taal() {
        let a = Aanduidingen::voor(NationaleBijlage::NL);
        for (vol, omslag) in [
            (a.norm_staal_vol, a.norm_staal_omslag),
            (a.norm_hout_vol, a.norm_hout_omslag),
            (a.norm_beton_vol, a.norm_beton_omslag),
        ] {
            assert_eq!(omslag, format!("{vol} nl"), "omslagvorm van {vol}");
        }
    }

    #[test]
    fn nl_rij() {
        let a = Aanduidingen::voor(NationaleBijlage::NL);
        assert_eq!(a.land, "Nederland");
        assert_eq!(a.norm_staal_kort, "EN 1993-1-1");
        assert!(a.norm_hout_vol.contains("A2:2014"), "{}", a.norm_hout_vol);
    }
}
