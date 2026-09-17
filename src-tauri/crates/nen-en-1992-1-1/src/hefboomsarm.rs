//! 6.2.3(1) — de inwendige hefboomsarm z, mét en zonder normaalkracht.
//!
//! # Wat de norm zegt
//!
//! De verklaring bij figuur 6.5 in 6.2.3(1), uit de tekstlaag van de PDF en
//! nagekeken op de gerenderde bladzijde 114 (de nationale bijlage grijpt
//! hier NIET in; het enige oranje op die bladzijde is de geschrapte
//! OPMERKING bij (2) over de aanbevolen grenzen van cot θ):
//!
//! > z is de inwendige hefboomsarm voor een element met constante hoogte,
//! > overeenkomend met het buigend moment in het beschouwde element. In de
//! > dwarskrachtberekening van gewapend beton zonder normaalkracht mag in
//! > het algemeen de benaderende waarde z = 0,9d zijn gebruikt.
//!
//! Twee dingen staan daar. Ten eerste is z een GEDEFINIEERDE grootheid: de
//! arm van het inwendige koppel — betondrukkracht F_cd tegen trekkracht
//! F_td in figuur 6.5 — dat het buigend moment opneemt. Ten tweede is 0,9·d
//! een BENADERING daarvan, die de norm zonder normaalkracht toestaat. Met
//! normaalkracht vraagt de norm dus niet om te weigeren, maar om de
//! werkelijke hefboomsarm te gebruiken.
//!
//! # Wat hier vroeger stond, en waarom dat dood was
//!
//! Zonder opgegeven z en met |N_Ed| > 10⁻⁶ kN weigerden de dwarskrachttoets
//! en de dekkingslijn. Formeel verdedigbaar, praktisch onzinnig: zet de
//! scheefstand aan, en elke lijnlast krijgt een horizontale metgezel
//! H = φ·V die als verdeelde axiale last op de ligger werkt. Een ligger van
//! 6 m met q = 12 kN/m en φ = 1/200 draagt dan max |N_Ed| = 0,486 kN — op
//! 300 × 600 mm een spanning van 0,0027 N/mm², onmeetbaar in de
//! hefboomsarm — en kreeg géén dekkingslijn en géén vakwerkmodel. Voor een
//! echt model met scheefstand was de hele functie daarmee buiten werking.
//!
//! # De werkelijke hefboomsarm: z = d − λ·x_u/2 bij N_Ed
//!
//! De arm wordt uit het spanningsblok van 3.1.7(3) gehaald — dezelfde kern
//! als de buigtoets, [`crate::bending::stress_block`] — bij de normaalkracht
//! van de snede: de drukzonehoogte x_u volgt uit het krachtenevenwicht van
//! beton én alle wapeningslagen met N_Ed bij de rekgrens ε_cu3 aan de
//! gedrukte rand. De arm is dan de afstand tussen de resultante van het
//! betondrukblok (op λ·x_u/2 onder de gedrukte rand; bij een T of L op het
//! zwaartepunt van het werkelijke blok) en de trekwapening op diepte d:
//!
//! ```text
//!   z = d − λ·x_u/2
//! ```
//!
//! Dat is de klassieke inwendige hefboomsarm van figuur 3.5, "z uit de
//! buigtoets" zoals de praktijk hem noemt, en de arm van het vakwerkmodel van
//! 6.2.3: dat is een model voor de uiterste grenstoestand, en zijn gordels
//! zijn de gordels van de buigweerstand. De drukwapening telt mee in het
//! evenwicht dat x_u bepaalt, maar niet in de arm: zij zou de drukresultante
//! iets omhoog trekken en z iets vergroten, en dat weglaten is de veilige
//! kant.
//!
//! **Waarom niet de toestand bij (M_Ed, N_Ed) zelf.** Dat is geprobeerd, met
//! de M-N-κ-motor en de afstand tussen de resultante van álle drukkrachten en
//! die van álle trekkrachten, en het meet verkeerd zodra M_Ed klein is ten
//! opzichte van N_Ed·h: de drukresultante draagt dan vooral de
//! normaalkracht en ligt bij het zwaartepunt, de trekkracht is bijna nul, en
//! de afstand tussen de twee zakt in naar d − h/2. Bij het momentnulpunt van
//! een doorgaande ligger — waar V_Ed juist groot is — liet 0,04 kN druk uit
//! de scheefstand z zo een kwart inzakken, en V_Rd,s ∝ z met hem.
//!
//! **Waarom niet de resultante van álle trekkrachten, ook in de uiterste
//! grenstoestand.** Bij een kleine trekgordel — de bovenwapening van een
//! ligger met zware onderwapening — is x_u klein en komt de onderwapening
//! onder de neutrale lijn: zij trekt dan licht mee, en met haar grote
//! oppervlak trekt zij de trekresultante naar het midden van de doorsnede.
//! Gemeten op de referentieligger: z ≈ 0,5·d voor de bovenlijn, dus een
//! bijna verdubbelde benodigde trekkracht door 0,05 kN normaalkracht. Ook
//! dat is geen hefboomsarm maar een artefact van de definitie. De arm tussen
//! het drukblok en de trekwapening heeft geen van beide gebreken: hij
//! bestaat voor elke M_Ed, ook nul, hangt alleen van N_Ed en de trekzijde af,
//! en de benadering 0,9·d die de norm ernaast zet hangt óók niet van M_Ed af.
//!
//! # De regel die hier geldt
//!
//! [`bepaal_z`] kent, in deze volgorde, vier gronden:
//!
//! 1. **Opgegeven.** De aanroeper heeft z gegeven; die geldt.
//! 2. **Benadering, 0,9·d.** Er werkt geen normaalkracht — 6.2.3(1),
//!    letterlijk. "Geen" is hier de numerieke nul van de oplosser
//!    ([`N_NUMERIEK_NUL_KN`]); zie hieronder waarom dat geen drempel is.
//! 3. **Evenwicht.** Er werkt een normaalkracht. De arm van het spanningsblok
//!    bij N_Ed — [`hefboomsarm_bij_normaalkracht`] — wordt aangehouden, maar
//!    NOOIT groter dan 0,9·d. Zie "De begrenzing op 0,9·d".
//! 4. **Terugval.** Er werkt een normaalkracht, maar het spanningsblok
//!    levert geen arm: er ligt geen wapening, de doorsnede staat bij deze
//!    normaalkracht geheel onder druk (ook bij x = h is de inwendige druk
//!    kleiner dan N_Ed), de trekcapaciteit van het staal is overschreden, of
//!    de drukzone reikt tot voorbij de trekwapening. Dan geldt 0,9·d, met de
//!    reden erbij.
//!
//! # De richting: druk maakt z KLEINER, trek maakt z GROTER
//!
//! Dat volgt uit het evenwicht en niet uit een aanname. Uit
//! F_c − F_t = N_c (druk positief) volgt dat de drukzone bij druk DIEPER
//! wordt: F_c groeit met x, F_t krimpt ermee (de staalrek is
//! ε_cu3·(1 − d/x)), dus een grotere N_c vraagt een grotere x. De
//! drukresultante ligt op λ·x/2 onder de gedrukte rand en zakt dus mee, de
//! trekwapening blijft op d liggen: z = d − λ·x/2 wordt KLEINER. Bij trek
//! gebeurt het omgekeerde en loopt z naar d toe. De test
//! `druk_verkleint_en_trek_vergroot_de_hefboomsarm` legt dit vast op het
//! spanningsblok zelf.
//!
//! Voor de veiligheid is die richting gunstig. Overal waar z voorkomt —
//! F = M_Ed/z (figuur 9.2), F_Ed = |V_Ed|·a_l/z + N_Ed (9.3),
//! V_Rd,s ∝ z (6.8) en V_Rd,max ∝ z (6.9) — is een KLEINERE z de veilige
//! kant. Bij druk, waar de arm krimpt, wordt hij dus ook gebruikt; bij trek,
//! waar hij groeit, houdt de begrenzing hem op 0,9·d.
//!
//! # De begrenzing op 0,9·d
//!
//! De arm van het spanningsblok bij ZUIVERE buiging is niet 0,9·d. Bij een
//! licht gewapende doorsnede ligt hij erboven (x_u/d ≈ 0,1 → z ≈ 0,96·d),
//! bij een zwaar gewapende eronder (x_u/d ≈ 0,5 → z ≈ 0,8·d). Zou met
//! normaalkracht de werkelijke arm onbegrensd gelden, dan zou een ligger
//! door een normaalkracht van 0,5 kN enkele procenten STERKER kunnen worden
//! dan dezelfde ligger zonder — niet omdat de kracht iets doet, maar omdat
//! de benadering voor de werkelijke arm is ingeruild. Dat is niet de
//! bedoeling van 6.2.3(1). Daarom geldt z = min(z_u; 0,9·d):
//!
//! * is de benadering conservatief (z_u ≥ 0,9·d), dan blijft 0,9·d staan en
//!   verandert een verwaarloosbare normaalkracht niets — precies wat de
//!   gebruiker verwacht;
//! * is de benadering te gunstig (z_u < 0,9·d), dan geldt de werkelijke arm,
//!   zoals de norm met normaalkracht eist. Dat is de veilige kant, en het
//!   rapport laat zien waarom de sprong er is.
//!
//! De begrenzing is een KEUZE en geen normwaarde; zij maakt de uitkomst
//! nooit gunstiger dan de norm zonder normaalkracht al toestaat. De
//! onbegrensde arm reist mee in [`ZGrondslag::Evenwicht`], zodat een lezer
//! beide getallen ziet.
//!
//! # Waarom 10⁻⁶ kN geen willekeurige drempel is
//!
//! De grens tussen "geen normaalkracht" en "een normaalkracht" ligt op
//! [`N_NUMERIEK_NUL_KN`] = 10⁻⁶ kN = 1 mN: het afrondingsniveau van een
//! oplosser die de normaalkracht uit verplaatsingsverschillen haalt. Anders
//! dan de vroegere weigering is deze grens onschuldig: aan weerszijden ervan
//! wordt gerekend, en het verschil tussen 0,9·d en min(z_u; 0,9·d) bij een
//! kracht van 1 mN is óf nul (benadering conservatief) óf precies de
//! correctie die de norm met normaalkracht voorschrijft (benadering te
//! gunstig). De kracht zelf doet vrijwel niets: 0,486 kN verschuift z_u op
//! de referentiedoorsneden met een verhouding van de orde 10⁻⁴, 1 mN dus
//! met de orde 10⁻⁷.
//!
//! # Wat hier NIET gebeurt
//!
//! * De hefboomsarm wordt bij N = 0 niet uit het spanningsblok gehaald:
//!   0,9·d is daar de norm, de gangbare praktijk en de basis van elke
//!   handberekening in de tests. Dat blijft zo.
//! * Een DRUKkracht wordt in figuur 9.2 nog steeds niet van de trekgordel
//!   afgetrokken; zie [`crate::dekkingslijn`]. Deze module bepaalt alleen z.
//! * Kolommen (§5.8) zijn een ander spoor: [`crate::kolom`] rekent daar
//!   met de volledige interactie en gebruikt deze module niet.

use crate::bending::{stress_block, StressBlockError};
use crate::deelstappen::nl;
use crate::section::{ConcreteSection, RebarLayer, ReinforcementCage};
use crate::stress_strain::DesignMaterial;

/// De numerieke nul van de normaalkracht, kN — 1 mN.
///
/// Onder deze grens is er "geen normaalkracht" in de zin van 6.2.3(1) en
/// geldt de benadering z = 0,9·d. Zie de moduletekst voor waarom dit geen
/// willekeurige drempel is: erboven wordt gerekend, niet geweigerd.
pub const N_NUMERIEK_NUL_KN: f64 = 1e-6;

/// De benaderende waarde die 6.2.3(1) zonder normaalkracht toestaat:
/// z = 0,9·d.
pub fn z_0_9d(d_mm: f64) -> f64 {
    0.9 * d_mm
}

// ───────────────────────────────────────────────────────────────────────────
// De werkelijke hefboomsarm uit het spanningsblok
// ───────────────────────────────────────────────────────────────────────────

/// De inwendige hefboomsarm zoals 6.2.3(1) hem definieert: die van het
/// spanningsblok van 3.1.7(3) bij N_Ed, z = d − λ·x_u/2.
#[derive(Clone, Debug, PartialEq)]
pub struct Hefboomsarm {
    /// z = d − a_c, mm: de afstand tussen de resultante van het betondrukblok
    /// en de trekwapening.
    pub z_mm: f64,
    /// De nuttige hoogte van de trekwapening, mm.
    pub d_mm: f64,
    /// Diepte van de resultante van het betondrukblok onder de gedrukte
    /// rand, mm — λ·x_u/2 bij een rechthoek.
    pub a_c_mm: f64,
    /// Hoogte van de drukzone x_u vanaf de gedrukte rand, mm.
    pub x_mm: f64,
    /// De betondrukkracht van het blok, kN (positief getal).
    pub f_c_kn: f64,
    /// De som van de drukkrachten in de wapening, kN (positief getal; 0 als
    /// geen laag drukt).
    pub f_s_druk_kn: f64,
    /// De som van de trekkrachten in de wapening, kN (positief getal).
    pub f_t_kn: f64,
    /// De momentweerstand bij deze normaalkracht, kNm — de toestand waarin
    /// de arm is gemeten.
    pub m_rd_knm: f64,
    /// De normaalkracht waarbij is gerekend, kN (trek positief).
    pub n_ed_kn: f64,
    /// `true` als de onderwapening de trekgordel is (positief moment).
    pub trek_onder: bool,
}

/// Waarom het spanningsblok geen hefboomsarm oplevert.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HefboomsarmFout {
    /// Zonder wapening is er geen trekgordel.
    GeenWapening,
    /// Ook bij x = h is de inwendige druk kleiner dan N_Ed: de doorsnede
    /// staat bij deze normaalkracht geheel onder druk en er is geen
    /// buigend koppel om een arm bij te meten.
    GeheelGedrukt,
    /// Ook bij x → 0 is de inwendige trek kleiner dan |N_Ed|: de
    /// trekcapaciteit van het staal is overschreden.
    TrekcapaciteitOverschreden,
    /// De drukzone reikt tot voorbij de trekwapening (x_u ≥ d): de
    /// trekgordel staat niet op trek.
    GeenTrekgordel,
}

impl HefboomsarmFout {
    /// De reden in woorden, voor het rapport.
    pub fn omschrijving(&self) -> &'static str {
        match self {
            HefboomsarmFout::GeenWapening => {
                "er ligt geen langswapening in de doorsnede, dus er is geen trekgordel"
            }
            HefboomsarmFout::GeheelGedrukt => {
                "bij deze normaalkracht staat de doorsnede ook in de uiterste grenstoestand geheel \
                 onder druk (3.1.7(3): zelfs met x = h is de inwendige druk kleiner dan N_Ed), \
                 dus er is geen buigend koppel om een hefboomsarm bij te meten"
            }
            HefboomsarmFout::TrekcapaciteitOverschreden => {
                "de trekkracht overschrijdt wat het staal kan dragen; er is geen evenwicht en dus \
                 geen hefboomsarm"
            }
            HefboomsarmFout::GeenTrekgordel => {
                "in het spanningsblok bij deze normaalkracht reikt de drukzone tot voorbij de \
                 trekwapening (x_u ≥ d), dus de trekgordel staat niet op trek"
            }
        }
    }
}

/// De uitkomst van [`hefboomsarm_bij_normaalkracht`], zoals aanroepers hem
/// doorgeven en bewaren.
pub type HefboomsarmUitkomst = Result<Hefboomsarm, HefboomsarmFout>;

/// De werkelijke inwendige hefboomsarm bij normaalkracht `n_ed_kn` (kN, trek
/// positief), voor een moment dat de onderwapening (`trek_onder`) of de
/// bovenwapening op trek zet; `d_mm` is de nuttige hoogte van die rij.
///
/// De rekengang is die van de buigtoets: [`stress_block`] zoekt de
/// drukzonehoogte x_u waarbij het spanningsblok van 3.1.7(3) — beton én alle
/// wapeningslagen — met N_Ed in evenwicht is. De arm is de afstand tussen
/// de resultante van het betondrukblok en de trekwapening: z = d − a_c, met
/// a_c = λ·x_u/2 bij een rechthoek en het zwaartepunt van het werkelijke
/// blok bij een T of L. Zie de moduletekst voor waarom de drukwapening niet
/// in de arm zit.
pub fn hefboomsarm_bij_normaalkracht(
    section: &ConcreteSection,
    layers: &[RebarLayer],
    mat: &DesignMaterial,
    n_ed_kn: f64,
    trek_onder: bool,
    d_mm: f64,
) -> HefboomsarmUitkomst {
    let sign = if trek_onder { 1.0 } else { -1.0 };
    let blok = stress_block(section, layers, mat, n_ed_kn, sign).map_err(|e| match e {
        StressBlockError::NoReinforcement => HefboomsarmFout::GeenWapening,
        StressBlockError::WhollyCompressed => HefboomsarmFout::GeheelGedrukt,
        StressBlockError::TensionCapacityExceeded => HefboomsarmFout::TrekcapaciteitOverschreden,
    })?;
    if blok.x_mm >= d_mm {
        return Err(HefboomsarmFout::GeenTrekgordel);
    }
    // `z_c_m` is de arm van het drukblok om het midden, positief naar de
    // gedrukte rand; de diepte onder die rand is dus h/2 − z_c.
    let a_c = section.h_mm / 2.0 - blok.z_c_m * 1e3;
    let z = d_mm - a_c;
    debug_assert!(z > 0.0, "z = {z} mm uit d = {d_mm} en a_c = {a_c}");
    if !(z > 0.0) {
        return Err(HefboomsarmFout::GeenTrekgordel);
    }
    let mut f_s_druk = 0.0_f64;
    let mut f_t = 0.0_f64;
    for laag in &blok.layers {
        if laag.f_kn > 0.0 {
            f_s_druk += laag.f_kn;
        } else {
            f_t -= laag.f_kn;
        }
    }
    Ok(Hefboomsarm {
        z_mm: z,
        d_mm,
        a_c_mm: a_c,
        x_mm: blok.x_mm,
        f_c_kn: blok.f_c_kn,
        f_s_druk_kn: f_s_druk,
        f_t_kn: f_t,
        m_rd_knm: blok.m_rd_knm,
        n_ed_kn,
        trek_onder,
    })
}

// ───────────────────────────────────────────────────────────────────────────
// De regel van 6.2.3(1)
// ───────────────────────────────────────────────────────────────────────────

/// Waar z vandaan komt.
#[derive(Clone, Debug, PartialEq)]
pub enum ZGrondslag {
    /// Door de aanroeper opgegeven.
    Opgegeven,
    /// 6.2.3(1): z = 0,9·d, want er werkt geen normaalkracht.
    Benadering,
    /// Uit het spanningsblok bij N_Ed, want er werkt een normaalkracht.
    /// `begrensd` zegt of de werkelijke arm boven 0,9·d lag en dus op 0,9·d
    /// is gehouden; zie de moduletekst.
    Evenwicht { werkelijk: Hefboomsarm, begrensd: bool },
    /// Er werkt een normaalkracht maar het spanningsblok leverde geen
    /// hefboomsarm; 0,9·d is aangehouden met deze reden.
    Terugval { fout: HefboomsarmFout },
}

/// De hefboomsarm zoals hij in een toets wordt gebruikt, met zijn grondslag.
#[derive(Clone, Debug, PartialEq)]
pub struct ZBepaling {
    /// De z die in de toets is gebruikt, mm.
    pub z_mm: f64,
    /// De nuttige hoogte waarop 0,9·d is betrokken, mm.
    pub d_mm: f64,
    /// De normaalkracht die de keuze bepaalde, kN (trek positief).
    pub n_ed_kn: f64,
    /// Waar z vandaan komt.
    pub grondslag: ZGrondslag,
}

impl ZBepaling {
    /// Is z = 0,9·d aangehouden — als benadering of als terugval?
    pub fn is_0_9d(&self) -> bool {
        matches!(self.grondslag, ZGrondslag::Benadering | ZGrondslag::Terugval { .. })
    }

    /// De werkelijke, onbegrensde hefboomsarm uit het spanningsblok, als die
    /// is bepaald.
    pub fn z_werkelijk_mm(&self) -> Option<f64> {
        match &self.grondslag {
            ZGrondslag::Evenwicht { werkelijk, .. } => Some(werkelijk.z_mm),
            _ => None,
        }
    }

    /// Korte aanduiding voor tabellen.
    pub fn label(&self) -> &'static str {
        match &self.grondslag {
            ZGrondslag::Opgegeven => "opgegeven",
            ZGrondslag::Benadering => "0,9·d",
            ZGrondslag::Evenwicht { begrensd: false, .. } => "evenwicht",
            ZGrondslag::Evenwicht { begrensd: true, .. } => "evenwicht, begrensd op 0,9·d",
            ZGrondslag::Terugval { .. } => "terugval op 0,9·d",
        }
    }

    /// De grondslag uitgeschreven, voor de kanttekeningen van een rapport.
    pub fn toelichting(&self) -> String {
        match &self.grondslag {
            ZGrondslag::Opgegeven => format!(
                "z = {} mm is opgegeven en onveranderd gebruikt.",
                nl(self.z_mm, 1)
            ),
            ZGrondslag::Benadering => format!(
                "z = 0,9·d = 0,9 · {} = {} mm. 6.2.3(1): \"In de dwarskrachtberekening van \
                 gewapend beton zonder normaalkracht mag in het algemeen de benaderende waarde \
                 z = 0,9d zijn gebruikt.\" Er werkt hier geen normaalkracht, dus die benadering \
                 is toegestaan.",
                nl(self.d_mm, 0),
                nl(self.z_mm, 1)
            ),
            ZGrondslag::Evenwicht { werkelijk: w, begrensd } => {
                let kern = format!(
                    "Er werkt een normaalkracht (N_Ed = {} kN), dus de benadering z = 0,9·d van \
                     6.2.3(1) is niet toegestaan en is z de inwendige hefboomsarm van het \
                     buigend koppel: uit het spanningsblok van 3.1.7(3) bij N_Ed volgt \
                     x_u = {} mm met de betondrukkracht F_c = {} kN op {} mm onder de gedrukte \
                     rand, dus z = d − λ·x_u/2 = {} − {} = {} mm (bij M_Rd = {} kNm; de arm hangt \
                     niet van M_Ed af).",
                    nl(self.n_ed_kn, 3),
                    nl(w.x_mm, 1),
                    nl(w.f_c_kn, 1),
                    nl(w.a_c_mm, 1),
                    nl(w.d_mm, 0),
                    nl(w.a_c_mm, 1),
                    nl(w.z_mm, 1),
                    nl(w.m_rd_knm, 1)
                );
                if *begrensd {
                    format!(
                        "{kern} Die arm ligt boven 0,9·d = {} mm; z is op 0,9·d gehouden, want \
                         een normaalkracht mag de toets niet gunstiger maken dan de norm zonder \
                         normaalkracht al toestaat. Een kleinere z is overal de veilige kant.",
                        nl(z_0_9d(self.d_mm), 1)
                    )
                } else {
                    format!(
                        "{kern} Die arm ligt onder 0,9·d = {} mm en is aangehouden: de \
                         benadering zou hier te gunstig zijn.",
                        nl(z_0_9d(self.d_mm), 1)
                    )
                }
            }
            ZGrondslag::Terugval { fout } => format!(
                "Er werkt een normaalkracht (N_Ed = {} kN), maar het spanningsblok levert hier \
                 geen hefboomsarm: {}. Daarom is z = 0,9·d = {} mm aangehouden, de enige waarde \
                 die de norm zelf noemt.",
                nl(self.n_ed_kn, 3),
                fout.omschrijving(),
                nl(self.z_mm, 1)
            ),
        }
    }
}

/// De z volgens 6.2.3(1) uit een al bepaalde uitkomst van het spanningsblok,
/// voor een zijde met nuttige hoogte `d_mm`.
///
/// Dit is de stap waar de begrenzing op 0,9·d zit; zie de moduletekst. Zij
/// staat los van [`bepaal_z`] zodat één uitkomst voor de momentlijn en de
/// dwarskrachtlijn van dezelfde snede kan worden hergebruikt.
pub fn z_uit_uitkomst(uitkomst: HefboomsarmUitkomst, d_mm: f64, n_ed_kn: f64) -> ZBepaling {
    let grens = z_0_9d(d_mm);
    match uitkomst {
        Ok(w) => {
            let begrensd = w.z_mm > grens;
            ZBepaling {
                z_mm: w.z_mm.min(grens),
                d_mm,
                n_ed_kn,
                grondslag: ZGrondslag::Evenwicht { werkelijk: w, begrensd },
            }
        }
        Err(fout) => ZBepaling {
            z_mm: grens,
            d_mm,
            n_ed_kn,
            grondslag: ZGrondslag::Terugval { fout },
        },
    }
}

/// De inwendige hefboomsarm z volgens 6.2.3(1) voor één doorsnede bij
/// N_Ed, voor een moment dat de onderwapening (`trek_onder`) of de
/// bovenwapening op trek zet.
///
/// * `z_opgegeven` — een door de aanroeper gegeven z; een niet-positieve
///   waarde geldt als niet opgegeven.
/// * `d_mm` — de nuttige hoogte van de zijde die op trek staat; daarop
///   worden zowel 0,9·d als z = d − λ·x_u/2 betrokken.
/// * `vooraf` — een al bepaalde uitkomst voor precies deze (doorsnede, korf,
///   N_Ed, trekzijde), zodat een aanroeper die meerdere lijnen uit één snede
///   bouwt het spanningsblok niet twee keer hoeft op te lossen. `None` → hier
///   bepaald.
#[allow(clippy::too_many_arguments)]
pub fn bepaal_z(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    trek_onder: bool,
    n_ed_kn: f64,
    d_mm: f64,
    z_opgegeven: Option<f64>,
    vooraf: Option<HefboomsarmUitkomst>,
) -> ZBepaling {
    if let Some(z) = z_opgegeven.filter(|z| *z > 0.0) {
        return ZBepaling { z_mm: z, d_mm, n_ed_kn, grondslag: ZGrondslag::Opgegeven };
    }
    if n_ed_kn.abs() <= N_NUMERIEK_NUL_KN {
        return ZBepaling {
            z_mm: z_0_9d(d_mm),
            d_mm,
            n_ed_kn,
            grondslag: ZGrondslag::Benadering,
        };
    }
    let uitkomst = vooraf.unwrap_or_else(|| {
        let lagen = cage.layers(section.h_mm);
        hefboomsarm_bij_normaalkracht(section, &lagen, mat, n_ed_kn, trek_onder, d_mm)
    });
    z_uit_uitkomst(uitkomst, d_mm, n_ed_kn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use crate::factors::DesignSituation;
    use crate::section::RebarRow;
    use crate::stress_strain::SteelBranch;
    use approx::assert_relative_eq;

    fn mat() -> DesignMaterial {
        DesignMaterial::new(
            nationale_bijlage::NationaleBijlage::NL,
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
        )
    }

    /// De referentiebalk van de dekkingslijntests: 300 × 600, onder 3Ø16
    /// (d = 554 mm), boven 2Ø12. Bij zuivere buiging ligt de arm van het
    /// spanningsblok hier BOVEN 0,9·d (x_u ≈ 50 mm, z ≈ 0,96·d).
    fn licht_gewapend() -> (ConcreteSection, ReinforcementCage) {
        (
            ConcreteSection::rectangle(300.0, 600.0),
            ReinforcementCage {
                cover_mm: 30.0,
                stirrup_diameter_mm: 8.0,
                bottom: RebarRow { count: 3, diameter_mm: 16.0 },
                top: RebarRow { count: 2, diameter_mm: 12.0 },
                ..Default::default()
            },
        )
    }

    /// Dezelfde doorsnede, zwaar gewapend: onder 6Ø25 (d = 549,5 mm). De
    /// drukzone is diep (x_u/d ≈ 0,5) en de arm ligt bij zuivere buiging
    /// ONDER 0,9·d — ongeveer 0,8·d.
    fn zwaar_gewapend() -> (ConcreteSection, ReinforcementCage) {
        (
            ConcreteSection::rectangle(300.0, 600.0),
            ReinforcementCage {
                cover_mm: 30.0,
                stirrup_diameter_mm: 8.0,
                bottom: RebarRow { count: 6, diameter_mm: 25.0 },
                top: RebarRow { count: 2, diameter_mm: 12.0 },
                ..Default::default()
            },
        )
    }

    fn arm(s: &ConcreteSection, k: &ReinforcementCage, n: f64) -> Hefboomsarm {
        hefboomsarm_bij_normaalkracht(s, &k.layers(s.h_mm), &mat(), n, true, k.d_mm(s.h_mm))
            .unwrap_or_else(|e| panic!("N = {n}: {e:?}"))
    }

    /// Met de hand: enkelvoudig gewapend zonder drukstaal, N = 0. 300 × 500,
    /// 3Ø16 (A_s = 603,19 mm²), d = 454 mm, f_cd = 20, f_yd = 434,78, λ = 0,8:
    ///   x_u = 603,19·434,78/(20·300·0,8) = 54,64 mm
    ///   z   = d − λ·x_u/2 = 454 − 0,4·54,64 = 432,14 mm  (= 0,952·d)
    /// En met 200 kN druk: F_c = 262,25 + 200 = 462,25 kN,
    ///   x_u = 462 254/4800 = 96,30 mm, z = 454 − 38,52 = 415,48 mm.
    #[test]
    fn hefboomsarm_van_de_bekende_formule() {
        let s = ConcreteSection::rectangle(300.0, 500.0);
        let k = ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 0, diameter_mm: 12.0 },
            bottom: RebarRow { count: 3, diameter_mm: 16.0 },
            ..Default::default()
        };
        let a_s = 3.0 * std::f64::consts::PI * 64.0;
        let f_t = a_s * (500.0 / 1.15);
        let w = arm(&s, &k, 0.0);
        let x = f_t / (20.0 * 300.0 * 0.8);
        assert_relative_eq!(w.x_mm, x, max_relative = 1e-6);
        assert_relative_eq!(w.a_c_mm, 0.4 * x, max_relative = 1e-6);
        assert_relative_eq!(w.z_mm, 454.0 - 0.4 * x, max_relative = 1e-6);
        assert_relative_eq!(w.f_t_kn, f_t / 1000.0, max_relative = 1e-6);
        assert_relative_eq!(w.f_c_kn, w.f_t_kn, max_relative = 1e-6);
        assert_eq!(w.f_s_druk_kn, 0.0);
        assert!(w.trek_onder);

        let w = arm(&s, &k, -200.0);
        let x = (f_t + 200_000.0) / (20.0 * 300.0 * 0.8);
        assert_relative_eq!(w.x_mm, x, max_relative = 1e-6);
        assert_relative_eq!(w.z_mm, 454.0 - 0.4 * x, max_relative = 1e-6);
        assert_relative_eq!(w.f_c_kn - w.f_t_kn, 200.0, epsilon = 1e-6);
    }

    /// De richting uit de moduletekst, op het spanningsblok zelf: bij druk
    /// krimpt de hefboomsarm, bij trek groeit hij — monotoon, want z hangt
    /// alleen van x_u af en x_u van N_Ed. Een tekenfout hier zou bij druk een
    /// te grote z geven en dus een te kleine trekkracht — onveilig.
    #[test]
    fn druk_verkleint_en_trek_vergroot_de_hefboomsarm() {
        for (s, k) in [licht_gewapend(), zwaar_gewapend()] {
            let nul = arm(&s, &k, 0.0);
            let klein_druk = arm(&s, &k, -0.486);
            let druk = arm(&s, &k, -150.0);
            let klein_trek = arm(&s, &k, 0.486);
            let trek = arm(&s, &k, 60.0);
            assert!(druk.z_mm < klein_druk.z_mm, "{} < {}", druk.z_mm, klein_druk.z_mm);
            assert!(klein_druk.z_mm < nul.z_mm, "{} < {}", klein_druk.z_mm, nul.z_mm);
            assert!(nul.z_mm < klein_trek.z_mm, "{} < {}", nul.z_mm, klein_trek.z_mm);
            assert!(klein_trek.z_mm < trek.z_mm, "{} < {}", klein_trek.z_mm, trek.z_mm);
            // De drukzone groeit bij druk en krimpt bij trek — dát is de
            // reden van de richting.
            assert!(druk.x_mm > klein_druk.x_mm && klein_druk.x_mm > nul.x_mm);
            assert!(nul.x_mm > klein_trek.x_mm && klein_trek.x_mm > trek.x_mm);
            // 0,486 kN — de scheefstand van de moduletekst — verandert z met
            // een verhouding van hoogstens enkele honderdsten van een procent.
            assert_relative_eq!(klein_druk.z_mm, nul.z_mm, max_relative = 1e-3);
            assert_relative_eq!(klein_trek.z_mm, nul.z_mm, max_relative = 1e-3);
        }
    }

    /// Het evenwicht klopt: F_c + F_s,druk − F_t = −N_Ed (trek positief), en
    /// z = d − a_c.
    #[test]
    fn krachten_zijn_in_evenwicht_met_n() {
        let (s, k) = licht_gewapend();
        for n in [0.0, -80.0, 40.0] {
            let w = arm(&s, &k, n);
            assert_relative_eq!(w.f_t_kn - w.f_c_kn - w.f_s_druk_kn, n, epsilon = 1e-6);
            assert_relative_eq!(w.z_mm, w.d_mm - w.a_c_mm, max_relative = 1e-12);
            assert!(w.a_c_mm > 0.0 && w.a_c_mm < w.x_mm);
            assert!(w.m_rd_knm > 0.0);
        }
    }

    /// Trek boven geeft dezelfde arm als de gespiegelde korf met trek onder:
    /// z hangt niet van het teken af, alleen van welke rij trekt.
    #[test]
    fn trek_boven_spiegelt_en_geeft_dezelfde_arm() {
        let (s, k) = licht_gewapend();
        let m = mat();
        let d_boven = s.h_mm - k.d2_mm();
        let boven =
            hefboomsarm_bij_normaalkracht(&s, &k.layers(s.h_mm), &m, -20.0, false, d_boven)
                .unwrap();
        let gespiegeld = ReinforcementCage { bottom: k.top, top: k.bottom, ..k };
        let onder = arm(&s, &gespiegeld, -20.0);
        assert_relative_eq!(boven.z_mm, onder.z_mm, max_relative = 1e-9);
        assert!(!boven.trek_onder && onder.trek_onder);
    }

    /// De bovenlijn van een ligger met zware onderwapening: de onderwapening
    /// komt in het spanningsblok licht op trek, maar de arm blijft die tussen
    /// het drukblok en de BOVENwapening — ruim boven 0,9·d, niet ingezakt
    /// naar het midden. Dit is het artefact uit de moduletekst.
    #[test]
    fn zware_onderwapening_trekt_de_arm_van_de_bovenlijn_niet_naar_beneden() {
        let s = ConcreteSection::rectangle(300.0, 600.0);
        let k = ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            bottom: RebarRow { count: 5, diameter_mm: 16.0 },
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            ..Default::default()
        };
        let d_boven = s.h_mm - k.d2_mm();
        let w = hefboomsarm_bij_normaalkracht(&s, &k.layers(s.h_mm), &mat(), -0.05, false, d_boven)
            .unwrap();
        // 2Ø12·f_yd = 98,3 kN; alles daarboven komt uit de onderwapening, die
        // onder de neutrale lijn (x_u ≈ 40 mm < 46 mm) licht op trek staat.
        assert!(w.f_t_kn > 150.0, "de onderwapening trekt hier mee: {w:?}");
        assert!(w.z_mm > 0.9 * d_boven, "z = {} hoort boven 0,9·d = {} te liggen", w.z_mm, 0.9 * d_boven);
        assert!(w.z_mm < d_boven);
        assert_relative_eq!(w.z_mm, d_boven - w.a_c_mm, max_relative = 1e-12);
    }

    /// De regel van 6.2.3(1) in de vier gronden.
    #[test]
    fn bepaal_z_kent_de_vier_gronden() {
        let (s, k) = licht_gewapend();
        let m = mat();
        let d = k.d_mm(s.h_mm);

        let op = bepaal_z(&s, &k, &m, true, -50.0, d, Some(480.0), None);
        assert_eq!(op.grondslag, ZGrondslag::Opgegeven);
        assert_relative_eq!(op.z_mm, 480.0);

        // Een niet-positieve opgave is geen opgave.
        let nul = bepaal_z(&s, &k, &m, true, 0.0, d, Some(0.0), None);
        assert_eq!(nul.grondslag, ZGrondslag::Benadering);
        assert_relative_eq!(nul.z_mm, 0.9 * d);
        assert!(nul.is_0_9d());

        let ruis = bepaal_z(&s, &k, &m, true, 1e-9, d, None, None);
        assert_eq!(ruis.grondslag, ZGrondslag::Benadering);

        let ev = bepaal_z(&s, &k, &m, true, -0.486, d, None, None);
        assert!(matches!(ev.grondslag, ZGrondslag::Evenwicht { .. }), "{:?}", ev.grondslag);
        assert!(!ev.is_0_9d());
        assert!(ev.z_mm <= 0.9 * d + 1e-12);
        assert!(ev.z_werkelijk_mm().is_some());
        assert!(ev.toelichting().contains("3.1.7(3)"));

        // Zware druk: geheel gedrukt, dus de terugval met reden.
        let terug = bepaal_z(&s, &k, &m, true, -5000.0, d, None, None);
        assert_eq!(
            terug.grondslag,
            ZGrondslag::Terugval { fout: HefboomsarmFout::GeheelGedrukt }
        );
        assert_relative_eq!(terug.z_mm, 0.9 * d);
        assert!(terug.is_0_9d());
        assert!(terug.toelichting().contains("3.1.7(3)"));
    }

    /// De begrenzing op 0,9·d, in beide richtingen. Licht gewapend ligt de
    /// werkelijke arm BOVEN 0,9·d en houdt een verwaarloosbare normaalkracht
    /// z exact op 0,9·d — geen sprong. Zwaar gewapend ligt hij ERONDER en
    /// geldt de werkelijke arm: de benadering zou daar te gunstig zijn.
    #[test]
    fn de_begrenzing_houdt_z_nooit_boven_0_9d() {
        let m = mat();
        let (s, k) = licht_gewapend();
        let d = k.d_mm(s.h_mm);
        let z = bepaal_z(&s, &k, &m, true, -0.486, d, None, None);
        assert!(z.z_werkelijk_mm().unwrap() > 0.9 * d, "licht gewapend: werkelijke arm > 0,9·d");
        assert_relative_eq!(z.z_mm, 0.9 * d, max_relative = 1e-12);
        assert!(matches!(z.grondslag, ZGrondslag::Evenwicht { begrensd: true, .. }));

        let (s, k) = zwaar_gewapend();
        let d = k.d_mm(s.h_mm);
        let z = bepaal_z(&s, &k, &m, true, -0.486, d, None, None);
        assert!(z.z_werkelijk_mm().unwrap() < 0.9 * d, "zwaar gewapend: werkelijke arm < 0,9·d");
        assert_relative_eq!(z.z_mm, z.z_werkelijk_mm().unwrap(), max_relative = 1e-12);
        assert!(matches!(z.grondslag, ZGrondslag::Evenwicht { begrensd: false, .. }));

        // Trek maakt de werkelijke arm groter, maar de gebruikte z blijft
        // onder 0,9·d — de veilige kant voor elke grootheid waarin z staat.
        let (s, k) = licht_gewapend();
        let d = k.d_mm(s.h_mm);
        let z = bepaal_z(&s, &k, &m, true, 40.0, d, None, None);
        assert!(z.z_mm <= 0.9 * d + 1e-12);
    }

    /// De terugvallen die het spanningsblok kan melden, elk met zijn reden.
    #[test]
    fn terugvallen_hebben_een_reden() {
        let (s, k) = licht_gewapend();
        let m = mat();
        let lagen = k.layers(s.h_mm);
        let d = k.d_mm(s.h_mm);
        assert_eq!(
            hefboomsarm_bij_normaalkracht(&s, &[], &m, -10.0, true, d),
            Err(HefboomsarmFout::GeenWapening)
        );
        assert_eq!(
            hefboomsarm_bij_normaalkracht(&s, &lagen, &m, -5000.0, true, d),
            Err(HefboomsarmFout::GeheelGedrukt)
        );
        assert_eq!(
            hefboomsarm_bij_normaalkracht(&s, &lagen, &m, 5000.0, true, d),
            Err(HefboomsarmFout::TrekcapaciteitOverschreden)
        );
        // Zoveel druk dat de drukzone tot voorbij de onderwapening reikt,
        // maar de doorsnede nog niet geheel gedrukt is.
        let e = hefboomsarm_bij_normaalkracht(&s, &lagen, &m, -3000.0, true, d)
            .expect_err("x_u ≥ d hoort geen arm te geven");
        assert!(
            matches!(e, HefboomsarmFout::GeenTrekgordel | HefboomsarmFout::GeheelGedrukt),
            "{e:?}"
        );
        for f in [
            HefboomsarmFout::GeenWapening,
            HefboomsarmFout::GeheelGedrukt,
            HefboomsarmFout::TrekcapaciteitOverschreden,
            HefboomsarmFout::GeenTrekgordel,
        ] {
            assert!(!f.omschrijving().is_empty());
        }
    }
}
