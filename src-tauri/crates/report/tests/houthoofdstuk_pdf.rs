//! De proef op het houthoofdstuk: staat het er WERKELIJK in?
//!
//! # Waarom deze test er zo uitziet
//!
//! Compileren is niet hetzelfde als drukken, en een `String` in het geheugen is
//! geen bladzijde. `openaec-layout` schrijft tekst via TTF-glyph-encoding, dus
//! woorden zijn niet als bytes in de PDF terug te vinden — maar wél als
//! gliefreeks. Deze test doet daarom hetzelfde als
//! `tests/betonhoofdstuk_pdf.rs`:
//!
//! 1. **Woorden terugzoeken.** De inhoudsstromen van alle bladzijden worden met
//!    `lopdf` uitgepakt; `ttf-parser` vertaalt een woord met dezelfde Liberation
//!    Sans die het rapport insluit naar de reeks glief-nummers waarmee printpdf
//!    het opschrijft.
//! 2. **Verschilmeting.** Hetzelfde rapport zónder kruislaaghout is merkbaar
//!    kleiner en mist precies die woorden.
//! 3. **Toepasselijkheid.** Een zuiver stalen rapport krijgt geen enkel spoor
//!    van het houthoofdstuk.
//! 4. **De geweigerde staaf.** Een opbouw die de kern NIET kan toetsen leverde
//!    op papier een kop met een leeg blad eronder; de reden hoort er te staan.
//!
//! **De getallen komen uit de rekenkern**, niet uit deze test: de opbouw gaat
//! door `timber_check::clt::check_clt_beam`, precies zoals in de app. Alleen de
//! INVOER is gekozen — de lagen, de klimaatklasse en een krachtsomhullende met
//! het momentmaximum in het veld en het dwarskrachtmaximum bij de oplegging.
//!
//! De gemaakte PDF blijft in de tijdelijke map van de test staan zodat het blad
//! met het oog te bekijken is; het pad staat in de uitvoer van
//! `cargo test -- --nocapture`.

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{CheckStatus, ResistanceCalc, UnityCheck};
use nen_en_1995_1_1::clt::{CltLayer, CltLayerOrientation, CltLayup};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use report::{generate_report_pdf, houthoofdstuk, ReportInput};
use steel_check::result::{BeamCheckResult, CheckKind, NamedCheck};
use timber_check::clt::{check_clt_beam, CltBeamCheckInput, CltBeamCheckResult};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../fonts/LiberationSans-Bold.ttf");

// ═══════════════════════════════════════════════════════════════════════
// Woorden terugzoeken in de gerenderde PDF
// ═══════════════════════════════════════════════════════════════════════

/// Alle inhoudsstromen van alle bladzijden, uitgepakt en aan elkaar geplakt.
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

/// De hextekst waarmee `woord` in de inhoudsstroom terechtkomt: per teken het
/// glief-nummer als vier hexcijfers.
///
/// Werkt per WOORD, niet per zin: de opmaakmotor knipt een alinea in regels en
/// tekent elke regel als één `Tj`.
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

fn eis_er_niet_in(stroom: &str, woord: &str) {
    assert!(
        !staat_erin(stroom, woord),
        "{woord:?} staat in de PDF terwijl het er niet hoort te staan"
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Testgegevens — de kern rekent, deze test kiest alleen de invoer
// ═══════════════════════════════════════════════════════════════════════

fn punt(x_mm: f64, v_kn: f64, my_knm: f64, n_kn: f64) -> ForcePoint {
    ForcePoint {
        combination_id: 1,
        position_mm: x_mm,
        forces: InternalForces {
            n_ed: n_kn,
            vz_ed: v_kn,
            my_ed: my_knm,
            ..Default::default()
        },
    }
}

/// Een ASYMMETRISCHE opbouw, met opzet.
///
/// Bij een symmetrische opbouw valt de zwaartelijn samen met een gelijkmatig
/// monsterpunt van het τ-verloop en tekent zelfs een gebrekkige bemonstering
/// nog de juiste piek. Hier niet: z_0 ligt tussen twee monsterpunten in, dus
/// het blad laat zien of de figuur en de tabel hetzelfde zeggen.
///
/// De normaalkracht en de korte overspanning zijn er ook met opzet: die halen
/// de twee veiligheidsrelevante meldingen van de kern naar boven ("niet
/// verwerkt" en "L/h < 20").
fn cltstaaf() -> CltBeamCheckResult {
    let layup = CltLayup::new(
        1000.0,
        vec![
            laag(40.0, CltLayerOrientation::Longitudinal, "C24"),
            laag(20.0, CltLayerOrientation::Transverse, "C24"),
            laag(30.0, CltLayerOrientation::Longitudinal, "C24"),
            laag(20.0, CltLayerOrientation::Transverse, "C24"),
            laag(60.0, CltLayerOrientation::Longitudinal, "C24"),
        ],
    );
    check_clt_beam(CltBeamCheckInput {
        beam_id: 1,
        layup,
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        // L/h = 3000/170 = 17,6 < 20 → de kern waarschuwt.
        length_m: 3.0,
        forces_envelope: vec![
            punt(0.0, 12.0, 0.0, -8.0),
            punt(1500.0, 0.0, 14.0, -8.0),
            punt(3000.0, -12.0, 0.0, -8.0),
        ],
        k_cr: 1.0,
        load_sharing: false,
    })
}

fn laag(t: f64, o: CltLayerOrientation, klasse: &str) -> CltLayer {
    CltLayer {
        thickness_mm: t,
        orientation: o,
        strength_class: klasse.to_string(),
    }
}

/// Een opbouw die de kern WEIGERT: de middelste laag heeft een sterkteklasse
/// die niet bestaat. `check_clt_beam` levert dan een foutresultaat zonder
/// toetsen, met de reden in de notities.
fn geweigerde_cltstaaf() -> CltBeamCheckResult {
    let layup = CltLayup::new(
        1000.0,
        vec![
            laag(40.0, CltLayerOrientation::Longitudinal, "C24"),
            laag(20.0, CltLayerOrientation::Transverse, "C24"),
            laag(40.0, CltLayerOrientation::Longitudinal, "D40"),
        ],
    );
    let r = check_clt_beam(CltBeamCheckInput {
        beam_id: 9,
        layup,
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        length_m: 4.0,
        forces_envelope: vec![punt(0.0, 5.0, 0.0, 0.0)],
        k_cr: 1.0,
        load_sharing: false,
    });
    assert!(r.checks.is_empty(), "deze proefstaaf hoort geweigerd te worden");
    r
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
                    forces: InternalForces { n_ed: -120.0, ..Default::default() },
                },
                formula_latex: "N_Rd = A · f_y / g_M0".into(),
                variables: vec![],
                value: 1000.0,
                unit: "kN".into(),
                uc: Some(UnityCheck { ed: 120.0, rd: 1000.0, uc: 0.12, formula_latex: "UC".into() }),
                status: CheckStatus::Ok,
                notes: vec![],
            }),
        }],
        uc_max: 0.12,
        status: CheckStatus::Ok,
        governing_check_id: "comp".into(),
    }
}

fn invoer(clt: Vec<CltBeamCheckResult>) -> ReportInput {
    ReportInput {
        project_name: "Houten vloerveld".into(),
        project_number: "HT-001".into(),
        engineer: "Test Engineer".into(),
        company: "OpenAEC Foundation".into(),
        date: "2026-09-08".into(),
        steel_check_results: vec![staalstaaf()],
        timber_check_results: vec![],
        clt_check_results: clt,
        concrete_check_results: vec![],
        stress_check_results: vec![],
        concrete_stiffness_trace: None,
    }
}

// ═══════════════════════════════════════════════════════════════════════
// De proeven
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn het_houthoofdstuk_staat_woordelijk_in_de_pdf() {
    let r = cltstaaf();
    let met = generate_report_pdf(invoer(vec![r.clone()]));
    let zonder = generate_report_pdf(invoer(vec![]));

    // Meteen wegschrijven, vóór de eerste assertie: als er iets misgaat wil je
    // het blad kunnen bekijken en niet alleen de melding lezen.
    let map = std::path::Path::new(env!("CARGO_TARGET_TMPDIR"));
    let pad = map.join("houthoofdstuk.pdf");
    std::fs::write(&pad, &met).expect("het proefrapport wegschrijven");
    println!("proefrapport: {}", pad.display());

    let stroom = inhoudsstromen(&met);
    let stroom_zonder = inhoudsstromen(&zonder);

    // ── 1. De kop en de indeling van het hoofdstuk ───────────────────────
    for woord in ["Kruislaaghout", "opbouw", "lamel", "bijlage"] {
        eis_erin(&stroom, woord);
    }

    // ── 2. DE OPBOUW VAN I_y — waar het de gebruiker om te doen was ──────
    //
    // Niet alleen de kop, maar de grootheden zelf: de Steiner-term, de
    // E-gewogen kolom en het getal I_ef,net dat vóór dit hoofdstuk NERGENS
    // stond — niet op papier en niet op het scherm.
    for woord in ["Steiner", "zwaartelijn", "vergelijkingsgrootheid"] {
        eis_erin(&stroom, woord);
    }
    let i_ef_tekst = report::betonfiguren::nl(r.layup.i_ef_net_mm4 / 1e6, 1);
    let ei_tekst = report::betonfiguren::nl(r.layup.ei_ef_knm2, 0);
    eis_erin(&stroom, &i_ef_tekst);
    eis_erin(&stroom, &ei_tekst);
    // En de som van de armen: de arm van de onderste lengtelaag is het getal
    // waar de Steiner-term het meest aan hangt.
    let onderste = r.layup.layers.last().expect("de opbouw heeft lagen");
    let arm = (onderste.z_top_mm + onderste.z_bot_mm) / 2.0 - r.layup.z0_mm;
    eis_erin(&stroom, &report::betonfiguren::nl(arm, 1));

    // ── 3. GEEN weerstandsmoment ─────────────────────────────────────────
    //
    // Bewust: er bestaat in deze keten geen weerstandsmoment voor
    // kruislaaghout en er is ook geen definitie voor gekozen. Duikt het
    // symbool ooit op dit blad op — als kolomkop of als formule — dan is het
    // verzonnen. Het hoofdstuk noemt de grootheid daarom met zoveel woorden
    // ("geen weerstandsmoment") en nooit met haar symbool, zodat deze eis
    // niet door de uitleg zelf wordt opgeheven.
    eis_er_niet_in(&stroom, "W_y");
    eis_erin(&stroom, "weerstandsmoment");

    // ── 4. De twee maatgevende punten ────────────────────────────────────
    //
    // σ hoort bij het momentpunt, τ bij het dwarskrachtpunt; dat zijn twee
    // verschillende punten in de omhullende, en het blad hoort dat te zeggen.
    for woord in ["momentpunt", "dwarskrachtpunt", "VERSCHILLENDE"] {
        eis_erin(&stroom, woord);
    }
    // De twee plaatsen staan ook echt op het blad: 1,50 m voor het moment en
    // 0,00 m voor de dwarskracht (de omhullende hierboven).
    eis_erin(&stroom, "1,50");

    // ── 5. De meldingen van de kern, woordelijk ──────────────────────────
    //
    // Twee daarvan zijn veiligheidsrelevant: een normaalkracht die niet is
    // verwerkt, en een plaat die te kort is voor de starre verbinding.
    assert!(
        r.notes.iter().any(|n| n.starts_with("Normaalkracht")),
        "de proefinvoer hoort de N-melding uit te lokken"
    );
    assert!(
        r.notes.iter().any(|n| n.contains("slankheid")),
        "de proefinvoer hoort de L/h-melding uit te lokken"
    );
    for woord in ["Normaalkracht", "slankheid", "Rolschuiving", "k_def"] {
        eis_erin(&stroom, woord);
    }

    // ── 6. Verschilmeting ────────────────────────────────────────────────
    //
    // Zonder kruislaaghout mist het rapport precies die woorden, en is het
    // merkbaar kleiner. Dat laatste is het bewijs dat de figuur écht op de
    // bladzijde belandt en niet in een DrawList die nergens heen gaat.
    for woord in ["Kruislaaghout", "Steiner", "dwarskrachtpunt"] {
        eis_er_niet_in(&stroom_zonder, woord);
    }
    assert!(
        met.len() > zonder.len() + 3_000,
        "het rapport MET kruislaaghout is maar {} bytes groter dan zonder ({} tegen {})",
        met.len() - zonder.len(),
        met.len(),
        zonder.len()
    );
}

/// Een zuiver stalen rapport krijgt geen leeg houthoofdstuk — dezelfde regel
/// als bij beton: "kan dit model dit ooit vullen" laat een hoofdstuk weg.
#[test]
fn een_rapport_zonder_kruislaaghout_krijgt_geen_houthoofdstuk() {
    let leeg = invoer(vec![]);
    assert!(!houthoofdstuk::van_toepassing(&leeg));
    let stroom = inhoudsstromen(&generate_report_pdf(leeg));
    for woord in ["Kruislaaghout", "lamel", "Steiner"] {
        eis_er_niet_in(&stroom, woord);
    }
}

/// EEN STAAF DIE DE KERN WEIGERDE TE TOETSEN.
///
/// Die leverde op papier een kop met een leeg blad eronder, terwijl het scherm
/// de reden wél toont. De reden hoort er te staan, en de tabellen en de figuur
/// horen weg te blijven: er is niets vastgesteld om te tekenen.
#[test]
fn een_geweigerde_staaf_krijgt_zijn_reden_op_papier() {
    let geweigerd = geweigerde_cltstaaf();
    let stroom = inhoudsstromen(&generate_report_pdf(invoer(vec![geweigerd.clone()])));

    // Het hoofdstuk staat er, met de kop van de staaf.
    eis_erin(&stroom, "Kruislaaghout");
    eis_erin(&stroom, "getoetst");

    // En de reden staat erbij, woordelijk zoals de kern hem geeft. Per woord
    // gezocht: de alinea is in regels geknipt en elke regel is een eigen
    // tekenopdracht.
    let reden = geweigerd
        .notes
        .first()
        .expect("een geweigerde staaf draagt zijn reden in de notities");
    for woord in reden
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|w| w.len() >= 6)
    {
        eis_erin(&stroom, woord);
    }

    // De opbouwtabel en de figuur horen NIET op dit blad: over deze staaf is
    // niets vastgesteld. "Steiner" komt alleen in de I_y-tabel voor.
    eis_er_niet_in(&stroom, "Steiner");
}

/// ELK BIJZONDER TEKEN DAT DIT HOOFDSTUK GEBRUIKT MOET EEN GLIEF HEBBEN.
///
/// Een teken zonder glief verdwijnt zonder melding van het blad — dat is
/// precies wat er gebeurde met "◂" (U+25C2), het driehoekje waarmee het scherm
/// de maatgevende laag aanwijst: op papier stond er alleen nog "maatgevend".
/// Het viel op omdat het blad met het oog bekeken werd, en dat is geen
/// bewaking.
///
/// Deze test kijkt de tekens na die het houthoofdstuk en de houtfiguur
/// werkelijk drukken. Wie er een nieuw symbool bij zet, zet het hier ook
/// neer — de lijst is met opzet met de hand bijgehouden, want alleen zo staat
/// er ook bij WAARVOOR een teken gebruikt wordt.
#[test]
fn elk_bijzonder_teken_van_het_houthoofdstuk_heeft_een_glief() {
    for (teken, waarvoor) in [
        ('\u{3b3}', "gamma, in 'bijlage B met γ = 1'"),
        ('\u{3c3}', "sigma, de buigspanning"),
        ('\u{3c4}', "tau, de schuifspanning"),
        ('\u{3a3}', "sigma-som, de somregel van de I_y-tabel"),
        ('\u{b7}', "middelpunt, de scheiding in de gegevensregel"),
        ('\u{b2}', "kwadraat, in kNm² en mm²"),
        ('\u{2074}', "superscript vier, in mm⁴"),
        ('\u{2014}', "kastlijn, het gedachtestreepje in koppen"),
        ('\u{2013}', "half kastlijntje, het bereik 'z 40–60'"),
        ('\u{2212}', "minteken, in de formule (z − z_0)"),
        ('\u{2190}', "linkerpijl, de verwijzing '← maatgevend' in de figuur"),
    ] {
        for (naam, font) in [("regular", FONT_REGULAR), ("bold", FONT_BOLD)] {
            let face = ttf_parser::Face::parse(font, 0).expect("het lettertype moet te lezen zijn");
            assert!(
                face.glyph_index(teken).is_some(),
                "Liberation Sans {naam} heeft geen glief voor U+{:04X} ({waarvoor}) — \
                 zonder glief verdwijnt het teken zonder melding van het blad",
                teken as u32
            );
        }
    }
}

/// De twee hoofdstukken staan naast elkaar zonder elkaar te verdringen: een
/// rapport met beide materialen draagt de koppen van allebei.
#[test]
fn het_houthoofdstuk_verdringt_het_betonhoofdstuk_niet() {
    let mut input = invoer(vec![cltstaaf()]);
    // Geen betontoetsing nodig: een spoor met alleen een overgeslagen staaf
    // maakt het betonhoofdstuk al van toepassing, en dat is genoeg om te zien
    // of de twee elkaar niet in de weg zitten.
    input.concrete_stiffness_trace = Some(report::betonspoor::BetonStijfheidSpoor {
        segment_lengte_mm: 400.0,
        combinaties: vec![],
        overgeslagen: vec![report::betonspoor::OvergeslagenStaaf {
            beam_id: 5,
            reden: "geen wapeningskorf opgegeven".into(),
        }],
        staafdoorsneden: vec![],
    });
    let stroom = inhoudsstromen(&generate_report_pdf(input));
    eis_erin(&stroom, "Kruislaaghout");
    eis_erin(&stroom, "Segmentstijfheden");
}
