//! NEN-EN 1993-1-1 §6.3.2 — lateral-torsional buckling + NB-annex Mcr.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{SteelGrade, NamedValue, UnityCheck, CheckStatus};
use nen_en_1993_1_1_stability::{StabilityCalc, buckling_curve::BucklingCurve};
use section_properties::SectionProperties;

pub mod nb_annex;
pub mod lambda_chi;
pub mod en_general;
mod deelstappen;

use deelstappen::{kip_deelstappen, Kipgegevens, McrVorm};

/// Kipsteunen, als fracties van de staaflengte.
///
/// `Default` is afgeleid, maar de velden hebben **geen** `#[serde(default)]`:
/// een leeg object `{}` in de JSON levert daarom een fout ("missing field")
/// in plaats van stilzwijgend "geen kipsteunen". Dat is gewild — geen
/// kipsteunen moet je opschrijven als twee lege arrays, niet per ongeluk
/// krijgen. `deny_unknown_fields` maakt bovendien een tikfout in een
/// veldnaam zichtbaar in plaats van dat hij ongemerkt wegvalt.
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct LateralBracing {
    pub top_flange_positions: Vec<f64>,
    pub bottom_flange_positions: Vec<f64>,
}

impl LateralBracing {
    /// De kipsteunen die werkelijk aan de **gedrukte** flens zitten, als
    /// fracties van de staaflengte.
    ///
    /// Kip is uitknikken van de gedrukte flens; een steun aan de getrokken
    /// flens houdt die knik niet tegen. Welke flens gedrukt is, verschilt
    /// **per plaats**: een doorgaande ligger heeft hogging boven de steunpunten
    /// en sagging in het veld. Elke steun wordt daarom afzonderlijk beoordeeld
    /// op het moment ter plaatse van díé steun.
    ///
    /// Tekenafspraak van de kern (`mechanics`): M_y positief = trek in de
    /// onderste vezel (doorhangen), dus
    ///  * M_y ≥ 0 (sagging) → **boven**flens gedrukt;
    ///  * M_y ≤ 0 (hogging) → **onder**flens gedrukt.
    ///
    /// De twee grensgevallen overlappen bewust: in een nuldoorgang is geen van
    /// beide flenzen gedrukt en telt een steun aan weerszijden mee, zodat er
    /// precies op M = 0 geen steun wegvalt.
    ///
    /// `m_y_ed_op` levert het rekenmoment (kNm, mét teken) op een gegeven
    /// fractie van de staaflengte; de aanroeper kent de momentenlijn, deze
    /// crate niet.
    ///
    /// **Waarom niet één flens voor de hele staaf**, gekozen op het teken van
    /// het maatgevende moment — zoals hier tot 3 september 2026 stond: dat
    /// maakt de uitkomst discontinu in de belasting. Bij een doorgaande ligger
    /// waarvan het steunpuntsmoment en het veldmoment bijna even groot zijn,
    /// gooit een lastverandering van één procent in één klap álle
    /// bovenflenssteunen weg. Gemeten op een IPE 330 van 9 m met drie
    /// bovenflenssteunen op de kwartpunten: bij een eindmoment van −80 kNm
    /// (veld +82) L_st = 2250 mm en UC = 0,474; bij −81 kNm (veld +81)
    /// L_st = 9000 mm en UC = 1,239. Per steun beoordelen haalt die sprong weg
    /// — op de kwartpunten is het moment in beide gevallen positief, dus tellen
    /// de steunen in beide gevallen mee.
    ///
    /// Resterende beperking, bewust: binnen één kipveld kan het moment alsnog
    /// van teken wisselen. De ongesteunde lengte van de dán gedrukte flens is
    /// korter dan L_st, dus het veld met zijn volle L_st doorrekenen is voor
    /// die zone veilig-zijdig.
    pub fn kipsteunen_op_de_gedrukte_flens(&self, m_y_ed_op: impl Fn(f64) -> f64) -> Vec<f64> {
        let mut uit = Vec::with_capacity(
            self.top_flange_positions.len() + self.bottom_flange_positions.len(),
        );
        uit.extend(
            self.top_flange_positions
                .iter()
                .copied()
                .filter(|f| m_y_ed_op(*f) >= 0.0),
        );
        uit.extend(
            self.bottom_flange_positions
                .iter()
                .copied()
                .filter(|f| m_y_ed_op(*f) <= 0.0),
        );
        uit
    }
}

/// Eén kipveld: het stuk ligger tussen twee opeenvolgende zijdelingse
/// steunpunten (NB.NB.4.3: "tussen twee gaffels, tussen één gaffel en één
/// kipsteun of tussen twee kipsteunen").
#[derive(Clone, Copy, Debug)]
pub struct Kipveld {
    /// De ongesteunde lengte L_st van dit veld, in mm.
    pub l_st_mm: f64,
    /// Rekenwaarde van het buigend moment aan het begin van het veld (kNm,
    /// mét teken, tekenafspraak van de momentenlijn: sagging positief).
    pub m_begin_knm: f64,
    /// Idem aan het eind van het veld.
    pub m_eind_knm: f64,
    /// Rekenwaarde van het buigend moment halverwege het veld (kNm, mét teken).
    ///
    /// **Rekent nergens in mee.** NB.NB.4.3 bepaalt β en B* uit de
    /// EINDmomenten; dit derde moment staat alleen in het rapport, omdat de
    /// lezer aan twee eindmomenten niet kan zien of de momentenlijn er tussenin
    /// doorbuigt of recht loopt — en dus niet kan nagaan of de aanname
    /// "gelijkmatig verdeelde belasting plus eindmomenten" van NB.NB.4.3(3)
    /// hier opgaat. De aanroeper kent de momentenlijn en vult het in; 0 is een
    /// geldige waarde voor "niet bekend".
    pub m_midden_knm: f64,
    /// `true` als het veld aan **beide** zijden door een gaffel wordt
    /// begrensd. Dan geldt L_kip = L_st; anders de formule met β. Zie
    /// [`nb_annex::l_kip`].
    pub tussen_gaffels: bool,
}

impl Kipveld {
    /// De twee eindmomenten van dit veld, geordend als (M_y,1,Ed ; M_y,2,Ed):
    /// eerst het eindmoment met de **kleinste** absolute waarde, dan dat met de
    /// **grootste**. Dat is de nummering van NB.NB.4.3, waar β = M_1/M_2.
    ///
    /// Bestaat naast [`Self::beta_en_grootste_eindmoment`] omdat het rapport
    /// béíde momenten toont en die functie alleen het grootste teruggeeft; haar
    /// signatuur is niet veranderd, want daar hangen tests aan.
    pub fn eindmomenten_knm(&self) -> (f64, f64) {
        if self.m_begin_knm.abs() <= self.m_eind_knm.abs() {
            (self.m_begin_knm, self.m_eind_knm)
        } else {
            (self.m_eind_knm, self.m_begin_knm)
        }
    }

    /// NB.NB.4.3 — β = M_y,1,Ed / M_y,2,Ed, met M_1 het eindmoment met de
    /// **kleinste** en M_2 dat met de **grootste** absolute waarde. De breuk
    /// zelf gaat over de ondertekende rekenwaarden, zodat β = +1 een constant
    /// moment is (tabel NB.NB.1 geval 1 geeft dan C₁ = 1,75 − 1,05 + 0,3 = 1,00,
    /// het constante-momentgeval) en β = −1 de scherpste tekenwisseling.
    ///
    /// Levert β en het grootste eindmoment (dat laatste is de M van
    /// [`nb_annex::b_ster`]).
    pub fn beta_en_grootste_eindmoment(&self) -> (f64, f64) {
        let (klein, groot) = self.eindmomenten_knm();
        let beta = if groot.abs() > 1e-9 {
            (klein / groot).clamp(-1.0, 1.0)
        } else {
            // Beide eindmomenten nul: zuivere veldbelasting. β is dan
            // onbepaald; 0 is de waarde die bij B* = 0 hoort, waar alle
            // β-rijen van figuur NB.NB.5 op C₁ = 1,13 samenkomen.
            0.0
        };
        (beta, groot)
    }

    /// NB.NB.4.3 — de vervangende ongesteunde kiplengte van dít veld.
    ///
    /// De norm geeft twee gevallen, en het onderscheid is dragend:
    ///  * tussen twee gaffels: L_kip = L_st;
    ///  * tussen één gaffel en één kipsteun, of tussen twee kipsteunen:
    ///    L_kip = (1,4 − 0,8·β)·L_st met 1,0 ≤ L_kip/L_st ≤ 1,4.
    ///
    /// Bij β = 0 geeft de formule exact de bovengrens 1,4. Die onvoorwaardelijk
    /// toepassen op een veld tussen twee gaffels maakt M_cr ruim 30 % te laag.
    pub fn l_kip_mm(&self, beta: f64) -> f64 {
        if self.tussen_gaffels {
            self.l_st_mm
        } else {
            nb_annex::l_kip(beta, self.l_st_mm)
        }
    }
}

/// Welke rij van tabel 6.5 op deze doorsnede slaat.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kipprofiel {
    /// Gewalst I-profiel uit de catalogus.
    GewalsteI,
    /// Gelast I-profiel ("equivalent gelast profiel" in de zin van 6.3.2.3).
    GelasteI,
    /// Alles wat tabel 6.5 niet noemt: kokers, ronde buizen, U-profielen.
    Overig,
}

/// EN 1993-1-1 tabel 6.5 (bij art. 6.3.2.3, vgl. 6.57) → kipkromme, en tabel
/// 6.3 → imperfectiefactor α_LT.
///
/// De Nederlandse bijlage schrapt bij 6.3.2.2(2) en 6.3.2.3(1) het woord
/// "aanbevolen": *"De waarden van α_LT moeten zijn ontleend aan tabel 6.3"* en
/// *"Voor gewalste profielen of equivalente gelaste profielen … moet λ_LT,0
/// gelijk zijn genomen aan 0,4; β aan 0,75; de kipkrommen moeten zijn gekozen
/// volgens tabel 6.5."* Beide tabellen zijn daarmee voorschrift, geen keuze.
///
/// Tabel 6.5:
/// | doorsnede           | h/b ≤ 2 | h/b > 2 |
/// |---------------------|---------|---------|
/// | gewalste I-profielen| b       | c       |
/// | gelaste I-profielen | c       | d       |
///
/// Tabel 6.3: kromme a/b/c/d → α_LT = 0,21 / 0,34 / 0,49 / 0,76.
///
/// LET OP — dit is NIET tabel 6.4. Tabel 6.4 hoort bij de algemene methode
/// 6.3.2.2 (vgl. 6.56, met λ_LT,0 = 0,2 en zonder β) en geeft dezelfde
/// doorsneden één kromme gunstiger. Deze crate rekent met β = 0,75 en
/// λ_LT,0 = 0,4 (zie [`lambda_chi::chi_lt`]) en valt dus onder 6.3.2.3.
///
/// LET OP — dit is ook NIET tabel 6.2. De catalogusprofielen dragen
/// `buckling_curves.y_axis/z_axis` mee; dat zijn KOLOMKNIK-krommen met de
/// grens h/b = 1,2. Een IPE 330 staat daar op a/b en hoort voor KIP op c.
///
/// Voor [`Kipprofiel::Overig`] kent tabel 6.5 geen rij. Aangehouden is kromme
/// d — de ongunstigste rij van de tabel, en tevens wat tabel 6.4 in dezelfde
/// situatie voorschrijft ("andere doorsneden → d"). Dat is een expliciete
/// veilig-zijdige keuze buiten de tabel om, geen normwaarde.
pub fn kipkromme_tabel_6_5(soort: Kipprofiel, h_mm: f64, b_mm: f64) -> BucklingCurve {
    let slank = b_mm > 0.0 && h_mm / b_mm > 2.0;
    match (soort, slank) {
        (Kipprofiel::GewalsteI, false) => BucklingCurve::B,
        (Kipprofiel::GewalsteI, true) => BucklingCurve::C,
        (Kipprofiel::GelasteI, false) => BucklingCurve::C,
        (Kipprofiel::GelasteI, true) => BucklingCurve::D,
        (Kipprofiel::Overig, _) => BucklingCurve::D,
    }
}

/// De kipkromme in de schrijfwijze van de norm. Tabel 6.3 en 6.5 schrijven de
/// krommen met een KLEINE letter; `Debug` op [`BucklingCurve`] geeft een
/// hoofdletter, wat in een rapporttekst niet naar de norm verwijst.
/// Een getal in de Nederlandse schrijfwijze, voor rapporttekst. De rest van de
/// notities citeert normwaarden als "2,30"; `{x}` op een `f64` zou daar
/// "0.34" naast zetten.
fn nl(x: f64, decimalen: usize) -> String {
    format!("{x:.decimalen$}").replace('.', ",")
}

fn kromme_letter(k: BucklingCurve) -> &'static str {
    match k {
        BucklingCurve::A0 => "a₀",
        BucklingCurve::A => "a",
        BucklingCurve::B => "b",
        BucklingCurve::C => "c",
        BucklingCurve::D => "d",
    }
}

/// Alles wat één kipveld aan M_cr oplevert, plus de tussenwaarden die het
/// rapport moet kunnen tonen.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Veldresultaat {
    /// Welk kipveld dit is, geteld vanaf 0 bij het staafbegin, en hoeveel
    /// velden de ligger telt. Alleen voor het rapport: het moet kunnen zeggen
    /// wélk veld maatgevend werd.
    index: usize,
    aantal_velden: usize,
    l_st_mm: f64,
    l_kip_mm: f64,
    /// `true` als L_kip = L_st gold (veld tussen twee gaffels), `false` als de
    /// formule met β is toegepast. Bepaalt welke tak het rapport toont.
    tussen_gaffels: bool,
    /// De twee eindmomenten van dit veld (kNm), in de nummering van NB.NB.4.3.
    m_klein_knm: f64,
    m_groot_knm: f64,
    /// Het moment halverwege het veld (kNm). Rekent niet mee; zie
    /// [`Kipveld::m_midden_knm`].
    m_midden_knm: f64,
    beta: f64,
    b_ster: f64,
    c1: f64,
    /// C₂ zoals figuur NB.NB.6 hem geeft, vóór de correctie voor het
    /// aangrijpingspunt van de belasting.
    c2_tabel: f64,
    /// C₂ ná die correctie — dit is de waarde die in C meerekent.
    c2: f64,
    c: f64,
    m_cr_knm: f64,
}

/// Rekent M_cr voor élk kipveld door en geeft het **ongunstigste** terug.
///
/// Waarom niet gewoon het langste veld: zodra β in L_kip meedoet, is het
/// langste veld niet meer automatisch het ongunstigste. Een kort eindveld met
/// β = 0 krijgt L_kip = 1,4·L_st, terwijl een even lang middenveld met β = +1
/// op L_kip = 1,0·L_st blijft; het eindveld heeft dan de láágste M_cr. Dat is
/// precies wat de referentie-uitwerking van de galerijcasus doet — daar is het
/// eindveld maatgevend, niet het middenveld. Het criterium is dus de laagste
/// M_cr, niet de grootste lengte.
///
/// `s_mm`, `k_red` en `m_cr` hangen niet van het veld af (zij gaan over de
/// doorsnede en over L_g) en komen daarom van buiten.
fn maatgevend_kipveld(
    velden: &[Kipveld],
    l_g_mm: f64,
    q_equiv_n_per_mm: f64,
    z_a_mm: f64,
    h_mm: f64,
    tf_mm: f64,
    s_mm: f64,
    m_cr: impl Fn(f64) -> f64,
) -> Veldresultaat {
    let aantal_velden = velden.len().max(1);
    let bereken = |index: usize, veld: &Kipveld| {
        let (beta, m_groot_knm) = veld.beta_en_grootste_eindmoment();
        let (m_klein_knm, _) = veld.eindmomenten_knm();
        let b_ster = nb_annex::b_ster(m_groot_knm * 1e6, q_equiv_n_per_mm, veld.l_st_mm);
        let (c1, c2_tabel) = nb_annex::c1_c2_factors(beta, b_ster);
        let c2 = nb_annex::c2_gecorrigeerd(c2_tabel, z_a_mm, h_mm, tf_mm);
        let l_kip_mm = veld.l_kip_mm(beta);
        let c = nb_annex::c_coefficient(c1, l_g_mm, l_kip_mm, s_mm, c2);
        Veldresultaat {
            index,
            aantal_velden,
            l_st_mm: veld.l_st_mm,
            l_kip_mm,
            tussen_gaffels: veld.tussen_gaffels,
            m_klein_knm,
            m_groot_knm,
            m_midden_knm: veld.m_midden_knm,
            beta,
            b_ster,
            c1,
            c2_tabel,
            c2,
            c,
            m_cr_knm: m_cr(c),
        }
    };

    let leeg = Kipveld {
        l_st_mm: l_g_mm,
        m_begin_knm: 0.0,
        m_eind_knm: 0.0,
        m_midden_knm: 0.0,
        tussen_gaffels: true,
    };
    let mut maatgevend = bereken(0, velden.first().unwrap_or(&leeg));
    for (i, veld) in velden.iter().enumerate().skip(1) {
        let kandidaat = bereken(i, veld);
        if kandidaat.m_cr_knm < maatgevend.m_cr_knm {
            maatgevend = kandidaat;
        }
    }
    maatgevend
}

/// De tussenwaarden die beide kippaden in het resultaat zetten, in de volgorde
/// waarin het rapport ze toont.
fn nb_tussenwaarden(l_g_mm: f64, v: &Veldresultaat, s_mm: f64) -> Vec<NamedValue> {
    vec![
        NamedValue { symbol: "L_g".to_string(), value: l_g_mm, unit: "mm".to_string() },
        NamedValue { symbol: "L_{st}".to_string(), value: v.l_st_mm, unit: "mm".to_string() },
        NamedValue { symbol: "L_{kip}".to_string(), value: v.l_kip_mm, unit: "mm".to_string() },
        NamedValue { symbol: r"\beta".to_string(), value: v.beta, unit: "-".to_string() },
        NamedValue { symbol: "B^*".to_string(), value: v.b_ster, unit: "-".to_string() },
        NamedValue { symbol: "C_1".to_string(), value: v.c1, unit: "-".to_string() },
        NamedValue { symbol: "C_2".to_string(), value: v.c2, unit: "-".to_string() },
        NamedValue { symbol: "S".to_string(), value: s_mm, unit: "mm".to_string() },
        NamedValue { symbol: "C".to_string(), value: v.c, unit: "-".to_string() },
    ]
}

/// De waarschuwingen die niet uit de doorsnedekeuze maar uit de NB-invoer
/// volgen, en die voor beide kippaden gelijk zijn.
///
/// Geen van beide verandert een getal; ze maken zichtbaar waar de uitkomst
/// buiten het bereik valt waarvoor de nationale bijlage haar formules geeft.
fn nb_waarschuwingen(
    l_g_mm: f64,
    v: &Veldresultaat,
    z_a_mm: f64,
    h_mm: f64,
    tf_mm: f64,
) -> Vec<String> {
    let mut n = Vec::new();

    // NB.NB.4.3 begrenst L_kip/L_st op 1,4, maar niet L_kip tegen L_g. Een
    // kipsteun vlak naast een gaffel laat het resterende lange veld daardoor op
    // 1,4·L_st uitkomen, en dat kan lánger zijn dan de hele ligger zonder die
    // steun. Gemeten op een IPE 330 van 9 m onder q = 15 N/mm: zonder steun
    // UC 2,3798, met een steun op 0,05·L UC 2,9650 (L_kip 11 970 mm op een
    // ligger van 9000 mm). De steun toevoegen maakt de toetsing dan slechter.
    // Dat is een getrouwe lezing van de norm — er wordt hier dus niets
    // afgekapt, want elke bovengrens op L_kip zou een verzonnen normwaarde
    // zijn — maar het hoort in het rapport te staan.
    if v.l_kip_mm > l_g_mm * (1.0 + 1e-9) {
        n.push(format!(
            "L_kip = {:.0} mm is groter dan de afstand tussen de gaffels L_g = {:.0} mm. \
             NB.NB.4.3 begrenst L_kip/L_st op 1,4 maar niet op L_g, zodat een kipsteun \
             dicht bij een gaffel de berekende weerstand kan verlagen ten opzichte van \
             dezelfde ligger zónder die steun. Controleer of de opgegeven steun \
             werkelijk een kipsteun in de zin van NB.NB.4.3 is.",
            v.l_kip_mm, l_g_mm
        ));
    }

    // NB.NB.4.3(1) staat lineaire extrapolatie van C₂ toe tot ten hoogste
    // 0,1·h boven het zwaartepunt van de bovenflens. Daarboven geeft de norm
    // niets; `c2_gecorrigeerd` extrapoleert door, wat de destabiliserende
    // richting is en dus veilig-zijdig, maar het is geen normwaarde meer.
    let z_a_max = nb_annex::z_a_max_nb(h_mm, tf_mm);
    if z_a_mm > z_a_max * (1.0 + 1e-9) {
        n.push(format!(
            "Het aangrijpingspunt van de belasting ligt op z_a = {z_a_mm:.0} mm, boven de \
             grens van {z_a_max:.0} mm (zwaartepunt bovenflens + 0,1·h) waartoe \
             NB.NB.4.3(1) lineaire extrapolatie van C₂ toestaat. C₂ is lineair \
             doorgetrokken; dat werkt destabiliserend en dus veilig-zijdig, maar het is \
             een extrapolatie buiten het bereik van de bijlage."
        ));
    }

    n
}

/// Kipcontrole voor U-profielen (monosymmetrisch).
///
/// De veldindeling, β, B*, L_kip en C₂ worden op precies dezelfde manier
/// bepaald als in [`m_b_rd`]; alleen M_cr krijgt de conservatieve
/// monosymmetriereductie van [`nb_annex::m_cr_channel_section`] en α_LT komt
/// niet uit tabel 6.5, die voor U-profielen geen rij heeft (zie onder).
pub fn m_b_rd_channel(
    p: &SectionProperties, grade: &SteelGrade,
    l_g_mm: f64,
    velden: &[Kipveld],
    q_equiv_n_per_mm: f64,
    z_a_mm: f64,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let s_mm = nb_annex::s_parameter(p.h_mm, nb_annex::E_MPA, p.iz_mm4, nb_annex::G_MPA, p.it_mm4);
    let k_red = nb_annex::k_red(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, l_g_mm);
    let v = maatgevend_kipveld(
        velden, l_g_mm, q_equiv_n_per_mm, z_a_mm, p.h_mm, p.tf_mm, s_mm,
        |c| nb_annex::m_cr_channel_section(c, l_g_mm, p.iz_mm4, p.it_mm4, k_red),
    );

    let lambda_lt = lambda_chi::lambda_lt(p.wpl_y_mm3, grade.fy_mpa, v.m_cr_knm);
    // Tabel 6.5 kent geen rij voor U-profielen. Kromme c (α_LT = 0,49) is hier
    // aangehouden: één kromme ongunstiger dan de gewalste I met h/b ≤ 2,
    // passend bij een M_cr die zelf al een grove benadering is (factor 0,7, zie
    // `m_cr_channel_section`). Dit is een expliciete keuze buiten de tabel om,
    // geen normwaarde.
    let alpha_lt = BucklingCurve::C.alpha();
    let alpha_lt_herkomst = format!(
        "Tabel 6.5 kent geen rij voor U-profielen; zij noemt alleen gewalste en gelaste \
         I-profielen. Aangehouden is kipkromme c met α_LT = {} (tabel 6.3), één kromme \
         ongunstiger dan een gewalste I met h/b ≤ 2. Dat is een expliciete keuze buiten de \
         tabel om, geen normwaarde.",
        nl(alpha_lt, 2)
    );
    // art. 6.3.2.3(1) met de waarde die de Nederlandse bijlage daar voorschrijft
    // (λ_LT,0 = 0,4, niet de 0,2 van de algemene methode 6.3.2.2).
    let chi_lt = if lambda_lt < lambda_chi::LAMBDA_LT_0 {
        1.0
    } else {
        lambda_chi::chi_lt(lambda_lt, alpha_lt)
    };

    let m_b_rd_knm = chi_lt * p.wpl_y_mm3 * grade.fy_mpa / grade.gamma_m1 * 1e-6;
    let m_y_ed_abs = force_state.forces.my_ed.abs();
    let uc = if m_b_rd_knm > 0.0 { m_y_ed_abs / m_b_rd_knm } else { 0.0 };

    let mut intermediate_values = nb_tussenwaarden(l_g_mm, &v, s_mm);
    intermediate_values.extend([
        NamedValue { symbol: "k_{red}".to_string(), value: k_red, unit: "-".to_string() },
        NamedValue { symbol: "M_{cr}".to_string(), value: v.m_cr_knm, unit: "kNm".to_string() },
        NamedValue { symbol: r"\bar{\lambda}_{LT}".to_string(), value: lambda_lt, unit: "-".to_string() },
        NamedValue { symbol: r"\alpha_{LT}".to_string(), value: alpha_lt, unit: "-".to_string() },
        NamedValue { symbol: r"\chi_{LT}".to_string(), value: chi_lt, unit: "-".to_string() },
    ]);

    StabilityCalc {
        id: "6.3.2_ltb_channel".to_string(),
        title: "Kip (U-profiel, monosymmetrisch)".to_string(),
        article: "art. 6.3.2.3 + NB.NB.4/NB.7/NB.11/NB.13, met een M_cr buiten de norm om"
            .to_string(),
        force_state,
        formula_latex: r"M_{b,Rd} = \chi_{LT} \cdot W_{pl,y} \cdot f_y / \gamma_{M1}".to_string(),
        variables: vec![
            NamedValue { symbol: "W_{pl,y}".to_string(), value: p.wpl_y_mm3, unit: "mm³".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M1}".to_string(), value: grade.gamma_m1, unit: "-".to_string() },
        ],
        intermediate_values,
        deelstappen: kip_deelstappen(&Kipgegevens {
            p, grade, l_g_mm, v: &v,
            q_equiv_n_per_mm, z_a_mm, s_mm, k_red,
            lambda_lt, alpha_lt, chi_lt,
            vorm: McrVorm::Kanaal,
            alpha_lt_herkomst,
        }),
        // Zie de gelijkluidende toelichting in [`m_b_rd`]: `value` is de
        // uitkomst van `formula_latex`, dus M_b,Rd en niet χ_LT.
        value: m_b_rd_knm,
        unit: "kNm".to_string(),
        uc: Some(UnityCheck {
            ed: m_y_ed_abs, rd: m_b_rd_knm, uc,
            formula_latex: r"M_{y,Ed} / M_{b,Rd}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: {
            let mut n = vec![
                // Deze notitie noemde tot september 2026 "bijlage F". Die
                // verwijzing is hier weggehaald: de code rekent de I-vorm van
                // NB.148 maal een vaste factor, en welke bijlage de volledige
                // monosymmetrische afleiding draagt is uit deze code niet vast
                // te stellen. Een vindplaats die niet nagelopen is, hoort niet
                // in een rapport.
                format!(
                    "Conservatieve monosymmetriereductie: M_cr is de I-vorm van NB.148 maal \
                     een vaste factor {}. De monosymmetrieparameter z_j, die een U-profiel \
                     werkelijk nodig heeft, is niet uitgewerkt. Deze factor is geen \
                     normwaarde.",
                    nl(nb_annex::CHANNEL_REDUCTIE, 1)
                ),
                "Tabel 6.5 kent geen rij voor U-profielen; α_LT = 0,49 (kromme c) is een \
                 expliciete keuze buiten de tabel om, geen normwaarde."
                    .to_string(),
            ];
            n.extend(nb_waarschuwingen(l_g_mm, &v, z_a_mm, p.h_mm, p.tf_mm));
            n
        },
    }
}

/// Kipcontrole voor dubbelsymmetrische I-profielen volgens de Nederlandse
/// nationale bijlage (NB.NB).
///
/// `l_g_mm`: de lengte van de ligger tussen de gaffels (NB.NB.4.3).
/// `velden`: de kipvelden waarin de ligger door zijn kipsteunen uiteenvalt,
/// mét de eindmomenten per veld. Bouw ze met [`lambda_chi::kipveld_grenzen_mm`]
/// en [`LateralBracing::gedrukte_flens_posities`]; de aanroeper kent de
/// momentenlijn, deze crate niet.
/// `q_equiv_n_per_mm`: equivalente gelijkmatig verdeelde belasting in het
/// kipveld (N/mm), voor B* volgens NB.NB.4.3(3). 0 = alleen eindmomenten.
/// `z_a_mm`: afstand zwaartepunt → aangrijpingspunt van de belasting (mm,
/// positief = boven het zwaartepunt, destabiliserend).
/// `profielsoort`: welke rij van tabel 6.5 geldt, zie [`kipkromme_tabel_6_5`].
pub fn m_b_rd(
    p: &SectionProperties, grade: &SteelGrade,
    l_g_mm: f64,
    velden: &[Kipveld],
    q_equiv_n_per_mm: f64,
    z_a_mm: f64,
    profielsoort: Kipprofiel,
    force_state: ForceStateSnapshot,
) -> StabilityCalc {
    let s_mm = nb_annex::s_parameter(p.h_mm, nb_annex::E_MPA, p.iz_mm4, nb_annex::G_MPA, p.it_mm4);
    let k_red = nb_annex::k_red(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, l_g_mm);
    let v = maatgevend_kipveld(
        velden, l_g_mm, q_equiv_n_per_mm, z_a_mm, p.h_mm, p.tf_mm, s_mm,
        |c| nb_annex::m_cr_i_section(c, l_g_mm, p.iz_mm4, p.it_mm4, k_red),
    );

    let lambda_lt = lambda_chi::lambda_lt(p.wpl_y_mm3, grade.fy_mpa, v.m_cr_knm);

    // art. 6.3.2.3 met de NB-waarden λ_LT,0 = 0,4 en β = 0,75.
    let kromme = kipkromme_tabel_6_5(profielsoort, p.h_mm, p.b_mm);
    let alpha_lt = kromme.alpha();
    let chi_lt = if lambda_lt < lambda_chi::LAMBDA_LT_0 {
        1.0
    } else {
        lambda_chi::chi_lt(lambda_lt, alpha_lt)
    };

    // Waar α_LT vandaan komt. Eén tekst, twee bestemmingen: de notities van de
    // toets én de deelstap Φ_LT, waar α_LT werkelijk meerekent. Per tak apart
    // geformuleerd — tabel 6.5 heeft precies twee rijen (gewalste en gelaste
    // I-profielen) en géén rij "andere doorsneden"; die staat alleen in tabel
    // 6.4, bij de algemene methode 6.3.2.2. Eén onvoorwaardelijke zin "volgens
    // tabel 6.5" zou voor een koker dus een tabelrij aanhalen die niet bestaat.
    let alpha_lt_herkomst = {
        let h_b = nl(if p.b_mm > 0.0 { p.h_mm / p.b_mm } else { f64::NAN }, 3);
        let a = nl(alpha_lt, 2);
        let letter = kromme_letter(kromme);
        match profielsoort {
            Kipprofiel::GewalsteI => format!(
                "Gewalst I-profiel met h/b = {h_b} → kipkromme {letter} volgens tabel 6.5; \
                 α_LT = {a} volgens tabel 6.3."
            ),
            Kipprofiel::GelasteI => format!(
                "Gelast I-profiel met h/b = {h_b} → kipkromme {letter} volgens tabel 6.5; \
                 α_LT = {a} volgens tabel 6.3."
            ),
            Kipprofiel::Overig => format!(
                "Tabel 6.5 kent voor deze doorsnede geen rij — zij noemt alleen gewalste en \
                 gelaste I-profielen. Aangehouden is kipkromme {letter} met α_LT = {a} \
                 (tabel 6.3), de ongunstigste rij van de tabel. Dat is een expliciete \
                 veilig-zijdige keuze buiten de tabel om, geen normwaarde."
            ),
        }
    };

    let m_b_rd_knm = chi_lt * p.wpl_y_mm3 * grade.fy_mpa / grade.gamma_m1 * 1e-6;

    let m_y_ed_abs = force_state.forces.my_ed.abs();
    let uc = if m_b_rd_knm > 0.0 { m_y_ed_abs / m_b_rd_knm } else { 0.0 };

    let mut intermediate_values = nb_tussenwaarden(l_g_mm, &v, s_mm);
    intermediate_values.extend([
        NamedValue { symbol: "k_{red}".to_string(), value: k_red, unit: "-".to_string() },
        NamedValue { symbol: "M_{cr}".to_string(), value: v.m_cr_knm, unit: "kNm".to_string() },
        NamedValue { symbol: r"\bar{\lambda}_{LT}".to_string(), value: lambda_lt, unit: "-".to_string() },
        NamedValue { symbol: r"\alpha_{LT}".to_string(), value: alpha_lt, unit: "-".to_string() },
        NamedValue { symbol: r"\chi_{LT}".to_string(), value: chi_lt, unit: "-".to_string() },
    ]);

    StabilityCalc {
        id: "6.3.2_ltb".to_string(),
        title: "Kipweerstand".to_string(),
        article: "art. 6.3.2.3 (tabel 6.3/6.5) + NB.NB.2/NB.4/NB.7/NB.11/NB.13".to_string(),
        force_state,
        formula_latex: r"M_{b,Rd} = \chi_{LT} \cdot W_{pl,y} \cdot f_y / \gamma_{M1}".to_string(),
        variables: vec![
            NamedValue { symbol: "W_{pl,y}".to_string(), value: p.wpl_y_mm3, unit: "mm³".to_string() },
            NamedValue { symbol: "f_y".to_string(), value: grade.fy_mpa, unit: "MPa".to_string() },
            NamedValue { symbol: r"\gamma_{M1}".to_string(), value: grade.gamma_m1, unit: "-".to_string() },
        ],
        intermediate_values,
        deelstappen: kip_deelstappen(&Kipgegevens {
            p, grade, l_g_mm, v: &v,
            q_equiv_n_per_mm, z_a_mm, s_mm, k_red,
            lambda_lt, alpha_lt, chi_lt,
            vorm: McrVorm::DubbelsymmetrischeI,
            alpha_lt_herkomst: alpha_lt_herkomst.clone(),
        }),
        // `value` is de UITKOMST van `formula_latex`, en die formule is
        // M_b,Rd = χ_LT·W_pl,y·f_y/γ_M1. Hier stond χ_LT, en dat liep in beide
        // rapportwegen mis: het rapport zette de afleiding als
        //
        //     M_b,Rd = χ_LT · W_pl,y · f_y / γ_M1
        //            = 0,9 · 245000 · 235 / 1
        //            = 0,9                        ← χ_LT, zonder eenheid
        //     M_y,Ed / M_b,Rd = 63,383 / 51,8 = 1,22 > 1,0
        //
        // — twee regels uit elkaar twee verschillende M_b,Rd. χ_LT gaat niet
        // verloren: hij staat in `intermediate_values` én als eigen deelstap.
        // De kniktoets van 6.3.1 voert al dezelfde afspraak (value = N_b,Rd in
        // kN); kip was de uitzondering.
        value: m_b_rd_knm,
        unit: "kNm".to_string(),
        uc: Some(UnityCheck {
            ed: m_y_ed_abs, rd: m_b_rd_knm, uc,
            formula_latex: r"M_{y,Ed} / M_{b,Rd}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: {
            let mut n = vec![alpha_lt_herkomst];
            // Vgl. (6.58) hoort bij 6.3.2.3(2) en is niet geïmplementeerd. Het
            // artikellabel van deze toets noemt 6.3.2.3; dan hoort het rapport
            // te zeggen welk deel daarvan is overgeslagen.
            n.push(
                "Vgl. (6.58) — χ_LT,mod = χ_LT/f met f uit de correctiefactor k_c — is \
                 niet toegepast. f ≤ 1, dus χ_LT,mod ≥ χ_LT: weglaten is veilig-zijdig."
                    .to_string(),
            );
            if nb_annex::vereist_toets_gedrukte_rand(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, l_g_mm) {
                n.push(
                    "α > 5000 (NB.NB.4.2(3)): de nationale bijlage geeft hier geen \
                     reductiefactor k_red. De gedrukte rand — de flens plus 1/6 van de \
                     lijfhoogte — moet volgens 6.3.3 worden getoetst op druk en buiging \
                     uit het vlak van het lijf."
                        .to_string(),
                );
            }
            // Drempel, geen `< 0.0`: B* komt uit eindmomenten die op een vrij
            // opgelegde ligger numeriek nul zijn maar zelden exact nul. R16
            // levert B* = −2,4·10⁻¹⁶; zonder drempel draagt een leerboekligger
            // deze caveat op afrondingsruis.
            if v.b_ster < -1e-9 {
                n.push(
                    "B* < 0: C₁ en C₂ zijn afgelezen bij |B*|. De negatieve tak van \
                     figuur NB.NB.5/NB.NB.6 is niet gedigitaliseerd; deze benadering \
                     ligt onder de werkelijke waarden en is dus veilig-zijdig, maar nog \
                     niet geverifieerd. Voor de volledig buigvast ingeklemde ligger geeft \
                     tabel NB.NB.3 C₁ = 2,30 en C₂ = 1,55; die tak is hier niet \
                     geïmplementeerd."
                        .to_string(),
                );
            }
            n.extend(nb_waarschuwingen(l_g_mm, &v, z_a_mm, p.h_mm, p.tf_mm));
            n
        },
    }
}
