//! Verlopende stalen staaf — toetsing per rekenpunt (ontwerp 15-09-2026, §5).
//!
//! # WAT EEN VERLOPENDE STAAF IS
//!
//! [`BeamCheckInput::profile_name`] is het profiel aan het BEGIN (x = 0),
//! [`BeamCheckInput::profile_end`] dat aan het EIND (x = L). De vier
//! hoofdmaten h, b, t_w en t_f verlopen daartussen LINEAIR, en de doorsnede
//! telt over de hele staaf als GELAST I-profiel zonder afrondingsstraal. Dat
//! laatste is een ontwerpbesluit en geen benadering van gemak: een gelaste
//! doorsnede krijgt in tabel 6.2 de ongunstiger knikkromme (b/c in plaats van
//! a/b) en in tabel 6.5 de ongunstiger kipkromme, en een verlopende ligger
//! wórdt gelast — hij komt niet als geheel uit de walserij.
//!
//! # WAAROM DIT EEN APART PAD IS EN GEEN VLECHTWERK IN `check_beam`
//!
//! De eis bij dit spoor luidt: een PRISMATISCHE staaf mag geen enkel getal
//! veranderen. De zekerste manier om dat waar te maken is `check_beam` zelf
//! niet aan te raken behalve met één afslag bovenaan: is er geen verloop, dan
//! loopt de bestaande functie ongewijzigd door. Is er wél een verloop, dan
//! komt de staaf hier, en hier wordt `check_beam` opnieuw aangeroepen — steeds
//! op een PRISMATISCHE deelvraag met een plaatselijke `custom_section`. Zo
//! bestaat er maar één keten van toetsen, weigeringen en toelichtingen, en kan
//! die keten niet uit elkaar lopen tussen "recht" en "verlopend".
//!
//! # WELKE DEELVRAGEN
//!
//! * **Doorsnedetoetsen** (6.2.x): één deelvraag per REKENPUNT, met de
//!   plaatselijke doorsnede en uitsluitend de krachtpunten op dát punt. Per
//!   toets telt de hoogste unity check over alle rekenpunten en alle
//!   combinaties. Zo wordt het maximum van M/W gevonden, ook als dat niet bij
//!   de grootste M ligt — bij een uitkrager met verlopende hoogte ligt het
//!   maatgevende punt aantoonbaar niet aan de inklemming.
//! * **Stabiliteit** (6.3.1, 6.3.2, 6.3.3): één deelvraag per KANDIDAAT-
//!   doorsnede, met de volle omhullende. De kandidaten zijn de doorsneden op
//!   de veldgrenzen — de staafeinden en de opgegeven kipsteunen. Bij een
//!   lineair verloop ligt het uiterste van elke weerstand op een veldgrens, dus
//!   de kleinste doorsnede in elk veld zit in die verzameling. Per toets telt
//!   de ongunstigste uitkomst, en het resultaat noemt de doorsnede waarmee dat
//!   getal is bepaald.
//! * **Doorbuiging**: hangt alleen van de opgegeven zakking en de staaflengte
//!   af, niet van de doorsnede (de solver rekende de zakking al met het
//!   verloop). Komt daarom ongewijzigd uit de eerste deelvraag.

use mechanics::ForcePoint;
use nen_en_1993_1_1_section::classification::CrossSectionClass;
use nen_en_1993_1_1_section::CheckStatus;
use steel_profiles::{db, ProfileKind};

use crate::input::{BeamCheckInput, CustomLamella, CustomSection};
use crate::orchestrator::{check_beam, plak_notitie, uc_of};
use crate::result::{
    BeamCheckResult, MaatgevendPunt, NamedCheck, StabiliteitsDoorsnede, Toetsdoorsnede, ToetsUc,
    VerloopMaten, VerloopRapport,
};

/// De volgorde waarin de toetsen in het resultaat staan — dezelfde als bij een
/// prismatische staaf, zodat het rapport niets hoeft te weten van het verschil.
const VOLGORDE: [&str; 14] = [
    "6.2.4_compression",
    "6.2.5_bending_y",
    "6.2.5_bending_z",
    "6.2.6_shear_z",
    "6.2.6_shear_y",
    "6.2.8_combined_mv",
    "6.2.9_combined_mn",
    "6.2.10_combined_mnv",
    "6.3.1_buckling",
    "6.3.2_ltb",
    "6.3.3_eq_6_61",
    "6.3.3_eq_6_62",
    "deflection_w_fin",
    "deflection_w_add",
];

/// De acht toetsen die per REKENPUNT met de plaatselijke doorsnede gaan.
const DOORSNEDETOETSEN: [&str; 8] = [
    "6.2.4_compression",
    "6.2.5_bending_y",
    "6.2.5_bending_z",
    "6.2.6_shear_z",
    "6.2.6_shear_y",
    "6.2.8_combined_mv",
    "6.2.9_combined_mn",
    "6.2.10_combined_mnv",
];

/// De vier toetsen die met de kleinste doorsnede in het veld gaan.
const STABILITEITSTOETSEN: [&str; 4] =
    ["6.3.1_buckling", "6.3.2_ltb", "6.3.3_eq_6_61", "6.3.3_eq_6_62"];

/// De twee doorbuigingsregels; die hangen niet van de doorsnede af.
const DOORBUIGING: [&str; 2] = ["deflection_w_fin", "deflection_w_add"];

// ═══════════════════════════════════════════════════════════════════════════
//  Het verloop zelf
// ═══════════════════════════════════════════════════════════════════════════

/// De vier hoofdmaten van een I-profiel in mm.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Maten {
    pub h_mm: f64,
    pub b_mm: f64,
    pub tw_mm: f64,
    pub tf_mm: f64,
}

impl Maten {
    fn naar_rapport(self) -> VerloopMaten {
        VerloopMaten {
            h_mm: self.h_mm,
            b_mm: self.b_mm,
            tw_mm: Some(self.tw_mm),
            tf_mm: Some(self.tf_mm),
        }
    }
}

/// Een verlopende stalen staaf: twee catalogusprofielen met hun maten.
#[derive(Clone, Debug)]
pub struct Verloop {
    pub begin_naam: String,
    pub eind_naam: String,
    pub begin: Maten,
    pub eind: Maten,
}

impl Verloop {
    /// De maten op relatieve positie `t = x/L`, lineair tussen begin en eind.
    /// Buiten [0, 1] wordt `t` afgekapt: een rekenpunt ligt altijd op de staaf.
    pub fn maten_op(&self, t: f64) -> Maten {
        let s = t.clamp(0.0, 1.0);
        let lin = |a: f64, b: f64| a + (b - a) * s;
        Maten {
            h_mm: lin(self.begin.h_mm, self.eind.h_mm),
            b_mm: lin(self.begin.b_mm, self.eind.b_mm),
            tw_mm: lin(self.begin.tw_mm, self.eind.tw_mm),
            tf_mm: lin(self.begin.tf_mm, self.eind.tf_mm),
        }
    }

    /// De plaatselijke doorsnede als GELAST I-profiel uit drie platen: een
    /// staand lijf (h − 2·t_f) × t_w en twee liggende flenzen b × t_f op
    /// z = ±(h − t_f)/2. Geen afrondingsstraal — die hoort bij een gewalst
    /// profiel en zou hier een verzonnen maat zijn.
    ///
    /// Langs deze weg krijgt elk rekenpunt precies dezelfde behandeling als een
    /// eigen gelaste doorsnede uit de profieleditor: classificatie per plaatdeel
    /// volgens tabel 5.2, de lijfplooicontrole van NEN-EN 1993-1-5 §5.1(2), de
    /// gelaste knikkrommen van tabel 6.2 en de kipkromme voor gelaste profielen
    /// uit tabel 6.5.
    pub fn doorsnede_op(&self, t: f64, naam: &str) -> CustomSection {
        maten_naar_doorsnede(self.maten_op(t), naam)
    }
}

/// Een gelast I-profiel uit drie platen, met de naam die in het rapport komt.
pub fn maten_naar_doorsnede(m: Maten, naam: &str) -> CustomSection {
    let hw = (m.h_mm - 2.0 * m.tf_mm).max(0.0);
    let z_flens = (m.h_mm - m.tf_mm) / 2.0;
    CustomSection {
        naam: naam.to_string(),
        lamellen: vec![
            // Lijf: staand (alpha = π/2), lengte h_w, dikte t_w.
            CustomLamella {
                b_mm: hw,
                t_mm: m.tw_mm,
                y_mm: 0.0,
                z_mm: 0.0,
                alpha_rad: std::f64::consts::FRAC_PI_2,
            },
            // Onderflens en bovenflens: liggend (alpha = 0), lengte b, dikte t_f.
            CustomLamella { b_mm: m.b_mm, t_mm: m.tf_mm, y_mm: 0.0, z_mm: -z_flens, alpha_rad: 0.0 },
            CustomLamella { b_mm: m.b_mm, t_mm: m.tf_mm, y_mm: 0.0, z_mm: z_flens, alpha_rad: 0.0 },
        ],
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: crate::input::CustomDoorsnedevorm::GelasteIDubbelsymmetrisch,
    }
}

/// De vier hoofdmaten van een opgegeven doorsnede die een GELASTE,
/// dubbelsymmetrische I uit drie platen is — `None` zodra ze dat niet is.
///
/// Het omgekeerde van [`maten_naar_doorsnede`], en met opzet even streng als
/// [`CustomSection::is_dubbelsymmetrische_gelaste_i`]: die whitelist bepaalt of
/// de doorsnede de gelaste behandeling KRIJGT, en hier worden haar maten
/// teruggelezen. Wie de één verruimt zonder de ander, laat de kern rekenen met
/// maten die niet bij de getoetste vorm horen.
pub fn maten_van_gelaste_i(cs: &CustomSection) -> Option<Maten> {
    if !cs.is_dubbelsymmetrische_gelaste_i() {
        return None;
    }
    let liggend: Vec<&CustomLamella> =
        cs.lamellen.iter().filter(|l| l.alpha_rad.sin().abs() < 1e-9).collect();
    let lijf = cs.lamellen.iter().find(|l| l.alpha_rad.cos().abs() < 1e-9)?;
    let flens = liggend.first()?;
    let h = lijf.b_mm + 2.0 * flens.t_mm;
    if !(h > 0.0 && flens.b_mm > 0.0 && lijf.t_mm > 0.0 && flens.t_mm > 0.0) {
        return None;
    }
    Some(Maten { h_mm: h, b_mm: flens.b_mm, tw_mm: lijf.t_mm, tf_mm: flens.t_mm })
}

/// Is deze staaf verlopend, en zo ja met welke twee doorsneden?
///
/// `Ok(None)` = prismatisch: geen eindprofiel, een leeg eindprofiel, of
/// hetzelfde profiel (ook in een andere schrijfwijze, "IPE 300" naast
/// "IPE300"). De aanroeper loopt dan het bestaande pad en er verandert niets.
///
/// `Err` met de reden in leesbaar Nederlands zodra er wél een eindprofiel
/// staat maar er geen verloop uit te maken is. Nooit stil terugvallen op het
/// beginprofiel: dan zou de halve staaf met de verkeerde doorsnede worden
/// getoetst zonder dat iemand het ziet.
///
/// Dezelfde weigeringen als `design-mockup/src/lib/sectionResolver.ts`
/// (`bepaalVerloop`), die de stijfheid in de solver bepaalt. Wie hier een regel
/// wijzigt, wijzigt hem daar ook.
pub fn bepaal_verloop(input: &BeamCheckInput) -> Result<Option<Verloop>, String> {
    let eind = match input.profile_end.as_deref().map(str::trim) {
        None | Some("") => return Ok(None),
        Some(naam) => naam,
    };
    if eind == input.profile_name.trim() {
        return Ok(None);
    }
    let maten_van = |naam: &str, rol: &str| -> Result<(String, Maten), String> {
        let p = db().find(naam).ok_or_else(|| {
            format!(
                "{rol} \"{naam}\" is niet bekend in de EN 1993-profieldatabase — een verlopende \
                 stalen staaf loopt van I/H-profiel naar I/H-profiel uit de catalogus"
            )
        })?;
        if p.kind != ProfileKind::ISection {
            return Err(format!(
                "verlopend profiel wordt voor deze doorsnede niet ondersteund: {rol} \"{}\" is \
                 geen I/H-profiel. Alleen een I/H-profiel uit de catalogus kan verlopen; een \
                 koker, buis, hoeklijn of U-profiel niet",
                p.name
            ));
        }
        // Een I-profiel met TOELOPENDE flenzen (INP) heeft geen vaste t_f. Het
        // gelaste rekenmodel hierboven heeft evenwijdige flenzen en zou zo'n
        // profiel stilzwijgend iets anders maken.
        if p.geometry.flange_slope > 0.0 {
            return Err(format!(
                "verlopend profiel wordt voor deze doorsnede niet ondersteund: {rol} \"{}\" is een \
                 I-profiel met toelopende flenzen, en het gelaste rekenmodel van een verlopende \
                 staaf heeft evenwijdige flenzen",
                p.name
            ));
        }
        Ok((
            p.name.clone(),
            Maten {
                h_mm: p.geometry.h,
                b_mm: p.geometry.b,
                tw_mm: p.geometry.tw,
                tf_mm: p.geometry.tf,
            },
        ))
    };
    // Een uiteinde mag ook een GELASTE dubbelsymmetrische I uit drie platen
    // zijn (zie `custom_section_end`). Dat is dezelfde vorm waarmee dit
    // bestand een verlopende staaf sowieso al rekent, dus er komt geen tweede
    // rekenmodel bij: alleen een tweede manier om de maten aan te leveren.
    let van_custom = |cs: &CustomSection, rol: &str| -> Result<(String, Maten), String> {
        maten_van_gelaste_i(cs).map(|m| (cs.naam.clone(), m)).ok_or_else(|| {
            format!(
                "verlopend profiel wordt voor deze doorsnede niet ondersteund: de eigen doorsnede \
                 \"{}\" van het {rol} is geen gelast, dubbelsymmetrisch I-profiel uit drie platen \
                 (lijf plus twee gelijke flenzen). Alleen zo'n doorsnede en een I/H-profiel uit de \
                 catalogus kunnen een uiteinde van een verloop zijn",
                cs.naam
            )
        })
    };
    let (begin_naam, begin) = match &input.custom_section {
        Some(cs) => van_custom(cs, "beginprofiel")?,
        None => maten_van(input.profile_name.trim(), "beginprofiel")?,
    };
    let (eind_naam, eind) = match &input.custom_section_end {
        Some(cs) => van_custom(cs, "eindprofiel")?,
        None => maten_van(eind, "eindprofiel")?,
    };
    // Twee schrijfwijzen van hetzelfde profiel ("IPE 300" en "IPE300") zijn
    // geen verloop.
    if begin_naam == eind_naam {
        return Ok(None);
    }
    Ok(Some(Verloop { begin_naam, eind_naam, begin, eind }))
}

// ═══════════════════════════════════════════════════════════════════════════
//  De toetsing
// ═══════════════════════════════════════════════════════════════════════════

fn klasse_rang(k: CrossSectionClass) -> u8 {
    match k {
        CrossSectionClass::Class1 => 1,
        CrossSectionClass::Class2 => 2,
        CrossSectionClass::Class3 => 3,
        CrossSectionClass::Class4 => 4,
    }
}

/// Een maat in mm als tekst met decimaalkomma.
fn mm(v: f64) -> String {
    format!("{v:.1}").replace('.', ",")
}

/// De maten van één doorsnede als zin voor een toelichting.
fn maten_tekst(m: Maten) -> String {
    format!(
        "h = {} mm, b = {} mm, t_w = {} mm, t_f = {} mm",
        mm(m.h_mm),
        mm(m.b_mm),
        mm(m.tw_mm),
        mm(m.tf_mm)
    )
}

/// Wat één deelvraag opleverde.
struct Deelvraag {
    x_mm: f64,
    t: f64,
    maten: Maten,
    resultaat: BeamCheckResult,
}

impl Deelvraag {
    fn toets(&self, id: &str) -> Option<&NamedCheck> {
        self.resultaat.checks.iter().find(|c| c.id == id)
    }
}

/// De unieke rekenpunten (posities) uit de omhullende, oplopend.
fn rekenpunten(envelope: &[ForcePoint]) -> Vec<f64> {
    let mut xs: Vec<f64> = envelope.iter().map(|p| p.position_mm).collect();
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    xs.dedup_by(|a, b| (*a - *b).abs() < 1e-9);
    xs
}

/// Eén deelvraag: dezelfde staaf, maar prismatisch met de doorsnede op `x_mm`.
fn deelvraag(
    input: &BeamCheckInput,
    v: &Verloop,
    l_mm: f64,
    x_mm: f64,
    envelope: Vec<ForcePoint>,
) -> Deelvraag {
    let t = if l_mm > 0.0 { (x_mm / l_mm).clamp(0.0, 1.0) } else { 0.0 };
    let maten = v.maten_op(t);
    let naam = format!(
        "{} → {} op x = {} mm",
        v.begin_naam,
        v.eind_naam,
        mm(x_mm)
    );
    let mut deel = input.clone();
    deel.profile_end = None;
    // Ook het EINDveld wissen: de deelvraag is prismatisch, en een achtergebleven
    // `custom_section_end` zou haar opnieuw als verlopend laten lezen.
    deel.custom_section_end = None;
    deel.custom_section = Some(maten_naar_doorsnede(maten, &naam));
    deel.forces_envelope = envelope;
    Deelvraag { x_mm, t, maten, resultaat: check_beam(deel) }
}

/// Een resultaat dat zegt dat er NIET getoetst is, met de reden.
fn niet_getoetst(input: &BeamCheckInput, naam: String, reden: String) -> BeamCheckResult {
    BeamCheckResult {
        beam_id: input.beam_id,
        profile_name: naam,
        steel_grade: input.steel_grade.clone(),
        classification: CrossSectionClass::Class1,
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::NotApplicable,
        governing_check_id: reden,
        verloop: None,
    }
}

/// De naam van een verlopende staaf in het rapport.
pub fn naam_van(v: &Verloop) -> String {
    format!("{} → {} (verlopend)", v.begin_naam, v.eind_naam)
}

/// De toetsing van een verlopende stalen staaf. Zie de moduledocumentatie.
pub fn check_beam_verlopend(input: BeamCheckInput, v: Verloop) -> BeamCheckResult {
    let naam = naam_van(&v);
    let l_mm = input.length_m * 1000.0;
    if !(l_mm > 0.0) {
        return niet_getoetst(
            &input,
            naam,
            "ERROR: een verlopende staaf zonder lengte kan niet worden getoetst — zonder L is er \
             geen positie langs de staaf en dus geen plaatselijke doorsnede"
                .to_string(),
        );
    }

    // ── 1. De doorsnedetoetsen, per rekenpunt ───────────────────────────────
    let punten = rekenpunten(&input.forces_envelope);
    let punten = if punten.is_empty() { vec![0.0] } else { punten };
    let mut per_punt: Vec<Deelvraag> = Vec::with_capacity(punten.len());
    for &x in &punten {
        let envelope: Vec<ForcePoint> = input
            .forces_envelope
            .iter()
            .filter(|p| (p.position_mm - x).abs() < 1e-9)
            .cloned()
            .collect();
        let d = deelvraag(&input, &v, l_mm, x, envelope);
        // Een deelvraag die zelf weigert (onbekende staalsoort, plaatdikte
        // boven tabel 3.1, klasse 4 op deze plek) stopt de hele staaf. Een
        // staaf die op één rekenpunt niet toetsbaar is, is niet toetsbaar —
        // doorrekenen met de overige punten zou dat punt stil wegpoetsen.
        if matches!(d.resultaat.status, CheckStatus::NotApplicable)
            && d.resultaat.checks.iter().all(|c| uc_of(c) <= 0.0)
        {
            return niet_getoetst(
                &input,
                naam,
                format!(
                    "{} (op x = {} mm, t = {:.3}: {})",
                    d.resultaat.governing_check_id,
                    mm(d.x_mm),
                    d.t,
                    maten_tekst(d.maten)
                ),
            );
        }
        per_punt.push(d);
    }

    // ── 2. De stabiliteitstoetsen, per kandidaatdoorsnede ───────────────────
    //
    // De kandidaten zijn de veldgrenzen: de twee staafeinden plus elke
    // opgegeven kipsteun (aan welke flens ook). Bij een lineair verloop ligt
    // het uiterste van elke weerstand binnen een veld op een veldgrens, dus de
    // kleinste doorsnede van elk veld zit hierin.
    let mut grenzen: Vec<f64> = vec![0.0, l_mm];
    for f in input
        .lateral_bracing
        .top_flange_positions
        .iter()
        .chain(input.lateral_bracing.bottom_flange_positions.iter())
    {
        if f.is_finite() && *f > 0.0 && *f < 1.0 {
            grenzen.push(f * l_mm);
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
    let mut stabiliteit: Vec<StabiliteitsDoorsnede> = Vec::new();
    for id in VOLGORDE {
        if DOORSNEDETOETSEN.contains(&id) {
            let Some((i, mut c)) = kies(&per_punt, id) else { continue };
            let d = &per_punt[i];
            plak_notitie(
                &mut c,
                &format!(
                    "VERLOPEND PROFIEL. Deze doorsnedetoets is op elk van de {} rekenpunten met de \
                     PLAATSELIJKE doorsnede uitgevoerd (ontwerpbesluit 15-09-2026). Maatgevend is \
                     x = {} mm (t = x/L = {:.3}) met {}. Het maatgevende punt hoeft niet bij de \
                     grootste snedekracht te liggen: bij een verlopende staaf telt de verhouding \
                     van kracht tot plaatselijke weerstand.",
                    per_punt.len(),
                    mm(d.x_mm),
                    d.t,
                    maten_tekst(d.maten)
                ),
            );
            checks.push(c);
        } else if STABILITEITSTOETSEN.contains(&id) {
            let Some((i, mut c)) = kies(&per_grens, id) else { continue };
            let d = &per_grens[i];
            let reden = format!(
                "VERLOPEND PROFIEL. Stabiliteit wordt veilig-zijdig met de KLEINSTE doorsnede in \
                 het beschouwde veld gerekend (ontwerpbesluit 15-09-2026). Alle {} \
                 kandidaatdoorsneden op de veldgrenzen (x = {}) zijn doorgerekend; maatgevend is \
                 x = {} mm met {}. De doorsnede telt daarbij als GELAST I-profiel: knikkromme uit \
                 tabel 6.2 en kipkromme uit tabel 6.5 voor gelaste profielen, zonder \
                 afrondingsstraal.",
                per_grens.len(),
                grenzen.iter().map(|x| format!("{} mm", mm(*x))).collect::<Vec<_>>().join(", "),
                mm(d.x_mm),
                maten_tekst(d.maten)
            );
            plak_notitie(&mut c, &reden);
            let props = maten_naar_doorsnede(d.maten, "").naar_composite().bereken().props;
            stabiliteit.push(StabiliteitsDoorsnede {
                toets_id: id.to_string(),
                veld: String::new(),
                x_mm: d.x_mm,
                maten: d.maten.naar_rapport(),
                area_mm2: props.area_mm2,
                w_y_mm3: props.wpl_y_mm3,
                reden,
            });
            checks.push(c);
        } else if DOORBUIGING.contains(&id) {
            // Hangt niet van de doorsnede af: de zakking komt uit de solver,
            // die al met het verloop rekende. Elke deelvraag geeft hier
            // hetzelfde; de eerste volstaat.
            if let Some(c) = per_grens.first().and_then(|d| d.toets(id)) {
                checks.push(c.clone());
            }
        }
    }

    // Losse meldingen over de doorsnede (bijvoorbeeld een gesloten cel) horen
    // vooraan, net als bij een prismatische staaf. Een gelaste I uit drie
    // platen levert ze niet, maar ze stil laten vallen zou een gat zijn.
    let mut extra: Vec<NamedCheck> = Vec::new();
    for d in per_punt.iter().chain(per_grens.iter()) {
        for c in &d.resultaat.checks {
            if !VOLGORDE.contains(&c.id.as_str()) && !extra.iter().any(|e| e.id == c.id) {
                extra.push(c.clone());
            }
        }
    }
    extra.extend(checks);
    let checks = extra;

    // ── 4. Het rapportdeel: zes toetsdoorsneden en het maatgevende punt ─────
    let rapport = bouw_rapport(&v, &per_punt, l_mm, stabiliteit);

    // ── 5. Samenvatten ──────────────────────────────────────────────────────
    let classification = per_punt
        .iter()
        .map(|d| d.resultaat.classification)
        .max_by_key(|k| klasse_rang(*k))
        .unwrap_or(CrossSectionClass::Class1);
    let mut uc_max = 0.0_f64;
    let mut governing_check_id = String::new();
    for c in &checks {
        let uc = uc_of(c);
        if uc > uc_max {
            uc_max = uc;
            governing_check_id = c.id.clone();
        }
    }
    let status = if uc_max <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };

    BeamCheckResult {
        beam_id: input.beam_id,
        profile_name: naam,
        steel_grade: input.steel_grade.clone(),
        classification,
        checks,
        uc_max,
        status,
        governing_check_id,
        verloop: Some(rapport),
    }
}

/// De zes toetsdoorsneden, het maatgevende punt en de gebruikte
/// stabiliteitsdoorsneden — alles wat het rapport over het verloop toont.
fn bouw_rapport(
    v: &Verloop,
    per_punt: &[Deelvraag],
    l_mm: f64,
    stabiliteit: Vec<StabiliteitsDoorsnede>,
) -> VerloopRapport {
    let doorsnede_van = |d: &Deelvraag| -> Toetsdoorsnede {
        let props = maten_naar_doorsnede(d.maten, "").naar_composite().bereken().props;
        Toetsdoorsnede {
            x_mm: d.x_mm,
            t: d.t,
            maten: d.maten.naar_rapport(),
            area_mm2: props.area_mm2,
            w_y_mm3: props.wpl_y_mm3,
            klasse: Some(d.resultaat.classification),
            toetsen: DOORSNEDETOETSEN
                .iter()
                .filter_map(|id| {
                    d.toets(id).map(|c| ToetsUc {
                        id: (*id).to_string(),
                        uc: match &c.kind {
                            crate::result::CheckKind::Resistance(r)
                                if !matches!(r.status, CheckStatus::NotApplicable) =>
                            {
                                r.uc.as_ref().map(|u| u.uc)
                            }
                            crate::result::CheckKind::Stability(s)
                                if !matches!(s.status, CheckStatus::NotApplicable) =>
                            {
                                s.uc.as_ref().map(|u| u.uc)
                            }
                            _ => None,
                        },
                    })
                })
                .collect(),
        }
    };

    // De zes gevraagde plaatsen x = 0, L/5, …, L; per plaats het rekenpunt dat
    // er het dichtst bij ligt. Valt er tweemaal hetzelfde rekenpunt uit (een
    // korte omhullende), dan staat het één keer in de tabel.
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

    // Het maatgevende punt over alle doorsnedetoetsen en alle rekenpunten.
    let mut maatgevend: Option<MaatgevendPunt> = None;
    for d in per_punt {
        for id in DOORSNEDETOETSEN {
            let Some(c) = d.toets(id) else { continue };
            let uc = uc_of(c);
            if uc > 0.0 && maatgevend.as_ref().map_or(true, |m| uc > m.uc) {
                maatgevend = Some(MaatgevendPunt {
                    toets_id: id.to_string(),
                    uc,
                    doorsnede: doorsnede_van(d),
                });
            }
        }
    }

    VerloopRapport {
        begin_naam: v.begin_naam.clone(),
        eind_naam: v.eind_naam.clone(),
        begin: v.begin.naar_rapport(),
        eind: v.eind.naar_rapport(),
        aantal_rekenpunten: per_punt.len() as u32,
        toetsdoorsneden,
        maatgevend,
        stabiliteit,
        notities: vec![
            format!(
                "VERLOPEND PROFIEL {} → {}. De maten h, b, t_w en t_f verlopen LINEAIR over de \
                 staaf; de doorsnede telt over de hele lengte als GELAST I-profiel zonder \
                 afrondingsstraal (ontwerpbesluit 15-09-2026, §2). Begin: {}. Eind: {}.",
                v.begin_naam,
                v.eind_naam,
                maten_tekst(v.begin),
                maten_tekst(v.eind)
            ),
            format!(
                "Elke doorsnedetoets (6.2.x) is op alle {} rekenpunten met de plaatselijke \
                 doorsnede uitgevoerd, inclusief de classificatie volgens tabel 5.2; de \
                 stabiliteitstoetsen (6.3.x) rekenen veilig-zijdig met de kleinste doorsnede in \
                 het beschouwde veld.",
                per_punt.len()
            ),
            "Tweede orde binnen de staaf (P·δ) blijft buiten beschouwing, net als bij een \
             prismatische staaf; de algemene methode van NEN-EN 1993-1-1 6.3.4 voor staven met \
             veranderlijke doorsnede is niet geïmplementeerd."
                .to_string(),
        ],
    }
}
