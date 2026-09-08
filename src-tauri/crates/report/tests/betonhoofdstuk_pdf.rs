//! De proef op het betonhoofdstuk: staat het er WERKELIJK in?
//!
//! # Waarom deze test er anders uitziet dan de andere
//!
//! `tests/mixed_materials.rs` zegt met zoveel woorden wat het probleem is:
//! "Wat deze test NIET kan aantonen: letterlijke tekst in de PDF-stream.
//! openaec-layout schrijft tekst via TTF-glyph-encoding, waardoor strings als
//! `HEB160` niet grep-baar zijn in de bytes." Dat klopt — maar het is wél te
//! doen, en voor een hoofdstuk dat uit tabellen en verplichte vermeldingen
//! bestaat is het het enige bewijs dat telt. Een tekenlijst die nergens heen
//! gaat laat een test op `%PDF` immers gewoon slagen.
//!
//! Deze test doet daarom drie dingen:
//!
//! 1. **Woorden terugzoeken.** De inhoudsstromen van alle bladzijden worden
//!    met `lopdf` uitgepakt. Een woord wordt met `ttf-parser` — dezelfde
//!    Liberation Sans die het rapport insluit — vertaald naar de reeks
//!    glief-nummers waarmee printpdf het opschrijft (`<0025 0048 …> Tj`), en
//!    die reeks wordt in de stromen gezocht. Slaagt dat, dan staat het woord
//!    op het papier en niet alleen in een `String` in het geheugen.
//! 2. **Verschilmeting.** Hetzelfde rapport zónder segmentspoor is merkbaar
//!    kleiner, telt minder bladzijden en mist precies die woorden.
//! 3. **Toepasselijkheid.** Een zuiver stalen rapport krijgt geen enkel spoor
//!    van het betonhoofdstuk — geen kop, geen melding, geen bladzijde.
//!
//! De getallen zijn gerekend en niet verzonnen: het M-κ-diagram, de
//! interactiepunten en de segmentstijfheden komen uit `concrete_check` voor
//! een balk 300 × 500 in C30/37 met B500B onder een parabolisch moment.
//!
//! De gemaakte PDF blijft in de tijdelijke map van de test staan, zodat het
//! blad met het oog te bekijken is; het pad staat in de uitvoer van
//! `cargo test -- --nocapture`.

use concrete_check::segments::{segment_stiffness, SegmentStiffnessRequest, SegmentStiffnessResponse};
use concrete_check::{mn_kappa, ConcreteBeamCheckResult, MnKappaRequest, MnKappaResponse};
use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::section::{ConcreteSectionInput, RebarRow, ReinforcementCage};
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};
use report::betonspoor::{
    BetonStaafDoorsnede, BetonStijfheidSpoor, OvergeslagenStaaf, StijfheidCombinatie,
    StijfheidRonde,
};
use report::{betonhoofdstuk, generate_report_pdf, ReportInput};
use steel_check::result::{BeamCheckResult, CheckKind, NamedCheck};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

// ═══════════════════════════════════════════════════════════════════════
// Woorden terugzoeken in de gerenderde PDF
// ═══════════════════════════════════════════════════════════════════════

/// Alle inhoudsstromen van alle bladzijden, uitgepakt en aan elkaar geplakt.
///
/// De hexcijfers in de stroom zijn hoofdletters; alles wordt hier op
/// hoofdletters gezet zodat de vergelijking niet op die schrijfwijze kan
/// stukgaan.
fn inhoudsstromen(pdf: &[u8]) -> String {
    let doc = lopdf::Document::load_mem(pdf).expect("de PDF moet te lezen zijn");
    let mut uit = String::new();
    for (_, id) in doc.get_pages() {
        let inhoud = doc
            .get_page_content(id)
            .expect("de inhoudsstroom moet uit te pakken zijn");
        uit.push_str(&String::from_utf8_lossy(&inhoud).to_uppercase());
    }
    uit
}

/// De tekst waarmee `woord` in de inhoudsstroom terechtkomt: per teken het
/// glief-nummer als vier hexcijfers, precies zoals printpdf het in een
/// `<0049005C…> Tj` zet.
///
/// Let op twee dingen. De stroom draagt de gliefnummers als HEXTEKST en niet
/// als ruwe bytes — zoeken op de bytes 0x00 0x49 levert dus niets op. En dit
/// werkt per WOORD, niet per zin: de opmaakmotor knipt een alinea in regels en
/// tekent elke regel als één `Tj`, dus een zin kan over twee tekenopdrachten
/// verdeeld zijn. Een woord niet.
fn glief_hex(font: &[u8], woord: &str) -> String {
    let face = ttf_parser::Face::parse(font, 0).expect("het lettertype moet te lezen zijn");
    let mut uit = String::with_capacity(woord.chars().count() * 4);
    for ch in woord.chars() {
        let gid = face
            .glyph_index(ch)
            .unwrap_or_else(|| panic!("geen glief voor {ch:?} — kies een ander proefwoord"));
        uit.push_str(&format!("{:04X}", gid.0));
    }
    uit
}

/// Staat `woord` als aaneengesloten gliefreeks in de stroom (regular of bold)?
fn staat_erin(stroom: &str, woord: &str) -> bool {
    [FONT_REGULAR, FONT_BOLD]
        .iter()
        .any(|font| stroom.contains(&glief_hex(font, woord)))
}

/// Idem, maar met een duidelijke melding als het misgaat.
fn eis_erin(stroom: &str, woord: &str) {
    assert!(
        staat_erin(stroom, woord),
        "{woord:?} staat niet in de inhoudsstroom van de PDF"
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Testgegevens — gerekend, niet verzonnen
// ═══════════════════════════════════════════════════════════════════════

fn proefkorf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
    }
}

fn proefdoorsnede() -> ConcreteSectionInput {
    ConcreteSectionInput::rectangle(300.0, 500.0)
}

fn reken_mn_kappa() -> MnKappaResponse {
    let req: MnKappaRequest = serde_json::from_value(serde_json::json!({
        "section": { "b_mm": 300.0, "h_mm": 500.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0, "stirrup_diameter_mm": 8.0,
            "top": { "count": 2, "diameter_mm": 12.0 },
            "bottom": { "count": 3, "diameter_mm": 16.0 }
        },
        "n_ed_kn": -200.0
    }))
    .expect("het verzoek moet geldig zijn");
    mn_kappa(req).expect("de rekenkern moet dit diagram kunnen leveren")
}

/// De segmentstijfheden over 6 m met een parabolisch moment, in de BGT — dan
/// scheurt het middendeel wél en blijven de einden ongescheurd, zodat de
/// EI-figuur en de tabel iets te tonen hebben.
///
/// TWEE ronden, niet één. De eerste ronde heeft geen vorige stijfheden om
/// tegen te vergelijken: `relative_change` is dan overal leeg, `converged`
/// staat op false en de kern zet erbij dat convergentie niet te beoordelen is.
/// Precies dat stond op de eerste proefdruk — de kolom ΔEI was één rij
/// streepjes en de uitgangspunten meldden "NIET geconvergeerd" terwijl het
/// verloop eronder wél convergeerde. Het antwoord van ronde 2, met de EI van
/// ronde 1 als vorige ronde, is wat een echte rekengang oplevert.
fn reken_segmenten() -> SegmentStiffnessResponse {
    let ronde1 = reken_ronde(Vec::new());
    let vorige: Vec<f64> = ronde1
        .segments
        .iter()
        .map(|s| s.ei_knm2.expect("ronde 1 hoort overal een stijfheid te geven"))
        .collect();
    reken_ronde(vorige)
}

/// Eén ronde van de segmentlus; `vorige` leeg is ronde 1.
fn reken_ronde(vorige: Vec<f64>) -> SegmentStiffnessResponse {
    let lengte_m = 6.0;
    let n_seg = 15;
    let m_max = 90.0_f64;
    let krachten: Vec<serde_json::Value> = (0..n_seg)
        .map(|i| {
            let l = lengte_m * 1000.0;
            let x = (i as f64 + 0.5) * l / n_seg as f64;
            serde_json::json!({
                "n_ed_kn": -40.0,
                "m_ed_knm": m_max * 4.0 * x * (l - x) / (l * l)
            })
        })
        .collect();
    let req: SegmentStiffnessRequest = serde_json::from_value(serde_json::json!({
        "beam_id": 1,
        "section": { "b_mm": 300.0, "h_mm": 500.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0, "stirrup_diameter_mm": 8.0,
            "top": { "count": 2, "diameter_mm": 12.0 },
            "bottom": { "count": 3, "diameter_mm": 16.0 }
        },
        "length_m": lengte_m,
        "limit_state": "MeanValues",
        "segment_forces": krachten,
        "previous_ei_knm2": vorige
    }))
    .expect("het verzoek moet geldig zijn");
    segment_stiffness(req).expect("de rekenkern moet deze stijfheden kunnen leveren")
}

fn betontoets(mk: &MnKappaResponse) -> ConcreteBeamCheckResult {
    let m_ed = 0.7 * mk.diagram.m_max_knm;
    ConcreteBeamCheckResult {
        beam_id: 1,
        section_name: "300 x 500".into(),
        shape_assumptions: Vec::new(),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        reinforcement_summary: "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm".into(),
        a_s_bottom_mm2: 603.2,
        a_s_top_mm2: 226.2,
        d_mm: 454.0,
        f_cd_mpa: 20.0,
        f_yd_mpa: 435.0,
        checks: vec![NamedCheck {
            id: "6.1_mn_kappa".into(),
            kind: CheckKind::Resistance(ResistanceCalc {
                deelstappen: Vec::new(),
                id: "6.1_mn_kappa".into(),
                title: "Moment-normaalkracht (M-N-κ)".into(),
                article: "art. 6.1 en 3.1.7(1) (3.17)".into(),
                force_state: ForceStateSnapshot {
                    combination_id: 1,
                    position_mm: 3000.0,
                    forces: InternalForces {
                        n_ed: -200.0,
                        vy_ed: 0.0,
                        vz_ed: 0.0,
                        mt_ed: 0.0,
                        my_ed: m_ed,
                        mz_ed: 0.0,
                    },
                },
                formula_latex: "UC = M_Ed / M_Rd".into(),
                variables: vec![NamedValue {
                    symbol: "M_Rd".into(),
                    value: mk.diagram.m_max_knm,
                    unit: "kNm".into(),
                }],
                value: mk.diagram.m_max_knm,
                unit: "kNm".into(),
                uc: Some(UnityCheck {
                    ed: m_ed,
                    rd: mk.diagram.m_max_knm,
                    uc: 0.7,
                    formula_latex: "UC = M_Ed / M_Rd".into(),
                }),
                status: CheckStatus::Ok,
                notes: vec![],
            }),
        }],
        uc_max: 0.7,
        status: CheckStatus::Ok,
        governing_check_id: "6.1_mn_kappa".into(),
        mn_kappa: Some(mk.diagram.clone()),
        interaction_positive: mk.interaction_positive.clone(),
        interaction_negative: mk.interaction_negative.clone(),
    }
}

fn spoor(respons: SegmentStiffnessResponse) -> BetonStijfheidSpoor {
    BetonStijfheidSpoor {
        segment_lengte_mm: 400.0,
        combinaties: vec![StijfheidCombinatie {
            combinatie_id: 1,
            combinatie_naam: "BGT-kar 1".into(),
            grenstoestand: respons.limit_state,
            ronden: 3,
            verloop: vec![
                StijfheidRonde { ronde: 1, max_relatieve_verandering: None, geconvergeerd: false },
                StijfheidRonde {
                    ronde: 2,
                    max_relatieve_verandering: Some(0.084),
                    geconvergeerd: false,
                },
                StijfheidRonde {
                    ronde: 3,
                    max_relatieve_verandering: Some(0.004),
                    geconvergeerd: true,
                },
            ],
            staven: vec![respons],
        }],
        overgeslagen: vec![OvergeslagenStaaf {
            beam_id: 7,
            reden: "geen wapeningskorf opgegeven".into(),
        }],
        staafdoorsneden: vec![BetonStaafDoorsnede {
            beam_id: 1,
            doorsnede: proefdoorsnede(),
            korf: proefkorf(),
        }],
    }
}

fn staalstaaf() -> BeamCheckResult {
    BeamCheckResult {
        beam_id: 2,
        profile_name: "HEB160".into(),
        steel_grade: "S235".into(),
        classification: nen_en_1993_1_1_section::classification::CrossSectionClass::Class1,
        checks: vec![NamedCheck {
            id: "comp".into(),
            kind: CheckKind::Resistance(ResistanceCalc {
                deelstappen: Vec::new(),
                id: "comp".into(),
                title: "Compression resistance".into(),
                article: "EN 1993-1-1 6.2.4".into(),
                force_state: ForceStateSnapshot {
                    combination_id: 1,
                    position_mm: 0.0,
                    forces: InternalForces {
                        n_ed: -120.0,
                        vy_ed: 0.0,
                        vz_ed: 8.0,
                        mt_ed: 0.0,
                        my_ed: 22.5,
                        mz_ed: 0.0,
                    },
                },
                formula_latex: "N_Rd = A · f_y / g_M0".into(),
                variables: vec![],
                value: 1000.0,
                unit: "kN".into(),
                uc: Some(UnityCheck {
                    ed: 120.0,
                    rd: 1000.0,
                    uc: 0.12,
                    formula_latex: "UC".into(),
                }),
                status: CheckStatus::Ok,
                notes: vec![],
            }),
        }],
        uc_max: 0.12,
        status: CheckStatus::Ok,
        governing_check_id: "comp".into(),
    }
}

fn invoer(
    beton: Vec<ConcreteBeamCheckResult>,
    trace: Option<BetonStijfheidSpoor>,
) -> ReportInput {
    ReportInput {
        project_name: "Betonportaal".into(),
        project_number: "BT-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-08".into(),
        steel_check_results: vec![staalstaaf()],
        timber_check_results: vec![],
        clt_check_results: vec![],
        concrete_check_results: beton,
        stress_check_results: vec![],
        concrete_stiffness_trace: trace,
    }
}

// ═══════════════════════════════════════════════════════════════════════
// De proeven
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn het_betonhoofdstuk_staat_woordelijk_in_de_pdf() {
    let mk = reken_mn_kappa();
    let segmenten = reken_segmenten();
    let creep_note = segmenten.creep_note.clone();
    let segmentation_rule = segmenten.segmentation_rule.clone();
    // Een gerekende EI uit het midden van de staaf: het getal dat in de
    // segmenttabel hoort te staan.
    let ei_midden = segmenten.segments[segmenten.segments.len() / 2]
        .ei_knm2
        .expect("het middelste segment hoort een stijfheid te hebben");
    let ei_tekst = report::betonfiguren::nl(ei_midden, 0);

    let met = generate_report_pdf(invoer(vec![betontoets(&mk)], Some(spoor(segmenten))));
    let zonder = generate_report_pdf(invoer(vec![betontoets(&mk)], None));

    // Meteen wegschrijven, vóór de eerste assertie: als er iets misgaat wil je
    // het blad kunnen bekijken en niet alleen de melding lezen.
    let map = std::path::Path::new(env!("CARGO_TARGET_TMPDIR"));
    let pad = map.join("betonhoofdstuk.pdf");
    std::fs::write(&pad, &met).expect("het proefrapport wegschrijven");
    // Ook de variant ZONDER spoor: die toont het hoofdstuk met zijn eerlijke
    // melding, en ook dát blad hoort er goed uit te zien.
    let pad_zonder = map.join("betonhoofdstuk-zonder-spoor.pdf");
    std::fs::write(&pad_zonder, &zonder).expect("het proefrapport wegschrijven");
    println!("proefrapport: {} / {}", pad.display(), pad_zonder.display());

    let stroom = inhoudsstromen(&met);
    let stroom_zonder = inhoudsstromen(&zonder);

    // ── 1. De kop en de indeling van het hoofdstuk ───────────────────────
    for woord in [
        "fysisch",
        "niet-lineaire",
        "Segmentstijfheden",
        "Doorsneden",
        "5.8.6",
    ] {
        eis_erin(&stroom, woord);
    }

    // ── 2. De uitgangspunten per combinatie ──────────────────────────────
    for woord in [
        "BGT-kar",                 // de combinatienaam
        "Analysetype",
        "Segmentlengte",
        "Convergentiecriterium",
        "geconvergeerd",
        "Kruip",
    ] {
        eis_erin(&stroom, woord);
    }

    // ── 3. De segmenttabel: koppen én een gerekende waarde ───────────────
    for woord in ["Toestand", "Onderrelaxatie", "gescheurd", "ongescheurd", &ei_tekst] {
        eis_erin(&stroom, woord);
    }

    // ── 4. DE VERPLICHTE VERMELDINGEN, WOORDELIJK ───────────────────────
    // De kruipvermelding en de indelingsregel komen uit het kernantwoord en
    // mogen niet geherformuleerd zijn. Per woord gezocht, omdat de alinea in
    // regels is geknipt en elke regel een eigen tekenopdracht is.
    for zin in [&creep_note, &segmentation_rule] {
        let woorden: Vec<&str> = zin
            .split_whitespace()
            .filter(|w| w.chars().count() >= 4 && w.chars().all(|c| c.is_alphabetic()))
            .collect();
        assert!(
            woorden.len() >= 4,
            "te weinig bruikbare woorden om {zin:?} op te controleren"
        );
        for w in woorden {
            assert!(
                staat_erin(&stroom, w),
                "woord {w:?} uit de kernvermelding {zin:?} staat niet in de PDF"
            );
        }
    }

    // ── 5. De overgeslagen staaf, met de reden van de rekengang ─────────
    eis_erin(&stroom, "wapeningskorf");

    // ── 6. Het eigenlijke verschil: zónder spoor is dit er allemaal niet ─
    // De KOP "Segmentstijfheden per combinatie" blijft wel staan: er is beton,
    // dus het hoofdstuk hoort te bestaan met zijn eerlijke melding. Wat weg
    // hoort te zijn, is alles wat uit het SPOOR komt.
    for woord in ["Convergentiecriterium", "BGT-kar", "Onderrelaxatie", "Toestand"] {
        assert!(
            !staat_erin(&stroom_zonder, woord),
            "{woord:?} staat in de PDF ZONDER segmentspoor — de tabellen komen dan ergens \
             anders vandaan dan uit het spoor"
        );
    }
    // De figuren horen wél bij de betontoetsing zelf, dus die blijven staan;
    // de EI-waarde uit de segmenttabel niet.
    assert!(
        !staat_erin(&stroom_zonder, &ei_tekst),
        "de gerekende EI staat in de PDF zonder segmentspoor"
    );

    // ── 7. Omvang en bladzijden ─────────────────────────────────────────
    let bladzijden_met = lopdf::Document::load_mem(&met).unwrap().get_pages().len();
    let bladzijden_zonder = lopdf::Document::load_mem(&zonder).unwrap().get_pages().len();
    assert!(
        bladzijden_met > bladzijden_zonder,
        "het spoor levert geen enkele extra bladzijde op ({bladzijden_met} tegen \
         {bladzijden_zonder})"
    );
    assert!(
        met.len() > zonder.len() + 3_000,
        "het hoofdstuk voegt maar {} bytes toe ({} tegen {})",
        met.len().saturating_sub(zonder.len()),
        met.len(),
        zonder.len()
    );

    let pad = std::path::Path::new(env!("CARGO_TARGET_TMPDIR")).join("betonhoofdstuk.pdf");
    std::fs::write(&pad, &met).expect("het proefrapport wegschrijven");
    println!(
        "proefrapport: {} ({} bytes, {bladzijden_met} bladzijden; zonder spoor {} bytes / \
         {bladzijden_zonder} bladzijden)",
        pad.display(),
        met.len(),
        zonder.len()
    );
}

#[test]
fn een_zuiver_staalrapport_krijgt_geen_leeg_betonhoofdstuk() {
    let staal = invoer(vec![], None);
    assert!(
        !betonhoofdstuk::van_toepassing(&staal),
        "een rapport zonder beton hoort het hoofdstuk niet van toepassing te vinden"
    );

    let pdf = generate_report_pdf(staal);
    let stroom = inhoudsstromen(&pdf);
    for woord in ["Segmentstijfheden", "Doorsneden", "betonstaven", "Kruip"] {
        assert!(
            !staat_erin(&stroom, woord),
            "{woord:?} staat in een zuiver staalrapport — het betonhoofdstuk lekt door"
        );
    }
}

/// De invoer zoals de frontend hem levert bij ELK ander analysetype dan
/// "2e orde + fysisch": geen segmenten om na te vertellen, wél de doorsnede om
/// te tekenen.
///
/// Die doorsnede komt daar uit `rapportPdfInvoer.ts`, dat hem bij gebrek aan
/// een rekengang uit het toetsresultaat herleidt met dezelfde terugval die het
/// live rapport gebruikt (`betonDoorsnedeTerugval.ts`). De segmentlengte is
/// dan 0: er is niet geknipt, en het hoofdstuk drukt hem in dit geval ook niet
/// af.
fn eerste_orde_spoor() -> BetonStijfheidSpoor {
    BetonStijfheidSpoor {
        segment_lengte_mm: 0.0,
        combinaties: Vec::new(),
        overgeslagen: Vec::new(),
        staafdoorsneden: vec![BetonStaafDoorsnede {
            beam_id: 1,
            doorsnede: proefdoorsnede(),
            korf: proefkorf(),
        }],
    }
}

#[test]
fn beton_zonder_fysische_berekening_houdt_het_hoofdstuk_met_een_eerlijke_melding() {
    // "Kan dit model dit ooit vullen" laat een hoofdstuk weg; "is het nu leeg"
    // is een rekenstand en laat het staan. Er is beton, dus het hoofdstuk
    // blijft — met de melding dat er niet fysisch gerekend is.
    //
    // EN DE DOORSNEDEFIGUUR HOORT ER TOCH TE STAAN. Die hangt aan de toetsing
    // en niet aan de fysische ronde; het live rapport tekent hem in dit geval
    // ook. Deze test controleerde dat eerder alleen op de KOP "Doorsneden" en
    // op het woord "dekking" uit de gegevensregel — beide staan er ook als de
    // figuur ontbreekt, dus het gat viel niet op. Nu wordt de figuur zelf
    // aangetoond: het bijschrift dat alleen de getekende figuur draagt, een
    // maatlabel dat alleen de tekenfunctie op het blad zet, en de afwezigheid
    // van de melding dat er niets te tekenen viel.
    let mk = reken_mn_kappa();
    let input = invoer(vec![betontoets(&mk)], Some(eerste_orde_spoor()));
    assert!(betonhoofdstuk::van_toepassing(&input));

    let pdf = generate_report_pdf(input);
    let map = std::path::Path::new(env!("CARGO_TARGET_TMPDIR"));
    let pad = map.join("betonhoofdstuk-eerste-orde.pdf");
    std::fs::write(&pad, &pdf).expect("het proefrapport wegschrijven");
    println!("proefrapport eerste orde: {}", pad.display());

    let stroom = inhoudsstromen(&pdf);
    eis_erin(&stroom, "Segmentstijfheden");
    eis_erin(&stroom, "analysetype");

    // ── De doorsnedefiguur, drie keer bewezen ───────────────────────────
    // 1. Het bijschrift staat alleen onder een GETEKENDE doorsnede.
    eis_erin(&stroom, "verhouding");
    // 2. Een maatlabel uit de tekenfunctie zelf. `teken_doorsnede` zet
    //    "b 300" en "h 500" op de maatlijnen; nergens anders in het hoofdstuk
    //    staat die schrijfwijze, en zonder tekening staat hij er dus niet.
    let b_label = format!("b {}", report::betonfiguren::maat(300.0));
    let h_label = format!("h {}", report::betonfiguren::maat(500.0));
    eis_erin(&stroom, &b_label);
    eis_erin(&stroom, &h_label);
    // 3. De melding dat er niets te tekenen viel, hoort er NIET te staan.
    assert!(
        !staat_erin(&stroom, "meegestuurd"),
        "de PDF meldt dat de doorsnede niet is meegestuurd, terwijl hij er wél in zat"
    );

    // En het is geen bijschrift zonder plaatje: zonder de doorsnede is het
    // blad merkbaar leger, want dan vervallen de tekenopdrachten van de figuur.
    // Diezelfde vergelijking toont meteen aan dat de drie proefwoorden hierboven
    // WERKELIJK aan de figuur hangen en niet ergens anders in het hoofdstuk
    // staan — anders is de proef geen proef.
    let zonder_figuur = generate_report_pdf(invoer(vec![betontoets(&mk)], None));
    let stroom_zonder = inhoudsstromen(&zonder_figuur);
    for woord in ["verhouding", b_label.as_str(), h_label.as_str()] {
        assert!(
            !staat_erin(&stroom_zonder, woord),
            "{woord:?} staat óók in de PDF zonder doorsnede — dat woord bewijst de figuur dus \
             niet"
        );
    }
    eis_erin(&stroom_zonder, "meegestuurd");
    assert!(
        pdf.len() > zonder_figuur.len() + 1_000,
        "de doorsnedefiguur voegt maar {} bytes toe ({} tegen {}) — er wordt dan wel een \
         bijschrift gezet maar niets getekend",
        pdf.len().saturating_sub(zonder_figuur.len()),
        pdf.len(),
        zonder_figuur.len()
    );
}

#[test]
fn een_spoor_zonder_doorsnede_meldt_dat_en_verzint_er_geen() {
    // De doorsnede en de korf reizen apart mee; ontbreken ze, dan mag er geen
    // doorsnede uit `section_name` en `reinforcement_summary` teruggeparsed
    // worden. De figuur blijft dan weg, mét reden.
    let mk = reken_mn_kappa();
    let mut s = spoor(reken_segmenten());
    s.staafdoorsneden.clear();
    let stroom = inhoudsstromen(&generate_report_pdf(invoer(vec![betontoets(&mk)], Some(s))));
    eis_erin(&stroom, "meegestuurd");
    // De andere twee figuren van de doorsnedeparagraaf hangen aan het
    // toetsresultaat en staan er dus nog wel.
    eis_erin(&stroom, "interactiediagram");
}
