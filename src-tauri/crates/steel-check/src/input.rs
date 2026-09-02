//! Input types for steel-check orchestrator.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForcePoint;
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use section_properties::SectionProperties;
use section_properties::composite::{CompositeSection, GeslotenCel, Lamella};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum DeflectionClass { Floor, Roof, Cantilever, Custom }

/// Invoer van één staaltoetsing.
///
/// `deny_unknown_fields`: een onbekend veld is een **fout**, geen ruis. Vijf
/// velden hieronder hebben `#[serde(default)]`, en een tikfout in zo'n
/// veldnaam zou anders stilzwijgend op 0 uitkomen. Bij `q_equiv_n_per_mm` en
/// `z_a_mm` valt de kiptoets daarmee *gunstiger* uit dan hij hoort te zijn —
/// onveilig aan de verkeerde kant, en onzichtbaar in het resultaat.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct BeamCheckInput {
    pub beam_id: u32,
    pub profile_name: String,
    pub steel_grade: String,
    pub length_m: f64,
    pub forces_envelope: Vec<ForcePoint>,
    pub lateral_bracing: LateralBracing,
    pub buckling_length_y_m: f64,
    pub buckling_length_z_m: f64,
    pub deflection_limit_class: DeflectionClass,
    pub deflection_limit_numerator: u32,
    pub deflection_actual_max_mm: f64,
    pub is_cantilever: bool,
    pub consequence_class: ConsequenceClass,
    /// Zeeg (pre-camber) in mm, zelfde tekenconventie als de doorbuiging.
    #[serde(default)]
    pub pre_camber_mm: f64,
    /// Doorbuiging onder de permanente BGT-combinatie (mm), voor w_add.
    #[serde(default)]
    pub deflection_permanent_mm: f64,
    /// Equivalente gelijkmatig verdeelde belasting in het kipveld (N/mm),
    /// voor B* volgens NB.NB.4.3(3). 0 = alleen eindmomenten.
    #[serde(default)]
    pub q_equiv_n_per_mm: f64,
    /// Afstand zwaartepunt → aangrijpingspunt van de belasting (mm).
    /// Positief = boven het zwaartepunt (destabiliserend, bijvoorbeeld een
    /// belasting op de bovenflens: z_a ≈ h/2).
    #[serde(default)]
    pub z_a_mm: f64,
    /// Inline opgegeven doorsnede (D4.3). Is dit veld gevuld, dan wordt de
    /// profielendatabase **niet** geraadpleegd en rekent de toetsing op deze
    /// doorsnede. `None` (of ontbrekend in de JSON) = het bestaande pad via
    /// [`BeamCheckInput::profile_name`], bit-identiek aan voorheen.
    ///
    /// `#[ts(optional)]`: in TypeScript is het veld weglaatbaar, zodat de
    /// bestaande bouwers in de frontend ongewijzigd blijven compileren.
    #[serde(default)]
    #[ts(optional)]
    pub custom_section: Option<CustomSection>,
}

// ═══════════════════════════════════════════════════════════════════════════
//  D4.3 — inline (samengestelde) doorsnede
// ═══════════════════════════════════════════════════════════════════════════
//
// Een uit platen samengestelde doorsnede staat niet in de profielendatabase, en
// hij kán daar ook niet in staan: hij is projectspecifiek. Daarom mag hij
// rechtstreeks in de toetsingsinvoer mee. Wat er dan wél en niet gerekend mag
// worden is hieronder **hard** vastgelegd; de redenen staan als leesbare tekst
// in de constanten, zodat het rapport ze letterlijk kan overnemen.

/// Toegestaan: doorsnedeweerstand N (6.2.4), V (6.2.6), M_y/M_z (6.2.5), de
/// M+N-interactie (6.2.9), kolomknik 6.3.1 met de **gelaste** knikkromme en de
/// BGT-doorbuigingstoets (puur EI, altijd geldig).
///
/// Geweigerd: kip 6.3.2 op alles behalve een dubbelsymmetrische gelaste I.
/// `m_cr_i_section` en `m_cr_algemeen` veronderstellen dubbelsymmetrie: zij
/// kennen geen monosymmetrieparameter `z_j`. Voor een doorsnede met ongelijke
/// flenzen zou de uitkomst een verzonnen getal zijn.
pub const REDEN_KIP_NIET_DUBBELSYMMETRISCH: &str =
    "kip is voor deze samengestelde doorsnede niet geautomatiseerd (monosymmetrie z_j ontbreekt) \
     — beoordeel handmatig of voorkom kip met kipsteunen";

/// Geweigerd: alle weerstands- en stabiliteitstoetsen bij klasse 4. Er is geen
/// effectieve-doorsnedeberekening volgens NEN-EN 1993-1-5; een W_el-benadering
/// zou de plooireductie stilzwijgend weglaten.
pub const REDEN_KLASSE_4: &str =
    "doorsnede is klasse 4; effectieve breedtes zijn niet geïmplementeerd";

/// Geweigerd: 6.3.3 zodra de kipcontrole is geweigerd — vergelijking 6.61/6.62
/// deelt door `M_b,Rd`, en dat getal bestaat dan niet.
pub const REDEN_INTERACTIE_ZONDER_KIP: &str =
    "6.3.3 (6.61/6.62) deelt door M_b,Rd uit de kipcontrole; die is hierboven geweigerd";

/// Melding bij een gesloten cel die niet expliciet is gedeclareerd.
pub const REDEN_GESLOTEN_CEL_NIET_GEDECLAREERD: &str =
    "de lamellen sluiten een cel, maar er is geen gesloten cel gedeclareerd: I_t is met de open \
     formule ⅓·Σb·t³ bepaald en onderschat de torsiestijfheid daarmee sterk";

/// Melding bij een inline doorsnede die alleen via `eigenschappen` bekend is:
/// er is geen geometrie om de dubbelsymmetrie aan te controleren.
pub const MELDING_VORM_NIET_CONTROLEERBAAR: &str =
    "doorsnede is alleen via haar eigenschappen opgegeven; de gedeclareerde vorm is niet aan \
     lamellen getoetst";

/// Weigering van de schuiftoets wegens lijfplooi (NEN-EN 1993-1-5 §5.1(2)).
pub fn reden_lijfplooi(hw_over_tw: f64, grens: f64) -> String {
    format!(
        "lijfplooi onder schuifkracht: h_w/t_w = {hw_over_tw:.1} > 72ε/η = {grens:.1}; \
         NEN-EN 1993-1-5 §5 (bijdrage van het lijf en de flenzen aan V_b,Rd) is niet \
         geïmplementeerd"
    )
}

/// Eén lamel (rechthoekige plaat) van een inline opgegeven doorsnede.
///
/// Zelfde afspraken als [`section_properties::composite::Lamella`]: `b_mm` is
/// de lengte in de lengterichting van de plaat, `t_mm` de dikte daar loodrecht
/// op, `(y_mm, z_mm)` het zwaartepunt van de plaat en `alpha_rad` de hoek van
/// de lengterichting met de y-as (0 = liggend, π/2 = staand).
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct CustomLamella {
    pub b_mm: f64,
    pub t_mm: f64,
    pub y_mm: f64,
    pub z_mm: f64,
    #[serde(default)]
    pub alpha_rad: f64,
}

/// Hoekpunt van een celwandmiddellijn.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct CustomPunt {
    pub y_mm: f64,
    pub z_mm: f64,
}

/// Een **expliciet gedeclareerde** gesloten cel, voor de Bredt-torsie.
///
/// Zonder deze declaratie rekent de kern `I_t` met de open formule ⅓·Σb·t³;
/// dat onderschat de torsiestijfheid van een koker met ordes van grootte, en
/// daarom komt er dan een melding in het resultaat.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct CustomGeslotenCel {
    /// Hoekpunten van de wandmiddellijn, in volgorde; de cel sluit vanzelf.
    pub midlijn: Vec<CustomPunt>,
    /// Wanddikte van de zijde van punt `i` naar punt `i+1`.
    pub dikte_mm: Vec<f64>,
    /// Indices van de lamellen die de celwanden vormen.
    pub lamellen: Vec<usize>,
}

/// Vormaanduiding voor een doorsnede die **niet** uit lamellen is opgebouwd.
///
/// Alleen nodig als [`CustomSection::lamellen`] leeg is: dan is er geen
/// geometrie om tabel 5.2 op los te laten en om de dubbelsymmetrie aan te
/// controleren. Staan er wél lamellen, dan wordt alles uit de geometrie
/// afgeleid en telt dit veld niet mee.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum CustomDoorsnedevorm {
    /// Onbekend. Zonder lamellen is er dan niets te classificeren en wordt de
    /// hele toetsing geweigerd — dat is veiliger dan een gok.
    #[default]
    Onbekend,
    /// Dubbelsymmetrisch gelast I-profiel: lijf inwendig, flenzen uitkragend,
    /// kip toegestaan.
    GelasteIDubbelsymmetrisch,
    /// Gelast I-profiel met ongelijke flenzen: kip geweigerd.
    GelasteIMonosymmetrisch,
    /// Gesloten koker: alle wanden inwendig, kip geweigerd.
    Koker,
    /// Ronde buis: blad 3 van tabel 5.2, kip geweigerd.
    RondeBuis,
}

/// Een inline opgegeven doorsnede.
///
/// Twee manieren om hem te beschrijven, en precies één daarvan geldt:
/// * **lamellen** — de doorsnede wordt door `section-properties` doorgerekend
///   en door tabel 5.2 per plaatdeel geklasseerd. Alles (dubbelsymmetrie,
///   h_w/t_w, gesloten cellen) volgt uit de geometrie.
/// * **eigenschappen** — een kant-en-klare set doorsnede-eigenschappen, met
///   `vorm` erbij zodat de classificatie weet welk blad van tabel 5.2 geldt.
///   Hiermee laat een catalogusprofiel zich één-op-één inline meegeven.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct CustomSection {
    /// Naam zoals hij in het rapport verschijnt.
    pub naam: String,
    #[serde(default)]
    pub lamellen: Vec<CustomLamella>,
    #[serde(default)]
    pub gesloten_cellen: Vec<CustomGeslotenCel>,
    /// Doorsnede-eigenschappen; alleen gebruikt als `lamellen` leeg is.
    #[serde(default)]
    pub eigenschappen: Option<SectionProperties>,
    /// Vormaanduiding; alleen gebruikt als `lamellen` leeg is.
    #[serde(default)]
    pub vorm: CustomDoorsnedevorm,
}

impl CustomSection {
    /// Vertaalt de invoer naar de rekenkern van `section-properties`.
    pub fn naar_composite(&self) -> CompositeSection {
        let mut sec = CompositeSection::nieuw();
        sec.lamellen = self.lamellen.iter().map(|l| Lamella {
            b_mm: l.b_mm,
            t_mm: l.t_mm,
            y_mm: l.y_mm,
            z_mm: l.z_mm,
            alpha_rad: l.alpha_rad,
        }).collect();
        sec.cellen = self.gesloten_cellen.iter().map(|c| GeslotenCel {
            midlijn_mm: c.midlijn.iter().map(|p| (p.y_mm, p.z_mm)).collect(),
            dikte_mm: c.dikte_mm.clone(),
            lamellen: c.lamellen.clone(),
        }).collect();
        sec
    }

    /// Is dit een **dubbelsymmetrisch gelast I-profiel**, en mag de kipcontrole
    /// dus draaien?
    ///
    /// Dit is bewust een witte lijst op de geometrie en geen declaratie die de
    /// aanroeper mag doen: precies drie lamellen, één staand lijf en twee
    /// gelijke liggende flenzen, alle op dezelfde y-hartlijn en de flenzen
    /// spiegelsymmetrisch om het midden van het lijf. Alles daarbuiten — een
    /// koker, een U, ongelijke flenzen, een versprongen flens — valt af.
    pub fn is_dubbelsymmetrische_gelaste_i(&self) -> bool {
        if !self.gesloten_cellen.is_empty() || self.lamellen.len() != 3 {
            return false;
        }
        let schaal = self.lamellen.iter().fold(1.0_f64, |m, l| m.max(l.b_mm));
        let tol = 1e-6 * schaal;

        let liggend: Vec<&CustomLamella> =
            self.lamellen.iter().filter(|l| l.alpha_rad.sin().abs() < 1e-9).collect();
        let staand: Vec<&CustomLamella> =
            self.lamellen.iter().filter(|l| l.alpha_rad.cos().abs() < 1e-9).collect();
        if liggend.len() != 2 || staand.len() != 1 {
            return false;
        }
        let (lijf, f1, f2) = (staand[0], liggend[0], liggend[1]);

        // Gelijke flenzen.
        if (f1.b_mm - f2.b_mm).abs() > tol || (f1.t_mm - f2.t_mm).abs() > tol {
            return false;
        }
        // Alles op dezelfde y-hartlijn: geen versprongen flenzen.
        if (f1.y_mm - lijf.y_mm).abs() > tol || (f2.y_mm - lijf.y_mm).abs() > tol {
            return false;
        }
        // Flenzen aan weerszijden van het lijf, spiegelsymmetrisch om het hart.
        if (0.5 * (f1.z_mm + f2.z_mm) - lijf.z_mm).abs() > tol {
            return false;
        }
        if (f1.z_mm - f2.z_mm).abs() <= tol {
            return false;
        }
        true
    }

    /// Grootste `h_w/t_w` over de lamellen die meer staand dan liggend zijn —
    /// de platen die de dwarskracht `V_z` dragen.
    ///
    /// Zonder lamellen valt dit terug op `(h − 2·t_f)/t_w` uit de opgegeven
    /// eigenschappen, en alleen voor de I-vormen: bij een koker of ronde buis
    /// zegt dat quotiënt niets.
    pub fn hw_over_tw(&self) -> Option<f64> {
        if !self.lamellen.is_empty() {
            return self
                .lamellen
                .iter()
                .filter(|l| l.alpha_rad.sin().abs() > l.alpha_rad.cos().abs() && l.t_mm > 0.0)
                .map(|l| l.b_mm / l.t_mm)
                .fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.max(v))));
        }
        let p = self.eigenschappen?;
        match self.vorm {
            CustomDoorsnedevorm::GelasteIDubbelsymmetrisch
            | CustomDoorsnedevorm::GelasteIMonosymmetrisch if p.tw_mm > 0.0 => {
                Some((p.h_mm - 2.0 * p.tf_mm) / p.tw_mm)
            }
            _ => None,
        }
    }

    /// Flensdikte voor de keuze van de knikkromme (tabel 6.2, gelaste I).
    ///
    /// Uit lamellen: de dikste plaat. Dat is veilig-zijdig, want een grotere
    /// `t_f` schuift de kromme naar de ongunstiger c/d-regel.
    pub fn flensdikte_mm(&self) -> f64 {
        if !self.lamellen.is_empty() {
            return self.lamellen.iter().fold(0.0_f64, |m, l| m.max(l.t_mm));
        }
        self.eigenschappen.map(|p| p.tf_mm).unwrap_or(0.0)
    }

    /// Sluiten de lamellen een cel zonder dat die gedeclareerd is?
    pub fn heeft_ongedeclareerde_gesloten_cel(&self) -> bool {
        self.gesloten_cellen.is_empty() && lussen_in_middellijnnet(&self.lamellen) > 0
    }
}

// ── Lusdetectie op het middellijnennet ──────────────────────────────────────
//
// Twee lamellen "raken" elkaar volgens hetzelfde lasnaad-criterium dat de rest
// van de kern gebruikt: een uiteinde van de een ligt binnen een halve
// gezamenlijke wanddikte van de middellijn van de ander. Het **knooppunt** ligt
// op het snijpunt van de doorgetrokken middellijnen — precies zoals D4.2 `c`
// bepaalt. Elke lamel valt daarmee uiteen in stukken tussen opeenvolgende
// punten op haar as; het aantal onafhankelijke lussen in dat net is
// `E − V + C` (randen − knopen + samenhangende delen).
//
// Voor de gelaste I uit drie platen levert dat 0 lussen; voor een koker uit
// vier platen 1. Drie platen die elkaar kruisen zónder dat hun uiteinden elkaar
// raken (een open kruis) blijven op 0 — daar is geen cel.

/// Aantal onafhankelijke lussen in het net van lamelmiddellijnen.
fn lussen_in_middellijnnet(lamellen: &[CustomLamella]) -> usize {
    let n = lamellen.len();
    if n < 3 {
        return 0; // met twee platen valt geen cel te sluiten
    }
    let schaal = lamellen.iter().fold(1.0_f64, |m, l| m.max(l.b_mm));
    let tol_knoop = 1e-6 * schaal;

    let richting = |l: &CustomLamella| {
        let (s, c) = l.alpha_rad.sin_cos();
        (c, s)
    };
    // Per lamel de parameters `u` (mm langs de as, vanaf het zwaartepunt) waar
    // een knooppunt ligt: te beginnen met de twee fysieke uiteinden.
    let mut u_op: Vec<Vec<f64>> =
        lamellen.iter().map(|l| vec![-l.b_mm / 2.0, l.b_mm / 2.0]).collect();

    for i in 0..n {
        for j in (i + 1)..n {
            let (a, b) = (&lamellen[i], &lamellen[j]);
            if !raken_elkaar(a, b) {
                continue;
            }
            let (da, db) = (richting(a), richting(b));
            // Snijpunt van de doorgetrokken middellijnen.
            let noemer = da.0 * db.1 - da.1 * db.0;
            if noemer.abs() < 1e-12 {
                continue; // evenwijdig: geen knooppunt
            }
            let (dy, dz) = (b.y_mm - a.y_mm, b.z_mm - a.z_mm);
            let ua = (dy * db.1 - dz * db.0) / noemer;
            let p = (a.y_mm + ua * da.0, a.z_mm + ua * da.1);
            let ub = (p.0 - b.y_mm) * db.0 + (p.1 - b.z_mm) * db.1;
            u_op[i].push(ua);
            u_op[j].push(ub);
        }
    }

    // Knopen (punten in het vlak) en randen (stukken tussen opeenvolgende
    // punten op één as) opbouwen.
    let mut knopen: Vec<(f64, f64)> = Vec::new();
    let knoop_id = |p: (f64, f64), knopen: &mut Vec<(f64, f64)>| -> usize {
        for (idx, q) in knopen.iter().enumerate() {
            if (p.0 - q.0).abs() <= tol_knoop && (p.1 - q.1).abs() <= tol_knoop {
                return idx;
            }
        }
        knopen.push(p);
        knopen.len() - 1
    };
    let mut randen: Vec<(usize, usize)> = Vec::new();
    for (i, l) in lamellen.iter().enumerate() {
        let d = richting(l);
        let mut us = u_op[i].clone();
        us.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        us.dedup_by(|a, b| (*a - *b).abs() <= tol_knoop);
        let ids: Vec<usize> = us
            .iter()
            .map(|&u| knoop_id((l.y_mm + u * d.0, l.z_mm + u * d.1), &mut knopen))
            .collect();
        for w in ids.windows(2) {
            if w[0] != w[1] {
                randen.push((w[0], w[1]));
            }
        }
    }

    // Samenhangende delen tellen met union-find.
    let mut ouder: Vec<usize> = (0..knopen.len()).collect();
    fn wortel(ouder: &mut Vec<usize>, mut x: usize) -> usize {
        while ouder[x] != x {
            ouder[x] = ouder[ouder[x]];
            x = ouder[x];
        }
        x
    }
    for &(a, b) in &randen {
        let (ra, rb) = (wortel(&mut ouder, a), wortel(&mut ouder, b));
        if ra != rb {
            ouder[ra] = rb;
        }
    }
    let mut delen = 0usize;
    for k in 0..knopen.len() {
        if wortel(&mut ouder, k) == k {
            delen += 1;
        }
    }

    // E − V + C; nooit negatief.
    (randen.len() + delen).saturating_sub(knopen.len())
}

/// Lasnaad-criterium: ligt een uiteinde van de een binnen een halve
/// gezamenlijke wanddikte van de middellijn van de ander?
fn raken_elkaar(a: &CustomLamella, b: &CustomLamella) -> bool {
    let tol = 0.5 * (a.t_mm + b.t_mm) * 1.05 + 1e-9;
    afstand_uiteinden_tot_as(a, b) <= tol || afstand_uiteinden_tot_as(b, a) <= tol
}

/// Kleinste afstand van de twee uiteinden van `a` tot het middellijn-lijnstuk
/// van `b`.
fn afstand_uiteinden_tot_as(a: &CustomLamella, b: &CustomLamella) -> f64 {
    let uiteinden = |l: &CustomLamella| {
        let (s, c) = l.alpha_rad.sin_cos();
        let h = l.b_mm / 2.0;
        [
            (l.y_mm - h * c, l.z_mm - h * s),
            (l.y_mm + h * c, l.z_mm + h * s),
        ]
    };
    let [b0, b1] = uiteinden(b);
    let ab = (b1.0 - b0.0, b1.1 - b0.1);
    let l2 = ab.0 * ab.0 + ab.1 * ab.1;
    uiteinden(a)
        .iter()
        .map(|&e| {
            if l2 <= 0.0 {
                return (e.0 - b0.0).hypot(e.1 - b0.1);
            }
            let s = (((e.0 - b0.0) * ab.0 + (e.1 - b0.1) * ab.1) / l2).clamp(0.0, 1.0);
            let proj = (b0.0 + s * ab.0, b0.1 + s * ab.1);
            (e.0 - proj.0).hypot(e.1 - proj.1)
        })
        .fold(f64::INFINITY, f64::min)
}
