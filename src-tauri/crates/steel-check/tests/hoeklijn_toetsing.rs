//! Hoeklijn — wat er wél en niet getoetst wordt, en of de beperking BIJ de
//! toets staat.
//!
//! Een hoekprofiel is de enige catalogusvorm zonder symmetrieas die met de
//! beschrijvingsassen samenvalt, en NEN-EN 1993-1-1 gaat daar op vier plaatsen
//! anders mee om dan met een I of een U:
//!
//!  * par. 1.7(2) legt de y-as evenwijdig aan het KLEINSTE been en zegt in de
//!    OPMERKING dat de regels van de Eurocode op de HOOFDassen slaan — voor
//!    hoekprofielen u-u en v-v. Kolomknik 6.3.1 hoort daarom met `i_u` en
//!    `i_v` te rekenen.
//!  * tabel 5.2, blad 3 van 3, geeft hoekprofielen alleen een klasse-3-regel.
//!    Klasse 1 of 2 kán dus niet, en de buigingstoetsen draaien elastisch.
//!  * 6.2.6(3) heeft geen rij voor hoekprofielen; A_v valt onder 6.2.6(2) en
//!    moet zelf bepaald worden.
//!  * kip 6.3.2 veronderstelt dubbelsymmetrie in M_cr en mag hier niet draaien;
//!    daarmee vervalt ook 6.3.3.
//!
//! Deze test bewaakt alle vier, én dat de reden of de vervanging in het
//! rapport terechtkomt in plaats van alleen in een commentaarregel.

use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_section::classification::CrossSectionClass;
use nen_en_1993_1_1_section::CheckStatus;
use steel_check::*;

/// Een hoeklijn onder druk plus een klein moment, over `l_m` meter.
fn hoeklijn(naam: &str, l_m: f64, n_kn: f64) -> BeamCheckResult {
    let envelop: Vec<ForcePoint> = (0..11)
        .map(|i| {
            let x_m = l_m * i as f64 / 10.0;
            ForcePoint {
                combination_id: 1,
                position_mm: x_m * 1000.0,
                forces: InternalForces {
                    n_ed: -n_kn,
                    my_ed: 2.0 * x_m * (l_m - x_m) / 2.0,
                    vz_ed: 2.0 * (l_m / 2.0 - x_m),
                    ..Default::default()
                },
            }
        })
        .collect();

    check_beam(BeamCheckInput {
        beam_id: 1,
        profile_name: naam.to_string(),
        steel_grade: "S235".to_string(),
        length_m: l_m,
        forces_envelope: envelop,
        lateral_bracing: LateralBracing {
            top_flange_positions: vec![],
            bottom_flange_positions: vec![],
        },
        buckling_length_y_m: l_m,
        buckling_length_z_m: l_m,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: 0.0,
        deflection_notes: vec![],
        q_equiv_n_per_mm: 2.0,
        z_a_mm: 0.0,
        custom_section: None,
        staafstand: None,
        staafstand_notities: None,
        staafeinden: None,
        staaf_notities: None,
    })
}

fn toets<'a>(r: &'a BeamCheckResult, id: &str) -> &'a NamedCheck {
    r.checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("toets '{id}' ontbreekt"))
}

fn notities<'a>(r: &'a BeamCheckResult, id: &str) -> &'a [String] {
    match &toets(r, id).kind {
        CheckKind::Resistance(c) => &c.notes,
        CheckKind::Stability(c) => &c.notes,
    }
}

fn status(r: &BeamCheckResult, id: &str) -> CheckStatus {
    match &toets(r, id).kind {
        CheckKind::Resistance(c) => c.status,
        CheckKind::Stability(c) => c.status,
    }
}

fn tussenwaarde(r: &BeamCheckResult, id: &str, sym: &str) -> f64 {
    let CheckKind::Stability(s) = &toets(r, id).kind else {
        panic!("{id} hoort een stabiliteitstoets te zijn")
    };
    s.intermediate_values
        .iter()
        .find(|v| v.symbol == sym)
        .unwrap_or_else(|| panic!("tussenwaarde '{sym}' ontbreekt in {id}"))
        .value
}

fn bevat(notities: &[String], stuk: &str) -> bool {
    notities.iter().any(|n| n.contains(stuk))
}

// ── (a) De normaalkrachttoets draait gewoon ─────────────────────────────────

#[test]
fn de_normaalkrachttoets_draait_en_noemt_de_eenbenige_aansluiting() {
    let r = hoeklijn("L 100x100x10", 3.0, 100.0);
    assert_ne!(
        status(&r, "6.2.4_compression"),
        CheckStatus::NotApplicable,
        "6.2.4 hoort gewoon te draaien op een hoekprofiel"
    );
    // 6.2.3(5) verwijst voor een met één been aangesloten hoekprofiel naar
    // EN 1993-1-8 3.10.3; die excentriciteit zit hier niet in en dat moet de
    // lezer bij de toets zien.
    let n = notities(&r, "6.2.4_compression");
    assert!(bevat(n, "1993-1-8 3.10.3"), "genoteerd: {n:?}");
}

// ── (b) Kolomknik om de hoofdassen ──────────────────────────────────────────

#[test]
fn kolomknik_rekent_om_de_hoofdassen_u_en_v() {
    let r = hoeklijn("L 100x100x10", 3.0, 100.0);
    // De symbolen dragen de asnaam: bij een hoekprofiel λ_u/λ_v, niet λ_y/λ_z.
    let i_u = tussenwaarde(&r, "6.3.1_buckling", r"\lambda_u");
    let i_v = tussenwaarde(&r, "6.3.1_buckling", r"\lambda_v");
    // i_v < i_u, dus bij gelijke kniklengte is λ_v de grootste slankheid.
    assert!(i_v > i_u, "λ_v = {i_v} hoort boven λ_u = {i_u} te liggen");

    // En de traagheidsstralen zijn écht i_u en i_v uit de catalogus, niet
    // i_y en i_z. Voor L 100×100×10 is i_y = i_z ≈ 30,4 mm en i_v ≈ 19,4 mm.
    let profiel = steel_profiles::db().find("L 100x100x10").expect("L 100x100x10");
    let p = &profiel.properties;
    let i_v_mm = (p.iv_mm4 / p.area_mm2).sqrt();
    assert!(
        i_v_mm < p.iz_radius_mm,
        "i_v = {i_v_mm:.2} mm hoort onder i_z = {:.2} mm te liggen",
        p.iz_radius_mm
    );
    // λ_v = L_cr / i_v.
    assert!(
        (i_v - 3000.0 / i_v_mm).abs() < 1e-6,
        "λ_v = {i_v} hoort 3000/i_v = {} te zijn",
        3000.0 / i_v_mm
    );

    let n = notities(&r, "6.3.1_buckling");
    assert!(bevat(n, "HOOFDassen u-u en v-v"), "genoteerd: {n:?}");
    assert!(bevat(n, "1.7(2)"), "genoteerd: {n:?}");
}

#[test]
fn knik_om_de_hoofdassen_is_ongunstiger_dan_om_de_eigen_assen() {
    // De vervanging is niet alleen wat de norm eist, het is ook de veilige
    // kant: i_v < i_z, dus N_b,Rd valt lager uit dan met i_z.
    let r = hoeklijn("L 100x100x10", 3.0, 100.0);
    let CheckKind::Stability(knik) = &toets(&r, "6.3.1_buckling").kind else {
        panic!("6.3.1 hoort stabiliteit te zijn")
    };
    let p = &steel_profiles::db().find("L 100x100x10").unwrap().properties;
    let lambda_z = 3000.0 / p.iz_radius_mm;
    let lambda_v = tussenwaarde(&r, "6.3.1_buckling", r"\lambda_v");
    assert!(lambda_v > lambda_z, "λ_v = {lambda_v} tegen λ_z = {lambda_z}");
    // χ daalt met de slankheid, dus de weerstand is lager dan met λ_z.
    assert!(knik.value > 0.0);
}

// ── (c) Kip en 6.3.3 worden geweigerd ───────────────────────────────────────

#[test]
fn kip_en_de_interactietoetsen_worden_geweigerd_met_reden() {
    let r = hoeklijn("L 100x100x10", 3.0, 100.0);
    for id in ["6.3.2_ltb", "6.3.3_eq_6_61", "6.3.3_eq_6_62"] {
        assert_eq!(
            status(&r, id),
            CheckStatus::NotApplicable,
            "{id} hoort op een hoekprofiel geweigerd te worden"
        );
    }
    let n = notities(&r, "6.3.2_ltb");
    assert!(bevat(n, "M_cr veronderstelt dubbelsymmetrie"), "genoteerd: {n:?}");
    let n61 = notities(&r, "6.3.3_eq_6_61");
    assert!(bevat(n61, "M_b,Rd"), "genoteerd: {n61:?}");
}

// ── (d) Buiging: klasse 3, dus elastisch, mét de beperking erbij ────────────

#[test]
fn buiging_draait_elastisch_en_zegt_dat_y_en_z_geen_hoofdassen_zijn() {
    let r = hoeklijn("L 100x100x10", 3.0, 100.0);
    assert_eq!(
        r.classification,
        CrossSectionClass::Class3,
        "tabel 5.2 blad 3 kent hoekprofielen alleen een klasse-3-regel"
    );
    for id in ["6.2.5_bending_y", "6.2.5_bending_z"] {
        assert_ne!(status(&r, id), CheckStatus::NotApplicable, "{id} hoort te draaien");
        let n = notities(&r, id);
        assert!(bevat(n, "geen hoofdassen"), "{id}: {n:?}");
        assert!(bevat(n, "W_el"), "{id}: {n:?}");
    }
    // Elastisch betekent M_c,Rd = W_el·f_y/γ_M0 en niet W_pl.
    let CheckKind::Resistance(m) = &toets(&r, "6.2.5_bending_y").kind else {
        panic!("6.2.5 hoort een weerstandstoets te zijn")
    };
    let p = &steel_profiles::db().find("L 100x100x10").unwrap().properties;
    let el = p.wel_y_mm3 * 235.0 * 1e-6;
    assert!(
        (m.value - el).abs() < 1e-6 * el,
        "M_y,c,Rd = {} kNm, verwacht W_el·f_y = {el} kNm",
        m.value
    );
    assert!(p.wpl_y_mm3 > p.wel_y_mm3, "W_pl hoort groter te zijn — anders zegt de toets niets");
}

// ── (e) Afschuiving onder 6.2.6(2) ──────────────────────────────────────────

#[test]
fn afschuiving_gebruikt_het_been_evenwijdig_aan_de_kracht() {
    let r = hoeklijn("L 200x100x14", 3.0, 100.0);
    let p = &steel_profiles::db().find("L 200x100x14").unwrap().properties;
    // A_v;z = h·t (lange been), A_v;y = b·t (korte been).
    assert!((p.av_z_mm2 - 200.0 * 14.0).abs() < 1e-6, "A_v;z = {}", p.av_z_mm2);
    assert!((p.av_y_mm2 - 100.0 * 14.0).abs() < 1e-6, "A_v;y = {}", p.av_y_mm2);
    for id in ["6.2.6_shear_z", "6.2.6_shear_y"] {
        assert_ne!(status(&r, id), CheckStatus::NotApplicable, "{id} hoort te draaien");
        let n = notities(&r, id);
        assert!(bevat(n, "6.2.6(3) geeft geen uitdrukking"), "{id}: {n:?}");
        assert!(bevat(n, "6.2.6(2)"), "{id}: {n:?}");
    }
}

// ── Regressie: een I-profiel verandert niet ─────────────────────────────────

#[test]
fn een_i_profiel_houdt_zijn_eigen_assen_en_zijn_kiptoets() {
    // De invoering van de hoofdassen mag alleen het hoekprofiel raken. Een
    // IPE 300 hoort nog steeds λ_y/λ_z te tonen en gewoon te kippen.
    let r = hoeklijn("IPE 300", 3.0, 100.0);
    let _ = tussenwaarde(&r, "6.3.1_buckling", r"\lambda_y");
    let _ = tussenwaarde(&r, "6.3.1_buckling", r"\lambda_z");
    assert_ne!(status(&r, "6.3.2_ltb"), CheckStatus::NotApplicable);
    assert!(
        notities(&r, "6.3.1_buckling").iter().all(|n| !n.contains("Hoekprofiel")),
        "een I-profiel hoort geen hoekprofielmelding te krijgen"
    );
    // Klasse 1 of 2 — welke van de twee hangt af van de normaalkracht in deze
    // omhullende; de enige eis hier is dat een I NIET in de klasse-3-tak van
    // het hoekprofiel valt.
    assert!(
        matches!(
            r.classification,
            CrossSectionClass::Class1 | CrossSectionClass::Class2
        ),
        "IPE 300 kwam uit op {:?}",
        r.classification
    );
}
