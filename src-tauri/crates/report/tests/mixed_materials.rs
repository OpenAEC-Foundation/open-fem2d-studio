//! Gemengd rapport: staal (EN 1993-1-1), hout en kruislaaghout (EN 1995-1-1),
//! beton (EN 1992-1-1) én de vrije spanningstoets (geen norm) in één PDF.
//!
//! Wat deze test hard aantoont:
//! - `report_members` levert ALLE staven van alle vijf de kernen, gesorteerd op
//!   staaf-id, met de juiste norm-, doorsnede- en klasselabels — dit is exact
//!   de bron waaruit de samenvattingstabel en de per-staaf-blokken worden
//!   gerenderd.
//! - `norms_line` toont alleen de kaders waarvan resultaten aanwezig zijn en
//!   valt NIET terug op een norm wanneer er niets getoetst is. Dat is de
//!   omgekeerde kant van "geen leeg hoofdstuk tonen": het rapport mag ook geen
//!   norm CLAIMEN die er niet in zit — en die claim stond op het omslag én in
//!   de kop van elk vel.
//! - Een rapport zonder één getoetste staaf toont geen samenvattingstabel maar
//!   de melding waarom het leeg is.
//! - De gerenderde PDF is syntactisch geldig en telt één pagina per staaf
//!   (cover + samenvatting + n staven); een rapport mét houtstaaf heeft
//!   aantoonbaar één pagina méér dan hetzelfde rapport zonder.
//!
//! Wat deze test NIET kan aantonen: letterlijke tekst in de PDF-stream.
//! openaec-layout schrijft tekst via TTF-glyph-encoding (printpdf
//! `write_text`), waardoor strings als "HEB160" niet grep-baar zijn in de
//! bytes. De inhoudsgarantie loopt daarom via `report_members`/`norms_line`
//! (zelfde codepad als de renderer) plus de pagina-telling.

use concrete_check::ConcreteBeamCheckResult;
use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{
    classification::CrossSectionClass, CheckStatus, NamedValue, ResistanceCalc, UnityCheck,
};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use report::{generate_report_pdf, norms_line, report_members, ReportInput, GEEN_NORM};
use spanning_check::{SpanningBeamCheckResult, SpanningDoorsnedeResultaat};
use steel_check::result::{BeamCheckResult, CheckKind, NamedCheck};
use timber_check::clt::{CltBeamCheckResult, CltLayupResult};
use timber_check::TimberBeamCheckResult;

// ── Testdata ─────────────────────────────────────────────────────────────────

fn dummy_check(id: &str, title: &str, article: &str, uc: f64) -> NamedCheck {
    NamedCheck {
        id: id.into(),
        kind: CheckKind::Resistance(ResistanceCalc {
            deelstappen: Vec::new(),
            id: id.into(),
            title: title.into(),
            article: article.into(),
            force_state: ForceStateSnapshot {
                combination_id: 1,
                position_mm: 1250.0,
                forces: InternalForces {
                    n_ed: -120.0,
                    vy_ed: 0.0,
                    vz_ed: 8.0,
                    mt_ed: 0.0,
                    my_ed: 22.5,
                    mz_ed: 0.0,
                },
            },
            formula_latex: "X_d = X_k · k / γ_M".into(),
            variables: vec![NamedValue {
                symbol: "X_k".into(),
                value: 24.0,
                unit: "MPa".into(),
            }],
            value: 14.77,
            unit: "MPa".into(),
            uc: Some(UnityCheck {
                ed: 10.0,
                rd: 14.77,
                uc,
                formula_latex: "UC = E_d / R_d".into(),
            }),
            status: if uc <= 1.0 {
                CheckStatus::Ok
            } else {
                CheckStatus::NotOk
            },
            notes: vec![],
        }),
    }
}

fn steel_beam(beam_id: u32, uc: f64) -> BeamCheckResult {
    BeamCheckResult {
        beam_id,
        profile_name: "HEB160".into(),
        steel_grade: "S235".into(),
        classification: CrossSectionClass::Class1,
        checks: vec![dummy_check("comp", "Compression resistance", "EN 1993-1-1 §6.2.4", uc)],
        uc_max: uc,
        status: CheckStatus::Ok,
        governing_check_id: "comp".into(),
    }
}

fn timber_beam(beam_id: u32, uc: f64) -> TimberBeamCheckResult {
    TimberBeamCheckResult {
        beam_id,
        section_name: "96 x 450".into(),
        strength_class: "C24".into(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        checks: vec![dummy_check("bending", "Buiging", "EN 1995-1-1 §6.1.6", uc)],
        uc_max: uc,
        status: CheckStatus::Ok,
        governing_check_id: "bending".into(),
    }
}

fn concrete_beam(beam_id: u32, uc: f64) -> ConcreteBeamCheckResult {
    ConcreteBeamCheckResult {
        beam_id,
        section_name: "300 x 500".into(),
        // Een rechthoek draagt geen vormaannamen; zie
        // `ConcreteSection::assumptions`.
        shape_assumptions: Vec::new(),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        reinforcement_summary: "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm".into(),
        a_s_bottom_mm2: 603.2,
        a_s_top_mm2: 226.2,
        d_mm: 454.0,
        f_cd_mpa: 20.0,
        f_yd_mpa: 435.0,
        checks: vec![dummy_check("6.1_mn_kappa", "Moment-normaalkracht (M-N-κ)", "art. 6.1 en 3.1.7(1) (3.17)", uc)],
        uc_max: uc,
        status: CheckStatus::Ok,
        governing_check_id: "6.1_mn_kappa".into(),
        mn_kappa: None,
        interaction_positive: vec![],
        interaction_negative: vec![],
    }
}

/// Kruislaaghout. De opbouw blijft leeg: de PDF rendert de laagtabel (nog)
/// niet, en deze test gaat over het pad dat hij wél loopt — dezelfde
/// `NamedCheck`s als massief hout, onder dezelfde norm.
fn clt_beam(beam_id: u32, uc: f64) -> CltBeamCheckResult {
    CltBeamCheckResult {
        beam_id,
        section_name: "CLT 40/20/40/20/40 (h = 160 mm, b = 1000 mm)".into(),
        strength_class: "C24".into(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        checks: vec![dummy_check(
            "clt_l1_bending",
            "Buiging lamel 1",
            "art. 6.1.6 (6.11)",
            uc,
        )],
        uc_max: uc,
        status: CheckStatus::Ok,
        governing_check_id: "clt_l1_bending".into(),
        layup: CltLayupResult {
            width_mm: 1000.0,
            height_mm: 160.0,
            z0_mm: 80.0,
            ei_ef_knm2: 1.0,
            ea_ef_kn: 1.0,
            i_ef_net_mm4: 1.0,
            slenderness: 30.0,
            layers: vec![],
            governing_layer: Some(1),
        },
        notes: vec![],
    }
}

/// De vrije spanningstoets: een doorsnede en een OPGEGEVEN toelaatbare
/// spanning. Het spanningsverloop blijft weg — de PDF tekent het niet, en het
/// gaat hier om het kader waaronder de staaf in het rapport komt.
fn vrij_beam(beam_id: u32, uc: f64) -> SpanningBeamCheckResult {
    SpanningBeamCheckResult {
        beam_id,
        section_name: "200 x 200".into(),
        material_name: "natuursteen".into(),
        f_toel_mpa: 8.0,
        gamma_m: 1.0,
        f_d_mpa: 8.0,
        checks: vec![dummy_check(
            "sigma_eq",
            "Vergelijkspanning (von Mises)",
            "vrije spanningstoets",
            uc,
        )],
        uc_max: uc,
        status: CheckStatus::Ok,
        governing_check_id: "sigma_eq".into(),
        section: SpanningDoorsnedeResultaat {
            naam: "200 x 200".into(),
            hoogte_mm: 200.0,
            breedte_max_mm: 200.0,
            z_c_mm: 100.0,
            a_mm2: 40_000.0,
            iy_mm4: 133_333_333.0,
            wel_top_mm3: 1_333_333.0,
            wel_bot_mm3: 1_333_333.0,
            bron: "lagenmodel".into(),
            lagen: vec![],
        },
        verloop: None,
        notes: vec![],
    }
}

fn input(steel: Vec<BeamCheckResult>, timber: Vec<TimberBeamCheckResult>) -> ReportInput {
    input_alle(steel, timber, vec![])
}

fn input_alle(
    steel: Vec<BeamCheckResult>,
    timber: Vec<TimberBeamCheckResult>,
    concrete: Vec<ConcreteBeamCheckResult>,
) -> ReportInput {
    ReportInput {
        steel_check_results: steel,
        timber_check_results: timber,
        concrete_check_results: concrete,
        ..leeg_rapport()
    }
}

/// Een rapport zonder één toetsresultaat. De tests vullen daaruit alleen de
/// velden die ze nodig hebben, zodat een volgend resultaatveld hier op één
/// plaats binnenkomt.
fn leeg_rapport() -> ReportInput {
    ReportInput {
        project_name: "Gemengd raamwerk".into(),
        project_number: "MX-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-02".into(),
        steel_check_results: vec![],
        timber_check_results: vec![],
        clt_check_results: vec![],
        concrete_check_results: vec![],
        stress_check_results: vec![],
        // Deze test gaat over de materiaal-neutrale renderer, niet over het
        // segmentspoor; het betonhoofdstuk blijft dus op de "niet fysisch
        // gerekend"-melding staan.
        concrete_stiffness_trace: None,
    }
}

// ── PDF-hulpfunctie ──────────────────────────────────────────────────────────

/// Leest het paginatal uit de Pages-boom: printpdf schrijft
/// `<</Type/Pages/Count N/Kids[...]>>` (zonder spaties in de names).
fn count_pages(bytes: &[u8]) -> usize {
    let needle = b"/Type/Pages/Count ";
    let start = bytes
        .windows(needle.len())
        .position(|w| w == needle)
        .expect("PDF moet een /Type/Pages/Count bevatten")
        + needle.len();
    let digits: String = bytes[start..]
        .iter()
        .take_while(|b| b.is_ascii_digit())
        .map(|&b| b as char)
        .collect();
    digits.parse().expect("Count moet een getal zijn")
}

/// Staat `woord` als tekst op het papier?
///
/// De opmaakmotor schrijft tekst als gliefnummers, dus zoeken op de letters
/// zelf levert niets op. Een woord wordt hier met dezelfde ingesloten
/// Liberation Sans vertaald naar de hexreeks waarmee printpdf het opschrijft
/// (`<0025 0048 …> Tj`) en die reeks wordt in de inhoudsstromen gezocht.
/// `tests/betonhoofdstuk_pdf.rs` legt de werkwijze uitgebreider uit; hier is ze
/// nodig omdat de normenregel juist op het OMSLAG en in de KOP staat, en die
/// twee zijn met een paginatelling niet te controleren.
fn staat_op_papier(pdf: &[u8], woord: &str) -> bool {
    const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
    const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

    let doc = lopdf::Document::load_mem(pdf).expect("de PDF moet te lezen zijn");
    let mut stroom = String::new();
    for (_, id) in doc.get_pages() {
        let inhoud = doc
            .get_page_content(id)
            .expect("de inhoudsstroom moet uit te pakken zijn");
        stroom.push_str(&String::from_utf8_lossy(&inhoud).to_uppercase());
    }

    [FONT_REGULAR, FONT_BOLD].iter().any(|font| {
        let face = ttf_parser::Face::parse(font, 0).expect("het lettertype moet te lezen zijn");
        let hex: String = woord
            .chars()
            .map(|ch| {
                let gid = face
                    .glyph_index(ch)
                    .unwrap_or_else(|| panic!("geen glief voor {ch:?} — kies een ander proefwoord"));
                format!("{:04X}", gid.0)
            })
            .collect();
        stroom.contains(&hex)
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[test]
fn report_members_bevat_staal_en_hout_gesorteerd_op_staaf_id() {
    let inp = input(vec![steel_beam(4, 0.42)], vec![timber_beam(2, 0.81)]);
    let members = report_members(&inp);

    assert_eq!(members.len(), 2, "beide staven moeten in het rapport zitten");

    // Gesorteerd op staaf-id: hout-staaf 2 vóór staal-staaf 4.
    assert_eq!(members[0].beam_id, 2);
    assert_eq!(members[0].norm, Some("EN 1995-1-1"));
    assert_eq!(members[0].section_label, "96 x 450");
    assert_eq!(members[0].grade_label, "C24");
    assert_eq!(members[0].governing_check_id, "bending");
    assert!((members[0].uc_max - 0.81).abs() < 1e-12);
    assert_eq!(members[0].checks.len(), 1);

    assert_eq!(members[1].beam_id, 4);
    assert_eq!(members[1].norm, Some("EN 1993-1-1"));
    assert_eq!(members[1].section_label, "HEB160");
    assert_eq!(members[1].grade_label, "S235");
}

#[test]
fn norms_line_toont_alleen_aanwezige_normen() {
    let staal_alleen = input(vec![steel_beam(1, 0.5)], vec![]);
    let hout_alleen = input(vec![], vec![timber_beam(1, 0.5)]);
    let beide = input(vec![steel_beam(1, 0.5)], vec![timber_beam(2, 0.5)]);
    let beton_alleen = input_alle(vec![], vec![], vec![concrete_beam(1, 0.5)]);
    let alle_drie = input_alle(
        vec![steel_beam(1, 0.5)],
        vec![timber_beam(2, 0.5)],
        vec![concrete_beam(3, 0.5)],
    );

    assert_eq!(norms_line(&staal_alleen), "EN 1993-1-1");
    assert_eq!(norms_line(&hout_alleen), "EN 1995-1-1");
    assert_eq!(norms_line(&beide), "EN 1993-1-1 / EN 1995-1-1");
    assert_eq!(norms_line(&beton_alleen), "EN 1992-1-1");
    assert_eq!(norms_line(&alle_drie), "EN 1993-1-1 / EN 1995-1-1 / EN 1992-1-1");
}

/// De kern van dit bestand: een model zonder staal krijgt nergens "EN 1993-1-1"
/// te zien. De normenregel staat op het omslag én in de kop van elk vel, dus
/// een terugval daar is een claim op elke bladzijde.
#[test]
fn geen_staal_in_het_model_geen_staalnorm_in_het_rapport() {
    let clt_alleen = ReportInput {
        clt_check_results: vec![clt_beam(1, 0.4)],
        ..leeg_rapport()
    };
    let vrij_alleen = ReportInput {
        stress_check_results: vec![vrij_beam(1, 0.3)],
        ..leeg_rapport()
    };
    let leeg = leeg_rapport();

    // Kruislaaghout wordt per lamel op EN 1995-1-1 getoetst — dat is de norm
    // die genoemd hoort te worden, en geen andere.
    assert_eq!(norms_line(&clt_alleen), "EN 1995-1-1");

    // De vrije spanningstoets hoort bij géén norm en zegt dat ook zo.
    assert_eq!(norms_line(&vrij_alleen), GEEN_NORM);

    // Zonder één toetsresultaat noemt het rapport helemaal niets. Leeg is hier
    // het juiste antwoord: de aanroepers laten de regel dan weg.
    assert_eq!(norms_line(&leeg), "");

    for invoer in [&clt_alleen, &vrij_alleen, &leeg] {
        assert!(
            !norms_line(invoer).contains("1993"),
            "de staalnorm mag nergens opduiken in een model zonder staal"
        );
    }
}

#[test]
fn report_members_neemt_kruislaaghout_en_vrije_spanning_mee() {
    let inp = ReportInput {
        steel_check_results: vec![steel_beam(1, 0.42)],
        clt_check_results: vec![clt_beam(2, 0.55)],
        stress_check_results: vec![vrij_beam(3, 0.31)],
        ..leeg_rapport()
    };
    let members = report_members(&inp);

    assert_eq!(members.len(), 3, "alle drie de kernen leveren een staaf");

    assert_eq!(members[1].beam_id, 2);
    assert_eq!(members[1].norm, Some("EN 1995-1-1"));
    assert_eq!(members[1].norm_label(), "EN 1995-1-1");
    assert_eq!(members[1].grade_label, "C24");

    assert_eq!(members[2].beam_id, 3);
    assert_eq!(members[2].norm, None, "geen norm, en dat is geen omissie");
    assert_eq!(members[2].norm_label(), GEEN_NORM);
    assert_eq!(members[2].section_label, "200 x 200");
    assert_eq!(members[2].grade_label, "natuursteen");

    // De regel op omslag en paginakop noemt beide kaders, elk één keer.
    assert_eq!(
        norms_line(&inp),
        format!("EN 1993-1-1 / EN 1995-1-1 / {GEEN_NORM}")
    );
}

/// Massief hout en kruislaaghout delen één norm; die hoort één keer op het
/// omslag te staan en niet twee keer.
#[test]
fn hout_en_kruislaaghout_leveren_samen_een_normvermelding() {
    let inp = ReportInput {
        timber_check_results: vec![timber_beam(1, 0.5)],
        clt_check_results: vec![clt_beam(2, 0.5)],
        ..leeg_rapport()
    };
    assert_eq!(norms_line(&inp), "EN 1995-1-1");
}

/// Een CLT-model levert een echt rapport: cover, samenvatting, een blad per
/// staaf én het houthoofdstuk — niet een omslag met een lege tabel eronder.
#[test]
fn clt_rapport_rendert_geldige_pdf() {
    let inp = ReportInput {
        clt_check_results: vec![clt_beam(1, 0.4), clt_beam(2, 0.6)],
        ..leeg_rapport()
    };
    assert!(
        report::houthoofdstuk::van_toepassing(&inp),
        "een model met kruislaaghout hoort het houthoofdstuk te krijgen"
    );
    let bytes = generate_report_pdf(inp);

    assert!(bytes.starts_with(b"%PDF-"), "PDF-magic ontbreekt");
    // Het vijfde blad is het houthoofdstuk. Dat kwam erbij toen kruislaaghout
    // zijn eigen hoofdstuk kreeg: de opbouw, de ontleding van I_y en de
    // meldingen van de kern stonden tot dan toe alleen op het scherm.
    //
    // De proefstaven hierboven dragen een LEGE lagenlijst — het is een stub en
    // geen uitkomst van de rekenkern — dus het hoofdstuk meldt daar dat er
    // geen opbouw te tekenen valt in plaats van er een te verzinnen. Dat het
    // hoofdstuk zich met een écht toetsresultaat wél vult, staat in
    // `tests/houthoofdstuk_pdf.rs`.
    assert_eq!(
        count_pages(&bytes),
        5,
        "verwacht cover + samenvatting + 2 staafpagina's + het houthoofdstuk"
    );
}

/// De proef op de klacht zelf: staat "1993" nog ergens op het papier van een
/// model zonder één stalen staaf?
///
/// Dit is de enige controle die het echte probleem raakt. De normenregel staat
/// op het omslag en in de kop van elk vel, en dat zijn bladzijden die met een
/// paginatelling of met `norms_line` alleen niet te betrappen zijn: die tekst
/// wordt langs een ander pad getekend (`DrawList`) dan de hoofdstukken.
#[test]
fn de_staalnorm_staat_niet_op_het_papier_van_een_model_zonder_staal() {
    let clt_pdf = generate_report_pdf(ReportInput {
        clt_check_results: vec![clt_beam(1, 0.4)],
        ..leeg_rapport()
    });
    let vrij_pdf = generate_report_pdf(ReportInput {
        stress_check_results: vec![vrij_beam(1, 0.3)],
        ..leeg_rapport()
    });
    let leeg_pdf = generate_report_pdf(leeg_rapport());

    for (naam, pdf) in [("CLT", &clt_pdf), ("vrij materiaal", &vrij_pdf), ("leeg", &leeg_pdf)] {
        assert!(
            !staat_op_papier(pdf, "1993"),
            "het rapport van een model met {naam} noemt de staalnorm"
        );
    }

    // En de norm die er wél bij hoort staat er wel — anders bewijst het
    // bovenstaande alleen dat de zoekmethode niets vindt.
    assert!(
        staat_op_papier(&clt_pdf, "1995"),
        "een CLT-rapport hoort EN 1995-1-1 te noemen"
    );
    assert!(
        staat_op_papier(&generate_report_pdf(input(vec![steel_beam(1, 0.5)], vec![])), "1993"),
        "een staalrapport hoort de staalnorm juist wél te noemen"
    );
}

/// Zonder toetsresultaten: geen samenvattingstabel met nul regels, maar één
/// blad met de melding waarom het rapport leeg is. Er blijft dus wél een
/// document over dat de gebruiker kan lezen.
#[test]
fn rapport_zonder_toetsingen_toont_de_reden_in_plaats_van_een_lege_tabel() {
    let bytes = generate_report_pdf(leeg_rapport());

    assert!(bytes.starts_with(b"%PDF-"), "PDF-magic ontbreekt");
    assert_eq!(
        count_pages(&bytes),
        2,
        "verwacht cover + het blad met de melding, en geen staafpagina's"
    );
}

#[test]
fn report_members_neemt_beton_mee_met_eigen_norm_en_labels() {
    let inp = input_alle(
        vec![steel_beam(3, 0.42)],
        vec![timber_beam(2, 0.81)],
        vec![concrete_beam(1, 0.63)],
    );
    let members = report_members(&inp);

    assert_eq!(members.len(), 3);
    // Gesorteerd op staaf-id: beton 1, hout 2, staal 3.
    assert_eq!(members[0].beam_id, 1);
    assert_eq!(members[0].norm, Some("EN 1992-1-1"));
    assert_eq!(members[0].section_label, "300 x 500");
    assert_eq!(members[0].grade_label, "C30/37");
    assert_eq!(members[0].governing_check_id, "6.1_mn_kappa");
    assert!((members[0].uc_max - 0.63).abs() < 1e-12);
    assert_eq!(members[0].checks.len(), 1);

    assert_eq!(members[1].norm, Some("EN 1995-1-1"));
    assert_eq!(members[2].norm, Some("EN 1993-1-1"));
}

#[test]
fn betonrapport_rendert_geldige_pdf() {
    let bytes = generate_report_pdf(input_alle(vec![], vec![], vec![concrete_beam(1, 0.63)]));

    assert!(bytes.starts_with(b"%PDF-"), "PDF-magic ontbreekt");
    assert!(bytes.windows(5).any(|w| w == b"%%EOF"), "%%EOF-trailer ontbreekt");
    // Cover (1) + samenvatting (1) + één betonstaaf (1) + het betonhoofdstuk
    // (1). Dat laatste hoort erbij zodra er beton in het rapport zit, óók
    // zonder segmentspoor: het MODEL kan dit hoofdstuk vullen, en dat het nu
    // leeg is, is een rekenstand. Het hoofdstuk zegt dan met zoveel woorden dat
    // er niet fysisch niet-lineair gerekend is — zie
    // `betonhoofdstuk::van_toepassing` en `tests/betonhoofdstuk_pdf.rs`.
    assert_eq!(count_pages(&bytes), 4);
}

#[test]
fn gemengd_rapport_rendert_geldige_pdf_met_pagina_per_staaf() {
    let met_hout = input(vec![steel_beam(1, 0.42)], vec![timber_beam(2, 0.81)]);
    let zonder_hout = input(vec![steel_beam(1, 0.42)], vec![]);

    let bytes_met = generate_report_pdf(met_hout);
    let bytes_zonder = generate_report_pdf(zonder_hout);

    // Geldige PDF-omhulling
    assert!(bytes_met.len() > 1000, "PDF te klein: {} bytes", bytes_met.len());
    assert!(bytes_met.starts_with(b"%PDF-"), "PDF-magic ontbreekt");
    assert!(
        bytes_met.windows(5).any(|w| w == b"%%EOF"),
        "%%EOF-trailer ontbreekt"
    );

    // Cover (1) + samenvatting (1) + één pagina per staaf.
    assert_eq!(
        count_pages(&bytes_met),
        4,
        "verwacht cover + samenvatting + 2 staafpagina's"
    );
    assert_eq!(
        count_pages(&bytes_zonder),
        3,
        "verwacht cover + samenvatting + 1 staafpagina"
    );

    // Persist voor visuele inspectie.
    let pid = std::process::id();
    let out = std::env::temp_dir().join(format!("openaec_mixed_report_{}.pdf", pid));
    std::fs::write(&out, &bytes_met).expect("write mixed PDF");
    eprintln!("[mixed] wrote {} bytes to {}", bytes_met.len(), out.display());
}

#[test]
fn alle_resultaatvelden_hebben_serde_default_voor_bestaande_aanroepen() {
    // Bestaande frontend-aanroepen sturen deze velden niet mee — dat moet
    // deserialiseren naar lege lijsten.
    let json = r#"{
        "project_name": "Legacy",
        "project_number": "L-1",
        "engineer": "E",
        "company": "C",
        "date": "2026-09-02",
        "steel_check_results": []
    }"#;
    let parsed: ReportInput = serde_json::from_str(json).expect("legacy JSON moet geldig blijven");
    assert!(parsed.timber_check_results.is_empty());
    assert!(parsed.clt_check_results.is_empty());
    assert!(parsed.concrete_check_results.is_empty());
    assert!(parsed.stress_check_results.is_empty());
}

// ── De normenregel op het OMSLAG ─────────────────────────────────────────────

/// De normenregel op het omslag wordt als ÉÉN lijn getekend: `DrawList::draw_text`
/// breekt niets af en knipt niets weg. Met alle vier de kaders erin was die
/// lijn breder dan een A4 en liep hij rechts van het papier af — zichtbaar
/// noch te achterhalen in de PDF. Met drie kaders paste hij nog net, dus het
/// gebrek dook pas op bij het rapport waarin de lezer het meest aan die regel
/// heeft.
///
/// Deze test meet de GERENDERDE breedte, met dezelfde fontregistratie en
/// dezelfde lettergrootte als de tekenaar, en legt hem naast de bladbreedte.
/// Hij is daarmee niet aan vier kaders gebonden: komt er ooit een vijfde bij,
/// dan wordt die net zo goed nagemeten.
#[test]
fn de_normenregel_op_het_omslag_past_op_het_papier() {
    use openaec_layout::FontRegistry;
    use report::{omslag_normregels, omslag_tekstbreedte, OMSLAG_NORM_PT};

    const VET: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");
    let mut reg = FontRegistry::new();
    let vet = reg
        .register_ttf_bytes("LiberationSans-Bold", VET.to_vec())
        .expect("het omslagfont hoort bij de crate te zitten");
    let max = omslag_tekstbreedte();

    let alle_vier = ReportInput {
        steel_check_results: vec![steel_beam(1, 0.5)],
        timber_check_results: vec![timber_beam(2, 0.5)],
        concrete_check_results: vec![concrete_beam(3, 0.5)],
        stress_check_results: vec![vrij_beam(4, 0.5)],
        ..leeg_rapport()
    };
    let vier = norms_line(&alle_vier);
    assert_eq!(vier, format!("EN 1993-1-1 / EN 1995-1-1 / EN 1992-1-1 / {GEEN_NORM}"));

    // De vondst zelf, nagemeten: ongebroken past deze regel niet op het vel.
    // Zou hij ooit tóch passen (kortere aanduidingen, kleinere letter), dan
    // valt deze assert om en mag het afbreken heroverwogen worden.
    let ongebroken = reg.text_width(vet, &vier, OMSLAG_NORM_PT);
    assert!(
        ongebroken.0 > max.0,
        "de regel met vier kaders hoort ongebroken NIET te passen: {} pt tegen {} pt",
        ongebroken.0,
        max.0,
    );

    // Elk aantal kaders dat dit rapport kan opleveren, plus één dat er nog
    // niet is: het omslag mag niet op vier blijven staan.
    let drie = norms_line(&input_alle(
        vec![steel_beam(1, 0.5)],
        vec![timber_beam(2, 0.5)],
        vec![concrete_beam(3, 0.5)],
    ));
    let vijf = format!("{vier} / EN 1994-1-1");
    let gevallen = [
        norms_line(&input(vec![steel_beam(1, 0.5)], vec![])),
        norms_line(&input(vec![steel_beam(1, 0.5)], vec![timber_beam(2, 0.5)])),
        drie.clone(),
        vier.clone(),
        vijf,
    ];

    for bron in &gevallen {
        let regels = omslag_normregels(bron, max, &mut |s| {
            reg.text_width(vet, s, OMSLAG_NORM_PT)
        });
        assert!(!regels.is_empty(), "een gevulde normenregel levert regels op");
        for regel in &regels {
            let breedte = reg.text_width(vet, regel, OMSLAG_NORM_PT);
            assert!(
                breedte.0 <= max.0,
                "regel {regel:?} is {} pt breed en past niet op de {} pt die het omslag heeft",
                breedte.0,
                max.0,
            );
        }
        // Er mag onderweg geen kader zoekraken of dubbel komen te staan. Elke
        // afgesloten regel eindigt op " /", dus de regels met een spatie aan
        // elkaar geplakt leveren de oorspronkelijke opsomming terug.
        assert_eq!(&regels.join(" "), bron, "het afbreken mag niets veranderen");
    }

    // Drie kaders paste al en moet op één regel BLIJVEN staan: het omslag van
    // een bestaand rapport hoort er niet anders uit te gaan zien.
    let drie_regels = omslag_normregels(&drie, max, &mut |s| {
        reg.text_width(vet, s, OMSLAG_NORM_PT)
    });
    assert_eq!(drie_regels.len(), 1, "drie kaders passen op één regel");

    // Vier kaders gaan over twee regels, en de eerste toont dat de opsomming
    // doorloopt.
    let vier_regels = omslag_normregels(&vier, max, &mut |s| {
        reg.text_width(vet, s, OMSLAG_NORM_PT)
    });
    assert!(vier_regels.len() >= 2, "vier kaders passen niet op één regel");
    assert!(vier_regels[0].ends_with(" /"), "een afgesloten regel houdt zijn scheidingsteken");

    // Zonder toetsresultaten blijft de regel helemaal weg — geen lege regel
    // die als een weggevallen norm leest.
    assert!(omslag_normregels("", max, &mut |s| reg.text_width(vet, s, OMSLAG_NORM_PT)).is_empty());
}

/// Eén PDF mag niet twee uitgaven van dezelfde norm noemen. Het omslag zette
/// "NEN-EN 1995-1-1+C1+A1:2011/NB:2013 nl" neer terwijl de kruislaaghouttoets
/// in haar notitie "NEN-EN 1995-1-1+A2:2014/NB:2013" op papier zette.
///
/// De uitgave die de rekenkern volgt noemt zichzelf op haar titelblad
/// "NEN-EN 1995-1-1:2005+A2:2014+NB:2013" en bevat blijkens haar eigen lijst
/// "Inclusief" C1:2006, A1:2008, C1:2012, A2:2014 en NB:2013. Die aanduiding
/// staat één keer in de code (`clt_toets::NORM_HOUT_AANDUIDING`); deze test
/// houdt het omslag en de notitie eraan vast.
#[test]
fn de_houtnorm_heet_op_het_omslag_hetzelfde_als_in_de_notitie() {
    use mechanics::InternalForces;
    use nen_en_1995_1_1::clt::CltLayup;
    use nen_en_1995_1_1::clt_toets::{rolling_shear_info, NORM_HOUT_AANDUIDING};

    // Het omslag draagt de aanduiding van de norm plus de taal, en niets anders.
    assert_eq!(report::NORM_TIMBER_FULL, format!("{NORM_HOUT_AANDUIDING} nl"));

    let mech = CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0], "C24")
        .mechanics()
        .expect("een drielaagse opbouw is geldig");
    let info = rolling_shear_info(
        &mech,
        1,
        1.0,
        ForceStateSnapshot {
            combination_id: 1,
            position_mm: 2500.0,
            forces: InternalForces { vz_ed: 10.0, ..Default::default() },
        },
    );
    let notitie = info.notes.join(" ");

    // Dezelfde uitgave als op het omslag, woordelijk.
    let op_het_omslag = report::NORM_TIMBER_FULL
        .strip_suffix(" nl")
        .expect("de omslagaanduiding eindigt op de taal");
    assert!(
        notitie.contains(op_het_omslag),
        "de notitie bij de rolschuiving noemt een andere uitgave dan het omslag: {notitie}",
    );
}
