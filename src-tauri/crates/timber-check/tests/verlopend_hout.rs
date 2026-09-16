//! Verlopende houten staaf — analytische proeven (ontwerp 15-09-2026, deel 2).
//!
//! Alle referentiewaarden hieronder zijn met de hand uitgerekend en staan bij
//! de proef zelf, met de formule erbij. Er wordt niets aan de kern ontleend.
//!
//! ── DE HANDBEREKENING ──────────────────────────────────────────────────────
//!
//! Rechthoek b × h(x), b constant, h lineair van h₀ (x = 0) naar h₁ (x = L):
//!   W_y(x) = b·h(x)²/6,  σ_m(x) = |M(x)|·10⁶ / W_y(x)   (M in kNm, W in mm³)
//!   f_m,d  = k_h · k_sys · k_mod · f_m,k / γ_M           (art. 2.4.1 (2.14))
//!   UC     = σ_m,y,d / f_m,y,d                           (art. 6.1.6 (6.11), M_z = 0)
//!
//! Met C24 (f_m,k = 24 N/mm²), klimaatklasse 1, belastingduur "middellang":
//! k_mod = 0,80 (tabel 3.1), γ_M = 1,30 (NB), k_sys = 1,0, en
//!   k_h = min((150/h)^0,2 ; 1,3) voor h < 150 mm, anders 1,0  (art. 3.2(3)).
//! Dus f_m,d = 0,80·24/1,30 = 14,76923 N/mm² bij k_h = 1,0.
//!
//! WAAR LIGT HET MAXIMUM? Uitkrager met een puntlast aan de tip, ingeklemd waar
//! h = h₀: M(u) = M₀·(1 − u) met u = x/L. Met h(u) = h₀·(1 + k·u), k = h₁/h₀ − 1:
//!   σ(u) ∝ (1 − u)/(1 + k·u)²
//!   dσ/du = 0  ⇒  k·u − 1 − 2k = 0  ⇒  u* = (1 + 2k)/k
//! Voor h₁/h₀ = 0,4 is k = −0,6 en u* = (1 − 1,2)/(−0,6) = 1/3. Het maatgevende
//! punt ligt dus op x = L/3 en NIET bij de inklemming, waar M het grootst is.

use mechanics::{ForcePoint, InternalForces};
use nen_en_1993_1_1_section::CheckStatus;
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use steel_check::CheckKind;
use timber_check::{check_timber_beam, TimberBeamCheckInput, TimberBeamCheckResult};

/// Een staaf met louter buiging: op elke positie één krachtpunt met M_y.
fn staaf(
    b_mm: f64,
    h_mm: f64,
    b_eind: Option<f64>,
    h_eind: Option<f64>,
    l_mm: f64,
    punten: &[(f64, f64)],
) -> TimberBeamCheckInput {
    TimberBeamCheckInput {
        beam_id: 1,
        width_mm: b_mm,
        height_mm: h_mm,
        custom_section: None,
        strength_class: "C24".to_string(),
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        load_duration_per_combination: vec![],
        length_m: l_mm / 1000.0,
        forces_envelope: punten
            .iter()
            .map(|&(x, my)| ForcePoint {
                combination_id: 1,
                position_mm: x,
                forces: InternalForces {
                    n_ed: 0.0,
                    vy_ed: 0.0,
                    vz_ed: 0.0,
                    mt_ed: 0.0,
                    my_ed: my,
                    mz_ed: 0.0,
                },
            })
            .collect(),
        buckling_length_y_m: 0.0,
        buckling_length_z_m: 0.0,
        lateral_bracing: None,
        ltb_segment_length_m: 0.0,
        ltb_load_case: nen_en_1995_1_1::stability::LtbLoadCase::UniformLoad,
        ltb_load_position: nen_en_1995_1_1::stability::LtbLoadPosition::CentreOfGravity,
        ltb_effective_length_override_m: 0.0,
        // De kiptoets staat uit: hij zou de buigproef met een tweede,
        // stabiliteitsafhankelijke unity check vertroebelen, en deze proeven
        // gaan over de DOORSNEDEtoets per rekenpunt.
        perform_ltb_check: false,
        k_cr: 1.0,
        load_sharing: false,
        deflection_inst_mm: 0.0,
        deflection_quasi_perm_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_limit_fin: 250.0,
        deflection_limit_add: 333.0,
        deflection_notes: vec![],
        staaf_notities: None,
        width_end_mm: b_eind,
        height_end_mm: h_eind,
    }
}

fn uc_van(r: &TimberBeamCheckResult, id: &str) -> f64 {
    let c = r.checks.iter().find(|c| c.id == id).expect("toets ontbreekt");
    match &c.kind {
        CheckKind::Resistance(x) => x.uc.as_ref().expect("UC").uc,
        CheckKind::Stability(x) => x.uc.as_ref().expect("UC").uc,
    }
}

fn positie_van(r: &TimberBeamCheckResult, id: &str) -> f64 {
    let c = r.checks.iter().find(|c| c.id == id).expect("toets ontbreekt");
    match &c.kind {
        CheckKind::Resistance(x) => x.force_state.position_mm,
        CheckKind::Stability(x) => x.force_state.position_mm,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Prismatisch blijft prismatisch — geen enkel getal verandert
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn eindmaten_gelijk_aan_het_begin_geeft_byte_gelijke_uitkomst() {
    let punten = [(0.0, 30.0), (1500.0, 20.0), (3000.0, 0.0)];
    let zonder = check_timber_beam(staaf(100.0, 300.0, None, None, 3000.0, &punten));
    let met = check_timber_beam(staaf(100.0, 300.0, Some(100.0), Some(300.0), 3000.0, &punten));
    assert_eq!(
        serde_json::to_string(&zonder).unwrap(),
        serde_json::to_string(&met).unwrap(),
        "eindmaten gelijk aan het begin horen langs het prismatische pad te gaan"
    );
    assert!(zonder.verloop.is_none(), "een prismatische staaf krijgt geen verloopgegevens");
    // En het veld hoort dan ook niet in de JSON te staan.
    assert!(!serde_json::to_string(&zonder).unwrap().contains("verloop"));
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. Het maatgevende punt ligt NIET waar het moment het grootst is
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn uitkrager_met_verlopende_hoogte_vindt_het_maximum_van_m_over_w() {
    // b = 100 mm, h van 500 mm (x = 0, inklemming) naar 200 mm (x = L, tip),
    // L = 3000 mm, M(x) = 30·(1 − x/L) kNm. Rekenpunten om de 500 mm, zodat
    // x = L/3 = 1000 mm er precies bij zit.
    let l = 3000.0;
    let punten: Vec<(f64, f64)> =
        (0..=6).map(|i| { let x = i as f64 * 500.0; (x, 30.0 * (1.0 - x / l)) }).collect();
    let r = check_timber_beam(staaf(100.0, 500.0, None, Some(200.0), l, &punten));

    // HANDBEREKENING per rekenpunt (h = 500 − 0,1·x; W = 100·h²/6; f_m,d = 14,76923):
    //   x =    0: h = 500, W = 4 166 666,7, M = 30,0 → σ = 7,2000 → UC = 0,48750
    //   x =  500: h = 450, W = 3 375 000,0, M = 25,0 → σ = 7,4074 → UC = 0,50154
    //   x = 1000: h = 400, W = 2 666 666,7, M = 20,0 → σ = 7,5000 → UC = 0,50781  ← max
    //   x = 1500: h = 350, W = 2 041 666,7, M = 15,0 → σ = 7,3469 → UC = 0,49744
    //   x = 2000: h = 300, W = 1 500 000,0, M = 10,0 → σ = 6,6667 → UC = 0,45139
    assert_eq!(
        positie_van(&r, "6.1.6_bending"),
        1000.0,
        "het maatgevende punt hoort op x = L/3 te liggen, niet bij de inklemming"
    );
    let uc = uc_van(&r, "6.1.6_bending");
    assert!((uc - 0.507813).abs() < 5e-6, "UC = {uc}, hand: 7,5/14,76923 = 0,507813");

    // De inklemming, waar M het grootst is, geeft een LAGERE unity check.
    let v = r.verloop.as_ref().expect("verlooprapport");
    let bij_nul = v
        .toetsdoorsneden
        .iter()
        .find(|d| d.x_mm == 0.0)
        .expect("toetsdoorsnede x = 0");
    let uc0 = bij_nul
        .toetsen
        .iter()
        .find(|t| t.id == "6.1.6_bending")
        .and_then(|t| t.uc)
        .expect("UC bij x = 0");
    assert!((uc0 - 0.487500).abs() < 5e-6, "UC(x=0) = {uc0}, hand: 7,2/14,76923 = 0,487500");
    assert!(uc > uc0, "het maximum van M/W ligt niet bij het grootste moment");
    // 25/24 = 1,041667: (1−1/3)/(0,8)² gedeeld door 1/1² — puur meetkunde.
    assert!((uc / uc0 - 25.0 / 24.0).abs() < 1e-5, "verhouding {}", uc / uc0);

    // Het rapport: zes toetsdoorsneden en het maatgevende punt.
    assert_eq!(v.begin_naam, "100 x 500");
    assert_eq!(v.eind_naam, "100 x 200");
    assert_eq!(v.aantal_rekenpunten, 7);
    assert_eq!(v.toetsdoorsneden.len(), 6, "x = 0, L/5, 2L/5, 3L/5, 4L/5, L");
    let m = v.maatgevend.as_ref().expect("maatgevend punt");
    assert_eq!(m.toets_id, "6.1.6_bending");
    assert_eq!(m.doorsnede.x_mm, 1000.0);
    assert!((m.doorsnede.maten.h_mm - 400.0).abs() < 1e-9);
    assert!((m.doorsnede.w_y_mm3 - 100.0 * 400.0 * 400.0 / 6.0).abs() < 1e-6);
    assert!(m.doorsnede.klasse.is_none(), "hout kent geen doorsnedeklasse");
    assert!(m.doorsnede.maten.tw_mm.is_none() && m.doorsnede.maten.tf_mm.is_none());
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. k_h wordt per rekenpunt met de plaatselijke hoogte bepaald
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn k_h_volgt_de_hoogte_per_rekenpunt() {
    // Constant moment M = 5 kNm over de hele staaf; alleen de doorsnede
    // verloopt: 100 × 200 (x = 0) naar 100 × 100 (x = L = 3000).
    let punten: Vec<(f64, f64)> = (0..=4).map(|i| (i as f64 * 750.0, 5.0)).collect();
    let r = check_timber_beam(staaf(100.0, 200.0, None, Some(100.0), 3000.0, &punten));

    // HANDBEREKENING (f_m,d = k_h·0,80·24/1,30 = k_h·14,76923):
    //   x =    0: h = 200, W =  666 666,7, σ =  7,5000, k_h = 1,000000 → UC = 0,50781
    //   x =  750: h = 175, W =  510 416,7, σ =  9,7959, k_h = 1,000000 → UC = 0,66325
    //   x = 1500: h = 150, W =  375 000,0, σ = 13,3333, k_h = 1,000000 → UC = 0,90278
    //   x = 2250: h = 125, W =  260 416,7, σ = 19,2000, k_h = 1,037133 → UC = 1,25345
    //   x = 3000: h = 100, W =  166 666,7, σ = 30,0000, k_h = 1,084472 → UC = 1,87307  ← max
    // k_h = (150/h)^0,2: (150/125)^0,2 = 1,2^0,2 = 1,037133;
    //                    (150/100)^0,2 = 1,5^0,2 = 1,084472.
    assert_eq!(positie_van(&r, "6.1.6_bending"), 3000.0);
    let uc = uc_van(&r, "6.1.6_bending");
    assert!((uc - 1.873066).abs() < 5e-5, "UC = {uc}, hand: 30,0/(1,084472·14,76923) = 1,873066");
    // ZONDER k_h zou de uitkomst 30,0/14,76923 = 2,031250 zijn geweest; dat de
    // kern lager uitkomt, bewijst dat k_h met h = 100 mm is bepaald en niet met
    // de beginhoogte h = 200 mm (waar k_h = 1,0 is).
    assert!(uc < 2.03125 - 0.1, "k_h is niet met de plaatselijke hoogte bepaald");

    let v = r.verloop.as_ref().expect("verlooprapport");
    let uc_op = |x: f64| -> f64 {
        v.toetsdoorsneden
            .iter()
            .find(|d| (d.x_mm - x).abs() < 1e-9)
            .and_then(|d| d.toetsen.iter().find(|t| t.id == "6.1.6_bending"))
            .and_then(|t| t.uc)
            .unwrap_or_else(|| panic!("geen UC op x = {x}"))
    };
    assert!((uc_op(0.0) - 0.507813).abs() < 5e-6);
    assert!((uc_op(1500.0) - 0.902778).abs() < 5e-6);
    assert!((uc_op(2250.0) - 1.253450).abs() < 5e-5, "{}", uc_op(2250.0));
    assert!((uc_op(3000.0) - 1.873066).abs() < 5e-5);
    assert!(matches!(r.status, CheckStatus::NotOk), "UC > 1 hoort NotOk te geven");
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. Stabiliteit met de kleinste doorsnede in het veld
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn stabiliteit_rekent_met_de_kleinste_doorsnede_en_noemt_haar() {
    let punten: Vec<(f64, f64)> = (0..=4).map(|i| (i as f64 * 750.0, 5.0)).collect();
    let mut invoer = staaf(100.0, 400.0, None, Some(200.0), 3000.0, &punten);
    invoer.perform_ltb_check = true;
    // Met druk erbij draait de kolomtoets van art. 6.3.2 werkelijk.
    for p in invoer.forces_envelope.iter_mut() {
        p.forces.n_ed = -40.0;
    }
    let r = check_timber_beam(invoer);
    let v = r.verloop.as_ref().expect("verlooprapport");
    assert_eq!(v.stabiliteit.len(), 2, "6.3.2 en 6.3.3 elk met hun doorsnede");
    for s in &v.stabiliteit {
        // De kandidaten zijn de staafeinden; de kleinste is x = L (h = 200).
        assert_eq!(s.x_mm, 3000.0, "toets {} koos x = {}", s.toets_id, s.x_mm);
        assert!((s.maten.h_mm - 200.0).abs() < 1e-9);
        assert!((s.area_mm2 - 100.0 * 200.0).abs() < 1e-9);
        assert!(s.reden.contains("KLEINSTE doorsnede"), "de reden hoort in het rapport te staan");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. Weigeringen met reden — nooit stil terugvallen
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn samengestelde_doorsnede_met_eindmaten_wordt_geweigerd_met_reden() {
    let mut invoer = staaf(100.0, 300.0, None, Some(200.0), 3000.0, &[(0.0, 10.0)]);
    invoer.custom_section = Some(steel_check::CustomSection {
        naam: "proef".to_string(),
        lamellen: vec![steel_check::CustomLamella {
            b_mm: 100.0,
            t_mm: 300.0,
            y_mm: 0.0,
            z_mm: 0.0,
            alpha_rad: 0.0,
        }],
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: steel_check::CustomDoorsnedevorm::Onbekend,
    });
    let r = check_timber_beam(invoer);
    assert!(r.checks.is_empty());
    assert!(matches!(r.status, CheckStatus::NotApplicable));
    assert!(
        r.governing_check_id.contains("samengestelde doorsnede"),
        "reden: {}",
        r.governing_check_id
    );
}

#[test]
fn eindhoogte_nul_wordt_geweigerd_met_reden() {
    let r = check_timber_beam(staaf(100.0, 300.0, None, Some(0.0), 3000.0, &[(0.0, 10.0)]));
    assert!(r.checks.is_empty());
    assert!(r.governing_check_id.contains("groter dan nul"), "reden: {}", r.governing_check_id);
}
