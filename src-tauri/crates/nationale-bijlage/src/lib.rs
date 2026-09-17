//! `nationale-bijlage` — de NORMNAAD.
//!
//! # Waarvoor deze crate bestaat
//!
//! Een Eurocode laat een aantal getallen en werkwijzen uitdrukkelijk aan het
//! land over: de **nationaal bepaalde parameters** (NDP's). Tot september 2026
//! stonden die in deze werkruimte als losse `const`-regels en `match`-armen
//! verspreid over zeven normcrates. Dat werkte zolang er één land was, maar het
//! had twee gebreken:
//!
//! 1. nergens stond bij elkaar WELKE waarden nationaal bepaald zijn — wie een
//!    tweede bijlage wilde invullen moest ze uit de bronbestanden bij elkaar
//!    zoeken, en een vergeten waarde viel stil terug op de Nederlandse;
//! 2. de app droeg wel een veld `projectInfo.nationaleBijlage`, maar niemand
//!    las het. De keuze bestond alleen op papier.
//!
//! Deze crate is de plek waar meerdere nationale bijlagen naast elkaar kunnen
//! bestaan. Eén rij is gevuld — de Nederlandse. Elke andere bijlage wordt
//! GEWEIGERD met reden; er is geen stille terugval op de Nederlandse waarden.
//!
//! # Hoe de naad niet stil kan lekken
//!
//! Twee grendels, en ze werken op verschillende momenten:
//!
//! * **Bij het lezen van JSON** — [`NationaleBijlage`] heeft een eigen
//!   `Deserialize` die elke andere code weigert met de melding
//!   *"nationale bijlage \"XX\" is niet gevuld"*. Dat geldt langs alle drie de
//!   wegen tegelijk (Tauri-command, toetsbrug, MCP), want alle drie lezen
//!   dezelfde invoertypen.
//! * **Bij het vertalen** — elke `voor(...)`-functie hieronder is een
//!   UITPUTTENDE `match` over [`NationaleBijlage`]. Wie een tweede variant aan
//!   de enum toevoegt zonder elke tabel te vullen, krijgt een compileerfout in
//!   plaats van Nederlandse getallen onder een buitenlandse vlag.
//!
//! # Wat hier NIET in staat
//!
//! Geen buitenlandse waarden. Op schijf (`normen/eurocodes/`) staan alleen de
//! NEN-uitgaven; een tweede rij zou dus verzonnen zijn. De naad is er, de rij
//! niet: dat is de afspraak.
//!
//! Ook niet: parameters die de Eurocode zelf vastlegt (k_mod van tabel 3.1,
//! k_def van tabel 3.2, λ en η van (3.19)–(3.22)). Die staan niet in de
//! NDP-lijst van het voorwoord en horen dus in hun eigen normcrate te blijven.
//! Wat hier staat is óf door de bijlage voorgeschreven, óf door de Eurocode aan
//! het land overgelaten.

use serde::{Deserialize, Deserializer, Serialize};
use ts_rs::TS;

pub mod aanduiding;
pub mod ndp_1990;
pub mod ndp_1992;
pub mod ndp_1993;
pub mod ndp_1995;

pub use aanduiding::{Aanduidingen, AANDUIDINGEN_NL};
pub use ndp_1990::{LoadFactors, Ndp1990, PsiFactors, NDP_1990_NL};
pub use ndp_1992::{Ndp1992, NDP_1992_NL};
pub use ndp_1993::{Kipmethode, Ndp1993, Ndp1993Las, NDP_1993_LAS_NL, NDP_1993_NL};
pub use ndp_1995::{Ndp1995, NDP_1995_NL};

/// De nationale bijlage waarmee gerekend wordt.
///
/// De waarde is de landcode volgens ISO 3166-1 alpha-2, zoals de Eurocodes hem
/// zelf gebruiken in aanduidingen als "NEN-EN 1993-1-1+A1:2014+NB:2016 nl".
///
/// # Waarom hier maar één variant staat
///
/// Een variant toevoegen betekent een rij vullen in [`Ndp1990`], [`Ndp1992`],
/// [`Ndp1993`], [`Ndp1993Las`], [`Ndp1995`] én [`Aanduidingen`]. Zolang de
/// normtekst van die bijlage niet te lezen is, zou dat verzinnen zijn. De naad
/// is er wél: alles wat de keuze door de keten draagt (projectbestand,
/// app-instelling, toetsinvoer, MCP-schema, toetsbrug) is op meer dan één
/// waarde gebouwd.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/norm/")]
pub enum NationaleBijlage {
    /// Nederland — NEN-EN met de Nederlandse nationale bijlage. De enige
    /// gevulde rij.
    #[default]
    NL,
}

/// De codes waarvan de NDP-rijen werkelijk gevuld zijn.
///
/// Deze lijst is de bron van de foutmelding én van de MCP-schema's. Hij bestaat
/// zodat "welke bijlagen kan deze uitgave" op precies één plaats staat.
pub const BIJLAGEN_GEVULD: &[&str] = &["NL"];

impl NationaleBijlage {
    /// De landcode, zoals hij in JSON en in het projectbestand staat.
    pub const fn code(self) -> &'static str {
        match self {
            NationaleBijlage::NL => "NL",
        }
    }

    /// De naam van het land, voor het rapport.
    pub const fn land(self) -> &'static str {
        match self {
            NationaleBijlage::NL => AANDUIDINGEN_NL.land,
        }
    }

    /// De bijlage bij een landcode, of een weigering met reden.
    ///
    /// GEEN terugval: een onbekende of niet-gevulde code levert een fout op en
    /// nooit de Nederlandse rij. Een stille uitkomst zou hier het ergst
    /// denkbare zijn — een project dat met Nederlandse partiële factoren rekent
    /// terwijl er een ander land op het omslag staat.
    pub fn uit_code(code: &str) -> Result<Self, String> {
        match code {
            "NL" => Ok(NationaleBijlage::NL),
            andere => Err(format!(
                "nationale bijlage \"{andere}\" is niet gevuld: deze uitgave kent alleen {}. \
                 Er wordt niet teruggevallen op een andere bijlage, want dan zou het rapport \
                 getallen dragen die niet bij de genoemde bijlage horen.",
                BIJLAGEN_GEVULD.join(", ")
            )),
        }
    }
}

/// Eigen `Deserialize` in plaats van de afgeleide, om één reden: de melding.
///
/// De afgeleide versie zegt `unknown variant "DE", expected "NL"` — Engels,
/// en het zegt niet dat er bewust niets is ingevuld. Langs alle drie de wegen
/// komt die tekst ongefilterd bij de gebruiker terecht. Met deze implementatie
/// staat er waar het aan ligt, in het Nederlands, met de reden erbij.
impl<'de> Deserialize<'de> for NationaleBijlage {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let code = String::deserialize(deserializer)?;
        NationaleBijlage::uit_code(&code).map_err(serde::de::Error::custom)
    }
}

impl std::fmt::Display for NationaleBijlage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.code())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// De weigering, woordelijk. Dit is de tekst die de gebruiker te zien
    /// krijgt; hij hoort te zeggen WAT er mis is en waarom er niet wordt
    /// teruggevallen.
    #[test]
    fn een_niet_gevulde_bijlage_wordt_geweigerd_met_reden() {
        let fout = NationaleBijlage::uit_code("DE").unwrap_err();
        assert!(fout.contains("nationale bijlage \"DE\" is niet gevuld"), "{fout}");
        assert!(fout.contains("NL"), "{fout}");
        // Een tikfout in de code is óók een weigering, geen stille NL.
        assert!(NationaleBijlage::uit_code("nl").is_err());
        assert!(NationaleBijlage::uit_code("").is_err());
        assert_eq!(NationaleBijlage::uit_code("NL"), Ok(NationaleBijlage::NL));
    }

    /// Dezelfde weigering langs de JSON-kant — dit is de weg die de
    /// toetsinvoer, de toetsbrug en de MCP-server werkelijk nemen.
    #[test]
    fn json_weigert_een_niet_gevulde_bijlage() {
        let fout = serde_json::from_str::<NationaleBijlage>("\"DE\"").unwrap_err().to_string();
        assert!(fout.contains("niet gevuld"), "{fout}");
        let goed: NationaleBijlage = serde_json::from_str("\"NL\"").unwrap();
        assert_eq!(goed, NationaleBijlage::NL);
        assert_eq!(serde_json::to_string(&goed).unwrap(), "\"NL\"");
    }

    /// De grendel op de `#[serde(default)]` die de toetsinvoertypen dragen.
    ///
    /// Zolang er één rij gevuld is, is "veld weggelaten" niet een keuze tussen
    /// bijlagen maar de enige mogelijke waarde; de default houdt dan oude
    /// projectbestanden en oude MCP-cliënten aan de praat. Zodra er een tweede
    /// rij bij komt is dat NIET meer waar: dan is een weggelaten veld een
    /// stilzwijgende keuze, en moeten de `#[serde(default)]`-regels op
    /// `BeamCheckInput`, `TimberBeamCheckInput`, `CltBeamCheckInput`,
    /// `ConcreteBeamCheckInput`, `ConcreteColumnCheckRequest`,
    /// `ConcreteCoverRequest`, `MnKappaRequest`, `SegmentStiffnessRequest`,
    /// `CreepCoefficientRequest`, `PlateCheckInput`, `ReportInput` en `LasInput` weg.
    /// Deze test valt dan om en zegt dat.
    #[test]
    fn zodra_er_een_tweede_bijlage_is_moet_de_serde_default_weg() {
        assert_eq!(
            BIJLAGEN_GEVULD.len(),
            1,
            "Er is een tweede nationale bijlage gevuld. Haal nu `#[serde(default)]` van het \
             veld `bijlage` in de toetsinvoertypen af: een weggelaten veld is vanaf dat moment \
             een stilzwijgende keuze in plaats van de enige mogelijke waarde."
        );
        assert_eq!(NationaleBijlage::default().code(), BIJLAGEN_GEVULD[0]);
    }

    /// Elke bijlage heeft elke rij. Deze test is er niet voor vandaag maar voor
    /// de dag dat er een variant bij komt: hij loopt langs alle tabellen.
    #[test]
    fn elke_bijlage_heeft_elke_ndp_rij() {
        for b in [NationaleBijlage::NL] {
            let _ = Ndp1990::voor(b);
            let _ = Ndp1992::voor(b);
            let _ = Ndp1993::voor(b);
            let _ = Ndp1993Las::voor(b);
            let _ = Ndp1995::voor(b);
            let _ = Aanduidingen::voor(b);
            assert!(!b.code().is_empty());
            assert!(!b.land().is_empty());
        }
    }
}
