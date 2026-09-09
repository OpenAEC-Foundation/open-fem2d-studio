//! Het hoofdstuk "Kruislaaghout — opbouw, I_y en toetsing per lamel" in de
//! PDF, mét de opbouwfiguur en het spanningsverloop.
//!
//! # Het bestek
//!
//! Dit hoofdstuk is de papieren tweelingbroer van
//! `design-mockup/src/components/report/sections/CltSection.tsx`: dezelfde
//! figuur, dezelfde tabel per lamel, dezelfde ontleding van de stijfheid, en
//! dezelfde meldingen.
//!
//! Wat er tot nu toe op papier stond: niets. De rapportcrate las het veld
//! `layup` van een kruislaaghout-resultaat nergens, en `notes` evenmin. Een
//! staaf van kruislaaghout kwam wél in de samenvattingstabel en kreeg wél haar
//! toetsen per lamel als losse afleidingen, maar de opbouw waaruit die toetsen
//! volgen — de lagen, de zwaartelijn, (EI)_ef, I_ef,net, de slankheid — en
//! alle waarschuwingen die de kern erbij geeft, vielen weg.
//!
//! # Waarom de opbouw van I_y hier het zwaartepunt is
//!
//! Bij een massieve doorsnede is I_y een tabelwaarde. Bij kruislaaghout is hij
//! een uitkomst: alleen de lengtelagen dragen, de dwarslagen staan er met
//! E = 0 tussen, en het grootste deel van de stijfheid komt uit de
//! Steiner-termen A_i·a_i² en niet uit de eigen traagheidsmomenten. Wie dat
//! niet ziet, kan de uitkomst niet nalopen. De tabel [`tabel_opbouw_iy`] zet
//! die opbouw daarom regel voor regel neer, met de E-gewogen kolom ernaast —
//! want (EI)_ef is wat de toetsing werkelijk gebruikt, en het verschil tussen
//! die twee kolommen is precies wat een afwijkende E-modulus per laag doet.
//!
//! # Waarom er GEEN weerstandsmoment W_y in staat
//!
//! In een samengestelde doorsnede met verschillende E per laag bestaat "de"
//! randspanning niet als M/W. Bijlage B geeft de spanning per laag
//! rechtstreeks — (B.7)+(B.8): σ_i = E_i·M·(z − z_0)/(EI)_ef — en de hele
//! keten (kern, solver, tabel, figuur) rekent daarmee. Er is in die keten
//! nergens een weerstandsmoment, en er is ook geen definitie voor gekozen.
//! Hem hier voor het eerst bedenken zou een verzonnen grootheid in een
//! rekenrapport opleveren.
//!
//! # Wat woordelijk uit de kern komt en niet mag worden herschreven
//!
//! `notes` van het staafresultaat. Daar zitten de aannamen in (methode,
//! rekenwaarden per laag, k_h = 1,0, rolschuiving ter informatie) én de
//! waarschuwingen: "normaalkracht aanwezig maar niet verwerkt", "L/h < 20
//! overschat (EI)_ef", "dwarslaag als buitenlaag". Die laatste zijn
//! veiligheidsrelevant en worden daarom letterlijk overgenomen, niet
//! samengevat.
//!
//! # Een staaf die de kern WEIGERDE te toetsen
//!
//! Die levert een resultaat zonder toetsen, met de reden in
//! `governing_check_id` (met "ERROR: " ervoor) en in `notes`. Het scherm toont
//! die reden; op papier bleef er een kop met een leeg blad eronder over. Hier
//! komt de reden er wél te staan, en de figuur en de tabellen blijven weg —
//! er is niets vastgesteld om te tekenen.

use openaec_layout::{
    flowable::Flowable,
    paragraph::Paragraph,
    spacer::{PageBreak, Spacer},
    table::{Table, TableStyleConfig},
    types::{Color, Mm, Padding, Pt},
};

use nen_en_1995_1_1::clt::{CltLayerOrientation, CltMechanics};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use steel_check::result::CheckKind;
use timber_check::clt::{CltBeamCheckResult, CltLayerResult};

use crate::betonfiguren::{nl, Figuurstijl};
use crate::figuur::{Figuur, FiguurFlowable};
use crate::houtfiguren::{
    lagen_zelfde_e, mechanica_uit_resultaat, tau_verloop, CltOpbouwFiguur, CltTekenLaag, Verloop,
};
use crate::{style_body, style_h2, style_h3, style_mono, style_note, ReportInput, C_DEEP, C_FAIL};

/// De kop van het hoofdstuk.
pub const KOP: &str = "Kruislaaghout — opbouw, I_y en toetsing per lamel";

/// Maximale hoogte van de opbouwfiguur op de bladzijde.
///
/// De figuur is liggend (362 × 176 ontwerpeenheden); op de volle kolombreedte
/// van 170 mm komt hij op ongeveer 234 pt uit. Deze grens laat hem dus met rust
/// en grijpt alleen in wanneer de kolom ooit breder wordt.
const FIGUUR_MAX_H: Pt = Pt(240.0);

// ═══════════════════════════════════════════════════════════════════════
// Toepasselijkheid
// ═══════════════════════════════════════════════════════════════════════

/// Kan dit rapport dit hoofdstuk ooit vullen?
///
/// Alleen wanneer er kruislaaghout in zit. Een zuiver stalen of betonnen
/// rapport krijgt geen leeg houthoofdstuk — dezelfde regel als bij het
/// betonhoofdstuk: "kan dit model dit ooit vullen" laat een hoofdstuk weg,
/// "is het nu leeg" niet.
pub fn van_toepassing(input: &ReportInput) -> bool {
    !input.clt_check_results.is_empty()
}

// ═══════════════════════════════════════════════════════════════════════
// Het hoofdstuk
// ═══════════════════════════════════════════════════════════════════════

/// Zet het hele hoofdstuk achter `flow`. Doet niets wanneer
/// [`van_toepassing`] `false` zegt.
pub fn extend_with_houthoofdstuk(flow: &mut Vec<Box<dyn Flowable>>, input: &ReportInput) {
    if !van_toepassing(input) {
        return;
    }
    let stijl = Figuurstijl::default();

    flow.push(Box::new(PageBreak));
    flow.push(Box::new(Paragraph::new(KOP, style_h2()).kop()));

    // De methode, woordelijk zoals het live rapport hem stelt.
    flow.push(Box::new(Paragraph::new(
        "Methode: samengestelde doorsnede met starre verbinding (NEN-EN 1995-1-1 bijlage B met \
         \u{3b3} = 1) — alleen de lengtelagen dragen in de spanrichting (E = E_0,mean), de \
         dwarslagen vormen de schuifverbinding (E = 0). Toetsing per lamel: buiging art. 6.1.6 \
         en dwarskracht art. 6.1.7 op de rekenwaarden van de sterkteklasse van die laag; \
         rolschuiving in de dwarslagen ter informatie.",
        style_body(),
    )));
    flow.push(Box::new(Paragraph::new(
        // Hier staat met opzet het WOORD "weerstandsmoment" en niet het symbool:
        // `tests/houthoofdstuk_pdf.rs` eist dat dat symbool nergens op het blad
        // voorkomt, en die bewaking zou door deze zin zelf worden opgeheven.
        "Spanningen volgen bijlage B (B.7)+(B.8): \u{3c3}_i = E_i·M·(z − z_0)/(EI)_ef, en \
         \u{3c4}(z) = V·(ES)(z)/((EI)_ef·b_ef). Er is in deze keten geen weerstandsmoment: in \
         een opbouw met verschillende E per laag bestaat de randspanning niet als M gedeeld \
         door een weerstandsmoment, en de norm geeft de spanning per laag rechtstreeks. z \
         loopt van de bovenkant (z = 0) naar de onderkant; \u{3c3} is trek-positief.",
        style_body(),
    )));

    for r in &input.clt_check_results {
        extend_met_staaf(flow, r, &stijl);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Eén staaf
// ═══════════════════════════════════════════════════════════════════════

fn extend_met_staaf(
    flow: &mut Vec<Box<dyn Flowable>>,
    r: &CltBeamCheckResult,
    stijl: &Figuurstijl,
) {
    flow.push(Box::new(
        Paragraph::new(
            format!(
                "Staaf {} — {} ({})",
                r.beam_id, r.section_name, r.strength_class
            ),
            style_h3(),
        )
        .kop(),
    ));

    // EEN GEWEIGERDE STAAF. Zonder dit blok bleef er een kop met een leeg blad
    // eronder over, terwijl het scherm de reden wél toont.
    if r.checks.is_empty() {
        flow.push(Box::new(Paragraph::new(
            "De rekenkern heeft deze staaf niet getoetst. Er is dus niets vastgesteld: geen \
             unity check, geen status, en geen opbouw om te tekenen. De reden, woordelijk zoals \
             de rekengang hem geeft:",
            style_body(),
        )));
        if r.notes.is_empty() {
            // De kern zet de reden altijd in `notes`; blijft die toch leeg,
            // dan draagt `governing_check_id` hem nog ("ERROR: …").
            flow.push(Box::new(Paragraph::new(
                r.governing_check_id.clone(),
                let_op_stijl(),
            )));
        }
        for n in &r.notes {
            flow.push(Box::new(Paragraph::new(n.clone(), let_op_stijl())));
        }
        flow.push(Box::new(Spacer::from_mm(3.0)));
        return;
    }

    // De gegevensregel hoort bij wat eronder staat: `.kop()`.
    flow.push(Box::new(
        Paragraph::new(
            format!(
                "EN 1995-1-1 · klimaatklasse {} · belastingduur {} · h = {} mm · b = {} mm · \
                 z_0 = {} mm · (EI)_ef = {} kNm² · I_ef,net = {}·10^6 mm⁴ · (EA)_ef = {} kN · \
                 L/h = {} · UC = {} ({})",
                klimaatklasse(r.service_class),
                belastingduur(r.load_duration),
                nl(r.layup.height_mm, 0),
                nl(r.layup.width_mm, 0),
                nl(r.layup.z0_mm, 1),
                nl(r.layup.ei_ef_knm2, 0),
                nl(r.layup.i_ef_net_mm4 / 1e6, 1),
                // (EA)_ef hoort erbij en niet alleen (EI)_ef: het is de axiale
                // helft van dezelfde samengestelde doorsnede, en het is de
                // waarde waarmee de solver de staaf op normaalkracht rekent.
                nl(r.layup.ea_ef_kn, 0),
                nl(r.layup.slenderness, 1),
                nl(r.uc_max, 2),
                r.governing_check_id,
            ),
            style_mono(),
        )
        .kop(),
    ));

    let krachten = Toetskrachten::van(r);
    let mech = mechanica_uit_resultaat(&r.layup);

    match &mech {
        Some(m) => {
            flow.push(Box::new(
                FiguurFlowable::nieuw(
                    Figuur::CltOpbouw {
                        opbouw: Box::new(bouw_figuur(r, m, &krachten)),
                    },
                    stijl.clone(),
                    FIGUUR_MAX_H,
                )
                .met_bijschrift(figuur_bijschrift(r, &krachten), style_note()),
            ));
        }
        None => flow.push(Box::new(Paragraph::new(
            "Opbouwfiguur niet getekend: de lagen uit het toetsresultaat zijn niet terug te \
             rekenen tot een opbouw die de rekenkern aanvaardt.",
            style_note(),
        ))),
    }

    // ── De opbouw van I_y: waar de gebruiker om vroeg ────────────────────
    if let Some(m) = &mech {
        flow.push(Box::new(
            Paragraph::new(
                "Opbouw van I_y en de effectieve buigstijfheid (bijlage B, starre verbinding: \
                 \u{3b3} = 1)",
                style_h3(),
            )
            .kop(),
        ));
        flow.push(Box::new(
            Paragraph::new(
                format!(
                    "z_0 = \u{3a3} E_i·A_i·z_i / \u{3a3} E_i·A_i = {} mm · \
                     (EI)_ef = \u{3a3} E_i·(I_i + A_i·a_i²) = {} kNm² · \
                     I_ef,net = (EI)_ef / E_ref = {}·10^6 mm⁴",
                    nl(r.layup.z0_mm, 1),
                    nl(r.layup.ei_ef_knm2, 0),
                    nl(r.layup.i_ef_net_mm4 / 1e6, 1),
                ),
                style_mono(),
            )
            .kop(),
        ));
        flow.push(Box::new(tabel_opbouw_iy(r, m)));
        flow.push(Box::new(Paragraph::new(somnoot(r, m), style_note())));
        flow.push(Box::new(Paragraph::new(
            "De dwarslagen staan in de tabel met hun werkelijke A_i en I_i, maar met E_i = 0 \
             dragen ze niet bij; zonder die regels lijkt de som onverklaarbaar veel kleiner dan \
             b·h³/12. Het grootste deel van de stijfheid komt uit de Steiner-termen A_i·a_i² en \
             niet uit de eigen traagheidsmomenten — dat is wat een gelamineerde opbouw doet.",
            style_note(),
        )));
    }

    // ── Toetsing per lamel ───────────────────────────────────────────────
    flow.push(Box::new(
        Paragraph::new("Toetsing per lamel (van boven naar beneden)", style_h3()).kop(),
    ));
    flow.push(Box::new(tabel_per_lamel(r)));
    if r.layup.layers.iter().any(|l| l.governing) {
        flow.push(Box::new(Paragraph::new(
            "* de laag met de maatgevende toets van deze staaf; in de figuur hierboven heeft \
             die laag de zware contour.",
            style_note(),
        )));
    }
    flow.push(Box::new(Paragraph::new(
        "Een dwarslaag krijgt geen unity check: f_v,rol staat niet in de norm en niet in de \
         sterkteklassen van EN 338. De rolschuifspanning staat er ter informatie, zodat zij \
         naast een gedeclareerde waarde uit een productverklaring gelegd kan worden.",
        style_note(),
    )));

    // ── De meldingen van de kern — woordelijk, niet samengevat ───────────
    for n in &r.notes {
        let stijl_regel = if is_waarschuwing(n) {
            let_op_stijl()
        } else {
            style_note()
        };
        flow.push(Box::new(Paragraph::new(n.clone(), stijl_regel)));
    }
    flow.push(Box::new(Spacer::from_mm(3.0)));
}

// ═══════════════════════════════════════════════════════════════════════
// De twee maatgevende punten
// ═══════════════════════════════════════════════════════════════════════

/// De krachtstoestanden waarop de kern deze staaf getoetst heeft — met de
/// PLAATS waar ze vandaan komen.
///
/// Het zijn er TWEE, en dat is het hele punt: art. 6.1.6 rekent op het punt in
/// de omhullende met de grootste |M_y|, art. 6.1.7 op het punt met de grootste
/// |V_z|. Alleen bij een uitkraging vallen die samen. De figuur zet drie
/// panelen naast elkaar en die lezen als één toestand van de doorsnede;
/// daarom reist de plaats mee en staat zij onder elk spanningspaneel én in het
/// bijschrift.
///
/// Dezelfde afleiding als `toetskrachten` in `CltSection.tsx`, en uit dezelfde
/// bron: de `force_state` van de toetsen zelf, niet uit een eigen zoektocht
/// door de omhullende.
struct Toetskrachten {
    m_knm: f64,
    m_x_mm: Option<f64>,
    v_kn: f64,
    v_x_mm: Option<f64>,
    k_cr: f64,
}

impl Toetskrachten {
    fn van(r: &CltBeamCheckResult) -> Self {
        let mut uit = Self { m_knm: 0.0, m_x_mm: None, v_kn: 0.0, v_x_mm: None, k_cr: 1.0 };
        for c in &r.checks {
            let CheckKind::Resistance(res) = &c.kind else {
                continue;
            };
            if c.id.starts_with("clt_6.1.6_") {
                uit.m_knm = res.force_state.forces.my_ed;
                uit.m_x_mm = Some(res.force_state.position_mm);
            } else if c.id.starts_with("clt_6.1.7_") || c.id.starts_with("clt_rolschuif_") {
                uit.v_kn = res.force_state.forces.vz_ed;
                uit.v_x_mm = Some(res.force_state.position_mm);
                if let Some(k) = res.variables.iter().find(|v| v.symbol == "k_{cr}") {
                    uit.k_cr = k.value;
                }
            }
        }
        uit
    }
}

/// "bij x = 2,50 m", of niets als de plaats niet bekend is.
fn plaats_noot(x_mm: Option<f64>) -> Option<String> {
    x_mm.map(|x| format!("bij x = {} m", nl(x / 1000.0, 2)))
}

fn figuur_bijschrift(r: &CltBeamCheckResult, k: &Toetskrachten) -> String {
    let bij = |x: Option<f64>| match x {
        Some(v) => format!(" op x = {} m", nl(v / 1000.0, 2)),
        None => String::new(),
    };
    format!(
        "Staaf {}: opbouw van boven naar beneden, met de buigspanning \u{3c3}_m,d (trek \
         positief) en de schuifspanning \u{3c4}_d over de hoogte. LET OP: de twee \
         spanningspanelen horen bij TWEE VERSCHILLENDE punten in de omhullende — \u{3c3}_m,d bij \
         het maatgevende momentpunt (M_y,Ed = {} kNm{}), \u{3c4}_d bij het maatgevende \
         dwarskrachtpunt (V_z,Ed = {} kN{}). Ze staan naast elkaar, maar vormen samen geen \
         toestand van één doorsnede. De streep-punt-lijn is de zwaartelijn z_0; de breedte van \
         de strook is niet op schaal getekend.",
        r.beam_id,
        nl(k.m_knm, 2),
        bij(k.m_x_mm),
        nl(k.v_kn, 2),
        bij(k.v_x_mm),
    )
}

/// De figuur voor deze staaf.
///
/// σ komt RECHTSTREEKS uit het toetsresultaat (`sigma_top_mpa` /
/// `sigma_bot_mpa`) en wordt niet nagerekend: de tabel ernaast toont dezelfde
/// velden, dus twee getallen uit één bron. τ wordt wél bemonsterd — een
/// verloop over de hoogte staat niet in het resultaat — maar uit dezelfde
/// [`CltMechanics`] waarmee de toets zelf gerekend heeft.
fn bouw_figuur(
    r: &CltBeamCheckResult,
    mech: &CltMechanics,
    k: &Toetskrachten,
) -> CltOpbouwFiguur {
    let sigma = Verloop {
        segmenten: r
            .layup
            .layers
            .iter()
            .map(|l| vec![(l.z_top_mm, l.sigma_top_mpa), (l.z_bot_mm, l.sigma_bot_mpa)])
            .collect(),
        label: "\u{3c3}m,d".to_string(),
        eenheid: "N/mm²".to_string(),
        noot: plaats_noot(k.m_x_mm),
    };
    let tau = Verloop {
        segmenten: vec![tau_verloop(mech, k.v_kn, k.k_cr)],
        label: "\u{3c4}d".to_string(),
        eenheid: "N/mm²".to_string(),
        noot: plaats_noot(k.v_x_mm),
    };
    CltOpbouwFiguur {
        lagen: r
            .layup
            .layers
            .iter()
            .map(|l| CltTekenLaag {
                dikte_mm: l.thickness_mm,
                richting: l.orientation,
                klasse: Some(l.strength_class.clone()),
                maatgevend: l.governing,
            })
            .collect(),
        breedte_mm: r.layup.width_mm,
        z0_mm: Some(r.layup.z0_mm),
        sigma: Some(sigma),
        tau: Some(tau),
    }
}

// ═══════════════════════════════════════════════════════════════════════
// De tabellen
// ═══════════════════════════════════════════════════════════════════════

/// De opbouw van I_y per laag: A_i, I_i, a_i, de Steiner-term A_i·a_i², de som
/// I_i + A_i·a_i², en de E-gewogen bijdrage aan (EI)_ef.
///
/// De getallen komen uit [`CltMechanics`] — dus uit de kern zelf, langs
/// dezelfde weg als de toetsing — en niet uit een derde formulering van
/// bijlage B in deze module.
fn tabel_opbouw_iy(r: &CltBeamCheckResult, mech: &CltMechanics) -> Table {
    let koppen: Vec<String> = vec![
        "#".into(),
        "Richting".into(),
        "A_i [10³ mm²]".into(),
        "I_i [10^6 mm⁴]".into(),
        "a_i [mm]".into(),
        "A_i·a_i² [10^6 mm⁴]".into(),
        "I_i + A_i·a_i² [10^6 mm⁴]".into(),
        "E_i [N/mm²]".into(),
        "E_i·(I_i+A_i·a_i²) [kNm²]".into(),
    ];

    let mut rijen: Vec<Vec<String>> = Vec::with_capacity(mech.layers.len() + 1);
    let mut som_i = 0.0_f64;
    for l in &mech.layers {
        let steiner = l.area_mm2 * l.arm_mm * l.arm_mm;
        let i_totaal = l.i_own_mm4 + steiner;
        let draagt = l.e_mpa > 0.0;
        if draagt {
            som_i += i_totaal;
        }
        rijen.push(vec![
            (l.index + 1).to_string(),
            richting_label(l.orientation).to_string(),
            nl(l.area_mm2 / 1e3, 1),
            nl(l.i_own_mm4 / 1e6, 3),
            nl(l.arm_mm, 1),
            nl(steiner / 1e6, 1),
            if draagt { nl(i_totaal / 1e6, 1) } else { "—".into() },
            nl(l.e_mpa, 0),
            if draagt {
                nl(l.ei_contribution_nmm2() * 1e-9, 0)
            } else {
                "—".into()
            },
        ]);
    }
    // De somregel. Bewust ALLEEN over de lengtelagen: een dwarslaag heeft wel
    // een A_i en een I_i, maar draagt met E = 0 niets bij, en meetellen zou de
    // som iets laten zijn dat nergens in de berekening voorkomt.
    rijen.push(vec![
        "\u{3a3}".into(),
        "lengtelagen".into(),
        String::new(),
        String::new(),
        String::new(),
        String::new(),
        nl(som_i / 1e6, 1),
        String::new(),
        nl(r.layup.ei_ef_knm2, 0),
    ]);

    // Kolombreedtes samen 169 mm binnen het inhoudsvlak van 170 mm.
    Table::new(koppen, rijen)
        .with_col_widths(vec![
            Mm(7.0).into(),
            Mm(18.0).into(),
            Mm(19.0).into(),
            Mm(21.0).into(),
            Mm(15.0).into(),
            Mm(24.0).into(),
            Mm(28.0).into(),
            Mm(16.0).into(),
            Mm(21.0).into(),
        ])
        .with_style(stijl_tabel())
        .with_repeat_header(true)
}

/// De regel onder de I_y-tabel: wat de som betekent, en wanneer hij niet
/// gelijk is aan I_ef,net.
fn somnoot(r: &CltBeamCheckResult, mech: &CltMechanics) -> String {
    let som_i: f64 = mech
        .layers
        .iter()
        .filter(|l| l.e_mpa > 0.0)
        .map(|l| l.i_own_mm4 + l.area_mm2 * l.arm_mm * l.arm_mm)
        .sum();
    let e_ref = mech.reference_e_mpa().unwrap_or(0.0);
    if lagen_zelfde_e(mech) {
        format!(
            "Alle lengtelagen hebben dezelfde E-modulus (E_ref = {} N/mm²), dus de meetkundige \
             som \u{3a3}(I_i + A_i·a_i²) = {}·10^6 mm⁴ is gelijk aan I_ef,net = (EI)_ef/E_ref. \
             I_ef,net is een vergelijkingsgrootheid met een massieve doorsnede; de toetsing \
             rekent met (EI)_ef zelf.",
            nl(e_ref, 0),
            nl(som_i / 1e6, 1),
        )
    } else {
        format!(
            "De lengtelagen hebben NIET dezelfde E-modulus, dus de meetkundige som \
             \u{3a3}(I_i + A_i·a_i²) = {}·10^6 mm⁴ is niet gelijk aan I_ef,net = (EI)_ef/E_ref \
             = {}·10^6 mm⁴, met E_ref = {} N/mm² (de bovenste lengtelaag). I_ef,net is een \
             vergelijkingsgrootheid; de toetsing rekent met (EI)_ef zelf.",
            nl(som_i / 1e6, 1),
            nl(r.layup.i_ef_net_mm4 / 1e6, 1),
            nl(e_ref, 0),
        )
    }
}

/// De tabel per lamel: dezelfde kolommen als op het scherm.
fn tabel_per_lamel(r: &CltBeamCheckResult) -> Table {
    let koppen: Vec<String> = vec![
        "#".into(),
        "Richting".into(),
        "t [mm]".into(),
        "Klasse".into(),
        "z [mm]".into(),
        "\u{3c3}m,d boven/onder [N/mm²]".into(),
        "f_m,d [N/mm²]".into(),
        "UC buiging".into(),
        "\u{3c4}d [N/mm²]".into(),
        "f_v,d [N/mm²]".into(),
        "UC dwarskracht".into(),
        "Status".into(),
    ];

    let rijen: Vec<Vec<String>> = r
        .layup
        .layers
        .iter()
        .map(|l| {
            let dwars = l.orientation == CltLayerOrientation::Transverse;
            vec![
                // Een sterretje en geen driehoekje: de meegeleverde Liberation
                // Sans heeft geen glief voor "◂" (U+25C2) en een teken zonder
                // glief verdwijnt zonder melding van het blad. De verklaring
                // staat als voetnoot onder de tabel.
                format!("{}{}", l.index, if l.governing { "*" } else { "" }),
                richting_label(l.orientation).to_string(),
                nl(l.thickness_mm, 0),
                l.strength_class.clone(),
                format!("{}–{}", nl(l.z_top_mm, 0), nl(l.z_bot_mm, 0)),
                if dwars {
                    "—".into()
                } else {
                    format!("{} / {}", nl(l.sigma_top_mpa, 2), nl(l.sigma_bot_mpa, 2))
                },
                if dwars { "—".into() } else { nl(l.f_md_mpa, 2) },
                uc_tekst(l.uc_bending),
                nl(l.tau_max_mpa, 3),
                if dwars { "n.b.".into() } else { nl(l.f_vd_mpa, 2) },
                uc_tekst(l.uc_shear),
                laagstatus(l).to_string(),
            ]
        })
        .collect();

    Table::new(koppen, rijen)
        .with_col_widths(vec![
            Mm(7.0).into(),
            Mm(13.0).into(),
            Mm(9.0).into(),
            Mm(12.0).into(),
            Mm(16.0).into(),
            Mm(24.0).into(),
            Mm(15.0).into(),
            Mm(13.0).into(),
            Mm(14.0).into(),
            Mm(14.0).into(),
            Mm(15.0).into(),
            Mm(17.0).into(),
        ])
        .with_style(stijl_tabel())
        .with_repeat_header(true)
}

fn uc_tekst(uc: Option<f64>) -> String {
    match uc {
        Some(v) => nl(v, 2),
        None => "—".to_string(),
    }
}

/// Status van één laag: de hoogste van de twee unity checks. Een dwarslaag
/// wordt niet getoetst en staat er daarom als "ter info" — dezelfde regel als
/// `laagStatus` op het scherm.
fn laagstatus(l: &CltLayerResult) -> &'static str {
    if l.orientation == CltLayerOrientation::Transverse {
        return "ter info";
    }
    let mut hoogste: Option<f64> = None;
    for uc in [l.uc_bending, l.uc_shear].into_iter().flatten() {
        hoogste = Some(hoogste.map_or(uc, |h: f64| h.max(uc)));
    }
    match hoogste {
        None => "n.v.t.",
        Some(uc) if uc <= 1.0 => "Voldoet",
        Some(_) => "Voldoet niet",
    }
}

fn richting_label(o: CltLayerOrientation) -> &'static str {
    o.label_nl()
}

fn klimaatklasse(s: ServiceClass) -> &'static str {
    match s {
        ServiceClass::Sc1 => "1",
        ServiceClass::Sc2 => "2",
        ServiceClass::Sc3 => "3",
    }
}

/// Dezelfde bewoording als `LOAD_DURATION_LABELS` op het scherm.
fn belastingduur(d: LoadDurationClass) -> &'static str {
    match d {
        LoadDurationClass::Permanent => "blijvend",
        LoadDurationClass::LongTerm => "lang",
        LoadDurationClass::MediumTerm => "middellang",
        LoadDurationClass::ShortTerm => "kort",
        LoadDurationClass::Instantaneous => "zeer kort",
    }
}

/// Welke meldingen van de kern zijn WAARSCHUWINGEN en moeten opvallen?
///
/// De kern schrijft ze zonder markering, maar drie ervan zijn
/// veiligheidsrelevant: een normaalkracht die niet is verwerkt, een te korte
/// plaat waarbij de starre verbinding (EI)_ef overschat, en een dwarslaag als
/// buitenlaag. Ze worden hier alleen ANDERS GEZET, nooit herschreven — de
/// tekst blijft woordelijk die van de rekengang.
fn is_waarschuwing(n: &str) -> bool {
    n.starts_with("Let op:")
        || n.starts_with("Normaalkracht")
        || n.starts_with("Moment om de zwakke as")
        || n.starts_with("De opbouw heeft een dwarslaag als buitenlaag")
}

// ═══════════════════════════════════════════════════════════════════════
// Opmaak
// ═══════════════════════════════════════════════════════════════════════

/// Een melding waar de lezer overheen moet struikelen — rood, zoals in het
/// betonhoofdstuk.
fn let_op_stijl() -> openaec_layout::paragraph::ParagraphStyle {
    openaec_layout::paragraph::ParagraphStyle {
        text_color: C_FAIL,
        ..style_note()
    }
}

fn stijl_tabel() -> TableStyleConfig {
    TableStyleConfig {
        header_background: Some(C_DEEP),
        header_text_color: Color::WHITE,
        grid_color: Color::rgb(228, 224, 216),
        grid_width: Pt(0.4),
        row_backgrounds: vec![None, Some(Color::rgb(250, 247, 240))],
        cell_padding: Padding::new(Pt(2.0), Pt(2.5), Pt(2.0), Pt(2.5)),
        font_name: "LiberationSans".into(),
        header_font_name: "LiberationSans-Bold".into(),
        font_size: Pt(6.5),
        // De kop een halve punt kleiner dan de cellen: hij is VET en de motor
        // schat de breedte met dezelfde factor als voor gewone tekst, dus bij
        // gelijke korpsgrootte loopt een kop over de kolomlijn heen. Zelfde
        // reden als bij de segmenttabel van het betonhoofdstuk.
        header_font_size: Pt(6.0),
    }
}
