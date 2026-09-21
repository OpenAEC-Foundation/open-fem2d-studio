//! `plaat-check` — normtoetsing van platen (wandschijven, belast in het vlak).
//!
//! # Wat deze kern doet
//!
//! De app rekent een wandschijf door met driehoeks- en vierhoekselementen en
//! levert per UGT-combinatie de elementgemiddelde spanningen σx, σy en τxy.
//! Deze kern toetst die spanningen per element aan de norm van het materiaal
//! van de plaat, en levert:
//!
//! * per element de hoogste unity check over de combinaties (het canvas kleurt
//!   daarmee elk element);
//! * per combinatie het maatgevende element;
//! * per toets de volledige afleiding op het maatgevende punt, in hetzelfde
//!   `NamedCheck`-contract als de staaftoetsen;
//! * uitdrukkelijk wat NIET getoetst is, met reden.
//!
//! # Per materiaal
//!
//! * **Staal** — het vloeicriterium van NEN-EN 1993-1-1 6.2.1(5), zie
//!   [`staal`]. Optioneel de begrensde plaatplooitoets volgens §10 van EN 1993-1-5.
//! * **Hout** (massief en gelijmd gelamineerd) — NEN-EN 1995-1-1 6.1.2, 6.1.4,
//!   6.1.5, 6.1.7 en 6.2.2 in de materiaalassen, zie [`hout`]. Trek loodrecht
//!   op de vezel (6.1.3) niet: daar geeft de norm geen uitdrukking voor.
//! * **Kruislaaghout** — geweigerd: geen normgrondslag op schijf.
//! * **Beton** — de benodigde wapening in het vlak volgens NEN-EN 1992-1-1
//!   bijlage F en de betondrukdiagonaal (6.55)/(6.56), zie [`beton`]. De
//!   aanwezige wapening wordt bij opgave vergeleken met die eis, met aanvullende
//!   wanddetaillering en begrensde scheurcontroles (§9.6 en §7.3).
//! * Elk ander materiaal wordt GEWEIGERD met reden: er komt geen UC uit die
//!   als "voldoet" kan lezen.
//!
//! # Drie wegen
//!
//! `check_all_plates` is de enige instap. Het Tauri-command `check_plates`, de
//! toetsbrug-opdracht van die naam, het MCP-gereedschap `check_plates` en de
//! plaattoets binnen `check_fem_model` roepen allemaal deze functie aan.

pub mod beton;
pub mod hout;
pub mod input;
pub mod latex;
pub mod result;
pub mod staal;
pub mod staal_plooi;
mod verzamel;
mod wand;

pub use input::{
    PlaatCombinatie, PlaatElementSpanning, PlaatMateriaalSoort, PlaatWapeningInvoer,
    PlaatWapeningLaag, PlaatWapeningRichting, PlateCheckInput,
};
pub use result::{
    PlaatCombinatieUitkomst, PlaatElementUitkomst, PlaatNietGetoetst, PlaatWapening,
    PlaatWapeningElement, PlateCheckResult,
};

use nen_en_1993_1_1_section::CheckStatus;

/// Het toets-id van het vloeicriterium van staal.
pub const VLOEI_ID: &str = "6.2.1_von_mises";

/// De reden waarom een plaat van kruislaaghout NIET getoetst wordt.
///
/// Er is geen normgrondslag: NEN-EN 1995-1-1 kent kruislaaghout niet als
/// product en geeft voor een gekruiste opbouw belast in het vlak geen sterkte
/// en geen toetsregel. Die komen uit de productnorm of een ETA van het product
/// — en de plaatinvoer heeft geen veld om zo'n bron met haar sterkten en
/// toetsregels op te geven. De G₁₂-bron van de plaat (`cltG12Bron`) gaat alleen
/// over de STIJFHEID in de schijfberekening, niet over de sterkte. Liever een
/// weigering met deze reden dan een toets met aangenomen regels.
///
/// Publiek zodat paneel-, rapport- en PDF-tests de zin kunnen terugzoeken.
pub const REDEN_KRUISLAAGHOUT: &str =
    "kruislaaghout als plaat wordt niet getoetst: NEN-EN 1995-1-1 kent kruislaaghout niet als \
     product en geeft geen sterkte of toetsregel voor een gekruiste opbouw belast in het vlak, \
     dus er is geen normgrondslag. Een toets vraagt de productnorm of een technische goedkeuring \
     (ETA) van het product met die sterkten en regels; die staat niet op schijf, en de \
     plaatinvoer heeft geen invoerveld om zo'n bron op te geven (de G12-bron van de plaat geldt \
     alleen voor de stijfheid in de berekening, niet voor de sterkte). Er is niet getoetst; de \
     plaat heet daarom niet \"voldoet\".";

/// Toets een lijst platen, in de volgorde van de invoer.
pub fn check_all_plates(inputs: Vec<PlateCheckInput>) -> Vec<PlateCheckResult> {
    inputs.iter().map(check_plate).collect()
}

/// Toets één plaat.
pub fn check_plate(input: &PlateCheckInput) -> PlateCheckResult {
    if input.plooi.is_some() && input.soort != PlaatMateriaalSoort::Staal {
        return geweigerd(input, "plaatplooi volgens NEN-EN 1993-1-5 is alleen beschikbaar voor staal".into());
    }
    if !(input.thickness_mm.is_finite() && input.thickness_mm > 0.0) {
        return geweigerd(
            input,
            format!(
                "de plaatdikte is {} mm — een toets vraagt een positieve dikte; er is niet getoetst",
                input.thickness_mm
            ),
        );
    }
    for c in &input.combinations {
        for e in &c.elements {
            if !(e.sigma_x_mpa.is_finite() && e.sigma_y_mpa.is_finite() && e.tau_xy_mpa.is_finite())
            {
                return geweigerd(
                    input,
                    format!(
                        "element {} in combinatie {} heeft een spanning die geen getal is; er is \
                         niet getoetst",
                        e.element_id, c.combination_id
                    ),
                );
            }
        }
    }
    if input.soort != PlaatMateriaalSoort::Beton
        && (input.wapening_aanwezig.is_some() || !input.frequente_combinaties.is_empty())
    {
        return geweigerd(
            input,
            "aanwezige wapening en frequente BGT-combinaties horen alleen bij een betonplaat; bij \
             dit materiaal worden zij geweigerd in plaats van stil genegeerd, en er is niet getoetst"
                .to_string(),
        );
    }
    match input.soort {
        PlaatMateriaalSoort::Staal => staal::toets(input),
        PlaatMateriaalSoort::Hout => hout::toets(input),
        PlaatMateriaalSoort::Kruislaaghout => geweigerd(input, REDEN_KRUISLAAGHOUT.to_string()),
        PlaatMateriaalSoort::Beton => {
            if let Err(reden) = wand::valideer(input) {
                return geweigerd(input, reden);
            }
            let mut resultaat = beton::toets(input);
            if resultaat.geweigerd.is_none() && input.wapening_aanwezig.is_some() {
                wand::vul_aan(input, &mut resultaat);
            }
            resultaat
        }
        PlaatMateriaalSoort::Vrij => geweigerd(
            input,
            format!(
                "vrij materiaal \"{}\" hoort bij geen norm; voor een plaat bestaat geen \
                 normtoets en er is niet getoetst",
                input.materiaal
            ),
        ),
    }
}

/// Een resultaat zonder toets, met de reden. `uc_max` 0 en `NotApplicable`:
/// lees `geweigerd`, niet de UC.
pub(crate) fn geweigerd(input: &PlateCheckInput, reden: String) -> PlateCheckResult {
    PlateCheckResult {
        plate_id: input.plate_id,
        soort: input.soort,
        materiaal: input.materiaal.clone(),
        thickness_mm: input.thickness_mm,
        norm: String::new(),
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::NotApplicable,
        governing_check_id: String::new(),
        governing_element_id: None,
        governing_combination_id: None,
        combinaties: vec![],
        elementen: vec![],
        niet_getoetst: vec![],
        geweigerd: Some(reden),
        wapening: None,
        notes: input.notities.clone(),
    }
}

/// De status van een getoetste plaat: `NotOk` zodra een uitgevoerde toets
/// boven 1 komt; anders `NotApplicable` als er iets dat werkelijk aanwezig is
/// niet getoetst kon worden; anders `Ok`.
pub(crate) fn status_uit(uc_max: f64, niet_getoetst: &[PlaatNietGetoetst]) -> CheckStatus {
    if uc_max > 1.0 {
        CheckStatus::NotOk
    } else if niet_getoetst.iter().any(|n| n.bepaalt_status) {
        CheckStatus::NotApplicable
    } else {
        CheckStatus::Ok
    }
}
