//! Begrensde spanningsreductiemethode, NEN-EN 1993-1-5+C1:2012 §10(5a), NB:2011.
//! Geen kolominterpolatie, trekzones, verstijvingen of niet-uniforme velden.
//! Zie docs/steel-plate-buckling.md voor het toepassingsgebied en de bronverwijzingen.

use crate::input::PlateCheckInput;
use crate::staal::sigma_eq;
use mechanics::{ForceStateSnapshot, InternalForces};
use nationale_bijlage::Ndp1993;
use nen_en_1993_1_1_section::{CheckStatus, Deelstap, NamedValue, ResistanceCalc, UnityCheck};
use std::collections::{BTreeSet, HashMap};

pub const PLOOI_ID: &str = "en1993_1_5_10_plooi";

#[derive(Clone, Debug)]
pub struct PlooiBerekening {
    pub sigma_x: f64,
    pub sigma_z: f64,
    pub tau: f64,
    pub a_factor: f64,
    pub uc: f64,
    pub sigma_eq: f64,
    pub sigma_cr_x: f64,
    pub sigma_cr_z: f64,
    pub tau_cr: f64,
    pub inv_alpha_cr: f64,
    pub inv_alpha_ult: f64,
    pub lambda: f64,
    pub rho_p: f64,
    pub chi_w: f64,
    pub rho: f64,
}

/// Valideert het gehele aangevraagde veld voordat een positieve conclusie mogelijk is.
pub fn bereken(input: &PlateCheckInput, fy: f64) -> Result<HashMap<u32, PlooiBerekening>, String> {
    let p = input.plooi.as_ref().expect("expliciete plooi-invoer");
    if let Some(reden) = &p.geometrie_fout {
        return Err(format!("plaatplooi: {reden}"));
    }
    if !p.rechthoek_zonder_openingen {
        return Err("plaatplooi: uitsluitend één asgelijnd rechthoekig veld zonder openingen is ondersteund".into());
    }
    if !p.a_mm.is_finite() || !p.b_mm.is_finite() || p.a_mm <= 0.0 || p.b_mm <= 0.0 {
        return Err("plaatplooi: a_mm en b_mm moeten eindig en positief zijn".into());
    }
    if p.randvoorwaarden != "vierzijdig_scharnierend" || p.steun_bron.trim().is_empty() {
        return Err("plaatplooi: bevestig continue scharnierende steun UIT HET VLAK langs alle vier randen en geef de bron; meshknopen of steunen in het vlak bewijzen dit niet".into());
    }
    if !p.onverstijfd {
        return Err("plaatplooi: verstijfde velden zijn niet ondersteund".into());
    }
    if !p.uniforme_spanning {
        return Err("plaatplooi: een uniform volledig spanningsveld moet expliciet bevestigd zijn; een algemene spanningsomhullende is niet onderbouwd".into());
    }
    // Implementatiegrens voor dunne vlakke platen, geen normatieve slankheidsgrens.
    if input.thickness_mm > p.a_mm.min(p.b_mm) / 10.0 {
        return Err(
            "plaatplooi: t > min(a,b)/10 valt buiten de ondersteunde dunne-plaatgeometrie".into(),
        );
    }
    let gamma = Ndp1993::voor(input.bijlage).gamma_m1;
    // EN 1993-1-1 §3.2.6; EN 1993-1-5 A.1. Geen gebruikersmoduli in deze toets.
    let d = std::f64::consts::PI.powi(2) * 210_000.0 / (12.0 * (1.0 - 0.3_f64.powi(2)));
    let ex = d * (input.thickness_mm / p.b_mm).powi(2);
    let ez = d * (input.thickness_mm / p.a_mm).powi(2);
    // Tabel 4.1, psi=1: k=4. Ondergrens voor de gesteunde lange rechthoek.
    let crx = 4.0 * ex;
    let crz = 4.0 * ez;
    let ratio = p.a_mm / p.b_mm;
    // A.3 (A.5), zonder langsverstijvingen.
    let kt = if ratio >= 1.0 {
        5.34 + 4.0 / ratio.powi(2)
    } else {
        4.0 + 5.34 / ratio.powi(2)
    };
    let crt = kt * ex;
    if ![crx, crz, crt].iter().all(|v| v.is_finite() && *v > 0.0) {
        return Err(
            "plaatplooi: afmetingen leveren niet-representeerbare kritieke spanningen op".into(),
        );
    }
    let mut result = HashMap::new();
    let veld_ids: BTreeSet<_> = p.expected_element_ids.iter().copied().collect();
    if veld_ids.is_empty() || veld_ids.len() != p.expected_element_ids.len() {
        return Err("plaatplooi: expected_element_ids moet de volledige, niet-lege mesh-elementset zonder duplicaten bevatten".into());
    }
    for c in &input.combinations {
        let Some(first) = c.elements.first() else {
            return Err(format!(
                "plaatplooi: combinatie {} heeft geen veldspanningen",
                c.combination_id
            ));
        };
        let ids: BTreeSet<_> = c.elements.iter().map(|e| e.element_id).collect();
        if ids.len() != c.elements.len() || veld_ids != ids {
            return Err(format!(
                "plaatplooi: onvolledige of dubbele elementdekking in combinatie {}",
                c.combination_id
            ));
        }
        let mut sx = 0.0_f64;
        let mut sz = 0.0_f64;
        let mut tau = 0.0_f64;
        let mut eq = 0.0_f64;
        for e in &c.elements {
            for (v, ref_v) in [
                (e.sigma_x_mpa, first.sigma_x_mpa),
                (e.sigma_y_mpa, first.sigma_y_mpa),
                (e.tau_xy_mpa, first.tau_xy_mpa),
            ] {
                if (v - ref_v).abs() > 1e-8 * ref_v.abs().max(1.0) {
                    return Err(format!("plaatplooi: niet-uniform spanningsveld in combinatie {}, element {}; geen bewezen conservatieve omhullende beschikbaar", c.combination_id, e.element_id));
                }
            }
            if e.sigma_x_mpa > 0.0 || e.sigma_y_mpa > 0.0 {
                return Err(format!("plaatplooi: trekcomponent in combinatie {}, element {}; drukzones volgens NB §10(5) worden nog niet afgebakend", c.combination_id, e.element_id));
            }
            sx = sx.max(-e.sigma_x_mpa);
            sz = sz.max(-e.sigma_y_mpa);
            tau = tau.max(e.tau_xy_mpa.abs());
            eq = eq.max(sigma_eq(e.sigma_x_mpa, e.sigma_y_mpa, e.tau_xy_mpa));
        }
        // NB §10(4). Binnen de numerieke uniformiteitstolerantie maxima gebruiken.
        // Het maximale vloeicriterium wordt apart bewaard: het is niet monotoon in biaxiale druk.
        eq = eq.max(sigma_eq(sx, sz, tau));
        let a = 0.5 * (sx / crx + sz / crz);
        let inv_cr = a + a.hypot(tau / crt);
        for (richting, druk, lengte, breedte, kolom_cr) in
            [("x", sx, p.a_mm, p.b_mm, ez), ("z", sz, p.b_mm, p.a_mm, ex)]
        {
            if druk > 0.0 && (lengte < breedte || druk / kolom_cr < 2.0 * inv_cr) {
                return Err(format!("plaatplooi: kolomachtig gedrag/interactie in richting {richting}, combinatie {}; §4.4(6), §4.5.3–4.5.4 vereisen een aanvullende reductie die nog niet is ondersteund", c.combination_id));
            }
        }
        let inv_ult = eq / fy;
        let lambda = if eq == 0.0 {
            0.0
        } else {
            (inv_cr / inv_ult).sqrt()
        };
        let rho_p = if lambda <= 0.5 + 0.03_f64.sqrt() {
            1.0
        } else {
            ((lambda - 0.22) / lambda.powi(2)).min(1.0)
        };
        // NB §5.1(2): eta=1.2 voor de ondersteunde staalsoorten t/m S460.
        // Tabel 5.1, vervormbaar eindschot: geen reserve van een star eindschot.
        let chi_w = if lambda == 0.0 {
            1.2
        } else {
            (0.83 / lambda).min(1.2)
        };
        let rho = match (sx > 0.0 || sz > 0.0, tau > 0.0) {
            (true, true) => rho_p.min(chi_w),
            (true, false) => rho_p,
            (false, true) => chi_w,
            (false, false) => 1.0,
        };
        let uc = gamma * inv_ult / rho;
        if ![inv_cr, inv_ult, lambda, rho, uc]
            .iter()
            .all(|v| v.is_finite())
            || rho <= 0.0
        {
            return Err("plaatplooi: niet-representeerbare tussenuitkomst; controleer afmetingen en spanningen".into());
        }
        if result
            .insert(
                c.combination_id,
                PlooiBerekening {
                    sigma_x: sx,
                    sigma_z: sz,
                    tau,
                    a_factor: a,
                    uc,
                    sigma_eq: eq,
                    sigma_cr_x: crx,
                    sigma_cr_z: crz,
                    tau_cr: crt,
                    inv_alpha_cr: inv_cr,
                    inv_alpha_ult: inv_ult,
                    lambda,
                    rho_p,
                    chi_w,
                    rho,
                },
            )
            .is_some()
        {
            return Err(format!(
                "plaatplooi: dubbel combinatienummer {}",
                c.combination_id
            ));
        }
    }
    if result.is_empty() {
        return Err("plaatplooi: geen UGT-combinaties met veldspanningen".into());
    }
    Ok(result)
}

pub fn afleiding(
    input: &PlateCheckInput,
    combination_id: u32,
    fy: f64,
    r: &PlooiBerekening,
) -> ResistanceCalc {
    let p = input.plooi.as_ref().unwrap();
    let gamma = Ndp1993::voor(input.bijlage).gamma_m1;
    let values = [
        ("a", p.a_mm, "mm"),
        ("b", p.b_mm, "mm"),
        ("t", input.thickness_mm, "mm"),
        ("f_y", fy, "N/mm²"),
        ("\\gamma_{M1}", gamma, "-"),
        ("\\eta", 1.2, "-"),
        ("\\sigma_{x,Ed}", r.sigma_x, "N/mm²"),
        ("\\sigma_{z,Ed}", r.sigma_z, "N/mm²"),
        ("|\\tau_{Ed}|", r.tau, "N/mm²"),
        ("\\sigma_{cr,x}", r.sigma_cr_x, "N/mm²"),
        ("\\sigma_{cr,z}", r.sigma_cr_z, "N/mm²"),
        ("\\tau_{cr}", r.tau_cr, "N/mm²"),
    ];
    let steps = [
        (
            "A",
            "Uniforme drukbijdrage aan de kritieke factor",
            "10.6, psi=1",
            "A=\\tfrac12(\\sigma_{x,Ed}/\\sigma_{cr,x}+\\sigma_{z,Ed}/\\sigma_{cr,z})",
            r.a_factor,
        ),
        (
            "inv_alpha_cr",
            "Elastische kritieke belastingfactor (inverse)",
            "10.6",
            "1/\\alpha_{cr}=A+\\sqrt{A^2+(\\tau/\\tau_{cr})^2}",
            r.inv_alpha_cr,
        ),
        (
            "inv_alpha_ult",
            "Vloeifactor (inverse)",
            "10.3",
            "1/\\alpha_{ult,k}=\\sigma_{eq}/f_y",
            r.inv_alpha_ult,
        ),
        (
            "lambda",
            "Gemeenschappelijke gewijzigde slankheid",
            "10.2",
            "\\bar\\lambda=\\sqrt{\\alpha_{ult,k}/\\alpha_{cr}}",
            r.lambda,
        ),
        (
            "rho_p",
            "Plaatgedrag onder uniforme druk",
            "4.4(2), 10(5a)",
            "\\rho_p(\\bar\\lambda,\\psi=1)",
            r.rho_p,
        ),
        (
            "chi_w",
            "Schuifreductie, vervormbaar eindschot",
            "5.3 tabel 5.1, 10(5a)",
            "\\chi_w=\\min(1.2,0.83/\\bar\\lambda)",
            r.chi_w,
        ),
        (
            "rho",
            "Minimum van de werkzame reducties",
            "10(5a)",
            "\\rho=\\min(\\rho_x,\\rho_z,\\chi_w)",
            r.rho,
        ),
    ];
    ResistanceCalc {
        id: PLOOI_ID.into(), title: "Plaatplooi — gereduceerde spanningen".into(),
        article: "NEN-EN 1993-1-5 §10(5a), (10.1)–(10.4), (10.6); NB:2011".into(),
        force_state: ForceStateSnapshot { combination_id, position_mm: 0.0, forces: InternalForces::default() },
        formula_latex: "\\sigma_{eq,Ed}\\le\\rho f_y/\\gamma_{M1}".into(),
        variables: values.iter().map(|(s,v,u)| NamedValue { symbol: (*s).into(), value:*v, unit:(*u).into() }).collect(),
        deelstappen: steps.iter().map(|(id,title,article,formula,value)| Deelstap {
            id:(*id).into(), titel:(*title).into(), symbol:(*id).into(), article:(*article).into(),
            formula_latex:(*formula).into(), ingevuld_latex:format!("{value:.6}"), variables:vec![], value:Some(*value), unit:"-".into(), notes:vec![],
        }).collect(),
        value:r.sigma_eq, unit:"N/mm²".into(),
        uc:Some(UnityCheck { ed:r.sigma_eq, rd:r.rho * fy / gamma, uc:r.uc, formula_latex:"\\gamma_{M1}/(\\rho\\alpha_{ult,k})".into() }),
        status:if r.uc <= 1.0 { CheckStatus::Ok } else { CheckStatus::NotOk },
        notes:vec![
            format!("Volledig veld a={} mm in x, b={} mm in z; onverstijfd, zonder openingen, uniforme spanningen. Vier randen continu scharnierend uit het vlak gesteund. Bron: {}", p.a_mm,p.b_mm,p.steun_bron),
            "k_sigma=4 (tabel 4.1); k_tau uit A.3 (A.5). E=210000 N/mm², nu=0,3. Geen star-eindschotreserve. Gamma_M1 uit nationale-bijlage; eta=1,2 uit NB §5.1(2).".into(),
            "Druk is positief in deze afleiding; alleen uniforme velden zijn toegelaten. Veldtoets: dezelfde UC geldt voor alle elementen. Steunen, verbindingen en verstijvingen zelf (§9), globale stabiliteit en buiging uit het vlak zijn niet getoetst. Meshknopen gelden niet als steun.".into(),
        ],
    }
}
