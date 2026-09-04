//! Handberekeningen als toetssteen voor de vrije spanningstoets.
//!
//! Elke test rekent de verwachte waarde in het commentaar met de hand voor,
//! zodat de vergelijking niet met de implementatie meeschuift.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use spanning_check::{
    check_all_spanning_beams, check_spanning_beam, Catalogus, Lagenmodel, Rechthoek,
    SpanningBeamCheckInput, SpanningBeamCheckResult, SpanningDoorsnede, SpanningLaag,
};
use steel_check::CheckKind;

fn punt(n_kn: f64, v_kn: f64, m_knm: f64) -> ForcePoint {
    ForcePoint {
        combination_id: 1,
        position_mm: 0.0,
        forces: InternalForces {
            n_ed: n_kn,
            vz_ed: v_kn,
            my_ed: m_knm,
            ..Default::default()
        },
    }
}

fn invoer(section: SpanningDoorsnede, f_toel: f64, env: Vec<ForcePoint>) -> SpanningBeamCheckInput {
    SpanningBeamCheckInput {
        beam_id: 7,
        section,
        material_name: "Proefmateriaal".to_string(),
        f_toel_mpa: f_toel,
        gamma_m: 1.0,
        sigma_z_mpa: 0.0,
        length_m: 4.0,
        forces_envelope: env,
        fiber_count: 41,
    }
}

fn rechthoek(b: f64, h: f64) -> SpanningDoorsnede {
    SpanningDoorsnede::Rechthoek(Rechthoek { b_mm: b, h_mm: h })
}

fn toets<'a>(r: &'a SpanningBeamCheckResult, id: &str) -> &'a nen_en_1993_1_1_section::ResistanceCalc {
    for c in &r.checks {
        if c.id == id {
            let CheckKind::Resistance(res) = &c.kind else { continue };
            return res;
        }
    }
    panic!("toets {id} ontbreekt in {:?}", r.checks.iter().map(|c| &c.id).collect::<Vec<_>>());
}

fn uc(r: &SpanningBeamCheckResult, id: &str) -> f64 {
    toets(r, id).uc.as_ref().expect("elke spanningstoets heeft een UC").uc
}

// ── 1. Rechthoek, zuivere buiging ────────────────────────────────────────
//
// b = 100 mm, h = 300 mm → A = 30 000 mm², I_y = 2,25·10⁸ mm⁴,
// W_el = b·h²/6 = 1,5·10⁶ mm³.
// M_y = 30 kNm → σ = M/W = 30·10⁶ / 1,5·10⁶ = 20,0 N/mm².
// f_toel = 100 → UC = 0,20.
#[test]
fn rechthoek_zuivere_buiging() {
    let r = check_spanning_beam(invoer(rechthoek(100.0, 300.0), 100.0, vec![punt(0.0, 0.0, 30.0)]));
    assert_relative_eq!(r.section.a_mm2, 30_000.0);
    assert_relative_eq!(r.section.iy_mm4, 2.25e8);
    assert_relative_eq!(r.section.wel_bot_mm3, 1.5e6, max_relative = 1e-12);
    assert_relative_eq!(toets(&r, "spanning_normaal").value.abs(), 20.0, max_relative = 1e-12);
    assert_relative_eq!(toets(&r, "spanning_vergelijk").value, 20.0, max_relative = 1e-12);
    assert_relative_eq!(r.uc_max, 0.20, max_relative = 1e-12);
    assert_eq!(r.governing_check_id, "spanning_vergelijk");
    assert_eq!(r.status, nen_en_1993_1_1_section::CheckStatus::Ok);
    // Trek onder: M_y positief geeft trek in de onderste vezel.
    let onder = r.verloop.as_ref().unwrap().vezels.last().unwrap();
    assert_relative_eq!(onder.sigma_x_mpa, 20.0, max_relative = 1e-12);
    let boven = r.verloop.as_ref().unwrap().vezels.first().unwrap();
    assert_relative_eq!(boven.sigma_x_mpa, -20.0, max_relative = 1e-12);
}

// ── 2. Rechthoek, zuivere afschuiving ────────────────────────────────────
//
// τ_max = 1,5·V/A = 1,5·60 000 / 30 000 = 3,00 N/mm² (parabolisch, maximum
// op de zwaartelijn). σ_eq = √3·τ = 5,196 N/mm².
// f_v,d = f_toel/√3 = 57,735 → UC_schuif = 3,00/57,735 = 0,05196, gelijk aan
// UC_eq = 5,196/100.
#[test]
fn rechthoek_zuivere_afschuiving() {
    let r = check_spanning_beam(invoer(rechthoek(100.0, 300.0), 100.0, vec![punt(0.0, 60.0, 0.0)]));
    assert_relative_eq!(toets(&r, "spanning_schuif").value, 3.0, max_relative = 1e-12);
    assert_relative_eq!(
        toets(&r, "spanning_vergelijk").value,
        3f64.sqrt() * 3.0,
        max_relative = 1e-12
    );
    assert_relative_eq!(uc(&r, "spanning_schuif"), 3.0 / (100.0 / 3f64.sqrt()), max_relative = 1e-12);
    assert_relative_eq!(uc(&r, "spanning_vergelijk"), uc(&r, "spanning_schuif"), max_relative = 1e-12);
    // Het maximum ligt op de zwaartelijn (z = 150 mm).
    assert_relative_eq!(r.verloop.as_ref().unwrap().z_maatgevend_mm, 150.0, max_relative = 1e-9);
    // De randvezels zijn schuifspanningsvrij.
    let v = &r.verloop.as_ref().unwrap().vezels;
    assert_relative_eq!(v.first().unwrap().tau_mpa, 0.0, epsilon = 1e-9);
    assert_relative_eq!(v.last().unwrap().tau_mpa, 0.0, epsilon = 1e-9);
}

// ── 3. Rechthoek, N + M + V samen ────────────────────────────────────────
//
// N = 300 kN trek, M_y = 30 kNm, V_z = 60 kN op dezelfde doorsnede.
//   σ_N = 300 000/30 000 = 10,0 N/mm² (overal)
//   σ_M = ±20,0 N/mm² aan de randen
//   τ    = 3,0·(1 − ξ²) met ξ = (z − 150)/150
// Onderste vezel: σ_x = 30,0, τ = 0 → σ_eq = 30,0.
// Zwaartelijn:    σ_x = 10,0, τ = 3,0 → σ_eq = √(100 + 27) = 11,27.
// Het maximum is dus 30,0 N/mm² onderaan; UC = 0,30 bij f_toel = 100.
#[test]
fn rechthoek_normaalkracht_moment_en_dwarskracht() {
    let r = check_spanning_beam(invoer(
        rechthoek(100.0, 300.0),
        100.0,
        vec![punt(300.0, 60.0, 30.0)],
    ));
    assert_relative_eq!(toets(&r, "spanning_vergelijk").value, 30.0, max_relative = 1e-9);
    assert_relative_eq!(r.uc_max, 0.30, max_relative = 1e-9);
    assert_relative_eq!(r.verloop.as_ref().unwrap().z_maatgevend_mm, 300.0, max_relative = 1e-9);
    // Controle van het verloop op de zwaartelijn.
    let mid = r
        .verloop
        .as_ref()
        .unwrap()
        .vezels
        .iter()
        .find(|v| (v.z_mm - 150.0).abs() < 1e-9)
        .expect("de zwaartelijn zit altijd in het verloop");
    assert_relative_eq!(mid.sigma_x_mpa, 10.0, max_relative = 1e-9);
    assert_relative_eq!(mid.tau_mpa, 3.0, max_relative = 1e-9);
    assert_relative_eq!(mid.sigma_eq_mpa, 127f64.sqrt(), max_relative = 1e-9);
}

// ── 4. I-profiel: het maximum ligt op de flens/lijf-overgang ─────────────
//
// IPE 300 (database: A = 5380 mm², I_y = 8,36·10⁷ mm⁴; h = 300, b = 150,
// t_w = 7,1, t_f = 10,7). M_y = 100 kNm, V_z = 100 kN.
//
//   randvezel  z = 300: σ_x = 100·10⁶·150/8,36·10⁷ = 179,43 N/mm², τ = 0
//                       → σ_eq = 179,43
//   overgang   z = 10,7 (lijfzijde, b = 7,1 mm):
//              σ_x = 100·10⁶·(10,7 − 150)/8,36·10⁷ = −166,63 N/mm²
//              S   = 150·10,7·(150 − 5,35) = 232 163 mm³
//              τ   = 100 000·232 163/(8,36·10⁷·7,1) = 39,11 N/mm²
//              → σ_eq = √(166,63² + 3·39,11²) = 179,87 N/mm²
//
// De overgang is dus maatgevend — precies waarom een vergelijkspanning over
// de hele hoogte gerekend wordt en niet alleen in de randvezel.
#[test]
fn ipe300_overgang_flens_lijf_is_maatgevend() {
    let r = check_spanning_beam(invoer(
        SpanningDoorsnede::Catalogus(Catalogus { naam: "IPE 300".to_string() }),
        235.0,
        vec![punt(0.0, 100.0, 100.0)],
    ));
    assert_eq!(r.section.bron, "profieldatabase");
    assert_relative_eq!(r.section.a_mm2, 5380.0, max_relative = 1e-9);
    assert_relative_eq!(r.section.iy_mm4, 8.36e7, max_relative = 1e-9);

    // Randvezel.
    let onder = r.verloop.as_ref().unwrap().vezels.last().unwrap();
    assert_relative_eq!(onder.sigma_x_mpa, 179.43, max_relative = 1e-3);
    assert_relative_eq!(onder.tau_mpa, 0.0, epsilon = 1e-9);

    // Overgang aan de lijfzijde: de vezel op z = 10,7 mm met de kleinste
    // breedte (de grens komt twee keer voor).
    let overgang = r
        .verloop
        .as_ref()
        .unwrap()
        .vezels
        .iter()
        .filter(|v| (v.z_mm - 10.7).abs() < 1e-9)
        .min_by(|a, b| a.breedte_mm.partial_cmp(&b.breedte_mm).unwrap())
        .expect("de flens/lijf-grens hoort in het verloop te staan");
    assert_relative_eq!(overgang.breedte_mm, 7.1, max_relative = 1e-12);
    assert_relative_eq!(overgang.s_mm3, 150.0 * 10.7 * (150.0 - 5.35), max_relative = 1e-9);
    assert_relative_eq!(overgang.tau_mpa, 39.114, max_relative = 1e-3);
    assert_relative_eq!(overgang.sigma_x_mpa, -166.627, max_relative = 1e-4);
    assert_relative_eq!(overgang.sigma_eq_mpa, 179.873, max_relative = 1e-4);

    // En de toets pikt die vezel als maatgevend op.
    assert_relative_eq!(toets(&r, "spanning_vergelijk").value, 179.873, max_relative = 1e-4);
    assert_relative_eq!(r.uc_max, 179.873 / 235.0, max_relative = 1e-4);
    // De doorsnede is symmetrisch, dus beide overgangen (z = 10,7 en
    // z = 289,3 mm) leveren dezelfde vergelijkspanning; welke van de twee als
    // maatgevend uit de bus komt is een kwestie van afrondingsbits.
    let z = r.verloop.as_ref().unwrap().z_maatgevend_mm;
    assert!(
        (z - 10.7).abs() < 1e-6 || (z - 289.3).abs() < 1e-6,
        "maatgevende vezel lag op z = {z} mm, verwacht een flens/lijf-overgang"
    );
}

// ── 5. De dwarsspanning σ_z telt mee ─────────────────────────────────────
//
// Rechthoek 100 × 300, M_y = 75 kNm → σ_x = ±50,0 N/mm² aan de randen.
// Met σ_z = 50 N/mm²:
//   onderste vezel (σ_x = +50): σ_eq = √(2500 − 2500 + 2500) = 50,0
//   bovenste vezel (σ_x = −50): σ_eq = √(2500 + 2500 + 2500) = 86,60
// De trek/druk-combinatie bovenaan is dus maatgevend — precies wat de
// kruisterm −σ_x·σ_z doet.
#[test]
fn dwarsspanning_sigma_z_verschuift_het_maximum() {
    let mut inv = invoer(rechthoek(100.0, 300.0), 200.0, vec![punt(0.0, 0.0, 75.0)]);
    inv.sigma_z_mpa = 50.0;
    let r = check_spanning_beam(inv);
    assert_relative_eq!(toets(&r, "spanning_vergelijk").value, 7500f64.sqrt(), max_relative = 1e-9);
    assert_relative_eq!(r.verloop.as_ref().unwrap().z_maatgevend_mm, 0.0, epsilon = 1e-9);
    assert!(r.notes.iter().any(|n| n.contains("σ_z")), "de aanname hoort in de notities");
    // Zonder σ_z zou het maximum 50,0 zijn en onderaan liggen.
    let zonder = check_spanning_beam(invoer(rechthoek(100.0, 300.0), 200.0, vec![punt(0.0, 0.0, 75.0)]));
    assert_relative_eq!(toets(&zonder, "spanning_vergelijk").value, 50.0, max_relative = 1e-9);
}

// ── 6. De materiaalfactor deelt de toelaatbare spanning ──────────────────
#[test]
fn materiaalfactor_halveert_de_rekenwaarde() {
    let mut inv = invoer(rechthoek(100.0, 300.0), 100.0, vec![punt(0.0, 0.0, 30.0)]);
    inv.gamma_m = 2.0;
    let r = check_spanning_beam(inv);
    assert_relative_eq!(r.f_d_mpa, 50.0, max_relative = 1e-12);
    assert_relative_eq!(r.uc_max, 0.40, max_relative = 1e-12);
}

// ── 7. Envelop met meerdere combinaties: de zwaarste wint ────────────────
#[test]
fn envelop_kiest_de_zwaarste_combinatie() {
    let env = vec![
        punt(0.0, 0.0, 10.0),
        ForcePoint {
            combination_id: 2,
            position_mm: 2000.0,
            forces: InternalForces { my_ed: 45.0, ..Default::default() },
        },
        punt(0.0, 0.0, -20.0),
    ];
    let r = check_spanning_beam(invoer(rechthoek(100.0, 300.0), 100.0, env));
    // 45 kNm / 1,5·10⁶ mm³ = 30,0 N/mm².
    assert_relative_eq!(toets(&r, "spanning_vergelijk").value, 30.0, max_relative = 1e-9);
    let v = r.verloop.as_ref().unwrap();
    assert_eq!(v.combination_id, 2);
    assert_relative_eq!(v.position_mm, 2000.0);
}

// ── 8. Vrij lagenmodel: een T-vorm met een asymmetrische zwaartelijn ─────
//
// Flens 200 × 20 boven, lijf 20 × 180 daaronder (h = 200).
//   A = 4000 + 3600 = 7600 mm²
//   z_c = (4000·10 + 3600·110)/7600 = (40 000 + 396 000)/7600 = 57,3684 mm
//   I = 200·20³/12 + 4000·(10 − 57,3684)²  +  20·180³/12 + 3600·(110 − 57,3684)²
//     = 133 333 + 8 975 069 + 9 720 000 + 9 972 299 = 28 800 702 mm⁴
#[test]
fn vrij_lagenmodel_t_vorm() {
    let d = SpanningDoorsnede::Lagen(Lagenmodel {
        lagen: vec![
            SpanningLaag { z_top_mm: 0.0, z_bot_mm: 20.0, breedte_mm: 200.0 },
            SpanningLaag { z_top_mm: 20.0, z_bot_mm: 200.0, breedte_mm: 20.0 },
        ],
    });
    let r = check_spanning_beam(invoer(d, 100.0, vec![punt(0.0, 0.0, 20.0)]));
    assert_relative_eq!(r.section.a_mm2, 7600.0, max_relative = 1e-12);
    assert_relative_eq!(r.section.z_c_mm, 436_000.0 / 7600.0, max_relative = 1e-12);
    assert_relative_eq!(r.section.iy_mm4, 28_800_702.0, max_relative = 1e-6);
    // Onderste vezel: σ = M·(h − z_c)/I = 20·10⁶·142,632/28 800 702 = 99,05 N/mm².
    let onder = r.verloop.as_ref().unwrap().vezels.last().unwrap();
    assert_relative_eq!(onder.sigma_x_mpa, 99.04, max_relative = 1e-3);
}

// ── 9. Ongeldige invoer wordt gemeld, niet stil weggerekend ──────────────
#[test]
fn onbekend_profiel_levert_een_melding() {
    let r = check_spanning_beam(invoer(
        SpanningDoorsnede::Catalogus(Catalogus { naam: "HEZ 999".to_string() }),
        100.0,
        vec![punt(0.0, 0.0, 10.0)],
    ));
    assert!(r.checks.is_empty());
    assert_eq!(r.status, nen_en_1993_1_1_section::CheckStatus::NotApplicable);
    assert!(r.verloop.is_none());
    assert!(r.notes[0].contains("profieldatabase"), "melding was: {}", r.notes[0]);
}

#[test]
fn niet_positieve_toelaatbare_spanning_wordt_gemeld() {
    let r = check_spanning_beam(invoer(rechthoek(100.0, 300.0), 0.0, vec![punt(0.0, 0.0, 10.0)]));
    assert!(r.checks.is_empty());
    assert!(r.notes[0].contains("toelaatbare spanning"), "melding was: {}", r.notes[0]);
}

// ── 10. Meerdere staven achter elkaar ────────────────────────────────────
#[test]
fn alle_staven_in_een_run() {
    let mut a = invoer(rechthoek(100.0, 300.0), 100.0, vec![punt(0.0, 0.0, 30.0)]);
    a.beam_id = 1;
    let mut b = invoer(rechthoek(100.0, 300.0), 100.0, vec![punt(0.0, 0.0, 60.0)]);
    b.beam_id = 2;
    let uit = check_all_spanning_beams(vec![a, b]);
    assert_eq!(uit.len(), 2);
    assert_relative_eq!(uit[0].uc_max, 0.20, max_relative = 1e-12);
    assert_relative_eq!(uit[1].uc_max, 0.40, max_relative = 1e-12);
}

// ── 11. Het JSON-contract naar de frontend ───────────────────────────────
//
// De doorsnede is een getagde variant; de frontend stuurt hem als
// { "vorm": "Rechthoek", "maten": { … } }. Deze test legt die vorm vast,
// zodat een wijziging in de kern niet stilzwijgend de invoer breekt.
#[test]
fn json_contract_van_de_doorsnede() {
    let json = r#"{
      "beam_id": 3,
      "section": { "vorm": "Rechthoek", "maten": { "b_mm": 100, "h_mm": 300 } },
      "material_name": "Natuursteen",
      "f_toel_mpa": 8,
      "length_m": 2.5,
      "forces_envelope": [
        { "combination_id": 1, "position_mm": 0,
          "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0, "mt_ed": 0, "my_ed": 6, "mz_ed": 0 } }
      ]
    }"#;
    let inv: SpanningBeamCheckInput = serde_json::from_str(json).expect("invoer moet inleesbaar zijn");
    // Weggelaten velden krijgen hun gedocumenteerde standaard.
    assert_relative_eq!(inv.gamma_m, 1.0);
    assert_relative_eq!(inv.sigma_z_mpa, 0.0);
    assert_eq!(inv.fiber_count, 21);
    let r = check_spanning_beam(inv);
    // σ = 6·10⁶/1,5·10⁶ = 4,0 N/mm² → UC = 0,50.
    assert_relative_eq!(r.uc_max, 0.5, max_relative = 1e-12);
    let terug = serde_json::to_value(&r).expect("resultaat moet serialiseerbaar zijn");
    assert_eq!(terug["section"]["bron"], "lagenmodel");
    assert!(terug["verloop"]["vezels"].as_array().unwrap().len() > 10);
}
