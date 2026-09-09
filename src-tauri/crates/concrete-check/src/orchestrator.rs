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
//! # Met WELKE KORF een toets wordt uitgevoerd
//!
//! Een snede is niet alleen een plaats maar ook een KORF. De wapening mag langs
//! de staaf verschillen — de onderwapening kort in (§9.2.1.3), de beugels
//! verdichten bij het steunpunt (§9.2.2) — en `ConcreteBeamCheckInput` draagt
//! dat als `reinforcement_zones`. Elke doorsnedetoets krijgt op elke snede de
//! korf die dáár geldt, en de acht detailleringseisen die de korf lezen worden
//! per STUK STAAF afgerekend. Zie het blok "De wapeningszones" hieronder voor
//! hoe die stukken worden gemaakt, en de tabel boven [`DetailBasis`] voor welke
//! eis bij een zone hoort en welke bij het element.
//!
//! **Lege zonelijsten geven exact het gedrag van vóór die aansluiting**: dan is
//! er één stuk dat de hele staaf beslaat met de korf uit `cage`, valt elk
//! krachtenpunt daar precies één keer in, en is elke reeks letterlijk de
//! omhullende zoals zij binnenkwam.
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
//!
//! # Wat de WAPENINGSZONES daar bovenop kosten
//!
//! Sinds de toetsen de zones lezen is een snede een krachtenpunt PLUS de korf
//! die daar geldt, en groeit het aantal sneden op twee manieren: een punt dat op
//! een zonegrens ligt telt twee keer mee (met de korf links en met de korf
//! rechts), en de M-N-κ-groepering krijgt de korf in haar sleutel, zodat twee
//! sneden met hetzelfde teken en dezelfde N_Ed maar een andere korf niet meer
//! samenvallen.
//!
//! Gemeten op dezelfde referentiebalk (release-bouw, n_strips = 50) met VIER
//! vakken die elk een andere korf dragen — de dure kant, want een symmetrische
//! indeling 3-5-3 levert maar twee verschillende korven — tegenover diezelfde
//! balk zonder zones:
//!
//! | omhullende | sneden | M-κ-groepen | zonder zones | met 4 vakken |
//! |---|---|---|---|---|
//! | 1 combinatie (21 punten) | 21 → 24 | 1 → 4 | 140 ms | 149 ms |
//! | 5 combinaties (105) | 105 → 120 | 1 → 4 | 141 ms | 150 ms |
//! | 20 combinaties (420) | 420 → 480 | 1 → 4 | 151 ms | 164 ms |
//! | 50 combinaties (1050) | 1050 → 1200 | 1 → 4 | 175 ms | 190 ms |
//!
//! De vaste opslag van ongeveer 9 ms zijn de DRIE extra M-κ-diagrammen (vier
//! korven in plaats van één); die groeit met het aantal VERSCHILLENDE korven en
//! niet met de omhullende. Wat er daarnaast bij komt loopt met de omhullende
//! mee — 14 % meer sneden geeft 14 % meer dwarskracht-, buig- en A_s,min-werk —
//! en dat is bij vijftig combinaties nog eens 6 ms. De meting staat als
//! `wat_de_zones_kosten` in `tests/wapeningszones.rs` en is daar opnieuw te
//! draaien.

use std::collections::HashMap;

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::bending::stress_block;
use nen_en_1992_1_1::checks::{check_bending_stress_block, check_mn_kappa};
// De negen detailleringseisen worden hier STUK VOOR STUK aangeroepen en niet
// meer als één `detailleringstoetsen(&inv)`. Reden: acht van de negen lezen de
// KORF, en die verschilt sinds de wapeningszones per stuk staaf; alleen de
// balkbreedte van NB §9.2(1) leest hem niet. De volgorde waarin ze in het
// rapport komen is onveranderd die van `detailleringstoetsen`; zie het blok
// "6. Detaillering" in [`check_concrete_beam`].
use nen_en_1992_1_1::detaillering::{
    as_max_9_2_1_1, as_min_9_2_1_1, benodigde_trekwapening_mm2, is_detailleringstoets,
    min_balkbreedte_9_2, min_diameter_beugel_9_2_2, min_diameter_langsstaaf_9_2_1_1,
    rho_w_min_9_2_2, s_l_max_9_2_2, s_t_max_9_2_2, vrije_staafafstand_8_2, DetailleringInvoer,
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
    ReinforcementGrade, ReinforcementZones, ZONE_TOLERANCE_MM,
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

// ═══════════════════════════════════════════════════════════════════════════
// De wapeningszones — welke korf op welke plaats geldt
// ═══════════════════════════════════════════════════════════════════════════
//
// WAAROM DIT BLOK BESTAAT
// [`ReinforcementZones`] beschrijft de wapening die LANGS de staaf verandert:
// de onderwapening die in het veld inkort (§9.2.1.3) en de beugels die bij het
// steunpunt verdichten (§9.2.2). Dat model reisde al door de hele keten, maar
// werd nergens gelezen: elke toets rekende met de ENE korf van de staaf. Een
// staaf met 5Ø16 in het veld en 3Ø16 bij het steunpunt werd dus overal met de
// korf van de invoer getoetst, en welke van de twee dat was hing af van wat de
// gebruiker in `cage` had gezet. Het rapport was daarmee niet fout te noemen —
// het hoorde alleen bij een andere balk.
//
// DE VERTALING IS EENVOUDIG: een SNEDE is voortaan een krachtenpunt PLUS de
// korf die op die plaats geldt. Alle bestaande zoekers (de zwaarste snede op
// de unity check) blijven werken; ze krijgen alleen per snede een andere korf
// mee.
//
// LEEG BLIJFT LEEG. Zonder zones is er één vak dat de hele staaf beslaat met de
// korf uit de invoer, valt elk krachtenpunt daar precies één keer in, en levert
// elke lus letterlijk dezelfde reeks als voorheen. Dat is geen bijkomstigheid
// maar de voorwaarde waaronder deze wijziging mocht: geen enkele bestaande
// ankerwaarde mag verschuiven.

/// Eén stuk staaf waarop de wapeningskorf CONSTANT is.
///
/// De zones staan in twee GESCHEIDEN lijsten — de langswapening kort in op
/// andere plaatsen dan waar de beugels verdichten — en hun grenzen vallen in
/// het algemeen niet samen. Wat een toets nodig heeft is de VERENIGING van
/// beide grensverzamelingen: tussen twee opeenvolgende grenzen verandert er
/// niets, dus daar geldt één korf. [`ReinforcementZones::boundaries_mm`]
/// levert die vereniging al; dit type hangt er de korf aan die er geldt.
#[derive(Clone, Debug)]
struct Wapeningsvak {
    /// [x_start, x_end] langs de staaf, mm. `None` = er zijn geen zones en de
    /// hele staaf is één vak; dan hoort ELK punt van de omhullende erbij, ook
    /// een punt dat buiten [0, L] zou liggen.
    bereik: Option<(f64, f64)>,
    /// De korf die op dit stuk geldt — uit [`ReinforcementZones::cage_at_mm`].
    korf: ReinforcementCage,
    /// Neemt dit vak ook wat er vóór zijn begin ligt? Alleen het eerste vak.
    /// Zo valt een station op x = −0,001 mm (afrondruis van de rekenkern) niet
    /// buiten de indeling.
    open_links: bool,
    /// Idem voorbij zijn einde. Alleen het laatste vak.
    open_rechts: bool,
}

impl Wapeningsvak {
    /// Hoort de snede op `x_mm` bij dit vak?
    ///
    /// Het bereik is aan BEIDE kanten GESLOTEN, en dat is met opzet. Op de
    /// grens tussen twee vakken houdt het staal van het linkervak werkelijk op
    /// — dat is precies wat §9.2.1.3 beschrijft — dus die grenssnede hoort bij
    /// beide vakken en wordt met beide korven doorgerekend: met de korf van
    /// RECHTS via [`ReinforcementZones::cage_at_mm`], die links gesloten en
    /// rechts open is, en met de korf van LINKS via dit vak.
    ///
    /// Zonder die dubbele weging zou het rechteruiteinde van een vak nooit met
    /// de korf van dát vak worden getoetst. Juist daar ligt bij een inkorting
    /// de zwaarste snede: kort de onderwapening op x = 1000 mm van 3Ø16 naar
    /// 5Ø16 op, dan is x = 1000 mm het punt waar de zwakke korf het grootste
    /// moment ziet, en `cage_at_mm` levert daar de STERKE korf van rechts.
    fn bevat(&self, x_mm: f64) -> bool {
        match self.bereik {
            None => true,
            Some((a, b)) => {
                (self.open_links || x_mm >= a - ZONE_TOLERANCE_MM)
                    && (self.open_rechts || x_mm <= b + ZONE_TOLERANCE_MM)
            }
        }
    }

    /// Aanduiding voor het rapport.
    fn label(&self) -> String {
        match self.bereik {
            None => "de hele staaf".to_string(),
            Some((a, b)) => format!("x = {} tot {} mm", a.round() as i64, b.round() as i64),
        }
    }

    /// Het midden van het vak — de plaats waar `cage_at_mm` gegarandeerd de
    /// korf van DIT vak geeft en niet die van een buurvak.
    fn midden_mm(&self) -> Option<f64> {
        self.bereik.map(|(a, b)| 0.5 * (a + b))
    }
}

/// De staaf opgeknipt in stukken met elk een constante korf.
///
/// Zonder zones is dat één vak zonder bereik: de korf van de invoer geldt
/// overal en elk krachtenpunt valt erin.
fn wapeningsvakken(zones: &ReinforcementZones, base: &ReinforcementCage) -> Vec<Wapeningsvak> {
    let grenzen = zones.boundaries_mm();
    if grenzen.len() < 2 {
        return vec![Wapeningsvak {
            bereik: None,
            korf: *base,
            open_links: true,
            open_rechts: true,
        }];
    }
    let laatste = grenzen.len() - 2;
    grenzen
        .windows(2)
        .enumerate()
        .map(|(i, p)| Wapeningsvak {
            bereik: Some((p[0], p[1])),
            // Het MIDDEN, niet de grens: tussen twee grenzen verandert de korf
            // niet, en op de grens zelf zou `cage_at_mm` de korf van het vak
            // ERNAAST geven (links gesloten, rechts open).
            korf: zones.cage_at_mm(base, 0.5 * (p[0] + p[1])),
            open_links: i == 0,
            open_rechts: i == laatste,
        })
        .collect()
}

/// Eén rekensnede: een punt uit de omhullende MET de korf die daar geldt.
///
/// Dit is het enige wat er voor de doorsnedetoetsen verandert. Waar zij vroeger
/// `&[ForcePoint]` kregen en er één korf naast, krijgen zij nu `&[Snede]` en
/// halen de korf uit de snede.
#[derive(Clone, Copy, Debug)]
struct Snede {
    punt: ForcePoint,
    korf: ReinforcementCage,
}

/// Elk punt van de omhullende, gekoppeld aan de korf die daar geldt.
///
/// Een punt dat precies op een zonegrens ligt komt TWEE KEER voor, met de korf
/// links en met de korf rechts — zie [`Wapeningsvak::bevat`] voor waarom dat
/// moet. Zijn de korven van twee aansluitende vakken toevallig gelijk (de
/// gebruiker mag een zone opknippen zonder er iets aan te veranderen), dan valt
/// de doublure weg: dezelfde korf op dezelfde snede levert per definitie
/// dezelfde uitkomst en zou alleen rekentijd kosten.
fn sneden_met_korf(vakken: &[Wapeningsvak], env: &[ForcePoint]) -> Vec<Snede> {
    let mut uit: Vec<Snede> = Vec::with_capacity(env.len());
    for p in env {
        let begin = uit.len();
        for vak in vakken {
            if !vak.bevat(p.position_mm) {
                continue;
            }
            if uit[begin..].iter().any(|s| s.korf == vak.korf) {
                continue;
            }
            uit.push(Snede { punt: *p, korf: vak.korf });
        }
    }
    uit
}

/// Het maatgevende krachtenpunt BINNEN één vak: hetzelfde criterium als voor de
/// staaf als geheel — het grootste moment, met de normaalkracht als kleine
/// bijmenging om een zuivere drukstaaf niet op nul te laten stranden — maar dan
/// beperkt tot de punten die in dit vak liggen.
///
/// `None` = de omhullende draagt in dit vak geen enkel rekenpunt. Dat is een
/// mededeling en geen fout; wat de toetsing er wél en niet mee kan, staat bij
/// [`zonemelding`].
///
/// Zonder zones is er één vak dat alles bevat, en levert deze functie letterlijk
/// hetzelfde punt als [`governing_for`] over de hele omhullende.
fn punt_van_vak(vak: &Wapeningsvak, env: &[ForcePoint]) -> Option<ForcePoint> {
    let mut beste: Option<ForcePoint> = None;
    let mut hoogste = f64::NEG_INFINITY;
    for p in env {
        if !vak.bevat(p.position_mm) {
            continue;
        }
        let score = p.forces.my_ed.abs() + p.forces.n_ed.abs() * 0.01;
        if beste.is_none() || score > hoogste {
            beste = Some(*p);
            hoogste = score;
        }
    }
    beste
}

/// De vaste mededeling over de zone-indeling: hoeveel stukken er zijn, hoeveel
/// sneden dat oplevert, en — dit is de kern — WELKE zonegrenzen de omhullende
/// niet kon bereiken.
///
/// # Waarom er niet wordt geïnterpoleerd
///
/// Een zonegrens is de plaats waar de rekenkern een echte rekenknoop hoort te
/// zetten (`extraSneden` in de solver). Op zo'n knoop staat het station DUBBEL:
/// het stuk links en het stuk rechts leveren er elk hun eigen waarde, want V
/// springt bij een puntlast en M bij een aangrijpend moment. Draagt de
/// omhullende op een grens geen punt, dan is de enige gegeven informatie die
/// van de twee BUURpunten — en die met elkaar middelen zou een krachtsverloop
/// opleveren dat over een mogelijke sprong heen loopt en dus nergens optreedt.
/// Zo'n verzonnen snede kan zowel te hoog als te laag uitvallen en is in het
/// rapport niet als verzinsel te herkennen. Er wordt daarom NIETS aangenomen:
/// de grens wordt met naam en plaats gemeld, met wat de gebruiker eraan kan
/// doen.
///
/// `None` zodra er maar één vak is — dan zijn er geen zones, valt er niets te
/// melden, en blijven de notes van elke toets letterlijk zoals ze waren.
fn zonemelding(
    vakken: &[Wapeningsvak],
    env: &[ForcePoint],
    aantal_sneden: usize,
    wat_leest_de_toets: &str,
) -> Option<String> {
    if vakken.len() < 2 {
        return None;
    }
    // Alleen de BINNENgrenzen tellen: dat zijn de plaatsen waar de korf
    // werkelijk verandert. De uiteinden x = 0 en x = L zijn geen sprong maar
    // het begin en het eind van de staaf, en het eerste en laatste vak nemen
    // wat daarbuiten valt sowieso mee (zie `Wapeningsvak::bevat`).
    let mut gemist: Vec<String> = Vec::new();
    for v in &vakken[..vakken.len() - 1] {
        let Some((_, g)) = v.bereik else { continue };
        if !env.iter().any(|p| (p.position_mm - g).abs() <= ZONE_TOLERANCE_MM) {
            gemist.push(format!("{}", g.round() as i64));
        }
    }
    let leeg: Vec<String> = vakken
        .iter()
        .filter(|v| punt_van_vak(v, env).is_none())
        .map(|v| v.label())
        .collect();

    let mut tekst = format!(
        "DE WAPENING VERANDERT LANGS DE STAAF. De staaf valt in {} stukken uiteen waarop de korf \
         constant is; {wat_leest_de_toets} Uit de {} punten van de omhullende volgen zo {} sneden. \
         Een punt dat precies op een zonegrens ligt telt twee keer mee — één keer met de korf \
         links en één keer met de korf rechts — want daar houdt het staal van het linkerstuk \
         werkelijk op (§9.2.1.3).",
        vakken.len(),
        env.len(),
        aantal_sneden,
    );
    if !gemist.is_empty() {
        tekst.push_str(&format!(
            " LET OP: op de zonegrens/-grenzen x = {} mm draagt de omhullende GEEN rekenpunt. Daar \
             is dus niet getoetst. Er wordt ook niet tussen de buurpunten geïnterpoleerd: op een \
             zonegrens hoort de rekenkern een echte rekenknoop te zetten, en op zo'n knoop staat \
             het station dubbel omdat V en M er kunnen springen. Middelen over die sprong heen \
             levert een krachtsverloop op dat nergens optreedt. Geef de zonegrenzen aan de \
             rekenkern mee als extra sneden en reken opnieuw.",
            gemist.join(", ")
        ));
    }
    if !leeg.is_empty() {
        tekst.push_str(&format!(
            " En op {} draagt de omhullende in het geheel geen rekenpunt; die stukken zijn met de \
             krachten dus niet getoetst.",
            leeg.join("; ")
        ));
    }
    Some(tekst)
}

// ───────────────────────────────────────────────────────────────────────────
// §6.2 — de maatgevende dwarskrachtsnede
// ───────────────────────────────────────────────────────────────────────────

/// Wat een keer langs de hele omhullende oplevert voor §6.2 en voor de twee
/// detailleringseisen die op §6.2 leunen.
struct DwarskrachtOverzicht {
    /// De snede met de hoogste unity check — daar wordt §6.2 afgerekend. Hij
    /// draagt zijn eigen korf mee: bij een verdichte beugelzone verschilt
    /// A_sw/s per stuk staaf, en dan is de weerstand op deze snede niet die van
    /// de korf uit de invoer.
    snede: Snede,
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
/// V_Rd is geen constante van de staaf. V_Rd,c (6.2.2(1)) rekent met d en met
/// A_sl, en die twee horen bij de zijde die op TREK staat — de
/// dwarskrachtmodule leest dat aan het teken van M_Ed af. Bij een asymmetrische
/// korf verschilt V_Rd,c daardoor per snede. Voor het vakwerkmodel geldt
/// hetzelfde: z = 0,9·d hangt aan diezelfde d, dus ook V_Rd,s (6.8) en
/// V_Rd,max (6.9) lopen langs de staaf op en neer. De snede met de grootste
/// dwarskracht kan dus een RUIMERE weerstand hebben dan een naburige snede met
/// iets minder dwarskracht maar een veel kleinere A_sl, en dan ligt de
/// werkelijke maatgevende unity check niet op de eerste maar op de tweede.
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
    terugval: &ReinforcementCage,
    mat: &DesignMaterial,
    sneden: &[Snede],
    opts: &ShearOptions,
) -> DwarskrachtOverzicht {
    let mut beste: Zwaarste<Snede> = Zwaarste::nieuw();
    let mut v_ed_max_kn = 0.0_f64;
    let mut v_rd_max_min_kn: Option<f64> = None;
    let mut ergens_vakwerkspoor = false;

    for s in sneden {
        let fs = ForceStateSnapshot::from_point(&s.punt);
        // DE KORF VAN DEZE SNEDE, niet die van de staaf. A_sw/s komt uit de
        // beugelzone die hier ligt (§9.2.2) en A_sl uit de langswapening die
        // hier doorloopt (§6.2.2(1) met figuur 6.3); allebei kunnen ze langs
        // de staaf springen.
        let r: ShearResistance = shear_resistance(section, &s.korf, mat, &fs, opts);
        beste.bied(zwaarte_dwarskracht(&r), *s);

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
        snede: beste.uitkomst().unwrap_or(Snede {
            punt: ForcePoint {
                combination_id: 0,
                position_mm: 0.0,
                forces: Default::default(),
            },
            korf: *terugval,
        }),
        v_ed_max_kn,
        v_rd_max_min_kn,
        ergens_vakwerkspoor,
        aantal_sneden: sneden.len(),
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
    /// De snede met de hoogste unity check, mét de korf die daar geldt.
    snede: Snede,
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
    terugval_korf: &ReinforcementCage,
    mat: &DesignMaterial,
    env: &[ForcePoint],
    sneden: &[Snede],
) -> BuigOverzicht {
    let mut beste: Zwaarste<Snede> = Zwaarste::nieuw();
    let mut aantal_niet_toepasbaar = 0usize;
    // De terugval als GEEN ENKELE snede kan worden afgerekend: het grootste
    // |M_Ed|. Dan is er geen unity check om op te rangschikken, en levert die
    // snede tenminste de reden bij het zwaarste moment. De korf die daarbij
    // hoort is die van de invoer; er is immers geen doorgerekende snede die
    // een andere zou aanwijzen.
    let terugval = Snede {
        punt: governing_for(env, |f| f.my_ed.abs() + f.n_ed.abs() * 0.01),
        korf: *terugval_korf,
    };

    for s in sneden {
        // De wapeningslagen PER SNEDE. Bij een ingekorte onderwapening is dat
        // het hele punt: M_Rd volgt uit de staven die op deze plaats liggen.
        let layers = s.korf.layers(section.h_mm);
        let m_ed = s.punt.forces.my_ed;
        let sign = if m_ed < 0.0 { -1.0 } else { 1.0 };
        match stress_block(section, &layers, mat, s.punt.forces.n_ed, sign) {
            Ok(r) => {
                let uc = if r.m_rd_knm > 0.0 { m_ed.abs() / r.m_rd_knm } else { 0.0 };
                beste.bied(Zwaarte::bepaald(uc, m_ed.abs()), *s);
            }
            Err(_) => aantal_niet_toepasbaar += 1,
        }
    }

    BuigOverzicht { snede: beste.uitkomst().unwrap_or(terugval), aantal_niet_toepasbaar }
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
    mat: &DesignMaterial,
    sneden: &[Snede],
) -> (Vec<Snede>, bool) {
    let mut index: HashMap<(bool, u64, Korfsleutel), usize> = HashMap::new();
    let mut groepen: Vec<Snede> = Vec::new();
    for s in sneden {
        // DE KORF HOORT IN DE SLEUTEL. Zonder zones is hij op elke snede
        // dezelfde en verandert er niets aan de groepering; met zones is hij de
        // DERDE grootheid waarvan M_Rd afhangt, en twee sneden met hetzelfde
        // teken en dezelfde N_Ed maar een andere korf hebben dus NIET dezelfde
        // weerstand. Ze samennemen zou de snede met de zwakste korf laten
        // verdwijnen achter die met het grootste moment.
        let sleutel = (
            s.punt.forces.my_ed < 0.0,
            s.punt.forces.n_ed.to_bits(),
            korfsleutel(&s.korf),
        );
        match index.get(&sleutel) {
            Some(&i) => {
                if s.punt.forces.my_ed.abs() > groepen[i].punt.forces.my_ed.abs() {
                    groepen[i] = *s;
                }
            }
            None => {
                index.insert(sleutel, groepen.len());
                groepen.push(*s);
            }
        }
    }
    if groepen.len() <= MAX_MN_KAPPA_SNEDEN {
        return (groepen, false);
    }

    // Voorselectie op de goedkope weerstand. Sneden waar het spanningsblok
    // niets zegt, krijgen een oneindige score: zij mogen juist niet als eerste
    // afvallen, want daar is de M-N-κ-weg de enige die art. 6.1 nog toetst.
    let mut met_score: Vec<(f64, Snede)> = groepen
        .into_iter()
        .map(|s| {
            let layers = s.korf.layers(section.h_mm);
            let sign = if s.punt.forces.my_ed < 0.0 { -1.0 } else { 1.0 };
            let score = match stress_block(section, &layers, mat, s.punt.forces.n_ed, sign) {
                Ok(r) if r.m_rd_knm > 0.0 => s.punt.forces.my_ed.abs() / r.m_rd_knm,
                Ok(_) => 0.0,
                Err(_) => f64::INFINITY,
            };
            (score, s)
        })
        .collect();
    met_score.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    met_score.truncate(MAX_MN_KAPPA_SNEDEN);
    (met_score.into_iter().map(|(_, s)| s).collect(), true)
}

/// Waarin twee korven moeten verschillen wil hun momentweerstand verschillen.
///
/// [`ReinforcementCage`] draagt `f64`-velden en is daarom niet als sleutel van
/// een [`HashMap`] te gebruiken; dit is de bitpatroonvorm ervan. Er staan
/// precies de velden in die [`ReinforcementCage::layers`] leest en die
/// [`ReinforcementZones::cage_at_mm`] kan veranderen: de twee staafrijen en de
/// beugeldiameter (die de asafstand van de staven verschuift). De DEKKING —
/// ook die per zijde — staat er met opzet niet in: zij komt altijd van de korf
/// van de staaf en niet uit een zone, want een betonoppervlak houdt over de
/// lengte van een staaf dezelfde milieuklasse. Twee korven met dezelfde sleutel
/// leveren dus letterlijk dezelfde wapeningslagen en daarmee dezelfde M_Rd.
type Korfsleutel = (u32, u64, u32, u64, u64);

fn korfsleutel(korf: &ReinforcementCage) -> Korfsleutel {
    (
        korf.bottom.count,
        korf.bottom.diameter_mm.to_bits(),
        korf.top.count,
        korf.top.diameter_mm.to_bits(),
        korf.stirrup_diameter_mm.to_bits(),
    )
}

// ═══════════════════════════════════════════════════════════════════════════
// §9.2.1, §9.2.2 en §8.2 — welke eis bij de ZONE hoort en welke bij het ELEMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// De negen detailleringseisen zijn niet van dezelfde soort, en met
// wapeningszones erbij valt dat pas goed op. De indeling, met per eis wat hij
// werkelijk uitleest:
//
// | eis | leest | waar hij geldt |
// |---|---|---|
// | §9.2.1.1(1) A_s,min | korf + (M_Ed; N_Ed) | per SNEDE |
// | §9.2.1.1(3) A_s,max | de twee staafrijen | per ZONE |
// | NB §9.2.1.1(5) Ø_l,min | de twee staafrijen | per ZONE |
// | §9.2.2(5) ρ_w,min | A_sw, s en b_w | per ZONE |
// | §9.2.2(6) s_l,max | s en d | per ZONE |
// | §9.2.2(8) s_t,max | s_t en d | per ZONE |
// | NB §9.2.2(9) Ø_sw,min | de beugeldiameter | per ZONE |
// | NB §9.2(1) b_min | ALLEEN de doorsnede | per ELEMENT |
// | §8.2(2) a_vrij | de staafrijen en de breedte | per ZONE |
//
// ACHT VAN DE NEGEN ZIJN DUS ZONE-AFHANKELIJK. Dat is de omkering van wat er
// vóór de zones stond: toen was A_s,min "de enige die van de snede afhangt",
// omdat de korf per definitie over de hele staaf gelijk was. Zodra de
// beugelafstand bij het steunpunt 150 mm is en in het veld 250 mm, is s_l,max
// twee verschillende toetsen; hem één keer voor de staaf afrekenen betekent dat
// de ene zone het antwoord van de andere krijgt. Bij een MINIMUM-eis is dat
// bovendien niet aan de veilige kant: de zone met de meeste wapening kan de
// zone met de minste wegdrukken.
//
// EÉN EIS BLIJFT BIJ HET ELEMENT: de minimale balkbreedte van NB §9.2(1). Hij
// leest de korf helemaal niet — alleen b_w, de korrelafmeting d_g en de twee
// uitvoeringsvragen (blijvende bekisting, dubbel net) — en die zijn eigenschappen
// van de doorsnede en het werk, niet van een stuk staaf.
//
// DRIE INVOERGROOTHEDEN BLIJVEN OOK BIJ HET ELEMENT, en dat is een KEUZE die
// hieronder in het rapport wordt uitgesproken: `dwarskrachtwapening_vereist`
// (de tak van s_l,max), `v_ed_kn` en `v_rd_max_kn` (de tak van s_t,max) worden
// over de HELE staaf genomen — is er ergens vakwerkspoor, dan geldt de strenge
// tak overal; V_Ed is de grootste van de staaf en V_Rd,max de kleinste. Per zone
// lezen zou de tak in een rustige zone kunnen VERRUIMEN, en dat is een
// versoepeling die uit de norm niet ondubbelzinnig volgt: §9.2.2(6) spreekt over
// "indien dwarskrachtwapening is vereist" zonder te zeggen waar dat wordt
// vastgesteld. De veilige lezing kost hier niets en staat in de afleiding.

/// Alles wat een [`DetailleringInvoer`] draagt en wat NIET van de plaats langs
/// de staaf afhangt.
///
/// Zonder dit hulpstuk zou elk van de negen aanroepen dezelfde elf velden
/// moeten overtypen, en is één vergeten veld een stille afwijking tussen twee
/// toetsen van dezelfde korf.
struct DetailBasis<'a> {
    section: &'a ConcreteSection,
    mat: &'a DesignMaterial,
    f_ctm_mpa: f64,
    d_g_mm: Option<f64>,
    dwarskrachtwapening_vereist: Option<bool>,
    v_ed_kn: Option<f64>,
    v_rd_max_kn: Option<f64>,
}

impl DetailBasis<'_> {
    /// De invoer voor één plaats: deze korf, dit krachtenpunt.
    fn invoer<'b>(
        &'b self,
        korf: &'b ReinforcementCage,
        force_state: ForceStateSnapshot,
    ) -> DetailleringInvoer<'b> {
        DetailleringInvoer {
            section: self.section,
            cage: korf,
            mat: self.mat,
            f_ctm_mpa: self.f_ctm_mpa,
            force_state,
            d_g_mm: self.d_g_mm,
            dwarskrachtwapening_vereist: self.dwarskrachtwapening_vereist,
            v_ed_kn: self.v_ed_kn,
            v_rd_max_kn: self.v_rd_max_kn,
            // Twee uitvoeringsvragen die deze orchestrator niet gesteld krijgt.
            // De toets meldt zelf dat hij ze mist; zie `min_balkbreedte_9_2`.
            blijvend_bekiste_oppervlakken: None,
            dubbel_wapeningsnet: None,
        }
    }
}

/// Eén vak, klaar om er een detailleringseis op af te rekenen.
struct Vakpunt {
    label: String,
    korf: ReinforcementCage,
    /// Het maatgevende krachtenpunt in dit vak — het grootste moment, net als
    /// vroeger voor de hele staaf. `None` = de omhullende draagt hier geen
    /// enkel rekenpunt.
    punt: Option<ForcePoint>,
    /// Het midden van het vak, voor het geval er geen krachtenpunt is en de
    /// eis toch een plaats in zijn afleiding moet zetten.
    midden_mm: f64,
}

/// Eén detailleringseis op ELK vak, met de zwaarste uitkomst als resultaat.
///
/// `leest_de_krachten` zegt of deze eis het krachtenpunt werkelijk gebruikt.
/// Dat onderscheid doet er alleen toe voor een vak waarin de omhullende geen
/// rekenpunt draagt:
///
/// * leest hij de krachten NIET (A_s,max, de twee minimumdiameters, ρ_w,min en
///   de vrije staafafstand), dan is de eis daar gewoon af te rekenen — hij
///   vergelijkt maten van de korf, en die liggen er ook zonder krachten. Het
///   krachtenpunt dat meegaat is dan het MIDDEN van het vak met nulkrachten,
///   en dat staat er met zoveel woorden bij zodat niemand die nul voor een
///   uitkomst aanziet;
/// * leest hij ze WÉL (s_l,max en s_t,max hebben d nodig, en d volgt uit het
///   teken van M_Ed), dan wordt dat vak overgeslagen en gemeld. Een nul
///   invullen zou stilzwijgend "trek onder" kiezen en daarmee een d — en dus
///   een grenswaarde — verzinnen.
///
/// `None` komt alleen terug als er geen enkel vak overbleef; de aanroeper zet
/// er dan een "niet uitgevoerd" met de reden voor in de plaats.
fn detail_over_vakken(
    basis: &DetailBasis<'_>,
    vakken: &[Vakpunt],
    leest_de_krachten: bool,
    toets: impl Fn(&DetailleringInvoer<'_>) -> ResistanceCalc,
) -> (Option<ResistanceCalc>, Vec<String>) {
    let mut beste: Zwaarste<(ResistanceCalc, String)> = Zwaarste::nieuw();
    let mut overgeslagen: Vec<String> = Vec::new();

    for vak in vakken {
        let (state, zonder_krachten) = match vak.punt {
            Some(p) => (ForceStateSnapshot::from_point(&p), false),
            None if leest_de_krachten => {
                overgeslagen.push(vak.label.clone());
                continue;
            }
            None => (
                ForceStateSnapshot {
                    combination_id: 0,
                    position_mm: vak.midden_mm,
                    forces: InternalForces::default(),
                },
                true,
            ),
        };
        let mut calc = toets(&basis.invoer(&vak.korf, state));
        if zonder_krachten {
            calc.notes.push(format!(
                "Op {} draagt de omhullende geen rekenpunt. Deze eis vergelijkt maten van de korf \
                 en leest de krachten niet, dus hij is er wél af te rekenen; het krachtenpunt in \
                 de kop staat op het midden van het stuk met nulkrachten en is GEEN uitkomst.",
                vak.label
            ));
        }
        let belasting = state.forces.my_ed.abs();
        beste.bied(zwaarte_van(&calc, belasting), (calc, vak.label.clone()));
    }

    match beste.uitkomst() {
        Some((mut calc, label)) => {
            if vakken.len() > 1 {
                calc.notes.push(format!(
                    "Deze eis is PER STUK STAAF afgerekend — de wapening verandert langs de staaf, \
                     dus de eis doet dat ook — en van de {} stukken is {} het zwaarste. De \
                     afleiding hierboven hoort bij dat stuk. Eén uitkomst voor de hele staaf zou \
                     hier het antwoord van het ene stuk aan het andere geven; bij een MINIMUM-eis \
                     is dat niet aan de veilige kant, want het stuk met de meeste wapening drukt \
                     het stuk met de minste weg.",
                    vakken.len(),
                    label
                ));
                if !overgeslagen.is_empty() {
                    calc.notes.push(format!(
                        "NIET afgerekend op {}: de omhullende draagt daar geen rekenpunt, en deze \
                         eis heeft er een nodig (d volgt uit het teken van M_Ed). Er is niets voor \
                         in de plaats aangenomen.",
                        overgeslagen.join("; ")
                    ));
                }
            }
            (Some(calc), overgeslagen)
        }
        None => (None, overgeslagen),
    }
}

/// §9.2.1.1(1) A_s,min over ELKE SNEDE, met de zwaarste als uitkomst.
///
/// # Waarom deze eis niet per vak maar per snede loopt
///
/// De andere zeven zone-afhankelijke eisen vergelijken maten van de korf; binnen
/// één vak is hun uitkomst overal dezelfde, dus één snede per vak volstaat.
/// A_s,min niet: de eis zet de vereiste minimumwapening af tegen de AANWEZIGE
/// trekwapening, en welke rij dat is volgt uit het teken van M_Ed. Daarbovenop
/// hangt A_s,min zelf van (M_Ed; N_Ed) af, via de minimumcombinatie van de
/// nationale bijlage en via A_s,min2 = 1,25 × de UGT-behoefte. Op één snede per
/// vak blijven staan kan de trekzijde met de minste wapening dus overslaan, en
/// een FALENDE detailleringseis is wél maatgevend voor de staaf.
///
/// `zaad` is de uitkomst op de snede met het grootste moment van het zwaarste
/// vak — die is al gemaakt en doet gewoon mee, zodat deze functie nooit een
/// lagere uitkomst kan opleveren dan zonder haar.
fn as_min_over_sneden(
    basis: &DetailBasis<'_>,
    sneden: &[Snede],
    zaad: ResistanceCalc,
    aantal_env: usize,
) -> ResistanceCalc {
    let mut beste: Zwaarste<ResistanceCalc> = Zwaarste::nieuw();
    let belasting_zaad = zaad.force_state.forces.my_ed.abs();
    beste.bied(zwaarte_van(&zaad, belasting_zaad), zaad);

    for s in sneden {
        let calc = as_min_9_2_1_1(&basis.invoer(&s.korf, ForceStateSnapshot::from_point(&s.punt)));
        beste.bied(zwaarte_van(&calc, s.punt.forces.my_ed.abs()), calc);
    }

    let mut uit = beste.uitkomst().expect("de zaaduitkomst is altijd geboden");
    uit.notes.push(snedemelding(
        "Deze eis is op ELKE snede van de omhullende nagelopen en op de hoogste unity check \
         gekozen: A_s,min wordt tegen de AANWEZIGE trekwapening afgezet, en welke rij dat is volgt \
         uit het teken van M_Ed. De overige zeven eisen die de korf lezen vergelijken maten die \
         binnen één stuk staaf niet veranderen; die staan per stuk op de snede met het grootste \
         moment.",
        &ForcePoint {
            combination_id: uit.force_state.combination_id,
            position_mm: uit.force_state.position_mm,
            forces: uit.force_state.forces,
        },
        aantal_env,
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
    // DE ZONE-INDELING MOET ALS INDELING KLOPPEN voordat er iets mee wordt
    // gerekend. `validate` weigert een gat, een overlap en een zone die buiten
    // de staaf steekt, en repareert niets: een gat dichttrekken zou wapening
    // aannemen die niemand heeft ingevoerd. Bij LEGE zonelijsten keert hij
    // meteen met Ok terug, dus voor een staaf zonder zones verandert er niets.
    if let Err(e) =
        input
            .reinforcement_zones
            .validate(&input.cage, &section, input.length_m * 1000.0)
    {
        return error_result(&input, format!("de wapeningszones zijn niet bruikbaar: {e}"));
    }
    let opts = MnKappaOptions { n_strips: input.n_strips.max(1) as usize };
    let layers = input.cage.layers(section.h_mm);

    // ── De sneden ──────────────────────────────────────────────────────────
    //
    // Een SNEDE is een krachtenpunt PLUS de korf die daar geldt. Zonder zones
    // is dat één vak met de korf van de invoer en valt elk krachtenpunt daar
    // precies één keer in; de reeks is dan letterlijk de omhullende zoals zij
    // binnenkwam.
    //
    // `gov_bending` is het punt met het GROOTSTE MOMENT, en dat blijft het:
    // §7.4.2(2) schrijft met zoveel woorden voor dat de wapeningsverhouding
    // rho "in het midden van de overspanning (bij uitkragingen ter plaatse van
    // de oplegging)" wordt genomen, en het grootste |M| is daar de
    // benadering van.
    //
    // De doorsnedetoetsen kiezen hun eigen snede, en die kiezen op de UNITY
    // CHECK — zie de moduledoc en de zoekers hierboven.
    let vakken = wapeningsvakken(&input.reinforcement_zones, &input.cage);
    let ugt_sneden = sneden_met_korf(&vakken, &input.forces_envelope);
    let gov_bending = governing_for(&input.forces_envelope, |f| f.my_ed.abs() + f.n_ed.abs() * 0.01);
    let bend_state = ForceStateSnapshot::from_point(&gov_bending);
    // De korf ter plaatse van die snede. Zonder zones is dat de korf van de
    // invoer, en bij §7.4.2 hieronder verandert er dus niets.
    let bend_korf = input
        .reinforcement_zones
        .cage_at_mm(&input.cage, gov_bending.position_mm);

    let mut checks: Vec<NamedCheck> = Vec::new();

    // 1. Buiging met de rechthoekige spanningsverdeling (handberekening),
    //    op de snede met de hoogste unity check, met de korf die dáár ligt.
    let buiging = buigoverzicht(
        &section,
        &input.cage,
        &mat,
        &input.forces_envelope,
        &ugt_sneden,
    );
    let mut blok = check_bending_stress_block(
        &section,
        &buiging.snede.korf,
        &mat,
        ForceStateSnapshot::from_point(&buiging.snede.punt),
    );
    blok.notes.push(snedemelding(
        "De maatgevende snede is gezocht op de UNITY CHECK en niet op het grootste moment: \
         M_Rd hangt via het TEKEN van M_Ed af van welke wapeningsrij op trek staat, en bij een \
         asymmetrische korf scheelt dat een factor.",
        &buiging.snede.punt,
        input.forces_envelope.len(),
    ));
    if let Some(m) = zonemelding(
        &vakken,
        &input.forces_envelope,
        ugt_sneden.len(),
        "M_Rd is per snede bepaald met de langswapening die daar werkelijk ligt.",
    ) {
        blok.notes.push(m);
    }
    if buiging.aantal_niet_toepasbaar > 0 {
        blok.notes.push(format!(
            "Op {} van de {} sneden van de omhullende is de rechthoekige spanningsverdeling niet \
             van toepassing (de doorsnede staat daar geheel onder druk, of de trek overschrijdt de \
             trekcapaciteit van de wapening). Die sneden doen aan deze toets niet mee. Art. 6.1 \
             blijft er wél getoetst: de M-N-κ-toets hieronder kent de geheel gedrukte doorsnede \
             (draaipunt C van figuur 6.1) en neemt ze wél mee.",
            buiging.aantal_niet_toepasbaar,
            ugt_sneden.len()
        ));
    }
    checks.push(make_resistance(blok));

    // 2. M-N-κ. Eén afgevaardigde per (teken van M_Ed; N_Ed; korf) — zie
    //    `sneden_mn_kappa` voor waarom dat exact is en niet benaderend.
    let (mn_sneden, mn_voorgeselecteerd) = sneden_mn_kappa(&section, &mat, &ugt_sneden);
    let mut mn_beste: Zwaarste<_> = Zwaarste::nieuw();
    for s in &mn_sneden {
        let kandidaat = check_mn_kappa(
            &section,
            &s.korf,
            &mat,
            &opts,
            input.apply_min_eccentricity,
            ForceStateSnapshot::from_point(&s.punt),
        );
        let zwaarte = zwaarte_van(&kandidaat.calc, s.punt.forces.my_ed.abs());
        mn_beste.bied(zwaarte, (kandidaat, *s));
    }
    let (mut mn, mn_snede) = match mn_beste.uitkomst() {
        Some(v) => v,
        // Alleen bij een lege omhullende. Dan is er niets te kiezen en levert
        // het nulpunt de toets met M_Ed = 0.
        None => {
            let s = Snede { punt: gov_bending, korf: bend_korf };
            (
                check_mn_kappa(
                    &section,
                    &s.korf,
                    &mat,
                    &opts,
                    input.apply_min_eccentricity,
                    ForceStateSnapshot::from_point(&s.punt),
                ),
                s,
            )
        }
    };
    mn.calc.notes.push(format!(
        "{} Van de {} sneden van de omhullende blijven er {} over die elkaars uitkomst niet \
         herhalen: M_Rd hangt alleen van het TEKEN van M_Ed, van N_Ed en van de KORF ter plaatse \
         af, dus sneden die daarin gelijk zijn hebben dezelfde weerstand en wint binnen die groep \
         de grootste |M_Ed| — ook na de minimale excentriciteit van 6.1(4), want |N_Ed|·e₀ is \
         binnen de groep gelijk.{}",
        snedemelding(
            "De maatgevende snede is gezocht op de UNITY CHECK.",
            &mn_snede.punt,
            ugt_sneden.len()
        ),
        ugt_sneden.len(),
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
    if let Some(m) = zonemelding(
        &vakken,
        &input.forces_envelope,
        ugt_sneden.len(),
        "de korf ter plaatse hoort daarom bij de sleutel waarop de sneden zijn gegroepeerd.",
    ) {
        mn.calc.notes.push(m);
    }
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
    let dwars = dwarskrachtoverzicht(&section, &input.cage, &mat, &ugt_sneden, &shear_opts);
    let gov_shear = dwars.snede.punt;
    let shear_state = ForceStateSnapshot::from_point(&gov_shear);
    let mut shear_calc =
        check_shear(&section, &dwars.snede.korf, &mat, shear_state, &shear_opts);
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
    if let Some(m) = zonemelding(
        &vakken,
        &input.forces_envelope,
        ugt_sneden.len(),
        "V_Rd is per snede bepaald met de beugels én de langswapening die daar werkelijk liggen — \
         A_sw/s uit de beugelzone (§9.2.2) en A_sl uit de langswapening die doorloopt (§6.2.2(1) \
         met figuur 6.3).",
    ) {
        shear_calc.notes.push(m);
    }
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

    // De BGT-sneden zijn op dezelfde manier opgebouwd als de UGT-sneden: elk
    // punt van de frequente envelop met de korf die op die plaats geldt.
    let bgt_sneden = sneden_met_korf(&vakken, &input.sls_frequent_envelope);

    if let Some(klasse) = input.exposure_class {
        for snede in &bgt_sneden {
            let p = &snede.punt;
            let b = match bgt_toestand_op(&section, &snede.korf, beton, staal, &input, *p) {
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
                None => match staafafstand_uit_korf_mm(&section, &snede.korf, b.trek_onder) {
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
                // De korf van DEZE snede. §7.3.2 zet A_s,min tegen de aanwezige
                // trekwapening af en §7.3.4 rekent met de staafdiameter en de
                // effectieve trekzone; allebei veranderen ze waar de
                // langswapening inkort.
                cage: &snede.korf,
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
                    bgt_sneden.len()
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
                    bgt_sneden.len(),
                    eerste_bgt_fout.clone().unwrap_or_default()
                );
                minimumwapening.notes.push(melding.clone());
                scheurwijdte.notes.push(melding);
            }
            if let Some(m) = zonemelding(
                &vakken,
                &input.sls_frequent_envelope,
                bgt_sneden.len(),
                "de gescheurde doorsnede, A_s,min en de effectieve trekzone zijn per snede bepaald \
                 met de langswapening die daar werkelijk ligt.",
            ) {
                minimumwapening.notes.push(m.clone());
                scheurwijdte.notes.push(m);
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
            // DE KORF TER PLAATSE van de voorgeschreven snede, niet die van de
            // invoer. 7.4.2(2) zet rho vast op het midden van de overspanning,
            // en juist daar is de onderwapening bij een gestaffelde korf op
            // zijn grootst; hem uit de korf van de invoer aflezen zou een rho
            // opleveren die bij een ander stuk staaf hoort. Zonder zones is dit
            // letterlijk `input.cage`.
            let d_mm = if trek_onder {
                bend_korf.d_mm(section.h_mm)
            } else {
                section.h_mm - bend_korf.d2_mm()
            };
            let a_s_prov = if trek_onder {
                bend_korf.a_s_bottom_mm2()
            } else {
                bend_korf.a_s_top_mm2()
            };
            match benodigde_trekwapening_mm2(
                &section,
                &bend_korf,
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
                            bend_korf.a_s_top_mm2()
                        } else {
                            bend_korf.a_s_bottom_mm2()
                        }
                    ));
                    if vakken.len() > 1 {
                        calc.notes.push(format!(
                            "De wapening verandert langs de staaf. rho en d zijn genomen met de \
                             korf die geldt op x = {} mm, de snede met het grootste moment die \
                             7.4.2(2) voorschrijft — en dus NIET met de korf uit de invoer, die \
                             ergens anders kan liggen. De grenswaarde van l/d is een uitspraak \
                             over de HELE overspanning; de norm laat 7.4.2 dan ook op één snede \
                             beoordelen en niet per stuk staaf.",
                            gov_bending.position_mm.round() as i64
                        ));
                    }
                    checks.push(make_resistance(calc));
                }
            }
        }
    }

    // ── 6. Detaillering (§9.2.1, §9.2.2 en §8.2) ───────────────────────────
    //
    // Negen eisen, en ze zijn niet van dezelfde soort. Welke bij een ZONE hoort
    // en welke bij het ELEMENT staat in de tabel boven [`DetailBasis`]; kort:
    // acht van de negen lezen de KORF en horen dus per stuk staaf, en alleen
    // de balkbreedte van NB §9.2(1) leest hem niet.
    //
    // Drie invoergrootheden die zij van §6.2 krijgen blijven bij de HELE staaf,
    // en dat is een keuze die in de afleiding wordt uitgesproken:
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
    let detail_basis = DetailBasis {
        section: &section,
        mat: &mat,
        f_ctm_mpa: beton.f_ctm,
        d_g_mm: input.aggregate_size_mm,
        dwarskrachtwapening_vereist: Some(dwars.ergens_vakwerkspoor),
        v_ed_kn: Some(dwars.v_ed_max_kn),
        // `None` zodra het vakwerkmodel nergens kon worden opgebouwd — dan is
        // er geen V_Rd,max en zegt de toets dat, in plaats van in de ruime tak
        // van 500 mm te belanden.
        v_rd_max_kn: dwars.v_rd_max_min_kn,
    };
    // Elk vak met het krachtenpunt dat er maatgevend is. Zonder zones is er één
    // vak dat de hele staaf beslaat, en levert `punt_van_vak` daar letterlijk
    // `gov_bending`; de terugval erachter dekt de lege omhullende af, waar
    // `gov_bending` zelf het nulpunt is.
    let enkel_vak = vakken.len() == 1;
    let vakpunten: Vec<Vakpunt> = vakken
        .iter()
        .map(|v| Vakpunt {
            label: v.label(),
            korf: v.korf,
            punt: punt_van_vak(v, &input.forces_envelope).or(
                if enkel_vak || input.forces_envelope.is_empty() {
                    Some(gov_bending)
                } else {
                    None
                },
            ),
            midden_mm: v.midden_mm().unwrap_or(gov_bending.position_mm),
        })
        .collect();

    // De zeven zone-afhankelijke eisen NAAST A_s,min, in de volgorde waarin het
    // rapport ze toont. (Zone-afhankelijk zijn er acht; A_s,min hoort erbij maar
    // loopt per SNEDE en staat daarom hieronder apart.)
    //
    // `leest_de_krachten` staat op true zodra de eis het krachtenpunt werkelijk
    // gebruikt — bij s_l,max en s_t,max is dat zo, want d volgt uit het teken
    // van M_Ed; zie [`detail_over_vakken`].
    #[allow(clippy::type_complexity)]
    let vaktoetsen: [(&str, bool, fn(&DetailleringInvoer) -> ResistanceCalc); 7] = [
        ("9.2.1.1_as_max", false, as_max_9_2_1_1),
        ("9.2.1.1_min_diameter_langs", false, min_diameter_langsstaaf_9_2_1_1),
        ("9.2.2_rho_w_min", false, rho_w_min_9_2_2),
        ("9.2.2_sl_max", true, s_l_max_9_2_2),
        ("9.2.2_st_max", true, s_t_max_9_2_2),
        ("9.2.2_min_diameter_beugel", false, min_diameter_beugel_9_2_2),
        // De balkbreedte zit hier NIET bij: zij leest de korf niet en hoort
        // daarom bij het element. Zij komt hieronder één keer, op haar vaste
        // plaats in de volgorde.
        ("8.2_vrije_staafafstand", false, vrije_staafafstand_8_2),
    ];

    // §9.2.1.1(1) A_s,min gaat vóór alle andere, net als voorheen. Zij loopt
    // over de SNEDEN en niet over de vakken; het zaad is de uitkomst op het
    // zwaarste vak, zodat zij nooit lager kan uitvallen dan de vakweg alleen.
    let (as_min_zaad, _) = detail_over_vakken(&detail_basis, &vakpunten, true, as_min_9_2_1_1);
    match as_min_zaad {
        Some(zaad) => {
            let mut c = as_min_over_sneden(
                &detail_basis,
                &ugt_sneden,
                zaad,
                input.forces_envelope.len(),
            );
            if let Some(m) = zonemelding(
                &vakken,
                &input.forces_envelope,
                ugt_sneden.len(),
                "de aanwezige trekwapening waartegen A_s,min wordt afgezet is per snede die van \
                 het stuk staaf waar de snede ligt.",
            ) {
                c.notes.push(m);
            }
            checks.push(make_resistance(c));
        }
        // Vangnet: geen enkel vak draagt een krachtenpunt. Eén aanroep op de
        // korf van de invoer levert de juiste id, titel en artikelverwijzing;
        // de uitkomst zelf wordt vervangen door de reden, zodat het rapport
        // deze eis op zijn vaste plaats toont met "N/A" en niet met een getal.
        None => {
            let sjabloon = as_min_9_2_1_1(&detail_basis.invoer(&bend_korf, bend_state));
            checks.push(niet_uitgevoerd(
                &sjabloon.id,
                &sjabloon.title,
                &sjabloon.article,
                bend_state,
                "de omhullende draagt in geen enkel stuk van de staaf een rekenpunt, en A_s,min \
                 hangt van (M_Ed; N_Ed) af. Er is niets aangenomen."
                    .to_string(),
            ));
        }
    }

    for (id, leest_de_krachten, toets) in vaktoetsen {
        // Op de plaats waar `detailleringstoetsen` de balkbreedte zet: zij is
        // de enige die het ELEMENT toetst en niet een stuk staaf, dus zij loopt
        // één keer, op de snede met het grootste moment zoals altijd.
        if id == "8.2_vrije_staafafstand" {
            checks.push(make_resistance(min_balkbreedte_9_2(
                &detail_basis.invoer(&bend_korf, bend_state),
            )));
        }
        let (uitkomst, overgeslagen) =
            detail_over_vakken(&detail_basis, &vakpunten, leest_de_krachten, toets);
        match uitkomst {
            Some(c) => checks.push(make_resistance(c)),
            // Zelfde vangnet als bij A_s,min hierboven: de sjabloonaanroep
            // levert alleen id, titel en artikel, nooit een uitkomst.
            None => {
                let sjabloon = toets(&detail_basis.invoer(&bend_korf, bend_state));
                checks.push(niet_uitgevoerd(
                    &sjabloon.id,
                    &sjabloon.title,
                    &sjabloon.article,
                    bend_state,
                    format!(
                        "deze eis heeft een krachtenpunt nodig (d volgt uit het teken van M_Ed) \
                         en de omhullende draagt er geen op {}. Er is niets aangenomen.",
                        overgeslagen.join("; ")
                    ),
                ));
            }
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
