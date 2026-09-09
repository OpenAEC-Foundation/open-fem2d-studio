//! §8.4 — de VERANKERINGSLENGTE van langswapening, met de bijbehorende regels
//! uit §9.2.1.3, §9.2.1.4 en §9.2.1.5 die de dekkingslijn nodig heeft.
//!
//! Deze module rekent één ding uit: hoeveel millimeter een staaf nodig heeft om
//! zijn kracht aan het beton over te dragen. Dat getal, l_bd, is de sleutel tot
//! de dekkingslijn. §9.2.1.3(3) staat namelijk uitdrukkelijk toe om "met de
//! weerstand van staven binnen hun verankeringslengte rekening te houden,
//! uitgaande van een LINEAIR krachtverloop" (figuur 9.2). Zonder l_bd is die
//! schuine tak niet te tekenen en blijft alleen de conservatieve
//! vereenvoudiging over: de bijdrage verwaarlozen.
//!
//! # De rekengang
//!
//! ```text
//!   f_ctd  = α_ct·f_ctk;0,05/γ_C          (3.16), met f_ctk;0,05 begrensd
//!                                          op de waarde voor C60/75
//!   f_bd   = 2,25·η₁·η₂·f_ctd             (8.2)
//!   l_b,rqd = (Φ/4)·(σ_sd/f_bd)           (8.3)
//!   l_bd   = α₁·α₂·α₃·α₄·α₅·l_b,rqd ≥ l_b,min   (8.4), tabel 8.2, (8.5)
//!   l_b,min = max{0,3·l_b,rqd; 10Φ; 100 mm}     (8.6) trek
//!   l_b,min = max{0,6·l_b,rqd; 10Φ; 100 mm}     (8.7) druk
//! ```
//!
//! # Twee besluiten die vóór het bouwen zijn genomen
//!
//! **1. σ_sd in (8.3) is f_yd, niet de werkelijke staafspanning.** De norm
//! schrijft bij (8.3): "waarin σ_sd de rekenwaarde is van de spanning in de
//! staaf in het punt van waaruit de verankering is gemeten." Dat is dus de
//! WERKELIJKE spanning, en die hangt af van het lastgeval. Zou je dat
//! letterlijk volgen, dan wordt l_bd combinatie-afhankelijk: bij elke
//! belastingcombinatie een andere verankeringslengte, dus bij elke combinatie
//! een andere dekkingslijn — terwijl de wapening in de bak niet verandert.
//! Hier is daarom σ_sd = f_yd aangehouden. Dat is de spanning die de staaf
//! maximaal kán hebben, dus l_bd wordt daarmee een EIGENSCHAP VAN DE STAAF en
//! niet van de combinatie, en de uitkomst ligt aan de veilige kant: langer dan
//! wat (8.3) met de werkelijke σ_sd zou geven. Het is een bewuste afwijking
//! naar boven, geen onnauwkeurigheid, en zij staat als kanttekening in elke
//! afleiding die deze module teruggeeft.
//!
//! **2. De stortrichting wordt PER STAAF opgegeven, met de onderzijde als
//! standaard.** η₁ in (8.2) hangt volgens figuur 8.2 af van waar de staaf lag
//! toen er werd gestort. Dat is geen rekengrootheid maar een uitvoeringsgegeven
//! dat het model niet kan afleiden: dezelfde balk kan ter plaatse gestort zijn
//! (onderwapening 'goed', bovenwapening in een balk hoger dan 250 mm 'slecht')
//! of op zijn kant geprefabriceerd. Zie [`Stortpositie`]. De onderzijde is de
//! standaard omdat dat de gewone situatie is bij werk ter plaatse.
//!
//! # Wat de nationale bijlage hier doet: NIETS
//!
//! **§8.4 heeft geen nationaal bepaalde parameters en de Nederlandse bijlage
//! wijkt er niet van af.** Dat is nagekeken en niet aangenomen: de gebruikte
//! uitgave drukt NB-tekst in oranje af en doorgehaalde EN-tekst in oranje met
//! een streep erdoor. Op de bladzijden van §8.4 (blz. 176 t/m 180 van de
//! PDF-uitgave) staat geen enkel oranje teken — de enige gekleurde pixels daar
//! zijn de rode staafdoorsneden in de figuren 8.1 tot en met 8.4. Ter
//! vergelijking: op de bladzijden van §8.7 (blz. 183 en 184) staat wél oranje,
//! en daar is tabel 8.3 doorgehaald en vervangen door tabel NB 8.3.
//!
//! Wat de NB in §8.4 óók niet verandert maar wat er wel doorheen loopt:
//! α_ct = 1,0 (NB bij 3.1.6(2)P, "De waarde van α_ct moet gelijk aan 1,0 zijn
//! genomen" — gelijk aan de aanbevolen waarde) en γ_C uit tabel 2.1N.
//!
//! De NB-afwijkingen die deze module wél draagt zitten in de aangrenzende
//! artikelen:
//!
//! * **§8.7.3** — tabel 8.3 (α₆) is DOORGEHAALD en vervangen door tabel NB 8.3,
//!   die een regel toevoegt die de EN-tekst niet heeft: voor DRUKverankeringen
//!   is α₆ = 1 bij elk overlappingspercentage. Zie [`alpha_6`].
//! * **§8.7.3** — de NB voegt toe: "Voor de bepaling van c_d in 8.4.4 moet
//!   uitgegaan worden van a zoals aangegeven in figuur 8.7. Hierbij moet a
//!   betrekking hebben op alle in de doorsnede verankerde wapening." Dat geldt
//!   voor OVERLAPPINGEN, niet voor een gewone verankering; zie [`Dekkingsgeval`].
//! * **§9.2.1.4(1)** — β₂ = 0,25; de NB schrijft "De waarde van β₂ voor liggers
//!   moet gelijk aan 0,25 zijn genomen" en wijkt daarmee NIET af van de
//!   aanbevolen waarde. Ook dat is nagekeken, niet aangenomen.
//!
//! # Wat hier NIET in zit
//!
//! * **§8.4.4(2)**, de vereenvoudiging l_b,eq = α₁·l_b,rqd (figuur 8.1b t/m d)
//!   respectievelijk α₄·l_b,rqd (figuur 8.1e). Dat is een ALTERNATIEF voor
//!   (8.4), geen aanvulling; wie beide naast elkaar zet, moet kiezen welke van
//!   de twee in de dekkingslijn komt. Hier is (8.4) gebouwd, want die is
//!   algemeen.
//! * **§8.5** (verankering van beugels), **§8.6** (verankering door aangelaste
//!   staven, F_btd) en **§8.8** (staven groter dan Ø_large): eigen artikelen met
//!   eigen invoer.
//! * **§8.3** tabel 8.1N, de minimale doorndiameter. De doorndiameter Ø_m is
//!   hier INVOER — zie [`min_verankering_tussensteunpunt_mm`] — en wordt niet
//!   uit de staafdiameter afgeleid.
//! * **§8.10**, de overdracht van voorspankracht (f_bpt, l_pt): geen
//!   voorspanning in dit model.
//! * De OVERLAPPINGEN van §8.7 tellen NIET mee in de weerstandslijn. De losse
//!   toets staat er wel in — [`overlappingslengte`] — maar staat bewust apart:
//!   een overlapping is een uitvoeringsgegeven dat het model niet kent, en een
//!   dekkingslijn die stilzwijgend overlappingen zou meerekenen zou een
//!   wapening tonen die er in de bak niet ligt.

use crate::deelstappen::{lx, nl, nv, stap};
use nen_en_1993_1_1_section::Deelstap;
// [`Stortpositie`] en [`Staafvorm`] zijn UITVOERINGSGEGEVENS: het rekenmodel
// kan ze niet afleiden, dus ze moeten door een mens worden gezet en dus over de
// drie wegen (Tauri-command, toetsbrug, MCP-server) reizen. Ze hangen daarom
// aan een langswapeningszone — zie [`crate::section::LongitudinalZone`] — en
// dragen om die reden serde en ts-rs. De overige typen van deze module dragen
// die bewust NIET: die volgen uit de zone, de korf en de materiaalgegevens en
// horen geen los invoerveld te worden.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ---------------------------------------------------------------------------
// De normwaarden. Elke constante draagt haar vindplaats.
// ---------------------------------------------------------------------------

/// De vaste factor 2,25 in (8.2): f_bd = 2,25·η₁·η₂·f_ctd — art. 8.4.2(2).
///
/// Letterlijk van de gerenderde bladzijde: "f_bd = 2,25 η₁ η₂ f_ctd (8.2)".
/// Geen nationaal bepaalde parameter.
pub const F_BD_FACTOR: f64 = 2.25;

/// η₁ bij 'goede' aanhechtingsomstandigheden — art. 8.4.2(2), figuur 8.2.
pub const ETA_1_GOED: f64 = 1.0;

/// η₁ voor alle andere gevallen en voor glijbekisting — art. 8.4.2(2).
///
/// "η₁ = 0,7 voor alle andere gevallen en voor staven in met glijbekisting
/// gefabriceerde constructieve elementen, tenzij kan zijn aangetoond dat de
/// aanhechtingsomstandigheden 'goed' zijn."
pub const ETA_1_OVERIG: f64 = 0.7;

/// De staafdiameter waarboven η₂ kleiner wordt dan 1,0 — art. 8.4.2(2): 32 mm.
///
/// "η₂ = 1,0 voor Φ ≤ 32 mm; η₂ = (132 − Φ)/100 voor Φ > 32 mm."
pub const ETA_2_GRENSDIAMETER_MM: f64 = 32.0;

/// De teller 132 in η₂ = (132 − Φ)/100 — art. 8.4.2(2).
pub const ETA_2_TELLER_MM: f64 = 132.0;

/// De noemer 100 in η₂ = (132 − Φ)/100 — art. 8.4.2(2).
pub const ETA_2_NOEMER_MM: f64 = 100.0;

/// De bovengrens van f_ctk;0,05 in (8.2): de waarde voor C60/75 = 3,1 N/mm².
///
/// Art. 8.4.2(2) bij f_ctd: "Ten gevolge van toenemende brosheid van beton met
/// hogere sterkte behoort f_ctk,0,05 hierbij te zijn beperkt tot de waarde voor
/// C60/75, tenzij kan zijn getoetst dat de gemiddelde aanhechtsterkte toeneemt
/// boven die grens." De waarde 3,1 N/mm² komt uit tabel 3.1, kolom C60/75, en
/// staat ook zo in [`crate::data::CONCRETE_CLASSES`].
///
/// Let op wat er begrensd wordt: **f_ctk;0,05, niet f_ctd**. De volgorde is dus
/// eerst afkappen, dan delen door γ_C.
pub const F_CTK_005_MAX_MPA: f64 = 3.1;

/// De hoogtegrens van figuur 8.2b: tot en met 250 mm is de aanhechting voor
/// ALLE staven 'goed'.
pub const FIG_8_2_H_GRENS_MM: f64 = 250.0;

/// De 'goede' zone vanaf de onderrand bij 250 mm < h ≤ 600 mm — figuur 8.2c.
pub const FIG_8_2_GOEDE_ZONE_ONDER_MM: f64 = 250.0;

/// De hoogte waarboven figuur 8.2d geldt in plaats van 8.2c: 600 mm.
pub const FIG_8_2_H_DIEP_MM: f64 = 600.0;

/// De 'slechte' zone vanaf de bovenrand bij h > 600 mm — figuur 8.2d.
pub const FIG_8_2_SLECHTE_ZONE_BOVEN_MM: f64 = 300.0;

/// De ondergrens van het product (α₂·α₃·α₅) — art. 8.4.4(1), vergelijking (8.5).
///
/// "Het product (α₂ α₃ α₅) ≥ 0,7". Let op dat dit een grens op het PRODUCT is,
/// bovenop de grens 0,7 ≤ α ≤ 1,0 die elke factor afzonderlijk al heeft.
pub const PRODUCT_A2_A3_A5_MIN: f64 = 0.7;

/// De ondergrens van elke afzonderlijke alfa-factor uit tabel 8.2: 0,7.
pub const ALFA_MIN: f64 = 0.7;

/// De bovengrens van elke afzonderlijke alfa-factor uit tabel 8.2: 1,0.
pub const ALFA_MAX: f64 = 1.0;

/// Fractie van l_b,rqd in l_b,min voor TREKverankeringen — (8.6): 0,3.
pub const L_B_MIN_FRACTIE_TREK: f64 = 0.3;

/// Fractie van l_b,rqd in l_b,min voor DRUKverankeringen — (8.7): 0,6.
pub const L_B_MIN_FRACTIE_DRUK: f64 = 0.6;

/// Het aantal diameters in l_b,min — (8.6) en (8.7): 10Φ.
pub const L_B_MIN_DIAMETERS: f64 = 10.0;

/// De absolute ondergrens in l_b,min — (8.6) en (8.7): 100 mm.
pub const L_B_MIN_ABSOLUUT_MM: f64 = 100.0;

/// β₂ — NB bij §9.2.1.4(1): het deel van de veldwapening dat tot in het
/// eindsteunpunt moet doorlopen.
///
/// De EN-tekst: "behoort ten minste gelijk te zijn aan β₂ maal de oppervlakte
/// van de doorsnede van het staal aangebracht in de overspanning", met de
/// OPMERKING dat de aanbevolen waarde 0,25 is. De NB: "De waarde van β₂ voor
/// liggers moet gelijk aan 0,25 zijn genomen." De NB WIJKT HIER DUS NIET AF —
/// dat is nagekeken op de gerenderde bladzijde, niet aangenomen.
pub const BETA_2: f64 = 0.25;

/// Het aantal diameters in de minimale verankering bij een TUSSENsteunpunt —
/// §9.2.1.5(2): 10Φ voor rechte staven.
pub const TUSSENSTEUNPUNT_DIAMETERS: f64 = 10.0;

/// De factor op l_bd voor een opgebogen staaf in de TREKzone — §9.2.1.3(4): 1,3.
pub const OPGEBOGEN_TREKZONE_FACTOR: f64 = 1.3;

/// De factor op l_bd voor een opgebogen staaf in de DRUKzone — §9.2.1.3(4): 0,7.
pub const OPGEBOGEN_DRUKZONE_FACTOR: f64 = 0.7;

/// A_st,min = 0,25·A_s voor BALKEN — tabel 8.2, verklaring onder de tabel.
pub const A_ST_MIN_FACTOR_BALK: f64 = 0.25;

/// K = 0,1 — figuur 8.4, linker geval.
pub const K_HOEK: f64 = 0.1;

/// K = 0,05 — figuur 8.4, middelste geval.
pub const K_DWARSSTAAF_BUITEN: f64 = 0.05;

/// K = 0 — figuur 8.4, rechter geval.
pub const K_DWARSSTAAF_BINNEN: f64 = 0.0;

/// De helling 0,15 in α₂ — tabel 8.2, regel "Betondekking".
pub const ALFA_2_HELLING: f64 = 0.15;

/// De helling 0,04 in α₅ = 1 − 0,04·p — tabel 8.2, regel "Opsluiting door
/// dwarsdruk".
pub const ALFA_5_HELLING: f64 = 0.04;

/// α₁ = 0,7 voor een niet-rechte trekstaaf met c_d > 3Φ — tabel 8.2.
pub const ALFA_1_OMGEBOGEN: f64 = 0.7;

/// α₄ = 0,7 bij gelaste dwarswapening volgens figuur 8.1(e) — tabel 8.2.
pub const ALFA_4_GELAST: f64 = 0.7;

/// De minimale verhouding Φ_t/Φ waarbij een gelaste dwarsstaaf voor α₄ meetelt —
/// art. 8.4.4(1): "α₄ is voor de invloed van één of meer gelaste dwarsstaven
/// (Φ_t > 0,6Φ) langs de rekenwaarde van de verankeringslengte l_bd".
pub const ALFA_4_MIN_PHI_T_FACTOR: f64 = 0.6;

// ---------------------------------------------------------------------------
// De aanhechtingsomstandigheden — art. 8.4.2(2) en figuur 8.2
// ---------------------------------------------------------------------------

/// De aanhechtingsomstandigheden van figuur 8.2: 'goed' of 'alle andere
/// gevallen'.
///
/// De norm kent geen tussenwaarde. η₁ is 1,0 of 0,7 en verder niets.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Aanhechting {
    /// 'Goede' omstandigheden — η₁ = 1,0.
    Goed,
    /// "Alle andere gevallen" — η₁ = 0,7.
    Overig,
}

impl Aanhechting {
    /// η₁ volgens art. 8.4.2(2).
    pub fn eta_1(self) -> f64 {
        match self {
            Aanhechting::Goed => ETA_1_GOED,
            Aanhechting::Overig => ETA_1_OVERIG,
        }
    }

    /// De omschrijving zoals de norm haar noemt, voor in het rapport.
    pub fn omschrijving(self) -> &'static str {
        match self {
            Aanhechting::Goed => "'goede' aanhechtingsomstandigheden",
            Aanhechting::Overig => "'alle andere gevallen'",
        }
    }
}

/// Waar de staaf lag ten opzichte van de stortrichting — PER STAAF op te geven.
///
/// Figuur 8.2 leidt de aanhechtingsomstandigheden af uit drie dingen: de
/// stortrichting (de pijl 'A' in de figuur), de hoogte h van het element en de
/// plaats van de staaf daarin. De eerste daarvan is een uitvoeringsgegeven dat
/// het rekenmodel niet kan weten, en juist die bepaalt of de bovenwapening van
/// een balk van 700 mm 'goed' of 'slecht' verankerd is — een verschil van een
/// factor 1/0,7 = 1,43 in l_bd.
///
/// [`Stortpositie::Onderzijde`] is de standaard: dat is de gewone situatie bij
/// werk ter plaatse, waarbij van bovenaf wordt gestort en de onderwapening dus
/// in de 'goede' zone ligt.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Stortpositie {
    /// De staaf ligt aan de ONDERZIJDE van de doorsnede zoals gestort.
    ///
    /// Standaard. Bij van bovenaf storten valt zo'n staaf in figuur 8.2 in de
    /// niet-gearceerde zone, ongeacht de elementhoogte, zolang zij binnen
    /// 250 mm van de onderrand ligt — wat bij een gewone korf altijd zo is.
    #[default]
    Onderzijde,
    /// De staaf ligt aan de BOVENZIJDE van de doorsnede zoals gestort.
    ///
    /// Dan beslist de elementhoogte: tot en met 250 mm is de aanhechting
    /// volgens figuur 8.2b nog 'goed', daarboven valt de staaf in de gearceerde
    /// zone van figuur 8.2c of 8.2d en geldt η₁ = 0,7.
    Bovenzijde,
    /// Het element is met GLIJBEKISTING gefabriceerd.
    ///
    /// Art. 8.4.2(2) noemt dit geval apart: η₁ = 0,7, ongeacht de plaats van de
    /// staaf, "tenzij kan zijn aangetoond dat de aanhechtingsomstandigheden
    /// 'goed' zijn". Wie dat heeft aangetoond, gebruikt
    /// [`Stortpositie::GoedAangetoond`].
    Glijbekisting,
    /// Voor deze staaf is aangetoond dat de aanhechtingsomstandigheden 'goed'
    /// zijn — η₁ = 1,0.
    ///
    /// Art. 8.4.2(2) laat dit expliciet toe. Het is een uitspraak over de
    /// UITVOERING en hoort dus door een mens gezet te worden, niet door het
    /// model afgeleid.
    GoedAangetoond,
}

/// De aanhechtingsomstandigheden rechtstreeks uit figuur 8.2, op grond van de
/// elementhoogte en de hoogte van de staaf boven de ONDERRAND.
///
/// De figuur geeft vier gevallen. Geval a (staven onder 45° ≤ α ≤ 90°) gaat
/// over schuine staven en speelt bij langswapening niet. De andere drie:
///
/// | geval | voorwaarde | wat 'goed' is |
/// |---|---|---|
/// | 8.2b | h ≤ 250 mm | alle staven |
/// | 8.2c | h > 250 mm | de onderste 250 mm |
/// | 8.2d | h > 600 mm | alles behalve de bovenste 300 mm |
///
/// De zones zijn van de gerenderde bladzijde afgelezen en niet uit het hoofd
/// opgeschreven: in 8.2c staat de maat 250 aan de ONDERkant met de gearceerde
/// (= 'slechte') zone erboven, in 8.2d staat de maat 300 aan de BOVENkant met
/// de arcering ertussen.
///
/// **De sprong bij h = 600 mm is echt en zit in de norm zelf.** Een staaf 301 mm
/// boven de onderrand valt in een element van 600 mm buiten de goede zone van
/// 8.2c, en in een element van 601 mm er precies binnen volgens 8.2d. Dat is
/// niet gladgestreken: gladstrijken zou een normwaarde verzinnen.
pub fn aanhechting_figuur_8_2(h_mm: f64, z_staaf_boven_onderrand_mm: f64) -> Aanhechting {
    if h_mm <= FIG_8_2_H_GRENS_MM {
        // Figuur 8.2b — alle staven 'goed'.
        Aanhechting::Goed
    } else if h_mm <= FIG_8_2_H_DIEP_MM {
        // Figuur 8.2c — alleen de onderste 250 mm is 'goed'.
        if z_staaf_boven_onderrand_mm <= FIG_8_2_GOEDE_ZONE_ONDER_MM {
            Aanhechting::Goed
        } else {
            Aanhechting::Overig
        }
    } else {
        // Figuur 8.2d — de bovenste 300 mm is 'slecht', de rest 'goed'.
        if h_mm - z_staaf_boven_onderrand_mm >= FIG_8_2_SLECHTE_ZONE_BOVEN_MM {
            Aanhechting::Goed
        } else {
            Aanhechting::Overig
        }
    }
}

/// De aanhechtingsomstandigheden uit de opgegeven stortpositie en de
/// elementhoogte, met de reden erbij.
///
/// `z_staaf_boven_onderrand_mm` is optioneel. Is hij bekend, dan wordt figuur
/// 8.2 rechtstreeks toegepast en is de uitkomst exact. Ontbreekt hij, dan geldt
/// de aanname die bij de stortpositie hoort: een staaf aan de onderzijde ligt
/// binnen de onderste 250 mm, een staaf aan de bovenzijde ligt in de bovenste
/// zone. Die aanname komt als tekst mee terug, want stilzwijgend aannemen is
/// erger dan niets zeggen.
pub fn aanhechting(
    positie: Stortpositie,
    h_mm: f64,
    z_staaf_boven_onderrand_mm: Option<f64>,
) -> (Aanhechting, String) {
    match positie {
        Stortpositie::Glijbekisting => (
            Aanhechting::Overig,
            "Met glijbekisting gefabriceerd element: art. 8.4.2(2) schrijft η₁ = 0,7 voor, \
             ongeacht de plaats van de staaf."
                .to_string(),
        ),
        Stortpositie::GoedAangetoond => (
            Aanhechting::Goed,
            "Voor deze staaf is aangetoond dat de aanhechtingsomstandigheden 'goed' zijn; \
             art. 8.4.2(2) laat dat uitdrukkelijk toe."
                .to_string(),
        ),
        Stortpositie::Onderzijde | Stortpositie::Bovenzijde => {
            let aan_bovenzijde = positie == Stortpositie::Bovenzijde;
            match z_staaf_boven_onderrand_mm {
                Some(z) => {
                    let a = aanhechting_figuur_8_2(h_mm, z);
                    (
                        a,
                        format!(
                            "Figuur 8.2 met h = {} mm en de staaf {} mm boven de onderrand: {}.",
                            nl(h_mm, 0),
                            nl(z, 0),
                            a.omschrijving()
                        ),
                    )
                }
                None => {
                    if !aan_bovenzijde {
                        (
                            Aanhechting::Goed,
                            format!(
                                "Staaf aan de onderzijde bij het storten. AANNAME: zij ligt \
                                 binnen de onderste {} mm, de 'goede' zone van figuur 8.2c/8.2d.",
                                nl(FIG_8_2_GOEDE_ZONE_ONDER_MM, 0)
                            ),
                        )
                    } else if h_mm <= FIG_8_2_H_GRENS_MM {
                        (
                            Aanhechting::Goed,
                            format!(
                                "Staaf aan de bovenzijde, maar h = {} mm ≤ {} mm: figuur 8.2b \
                                 geeft 'goede' omstandigheden voor ALLE staven.",
                                nl(h_mm, 0),
                                nl(FIG_8_2_H_GRENS_MM, 0)
                            ),
                        )
                    } else {
                        (
                            Aanhechting::Overig,
                            format!(
                                "Staaf aan de bovenzijde bij het storten en h = {} mm > {} mm. \
                                 AANNAME: zij ligt in de gearceerde zone van figuur 8.2c/8.2d, \
                                 dus η₁ = 0,7.",
                                nl(h_mm, 0),
                                nl(FIG_8_2_H_GRENS_MM, 0)
                            ),
                        )
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// (8.2) — de uiterst opneembare aanhechtspanning f_bd
// ---------------------------------------------------------------------------

/// f_ctk;0,05 zoals (8.2) hem gebruikt: begrensd op de waarde voor C60/75.
///
/// Geeft de te gebruiken waarde terug plus `true` als de begrenzing heeft
/// toegeslagen. Art. 8.4.2(2).
pub fn f_ctk_005_begrensd_mpa(f_ctk_005_mpa: f64) -> (f64, bool) {
    if f_ctk_005_mpa > F_CTK_005_MAX_MPA {
        (F_CTK_005_MAX_MPA, true)
    } else {
        (f_ctk_005_mpa, false)
    }
}

/// f_ctd = α_ct·f_ctk;0,05/γ_C — vergelijking (3.16), art. 3.1.6(2)P.
///
/// De begrenzing van f_ctk;0,05 uit 8.4.2(2) zit hier NIET in; die hoort ervóór
/// (zie [`f_ctk_005_begrensd_mpa`]), want de norm begrenst het karakteristieke
/// getal en niet de rekenwaarde.
pub fn f_ctd_mpa(f_ctk_005_mpa: f64, alpha_ct: f64, gamma_c: f64) -> f64 {
    alpha_ct * f_ctk_005_mpa / gamma_c
}

/// η₂ volgens art. 8.4.2(2): 1,0 voor Φ ≤ 32 mm, (132 − Φ)/100 daarboven.
///
/// De knik zit op 32 mm en is continu: bij Φ = 32 geeft de tweede tak
/// (132 − 32)/100 = 1,00, precies de eerste tak. Bij Φ = 40 mm is η₂ = 0,92, en
/// dat is geen detail: het maakt l_b,rqd 8,7 % langer.
pub fn eta_2(diameter_mm: f64) -> f64 {
    if diameter_mm <= ETA_2_GRENSDIAMETER_MM {
        1.0
    } else {
        (ETA_2_TELLER_MM - diameter_mm) / ETA_2_NOEMER_MM
    }
}

/// f_bd = 2,25·η₁·η₂·f_ctd — vergelijking (8.2), art. 8.4.2(2).
///
/// Geldt volgens de normtekst "voor geribde staven". Voor gladde staven geeft
/// §8.4 geen f_bd; die zitten dan ook niet in dit model.
pub fn f_bd_mpa(f_ctd_mpa: f64, eta_1: f64, eta_2: f64) -> f64 {
    F_BD_FACTOR * eta_1 * eta_2 * f_ctd_mpa
}

// ---------------------------------------------------------------------------
// (8.3) — de basisverankeringslengte l_b,rqd
// ---------------------------------------------------------------------------

/// l_b,rqd = (Φ/4)·(σ_sd/f_bd) — vergelijking (8.3), art. 8.4.3(2).
///
/// Voor σ_sd: zie het besluit in de moduledocumentatie. Deze functie neemt
/// gewoon aan wat zij krijgt; de keuze σ_sd = f_yd wordt afgedwongen door
/// [`verankeringslengte`], die zelf f_yd invult.
pub fn l_b_rqd_mm(diameter_mm: f64, sigma_sd_mpa: f64, f_bd_mpa: f64) -> f64 {
    (diameter_mm / 4.0) * (sigma_sd_mpa / f_bd_mpa)
}

/// De gelijkwaardige diameter Φ_n = Φ·√2 voor gepuntlaste wapeningsnetten van
/// DUBBELE draden/staven — art. 8.4.3(4).
///
/// "Bij gepuntlaste wapeningsnetten bestaande uit dubbele draden/staven,
/// behoort de diameter Φ in vergelijking (8.3) te zijn vervangen door de
/// gelijkwaardige diameter Φ_n = Φ√2."
pub fn diameter_dubbele_draad_mm(diameter_mm: f64) -> f64 {
    diameter_mm * std::f64::consts::SQRT_2
}

// ---------------------------------------------------------------------------
// Tabel 8.2 — de vijf alfa-factoren
// ---------------------------------------------------------------------------

/// Trek- of drukverankering. Tabel 8.2 heeft voor beide een eigen kolom, en
/// (8.6)/(8.7) een eigen ondergrens.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Verankeringssoort {
    /// Trekstaaf — de kolom "Trekstaaf" van tabel 8.2, ondergrens (8.6).
    #[default]
    Trek,
    /// Drukstaaf — de kolom "Drukstaaf" van tabel 8.2, ondergrens (8.7).
    Druk,
}

/// De vorm van het staafeinde volgens de regel "Vorm van de staaf" in tabel 8.2.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Staafvorm {
    /// Recht.
    #[default]
    Recht,
    /// "Anders dan recht (zie figuur 8.1 (b), (c) en (d))" — een ombuiging, een
    /// haak of een lus.
    ///
    /// Let op art. 8.4.1(3): "Ombuigingen en haken dragen niet bij aan de
    /// verankering van drukstaven." Tabel 8.2 zet dat om in α₁ = α₂ = 1,0 voor
    /// de hele drukkolom, en dat is precies wat [`alpha_1`] en [`alpha_2`]
    /// doen.
    AndersDanRecht,
}

/// De drie waarden van K uit figuur 8.4, met de bijbehorende ligging.
///
/// De omschrijvingen zijn van de gerenderde figuur afgelezen: links de staaf in
/// de hoek van de omgebogen dwarsstaaf (K = 0,1), in het midden de staaf die op
/// de dwarsstaaf rust zodat de dwarsstaaf tussen de staaf en het betonoppervlak
/// ligt (K = 0,05), rechts de staaf die zelf tussen de dwarsstaaf en het
/// betonoppervlak ligt (K = 0).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum KWaarde {
    /// De te verankeren staaf ligt in de HOEK van de omgebogen dwarsstaaf —
    /// K = 0,1.
    InDeHoek,
    /// De dwarsstaaf ligt TUSSEN de te verankeren staaf en het betonoppervlak —
    /// K = 0,05.
    DwarsstaafBuiten,
    /// De te verankeren staaf ligt tussen de dwarsstaaf en het betonoppervlak —
    /// K = 0. Dan levert de dwarswapening geen opsluiting op.
    #[default]
    DwarsstaafBinnen,
}

impl KWaarde {
    /// K volgens figuur 8.4.
    pub fn k(self) -> f64 {
        match self {
            KWaarde::InDeHoek => K_HOEK,
            KWaarde::DwarsstaafBuiten => K_DWARSSTAAF_BUITEN,
            KWaarde::DwarsstaafBinnen => K_DWARSSTAAF_BINNEN,
        }
    }

    /// De omschrijving voor in het rapport.
    pub fn omschrijving(self) -> &'static str {
        match self {
            KWaarde::InDeHoek => "staaf in de hoek van de omgebogen dwarsstaaf (figuur 8.4 links)",
            KWaarde::DwarsstaafBuiten => {
                "dwarsstaaf tussen de staaf en het betonoppervlak (figuur 8.4 midden)"
            }
            KWaarde::DwarsstaafBinnen => {
                "staaf tussen de dwarsstaaf en het betonoppervlak (figuur 8.4 rechts)"
            }
        }
    }
}

/// Balk of plaat — bepaalt A_st,min in λ; zie de verklaring onder tabel 8.2.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Elementtype {
    /// Balk: A_st,min = 0,25·A_s.
    #[default]
    Balk,
    /// Plaat: A_st,min = 0.
    Plaat,
}

/// De drie gevallen van figuur 8.3 waarmee c_d wordt bepaald.
///
/// De figuur zelf, van de gerenderde bladzijde afgelezen:
///
/// ```text
///   a) Rechte staven                            c_d = min(a/2; c₁; c)
///   b) Omgebogen staven of staven met een haak  c_d = min(a/2; c₁)
///   c) Haarspelden                              c_d = c
/// ```
///
/// `a` is de afstand TUSSEN de twee staven. De maatlijn in figuur 8.3a loopt
/// tussen twee hulplijnen die aan dezelfde zijde van beide staven staan; dat is
/// dus de hart-op-hartafstand, niet de vrije ruimte. `c` is de dekking op de
/// onderzijde, `c₁` de dekking op de zijkant.
///
/// **Bij OVERLAPPINGEN geldt de NB.** De Nederlandse bijlage voegt aan §8.7.3
/// toe: "Voor de bepaling van c_d in 8.4.4 moet uitgegaan worden van a zoals
/// aangegeven in figuur 8.7. Hierbij moet a betrekking hebben op alle in de
/// doorsnede verankerde wapening." In figuur 8.7 is `a` de afstand tussen
/// NABURIGE OVERLAPPINGEN, een andere maat dan de `a` van figuur 8.3. Wie
/// [`overlappingslengte`] gebruikt, moet c_d dus met die maat bepalen en niet
/// met die van figuur 8.3.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Dekkingsgeval {
    /// Figuur 8.3a — rechte staven.
    RechteStaven {
        /// Afstand tussen de staven, mm.
        a_mm: f64,
        /// Zijdelingse dekking c₁, mm.
        c1_mm: f64,
        /// Dekking c, mm.
        c_mm: f64,
    },
    /// Figuur 8.3b — omgebogen staven of staven met een haak.
    OmgebogenOfHaak {
        /// Afstand tussen de staven, mm.
        a_mm: f64,
        /// Zijdelingse dekking c₁, mm.
        c1_mm: f64,
    },
    /// Figuur 8.3c — haarspelden.
    Haarspeld {
        /// Dekking c, mm.
        c_mm: f64,
    },
}

/// c_d volgens figuur 8.3.
pub fn c_d_mm(geval: Dekkingsgeval) -> f64 {
    match geval {
        Dekkingsgeval::RechteStaven { a_mm, c1_mm, c_mm } => (a_mm / 2.0).min(c1_mm).min(c_mm),
        Dekkingsgeval::OmgebogenOfHaak { a_mm, c1_mm } => (a_mm / 2.0).min(c1_mm),
        Dekkingsgeval::Haarspeld { c_mm } => c_mm,
    }
}

/// Begrenst een alfa-factor op 0,7 ≤ α ≤ 1,0 zoals tabel 8.2 dat doet.
fn begrens_alfa(x: f64) -> f64 {
    x.clamp(ALFA_MIN, ALFA_MAX)
}

/// λ = (ΣA_st − ΣA_st,min)/A_s — verklaring onder tabel 8.2.
///
/// * `sum_a_st_mm2` — oppervlakte van de dwarswapening LANGS l_bd, mm².
/// * `a_s_mm2` — "de oppervlakte van de doorsnede van een enkelvoudig
///   verankerde staaf met maximale staafdiameter", dus de oppervlakte van ÉÉN
///   staaf en niet van de hele laag.
/// * A_st,min = 0,25·A_s voor balken en 0 voor platen.
///
/// λ kan negatief uitvallen als er minder dwarswapening ligt dan het minimum;
/// α₃ = 1 − K·λ wordt dan groter dan 1 en de begrenzing ≤ 1,0 van tabel 8.2
/// vangt dat op. Zie [`alpha_3`].
pub fn lambda_8_2(sum_a_st_mm2: f64, a_s_mm2: f64, element: Elementtype) -> f64 {
    let a_st_min = match element {
        Elementtype::Balk => A_ST_MIN_FACTOR_BALK * a_s_mm2,
        Elementtype::Plaat => 0.0,
    };
    (sum_a_st_mm2 - a_st_min) / a_s_mm2
}

/// λ zoals §8.7.3(1) hem voor OVERLAPPINGEN voorschrijft.
///
/// "Waarden van α₁, α₂, α₃ and α₅ mogen zijn ontleend aan tabel 8.2; voor het
/// berekenen van α₃ behoort ΣA_st,min echter gelijk te zijn genomen aan
/// 1,0·A_s·(σ_sd/f_yd), met A_s = de oppervlakte van de doorsnede van één
/// overlappende staaf."
///
/// Met de keuze σ_sd = f_yd van deze module wordt dat A_st,min = 1,0·A_s — vier
/// keer zoveel als de 0,25·A_s van een gewone balkverankering, dus een kleinere
/// λ en een grotere α₃.
pub fn lambda_8_7_3(sum_a_st_mm2: f64, a_s_mm2: f64, sigma_sd_mpa: f64, f_yd_mpa: f64) -> f64 {
    let a_st_min = a_s_mm2 * (sigma_sd_mpa / f_yd_mpa);
    (sum_a_st_mm2 - a_st_min) / a_s_mm2
}

/// α₁ — "Vorm van de staaf", tabel 8.2.
///
/// * recht: α₁ = 1,0 (trek én druk);
/// * anders dan recht, TREK: α₁ = 0,7 als c_d > 3Φ, anders α₁ = 1,0;
/// * anders dan recht, DRUK: α₁ = 1,0 — art. 8.4.1(3), ombuigingen en haken
///   dragen niet bij aan de verankering van drukstaven.
pub fn alpha_1(
    vorm: Staafvorm,
    soort: Verankeringssoort,
    c_d_mm: f64,
    diameter_mm: f64,
) -> f64 {
    match (vorm, soort) {
        (Staafvorm::Recht, _) => 1.0,
        (Staafvorm::AndersDanRecht, Verankeringssoort::Druk) => 1.0,
        (Staafvorm::AndersDanRecht, Verankeringssoort::Trek) => {
            if c_d_mm > 3.0 * diameter_mm {
                ALFA_1_OMGEBOGEN
            } else {
                1.0
            }
        }
    }
}

/// α₂ — "Betondekking", tabel 8.2.
///
/// * recht, TREK: α₂ = 1 − 0,15·(c_d − Φ)/Φ, begrensd op 0,7 ≤ α₂ ≤ 1,0;
/// * anders dan recht, TREK: α₂ = 1 − 0,15·(c_d − 3Φ)/Φ, zelfde begrenzing;
/// * DRUK: α₂ = 1,0.
///
/// Let op het verschil tussen de twee trekregels: 1Φ tegenover 3Φ. Wie de
/// verkeerde neemt, rekent bij een ruime dekking te gunstig.
pub fn alpha_2(
    vorm: Staafvorm,
    soort: Verankeringssoort,
    c_d_mm: f64,
    diameter_mm: f64,
) -> f64 {
    match (vorm, soort) {
        (_, Verankeringssoort::Druk) => 1.0,
        (Staafvorm::Recht, Verankeringssoort::Trek) => {
            begrens_alfa(1.0 - ALFA_2_HELLING * (c_d_mm - diameter_mm) / diameter_mm)
        }
        (Staafvorm::AndersDanRecht, Verankeringssoort::Trek) => {
            begrens_alfa(1.0 - ALFA_2_HELLING * (c_d_mm - 3.0 * diameter_mm) / diameter_mm)
        }
    }
}

/// α₃ — "Opsluiting door dwarswapening, niet gelast aan de hoofdwapening",
/// tabel 8.2.
///
/// * TREK, alle types: α₃ = 1 − K·λ, begrensd op 0,7 ≤ α₃ ≤ 1,0;
/// * DRUK: α₃ = 1,0.
pub fn alpha_3(soort: Verankeringssoort, k: f64, lambda: f64) -> f64 {
    match soort {
        Verankeringssoort::Druk => 1.0,
        Verankeringssoort::Trek => begrens_alfa(1.0 - k * lambda),
    }
}

/// α₄ — "Opsluiting door gelaste dwarswapening", tabel 8.2: 0,7 voor trek én
/// druk, mits de dwarsstaaf voldoet aan figuur 8.1(e) en Φ_t > 0,6Φ.
///
/// `phi_t_mm` is `None` als er geen gelaste dwarsstaaf langs l_bd ligt. Is hij
/// er wél maar is Φ_t ≤ 0,6Φ, dan telt hij volgens art. 8.4.4(1) niet mee en
/// blijft α₄ = 1,0. Die controle staat hier en niet bij de aanroeper, want dit
/// is precies de soort voorwaarde die in een invoerveld verdwijnt.
pub fn alpha_4(phi_t_mm: Option<f64>, diameter_mm: f64) -> f64 {
    match phi_t_mm {
        Some(phi_t) if phi_t > ALFA_4_MIN_PHI_T_FACTOR * diameter_mm => ALFA_4_GELAST,
        _ => 1.0,
    }
}

/// α₅ — "Opsluiting door dwarsdruk", tabel 8.2.
///
/// * TREK, alle types: α₅ = 1 − 0,04·p, begrensd op 0,7 ≤ α₅ ≤ 1,0, met p de
///   druk in dwarsrichting in MPa in de uiterste grenstoestand langs l_bd;
/// * DRUK: tabel 8.2 zet in die kolom een streepje — de factor is niet van
///   toepassing. Hier komt dan 1,0 terug, wat rekenkundig hetzelfde is als
///   weglaten uit het product van (8.4).
pub fn alpha_5(soort: Verankeringssoort, p_mpa: f64) -> f64 {
    match soort {
        Verankeringssoort::Druk => 1.0,
        Verankeringssoort::Trek => begrens_alfa(1.0 - ALFA_5_HELLING * p_mpa),
    }
}

// ---------------------------------------------------------------------------
// (8.4), (8.5), (8.6) en (8.7) — l_bd
// ---------------------------------------------------------------------------

/// Welke van de drie termen van (8.6)/(8.7) l_b,min bepaalt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OndergrensTerm {
    /// 0,3·l_b,rqd (trek) respectievelijk 0,6·l_b,rqd (druk).
    FractieVanLbRqd,
    /// 10Φ.
    TienDiameters,
    /// 100 mm.
    HonderdMillimeter,
}

impl OndergrensTerm {
    /// De term in LaTeX, voor de ingevulde regel van de afleiding.
    pub fn latex(self, soort: Verankeringssoort) -> &'static str {
        match (self, soort) {
            (OndergrensTerm::FractieVanLbRqd, Verankeringssoort::Trek) => r"0{,}3\,l_{b,rqd}",
            (OndergrensTerm::FractieVanLbRqd, Verankeringssoort::Druk) => r"0{,}6\,l_{b,rqd}",
            (OndergrensTerm::TienDiameters, _) => r"10\,\Phi",
            (OndergrensTerm::HonderdMillimeter, _) => r"100\ \mathrm{mm}",
        }
    }
}

/// l_b,min volgens (8.6) voor trek en (8.7) voor druk, met de maatgevende term.
///
/// ```text
///   trek: l_b,min ≥ max{0,3·l_b,rqd; 10Φ; 100 mm}   (8.6)
///   druk: l_b,min ≥ max{0,6·l_b,rqd; 10Φ; 100 mm}   (8.7)
/// ```
///
/// De norm zegt erbij: "l_b,min is de minimumverankeringslengte als geen andere
/// beperking van toepassing is".
///
/// **AFGELEID, staat niet zo in de norm:** de eerste term kan nooit maatgevend
/// worden. Voor trek is α₁ ≥ 0,7, (α₂·α₃·α₅) ≥ 0,7 door (8.5) en α₄ ≥ 0,7, dus
/// het product in (8.4) is ten minste 0,7³ = 0,343 en daarmee altijd groter dan
/// de 0,3 van (8.6). Voor druk zijn α₁, α₂, α₃ en α₅ alle 1,0 en is alleen α₄
/// nog vrij, dus het product is ten minste 0,7 en daarmee groter dan de 0,6 van
/// (8.7). Alleen 10Φ en 100 mm kunnen l_bd dus werkelijk optillen. De term
/// wordt niettemin gewoon meegenomen: hij hoort in de norm en een latere
/// wijziging van de tabel mag deze afleiding niet stilzwijgend omvergooien.
pub fn l_b_min_mm(
    soort: Verankeringssoort,
    l_b_rqd_mm: f64,
    diameter_mm: f64,
) -> (f64, OndergrensTerm) {
    let fractie = match soort {
        Verankeringssoort::Trek => L_B_MIN_FRACTIE_TREK,
        Verankeringssoort::Druk => L_B_MIN_FRACTIE_DRUK,
    };
    let kandidaten = [
        (fractie * l_b_rqd_mm, OndergrensTerm::FractieVanLbRqd),
        (L_B_MIN_DIAMETERS * diameter_mm, OndergrensTerm::TienDiameters),
        (L_B_MIN_ABSOLUUT_MM, OndergrensTerm::HonderdMillimeter),
    ];
    let mut beste = kandidaten[0];
    for k in kandidaten.iter().skip(1) {
        if k.0 > beste.0 {
            beste = *k;
        }
    }
    beste
}

/// De invoer van [`verankeringslengte`] — alles wat §8.4 nodig heeft voor ÉÉN
/// staaf.
///
/// σ_sd staat er niet in: die is per besluit gelijk aan f_yd (zie de
/// moduledocumentatie) en wordt door [`verankeringslengte`] zelf ingevuld. Zo
/// kan geen aanroeper l_bd per ongeluk lastgeval-afhankelijk maken.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VerankeringInvoer {
    /// Staafdiameter Φ, mm. Voor gepuntlaste netten van dubbele draden eerst
    /// door [`diameter_dubbele_draad_mm`] halen (art. 8.4.3(4)).
    pub diameter_mm: f64,
    /// f_ctk;0,05 van de betonsterkteklasse, N/mm² (tabel 3.1). De begrenzing
    /// op de waarde voor C60/75 gebeurt binnen de functie.
    pub f_ctk_005_mpa: f64,
    /// α_ct uit (3.16) — NB bij 3.1.6(2)P: 1,0.
    pub alpha_ct: f64,
    /// γ_C uit tabel 2.1N.
    pub gamma_c: f64,
    /// f_yd van het betonstaal, N/mm². Wordt als σ_sd in (8.3) gebruikt.
    pub f_yd_mpa: f64,
    /// Trek- of drukverankering.
    pub soort: Verankeringssoort,
    /// Vorm van het staafeinde (tabel 8.2, regel "Vorm van de staaf").
    pub vorm: Staafvorm,
    /// Waar de staaf lag ten opzichte van de stortrichting.
    pub stortpositie: Stortpositie,
    /// Hoogte h van het element, mm — nodig voor figuur 8.2.
    pub h_mm: f64,
    /// Hoogte van de staaf boven de onderrand, mm. `None` → de aanname die bij
    /// [`Stortpositie`] hoort.
    pub z_staaf_boven_onderrand_mm: Option<f64>,
    /// c_d volgens figuur 8.3, mm. Zie [`c_d_mm`].
    pub c_d_mm: f64,
    /// De ligging van de dwarswapening volgens figuur 8.4, voor K in α₃.
    pub k_waarde: KWaarde,
    /// λ = (ΣA_st − ΣA_st,min)/A_s. Zie [`lambda_8_2`].
    pub lambda: f64,
    /// Diameter Φ_t van de gelaste dwarsstaaf langs l_bd, mm; `None` als er
    /// geen ligt. Zie [`alpha_4`].
    pub phi_t_mm: Option<f64>,
    /// p — druk in dwarsrichting in de UGT langs l_bd, N/mm². 0 als er geen is.
    pub p_mpa: f64,
}

impl Default for VerankeringInvoer {
    /// De onbepaalde kant van de norm, niet de gunstige: geen opsluiting door
    /// dwarswapening (K = 0), geen gelaste dwarsstaaf, geen dwarsdruk. De
    /// materiaalgegevens staan bewust op 0 zodat [`verankeringslengte`] ze
    /// afkeurt in plaats van er stilzwijgend iets van te maken.
    fn default() -> Self {
        Self {
            diameter_mm: 0.0,
            f_ctk_005_mpa: 0.0,
            alpha_ct: crate::factors::ALPHA_CC, // α_ct = α_cc = 1,0 in de NB
            gamma_c: 1.5,
            f_yd_mpa: 0.0,
            soort: Verankeringssoort::Trek,
            vorm: Staafvorm::Recht,
            stortpositie: Stortpositie::Onderzijde,
            h_mm: 0.0,
            z_staaf_boven_onderrand_mm: None,
            c_d_mm: 0.0,
            k_waarde: KWaarde::DwarsstaafBinnen,
            lambda: 0.0,
            phi_t_mm: None,
            p_mpa: 0.0,
        }
    }
}

/// De vijf alfa-factoren met hun product en de herkomst per factor.
#[derive(Clone, Debug, PartialEq)]
pub struct AlfaFactoren {
    /// α₁ — vorm van de staaf.
    pub alpha_1: f64,
    /// α₂ — betondekking.
    pub alpha_2: f64,
    /// α₃ — opsluiting door niet-gelaste dwarswapening.
    pub alpha_3: f64,
    /// α₄ — opsluiting door gelaste dwarswapening.
    pub alpha_4: f64,
    /// α₅ — opsluiting door dwarsdruk.
    pub alpha_5: f64,
    /// Het product α₂·α₃·α₅ zoals het uit tabel 8.2 rolt.
    pub product_235_berekend: f64,
    /// Datzelfde product ná (8.5): ten minste 0,7.
    pub product_235_gebruikt: f64,
    /// `true` als (8.5) het product heeft opgetrokken.
    pub begrensd_door_8_5: bool,
    /// α₁·α₂·α₃·α₄·α₅ met (8.5) toegepast — de factor uit (8.4).
    pub product: f64,
    /// Eén regel per factor: welke tabelregel gold en waarom.
    pub herkomst: Vec<String>,
}

/// De uitgerekende verankeringslengte van één staaf, met de hele afleiding
/// eromheen.
///
/// Geen kaal getal: wie l_bd in een rapport zet, moet kunnen laten zien welke
/// aanhechtingsomstandigheden zijn aangehouden, welke alfa-factoren golden en
/// welke ondergrens maatgevend was.
#[derive(Clone, Debug, PartialEq)]
pub struct Verankering {
    /// Staafdiameter Φ, mm.
    pub diameter_mm: f64,
    /// Trek- of drukverankering.
    pub soort: Verankeringssoort,
    /// De aangehouden aanhechtingsomstandigheden.
    pub aanhechting: Aanhechting,
    /// Waarom die gelden.
    pub aanhechting_reden: String,
    /// De ingevoerde f_ctk;0,05, N/mm².
    pub f_ctk_005_ingevoerd_mpa: f64,
    /// De gebruikte f_ctk;0,05 ná de begrenzing van 8.4.2(2), N/mm².
    pub f_ctk_005_gebruikt_mpa: f64,
    /// `true` als de begrenzing op de waarde voor C60/75 heeft toegeslagen.
    pub begrensd_op_c60_75: bool,
    /// α_ct uit (3.16) zoals ingevuld.
    pub alpha_ct: f64,
    /// γ_C uit tabel 2.1N zoals ingevuld.
    pub gamma_c: f64,
    /// f_ctd volgens (3.16), N/mm².
    pub f_ctd_mpa: f64,
    /// η₁ volgens 8.4.2(2).
    pub eta_1: f64,
    /// η₂ volgens 8.4.2(2).
    pub eta_2: f64,
    /// f_bd volgens (8.2), N/mm².
    pub f_bd_mpa: f64,
    /// σ_sd zoals in (8.3) ingevuld — gelijk aan f_yd, zie de moduledoc.
    pub sigma_sd_mpa: f64,
    /// l_b,rqd volgens (8.3), mm.
    pub l_b_rqd_mm: f64,
    /// De vijf alfa-factoren.
    pub alfa: AlfaFactoren,
    /// α₁·α₂·α₃·α₄·α₅·l_b,rqd, dus (8.4) vóór de ondergrens, mm.
    pub l_bd_berekend_mm: f64,
    /// l_b,min volgens (8.6)/(8.7), mm.
    pub l_b_min_mm: f64,
    /// Welke van de drie termen l_b,min bepaalde.
    pub l_b_min_term: OndergrensTerm,
    /// `true` als l_b,min maatgevend is voor l_bd.
    pub ondergrens_maatgevend: bool,
    /// De rekenwaarde van de verankeringslengte, mm — het antwoord.
    pub l_bd_mm: f64,
    /// Kanttekeningen bij deze staaf: aannamen, afwijkingen, grenzen.
    pub toelichting: Vec<String>,
}

/// l_bd van één staaf volgens §8.4 — vergelijkingen (8.2), (8.3), (8.4), (8.5)
/// en (8.6)/(8.7).
///
/// `Err` bij invoer waarmee de norm niet te volgen is: een niet-positieve
/// diameter, treksterkte, γ_C of f_yd. Een verzonnen getal is hier gevaarlijker
/// dan een foutmelding — l_bd bepaalt waar een staaf mag ophouden.
pub fn verankeringslengte(inv: &VerankeringInvoer) -> Result<Verankering, String> {
    if !(inv.diameter_mm > 0.0) {
        return Err("De staafdiameter Φ moet groter dan nul zijn.".into());
    }
    if !(inv.f_ctk_005_mpa > 0.0) {
        return Err("f_ctk;0,05 moet groter dan nul zijn; zonder treksterkte is er geen f_bd.".into());
    }
    if !(inv.gamma_c > 0.0) {
        return Err("γ_C moet groter dan nul zijn.".into());
    }
    if !(inv.alpha_ct > 0.0) {
        return Err("α_ct moet groter dan nul zijn.".into());
    }
    if !(inv.f_yd_mpa > 0.0) {
        return Err("f_yd moet groter dan nul zijn; σ_sd in (8.3) is per besluit f_yd.".into());
    }

    let mut toelichting: Vec<String> = Vec::new();

    // (8.2) — f_bd.
    let (f_ctk_gebruikt, begrensd) = f_ctk_005_begrensd_mpa(inv.f_ctk_005_mpa);
    if begrensd {
        toelichting.push(format!(
            "f_ctk;0,05 is volgens art. 8.4.2(2) begrensd op de waarde voor C60/75: van \
             {} naar {} N/mm². De norm noemt als reden de toenemende brosheid van beton met \
             hogere sterkte; de begrenzing mag alleen vervallen als is getoetst dat de \
             gemiddelde aanhechtsterkte boven die grens toeneemt.",
            nl(inv.f_ctk_005_mpa, 1),
            nl(f_ctk_gebruikt, 1)
        ));
    }
    let f_ctd = f_ctd_mpa(f_ctk_gebruikt, inv.alpha_ct, inv.gamma_c);
    let (aanhechting_soort, aanhechting_reden) =
        aanhechting(inv.stortpositie, inv.h_mm, inv.z_staaf_boven_onderrand_mm);
    let eta_1 = aanhechting_soort.eta_1();
    let eta_2 = eta_2(inv.diameter_mm);
    if inv.diameter_mm > ETA_2_GRENSDIAMETER_MM {
        toelichting.push(format!(
            "Φ = {} mm > {} mm, dus η₂ = (132 − Φ)/100 = {} volgens art. 8.4.2(2); f_bd is \
             daarmee {} % lager dan bij een staaf tot en met 32 mm.",
            nl(inv.diameter_mm, 0),
            nl(ETA_2_GRENSDIAMETER_MM, 0),
            nl(eta_2, 3),
            nl((1.0 - eta_2) * 100.0, 1)
        ));
    }
    let f_bd = f_bd_mpa(f_ctd, eta_1, eta_2);
    if !(f_bd > 0.0) {
        return Err("f_bd is niet positief; l_b,rqd is dan niet te bepalen.".into());
    }

    // (8.3) — l_b,rqd, met σ_sd = f_yd.
    let sigma_sd = inv.f_yd_mpa;
    let l_b_rqd = l_b_rqd_mm(inv.diameter_mm, sigma_sd, f_bd);
    toelichting.push(
        "σ_sd in (8.3) is gelijk aan f_yd genomen. De normtekst wijst naar 'de rekenwaarde van \
         de spanning in de staaf in het punt van waaruit de verankering is gemeten', dus naar de \
         WERKELIJKE staafspanning. Met die lezing wordt l_bd combinatie-afhankelijk en verandert \
         de dekkingslijn per belastingcombinatie terwijl de wapening dat niet doet. Met f_yd is \
         l_bd één eigenschap van de staaf. Het is een bewuste afwijking naar de VEILIGE kant: \
         σ_sd ≤ f_yd, dus deze l_bd is nooit korter dan de norm eist."
            .to_string(),
    );

    // Tabel 8.2 — de alfa-factoren.
    let a1 = alpha_1(inv.vorm, inv.soort, inv.c_d_mm, inv.diameter_mm);
    let a2 = alpha_2(inv.vorm, inv.soort, inv.c_d_mm, inv.diameter_mm);
    let k = inv.k_waarde.k();
    let a3 = alpha_3(inv.soort, k, inv.lambda);
    let a4 = alpha_4(inv.phi_t_mm, inv.diameter_mm);
    let a5 = alpha_5(inv.soort, inv.p_mpa);

    let mut herkomst: Vec<String> = Vec::new();
    herkomst.push(match (inv.vorm, inv.soort) {
        (Staafvorm::Recht, _) => format!("α₁ = {} — rechte staaf (tabel 8.2).", nl(a1, 3)),
        (Staafvorm::AndersDanRecht, Verankeringssoort::Druk) => format!(
            "α₁ = {} — drukstaaf. Art. 8.4.1(3): ombuigingen en haken dragen niet bij aan de \
             verankering van drukstaven.",
            nl(a1, 3)
        ),
        (Staafvorm::AndersDanRecht, Verankeringssoort::Trek) => format!(
            "α₁ = {} — anders dan recht (figuur 8.1 b/c/d) met c_d = {} mm {} 3Φ = {} mm.",
            nl(a1, 3),
            nl(inv.c_d_mm, 1),
            if inv.c_d_mm > 3.0 * inv.diameter_mm { ">" } else { "≤" },
            nl(3.0 * inv.diameter_mm, 1)
        ),
    });
    herkomst.push(match inv.soort {
        Verankeringssoort::Druk => {
            format!("α₂ = {} — drukstaaf; tabel 8.2 geeft daar 1,0.", nl(a2, 3))
        }
        Verankeringssoort::Trek => {
            let (term, symbool) = match inv.vorm {
                Staafvorm::Recht => (inv.diameter_mm, "Φ"),
                Staafvorm::AndersDanRecht => (3.0 * inv.diameter_mm, "3Φ"),
            };
            let ruw = 1.0 - ALFA_2_HELLING * (inv.c_d_mm - term) / inv.diameter_mm;
            let mut s = format!(
                "α₂ = {} — 1 − 0,15·(c_d − {})/Φ met c_d = {} mm en Φ = {} mm, dus {}.",
                nl(a2, 3),
                symbool,
                nl(inv.c_d_mm, 1),
                nl(inv.diameter_mm, 1),
                nl(ruw, 3)
            );
            if (a2 - ruw).abs() > 1e-9 {
                s.push_str(&format!(
                    " Begrensd door tabel 8.2 op 0,7 ≤ α₂ ≤ 1,0, dus {}.",
                    nl(a2, 3)
                ));
            }
            s
        }
    });
    herkomst.push(match inv.soort {
        Verankeringssoort::Druk => {
            format!("α₃ = {} — drukstaaf; tabel 8.2 geeft daar 1,0.", nl(a3, 3))
        }
        Verankeringssoort::Trek => {
            let ruw = 1.0 - k * inv.lambda;
            let mut s = format!(
                "α₃ = {} — 1 − K·λ met K = {} ({}) en λ = {}, dus {}.",
                nl(a3, 3),
                nl(k, 2),
                inv.k_waarde.omschrijving(),
                nl(inv.lambda, 3),
                nl(ruw, 3)
            );
            if (a3 - ruw).abs() > 1e-9 {
                s.push_str(&format!(
                    " Begrensd door tabel 8.2 op 0,7 ≤ α₃ ≤ 1,0, dus {}.",
                    nl(a3, 3)
                ));
            }
            s
        }
    });
    herkomst.push(match inv.phi_t_mm {
        Some(phi_t) if phi_t > ALFA_4_MIN_PHI_T_FACTOR * inv.diameter_mm => format!(
            "α₄ = {} — gelaste dwarsstaaf volgens figuur 8.1(e) met Φ_t = {} mm > 0,6Φ = {} mm.",
            nl(a4, 3),
            nl(phi_t, 1),
            nl(ALFA_4_MIN_PHI_T_FACTOR * inv.diameter_mm, 1)
        ),
        Some(phi_t) => format!(
            "α₄ = {} — er ligt wel een gelaste dwarsstaaf, maar Φ_t = {} mm ≤ 0,6Φ = {} mm; \
             art. 8.4.4(1) laat hem dan niet meetellen.",
            nl(a4, 3),
            nl(phi_t, 1),
            nl(ALFA_4_MIN_PHI_T_FACTOR * inv.diameter_mm, 1)
        ),
        None => format!("α₄ = {} — geen gelaste dwarswapening langs l_bd.", nl(a4, 3)),
    });
    herkomst.push(match inv.soort {
        Verankeringssoort::Druk => format!(
            "α₅ = {} — tabel 8.2 zet in de drukkolom een streepje: niet van toepassing, dus \
             rekenkundig 1,0.",
            nl(a5, 3)
        ),
        Verankeringssoort::Trek => {
            let ruw = 1.0 - ALFA_5_HELLING * inv.p_mpa;
            let mut s = format!(
                "α₅ = {} — 1 − 0,04·p met p = {} N/mm², dus {}.",
                nl(a5, 3),
                nl(inv.p_mpa, 2),
                nl(ruw, 3)
            );
            if (a5 - ruw).abs() > 1e-9 {
                s.push_str(&format!(
                    " Begrensd door tabel 8.2 op 0,7 ≤ α₅ ≤ 1,0, dus {}.",
                    nl(a5, 3)
                ));
            }
            s
        }
    });

    // (8.5) — het product α₂·α₃·α₅ is ten minste 0,7.
    let product_235 = a2 * a3 * a5;
    let begrensd_235 = product_235 < PRODUCT_A2_A3_A5_MIN - 1e-12;
    let product_235_gebruikt = if begrensd_235 { PRODUCT_A2_A3_A5_MIN } else { product_235 };
    if begrensd_235 {
        toelichting.push(format!(
            "Vergelijking (8.5): het product (α₂·α₃·α₅) = {} ligt onder 0,7 en is daarom op 0,7 \
             gesteld. Dat is een grens op het PRODUCT, bovenop de grens 0,7 ≤ α ≤ 1,0 die elke \
             factor afzonderlijk al heeft; zonder (8.5) zou l_bd hier {} % korter uitvallen.",
            nl(product_235, 4),
            nl((1.0 - product_235 / PRODUCT_A2_A3_A5_MIN) * 100.0, 1)
        ));
    }
    let product = a1 * product_235_gebruikt * a4;

    // (8.4) met (8.6)/(8.7).
    let l_bd_berekend = product * l_b_rqd;
    let (l_b_min, term) = l_b_min_mm(inv.soort, l_b_rqd, inv.diameter_mm);
    let ondergrens_maatgevend = l_b_min > l_bd_berekend;
    let l_bd = l_bd_berekend.max(l_b_min);
    if ondergrens_maatgevend {
        toelichting.push(format!(
            "De ondergrens is maatgevend: α₁·α₂·α₃·α₄·α₅·l_b,rqd = {} mm ligt onder \
             l_b,min = {} mm uit ({}). Maatgevende term: {}.",
            nl(l_bd_berekend, 1),
            nl(l_b_min, 1),
            match inv.soort {
                Verankeringssoort::Trek => "8.6",
                Verankeringssoort::Druk => "8.7",
            },
            match term {
                OndergrensTerm::FractieVanLbRqd => match inv.soort {
                    Verankeringssoort::Trek => "0,3·l_b,rqd",
                    Verankeringssoort::Druk => "0,6·l_b,rqd",
                },
                OndergrensTerm::TienDiameters => "10Φ",
                OndergrensTerm::HonderdMillimeter => "100 mm",
            }
        ));
    }

    Ok(Verankering {
        diameter_mm: inv.diameter_mm,
        soort: inv.soort,
        aanhechting: aanhechting_soort,
        aanhechting_reden,
        f_ctk_005_ingevoerd_mpa: inv.f_ctk_005_mpa,
        f_ctk_005_gebruikt_mpa: f_ctk_gebruikt,
        begrensd_op_c60_75: begrensd,
        alpha_ct: inv.alpha_ct,
        gamma_c: inv.gamma_c,
        f_ctd_mpa: f_ctd,
        eta_1,
        eta_2,
        f_bd_mpa: f_bd,
        sigma_sd_mpa: sigma_sd,
        l_b_rqd_mm: l_b_rqd,
        alfa: AlfaFactoren {
            alpha_1: a1,
            alpha_2: a2,
            alpha_3: a3,
            alpha_4: a4,
            alpha_5: a5,
            product_235_berekend: product_235,
            product_235_gebruikt,
            begrensd_door_8_5: begrensd_235,
            product,
            herkomst,
        },
        l_bd_berekend_mm: l_bd_berekend,
        l_b_min_mm: l_b_min,
        l_b_min_term: term,
        ondergrens_maatgevend,
        l_bd_mm: l_bd,
        toelichting,
    })
}

/// De afleiding van [`verankeringslengte`] als reeks deelstappen — formule
/// symbolisch, formule ingevuld, uitkomst, vindplaats en kanttekeningen.
///
/// Deze functie rekent NIETS opnieuw uit; zij schrijft op wat
/// [`verankeringslengte`] al heeft bepaald. Dat is dezelfde regel als in
/// [`crate::deelstappen`]: twee plaatsen die hetzelfde uitrekenen gaan vroeg of
/// laat uiteenlopen.
pub fn verankering_deelstappen(v: &Verankering) -> Vec<Deelstap> {
    let mut stappen = Vec::new();

    // Stap 1 — f_ctd.
    let mut notes_ctd = vec![
        "α_ct volgens de Nederlandse bijlage bij 3.1.6(2)P: 'De waarde van α_ct moet gelijk aan \
         1,0 zijn genomen.' Dat is gelijk aan de aanbevolen waarde — de NB wijkt hier niet af."
            .to_string(),
    ];
    if v.begrensd_op_c60_75 {
        notes_ctd.push(format!(
            "f_ctk;0,05 is van {} naar {} N/mm² teruggebracht: art. 8.4.2(2) begrenst hem op de \
             waarde voor C60/75.",
            nl(v.f_ctk_005_ingevoerd_mpa, 1),
            nl(v.f_ctk_005_gebruikt_mpa, 1)
        ));
    }
    stappen.push(stap(
        "f_ctd",
        "Rekenwaarde van de betontreksterkte",
        "f_{ctd}",
        "art. 3.1.6(2)P (3.16) met de begrenzing van art. 8.4.2(2)",
        r"f_{ctd} = \frac{\alpha_{ct}\,f_{ctk;0{,}05}}{\gamma_C}".to_string(),
        format!(
            r"f_{{ctd}} = \frac{{{} \cdot {}}}{{{}}} = {}\ \mathrm{{N/mm^2}}",
            lx(v.alpha_ct, 1),
            lx(v.f_ctk_005_gebruikt_mpa, 1),
            lx(v.gamma_c, 1),
            lx(v.f_ctd_mpa, 3)
        ),
        vec![
            nv("f_ctk;0,05", v.f_ctk_005_gebruikt_mpa, "N/mm²"),
            nv("f_ctd", v.f_ctd_mpa, "N/mm²"),
        ],
        Some(v.f_ctd_mpa),
        "N/mm²",
        notes_ctd,
    ));

    // Stap 2 — f_bd.
    stappen.push(stap(
        "f_bd",
        "Uiterst opneembare aanhechtspanning",
        "f_{bd}",
        "art. 8.4.2(2) (8.2)",
        r"f_{bd} = 2{,}25\,\eta_1\,\eta_2\,f_{ctd}".to_string(),
        format!(
            r"f_{{bd}} = 2{{,}}25 \cdot {} \cdot {} \cdot {} = {}\ \mathrm{{N/mm^2}}",
            lx(v.eta_1, 2),
            lx(v.eta_2, 3),
            lx(v.f_ctd_mpa, 3),
            lx(v.f_bd_mpa, 3)
        ),
        vec![
            nv("η₁", v.eta_1, "-"),
            nv("η₂", v.eta_2, "-"),
            nv("f_ctd", v.f_ctd_mpa, "N/mm²"),
            nv("f_bd", v.f_bd_mpa, "N/mm²"),
        ],
        Some(v.f_bd_mpa),
        "N/mm²",
        vec![
            v.aanhechting_reden.clone(),
            format!(
                "η₂ = {} bij Φ = {} mm — art. 8.4.2(2): 1,0 tot en met 32 mm, (132 − Φ)/100 \
                 daarboven.",
                nl(v.eta_2, 3),
                nl(v.diameter_mm, 0)
            ),
            "(8.2) geldt voor GERIBDE staven; voor gladde staven geeft §8.4 geen f_bd."
                .to_string(),
        ],
    ));

    // Stap 3 — l_b,rqd.
    stappen.push(stap(
        "l_b_rqd",
        "Basisverankeringslengte",
        "l_{b,rqd}",
        "art. 8.4.3(2) (8.3)",
        r"l_{b,rqd} = \frac{\Phi}{4}\cdot\frac{\sigma_{sd}}{f_{bd}}".to_string(),
        format!(
            r"l_{{b,rqd}} = \frac{{{}}}{{4}} \cdot \frac{{{}}}{{{}}} = {}\ \mathrm{{mm}}",
            lx(v.diameter_mm, 0),
            lx(v.sigma_sd_mpa, 1),
            lx(v.f_bd_mpa, 3),
            lx(v.l_b_rqd_mm, 1)
        ),
        vec![
            nv("Φ", v.diameter_mm, "mm"),
            nv("σ_sd", v.sigma_sd_mpa, "N/mm²"),
            nv("f_bd", v.f_bd_mpa, "N/mm²"),
            nv("l_b,rqd", v.l_b_rqd_mm, "mm"),
        ],
        Some(v.l_b_rqd_mm),
        "mm",
        vec![
            "σ_sd is gelijk aan f_yd genomen. De norm bedoelt de werkelijke staafspanning; met \
             f_yd is l_bd één eigenschap van de staaf in plaats van een grootheid die per \
             belastingcombinatie verandert. De afwijking ligt aan de veilige kant."
                .to_string(),
        ],
    ));

    // Stap 4 — de alfa-factoren.
    let mut notes_alfa = v.alfa.herkomst.clone();
    if v.alfa.begrensd_door_8_5 {
        notes_alfa.push(format!(
            "(8.5): het product (α₂·α₃·α₅) = {} is op 0,7 gesteld.",
            nl(v.alfa.product_235_berekend, 4)
        ));
    }
    stappen.push(stap(
        "alfa",
        "Coëfficiënten α₁ tot en met α₅",
        r"\alpha_1\alpha_2\alpha_3\alpha_4\alpha_5",
        "tabel 8.2 met (8.5)",
        r"\alpha_1\,\alpha_2\,\alpha_3\,\alpha_4\,\alpha_5 \quad\text{met}\quad (\alpha_2\alpha_3\alpha_5) \geq 0{,}7"
            .to_string(),
        format!(
            r"{} \cdot {} \cdot {} \cdot {} \cdot {} = {}",
            lx(v.alfa.alpha_1, 3),
            lx(v.alfa.alpha_2, 3),
            lx(v.alfa.alpha_3, 3),
            lx(v.alfa.alpha_4, 3),
            lx(v.alfa.alpha_5, 3),
            lx(v.alfa.product, 4)
        ),
        vec![
            nv("α₁", v.alfa.alpha_1, "-"),
            nv("α₂", v.alfa.alpha_2, "-"),
            nv("α₃", v.alfa.alpha_3, "-"),
            nv("α₄", v.alfa.alpha_4, "-"),
            nv("α₅", v.alfa.alpha_5, "-"),
        ],
        Some(v.alfa.product),
        "-",
        notes_alfa,
    ));

    // Stap 5 — l_b,min.
    stappen.push(stap(
        "l_b_min",
        "Minimumverankeringslengte",
        "l_{b,min}",
        match v.soort {
            Verankeringssoort::Trek => "art. 8.4.4(1) (8.6)",
            Verankeringssoort::Druk => "art. 8.4.4(1) (8.7)",
        },
        match v.soort {
            Verankeringssoort::Trek => {
                r"l_{b,min} \geq \max\{0{,}3\,l_{b,rqd};\ 10\,\Phi;\ 100\ \mathrm{mm}\}".to_string()
            }
            Verankeringssoort::Druk => {
                r"l_{b,min} \geq \max\{0{,}6\,l_{b,rqd};\ 10\,\Phi;\ 100\ \mathrm{mm}\}".to_string()
            }
        },
        format!(
            r"l_{{b,min}} = \max\{{{} \cdot {};\ 10 \cdot {};\ 100\}} = {}\ \mathrm{{mm}}",
            lx(
                match v.soort {
                    Verankeringssoort::Trek => L_B_MIN_FRACTIE_TREK,
                    Verankeringssoort::Druk => L_B_MIN_FRACTIE_DRUK,
                },
                1
            ),
            lx(v.l_b_rqd_mm, 1),
            lx(v.diameter_mm, 0),
            lx(v.l_b_min_mm, 1)
        ),
        vec![nv("l_b,min", v.l_b_min_mm, "mm")],
        Some(v.l_b_min_mm),
        "mm",
        vec![format!(
            "Maatgevende term: {}.",
            match v.l_b_min_term {
                OndergrensTerm::FractieVanLbRqd => match v.soort {
                    Verankeringssoort::Trek => "0,3·l_b,rqd",
                    Verankeringssoort::Druk => "0,6·l_b,rqd",
                },
                OndergrensTerm::TienDiameters => "10Φ",
                OndergrensTerm::HonderdMillimeter => "100 mm",
            }
        )],
    ));

    // Stap 6 — l_bd.
    let mut notes_lbd = v.toelichting.clone();
    notes_lbd.push(format!(
        "l_bd is gemeten langs de hartlijn van de staaf bij omgebogen staven (art. 8.4.3(3), \
         figuur 8.1a). De hier berekende {} mm is de lengte van de staaf, niet de rechte \
         projectie ervan.",
        nl(v.l_bd_mm, 1)
    ));
    stappen.push(stap(
        "l_bd",
        "Rekenwaarde van de verankeringslengte",
        "l_{bd}",
        "art. 8.4.4(1) (8.4)",
        r"l_{bd} = \alpha_1\alpha_2\alpha_3\alpha_4\alpha_5\,l_{b,rqd} \geq l_{b,min}".to_string(),
        format!(
            r"l_{{bd}} = \max\left({} \cdot {};\ {}\right) = {}\ \mathrm{{mm}}",
            lx(v.alfa.product, 4),
            lx(v.l_b_rqd_mm, 1),
            lx(v.l_b_min_mm, 1),
            lx(v.l_bd_mm, 1)
        ),
        vec![
            nv("l_b,rqd", v.l_b_rqd_mm, "mm"),
            nv("l_b,min", v.l_b_min_mm, "mm"),
            nv("l_bd", v.l_bd_mm, "mm"),
        ],
        Some(v.l_bd_mm),
        "mm",
        notes_lbd,
    ));

    stappen
}

// ---------------------------------------------------------------------------
// §9.2.1.3 — de verschuivingsregel en het lineaire krachtverloop
// ---------------------------------------------------------------------------

/// Waarop a_l berust: het vakwerkmodel of de vaste waarde d.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Verschuivingsgrondslag {
    /// Element MET dwarskrachtwapening — (9.2), art. 9.2.1.3(2).
    MetDwarskrachtwapening {
        /// Inwendige hefboomsarm z, mm.
        z_mm: f64,
        /// cot θ van de betondrukdiagonaal.
        cot_theta: f64,
        /// cot α van de dwarskrachtwapening; 0 bij rechte beugels (α = 90°).
        cot_alpha: f64,
    },
    /// Element ZONDER dwarskrachtwapening — a_l = d, art. 6.2.2(5).
    ZonderDwarskrachtwapening {
        /// Nuttige hoogte d, mm.
        d_mm: f64,
    },
}

/// De verschuiving van de momentenlijn, met haar herkomst.
#[derive(Clone, Debug, PartialEq)]
pub struct Verschuiving {
    /// a_l in mm — een LENGTE, geen richting.
    pub a_l_mm: f64,
    /// Waarop zij berust.
    pub grondslag: Verschuivingsgrondslag,
    /// De vindplaats.
    pub artikel: &'static str,
    /// Kanttekeningen.
    pub toelichting: Vec<String>,
}

/// a_l — de verschuiving van de momentenlijn volgens §9.2.1.3(2) en 6.2.2(5).
///
/// ```text
///   met dwarskrachtwapening:    a_l = z·(cot θ − cot α)/2      (9.2)
///   zonder dwarskrachtwapening: a_l = d                        6.2.2(5)
/// ```
///
/// **De verschuiving gaat in de ONGUNSTIGE richting.** Art. 6.2.2(5) zegt het
/// met zoveel woorden: "Voor het berekenen van de langswapening behoort in het
/// door buiging gescheurde deel de M_Ed-lijn over een afstand a_l = d in de
/// ongunstige richting te zijn verschoven." Deze functie levert alleen de
/// GROOTTE; welke kant dat op is, hangt af van het momentenverloop en is de
/// verantwoordelijkheid van de dekkingslijn die haar aanroept. Voor een veldmoment
/// betekent 'ongunstig' naar de steunpunten toe, voor een steunpuntsmoment het
/// veld in — telkens zó dat de trekkracht op een gegeven plaats groter wordt.
///
/// Art. 9.2.1.3(2) noemt de verschuivingsregel voor elementen MET
/// dwarskrachtwapening een ALTERNATIEF voor het rekenen met ΔF_td volgens
/// 6.2.3(7). De twee wegen zijn gelijkwaardig, niet cumulatief.
pub fn verschuiving(grondslag: Verschuivingsgrondslag) -> Verschuiving {
    match grondslag {
        Verschuivingsgrondslag::MetDwarskrachtwapening { z_mm, cot_theta, cot_alpha } => {
            Verschuiving {
                a_l_mm: z_mm * (cot_theta - cot_alpha) / 2.0,
                grondslag,
                artikel: "art. 9.2.1.3(2) (9.2)",
                toelichting: vec![
                    "Alternatief voor ΔF_td volgens 6.2.3(7); de twee wegen zijn gelijkwaardig \
                     en mogen niet worden opgeteld."
                        .to_string(),
                    "De symbolen z, θ en α zijn gedefinieerd in 6.2.3. Bij rechte beugels \
                     (α = 90°) is cot α = 0."
                        .to_string(),
                    "De verschuiving gaat in de ONGUNSTIGE richting; deze waarde is de grootte, \
                     niet de richting."
                        .to_string(),
                ],
            }
        }
        Verschuivingsgrondslag::ZonderDwarskrachtwapening { d_mm } => Verschuiving {
            a_l_mm: d_mm,
            grondslag,
            artikel: "art. 6.2.2(5), aangehaald in art. 9.2.1.3(2)",
            toelichting: vec![
                "Art. 6.2.2(5): de M_Ed-lijn wordt in het door buiging gescheurde deel over \
                 a_l = d in de ONGUNSTIGE richting verschoven."
                    .to_string(),
                "Deze waarde is de grootte van de verschuiving, niet de richting."
                    .to_string(),
            ],
        },
    }
}

/// De fractie van de staafkracht die op afstand `x` vanaf het staafeinde kan
/// worden opgenomen — art. 9.2.1.3(3), figuur 9.2.
///
/// "Met de weerstand van staven binnen hun verankeringslengte mag rekening zijn
/// gehouden, uitgaande van een LINEAIR krachtverloop, zie figuur 9.2. Als
/// conservatieve vereenvoudiging mag deze bijdrage zijn verwaarloosd."
///
/// Dit is de schuine tak van de dekkingslijn: op het staafeinde zelf is de
/// opneembare kracht nul, en pas op l_bd van het einde is zij volledig. De
/// uitkomst ligt tussen 0 en 1.
pub fn opneembare_krachtfractie(x_vanaf_staafeinde_mm: f64, l_bd_mm: f64) -> f64 {
    if !(l_bd_mm > 0.0) {
        return 0.0;
    }
    (x_vanaf_staafeinde_mm / l_bd_mm).clamp(0.0, 1.0)
}

/// De minimale verankeringslengte van een OPGEBOGEN staaf die bijdraagt aan de
/// dwarskrachtweerstand — art. 9.2.1.3(4).
///
/// "De verankeringslengte van een opgebogen staaf die bijdraagt aan de
/// dwarskrachtweerstand behoort niet kleiner te zijn dan 1,3·l_bd in de trekzone
/// en dan 0,7·l_bd in de drukzone. Dit is gemeten vanaf het snijpunt van de
/// assen van de opgebogen staaf en de langswapening."
pub fn min_verankering_opgebogen_staaf_mm(l_bd_mm: f64, in_trekzone: bool) -> f64 {
    if in_trekzone {
        OPGEBOGEN_TREKZONE_FACTOR * l_bd_mm
    } else {
        OPGEBOGEN_DRUKZONE_FACTOR * l_bd_mm
    }
}

// ---------------------------------------------------------------------------
// §9.2.1.4 en §9.2.1.5 — de onderwapening bij de steunpunten
// ---------------------------------------------------------------------------

/// De oppervlakte onderwapening die tot in het steunpunt moet doorlopen —
/// §9.2.1.4(1), en via §9.2.1.5(1) ook bij tussensteunpunten.
///
/// A_s,steunpunt ≥ β₂·A_s,veld met β₂ = 0,25 volgens de Nederlandse bijlage.
/// De EN-tekst geeft dezelfde aanbevolen waarde; de NB wijkt hier NIET af.
///
/// De eis geldt volgens de normtekst bij "eindopleggingen waarbij weinig of
/// geen eindinklemming in de berekening is aangenomen".
pub fn as_steunpunt_vereist_mm2(as_veld_mm2: f64) -> f64 {
    BETA_2 * as_veld_mm2
}

/// F_Ed — de bij een eindoplegging te verankeren trekkracht volgens de
/// verschuivingsregel, vergelijking (9.3), art. 9.2.1.4(2).
///
/// ```text
///   F_Ed = |V_Ed|·a_l/z + N_Ed
/// ```
///
/// N_Ed is "de normaalkracht die moet zijn opgeteld bij of afgetrokken van de
/// trekkracht". Deze functie telt hem op zoals (9.3) hem schrijft; de
/// tekenafspraak van de aanroeper bepaalt dus of hij de trekkracht verhoogt of
/// verlaagt. In de tekenafspraak van deze kern aan de buitengrens (trek
/// positief) verhoogt een trekkracht F_Ed, en dat is ook wat de norm bedoelt.
///
/// Art. 9.2.1.4(2) noemt naast deze weg ook 6.2.3(7) (ΔF_td) voor elementen met
/// dwarskrachtwapening. Bij a_l = z·(cot θ − cot α)/2 leveren beide precies
/// hetzelfde: |V_Ed|·a_l/z = 0,5·|V_Ed|·(cot θ − cot α) = ΔF_td uit (6.18).
pub fn f_ed_eindoplegging_kn(v_ed_kn: f64, a_l_mm: f64, z_mm: f64, n_ed_kn: f64) -> f64 {
    v_ed_kn.abs() * a_l_mm / z_mm + n_ed_kn
}

/// Het staafeinde bij een tussensteunpunt, voor de drie takken van §9.2.1.5(2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tussensteunpuntvorm {
    /// Rechte staaf: ≥ 10Φ.
    RechteStaaf,
    /// Haak of ombuiging met een staafdiameter van ten minste 16 mm: ≥ Ø_m.
    HaakOfOmbuigingVanaf16mm,
    /// Alle andere gevallen: ≥ 2·Ø_m.
    Overig,
}

/// De minimale verankeringslengte bij een TUSSENsteunpunt — §9.2.1.5(2).
///
/// "De verankeringslengte behoort niet kleiner te zijn dan 10Φ (voor rechte
/// staven) of niet kleiner dan de doorndiameter (voor haken en ombuigingen met
/// staafdiameters ten minste gelijk aan 16 mm) of tweemaal de doorndiameter (in
/// andere gevallen) (zie figuur 9.4(a)). Deze minimumwaarden zijn in het
/// algemeen geldig maar een nauwkeuriger berekening kan zijn uitgevoerd volgens
/// 6.6."
///
/// `doorndiameter_mm` (Ø_m) is INVOER en wordt hier niet uit Φ afgeleid: de
/// minimale doorndiameter staat in tabel 8.1N van §8.3, en die tabel is voor
/// deze module niet uitgelezen. Wie een waarde nodig heeft, leest hem daar.
pub fn min_verankering_tussensteunpunt_mm(
    vorm: Tussensteunpuntvorm,
    diameter_mm: f64,
    doorndiameter_mm: f64,
) -> f64 {
    match vorm {
        Tussensteunpuntvorm::RechteStaaf => TUSSENSTEUNPUNT_DIAMETERS * diameter_mm,
        Tussensteunpuntvorm::HaakOfOmbuigingVanaf16mm => doorndiameter_mm,
        Tussensteunpuntvorm::Overig => 2.0 * doorndiameter_mm,
    }
}

// ---------------------------------------------------------------------------
// §8.7.3 — OVERLAPPINGEN. Bewust apart: deze lengte hoort NIET in de
// weerstandslijn van de dekkingsberekening.
// ---------------------------------------------------------------------------

/// α₆ — de coëfficiënt voor het overlappingspercentage, §8.7.3(1) met tabel
/// NB 8.3.
///
/// **Hier wijkt de Nederlandse bijlage wél af.** De EN-tabel 8.3 is in de
/// Nederlandse uitgave DOORGEHAALD en vervangen door tabel NB 8.3, die er een
/// regel bij zet die de EN-tekst niet heeft:
///
/// | verankering | < 25 % | 33 % | 50 % | > 50 % |
/// |---|---|---|---|---|
/// | trek | 1 | 1,15 | 1,4 | 1,5 |
/// | **druk** | **1** | **1** | **1** | **1** |
///
/// Voor DRUKverankeringen is α₆ dus altijd 1, ongeacht het percentage. Wie de
/// EN-tabel gebruikt, rekent in Nederland een drukoverlapping tot 50 % te lang.
///
/// Voor TREK is hier de formule van §8.7.3(1) aangehouden — α₆ = (ρ₁/25)^0,5,
/// niet groter dan 1,5 en niet kleiner dan 1,0 — en niet de tabel. Die formule
/// is in de Nederlandse uitgave NIET doorgehaald en is de eigenlijke regel; de
/// tabel is er de afronding van. Het verschil is klein en altijd naar boven:
/// bij 33 % geeft de formule 1,1489 tegen 1,15 in de tabel, bij 50 % 1,4142
/// tegen 1,4. De NB-opmerking "Tussenliggende waarden mogen zijn bepaald door
/// interpolatie" is met de formule niet meer nodig.
///
/// `percentage` is ρ₁: "het percentage is van de wapening die binnen 0,65·l₀
/// vanaf het midden van de beschouwde overlappingslengte is overlapt (zie
/// figuur 8.8)" — dus 50 voor 50 %, niet 0,5.
pub fn alpha_6(percentage_overlapt: f64, soort: Verankeringssoort) -> f64 {
    match soort {
        // Tabel NB 8.3, regel "Druk": 1 bij elk percentage.
        Verankeringssoort::Druk => 1.0,
        Verankeringssoort::Trek => (percentage_overlapt / 25.0).sqrt().clamp(1.0, 1.5),
    }
}

/// De uitkomst van [`overlappingslengte`].
#[derive(Clone, Debug, PartialEq)]
pub struct Overlapping {
    /// α₆ volgens tabel NB 8.3 / de formule van §8.7.3(1).
    pub alpha_6: f64,
    /// α₁·α₂·α₃·α₅·α₆·l_b,rqd, dus (8.10) vóór de ondergrens, mm.
    pub l_0_berekend_mm: f64,
    /// l₀,min volgens (8.11), mm.
    pub l_0_min_mm: f64,
    /// Welke term l₀,min bepaalde.
    pub l_0_min_term: OndergrensTerm,
    /// De rekenwaarde van de overlappingslengte, mm.
    pub l_0_mm: f64,
    /// Kanttekeningen.
    pub toelichting: Vec<String>,
}

/// l₀ — de rekenwaarde van de overlappingslengte, §8.7.3(1), (8.10) en (8.11).
///
/// ```text
///   l₀ = α₁·α₂·α₃·α₅·α₆·l_b,rqd ≥ l₀,min                      (8.10)
///   l₀,min ≥ max{0,3·α₆·l_b,rqd; 15Φ; 200 mm}                  (8.11)
/// ```
///
/// **α₄ komt in (8.10) NIET voor** — de vijf factoren van een overlapping zijn
/// α₁, α₂, α₃, α₅ en α₆, niet α₄. En voor α₃ geldt een andere A_st,min: niet
/// 0,25·A_s uit tabel 8.2 maar 1,0·A_s·(σ_sd/f_yd) volgens §8.7.3(1). Gebruik
/// daarvoor [`lambda_8_7_3`] en niet [`lambda_8_2`].
///
/// Deze lengte hoort **niet** in de weerstandslijn van de dekkingsberekening.
/// Een overlapping is een uitvoeringsgegeven; een dekkingslijn die er
/// stilzwijgend mee zou rekenen, toont wapening die in de bak niet ligt.
#[allow(clippy::too_many_arguments)]
pub fn overlappingslengte(
    l_b_rqd_mm: f64,
    diameter_mm: f64,
    soort: Verankeringssoort,
    alpha_1: f64,
    alpha_2: f64,
    alpha_3: f64,
    alpha_5: f64,
    percentage_overlapt: f64,
) -> Overlapping {
    let a6 = alpha_6(percentage_overlapt, soort);
    let l0_berekend = alpha_1 * alpha_2 * alpha_3 * alpha_5 * a6 * l_b_rqd_mm;
    let kandidaten = [
        (0.3 * a6 * l_b_rqd_mm, OndergrensTerm::FractieVanLbRqd),
        (15.0 * diameter_mm, OndergrensTerm::TienDiameters),
        (200.0, OndergrensTerm::HonderdMillimeter),
    ];
    let mut beste = kandidaten[0];
    for k in kandidaten.iter().skip(1) {
        if k.0 > beste.0 {
            beste = *k;
        }
    }
    let (l0_min, term) = beste;
    let mut toelichting = vec![
        "(8.10) kent geen α₄: de factor voor gelaste dwarswapening telt bij een overlapping niet \
         mee."
            .to_string(),
        "Voor α₃ schrijft §8.7.3(1) A_st,min = 1,0·A_s·(σ_sd/f_yd) voor in plaats van de \
         0,25·A_s van tabel 8.2."
            .to_string(),
        "De ondergrens (8.11) gebruikt 15Φ en 200 mm, niet de 10Φ en 100 mm van (8.6)/(8.7), en \
         de fractie 0,3 werkt op α₆·l_b,rqd."
            .to_string(),
        "Deze lengte staat los van de weerstandslijn: overlappingen worden in de dekkingslijn \
         niet meegerekend."
            .to_string(),
    ];
    if soort == Verankeringssoort::Druk {
        toelichting.push(
            "α₆ = 1 volgens tabel NB 8.3 van de Nederlandse bijlage. De EN-tabel 8.3 kent geen \
             drukregel en is in de Nederlandse uitgave doorgehaald."
                .to_string(),
        );
    }
    Overlapping {
        alpha_6: a6,
        l_0_berekend_mm: l0_berekend,
        l_0_min_mm: l0_min,
        l_0_min_term: term,
        l_0_mm: l0_berekend.max(l0_min),
        toelichting,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// C30/37 uit tabel 3.1: f_ctk;0,05 = 2,0 N/mm².
    const F_CTK_C30: f64 = 2.0;
    /// B500 met γ_S = 1,15: f_yd = 500/1,15 = 434,7826 N/mm².
    const F_YD_B500: f64 = 500.0 / 1.15;

    fn basis() -> VerankeringInvoer {
        VerankeringInvoer {
            diameter_mm: 16.0,
            f_ctk_005_mpa: F_CTK_C30,
            alpha_ct: 1.0,
            gamma_c: 1.5,
            f_yd_mpa: F_YD_B500,
            h_mm: 600.0,
            c_d_mm: 40.0,
            ..VerankeringInvoer::default()
        }
    }

    /// f_ctd = 1,0·2,0/1,5 = 1,3333 N/mm²; f_bd = 2,25·1,0·1,0·1,3333 = 3,0 N/mm².
    #[test]
    fn f_bd_van_c30_37_bij_goede_aanhechting_is_precies_3_0() {
        let f_ctd = f_ctd_mpa(F_CTK_C30, 1.0, 1.5);
        assert_relative_eq!(f_ctd, 2.0 / 1.5, max_relative = 1e-12);
        assert_relative_eq!(f_bd_mpa(f_ctd, 1.0, 1.0), 3.0, max_relative = 1e-12);
    }

    /// η₂ is continu op 32 mm: (132 − 32)/100 = 1,00. Bij 40 mm: 0,92.
    #[test]
    fn eta_2_knikt_continu_op_32_mm() {
        assert_relative_eq!(eta_2(16.0), 1.0);
        assert_relative_eq!(eta_2(32.0), 1.0);
        assert_relative_eq!(eta_2(40.0), 0.92, max_relative = 1e-12);
        assert_relative_eq!(eta_2(50.0), 0.82, max_relative = 1e-12);
    }

    /// Figuur 8.2, alle drie de gevallen, met de sprong bij h = 600 mm erbij.
    #[test]
    fn figuur_8_2_zones() {
        // 8.2b: h ≤ 250 mm → alles goed.
        assert_eq!(aanhechting_figuur_8_2(250.0, 240.0), Aanhechting::Goed);
        // 8.2c: 250 < h ≤ 600 → alleen de onderste 250 mm.
        assert_eq!(aanhechting_figuur_8_2(600.0, 250.0), Aanhechting::Goed);
        assert_eq!(aanhechting_figuur_8_2(600.0, 301.0), Aanhechting::Overig);
        // 8.2d: h > 600 → de bovenste 300 mm slecht, de rest goed.
        assert_eq!(aanhechting_figuur_8_2(601.0, 301.0), Aanhechting::Goed);
        assert_eq!(aanhechting_figuur_8_2(601.0, 302.0), Aanhechting::Overig);
    }

    /// Tabel 8.2, regel "Betondekking", rechte trekstaaf:
    /// α₂ = 1 − 0,15·(40 − 16)/16 = 1 − 0,15·1,5 = 0,775.
    #[test]
    fn alpha_2_rechte_trekstaaf_handrekening() {
        let a2 = alpha_2(Staafvorm::Recht, Verankeringssoort::Trek, 40.0, 16.0);
        assert_relative_eq!(a2, 0.775, max_relative = 1e-12);
    }

    /// Zelfde staaf, maar anders dan recht: 1 − 0,15·(40 − 48)/16 = 1,075 → 1,0.
    #[test]
    fn alpha_2_omgebogen_trekstaaf_wordt_op_1_begrensd() {
        let a2 = alpha_2(Staafvorm::AndersDanRecht, Verankeringssoort::Trek, 40.0, 16.0);
        assert_relative_eq!(a2, 1.0, max_relative = 1e-12);
    }

    /// λ = (100,531 − 0,25·201,062)/201,062 = 50,265/201,062 = 0,25;
    /// α₃ = 1 − 0,05·0,25 = 0,9875.
    #[test]
    fn lambda_en_alpha_3_handrekening() {
        let a_s = std::f64::consts::PI / 4.0 * 16.0 * 16.0; // 201,0619 mm²
        let sum_a_st = 2.0 * std::f64::consts::PI / 4.0 * 8.0 * 8.0; // 100,5310 mm²
        let lam = lambda_8_2(sum_a_st, a_s, Elementtype::Balk);
        assert_relative_eq!(lam, 0.25, max_relative = 1e-12);
        let a3 = alpha_3(Verankeringssoort::Trek, KWaarde::DwarsstaafBuiten.k(), lam);
        assert_relative_eq!(a3, 0.9875, max_relative = 1e-12);
    }

    /// α₄ telt alleen mee als Φ_t > 0,6Φ. Bij Φ = 16 mm is dat Φ_t > 9,6 mm.
    #[test]
    fn alpha_4_kijkt_naar_de_diameter_van_de_dwarsstaaf() {
        assert_relative_eq!(alpha_4(Some(10.0), 16.0), 0.7);
        assert_relative_eq!(alpha_4(Some(9.6), 16.0), 1.0);
        assert_relative_eq!(alpha_4(None, 16.0), 1.0);
    }

    /// De hele keten voor Ø16 in C30/37, met de hand:
    ///   f_bd = 3,0; l_b,rqd = (16/4)·(434,7826/3,0) = 579,7101 mm;
    ///   α = 1,0 · 0,775 · 0,9875 · 1,0 · 1,0 = 0,7653125;
    ///   l_bd = 0,7653125 · 2000/3,45 = 1530,625/3,45 = 443,65942 mm;
    ///   l_b,min = max{173,913; 160; 100} = 173,913 mm → niet maatgevend.
    #[test]
    fn referentiestaaf_o16_c30_37() {
        let inv = VerankeringInvoer {
            k_waarde: KWaarde::DwarsstaafBuiten,
            lambda: 0.25,
            ..basis()
        };
        let v = verankeringslengte(&inv).unwrap();
        assert_relative_eq!(v.f_bd_mpa, 3.0, max_relative = 1e-12);
        assert_relative_eq!(v.l_b_rqd_mm, 579.7101449, max_relative = 1e-8);
        assert_relative_eq!(v.alfa.product, 0.7653125, max_relative = 1e-12);
        assert_relative_eq!(v.l_bd_mm, 443.6594203, max_relative = 1e-8);
        assert!(!v.ondergrens_maatgevend);
        assert_eq!(v.aanhechting, Aanhechting::Goed);
    }

    /// (8.5): α₂ = 0,7, α₃ = 0,7 en α₅ = 0,8 geeft 0,392, dus het product wordt
    /// op 0,7 gezet. l_bd = 0,7·579,7101 = 405,7971 mm in plaats van 227,2 mm.
    #[test]
    fn vergelijking_8_5_trekt_het_product_op_naar_0_7() {
        let inv = VerankeringInvoer {
            c_d_mm: 100.0, // 1 − 0,15·(100 − 16)/16 = 0,2125 → 0,7
            k_waarde: KWaarde::InDeHoek,
            lambda: 3.0, // 1 − 0,1·3,0 = 0,7
            p_mpa: 5.0,  // 1 − 0,04·5 = 0,8
            ..basis()
        };
        let v = verankeringslengte(&inv).unwrap();
        assert_relative_eq!(v.alfa.alpha_2, 0.7, max_relative = 1e-12);
        assert_relative_eq!(v.alfa.alpha_3, 0.7, max_relative = 1e-12);
        assert_relative_eq!(v.alfa.alpha_5, 0.8, max_relative = 1e-12);
        assert_relative_eq!(v.alfa.product_235_berekend, 0.392, max_relative = 1e-12);
        assert!(v.alfa.begrensd_door_8_5);
        assert_relative_eq!(v.alfa.product, 0.7, max_relative = 1e-12);
        assert_relative_eq!(v.l_bd_mm, 405.7971014, max_relative = 1e-8);
    }

    /// De ondergrens van 100 mm uit (8.6), met een Ø8 in C50/60:
    ///   f_ctd = 2,9/1,5 = 1,93333; f_bd = 2,25·1,93333 = 4,35;
    ///   l_b,rqd = (8/4)·(434,7826/4,35) = 199,9000 mm;
    ///   α₂ = 1 − 0,15·(30 − 8)/8 = 0,5875 → begrensd op 0,7; α₄ = 0,7;
    ///   product = 0,49 → 0,49·199,9000 = 97,9510 mm;
    ///   l_b,min = max{59,970; 80; 100} = 100 mm → MAATGEVEND.
    #[test]
    fn ondergrens_van_100_mm_is_maatgevend_bij_een_o8() {
        let inv = VerankeringInvoer {
            diameter_mm: 8.0,
            f_ctk_005_mpa: 2.9,
            c_d_mm: 30.0,
            phi_t_mm: Some(8.0), // 8 > 0,6·8 = 4,8 → α₄ = 0,7
            h_mm: 200.0,
            ..basis()
        };
        let v = verankeringslengte(&inv).unwrap();
        assert_relative_eq!(v.f_bd_mpa, 4.35, max_relative = 1e-12);
        assert_relative_eq!(v.l_b_rqd_mm, 199.9000500, max_relative = 1e-7);
        assert_relative_eq!(v.alfa.alpha_2, 0.7, max_relative = 1e-12);
        assert_relative_eq!(v.alfa.product, 0.49, max_relative = 1e-12);
        assert_relative_eq!(v.l_bd_berekend_mm, 97.9510245, max_relative = 1e-7);
        assert!(v.ondergrens_maatgevend);
        assert_eq!(v.l_b_min_term, OndergrensTerm::HonderdMillimeter);
        assert_relative_eq!(v.l_bd_mm, 100.0, max_relative = 1e-12);
    }

    /// Ø40 in C30/37: η₂ = 0,92, f_bd = 2,76 N/mm²,
    /// l_b,rqd = (40/4)·(434,7826/2,76) = 1575,2993 mm.
    #[test]
    fn staaf_dikker_dan_32_mm_verandert_eta_2() {
        let inv = VerankeringInvoer {
            diameter_mm: 40.0,
            c_d_mm: 40.0, // α₂ = 1 − 0,15·(40 − 40)/40 = 1,0
            ..basis()
        };
        let v = verankeringslengte(&inv).unwrap();
        assert_relative_eq!(v.eta_2, 0.92, max_relative = 1e-12);
        assert_relative_eq!(v.f_bd_mpa, 2.76, max_relative = 1e-12);
        assert_relative_eq!(v.l_b_rqd_mm, 1575.2993095, max_relative = 1e-8);
        assert_relative_eq!(v.alfa.product, 1.0, max_relative = 1e-12);
        assert_relative_eq!(v.l_bd_mm, 1575.2993095, max_relative = 1e-8);
    }

    /// 'Slechte' aanhechting maakt l_bd precies 1/0,7 keer zo lang.
    #[test]
    fn slechte_aanhechting_verlengt_met_een_factor_1_over_0_7() {
        let goed = verankeringslengte(&VerankeringInvoer { c_d_mm: 16.0, ..basis() }).unwrap();
        let slecht = verankeringslengte(&VerankeringInvoer {
            c_d_mm: 16.0,
            stortpositie: Stortpositie::Bovenzijde,
            ..basis()
        })
        .unwrap();
        assert_eq!(slecht.aanhechting, Aanhechting::Overig);
        assert_relative_eq!(slecht.eta_1, 0.7, max_relative = 1e-12);
        assert_relative_eq!(
            slecht.l_bd_mm / goed.l_bd_mm,
            1.0 / 0.7,
            max_relative = 1e-12
        );
    }

    /// De begrenzing van f_ctk;0,05 op de C60/75-waarde, met C80/95
    /// (f_ctk;0,05 = 3,4 N/mm² in tabel 3.1).
    #[test]
    fn f_ctk_wordt_op_de_c60_75_waarde_begrensd() {
        let inv = VerankeringInvoer {
            diameter_mm: 20.0,
            f_ctk_005_mpa: 3.4,
            c_d_mm: 20.0,
            ..basis()
        };
        let v = verankeringslengte(&inv).unwrap();
        assert!(v.begrensd_op_c60_75);
        assert_relative_eq!(v.f_ctk_005_gebruikt_mpa, 3.1, max_relative = 1e-12);
        // f_bd = 2,25·(3,1/1,5) = 4,65 N/mm²; l_b,rqd = 5·(434,7826/4,65).
        assert_relative_eq!(v.f_bd_mpa, 4.65, max_relative = 1e-12);
        assert_relative_eq!(v.l_b_rqd_mm, 467.5081814, max_relative = 1e-8);
    }

    /// Drukverankering: α₁ = α₂ = α₃ = 1,0 en de ondergrens gebruikt 0,6.
    #[test]
    fn drukverankering_gebruikt_de_zes_tiende_ondergrens() {
        let inv = VerankeringInvoer {
            diameter_mm: 25.0,
            soort: Verankeringssoort::Druk,
            vorm: Staafvorm::AndersDanRecht,
            c_d_mm: 100.0,
            ..basis()
        };
        let v = verankeringslengte(&inv).unwrap();
        assert_relative_eq!(v.alfa.alpha_1, 1.0, max_relative = 1e-12);
        assert_relative_eq!(v.alfa.alpha_2, 1.0, max_relative = 1e-12);
        // l_b,rqd = (25/4)·(434,7826/3,0) = 905,7971 mm.
        assert_relative_eq!(v.l_b_rqd_mm, 905.7971014, max_relative = 1e-8);
        // l_b,min = max{0,6·905,7971 = 543,4783; 250; 100} = 543,4783 mm.
        assert_relative_eq!(v.l_b_min_mm, 543.4782609, max_relative = 1e-8);
        assert_eq!(v.l_b_min_term, OndergrensTerm::FractieVanLbRqd);
    }

    /// (9.2) en 6.2.2(5).
    #[test]
    fn verschuivingsregel() {
        let met = verschuiving(Verschuivingsgrondslag::MetDwarskrachtwapening {
            z_mm: 495.0,
            cot_theta: 2.5,
            cot_alpha: 0.0,
        });
        assert_relative_eq!(met.a_l_mm, 618.75, max_relative = 1e-12);
        let zonder =
            verschuiving(Verschuivingsgrondslag::ZonderDwarskrachtwapening { d_mm: 550.0 });
        assert_relative_eq!(zonder.a_l_mm, 550.0, max_relative = 1e-12);
    }

    /// (9.3) valt bij a_l uit (9.2) samen met ΔF_td uit (6.18).
    #[test]
    fn f_ed_valt_samen_met_delta_f_td() {
        let a_l = 618.75;
        let z = 495.0;
        let f_ed = f_ed_eindoplegging_kn(120.0, a_l, z, 0.0);
        assert_relative_eq!(f_ed, 150.0, max_relative = 1e-12);
        // ΔF_td = 0,5·V_Ed·(cot θ − cot α) = 0,5·120·2,5 = 150 kN.
        assert_relative_eq!(f_ed, 0.5 * 120.0 * 2.5, max_relative = 1e-12);
    }

    /// Het lineaire krachtverloop van 9.2.1.3(3).
    #[test]
    fn lineair_krachtverloop_binnen_de_verankeringslengte() {
        assert_relative_eq!(opneembare_krachtfractie(0.0, 400.0), 0.0);
        assert_relative_eq!(opneembare_krachtfractie(200.0, 400.0), 0.5);
        assert_relative_eq!(opneembare_krachtfractie(400.0, 400.0), 1.0);
        assert_relative_eq!(opneembare_krachtfractie(900.0, 400.0), 1.0);
    }

    /// Tabel NB 8.3: de drukregel die de EN-tekst niet heeft.
    #[test]
    fn alpha_6_is_voor_druk_altijd_1_volgens_de_nb() {
        assert_relative_eq!(alpha_6(50.0, Verankeringssoort::Druk), 1.0);
        assert_relative_eq!(alpha_6(100.0, Verankeringssoort::Druk), 1.0);
        // Trek: de formule (ρ₁/25)^0,5 met de grenzen 1,0 en 1,5.
        assert_relative_eq!(alpha_6(20.0, Verankeringssoort::Trek), 1.0);
        assert_relative_eq!(alpha_6(25.0, Verankeringssoort::Trek), 1.0);
        assert_relative_eq!(
            alpha_6(50.0, Verankeringssoort::Trek),
            2.0_f64.sqrt(),
            max_relative = 1e-12
        );
        assert_relative_eq!(alpha_6(100.0, Verankeringssoort::Trek), 1.5);
    }

    #[test]
    fn ongeldige_invoer_levert_een_foutmelding_en_geen_getal() {
        assert!(verankeringslengte(&VerankeringInvoer::default()).is_err());
        assert!(verankeringslengte(&VerankeringInvoer { diameter_mm: -1.0, ..basis() }).is_err());
        assert!(verankeringslengte(&VerankeringInvoer { f_yd_mpa: 0.0, ..basis() }).is_err());
    }

    #[test]
    fn elke_deelstap_draagt_een_vindplaats_en_een_formule() {
        let v = verankeringslengte(&basis()).unwrap();
        let stappen = verankering_deelstappen(&v);
        assert_eq!(stappen.len(), 6);
        for s in &stappen {
            assert!(!s.article.is_empty(), "{} heeft geen vindplaats", s.id);
            assert!(!s.formula_latex.is_empty(), "{} heeft geen formule", s.id);
            assert!(!s.ingevuld_latex.is_empty(), "{} heeft geen ingevulde regel", s.id);
        }
        let lbd = stappen.iter().find(|s| s.id == "l_bd").unwrap();
        assert_relative_eq!(lbd.value.unwrap(), v.l_bd_mm, max_relative = 1e-12);
    }
}
