//! Kruipcoëfficiënt volgens NEN-EN 1992-1-1 bijlage B — handberekeningen.
//!
//! Elke tussenwaarde hieronder is met de hand (rekenmachine) uit de formules
//! van bijlage B uitgerekend, zoals ze in de moduletekst van
//! `nen_en_1992_1_1::kruip` letterlijk zijn overgenomen. De kern moet ze op
//! 1e-5 relatief halen; de figuur-3.1-vergelijking staat bij elk geval apart en
//! heeft de ruimere tolerantie van een aflezing.
//!
//! LET OP DE GRENS VAN 35 MPA. f_cm = f_ck + 8 (tabel 3.1): C25/30 heeft
//! f_cm = 33 MPa en valt in de a-tak; C30/37 heeft f_cm = 38 MPa en valt al in
//! de b-tak van (B.3) en (B.8).
//!
//! FIGUUR 3.1. De nomogrammen zijn afgelezen op een render van 300 dpi, met
//! pixelmeting van de rasterlijnen en krommen, langs de vijf stappen van de
//! gebruiksaanwijzing in de figuur: t₀ naar de cementkromme (1), lijn door de
//! oorsprong (2), h₀ naar de betonklasse (3), horizontaal naar lijn 2 (4),
//! omlaag naar φ(∞,t₀) (5). Figuur 3.1 geeft kruip op 70 jaar.

use nen_en_1992_1_1::{
    creep_coefficient_request, kruipcoefficient_bijlage_b, CementClass, ConcreteSectionInput,
    CreepCoefficientRequest,
};

fn dicht(werkelijk: f64, verwacht: f64, rel: f64, wat: &str) {
    let fout = ((werkelijk - verwacht) / verwacht).abs();
    assert!(fout <= rel, "{wat}: kern {werkelijk}, hand {verwacht} (relatief {fout:e} > {rel:e})");
}

const TOL: f64 = 1e-5;
const SEVENTIG_JAAR_D: f64 = 70.0 * 365.0; // 25 550 dagen

/// Geval 1 — f_cm ≤ 35 MPa: C25/30, binnen (RH 50 %), h₀ = 150 mm, t₀ = 28 d,
/// cement N.
///
/// ```text
/// f_cm   = 25 + 8 = 33 MPa ≤ 35 → a-takken (B.3a), (B.8a)
/// (B.9)  α = 0 → t₀ = 28 · (…)^0 = 28 d
/// (B.3a) ∛150 = 5,313293; (1 − 0,50)/(0,1 · 5,313293) = 0,941036
///        φ_RH = 1,941036
/// (B.4)  √33 = 5,744563; β(f_cm) = 16,8/5,744563 = 2,924505
/// (B.5)  28^0,20 = 1,947294; β(t₀) = 1/(0,1 + 1,947294) = 0,488450
/// (B.2)  φ₀ = 1,941036 · 2,924505 · 0,488450 = 2,772717 = φ(∞,t₀)
/// (B.8a) (0,012·50)^18 = 0,000102; 1,5 · 1,000102 · 150 + 250 = 475,0229 ≤ 1500
/// (B.7)  t = 25 550 d: [25 522 / (475,0229 + 25 522)]^0,3 = 0,994483
/// (B.1)  φ(70 j, t₀) = 2,772717 · 0,994483 = 2,757420
/// ```
///
/// Figuur 3.1a (RH 50 %), C25/30, h₀ 150, t₀ 28, N: afgelezen 2,68.
/// Verschil met φ(70 j) 2,76: 3 %, binnen de afleesnauwkeurigheid van het
/// nomogram (één pixel op lijn 2 verschuift de aflezing ±0,05).
#[test]
fn c25_30_binnen_h0_150_t0_28_cement_n() {
    let u = kruipcoefficient_bijlage_b(33.0, 50.0, 150.0, 28.0, CementClass::N, Some(SEVENTIG_JAAR_D))
        .unwrap();
    assert!(!u.hoge_sterkte_tak);
    assert_eq!(u.alpha_cement, 0);
    dicht(u.t0_adjusted_days, 28.0, TOL, "t₀ (B.9)");
    dicht(u.phi_rh, 1.941036, TOL, "φ_RH (B.3a)");
    dicht(u.beta_fcm, 2.924505, TOL, "β(f_cm) (B.4)");
    dicht(u.beta_t0, 0.488450, TOL, "β(t₀) (B.5)");
    dicht(u.phi_0, 2.772717, TOL, "φ₀ (B.2)");
    dicht(u.phi_inf_t0, 2.772717, TOL, "φ(∞,t₀)");
    dicht(u.beta_h, 475.0229, TOL, "β_H (B.8a)");
    assert!(!u.beta_h_bovengrens_maatgevend);
    dicht(u.beta_c.unwrap(), 0.994483, TOL, "β_c (B.7)");
    dicht(u.phi_t_t0.unwrap(), 2.757420, TOL, "φ(t,t₀) (B.1)");
    // Figuur 3.1a, afgelezen 2,68.
    dicht(u.phi_t_t0.unwrap(), 2.68, 0.05, "figuur 3.1a");
}

/// Geval 2 — f_cm > 35 MPa: C30/37, binnen (RH 50 %), h₀ = 150 mm, t₀ = 28 d,
/// cement N.
///
/// ```text
/// f_cm   = 30 + 8 = 38 MPa > 35 → b-takken (B.3b), (B.8b)
/// (B.8c) 35/38 = 0,921053; α₁ = 0,921053^0,7 = 0,944059;
///        α₂ = 0,921053^0,2 = 0,983687; α₃ = 0,921053^0,5 = 0,959715
/// (B.9)  α = 0 → t₀ = 28 d
/// (B.3b) φ_RH = [1 + 0,941036 · 0,944059] · 0,983687 = 1,857588
/// (B.4)  √38 = 6,164414; β(f_cm) = 16,8/6,164414 = 2,725320
/// (B.5)  β(t₀) = 0,488450
/// (B.2)  φ₀ = 1,857588 · 2,725320 · 0,488450 = 2,472786 = φ(∞,t₀)
/// (B.8b) 1,5 · 1,000102 · 150 + 250 · 0,959715 = 464,9516 ≤ 1500 · 0,959715
/// (B.7)  t = 25 550 d: β_c = 0,994599
/// (B.1)  φ(70 j, t₀) = 2,459430
/// ```
///
/// Figuur 3.1a, C30/37, h₀ 150, t₀ 28, N: afgelezen 2,40 … 2,45 (de kromme N
/// snijdt t₀ = 28 op de rasterlijn φ = 1,0, en die pixel bepaalt lijn 2).
#[test]
fn c30_37_binnen_h0_150_t0_28_cement_n() {
    let u = kruipcoefficient_bijlage_b(38.0, 50.0, 150.0, 28.0, CementClass::N, Some(SEVENTIG_JAAR_D))
        .unwrap();
    assert!(u.hoge_sterkte_tak);
    dicht(u.alpha_1, 0.944059, TOL, "α₁");
    dicht(u.alpha_2, 0.983687, TOL, "α₂");
    dicht(u.alpha_3, 0.959715, TOL, "α₃");
    dicht(u.phi_rh, 1.857588, TOL, "φ_RH (B.3b)");
    dicht(u.beta_fcm, 2.725320, TOL, "β(f_cm)");
    dicht(u.beta_t0, 0.488450, TOL, "β(t₀)");
    dicht(u.phi_inf_t0, 2.472786, TOL, "φ(∞,t₀)");
    dicht(u.beta_h, 464.9516, TOL, "β_H (B.8b)");
    dicht(u.beta_c.unwrap(), 0.994599, TOL, "β_c");
    dicht(u.phi_t_t0.unwrap(), 2.459430, TOL, "φ(t,t₀)");
    dicht(u.phi_t_t0.unwrap(), 2.425, 0.03, "figuur 3.1a");
}

/// Geval 3 — f_cm > 35 MPa met cement R: C45/55, buiten (RH 80 %), h₀ = 300 mm,
/// t₀ = 7 d.
///
/// ```text
/// f_cm   = 45 + 8 = 53 MPa > 35
/// (B.8c) 35/53 = 0,660377; α₁ = 0,747919; α₂ = 0,920361; α₃ = 0,812636
/// (B.9)  α = 1: 7^1,2 = 10,330412; 9/(2 + 10,330412) + 1 = 1,729903
///        t₀ = 7 · 1,729903 = 12,109318 d
/// (B.3b) ∛300 = 6,694330; (1 − 0,80)/(0,1 · 6,694330) = 0,298760
///        φ_RH = [1 + 0,298760 · 0,747919] · 0,920361 = 1,126015
/// (B.4)  √53 = 7,280110; β(f_cm) = 2,307657
/// (B.5)  12,109318^0,20 = 1,646736; β(t₀) = 1/1,746736 = 0,572496
/// (B.2)  φ₀ = 1,126015 · 2,307657 · 0,572496 = 1,487607 = φ(∞,t₀)
/// (B.8b) (0,012·80)^18 = 0,96^18 = 0,479603;
///        1,5 · 1,479603 · 300 + 250 · 0,812636 = 868,9805 ≤ 1218,95
/// (B.7)  t − t₀ = 25 550 − 7 = 25 543 (niet-aangepast): β_c = 0,990014
/// (B.1)  φ(70 j, t₀) = 1,472752
/// ```
///
/// Figuur 3.1b (RH 80 %), C45/55, h₀ 300, t₀ 7, R: afgelezen 1,50.
#[test]
fn c45_55_buiten_h0_300_t0_7_cement_r() {
    let u = kruipcoefficient_bijlage_b(53.0, 80.0, 300.0, 7.0, CementClass::R, Some(SEVENTIG_JAAR_D))
        .unwrap();
    assert!(u.hoge_sterkte_tak);
    assert_eq!(u.alpha_cement, 1);
    dicht(u.alpha_1, 0.747919, TOL, "α₁");
    dicht(u.alpha_2, 0.920361, TOL, "α₂");
    dicht(u.alpha_3, 0.812636, TOL, "α₃");
    dicht(u.t0_adjusted_days, 12.109318, TOL, "t₀ (B.9)");
    dicht(u.phi_rh, 1.126015, TOL, "φ_RH (B.3b)");
    dicht(u.beta_fcm, 2.307657, TOL, "β(f_cm)");
    dicht(u.beta_t0, 0.572496, TOL, "β(t₀)");
    dicht(u.phi_inf_t0, 1.487607, TOL, "φ(∞,t₀)");
    dicht(u.beta_h, 868.9805, TOL, "β_H (B.8b)");
    dicht(u.beta_c.unwrap(), 0.990014, TOL, "β_c");
    dicht(u.phi_t_t0.unwrap(), 1.472752, TOL, "φ(t,t₀)");
    dicht(u.phi_t_t0.unwrap(), 1.50, 0.03, "figuur 3.1b");
}

/// Cement S verkleint t₀ en vergroot dus φ: C30/37, RH 50 %, h₀ 150, t₀ 3 d.
///
/// ```text
/// (B.9)  α = −1: 3^1,2 = 3,737193; 9/5,737193 + 1 = 2,568711
///        t₀ = 3 / 2,568711 = 1,167901 d
/// (B.5)  1,167901^0,20 = 1,031528; β(t₀) = 0,883760
/// (B.2)  φ₀ = 1,857588 · 2,725320 · 0,883760 = 4,474056
/// ```
#[test]
fn cement_s_verkleint_de_aangepaste_ouderdom() {
    let u = kruipcoefficient_bijlage_b(38.0, 50.0, 150.0, 3.0, CementClass::S, None).unwrap();
    dicht(u.t0_adjusted_days, 1.167901, TOL, "t₀ (B.9)");
    dicht(u.beta_t0, 0.883760, TOL, "β(t₀)");
    dicht(u.phi_inf_t0, 4.474056, TOL, "φ(∞,t₀)");
    assert!(u.beta_c.is_none() && u.phi_t_t0.is_none(), "zonder t geen β_c");
}

/// Beide grenzen maatgevend: C20/25, RH 40 %, h₀ 1000 mm, t₀ 0,3 d, cement S,
/// t = 10 d.
///
/// ```text
/// (B.9)  0,3^1,2 = 0,235801; 9/2,235801 + 1 = 5,025403; 0,3/5,025403 = 0,059697
///        < 0,5 → t₀ = 0,5 d
/// (B.3a) ∛1000 = 10; φ_RH = 1 + 0,60/1,0 = 1,600000
/// (B.4)  β(f_cm) = 16,8/√28 = 3,174902
/// (B.5)  0,5^0,20 = 0,870551; β(t₀) = 1,030343
/// (B.2)  φ₀ = 1,6 · 3,174902 · 1,030343 = 5,233980
/// (B.8a) 1,5 · 1,000002 · 1000 + 250 = 1750,003 > 1500 → β_H = 1500
/// (B.7)  t − t₀ = 10 − 0,3 = 9,7: [9,7/1509,7]^0,3 = 0,219970
/// (B.1)  φ(10, t₀) = 1,151321
/// ```
#[test]
fn ondergrens_t0_en_bovengrens_beta_h() {
    let u = kruipcoefficient_bijlage_b(28.0, 40.0, 1000.0, 0.3, CementClass::S, Some(10.0)).unwrap();
    assert!(u.t0_ondergrens_maatgevend);
    dicht(u.t0_adjusted_days, 0.5, TOL, "t₀ ≥ 0,5");
    dicht(u.phi_rh, 1.6, TOL, "φ_RH");
    dicht(u.beta_t0, 1.030343, TOL, "β(t₀)");
    dicht(u.phi_inf_t0, 5.233980, TOL, "φ₀");
    assert!(u.beta_h_bovengrens_maatgevend);
    dicht(u.beta_h, 1500.0, TOL, "β_H ≤ 1500");
    dicht(u.beta_c.unwrap(), 0.219970, TOL, "β_c");
    dicht(u.phi_t_t0.unwrap(), 1.151321, TOL, "φ(t,t₀)");
}

/// Bij f_cm = 35 MPa vallen de a- en b-tak samen (α₁ = α₂ = α₃ = 1): de grens
/// "> 35" van (B.3b) tegenover "≥ 35" van (B.8b) verandert geen getal.
#[test]
fn takken_vallen_samen_bij_35_mpa() {
    let op = kruipcoefficient_bijlage_b(35.0, 60.0, 200.0, 14.0, CementClass::N, Some(1000.0)).unwrap();
    let net_erboven =
        kruipcoefficient_bijlage_b(35.0 + 1e-9, 60.0, 200.0, 14.0, CementClass::N, Some(1000.0)).unwrap();
    assert!(!op.hoge_sterkte_tak && net_erboven.hoge_sterkte_tak);
    dicht(net_erboven.phi_rh, op.phi_rh, 1e-8, "φ_RH continu");
    dicht(net_erboven.beta_h, op.beta_h, 1e-8, "β_H continu");
}

/// Het verzoek: h₀ uit de doorsnede, f_cm uit tabel 3.1, en de afleiding.
///
/// Rechthoek 300 × 500: A_c = 150 000 mm², u = 1600 mm, h₀ = 187,5 mm.
#[test]
fn verzoek_met_doorsnede_geeft_h0_en_afleiding() {
    let uit = creep_coefficient_request(CreepCoefficientRequest {
        bijlage: Default::default(),
        beam_id: 7,
        concrete_class: "C30/37".into(),
        relative_humidity_pct: 50.0,
        t0_days: 28.0,
        cement_class: CementClass::N,
        section: Some(ConcreteSectionInput::rectangle(300.0, 500.0)),
        h0_mm: None,
        t_days: None,
    })
    .unwrap();
    assert_eq!(uit.beam_id, 7);
    dicht(uit.a_c_mm2.unwrap(), 150_000.0, 1e-12, "A_c");
    dicht(uit.u_mm.unwrap(), 1600.0, 1e-12, "u");
    dicht(uit.uitkomst.h0_mm, 187.5, 1e-12, "h₀");
    dicht(uit.uitkomst.f_cm_mpa, 38.0, 1e-12, "f_cm");
    let ids: Vec<&str> = uit.deelstappen.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(
        ids,
        ["kruip_uitgangspunten", "kruip_h0", "kruip_alpha", "kruip_phi_rh", "kruip_beta_fcm", "kruip_t0", "kruip_beta_t0", "kruip_phi_0"]
    );
    let slot = uit.deelstappen.last().unwrap();
    assert_eq!(slot.value, Some(uit.uitkomst.phi_inf_t0));
    assert!(uit.notes.iter().any(|n| n.contains("(B.10)")));
    assert!(uit.notes.iter().any(|n| n.contains("0,45")));
}

#[test]
fn weigeringen_met_reden() {
    let basis = || CreepCoefficientRequest {
        bijlage: Default::default(),
        beam_id: 0,
        concrete_class: "C30/37".into(),
        relative_humidity_pct: 50.0,
        t0_days: 28.0,
        cement_class: CementClass::N,
        section: None,
        h0_mm: Some(150.0),
        t_days: None,
    };
    let fout = |r: CreepCoefficientRequest| creep_coefficient_request(r).unwrap_err();

    assert!(fout(CreepCoefficientRequest { h0_mm: None, ..basis() }).contains("ontbreekt"));
    assert!(fout(CreepCoefficientRequest {
        section: Some(ConcreteSectionInput::rectangle(300.0, 500.0)),
        ..basis()
    })
    .contains("niet allebei"));
    assert!(fout(CreepCoefficientRequest { relative_humidity_pct: 120.0, ..basis() }).contains("RH"));
    assert!(fout(CreepCoefficientRequest { relative_humidity_pct: 0.0, ..basis() }).contains("RH"));
    assert!(fout(CreepCoefficientRequest { h0_mm: Some(0.0), ..basis() }).contains("h₀"));
    assert!(fout(CreepCoefficientRequest { t0_days: -1.0, ..basis() }).contains("t₀"));
    assert!(fout(CreepCoefficientRequest { t_days: Some(20.0), ..basis() }).contains("t > t₀"));
    assert!(fout(CreepCoefficientRequest { concrete_class: "C31/38".into(), ..basis() })
        .contains("Onbekende betonklasse"));
}
