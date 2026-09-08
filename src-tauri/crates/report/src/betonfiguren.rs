//! Betonfiguren — de vier figuren van de betontoetsing, native op een
//! [`DrawList`] getekend zodat ze in de PDF vectoren zijn en geen plaatje.
//!
//! # Waarom deze module bestaat
//!
//! De PDF moet dezelfde figuren dragen als het rapport in de app. Dat kan op
//! twee manieren: de SVG van de frontend als afbeelding invoegen, of hier
//! natekenen. Er is gekozen voor natekenen — scherpe lijnen, selecteerbare
//! tekst, geen rasterstap.
//!
//! # DE VALKUIL, EN DE BEWAKING ERTEGEN
//!
//! Natekenen levert een **tweede** tekening van hetzelfde ding op, en twee
//! tekeningen van hetzelfde ding lopen uit elkaar. Daarom is de meetkunde hier
//! niet opnieuw geparametriseerd: [`omtrek_punten`] en [`staaf_posities`]
//! leiden hun punten af uit **dezelfde brongegevens** als het scherm — de
//! banden van [`ConcreteSection`] en de maten van [`ReinforcementCage`] — en
//! zijn regel voor regel de spiegel van de frontend-functies.
//!
//! De andere implementatie staat in
//! `design-mockup/src/components/beton/wapeningskorf.ts`:
//! `omtrekPunten`, `staafPosities`, `breedteOpHoogteMm` en `hartXMm`.
//! De tekencomponenten die daarop leunen zijn `DoorsnedeTekening.tsx`,
//! `MNKappaGrafiek.tsx`, `InteractieGrafiek.tsx` en `EiVerloopGrafiek.tsx`.
//!
//! **De bewaking loopt over één GEDEELD bestand**:
//! `tests/golden/betonfiguren-referentie.json` draagt per doorsnede de exacte
//! omtrekpunten en staafharten, en beide kanten lezen daaruit — hier
//! `tests/betonfiguren_referentie.rs`, daar
//! `design-mockup/test-betonfiguren-referentie.mjs`. Geen van beide tests
//! draagt eigen getallen; verschuift één implementatie een punt, dan valt die
//! kant om. Hoe je de referentie bewust bijwerkt, staat in het bestand zelf.
//!
//! Waarom niet aan elke kant een eigen lijst verwachte waarden: dat wás de
//! opzet, en die bewaakte niets. Een verschoven staafhart bleef aan beide
//! kanten groen zolang het getal in beide suites meeverschoof — en de TS-kant
//! toetste de harten alleen op een grens, waar elke verschuiving binnen die
//! grens ongemerkt doorheen glipt.
//!
//! Daarnaast blijft `tests/betonfiguren_meetkunde.rs` staan: die pint dezelfde
//! meetkunde vast mét de handafleiding erbij, en legt dus uit wáárom een punt
//! ligt waar hij ligt.
//!
//! # Wat er nog meer uit de frontend is overgenomen
//!
//! * **Rapportkleuren, geen themakleuren.** [`RAPPORT_KLEUREN`] draagt
//!   letterlijk de waarden van `RAPPORT_KLEUREN` in
//!   `design-mockup/src/components/beton/tekenkleuren.ts` — vaste
//!   papierkleuren, want een PDF heeft geen licht/donker-thema.
//! * **Gescheurd donkerder dan ongescheurd**, zodat het EI-verloop ook in
//!   grijstinten leesbaar is.
//! * **De doorsnede op ware verhouding.** Het tekenvlak volgt h/b van de
//!   doorsnede zelf ([`doorsnede_kader`], spiegel van `tekenvlakHoogte`);
//!   een T van 2780 × 450 wordt zo geen streep in een vierkant kader.
//! * **Assen met leesbare stappen** via [`ticks`] en [`mooie_stap`] — dezelfde
//!   regel als `ticks()` / `mooieStap()` in `MNKappaGrafiek.tsx`, zodat de
//!   schaalverdeling in de PDF en op het scherm gelijk oogt.
//!
//! # Wat de tekenmotor niet kan, en wat daarvoor in de plaats komt
//!
//! [`DrawOp`](openaec_layout::draw::DrawOp) kent geen streeplijn, geen
//! doorzichtigheid en geen gedraaide tekst. Daarom:
//!
//! * streeplijnen worden als losse stukjes getekend ([`streeplijn`]);
//! * doorzichtige vullingen worden **vooraf met wit gemengd**
//!   ([`meng_met_wit`]) — op papier is dat exact hetzelfde beeld, en het
//!   getal wordt gerekend en niet aangenomen;
//! * de gedraaide astitels van het scherm staan hier horizontaal boven de
//!   verticale as; de maatteksten h en d bij de doorsnede staan horizontaal
//!   op de maatlijn, met een uitsparing in de lijn eronder (de gangbare
//!   tekenconventie).
//!
//! Eén tekenverschil is niet op te lossen: de meegeleverde Liberation Sans
//! heeft geen glief voor het superschrift-minteken (U+207B). Waar het scherm
//! `10⁻³` schrijft, staat hier daarom `10^-3`. De overige bijzondere tekens —
//! κ, ·, ², Ø, — en − — zitten wél in het lettertype en worden gewoon
//! gebruikt.
//!
//! # Maatvoering van de figuren
//!
//! Elke figuur wordt in de **ontwerpeenheden van de schermfiguur** opgebouwd
//! (de `viewBox` van de SVG) en daarna als geheel in het opgegeven rechthoekje
//! geschaald, met behoud van de verhouding en gecentreerd. Daardoor zijn de
//! onderlinge verhoudingen — lijndikten, tekstgroottes, marges — gelijk aan
//! die op het scherm. De ontwerpmaten staan in [`KADER_MN_KAPPA`],
//! [`KADER_INTERACTIE`], [`KADER_EI`] en [`doorsnede_kader`]; wie een rechthoek
//! van ongeveer die verhouding meegeeft, krijgt de figuur op schaal 1.

// `!(x > 0.0)` is hier met opzet geen `x <= 0.0`: de eerste vorm vangt óók NaN
// af en de tweede niet, en een NaN — uit een segment dat niet convergeerde,
// bijvoorbeeld — mag niet als "wel positief" door de poort komen. Dezelfde
// schrijfwijze als in de rekenkern en in de frontend
// (`if (!(bMm > 0) || !(hMm > 0)) return null`).
#![allow(clippy::neg_cmp_op_on_partial_ord)]
// De bandenlus in `omtrek_punten` leest naast band `i` ook de band eráchter
// (`rand(i + 1)`); met een gewone iterator is dat niet uit te drukken zonder
// het weer op een index terug te brengen.
#![allow(clippy::needless_range_loop)]

use openaec_layout::{
    draw::DrawList,
    types::{Color, Pt, Rect},
};

use concrete_check::segments::SegmentStiffnessResponse;
use nen_en_1992_1_1::mnkappa::{FailureMode, InteractionPoint, MnKappaDiagram};
use nen_en_1992_1_1::section::{ConcreteSection, ConcreteShape, ReinforcementCage};

// ── Kleuren ───────────────────────────────────────────────────────────────────

/// Het palet van de betonfiguren op papier.
///
/// Spiegel van `BetonTekenKleuren` in
/// `design-mockup/src/components/beton/tekenkleuren.ts`; de veldnamen zijn
/// dezelfde, zodat een wijziging daar hier één op één te volgen is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BetonKleuren {
    /// Vlak van het beton in de doorsnede.
    pub beton_vlak: Color,
    /// Omtrek van de doorsnede en de hoofdwapening — alles wat ÓP `beton_vlak` ligt.
    pub beton_lijn: Color,
    /// Lijn op de achtergrond van het figuur (referentielijn).
    pub lijn: Color,
    /// Beugel.
    pub beugel: Color,
    /// Gewone tekst.
    pub tekst: Color,
    /// Rijlabels ("3Ø16") en puntlabels bij een grafiek.
    pub tekst_zwak: Color,
    /// Maatteksten en aslabels.
    pub tekst_maat: Color,
    /// Maatlijnen, pijlen en hulplijnen.
    pub maatlijn: Color,
    /// Rasterlijnen en assen.
    pub raster: Color,
    /// De reeks zelf: de M-κ-kromme, de interactie-omhullende, het EI-verloop.
    pub reeks: Color,
    /// Vlak áchter een markering (open punt, uitsparing in een maatlijn).
    pub vlak: Color,
    /// Het rekenpunt en de referentielijnen die erbij horen.
    pub rekenpunt: Color,
}

/// Vaste documentkleuren — letterlijk `RAPPORT_KLEUREN` uit `tekenkleuren.ts`.
///
/// Niet de themakleuren: het rapport is papier en volgt het app-thema niet.
pub const RAPPORT_KLEUREN: BetonKleuren = BetonKleuren {
    beton_vlak: Color::rgb(0xdf, 0xe4, 0xea),
    beton_lijn: Color::rgb(0x39, 0x42, 0x4e),
    lijn: Color::rgb(0x39, 0x42, 0x4e),
    beugel: Color::rgb(0x5b, 0x64, 0x70),
    tekst: Color::rgb(0x33, 0x33, 0x33),
    tekst_zwak: Color::rgb(0x55, 0x55, 0x55),
    tekst_maat: Color::rgb(0x55, 0x55, 0x55),
    maatlijn: Color::rgb(0x5b, 0x64, 0x70),
    raster: Color::rgb(0xc8, 0xcc, 0xd2),
    // Donkerder dan de scherm-amber (#D97706): op wit papier en in grijstinten
    // blijft die te licht tegenover de zwarte tekst.
    reeks: Color::rgb(0xb4, 0x53, 0x09),
    vlak: Color::rgb(0xff, 0xff, 0xff),
    rekenpunt: Color::rgb(0xb9, 0x1c, 0x1c),
};

/// Opmaak van een figuur: het palet en het lettertype.
#[derive(Clone, Debug)]
pub struct Figuurstijl {
    pub kleuren: BetonKleuren,
    /// Naam waaronder het lettertype in de `FontRegistry` staat.
    pub font: String,
}

impl Default for Figuurstijl {
    /// De rapportstijl: papierkleuren en de Liberation Sans die het rapport
    /// zelf registreert.
    fn default() -> Self {
        Self { kleuren: RAPPORT_KLEUREN, font: "LiberationSans-Regular".to_string() }
    }
}

/// `kleur` met dekking `dekking` (0..1) over wit, als ondoorzichtige kleur.
///
/// De tekenmotor kent geen doorzichtigheid: `Color::to_pdf_rgb` laat het
/// alfakanaal vallen. Op wit papier is voormengen exact hetzelfde beeld als
/// overtekenen met doorzichtigheid, dus dat is wat hier gebeurt — de waarde
/// wordt gerekend, niet ingetypt.
pub fn meng_met_wit(kleur: Color, dekking: f32) -> Color {
    let a = dekking.clamp(0.0, 1.0);
    let meng = |c: u8| (c as f32 * a + 255.0 * (1.0 - a)).round().clamp(0.0, 255.0) as u8;
    Color::rgb(meng(kleur.r), meng(kleur.g), meng(kleur.b))
}

// ── De meetkunde van de doorsnede — de bewaakte kant ──────────────────────────

/// De breedte die op hoogte `z_mm` werkelijk aanwezig is, mm.
///
/// Letterlijk [`ConcreteSection::width_at_mm`] van de kern; de frontend heeft
/// hiervan zijn eigen spiegel in `breedteOpHoogteMm`. Deze functie bestaat
/// alleen zodat de tekening en de bewakingstest langs dezelfde naam gaan.
pub fn breedte_op_hoogte_mm(section: &ConcreteSection, z_mm: f64) -> f64 {
    section.width_at_mm(z_mm)
}

/// Waar het midden van een rij op hoogte `z_mm` ligt, in x vanaf de linkerrand
/// van de omhullende breedte b.
///
/// Spiegel van `hartXMm`. Bij een L staat het lijf tegen de LINKERRAND — dat
/// is voor de berekening geen verschil (b(z) is identiek aan die van een T),
/// maar voor de tekening wél: wie een L als een T tekent, laat de constructeur
/// iets anders zien dan hij heeft ingevoerd.
pub fn hart_x_mm(section: &ConcreteSection, z_mm: f64) -> f64 {
    let breedte = breedte_op_hoogte_mm(section, z_mm);
    if section.shape == ConcreteShape::Ell && breedte < section.b_mm {
        breedte / 2.0
    } else {
        section.b_mm / 2.0
    }
}

/// De omtrek van de doorsnede als punten (x vanaf de linkerrand van de
/// omhullende breedte b, z vanaf de onderrand), tegen de klok in.
///
/// **Afgeleid uit de banden, niet uit nieuwe parameters.** De banden van
/// [`ConcreteSection`] dragen de vorm al volledig — ook de omgekeerde T, want
/// die is in de kern een gespiegelde bandenreeks
/// ([`ConcreteSection::mirrored`]). Er wordt hier dus niet op `Rectangle` /
/// `Tee` / `Ell` vertakt om de punten te vinden; het enige waarvoor het etiket
/// wordt geraadpleegd, is de zijde waar de flens van een L zit (via
/// [`hart_x_mm`]).
///
/// Spiegel van `omtrekPunten`; de puntvolgorde is identiek, inclusief het
/// wegfilteren van opeenvolgende dubbele punten dat bij een L ontstaat.
pub fn omtrek_punten(section: &ConcreteSection) -> Vec<(f64, f64)> {
    let banden = section.bands();
    if banden.is_empty() {
        return Vec::new();
    }
    // Linker- en rechterrand van elke band, uit het hart van díé band.
    let rand = |i: usize| -> (f64, f64) {
        let b = &banden[i];
        let hart = hart_x_mm(section, 0.5 * (b.z0_mm + b.z1_mm));
        (hart - b.b_mm / 2.0, hart + b.b_mm / 2.0)
    };

    let n = banden.len();
    let mut punten: Vec<(f64, f64)> = Vec::with_capacity(2 * n + 2);

    // Onderrand, van links naar rechts.
    let (l0, r0) = rand(0);
    punten.push((l0, banden[0].z0_mm));
    punten.push((r0, banden[0].z0_mm));

    // Rechterzijde omhoog: per band tot de bovenkant, en dan opzij naar de
    // rechterrand van de band erboven.
    for i in 0..n {
        let (_, r) = rand(i);
        punten.push((r, banden[i].z1_mm));
        if i + 1 < n {
            let (_, r_boven) = rand(i + 1);
            punten.push((r_boven, banden[i].z1_mm));
        }
    }

    // Bovenrand naar links, en dan de linkerzijde omlaag — spiegelbeeld.
    let (l_top, _) = rand(n - 1);
    punten.push((l_top, banden[n - 1].z1_mm));
    for i in (0..n - 1).rev() {
        let (l_boven, _) = rand(i + 1);
        let (l, _) = rand(i);
        punten.push((l_boven, banden[i].z1_mm));
        punten.push((l, banden[i].z1_mm));
    }

    // Bij een L staat het lijf tegen de linkerrand en vallen de laatste twee
    // hoekpunten samen. De vorm klopt ook mét dat dubbele punt, maar een
    // omtrek met een zijde van lengte nul is geen omtrek die je wilt
    // doorgeven; hij komt terug zodra er iets anders mee gebeurt dan tekenen.
    let mut uit: Vec<(f64, f64)> = Vec::with_capacity(punten.len());
    for (i, p) in punten.iter().enumerate() {
        if i == 0 || *p != punten[i - 1] {
            uit.push(*p);
        }
    }
    uit
}

/// Aan welke zijde van de doorsnede een staafrij ligt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rij {
    Onder,
    Boven,
}

/// Eén staaf in de tekening: het hart (mm vanaf de linkerrand resp. de
/// onderrand) en de diameter.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StaafPositie {
    pub x_mm: f64,
    pub z_mm: f64,
    pub diameter_mm: f64,
    pub rij: Rij,
}

/// Staafposities in de doorsnede: elke rij gelijkmatig verdeeld tussen de
/// binnenhoeken van de beugel; bij één staaf staat die in het midden.
///
/// De rij wordt verdeeld over de breedte die op **zijn eigen hoogte** aanwezig
/// is, niet over de grootste breedte van de doorsnede. Bij een T-lijf zou dat
/// laatste staven buiten het beton tekenen; dezelfde regel als
/// [`ReinforcementCage::validate`], die ook naar `width_at_mm` kijkt.
///
/// De ligging in de hoogte volgt [`ReinforcementCage::axis_offset_mm`]:
/// `c_nom + Ø_beugel + Ø_hoofd / 2`. Diezelfde maat is ook de inzet vanaf de
/// zijkant. Spiegel van `staafPosities`; de volgorde is onder-eerst.
pub fn staaf_posities(korf: &ReinforcementCage, section: &ConcreteSection) -> Vec<StaafPositie> {
    let mut uit = Vec::new();
    for (rij, kant) in [(&korf.bottom, Rij::Onder), (&korf.top, Rij::Boven)] {
        if rij.is_empty() {
            continue;
        }
        let as_afstand = korf.axis_offset_mm(rij);
        let z = match kant {
            Rij::Onder => as_afstand,
            Rij::Boven => section.h_mm - as_afstand,
        };
        let breedte = breedte_op_hoogte_mm(section, z);
        let hart = hart_x_mm(section, z);
        let x_eerste = hart - breedte / 2.0 + as_afstand;
        let x_laatste = hart + breedte / 2.0 - as_afstand;
        for i in 0..rij.count {
            let x = if rij.count == 1 {
                hart
            } else {
                x_eerste + (x_laatste - x_eerste) * i as f64 / (rij.count - 1) as f64
            };
            uit.push(StaafPositie { x_mm: x, z_mm: z, diameter_mm: rij.diameter_mm, rij: kant });
        }
    }
    uit
}

// ── Asverdeling — dezelfde regel als op het scherm ────────────────────────────

/// Ronde asstap: 1, 2 of 5 × 10ⁿ zodat er ongeveer `doel` stappen komen.
///
/// Spiegel van `mooieStap` in `MNKappaGrafiek.tsx`.
pub fn mooie_stap(bereik: f64, doel: f64) -> f64 {
    if !(bereik > 0.0) {
        return 1.0;
    }
    let ruw = bereik / doel;
    let mag = 10f64.powf(ruw.log10().floor());
    let r = ruw / mag;
    let stap = if r < 1.5 {
        1.0
    } else if r < 3.0 {
        2.0
    } else if r < 7.0 {
        5.0
    } else {
        10.0
    };
    stap * mag
}

/// Asverdeling van 0 tot minstens `max`, in ronde stappen.
///
/// Spiegel van `ticks` in `MNKappaGrafiek.tsx`, dat daar met opzet
/// geëxporteerd is zodat het M-κ-diagram en het EI-verloop dezelfde regel
/// volgen. Hier geldt hetzelfde, plus: de PDF en het scherm verdelen gelijk.
pub fn ticks(max: f64) -> Vec<f64> {
    let stap = mooie_stap(max, 5.0);
    let n = (max / stap - 1e-9).ceil().max(0.0) as i64;
    (0..=n).map(|i| i as f64 * stap).collect()
}

/// Asindeling die het hele bereik omvat en nul altijd meeneemt — voor het
/// interactiediagram, dat negatieve momenten en druk moet tonen.
///
/// Spiegel van `as` in `InteractieGrafiek.tsx`.
pub fn as_indeling(min: f64, max: f64, doel: f64) -> (f64, f64, Vec<f64>) {
    let lo = min.min(0.0);
    let hi = max.max(0.0);
    let bereik = hi - lo;
    let stap = mooie_stap(if bereik > 0.0 { bereik } else { 1.0 }, doel);
    let i0 = (lo / stap - 1e-9).floor() as i64;
    let i1 = (hi / stap + 1e-9).ceil() as i64;
    let ticks: Vec<f64> = (i0..=i1).map(|i| i as f64 * stap).collect();
    (i0 as f64 * stap, i1 as f64 * stap, ticks)
}

// ── Getallen in Nederlandse notatie ───────────────────────────────────────────

/// Getal met vast aantal decimalen, punt als duizendtalscheiding en komma als
/// decimaalteken — `toLocaleString("nl-NL")`, zoals `nl()` in de frontend.
pub fn nl(v: f64, decimalen: usize) -> String {
    let negatief = v < 0.0;
    let s = format!("{:.*}", decimalen, v.abs());
    let (geheel, breuk) = match s.split_once('.') {
        Some((g, b)) => (g.to_string(), Some(b.to_string())),
        None => (s, None),
    };
    let mut gegroepeerd = String::new();
    for (i, c) in geheel.chars().enumerate() {
        if i > 0 && (geheel.len() - i) % 3 == 0 {
            gegroepeerd.push('.');
        }
        gegroepeerd.push(c);
    }
    let mut uit = String::new();
    if negatief {
        uit.push('-');
    }
    uit.push_str(&gegroepeerd);
    if let Some(b) = breuk {
        uit.push(',');
        uit.push_str(&b);
    }
    uit
}

/// Als [`nl`], maar `−0` en `1e-15` lezen als een richting die er niet is; die
/// hoort weg. Spiegel van `nulSchoon` in `InteractieGrafiek.tsx`.
pub fn nul_schoon(v: f64, decimalen: usize) -> String {
    let f = 10f64.powi(decimalen as i32);
    let afgerond = (v * f).round() / f;
    nl(if afgerond == 0.0 { 0.0 } else { afgerond }, decimalen)
}

/// Maat in mm als tekst: geheel waar het kan, anders één decimaal met komma.
/// Spiegel van `maat()` in `wapeningskorf.ts`.
pub fn maat(v: f64) -> String {
    let afgerond = (v * 10.0).round() / 10.0;
    if (afgerond - afgerond.round()).abs() < f64::EPSILON {
        nl(afgerond, 0)
    } else {
        nl(afgerond, 1)
    }
}

// ── Kader: ontwerpeenheden → punten op de pagina ──────────────────────────────

/// Ontwerpmaat van het M-κ-diagram (de `viewBox` van `MNKappaGrafiek`).
pub const KADER_MN_KAPPA: (f32, f32) = (380.0, 250.0);
/// Ontwerpmaat van het interactiediagram (`InteractieGrafiek`).
pub const KADER_INTERACTIE: (f32, f32) = (380.0, 280.0);
/// Ontwerpmaat van het EI-verloop (`EiVerloopGrafiek`).
pub const KADER_EI: (f32, f32) = (560.0, 210.0);

/// Omrekening van ontwerpeenheden naar punten: de figuur wordt met behoud van
/// verhouding in het opgegeven rechthoekje gepast en gecentreerd.
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
    /// x in ontwerpeenheden → punt op de pagina.
    fn x(&self, u: f32) -> Pt {
        Pt(self.x0 + u * self.s)
    }
    /// y in ontwerpeenheden → punt op de pagina (y loopt naar beneden, net als
    /// in de SVG en in de tekenmotor).
    fn y(&self, v: f32) -> Pt {
        Pt(self.y0 + v * self.s)
    }
    /// Een lengte (lijndikte, straal) in ontwerpeenheden → punten.
    fn l(&self, u: f32) -> Pt {
        Pt(u * self.s)
    }
}

// ── Tekenhulpjes voor wat de motor niet kan ───────────────────────────────────

/// Een streeplijn van (x1,y1) naar (x2,y2), met streepjes van `streep` lang en
/// gaten van `gat`, alles in punten.
///
/// De tekenmotor kent geen `stroke-dasharray`; de lijn wordt daarom in stukjes
/// getekend. De lengtes zijn dezelfde als in de SVG (bijvoorbeeld "4 3"),
/// geschaald met het kader.
pub fn streeplijn(dl: &mut DrawList, x1: Pt, y1: Pt, x2: Pt, y2: Pt, streep: Pt, gat: Pt) {
    let (dx, dy) = (x2.0 - x1.0, y2.0 - y1.0);
    let lengte = (dx * dx + dy * dy).sqrt();
    let periode = streep.0 + gat.0;
    if lengte <= 0.0 || periode <= 0.0 {
        return;
    }
    let (ex, ey) = (dx / lengte, dy / lengte);
    let mut t = 0.0f32;
    while t < lengte {
        let eind = (t + streep.0).min(lengte);
        dl.draw_line(
            Pt(x1.0 + ex * t),
            Pt(y1.0 + ey * t),
            Pt(x1.0 + ex * eind),
            Pt(y1.0 + ey * eind),
        );
        t += periode;
    }
}

/// Een cirkel als veelhoek. De tekenmotor kent alleen veelhoeken; 24 zijden is
/// bij de straal van een wapeningsstaaf in een PDF niet van een cirkel te
/// onderscheiden.
fn cirkel(dl: &mut DrawList, cx: Pt, cy: Pt, r: Pt, fill: bool, stroke: bool) {
    const N: usize = 24;
    let punten: Vec<(Pt, Pt)> = (0..N)
        .map(|i| {
            let a = std::f32::consts::TAU * i as f32 / N as f32;
            (Pt(cx.0 + r.0 * a.cos()), Pt(cy.0 + r.0 * a.sin()))
        })
        .collect();
    dl.draw_polygon(punten, fill, stroke);
}

/// Een ruitje (het maatgevende punt en het rekenpunt), met `cy` op het hart.
/// Dezelfde vorm als op het scherm: in grijstinten te onderscheiden van de
/// ronde vloei- en bezwijkpunten.
fn ruit(dl: &mut DrawList, cx: Pt, cy: Pt, r: Pt) {
    dl.draw_polygon(
        vec![
            (cx, Pt(cy.0 - r.0)),
            (Pt(cx.0 + r.0), cy),
            (cx, Pt(cy.0 + r.0)),
            (Pt(cx.0 - r.0), cy),
        ],
        true,
        false,
    );
}

/// Ruwe schatting van de tekstbreedte in punten.
///
/// Alleen gebruikt om een uitsparing in een maatlijn te maken; de tekst zelf
/// wordt door de motor gemeten en geplaatst. 0,60 em is een ruime bovengrens
/// voor de gemiddelde letterbreedte van Liberation Sans bij cijfers en kleine
/// letters (de motor zelf valt bij gebrek aan metrieken terug op 0,55). Een
/// uitsparing die iets te groot is, valt niet op; een die te klein is, laat de
/// maatlijn dwars door de tekst lopen — dus ruim schatten.
fn tekstbreedte_schatting(tekst: &str, grootte: Pt) -> Pt {
    Pt(tekst.chars().count() as f32 * grootte.0 * 0.60)
}

/// Tekst gecentreerd op (`x`, `y`) met een uitsparing eronder, zodat een
/// maatlijn die eronder doorloopt wordt onderbroken.
fn tekst_met_uitsparing(
    dl: &mut DrawList,
    stijl: &Figuurstijl,
    x: Pt,
    y: Pt,
    grootte: Pt,
    tekst: &str,
) {
    let w = tekstbreedte_schatting(tekst, grootte);
    dl.set_fill_color(stijl.kleuren.vlak);
    dl.draw_rect(
        Pt(x.0 - w.0 / 2.0 - 1.0),
        Pt(y.0 - grootte.0 * 0.80),
        Pt(w.0 + 2.0),
        Pt(grootte.0 * 1.05),
        true,
        false,
    );
    dl.set_font(&stijl.font, grootte);
    dl.set_fill_color(stijl.kleuren.tekst_maat);
    dl.draw_text_center(x, y, tekst);
}

/// Pijlpunt van een maatlijn: een driehoekje op (`x`, `y`), wijzend in de
/// richting `hoek` graden (0 = naar rechts, zoals in de SVG).
fn pijl(dl: &mut DrawList, x: Pt, y: Pt, hoek: f32, lengte: Pt) {
    let a = hoek.to_radians();
    let (c, s) = (a.cos(), a.sin());
    // Dezelfde driehoek als `Pijl` in DoorsnedeTekening: "0,0 5,-1.7 5,1.7",
    // met 5 ontwerpeenheden lengte en 1,7 halve breedte.
    let punt = |px: f32, py: f32| (Pt(x.0 + px * c - py * s), Pt(y.0 + px * s + py * c));
    let l = lengte.0;
    let b = l * 1.7 / 5.0;
    dl.draw_polygon(vec![punt(0.0, 0.0), punt(l, -b), punt(l, b)], true, false);
}

// ── Figuur 1: de doorsnede met wapeningskorf ──────────────────────────────────

// De ontwerpmaten van `DoorsnedeTekening.tsx`, letterlijk overgenomen.
const D_KADER_W: f32 = 220.0;
const D_MARGE_LINKS: f32 = 30.0;
const D_MARGE_RECHTS: f32 = 34.0;
const D_MARGE_BOVEN: f32 = 22.0;
const D_MARGE_ONDER: f32 = 18.0;
const D_TICK: f32 = 3.0;
const D_TEKENVLAK_W: f32 = D_KADER_W - D_MARGE_LINKS - D_MARGE_RECHTS;
const D_TEKENVLAK_MIN_H: f32 = 40.0;
const D_TEKENVLAK_MAX_H: f32 = 180.0;

/// De hoogte van het tekenvlak voor een doorsnede b × h.
/// Spiegel van `tekenvlakHoogte`.
fn tekenvlak_hoogte(b_mm: f64, h_mm: f64) -> f32 {
    let gewenst = (D_TEKENVLAK_W as f64 * h_mm / b_mm) as f32;
    gewenst.clamp(D_TEKENVLAK_MIN_H, D_TEKENVLAK_MAX_H)
}

/// De ontwerpmaat (breedte, hoogte) van het kader waarin deze doorsnede past.
///
/// **Het kader volgt de doorsnede.** Was het tekenvlak vierkant, dan werd een
/// T met een meewerkende flens — b_eff = 2780 tegen h = 450, ruim 6 : 1 — op
/// ware schaal een streep van een tiende van de kaderhoogte. De hoogte volgt
/// daarom de verhouding h/b van de doorsnede zelf; de schaal blijft waar en de
/// doorsnede vult het beeld. Voor alles wat hoger is dan breed verandert er
/// niets: dat zat al op de bovengrens.
///
/// Geef [`teken_doorsnede`] een rechthoek met deze verhouding, dan staat de
/// figuur op schaal 1 ten opzichte van het scherm.
pub fn doorsnede_kader(section: &ConcreteSection) -> (f32, f32) {
    let teken_h = tekenvlak_hoogte(section.b_mm, section.h_mm);
    (D_KADER_W, D_MARGE_BOVEN + teken_h + D_MARGE_ONDER)
}

/// De betondoorsnede met de wapeningskorf: de werkelijke omtrek (rechthoek, T
/// of L, flens boven of onder), de beugel om het lijf, de hoofdwapening op
/// ware schaal, en de maten b, h, d en b_w.
///
/// Alle meetkunde komt uit [`omtrek_punten`] en [`staaf_posities`] — dezelfde
/// bron als het scherm, bewaakt door `tests/betonfiguren_meetkunde.rs`.
pub fn teken_doorsnede(
    dl: &mut DrawList,
    vlak: Rect,
    section: &ConcreteSection,
    korf: &ReinforcementCage,
    stijl: &Figuurstijl,
) {
    let b_mm = section.b_mm;
    let h_mm = section.h_mm;
    if !(b_mm > 0.0) || !(h_mm > 0.0) {
        return;
    }
    let (kader_w, kader_h) = doorsnede_kader(section);
    let k = Kader::nieuw(vlak, kader_w, kader_h);
    let kl = &stijl.kleuren;

    let teken_w = D_TEKENVLAK_W;
    let teken_h = kader_h - D_MARGE_BOVEN - D_MARGE_ONDER;
    // Ware schaal binnen het tekenvlak: ontwerpeenheden per mm.
    let s = (teken_w as f64 / b_mm).min(teken_h as f64 / h_mm) as f32;
    let w = b_mm as f32 * s;
    let h = h_mm as f32 * s;
    let x0 = D_MARGE_LINKS + (teken_w - w) / 2.0;
    let y0 = D_MARGE_BOVEN + (teken_h - h) / 2.0;

    // z loopt in het model van onder naar boven, op papier van boven naar onder.
    let sx = |x: f64| k.x(x0 + x as f32 * s);
    let sy = |z: f64| k.y(y0 + (h_mm - z) as f32 * s);

    // ── Beton: de werkelijke omtrek, dus ook de flens van een T of een L.
    let omtrek: Vec<(Pt, Pt)> = omtrek_punten(section).into_iter().map(|(x, z)| (sx(x), sy(z))).collect();
    dl.set_fill_color(kl.beton_vlak);
    dl.set_stroke_color(kl.beton_lijn);
    dl.set_line_width(k.l(1.0));
    dl.draw_polygon(omtrek, true, true);

    // ── Beugel om het LIJF, niet om de omhullende breedte: de hoofdbeugel van
    //    een T-ligger zit om het lijf, en de flens draagt daar zijn eigen
    //    dwarswapening. Bij een rechthoek is het lijf de hele doorsnede.
    let c = korf.cover_mm;
    let d_bgl = korf.stirrup_diameter_mm;
    let beugel_inzet = c + d_bgl / 2.0;
    let lijf = section
        .bands()
        .iter()
        .copied()
        .reduce(|a, b| if b.b_mm < a.b_mm { b } else { a })
        .expect("een doorsnede heeft ten minste één band");
    let lijf_hart = hart_x_mm(section, 0.5 * (lijf.z0_mm + lijf.z1_mm));
    let beugel_breedte = lijf.b_mm - 2.0 * beugel_inzet;
    let beugel_hoogte = h_mm - 2.0 * beugel_inzet;
    if d_bgl > 0.0 && beugel_breedte > 0.0 && beugel_hoogte > 0.0 {
        dl.set_stroke_color(kl.beugel);
        dl.set_line_width(Pt(k.l(0.8).0.max(k.l(d_bgl as f32 * s).0)));
        let bx = sx(lijf_hart - lijf.b_mm / 2.0 + beugel_inzet);
        let by = sy(h_mm - beugel_inzet);
        dl.draw_rounded_rect(
            bx,
            by,
            k.l(beugel_breedte as f32 * s),
            k.l(beugel_hoogte as f32 * s),
            Pt(k.l(1.5).0.max(k.l(2.0 * d_bgl as f32 * s).0)),
            false,
            true,
        );
    }

    // ── Hoofdwapening op ware schaal. De ondergrens is er alleen zodat een
    //    staaf bij een zeer brede doorsnede niet als onzichtbare stip
    //    verdwijnt; zij is bewust klein gehouden, want een opgeblazen staaf
    //    suggereert wapening die er niet ligt.
    dl.set_fill_color(kl.beton_lijn);
    for st in staaf_posities(korf, section) {
        let r = Pt(k.l(0.6).0.max(k.l(st.diameter_mm as f32 / 2.0 * s).0));
        cirkel(dl, sx(st.x_mm), sy(st.z_mm), r, true, false);
    }

    // ── Rijlabels ("3Ø16"): in het beton naast de staven, maar alleen als ze
    //    elkaar daar niet raken. Bij een lage doorsnede — een T met een brede
    //    meewerkende flens is maar een fractie zo hoog als breed — vallen ze
    //    over elkaar heen, en twee onleesbare labels zijn erger dan geen; dan
    //    staan ze in het onderschrift, waar altijd ruimte is.
    let heeft_onder = !korf.bottom.is_empty();
    let heeft_boven = !korf.top.is_empty();
    let y_label_onder = y0 + (h_mm - korf.axis_offset_mm(&korf.bottom)) as f32 * s
        - 3.0f32.max(korf.bottom.diameter_mm as f32 / 2.0 * s)
        - 2.5;
    let y_label_boven = y0 + korf.axis_offset_mm(&korf.top) as f32 * s
        + 3.0f32.max(korf.top.diameter_mm as f32 / 2.0 * s)
        + 8.0;
    const LABEL_H: f32 = 9.0;
    let labels_in_de_doorsnede =
        !heeft_onder || !heeft_boven || y_label_onder - y_label_boven >= LABEL_H;

    dl.set_font(&stijl.font, k.l(7.5));
    dl.set_fill_color(kl.tekst_zwak);
    if labels_in_de_doorsnede && heeft_onder {
        dl.draw_text_center(
            sx(hart_x_mm(section, korf.axis_offset_mm(&korf.bottom))),
            k.y(y_label_onder),
            &korf.bottom.label(),
        );
    }
    if labels_in_de_doorsnede && heeft_boven {
        dl.draw_text_center(
            sx(hart_x_mm(section, h_mm - korf.axis_offset_mm(&korf.top))),
            k.y(y_label_boven),
            &korf.top.label(),
        );
    }

    // ── Maatvoering: b boven, h links, d rechts, b_w op het lijf.
    let d_nuttig = korf.d_mm(h_mm);
    let y_maat_b = y0 - 9.0;
    let x_maat_h = x0 - 10.0;
    let x_maat_d = x0 + w + 10.0;

    dl.set_stroke_color(kl.maatlijn);
    dl.set_line_width(k.l(0.6));
    // b
    dl.draw_line(k.x(x0), k.y(y_maat_b), k.x(x0 + w), k.y(y_maat_b));
    dl.draw_line(k.x(x0), k.y(y_maat_b - D_TICK), k.x(x0), k.y(y_maat_b + D_TICK));
    dl.draw_line(k.x(x0 + w), k.y(y_maat_b - D_TICK), k.x(x0 + w), k.y(y_maat_b + D_TICK));
    // h
    dl.draw_line(k.x(x_maat_h), k.y(y0), k.x(x_maat_h), k.y(y0 + h));
    dl.draw_line(k.x(x_maat_h - D_TICK), k.y(y0), k.x(x_maat_h + D_TICK), k.y(y0));
    dl.draw_line(k.x(x_maat_h - D_TICK), k.y(y0 + h), k.x(x_maat_h + D_TICK), k.y(y0 + h));
    // d: van de bovenrand tot de as van de onderwapening.
    if heeft_onder {
        let y_d = y0 + (h_mm - (h_mm - d_nuttig)) as f32 * s;
        dl.draw_line(k.x(x_maat_d), k.y(y0), k.x(x_maat_d), k.y(y_d));
        dl.draw_line(k.x(x_maat_d - D_TICK), k.y(y0), k.x(x_maat_d + D_TICK), k.y(y0));
        dl.draw_line(k.x(x_maat_d - D_TICK), k.y(y_d), k.x(x_maat_d + D_TICK), k.y(y_d));
        streeplijn(
            dl,
            k.x(x0 + w),
            k.y(y_d),
            k.x(x_maat_d),
            k.y(y_d),
            k.l(2.0),
            k.l(2.0),
        );
    }
    // b_w: de maat die bij een T of L het verschil maakt.
    if section.shape.has_flange() {
        let z_mid = 0.5 * (lijf.z0_mm + lijf.z1_mm);
        dl.draw_line(
            sx(lijf_hart - lijf.b_mm / 2.0),
            sy(z_mid),
            sx(lijf_hart + lijf.b_mm / 2.0),
            sy(z_mid),
        );
    }

    dl.set_fill_color(kl.maatlijn);
    pijl(dl, k.x(x0), k.y(y_maat_b), 0.0, k.l(5.0));
    pijl(dl, k.x(x0 + w), k.y(y_maat_b), 180.0, k.l(5.0));
    pijl(dl, k.x(x_maat_h), k.y(y0), 90.0, k.l(5.0));
    pijl(dl, k.x(x_maat_h), k.y(y0 + h), 270.0, k.l(5.0));

    dl.set_font(&stijl.font, k.l(7.5));
    dl.set_fill_color(kl.tekst_maat);
    let b_naam = if section.shape.has_flange() { "b_eff" } else { "b" };
    dl.draw_text_center(
        k.x(x0 + w / 2.0),
        k.y(y_maat_b - 3.0),
        &format!("{} {}", b_naam, maat(b_mm)),
    );
    // Op het scherm staan h en d gedraaid langs hun maatlijn. De tekenmotor
    // kent geen gedraaide tekst; ze staan hier horizontaal ÓP de maatlijn, met
    // een uitsparing eronder — de gangbare tekenconventie.
    tekst_met_uitsparing(
        dl,
        stijl,
        k.x(x_maat_h),
        k.y(y0 + h / 2.0 + 2.5),
        k.l(7.5),
        &format!("h {}", maat(h_mm)),
    );
    if heeft_onder {
        let y_d_mid = y0 + (d_nuttig / h_mm) as f32 * h / 2.0;
        tekst_met_uitsparing(
            dl,
            stijl,
            k.x(x_maat_d),
            k.y(y_d_mid + 2.5),
            k.l(7.5),
            &format!("d {}", maat(d_nuttig)),
        );
    }
    if section.shape.has_flange() {
        let z_mid = 0.5 * (lijf.z0_mm + lijf.z1_mm);
        dl.set_font(&stijl.font, k.l(7.0));
        dl.set_fill_color(kl.tekst_maat);
        dl.draw_text_center(
            sx(lijf_hart),
            Pt(sy(z_mid).0 - k.l(2.5).0),
            &format!("b_w {}", maat(lijf.b_mm)),
        );
    }

    // Onderschrift.
    let mut delen: Vec<String> = Vec::new();
    if !labels_in_de_doorsnede {
        delen.push(format!("{} onder, {} boven", korf.bottom.label(), korf.top.label()));
    }
    if section.shape.has_flange() {
        delen.push(format!("h_f {}", maat(section.h_f_mm())));
    }
    delen.push(format!("dekking {}", maat(c)));
    if d_bgl > 0.0 {
        delen.push(format!("beugel Ø{}", maat(d_bgl)));
    }
    dl.set_font(&stijl.font, k.l(7.0));
    dl.set_fill_color(kl.tekst_maat);
    dl.draw_text_center(k.x(x0 + w / 2.0), k.y(y0 + h + 12.0), &delen.join(", "));
}

// ── Figuur 2: het M-κ-diagram ─────────────────────────────────────────────────

const MK_MARGE_LINKS: f32 = 52.0;
const MK_MARGE_RECHTS: f32 = 16.0;
const MK_MARGE_BOVEN: f32 = 16.0;
const MK_MARGE_ONDER: f32 = 40.0;

/// Het punt op de kromme waar M = |M_Ed|, door lineaire interpolatie tussen de
/// twee diagrampunten die de M_Ed-lijn insluiten.
///
/// `None` wanneer M_Ed buiten het diagram valt (M_Ed > M_Rd, of geen M_Ed) —
/// dan is er geen punt om te markeren en zegt de M_Ed-lijn boven de kromme het
/// verhaal al. Spiegel van `puntBijMoment`.
pub fn punt_bij_moment(diagram: &MnKappaDiagram, m_knm: f64) -> Option<(f64, f64)> {
    let p = &diagram.points;
    let doel = m_knm.abs();
    if p.len() < 2 || !(doel > 0.0) {
        return None;
    }
    for i in 1..p.len() {
        let (a, b) = (&p[i - 1], &p[i]);
        let lo = a.m_knm.min(b.m_knm);
        let hi = a.m_knm.max(b.m_knm);
        if doel < lo || doel > hi {
            continue;
        }
        let span = b.m_knm - a.m_knm;
        let t = if span.abs() < 1e-12 { 0.0 } else { (doel - a.m_knm) / span };
        return Some((a.kappa_per_m + t * (b.kappa_per_m - a.kappa_per_m), doel));
    }
    None
}

/// Woordelijke aanduiding van de bezwijkwijze. Spiegel van `bezwijkLabel`.
fn bezwijk_label(m: FailureMode) -> &'static str {
    match m {
        FailureMode::ConcreteCrushing => "bezwijken beton",
        FailureMode::SteelRupture => "bezwijken staal",
        FailureMode::SteelStrainLimit => "rekgrens staal",
        FailureMode::AxialCapacityExceeded => "N te groot",
        FailureMode::NoEquilibrium => "geen evenwicht",
    }
}

/// Het M-κ-diagram bij vaste N: de kromme, het vloeipunt, het bezwijkpunt, de
/// M_Ed-referentielijn en — als M_Ed op de kromme valt — het **maatgevende
/// punt** met de kromming die bij dat moment hoort.
///
/// Dat laatste is wat een rapportlezer wil zien: niet alleen dát M_Ed onder
/// M_Rd ligt, maar ook hoe ver de doorsnede al gescheurd is bij dat moment.
pub fn teken_mn_kappa(
    dl: &mut DrawList,
    vlak: Rect,
    diagram: Option<&MnKappaDiagram>,
    m_ed_knm: Option<f64>,
    stijl: &Figuurstijl,
) {
    let (kw, kh) = KADER_MN_KAPPA;
    let k = Kader::nieuw(vlak, kw, kh);
    let kl = &stijl.kleuren;
    let plot_w = kw - MK_MARGE_LINKS - MK_MARGE_RECHTS;
    let plot_h = kh - MK_MARGE_BOVEN - MK_MARGE_ONDER;
    let y_basis = MK_MARGE_BOVEN + plot_h;

    let punten: &[nen_en_1992_1_1::mnkappa::MnKappaPoint] =
        diagram.map(|d| d.points.as_slice()).unwrap_or(&[]);
    let leeg = punten.len() < 2;

    // Assen: dezelfde stappenregel als op het scherm.
    let kappa_max = punten.iter().fold(0.0f64, |m, p| m.max(p.kappa_per_m * 1e3));
    let m_max_data = punten.iter().fold(0.0f64, |m, p| m.max(p.m_knm));
    let m_max = m_max_data.max(m_ed_knm.map(f64::abs).unwrap_or(0.0));
    let x_ticks = ticks(if kappa_max > 0.0 { kappa_max } else { 1.0 });
    let y_ticks = ticks(if m_max > 0.0 { m_max } else { 1.0 });
    let x_as_max = *x_ticks.last().unwrap();
    let y_as_max = *y_ticks.last().unwrap();

    let sx = |kappa_per_m: f64| MK_MARGE_LINKS + (kappa_per_m * 1e3 / x_as_max) as f32 * plot_w;
    let sy = |m_knm: f64| MK_MARGE_BOVEN + plot_h - (m_knm.max(0.0) / y_as_max) as f32 * plot_h;

    // Raster en assen.
    dl.set_stroke_color(kl.raster);
    dl.set_line_width(k.l(0.6));
    for t in &y_ticks {
        dl.draw_line(k.x(MK_MARGE_LINKS), k.y(sy(*t)), k.x(MK_MARGE_LINKS + plot_w), k.y(sy(*t)));
    }
    for t in &x_ticks {
        let x = MK_MARGE_LINKS + (t / x_as_max) as f32 * plot_w;
        dl.draw_line(k.x(x), k.y(MK_MARGE_BOVEN), k.x(x), k.y(y_basis));
    }
    dl.set_stroke_color(kl.maatlijn);
    dl.set_line_width(k.l(0.8));
    dl.draw_line(k.x(MK_MARGE_LINKS), k.y(y_basis), k.x(MK_MARGE_LINKS + plot_w), k.y(y_basis));
    dl.draw_line(k.x(MK_MARGE_LINKS), k.y(MK_MARGE_BOVEN), k.x(MK_MARGE_LINKS), k.y(y_basis));

    // Astekst.
    dl.set_font(&stijl.font, k.l(8.0));
    dl.set_fill_color(kl.tekst_maat);
    for t in &y_ticks {
        dl.draw_text_right(k.x(MK_MARGE_LINKS - 5.0), k.y(sy(*t) + 2.8), &nl(*t, 0));
    }
    // Decimalen uit de STAP en niet uit de waarde — anders staat er
    // "0,0  1  2" op één as. Dat is de regel die `EiVerloopGrafiek` hanteert
    // en met zoveel woorden toelicht; hier volgen beide figuren in de PDF hem,
    // zodat twee grafieken in één document hun as niet verschillend verdelen.
    let x_dec = if x_ticks.len() > 1 && x_ticks[1] - x_ticks[0] < 1.0 { 1 } else { 0 };
    for t in &x_ticks {
        let x = MK_MARGE_LINKS + (t / x_as_max) as f32 * plot_w;
        dl.draw_text_center(k.x(x), k.y(y_basis + 11.0), &nl(*t, x_dec));
    }
    dl.set_font(&stijl.font, k.l(8.5));
    dl.draw_text_center(
        k.x(MK_MARGE_LINKS + plot_w / 2.0),
        k.y(kh - 6.0),
        "kromming κ [10^-3/m]",
    );
    // Op het scherm staat de titel van de verticale as gedraaid; hier
    // horizontaal boven de as.
    dl.draw_text(k.x(6.0), k.y(MK_MARGE_BOVEN - 6.0), "moment M [kNm]");

    if leeg {
        let melding = match diagram {
            Some(d) => format!("Geen diagram: {}", bezwijk_label(d.failure_mode)),
            None => "Nog geen diagram berekend".to_string(),
        };
        dl.set_font(&stijl.font, k.l(9.0));
        dl.draw_text_center(
            k.x(MK_MARGE_LINKS + plot_w / 2.0),
            k.y(MK_MARGE_BOVEN + plot_h / 2.0),
            &melding,
        );
        return;
    }
    let d = diagram.expect("niet leeg, dus er is een diagram");

    // M_Ed als referentielijn.
    let markeer = m_ed_knm.map(|m| m.abs() > 0.0).unwrap_or(false);
    if let Some(m_ed) = m_ed_knm.filter(|m| m.abs() > 0.0) {
        dl.set_stroke_color(kl.rekenpunt);
        dl.set_line_width(k.l(1.0));
        streeplijn(
            dl,
            k.x(MK_MARGE_LINKS),
            k.y(sy(m_ed.abs())),
            k.x(MK_MARGE_LINKS + plot_w),
            k.y(sy(m_ed.abs())),
            k.l(4.0),
            k.l(3.0),
        );
        dl.set_font(&stijl.font, k.l(8.0));
        dl.set_fill_color(kl.tekst_zwak);
        dl.draw_text_right(
            k.x(MK_MARGE_LINKS + plot_w - 2.0),
            k.y(sy(m_ed.abs()) - 3.0),
            &format!("M_Ed = {} kNm", nl(m_ed.abs(), 1)),
        );
    }

    // De reeks: een gebroken lijn door alle punten.
    dl.set_stroke_color(kl.reeks);
    dl.set_line_width(k.l(2.0));
    for i in 1..punten.len() {
        let (a, b) = (&punten[i - 1], &punten[i]);
        dl.draw_line(
            k.x(sx(a.kappa_per_m)),
            k.y(sy(a.m_knm)),
            k.x(sx(b.kappa_per_m)),
            k.y(sy(b.m_knm)),
        );
    }

    // Vloeipunt: open bolletje, direct gelabeld.
    if let (Some(kappa_y), Some(m_y)) = (d.kappa_y_per_m, d.m_y_knm) {
        dl.set_fill_color(kl.vlak);
        dl.set_stroke_color(kl.reeks);
        dl.set_line_width(k.l(2.0));
        cirkel(dl, k.x(sx(kappa_y)), k.y(sy(m_y)), k.l(4.5), true, true);
        dl.set_font(&stijl.font, k.l(8.0));
        dl.set_fill_color(kl.tekst_zwak);
        dl.draw_text(
            k.x(sx(kappa_y) + 7.0),
            k.y(sy(m_y) + 10.0),
            &format!("vloeien {} kNm", nl(m_y, 1)),
        );
    }

    // Bezwijkpunt: dicht bolletje op het laatste diagrampunt.
    let laatste = &punten[punten.len() - 1];
    dl.set_fill_color(kl.reeks);
    cirkel(dl, k.x(sx(laatste.kappa_per_m)), k.y(sy(laatste.m_knm)), k.l(4.5), true, false);
    dl.set_font(&stijl.font, k.l(8.0));
    dl.set_fill_color(kl.tekst_zwak);
    dl.draw_text_right(
        k.x(sx(laatste.kappa_per_m) - 7.0),
        k.y(sy(laatste.m_knm) - 6.0),
        &format!("{} {} kNm", bezwijk_label(d.failure_mode), nl(laatste.m_knm, 1)),
    );

    // Het maatgevende punt: waar de kromme M_Ed snijdt. Ruitvorm, zodat het ook
    // in grijstinten van het vloei- en bezwijkpunt te onderscheiden is.
    if markeer {
        if let Some((kappa, m)) = m_ed_knm.and_then(|m| punt_bij_moment(d, m)) {
            dl.set_stroke_color(kl.rekenpunt);
            dl.set_line_width(k.l(0.8));
            streeplijn(
                dl,
                k.x(sx(kappa)),
                k.y(sy(m)),
                k.x(sx(kappa)),
                k.y(y_basis),
                k.l(3.0),
                k.l(2.0),
            );
            dl.set_fill_color(kl.rekenpunt);
            ruit(dl, k.x(sx(kappa)), k.y(sy(m)), k.l(5.0));
            dl.set_font(&stijl.font, k.l(8.0));
            dl.draw_text(
                k.x(sx(kappa) + 8.0),
                k.y(sy(m) - 6.0),
                &format!("maatgevend: κ = {}·10^-3/m", nl(kappa * 1e3, 2)),
            );
        }
    }
}

// ── Figuur 3: het N-M-interactiediagram ───────────────────────────────────────

const IA_MARGE_LINKS: f32 = 56.0;
const IA_MARGE_RECHTS: f32 = 14.0;
const IA_MARGE_BOVEN: f32 = 14.0;
const IA_MARGE_ONDER: f32 = 40.0;

/// Het N-M-interactiediagram: de bezwijkomhullende met het rekenpunt en de
/// **horizontale snede** die de unity check bepaalt.
///
/// TEKENCONVENTIE — dezelfde als in de rekenkern en de rest van het rapport:
/// N positief is TREK, N negatief is druk; trek staat dus bovenaan. Dat is niet
/// de klassieke kolomtekening, maar wél consistent met de snedekrachten
/// elders; de asbenoeming zegt het erbij.
///
/// WAT DE FIGUUR NIET IS: de unity check als afstand tot de omhullende. Die
/// wordt bepaald als M_Ed / M_Rd(N_Ed) — een horizontale snede bij constante N
/// — en zo staat hij er ook in: van de N-as tot de omhullende is M_Rd, en het
/// ruitje daarop is M_Ed.
///
/// `m_rd_knm` is M_Rd bij N_Ed zoals de toets hem heeft berekend. Ontbreekt
/// die, dan wordt hij uit de omhullende geïnterpoleerd — maar dat is een
/// benadering op de gegeven punten en levert een net iets ander getal dan de
/// toets. Geef hem dus mee zodra hij bekend is, zodat de figuur en de
/// toetstabel hetzelfde getal tonen.
#[allow(clippy::too_many_arguments)]
pub fn teken_interactie(
    dl: &mut DrawList,
    vlak: Rect,
    positief: &[InteractionPoint],
    negatief: &[InteractionPoint],
    n_ed_kn: Option<f64>,
    m_ed_knm: Option<f64>,
    m_rd_knm: Option<f64>,
    stijl: &Figuurstijl,
) {
    let (kw, kh) = KADER_INTERACTIE;
    let k = Kader::nieuw(vlak, kw, kh);
    let kl = &stijl.kleuren;
    let plot_w = kw - IA_MARGE_LINKS - IA_MARGE_RECHTS;
    let plot_h = kh - IA_MARGE_BOVEN - IA_MARGE_ONDER;

    let leeg = positief.len() < 2 && negatief.len() < 2;

    // De omhullende: heen langs de positieve tak (M ≥ 0), terug langs de
    // negatieve tak gespiegeld (−M_Rd). Sluit vanzelf.
    let mut omtrek: Vec<(f64, f64)> = positief.iter().map(|p| (p.m_rd_knm, p.n_kn)).collect();
    omtrek.extend(negatief.iter().rev().map(|p| (-p.m_rd_knm, p.n_kn)));

    let mut m_waarden: Vec<f64> = omtrek.iter().map(|p| p.0).collect();
    let mut n_waarden: Vec<f64> = omtrek.iter().map(|p| p.1).collect();
    if let Some(m) = m_ed_knm {
        m_waarden.push(m);
    }
    if let Some(m) = m_rd_knm {
        m_waarden.push(m);
        m_waarden.push(-m);
    }
    if let Some(n) = n_ed_kn {
        n_waarden.push(n);
    }
    let vouw = |v: &[f64], f: fn(f64, f64) -> f64| v.iter().fold(0.0f64, |a, b| f(a, *b));
    let (m_min, m_max, m_ticks) =
        as_indeling(vouw(&m_waarden, f64::min), vouw(&m_waarden, f64::max), 5.0);
    let (n_min, n_max, n_ticks) =
        as_indeling(vouw(&n_waarden, f64::min), vouw(&n_waarden, f64::max), 5.0);

    let sx = |m: f64| IA_MARGE_LINKS + ((m - m_min) / (m_max - m_min)) as f32 * plot_w;
    // N loopt van beneden (druk, meest negatief) naar boven (trek).
    let sy = |n: f64| IA_MARGE_BOVEN + plot_h - ((n - n_min) / (n_max - n_min)) as f32 * plot_h;

    // Raster.
    dl.set_stroke_color(kl.raster);
    dl.set_line_width(k.l(0.6));
    for t in &n_ticks {
        dl.draw_line(k.x(IA_MARGE_LINKS), k.y(sy(*t)), k.x(IA_MARGE_LINKS + plot_w), k.y(sy(*t)));
    }
    for t in &m_ticks {
        dl.draw_line(k.x(sx(*t)), k.y(IA_MARGE_BOVEN), k.x(sx(*t)), k.y(IA_MARGE_BOVEN + plot_h));
    }
    // De nul-assen zwaarder: M = 0 en N = 0 zijn betekenisvolle lijnen.
    dl.set_stroke_color(kl.maatlijn);
    dl.set_line_width(k.l(0.9));
    dl.draw_line(k.x(sx(0.0)), k.y(IA_MARGE_BOVEN), k.x(sx(0.0)), k.y(IA_MARGE_BOVEN + plot_h));
    dl.draw_line(k.x(IA_MARGE_LINKS), k.y(sy(0.0)), k.x(IA_MARGE_LINKS + plot_w), k.y(sy(0.0)));

    // Astekst.
    dl.set_font(&stijl.font, k.l(8.0));
    dl.set_fill_color(kl.tekst_maat);
    for t in &n_ticks {
        dl.draw_text_right(k.x(IA_MARGE_LINKS - 5.0), k.y(sy(*t) + 2.8), &nul_schoon(*t, 0));
    }
    for t in &m_ticks {
        dl.draw_text_center(k.x(sx(*t)), k.y(IA_MARGE_BOVEN + plot_h + 11.0), &nul_schoon(*t, 0));
    }
    dl.set_font(&stijl.font, k.l(8.5));
    dl.draw_text_center(
        k.x(IA_MARGE_LINKS + plot_w / 2.0),
        k.y(kh - 6.0),
        "moment M [kNm] — positief: trek onder",
    );
    dl.draw_text(k.x(6.0), k.y(IA_MARGE_BOVEN - 4.0), "normaalkracht N [kN] — trek +, druk −");

    if leeg {
        dl.set_font(&stijl.font, k.l(9.0));
        dl.draw_text_center(
            k.x(IA_MARGE_LINKS + plot_w / 2.0),
            k.y(IA_MARGE_BOVEN + plot_h / 2.0),
            "Geen interactiediagram berekend",
        );
        return;
    }

    // De omhullende: gevuld vlak = het opneembare gebied. De doorzichtigheid
    // van het scherm (12 %) is hier vooraf met wit gemengd.
    let vulling = meng_met_wit(kl.reeks, 0.12);
    dl.set_fill_color(vulling);
    dl.set_stroke_color(kl.reeks);
    dl.set_line_width(k.l(1.6));
    dl.draw_polygon(
        omtrek.iter().map(|(m, n)| (k.x(sx(*m)), k.y(sy(*n)))).collect(),
        true,
        true,
    );

    // Het rekenpunt met de horizontale snede die de unity check is.
    let (Some(n_ed), Some(m_ed)) = (n_ed_kn, m_ed_knm) else { return };

    // M_Rd bij N_Ed: bij voorkeur het getal van de toets zelf; anders lineair
    // geïnterpoleerd uit de tak die bij het teken van M_Ed hoort.
    let m_rd_bij_n_ed = match m_rd_knm {
        Some(m) => Some(if m_ed < 0.0 { -m.abs() } else { m.abs() }),
        None => {
            let tak = if m_ed < 0.0 { negatief } else { positief };
            let mut gevonden = None;
            for i in 1..tak.len() {
                let (a, b) = (&tak[i - 1], &tak[i]);
                let lo = a.n_kn.min(b.n_kn);
                let hi = a.n_kn.max(b.n_kn);
                if n_ed < lo || n_ed > hi {
                    continue;
                }
                let span = b.n_kn - a.n_kn;
                let t = if span.abs() < 1e-12 { 0.0 } else { (n_ed - a.n_kn) / span };
                let m = a.m_rd_knm + t * (b.m_rd_knm - a.m_rd_knm);
                gevonden = Some(if m_ed < 0.0 { -m } else { m });
                break;
            }
            gevonden
        }
    };

    if let Some(m_rd) = m_rd_bij_n_ed {
        dl.set_stroke_color(kl.rekenpunt);
        dl.set_line_width(k.l(1.0));
        streeplijn(
            dl,
            k.x(sx(0.0)),
            k.y(sy(n_ed)),
            k.x(sx(m_rd)),
            k.y(sy(n_ed)),
            k.l(4.0),
            k.l(3.0),
        );
        dl.set_fill_color(kl.vlak);
        dl.set_line_width(k.l(1.4));
        cirkel(dl, k.x(sx(m_rd)), k.y(sy(n_ed)), k.l(2.6), true, true);
        dl.set_font(&stijl.font, k.l(7.5));
        dl.set_fill_color(kl.tekst_zwak);
        let tekst = format!("M_Rd = {} kNm", nl(m_rd.abs(), 1));
        if m_rd < 0.0 {
            dl.draw_text_right(k.x(sx(m_rd) - 5.0), k.y(sy(n_ed) + 11.0), &tekst);
        } else {
            dl.draw_text(k.x(sx(m_rd) + 5.0), k.y(sy(n_ed) + 11.0), &tekst);
        }
    }

    dl.set_fill_color(kl.rekenpunt);
    ruit(dl, k.x(sx(m_ed)), k.y(sy(n_ed)), k.l(5.0));
    dl.set_font(&stijl.font, k.l(8.0));
    let punt_tekst = format!("({} kN; {} kNm)", nl(n_ed, 1), nl(m_ed, 1));
    if m_ed < 0.0 {
        dl.draw_text(k.x(sx(m_ed) + 8.0), k.y(sy(n_ed) - 8.0), &punt_tekst);
    } else {
        dl.draw_text_right(k.x(sx(m_ed) - 8.0), k.y(sy(n_ed) - 8.0), &punt_tekst);
    }
}

// ── Figuur 4: het EI-verloop langs de staaf ───────────────────────────────────

const EI_MARGE_LINKS: f32 = 62.0;
const EI_MARGE_RECHTS: f32 = 14.0;
const EI_MARGE_BOVEN: f32 = 26.0;
const EI_MARGE_ONDER: f32 = 34.0;
/// Waar de legenda in de bovenste band begint.
///
/// Op het scherm staat hij tegen de linkerrand van het plotvlak; hier moet
/// links de titel van de verticale as staan, die op het scherm gedraaid langs
/// de as loopt en die de tekenmotor niet kan draaien. De legenda schuift
/// daarvoor op — hij past nog ruim binnen het plotvlak (62 … 546).
const EI_LEGENDA_X: f32 = 190.0;

/// De buigstijfheid EI langs één betonstaaf, als stapfiguur met de ongescheurde
/// E_c·I_c als streeplijn.
///
/// Dezelfde figuur als op het canvas en in het live rapport, maar op papier:
/// een stapfiguur van de EI per segment, gescheurde segmenten donkerder gevuld
/// dan ongescheurde (zodat het onderscheid ook in grijstinten leesbaar blijft
/// en niet alleen in kleur), en een streeplijn op de vergelijkingswaarde.
///
/// De referentielijn is met opzet géén tak van de kromme: in de UGT laat
/// 5.8.6(5) de betontrek weg, dus daar bestaat geen ongescheurde toestand.
/// E_c·I_c is een **vergelijkingswaarde**, en dat staat er ook bij.
///
/// Een segment zonder stijfheid — de kern gaf er geen — laat een GAT in de
/// figuur, met "geen EI" op de as. Doortrekken zou een waarde suggereren die er
/// niet is.
pub fn teken_ei_verloop(
    dl: &mut DrawList,
    vlak: Rect,
    respons: &SegmentStiffnessResponse,
    stijl: &Figuurstijl,
) {
    let (kw, kh) = KADER_EI;
    let k = Kader::nieuw(vlak, kw, kh);
    let kl = &stijl.kleuren;
    let plot_w = kw - EI_MARGE_LINKS - EI_MARGE_RECHTS;
    let plot_h = kh - EI_MARGE_BOVEN - EI_MARGE_ONDER;
    let y_basis = EI_MARGE_BOVEN + plot_h;

    let ei_ongescheurd = respons.ei_uncracked_knm2;
    let lengte_m = respons.length_m;

    let ei_max = respons
        .segments
        .iter()
        .filter_map(|s| s.ei_knm2)
        .filter(|v| v.is_finite())
        .fold(ei_ongescheurd.max(1.0), f64::max);
    let y_ticks = ticks(ei_max);
    let y_as_max = *y_ticks.last().unwrap();
    let x_ticks = ticks(if lengte_m > 0.0 { lengte_m } else { 1.0 });
    let x_as_max = *x_ticks.last().unwrap();
    // Decimalen van de x-as uit de STAP, niet uit de waarde: anders staat er
    // "0,0  1  2" op één as. Bij een korte staaf is de stap een halve meter en
    // is één decimaal nodig.
    let x_dec = if x_ticks.len() > 1 && x_ticks[1] - x_ticks[0] < 1.0 { 1 } else { 0 };

    let sx = |x_mm: f64| EI_MARGE_LINKS + (x_mm / 1000.0 / x_as_max) as f32 * plot_w;
    let sy = |ei: f64| EI_MARGE_BOVEN + plot_h - (ei.max(0.0) / y_as_max) as f32 * plot_h;

    // Raster en assen.
    dl.set_stroke_color(kl.raster);
    dl.set_line_width(k.l(0.6));
    for t in &y_ticks {
        dl.draw_line(k.x(EI_MARGE_LINKS), k.y(sy(*t)), k.x(EI_MARGE_LINKS + plot_w), k.y(sy(*t)));
    }
    for t in &x_ticks {
        let x = EI_MARGE_LINKS + (t / x_as_max) as f32 * plot_w;
        dl.draw_line(k.x(x), k.y(EI_MARGE_BOVEN), k.x(x), k.y(y_basis));
    }
    dl.set_stroke_color(kl.maatlijn);
    dl.set_line_width(k.l(0.8));
    dl.draw_line(k.x(EI_MARGE_LINKS), k.y(y_basis), k.x(EI_MARGE_LINKS + plot_w), k.y(y_basis));
    dl.draw_line(k.x(EI_MARGE_LINKS), k.y(EI_MARGE_BOVEN), k.x(EI_MARGE_LINKS), k.y(y_basis));

    dl.set_font(&stijl.font, k.l(8.0));
    dl.set_fill_color(kl.tekst_maat);
    for t in &y_ticks {
        dl.draw_text_right(k.x(EI_MARGE_LINKS - 5.0), k.y(sy(*t) + 2.8), &nl(*t, 0));
    }
    for t in &x_ticks {
        let x = EI_MARGE_LINKS + (t / x_as_max) as f32 * plot_w;
        dl.draw_text_center(k.x(x), k.y(y_basis + 11.0), &nl(*t, x_dec));
    }
    dl.set_font(&stijl.font, k.l(8.5));
    dl.draw_text_center(k.x(EI_MARGE_LINKS + plot_w / 2.0), k.y(kh - 6.0), "plaats langs de staaf x [m]");
    // De titel van de verticale as staat op het scherm gedraaid langs de as.
    // Hier staat hij horizontaal in de bovenste band; de legenda schuift
    // daarvoor naar rechts op (zie EI_LEGENDA_X).
    dl.draw_text(k.x(6.0), k.y(14.5), "buigstijfheid EI [kNm²]");

    // Per segment een staaf tot de eigen EI. Gescheurd donkerder dan
    // ongescheurd — het onderscheid moet ook in grijstinten leesbaar zijn.
    let vul_gescheurd = meng_met_wit(kl.reeks, 0.32);
    let vul_ongescheurd = meng_met_wit(kl.reeks, 0.10);
    let rand = meng_met_wit(kl.reeks, 0.60);
    for s in &respons.segments {
        let Some(ei) = s.ei_knm2.filter(|v| v.is_finite()) else {
            dl.set_font(&stijl.font, k.l(8.0));
            dl.set_fill_color(kl.rekenpunt);
            dl.draw_text_center(
                k.x((sx(s.x_start_mm) + sx(s.x_end_mm)) / 2.0),
                k.y(y_basis - 4.0),
                "geen EI",
            );
            continue;
        };
        let x0 = sx(s.x_start_mm);
        let x1 = sx(s.x_end_mm);
        let y = sy(ei);
        dl.set_fill_color(if s.cracked == Some(true) { vul_gescheurd } else { vul_ongescheurd });
        dl.set_stroke_color(rand);
        dl.set_line_width(k.l(0.7));
        dl.draw_rect(k.x(x0), k.y(y), k.l((x1 - x0).max(0.2)), k.l(y_basis - y), true, true);
    }

    // De bovenrand als doorlopende stapfiguur — dat is de EI-lijn zelf.
    dl.set_stroke_color(kl.reeks);
    dl.set_line_width(k.l(1.8));
    for (i, s) in respons.segments.iter().enumerate() {
        let Some(ei) = s.ei_knm2.filter(|v| v.is_finite()) else { continue };
        let y = sy(ei);
        dl.draw_line(k.x(sx(s.x_start_mm)), k.y(y), k.x(sx(s.x_end_mm)), k.y(y));
        if i > 0 {
            if let Some(vorige) = respons.segments[i - 1].ei_knm2.filter(|v| v.is_finite()) {
                dl.draw_line(k.x(sx(s.x_start_mm)), k.y(sy(vorige)), k.x(sx(s.x_start_mm)), k.y(y));
            }
        }
    }
    // Segmenten waar de ondergrens heeft ingegrepen: dan is EI geen
    // rekenuitkomst maar een waarde die het stelsel oplosbaar houdt. Dat mag
    // niet onzichtbaar blijven.
    dl.set_fill_color(kl.rekenpunt);
    for s in &respons.segments {
        let Some(ei) = s.ei_knm2.filter(|v| v.is_finite()) else { continue };
        if s.clamped {
            cirkel(
                dl,
                k.x((sx(s.x_start_mm) + sx(s.x_end_mm)) / 2.0),
                k.y(sy(ei)),
                k.l(2.6),
                true,
                false,
            );
        }
    }

    // Referentielijn: de ongescheurde stijfheid.
    dl.set_stroke_color(kl.lijn);
    dl.set_line_width(k.l(1.0));
    streeplijn(
        dl,
        k.x(EI_MARGE_LINKS),
        k.y(sy(ei_ongescheurd)),
        k.x(EI_MARGE_LINKS + plot_w),
        k.y(sy(ei_ongescheurd)),
        k.l(5.0),
        k.l(3.0),
    );
    dl.set_font(&stijl.font, k.l(8.0));
    dl.set_fill_color(kl.tekst_zwak);
    dl.draw_text_right(
        k.x(EI_MARGE_LINKS + plot_w - 2.0),
        k.y(sy(ei_ongescheurd) - 4.0),
        &format!("E_c·I_c = {} kNm²", nl(ei_ongescheurd, 0)),
    );

    // Legenda: twee vlakjes en de streeplijn, zodat de figuur zonder
    // bijschrift te lezen is.
    dl.set_stroke_color(rand);
    dl.set_line_width(k.l(0.7));
    dl.set_fill_color(vul_gescheurd);
    dl.draw_rect(k.x(EI_LEGENDA_X), k.y(7.0), k.l(9.0), k.l(9.0), true, true);
    dl.set_fill_color(vul_ongescheurd);
    dl.draw_rect(k.x(EI_LEGENDA_X + 72.0), k.y(7.0), k.l(9.0), k.l(9.0), true, true);
    dl.set_stroke_color(kl.lijn);
    dl.set_line_width(k.l(1.0));
    streeplijn(
        dl,
        k.x(EI_LEGENDA_X + 156.0),
        k.y(11.5),
        k.x(EI_LEGENDA_X + 174.0),
        k.y(11.5),
        k.l(5.0),
        k.l(3.0),
    );
    dl.set_font(&stijl.font, k.l(7.5));
    dl.set_fill_color(kl.tekst_zwak);
    dl.draw_text(k.x(EI_LEGENDA_X + 12.0), k.y(14.5), "gescheurd");
    dl.draw_text(k.x(EI_LEGENDA_X + 84.0), k.y(14.5), "ongescheurd");
    dl.draw_text(k.x(EI_LEGENDA_X + 178.0), k.y(14.5), "E_c·I_c (vergelijkingswaarde)");
}
