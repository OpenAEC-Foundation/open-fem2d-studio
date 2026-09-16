//! Hout (massief en gelijmd gelamineerd): de spanningen in de MATERIAALASSEN
//! per element, volgens NEN-EN 1995-1-1:2005+A2:2014+NB:2013.
//!
//! # Van globale assen naar de vezel
//!
//! De solver levert σx, σy (verticaal) en τxy. Met de hoofdrichting θ van de
//! plaat (graden tegen de klok in vanaf de globale x-as naar richting 1, de
//! vezel) volgt, met c = cos θ en s = sin θ:
//!
//! ```text
//!   σ₁  = σx·c² + σy·s² + 2·τxy·s·c        langs de vezel
//!   σ₂  = σx·s² + σy·c² − 2·τxy·s·c        loodrecht op de vezel
//!   τ₁₂ = (σy − σx)·s·c + τxy·(c² − s²)
//! ```
//!
//! — dezelfde transformatie als `spanningInMateriaalassen` in de app, hier in
//! de kern omdat de norm erop rekent.
//!
//! # Wat getoetst wordt
//!
//! Rekenwaarden f_d = k_mod·f_k/γ_M (2.14), met k_mod uit tabel 3.1 per
//! UGT-combinatie (belastingduur, 3.1.3(2)) en de klimaatklasse, γ_M uit de
//! normnaad (tabel 2.3 met de NB) en f_k uit de sterkteklasse. Per element en
//! per combinatie:
//!
//! * 6.1.2 (6.1)  trek evenwijdig aan de vezel:    σ_t,0,d ≤ f_t,0,d
//! * 6.1.4 (6.2)  druk evenwijdig aan de vezel:    σ_c,0,d ≤ f_c,0,d
//! * 6.1.5 (6.3)  druk loodrecht op de vezel:      σ_c,90,d ≤ k_c,90·f_c,90,d
//! * 6.1.7 (6.13) afschuiving:                     τ_d ≤ f_v,d
//! * 6.2.2 (6.16) druk onder een hoek met de vezel, voor elke hoofddrukspanning
//!
//! # De interactie in een vlakspanningstoestand
//!
//! 6.1 geldt voor een element dat "enkel onderhevig is aan spanningen volgens
//! één van de hoofdassen" (6.1.1(1)). Voor gecombineerde spanningen geeft 6.2
//! alleen de interactie van drukspanningen: 6.2.2(1)P "Er moet rekening zijn
//! gehouden met de interactie van drukspanningen in twee of meer richtingen",
//! met (6.16) voor een drukspanning onder een hoek α met de vezel. Een algemene
//! interactieformule voor σ₁, σ₂ en τ₁₂ samen geeft de norm niet. Daarom:
//! elke component afzonderlijk, én (6.16) op elke hoofddrukspanning met haar
//! hoek tot de vezel. Een drukspanning onder een hoek is precies een
//! hoofdspanning; bij tweeassige druk wordt (6.16) op beide hoofdspanningen
//! toegepast. Dat staat als notitie bij de toets.
//!
//! # Wat NIET getoetst wordt — en de status bepaalt
//!
//! Trek loodrecht op de vezel. 6.1.3(1)P zegt alleen: "Het volume-effect van
//! een element moet in rekening zijn gebracht", zonder uitdrukking; voor
//! gelijmd gelamineerd hout eist 3.3(5)P hetzelfde. Zonder die uitdrukking zou
//! σ_t,90,d ≤ f_t,90,d een toets zijn die de norm NIET geeft (en die door het
//! ontbrekende volume-effect aan de onveilige kant ligt). Staat er in een
//! element trek loodrecht op de vezel, dan is de plaat daarom niet volledig
//! getoetst: status `NotApplicable`, met de grootste σ_t,90,d en waar die zit.
//!
//! Verder niet: stabiliteit (6.3 geeft knik- en kipregels voor staven, geen
//! plooi van een schijf) en de verbindingen.

use mechanics::{ForceStateSnapshot, InternalForces};
use nationale_bijlage::{Aanduidingen, Ndp1995};
use nen_en_1993_1_1_section::{CheckStatus, Deelstap, NamedValue, ResistanceCalc, UnityCheck};
use nen_en_1995_1_1::{k_mod, strength_class_by_name, LoadDurationClass, ServiceClass, StrengthClass, TimberType};
use steel_check::{CheckKind, NamedCheck};
use timber_check::belastingduur::duurklasse_naam;

use crate::input::{PlaatElementSpanning, PlateCheckInput};
use crate::latex::{factor, getal, tekst};
use crate::result::{PlaatNietGetoetst, PlateCheckResult};
use crate::verzamel::{verzamel, Punt};
use crate::{geweigerd, status_uit};

pub const TREK_0_ID: &str = "6.1.2_trek_evenwijdig";
pub const DRUK_0_ID: &str = "6.1.4_druk_evenwijdig";
pub const DRUK_90_ID: &str = "6.1.5_druk_loodrecht";
pub const AFSCHUIF_ID: &str = "6.1.7_afschuiving";
pub const DRUK_HOEK_ID: &str = "6.2.2_druk_onder_hoek";
pub const TREK_90_ID: &str = "6.1.3_trek_loodrecht";

/// k_c,90 volgens 6.1.5(2): "De waarde van k_c,90 behoort gelijk te zijn aan
/// 1,0, tenzij de voorwaarden uit de volgende paragrafen van toepassing zijn".
/// Die paragrafen (3) en (4) gaan over elementen op steunpunten met een
/// contactlengte; een spanningsveld in een schijf valt daar niet onder.
pub const K_C90: f64 = 1.0;

/// Onder deze trekspanning loodrecht op de vezel (N/mm²) telt zij als
/// afwezig: rekenruis, geen spanning. 10⁻⁶ N/mm² is een duizendste kPa.
pub const TREK_90_DREMPEL: f64 = 1e-6;

/// Spanning in de materiaalassen.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Materiaalassen {
    pub sigma_1: f64,
    pub sigma_2: f64,
    pub tau_12: f64,
}

pub fn naar_materiaalassen(sx: f64, sy: f64, txy: f64, hoek_graden: f64) -> Materiaalassen {
    let t = hoek_graden.to_radians();
    let (s, c) = (t.sin(), t.cos());
    Materiaalassen {
        sigma_1: sx * c * c + sy * s * s + 2.0 * txy * s * c,
        sigma_2: sx * s * s + sy * c * c - 2.0 * txy * s * c,
        tau_12: (sy - sx) * s * c + txy * (c * c - s * s),
    }
}

/// De twee hoofdspanningen met hun richting (graden vanaf de globale x-as).
pub fn hoofdspanningen(sx: f64, sy: f64, txy: f64) -> [(f64, f64); 2] {
    let m = 0.5 * (sx + sy);
    let r = (0.25 * (sx - sy) * (sx - sy) + txy * txy).sqrt();
    let hoek = 0.5 * (2.0 * txy).atan2(sx - sy);
    [(m + r, hoek.to_degrees()), (m - r, hoek.to_degrees() + 90.0)]
}

/// f_c,α,d volgens (6.16).
pub fn f_c_alfa_d(f_c0d: f64, f_c90d: f64, alfa_graden: f64) -> f64 {
    let a = alfa_graden.to_radians();
    f_c0d / (f_c0d / (K_C90 * f_c90d) * a.sin().powi(2) + a.cos().powi(2))
}

/// De rekensterkten bij één k_mod.
#[derive(Clone, Copy, Debug)]
struct Sterkten {
    t0: f64,
    c0: f64,
    c90: f64,
    v: f64,
}

fn sterkten(klasse: &StrengthClass, km: f64, gamma_m: f64) -> Sterkten {
    Sterkten {
        t0: km * klasse.f_t0k / gamma_m,
        c0: km * klasse.f_c0k / gamma_m,
        c90: km * klasse.f_c90k / gamma_m,
        v: km * klasse.f_vk / gamma_m,
    }
}

/// De unity checks van één element bij één stel rekensterkten.
fn beoordeel(el: &PlaatElementSpanning, hoek: f64, s: &Sterkten) -> Vec<(String, f64)> {
    let m = naar_materiaalassen(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa, hoek);
    let mut uit = Vec::with_capacity(5);
    if m.sigma_1 > 0.0 {
        uit.push((TREK_0_ID.to_string(), m.sigma_1 / s.t0));
    } else if m.sigma_1 < 0.0 {
        uit.push((DRUK_0_ID.to_string(), -m.sigma_1 / s.c0));
    }
    if m.sigma_2 < 0.0 {
        uit.push((DRUK_90_ID.to_string(), -m.sigma_2 / (K_C90 * s.c90)));
    }
    if m.tau_12 != 0.0 {
        uit.push((AFSCHUIF_ID.to_string(), m.tau_12.abs() / s.v));
    }
    let hoek_uc = hoofdspanningen(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa)
        .iter()
        .filter(|(sp, _)| *sp < 0.0)
        .map(|(sp, richting)| -sp / f_c_alfa_d(s.c0, s.c90, richting - hoek))
        .fold(None, |acc: Option<f64>, u| Some(acc.map_or(u, |a| a.max(u))));
    if let Some(u) = hoek_uc {
        uit.push((DRUK_HOEK_ID.to_string(), u));
    }
    uit
}

pub fn toets(input: &PlateCheckInput) -> PlateCheckResult {
    let Some(klasse) = strength_class_by_name(input.materiaal.trim()) else {
        return geweigerd(
            input,
            format!(
                "houtsterkteklasse \"{}\" staat niet in de tabel van de rekenkern (EN 338 / EN 14080); \
                 er is niet getoetst",
                input.materiaal
            ),
        );
    };
    let Some(klimaat) = input.service_class else {
        return geweigerd(
            input,
            "de klimaatklasse ontbreekt (`service_class`); zonder klimaatklasse is k_mod (tabel 3.1) \
             niet te bepalen en er wordt geen klasse aangenomen; er is niet getoetst"
                .to_string(),
        );
    };
    for c in &input.combinations {
        if !input.load_duration_per_combination.iter().any(|d| d.combination_id == c.combination_id) {
            return geweigerd(
                input,
                format!(
                    "voor combinatie {} is geen belastingduurklasse opgegeven \
                     (`load_duration_per_combination`); k_mod hangt per combinatie af van de \
                     kortste belastingsduur erin (3.1.3(2)) en wordt niet aangenomen; er is niet \
                     getoetst",
                    c.combination_id
                ),
            );
        }
    }
    let ndp = Ndp1995::voor(input.bijlage);
    let gamma_m = match klasse.timber_type {
        TimberType::Solid => ndp.gamma_m_massief,
        TimberType::Glulam => ndp.gamma_m_gelamineerd,
    };
    let hoek = input.hoofdrichting_graden;
    let duur_van = |comb: u32| -> LoadDurationClass {
        input
            .load_duration_per_combination
            .iter()
            .find(|d| d.combination_id == comb)
            .map(|d| d.load_duration)
            .expect("hierboven gecontroleerd")
    };
    let sterkte_van = |comb: u32| sterkten(klasse, k_mod(klasse.timber_type, klimaat, duur_van(comb)), gamma_m);

    // Trek loodrecht op de vezel: niet toetsbaar, wél opzoeken waar en hoeveel.
    let mut trek90: Option<(f64, u32, u32)> = None;
    let v = verzamel(input, |comb, el| {
        let m = naar_materiaalassen(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa, hoek);
        if m.sigma_2 > TREK_90_DREMPEL && trek90.map_or(true, |(s, _, _)| m.sigma_2 > s) {
            trek90 = Some((m.sigma_2, el.element_id, comb));
        }
        beoordeel(el, hoek, &sterkte_van(comb))
    });
    if v.per_toets.is_empty() && trek90.is_none() {
        return geweigerd(
            input,
            "de plaat heeft geen elementspanningen in een UGT-combinatie; reken het model eerst door"
                .to_string(),
        );
    }

    let mut niet_getoetst = Vec::new();
    if let Some((s, element, comb)) = trek90 {
        niet_getoetst.push(PlaatNietGetoetst {
            id: TREK_90_ID.to_string(),
            titel: "Trek loodrecht op de vezel (6.1.3)".to_string(),
            reden: format!(
                "In deze plaat staat trek loodrecht op de vezel: σ_t,90,d tot {} N/mm² (element {} in \
                 combinatie {}). NEN-EN 1995-1-1 6.1.3(1)P eist dat \"het volume-effect van een element\" \
                 in rekening is gebracht, maar geeft daar geen uitdrukking voor{}. Een toets \
                 σ_t,90,d ≤ f_t,90,d zonder dat effect geeft de norm niet en zou aan de onveilige kant \
                 liggen. Deze component is NIET getoetst; de plaat heet daarom niet \"voldoet\".",
                tekst(s, 3),
                element,
                comb,
                if klasse.timber_type == TimberType::Glulam {
                    "; voor gelijmd gelamineerd hout eist 3.3(5)P hetzelfde"
                } else {
                    ""
                }
            ),
            bepaalt_status: true,
        });
    }
    niet_getoetst.push(PlaatNietGetoetst {
        id: "6.3_stabiliteit".to_string(),
        titel: "Stabiliteit van de schijf (6.3)".to_string(),
        reden: "6.3 geeft knik- en kipregels voor staven (kolommen en liggers), geen toets voor het \
                plooien van een schijf die in haar vlak op druk of afschuiving belast is. Niet \
                getoetst; \"voldoet\" gaat alleen over de sterkte van de elementen."
            .to_string(),
        bepaalt_status: false,
    });

    let checks: Vec<NamedCheck> = v
        .per_toets
        .iter()
        .map(|m| NamedCheck {
            id: m.check_id.clone(),
            kind: CheckKind::Resistance(afleiding(
                &m.check_id,
                &m.punt,
                hoek,
                klasse,
                klimaat,
                duur_van(m.punt.combination_id),
                basis_van(input, m.punt.combination_id),
                gamma_m,
            )),
        })
        .collect();
    let maatgevend = v.per_toets.iter().max_by(|a, b| a.punt.uc.total_cmp(&b.punt.uc));
    let uc_max = maatgevend.map_or(0.0, |m| m.punt.uc);

    let mut notes = input.notities.clone();
    notes.push(format!(
        "Getoetst in de materiaalassen: hoofdrichting (vezel) {}° vanaf de globale x-as, klimaatklasse {}, \
         γ_M = {} (tabel 2.3 met de NB), sterkteklasse {} ({}). k_mod per combinatie uit tabel 3.1 met \
         de kortste belastingsduur in die combinatie (3.1.3(2)).",
        tekst(hoek, 2),
        match klimaat {
            ServiceClass::Sc1 => "1",
            ServiceClass::Sc2 => "2",
            ServiceClass::Sc3 => "3",
        },
        tekst(gamma_m, 2),
        klasse.name,
        match klasse.timber_type {
            TimberType::Solid => "massief hout, EN 338",
            TimberType::Glulam => "gelijmd gelamineerd hout, EN 14080",
        }
    ));
    notes.push(
        "Interactie: 6.1 geldt voor spanning in één hoofdrichting (6.1.1(1)); voor gecombineerde \
         spanningen geeft 6.2.2 alleen de interactie van drukspanningen, met (6.16) voor een \
         drukspanning onder een hoek met de vezel. Er is geen algemene interactieformule voor σ₁, σ₂ \
         en τ₁₂ samen. Getoetst is daarom elke component afzonderlijk (6.1.2, 6.1.4, 6.1.5, 6.1.7) en \
         (6.16) op elke hoofddrukspanning met haar hoek tot de vezel."
            .to_string(),
    );
    notes.push(
        "Getoetst per element met de elementgemiddelde spanning; een spanningspiek bij een \
         inspringende hoek of opening wordt over het element uitgemiddeld — verfijn daar het mesh."
            .to_string(),
    );
    if let Some(m) = maatgevend {
        notes.push(format!(
            "Maatgevend: {} in element {}, combinatie {}.",
            m.check_id, m.punt.element.element_id, m.punt.combination_id
        ));
    }

    PlateCheckResult {
        plate_id: input.plate_id,
        soort: input.soort,
        materiaal: klasse.name.to_string(),
        thickness_mm: input.thickness_mm,
        norm: Aanduidingen::voor(input.bijlage).norm_hout_vol.to_string(),
        status: status_uit(uc_max, &niet_getoetst),
        checks,
        uc_max,
        governing_check_id: maatgevend.map(|m| m.check_id.clone()).unwrap_or_default(),
        governing_element_id: maatgevend.map(|m| m.punt.element.element_id),
        governing_combination_id: maatgevend.map(|m| m.punt.combination_id),
        combinaties: v.per_combinatie,
        elementen: v.per_element,
        niet_getoetst,
        geweigerd: None,
        notes,
    }
}

fn basis_van(input: &PlateCheckInput, comb: u32) -> String {
    input
        .load_duration_per_combination
        .iter()
        .find(|d| d.combination_id == comb)
        .map(|d| d.basis.clone())
        .unwrap_or_default()
}

fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue { symbol: symbol.to_string(), value, unit: unit.to_string() }
}

#[allow(clippy::too_many_arguments)]
fn afleiding(
    id: &str,
    p: &Punt,
    hoek: f64,
    klasse: &StrengthClass,
    klimaat: ServiceClass,
    duur: LoadDurationClass,
    basis: String,
    gamma_m: f64,
) -> ResistanceCalc {
    let el = &p.element;
    let km = k_mod(klasse.timber_type, klimaat, duur);
    let m = naar_materiaalassen(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa, hoek);

    // (symbool f_k, waarde f_k, symbool f_d, titel, artikel, uitdrukking σ, symbool σ)
    let (fk_sym, fk, fd_sym, titel, artikel) = match id {
        TREK_0_ID => ("f_{t,0,k}", klasse.f_t0k, "f_{t,0,d}", "Trek evenwijdig aan de vezel", "art. 6.1.2 (6.1)"),
        DRUK_0_ID => ("f_{c,0,k}", klasse.f_c0k, "f_{c,0,d}", "Druk evenwijdig aan de vezel", "art. 6.1.4 (6.2)"),
        DRUK_90_ID => ("f_{c,90,k}", klasse.f_c90k, "f_{c,90,d}", "Druk loodrecht op de vezel", "art. 6.1.5 (6.3)"),
        AFSCHUIF_ID => ("f_{v,k}", klasse.f_vk, "f_{v,d}", "Afschuiving in het vlak", "art. 6.1.7 (6.13)"),
        _ => ("f_{c,0,k}", klasse.f_c0k, "f_{c,0,d}", "Druk onder een hoek met de vezel", "art. 6.2.2 (6.16)"),
    };
    let fd = km * fk / gamma_m;

    let mut stappen = vec![
        Deelstap {
            id: "k_mod".to_string(),
            titel: "Modificatiefactor".to_string(),
            symbol: "k_{mod}".to_string(),
            article: "tabel 3.1".to_string(),
            formula_latex: "k_{mod}".to_string(),
            ingevuld_latex: String::new(),
            variables: vec![],
            value: Some(km),
            unit: "-".to_string(),
            notes: {
                let mut n = vec![format!(
                    "Belastingduurklasse {} (combinatie {}), klimaatklasse {}.",
                    duurklasse_naam(duur),
                    p.combination_id,
                    match klimaat {
                        ServiceClass::Sc1 => "1",
                        ServiceClass::Sc2 => "2",
                        ServiceClass::Sc3 => "3",
                    }
                )];
                if !basis.is_empty() {
                    n.push(basis);
                }
                n
            },
        },
        Deelstap {
            id: "f_d".to_string(),
            titel: "Rekenwaarde van de sterkte".to_string(),
            symbol: fd_sym.to_string(),
            article: "art. 2.4.1 (2.14)".to_string(),
            formula_latex: format!("{fd_sym} = \\frac{{k_{{mod}} \\, {fk_sym}}}{{\\gamma_M}}"),
            ingevuld_latex: format!("\\frac{{{} \\cdot {}}}{{{}}}", getal(km, 3), getal(fk, 3), getal(gamma_m, 3)),
            variables: vec![nv("k_{mod}", km, "-"), nv(fk_sym, fk, "N/mm²"), nv("\\gamma_M", gamma_m, "-")],
            value: Some(fd),
            unit: "N/mm²".to_string(),
            notes: vec![format!(
                "{} uit sterkteklasse {}; γ_M = {} uit de nationale bijlage (tabel 2.3).",
                fk_sym.replace(['{', '}'], ""),
                klasse.name,
                tekst(gamma_m, 2)
            )],
        },
        Deelstap {
            id: "materiaalassen".to_string(),
            titel: "Spanning in de materiaalassen".to_string(),
            symbol: String::new(),
            article: String::new(),
            formula_latex: "\\sigma_1 = \\sigma_x c^2 + \\sigma_y s^2 + 2\\tau_{xy} s c,\\quad \\sigma_2 = \\sigma_x s^2 + \\sigma_y c^2 - 2\\tau_{xy} s c,\\quad \\tau_{12} = (\\sigma_y - \\sigma_x) s c + \\tau_{xy}(c^2 - s^2)".to_string(),
            ingevuld_latex: format!(
                "\\theta = {}^\\circ:\\ \\sigma_1 = {},\\ \\sigma_2 = {},\\ \\tau_{{12}} = {}\\ \\mathrm{{N/mm^2}}",
                getal(hoek, 2),
                getal(m.sigma_1, 3),
                getal(m.sigma_2, 3),
                getal(m.tau_12, 3)
            ),
            variables: vec![
                nv("\\sigma_x", el.sigma_x_mpa, "N/mm²"),
                nv("\\sigma_y", el.sigma_y_mpa, "N/mm²"),
                nv("\\tau_{xy}", el.tau_xy_mpa, "N/mm²"),
                nv("\\theta", hoek, "°"),
            ],
            value: None,
            unit: String::new(),
            notes: vec![format!(
                "Element {} in combinatie {}; θ is de hoofdrichting van de plaat (vezel) vanaf de \
                 globale x-as, c = cos θ en s = sin θ. σ_y is de verticale richting van het model; trek positief.",
                el.element_id, p.combination_id
            )],
        },
    ];

    let mut notes = vec![format!(
        "Element {} in combinatie {} is maatgevend voor deze toets.",
        el.element_id, p.combination_id
    )];
    let (formule, ed_sym, ed, rd) = match id {
        TREK_0_ID => {
            notes.push(
                "k_h = 1,0: 3.2(3) en 3.3(3) staan een verhoging van f_t,0,k voor een kleine breedte toe \
                 (\"mogen\"); voor een schijf is die breedte niet eenduidig en de verhoging is niet \
                 toegepast — aan de veilige kant."
                    .to_string(),
            );
            ("\\sigma_{t,0,d} \\le f_{t,0,d}", "\\sigma_{t,0,d}", m.sigma_1, fd)
        }
        DRUK_0_ID => ("\\sigma_{c,0,d} \\le f_{c,0,d}", "\\sigma_{c,0,d}", -m.sigma_1, fd),
        DRUK_90_ID => {
            notes.push(format!(
                "k_c,90 = {}: 6.1.5(2) — de hogere waarden van (3) en (4) gelden voor elementen op \
                 steunpunten met een contactlengte, niet voor een spanningsveld in een schijf. σ_c,90,d \
                 is de spanning in het element zelf.",
                tekst(K_C90, 2)
            ));
            ("\\sigma_{c,90,d} \\le k_{c,90} \\, f_{c,90,d}", "\\sigma_{c,90,d}", -m.sigma_2, K_C90 * fd)
        }
        AFSCHUIF_ID => {
            notes.push(
                "b_ef = k_cr·b (6.13a) hoort bij de afschuifweerstand van elementen bij buiging \
                 (6.1.7(2)); voor schuifspanning in het vlak van een schijf is niet gereduceerd (de NB \
                 schrijft voor een prismatische doorsnede bovendien k_cr = 1,0 voor)."
                    .to_string(),
            );
            ("\\tau_d \\le f_{v,d}", "\\tau_d", m.tau_12.abs(), fd)
        }
        _ => {
            // (6.16): de hoofddrukspanning met de hoogste UC.
            let f_c90d = km * klasse.f_c90k / gamma_m;
            let (sp, alfa, fca) = hoofdspanningen(el.sigma_x_mpa, el.sigma_y_mpa, el.tau_xy_mpa)
                .iter()
                .filter(|(s, _)| *s < 0.0)
                .map(|(s, r)| (*s, r - hoek, f_c_alfa_d(fd, f_c90d, r - hoek)))
                .max_by(|a, b| (-a.0 / a.2).total_cmp(&(-b.0 / b.2)))
                .expect("maatgevend punt heeft een hoofddrukspanning");
            stappen.push(Deelstap {
                id: "f_c90d".to_string(),
                titel: "Rekenwaarde druk loodrecht op de vezel".to_string(),
                symbol: "f_{c,90,d}".to_string(),
                article: "art. 2.4.1 (2.14)".to_string(),
                formula_latex: "f_{c,90,d} = \\frac{k_{mod} \\, f_{c,90,k}}{\\gamma_M}".to_string(),
                ingevuld_latex: format!("\\frac{{{} \\cdot {}}}{{{}}}", getal(km, 3), getal(klasse.f_c90k, 3), getal(gamma_m, 3)),
                variables: vec![],
                value: Some(f_c90d),
                unit: "N/mm²".to_string(),
                notes: vec![],
            });
            stappen.push(Deelstap {
                id: "hoofdspanning".to_string(),
                titel: "Hoofddrukspanning en hoek met de vezel".to_string(),
                symbol: "\\sigma_{c,\\alpha,d}".to_string(),
                article: String::new(),
                formula_latex: "\\sigma_{I,II} = \\frac{\\sigma_x + \\sigma_y}{2} \\pm \\sqrt{\\left(\\frac{\\sigma_x - \\sigma_y}{2}\\right)^2 + \\tau_{xy}^2}".to_string(),
                ingevuld_latex: format!(
                    "\\sigma_{{c,\\alpha,d}} = {} \\ \\mathrm{{N/mm^2}},\\ \\alpha = {}^\\circ",
                    getal(-sp, 3),
                    getal(alfa, 2)
                ),
                variables: vec![],
                value: Some(-sp),
                unit: "N/mm²".to_string(),
                notes: vec![
                    "α is de hoek tussen de richting van de hoofddrukspanning en de vezel. Bij tweeassige \
                     druk is (6.16) op beide hoofdspanningen toegepast; de hoogste UC staat hier."
                        .to_string(),
                ],
            });
            stappen.push(Deelstap {
                id: "f_c_alfa_d".to_string(),
                titel: "Druksterkte onder een hoek".to_string(),
                symbol: "f_{c,\\alpha,d}".to_string(),
                article: "art. 6.2.2 (6.16)".to_string(),
                formula_latex: "f_{c,\\alpha,d} = \\frac{f_{c,0,d}}{\\frac{f_{c,0,d}}{k_{c,90} f_{c,90,d}} \\sin^2\\alpha + \\cos^2\\alpha}".to_string(),
                ingevuld_latex: format!(
                    "\\frac{{{fc0}}}{{\\frac{{{fc0}}}{{{kc} \\cdot {fc90}}} \\sin^2({a}^\\circ) + \\cos^2({a}^\\circ)}}",
                    fc0 = getal(fd, 3),
                    kc = getal(K_C90, 2),
                    fc90 = getal(f_c90d, 3),
                    a = factor(alfa, 2)
                ),
                variables: vec![],
                value: Some(fca),
                unit: "N/mm²".to_string(),
                notes: vec![format!("k_c,90 = {} (6.1.5(2)).", tekst(K_C90, 2))],
            });
            ("\\sigma_{c,\\alpha,d} \\le f_{c,\\alpha,d}", "\\sigma_{c,\\alpha,d}", -sp, fca)
        }
    };
    let uc = ed / rd;
    notes.push(format!("k_mod = {} ({}).", tekst(km, 2), duurklasse_naam(duur)));
    let rd_sym = match id {
        DRUK_90_ID => "k_{c,90} f_{c,90,d}",
        DRUK_HOEK_ID => "f_{c,\\alpha,d}",
        _ => fd_sym,
    };

    ResistanceCalc {
        id: id.to_string(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// Dezelfde twee invarianten als de app-kant (`spanningInMateriaalassen`):
    /// σ₁ + σ₂ = σx + σy en σ₁·σ₂ − τ₁₂² = σx·σy − τxy².
    #[test]
    fn transformatie_bewaart_de_invarianten() {
        for hoek in [0.0, 17.0, 30.0, 45.0, 90.0, 133.0] {
            let m = naar_materiaalassen(3.0, -2.0, 1.5, hoek);
            assert_relative_eq!(m.sigma_1 + m.sigma_2, 1.0, epsilon = 1e-12);
            assert_relative_eq!(m.sigma_1 * m.sigma_2 - m.tau_12 * m.tau_12, -6.0 - 2.25, epsilon = 1e-12);
        }
        let m = naar_materiaalassen(3.0, -2.0, 1.5, 90.0);
        assert_relative_eq!(m.sigma_1, -2.0, epsilon = 1e-12);
        assert_relative_eq!(m.sigma_2, 3.0, epsilon = 1e-12);
    }

    #[test]
    fn f_c_alfa_d_randen() {
        assert_relative_eq!(f_c_alfa_d(12.0, 1.5, 0.0), 12.0, epsilon = 1e-12);
        assert_relative_eq!(f_c_alfa_d(12.0, 1.5, 90.0), 1.5, epsilon = 1e-12);
    }
}
