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
//! # Wat deze module NIET doet — en wat zij om de tweede as wél doet
//!
//! In het REKENVLAK rekent zij geen tweede orde uit. Dat doet de algemene
//! methode van §5.8.6, die in deze app bestaat als de fysisch niet-lineaire
//! keten ([`crate::segment_stiffness`] met `lib/betonStijfheid.ts`). Voor die
//! as beantwoordt deze module alleen de voorvraag, en kan zij aan een
//! krachtsverloop niet zien of het al uit zo'n tweede-orde-berekening komt.
//! Dat staat bij de toets.
//!
//! Om de TWEEDE as (z) bestaat die keten niet — de raamwerkoplosser rekent in
//! één vlak — en daar rekent deze module het tweede-orde-deel wél zelf, met de
//! algemene methode op de maatgevende doorsnede (§5.8.6(6)), samen met de
//! imperfectie van §5.2 en de toetsen van §5.8.9. Zie [`TweedeAsUitkomst`].

use mechanics::{ForcePoint, ForceStateSnapshot};
use nen_en_1992_1_1::checks::minimum_eccentricity_mm;
use nen_en_1992_1_1::kolom::{
    as_max_9_5_2, as_min_9_5_2, dubbele_buiging_deelstappen, e_i_5_2_mm, exponent_a_5_39,
    hoekstaven_9_5_2, interactie_5_39, kolom_deelstappen, kolom_deelstappen_om_as, kolomslankheid,
    min_diameter_dwarswapening_9_5_3, min_diameter_langsstaaf_9_5_2, min_dwarsafmeting_9_5_1,
    moment_tweede_as_deelstappen, n_rd_5_39_n, opgesloten_staven_9_5_3, s_cl_tmax_9_5_3,
    scheefstand_5_1, toepassingsgebied_9_5_1, traagheidsstraal_mm, voorwaarde_5_38a,
    voorwaarde_5_38b, Beugelzone, DubbeleBuiging, Knikgeval, Kniklengtebepaling, KolomInvoer,
    KolomdetailleringInvoer, Kolomslankheid, MomentTweedeAs, Overlappingssituatie, Schoring,
    TweedeOrdeDeel,
};
use nen_en_1992_1_1::{
    concrete_class_by_name, kappa_from_nm, mn_kappa_diagram, reinforcement_grade_by_name,
    CheckStatus, ConcreteSection, ConcreteSectionInput, ConcreteShape, DesignMaterial,
    DesignSituation, MnKappaOptions, NamedValue, NonlinearBasis, RebarLayer, ReinforcementCage,
    ResistanceCalc, SteelBranch, UnityCheck,
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
/// # Twee assen
///
/// `bracing` en `buckling_length` gelden voor de as waarin dit model rekent:
/// buiging om de y-as, in het vlak van het raamwerk. Een kolom heeft ook een
/// tweede as, en knikt daar even goed om uit — met de imperfectie van §5.2 en
/// het tweede-orde-effect in díe richting, ook als de raamwerkoplosser M_z = 0
/// levert. Daarom dragen `bracing_z` en `buckling_length_z` de schoring en de
/// kniklengte om de z-as: een EIGEN gegeven, want de schoring verschilt vaak
/// per richting (een kolom kan in het vlak geschoord zijn en er loodrecht op
/// niet). Blijven ze leeg, dan wordt de keuze van het rekenvlak overgenomen
/// en zegt de toets dat met zoveel woorden. `m0_edz_knm` is een extern
/// eerste-orde-moment om de z-as, nul als beginwaarde, zodat een ruimtelijk
/// model hem straks kan vullen zonder dat dit type verandert. De velden zijn
/// per as benoemd en niet als vaste lijst van twee: een derde grootheid
/// (wringing, een schuine as) past er later naast.
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
    /// Geschoord of ongeschoord om de Z-AS — het ontwerpbesluit van §5.8.1
    /// voor de richting loodrecht op het rekenvlak.
    ///
    /// `None` = niet apart opgegeven; dan geldt `bracing` ook om z, en de
    /// toets meldt dat. Dat is een terugval en geen afleiding: wie weet dat
    /// de schoring per richting verschilt, vult dit veld in.
    #[serde(default)]
    #[ts(optional)]
    pub bracing_z: Option<Schoring>,
    /// Hoe l₀ om de Z-AS wordt bepaald: dezelfde keuze als `buckling_length`
    /// (een vakje van figuur 5.7, of l₀ zelf), maar voor de richting loodrecht
    /// op het rekenvlak. Het vakje moet bij `bracing_z` passen.
    ///
    /// `None` = niet apart opgegeven; dan geldt `buckling_length` ook om z, en
    /// de toets meldt dat.
    #[serde(default)]
    #[ts(optional)]
    pub buckling_length_z: Option<Kniklengtekeuze>,
    /// Een EXTERN eerste-orde-moment om de z-as, kNm, constant over de staaf,
    /// dat bij het M_z uit de omhullende wordt opgeteld.
    ///
    /// `None` = 0. Het veld bestaat omdat de vlakke raamwerkoplosser geen M_z
    /// levert; een ruimtelijk model of een handberekening vult het. Het teken
    /// doet er niet toe: de korf is symmetrisch om de hartlijn en de toets
    /// rekent met de grootte.
    #[serde(default)]
    #[ts(optional)]
    pub m0_edz_knm: Option<f64>,
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
    /// De nationale bijlage waarmee getoetst wordt.
    ///
    /// Zij bepaalt de nationaal bepaalde parameters van deze toetsing (zie de
    /// crate `nationale-bijlage`). Een bijlage die deze uitgave niet kent, wordt
    /// bij het lezen van de invoer GEWEIGERD met reden; er wordt nooit stil op
    /// de Nederlandse waarden teruggevallen.
    ///
    /// `#[serde(default)]` — en waarom dat hier geen stille keuze is: er is
    /// precies één gevulde rij, dus "veld weggelaten" kan niet iets anders
    /// betekenen dan die rij. Het houdt oude projectbestanden en oude
    /// MCP-cliënten aan de praat. Zodra er een tweede rij gevuld is, MOET deze
    /// regel weg; de test `zodra_er_een_tweede_bijlage_is_moet_de_serde_default_weg`
    /// in `nationale-bijlage` valt dan om en zegt dat.
    #[serde(default)]
    pub bijlage: nationale_bijlage::NationaleBijlage,
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
    /// λ_z = l₀,z/i_z om de z-as. `None` als de tweede as niet kon.
    #[ts(optional)]
    pub lambda_z: Option<f64>,
    /// λ_lim,z om de z-as.
    #[ts(optional)]
    pub lambda_lim_z: Option<f64>,
    /// l₀,z in mm.
    #[ts(optional)]
    pub l0_z_mm: Option<f64>,
    /// λ_z < λ_lim,z: e₂ om z mocht vervallen.
    #[ts(optional)]
    pub tweede_orde_verwaarloosbaar_z: Option<bool>,
    /// De imperfectie e_i = θ_i·l₀,z/2 om z, mm (§5.2).
    #[ts(optional)]
    pub e_i_z_mm: Option<f64>,
    /// Het tweede-orde-deel e₂ om z, mm; 0 als het mocht vervallen, `None` bij
    /// instabiliteit om z.
    #[ts(optional)]
    pub e_2_z_mm: Option<f64>,
    /// M_Edz op de maatgevende snede, kNm — inclusief imperfectie, tweede orde
    /// en de minimale excentriciteit van 6.1(4). Bij instabiliteit om z (geen
    /// evenwicht; `e_2_z_mm` is dan `None`) het laatste moment waarvoor nog
    /// een kromming is gezocht, en geen rekenwaarde — de toets zegt dat.
    #[ts(optional)]
    pub m_edz_knm: Option<f64>,
    /// M_Rdz op die snede, kNm.
    #[ts(optional)]
    pub m_rdz_knm: Option<f64>,
    /// De grootste som van (5.39), alleen als §5.8.9(4) haar vereiste.
    #[ts(optional)]
    pub interactie_5_39: Option<f64>,
}

// ═══════════════════════════════════════════════════════════════════════════
// De uitkomst binnen de orchestrator
// ═══════════════════════════════════════════════════════════════════════════

/// Wat [`kolomtoetsen`] teruggeeft: de toetsen, plus de slankheid zelf voor
/// wie er nog iets mee moet.
pub struct Kolomuitkomst {
    pub checks: Vec<NamedCheck>,
    pub slankheid: Option<Kolomslankheid>,
    /// Wat er om de tweede as is vastgesteld; `None` als §5.8 als geheel niet
    /// aan de orde was.
    pub tweede_as: Option<TweedeAsUitkomst>,
}

/// De ids van de §5.8-toetsen, zodat een test ze kan terugvinden en een rapport
/// ze kan groeperen.
pub const SLANKHEIDSGRENS_ID: &str = "5.8.3.1_slankheidsgrens";
pub const KRUIP_ID: &str = "5.8.4_kruip";
/// §5.8.3.1 om de z-as: λ_z tegen λ_lim,z.
pub const SLANKHEIDSGRENS_Z_ID: &str = "5.8.3.1_slankheidsgrens_z";
/// Het moment om de z-as — imperfectie, tweede orde en weerstand — tegen M_Rdz.
pub const MOMENT_Z_ID: &str = "5.8.9_moment_z";
/// §5.8.9: de voorwaarden (5.38a)/(5.38b) en, waar nodig, de interactie (5.39).
pub const DUBBELE_BUIGING_ID: &str = "5.8.9_dubbele_buiging";

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
/// Zie [`Eindmomenten`] voor de drie uitkomsten. `moment` kiest de component:
/// M_y voor het rekenvlak, M_z (plus een extern deel) voor de tweede as —
/// dezelfde regels gelden voor allebei.
fn eindmomenten(
    env: &[ForcePoint],
    combinatie: u32,
    lengte_mm: f64,
    moment: impl Fn(&ForcePoint) -> f64,
) -> Eindmomenten {
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
    let m_a = moment(eerste);
    let m_b = moment(laatste);
    // |M₀₂| ≥ |M₀₁| is de definitie van de norm; welke van de twee einden dat
    // is, doet er verder niet toe.
    let (m01, m02) = if m_a.abs() <= m_b.abs() { (m_a, m_b) } else { (m_b, m_a) };
    let grootste_eind = m01.abs().max(m02.abs());
    let grootste_veld = punten.iter().map(|p| moment(p).abs()).fold(0.0_f64, f64::max);
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
/// # Wat A_s hier is
///
/// ω = A_s·f_yd/(A_c·f_cd) en A_s,min/A_s,max van §9.5.2 vragen de TOTALE
/// langswapening — §9.5.2(2) schrijft "de totale hoeveelheid langswapening" en
/// (3) "de oppervlakte van de doorsnede van de langswapening". Dat is hier
/// [`ReinforcementCage::a_s_total_mm2`]: de onderrij, de bovenrij én de
/// zijstaven van beide zijkanten.
///
/// Dat was niet altijd zo. Zolang de korf alleen een boven- en een onderrij
/// kende, ontbraken de zijstaven in A_s, en dat werkte twee kanten op: bij
/// A_s,min en bij λ_lim naar de veilige kant, maar bij **A_s,max naar de
/// ONVEILIGE** — een te lage A_s laat een bovengrens ruimer lijken dan hij is.
/// Die afwijking bestaat niet meer, en de kanttekeningen die haar aankondigden
/// zijn dus weggehaald in plaats van blijven staan.
///
/// # De twee eisen die de LIGGING vragen
///
/// §9.5.2(4) (ten minste één staaf in iedere hoek) en §9.5.3(6) (elke
/// hoekstaaf opgesloten, geen staaf verder dan 150 mm van een opgesloten
/// staaf) vragen niet de hoogte maar de PLAATS van elke staaf. Zij worden nu
/// getoetst, met [`ReinforcementCage::staafposities`] als invoer — dezelfde
/// meetkunde als waarmee de doorsnede wordt getekend, zodat het beeld en de
/// toets niet uiteen kunnen lopen.
///
/// # De tweede as
///
/// Na de poort om y volgen drie toetsen om de z-as — de slankheidsgrens om z,
/// het moment om z (imperfectie, tweede orde, weerstand) en §5.8.9 — zie
/// [`TweedeAsUitkomst`] en de toelichting daarboven. `situation` en
/// `n_strips` zijn daarvoor: de algemene methode om z vraagt de (3.14)-kromme
/// op rekenwaarden, en het M-N-κ-diagram om z dezelfde strokenverdeling als de
/// doorsnedetoetsing.
#[allow(clippy::too_many_arguments)]
pub fn kolomtoetsen(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    situation: DesignSituation,
    n_strips: usize,
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
                tweede_as: None,
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
            tweede_as: None,
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
                tweede_as: None,
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
                tweede_as: None,
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
                tweede_as: None,
            };
        }
    }

    // ── De eindmomenten en de dwarsbelastingvraag ─────────────────────────
    let einden = eindmomenten(ugt, gov.combination_id, lengte_mm, |p| p.forces.my_ed);
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
        a_s_mm2: cage.a_s_total_mm2(),
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
                tweede_as: None,
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
        "ω = A_s·f_yd/(A_c·f_cd) = {} is genomen met A_s = {} mm², de TOTALE langswapening: de \
         onderrij ({} mm²), de bovenrij ({} mm²) en de zijstaven van beide zijkanten samen \
         ({} mm²).",
        nl(slank.omega, 3),
        nl(cage.a_s_total_mm2(), 0),
        nl(cage.a_s_bottom_mm2(), 0),
        nl(cage.a_s_top_mm2(), 0),
        nl(cage.a_s_sides_mm2(), 0)
    ));
    for kant in &slank.kanttekeningen {
        poort.notes.push(kant.clone());
    }
    checks.push(benoem(poort));

    // ── 1b. De tweede as: §5.8.3 om z, §5.2, e₂ om z en §5.8.9 ────────────
    //
    // Hier stond een melding dat §5.8.9 NIET was gebouwd en dat M_z buiten
    // beschouwing bleef. Dat is voorbij: de drie toetsen komen uit
    // `tweede_as_toetsen`, en zij komen er ALTIJD — ook bij M_z = 0 uit het
    // model, want dan is M_Edz door de imperfectie en de tweede orde om z
    // nog steeds niet nul. Zie de toelichting boven [`TweedeAsUitkomst`].
    let (checks_z, tweede_as) = tweede_as_toetsen(
        section, cage, mat, situation, k, lengte_mm, ugt, bgt_qp, &gov, &slank, n_strips,
    );
    checks.extend(checks_z);

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
    // Φ_l,min en Φ_l,max over ALLE drie de rijen. Dat is niet hetzelfde als
    // "de dikste en de dunste van boven en onder": §9.5.3(3) noemt
    // uitdrukkelijk de MINIMUMdiameter en §9.5.3(1) de MAXIMALE, dus dunne
    // zijstaven verscherpen s_cl,tmax en dikke zijstaven de beugeldiameter.
    let (phi_min, phi_max) = cage.phi_l_min_max_mm().unwrap_or((0.0, 0.0));
    let detail = KolomdetailleringInvoer {
        force_state: state,
        h_mm: section.h_mm,
        b_mm: section.b_w_mm(),
        a_c_mm2: section.area_mm2(),
        a_s_mm2: cage.a_s_total_mm2(),
        phi_l_min_mm: phi_min,
        phi_l_max_mm: phi_max,
        phi_dwars_mm: if cage.stirrup_diameter_mm > 0.0 {
            Some(cage.stirrup_diameter_mm)
        } else {
            None
        },
        s_dwars_mm: cage.stirrup_spacing_mm,
        n_beugelbenen: cage.stirrup_legs,
        // Beide zijn hieronder alleen in gebruik bij de toets die ze nodig
        // heeft; de andere toetsen lezen ze niet. De waarde die hier staat is
        // dus nooit een stilzwijgende aanname.
        zone: k.stirrup_zone.unwrap_or(Beugelzone::Regulier),
        overlapping: k.lap_situation.unwrap_or(Overlappingssituatie::GeenLassen),
        n_ed_druk_kn: n_druk_kn,
        f_yd_mpa: mat.f_yd(),
        // De ligging van elke langsstaaf, voor §9.5.2(4) en §9.5.3(6). De korf
        // levert hem zelf, zodat de toets en de doorsnedetekening dezelfde
        // meetkunde gebruiken.
        staafposities: cage.staafposities(section),
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

    // A_s is hier de TOTALE langswapening — onderrij, bovenrij en de zijstaven
    // van beide zijkanten. Dat is wat §9.5.2(2) ("de totale hoeveelheid
    // langswapening") en (3) ("de oppervlakte van de doorsnede van de
    // langswapening") vragen. Zolang de zijstaven niet meetelden, stond hier
    // een kanttekening dat A_s,max in werkelijkheid overschreden kon zijn; die
    // afwijking bestaat niet meer en de kanttekening dus ook niet.
    checks.push(benoem(as_min_9_5_2(&detail)));

    match k.lap_situation {
        Some(_) => checks.push(benoem(as_max_9_5_2(&detail))),
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

    checks.push(benoem(hoekstaven_9_5_2(&detail)));
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

    // §9.5.3(6) staat als laatste van de §9.5-reeks, want hij leunt op de
    // hoekstaven van §9.5.2(4): zonder hoekstaaf is er geen opgesloten staaf om
    // vanaf te meten, en dan zegt deze toets dat met zoveel woorden.
    let mut opgesloten = opgesloten_staven_9_5_3(&detail);
    if section.shape != ConcreteShape::Rectangle {
        opgesloten.notes.push(
            "Deze doorsnede is geen rechthoek. De staven zijn per rij verdeeld over de breedte \
             die op hun eigen hoogte aanwezig is, dus over het LIJF waar de rij in het lijf ligt \
             en over de flens waar hij in de flens ligt. Een T of L als kolom is buiten het beeld \
             van §9.5; lees de gemeten afstand met die beperking."
                .to_string(),
        );
    }
    checks.push(benoem(opgesloten));

    Kolomuitkomst { checks, slankheid: Some(slank), tweede_as: Some(tweede_as) }
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
        req.design_situation,
        nen_en_1992_1_1::DEFAULT_N_STRIPS,
        Some(&req.column),
        req.length_m * 1000.0,
        &req.forces_envelope,
        &req.sls_quasi_permanent_envelope,
    );

    let z = uit.tweede_as.as_ref();
    let slank_z = z.and_then(|t| t.slankheid.as_ref());
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
        lambda_z: slank_z.map(|s| s.lambda),
        lambda_lim_z: slank_z.map(|s| s.lambda_lim),
        l0_z_mm: slank_z.map(|s| s.l0_mm),
        tweede_orde_verwaarloosbaar_z: slank_z.map(|s| s.tweede_orde_verwaarloosbaar),
        e_i_z_mm: z.and_then(|t| t.e_i_mm),
        e_2_z_mm: z.and_then(|t| t.e_2_mm),
        m_edz_knm: z.and_then(|t| t.m_edz_knm),
        m_rdz_knm: z.and_then(|t| t.m_rdz_knm),
        interactie_5_39: z.and_then(|t| t.interactie_5_39),
        checks: uit.checks,
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// De tweede as — §5.2 (imperfectie), §5.8.3 om z, §5.8.6(6) voor e₂ en §5.8.9
// ═══════════════════════════════════════════════════════════════════════════
//
// WAAROM DIT ER IS. De raamwerkoplosser van deze app rekent in één vlak en
// levert M_z = 0. Dat is een eigenschap van het MODEL en niet van de kolom:
// een kolom in een vlak raamwerk heeft een tweede as, en knikt daar even goed
// om uit. Wat er om die as wél is, staat in de norm: de imperfectie van §5.2
// (e_i = θ_i·l₀,z/2 — een gegeven van de uitvoering, niet van de belasting),
// het tweede-orde-effect in die richting, en de minimale excentriciteit van
// 6.1(4). M₀Edz = 0 uit het model betekent dus NIET M_Edz = 0.
//
// WAT ER OM DE TWEEDE AS GEBEURT, in de volgorde van de norm:
//
// 1. §5.8.3.1 om z: λ_z = l₀,z/i_z tegen λ_lim,z, met een EIGEN schoring en
//    kniklengte om z — de schoring verschilt vaak per richting. Ontbreken ze,
//    dan wordt de keuze van het rekenvlak overgenomen en dat wordt gemeld.
//    5.8.3.1(2): "In gevallen met dubbele buiging mag het slankheidscriterium
//    voor iedere richting afzonderlijk zijn gecontroleerd."
// 2. §5.2(7)a: e_i om z, met θ₀ = 1/300 (NB).
// 3. Het tweede-orde-deel e₂ om z. Alleen als λ_z ≥ λ_lim,z (anders staat
//    §5.8.3.1(1) toe het te verwaarlozen, en §5.8.9(4) neemt dat over). De
//    NB laat de nominale kromming (§5.8.8) alleen toe voor GESCHOORDE, op
//    zichzelf staande elementen; de algemene methode van §5.8.6 mag altijd
//    en is ook de methode die deze app in het rekenvlak gebruikt. Hier is zij
//    in de vereenvoudigde vorm van §5.8.6(6) gebruikt: alleen de maatgevende
//    doorsnede, met een aangenomen krommingsverloop (de factor c van
//    5.8.8.2(3)/(4)), en de kromming uit het M-N-κ-diagram om de z-as met de
//    (3.14)-kromme van §5.8.6(3), kruip volgens §5.8.6(4). Omdat e₂ in het
//    moment zit waarbij de kromming wordt gezocht, is dat een
//    evenwichtsiteratie; convergeert zij niet, dan bestaat er geen
//    evenwicht en knikt de kolom om z.
// 4. M_Edz = max(M₀Edz + N_Ed·(e_i + e₂) ; N_Ed·e₀) per snede, tegen M_Rdz
//    uit het M-N-κ-diagram om z (§6.1) — de "afzonderlijke berekening" in de
//    tweede hoofdrichting van §5.8.9(2).
// 5. §5.8.9(3): (5.38a) op de staaf en (5.38b) per snede; waar die niet
//    allebei gelden §5.8.9(4), de interactie (5.39) met de exponent a.
//
// WAAR M_Rdz VANDAAN KOMT. `ReinforcementCage::lagen_om_z` legt de staven op
// hun plaats over de BREEDTE in lagen en draait de doorsnede een kwartslag;
// de M-N-κ-kern ziet dan een rechthoek h × b met lagen op afstand x + b/2.
// Alleen voor een rechthoek: een T of L is om z geen stapel banden, en
// §5.8.9(4) geeft a ook alleen voor cirkel, ellips en rechthoek.
//
// WAT ER NIET IN ZIT. Een echte ruimtelijke tweede-orde-berekening; dit is
// de algemene methode op één snede. En M_Edy wordt genomen zoals de
// omhullende hem levert: of dáár tweede orde in zit, kan deze module niet
// zien — dat zegt de poort om y al.

/// Wat er om de tweede as is vastgesteld, voor het antwoord van het losse
/// verzoek. Alles `None` als de tweede as niet kon worden doorgerekend; de
/// reden staat dan in de toetsen.
#[derive(Clone, Debug, Default)]
pub struct TweedeAsUitkomst {
    pub slankheid: Option<Kolomslankheid>,
    /// e_i om z, mm.
    pub e_i_mm: Option<f64>,
    /// e₂ om z, mm; 0 als hij mocht vervallen, `None` bij instabiliteit.
    pub e_2_mm: Option<f64>,
    /// M_Edz op de maatgevende snede van de toets om z, kNm.
    pub m_edz_knm: Option<f64>,
    /// M_Rdz op die snede, kNm.
    pub m_rdz_knm: Option<f64>,
    /// De grootste som van (5.39) over de sneden waar zij is vereist.
    pub interactie_5_39: Option<f64>,
}

/// De factor c van 5.8.8.2(4) bij een over de lengte CONSTANT eerste-orde-
/// moment: "8 is een ondergrens, overeenkomend met een constant totaal
/// moment". De veilige kant.
const C_CONSTANT_MOMENT: f64 = 8.0;
/// De factor c van 5.8.8.2(4) in het algemeen: "c = 10 (≈ π²)".
const C_ALGEMEEN: f64 = 10.0;
/// Plafond voor de evenwichtsiteratie van e₂. Een kolom die na zoveel stappen
/// nog niet tot rust is, staat op of boven zijn kniklast.
const MAX_ITERATIES_E2: u32 = 500;

/// De drie toetsen om de tweede as als "niet uitgevoerd", met één reden.
///
/// Drie en niet één: het rapport en de tests zoeken elke toets op haar eigen
/// id, en een ontbrekende toets is niet te onderscheiden van een geslaagde.
fn tweede_as_niet_uitgevoerd(state: ForceStateSnapshot, reden: String) -> Vec<NamedCheck> {
    let mk = |id: &str, titel: &str, artikel: &str| {
        benoem(calc(id, titel, artikel, state, CheckStatus::NotApplicable, vec![reden.clone()]))
    };
    vec![
        mk(
            SLANKHEIDSGRENS_Z_ID,
            "Slankheidsgrens om de z-as — moet e₂ om z worden meegenomen?",
            "art. 5.8.3.1(1) en (2), om de z-as",
        ),
        mk(
            MOMENT_Z_ID,
            "Moment om de z-as: imperfectie, tweede orde en weerstand",
            "art. 5.2(7), 5.8.6(6), 5.8.9(2) en 6.1",
        ),
        mk(
            DUBBELE_BUIGING_ID,
            "Dubbele buiging — de twee richtingen samen",
            "art. 5.8.9(3) en (4)",
        ),
    ]
}

/// M_Rd bij N_Ed uit het M-N-κ-diagram (§6.1), of `None` als de doorsnede
/// N_Ed al niet draagt.
fn m_rd_bij_n(
    section: &ConcreteSection,
    lagen: &[RebarLayer],
    mat: &DesignMaterial,
    n_ed_kn: f64,
    sign: f64,
    opts: &MnKappaOptions,
) -> Option<f64> {
    let d = mn_kappa_diagram(section, lagen, mat, n_ed_kn, sign, opts);
    if d.points.is_empty() || !(d.m_max_knm > 0.0) {
        None
    } else {
        Some(d.m_max_knm)
    }
}

/// De evenwichtsiteratie van §5.8.6(6) om de z-as: e₂ = (1/r)·l₀²/c met 1/r
/// de kromming bij het TOTALE moment M₁ + N_Ed·e₂.
///
/// De afbeelding e₂ → (1/r)(M₁ + N·e₂)·l₀²/c is stijgend; van e₂ = 0 af loopt
/// de rij monotoon op naar het laagste vaste punt als dat bestaat, en anders
/// tot het moment boven de momentweerstand van de doorsnede uitkomt en er
/// geen kromming meer is. Dat laatste is geen numeriek ongeluk maar de
/// mechanische uitkomst: geen evenwicht, dus knik.
///
/// `Ok((e₂, 1/r, stappen))` of `Err((laatste M, stappen))`.
fn e_2_iteratie(
    section_z: &ConcreteSection,
    lagen_z: &[RebarLayer],
    mat_nl: &DesignMaterial,
    n_ed_kn: f64,
    m1_knm: f64,
    l0_mm: f64,
    c: f64,
    opts: &MnKappaOptions,
) -> Result<(f64, f64, u32), (f64, u32)> {
    let n_druk = -n_ed_kn;
    let mut e2 = 0.0_f64;
    let mut m = m1_knm;
    for stap in 1..=MAX_ITERATIES_E2 {
        m = m1_knm + n_druk * e2 * 1e-3;
        match kappa_from_nm(section_z, lagen_z, mat_nl, n_ed_kn, m, opts) {
            Ok(sol) if !sol.beyond_eps_cu1 => {
                let kappa = sol.kappa_per_m.abs();
                // κ in 1/m → 1/mm; l₀ in mm; e₂ in mm.
                let e2_nieuw = kappa * 1e-3 * l0_mm * l0_mm / c;
                if (e2_nieuw - e2).abs() <= 1e-4_f64.max(1e-6 * e2_nieuw) {
                    return Ok((e2_nieuw, kappa, stap));
                }
                e2 = e2_nieuw;
            }
            _ => return Err((m, stap)),
        }
    }
    Err((m, MAX_ITERATIES_E2))
}

/// Eén snede van de omhullende, doorgerekend voor §5.8.9.
struct Snede {
    punt: ForcePoint,
    n_druk_kn: f64,
    m0z_knm: f64,
    /// M_Edz voor de toets om z alleen: mét de ondergrens N_Ed·e₀ van 6.1(4).
    m_edz_knm: f64,
    e_0_bindend: bool,
    /// M_Edz zoals §5.8.9 hem vraagt: M₀Edz + N_Ed·(e_i + e₂), inclusief
    /// imperfectie en tweede orde, ZONDER de ondergrens van 6.1(4).
    m_edz_589_knm: f64,
    /// M_Edy zoals §5.8.9 hem vraagt: |M_y| uit de omhullende, zonder 6.1(4).
    m_edy_589_knm: f64,
    m_rdz_knm: Option<f64>,
    m_rdy_knm: Option<f64>,
    voorwaarde_b: nen_en_1992_1_1::kolom::Voorwaarde538b,
    apart: bool,
    n_verhouding: f64,
    a: f64,
    a_grondslag: nen_en_1992_1_1::kolom::ExponentAGrondslag,
    interactie: Option<f64>,
}

impl Snede {
    fn uc_z(&self) -> Option<f64> {
        self.m_rdz_knm.map(|m_rd| self.m_edz_knm / m_rd)
    }
}

/// De toetsen om de tweede as. Zie de toelichting boven [`TweedeAsUitkomst`].
#[allow(clippy::too_many_arguments)]
fn tweede_as_toetsen(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    situation: DesignSituation,
    k: &ConcreteColumnInput,
    lengte_mm: f64,
    ugt: &[ForcePoint],
    bgt_qp: &[ForcePoint],
    gov: &ForcePoint,
    slank_y: &Kolomslankheid,
    n_strips: usize,
) -> (Vec<NamedCheck>, TweedeAsUitkomst) {
    let state = ForceStateSnapshot::from_point(gov);
    let n_gov_kn = -gov.forces.n_ed;
    let leeg = TweedeAsUitkomst::default();
    let opts = MnKappaOptions { n_strips };

    // ── Alleen een rechthoek ──────────────────────────────────────────────
    let (section_z, lagen_z) = match cage.lagen_om_z(section) {
        Ok(v) => v,
        Err(e) => {
            return (
                tweede_as_niet_uitgevoerd(
                    state,
                    format!(
                        "de tweede as is niet doorgerekend: {e} Ook §9.5 ziet alleen een \
                         rechthoekige of ronde kolom. Een T of L met dubbele buiging vraagt een \
                         doorsnedeberekening om de z-as die deze kern niet draagt."
                    ),
                ),
                leeg,
            );
        }
    };

    // ── Schoring en kniklengte om z, met terugval op het rekenvlak ────────
    let (bracing_z, bracing_z_overgenomen) = match k.bracing_z {
        Some(b) => (b, false),
        None => (k.bracing, true),
    };
    let (keuze_z, keuze_z_overgenomen) = match k.buckling_length_z {
        Some(b) => (b, false),
        None => (k.buckling_length, true),
    };
    let (kniklengte_z, l0_opgegeven_z) = match keuze_z {
        Kniklengtekeuze::Figuur57 { geval } => (Kniklengtebepaling::Standaardgeval(geval), None),
        Kniklengtekeuze::Opgegeven { l0_m } if l0_m > 0.0 => {
            (Kniklengtebepaling::Opgegeven, Some(l0_m * 1000.0))
        }
        Kniklengtekeuze::Opgegeven { l0_m } => {
            return (
                tweede_as_niet_uitgevoerd(
                    state,
                    format!(
                        "de kniklengte om de z-as is als 'opgegeven' aangemerkt maar l₀,z = {} m, \
                         en dat is geen lengte. Vul l₀,z in, kies een vast geval uit figuur 5.7, of \
                         laat het veld leeg om de keuze van het rekenvlak over te nemen.",
                        nl(l0_m, 3)
                    ),
                ),
                leeg,
            );
        }
    };

    let i_z = match traagheidsstraal_mm(section.i_z_centroid_mm4(), section.area_mm2()) {
        Ok(v) => v,
        Err(e) => {
            return (
                tweede_as_niet_uitgevoerd(state, format!("i_z is niet te bepalen: {e}")),
                leeg,
            )
        }
    };

    // M_z langs de staaf: uit het model plus het extern opgegeven deel.
    let m0_extern = k.m0_edz_knm.unwrap_or(0.0);
    let mz_van = |p: &ForcePoint| p.forces.mz_ed + m0_extern;

    // ── Eerste doorgang: l₀,z en λ_z, meer niet ──────────────────────────
    let basis = KolomInvoer {
        l_mm: lengte_mm,
        kniklengte: kniklengte_z.clone(),
        l0_opgegeven_mm: l0_opgegeven_z,
        schoring: bracing_z,
        i_mm: i_z,
        a_c_mm2: section.area_mm2(),
        a_s_mm2: cage.a_s_total_mm2(),
        f_cd_mpa: mat.f_cd(),
        f_yd_mpa: mat.f_yd(),
        n_ed_kn: gov.forces.n_ed,
        m0_ed_knm: None,
        m0_eqp_knm: None,
        phi_inf_t0: None,
        h_mm: None,
        eindmomenten_knm: None,
        eerste_orde_vooral_imperfecties_of_dwarsbelasting: true,
    };
    let voorlopig = match kolomslankheid(&basis) {
        Ok(v) => v,
        Err(e) => {
            return (
                tweede_as_niet_uitgevoerd(
                    state,
                    format!("§5.8.3 om de z-as kon niet worden doorgerekend: {e}"),
                ),
                leeg,
            )
        }
    };
    let l0_z = voorlopig.l0_mm;

    // ── §5.2: de imperfectie om z ─────────────────────────────────────────
    let scheef = match scheefstand_5_1(lengte_mm / 1000.0, 1) {
        Ok(v) => v,
        Err(e) => return (tweede_as_niet_uitgevoerd(state, format!("§5.2: {e}")), leeg),
    };
    let e_i = match e_i_5_2_mm(scheef.theta_i, l0_z) {
        Ok(v) => v,
        Err(e) => return (tweede_as_niet_uitgevoerd(state, format!("§5.2: {e}")), leeg),
    };

    // ── M₀Ed om z op de maatgevende snede, inclusief imperfectie ─────────
    //
    // 5.8.8.2(1): M₀Ed is "het eerste-orde-moment, inclusief het effect van
    // imperfecties". Voor (5.19) en voor de derde voorwaarde van §5.8.4(4)
    // is dat het moment dat telt.
    let m0z_gov = mz_van(gov).abs();
    let m0_ed_z = m0z_gov + n_gov_kn * e_i * 1e-3;
    // M₀Eqp om z. Het imperfectiemoment is evenredig met N, dus de verhouding
    // M₀Eqp/M₀Ed van (5.19) is de verhouding van de normaalkrachten in de
    // quasi-blijvende en de UGT-combinatie — op dezelfde snede. Een extern
    // M₀Edz kent geen quasi-blijvende tegenhanger; ook daarop is die
    // verhouding toegepast, en dat staat in de kanttekening.
    let n_qp_druk = bgt_qp
        .iter()
        .min_by(|a, b| {
            (a.position_mm - gov.position_mm)
                .abs()
                .total_cmp(&(b.position_mm - gov.position_mm).abs())
        })
        .map(|p| -p.forces.n_ed)
        .filter(|n| *n > 0.0);
    let m0_eqp_z = n_qp_druk.map(|nqp| m0_ed_z * nqp / n_gov_kn);

    let einden_z = eindmomenten(ugt, gov.combination_id, lengte_mm, mz_van);
    let (eindmomenten_z, r_m_is_een_z) = match einden_z {
        Eindmomenten::Paar { m01, m02 } => (Some((m01, m02)), false),
        Eindmomenten::RmIsEen { .. } => (None, true),
        Eindmomenten::Onbekend => (None, false),
    };

    let invoer_z = KolomInvoer {
        m0_ed_knm: Some(m0_ed_z),
        m0_eqp_knm: m0_eqp_z,
        phi_inf_t0: k.phi_inf_t0,
        h_mm: Some(section.b_mm),
        eindmomenten_knm: eindmomenten_z,
        eerste_orde_vooral_imperfecties_of_dwarsbelasting: r_m_is_een_z,
        ..basis
    };
    let slank_z = match kolomslankheid(&invoer_z) {
        Ok(v) => v,
        Err(e) => {
            return (
                tweede_as_niet_uitgevoerd(
                    state,
                    format!("§5.8.3 om de z-as kon niet worden doorgerekend: {e}"),
                ),
                leeg,
            )
        }
    };

    let herkomst_z = format!(
        "Om de z-as geldt: schoring {} ({}), kniklengte {} ({}). l₀,z = {} mm, i_z = √(I_z/A) = {} \
         mm (voor een rechthoek b/√12), λ_z = l₀,z/i_z = {}.",
        bracing_z.label(),
        if bracing_z_overgenomen {
            "NIET apart opgegeven — overgenomen van het rekenvlak; een kolom kan in het vlak \
             geschoord zijn en er loodrecht op niet, dus controleer dit"
        } else {
            "apart opgegeven voor deze as"
        },
        match kniklengte_z {
            Kniklengtebepaling::Standaardgeval(g) => g.omschrijving().to_string(),
            _ => "rechtstreeks opgegeven".to_string(),
        },
        if keuze_z_overgenomen {
            "NIET apart opgegeven — overgenomen van het rekenvlak"
        } else {
            "apart opgegeven voor deze as"
        },
        nl(slank_z.l0_mm, 0),
        nl(i_z, 2),
        nl(slank_z.lambda, 1)
    );

    let mut checks: Vec<NamedCheck> = Vec::new();

    // ── Toets 1: de poort om z ────────────────────────────────────────────
    //
    // GEEN unity check en ALTIJD status Ok als zij kon worden bepaald. De
    // poort om y zet NotOk als λ ≥ λ_lim, omdat de app dáár de tweede orde
    // niet zelf kan toevoegen: de krachten komen uit de raamwerkoplosser. Om
    // z voegt deze module e₂ zélf toe zodra de poort dat vraagt, dus er blijft
    // niets ongedaan en er valt niets af te keuren. Een uc λ_z/λ_lim,z > 1 zou
    // via uc_max de hele staaf rood maken voor iets dat verwerkt is; vandaar
    // `uc: None`. Het antwoord staat in de waarde, de grootheden en de tekst.
    let mut poort_z = calc(
        SLANKHEIDSGRENS_Z_ID,
        "Slankheidsgrens om de z-as — moet e₂ om z worden meegenomen?",
        "art. 5.8.3.1(1) en (2), om de z-as; NB: λ_lim = 20·A·B·C/√n als eis",
        state,
        CheckStatus::Ok,
        Vec::new(),
    );
    poort_z.formula_latex = r"\lambda_z < \lambda_{lim,z} = \frac{20\,A\,B\,C}{\sqrt{n}}".to_string();
    poort_z.variables = vec![
        NamedValue { symbol: "l_0,z".to_string(), value: slank_z.l0_mm, unit: "mm".to_string() },
        NamedValue { symbol: "i_z".to_string(), value: slank_z.i_mm, unit: "mm".to_string() },
        NamedValue { symbol: "λ_z".to_string(), value: slank_z.lambda, unit: "-".to_string() },
        NamedValue { symbol: "n".to_string(), value: slank_z.n, unit: "-".to_string() },
        NamedValue { symbol: "ω".to_string(), value: slank_z.omega, unit: "-".to_string() },
        NamedValue { symbol: "A".to_string(), value: slank_z.a, unit: "-".to_string() },
        NamedValue { symbol: "B".to_string(), value: slank_z.b, unit: "-".to_string() },
        NamedValue { symbol: "C".to_string(), value: slank_z.c, unit: "-".to_string() },
        NamedValue {
            symbol: "λ_lim,z".to_string(),
            value: slank_z.lambda_lim,
            unit: "-".to_string(),
        },
    ];
    // De keten om z draagt de asnaam in elk symbool (l₀,z, i_z, λ_z,
    // λ_lim,z), zodat hij in het rapport niet met de poort om y te verwarren
    // is.
    poort_z.deelstappen = kolom_deelstappen_om_as(&slank_z, "z");
    poort_z.notes.push(
        "Om de z-as buigt de kolom UIT het vlak van het model. De raamwerkberekening ziet die \
         richting niet — ook niet als zij tweede orde rekent — en levert daar M_z = 0. Daarom \
         bepaalt deze toets de imperfectie en e₂ om z zelf, in plaats van op de krachten uit het \
         model te vertrouwen."
            .to_string(),
    );
    poort_z.value = slank_z.lambda_lim;
    poort_z.unit = "-".to_string();
    poort_z.notes.push(herkomst_z.clone());
    poort_z.notes.push(format!(
        "5.8.3.1(2): bij dubbele buiging mag het slankheidscriterium per richting afzonderlijk \
         worden gecontroleerd. λ_z = {} tegen λ_lim,z = {}: {}",
        nl(slank_z.lambda, 1),
        nl(slank_z.lambda_lim, 1),
        if slank_z.tweede_orde_verwaarloosbaar {
            "de tweede-orde-effecten om z mogen worden verwaarloosd (§5.8.3.1(1)); e₂ = 0 in \
             M_Edz."
        } else {
            "de tweede-orde-effecten om z mogen NIET worden verwaarloosd. Anders dan om y keurt \
             deze poort daarmee niets af: e₂ om z wordt hieronder met de algemene methode (§5.8.6) \
             bepaald en in M_Edz verwerkt."
        }
    ));
    poort_z.notes.push(format!(
        "M₀Ed om z voor λ_lim,z en (5.19) is genomen op dezelfde snede als de poort om y (x = {} \
         mm, combinatie {}): |M_z uit het model + extern M₀Edz| = |{} + {}| = {} kNm, plus het \
         imperfectiemoment N_Ed·e_i = {} · {} mm = {} kNm (5.8.8.2(1): M₀Ed is inclusief het \
         effect van imperfecties), samen {} kNm. {}",
        gov.position_mm.round() as i64,
        gov.combination_id,
        nl(gov.forces.mz_ed, 2),
        nl(m0_extern, 2),
        nl(m0z_gov, 2),
        nl(n_gov_kn, 1),
        nl(e_i, 2),
        nl(n_gov_kn * e_i * 1e-3, 2),
        nl(m0_ed_z, 2),
        match n_qp_druk {
            Some(nqp) => format!(
                "M₀Eqp om z is daaruit afgeleid als M₀Ed,z · N_Eqp/N_Ed = {} · {}/{} = {} kNm: het \
                 imperfectiemoment is evenredig met de normaalkracht, dus de verhouding van (5.19) \
                 is die van de normaalkrachten in de quasi-blijvende en de UGT-combinatie. Op een \
                 extern opgegeven M₀Edz is dezelfde verhouding toegepast; dat is een aanname.",
                nl(m0_ed_z, 2),
                nl(nqp, 1),
                nl(n_gov_kn, 1),
                nl(m0_eqp_z.unwrap_or(0.0), 2)
            ),
            None => "Er is geen quasi-blijvende combinatie met normaaldruk meegestuurd, dus \
                     M₀Eqp om z en daarmee φ_ef,z zijn onbekend."
                .to_string(),
        }
    ));
    match einden_z {
        Eindmomenten::Paar { m01, m02 } => poort_z.notes.push(format!(
            "De eindmomenten om z uit combinatie {}: M₀₁ = {} kNm en M₀₂ = {} kNm, dus r_m = M₀₁/M₀₂ \
             bepaalt C.",
            gov.combination_id,
            nl(m01, 2),
            nl(m02, 2)
        )),
        Eindmomenten::RmIsEen { dwarsbelasting: true, .. } => poort_z.notes.push(
            "Tussen de einden staat om z een groter |M| dan aan de einden: dwarsbelasting, dus \
             r_m = 1,0 en C = 0,7 (§5.8.3.1(1))."
                .to_string(),
        ),
        Eindmomenten::RmIsEen { dwarsbelasting: false, .. } => poort_z.notes.push(
            "Om de z-as staan er geen eerste-orde-eindmomenten (het model levert M_z = 0 en er is \
             geen extern M₀Edz), of ze zijn gelijk: wat er aan eerste-orde-effect is komt uit \
             imperfecties, en §5.8.3.1(1) wijst dan r_m = 1,0 aan — C = 0,7."
                .to_string(),
        ),
        Eindmomenten::Onbekend => poort_z.notes.push(
            "De twee eindmomenten om z waren niet allebei terug te vinden in de omhullende; r_m \
             blijft onbekend en §5.8.3.1(1) staat dan C = 0,7 toe."
                .to_string(),
        ),
    }
    for kant in &slank_z.kanttekeningen {
        poort_z.notes.push(kant.clone());
    }
    checks.push(benoem(poort_z));

    // ── φ_ef om z voor de algemene methode ────────────────────────────────
    let (phi_ef_z, phi_note) = match (&slank_z.kruip, slank_z.phi_ef) {
        (Some(v), _) if v.toegestaan => (
            0.0,
            format!(
                "§5.8.4(4): φ(∞,t₀) ≤ 2, λ_z ≤ 75 en M₀Ed/N_Ed ≥ b zijn alle drie vervuld, dus \
                 φ_ef = 0 mag worden aangehouden; e₂ is zonder kruip bepaald (φ_ef,z = 0, \
                 waar (5.19) {} zou geven).",
                slank_z.phi_ef.map(|p| nl(p, 3)).unwrap_or_else(|| "geen waarde".to_string())
            ),
        ),
        (_, Some(p)) => (
            p,
            format!(
                "Kruip in de algemene methode volgens §5.8.6(4): alle betonrekken van de \
                 (3.14)-kromme zijn met (1 + φ_ef,z) = {} vermenigvuldigd, met φ_ef,z = {} uit \
                 (5.19) om de z-as.",
                nl(1.0 + p, 3),
                nl(p, 3)
            ),
        ),
        (_, None) => (
            0.0,
            "LET OP: φ_ef om z is onbekend (φ(∞,t₀) niet opgegeven, of geen quasi-blijvende \
             combinatie meegestuurd), dus e₂ is ZONDER kruip bepaald. Voor een blijvend belaste \
             kolom is dat de onveilige kant: kruip vergroot de kromming en daarmee e₂. Geef \
             φ(∞,t₀) op en stuur de quasi-blijvende combinatie mee om dit te verhelpen."
                .to_string(),
        ),
    };

    // ── e₂ om z ───────────────────────────────────────────────────────────
    //
    // De factor c: het eerste-orde-moment om z is in dit model bijna altijd
    // constant over de lengte (de imperfectie N·e_i en een vast extern
    // M₀Edz). 5.8.8.2(4) zegt dan een lagere c te overwegen, met 8 als
    // ondergrens; die ondergrens is de veilige kant en wordt genomen. Varieert
    // M_z uit het model wél langs de staaf, dan c = 10 (≈ π²).
    let mz_gov_combi: Vec<f64> = ugt
        .iter()
        .filter(|p| p.combination_id == gov.combination_id)
        .map(|p| mz_van(p).abs())
        .collect();
    let mz_max = mz_gov_combi.iter().cloned().fold(0.0_f64, f64::max);
    let mz_min = mz_gov_combi.iter().cloned().fold(f64::INFINITY, f64::min);
    let mz_varieert = mz_gov_combi.len() > 1 && mz_max - mz_min > 0.01 * mz_max + 1e-9;
    let c = if mz_varieert { C_ALGEMEEN } else { C_CONSTANT_MOMENT };

    // De (3.14)-kromme van §5.8.6(3) op rekenwaarden, met kruip volgens
    // §5.8.6(4) — het materiaal van de constructieve berekening, niet dat van
    // de doorsnedetoetsing (dat blijft `mat`).
    let beton = concrete_class_by_name(mat.concrete_name);
    let staal = reinforcement_grade_by_name(mat.steel_name);
    let (Some(beton), Some(staal)) = (beton, staal) else {
        return (
            tweede_as_niet_uitgevoerd(
                state,
                "het materiaal van de doorsnede is niet in de tabellen terug te vinden".to_string(),
            ),
            leeg,
        );
    };
    let mat_nl = DesignMaterial::nonlinear(
        beton,
        staal,
        situation,
        mat.steel.branch,
        NonlinearBasis::DesignValues,
        phi_ef_z,
    );

    let m1_gov = m0z_gov + n_gov_kn * e_i * 1e-3;
    let tweede_orde = if slank_z.tweede_orde_verwaarloosbaar {
        TweedeOrdeDeel::Verwaarloosd { lambda: slank_z.lambda, lambda_lim: slank_z.lambda_lim }
    } else {
        match e_2_iteratie(&section_z, &lagen_z, &mat_nl, gov.forces.n_ed, m1_gov, l0_z, c, &opts) {
            Ok((e_2_mm, kappa_per_m, iteraties)) => TweedeOrdeDeel::Gerekend {
                e_2_mm,
                kappa_per_m,
                c,
                iteraties,
                phi_ef: phi_ef_z,
                lambda: slank_z.lambda,
                lambda_lim: slank_z.lambda_lim,
            },
            Err((laatste_m_knm, iteraties)) => TweedeOrdeDeel::Instabiel {
                laatste_m_knm,
                c,
                iteraties,
                phi_ef: phi_ef_z,
                lambda: slank_z.lambda,
                lambda_lim: slank_z.lambda_lim,
            },
        }
    };
    let e_2 = match tweede_orde {
        TweedeOrdeDeel::Gerekend { e_2_mm, .. } => e_2_mm,
        _ => 0.0,
    };
    let instabiel = matches!(tweede_orde, TweedeOrdeDeel::Instabiel { .. });

    // ── Per snede: M_Edz, M_Rdz, M_Edy, M_Rdy, (5.38b), a en (5.39) ──────
    let e_0z = minimum_eccentricity_mm(section.b_mm);
    let lagen_y = cage.layers(section.h_mm);
    let n_rd_n = n_rd_5_39_n(section.area_mm2(), mat.f_cd(), cage.a_s_total_mm2(), mat.f_yd())
        .unwrap_or(0.0);
    let voorwaarde_a = voorwaarde_5_38a(slank_y.lambda, slank_z.lambda).ok();

    // Kleine caches op N (op 0,1 kN afgerond): sneden met dezelfde
    // normaalkracht hebben letterlijk dezelfde M_Rd.
    let mut cache_z: Vec<(i64, Option<f64>)> = Vec::new();
    let mut cache_y: Vec<(i64, f64, Option<f64>)> = Vec::new();
    let mut sneden: Vec<Snede> = Vec::new();
    for p in ugt.iter().filter(|p| p.forces.n_ed < 0.0) {
        let n_druk = -p.forces.n_ed;
        let sleutel = (n_druk * 10.0).round() as i64;
        let m_rdz = match cache_z.iter().find(|(s, _)| *s == sleutel) {
            Some((_, v)) => *v,
            None => {
                let v = m_rd_bij_n(&section_z, &lagen_z, mat, p.forces.n_ed, 1.0, &opts);
                cache_z.push((sleutel, v));
                v
            }
        };
        let sign_y = if p.forces.my_ed < 0.0 { -1.0 } else { 1.0 };
        let m_rdy = match cache_y.iter().find(|(s, t, _)| *s == sleutel && *t == sign_y) {
            Some((_, _, v)) => *v,
            None => {
                let v = m_rd_bij_n(section, &lagen_y, mat, p.forces.n_ed, sign_y, &opts);
                cache_y.push((sleutel, sign_y, v));
                v
            }
        };
        let m0z = mz_van(p).abs();
        let m_edz_ruw = m0z + n_druk * (e_i + e_2) * 1e-3;
        let m_min_z = n_druk * e_0z * 1e-3;
        let e_0_bindend = m_min_z > m_edz_ruw;
        let m_edz = m_edz_ruw.max(m_min_z);
        let m_edy = p.forces.my_ed.abs();
        // (5.38b) en (5.39) vragen "de rekenwaarde van het moment, inclusief
        // tweede-orde-moment" — de werkelijke rekenmomenten, dus zónder de
        // ondergrens N_Ed·e₀ van 6.1(4). Die ondergrens is een eis aan de
        // DOORSNEDETOETS per richting (§6.1 om y, de toets om z hierboven) en
        // hoort daar; hem in beide richtingen tegelijk in de interactie zetten
        // zou elke centrisch gedrukte kolom een dubbele buiging opdringen die
        // er niet is.
        let voorwaarde_b = match voorwaarde_5_38b(
            m_edz_ruw / n_druk * 1e3,
            m_edy / n_druk * 1e3,
            slank_y.i_mm,
            i_z,
        ) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let apart = voorwaarde_a.map(|a| a.voldaan).unwrap_or(false) && voorwaarde_b.voldaan;
        let (a, a_grondslag) = exponent_a_5_39(n_druk * 1e3, n_rd_n).unwrap_or((
            1.0,
            nen_en_1992_1_1::kolom::ExponentAGrondslag::OnderTabel,
        ));
        let interactie = match (m_rdz, m_rdy) {
            (Some(rz), Some(ry)) => interactie_5_39(m_edz_ruw, rz, m_edy, ry, a).ok(),
            _ => None,
        };
        sneden.push(Snede {
            punt: *p,
            n_druk_kn: n_druk,
            m0z_knm: m0z,
            m_edz_knm: m_edz,
            e_0_bindend,
            m_edz_589_knm: m_edz_ruw,
            m_edy_589_knm: m_edy,
            m_rdz_knm: m_rdz,
            m_rdy_knm: m_rdy,
            voorwaarde_b,
            apart,
            n_verhouding: n_druk * 1e3 / n_rd_n.max(1e-9),
            a,
            a_grondslag,
            interactie,
        });
    }

    // ── Toets 2: het moment om z tegen M_Rdz ─────────────────────────────
    let gov_snede = sneden
        .iter()
        .find(|s| s.punt.combination_id == gov.combination_id && s.punt.position_mm == gov.position_mm);
    let maatgevend_z = sneden
        .iter()
        .filter(|s| s.uc_z().is_some())
        .max_by(|a, b| a.uc_z().unwrap().total_cmp(&b.uc_z().unwrap()))
        .or(gov_snede)
        .or(sneden.first());

    let mut uit = TweedeAsUitkomst {
        slankheid: Some(slank_z.clone()),
        e_i_mm: Some(e_i),
        e_2_mm: if instabiel { None } else { Some(e_2) },
        m_edz_knm: None,
        m_rdz_knm: None,
        interactie_5_39: None,
    };

    let mut moment_z = calc(
        MOMENT_Z_ID,
        "Moment om de z-as: imperfectie, tweede orde en weerstand",
        "art. 5.2(7) (5.2), 5.8.6(6), 5.8.9(2) en 6.1",
        state,
        CheckStatus::Ok,
        Vec::new(),
    );
    moment_z.formula_latex =
        r"M_{Edz} = \max\{M_{0Edz} + N_{Ed}(e_i + e_2)\ ;\ N_{Ed} e_0\} \le M_{Rdz}".to_string();
    moment_z.unit = "kNm".to_string();
    moment_z.notes.push(
        "De raamwerkoplosser van deze app rekent in één vlak en levert M_z = 0. Dat is een \
         eigenschap van het model en niet van de kolom: om de z-as werken de imperfectie van \
         §5.2 (een gegeven van de uitvoering) en het tweede-orde-effect net zo goed, en 6.1(4) \
         stelt bovendien een minimale excentriciteit. M₀Edz = 0 betekent dus NIET M_Edz = 0. Een \
         extern M₀Edz (invoerveld, nul als niets is opgegeven) en een M_z in de omhullende — uit \
         een ruimtelijk model — tellen hier gewoon mee."
            .to_string(),
    );
    moment_z.notes.push(herkomst_z);
    moment_z.notes.push(phi_note.clone());
    match maatgevend_z {
        Some(s) => {
            let m_rd = s.m_rdz_knm;
            let mta = MomentTweedeAs {
                n_ed_druk_kn: s.n_druk_kn,
                m0_knm: s.m0z_knm,
                scheefstand: scheef,
                l0_mm: l0_z,
                e_i_mm: e_i,
                tweede_orde,
                e_0_mm: e_0z,
                e_0_bindend: s.e_0_bindend,
                m_ed_knm: if instabiel {
                    match tweede_orde {
                        TweedeOrdeDeel::Instabiel { laatste_m_knm, .. } => laatste_m_knm,
                        _ => s.m_edz_knm,
                    }
                } else {
                    s.m_edz_knm
                },
                m_rd_knm: m_rd,
            };
            moment_z.force_state = ForceStateSnapshot::from_point(&s.punt);
            moment_z.deelstappen = moment_tweede_as_deelstappen(&mta);
            moment_z.value = mta.m_ed_knm;
            moment_z.variables = vec![
                NamedValue { symbol: "N_Ed".to_string(), value: s.n_druk_kn, unit: "kN".to_string() },
                NamedValue { symbol: "M_0Edz".to_string(), value: s.m0z_knm, unit: "kNm".to_string() },
                NamedValue { symbol: "e_i".to_string(), value: e_i, unit: "mm".to_string() },
                NamedValue { symbol: "e_2".to_string(), value: e_2, unit: "mm".to_string() },
                NamedValue { symbol: "e_0".to_string(), value: e_0z, unit: "mm".to_string() },
                NamedValue { symbol: "M_Edz".to_string(), value: mta.m_ed_knm, unit: "kNm".to_string() },
                NamedValue {
                    symbol: "M_Rdz".to_string(),
                    value: m_rd.unwrap_or(0.0),
                    unit: "kNm".to_string(),
                },
            ];
            moment_z.notes.push(format!(
                "Maatgevend is de snede x = {} mm van combinatie {} — de snede met de grootste \
                 M_Edz/M_Rdz over alle sneden met normaaldruk ({} sneden). e₂ is bepaald op de snede \
                 met de grootste normaaldruk (x = {} mm, combinatie {}) en op elke snede gebruikt: \
                 e₂ groeit met N, dus dat is de veilige kant. De imperfectie e_i geldt langs de \
                 hele staaf.",
                s.punt.position_mm.round() as i64,
                s.punt.combination_id,
                sneden.len(),
                gov.position_mm.round() as i64,
                gov.combination_id
            ));
            uit.m_edz_knm = Some(mta.m_ed_knm);
            uit.m_rdz_knm = m_rd;
            match (instabiel, m_rd) {
                (true, Some(rd)) => {
                    let ed = mta.m_ed_knm;
                    moment_z.status = CheckStatus::NotOk;
                    moment_z.uc = Some(UnityCheck {
                        ed,
                        rd,
                        uc: (ed / rd).max(1.0),
                        formula_latex: r"M_{Edz} / M_{Rdz}".to_string(),
                    });
                    moment_z.notes.push(
                        "GEEN EVENWICHT om de z-as: de kolom knikt in die richting. De unity check \
                         is op ten minste 1,0 gezet — er bestaat geen toestand waarin de doorsnede \
                         het totale moment draagt, dus zij is per definitie overschreden."
                            .to_string(),
                    );
                }
                (false, Some(rd)) => {
                    let uc = mta.m_ed_knm / rd;
                    moment_z.uc = Some(UnityCheck {
                        ed: mta.m_ed_knm,
                        rd,
                        uc,
                        formula_latex: r"M_{Edz} / M_{Rdz}".to_string(),
                    });
                    moment_z.status = if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };
                }
                (_, None) => {
                    moment_z.status = CheckStatus::NotOk;
                    moment_z.notes.push(
                        "De doorsnede draagt de normaalkracht van deze snede al niet bij κ = 0; \
                         er is geen momentweerstand om z meer over."
                            .to_string(),
                    );
                }
            }
        }
        None => {
            moment_z.status = CheckStatus::NotApplicable;
            moment_z.notes.push(
                "Er is geen snede met normaaldruk waarop M_Edz kon worden bepaald.".to_string(),
            );
        }
    }
    checks.push(benoem(moment_z));

    // ── Toets 3: §5.8.9 — apart, of de interactie (5.39) ─────────────────
    let mut db = calc(
        DUBBELE_BUIGING_ID,
        "Dubbele buiging — de twee richtingen samen",
        "art. 5.8.9(3) (5.38a), (5.38b) en 5.8.9(4) (5.39)",
        state,
        CheckStatus::Ok,
        Vec::new(),
    );
    db.formula_latex =
        r"\left(\frac{M_{Edz}}{M_{Rdz}}\right)^a + \left(\frac{M_{Edy}}{M_{Rdy}}\right)^a \le 1{,}0"
            .to_string();
    db.unit = "-".to_string();
    db.notes.push(
        "M_Edy is genomen zoals de omhullende hem levert; of daar al tweede orde in zit, kan deze \
         toets niet zien — zie de poort om y. M_Edz = M₀Edz + N_Ed·(e_i + e₂) is de rekenwaarde \
         om z inclusief imperfectie en tweede orde. De ondergrens N_Ed·e₀ van 6.1(4) zit in GEEN \
         van beide: (5.38b) en (5.39) vragen de werkelijke rekenmomenten, en 6.1(4) is een eis \
         aan de doorsnedetoets per richting — die staat om y in §6.1 en om z in de toets hierboven. \
         Beide momenten zijn per snede genomen; §5.8.9(1) vraagt bijzondere aandacht voor de \
         doorsnede met de kritieke combinatie van momenten, en daarom is elke snede met \
         normaaldruk nagegaan."
            .to_string(),
    );
    let (Some(va), false) = (voorwaarde_a, instabiel) else {
        db.status = CheckStatus::NotApplicable;
        db.notes.push(if instabiel {
            "Er is geen M_Edz: de kolom knikt om de z-as (zie de toets van het moment om z). \
             Zolang er om z geen evenwicht is, heeft de interactie van (5.39) geen betekenis."
                .to_string()
        } else {
            "(5.38a) kon niet worden opgesteld: een van de twee slankheden is nul.".to_string()
        });
        checks.push(benoem(db));
        return (checks, uit);
    };

    let vereist: Vec<&Snede> = sneden.iter().filter(|s| !s.apart).collect();
    let gekozen: Option<&Snede> = if vereist.is_empty() {
        // Overal apart toegestaan: toon de snede die het dichtst bij de grens
        // van (5.38b) zit — de grootste van de kleinste van de twee verhoudingen.
        sneden.iter().max_by(|a, b| {
            let ka = a.voorwaarde_b.y_door_z.min(a.voorwaarde_b.z_door_y);
            let kb = b.voorwaarde_b.y_door_z.min(b.voorwaarde_b.z_door_y);
            ka.total_cmp(&kb)
        })
    } else {
        // De interactie is vereist: de grootste som telt. Een snede waar M_Rd
        // ontbreekt (de doorsnede draagt N al niet) gaat vóór alles.
        vereist
            .iter()
            .find(|s| s.interactie.is_none())
            .copied()
            .or_else(|| {
                vereist
                    .iter()
                    .max_by(|a, b| a.interactie.unwrap().total_cmp(&b.interactie.unwrap()))
                    .copied()
            })
    };

    match gekozen {
        None => {
            db.status = CheckStatus::NotApplicable;
            db.notes.push(
                "Er is geen snede met normaaldruk waarop §5.8.9 kon worden nagegaan.".to_string(),
            );
        }
        Some(s) => {
            db.force_state = ForceStateSnapshot::from_point(&s.punt);
            let apart_toegestaan = vereist.is_empty();
            match (s.m_rdz_knm, s.m_rdy_knm) {
                (Some(rz), Some(ry)) => {
                    let som = s.interactie.unwrap_or(f64::NAN);
                    let d = DubbeleBuiging {
                        voorwaarde_a: va,
                        voorwaarde_b: s.voorwaarde_b,
                        apart_toegestaan,
                        n_ed_druk_kn: s.n_druk_kn,
                        n_rd_kn: n_rd_n * 1e-3,
                        a_c_mm2: section.area_mm2(),
                        a_s_mm2: cage.a_s_total_mm2(),
                        f_cd_mpa: mat.f_cd(),
                        f_yd_mpa: mat.f_yd(),
                        n_verhouding: s.n_verhouding,
                        a: s.a,
                        a_grondslag: s.a_grondslag,
                        m_edy_knm: s.m_edy_589_knm,
                        m_rdy_knm: ry,
                        m_edz_knm: s.m_edz_589_knm,
                        m_rdz_knm: rz,
                        interactie: som,
                    };
                    db.deelstappen = dubbele_buiging_deelstappen(&d);
                    db.variables = vec![
                        NamedValue { symbol: "λ_y".to_string(), value: va.lambda_y, unit: "-".to_string() },
                        NamedValue { symbol: "λ_z".to_string(), value: va.lambda_z, unit: "-".to_string() },
                        NamedValue { symbol: "e_y".to_string(), value: s.voorwaarde_b.e_y_mm, unit: "mm".to_string() },
                        NamedValue { symbol: "e_z".to_string(), value: s.voorwaarde_b.e_z_mm, unit: "mm".to_string() },
                        NamedValue { symbol: "N_Ed".to_string(), value: s.n_druk_kn, unit: "kN".to_string() },
                        NamedValue { symbol: "N_Rd".to_string(), value: n_rd_n * 1e-3, unit: "kN".to_string() },
                        NamedValue { symbol: "a".to_string(), value: s.a, unit: "-".to_string() },
                        NamedValue { symbol: "M_Edz".to_string(), value: s.m_edz_589_knm, unit: "kNm".to_string() },
                        NamedValue { symbol: "M_Rdz".to_string(), value: rz, unit: "kNm".to_string() },
                        NamedValue { symbol: "M_Edy".to_string(), value: s.m_edy_589_knm, unit: "kNm".to_string() },
                        NamedValue { symbol: "M_Rdy".to_string(), value: ry, unit: "kNm".to_string() },
                    ];
                    db.value = som;
                    if apart_toegestaan {
                        db.status = CheckStatus::Ok;
                        db.notes.push(format!(
                            "§5.8.9(3): (5.38a) is vervuld (λ_y/λ_z = {}, λ_z/λ_y = {}) en (5.38b) \
                             is op elke snede met normaaldruk vervuld; op de snede die er het \
                             dichtst bij zit (x = {} mm, combinatie {}) is de kleinste van de twee \
                             verhoudingen {} ≤ 0,2. Geen verdere controle nodig: de twee richtingen \
                             zijn elk afzonderlijk getoetst — om y in de doorsnedetoetsen van §6.1, \
                             om z in de toets hierboven (§5.8.9(2)). Deze toets heeft daarom geen \
                             unity check; de som van (5.39) staat ter informatie in de afleiding.",
                            nl(va.y_door_z, 3),
                            nl(va.z_door_y, 3),
                            s.punt.position_mm.round() as i64,
                            s.punt.combination_id,
                            nl(s.voorwaarde_b.y_door_z.min(s.voorwaarde_b.z_door_y), 3)
                        ));
                    } else {
                        db.uc = Some(UnityCheck {
                            ed: som,
                            rd: 1.0,
                            uc: som,
                            formula_latex:
                                r"\left(M_{Edz}/M_{Rdz}\right)^a + \left(M_{Edy}/M_{Rdy}\right)^a"
                                    .to_string(),
                        });
                        db.status = if som <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };
                        db.notes.push(format!(
                            "§5.8.9(3) is niet vervuld{}: op {} van de {} sneden met normaaldruk \
                             geldt (5.38b) niet. §5.8.9(4) vraagt dan de interactie (5.39); de \
                             grootste som staat op x = {} mm van combinatie {}: {} met a = {} bij \
                             N_Ed/N_Rd = {}.",
                            if va.voldaan {
                                ""
                            } else {
                                " — al door (5.38a): de slankheden verschillen meer dan een factor 2"
                            },
                            vereist.len(),
                            sneden.len(),
                            s.punt.position_mm.round() as i64,
                            s.punt.combination_id,
                            nl(som, 3),
                            nl(s.a, 3),
                            nl(s.n_verhouding, 3)
                        ));
                        uit.interactie_5_39 = Some(som);
                    }
                }
                _ => {
                    db.status = CheckStatus::NotOk;
                    db.notes.push(format!(
                        "Op de snede x = {} mm van combinatie {} draagt de doorsnede de \
                         normaalkracht N_Ed = {} kN al niet bij κ = 0; er is geen momentweerstand \
                         om een van beide assen over en (5.39) is niet op te stellen.",
                        s.punt.position_mm.round() as i64,
                        s.punt.combination_id,
                        nl(s.n_druk_kn, 1)
                    ));
                }
            }
        }
    }
    checks.push(benoem(db));

    (checks, uit)
}
