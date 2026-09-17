//! De rapportdatum voluit, in de taal van het rapport (issue #20).
//!
//! WAAROM EEN EIGEN MODULE. Het titelblad en de kop van elke pagina noemen
//! dezelfde datum. Stond hij op de ene plek als "2026-09-16" en op de andere
//! als "16 september 2026", dan leest de lezer twee notaties voor één gegeven.
//! Beide plekken roepen daarom [`datum_voluit`] aan; de maandnamen staan
//! uitsluitend hier.
//!
//! DEZELFDE NOTATIE ALS HET LIVE RAPPORT. Het scherm formatteert met
//! `Intl.DateTimeFormat` (`design-mockup/src/lib/rapportDatum.ts`, met
//! `day: "numeric", month: "long", year: "numeric"`). De vormen hieronder zijn
//! die van dat formaat per taal — Engels in de volgorde "September 16, 2026",
//! Duits met een punt na de dag. Dat scherm en papier gelijk blijven, bewaakt
//! één gedeelde proeftabel die zowel `tests/datum_kop_pdf.rs` als
//! `design-mockup/test-rapport-datum.mjs` leest
//! (`tests/data/datumnotatie.json`).
//!
//! WAT NIET TE LEZEN IS, BLIJFT STAAN. Alleen een kalenderdatum in de vorm
//! `JJJJ-MM-DD` (wat het datumveld van de projectgegevens oplevert) wordt
//! omgezet. Iets anders — een vrij ingetikte tekst, een dag die niet bestaat —
//! gaat woordelijk door: de gebruiker heeft het zo ingevuld, en een verzonnen
//! datum op het rapport is erger dan een ongewone notatie.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// De taal waarin het rapport zijn datum noemt — de vier talen van de app.
///
/// Weglaten = Nederlands: de rest van de PDF-tekst is Nederlands, en zo bleef
/// een aanroep van vóór dit veld hetzelfde rapport opleveren. Een onbekende
/// code wordt bij het lezen GEWEIGERD (serde), niet stil vervangen.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum RapportTaal {
    #[default]
    Nl,
    En,
    De,
    Fr,
}

impl RapportTaal {
    /// Alle talen, in de volgorde van de taalkeuze in de app.
    pub const ALLE: [RapportTaal; 4] = [Self::Nl, Self::En, Self::De, Self::Fr];

    /// De code zoals hij in JSON en in de app staat ("nl", "en", "de", "fr").
    pub fn code(self) -> &'static str {
        match self {
            Self::Nl => "nl",
            Self::En => "en",
            Self::De => "de",
            Self::Fr => "fr",
        }
    }

    fn maanden(self) -> [&'static str; 12] {
        match self {
            Self::Nl => [
                "januari", "februari", "maart", "april", "mei", "juni", "juli",
                "augustus", "september", "oktober", "november", "december",
            ],
            Self::En => [
                "January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December",
            ],
            Self::De => [
                "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
                "August", "September", "Oktober", "November", "Dezember",
            ],
            Self::Fr => [
                "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
                "août", "septembre", "octobre", "novembre", "décembre",
            ],
        }
    }
}

/// `JJJJ-MM-DD` → (jaar, maand, dag), alleen als die dag in de kalender bestaat.
fn lees_iso(ruw: &str) -> Option<(u32, usize, u32)> {
    let b = ruw.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let cijfers = |r: std::ops::Range<usize>| -> Option<u32> {
        let deel = &ruw[r];
        if deel.bytes().all(|c| c.is_ascii_digit()) {
            deel.parse().ok()
        } else {
            None
        }
    };
    let jaar = cijfers(0..4)?;
    let maand = cijfers(5..7)?;
    let dag = cijfers(8..10)?;
    // Jaren onder 100 leest het live rapport niet als datum (`Date.UTC` maakt
    // er 19xx van); ze blijven hier dus ook woordelijk, anders zeggen scherm
    // en papier iets anders.
    if jaar < 100 || !(1..=12).contains(&maand) {
        return None;
    }
    let schrikkel = (jaar % 4 == 0 && jaar % 100 != 0) || jaar % 400 == 0;
    let dagen = match maand {
        2 if schrikkel => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    if dag == 0 || dag > dagen {
        return None;
    }
    Some((jaar, maand as usize, dag))
}

/// De datum voluit in `taal`: "16 september 2026", "September 16, 2026",
/// "16. September 2026", "16 septembre 2026".
///
/// Leeg blijft leeg; wat geen kalenderdatum `JJJJ-MM-DD` is, komt woordelijk
/// terug (zie de moduletekst).
pub fn datum_voluit(ruw: &str, taal: RapportTaal) -> String {
    let Some((jaar, maand, dag)) = lees_iso(ruw) else {
        return ruw.to_string();
    };
    let naam = taal.maanden()[maand - 1];
    match taal {
        RapportTaal::Nl | RapportTaal::Fr => format!("{dag} {naam} {jaar}"),
        RapportTaal::En => format!("{naam} {dag}, {jaar}"),
        RapportTaal::De => format!("{dag}. {naam} {jaar}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alleen_een_bestaande_kalenderdatum_wordt_omgezet() {
        assert_eq!(datum_voluit("2024-02-29", RapportTaal::Nl), "29 februari 2024");
        for ruw in ["2026-02-29", "2026-13-01", "2026-00-10", "2026-09-31", "2026-9-16",
            "16-09-2026", "sept 2026", " 2026-09-16", "2026-09-16T10:00", ""]
        {
            assert_eq!(datum_voluit(ruw, RapportTaal::De), ruw, "{ruw:?} hoort woordelijk te blijven");
        }
    }

    #[test]
    fn de_codes_zijn_die_van_de_app() {
        for taal in RapportTaal::ALLE {
            let json = serde_json::to_string(&taal).unwrap();
            assert_eq!(json, format!("\"{}\"", taal.code()));
        }
        assert!(serde_json::from_str::<RapportTaal>("\"es\"").is_err());
    }
}
