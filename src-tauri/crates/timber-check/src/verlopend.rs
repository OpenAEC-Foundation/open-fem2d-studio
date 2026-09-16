//! Verlopende houten staaf — toetsing per rekenpunt (ontwerp 15-09-2026, §5).
//!
//! # WAAROM HOUT DIT NODIG HEEFT
//!
//! De aanleiding van het hele spoor is een houten balklaag die voor afschot
//! schuin wordt afgezaagd: de rekenhoogte h verloopt lineair over de
//! overspanning. Twee dingen lopen dan mee die bij een prismatische balk vast
//! liggen:
//!
//!  * **W_y = b·h²/6** loopt met h², terwijl het moment zijn eigen verloop
//!    heeft. Het maatgevende punt is daarom NIET vanzelf de plaats van het
//!    grootste moment, en toetsen op alleen die plaats mist het maximum.
//!  * **k_h** van §3.2(3) (gezaagd hout) en §3.3(3) (gelijmd gelamineerd hout)
//!    hangt rechtstreeks aan de hoogte: onder 150 mm (gezaagd) respectievelijk
//!    600 mm (GL) verhoogt hij f_m,k en f_t,0,k. Bij een verlopende balk is
//!    k_h dus op elk rekenpunt een ander getal, en hij hoort per punt bepaald
//!    te worden — niet één keer op de beginhoogte.
//!
//! # HOE
//!
//! Zoals bij staal (`steel_check::verlopend`): dit is een APART pad dat
//! [`check_timber_beam`] telkens opnieuw aanroept met een PRISMATISCHE
//! deelvraag. Zonder eindmaten valt de afslag weg en verandert er aan een
//! bestaande staaf geen enkel getal.
//!
//!  * **Doorsnedetoetsen** §6.1 (trek, druk, buiging, afschuiving): één
//!    deelvraag per rekenpunt, met de plaatselijke rechthoek b(x) × h(x) en
//!    alleen de krachtpunten op dat punt. Per toets telt de hoogste unity
//!    check over alle punten en alle combinaties — de belastingduurklassen van
//!    §3.1.3(2) blijven daarbinnen gewoon werken, want elke deelvraag doorloopt
//!    de volle keten.
//!  * **Stabiliteit** §6.3.2 (kolomknik) en §6.3.3 (kip): één deelvraag per
//!    kandidaatdoorsnede op de veldgrenzen — de staafeinden en de opgegeven
//!    zijdelingse steunen. Bij een lineair verloop ligt het uiterste van elke
//!    weerstand op een veldgrens, dus de kleinste doorsnede in elk veld zit in
//!    die verzameling; per toets telt de ongunstigste uitkomst.
//!  * **Doorbuiging** §7.2: hangt alleen van de opgegeven zakkingen en de
//!    lengte af — de solver rekende die al met het verloop — en komt
//!    ongewijzigd uit de eerste deelvraag.

use mechanics::ForcePoint;
use nen_en_1993_1_1_section::CheckStatus;
use steel_check::{
    CheckKind, MaatgevendPunt, NamedCheck, StabiliteitsDoorsnede, Toetsdoorsnede, ToetsUc,
    VerloopMaten, VerloopRapport,
};

use crate::input::TimberBeamCheckInput;
use crate::orchestrator::check_timber_beam;
use crate::result::TimberBeamCheckResult;

/// De volgorde waarin de toetsen in het resultaat staan — dezelfde als bij een
/// prismatische staaf.
const VOLGORDE: [&str; 8] = [
    "6.1.2_tension",
    "6.1.4_compression",
    "6.1.6_bending",
    "6.1.7_shear",
    "6.3.2_column_stability",
    "6.3.3_beam_stability",
    "deflection_w_fin",
    "deflection_w_add",
];

/// De vier doorsnedetoetsen van §6.1, per rekenpunt met de plaatselijke maten.
const DOORSNEDETOETSEN: [&str; 4] =
    ["6.1.2_tension", "6.1.4_compression", "6.1.6_bending", "6.1.7_shear"];

/// De twee stabiliteitstoetsen, met de kleinste doorsnede in het veld.
const STABILITEITSTOETSEN: [&str; 2] = ["6.3.2_column_stability", "6.3.3_beam_stability"];

/// De twee doorbuigingsregels; die hangen niet van de doorsnede af.
const DOORBUIGING: [&str; 2] = ["deflection_w_fin", "deflection_w_add"];

/// De maten van een rechthoekige houten doorsnede in mm.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Maten {
    pub b_mm: f64,
    pub h_mm: f64,
}

impl Maten {
    fn naar_rapport(self) -> VerloopMaten {
        // t_w en t_f bestaan niet bij een rechthoek; ze blijven leeg in plaats
        // van 0,0 — een nul zou als "een plaat van nul dik" gelezen worden.
        VerloopMaten { h_mm: self.h_mm, b_mm: self.b_mm, tw_mm: None, tf_mm: None }
    }
    fn area_mm2(self) -> f64 {
        self.b_mm * self.h_mm
    }
    /// W_el,y = b·h²/6 — bij hout is er geen plastisch weerstandsmoment.
    fn w_y_mm3(self) -> f64 {
        self.b_mm * self.h_mm * self.h_mm / 6.0
    }
    fn naam(self) -> String {
        format!("{} x {}", nl(self.b_mm), nl(self.h_mm))
    }
}

/// Een verlopende houten staaf: de rechthoek aan begin en eind.
#[derive(Clone, Copy, Debug)]
pub struct Verloop {
    pub begin: Maten,
    pub eind: Maten,
}

impl Verloop {
    /// De maten op relatieve positie `t = x/L`, lineair tussen begin en eind.
    pub fn maten_op(&self, t: f64) -> Maten {
        let s = t.clamp(0.0, 1.0);
        Maten {
            b_mm: self.begin.b_mm + (self.eind.b_mm - self.begin.b_mm) * s,
            h_mm: self.begin.h_mm + (self.eind.h_mm - self.begin.h_mm) * s,
        }
    }
}

/// Een maat in mm als tekst met decimaalkomma, zonder overbodige nul.
fn nl(v: f64) -> String {
    let s = format!("{v:.1}");
    s.strip_suffix(".0").unwrap_or(&s).replace('.', ",")
}

fn maten_tekst(m: Maten) -> String {
    format!("b = {} mm, h = {} mm", nl(m.b_mm), nl(m.h_mm))
}

/// Is deze staaf verlopend, en zo ja met welke twee rechthoeken?
///
/// `Ok(None)` = prismatisch: geen eindmaten, of eindmaten gelijk aan het begin.
/// `Err` met de reden zodra er wél eindmaten staan maar er geen verloop uit te
/// maken is — nooit stil terugvallen op de beginmaten.
pub fn bepaal_verloop(input: &TimberBeamCheckInput) -> Result<Option<Verloop>, String> {
    if input.width_end_mm.is_none() && input.height_end_mm.is_none() {
        return Ok(None);
    }
    if input.custom_section.is_some() {
        return Err(
            "verlopend profiel wordt voor een samengestelde doorsnede niet ondersteund: de staaf \
             heeft zowel een eigen doorsnede als eindmaten. Een verlopende houten staaf loopt van \
             rechthoek b×h naar rechthoek b×h"
                .to_string(),
        );
    }
    // Eén opgegeven maat betekent: de andere verloopt niet.
    let begin = Maten { b_mm: input.width_mm, h_mm: input.height_mm };
    let eind = Maten {
        b_mm: input.width_end_mm.unwrap_or(input.width_mm),
        h_mm: input.height_end_mm.unwrap_or(input.height_mm),
    };
    for (m, waar) in [(begin, "begin"), (eind, "eind")] {
        if !(m.b_mm.is_finite() && m.b_mm > 0.0 && m.h_mm.is_finite() && m.h_mm > 0.0) {
            return Err(format!(
                "de doorsnede aan het {waar} van de staaf ({}) is geen bruikbare rechthoek — \
                 breedte en hoogte moeten groter dan nul zijn",
                maten_tekst(m)
            ));
        }
    }
    if (begin.b_mm - eind.b_mm).abs() < 1e-9 && (begin.h_mm - eind.h_mm).abs() < 1e-9 {
        return Ok(None);
    }
    Ok(Some(Verloop { begin, eind }))
}

/// De naam van een verlopende houten staaf in het rapport.
pub fn naam_van(v: &Verloop) -> String {
    format!("{} → {} (verlopend)", v.begin.naam(), v.eind.naam())
}

fn uc_of(c: &NamedCheck) -> f64 {
    let (uc, skip) = match &c.kind {
        CheckKind::Resistance(r) => (
            r.uc.as_ref().map(|u| u.uc),
            matches!(r.status, CheckStatus::NotApplicable),
        ),
        CheckKind::Stability(s) => (
            s.uc.as_ref().map(|u| u.uc),
            matches!(s.status, CheckStatus::NotApplicable),
        ),
    };
    if skip { 0.0 } else { uc.unwrap_or(0.0) }
}

fn uc_optie(c: &NamedCheck) -> Option<f64> {
    match &c.kind {
        CheckKind::Resistance(r) if !matches!(r.status, CheckStatus::NotApplicable) => {
            r.uc.as_ref().map(|u| u.uc)
        }
        CheckKind::Stability(s) if !matches!(s.status, CheckStatus::NotApplicable) => {
            s.uc.as_ref().map(|u| u.uc)
        }
        _ => None,
    }
}

fn plak_notitie(c: &mut NamedCheck, tekst: &str) {
    match &mut c.kind {
        CheckKind::Resistance(r) => r.notes.push(tekst.to_string()),
        CheckKind::Stability(s) => s.notes.push(tekst.to_string()),
    }
}

fn combinatie_van(c: &NamedCheck) -> u32 {
    match &c.kind {
        CheckKind::Resistance(r) => r.force_state.combination_id,
        CheckKind::Stability(s) => s.force_state.combination_id,
    }
}

/// Wat één deelvraag opleverde.
struct Deelvraag {
    x_mm: f64,
    t: f64,
    maten: Maten,
    resultaat: TimberBeamCheckResult,
}

impl Deelvraag {
    fn toets(&self, id: &str) -> Option<&NamedCheck> {
        self.resultaat.checks.iter().find(|c| c.id == id)
    }
}

fn deelvraag(
    input: &TimberBeamCheckInput,
    v: &Verloop,
    l_mm: f64,
    x_mm: f64,
    envelope: Vec<ForcePoint>,
) -> Deelvraag {
    let t = if l_mm > 0.0 { (x_mm / l_mm).clamp(0.0, 1.0) } else { 0.0 };
    let maten = v.maten_op(t);
    let mut deel = input.clone();
    deel.width_end_mm = None;
    deel.height_end_mm = None;
    deel.width_mm = maten.b_mm;
    deel.height_mm = maten.h_mm;
    deel.forces_envelope = envelope;
    Deelvraag { x_mm, t, maten, resultaat: check_timber_beam(deel) }
}

fn niet_getoetst(
    input: &TimberBeamCheckInput,
    naam: String,
    reden: String,
) -> TimberBeamCheckResult {
    TimberBeamCheckResult {
        beam_id: input.beam_id,
        section_name: naam,
        strength_class: input.strength_class.clone(),
        service_class: input.service_class,
        load_duration: input.load_duration,
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::NotApplicable,
        governing_check_id: reden,
        k_mod_per_load_duration: vec![],
        governing_combination_id: None,
        verloop: None,
    }
}

/// De toetsing van een verlopende houten staaf. Zie de moduledocumentatie.
pub fn check_timber_beam_verlopend(
    input: TimberBeamCheckInput,
    v: Verloop,
) -> TimberBeamCheckResult {
    let naam = naam_van(&v);
    let l_mm = input.length_m * 1e3;
    if !(l_mm > 0.0) {
        return niet_getoetst(
            &input,
            naam,
            "ERROR: een verlopende staaf zonder lengte kan niet worden getoetst — zonder L is er \
             geen positie langs de staaf en dus geen plaatselijke doorsnede"
                .to_string(),
        );
    }

    // ── 1. Doorsnedetoetsen §6.1, per rekenpunt ─────────────────────────────
    let mut punten: Vec<f64> = input.forces_envelope.iter().map(|p| p.position_mm).collect();
    punten.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    punten.dedup_by(|a, b| (*a - *b).abs() < 1e-9);
    if punten.is_empty() {
        punten.push(0.0);
    }
    let mut per_punt: Vec<Deelvraag> = Vec::with_capacity(punten.len());
    for &x in &punten {
        let envelope: Vec<ForcePoint> = input
            .forces_envelope
            .iter()
            .filter(|p| (p.position_mm - x).abs() < 1e-9)
            .cloned()
            .collect();
        let d = deelvraag(&input, &v, l_mm, x, envelope);
        if d.resultaat.checks.is_empty() {
            // De deelvraag weigerde (onbekende sterkteklasse, onbruikbare
            // doorsnede). Een staaf die op één rekenpunt niet toetsbaar is, is
            // niet toetsbaar; doorrekenen zou dat punt stil wegpoetsen.
            return niet_getoetst(
                &input,
                naam,
                format!(
                    "{} (op x = {} mm, t = {:.3}: {})",
                    d.resultaat.governing_check_id,
                    nl(d.x_mm),
                    d.t,
                    maten_tekst(d.maten)
                ),
            );
        }
        per_punt.push(d);
    }

    // ── 2. Stabiliteit §6.3.2 en §6.3.3, per kandidaatdoorsnede ─────────────
    let mut grenzen: Vec<f64> = vec![0.0, l_mm];
    if let Some(b) = input.lateral_bracing.as_ref() {
        for f in b.top_flange_positions.iter().chain(b.bottom_flange_positions.iter()) {
            if f.is_finite() && *f > 0.0 && *f < 1.0 {
                grenzen.push(f * l_mm);
            }
        }
    }
    grenzen.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    grenzen.dedup_by(|a, b| (*a - *b).abs() < 1e-6);
    let per_grens: Vec<Deelvraag> = grenzen
        .iter()
        .map(|&x| deelvraag(&input, &v, l_mm, x, input.forces_envelope.clone()))
        .collect();

    // ── 3. Per toets de maatgevende deelvraag ───────────────────────────────
    let kies = |bron: &[Deelvraag], id: &str| -> Option<(usize, NamedCheck)> {
        let mut beste: Option<(usize, f64, NamedCheck)> = None;
        for (i, d) in bron.iter().enumerate() {
            let Some(c) = d.toets(id) else { continue };
            let uc = uc_of(c);
            match &beste {
                Some((_, u, _)) if *u >= uc => {}
                _ => beste = Some((i, uc, c.clone())),
            }
        }
        beste.map(|(i, _, c)| (i, c))
    };

    let mut checks: Vec<NamedCheck> = Vec::new();
    let mut herkomst: Vec<usize> = Vec::new(); // index in per_punt/per_grens
    let mut uit_punt: Vec<bool> = Vec::new();
    let mut stabiliteit: Vec<StabiliteitsDoorsnede> = Vec::new();
    for id in VOLGORDE {
        if DOORSNEDETOETSEN.contains(&id) {
            let Some((i, mut c)) = kies(&per_punt, id) else { continue };
            let d = &per_punt[i];
            plak_notitie(
                &mut c,
                &format!(
                    "VERLOPEND PROFIEL. Deze doorsnedetoets is op elk van de {} rekenpunten met de \
                     PLAATSELIJKE rechthoek uitgevoerd, k_h van art. 3.2(3)/3.3(3) per punt met de \
                     hoogte ter plaatse (ontwerpbesluit 15-09-2026). Maatgevend is x = {} mm \
                     (t = x/L = {:.3}) met {}; W_y = b·h²/6 = {:.0} mm³. Het maatgevende punt \
                     hoeft niet bij de grootste snedekracht te liggen.",
                    per_punt.len(),
                    nl(d.x_mm),
                    d.t,
                    maten_tekst(d.maten),
                    d.maten.w_y_mm3()
                ),
            );
            checks.push(c);
            herkomst.push(i);
            uit_punt.push(true);
        } else if STABILITEITSTOETSEN.contains(&id) {
            let Some((i, mut c)) = kies(&per_grens, id) else { continue };
            let d = &per_grens[i];
            let reden = format!(
                "VERLOPEND PROFIEL. Stabiliteit wordt veilig-zijdig met de KLEINSTE doorsnede in \
                 het beschouwde veld gerekend (ontwerpbesluit 15-09-2026). Alle {} \
                 kandidaatdoorsneden op de veldgrenzen (x = {}) zijn doorgerekend; maatgevend is \
                 x = {} mm met {}.",
                per_grens.len(),
                grenzen.iter().map(|x| format!("{} mm", nl(*x))).collect::<Vec<_>>().join(", "),
                nl(d.x_mm),
                maten_tekst(d.maten)
            );
            plak_notitie(&mut c, &reden);
            stabiliteit.push(StabiliteitsDoorsnede {
                toets_id: id.to_string(),
                veld: String::new(),
                x_mm: d.x_mm,
                maten: d.maten.naar_rapport(),
                area_mm2: d.maten.area_mm2(),
                w_y_mm3: d.maten.w_y_mm3(),
                reden,
            });
            checks.push(c);
            herkomst.push(i);
            uit_punt.push(false);
        } else if DOORBUIGING.contains(&id) {
            let Some(c) = per_grens.first().and_then(|d| d.toets(id)) else { continue };
            checks.push(c.clone());
            herkomst.push(0);
            uit_punt.push(false);
        }
    }

    // ── 4. Het rapportdeel ──────────────────────────────────────────────────
    let doorsnede_van = |d: &Deelvraag| -> Toetsdoorsnede {
        Toetsdoorsnede {
            x_mm: d.x_mm,
            t: d.t,
            maten: d.maten.naar_rapport(),
            area_mm2: d.maten.area_mm2(),
            w_y_mm3: d.maten.w_y_mm3(),
            // Doorsnedeklasse is een staalbegrip (tabel 5.2); hout kent het niet.
            klasse: None,
            toetsen: DOORSNEDETOETSEN
                .iter()
                .filter_map(|id| {
                    d.toets(id).map(|c| ToetsUc { id: (*id).to_string(), uc: uc_optie(c) })
                })
                .collect(),
        }
    };
    let mut toetsdoorsneden: Vec<Toetsdoorsnede> = Vec::new();
    for k in 0..=5 {
        let doel = l_mm * (k as f64) / 5.0;
        let Some(d) = per_punt.iter().min_by(|a, b| {
            (a.x_mm - doel)
                .abs()
                .partial_cmp(&(b.x_mm - doel).abs())
                .unwrap_or(std::cmp::Ordering::Equal)
        }) else {
            continue;
        };
        if toetsdoorsneden.iter().any(|t| (t.x_mm - d.x_mm).abs() < 1e-9) {
            continue;
        }
        toetsdoorsneden.push(doorsnede_van(d));
    }
    let mut maatgevend: Option<MaatgevendPunt> = None;
    for d in &per_punt {
        for id in DOORSNEDETOETSEN {
            let Some(c) = d.toets(id) else { continue };
            let uc = uc_of(c);
            if uc > 0.0 && maatgevend.as_ref().map_or(true, |m| uc > m.uc) {
                maatgevend =
                    Some(MaatgevendPunt { toets_id: id.to_string(), uc, doorsnede: doorsnede_van(d) });
            }
        }
    }
    let rapport = VerloopRapport {
        begin_naam: v.begin.naam(),
        eind_naam: v.eind.naam(),
        begin: v.begin.naar_rapport(),
        eind: v.eind.naar_rapport(),
        aantal_rekenpunten: per_punt.len() as u32,
        toetsdoorsneden,
        maatgevend,
        stabiliteit,
        notities: vec![
            format!(
                "VERLOPEND PROFIEL {} → {}. Breedte b en hoogte h verlopen LINEAIR over de staaf \
                 (ontwerpbesluit 15-09-2026, §2). Begin: {}. Eind: {}.",
                v.begin.naam(),
                v.eind.naam(),
                maten_tekst(v.begin),
                maten_tekst(v.eind)
            ),
            format!(
                "Elke doorsnedetoets van art. 6.1 is op alle {} rekenpunten met de plaatselijke \
                 rechthoek uitgevoerd, met k_h van art. 3.2(3)/3.3(3) uit de hoogte ter plaatse; \
                 de stabiliteitstoetsen van art. 6.3.2 en 6.3.3 rekenen veilig-zijdig met de \
                 kleinste doorsnede in het beschouwde veld.",
                per_punt.len()
            ),
            "De vereenvoudigde sigma_m,crit van art. 6.3.3(2) en de effectieve kiplengte van \
             tabel 6.1 gelden voor een prismatische ligger; bij een verlopende ligger zijn zij \
             met de kleinste doorsnede in het kipveld toegepast, wat aan de veilige kant ligt."
                .to_string(),
        ],
    };

    // ── 5. Samenvatten ──────────────────────────────────────────────────────
    let mut uc_max = 0.0_f64;
    let mut governing = 0usize;
    let mut governing_check_id = String::new();
    for (i, c) in checks.iter().enumerate() {
        let uc = uc_of(c);
        if uc > uc_max {
            uc_max = uc;
            governing = i;
            governing_check_id = c.id.clone();
        }
    }
    let status = if uc_max <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };
    // De belastingduurklasse en de maatgevende combinatie komen van de
    // deelvraag die de maatgevende toets leverde; de k_mod-tabel van een
    // deelvraag met de VOLLE omhullende, want die kent alle combinaties.
    let bron: &Deelvraag = if governing_check_id.is_empty() {
        &per_grens[0]
    } else if uit_punt[governing] {
        &per_punt[herkomst[governing]]
    } else {
        &per_grens[herkomst[governing]]
    };
    let load_duration = bron.resultaat.load_duration;
    let governing_combination_id = (!governing_check_id.is_empty())
        .then(|| combinatie_van(&checks[governing]))
        .filter(|_| bron.resultaat.governing_combination_id.is_some());

    TimberBeamCheckResult {
        beam_id: input.beam_id,
        section_name: naam,
        strength_class: per_grens[0].resultaat.strength_class.clone(),
        service_class: input.service_class,
        load_duration,
        checks,
        uc_max,
        status,
        governing_check_id,
        k_mod_per_load_duration: per_grens[0].resultaat.k_mod_per_load_duration.clone(),
        governing_combination_id,
        verloop: Some(rapport),
    }
}
