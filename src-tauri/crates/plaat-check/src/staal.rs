//! Staal: het vloeicriterium van NEN-EN 1993-1-1 6.2.1(5) per plaatelement.
//!
//! # De norm
//!
//! NEN-EN 1993-1-1+A1:2014+NB:2016, 6.2.1(5): "Voor de elastische toetsing mag
//! het volgende vloeicriterium zijn gebruikt voor een kritiek punt van de
//! doorsnede, tenzij andere interactieformules van toepassing zijn, volgens
//! 6.2.8 tot 6.2.10":
//!
//! ```text
//!   (σ_x,Ed/(f_y/γ_M0))² + (σ_z,Ed/(f_y/γ_M0))²
//!     − (σ_x,Ed/(f_y/γ_M0))·(σ_z,Ed/(f_y/γ_M0)) + 3·(τ_Ed/(f_y/γ_M0))² ≤ 1     (6.1)
//! ```
//!
//! met σ_x,Ed en σ_z,Ed de rekenwaarden van de spanning in de lengte- en de
//! dwarsrichting in het beschouwde punt en τ_Ed de schuifspanning daar.
//!
//! Voor een wandschijf zijn de "lengte-" en "dwarsrichting" de twee assen in het
//! vlak: σ_x,Ed = σx van het element en σ_z,Ed = de normaalspanning in de
//! verticale modelrichting (`sigma_y_mpa`, de naam uit de solver). Het
//! criterium is invariant voor een draaiing van de assen, dus welke richting
//! "lengte" heet maakt voor de uitkomst niet uit.
//!
//! f_y komt uit tabel 3.1 met de plaatdikte als elementdikte
//! (`SteelGrade::voor_dikte`, dezelfde regel als de staaftoets); γ_M0 komt uit
//! de normnaad (NB bij 6.1(1)).
//!
//! # De unity check
//!
//! Het linkerlid L van (6.1) is kwadratisch in de spanning. Als UC wordt
//! √L = σ_eq,Ed / (f_y/γ_M0) gerapporteerd, met σ_eq,Ed = √(σ_x² + σ_z² − σ_x·σ_z
//! + 3τ²): die schaalt lineair met de belasting, zoals elke andere UC in de app,
//! en UC ≤ 1 is precies L ≤ 1. De afleiding toont beide.
//!
//! # Wat NIET getoetst wordt
//!
//! Plooi van plaatvelden. 6.2.1(2) verwijst voor lokaal plooien en plooien door
//! afschuiving naar NEN-EN 1993-1-5. Die toets vraagt het plaatveld tussen de
//! verstijvingen, de randvoorwaarden en de spanningsverdeling over dat veld; het
//! schijfmodel levert alleen elementspanningen en kent geen plooimodus. Het
//! resultaat draagt dat als [`PlaatNietGetoetst`].

use mechanics::{ForceStateSnapshot, InternalForces};
use nationale_bijlage::{Aanduidingen, Ndp1993};
use nen_en_1993_1_1_section::{
    grade_by_name, CheckStatus, Deelstap, NamedValue, ResistanceCalc, UnityCheck,
};
use steel_check::{CheckKind, NamedCheck};

use crate::input::PlateCheckInput;
use crate::latex::{factor, getal, tekst};
use crate::result::{PlaatNietGetoetst, PlateCheckResult};
use crate::verzamel::{verzamel, Punt};
use crate::{geweigerd, status_uit, VLOEI_ID};

/// σ_eq,Ed volgens de vlakke-spanningsvorm van het criterium.
pub fn sigma_eq(sigma_x: f64, sigma_z: f64, tau: f64) -> f64 {
    (sigma_x * sigma_x + sigma_z * sigma_z - sigma_x * sigma_z + 3.0 * tau * tau)
        .max(0.0)
        .sqrt()
}

/// Het linkerlid van (6.1) bij rekensterkte `f_d = f_y/γ_M0`.
pub fn linkerlid_6_1(sigma_x: f64, sigma_z: f64, tau: f64, f_d: f64) -> f64 {
    let x = sigma_x / f_d;
    let z = sigma_z / f_d;
    let t = tau / f_d;
    x * x + z * z - x * z + 3.0 * t * t
}

pub fn niet_getoetst_plooi() -> PlaatNietGetoetst {
    PlaatNietGetoetst {
        id: "en1993_1_5_plooi".to_string(),
        titel: "Plooi van plaatvelden (NEN-EN 1993-1-5)".to_string(),
        reden: "NEN-EN 1993-1-1 6.2.1(2) verwijst voor lokaal plooien en plooien door afschuiving \
                naar NEN-EN 1993-1-5, dat eisen geeft voor verstijfde en niet-verstijfde \
                plaatvelden onderhevig aan krachten in het vlak (1.1(1)). Die toets vraagt het \
                plaatveld tussen de verstijvingen, de randvoorwaarden en de spanningsverdeling over \
                dat veld (hoofdstukken 4, 5 en 10); het schijfmodel is lineair-elastisch en kent \
                geen plooimodus. \"Voldoet\" betekent hier dus alleen dat het vloeicriterium (6.1) \
                in elk element gehaald is, niet dat de plaat niet plooit."
            .to_string(),
        bepaalt_status: false,
    }
}

pub fn toets(input: &PlateCheckInput) -> PlateCheckResult {
    let naam = input.materiaal.trim().to_uppercase();
    let Some(soort) = grade_by_name(&naam) else {
        return geweigerd(
            input,
            format!(
                "staalsoort \"{}\" staat niet in NEN-EN 1993-1-1 tabel 3.1 van de rekenkern \
                 (S235, S275, S355, S420, S460); er is niet getoetst",
                input.materiaal
            ),
        );
    };
    let (soort_dik, _klasse, dikte_notitie) = match soort.voor_dikte(input.thickness_mm) {
        Ok(v) => v,
        Err(e) => return geweigerd(input, format!("{e}; er is niet getoetst")),
    };
    let gamma_m0 = Ndp1993::voor(input.bijlage).gamma_m0;
    let f_y = soort_dik.fy_mpa;
    let f_d = f_y / gamma_m0;

    let v = verzamel(input, |_, el| {
        vec![(VLOEI_ID.to_string(), sigma_eq(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa) / f_d)]
    });
    let Some(maatgevend) = v.per_toets.first() else {
        return geweigerd(
            input,
            "de plaat heeft geen elementspanningen in een UGT-combinatie; reken het model eerst \
             door"
                .to_string(),
        );
    };

    let calc = afleiding(&maatgevend.punt, f_y, gamma_m0, &naam, &dikte_notitie);
    let checks = vec![NamedCheck { id: VLOEI_ID.to_string(), kind: CheckKind::Resistance(calc) }];
    let niet_getoetst = vec![niet_getoetst_plooi()];
    let uc_max = maatgevend.punt.uc;
    let mut notes = input.notities.clone();
    notes.push(format!(
        "Getoetst per element van het rekenmesh met de elementgemiddelde spanning \
         (constante-rek-elementen). Een spanningspiek in een inspringende hoek of langs een \
         opening wordt daardoor uitgemiddeld over het element; verfijn het mesh daar om de piek \
         te benaderen. Maatgevend: element {} in combinatie {}.",
        maatgevend.punt.element.element_id, maatgevend.punt.combination_id
    ));

    PlateCheckResult {
        plate_id: input.plate_id,
        soort: input.soort,
        materiaal: naam,
        thickness_mm: input.thickness_mm,
        norm: Aanduidingen::voor(input.bijlage).norm_staal_vol.to_string(),
        status: status_uit(uc_max, &niet_getoetst),
        checks,
        uc_max,
        governing_check_id: VLOEI_ID.to_string(),
        governing_element_id: Some(maatgevend.punt.element.element_id),
        governing_combination_id: Some(maatgevend.punt.combination_id),
        combinaties: v.per_combinatie,
        elementen: v.per_element,
        niet_getoetst,
        geweigerd: None,
        notes,
    }
}

fn afleiding(p: &Punt, f_y: f64, gamma_m0: f64, soort: &str, dikte_notitie: &str) -> ResistanceCalc {
    let sx = p.element.sigma_x_mpa;
    let sz = p.element.sigma_y_mpa;
    let t = p.element.tau_xy_mpa;
    let f_d = f_y / gamma_m0;
    let s_eq = sigma_eq(sx, sz, t);
    let l = linkerlid_6_1(sx, sz, t, f_d);
    let uc = s_eq / f_d;

    let nv = |symbol: &str, value: f64, unit: &str| NamedValue {
        symbol: symbol.to_string(),
        value,
        unit: unit.to_string(),
    };
    let fd_txt = format!("{}/{}", getal(f_y, 3), getal(gamma_m0, 3));

    let deelstappen = vec![
        Deelstap {
            id: "f_y".to_string(),
            titel: "Vloeigrens".to_string(),
            symbol: "f_y".to_string(),
            article: "tabel 3.1".to_string(),
            formula_latex: "f_y".to_string(),
            ingevuld_latex: String::new(),
            variables: vec![],
            value: Some(f_y),
            unit: "N/mm²".to_string(),
            notes: vec![dikte_notitie.to_string()],
        },
        Deelstap {
            id: "f_d".to_string(),
            titel: "Rekenwaarde van de vloeigrens".to_string(),
            symbol: "f_{y,d}".to_string(),
            article: "art. 6.1(1)".to_string(),
            formula_latex: "f_{y,d} = \\frac{f_y}{\\gamma_{M0}}".to_string(),
            ingevuld_latex: format!("\\frac{{{}}}{{{}}}", getal(f_y, 3), getal(gamma_m0, 3)),
            variables: vec![nv("f_y", f_y, "N/mm²"), nv("\\gamma_{M0}", gamma_m0, "-")],
            value: Some(f_d),
            unit: "N/mm²".to_string(),
            notes: vec![format!(
                "γ_M0 = {} uit de nationale bijlage (NB bij 6.1(1)).",
                tekst(gamma_m0, 2)
            )],
        },
        Deelstap {
            id: "sigma_eq".to_string(),
            titel: "Vergelijkspanning in het element".to_string(),
            symbol: "\\sigma_{eq,Ed}".to_string(),
            article: "art. 6.2.1(5)".to_string(),
            formula_latex: "\\sigma_{eq,Ed} = \\sqrt{\\sigma_{x,Ed}^2 + \\sigma_{z,Ed}^2 - \\sigma_{x,Ed}\\,\\sigma_{z,Ed} + 3\\,\\tau_{Ed}^2}".to_string(),
            ingevuld_latex: format!(
                "\\sqrt{{{sx}^2 + {sz}^2 - {sx} \\cdot {sz} + 3 \\cdot {t}^2}}",
                sx = factor(sx, 2),
                sz = factor(sz, 2),
                t = factor(t, 2)
            ),
            variables: vec![
                nv("\\sigma_{x,Ed}", sx, "N/mm²"),
                nv("\\sigma_{z,Ed}", sz, "N/mm²"),
                nv("\\tau_{Ed}", t, "N/mm²"),
            ],
            value: Some(s_eq),
            unit: "N/mm²".to_string(),
            notes: vec![format!(
                "Element {} in combinatie {}; σ_x,Ed is de spanning in de horizontale richting \
                 van het model, σ_z,Ed die in de verticale richting (trek positief). Het criterium \
                 hangt niet af van welke richting lengterichting heet.",
                p.element.element_id, p.combination_id
            )],
        },
        Deelstap {
            id: "criterium_6_1".to_string(),
            titel: "Vloeicriterium".to_string(),
            symbol: String::new(),
            article: "art. 6.2.1(5) (6.1)".to_string(),
            formula_latex: "\\left(\\frac{\\sigma_{x,Ed}}{f_y/\\gamma_{M0}}\\right)^2 + \\left(\\frac{\\sigma_{z,Ed}}{f_y/\\gamma_{M0}}\\right)^2 - \\left(\\frac{\\sigma_{x,Ed}}{f_y/\\gamma_{M0}}\\right)\\left(\\frac{\\sigma_{z,Ed}}{f_y/\\gamma_{M0}}\\right) + 3\\left(\\frac{\\tau_{Ed}}{f_y/\\gamma_{M0}}\\right)^2 \\le 1".to_string(),
            ingevuld_latex: format!(
                "\\left(\\frac{{{sx}}}{{{fd}}}\\right)^2 + \\left(\\frac{{{sz}}}{{{fd}}}\\right)^2 - \\left(\\frac{{{sx}}}{{{fd}}}\\right)\\left(\\frac{{{sz}}}{{{fd}}}\\right) + 3\\left(\\frac{{{t}}}{{{fd}}}\\right)^2 = {l} {teken} 1",
                sx = getal(sx, 2),
                sz = getal(sz, 2),
                t = getal(t, 2),
                fd = fd_txt,
                l = getal(l, 3),
                teken = if l <= 1.0 { "\\le" } else { ">" }
            ),
            variables: vec![],
            value: Some(l),
            unit: "-".to_string(),
            notes: vec![format!(
                "Als unity check geldt √(linkerlid) = σ_eq,Ed/(f_y/γ_M0) = {}: die schaalt \
                 lineair met de belasting, en UC ≤ 1 is precies (6.1) ≤ 1.",
                tekst(uc, 3)
            )],
        },
    ];

    ResistanceCalc {
        id: VLOEI_ID.to_string(),
        title: "Vloeicriterium in het vlak (von Mises)".to_string(),
        article: "art. 6.2.1(5) (6.1)".to_string(),
        force_state: ForceStateSnapshot {
            combination_id: p.combination_id,
            position_mm: 0.0,
            forces: InternalForces::default(),
        },
        formula_latex: "\\sigma_{eq,Ed} \\le \\frac{f_y}{\\gamma_{M0}}".to_string(),
        variables: vec![
            nv("\\sigma_{eq,Ed}", s_eq, "N/mm²"),
            nv("f_y", f_y, "N/mm²"),
            nv("\\gamma_{M0}", gamma_m0, "-"),
        ],
        deelstappen,
        value: s_eq,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: s_eq,
            rd: f_d,
            uc,
            formula_latex: "\\sigma_{eq,Ed} / f_{y,d}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![
            format!(
                "Plaat van {soort}: element {} in combinatie {} is maatgevend.",
                p.element.element_id, p.combination_id
            ),
            "Plooi van plaatvelden (NEN-EN 1993-1-5) is NIET getoetst; zie de lijst \"niet \
             getoetst\" bij de plaat."
                .to_string(),
        ],
    }
}
