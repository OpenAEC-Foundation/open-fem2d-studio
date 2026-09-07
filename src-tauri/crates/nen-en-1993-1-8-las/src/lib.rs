//! `nen-en-1993-1-8-las` — de toetsing van een **doorlopende langslas** in een
//! samengestelde doorsnede, volgens NEN-EN 1993-1-8:2006+C11:2016 met de
//! Nederlandse nationale bijlage NB:2011.
//!
//! # Waarvoor deze kern bestaat
//!
//! In een gelaste ligger dragen de lasnaden tussen lijf en flens de
//! langsschuifkracht over. Die kracht per strekkende millimeter volgt uit de
//! doorsnedegrootheden die er toch al zijn:
//!
//! ```text
//!   F_w,Ed = q(z) = V_z,Ed · S(z) / I_y            [N/mm]
//! ```
//!
//! met `S(z)` het statisch moment (om de neutrale lijn) van het deel van de
//! doorsnede dat door die ene naad wordt vastgehouden. De naad hoeft daarvoor
//! niet apart gemodelleerd te worden — hij hoort bij een snede door de
//! doorsnede, en de kracht die er doorheen gaat is die van Jourawski.
//!
//! **Deze kern rekent `q` NIET uit.** Dat is meetkunde van de doorsnede en
//! hoort bij de aanroeper (de profieleditor kent de bouwstenen en dus welk
//! deel er aan welke naad hangt). Wat hier staat is uitsluitend de normkant:
//! de correlatiefactor, de rekenwaarde van de schuifsterkte, de weerstand per
//! eenheidslengte en de unity check.
//!
//! # De normregels, letterlijk
//!
//! **4.5.3.3 — Vereenvoudigde methode voor de rekenwaarde van de weerstand van
//! hoeklassen.** In elk punt over de lengte moet de resultante van alle
//! krachten per eenheidslengte voldoen aan
//!
//! ```text
//!   F_w,Ed ≤ F_w,Rd                                             (4.2)
//!   F_w,Rd = f_vw,d · a                                          (4.3)
//!   f_vw,d = (f_u / √3) / (β_w · γ_M2)                           (4.4)
//! ```
//!
//! waarin `f_u` de nominale treksterkte is van het zwakste verbonden onderdeel
//! en `β_w` de correlatiefactor volgens **tabel 4.1**. `a` is de keeldikte van
//! één las; bij een dubbelzijdige hoeklas werken er twee keeldoorsneden mee en
//! is de weerstand per eenheidslengte dus `f_vw,d · 2a`.
//!
//! De vereenvoudigde methode van 4.5.3.3 is bewust gekozen boven de
//! gecombineerde-spanningenmethode van 4.5.3.2: bij een langslas is de kracht
//! zuivere langsschuif, en dan geven beide methoden hetzelfde, terwijl de
//! vereenvoudigde methode geen aanname over de oriëntatie van de keeldoorsnede
//! nodig heeft — "onafhankelijk van de oriëntatie van het vlak van de
//! keeldoorsnede met betrekking tot de aangrijpende kracht" (4.5.3.3(2)).
//!
//! **Partiële factor.** Tabel 2.1 wijst voor de weerstand van lassen `γ_M2`
//! aan; de Nederlandse bijlage stelt `γ_M2 = 1,25`.
//!
//! **Stompe lassen (4.7.1).** Een volledig doorgelaste stompe las heeft
//! dezelfde rekenwaarde van de weerstand als het zwakste van de verbonden
//! onderdelen. Er is dan geen aparte lastoets: als het staal het houdt, houdt
//! de las het ook. Deze kern geeft dat als uitkomst terug in plaats van een
//! getal te verzinnen.
//!
//! # Wat hier NIET in zit
//!
//! - Vermoeiing (EN 1993-1-9).
//! - Onderbroken lassen (4.5.1(3)); de aanroeper moet dan zelf de kracht per
//!   eenheidslengte over de werkelijk aanwezige laslengte verdelen.
//! - Lassen in dunwandige koudgevormde doorsneden (EN 1993-1-3) en lassen in
//!   holle profielen (hoofdstuk 7 van EN 1993-1-8).
//! - Krachten dwars op de naad (bijvoorbeeld een oplegdruk die de flens van het
//!   lijf af trekt). De aanroeper geeft één resultante per eenheidslengte; als
//!   er meer componenten zijn, hoort die resultante ze al te bevatten.

use nen_en_1993_1_1_section::grade_by_name;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Partiële factor voor de weerstand van lassen — NEN-EN 1993-1-8 tabel 2.1
/// met de waarde uit de Nederlandse nationale bijlage.
pub const GAMMA_M2: f64 = 1.25;

/// Kleinste keeldikte die de norm toelaat: NEN-EN 1993-1-8 4.5.2(2) — een
/// hoeklas met een keeldikte kleiner dan 3 mm behoort niet te worden gebruikt.
pub const A_MIN_MM: f64 = 3.0;

/// Soort naad tussen twee delen van een samengestelde doorsnede.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/las/")]
pub enum Lassoort {
    /// Hoeklas aan één zijde van de naad; één keeldoorsnede werkt mee.
    HoeklasEnkel,
    /// Hoeklas aan weerszijden van de naad; twee keeldoorsneden werken mee.
    HoeklasDubbel,
    /// Volledig doorgelaste stompe las — 4.7.1: de weerstand is die van het
    /// zwakste verbonden onderdeel, dus geen aparte lastoets.
    StompVolledig,
}

impl Lassoort {
    /// Hoeveel keeldoorsneden er meewerken; 0 voor een stompe las.
    pub fn aantal_keeldoorsneden(self) -> f64 {
        match self {
            Lassoort::HoeklasEnkel => 1.0,
            Lassoort::HoeklasDubbel => 2.0,
            Lassoort::StompVolledig => 0.0,
        }
    }
}

/// Eén te toetsen naad.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/las/")]
pub struct LasInput {
    /// Vrij te kiezen aanduiding; komt onveranderd in het resultaat terug.
    pub id: String,
    pub soort: Lassoort,
    /// Keeldikte `a` van één las (mm).
    pub a_mm: f64,
    /// Rekenwaarde van de kracht in de las per eenheidslengte `F_w,Ed`
    /// (N/mm) — bij een langslas de schuifstroom `V_z·S/I_y`.
    pub f_w_ed_n_per_mm: f64,
    /// Staalsoort van het **zwakste verbonden onderdeel**, zoals "S235".
    /// Hieruit volgen `f_u` (EN 1993-1-1 tabel 3.1) en `β_w` (tabel 4.1).
    pub staalsoort: String,
}

/// De uitkomst per naad. Alle tussenwaarden staan erbij, zodat het rapport de
/// afleiding kan tonen zonder iets over te hoeven rekenen.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/las/")]
pub struct LasResultaat {
    pub id: String,
    pub soort: Lassoort,
    pub a_mm: f64,
    /// Meewerkende keeldikte in totaal (mm): `a` of `2a`.
    pub a_totaal_mm: f64,
    pub staalsoort: String,
    /// Nominale treksterkte van het zwakste verbonden onderdeel (N/mm²).
    pub f_u_mpa: f64,
    /// Correlatiefactor volgens tabel 4.1.
    pub beta_w: f64,
    pub gamma_m2: f64,
    /// Rekenwaarde van de schuifsterkte van de las (N/mm²), formule (4.4).
    pub f_vw_d_mpa: f64,
    /// Rekenwaarde van de weerstand per eenheidslengte (N/mm), formule (4.3).
    pub f_w_rd_n_per_mm: f64,
    pub f_w_ed_n_per_mm: f64,
    /// Schuifspanning in de keeldoorsnede (N/mm²): `F_w,Ed / a_totaal`.
    pub tau_mpa: f64,
    /// `F_w,Ed / F_w,Rd`; 0 wanneer er niet te toetsen valt.
    pub uc: f64,
    /// `false` zodra er geen unity check is (stompe las, of ontbrekende invoer).
    pub getoetst: bool,
    /// Meldingen voor scherm en rapport; leeg als er niets te melden is.
    pub meldingen: Vec<String>,
}

/// Correlatiefactor `β_w` volgens NEN-EN 1993-1-8 tabel 4.1.
///
/// De tabel noemt per rij de staalsoorten uit EN 10025, EN 10210 en EN 10219
/// die dezelfde factor krijgen. Alle varianten binnen één sterkteklasse
/// (S 235 / S 235 W / S 235 H, S 275 N/NL, S 355 M/ML, …) staan in dezelfde
/// rij, dus de sterkteklasse bepaalt de factor:
///
/// ```text
///   S 235   0,80
///   S 275   0,85
///   S 355   0,90
///   S 420   1,00
///   S 460   1,00
/// ```
///
/// `None` voor een staalsoort die de tabel niet noemt — dan wordt er niet
/// geraden maar gemeld. (Voor staalsoorten boven S460 geldt EN 1993-1-12.)
pub fn beta_w(staalsoort: &str) -> Option<f64> {
    match klasse_van(staalsoort)?.as_str() {
        "S235" => Some(0.80),
        "S275" => Some(0.85),
        "S355" => Some(0.90),
        "S420" => Some(1.00),
        "S460" => Some(1.00),
        _ => None,
    }
}

/// Sterkteklasse uit een staalsoortaanduiding: "S355J2" → "S355", "s 355 n" →
/// "S355". Geeft `None` als er geen `S` met drie cijfers in staat.
fn klasse_van(staalsoort: &str) -> Option<String> {
    let schoon: String = staalsoort
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .flat_map(|c| c.to_uppercase())
        .collect();
    let rest = schoon.strip_prefix('S')?;
    let cijfers: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if cijfers.len() < 3 {
        return None;
    }
    Some(format!("S{}", &cijfers[..3]))
}

/// Rekenwaarde van de schuifsterkte van de las — formule (4.4).
pub fn f_vw_d(f_u_mpa: f64, beta_w: f64, gamma_m2: f64) -> f64 {
    if beta_w <= 0.0 || gamma_m2 <= 0.0 {
        return 0.0;
    }
    (f_u_mpa / 3f64.sqrt()) / (beta_w * gamma_m2)
}

/// Toets één naad.
pub fn toets_las(input: &LasInput) -> LasResultaat {
    let mut meldingen = Vec::new();
    let klasse = klasse_van(&input.staalsoort);
    let f_u = klasse
        .as_deref()
        .and_then(grade_by_name)
        .map(|g| g.fu_mpa)
        .unwrap_or(0.0);
    let bw = beta_w(&input.staalsoort).unwrap_or(0.0);
    let a_totaal = input.a_mm.max(0.0) * input.soort.aantal_keeldoorsneden();

    // Stompe las met volledige doorlassing: 4.7.1 — geen aparte lastoets.
    if input.soort == Lassoort::StompVolledig {
        meldingen.push(
            "Volledig doorgelaste stompe las: NEN-EN 1993-1-8 4.7.1 geeft de las dezelfde \
             rekenwaarde van de weerstand als het zwakste verbonden onderdeel. Er is dus geen \
             aparte lastoets; maatgevend is de doorsnedetoets van het staal zelf."
                .to_string(),
        );
        return LasResultaat {
            id: input.id.clone(),
            soort: input.soort,
            a_mm: input.a_mm,
            a_totaal_mm: 0.0,
            staalsoort: input.staalsoort.clone(),
            f_u_mpa: f_u,
            beta_w: bw,
            gamma_m2: GAMMA_M2,
            f_vw_d_mpa: 0.0,
            f_w_rd_n_per_mm: 0.0,
            f_w_ed_n_per_mm: input.f_w_ed_n_per_mm,
            tau_mpa: 0.0,
            uc: 0.0,
            getoetst: false,
            meldingen,
        };
    }

    if f_u <= 0.0 {
        meldingen.push(format!(
            "Staalsoort \"{}\" staat niet in tabel 3.1 van NEN-EN 1993-1-1; zonder f_u is er geen \
             rekenwaarde van de schuifsterkte. Kies S235, S275, S355, S420 of S460.",
            input.staalsoort
        ));
    }
    if bw <= 0.0 {
        meldingen.push(format!(
            "Voor staalsoort \"{}\" geeft tabel 4.1 van NEN-EN 1993-1-8 geen correlatiefactor β_w.",
            input.staalsoort
        ));
    }
    if input.a_mm > 0.0 && input.a_mm < A_MIN_MM {
        meldingen.push(format!(
            "Keeldikte a = {:.1} mm. NEN-EN 1993-1-8 4.5.2(2): een hoeklas met een keeldikte \
             kleiner dan {A_MIN_MM:.0} mm behoort niet te worden toegepast.",
            input.a_mm
        ));
    }
    if !(input.a_mm > 0.0) {
        meldingen.push("Geef de keeldikte a een positieve waarde.".to_string());
    }

    let fvwd = f_vw_d(f_u, bw, GAMMA_M2);
    let f_w_rd = fvwd * a_totaal;
    let getoetst = f_w_rd > 0.0;
    let tau = if a_totaal > 0.0 {
        input.f_w_ed_n_per_mm.abs() / a_totaal
    } else {
        0.0
    };
    let uc = if getoetst {
        input.f_w_ed_n_per_mm.abs() / f_w_rd
    } else {
        0.0
    };

    LasResultaat {
        id: input.id.clone(),
        soort: input.soort,
        a_mm: input.a_mm,
        a_totaal_mm: a_totaal,
        staalsoort: input.staalsoort.clone(),
        f_u_mpa: f_u,
        beta_w: bw,
        gamma_m2: GAMMA_M2,
        f_vw_d_mpa: fvwd,
        f_w_rd_n_per_mm: f_w_rd,
        f_w_ed_n_per_mm: input.f_w_ed_n_per_mm,
        tau_mpa: tau,
        uc,
        getoetst,
        meldingen,
    }
}

/// Alle naden achter elkaar.
pub fn toets_lassen(inputs: &[LasInput]) -> Vec<LasResultaat> {
    inputs.iter().map(toets_las).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn correlatiefactoren_uit_tabel_4_1() {
        assert_eq!(beta_w("S235"), Some(0.80));
        assert_eq!(beta_w("S275"), Some(0.85));
        assert_eq!(beta_w("S355"), Some(0.90));
        assert_eq!(beta_w("S420"), Some(1.00));
        assert_eq!(beta_w("S460"), Some(1.00));
        // Varianten binnen dezelfde sterkteklasse staan in dezelfde rij.
        assert_eq!(beta_w("S 355 J2"), Some(0.90));
        assert_eq!(beta_w("s275nl"), Some(0.85));
        assert_eq!(beta_w("S235W"), Some(0.80));
        // Buiten het bereik van de tabel: niet raden.
        assert_eq!(beta_w("S690"), None);
        assert_eq!(beta_w("aluminium"), None);
    }

    /// `f_vw,d` voor S235: (360/√3)/(0,80·1,25) = 207,846/1,000 = 207,85 N/mm².
    /// Voor S355: (510/√3)/(0,90·1,25) = 294,449/1,125 = 261,73 N/mm².
    #[test]
    fn schuifsterkte_van_de_las() {
        assert_relative_eq!(f_vw_d(360.0, 0.80, 1.25), 360.0 / 3f64.sqrt(), max_relative = 1e-12);
        assert_relative_eq!(f_vw_d(360.0, 0.80, 1.25), 207.846, max_relative = 1e-5);
        assert_relative_eq!(f_vw_d(510.0, 0.90, 1.25), 261.732, max_relative = 1e-5);
    }

    /// Dubbelzijdige hoeklas a = 4 mm in S235, schuifstroom 800 N/mm.
    /// F_w,Rd = 207,846 · 8 = 1662,77 N/mm  →  UC = 800/1662,77 = 0,481.
    #[test]
    fn dubbelzijdige_hoeklas_haalt_twee_keeldoorsneden() {
        let r = toets_las(&LasInput {
            id: "flens-lijf".into(),
            soort: Lassoort::HoeklasDubbel,
            a_mm: 4.0,
            f_w_ed_n_per_mm: 800.0,
            staalsoort: "S235".into(),
        });
        assert!(r.getoetst);
        assert_relative_eq!(r.a_totaal_mm, 8.0);
        assert_relative_eq!(r.f_w_rd_n_per_mm, 1662.7687752661223, max_relative = 1e-9);
        assert_relative_eq!(r.uc, 800.0 / 1662.7687752661223, max_relative = 1e-9);
        assert_relative_eq!(r.tau_mpa, 100.0);
        assert!(r.meldingen.is_empty(), "onverwachte melding: {:?}", r.meldingen);
    }

    /// Eén las in plaats van twee halveert de weerstand precies.
    #[test]
    fn enkelzijdig_is_de_helft_van_dubbelzijdig() {
        let maak = |soort| LasInput {
            id: "n".into(),
            soort,
            a_mm: 5.0,
            f_w_ed_n_per_mm: 1000.0,
            staalsoort: "S355".into(),
        };
        let enkel = toets_las(&maak(Lassoort::HoeklasEnkel));
        let dubbel = toets_las(&maak(Lassoort::HoeklasDubbel));
        assert_relative_eq!(enkel.uc, 2.0 * dubbel.uc, max_relative = 1e-12);
        assert_relative_eq!(enkel.f_w_rd_n_per_mm * 2.0, dubbel.f_w_rd_n_per_mm, max_relative = 1e-12);
    }

    /// Een stompe las met volledige doorlassing krijgt geen unity check, maar
    /// wel de reden waarom niet.
    #[test]
    fn stompe_las_krijgt_geen_unity_check() {
        let r = toets_las(&LasInput {
            id: "stomp".into(),
            soort: Lassoort::StompVolledig,
            a_mm: 0.0,
            f_w_ed_n_per_mm: 5000.0,
            staalsoort: "S235".into(),
        });
        assert!(!r.getoetst);
        assert_eq!(r.uc, 0.0);
        assert!(r.meldingen[0].contains("4.7.1"));
    }

    /// Een keeldikte onder 3 mm wordt gemeld maar niet stilzwijgend verhoogd:
    /// de gebruiker moet het zien, de toets blijft gewoon rekenen.
    #[test]
    fn te_kleine_keeldikte_wordt_gemeld() {
        let r = toets_las(&LasInput {
            id: "dun".into(),
            soort: Lassoort::HoeklasDubbel,
            a_mm: 2.0,
            f_w_ed_n_per_mm: 100.0,
            staalsoort: "S235".into(),
        });
        assert!(r.getoetst);
        assert!(r.meldingen.iter().any(|m| m.contains("4.5.2(2)")));
        assert_relative_eq!(r.a_totaal_mm, 4.0);
    }

    /// Onbekende staalsoort: geen getal, wel een reden.
    #[test]
    fn onbekende_staalsoort_levert_geen_getal() {
        let r = toets_las(&LasInput {
            id: "x".into(),
            soort: Lassoort::HoeklasDubbel,
            a_mm: 4.0,
            f_w_ed_n_per_mm: 100.0,
            staalsoort: "gietijzer".into(),
        });
        assert!(!r.getoetst);
        assert_eq!(r.uc, 0.0);
        assert_eq!(r.meldingen.len(), 2);
    }
}
