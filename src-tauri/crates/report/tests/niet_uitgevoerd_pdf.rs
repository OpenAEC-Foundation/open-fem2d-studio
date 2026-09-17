//! "Niet uitgevoerd" onder de samenvattingstabel van de PDF (issue #18).
//!
//! Een betonstaaf waarvan een draagkrachttoets niet kon, krijgt de status N/A
//! in plaats van Ok (basisaudit ruw 55). De samenvattingstabel zei alleen
//! "N/A"; WELKE toets ontbrak, stond pagina's verder in de notes van die toets.
//! Een ontbrekende detailleringseis — die de status niet raakt — was in de
//! samenvatting helemaal onzichtbaar.
//!
//! Wat deze proef vastlegt:
//! - de kern levert een echte niet-uitgevoerde dwarskrachttoets (balk zonder
//!   beugelgegevens, V_Ed boven V_Rd,c — dezelfde balk als in
//!   `concrete-check/tests/nieuwe_toetsen.rs`), en `niet_uitgevoerd_overzicht`
//!   neemt hem op met doorsnede, klasse en titel;
//! - de tekst van de regel, met de aanduiding van een detailleringseis;
//! - de regels staan op staaf-id, en een staaf zonder overgeslagen toets
//!   (staal) komt er niet in;
//! - het overzicht staat WOORDELIJK in de gerenderde PDF, en een PDF zonder
//!   overgeslagen toets draagt het niet (tegenproef): een rapport zonder
//!   overgeslagen toets ziet er dus uit als voorheen.

use concrete_check::result::NietUitgevoerdeToets;
use concrete_check::{check_concrete_beam, ConcreteBeamCheckInput, ConcreteBeamCheckResult};
use mechanics::{ForcePoint, InternalForces};
use nen_en_1992_1_1::{ConcreteSectionInput, RebarRow, ReinforcementCage, ReinforcementZones};
use nen_en_1993_1_1_section::CheckStatus;
use report::{
    generate_report_pdf, niet_uitgevoerd_overzicht, niet_uitgevoerd_tekst, ReportInput,
};
use steel_check::result::BeamCheckResult;

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

// ── Woorden terugzoeken in de PDF (zie tests/betonhoofdstuk_pdf.rs) ──────────

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

fn staat_erin(stroom: &str, woord: &str) -> bool {
    [FONT_REGULAR, FONT_BOLD]
        .iter()
        .any(|font| stroom.contains(&glief_hex(font, woord)))
}

// ── Testgegevens — gerekend door de betonkern ────────────────────────────────

fn punt(x_mm: f64, v: f64, m: f64) -> ForcePoint {
    ForcePoint {
        combination_id: 1,
        position_mm: x_mm,
        forces: InternalForces { n_ed: 0.0, vz_ed: v, my_ed: m, ..Default::default() },
    }
}

/// Balk 300 × 600, 4Ø20 onder, GEEN beugelgegevens, V_Ed = 99 kN > V_Rd,c:
/// de dwarskrachttoets kan niet worden afgerekend.
fn balk_zonder_beugels(beam_id: u32) -> ConcreteBeamCheckResult {
    let inp = ConcreteBeamCheckInput {
        bijlage: Default::default(),
        beam_id,
        section: ConcreteSectionInput::rectangle(300.0, 600.0),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        cage: ReinforcementCage {
            cover_mm: 20.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 2, diameter_mm: 12.0 },
            bottom: RebarRow { count: 4, diameter_mm: 20.0 },
            ..ReinforcementCage::default()
        },
        reinforcement_zones: ReinforcementZones::default(),
        length_m: 5.0,
        forces_envelope: vec![
            punt(0.0, 99.0, 0.0),
            punt(2500.0, 0.0, 150.0),
            punt(5000.0, -99.0, 0.0),
        ],
        n_strips: 50,
        steel_branch: Default::default(),
        design_situation: Default::default(),
        apply_min_eccentricity: true,
        sls_frequent_envelope: vec![],
        exposure_class: None,
        structural_class: None,
        aggregate_size_mm: None,
        structural_system: None,
        bar_spacing_mm: None,
        column: None,
        sls_quasi_permanent_envelope: vec![],
        first_order_envelope: None,
        staafstand: None,
        staafstand_notities: None,
    };
    check_concrete_beam(inp)
}

fn staalstaaf(beam_id: u32) -> BeamCheckResult {
    BeamCheckResult {
        beam_id,
        profile_name: "HEB160".into(),
        steel_grade: "S235".into(),
        classification: nen_en_1993_1_1_section::classification::CrossSectionClass::Class1,
        checks: vec![],
        uc_max: 0.12,
        status: CheckStatus::Ok,
        governing_check_id: String::new(),
        verloop: None,
    }
}

fn invoer(beton: Vec<ConcreteBeamCheckResult>) -> ReportInput {
    ReportInput {
        bijlage: Default::default(),
        project_name: "Proefrapport".into(),
        project_number: "NU-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-17".into(),
        taal: Default::default(),
        steel_check_results: vec![staalstaaf(2)],
        timber_check_results: vec![],
        clt_check_results: vec![],
        concrete_check_results: beton,
        stress_check_results: vec![],
        concrete_stiffness_trace: None,
        concrete_dekkingslijnen: Vec::new(),
        concrete_reinforcement_zones: Vec::new(),
        scheefstand_toelichting: None,
        analyse_toelichting: None,
        wind_toelichting: None,
        plate_results: Vec::new(),
        plate_inputs: Vec::new(),
        plate_skipped: Vec::new(),
    }
}

// ── De proeven ───────────────────────────────────────────────────────────────

#[test]
fn de_kern_levert_een_niet_uitgevoerde_dwarskrachttoets() {
    // Uitgangspunt van alles hieronder: dit is een ECHTE uitkomst van de kern.
    let r = balk_zonder_beugels(7);
    assert_eq!(r.status, CheckStatus::NotApplicable);
    let shear = r
        .niet_uitgevoerd
        .iter()
        .find(|n| n.check_id == "6.2_shear")
        .expect("de dwarskrachttoets hoort in niet_uitgevoerd te staan");
    assert_eq!(shear.titel, "Dwarskracht");
    assert!(!shear.detaillering);
}

#[test]
fn het_overzicht_noemt_de_staaf_en_de_toets() {
    let inp = invoer(vec![balk_zonder_beugels(7)]);
    let regels = niet_uitgevoerd_overzicht(&inp);
    assert_eq!(regels.len(), 1, "alleen de betonstaaf heeft een overgeslagen toets");
    let r = &regels[0];
    assert_eq!(r.beam_id, 7);
    assert_eq!(r.section_label, inp.concrete_check_results[0].section_name);
    assert_eq!(r.grade_label, "C30/37");
    assert!(r.toetsen.iter().any(|t| t.check_id == "6.2_shear"));

    let tekst = niet_uitgevoerd_tekst(r);
    assert!(
        tekst.starts_with(&format!("Staaf 7 ({}, C30/37): ", r.section_label)),
        "{tekst}"
    );
    assert!(tekst.contains("Dwarskracht"), "{tekst}");
    // Elke toets uit de lijst staat in de regel, in de volgorde van de kern.
    let mut vanaf = 0;
    for t in r.toetsen {
        let pos = tekst[vanaf..]
            .find(&t.titel)
            .unwrap_or_else(|| panic!("{:?} ontbreekt of staat niet op volgorde: {tekst}", t.titel));
        vanaf += pos + t.titel.len();
    }
}

#[test]
fn een_detailleringseis_wordt_zo_genoemd_en_de_regels_staan_op_staaf_id() {
    let mut hoog = balk_zonder_beugels(9);
    hoog.niet_uitgevoerd = vec![NietUitgevoerdeToets {
        check_id: "9.2.1.1_min_wapening".into(),
        titel: "Minimumwapening".into(),
        detaillering: true,
    }];
    let laag = balk_zonder_beugels(3);
    let mut zonder = balk_zonder_beugels(5);
    zonder.niet_uitgevoerd.clear();

    let inp = invoer(vec![hoog, zonder, laag]);
    let regels = niet_uitgevoerd_overzicht(&inp);
    let ids: Vec<u32> = regels.iter().map(|r| r.beam_id).collect();
    assert_eq!(ids, vec![3, 9], "op staaf-id, en staaf 5 zonder overgeslagen toets niet");
    assert_eq!(
        niet_uitgevoerd_tekst(&regels[1]),
        "Staaf 9 (300 x 600, C30/37): Minimumwapening (detailleringseis)"
    );
}

#[test]
fn zonder_overgeslagen_toets_is_het_overzicht_leeg() {
    let mut r = balk_zonder_beugels(7);
    r.niet_uitgevoerd.clear();
    assert!(niet_uitgevoerd_overzicht(&invoer(vec![r])).is_empty());
    assert!(niet_uitgevoerd_overzicht(&invoer(vec![])).is_empty());
}

#[test]
fn het_overzicht_staat_woordelijk_in_de_pdf_en_alleen_als_er_iets_is() {
    let met = balk_zonder_beugels(7);
    let mut zonder = met.clone();
    zonder.niet_uitgevoerd.clear();

    let stroom_met = inhoudsstromen(&generate_report_pdf(invoer(vec![met])));
    let stroom_zonder = inhoudsstromen(&generate_report_pdf(invoer(vec![zonder])));

    // De toelichting: "afgerekend;" (met puntkomma) staat alleen in dit overzicht.
    assert!(staat_erin(&stroom_met, "afgerekend;"), "de toelichting ontbreekt in de PDF");
    assert!(
        !staat_erin(&stroom_zonder, "afgerekend;"),
        "de toelichting staat in de PDF zonder overgeslagen toets — het overzicht hoort weg te blijven"
    );
    // De kop "Niet uitgevoerd" en de regel "Staaf 7 (...): Dwarskracht; ...":
    // die woorden staan ook in de toetsing per staaf (de notes van §5.8 zonder
    // kolomgegevens, de titel van §6.2), dus hier telt het AANTAL — precies één
    // meer.
    // Regular en bold kunnen dezelfde gliefnummers hebben; dan één keer tellen.
    let tel = |stroom: &str, woord: &str| {
        let mut reeksen = vec![glief_hex(FONT_REGULAR, woord), glief_hex(FONT_BOLD, woord)];
        reeksen.dedup();
        reeksen.iter().map(|r| stroom.matches(r.as_str()).count()).sum::<usize>()
    };
    for woord in ["uitgevoerd", "Dwarskracht", "Staaf"] {
        assert_eq!(
            tel(&stroom_met, woord),
            tel(&stroom_zonder, woord) + 1,
            "{woord:?}: het overzicht hoort het woord precies één keer toe te voegen"
        );
    }
}
