//! `slankheid` — §7.4.2: de doorbuiging die zonder berekening mag worden
//! afgedaan, via de grenswaarde van de slankheid l/d.
//!
//! §7.4.1(6) geeft twee wegen om de grenstoestand van vervorming te
//! controleren: begrenzing van de slankheid (7.4.2), of een berekende
//! doorbuiging vergelijken met een grenswaarde (7.4.3). Deze module loopt de
//! EERSTE weg. §7.4.2(2) zegt met zoveel woorden wat een geslaagde toets
//! oplevert: "Indien gewapend betonnen balken of platen in gebouwen zo zijn
//! gedimensioneerd dat ze voldoen aan de in deze paragraaf gegeven grenzen van
//! de slankheid, mag ervan zijn uitgegaan dat hun doorbuigingen de in 7.4.1(4)
//! en (5) gestelde grenzen niet overschrijden."
//!
//! Een ELEMENT DAT NIET VOLDOET IS NIET AFGEKEURD. §7.4.2(1)P: "Zorgvuldigere
//! controles zijn nodig voor elementen die buiten deze grenzen liggen". De
//! natuurlijke vervolgstap is dan §7.4.3, en die is hier NIET gebouwd — zie
//! onderaan.
//!
//! ## De keten, met vindplaats per stap
//!
//! ```text
//! ρ₀ = 10⁻³ · √f_ck                                        7.4.2(2), f_ck in MPa
//!
//! l/d = K[11 + 1,5√f_ck · ρ₀/ρ
//!          + 3,2√f_ck (ρ₀/ρ − 1)^{3/2}]        als ρ ≤ ρ₀       (7.16.a)
//!
//! l/d = K[11 + 1,5√f_ck · ρ₀/(ρ − ρ')
//!          + (1/12)√f_ck · √(ρ'/ρ₀)]           als ρ > ρ₀       (7.16.b)
//!
//! K  uit tabel 7.4N — door de Nederlandse bijlage NORMATIEF gemaakt
//!
//! daarna vermenigvuldigen met, CUMULATIEF:
//!   310/σ_s   = 500/(f_yk · A_s,req/A_s,prov)  als conservatieve
//!                                             aanname                 (7.17)
//!   0,8       indien b_flens / b_rib > 3
//!   7/l_eff   balken en platen (GEEN vlakke plaatvloer), l_eff > 7 m,
//!             die kwetsbare scheidingswanden dragen; l_eff IN METERS
//!   8,5/l_eff vlakke plaatvloeren, grootste overspanning > 8,5 m,
//!             onder dezelfde scheidingswandvoorwaarde; l_eff IN METERS
//! ```
//!
//! De grenswaarden waar dit alles voor staat, staan in 7.4.1(4) en (5) en
//! worden door [`deflection_limits`] mee teruggegeven: overspanning/250 voor
//! het uiterlijk en de algehele bruikbaarheid, en overspanning/500 voor de
//! doorbuiging NA DE BOUW die aansluitende delen kan beschadigen — beide onder
//! de QUASI-BLIJVENDE belastingcombinatie.
//!
//! ## Waar deze toets het mis kan gaan, en wat daaraan is gedaan
//!
//! * **l_eff in METERS.** De correcties 7/l_eff en 8,5/l_eff schrijven l_eff
//!   uitdrukkelijk in meters voor, terwijl deze hele kern in N en mm rekent.
//!   Met 9000 mm zou 7/l_eff de factor 0,00078 opleveren in plaats van 0,78 —
//!   een toets die duizend keer te streng is en er toch geloofwaardig uitziet,
//!   want hij keurt gewoon af. De omrekening staat daarom op één plek
//!   ([`LongSpanCorrection::factor`]) en wordt door een eigen test bewaakt.
//! * **f_ck in MPa.** De norm schrijft achter de definitielijst van (7.16)
//!   letterlijk "f_ck in MPa". Getalmatig gelijk aan N/mm², maar wie f_ck ooit
//!   in kN/m² doorgeeft, ziet √f_ck en daarmee ρ₀ volledig verlopen.
//! * **ρ en ρ' zijn de VEREISTE wapeningsverhoudingen** om het moment uit de
//!   REKENWAARDE van de belastingen op te nemen — niet de geplaatste wapening.
//!   Wie A_s,prov invult, krijgt een te gunstige l/d én telt de meerwapening
//!   dubbel, want die zit al in (7.17) via A_s,req/A_s,prov.
//! * **De twee takken van (7.16) zijn niet uitwisselbaar.** In (7.16.a) staat
//!   (ρ₀/ρ − 1)^{3/2}; zodra ρ > ρ₀ is de basis negatief en levert de macht
//!   3/2 een NaN. De takkeuze staat daarom in één `if`, met ρ = ρ₀ naar
//!   (7.16.a) — dat is wat "als ρ ≤ ρ₀" zegt.
//! * **In (7.16.b) staat ρ − ρ' in de noemer.** Bij ρ' → ρ explodeert de term.
//!   De norm geeft daar geen ondergrens; deze module verzint er ook geen maar
//!   WEIGERT die invoer met een leesbare reden.
//! * **De correcties zijn cumulatief.** De norm geeft ze als afzonderlijke
//!   zinnen ("behoren de waarden … te zijn vermenigvuldigd met …") en zegt
//!   nergens dat er maar één mag gelden. 310/σ_s, 0,8 en 7/l_eff kunnen dus
//!   tegelijk werken.
//! * **De lange-overspanningscorrecties zijn GEEN bonus.** Ze gelden alleen
//!   boven de drempel én onder de scheidingswandvoorwaarde. Bij een korte
//!   overspanning zou 7/l_eff een factor groter dan 1 opleveren; dat is
//!   evident niet bedoeld en gebeurt hier dus niet.
//! * **De 7 m-regel geldt uitdrukkelijk NIET voor vlakke plaatvloeren**; die
//!   hebben hun eigen 8,5 m-regel. De twee sluiten elkaar uit.
//! * **De getallen 14/20, 18/26 … in tabel 7.4N zijn GEEN invoer.** Het zijn
//!   de uitkomsten van (7.16) bij ρ = 1,5 % respectievelijk ρ = 0,5 % voor
//!   C30/37, bedoeld als oriëntatie. De rekengang gebruikt K plus (7.16).
//!   Ze staan hier wel in ([`StructuralSystemInfo`]) omdat de gebruiker aan
//!   die twee getallen herkent welke tabelregel hij kiest.
//!
//! ## Toepassingsgebied — deze toets mag niet blind over elke staaf
//!
//! Tabel 7.4N draagt de titel "Basisslankheden voor gewapend betonnen
//! elementen ZONDER NORMAALDRUK", en 7.4.2(2) beperkt de regel tot gewapend
//! betonnen balken of platen IN GEBOUWEN. Kolommen, elementen met
//! noemenswaardige normaaldruk en voorgespannen elementen vallen erbuiten.
//! Daarom:
//!
//! * [`SlendernessRequest::n_ed_kn`] is optioneel. Is er DRUK opgegeven, dan
//!   weigert [`span_depth_limit`] met een leesbare reden in plaats van een
//!   getal te leveren. De norm noemt géén drempel waaronder een normaaldruk
//!   mag worden verwaarloosd, dus wordt er ook geen drempel verzonnen; de
//!   enige tolerantie in de vergelijking is een afrondingstolerantie.
//! * Is de normaalkracht niet opgegeven, dan rekent de toets door maar staat
//!   in de aantekeningen dat de voorwaarde "zonder normaaldruk" NIET is
//!   gecontroleerd.
//! * Of het element een balk of plaat "in een gebouw" is, is uit een
//!   raamwerkmodel niet vast te stellen. Dat blijft dus een aantekening.
//!
//! De keuze van het constructieve systeem ([`StructuralSystem`]) is de zwakste
//! schakel van deze weg: tussen K = 1,0 en K = 1,5 zit 50 % verschil. Hij is
//! daarom INVOER en geen gok uit de modeltopologie, en hij komt in de
//! afleiding terug zodat de constructeur hem ziet en kan overschrijven.
//!
//! ## Wat hier NIET is gebouwd
//!
//! **§7.4.3 — doorbuiging door berekening — zit hier niet in, en dat is
//! opzet.** Die weg heeft (7.20) nodig, E_c,eff = E_cm/(1 + φ(∞,t₀)), en dus
//! de kruipcoëfficiënt van 3.1.4. Die paragraaf is niet gelezen; een geraden
//! kruipgetal zou elke berekende doorbuiging onbruikbaar maken. Wat er voor
//! 7.4.3 nodig zou zijn:
//!
//! * φ(∞,t₀) volgens 3.1.4, met de invoer die daarbij hoort (relatieve
//!   luchtvochtigheid, fictieve dikte h₀, cementklasse, ouderdom t₀ bij
//!   belasten) — geen van die vier zit nu in het model;
//! * ε_cs volgens 3.1.4 voor (7.21). LET OP: de Nederlandse bijlage bij
//!   7.4.3(6) laat de krimpbijdrage bij VLOEREN EN BALKEN vervallen, dus voor
//!   die elementen vervalt deze hele stap — maar niet voor andere elementen;
//! * f_ctm uit tabel 3.1 en de keuze f_ctm/f_ctm,fl. De Nederlandse bijlage
//!   bij 7.4.3(4) schrijft f_ctm,fl voor bij vloeren en balken waarvoor
//!   volgens 7.3.2(1) geen beheersing van scheurvorming is vereist; die vraag
//!   moet de app dus kunnen beantwoorden;
//! * een BGT-belastinggang: 7.4.1(4) en (5) toetsen op de QUASI-BLIJVENDE
//!   combinatie, en 7.4.3 rekent met GEMIDDELDE materiaalwaarden (E_cm,
//!   f_ctm).
//!
//! **De vorm van 7.4.3 past goed op de bestaande M-N-κ-rekengang van §5.8.6**:
//! (7.18) α = ζ·α_II + (1 − ζ)·α_I vraagt precies twee doorsnedeberekeningen
//! per station en een interpolatie, en 7.4.3(7) schrijft als zorgvuldigste weg
//! voor om de kromming in veel doorsneden te bepalen en numeriek te
//! integreren — dat is wat de per-segment-aanpak en de veldzakking w(x) al
//! doen. Wie dat later oppakt, moet wel weten dat het GEEN hergebruik van het
//! UGT-diagram is: dat diagram draait op rekenwaarden (f_cd, E_cd) en
//! verwaarloost beton in trek, en is dus alleen α_II; α_I (de ongescheurde,
//! getransformeerde doorsnede) moet er nog bij, op gemiddelde
//! materiaalwaarden. En de tension stiffening van ζ uit (7.19) is NIET
//! hetzelfde model als het gecorrigeerde M-N-κ-diagram dat de nationale
//! bijlage bij de tweede-orde-berekening voorschrijft; die twee mogen niet
//! voor elkaar in de plaats worden gebruikt.
//!
//! Verder buiten beschouwing:
//!
//! * de zeeg. 7.4.2(2): "Bij de afleiding van deze vergelijkingen is geen
//!   rekening gehouden met een eventuele zeeg." De grens van 7.4.1(4) op de
//!   opbuiging (overspanning/250) wordt wél meegeleverd, maar niet getoetst —
//!   het model kent geen zeeg;
//! * l_eff volgens 5.3.2.2(1). Vergelijking (5.8) luidt l_eff = l_n + a₁ + a₂,
//!   met a₁ en a₂ uit figuur 5.4; die figuur en dus de oplegdetails zitten
//!   niet in dit model. l_eff is daarom invoer, met de te toetsen overspanning
//!   als expliciet gemelde terugval;
//! * de doorbuigingseisen die in Nederland langs NEN-EN 1990/NB en het
//!   Bouwbesluit gelden. EN 1992-1-1 §7.4.1 geeft l/250 en l/500 als "in het
//!   algemeen geschikte" grenzen en verwijst verder naar ISO 4356. Ga er niet
//!   van uit dat daarmee alles is gedekt.
//!
//! ## Vindplaatsen
//!
//! Alles hieronder is gelezen uit de PDF-uitgave
//! (`NEN-EN 1992-1-1_2005+A1_2015+NB_2016+A1_2020 Beton - Algemeen.pdf`),
//! §7.4 op de bladzijden 166–173:
//!
//! * (7.16.a), (7.16.b) en (7.17) zijn van de GERENDERDE bladzijde 167/168
//!   gelezen; in de tekstlaag ontbreken de formulebeelden.
//! * ρ₀ = 10⁻³·√f_ck komt uit de TEKSTLAAG: op zowel bladzijde 167 als 168
//!   wordt de definitieregel van ρ₀ door de eronder liggende ρ-regel
//!   overdrukt en is hij met het oog niet leesbaar. Hij is daarom NUMERIEK
//!   nagerekend tegen de norm zelf: met ρ₀ = 10⁻³√f_ck reproduceert (7.16) de
//!   getallen van tabel 7.4N (zie de test `tabel_7_4n_volgt_uit_7_16`). Dat is
//!   een controle op de norm en niet op deze code.
//! * Tabel 7.4N, de vijf regels met hun K, en OPMERKING 1, 2 en 3 zijn van de
//!   gerenderde bladzijde 169/170 gelezen, in de NB-versie.
//! * De drie correctiezinnen (0,8 bij b_flens/b_rib > 3; 7/l_eff; 8,5/l_eff)
//!   zijn woordelijk van de gerenderde bladzijde 168 gelezen.
//! * 7.4.1(4) en (5) zijn van de gerenderde bladzijde 166/167 gelezen.
//!
//! DE NEDERLANDSE BIJLAGE bij 7.4.2(2) — het enige NBP-artikel in §7.4 — haalt
//! de aanbevolen OPMERKING met tabel 7.4N door en zet ervoor in de plaats:
//! "De waarde van K moet aan tabel 7.4N zijn ontleend, welke tabel als
//! normatief moet zijn gelezen." De NB-versie van de tabel bevat exact
//! dezelfde vijf regels en dezelfde K-waarden; wat verandert is de STATUS, en
//! dat is precies waarom K hier geen instelbare parameter is maar een vaste
//! tabel.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, Deelstap, ResistanceCalc, UnityCheck};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::deelstappen::{lx, nl, nv, stap};

// ───────────────────────────────────────────────────────────────────────────
// Vaste getallen uit §7.4
// ───────────────────────────────────────────────────────────────────────────

/// De staalspanning waaronder (7.16.a) en (7.16.b) zijn afgeleid, in MPa.
///
/// 7.4.2(2): "De vergelijkingen (7.16.a) en (7.16.b) zijn afgeleid onder de
/// aanname dat de staalspanning, ten gevolge van de van toepassing zijnde
/// rekenwaarde van de belasting in de BGT in een gescheurde doorsnede in het
/// midden van de overspanning van een balk of een plaat of bij de oplegging
/// van een uitkraging, gelijk is aan 310 MPa, (ruwweg overeenkomend met
/// f_yk = 500 MPa)."
pub const REFERENCE_STEEL_STRESS_MPA: f64 = 310.0;

/// De teller van (7.17), in MPa. Hangt samen met de aangenomen f_yk = 500 MPa.
pub const EQ_7_17_NUMERATOR_MPA: f64 = 500.0;

/// De verhouding flensbreedte/ribbreedte waarboven de flenscorrectie geldt.
///
/// 7.4.2(2): "Voor doorsneden met flenzen waarin de verhouding van de
/// flensbreedte tot de ribbreedte groter is dan 3 …". STRIKT groter dan 3;
/// bij precies 3 geldt de correctie niet.
pub const FLANGE_RATIO_THRESHOLD: f64 = 3.0;

/// De flenscorrectie zelf: "… behoren de waarden van l/d gegeven door
/// vergelijking (7.16) met 0,8 te zijn vermenigvuldigd."
pub const FLANGE_CORRECTION_FACTOR: f64 = 0.8;

/// Drempeloverspanning én teller van de correctie voor balken en platen die
/// GEEN vlakke plaatvloer zijn, in METERS (7.4.2(2)).
pub const LONG_SPAN_BEAM_THRESHOLD_M: f64 = 7.0;

/// Drempeloverspanning én teller van de correctie voor vlakke plaatvloeren,
/// in METERS (7.4.2(2)).
pub const LONG_SPAN_FLAT_SLAB_THRESHOLD_M: f64 = 8.5;

/// 7.4.1(4): grenswaarde voor het uiterlijk en de algehele bruikbaarheid —
/// de berekende zakking onder de quasi-blijvende belastingen, ten opzichte
/// van de opleggingen, ten hoogste overspanning/250.
pub const DEFLECTION_DIVISOR_APPEARANCE: f64 = 250.0;

/// 7.4.1(5): grenswaarde tegen schade aan aansluitende constructiedelen —
/// voor doorbuigingen NA DE BOUW, onder quasi-blijvende belastingen, in het
/// algemeen overspanning/500.
pub const DEFLECTION_DIVISOR_DAMAGE: f64 = 500.0;

/// 7.4.1(4): een in de bekisting aangebrachte opbuiging (zeeg) behoort in het
/// algemeen niet groter te zijn dan overspanning/250.
pub const PRECAMBER_DIVISOR: f64 = 250.0;

/// De belastingcombinatie waaronder de grenswaarden van 7.4.1(4) en (5)
/// gelden, als tekst voor het rapport.
pub const DEFLECTION_LOAD_COMBINATION: &str = "quasi-blijvend";

/// Afrondingstolerantie op de normaalkracht, in kN.
///
/// Dit is GEEN normwaarde en geen drempel waaronder een normaaldruk mag
/// worden verwaarloosd — de norm geeft zo'n drempel niet. Het is uitsluitend
/// de marge waarbinnen een normaalkracht als numeriek nul geldt, zodat een
/// staaf met N_Ed = −1·10⁻¹² kN niet ten onrechte buiten het
/// toepassingsgebied van tabel 7.4N valt.
const N_ED_ROUNDING_TOLERANCE_KN: f64 = 1e-9;

// ───────────────────────────────────────────────────────────────────────────
// Tabel 7.4N — het constructieve systeem
// ───────────────────────────────────────────────────────────────────────────

/// Het constructieve systeem uit tabel 7.4N, dat K bepaalt.
///
/// De vijf regels van de tabel, in de volgorde van de tabel. De namen zijn
/// Engels omdat de rest van de kern dat is; de woordelijke Nederlandse
/// tabelregel staat in [`StructuralSystemInfo::label`].
///
/// Deze keuze is INVOER. Uit een raamwerkmodel is zij niet betrouwbaar af te
/// leiden — of een veld een eind- of een tussenoverspanning is, hangt van de
/// continuïteit van de ligger af, en of een plaat in één of in twee
/// richtingen draagt is een ontwerpgegeven. Tussen K = 1,0 en K = 1,5 zit
/// 50 % verschil, dus een gok is hier duurder dan een vraag.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum StructuralSystem {
    /// Vrij opgelegde balk, in één of twee richtingen dragende vrij opgelegde
    /// plaat. K = 1,0.
    SimplySupported,
    /// Eindoverspanning van een doorgaande balk of in één richting dragende
    /// plaat of in twee richtingen dragende over één lange zijde doorgaande
    /// plaat. K = 1,3.
    EndSpan,
    /// Tussenoverspanning van een balk of een in één of twee richtingen
    /// dragende plaat. K = 1,5.
    InteriorSpan,
    /// Plaat opgelegd op kolommen zonder balken (vlakke plaatvloer),
    /// gebaseerd op de langste overspanning. K = 1,2.
    FlatSlab,
    /// Uitkraging. K = 0,4.
    Cantilever,
}

/// Eén regel uit tabel 7.4N, zoals een keuzelijst hem nodig heeft.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct StructuralSystemInfo {
    pub system: StructuralSystem,
    /// De kolom "Constructief systeem", woordelijk uit de tabel.
    pub label: &'static str,
    /// De kolom K.
    pub k: f64,
    /// De kolom "Beton onder hoge spanning (ρ = 1,5 %)". ORIËNTATIE, GEEN
    /// INVOER: dit is de uitkomst van (7.16) voor C30/37 bij ρ = 1,5 %.
    pub basic_high_stress: f64,
    /// De kolom "Beton onder lage spanning (ρ = 0,5 %)". Idem oriëntatie.
    pub basic_low_stress: f64,
}

/// Tabel 7.4N, woordelijk, in de door de Nederlandse bijlage normatief
/// verklaarde versie ("De waarde van K moet aan tabel 7.4N zijn ontleend,
/// welke tabel als normatief moet zijn gelezen"). De NB-versie draagt
/// dezelfde titel en dezelfde getallen als de aanbevolen versie; wat de NB
/// verandert is dat zij niet langer een aanbeveling is.
pub const STRUCTURAL_SYSTEMS: &[StructuralSystemInfo] = &[
    StructuralSystemInfo {
        system: StructuralSystem::SimplySupported,
        label: "Vrij opgelegde balk, in één of twee richtingen dragende vrij opgelegde plaat",
        k: 1.0,
        basic_high_stress: 14.0,
        basic_low_stress: 20.0,
    },
    StructuralSystemInfo {
        system: StructuralSystem::EndSpan,
        label: "Eindoverspanning van een doorgaande balk of in één richting dragende plaat of in \
                twee richtingen dragende over één lange zijde doorgaande plaat",
        k: 1.3,
        basic_high_stress: 18.0,
        basic_low_stress: 26.0,
    },
    StructuralSystemInfo {
        system: StructuralSystem::InteriorSpan,
        label: "Tussenoverspanning van een balk of een in één of twee richtingen dragende plaat",
        k: 1.5,
        basic_high_stress: 20.0,
        basic_low_stress: 30.0,
    },
    StructuralSystemInfo {
        system: StructuralSystem::FlatSlab,
        label: "Plaat opgelegd op kolommen zonder balken (vlakke plaatvloer) (gebaseerd op de \
                langste overspanning)",
        k: 1.2,
        basic_high_stress: 17.0,
        basic_low_stress: 24.0,
    },
    StructuralSystemInfo {
        system: StructuralSystem::Cantilever,
        label: "Uitkraging",
        k: 0.4,
        basic_high_stress: 6.0,
        basic_low_stress: 8.0,
    },
];

impl StructuralSystem {
    /// De tabelregel die bij dit systeem hoort.
    pub fn info(self) -> &'static StructuralSystemInfo {
        STRUCTURAL_SYSTEMS
            .iter()
            .find(|r| r.system == self)
            .expect("elke variant van StructuralSystem staat in STRUCTURAL_SYSTEMS")
    }

    /// K uit tabel 7.4N.
    pub fn k(self) -> f64 {
        self.info().k
    }

    /// De woordelijke tabelregel.
    pub fn label(self) -> &'static str {
        self.info().label
    }

    /// Is dit een vlakke plaatvloer? Bepaalt WELKE van de twee
    /// lange-overspanningscorrecties van toepassing kan zijn: de 7 m-regel
    /// geldt uitdrukkelijk voor "balken en platen, ANDERE DAN vlakke
    /// plaatvloeren", de 8,5 m-regel uitsluitend voor vlakke plaatvloeren.
    pub fn is_flat_slab(self) -> bool {
        matches!(self, StructuralSystem::FlatSlab)
    }

    /// De aantekening bij de te toetsen overspanning, uit OPMERKING 2 bij
    /// tabel 7.4N: "Voor in twee richtingen dragende platen behoort de
    /// controle te zijn uitgevoerd op basis van de KORTSTE overspanning. Voor
    /// vlakke plaatvloeren behoort de LANGSTE overspanning te zijn genomen."
    ///
    /// Welke overspanning is ingevuld, kan deze module niet controleren — er
    /// is maar één getal. De aantekening reist daarom mee zodat de lezer het
    /// zelf kan nagaan.
    pub fn span_note(self) -> &'static str {
        match self {
            StructuralSystem::FlatSlab =>
                "OPMERKING 2 bij tabel 7.4N: voor vlakke plaatvloeren behoort de LANGSTE \
                 overspanning te zijn genomen. Controleer dat de ingevulde overspanning die is.",
            _ =>
                "OPMERKING 2 bij tabel 7.4N: voor in twee richtingen dragende platen behoort de \
                 controle te zijn uitgevoerd op basis van de KORTSTE overspanning. Bij een balk \
                 of een in één richting dragende plaat is er maar één overspanning.",
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// ρ₀ en de takkeuze
// ───────────────────────────────────────────────────────────────────────────

/// ρ₀ = 10⁻³·√f_ck, met f_ck in MPa (7.4.2(2)).
///
/// De referentiewaarde van de wapeningsverhouding die bepaalt WELKE tak van
/// (7.16) geldt. Dimensieloos.
pub fn rho_0(f_ck_mpa: f64) -> f64 {
    1e-3 * f_ck_mpa.sqrt()
}

/// Welke tak van (7.16) is gebruikt.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum SlendernessEquation {
    /// (7.16.a) — geldt als ρ ≤ ρ₀. Bevat ρ' NIET.
    Eq716a,
    /// (7.16.b) — geldt als ρ > ρ₀. Hier telt de drukwapening mee.
    Eq716b,
}

impl SlendernessEquation {
    pub fn number(self) -> &'static str {
        match self {
            SlendernessEquation::Eq716a => "(7.16.a)",
            SlendernessEquation::Eq716b => "(7.16.b)",
        }
    }

    /// De formule symbolisch, voor het rapport.
    pub fn formula_latex(self) -> &'static str {
        match self {
            SlendernessEquation::Eq716a =>
                r"\frac{l}{d} = K\left[11 + 1{,}5\sqrt{f_{ck}}\,\frac{\rho_0}{\rho} + 3{,}2\sqrt{f_{ck}}\left(\frac{\rho_0}{\rho}-1\right)^{3/2}\right]",
            SlendernessEquation::Eq716b =>
                r"\frac{l}{d} = K\left[11 + 1{,}5\sqrt{f_{ck}}\,\frac{\rho_0}{\rho-\rho'} + \frac{1}{12}\sqrt{f_{ck}}\sqrt{\frac{\rho'}{\rho_0}}\right]",
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// De correcties
// ───────────────────────────────────────────────────────────────────────────

/// Eén correctiefactor op de basiswaarde van (7.16), met de reden waarom hij
/// wél of NIET is toegepast.
///
/// Een correctie die niet geldt, verdwijnt hier NIET uit het antwoord. Anders
/// zou de lezer niet kunnen zien of de norm haar heeft overwogen of dat de
/// implementatie haar is vergeten — en juist bij deze drie correcties gaat het
/// mis. Een niet toegepaste correctie staat er dus in met `factor = 1,0`,
/// `applied = false` en een reden.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct SlendernessCorrection {
    /// Stabiele sleutel: `"sigma_s"`, `"flens"`, `"lange_overspanning"`.
    pub id: String,
    /// Nederlandse naam voor het rapport.
    pub label: String,
    /// Vindplaats.
    pub article: String,
    /// De factor waarmee de basiswaarde is vermenigvuldigd. 1,0 als de
    /// correctie niet van toepassing is.
    pub factor: f64,
    pub applied: bool,
    /// De formule van deze correctie MET DE GETALLEN INGEVULD, in LaTeX.
    /// Zonder deze regel staat in het rapport wel de factor maar niet waar
    /// hij vandaan komt, en juist bij deze drie correcties is dat de vraag.
    pub filled_latex: String,
    /// Waarom wél of niet, in gewone taal.
    pub reason: String,
}

/// De rekenwijze van de lange-overspanningscorrectie, apart zodat de
/// eenhedenval op één plek zit.
struct LongSpanCorrection {
    /// 7 m voor balken en platen, 8,5 m voor vlakke plaatvloeren.
    threshold_m: f64,
    l_eff_m: f64,
}

impl LongSpanCorrection {
    /// DE EENHEDENVAL VAN DIT HOOFDSTUK. De norm schrijft de factor als
    /// `7 / l_eff` met "l_eff in meters", terwijl deze kern in mm rekent.
    /// De omrekening staat hier en nergens anders.
    fn factor(&self) -> f64 {
        self.threshold_m / self.l_eff_m
    }

    fn applies(&self) -> bool {
        self.l_eff_m > self.threshold_m
    }
}

// ───────────────────────────────────────────────────────────────────────────
// De grenswaarden van 7.4.1
// ───────────────────────────────────────────────────────────────────────────

/// De doorbuigingsgrenzen van 7.4.1(4) en (5) voor één overspanning.
///
/// Dit zijn de grenzen waar de slankheidstoets VOOR STAAT: 7.4.2(2) zegt dat
/// bij een geslaagde slankheidstoets ervan mag zijn uitgegaan dat de
/// doorbuigingen deze grenzen niet overschrijden. Ze worden hier dus
/// meegeleverd zonder zelf te worden getoetst — er is in deze weg geen
/// berekende doorbuiging om ze mee te vergelijken.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct DeflectionLimits {
    /// De overspanning waarop de grenzen betrekking hebben, mm.
    pub span_mm: f64,
    /// 7.4.1(4): overspanning/250, voor het uiterlijk en de algehele
    /// bruikbaarheid. De zakking is bepaald ten opzichte van de opleggingen.
    pub appearance_mm: f64,
    /// 7.4.1(5): overspanning/500, voor doorbuigingen NA DE BOUW die
    /// aansluitende constructiedelen kunnen beschadigen.
    pub damage_mm: f64,
    /// 7.4.1(4): een in de bekisting aangebrachte opbuiging behoort in het
    /// algemeen niet groter te zijn dan overspanning/250.
    pub precamber_max_mm: f64,
    /// De belastingcombinatie waaronder beide grenzen gelden.
    pub combination: String,
}

/// De grenswaarden van 7.4.1(4) en (5) bij een gegeven overspanning.
pub fn deflection_limits(span_mm: f64) -> DeflectionLimits {
    DeflectionLimits {
        span_mm,
        appearance_mm: span_mm / DEFLECTION_DIVISOR_APPEARANCE,
        damage_mm: span_mm / DEFLECTION_DIVISOR_DAMAGE,
        precamber_max_mm: span_mm / PRECAMBER_DIVISOR,
        combination: DEFLECTION_LOAD_COMBINATION.to_string(),
    }
}

// ───────────────────────────────────────────────────────────────────────────
// Verzoek en antwoord
// ───────────────────────────────────────────────────────────────────────────

/// Eén verzoek om de slankheidstoets van 7.4.2.
///
/// `deny_unknown_fields`: een tikfout in `rho_prime` zou anders stilzwijgend
/// 0 opleveren, en dan valt (7.16.b) terug op een doorsnede zonder
/// drukwapening — een lagere en dus verkeerde grenswaarde, zonder enig
/// signaal.
///
/// DE OPTIONELE VELDEN BETEKENEN "NIET OPGEGEVEN", niet "nul". Elk van hen
/// leidt tot een eigen aantekening in het antwoord, zodat een ontbrekend
/// gegeven zichtbaar is in plaats van weggemoffeld.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct SlendernessRequest {
    /// Vrij te kiezen nummer; komt onveranderd terug. 0 als het niet om een
    /// staaf uit een model gaat.
    #[serde(default)]
    pub beam_id: u32,
    /// De regel uit tabel 7.4N. Zie [`StructuralSystem`]: dit is invoer.
    pub system: StructuralSystem,
    /// f_ck in MPa — de norm schrijft dat achter (7.16) letterlijk voor.
    pub f_ck_mpa: f64,
    /// De te toetsen overspanning l, in mm. Bij in twee richtingen dragende
    /// platen de KORTSTE, bij vlakke plaatvloeren de LANGSTE (OPMERKING 2 bij
    /// tabel 7.4N).
    pub span_mm: f64,
    /// De nuttige hoogte d, in mm.
    pub d_mm: f64,
    /// ρ: de VEREISTE wapeningsverhouding van de trekwapening in het midden
    /// van de overspanning (bij uitkragingen ter plaatse van de oplegging)
    /// waarmee het moment ten gevolge van de REKENWAARDE van de belastingen
    /// kan zijn opgenomen. Dimensieloos (0,005 = 0,5 %).
    ///
    /// De norm laat in het midden ten opzichte van welke oppervlakte deze
    /// verhouding is genomen; deze module kiest die oppervlakte daarom NIET
    /// maar neemt ρ als gegeven aan. Wie hem uit A_s,req berekent, hoort erbij
    /// te vermelden welke breedte hij heeft gebruikt.
    pub rho: f64,
    /// ρ': de VEREISTE wapeningsverhouding van de drukwapening op dezelfde
    /// plaats. Dimensieloos. Ontbreekt het veld, dan 0 — geen drukwapening.
    /// Wordt alleen door (7.16.b) gebruikt.
    #[serde(default)]
    pub rho_prime: f64,
    /// σ_s in MPa, indien expliciet bepaald: de trekspanning in het staal in
    /// het midden van de overspanning onder de rekenwaarde van de belasting
    /// in de BGT. Is dit veld gevuld, dan gaat 310/σ_s vóór op (7.17).
    #[serde(default)]
    pub sigma_s_mpa: Option<f64>,
    /// f_yk in MPa, voor de conservatieve aanname (7.17).
    #[serde(default)]
    pub f_yk_mpa: Option<f64>,
    /// A_s,req in mm²: de staaldoorsnede die in de beschouwde doorsnede voor
    /// de UITERSTE grenstoestand is vereist. Voor (7.17).
    #[serde(default)]
    pub a_s_req_mm2: Option<f64>,
    /// A_s,prov in mm²: de staaldoorsnede die in de beschouwde doorsnede
    /// aanwezig is. Voor (7.17).
    #[serde(default)]
    pub a_s_prov_mm2: Option<f64>,
    /// De flensbreedte, mm. Bij een rechthoek gelijk aan `b_web_mm`. Uit
    /// [`crate::ConcreteSection::b_mm`].
    pub b_flange_mm: f64,
    /// De ribbreedte (lijfbreedte), mm. Uit
    /// [`crate::ConcreteSection::b_w_mm`].
    pub b_web_mm: f64,
    /// l_eff volgens 5.3.2.2(1), in mm. `None` = niet opgegeven; dan wordt
    /// `span_mm` gebruikt en zegt het antwoord dat erbij. LET OP: de norm
    /// vult l_eff in de correcties in METERS in; de omrekening gebeurt in
    /// deze module.
    #[serde(default)]
    pub l_eff_mm: Option<f64>,
    /// Draagt dit element scheidingswanden die bij overmatige doorbuiging
    /// kunnen zijn beschadigd? Voorwaarde voor de correcties 7/l_eff en
    /// 8,5/l_eff.
    ///
    /// `None` = niet vastgesteld. Ligt de overspanning boven de drempel, dan
    /// wordt de correctie in dat geval AAN DE VEILIGE KANT tóch toegepast en
    /// staat dat met zoveel woorden in de reden — een niet toegepaste
    /// correctie levert immers een hógere en dus gunstiger grenswaarde op.
    #[serde(default)]
    pub carries_brittle_partitions: Option<bool>,
    /// N_Ed in kN in de beschouwde doorsnede, TREK POSITIEF (de
    /// tekenconventie van deze crate aan de buitengrens). `None` = niet
    /// opgegeven; dan kan de voorwaarde "zonder normaaldruk" van tabel 7.4N
    /// niet worden gecontroleerd en zegt het antwoord dat.
    #[serde(default)]
    pub n_ed_kn: Option<f64>,
}

/// Het antwoord: de hele keten van (7.16) en de correcties, met per stap de
/// vindplaats, plus het oordeel en de grenswaarden waar het voor staat.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub struct SlendernessResponse {
    pub beam_id: u32,
    pub system: StructuralSystem,
    /// De woordelijke tabelregel van tabel 7.4N.
    pub system_label: String,
    /// K uit tabel 7.4N.
    pub k: f64,
    pub f_ck_mpa: f64,
    /// ρ₀ = 10⁻³·√f_ck.
    pub rho_0: f64,
    pub rho: f64,
    pub rho_prime: f64,
    /// Welke tak van (7.16) gold.
    pub equation: SlendernessEquation,
    /// De basiswaarde uit (7.16), inclusief K en vóór de correcties.
    pub base_l_over_d: f64,
    /// De drie correcties, ook die welke NIET zijn toegepast.
    pub corrections: Vec<SlendernessCorrection>,
    /// De grenswaarde van de slankheid: `base_l_over_d` maal alle factoren.
    pub limit_l_over_d: f64,
    /// De werkelijke slankheid l/d.
    pub actual_l_over_d: f64,
    pub span_mm: f64,
    pub d_mm: f64,
    /// (l/d)_werkelijk / (l/d)_grens. Groter dan 1 = te slank.
    pub unity_check: f64,
    pub status: CheckStatus,
    /// De grenswaarden van 7.4.1(4) en (5) waarvoor deze toets in de plaats
    /// komt.
    pub deflection_limits: DeflectionLimits,
    /// Wat er bij deze uitkomst hoort te worden verteld: de aannamen, de
    /// voorwaarden die NIET zijn gecontroleerd, en wat er gebeurt als de
    /// toets niet slaagt.
    pub notes: Vec<String>,
}

// ───────────────────────────────────────────────────────────────────────────
// De rekengang
// ───────────────────────────────────────────────────────────────────────────

/// De slankheidstoets van 7.4.2 — één rekengang voor alle aanroepers.
///
/// `Err` levert een leesbare Nederlandse reden op. Die reden hoort ONVERKORT
/// aan de gebruiker te worden getoond, met [`CheckStatus::NotApplicable`],
/// en er hoort NIET te worden doorgerekend: elk van de foutgevallen is er een
/// waarin de norm geen uitkomst kent, niet een waarin een uitkomst toevallig
/// niet lukt.
pub fn span_depth_limit(req: &SlendernessRequest) -> Result<SlendernessResponse, String> {
    // ── Invoercontrole ────────────────────────────────────────────────────
    let eis = |naam: &str, v: f64| -> Result<(), String> {
        if !v.is_finite() || v <= 0.0 {
            Err(format!("{naam} moet een eindig, positief getal zijn (nu {v})."))
        } else {
            Ok(())
        }
    };
    eis("f_ck", req.f_ck_mpa)?;
    eis("de overspanning l", req.span_mm)?;
    eis("de nuttige hoogte d", req.d_mm)?;
    eis("de flensbreedte", req.b_flange_mm)?;
    eis("de ribbreedte", req.b_web_mm)?;
    if !req.rho.is_finite() || req.rho <= 0.0 {
        return Err(format!(
            "ρ moet een eindig, positief getal zijn (nu {}). ρ = 0 zou betekenen dat er geen \
             trekwapening is vereist; (7.16) deelt door ρ en kent dat geval niet.",
            req.rho
        ));
    }
    if !req.rho_prime.is_finite() || req.rho_prime < 0.0 {
        return Err(format!(
            "ρ' moet een eindig, niet-negatief getal zijn (nu {}).",
            req.rho_prime
        ));
    }
    if req.b_flange_mm < req.b_web_mm {
        return Err(format!(
            "De flensbreedte ({} mm) is kleiner dan de ribbreedte ({} mm). De flenscorrectie van \
             7.4.2(2) gaat over de verhouding flensbreedte/ribbreedte en veronderstelt dat de \
             flens de BREEDSTE band is.",
            nl(req.b_flange_mm, 0),
            nl(req.b_web_mm, 0)
        ));
    }
    if let Some(l_eff) = req.l_eff_mm {
        eis("l_eff", l_eff)?;
    }

    // ── Toepassingsgebied: tabel 7.4N geldt "zonder normaaldruk" ──────────
    let mut notes: Vec<String> = Vec::new();
    match req.n_ed_kn {
        Some(n) if n < -N_ED_ROUNDING_TOLERANCE_KN => {
            return Err(format!(
                "Buiten het toepassingsgebied van 7.4.2: er is normaaldruk (N_Ed = {} kN). Tabel \
                 7.4N draagt de titel \"Basisslankheden voor gewapend betonnen elementen ZONDER \
                 NORMAALDRUK\" en 7.4.2(2) beperkt de regel tot gewapend betonnen balken of \
                 platen in gebouwen. De norm noemt geen drempel waaronder een normaaldruk mag \
                 worden verwaarloosd, dus wordt hier geen drempel aangenomen. De doorbuiging van \
                 dit element hoort langs 7.4.3 te worden gecontroleerd.",
                nl(n, 1)
            ));
        }
        Some(n) if n > N_ED_ROUNDING_TOLERANCE_KN => {
            notes.push(format!(
                "N_Ed = {} kN is TREK. Tabel 7.4N sluit alleen normaaldruk uit; een trekkracht \
                 valt formeel binnen de titel, maar (7.16) is afgeleid voor op buiging belaste \
                 balken en platen en houdt met een normaaltrekkracht geen rekening. Weeg zelf of \
                 deze weg hier past.",
                nl(n, 1)
            ));
        }
        Some(_) => {
            notes.push(
                "N_Ed = 0: het element voldoet aan de voorwaarde \"zonder normaaldruk\" van tabel \
                 7.4N."
                    .to_string(),
            );
        }
        None => {
            notes.push(
                "DE NORMAALKRACHT IS NIET OPGEGEVEN. Tabel 7.4N geldt voor gewapend betonnen \
                 elementen ZONDER NORMAALDRUK; die voorwaarde is dus NIET gecontroleerd. Bij een \
                 element met noemenswaardige normaaldruk — een kolom, een wand, een op druk \
                 belaste ligger — is deze weg niet toegestaan."
                    .to_string(),
            );
        }
    }
    notes.push(
        "7.4.2(2) beperkt deze weg tot gewapend betonnen BALKEN OF PLATEN IN GEBOUWEN. Of het \
         beschouwde element daaraan voldoet, is uit een raamwerkmodel niet vast te stellen en is \
         hier dus niet gecontroleerd. Voorgespannen elementen vallen erbuiten."
            .to_string(),
    );
    notes.push(req.system.span_note().to_string());

    // ── ρ₀ en de takkeuze ─────────────────────────────────────────────────
    let f_ck = req.f_ck_mpa;
    let sqrt_f_ck = f_ck.sqrt();
    let r0 = rho_0(f_ck);
    let k = req.system.k();

    // "als ρ ≤ ρ₀" gaat naar (7.16.a) — inclusief het gelijke geval. Dat is
    // niet vrijblijvend: bij ρ > ρ₀ is (ρ₀/ρ − 1) negatief en levert de macht
    // 3/2 een NaN in plaats van een fout.
    let equation = if req.rho <= r0 {
        SlendernessEquation::Eq716a
    } else {
        SlendernessEquation::Eq716b
    };

    let base = match equation {
        SlendernessEquation::Eq716a => {
            if req.rho_prime > 0.0 {
                notes.push(format!(
                    "ρ' = {} is opgegeven maar komt in (7.16.a) NIET voor: die tak kent geen \
                     drukwapening. Drukwapening telt pas mee zodra ρ > ρ₀ en daarmee (7.16.b) \
                     geldt.",
                    nl(req.rho_prime * 100.0, 3)
                ));
            }
            let verhouding = r0 / req.rho;
            k * (11.0
                + 1.5 * sqrt_f_ck * verhouding
                + 3.2 * sqrt_f_ck * (verhouding - 1.0).powf(1.5))
        }
        SlendernessEquation::Eq716b => {
            if req.rho_prime >= req.rho {
                return Err(format!(
                    "(7.16.b) deelt door ρ − ρ', en hier is ρ' = {} % niet kleiner dan ρ = {} %. \
                     De norm geeft voor dat geval geen ondergrens en dus geen uitkomst; er wordt \
                     hier ook geen ondergrens aangenomen. Controleer de vereiste \
                     wapeningsverhoudingen: ρ' groter dan of gelijk aan ρ betekent dat er meer \
                     drukwapening dan trekwapening vereist zou zijn.",
                    nl(req.rho_prime * 100.0, 3),
                    nl(req.rho * 100.0, 3)
                ));
            }
            k * (11.0
                + 1.5 * sqrt_f_ck * r0 / (req.rho - req.rho_prime)
                + (1.0 / 12.0) * sqrt_f_ck * (req.rho_prime / r0).sqrt())
        }
    };

    // ── Correctie 1: 310/σ_s, tevens de correctie voor meerwapening ───────
    let mut corrections: Vec<SlendernessCorrection> = Vec::new();
    let sigma_correctie = sigma_s_correction(req);
    corrections.push(sigma_correctie);

    // ── Correctie 2: 0,8 bij een brede flens ──────────────────────────────
    corrections.push(flange_correction(req));

    // ── Correctie 3: 7/l_eff of 8,5/l_eff ─────────────────────────────────
    let (l_eff_mm, l_eff_uit_overspanning) = match req.l_eff_mm {
        Some(v) => (v, false),
        None => (req.span_mm, true),
    };
    if l_eff_uit_overspanning {
        notes.push(format!(
            "l_eff volgens 5.3.2.2(1) is niet opgegeven; de te toetsen overspanning l = {} mm is \
             als l_eff aangehouden. (5.8) geeft l_eff = l_n + a₁ + a₂ met a₁ en a₂ uit figuur \
             5.4; die oplegdetails kent dit model niet, dus de werkelijke l_eff kan hiervan \
             afwijken.",
            nl(req.span_mm, 0)
        ));
    }
    corrections.push(long_span_correction(req, l_eff_mm));

    // ── De grenswaarde ────────────────────────────────────────────────────
    // De correcties zijn CUMULATIEF: de norm geeft ze als losse zinnen en
    // sluit ze nergens uit elkaar uit.
    let limit = corrections.iter().fold(base, |acc, c| acc * c.factor);
    let actual = req.span_mm / req.d_mm;
    let unity_check = if limit > 0.0 { actual / limit } else { f64::INFINITY };
    let status = if unity_check <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };

    let limits = deflection_limits(req.span_mm);
    if status == CheckStatus::Ok {
        notes.push(format!(
            "7.4.2(2): omdat aan de grens van de slankheid is voldaan, mag ervan zijn uitgegaan \
             dat de doorbuigingen de in 7.4.1(4) en (5) gestelde grenzen niet overschrijden — \
             overspanning/250 = {} mm en overspanning/500 = {} mm, beide onder de \
             QUASI-BLIJVENDE belastingcombinatie. Er is in deze weg géén doorbuiging berekend; \
             deze getallen zijn de grenzen waarvoor de toets in de plaats komt.",
            nl(limits.appearance_mm, 1),
            nl(limits.damage_mm, 1)
        ));
    } else {
        notes.push(
            "7.4.2(1)P: een element dat buiten deze grenzen ligt is hiermee NIET afgekeurd — de \
             norm zegt dat er dan \"zorgvuldigere controles\" nodig zijn. De vervolgstap is een \
             doorbuigingsberekening volgens 7.4.3, en die is in deze versie niet beschikbaar."
                .to_string(),
        );
    }
    notes.push(format!(
        "De grenzen van 7.4.1(4) en (5) zijn niet getoetst maar meegeleverd: overspanning/250 = \
         {} mm (uiterlijk en algehele bruikbaarheid, zakking ten opzichte van de opleggingen) en \
         overspanning/500 = {} mm (doorbuiging NA DE BOUW, tegen schade aan aansluitende delen), \
         beide onder de quasi-blijvende belastingcombinatie. Een in de bekisting aangebrachte \
         opbuiging behoort in het algemeen niet groter te zijn dan overspanning/250 = {} mm; bij \
         de afleiding van (7.16) is met een zeeg geen rekening gehouden.",
        nl(limits.appearance_mm, 1),
        nl(limits.damage_mm, 1),
        nl(limits.precamber_max_mm, 1)
    ));
    notes.push(
        "EN 1992-1-1 §7.4.1 geeft overspanning/250 en overspanning/500 als \"in het algemeen \
         geschikte\" grenzen en verwijst voor verdere informatie naar ISO 4356. Of daarmee alle \
         in Nederland langs NEN-EN 1990/NB en het Bouwbesluit geldende eisen zijn gedekt, is hier \
         niet nagegaan."
            .to_string(),
    );
    notes.push(
        "ρ en ρ' zijn de VEREISTE wapeningsverhoudingen om het moment uit de rekenwaarde van de \
         belastingen op te nemen, niet de geplaatste wapening. De meerwapening zit in de \
         correctie 310/σ_s via A_s,req/A_s,prov; wie haar ook in ρ verwerkt, telt haar dubbel."
            .to_string(),
    );

    Ok(SlendernessResponse {
        beam_id: req.beam_id,
        system: req.system,
        system_label: req.system.label().to_string(),
        k,
        f_ck_mpa: f_ck,
        rho_0: r0,
        rho: req.rho,
        rho_prime: req.rho_prime,
        equation,
        base_l_over_d: base,
        corrections,
        limit_l_over_d: limit,
        actual_l_over_d: actual,
        span_mm: req.span_mm,
        d_mm: req.d_mm,
        unity_check,
        status,
        deflection_limits: limits,
        notes,
    })
}

/// Correctie 1 — 310/σ_s (7.4.2(2)), met (7.17) als conservatieve aanname.
///
/// Drie gevallen, in deze volgorde:
///
/// 1. σ_s is expliciet bepaald → 310/σ_s rechtstreeks. De norm noemt dit als
///    hoofdregel: "Indien andere spanningsniveaus zijn gebruikt, behoren de
///    waarden verkregen uit vergelijking (7.16) te zijn vermenigvuldigd met
///    310/σ_s."
/// 2. f_yk, A_s,req en A_s,prov zijn bekend → (7.17), de conservatieve
///    aanname. Dit is TEVENS de correctie voor een doorsnede die zwaarder is
///    gewapend dan strikt nodig: A_s,req/A_s,prov < 1 verhoogt de factor.
/// 3. Geen van beide → factor 1,0. Dat is niet "geen correctie" maar de
///    aanname dat σ_s precies gelijk is aan de 310 MPa waaronder (7.16) is
///    afgeleid; de reden zegt dat met zoveel woorden.
///
/// De norm zet op deze factor GEEN bovengrens, en er wordt er hier ook geen
/// verzonnen. Wel volgt een aantekening zodra hij ruim boven 1 uitkomt: dan
/// leunt de hele toets op de meerwapening.
fn sigma_s_correction(req: &SlendernessRequest) -> SlendernessCorrection {
    let maak = |factor: f64, applied: bool, filled_latex: String, reason: String| {
        SlendernessCorrection {
            id: "sigma_s".to_string(),
            label: "Staalspanning 310/σ_s".to_string(),
            article: "art. 7.4.2(2), (7.17)".to_string(),
            factor,
            applied,
            filled_latex,
            reason,
        }
    };

    if let Some(sigma) = req.sigma_s_mpa {
        if sigma.is_finite() && sigma > 0.0 {
            let f = REFERENCE_STEEL_STRESS_MPA / sigma;
            let mut reden = format!(
                "σ_s = {} N/mm² is expliciet opgegeven; 310/σ_s = 310/{} = {}. (7.16) is afgeleid \
                 onder σ_s = 310 MPa, dus bij een andere staalspanning schrijft 7.4.2(2) deze \
                 vermenigvuldiging voor. De opgegeven σ_s gaat vóór op de conservatieve aanname \
                 (7.17).",
                nl(sigma, 1),
                nl(sigma, 1),
                nl(f, 3)
            );
            if f > 1.5 {
                reden.push_str(
                    " LET OP: deze factor is groter dan 1,5. De norm zet er geen bovengrens op, \
                     maar de grenswaarde van de slankheid leunt daarmee zwaar op één ingevoerde \
                     spanning.",
                );
            }
            return maak(
                f,
                true,
                format!(
                    r"\frac{{310}}{{\sigma_s}} = \frac{{310}}{{{s}}} = {f}",
                    s = lx(sigma, 1),
                    f = lx(f, 4)
                ),
                reden,
            );
        }
        return maak(
            1.0,
            false,
            r"\frac{310}{\sigma_s} = 1{,}0000".to_string(),
            format!(
                "σ_s = {sigma} is geen bruikbare spanning; de factor is niet toegepast en (7.16) \
                 geldt onverkort onder haar eigen aanname σ_s = 310 MPa."
            ),
        );
    }

    match (req.f_yk_mpa, req.a_s_req_mm2, req.a_s_prov_mm2) {
        (Some(f_yk), Some(a_req), Some(a_prov))
            if f_yk.is_finite()
                && f_yk > 0.0
                && a_req.is_finite()
                && a_req > 0.0
                && a_prov.is_finite()
                && a_prov > 0.0 =>
        {
            let f = EQ_7_17_NUMERATOR_MPA / (f_yk * a_req / a_prov);
            let mut reden = format!(
                "(7.17), de conservatieve aanname: 310/σ_s = 500/(f_yk · A_s,req/A_s,prov) = \
                 500/({} · {}/{}) = {}. Dit is tevens de correctie voor een doorsnede die \
                 zwaarder is gewapend dan strikt nodig — A_s,req/A_s,prov = {} verhoogt de \
                 grenswaarde.",
                nl(f_yk, 0),
                nl(a_req, 0),
                nl(a_prov, 0),
                nl(f, 3),
                nl(a_req / a_prov, 3)
            );
            if f > 1.5 {
                reden.push_str(
                    " LET OP: deze factor is groter dan 1,5. De norm zet er geen bovengrens op, \
                     maar de grenswaarde leunt daarmee zwaar op de meerwapening.",
                );
            }
            maak(
                f,
                true,
                format!(
                    r"\frac{{310}}{{\sigma_s}} = \frac{{500}}{{{fyk} \cdot {areq}/{aprov}}} = {f}",
                    fyk = lx(f_yk, 0),
                    areq = lx(a_req, 0),
                    aprov = lx(a_prov, 0),
                    f = lx(f, 4)
                ),
                reden,
            )
        }
        _ => maak(
            1.0,
            false,
            r"\frac{310}{\sigma_s} = 1{,}0000".to_string(),
            "Noch σ_s, noch de drie gegevens van (7.17) (f_yk, A_s,req en A_s,prov) zijn \
             opgegeven. De factor is dus 1,0 — dat is GEEN weglating maar de aanname dat de \
             staalspanning gelijk is aan de 310 MPa waaronder (7.16.a) en (7.16.b) zijn afgeleid \
             (ruwweg f_yk = 500 MPa). Wijkt de werkelijke staalspanning daarvan af, of is er \
             meer wapening geplaatst dan vereist, dan hoort deze factor te worden ingevuld."
                .to_string(),
        ),
    }
}

/// Correctie 2 — de factor 0,8 bij een T-ligger met een brede flens.
///
/// 7.4.2(2), woordelijk: "Voor doorsneden met flenzen waarin de verhouding
/// van de flensbreedte tot de ribbreedte groter is dan 3, behoren de waarden
/// van l/d gegeven door vergelijking (7.16) met 0,8 te zijn vermenigvuldigd."
///
/// Twee dingen die daarin makkelijk misgaan: de drempel is STRIKT groter dan
/// 3 (bij precies 3 geldt hij niet), en de factor is een reductie — hij maakt
/// de grenswaarde kleiner en de toets dus strenger.
fn flange_correction(req: &SlendernessRequest) -> SlendernessCorrection {
    let verhouding = req.b_flange_mm / req.b_web_mm;
    let maak = |factor: f64, applied: bool, filled_latex: String, reason: String| {
        SlendernessCorrection {
            id: "flens".to_string(),
            label: "Brede flens (0,8)".to_string(),
            article: "art. 7.4.2(2)".to_string(),
            factor,
            applied,
            filled_latex,
            reason,
        }
    };
    let ingevuld = format!(
        r"\frac{{b_{{flens}}}}{{b_{{rib}}}} = \frac{{{bf}}}{{{bw}}} = {v} \;{teken}\; 3 \;\Rightarrow\; k_{{flens}} = {f}",
        bf = lx(req.b_flange_mm, 0),
        bw = lx(req.b_web_mm, 0),
        v = lx(verhouding, 2),
        teken = if verhouding > FLANGE_RATIO_THRESHOLD { ">" } else { r"\le" },
        f = lx(
            if verhouding > FLANGE_RATIO_THRESHOLD { FLANGE_CORRECTION_FACTOR } else { 1.0 },
            4
        )
    );
    if verhouding > FLANGE_RATIO_THRESHOLD {
        maak(
            FLANGE_CORRECTION_FACTOR,
            true,
            ingevuld,
            format!(
                "b_flens/b_rib = {}/{} = {} is groter dan 3, dus de waarden van l/d uit (7.16) \
                 zijn met 0,8 vermenigvuldigd.",
                nl(req.b_flange_mm, 0),
                nl(req.b_web_mm, 0),
                nl(verhouding, 2)
            ),
        )
    } else {
        maak(
            1.0,
            false,
            ingevuld,
            format!(
                "b_flens/b_rib = {}/{} = {} is niet groter dan 3; de factor 0,8 van 7.4.2(2) \
                 geldt hier niet.{}",
                nl(req.b_flange_mm, 0),
                nl(req.b_web_mm, 0),
                nl(verhouding, 2),
                if (verhouding - 1.0).abs() < 1e-12 {
                    " De doorsnede heeft geen bredere flens dan rib."
                } else {
                    ""
                }
            ),
        )
    }
}

/// Correctie 3 — 7/l_eff voor balken en platen, 8,5/l_eff voor vlakke
/// plaatvloeren.
///
/// 7.4.2(2), woordelijk voor de eerste: "Voor balken en platen, andere dan
/// vlakke plaatvloeren, met overspanningen groter dan 7 m die
/// scheidingswanden dragen die bij overmatige doorbuiging kunnen zijn
/// beschadigd, behoren de in vergelijking (7.16) gegeven waarden l/d te zijn
/// vermenigvuldigd met 7/l_eff (l_eff in meters, zie 5.3.2.2(1))." En voor de
/// tweede: "Voor vlakke plaatvloeren waarvan de grootste overspanning groter
/// is dan 8,5 m en waarbij de kans groot is dat hierop dragende
/// scheidingswanden worden beschadigd bij overmatige doorbuiging, behoren de
/// door vergelijking (7.16) gegeven waarden van l/d te zijn vermenigvuldigd
/// met 8,5/l_eff (l_eff in meters)."
///
/// Drie voorwaarden, alle drie noodzakelijk:
///
/// 1. het juiste type — de 7 m-regel geldt voor balken en platen die GEEN
///    vlakke plaatvloer zijn, de 8,5 m-regel uitsluitend voor vlakke
///    plaatvloeren. Ze sluiten elkaar uit;
/// 2. de overspanning boven de drempel. Blijft hij eronder, dan wordt er
///    NIETS toegepast: 7/l_eff zou bij 5 m de factor 1,4 opleveren en de
///    grenswaarde dus verhogen, en zo'n bonus staat er niet;
/// 3. het element draagt scheidingswanden die bij overmatige doorbuiging
///    kunnen worden beschadigd.
///
/// DE DREMPEL WORDT OP l_eff GEËVALUEERD. De norm schrijft de voorwaarde als
/// "overspanningen groter dan 7 m" en de factor als 7/l_eff; dat is dezelfde
/// overspanning in twee bewoordingen. Door beide op l_eff te betrekken is de
/// factor precies 1,0 op de drempel en loopt hij daaronder niet weg.
fn long_span_correction(req: &SlendernessRequest, l_eff_mm: f64) -> SlendernessCorrection {
    let vlak = req.system.is_flat_slab();
    let corr = LongSpanCorrection {
        threshold_m: if vlak {
            LONG_SPAN_FLAT_SLAB_THRESHOLD_M
        } else {
            LONG_SPAN_BEAM_THRESHOLD_M
        },
        // DE EENHEDENVAL: van mm naar METERS, want zo schrijft de norm de
        // factor voor.
        l_eff_m: l_eff_mm / 1000.0,
    };
    let (id, label) = if vlak {
        ("lange_overspanning", "Lange overspanning vlakke plaatvloer (8,5/l_eff)")
    } else {
        ("lange_overspanning", "Lange overspanning (7/l_eff)")
    };
    let maak = |factor: f64, applied: bool, filled_latex: String, reason: String| {
        SlendernessCorrection {
            id: id.to_string(),
            label: label.to_string(),
            article: "art. 7.4.2(2)".to_string(),
            factor,
            applied,
            filled_latex,
            reason,
        }
    };
    // De ingevulde regel toont de drempelvergelijking én de factor, allebei
    // in METERS — dat is de enige plek waar de lezer de eenhedenval kan zien.
    let ingevuld = |factor: f64| {
        format!(
            r"l_{{eff}} = {le}\ \text{{m}} \;{teken}\; {t}\ \text{{m}} \;\Rightarrow\; k_{{overspanning}} = {f}",
            le = lx(corr.l_eff_m, 3),
            teken = if corr.applies() { ">" } else { r"\le" },
            t = lx(corr.threshold_m, 1),
            f = lx(factor, 4)
        )
    };

    if !corr.applies() {
        return maak(
            1.0,
            false,
            ingevuld(1.0),
            format!(
                "l_eff = {} m is niet groter dan de drempel van {} m die 7.4.2(2) voor {} stelt; \
                 de correctie geldt niet. Zij wordt ook niet als bonus toegepast — {}/l_eff zou \
                 hier {} opleveren en de grenswaarde dus verhogen, en dat staat er niet.",
                nl(corr.l_eff_m, 3),
                nl(corr.threshold_m, 1),
                if vlak { "vlakke plaatvloeren" } else { "balken en platen" },
                nl(corr.threshold_m, 1),
                nl(corr.factor(), 3)
            ),
        );
    }

    let f = corr.factor();
    match req.carries_brittle_partitions {
        Some(true) => maak(
            f,
            true,
            ingevuld(f),
            format!(
                "l_eff = {} m is groter dan {} m en het element draagt scheidingswanden die bij \
                 overmatige doorbuiging kunnen zijn beschadigd; {}/l_eff = {}/{} = {}. l_eff is \
                 hier in METERS ingevuld, zoals 7.4.2(2) uitdrukkelijk voorschrijft.",
                nl(corr.l_eff_m, 3),
                nl(corr.threshold_m, 1),
                nl(corr.threshold_m, 1),
                nl(corr.threshold_m, 1),
                nl(corr.l_eff_m, 3),
                nl(f, 4)
            ),
        ),
        Some(false) => maak(
            1.0,
            false,
            ingevuld(1.0),
            format!(
                "l_eff = {} m is weliswaar groter dan {} m, maar het element draagt geen \
                 scheidingswanden die bij overmatige doorbuiging kunnen zijn beschadigd. Beide \
                 voorwaarden van 7.4.2(2) zijn noodzakelijk, dus de correctie geldt niet.",
                nl(corr.l_eff_m, 3),
                nl(corr.threshold_m, 1)
            ),
        ),
        None => maak(
            f,
            true,
            ingevuld(f),
            format!(
                "l_eff = {} m is groter dan {} m, maar er is NIET opgegeven of dit element \
                 scheidingswanden draagt die bij overmatige doorbuiging kunnen zijn beschadigd. \
                 Die voorwaarde is dus niet vastgesteld. De correctie {}/l_eff = {} is aan de \
                 VEILIGE KANT tóch toegepast: haar weglaten zou een hogere en dus gunstiger \
                 grenswaarde opleveren. Geef op dat het element zulke wanden niet draagt om deze \
                 correctie te laten vervallen.",
                nl(corr.l_eff_m, 3),
                nl(corr.threshold_m, 1),
                nl(corr.threshold_m, 1),
                nl(f, 4)
            ),
        ),
    }
}

// ───────────────────────────────────────────────────────────────────────────
// De toets als ResistanceCalc — met uitgeschreven afleiding
// ───────────────────────────────────────────────────────────────────────────

/// De slankheidstoets in het contract van de overige toetsen: formule,
/// variabelen, unity check, status en een uitgeschreven afleiding.
///
/// `force_state` draagt hier geen krachten — 7.4.2 is geen krachtentoets maar
/// een geometrische regel. Het veld hoort bij [`ResistanceCalc`] en wordt
/// gevuld met de plaats waarop de toets is uitgevoerd, zodat het rapport de
/// toets bij de juiste doorsnede kan zetten.
///
/// Weigert de rekengang, dan komt er GEEN getal maar een
/// [`CheckStatus::NotApplicable`] met de reden onverkort in `notes` — precies
/// zoals de buigtoets doet als er geen evenwicht mogelijk is.
pub fn check_span_depth_ratio(
    req: &SlendernessRequest,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let id = "7.4.2_slankheid".to_string();
    let title = "Doorbuiging — grenswaarde van de slankheid l/d".to_string();
    let article = "art. 7.4.2(2) (7.16), tabel 7.4N".to_string();

    let r = match span_depth_limit(req) {
        Ok(r) => r,
        Err(reden) => {
            return ResistanceCalc {
                id,
                title,
                article,
                force_state,
                formula_latex: SlendernessEquation::Eq716a.formula_latex().to_string(),
                variables: vec![
                    nv("f_{ck}", req.f_ck_mpa, "N/mm²"),
                    nv("l", req.span_mm, "mm"),
                    nv("d", req.d_mm, "mm"),
                    nv(r"\rho", req.rho, "-"),
                    nv(r"\rho'", req.rho_prime, "-"),
                ],
                deelstappen: vec![stap(
                    "afgebroken",
                    "De slankheidstoets kon niet worden uitgevoerd",
                    "",
                    "art. 7.4.2",
                    String::new(),
                    String::new(),
                    Vec::new(),
                    None,
                    "",
                    vec![reden.clone()],
                )],
                value: 0.0,
                unit: "-".to_string(),
                uc: None,
                status: CheckStatus::NotApplicable,
                notes: vec![reden],
            };
        }
    };

    let mut variables = vec![
        nv("K", r.k, "-"),
        nv("f_{ck}", r.f_ck_mpa, "N/mm²"),
        nv(r"\rho_0", r.rho_0, "-"),
        nv(r"\rho", r.rho, "-"),
        nv(r"\rho'", r.rho_prime, "-"),
        nv("l", r.span_mm, "mm"),
        nv("d", r.d_mm, "mm"),
        nv(r"(l/d)_{(7.16)}", r.base_l_over_d, "-"),
    ];
    for c in &r.corrections {
        variables.push(nv(&correctie_symbool(&c.id), c.factor, "-"));
    }
    variables.push(nv(r"(l/d)_{grens}", r.limit_l_over_d, "-"));
    variables.push(nv(r"(l/d)_{werkelijk}", r.actual_l_over_d, "-"));

    ResistanceCalc {
        id,
        title,
        article,
        force_state,
        formula_latex: r.equation.formula_latex().to_string(),
        variables,
        deelstappen: slankheid_deelstappen(&r),
        value: r.limit_l_over_d,
        unit: "-".to_string(),
        uc: Some(UnityCheck {
            ed: r.actual_l_over_d,
            rd: r.limit_l_over_d,
            uc: r.unity_check,
            formula_latex: r"(l/d)_{werkelijk} / (l/d)_{grens}".to_string(),
        }),
        status: r.status,
        notes: r.notes.clone(),
    }
}

fn correctie_symbool(id: &str) -> String {
    match id {
        "sigma_s" => r"310/\sigma_s".to_string(),
        "flens" => r"k_{flens}".to_string(),
        _ => r"k_{overspanning}".to_string(),
    }
}

/// De afleiding uitgeschreven. Deze functie REKENT NIETS OPNIEUW UIT: alles
/// komt uit de [`SlendernessResponse`] die [`span_depth_limit`] al heeft
/// opgeleverd. Wat hier wél gebeurt, is het opschrijven van de tussenstappen
/// van (7.16) — √f_ck, ρ₀/ρ — als getallen, en dat is een herschrijving van
/// invoer die de lezer anders zelf zou moeten uitrekenen om de ingevulde
/// formule te kunnen volgen.
fn slankheid_deelstappen(r: &SlendernessResponse) -> Vec<Deelstap> {
    let mut uit: Vec<Deelstap> = Vec::new();
    let sqrt_f_ck = r.f_ck_mpa.sqrt();

    // 1 ── Het toepassingsgebied.
    uit.push(stap(
        "toepassingsgebied",
        "Toepassingsgebied van 7.4.2",
        "",
        "art. 7.4.2(1)P en (2), tabel 7.4N",
        String::new(),
        String::new(),
        Vec::new(),
        None,
        "",
        vec![
            "7.4.1(6) laat twee wegen toe: begrenzing van de slankheid, of een volgens 7.4.3 \
             berekende doorbuiging vergelijken met een grenswaarde. Dit is de EERSTE weg."
                .to_string(),
            "7.4.2(2): \"Indien gewapend betonnen balken of platen in gebouwen zo zijn \
             gedimensioneerd dat ze voldoen aan de in deze paragraaf gegeven grenzen van de \
             slankheid, mag ervan zijn uitgegaan dat hun doorbuigingen de in 7.4.1(4) en (5) \
             gestelde grenzen niet overschrijden.\""
                .to_string(),
            "Tabel 7.4N draagt de titel \"Basisslankheden voor gewapend betonnen elementen ZONDER \
             NORMAALDRUK\"."
                .to_string(),
            "7.4.2(1)P: \"Zorgvuldigere controles zijn nodig voor elementen die buiten deze \
             grenzen liggen.\" Niet voldoen is dus geen afkeuring maar een doorverwijzing naar \
             7.4.3."
                .to_string(),
        ],
    ));

    // 2 ── ρ₀.
    uit.push(stap(
        "rho_0",
        "Referentiewaarde van de wapeningsverhouding",
        r"\rho_0",
        "art. 7.4.2(2)",
        r"\rho_0 = 10^{-3}\sqrt{f_{ck}}".to_string(),
        format!(
            r"\rho_0 = 10^{{-3}} \cdot \sqrt{{{fck}}} = {r0}",
            fck = lx(r.f_ck_mpa, 0),
            r0 = lx(r.rho_0, 6)
        ),
        vec![nv("f_{ck}", r.f_ck_mpa, "N/mm²"), nv(r"\sqrt{f_{ck}}", sqrt_f_ck, "-")],
        Some(r.rho_0),
        "-",
        vec![
            format!(
                "ρ₀ = {} = {} %. De norm schrijft achter de definitielijst van (7.16) letterlijk \
                 \"f_ck in MPa\"; getalmatig is dat gelijk aan N/mm², maar f_ck in een andere \
                 eenheid laat √f_ck en daarmee ρ₀ volledig verlopen.",
                nl(r.rho_0, 6),
                nl(r.rho_0 * 100.0, 4)
            ),
            "Deze definitieregel is uit de tekstlaag van de PDF-uitgave gelezen: op de gerenderde \
             bladzijden wordt zij door de eronder liggende regel overdrukt. Zij is numeriek \
             nagerekend tegen de norm zelf — met ρ₀ = 10⁻³√f_ck reproduceert (7.16) de getallen \
             van tabel 7.4N."
                .to_string(),
        ],
    ));

    // 3 ── De takkeuze.
    uit.push(stap(
        "takkeuze",
        "Keuze tussen (7.16.a) en (7.16.b)",
        "",
        "art. 7.4.2(2)",
        r"\rho \le \rho_0 \;\Rightarrow\; (7.16.a); \qquad \rho > \rho_0 \;\Rightarrow\; (7.16.b)"
            .to_string(),
        format!(
            r"\rho = {rho} \;{teken}\; \rho_0 = {r0} \;\Rightarrow\; \text{{{nr}}}",
            rho = lx(r.rho, 6),
            teken = match r.equation {
                SlendernessEquation::Eq716a => r"\le",
                SlendernessEquation::Eq716b => ">",
            },
            r0 = lx(r.rho_0, 6),
            nr = r.equation.number()
        ),
        vec![nv(r"\rho", r.rho, "-"), nv(r"\rho_0", r.rho_0, "-")],
        None,
        "",
        vec![
            format!(
                "ρ = {} % tegen ρ₀ = {} % → {}.",
                nl(r.rho * 100.0, 3),
                nl(r.rho_0 * 100.0, 4),
                r.equation.number()
            ),
            "De twee takken zijn niet uitwisselbaar: in (7.16.a) staat (ρ₀/ρ − 1)^{3/2}, en zodra \
             ρ groter is dan ρ₀ is die basis negatief. Het gelijke geval ρ = ρ₀ gaat naar \
             (7.16.a), want daar staat \"als ρ ≤ ρ₀\"."
                .to_string(),
            "ρ en ρ' zijn de VEREISTE wapeningsverhoudingen om het moment uit de rekenwaarde van \
             de belastingen op te nemen — niet de geplaatste wapening."
                .to_string(),
        ],
    ));

    // 4 ── K uit tabel 7.4N.
    uit.push(stap(
        "k_tabel_7_4n",
        "Factor voor het constructieve systeem",
        "K",
        "tabel 7.4N (NB bij 7.4.2(2))",
        "K = \\text{tabel 7.4N}".to_string(),
        format!(r"K = {}", lx(r.k, 1)),
        vec![nv("K", r.k, "-")],
        Some(r.k),
        "-",
        vec![
            format!("Gekozen regel: \"{}\" → K = {}.", r.system_label, nl(r.k, 1)),
            "De Nederlandse bijlage haalt de aanbevolen OPMERKING met tabel 7.4N door en bepaalt: \
             \"De waarde van K moet aan tabel 7.4N zijn ontleend, welke tabel als normatief moet \
             zijn gelezen.\" De getallen zijn dezelfde; de status is dat niet — K is dus geen \
             instelbare parameter."
                .to_string(),
            format!(
                "De kolommen \"beton onder hoge spanning\" ({} bij ρ = 1,5 %) en \"beton onder \
                 lage spanning\" ({} bij ρ = 0,5 %) zijn ORIËNTATIE en geen invoer: het zijn \
                 uitkomsten van (7.16) voor C30/37 bij die twee wapeningsverhoudingen. De \
                 rekengang gebruikt K plus (7.16).",
                nl(r.system.info().basic_high_stress, 0),
                nl(r.system.info().basic_low_stress, 0)
            ),
            "De keuze van het constructieve systeem is invoer en volgt niet betrouwbaar uit een \
             raamwerkmodel: tussen K = 1,0 en K = 1,5 zit 50 % verschil."
                .to_string(),
            r.system.span_note().to_string(),
        ],
    ));

    // 5 ── De basiswaarde uit (7.16).
    let (ingevuld, vars, extra) = match r.equation {
        SlendernessEquation::Eq716a => {
            let verhouding = r.rho_0 / r.rho;
            (
                format!(
                    r"\frac{{l}}{{d}} = {k}\left[11 + 1{{,}}5 \cdot {s} \cdot {v} + 3{{,}}2 \cdot {s} \cdot \left({v}-1\right)^{{3/2}}\right] = {b}",
                    k = lx(r.k, 1),
                    s = lx(sqrt_f_ck, 4),
                    v = lx(verhouding, 4),
                    b = lx(r.base_l_over_d, 3)
                ),
                vec![
                    nv("K", r.k, "-"),
                    nv(r"\sqrt{f_{ck}}", sqrt_f_ck, "-"),
                    nv(r"\rho_0/\rho", verhouding, "-"),
                ],
                vec![format!(
                    "ρ₀/ρ = {}/{} = {}; de derde term (ρ₀/ρ − 1)^{{3/2}} = {} verdwijnt naarmate ρ \
                     dichter bij ρ₀ komt en is nul bij ρ = ρ₀.",
                    nl(r.rho_0, 6),
                    nl(r.rho, 6),
                    nl(verhouding, 4),
                    nl((verhouding - 1.0).powf(1.5), 5)
                )],
            )
        }
        SlendernessEquation::Eq716b => {
            let noemer = r.rho - r.rho_prime;
            (
                format!(
                    r"\frac{{l}}{{d}} = {k}\left[11 + 1{{,}}5 \cdot {s} \cdot \frac{{{r0}}}{{{n}}} + \frac{{1}}{{12}} \cdot {s} \cdot \sqrt{{\frac{{{rp}}}{{{r0}}}}}\right] = {b}",
                    k = lx(r.k, 1),
                    s = lx(sqrt_f_ck, 4),
                    r0 = lx(r.rho_0, 6),
                    n = lx(noemer, 6),
                    rp = lx(r.rho_prime, 6),
                    b = lx(r.base_l_over_d, 3)
                ),
                vec![
                    nv("K", r.k, "-"),
                    nv(r"\sqrt{f_{ck}}", sqrt_f_ck, "-"),
                    nv(r"\rho-\rho'", noemer, "-"),
                ],
                vec![format!(
                    "ρ − ρ' = {} − {} = {}. Naarmate ρ' dichter bij ρ komt, explodeert de tweede \
                     term; de norm geeft daar geen ondergrens, dus wordt zo'n geval geweigerd in \
                     plaats van afgetopt.",
                    nl(r.rho, 6),
                    nl(r.rho_prime, 6),
                    nl(noemer, 6)
                )],
            )
        }
    };
    let mut notes_716 = vec![format!(
        "De basiswaarde uit {} is {}. Dit is de waarde vóór de correcties.",
        r.equation.number(),
        nl(r.base_l_over_d, 3)
    )];
    notes_716.extend(extra);
    notes_716.push(
        "De OPMERKING bij (7.16) meldt waar deze vergelijkingen vandaan komen: een parametrische \
         studie voor een reeks VRIJ OPGELEGDE balken en platen met RECHTHOEKIGE dwarsdoorsneden, \
         met de algemene benadering van 7.4.3, f_yk = 500 MPa, en een quasi-blijvende belasting \
         die is aangenomen op 50 % van de bijbehorende totale rekenwaarde van de belasting."
            .to_string(),
    );
    uit.push(stap(
        "basis_l_d",
        "Basiswaarde van de slankheid",
        r"(l/d)_{(7.16)}",
        &format!("art. 7.4.2(2) {}", r.equation.number()),
        r.equation.formula_latex().to_string(),
        ingevuld,
        vars,
        Some(r.base_l_over_d),
        "-",
        notes_716,
    ));

    // 6 ── De drie correcties, elk als eigen stap — ook als ze niet gelden.
    for c in &r.corrections {
        let formule = if c.id == "sigma_s" {
            r"\frac{310}{\sigma_s} = \frac{500}{f_{yk}\,A_{s,req}/A_{s,prov}}".to_string()
        } else if c.id == "flens" {
            r"k_{flens} = 0{,}8 \quad \text{indien } b_{flens}/b_{rib} > 3".to_string()
        } else {
            r"k_{overspanning} = \frac{7}{l_{eff}} \text{ resp. } \frac{8{,}5}{l_{eff}} \quad (l_{eff} \text{ in meters})"
                .to_string()
        };
        uit.push(stap(
            &format!("correctie_{}", c.id),
            &format!("Correctie — {}", c.label),
            &correctie_symbool(&c.id),
            &c.article,
            formule,
            c.filled_latex.clone(),
            vec![nv(&correctie_symbool(&c.id), c.factor, "-")],
            Some(c.factor),
            "-",
            vec![
                c.reason.clone(),
                if c.applied {
                    "TOEGEPAST.".to_string()
                } else {
                    "NIET toegepast; de factor is 1,0.".to_string()
                },
            ],
        ));
    }

    // 7 ── De grenswaarde.
    let factoren: Vec<String> = r.corrections.iter().map(|c| lx(c.factor, 4)).collect();
    uit.push(stap(
        "grenswaarde",
        "Grenswaarde van de slankheid",
        r"(l/d)_{grens}",
        "art. 7.4.2(2)",
        r"(l/d)_{grens} = (l/d)_{(7.16)} \cdot \frac{310}{\sigma_s} \cdot k_{flens} \cdot k_{overspanning}"
            .to_string(),
        format!(
            r"(l/d)_{{grens}} = {b} \cdot {f} = {g}",
            b = lx(r.base_l_over_d, 3),
            f = factoren.join(r" \cdot "),
            g = lx(r.limit_l_over_d, 3)
        ),
        vec![
            nv(r"(l/d)_{(7.16)}", r.base_l_over_d, "-"),
            nv(r"(l/d)_{grens}", r.limit_l_over_d, "-"),
        ],
        Some(r.limit_l_over_d),
        "-",
        vec![
            "De correcties zijn CUMULATIEF. De norm geeft ze als afzonderlijke zinnen \
             (\"behoren de waarden … te zijn vermenigvuldigd met …\") en sluit ze nergens \
             onderling uit; 310/σ_s, 0,8 en 7/l_eff kunnen dus tegelijk gelden."
                .to_string(),
        ],
    ));

    // 8 ── De unity check.
    uit.push(stap(
        "unity_check",
        "Toetsing van de slankheid",
        "UC",
        "art. 7.4.2(2)",
        r"UC = \frac{(l/d)_{werkelijk}}{(l/d)_{grens}} = \frac{l/d}{(l/d)_{grens}} \le 1".to_string(),
        format!(
            r"UC = \frac{{{l}/{d}}}{{{g}}} = \frac{{{a}}}{{{g}}} = {uc}",
            l = lx(r.span_mm, 0),
            d = lx(r.d_mm, 0),
            a = lx(r.actual_l_over_d, 3),
            g = lx(r.limit_l_over_d, 3),
            uc = lx(r.unity_check, 3)
        ),
        vec![
            nv("l", r.span_mm, "mm"),
            nv("d", r.d_mm, "mm"),
            nv(r"(l/d)_{werkelijk}", r.actual_l_over_d, "-"),
            nv(r"(l/d)_{grens}", r.limit_l_over_d, "-"),
        ],
        Some(r.unity_check),
        "-",
        vec![match r.status {
            CheckStatus::Ok =>
                "De werkelijke slankheid blijft binnen de grenswaarde; volgens 7.4.2(2) mag ervan \
                 zijn uitgegaan dat de doorbuigingen de grenzen van 7.4.1(4) en (5) niet \
                 overschrijden."
                    .to_string(),
            _ =>
                "De werkelijke slankheid overschrijdt de grenswaarde. 7.4.2(1)P: dat is geen \
                 afkeuring, maar er zijn dan zorgvuldigere controles nodig — een \
                 doorbuigingsberekening volgens 7.4.3."
                    .to_string(),
        }],
    ));

    // 9 ── De grenswaarden waar dit alles voor staat.
    let g = &r.deflection_limits;
    uit.push(stap(
        "doorbuigingsgrenzen",
        "Grenswaarden van de doorbuiging waarvoor deze toets in de plaats komt",
        r"w_{grens}",
        "art. 7.4.1(4) en (5)",
        r"w_{grens} = \frac{l}{250} \quad\text{(7.4.1(4))}, \qquad w_{grens} = \frac{l}{500} \quad\text{(7.4.1(5))}"
            .to_string(),
        format!(
            r"\frac{{{l}}}{{250}} = {a}\ \text{{mm}}, \qquad \frac{{{l}}}{{500}} = {b}\ \text{{mm}}",
            l = lx(g.span_mm, 0),
            a = lx(g.appearance_mm, 1),
            b = lx(g.damage_mm, 1)
        ),
        vec![
            nv("l", g.span_mm, "mm"),
            nv(r"w_{250}", g.appearance_mm, "mm"),
            nv(r"w_{500}", g.damage_mm, "mm"),
        ],
        Some(g.appearance_mm),
        "mm",
        vec![
            format!(
                "7.4.1(4): overspanning/250 = {} mm voor het uiterlijk en de algehele \
                 bruikbaarheid — de berekende zakking van een ligger, plaat of uitkraging onder \
                 de QUASI-BLIJVENDE belastingen, bepaald ten opzichte van de opleggingen.",
                nl(g.appearance_mm, 1)
            ),
            format!(
                "7.4.1(5): overspanning/500 = {} mm voor doorbuigingen NA DE BOUW die \
                 aansluitende constructiedelen kunnen beschadigen, eveneens onder quasi-blijvende \
                 belastingen. Afhankelijk van de gevoeligheid van aansluitende delen mogen andere \
                 grenzen zijn overwogen.",
                nl(g.damage_mm, 1)
            ),
            format!(
                "7.4.1(4): een in de bekisting aangebrachte opbuiging (zeeg) behoort in het \
                 algemeen niet groter te zijn dan overspanning/250 = {} mm. Bij de afleiding van \
                 (7.16) is met een zeeg geen rekening gehouden; deze toets controleert de zeeg \
                 niet.",
                nl(g.precamber_max_mm, 1)
            ),
            "IN DEZE WEG IS GEEN DOORBUIGING BEREKEND. Deze getallen zijn de grenzen waarvoor de \
             slankheidstoets in de plaats komt, niet een uitkomst waarmee is vergeleken. Een \
             berekende doorbuiging volgt uit 7.4.3, en die weg is in deze versie niet gebouwd."
                .to_string(),
        ],
    ));

    uit
}

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// Een verzoek waarin alleen staat wat (7.16) nodig heeft: geen
    /// correcties, rechthoekige doorsnede, korte overspanning.
    fn kaal(f_ck: f64, rho: f64, rho_prime: f64, system: StructuralSystem) -> SlendernessRequest {
        SlendernessRequest {
            beam_id: 0,
            system,
            f_ck_mpa: f_ck,
            // 5000/250 = 20: een slankheid die niet ter zake doet zolang we
            // naar `base_l_over_d` kijken.
            span_mm: 5000.0,
            d_mm: 250.0,
            rho,
            rho_prime,
            sigma_s_mpa: None,
            f_yk_mpa: None,
            a_s_req_mm2: None,
            a_s_prov_mm2: None,
            b_flange_mm: 300.0,
            b_web_mm: 300.0,
            l_eff_mm: None,
            carries_brittle_partitions: None,
            n_ed_kn: Some(0.0),
        }
    }

    /// (7.16.a) met EXACTE handrekenkunde.
    ///
    /// C25/30 is met opzet gekozen: f_ck = 25 → √f_ck = 5 precies, dus
    /// ρ₀ = 10⁻³·5 = 0,005 precies.
    ///
    /// Met ρ = 0,004: ρ₀/ρ = 0,005/0,004 = 1,25.
    ///   term 2 = 1,5 · 5 · 1,25                  = 9,375
    ///   term 3 = 3,2 · 5 · (1,25 − 1)^{3/2}
    ///          = 16 · 0,25^{3/2} = 16 · 0,125     = 2,000
    ///   l/d    = 1,0 · (11 + 9,375 + 2,000)       = 22,375
    /// (0,25^{3/2} = 0,25 · √0,25 = 0,25 · 0,5 = 0,125.)
    #[test]
    fn vergelijking_7_16_a_exacte_handberekening() {
        let req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        let r = span_depth_limit(&req).unwrap();
        assert_eq!(r.equation, SlendernessEquation::Eq716a);
        assert_relative_eq!(r.rho_0, 0.005, max_relative = 1e-12);
        assert_relative_eq!(r.base_l_over_d, 22.375, max_relative = 1e-12);
    }

    /// (7.16.b) met EXACTE handrekenkunde, opnieuw C25/30 (√f_ck = 5,
    /// ρ₀ = 0,005).
    ///
    /// Met ρ = 0,025 en ρ' = 0,020:
    ///   term 2 = 1,5 · 5 · 0,005/(0,025 − 0,020)
    ///          = 7,5 · 0,005/0,005                = 7,5
    ///   term 3 = (1/12) · 5 · √(0,020/0,005)
    ///          = (5/12) · √4 = (5/12) · 2 = 10/12 = 0,833333…
    ///   l/d    = 1,0 · (11 + 7,5 + 10/12)         = 19,333333…
    #[test]
    fn vergelijking_7_16_b_exacte_handberekening() {
        let req = kaal(25.0, 0.025, 0.020, StructuralSystem::SimplySupported);
        let r = span_depth_limit(&req).unwrap();
        assert_eq!(r.equation, SlendernessEquation::Eq716b);
        assert_relative_eq!(r.base_l_over_d, 11.0 + 7.5 + 10.0 / 12.0, max_relative = 1e-12);
        assert_relative_eq!(r.base_l_over_d, 19.333_333_333_333_332, max_relative = 1e-12);
    }

    /// De takgrens. Bij ρ = ρ₀ geldt "als ρ ≤ ρ₀", dus (7.16.a), en dan is
    /// ρ₀/ρ = 1 en valt de derde term weg:
    ///   l/d = K · (11 + 1,5·√f_ck) = 1,0 · (11 + 1,5·5) = 18,5 voor C25/30.
    ///
    /// Een haar boven ρ₀ moet (7.16.b) gelden. Zou de takkeuze daar op
    /// (7.16.a) blijven staan, dan is (ρ₀/ρ − 1) negatief en levert de macht
    /// 3/2 een NaN — vandaar dat dit apart wordt vastgepind.
    #[test]
    fn takkeuze_op_de_grens() {
        let r = span_depth_limit(&kaal(25.0, 0.005, 0.0, StructuralSystem::SimplySupported)).unwrap();
        assert_eq!(r.equation, SlendernessEquation::Eq716a);
        assert_relative_eq!(r.base_l_over_d, 18.5, max_relative = 1e-12);

        let r = span_depth_limit(&kaal(25.0, 0.005_000_001, 0.0, StructuralSystem::SimplySupported))
            .unwrap();
        assert_eq!(r.equation, SlendernessEquation::Eq716b);
        assert!(r.base_l_over_d.is_finite());
    }

    /// TABEL 7.4N NAGEREKEND UIT (7.16) — dit is een controle op de NORM en
    /// niet op deze code, en tegelijk de numerieke bevestiging van
    /// ρ₀ = 10⁻³√f_ck, die op de gerenderde bladzijde niet leesbaar is.
    ///
    /// De OPMERKING bij tabel 7.4N noemt de gebruikte gevallen: C30/37,
    /// σ_s = 310 MPa, ρ = 0,5 % en ρ = 1,5 %. Met f_ck = 30 is
    /// ρ₀ = 10⁻³√30 = 0,005477…
    ///
    /// Bij ρ = 1,5 % (> ρ₀, dus (7.16.b), ρ' = 0) valt de tweede term samen:
    ///   1,5·√30 · (10⁻³√30)/0,015 = 1,5 · 30 · 10⁻³ / 0,015 = 3,000 EXACT,
    /// en de derde term is nul. Dus l/d = K · 14,000 precies:
    ///   K = 1,0 → 14,0 (tabel 14)   K = 1,3 → 18,2 (tabel 18)
    ///   K = 1,5 → 21,0 (tabel 20)   K = 1,2 → 16,8 (tabel 17)
    ///   K = 0,4 →  5,6 (tabel  6)
    ///
    /// Bij ρ = 0,5 % (< ρ₀, dus (7.16.a)) is ρ₀/ρ = √30/5 = 1,0954451…, de
    /// tweede term 1,5·30·10⁻³/0,005 = 9,000 EXACT, en de derde term
    /// 3,2·√30·(0,0954451…)^{3/2} = 0,516822…, samen 20,516822… Dus:
    ///   K = 1,0 → 20,52 (tabel 20)  K = 1,3 → 26,67 (tabel 26)
    ///   K = 1,5 → 30,78 (tabel 30)  K = 1,2 → 24,62 (tabel 24)
    ///   K = 0,4 →  8,21 (tabel  8)
    ///
    /// Negen van de tien tabelwaarden volgen door afronden; de tiende
    /// (K = 1,5 bij ρ = 1,5 %: 21,0 tegen tabel 20) staat naar beneden
    /// afgerond. OPMERKING 1 bij de tabel zegt daarover: "De gegeven waarden
    /// zijn zo gekozen dat ze in het algemeen conservatief zijn." De
    /// tabelgetallen zijn dus oriëntatie en géén invoer — de toets rekent met
    /// K plus (7.16).
    #[test]
    fn tabel_7_4n_volgt_uit_7_16() {
        // De twee basiswaarden bij K = 1,0, met de hand nagerekend.
        let hoog = span_depth_limit(&kaal(30.0, 0.015, 0.0, StructuralSystem::SimplySupported))
            .unwrap()
            .base_l_over_d;
        let laag = span_depth_limit(&kaal(30.0, 0.005, 0.0, StructuralSystem::SimplySupported))
            .unwrap()
            .base_l_over_d;
        assert_relative_eq!(hoog, 14.0, max_relative = 1e-12);
        assert_relative_eq!(laag, 20.516_822_204, max_relative = 1e-9);

        for rij in STRUCTURAL_SYSTEMS {
            let h = span_depth_limit(&kaal(30.0, 0.015, 0.0, rij.system)).unwrap();
            let l = span_depth_limit(&kaal(30.0, 0.005, 0.0, rij.system)).unwrap();
            assert_relative_eq!(h.base_l_over_d, rij.k * 14.0, max_relative = 1e-12);
            assert_relative_eq!(l.base_l_over_d, rij.k * laag, max_relative = 1e-12);
            // Elke tabelwaarde ligt binnen 1,0 van de berekende waarde: de
            // tabel is afgerond, en bij K = 1,5 naar beneden.
            assert!(
                (h.base_l_over_d - rij.basic_high_stress).abs() <= 1.0,
                "{}: {} tegen tabel {}",
                rij.label,
                h.base_l_over_d,
                rij.basic_high_stress
            );
            assert!(
                (l.base_l_over_d - rij.basic_low_stress).abs() <= 1.0,
                "{}: {} tegen tabel {}",
                rij.label,
                l.base_l_over_d,
                rij.basic_low_stress
            );
        }
    }

    /// De K-waarden van tabel 7.4N, één voor één.
    #[test]
    fn k_uit_tabel_7_4n() {
        assert_relative_eq!(StructuralSystem::SimplySupported.k(), 1.0);
        assert_relative_eq!(StructuralSystem::EndSpan.k(), 1.3);
        assert_relative_eq!(StructuralSystem::InteriorSpan.k(), 1.5);
        assert_relative_eq!(StructuralSystem::FlatSlab.k(), 1.2);
        assert_relative_eq!(StructuralSystem::Cantilever.k(), 0.4);
        assert!(StructuralSystem::FlatSlab.is_flat_slab());
        assert!(!StructuralSystem::InteriorSpan.is_flat_slab());
        assert_eq!(STRUCTURAL_SYSTEMS.len(), 5);
    }

    /// (7.17) met de hand: f_yk = 500, A_s,req = 800, A_s,prov = 1000.
    ///   310/σ_s = 500/(500 · 800/1000) = 500/400 = 1,25
    #[test]
    fn correctie_7_17_met_de_hand() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.f_yk_mpa = Some(500.0);
        req.a_s_req_mm2 = Some(800.0);
        req.a_s_prov_mm2 = Some(1000.0);
        let r = span_depth_limit(&req).unwrap();
        let c = r.corrections.iter().find(|c| c.id == "sigma_s").unwrap();
        assert!(c.applied);
        assert_relative_eq!(c.factor, 1.25, max_relative = 1e-12);
        // 22,375 · 1,25 = 27,96875
        assert_relative_eq!(r.limit_l_over_d, 27.968_75, max_relative = 1e-12);
    }

    /// Een expliciet opgegeven σ_s gaat vóór op (7.17): 310/400 = 0,775.
    #[test]
    fn expliciete_sigma_s_gaat_voor_op_7_17() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.sigma_s_mpa = Some(400.0);
        req.f_yk_mpa = Some(500.0);
        req.a_s_req_mm2 = Some(800.0);
        req.a_s_prov_mm2 = Some(1000.0);
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "sigma_s").unwrap();
        assert_relative_eq!(c.factor, 310.0 / 400.0, max_relative = 1e-12);
        assert!(c.reason.contains("gaat vóór"));
    }

    /// Zonder σ_s en zonder de drie gegevens van (7.17) is de factor 1,0 —
    /// maar dan MOET de reden vertellen dat dat de aanname σ_s = 310 MPa is.
    #[test]
    fn zonder_sigma_s_staat_de_aanname_in_de_reden() {
        let r = span_depth_limit(&kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported)).unwrap();
        let c = r.corrections.iter().find(|c| c.id == "sigma_s").unwrap();
        assert!(!c.applied);
        assert_relative_eq!(c.factor, 1.0);
        assert!(c.reason.contains("310 MPa"));
    }

    /// De flenscorrectie: strikt groter dan 3.
    ///   1200/300 = 4   > 3 → 0,8
    ///    900/300 = 3   niet > 3 → 1,0
    ///    901/300 = 3,00333 > 3 → 0,8
    #[test]
    fn flenscorrectie_drempel_is_strikt() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.b_flange_mm = 1200.0;
        req.b_web_mm = 300.0;
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "flens").unwrap();
        assert!(c.applied);
        assert_relative_eq!(c.factor, 0.8);

        req.b_flange_mm = 900.0;
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "flens").unwrap();
        assert!(!c.applied);
        assert_relative_eq!(c.factor, 1.0);

        req.b_flange_mm = 901.0;
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "flens").unwrap();
        assert!(c.applied);
    }

    /// DE EENHEDENVAL. l_eff = 9000 mm = 9 m moet 7/9 = 0,777… opleveren en
    /// beslist niet 7/9000 = 0,000778.
    #[test]
    fn lange_overspanning_rekent_in_meters() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.l_eff_mm = Some(9000.0);
        req.carries_brittle_partitions = Some(true);
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "lange_overspanning").unwrap();
        assert!(c.applied);
        assert_relative_eq!(c.factor, 7.0 / 9.0, max_relative = 1e-12);
        assert!(c.factor > 0.7 && c.factor < 0.8, "factor {} — mm/m verwisseld?", c.factor);
    }

    /// Onder de drempel geldt de correctie niet, en al helemaal niet als
    /// bonus: 7/5 = 1,4 zou de grenswaarde met 40 % verhogen.
    #[test]
    fn korte_overspanning_krijgt_geen_bonusfactor() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.l_eff_mm = Some(5000.0);
        req.carries_brittle_partitions = Some(true);
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "lange_overspanning").unwrap();
        assert!(!c.applied);
        assert_relative_eq!(c.factor, 1.0);
    }

    /// De scheidingswandvoorwaarde is noodzakelijk. Zonder zulke wanden
    /// vervalt de correctie ook bij 9 m.
    #[test]
    fn zonder_kwetsbare_scheidingswanden_geen_correctie() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.l_eff_mm = Some(9000.0);
        req.carries_brittle_partitions = Some(false);
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "lange_overspanning").unwrap();
        assert!(!c.applied);
        assert_relative_eq!(c.factor, 1.0);
    }

    /// Is de scheidingswandvoorwaarde niet vastgesteld, dan wordt de correctie
    /// aan de veilige kant tóch toegepast — en staat dat in de reden.
    #[test]
    fn onbekende_scheidingswanden_gaat_naar_de_veilige_kant() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.l_eff_mm = Some(9000.0);
        req.carries_brittle_partitions = None;
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "lange_overspanning").unwrap();
        assert!(c.applied);
        assert_relative_eq!(c.factor, 7.0 / 9.0, max_relative = 1e-12);
        assert!(c.reason.contains("NIET opgegeven"));
    }

    /// De 7 m-regel geldt NIET voor een vlakke plaatvloer; die heeft de
    /// 8,5 m-regel. Bij l_eff = 8 m gebeurt er bij een vlakke plaatvloer dus
    /// niets, terwijl een balk bij diezelfde 8 m wel 7/8 krijgt.
    #[test]
    fn vlakke_plaatvloer_heeft_zijn_eigen_drempel() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::FlatSlab);
        req.l_eff_mm = Some(8000.0);
        req.carries_brittle_partitions = Some(true);
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "lange_overspanning").unwrap();
        assert!(!c.applied, "8 m ligt onder de drempel van 8,5 m voor een vlakke plaatvloer");

        let mut balk = kaal(25.0, 0.004, 0.0, StructuralSystem::InteriorSpan);
        balk.l_eff_mm = Some(8000.0);
        balk.carries_brittle_partitions = Some(true);
        let c = span_depth_limit(&balk).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "lange_overspanning").unwrap();
        assert!(c.applied);
        assert_relative_eq!(c.factor, 7.0 / 8.0, max_relative = 1e-12);

        // 10 m bij een vlakke plaatvloer: 8,5/10 = 0,85.
        req.l_eff_mm = Some(10_000.0);
        let c = span_depth_limit(&req).unwrap();
        let c = c.corrections.into_iter().find(|c| c.id == "lange_overspanning").unwrap();
        assert!(c.applied);
        assert_relative_eq!(c.factor, 0.85, max_relative = 1e-12);
    }

    /// ρ' ≥ ρ in (7.16.b): geen getal, maar een reden.
    #[test]
    fn rho_accent_niet_kleiner_dan_rho_wordt_geweigerd() {
        let e = span_depth_limit(&kaal(25.0, 0.010, 0.010, StructuralSystem::SimplySupported))
            .unwrap_err();
        assert!(e.contains("ρ − ρ'"), "{e}");
        let e = span_depth_limit(&kaal(25.0, 0.010, 0.012, StructuralSystem::SimplySupported))
            .unwrap_err();
        assert!(e.contains("(7.16.b)"), "{e}");
    }

    /// Normaaldruk zet de toets buiten haar toepassingsgebied.
    #[test]
    fn normaaldruk_valt_buiten_tabel_7_4n() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.n_ed_kn = Some(-120.0);
        let e = span_depth_limit(&req).unwrap_err();
        assert!(e.contains("ZONDER NORMAALDRUK"), "{e}");
        assert!(e.contains("7.4.3"), "{e}");

        // Niet opgegeven → wél doorrekenen, maar met de waarschuwing erbij.
        req.n_ed_kn = None;
        let r = span_depth_limit(&req).unwrap();
        assert!(r.notes.iter().any(|n| n.contains("NORMAALKRACHT IS NIET OPGEGEVEN")));
    }

    /// Ongeldige invoer levert een reden, geen getal.
    #[test]
    fn ongeldige_invoer_wordt_geweigerd() {
        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.rho = 0.0;
        assert!(span_depth_limit(&req).unwrap_err().contains("ρ"));

        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.f_ck_mpa = 0.0;
        assert!(span_depth_limit(&req).unwrap_err().contains("f_ck"));

        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.d_mm = -10.0;
        assert!(span_depth_limit(&req).unwrap_err().contains("nuttige hoogte"));

        let mut req = kaal(25.0, 0.004, 0.0, StructuralSystem::SimplySupported);
        req.b_flange_mm = 200.0;
        req.b_web_mm = 300.0;
        assert!(span_depth_limit(&req).unwrap_err().contains("kleiner dan de ribbreedte"));
    }

    /// De grenswaarden van 7.4.1(4) en (5): 9000/250 = 36,0 mm en
    /// 9000/500 = 18,0 mm, onder de quasi-blijvende combinatie.
    #[test]
    fn doorbuigingsgrenzen_van_7_4_1() {
        let g = deflection_limits(9000.0);
        assert_relative_eq!(g.appearance_mm, 36.0, max_relative = 1e-12);
        assert_relative_eq!(g.damage_mm, 18.0, max_relative = 1e-12);
        assert_relative_eq!(g.precamber_max_mm, 36.0, max_relative = 1e-12);
        assert_eq!(g.combination, "quasi-blijvend");
    }

    /// De hele keten in één som, met de hand nagerekend.
    ///
    /// Eindoverspanning (K = 1,3), C30/37, ρ = 0,5 %, ρ' = 0.
    ///   basis  = 1,3 · 20,516822204          = 26,671868866
    /// (7.17) met f_yk = 500, A_s,req = 800, A_s,prov = 1000:
    ///   310/σ_s = 500/(500 · 0,8) = 500/400  = 1,25
    /// T-doorsnede 1200/300 = 4 > 3:
    ///   k_flens                               = 0,8
    /// l_eff = 9 m > 7 m, draagt kwetsbare wanden:
    ///   k_overspanning = 7/9                  = 0,777777…
    ///   grens = 26,671868866 · 1,25 · 0,8 · 7/9
    ///         = 26,671868866 · 7/9            = 20,744786896
    /// Werkelijke slankheid: 9000/450          = 20,0
    ///   UC = 20,0/20,744786896                = 0,964097636  → voldoet
    #[test]
    fn hele_keten_met_de_hand() {
        let req = SlendernessRequest {
            beam_id: 7,
            system: StructuralSystem::EndSpan,
            f_ck_mpa: 30.0,
            span_mm: 9000.0,
            d_mm: 450.0,
            rho: 0.005,
            rho_prime: 0.0,
            sigma_s_mpa: None,
            f_yk_mpa: Some(500.0),
            a_s_req_mm2: Some(800.0),
            a_s_prov_mm2: Some(1000.0),
            b_flange_mm: 1200.0,
            b_web_mm: 300.0,
            l_eff_mm: Some(9000.0),
            carries_brittle_partitions: Some(true),
            n_ed_kn: Some(0.0),
        };
        let r = span_depth_limit(&req).unwrap();
        assert_eq!(r.equation, SlendernessEquation::Eq716a);
        assert_relative_eq!(r.base_l_over_d, 26.671_868_866, max_relative = 1e-9);
        assert_relative_eq!(r.limit_l_over_d, 20.744_786_896, max_relative = 1e-9);
        assert_relative_eq!(r.actual_l_over_d, 20.0, max_relative = 1e-12);
        assert_relative_eq!(r.unity_check, 0.964_097_636, max_relative = 1e-9);
        assert_eq!(r.status, CheckStatus::Ok);
        assert_eq!(r.beam_id, 7);
        assert_relative_eq!(r.deflection_limits.appearance_mm, 36.0, max_relative = 1e-12);
        // Alle drie de correcties staan erin, ook als ze zouden zijn vervallen.
        assert_eq!(r.corrections.len(), 3);
        assert!(r.corrections.iter().all(|c| c.applied));
    }

    /// De toets als [`ResistanceCalc`]: unity check, artikel, formule en de
    /// afleiding als deelstappen.
    #[test]
    fn resistance_calc_draagt_de_afleiding() {
        let mut req = kaal(30.0, 0.005, 0.0, StructuralSystem::EndSpan);
        req.span_mm = 9000.0;
        req.d_mm = 450.0;
        let fs = ForceStateSnapshot {
            combination_id: 3,
            position_mm: 4500.0,
            forces: Default::default(),
        };
        let calc = check_span_depth_ratio(&req, fs);
        assert_eq!(calc.id, "7.4.2_slankheid");
        assert!(calc.article.contains("7.4.2"));
        assert!(calc.formula_latex.contains(r"\rho_0"));
        let uc = calc.uc.as_ref().unwrap();
        assert_relative_eq!(uc.ed, 20.0, max_relative = 1e-12);
        // De basiswaarde is 1,3 · 20,516822204 = 26,671868866. l_eff is niet
        // opgegeven, dus geldt l = 9000 mm = 9 m als l_eff; die ligt boven de
        // 7 m-drempel, en of het element kwetsbare scheidingswanden draagt is
        // óók niet opgegeven. De correctie 7/9 wordt dan aan de veilige kant
        // toegepast: 26,671868866 · 7/9 = 20,744786896.
        assert_relative_eq!(uc.rd, 20.744_786_896, max_relative = 1e-9);
        assert_eq!(calc.status, CheckStatus::Ok);
        assert_eq!(calc.combination_id_check(), 3);
        // De keten die de lezer moet kunnen navertellen.
        for id in [
            "toepassingsgebied",
            "rho_0",
            "takkeuze",
            "k_tabel_7_4n",
            "basis_l_d",
            "correctie_sigma_s",
            "correctie_flens",
            "correctie_lange_overspanning",
            "grenswaarde",
            "unity_check",
            "doorbuigingsgrenzen",
        ] {
            assert!(
                calc.deelstappen.iter().any(|s| s.id == id),
                "deelstap {id} ontbreekt in de afleiding"
            );
        }
        // Elke deelstap draagt een vindplaats.
        assert!(calc.deelstappen.iter().all(|s| !s.article.is_empty()));
    }

    /// Weigert de rekengang, dan komt er geen getal maar een
    /// `NotApplicable` met de reden onverkort in `notes`.
    #[test]
    fn resistance_calc_bij_normaaldruk_is_niet_van_toepassing() {
        let mut req = kaal(30.0, 0.005, 0.0, StructuralSystem::EndSpan);
        req.n_ed_kn = Some(-250.0);
        let calc = check_span_depth_ratio(
            &req,
            ForceStateSnapshot { combination_id: 1, position_mm: 0.0, forces: Default::default() },
        );
        assert_eq!(calc.status, CheckStatus::NotApplicable);
        assert!(calc.uc.is_none());
        assert_relative_eq!(calc.value, 0.0);
        assert!(calc.notes.iter().any(|n| n.contains("ZONDER NORMAALDRUK")));
    }

    /// De JSON-vorm van het verzoek: onbekende velden worden geweigerd, en
    /// de optionele velden mogen weg.
    #[test]
    fn json_vorm_van_het_verzoek() {
        let kaal_json = r#"{
            "system": "EndSpan",
            "f_ck_mpa": 30.0,
            "span_mm": 9000.0,
            "d_mm": 450.0,
            "rho": 0.005,
            "b_flange_mm": 300.0,
            "b_web_mm": 300.0
        }"#;
        let req: SlendernessRequest = serde_json::from_str(kaal_json).unwrap();
        assert_eq!(req.system, StructuralSystem::EndSpan);
        assert_relative_eq!(req.rho_prime, 0.0);
        assert_eq!(req.l_eff_mm, None);
        assert_eq!(req.n_ed_kn, None);
        assert!(span_depth_limit(&req).is_ok());

        let tikfout = r#"{
            "system": "EndSpan",
            "f_ck_mpa": 30.0,
            "span_mm": 9000.0,
            "d_mm": 450.0,
            "rho": 0.005,
            "rho_prim": 0.002,
            "b_flange_mm": 300.0,
            "b_web_mm": 300.0
        }"#;
        assert!(serde_json::from_str::<SlendernessRequest>(tikfout).is_err());
    }

    // Kleine hulp: `ResistanceCalc` heeft geen accessor voor het
    // combinatienummer; deze test wil alleen weten dat het krachtspunt
    // ongewijzigd wordt doorgegeven.
    trait CombinatieHulp {
        fn combination_id_check(&self) -> u32;
    }
    impl CombinatieHulp for ResistanceCalc {
        fn combination_id_check(&self) -> u32 {
            self.force_state.combination_id
        }
    }
}
