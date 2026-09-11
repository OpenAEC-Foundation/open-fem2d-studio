//! De doorsnedemotor als opdracht: JSON-geometrie in, eigenschappen uit.
//!
//! Deze module was eerst de binnenkant van de binary `doorsnedemotor`. Dat
//! werkte voor het generatiescript en voor de dev-server, maar de
//! profieleditor in de desktop-app kon er niet bij: die roept een
//! Tauri-command aan, en een command kan geen binary zijn. De rekengang staat
//! daarom hier, in de bibliotheek, en de binary is nog maar een schil
//! eromheen. Zo lopen het generatiescript, de dev-brug en de desktop-app
//! alle drie door dezelfde code — wat het hele punt van deze motor is.
//!
//! Hierdoor kan het generatiescript (`scripts/genereer-profieldata.mjs`)
//! dezelfde rekenkern gebruiken als de app zelf, in plaats van de formules in
//! JavaScript na te bouwen. Dat is het hele punt: **één waarheid**. Wat hier
//! uitkomt is wat de toetsing straks gebruikt. De profieleditor in de app
//! gebruikt dezelfde binary (via het dev-eindpunt `/api/doorsnede`) voor de
//! live-eigenschappen van een eigen doorsnede.
//!
//! ```text
//! cargo run -q -p section-properties --bin doorsnedemotor -- invoer.json uitvoer.json
//! ```
//!
//! De invoer is een array van geometrie-objecten. Drie vormen:
//!
//! **1. Catalogusvorm** (ongewijzigd ten opzichte van de generator):
//!
//! ```json
//! [{ "naam": "IPE 200", "soort": "ISection", "h": 200, "b": 100,
//!    "tw": 5.6, "tf": 8.5, "r": 12 }]
//! ```
//!
//! `soort` is `ISection` | `ISectionSchuin` | `Channel` | `ChannelSchuin` |
//! `Shs` | `Rhs` | `Chs` | `Rechthoek` (`…Schuin` = toelopende flenzen: INP
//! met 14 %, UNP met 8 %). Bij een koker telt alleen `t`; bij een buis is `h` de
//! buitendiameter. Optioneel `elementen_per_wand` (standaard 8) om de mesh van
//! de torsieoplossing fijner te zetten.
//!
//! **2. Catalogusvorm met gaten** — dezelfde invoer plus `gaten`. Twee
//! soorten, met het middelpunt telkens in het beschrijvingsassenstelsel van
//! het profiel (oorsprong linksonder, `y` naar rechts, `z` omhoog):
//!
//! * `plaats: "vlak"` — een **langsgat**: een ronde of rechthoekige opening
//!   in het doorsnedevlak zelf (een leidingdoorvoer door een massieve balk).
//!   Gaat als omgekeerd doorlopen contour in de exacte contourkern
//!   (`Doorsnede::met_gat`) en moet volledig in het materiaal liggen.
//! * `plaats: "uitsnede"` — een **gat door een plaat** (lijf, flens, wand):
//!   in het doorsnedevlak blijft ter plaatse een spleet over de volle
//!   plaatdikte over. De opgegeven (desgewenst gedraaide) rechthoek wordt
//!   exact uit de contour gesneden — lijnen én bogen — met een boolean
//!   verschil, zodat er geen samenvallende randen ontstaan (daar loopt de
//!   mesher op vast). De rechthoek mag ruim door de plaat heen steken in de
//!   leegte eromheen; alleen materiaal wordt weggenomen.
//!
//! ```json
//! [{ "naam": "IPE 300 met lijfgat", "soort": "ISection", "h": 300, "b": 150,
//!    "tw": 7.1, "tf": 10.7, "r": 15,
//!    "gaten": [{ "plaats": "uitsnede", "y": 75, "z": 150, "b": 9.1, "h": 80, "hoek_graden": 0 },
//!              { "plaats": "vlak", "vorm": "rond", "y": 75, "z": 60, "d": 4 }] }]
//! ```
//!
//! `It` en `Iw` komen uit de numerieke torsieoplossing op de doorsnede mét
//! gat; valt de doorsnede daardoor in losse delen uiteen (twee T's bij een
//! lijfgat), dan telt `It` op en is `Iw` betekenisloos — dat staat dan in
//! `losse_delen` en `meldingen`. De afschuifoppervlakken volgen de normregel
//! van de basisvorm met het **werkelijke** (verminderde) oppervlak.
//!
//! **3. Samenstelling** uit lamellen (rechthoekige platen), catalogusdelen en
//! expliciet gedeclareerde gesloten cellen — dezelfde dunwandige rekengang
//! als `steel-check` op een `custom_section` toepast, zodat de editor en de
//! toetsing hetzelfde getal laten zien:
//!
//! ```json
//! [{ "naam": "Gelaste I", "soort": "Samenstelling",
//!    "lamellen": [{ "b_mm": 200, "t_mm": 15, "y_mm": 0, "z_mm": 207.5, "alpha_rad": 0 },
//!                 { "b_mm": 200, "t_mm": 15, "y_mm": 0, "z_mm": -207.5, "alpha_rad": 0 },
//!                 { "b_mm": 400, "t_mm": 10, "y_mm": 0, "z_mm": 0, "alpha_rad": 1.5707963 }],
//!    "catalogusdelen": [{ "soort": "ChannelSchuin", "h": 200, "b": 75, "tw": 8.5, "tf": 11.5, "r": 11.5,
//!                         "y_mm": 20.19, "z_mm": 0, "alpha_rad": 0, "gespiegeld": false }],
//!    "gesloten_cellen": [{ "midlijn": [[-95,-95],[95,-95],[95,95],[-95,95]],
//!                          "dikte_mm": [10,10,10,10], "lamellen": [0,1,2,3] }] }]
//! ```
//!
//! Een catalogusdeel wordt door de motor zelf doorgerekend (exacte contour +
//! numerieke torsie) en dan als grootheden op zijn **zwaartepunt** `(y_mm,
//! z_mm)` geplaatst; `gespiegeld` spiegelt het deel om zijn eigen z-as (voor
//! twee U-profielen rug-aan-rug).
//!
//! De uitvoer geeft per profiel alle velden van `SectionProperties` plus de
//! diagnostiek waarmee te controleren is dát het klopt: de insluiting van `It`
//! tussen onder- en bovengrens, het meshoppervlak tegenover het exacte
//! oppervlak, het aantal driehoeken en de rekentijd. Voor een samenstelling
//! staan er eerlijke vlaggen bij: is `Wpl` bepaald, is `Iw` bepaald, is het
//! schuifmiddelpunt bepaald. `meldingen` bevat leesbare waarschuwingen.
//!
//! Zonder argumenten leest hij van stdin en schrijft naar stdout.


use std::time::Instant;

use crate::composite::{CatalogusDeel, CompositeSection, GeslotenCel, Lamella};
use crate::contour::{Contour, Doorsnede, Segment};
use crate::motor::{self, Afschuiving, Profielvorm};
use crate::torsie::{aanbevolen_h, TorsieOpties};
use crate::uitgebreid::{
    hoofdas_uitersten, massa_kg_per_m, monosymmetrie_van_doorsnede, plastisch_hoofdas, vormfactor,
    Hoofdas, Monosymmetrie, PlastischHoofdas, DICHTHEID_STAAL_KG_M3,
};
use serde::{Deserialize, Serialize};

// ── Invoer ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct Invoer {
    #[serde(default)]
    naam: String,
    soort: String,
    #[serde(default)]
    h: f64,
    #[serde(default)]
    b: f64,
    #[serde(default)]
    tw: f64,
    #[serde(default)]
    tf: f64,
    #[serde(default)]
    t: f64,
    #[serde(default)]
    r: f64,
    /// Aantal driehoeken door de dunste wand; standaard 8.
    #[serde(default)]
    elementen_per_wand: Option<f64>,

    /// Soortelijke massa voor `massa_kg_per_m`, in kg/m³. Weggelaten of
    /// niet-positief betekent staal (7850 kg/m³); voor hout of aluminium hoort
    /// de invoer een eigen waarde mee te geven.
    #[serde(default)]
    dichtheid_kg_m3: Option<f64>,

    /// Uitsparingen in een catalogusvorm (leeg = het ongewijzigde profiel).
    #[serde(default)]
    gaten: Vec<GatInvoer>,

    /// Alleen bij `soort = "Samenstelling"`.
    #[serde(default)]
    lamellen: Vec<LamelInvoer>,
    #[serde(default)]
    catalogusdelen: Vec<DeelInvoer>,
    #[serde(default)]
    gesloten_cellen: Vec<CelInvoer>,
}

/// Eén gat. `plaats` is `"vlak"` (langsgat; standaard) of `"uitsnede"` (gat
/// door een plaat). `vorm` is `"rond"` (met `d`) of `"rechthoek"` (met `b`,
/// `h` en desgewenst `hoek_graden`); een uitsnede is altijd rechthoekig.
/// `(y, z)` is het middelpunt in het beschrijvingsassenstelsel van het profiel.
#[derive(Deserialize)]
struct GatInvoer {
    #[serde(default = "plaats_vlak")]
    plaats: String,
    #[serde(default = "vorm_rond")]
    vorm: String,
    y: f64,
    z: f64,
    #[serde(default)]
    d: f64,
    #[serde(default)]
    b: f64,
    #[serde(default)]
    h: f64,
    #[serde(default)]
    hoek_graden: f64,
}

fn plaats_vlak() -> String {
    "vlak".into()
}
fn vorm_rond() -> String {
    "rond".into()
}

/// Lamel: zelfde afspraken als `composite::Lamella`.
#[derive(Deserialize)]
struct LamelInvoer {
    b_mm: f64,
    t_mm: f64,
    y_mm: f64,
    z_mm: f64,
    #[serde(default)]
    alpha_rad: f64,
}

/// Catalogusdeel: een catalogusvorm (zelfde maten als de hoofdinvoer) op zijn
/// zwaartepunt `(y_mm, z_mm)`, desgewenst gedraaid en gespiegeld.
#[derive(Deserialize)]
struct DeelInvoer {
    soort: String,
    #[serde(default)]
    h: f64,
    #[serde(default)]
    b: f64,
    #[serde(default)]
    tw: f64,
    #[serde(default)]
    tf: f64,
    #[serde(default)]
    t: f64,
    #[serde(default)]
    r: f64,
    y_mm: f64,
    z_mm: f64,
    #[serde(default)]
    alpha_rad: f64,
    #[serde(default)]
    gespiegeld: bool,
}

/// Gesloten cel voor de Bredt-torsie; `midlijn` als `[y, z]`-paren.
#[derive(Deserialize)]
struct CelInvoer {
    midlijn: Vec<[f64; 2]>,
    dikte_mm: Vec<f64>,
    #[serde(default)]
    lamellen: Vec<usize>,
}

// ── Uitvoer ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct Uitvoer {
    naam: String,
    soort: String,

    area_mm2: f64,
    iy_mm4: f64,
    iz_mm4: f64,
    wel_y_mm3: f64,
    wel_z_mm3: f64,
    wpl_y_mm3: f64,
    wpl_z_mm3: f64,
    av_y_mm2: f64,
    av_z_mm2: f64,
    it_mm4: f64,
    iw_mm6: f64,
    iy_radius_mm: f64,
    iz_radius_mm: f64,
    h_mm: f64,
    b_mm: f64,
    tw_mm: f64,
    tf_mm: f64,
    r_mm: f64,

    y_c_mm: f64,
    z_c_mm: f64,
    wel_y_top_mm3: f64,
    wel_y_bot_mm3: f64,
    wel_z_left_mm3: f64,
    wel_z_right_mm3: f64,
    iyz_mm4: f64,
    iu_mm4: f64,
    iv_mm4: f64,
    alpha_hoofdas_rad: f64,
    y_s_mm: f64,
    z_s_mm: f64,

    // ── Diagnostiek: waarmee je het getal kunt wantrouwen ────────────────────
    /// Gegarandeerde ondergrens van `It` (Prandtl).
    it_ondergrens_mm4: f64,
    /// Bovengrens van `It` (welving, Rayleigh-quotiënt).
    it_bovengrens_mm4: f64,
    /// Halve breedte van dat interval, relatief.
    it_onzekerheid: f64,
    /// Oppervlak van de gediscretiseerde doorsnede; hoort samen te vallen met
    /// `area_mm2`, dat exact is.
    a_mesh_mm2: f64,
    /// Relatief verschil tussen mesh en exacte contour.
    a_mesh_afwijking: f64,
    h_mesh_mm: f64,
    driehoeken: usize,
    kleinste_hoek_graden: f64,
    tijd_ms: f64,
    /// `true` als de doorsnede uit losse stukken bestaat; `Iw` en het
    /// schuifmiddelpunt zijn dan betekenisloos.
    losse_delen: bool,

    // ── Aanvullend voor de profieleditor ─────────────────────────────────────
    /// `"contour"`: exacte contourkern + numerieke torsie (catalogusvorm, al
    /// dan niet met gaten). `"lamellen"`: dunwandige samenstelling — dezelfde
    /// rekengang die de toetsing op een `custom_section` toepast.
    methode: String,
    /// `false` zodra een catalogusdeel in de samenstelling zit: dat laat zich
    /// niet op de plastische neutrale as doorsnijden, `Wpl` is dan 0.
    wpl_bepaald: bool,
    /// `false` als `Iw` niet bepaald kon worden (gesloten cel, catalogusdeel,
    /// niet-samenhangende middellijn of losse delen); `Iw` is dan 0.
    iw_bepaald: bool,
    /// `false` als het schuifmiddelpunt op het zwaartepunt is teruggevallen.
    schuifmiddelpunt_bepaald: bool,
    /// Totaal oppervlak van de gaten (mm²).
    a_gaten_mm2: f64,
    /// Omhullende rechthoek in het invoerstelsel.
    y_min_mm: f64,
    y_max_mm: f64,
    z_min_mm: f64,
    z_max_mm: f64,
    /// Per catalogusdeel (in invoervolgorde) de grootheden die de tekening
    /// nodig heeft: het zwaartepunt in het eigen beschrijvingsassenstelsel.
    delen: Vec<DeelUitvoer>,
    /// Leesbare waarschuwingen; leeg als er niets te melden is.
    meldingen: Vec<String>,

    /// De uitgebreide grootheden. `flatten` zet ze in dezelfde platte
    /// JSON-objecten als de rest, zodat de frontend er als gewone velden bij
    /// kan; in Rust blijven ze bij elkaar staan omdat beide rekenwegen ze in
    /// één keer opleveren.
    #[serde(flatten)]
    uitbreiding: Uitbreiding,
}

/// De uitgebreide doorsnedegrootheden — zie [`crate::uitgebreid`] voor de
/// definities en de tekenafspraken. Elke groep heeft zijn eigen
/// `*_bepaald`-vlag zodra hij niet voor elke doorsnede te bepalen is; is die
/// `false`, dan staan de bijbehorende velden op nul en hoort de app ze als
/// "niet bepaald" te tonen in plaats van als uitkomst.
#[derive(Serialize)]
pub struct Uitbreiding {
    /// Lengte van de buitenrand(en) in mm — het conserveringsoppervlak per
    /// strekkende meter, samen met `omtrek_gaten_mm`.
    pub omtrek_mm: f64,
    /// Lengte van de randen van de langsgaten (mm).
    pub omtrek_gaten_mm: f64,
    /// `false` voor een lamellenmodel: overlappende platen en catalogusdelen
    /// hebben geen gemeenschappelijke buitenrand, dus er is geen omtrek.
    pub omtrek_bepaald: bool,
    /// De gebruikte soortelijke massa (kg/m³); staal tenzij de invoer anders
    /// zegt.
    pub dichtheid_kg_m3: f64,
    /// Massa per strekkende meter (kg/m) bij die soortelijke massa.
    pub massa_kg_per_m: f64,

    /// Statisch moment om de **y-as van het invoerstelsel**: `∬z dA` (mm³).
    /// Om de zwaartepuntsas is dit per definitie nul.
    pub qy_mm3: f64,
    /// Statisch moment om de **z-as van het invoerstelsel**: `∬y dA` (mm³).
    pub qz_mm3: f64,

    /// Uiterste vezels in het **hoofdasstelsel**, ten opzichte van het
    /// zwaartepunt (mm). `u` ligt langs de hoofdas met de grootste traagheid.
    pub u_min_mm: f64,
    pub u_max_mm: f64,
    pub v_min_mm: f64,
    pub v_max_mm: f64,
    /// `I_u / v_max` — weerstandsmoment om de sterke hoofdas naar de vezel aan
    /// de **+v**-zijde.
    pub wel_u_plus_mm3: f64,
    /// `I_u / |v_min|` — idem naar de **−v**-zijde.
    pub wel_u_min_mm3: f64,
    /// `I_v / u_max` — weerstandsmoment om de zwakke hoofdas naar de vezel aan
    /// de **+u**-zijde.
    pub wel_v_plus_mm3: f64,
    /// `I_v / |u_min|` — idem naar de **−u**-zijde.
    pub wel_v_min_mm3: f64,
    /// De maatgevende (kleinste) van elk paar, zoals `wel_y_mm3` dat is.
    pub wel_u_mm3: f64,
    pub wel_v_mm3: f64,
    /// Traagheidsstralen om de hoofdassen.
    pub iu_radius_mm: f64,
    pub iv_radius_mm: f64,

    /// Plastische neutrale as om de zwaartepunts-y-as, als z-coördinaat in het
    /// **invoerstelsel**. Samen met `y_pna_mm` het plastisch zwaartepunt.
    pub z_pna_mm: f64,
    /// Plastische neutrale as om de zwaartepunts-z-as, als y-coördinaat in het
    /// invoerstelsel.
    pub y_pna_mm: f64,
    /// Plastisch zwaartepunt in het hoofdasstelsel, ten opzichte van het
    /// **elastische** zwaartepunt (mm).
    pub u_pna_mm: f64,
    pub v_pna_mm: f64,
    /// Plastische weerstandsmomenten om de hoofdassen (mm³).
    pub wpl_u_mm3: f64,
    pub wpl_v_mm3: f64,
    /// Vormfactoren `W_pl / W_el` met de **maatgevende** `W_el`. Rechthoek:
    /// exact 1,5; gewalst I-profiel om de sterke as ongeveer 1,13.
    pub vormfactor_y: f64,
    pub vormfactor_z: f64,
    pub vormfactor_u: f64,
    pub vormfactor_v: f64,
    /// `false` als `Wpl` niet bepaald kon worden; dan zijn alle plastische
    /// velden hierboven nul.
    pub plastisch_bepaald: bool,

    /// Monosymmetrieconstante om de y-as (mm), in de literatuur `β_x`:
    /// `β_y = ∬(y²+z²)z dA / I_y − 2·z_s`, met zwaartepuntscoördinaten.
    pub beta_y_mm: f64,
    /// Het spiegelbeeld om de z-as.
    pub beta_z_mm: f64,
    /// `z_j = z_s − 0,5·∬(y²+z²)z dA / I_y = −β_y/2` (mm) — de
    /// monosymmetrieparameter uit de kipbijlage van NEN-EN 1993-1-1. Nul voor
    /// een dubbelsymmetrische doorsnede; positief als het meeste materiaal
    /// **boven** het zwaartepunt zit.
    pub z_j_mm: f64,
    /// Het spiegelbeeld: `y_j = −β_z/2`.
    pub y_j_mm: f64,
    /// `false` als het schuifmiddelpunt niet bepaald is, of als een
    /// catalogusdeel in de samenstelling zit (dat heeft geen contour, dus geen
    /// derde momenten). Dan zijn `β` en `z_j` nul.
    pub monosymmetrie_bepaald: bool,

    /// Afschuifoppervlak voor een dwarskracht **langs de u-as** (mm²); zelfde
    /// afspraak als `av_y_mm2`, dat bij een kracht langs y hoort.
    pub av_u_mm2: f64,
    /// Idem langs de v-as.
    pub av_v_mm2: f64,
    /// `false` zodra de hoofdassen niet met `y`/`z` samenvallen: de
    /// normuitdrukkingen van EN 1993-1-1 §6.2.6(3) gelden per doorsnedesoort om
    /// de eigen assen en laten zich niet zomaar meedraaien, en een
    /// afschuifoppervlak uit de mesh lossen wij (nog) niet op. Dan zijn
    /// `av_u_mm2` en `av_v_mm2` nul in plaats van geraden.
    pub av_hoofdas_bepaald: bool,
}

#[derive(Serialize)]
struct DeelUitvoer {
    area_mm2: f64,
    y_c_mm: f64,
    z_c_mm: f64,
    h_mm: f64,
    b_mm: f64,
}

// ── De uitgebreide grootheden samenstellen ───────────────────────────────────

/// Wat elke rekenweg zélf moet aanleveren om [`Uitbreiding`] te kunnen vullen.
/// Alles wat daarna volgt — de weerstandsmomenten om de hoofdassen, de
/// vormfactoren, de afschuifoppervlakken in de hoofdrichtingen — is voor beide
/// wegen hetzelfde en staat daarom in [`bouw_uitbreiding`].
struct Bouwstenen {
    /// `(buitenomtrek, gatomtrek)`; `None` als er geen contour is om langs te
    /// lopen (lamellenmodel).
    omtrekken: Option<(f64, f64)>,
    qy_mm3: f64,
    qz_mm3: f64,
    /// Uitersten in het hoofdasstelsel, ten opzichte van het zwaartepunt.
    hoofdas_uitersten: (f64, f64, f64, f64),
    /// Plastische neutrale assen in het invoerstelsel.
    z_pna_mm: f64,
    y_pna_mm: f64,
    plastisch: PlastischHoofdas,
    plastisch_bepaald: bool,
    mono: Monosymmetrie,
    monosymmetrie_bepaald: bool,
}

/// De hoek waaronder de hoofdassen nog als "samenvallend met y en z" gelden.
/// Voor elke catalogusvorm en voor elke samenstelling met een symmetrieas is
/// `Iyz` exact nul en komt `α` op precies 0 of ±π/2 uit; deze marge vangt
/// alleen de afrondingsruis op.
const HOOFDAS_TOLERANTIE_RAD: f64 = 1e-6;

fn bouw_uitbreiding(
    p: &crate::SectionProperties,
    dichtheid_kg_m3: f64,
    b: Bouwstenen,
) -> Uitbreiding {
    let hoofdas = Hoofdas::uit_uitersten(b.hoofdas_uitersten, p.iu_mm4, p.iv_mm4, p.area_mm2);

    // Afschuifoppervlakken in de hoofdrichtingen. De uitdrukkingen van
    // EN 1993-1-1 §6.2.6(3) staan per doorsnedesoort om de eigen assen; ze laten
    // zich niet meedraaien, en een afschuifoppervlak uit de mesh lossen wij niet
    // op. Vallen de hoofdassen met y en z samen — wat voor elk catalogusprofiel
    // geldt — dan is het antwoord er wél; anders melden we dat het niet bepaald
    // is in plaats van een getal te verzinnen.
    let alpha = p.alpha_hoofdas_rad;
    let (av_u, av_v, av_bepaald) = if alpha.abs() < HOOFDAS_TOLERANTIE_RAD {
        // u ∥ y en v ∥ z.
        (p.av_y_mm2, p.av_z_mm2, true)
    } else if (alpha.abs() - std::f64::consts::FRAC_PI_2).abs() < HOOFDAS_TOLERANTIE_RAD {
        // u ∥ ±z en v ∥ ∓y: de sterke hoofdas is de z-as.
        (p.av_z_mm2, p.av_y_mm2, true)
    } else {
        (0.0, 0.0, false)
    };

    let pl = b.plastisch;
    Uitbreiding {
        omtrek_mm: b.omtrekken.map_or(0.0, |(buiten, _)| buiten),
        omtrek_gaten_mm: b.omtrekken.map_or(0.0, |(_, gaten)| gaten),
        omtrek_bepaald: b.omtrekken.is_some(),
        dichtheid_kg_m3,
        massa_kg_per_m: massa_kg_per_m(p.area_mm2, dichtheid_kg_m3),
        qy_mm3: b.qy_mm3,
        qz_mm3: b.qz_mm3,
        u_min_mm: hoofdas.u_min_mm,
        u_max_mm: hoofdas.u_max_mm,
        v_min_mm: hoofdas.v_min_mm,
        v_max_mm: hoofdas.v_max_mm,
        wel_u_plus_mm3: hoofdas.wel_u_plus_mm3,
        wel_u_min_mm3: hoofdas.wel_u_min_mm3,
        wel_v_plus_mm3: hoofdas.wel_v_plus_mm3,
        wel_v_min_mm3: hoofdas.wel_v_min_mm3,
        wel_u_mm3: hoofdas.wel_u_mm3,
        wel_v_mm3: hoofdas.wel_v_mm3,
        iu_radius_mm: hoofdas.iu_radius_mm,
        iv_radius_mm: hoofdas.iv_radius_mm,
        z_pna_mm: if b.plastisch_bepaald { b.z_pna_mm } else { 0.0 },
        y_pna_mm: if b.plastisch_bepaald { b.y_pna_mm } else { 0.0 },
        u_pna_mm: pl.u_pna_mm,
        v_pna_mm: pl.v_pna_mm,
        wpl_u_mm3: pl.wpl_u_mm3,
        wpl_v_mm3: pl.wpl_v_mm3,
        vormfactor_y: vormfactor(p.wpl_y_mm3, p.wel_y_mm3),
        vormfactor_z: vormfactor(p.wpl_z_mm3, p.wel_z_mm3),
        vormfactor_u: vormfactor(pl.wpl_u_mm3, hoofdas.wel_u_mm3),
        vormfactor_v: vormfactor(pl.wpl_v_mm3, hoofdas.wel_v_mm3),
        plastisch_bepaald: b.plastisch_bepaald,
        beta_y_mm: b.mono.beta_y_mm,
        beta_z_mm: b.mono.beta_z_mm,
        z_j_mm: b.mono.z_j_mm,
        y_j_mm: b.mono.y_j_mm,
        monosymmetrie_bepaald: b.monosymmetrie_bepaald,
        av_u_mm2: av_u,
        av_v_mm2: av_v,
        av_hoofdas_bepaald: av_bepaald,
    }
}

/// De soortelijke massa uit de invoer, of staal als er niets bruikbaars staat.
fn dichtheid_van(i: &Invoer) -> f64 {
    match i.dichtheid_kg_m3 {
        Some(d) if d > 0.0 => d,
        _ => DICHTHEID_STAAL_KG_M3,
    }
}

// ── Vormen ────────────────────────────────────────────────────────────────────

fn vorm_van_maten(soort: &str, h: f64, b: f64, tw: f64, tf: f64, t: f64, r: f64) -> Result<Profielvorm, String> {
    let dikte = if t > 0.0 { t } else { tw };
    Ok(match soort {
        "ISection" => Profielvorm::IProfiel { h, b, tw, tf, r },
        // Toelopende flenzen (INP, DIN 1025-1).
        "ISectionSchuin" => Profielvorm::IProfielSchuin { h, b, tw, tf, r },
        // Evenwijdige flenzen (UPE, DIN 1026-2).
        "Channel" => Profielvorm::UProfiel { h, b, tw, tf, r },
        // Toelopende flenzen (UNP, DIN 1026-1).
        "ChannelSchuin" => Profielvorm::UProfielSchuin { h, b, tw, tf, r },
        "Shs" | "Rhs" => Profielvorm::Koker { h, b, t: dikte },
        "Chs" => Profielvorm::Buis { d: h, t: dikte },
        "Rechthoek" => Profielvorm::Rechthoek { h, b },
        anders => return Err(format!("onbekende soort: {anders}")),
    })
}

fn vorm_van(i: &Invoer) -> Result<Profielvorm, String> {
    vorm_van_maten(&i.soort, i.h, i.b, i.tw, i.tf, i.t, i.r)
}

/// De vijf maatvelden zoals `SectionProperties` ze administreert — dezelfde
/// afspraak als `motor::bereken_uitgebreid`: de invoermaten, niet uit de
/// contour teruggerekend. Bij een koker is `r` de buitenhoekstraal 1,5·t.
fn maten_van(vorm: &Profielvorm) -> (f64, f64, f64, f64, f64) {
    match *vorm {
        Profielvorm::IProfiel { h, b, tw, tf, r }
        | Profielvorm::IProfielSchuin { h, b, tw, tf, r }
        | Profielvorm::UProfiel { h, b, tw, tf, r }
        | Profielvorm::UProfielSchuin { h, b, tw, tf, r } => (h, b, tw, tf, r),
        Profielvorm::Koker { h, b, t } => (h, b, t, t, 1.5 * t),
        Profielvorm::Buis { d, t } => (d, d, t, t, 0.0),
        Profielvorm::Rechthoek { h, b } => (h, b, b, h, 0.0),
    }
}

fn is_gesloten(vorm: &Profielvorm) -> bool {
    matches!(*vorm, Profielvorm::Koker { .. } | Profielvorm::Buis { .. })
}

/// De contour van een gat, tegen de klok in; `met_gat` keert hem om.
fn gat_contour(g: &GatInvoer) -> Result<Contour, String> {
    match g.vorm.as_str() {
        "rond" => {
            if !(g.d > 0.0) {
                return Err("rond gat zonder positieve diameter".into());
            }
            Ok(Contour::cirkel((g.y, g.z), g.d / 2.0))
        }
        "rechthoek" => {
            if !(g.b > 0.0 && g.h > 0.0) {
                return Err("rechthoekig gat zonder positieve breedte en hoogte".into());
            }
            // Om het eigen middelpunt bouwen, draaien, dan pas verschuiven:
            // `gedraaid` draait om de oorsprong.
            let hoek = g.hoek_graden.to_radians();
            Ok(Contour::rechthoek(-g.b / 2.0, -g.h / 2.0, g.b, g.h)
                .gedraaid(hoek)
                .verschoven(g.y, g.z))
        }
        anders => Err(format!("onbekende gatvorm: {anders} (verwacht \"rond\" of \"rechthoek\")")),
    }
}

// ── Rekenen ───────────────────────────────────────────────────────────────────

// ── Uitsnede: exact boolean verschil "doorsnede min rechthoek" ───────────────
//
// Een gat dóór een plaat (lijf, flens, wand) laat in het doorsnedevlak een
// spleet over de volle plaatdikte achter. Zo'n spleet als extra gatcontour
// opgeven zou randen opleveren die samenvallen met de plaatvlakken, en daar
// loopt de mesher van de torsieoplossing op vast. Daarom wordt de rechthoek
// hier écht uit de contour gesneden:
//
//  1. elk randsegment van de doorsnede wordt op de vier rechthoeklijnen
//     gesplitst; de stukken buiten de rechthoek blijven;
//  2. de rechthoekranden worden op de doorsnederand gesplitst; de stukken die
//     door materiaal lopen komen erbij, met de klok mee (materiaal links);
//  3. alle stukken worden op hun eindpunten weer tot gesloten contouren
//     geregen.
//
// Alles werkt op de exacte segmenten (lijn en cirkelboog), dus de uitkomst is
// even exact als de invoer. De classificatie "binnen/buiten" gebeurt op het
// middelpunt van elk stuk, een haartje naar de materiaalzijde verschoven,
// zodat ook een stuk dat toevallig óp een rechthoekrand ligt goed valt.

/// Windingsgetal van punt `p` ten opzichte van alle contouren: ≠ 0 = in het
/// materiaal. Straal naar +y; per segment de getekende kruisingen.
fn windingsgetal(d: &Doorsnede, p: (f64, f64)) -> i32 {
    let mut w = 0;
    for c in &d.contouren {
        for s in &c.segmenten {
            w += kruisingen(s, p);
        }
    }
    w
}

fn kruisingen(s: &Segment, p: (f64, f64)) -> i32 {
    match *s {
        Segment::Lijn { van, naar } => {
            let (y1, z1) = van;
            let (y2, z2) = naar;
            // Links van de gerichte lijn?
            let links = (y2 - y1) * (p.1 - z1) - (p.0 - y1) * (z2 - z1);
            if z1 <= p.1 {
                if z2 > p.1 && links > 0.0 {
                    return 1;
                }
            } else if z2 <= p.1 && links < 0.0 {
                return -1;
            }
            0
        }
        Segment::Boog { centrum, straal, theta1, theta2 } => {
            let dz = p.1 - centrum.1;
            if straal <= 0.0 || dz.abs() >= straal {
                return 0;
            }
            let dy = (straal * straal - dz * dz).sqrt();
            let richting = if theta2 >= theta1 { 1.0 } else { -1.0 };
            let (lo, hi) = (theta1.min(theta2), theta1.max(theta2));
            let mut w = 0;
            for y in [centrum.0 + dy, centrum.0 - dy] {
                if y <= p.0 {
                    continue;
                }
                let t = dz.atan2(y - centrum.0);
                if !hoek_in_bereik(t, lo, hi) {
                    continue;
                }
                // dz/ds langs de doorlooprichting = richting · cos θ.
                let omhoog = richting * t.cos() > 0.0;
                w += if omhoog { 1 } else { -1 };
            }
            w
        }
    }
}

/// Ligt hoek `t` (modulo 2π) strikt binnen `(lo, hi)`?
fn hoek_in_bereik(t: f64, lo: f64, hi: f64) -> bool {
    (-3..=3).any(|k| {
        let tk = t + k as f64 * std::f64::consts::TAU;
        tk > lo && tk < hi
    })
}

fn middelpunt(s: &Segment) -> (f64, f64) {
    match *s {
        Segment::Lijn { van, naar } => ((van.0 + naar.0) / 2.0, (van.1 + naar.1) / 2.0),
        Segment::Boog { centrum, straal, theta1, theta2 } => {
            let t = 0.5 * (theta1 + theta2);
            (centrum.0 + straal * t.cos(), centrum.1 + straal * t.sin())
        }
    }
}

/// Eenheidsnormaal naar links van de doorlooprichting, in het middelpunt.
fn linkernormaal(s: &Segment) -> (f64, f64) {
    match *s {
        Segment::Lijn { van, naar } => {
            let (dy, dz) = (naar.0 - van.0, naar.1 - van.1);
            let l = dy.hypot(dz).max(1e-300);
            (-dz / l, dy / l)
        }
        Segment::Boog { theta1, theta2, .. } => {
            let t = 0.5 * (theta1 + theta2);
            let r = if theta2 >= theta1 { 1.0 } else { -1.0 };
            // Raakrichting r·(−sin t, cos t); links daarvan is r·(−cos t, −sin t).
            (-r * t.cos(), -r * t.sin())
        }
    }
}

/// Splits een segment op de lijnen `y = y1`, `y = y2`, `z = z1`, `z = z2`.
fn splits_op_rechthoeklijnen(s: &Segment, y1: f64, y2: f64, z1: f64, z2: f64) -> Vec<Segment> {
    match *s {
        Segment::Lijn { van, naar } => {
            let (a, b) = (naar.0 - van.0, naar.1 - van.1);
            let mut ts: Vec<f64> = Vec::new();
            if a != 0.0 {
                for c in [y1, y2] {
                    let t = (c - van.0) / a;
                    if t > 0.0 && t < 1.0 {
                        ts.push(t);
                    }
                }
            }
            if b != 0.0 {
                for c in [z1, z2] {
                    let t = (c - van.1) / b;
                    if t > 0.0 && t < 1.0 {
                        ts.push(t);
                    }
                }
            }
            ts.sort_by(|p, q| p.partial_cmp(q).unwrap_or(std::cmp::Ordering::Equal));
            ts.dedup_by(|p, q| (*p - *q).abs() < 1e-12);
            let mut uit = Vec::with_capacity(ts.len() + 1);
            let mut vorige = van;
            for t in ts {
                let p = (van.0 + t * a, van.1 + t * b);
                uit.push(Segment::Lijn { van: vorige, naar: p });
                vorige = p;
            }
            uit.push(Segment::Lijn { van: vorige, naar });
            uit
        }
        Segment::Boog { centrum, straal, theta1, theta2 } => {
            let (lo, hi) = (theta1.min(theta2), theta1.max(theta2));
            let mut ts: Vec<f64> = Vec::new();
            let mut voeg_toe = |t0: f64| {
                for k in -3..=3 {
                    let t = t0 + k as f64 * std::f64::consts::TAU;
                    if t > lo && t < hi {
                        ts.push(t);
                    }
                }
            };
            for c in [y1, y2] {
                let k = (c - centrum.0) / straal;
                if k.abs() < 1.0 {
                    let a = k.acos();
                    voeg_toe(a);
                    voeg_toe(-a);
                }
            }
            for c in [z1, z2] {
                let k = (c - centrum.1) / straal;
                if k.abs() < 1.0 {
                    let a = k.asin();
                    voeg_toe(a);
                    voeg_toe(std::f64::consts::PI - a);
                }
            }
            // In doorlooprichting sorteren.
            if theta2 >= theta1 {
                ts.sort_by(|p, q| p.partial_cmp(q).unwrap_or(std::cmp::Ordering::Equal));
            } else {
                ts.sort_by(|p, q| q.partial_cmp(p).unwrap_or(std::cmp::Ordering::Equal));
            }
            ts.dedup_by(|p, q| (*p - *q).abs() < 1e-12);
            let mut uit = Vec::with_capacity(ts.len() + 1);
            let mut vorige = theta1;
            for t in ts {
                uit.push(Segment::Boog { centrum, straal, theta1: vorige, theta2: t });
                vorige = t;
            }
            uit.push(Segment::Boog { centrum, straal, theta1: vorige, theta2 });
            uit
        }
    }
}

/// Snijpunten van een segment met de lijn `y = c` (verticaal = true) of
/// `z = c`, als parameters langs die lijn (de andere coördinaat).
fn snijpunten_met_lijn(s: &Segment, c: f64, verticaal: bool) -> Vec<f64> {
    let mut uit = Vec::new();
    match *s {
        Segment::Lijn { van, naar } => {
            let (p0, p1, q0, q1) = if verticaal {
                (van.0, naar.0, van.1, naar.1)
            } else {
                (van.1, naar.1, van.0, naar.0)
            };
            let a = p1 - p0;
            if a != 0.0 {
                let t = (c - p0) / a;
                if t > 0.0 && t < 1.0 {
                    uit.push(q0 + t * (q1 - q0));
                }
            }
        }
        Segment::Boog { centrum, straal, theta1, theta2 } => {
            let (lo, hi) = (theta1.min(theta2), theta1.max(theta2));
            let k = if verticaal { (c - centrum.0) / straal } else { (c - centrum.1) / straal };
            if k.abs() < 1.0 {
                let kandidaten = if verticaal {
                    let a = k.acos();
                    [a, -a]
                } else {
                    let a = k.asin();
                    [a, std::f64::consts::PI - a]
                };
                for t0 in kandidaten {
                    if hoek_in_bereik(t0, lo, hi) {
                        uit.push(if verticaal {
                            centrum.1 + straal * t0.sin()
                        } else {
                            centrum.0 + straal * t0.cos()
                        });
                    }
                }
            }
        }
    }
    uit
}

/// Afstand van punt `p` tot een segment.
fn afstand_tot_segment(s: &Segment, p: (f64, f64)) -> f64 {
    match *s {
        Segment::Lijn { van, naar } => {
            let (ay, az) = (naar.0 - van.0, naar.1 - van.1);
            let l2 = ay * ay + az * az;
            if l2 <= 0.0 {
                return (p.0 - van.0).hypot(p.1 - van.1);
            }
            let t = (((p.0 - van.0) * ay + (p.1 - van.1) * az) / l2).clamp(0.0, 1.0);
            (p.0 - van.0 - t * ay).hypot(p.1 - van.1 - t * az)
        }
        Segment::Boog { centrum, straal, theta1, theta2 } => {
            let (dy, dz) = (p.0 - centrum.0, p.1 - centrum.1);
            let t = dz.atan2(dy);
            let (lo, hi) = (theta1.min(theta2), theta1.max(theta2));
            if hoek_in_bereik(t, lo, hi) {
                (dy.hypot(dz) - straal).abs()
            } else {
                let a = s.beginpunt();
                let b = s.eindpunt();
                (p.0 - a.0).hypot(p.1 - a.1).min((p.0 - b.0).hypot(p.1 - b.1))
            }
        }
    }
}

/// Ligt `p` (binnen `tol`) op de rand van de doorsnede?
fn op_rand(d: &Doorsnede, p: (f64, f64), tol: f64) -> bool {
    d.contouren
        .iter()
        .flat_map(|c| c.segmenten.iter())
        .any(|s| afstand_tot_segment(s, p) <= tol)
}

/// Karakteristieke maat van de doorsnede, voor toleranties.
fn schaal_van(d: &Doorsnede) -> f64 {
    let (y0, y1, z0, z1) = d.uitersten();
    (y1 - y0).max(z1 - z0).max(1.0)
}

/// Lengte van een segment (mm).
fn lengte(s: &Segment) -> f64 {
    match *s {
        Segment::Lijn { van, naar } => (naar.0 - van.0).hypot(naar.1 - van.1),
        Segment::Boog { straal, theta1, theta2, .. } => straal * (theta2 - theta1).abs(),
    }
}

/// Rijg losse stukken (materiaal links) tot gesloten contouren.
///
/// Ontaarde stukken (korter dan de tolerantie) vallen eerst af: de
/// contourbouwer sluit een boog soms met een lijntje van 10⁻¹⁵ mm, en een
/// splitsing vlak bij een boogeinde geeft net zo'n stukje. Die zouden anders
/// elk als "gesloten contour" op zichzelf worden gezien.
fn rijg(mut stukken: Vec<Segment>, tol: f64) -> Result<Vec<Contour>, String> {
    stukken.retain(|s| lengte(s) > tol);
    let dichtbij = |a: (f64, f64), b: (f64, f64)| (a.0 - b.0).abs() <= tol && (a.1 - b.1).abs() <= tol;
    let mut contouren = Vec::new();
    while let Some(eerste) = stukken.pop() {
        let start = eerste.beginpunt();
        let mut huidig = eerste.eindpunt();
        let mut lus = vec![eerste];
        while !dichtbij(huidig, start) {
            let idx = stukken.iter().position(|s| dichtbij(s.beginpunt(), huidig));
            let Some(idx) = idx else {
                if std::env::var_os("DOORSNEDEMOTOR_DEBUG").is_some() {
                    eprintln!("open eind op ({:.6}, {:.6}); lus tot nu toe:", huidig.0, huidig.1);
                    for s in &lus {
                        eprintln!("  {:?} -> {:?}", s.beginpunt(), s.eindpunt());
                    }
                    eprintln!("overige stukken:");
                    for s in &stukken {
                        eprintln!("  {:?} -> {:?}", s.beginpunt(), s.eindpunt());
                    }
                }
                return Err(format!(
                    "uitsnede: de contour sluit niet bij ({:.3}, {:.3}) — ligt de rechthoek precies op een hoekpunt of raaklijn van het profiel? Verschuif hem een fractie.",
                    huidig.0, huidig.1
                ));
            };
            let s = stukken.swap_remove(idx);
            huidig = s.eindpunt();
            lus.push(s);
        }
        contouren.push(Contour { segmenten: lus });
    }
    Ok(contouren)
}

/// Rechthoek `[−hb, hb] × [−hh, hh]` om de oorsprong uit `d` snijden.
fn uitsnede_asgelijnd(d: &Doorsnede, hb: f64, hh: f64) -> Result<Doorsnede, String> {
    let (y1, y2, z1, z2) = (-hb, hb, -hh, hh);
    let schaal = schaal_van(d).max(2.0 * hb).max(2.0 * hh);
    let delta = 1e-7 * schaal;
    let binnen_open = |p: (f64, f64)| p.0 > y1 && p.0 < y2 && p.1 > z1 && p.1 < z2;

    let mut stukken: Vec<Segment> = Vec::new();

    // 1. Randstukken van de doorsnede buiten de rechthoek.
    for c in &d.contouren {
        for s in &c.segmenten {
            for deel in splits_op_rechthoeklijnen(s, y1, y2, z1, z2) {
                let m = middelpunt(&deel);
                let n = linkernormaal(&deel);
                let proef = (m.0 + delta * n.0, m.1 + delta * n.1);
                if !binnen_open(proef) {
                    stukken.push(deel);
                }
            }
        }
    }

    // 2. Rechthoekranden door materiaal, met de klok mee: linksonder → linksboven
    //    → rechtsboven → rechtsonder → linksonder.
    let hoeken = [(y1, z1), (y1, z2), (y2, z2), (y2, z1)];
    for k in 0..4 {
        let van = hoeken[k];
        let naar = hoeken[(k + 1) % 4];
        let verticaal = van.0 == naar.0;
        let c = if verticaal { van.0 } else { van.1 };
        // Snijpunten met de doorsnederand, als coördinaat langs de rand — plus
        // de hoekpunten van de doorsnede die óp deze lijn liggen: daar kan de
        // rand net zo goed van materiaal naar leegte wisselen (bijvoorbeeld
        // wanneer een eerdere uitsnede al langs dezelfde lijn is gemaakt).
        let mut punten: Vec<f64> = Vec::new();
        for con in &d.contouren {
            for s in &con.segmenten {
                punten.extend(snijpunten_met_lijn(s, c, verticaal));
                for p in [s.beginpunt(), s.eindpunt()] {
                    let (langs, dwars) = if verticaal { (p.1, p.0) } else { (p.0, p.1) };
                    if (dwars - c).abs() <= delta {
                        punten.push(langs);
                    }
                }
            }
        }
        let (p0, p1) = if verticaal { (van.1, naar.1) } else { (van.0, naar.0) };
        let (lo, hi) = (p0.min(p1), p0.max(p1));
        punten.retain(|&p| p > lo && p < hi);
        if p1 >= p0 {
            punten.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        } else {
            punten.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
        }
        punten.dedup_by(|a, b| (*a - *b).abs() <= delta);
        let mut grenzen = vec![p0];
        grenzen.extend(punten);
        grenzen.push(p1);
        for w in grenzen.windows(2) {
            let (a, b) = (w[0], w[1]);
            if (b - a).abs() <= delta {
                continue;
            }
            let (pa, pb) = if verticaal { ((c, a), (c, b)) } else { ((a, c), (b, c)) };
            let seg = Segment::Lijn { van: pa, naar: pb };
            let m = middelpunt(&seg);
            // Een stuk dat samenvalt met een bestaande rand hoort er niet nóg
            // een keer bij; die rand is in stap 1 al goed of fout gevallen.
            if op_rand(d, m, delta) {
                continue;
            }
            let n = linkernormaal(&seg);
            let proef = (m.0 + delta * n.0, m.1 + delta * n.1);
            if windingsgetal(d, proef) != 0 {
                stukken.push(seg);
            }
        }
    }

    // 3. Rijgen.
    let contouren = rijg(stukken, 1e-7 * schaal)?;
    Ok(Doorsnede { contouren })
}

/// Snij een (gedraaide) rechthoek met middelpunt `(y, z)`, breedte `b` langs
/// de eigen as en hoogte `h`, gedraaid over `hoek` (rad), exact uit `d`.
fn uitsnede(d: &Doorsnede, y: f64, z: f64, b: f64, h: f64, hoek: f64) -> Result<Doorsnede, String> {
    // Naar het stelsel waarin de rechthoek asgelijnd om de oorsprong ligt.
    let lokaal = d.verschoven(-y, -z).gedraaid(-hoek);
    let uit = uitsnede_asgelijnd(&lokaal, b / 2.0, h / 2.0)?;
    Ok(uit.gedraaid(hoek).verschoven(y, z))
}

/// Ligt een langsgat volledig in het materiaal? Getest op een puntenrij
/// langs zijn rand (eindpunten en tussenpunten van elk segment).
fn gat_binnen_materiaal(basis: &Doorsnede, gat: &Contour) -> bool {
    for s in &gat.segmenten {
        let punten: Vec<(f64, f64)> = match *s {
            Segment::Lijn { van, naar } => (0..=4)
                .map(|k| {
                    let t = k as f64 / 4.0;
                    (van.0 + t * (naar.0 - van.0), van.1 + t * (naar.1 - van.1))
                })
                .collect(),
            Segment::Boog { centrum, straal, theta1, theta2 } => (0..=8)
                .map(|k| {
                    let t = theta1 + (theta2 - theta1) * k as f64 / 8.0;
                    (centrum.0 + straal * t.cos(), centrum.1 + straal * t.sin())
                })
                .collect(),
        };
        if punten.iter().any(|&p| windingsgetal(basis, p) == 0) {
            return false;
        }
    }
    true
}

/// Catalogusvorm, al dan niet met gaten: exacte contourkern + numerieke torsie.
fn reken_contour(i: &Invoer) -> Result<Uitvoer, String> {
    let vorm = vorm_van(i)?;
    let basis: Doorsnede = vorm.doorsnede();
    let a_basis = basis.bereken().a_mm2;
    let mut d = basis.clone();
    // Eerst de uitsneden (die de contour herschrijven), dan de langsgaten.
    for g in i.gaten.iter().filter(|g| g.plaats == "uitsnede") {
        if !(g.b > 0.0 && g.h > 0.0) {
            return Err("uitsnede zonder positieve breedte en hoogte".into());
        }
        d = uitsnede(&d, g.y, g.z, g.b, g.h, g.hoek_graden.to_radians())?;
    }
    for g in i.gaten.iter().filter(|g| g.plaats != "uitsnede") {
        if g.plaats != "vlak" {
            return Err(format!("onbekende gatplaats: {} (verwacht \"vlak\" of \"uitsnede\")", g.plaats));
        }
        let c = gat_contour(g)?;
        if !gat_binnen_materiaal(&d, &c) {
            return Err("een langsgat ligt (deels) buiten het materiaal".into());
        }
        d = d.met_gat(c);
    }
    let a_gaten = (a_basis - d.bereken().a_mm2).max(0.0);
    if d.bereken().a_mm2 <= 0.0 {
        return Err("de doorsnede heeft geen oppervlak over: de gaten zijn groter dan het profiel".into());
    }

    let per_wand = i.elementen_per_wand.unwrap_or(crate::torsie::ELEMENTEN_PER_WAND);
    let opties = TorsieOpties::met_h(aanbevolen_h(&d, per_wand));

    let m = if i.gaten.is_empty() {
        // Letterlijk het oude pad, zodat de generator bit-identiek blijft.
        motor::bereken_uitgebreid(&vorm, Some(opties))
    } else {
        let mut m = motor::bereken_doorsnede_uitgebreid(&d, Afschuiving::AlsVorm(vorm), Some(opties));
        // Zelfde administratie als `bereken_uitgebreid`: de maatvelden
        // beschrijven de invoergeometrie (nodig voor de classificatie
        // volgens tabel 5.2 in de toetsing), en een gesloten vorm krijgt
        // geen welvingsstijfheid.
        let (h, b, tw, tf, r) = maten_van(&vorm);
        m.props.h_mm = h;
        m.props.b_mm = b;
        m.props.tw_mm = tw;
        m.props.tf_mm = tf;
        m.props.r_mm = r;
        if is_gesloten(&vorm) {
            m.props.iw_mm6 = 0.0;
        }
        m
    };
    let p = m.props;
    let t = m.torsie;
    let e = m.contour;
    // De mesh alleen voor de kwaliteitsmaat opnieuw opbouwen; dat is dezelfde
    // mesh, want `genereer` is deterministisch in `h`.
    let mesh = crate::mesh2d::genereer(&d, t.h_mm);

    let a_mesh_afwijking = if p.area_mm2 > 0.0 { (t.a_mesh_mm2 - p.area_mm2) / p.area_mm2 } else { 0.0 };

    let mut meldingen = Vec::new();
    if !i.gaten.is_empty() && a_mesh_afwijking.abs() > 0.01 {
        meldingen.push(format!(
            "het meshoppervlak wijkt {:.1} % af van de exacte contour: ligt een gat (deels) buiten het materiaal of overlappen gaten elkaar?",
            a_mesh_afwijking * 100.0
        ));
    }
    if t.losse_delen {
        meldingen.push("de doorsnede bestaat uit losse delen: Iw en het schuifmiddelpunt zijn betekenisloos (0 resp. zwaartepunt aangehouden)".into());
    }

    // ── Uitgebreide grootheden ────────────────────────────────────────────────
    // Alles wat uit de contour volgt is hier exact; alleen de
    // monosymmetrieconstante leunt op het schuifmiddelpunt en dus op de mesh.
    let mono_bepaald = !t.losse_delen;
    let mono = if mono_bepaald {
        monosymmetrie_van_doorsnede(&d, &e, p.y_s_mm, p.z_s_mm)
    } else {
        meldingen.push(
            "z_j en β zijn niet bepaald: zonder samenhangende doorsnede is er geen schuifmiddelpunt"
                .into(),
        );
        Monosymmetrie::default()
    };
    let uitbreiding = bouw_uitbreiding(
        &p,
        dichtheid_van(i),
        Bouwstenen {
            omtrekken: Some(d.omtrekken_mm()),
            qy_mm3: e.sy_mm3,
            qz_mm3: e.sz_mm3,
            hoofdas_uitersten: hoofdas_uitersten(&d, &e),
            z_pna_mm: e.z_pna_mm,
            y_pna_mm: e.y_pna_mm,
            plastisch: plastisch_hoofdas(&d, e.alpha_hoofdas_rad),
            plastisch_bepaald: true,
            mono,
            monosymmetrie_bepaald: mono_bepaald,
        },
    );
    if !uitbreiding.av_hoofdas_bepaald {
        meldingen.push(
            "Av;u en Av;v zijn niet bepaald: de hoofdassen vallen niet met y en z samen, en de \
             normregel van EN 1993-1-1 §6.2.6(3) laat zich niet meedraaien"
                .into(),
        );
    }

    Ok(Uitvoer {
        naam: i.naam.clone(),
        soort: i.soort.clone(),
        area_mm2: p.area_mm2,
        iy_mm4: p.iy_mm4,
        iz_mm4: p.iz_mm4,
        wel_y_mm3: p.wel_y_mm3,
        wel_z_mm3: p.wel_z_mm3,
        wpl_y_mm3: p.wpl_y_mm3,
        wpl_z_mm3: p.wpl_z_mm3,
        av_y_mm2: p.av_y_mm2,
        av_z_mm2: p.av_z_mm2,
        it_mm4: p.it_mm4,
        iw_mm6: p.iw_mm6,
        iy_radius_mm: p.iy_radius_mm,
        iz_radius_mm: p.iz_radius_mm,
        h_mm: p.h_mm,
        b_mm: p.b_mm,
        tw_mm: p.tw_mm,
        tf_mm: p.tf_mm,
        r_mm: p.r_mm,
        y_c_mm: p.y_c_mm,
        z_c_mm: p.z_c_mm,
        wel_y_top_mm3: p.wel_y_top_mm3,
        wel_y_bot_mm3: p.wel_y_bot_mm3,
        wel_z_left_mm3: p.wel_z_left_mm3,
        wel_z_right_mm3: p.wel_z_right_mm3,
        iyz_mm4: p.iyz_mm4,
        iu_mm4: p.iu_mm4,
        iv_mm4: p.iv_mm4,
        alpha_hoofdas_rad: p.alpha_hoofdas_rad,
        y_s_mm: p.y_s_mm,
        z_s_mm: p.z_s_mm,
        it_ondergrens_mm4: t.it_ondergrens_mm4,
        it_bovengrens_mm4: t.it_bovengrens_mm4,
        it_onzekerheid: t.it_onzekerheid,
        a_mesh_mm2: t.a_mesh_mm2,
        a_mesh_afwijking,
        h_mesh_mm: t.h_mm,
        driehoeken: t.driehoeken,
        kleinste_hoek_graden: mesh.kleinste_hoek_graden(),
        tijd_ms: t.tijd_ms,
        losse_delen: t.losse_delen,
        methode: "contour".into(),
        wpl_bepaald: true,
        iw_bepaald: !t.losse_delen,
        schuifmiddelpunt_bepaald: !t.losse_delen,
        a_gaten_mm2: a_gaten,
        y_min_mm: e.y_min_mm,
        y_max_mm: e.y_max_mm,
        z_min_mm: e.z_min_mm,
        z_max_mm: e.z_max_mm,
        delen: Vec::new(),
        meldingen,
        uitbreiding,
    })
}

/// Samenstelling uit lamellen, catalogusdelen en gesloten cellen: de
/// dunwandige rekengang van `composite.rs`.
fn reken_samenstelling(i: &Invoer) -> Result<Uitvoer, String> {
    let start = Instant::now();
    let mut sec = CompositeSection::nieuw();
    for l in &i.lamellen {
        if !(l.b_mm > 0.0 && l.t_mm > 0.0) {
            return Err("lamel zonder positieve breedte en dikte".into());
        }
        sec = sec.met_lamel(Lamella {
            b_mm: l.b_mm,
            t_mm: l.t_mm,
            y_mm: l.y_mm,
            z_mm: l.z_mm,
            alpha_rad: l.alpha_rad,
        });
    }
    let mut delen = Vec::with_capacity(i.catalogusdelen.len());
    for d in &i.catalogusdelen {
        let vorm = vorm_van_maten(&d.soort, d.h, d.b, d.tw, d.tf, d.t, d.r)?;
        // Het deel zelf door de motor: exacte contour + numerieke torsie, met
        // het zwaartepunt in het eigen beschrijvingsassenstelsel — precies
        // wat `CatalogusDeel` nodig heeft om zijn uitersten te kennen.
        let props = motor::bereken(&vorm);
        delen.push(DeelUitvoer {
            area_mm2: props.area_mm2,
            y_c_mm: props.y_c_mm,
            z_c_mm: props.z_c_mm,
            h_mm: props.h_mm,
            b_mm: props.b_mm,
        });
        let mut deel = CatalogusDeel::nieuw(props, d.y_mm, d.z_mm).draai(d.alpha_rad);
        if d.gespiegeld {
            deel = deel.spiegel();
        }
        sec = sec.met_deel(deel);
    }
    for c in &i.gesloten_cellen {
        if c.midlijn.len() < 3 || c.dikte_mm.len() != c.midlijn.len() {
            return Err("gesloten cel: minstens drie middellijnpunten en per zijde één dikte".into());
        }
        sec = sec.met_cel(GeslotenCel {
            midlijn_mm: c.midlijn.iter().map(|p| (p[0], p[1])).collect(),
            dikte_mm: c.dikte_mm.clone(),
            lamellen: c.lamellen.clone(),
        });
    }
    if sec.lamellen.is_empty() && sec.delen.is_empty() {
        return Err("samenstelling zonder lamellen en zonder catalogusdelen".into());
    }

    let r = sec.bereken();
    let p = r.props;

    let mut meldingen = Vec::new();
    if !r.wpl_bepaald {
        meldingen.push("Wpl is niet bepaald: een catalogusdeel laat zich niet op de plastische neutrale as doorsnijden (0 aangehouden)".into());
    }
    if !r.iw_bepaald {
        meldingen.push("Iw is niet sectorieel bepaald (gesloten cel, catalogusdeel of niet-samenhangende middellijn); 0 aangehouden".into());
    }
    if !r.schuifmiddelpunt_bepaald {
        meldingen.push("het schuifmiddelpunt is niet bepaald; het zwaartepunt is aangehouden".into());
    }
    if !sec.lamellen.is_empty() && sec.cellen.is_empty() && !r.iw_bepaald && sec.delen.is_empty() {
        meldingen.push("de lamellen sluiten mogelijk een cel zonder dat die is gedeclareerd: It is met de open formule ⅓·Σb·t³ bepaald".into());
    }
    if !r.monosymmetrie_bepaald {
        meldingen.push(
            "z_j en β zijn niet bepaald: dat vraagt een doorsnede die volledig uit lamellen \
             bestaat, met een sectorieel gevonden schuifmiddelpunt"
                .into(),
        );
    }

    // Een lamellenmodel is een SOM van platen, geen vereniging: de platen
    // overlappen elkaar bij de lasnaden en een catalogusdeel heeft helemaal
    // geen contour. Er is dus geen buitenrand om langs te lopen, en dan is de
    // omtrek niet bepaald in plaats van "de som van de plaatomtrekken".
    meldingen.push(
        "de omtrek is voor een samenstelling niet bepaald: overlappende platen en catalogusdelen \
         hebben geen gemeenschappelijke buitenrand"
            .into(),
    );

    let uitbreiding = bouw_uitbreiding(
        &p,
        dichtheid_van(i),
        Bouwstenen {
            omtrekken: None,
            qy_mm3: r.qy_mm3,
            qz_mm3: r.qz_mm3,
            hoofdas_uitersten: (r.u_min_mm, r.u_max_mm, r.v_min_mm, r.v_max_mm),
            z_pna_mm: r.z_pna_mm,
            y_pna_mm: r.y_pna_mm,
            plastisch: PlastischHoofdas {
                wpl_u_mm3: r.wpl_u_mm3,
                wpl_v_mm3: r.wpl_v_mm3,
                u_pna_mm: r.u_pna_mm,
                v_pna_mm: r.v_pna_mm,
            },
            plastisch_bepaald: r.wpl_bepaald,
            mono: r.monosymmetrie,
            monosymmetrie_bepaald: r.monosymmetrie_bepaald,
        },
    );
    if !uitbreiding.av_hoofdas_bepaald {
        meldingen.push(
            "Av;u en Av;v zijn niet bepaald: de hoofdassen vallen niet met y en z samen"
                .into(),
        );
    }

    Ok(Uitvoer {
        naam: i.naam.clone(),
        soort: i.soort.clone(),
        area_mm2: p.area_mm2,
        iy_mm4: p.iy_mm4,
        iz_mm4: p.iz_mm4,
        wel_y_mm3: p.wel_y_mm3,
        wel_z_mm3: p.wel_z_mm3,
        wpl_y_mm3: p.wpl_y_mm3,
        wpl_z_mm3: p.wpl_z_mm3,
        av_y_mm2: p.av_y_mm2,
        av_z_mm2: p.av_z_mm2,
        it_mm4: p.it_mm4,
        iw_mm6: p.iw_mm6,
        iy_radius_mm: p.iy_radius_mm,
        iz_radius_mm: p.iz_radius_mm,
        h_mm: p.h_mm,
        b_mm: p.b_mm,
        tw_mm: p.tw_mm,
        tf_mm: p.tf_mm,
        r_mm: p.r_mm,
        y_c_mm: p.y_c_mm,
        z_c_mm: p.z_c_mm,
        wel_y_top_mm3: p.wel_y_top_mm3,
        wel_y_bot_mm3: p.wel_y_bot_mm3,
        wel_z_left_mm3: p.wel_z_left_mm3,
        wel_z_right_mm3: p.wel_z_right_mm3,
        iyz_mm4: p.iyz_mm4,
        iu_mm4: p.iu_mm4,
        iv_mm4: p.iv_mm4,
        alpha_hoofdas_rad: p.alpha_hoofdas_rad,
        y_s_mm: p.y_s_mm,
        z_s_mm: p.z_s_mm,
        // Dunwandige formules: geen insluiting en geen mesh.
        it_ondergrens_mm4: p.it_mm4,
        it_bovengrens_mm4: p.it_mm4,
        it_onzekerheid: 0.0,
        a_mesh_mm2: p.area_mm2,
        a_mesh_afwijking: 0.0,
        h_mesh_mm: 0.0,
        driehoeken: 0,
        kleinste_hoek_graden: 0.0,
        tijd_ms: start.elapsed().as_secs_f64() * 1000.0,
        losse_delen: false,
        methode: "lamellen".into(),
        wpl_bepaald: r.wpl_bepaald,
        iw_bepaald: r.iw_bepaald,
        schuifmiddelpunt_bepaald: r.schuifmiddelpunt_bepaald,
        a_gaten_mm2: 0.0,
        // `CompositeResult` geeft de uitersten ten opzichte van het
        // zwaartepunt; hier terug naar het invoerstelsel.
        y_min_mm: r.y_min_mm + p.y_c_mm,
        y_max_mm: r.y_max_mm + p.y_c_mm,
        z_min_mm: r.z_min_mm + p.z_c_mm,
        z_max_mm: r.z_max_mm + p.z_c_mm,
        delen,
        meldingen,
        uitbreiding,
    })
}

impl Invoer {
    /// Naam van deze geometrie; leeg wanneer de invoer er geen gaf.
    pub fn naam(&self) -> &str {
        &self.naam
    }
}

pub fn reken(i: &Invoer) -> Result<Uitvoer, String> {
    if i.soort == "Samenstelling" {
        reken_samenstelling(i)
    } else {
        reken_contour(i)
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Tests van de uitsnede
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contour::{buis, i_profiel, koker_en10210, rechthoek, unp};
    use std::f64::consts::PI;

    fn rel(gemeten: f64, verwacht: f64) -> f64 {
        ((gemeten - verwacht) / verwacht).abs()
    }

    fn gesloten(d: &Doorsnede) {
        for c in &d.contouren {
            let a = c.segmenten[0].beginpunt();
            let b = c.segmenten.last().unwrap().eindpunt();
            assert!((a.0 - b.0).abs() < 1e-9 && (a.1 - b.1).abs() < 1e-9, "contour sluit niet");
            for w in c.segmenten.windows(2) {
                let (p, q) = (w[0].eindpunt(), w[1].beginpunt());
                assert!((p.0 - q.0).abs() < 1e-9 && (p.1 - q.1).abs() < 1e-9, "segmenten sluiten niet aan");
            }
        }
    }

    /// Een lijfgat van 80 mm in een IPE 300 laat twee T's over; A en I zijn
    /// exact de basiswaarden min de weggenomen lijfstrook.
    #[test]
    fn lijfgat_ipe300_is_exact_en_valt_in_twee_delen() {
        let basis = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0);
        let b0 = basis.bereken();
        let d = uitsnede(&basis, 75.0, 150.0, 7.1 + 2.0, 80.0, 0.0).unwrap();
        gesloten(&d);
        assert_eq!(d.contouren.len(), 2, "verwacht twee losse T's");
        let e = d.bereken();
        assert!(rel(e.a_mm2, b0.a_mm2 - 7.1 * 80.0) < 1e-12, "A = {}", e.a_mm2);
        assert!(rel(e.iy_mm4, b0.iy_mm4 - 7.1 * 80f64.powi(3) / 12.0) < 1e-12);
        assert!(rel(e.iz_mm4, b0.iz_mm4 - 80.0 * 7.1f64.powi(3) / 12.0) < 1e-12);
        // Zelfde Wpl als het samenvallende gat via `met_gat` (dat is exact voor
        // de contourkern, alleen niet meshbaar).
        let referentie = basis
            .clone()
            .met_gat(Contour::rechthoek(75.0 - 3.55, 110.0, 7.1, 80.0))
            .bereken();
        assert!(rel(e.wpl_y_mm3, referentie.wpl_y_mm3) < 1e-12);
        assert!(rel(e.wpl_z_mm3, referentie.wpl_z_mm3) < 1e-12);
        assert!((e.y_c_mm - 75.0).abs() < 1e-9 && (e.z_c_mm - 150.0).abs() < 1e-9);
    }

    /// Een flensgat in het uitstek snijdt de flenspunt los.
    #[test]
    fn flensgat_ipe300_snijdt_het_uitstek_los() {
        let basis = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0);
        let b0 = basis.bereken();
        let d = uitsnede(&basis, 30.0, 300.0 - 10.7 / 2.0, 20.0, 10.7 + 2.0, 0.0).unwrap();
        gesloten(&d);
        assert_eq!(d.contouren.len(), 2);
        let e = d.bereken();
        assert!(rel(e.a_mm2, b0.a_mm2 - 20.0 * 10.7) < 1e-12);
    }

    /// Een gat door één kokerwand: de koker blijft één samenhangende contour
    /// (buiten- en binnenrand lopen via de spleet in elkaar over).
    #[test]
    fn wandgat_koker_blijft_een_contour() {
        let k = koker_en10210(200.0, 200.0, 10.0);
        let a0 = k.bereken().a_mm2;
        let d = uitsnede(&k, 5.0, 100.0, 12.0, 60.0, 0.0).unwrap();
        gesloten(&d);
        assert_eq!(d.contouren.len(), 1);
        assert!(rel(d.bereken().a_mm2, a0 - 10.0 * 60.0) < 1e-12);
    }

    /// Wandgat in een buis, bovenin (90°): de snijlijnen lopen evenwijdig aan
    /// de radiaal door het gatmidden, dus de weggenomen wand is de strook
    /// tussen twee koorden — analytisch na te rekenen. De uitsnede moet
    /// radiaal tot onder de binnenwand bij de koorde-einden reiken (daar is
    /// de wand door de kromming radiaal dikker dan t).
    #[test]
    fn wandgat_buis_onder_hoek() {
        let (dia, t, hoogte): (f64, f64, f64) = (219.1, 10.0, 40.0);
        let b = buis(dia, t);
        let a0 = b.bereken().a_mm2;
        let (rr, ri) = (dia / 2.0, dia / 2.0 - t);
        let r_binnen_rand = (ri * ri - (hoogte / 2.0).powi(2)).sqrt();
        let breedte = rr - r_binnen_rand + 2.0;
        let r_mid = (rr + r_binnen_rand) / 2.0;
        let d = uitsnede(&b, rr, rr + r_mid, breedte, hoogte, PI / 2.0).unwrap();
        gesloten(&d);
        assert_eq!(d.contouren.len(), 1);
        let seg = |r: f64, y: f64| 0.5 * (y * (r * r - y * y).sqrt() + r * r * (y / r).asin());
        let weg = (seg(rr, 20.0) - seg(rr, -20.0)) - (seg(ri, 20.0) - seg(ri, -20.0));
        assert!(rel(d.bereken().a_mm2, a0 - weg) < 1e-9, "A = {}", d.bereken().a_mm2);
    }

    /// Lijfgat in een UNP met schuine flenzen: de flensgeometrie blijft
    /// onaangeroerd, alleen de lijfstrook verdwijnt.
    #[test]
    fn lijfgat_unp_met_schuine_flenzen() {
        let u = unp(200.0, 75.0, 8.5, 11.5, 11.5);
        let a0 = u.bereken().a_mm2;
        let d = uitsnede(&u, 4.25, 100.0, 8.5 + 2.0, 60.0, 0.0).unwrap();
        gesloten(&d);
        assert_eq!(d.contouren.len(), 2);
        assert!(rel(d.bereken().a_mm2, a0 - 8.5 * 60.0) < 1e-12);
    }

    /// Een uitsnede die tot in de walsuitronding reikt splitst bogen. De
    /// uitkomst is idempotent en ligt tussen de twee grenzen die je met de
    /// hand kunt bepalen.
    #[test]
    fn uitsnede_door_de_uitronding_splitst_bogen() {
        let basis = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0);
        let a0 = basis.bereken().a_mm2;
        let d = uitsnede(&basis, 75.0, 70.0, 7.1 + 2.0, 100.0, 0.0).unwrap();
        gesloten(&d);
        let a = d.bereken().a_mm2;
        let lijfstrook = 7.1 * 100.0;
        let uitrondingen = 2.0 * 15f64.powi(2) * (1.0 - PI / 4.0);
        assert!(a < a0 - lijfstrook + 1e-9, "minstens de lijfstrook is weg");
        assert!(a > a0 - lijfstrook - uitrondingen, "hoogstens de uitrondingen erbij");
        let nogmaals = uitsnede(&d, 75.0, 70.0, 7.1 + 2.0, 100.0, 0.0).unwrap();
        assert!(rel(nogmaals.bereken().a_mm2, a) < 1e-12);
        // En de torsiemesh hoort er gewoon op te passen.
        let t = crate::torsie::bereken(&d);
        assert!(rel(t.a_mesh_mm2, a) < 2e-3, "meshoppervlak {} tegen {}", t.a_mesh_mm2, a);
    }

    #[test]
    fn langsgat_buiten_materiaal_wordt_geweigerd() {
        let basis = i_profiel(300.0, 150.0, 7.1, 10.7, 15.0);
        assert!(!gat_binnen_materiaal(&basis, &Contour::cirkel((75.0, 150.0), 40.0)));
        assert!(gat_binnen_materiaal(&basis, &Contour::cirkel((75.0, 150.0), 3.0)));
        let massief = rechthoek(300.0, 100.0);
        assert!(gat_binnen_materiaal(&massief, &Contour::cirkel((50.0, 150.0), 20.0)));
        assert!(!gat_binnen_materiaal(&massief, &Contour::cirkel((50.0, 150.0), 60.0)));
    }

    #[test]
    fn langsgat_in_massieve_rechthoek_exact() {
        let d = rechthoek(300.0, 100.0).met_gat(Contour::cirkel((50.0, 150.0), 20.0));
        let e = d.bereken();
        assert!(rel(e.a_mm2, 30_000.0 - PI * 400.0) < 1e-12);
        assert!(rel(e.iy_mm4, 100.0 * 300f64.powi(3) / 12.0 - PI * 20f64.powi(4) / 4.0) < 1e-12);
    }
}
