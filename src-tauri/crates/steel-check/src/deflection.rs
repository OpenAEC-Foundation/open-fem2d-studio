//! BGT-doorbuigingstoetsen: eindzakking `w_fin` en bijkomende zakking `w_add`.
//!
//! De grenswaarden komen uit **NEN-EN 1990:2002/NB:2019, A1.4.3**. Twee
//! artikelen, twee verschillende grootheden:
//!
//! * **A1.4.3(4)** gaat over `w_max` — de totale doorbuiging met de zeeg
//!   verrekend. "Indien het uiterlijk van de constructie van belang is, moet de
//!   doorbuiging w_max bij zowel vloeren als daken worden beperkt tot 1/250
//!   deel van ℓ_rep." Dat is de eis waar `w_fin` op wordt getoetst.
//! * **A1.4.3(3)** gaat over `w2 + w3` — het deel van de doorbuiging bovenop
//!   wat de blijvende belasting al veroorzaakt (zie figuur NB.1 bij A1.4.3(2)).
//!   Dat is de eis waar `w_add` op wordt getoetst, en hij kent VIER
//!   categorieën met vier verschillende noemers.
//!
//! In beide gevallen geldt: "ℓ_rep is de lengte van een overspanning of
//! tweemaal de lengte van een uitkraging."

use crate::input::DeflectionClass;
use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

/// Noemer n in de eindzakkingsgrens L/n voor `w_fin` (≈ w_max).
///
/// Deze waarden zijn ongewijzigd. Waar ze vandaan komen, gemeten langs
/// A1.4.3(4) (w_max ≤ ℓ_rep/250 voor zowel vloeren als daken):
///
/// * `Roof` = 250 — letterlijk de NB-waarde, met ℓ_rep = de overspanning.
/// * `Floor` = 333 — strenger dan de 250 die de NB minimaal eist. Veilig aan
///   de goede kant; het getal is een huiskeuze, geen normwaarde.
/// * `FloorBrittlePartitions` = 333 — dezelfde huiskeuze als `Floor`. De NB
///   geeft voor deze categorie geen eigen w_max-eis (het onderscheid zit in
///   A1.4.3(3), dus in w_add); daarom nooit ruimer dan een gewone vloer.
/// * `Cantilever` = 150 op de **staaflengte**. Met ℓ_rep = 2·L komt dat neer
///   op ℓ_rep/300, opnieuw strenger dan de ℓ_rep/250 uit A1.4.3(4).
/// * `Custom` — volledig door de aanroeper opgegeven.
pub fn default_numerator(class: DeflectionClass, custom: u32) -> u32 {
    match class {
        DeflectionClass::Floor => 333,
        DeflectionClass::FloorBrittlePartitions => 333,
        DeflectionClass::Roof => 250,
        DeflectionClass::Cantilever => 150,
        DeflectionClass::Custom => custom,
    }
}

/// Leesbare naam van een klasse, voor het rapport.
fn class_label(class: DeflectionClass) -> &'static str {
    match class {
        DeflectionClass::Floor => "Floor",
        DeflectionClass::FloorBrittlePartitions => "FloorBrittlePartitions",
        DeflectionClass::Roof => "Roof",
        DeflectionClass::Cantilever => "Cantilever",
        DeflectionClass::Custom => "Custom",
    }
}

pub fn check_deflection(
    actual_mm: f64,
    length_m: f64,
    class: DeflectionClass,
    limit_numerator: u32,
) -> ResistanceCalc {
    let numerator = default_numerator(class, limit_numerator);
    let limit_mm = (length_m * 1000.0) / numerator.max(1) as f64;
    let uc = if limit_mm > 0.0 { actual_mm / limit_mm } else { 0.0 };

    ResistanceCalc {
        id: "sls_deflection".to_string(),
        title: "Doorbuiging (BGT)".to_string(),
        article: "NEN-EN 1990 (SLS)".to_string(),
        force_state: ForceStateSnapshot { combination_id: 0, position_mm: 0.0, forces: InternalForces::default() },
        formula_latex: format!(r"\delta_{{lim}} = L / {}", numerator),
        variables: vec![
            NamedValue { symbol: "L".to_string(), value: length_m * 1000.0, unit: "mm".to_string() },
            NamedValue { symbol: "L_{type}".to_string(), value: numerator as f64, unit: format!("({})", class_label(class)) },
        ],
        value: limit_mm,
        unit: "mm".to_string(),
        uc: Some(UnityCheck {
            ed: actual_mm, rd: limit_mm, uc,
            formula_latex: r"\delta / \delta_{lim}".to_string(),
        }),
        status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes: vec![],
    }
}

/// Eindzakking: w_fin = w_z − w_zeeg.
///
/// Beide in mm met teken (negatief = naar beneden). Een zeeg (pre-camber)
/// wordt in dezelfde tekenconventie opgegeven en compenseert de zakking.
pub fn w_fin_mm(w_z_mm: f64, w_pre_camber_mm: f64) -> f64 {
    w_z_mm - w_pre_camber_mm
}

/// Bijkomende zakking na oplevering: w_add = w_fin − w_BGT,permanent.
pub fn w_add_mm(w_fin_mm: f64, w_sls_permanent_mm: f64) -> f64 {
    w_fin_mm - w_sls_permanent_mm
}

/// Grenswaarde L/noemer in mm.
pub fn grens_mm(lengte_mm: f64, noemer: f64) -> f64 {
    if noemer.abs() < 1e-9 { return f64::INFINITY; }
    lengte_mm / noemer
}

// ═══════════════════════════════════════════════════════════════════════════
//  Grenswaarde voor w_add — NEN-EN 1990:2002/NB:2019 A1.4.3(3)
// ═══════════════════════════════════════════════════════════════════════════
//
// De vier gedachtestreepjes van A1.4.3(3), letterlijk:
//
//   1. bij vloeren die scheurgevoelige scheidingswanden dragen, de som van de
//      vervorming w2 en w3 bij de FREQUENTE belastingscombinatie (6.15b) niet
//      groter dan 1/500 deel van ℓ_rep;
//   2. bij overige vloeren en daken die intensief door personen worden
//      gebruikt, w2 + w3 bij de FREQUENTE belastingscombinatie (6.15b) niet
//      groter dan 3/1 000 deel van ℓ_rep;
//   3. bij overige daken, w2 + w3 bij de KARAKTERISTIEKE belastingscombinatie
//      (6.14b) met afzonderlijk de gebruiksbelasting, de windbelasting en de
//      sneeuwbelasting als extreme veranderlijke belasting, niet groter dan
//      1/250 deel van ℓ_rep;
//   4. bij VLOERAFSCHEIDINGEN ter plaatse van een hoogteverschil, de verticale
//      w2 + w3 van de bovenrand/bovenregel (of de onderregel) niet groter dan
//      1/150 deel van ℓ_rep.
//
// Hier stond tot september 2026 één constante `W_ADD_NOEMER = 150,0`, voor elke
// staaf, "conform de referentie-uitwerking". Dat is de vierde regel hierboven,
// en die gaat over een balustrade — niet over een ligger. Voor een gewone
// vloerligger is L/150 twee tot ruim drie keer zo ruim als de norm toestaat.
//
// De referentie-uitwerking blijft na te rekenen: `deflection_add_limit_numerator`
// zet elke noemer die je wilt, en het rapport zegt er dan bij dat hij is
// opgegeven en niet uit de norm volgt.

/// De grenswaarde voor w_add plus de verantwoording ervan.
#[derive(Clone, Debug)]
pub struct WAddGrens {
    /// Noemer n in ℓ_rep/n.
    pub noemer: f64,
    /// Referentielengte ℓ_rep in mm: de overspanning, of tweemaal de
    /// uitkraaglengte.
    pub l_rep_mm: f64,
    /// De grenswaarde zelf, in mm.
    pub grens_mm: f64,
    /// Artikel dat in de kop van de toets komt te staan.
    pub artikel: &'static str,
    /// Regels voor `notes`: welke NB-categorie, welk artikel, welke combinatie.
    pub toelichting: Vec<String>,
}

/// Noemer als leesbaar getal: "150" in plaats van "150.0000", "333.33" waar
/// hij werkelijk niet geheel is.
fn noemer_tekst(n: f64) -> String {
    if (n - n.round()).abs() < 1e-9 {
        format!("{}", n.round() as i64)
    } else {
        format!("{n:.2}")
    }
}

/// Bepaalt de grenswaarde voor w_add uit de doorbuigingsklasse.
///
/// `opgegeven_noemer > 0` overschrijft de klassewaarde en rekent op de
/// **staaflengte** (geen ℓ_rep-verdubbeling): dat is de escape voor een
/// externe referentie-uitwerking met een vaste noemer.
///
/// `fin_noemer` is de noemer van de eindzakking; hij telt alleen mee bij
/// klasse `Custom`, waar dezelfde opgegeven n voor w_fin én w_add geldt —
/// dezelfde afspraak als de houttoetsing hanteert.
pub fn w_add_grens(
    lengte_mm: f64,
    class: DeflectionClass,
    fin_noemer: u32,
    opgegeven_noemer: f64,
    is_cantilever: bool,
) -> WAddGrens {
    const NB_A1_4_3_3: &str = "NEN-EN 1990:2002/NB:2019 A1.4.3(3)";
    // De vier NB-waarden op een rij, voor een lezer die wil zien wat er níet
    // is gekozen.
    const NB_OVERZICHT: &str = "De NB kent voor w2 + w3 alleen ℓ_rep/500 \
        (vloeren met scheurgevoelige scheidingswanden), 3/1 000 · ℓ_rep \
        (overige vloeren en daken die intensief door personen worden gebruikt), \
        ℓ_rep/250 (overige daken) en — uitsluitend voor vloerafscheidingen ter \
        plaatse van een hoogteverschil — ℓ_rep/150.";

    // w_add ÍS w2 + w3: de doorbuiging bovenop het deel dat de blijvende
    // belasting al veroorzaakt. Die gelijkstelling hoort in het rapport te
    // staan, want zij bepaalt welk artikel van toepassing is.
    let definitie = "w_add = w_fin − w_BGT,permanent staat voor de som w2 + w3 uit figuur NB.1 \
         bij NEN-EN 1990:2002/NB:2019 A1.4.3(2): de doorbuiging bovenop het deel dat de \
         blijvende belasting al veroorzaakt."
        .to_string();

    // ── Opgegeven noemer: klassewaarde overschreven ─────────────────────────
    if opgegeven_noemer > 0.0 {
        return WAddGrens {
            noemer: opgegeven_noemer,
            l_rep_mm: lengte_mm,
            grens_mm: grens_mm(lengte_mm, opgegeven_noemer),
            artikel: "NEN-EN 1990 (BGT) — noemer opgegeven",
            toelichting: vec![
                definitie,
                format!(
                    "De noemer n = {n} is expliciet opgegeven en op de staaflengte toegepast; \
                     de klassewaarde uit {NB_A1_4_3_3} is daarmee overschreven. Grens = \
                     {grens:.1} mm. {NB_OVERZICHT}",
                    n = noemer_tekst(opgegeven_noemer),
                    grens = grens_mm(lengte_mm, opgegeven_noemer),
                ),
            ],
        };
    }

    // ── Custom: één opgegeven n voor w_fin én w_add ─────────────────────────
    if class == DeflectionClass::Custom {
        // n = 0 is geen keuze maar een gat in de invoer. Terugvallen op de
        // NB-waarde van een gewone vloer mag, maar niet stilzwijgend.
        let (n, gat) = if fin_noemer > 0 {
            (fin_noemer as f64, None)
        } else {
            (
                1000.0 / 3.0,
                Some(format!(
                    "Klasse 'Custom' zonder noemer: er is teruggevallen op 3/1 000 · ℓ_rep \
                     ({NB_A1_4_3_3}, tweede gedachtestreepje). Geef een noemer op als een \
                     andere categorie van toepassing is."
                )),
            )
        };
        let mut toelichting = vec![
            definitie,
            format!(
                "Klasse 'Custom': de opgegeven noemer n = {tekst} geldt voor w_fin én w_add, en \
                 is op de staaflengte toegepast. Grens = {grens:.1} mm. {NB_OVERZICHT}",
                tekst = noemer_tekst(n),
                grens = grens_mm(lengte_mm, n),
            ),
        ];
        toelichting.extend(gat);
        return WAddGrens {
            noemer: n,
            l_rep_mm: lengte_mm,
            grens_mm: grens_mm(lengte_mm, n),
            artikel: "NEN-EN 1990 (BGT) — noemer opgegeven",
            toelichting,
        };
    }

    // ── NB-categorie bij de klasse ──────────────────────────────────────────
    //
    // `grens_tekst` is de formulering van de norm zélf ("3/1 000 deel van
    // ℓ_rep"), niet een afgeronde noemer. Anders zou het rapport "ℓ_rep/333,3"
    // melden waar de NB "3/1 000" schrijft, en dan is niet meer na te gaan of
    // de 333 uit de norm komt of uit een afronding.
    //
    // `Cantilever` zegt niets over het gebruik van het vlak, alleen over de
    // referentielengte. Voor de categorie wordt daarom dezelfde regel
    // aangehouden als bij `Floor` — het tweede gedachtestreepje, dat samen met
    // het eerste de strengste van de twee vloerregels is die zonder verdere
    // kennis van het gebouw te verantwoorden valt. Draagt de uitkraging
    // scheurgevoelige scheidingswanden, dan hoort de klasse
    // `FloorBrittlePartitions` gekozen te worden; dat staat ook in de notitie.
    let (noemer, grens_tekst, categorie, streepje, combinatie) = match class {
        DeflectionClass::FloorBrittlePartitions => (
            500.0,
            "1/500 deel van ℓ_rep",
            "vloeren die scheurgevoelige scheidingswanden dragen",
            "eerste",
            "de FREQUENTE belastingscombinatie (uitdrukking 6.15b)",
        ),
        DeflectionClass::Roof => (
            250.0,
            "1/250 deel van ℓ_rep",
            "overige daken",
            "derde",
            "de KARAKTERISTIEKE belastingscombinatie (uitdrukking 6.14b), met afzonderlijk de \
             gebruiksbelasting, de windbelasting en de sneeuwbelasting als extreme veranderlijke \
             belasting",
        ),
        // Floor en Cantilever delen dezelfde categorie.
        _ => (
            1000.0 / 3.0,
            "3/1 000 deel van ℓ_rep",
            "overige vloeren en daken die intensief door personen worden gebruikt",
            "tweede",
            "de FREQUENTE belastingscombinatie (uitdrukking 6.15b)",
        ),
    };

    // ℓ_rep: "de lengte van een overspanning of tweemaal de lengte van een
    // uitkraging" (A1.4.3(3), verklaring bij ℓ_rep). Zowel de klasse als de
    // losse vlag `is_cantilever` mag dat aanzetten; ze horen hetzelfde te
    // zeggen, maar één van beide vergeten mag niet stil goed gaan.
    let uitkraging = is_cantilever || class == DeflectionClass::Cantilever;
    let l_rep_mm = if uitkraging { 2.0 * lengte_mm } else { lengte_mm };

    let mut toelichting = vec![
        definitie,
        format!(
            "Grenswaarde: {grens_tekst}, volgens {NB_A1_4_3_3}, {streepje} gedachtestreepje: \
             {categorie}. Met ℓ_rep = {l_rep_mm:.0} mm is dat {grens:.1} mm. De norm meet w2 + w3 \
             daar bij {combinatie} — controleer dat de doorbuiging waarmee hier is gerekend uit \
             die combinatie komt.",
            grens = grens_mm(l_rep_mm, noemer),
        ),
    ];
    if uitkraging {
        toelichting.push(format!(
            "ℓ_rep = 2 × {lengte_mm:.0} = {l_rep_mm:.0} mm: bij een uitkraging is ℓ_rep tweemaal \
             de uitkraaglengte ({NB_A1_4_3_3}, verklaring bij ℓ_rep). De eindzakking w_fin \
             hierboven rekent NIET met deze verdubbeling maar met de staaflengte en noemer 150, \
             wat op ℓ_rep/300 neerkomt en dus strenger is dan de ℓ_rep/250 uit A1.4.3(4)."
        ));
    }
    if class == DeflectionClass::Cantilever {
        toelichting.push(
            "De klasse 'uitkraging' zegt niets over het gebruik van het vloer- of dakvlak; hier \
             is de categorie 'overige vloeren en daken die intensief door personen worden \
             gebruikt' aangehouden. Draagt de uitkraging scheurgevoelige scheidingswanden, kies \
             dan de klasse daarvoor; is het een overig dak, kies dan 'dak'."
                .to_string(),
        );
    }

    WAddGrens {
        noemer,
        l_rep_mm,
        grens_mm: grens_mm(l_rep_mm, noemer),
        artikel: NB_A1_4_3_3,
        toelichting,
    }
}

/// Beide doorbuigingstoetsen: eindzakking w_fin (L/klasse, A1.4.3(4)) en
/// bijkomende zakking w_add (ℓ_rep/n uit A1.4.3(3), zie [`w_add_grens`]).
#[allow(clippy::too_many_arguments)]
pub fn check_deflection_pair(
    w_z_mm: f64,
    w_pre_camber_mm: f64,
    w_sls_permanent_mm: f64,
    length_m: f64,
    class: DeflectionClass,
    limit_numerator: u32,
    w_add_limit_numerator: f64,
    is_cantilever: bool,
) -> (ResistanceCalc, ResistanceCalc) {
    let lengte_mm = length_m * 1000.0;
    let noemer_fin = default_numerator(class, limit_numerator) as f64;

    let w_fin = w_fin_mm(w_z_mm, w_pre_camber_mm);
    let w_add = w_add_mm(w_fin, w_sls_permanent_mm);
    let add = w_add_grens(lengte_mm, class, limit_numerator, w_add_limit_numerator, is_cantilever);

    let calc = |id: &str,
                titel: &str,
                artikel: &str,
                w: f64,
                noemer: f64,
                referentie_mm: f64,
                latex: &str,
                notes: Vec<String>| {
        let grens = grens_mm(referentie_mm, noemer);
        let uc = if grens.is_finite() && grens > 0.0 { w.abs() / grens } else { 0.0 };
        ResistanceCalc {
            id: id.to_string(),
            title: titel.to_string(),
            article: artikel.to_string(),
            force_state: ForceStateSnapshot {
                combination_id: 0, position_mm: 0.0, forces: InternalForces::default(),
            },
            formula_latex: latex.to_string(),
            variables: vec![
                NamedValue { symbol: "L".to_string(), value: referentie_mm, unit: "mm".to_string() },
                NamedValue { symbol: "w".to_string(), value: w, unit: "mm".to_string() },
                NamedValue { symbol: "L/n".to_string(), value: noemer, unit: "-".to_string() },
            ],
            value: grens,
            unit: "mm".to_string(),
            uc: Some(UnityCheck {
                ed: w.abs(), rd: grens, uc,
                formula_latex: r"|w| / w_{max}".to_string(),
            }),
            status: if uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
            notes,
        }
    };

    (
        calc(
            "deflection_w_fin", "Doorbuiging w_fin (BGT)", "NEN-EN 1990 (BGT)",
            w_fin, noemer_fin, lengte_mm,
            r"w_{fin,z} = w_z - w_{zeeg,z}",
            vec![],
        ),
        calc(
            "deflection_w_add", "Doorbuiging w_add (BGT)", add.artikel,
            w_add, add.noemer, add.l_rep_mm,
            r"w_{add,z} = w_{fin,z} - w_{BGT,perm,z}",
            add.toelichting,
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    /// Regressie op de vier noemers uit NEN-EN 1990:2002/NB:2019 A1.4.3(3).
    /// De tabelregel staat bij elke waarde, zodat een latere wijziging opvalt.
    #[test]
    fn nb_noemers_per_klasse() {
        let g = |class, is_cant| w_add_grens(6000.0, class, 333, 0.0, is_cant);

        // A1.4.3(3), eerste gedachtestreepje: "bij vloeren die scheurgevoelige
        // scheidingswanden dragen … niet groter dan 1/500 deel van ℓ_rep".
        let brittle = g(DeflectionClass::FloorBrittlePartitions, false);
        assert_relative_eq!(brittle.noemer, 500.0);
        assert_relative_eq!(brittle.l_rep_mm, 6000.0);
        assert_relative_eq!(brittle.grens_mm, 12.0);

        // A1.4.3(3), tweede gedachtestreepje: "bij overige vloeren en daken die
        // intensief door personen worden gebruikt … niet groter dan 3/1 000
        // deel van ℓ_rep".
        let floor = g(DeflectionClass::Floor, false);
        assert_relative_eq!(floor.noemer, 1000.0 / 3.0);
        assert_relative_eq!(floor.grens_mm, 18.0); // 3/1000 · 6000

        // A1.4.3(3), derde gedachtestreepje: "bij overige daken … niet groter
        // dan 1/250 deel van ℓ_rep".
        let roof = g(DeflectionClass::Roof, false);
        assert_relative_eq!(roof.noemer, 250.0);
        assert_relative_eq!(roof.grens_mm, 24.0);

        // A1.4.3(3), verklaring: "ℓ_rep is de lengte van een overspanning of
        // tweemaal de lengte van een uitkraging."
        let cant = g(DeflectionClass::Cantilever, false);
        assert_relative_eq!(cant.noemer, 1000.0 / 3.0);
        assert_relative_eq!(cant.l_rep_mm, 12000.0);
        assert_relative_eq!(cant.grens_mm, 36.0); // 3/1000 · 12000

        // Dezelfde verdubbeling via de losse vlag, zonder de klasse.
        let vlag = g(DeflectionClass::Floor, true);
        assert_relative_eq!(vlag.l_rep_mm, 12000.0);
        assert_relative_eq!(vlag.grens_mm, 36.0);
    }

    /// De vaste L/150 uit de oude constante is geen NB-waarde voor een ligger
    /// (die 150 hoort bij vloerafscheidingen, A1.4.3(3) vierde
    /// gedachtestreepje). Hij blijft bereikbaar via het expliciete veld, en
    /// levert dan exact het oude getal.
    #[test]
    fn opgegeven_noemer_overschrijft_de_klasse() {
        let g = w_add_grens(6000.0, DeflectionClass::Floor, 333, 150.0, false);
        assert_relative_eq!(g.noemer, 150.0);
        assert_relative_eq!(g.l_rep_mm, 6000.0);
        assert_relative_eq!(g.grens_mm, 40.0);
        assert!(g.toelichting.iter().any(|n| n.contains("expliciet opgegeven")));

        // Ook bij een uitkraging blijft de opgegeven noemer op de staaflengte
        // staan: wie zelf een getal geeft, krijgt geen stille verdubbeling.
        let c = w_add_grens(6000.0, DeflectionClass::Cantilever, 333, 150.0, true);
        assert_relative_eq!(c.l_rep_mm, 6000.0);
        assert_relative_eq!(c.grens_mm, 40.0);
    }

    /// Klasse `Custom`: één noemer voor w_fin én w_add.
    #[test]
    fn custom_gebruikt_dezelfde_noemer_als_w_fin() {
        let g = w_add_grens(6000.0, DeflectionClass::Custom, 400, 0.0, false);
        assert_relative_eq!(g.noemer, 400.0);
        assert_relative_eq!(g.grens_mm, 15.0);

        // Custom zonder noemer valt terug op de NB-waarde van een gewone
        // vloer, met een notitie die dat zegt.
        let leeg = w_add_grens(6000.0, DeflectionClass::Custom, 0, 0.0, false);
        assert_relative_eq!(leeg.noemer, 1000.0 / 3.0);
        assert!(leeg.toelichting.iter().any(|n| n.contains("zonder noemer")));
    }

    /// De reden staat in het rapport: categorie, artikel en combinatie.
    #[test]
    fn toelichting_noemt_categorie_artikel_en_combinatie() {
        let (_, add) = check_deflection_pair(
            -20.0, 0.0, 0.0, 6.0, DeflectionClass::Roof, 333, 0.0, false,
        );
        assert_eq!(add.article, "NEN-EN 1990:2002/NB:2019 A1.4.3(3)");
        let tekst = add.notes.join(" ");
        assert!(tekst.contains("overige daken"));
        assert!(tekst.contains("derde gedachtestreepje"));
        assert!(tekst.contains("KARAKTERISTIEKE"));
        // 6000/250 = 24 mm.
        assert_relative_eq!(add.uc.as_ref().unwrap().rd, 24.0);
    }

    /// Een vloerligger van 6 m: de oude vaste L/150 gaf 40 mm, de NB-regel
    /// geeft 18 mm. Dat is de fout die deze wijziging repareert — factor 2,2.
    #[test]
    fn vloerligger_was_ruim_twee_keer_te_ruim() {
        let (_, add) = check_deflection_pair(
            -20.0, 0.0, 0.0, 6.0, DeflectionClass::Floor, 333, 0.0, false,
        );
        let uc = add.uc.as_ref().unwrap();
        assert_relative_eq!(uc.rd, 18.0);
        assert_relative_eq!(uc.uc, 20.0 / 18.0, max_relative = 1e-9);
        assert_eq!(add.status, CheckStatus::NotOk); // met L/150 was dit UC 0,50
    }
}
