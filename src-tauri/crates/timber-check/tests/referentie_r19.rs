//! R19 — vloerligger 45 x 220 mm C24, overspanning 4,50 m.
//!
//! Validatiecampagne referentieberekeningen, geval R19 uit
//! `docs/superpowers/plans/2026-09-02-referentieberekeningen.md`.
//!
//! Deze test voert de EN 1995-1-1-kant van R19 uit LANGS DE PRODUCTIEROUTE:
//! `timber_check::check_timber_beam`, dezelfde functie die het Tauri-command
//! `check_timber_beams` aanroept. Zo worden f_m,d, f_v,d en de dwarskracht-
//! weerstand niet nagerekend met een tweede formule, maar echt uit de app
//! gehaald.
//!
//! De snedekrachten en zakkingen komen uit de solver-run in
//! `design-mockup/referentie/toets-R19.mjs`. Dat script geeft ze mee via
//! omgevingsvariabelen (R19_M_ED, R19_V_ED, R19_W_INST, R19_W_QP); zonder die
//! variabelen valt de test terug op de analytische waarden van het geval, die
//! hieronder als constante staan. Beide routes horen hetzelfde te geven — het
//! mjs-script controleert dat expliciet.
//!
//! De test drukt één regel af die met `#R19-JSON#` begint; `toets-R19.mjs`
//! leest die regel en zet de waarden in zijn vergelijkingstabel.
//!
//! Draaien:
//!   cargo test -p timber-check --test referentie_r19 -- --nocapture

use mechanics::{ForcePoint, InternalForces};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use steel_check::{CheckKind, NamedCheck};
use timber_check::{check_timber_beam, TimberBeamCheckInput};

// ── Invoer uit het dossier ──────────────────────────────────────────────────
const B_MM: f64 = 45.0;
const H_MM: f64 = 220.0;
const L_M: f64 = 4.5;
/// Scheurfactor die de bron aanhoudt (EN 1995-1-1/A1 aanbevolen waarde).
const K_CR_BRON: f64 = 0.67;
/// Scheurfactor die `timberCheckBuilder.ts` op dit moment vast meegeeft.
const K_CR_APP_DEFAULT: f64 = 1.0;

// Analytische terugval als het mjs-script de waarden niet aanlevert.
// q_d = 2,0 kN/m; M = q l^2/8; V = q l/2.
const M_ED_FALLBACK_KNM: f64 = 2.0 * L_M * L_M / 8.0;
const V_ED_FALLBACK_KN: f64 = 2.0 * L_M / 2.0;
// 5 q L^4 / (384 E I) met E = 11000 N/mm2, I = 39,93e6 mm4 (mm, omlaag = −).
const W_INST_FALLBACK_MM: f64 = -18.2344;
const W_QP_FALLBACK_MM: f64 = -8.0231;

fn env_f64(naam: &str, terugval: f64) -> f64 {
    std::env::var(naam)
        .ok()
        .and_then(|s| s.trim().parse::<f64>().ok())
        .unwrap_or(terugval)
}

/// Zoek een `NamedValue` op zijn LaTeX-symbool binnen één toets.
fn variabele(checks: &[NamedCheck], check_id: &str, symbool: &str) -> f64 {
    for c in checks {
        if c.id != check_id {
            continue;
        }
        let vars = match &c.kind {
            CheckKind::Resistance(r) => &r.variables,
            CheckKind::Stability(s) => &s.variables,
        };
        for v in vars {
            if v.symbol == symbool {
                return v.value;
            }
        }
    }
    panic!("variabele {symbool} niet gevonden in toets {check_id}");
}

/// Waarde (`value`) van een weerstandstoets.
fn waarde(checks: &[NamedCheck], check_id: &str) -> f64 {
    for c in checks {
        if c.id == check_id {
            if let CheckKind::Resistance(r) = &c.kind {
                return r.value;
            }
        }
    }
    panic!("toets {check_id} niet gevonden");
}

/// Unity check van een toets.
fn uc(checks: &[NamedCheck], check_id: &str) -> f64 {
    for c in checks {
        if c.id == check_id {
            let u = match &c.kind {
                CheckKind::Resistance(r) => r.uc.as_ref().map(|x| x.uc),
                CheckKind::Stability(s) => s.uc.as_ref().map(|x| x.uc),
            };
            return u.unwrap_or(f64::NAN);
        }
    }
    panic!("toets {check_id} niet gevonden");
}

fn invoer(
    m_ed_knm: f64,
    v_ed_kn: f64,
    w_inst: f64,
    w_qp: f64,
    k_cr: f64,
    kip: bool,
) -> TimberBeamCheckInput {
    TimberBeamCheckInput {
        beam_id: 1,
        width_mm: B_MM,
        height_mm: H_MM,
        strength_class: "C24".to_string(),
        // Gebruiksklasse 1, KLED middellang → k_mod = 0,80, k_def = 0,60.
        service_class: ServiceClass::Sc1,
        load_duration: LoadDurationClass::MediumTerm,
        length_m: L_M,
        // Envelop met de twee maatgevende punten: het veldmoment op het
        // midden en de dwarskracht op de oplegging.
        forces_envelope: vec![
            ForcePoint {
                combination_id: 1,
                position_mm: 0.0,
                forces: InternalForces { vz_ed: v_ed_kn, ..Default::default() },
            },
            ForcePoint {
                combination_id: 1,
                position_mm: L_M * 500.0,
                forces: InternalForces { my_ed: m_ed_knm, ..Default::default() },
            },
        ],
        buckling_length_y_m: L_M,
        buckling_length_z_m: L_M,
        ltb_segment_length_m: 0.0,
        ltb_load_case: nen_en_1995_1_1::stability::LtbLoadCase::UniformLoad,
        ltb_load_position: nen_en_1995_1_1::stability::LtbLoadPosition::CentreOfGravity,
        ltb_effective_length_override_m: 0.0,
        // De bron: "zijdelings gesteund door de vloerplaat, dus geen kip".
        perform_ltb_check: kip,
        k_cr,
        load_sharing: false,
        deflection_inst_mm: w_inst,
        deflection_quasi_perm_mm: w_qp,
        // Het blijvende BGT-deel wordt in dit geval niet apart getoetst;
        // 0 betekent w_add = w_fin (de bron toetst w_add niet).
        deflection_permanent_mm: 0.0,
        deflection_limit_fin: 250.0,
        deflection_limit_add: 333.0,
    }
}

#[test]
fn r19_vloerligger_c24_langs_de_productieroute() {
    let m_ed = env_f64("R19_M_ED", M_ED_FALLBACK_KNM);
    let v_ed = env_f64("R19_V_ED", V_ED_FALLBACK_KN);
    let w_inst = env_f64("R19_W_INST", W_INST_FALLBACK_MM);
    let w_qp = env_f64("R19_W_QP", W_QP_FALLBACK_MM);

    // ── Variant zoals de BRON rekent: k_cr = 0,67, geen kiptoets ────────────
    let res = check_timber_beam(invoer(m_ed, v_ed, w_inst, w_qp, K_CR_BRON, false));
    let f_myd = variabele(&res.checks, "6.1.6_bending", r"f_{m,y,d}");
    let f_vd = variabele(&res.checks, "6.1.7_shear", r"f_{v,d}");
    let sigma_myd = variabele(&res.checks, "6.1.6_bending", r"\sigma_{m,y,d}");
    let tau_d = waarde(&res.checks, "6.1.7_shear");
    let uc_shear = uc(&res.checks, "6.1.7_shear");
    // V_Rd volgt uit de toets zelf: UC = tau_d / f_v,d en tau_d ~ V, dus
    // V_Rd = V_Ed / UC. Voor een rechthoek is dat (2/3)·k_cr·b·h·f_v,d.
    let v_rd_kn = v_ed / uc_shear;
    // Benodigd weerstandsmoment W_erf = M_Ed / f_m,d (mm3).
    let w_erf_mm3 = m_ed * 1e6 / f_myd;
    // w_fin en w_add komen als |w| in de UC van de doorbuigingstoetsen terug.
    let w_fin_mm = uc(&res.checks, "deflection_w_fin") * (L_M * 1000.0 / 250.0);
    let w_add_mm = uc(&res.checks, "deflection_w_add") * (L_M * 1000.0 / 333.0);

    // ── Variant zoals de APP hem vandaag automatisch opbouwt ────────────────
    // timberCheckBuilder.ts zet k_cr vast op 1,0, gebruikt de KARAKTERISTIEKE
    // zakking ook als quasi-blijvende zakking, en zet perform_ltb_check altijd
    // aan met de volle staaflengte als kipsteunafstand. De eerste twee keuzes
    // staan er als "veilig-zijdig" bij; voor k_cr pakt het juist de andere kant
    // op, en de kiptoets kan niet uit ook al is de ligger zijdelings gesteund.
    let res_app = check_timber_beam(invoer(m_ed, v_ed, w_inst, w_inst, K_CR_APP_DEFAULT, true));
    let v_rd_app_kn = v_ed / uc(&res_app.checks, "6.1.7_shear");
    let w_fin_app_mm = uc(&res_app.checks, "deflection_w_fin") * (L_M * 1000.0 / 250.0);
    let uc_kip_app = uc(&res_app.checks, "6.3.3_beam_stability");
    let uc_max_app = res_app.uc_max;
    let maatgevend_app = res_app.governing_check_id.clone();

    println!(
        "#R19-JSON# {{\"f_myd\":{f_myd},\"f_vd\":{f_vd},\"sigma_myd\":{sigma_myd},\
         \"tau_d\":{tau_d},\"uc_shear\":{uc_shear},\"V_Rd_kN\":{v_rd_kn},\
         \"W_erf_mm3\":{w_erf_mm3},\"w_fin_mm\":{w_fin_mm},\"w_add_mm\":{w_add_mm},\
         \"V_Rd_app_default_kN\":{v_rd_app_kn},\"w_fin_app_default_mm\":{w_fin_app_mm},\
         \"uc_kip_app_default\":{uc_kip_app},\"uc_max_app_default\":{uc_max_app},\
         \"maatgevend_app_default\":\"{maatgevend_app}\",\
         \"M_Ed_kNm\":{m_ed},\"V_Ed_kN\":{v_ed},\"w_inst_mm\":{w_inst},\"w_qp_mm\":{w_qp}}}"
    );

    // ── Referentiewaarden uit het dossier (NIET aanpassen) ──────────────────
    // Tolerantie: de bron geeft deze grootheden op 2 à 3 cijfers, dus de
    // afrondkorrel is hier zelf al circa 1 %. De assertie hieronder gebruikt
    // 1,5 % zodat alleen een ECHTE afwijking hem laat vallen.
    let tol = 0.015;
    let check = |naam: &str, ons: f64, ref_: f64| {
        let d = (ons - ref_) / ref_;
        assert!(
            d.abs() <= tol,
            "{naam}: onze waarde {ons:.6}, referentie {ref_}, afwijking {:.3} %",
            d * 100.0
        );
    };
    check("f_m,d", f_myd, 14.8);
    check("f_v,d", f_vd, 2.46);
    check("V_Rd", v_rd_kn, 10.9);
    check("W_erf", w_erf_mm3, 345e3);
    check("w_fin totaal", w_fin_mm.abs(), 22.8);
}
