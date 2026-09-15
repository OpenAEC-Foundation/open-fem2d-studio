//! De kniklengte per as — mét waar zij vandaan komt.
//!
//! ## Waarom dit bestaat
//!
//! Tot september 2026 kreeg de kern twee kale getallen binnen,
//! `buckling_length_y_m` en `buckling_length_z_m`, en had de invoerbouwer van
//! de frontend er al stil de staaflengte in gezet als de gebruiker niets had
//! ingevuld. De toets kon dus niet zien of L_cr,z was OPGEGEVEN of
//! TERUGGEVALLEN, en het rapport kon het niet zeggen. Voor de kniklengte uit
//! het vlak is dat precies de verkeerde plek voor een stille aanname: een vlak
//! raamwerkmodel ziet die richting nooit, dus niets anders in de berekening
//! vangt een verkeerde L_cr,z op.
//!
//! Daarom beslist de KERN nu over de terugval, en zegt hij erbij welke tak hij
//! nam. Dat moet in Rust en niet in de invoerbouwer: de toetsing is langs drie
//! wegen bereikbaar (Tauri-command, toetsbrug, MCP-server), en een regel die
//! alleen in de frontend woont, geldt voor de MCP-gebruiker niet.
//!
//! ## Drie herkomsten
//!
//! 1. **opgegeven** — een eindige waarde > 0 in de invoer. Gaat altijd voor.
//! 2. **uit de kipsteunen** — alleen om de as UIT het vlak, en alleen waar de
//!    doorsnede als geheel zijdelings gehouden wordt. Zie
//!    [`steunpunten_hele_doorsnede`] voor de regel en de normgrond.
//! 3. **staaflengte (terugval)** — al het andere.
//!
//! ## Waarom de assen hier geen vaste twee zijn
//!
//! Een [`Kniklengte`] draagt zijn eigen asnaam en de vlag
//! [`Kniklengte::in_rekenvlak`]. Er is bewust geen type "in het vlak / uit het
//! vlak" met twee varianten: dat onderscheid bestaat alleen zolang het model
//! vlak is. In een ruimtelijk model ziet de berekening beide richtingen en is
//! de vlag gewoon voor elke as waar.

use nen_en_1993_1_1_section::Deelstap;

use crate::opmaak::{lx, nl, nv, stap};

/// Het label van een kniklengte die in de invoer stond.
pub const HERKOMST_OPGEGEVEN: &str = "opgegeven";
/// Het label van een kniklengte die op de staaflengte is teruggevallen.
pub const HERKOMST_STAAFLENGTE: &str = "staaflengte (terugval)";
/// Het label van een kniklengte die uit de zijdelingse steunen is afgeleid.
pub const HERKOMST_KIPSTEUNEN: &str = "uit de kipsteunen";
/// Het label van de terugval bij een staaf met een VRIJ staafeind: tweemaal
/// de staaflengte, de kniklengte van de ingeklemd-vrije staaf.
pub const HERKOMST_VRIJ_EIND: &str = "2 × staaflengte (vrij staafeind, terugval)";

/// Twee steunen, één aan elke flens (of rand), gelden als één steunpunt voor
/// de hele doorsnede als ze hooguit zoveel uit elkaar liggen.
///
/// 1 mm en geen fractie: de posities komen als fracties van de staaflengte
/// binnen, maar of twee steunen "op dezelfde plaats" zitten is een vraag in
/// millimeters. Een gelijk verdeelde invoer (i/(n+1) aan beide flenzen) valt er
/// ruim binnen; een gording op 2,25 m en een schoor op 2,40 m niet.
pub const TOLERANTIE_STEUNPAAR_MM: f64 = 1.0;

/// Waar de kniklengte vandaan komt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KniklengteHerkomst {
    Opgegeven,
    Staaflengte,
    Kipsteunen,
    /// Terugval voor een staaf met één vrij staafeind (uitkraging, vrijstaande
    /// kolom): L_cr = 2·L. De terugval op de staaflengte veronderstelt dat
    /// beide staafeinden zijdelings gesteund zijn, en een vrij eind is dat niet.
    VrijEind,
}

impl KniklengteHerkomst {
    pub fn label(self) -> &'static str {
        match self {
            Self::Opgegeven => HERKOMST_OPGEGEVEN,
            Self::Staaflengte => HERKOMST_STAAFLENGTE,
            Self::Kipsteunen => HERKOMST_KIPSTEUNEN,
            Self::VrijEind => HERKOMST_VRIJ_EIND,
        }
    }
}

/// Aan welk soort doorsnededeel de steunen zitten — alleen voor de tekst: bij
/// een stalen I-profiel heet het een flens, bij een houten rechthoek een rand.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Steunrand {
    /// Stalen doorsnede: boven- en onderflens; normgrond EN 1993-1-1.
    Flens,
    /// Houten doorsnede: boven- en onderrand; normgrond EN 1995-1-1.
    Rand,
}

impl Steunrand {
    fn boven(self) -> &'static str {
        match self {
            Self::Flens => "bovenflens",
            Self::Rand => "bovenrand",
        }
    }
    fn onder(self) -> &'static str {
        match self {
            Self::Flens => "onderflens",
            Self::Rand => "onderrand",
        }
    }
    fn enkel(self) -> &'static str {
        match self {
            Self::Flens => "flens",
            Self::Rand => "rand",
        }
    }
}

/// De zijdelingse steunen van één staaf, als fracties van de staaflengte.
#[derive(Clone, Copy, Debug)]
pub struct Steunen<'a> {
    pub boven: &'a [f64],
    pub onder: &'a [f64],
    pub soort: Steunrand,
}

/// Eén gebruikte kniklengte, met haar herkomst.
#[derive(Clone, Debug, PartialEq)]
pub struct Kniklengte {
    /// De as waarom geknikt wordt: `"y"`, `"z"`, of `"u"`/`"v"` bij een
    /// hoekprofiel.
    pub as_naam: String,
    pub l_cr_mm: f64,
    /// De staaflengte waartegen de kniklengte is bepaald (mm). `NaN` als die
    /// niet bekend is (een los opgegeven lengte, zie [`Kniklengte::opgegeven`]).
    pub staaflengte_mm: f64,
    pub herkomst: KniklengteHerkomst,
    /// Ziet de raamwerkberekening uitbuigen om deze as? In het vlakke model
    /// van deze app alleen om de sterke as y: de oplosser rekent met I_y. Om z
    /// buigt de staaf uit het vlak, en daar weet het model niets van — ook zijn
    /// tweede-orde-berekening niet.
    pub in_rekenvlak: bool,
    /// Bij herkomst "uit de kipsteunen": de velden tussen opeenvolgende
    /// steunpunten (mm). Anders leeg.
    pub velden_mm: Vec<f64>,
    /// Waarom deze lengte, in leesbaar Nederlands. Landt letterlijk in de
    /// afleiding; een aanname die hier niet staat, bestaat voor de lezer niet.
    pub toelichting: Vec<String>,
}

impl Kniklengte {
    /// Een rechtstreeks opgegeven kniklengte, zonder verdere toelichting.
    /// Bedoeld voor aanroepers die de lengte al kennen (tests, referenties).
    pub fn opgegeven(as_naam: &str, l_cr_mm: f64, in_rekenvlak: bool) -> Self {
        Self {
            as_naam: as_naam.to_string(),
            l_cr_mm,
            staaflengte_mm: f64::NAN,
            herkomst: KniklengteHerkomst::Opgegeven,
            in_rekenvlak,
            velden_mm: Vec::new(),
            toelichting: Vec::new(),
        }
    }

    /// De terugval voor een staaf met één VRIJ staafeind (geen oplegging en geen
    /// aansluitende staaf): L_cr = 2·L, de kniklengte van de ingeklemd-vrije
    /// staaf (het Euler-geval met een vrije top). `plaats` noemt welk eind vrij
    /// is, voor de toelichting.
    ///
    /// Waarom niet de staaflengte: die terugval veronderstelt dat beide
    /// staafeinden zijdelings gesteund zijn (zie [`bepaal_kniklengte`]). Een
    /// vrij eind wordt door niets vastgehouden; met L_cr = L zou een
    /// vrijstaande kolom een viermaal te hoge kritieke kracht krijgen.
    pub fn vrij_eind(as_naam: &str, lengte_mm: f64, in_rekenvlak: bool, plaats: &str) -> Self {
        let l_cr_mm = 2.0 * lengte_mm;
        Self {
            as_naam: as_naam.to_string(),
            l_cr_mm,
            staaflengte_mm: lengte_mm,
            herkomst: KniklengteHerkomst::VrijEind,
            in_rekenvlak,
            velden_mm: Vec::new(),
            toelichting: vec![format!(
                "Er is geen kniklengte om de {as_naam}-as opgegeven, en {plaats} \
                 is VRIJ: geen oplegging en geen aansluitende staaf. De gewone terugval op de \
                 staaflengte veronderstelt dat beide staafeinden zijdelings gesteund zijn, en dat \
                 is hier niet zo. Aangehouden is daarom L_cr,{as_naam} = 2·L = {} mm, de \
                 kniklengte van de ingeklemd-vrije staaf (Euler-geval met vrije top), waarbij het \
                 andere staafeind als volledig ingeklemd is aangenomen — bij een scharnierend \
                 eind is zo'n staaf een mechanisme. Wie een andere kniklengte kan onderbouwen, \
                 geeft haar op.",
                nl(l_cr_mm, 0)
            )],
        }
    }

    /// Het LaTeX-symbool, bijvoorbeeld `L_{cr,z}`.
    pub fn symbool(&self) -> String {
        format!("L_{{cr,{}}}", self.as_naam)
    }

    /// Eén regel voor een kanttekening: "L_cr,z = 4000 mm (uit de kipsteunen)".
    pub fn samenvatting(&self) -> String {
        format!(
            "L_cr,{} = {} mm ({})",
            self.as_naam,
            nl(self.l_cr_mm, 0),
            self.herkomst.label()
        )
    }
}

/// Welk vlak deze knikrichting in het model heeft, als kort label.
pub fn vlak_label(k: &Kniklengte) -> &'static str {
    if k.in_rekenvlak {
        "in het vlak"
    } else if k.as_naam == "z" {
        "uit het vlak"
    } else {
        "hoofdas, niet in het vlak"
    }
}

/// Wat de zijdelingse steunen voor de kniklengte opleveren.
#[derive(Clone, Debug, PartialEq)]
pub struct Steunafleiding {
    /// Posities (mm vanaf het staafbegin) waar de doorsnede als geheel
    /// gesteund is: een steun aan beide flenzen (randen) binnen
    /// [`TOLERANTIE_STEUNPAAR_MM`].
    pub steunpunten_mm: Vec<f64>,
    /// De velden tussen staafbegin, steunpunten en staafeinde.
    pub velden_mm: Vec<f64>,
    /// De grootste veldlengte; `None` als er geen enkel steunpunt is.
    pub l_cr_mm: Option<f64>,
    /// Steunen aan alleen de bovenflens (bovenrand) — tellen niet mee.
    pub alleen_boven: usize,
    /// Steunen aan alleen de onderflens (onderrand) — tellen niet mee.
    pub alleen_onder: usize,
}

/// De regel voor een kniklengte uit het vlak uit zijdelingse steunen.
///
/// **Een plaats telt alleen als steunpunt als daar een steun aan de boven- ÉN
/// aan de onderflens zit.** Pas dan wordt de doorsnede als geheel zijdelings
/// vastgehouden en kan zij er niet om torderen. NEN-EN 1993-1-1 6.3.5.2(2)
/// omschrijft een effectieve zijdelingse steun zo: "een zijdelingse steun ter
/// plaatse van beide flenzen" (of één flens plus een stijve torsiesteun, die
/// het model niet kent).
///
/// **Een steun aan één flens verkort de kniklengte niet.** Hij houdt die flens
/// vast, maar de doorsnede kan er nog omheen draaien. Voor I-profielen met
/// kniksteunen die niet in het zwaartepunt aangrijpen eist 6.3.1.4(5) een toets
/// op torsieknik, en die zit niet in deze kern. Een gording op de bovenflens is
/// dus goed voor de KIP (dat is uitknikken van de gedrukte flens, en daar
/// rekent `nen-en-1993-1-1-ltb` al mee), maar niet voor knik om de zwakke as.
/// Dat is de veilige kant bij twijfel.
///
/// **L_cr is de grootste afstand tussen opeenvolgende steunpunten**, de
/// staafeinden meegeteld. Bijlage BB.1.1, OPMERKING 1 definieert de
/// systeemlengte voor knik uit het vlak (daar voor staven in vakwerken) op
/// dezelfde manier: "de lengte tussen de punten waar de staaf star wordt
/// gesteund tegen verplaatsing uit het vlak".
///
/// De staafeinden gelden als gesteund; dat is dezelfde aanname die onder de
/// terugval op de staaflengte ligt.
pub fn steunpunten_hele_doorsnede(lengte_mm: f64, boven: &[f64], onder: &[f64]) -> Steunafleiding {
    let leeg = Steunafleiding {
        steunpunten_mm: Vec::new(),
        velden_mm: Vec::new(),
        l_cr_mm: None,
        alleen_boven: 0,
        alleen_onder: 0,
    };
    if !(lengte_mm.is_finite() && lengte_mm > 0.0) {
        return leeg;
    }
    // Alleen posities strikt tussen de einden: een steun op een staafeinde
    // voegt niets toe aan de al aangenomen eindsteun, en een fractie buiten
    // [0; 1] ligt niet op de staaf.
    let naar_mm = |fracties: &[f64]| -> Vec<f64> {
        let mut uit: Vec<f64> = fracties
            .iter()
            .copied()
            .filter(|f| f.is_finite() && *f > 0.0 && *f < 1.0)
            .map(|f| f * lengte_mm)
            .collect();
        uit.sort_by(|a, b| a.total_cmp(b));
        uit.dedup_by(|a, b| (*a - *b).abs() <= TOLERANTIE_STEUNPAAR_MM);
        uit
    };
    let b = naar_mm(boven);
    let o = naar_mm(onder);

    let mut gebruikt = vec![false; o.len()];
    let mut punten: Vec<f64> = Vec::new();
    for x in &b {
        let paar = o
            .iter()
            .enumerate()
            .find(|(j, y)| !gebruikt[*j] && (x - *y).abs() <= TOLERANTIE_STEUNPAAR_MM)
            .map(|(j, _)| j);
        if let Some(j) = paar {
            gebruikt[j] = true;
            punten.push((x + o[j]) / 2.0);
        }
    }
    let alleen_boven = b.len() - punten.len();
    let alleen_onder = o.len() - gebruikt.iter().filter(|g| **g).count();
    if punten.is_empty() {
        return Steunafleiding { alleen_boven, alleen_onder, ..leeg };
    }

    let mut grenzen = Vec::with_capacity(punten.len() + 2);
    grenzen.push(0.0);
    grenzen.extend(punten.iter().copied());
    grenzen.push(lengte_mm);
    let velden: Vec<f64> = grenzen.windows(2).map(|w| w[1] - w[0]).collect();
    let l_cr = velden.iter().copied().fold(0.0_f64, f64::max);
    Steunafleiding {
        steunpunten_mm: punten,
        velden_mm: velden,
        l_cr_mm: Some(l_cr),
        alleen_boven,
        alleen_onder,
    }
}

fn regeltekst(as_naam: &str, soort: Steunrand) -> String {
    match soort {
        Steunrand::Flens => format!(
            "REGEL. Een plaats telt als steunpunt voor knik om de {as_naam}-as alleen als daar een \
             kipsteun aan de bovenflens ÉN aan de onderflens zit (binnen {tol} mm). Pas dan houdt de \
             steun de doorsnede als geheel zijdelings vast en kan zij er niet om torderen — zo \
             omschrijft NEN-EN 1993-1-1 6.3.5.2(2) een effectieve zijdelingse steun. Een steun aan \
             één flens houdt alleen die flens vast; voor I-profielen met kniksteunen die niet in het \
             zwaartepunt aangrijpen eist 6.3.1.4(5) bovendien een toets op torsieknik, en die zit \
             niet in deze kern. Zo'n steun verkort L_cr,{as_naam} daarom niet. L_cr,{as_naam} is \
             de grootste afstand tussen twee opeenvolgende steunpunten, de staafeinden meegeteld — \
             zoals bijlage BB.1.1, OPMERKING 1 de systeemlengte voor knik uit het vlak definieert.",
            tol = nl(TOLERANTIE_STEUNPAAR_MM, 0)
        ),
        Steunrand::Rand => format!(
            "REGEL. Een plaats telt als steunpunt voor knik om de {as_naam}-as alleen als daar een \
             zijdelingse steun aan de bovenrand ÉN aan de onderrand zit (binnen {tol} mm): dan wordt \
             de doorsnede als geheel vastgehouden. NEN-EN 1995-1-1 werkt voor een op druk belaste \
             staaf met de veldlengte a tussen zijdelingse steunen (9.2.5.2, figuur 9.9), maar zegt \
             niet dat een steun aan één rand daarvoor volstaat; zo'n steun laat de doorsnede om die \
             rand draaien en telt hier aan de veilige kant niet mee — dezelfde regel als bij staal \
             (NEN-EN 1993-1-1 6.3.5.2(2) en 6.3.1.4(5)). L_cr,{as_naam} is de grootste afstand \
             tussen twee opeenvolgende steunpunten, de staafeinden meegeteld.",
            tol = nl(TOLERANTIE_STEUNPAAR_MM, 0)
        ),
    }
}

fn aannametekst(as_naam: &str, soort: Steunrand) -> String {
    match soort {
        Steunrand::Flens => format!(
            "AANGENOMEN, NIET GETOETST: de steunen zijn star — sterk en stijf genoeg volgens \
             NB.NA.2.2 en NB.NA.2.3 (een starre steun voor één op druk belaste staaf moet onder meer \
             N_st,Ed = 0,01·N_b,Rd kunnen opnemen, (NB.NA.12)) — en beide staafeinden zijn \
             zijdelings gesteund. Wie dat niet kan onderbouwen, geeft L_cr,{as_naam} zelf op; een \
             opgegeven waarde gaat altijd voor."
        ),
        Steunrand::Rand => format!(
            "AANGENOMEN, NIET GETOETST: elk tussensteunpunt heeft de minimale veerstijfheid van \
             (9.34) en neemt de stabiliserende kracht van (9.35) op, en beide staafeinden zijn \
             zijdelings gesteund. Wie dat niet kan onderbouwen, geeft L_cr,{as_naam} zelf op; een \
             opgegeven waarde gaat altijd voor."
        ),
    }
}

/// Bepaalt de kniklengte om één as.
///
/// * `opgegeven_m` — de waarde uit de invoer, in m. `0` betekent "niet
///   opgegeven" (de afspraak van de invoertypen, zie `BeamCheckInput`);
///   negatief, NaN of oneindig wordt genegeerd MET een kanttekening, want een
///   kniklengte van nul zou χ = 1 geven — een knikweerstand die er niet is.
/// * `steunen` — alleen meegeven voor de as waarvoor zijdelingse steunen iets
///   betekenen (knik uit het vlak, om de eigen z-as). `None` = geen afleiding.
pub fn bepaal_kniklengte(
    as_naam: &str,
    in_rekenvlak: bool,
    opgegeven_m: f64,
    lengte_mm: f64,
    steunen: Option<Steunen<'_>>,
) -> Kniklengte {
    let afleiding = steunen.map(|s| (s, steunpunten_hele_doorsnede(lengte_mm, s.boven, s.onder)));
    let mut toelichting = Vec::new();

    if opgegeven_m.is_finite() && opgegeven_m > 0.0 {
        let l_cr_mm = opgegeven_m * 1000.0;
        toelichting.push(format!(
            "L_cr,{as_naam} is voor deze staaf opgegeven: {} mm. Een opgegeven kniklengte gaat \
             altijd voor; de kern leidt dan niets af.",
            nl(l_cr_mm, 0)
        ));
        if let Some((_, a)) = &afleiding {
            if let Some(l) = a.l_cr_mm {
                toelichting.push(format!(
                    "Zonder deze opgave was L_cr,{as_naam} uit de kipsteunen gevolgd: {} mm.",
                    nl(l, 0)
                ));
            }
        }
        return Kniklengte {
            as_naam: as_naam.to_string(),
            l_cr_mm,
            staaflengte_mm: lengte_mm,
            herkomst: KniklengteHerkomst::Opgegeven,
            in_rekenvlak,
            velden_mm: Vec::new(),
            toelichting,
        };
    }
    if opgegeven_m != 0.0 {
        toelichting.push(format!(
            "De opgegeven waarde {opgegeven_m} m is geen kniklengte en is genegeerd; een kniklengte \
             van nul of minder zou een knikweerstand zonder knikreductie geven."
        ));
    }

    if let Some((s, a)) = &afleiding {
        if let Some(l_cr_mm) = a.l_cr_mm {
            toelichting.push(regeltekst(as_naam, s.soort));
            toelichting.push(format!(
                "Steunpunten over de hele doorsnede op x = {} mm; de velden zijn {} mm. \
                 L_cr,{as_naam} is het grootste veld: {} mm.",
                a.steunpunten_mm.iter().map(|x| nl(*x, 0)).collect::<Vec<_>>().join(" · "),
                a.velden_mm.iter().map(|x| nl(*x, 0)).collect::<Vec<_>>().join(" · "),
                nl(l_cr_mm, 0)
            ));
            if a.alleen_boven + a.alleen_onder > 0 {
                toelichting.push(format!(
                    "Niet meegeteld: {} steun(en) aan alleen de {} en {} aan alleen de {}.",
                    a.alleen_boven,
                    s.soort.boven(),
                    a.alleen_onder,
                    s.soort.onder()
                ));
            }
            toelichting.push(aannametekst(as_naam, s.soort));
            return Kniklengte {
                as_naam: as_naam.to_string(),
                l_cr_mm,
                staaflengte_mm: lengte_mm,
                herkomst: KniklengteHerkomst::Kipsteunen,
                in_rekenvlak,
                velden_mm: a.velden_mm.clone(),
                toelichting,
            };
        }
    }

    toelichting.push(format!(
        "Er is geen kniklengte om de {as_naam}-as opgegeven. Aangehouden is de staaflengte L = {} \
         mm: de afstand tussen de staafeinden, die daarbij als zijdelings gesteund gelden. Wie een \
         andere kniklengte kan onderbouwen, geeft haar op.",
        nl(lengte_mm, 0)
    ));
    if let Some((s, a)) = &afleiding {
        if a.alleen_boven + a.alleen_onder > 0 {
            toelichting.push(format!(
                "Er zitten steunen aan alleen de {} ({}) of alleen de {} ({}), maar op geen enkele \
                 plaats aan beide. Zo'n steun houdt één {} vast en de doorsnede kan er nog omheen \
                 draaien, dus verkort hij L_cr,{as_naam} niet. {}",
                s.soort.boven(),
                a.alleen_boven,
                s.soort.onder(),
                a.alleen_onder,
                s.soort.enkel(),
                regeltekst(as_naam, s.soort)
            ));
        }
    }
    Kniklengte {
        as_naam: as_naam.to_string(),
        l_cr_mm: lengte_mm,
        staaflengte_mm: lengte_mm,
        herkomst: KniklengteHerkomst::Staaflengte,
        in_rekenvlak,
        velden_mm: Vec::new(),
        toelichting,
    }
}

/// Wat de raamwerkberekening wel en niet dekt voor knik om deze as.
///
/// `norm_in_vlak` is de vindplaats die zegt wanneer een staaftoets na een
/// tweede-orde-berekening nog nodig is; leeg laten waar de norm van het
/// materiaal die regel niet op deze plaats geeft.
pub fn vlaknotitie(k: &Kniklengte, norm_in_vlak: &str) -> String {
    let a = &k.as_naam;
    if k.in_rekenvlak {
        let grond = if norm_in_vlak.is_empty() {
            String::new()
        } else {
            format!(" ({norm_in_vlak})")
        };
        format!(
            "Knik om de {a}-as is uitbuigen IN het vlak van het model. De raamwerkberekening ziet \
             die richting; rekent zij tweede orde, dan zit het globale effect in de krachten. Deze \
             toets blijft nodig zolang de staafimperfecties niet in die berekening zitten{grond}."
        )
    } else if a == "z" {
        format!(
            "Knik om de {a}-as is uitbuigen UIT het vlak van het model. Een vlak raamwerkmodel kent \
             die richting niet, ook niet in zijn tweede-orde-berekening (P-Δ): knik uit het vlak is \
             nooit door de raamwerkberekening gedekt, en deze toets is daar altijd nodig."
        )
    } else {
        format!(
            "Bij deze doorsnede valt de {a}-as niet samen met het vlak van het model; ook knik om \
             de {a}-as is dus niet door de raamwerkberekening gedekt, en deze toets is altijd nodig."
        )
    }
}

/// De eerste stap van een tak: welke kniklengte, waarom, en wat het model
/// voor deze richting wel en niet ziet.
pub fn kniklengte_deelstap(k: &Kniklengte, article: &str, norm_in_vlak: &str) -> Deelstap {
    let a = &k.as_naam;
    let symbool = k.symbool();
    let (formule, ingevuld) = match k.herkomst {
        KniklengteHerkomst::Opgegeven => (format!(r"{symbool} = \text{{opgegeven}}"), String::new()),
        KniklengteHerkomst::Staaflengte => (format!(r"{symbool} = L"), String::new()),
        KniklengteHerkomst::VrijEind => (format!(r"{symbool} = 2 \cdot L"), String::new()),
        KniklengteHerkomst::Kipsteunen => (
            format!(r"{symbool} = \max_i \left( x_{{i+1}} - x_i \right)"),
            format!(
                r"{symbool} = \max\left( {} \right)",
                k.velden_mm.iter().map(|v| lx(*v, 0)).collect::<Vec<_>>().join(r" \,;\, ")
            ),
        ),
    };
    let mut notes = vec![format!("Herkomst: {}.", k.herkomst.label())];
    notes.extend(k.toelichting.iter().cloned());
    notes.push(vlaknotitie(k, norm_in_vlak));
    stap(
        &format!("l_cr_{a}"),
        &format!("Kniklengte om de {a}-as — {}", vlak_label(k)),
        &symbool,
        article,
        formule,
        ingevuld,
        // L alleen als hij bekend is; een NaN zou als "n.v.t." verschijnen.
        if k.staaflengte_mm.is_finite() {
            vec![nv("L", k.staaflengte_mm, "mm"), nv(&symbool, k.l_cr_mm, "mm")]
        } else {
            vec![nv(&symbool, k.l_cr_mm, "mm")]
        },
        Some(k.l_cr_mm),
        "mm",
        notes,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const L: f64 = 9000.0;

    fn flens<'a>(boven: &'a [f64], onder: &'a [f64]) -> Option<Steunen<'a>> {
        Some(Steunen { boven, onder, soort: Steunrand::Flens })
    }

    #[test]
    fn opgegeven_gaat_voor_ook_als_de_steunen_iets_anders_zeggen() {
        let k = bepaal_kniklengte("z", false, 4.5, L, flens(&[0.25, 0.5, 0.75], &[0.25, 0.5, 0.75]));
        assert_eq!(k.herkomst, KniklengteHerkomst::Opgegeven);
        assert_eq!(k.l_cr_mm, 4500.0);
        assert!(k.toelichting.iter().any(|t| t.contains("2250 mm")), "{:?}", k.toelichting);
    }

    #[test]
    fn nul_is_niet_opgegeven_en_valt_terug_op_de_staaflengte() {
        let k = bepaal_kniklengte("z", false, 0.0, L, None);
        assert_eq!(k.herkomst, KniklengteHerkomst::Staaflengte);
        assert_eq!(k.l_cr_mm, L);
        assert_eq!(k.toelichting.len(), 1, "nul hoort geen 'genegeerd'-melding te geven");
    }

    #[test]
    fn een_onzinwaarde_wordt_hardop_genegeerd() {
        for w in [-2.0, f64::NAN, f64::INFINITY] {
            let k = bepaal_kniklengte("y", true, w, L, None);
            assert_eq!(k.herkomst, KniklengteHerkomst::Staaflengte);
            assert!(k.toelichting[0].contains("genegeerd"), "{w}: {:?}", k.toelichting);
        }
    }

    #[test]
    fn steunen_aan_beide_flenzen_geven_het_grootste_veld() {
        // Steunpunten op 2250 en 6000 mm → velden 2250, 3750, 3000.
        let k = bepaal_kniklengte("z", false, 0.0, L, flens(&[0.25, 2.0 / 3.0], &[2.0 / 3.0, 0.25]));
        assert_eq!(k.herkomst, KniklengteHerkomst::Kipsteunen);
        assert!((k.l_cr_mm - 3750.0).abs() < 1e-9, "{}", k.l_cr_mm);
        assert_eq!(k.velden_mm.len(), 3);
    }

    #[test]
    fn steunen_aan_een_flens_verkorten_niets() {
        let k = bepaal_kniklengte("z", false, 0.0, L, flens(&[0.25, 0.5, 0.75], &[]));
        assert_eq!(k.herkomst, KniklengteHerkomst::Staaflengte);
        assert_eq!(k.l_cr_mm, L);
        assert!(k.toelichting.iter().any(|t| t.contains("alleen de bovenflens (3)")), "{:?}", k.toelichting);
    }

    #[test]
    fn alleen_de_paren_tellen_en_de_rest_staat_erbij() {
        // Boven op ¼, ½, ¾; onder alleen op ½ → één steunpunt, velden 4500/4500.
        let a = steunpunten_hele_doorsnede(L, &[0.25, 0.5, 0.75], &[0.5]);
        assert_eq!(a.steunpunten_mm, vec![4500.0]);
        assert_eq!(a.l_cr_mm, Some(4500.0));
        assert_eq!((a.alleen_boven, a.alleen_onder), (2, 0));
    }

    #[test]
    fn meer_dan_een_millimeter_uit_elkaar_is_geen_paar() {
        let net = steunpunten_hele_doorsnede(L, &[0.5], &[0.5 + 0.9 / L]);
        assert_eq!(net.steunpunten_mm.len(), 1);
        let niet = steunpunten_hele_doorsnede(L, &[0.5], &[0.5 + 1.5 / L]);
        assert!(niet.steunpunten_mm.is_empty());
        assert_eq!((niet.alleen_boven, niet.alleen_onder), (1, 1));
    }

    #[test]
    fn fracties_op_of_buiten_de_einden_tellen_niet() {
        let a = steunpunten_hele_doorsnede(L, &[0.0, 1.0, -0.2, f64::NAN], &[0.0, 1.0, 1.3]);
        assert!(a.steunpunten_mm.is_empty());
        assert_eq!((a.alleen_boven, a.alleen_onder), (0, 0));
    }

    #[test]
    fn de_deelstap_noemt_herkomst_en_vlak() {
        let k = bepaal_kniklengte("z", false, 0.0, L, None);
        let d = kniklengte_deelstap(&k, "art. 6.3.1.3(1)", "NEN-EN 1993-1-1 5.2.2(7)");
        assert_eq!(d.id, "l_cr_z");
        assert_eq!(d.symbol, "L_{cr,z}");
        assert_eq!(d.notes[0], "Herkomst: staaflengte (terugval).");
        assert!(d.notes.iter().any(|n| n.contains("UIT het vlak") && n.contains("P-Δ")));
        let y = bepaal_kniklengte("y", true, 3.0, L, None);
        let dy = kniklengte_deelstap(&y, "art. 6.3.1.3(1)", "NEN-EN 1993-1-1 5.2.2(7)");
        assert!(dy.notes.iter().any(|n| n.contains("IN het vlak") && n.contains("5.2.2(7)")));
    }
}
