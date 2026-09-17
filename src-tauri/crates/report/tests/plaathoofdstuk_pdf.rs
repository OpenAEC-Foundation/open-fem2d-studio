//! Inhoudsproeven op werkelijk gezette PDF's, met resultaten uit de plaatkern.
use plaat_check::{check_all_plates, PlateCheckInput};
use report::{generate_report_pdf, norms_line, plaathoofdstuk, ReportInput};
use serde_json::json;

const FONTS: [&[u8]; 2] = [
    include_bytes!("../fonts/LiberationSans-Regular.ttf"),
    include_bytes!("../fonts/LiberationSans-Bold.ttf"),
];

fn inhoud(pdf: &[u8]) -> String {
    let doc = lopdf::Document::load_mem(pdf).unwrap();
    doc.get_pages()
        .values()
        .map(|id| String::from_utf8_lossy(&doc.get_page_content(*id).unwrap()).to_uppercase())
        .collect::<Vec<_>>()
        .join("\n")
}

fn bevat(stroom: &str, tekst: &str) -> bool {
    FONTS.iter().any(|font| {
        let face = ttf_parser::Face::parse(font, 0).unwrap();
        let hex = tekst
            .chars()
            .map(|ch| {
                format!(
                    "{:04X}",
                    face.glyph_index(ch)
                        .unwrap_or_else(|| panic!("Ontbrekende glief {ch:?} in {tekst:?}"))
                        .0
                )
            })
            .collect::<String>();
        stroom.contains(&hex)
    })
}

fn woorden(stroom: &str, tekst: &str) {
    for woord in tekst.split_whitespace() {
        assert!(bevat(stroom, woord), "Ontbreekt in gezette PDF: {woord:?}");
    }
}

fn leeg() -> ReportInput {
    serde_json::from_value(json!({
        "project_name": "Plaatrapport", "project_number": "P-25", "engineer": "Constructeur",
        "company": "Ontwerpbureau", "date": "2026-09-17", "steel_check_results": []
    }))
    .unwrap()
}

fn staal() -> PlateCheckInput {
    serde_json::from_value(json!({
        "plate_id": 41, "soort": "Staal", "materiaal": "S235", "thickness_mm": 10,
        "combinations": [
            {"combination_id": 11, "elements": [
                {"element_id": 701, "sigma_x_mpa": 47, "sigma_y_mpa": 0, "tau_xy_mpa": 0},
                {"element_id": 702, "sigma_x_mpa": 23.5, "sigma_y_mpa": 0, "tau_xy_mpa": 0}
            ]},
            {"combination_id": 22, "elements": [
                {"element_id": 701, "sigma_x_mpa": 23.5, "sigma_y_mpa": 0, "tau_xy_mpa": 0},
                {"element_id": 702, "sigma_x_mpa": 117.5, "sigma_y_mpa": 0, "tau_xy_mpa": 0}
            ]}
        ]
    }))
    .unwrap()
}

#[test]
fn alle_combinaties_en_maatgevende_punten_staan_in_de_pdf() {
    let mut inp = leeg();
    inp.plate_inputs = vec![staal()];
    inp.plate_results = check_all_plates(inp.plate_inputs.clone());
    let r = &inp.plate_results[0];
    assert_eq!(r.governing_element_id, Some(702));
    assert_eq!(r.governing_combination_id, Some(22));
    assert!((r.uc_max - 0.5).abs() < 1e-12);
    assert_eq!(
        plaathoofdstuk::overzichtsregel(r)[4..7],
        ["0.50", "702", "22"]
    );
    let redenen = r.niet_getoetst.clone();
    assert_eq!(norms_line(&inp), "EN 1993-1-1");
    let pdf = generate_report_pdf(inp);
    let stroom = inhoud(&pdf);
    for tekst in [
        plaathoofdstuk::KOP,
        "toetsinvoer",
        "11",
        "22",
        "701",
        "702",
        "0.20",
        "0.50",
        "47.000",
        "117.500",
        "Niet getoetst:",
    ] {
        assert!(bevat(&stroom, tekst), "{tekst}");
    }
    for n in redenen {
        woorden(&stroom, &n.reden);
    }
    // Een plaatrapport mag geen lege inhoudspagina vóór het hoofdstuk krijgen.
    let doc = lopdf::Document::load_mem(&pdf).unwrap();
    let eerste_inhoud =
        String::from_utf8_lossy(&doc.get_page_content(doc.get_pages()[&2]).unwrap()).to_uppercase();
    assert!(bevat(&eerste_inhoud, plaathoofdstuk::KOP));
    if let Ok(pad) = std::env::var("PLAAT_PDF_PROEF") {
        std::fs::write(pad, pdf).unwrap();
    }
}

#[test]
fn hout_clt_en_overgeslagen_plaat_behouden_hun_letterlijke_redenen() {
    let hout: PlateCheckInput = serde_json::from_value(json!({
        "plate_id": 51, "soort": "Hout", "materiaal": "C24", "thickness_mm": 100,
        "hoofdrichting_graden": 90, "service_class": "Sc1",
        "load_duration_per_combination": [{"combination_id": 33, "load_duration": "MediumTerm", "basis": "Gebruiksbelasting"}],
        "combinations": [{"combination_id": 33, "elements": [
            {"element_id": 801, "sigma_x_mpa": 0.2, "sigma_y_mpa": -1, "tau_xy_mpa": 0}
        ]}]
    })).unwrap();
    let mut clt = hout.clone();
    clt.plate_id = 52;
    clt.soort = plaat_check::PlaatMateriaalSoort::Kruislaaghout;
    let mut inp = leeg();
    inp.plate_inputs = vec![hout, clt];
    inp.plate_results = check_all_plates(inp.plate_inputs.clone());
    assert_eq!(
        format!("{:?}", inp.plate_results[0].status),
        "NotApplicable"
    );
    let reden = inp.plate_results[0]
        .niet_getoetst
        .iter()
        .find(|n| n.id == plaat_check::hout::TREK_90_ID)
        .unwrap()
        .reden
        .clone();
    inp.plate_skipped
        .push(plaathoofdstuk::RapportPlaatOvergeslagen {
            plate_id: 53,
            reden: "Geen elementspanningen beschikbaar".into(),
        });
    assert_eq!(norms_line(&inp), "EN 1995-1-1");
    let pdf = generate_report_pdf(inp);
    let stroom = inhoud(&pdf);
    woorden(&stroom, &reden);
    woorden(&stroom, plaat_check::REDEN_KRUISLAAGHOUT);
    woorden(&stroom, "Plaat 53: Geen elementspanningen beschikbaar");
    woorden(&stroom, "Vezelrichting: 90° Sc1 Gebruiksbelasting");
    assert!(bevat(&stroom, "N/A"));
    if let Ok(pad) = std::env::var("PLAAT_HOUT_PDF_PROEF") {
        std::fs::write(pad, pdf).unwrap();
    }
}

#[test]
fn lege_en_oude_rapportinvoer_blijft_zonder_plaathoofdstuk() {
    let inp = leeg();
    assert!(
        inp.plate_inputs.is_empty() && inp.plate_results.is_empty() && inp.plate_skipped.is_empty()
    );
    let mut flow = Vec::new();
    plaathoofdstuk::extend_with_plaathoofdstuk(&mut flow, &inp);
    assert!(flow.is_empty(), "ook geen pagina-einde");
    assert!(!bevat(
        &inhoud(&generate_report_pdf(inp)),
        plaathoofdstuk::KOP
    ));
}

#[test]
fn wapeningstoelichting_is_resultaatgestuurd_en_noemt_beide_grenstoestanden() {
    let mut plaat = staal();
    plaat.soort = plaat_check::PlaatMateriaalSoort::Beton;
    plaat.materiaal = "C30/37".into();
    plaat.thickness_mm = 200.0;
    for c in &mut plaat.combinations {
        for e in &mut c.elements {
            e.sigma_x_mpa = 0.0;
            e.tau_xy_mpa = 3.0;
        }
    }
    let mut inp = leeg();
    inp.plate_results = check_all_plates(vec![plaat]);
    assert!(inp.plate_results[0].wapening.is_some());
    let stroom = inhoud(&generate_report_pdf(inp));
    woorden(&stroom, "relevante UGT- en BGT-combinaties");
    woorden(&stroom, "De toetsing van aanwezige wapening en eventuele beperkingen staan bij de toetsen en niet-getoetste onderdelen.");
    assert!(bevat(&stroom, "600.0"));
}

#[test]
fn alleen_invoer_of_overgeslagen_platen_verdwijnen_niet() {
    let mut inp = leeg();
    inp.plate_inputs = vec![staal()];
    assert!(plaathoofdstuk::van_toepassing(&inp));
    assert!(norms_line(&inp).is_empty());
    let stroom = inhoud(&generate_report_pdf(inp));
    woorden(
        &stroom,
        "Niet getoetst: geen toetsresultaat aangeleverd voor deze plaat.",
    );
    woorden(&stroom, "Combinatie 11: geen toetsuitkomst beschikbaar;");
    woorden(&stroom, "Combinatie 22: geen toetsuitkomst beschikbaar;");

    let mut inp = leeg();
    inp.plate_skipped
        .push(plaathoofdstuk::RapportPlaatOvergeslagen {
            plate_id: 7,
            reden: "Materiaal ontbreekt".into(),
        });
    assert!(norms_line(&inp).is_empty());
    woorden(
        &inhoud(&generate_report_pdf(inp)),
        "Plaat 7: Materiaal ontbreekt",
    );
}

#[test]
fn resultaten_zonder_invoer_en_geweigerde_platen_blijven_compatibel() {
    let mut inp = leeg();
    inp.plate_results = check_all_plates(vec![staal()]);
    let stroom = inhoud(&generate_report_pdf(inp));
    woorden(&stroom, "oorspronkelijke toetsinvoer niet meegestuurd;");
    assert!(bevat(&stroom, "0.50"));

    let mut inp = leeg();
    let mut clt = staal();
    clt.soort = plaat_check::PlaatMateriaalSoort::Kruislaaghout;
    inp.plate_results = check_all_plates(vec![clt]);
    assert!(norms_line(&inp).is_empty());
    assert_eq!(
        plaathoofdstuk::overzichtsregel(&inp.plate_results[0])[3..8],
        ["—", "—", "—", "—", "Niet getoetst"]
    );
    woorden(
        &inhoud(&generate_report_pdf(inp)),
        plaat_check::REDEN_KRUISLAAGHOUT,
    );
}

#[test]
fn nulweerstand_met_positieve_belasting_blijft_leesbaar_in_elk_pdf_blok() {
    assert_eq!(plaathoofdstuk::uc_tekst(f64::MAX), "onbegrensd");
    assert_eq!(plaathoofdstuk::uc_tekst(1e100), "1.00e100");
    assert_eq!(plaathoofdstuk::uc_tekst(0.5), "0.50");
    // Renderingcontract, geen nieuwe betontoets: een aangeleverd resultaat
    // voor lege wapening draagt Ed > 0, Rd = 0 en MAX als eindige UC.
    let mut r = check_all_plates(vec![staal()]).remove(0);
    r.soort = plaat_check::PlaatMateriaalSoort::Beton;
    r.materiaal = "C30/37".into();
    r.norm = "EN 1992-1-1".into();
    r.uc_max = f64::MAX;
    r.status = nen_en_1993_1_1_section::CheckStatus::NotOk;
    r.combinaties[1].uc = f64::MAX;
    r.niet_getoetst.clear();
    let steel_check::CheckKind::Resistance(c) = &mut r.checks[0].kind else {
        panic!("weerstandstoets")
    };
    c.title = "Aanwezige wapening".into();
    c.value = f64::MAX;
    c.status = nen_en_1993_1_1_section::CheckStatus::NotOk;
    c.formula_latex = "UC = Ed / Rd".into();
    let uc = c.uc.as_mut().unwrap();
    uc.ed = 100.0;
    uc.rd = 0.0;
    uc.uc = f64::MAX;
    c.notes = vec!["Lege wapening: nulweerstand bij positieve belasting; UC onbegrensd.".into()];
    c.variables[0].value = f64::MAX;
    c.deelstappen[0].value = Some(f64::MAX);
    let mut inp = leeg();
    inp.plate_results = vec![r];
    let stroom = inhoud(&generate_report_pdf(inp));
    woorden(
        &stroom,
        "Lege wapening: nulweerstand bij positieve belasting;",
    );
    assert!(bevat(&stroom, "onbegrensd"));
    assert!(bevat(&stroom, "FAIL"));
    assert!(
        !bevat(&stroom, &format!("{:.0}", f64::MAX)),
        "geen honderden cijfers in tabellen, toetsblokken of afleiding"
    );
}
