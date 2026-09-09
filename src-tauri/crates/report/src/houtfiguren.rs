//! Houtfiguren — de opbouw van een kruislaaghout-doorsnede met het
//! spanningsverloop, native op een [`DrawList`] getekend zodat hij in de PDF
//! een vectortekening is en geen plaatje.
//!
//! # Waarom deze module bestaat
//!
//! Op het scherm heeft kruislaaghout al een volwaardig hoofdstuk: een tabel
//! per lamel, de opbouw van de stijfheid, en een tekening met het
//! spanningsverloop. Op papier stond daarvan niets — de rapportcrate las het
//! veld `layup` van een kruislaaghout-resultaat nergens. Deze module tekent
//! die figuur na, langs hetzelfde pad als [`crate::betonfiguren`].
//!
//! # DE VALKUIL, EN DE BEWAKING ERTEGEN
//!
//! Natekenen levert een **tweede** tekening van hetzelfde ding op, en twee
//! tekeningen van hetzelfde ding lopen uit elkaar. Bij kruislaaghout is dat
//! risico groter dan bij beton, want de mechanica erachter staat óók twee
//! keer: in de kern (`nen-en-1995-1-1/src/clt.rs`, `CltMechanics`) en in de
//! frontend (`design-mockup/src/lib/cltCheckBuilder.ts`, `cltMechanica`) —
//! en die tweede is geen tekenhulpje maar de bron van de staafstijfheid
//! waarmee de SOLVER rekent (`sectionResolver.ts`).
//!
//! Daarom:
//!
//! * deze module leidt niets zelf af. Het τ-verloop wordt bemonsterd uit
//!   [`CltMechanics`] — dezelfde mechanica die de toets gebruikt — en de
//!   spanningen per laag komen uit het toetsresultaat zelf. Er staat hier
//!   geen tweede formulering van bijlage B;
//! * wat wél twee keer bestaat — de BEMONSTERING van het verloop en de
//!   ontleding van I_y per laag — wordt bewaakt door één gedeeld bestand:
//!   `tests/golden/cltmeetkunde-referentie.json`. De Rust-lezer is
//!   `tests/cltmeetkunde_referentie.rs`, de TS-lezer
//!   `design-mockup/test-cltmeetkunde-referentie.mjs`. Geen van beide tests
//!   draagt eigen getallen; verschuift één kant een laaggrens, dan valt die
//!   kant om.
//!
//! # De andere tekening
//!
//! `design-mockup/src/components/clt/CltOpbouwTekening.tsx`. De ontwerpmaten
//! hieronder (`Y0`, `DRAW_H`, `XA` …) zijn daar letterlijk uit overgenomen,
//! zodat de PDF en het scherm dezelfde indeling houden.
//!
//! # Wat de tekenmotor niet kan, en wat daarvoor in de plaats komt
//!
//! Net als bij de betonfiguren kent [`DrawOp`](openaec_layout::draw::DrawOp)
//! geen streeplijn, geen doorzichtigheid, geen gedraaide tekst — en ook geen
//! arceerpatroon. Daarom:
//!
//! * de arcering wordt als losse lijnstukken getekend, analytisch op de laag
//!   afgeknipt ([`arcering_diagonaal`], [`arcering_horizontaal`]);
//! * de streep-punt-lijn van de zwaartelijn komt uit [`streep_punt_lijn`];
//! * de doorzichtige vulling van een spanningsvlak wordt vooraf met wit
//!   gemengd (`meng_met_wit`, uit de betonmodule — op wit papier exact
//!   hetzelfde beeld);
//! * de gedraaide h-maat van het scherm staat hier horizontaal ÓP de
//!   maatlijn met een uitsparing eronder, de gangbare tekenconventie en
//!   dezelfde keuze als bij de betondoorsnede;
//! * het z₀-label krijgt geen omtreklijn-halo maar een uitsparing in de
//!   houtkleur.

// `!(x > 0.0)` is hier met opzet geen `x <= 0.0`: de eerste vorm vangt óók NaN
// af en de tweede niet. Dezelfde schrijfwijze als in de kern, in de frontend
// en in `betonfiguren.rs`.
#![allow(clippy::neg_cmp_op_on_partial_ord)]

use openaec_layout::{
    draw::DrawList,
    types::{Color, Pt, Rect},
};

use nen_en_1995_1_1::clt::{CltLayer, CltLayerOrientation, CltLayup, CltMechanics};
use timber_check::clt::CltLayupResult;

use crate::betonfiguren::{maat, meng_met_wit};

// ── Kleuren ───────────────────────────────────────────────────────────────────

/// Het palet van de houtfiguren op papier.
///
/// Spiegel van `CltTekenKleuren` / `CLT_RAPPORT_KLEUREN` in
/// `design-mockup/src/components/clt/CltOpbouwTekening.tsx`; de veldnamen zijn
/// dezelfde, zodat een wijziging daar hier één op één te volgen is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HoutKleuren {
    /// Vlak van het hout. Materiaalkleur: in elk thema hetzelfde.
    pub hout_vlak: Color,
    /// Arcering ÓP dat vlak.
    pub arcering: Color,
    /// Laagcontour; ligt eveneens op dat vlak.
    pub contour: Color,
    /// Zware contour van de maatgevende laag.
    pub contour_maatgevend: Color,
    /// Gewone tekst.
    pub tekst: Color,
    /// Maatlijnen, pijlen, zwaartelijn en grafiekassen.
    pub maatlijn: Color,
    /// De verwijzing "← maatgevend" bij de maatgevende laag.
    pub tekst_maatgevend: Color,
    /// Vulling van het σ-vlak.
    pub sigma_vlak: Color,
    /// Vulling van het τ-vlak.
    pub tau_vlak: Color,
}

/// Vaste documentkleuren — letterlijk `CLT_RAPPORT_KLEUREN` uit
/// `CltOpbouwTekening.tsx`.
pub const RAPPORT_KLEUREN: HoutKleuren = HoutKleuren {
    hout_vlak: Color::rgb(0xe9, 0xde, 0xca),
    arcering: Color::rgb(0x8b, 0x73, 0x55),
    contour: Color::rgb(0x39, 0x42, 0x4e),
    contour_maatgevend: Color::rgb(0xb9, 0x1c, 0x1c),
    tekst: Color::rgb(0x33, 0x33, 0x33),
    maatlijn: Color::rgb(0x5b, 0x64, 0x70),
    tekst_maatgevend: Color::rgb(0xb9, 0x1c, 0x1c),
    sigma_vlak: Color::rgb(0xc9, 0xd6, 0xe8),
    tau_vlak: Color::rgb(0xd9, 0xc9, 0xe8),
};

/// Opmaak van een houtfiguur: het palet en het lettertype.
///
/// Een EIGEN stijltype naast [`crate::betonfiguren::Figuurstijl`], en niet een
/// extra veld daarin: het palet van deze figuur is een houtpalet (houtvlak,
/// arcering, dwarslaag) en heeft met de betonkleuren niets te maken. Het
/// lettertype is het enige dat de twee delen, en dat komt via
/// [`Houtstijl::met_font`] mee uit de rapportstijl — zodat er één plaats is
/// waar het rapport zijn lettertype doorgeeft.
#[derive(Clone, Debug)]
pub struct Houtstijl {
    pub kleuren: HoutKleuren,
    /// Naam waaronder het lettertype in de `FontRegistry` staat.
    pub font: String,
}

impl Default for Houtstijl {
    fn default() -> Self {
        Self {
            kleuren: RAPPORT_KLEUREN,
            font: "LiberationSans-Regular".to_string(),
        }
    }
}

impl Houtstijl {
    /// De rapportstijl met het lettertype van de aanroeper.
    pub fn met_font(font: &str) -> Self {
        Self {
            kleuren: RAPPORT_KLEUREN,
            font: font.to_string(),
        }
    }
}

// ── De bemonstering van het spanningsverloop — de bewaakte kant ───────────────

/// Monsterpunten per lengtelaag; τ verloopt daar parabolisch.
pub const CLT_TAU_MONSTERS_LENGTELAAG: usize = 9;
/// Monsterpunten per dwarslaag; τ is daar constant (E = 0 ⇒ (ES) constant).
pub const CLT_TAU_MONSTERS_DWARSLAAG: usize = 2;
/// Twee monsterhoogten die dichter dan dit bij elkaar liggen zijn hetzelfde
/// punt: de gedeelde laaggrens, of een zwaartelijn die daarop valt.
/// 10⁻⁹ mm is een picometer — ruim onder alles wat een tekening kan betekenen.
pub const CLT_MONSTER_SAMENVAL_MM: f64 = 1e-9;

/// De hoogten (mm vanaf boven) waarop het τ-verloop wordt bemonsterd.
///
/// DE ZWAARTELIJN IS EEN VAST MONSTERPUNT wanneer hij BINNEN een lengtelaag
/// valt. Daar ligt de piek van τ, en de kern evalueert hem daar expliciet:
/// [`CltMechanics::layer_max_shear`] voegt z₀ als kandidaat toe onder precies
/// deze voorwaarde. Zonder dat punt viel de getekende piek bij een
/// ASYMMETRISCHE opbouw lager uit dan de τ_d in de tabel ernaast — dezelfde
/// grootheid, twee antwoorden op één blad.
///
/// In een dwarslaag wordt z₀ NIET toegevoegd, om dezelfde reden als in de
/// kern: met E = 0 verandert (ES) daar niet, dus is τ over de hele laag gelijk
/// en is er geen piek om te raken.
///
/// Spiegel van `cltTauMonsterZ` in `cltCheckBuilder.ts`; bewaakt door
/// `tests/golden/cltmeetkunde-referentie.json`.
pub fn tau_monster_z(mech: &CltMechanics) -> Vec<f64> {
    let mut uit: Vec<f64> = Vec::new();
    for l in &mech.layers {
        let n = if l.e_mpa > 0.0 {
            CLT_TAU_MONSTERS_LENGTELAAG
        } else {
            CLT_TAU_MONSTERS_DWARSLAAG
        };
        let mut punten: Vec<f64> = (0..n)
            .map(|k| l.z_top_mm + (l.z_bot_mm - l.z_top_mm) * k as f64 / (n - 1) as f64)
            .collect();
        if l.e_mpa > 0.0 && mech.z0_mm > l.z_top_mm && mech.z0_mm < l.z_bot_mm {
            punten.push(mech.z0_mm);
        }
        punten.sort_by(|a, b| a.partial_cmp(b).expect("laaggrenzen zijn eindige getallen"));
        for z in punten {
            match uit.last() {
                Some(&laatste) if (z - laatste).abs() <= CLT_MONSTER_SAMENVAL_MM => {}
                _ => uit.push(z),
            }
        }
    }
    uit
}

/// Het τ-verloop over de hoogte als één doorlopende reeks (z, τ); V in kN,
/// b_ef = k_cr·b.
pub fn tau_verloop(mech: &CltMechanics, v_kn: f64, k_cr: f64) -> Vec<(f64, f64)> {
    tau_monster_z(mech)
        .into_iter()
        .map(|z| (z, mech.tau_mpa(z, v_kn, k_cr)))
        .collect()
}

/// Het σ-verloop als één segment per laag: lineair van boven- naar onderkant,
/// nul in de dwarslagen. Spiegel van `cltSigmaVerloop` in `cltCheckBuilder.ts`.
pub fn sigma_verloop(mech: &CltMechanics, m_knm: f64) -> Vec<Vec<(f64, f64)>> {
    mech.layers
        .iter()
        .map(|l| {
            let (boven, onder) = mech.layer_edge_stresses(l.index, m_knm);
            vec![(l.z_top_mm, boven), (l.z_bot_mm, onder)]
        })
        .collect()
}

/// De mechanica van een opbouw terug uit het TOETSRESULTAAT.
///
/// Het rapport krijgt geen [`CltMechanics`] binnen maar een geserialiseerd
/// [`CltLayupResult`]. In plaats van A_i, I_i en a_i hier opnieuw uit te
/// rekenen — dat zou een dérde formulering van bijlage B opleveren, naast de
/// kern en de frontend — wordt de opbouw teruggebouwd en dóór de kern gehaald.
/// Dat is dezelfde code met dezelfde invoer, dus dezelfde uitkomst; en het is
/// de reden dat `nen-en-1995-1-1` een gewone afhankelijkheid van deze crate is
/// en geen dev-afhankelijkheid.
///
/// `None` bij een opbouw die de kern niet kan verwerken — in de praktijk
/// alleen het foutresultaat, waarin `layers` leeg is. Het hoofdstuk meldt dan
/// zelf waarom er geen figuur staat.
pub fn mechanica_uit_resultaat(res: &CltLayupResult) -> Option<CltMechanics> {
    if res.layers.is_empty() {
        return None;
    }
    let layup = CltLayup::new(
        res.width_mm,
        res.layers
            .iter()
            .map(|l| CltLayer {
                thickness_mm: l.thickness_mm,
                orientation: l.orientation,
                strength_class: l.strength_class.clone(),
            })
            .collect(),
    );
    layup.mechanics().ok()
}

/// Hebben alle DRAGENDE lagen dezelfde E?
///
/// Alleen dan is de meetkundige som Σ(I_i + A_i·a_i²) gelijk aan I_ef,net en
/// mag de tabel die som zo noemen. Spiegel van `cltLagenZelfdeE`.
pub fn lagen_zelfde_e(mech: &CltMechanics) -> bool {
    match mech.reference_e_mpa() {
        None => false,
        Some(e) => mech.layers.iter().all(|l| l.e_mpa == 0.0 || l.e_mpa == e),
    }
}

// ── De figuur ─────────────────────────────────────────────────────────────────

/// Eén laag zoals de tekening hem nodig heeft.
#[derive(Clone, Debug)]
pub struct CltTekenLaag {
    pub dikte_mm: f64,
    pub richting: CltLayerOrientation,
    /// Sterkteklasse in het laaglabel; weglaten laat hem daar weg.
    pub klasse: Option<String>,
    /// Bevat de maatgevende toets van de staaf.
    pub maatgevend: bool,
}

/// Een grootheid over de hoogte: segmenten van (z vanaf boven, waarde).
#[derive(Clone, Debug)]
pub struct Verloop {
    pub segmenten: Vec<Vec<(f64, f64)>>,
    /// Aslabel, bijv. "σm,d".
    pub label: String,
    pub eenheid: String,
    /// Korte regel onder het aslabel, bijv. "bij x = 2,50 m".
    ///
    /// σ hoort bij het maatgevende MOMENT-punt en τ bij het maatgevende
    /// DWARSKRACHT-punt: twee verschillende punten in de omhullende. Zonder
    /// deze regel lezen de panelen als één toestand van de doorsnede.
    pub noot: Option<String>,
}

/// De volledige figuur: de opbouw plus (optioneel) de twee spanningspanelen.
#[derive(Clone, Debug)]
pub struct CltOpbouwFiguur {
    pub lagen: Vec<CltTekenLaag>,
    /// Breedte van de strook (mm). Wordt NIET op schaal getekend; dat staat in
    /// het b-label.
    pub breedte_mm: f64,
    /// Zwaartelijn vanaf boven (mm); zonder waarde geen lijn.
    pub z0_mm: Option<f64>,
    pub sigma: Option<Verloop>,
    pub tau: Option<Verloop>,
}

// De ontwerpmaten van `CltOpbouwTekening.tsx`, letterlijk overgenomen.
const Y0: f32 = 24.0; // bovenmarge: b-label
const DRAW_H: f32 = 120.0; // vaste tekenhoogte; de plaat vult die altijd
const XA: f32 = 34.0; // doorsnede
const WA: f32 = 96.0;
const XLAB: f32 = XA + WA + 6.0; // labelkolom rechts van de doorsnede
const XB: f32 = XLAB + 70.0; // σ-paneel
const WB: f32 = 64.0;
const XC: f32 = XB + WB + 24.0; // τ-paneel
const WC: f32 = 52.0;
const FRAME_W: f32 = XC + WC + 16.0;
const FRAME_H: f32 = Y0 + DRAW_H + 32.0;
const TICK: f32 = 3.0;
/// Kaderbreedte zónder spanningspanelen; zie de toelichting in de TSX.
const FRAME_W_SMAL: f32 = if XLAB + 56.0 + 8.0 > 178.0 {
    XLAB + 56.0 + 8.0
} else {
    178.0
};

/// De ontwerpmaat (breedte, hoogte) van het kader waarin deze figuur past.
///
/// Zonder spanningspanelen krimpt het kader mee, precies als op het scherm:
/// het volle kader zou dan voor twee derde wit zijn en de doorsnede onnodig
/// klein maken.
pub fn clt_kader(fig: &CltOpbouwFiguur) -> (f32, f32) {
    let gov = fig.lagen.iter().any(|l| l.maatgevend);
    let smal = fig.sigma.is_none() && fig.tau.is_none();
    let breedte = if smal { FRAME_W_SMAL } else { FRAME_W };
    // De uitleg van de zware contour krijgt altijd een eigen legenda-regel
    // zodra er een maatgevende laag is; het kader groeit daarvoor mee. Zie
    // `teken_clt_opbouw`.
    (breedte, FRAME_H + if gov { 10.0 } else { 0.0 })
}

/// Omrekening van ontwerpeenheden naar punten: de figuur wordt met behoud van
/// verhouding in het opgegeven rechthoekje gepast en gecentreerd.
///
/// Dezelfde rekenregel als `Kader` in `betonfiguren.rs`. Die staat daar privé
/// en wordt hier niet publiek gemaakt: het is drie regels rekenwerk, en er
/// een gedeelde module voor optuigen zou de betonmodule moeten openbreken
/// voor iets dat niets met beton te maken heeft.
#[derive(Clone, Copy, Debug)]
struct Kader {
    x0: f32,
    y0: f32,
    s: f32,
}

impl Kader {
    fn nieuw(vlak: Rect, breedte: f32, hoogte: f32) -> Self {
        let s = (vlak.width.0 / breedte).min(vlak.height.0 / hoogte);
        Self {
            x0: vlak.x.0 + (vlak.width.0 - breedte * s) / 2.0,
            y0: vlak.y.0 + (vlak.height.0 - hoogte * s) / 2.0,
            s,
        }
    }
    fn x(&self, u: f32) -> Pt {
        Pt(self.x0 + u * self.s)
    }
    /// y loopt naar beneden, net als in de SVG en in de tekenmotor.
    fn y(&self, v: f32) -> Pt {
        Pt(self.y0 + v * self.s)
    }
    fn l(&self, u: f32) -> Pt {
        Pt(u * self.s)
    }
}

// ── Tekenhulpjes ──────────────────────────────────────────────────────────────

/// Een streep-punt-lijn: het patroon `7 2,5 1,5 2,5` van de SVG, in stukjes
/// getekend omdat de tekenmotor geen `stroke-dasharray` kent.
fn streep_punt_lijn(dl: &mut DrawList, x1: Pt, y1: Pt, x2: Pt, y2: Pt, eenheid: f32) {
    // Lengtes uit `strokeDasharray="7 2.5 1.5 2.5"`, geschaald met het kader.
    let patroon = [7.0, 2.5, 1.5, 2.5].map(|v| v * eenheid);
    let (dx, dy) = (x2.0 - x1.0, y2.0 - y1.0);
    let lengte = (dx * dx + dy * dy).sqrt();
    if !(lengte > 0.0) {
        return;
    }
    let (ex, ey) = (dx / lengte, dy / lengte);
    let mut t = 0.0f32;
    let mut i = 0usize;
    while t < lengte {
        let stuk = patroon[i % patroon.len()];
        if stuk <= 0.0 {
            return;
        }
        // Even stukken zijn streep, oneven zijn gat.
        if i.is_multiple_of(2) {
            let eind = (t + stuk).min(lengte);
            dl.draw_line(
                Pt(x1.0 + ex * t),
                Pt(y1.0 + ey * t),
                Pt(x1.0 + ex * eind),
                Pt(y1.0 + ey * eind),
            );
        }
        t += stuk;
        i += 1;
    }
}

/// Ruwe schatting van de tekstbreedte in punten, alleen voor uitsparingen.
///
/// Zelfde factor en zelfde reden als `tekstbreedte_schatting` in
/// `betonfiguren.rs`: te ruim schatten valt niet op, te krap laat een lijn
/// dwars door de letters lopen.
fn tekstbreedte_schatting(tekst: &str, grootte: Pt) -> Pt {
    Pt(tekst.chars().count() as f32 * grootte.0 * 0.60)
}

/// Tekst met een uitsparing in `achtergrond` eronder, zodat een lijn die
/// eronder doorloopt wordt onderbroken. `gecentreerd` bepaalt de uitlijning.
#[allow(clippy::too_many_arguments)]
fn tekst_met_uitsparing(
    dl: &mut DrawList,
    font: &str,
    x: Pt,
    y: Pt,
    grootte: Pt,
    tekst: &str,
    kleur: Color,
    achtergrond: Color,
    gecentreerd: bool,
) {
    let w = tekstbreedte_schatting(tekst, grootte);
    let links = if gecentreerd { x.0 - w.0 / 2.0 } else { x.0 };
    dl.set_fill_color(achtergrond);
    dl.draw_rect(
        Pt(links - 1.0),
        Pt(y.0 - grootte.0 * 0.80),
        Pt(w.0 + 2.0),
        Pt(grootte.0 * 1.05),
        true,
        false,
    );
    dl.set_font(font, grootte);
    dl.set_fill_color(kleur);
    if gecentreerd {
        dl.draw_text_center(x, y, tekst);
    } else {
        dl.draw_text(x, y, tekst);
    }
}

/// Pijlpunt van een maatlijn: dezelfde driehoek als op het scherm
/// ("0,0 6,-2 6,2"), wijzend in de richting `hoek` graden (0 = naar rechts).
fn pijl(dl: &mut DrawList, x: Pt, y: Pt, hoek: f32, lengte: Pt) {
    let a = hoek.to_radians();
    let (c, s) = (a.cos(), a.sin());
    let punt = |px: f32, py: f32| (Pt(x.0 + px * c - py * s), Pt(y.0 + px * s + py * c));
    let l = lengte.0;
    let b = l * 2.0 / 6.0;
    dl.draw_polygon(vec![punt(0.0, 0.0), punt(l, -b), punt(l, b)], true, false);
}

/// Diagonale arcering (kopshout: de lengtelaag), analytisch afgeknipt op de
/// laag.
///
/// De SVG gebruikt een patroon van 5 × 5 met `M0 5 L5 0` en `patternUnits =
/// userSpaceOnUse`: dat zijn de lijnen x + y = 5k in ONTWERPeenheden, met de
/// oorsprong van het kader als anker. Hier wordt precies diezelfde schaar
/// lijnen getekend en per lijn op de rechthoek afgeknipt — de tekenmotor kent
/// geen patroon en geen afknipvlak.
fn arcering_diagonaal(dl: &mut DrawList, k: &Kader, x0: f32, y0: f32, x1: f32, y1: f32) {
    const STAP: f32 = 5.0;
    let c_min = (x0 + y0) / STAP;
    let c_max = (x1 + y1) / STAP;
    let mut i = c_min.floor() as i32;
    while (i as f32) <= c_max {
        let c = i as f32 * STAP;
        // x + y = c binnen de rechthoek: x loopt van max(x0, c − y1) tot
        // min(x1, c − y0).
        let xa = x0.max(c - y1);
        let xb = x1.min(c - y0);
        if xb > xa {
            dl.draw_line(k.x(xa), k.y(c - xa), k.x(xb), k.y(c - xb));
        }
        i += 1;
    }
}

/// Horizontale arcering (de dwarslaag: vezels in het tekenvlak).
///
/// Patroon 6 × 3 met `M0 1.5 L6 1.5`, dus lijnen op y = 1,5 + 3k.
fn arcering_horizontaal(dl: &mut DrawList, k: &Kader, x0: f32, y0: f32, x1: f32, y1: f32) {
    const STAP: f32 = 3.0;
    const OFFSET: f32 = 1.5;
    let mut i = ((y0 - OFFSET) / STAP).floor() as i32;
    while OFFSET + i as f32 * STAP <= y1 {
        let y = OFFSET + i as f32 * STAP;
        if y >= y0 {
            dl.draw_line(k.x(x0), k.y(y), k.x(x1), k.y(y));
        }
        i += 1;
    }
}

/// Aantal decimalen van een spanningslabel in de figuur: twee, of DRIE zodra
/// de waarde onder 1 ligt.
///
/// Waarom die uitzondering: schuifspanningen in kruislaaghout liggen in de
/// orde van honderdsten. Met twee decimalen leest een τ van 0,099 N/mm² als
/// "0,1" terwijl de tabel ernaast 0,099 zegt — dezelfde grootheid, twee
/// antwoorden op één blad. Spiegel van `spanningsDecimalen` in
/// `CltOpbouwTekening.tsx`; de twee moeten gelijk blijven, anders zegt het
/// papier iets anders dan het scherm.
pub fn spanning_decimalen(v: f64) -> usize {
    if v.abs() < 1.0 {
        3
    } else {
        2
    }
}

/// Getal met hoogstens `decimalen` decimalen, zonder nullen aan het eind —
/// `toLocaleString("nl-NL", { maximumFractionDigits })`, zoals `fmt()` in de
/// TSX.
fn nl_kort(v: f64, decimalen: usize) -> String {
    let f = 10f64.powi(decimalen as i32);
    let afgerond = (v * f).round() / f;
    let mut s = format!("{:.*}", decimalen, afgerond);
    if s.contains('.') {
        while s.ends_with('0') {
            s.pop();
        }
        if s.ends_with('.') {
            s.pop();
        }
    }
    let s = s.replace('.', ",");
    // `-0` is geen richting maar een afrondingsrest.
    if s == "-0" {
        "0".to_string()
    } else {
        s
    }
}

// ── Tekenen ───────────────────────────────────────────────────────────────────

/// De opbouw van een kruislaaghout-doorsnede met het spanningsverloop.
///
/// Drie panelen naast elkaar, precies zoals op het scherm:
///
/// 1. de lagen op hoogteschaal, met arcering per richting, de laaglabels, de
///    zwaartelijn z₀ en de totale hoogte h;
/// 2. de buigspanning σ_m,d: lineair per lengtelaag, nul in de dwarslagen;
/// 3. de schuifspanning τ_d: parabolisch in de lengtelagen, constant in de
///    dwarslagen.
///
/// De BREEDTE van de strook wordt niet op schaal getekend — een strook van
/// 1000 mm naast een hoogte van 160 mm zou de lagen tot streepjes maken. Dat
/// staat in het b-label.
pub fn teken_clt_opbouw(
    dl: &mut DrawList,
    vlak: Rect,
    fig: &CltOpbouwFiguur,
    stijl: &Houtstijl,
) {
    let h_tot: f64 = fig.lagen.iter().map(|l| l.dikte_mm).sum();
    if !(h_tot > 0.0) || fig.lagen.is_empty() {
        return;
    }
    let (kader_w, kader_h) = clt_kader(fig);
    let k = Kader::nieuw(vlak, kader_w, kader_h);
    let kl = &stijl.kleuren;
    let font = stijl.font.as_str();

    // Ontwerpeenheden per mm hoogte: de plaat vult altijd de tekenhoogte.
    let s = DRAW_H / h_tot as f32;
    let y_van_z = |z: f64| Y0 + z as f32 * s;
    let y_na = fig.z0_mm.map(y_van_z);

    // Laaggrenzen.
    let mut z = 0.0f64;
    let grenzen: Vec<(f64, f64)> = fig
        .lagen
        .iter()
        .map(|l| {
            let boven = z;
            z += l.dikte_mm;
            (boven, z)
        })
        .collect();

    // ── Paneel 1: de doorsnede ───────────────────────────────────────────
    dl.set_font(font, k.l(7.5));
    dl.set_fill_color(kl.tekst);
    dl.draw_text_center(
        k.x(XA + WA / 2.0),
        k.y(Y0 - 8.0),
        &format!("b = {} (strook, breedte niet op schaal)", maat(fig.breedte_mm)),
    );

    for (i, l) in fig.lagen.iter().enumerate() {
        let y = y_van_z(grenzen[i].0);
        let h = l.dikte_mm as f32 * s;
        // Vlak.
        dl.set_fill_color(kl.hout_vlak);
        dl.draw_rect(k.x(XA), k.y(y), k.l(WA), k.l(h), true, false);
        // Arcering ÓP het vlak.
        dl.set_stroke_color(kl.arcering);
        dl.set_line_width(k.l(0.5));
        match l.richting {
            CltLayerOrientation::Longitudinal => {
                arcering_diagonaal(dl, &k, XA, y, XA + WA, y + h)
            }
            CltLayerOrientation::Transverse => {
                arcering_horizontaal(dl, &k, XA, y, XA + WA, y + h)
            }
        }
        // Contour.
        dl.set_stroke_color(if l.maatgevend {
            kl.contour_maatgevend
        } else {
            kl.contour
        });
        dl.set_line_width(k.l(if l.maatgevend { 1.5 } else { 0.7 }));
        dl.draw_rect(k.x(XA), k.y(y), k.l(WA), k.l(h), false, true);

        // Laaglabel rechts van de doorsnede.
        let mut label = format!("{} mm", maat(l.dikte_mm));
        if let Some(klasse) = &l.klasse {
            label.push_str(" · ");
            label.push_str(klasse);
        }
        // "maatgevend" op een TWEEDE regel, en niet achter het label aan zoals
        // op het scherm. De labelkolom is 70 ontwerpeenheden breed; "40 mm ·
        // C24" plus de verwijzing is er ruim twintig te lang, en op papier
        // wordt die overloop dan door het σ-paneel overgetekend — op het blad
        // stond letterlijk "maatgeven". Twee regels passen wél, zolang de laag
        // hoog genoeg is; is zij dat niet, dan blijft de zware contour over,
        // en die staat in de legenda uitgelegd.
        let twee_regels = l.maatgevend && h >= 16.0;
        dl.set_font(font, k.l(6.8));
        dl.set_fill_color(kl.tekst);
        let y_label = if twee_regels { y + h / 2.0 - 1.0 } else { y + h / 2.0 + 2.4 };
        dl.draw_text(k.x(XLAB), k.y(y_label), &label);
        if twee_regels {
            dl.set_fill_color(kl.tekst_maatgevend);
            // Een linkerpijl en niet het driehoekje "◂" van het scherm: de
            // meegeleverde Liberation Sans heeft geen glief voor U+25C2, en
            // een teken zonder glief verdwijnt zonder melding. Dezelfde soort
            // vervanging als "10^-3" voor "10⁻³" bij de betonfiguren.
            dl.draw_text(k.x(XLAB), k.y(y_label + 7.5), "\u{2190} maatgevend");
        }
    }

    // Zwaartelijn (E-gewogen): streep-punt-lijn, iets buiten de contour.
    if let (Some(yn), Some(z0)) = (y_na, fig.z0_mm) {
        dl.set_stroke_color(kl.maatlijn);
        dl.set_line_width(k.l(0.7));
        streep_punt_lijn(dl, k.x(XA - 6.0), k.y(yn), k.x(XA + WA + 4.0), k.y(yn), k.s);
        // Het label staat ín de plaat tegen de lijn aan, met een uitsparing in
        // de houtkleur: links van de plaat zou het over de gedraaide h-maat
        // heen vallen zodra z₀ op halve hoogte ligt.
        let y_label = if yn < Y0 + 9.0 { yn + 7.0 } else { yn - 2.6 };
        tekst_met_uitsparing(
            dl,
            font,
            k.x(XA + 3.0),
            k.y(y_label),
            k.l(6.5),
            &format!("z0 = {}", maat(z0)),
            kl.contour,
            kl.hout_vlak,
            false,
        );
    }

    // Maatlijn h, links van de plaat.
    let x_maat_h = XA - 20.0;
    dl.set_stroke_color(kl.maatlijn);
    dl.set_line_width(k.l(0.7));
    dl.draw_line(k.x(x_maat_h), k.y(Y0), k.x(x_maat_h), k.y(Y0 + DRAW_H));
    dl.draw_line(
        k.x(x_maat_h - TICK),
        k.y(Y0),
        k.x(x_maat_h + TICK),
        k.y(Y0),
    );
    dl.draw_line(
        k.x(x_maat_h - TICK),
        k.y(Y0 + DRAW_H),
        k.x(x_maat_h + TICK),
        k.y(Y0 + DRAW_H),
    );
    dl.set_fill_color(kl.maatlijn);
    pijl(dl, k.x(x_maat_h), k.y(Y0), 90.0, k.l(6.0));
    pijl(dl, k.x(x_maat_h), k.y(Y0 + DRAW_H), 270.0, k.l(6.0));
    // Op het scherm staat deze maat gedraaid langs de maatlijn; de tekenmotor
    // kent geen gedraaide tekst, dus hij staat horizontaal ÓP de lijn met een
    // uitsparing eronder — dezelfde keuze als bij de betondoorsnede.
    tekst_met_uitsparing(
        dl,
        font,
        k.x(x_maat_h),
        k.y(Y0 + DRAW_H / 2.0 + 2.5),
        k.l(7.5),
        &format!("h = {}", maat(h_tot)),
        kl.tekst,
        Color::WHITE,
        true,
    );

    // Legenda onder de doorsnede.
    // De uitleg van de zware contour krijgt ALTIJD een eigen regel zodra er een
    // maatgevende laag is. Achter "dwarslaag (rolschuiving)" aangeplakt loopt
    // hij in het brede kader tot onder het σ-paneel door, en botst hij daar op
    // de regel "bij x = … m" die zegt bij welk punt dat paneel hoort.
    let gov_op_eigen_regel = fig.lagen.iter().any(|l| l.maatgevend);
    let ly = Y0 + DRAW_H + 8.0;
    let mut legenda = |dy: f32, diagonaal: bool, tekst: &str| {
        dl.set_fill_color(kl.hout_vlak);
        dl.draw_rect(k.x(XA), k.y(ly + dy), k.l(10.0), k.l(6.0), true, false);
        dl.set_stroke_color(kl.arcering);
        dl.set_line_width(k.l(0.5));
        if diagonaal {
            arcering_diagonaal(dl, &k, XA, ly + dy, XA + 10.0, ly + dy + 6.0);
        } else {
            arcering_horizontaal(dl, &k, XA, ly + dy, XA + 10.0, ly + dy + 6.0);
        }
        dl.set_stroke_color(kl.contour);
        dl.draw_rect(k.x(XA), k.y(ly + dy), k.l(10.0), k.l(6.0), false, true);
        dl.set_font(font, k.l(6.5));
        dl.set_fill_color(kl.tekst);
        dl.draw_text(k.x(XA + 13.0), k.y(ly + dy + 5.0), tekst);
    };
    legenda(0.0, true, "lengtelaag (vezels in spanrichting)");
    legenda(10.0, false, "dwarslaag (rolschuiving)");
    if gov_op_eigen_regel {
        dl.set_font(font, k.l(6.5));
        dl.set_fill_color(kl.tekst);
        dl.draw_text(
            k.x(XA),
            k.y(ly + 25.0),
            "zware contour = maatgevende laag",
        );
    }

    // ── Paneel 2: buigspanning ───────────────────────────────────────────
    if let Some(sigma) = &fig.sigma {
        if let Some(yn) = y_na {
            dl.set_stroke_color(kl.maatlijn);
            dl.set_line_width(k.l(0.5));
            streep_punt_lijn(dl, k.x(XB), k.y(yn), k.x(XB + WB), k.y(yn), k.s);
        }
        let schaal = (WB / 2.0 - 6.0) / max_abs(sigma) as f32;
        teken_spanningspaneel(dl, &k, font, kl, sigma, XB + WB / 2.0, schaal, s, kl.sigma_vlak);
    }

    // ── Paneel 3: schuifspanning ─────────────────────────────────────────
    if let Some(tau) = &fig.tau {
        if let Some(yn) = y_na {
            dl.set_stroke_color(kl.maatlijn);
            dl.set_line_width(k.l(0.5));
            streep_punt_lijn(dl, k.x(XC), k.y(yn), k.x(XC + WC), k.y(yn), k.s);
        }
        let schaal = (WC - 8.0) / max_abs(tau) as f32;
        teken_spanningspaneel(dl, &k, font, kl, tau, XC, schaal, s, kl.tau_vlak);
    }
}

/// De grootste absolute waarde in een verloop; nooit nul, zodat de schaal
/// eindig blijft. Spiegel van `maxAbs` in de TSX.
fn max_abs(v: &Verloop) -> f64 {
    v.segmenten
        .iter()
        .flatten()
        .map(|(_, w)| w.abs())
        .fold(1e-9, f64::max)
}

/// Eén spanningspaneel: een verticale as, de segmenten als gevulde vlakken
/// tussen as en lijn, labels bij de uiterste waarden, en het aslabel eronder.
#[allow(clippy::too_many_arguments)]
fn teken_spanningspaneel(
    dl: &mut DrawList,
    k: &Kader,
    font: &str,
    kl: &HoutKleuren,
    verloop: &Verloop,
    x_as: f32,
    schaal: f32,
    s: f32,
    vulling: Color,
) {
    let x = |v: f64| x_as + v as f32 * schaal;
    let y = |z: f64| Y0 + z as f32 * s;

    dl.set_stroke_color(kl.maatlijn);
    dl.set_line_width(k.l(0.6));
    dl.draw_line(
        k.x(x_as),
        k.y(Y0 - 4.0),
        k.x(x_as),
        k.y(Y0 + DRAW_H + 4.0),
    );

    // De vulling is op het scherm doorzichtig (0,8); op wit papier is
    // voormengen exact hetzelfde beeld.
    let vlakkleur = meng_met_wit(vulling, 0.8);
    for seg in &verloop.segmenten {
        if seg.is_empty() {
            continue;
        }
        let mut vlak: Vec<(Pt, Pt)> = Vec::with_capacity(seg.len() + 2);
        vlak.push((k.x(x_as), k.y(y(seg[0].0))));
        for (z, v) in seg {
            vlak.push((k.x(x(*v)), k.y(y(*z))));
        }
        vlak.push((k.x(x_as), k.y(y(seg[seg.len() - 1].0))));
        dl.set_fill_color(vlakkleur);
        dl.draw_polygon(vlak, true, false);

        // De lijn zelf als open polylijn: de tekenmotor kent alleen
        // veelhoeken, dus per paar punten een lijnstuk.
        dl.set_stroke_color(kl.contour);
        dl.set_line_width(k.l(0.9));
        for paar in seg.windows(2) {
            dl.draw_line(
                k.x(x(paar[0].1)),
                k.y(y(paar[0].0)),
                k.x(x(paar[1].1)),
                k.y(y(paar[1].0)),
            );
        }
    }

    // Labels bij de uiterste waarden.
    let mut max_i: Option<(usize, usize)> = None;
    let mut min_i: Option<(usize, usize)> = None;
    for (i, seg) in verloop.segmenten.iter().enumerate() {
        for (j, (_, v)) in seg.iter().enumerate() {
            let groter = max_i.is_none_or(|(a, b)| *v > verloop.segmenten[a][b].1);
            if groter {
                max_i = Some((i, j));
            }
            let kleiner = min_i.is_none_or(|(a, b)| *v < verloop.segmenten[a][b].1);
            if kleiner {
                min_i = Some((i, j));
            }
        }
    }
    dl.set_font(font, k.l(6.5));
    dl.set_fill_color(kl.tekst);
    let mut label = |i: usize, j: usize| {
        let (z, v) = verloop.segmenten[i][j];
        if v.abs() <= 1e-9 {
            return;
        }
        let px = x(v) + if v >= 0.0 { 2.0 } else { -2.0 };
        let py = y(z) + 2.5;
        let tekst = nl_kort(v, spanning_decimalen(v));
        if v >= 0.0 {
            dl.draw_text(k.x(px), k.y(py), &tekst);
        } else {
            dl.draw_text_right(k.x(px), k.y(py), &tekst);
        }
    };
    if let Some((i, j)) = max_i {
        label(i, j);
    }
    if let Some((i, j)) = min_i {
        if Some((i, j)) != max_i {
            label(i, j);
        }
    }

    dl.set_font(font, k.l(7.0));
    dl.set_fill_color(kl.tekst);
    dl.draw_text_center(
        k.x(x_as),
        k.y(Y0 + DRAW_H + 12.0),
        &format!("{} ({})", verloop.label, verloop.eenheid),
    );
    if let Some(noot) = &verloop.noot {
        dl.set_font(font, k.l(5.8));
        dl.set_fill_color(kl.maatlijn);
        dl.draw_text_center(k.x(x_as), k.y(Y0 + DRAW_H + 20.0), noot);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vijflaags() -> CltMechanics {
        CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0, 20.0, 40.0], "C24")
            .mechanics()
            .expect("de handberekening moet rekenbaar zijn")
    }

    /// Symmetrische opbouw: z₀ = 80 ligt midden in laag 3 (60..100) en valt
    /// daar samen met het middelste gelijkmatige monsterpunt. De bemonstering
    /// mag hem dan niet twee keer opnemen.
    #[test]
    fn de_zwaartelijn_komt_maar_een_keer_in_de_bemonstering() {
        let mech = vijflaags();
        let z = tau_monster_z(&mech);
        let op_z0 = z.iter().filter(|v| (**v - 80.0).abs() < 1e-9).count();
        assert_eq!(op_z0, 1, "z₀ staat {op_z0} keer in {z:?}");
    }

    /// ASYMMETRISCH: hier ligt z₀ NIET op een gelijkmatig monsterpunt, en juist
    /// daar ging de getekende piek de mist in.
    #[test]
    fn de_getekende_piek_haalt_de_tau_van_de_kern_bij_een_asymmetrische_opbouw() {
        let layup = CltLayup::new(
            1000.0,
            vec![
                CltLayer { thickness_mm: 40.0, orientation: CltLayerOrientation::Longitudinal, strength_class: "C24".into() },
                CltLayer { thickness_mm: 20.0, orientation: CltLayerOrientation::Transverse, strength_class: "C24".into() },
                CltLayer { thickness_mm: 30.0, orientation: CltLayerOrientation::Longitudinal, strength_class: "C24".into() },
                CltLayer { thickness_mm: 20.0, orientation: CltLayerOrientation::Transverse, strength_class: "C24".into() },
                CltLayer { thickness_mm: 60.0, orientation: CltLayerOrientation::Longitudinal, strength_class: "C24".into() },
            ],
        );
        let mech = layup.mechanics().expect("rekenbaar");
        let v_kn = 10.0;
        // De hoogste τ die de KERN per laag rapporteert.
        let kern = (0..mech.layers.len())
            .map(|i| mech.layer_max_shear(i, v_kn, 1.0).tau_mpa)
            .fold(0.0_f64, f64::max);
        let getekend = tau_verloop(&mech, v_kn, 1.0)
            .into_iter()
            .map(|(_, t)| t)
            .fold(0.0_f64, f64::max);
        assert!(
            (getekend - kern).abs() < 1e-12,
            "getekende piek {getekend} tegen τ_d van de kern {kern}"
        );
        // En de zwaartelijn ligt hier ECHT niet op een gelijkmatig monsterpunt,
        // anders bewijst de test hierboven niets.
        let laag = mech
            .layers
            .iter()
            .find(|l| l.e_mpa > 0.0 && mech.z0_mm > l.z_top_mm && mech.z0_mm < l.z_bot_mm)
            .expect("z₀ moet in een lengtelaag liggen");
        let t = laag.thickness_mm();
        let rest = ((mech.z0_mm - laag.z_top_mm) / (t / 8.0)).fract();
        assert!(
            rest > 1e-6 && rest < 1.0 - 1e-6,
            "z₀ valt toevallig wél op een gelijkmatig monsterpunt"
        );
    }

    #[test]
    fn de_opbouw_komt_ongeschonden_terug_uit_het_resultaat() {
        let mech = vijflaags();
        let res = CltLayupResult {
            width_mm: mech.width_mm,
            height_mm: mech.height_mm,
            z0_mm: mech.z0_mm,
            ei_ef_knm2: mech.ei_ef_knm2(),
            ea_ef_kn: mech.ea_ef_kn(),
            i_ef_net_mm4: mech.i_ef_net_mm4(),
            slenderness: 31.25,
            layers: mech
                .layers
                .iter()
                .map(|l| timber_check::clt::CltLayerResult {
                    index: (l.index + 1) as u32,
                    thickness_mm: l.thickness_mm(),
                    orientation: l.orientation,
                    strength_class: l.class.name.to_string(),
                    z_top_mm: l.z_top_mm,
                    z_bot_mm: l.z_bot_mm,
                    e_mpa: l.e_mpa,
                    sigma_top_mpa: 0.0,
                    sigma_bot_mpa: 0.0,
                    tau_max_mpa: 0.0,
                    f_md_mpa: 0.0,
                    f_vd_mpa: 0.0,
                    uc_bending: None,
                    uc_shear: None,
                    governing: false,
                    check_ids: vec![],
                })
                .collect(),
            governing_layer: None,
        };
        let terug = mechanica_uit_resultaat(&res).expect("moet terug te bouwen zijn");
        assert!((terug.z0_mm - mech.z0_mm).abs() < 1e-12);
        assert!((terug.ei_ef_nmm2 - mech.ei_ef_nmm2).abs() < 1e-3);
        assert_eq!(terug.layers.len(), mech.layers.len());
    }

    #[test]
    fn nl_kort_laat_nullen_aan_het_eind_weg() {
        assert_eq!(nl_kort(5.2632, 2), "5,26");
        assert_eq!(nl_kort(2.0, 2), "2");
        assert_eq!(nl_kort(-5.2632, 2), "-5,26");
        assert_eq!(nl_kort(-0.001, 2), "0");
    }

    /// Een schuifspanning van 0,099 mag in de figuur niet als "0,1" komen te
    /// staan terwijl de tabel ernaast 0,099 zegt.
    #[test]
    fn een_kleine_spanning_houdt_drie_decimalen() {
        assert_eq!(nl_kort(0.0987, spanning_decimalen(0.0987)), "0,099");
        assert_eq!(nl_kort(-0.0855, spanning_decimalen(-0.0855)), "-0,086");
        assert_eq!(nl_kort(5.2632, spanning_decimalen(5.2632)), "5,26");
    }

    /// Het smalle kader — zonder spanningspanelen — moet echt smaller zijn,
    /// anders staat de doorsnede in de profielkiezer in een strook wit.
    #[test]
    fn het_kader_krimpt_zonder_spanningspanelen() {
        let lagen = vec![CltTekenLaag {
            dikte_mm: 40.0,
            richting: CltLayerOrientation::Longitudinal,
            klasse: None,
            maatgevend: false,
        }];
        let vol = CltOpbouwFiguur {
            lagen: lagen.clone(),
            breedte_mm: 1000.0,
            z0_mm: Some(20.0),
            sigma: Some(Verloop { segmenten: vec![], label: "σ".into(), eenheid: "N/mm²".into(), noot: None }),
            tau: None,
        };
        let smal = CltOpbouwFiguur { sigma: None, ..vol.clone() };
        assert!(clt_kader(&smal).0 < clt_kader(&vol).0);
    }
}
