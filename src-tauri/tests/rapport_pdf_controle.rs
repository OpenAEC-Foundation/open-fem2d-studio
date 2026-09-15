//! De zuivere onderdelen van `rapport_pdf` (gui_control.rs → `mod rapport`):
//! argumenten, doelpad, tijdelijk bestand, papier uit het antwoord van de
//! pagina en de controle van de geprinte PDF.
//!
//! Dit zijn unit-tests, maar ze staan in tests/ en niet in de lib: de
//! unit-testharnas van de lib laadt op Windows niet (comctl32 v5 zonder
//! manifest, zie build.rs en testbinary_laadt.rs) en staat daarom uit
//! (`[lib] test = false`). Integratietest-doelen krijgen het manifest wél.

use open_fem2d_studio_lib::gui_control::rapport::*;
use serde_json::json;

/// Een minimale PDF zoals Chromium hem schrijft: losse objecten, een
/// paginaboom en per pagina een `/Type /Page`.
fn pdf_met(paginas: usize, scheiding: &str) -> Vec<u8> {
    let mut s = String::from("%PDF-1.4\n%\u{e2}\u{e3}\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n");
    s.push_str(&format!("2 0 obj\n<</Type /Pages /Count {paginas} /Kids []>>\nendobj\n"));
    for i in 0..paginas {
        s.push_str(&format!("{} 0 obj\n<</Type{scheiding}/Page\n/Parent 2 0 R>>\nendobj\n", 3 + i));
    }
    s.push_str("%%EOF\n");
    s.into_bytes()
}

#[test]
fn telt_paginas_en_niet_de_paginaboom() {
    assert_eq!(tel_paginas(&pdf_met(1, " ")), Some(1));
    assert_eq!(tel_paginas(&pdf_met(7, " ")), Some(7));
    // Zonder spatie, en met een regeleinde tussen /Type en /Page.
    assert_eq!(tel_paginas(&pdf_met(3, "")), Some(3));
    assert_eq!(tel_paginas(&pdf_met(3, "\r\n")), Some(3));
}

#[test]
fn geen_paginaobjecten_is_geen_telling() {
    // Alleen de boom (bijvoorbeeld paginaobjecten in een gecomprimeerde
    // objectstroom): dan geen gok.
    let s = b"%PDF-1.5\n<</Type /Pages /Count 4>>\n%%EOF";
    assert_eq!(tel_paginas(s), None);
    assert!(controleer_pdf(s, 4).is_err());
}

#[test]
fn controle_eist_pdf_kop_en_een_pagina_per_vel() {
    assert_eq!(controleer_pdf(&pdf_met(5, " "), 5), Ok(5));
    let fout = controleer_pdf(&pdf_met(6, " "), 5).unwrap_err();
    assert!(fout.contains("6 pagina's") && fout.contains("5 vellen"), "{fout}");
    let geen_pdf = controleer_pdf(b"<html>niet</html>", 1).unwrap_err();
    assert!(geen_pdf.contains("%PDF-"), "{geen_pdf}");
}

#[test]
fn doelpad_moet_absoluut_zijn_en_op_pdf_eindigen() {
    assert!(doelpad(&json!({})).is_err());
    assert!(doelpad(&json!({ "pad": "rapport.pdf" })).unwrap_err().contains("absoluut"));
    let tmp = std::env::temp_dir().join("gui-control-doelpad-test");
    let geen_pdf = tmp.join("rapport.png");
    assert!(doelpad(&json!({ "pad": geen_pdf.to_string_lossy() }))
        .unwrap_err()
        .contains(".pdf"));
    let goed = tmp.join("rapport.PDF");
    assert_eq!(doelpad(&json!({ "pad": goed.to_string_lossy() })).unwrap(), goed);
    let _ = std::fs::remove_dir_all(&tmp);
}

#[test]
fn onbekend_argument_wordt_geweigerd() {
    assert!(controleer_argumenten(&json!({ "pad": "x", "type": "beperkt" })).is_ok());
    let fout = controleer_argumenten(&json!({ "pad": "x", "rapporttype": "beperkt" })).unwrap_err();
    assert!(fout.contains("rapporttype"), "{fout}");
}

#[test]
fn tijdelijk_bestand_staat_naast_het_doel() {
    let doel = std::env::temp_dir().join("uit").join("rapport.pdf");
    let t = tijdelijk_pad(&doel);
    assert_eq!(t.parent(), doel.parent());
    assert!(t.to_string_lossy().ends_with(".deel.pdf"));
    assert_ne!(t, doel);
}

#[test]
fn papier_uit_het_antwoord_van_de_pagina() {
    let v = json!({
        "orientatie": "landscape",
        "velMm": { "breedte": 297, "hoogte": 210 },
        "margesMm": { "boven": 18, "onder": 20, "links": 15, "rechts": 15 },
    });
    let p = papier_uit_antwoord(&v).unwrap();
    assert!(p.liggend);
    assert_eq!((p.vel_breedte_mm, p.vel_hoogte_mm), (297.0, 210.0));
    assert_eq!((p.marge_boven_mm, p.marge_onder_mm, p.marge_links_mm, p.marge_rechts_mm), (18.0, 20.0, 15.0, 15.0));
    assert!(papier_uit_antwoord(&json!({ "orientatie": "schuin" })).is_err());
    let zonder_marge = json!({ "orientatie": "portrait", "velMm": { "breedte": 210, "hoogte": 297 } });
    assert!(papier_uit_antwoord(&zonder_marge).unwrap_err().contains("margesMm"));
}
