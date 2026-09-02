//! R20 — parallelligger BSH 160 × 680 mm, 3 + 14 + 3 m met kragarmen.
//!
//! Validatiecampagne referentieberekeningen, geval R20 uit
//! `docs/superpowers/plans/2026-09-02-referentieberekeningen.md`.
//!
//! Deze test voert de EN 1995-1-1-kant van R20 uit LANGS DE PRODUCTIEROUTE:
//! `timber_check::check_timber_beam`, dezelfde functie die het Tauri-command
//! `check_timber_beams` aanroept. Zo staat er in de vergelijkingstabel van
//! `design-mockup/referentie/toets-R20.mjs` niet alleen een handafleiding maar
//! ook wat de toetsmodule van de app er zélf van maakt.
//!
//! LET OP — R20 rekent volgens de DUITSE nationale bijlage. De kern van deze
//! app kent alleen de Nederlandse/EC5-aanbevolen keuzes. Vier verschillen
//! zijn structureel en verklaren de afwijkingen vooraf; ze zijn `NB`, geen
//! rekenfout:
//!   1. gamma_M voor gelamineerd hout: kern 1,25 — DE NB 1,30;
//!   2. k_cr: de kern krijgt hem als invoer, maar de builder van de app zet
//!      hem vast op 1,0 — DE NB komt via k_cr·f_v,k = 2,5 N/mm² uit op
//!      b_ef = 0,71·b;
//!   3. sigma_m,crit: de kern gebruikt de vereenvoudigde vergelijking (6.32)
//!      voor naaldhout, de bron (6.31) met de Duitse factor 1,4 op
//!      E_0,05·G_05;
//!   4. de sterkteklasse GL28c bestaat niet in de kern; GL28h is de naaste
//!      buur (zelfde f_m,k, E_0,05 100 N/mm² hoger).
//! Een oplegdruktoets (f_c,90) kent de orchestrator helemaal niet.
//!
//! De snedekrachten en zakkingen komen uit de solver-run in
//! `design-mockup/referentie/toets-R20.mjs`. Dat script geeft ze mee via
//! omgevingsvariabelen (R20_M_ED, R20_M_KRAAG, R20_V_ED, R20_W_INST,
//! R20_W_QP); zonder die variabelen valt de test terug op de analytische
//! waarden van het geval, die hieronder als constante staan.
//!
//! De test drukt één regel af die met `#R20-JSON#` begint; `toets-R20.mjs`
//! leest die regel en zet de waarden in zijn vergelijkingstabel.
//!
//! Draaien:
//!   cargo test -p timber-check --test referentie_r20 -- --nocapture

use mechanics::{ForcePoint, InternalForces};
use nen_en_1995_1_1::stability::{LtbLoadCase, LtbLoadPosition};
use nen_en_1995_1_1::{LoadDurationClass, ServiceClass};
use steel_check::{CheckKind, NamedCheck};
use timber_check::{check_timber_beam, TimberBeamCheckInput};

// ── Invoer uit het dossier ──────────────────────────────────────────────────
const B_MM: f64 = 160.0;
const H_MM: f64 = 680.0;
/// Overspanning tussen de steunpunten A en B.
const L_SPAN_M: f64 = 14.0;
/// Zijdelingse steun van de bovenrand om de 4,67 m (= l/3).
const LEF_KIP_M: f64 = 14.0 / 3.0;
/// b_ef = 0,71·b volgens de Duitse NB → k_cr = 0,71.
const K_CR_BRON: f64 = 0.71;
/// Scheurfactor die `timberCheckBuilder.ts` op dit moment vast meegeeft.
const K_CR_APP_DEFAULT: f64 = 1.0;

// Analytische terugval als het mjs-script de waarden niet aanlevert
// (q_d = 11,205 kN/m, a = 3 m, l = 14 m).
const M_ED_FALLBACK_KNM: f64 = 11.205 * 14.0 * 14.0 / 8.0 - 11.205 * 9.0 / 2.0;
const M_KRAAG_FALLBACK_KNM: f64 = -11.205 * 9.0 / 2.0;
const V_ED_FALLBACK_KN: f64 = 11.205 * 20.0 / 2.0 - 11.205 * 3.0;
/// BGT karakteristiek (g_k + s_k) en het blijvende deel (g_k), mm, omlaag = −.
const W_INST_FALLBACK_MM: f64 = -58.075;
const W_QP_FALLBACK_MM: f64 = -24.570;

fn env_f64(naam: &str, terugval: f64) -> f64 {
    std::env::var(naam)
        .ok()
        .and_then(|s| s.trim().parse::<f64>().ok())
        .unwrap_or(terugval)
}

/// Zoek een `NamedValue` op zijn LaTeX-symbool binnen één toets — eerst in
/// `variables`, dan in de tussenwaarden van een stabiliteitstoets.
fn variabele(checks: &[NamedCheck], check_id: &str, symbool: &str) -> f64 {
    for c in checks {
        if c.id != check_id {
            continue;
        }
        match &c.kind {
            CheckKind::Resistance(r) => {
                for v in &r.variables {
                    if v.symbol == symbool {
                        return v.value;
                    }
                }
            }
            CheckKind::Stability(s) => {
                for v in s.variables.iter().chain(s.intermediate_values.iter()) {
                    if v.symbol == symbool {
                        return v.value;
                    }
                }
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

/// Bouw de invoer voor één variant.
///
/// `lef_override_m` = 0 → de kern leidt l_ef zelf af uit tabel 6.1 op de
/// staaflengte (wat de app vandaag doet); > 0 → de kipsteunafstand van de
/// bron wordt opgelegd.
#[allow(clippy::too_many_arguments)]
fn invoer(
    m_ed_knm: f64,
    m_kraag_knm: f64,
    v_ed_kn: f64,
    w_inst: f64,
    w_qp: f64,
    k_cr: f64,
    lef_override_m: f64,
) -> TimberBeamCheckInput {
    TimberBeamCheckInput {
        beam_id: 2,
        width_mm: B_MM,
        height_mm: H_MM,
        // GL28c bestaat niet in de kern; GL28h is de naaste buur.
        strength_class: "GL28h".to_string(),
        // Gebruiksklasse 2, KLED kort → k_mod = 0,90, k_def = 0,80.
        service_class: ServiceClass::Sc2,
        load_duration: LoadDurationClass::ShortTerm,
        length_m: L_SPAN_M,
        // Envelop met de drie maatgevende punten: veldmoment in het midden,
        // kragarmmoment en dwarskracht op de oplegging.
        forces_envelope: vec![
            ForcePoint {
                combination_id: 1,
                position_mm: 0.0,
                forces: InternalForces {
                    vz_ed: v_ed_kn,
                    my_ed: m_kraag_knm,
                    ..Default::default()
                },
            },
            ForcePoint {
                combination_id: 1,
                position_mm: L_SPAN_M * 500.0,
                forces: InternalForces { my_ed: m_ed_knm, ..Default::default() },
            },
        ],
        buckling_length_y_m: L_SPAN_M,
        buckling_length_z_m: LEF_KIP_M,
        ltb_segment_length_m: 0.0,
        ltb_load_case: LtbLoadCase::UniformLoad,
        ltb_load_position: LtbLoadPosition::CentreOfGravity,
        ltb_effective_length_override_m: lef_override_m,
        perform_ltb_check: true,
        k_cr,
        load_sharing: false,
        deflection_inst_mm: w_inst,
        deflection_quasi_perm_mm: w_qp,
        // De Duitse NB toetst w_fin en w_inst, niet w_add; w_perm = 0 laat
        // w_add samenvallen met w_fin en houdt die regel dus onbeslist.
        deflection_permanent_mm: 0.0,
        // DE NB: w_fin <= l/200. (w_inst <= l/300 is een DERDE grootheid die
        // dit tweetal niet kan dragen — zie de bevindingen.)
        deflection_limit_fin: 200.0,
        deflection_limit_add: 300.0,
    }
}

#[test]
fn r20_bsh_ligger_langs_de_productieroute() {
    let m_ed = env_f64("R20_M_ED", M_ED_FALLBACK_KNM);
    let m_kraag = env_f64("R20_M_KRAAG", M_KRAAG_FALLBACK_KNM);
    let v_ed = env_f64("R20_V_ED", V_ED_FALLBACK_KN);
    let w_inst = env_f64("R20_W_INST", W_INST_FALLBACK_MM);
    let w_qp = env_f64("R20_W_QP", W_QP_FALLBACK_MM);

    // ── Variant "bron zover de kern hem aankan" ────────────────────────────
    // k_cr en l_ef zijn invoervelden, dus die kunnen op de Duitse waarden.
    // gamma_M en de keuze voor (6.32) zitten vast in de kern.
    let res = check_timber_beam(invoer(
        m_ed, m_kraag, v_ed, w_inst, w_qp, K_CR_BRON, LEF_KIP_M,
    ));
    let f_myd = variabele(&res.checks, "6.1.6_bending", r"f_{m,y,d}");
    let f_vd = variabele(&res.checks, "6.1.7_shear", r"f_{v,d}");
    let sigma_myd = variabele(&res.checks, "6.1.6_bending", r"\sigma_{m,y,d}");
    let tau_d = waarde(&res.checks, "6.1.7_shear");
    let uc_bending = uc(&res.checks, "6.1.6_bending");
    let uc_shear = uc(&res.checks, "6.1.7_shear");
    let sigma_m_crit = variabele(&res.checks, "6.3.3_beam_stability", r"\sigma_{m,crit}");
    let lambda_rel_m = variabele(&res.checks, "6.3.3_beam_stability", r"\lambda_{rel,m}");
    let k_crit = variabele(&res.checks, "6.3.3_beam_stability", r"k_{crit}");
    let lef_mm = variabele(&res.checks, "6.3.3_beam_stability", r"l_{ef}");
    let uc_kip = uc(&res.checks, "6.3.3_beam_stability");
    // w_fin volgt uit de UC van de doorbuigingstoets: UC = |w_fin|/(L/200).
    let w_fin_mm = uc(&res.checks, "deflection_w_fin") * (L_SPAN_M * 1000.0 / 200.0);
    let uc_w_fin = uc(&res.checks, "deflection_w_fin");

    // ── Variant zoals de APP hem vandaag automatisch opbouwt ───────────────
    // timberCheckBuilder.ts zet k_cr vast op 1,0, geeft geen l_ef-override
    // (dus tabel 6.1 op de staaflengte van 14 m) en gebruikt de
    // KARAKTERISTIEKE zakking ook als quasi-blijvende zakking.
    let res_app = check_timber_beam(invoer(
        m_ed, m_kraag, v_ed, w_inst, w_inst, K_CR_APP_DEFAULT, 0.0,
    ));
    let tau_app = waarde(&res_app.checks, "6.1.7_shear");
    let uc_shear_app = uc(&res_app.checks, "6.1.7_shear");
    let sigma_m_crit_app =
        variabele(&res_app.checks, "6.3.3_beam_stability", r"\sigma_{m,crit}");
    let lef_app_mm = variabele(&res_app.checks, "6.3.3_beam_stability", r"l_{ef}");
    let uc_kip_app = uc(&res_app.checks, "6.3.3_beam_stability");
    let w_fin_app_mm =
        uc(&res_app.checks, "deflection_w_fin") * (L_SPAN_M * 1000.0 / 200.0);
    let uc_max_app = res_app.uc_max;
    let maatgevend_app = res_app.governing_check_id.clone();
    // Kent de orchestrator een oplegdruktoets (f_c,90)? Nee — dit telt hem.
    let aantal_c90 = res_app
        .checks
        .iter()
        .filter(|c| c.id.contains("c90") || c.id.contains("bearing"))
        .count();

    println!(
        "#R20-JSON# {{\"f_myd\":{f_myd},\"f_vd\":{f_vd},\"sigma_myd\":{sigma_myd},\
         \"tau_d\":{tau_d},\"uc_bending\":{uc_bending},\"uc_shear\":{uc_shear},\
         \"sigma_m_crit\":{sigma_m_crit},\"lambda_rel_m\":{lambda_rel_m},\
         \"k_crit\":{k_crit},\"l_ef_mm\":{lef_mm},\"uc_kip\":{uc_kip},\
         \"w_fin_mm\":{w_fin_mm},\"uc_w_fin\":{uc_w_fin},\
         \"tau_app_default\":{tau_app},\"uc_shear_app_default\":{uc_shear_app},\
         \"sigma_m_crit_app_default\":{sigma_m_crit_app},\"l_ef_app_default_mm\":{lef_app_mm},\
         \"uc_kip_app_default\":{uc_kip_app},\"w_fin_app_default_mm\":{w_fin_app_mm},\
         \"uc_max_app_default\":{uc_max_app},\"maatgevend_app_default\":\"{maatgevend_app}\",\
         \"aantal_c90_toetsen\":{aantal_c90},\
         \"M_Ed_kNm\":{m_ed},\"V_Ed_kN\":{v_ed},\"w_inst_mm\":{w_inst},\"w_qp_mm\":{w_qp}}}"
    );

    // ── Assertie 1: interne consistentie van de kern ───────────────────────
    // Dit zijn GEEN referentiewaarden uit de bron, maar de gesloten uitkomst
    // van de kern haar eigen keuzes: k_mod = 0,90 (klimaatklasse 2, KLED
    // kort), gamma_M = 1,25 (glulam, EC5-aanbevolen), k_h = 1,0 (h >= 600 mm).
    let f_myd_verwacht = 0.90 * 28.0 / 1.25;
    let f_vd_verwacht = 0.90 * 3.5 / 1.25;
    assert!(
        (f_myd - f_myd_verwacht).abs() < 1e-9,
        "f_m,y,d = {f_myd}, verwacht {f_myd_verwacht}"
    );
    assert!(
        (f_vd - f_vd_verwacht).abs() < 1e-9,
        "f_v,d = {f_vd}, verwacht {f_vd_verwacht}"
    );

    // ── Assertie 2: de kern rekent met ONZE snedekrachten ──────────────────
    // sigma_m,y,d moet exact M_Ed / (b·h²/6) zijn.
    let sigma_verwacht = m_ed * 1e6 / (B_MM * H_MM * H_MM / 6.0);
    assert!(
        (sigma_myd - sigma_verwacht).abs() < 1e-6,
        "sigma_m,y,d = {sigma_myd}, verwacht {sigma_verwacht}"
    );

    // ── Assertie 3: k_crit = 1,0 ──────────────────────────────────────────
    // Zowel de bron als de kern komen op lambda_rel,m ruim onder 0,75; als
    // dit ooit verandert is dat een echt inhoudelijk verschil, geen afronding.
    assert!(
        (k_crit - 1.0).abs() < 1e-12,
        "k_crit = {k_crit}, verwacht 1,0 (lambda_rel,m = {lambda_rel_m})"
    );

    // ── Assertie 4: de orchestrator kent geen oplegdruktoets ───────────────
    // Vastgelegd zodat het opvalt zodra die er wél komt; de bron toetst
    // sigma_c,90,d wel (UC 0,86) en dat is dus een gat in onze dekking.
    assert_eq!(
        aantal_c90, 0,
        "er is nu wél een f_c,90-toets — werk de bevindingen van R20 bij"
    );
}
