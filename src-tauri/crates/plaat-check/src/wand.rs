//! Aanvullende controles voor een gewapende membraanwand. Een strook is 1 m breed.
//! §7.3.4 is beperkt tot eenassige membraantrek met symmetrische wapening;
//! schuif, tweeassige spanning en excentriciteit vragen een ander scheurmodel.
use std::collections::HashMap;

use mechanics::{ForceStateSnapshot, InternalForces};
use nationale_bijlage::Ndp1992;
use nen_en_1992_1_1::dekking::C_MIN_FLOOR_MM;
use nen_en_1992_1_1::scheurwijdte::{self as scheur, Aanhechting, Belastingsduur, Elementtype};
use nen_en_1992_1_1::{concrete_class_by_name, reinforcement_grade_by_name};
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};
use steel_check::{CheckKind, NamedCheck};

use crate::beton::bijlage_f;
use crate::input::{PlaatWapeningLaag, PlaatWapeningRichting, PlateCheckInput};
use crate::result::{
    PlaatCombinatieUitkomst, PlaatElementUitkomst, PlaatNietGetoetst, PlateCheckResult,
};

fn positief(x: f64) -> bool {
    x.is_finite() && x > 0.0
}
fn lagen(r: &PlaatWapeningRichting) -> [Option<PlaatWapeningLaag>; 2] {
    [r.zijde_1, r.zijde_2]
}
fn oppervlak(l: PlaatWapeningLaag) -> f64 {
    l.as_mm2_per_m.unwrap_or_else(|| {
        std::f64::consts::PI * l.diameter_mm.unwrap().powi(2) * 250.0 / l.hoh_mm.unwrap()
    })
}
fn totaal(r: &PlaatWapeningRichting) -> f64 {
    lagen(r).into_iter().flatten().map(oppervlak).sum()
}

/// Verdeling van een centrale membraantrekkracht over twee staafzwaartepunten.
/// N1+N2=N en -N1*a1+N2*a2=0. Geen drukwapening of buiging uit het vlak.
fn membraanverdeling(r: &PlaatWapeningRichting, t: f64) -> Option<[f64; 2]> {
    let (l1, l2) = (r.zijde_1?, r.zijde_2?);
    let a1 = t / 2.0 - l1.dekking_mm - l1.diameter_mm? / 2.0;
    let a2 = t / 2.0 - l2.dekking_mm - l2.diameter_mm? / 2.0;
    if a1 <= 0.0 || a2 <= 0.0 {
        return None;
    }
    Some([a2 / (a1 + a2), a1 / (a1 + a2)])
}

fn equivalente_oppervlakte(r: &PlaatWapeningRichting, fracties: [f64; 2]) -> f64 {
    (oppervlak(r.zijde_1.unwrap()) / fracties[0]).min(oppervlak(r.zijde_2.unwrap()) / fracties[1])
}

pub fn valideer(input: &PlateCheckInput) -> Result<(), String> {
    let Some(w) = &input.wapening_aanwezig else {
        return if input.frequente_combinaties.is_empty() {
            Ok(())
        } else {
            Err(
                "Frequente combinaties zonder aanwezige wapening: geen scheurmodel opgegeven."
                    .into(),
            )
        };
    };
    if !["B500A", "B500B", "B500C"].contains(&w.staalsoort.as_str()) {
        return Err("Onbekende betonstaalsoort; verwacht B500A, B500B of B500C.".into());
    }
    if w.f_ct_eff_mpa.is_some_and(|f| !positief(f)) {
        return Err("f_ct_eff_mpa moet eindig en positief zijn.".into());
    }
    if let Some(beton) = concrete_class_by_name(&input.materiaal.replace(' ', "")) {
        if w.f_ct_eff_mpa.is_some_and(|f| f > beton.f_ctm) {
            return Err("f_ct,eff mag voor dit scheurmodel niet hoger zijn dan f_ctm van de betonklasse (7.3.2).".into());
        }
    }
    let t = input.thickness_mm;
    if !(t * 1000.0).is_finite()
        || w.f_ct_eff_mpa
            .is_some_and(|f| !(f * t * 1000.0).is_finite())
    {
        return Err("Dikte of scheursterkte buiten het eindige rekenbereik.".into());
    }
    for (naam, r) in [("horizontaal", &w.horizontaal), ("verticaal", &w.verticaal)] {
        for (zijde, l) in lagen(r)
            .into_iter()
            .enumerate()
            .filter_map(|(i, l)| l.map(|l| (i, l)))
        {
            let geldig = match (l.diameter_mm, l.hoh_mm, l.as_mm2_per_m) {
                (Some(d), Some(s), None) => positief(d) && positief(s) && s > d,
                (None, None, Some(a)) => positief(a),
                _ => false,
            };
            if !geldig
                || !positief(l.dekking_mm)
                || l.dekking_mm + l.diameter_mm.unwrap_or(0.0) >= t
                || !positief(oppervlak_veilig(l))
            {
                return Err(format!("{naam} zijde {}: ongeldige laag; geef óf positieve Ø en h.o.h. > Ø, óf positief A_s, en een dekking die binnen de wand past.",zijde+1));
            }
        }
        if !totaal(r).is_finite() {
            return Err("Wapeningsoppervlak buiten het rekenbereik.".into());
        }
    }
    if totaal(&w.horizontaal) + totaal(&w.verticaal) > t * 1000.0 {
        return Err(
            "Opgegeven staaloppervlak past niet binnen de bruto betondoorsnede per meter.".into(),
        );
    }
    // Kruisende staven aan dezelfde zijde mogen niet dezelfde ruimte innemen.
    for i in 0..2 {
        if let (Some(h), Some(v)) = (lagen(&w.horizontaal)[i], lagen(&w.verticaal)[i]) {
            if let (Some(dh), Some(dv)) = (h.diameter_mm, v.diameter_mm) {
                if h.dekking_mm + dh > v.dekking_mm + 1e-9
                    && v.dekking_mm + dv > h.dekking_mm + 1e-9
                {
                    return Err(format!(
                        "Zijde {}: horizontale en verticale staven overlappen in de dikterichting.",
                        i + 1
                    ));
                }
            }
        }
    }
    let diepte = |i: usize| {
        [&w.horizontaal, &w.verticaal]
            .into_iter()
            .filter_map(|r| lagen(r)[i])
            .map(|l| l.dekking_mm + l.diameter_mm.unwrap_or(0.0))
            .fold(0.0, f64::max)
    };
    if diepte(0) + diepte(1) >= t {
        return Err(
            "Wapeningslagen aan beide zijden passen niet naast elkaar in de wanddikte.".into(),
        );
    }
    // Meshdekking en combinatie-identiteit worden voor iedere betonplaat
    // onafhankelijk van de wapening gevalideerd in beton::toets.
    for combinaties in [&input.combinations, &input.frequente_combinaties] {
        for c in combinaties {
            for e in &c.elements {
                if ![e.sigma_x_mpa, e.sigma_y_mpa, e.tau_xy_mpa]
                    .into_iter()
                    .all(f64::is_finite)
                {
                    return Err("Niet-eindige UGT/BGT-spanning; niet getoetst.".into());
                }
                let f = bijlage_f(e.sigma_x_mpa, e.sigma_y_mpa, e.tau_xy_mpa);
                if ![f.f_td_x * t * 1000.0, f.f_td_z * t * 1000.0, f.sigma_c]
                    .into_iter()
                    .all(f64::is_finite)
                {
                    return Err("Spanningen of dikte buiten het eindige rekenbereik.".into());
                }
            }
        }
    }
    Ok(())
}

fn oppervlak_veilig(l: PlaatWapeningLaag) -> f64 {
    match (l.diameter_mm, l.hoh_mm, l.as_mm2_per_m) {
        (Some(_), Some(_), None) | (None, None, Some(_)) => oppervlak(l),
        _ => f64::NAN,
    }
}

fn niet(r: &mut PlateCheckResult, id: &str, reden: impl Into<String>) {
    if r.niet_getoetst.iter().any(|n| n.id == id) {
        return;
    }
    r.niet_getoetst.push(PlaatNietGetoetst {
        id: id.into(),
        titel: id.replace('_', " "),
        reden: reden.into(),
        bepaalt_status: true,
    });
}

struct Verzamel<'a> {
    r: &'a mut PlateCheckResult,
    elementen: HashMap<u32, usize>,
    combinaties: HashMap<u32, usize>,
}
impl<'a> Verzamel<'a> {
    fn nieuw(r: &'a mut PlateCheckResult) -> Self {
        Self {
            elementen: r
                .elementen
                .iter()
                .enumerate()
                .map(|(i, e)| (e.element_id, i))
                .collect(),
            combinaties: r
                .combinaties
                .iter()
                .enumerate()
                .map(|(i, c)| (c.combination_id, i))
                .collect(),
            r,
        }
    }
    #[allow(clippy::too_many_arguments)]
    fn toets(
        &mut self,
        id: &str,
        titel: &str,
        artikel: &str,
        ed: f64,
        rd: f64,
        eenheid: &str,
        formule: &str,
        uitleg: String,
        punt: Option<(u32, u32)>,
        variabelen: Vec<NamedValue>,
    ) {
        // Geen oneindige JSON-getallen. MAX is uitsluitend de markering voor
        // een onbegrensde overschrijding bij nul weerstand, expliciet in notes.
        let uc = if rd == 0.0 {
            if ed == 0.0 {
                0.0
            } else {
                f64::MAX
            }
        } else {
            (ed / rd).min(f64::MAX)
        };
        let mut notes = vec![uitleg];
        if let Some((c, e)) = punt {
            notes.push(format!("Element {e}, combinatie {c}."));
        }
        if rd == 0.0 && ed > 0.0 {
            notes.push("Geen wapening/weerstand: UC is onbegrensd; de eindige MAX-waarde markeert falen voor JSON.".into());
        }
        if rd > 0.0 && !(ed / rd).is_finite() {
            notes.push(
                "UC overschrijdt het eindige rekenbereik; MAX markeert de overschrijding.".into(),
            );
        }
        let calc = ResistanceCalc {
            id: id.into(),
            title: titel.into(),
            article: artikel.into(),
            force_state: ForceStateSnapshot {
                combination_id: punt.map_or(0, |p| p.0),
                position_mm: 0.0,
                forces: InternalForces::default(),
            },
            formula_latex: formule.into(),
            variables: variabelen,
            deelstappen: vec![],
            value: ed,
            unit: eenheid.into(),
            uc: Some(UnityCheck {
                ed,
                rd,
                uc,
                formula_latex: "E_d/R_d".into(),
            }),
            status: if uc > 1.0 {
                CheckStatus::NotOk
            } else {
                CheckStatus::Ok
            },
            notes,
        };
        if let Some(check) = self.r.checks.iter_mut().find(|c| c.id == id) {
            if let CheckKind::Resistance(old) = &check.kind {
                if uc > old.uc.as_ref().unwrap().uc {
                    check.kind = CheckKind::Resistance(calc);
                }
            }
        } else {
            self.r.checks.push(NamedCheck {
                id: id.into(),
                kind: CheckKind::Resistance(calc),
            });
        }
        if uc > self.r.uc_max {
            self.r.uc_max = uc;
            self.r.governing_check_id = id.into();
            self.r.governing_combination_id = punt.map(|p| p.0);
            self.r.governing_element_id = punt.map(|p| p.1);
        }
        if let Some((c, e)) = punt {
            let ci = *self.combinaties.entry(c).or_insert_with(|| {
                self.r.combinaties.push(PlaatCombinatieUitkomst {
                    combination_id: c,
                    uc: -1.0,
                    element_id: e,
                    check_id: id.into(),
                });
                self.r.combinaties.len() - 1
            });
            if uc > self.r.combinaties[ci].uc {
                self.r.combinaties[ci] = PlaatCombinatieUitkomst {
                    combination_id: c,
                    uc,
                    element_id: e,
                    check_id: id.into(),
                };
            }
            let ei = *self.elementen.entry(e).or_insert_with(|| {
                self.r.elementen.push(PlaatElementUitkomst {
                    element_id: e,
                    uc: -1.0,
                    combination_id: c,
                    check_id: id.into(),
                });
                self.r.elementen.len() - 1
            });
            if uc > self.r.elementen[ei].uc {
                self.r.elementen[ei] = PlaatElementUitkomst {
                    element_id: e,
                    uc,
                    combination_id: c,
                    check_id: id.into(),
                };
            }
        }
    }
}
fn nv(s: &str, v: f64, u: &str) -> NamedValue {
    NamedValue {
        symbol: s.into(),
        value: v,
        unit: u.into(),
    }
}

pub fn vul_aan(input: &PlateCheckInput, r: &mut PlateCheckResult) {
    let w = input.wapening_aanwezig.as_ref().unwrap();
    let staal = reinforcement_grade_by_name(&w.staalsoort).unwrap();
    let ndp = Ndp1992::voor(input.bijlage);
    let fyd = staal.f_yk / ndp.gamma_s_blijvend;
    let t = input.thickness_mm;
    let ac = 1000.0 * t;
    r.niet_getoetst.retain(|n| {
        !["wapening_aanwezig", "9.6_wandwapening", "7.3_scheurwijdte"].contains(&n.id.as_str())
    });
    for n in &mut r.niet_getoetst {
        n.bepaalt_status = true;
    }
    niet(r,"9.6_toepassingsgebied","Wandlengte, blijvende bekisting, schillen, sleuven en korrelgrootte ontbreken: lengte/dikte ≥ 4 en aanvullende geometrie-eisen van 9.6.1 zijn niet getoetst.");
    niet(r,"9.6.4_dwarswapening",format!("Dwarswapening, opsluiting en nettype ontbreken. 9.6.4 niet getoetst; A_s,v = {:.2} mm²/m, grens 0,02 A_c = {:.2} mm²/m. Ook de voorwaarde bij hoofdwapening aan het oppervlak moet worden beoordeeld.",totaal(&w.verticaal),0.02*ac));
    niet(r,"7.3_verhinderde_vervorming","Krimp, temperatuur, verhinderde vervorming en vroegtijdige scheurvorming zijn niet uit de membraanspanningen af te leiden en niet getoetst.");
    niet(r,"4.4_duurzaamheidsdekking","Constructieklasse, ontwerplevensduur, korrelgrootte en uitvoeringstolerantie ontbreken. Volledige nominale duurzaamheidsdekking (4.4) niet getoetst; alleen de ondergrens max(Ø;10 mm) per laag.");
    let mut v = Verzamel::nieuw(r);
    for c in &input.combinations {
        for e in &c.elements {
            let f = bijlage_f(e.sigma_x_mpa, e.sigma_y_mpa, e.tau_xy_mpa);
            for (asrichting, richting, vraag) in [
                ("x", &w.horizontaal, f.f_td_x),
                ("z", &w.verticaal, f.f_td_z),
            ] {
                let verdeling = membraanverdeling(richting, t);
                if vraag > 0.0 && totaal(richting) > 0.0 && verdeling.is_none() {
                    niet(v.r,&format!("F_evenwicht_{asrichting}"),"UGT: de staafzwaartepunten van twee lagen aan weerszijden van het midden ontbreken. Alleen ΣA_s bewijst geen momentevenwicht over de dikte; deze richting is niet getoetst.");
                    continue;
                }
                let aeq =
                    verdeling.map_or(totaal(richting), |b| equivalente_oppervlakte(richting, b));
                v.toets(&format!("F_wapening_{asrichting}"),&format!("Aanwezige trekwapening {asrichting}"),"F.1 (F.1)–(F.7)",
                    vraag*t*1000.0/fyd,aeq,"mm²/m",r"A_{s,req}=f'_{td}t\,1000/f_{yd}\le\min(A_{s,1}/\beta_1;A_{s,2}/\beta_2)",
                    "UGT; x horizontaal, z verticaal; trek positief. Centrale membraantrek: β1=a2/(a1+a2), β2=a1/(a1+a2), met ai de afstand van het staafzwaartepunt tot het midden. Elke zijde draagt haar evenwichtsaandeel; geen drukwapening.".into(),
                    Some((c.combination_id,e.element_id)),vec![nv("f_{yd}",fyd,"N/mm²"),nv("f'_{td}",vraag,"N/mm²"),nv("t",t,"mm")]);
                if let Some(beta) = verdeling {
                    for i in 0..2 {
                        let l = lagen(richting)[i].unwrap();
                        v.toets(&format!("F_wapening_{asrichting}_zijde_{}",i+1),"Trekwapening per zijde bij centrale membraankracht","F.1 en momentevenwicht over de dikte",
                            vraag*t*1000.0/fyd*beta[i],oppervlak(l),"mm²/m",r"A_{s,req,i}=\beta_i f'_{td}t\,1000/f_{yd}\le A_{s,i}",
                            "Evenwicht: N1+N2=N en -N1·a1+N2·a2=0. Geen redistributie via drukwapening of buiging uit het vlak.".into(),Some((c.combination_id,e.element_id)),
                            vec![nv("beta_i",beta[i],"-"),nv("a_i",t/2.0-l.dekking_mm-l.diameter_mm.unwrap()/2.0,"mm")]);
                    }
                }
            }
        }
    }
    let dubbel = [&w.horizontaal, &w.verticaal]
        .iter()
        .any(|r| r.zijde_1.is_some() && r.zijde_2.is_some());
    v.toets("9.6_dikte","Minimale wanddikte","9.6.1(2)",if dubbel {120.0} else {100.0},t,"mm",r"h_{min}\le h",
        "Basiseis; toeslagen voor blijvende bekisting en schillen en de korrelgrootte zijn niet inbegrepen.".into(),None,vec![]);
    v.toets(
        "9.6_v_max",
        "Maximum verticale wapening",
        "9.6.2(1) NB",
        totaal(&w.verticaal),
        ndp.wand_rho_v_max * ac,
        "mm²/m",
        r"A_{s,v}\le0.04 A_c",
        "Beide zijden samen; overlappingslassen en uitvoerbaarheid niet getoetst.".into(),
        None,
        vec![],
    );
    for (asrichting, richting, minratio) in [
        ("x", &w.horizontaal, ndp.wand_rho_h_min),
        ("z", &w.verticaal, ndp.wand_rho_v_min),
    ] {
        v.toets(&format!("9.6_min_{asrichting}"),"Nominale minimumwandwapening","9.6.2(1)/9.6.3(1) NB",minratio*ac,totaal(richting),"mm²/m",r"A_{s,min}\le A_s",
            "Nederlandse bijlage: nominaal minimum nul; benodigde trekwapening en scheurminimum blijven afzonderlijk gelden.".into(),None,vec![]);
        let trekrichting = input
            .frequente_combinaties
            .iter()
            .flat_map(|c| c.elements.iter())
            .any(|e| {
                let (langs, dwars) = if asrichting == "x" {
                    (e.sigma_x_mpa, e.sigma_y_mpa)
                } else {
                    (e.sigma_y_mpa, e.sigma_x_mpa)
                };
                langs > 1e-9 && dwars.abs() <= 1e-9 && e.tau_xy_mpa.abs() <= 1e-9
            });
        if !trekrichting {
            niet(v.r,&format!("7.3.2_trekbasis_{asrichting}"),"Geen aangetoonde eenassige membraantrek in deze richting onder frequente BGT. Scheuroorzaak en trekzone voor 7.3.2 zijn niet bepaald; een hypothetische volledige trekzone bewijst geen tekort.");
        } else if let Some(fct) = w.f_ct_eff_mpa {
            let amin = scheur::a_s_min_mm2(1.0, 1.0, fct, ac, staal.f_yk).unwrap();
            let aeq = membraanverdeling(richting, t).map(|b| equivalente_oppervlakte(richting, b));
            if aeq.is_some_and(|a| a >= amin) {
                v.toets(&format!("7.3.2_min_{asrichting}"),"Voldoende wapening voor bovengrens bij volledige trek","7.3.2 (7.1)",amin,aeq.unwrap(),"mm²/m",r"A_{s,min}=k_c k f_{ct,eff} A_{ct}/f_{yk}\le A_{s,eq}",
                    "Eenassige BGT-trek aangetoond. Voldoende voor bovengrens k_c=k=1 en A_ct=1000t, met evenwicht per zijde. Dit is een voldoende voorwaarde; een kleinere opgave bewijst zonder scheuroorzaak/trekzone geen normtekort.".into(),None,
                    vec![nv("k_c",1.0,"-"),nv("k",1.0,"-"),nv("f_{ct,eff}",fct,"N/mm²"),nv("A_{ct}",ac,"mm²"),nv("f_{yk}",staal.f_yk,"N/mm²")]);
            } else {
                let id = format!("7.3.2_min_{asrichting}");
                let reden="Bovengrens voor volledige trek niet aangetoond. Scheuroorzaak, werkelijke trekzone en toepasselijke reductie zijn nodig; dit is geen bewezen normoverschrijding.";
                niet(v.r, &id, reden);
                v.r.checks.push(NamedCheck {
                    id: id.clone(),
                    kind: CheckKind::Resistance(ResistanceCalc {
                        id,
                        title: "Scheurminimum: bovengrens niet aangetoond".into(),
                        article: "7.3.2 (7.1)".into(),
                        force_state: ForceStateSnapshot {
                            combination_id: 0,
                            position_mm: 0.0,
                            forces: InternalForces::default(),
                        },
                        formula_latex: r"A_{s,bovengrens}=f_{ct,eff}\,1000t/f_{yk}".into(),
                        variables: vec![nv("A_{s,opgegeven}", totaal(richting), "mm²/m")],
                        deelstappen: vec![],
                        value: amin,
                        unit: "mm²/m".into(),
                        uc: None,
                        status: CheckStatus::NotApplicable,
                        notes: vec![reden.into()],
                    }),
                });
            }
        } else {
            niet(v.r,"7.3.2_minimum","Treksterkte f_ct,eff op het verwachte scheurtijdstip ontbreekt; minimumscheurwapening niet getoetst.");
        }
        for (i, laag) in lagen(richting).into_iter().enumerate() {
            let naam = format!("{asrichting}_zijde_{}", i + 1);
            let Some(l) = laag else {
                niet(v.r,&format!("9.6_laag_{naam}"),"Geen laag opgegeven: verdeling en staafafstanden aan deze zijde niet getoetst (9.6.2/9.6.3). Bijlage F rekent de opgegeven som wel door.");
                continue;
            };
            if let (Some(d), Some(s)) = (l.diameter_mm, l.hoh_mm) {
                v.toets(&format!("4.4_dekking_{naam}"),"Ondergrens betondekking","4.4.1.2 (4.2), tabel 4.2",d.max(C_MIN_FLOOR_MM),l.dekking_mm,"mm",r"\max(\phi;10)\le c",
                    format!("Laag {naam}; afzonderlijke staven. Geen volledige c_nom-toets: toeslagen en duurzaamheid ontbreken."),None,vec![]);
                v.toets(
                    &format!("9.6_diameter_{naam}"),
                    "Minimum staafdiameter",
                    "9.6.1(3)",
                    5.0,
                    d,
                    "mm",
                    r"5\le\phi",
                    format!("Laag {naam}."),
                    None,
                    vec![],
                );
                v.toets(
                    &format!("9.6_afstand_{naam}"),
                    "Maximale staafafstand",
                    "9.6.2(3)/9.6.3(2)",
                    s,
                    if asrichting == "z" {
                        (3.0 * t).min(400.0)
                    } else {
                        400.0
                    },
                    "mm",
                    r"s\le s_{max}",
                    format!("Laag {naam}; elke zijde afzonderlijk."),
                    None,
                    vec![],
                );
            } else {
                niet(v.r,&format!("9.6_geometrie_{naam}"),"Alleen A_s opgegeven: diameter, staafafstand en geometrische passing niet volledig te controleren.");
            }
        }
    }
    scheurcontroles(input, &mut v);
    v.r.notes.push("Wandcontrole met aanwezige wapening: UGT en frequente BGT afzonderlijk. Plaatstatus omvat alle uitgevoerde controles; NotApplicable bij ontbrekende controles, NotOk bij een aangetoonde overschrijding. Dit is geen volledige veiligheidsverklaring.".into());
    v.r.status = crate::status_uit(v.r.uc_max, &v.r.niet_getoetst);
}

fn scheurcontroles(input: &PlateCheckInput, v: &mut Verzamel<'_>) {
    let w = input.wapening_aanwezig.as_ref().unwrap();
    let (Some(fct), Some(lang), Some(hoog), Some(milieu)) = (
        w.f_ct_eff_mpa,
        w.langdurend,
        w.hoge_aanhechting,
        w.milieuklasse,
    ) else {
        niet(v.r,"7.3_scheurwijdte","Scheurbasis onvolledig: f_ct,eff, belastingsduur, aanhechting en milieuklasse zijn nodig.");
        return;
    };
    let wmax = match scheur::w_max_mm(milieu, Elementtype::Betonstaal) {
        Ok(x) => x,
        Err(e) => {
            niet(v.r, "7.3_scheurwijdte", e);
            return;
        }
    };
    if input.frequente_combinaties.is_empty() {
        niet(
            v.r,
            "7.3_scheurwijdte",
            "Geen frequente BGT-combinaties (6.15b) beschikbaar.",
        );
        return;
    }
    let beton = concrete_class_by_name(&input.materiaal.replace(' ', "")).unwrap();
    let staal = reinforcement_grade_by_name(&w.staalsoort).unwrap();
    let kt = if lang {
        Belastingsduur::Langdurend
    } else {
        Belastingsduur::Kortdurend
    }
    .k_t();
    let k1 = if hoog {
        Aanhechting::Hoog
    } else {
        Aanhechting::Glad
    }
    .k_1();
    for c in &input.frequente_combinaties {
        for e in &c.elements {
            // Alleen eenassige membraanspanning: dan volgt σ_s=N/A_s direct
            // uit gescheurd evenwicht, zonder bijlage F als BGT-model te misbruiken.
            if e.tau_xy_mpa.abs() > 1e-9
                || (e.sigma_x_mpa.abs() > 1e-9 && e.sigma_y_mpa.abs() > 1e-9)
            {
                niet(v.r,"7.3_spanningstoestand",format!("Element {}, combinatie {}: schuif of tweeassige spanning; gescheurd evenwicht en scheurrichting niet bepaald. Geen scheurwijdte voor deze toestand.",e.element_id,c.combination_id));
                continue;
            }
            for (asrichting, richting, sigma) in [
                ("x", &w.horizontaal, e.sigma_x_mpa),
                ("z", &w.verticaal, e.sigma_y_mpa),
            ] {
                if sigma <= 1e-9 {
                    continue;
                }
                let (Some(a), Some(b)) = (richting.zijde_1, richting.zijde_2) else {
                    niet(v.r,&format!("7.3_lagen_{asrichting}"),"Scheurwijdte vraagt twee symmetrische lagen met bekende diameter en afstand; excentriciteit niet berekend.");
                    continue;
                };
                let (Some(d), Some(s)) = (a.diameter_mm, a.hoh_mm) else {
                    niet(
                        v.r,
                        &format!("7.3_lagen_{asrichting}"),
                        "Alleen A_s: diameter en afstand ontbreken voor scheurwijdte.",
                    );
                    continue;
                };
                if a != b
                    || s > 5.0 * (a.dekking_mm + d / 2.0)
                    || a.dekking_mm < d.max(C_MIN_FLOOR_MM)
                    || d < 5.0
                {
                    niet(v.r,&format!("7.3_lagen_{asrichting}"),"Scheurmodel vereist symmetrische lagen, Ø ≥ 5 mm, c ≥ max(Ø;10 mm) en s ≤ 5(c+Ø/2). Volledige nominale dekking niet bepaald; (7.14) en excentrische trek niet ondersteund.");
                    continue;
                }
                let ss = sigma * input.thickness_mm * 1000.0 / totaal(richting);
                if ss > staal.f_yk {
                    v.toets(
                        &format!("7.3_staal_{asrichting}"),
                        "Elastisch bereik staal BGT",
                        "7.3.4(2)",
                        ss,
                        staal.f_yk,
                        "N/mm²",
                        r"\sigma_s\le f_{yk}",
                        "BGT-staal vloeit; elastische scheurformule niet bruikbaar.".into(),
                        Some((c.combination_id, e.element_id)),
                        vec![],
                    );
                    niet(
                        v.r,
                        &format!("7.3_vloeien_{asrichting}"),
                        "BGT-staalspanning boven f_yk: geen geldige elastische scheurwijdte.",
                    );
                    continue;
                }
                // Volledige axiale trek: effectieve trekzone per zijde, figuur 7.1c.
                // Geen fictieve drukzone x=0 met de buigterm (h-x)/3.
                let heff = (2.5 * (a.dekking_mm + d / 2.0)).min(input.thickness_mm / 2.0);
                let rho = scheur::rho_p_eff(oppervlak(a), 1000.0 * heff).unwrap();
                let eps = scheur::rekverschil(ss, kt, fct, rho, scheur::alpha_e(beton.e_cm))
                    .unwrap()
                    .0;
                let sr = scheur::scheurafstand(
                    a.dekking_mm,
                    d,
                    rho,
                    k1,
                    1.0,
                    beton.f_ck,
                    Some(s),
                    input.thickness_mm,
                    0.0,
                )
                .unwrap();
                for zijde in 1..=2 {
                    v.toets(&format!("7.3.4_{asrichting}_zijde_{zijde}"),"Scheurwijdte eenassige membraantrek","7.3.4 (7.8)–(7.11), NB tabel 7.1N",scheur::w_k_mm(sr.s_r_max_mm,eps),wmax,"mm",r"w_k=s_{r,max}(\varepsilon_{sm}-\varepsilon_{cm})\le w_{max}",
                        "Frequente BGT, gescheurde strook: σ_s=σ_c·1000t/ΣA_s. Symmetrische lagen, k_2=1. Per zijde A_c,eff=1000·min(2,5(c+Ø/2);t/2). Geen verhoging w_max voor dekking.".into(),Some((c.combination_id,e.element_id)),
                        vec![nv("\u{03c3}_s",ss,"N/mm²"),nv("k_t",kt,"-"),nv("k_1",k1,"-"),nv("h_{c,eff}",heff,"mm"),nv("rho_{eff}",rho,"-"),nv("s_{r,max}",sr.s_r_max_mm,"mm"),nv("epsilon",eps,"-")]);
                }
            }
        }
    }
}
