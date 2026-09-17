//! De proef op de vier stukken die het rapport eerder NIET toonde terwijl de
//! rekenkern ze wél levert: de kolomtoets van art. 5.8 met haar afleiding, de
//! dekkingslijn van art. 9.2.1.3, de wapeningszones op de maatgevende snede en
//! de initiële scheefstand bij de uitgangspunten.
//!
//! # Waarom deze test woorden in de PDF terugzoekt
//!
//! Om dezelfde reden als `betonhoofdstuk_pdf.rs`: een tekenlijst die nergens
//! heen gaat laat een proef op `%PDF` gewoon slagen. De inhoudsstromen worden
//! met `lopdf` uitgepakt en een woord wordt met `ttf-parser` — dezelfde
//! Liberation Sans die het rapport insluit — vertaald naar de gliefreeks
//! waarmee printpdf het opschrijft. Staat die reeks in de stroom, dan staat het
//! woord op papier.
//!
//! De gliefhelpers staan hier opnieuw en niet in een gedeelde module: elke
//! integratietest in Rust is een eigen crate, en een `tests/gemeenschappelijk`
//! erbij zou voor vier korte functies een module opleveren die zelf weer als
//! test wordt opgepikt. `betonhoofdstuk_pdf.rs` en `houthoofdstuk_pdf.rs`
//! maken dezelfde keuze.
//!
//! # De getallen zijn gerekend en niet verzonnen
//!
//! De kolomtoetsen komen uit `concrete_check::column_check` en de dekkingslijn
//! uit `concrete_check::dekkingslijn`, allebei voor een echte doorsnede met een
//! echte korf. Wat het rapport afdrukt is dus wat de kern heeft gezegd, en de
//! proef zou meteen omvallen als de rapportkant er een eigen waarde van maakte.

use concrete_check::dekkingslijn::{dekkingslijn, DekkingslijnAntwoord, DekkingslijnVerzoek};
use concrete_check::{
    column_check, ConcreteBeamCheckResult, ConcreteColumnCheckRequest, ConcreteColumnCheckResponse,
};
use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::section::{
    LongitudinalZone, RebarRow, RebarSide, ReinforcementCage, ReinforcementZones, StirrupZone,
};
use nen_en_1992_1_1::verankering::{Staafvorm, Stortpositie};
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc, UnityCheck};
use report::betonzones::BetonStaafZones;
use report::{betondekking, betonkolom, generate_report_pdf, ReportInput};
use steel_check::result::{CheckKind, NamedCheck};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

// ═══════════════════════════════════════════════════════════════════════
// Woorden terugzoeken in de gerenderde PDF
// ═══════════════════════════════════════════════════════════════════════

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

/// Per teken het gliefnummer als vier hexcijfers — de vorm waarin printpdf een
/// woord in de stroom zet. Werkt per WOORD: de opmaakmotor knipt een alinea in
/// regels en tekent elke regel als één `Tj`, dus een zin kan over twee
/// tekenopdrachten verdeeld zijn.
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

fn eis_erin(stroom: &str, woord: &str) {
    assert!(
        staat_erin(stroom, woord),
        "{woord:?} staat niet in de inhoudsstroom van de PDF"
    );
}

fn eis_niet_erin(stroom: &str, woord: &str) {
    assert!(
        !staat_erin(stroom, woord),
        "{woord:?} staat in de PDF terwijl dat hoofdstuk niet van toepassing is"
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Testgegevens
// ═══════════════════════════════════════════════════════════════════════

/// De korf van de proefkolom: 4Ø20 boven en onder, beugel Ø8.
fn kolomkorf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 35.0,
        stirrup_diameter_mm: 8.0,
        stirrup_spacing_mm: Some(200.0),
        stirrup_legs: Some(2),
        top: RebarRow { count: 4, diameter_mm: 20.0 },
        bottom: RebarRow { count: 4, diameter_mm: 20.0 },
        ..ReinforcementCage::default()
    }
}

/// Een slanke geschoorde kolom 300 × 300, 5 m, met 900 kN druk en een klein
/// eerste-orde-moment. Bewust slank: dan valt λ boven λ_lim en zegt de poort
/// dat de tweede orde niet mag vervallen — de tak waarin het rapport het meest
/// te verantwoorden heeft.
fn reken_kolom() -> ConcreteColumnCheckResponse {
    let req: ConcreteColumnCheckRequest = serde_json::from_value(serde_json::json!({
        "beam_id": 1,
        "section": { "b_mm": 300.0, "h_mm": 300.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 35.0, "stirrup_diameter_mm": 8.0,
            "stirrup_spacing_mm": 200.0, "stirrup_legs": 2,
            "top": { "count": 4, "diameter_mm": 20.0 },
            "bottom": { "count": 4, "diameter_mm": 20.0 }
        },
        "length_m": 5.0,
        "column": {
            "bracing": "Geschoord",
            "buckling_length": { "soort": "Figuur57", "geval": "ScharnierendScharnierend" },
            "phi_inf_t0": 2.0,
            "stirrup_zone": "Regulier",
            "lap_situation": "GeenLassen"
        },
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 0.0,
              "forces": { "n_ed": -900.0, "vy_ed": 0.0, "vz_ed": 5.0,
                          "mt_ed": 0.0, "my_ed": 12.0, "mz_ed": 0.0 } },
            { "combination_id": 1, "position_mm": 2500.0,
              "forces": { "n_ed": -900.0, "vy_ed": 0.0, "vz_ed": 0.0,
                          "mt_ed": 0.0, "my_ed": 18.0, "mz_ed": 0.0 } },
            { "combination_id": 1, "position_mm": 5000.0,
              "forces": { "n_ed": -900.0, "vy_ed": 0.0, "vz_ed": -5.0,
                          "mt_ed": 0.0, "my_ed": 12.0, "mz_ed": 0.0 } }
        ],
        "sls_quasi_permanent_envelope": [
            { "combination_id": 11, "position_mm": 2500.0,
              "forces": { "n_ed": -600.0, "vy_ed": 0.0, "vz_ed": 0.0,
                          "mt_ed": 0.0, "my_ed": 12.0, "mz_ed": 0.0 } }
        ],
        "design_situation": "PersistentTransient",
        "steel_branch": "Horizontal"
    }))
    .expect("het kolomverzoek moet geldig zijn");
    column_check(req).expect("de rekenkern moet deze kolom kunnen doorrekenen")
}

/// De zone-indeling van de proefligger: onder 3Ø16 over de hele lengte plus
/// 2Ø16 bijleggen in het veld, boven 2Ø12, en twee beugelzones.
///
/// Het punt van deze indeling is dat de korf op x = 3000 mm ANDERS is dan op
/// x = 300 mm; alleen dan bewijst de test dat het rapport de geldende korf
/// opzoekt en niet de basiskorf herhaalt.
fn liggerzones() -> ReinforcementZones {
    ReinforcementZones {
        longitudinal: vec![
            LongitudinalZone {
                side: RebarSide::Bottom,
                row: RebarRow { count: 3, diameter_mm: 16.0 },
                x_start_mm: 0.0,
                x_end_mm: 1500.0,
                bar_shape: Staafvorm::Recht,
                casting_position: Stortpositie::Onderzijde,
            },
            LongitudinalZone {
                side: RebarSide::Bottom,
                row: RebarRow { count: 5, diameter_mm: 16.0 },
                x_start_mm: 1500.0,
                x_end_mm: 4500.0,
                bar_shape: Staafvorm::Recht,
                casting_position: Stortpositie::Onderzijde,
            },
            LongitudinalZone {
                side: RebarSide::Bottom,
                row: RebarRow { count: 3, diameter_mm: 16.0 },
                x_start_mm: 4500.0,
                x_end_mm: 6000.0,
                bar_shape: Staafvorm::Recht,
                casting_position: Stortpositie::Onderzijde,
            },
            LongitudinalZone {
                side: RebarSide::Top,
                row: RebarRow { count: 2, diameter_mm: 12.0 },
                x_start_mm: 0.0,
                x_end_mm: 6000.0,
                bar_shape: Staafvorm::Recht,
                casting_position: Stortpositie::Bovenzijde,
            },
        ],
        stirrups: vec![
            StirrupZone {
                x_start_mm: 0.0,
                x_end_mm: 1500.0,
                spacing_mm: 100.0,
                legs: 2,
                diameter_mm: 8.0,
            },
            StirrupZone {
                x_start_mm: 1500.0,
                x_end_mm: 6000.0,
                spacing_mm: 200.0,
                legs: 2,
                diameter_mm: 8.0,
            },
        ],
    }
}

/// De invoer van de proefligger, in de vorm waarin de dekkingslijn hem vraagt.
fn liggerinvoer() -> serde_json::Value {
    let l = 6000.0_f64;
    let m_max = 120.0_f64;
    let v_max = 80.0_f64;
    let punten: Vec<serde_json::Value> = (0..=20)
        .map(|i| {
            let x = i as f64 * l / 20.0;
            serde_json::json!({
                "combination_id": 1,
                "position_mm": x,
                "forces": {
                    "n_ed": 0.0,
                    "vy_ed": 0.0,
                    "vz_ed": v_max * (1.0 - 2.0 * x / l),
                    "mt_ed": 0.0,
                    "my_ed": m_max * 4.0 * x * (l - x) / (l * l),
                    "mz_ed": 0.0
                }
            })
        })
        .collect();
    serde_json::json!({
        "beam_id": 2,
        "section": { "b_mm": 300.0, "h_mm": 500.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0, "stirrup_diameter_mm": 8.0,
            "stirrup_spacing_mm": 200.0, "stirrup_legs": 2,
            "top": { "count": 2, "diameter_mm": 12.0 },
            "bottom": { "count": 3, "diameter_mm": 16.0 }
        },
        "reinforcement_zones": serde_json::to_value(liggerzones()).expect("zones serialiseren"),
        "length_m": 6.0,
        "forces_envelope": punten,
        "design_situation": "PersistentTransient",
        "steel_branch": "Horizontal"
    })
}

fn reken_dekkingslijn() -> DekkingslijnAntwoord {
    let verzoek: DekkingslijnVerzoek = serde_json::from_value(serde_json::json!({
        "beam": liggerinvoer(),
    }))
    .expect("het dekkingslijnverzoek moet geldig zijn");
    dekkingslijn(verzoek).expect("de rekenkern moet deze dekkingslijn kunnen leveren")
}

/// Het toetsresultaat van de kolom: de art. 5.8- en art. 9.5-toetsen die
/// `column_check` heeft geleverd, in het contract van de betontoetsing.
fn kolomresultaat(kolom: &ConcreteColumnCheckResponse) -> ConcreteBeamCheckResult {
    ConcreteBeamCheckResult {
        beam_id: 1,
        section_name: "300 x 300".into(),
        shape_assumptions: Vec::new(),
        concrete_class: "C30/37".into(),
        reinforcement_grade: "B500B".into(),
        reinforcement_summary: "onder 4Ø20, boven 4Ø20, beugel Ø8, dekking 35 mm".into(),
        a_s_bottom_mm2: 1256.6,
        a_s_top_mm2: 1256.6,
        d_mm: 245.0,
        f_cd_mpa: 20.0,
        f_yd_mpa: 435.0,
        checks: kolom.checks.clone(),
        uc_max: 1.0,
        status: CheckStatus::NotOk,
        // De poort is hier de maatgevende toets, zodat de afleiding óók via het
        // gewone per-staaf-blok in beeld komt.
        niet_uitgevoerd: Vec::new(),
        governing_check_id: concrete_check::SLANKHEIDSGRENS_ID.into(),
        mn_kappa: None,
        interaction_positive: Vec::new(),
        interaction_negative: Vec::new(),
    }
}

/// Het toetsresultaat van de ligger — één momenttoets, zodat er een
/// maatgevende snede is waarvoor de geldende korf kan worden opgezocht.
///
/// De plaats is x = 3000 mm: midden in de zone met 5Ø16, en dus niet de
/// basiskorf van 3Ø16.
fn liggerresultaat() -> ConcreteBeamCheckResult {
    ConcreteBeamCheckResult {
        beam_id: 2,
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
            id: "6.1_bending_stress_block".into(),
            kind: CheckKind::Resistance(ResistanceCalc {
                deelstappen: Vec::new(),
                id: "6.1_bending_stress_block".into(),
                title: "Buiging met normaalkracht".into(),
                article: "art. 6.1".into(),
                force_state: ForceStateSnapshot {
                    combination_id: 1,
                    position_mm: 3000.0,
                    forces: InternalForces {
                        n_ed: 0.0,
                        vy_ed: 0.0,
                        vz_ed: 0.0,
                        mt_ed: 0.0,
                        my_ed: 120.0,
                        mz_ed: 0.0,
                    },
                },
                formula_latex: "UC = M_Ed / M_Rd".into(),
                variables: Vec::new(),
                value: 190.0,
                unit: "kNm".into(),
                uc: Some(UnityCheck {
                    ed: 120.0,
                    rd: 190.0,
                    uc: 0.63,
                    formula_latex: "UC = M_Ed / M_Rd".into(),
                }),
                status: CheckStatus::Ok,
                notes: Vec::new(),
            }),
        }],
        uc_max: 0.63,
        status: CheckStatus::Ok,
        niet_uitgevoerd: Vec::new(),
        governing_check_id: "6.1_bending_stress_block".into(),
        mn_kappa: None,
        interaction_positive: Vec::new(),
        interaction_negative: Vec::new(),
    }
}

/// De scheefstandtekst zoals `scheefstandToelichting` hem opstelt: een kopregel,
/// de tussenwaarden met hun normartikel, de afleiding en een waarschuwing die
/// met "!" begint.
///
/// Letterlijk overgenomen uit de vorm van die functie — niet uit de app zelf,
/// want de rapportkant hoort met een tekst om te kunnen gaan zonder te weten
/// hoe hij is opgebouwd.
const SCHEEFSTAND: &str = "Scheefstand volgens NEN-EN 1993-1-1 art. 5.3.2(3)a (5.5).\n\
\n\
phi_0 = 1/200   [art. 5.3.2(3)a]\n\
    De basiswaarde van de norm.\n\
alpha_h = 0,667   [art. 5.3.2(3)a]\n\
    2/sqrt(h) met h = 9,000 m, begrensd op 2/3.\n\
alpha_m = 0,866   [art. 5.3.2(3)a]\n\
    sqrt(0,5*(1 + 1/m)) met m = 2.\n\
phi = 1/346   [art. 5.3.2(3)a (5.5)]\n\
    phi_0 * alpha_h * alpha_m.\n\
\n\
h is afgeleid uit de knoopcoordinaten: 9,000 m.\n\
m is afgeleid uit de kolommen: 2.\n\
\n\
! Het 50 %-criterium van art. 5.3.2(3)a op m is niet nagegaan.";

fn invoer(
    beton: Vec<ConcreteBeamCheckResult>,
    lijnen: Vec<DekkingslijnAntwoord>,
    zones: Vec<BetonStaafZones>,
    scheefstand: Option<String>,
) -> ReportInput {
    ReportInput {
        bijlage: Default::default(),
        project_name: "Kolom en dekkingslijn".into(),
        project_number: "RK-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-14".into(),
        taal: Default::default(),
        steel_check_results: Vec::new(),
        timber_check_results: Vec::new(),
        clt_check_results: Vec::new(),
        concrete_check_results: beton,
        stress_check_results: Vec::new(),
        concrete_stiffness_trace: None,
        concrete_dekkingslijnen: lijnen,
        concrete_reinforcement_zones: zones,
        scheefstand_toelichting: scheefstand,
        analyse_toelichting: None,
        wind_toelichting: None,
        plate_results: Vec::new(),
        plate_skipped: Vec::new(),
    }
}

fn volledige_invoer() -> ReportInput {
    let kolom = reken_kolom();
    invoer(
        vec![kolomresultaat(&kolom), liggerresultaat()],
        vec![reken_dekkingslijn()],
        vec![BetonStaafZones {
            beam_id: 2,
            lengte_mm: 6000.0,
            korf: ReinforcementCage {
                cover_mm: 30.0,
                stirrup_diameter_mm: 8.0,
                top: RebarRow { count: 2, diameter_mm: 12.0 },
                bottom: RebarRow { count: 3, diameter_mm: 16.0 },
                ..ReinforcementCage::default()
            },
            zones: liggerzones(),
        }],
        Some(SCHEEFSTAND.to_string()),
    )
}

/// Schrijf de PDF weg zodat het blad met het oog te bekijken is; het pad staat
/// in de uitvoer van `cargo test -- --nocapture`.
fn bewaar(naam: &str, bytes: &[u8]) {
    let pad = std::env::temp_dir().join(format!("openaec_{naam}_{}.pdf", std::process::id()));
    std::fs::write(&pad, bytes).expect("de proef-PDF moet weg te schrijven zijn");
    eprintln!("[{naam}] {} bytes -> {}", bytes.len(), pad.display());
}

// ═══════════════════════════════════════════════════════════════════════
// De proeven
// ═══════════════════════════════════════════════════════════════════════

/// De kern moet de kolom werkelijk hebben doorgerekend; anders bewijst de
/// PDF-proef eronder alleen dat een foutmelding op papier komt.
#[test]
fn de_kern_levert_een_slankheid_voor_de_proefkolom() {
    let k = reken_kolom();
    let lambda = k.lambda.expect("λ hoort bepaald te zijn");
    let lambda_lim = k.lambda_lim.expect("λ_lim hoort bepaald te zijn");
    // l₀ = l bij scharnierend tweezijdig (figuur 5.7 a) en i = h/√12 = 86,6 mm
    // voor een vierkant 300 × 300, dus λ = 5000/86,6 = 57,7.
    assert!(
        (lambda - 57.7).abs() < 0.5,
        "λ = {lambda}, verwacht ongeveer 57,7 (l₀ = 5000 mm, i = h/√12 = 86,6 mm)"
    );
    assert!(lambda_lim > 0.0, "λ_lim = {lambda_lim} moet positief zijn");
    assert!(
        k.phi_ef.is_some(),
        "met een opgegeven φ(∞,t₀) hoort (5.19) een φ_ef op te leveren"
    );
}

/// De dekkingslijn moet punten en bundels dragen; een lege lijn zou het
/// hoofdstuk laten slagen zonder iets te tonen.
#[test]
fn de_kern_levert_een_gevulde_dekkingslijn() {
    let d = reken_dekkingslijn();
    assert!(!d.onder.punten.is_empty(), "de onderwapening hoort punten te hebben");
    assert!(!d.onder.bundels.is_empty(), "de onderwapening hoort bundels te hebben");
    assert!(d.a_l_mm > 0.0, "a_l = {} moet positief zijn", d.a_l_mm);
    assert!(
        !d.a_l_artikel.is_empty(),
        "de vindplaats van a_l hoort meegeleverd te worden"
    );
    assert_eq!(d.steunpunten.len(), 2, "beide staafuiteinden horen een eis te krijgen");
}

/// De vier nieuwe stukken staan werkelijk op papier.
#[test]
fn het_rapport_toont_kolomtoets_dekkingslijn_zones_en_scheefstand() {
    let bytes = generate_report_pdf(volledige_invoer());
    bewaar("rapportaanvulling", &bytes);
    let s = inhoudsstromen(&bytes);

    // 1. De kolomtoets: de kop van het hoofdstuk, de afleiding en de
    //    detailleringseisen.
    eis_erin(&s, "slankheid");
    eis_erin(&s, "kruip");
    eis_erin(&s, "detaillering");
    // De grootheden van de afleiding komen uit `kolom_deelstappen`; zonder de
    // afleiding staan ze nergens.
    eis_erin(&s, "traagheidsstraal");
    // Een eis die de kern NIET kan toetsen, woordelijk uit
    // `niet_getoetste_9_5_eisen`.
    eis_erin(&s, "hoekstaaf");

    // 2. De dekkingslijn: de kop, de drie regels van figuur 9.2 en de
    //    steunpunteis.
    eis_erin(&s, "dekkingslijn");
    eis_erin(&s, "verschuiving");
    eis_erin(&s, "bundel");
    eis_erin(&s, "steunpunten");

    // 3. De wapeningszones en de korf op de maatgevende snede.
    eis_erin(&s, "Wapeningszones");
    // De maatgevende snede ligt op x = 3000 mm, in de zone met 5Ø16 — de
    // basiskorf van 3Ø16 geldt daar juist NIET.
    eis_erin(&s, "5Ø16");

    // 4. De scheefstand bij de uitgangspunten, met de tussenwaarden en het
    //    normartikel uit de tekst zelf.
    eis_erin(&s, "Uitgangspunten");
    eis_erin(&s, "Scheefstand");
    eis_erin(&s, "alpha_h");
    eis_erin(&s, "criterium");
}

/// Zonder die gegevens blijven de hoofdstukken weg — en het rapport is dan ook
/// merkbaar kleiner.
#[test]
fn zonder_de_gegevens_blijven_de_hoofdstukken_weg() {
    let vol = volledige_invoer();
    let kaal = invoer(vec![liggerresultaat()], Vec::new(), Vec::new(), None);

    assert!(
        !betonkolom::van_toepassing(&kaal),
        "een rapport zonder art. 5.8-toets hoort geen kolomhoofdstuk te krijgen"
    );
    assert!(
        !betondekking::van_toepassing(&kaal),
        "zonder dekkingslijn hoort er geen dekkingshoofdstuk te staan"
    );
    assert!(betonkolom::van_toepassing(&vol));
    assert!(betondekking::van_toepassing(&vol));

    let bytes_vol = generate_report_pdf(vol);
    let bytes_kaal = generate_report_pdf(kaal);
    assert!(
        bytes_kaal.len() < bytes_vol.len(),
        "het kale rapport ({} bytes) hoort kleiner te zijn dan het volledige ({} bytes)",
        bytes_kaal.len(),
        bytes_vol.len()
    );

    let s = inhoudsstromen(&bytes_kaal);
    eis_niet_erin(&s, "Wapeningszones");
    eis_niet_erin(&s, "Uitgangspunten");
    eis_niet_erin(&s, "steunpunten");
}

/// De reden bij een toets die NIET van toepassing is, hoort woordelijk op
/// papier te komen — dat is de hele inzet van dit spoor.
///
/// Zonder kolomgegevens weigert de kern art. 5.8 met een reden in `notes`. Het
/// rapport hoort die reden te tonen en niet alleen "n.v.t.".
#[test]
fn een_niet_van_toepassing_zijnde_kolomtoets_draagt_zijn_reden_naar_het_papier() {
    let req: ConcreteColumnCheckRequest = serde_json::from_value(serde_json::json!({
        "beam_id": 1,
        "section": { "b_mm": 300.0, "h_mm": 300.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 35.0, "stirrup_diameter_mm": 8.0,
            "top": { "count": 4, "diameter_mm": 20.0 },
            "bottom": { "count": 4, "diameter_mm": 20.0 }
        },
        "length_m": 5.0,
        // GEEN normaaldruk: art. 5.8 gaat niet over dit element, en de kern
        // zegt dat met zoveel woorden in plaats van te zwijgen.
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 2500.0,
              "forces": { "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": 0.0,
                          "mt_ed": 0.0, "my_ed": 40.0, "mz_ed": 0.0 } }
        ],
        "sls_quasi_permanent_envelope": [],
        "design_situation": "PersistentTransient",
        "steel_branch": "Horizontal",
        "column": {
            "bracing": "Geschoord",
            "buckling_length": { "soort": "Figuur57", "geval": "ScharnierendScharnierend" }
        }
    }))
    .expect("het kolomverzoek moet geldig zijn");
    let uitkomst = column_check(req).expect("de kern hoort dit verzoek te beantwoorden");

    let poort = uitkomst
        .checks
        .iter()
        .find(|c| c.id == concrete_check::SLANKHEIDSGRENS_ID)
        .expect("de poort hoort er te zijn, ook als zij niet van toepassing is");
    let CheckKind::Resistance(c) = &poort.kind else {
        panic!("de poort hoort een weerstandstoets te zijn");
    };
    assert!(
        matches!(c.status, CheckStatus::NotApplicable),
        "zonder normaaldruk hoort art. 5.8 als niet-van-toepassing terug te komen"
    );
    assert!(!c.notes.is_empty(), "en dan MET een reden");

    let mut resultaat = kolomresultaat(&uitkomst);
    resultaat.checks = uitkomst.checks.clone();
    let bytes = generate_report_pdf(invoer(vec![resultaat], Vec::new(), Vec::new(), None));
    let s = inhoudsstromen(&bytes);
    // Uit de reden zelf: "§5.8 gaat over op DRUK belaste elementen …".
    eis_erin(&s, "belaste");
    eis_erin(&s, "knikgeval");
}

/// De kolominvoer die de kern KREEG, hoort in de figuurgegevens niet te
/// veranderen: `kolomkorf` en het verzoek beschrijven dezelfde korf, en gaan ze
/// uiteen lopen dan meet de test hierboven iets anders dan hij denkt.
#[test]
fn de_proefkorf_en_het_kolomverzoek_beschrijven_dezelfde_korf() {
    let korf = kolomkorf();
    assert_eq!(korf.top.count, 4);
    assert_eq!(korf.bottom.count, 4);
    assert!((korf.top.diameter_mm - 20.0).abs() < 1e-9);
    assert!((korf.cover_mm - 35.0).abs() < 1e-9);
}
