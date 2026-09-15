//! Opmaakhulpjes voor uitgeschreven afleidingen (deelstappen).
//!
//! Gedeeld door de knikafleiding van staal (`column_buckling`) en die van hout
//! (`nen-en-1995-1-1::stability`). Dezelfde schrijfwijze als de kipketen in
//! `nen-en-1993-1-1-ltb`, zodat twee ketens in één rapport er hetzelfde uitzien:
//! de Nederlandse decimaalkomma als `{,}` in LaTeX, geen afgeknabbelde nullen
//! behalve een decimaaldeel dat helemaal nul is.

use nen_en_1993_1_1_section::{Deelstap, NamedValue};

/// Een getal in LaTeX-mathmodus met de Nederlandse decimaalkomma.
///
/// `{,}` in plaats van een losse `,`: LaTeX zet achter een komma in mathmodus
/// een spatie, waardoor "1,13" als "1, 13" oogt.
pub fn lx(v: f64, decimalen: usize) -> String {
    if !v.is_finite() {
        return r"\text{n.v.t.}".to_string();
    }
    let mut s = format!("{v:.decimalen$}");
    if let Some((geheel, fractie)) = s.split_once('.') {
        if fractie.chars().all(|c| c == '0') {
            s = geheel.to_string();
        }
    }
    if s.trim_start_matches('-').chars().all(|c| c == '0' || c == '.') {
        s = s.trim_start_matches('-').to_string();
    }
    s.replace('.', "{,}")
}

/// Zelfde getal, tussen haakjes als het negatief is — anders leest
/// `0{,}8 \cdot -0{,}5` als een tikfout.
pub fn lxh(v: f64, decimalen: usize) -> String {
    let s = lx(v, decimalen);
    if s.starts_with('-') {
        format!("({s})")
    } else {
        s
    }
}

/// Een getal als platte tekst met decimaalkomma, voor kanttekeningen.
pub fn nl(v: f64, decimalen: usize) -> String {
    if !v.is_finite() {
        return "n.v.t.".to_string();
    }
    format!("{v:.decimalen$}").replace('.', ",")
}

pub fn nv(symbol: &str, value: f64, unit: &str) -> NamedValue {
    NamedValue {
        symbol: symbol.to_string(),
        value,
        unit: unit.to_string(),
    }
}

/// Bouwt één deelstap. Alle velden expliciet, zodat er geen stap kan ontstaan
/// zonder vindplaats.
///
/// Afspraak voor `ingevuld_latex`: de formule met de getallen ingevuld, ZONDER
/// de uitkomst erachter. De weergave (scherm, live rapport, PDF) zet
/// "symbool = uitkomst" er zelf onder; een ingevulde regel die zelf al op
/// "= 0,2276" eindigt, zou dat getal dubbel tonen.
#[allow(clippy::too_many_arguments)]
pub fn stap(
    id: &str,
    titel: &str,
    symbol: &str,
    article: &str,
    formula_latex: String,
    ingevuld_latex: String,
    variables: Vec<NamedValue>,
    value: Option<f64>,
    unit: &str,
    notes: Vec<String>,
) -> Deelstap {
    Deelstap {
        id: id.to_string(),
        titel: titel.to_string(),
        symbol: symbol.to_string(),
        article: article.to_string(),
        formula_latex,
        ingevuld_latex,
        variables,
        value,
        unit: unit.to_string(),
        notes,
    }
}
