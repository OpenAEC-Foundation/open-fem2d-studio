//! De kipafleiding als uitgeschreven stappen, voor het rapport.
//!
//! De rekenkern liep de NB-keten al helemaal door — B*, β, C₁, C₂, L_kip, S,
//! C, k_red, M_cr, λ̄_LT, χ_LT — maar leverde alleen de UITKOMSTEN af, als een
//! rij losse getallen in `intermediate_values`. Een rapport dat een normtoets
//! moet verantwoorden heeft daar niets aan: het moet per stap tonen wélke
//! formule is gebruikt, met wélke getallen, en wáár die formule staat.
//!
//! Deze module rekent niets opnieuw uit. Zij krijgt de al berekende grootheden
//! aangereikt en schrijft ze op. Dat is een bewuste keuze: elke stap die hier
//! zijn eigen som zou maken, kan van de kern afdrijven zonder dat een test dat
//! ziet. De enige uitzondering is Φ_LT, en daarvoor is in [`crate::lambda_chi`]
//! een functie afgesplitst die óók door `chi_lt` zelf wordt gebruikt.
//!
//! ## Twee nummerstelsels voor de vindplaats
//!
//! De vindplaatsen hieronder zijn LETTERLIJK overgenomen uit de docstrings van
//! de functies die de stap uitrekent — NB.148 bij [`nb_annex::m_cr_i_section`],
//! NB.NB.11 bij [`nb_annex::c_coefficient`], NB.NB.13 bij
//! [`nb_annex::s_parameter`], enzovoort. In die docstrings lopen twee
//! nummerstelsels door elkaar (NB.148 naast NB.NB.11), en welk van beide de
//! nationale bijlage werkelijk voert, is niet uit deze code af te leiden. Er is
//! hier dus niets omgenummerd of "gladgestreken": wie het stelsel wil
//! uniformeren, doet dat in de docstrings van `nb_annex`, met de bijlage ernaast
//! — dan volgt deze module vanzelf.
//!
//! ## Waarom de ingevulde regel hier wordt gemaakt
//!
//! Zie de docstring van [`Deelstap`]. Kort: de frontend maakt zo'n regel nu
//! door symbolen in de formule te vervangen door hun waarde, en dat loopt stuk
//! op losse hoofdletters binnen een wortel (`\sqrt{E I_z / (G I_t)}`) en op de
//! eenheidsomrekeningen (kNm → N·mm) die helemaal geen symbool hebben. Wie de
//! formule opschrijft, kan de ingevulde regel exact opschrijven.

use nen_en_1993_1_1_section::{NamedValue, SteelGrade};
use nen_en_1993_1_1_stability::Deelstap;
use section_properties::SectionProperties;

use crate::en_general::GedrukteFlens;

use crate::{lambda_chi, nb_annex, nl, Veldresultaat};

// ── Opmaakhulpjes ─────────────────────────────────────────────────────────────

/// Een getal in LaTeX-mathmodus met de Nederlandse decimaalkomma.
///
/// `{,}` in plaats van een losse `,`: LaTeX zet achter een komma in mathmodus
/// een spatie, waardoor "1,13" als "1, 13" oogt. Dezelfde schrijfwijze als
/// `latexGetal` in de frontend, zodat de ingevulde regel en de waardenlijstjes
/// er hetzelfde uitzien.
fn lx(v: f64, decimalen: usize) -> String {
    if !v.is_finite() {
        return r"\text{n.v.t.}".to_string();
    }
    let mut s = format!("{v:.decimalen$}");
    // Alleen een decimaaldeel dat HELEMAAL nul is, valt weg — 5700,00 wordt
    // 5700, maar 1,280 blijft 1,280. Elke nul afknabbelen zou van λ̄_LT =
    // 1,2795 een "1,28" maken, en dan oogt de ingevulde regel minder
    // nauwkeurig dan hij is.
    if let Some((geheel, fractie)) = s.split_once('.') {
        if fractie.chars().all(|c| c == '0') {
            s = geheel.to_string();
        }
    }
    if s.trim_start_matches('-').chars().all(|c| c == '0' || c == '.') {
        s = s.trim_start_matches('-').to_string();
    }
    s.replace('.', "{,}")
}

/// Zelfde getal, maar tussen haakjes als het negatief is.
///
/// Zonder haakjes wordt `0{,}8 \cdot -0{,}5` een leesfout; C₂ is bij een
/// belasting op de bovenflens altijd negatief, dus dat geval is de regel en
/// niet de uitzondering.
fn lxh(v: f64, decimalen: usize) -> String {
    let s = lx(v, decimalen);
    if s.starts_with('-') {
        format!("({s})")
    } else {
        s
    }
}

fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue {
        symbol: symbol.to_string(),
        value,
        unit: unit.to_string(),
    }
}

/// Bouwt één deelstap. Alle velden expliciet, zodat er geen stap kan ontstaan
/// zonder vindplaats.
#[allow(clippy::too_many_arguments)]
fn stap(
    id: &str,
    titel: &str,
    symbol: &str,
    article: &str,
    formula_latex: String,
    ingevuld_latex: String,
    variables: Vec<NamedValue>,
    value: Option<f64>,
    unit: &str,
    notes: Vec<String>,
) -> Deelstap {
    Deelstap {
        id: id.to_string(),
        titel: titel.to_string(),
        symbol: symbol.to_string(),
        article: article.to_string(),
        formula_latex,
        ingevuld_latex,
        variables,
        value,
        unit: unit.to_string(),
        notes,
    }
}

// ── De invoer van de bouwer ───────────────────────────────────────────────────

/// Welke M_cr-vorm is gerekend. Bepaalt twee van de vijftien stappen; de rest
/// is voor beide paden woordelijk gelijk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum McrVorm {
    /// [`nb_annex::m_cr_i_section`] — de vorm van NB.148 zelf.
    DubbelsymmetrischeI,
    /// [`nb_annex::m_cr_channel_section`] — diezelfde vorm maal een
    /// benaderingsfactor die NIET uit de norm komt.
    Kanaal,
    /// [`crate::en_general::m_cr_monosymmetrisch`] — de algemene elastische
    /// formule mét z_g en z_j, voor een doorsnede die buiten NB.NB.1(1) valt.
    AlgemeenMonosymmetrisch,
}

/// De grootheden die alleen op de monosymmetrische route bestaan.
///
/// Ze worden niet opnieuw berekend: [`crate::m_b_rd_monosymmetrisch`] heeft ze
/// al bepaald op het maatgevende kipveld en geeft ze hier onveranderd door.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Monogegevens {
    /// z_j zoals de doorsnedemotor hem levert: z omhoog positief, een vaste
    /// eigenschap van de doorsnede.
    pub z_j_geometrisch_mm: f64,
    /// Datzelfde getal met het teken van de gedrukte flens
    /// (EN 1999-1-1 art. I.1.2(7)).
    pub z_j_norm_mm: f64,
    /// Wat er werkelijk in M_cr is ingevuld: `min(z_j_norm ; 0)`.
    pub z_j_reken_mm: f64,
    /// Het aangrijpingspunt van de belasting t.o.v. het **dwarskrachtencentrum**.
    pub z_g_mm: f64,
    /// Het dwarskrachtencentrum t.o.v. het zwaartepunt — het verschil tussen
    /// `z_a` (NB) en `z_g` (algemene formule).
    pub z_s_rel_mm: f64,
    /// De aangehouden C₃ — een bovengrens uit de tabel, geen aflezing; zie
    /// [`crate::en_general::c3_bovengrens`].
    pub c3: f64,
    /// ψ_f als de aanroeper hem kende; `None` → de ongunstigste band is
    /// aangehouden.
    pub psi_f: Option<f64>,
    /// Welke flens er in het maatgevende kipveld gedrukt is. Bepaalt het teken
    /// van z_j; zie [`crate::en_general::z_j_kipveld`].
    pub gedrukte_flens: crate::en_general::GedrukteFlens,
    /// `D = C₂·z_g − C₃·z_j`, de combinatie waarin M_cr dalend is.
    ///
    /// Komt van de aanroeper en wordt hier **niet** opnieuw uitgerekend: deze
    /// module schrijft alleen op wat de kern al bepaald heeft, en een tweede
    /// som zou in de laatste bits van de kern af kunnen drijven zonder dat een
    /// test dat ziet.
    pub d_mm: f64,
}

/// Alles wat de kipketen al heeft uitgerekend, in de vorm waarin de stappen het
/// nodig hebben. Niets hiervan wordt opnieuw berekend.
pub(crate) struct Kipgegevens<'a> {
    pub p: &'a SectionProperties,
    pub grade: &'a SteelGrade,
    pub l_g_mm: f64,
    pub v: &'a Veldresultaat,
    pub q_equiv_n_per_mm: f64,
    pub z_a_mm: f64,
    pub s_mm: f64,
    pub k_red: f64,
    pub lambda_lt: f64,
    pub alpha_lt: f64,
    pub chi_lt: f64,
    pub vorm: McrVorm,
    /// Waar α_LT vandaan komt. Verschilt per pad: het I-pad leest tabel 6.5,
    /// het kanaalpad houdt een kromme aan die de tabel niet geeft.
    pub alpha_lt_herkomst: String,
    /// Gevuld op de monosymmetrische route, `None` op de twee NB-routes.
    pub mono: Option<Monogegevens>,
}

// ── De keten ──────────────────────────────────────────────────────────────────

/// De volledige kipafleiding, in de volgorde waarin het rapport haar toont.
///
/// De twee NB-routes lopen door dezelfde vijftien stappen; alleen M_cr
/// verschilt. De monosymmetrische route wijkt eerder af: zij rekent niet met de
/// C-coëfficiënt van NB.NB.11 en dus ook niet met de doorsnedeparameter S, en
/// zij gebruikt C₂ ongecorrigeerd omdat de algemene formule het aangrijpingspunt
/// via z_g zelf meeneemt. Daarvoor in de plaats komt de z_j-stap.
pub(crate) fn kip_deelstappen(g: &Kipgegevens) -> Vec<Deelstap> {
    let mono = g.vorm == McrVorm::AlgemeenMonosymmetrisch;
    let mut uit = Vec::with_capacity(16);
    uit.push(uitgangspunten(g));
    uit.push(b_ster_stap(g));
    uit.push(beta_stap(g));
    uit.push(c1_stap(g));
    uit.push(c2_tabel_stap(g));
    if !mono {
        uit.push(c2_stap(g));
    }
    uit.push(l_kip_stap(g));
    if let Some(m) = g.mono.filter(|_| mono) {
        uit.push(z_j_stap(g, &m));
    } else {
        uit.push(s_stap(g));
        uit.push(c_stap(g));
    }
    if let Some(a) = alpha_stap(g) {
        uit.push(a);
    }
    uit.push(k_red_stap(g));
    uit.push(m_cr_stap(g));
    uit.push(lambda_lt_stap(g));
    uit.extend(chi_lt_stappen(g));
    uit
}

// 1 ── Uitgangspunten ─────────────────────────────────────────────────────────

fn uitgangspunten(g: &Kipgegevens) -> Deelstap {
    let v = g.v;
    let aantal_steunen = v.aantal_velden.saturating_sub(1);

    let mut notes = Vec::new();
    if v.aantal_velden > 1 {
        notes.push(format!(
            "De ligger valt door {aantal_steunen} kipsteun(en) aan de gedrukte flens uiteen \
             in {} kipvelden. Veld {} (geteld vanaf het staafbegin) geeft de laagste M_cr en \
             is daarmee maatgevend; alle waarden hieronder horen bij dát veld.",
            v.aantal_velden,
            v.index + 1
        ));
    } else {
        notes.push(
            "Er is geen kipsteun aan de gedrukte flens: de ligger heeft één kipveld, van \
             gaffel tot gaffel."
                .to_string(),
        );
    }
    notes.push(
        "De staafeinden zijn als gaffels (vorkopleggingen) aangenomen. Op die aanname \
         berust de hele keten: NB.NB.4.3 kent alleen kipvelden tussen twee gaffels, tussen \
         één gaffel en één kipsteun, of tussen twee kipsteunen, en het aantal kipsteunen \
         hierboven volgt uit het aantal kipvelden min één."
            .to_string(),
    );
    notes.push(
        "q en z_a zijn uitgangspunten, geen gemeten grootheden. q is de equivalente \
         gelijkmatig verdeelde belasting die bij de momentenlijn van dit kipveld hoort \
         (NB.NB.4.3(3)); z_a is het aangenomen aangrijpingspunt van die belasting ten \
         opzichte van het zwaartepunt van de doorsnede, positief naar boven en dus \
         destabiliserend. Beide bepalen B*, C₁ en C₂ en daarmee M_cr; wie ze anders \
         aanhoudt, krijgt een andere kipweerstand."
            .to_string(),
    );
    notes.push(
        "M_y,Ed(L_st/2) rekent nergens in mee — NB.NB.4.3 bepaalt β en B* uit de \
         eindmomenten. Hij staat erbij zodat te zien is of de momentenlijn tussen die \
         eindmomenten doorbuigt, en dus of de aanname 'gelijkmatig verdeelde belasting met \
         eindmomenten' van NB.NB.4.3(3) hier opgaat."
            .to_string(),
    );

    stap(
        "uitgangspunten",
        "Uitgangspunten van het maatgevende kipveld",
        "",
        "NB.NB.4.3",
        String::new(),
        String::new(),
        vec![
            nv("n_{kipsteunen}", aantal_steunen as f64, "-"),
            nv("L_g", g.l_g_mm, "mm"),
            nv("L_{st}", v.l_st_mm, "mm"),
            nv("M_{y,1,Ed}", v.m_klein_knm, "kNm"),
            nv("M_{y,2,Ed}", v.m_groot_knm, "kNm"),
            nv("M_{y,Ed}(L_{st}/2)", v.m_midden_knm, "kNm"),
            nv("q", g.q_equiv_n_per_mm, "N/mm"),
            nv("z_a", g.z_a_mm, "mm"),
        ],
        None,
        "",
        notes,
    )
}

// 2 ── B* ─────────────────────────────────────────────────────────────────────

fn b_ster_stap(g: &Kipgegevens) -> Deelstap {
    let v = g.v;
    let m = v.m_groot_knm;
    let q = g.q_equiv_n_per_mm;

    let mut notes = vec![
        "B* is de maat voor het aandeel eindmoment in de momentenlijn: B* = ±1 betekent \
         uitsluitend eindmomenten (basisgeval 1 van tabel NB.NB.1), B* = 0 uitsluitend \
         veldbelasting (basisgeval 2). De factor 10⁶ zet M_y,2,Ed van kNm naar N·mm, zodat \
         teller en noemer in dezelfde eenheid staan als q·L_st²."
            .to_string(),
    ];
    if q < 0.0 {
        notes.push(format!(
            "q is met zijn grootte ingevuld (|q| = {} N/mm). De richting van de belasting \
             zit al in het teken van M_y,2,Ed; een negatieve q zou de noemer door nul \
             kunnen laten gaan en B* buiten [−1; +1] kunnen brengen.",
            nl(q.abs(), 3)
        ));
    }
    if m.abs() <= 1e-9 && q.abs() <= 1e-9 {
        notes.push(
            "Zowel de eindmomenten als de veldbelasting zijn nul; de noemer is dan nul en \
             B* is op 0 gezet."
                .to_string(),
        );
    }

    stap(
        "b_ster",
        "Aandeel eindmoment in de momentenlijn",
        "B^*",
        "NB.NB.4.3(3)",
        r"B^* = \frac{8 \cdot M_{y,2,Ed} \cdot 10^6}{8 \cdot \left| M_{y,2,Ed} \right| \cdot 10^6 + q \cdot L_{st}^2}"
            .to_string(),
        format!(
            r"B^* = \frac{{8 \cdot {m} \cdot 10^6}}{{8 \cdot \left| {m} \right| \cdot 10^6 + {q} \cdot {l}^2}}",
            m = lxh(m, 3),
            q = lxh(q.abs(), 3),
            l = lx(v.l_st_mm, 2),
        ),
        vec![
            nv("M_{y,2,Ed}", m, "kNm"),
            nv("q", q.abs(), "N/mm"),
            nv("L_{st}", v.l_st_mm, "mm"),
        ],
        Some(v.b_ster),
        "-",
        notes,
    )
}

// 3 ── β ──────────────────────────────────────────────────────────────────────

fn beta_stap(g: &Kipgegevens) -> Deelstap {
    let v = g.v;
    let onbepaald = v.m_groot_knm.abs() <= 1e-9;

    let mut notes = vec![
        "M_y,1,Ed is het eindmoment met de KLEINSTE absolute waarde, M_y,2,Ed dat met de \
         grootste. De breuk gaat over de ondertekende rekenwaarden: β = +1 hoort bij een \
         constant moment (enkelvoudige kromming), β = −1 bij de scherpste tekenwisseling."
            .to_string(),
    ];
    if onbepaald {
        notes.push(
            "Beide eindmomenten zijn nul (zuivere veldbelasting), dus de breuk is \
             onbepaald. Aangehouden is β = 0 — de waarde waar bij B* = 0 alle β-rijen van \
             figuur NB.NB.5 samenkomen, zodat de keuze daar geen invloed op C₁ heeft."
                .to_string(),
        );
    }

    stap(
        "beta",
        "Verhouding van de eindmomenten",
        r"\beta",
        "NB.NB.4.3",
        r"\beta = \frac{M_{y,1,Ed}}{M_{y,2,Ed}}".to_string(),
        if onbepaald {
            String::new()
        } else {
            format!(
                r"\beta = \frac{{{}}}{{{}}}",
                lx(v.m_klein_knm, 3),
                lx(v.m_groot_knm, 3)
            )
        },
        vec![
            nv("M_{y,1,Ed}", v.m_klein_knm, "kNm"),
            nv("M_{y,2,Ed}", v.m_groot_knm, "kNm"),
        ],
        Some(v.beta),
        "-",
        notes,
    )
}

// 4 en 5 ── C₁ en C₂ uit de figuren ───────────────────────────────────────────

/// De kanttekening die bij een negatieve B* op beide figuur-aflezingen hoort.
fn negatieve_b_ster_notitie(b_ster: f64) -> Option<String> {
    // Drempel, geen `< 0`: op een vrij opgelegde ligger is B* numeriek nul maar
    // zelden exact nul (gemeten: −2,4·10⁻¹⁶).
    if b_ster >= -1e-9 {
        return None;
    }
    Some(
        "B* is negatief; afgelezen is bij |B*|. De negatieve tak van de figuur is niet \
         gedigitaliseerd — daar kruisen de krommen elkaar en liggen pieken tot C₁ = 2,3. \
         De hier gebruikte waarde ligt daaronder en is dus veilig-zijdig, maar zij is een \
         benadering en geen aflezing."
            .to_string(),
    )
}

fn c1_stap(g: &Kipgegevens) -> Deelstap {
    let v = g.v;
    let mut notes = vec![
        "Bilineair geïnterpoleerd uit figuur NB.NB.5 — C₁ bij gelijkmatig verdeelde \
         belasting met eindmomenten — op het raster β = −1,0 … +1,0 in stappen van 0,5 en \
         B* = 0,00 … 1,00 in stappen van 0,05. De uiteinden van dat raster zijn verankerd \
         op tabel NB.NB.1: C₁ = 1,13 bij B* = 0 en C₁ = min(1,75 − 1,05·β + 0,3·β² ; 2,30) \
         bij B* = 1."
            .to_string(),
    ];
    notes.extend(negatieve_b_ster_notitie(v.b_ster));

    stap(
        "c1",
        "Momentenfactor C₁",
        "C_1",
        "NB.NB.4.3(3), figuur NB.NB.5",
        r"C_1 = f_{NB.NB.5}\left( \beta \,;\, \left| B^* \right| \right)".to_string(),
        format!(
            r"C_1 = f_{{NB.NB.5}}\left( {} \,;\, {} \right)",
            lx(v.beta, 3),
            lx(v.b_ster.abs(), 3)
        ),
        vec![nv(r"\beta", v.beta, "-"), nv("B^*", v.b_ster, "-")],
        Some(v.c1),
        "-",
        notes,
    )
}

fn c2_tabel_stap(g: &Kipgegevens) -> Deelstap {
    let v = g.v;
    let mut notes = vec![
        "Bilineair geïnterpoleerd uit figuur NB.NB.6, op hetzelfde raster als C₁ en \
         verankerd op tabel NB.NB.1: C₂ = 0,45 bij B* = 0 en C₂ = 0 bij B* = 1. Deze \
         tabelwaarde geldt voor een belasting die aangrijpt in het zwaartepunt van de \
         bovenflens; de volgende stap schaalt haar naar het werkelijke aangrijpingspunt."
            .to_string(),
    ];
    notes.extend(negatieve_b_ster_notitie(v.b_ster));

    stap(
        "c2_tabel",
        "Belastingfactor C₂ uit de figuur",
        "C_{2,tabel}",
        "NB.NB.4.3(3), figuur NB.NB.6",
        r"C_{2,tabel} = f_{NB.NB.6}\left( \beta \,;\, \left| B^* \right| \right)".to_string(),
        format!(
            r"C_{{2,tabel}} = f_{{NB.NB.6}}\left( {} \,;\, {} \right)",
            lx(v.beta, 3),
            lx(v.b_ster.abs(), 3)
        ),
        vec![nv(r"\beta", v.beta, "-"), nv("B^*", v.b_ster, "-")],
        Some(v.c2_tabel),
        "-",
        notes,
    )
}

// 6 ── C₂ naar het werkelijke aangrijpingspunt ────────────────────────────────

fn c2_stap(g: &Kipgegevens) -> Deelstap {
    let p = g.p;
    let arm = (p.h_mm - p.tf_mm) / 2.0;
    let schaal_ruw = if arm.abs() > 1e-9 { g.z_a_mm / arm } else { 0.0 };

    let mut notes = vec![
        "De tabelwaarde geldt bij een belasting op het zwaartepunt van de bovenflens, en \
         C₂ = 0 bij een belasting op het zwaartepunt van de doorsnede; daartussen wordt \
         lineair geïnterpoleerd. De arm tussen beide zwaartepunten is (h − t_f)/2. Het \
         minteken is de tekenafspraak van NB.NB.11: daar staat C₂ in een OPTELterm, dus \
         een belasting bóven het zwaartepunt (z_a > 0) werkt destabiliserend en moet C₂ \
         negatief maken."
            .to_string(),
    ];
    let z_a_max = nb_annex::z_a_max_nb(p.h_mm, p.tf_mm);
    if g.z_a_mm > z_a_max * (1.0 + 1e-9) {
        notes.push(format!(
            "z_a = {} mm ligt boven de grens van {} mm (zwaartepunt bovenflens + 0,1·h) \
             waartoe NB.NB.4.3(1) lineaire extrapolatie toestaat. C₂ is lineair \
             doorgetrokken; dat werkt destabiliserend en is dus veilig-zijdig, maar het is \
             een extrapolatie buiten het bereik van de bijlage.",
            nl(g.z_a_mm, 0),
            nl(z_a_max, 0)
        ));
    }
    if schaal_ruw < -1.0 {
        notes.push(format!(
            "De schaalfactor z_a/((h − t_f)/2) komt op {} uit en is bij −1 afgekapt, het \
             zwaartepunt van de ONDERflens. De bijlage geeft alleen extrapolatie naar \
             boven; verder doorschalen zou een stabiliserend effect crediteren dat zij \
             niet toekent.",
            nl(schaal_ruw, 3)
        ));
    }

    stap(
        "c2",
        "Belastingfactor C₂ bij het werkelijke aangrijpingspunt",
        "C_2",
        "NB.NB.4.3(1)",
        r"C_2 = -\,C_{2,tabel} \cdot \frac{z_a}{\left( h - t_f \right)/2}".to_string(),
        format!(
            r"C_2 = -\,{c2t} \cdot \frac{{{za}}}{{\left( {h} - {tf} \right)/2}}",
            c2t = lxh(g.v.c2_tabel, 3),
            za = lxh(g.z_a_mm, 2),
            h = lx(p.h_mm, 2),
            tf = lx(p.tf_mm, 2),
        ),
        vec![
            nv("C_{2,tabel}", g.v.c2_tabel, "-"),
            nv("z_a", g.z_a_mm, "mm"),
            nv("h", p.h_mm, "mm"),
            nv("t_f", p.tf_mm, "mm"),
        ],
        Some(g.v.c2),
        "-",
        notes,
    )
}

// 7 ── L_kip ──────────────────────────────────────────────────────────────────

fn l_kip_stap(g: &Kipgegevens) -> Deelstap {
    let v = g.v;
    if v.tussen_gaffels {
        return stap(
            "l_kip",
            "Vervangende ongesteunde kiplengte",
            "L_{kip}",
            "NB.NB.4.3",
            r"L_{kip} = L_{st}".to_string(),
            String::new(),
            vec![nv("L_{st}", v.l_st_mm, "mm")],
            Some(v.l_kip_mm),
            "mm",
            vec![
                "Dit kipveld ligt tussen TWEE GAFFELS; NB.NB.4.3 geeft dan L_kip = L_st. De \
                 formule (1,4 − 0,8·β)·L_st geldt alleen tussen één gaffel en één kipsteun \
                 of tussen twee kipsteunen. Zou zij hier tóch worden toegepast, dan gaf \
                 β = 0 een L_kip van 1,4·L_st en daarmee een ruim 30 % te lage M_cr."
                    .to_string(),
            ],
        );
    }

    let factor_ruw = 1.4 - 0.8 * v.beta;
    let mut notes = vec![
        "Dit kipveld ligt tussen één gaffel en één kipsteun, of tussen twee kipsteunen; \
         NB.NB.4.3 geeft dan de formule met β, met de begrenzing 1,0 ≤ L_kip/L_st ≤ 1,4."
            .to_string(),
    ];
    if !(1.0..=1.4).contains(&factor_ruw) {
        notes.push(format!(
            "De formule geeft een factor {}; die is op {} afgekapt door de begrenzing \
             1,0 ≤ L_kip/L_st ≤ 1,4.",
            nl(factor_ruw, 3),
            nl(factor_ruw.clamp(1.0, 1.4), 1)
        ));
    }
    if v.l_kip_mm > g.l_g_mm * (1.0 + 1e-9) {
        notes.push(format!(
            "L_kip = {} mm is groter dan de afstand tussen de gaffels L_g = {} mm. \
             NB.NB.4.3 begrenst L_kip/L_st wel op 1,4 maar niet op L_g, zodat een kipsteun \
             dicht bij een gaffel de berekende weerstand kan verlagen ten opzichte van \
             dezelfde ligger zónder die steun.",
            nl(v.l_kip_mm, 0),
            nl(g.l_g_mm, 0)
        ));
    }

    stap(
        "l_kip",
        "Vervangende ongesteunde kiplengte",
        "L_{kip}",
        "NB.NB.4.3",
        r"L_{kip} = \left( 1{,}4 - 0{,}8 \cdot \beta \right) \cdot L_{st}".to_string(),
        format!(
            r"L_{{kip}} = \left( 1{{,}}4 - 0{{,}}8 \cdot {} \right) \cdot {}",
            lxh(v.beta, 3),
            lx(v.l_st_mm, 2)
        ),
        vec![nv(r"\beta", v.beta, "-"), nv("L_{st}", v.l_st_mm, "mm")],
        Some(v.l_kip_mm),
        "mm",
        notes,
    )
}

// 8 ── S ──────────────────────────────────────────────────────────────────────

fn s_stap(g: &Kipgegevens) -> Deelstap {
    let p = g.p;
    stap(
        "s",
        "Doorsnedeparameter S",
        "S",
        "NB.NB.13",
        r"S = \frac{h}{2} \cdot \sqrt{\frac{E \cdot I_z}{G \cdot I_t}}".to_string(),
        format!(
            r"S = \frac{{{h}}}{{2}} \cdot \sqrt{{\frac{{{e} \cdot {iz}}}{{{gg} \cdot {it}}}}}",
            h = lx(p.h_mm, 2),
            e = lx(nb_annex::E_MPA, 0),
            iz = lx(p.iz_mm4, 0),
            gg = lx(nb_annex::G_MPA, 0),
            it = lx(p.it_mm4, 0),
        ),
        vec![
            nv("h", p.h_mm, "mm"),
            nv("E", nb_annex::E_MPA, "MPa"),
            nv("I_z", p.iz_mm4, "mm⁴"),
            nv("G", nb_annex::G_MPA, "MPa"),
            nv("I_t", p.it_mm4, "mm⁴"),
        ],
        Some(g.s_mm),
        "mm",
        vec![
            "S vervangt in de NB-vorm de welvingsstijfheid. NB.NB.13 rekent met de VOLLE \
             hoogte h; een herleiding via I_w = I_z·(h − t_f)²/4 zou (h − t_f)/2 geven. Het \
             welvingstraagheidsmoment I_w komt in deze keten dan ook nergens voor: NB.148 \
             rekent alleen met I_z en I_t."
                .to_string(),
            "E = 210 000 MPa volgens art. 3.2.6. G = 80 769 MPa; dat is E/(2(1+ν)) met \
             ν = 0,3, afgerond zoals de referentie-uitwerking hem voert."
                .to_string(),
        ],
    )
}

// 8b ── z_j (alleen op de monosymmetrische route) ─────────────────────────────

/// De monosymmetrieparameter: waar hij vandaan komt, welk teken hij krijgt en
/// wat er werkelijk mee gerekend is.
///
/// Drie getallen die uit elkaar gehouden moeten worden, want ze zijn niet
/// hetzelfde en het verschil is precies waar de fout in zou sluipen:
///  * de **meetkundige** z_j — een vaste eigenschap van de doorsnede;
///  * de z_j **met het teken van de gedrukte flens** — hangt van het moment af;
///  * de **rekenwaarde** — die met de gunstige tak afgekapt.
fn z_j_stap(g: &Kipgegevens, m: &Monogegevens) -> Deelstap {
    let symmetrisch = m.z_j_geometrisch_mm.abs() <= 1e-6;
    let v = g.v;

    let mut notes = Vec::new();
    if symmetrisch {
        notes.push(
            "z_j = 0 omdat de doorsnede symmetrisch is om de buigingsas. NEN-EN 1999-1-1 art. \
             I.1.2(1), OPMERKING 2 stelt dat met zoveel woorden: z_j = 0 voor dwarsdoorsneden \
             met de y-as als symmetrieas. Voor elk profiel uit de catalogus — IPE, HEA, HEB, \
             HEM, koker, buis — is dat het geval, en de term valt dan weg."
                .to_string(),
        );
    } else {
        notes.push(format!(
            "z_j is berekend uit de geometrie van de doorsnede: z_j = z_s − ½·∬(y² + z²)·z dA / \
             I_y, met z_s het schuifmiddelpunt ten opzichte van het zwaartepunt en z omhoog \
             positief. De doorsnedemotor levert {} mm. Dat is een vaste eigenschap van de \
             doorsnede; het teken hieronder is dat niet.",
            nl(m.z_j_geometrisch_mm, 3)
        ));
        notes.push(format!(
            "Teken volgens NEN-EN 1999-1-1 art. I.1.2(7): de coördinaat z is positief naar de op \
             DRUK belaste flens, en het teken van z_j is gelijk aan dat van \
             ψ_f = (I_fc − I_ft)/(I_fc + I_ft). {bevinding} z_j wordt daarmee {teken} mm.",
            bevinding = match m.gedrukte_flens {
                GedrukteFlens::Boven =>
                    "In dit kipveld is M_y nergens negatief, dus is overal de BOVENflens gedrukt."
                        .to_string(),
                GedrukteFlens::Onder =>
                    "In dit kipveld is M_y nergens positief, dus is overal de ONDERflens gedrukt."
                        .to_string(),
                GedrukteFlens::Beide => format!(
                    "Dit kipveld WISSELT van kromming: de momenten aan begin, midden en eind zijn \
                     {mb}, {mm}, {me} kNm. Op het ene deel is de bovenflens gedrukt, op het \
                     andere de onderflens; er is dus geen enkele gedrukte flens aan te wijzen. \
                     Aangehouden is de ONGUNSTIGE tak (−|z_j|).",
                    mb = nl(v.momenten_knm[0], 3),
                    mm = nl(v.momenten_knm[1], 3),
                    me = nl(v.momenten_knm[2], 3),
                ),
                GedrukteFlens::Onbekend =>
                    "Alle drie de bekende momenten in dit kipveld zijn nul, dus welke flens \
                     gedrukt is, valt niet te zeggen. Aangehouden is de ONGUNSTIGE tak (−|z_j|)."
                        .to_string(),
            },
            teken = nl(m.z_j_norm_mm, 3),
        ));
        if m.gedrukte_flens == GedrukteFlens::Beide {
            notes.push(
                "Waarom niet simpelweg het teken van het grootste moment: dan zou een veld met \
                 M_begin = +100 en M_eind = −99 kNm als 'bovenflens gedrukt' gelden, waarna de \
                 afkapping de monosymmetriestraf op nul zet — terwijl de kleine flens over een \
                 deel van dat veld wel degelijk gedrukt is. Bovendien zouden twee \
                 spiegelbeeldige belastinggevallen dan een verschillende M_cr geven, en dat kan \
                 niet."
                    .to_string(),
            );
        }
        notes.push(
            "Waarom dat teken ertoe doet: M_cr is dalend in D = C₂·z_g − C₃·z_j. Een positieve \
             z_j — de grote flens is de gedrukte — verhoogt M_cr, een negatieve verlaagt hem. \
             Wie het meetkundige getal onveranderd invult, krijgt bij een steunmoment een te \
             HOGE M_cr; dat is de onveilige kant."
                .to_string(),
        );
    }
    if m.z_j_norm_mm > 1e-6 {
        notes.push(format!(
            "AFKAPPING, een expliciete keuze. z_j is met het juiste teken +{} mm en zou M_cr \
             VERHOGEN. Die winst wordt niet gecrediteerd: ingevuld is z_j = 0. Reden is C₃ — zie \
             de stap M_cr hieronder — die hier geen aflezing is maar een bovengrens over een \
             hele tabelkolom. Een bovengrens werkt maar één kant op: bij een negatieve z_j \
             verlaagt hij M_cr (veilig), bij een positieve zou hij M_cr juist VERHOGEN. De \
             uitkomst blijft daardoor gelijk aan die van een doorsnede zonder monosymmetrie, en \
             nooit hoger.",
            nl(m.z_j_norm_mm, 3)
        ));
    } else if !symmetrisch {
        notes.push(
            "z_j is negatief: de kleine flens is de gedrukte. Dat werkt destabiliserend en \
             verlaagt M_cr; deze term rekent volledig mee."
                .to_string(),
        );
    }

    stap(
        "z_j",
        "Monosymmetrieparameter",
        "z_j",
        "NEN-EN 1999-1-1 art. I.1.2(1) en (7)",
        r"z_j = z_s - \frac{1}{2 \cdot I_y} \iint \left( y^2 + z^2 \right) z \,\mathrm{d}A \quad\Rightarrow\quad z_{j,reken} = \min\left( \pm z_j \,;\, 0 \right)"
            .to_string(),
        if symmetrisch {
            String::new()
        } else {
            format!(
                r"z_j = {geo} \;\rightarrow\; {norm} \;\rightarrow\; z_{{j,reken}} = {rek}",
                geo = lxh(m.z_j_geometrisch_mm, 3),
                norm = lxh(m.z_j_norm_mm, 3),
                rek = lxh(m.z_j_reken_mm, 3),
            )
        },
        vec![
            nv("z_{j,meetkundig}", m.z_j_geometrisch_mm, "mm"),
            nv("M_{y,Ed,maatgevend}", v.m_maatgevend_knm, "kNm"),
            nv("z_{j,reken}", m.z_j_reken_mm, "mm"),
        ],
        Some(m.z_j_reken_mm),
        "mm",
        notes,
    )
}

// 9 ── C ──────────────────────────────────────────────────────────────────────

fn c_stap(g: &Kipgegevens) -> Deelstap {
    let v = g.v;
    stap(
        "c",
        "C-coëfficiënt",
        "C",
        "NB.NB.11",
        r"C = \frac{\pi \cdot C_1 \cdot L_g}{L_{kip}} \left( \sqrt{1 + \frac{\pi^2 \cdot S^2}{L_{kip}^2} \left( C_2^2 + 1 \right)} + \frac{\pi \cdot C_2 \cdot S}{L_{kip}} \right)"
            .to_string(),
        format!(
            r"C = \frac{{\pi \cdot {c1} \cdot {lg}}}{{{lk}}} \left( \sqrt{{1 + \frac{{\pi^2 \cdot {s}^2}}{{{lk}^2}} \left( {c2}^2 + 1 \right)}} + \frac{{\pi \cdot {c2} \cdot {s}}}{{{lk}}} \right)",
            c1 = lx(v.c1, 3),
            lg = lx(g.l_g_mm, 2),
            lk = lx(v.l_kip_mm, 2),
            s = lx(g.s_mm, 2),
            c2 = lxh(v.c2, 3),
        ),
        vec![
            nv("C_1", v.c1, "-"),
            nv("L_g", g.l_g_mm, "mm"),
            nv("L_{kip}", v.l_kip_mm, "mm"),
            nv("S", g.s_mm, "mm"),
            nv("C_2", v.c2, "-"),
        ],
        Some(v.c),
        "-",
        vec![
            "Let op de haakjes: de term π·C₂·S/L_kip staat BUITEN de wortel. Bij een \
             belasting boven het zwaartepunt is C₂ negatief, en die losse term verlaagt C \
             dan — en daarmee M_cr."
                .to_string(),
        ],
    )
}

// 10 ── α (alleen op de tak die hem gebruikt) ─────────────────────────────────

fn alpha_stap(g: &Kipgegevens) -> Option<Deelstap> {
    let p = g.p;
    // Zelfde voorwaarde als in `nb_annex::k_red`: α wordt alleen berekend als
    // de slankheid van het lijf boven de drempel van NB.NB.7 uitkomt.
    if p.h_mm / p.tw_mm.max(1e-9) <= 75.0 {
        return None;
    }
    let alpha = nb_annex::alpha_nb9(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, g.l_g_mm);

    let mut notes = vec![
        "α is de vervormbaarheidsmaat van de liggerdoorsnede: hoe groter α, hoe \
         vervormbaarder het lijf ten opzichte van de liggerlengte en hoe sterker M_cr \
         gereduceerd moet worden. Alle lengtematen in mm."
            .to_string(),
    ];
    if alpha > nb_annex::ALPHA_MAX {
        notes.push(format!(
            "α = {} ligt boven de grens van {} waar NB.NB.4.2(3) nog een reductiefactor \
             geeft. De bijlage schrijft daar in plaats daarvan een toets van de gedrukte \
             rand volgens 6.3.3 voor. De k_red hieronder is de doorgetrokken NB.NB.8-vorm, \
             zodat de berekening niet stilvalt; die aanvullende toets vervangt hij niet.",
            nl(alpha, 0),
            nl(nb_annex::ALPHA_MAX, 0)
        ));
    }

    Some(stap(
        "alpha",
        "Vervormbaarheid van de doorsnede",
        r"\alpha",
        "NB.NB.9",
        r"\alpha = \frac{h \cdot t_f \cdot 10^{12}}{t_w^3 \cdot b \cdot L_g^2}".to_string(),
        format!(
            r"\alpha = \frac{{{h} \cdot {tf} \cdot 10^{{12}}}}{{{tw}^3 \cdot {b} \cdot {lg}^2}}",
            h = lx(p.h_mm, 2),
            tf = lx(p.tf_mm, 2),
            tw = lx(p.tw_mm, 2),
            b = lx(p.b_mm, 2),
            lg = lx(g.l_g_mm, 2),
        ),
        vec![
            nv("h", p.h_mm, "mm"),
            nv("t_f", p.tf_mm, "mm"),
            nv("t_w", p.tw_mm, "mm"),
            nv("b", p.b_mm, "mm"),
            nv("L_g", g.l_g_mm, "mm"),
        ],
        Some(alpha),
        "-",
        notes,
    ))
}

// 11 ── k_red ─────────────────────────────────────────────────────────────────

fn k_red_stap(g: &Kipgegevens) -> Deelstap {
    let p = g.p;
    let h_tw = p.h_mm / p.tw_mm.max(1e-9);

    if h_tw <= 75.0 {
        return stap(
            "k_red",
            "Reductiefactor voor de vervormbaarheid van het lijf",
            "k_{red}",
            "NB.NB.7",
            r"\frac{h}{t_w} \le 75 \;\Rightarrow\; k_{red} = 1{,}0".to_string(),
            format!(
                r"\frac{{{h}}}{{{tw}}} = {r} \le 75 \;\Rightarrow\; k_{{red}} = 1{{,}}0",
                h = lx(p.h_mm, 2),
                tw = lx(p.tw_mm, 2),
                r = lx(h_tw, 2),
            ),
            vec![nv("h", p.h_mm, "mm"), nv("t_w", p.tw_mm, "mm")],
            Some(g.k_red),
            "-",
            vec![
                "Het lijf is niet slank genoeg om M_cr te verlagen: NB.NB.7 geeft dan \
                 k_red = 1 en de vervormbaarheidsmaat α van NB.NB.9 hoeft niet te worden \
                 bepaald."
                    .to_string(),
            ],
        );
    }

    let alpha = nb_annex::alpha_nb9(p.h_mm, p.tf_mm, p.tw_mm, p.b_mm, g.l_g_mm);
    let ruw = -5.4e-5 * alpha + 1.03;
    let mut notes = vec![format!(
        "h/t_w = {} > 75, dus geldt niet NB.NB.7 (k_red = 1) maar NB.NB.8, met de α uit de \
         vorige stap.",
        nl(h_tw, 2)
    )];
    if ruw > 1.0 {
        notes.push(format!(
            "De formule geeft {}; de bovengrens 1,0 is bindend, want een k_red boven 1 zou \
             M_cr verhogen.",
            nl(ruw, 3)
        ));
    }

    stap(
        "k_red",
        "Reductiefactor voor de vervormbaarheid van het lijf",
        "k_{red}",
        "NB.NB.8",
        r"\frac{h}{t_w} > 75 \;\Rightarrow\; k_{red} = \min\left( -5{,}4 \cdot 10^{-5} \cdot \alpha + 1{,}03 \,;\, 1{,}0 \right)"
            .to_string(),
        format!(
            r"\frac{{{h}}}{{{tw}}} = {r} > 75 \;\Rightarrow\; k_{{red}} = \min\left( -5{{,}}4 \cdot 10^{{-5}} \cdot {a} + 1{{,}}03 \,;\, 1{{,}}0 \right)",
            h = lx(p.h_mm, 2),
            tw = lx(p.tw_mm, 2),
            r = lx(h_tw, 2),
            a = lx(alpha, 1),
        ),
        vec![
            nv("h", p.h_mm, "mm"),
            nv("t_w", p.tw_mm, "mm"),
            nv(r"\alpha", alpha, "-"),
        ],
        Some(g.k_red),
        "-",
        notes,
    )
}

// 12 ── M_cr ──────────────────────────────────────────────────────────────────

fn m_cr_stap(g: &Kipgegevens) -> Deelstap {
    if let (McrVorm::AlgemeenMonosymmetrisch, Some(m)) = (g.vorm, g.mono) {
        return m_cr_stap_algemeen(g, &m);
    }
    let p = g.p;
    let v = g.v;
    let kanaal = g.vorm == McrVorm::Kanaal;

    let (formule, ingevuld) = if kanaal {
        (
            format!(
                r"M_{{cr}} = {red} \cdot k_{{red}} \cdot \frac{{C}}{{L_g}} \cdot \sqrt{{E \cdot I_z \cdot G \cdot I_t}} \cdot 10^{{-6}}",
                red = lx(nb_annex::CHANNEL_REDUCTIE, 2)
            ),
            format!(
                r"M_{{cr}} = {red} \cdot {kr} \cdot \frac{{{c}}}{{{lg}}} \cdot \sqrt{{{e} \cdot {iz} \cdot {gg} \cdot {it}}} \cdot 10^{{-6}}",
                red = lx(nb_annex::CHANNEL_REDUCTIE, 2),
                kr = lx(g.k_red, 3),
                c = lx(v.c, 3),
                lg = lx(g.l_g_mm, 2),
                e = lx(nb_annex::E_MPA, 0),
                iz = lx(p.iz_mm4, 0),
                gg = lx(nb_annex::G_MPA, 0),
                it = lx(p.it_mm4, 0),
            ),
        )
    } else {
        (
            r"M_{cr} = k_{red} \cdot \frac{C}{L_g} \cdot \sqrt{E \cdot I_z \cdot G \cdot I_t} \cdot 10^{-6}"
                .to_string(),
            format!(
                r"M_{{cr}} = {kr} \cdot \frac{{{c}}}{{{lg}}} \cdot \sqrt{{{e} \cdot {iz} \cdot {gg} \cdot {it}}} \cdot 10^{{-6}}",
                kr = lx(g.k_red, 3),
                c = lx(v.c, 3),
                lg = lx(g.l_g_mm, 2),
                e = lx(nb_annex::E_MPA, 0),
                iz = lx(p.iz_mm4, 0),
                gg = lx(nb_annex::G_MPA, 0),
                it = lx(p.it_mm4, 0),
            ),
        )
    };

    let mut notes = vec![
        "De factor 10⁻⁶ zet het resultaat van N·mm naar kNm. I_w komt in deze formule niet \
         voor: de NB-vorm vangt de welving in de C-coëfficiënt, via S."
            .to_string(),
    ];
    if kanaal {
        notes.push(format!(
            "De factor {} is GEEN normwaarde. De bijlage geeft voor een monosymmetrisch \
             U-profiel geen M_cr; de werkelijke waarde vraagt de \
             monosymmetrieparameter z_j, die hier niet is uitgewerkt. Aangehouden is de \
             I-vorm van NB.148 maal een vaste, veilig-zijdig bedoelde reductie — een \
             expliciete keuze buiten de norm om.",
            nl(nb_annex::CHANNEL_REDUCTIE, 1)
        ));
    }

    stap(
        "m_cr",
        "Kritiek kipmoment",
        "M_{cr}",
        if kanaal {
            "NB.148, met een reductie buiten de norm om"
        } else {
            "NB.148"
        },
        formule,
        ingevuld,
        vec![
            nv("k_{red}", g.k_red, "-"),
            nv("C", v.c, "-"),
            nv("L_g", g.l_g_mm, "mm"),
            nv("E", nb_annex::E_MPA, "MPa"),
            nv("I_z", p.iz_mm4, "mm⁴"),
            nv("G", nb_annex::G_MPA, "MPa"),
            nv("I_t", p.it_mm4, "mm⁴"),
        ],
        Some(v.m_cr_knm),
        "kNm",
        notes,
    )
}

/// M_cr volgens de algemene elastische formule, mét z_g en z_j.
///
/// Aparte functie in plaats van een derde tak in [`m_cr_stap`]: deze vorm deelt
/// met de NB-vorm geen enkel symbool behalve k_red, en één functie met drie
/// takken zou de twee geverifieerde NB-teksten tussen de nieuwe door verstoppen.
fn m_cr_stap_algemeen(g: &Kipgegevens, m: &Monogegevens) -> Deelstap {
    let p = g.p;
    let v = g.v;
    let d = m.d_mm;

    let notes = vec![
        "Dit is NIET de vorm van bijlage NB.NB. NB.NB.1(1) begrenst die bijlage tot \
         dubbelsymmetrische I-vormige doorsneden en buisprofielen met h/b > 3; deze doorsnede \
         valt daarbuiten. Gerekend is de algemene elastische formule — NEN-EN 1999-1-1 bijlage I \
         (informatief), art. I.1.2(1), formules (I.2) en (I.3) — met k_z = k_w = 1. Zij voldoet \
         aan de eis van art. 6.3.2.2(2), maar is geen Nederlandse NB-waarde."
            .to_string(),
        "De gebruikte formule komt uit NEN-EN 1999-1-1, en dat is de ALUMINIUM-Eurocode. Dat is \
         een bewuste keuze en geen vergissing: (I.2)/(I.3) is geen materiaalregel maar de \
         oplossing van het elastische kipprobleem van een prismatische staaf — er komen alleen \
         E, G en doorsnedegrootheden in voor. EN 1993-1-1 geeft zelf geen uitdrukking voor M_cr \
         (art. 6.3.2.2(2) stelt alleen eisen) en de Nederlandse nationale bijlage begrenst zich \
         in NB.NB.1(1) tot dubbelsymmetrische I-profielen en buisprofielen met h/b > 3; haar \
         symbolenlijst kent z_j en C₃ niet. Er is dus geen Nederlandse route die voorgaat. Al \
         het materiaalgebondene — E, G, f_y, γ_M1, de kipkromme, de doorsnedeklasse — komt \
         onverkort uit de staalnorm."
            .to_string(),
        format!(
            "C₃ = {c3} is een VEILIGE BOVENGRENS uit de tabel, geen aflezing van één regel. C₃ \
             komt niet voor in NEN-EN 1993-1-1 en niet in de nationale bijlage; hij staat in \
             NEN-EN 1999-1-1 tabel I.1 (eindmomentbelasting) en I.2 (dwarsbelasting). Daar is \
             hij geen constante: beide tabellen splitsen de C₃-kolom naar de monosymmetrische \
             dwarsdoorsnedefactor ψ_f = (I_fc − I_ft)/(I_fc + I_ft), en binnen elke band \
             varieert hij nog met de momentenlijn en met de kniklengtefactor k_z. {band} \
             Aangehouden is de ONGUNSTIGSTE waarde die in die band voorkomt, {c3}. Dat de band \
             als geheel wordt afgedekt in plaats van één regel te worden afgelezen, is een \
             KEUZE: C₁ en C₂ komen hier uit de figuren NB.NB.5 en NB.NB.6 en de eindcondities \
             zitten in L_kip, en er is geen normregel die zegt welke tabelregel daarbij hoort. \
             Een regel aanwijzen zou een normwaarde verzinnen; de band afdekken kan wél worden \
             onderbouwd.",
            c3 = nl(m.c3, 2),
            band = match m.psi_f {
                Some(p) => format!(
                    "Voor deze doorsnede is ψ_f = {} opgegeven, wat in de band {} valt.",
                    nl(p, 3),
                    if p > -0.9 { "−0,9 ≤ ψ_f ≤ 0" } else { "ψ_f = −1" },
                ),
                None => "ψ_f is voor deze doorsnede niet opgegeven — de doorsnedemotor levert \
                         z_j en het schuifmiddelpunt, niet de opsplitsing naar I_fc en I_ft — \
                         dus geldt de ongunstigste band over heel ψ_f ≤ 0, de band ψ_f = −1."
                    .to_string(),
            },
        ),
        "Waarom alleen ψ_f ≤ 0 telt: de z_j-term is afgekapt op de ongunstige helft (zie de stap \
         z_j), en art. I.1.2(7) koppelt het teken van z_j aan dat van ψ_f. De berekening blijft \
         daardoor in het gebied ψ_f ≤ 0 — en dat is precies het deel van tabel I.1 en I.2 dat in \
         het beschikbare exemplaar volledig leesbaar is; alleen de rechterband voor ψ_f > 0 is \
         daar afgekapt, en die wordt nooit gebruikt omdat z_j er nul is."
            .to_string(),
        "Wat de bovengrens kost: bij een doorsnede die nauwelijks monosymmetrisch is, is |z_j| \
         klein en merkt de uitkomst er weinig van; C₃ komt immers alleen voor als het product \
         C₃·z_j. Bij een doorsnede die er veel van merkt, is |z_j| groot en zit ψ_f juist tegen \
         −1 aan, waar deze waarde de ongunstigste van de eigen band is. Het overconservatisme \
         begrenst zichzelf, maar het is er wel: de werkelijke C₃ kan lager zijn en M_cr dus \
         hoger."
            .to_string(),
        format!(
            "z_g meet vanaf het DWARSKRACHTENCENTRUM (NEN-EN 1999-1-1 art. I.1.2(8)), niet vanaf \
             het zwaartepunt zoals de z_a van NB.NB.4.3. Het schuifmiddelpunt ligt {zs} mm \
             {richting} het zwaartepunt, dus z_g = z_a − ({zs}) = {zg} mm. Voor een \
             dubbelsymmetrische doorsnede is dat verschil nul; hier niet.",
            zs = nl(m.z_s_rel_mm, 2),
            richting = if m.z_s_rel_mm >= 0.0 { "boven" } else { "onder" },
            zg = nl(m.z_g_mm, 2),
        ),
        format!(
            "C₂ is hier de ONGECORRIGEERDE tabelwaarde uit figuur NB.NB.6. De algemene formule \
             neemt het aangrijpingspunt zelf mee via het product C₂·z_g; de naar z_a geschaalde \
             C₂ van NB.NB.4.3(1) invullen zou het aangrijpingspunt dubbel tellen. De combinatie \
             D = C₂·z_g − C₃·z_j komt op {d} mm uit. M_cr is dalend in D.",
            d = nl(d, 2)
        ),
        format!(
            "k_red = {k} komt uit NB.NB.7/NB.NB.8 en hoort niet bij de algemene formule. Hij is \
             als extra vermenigvuldiger aangehouden omdat hij per definitie ≤ 1 is en M_cr dus \
             alleen kan verlagen; hem weglaten zou een slank lijf gratis geven. Ook dat is een \
             keuze.",
            k = nl(g.k_red, 3)
        ),
        "I_w staat hier zélf in de formule. In de NB-vorm komt hij niet voor — die vangt de \
         welving in de C-coëfficiënt via S. Voor een monosymmetrische doorsnede kan dat niet: S \
         is uit h en I_z opgebouwd en veronderstelt twee gelijke flenzen, terwijl I_w van een \
         T-vorm vrijwel nul is."
            .to_string(),
    ];

    stap(
        "m_cr",
        "Kritiek kipmoment",
        "M_{cr}",
        "NEN-EN 1999-1-1 (I.2)/(I.3); buiten bijlage NB.NB om",
        r"M_{cr} = k_{red} \cdot C_1 \cdot \frac{\pi^2 E I_z}{L_{kip}^2} \left( \sqrt{\frac{I_w}{I_z} + \frac{L_{kip}^2 G I_t}{\pi^2 E I_z} + D^2} - D \right) \cdot 10^{-6}, \quad D = C_2 z_g - C_3 z_j"
            .to_string(),
        format!(
            r"M_{{cr}} = {kr} \cdot {c1} \cdot \frac{{\pi^2 \cdot {e} \cdot {iz}}}{{{lk}^2}} \left( \sqrt{{\frac{{{iw}}}{{{iz}}} + \frac{{{lk}^2 \cdot {gg} \cdot {it}}}{{\pi^2 \cdot {e} \cdot {iz}}} + {dh}^2}} - {dh} \right) \cdot 10^{{-6}}",
            kr = lx(g.k_red, 3),
            c1 = lx(v.c1, 3),
            e = lx(nb_annex::E_MPA, 0),
            iz = lx(p.iz_mm4, 0),
            lk = lx(v.l_kip_mm, 2),
            iw = lx(p.iw_mm6, 0),
            gg = lx(nb_annex::G_MPA, 0),
            it = lx(p.it_mm4, 0),
            dh = lxh(d, 3),
        ),
        vec![
            nv("k_{red}", g.k_red, "-"),
            nv("C_1", v.c1, "-"),
            nv("C_2", v.c2_tabel, "-"),
            nv("C_3", m.c3, "-"),
            nv("z_g", m.z_g_mm, "mm"),
            nv("z_{j,reken}", m.z_j_reken_mm, "mm"),
            nv("D", d, "mm"),
            nv("L_{kip}", v.l_kip_mm, "mm"),
            nv("E", nb_annex::E_MPA, "MPa"),
            nv("I_z", p.iz_mm4, "mm⁴"),
            nv("I_w", p.iw_mm6, "mm⁶"),
            nv("G", nb_annex::G_MPA, "MPa"),
            nv("I_t", p.it_mm4, "mm⁴"),
        ],
        Some(v.m_cr_knm),
        "kNm",
        notes,
    )
}

// 13 ── λ̄_LT ─────────────────────────────────────────────────────────────────

fn lambda_lt_stap(g: &Kipgegevens) -> Deelstap {
    let p = g.p;
    stap(
        "lambda_lt",
        "Relatieve slankheid voor kip",
        r"\bar{\lambda}_{LT}",
        "art. 6.3.2.2(1)",
        r"\bar{\lambda}_{LT} = \sqrt{\frac{W_{pl,y} \cdot f_y}{M_{cr} \cdot 10^6}}".to_string(),
        format!(
            r"\bar{{\lambda}}_{{LT}} = \sqrt{{\frac{{{w} \cdot {fy}}}{{{mcr} \cdot 10^6}}}}",
            w = lx(p.wpl_y_mm3, 0),
            fy = lx(g.grade.fy_mpa, 0),
            mcr = lx(g.v.m_cr_knm, 3),
        ),
        vec![
            nv("W_{pl,y}", p.wpl_y_mm3, "mm³"),
            nv("f_y", g.grade.fy_mpa, "MPa"),
            nv("M_{cr}", g.v.m_cr_knm, "kNm"),
        ],
        Some(g.lambda_lt),
        "-",
        vec![
            "W_pl,y omdat de doorsnede in klasse 1 of 2 valt; de factor 10⁶ zet M_cr van \
             kNm naar N·mm."
                .to_string(),
        ],
    )
}

// 14 en 15 ── Φ_LT en χ_LT ────────────────────────────────────────────────────

fn chi_lt_stappen(g: &Kipgegevens) -> Vec<Deelstap> {
    let lambda_lt_0 = lambda_chi::LAMBDA_LT_0;

    if g.lambda_lt < lambda_lt_0 {
        return vec![stap(
            "chi_lt",
            "Kipreductiefactor",
            r"\chi_{LT}",
            "art. 6.3.2.3(1)",
            r"\bar{\lambda}_{LT} < \bar{\lambda}_{LT,0} \;\Rightarrow\; \chi_{LT} = 1{,}0"
                .to_string(),
            format!(
                r"{l} < {l0} \;\Rightarrow\; \chi_{{LT}} = 1{{,}}0",
                l = lx(g.lambda_lt, 3),
                l0 = lx(lambda_lt_0, 1),
            ),
            vec![
                nv(r"\bar{\lambda}_{LT}", g.lambda_lt, "-"),
                nv(r"\bar{\lambda}_{LT,0}", lambda_lt_0, "-"),
            ],
            Some(g.chi_lt),
            "-",
            vec![
                "Onder de grensslankheid kipt de ligger niet: er is geen reductie en \
                 M_b,Rd valt samen met de weerstand tegen buiging om de sterke as. De \
                 imperfectiefactor α_LT speelt in deze tak geen rol."
                    .to_string(),
                "λ_LT,0 = 0,4 is de waarde die de nationale bijlage bij 6.3.2.3(1) \
                 VOORSCHRIJFT (zij schrapt daar het woord 'aanbevolen'). Dit is niet de 0,2 \
                 van de algemene methode 6.3.2.2; dat is een ander artikel, met een andere \
                 kipkrommetabel."
                    .to_string(),
            ],
        )];
    }

    let phi = lambda_chi::phi_lt(g.lambda_lt, g.alpha_lt);
    let beta_lt = lambda_chi::BETA_LT;
    let grens = 1.0 / g.lambda_lt.powi(2);
    let ruw = 1.0 / (phi + (phi.powi(2) - beta_lt * g.lambda_lt.powi(2)).sqrt());

    let mut chi_notes = vec![
        "De twee bovengrenzen horen bij vgl. (6.57): χ_LT ≤ 1,0 en χ_LT ≤ 1/λ̄_LT².".to_string(),
    ];
    if ruw > grens.min(1.0) + 1e-12 {
        chi_notes.push(format!(
            "De breuk geeft {}; bindend is hier de bovengrens {}.",
            nl(ruw, 3),
            nl(grens.min(1.0), 3)
        ));
    }

    vec![
        stap(
            "phi_lt",
            "Hulpgrootheid Φ_LT",
            r"\Phi_{LT}",
            "art. 6.3.2.3 (6.57)",
            r"\Phi_{LT} = 0{,}5 \left[ 1 + \alpha_{LT} \left( \bar{\lambda}_{LT} - \bar{\lambda}_{LT,0} \right) + \beta \cdot \bar{\lambda}_{LT}^2 \right]"
                .to_string(),
            format!(
                r"\Phi_{{LT}} = 0{{,}}5 \left[ 1 + {a} \left( {l} - {l0} \right) + {b} \cdot {l}^2 \right]",
                a = lx(g.alpha_lt, 2),
                l = lx(g.lambda_lt, 3),
                l0 = lx(lambda_lt_0, 1),
                b = lx(beta_lt, 2),
            ),
            vec![
                nv(r"\alpha_{LT}", g.alpha_lt, "-"),
                nv(r"\bar{\lambda}_{LT}", g.lambda_lt, "-"),
                nv(r"\bar{\lambda}_{LT,0}", lambda_lt_0, "-"),
                nv(r"\beta", beta_lt, "-"),
            ],
            Some(phi),
            "-",
            vec![
                g.alpha_lt_herkomst.clone(),
                "λ_LT,0 = 0,4 en β = 0,75 zijn de waarden die de nationale bijlage bij \
                 6.3.2.3(1) VOORSCHRIJFT; zij schrapt daar het woord 'aanbevolen'. De β in \
                 deze formule is NIET de β van NB.NB.4.3 hierboven — dat is de verhouding \
                 van de eindmomenten, dit is een vaste factor in de kipkromme."
                    .to_string(),
            ],
        ),
        stap(
            "chi_lt",
            "Kipreductiefactor",
            r"\chi_{LT}",
            "art. 6.3.2.3 (6.57)",
            r"\chi_{LT} = \min\left( \frac{1}{\Phi_{LT} + \sqrt{\Phi_{LT}^2 - \beta \cdot \bar{\lambda}_{LT}^2}} \,;\, 1{,}0 \,;\, \frac{1}{\bar{\lambda}_{LT}^2} \right)"
                .to_string(),
            format!(
                r"\chi_{{LT}} = \min\left( \frac{{1}}{{{p} + \sqrt{{{p}^2 - {b} \cdot {l}^2}}}} \,;\, 1{{,}}0 \,;\, \frac{{1}}{{{l}^2}} \right)",
                p = lx(phi, 3),
                b = lx(beta_lt, 2),
                l = lx(g.lambda_lt, 3),
            ),
            vec![
                nv(r"\Phi_{LT}", phi, "-"),
                nv(r"\beta", beta_lt, "-"),
                nv(r"\bar{\lambda}_{LT}", g.lambda_lt, "-"),
            ],
            Some(g.chi_lt),
            "-",
            chi_notes,
        ),
    ]
}
