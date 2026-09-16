//! Beton: wapening in het vlak uit het spanningsveld, volgens NEN-EN 1992-1-1
//! bijlage F, en de betondrukdiagonaal.
//!
//! # De norm
//!
//! Bijlage F "Vergelijkingen voor de trekwapening bij vlakspanningstoestanden".
//! De Nederlandse uitgave: "Bijlage F moet als informatief zijn gelezen."
//!
//! F.1(2): de trekwapening in een element dat in zijn vlak is belast door
//! σ_Edx, σ_Edy en τ_Edxy "mag zijn berekend met de hierna uitgewerkte
//! procedure. Drukspanningen behoren te zijn genomen als positief met
//! σ_Edx > σ_Edy. De richting van de wapening behoort samen te vallen met de x-
//! en y-assen." f_tdx = ρ_x·f_yd en f_tdy = ρ_y·f_yd (F.1).
//!
//! F.1(3): waar σ_Edx en σ_Edy beide druk zijn en σ_Edx·σ_Edy > τ²_Edxy is geen
//! berekende wapening vereist; de maximale drukspanning behoort niet groter te
//! zijn dan f_cd (3.1.6).
//!
//! F.1(4): waar σ_Edy trek is of σ_Edx·σ_Edy ≤ τ²_Edxy is wapening vereist; de
//! optimale wapening en de betonspanning:
//!
//! ```text
//!   σ_Edx ≤ |τ_Edxy|:  f'_tdx = |τ_Edxy| − σ_Edx            (F.2)
//!                      f'_tdy = |τ_Edxy| − σ_Edy            (F.3)
//!                      σ_cd   = 2·|τ_Edxy|                  (F.4)
//!   σ_Edx > |τ_Edxy|:  f'_tdx = 0                           (F.5)
//!                      f'_tdy = τ²_Edxy/σ_Edx − σ_Edy       (F.6)
//!                      σ_cd   = σ_Edx·(1 + (τ_Edxy/σ_Edx)²) (F.7)
//! ```
//!
//! (F.4) staat in de uitgave als "2|τ_Edy|"; bedoeld is τ_Edxy — er bestaat geen
//! τ_Edy. "De betonspanning, σ_cd, behoort te zijn gecontroleerd met een
//! realistisch model uitgaande van gescheurde doorsneden (zie EN 1992-2), maar
//! behoort in het algemeen f_cd niet te overschrijden (kan zijn verkregen uit
//! vergelijking (6.5))."
//!
//! # De betondrukdiagonaal
//!
//! In het gebied van F.1(4) is het beton gescheurd met trek in dwarsrichting.
//! Daarvoor geeft 6.5.2(2) σ_Rd,max = 0,6·ν'·f_cd (6.56) met ν' = 1 − f_ck/250
//! (6.57N, door de NB voorgeschreven) — dezelfde reductie als ν in (6.5)/(6.6N)
//! waar F.1(4) naar verwijst. Die toets is hier uitgevoerd; hij is strenger dan
//! "in het algemeen f_cd". In het gebied van F.1(3) (tweeassige druk, niet
//! gescheurd) geldt f_cd (6.55) voor de grootste hoofddrukspanning.
//!
//! f_cd = α_cc·f_ck/γ_C (3.15), α_cc en γ_C uit de normnaad.
//!
//! # De assen
//!
//! De wapening ligt in de richtingen van het model: horizontaal (x) en verticaal
//! (z). Per element wordt de richting met de grootste druk σ_Edx genoemd, zoals
//! F.1(2) eist; de uitkomst gaat terug naar x en z.
//!
//! # Wat hier uitkomt, en wat niet
//!
//! Per element de benodigde trekkracht in de wapening per richting,
//! n_td = f'_td·t in kN/m (deel door f_yd voor A_s in mm²/m) — de app kent nog
//! geen aanwezige wapening in een wand, dus die wordt NIET getoetst: waar
//! wapening nodig is, is de status `NotApplicable`. De unity check is die van
//! het beton. Niet getoetst: minimum- en maximumwapening van wanden (9.6),
//! scheurwijdte (7.3), verankering aan vrije randen (F.1(5)), knik van de wand
//! (5.8/12) en de alternatieve hoek θ van (F.8)–(F.10).

use mechanics::{ForceStateSnapshot, InternalForces};
use nationale_bijlage::{Aanduidingen, Ndp1992};
use nen_en_1992_1_1::{concrete_class_by_name, ConcreteClass};
use nen_en_1993_1_1_section::{CheckStatus, Deelstap, NamedValue, ResistanceCalc, UnityCheck};
use steel_check::{CheckKind, NamedCheck};

use crate::input::{PlaatElementSpanning, PlateCheckInput};
use crate::latex::{getal, tekst};
use crate::result::{PlaatNietGetoetst, PlaatWapening, PlaatWapeningElement, PlateCheckResult};
use crate::verzamel::{verzamel, Punt};
use crate::{geweigerd, status_uit};

/// Betondrukdiagonaal in gescheurd gebied: F.1(4) met (6.56).
pub const DIAGONAAL_ID: &str = "F.1(4)_betondrukdiagonaal";
/// Beton zonder trek in dwarsrichting (F.1(3), of F.1(4) zonder benodigde
/// wapening): f_cd volgens (6.55).
pub const DRUK_ID: &str = "F.1(3)_betondruk";

/// Onder deze benodigde trekspanning (N/mm²) telt wapening als niet nodig:
/// rekenruis. 10⁻⁶ N/mm² is een duizendste kPa.
pub const WAPENING_DREMPEL: f64 = 1e-6;

/// De uitkomst van bijlage F voor één element, terug in de modelassen.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BijlageF {
    /// F.1(3) (true) of F.1(4) (false).
    pub geen_wapening: bool,
    /// σ_Edx (druk positief) — de richting met de grootste druk.
    pub sigma_edx: f64,
    /// σ_Edy (druk positief).
    pub sigma_edy: f64,
    pub tau: f64,
    /// Ligt σ_Edx langs de verticale modelrichting (z)?
    pub x_is_z: bool,
    /// f'_td in de horizontale en verticale modelrichting (N/mm²).
    pub f_td_x: f64,
    pub f_td_z: f64,
    /// F.1(4): σ_cd uit (F.4) of (F.7); F.1(3): de grootste hoofddrukspanning.
    pub sigma_c: f64,
    /// Welke formules: "F.2–F.4", "F.5–F.7" of "F.1(3)".
    pub tak: &'static str,
}

impl BijlageF {
    /// Is er trek in dwarsrichting, dus wapening nodig en het beton gescheurd?
    /// Dan geldt (6.56); anders — druk of geen spanning in dwarsrichting —
    /// (6.55) met f_cd (6.5.2(1)).
    pub fn gescheurd(&self) -> bool {
        !self.geen_wapening && (self.f_td_x > WAPENING_DREMPEL || self.f_td_z > WAPENING_DREMPEL)
    }
}

/// Bijlage F voor spanningen met TREK positief (zoals de solver ze levert).
pub fn bijlage_f(sx: f64, sz: f64, txy: f64) -> BijlageF {
    // Druk positief, en de richting met de grootste druk is "x" van bijlage F.
    let (cx, cz) = (-sx, -sz);
    let x_is_z = cz > cx;
    let (s_x, s_y) = if x_is_z { (cz, cx) } else { (cx, cz) };
    let tau = txy.abs();
    if s_x > 0.0 && s_y > 0.0 && s_x * s_y > tau * tau {
        let m = 0.5 * (s_x + s_y);
        let r = (0.25 * (s_x - s_y) * (s_x - s_y) + tau * tau).sqrt();
        return BijlageF {
            geen_wapening: true,
            sigma_edx: s_x,
            sigma_edy: s_y,
            tau,
            x_is_z,
            f_td_x: 0.0,
            f_td_z: 0.0,
            sigma_c: m + r,
            tak: "F.1(3)",
        };
    }
    let (ftx, fty, scd, tak) = if s_x <= tau {
        (tau - s_x, tau - s_y, 2.0 * tau, "F.2–F.4")
    } else {
        (0.0, tau * tau / s_x - s_y, s_x * (1.0 + (tau / s_x).powi(2)), "F.5–F.7")
    };
    let (f_td_x, f_td_z) = if x_is_z { (fty, ftx) } else { (ftx, fty) };
    BijlageF {
        geen_wapening: false,
        sigma_edx: s_x,
        sigma_edy: s_y,
        tau,
        x_is_z,
        f_td_x,
        f_td_z,
        sigma_c: scd,
        tak,
    }
}

struct Sterkte {
    f_cd: f64,
    nu_accent: f64,
    sigma_rd_max: f64,
    gamma_c: f64,
    alpha_cc: f64,
}

fn beoordeel(el: &PlaatElementSpanning, s: &Sterkte) -> Vec<(String, f64)> {
    let f = bijlage_f(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa);
    if f.gescheurd() {
        vec![(DIAGONAAL_ID.to_string(), f.sigma_c / s.sigma_rd_max)]
    } else {
        vec![(DRUK_ID.to_string(), f.sigma_c / s.f_cd)]
    }
}

pub fn toets(input: &PlateCheckInput) -> PlateCheckResult {
    // Op de VOLLEDIGE naam: "C30" is in EN 338 hout (zie `is_betonklasse` in de
    // MCP-server); de korte vorm hoort hier niet als beton te tellen.
    let naam = input.materiaal.trim().replace(' ', "");
    let klasse = concrete_class_by_name(&naam).filter(|k| k.name.eq_ignore_ascii_case(&naam));
    let Some(klasse) = klasse else {
        return geweigerd(
            input,
            format!(
                "betonklasse \"{}\" staat niet (met volledige aanduiding, bijvoorbeeld C30/37) in \
                 tabel 3.1 van de rekenkern; er is niet getoetst",
                input.materiaal
            ),
        );
    };
    let ndp = Ndp1992::voor(input.bijlage);
    let f_cd = ndp.alpha_cc * klasse.f_ck / ndp.gamma_c_blijvend;
    let nu_accent = 1.0 - klasse.f_ck / ndp.nu_accent_noemer;
    let s = Sterkte {
        f_cd,
        nu_accent,
        sigma_rd_max: 0.6 * nu_accent * f_cd,
        gamma_c: ndp.gamma_c_blijvend,
        alpha_cc: ndp.alpha_cc,
    };
    let t = input.thickness_mm;

    // De wapening: per element het maximum over de combinaties, per richting.
    let mut wapening: Vec<PlaatWapeningElement> = Vec::new();
    let mut index = std::collections::HashMap::new();
    let v = verzamel(input, |comb, el| {
        let f = bijlage_f(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa);
        let (nx, nz) = (f.f_td_x * t, f.f_td_z * t); // N/mm = kN/m
        let i = *index.entry(el.element_id).or_insert_with(|| {
            wapening.push(PlaatWapeningElement {
                element_id: el.element_id,
                n_td_x_kn_per_m: nx,
                combination_x: comb,
                n_td_z_kn_per_m: nz,
                combination_z: comb,
            });
            wapening.len() - 1
        });
        let w = &mut wapening[i];
        if nx > w.n_td_x_kn_per_m {
            w.n_td_x_kn_per_m = nx;
            w.combination_x = comb;
        }
        if nz > w.n_td_z_kn_per_m {
            w.n_td_z_kn_per_m = nz;
            w.combination_z = comb;
        }
        beoordeel(el, &s)
    });
    if v.per_toets.is_empty() {
        return geweigerd(
            input,
            "de plaat heeft geen elementspanningen in een UGT-combinatie; reken het model eerst door"
                .to_string(),
        );
    }
    let nodig = wapening
        .iter()
        .any(|w| w.n_td_x_kn_per_m > WAPENING_DREMPEL * t || w.n_td_z_kn_per_m > WAPENING_DREMPEL * t);
    let max_x = wapening
        .iter()
        .max_by(|a, b| a.n_td_x_kn_per_m.total_cmp(&b.n_td_x_kn_per_m))
        .cloned()
        .expect("er zijn elementen");
    let max_z = wapening
        .iter()
        .max_by(|a, b| a.n_td_z_kn_per_m.total_cmp(&b.n_td_z_kn_per_m))
        .cloned()
        .expect("er zijn elementen");

    let mut niet_getoetst = Vec::new();
    if nodig {
        niet_getoetst.push(PlaatNietGetoetst {
            id: "wapening_aanwezig".to_string(),
            titel: "Aanwezige wapening (bijlage F, (F.1))".to_string(),
            reden: format!(
                "In deze plaat is wapening nodig: tot {} kN/m in x (element {}, combinatie {}) en tot \
                 {} kN/m in z (element {}, combinatie {}), als trekkracht f'_td·t volgens (F.2)/(F.3) \
                 of (F.5)/(F.6). De aanwezige wapening van een wand kent de app nog niet, dus \
                 ρ·f_yd ≥ f'_td (F.1) is NIET getoetst; de plaat heet daarom niet \"voldoet\".",
                tekst(max_x.n_td_x_kn_per_m, 1),
                max_x.element_id,
                max_x.combination_x,
                tekst(max_z.n_td_z_kn_per_m, 1),
                max_z.element_id,
                max_z.combination_z
            ),
            bepaalt_status: true,
        });
    }
    for (id, titel, reden) in [
        (
            "9.6_wandwapening",
            "Minimum- en maximumwapening van wanden (9.6)",
            "9.6.2 en 9.6.3 stellen eisen aan de verticale en horizontale wapening van een wand, los \
             van de berekende wapening; niet getoetst.",
        ),
        ("7.3_scheurwijdte", "Scheurwijdte (7.3)", "De bruikbaarheidsgrenstoestand is niet getoetst."),
        (
            "F.1(5)_verankering",
            "Verankering aan vrije randen (F.1(5))",
            "\"De wapening behoort aan alle vrije randen volledig te zijn verankerd\": een \
             detailleringseis, niet getoetst.",
        ),
        (
            "wand_knik",
            "Knik van de wand (5.8 / 12)",
            "Het schijfmodel is eerste orde in het vlak en kent geen uitbuiging uit het vlak; knik \
             van de wand is niet getoetst.",
        ),
    ] {
        niet_getoetst.push(PlaatNietGetoetst {
            id: id.to_string(),
            titel: titel.to_string(),
            reden: reden.to_string(),
            bepaalt_status: false,
        });
    }

    let checks: Vec<NamedCheck> = v
        .per_toets
        .iter()
        .map(|m| NamedCheck {
            id: m.check_id.clone(),
            kind: CheckKind::Resistance(afleiding(&m.check_id, &m.punt, klasse, &s, t)),
        })
        .collect();
    let maatgevend = v
        .per_toets
        .iter()
        .max_by(|a, b| a.punt.uc.total_cmp(&b.punt.uc))
        .expect("niet leeg");
    let uc_max = maatgevend.punt.uc;

    let mut notes = input.notities.clone();
    notes.push(
        "Bijlage F van NEN-EN 1992-1-1; de Nederlandse uitgave zegt: \"Bijlage F moet als \
         informatief zijn gelezen.\" Gebruikt is de optimale wapening (F.2)–(F.7); de alternatieve \
         hoek θ van (F.8)–(F.10) niet."
            .to_string(),
    );
    notes.push(
        "Wapening in de modelrichtingen x (horizontaal) en z (verticaal). Per element is de richting \
         met de grootste druk σ_Edx van bijlage F genoemd (F.1(2): druk positief, σ_Edx > σ_Edy). De \
         benodigde wapening staat als trekkracht n_td = f'_td·t in kN/m wand, over beide zijden samen; \
         A_s = n_td/f_yd."
            .to_string(),
    );
    notes.push(format!(
        "Betondrukdiagonaal: F.1(4) zegt dat σ_cd \"in het algemeen f_cd niet behoort te \
         overschrijden (kan zijn verkregen uit vergelijking (6.5))\"; in gescheurd gebied met trek in \
         dwarsrichting is 6.5.2(2) (6.56) σ_Rd,max = 0,6·ν'·f_cd = {} N/mm² aangehouden, strenger dan \
         f_cd = {} N/mm². Waar geen trek in dwarsrichting is (F.1(3), of F.1(4) zonder \
         benodigde wapening) geldt f_cd (6.55), 6.5.2(1).",
        tekst(s.sigma_rd_max, 2),
        tekst(s.f_cd, 2)
    ));
    notes.push(
        "(F.4) staat in de uitgave als σ_cd = 2|τ_Edy|; bedoeld is τ_Edxy (er is geen τ_Edy)."
            .to_string(),
    );
    notes.push(
        "Getoetst per element met de elementgemiddelde spanning; een spanningspiek bij een \
         inspringende hoek of opening wordt over het element uitgemiddeld — verfijn daar het mesh."
            .to_string(),
    );

    PlateCheckResult {
        plate_id: input.plate_id,
        soort: input.soort,
        materiaal: klasse.name.to_string(),
        thickness_mm: t,
        norm: Aanduidingen::voor(input.bijlage).norm_beton_vol.to_string(),
        status: status_uit(uc_max, &niet_getoetst),
        checks,
        uc_max,
        governing_check_id: maatgevend.check_id.clone(),
        governing_element_id: Some(maatgevend.punt.element.element_id),
        governing_combination_id: Some(maatgevend.punt.combination_id),
        combinaties: v.per_combinatie,
        elementen: v.per_element,
        niet_getoetst,
        geweigerd: None,
        wapening: Some(PlaatWapening { max_x, max_z, elementen: wapening }),
        notes,
    }
}

fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue { symbol: symbol.to_string(), value, unit: unit.to_string() }
}

fn afleiding(id: &str, p: &Punt, klasse: &ConcreteClass, s: &Sterkte, t: f64) -> ResistanceCalc {
    let el = &p.element;
    let f = bijlage_f(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa);
    let richting = |z: bool| if z { "z (verticaal)" } else { "x (horizontaal)" };

    let mut stappen = vec![
        Deelstap {
            id: "f_cd".to_string(),
            titel: "Rekenwaarde van de druksterkte".to_string(),
            symbol: "f_{cd}".to_string(),
            article: "art. 3.1.6 (3.15)".to_string(),
            formula_latex: "f_{cd} = \\frac{\\alpha_{cc} \\, f_{ck}}{\\gamma_C}".to_string(),
            ingevuld_latex: format!(
                "\\frac{{{} \\cdot {}}}{{{}}}",
                getal(s.alpha_cc, 2),
                getal(klasse.f_ck, 1),
                getal(s.gamma_c, 2)
            ),
            variables: vec![nv("f_{ck}", klasse.f_ck, "N/mm²")],
            value: Some(s.f_cd),
            unit: "N/mm²".to_string(),
            notes: vec![format!(
                "{}: f_ck uit tabel 3.1; α_cc = {} (NB bij 3.1.6(1)P), γ_C = {} (tabel 2.1N).",
                klasse.name,
                tekst(s.alpha_cc, 2),
                tekst(s.gamma_c, 2)
            )],
        },
        Deelstap {
            id: "bijlage_f_spanningen".to_string(),
            titel: "Spanningen volgens bijlage F".to_string(),
            symbol: String::new(),
            article: "bijlage F, F.1(2)".to_string(),
            formula_latex: "\\sigma_{Edx} \\ge \\sigma_{Edy} \\ \\text{(druk positief)}".to_string(),
            ingevuld_latex: format!(
                "\\sigma_{{Edx}} = {},\\ \\sigma_{{Edy}} = {},\\ |\\tau_{{Edxy}}| = {}\\ \\mathrm{{N/mm^2}}",
                getal(f.sigma_edx, 3),
                getal(f.sigma_edy, 3),
                getal(f.tau, 3)
            ),
            variables: vec![
                nv("\\sigma_x", el.sigma_x_mpa, "N/mm²"),
                nv("\\sigma_z", el.sigma_y_mpa, "N/mm²"),
                nv("\\tau_{xz}", el.tau_xy_mpa, "N/mm²"),
            ],
            value: None,
            unit: String::new(),
            notes: vec![format!(
                "Element {} in combinatie {}; de solver levert trek positief. σ_Edx ligt langs {} en \
                 σ_Edy langs {}.",
                el.element_id,
                p.combination_id,
                richting(f.x_is_z),
                richting(!f.x_is_z)
            )],
        },
    ];

    let (titel, artikel, formule, ed_sym, rd_sym, rd, mut notes) = if !f.gescheurd() && !f.geen_wapening {
        stappen.push(Deelstap {
            id: "gebied".to_string(),
            titel: "Geen trek in dwarsrichting".to_string(),
            symbol: String::new(),
            article: format!("bijlage F, F.1(4) {}", if f.tak == "F.2–F.4" { "(F.2)–(F.4)" } else { "(F.5)–(F.7)" }),
            formula_latex: "f'_{tdx} = 0,\\quad f'_{tdy} = 0".to_string(),
            ingevuld_latex: format!("\\sigma_{{cd}} = {}\\ \\mathrm{{N/mm^2}}", getal(f.sigma_c, 3)),
            variables: vec![],
            value: Some(f.sigma_c),
            unit: "N/mm²".to_string(),
            notes: vec![
                "Het element valt formeel onder F.1(4) (σ_Edx·σ_Edy ≤ τ²), maar er is geen \
                 wapening nodig: geen trek in dwarsrichting. Dan geldt 6.5.2(1) met (6.55) \
                 σ_Rd,max = f_cd."
                    .to_string(),
            ],
        });
        (
            "Betondruk zonder trek in dwarsrichting",
            "bijlage F, F.1(4); art. 6.5.2 (6.55)",
            "\\sigma_{cd} \\le f_{cd}",
            "\\sigma_{cd}",
            "f_{cd}",
            s.f_cd,
            vec![],
        )
    } else if f.geen_wapening {
        stappen.push(Deelstap {
            id: "gebied".to_string(),
            titel: "Geen berekende wapening".to_string(),
            symbol: String::new(),
            article: "F.1(3)".to_string(),
            formula_latex: "\\sigma_{Edx} > 0,\\ \\sigma_{Edy} > 0,\\ \\sigma_{Edx}\\,\\sigma_{Edy} > \\tau_{Edxy}^2".to_string(),
            ingevuld_latex: format!(
                "{} \\cdot {} = {} > {}",
                getal(f.sigma_edx, 3),
                getal(f.sigma_edy, 3),
                getal(f.sigma_edx * f.sigma_edy, 3),
                getal(f.tau * f.tau, 3)
            ),
            variables: vec![],
            value: None,
            unit: String::new(),
            notes: vec!["\"De maximale drukspanning behoort echter niet groter te zijn dan f_cd.\"".to_string()],
        });
        (
            "Betondruk zonder berekende wapening",
            "bijlage F, F.1(3); art. 6.5.2 (6.55)",
            "\\sigma_{c,max} \\le f_{cd}",
            "\\sigma_{c,max}",
            "f_{cd}",
            s.f_cd,
            vec!["σ_c,max is de grootste hoofddrukspanning in het element.".to_string()],
        )
    } else {
        // Terug naar de assen van bijlage F voor de ingevulde regel.
        let (ftx, fty) = if f.x_is_z { (f.f_td_z, f.f_td_x) } else { (f.f_td_x, f.f_td_z) };
        let (fx_l, fy_l, sc_l, art) = if f.tak == "F.2–F.4" {
            (
                "f'_{tdx} = |\\tau_{Edxy}| - \\sigma_{Edx}",
                "f'_{tdy} = |\\tau_{Edxy}| - \\sigma_{Edy}",
                "\\sigma_{cd} = 2\\,|\\tau_{Edxy}|",
                "(F.2)–(F.4)",
            )
        } else {
            (
                "f'_{tdx} = 0",
                "f'_{tdy} = \\frac{\\tau_{Edxy}^2}{\\sigma_{Edx}} - \\sigma_{Edy}",
                "\\sigma_{cd} = \\sigma_{Edx}\\left(1 + \\left(\\frac{\\tau_{Edxy}}{\\sigma_{Edx}}\\right)^2\\right)",
                "(F.5)–(F.7)",
            )
        };
        stappen.push(Deelstap {
            id: "wapening".to_string(),
            titel: "Benodigde wapening en betonspanning".to_string(),
            symbol: String::new(),
            article: format!("bijlage F, F.1(4) {art}"),
            formula_latex: format!("{fx_l},\\quad {fy_l},\\quad {sc_l}"),
            ingevuld_latex: format!(
                "f'_{{tdx}} = {},\\ f'_{{tdy}} = {},\\ \\sigma_{{cd}} = {}\\ \\mathrm{{N/mm^2}}",
                getal(ftx, 3),
                getal(fty, 3),
                getal(f.sigma_c, 3)
            ),
            variables: vec![],
            value: Some(f.sigma_c),
            unit: "N/mm²".to_string(),
            notes: vec![format!(
                "Benodigde trekkracht in de wapening: n_td,x = {} kN/m en n_td,z = {} kN/m (f'_td · t, \
                 t = {} mm).",
                tekst(f.f_td_x * t, 1),
                tekst(f.f_td_z * t, 1),
                tekst(t, 1)
            )],
        });
        stappen.push(Deelstap {
            id: "nu_accent".to_string(),
            titel: "Sterktereductie gescheurd beton".to_string(),
            symbol: "\\nu'".to_string(),
            article: "art. 6.5.2(2) (6.57N)".to_string(),
            formula_latex: "\\nu' = 1 - \\frac{f_{ck}}{250}".to_string(),
            ingevuld_latex: format!("1 - \\frac{{{}}}{{250}}", getal(klasse.f_ck, 1)),
            variables: vec![],
            value: Some(s.nu_accent),
            unit: "-".to_string(),
            notes: vec!["NB: \"De waarde van ν' moet gelijk aan 1 − f_ck/250 zijn genomen.\"".to_string()],
        });
        stappen.push(Deelstap {
            id: "sigma_rd_max".to_string(),
            titel: "Sterkte van de drukdiagonaal".to_string(),
            symbol: "\\sigma_{Rd,max}".to_string(),
            article: "art. 6.5.2(2) (6.56)".to_string(),
            formula_latex: "\\sigma_{Rd,max} = 0{,}6\\,\\nu'\\,f_{cd}".to_string(),
            ingevuld_latex: format!("0{{,}}6 \\cdot {} \\cdot {}", getal(s.nu_accent, 3), getal(s.f_cd, 3)),
            variables: vec![],
            value: Some(s.sigma_rd_max),
            unit: "N/mm²".to_string(),
            notes: vec![],
        });
        (
            "Betondrukdiagonaal (gescheurd)",
            "bijlage F, F.1(4); art. 6.5.2 (6.56)",
            "\\sigma_{cd} \\le \\sigma_{Rd,max}",
            "\\sigma_{cd}",
            "\\sigma_{Rd,max}",
            s.sigma_rd_max,
            vec![],
        )
    };
    let ed = f.sigma_c;
    let uc = ed / rd;
    notes.insert(
        0,
        format!("Element {} in combinatie {} is maatgevend voor deze toets.", el.element_id, p.combination_id),
    );
    let _ = id;

    ResistanceCalc {
        id: if f.gescheurd() { DIAGONAAL_ID } else { DRUK_ID }.to_string(),
        title: titel.to_string(),
        article: artikel.to_string(),
        force_state: ForceStateSnapshot {
            combination_id: p.combination_id,
            position_mm: 0.0,
            forces: InternalForces::default(),
        },
        formula_latex: formule.to_string(),
        variables: vec![nv(ed_sym, ed, "N/mm²"), nv(rd_sym, rd, "N/mm²")],
        deelstappen: stappen,
        value: ed,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck { ed, rd, uc, formula_latex: format!("{ed_sym} / {rd_sym}") }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes,
    }
}
