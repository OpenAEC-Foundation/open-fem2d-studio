//! k_mod per belastingduurklasse — NEN-EN 1995-1-1 3.1.3(2).
//!
//! WAAROM DIT BESTAAT
//! Tot september 2026 rekende de houtkern met één belastingduurklasse voor de
//! hele UGT-omhullende (`load_duration` op de staaf, in de app standaard
//! "middellang"). 3.1.3(2) zegt iets anders: bij een combinatie van belastingen
//! uit verschillende duurklassen hoort k_mod bij de KORTSTE belastingsduur in
//! DIE combinatie. Eén klasse voor alle combinaties is daarmee in twee
//! richtingen fout:
//!
//! - te gunstig: de combinatie met alleen de blijvende belasting (1,35·G) hoort
//!   k_mod 0,60 te krijgen en kreeg 0,80. Gemeten (basisaudit nr 18): GL24h
//!   160×400, L = 3,5 m, alleen G: buiging UC 0,801 waar 1,068 hoort;
//! - te streng: een combinatie met sneeuw of wind leidend hoort k_mod 0,90 te
//!   krijgen en kreeg 0,80 (basisaudit nr 15: G = 4, S = 3 gaf 0,472 waar
//!   0,420 hoort).
//!
//! DE AANPAK
//! De aanroeper (de invoerbouwer, die de belastinggevallen kent) levert per
//! UGT-combinatie haar duurklasse mee, met de basis waarop die is bepaald. De
//! kern groepeert de punten van de omhullende per duurklasse en draait de
//! bestaande toetsketen per aanwezige klasse, met de k_mod van die klasse. Per
//! toets telt de hoogste unity check. Groeperen per KLASSE en niet per
//! combinatie is genoeg: k_mod hangt alleen van de klasse en de klimaatklasse
//! af (tabel 3.1), dus combinaties van dezelfde klasse delen hun rekenwaarden.
//! Binnen een klasse blijft de keuze van het maatgevende krachtpunt dezelfde
//! als voorheen (grootste kracht), en de stabiliteitstoetsen rekenen met het
//! buigpunt van dezelfde klasse, net als de enkele keten dat deed.
//!
//! Een lege lijst betekent: precies het oude gedrag, met `load_duration` voor
//! alle combinaties.

use mechanics::ForcePoint;
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// De belastingduurklasse van één UGT-combinatie, zoals de invoerbouwer haar
/// uit de belastinggevallen afleidde.
///
/// `deny_unknown_fields` om dezelfde reden als [`crate::TimberBeamCheckInput`]:
/// een tikfout in `load_duration` zou anders stil op de terugval vallen.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct CombinationLoadDuration {
    /// Het id van de UGT-combinatie, gelijk aan `ForcePoint::combination_id`.
    pub combination_id: u32,
    /// De kortste belastingsduur in deze combinatie (3.1.3(2)).
    pub load_duration: LoadDurationClass,
    /// Waarop de klasse berust, leesbaar voor het rapport — bijvoorbeeld
    /// "kortste: geval 4 Wind (W), kort (NB tabel 2.2: sneeuw en wind)".
    /// Weglaten mag; het rapport noemt dan alleen de klasse.
    #[serde(default)]
    #[ts(as = "Option<String>", optional)]
    pub basis: String,
}

/// k_mod van één belastingduurklasse, met de combinaties die erbij horen.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct KmodPerLoadDuration {
    pub load_duration: LoadDurationClass,
    /// k_mod uit tabel 3.1 voor deze klasse en de klimaatklasse van de staaf.
    pub k_mod: f64,
    /// De UGT-combinaties in deze klasse, oplopend.
    pub combination_ids: Vec<u32>,
    /// Per combinatie de basis van de klasse ("combinatie 4: kortste: …").
    #[serde(default)]
    pub bases: Vec<String>,
}

/// De Nederlandse naam van een klasse, dezelfde woorden als het rapport.
pub fn duurklasse_naam(d: LoadDurationClass) -> &'static str {
    match d {
        LoadDurationClass::Permanent => "blijvend",
        LoadDurationClass::LongTerm => "lang",
        LoadDurationClass::MediumTerm => "middellang",
        LoadDurationClass::ShortTerm => "kort",
        LoadDurationClass::Instantaneous => "zeer kort",
    }
}

/// Rangorde van lang naar kort: 0 = blijvend … 4 = zeer kort. Een LANGERE
/// klasse geeft een lagere k_mod en is dus de veilige kant.
pub fn rangorde(d: LoadDurationClass) -> u8 {
    match d {
        LoadDurationClass::Permanent => 0,
        LoadDurationClass::LongTerm => 1,
        LoadDurationClass::MediumTerm => 2,
        LoadDurationClass::ShortTerm => 3,
        LoadDurationClass::Instantaneous => 4,
    }
}

fn klimaatklasse_naam(s: ServiceClass) -> &'static str {
    match s {
        ServiceClass::Sc1 => "1",
        ServiceClass::Sc2 => "2",
        ServiceClass::Sc3 => "3",
    }
}

/// Getal met een decimale komma, zoals het rapport getallen toont.
pub(crate) fn nl(x: f64, cijfers: usize) -> String {
    format!("{x:.cijfers$}").replace('.', ",")
}

/// De punten van de omhullende die bij één belastingduurklasse horen.
#[derive(Clone, Debug)]
pub(crate) struct Groep {
    pub duur: LoadDurationClass,
    pub punten: Vec<ForcePoint>,
    pub combinaties: Vec<u32>,
    pub bases: Vec<String>,
}

/// Verdeel de omhullende over de belastingduurklassen, van lang naar kort.
///
/// `None` bij een lege lijst: dan geldt het oude gedrag en groepeert de kern
/// niets. Een punt waarvan de combinatie niet in de lijst staat, valt op
/// `terugval` (`load_duration` van de staaf) en dat staat in de basis — het
/// verdwijnt niet en krijgt geen verzonnen klasse. Staat een combinatie twee
/// keer in de lijst met verschillende klassen, dan telt de LANGSTE: dat is de
/// kant met de laagste k_mod.
pub(crate) fn groepeer(
    omhullende: &[ForcePoint],
    lijst: &[CombinationLoadDuration],
    terugval: LoadDurationClass,
) -> Option<Vec<Groep>> {
    if lijst.is_empty() {
        return None;
    }
    let klasse_van = |id: u32| -> (LoadDurationClass, String) {
        let mut gevonden: Option<&CombinationLoadDuration> = None;
        for c in lijst.iter().filter(|c| c.combination_id == id) {
            gevonden = match gevonden {
                Some(g) if rangorde(g.load_duration) <= rangorde(c.load_duration) => Some(g),
                _ => Some(c),
            };
        }
        match gevonden {
            Some(c) => (c.load_duration, c.basis.clone()),
            None => (
                terugval,
                format!(
                    "niet in de lijst met belastingduur per combinatie; terugval op de \
                     belastingduur van de staaf ({})",
                    duurklasse_naam(terugval)
                ),
            ),
        }
    };

    let mut groepen: Vec<Groep> = Vec::new();
    for p in omhullende {
        let (duur, basis) = klasse_van(p.combination_id);
        let idx = match groepen.iter().position(|g| g.duur == duur) {
            Some(i) => i,
            None => {
                groepen.push(Groep { duur, punten: Vec::new(), combinaties: Vec::new(), bases: Vec::new() });
                groepen.len() - 1
            }
        };
        let g = &mut groepen[idx];
        g.punten.push(*p);
        if !g.combinaties.contains(&p.combination_id) {
            g.combinaties.push(p.combination_id);
            g.bases.push(if basis.is_empty() {
                format!("combinatie {}", p.combination_id)
            } else {
                format!("combinatie {}: {basis}", p.combination_id)
            });
        }
    }
    for g in &mut groepen {
        let mut paren: Vec<(u32, String)> =
            g.combinaties.iter().copied().zip(g.bases.iter().cloned()).collect();
        paren.sort_by_key(|(id, _)| *id);
        g.combinaties = paren.iter().map(|(id, _)| *id).collect();
        g.bases = paren.into_iter().map(|(_, b)| b).collect();
    }
    groepen.sort_by_key(|g| rangorde(g.duur));
    Some(groepen)
}

fn lijst_ids(ids: &[u32]) -> String {
    ids.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(", ")
}

/// Wat één toets in één klasse opleverde, voor de notitie bij de maatgevende.
pub(crate) struct KlasseUc {
    pub duur: LoadDurationClass,
    pub k_mod: f64,
    pub combinaties: Vec<u32>,
    /// `None` = de toets is in deze klasse niet van toepassing (bijvoorbeeld
    /// kolomknik zonder drukkracht) of heeft geen unity check. Dat is iets
    /// anders dan UC 0,00, en de notitie zegt het ook zo.
    pub uc: Option<f64>,
}

/// De notitie bij een toets die van k_mod afhangt: welke k_mod, waarom, uit
/// welke combinaties, en wat dezelfde toets in de andere klassen gaf.
pub(crate) fn kmod_notitie(
    service: ServiceClass,
    gekozen: &KlasseUc,
    maatgevende_combinatie: u32,
    andere: &[KlasseUc],
) -> String {
    let mut tekst = format!(
        "k_mod = {} volgens tabel 3.1 (klimaatklasse {}, belastingduurklasse {}). \
         EN 1995-1-1 3.1.3(2): de kortstdurende belasting in een combinatie bepaalt k_mod; \
         de UGT-combinaties zijn daarom per belastingduurklasse getoetst en deze regel is {}. \
         Klasse {} omvat combinatie {}; het maatgevende krachtpunt komt uit combinatie {}.",
        nl(gekozen.k_mod, 2),
        klimaatklasse_naam(service),
        duurklasse_naam(gekozen.duur),
        if gekozen.uc.is_some() {
            "de zwaarste uitkomst"
        } else {
            "ter informatie getoond (de toets is in geen enkele klasse van toepassing)"
        },
        duurklasse_naam(gekozen.duur),
        lijst_ids(&gekozen.combinaties),
        maatgevende_combinatie,
    );
    if !andere.is_empty() {
        let delen: Vec<String> = andere
            .iter()
            .map(|a| {
                format!(
                    "{} (k_mod {}; combinatie {}) {}",
                    duurklasse_naam(a.duur),
                    nl(a.k_mod, 2),
                    lijst_ids(&a.combinaties),
                    match a.uc {
                        Some(uc) => format!("UC {}", nl(uc, 3)),
                        None => "niet van toepassing".to_string(),
                    }
                )
            })
            .collect();
        tekst.push_str(&format!(
            " Dezelfde toets in de andere klassen: {}.",
            delen.join("; ")
        ));
    }
    tekst
}

#[cfg(test)]
mod tests {
    use super::*;
    use mechanics::InternalForces;

    fn p(id: u32, my: f64) -> ForcePoint {
        ForcePoint { combination_id: id, position_mm: 0.0, forces: InternalForces { my_ed: my, ..Default::default() } }
    }

    fn c(id: u32, d: LoadDurationClass) -> CombinationLoadDuration {
        CombinationLoadDuration { combination_id: id, load_duration: d, basis: format!("b{id}") }
    }

    #[test]
    fn lege_lijst_groepeert_niets() {
        assert!(groepeer(&[p(1, 1.0)], &[], LoadDurationClass::MediumTerm).is_none());
    }

    #[test]
    fn groepen_van_lang_naar_kort_met_terugval_zichtbaar() {
        let env = [p(4, 1.0), p(1, 2.0), p(4, 3.0), p(9, 4.0), p(2, 5.0)];
        let lijst = [
            c(1, LoadDurationClass::Permanent),
            c(2, LoadDurationClass::MediumTerm),
            c(4, LoadDurationClass::ShortTerm),
        ];
        let g = groepeer(&env, &lijst, LoadDurationClass::LongTerm).unwrap();
        let duren: Vec<_> = g.iter().map(|x| x.duur).collect();
        assert_eq!(
            duren,
            vec![
                LoadDurationClass::Permanent,
                LoadDurationClass::LongTerm,
                LoadDurationClass::MediumTerm,
                LoadDurationClass::ShortTerm
            ]
        );
        assert_eq!(g[3].punten.len(), 2);
        assert_eq!(g[3].combinaties, vec![4]);
        assert_eq!(g[1].combinaties, vec![9]);
        assert!(g[1].bases[0].contains("terugval"), "{}", g[1].bases[0]);
        assert_eq!(g[0].bases[0], "combinatie 1: b1");
    }

    #[test]
    fn dubbel_genoemde_combinatie_krijgt_de_langste_klasse() {
        let lijst = [c(3, LoadDurationClass::ShortTerm), c(3, LoadDurationClass::Permanent)];
        let g = groepeer(&[p(3, 1.0)], &lijst, LoadDurationClass::MediumTerm).unwrap();
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].duur, LoadDurationClass::Permanent);
    }
}
