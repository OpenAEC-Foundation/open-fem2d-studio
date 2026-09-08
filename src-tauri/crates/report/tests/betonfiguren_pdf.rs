//! De PDF-proef: komen de vier betonfiguren écht door de tekenmotor heen?
//!
//! Compileren is niet hetzelfde als tekenen. Deze test bouwt een echte PDF met
//! alle vier de figuren erop, en controleert dat het bestand met `%PDF` begint,
//! op `%%EOF` eindigt en een plausibele omvang heeft — plus dat diezelfde
//! pagina zónder de figuren merkbaar kleiner is. Dat laatste is het eigenlijke
//! bewijs: de tekenopdrachten belanden in de inhoud van de pagina en niet in
//! een `DrawList` die nergens heen gaat.
//!
//! **De getallen in de figuren worden gerekend, niet verzonnen.** Het
//! M-κ-diagram, de interactiepunten en het EI-verloop komen uit de rekenkern
//! (`concrete_check::mn_kappa` en `concrete_check::segments::segment_stiffness`)
//! voor een balk 300 × 500 in C30/37 met B500B. Alleen de INVOER is gekozen:
//! de afmetingen, de korf en een parabolisch momentverloop over 6 m.
//!
//! De gemaakte PDF wordt in de tijdelijke map van de test weggeschreven, zodat
//! hij bij twijfel met het oog te bekijken is; het pad staat in de uitvoer van
//! `cargo test -- --nocapture`.

use openaec_layout::{
    doc_template::{DocTemplate, RawPage},
    draw::DrawList,
    flowable::Flowable,
    fonts::shared_font_registry,
    frame::Frame,
    page_template::PageTemplate,
    types::{Color, Pt, Rect, A4},
};

use concrete_check::segments::{segment_stiffness, SegmentStiffnessRequest, SegmentStiffnessResponse};
use concrete_check::{mn_kappa, MnKappaRequest, MnKappaResponse};
use nen_en_1992_1_1::section::{ConcreteSection, RebarRow, ReinforcementCage};
use report::betonfiguren::{
    doorsnede_kader, teken_doorsnede, teken_ei_verloop, teken_interactie, teken_mn_kappa,
    Figuurstijl, KADER_EI, KADER_INTERACTIE, KADER_MN_KAPPA, RAPPORT_KLEUREN,
};

const FONT_REGULAR: &[u8] = include_bytes!("../fonts/LiberationSans-Regular.ttf");

/// De proefdoorsnede: 300 × 500, dekking 30, beugel Ø8, onder 3Ø16, boven 2Ø12.
fn proefkorf() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 2, diameter_mm: 12.0 },
        bottom: RebarRow { count: 3, diameter_mm: 16.0 },
        ..ReinforcementCage::default()
    }
}

/// M-κ-diagram en interactiediagram uit de rekenkern, bij N = −200 kN (druk).
fn reken_mn_kappa() -> MnKappaResponse {
    let req: MnKappaRequest = serde_json::from_value(serde_json::json!({
        "section": { "b_mm": 300.0, "h_mm": 500.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0,
            "stirrup_diameter_mm": 8.0,
            "top": { "count": 2, "diameter_mm": 12.0 },
            "bottom": { "count": 3, "diameter_mm": 16.0 }
        },
        "n_ed_kn": -200.0
    }))
    .expect("het verzoek moet geldig zijn");
    mn_kappa(req).expect("de rekenkern moet dit diagram kunnen leveren")
}

/// EI-verloop over 6 m met een parabolisch moment — zo scheurt het middendeel
/// wél en blijven de einden ongescheurd, en toont de figuur waarvoor hij
/// bedoeld is: WAAR de ligger gescheurd is.
///
/// Met opzet in de BGT (`MeanValues`): daar bestaat een ongescheurde tak, en
/// de terugval in stijfheid is dus als STAP te zien. In de UGT laat 5.8.6(5)
/// de betontrek weg — dan ligt ook een niet-gescheurd segment op de lage
/// stijfheid en is de figuur vlak. Beide zijn juist; deze proef laat het geval
/// zien waarin de figuur iets te tonen heeft.
fn reken_ei_verloop() -> SegmentStiffnessResponse {
    let lengte_m = 6.0;
    let n_seg = 15; // 6000 mm / 400 mm
    let m_max = 90.0_f64;
    let krachten: Vec<serde_json::Value> = (0..n_seg)
        .map(|i| {
            let l = lengte_m * 1000.0;
            let x = (i as f64 + 0.5) * l / n_seg as f64;
            let m = m_max * 4.0 * x * (l - x) / (l * l);
            serde_json::json!({ "n_ed_kn": 0.0, "m_ed_knm": m })
        })
        .collect();

    let req: SegmentStiffnessRequest = serde_json::from_value(serde_json::json!({
        "beam_id": 1,
        "section": { "b_mm": 300.0, "h_mm": 500.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0,
            "stirrup_diameter_mm": 8.0,
            "top": { "count": 2, "diameter_mm": 12.0 },
            "bottom": { "count": 3, "diameter_mm": 16.0 }
        },
        "length_m": lengte_m,
        "limit_state": "MeanValues",
        "segment_forces": krachten
    }))
    .expect("het verzoek moet geldig zijn");
    segment_stiffness(req).expect("de rekenkern moet deze stijfheden kunnen leveren")
}

/// Eén A4 met de vier figuren, of — met `met_figuren = false` — dezelfde
/// pagina met alleen het kopje. Het verschil in bestandsgrootte is het bewijs.
fn bouw_pdf(met_figuren: bool) -> (Vec<u8>, usize) {
    let stijl = Figuurstijl::default();
    let mut dl = DrawList::new();

    dl.set_font(&stijl.font, Pt(12.0));
    dl.set_fill_color(Color::rgb(38, 38, 46));
    dl.draw_text(Pt(56.7), Pt(50.0), "Betonfiguren — proefblad");

    if met_figuren {
        let mk = reken_mn_kappa();
        let ei = reken_ei_verloop();
        let doorsnede = ConcreteSection::new(300.0, 500.0);
        let korf = proefkorf();

        // 1. De doorsnede met de wapeningskorf, op de eigen kaderverhouding —
        //    niet in een vierkant geperst.
        let (kw, kh) = doorsnede_kader(&doorsnede);
        let hoogte = 170.0;
        teken_doorsnede(
            &mut dl,
            Rect::new(Pt(56.7), Pt(60.0), Pt(hoogte * kw / kh), Pt(hoogte)),
            &doorsnede,
            &korf,
            &stijl,
        );

        // 2. Het M-κ-diagram met het maatgevende punt bij M_Ed.
        let breedte = 300.0;
        teken_mn_kappa(
            &mut dl,
            Rect::new(
                Pt(250.0),
                Pt(60.0),
                Pt(breedte),
                Pt(breedte * KADER_MN_KAPPA.1 / KADER_MN_KAPPA.0),
            ),
            Some(&mk.diagram),
            Some(0.7 * mk.diagram.m_max_knm),
            &stijl,
        );

        // 3. Het interactiediagram met het rekenpunt en de horizontale snede.
        let breedte = 250.0;
        teken_interactie(
            &mut dl,
            Rect::new(
                Pt(56.7),
                Pt(300.0),
                Pt(breedte),
                Pt(breedte * KADER_INTERACTIE.1 / KADER_INTERACTIE.0),
            ),
            &mk.interaction_positive,
            &mk.interaction_negative,
            Some(-200.0),
            Some(0.7 * mk.diagram.m_max_knm),
            Some(mk.diagram.m_max_knm),
            &stijl,
        );

        // 4. Het EI-verloop langs de staaf.
        let breedte = 482.0;
        teken_ei_verloop(
            &mut dl,
            Rect::new(Pt(56.7), Pt(600.0), Pt(breedte), Pt(breedte * KADER_EI.1 / KADER_EI.0)),
            &ei,
            &stijl,
        );
    }

    let aantal_ops = dl.ops.len();

    let fonts = shared_font_registry();
    {
        let mut reg = fonts.lock().unwrap();
        reg.register_ttf_bytes("LiberationSans-Regular", FONT_REGULAR.to_vec())
            .expect("lettertype registreren");
        reg.register_alias("LiberationSans", "LiberationSans-Regular");
    }

    let mut doc = DocTemplate::new("Betonfiguren proefblad", fonts.clone());
    let frame = Frame::new(Rect::new(Pt(56.7), Pt(56.7), Pt(481.9), Pt(728.5)));
    doc.add_page_template(PageTemplate::new("content", A4, frame));
    doc.add_pre_page(RawPage { page_size: A4, draw_list: dl });

    let leeg: Vec<Box<dyn Flowable>> = Vec::new();
    (doc.build_to_bytes(leeg).expect("de PDF moet gebouwd kunnen worden"), aantal_ops)
}

#[test]
fn de_vier_figuren_komen_door_de_tekenmotor() {
    let (met, ops_met) = bouw_pdf(true);
    let (zonder, ops_zonder) = bouw_pdf(false);

    // Er is daadwerkelijk getekend, en niet zuinig ook: vier figuren met
    // rasters, streeplijnen (die als losse stukjes gaan) en labels.
    assert!(
        ops_met > 500,
        "te weinig tekenopdrachten voor vier figuren: {ops_met} (zonder figuren: {ops_zonder})"
    );

    // Een geldige PDF: de kop, en de eindmarkering.
    assert!(met.starts_with(b"%PDF"), "de uitvoer begint niet met %PDF");
    let staart = &met[met.len().saturating_sub(64)..];
    assert!(
        staart.windows(5).any(|w| w == b"%%EOF"),
        "de uitvoer eindigt niet op %%EOF"
    );

    // Plausibele omvang. De ondergrens is ruim: er zit een ingesloten
    // lettertype in, dus een lege pagina is al tientallen kilobytes. De
    // bovengrens vangt een figuur die per ongeluk duizenden keren wordt
    // getekend.
    assert!(
        met.len() > 20_000 && met.len() < 5_000_000,
        "onwaarschijnlijke bestandsgrootte: {} bytes",
        met.len()
    );

    // HET EIGENLIJKE BEWIJS: dezelfde pagina zonder figuren is merkbaar
    // kleiner. Zou de DrawList nergens heen gaan, dan waren beide even groot.
    let winst = met.len().saturating_sub(zonder.len());
    assert!(
        winst > 3_000,
        "de figuren voegen maar {winst} bytes toe ({} tegen {}); komt de DrawList wel in de pagina terecht?",
        met.len(),
        zonder.len()
    );

    // Leg het blad neer zodat het met het oog te bekijken is.
    let pad = std::path::Path::new(env!("CARGO_TARGET_TMPDIR")).join("betonfiguren-proefblad.pdf");
    std::fs::write(&pad, &met).expect("proefblad wegschrijven");
    println!(
        "proefblad: {} ({} bytes, {ops_met} tekenopdrachten; lege pagina {} bytes)",
        pad.display(),
        met.len(),
        zonder.len()
    );
}

/// De vier tekenfuncties moeten ook overweg kunnen met wat er niet is: geen
/// diagram, geen interactiepunten, geen krachten (ronde 0 van de segmentlus).
/// Ze mogen dan niets tekenen of een melding zetten, maar niet in paniek raken
/// — een rapport dat halverwege afbreekt is erger dan een lege figuur.
#[test]
fn lege_gegevens_leveren_een_lege_figuur_en_geen_paniek() {
    let stijl = Figuurstijl { kleuren: RAPPORT_KLEUREN, font: "LiberationSans-Regular".into() };
    let vlak = Rect::new(Pt(0.0), Pt(0.0), Pt(300.0), Pt(200.0));

    let mut dl = DrawList::new();
    teken_mn_kappa(&mut dl, vlak, None, None, &stijl);
    assert!(!dl.ops.is_empty(), "zelfs een leeg diagram krijgt assen en een melding");

    let mut dl = DrawList::new();
    teken_interactie(&mut dl, vlak, &[], &[], None, None, None, &stijl);
    assert!(!dl.ops.is_empty(), "zelfs een leeg interactiediagram krijgt assen");

    // Ronde 0: de indeling zonder krachten, dus segmenten zonder EI.
    let req: SegmentStiffnessRequest = serde_json::from_value(serde_json::json!({
        "beam_id": 1,
        "section": { "b_mm": 300.0, "h_mm": 500.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0,
            "stirrup_diameter_mm": 8.0,
            "top": { "count": 2, "diameter_mm": 12.0 },
            "bottom": { "count": 3, "diameter_mm": 16.0 }
        },
        "length_m": 6.0
    }))
    .unwrap();
    let ronde0 = segment_stiffness(req).unwrap();
    assert!(!ronde0.has_forces, "zonder krachten is dit ronde 0");
    assert!(ronde0.segments.iter().all(|s| s.ei_knm2.is_none()));
    let mut dl = DrawList::new();
    teken_ei_verloop(&mut dl, vlak, &ronde0, &stijl);
    assert!(!dl.ops.is_empty(), "de assen en de referentielijn staan er ook in ronde 0");

    // Een korf zonder bovenwapening: de d-maat en het bovenlabel horen dan weg
    // te blijven, en de figuur moet gewoon getekend worden.
    let mut korf = proefkorf();
    korf.top = RebarRow { count: 0, diameter_mm: 0.0 };
    let mut dl = DrawList::new();
    teken_doorsnede(&mut dl, vlak, &ConcreteSection::new(300.0, 500.0), &korf, &stijl);
    assert!(!dl.ops.is_empty());
}

/// Een T met een brede meewerkende flens — 2780 × 450, ruim 6 : 1 — moet op
/// ware verhouding in beeld komen en niet als streep in een vierkant kader.
/// Dat is precies het geval waarvoor het kader in de frontend is losgelaten.
#[test]
fn een_brede_t_krijgt_een_kader_op_ware_verhouding() {
    let breed = ConcreteSection::tee(2780.0, 120.0, 300.0, 450.0).unwrap();
    let (kw, kh) = doorsnede_kader(&breed);
    let balk = ConcreteSection::new(300.0, 500.0);
    let (_, kh_balk) = doorsnede_kader(&balk);

    // Het kader van de brede T is duidelijk lager dan dat van de balk; zat het
    // nog op de vierkante bovengrens, dan waren ze gelijk.
    assert!(kh < kh_balk, "kaderhoogte T {kh} tegen balk {kh_balk}");
    // En de doorsnede vult het tekenvlak: de hoogte volgt h/b, met de
    // ondergrens als vangnet.
    let teken_h = kh - 22.0 - 18.0;
    let gewenst = (kw - 30.0 - 34.0) * 450.0 / 2780.0;
    assert!((teken_h - gewenst.max(40.0)).abs() < 1e-4, "tekenvlak {teken_h}, gewenst {gewenst}");

    // En hij is te tekenen zonder dat er iets omvalt.
    let mut dl = DrawList::new();
    let korf = ReinforcementCage {
        cover_mm: 35.0,
        stirrup_diameter_mm: 8.0,
        top: RebarRow { count: 6, diameter_mm: 12.0 },
        bottom: RebarRow { count: 4, diameter_mm: 20.0 },
        ..ReinforcementCage::default()
    };
    korf.validate(&breed).expect("de proefkorf moet in deze T passen");
    teken_doorsnede(
        &mut dl,
        Rect::new(Pt(0.0), Pt(0.0), Pt(480.0), Pt(480.0 * kh / kw)),
        &breed,
        &korf,
        &Figuurstijl::default(),
    );
    assert!(dl.ops.len() > 40, "een T met korf hoort meer dan een paar lijnen op te leveren");
}
