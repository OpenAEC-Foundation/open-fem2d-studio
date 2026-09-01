//! Algemene EN 1993-1-1-formule voor M_cr (alternatief voor de NB-methode).

use approx::assert_relative_eq;
use nen_en_1993_1_1_ltb::{en_general, nb_annex};

#[test]
fn i_w_volgens_nb_hea320() {
    // I_w = (d')²·b³·t/24 met d' = h - t_f = 310 - 15,5 = 294,5
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    assert_relative_eq!(iw, 1512e9, max_relative = 2e-3);
}

#[test]
fn i_w_volgens_nb_hea400() {
    // d' = 390 - 19 = 371 → 2942e9 mm⁶
    let iw = nb_annex::i_w_nb(390.0, 300.0, 19.0);
    assert_relative_eq!(iw, 2942e9, max_relative = 2e-3);
}

#[test]
fn m_cr_algemeen_hea320_bij_volledige_overspanning() {
    // HEA 320, L_cr = 8000 mm, C1 = 1,0, I_w volgens de NB.
    // Handmatig: π²·210000·69852972/8000² = 2,262e6 N
    // √(1512e9/69852972 + 8000²·80769·1084313/(π²·210000·69852972))
    //   = √(21646 + 38718) = 245,7 mm
    // → M_cr = 2,262e6 · 245,7 = 5,557e8 N·mm = 555,7 kNm
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    let m_cr = en_general::m_cr_algemeen(1.0, 8000.0, 69852972.0, iw, 1084313.0);
    assert_relative_eq!(m_cr, 555.7, max_relative = 1e-2);
}

#[test]
fn hogere_c1_geeft_evenredig_hogere_m_cr() {
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    let laag = en_general::m_cr_algemeen(1.0, 8000.0, 69852972.0, iw, 1084313.0);
    let hoog = en_general::m_cr_algemeen(1.77, 8000.0, 69852972.0, iw, 1084313.0);
    assert_relative_eq!(hoog / laag, 1.77, max_relative = 1e-6);
}

#[test]
fn kortere_kiplengte_geeft_hogere_m_cr() {
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    let lang = en_general::m_cr_algemeen(1.0, 8000.0, 69852972.0, iw, 1084313.0);
    let kort = en_general::m_cr_algemeen(1.0, 4000.0, 69852972.0, iw, 1084313.0);
    assert!(kort > lang, "kortere kiplengte hoort een hoger M_cr te geven: {kort} vs {lang}");
}

#[test]
fn ongeldige_invoer_geeft_nul() {
    let iw = nb_annex::i_w_nb(310.0, 300.0, 15.5);
    assert_eq!(en_general::m_cr_algemeen(1.0, 0.0, 69852972.0, iw, 1084313.0), 0.0);
    assert_eq!(en_general::m_cr_algemeen(1.0, 8000.0, 0.0, iw, 1084313.0), 0.0);
}

#[test]
fn standaardmethode_is_de_nederlandse_bijlage() {
    assert_eq!(en_general::McrMethode::default(), en_general::McrMethode::NederlandseBijlage);
}
