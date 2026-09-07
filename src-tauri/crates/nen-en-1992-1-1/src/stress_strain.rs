//! Spanning-rekrelaties voor beton en betonstaal.
//!
//! Twee verschillende betondiagrammen, voor twee verschillende doelen. Ze
//! staan hier naast elkaar en mogen niet door elkaar worden gehaald:
//!
//! 1. **Doorsnedetoetsing (weerstand)** — [`ConcreteDesignCurve`], het
//!    parabool-rechthoekdiagram van **3.1.7(1)** met f_cd. Dat is het diagram
//!    van de momentweerstand en het interactiediagram.
//! 2. **Niet-lineaire constructieve berekening (stijfheid)** —
//!    [`ConcreteNonlinearCurve`], vergelijking **(3.14)** van 3.1.5, waarnaar
//!    **5.8.6(3)** verwijst. Dat is het diagram waarmee de secante
//!    buigstijfheid van [`crate::stiffness`] wordt bepaald.
//!
//! Het verschil is niet cosmetisch: de begintangens van het
//! parabool-rechthoekdiagram is f_cd·n/ε_c2 ≈ 20 000 N/mm² voor C30/37,
//! terwijl (3.14) met E_cd = E_cm/1,2 op 1,05·27 500 = 28 875 N/mm² begint.
//!
//! [`DesignMaterial::new`] levert diagram 1; [`DesignMaterial::nonlinear`]
//! levert diagram 1 voor de rekgrenzen én diagram 2 voor de spanningen.
//!
//! Tekenconventie in deze module: **druk positief**, voor beton én staal.

use crate::data::{ConcreteClass, ReinforcementGrade};
use crate::factors::{self, DesignSituation};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Parabool-rechthoekdiagram voor beton onder druk, 3.1.7(1), figuur 3.3.
///
/// Vergelijkingen (3.17) en (3.18):
///
/// * σ_c = f_cd·[1 − (1 − ε_c/ε_c2)^n]   voor 0 ≤ ε_c ≤ ε_c2   (3.17)
/// * σ_c = f_cd                          voor ε_c2 ≤ ε_c ≤ ε_cu2 (3.18)
///
/// met n, ε_c2 en ε_cu2 uit tabel 3.1.
///
/// Leesbaarheid van de bron: in de tekstextractie van de norm zijn de
/// geldigheidsbereiken "voor 0 ≤ ε_c ≤ ε_c2 (3.17)" en "voor ε_c2 ≤ ε_c ≤
/// ε_cu2 (3.18)" en de verklaring "n is de exponent volgens tabel 3.1" wél
/// leesbaar, de formule-inhoud van (3.17) zelf niet (formulebeeld). De hier
/// gebruikte vorm is de algemeen bekende parabool-rechthoekformule; hij is
/// gecontroleerd op de randvoorwaarden die uit de leesbare tekst volgen
/// (σ_c(0) = 0, σ_c(ε_c2) = f_cd, gladde overgang naar het plateau) en op de
/// analytische integraal van de parabool (zie de tests in `mnkappa`).
///
/// Boven ε_cu2 geeft `sigma` het plateau f_cd terug; de grensrek wordt niet
/// hier maar in de doorsnedeberekening bewaakt (6.1(3)), zodat het
/// evenwichtsalgoritme overal een gedefinieerde spanning heeft.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ConcreteDesignCurve {
    pub f_cd: f64,
    pub eps_c2: f64,
    pub eps_cu2: f64,
    pub n: f64,
}

impl ConcreteDesignCurve {
    /// Spanning in N/mm² bij rek `eps` (druk positief).
    pub fn sigma(&self, eps: f64) -> f64 {
        if eps <= 0.0 {
            0.0
        } else if eps < self.eps_c2 {
            self.f_cd * (1.0 - (1.0 - eps / self.eps_c2).powf(self.n))
        } else {
            self.f_cd
        }
    }
}

/// Op welke sterkte- en stijfheidswaarden de (3.14)-kromme is gebaseerd.
///
/// * [`NonlinearBasis::DesignValues`] — 5.8.6(3): "Met spanning-rekdiagrammen
///   gebaseerd op rekenwaarden, is uit de berekening direct een rekenwaarde
///   van de bezwijkbelasting verkregen. In vergelijking (3.14) en in de
///   k‑waarde is f_cm dan vervangen door de rekenwaarde van de druksterkte
///   f_cd, en E_cm door E_cd = E_cm/γ_cE (5.20)." Voor de uiterste
///   grenstoestand.
/// * [`NonlinearBasis::MeanValues`] — 3.1.5 zoals hij er staat, met f_cm en
///   E_cm uit tabel 3.1. Voor de bruikbaarheidsgrenstoestand, waar 7.4.3 de
///   vervormingsberekening op gemiddelde eigenschappen baseert ("In het
///   algemeen zal de beste schatting van het gedrag zijn verkregen indien
///   f_ctm is gebruikt", 7.4.3(4)).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum NonlinearBasis {
    /// Rekenwaarden f_cd en E_cd = E_cm/γ_cE — uiterste grenstoestand, 5.8.6(3).
    #[default]
    DesignValues,
    /// Gemiddelde waarden f_cm en E_cm — bruikbaarheidsgrenstoestand, 3.1.5/7.4.3.
    MeanValues,
}

impl NonlinearBasis {
    /// Korte aanduiding voor het rapport.
    pub fn label(&self) -> &'static str {
        match self {
            NonlinearBasis::DesignValues => "UGT (rekenwaarden f_cd, E_cd = E_cm/1,2)",
            NonlinearBasis::MeanValues => "BGT (gemiddelde waarden f_cm, E_cm)",
        }
    }
}

/// Hoe de betontrekzijde van de (3.14)-kromme wordt behandeld.
///
/// De norm geeft bij 3.1.5 geen trektak — (3.14) beschrijft alleen de
/// drukzijde. Wat er wel staat, staat op twee plaatsen, en die twee leveren
/// verschillende takken op:
///
/// * **5.8.6(5)**: "Met het gunstige effect van 'tension stiffening' mag
///   rekening zijn gehouden. OPMERKING Dit effect is gunstig en mag om
///   redenen van eenvoud altijd zijn verwaarloosd." → [`ConcreteTension::None`].
/// * **7.4.3(3)**: elementen worden ofwel "als ongescheurd … beschouwd"
///   (→ [`ConcreteTension::LinearUncracked`]) ofwel "volledig gescheurd"
///   (→ [`ConcreteTension::None`]), en tussen die twee wordt met (7.18)
///   geïnterpoleerd.
/// * **7.4.3(4)**: "In het algemeen zal de beste schatting van het gedrag
///   zijn verkregen indien f_ctm is gebruikt" → [`ConcreteTension::UpToFctm`],
///   het werkelijke gedrag van één doorsnede: trek tot f_ctm, daarna niets.
///
/// **Waarom die drie en niet twee.** [`ConcreteTension::UpToFctm`] kapt de
/// trekspanning bij f_ctm bros af. Daardoor is M(κ) niet monotoon: zodra de
/// uiterste vezel scheurt valt een flinke trekkracht ineens weg en zákt het
/// moment, om daarna weer te klimmen. Voor de referentiedoorsnede zonder
/// normaalkracht loopt M op tot ruim 36 kNm, valt terug tot ongeveer 20 kNm
/// en klimt dan verder. Dat is precies de reden dat 7.4.3 níét met zo'n bros
/// afgekapt doorsnedemodel rekent maar tussen twee gladde modellen
/// interpoleert. [`crate::stiffness::ei_secant`] doet dat dan ook: hij zet de
/// trektak zelf op `LinearUncracked` (α_I) en `None` (α_II) en interpoleert
/// met (7.18).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ConcreteTension {
    /// Geen betontrek. De uiterste grenstoestand (5.8.6(5)) én de "volledig
    /// gescheurde toestand" α_II van 7.4.3(3).
    #[default]
    None,
    /// Lineair-elastisch tot f_ctm (tabel 3.1), daarboven gescheurd — het
    /// gedrag van één doorsnede, 7.4.3(4).
    UpToFctm,
    /// Lineair-elastisch zonder afkap: de doorsnede wordt "als ongescheurd
    /// beschouwd" — de toestand α_I van 7.4.3(3).
    LinearUncracked,
}

/// Spanning-rekrelatie voor de niet-lineaire constructieve berekening,
/// **3.1.5(1), vergelijking (3.14)**, figuur 3.2.
///
/// **Hoe (3.14) is gelezen.** De formule staat in de PDF-uitgave als
/// formulebeeld en komt met `pdftotext` niet mee; alleen de
/// variabelendefinities eronder wel. De bladzijde met 3.1.5 (PDF-pagina
/// 37/294) is daarom als afbeelding gerenderd en van het beeld afgelezen.
/// Wat daar staat:
///
/// ```text
///   σ_c        k·η − η²
///   ───  =  ───────────────                                        (3.14)
///   f_cm     1 + (k − 2)·η
/// ```
///
/// met, uit de wél leesbare tekst eronder:
///
/// * η = ε_c/ε_c1;
/// * ε_c1 is de vervorming bij de piekspanning volgens tabel 3.1;
/// * k = 1,05·E_cm × |ε_c1|/f_cm (f_cm volgens tabel 3.1);
/// * "Vergelijking (3.14) is geldig voor 0 < |ε_c| < |ε_cu1| waarin ε_cu1 de
///   nominale grenswaarde van de stuik is."
///
/// Controle op de gelezen vorm: bij η = 1 levert (3.14) (k − 1)/(k − 1) = 1,
/// dus σ_c = f_cm precies bij ε_c1 — de piek van figuur 3.2. De begintangens
/// is f_cm·k/ε_c1 = 1,05·E_cm, wat de factor 1,05 in k verklaart (figuur 3.2
/// definieert E_cm als secans naar 0,4·f_cm, niet als raaklijn in de
/// oorsprong). Beide volgen alleen uit de gelezen vorm; ze zouden bij een
/// verkeerd afgelezen formule niet uitkomen. Ze staan als test in deze
/// module.
///
/// **De rekenwaardenvariant.** 5.8.6(3): "In vergelijking (3.14) **en in de
/// k‑waarde** is f_cm dan vervangen door de rekenwaarde van de druksterkte
/// f_cd, en E_cm door E_cd = E_cm/γ_cE". De vervanging geldt dus óók in k;
/// dat staat er letterlijk ("en in de kwaarde", in de tekstextractie zonder
/// koppelteken). Met f_cd en E_cd wordt k = 1,05·E_cd·|ε_c1|/f_cd. ε_c1 en
/// ε_cu1 blijven de tabelwaarden van tabel 3.1 — 5.8.6(3) vervangt alleen
/// f_cm en E_cm, geen rekken.
///
/// **Kruip, 5.8.6(4).** "Bij gebrek aan meer verfijnde modellen mag met kruip
/// rekening zijn gehouden door alle waarden van de rek in het
/// spanning-rekdiagram van het beton, volgens 5.8.6(3), te vermenigvuldigen
/// met een factor (1 + φ_ef)." Alle *rekwaarden* maal (1 + φ_ef) betekent dat
/// de kromme langs de rekas wordt opgerekt: σ_nieuw(ε) = σ_oud(ε/(1 + φ_ef)).
/// Dat is hier zo geïmplementeerd door ε_c1 en ε_cu1 met (1 + φ_ef) te
/// vermenigvuldigen en k met de **ongeschaalde** ε_c1 te berekenen; de
/// begintangens wordt daarmee vanzelf 1,05·E_c/(1 + φ_ef), wat het beoogde
/// verslappende effect van kruip is. φ_ef staat als veld in de struct en in
/// de uitvoer van [`crate::stiffness`], ook als hij nul is — nooit een
/// stilzwijgende nul.
///
/// **Betontrek.** De norm geeft bij 3.1.5 geen trektak; (3.14) beschrijft
/// alleen de drukzijde ("waarbij de absolute waarden van de drukspanning en
/// stuik gegeven zijn"). Voor de uiterste grenstoestand hoeft dat ook niet:
/// 5.8.6(5) staat verwaarlozen uitdrukkelijk toe. Voor de
/// bruikbaarheidsgrenstoestand rekent 7.4.3(4) mét treksterkte, en "in het
/// algemeen zal de beste schatting van het gedrag zijn verkregen indien f_ctm
/// is gebruikt". Daarom: een lineair-elastische trektak tot f_ctm (tabel
/// 3.1), daarboven geen trekspanning meer. De helling van die trektak is niet
/// door de norm gegeven; hier is de begintangens van (3.14) zelf genomen,
/// zodat het diagram in de oorsprong C¹ is en er geen nieuwe getalswaarde
/// bijkomt. Welke trektak geldt, staat in [`ConcreteTension`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ConcreteNonlinearCurve {
    /// Waarop de kromme is gebaseerd — zichtbaar in de uitvoer, nooit impliciet.
    pub basis: NonlinearBasis,
    /// f_cd (UGT, 5.8.6(3)) of f_cm (BGT, tabel 3.1), N/mm².
    pub f_c: f64,
    /// E_cd = E_cm/γ_cE (UGT, vgl. (5.20)) of E_cm (BGT, tabel 3.1), N/mm².
    pub e_c: f64,
    /// k = 1,05·E_c·|ε_c1|/f_c, met de **ongeschaalde** ε_c1 van tabel 3.1.
    pub k: f64,
    /// ε_c1 (tabel 3.1) × (1 + φ_ef) — 5.8.6(4).
    pub eps_c1: f64,
    /// ε_cu1 (tabel 3.1) × (1 + φ_ef) — 5.8.6(4).
    pub eps_cu1: f64,
    /// Effectieve kruipcoëfficiënt volgens 5.8.4 (5.8.6(4)). 0 = zonder kruip.
    pub phi_ef: f64,
    /// f_ctm volgens tabel 3.1 — de tabelwaarde, ongeacht welke trektak
    /// geldt. Het scheurmoment van [`crate::stiffness`] gebruikt deze.
    pub f_ctm: f64,
    /// Welke trektak geldt — zie [`ConcreteTension`].
    pub tension: ConcreteTension,
}

impl ConcreteNonlinearCurve {
    /// Bouw de kromme uit een sterkteklasse (tabel 3.1).
    ///
    /// `situation` bepaalt γ_C voor f_cd (tabel 2.1N) en telt alleen mee bij
    /// [`NonlinearBasis::DesignValues`]; γ_cE = 1,2 is niet van de
    /// ontwerpsituatie afhankelijk (NB bij 5.8.6(3)).
    pub fn new(
        concrete: &ConcreteClass,
        basis: NonlinearBasis,
        situation: DesignSituation,
        phi_ef: f64,
    ) -> Self {
        let (f_c, e_c, tension) = match basis {
            NonlinearBasis::DesignValues => (
                factors::f_cd(concrete.f_ck, factors::ALPHA_CC, factors::gamma_c(situation)),
                factors::e_cd(concrete.e_cm),
                // 5.8.6(5): betontrek mag in de UGT worden verwaarloosd.
                ConcreteTension::None,
            ),
            // 7.4.3(4): trek tot f_ctm, "de beste schatting van het gedrag".
            NonlinearBasis::MeanValues => {
                (concrete.f_cm, concrete.e_cm, ConcreteTension::UpToFctm)
            }
        };
        // k met de ongeschaalde ε_c1 van tabel 3.1 (5.8.6(4) rekt de rekas op,
        // niet de definitie van k).
        let k = if f_c > 0.0 { 1.05 * e_c * concrete.eps_c1.abs() / f_c } else { 0.0 };
        let stretch = 1.0 + phi_ef.max(0.0);
        Self {
            basis,
            f_c,
            e_c,
            k,
            eps_c1: concrete.eps_c1 * stretch,
            eps_cu1: concrete.eps_cu1 * stretch,
            phi_ef,
            f_ctm: concrete.f_ctm,
            tension,
        }
    }

    /// Begintangens van het diagram, N/mm²: dσ/dε in ε = 0.
    ///
    /// Volgt uit (3.14) zelf: d/dε[(kη − η²)/(1 + (k − 2)η)]·f_c bij η = 0 is
    /// f_c·k/ε_c1. Met k = 1,05·E_c·|ε_c1|/f_c en de door 5.8.6(4) opgerekte
    /// ε_c1 komt daar 1,05·E_c/(1 + φ_ef) uit.
    pub fn e_c0(&self) -> f64 {
        if self.eps_c1 > 0.0 {
            self.f_c * self.k / self.eps_c1
        } else {
            0.0
        }
    }

    /// Rek waarbij de trektak f_ctm bereikt (positief getal: de |ε| waarbij
    /// dat gebeurt). 0 als de trektak niet bij f_ctm afkapt.
    pub fn eps_ct(&self) -> f64 {
        let e0 = self.e_c0();
        if matches!(self.tension, ConcreteTension::UpToFctm) && self.f_ctm > 0.0 && e0 > 0.0 {
            self.f_ctm / e0
        } else {
            0.0
        }
    }

    /// Dezelfde kromme met een andere trektak.
    pub fn with_tension(&self, tension: ConcreteTension) -> Self {
        Self { tension, ..*self }
    }

    /// Dezelfde kromme zonder betontrek — de volledig gescheurde toestand
    /// α_II van 7.4.3(3), en de UGT-vorm van 5.8.6(5).
    pub fn cracked(&self) -> Self {
        self.with_tension(ConcreteTension::None)
    }

    /// Dezelfde kromme "als ongescheurd beschouwd" — de toestand α_I van
    /// 7.4.3(3): lineair-elastische trek zonder afkap.
    pub fn uncracked(&self) -> Self {
        self.with_tension(ConcreteTension::LinearUncracked)
    }

    /// Spanning in N/mm² bij rek `eps` (**druk positief**).
    ///
    /// Boven ε_cu1 is (3.14) niet meer geldig ("geldig voor 0 < |ε_c| <
    /// |ε_cu1|"). Om het evenwichtsalgoritme overal een gedefinieerde
    /// spanning te geven wordt daar de waarde bij ε_cu1 vastgehouden; dat is
    /// géén normuitspraak maar een numerieke afspraak, en de overschrijding
    /// wordt door [`crate::stiffness`] als vlag gemeld zodat de aanroeper
    /// erop kan handelen.
    pub fn sigma(&self, eps: f64) -> f64 {
        if eps > 0.0 {
            let eta = (eps / self.eps_c1).min(self.eps_cu1 / self.eps_c1);
            let noemer = 1.0 + (self.k - 2.0) * eta;
            if noemer <= 0.0 {
                return 0.0;
            }
            self.f_c * (self.k * eta - eta * eta) / noemer
        } else if eps < 0.0 {
            match self.tension {
                ConcreteTension::None => 0.0,
                ConcreteTension::LinearUncracked => self.e_c0() * eps,
                ConcreteTension::UpToFctm => {
                    let s = self.e_c0() * eps;
                    if -s <= self.f_ctm {
                        s
                    } else {
                        0.0
                    }
                }
            }
        } else {
            0.0
        }
    }
}

/// Keuze van de bovenste tak van het staaldiagram, 3.2.7(2), figuur 3.8.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/concrete/")]
pub enum SteelBranch {
    /// 3.2.7(2)b: horizontale bovenste tak op f_yd, zonder rekgrens.
    #[default]
    Horizontal,
    /// 3.2.7(2)a: hellende bovenste tak van (ε_yd, f_yd) naar
    /// (ε_uk, k·f_yk/γ_S), met rekgrens ε_ud = 0,9·ε_uk (NB).
    Inclined,
}

/// Bilineair rekendiagram voor betonstaal, 3.2.7(2), figuur 3.8.
///
/// Elastisch tot ε_yd = f_yd/E_s, daarboven volgens [`SteelBranch`]. Het
/// diagram is oneven (trek en druk gelijk).
///
/// Leesbaarheid van de bron: leesbaar zijn "k = (f_t/f_y)_k", de maximale
/// spanning k·f_yk/γ_S bij ε_uk, "een horizontale bovenste tak waarbij de
/// maximale rek niet hoeft te zijn gecontroleerd", de NB-bepaling ε_ud =
/// 0,9·ε_uk en E_s = 200 GPa (3.2.7(4)). Figuur 3.8 zelf is niet leesbaar;
/// de hellende tak is de rechte tussen de twee punten die de tekst noemt.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SteelDesignCurve {
    pub f_yd: f64,
    pub e_s: f64,
    /// ε_yd = f_yd / E_s.
    pub eps_yd: f64,
    /// k·f_yk/γ_S — spanning aan het eind van de hellende tak (bij ε_uk).
    pub f_ud_inclined: f64,
    pub eps_uk: f64,
    /// ε_ud = 0,9·ε_uk (NB bij 3.2.7(2)).
    pub eps_ud: f64,
    pub branch: SteelBranch,
}

impl SteelDesignCurve {
    /// Spanning in N/mm² bij rek `eps`; teken volgt de rek.
    pub fn sigma(&self, eps: f64) -> f64 {
        let a = eps.abs();
        let s = if a <= self.eps_yd {
            self.e_s * a
        } else {
            match self.branch {
                SteelBranch::Horizontal => self.f_yd,
                SteelBranch::Inclined => {
                    if a >= self.eps_uk {
                        self.f_ud_inclined
                    } else {
                        self.f_yd
                            + (self.f_ud_inclined - self.f_yd) * (a - self.eps_yd)
                                / (self.eps_uk - self.eps_yd)
                    }
                }
            }
        };
        if eps < 0.0 {
            -s
        } else {
            s
        }
    }

    /// Geldt er een rekgrens voor het staal? Alleen bij de hellende tak
    /// (3.2.7(2)b: bij de horizontale tak hoeft de rek niet te worden
    /// gecontroleerd). De M-N-κ-berekening gebruikt ε_ud bij de horizontale
    /// tak wél als praktisch eindpunt van het diagram — zie `mnkappa`.
    pub fn has_strain_limit(&self) -> bool {
        matches!(self.branch, SteelBranch::Inclined)
    }
}

/// Alle rekenwaarden van één beton-staalcombinatie, klaar voor de
/// doorsnedeberekening.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DesignMaterial {
    pub concrete_name: &'static str,
    pub steel_name: &'static str,
    pub f_ck: f64,
    pub gamma_c: f64,
    pub alpha_cc: f64,
    pub concrete: ConcreteDesignCurve,
    /// ε_c3 en ε_cu3 (tabel 3.1) voor de rechthoekige spanningsverdeling (3.1.7(3)).
    pub eps_c3: f64,
    pub eps_cu3: f64,
    /// λ en η (3.19)–(3.22).
    pub lambda: f64,
    pub eta: f64,
    pub f_yk: f64,
    pub gamma_s: f64,
    pub k: f64,
    pub steel: SteelDesignCurve,
    /// Optioneel: de (3.14)-kromme van 3.1.5 voor de **niet-lineaire
    /// constructieve berekening** (5.8.6(3)).
    ///
    /// `None` — de stand van [`DesignMaterial::new`] — betekent: reken met
    /// het parabool-rechthoekdiagram van 3.1.7(1), zoals de doorsnedetoetsing
    /// doet. Dit veld is **toegevoegd, niets is vervangen**: met `None` levert
    /// [`DesignMaterial::sigma_c`] exact `self.concrete.sigma`, dus de
    /// momentweerstand en het interactiediagram zijn onveranderd.
    pub nonlinear: Option<ConcreteNonlinearCurve>,
}

impl DesignMaterial {
    pub fn new(
        concrete: &ConcreteClass,
        steel: &ReinforcementGrade,
        situation: DesignSituation,
        branch: SteelBranch,
    ) -> Self {
        let gamma_c = factors::gamma_c(situation);
        let gamma_s = factors::gamma_s(situation);
        let f_cd = factors::f_cd(concrete.f_ck, factors::ALPHA_CC, gamma_c);
        let f_yd = factors::f_yd(steel.f_yk, gamma_s);
        DesignMaterial {
            concrete_name: concrete.name,
            steel_name: steel.name,
            f_ck: concrete.f_ck,
            gamma_c,
            alpha_cc: factors::ALPHA_CC,
            concrete: ConcreteDesignCurve {
                f_cd,
                eps_c2: concrete.eps_c2,
                eps_cu2: concrete.eps_cu2,
                n: concrete.n,
            },
            eps_c3: concrete.eps_c3,
            eps_cu3: concrete.eps_cu3,
            lambda: factors::lambda(concrete.f_ck),
            eta: factors::eta(concrete.f_ck),
            f_yk: steel.f_yk,
            gamma_s,
            k: steel.k,
            steel: SteelDesignCurve {
                f_yd,
                e_s: factors::E_S,
                eps_yd: f_yd / factors::E_S,
                f_ud_inclined: steel.k * steel.f_yk / gamma_s,
                eps_uk: steel.eps_uk,
                eps_ud: factors::eps_ud(steel.eps_uk),
                branch,
            },
            nonlinear: None,
        }
    }

    /// Zelfde materiaal, maar met de (3.14)-kromme van 3.1.5 erbij voor de
    /// **niet-lineaire constructieve berekening** (5.8.6(3)).
    ///
    /// Het parabool-rechthoekdiagram blijft in `concrete` staan — de
    /// rekgrenzen ε_c2/ε_cu2 van 6.1(3)–(4) en de factoren λ/η van 3.1.7(3)
    /// blijven dus bereikbaar — maar [`DesignMaterial::sigma_c`] gebruikt
    /// vanaf nu (3.14).
    ///
    /// Het **staaldiagram blijft 3.2.7 met f_yd**, ook bij
    /// [`NonlinearBasis::MeanValues`]. 5.8.6(3) verwijst voor staal naar
    /// 3.2.7/figuur 3.8 en zegt niets over een gemiddelde-waardenvariant voor
    /// staal; in de bruikbaarheidsgrenstoestand blijft het staal ruim
    /// elastisch (σ_s = E_s·ε_s), dus de keuze f_yd/f_yk is daar zonder
    /// gevolg. Zie het verslag: dit is bewust niet ingevuld.
    pub fn nonlinear(
        concrete: &ConcreteClass,
        steel: &ReinforcementGrade,
        situation: DesignSituation,
        branch: SteelBranch,
        basis: NonlinearBasis,
        phi_ef: f64,
    ) -> Self {
        let mut m = Self::new(concrete, steel, situation, branch);
        m.nonlinear = Some(ConcreteNonlinearCurve::new(concrete, basis, situation, phi_ef));
        m
    }

    /// Betonspanning bij rek `eps` (druk positief) volgens het diagram dat
    /// bij dit materiaal hoort: (3.14) als er een niet-lineaire kromme is,
    /// anders het parabool-rechthoekdiagram van 3.1.7(1).
    pub fn sigma_c(&self, eps: f64) -> f64 {
        match &self.nonlinear {
            Some(c) => c.sigma(eps),
            None => self.concrete.sigma(eps),
        }
    }

    /// Zelfde materiaal met een andere betontrektak — zie [`ConcreteTension`].
    /// Zonder niet-lineaire kromme gebeurt er niets.
    pub fn with_concrete_tension(&self, tension: ConcreteTension) -> Self {
        let mut m = *self;
        if let Some(c) = m.nonlinear {
            m.nonlinear = Some(c.with_tension(tension));
        }
        m
    }

    /// f_ctm volgens tabel 3.1, als dit materiaal een niet-lineaire kromme heeft.
    pub fn f_ctm(&self) -> Option<f64> {
        self.nonlinear.map(|c| c.f_ctm)
    }

    pub fn f_cd(&self) -> f64 {
        self.concrete.f_cd
    }

    pub fn f_yd(&self) -> f64 {
        self.steel.f_yd
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{concrete_class_by_name, reinforcement_grade_by_name};
    use approx::assert_relative_eq;

    fn c30_b500b(branch: SteelBranch) -> DesignMaterial {
        DesignMaterial::new(
            concrete_class_by_name("C30/37").unwrap(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            branch,
        )
    }

    #[test]
    fn parabool_rechthoek_randwaarden() {
        let m = c30_b500b(SteelBranch::Horizontal);
        let c = m.concrete;
        assert_relative_eq!(c.sigma(0.0), 0.0);
        assert_relative_eq!(c.sigma(-0.001), 0.0); // trek: geen spanning (6.1(2))
        assert_relative_eq!(c.sigma(0.002), 20.0); // ε_c2 → f_cd
        assert_relative_eq!(c.sigma(0.0035), 20.0); // plateau tot ε_cu2
        // Halverwege de parabool: 1 − (1 − 0,5)² = 0,75 → 15 N/mm².
        assert_relative_eq!(c.sigma(0.001), 15.0);
        // Gladde overgang: de helling bij ε_c2 is verwaarloosbaar ten opzichte
        // van de beginhelling f_cd·n/ε_c2 = 20 000 N/mm² per eenheid rek.
        let d = (c.sigma(0.002) - c.sigma(0.002 - 1e-7)) / 1e-7;
        let beginhelling = c.f_cd * c.n / c.eps_c2;
        assert!(d.abs() < 1e-3 * beginhelling, "helling bij ε_c2 = {d}");
    }

    #[test]
    fn staal_bilineair_horizontaal() {
        let s = c30_b500b(SteelBranch::Horizontal).steel;
        assert_relative_eq!(s.eps_yd, 434.7826 / 200_000.0, max_relative = 1e-5);
        assert_relative_eq!(s.sigma(0.001), 200.0);
        assert_relative_eq!(s.sigma(-0.001), -200.0);
        assert_relative_eq!(s.sigma(0.010), 434.7826, max_relative = 1e-5);
        assert_relative_eq!(s.sigma(0.100), 434.7826, max_relative = 1e-5);
        assert!(!s.has_strain_limit());
    }

    fn c30() -> &'static crate::data::ConcreteClass {
        concrete_class_by_name("C30/37").unwrap()
    }

    /// Onafhankelijke controle op de van de bladzijde afgelezen vorm van
    /// (3.14). Twee eigenschappen die alleen bij de juiste formule uitkomen:
    /// bij η = 1 is σ_c = f_c (de piek van figuur 3.2 bij ε_c1) en de
    /// begintangens is 1,05·E_c (de factor 1,05 in k).
    #[test]
    fn vgl_3_14_piek_en_begintangens() {
        for basis in [NonlinearBasis::DesignValues, NonlinearBasis::MeanValues] {
            let c = ConcreteNonlinearCurve::new(c30(), basis, DesignSituation::PersistentTransient, 0.0);
            assert_relative_eq!(c.sigma(c.eps_c1), c.f_c, max_relative = 1e-12);
            // Begintangens uit een differentiequotiënt, niet uit e_c0().
            let d = c.sigma(1e-9) / 1e-9;
            assert_relative_eq!(d, 1.05 * c.e_c, max_relative = 1e-6);
            assert_relative_eq!(c.e_c0(), 1.05 * c.e_c, max_relative = 1e-12);
            // De kromme stijgt tot de piek en daalt erna (figuur 3.2).
            assert!(c.sigma(0.5 * c.eps_c1) < c.f_c);
            assert!(c.sigma(1.2 * c.eps_c1) < c.f_c);
            assert!(c.sigma(0.5 * c.eps_c1) > c.sigma(0.25 * c.eps_c1));
        }
    }

    /// De getalswaarden van de twee varianten voor C30/37, elk terug te
    /// rekenen uit tabel 3.1 en 5.8.6(3).
    #[test]
    fn vgl_3_14_twee_varianten_c30_37() {
        let sit = DesignSituation::PersistentTransient;
        // UGT: f_cd = 1,0·30/1,5 = 20; E_cd = 33 000/1,2 = 27 500;
        //      k = 1,05·27 500·0,0022/20 = 3,17625.
        let ugt = ConcreteNonlinearCurve::new(c30(), NonlinearBasis::DesignValues, sit, 0.0);
        assert_relative_eq!(ugt.f_c, 20.0);
        assert_relative_eq!(ugt.e_c, 27_500.0);
        assert_relative_eq!(ugt.k, 1.05 * 27_500.0 * 0.0022 / 20.0, max_relative = 1e-12);
        assert_relative_eq!(ugt.k, 3.17625, max_relative = 1e-9);
        assert_relative_eq!(ugt.eps_c1, 0.0022);
        assert_relative_eq!(ugt.eps_cu1, 0.0035);
        assert_eq!(ugt.tension, ConcreteTension::None); // 5.8.6(5)
        assert_relative_eq!(ugt.f_ctm, 2.9); // tabel 3.1, wel bekend

        // BGT: f_cm = 38; E_cm = 33 000; k = 1,05·33 000·0,0022/38 = 2,00605…
        let bgt = ConcreteNonlinearCurve::new(c30(), NonlinearBasis::MeanValues, sit, 0.0);
        assert_relative_eq!(bgt.f_c, 38.0);
        assert_relative_eq!(bgt.e_c, 33_000.0);
        assert_relative_eq!(bgt.k, 1.05 * 33_000.0 * 0.0022 / 38.0, max_relative = 1e-12);
        assert_eq!(bgt.tension, ConcreteTension::UpToFctm); // f_ctm, 7.4.3(4)

        // De UGT-kromme is over de hele drukzijde slapper dan de BGT-kromme,
        // maar veel stijver dan het parabool-rechthoekdiagram van 3.1.7.
        let pr = DesignMaterial::new(
            c30(),
            reinforcement_grade_by_name("B500B").unwrap(),
            sit,
            SteelBranch::Horizontal,
        );
        let begin_pr = pr.concrete.f_cd * pr.concrete.n / pr.concrete.eps_c2;
        assert_relative_eq!(begin_pr, 20_000.0);
        assert!(ugt.e_c0() > 1.4 * begin_pr, "E_c0 = {}", ugt.e_c0());
    }

    /// 5.8.6(4): alle rekwaarden maal (1 + φ_ef). De kromme wordt langs de
    /// rekas opgerekt — dezelfde spanningen bij (1 + φ_ef) maal de rek — en
    /// de begintangens wordt dus (1 + φ_ef) maal kleiner.
    #[test]
    fn kruip_rekt_de_rekas_op_5_8_6_4() {
        let sit = DesignSituation::PersistentTransient;
        let zonder = ConcreteNonlinearCurve::new(c30(), NonlinearBasis::DesignValues, sit, 0.0);
        let met = ConcreteNonlinearCurve::new(c30(), NonlinearBasis::DesignValues, sit, 2.0);
        assert_relative_eq!(met.phi_ef, 2.0);
        assert_relative_eq!(met.eps_c1, 3.0 * zonder.eps_c1, max_relative = 1e-12);
        assert_relative_eq!(met.eps_cu1, 3.0 * zonder.eps_cu1, max_relative = 1e-12);
        assert_relative_eq!(met.k, zonder.k, max_relative = 1e-12);
        for e in [0.0005_f64, 0.001, 0.002] {
            assert_relative_eq!(met.sigma(3.0 * e), zonder.sigma(e), max_relative = 1e-12);
        }
        assert_relative_eq!(met.e_c0(), zonder.e_c0() / 3.0, max_relative = 1e-12);
        // φ_ef = 0 is de neutrale stand, niet stilzwijgend: het veld staat er.
        assert_relative_eq!(zonder.phi_ef, 0.0);
    }

    /// Geldigheidsgrens ε_cu1 en de trektak van 7.4.3(4).
    #[test]
    fn geldigheidsgrens_en_trektak() {
        let sit = DesignSituation::PersistentTransient;
        let bgt = ConcreteNonlinearCurve::new(c30(), NonlinearBasis::MeanValues, sit, 0.0);
        // Boven ε_cu1 wordt de waarde bij ε_cu1 vastgehouden (numerieke
        // afspraak; de overschrijding is elders een vlag).
        assert_relative_eq!(bgt.sigma(2.0 * bgt.eps_cu1), bgt.sigma(bgt.eps_cu1));
        // Trektak: lineair met de begintangens tot f_ctm, daarna niets
        // (7.4.3(4)). Dat brosse afkappen is precies wat M(κ) niet-monotoon
        // maakt en waarom 7.4.3(3) tussen twee gladde modellen interpoleert.
        let eps_ct = bgt.eps_ct();
        assert_relative_eq!(eps_ct, 2.9 / bgt.e_c0(), max_relative = 1e-12);
        assert_relative_eq!(bgt.sigma(-0.5 * eps_ct), -0.5 * 2.9, max_relative = 1e-9);
        assert_relative_eq!(bgt.sigma(-eps_ct), -2.9, max_relative = 1e-9);
        assert_relative_eq!(bgt.sigma(-1.001 * eps_ct), 0.0);
        // Volledig gescheurde toestand α_II: geen betontrek meer.
        let ii = bgt.cracked();
        assert_relative_eq!(ii.sigma(-0.5 * eps_ct), 0.0);
        assert_relative_eq!(ii.sigma(0.001), bgt.sigma(0.001));
        // Ongescheurde toestand α_I: lineair-elastisch zonder afkap.
        let i = bgt.uncracked();
        assert_eq!(i.tension, ConcreteTension::LinearUncracked);
        assert_relative_eq!(i.sigma(-eps_ct), -2.9, max_relative = 1e-9);
        assert_relative_eq!(i.sigma(-3.0 * eps_ct), -3.0 * 2.9, max_relative = 1e-9);
        assert_relative_eq!(i.eps_ct(), 0.0); // geen afkap, dus geen scheurrek
        // De UGT kent geen trektak (5.8.6(5)).
        let ugt = ConcreteNonlinearCurve::new(c30(), NonlinearBasis::DesignValues, sit, 0.0);
        assert_relative_eq!(ugt.eps_ct(), 0.0);
        assert_relative_eq!(ugt.sigma(-0.0001), 0.0);
    }

    /// `DesignMaterial::new` blijft het diagram van 3.1.7 gebruiken; alleen
    /// `DesignMaterial::nonlinear` schakelt om naar (3.14).
    #[test]
    fn design_material_new_is_onveranderd() {
        let m = c30_b500b(SteelBranch::Horizontal);
        assert!(m.nonlinear.is_none());
        for e in [-0.001_f64, 0.0, 0.0005, 0.001, 0.002, 0.0035, 0.01] {
            assert_relative_eq!(m.sigma_c(e), m.concrete.sigma(e));
        }
        let nl = DesignMaterial::nonlinear(
            c30(),
            reinforcement_grade_by_name("B500B").unwrap(),
            DesignSituation::PersistentTransient,
            SteelBranch::Horizontal,
            NonlinearBasis::DesignValues,
            0.0,
        );
        // Het parabool-rechthoekdiagram blijft bereikbaar (rekgrenzen 6.1(3)).
        assert_relative_eq!(nl.concrete.eps_cu2, 0.0035);
        assert_relative_eq!(nl.f_cd(), 20.0);
        assert_relative_eq!(nl.steel.f_yd, m.steel.f_yd);
        // Maar de spanning komt nu uit (3.14) en is bij kleine rek hoger: de
        // verhouding nadert de verhouding van de begintangensen,
        // 1,05·27 500 / 20 000 = 1,4438.
        assert_relative_eq!(
            nl.sigma_c(1e-5) / m.sigma_c(1e-5),
            1.05 * 27_500.0 / 20_000.0,
            max_relative = 5e-3
        );
        assert!(nl.sigma_c(0.0002) > 1.3 * m.sigma_c(0.0002));
        assert_relative_eq!(nl.f_ctm().unwrap(), 2.9);
        assert_relative_eq!(
            nl.with_concrete_tension(ConcreteTension::LinearUncracked).sigma_c(-1e-5),
            -1e-5 * nl.nonlinear.unwrap().e_c0(),
            max_relative = 1e-9
        );
        assert_relative_eq!(nl.with_concrete_tension(ConcreteTension::None).sigma_c(-1e-5), 0.0);
    }

    #[test]
    fn staal_bilineair_hellend() {
        let s = c30_b500b(SteelBranch::Inclined).steel;
        // Eindpunt: k·f_yk/γ_S = 1,08 · 500 / 1,15 = 469,57 N/mm² bij ε_uk = 5 %.
        assert_relative_eq!(s.sigma(0.05), 469.5652, max_relative = 1e-5);
        assert_relative_eq!(s.eps_ud, 0.045);
        // Halverwege de hellende tak ligt de spanning tussen f_yd en het eindpunt.
        let mid = s.sigma(0.5 * (s.eps_yd + s.eps_uk));
        assert!(mid > s.f_yd && mid < s.f_ud_inclined);
        assert!(s.has_strain_limit());
    }
}
