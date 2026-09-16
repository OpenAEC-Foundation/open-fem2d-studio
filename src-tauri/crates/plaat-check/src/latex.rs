//! Getallen voor de ingevulde regels van de afleiding.
//!
//! De ingevulde regel van een deelstap wordt in de kern gemaakt (zie
//! `nen_en_1993_1_1_section::Deelstap`). De frontend vervangt in de HOOFDformule
//! symbolen door getallen, maar zet een negatief getal niet tussen haakjes: een
//! σ_z,Ed van −80 in `\sigma_{z,Ed}^2` zou daar als −80² lezen, en dat is
//! −6400 in plaats van 6400. Daarom staan de spanningen hier in deelstappen met
//! een ingevulde regel uit de kern, en blijft de hoofdformule bij grootheden die
//! niet negatief kunnen zijn.

/// Een getal in Nederlandse notatie voor LaTeX: hoogstens `decimalen`
/// decimalen, zonder loze nullen, met `{,}` als decimaalteken.
pub fn getal(v: f64, decimalen: usize) -> String {
    let s = format!("{v:.decimalen$}");
    let s = if s.contains('.') {
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    } else {
        s
    };
    // "-0" na afronden is geen richting.
    let s = if s == "-0" { "0".to_string() } else { s };
    s.replace('.', "{,}")
}

/// Als [`getal`], maar een negatief getal tussen haakjes — voor een plaats
/// waar het wordt gekwadrateerd of vermenigvuldigd.
pub fn factor(v: f64, decimalen: usize) -> String {
    let g = getal(v, decimalen);
    if g.starts_with('-') {
        format!("({g})")
    } else {
        g
    }
}

/// Een getal voor lopende tekst (notities): komma als decimaalteken.
pub fn tekst(v: f64, decimalen: usize) -> String {
    getal(v, decimalen).replace("{,}", ",")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nederlandse_notatie_zonder_loze_nullen() {
        assert_eq!(getal(235.0, 3), "235");
        assert_eq!(getal(0.8510638, 3), "0{,}851");
        assert_eq!(getal(-80.0, 2), "-80");
        assert_eq!(getal(-0.0001, 2), "0");
        assert_eq!(factor(-80.0, 2), "(-80)");
        assert_eq!(factor(80.5, 2), "80{,}5");
        assert_eq!(tekst(1.25, 2), "1,25");
    }
}
