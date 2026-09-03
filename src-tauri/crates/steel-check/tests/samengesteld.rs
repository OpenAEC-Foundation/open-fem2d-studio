//! D4.3 — toetsingsingang voor een inline (samengestelde) doorsnede.
//!
//! Deze tests bewijzen **beide** kanten van de afspraak:
//!
//! * de toegestane toetsen leveren op de gelaste I uit D4.1 een handrekenbaar
//!   getal — N (6.2.4), V (6.2.6), M_y/M_z (6.2.5), M+N (6.2.9), kolomknik
//!   6.3.1 met de **gelaste** knikkromme, kip 6.3.2 en de doorbuiging;
//! * elke weigering komt daadwerkelijk als `CheckStatus::NotApplicable` terug,
//!   mét de leesbare reden, in plaats van stil door te rekenen naar een getal
//!   dat er goed uitziet.
//!
//! De doorsnede in de meeste tests is de gelaste I uit D4.1:
//! flenzen 200×15, lijf 400×10, h = 430 mm.
//!
//!   A       = 2·200·15 + 400·10                       = 10 000 mm²
//!   I_y     = 2[200·15³/12 + 200·15·207,5²] + 10·400³/12 = 311 783 333 mm⁴
//!   I_z     = 2·15·200³/12 + 400·10³/12               =  20 033 333 mm⁴
//!   W_pl,y  = 2·3000·207,5 + 2·(200·10)·100           =   1 645 000 mm³
//!   A_v,z   = η·h_w·t_w = 1,2·400·10                  =       4800 mm²

use steel_check::*;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_section::{CheckStatus, classification::CrossSectionClass};
use section_properties::SectionProperties;
use approx::assert_relative_eq;

// ── De weigeringsmeldingen, letterlijk ──────────────────────────────────────
//
// Opzettelijk als losse tekst in de test en niet via de constante uit de
// broncode: de melding zelf is onderdeel van de afspraak. Verandert hij, dan
// hoort deze test te breken zodat iemand er bewust naar kijkt.

const MELDING_KIP: &str =
    "kip is voor deze samengestelde doorsnede niet geautomatiseerd (monosymmetrie z_j ontbreekt) \
     — beoordeel handmatig of voorkom kip met kipsteunen";
const MELDING_KLASSE_4: &str =
    "doorsnede is klasse 4; effectieve breedtes zijn niet geïmplementeerd";
const MELDING_INTERACTIE: &str =
    "6.3.3 (6.61/6.62) deelt door M_b,Rd uit de kipcontrole; die is hierboven geweigerd";
const MELDING_GESLOTEN_CEL: &str =
    "de lamellen sluiten een cel, maar er is geen gesloten cel gedeclareerd: I_t is met de open \
     formule ⅓·Σb·t³ bepaald en onderschat de torsiestijfheid daarmee sterk";
const MELDING_VORM: &str =
    "doorsnede is alleen via haar eigenschappen opgegeven; de gedeclareerde vorm is niet aan \
     lamellen getoetst";

// ── Hulpjes ─────────────────────────────────────────────────────────────────

fn lamel(b_mm: f64, t_mm: f64, y_mm: f64, z_mm: f64, staand: bool) -> CustomLamella {
    CustomLamella {
        b_mm,
        t_mm,
        y_mm,
        z_mm,
        alpha_rad: if staand { std::f64::consts::FRAC_PI_2 } else { 0.0 },
    }
}

/// Gelaste I met vrij te kiezen flenzen en lijf; h = h_lijf + 2·t_f.
fn gelaste_i(bf_onder: f64, bf_boven: f64, tf: f64, h_lijf: f64, tw: f64) -> Vec<CustomLamella> {
    let z_flens = (h_lijf + tf) / 2.0;
    vec![
        lamel(bf_onder, tf, 0.0, -z_flens, false),
        lamel(bf_boven, tf, 0.0, z_flens, false),
        lamel(h_lijf, tw, 0.0, 0.0, true),
    ]
}

/// De doorsnede uit D4.1: flenzen 200×15, lijf 400×10, h = 430.
fn doorsnede_d41() -> CustomSection {
    CustomSection {
        naam: "gelaste I 430-200×15-400×10".to_string(),
        lamellen: gelaste_i(200.0, 200.0, 15.0, 400.0, 10.0),
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    }
}

/// Koker 200×200×10 uit vier lamellen, exact de opzet uit D4.1:
/// flenzen 200×10 op z = ±95, lijven 180×10 op y = ±95.
fn koker() -> Vec<CustomLamella> {
    vec![
        lamel(200.0, 10.0, 0.0, 95.0, false),
        lamel(200.0, 10.0, 0.0, -95.0, false),
        lamel(180.0, 10.0, 95.0, 0.0, true),
        lamel(180.0, 10.0, -95.0, 0.0, true),
    ]
}

fn invoer(
    profielnaam: &str,
    custom: Option<CustomSection>,
    n_ed_kn: f64,
    vz_ed_kn: f64,
    my_ed_knm: f64,
) -> BeamCheckInput {
    BeamCheckInput {
        beam_id: 1,
        profile_name: profielnaam.to_string(),
        steel_grade: "S235".to_string(),
        length_m: 6.0,
        forces_envelope: vec![ForcePoint {
            combination_id: 11,
            position_mm: 3000.0,
            forces: InternalForces {
                n_ed: n_ed_kn,
                vy_ed: 0.0,
                vz_ed: vz_ed_kn,
                mt_ed: 0.0,
                my_ed: my_ed_knm,
                mz_ed: 0.0,
            },
        }],
        lateral_bracing: LateralBracing {
            top_flange_positions: vec![],
            bottom_flange_positions: vec![],
        },
        buckling_length_y_m: 6.0,
        buckling_length_z_m: 6.0,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: -12.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: -4.0,
        q_equiv_n_per_mm: 0.0,
        z_a_mm: 0.0,
        custom_section: custom,
    }
}

fn check<'a>(r: &'a BeamCheckResult, id: &str) -> &'a NamedCheck {
    r.checks.iter().find(|c| c.id == id).unwrap_or_else(|| {
        panic!(
            "toets '{id}' ontbreekt; aanwezig: {:?}",
            r.checks.iter().map(|c| c.id.as_str()).collect::<Vec<_>>()
        )
    })
}

fn status_van(c: &NamedCheck) -> CheckStatus {
    match &c.kind {
        CheckKind::Resistance(x) => x.status,
        CheckKind::Stability(x) => x.status,
    }
}

fn uc_van(c: &NamedCheck) -> Option<f64> {
    match &c.kind {
        CheckKind::Resistance(x) => x.uc.as_ref().map(|u| u.uc),
        CheckKind::Stability(x) => x.uc.as_ref().map(|u| u.uc),
    }
}

fn waarde_van(c: &NamedCheck) -> f64 {
    match &c.kind {
        CheckKind::Resistance(x) => x.value,
        CheckKind::Stability(x) => x.value,
    }
}

fn notities_van(c: &NamedCheck) -> Vec<String> {
    match &c.kind {
        CheckKind::Resistance(x) => x.notes.clone(),
        CheckKind::Stability(x) => x.notes.clone(),
    }
}

fn tussenwaarde(c: &NamedCheck, symbool: &str) -> f64 {
    match &c.kind {
        CheckKind::Stability(x) => x
            .intermediate_values
            .iter()
            .find(|v| v.symbol == symbool)
            .unwrap_or_else(|| panic!("tussenwaarde {symbool} ontbreekt"))
            .value,
        CheckKind::Resistance(_) => panic!("{} is geen stabiliteitstoets", c.id),
    }
}

/// De twaalf weerstands- en stabiliteitstoetsen, in de volgorde van de lijst.
const TOETSEN: [&str; 12] = [
    "6.2.4_compression",
    "6.2.5_bending_y",
    "6.2.5_bending_z",
    "6.2.6_shear_z",
    "6.2.6_shear_y",
    "6.2.8_combined_mv",
    "6.2.9_combined_mn",
    "6.2.10_combined_mnv",
    "6.3.1_buckling",
    "6.3.2_ltb",
    "6.3.3_eq_6_61",
    "6.3.3_eq_6_62",
];

// ═══════════════════════════════════════════════════════════════════════════
//  (a) Het inline pad introduceert geen tweede rekenwijze
// ═══════════════════════════════════════════════════════════════════════════

/// Sept 2026 — de kipkromme maakt de twee paden bewust NIET meer identiek.
///
/// Deze test heette en luidde: "inline HEB 300 geeft dezelfde UC als de
/// database", en dwong dat voor álle veertien toetsen af. Sinds de kipkromme
/// uit tabel 6.5 komt (art. 6.3.2.3) geldt dat niet meer voor de drie toetsen
/// die van χ_LT afhangen. Tabel 6.5 heeft twee rijen:
///
///   gewalste I-profielen, h/b ≤ 2 → kromme b → α_LT = 0,34
///   gelaste  I-profielen, h/b ≤ 2 → kromme c → α_LT = 0,49
///
/// HEB 300 heeft h/b = 300/300 = 1,0. Uit de catalogus is hij gewalst en krijgt
/// hij kromme b; inline opgegeven is hij per definitie uit platen samengesteld
/// en krijgt hij kromme c. Dat is dezelfde regel die dit bestand al voor de
/// KOLOMKNIK vastlegt ("een inline doorsnede erft nooit stilzwijgend de
/// gunstiger gewalste kromme", tabel 6.2) — nu ook voor kip.
///
/// Gemeten verschil, vóór → na:
///   6.3.2_ltb      0,552160978 → gewalst 0,552160978 · gelast 0,573902228
///   6.3.3_eq_6_61  0,472378214 → gewalst 0,472378214 · gelast 0,485912280
///   6.3.3_eq_6_62  0,386063500 → gewalst 0,386063500 · gelast 0,394183940
/// Het GEWALSTE (database)pad is dus bit-identiek gebleven; alleen het inline
/// pad wordt strenger. uc_max blijft 0,666 (doorbuiging) en de maatgevende
/// toets blijft dezelfde, dus de conclusie van de test — het inline pad
/// introduceert geen tweede rekenwijze — staat nog steeds overeind: het is
/// dezelfde formule met de doorsnede-eigen tabelrij.
#[test]
fn inline_heb300_wijkt_alleen_af_op_de_kipkromme_van_tabel_6_5() {
    let profiel = steel_profiles::db()
        .find("HEB 300")
        .expect("HEB 300 hoort in de database te staan");

    // Voorwaarde die deze test expliciet vastlegt: het inline pad kiest ALTIJD
    // de gelaste knikkromme (t_f ≤ 40 → b om y, c om z). Voor HEB 300
    // (t_f = 19 mm) valt die samen met de gewalste kromme uit de catalogus, en
    // alleen daarom kunnen de KOLOMKNIK-uitkomsten identiek zijn.
    assert_eq!(profiel.buckling_curves.y_axis, 'b');
    assert_eq!(profiel.buckling_curves.z_axis, 'c');
    assert!(profiel.properties.tf_mm <= 40.0);

    let inline = CustomSection {
        naam: "HEB 300 (inline)".to_string(),
        lamellen: vec![],
        gesloten_cellen: vec![],
        eigenschappen: Some(profiel.properties),
        vorm: CustomDoorsnedevorm::GelasteIDubbelsymmetrisch,
    };

    let uit_db = check_beam(invoer("HEB 300", None, -400.0, -150.0, 220.0));
    let uit_inline = check_beam(invoer("HEB 300", Some(inline), -400.0, -150.0, 220.0));

    assert_eq!(uit_db.classification, uit_inline.classification);
    assert_eq!(uit_db.checks.len(), uit_inline.checks.len());
    assert_eq!(uit_db.governing_check_id, uit_inline.governing_check_id);
    assert_relative_eq!(uit_db.uc_max, uit_inline.uc_max, max_relative = 1e-12);

    // De drie toetsen die door χ_LT lopen; al het andere moet gelijk blijven.
    const VIA_CHI_LT: [&str; 3] = ["6.3.2_ltb", "6.3.3_eq_6_61", "6.3.3_eq_6_62"];

    for (a, b) in uit_db.checks.iter().zip(uit_inline.checks.iter()) {
        assert_eq!(a.id, b.id, "checklijst loopt uit de pas");
        assert_eq!(status_van(a), status_van(b), "status verschilt bij {}", a.id);
        if VIA_CHI_LT.contains(&a.id.as_str()) {
            continue;
        }
        match (uc_van(a), uc_van(b)) {
            (Some(ua), Some(ub)) => {
                assert_relative_eq!(ua, ub, max_relative = 1e-12);
            }
            (None, None) => {}
            _ => panic!("de ene toets heeft wél een UC en de andere niet: {}", a.id),
        }
        assert_relative_eq!(waarde_van(a), waarde_van(b), max_relative = 1e-12);
    }

    // En het verschil is er één van precies één tabelrij: dezelfde M_cr,
    // dezelfde λ_LT, alleen een andere α_LT en daarmee een andere χ_LT.
    for sym in ["M_{cr}", r"\bar{\lambda}_{LT}", "L_{kip}", r"\beta", "B^*"] {
        assert_relative_eq!(
            tussenwaarde(check(&uit_db, "6.3.2_ltb"), sym),
            tussenwaarde(check(&uit_inline, "6.3.2_ltb"), sym),
            max_relative = 1e-12
        );
    }
    assert_relative_eq!(
        tussenwaarde(check(&uit_db, "6.3.2_ltb"), r"\alpha_{LT}"),
        0.34,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        tussenwaarde(check(&uit_inline, "6.3.2_ltb"), r"\alpha_{LT}"),
        0.49,
        max_relative = 1e-12
    );
    assert!(
        uc_van(check(&uit_inline, "6.3.2_ltb")).unwrap()
            > uc_van(check(&uit_db, "6.3.2_ltb")).unwrap(),
        "de gelaste kromme c hoort strenger te zijn dan de gewalste kromme b"
    );

    // Het inline pad meldt wél dat de vorm op een declaratie berust en niet op
    // geometrie — dat mag de uitkomst niet veranderen, maar moet zichtbaar zijn.
    assert!(notities_van(check(&uit_inline, "6.3.2_ltb")).contains(&MELDING_VORM.to_string()));
    assert!(!notities_van(check(&uit_db, "6.3.2_ltb")).contains(&MELDING_VORM.to_string()));

    // De naam waaronder de doorsnede in het rapport komt.
    assert_eq!(uit_db.profile_name, "HEB 300");
    assert_eq!(uit_inline.profile_name, "HEB 300 (inline)");
}

#[test]
fn databasepad_blijft_ongewijzigd() {
    // Regressie: een aanroep zónder custom_section rekent precies zoals
    // voorheen. De UC's worden hier met de handformules uit de *levende*
    // catalogusgegevens nagerekend, zodat de test niet omvalt als de
    // profieldata elders wordt bijgewerkt.
    //
    // Ter vastlegging, gemeten op deze invoer vóór D4.3 (HEB 300, S235,
    // N = −400 kN, V_z = −150 kN, M_y = 220 kNm, L = 6 m, w = −12 mm,
    // w_perm = −4 mm):
    //   6.2.4_compression   0,114236755676139
    //   6.2.5_bending_y     0,500625782227785
    //   6.2.5_bending_z     0,073283337811760
    //   6.2.6_shear_z       0,233487718111242
    //   6.2.8_combined_mv   0,500625782227785
    //   6.3.1_buckling      0,179829267672755
    //   6.3.2_ltb           0,552160978092359
    //   6.3.3_eq_6_61       0,503911636430369
    //   6.3.3_eq_6_62       0,438619204384099
    //   deflection_w_fin    0,666  · deflection_w_add 0,200 · uc_max 0,666
    //
    // Sept 2026, na de kipreparatie: alle negen waarden hierboven staan
    // ONVERANDERD. Nagerekend waarom, want dat is geen toeval:
    //  * β en B* — de envelop heeft één punt (x = 3000), dus beide eindmomenten
    //    van het enige kipveld zijn 220 kNm: β = +1 en B* = +1, precies wat de
    //    oude benadering via M(L_st/4)/M_max ook opleverde.
    //  * L_kip — geen kipsteunen, dus één veld tussen twee gaffels: L_kip =
    //    L_st = 6000 mm. De oude code kwam met β = 1 op dezelfde 6000 mm uit,
    //    omdat (1,4 − 0,8·1) = 0,6 op de ondergrens 1,0 werd afgekapt.
    //  * α_LT — HEB 300 heeft h/b = 1,0 ≤ 2 en is gewalst, dus tabel 6.5 geeft
    //    kromme b en daarmee dezelfde 0,34 die er vast stond.
    // Dit is dus het geval waarin de drie defecten elkaar niet raken; het
    // ijkgeval van de reparatie staat in tests/kip_ipe330_r16.rs.
    let p = steel_profiles::db().find("HEB 300").unwrap().properties;
    let r = check_beam(invoer("HEB 300", None, -400.0, -150.0, 220.0));

    assert_eq!(r.status, CheckStatus::Ok);
    assert_eq!(r.classification, CrossSectionClass::Class1);

    // De checklijst is onveranderd: twaalf toetsen plus twee doorbuigingen,
    // in deze volgorde, en geen enkele D4.3-weigering ertussen.
    let ids: Vec<&str> = r.checks.iter().map(|c| c.id.as_str()).collect();
    let verwacht: Vec<&str> = TOETSEN
        .iter()
        .copied()
        .chain(["deflection_w_fin", "deflection_w_add"])
        .collect();
    assert_eq!(ids, verwacht);
    for id in TOETSEN {
        assert!(uc_van(check(&r, id)).is_some(), "{id} zou een UC moeten hebben");
    }

    // N_c,Rd = A·f_y/γ_M0 en UC = |N_Ed|/N_c,Rd, uit de catalogusgegevens.
    let n_c_rd = p.area_mm2 * 235.0 / 1.0 * 1e-3;
    assert_relative_eq!(
        uc_van(check(&r, "6.2.4_compression")).unwrap(),
        400.0 / n_c_rd,
        max_relative = 1e-12
    );
    // M_c,Rd = W_pl,y·f_y (klasse 1).
    let m_c_rd = p.wpl_y_mm3 * 235.0 * 1e-6;
    assert_relative_eq!(
        uc_van(check(&r, "6.2.5_bending_y")).unwrap(),
        220.0 / m_c_rd,
        max_relative = 1e-12
    );
    // V_pl,Rd = A_v·(f_y/√3).
    let v_pl_rd = p.av_z_mm2 * (235.0 / 3f64.sqrt()) * 1e-3;
    assert_relative_eq!(
        uc_van(check(&r, "6.2.6_shear_z")).unwrap(),
        150.0 / v_pl_rd,
        max_relative = 1e-12
    );
    // De doorbuiging hangt niet van de profieldata af: w_fin = 12 mm op
    // L/333 = 6000/333 = 18,018 mm → 0,666; w_add = 8 mm op L/150 = 40 mm → 0,2.
    assert_relative_eq!(uc_van(check(&r, "deflection_w_fin")).unwrap(), 0.666, max_relative = 1e-12);
    assert_relative_eq!(uc_van(check(&r, "deflection_w_add")).unwrap(), 0.200, max_relative = 1e-12);
    assert_relative_eq!(r.uc_max, 0.666, max_relative = 1e-12);
    assert_eq!(r.governing_check_id, "deflection_w_fin");
}

// ═══════════════════════════════════════════════════════════════════════════
//  (b) De toegestane toetsen op de gelaste I uit D4.1
// ═══════════════════════════════════════════════════════════════════════════

/// Sept 2026 — de marge tot `status == Ok` is met de kipkromme flink gekrompen.
///
/// De doorsnede is een GELASTE I met h = 430 en b = 200, dus h/b = 2,15 > 2.
/// Tabel 6.5 (art. 6.3.2.3) geeft daarvoor kipkromme **d**, tabel 6.3 dus
/// α_LT = 0,76. Voorheen stond α_LT vast op 0,34 — kromme b, die in tabel 6.5
/// alleen voor een GEWALSTE I met h/b ≤ 2 bestaat en voor een gelaste
/// doorsnede in geen enkel geval een rij van de tabel is.
///
/// Gevolg, gemeten (de asserties hieronder over N, M, V, klasse en doorbuiging
/// veranderen geen van alle — die raken χ_LT niet):
///   χ_LT      0,659415 → 0,522901
///   M_b,Rd    254,90   → 202,14 kNm
///   6.3.2_ltb 0,784580 → 0,989411
///   uc_max    0,919959 → 0,996396 (maatgevend blijft 6.3.3 vgl. 6.62)
///
/// De ligger voldoet dus nog, maar met 0,4 % marge in plaats van 8 %. Dat is
/// geen toevalligheid die weggepoetst mag worden: het is de uitkomst van de
/// tabelrij die bij deze doorsnede hoort. Verschuift de profieldata of de
/// digitalisering van de NB-figuren nog een fractie, dan slaat `status` om naar
/// `NotOk` — en dan is dát het juiste antwoord, geen regressie.
#[test]
fn gelaste_i_levert_handrekenbare_uc_voor_n_v_en_m() {
    // N = 500 kN druk, V_z = 150 kN, M_y = 200 kNm.
    let r = check_beam(invoer("", Some(doorsnede_d41()), -500.0, -150.0, 200.0));

    // Lijf c/t = 400/10 = 40 en flensuitkraging c/t = 95/15 = 6,33: klasse 1.
    assert_eq!(r.classification, CrossSectionClass::Class1);
    assert_eq!(r.status, CheckStatus::Ok);
    assert_eq!(r.profile_name, "gelaste I 430-200×15-400×10");

    // 6.2.4  N_Rd = A·f_y/γ_M0 = 10 000·235/1,0 = 2 350 000 N = 2350 kN
    //        UC   = 500/2350 = 0,21277
    let n = check(&r, "6.2.4_compression");
    assert_eq!(status_van(n), CheckStatus::Ok);
    assert_relative_eq!(waarde_van(n), 2350.0, max_relative = 1e-9);
    assert_relative_eq!(uc_van(n).unwrap(), 0.212766, max_relative = 1e-5);

    // 6.2.5  M_pl,Rd = W_pl,y·f_y = 1 645 000·235·1e-6 = 386,575 kNm
    //        UC      = 200/386,575 = 0,51736
    let m = check(&r, "6.2.5_bending_y");
    assert_eq!(status_van(m), CheckStatus::Ok);
    assert_relative_eq!(waarde_van(m), 386.575, max_relative = 1e-4);
    assert_relative_eq!(uc_van(m).unwrap(), 0.517364, max_relative = 1e-5);

    // 6.2.6  A_v,z = η·h_w·t_w = 1,2·400·10 = 4800 mm²
    //        V_pl,Rd = 4800·(235/√3)·1e-3 = 651,25 kN; UC = 150/651,25 = 0,23033
    let v = check(&r, "6.2.6_shear_z");
    assert_eq!(status_van(v), CheckStatus::Ok);
    assert_relative_eq!(waarde_van(v), 651.251, max_relative = 1e-4);
    assert_relative_eq!(uc_van(v).unwrap(), 0.230326, max_relative = 1e-5);

    // 6.2.5 om de z-as: W_pl,z = 310 000 mm³ → M_z,Rd = 72,85 kNm.
    assert_relative_eq!(waarde_van(check(&r, "6.2.5_bending_z")), 72.85, max_relative = 1e-3);

    // 6.2.9  a = (A − 2·b·t_f)/A = (10 000 − 6000)/10 000 = 0,40 en
    //        n = 0,2128 ≤ a, dus géén reductie: UC gelijk aan 6.2.5.
    let mn = check(&r, "6.2.9_combined_mn");
    assert_eq!(status_van(mn), CheckStatus::Ok);
    assert_relative_eq!(uc_van(mn).unwrap(), 0.517364, max_relative = 1e-5);
    assert!(
        notities_van(mn).iter().any(|s| s.contains("a = 0.400")),
        "6.2.9 hoort a = 0,400 te melden; notities: {:?}",
        notities_van(mn)
    );

    // 6.2.8  V_Ed = 150 kN < 0,5·V_pl,Rd = 325,6 kN, dus geen momentreductie.
    assert_relative_eq!(
        uc_van(check(&r, "6.2.8_combined_mv")).unwrap(),
        0.517364,
        max_relative = 1e-5
    );

    // De doorbuigingstoets is puur EI en blijft altijd geldig.
    assert_relative_eq!(uc_van(check(&r, "deflection_w_fin")).unwrap(), 0.666, max_relative = 1e-12);

    // Geen enkele weigering op deze doorsnede.
    for id in TOETSEN {
        assert_ne!(
            status_van(check(&r, id)),
            CheckStatus::NotApplicable,
            "{id} zou hier gewoon moeten rekenen"
        );
    }
    assert!(r.checks.iter().all(|c| c.id != "doorsnede_gesloten_cel"));
}

#[test]
fn gelaste_i_krijgt_kolomknik_met_de_gelaste_knikkromme_b_en_c() {
    let r = check_beam(invoer("", Some(doorsnede_d41()), -500.0, 0.0, 200.0));
    let knik = check(&r, "6.3.1_buckling");
    assert_eq!(status_van(knik), CheckStatus::Ok);

    // i_y = √(I_y/A) = √(311 783 333/10 000) = 176,574 mm
    // i_z = √(I_z/A) = √( 20 033 333/10 000) =  44,759 mm
    // λ_1 = π√(E/f_y) = π√(210 000/235) = 93,913
    // λ̄_y = (6000/176,574)/93,913 = 0,36183
    // λ̄_z = (6000/ 44,759)/93,913 = 1,42741
    assert_relative_eq!(tussenwaarde(knik, r"\bar{\lambda}_y"), 0.361826, max_relative = 1e-4);
    assert_relative_eq!(tussenwaarde(knik, r"\bar{\lambda}_z"), 1.427411, max_relative = 1e-4);

    // Tabel 6.2, **gelaste** I met t_f = 15 mm ≤ 40 mm: kromme b om y-y
    // (α = 0,34) en kromme c om z-z (α = 0,49).
    //   Φ_y = 0,5[1 + 0,34(0,36183 − 0,2) + 0,36183²] = 0,59299
    //   χ_y = 1/(Φ_y + √(Φ_y² − λ̄_y²))               = 0,94095
    //   Φ_z = 0,5[1 + 0,49(1,42741 − 0,2) + 1,42741²] = 1,81941
    //   χ_z = 1/(Φ_z + √(Φ_z² − λ̄_z²))               = 0,33925
    assert_relative_eq!(tussenwaarde(knik, r"\chi_y"), 0.940954, max_relative = 1e-4);
    assert_relative_eq!(tussenwaarde(knik, r"\chi_z"), 0.339245, max_relative = 1e-4);

    // Was stilzwijgend de gewalste kromme b om z-z geërfd, dan stond hier
    // χ_z = 0,37033 — ruim 9% gunstiger. Dat mag niet gebeuren.
    assert!(
        (tussenwaarde(knik, r"\chi_z") - 0.370334).abs() > 1e-3,
        "χ_z komt overeen met knikkromme b: de gewalste kromme is geërfd"
    );

    // N_b,Rd = χ_z·A·f_y/γ_M1 = 0,339245·10 000·235·1e-3 = 797,23 kN
    //   (χ_z is maatgevend, want kleiner dan χ_y)
    // UC     = 500/797,23 = 0,62717
    assert_relative_eq!(waarde_van(knik), 797.23, max_relative = 1e-3);
    assert_relative_eq!(uc_van(knik).unwrap(), 0.627171, max_relative = 1e-4);
}

#[test]
fn flens_dikker_dan_40_mm_krijgt_knikkromme_c_en_d() {
    // Gelaste I met flenzen 200×50 en lijf 400×10 (h = 500).
    //   A   = 2·200·50 + 400·10                            =  24 000 mm²
    //   I_y = 2[200·50³/12 + 200·50·225²] + 10·400³/12      = 1,07·10⁹ mm⁴
    //   I_z = 2·50·200³/12 + 400·10³/12                     = 66 700 000 mm⁴
    //   i_y = 211,148 mm  → λ̄_y = (6000/211,148)/93,913 = 0,30258
    //   i_z =  52,718 mm  → λ̄_z = (6000/ 52,718)/93,913 = 1,21190
    let dikke_flens = CustomSection {
        naam: "gelaste I met dikke flenzen".to_string(),
        lamellen: gelaste_i(200.0, 200.0, 50.0, 400.0, 10.0),
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    };
    let r = check_beam(invoer("", Some(dikke_flens), -500.0, 0.0, 200.0));
    let knik = check(&r, "6.3.1_buckling");

    assert_relative_eq!(tussenwaarde(knik, r"\bar{\lambda}_y"), 0.302579, max_relative = 1e-4);
    assert_relative_eq!(tussenwaarde(knik, r"\bar{\lambda}_z"), 1.211904, max_relative = 1e-4);

    // t_f = 50 mm > 40 mm ⇒ tabel 6.2 schuift op naar kromme c (y-y, α = 0,49)
    // en kromme d (z-z, α = 0,76):
    //   χ_y = 0,94783   (met kromme b zou hier 0,96316 staan)
    //   χ_z = 0,37144   (met kromme c zou hier 0,42813 staan)
    assert_relative_eq!(tussenwaarde(knik, r"\chi_y"), 0.947831, max_relative = 1e-4);
    assert_relative_eq!(tussenwaarde(knik, r"\chi_z"), 0.371441, max_relative = 1e-4);
    assert!((tussenwaarde(knik, r"\chi_z") - 0.428128).abs() > 1e-3);
}

#[test]
fn gelaste_i_krijgt_kip_want_dubbelsymmetrisch() {
    let r = check_beam(invoer("", Some(doorsnede_d41()), 0.0, 0.0, 200.0));
    let kip = check(&r, "6.3.2_ltb");

    assert_ne!(status_van(kip), CheckStatus::NotApplicable);
    let chi_lt = waarde_van(kip);
    assert!(chi_lt > 0.0 && chi_lt <= 1.0, "χ_LT = {chi_lt} is geen reductiefactor");
    assert!(
        !notities_van(kip).contains(&MELDING_KIP.to_string()),
        "kip hoort hier juist wél te draaien"
    );
    // De dubbelsymmetrie volgt uit de lamellen, niet uit een declaratie: dan
    // hoort de melding over een niet-controleerbare vorm er níet te staan.
    assert!(!notities_van(kip).contains(&MELDING_VORM.to_string()));

    // M_b,Rd = χ_LT·W_pl,y·f_y/γ_M1 ≤ M_pl,Rd = 386,575 kNm, dus de kip-UC is
    // nooit gunstiger dan de doorsnedeweerstand van 6.2.5.
    let uc_kip = uc_van(kip).unwrap();
    let uc_doorsnede = uc_van(check(&r, "6.2.5_bending_y")).unwrap();
    assert!(
        uc_kip >= uc_doorsnede - 1e-12,
        "UC kip {uc_kip} < UC doorsnede {uc_doorsnede}"
    );
    assert_relative_eq!(uc_kip, 200.0 / (chi_lt * 386.575), max_relative = 1e-6);

    // Tabel 6.5 (art. 6.3.2.3): gelaste I met h/b = 430/200 = 2,15 > 2 →
    // kipkromme d → tabel 6.3 → α_LT = 0,76. Niet de 0,34 (kromme b) die hier
    // vast stond, en ook niet de 0,49 die bij h/b ≤ 2 zou gelden.
    assert_relative_eq!(tussenwaarde(kip, r"\alpha_{LT}"), 0.76, max_relative = 1e-12);

    // Met kip is 6.3.3 gewoon te rekenen.
    for id in ["6.3.3_eq_6_61", "6.3.3_eq_6_62"] {
        assert!(uc_van(check(&r, id)).is_some(), "{id} hoort hier een UC te hebben");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Weigering (1) — kip op alles behalve een dubbelsymmetrische gelaste I
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn monosymmetrische_gelaste_i_krijgt_geen_kip_maar_wel_een_reden() {
    // Zelfde doorsnede, maar met één flens 200 en één flens 300.
    //   A = 200·15 + 300·15 + 400·10 = 3000 + 4500 + 4000 = 11 500 mm²
    let mono = CustomSection {
        naam: "gelaste I met ongelijke flenzen".to_string(),
        lamellen: gelaste_i(200.0, 300.0, 15.0, 400.0, 10.0),
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    };
    let r = check_beam(invoer("", Some(mono), -500.0, -150.0, 200.0));

    // De kipcontrole staat er wél, maar zonder getal en met de reden.
    let kip = check(&r, "6.3.2_ltb");
    assert_eq!(status_van(kip), CheckStatus::NotApplicable);
    assert!(uc_van(kip).is_none(), "een geweigerde toets mag geen UC hebben");
    assert_eq!(notities_van(kip), vec![MELDING_KIP.to_string()]);

    // 6.3.3 deelt door M_b,Rd en vervalt daarmee ook — mét beide redenen.
    for id in ["6.3.3_eq_6_61", "6.3.3_eq_6_62"] {
        let c = check(&r, id);
        assert_eq!(status_van(c), CheckStatus::NotApplicable);
        assert!(uc_van(c).is_none());
        assert_eq!(
            notities_van(c),
            vec![MELDING_INTERACTIE.to_string(), MELDING_KIP.to_string()]
        );
    }

    // De doorsnedeweerstand rekent gewoon door: N_Rd = 11 500·235·1e-3 = 2702,5 kN.
    let n = check(&r, "6.2.4_compression");
    assert_eq!(status_van(n), CheckStatus::Ok);
    assert_relative_eq!(waarde_van(n), 2702.5, max_relative = 1e-9);
    assert_relative_eq!(uc_van(n).unwrap(), 500.0 / 2702.5, max_relative = 1e-9);
    for id in ["6.2.5_bending_y", "6.2.5_bending_z", "6.2.6_shear_z", "6.2.9_combined_mn"] {
        assert!(uc_van(check(&r, id)).is_some(), "{id} hoort door te rekenen");
    }
    // Kolomknik blijft ook gewoon staan (gelaste kromme, t_f = 15 ≤ 40).
    assert!(uc_van(check(&r, "6.3.1_buckling")).is_some());
}

#[test]
fn koker_krijgt_geen_kip() {
    let cel_gedeclareerd = CustomSection {
        naam: "koker 200×200×10".to_string(),
        lamellen: koker(),
        gesloten_cellen: vec![CustomGeslotenCel {
            // Wandmiddellijn: vierkant 190×190.
            midlijn: vec![
                CustomPunt { y_mm: -95.0, z_mm: -95.0 },
                CustomPunt { y_mm: 95.0, z_mm: -95.0 },
                CustomPunt { y_mm: 95.0, z_mm: 95.0 },
                CustomPunt { y_mm: -95.0, z_mm: 95.0 },
            ],
            dikte_mm: vec![10.0; 4],
            lamellen: vec![0, 1, 2, 3],
        }],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    };
    let r = check_beam(invoer("", Some(cel_gedeclareerd), -500.0, -100.0, 100.0));

    // A = 2·200·10 + 2·180·10 = 7600 mm² → N_Rd = 1786 kN.
    assert_relative_eq!(waarde_van(check(&r, "6.2.4_compression")), 1786.0, max_relative = 1e-9);

    // Een koker is geen gelaste I: kip wordt geweigerd, mét reden.
    let kip = check(&r, "6.3.2_ltb");
    assert_eq!(status_van(kip), CheckStatus::NotApplicable);
    assert_eq!(notities_van(kip), vec![MELDING_KIP.to_string()]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Weigering (2) — klasse 4
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn klasse_4_levert_geen_enkele_weerstands_uc() {
    // Zelfde flenzen, maar een lijf 800×6: c = 815 − 7,5 − 7,5 = 800 mm en
    // c/t = 800/6 = 133,33 > 124ε = 124 ⇒ klasse 4 (D4.2, geval b).
    let klasse4 = CustomSection {
        naam: "gelaste I met slank lijf".to_string(),
        lamellen: gelaste_i(200.0, 200.0, 15.0, 800.0, 6.0),
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    };
    let r = check_beam(invoer("", Some(klasse4), -500.0, -150.0, 200.0));

    assert_eq!(r.classification, CrossSectionClass::Class4);
    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert_eq!(
        r.governing_check_id,
        format!("NIET TOETSBAAR: {MELDING_KLASSE_4}")
    );

    // Geen enkele weerstands- of stabiliteitstoets levert een getal; alle
    // twaalf blijven mét reden in de lijst staan.
    for id in TOETSEN {
        let c = check(&r, id);
        assert_eq!(status_van(c), CheckStatus::NotApplicable, "{id}");
        assert!(uc_van(c).is_none(), "{id} levert toch een UC");
        assert!(
            notities_van(c).contains(&MELDING_KLASSE_4.to_string()),
            "{id} mist de klasse-4-melding: {:?}",
            notities_van(c)
        );
    }

    // Bij dit lijf geldt óók de lijfplooiweigering: h_w/t_w = 800/6 = 133,3
    // tegen de grens 72ε/η = 72/1,2 = 60,0. Beide redenen staan erbij, want
    // een tweede beletsel mag niet achter het eerste verdwijnen.
    let v = check(&r, "6.2.6_shear_z");
    assert_eq!(
        notities_van(v),
        vec![
            MELDING_KLASSE_4.to_string(),
            "lijfplooi onder schuifkracht: h_w/t_w = 133.3 > 72ε/η = 60.0; NEN-EN 1993-1-5 §5 \
             (bijdrage van het lijf en de flenzen aan V_b,Rd) is niet geïmplementeerd"
                .to_string(),
        ]
    );
    // Deze doorsnede is wél dubbelsymmetrisch, dus de kipweigering speelt hier
    // niet mee: bij de kipcontrole staat alleen de klasse-4-reden.
    assert_eq!(
        notities_van(check(&r, "6.3.2_ltb")),
        vec![MELDING_KLASSE_4.to_string()]
    );

    // De doorbuiging is puur EI en blijft wél geldig — dat is de enige toets
    // met een UC.
    assert_relative_eq!(uc_van(check(&r, "deflection_w_fin")).unwrap(), 0.666, max_relative = 1e-12);
    assert_relative_eq!(uc_van(check(&r, "deflection_w_add")).unwrap(), 0.200, max_relative = 1e-12);
    assert_relative_eq!(r.uc_max, 0.666, max_relative = 1e-12);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Weigering (3) — lijfplooi onder schuifkracht
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn slank_lijf_weigert_de_schuiftoets_maar_niet_de_rest() {
    // Flenzen 200×15, lijf 700×10 (h = 730). Lijf c/t = 700/10 = 70:
    //   * klasse: 70 ≤ 72ε = 72 ⇒ klasse 1, dus géén klasse-4-weigering;
    //   * lijfplooi: h_w/t_w = 70,0 > 72ε/η = 72/1,2 = 60,0 ⇒ V vervalt.
    // Zuivere buiging (N = 0), zodat α = 0,5 en ψ = −1 exact uitkomen.
    let slank = CustomSection {
        naam: "gelaste I met slank lijf (klasse 1)".to_string(),
        lamellen: gelaste_i(200.0, 200.0, 15.0, 700.0, 10.0),
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    };
    let r = check_beam(invoer("", Some(slank), 0.0, -200.0, 300.0));

    assert_eq!(r.classification, CrossSectionClass::Class1);

    let melding = "lijfplooi onder schuifkracht: h_w/t_w = 70.0 > 72ε/η = 60.0; \
                   NEN-EN 1993-1-5 §5 (bijdrage van het lijf en de flenzen aan V_b,Rd) \
                   is niet geïmplementeerd";
    for id in ["6.2.6_shear_z", "6.2.8_combined_mv", "6.2.10_combined_mnv"] {
        let c = check(&r, id);
        assert_eq!(status_van(c), CheckStatus::NotApplicable, "{id}");
        assert!(uc_van(c).is_none(), "{id} levert toch een UC");
        assert_eq!(notities_van(c), vec![melding.to_string()], "{id}");
    }

    // De schuiftoets evenwijdig aan de flenzen blijft geldig: die gaat niet
    // over het lijf.
    let vy = check(&r, "6.2.6_shear_y");
    assert_ne!(status_van(vy), CheckStatus::NotApplicable);
    // A_v,y = A − Σ(h_w·t_w) = 13 000 − 7000 = 6000 mm² (de twee flenzen).
    assert_relative_eq!(
        waarde_van(vy),
        6000.0 * (235.0 / 3f64.sqrt()) * 1e-3,
        max_relative = 1e-6
    );

    // Buiging rekent gewoon door:
    //   W_pl,y = 2·(200·15)·357,5 + 2·(350·10)·175 = 2 145 000 + 1 225 000
    //          = 3 370 000 mm³ → M_pl,Rd = 791,95 kNm; UC = 300/791,95 = 0,37881
    let m = check(&r, "6.2.5_bending_y");
    assert_eq!(status_van(m), CheckStatus::Ok);
    assert_relative_eq!(waarde_van(m), 791.95, max_relative = 1e-4);
    assert_relative_eq!(uc_van(m).unwrap(), 0.378812, max_relative = 1e-5);

    // En M+N ook (die gebruikt V_pl,Rd niet).
    assert!(uc_van(check(&r, "6.2.9_combined_mn")).is_some());
    // Kip blijft toegestaan: het is nog steeds een dubbelsymmetrische gelaste I.
    assert!(uc_van(check(&r, "6.3.2_ltb")).is_some());
}

// ═══════════════════════════════════════════════════════════════════════════
//  Weigering (4) — gesloten cel zonder expliciete declaratie
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn ongedeclareerde_gesloten_cel_meldt_onderschatte_torsie() {
    let zonder_declaratie = CustomSection {
        naam: "koker 200×200×10 zonder celdeclaratie".to_string(),
        lamellen: koker(),
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    };
    let r = check_beam(invoer("", Some(zonder_declaratie), -500.0, -100.0, 100.0));

    let melding = check(&r, "doorsnede_gesloten_cel");
    assert_eq!(status_van(melding), CheckStatus::NotApplicable);
    assert!(uc_van(melding).is_none());
    assert_eq!(notities_van(melding), vec![MELDING_GESLOTEN_CEL.to_string()]);

    // Mét declaratie verdwijnt de melding — dan rekent de kern met Bredt.
    let met_declaratie = CustomSection {
        naam: "koker 200×200×10".to_string(),
        lamellen: koker(),
        gesloten_cellen: vec![CustomGeslotenCel {
            midlijn: vec![
                CustomPunt { y_mm: -95.0, z_mm: -95.0 },
                CustomPunt { y_mm: 95.0, z_mm: -95.0 },
                CustomPunt { y_mm: 95.0, z_mm: 95.0 },
                CustomPunt { y_mm: -95.0, z_mm: 95.0 },
            ],
            dikte_mm: vec![10.0; 4],
            lamellen: vec![0, 1, 2, 3],
        }],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    };
    let r2 = check_beam(invoer("", Some(met_declaratie), -500.0, -100.0, 100.0));
    assert!(
        r2.checks.iter().all(|c| c.id != "doorsnede_gesloten_cel"),
        "een gedeclareerde cel hoort geen melding te geven"
    );

    // De gelaste I sluit geen cel: daar hoort de melding er evenmin te staan.
    let r3 = check_beam(invoer("", Some(doorsnede_d41()), -500.0, 0.0, 200.0));
    assert!(r3.checks.iter().all(|c| c.id != "doorsnede_gesloten_cel"));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Onvolledige invoer wordt geweigerd in plaats van geraden
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn eigenschappen_zonder_vormaanduiding_worden_geweigerd() {
    let zonder_vorm = CustomSection {
        naam: "onbekende doorsnede".to_string(),
        lamellen: vec![],
        gesloten_cellen: vec![],
        eigenschappen: Some(SectionProperties {
            area_mm2: 10_000.0,
            iy_mm4: 311_783_333.0,
            iz_mm4: 20_033_333.0,
            wpl_y_mm3: 1_645_000.0,
            ..Default::default()
        }),
        vorm: CustomDoorsnedevorm::Onbekend,
    };
    let r = check_beam(invoer("", Some(zonder_vorm), -500.0, 0.0, 200.0));

    assert_eq!(r.status, CheckStatus::NotApplicable);
    assert!(r.checks.is_empty());
    assert_eq!(
        r.governing_check_id,
        "inline doorsnede zonder lamellen én zonder vormaanduiding kan niet volgens tabel 5.2 \
         worden geklasseerd"
    );

    // En zonder lamellen én zonder eigenschappen al helemaal.
    let leeg = CustomSection {
        naam: "lege doorsnede".to_string(),
        lamellen: vec![],
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::GelasteIDubbelsymmetrisch,
    };
    let r2 = check_beam(invoer("", Some(leeg), -500.0, 0.0, 200.0));
    assert_eq!(r2.status, CheckStatus::NotApplicable);
    assert_eq!(
        r2.governing_check_id,
        "inline doorsnede zonder lamellen en zonder eigenschappen: er valt niets te toetsen"
    );

    // Een onbekende profielnaam blijft de bestaande melding geven.
    let r3 = check_beam(invoer("BESTAAT NIET", None, -500.0, 0.0, 200.0));
    assert_eq!(r3.status, CheckStatus::NotApplicable);
    assert_eq!(r3.governing_check_id, "ERROR: profile BESTAAT NIET not found");
}
