//! Regressietest bij bevinding B4 — kipsteunen tellen alleen mee aan de
//! GEDRUKTE flens.
//!
//! Kip is uitknikken van de gedrukte flens; een steun aan de getrokken flens
//! houdt die knik niet tegen. Welke flens gedrukt is volgt uit het teken van
//! M_y: de kern rekent M_y positief = trek in de onderste vezel (`mechanics`),
//! dus sagging drukt de bovenflens en hogging de onderflens.
//!
//! Tot deze reparatie las `unbraced_length_mm` uitsluitend
//! `top_flange_positions`, met als eerste regel een kortsluiting op "is die
//! vector leeg, dan is L_st de hele staaflengte". `bottom_flange_positions`
//! werd door de frontend wél gevuld (UI-sectie "Kipsteunen onderflens") maar
//! aan de Rust-kant nooit gelezen. Het geval R17 uit de validatiecampagne —
//! bovenflenssteun halverwege, windzuiging met hogging — rekende daardoor met
//! de halve kiplengte en kwam ongeveer 20 % te gunstig uit.
//!
//! Vier gevallen, alle vier op dezelfde staaf: alleen het teken van het moment
//! en de flens waaraan de steun zit, verschillen.
//!
//! | moment  | steun aan  | L_st vóór | L_st na  | wat er mis was            |
//! |---------|------------|-----------|----------|---------------------------|
//! | sagging | bovenflens | 5000      | 5000     | (was al goed)             |
//! | sagging | onderflens | 10 000    | 10 000   | (was al goed)             |
//! | hogging | bovenflens | 5000      | 10 000   | steunde de getrokken flens|
//! | hogging | onderflens | 10 000    | 5000     | steun werd niet gelezen   |

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use steel_check::*;

const L_MM: f64 = 10_000.0;
const M_MAX_KNM: f64 = 150.0;

/// IPE 400 van 10 m onder een paraboolvormige momentenlijn met een top van
/// 150 kNm in het midden en nul aan beide einden, bemonsterd op 21 stations.
///
/// `teken` = +1 levert sagging, −1 dezelfde lijn gespiegeld (hogging).
/// Één kipsteun halverwege, aan de flens die `aan_de_bovenflens` aangeeft.
fn ligger(teken: f64, aan_de_bovenflens: bool) -> BeamCheckResult {
    let envelop: Vec<ForcePoint> = (0..21)
        .map(|i| {
            let x = L_MM * i as f64 / 20.0;
            let my = teken * M_MAX_KNM * 4.0 * (x / L_MM) * (1.0 - x / L_MM);
            ForcePoint {
                combination_id: 1,
                position_mm: x,
                forces: InternalForces { my_ed: my, ..Default::default() },
            }
        })
        .collect();

    let bracing = if aan_de_bovenflens {
        LateralBracing { top_flange_positions: vec![0.5], bottom_flange_positions: vec![] }
    } else {
        LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![0.5] }
    };

    check_beam(BeamCheckInput {
        beam_id: 1,
        profile_name: "IPE 400".to_string(),
        steel_grade: "S235".to_string(),
        length_m: L_MM / 1000.0,
        forces_envelope: envelop,
        lateral_bracing: bracing,
        buckling_length_y_m: 10.0,
        buckling_length_z_m: 10.0,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: 0.0,
        deflection_notes: vec![],
        // q = 8·M_max/L² = 8·150/10² = 12 kN/m ≡ 12 N/mm.
        q_equiv_n_per_mm: 12.0,
        z_a_mm: 200.0,
        custom_section: None,
        staafstand: None,
        staafstand_notities: None,
        staafeinden: None,
        staaf_notities: None,
    })
}

fn tussenwaarde(r: &BeamCheckResult, sym: &str) -> f64 {
    let c = r.checks.iter().find(|c| c.id == "6.3.2_ltb").expect("kiptoets");
    let CheckKind::Stability(s) = &c.kind else { panic!("kip hoort stabiliteit te zijn") };
    s.intermediate_values
        .iter()
        .find(|v| v.symbol == sym)
        .unwrap_or_else(|| panic!("tussenwaarde '{sym}' ontbreekt"))
        .value
}

fn kip_uc(r: &BeamCheckResult) -> f64 {
    let c = r.checks.iter().find(|c| c.id == "6.3.2_ltb").expect("kiptoets");
    let CheckKind::Stability(s) = &c.kind else { unreachable!() };
    s.uc.as_ref().expect("UC").uc
}

#[test]
fn sagging_leest_de_bovenflenssteun() {
    // M_y > 0 → bovenflens gedrukt. De steun halverwege telt: twee velden van
    // 5000 mm. Dit was al goed en moet goed blijven.
    let r = ligger(1.0, true);
    assert_relative_eq!(tussenwaarde(&r, "L_{st}"), 5000.0, max_relative = 1e-9);
}

#[test]
fn sagging_negeert_de_onderflenssteun() {
    // M_y > 0 → bovenflens gedrukt, maar de steun zit aan de ONDERflens.
    // Die steunt de getrokken flens en telt dus niet mee: één veld van
    // 10 000 mm. Dit is tevens de test die "voeg de twee vectoren gewoon
    // samen" uitsluit — dan zou hier 5000 mm uitkomen.
    let r = ligger(1.0, false);
    assert_relative_eq!(tussenwaarde(&r, "L_{st}"), 10_000.0, max_relative = 1e-9);
}

#[test]
fn hogging_negeert_de_bovenflenssteun() {
    // Het geval R17. M_y < 0 → ONDERflens gedrukt, maar de steun zit aan de
    // bovenflens. Vóór de reparatie las de kern die vector toch en kwam op
    // L_st = 5000 mm; correct is 10 000 mm — de gedrukte flens is over de
    // volle lengte ongesteund.
    let goed = ligger(-1.0, true);
    assert_relative_eq!(tussenwaarde(&goed, "L_{st}"), 10_000.0, max_relative = 1e-9);

    // En het maakt uit: met de oude, te korte kiplengte (het sagginggeval,
    // dat wél 5000 mm mag rekenen) valt de UC merkbaar gunstiger uit.
    let te_gunstig = ligger(1.0, true);
    assert!(
        kip_uc(&goed) > kip_uc(&te_gunstig) * 1.1,
        "de ongesteunde gedrukte flens hoort een merkbaar hogere UC te geven: \
         {} tegen {}",
        kip_uc(&goed),
        kip_uc(&te_gunstig)
    );
}

#[test]
fn hogging_leest_de_onderflenssteun() {
    // M_y < 0 → onderflens gedrukt, en daar zit de steun. Twee velden van
    // 5000 mm. Vóór de reparatie werd `bottom_flange_positions` nergens
    // gelezen en kwam hier 10 000 mm uit — te conservatief, maar even fout.
    let r = ligger(-1.0, false);
    assert_relative_eq!(tussenwaarde(&r, "L_{st}"), 5000.0, max_relative = 1e-9);
}

#[test]
fn een_gesteunde_ligger_krijgt_de_l_kip_formule_en_niet_l_st() {
    // NB.NB.4.3, de tegenhanger van het gaffelgeval in tests/kip_ipe330_r16.rs:
    // zodra er een kipsteun IS, ligt elk veld tussen een gaffel en een
    // kipsteun of tussen twee kipsteunen, en geldt L_kip = (1,4 − 0,8·β)·L_st
    // met 1,0 ≤ L_kip/L_st ≤ 1,4.
    //
    // Het gesteunde veld loopt hier van x = 0 tot x = 5000 met eindmomenten 0
    // en ±150 kNm, dus β = 0 en L_kip = 1,4·5000 = 7000 mm. Dezelfde 5000 mm
    // tussen twee gaffels zou 5000 mm geven — 40 % korter en een navenant
    // hogere M_cr.
    for r in [ligger(1.0, true), ligger(-1.0, false)] {
        let l_st = tussenwaarde(&r, "L_{st}");
        let l_kip = tussenwaarde(&r, "L_{kip}");
        let beta = tussenwaarde(&r, r"\beta");
        assert_relative_eq!(l_st, 5000.0, max_relative = 1e-9);
        assert_relative_eq!(beta, 0.0, epsilon = 1e-12);
        assert_relative_eq!(l_kip, 7000.0, max_relative = 1e-9);
        let verwacht = ((1.4 - 0.8 * beta).clamp(1.0, 1.4)) * l_st;
        assert_relative_eq!(l_kip, verwacht, max_relative = 1e-12);
    }

    // Het ongesteunde geval daarentegen ligt tussen twee gaffels: L_kip = L_st.
    let ongesteund = ligger(-1.0, true);
    assert_relative_eq!(tussenwaarde(&ongesteund, "L_{kip}"), 10_000.0, max_relative = 1e-9);
    assert_relative_eq!(tussenwaarde(&ongesteund, "L_{st}"), 10_000.0, max_relative = 1e-9);
}

// ── De doorgaande ligger: hogging én sagging op één staaf ──────────────────

/// IPE 330 van 9 m onder q = 16 N/mm met twee gelijke eindmomenten `m_eind`
/// (negatief = hogging boven de steunpunten), en bovenflenssteunen op de
/// kwartpunten. M(x) = m_eind + q·x·(L − x)/2, bemonsterd op 21 stations —
/// die vallen op veelvouden van 450 mm, dus precies op 2250, 4500 en 6750.
fn doorgaande_ligger(m_eind_knm: f64) -> BeamCheckResult {
    doorgaande_ligger_met(m_eind_knm, vec![0.25, 0.5, 0.75], vec![])
}

fn doorgaande_ligger_met(m_eind_knm: f64, top: Vec<f64>, bot: Vec<f64>) -> BeamCheckResult {
    const L: f64 = 9000.0;
    const Q: f64 = 16.0; // N/mm ≡ kN/m; q·L²/8 = 162 kNm
    let envelop: Vec<ForcePoint> = (0..21)
        .map(|i| {
            let x = L * i as f64 / 20.0;
            let my = m_eind_knm + Q * (x / 1000.0) * ((L - x) / 1000.0) / 2.0;
            ForcePoint {
                combination_id: 1,
                position_mm: x,
                forces: InternalForces { my_ed: my, ..Default::default() },
            }
        })
        .collect();

    check_beam(BeamCheckInput {
        beam_id: 1,
        profile_name: "IPE 330".to_string(),
        steel_grade: "S235".to_string(),
        length_m: L / 1000.0,
        forces_envelope: envelop,
        lateral_bracing: LateralBracing {
            top_flange_positions: top,
            bottom_flange_positions: bot,
        },
        buckling_length_y_m: L / 1000.0,
        buckling_length_z_m: L / 1000.0,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: 0.0,
        deflection_notes: vec![],
        q_equiv_n_per_mm: Q,
        z_a_mm: 165.0,
        custom_section: None,
        staafstand: None,
        staafstand_notities: None,
        staafeinden: None,
        staaf_notities: None,
    })
}

#[test]
fn de_gedrukte_flens_wordt_per_steun_gekozen_en_niet_voor_de_hele_staaf() {
    // De reparatie van B4 koos de kipsteunvector één keer voor de hele staaf,
    // op het teken van het MAATGEVENDE moment. Bij een doorgaande ligger met
    // hogging boven de steunpunten en sagging in het veld springt die keuze
    // zodra |M_hogging| het |M_sagging| passeert — een lastverandering van
    // ruim één procent gooit dan in één klap álle bovenflenssteunen weg.
    //
    // Twee liggers, uitsluitend verschillend in het eindmoment, met de
    // omslag ertussen:
    //   m_eind = −75 → veld +87, sagging maatgevend (87 > 75);
    //   m_eind = −85 → veld +77, hogging maatgevend (85 > 77).
    // In BEIDE gevallen liggen de drie steunen op de kwartpunten in de
    // saggingzone — M(2250) = m_eind + 121,5 is +46,5 respectievelijk +36,5 —
    // dus in beide gevallen steunen zij de gedrukte flens en gelden zij.
    let sagging_maatgevend = doorgaande_ligger(-75.0);
    let hogging_maatgevend = doorgaande_ligger(-85.0);

    for r in [&sagging_maatgevend, &hogging_maatgevend] {
        assert_relative_eq!(tussenwaarde(r, "L_{st}"), 2250.0, max_relative = 1e-9);
    }

    // En de uitkomst mag over die omslag heen niet springen. Met de oude
    // globale schakelaar ging L_st van 2250 naar 9000 mm en sprong M_b,Rd van
    // 172,97 naar 65,40 kNm — een factor 2,6 op een lastverschil van 13 %.
    let uc_a = kip_uc(&sagging_maatgevend);
    let uc_b = kip_uc(&hogging_maatgevend);
    assert!(
        (uc_a - uc_b).abs() / uc_a.max(uc_b) < 0.2,
        "de kip-UC hoort continu te zijn over de omslag van sagging- naar \
         hogging-maatgevend: {uc_a} tegen {uc_b}"
    );
}

#[test]
fn in_de_hoggingzone_telt_de_onderflenssteun_en_niet_de_bovenflenssteun() {
    // Zelfde ligger met m_eind = −85 kNm. Op x = 0,1·L is het moment
    // M = −85 + 16·0,9·8,1/2 = −26,68 kNm: hogging, dus de ONDERflens is daar
    // gedrukt. Een bovenflenssteun op die plek steunt de getrokken flens en
    // mag geen veldgrens maken; een onderflenssteun op diezelfde plek wel.
    //
    // Dit is de proef op de som van "per steun beslissen": één en dezelfde
    // positie telt wél of niet, afhankelijk van de flens waaraan hij zit én
    // van het moment ter plaatse.
    let alleen_boven = doorgaande_ligger_met(-85.0, vec![0.1], vec![]);
    let alleen_onder = doorgaande_ligger_met(-85.0, vec![], vec![0.1]);

    // Bovenflens in de hoggingzone: geen veldgrens, dus één veld van 9000 mm
    // tussen twee gaffels.
    assert_relative_eq!(tussenwaarde(&alleen_boven, "L_{st}"), 9000.0, max_relative = 1e-9);
    assert_relative_eq!(tussenwaarde(&alleen_boven, "L_{kip}"), 9000.0, max_relative = 1e-9);

    // Onderflens in de hoggingzone: wél een veldgrens op 900 mm. Het
    // maatgevende (laagste M_cr) veld is dan het lange restveld van 8100 mm,
    // en dat ligt tussen een kipsteun en een gaffel, dus geldt de formule met
    // β en NIET meer L_kip = L_st.
    assert_relative_eq!(tussenwaarde(&alleen_onder, "L_{st}"), 8100.0, max_relative = 1e-9);
    let beta = tussenwaarde(&alleen_onder, r"\beta");
    let verwacht_l_kip = (1.4 - 0.8 * beta).clamp(1.0, 1.4) * 8100.0;
    assert_relative_eq!(
        tussenwaarde(&alleen_onder, "L_{kip}"),
        verwacht_l_kip,
        max_relative = 1e-9
    );
}

#[test]
fn een_kipsteun_vlak_naast_een_gaffel_wordt_gemeld_en_niet_stilzwijgend_verwerkt() {
    // NB.NB.4.3 begrenst L_kip/L_st op 1,4 maar niet L_kip tegen L_g. Een
    // steun op 0,1·L laat het restveld van 8100 mm op maximaal 1,4·8100 =
    // 11 340 mm uitkomen — lánger dan de ligger zelf (9000 mm), zodat de
    // steun de berekende weerstand VERLAAGT. Dat is een getrouwe lezing van de
    // norm, dus er wordt niets afgekapt; het rapport hoort het wel te melden.
    let r = doorgaande_ligger_met(-85.0, vec![], vec![0.1]);
    assert!(tussenwaarde(&r, "L_{kip}") > 9000.0);
    let kip = r.checks.iter().find(|c| c.id == "6.3.2_ltb").expect("kiptoets");
    let CheckKind::Stability(s) = &kip.kind else { unreachable!() };
    assert!(
        s.notes.iter().any(|n| n.contains("groter dan de afstand tussen de gaffels")),
        "verwachtte een melding dat L_kip > L_g; genoteerd: {:?}",
        s.notes
    );
}

// ── De flenzen in wereldtermen bij een staande staaf ───────────────────────

/// Dezelfde IPE 400 als [`ligger`], maar met een opgegeven staafstand.
fn ligger_met_stand(teken: f64, stand: Option<mechanics::Staafstand>) -> BeamCheckResult {
    check_beam(invoer_met_stand(teken, stand))
}

/// De kanttekeningen van de bouwer bij de staafstand — bij een naar links
/// hellende staaf dicht bij 75° de waarschuwing dat "boven" daar van bovenvlak
/// naar ondervlak springt — staan letterlijk bij de kiptoets, en alleen daar.
/// Rekenen doen ze niet: dezelfde steun, dezelfde L_st, dezelfde UC.
#[test]
fn staafstandnotities_staan_letterlijk_bij_de_kiptoets_en_rekenen_niet_mee() {
    const PROEF: &str = "Richtingssprong nabij. Proeftekst.";
    for stand in [None, Some(mechanics::Staafstand::Staand)] {
        let zonder = ligger_met_stand(-1.0, stand);
        let mut invoer = invoer_met_stand(-1.0, stand);
        invoer.staafstand_notities = Some(vec![PROEF.to_string()]);
        let met = check_beam(invoer);

        assert_eq!(
            kipnotities(&met).iter().filter(|n| n.as_str() == PROEF).count(),
            1,
            "de kanttekening hoort één keer bij de kiptoets ({stand:?})"
        );
        for c in met.checks.iter().filter(|c| c.id != "6.3.2_ltb") {
            let notes = match &c.kind {
                CheckKind::Resistance(r) => &r.notes,
                CheckKind::Stability(s) => &s.notes,
            };
            assert!(notes.iter().all(|n| n.as_str() != PROEF), "toets {} kreeg de kanttekening ook", c.id);
        }
        assert_relative_eq!(tussenwaarde(&met, "L_{st}"), tussenwaarde(&zonder, "L_{st}"), max_relative = 1e-12);
        assert_relative_eq!(kip_uc(&met), kip_uc(&zonder), max_relative = 1e-12);
        assert_relative_eq!(met.uc_max, zonder.uc_max, max_relative = 1e-12);
    }

    // Een lege lijst is geen kanttekening: hetzelfde resultaat als weglaten.
    let mut leeg = invoer_met_stand(-1.0, None);
    leeg.staafstand_notities = Some(vec![]);
    assert_eq!(kipnotities(&check_beam(leeg)), kipnotities(&ligger_met_stand(-1.0, None)));
}

/// De invoer van [`ligger_met_stand`].
fn invoer_met_stand(teken: f64, stand: Option<mechanics::Staafstand>) -> BeamCheckInput {
    let envelop: Vec<ForcePoint> = (0..21)
        .map(|i| {
            let x = L_MM * i as f64 / 20.0;
            let my = teken * M_MAX_KNM * 4.0 * (x / L_MM) * (1.0 - x / L_MM);
            ForcePoint {
                combination_id: 1,
                position_mm: x,
                forces: InternalForces { my_ed: my, ..Default::default() },
            }
        })
        .collect();
    BeamCheckInput {
        beam_id: 1,
        profile_name: "IPE 400".to_string(),
        steel_grade: "S235".to_string(),
        length_m: L_MM / 1000.0,
        forces_envelope: envelop,
        lateral_bracing: LateralBracing { top_flange_positions: vec![], bottom_flange_positions: vec![0.5] },
        buckling_length_y_m: 10.0,
        buckling_length_z_m: 10.0,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: 0.0,
        deflection_notes: vec![],
        q_equiv_n_per_mm: 12.0,
        z_a_mm: 200.0,
        custom_section: None,
        staafstand: stand,
        staafstand_notities: None,
        staafeinden: None,
        staaf_notities: None,
    }
}

fn kipnotities(r: &BeamCheckResult) -> Vec<String> {
    let c = r.checks.iter().find(|c| c.id == "6.3.2_ltb").expect("kiptoets");
    let CheckKind::Stability(s) = &c.kind else { unreachable!() };
    s.notes.clone()
}

#[test]
fn staande_staaf_noemt_de_gedrukte_flens_in_wereldtermen() {
    // Een kolom van voet naar kop met een negatief moment: in de afleiding is
    // de ONDERflens gedrukt. Lokaal +y staat 90° tegen de klok in vanaf de as,
    // en die as wijst omhoog — dus +y wijst naar LINKS en de onderflens is de
    // RECHTERflens. De kanttekening hoort dat met zoveel woorden te zeggen.
    let staand = ligger_met_stand(-1.0, Some(mechanics::Staafstand::Staand));
    let notities = kipnotities(&staand);
    let zijden = notities
        .iter()
        .find(|n| n.starts_with("Flenzen in wereldtermen"))
        .expect("bij een staande staaf hoort de kiptoets de flenzen in wereldtermen te noemen");
    assert!(zijden.contains("BOVENflens in deze afleiding is de LINKERflens"));
    assert!(zijden.contains("ONDERflens is de RECHTERflens"));

    // Rekenen doet de staafstand niet: dezelfde steun, dezelfde L_st, dezelfde UC.
    let liggend = ligger_met_stand(-1.0, None);
    assert_relative_eq!(tussenwaarde(&staand, "L_{st}"), 5000.0, max_relative = 1e-9);
    assert_relative_eq!(tussenwaarde(&liggend, "L_{st}"), 5000.0, max_relative = 1e-9);
    assert_relative_eq!(kip_uc(&staand), kip_uc(&liggend), max_relative = 1e-12);
    assert_relative_eq!(staand.uc_max, liggend.uc_max, max_relative = 1e-12);
}

#[test]
fn liggende_staaf_krijgt_geen_zijdenkanttekening() {
    // Bij een liggende staaf zijn boven- en onderflens letterlijk; een extra
    // regel zou daar alleen ruis zijn. Weglaten en Liggend opgeven zijn gelijk.
    for stand in [None, Some(mechanics::Staafstand::Liggend)] {
        let r = ligger_met_stand(1.0, stand);
        assert!(kipnotities(&r).iter().all(|n| !n.starts_with("Flenzen in wereldtermen")));
    }
}
