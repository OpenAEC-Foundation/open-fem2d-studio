//! NB.NB-formules getoetst aan de referentie-uitwerking 2867 (HEA320/HEA400).

use approx::assert_relative_eq;
use nen_en_1993_1_1_ltb::nb_annex;

#[test]
fn s_parameter_hea320() {
    // S = (310/2)·√(210000·69852972 / (80769·1084313)) = 2006 mm
    let s = nb_annex::s_parameter(310.0, nb_annex::E_MPA, 69852972.0, nb_annex::G_MPA, 1084313.0);
    assert_relative_eq!(s, 2006.0, max_relative = 1e-3);
}

#[test]
fn s_parameter_hea400() {
    let s = nb_annex::s_parameter(390.0, nb_annex::E_MPA, 85638935.0, nb_annex::G_MPA, 1897649.0);
    assert_relative_eq!(s, 2112.0, max_relative = 1e-3);
}

#[test]
fn alpha_nb9_referentieprofielen() {
    // NB.NB.9: α = h·t_f·10¹² / (t_w³·b·L_g²)
    // HEA 320 op L_g = 8000: 310·15,5·1e12 / (9³·300·8000²) = 343
    let a320 = nb_annex::alpha_nb9(310.0, 15.5, 9.0, 300.0, 8000.0);
    assert_relative_eq!(a320, 343.0, max_relative = 1e-2);
    // HEA 400 op L_g = 8000: 390·19·1e12 / (11³·300·8000²) = 289,96
    let a400 = nb_annex::alpha_nb9(390.0, 19.0, 11.0, 300.0, 8000.0);
    assert_relative_eq!(a400, 289.96, max_relative = 1e-3);
}

#[test]
fn alpha_neemt_af_bij_langere_ligger() {
    // α ~ 1/L_g², dus twee keer zo lang geeft een kwart.
    let kort = nb_annex::alpha_nb9(310.0, 15.5, 9.0, 300.0, 4000.0);
    let lang = nb_annex::alpha_nb9(310.0, 15.5, 9.0, 300.0, 8000.0);
    assert_relative_eq!(kort / lang, 4.0, max_relative = 1e-9);
}

#[test]
fn k_red_is_1_onder_slankheidsgrens() {
    // NB.NB.7: h/t_w ≤ 75 → k_red = 1, ongeacht α.
    // HEA 320: 310/9 = 34,4
    assert_relative_eq!(nb_annex::k_red(310.0, 15.5, 9.0, 300.0, 8000.0), 1.0, max_relative = 1e-9);
    // HEA 400: 390/11 = 35,5
    assert_relative_eq!(nb_annex::k_red(390.0, 19.0, 11.0, 300.0, 8000.0), 1.0, max_relative = 1e-9);
    // Grensgeval exact op 75 telt nog als niet-slank
    assert_relative_eq!(nb_annex::k_red(750.0, 15.0, 10.0, 300.0, 8000.0), 1.0, max_relative = 1e-9);
}

#[test]
fn k_red_volgens_nb8_boven_de_slankheidsgrens() {
    // h/t_w = 1000/10 = 100 > 75, dus NB.NB.8 is van toepassing.
    // α = 1000·20·1e12 / (10³·300·6000²) = 2,0e16 / 1,08e13 = 1851,9
    // k_red = min(-5,4e-5·1851,9 + 1,03 ; 1) = min(0,930 ; 1) = 0,930
    let alpha = nb_annex::alpha_nb9(1000.0, 20.0, 10.0, 300.0, 6000.0);
    assert_relative_eq!(alpha, 1851.85, max_relative = 1e-3);
    let k = nb_annex::k_red(1000.0, 20.0, 10.0, 300.0, 6000.0);
    assert_relative_eq!(k, 0.93, max_relative = 5e-3);
}

#[test]
fn k_red_wordt_op_1_afgekapt_bij_kleine_alpha() {
    // Slank lijf maar zeer kleine α (lange ligger) → formule geeft > 1, min() kapt af.
    let k = nb_annex::k_red(1000.0, 20.0, 10.0, 300.0, 30000.0);
    assert_relative_eq!(k, 1.0, max_relative = 1e-9);
}

#[test]
fn boven_alpha_5000_moet_de_gedrukte_rand_worden_getoetst() {
    // NB.NB.4.2(3): h/t_w > 75 én α > 5000 → geen k_red, maar toetsing 6.3.3.
    // α = 1000·20·1e12 / (10³·300·3000²) = 2,0e16 / 2,7e12 = 7407
    assert!(nb_annex::vereist_toets_gedrukte_rand(1000.0, 20.0, 10.0, 300.0, 3000.0));
    // De referentieprofielen vallen hier niet onder.
    assert!(!nb_annex::vereist_toets_gedrukte_rand(310.0, 15.5, 9.0, 300.0, 8000.0));
    assert!(!nb_annex::vereist_toets_gedrukte_rand(390.0, 19.0, 11.0, 300.0, 8000.0));
}

#[test]
fn c_coefficient_hea320() {
    // NB.NB.11 met de referentiewaarden:
    // C1 = 1,529 · L_g = 8000 · L_kip = 3733 · S = 2006 · C2 = -0,078 → C = 18,886
    let c = nb_annex::c_coefficient(1.529, 8000.0, 3733.0, 2006.0, -0.078);
    assert_relative_eq!(c, 18.886, max_relative = 1e-3);
}

#[test]
fn c_coefficient_hea400() {
    // Zelfde C1/L_g/L_kip/C2, maar S = 2112 → C = 19,616
    let c = nb_annex::c_coefficient(1.529, 8000.0, 3733.0, 2112.0, -0.078);
    assert_relative_eq!(c, 19.616, max_relative = 1e-3);
}

#[test]
fn c_coefficient_gelijk_aan_oude_vorm_bij_c2_nul() {
    // Bij C2 = 0 valt de losse term weg en zijn de oude en nieuwe groepering
    // rekenkundig identiek. Deze test legt vast dat de reparatie bestaande
    // gevallen zonder excentrische belasting niet verandert.
    let c = nb_annex::c_coefficient(1.803, 2500.0, 2500.0, 687.0, 0.0);
    assert_relative_eq!(c, 7.481, max_relative = 5e-3);
}

#[test]
fn l_kip_uit_beta_en_l_st() {
    // NB.NB.4.3: L_kip = (1,4 - 0,8·β)·L_st, met 1,0 ≤ L_kip/L_st ≤ 1,4.
    // Referentie: β = 0, L_st = 2667 → factor 1,4 → 3733 mm
    assert_relative_eq!(nb_annex::l_kip(0.0, 2667.0), 3733.8, max_relative = 1e-3);
}

#[test]
fn l_kip_wordt_naar_boven_begrensd_op_1_4() {
    // β = -1 geeft rekenkundig 2,2 → begrensd op 1,4
    assert_relative_eq!(nb_annex::l_kip(-1.0, 1000.0), 1400.0, max_relative = 1e-9);
    // β = -0,5 geeft 1,8 → ook begrensd op 1,4
    assert_relative_eq!(nb_annex::l_kip(-0.5, 1000.0), 1400.0, max_relative = 1e-9);
}

#[test]
fn l_kip_wordt_naar_beneden_begrensd_op_1_0() {
    // β = 1 (constant moment) geeft 0,6 → begrensd op 1,0 → L_kip = L_st
    assert_relative_eq!(nb_annex::l_kip(1.0, 2667.0), 2667.0, max_relative = 1e-9);
    // β = 0,75 geeft 0,8 → ook begrensd op 1,0
    assert_relative_eq!(nb_annex::l_kip(0.75, 1000.0), 1000.0, max_relative = 1e-9);
}

#[test]
fn l_kip_in_het_onbegrensde_bereik() {
    // β = 0,5 geeft precies 1,0 (op de ondergrens)
    assert_relative_eq!(nb_annex::l_kip(0.5, 1000.0), 1000.0, max_relative = 1e-9);
    // β = 0,25 geeft 1,2 — midden in het geldige bereik, niet begrensd
    assert_relative_eq!(nb_annex::l_kip(0.25, 1000.0), 1200.0, max_relative = 1e-9);
}

#[test]
fn b_ster_hea320() {
    // NB.NB.4.3(3): B* = 8M / (8|M| + q·L_st²)
    // M = 57,707 kNm = 57,707e6 N·mm; q = 8,115 kN/m = 8,115 N/mm; L_st = 2667
    let b = nb_annex::b_ster(57.707e6, 8.115, 2667.0);
    assert_relative_eq!(b, 0.889, max_relative = 2e-3);
}

#[test]
fn b_ster_hea400() {
    // M = 111,04 kNm; q = 15,615 kN/m → ook 0,889
    let b = nb_annex::b_ster(111.04e6, 15.615, 2667.0);
    assert_relative_eq!(b, 0.889, max_relative = 2e-3);
}

#[test]
fn b_ster_is_1_zonder_veldbelasting() {
    // Alleen eindmomenten → B* = 1 (zuiver geval 1 uit tabel NB.NB.1)
    assert_relative_eq!(nb_annex::b_ster(50.0e6, 0.0, 3000.0), 1.0, max_relative = 1e-9);
}

#[test]
fn c2_correctie_voor_aangrijpingspunt() {
    // C2_tabel = 0,074; z_a = 155 mm; h = 310; t_f = 15,5
    // → -0,074 · 155 / ((310-15,5)/2) = -0,074 · 155 / 147,25 = -0,0779
    // Negatief: de belasting grijpt boven het zwaartepunt aan en werkt dus
    // destabiliserend, wat de C-waarde (en daarmee M_cr) moet verlagen.
    let c2 = nb_annex::c2_gecorrigeerd(0.074, 155.0, 310.0, 15.5);
    assert_relative_eq!(c2, -0.078, max_relative = 2e-2);
}

#[test]
fn c2_is_nul_bij_aangrijpen_op_zwaartepunt() {
    assert_relative_eq!(nb_annex::c2_gecorrigeerd(0.074, 0.0, 310.0, 15.5), 0.0, max_relative = 1e-9);
}

#[test]
fn c2_op_bovenflens_geeft_de_tabelwaarde() {
    // z_a = (h - t_f)/2 = zwaartepunt bovenflens → schaalfactor exact 1,
    // met de tekenomkering dus precies −C2_tabel.
    let c2 = nb_annex::c2_gecorrigeerd(0.45, 147.25, 310.0, 15.5);
    assert_relative_eq!(c2, -0.45, max_relative = 1e-9);
}

#[test]
fn c2_onder_het_zwaartepunt_is_stabiliserend() {
    // Belasting aan de onderflens (z_a < 0) werkt stabiliserend → C2 > 0.
    let c2 = nb_annex::c2_gecorrigeerd(0.45, -147.25, 310.0, 15.5);
    assert_relative_eq!(c2, 0.45, max_relative = 1e-9);
}

#[test]
fn c1_c2_op_de_ankerpunten() {
    // B* = 0: zuivere veldbelasting, alle β convergeren (tabel NB.NB.1 geval 2)
    for beta in [-1.0, -0.5, 0.0, 0.5, 1.0] {
        let (c1, c2) = nb_annex::c1_c2_factors(beta, 0.0);
        assert_relative_eq!(c1, 1.13, max_relative = 1e-3);
        assert_relative_eq!(c2, 0.45, max_relative = 1e-3);
    }
}

#[test]
fn c1_bij_zuivere_eindmomenten_volgt_tabel_nb1() {
    // B* = 1: geval 1, C1 = 1,75 - 1,05β + 0,3β², afgekapt op 2,30; C2 = 0
    for (beta, verwacht) in [(-1.0, 2.30), (-0.5, 2.30), (0.0, 1.75), (0.5, 1.30), (1.0, 1.00)] {
        let (c1, c2) = nb_annex::c1_c2_factors(beta, 1.0);
        assert_relative_eq!(c1, verwacht, max_relative = 5e-3);
        assert_relative_eq!(c2, 0.0, max_relative = 1e-9);
    }
}

#[test]
fn c1_c2_referentiepunt_2867() {
    let (c1, c2) = nb_annex::c1_c2_factors(0.0, 0.889);
    assert_relative_eq!(c1, 1.529, max_relative = 2e-2);
    assert_relative_eq!(c2, 0.074, max_relative = 5e-2);
}

#[test]
fn c1_daalt_monotoon_in_beta() {
    // Fysisch: hoe gunstiger de momentlijn (β naar +1), hoe lager C1.
    for b in [0.0, 0.25, 0.5, 0.75, 1.0] {
        let mut vorige = f64::INFINITY;
        for beta in [-1.0, -0.5, 0.0, 0.5, 1.0] {
            let (c1, _) = nb_annex::c1_c2_factors(beta, b);
            assert!(c1 <= vorige + 1e-9, "C1 moet dalen bij stijgende β; bij B*={b}, β={beta} steeg hij van {vorige} naar {c1}");
            vorige = c1;
        }
    }
}

#[test]
fn negatieve_b_ster_gebruikt_de_absolute_waarde() {
    let (a, _) = nb_annex::c1_c2_factors(0.0, -0.6);
    let (b, _) = nb_annex::c1_c2_factors(0.0, 0.6);
    assert_relative_eq!(a, b, max_relative = 1e-9);
}

#[test]
fn m_cr_hea320_via_de_volledige_nb_flow() {
    // Ankerwaarden uit de referentie: C1=1,529, C2=-0,078, S=2006, L_kip=3733,
    // L_g=8000 → C=18,886 → M_cr=2675,8 kNm. Met de gedigitaliseerde tabellen
    // komen we ~1% lager uit; dat is de aflezingsnauwkeurigheid van de figuren.
    let s = nb_annex::s_parameter(310.0, nb_annex::E_MPA, 69852972.0, nb_annex::G_MPA, 1084313.0);
    let (c1, c2_tab) = nb_annex::c1_c2_factors(0.0, 0.889);
    let c2 = nb_annex::c2_gecorrigeerd(c2_tab, 155.0, 310.0, 15.5);
    let l_kip = nb_annex::l_kip(0.0, 2667.0);
    let c = nb_annex::c_coefficient(c1, 8000.0, l_kip, s, c2);
    let k = nb_annex::k_red(310.0, 15.5, 9.0, 300.0, 8000.0);
    let m_cr = nb_annex::m_cr_i_section(c, 8000.0, 69852972.0, 1084313.0, k);
    assert_relative_eq!(m_cr, 2675.8, max_relative = 3e-2);

    // λ_LT moet onder de drempel 0,4 blijven, net als in de referentie (0,378).
    let lambda = nen_en_1993_1_1_ltb::lambda_chi::lambda_lt(1628366.0, 235.0, m_cr);
    assert!(lambda < 0.4, "λ_LT = {lambda} moet onder 0,4 blijven → χ_LT = 1,00");
    assert_relative_eq!(lambda, 0.378, max_relative = 3e-2);
}
