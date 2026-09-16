//! §6.1.7 afschuiving.

use mechanics::ForceStateSnapshot;
use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};

use crate::section::TimberSection;

/// Rekenwaarde van de schuifspanning, `tau_d = V*S / (I*b_ef)` met
/// `b_ef = k_cr*b` uit (6.13a).
///
/// WAT DE NORM VRAAGT
/// Art. 6.1.7(1)P eist `tau_d <= f_v,d` en omschrijft `tau_d` als "de
/// rekenwaarde van de schuifspanning" — een formule staat er niet bij. Dat is
/// dus de gewone schuifspanning van Jourawski, `tau = V*S/(I*b)`. (6.13a) zegt
/// daar vervolgens over `b`: het is "de breedte van het van toepassing zijnde
/// deel van het element", oftewel de breedte op de vezel die wordt beschouwd.
///
/// `1,5*V/A` is daarvan de uitkomst voor een rechthoek en niet de regel zelf:
/// met `S = b*h²/8` en `I = b*h³/12` valt `V*S/(I*b)` samen met `1,5*V/(b*h)`.
/// Voor een samengestelde doorsnede gaat die gelijkstelling niet op, en dan is
/// zij onveilig: bij de I-vormige ligger van de externe referentie-berekening
/// (flenzen 1000 x 40, lijf 71 x 40, h = 120) is `V*S/(I*b_lijf)` ruim negen
/// keer zo groot als `1,5*V/A`, omdat de dwarskracht door het lijf moet en
/// niet door de flenzen.
///
/// `v_ed_kn` in kN, alle maten in mm, uitkomst in N/mm².
pub fn tau_d_mpa(v_ed_kn: f64, section: &TimberSection, k_cr: f64) -> f64 {
    let b_ef = k_cr * section.b_schuif_mm;
    if b_ef <= 0.0 || section.i_y_mm4 <= 0.0 {
        return 0.0;
    }
    v_ed_kn.abs() * 1e3 * section.s_y_mm3 / (section.i_y_mm4 * b_ef)
}

/// Scheurfactor `k_cr` volgens de Nederlandse nationale bijlage bij 6.1.7,
/// afgeleid uit de verhouding lijfdikte / flensbreedte.
///
/// De NB (NEN-EN 1995-1-1:2005+A2:2014/NB:2013) schrijft voor:
///  * liggers met een **prismatische** doorsnede: `k_cr = 1,0`;
///  * liggers die uit een I- of T-profiel bestaan met een lijf van gezaagd of
///    gelamineerd hout: `k_cr = 1,0` bij een lijfdikte groter dan of gelijk
///    aan de flensbreedte, `k_cr = 0,8` bij een lijfdikte kleiner dan de helft
///    van de flensbreedte, en voor tussenliggende lijfdikten mag lineair
///    worden geinterpoleerd (OPMERKING 1);
///  * kokerliggers waarbij de lijfdikte gelijk is aan de som van de
///    afzonderlijke lijfdikten: dezelfde twee grenzen.
///
/// De aanbevolen waarde 0,67 uit A1 geldt hier dus NIET: de nationale keuze
/// gaat voor, en die is voor een prismatische ligger 1,0.
///
/// Deze functie dekt de eerste en de tweede regel in een uitdrukking: bij
/// `b_lijf >= b_flens` (een rechthoek is het grensgeval) komt er 1,0 uit, bij
/// `b_lijf <= b_flens/2` komt er 0,8 uit, en daartussen de rechte lijn.
pub fn k_cr_nb(b_lijf_mm: f64, b_flens_mm: f64) -> f64 {
    if b_lijf_mm <= 0.0 || b_flens_mm <= 0.0 || b_lijf_mm >= b_flens_mm {
        return 1.0;
    }
    let half = b_flens_mm / 2.0;
    if b_lijf_mm <= half {
        return 0.8;
    }
    // Lineair tussen (half -> 0,8) en (b_flens -> 1,0).
    0.8 + 0.2 * (b_lijf_mm - half) / (b_flens_mm - half)
}

/// §6.1.7, vergelijking (6.13): `tau_d <= f_v,d`.
///
/// `k_cr` is de scheurfactor uit A1 (6.13a). De Eurocode zelf beveelt 0,67 aan
/// voor gezaagd hout en voor gelijmd gelamineerd hout, en 1,0 voor houtachtige
/// producten volgens EN 13986 en EN 14374, met de uitdrukkelijke aantekening
/// dat de nationale keuze in de nationale bijlage staat. De Nederlandse
/// nationale bijlage maakt die keuze — zie [`k_cr_nb`]. Voor een prismatische
/// ligger is 1,0 dus de normwaarde en geen onveilige vereenvoudiging; rekenen
/// met 0,67 zou de dwarskrachtcapaciteit een derde lager maken dan de norm
/// toestaat.
///
/// Ter controle, met de volle breedte (k_cr = 1,0) en de rechthoek 96 x 450:
/// tau = 75567,6 * 2,43e6 / (96 * 7,29e8) = 2,6 N/mm² > f_v,d = 2,5 -> UC 1,07.
pub fn check_shear(
    section: &TimberSection,
    f_vd_mpa: f64,
    k_cr: f64,
    force_state: ForceStateSnapshot,
) -> ResistanceCalc {
    let v_ed = force_state.forces.vz_ed;
    let tau = tau_d_mpa(v_ed, section, k_cr);
    let uc = if f_vd_mpa > 0.0 { tau / f_vd_mpa } else { 0.0 };
    let status = if v_ed.abs() < 1e-12 {
        CheckStatus::NotApplicable
    } else if uc <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    // De scheurfactor staat ALTIJD in de notities, met zijn bron. Sinds
    // september 2026 is k_cr voor een rechthoek een keuze van de gebruiker
    // (`k_cr` in de invoer); een lezer van het rapport moet kunnen zien of er
    // met de NB-waarde 1,0 of met de Europese aanbeveling 0,67 is gerekend,
    // en dat kan niet als 1,0 zwijgt.
    let mut notes = vec![];
    // Nederlandse komma, zoals de vaste tekst hieronder (1,00 en 0,67).
    let k_cr_txt = format!("{k_cr:.2}").replace('.', ",");
    if !section.rechthoekig {
        notes.push(format!(
            "b_ef = k_cr · b met k_cr = {k_cr_txt} (6.13a), door de kern bepaald uit de verhouding \
             lijfdikte / flensbreedte volgens NEN-EN 1995-1-1/NB bij 6.1.7 (1,0 bij een lijf ten \
             minste zo breed als de flens, 0,8 bij een lijf dunner dan de halve flens, daartussen \
             lineair)."
        ));
    } else if (k_cr - 1.0).abs() > 1e-9 {
        notes.push(format!(
            "b_ef = k_cr · b met k_cr = {k_cr_txt} (6.13a), opgegeven in de toetsinstellingen. \
             EN 1995-1-1 6.1.7(2) beveelt 0,67 aan voor gezaagd en gelijmd gelamineerd hout; \
             NEN-EN 1995-1-1/NB bij 6.1.7 schrijft voor een prismatische doorsnede 1,0 voor. \
             De opgegeven waarde is dus {kant} dan de Nederlandse normwaarde.",
            kant = if k_cr < 1.0 { "strenger" } else { "gunstiger" }
        ));
    } else {
        notes.push(
            "b_ef = k_cr · b met k_cr = 1,00 (6.13a): de waarde die NEN-EN 1995-1-1/NB bij 6.1.7 \
             voorschrijft voor een prismatische doorsnede (de Europese aanbeveling van 6.1.7(2) is \
             0,67; de nationale bijlage maakt die keuze)."
                .to_string(),
        );
    }
    if !section.rechthoekig {
        notes.push(format!(
            "Samengestelde doorsnede: b is de breedte op de maatgevende vezel ({:.1} mm) \
             en niet de omhullende breedte ({:.1} mm) — art. 6.1.7(2) noemt b \
             \"de breedte van het van toepassing zijnde deel van het element\". \
             S en I zijn die van de werkelijke doorsnede.",
            section.b_schuif_mm, section.b_flens_mm
        ));
    }

    ResistanceCalc {
        deelstappen: Vec::new(),
        id: "6.1.7_shear".to_string(),
        title: "Dwarskracht".to_string(),
        article: "art. 6.1.7 (6.13)".to_string(),
        force_state,
        formula_latex: r"\tau_d = \frac{V_{z,Ed} \cdot S_y}{I_y \cdot b_{ef}} \le f_{v,d}".to_string(),
        variables: vec![
            NamedValue { symbol: r"V_{z,Ed}".to_string(), value: v_ed.abs(), unit: "kN".to_string() },
            NamedValue { symbol: "S_y".to_string(), value: section.s_y_mm3, unit: "mm³".to_string() },
            NamedValue { symbol: "I_y".to_string(), value: section.i_y_mm4, unit: "mm⁴".to_string() },
            NamedValue { symbol: "b".to_string(), value: section.b_schuif_mm, unit: "mm".to_string() },
            NamedValue { symbol: "k_{cr}".to_string(), value: k_cr, unit: "-".to_string() },
            NamedValue { symbol: r"f_{v,d}".to_string(), value: f_vd_mpa, unit: "N/mm²".to_string() },
        ],
        value: tau,
        unit: "N/mm²".to_string(),
        uc: Some(UnityCheck {
            ed: tau,
            rd: f_vd_mpa,
            uc,
            formula_latex: r"\tau_d / f_{v,d}".to_string(),
        }),
        status,
        notes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;
    use mechanics::InternalForces;

    fn snap(v_kn: f64) -> ForceStateSnapshot {
        ForceStateSnapshot {
            combination_id: 12,
            position_mm: 0.0,
            forces: InternalForces { vz_ed: v_kn, ..Default::default() },
        }
    }

    /// De samengestelde doorsnede van de externe referentie-berekening:
    /// flenzen 1000 x 40 boven en onder, lijf 71 x 40, totale hoogte 120.
    /// A = 82 840 mm², I_y = 139 045 333 mm⁴, S = 1 614 200 mm³, b_lijf = 71.
    fn referentie_samengesteld() -> TimberSection {
        TimberSection {
            b_mm: 1000.0,
            h_mm: 120.0,
            a_mm2: 82_840.0,
            w_y_mm3: 139_045_333.333_333_3 / 60.0,
            w_z_mm3: 0.0,
            i_y_mm4: 139_045_333.333_333_3,
            i_z_mm4: 0.0,
            radius_y_mm: 0.0,
            radius_z_mm: 0.0,
            s_y_mm3: 1_614_200.0,
            b_schuif_mm: 71.0,
            b_flens_mm: 1000.0,
            rechthoekig: false,
        }
    }

    #[test]
    fn referentie_staaf2_dwarskracht() {
        // tau = 1,5 * 75567,6 / 43200 = 2,624 N/mm2; UC = 2,624/2,462 = 1,07.
        let s = TimberSection::rechthoek(96.0, 450.0);
        let r = check_shear(&s, 2.4615, 1.0, snap(75.5676));
        assert_relative_eq!(r.value, 2.624, max_relative = 1e-3);
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 1.07, max_relative = 5e-3);
        assert_eq!(r.status, CheckStatus::NotOk);
    }

    #[test]
    fn referentie_staaf1_dwarskracht() {
        // V = 20,463 kN -> tau = 0,7105; UC = 0,29.
        let s = TimberSection::rechthoek(96.0, 450.0);
        let r = check_shear(&s, 2.4615, 1.0, snap(20.463));
        assert_relative_eq!(r.uc.as_ref().unwrap().uc, 0.29, max_relative = 1e-2);
        assert_eq!(r.status, CheckStatus::Ok);
    }

    #[test]
    fn vs_over_ib_is_gelijk_aan_anderhalf_v_over_a() {
        // Voor een rechthoek: V*S/(I*b) = 1,5*V/A. Dat de algemene formule die
        // identiteit haalt, is het bewijs dat de bestaande houtreferenties
        // door de generalisatie niet verschuiven.
        let s = TimberSection::rechthoek(96.0, 450.0);
        let v_kn = 75.5676;
        let via_a = 1.5 * v_kn * 1e3 / s.a_mm2;
        assert_relative_eq!(tau_d_mpa(v_kn, &s, 1.0), via_a, max_relative = 1e-12);
    }

    #[test]
    fn k_cr_reduceert_de_werkzame_breedte() {
        let s = TimberSection::rechthoek(96.0, 450.0);
        let vol = tau_d_mpa(60.0, &s, 1.0);
        let gereduceerd = tau_d_mpa(60.0, &s, 0.67);
        assert_relative_eq!(gereduceerd, vol / 0.67, max_relative = 1e-12);
    }

    #[test]
    fn samengesteld_rekent_met_het_lijf_en_niet_met_de_flens() {
        // V = 30 kN. Met de norm: tau = 30e3 * 1 614 200 / (139 045 333 * 71)
        // = 4,906 N/mm². Met de rechthoekvereenvoudiging over de volle
        // doorsnede: 1,5 * 30e3 / 82 840 = 0,543 N/mm² — negen keer zo laag.
        let s = referentie_samengesteld();
        let tau = tau_d_mpa(30.0, &s, 1.0);
        assert_relative_eq!(tau, 4.9057, max_relative = 1e-3);
        let vereenvoudigd = 1.5 * 30.0e3 / s.a_mm2;
        assert!(tau / vereenvoudigd > 9.0, "verhouding {}", tau / vereenvoudigd);
    }

    #[test]
    fn samengesteld_meldt_welke_breedte_is_gebruikt() {
        let s = referentie_samengesteld();
        let r = check_shear(&s, 2.4615, 1.0, snap(30.0));
        assert!(
            r.notes.iter().any(|n| n.contains("71,0") || n.contains("71.0")),
            "notities: {:?}",
            r.notes
        );
    }

    #[test]
    fn k_cr_volgens_de_nationale_bijlage() {
        // Prismatisch (lijf = flens): 1,0.
        assert_relative_eq!(k_cr_nb(96.0, 96.0), 1.0);
        // Lijf dunner dan de halve flensbreedte: 0,8. De referentiedoorsnede
        // (lijf 71, flens 1000) valt daar ruim onder.
        assert_relative_eq!(k_cr_nb(71.0, 1000.0), 0.8);
        assert_relative_eq!(k_cr_nb(500.0, 1000.0), 0.8);
        // Daartussen lineair: op driekwart van de flensbreedte precies 0,9.
        assert_relative_eq!(k_cr_nb(750.0, 1000.0), 0.9, max_relative = 1e-12);
    }
}
