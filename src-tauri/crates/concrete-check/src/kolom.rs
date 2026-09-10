//! §5.8 en §9.5 AANGESLOTEN: van een krachtsverloop naar de vraag of deze
//! staaf op tweede-orde-effecten moet worden gerekend.
//!
//! `nen_en_1992_1_1::kolom` rekent §5.8.3 en §5.8.4 door en levert §9.5. Die
//! module kent geen omhullende, geen combinaties en geen doorsnede-invoer; zij
//! krijgt kale getallen. Deze module is de laag daartussen: zij kiest de
//! maatgevende snede uit het krachtsverloop, leidt af wat afleidbaar is,
//! weigert wat niet afleidbaar is, en levert het geheel als toetsen in
//! hetzelfde contract als de rest van de betontoetsing.
//!
//! # Eén rekengang, twee ingangen
//!
//! [`kolomtoetsen`] is de enige plaats waar §5.8 wordt aangeroepen. Hij wordt
//! gebruikt door
//!
//! * de volledige staaftoetsing ([`crate::check_concrete_beam`]), waar §5.8 als
//!   toetsen in de lijst komt, en
//! * het losse verzoek [`column_check`], dat langs alle drie de wegen
//!   bereikbaar is (Tauri-command, toetsbrug, MCP-gereedschap).
//!
//! Een tweede implementatie voor de losse weg zou uit de pas lopen met de
//! eerste, en juist bij een POORTtoets — een toets die bepaalt of er nog een
//! hele berekening achteraan moet — is dat het soort verschil dat niemand ziet.
//!
//! # Wanneer §5.8 van toepassing is
//!
//! §5.8 gaat over op DRUK belaste elementen. De poort is dus mechanisch en niet
//! meetkundig: is er in de UGT-omhullende ergens normaaldruk, dan is §5.8 aan de
//! orde; is die er nergens, dan niet en zegt de toets dat.
//!
//! Dat is met opzet iets anders dan de vraag of een staaf in het MODEL een
//! kolom heet. Die vraag (`bepaalStandaardRol` en `isOverwegendVerticaal` in de
//! frontend, allebei met dezelfde drempel van 75° ten opzichte van de
//! horizontaal) bepaalt waar het invoerscherm de §5.8-velden aanbiedt en
//! openklapt. Zij bepaalt niet of er getoetst wordt: een schuine schoor onder
//! 60° die 400 kN druk draagt is voor §5.8 net zo goed een op druk belast
//! element, en een horizontale ligger met normaaldruk ook. Hier wordt dus geen
//! derde regel verzonnen; de meetkundige regel woont in de frontend en de
//! mechanische in de kern.
//!
//! # De maatgevende snede voor de poort
//!
//! λ_lim = 20·A·B·C/√n heeft n = N_Ed/(A_c·f_cd) in de NOEMER onder een wortel:
//! hoe GROTER de druk, hoe KLEINER λ_lim en hoe eerder tweede orde nodig is.
//! De maatgevende snede is daarom die met de grootste normaalDRUK — en niet
//! die met het grootste moment.
//!
//! M₀Ed komt uit DEZELFDE snede en dus uit dezelfde combinatie. Het grootste
//! moment van de ene combinatie naast de grootste druk van een andere zetten
//! zou een belastinggeval opleveren dat niet bestaat.
//!
//! # Wat deze module NIET doet
//!
//! Zij rekent geen tweede orde uit. Dat doet de algemene methode van §5.8.6,
//! die in deze app bestaat als de fysisch niet-lineaire keten
//! ([`crate::segment_stiffness`] met `lib/betonStijfheid.ts`). Deze module
//! beantwoordt alleen de voorvraag, en kan aan een krachtsverloop niet zien of
//! het al uit zo'n tweede-orde-berekening komt. Dat staat bij de toets.

use mechanics::{ForcePoint, ForceStateSnapshot};
use nen_en_1992_1_1::kolom::{
    as_max_9_5_2, as_min_9_5_2, kolom_deelstappen, kolomslankheid,
    min_diameter_dwarswapening_9_5_3, min_diameter_langsstaaf_9_5_2, min_dwarsafmeting_9_5_1,
    s_cl_tmax_9_5_3, toepassingsgebied_9_5_1, traagheidsstraal_mm, Beugelzone, Knikgeval,
    Kniklengtebepaling, KolomInvoer, KolomdetailleringInvoer, Kolomslankheid,
    Overlappingssituatie, Schoring,
};
use nen_en_1992_1_1::{
    concrete_class_by_name, reinforcement_grade_by_name, CheckStatus, ConcreteSection,
    ConcreteSectionInput, ConcreteShape, DesignMaterial, DesignSituation, NamedValue,
    ReinforcementCage, ResistanceCalc, SteelBranch, UnityCheck,
};
use serde::{Deserialize, Serialize};
use steel_check::{CheckKind, NamedCheck};
use ts_rs::TS;

// ═══════════════════════════════════════════════════════════════════════════
// De invoer
// ═══════════════════════════════════════════════════════════════════════════

/// Hoe de kniklengte l₀ van deze staaf wordt bepaald.
///
/// # Waarom deze twee wegen, en niet de k-factoren van (5.15)/(5.16)
///
/// §5.8.3.2 kent vier wegen naar l₀: de vaste gevallen van figuur 5.7, de
/// vergelijking (5.15) voor een geschoord raamwerk, (5.16) voor een
/// ongeschoord raamwerk, en (5.17) uit een numeriek bepaalde knikbelasting.
/// De kern ([`Kniklengtebepaling`]) draagt ze alle vier. Dit invoertype biedt
/// er twee aan, en dat is een keuze:
///
/// * **Figuur 5.7** is wat een constructeur herkent. De vijf vakjes met een
///   VASTE l₀ — a) l₀ = l, b) 2l, c) 0,7l, d) l/2, e) l — zijn de gevallen die
///   in een raamwerkmodel ook werkelijk te benoemen zijn: scharnierend,
///   ingeklemd, console, zijdelings gehouden of niet.
/// * **l₀ zelf opgeven** is de uitweg voor al het andere. Wie (5.15), (5.16) of
///   (5.17) met de hand heeft doorgerekend, of een aparte knikanalyse heeft
///   gedaan, vult de uitkomst hier in; de afleiding legt dan vast dát l₀ is
///   opgegeven en niet waaruit.
///
/// De vakjes f) en g) van figuur 5.7 — gedeeltelijke inklemming — staan hier
/// NIET, en daarmee ook (5.15) en (5.16) niet. Reden: die vergelijkingen vragen
/// k = (θ/M)·(EI/l) per staafeind, de relatieve flexibiliteit van de
/// verhindering. Dat getal is niet uit dit model af te lezen. §5.8.3.2(5) eist
/// er bovendien uitdrukkelijk bij dat het effect van SCHEURVORMING in de
/// verhinderende elementen wordt meegenomen, en §5.8.3.2(4) dat bij een
/// meewerkende aansluitende kolom de SOM (EI/l)_a + (EI/l)_b wordt genomen.
/// Een k die de app zelf zou verzinnen stuurt l₀ recht evenredig en daarmee λ,
/// en dat gebeurt onzichtbaar. Wie k wél heeft, rekent (5.15)/(5.16) uit en
/// vult l₀ in.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
// INTERN GETAGD, met `soort` als sleutel. De kern gebruikt voor
// [`Kniklengtebepaling`] de standaardvorm van serde (extern getagd,
// `{"Standaardgeval": …}`); dit invoertype niet, en dat is een keuze voor de
// AANROEPER: `{"soort":"Opgegeven","l0_m":4.2}` is één plat object dat een
// formulier rechtstreeks kan vullen en dat in een projectbestand leesbaar
// blijft, terwijl de externe vorm een omhullend object per variant vraagt.
// GEEN `deny_unknown_fields` hier, anders dan bij de omringende structs. Serde
// ondersteunt dat niet op een intern getagde enum, en ts-rs laat het attribuut
// dan vallen met een waarschuwing. Het kost hier ook niets: beide varianten
// hebben alleen VERPLICHTE velden, dus een tikfout in `geval` of `l0_m` levert
// een "missing field"-fout en niet stilzwijgend een standaardwaarde.
#[serde(tag = "soort")]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum Kniklengtekeuze {
    /// Een van de vijf vakjes van figuur 5.7 met een vaste l₀ = factor·l.
    ///
    /// De vakjes f) en g) leveren hier een leesbare FOUT op: hun bijschrift
    /// geeft een bereik en geen waarde, en de kern weigert ze dan ook.
    Figuur57 { geval: Knikgeval },
    /// l₀ rechtstreeks, in m.
    Opgegeven { l0_m: f64 },
}

/// De §5.8-gegevens van één staaf: het ontwerpbesluit, de kniklengte en de
/// kruip.
///
/// # Waarom dit een BLOK is en geen losse velden
///
/// Schoring zonder kniklengte levert geen λ, en een kniklengte zonder schoring
/// geen λ_lim: (5.15) tegenover (5.16) is een factor twee in l₀, en C = 0,7 is
/// voor een ongeschoord element VOORGESCHREVEN terwijl een geschoorde kolom
/// C > 1,7 mag halen. De twee horen bij elkaar, en een blok dat er is of er
/// niet is, maakt het onmogelijk om er één van in te vullen en de andere te
/// vergeten. Ontbreekt het blok, dan wordt §5.8 niet getoetst en staat de reden
/// in het rapport — er is geen aangenomen schoring en geen aangenomen l₀.
///
/// # Geschoord is een ONTWERPBESLUIT
///
/// §5.8.1 definieert het letterlijk als een aanname in de berekening en niet
/// als een eigenschap van de constructie. Een raamwerk mét windverband ziet er
/// in een 2D-model niet anders uit dan hetzelfde raamwerk zonder. Daarom is
/// [`Schoring`] hier verplicht zodra het blok bestaat, en wordt het nergens
/// afgeleid.
///
/// # Per as
///
/// Dit blok geldt voor de as waarin dit model rekent: buiging om de y-as, in
/// het vlak van het raamwerk. Een kolom kan in het vlak geschoord zijn en er
/// loodrecht op ongeschoord; die tweede richting bestaat in een 2D-model niet
/// en wordt hier dus ook niet gesuggereerd. Wie de zwakke as nodig heeft,
/// toetst hem in een model van dát vlak.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteColumnInput {
    /// Geschoord of ongeschoord — het ontwerpbesluit van §5.8.1. Verplicht.
    pub bracing: Schoring,
    /// Hoe l₀ wordt bepaald. Verplicht.
    pub buckling_length: Kniklengtekeuze,
    /// Eindwaarde van de kruipcoëfficiënt φ(∞,t₀) volgens §3.1.4.
    ///
    /// `None` = niet opgegeven. §3.1.4 wordt in deze app niet gerekend — dat
    /// vraagt de relatieve luchtvochtigheid, de fictieve dikte h₀, de
    /// cementklasse en de ouderdom t₀ bij eerste belasting, geen van alle
    /// invoer van een raamwerkmodel. Zonder φ(∞,t₀) blijft φ_ef onbekend en
    /// staat §5.8.3.1(1) A = 0,7 toe; dat is GEEN veilige kant maar de waarde
    /// bij φ_ef ≈ 2,14, en dat wordt gemeld.
    #[serde(default)]
    #[ts(optional)]
    pub phi_inf_t0: Option<f64>,
    /// De zone waarin de kolomdoorsnede ligt, voor s_cl,tmax (§9.5.3(4)).
    ///
    /// `None` = niet opgegeven; dan komt s_cl,tmax als "niet uitgevoerd"
    /// terug. Er wordt niet stilzwijgend [`Beugelzone::Regulier`] aangehouden:
    /// dat is de tak ZONDER de reductiefactor 0,6 en dus de ruimste van de
    /// twee.
    #[serde(default)]
    #[ts(optional)]
    pub stirrup_zone: Option<Beugelzone>,
    /// Komen er overlappingslassen voor, en ligt deze doorsnede er ter plaatse
    /// van? Bepaalt A_s,max (NB bij §9.5.2(3)).
    ///
    /// `None` = niet opgegeven; dan komt A_s,max als "niet uitgevoerd" terug.
    /// [`Overlappingssituatie::GeenLassen`] geeft 0,08·A_c tegenover 0,04·A_c
    /// buiten een las — een factor twee, en de ruimste tak. Aannemen mag dus
    /// niet.
    #[serde(default)]
    #[ts(optional)]
    pub lap_situation: Option<Overlappingssituatie>,
}

/// Verzoek voor de LOSSE kolomtoets — dezelfde rekengang als in de volledige
/// staaftoetsing, zonder dat daar een hele toetsronde voor nodig is.
///
/// Bedoeld voor het invoerscherm (λ en λ_lim terwijl je typt, zoals de
/// dekkingstoets van 4.4.1 dat al doet) en voor een client buiten de app.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteColumnCheckRequest {
    /// Staafnummer; komt onveranderd terug.
    pub beam_id: u32,
    /// De doorsnede: rechthoek, T of L.
    pub section: ConcreteSectionInput,
    pub concrete_class: String,
    pub reinforcement_grade: String,
    /// Wapeningskorf. A_s is hier de SOM van de boven- en de onderrij; wat
    /// daar in een kolom aan ontbreekt staat bij [`kolomtoetsen`].
    pub cage: ReinforcementCage,
    /// Vrije lengte l tussen de eindaansluitingen, m (§5.8.3.2(3)).
    pub length_m: f64,
    /// De §5.8-gegevens.
    pub column: ConcreteColumnInput,
    /// UGT-krachtsverloop langs de staaf; N drukt negatief. Uit deze reeks
    /// komen de maatgevende drukkracht, het bijbehorende eerste-orde-moment en
    /// de twee eindmomenten.
    pub forces_envelope: Vec<ForcePoint>,
    /// Krachtsverloop onder de QUASI-BLIJVENDE BGT-combinatie (NEN-EN 1990
    /// uitdrukking (6.16)) — M₀Eqp uit (5.19). Leeg = niet meegestuurd.
    #[serde(default)]
    pub sls_quasi_permanent_envelope: Vec<ForcePoint>,
    #[serde(default)]
    pub design_situation: DesignSituation,
    #[serde(default)]
    pub steel_branch: SteelBranch,
}

/// Antwoord op [`ConcreteColumnCheckRequest`].
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct ConcreteColumnCheckResponse {
    pub beam_id: u32,
    pub section_name: String,
    /// De toetsen in hetzelfde contract als de rest van de betontoetsing:
    /// §5.8.3.1 (de poort), §5.8.4 (kruip) en de §9.5-eisen.
    pub checks: Vec<NamedCheck>,
    /// λ = l₀/i. `None` als §5.8 niet van toepassing was of niet kon.
    #[ts(optional)]
    pub lambda: Option<f64>,
    /// λ_lim = 20·A·B·C/√n.
    #[ts(optional)]
    pub lambda_lim: Option<f64>,
    /// l₀ in mm.
    #[ts(optional)]
    pub l0_mm: Option<f64>,
    /// λ < λ_lim: §5.8.3.1(1) staat toe de tweede-orde-effecten te
    /// verwaarlozen. `None` = niet vastgesteld.
    #[ts(optional)]
    pub tweede_orde_verwaarloosbaar: Option<bool>,
    /// De effectieve kruipcoëfficiënt φ_ef uit (5.19), als hij te bepalen was.
    #[ts(optional)]
    pub phi_ef: Option<f64>,
}

// ═══════════════════════════════════════════════════════════════════════════
// De uitkomst binnen de orchestrator
// ═══════════════════════════════════════════════════════════════════════════

/// Wat [`kolomtoetsen`] teruggeeft: de toetsen, plus de slankheid zelf voor
/// wie er nog iets mee moet.
pub struct Kolomuitkomst {
    pub checks: Vec<NamedCheck>,
    pub slankheid: Option<Kolomslankheid>,
}

/// De ids van de §5.8-toetsen, zodat een test ze kan terugvinden en een rapport
/// ze kan groeperen.
pub const SLANKHEIDSGRENS_ID: &str = "5.8.3.1_slankheidsgrens";
pub const KRUIP_ID: &str = "5.8.4_kruip";
pub const DUBBELE_BUIGING_ID: &str = "5.8.9_dubbele_buiging";

/// Vanaf welk moment om de ZWAKKE as §5.8.9 zich meldt, als deel van het
/// moment om de sterke as.
///
/// Niet nul, want een omhullende draagt vrijwel altijd een spoortje M_z uit
/// afrondingen en scheve knooplasten; daarop een melding geven zou de melding
/// waardeloos maken. Vijf procent is klein genoeg om alles wat er werkelijk
/// toe doet te vangen, en groot genoeg om ruis buiten te laten. §5.8.9(2)
/// zelf kent een strengere ontsnapping (de twee excentriciteitsvoorwaarden),
/// maar die vraagt de doorsnedeafmetingen in BEIDE richtingen én de
/// bijbehorende slankheden — precies wat deze module niet heeft, en dus niet
/// mag aannemen.
const M_Z_MELDGRENS: f64 = 0.05;

/// Getal met een decimale komma, zoals de rest van het rapport het toont.
fn nl(v: f64, cijfers: usize) -> String {
    format!("{v:.cijfers$}").replace('.', ",")
}

fn calc(
    id: &str,
    title: &str,
    article: &str,
    force_state: ForceStateSnapshot,
    status: CheckStatus,
    notes: Vec<String>,
) -> ResistanceCalc {
    ResistanceCalc {
        id: id.to_string(),
        title: title.to_string(),
        article: article.to_string(),
        force_state,
        formula_latex: String::new(),
        variables: vec![],
        deelstappen: vec![],
        value: 0.0,
        unit: String::new(),
        uc: None,
        status,
        notes,
    }
}

fn benoem(c: ResistanceCalc) -> NamedCheck {
    NamedCheck { id: c.id.clone(), kind: CheckKind::Resistance(c) }
}

/// Een lege krachtenmomentopname, voor het geval de omhullende leeg is.
fn leeg_punt() -> ForceStateSnapshot {
    ForceStateSnapshot {
        combination_id: 0,
        position_mm: 0.0,
        forces: mechanics::InternalForces {
            n_ed: 0.0,
            vy_ed: 0.0,
            vz_ed: 0.0,
            mt_ed: 0.0,
            my_ed: 0.0,
            mz_ed: 0.0,
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// De eindmomenten en de vraag of er dwarsbelasting is
// ═══════════════════════════════════════════════════════════════════════════

/// De twee eerste-orde-eindmomenten (M₀₁, M₀₂) van de MAATGEVENDE COMBINATIE,
/// plus of er in die combinatie dwarsbelasting op de staaf staat.
///
/// # Waarom dit uit de omhullende komt en niet uit een invoerveld
///
/// C = 1,7 − r_m met r_m = M₀₁/M₀₂ is de enige factor in λ_lim die een
/// geschoorde kolom boven 0,7 kan tillen, en hij kan tot 1,7+ oplopen bij
/// tegengesteld tekenende eindmomenten. Dat scheelt meer dan een factor twee in
/// λ_lim. De twee eindmomenten staan gewoon in het krachtsverloop; ernaar
/// vragen zou de gebruiker een getal laten overtypen dat de app al heeft.
///
/// # De tekens kloppen zonder omrekening
///
/// §5.8.3.1(1): "M₀₁ en M₀₂ behoren hetzelfde teken te hebben als ze trek aan
/// dezelfde zijde geven, en anders tegengestelde tekens." De buitengrens van
/// deze crate rekent M_y positief = trek in de onderste vezel, en "onder" is
/// langs de hele staaf dezelfde kant van de doorsnede. Gelijk teken betekent
/// dus letterlijk trek aan dezelfde zijde — precies de definitie van de norm.
///
/// # DWARSBELASTING WORDT GEMETEN, NIET GEVRAAGD
///
/// De r_m-tak van §5.8.3.1(1) geldt niet "voor geschoorde elementen waarin de
/// eerste-orde-effecten alleen of voornamelijk zijn veroorzaakt door
/// imperfecties of dwarsbelasting"; daar is r_m = 1,0 en dus C = 0,7
/// voorgeschreven. Bij dwarsbelasting ligt het grootste eerste-orde-moment niet
/// aan een eind maar in het veld, en dat is aan het momentverloop te ZIEN:
/// staat er ergens tussen de einden een |M| dat groter is dan beide
/// eindmomenten, dan werkt er dwarsbelasting (wind op een gevelkolom
/// bijvoorbeeld) en valt de kolom in de r_m = 1,0-tak.
///
/// Dat is een mechanische vaststelling uit het momentverloop en geen vraag aan
/// de gebruiker. Een vraag zou hier gevaarlijk zijn: wie "geen dwarsbelasting"
/// aanvinkt terwijl er wind op de kolom staat, krijgt een te hoge C, een te
/// hoge λ_lim en dus een kolom die ten onrechte "geen tweede orde nodig" heet.
///
/// De vaststelling leunt wel op de STATIONS die de omhullende draagt: staan er
/// alleen twee eindpunten in, dan is een veldmoment niet te zien. Dat staat in
/// de kanttekening bij de toets.
enum Eindmomenten {
    /// Een bruikbaar paar: |M₀₂| > 0, geen dwarsbelasting. Hieruit volgt
    /// r_m = M₀₁/M₀₂ en dus C = 1,7 − r_m.
    Paar { m01: f64, m02: f64 },
    /// De tak r_m = 1,0 (C = 0,7) van §5.8.3.1(1), om een van twee redenen:
    /// er staat dwarsbelasting op de staaf, of er zijn helemaal geen
    /// eerste-orde-eindmomenten en dan komt wat er is uit imperfecties.
    RmIsEen { dwarsbelasting: bool, m01: f64, m02: f64 },
    /// De twee einden zijn in deze combinatie niet allebei aanwezig; r_m blijft
    /// onbekend en §5.8.3.1(1) staat dan C = 0,7 toe.
    Onbekend,
}

///
/// Zie [`Eindmomenten`] voor de drie uitkomsten.
fn eindmomenten(env: &[ForcePoint], combinatie: u32, lengte_mm: f64) -> Eindmomenten {
    let mut punten: Vec<&ForcePoint> =
        env.iter().filter(|p| p.combination_id == combinatie).collect();
    if punten.len() < 2 || !(lengte_mm > 0.0) {
        return Eindmomenten::Onbekend;
    }
    punten.sort_by(|a, b| a.position_mm.total_cmp(&b.position_mm));
    let eerste = punten[0];
    let laatste = punten[punten.len() - 1];
    // De einden moeten er ook echt zijn. 5 % van de lengte is ruim genoeg voor
    // een raster dat niet exact op 0 en L begint en te krap om een station op
    // een kwart van de staaf voor een eind aan te zien.
    let tol = 0.05 * lengte_mm;
    if eerste.position_mm > tol || laatste.position_mm < lengte_mm - tol {
        return Eindmomenten::Onbekend;
    }
    let m_a = eerste.forces.my_ed;
    let m_b = laatste.forces.my_ed;
    // |M₀₂| ≥ |M₀₁| is de definitie van de norm; welke van de twee einden dat
    // is, doet er verder niet toe.
    let (m01, m02) = if m_a.abs() <= m_b.abs() { (m_a, m_b) } else { (m_b, m_a) };
    let grootste_eind = m01.abs().max(m02.abs());
    let grootste_veld = punten.iter().map(|p| p.forces.my_ed.abs()).fold(0.0_f64, f64::max);
    // 1 % speling: een numeriek verschil in de laatste cijfers van de oplosser
    // mag geen dwarsbelasting voorwenden.
    if grootste_veld > grootste_eind * 1.01 + 1e-9 {
        return Eindmomenten::RmIsEen { dwarsbelasting: true, m01, m02 };
    }
    // M₀₂ = 0 is geen deelbaar getal, en de norm zegt zelf wat er dan geldt:
    // zijn er geen eerste-orde-eindmomenten, dan komt wat er aan
    // eerste-orde-effect is uit imperfecties, en dat is precies de tak
    // r_m = 1,0. Zonder deze afvang zou r_m = M₀₁/M₀₂ een deling door nul zijn
    // en zou de hele §5.8-toets van een centrisch gedrukte kolom wegvallen —
    // juist de kolom waarvoor zij is bedoeld.
    if grootste_eind <= 1e-9 {
        return Eindmomenten::RmIsEen { dwarsbelasting: false, m01, m02 };
    }
    Eindmomenten::Paar { m01, m02 }
}

// ═══════════════════════════════════════════════════════════════════════════
// De rekengang
// ═══════════════════════════════════════════════════════════════════════════

/// De reden waarom §5.8 niet is getoetst als het invoerblok ontbreekt.
fn geen_kolomgegevens() -> String {
    "de §5.8-gegevens van deze staaf ontbreken. Er staat normaaldruk op, dus §5.8 is aan de orde, \
     maar zonder het ONTWERPBESLUIT geschoord/ongeschoord (§5.8.1) en zonder de kniklengte l₀ is \
     er geen λ en geen λ_lim. Beide worden met opzet niet afgeleid: §5.8.1 noemt geschoord \
     uitdrukkelijk een aanname in de berekening en niet een eigenschap van de constructie — een \
     raamwerk mét windverband ziet er in dit model niet anders uit dan hetzelfde raamwerk zonder — \
     en een aangenomen l₀ = l zou een ongeschoorde kolom tot twee keer te kort rekenen. Vul ze in \
     bij de staafeigenschappen onder \"Kolom (§5.8)\"."
        .to_string()
}

/// §5.8 en §9.5 voor één staaf.
///
/// # Wat A_s hier is, en wat er in een kolom aan ontbreekt
///
/// ω = A_s·f_yd/(A_c·f_cd) en A_s,min/A_s,max van §9.5.2 vragen de TOTALE
/// langswapening. [`ReinforcementCage`] kent één bovenrij en één onderrij; een
/// kolom heeft staven langs alle vier de zijden. A_s is hier dus de som van de
/// twee rijen die het model kent, en dat is wat er in de afleiding staat.
///
/// Dat maakt de toets niet onbruikbaar, en de richting van de afwijking is te
/// benoemen:
///
/// * **λ_lim** — ontbrekende zijstaven verlagen ω en daarmee B = √(1+2ω), dus
///   λ_lim. Een te lage λ_lim zegt eerder "tweede orde nodig" dan nodig: de
///   VEILIGE kant.
/// * **A_s,min (9.12N)** — een te lage A_s laat de eis eerder falen. Ook de
///   veilige kant.
/// * **A_s,max** — een te lage A_s laat de bovengrens juist ruimer lijken. Wie
///   de zijstaven niet invoert, kan hier dus een overschrijding missen. Dat
///   staat bij de toets.
///
/// Twee eisen zijn zónder de zijstaven helemaal NIET te toetsen, en die worden
/// dan ook niet stilzwijgend overgeslagen maar als tekst meegeleverd
/// ([`nen_en_1992_1_1::kolom::niet_getoetste_9_5_eisen`]): §9.5.2(4) — ten
/// minste één staaf in iedere hoek — en §9.5.3(6) — elke hoekstaaf opgesloten
/// en geen staaf verder dan 150 mm van een opgesloten staaf. Beide vragen de
/// LIGGING van elke staaf in het vlak van de doorsnede, niet alleen haar
/// hoogte. Zolang het korfmodel geen rij per zijde kent, kunnen ze niet, en
/// zeggen ze dat.
pub fn kolomtoetsen(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    kolom: Option<&ConcreteColumnInput>,
    lengte_mm: f64,
    ugt: &[ForcePoint],
    bgt_qp: &[ForcePoint],
) -> Kolomuitkomst {
    let artikel_poort = "art. 5.8.3.1(1) — NB: \"De waarde van λ_lim moet gelijk aan 20·A·B·C/√n \
                         zijn genomen\"";
    let artikel_kruip = "art. 5.8.4 (5.19) en 5.8.4(4)";

    // ── De maatgevende snede: de grootste normaalDRUK ──────────────────────
    let gov = ugt
        .iter()
        .min_by(|a, b| a.forces.n_ed.total_cmp(&b.forces.n_ed))
        .copied();
    let (gov, n_druk_kn) = match gov {
        Some(p) if p.forces.n_ed < 0.0 => (p, -p.forces.n_ed),
        // Geen enkel punt met druk: §5.8 gaat niet over dit element.
        _ => {
            let state = ugt
                .iter()
                .max_by(|a, b| a.forces.my_ed.abs().total_cmp(&b.forces.my_ed.abs()))
                .map(ForceStateSnapshot::from_point)
                .unwrap_or_else(leeg_punt);
            return Kolomuitkomst {
                checks: vec![benoem(calc(
                    SLANKHEIDSGRENS_ID,
                    "Slankheidsgrens λ_lim — mogen de tweede-orde-effecten vervallen?",
                    artikel_poort,
                    state,
                    CheckStatus::NotApplicable,
                    vec![
                        "§5.8 gaat over op DRUK belaste elementen. In de UGT-omhullende van deze \
                         staaf staat nergens normaaldruk, dus er is geen knikgeval: λ_lim = \
                         20·A·B·C/√n heeft n = N_Ed/(A_c·f_cd) onder een wortel in de noemer en is \
                         zonder druk niet gedefinieerd."
                            .to_string(),
                    ],
                ))],
                slankheid: None,
            };
        }
    };
    let state = ForceStateSnapshot::from_point(&gov);

    // ── Zonder invoerblok is er niets te rekenen ───────────────────────────
    let Some(k) = kolom else {
        return Kolomuitkomst {
            checks: vec![benoem(calc(
                SLANKHEIDSGRENS_ID,
                "Slankheidsgrens λ_lim — mogen de tweede-orde-effecten vervallen?",
                artikel_poort,
                state,
                CheckStatus::NotApplicable,
                vec![geen_kolomgegevens()],
            ))],
            slankheid: None,
        };
    };

    // ── De traagheidsstraal van de NIET-GESCHEURDE betondoorsnede ─────────
    //
    // §5.8.3.2(1) zegt er "niet-gescheurde" bij: de wapening telt niet mee en
    // de scheurvorming evenmin. `i_centroid_mm4` en `area_mm2` zijn precies
    // dat, en voor een rechthoek levert de deling exact h/√12.
    let i_mm = match traagheidsstraal_mm(section.i_centroid_mm4(), section.area_mm2()) {
        Ok(v) => v,
        Err(e) => {
            return Kolomuitkomst {
                checks: vec![benoem(calc(
                    SLANKHEIDSGRENS_ID,
                    "Slankheidsgrens λ_lim — mogen de tweede-orde-effecten vervallen?",
                    artikel_poort,
                    state,
                    CheckStatus::NotApplicable,
                    vec![format!("de traagheidsstraal i is niet te bepalen: {e}")],
                ))],
                slankheid: None,
            };
        }
    };

    // EEN OPGEGEVEN l₀ MOET GROTER DAN NUL ZIJN, en dat wordt hier afgevangen
    // en niet dieper in de keten. (5.14) rekent λ = l₀/i en weigert alleen een
    // i van nul; een l₀ van nul zou er een λ van nul uit laten komen, en die
    // ligt onder ELKE λ_lim. Het rapport zou dan groen melden dat de
    // tweede-orde-effecten mogen vervallen, op grond van een getal dat de
    // gebruiker leeg heeft gelaten.
    let (kniklengte, l0_opgegeven_mm) = match k.buckling_length {
        Kniklengtekeuze::Figuur57 { geval } => (Kniklengtebepaling::Standaardgeval(geval), None),
        Kniklengtekeuze::Opgegeven { l0_m } if l0_m > 0.0 => {
            (Kniklengtebepaling::Opgegeven, Some(l0_m * 1000.0))
        }
        Kniklengtekeuze::Opgegeven { l0_m } => {
            return Kolomuitkomst {
                checks: vec![benoem(calc(
                    SLANKHEIDSGRENS_ID,
                    "Slankheidsgrens λ_lim — mogen de tweede-orde-effecten vervallen?",
                    artikel_poort,
                    state,
                    CheckStatus::NotApplicable,
                    vec![format!(
                        "de kniklengte is als 'opgegeven' aangemerkt maar l₀ = {} m, en dat is \
                         geen lengte. λ = l₀/i zou nul worden en daarmee onder elke λ_lim liggen; \
                         dan zou het rapport groen melden dat de tweede-orde-effecten mogen \
                         vervallen op grond van een getal dat niet is ingevuld. Vul l₀ in, of \
                         kies een vast geval uit figuur 5.7.",
                        nl(l0_m, 3)
                    )],
                ))],
                slankheid: None,
            };
        }
    };

    // EEN NEGATIEVE KRUIPCOËFFICIËNT bestaat niet. φ(∞,t₀) volgt uit §3.1.4 en
    // is per definitie niet-negatief; een negatieve waarde zou via
    // A = 1/(1 + 0,2·φ_ef) een A GROTER dan 1 opleveren en dus een te hoge
    // λ_lim. `factor_a` valt bij een negatieve φ_ef terug op 0,7 zonder er iets
    // van te zeggen, en §5.8.4(4) leest φ ≤ 2 dan als "vervuld". Hier wordt hij
    // daarom geweigerd in plaats van stilzwijgend genegeerd.
    if let Some(p) = k.phi_inf_t0 {
        if !(p >= 0.0) {
            return Kolomuitkomst {
                checks: vec![benoem(calc(
                    SLANKHEIDSGRENS_ID,
                    "Slankheidsgrens λ_lim — mogen de tweede-orde-effecten vervallen?",
                    artikel_poort,
                    state,
                    CheckStatus::NotApplicable,
                    vec![format!(
                        "φ(∞,t₀) is opgegeven als {} en dat kan niet: de kruipcoëfficiënt van \
                         §3.1.4 is nooit negatief. Laat het veld leeg als hij niet bekend is; dan \
                         staat §5.8.3.1(1) A = 0,7 toe en zegt de kruiptoets dat.",
                        nl(p, 3)
                    )],
                ))],
                slankheid: None,
            };
        }
    }

    // ── De eindmomenten en de dwarsbelastingvraag ─────────────────────────
    let einden = eindmomenten(ugt, gov.combination_id, lengte_mm);
    let (eindmomenten_knm, r_m_is_een) = match einden {
        Eindmomenten::Paar { m01, m02 } => (Some((m01, m02)), false),
        Eindmomenten::RmIsEen { .. } => (None, true),
        // Zonder de twee einden is r_m onbekend; §5.8.3.1(1) staat dan C = 0,7
        // toe. Dat is meteen de tak waarin een ongeschoord element hoe dan ook
        // valt, dus daar verandert er niets.
        Eindmomenten::Onbekend => (None, false),
    };

    // ── M₀Eqp uit de quasi-blijvende combinatie ───────────────────────────
    //
    // §5.8.4(3) laat de verhouding M₀Eqp/M₀Ed bepalen "in de doorsnede met het
    // maximale moment" of als representatief gemiddelde. Hier wordt de EERSTE
    // weg gelopen, maar dan op de snede die de poort maatgevend maakt: het punt
    // van de quasi-blijvende omhullende dat het DICHTST BIJ de maatgevende
    // UGT-snede ligt. Twee sneden mengen zou een verhouding opleveren van twee
    // plaatsen in de staaf.
    //
    // ALLEEN ALS M₀Ed ZELF NIET NUL IS. (5.19) deelt door M₀Ed, en bij een
    // centrisch gedrukte kolom is dat nul. De kern weigert die deling terecht,
    // maar die weigering zou hier de HELE §5.8-toets laten wegvallen — juist
    // bij de kolom waarvoor zij is bedoeld. φ_ef blijft in dat geval onbekend,
    // §5.8.3.1(1) staat A = 0,7 toe, en de kruiptoets zegt waarom.
    let m0_eqp_knm = if gov.forces.my_ed.abs() > 1e-9 {
        bgt_qp
            .iter()
            .min_by(|a, b| {
                (a.position_mm - gov.position_mm)
                    .abs()
                    .total_cmp(&(b.position_mm - gov.position_mm).abs())
            })
            .map(|p| p.forces.my_ed)
    } else {
        None
    };

    let invoer = KolomInvoer {
        l_mm: lengte_mm,
        kniklengte,
        l0_opgegeven_mm,
        schoring: k.bracing,
        i_mm,
        a_c_mm2: section.area_mm2(),
        a_s_mm2: cage.a_s_top_mm2() + cage.a_s_bottom_mm2(),
        f_cd_mpa: mat.f_cd(),
        f_yd_mpa: mat.f_yd(),
        n_ed_kn: gov.forces.n_ed,
        m0_ed_knm: Some(gov.forces.my_ed),
        m0_eqp_knm,
        phi_inf_t0: k.phi_inf_t0,
        h_mm: Some(section.h_mm),
        eindmomenten_knm,
        eerste_orde_vooral_imperfecties_of_dwarsbelasting: r_m_is_een,
    };

    let slank = match kolomslankheid(&invoer) {
        Ok(v) => v,
        Err(e) => {
            return Kolomuitkomst {
                checks: vec![benoem(calc(
                    SLANKHEIDSGRENS_ID,
                    "Slankheidsgrens λ_lim — mogen de tweede-orde-effecten vervallen?",
                    artikel_poort,
                    state,
                    CheckStatus::NotApplicable,
                    vec![format!("§5.8.3 kon niet worden doorgerekend: {e}")],
                ))],
                slankheid: None,
            };
        }
    };

    let mut checks: Vec<NamedCheck> = Vec::new();

    // ── 1. De POORT: λ tegen λ_lim ────────────────────────────────────────
    //
    // DE STATUS. λ ≥ λ_lim is GEEN bezwijken van de doorsnede; het is de
    // vaststelling dat de vereenvoudiging van §5.8.3.1(1) niet beschikbaar is.
    // Toch staat de status dan op NotOk, en dat is een keuze:
    //
    // * De toets stelt één vraag — "mogen de tweede-orde-effecten worden
    //   verwaarloosd?" — en het antwoord is dan nee. Dát is wat er faalt.
    // * De doorsnedetoetsen hierboven zijn gedraaid op de krachten die
    //   binnenkwamen. Zijn die eerste orde, dan is hun uitkomst niet aan de
    //   veilige kant. Een groen vinkje zou dat verbergen, en dat is precies de
    //   fout die deze hele toetsing hoort te voorkomen.
    // * Deze toets kan aan een krachtsverloop niet zien of het al uit een
    //   tweede-orde-berekening komt. Dat staat in de kanttekening, zodat een
    //   gebruiker die §5.8.6 wél heeft gelopen weet waar de melding vandaan
    //   komt.
    let uc = if slank.lambda_lim > 0.0 {
        slank.lambda / slank.lambda_lim
    } else {
        f64::INFINITY
    };
    let mut poort = ResistanceCalc {
        id: SLANKHEIDSGRENS_ID.to_string(),
        title: "Slankheidsgrens λ_lim — mogen de tweede-orde-effecten vervallen?".to_string(),
        article: artikel_poort.to_string(),
        force_state: state,
        formula_latex: r"\lambda < \lambda_{lim} = \frac{20\,A\,B\,C}{\sqrt{n}}".to_string(),
        variables: vec![
            NamedValue { symbol: "l".to_string(), value: slank.l_mm, unit: "mm".to_string() },
            NamedValue { symbol: "l_0".to_string(), value: slank.l0_mm, unit: "mm".to_string() },
            NamedValue { symbol: "i".to_string(), value: slank.i_mm, unit: "mm".to_string() },
            NamedValue { symbol: "λ".to_string(), value: slank.lambda, unit: "-".to_string() },
            NamedValue { symbol: "n".to_string(), value: slank.n, unit: "-".to_string() },
            NamedValue { symbol: "ω".to_string(), value: slank.omega, unit: "-".to_string() },
            NamedValue { symbol: "A".to_string(), value: slank.a, unit: "-".to_string() },
            NamedValue { symbol: "B".to_string(), value: slank.b, unit: "-".to_string() },
            NamedValue { symbol: "C".to_string(), value: slank.c, unit: "-".to_string() },
            NamedValue {
                symbol: "λ_lim".to_string(),
                value: slank.lambda_lim,
                unit: "-".to_string(),
            },
        ],
        deelstappen: kolom_deelstappen(&slank),
        value: slank.lambda_lim,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: slank.lambda,
            rd: slank.lambda_lim,
            uc,
            formula_latex: r"\lambda / \lambda_{lim}".to_string(),
        }),
        status: if slank.tweede_orde_verwaarloosbaar {
            CheckStatus::Ok
        } else {
            CheckStatus::NotOk
        },
        notes: Vec::new(),
    };
    poort.notes.push(format!(
        "De maatgevende snede is gezocht op de grootste normaalDRUK en niet op het grootste \
         moment: n = N_Ed/(A_c·f_cd) staat onder een wortel in de NOEMER van λ_lim, dus hoe groter \
         de druk hoe kleiner λ_lim. Gekozen is x = {} mm uit combinatie {} met N_Ed = {} kN druk en \
         M₀Ed = {} kNm, uit {} punten van de omhullende. Moment en normaalkracht komen uit \
         DEZELFDE snede en dus uit dezelfde combinatie.",
        gov.position_mm.round() as i64,
        gov.combination_id,
        nl(n_druk_kn, 1),
        nl(gov.forces.my_ed, 1),
        ugt.len()
    ));
    if slank.tweede_orde_verwaarloosbaar {
        poort.notes.push(format!(
            "λ = {} < λ_lim = {}: §5.8.3.1(1) staat toe de tweede-orde-effecten te verwaarlozen. \
             Dat is geen sterkte-uitspraak — de doorsnede moet nog steeds op M en N worden \
             getoetst, en dat gebeurt hierboven.",
            nl(slank.lambda, 1),
            nl(slank.lambda_lim, 1)
        ));
    } else {
        poort.notes.push(format!(
            "λ = {} ≥ λ_lim = {}: de tweede-orde-effecten mogen NIET worden verwaarloosd. Dit is \
             GEEN bezwijken van de doorsnede. Het betekent dat de krachten waarop de \
             doorsnedetoetsen hierboven zijn gedraaid uit een tweede-orde-berekening moeten komen \
             — in deze app de algemene methode van §5.8.6, de fysisch niet-lineaire keten met de \
             secante buigstijfheid per segment. Deze toets kan aan een krachtsverloop niet zien of \
             dat al is gebeurd; is de omhullende al tweede orde, lees deze regel dan als de \
             verantwoording waarom die berekening nodig was.",
            nl(slank.lambda, 1),
            nl(slank.lambda_lim, 1)
        ));
    }
    match einden {
        Eindmomenten::RmIsEen { dwarsbelasting: true, m01, m02 } => poort.notes.push(format!(
            "De eindmomenten van combinatie {} zijn M₀₁ = {} kNm en M₀₂ = {} kNm, maar érgens \
             tussen de einden staat een groter |M|. Er werkt dus dwarsbelasting op deze staaf, en \
             §5.8.3.1(1) schrijft dan r_m = 1,0 voor — C = 0,7 — \"voor geschoorde elementen \
             waarin de eerste-orde-effecten alleen of voornamelijk zijn veroorzaakt door \
             imperfecties of dwarsbelasting\". Dit is uit het MOMENTVERLOOP vastgesteld en niet \
             aan de gebruiker gevraagd: wie \"geen dwarsbelasting\" zou aanvinken terwijl er wind \
             op de kolom staat, krijgt een te hoge C, een te hoge λ_lim en dus een kolom die ten \
             onrechte \"geen tweede orde nodig\" heet. De vaststelling leunt wel op de stations \
             die de omhullende draagt: een omhullende met alleen de twee einden zou een \
             veldmoment niet zien.",
            gov.combination_id,
            nl(m01, 1),
            nl(m02, 1)
        )),
        Eindmomenten::RmIsEen { dwarsbelasting: false, .. } => poort.notes.push(
            "Aan geen van beide einden staat een eerste-orde-moment. r_m = M₀₁/M₀₂ is dan geen \
             deelbaar getal, en §5.8.3.1(1) wijst voor dat geval zelf de tak r_m = 1,0 aan — wat \
             er aan eerste-orde-effect is, komt uit imperfecties. C = 0,7."
                .to_string(),
        ),
        Eindmomenten::Paar { m01, m02 } => poort.notes.push(format!(
            "De eindmomenten komen uit het krachtsverloop van combinatie {}: M₀₁ = {} kNm en \
             M₀₂ = {} kNm, met |M₀₂| ≥ |M₀₁| zoals §5.8.3.1(1) ze definieert. Het teken is dat \
             van deze crate — M_y positief = trek in de onderste vezel — en \"onder\" is langs de \
             hele staaf dezelfde kant van de doorsnede; gelijk teken betekent dus trek aan \
             dezelfde zijde, precies de definitie van de norm. Tussen de einden is geen groter \
             |M| gevonden, dus er is geen dwarsbelasting die de kolom in de tak r_m = 1,0 duwt.",
            gov.combination_id,
            nl(m01, 1),
            nl(m02, 1)
        )),
        Eindmomenten::Onbekend => poort.notes.push(
            "De twee eerste-orde-eindmomenten waren in het krachtsverloop van de maatgevende \
             combinatie niet allebei terug te vinden (er staat geen punt op x = 0 én op x = l). \
             r_m blijft dus onbekend en §5.8.3.1(1) staat dan C = 0,7 toe."
                .to_string(),
        ),
    }
    poort.notes.push(format!(
        "Grondslag van C: {}",
        slank.c_grondslag.toelichting()
    ));
    poort.notes.push(format!(
        "ω = A_s·f_yd/(A_c·f_cd) = {} is genomen met A_s = {} mm², de SOM van de boven- en de \
         onderrij van de korf. Het wapeningsmodel kent geen staven langs de ZIJKANTEN van een \
         kolom; die tellen dus niet mee. De afwijking is naar de veilige kant: minder A_s geeft \
         een lagere B = √(1+2ω) en dus een lagere λ_lim, waardoor deze toets eerder \"tweede orde \
         nodig\" zegt dan strikt nodig is.",
        nl(slank.omega, 3),
        nl(cage.a_s_top_mm2() + cage.a_s_bottom_mm2(), 0)
    ));
    for kant in &slank.kanttekeningen {
        poort.notes.push(kant.clone());
    }
    checks.push(benoem(poort));

    // ── 1b. Dubbele buiging (§5.8.9) ──────────────────────────────────────
    //
    // Alles hierboven en hieronder rekent met M_y: één buigingsrichting. Staat
    // er ook een noemenswaardig moment om de ZWAKKE as, dan is dit geval
    // §5.8.9 — en die paragraaf is in deze crate niet gebouwd.
    //
    // WAAROM DAT HIER MOET STAAN. Zonder deze melding verdwijnt M_z geruisloos:
    // de toetsen komen terug met dezelfde statussen als bij M_z = 0, en niets
    // in het antwoord verraadt dat er een halve belasting buiten beschouwing is
    // gebleven. Dat is precies het soort stilte waar de rest van deze module
    // zich tegen verzet — een niet-opgegeven beugelzone levert `NotApplicable`
    // mét de reden, en een genegeerd tweede-richtingsmoment hoort dat óók te
    // doen. De uitkomst is niet fout: hij is ONVOLLEDIG, en dat is een verschil
    // dat de lezer zelf moet kunnen zien.
    //
    // Wat §5.8.9 zou vragen: de slankheid in BEIDE richtingen, de twee
    // excentriciteiten met de voorwaarden van 5.8.9(2) die een aparte toetsing
    // per richting toestaan, en anders de interactie (5.39) met de exponent a
    // uit de tabel bij N_Ed/N_Rd. Dat vraagt een doorsnedemodel dat wapening
    // langs alle vier de zijden kent; het korfmodel hier kent alleen een boven-
    // en een onderrij.
    let m_z_grootste = ugt
        .iter()
        .map(|p| p.forces.mz_ed.abs())
        .fold(0.0_f64, f64::max);
    let m_y_grootste = ugt
        .iter()
        .map(|p| p.forces.my_ed.abs())
        .fold(0.0_f64, f64::max);
    if m_z_grootste > M_Z_MELDGRENS * m_y_grootste.max(1e-9) {
        let state = ugt
            .iter()
            .max_by(|a, b| a.forces.mz_ed.abs().total_cmp(&b.forces.mz_ed.abs()))
            .map(ForceStateSnapshot::from_point)
            .unwrap_or_else(leeg_punt);
        checks.push(benoem(calc(
            DUBBELE_BUIGING_ID,
            "Dubbele buiging — is er een moment om de tweede as?",
            "art. 5.8.9",
            state,
            CheckStatus::NotApplicable,
            vec![
                format!(
                    "In de UGT-omhullende staat een moment om de ZWAKKE as: M_z = {} kNm naast \
                     M_y = {} kNm. Dit is een geval van dubbele buiging (§5.8.9), en die paragraaf \
                     is NIET uitgevoerd. Alle §5.8-uitkomsten hierboven — λ, λ_lim, φ_ef — en alle \
                     doorsnedetoetsen van deze staaf gaan uitsluitend over M_y. Zij zijn niet fout, \
                     maar ONVOLLEDIG: de tweede richting is er niet in verwerkt.",
                    nl(m_z_grootste, 1),
                    nl(m_y_grootste, 1)
                ),
                "Wat §5.8.9 vraagt: de slankheid in beide richtingen, en dan óf de twee \
                 voorwaarden van 5.8.9(2) — die een aparte toetsing per richting toestaan zodra de \
                 slankheidsverhouding binnen 2 blijft en de betrekkelijke excentriciteiten binnen \
                 0,2 — óf de interactie van (5.39), (M_Edz/M_Rdz)^a + (M_Edy/M_Rdy)^a ≤ 1, met a \
                 uit de tabel bij N_Ed/N_Rd. Dat vraagt een doorsnedemodel met wapening langs alle \
                 vier de zijden; het korfmodel van deze crate kent een boven- en een onderrij."
                    .to_string(),
                "Zolang dit niet is gebouwd hoort een kolom met dubbele buiging met de hand te \
                 worden nagegaan, of moet het model zo zijn gekozen dat M_z verwaarloosbaar is."
                    .to_string(),
            ],
        )));
    }

    // ── 2. De kruip ───────────────────────────────────────────────────────
    let mut kruip = calc(
        KRUIP_ID,
        "Effectieve kruipcoëfficiënt φ_ef",
        artikel_kruip,
        state,
        CheckStatus::Ok,
        Vec::new(),
    );
    kruip.formula_latex = r"\varphi_{ef} = \varphi(\infty,t_0)\,\frac{M_{0Eqp}}{M_{0Ed}}".to_string();
    kruip.unit = "-".to_string();
    match (k.phi_inf_t0, slank.phi_ef, &slank.kruip) {
        (None, _, _) => {
            kruip.status = CheckStatus::NotApplicable;
            kruip.notes.push(
                "φ(∞,t₀) is niet opgegeven, dus (5.19) kon niet worden ingevuld en de drie \
                 voorwaarden van §5.8.4(4) konden niet worden nagegaan. §3.1.4 wordt in deze app \
                 niet gerekend: die paragraaf vraagt de relatieve luchtvochtigheid, de fictieve \
                 dikte h₀, de cementklasse en de ouderdom t₀ bij eerste belasting, en geen van \
                 vieren is invoer van een raamwerkmodel. λ_lim hierboven is daarom met A = 0,7 \
                 gerekend, de waarde die §5.8.3.1(1) toestaat als φ_ef onbekend is. LET OP: 0,7 is \
                 geen veilige kant maar de waarde bij φ_ef ≈ 2,14; bij zwaardere kruip is de \
                 werkelijke A kleiner en λ_lim dus lager dan hier staat."
                    .to_string(),
            );
        }
        (Some(phi), phi_ef, verwaarlozing) => {
            kruip.value = phi_ef.unwrap_or(0.0);
            kruip.variables = vec![
                NamedValue {
                    symbol: "φ(∞,t₀)".to_string(),
                    value: phi,
                    unit: "-".to_string(),
                },
                NamedValue {
                    symbol: "φ_ef".to_string(),
                    value: phi_ef.unwrap_or(0.0),
                    unit: "-".to_string(),
                },
                NamedValue { symbol: "A".to_string(), value: slank.a, unit: "-".to_string() },
            ];
            match verwaarlozing {
                Some(v) => {
                    kruip.notes.push(format!(
                        "§5.8.4(4) stelt drie voorwaarden waaronder φ_ef = 0 mag worden \
                         aangehouden, en ze gelden alle drie tegelijk. φ(∞,t₀) ≤ 2: {}. λ ≤ 75: \
                         {} (λ = {}). M₀Ed/N_Ed ≥ h: {} (e₀ = {} mm tegenover h = {} mm). \
                         Uitkomst: φ_ef = 0 {}.",
                        if v.kruipcoefficient_ten_hoogste_2 { "ja" } else { "NEE" },
                        if v.slankheid_ten_hoogste_75 { "ja" } else { "NEE" },
                        nl(slank.lambda, 1),
                        if v.excentriciteit_ten_minste_h { "ja" } else { "NEE" },
                        nl(v.e0_mm, 0),
                        nl(section.h_mm, 0),
                        if v.toegestaan { "MAG" } else { "mag NIET" }
                    ));
                    kruip.notes.push(
                        "De derde voorwaarde is een EXCENTRICITEITSeis: het eerste-orde-moment \
                         moet zo groot zijn dat de resultante buiten de doorsnede valt. Een \
                         centrisch gedrukte kolom voldoet er dus nooit aan, en juist daar is kruip \
                         het gevaarlijkst."
                            .to_string(),
                    );
                    if let Some(w) = &v.waarschuwing {
                        kruip.notes.push(w.clone());
                    }
                }
                None => {
                    kruip.notes.push(
                        "§5.8.4(4) kon niet worden nagegaan: daarvoor zijn φ(∞,t₀), M₀Ed én de \
                         doorsnedehoogte h in de beschouwde richting nodig."
                            .to_string(),
                    );
                }
            }
            match phi_ef {
                Some(p) => kruip.notes.push(format!(
                    "φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed = {} · |{} / {}| = {}, en daarmee is \
                     A = 1/(1 + 0,2·φ_ef) = {} in λ_lim gebruikt. M₀Eqp komt uit de \
                     QUASI-BLIJVENDE BGT-combinatie (NEN-EN 1990 uitdrukking (6.16)) en M₀Ed uit \
                     de UGT; beide zijn EERSTE-ORDE-momenten en niet de totale momenten. \
                     §5.8.4(3) laat de verhouding bepalen in de doorsnede met het maximale moment \
                     of als representatief gemiddelde; hier is zij op ÉÉN snede genomen, de snede \
                     die de poort maatgevend maakt.",
                    nl(phi, 2),
                    nl(m0_eqp_knm.unwrap_or(0.0), 1),
                    nl(gov.forces.my_ed, 1),
                    nl(p, 2),
                    nl(slank.a, 3)
                )),
                None => {
                    kruip.status = CheckStatus::NotApplicable;
                    kruip.notes.push(
                        "φ_ef zelf kon niet worden uitgerekend: (5.19) vraagt naast φ(∞,t₀) ook \
                         M₀Eqp uit de quasi-blijvende BGT-combinatie én een M₀Ed dat niet nul is. \
                         Stuur het krachtsverloop onder NEN-EN 1990 uitdrukking (6.16) mee in \
                         `sls_quasi_permanent_envelope`. Zolang dat er niet is, is λ_lim met \
                         A = 0,7 gerekend — toegestaan door §5.8.3.1(1), maar niet de veilige kant."
                            .to_string(),
                    );
                }
            }
        }
    }
    checks.push(benoem(kruip));

    // ── 3. §9.5 — de detailleringseisen die alleen voor een kolom gelden ──
    //
    // Ze horen hier en niet bij §9.2: §9.2 is de BALK. Een staaf krijgt deze
    // eisen zodra er §5.8-gegevens voor zijn opgegeven — dat is het moment
    // waarop de constructeur zegt dat dit een op druk belast element is.
    let phi_l: Vec<f64> = [&cage.top, &cage.bottom]
        .iter()
        .filter(|r| r.count > 0 && r.diameter_mm > 0.0)
        .map(|r| r.diameter_mm)
        .collect();
    let (phi_min, phi_max) = if phi_l.is_empty() {
        (0.0, 0.0)
    } else {
        (
            phi_l.iter().copied().fold(f64::INFINITY, f64::min),
            phi_l.iter().copied().fold(0.0_f64, f64::max),
        )
    };
    let detail = KolomdetailleringInvoer {
        force_state: state,
        h_mm: section.h_mm,
        b_mm: section.b_w_mm(),
        a_c_mm2: section.area_mm2(),
        a_s_mm2: cage.a_s_top_mm2() + cage.a_s_bottom_mm2(),
        phi_l_min_mm: phi_min,
        phi_l_max_mm: phi_max,
        phi_dwars_mm: if cage.stirrup_diameter_mm > 0.0 {
            Some(cage.stirrup_diameter_mm)
        } else {
            None
        },
        s_dwars_mm: cage.stirrup_spacing_mm,
        // Beide zijn hieronder alleen in gebruik bij de toets die ze nodig
        // heeft; de andere toetsen lezen ze niet. De waarde die hier staat is
        // dus nooit een stilzwijgende aanname.
        zone: k.stirrup_zone.unwrap_or(Beugelzone::Regulier),
        overlapping: k.lap_situation.unwrap_or(Overlappingssituatie::GeenLassen),
        n_ed_druk_kn: n_druk_kn,
        f_yd_mpa: mat.f_yd(),
    };

    let mut toepassing = toepassingsgebied_9_5_1(&detail);
    if section.shape != ConcreteShape::Rectangle {
        toepassing.notes.push(
            "Deze doorsnede is geen rechthoek. §9.5.1(1) spreekt van de grootste afmeting h en de \
             kleinste afmeting b; hier is h de totale hoogte en b de LIJFbreedte — de breedte die \
             de doorsnede over haar volle hoogte heeft. Een T of L als kolom is buiten het beeld \
             van §9.5, dat een gedrongen rechthoekige of ronde doorsnede voor ogen heeft."
                .to_string(),
        );
    }
    checks.push(benoem(toepassing));
    checks.push(benoem(min_dwarsafmeting_9_5_1(&detail)));
    checks.push(benoem(min_diameter_langsstaaf_9_5_2(&detail)));

    let mut as_min = as_min_9_5_2(&detail);
    as_min.notes.push(
        "A_s is de SOM van de boven- en de onderrij van de korf. Staven langs de ZIJKANTEN kent \
         het wapeningsmodel niet; liggen ze er wel, dan is de werkelijke A_s groter en is deze \
         minimumeis dus strenger getoetst dan nodig — de veilige kant."
            .to_string(),
    );
    checks.push(benoem(as_min));

    match k.lap_situation {
        Some(_) => {
            let mut as_max = as_max_9_5_2(&detail);
            as_max.notes.push(
                "LET OP, hier werkt het ontbreken van de zijstaven de ANDERE kant op. A_s is de \
                 som van de twee rijen die het model kent; staven langs de zijkanten tellen niet \
                 mee, dus de werkelijke A_s is groter en deze BOVENgrens kan in werkelijkheid wél \
                 zijn overschreden terwijl hier staat dat hij voldoet. Voer de zijstaven mee in de \
                 twee rijen als hun oppervlakte moet meetellen."
                    .to_string(),
            );
            checks.push(benoem(as_max));
        }
        None => checks.push(benoem(calc(
            "9.5.2_as_max",
            "Maximale langswapening in een kolom",
            "NB bij art. 9.5.2(3)",
            state,
            CheckStatus::NotApplicable,
            vec![
                "de overlappingssituatie is niet opgegeven. De nationale bijlage bij §9.5.2(3) \
                 geeft A_s,max = 0,04·A_c buiten een overlappingslas en 0,08·A_c ter plaatse ervan \
                 — een factor twee. Er wordt niets aangenomen: \"geen lassen\" is de RUIMSTE tak, \
                 en die stilzwijgend aanhouden zou een te zware wapening kunnen goedkeuren."
                    .to_string(),
            ],
        ))),
    }

    checks.push(benoem(min_diameter_dwarswapening_9_5_3(&detail)));

    match k.stirrup_zone {
        Some(_) => checks.push(benoem(s_cl_tmax_9_5_3(&detail))),
        None => checks.push(benoem(calc(
            "9.5.3_s_cl_tmax",
            "Hart-op-hartafstand van de dwarswapening in een kolom",
            "art. 9.5.3(3) en (4)",
            state,
            CheckStatus::NotApplicable,
            vec![
                "de beugelzone is niet opgegeven. §9.5.3(4) eist een reductie met factor 0,6 \
                 binnen een afstand gelijk aan de grootste kolomafmeting boven of onder een balk \
                 of plaat, en nabij een overlappingslas met Φ_l > 14 mm. Zonder die keuze wordt de \
                 REGULIERE, dus ruimste, tak niet stilzwijgend aangehouden — die zou een te grote \
                 beugelafstand kunnen goedkeuren op juist de plaatsen waar de norm hem halveert."
                    .to_string(),
            ],
        ))),
    }

    Kolomuitkomst { checks, slankheid: Some(slank) }
}

// ═══════════════════════════════════════════════════════════════════════════
// De losse weg
// ═══════════════════════════════════════════════════════════════════════════

/// De kolomtoets los van een volledige staaftoetsing.
///
/// Dezelfde rekengang als in [`crate::check_concrete_beam`] — letterlijk
/// dezelfde functie [`kolomtoetsen`] — zodat de twee wegen niet uit elkaar
/// kunnen lopen.
pub fn column_check(
    req: ConcreteColumnCheckRequest,
) -> Result<ConcreteColumnCheckResponse, String> {
    let section = req.section.build()?;
    let beton = concrete_class_by_name(&req.concrete_class)
        .ok_or_else(|| format!("betonsterkteklasse {} onbekend", req.concrete_class))?;
    let staal = reinforcement_grade_by_name(&req.reinforcement_grade)
        .ok_or_else(|| format!("wapeningsstaal {} onbekend", req.reinforcement_grade))?;
    req.cage.validate(&section)?;
    if !(req.length_m > 0.0) {
        return Err("de staaflengte moet groter dan nul zijn".to_string());
    }
    let mat = DesignMaterial::new(beton, staal, req.design_situation, req.steel_branch);

    let uit = kolomtoetsen(
        &section,
        &req.cage,
        &mat,
        Some(&req.column),
        req.length_m * 1000.0,
        &req.forces_envelope,
        &req.sls_quasi_permanent_envelope,
    );

    Ok(ConcreteColumnCheckResponse {
        beam_id: req.beam_id,
        section_name: section.name(),
        lambda: uit.slankheid.as_ref().map(|s| s.lambda),
        lambda_lim: uit.slankheid.as_ref().map(|s| s.lambda_lim),
        l0_mm: uit.slankheid.as_ref().map(|s| s.l0_mm),
        tweede_orde_verwaarloosbaar: uit
            .slankheid
            .as_ref()
            .map(|s| s.tweede_orde_verwaarloosbaar),
        phi_ef: uit.slankheid.as_ref().and_then(|s| s.phi_ef),
        checks: uit.checks,
    })
}
