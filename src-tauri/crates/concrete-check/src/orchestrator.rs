//! Orchestrator: neem ConcreteBeamCheckInput, voer de EN 1992-toetsen uit,
//! lever ConcreteBeamCheckResult met volledige afleiding.
//!
//! # Welke toetsen er in het rapport komen
//!
//! | § | toets | bron |
//! |---|-------|------|
//! | 6.1 | buiging met de rechthoekige spanningsverdeling | [`nen_en_1992_1_1::checks`] |
//! | 6.1 | buiging met normaalkracht (M-N-κ) | idem |
//! | 6.2 | dwarskracht | [`nen_en_1992_1_1::dwarskracht`] |
//! | 7.3.2 | minimumwapening voor scheurbeheersing | [`nen_en_1992_1_1::scheurwijdte`] |
//! | 7.3.4 | scheurwijdte, berekend | idem |
//! | 7.4.2 | slankheid l/d | [`nen_en_1992_1_1::slankheid`] |
//! | 9.2.1, 9.2.2, 8.2 | negen detailleringseisen | [`nen_en_1992_1_1::detaillering`] |
//!
//! # Een toets die niet kan, zegt dat
//!
//! Elke toets waarvoor een gegeven ontbreekt — geen beugelafstand, geen
//! frequente BGT-combinatie, geen milieuklasse, geen constructievorm — komt
//! als [`CheckStatus::NotApplicable`] in `checks` te staan, met de reden als
//! eerste `note`. Hij wordt dus NIET overgeslagen en NIET groen gemeld. De
//! rapportlaag drukt zo'n toets af met "N/A" en de reden eronder.
//!
//! Dat betekent wel dat een N/A-toets niet meetelt in `uc_max` (zie
//! [`uc_of`]): er is geen unity check om mee te tellen. Een staaf waarvan de
//! dwarskrachttoets niet kon worden afgerekend, kan dus `uc_max ≤ 1` houden.
//! De reden staat in het rapport; het getal kan niet liegen over iets wat
//! niet is uitgerekend.
//!
//! # Wat "maatgevend" hier betekent
//!
//! `governing_check_id` en `uc_max` wijzen de toets aan die de staaf
//! BEGRENST. Een detailleringseis waaraan wordt VOLDAAN begrenst niets — hij
//! is een uitvoeringsregel, geen draagvermogen — en doet daarom niet mee aan
//! die keuze; faalt hij, dan doet hij wél mee. Zie `mag_maatgevend_zijn`.
//! Alle toetsen blijven onverkort in `checks` staan.
//!
//! # De twee grenstoestanden naast elkaar
//!
//! `forces_envelope` is de UGT-envelop en voedt §6.1, §6.2, §7.4.2 en §9.2.
//! `sls_frequent_envelope` is de FREQUENTE BGT-combinatie (NEN-EN 1990
//! (6.15)) en voedt uitsluitend §7.3 — de nationale bijlage bij 7.3.1(5)
//! schrijft die combinatie voor waar de EN-tekst de quasi-blijvende noemt.
//! De twee worden nergens door elkaar gehaald.
//!
//! # Op WELKE SNEDE een toets wordt uitgevoerd
//!
//! Een doorsnedetoets hoort te worden afgerekend op de snede waar hij het
//! zwaarst uitvalt, en dat is de snede met de hoogste UNITY CHECK — niet die
//! met de grootste belasting. Die twee vallen alleen samen als de weerstand
//! langs de staaf constant is, en dat is zij niet: de trekzijde volgt uit het
//! TEKEN van M_Ed, en daarmee veranderen de nuttige hoogte d, de langswapening
//! A_sl (§6.2), de aanwezige trekwapening (§7.3, §9.2.1.1) en de
//! momentweerstand M_Rd (§6.1). Bij een asymmetrische korf — en dat is de
//! regel, niet de uitzondering — scheelt dat een factor.
//!
//! Zie [`Zwaarte`] voor de rangorde die daarbij wordt aangehouden, en per
//! toets het commentaar in [`check_concrete_beam`] voor de snede die zij
//! kiest en waarom.
//!
//! # Wat het kost om elke snede na te lopen
//!
//! De omhullende draagt 21 stations per staaf per combinatie, dus bij twintig
//! combinaties gaat het om 420 sneden. Gemeten op de referentiebalk 300 × 500
//! (release-bouw, n_strips = 50), per rekengang en per snede:
//!
//! | rekengang | per snede |
//! |---|---|
//! | [`shear_resistance`] (§6.2) | 2,2 µs |
//! | [`stress_block`] (§6.1, alleen om te rangschikken) | 0,7 µs |
//! | gescheurde doorsnede + de twee toetsen van §7.3 | 27 µs |
//! | [`as_min_9_2_1_1`] (§9.2.1.1) | 36 µs |
//! | één M-κ-diagram (§6.1 M-N-κ) | 4,2 ms |
//!
//! De eerste vier zijn goedkoop genoeg om ELKE snede volledig door te rekenen;
//! er is dus geen voorselectie en geen benadering. Het M-κ-diagram is dat niet,
//! en daarvoor bestaat de EXACTE groepering in [`sneden_mn_kappa`].
//!
//! Wat dat in totaal doet met de toetsing van één staaf, gemeten op dezelfde
//! balk als doorgaande ligger (met tekenwisseling), vóór en na deze wijziging:
//!
//! | omhullende | vóór | na |
//! |---|---|---|
//! | 1 combinatie (21 sneden) | 145 ms | 146 ms |
//! | 5 combinaties (105) | 145 ms | 151 ms |
//! | 20 combinaties (420) | 145 ms | 161 ms |
//! | 50 combinaties (1050) | 145 ms | 188 ms |
//!
//! Met een normaalkracht die PER COMBINATIE verschilt — een kolom of een
//! geschoorde staaf — levert elke combinatie twee eigen M-N-κ-groepen op en
//! loopt het bij vijftig combinaties op tot 434 ms. Dat is de prijs van een
//! juist antwoord: bij een andere N_Ed is M_Rd werkelijk anders, en die sneden
//! overslaan zou een te lage unity check opleveren. Boven
//! [`MAX_MN_KAPPA_SNEDEN`] groepen wordt er wél voorgeselecteerd, en dan zegt
//! het rapport dat met zoveel woorden.
//!
//! Ter vergelijking: van de 145 ms van de oude toetsing gaat het overgrote deel
//! op aan de twee interactiediagrammen voor de WEERGAVE (elk 21 M-κ-diagrammen,
//! samen ongeveer 140 ms). Die stonden er al en zijn hier niet aangeraakt.

use std::collections::HashMap;

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::bending::stress_block;
use nen_en_1992_1_1::checks::{check_bending_stress_block, check_mn_kappa};
use nen_en_1992_1_1::detaillering::{
    as_min_9_2_1_1, benodigde_trekwapening_mm2, detailleringstoetsen, is_detailleringstoets,
    DetailleringInvoer,
};
use nen_en_1992_1_1::dwarskracht::{
    check_shear, shear_resistance, ShearOptions, ShearResistance, Spoor,
};
use nen_en_1992_1_1::mnkappa::{
    axial_compression_capacity_kn, axial_tension_capacity_kn, interaction_diagram,
    mn_kappa_diagram, MnKappaOptions,
};
use nen_en_1992_1_1::scheurwijdte::{
    check_minimumwapening, check_scheurwijdte_berekend, Belastingsduur, Rekverdeling,
    Scheurgegevens, Scheurinvoer, COMBINATIE_SCHEURWIJDTE,
};
use nen_en_1992_1_1::slankheid::{check_span_depth_ratio, SlendernessRequest};
use nen_en_1992_1_1::stiffness::kappa_from_nm;
use nen_en_1992_1_1::{
    concrete_class_by_name, reinforcement_grade_by_name, ConcreteClass, ConcreteSection,
    ConcreteSectionInput, ConcreteTension, DesignMaterial, NonlinearBasis, ReinforcementCage,
    ReinforcementGrade,
};
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc};
use steel_check::{CheckKind, NamedCheck};

use crate::input::{ConcreteBeamCheckInput, MnKappaRequest};
use crate::result::{ConcreteBeamCheckResult, MnKappaResponse};

// ═══════════════════════════════════════════════════════════════════════════
// De maatgevende snede — op de unity check, niet op de belasting
// ═══════════════════════════════════════════════════════════════════════════

/// Hoe zwaar één toets op ÉÉN snede uitvalt, in een vorm die te rangschikken
/// is.
///
/// # De rangorde, en waarom zij zo is
///
/// 1. **Een snede waar de toets NIET kon worden afgerekend gaat vóór elke
///    snede met een uitkomst.** Anders zou een snede waar de weerstand
///    onbekend is — geen beugelgegevens terwijl er rekenkundig
///    dwarskrachtwapening nodig is, bijvoorbeeld — wegvallen achter een andere
///    snede met een keurige unity check van 0,7, en zou het rapport groen
///    melden waar het "dit weet ik niet" hoort te zeggen. Zoeken op de hoogste
///    unity check mag nooit een ONTBREKENDE unity check verbergen.
/// 2. Daarna de `waarde`: de unity check, of — bij een onbepaalde snede — een
///    maat voor hoe ver die snede over de grens ligt, zodat van twee
///    onbepaalde sneden de ergste in het rapport komt.
/// 3. Bij gelijke waarde de `belasting`. Een zuivere scheidsrechter: hij
///    verandert de uitkomst niet, maar zorgt dat bij een gelijkspel (twee
///    sneden met dezelfde unity check, wat bij een symmetrische omhullende
///    voortdurend gebeurt) de zwaarst belaste snede in het rapport staat en
///    niet toevallig de eerste in de lijst.
///
/// De vergelijking is met opzet op `f64` en niet op [`Ord`]: een unity check
/// mag oneindig zijn (weerstand nul bij een belasting die er wel is), en dat
/// getal moet gewoon winnen.
#[derive(Clone, Copy, Debug)]
struct Zwaarte {
    /// De toets leverde op deze snede geen unity check op.
    onbepaald: bool,
    /// De unity check, of bij `onbepaald` de maat voor de overschrijding.
    waarde: f64,
    /// Scheidsrechter bij een gelijkspel: de grootste belasting wint.
    belasting: f64,
}

impl Zwaarte {
    /// De toets is afgerekend en levert `uc`.
    fn bepaald(uc: f64, belasting: f64) -> Self {
        Zwaarte { onbepaald: false, waarde: schoon(uc), belasting: schoon(belasting) }
    }

    /// De toets kon op deze snede niet worden afgerekend. `maat` zegt hoe erg
    /// dat is — bij de dwarskracht V_Ed/V_Rd,c, de verhouding die de doorsnede
    /// überhaupt in het vakwerkspoor duwde.
    fn onbepaald(maat: f64, belasting: f64) -> Self {
        Zwaarte { onbepaald: true, waarde: schoon(maat), belasting: schoon(belasting) }
    }

    fn zwaarder_dan(&self, ander: &Zwaarte) -> bool {
        if self.onbepaald != ander.onbepaald {
            return self.onbepaald;
        }
        if self.waarde != ander.waarde {
            return self.waarde > ander.waarde;
        }
        self.belasting > ander.belasting
    }
}

/// NaN kan niet worden vergeleken en zou de rangschikking van de toevallige
/// volgorde laten afhangen; hij telt hier als nul.
fn schoon(v: f64) -> f64 {
    if v.is_nan() {
        0.0
    } else {
        v
    }
}

/// Bewaar van een reeks sneden de ZWAARSTE uitkomst, mét alles wat er bij die
/// snede hoort — de toets zelf, de bijbehorende gegevens, de afleiding.
///
/// Dat laatste is de reden dat dit geen simpele `max_by` op de punten is: de
/// scheurtoetsen leunen op een gescheurde-doorsnedeberekening die per snede
/// anders uitvalt, en die uitkomst twee keer maken (één keer om te wegen, één
/// keer om te tonen) zou twee gescheiden rekengangen opleveren die uit elkaar
/// kunnen lopen.
struct Zwaarste<T> {
    beste: Option<(Zwaarte, T)>,
}

impl<T> Zwaarste<T> {
    fn nieuw() -> Self {
        Zwaarste { beste: None }
    }

    fn bied(&mut self, zwaarte: Zwaarte, waarde: T) {
        let neem = match &self.beste {
            None => true,
            Some((huidig, _)) => zwaarte.zwaarder_dan(huidig),
        };
        if neem {
            self.beste = Some((zwaarte, waarde));
        }
    }

    fn uitkomst(self) -> Option<T> {
        self.beste.map(|(_, t)| t)
    }
}

/// De zwaarte van een AFGERONDE toets.
///
/// Onbepaald is hier precies "er is geen unity check" — en dus NIET "de status
/// is N/A". Dat onderscheid is wezenlijk: de dwarskrachttoets zet de status op
/// N/A zodra V_Ed nul is, maar levert daar wél een unity check (van nul). Zo'n
/// snede is niet onbekend, hij is onbelast, en hij hoort dus te VERLIEZEN van
/// elke snede waar wel iets staat.
fn zwaarte_van(calc: &ResistanceCalc, belasting: f64) -> Zwaarte {
    match &calc.uc {
        Some(u) => Zwaarte::bepaald(u.uc, belasting),
        None => Zwaarte::onbepaald(0.0, belasting),
    }
}

/// De vaste zin die bij elke toets vertelt WELKE snede er is getoetst en uit
/// hoeveel er is gekozen.
///
/// Zonder die zin staat er in het rapport een unity check zonder plaats, en
/// kan een constructeur niet nagaan of de toets bij de doorsnede hoort die hij
/// in gedachten had. `aanleiding` zegt daarnaast waarom er op die grootheid is
/// gezocht — dat verschilt per toets.
fn snedemelding(aanleiding: &str, punt: &ForcePoint, aantal: usize) -> String {
    format!(
        "Getoetst op combinatie {} op x = {} mm: M_Ed = {:.1} kNm, V_Ed = {:.1} kN, \
         N_Ed = {:.1} kN. Gekozen uit de {} sneden van de UGT-omhullende. {aanleiding}",
        punt.combination_id,
        punt.position_mm.round() as i64,
        punt.forces.my_ed,
        punt.forces.vz_ed,
        punt.forces.n_ed,
        aantal,
    )
}

/// Zoek het envelop-punt dat `score` maximaliseert — zelfde aanpak als de
/// staal- en hout-orchestrator.
fn governing_for<F>(env: &[ForcePoint], score: F) -> ForcePoint
where
    F: Fn(&InternalForces) -> f64,
{
    if env.is_empty() {
        return ForcePoint { combination_id: 0, position_mm: 0.0, forces: Default::default() };
    }
    let mut best = env[0];
    let mut best_score = score(&best.forces);
    for p in &env[1..] {
        let s = score(&p.forces);
        if s > best_score {
            best = *p;
            best_score = s;
        }
    }
    best
}

// ───────────────────────────────────────────────────────────────────────────
// §6.2 — de maatgevende dwarskrachtsnede
// ───────────────────────────────────────────────────────────────────────────

/// Wat een keer langs de hele omhullende oplevert voor §6.2 en voor de twee
/// detailleringseisen die op §6.2 leunen.
struct DwarskrachtOverzicht {
    /// De snede met de hoogste unity check — daar wordt §6.2 afgerekend.
    punt: ForcePoint,
    /// De grootste |V_Ed| van de hele omhullende, kN.
    v_ed_max_kn: f64,
    /// De KLEINSTE V_Rd,max van de omhullende. `None` als het vakwerkmodel
    /// nergens kon worden opgebouwd.
    v_rd_max_min_kn: Option<f64>,
    /// Is er ERGENS in de staaf rekenkundig dwarskrachtwapening vereist?
    ergens_vakwerkspoor: bool,
    /// Hoeveel sneden er zijn doorgerekend — gaat als mededeling het rapport in.
    aantal_sneden: usize,
}

/// Loop de hele UGT-omhullende langs en bepaal per snede de dwarskracht-
/// weerstand die dáár geldt.
///
/// # Waarom de grootste |V_Ed| het verkeerde criterium is
///
/// V_Rd is geen constante van de staaf. Bij het spoor zonder berekende
/// dwarskrachtwapening (6.2.2(1)) rekent V_Rd,c met d en met A_sl, en die twee
/// horen bij de zijde die op TREK staat — de dwarskrachtmodule leest dat aan
/// het teken van M_Ed af. Bij een asymmetrische korf verschilt V_Rd,c daardoor
/// per snede. De snede met de grootste dwarskracht kan dus een RUIMERE
/// weerstand hebben dan een naburige snede met iets minder dwarskracht maar
/// een veel kleinere A_sl, en dan ligt de werkelijke maatgevende unity check
/// niet op de eerste maar op de tweede.
///
/// Daarom wordt hier de weerstand OP ELKE SNEDE uitgerekend en op de unity
/// check gerangschikt. Dat mag: [`shear_resistance`] is een gesloten
/// berekening zonder iteratie (gemeten ≈ 2 µs per snede), zodat een
/// omhullende van 21 stations maal enkele tientallen combinaties in de orde
/// van milliseconden blijft — verwaarloosbaar naast de M-N-κ- en
/// interactiediagrammen die per staaf toch al worden gemaakt. Er is dus geen
/// goedkope voorselectie nodig en er wordt ook geen benadering gebruikt: elke
/// snede is volledig doorgerekend.
fn dwarskrachtoverzicht(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    env: &[ForcePoint],
    opts: &ShearOptions,
) -> DwarskrachtOverzicht {
    let mut beste: Zwaarste<ForcePoint> = Zwaarste::nieuw();
    let mut v_ed_max_kn = 0.0_f64;
    let mut v_rd_max_min_kn: Option<f64> = None;
    let mut ergens_vakwerkspoor = false;

    for p in env {
        let fs = ForceStateSnapshot::from_point(p);
        let r: ShearResistance = shear_resistance(section, cage, mat, &fs, opts);
        beste.bied(zwaarte_dwarskracht(&r), *p);

        v_ed_max_kn = v_ed_max_kn.max(r.v_ed_kn);
        if r.spoor == Spoor::Vakwerkmodel {
            ergens_vakwerkspoor = true;
        }
        if let Some(v) = r.vakwerk.as_ref().map(|v| v.v_rd_max_kn) {
            v_rd_max_min_kn = Some(match v_rd_max_min_kn {
                Some(huidig) => huidig.min(v),
                None => v,
            });
        }
    }

    DwarskrachtOverzicht {
        punt: beste.uitkomst().unwrap_or(ForcePoint {
            combination_id: 0,
            position_mm: 0.0,
            forces: Default::default(),
        }),
        v_ed_max_kn,
        v_rd_max_min_kn,
        ergens_vakwerkspoor,
        aantal_sneden: env.len(),
    }
}

/// De zwaarte van één dwarskrachtsnede.
///
/// Er wordt hier op [`ShearResistance`] gewogen en niet op de afgeronde
/// [`ResistanceCalc`], om twee redenen. Ten eerste is dit vijftien keer
/// goedkoper — de afleiding en de deelstappen van [`check_shear`] hoeven maar
/// één keer te worden opgeschreven, namelijk voor de snede die wint. Ten
/// tweede kan een snede waar de weerstand NIET bepaald kon worden hier een
/// zinnige maat meekrijgen: V_Ed/V_Rd,c. Precies die verhouding duwde de
/// doorsnede in het vakwerkspoor van 6.2.3, en zij zegt dus hoeveel
/// dwarskrachtwapening er tekortkomt. Van twee onbepaalde sneden komt daarmee
/// de ergste in het rapport.
fn zwaarte_dwarskracht(r: &ShearResistance) -> Zwaarte {
    match r.uc {
        Some(uc) => Zwaarte::bepaald(uc, r.v_ed_kn),
        None => {
            let v_rd_c = r.vrd_c.v_rd_c_kn;
            let maat = if v_rd_c > 0.0 {
                r.v_ed_kn / v_rd_c
            } else if r.v_ed_kn > 0.0 {
                f64::INFINITY
            } else {
                0.0
            };
            Zwaarte::onbepaald(maat, r.v_ed_kn)
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// §6.1 — de maatgevende buigsnede
// ───────────────────────────────────────────────────────────────────────────

/// Het resultaat van één keer langs de omhullende voor de buigtoets met de
/// rechthoekige spanningsverdeling.
struct BuigOverzicht {
    /// De snede met de hoogste unity check.
    punt: ForcePoint,
    /// Op hoeveel sneden de rechthoekige spanningsverdeling niet van
    /// toepassing was (geheel gedrukt, of trek boven de trekcapaciteit).
    aantal_niet_toepasbaar: usize,
}

/// De maatgevende snede voor de buigtoets met de rechthoekige
/// spanningsverdeling (§6.1 met 3.1.7(3)).
///
/// # Waarom het grootste |M_Ed| het verkeerde criterium is
///
/// M_Rd hangt van de snede af via het TEKEN van M_Ed en via N_Ed. Bij de
/// referentiekorf (onder 3Ø16, boven 2Ø12) is M_Rd bij trek onder 113,3 kNm en
/// bij trek boven 46,0 kNm — een factor 2,5. Een steunpuntsmoment van 45 kNm
/// is daarmee zwaarder dan een veldmoment van 100 kNm, terwijl het grootste
/// |M_Ed| het veldmoment aanwijst.
///
/// # Waarom een niet-toepasbare snede hier NIET voorgaat
///
/// [`stress_block`] geeft geen antwoord als de doorsnede geheel onder druk
/// staat (x > h) of als de trek de trekcapaciteit van de wapening overschrijdt.
/// Anders dan bij de dwarskracht wordt zo'n snede hier niet naar voren
/// getrokken, en dat is met opzet: art. 6.1 wordt op diezelfde snede ook langs
/// de M-N-κ-weg getoetst, en díe weg kent de geheel gedrukte doorsnede wél
/// (draaipunt C van figuur 6.1). Het artikel blijft daar dus getoetst; alleen
/// de handberekening kan er niet. Hoe vaak dat voorkwam gaat als mededeling
/// het rapport in, zodat de lezer ziet dat er sneden zijn waar deze weg niets
/// zegt en de andere alles.
fn buigoverzicht(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    env: &[ForcePoint],
) -> BuigOverzicht {
    let layers = cage.layers(section.h_mm);
    let mut beste: Zwaarste<ForcePoint> = Zwaarste::nieuw();
    let mut aantal_niet_toepasbaar = 0usize;
    // De terugval als GEEN ENKELE snede kan worden afgerekend: het grootste
    // |M_Ed|. Dan is er geen unity check om op te rangschikken, en levert die
    // snede tenminste de reden bij het zwaarste moment.
    let terugval = governing_for(env, |f| f.my_ed.abs() + f.n_ed.abs() * 0.01);

    for p in env {
        let m_ed = p.forces.my_ed;
        let sign = if m_ed < 0.0 { -1.0 } else { 1.0 };
        match stress_block(section, &layers, mat, p.forces.n_ed, sign) {
            Ok(r) => {
                let uc = if r.m_rd_knm > 0.0 { m_ed.abs() / r.m_rd_knm } else { 0.0 };
                beste.bied(Zwaarte::bepaald(uc, m_ed.abs()), *p);
            }
            Err(_) => aantal_niet_toepasbaar += 1,
        }
    }

    BuigOverzicht { punt: beste.uitkomst().unwrap_or(terugval), aantal_niet_toepasbaar }
}

/// Bovengrens op het aantal sneden waarop de M-N-κ-toets volledig wordt
/// doorgerekend.
///
/// Eén M-κ-diagram kost bij vijftig stroken ongeveer 4 ms — duizend keer zo
/// veel als een dwarskrachtsnede. Zonder plafond zou een omhullende met veel
/// combinaties én een langs de staaf variërende normaalkracht de toetsing
/// merkbaar vertragen. Vijftig sneden is ruim: bij een raamwerkstaaf is N_Ed
/// per combinatie constant, zodat er per combinatie hooguit twee groepen
/// overblijven (trek onder en trek boven) en het plafond pas bij vijfentwintig
/// combinaties in zicht komt.
const MAX_MN_KAPPA_SNEDEN: usize = 50;

/// De sneden waarop de M-N-κ-toets moet worden afgerekend.
///
/// # Een EXACTE reductie, geen benadering
///
/// M_Rd hangt bij deze toets van de snede af via precies twee grootheden: het
/// TEKEN van M_Ed (dat bepaalt welke kant wordt gedrukt) en N_Ed. Twee sneden
/// met hetzelfde teken en dezelfde N_Ed hebben dus LETTERLIJK dezelfde M_Rd,
/// en dan wint binnen die groep de snede met de grootste |M_Ed| — ook na de
/// minimale excentriciteit van 6.1(4), want |N_Ed|·e₀ is binnen de groep
/// gelijk. Eén afgevaardigde per groep is daarmee niet "goed genoeg" maar
/// aantoonbaar hetzelfde antwoord als alle sneden doorrekenen.
///
/// Bij een staaf zonder normaalkracht blijven er zo hooguit twee groepen over
/// (trek onder en trek boven), ongeacht hoeveel stations en combinaties de
/// omhullende draagt.
///
/// # Het plafond
///
/// Blijven er méér dan [`MAX_MN_KAPPA_SNEDEN`] groepen over, dan wordt er
/// voorgeselecteerd op de GOEDKOPE spanningsblokweerstand (≈ 0,7 µs per
/// snede). Dat is een schatting en geen bovengrens — de twee weerstanden
/// liggen bij dezelfde doorsnede binnen enkele procenten van elkaar — dus dan,
/// en alleen dan, is de uitkomst een benadering. Het rapport zegt dat met
/// zoveel woorden; zie de mededeling in [`check_concrete_beam`].
fn sneden_mn_kappa(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    mat: &DesignMaterial,
    env: &[ForcePoint],
) -> (Vec<ForcePoint>, bool) {
    let mut index: HashMap<(bool, u64), usize> = HashMap::new();
    let mut groepen: Vec<ForcePoint> = Vec::new();
    for p in env {
        let sleutel = (p.forces.my_ed < 0.0, p.forces.n_ed.to_bits());
        match index.get(&sleutel) {
            Some(&i) => {
                if p.forces.my_ed.abs() > groepen[i].forces.my_ed.abs() {
                    groepen[i] = *p;
                }
            }
            None => {
                index.insert(sleutel, groepen.len());
                groepen.push(*p);
            }
        }
    }
    if groepen.len() <= MAX_MN_KAPPA_SNEDEN {
        return (groepen, false);
    }

    // Voorselectie op de goedkope weerstand. Sneden waar het spanningsblok
    // niets zegt, krijgen een oneindige score: zij mogen juist niet als eerste
    // afvallen, want daar is de M-N-κ-weg de enige die art. 6.1 nog toetst.
    let layers = cage.layers(section.h_mm);
    let mut met_score: Vec<(f64, ForcePoint)> = groepen
        .into_iter()
        .map(|p| {
            let sign = if p.forces.my_ed < 0.0 { -1.0 } else { 1.0 };
            let score = match stress_block(section, &layers, mat, p.forces.n_ed, sign) {
                Ok(r) if r.m_rd_knm > 0.0 => p.forces.my_ed.abs() / r.m_rd_knm,
                Ok(_) => 0.0,
                Err(_) => f64::INFINITY,
            };
            (score, p)
        })
        .collect();
    met_score.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    met_score.truncate(MAX_MN_KAPPA_SNEDEN);
    (met_score.into_iter().map(|(_, p)| p).collect(), true)
}

// ───────────────────────────────────────────────────────────────────────────
// §9.2.1.1(1) — de enige detailleringseis die van de snede afhangt
// ───────────────────────────────────────────────────────────────────────────

/// §9.2.1.1(1) A_s,min over de HELE omhullende, met de zwaarste snede als
/// uitkomst.
///
/// # Waarom deze ene detailleringseis wél een snede zoekt
///
/// De andere acht eisen vergelijken maten van de KORF met elkaar — de
/// beugeldiameter, de vrije staafafstand, de balkbreedte — en die zijn langs de
/// hele staaf gelijk. A_s,min niet: de eis zet de vereiste minimumwapening af
/// tegen de AANWEZIGE trekwapening, en welke rij dat is volgt uit het teken van
/// M_Ed. Daarbovenop hangt A_s,min zelf van (M_Ed; N_Ed) af, via de
/// minimumcombinatie van de nationale bijlage en via A_s,min2 = 1,25 × de
/// UGT-behoefte. Op één snede blijven staan kan de trekzijde met de minste
/// wapening dus overslaan, en een FALENDE detailleringseis is wél maatgevend
/// voor de staaf.
///
/// `basis` is de uitkomst op de snede met het grootste moment — die is al
/// gemaakt en doet gewoon mee, zodat deze functie nooit een lagere uitkomst kan
/// opleveren dan zonder haar.
fn as_min_over_omhullende(
    invoer: &DetailleringInvoer<'_>,
    env: &[ForcePoint],
    basis: ResistanceCalc,
) -> ResistanceCalc {
    let mut beste: Zwaarste<ResistanceCalc> = Zwaarste::nieuw();
    let belasting_basis = basis.force_state.forces.my_ed.abs();
    beste.bied(zwaarte_van(&basis, belasting_basis), basis);

    for p in env {
        let per_snede = DetailleringInvoer {
            section: invoer.section,
            cage: invoer.cage,
            mat: invoer.mat,
            f_ctm_mpa: invoer.f_ctm_mpa,
            force_state: ForceStateSnapshot::from_point(p),
            d_g_mm: invoer.d_g_mm,
            dwarskrachtwapening_vereist: invoer.dwarskrachtwapening_vereist,
            v_ed_kn: invoer.v_ed_kn,
            v_rd_max_kn: invoer.v_rd_max_kn,
            blijvend_bekiste_oppervlakken: invoer.blijvend_bekiste_oppervlakken,
            dubbel_wapeningsnet: invoer.dubbel_wapeningsnet,
        };
        let calc = as_min_9_2_1_1(&per_snede);
        beste.bied(zwaarte_van(&calc, p.forces.my_ed.abs()), calc);
    }

    let mut uit = beste.uitkomst().expect("de basisuitkomst is altijd geboden");
    uit.notes.push(snedemelding(
        "Deze eis is als enige van de negen op ELKE snede van de omhullende nagelopen en op de \
         hoogste unity check gekozen: A_s,min wordt tegen de AANWEZIGE trekwapening afgezet, en \
         welke rij dat is volgt uit het teken van M_Ed. De overige acht eisen vergelijken maten \
         van de korf die langs de hele staaf gelijk zijn en staan daarom op de snede met het \
         grootste moment.",
        &ForcePoint {
            combination_id: uit.force_state.combination_id,
            position_mm: uit.force_state.position_mm,
            forces: uit.force_state.forces,
        },
        env.len(),
    ));
    uit
}

fn make_resistance(check: ResistanceCalc) -> NamedCheck {
    NamedCheck { id: check.id.clone(), kind: CheckKind::Resistance(check) }
}

fn uc_of(c: &NamedCheck) -> f64 {
    match &c.kind {
        CheckKind::Resistance(r) => {
            if matches!(r.status, CheckStatus::NotApplicable) {
                0.0
            } else {
                r.uc.as_ref().map(|u| u.uc).unwrap_or(0.0)
            }
        }
        CheckKind::Stability(s) => {
            if matches!(s.status, CheckStatus::NotApplicable) {
                0.0
            } else {
                s.uc.as_ref().map(|u| u.uc).unwrap_or(0.0)
            }
        }
    }
}

/// Faalt deze toets? Alleen [`CheckStatus::NotOk`] telt als falen; N/A is
/// "niet uitgerekend" en Ok is "voldoet".
fn faalt(c: &NamedCheck) -> bool {
    match &c.kind {
        CheckKind::Resistance(r) => matches!(r.status, CheckStatus::NotOk),
        CheckKind::Stability(s) => matches!(s.status, CheckStatus::NotOk),
    }
}

/// Mag deze toets de MAATGEVENDE toets van de staaf worden?
///
/// # Wat "maatgevend" moet betekenen
///
/// Maatgevend is de toets die de staaf BEGRENST: die aanwijst waar het
/// ontwerp tegenaan loopt en wat er dus moet veranderen als de belasting
/// omhoog gaat. Een sterkte- of bruikbaarheidstoets doet dat altijd — zijn
/// unity check is belasting gedeeld door capaciteit, en 0,63 zegt dat er nog
/// 37 % capaciteit over is.
///
/// Een DETAILLERINGSEIS zegt iets heel anders. Hij vergelijkt een aanwezige
/// maat met een voorgeschreven maat: een uitvoeringsregel, geen grens aan het
/// draagvermogen. Bij een MINIMUM-eis wordt die vergelijking als "vereist
/// gedeeld door aanwezig" uitgedrukt zodat "te weinig" opnieuw uc > 1 geeft
/// (zie de moduledoc van [`nen_en_1992_1_1::detaillering`]) — maar dat maakt
/// de uitkomst nog geen benuttingsgraad. De minimumdiameter van een beugel
/// (NB §9.2.2(9): ten minste Ø5) levert met de gebruikelijke Ø8 een uc van
/// 5/8 = 0,625, en die 0,625 is geen reserve maar de mate waarin de eis is
/// overtroffen. Zo'n eis mocht tot nu toe met 0,625 de maatgevende toets van
/// een hele balk worden zodra de sterktetoetsen daar onder lagen — bij deze
/// balk al vanaf een beugelafstand onder 187,5 mm, want dan zakt ook
/// s_l,max = s/300 onder 0,625. Voor de constructeur wees het rapport dan een
/// eis aan waaraan hij ruim voldoet, terwijl de werkelijke grens elders lag.
///
/// # De regel
///
/// Een detailleringseis doet niet mee aan de KEUZE zolang hij VOLDOET, en wél
/// zodra hij FAALT: een korf die niet aan §8.2 of §9.2 voldoet is niet uit te
/// voeren zoals hij is getekend, en dát begrenst het ontwerp wel degelijk.
///
/// De toets zelf blijft onveranderd in `checks` staan, met zijn unity check,
/// zijn status en zijn afleiding. Er verdwijnt geen informatie; alleen de
/// rangschikking verandert. En omdat een falende eis blijft meetellen, kan
/// `uc_max` nooit onder 1 zakken terwijl een detailleringseis wordt
/// overschreden — de staaf blijft dan NotOk.
///
/// Staal, hout en kruislaaghout kennen deze vraag niet: die kernen toetsen
/// uitsluitend sterkte, stabiliteit en doorbuiging, en dat zijn stuk voor
/// stuk toetsen die de staaf begrenzen. Hun aggregatielus blijft dus zoals
/// hij is; er komt hier geen vierde eigen regel bij, alleen een filter op de
/// ene toetssoort die zij niet hebben.
fn mag_maatgevend_zijn(c: &NamedCheck) -> bool {
    !is_detailleringstoets(&c.id) || faalt(c)
}

/// Het resultaat waarin alleen de reden staat. De doorsnede kán hier
/// onbouwbaar zijn — een T zonder lijfbreedte bijvoorbeeld — dus de naam en de
/// hoogte komen uit de INVOER en niet uit een doorsnede die er niet is.
fn error_result(input: &ConcreteBeamCheckInput, fout: String) -> ConcreteBeamCheckResult {
    ConcreteBeamCheckResult {
        beam_id: input.beam_id,
        section_name: input.section.name(),
        // Er is geen bouwbare doorsnede, dus er zijn ook geen vormaannamen om
        // mee te geven. Ze uit de INVOER afleiden zou aannamen tonen bij een
        // doorsnede die niet bestaat.
        shape_assumptions: Vec::new(),
        concrete_class: input.concrete_class.clone(),
        reinforcement_grade: input.reinforcement_grade.clone(),
        reinforcement_summary: input.cage.summary(),
        a_s_bottom_mm2: input.cage.a_s_bottom_mm2(),
        a_s_top_mm2: input.cage.a_s_top_mm2(),
        d_mm: input.cage.d_mm(input.section.h_mm),
        f_cd_mpa: 0.0,
        f_yd_mpa: 0.0,
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::NotApplicable,
        governing_check_id: format!("ERROR: {fout}"),
        mn_kappa: None,
        interaction_positive: vec![],
        interaction_negative: vec![],
    }
}

/// Materiaal en geometrie uit de invoer; `Err` met een leesbare reden.
///
/// De betonklasse en de staalsoort komen er ZELF ook uit en niet alleen als
/// [`DesignMaterial`]: §7.3 heeft f_ctm en E_cm nodig (tabel 3.1) en §9.2.1.1
/// heeft f_ctm nodig, en `DesignMaterial` draagt die niet.
fn setup(
    section: &ConcreteSectionInput,
    concrete_class: &str,
    reinforcement_grade: &str,
    cage: &ReinforcementCage,
    situation: nen_en_1992_1_1::DesignSituation,
    branch: nen_en_1992_1_1::SteelBranch,
) -> Result<
    (
        ConcreteSection,
        DesignMaterial,
        &'static ConcreteClass,
        &'static ReinforcementGrade,
    ),
    String,
> {
    let section = section.build()?;
    let beton = concrete_class_by_name(concrete_class)
        .ok_or_else(|| format!("betonsterkteklasse {concrete_class} onbekend"))?;
    let staal = reinforcement_grade_by_name(reinforcement_grade)
        .ok_or_else(|| format!("wapeningsstaal {reinforcement_grade} onbekend"))?;
    cage.validate(&section)?;
    Ok((
        section,
        DesignMaterial::new(beton, staal, situation, branch),
        beton,
        staal,
    ))
}

// ═══════════════════════════════════════════════════════════════════════════
// Een toets die niet kan
// ═══════════════════════════════════════════════════════════════════════════

/// De twee toetsen van §7.3 die deze orchestrator uitvoert, met hun id, titel
/// en artikelverwijzing. Ze staan hier apart omdat ze ook als "niet
/// uitgevoerd" in het rapport moeten kunnen verschijnen, met exact dezelfde
/// id en titel als wanneer ze wél lopen — anders zou een rapport twee
/// verschillende namen voor dezelfde toets tonen.
const SCHEURTOETSEN: [(&str, &str, &str); 2] = [
    (
        "7.3.2_minimumwapening",
        "Minimumwapening voor scheurbeheersing",
        "art. 7.3.2(2) (7.1), (7.2) en (7.4)",
    ),
    (
        "7.3.4_scheurwijdte",
        "Scheurwijdte",
        "art. 7.3.4 (7.8)-(7.11), met de NB-bovengrens op (7.11)",
    ),
];

/// Idem voor §7.4.2.
const SLANKHEIDSTOETS: (&str, &str, &str) = (
    "7.4.2_slankheid",
    "Doorbuiging - grenswaarde van de slankheid l/d",
    "art. 7.4.2(2) (7.16), tabel 7.4N",
);

/// De reden bij een ontbrekende milieuklasse. Eén tekst, want hij komt bij
/// beide scheurtoetsen terug.
const GEEN_MILIEUKLASSE: &str =
    "de milieuklasse van tabel 4.1 is niet opgegeven. De nationale bijlage bij 7.3.1(5)      vervangt tabel 7.1N, en die tabel heeft de milieuklasse als enige ingang voor w_max;      er is met opzet geen standaardklasse, want die zou een scheurwijdte kunnen goedkeuren      die bij het werkelijke milieu veel te groot is.";

/// Een [`NamedCheck`] die alleen een reden draagt: dit gegeven ontbreekt, dus
/// deze toets is niet uitgevoerd.
///
/// Hij staat met opzet in `checks` en niet in een aparte lijst: dan verschijnt
/// hij vanzelf in de toetstabel van het rapport, met status "N/A" en de reden
/// eronder, op de plaats waar de lezer hem verwacht. Overslaan zou betekenen
/// dat een lege regel in het rapport niet te onderscheiden is van een toets
/// die wél is gedaan en slaagde.
fn niet_uitgevoerd(
    id: &str,
    title: &str,
    article: &str,
    force_state: ForceStateSnapshot,
    reden: String,
) -> NamedCheck {
    make_resistance(ResistanceCalc {
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
        status: CheckStatus::NotApplicable,
        notes: vec![reden],
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// De gescheurde doorsnede in de BGT — waar sigma_s vandaan komt
// ═══════════════════════════════════════════════════════════════════════════

/// De toestand van de GESCHEURDE doorsnede onder de frequente combinatie.
///
/// §7.3.4(2) vraagt sigma_s "uitgaande van een gescheurde doorsnede". Dat is
/// geen getal dat deze orchestrator verzint: het komt uit dezelfde
/// M-N-kappa-motor die de rest van de crate gebruikt, met
///
/// * (3.14) van 3.1.5 op **gemiddelde** waarden (f_cm, E_cm) — de basis die
///   3.1.5/7.4.3 voor de bruikbaarheidsgrenstoestand voorschrijft, en dus NIET
///   de rekenwaarden van de uiterste grenstoestand;
/// * betontrek **verwaarloosd** ([`ConcreteTension::None`]) — precies wat
///   "volledig gescheurd" in 7.4.3(3) betekent en wat 7.3.4 bedoelt;
/// * phi_ef = 0, dus zonder kruip. Kruip verlaagt E_c, verhoogt de drukzone en
///   VERLAAGT sigma_s; zonder kruip rekenen is hier dus de veilige kant.
struct BgtToestand {
    /// Het maatgevende punt uit de frequente envelop.
    punt: ForcePoint,
    /// sigma_s in de meest getrokken wapeningslaag, N/mm², trek positief.
    sigma_s_mpa: f64,
    /// Hoogte van de drukzone x vanaf de meest gedrukte rand, mm.
    x_mm: f64,
    /// Trekrek aan de boven- en onderrand (positief = trek). Bepaalt of er
    /// sprake is van buiging of van excentrische trek, zie (7.13).
    eps_trek_boven: f64,
    eps_trek_onder: f64,
    /// Ligt de trekzone onder?
    trek_onder: bool,
}

/// De gescheurde-doorsnedeberekening op ÉÉN snede van de frequente envelop.
///
/// De keuze van de snede zat vroeger in deze functie (het grootste |M|); zij
/// is eruit gehaald omdat §7.3.2 en §7.3.4 niet op dezelfde snede maatgevend
/// hoeven te zijn. Zie [`check_concrete_beam`] voor de rangschikking.
fn bgt_toestand_op(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    beton: &ConcreteClass,
    staal: &ReinforcementGrade,
    input: &ConcreteBeamCheckInput,
    punt: ForcePoint,
) -> Result<BgtToestand, String> {
    let m_knm = punt.forces.my_ed;
    let n_kn = punt.forces.n_ed;

    let mat_bgt = DesignMaterial::nonlinear(
        beton,
        staal,
        input.design_situation,
        input.steel_branch,
        NonlinearBasis::MeanValues,
        0.0,
    )
    .with_concrete_tension(ConcreteTension::None);

    let layers = cage.layers(section.h_mm);
    let opts = MnKappaOptions { n_strips: input.n_strips.max(1) as usize };
    let k = kappa_from_nm(section, &layers, &mat_bgt, n_kn, m_knm, &opts).map_err(|e| {
        format!(
            "de gescheurde doorsnede is onder de frequente combinatie (M = {m_knm:.1} kNm, \
             N = {n_kn:.1} kN) niet op te lossen: {e}. Zonder die oplossing is er geen \
             sigma_s, en er wordt niets aangenomen."
        )
    })?;

    // De crate rekent inwendig met DRUK POSITIEF; de trekspanning is dus −sigma.
    let sigma_s = k.state.sigma_s.iter().fold(0.0_f64, |m, &s| m.max(-s));
    Ok(BgtToestand {
        punt,
        sigma_s_mpa: sigma_s,
        // `x_mm` is `None` als de hele doorsnede onder trek staat; de drukzone
        // is dan nul, en dat is precies wat (h − x)/3 in h_c,ef nodig heeft.
        x_mm: k.state.x_mm.unwrap_or(0.0),
        eps_trek_boven: -k.state.eps_top,
        eps_trek_onder: -k.state.eps_bottom,
        trek_onder: m_knm >= 0.0,
    })
}

/// De reden waarom §7.3 niet kan als er geen frequente BGT-combinatie is
/// meegestuurd.
fn geen_bgt_envelop() -> String {
    format!(
        "er is geen krachtsverloop onder de frequente BGT-combinatie meegestuurd. \
         §7.3 vraagt de staalspanning in de gescheurde doorsnede onder de \
         {COMBINATIE_SCHEURWIJDTE}; die is uit de UGT-envelop niet af te leiden. Reken \
         NEN-EN 1990 uitdrukking (6.15) door en stuur het krachtsverloop mee in \
         `sls_frequent_envelope`. Er wordt hier met opzet geen UGT-spanning voor in de \
         plaats gezet: dat zou een andere en een verkeerde toets zijn."
    )
}

/// Hart-op-hartafstand van de staven in de TREKrij, afgeleid uit de korf.
///
/// **Zuivere meetkunde, geen normregel.** Eén rij, gelijkmatig verdeeld tussen
/// de beugelbenen: de buitenste staafassen liggen op c_nom + Ø_beugel + Ø/2
/// van hun eigen zijkant, dus
///
/// ```text
///   s = (b(z) − 2·(c_nom + Ø_beugel) − Ø) / (n − 1)
/// ```
///
/// Dit is dezelfde meetkunde die [`nen_en_1992_1_1::detaillering`] voor de
/// vrije afstand van §8.2(2) gebruikt (s = a_vrij + Ø); ze uiteen laten lopen
/// zou betekenen dat twee toetsen van dezelfde korf een andere staafafstand
/// zien. Bij één staaf in de rij is er geen afstand: dan `None`, en valt
/// 7.3.4 terug op (7.14) — precies zoals de module dat bedoelt.
fn staafafstand_uit_korf_mm(
    section: &ConcreteSection,
    cage: &ReinforcementCage,
    trek_onder: bool,
) -> Option<f64> {
    let rij = if trek_onder { &cage.bottom } else { &cage.top };
    if rij.count < 2 || rij.diameter_mm <= 0.0 {
        return None;
    }
    let z = if trek_onder {
        cage.axis_offset_mm(rij)
    } else {
        section.h_mm - cage.axis_offset_mm(rij)
    };
    let binnen = section.width_at_mm(z) - 2.0 * (cage.cover_mm + cage.stirrup_diameter_mm);
    let s = (binnen - rij.diameter_mm) / (rij.count as f64 - 1.0);
    if s > 0.0 {
        Some(s)
    } else {
        None
    }
}

pub fn check_concrete_beam(input: ConcreteBeamCheckInput) -> ConcreteBeamCheckResult {
    let (section, mat, beton, staal) = match setup(
        &input.section,
        &input.concrete_class,
        &input.reinforcement_grade,
        &input.cage,
        input.design_situation,
        input.steel_branch,
    ) {
        Ok(v) => v,
        Err(e) => return error_result(&input, e),
    };
    let opts = MnKappaOptions { n_strips: input.n_strips.max(1) as usize };
    let layers = input.cage.layers(section.h_mm);

    // ── De sneden ──────────────────────────────────────────────────────────
    //
    // `gov_bending` is het punt met het GROOTSTE MOMENT, en dat blijft het:
    // §7.4.2(2) schrijft met zoveel woorden voor dat de wapeningsverhouding
    // rho "in het midden van de overspanning (bij uitkragingen ter plaatse van
    // de oplegging)" wordt genomen, en het grootste |M| is daar de
    // benadering van. Het is óók de snede waarop de negen detailleringseisen
    // worden afgedrukt; zie de aantekening bij blok 6.
    //
    // De doorsnedetoetsen kiezen hun eigen snede, en die kiezen op de UNITY
    // CHECK — zie de moduledoc en de zoekers hierboven.
    let gov_bending = governing_for(&input.forces_envelope, |f| f.my_ed.abs() + f.n_ed.abs() * 0.01);
    let bend_state = ForceStateSnapshot::from_point(&gov_bending);

    let mut checks: Vec<NamedCheck> = Vec::new();

    // 1. Buiging met de rechthoekige spanningsverdeling (handberekening),
    //    op de snede met de hoogste unity check.
    let buiging = buigoverzicht(&section, &input.cage, &mat, &input.forces_envelope);
    let mut blok = check_bending_stress_block(
        &section,
        &input.cage,
        &mat,
        ForceStateSnapshot::from_point(&buiging.punt),
    );
    blok.notes.push(snedemelding(
        "De maatgevende snede is gezocht op de UNITY CHECK en niet op het grootste moment: \
         M_Rd hangt via het TEKEN van M_Ed af van welke wapeningsrij op trek staat, en bij een \
         asymmetrische korf scheelt dat een factor.",
        &buiging.punt,
        input.forces_envelope.len(),
    ));
    if buiging.aantal_niet_toepasbaar > 0 {
        blok.notes.push(format!(
            "Op {} van de {} sneden van de omhullende is de rechthoekige spanningsverdeling niet \
             van toepassing (de doorsnede staat daar geheel onder druk, of de trek overschrijdt de \
             trekcapaciteit van de wapening). Die sneden doen aan deze toets niet mee. Art. 6.1 \
             blijft er wél getoetst: de M-N-κ-toets hieronder kent de geheel gedrukte doorsnede \
             (draaipunt C van figuur 6.1) en neemt ze wél mee.",
            buiging.aantal_niet_toepasbaar,
            input.forces_envelope.len()
        ));
    }
    checks.push(make_resistance(blok));

    // 2. M-N-κ. Eén afgevaardigde per (teken van M_Ed; N_Ed) — zie
    //    `sneden_mn_kappa` voor waarom dat exact is en niet benaderend.
    let (mn_sneden, mn_voorgeselecteerd) =
        sneden_mn_kappa(&section, &input.cage, &mat, &input.forces_envelope);
    let mut mn_beste: Zwaarste<_> = Zwaarste::nieuw();
    for p in &mn_sneden {
        let kandidaat = check_mn_kappa(
            &section,
            &input.cage,
            &mat,
            &opts,
            input.apply_min_eccentricity,
            ForceStateSnapshot::from_point(p),
        );
        let zwaarte = zwaarte_van(&kandidaat.calc, p.forces.my_ed.abs());
        mn_beste.bied(zwaarte, (kandidaat, *p));
    }
    let (mut mn, mn_punt) = match mn_beste.uitkomst() {
        Some(v) => v,
        // Alleen bij een lege omhullende. Dan is er niets te kiezen en levert
        // het nulpunt de toets met M_Ed = 0.
        None => {
            let p = gov_bending;
            (
                check_mn_kappa(
                    &section,
                    &input.cage,
                    &mat,
                    &opts,
                    input.apply_min_eccentricity,
                    ForceStateSnapshot::from_point(&p),
                ),
                p,
            )
        }
    };
    mn.calc.notes.push(format!(
        "{} Van de {} sneden van de omhullende blijven er {} over die elkaars uitkomst niet \
         herhalen: M_Rd hangt alleen van het TEKEN van M_Ed en van N_Ed af, dus sneden die daarin \
         gelijk zijn hebben dezelfde weerstand en wint binnen die groep de grootste |M_Ed| — ook \
         na de minimale excentriciteit van 6.1(4), want |N_Ed|·e₀ is binnen de groep gelijk.{}",
        snedemelding(
            "De maatgevende snede is gezocht op de UNITY CHECK.",
            &mn_punt,
            input.forces_envelope.len()
        ),
        input.forces_envelope.len(),
        mn_sneden.len(),
        if mn_voorgeselecteerd {
            format!(
                " LET OP: er bleven méér dan {MAX_MN_KAPPA_SNEDEN} groepen over. Er is daarom \
                 voorgeselecteerd op de goedkope spanningsblokweerstand en zijn alleen de \
                 {MAX_MN_KAPPA_SNEDEN} hoogste groepen volledig doorgerekend. Die voorselectie is \
                 een SCHATTING en geen bovengrens; de gerapporteerde unity check kan daardoor bij \
                 hoge uitzondering onder de werkelijke maximale unity check liggen."
            )
        } else {
            String::new()
        }
    ));
    let diagram = mn.diagram.clone();
    checks.push(make_resistance(mn.calc));

    // ── 3. Dwarskracht (§6.2) ──────────────────────────────────────────────
    //
    // Geen enkele optie ingevuld: A_sl uit de korf, cot θ automatisch binnen
    // de NB-grenzen, z = 0,9·d (alleen zonder normaalkracht) en géén
    // vermindering volgens 6.2.2(6) — voor die laatste heeft een doorsnedetoets
    // de gegevens niet, en niet toepassen is de veilige kant. De module meldt
    // elk van die keuzes zelf in haar afleiding.
    let shear_opts = ShearOptions::default();
    // ÉÉN KEER LANGS DE HELE OMHULLENDE. Dat levert in één gang de maatgevende
    // snede (op de unity check, niet op |V_Ed| — zie `dwarskrachtoverzicht`)
    // en de drie grootheden waar §9.2.2 op leunt.
    let dwars =
        dwarskrachtoverzicht(&section, &input.cage, &mat, &input.forces_envelope, &shear_opts);
    let gov_shear = dwars.punt;
    let shear_state = ForceStateSnapshot::from_point(&gov_shear);
    let mut shear_calc = check_shear(&section, &input.cage, &mat, shear_state, &shear_opts);
    // WELK PUNT ER IS GETOETST, MET HET MOMENT ERBIJ — en dat laatste is geen
    // opsmuk. De dwarskrachtmodule leest aan het TEKEN van M_Ed af welke rij op
    // trek staat, en daarmee zowel d als A_sl. Bij een vrij opgelegde ligger is
    // het moment bij het steunpunt nul, en dan beslist het laatste cijfer van
    // de oplosser (−1·10⁻¹⁴ is negatief) welke rij dat wordt. Dat is de VEILIGE
    // kant — de kleinste A_sl geeft de laagste V_Rd,c — maar de lezer hoort te
    // kunnen zien dat het moment daar nul was, in plaats van zich af te vragen
    // waarom de bovenwapening meetelt.
    shear_calc.notes.push(format!(
        "{} De grootste |V_Ed| van de omhullende is {:.1} kN; de snede hierboven hoeft dat niet \
         te zijn. V_Rd,c rekent namelijk met d en met A_sl van de zijde die op TREK staat, en \
         welke zijde dat is leest de module aan het TEKEN van M_Ed af. Een snede met iets minder \
         dwarskracht maar een veel kleinere A_sl kan daardoor een HOGERE unity check hebben dan \
         de zwaarst belaste snede; zoeken op |V_Ed| zou die stilzwijgend overslaan. Ligt M_Ed op \
         de gekozen snede op nul, zoals bij het steunpunt van een vrij opgelegde ligger, dan is \
         de trekzijde uit het moment niet te bepalen en volgt de toets het teken dat de oplosser \
         levert; de rij die daarbij wordt gekozen staat hierboven bij A_sl. Geef A_sl zelf op als \
         de werkelijke doorlopende trekwapening daarvan afwijkt.",
        snedemelding(
            "De maatgevende snede is gezocht op de UNITY CHECK en niet op de grootste |V_Ed|.",
            &gov_shear,
            dwars.aantal_sneden
        ),
        dwars.v_ed_max_kn,
    ));
    checks.push(make_resistance(shear_calc));

    // ── 4. Scheurbeheersing (§7.3) ─────────────────────────────────────────
    //
    // Dit is de enige plaats in de hele toetsing waar de BRUIKBAARHEIDS-
    // grenstoestand meedoet, en wel met de FREQUENTE combinatie (6.15) die de
    // nationale bijlage bij 7.3.1(5) voorschrijft.
    //
    // ELKE SNEDE VAN DE FREQUENTE ENVELOP wordt doorgerekend, en de twee
    // toetsen kiezen ELK HUN EIGEN maatgevende snede. Dat zijn niet
    // noodzakelijk dezelfde: §7.3.4 loopt met sigma_s mee en dus met M, terwijl
    // §7.3.2 A_s,min tegen de AANWEZIGE trekwapening afzet en dus vooral aan de
    // TREKZIJDE hangt. Bij de referentiekorf (onder 3Ø16 = 603 mm², boven
    // 2Ø12 = 226 mm²) geeft dezelfde A_s,min aan de bovenzijde een 2,7 keer
    // hogere unity check dan aan de onderzijde; het grootste |M| wijst die
    // snede niet aan.
    //
    // Dat mag ook: de gescheurde-doorsnedeberekening kost ongeveer 15 µs en de
    // twee toetsen samen nog eens 12 µs, dus een frequente envelop van 21
    // stations kost hier ordegrootte een halve milliseconde.
    let scheur_state_bij_fout = bend_state;
    let klasse_ontbreekt = input.exposure_class.is_none();
    let mut beste_min: Zwaarste<ResistanceCalc> = Zwaarste::nieuw();
    let mut beste_wijdte: Zwaarste<ResistanceCalc> = Zwaarste::nieuw();
    let mut eerste_bgt_fout: Option<String> = None;
    let mut aantal_bgt_fout = 0usize;

    if let Some(klasse) = input.exposure_class {
        for p in &input.sls_frequent_envelope {
            let b = match bgt_toestand_op(&section, &input.cage, beton, staal, &input, *p) {
                Ok(b) => b,
                Err(e) => {
                    aantal_bgt_fout += 1;
                    eerste_bgt_fout.get_or_insert(e);
                    continue;
                }
            };
            let scheur_state = ForceStateSnapshot::from_point(&b.punt);

            let (staafafstand, s_bron) = match input.bar_spacing_mm {
                Some(s) => (Some(s), format!("opgegeven: s = {s:.0} mm")),
                None => match staafafstand_uit_korf_mm(&section, &input.cage, b.trek_onder) {
                    Some(s) => (
                        Some(s),
                        format!(
                            "afgeleid uit de korf: s = {s:.0} mm (zuivere meetkunde — één rij, \
                             gelijkmatig verdeeld tussen de beugelbenen; dit staat niet zo in de \
                             norm)"
                        ),
                    ),
                    None => (
                        None,
                        "niet bekend: de trekrij telt minder dan twee staven. (7.11) is dan niet \
                         te gebruiken en 7.3.4 valt terug op (7.14)"
                            .to_string(),
                    ),
                },
            };

            let mut inv =
                Scheurinvoer::buiging(b.sigma_s_mpa, b.x_mm, klasse, Belastingsduur::Langdurend);
            // (7.4) vraagt N_Ed met DRUK POSITIEF; de envelop levert trek
            // positief. Deze omkering staat op één plaats en nergens anders.
            inv.n_ed_druk_positief_n = -b.punt.forces.n_ed * 1e3;
            inv.axiale_trek = b.punt.forces.n_ed > 0.0;
            inv.trek_onder = b.trek_onder;
            inv.staafafstand_mm = staafafstand;
            // k_2 volgens (7.13) zodra BEIDE randen onder trek staan — dan is
            // het excentrische trek en niet buiging, en is k_2 = 0,5 te
            // gunstig (k_2 staat in de teller van (7.11)). Welke van de twee
            // het is, volgt uit de randrekken van de gescheurde doorsnede en
            // is dus mechanica, geen keuze.
            if b.eps_trek_boven > 0.0 && b.eps_trek_onder > 0.0 {
                inv.rekverdeling = Rekverdeling::ExcentrischeTrek {
                    eps_1: b.eps_trek_boven.max(b.eps_trek_onder),
                    eps_2: b.eps_trek_boven.min(b.eps_trek_onder),
                };
            }

            let g = Scheurgegevens {
                section: &section,
                cage: &input.cage,
                beton,
                staal,
                invoer: &inv,
            };
            // Waar sigma_s vandaan komt, hoort in de afleiding te staan en niet
            // alleen in deze code: anders leest een constructeur een
            // scheurwijdte zonder te zien onder welke belasting hij hoort.
            let herkomst = vec![
                format!(
                    "sigma_s en x komen uit de GESCHEURDE doorsnede onder de {}: combinatie {} \
                     op x = {} mm, M = {:.1} kNm en N = {:.1} kN (trek positief) geven \
                     sigma_s = {:.1} N/mm² en x = {:.1} mm. Gerekend met (3.14) van 3.1.5 op \
                     gemiddelde waarden (f_cm, E_cm), betontrek verwaarloosd en zonder kruip \
                     (phi_ef = 0); kruip zou x verhogen en sigma_s verlagen, dus dit is de \
                     veilige kant.",
                    COMBINATIE_SCHEURWIJDTE,
                    b.punt.combination_id,
                    b.punt.position_mm.round() as i64,
                    b.punt.forces.my_ed,
                    b.punt.forces.n_ed,
                    b.sigma_s_mpa,
                    b.x_mm,
                ),
                format!(
                    "Deze snede is uit de {} sneden van de frequente envelop gekozen op de UNITY \
                     CHECK van DEZE toets, en niet op het grootste moment. De twee toetsen van \
                     §7.3 kunnen daardoor op verschillende sneden staan: de scheurwijdte loopt \
                     met sigma_s mee, terwijl de minimumwapening tegen de AANWEZIGE trekwapening \
                     wordt afgezet en dus vooral aan de trekzijde hangt.",
                    input.sls_frequent_envelope.len()
                ),
                format!(
                    "Hart-op-hartafstand van de trekstaven — {s_bron}. Zij bepaalt of (7.11) \
                     mag worden gebruikt (voorwaarde s <= 5(c + Ø/2)) en of tabel 7.3N te \
                     lezen is."
                ),
                "k_t = 0,4 (langdurende belasting, 7.3.4(2)). De frequente combinatie draagt de \
                 blijvende belasting mee, dus \"een enkele kortdurende belasting\" is hier niet \
                 aan de orde; 0,4 geeft bovendien het grootste rekverschil in (7.9) en dus de \
                 grootste scheurwijdte."
                    .to_string(),
                "k_1 = 0,8: aangenomen is geribd wapeningsstaal (hoge aanhechting). Bijlage C \
                 kent alleen geribde staven, en het staalmodel van deze app draagt geen \
                 oppervlaktetype. Voor een staaf met een in wezen glad oppervlak geldt \
                 k_1 = 1,6 en is deze toets te gunstig."
                    .to_string(),
                "De tabelweg van 7.3.3 (\"zonder directe berekening\") is NIET daarnaast \
                 uitgevoerd. 7.3.3(2) en 7.3.4 zijn alternatieven — hier is de DIRECTE \
                 berekening gemaakt — en ze allebei afrekenen zou een unity check opleveren die \
                 de norm niet vraagt."
                    .to_string(),
            ];
            let mut minimumwapening = check_minimumwapening(&g, None, None, scheur_state);
            let mut scheurwijdte = check_scheurwijdte_berekend(&g, scheur_state);
            minimumwapening.notes.extend(herkomst.iter().cloned());
            scheurwijdte.notes.extend(herkomst);
            let belasting = p.forces.my_ed.abs();
            beste_min.bied(zwaarte_van(&minimumwapening, belasting), minimumwapening);
            beste_wijdte.bied(zwaarte_van(&scheurwijdte, belasting), scheurwijdte);
        }
    }

    match (beste_min.uitkomst(), beste_wijdte.uitkomst()) {
        (Some(mut minimumwapening), Some(mut scheurwijdte)) => {
            // Sneden waar de gescheurde doorsnede niet op te lossen was, zijn
            // overgeslagen. Dat is geen detail: op die sneden is §7.3 dus NIET
            // getoetst, en dat hoort er onverbloemd bij te staan.
            if aantal_bgt_fout > 0 {
                let melding = format!(
                    "LET OP: op {} van de {} sneden van de frequente envelop was de gescheurde \
                     doorsnede niet op te lossen; die sneden zijn overgeslagen en daar is §7.3 \
                     dus NIET getoetst. De eerste reden luidde: {}",
                    aantal_bgt_fout,
                    input.sls_frequent_envelope.len(),
                    eerste_bgt_fout.clone().unwrap_or_default()
                );
                minimumwapening.notes.push(melding.clone());
                scheurwijdte.notes.push(melding);
            }
            checks.push(make_resistance(minimumwapening));
            checks.push(make_resistance(scheurwijdte));
        }
        // Geen enkele snede leverde een uitkomst: dan geldt voor beide toetsen
        // dezelfde reden, en die reden is samengesteld uit wat er ontbrak.
        _ => {
            let bgt_reden = if input.sls_frequent_envelope.is_empty() {
                Some(geen_bgt_envelop())
            } else {
                eerste_bgt_fout
            };
            let reden = match (klasse_ontbreekt, bgt_reden) {
                (false, Some(e)) => e,
                (true, None) => GEEN_MILIEUKLASSE.to_string(),
                (true, Some(e)) => {
                    format!("er ontbreken twee gegevens. (1) {GEEN_MILIEUKLASSE} (2) En {e}")
                }
                // Er is een milieuklasse en er is geen enkele fout gemeld: dan
                // was de envelop leeg, en dat is hierboven al afgevangen.
                (false, None) => geen_bgt_envelop(),
            };
            for (id, title, article) in SCHEURTOETSEN {
                checks.push(niet_uitgevoerd(
                    id,
                    title,
                    article,
                    scheur_state_bij_fout,
                    reden.clone(),
                ));
            }
        }
    }

    // ── 5. Slankheid (§7.4.2) ──────────────────────────────────────────────
    let (slank_id, slank_title, slank_article) = SLANKHEIDSTOETS;
    match input.structural_system {
        None => checks.push(niet_uitgevoerd(
            slank_id,
            slank_title,
            slank_article,
            bend_state,
            "de constructievorm van tabel 7.4N is niet opgegeven. Of een staaf een vrij \
             opgelegde ligger, een eind- of tussenveld, een vlakke plaatvloer of een uitkraging \
             is, hangt van de constructie af en niet van de staaf; een raamwerkmodel kent dat \
             onderscheid niet. Zonder K is er geen grenswaarde voor l/d en wordt er niets \
             aangenomen."
                .to_string(),
        )),
        Some(system) => {
            let trek_onder = gov_bending.forces.my_ed >= 0.0;
            let d_mm = if trek_onder {
                input.cage.d_mm(section.h_mm)
            } else {
                section.h_mm - input.cage.d2_mm()
            };
            let a_s_prov = if trek_onder {
                input.cage.a_s_bottom_mm2()
            } else {
                input.cage.a_s_top_mm2()
            };
            match benodigde_trekwapening_mm2(
                &section,
                &input.cage,
                &mat,
                gov_bending.forces.my_ed,
                gov_bending.forces.n_ed,
            ) {
                Err(e) => checks.push(niet_uitgevoerd(
                    slank_id,
                    slank_title,
                    slank_article,
                    bend_state,
                    format!(
                        "de vereiste trekwapening A_s,req is niet te bepalen: {e}. Zonder \
                         A_s,req is er geen wapeningsverhouding rho voor (7.16) en geen (7.17)."
                    ),
                )),
                Ok(a_s_req) => {
                    // rho = A_s,req/(b_w·d). DE NORM ZEGT NIET t.o.v. WELKE
                    // BREEDTE, en de slankheidsmodule kiest daarom niet. Hier
                    // wél, want er moet een getal in: de LIJFbreedte b_w, de
                    // breedte die de doorsnede over haar volle hoogte heeft.
                    // Bij een rechthoek is dat b en is er geen keuze; bij een
                    // T geeft b_w een HOGERE rho dan de flensbreedte en dus
                    // een LAGERE grenswaarde voor l/d — de veilige kant. De
                    // keuze staat hieronder in de afleiding.
                    let b_w = section.b_w_mm();
                    let rho = if b_w > 0.0 && d_mm > 0.0 {
                        a_s_req / (b_w * d_mm)
                    } else {
                        0.0
                    };
                    let req = SlendernessRequest {
                        beam_id: input.beam_id,
                        system,
                        f_ck_mpa: beton.f_ck,
                        span_mm: input.length_m * 1000.0,
                        d_mm,
                        rho,
                        // Drukwapening telt NIET mee in (7.16.b). Dat is de
                        // veilige kant: rho' verhoogt zowel de tweede als de
                        // derde term en dus de grenswaarde. Welk deel van de
                        // bovenwapening rekenkundig VEREIST is, weet deze
                        // orchestrator niet — alleen wat er ligt.
                        rho_prime: 0.0,
                        sigma_s_mpa: None,
                        f_yk_mpa: Some(staal.f_yk),
                        a_s_req_mm2: Some(a_s_req),
                        a_s_prov_mm2: Some(a_s_prov),
                        b_flange_mm: section.b_mm,
                        b_web_mm: b_w,
                        l_eff_mm: None,
                        carries_brittle_partitions: None,
                        n_ed_kn: Some(gov_bending.forces.n_ed),
                    };
                    let mut calc = check_span_depth_ratio(&req, bend_state);
                    calc.notes.push(format!(
                        "rho = A_s,req/(b_w·d) = {a_s_req:.0}/({b_w:.0}·{d_mm:.0}) = {rho:.5}. \
                         A_s,req is de trekwapening die volgens §6.1 nodig is voor het \
                         maatgevende UGT-punt (M = {:.1} kNm, N = {:.1} kN), numeriek omgekeerd \
                         uit de rechthoekige spanningsverdeling. De norm laat in het midden ten \
                         opzichte van welke breedte rho is genomen; hier is de LIJFbreedte b_w \
                         gebruikt — bij een rechthoek is dat b, bij een T geeft het een hogere \
                         rho en dus een lagere grenswaarde voor l/d.",
                        gov_bending.forces.my_ed, gov_bending.forces.n_ed,
                    ));
                    calc.notes.push(format!(
                        "rho' = 0: de drukwapening telt niet mee. Wat er rekenkundig aan \
                         drukwapening VEREIST is, volgt niet uit deze toetsing; er ligt \
                         {:.0} mm² aan de drukzijde. rho' weglaten verlaagt de grenswaarde en is \
                         dus de veilige kant.",
                        if trek_onder {
                            input.cage.a_s_top_mm2()
                        } else {
                            input.cage.a_s_bottom_mm2()
                        }
                    ));
                    checks.push(make_resistance(calc));
                }
            }
        }
    }

    // ── 6. Detaillering (§9.2.1, §9.2.2 en §8.2) ───────────────────────────
    //
    // Negen eisen. Acht ervan gaan over de STAAF en niet over een snede: de
    // beugeldiameter, de balkbreedte, de vrije staafafstand, de
    // wapeningsverhouding van de beugels, A_s,max — dat zijn maten van de korf
    // die langs de hele staaf gelijk zijn. Zij blijven daarom op het punt met
    // het grootste moment staan, en er wordt voor hen geen snede gezocht.
    //
    // Drie grootheden die zij van §6.2 krijgen gelden wél voor de HELE staaf,
    // en die worden hier dus ook zo bepaald — niet meer uit één snede:
    //
    // * `dwarskrachtwapening_vereist` — de vraag is of er ERGENS in de staaf
    //   rekenkundig dwarskrachtwapening nodig is. Uit één snede aflezen kan
    //   dat missen: de snede met de hoogste dwarskracht-unity-check kan in het
    //   betonspoor liggen terwijl een andere snede juist wél in het
    //   vakwerkspoor valt (V_Ed/V_Rd,c > 1 daar, maar met een ruime
    //   beugelweerstand een lage unity check). Dan zou s_l,max in de ruime tak
    //   van 300 mm belanden waar de strengere tak min(0,75·d; 300) hoort.
    // * `v_ed_kn` — de grootste |V_Ed| van de staaf: dát is de dwarskracht die
    //   de beugels het zwaarst belast.
    // * `v_rd_max_kn` — de KLEINSTE V_Rd,max van de staaf. De tak van s_t,max
    //   hangt aan V_Ed ≤ 0,5·V_Rd,max, en de grootste V_Ed naast de kleinste
    //   V_Rd,max is de veilige lezing van die voorwaarde.
    let detail_invoer = DetailleringInvoer {
        section: &section,
        cage: &input.cage,
        mat: &mat,
        f_ctm_mpa: beton.f_ctm,
        force_state: bend_state,
        d_g_mm: input.aggregate_size_mm,
        dwarskrachtwapening_vereist: Some(dwars.ergens_vakwerkspoor),
        v_ed_kn: Some(dwars.v_ed_max_kn),
        // `None` zodra het vakwerkmodel nergens kon worden opgebouwd — dan is
        // er geen V_Rd,max en zegt de toets dat, in plaats van in de ruime tak
        // van 500 mm te belanden.
        v_rd_max_kn: dwars.v_rd_max_min_kn,
        blijvend_bekiste_oppervlakken: None,
        dubbel_wapeningsnet: None,
    };
    for c in detailleringstoetsen(&detail_invoer) {
        // DE NEGENDE EIS IS WÉL SNEDE-AFHANKELIJK. §9.2.1.1(1) zet A_s,min af
        // tegen de AANWEZIGE trekwapening, en welke rij dat is volgt uit het
        // teken van M_Ed. Bij de referentiekorf geeft dezelfde A_s,min aan de
        // bovenzijde (2Ø12 = 226 mm²) een 2,7 keer hogere unity check dan aan
        // de onderzijde (3Ø16 = 603 mm²). A_s,min zelf hangt bovendien via de
        // minimumcombinatie van (M_Ed; N_Ed) af. Op de snede met het grootste
        // moment blijven staan zou de trekzijde met de minste wapening kunnen
        // overslaan — en een FALENDE detailleringseis is wél maatgevend voor de
        // staaf, dus dat is niet vrijblijvend.
        if c.id == "9.2.1.1_as_min" {
            checks.push(make_resistance(as_min_over_omhullende(
                &detail_invoer,
                &input.forces_envelope,
                c,
            )));
        } else {
            checks.push(make_resistance(c));
        }
    }

    // 7. Interactiediagrammen voor de weergave (grover: 21 punten).
    let inter_opts = MnKappaOptions { n_strips: opts.n_strips.min(50) };
    let interaction_positive = interaction_diagram(&section, &layers, &mat, 1.0, 21, &inter_opts);
    let interaction_negative = interaction_diagram(&section, &layers, &mat, -1.0, 21, &inter_opts);

    // 8. Aggregatie. De maatgevende toets van een staaf kan de buiging, de
    //    dwarskracht, de scheurwijdte, de slankheid of een FALENDE
    //    detailleringseis zijn. Een detailleringseis waaraan wordt voldaan
    //    doet niet mee: zie [`mag_maatgevend_zijn`] voor het waarom.
    //
    //    `uc_max` volgt dezelfde keuze, en dat moet ook: het rapport zet in de
    //    samenvattingstabel de kolommen "UC" en "Governing" naast elkaar. Zou
    //    uc_max wél de vervulde detailleringseis tonen, dan stond er een
    //    getal van de ene toets naast de naam van een andere. Veilig blijft
    //    het: een detailleringseis die voldoet heeft per definitie uc ≤ 1, dus
    //    deze keuze kan uc_max alleen verlagen binnen het gebied waar de staaf
    //    toch al voldoet — nooit een overschrijding wegpoetsen.
    let mut uc_max = 0.0_f64;
    let mut governing_check_id = String::new();
    for c in &checks {
        let uc = uc_of(c);
        if uc > uc_max && mag_maatgevend_zijn(c) {
            uc_max = uc;
            governing_check_id = c.id.clone();
        }
    }
    let status = if uc_max <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk };

    ConcreteBeamCheckResult {
        beam_id: input.beam_id,
        section_name: section.name(),
        // Dezelfde aanroep als in `checks.rs`, dus letterlijk dezelfde teksten
        // als vooraan in de notes van elke toets — één bron, geen tweede versie.
        shape_assumptions: section.assumptions(),
        concrete_class: mat.concrete_name.to_string(),
        reinforcement_grade: mat.steel_name.to_string(),
        reinforcement_summary: input.cage.summary(),
        a_s_bottom_mm2: input.cage.a_s_bottom_mm2(),
        a_s_top_mm2: input.cage.a_s_top_mm2(),
        d_mm: input.cage.d_mm(section.h_mm),
        f_cd_mpa: mat.f_cd(),
        f_yd_mpa: mat.f_yd(),
        checks,
        uc_max,
        status,
        governing_check_id,
        mn_kappa: Some(diagram),
        interaction_positive,
        interaction_negative,
    }
}

pub fn check_all_concrete_beams(inputs: Vec<ConcreteBeamCheckInput>) -> Vec<ConcreteBeamCheckResult> {
    inputs.into_iter().map(check_concrete_beam).collect()
}

/// M-N-κ-diagram en interactiediagram voor een korf, los van een staaf.
pub fn mn_kappa(req: MnKappaRequest) -> Result<MnKappaResponse, String> {
    let (section, mat, _beton, _staal) = setup(
        &req.section,
        &req.concrete_class,
        &req.reinforcement_grade,
        &req.cage,
        req.design_situation,
        req.steel_branch,
    )?;
    let opts = MnKappaOptions { n_strips: req.n_strips.max(1) as usize };
    let layers = req.cage.layers(section.h_mm);
    let diagram = mn_kappa_diagram(&section, &layers, &mat, req.n_ed_kn, req.moment_sign, &opts);
    let (interaction_positive, interaction_negative) = if req.interaction_points >= 3 {
        let inter_opts = MnKappaOptions { n_strips: opts.n_strips.min(50) };
        (
            interaction_diagram(&section, &layers, &mat, 1.0, req.interaction_points as usize, &inter_opts),
            interaction_diagram(&section, &layers, &mat, -1.0, req.interaction_points as usize, &inter_opts),
        )
    } else {
        (vec![], vec![])
    };
    Ok(MnKappaResponse {
        section_name: section.name(),
        reinforcement_summary: req.cage.summary(),
        f_cd_mpa: mat.f_cd(),
        f_yd_mpa: mat.f_yd(),
        d_mm: req.cage.d_mm(section.h_mm),
        a_s_bottom_mm2: req.cage.a_s_bottom_mm2(),
        a_s_top_mm2: req.cage.a_s_top_mm2(),
        n_rd_compression_kn: axial_compression_capacity_kn(&section, &layers, &mat, &opts),
        n_rd_tension_kn: axial_tension_capacity_kn(&layers, &mat),
        diagram,
        interaction_positive,
        interaction_negative,
    })
}
