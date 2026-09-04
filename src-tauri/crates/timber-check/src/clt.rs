//! Orkestratie voor kruislaaghout (CLT): [`CltBeamCheckInput`] →
//! [`CltBeamCheckResult`], met een toets per lamel.
//!
//! Het resultaat draagt dezelfde velden als [`crate::TimberBeamCheckResult`]
//! (beam_id, section_name, strength_class, service_class, load_duration,
//! checks, uc_max, status, governing_check_id) plús de uitgewerkte opbouw.
//! Daardoor past het structureel in het bestaande rapportcontract: de
//! toetsen per laag lopen als gewone `NamedCheck`s door "Toetsingsoverzicht"
//! en "Toetsing per staaf", en de CLT-sectie van het rapport voegt daar de
//! tekening en de tabel per lamel aan toe.
//!
//! Wat hier bewust NIET wordt getoetst (en als notitie in het resultaat
//! staat):
//! - normaalkracht: de plaatstrook wordt op buiging om de sterke as en
//!   dwarskracht getoetst; een N_Ed ≠ 0 wordt gemeld, niet verwerkt;
//! - buiging om de zwakke as (M_z), knik en kip: niet van toepassing op een
//!   plaatstrook in deze modellering;
//! - doorbuiging §7.2: k_def (tabel 3.2) kent geen rij voor kruislaaghout;
//!   in plaats van een geleende waarde blijft de toets weg. De stijfheid
//!   (EI)_ef is wel beschikbaar voor de solver.

use mechanics::{ForcePoint, ForceStateSnapshot, InternalForces};
use nen_en_1993_1_1_section::CheckStatus;
use nen_en_1995_1_1::clt::{CltLayerOrientation, CltLayup};
use nen_en_1995_1_1::clt_toets::{check_layer_bending, check_layer_shear, rolling_shear_info};
use nen_en_1995_1_1::{design_strength, gamma_m, k_mod, k_sys, LoadDurationClass, ServiceClass};
use serde::{Deserialize, Serialize};
use steel_check::{CheckKind, NamedCheck};
use ts_rs::TS;

fn default_one() -> f64 {
    1.0
}

/// Invoer voor één CLT-staaf (plaatstrook).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct CltBeamCheckInput {
    pub beam_id: u32,
    /// Opbouw: breedte van de strook en de lagen van boven naar beneden.
    pub layup: CltLayup,
    /// Klimaatklasse §2.3.1.3.
    pub service_class: ServiceClass,
    /// Maatgevende belastingduurklasse van de UGT-combinatie (§3.1.3).
    pub load_duration: LoadDurationClass,
    /// Staaflengte in m (voor de slankheidsindicatie L/h).
    pub length_m: f64,
    /// Krachtsverloop (envelop) langs de staaf.
    pub forces_envelope: Vec<ForcePoint>,
    /// Scheurfactor k_cr (6.13a); NB: 1,0 voor prismatische doorsneden.
    #[serde(default = "default_one")]
    pub k_cr: f64,
    /// Lastverdelend systeem aanwezig → k_sys = 1,1 (§6.6).
    #[serde(default)]
    pub load_sharing: bool,
}

/// Uitkomst per laag — de regel in de tabel "toetsing per lamel".
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct CltLayerResult {
    /// 1 = bovenste laag.
    pub index: u32,
    pub thickness_mm: f64,
    pub orientation: CltLayerOrientation,
    pub strength_class: String,
    /// Boven- en onderkant vanaf de bovenkant van de plaat (mm).
    pub z_top_mm: f64,
    pub z_bot_mm: f64,
    /// E in de spanrichting (N/mm²); 0 voor dwarslagen.
    pub e_mpa: f64,
    /// Buigspanning aan boven- en onderkant van de laag (N/mm², trek +).
    pub sigma_top_mpa: f64,
    pub sigma_bot_mpa: f64,
    /// Grootste schuifspanning in de laag (N/mm²); voor een dwarslaag de
    /// rolschuifspanning.
    pub tau_max_mpa: f64,
    /// Rekenwaarden van de laag (N/mm²); voor dwarslagen 0 (niet getoetst).
    pub f_md_mpa: f64,
    pub f_vd_mpa: f64,
    /// Unity checks; `None` voor dwarslagen (geen toets).
    pub uc_bending: Option<f64>,
    pub uc_shear: Option<f64>,
    /// Deze laag bevat de maatgevende toets van de staaf.
    pub governing: bool,
    /// Id's van de toetsen van deze laag in `checks`.
    pub check_ids: Vec<String>,
}

/// De uitgewerkte opbouw: stijfheid, zwaartelijn en de lagen.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct CltLayupResult {
    pub width_mm: f64,
    pub height_mm: f64,
    /// Zwaartelijn vanaf de bovenkant (mm).
    pub z0_mm: f64,
    /// (EI)_ef in kNm².
    pub ei_ef_knm2: f64,
    /// (EA)_ef in kN.
    pub ea_ef_kn: f64,
    /// Netto traagheidsmoment (EI)_ef/E_ref in mm⁴ — hulpgrootheid.
    pub i_ef_net_mm4: f64,
    /// Slankheid L/h — indicatie voor de geldigheid van de starre verbinding.
    pub slenderness: f64,
    pub layers: Vec<CltLayerResult>,
    /// 1-gebaseerde index van de maatgevende laag; `None` zonder toetsen.
    pub governing_layer: Option<u32>,
}

/// Volledig toetsresultaat van één CLT-staaf. Structureel een superset van
/// `TimberBeamCheckResult` (zie moduledocumentatie).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/timber/")]
pub struct CltBeamCheckResult {
    pub beam_id: u32,
    /// Bijv. "CLT 40/20/40/20/40 (h = 160 mm, b = 1000 mm)".
    pub section_name: String,
    /// Sterkteklasse(n) van de lamellen, bijv. "C24" of "C24/C16".
    pub strength_class: String,
    pub service_class: ServiceClass,
    pub load_duration: LoadDurationClass,
    pub checks: Vec<NamedCheck>,
    pub uc_max: f64,
    pub status: CheckStatus,
    pub governing_check_id: String,
    /// De opbouw met de uitkomst per laag.
    pub layup: CltLayupResult,
    /// Aannamen en meldingen voor het rapport.
    pub notes: Vec<String>,
}

fn governing_for<F>(env: &[ForcePoint], score: F) -> ForcePoint
where
    F: Fn(&InternalForces) -> f64,
{
    if env.is_empty() {
        return ForcePoint { combination_id: 0, position_mm: 0.0, forces: Default::default() };
    }
    let mut best = env[0];
    let mut best_score = score(&best.forces);
    for p in &env[1..] {
        let s = score(&p.forces);
        if s > best_score {
            best = *p;
            best_score = s;
        }
    }
    best
}

fn uc_of(c: &NamedCheck) -> Option<f64> {
    match &c.kind {
        CheckKind::Resistance(r) if !matches!(r.status, CheckStatus::NotApplicable) => r.uc.as_ref().map(|u| u.uc),
        CheckKind::Stability(s) if !matches!(s.status, CheckStatus::NotApplicable) => s.uc.as_ref().map(|u| u.uc),
        _ => None,
    }
}

/// Resultaat voor een opbouw die niet rekenbaar is: geen toetsen, de reden
/// in `governing_check_id` (zelfde conventie als de houtorkestratie) en in
/// de notities.
fn foutresultaat(input: &CltBeamCheckInput, reden: String) -> CltBeamCheckResult {
    CltBeamCheckResult {
        beam_id: input.beam_id,
        section_name: input.layup.name(),
        strength_class: input.layup.strength_classes_label(),
        service_class: input.service_class,
        load_duration: input.load_duration,
        checks: vec![],
        uc_max: 0.0,
        status: CheckStatus::NotApplicable,
        governing_check_id: format!("ERROR: {reden}"),
        layup: CltLayupResult {
            width_mm: input.layup.width_mm,
            height_mm: input.layup.height_mm(),
            z0_mm: 0.0,
            ei_ef_knm2: 0.0,
            ea_ef_kn: 0.0,
            i_ef_net_mm4: 0.0,
            slenderness: 0.0,
            layers: vec![],
            governing_layer: None,
        },
        notes: vec![format!("Opbouw niet rekenbaar: {reden}")],
    }
}

pub fn check_clt_beam(input: CltBeamCheckInput) -> CltBeamCheckResult {
    let mech = match input.layup.mechanics() {
        Ok(m) => m,
        Err(e) => return foutresultaat(&input, e),
    };

    // Maatgevende krachtspunten: grootste |M_y| voor buiging, grootste |V_z|
    // voor dwarskracht — dezelfde strategie als de houtorkestratie.
    let gov_bending = governing_for(&input.forces_envelope, |f| f.my_ed.abs());
    let gov_shear = governing_for(&input.forces_envelope, |f| f.vz_ed.abs());
    let bend_state = ForceStateSnapshot::from_point(&gov_bending);
    let shear_state = ForceStateSnapshot::from_point(&gov_shear);

    let ksys = k_sys(input.load_sharing);
    let mut checks: Vec<NamedCheck> = Vec::new();
    let mut layers: Vec<CltLayerResult> = Vec::with_capacity(mech.layers.len());

    for l in &mech.layers {
        let (s_top, s_bot) = mech.layer_edge_stresses(l.index, bend_state.forces.my_ed);
        let sh = mech.layer_max_shear(l.index, shear_state.forces.vz_ed, input.k_cr);
        let mut ids = Vec::new();
        let (f_md, f_vd, uc_b, uc_v) = match l.orientation {
            CltLayerOrientation::Longitudinal => {
                // Rekenwaarden per laag: k_mod en γ_M uit het materiaaltype
                // van de sterkteklasse van die laag; k_h = 1,0 (zie clt_toets).
                let gamma = gamma_m(l.class.timber_type);
                let kmod = k_mod(l.class.timber_type, input.service_class, input.load_duration);
                let f_md = design_strength(l.class.f_mk, kmod, gamma, 1.0, ksys);
                let f_vd = design_strength(l.class.f_vk, kmod, gamma, 1.0, ksys);

                let b = check_layer_bending(&mech, l.index, f_md, bend_state);
                let v = check_layer_shear(&mech, l.index, f_vd, input.k_cr, shear_state);
                let uc_b = b.uc.as_ref().map(|u| u.uc);
                let uc_v = v.uc.as_ref().map(|u| u.uc);
                ids.push(b.id.clone());
                ids.push(v.id.clone());
                checks.push(NamedCheck { id: b.id.clone(), kind: CheckKind::Resistance(b) });
                checks.push(NamedCheck { id: v.id.clone(), kind: CheckKind::Resistance(v) });
                (f_md, f_vd, uc_b, uc_v)
            }
            CltLayerOrientation::Transverse => {
                let r = rolling_shear_info(&mech, l.index, input.k_cr, shear_state);
                ids.push(r.id.clone());
                checks.push(NamedCheck { id: r.id.clone(), kind: CheckKind::Resistance(r) });
                (0.0, 0.0, None, None)
            }
        };
        layers.push(CltLayerResult {
            index: (l.index + 1) as u32,
            thickness_mm: l.thickness_mm(),
            orientation: l.orientation,
            strength_class: l.class.name.to_string(),
            z_top_mm: l.z_top_mm,
            z_bot_mm: l.z_bot_mm,
            e_mpa: l.e_mpa,
            sigma_top_mpa: s_top,
            sigma_bot_mpa: s_bot,
            tau_max_mpa: sh.tau_mpa,
            f_md_mpa: f_md,
            f_vd_mpa: f_vd,
            uc_bending: uc_b,
            uc_shear: uc_v,
            governing: false,
            check_ids: ids,
        });
    }

    // Aggregatie: hoogste UC over de toetsen die meetellen; de laag waarin
    // die toets zit wordt gemarkeerd.
    let mut uc_max = 0.0_f64;
    let mut governing_check_id = String::new();
    for c in &checks {
        if let Some(uc) = uc_of(c) {
            if uc > uc_max || governing_check_id.is_empty() {
                uc_max = uc;
                governing_check_id = c.id.clone();
            }
        }
    }
    let mut governing_layer = None;
    for lr in &mut layers {
        if !governing_check_id.is_empty() && lr.check_ids.iter().any(|id| *id == governing_check_id) {
            lr.governing = true;
            governing_layer = Some(lr.index);
        }
    }
    let status = if checks.is_empty() {
        CheckStatus::NotApplicable
    } else if uc_max <= 1.0 {
        CheckStatus::Ok
    } else {
        CheckStatus::NotOk
    };

    // Notities: methode, aannamen en wat niet is meegenomen.
    let slenderness = if mech.height_mm > 0.0 { input.length_m * 1e3 / mech.height_mm } else { 0.0 };
    let mut notes = vec![
        "Methode: samengestelde doorsnede met starre verbinding — bijlage B met γ_i = 1: alleen de lengtelagen dragen in de spanrichting (E = E_0,mean), dwarslagen vormen de schuifverbinding (E = 0). Spanningen lineair per laag: σ_i = E_i·M·(z − z_0)/(EI)_ef; τ = V·(ES)/((EI)_ef·b_ef).".to_string(),
        format!(
            "(EI)_ef = {:.0} kNm² (I_ef,net = {:.3}·10⁶ mm⁴); zwaartelijn z_0 = {:.1} mm vanaf boven; h = {:.0} mm; b = {:.0} mm.",
            mech.ei_ef_knm2(),
            mech.i_ef_net_mm4() / 1e6,
            mech.z0_mm,
            mech.height_mm,
            mech.width_mm
        ),
        "Rekenwaarden per laag: f_d = k_mod·k_sys·f_k/γ_M (2.14) met k_mod uit tabel 3.1 en γ_M uit de NB voor het materiaaltype van de sterkteklasse van die laag; k_h = 1,0 (§3.2(3) geldt voor een rechthoekig gezaagd element, niet voor een lamel in een verlijmde opbouw).".to_string(),
        "Rolschuiving in de dwarslagen: spanning ter informatie, geen toets — f_v,rol staat niet in NEN-EN 1995-1-1/NB:2013 en niet in EN 338.".to_string(),
        "Niet getoetst: normaalkracht, buiging om de zwakke as, knik/kip en doorbuiging §7.2 (tabel 3.2 kent geen k_def voor kruislaaghout).".to_string(),
    ];
    if slenderness > 0.0 && slenderness < 20.0 {
        notes.push(format!(
            "Let op: slankheid L/h = {slenderness:.1} < 20. De starre verbinding verwaarloost de schuifvervorming van de dwarslagen; bij korte, dikke platen overschat dat (EI)_ef en onderschat het de randspanningen. Controleer met de gamma-methode zodra een rolschuifmodulus uit een productverklaring beschikbaar is."
        ));
    }
    let n_max = input
        .forces_envelope
        .iter()
        .map(|p| p.forces.n_ed.abs())
        .fold(0.0_f64, f64::max);
    if n_max > 1e-6 {
        notes.push(format!(
            "Normaalkracht tot |N_Ed| = {n_max:.2} kN aanwezig maar niet in de CLT-toetsing verwerkt."
        ));
    }
    let mz_max = input
        .forces_envelope
        .iter()
        .map(|p| p.forces.mz_ed.abs())
        .fold(0.0_f64, f64::max);
    if mz_max > 1e-6 {
        notes.push(format!(
            "Moment om de zwakke as tot |M_z,Ed| = {mz_max:.2} kNm aanwezig maar niet in de CLT-toetsing verwerkt."
        ));
    }
    if let Some(eerste) = mech.layers.first() {
        if eerste.orientation == CltLayerOrientation::Transverse
            || mech.layers.last().map(|l| l.orientation) == Some(CltLayerOrientation::Transverse)
        {
            notes.push("De opbouw heeft een dwarslaag als buitenlaag; dat is voor een plaat in buiging om de sterke as ongebruikelijk — controleer de opgegeven richtingen.".to_string());
        }
    }

    CltBeamCheckResult {
        beam_id: input.beam_id,
        section_name: format!(
            "{} (h = {:.0} mm, b = {:.0} mm)",
            input.layup.name(),
            mech.height_mm,
            mech.width_mm
        ),
        strength_class: input.layup.strength_classes_label(),
        service_class: input.service_class,
        load_duration: input.load_duration,
        checks,
        uc_max,
        status,
        governing_check_id,
        layup: CltLayupResult {
            width_mm: mech.width_mm,
            height_mm: mech.height_mm,
            z0_mm: mech.z0_mm,
            ei_ef_knm2: mech.ei_ef_knm2(),
            ea_ef_kn: mech.ea_ef_kn(),
            i_ef_net_mm4: mech.i_ef_net_mm4(),
            slenderness,
            layers,
            governing_layer,
        },
        notes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    fn punt(x_mm: f64, v: f64, my: f64) -> ForcePoint {
        ForcePoint {
            combination_id: 1,
            position_mm: x_mm,
            forces: InternalForces { vz_ed: v, my_ed: my, ..Default::default() },
        }
    }

    /// Dezelfde handberekening als in `clt.rs`: 5-laags 40/20/40/20/40 C24,
    /// M_max = 20 kNm in het veld, V_max = 10 kN bij de oplegging, L = 5 m.
    fn invoer() -> CltBeamCheckInput {
        CltBeamCheckInput {
            beam_id: 7,
            layup: CltLayup::alternating(1000.0, &[40.0, 20.0, 40.0, 20.0, 40.0], "C24"),
            service_class: ServiceClass::Sc1,
            load_duration: LoadDurationClass::MediumTerm,
            length_m: 5.0,
            forces_envelope: vec![punt(0.0, 10.0, 0.0), punt(2500.0, 0.0, 20.0), punt(5000.0, -10.0, 0.0)],
            k_cr: 1.0,
            load_sharing: false,
        }
    }

    #[test]
    fn vijflaags_volledige_toets() {
        let r = check_clt_beam(invoer());
        // 3 lengtelagen × 2 toetsen + 2 dwarslagen × 1 informatieve regel.
        assert_eq!(r.checks.len(), 8);
        assert_eq!(r.layup.layers.len(), 5);
        assert_relative_eq!(r.layup.ei_ef_knm2, 3344.0, max_relative = 1e-9);
        assert_relative_eq!(r.layup.z0_mm, 80.0);
        assert_relative_eq!(r.layup.slenderness, 5000.0 / 160.0);
        // Maatgevend: buiging in een buitenlaag, UC = 5,263/14,77 = 0,356.
        assert_relative_eq!(r.uc_max, 0.3563, max_relative = 1e-3);
        assert_eq!(r.governing_check_id, "clt_6.1.6_laag_1");
        assert_eq!(r.layup.governing_layer, Some(1));
        assert!(r.layup.layers[0].governing);
        assert!(!r.layup.layers[4].governing);
        assert_eq!(r.status, CheckStatus::Ok);
        assert_eq!(r.section_name, "CLT 40/20/40/20/40 (h = 160 mm, b = 1000 mm)");
        assert_eq!(r.strength_class, "C24");
        // Per laag: rekenwaarden en spanningen.
        let l1 = &r.layup.layers[0];
        assert_relative_eq!(l1.f_md_mpa, 14.769, max_relative = 1e-3);
        assert_relative_eq!(l1.f_vd_mpa, 2.4615, max_relative = 1e-3);
        assert_relative_eq!(l1.sigma_top_mpa, -5.263, max_relative = 1e-3);
        assert_relative_eq!(l1.sigma_bot_mpa, -2.632, max_relative = 1e-3);
        assert_relative_eq!(l1.tau_max_mpa, 0.07895, max_relative = 1e-3);
        let l2 = &r.layup.layers[1];
        assert_eq!(l2.orientation, CltLayerOrientation::Transverse);
        assert!(l2.uc_bending.is_none() && l2.uc_shear.is_none());
        assert_relative_eq!(l2.tau_max_mpa, 0.07895, max_relative = 1e-3);
        assert_relative_eq!(l2.e_mpa, 0.0);
        let l3 = &r.layup.layers[2];
        assert_relative_eq!(l3.tau_max_mpa, 0.08553, max_relative = 1e-3);
        assert_relative_eq!(l3.uc_shear.unwrap(), 0.03475, max_relative = 1e-3);
        // Geen normaalkracht → geen N-melding; slank genoeg → geen waarschuwing.
        assert!(!r.notes.iter().any(|n| n.contains("Normaalkracht")));
        assert!(!r.notes.iter().any(|n| n.contains("slankheid")));
    }

    #[test]
    fn overschrijding_markeert_de_trekzijde_bij_negatief_moment() {
        // Negatief moment (trek boven) en veel te groot: beide buitenlagen
        // hebben dezelfde |σ|; de eerste (bovenste) wordt gemarkeerd.
        let mut i = invoer();
        i.forces_envelope = vec![punt(0.0, 0.0, -80.0)];
        let r = check_clt_beam(i);
        assert_eq!(r.status, CheckStatus::NotOk);
        assert!(r.uc_max > 1.0);
        assert_eq!(r.layup.governing_layer, Some(1));
        assert!(r.layup.layers[0].sigma_top_mpa > 0.0, "trek boven bij negatief moment");
    }

    #[test]
    fn korte_plaat_en_normaalkracht_worden_gemeld() {
        let mut i = invoer();
        i.length_m = 2.0; // L/h = 12,5
        i.forces_envelope.push(ForcePoint {
            combination_id: 1,
            position_mm: 1000.0,
            forces: InternalForces { n_ed: -15.0, ..Default::default() },
        });
        let r = check_clt_beam(i);
        assert!(r.notes.iter().any(|n| n.contains("L/h = 12,5") || n.contains("L/h = 12.5")));
        assert!(r.notes.iter().any(|n| n.contains("Normaalkracht")));
    }

    #[test]
    fn onbekende_klasse_geeft_foutresultaat() {
        let mut i = invoer();
        i.layup.layers[2].strength_class = "D40".into();
        let r = check_clt_beam(i);
        assert!(r.checks.is_empty());
        assert!(r.governing_check_id.starts_with("ERROR"));
        assert_eq!(r.status, CheckStatus::NotApplicable);
    }

    #[test]
    fn resultaat_serialiseert_als_superset_van_het_houtresultaat() {
        let r = check_clt_beam(invoer());
        let json = serde_json::to_value(&r).unwrap();
        for veld in [
            "beam_id", "section_name", "strength_class", "service_class", "load_duration",
            "checks", "uc_max", "status", "governing_check_id", "layup", "notes",
        ] {
            assert!(json.get(veld).is_some(), "veld {veld} ontbreekt");
        }
        // De invoer komt met defaults terug uit JSON zonder k_cr/load_sharing.
        let ruw = serde_json::json!({
            "beam_id": 1,
            "layup": { "width_mm": 1000.0, "layers": [
                { "thickness_mm": 40.0, "orientation": "Longitudinal", "strength_class": "C24" },
                { "thickness_mm": 20.0, "orientation": "Transverse", "strength_class": "C24" },
                { "thickness_mm": 40.0, "orientation": "Longitudinal", "strength_class": "C24" }
            ]},
            "service_class": "Sc1",
            "load_duration": "MediumTerm",
            "length_m": 4.0,
            "forces_envelope": []
        });
        let i: CltBeamCheckInput = serde_json::from_value(ruw).unwrap();
        assert_relative_eq!(i.k_cr, 1.0);
        assert!(!i.load_sharing);
    }
}
