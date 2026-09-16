//! Verlopende stalen staaf — analytische proeven (ontwerp 15-09-2026, deel 2).
//!
//! Alle referentiewaarden zijn met de hand uitgerekend; de formules staan
//! hieronder en worden in de proef zelf opnieuw geëvalueerd, los van de kern.
//!
//! ── DE HANDBEREKENING ──────────────────────────────────────────────────────
//!
//! Een verlopende stalen staaf telt als GELAST I-profiel zonder
//! afrondingsstraal: twee flenzen b × t_f en een lijf (h − 2·t_f) × t_w. Voor
//! zo'n dubbelsymmetrische doorsnede is het plastische weerstandsmoment om de
//! sterke as exact
//!
//!   W_pl,y = b·t_f·(h − t_f) + t_w·(h − 2·t_f)²/4
//!
//! (twee flenzen op armafstand h − t_f, plus twee lijfhelften met zwaartepunt
//! op (h − 2t_f)/4 vanaf het midden). Daarmee is, voor klasse 1 of 2,
//!
//!   M_y,c,Rd = W_pl,y · f_y / γ_M0     (art. 6.2.5, vgl. 6.13)
//!   UC       = |M_y,Ed| / M_y,c,Rd
//!
//! De vier maten verlopen lineair, dus W_pl,y(u) is een derdegraads veelterm in
//! u = x/L. Bij een momentenlijn die van de inklemming af daalt, ligt het
//! maximum van M/W_pl daardoor ergens IN de staaf. De proef zoekt dat punt met
//! de formule hierboven en eist dat de kern hetzelfde punt aanwijst.

use approx::assert_relative_eq;
use mechanics::{ForcePoint, InternalForces};
use nen_en_1990::ConsequenceClass;
use nen_en_1993_1_1_ltb::LateralBracing;
use nen_en_1993_1_1_section::classification::CrossSectionClass;
use nen_en_1993_1_1_section::CheckStatus;
use steel_check::*;

/// De vier hoofdmaten van een I-profiel, zoals ze in de catalogus staan.
#[derive(Clone, Copy)]
struct Maten {
    h: f64,
    b: f64,
    tw: f64,
    tf: f64,
}
const IPE400: Maten = Maten { h: 400.0, b: 180.0, tw: 8.6, tf: 13.5 };
const IPE200: Maten = Maten { h: 200.0, b: 100.0, tw: 5.6, tf: 8.5 };

fn lineair(a: Maten, b: Maten, u: f64) -> Maten {
    let l = |p: f64, q: f64| p + (q - p) * u;
    Maten { h: l(a.h, b.h), b: l(a.b, b.b), tw: l(a.tw, b.tw), tf: l(a.tf, b.tf) }
}

/// W_pl,y van een gelast, dubbelsymmetrisch I-profiel zonder afronding (mm³).
fn w_pl_y(m: Maten) -> f64 {
    let hw = m.h - 2.0 * m.tf;
    m.b * m.tf * (m.h - m.tf) + m.tw * hw * hw / 4.0
}

fn staaf(
    profiel: &str,
    eind: Option<&str>,
    l_mm: f64,
    punten: &[(f64, InternalForces)],
) -> BeamCheckInput {
    BeamCheckInput {
        beam_id: 1,
        profile_name: profiel.to_string(),
        steel_grade: "S235".to_string(),
        length_m: l_mm / 1000.0,
        forces_envelope: punten
            .iter()
            .map(|&(x, f)| ForcePoint { combination_id: 1, position_mm: x, forces: f })
            .collect(),
        lateral_bracing: LateralBracing {
            top_flange_positions: vec![],
            bottom_flange_positions: vec![],
        },
        buckling_length_y_m: 0.0,
        buckling_length_z_m: 0.0,
        deflection_limit_class: DeflectionClass::Floor,
        deflection_limit_numerator: 333,
        deflection_actual_max_mm: 0.0,
        is_cantilever: false,
        consequence_class: ConsequenceClass::CC1,
        pre_camber_mm: 0.0,
        deflection_permanent_mm: 0.0,
        deflection_add_limit_numerator: 0.0,
        deflection_notes: vec![],
        q_equiv_n_per_mm: 0.0,
        z_a_mm: 0.0,
        custom_section: None,
        staafstand: None,
        staafstand_notities: None,
        staafeinden: None,
        staaf_notities: None,
        profile_end: eind.map(|s| s.to_string()),
    }
}

fn buiging(my_knm: f64) -> InternalForces {
    InternalForces { n_ed: 0.0, vy_ed: 0.0, vz_ed: 0.0, mt_ed: 0.0, my_ed: my_knm, mz_ed: 0.0 }
}

fn toets<'a>(r: &'a BeamCheckResult, id: &str) -> &'a NamedCheck {
    r.checks.iter().find(|c| c.id == id).unwrap_or_else(|| {
        panic!("toets {id} ontbreekt; aanwezig: {:?}", r.checks.iter().map(|c| &c.id).collect::<Vec<_>>())
    })
}

fn uc(r: &BeamCheckResult, id: &str) -> f64 {
    match &toets(r, id).kind {
        CheckKind::Resistance(x) => x.uc.as_ref().expect("UC").uc,
        CheckKind::Stability(x) => x.uc.as_ref().expect("UC").uc,
    }
}

fn positie(r: &BeamCheckResult, id: &str) -> f64 {
    match &toets(r, id).kind {
        CheckKind::Resistance(x) => x.force_state.position_mm,
        CheckKind::Stability(x) => x.force_state.position_mm,
    }
}

/// Een tussenwaarde van een stabiliteitstoets, op symbool.
fn tussenwaarde(r: &BeamCheckResult, id: &str, symbool: &str) -> f64 {
    match &toets(r, id).kind {
        CheckKind::Stability(s) => s
            .variables
            .iter()
            .chain(s.intermediate_values.iter())
            .find(|v| v.symbol == symbool)
            .unwrap_or_else(|| panic!("symbool {symbool} ontbreekt in {id}"))
            .value,
        _ => panic!("{id} is geen stabiliteitstoets"),
    }
}

/// De hele toets als tekst — notities én afleiding. De herkomst van de
/// knikkromme staat in de deelstappen van 6.3.1 en niet in `notes`.
fn tekst_van(r: &BeamCheckResult, id: &str) -> String {
    serde_json::to_string(&toets(r, id)).expect("serialiseren")
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Prismatisch blijft prismatisch — geen enkel getal verandert
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn eindprofiel_gelijk_of_leeg_geeft_byte_gelijke_uitkomst() {
    let punten = [
        (0.0, buiging(0.0)),
        (2500.0, buiging(80.0)),
        (5000.0, buiging(0.0)),
    ];
    let kaal = serde_json::to_string(&check_beam(staaf("IPE300", None, 5000.0, &punten))).unwrap();
    for eind in ["IPE300", "IPE 300", "  IPE300  ", ""] {
        let met =
            serde_json::to_string(&check_beam(staaf("IPE300", Some(eind), 5000.0, &punten))).unwrap();
        assert_eq!(kaal, met, "eindprofiel {eind:?} hoort prismatisch te blijven");
    }
    assert!(!kaal.contains("verloop"), "een prismatische staaf krijgt geen verloopveld in de JSON");
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. Het maatgevende punt ligt NIET waar het moment het grootst is
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn uitkrager_ipe400_naar_ipe200_vindt_het_maximum_van_m_over_wpl() {
    // Uitkrager L = 6000 mm, ingeklemd op x = 0 waar het profiel IPE 400 is;
    // aan de tip (x = L) IPE 200. M(x) = 200·(1 − x/L) kNm, elf rekenpunten.
    let l = 6000.0;
    let n = 10;
    let punten: Vec<(f64, InternalForces)> = (0..=n)
        .map(|i| {
            let u = i as f64 / n as f64;
            (u * l, buiging(200.0 * (1.0 - u)))
        })
        .collect();

    // HANDBEREKENING: het rekenpunt met de grootste M/W_pl, met W_pl uit de
    // gesloten formule bovenaan dit bestand.
    let (u_hand, uc_hand) = (0..=n)
        .map(|i| {
            let u = i as f64 / n as f64;
            let m_ed = 200.0 * (1.0 - u);
            let m_rd = w_pl_y(lineair(IPE400, IPE200, u)) * 235.0 * 1e-6; // γ_M0 = 1,0
            (u, m_ed / m_rd)
        })
        .fold((0.0, 0.0), |beste, kandidaat| {
            if kandidaat.1 > beste.1 { kandidaat } else { beste }
        });
    // u* = 0,4: W_pl = 148·11,5·308,5 + 7,4·297²/4 = 525 067 + 163 186,65
    //           = 688 253,65 mm³ → M_c,Rd = 161,74 kNm → UC = 120/161,74 = 0,74194.
    assert_relative_eq!(u_hand, 0.4, epsilon = 1e-12);
    assert_relative_eq!(uc_hand, 0.741936, max_relative = 1e-4);

    let r = check_beam(staaf("IPE400", Some("IPE200"), l, &punten));
    // De namen komen uit de catalogus zelf ("IPE 400"), niet uit de invoer.
    assert_eq!(r.profile_name, "IPE 400 → IPE 200 (verlopend)");
    assert_eq!(
        positie(&r, "6.2.5_bending_y"),
        u_hand * l,
        "de kern hoort hetzelfde maatgevende rekenpunt te vinden als de handberekening"
    );
    assert!(
        positie(&r, "6.2.5_bending_y") > 0.0,
        "het maatgevende punt ligt NIET bij de inklemming, waar M het grootst is"
    );
    assert_relative_eq!(uc(&r, "6.2.5_bending_y"), uc_hand, max_relative = 2e-4);

    // Bij de inklemming, met het grootste moment, is de unity check lager:
    // 200/(1 238 322·235·10⁻⁶) = 200/291,01 = 0,68727.
    let v = r.verloop.as_ref().expect("verlooprapport");
    let uc_op = |x: f64| -> f64 {
        v.toetsdoorsneden
            .iter()
            .find(|d| (d.x_mm - x).abs() < 1e-9)
            .and_then(|d| d.toetsen.iter().find(|t| t.id == "6.2.5_bending_y"))
            .and_then(|t| t.uc)
            .unwrap_or_else(|| panic!("geen UC op x = {x}"))
    };
    assert_relative_eq!(uc_op(0.0), 200.0 / (w_pl_y(IPE400) * 235.0 * 1e-6), max_relative = 2e-4);
    assert!(uc_op(0.0) < uc(&r, "6.2.5_bending_y"));

    // Het rapport: zes toetsdoorsneden (x = 0, L/5, …, L), maten en klasse.
    assert_eq!(v.aantal_rekenpunten, 11);
    assert_eq!(v.toetsdoorsneden.len(), 6);
    assert_eq!(v.toetsdoorsneden[0].x_mm, 0.0);
    assert_eq!(v.toetsdoorsneden[5].x_mm, l);
    assert_relative_eq!(v.toetsdoorsneden[5].maten.h_mm, 200.0, epsilon = 1e-9);
    assert_eq!(v.toetsdoorsneden[5].maten.tw_mm, Some(5.6));
    for d in &v.toetsdoorsneden {
        assert_eq!(d.klasse, Some(CrossSectionClass::Class1), "op x = {}", d.x_mm);
        // W_pl uit de doorsnedemotor tegen de gesloten formule.
        let hand = w_pl_y(lineair(IPE400, IPE200, d.t));
        assert_relative_eq!(d.w_y_mm3, hand, max_relative = 1e-6);
    }
    let m = v.maatgevend.as_ref().expect("maatgevend punt");
    assert_eq!(m.toets_id, "6.2.5_bending_y");
    assert_eq!(m.doorsnede.x_mm, 2400.0);
    // `maatgevend` gaat over de DOORSNEDEtoetsen; de staaf als geheel wordt
    // door de kipcontrole beheerst — zij rekent veilig-zijdig met de kleinste
    // doorsnede (IPE 200) over de volle 6 m zonder kipsteun, en dat is voor
    // 200 kNm veel te weinig. Dat hoort zo, en het bewijst dat de
    // stabiliteitstoetsen langs de andere weg lopen dan de doorsnedetoetsen.
    assert!(matches!(r.status, CheckStatus::NotOk));
    assert_eq!(r.governing_check_id, "6.3.2_ltb");
    assert!(uc(&r, "6.3.2_ltb") > uc(&r, "6.2.5_bending_y"));
    let kip = v
        .stabiliteit
        .iter()
        .find(|s| s.toets_id == "6.3.2_ltb")
        .expect("kipdoorsnede");
    assert_eq!(kip.x_mm, l, "de kleinste doorsnede in het kipveld ligt aan de tip");
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. Gelast, niet gewalst: een andere knikkromme en dus een andere χ
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn verlopende_staaf_krijgt_de_gelaste_knikkromme_en_dus_een_lagere_chi() {
    // Een gedrukte staaf van 4 m. Verlopend IPE 200 → IPE 220: de kleinste
    // doorsnede voor knik ligt aan het IPE 200-einde (x = 0). Daarnaast
    // dezelfde staaf prismatisch als catalogus-IPE 200.
    let l = 4000.0;
    let druk = InternalForces {
        n_ed: -120.0,
        vy_ed: 0.0,
        vz_ed: 0.0,
        mt_ed: 0.0,
        my_ed: 0.0,
        mz_ed: 0.0,
    };
    let punten = [(0.0, druk), (l, druk)];
    let verlopend = check_beam(staaf("IPE200", Some("IPE220"), l, &punten));
    let gewalst = check_beam(staaf("IPE200", None, l, &punten));

    // Tabel 6.2: een GEWALST I-profiel met h/b > 1,2 en t_f ≤ 40 mm krijgt
    // kromme a om y-y en b om z-z; een GELAST I-profiel met t_f ≤ 40 mm krijgt
    // kromme b om y-y en c om z-z. α gaat daarmee van 0,21/0,34 naar
    // 0,34/0,49, en χ wordt dus kleiner bij dezelfde slankheid.
    let t_verlopend = tekst_van(&verlopend, "6.3.1_buckling");
    assert!(
        t_verlopend.contains("gelaste profielen"),
        "de afleiding hoort te zeggen dat tabel 6.2 voor GELASTE profielen is gebruikt"
    );
    assert!(t_verlopend.contains("VERLOPEND PROFIEL"));
    assert!(
        tekst_van(&gewalst, "6.3.1_buckling").contains("profieldatabase"),
        "de prismatische staaf hoort de catalogusrij van tabel 6.2 te noemen"
    );

    let chi_v = tussenwaarde(&verlopend, "6.3.1_buckling", r"\chi");
    let chi_g = tussenwaarde(&gewalst, "6.3.1_buckling", r"\chi");
    assert!(
        chi_v < chi_g,
        "gelast hoort een lagere knikfactor te geven dan gewalst: χ_verlopend = {chi_v}, \
         χ_gewalst = {chi_g}"
    );
    // De stabiliteitsdoorsnede staat in het rapport en het is de kleinste.
    let v = verlopend.verloop.as_ref().expect("verlooprapport");
    let knik = v
        .stabiliteit
        .iter()
        .find(|s| s.toets_id == "6.3.1_buckling")
        .expect("knikdoorsnede");
    assert_eq!(knik.x_mm, 0.0, "de kleinste doorsnede ligt aan het IPE 200-einde");
    assert_relative_eq!(knik.maten.h_mm, 200.0, epsilon = 1e-9);
    assert!(knik.reden.contains("KLEINSTE doorsnede"));
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. Weigeringen met reden
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn niet_ondersteunde_eindprofielen_worden_geweigerd_met_reden() {
    let punten = [(0.0, buiging(0.0)), (3000.0, buiging(50.0))];
    for (eind, woord) in [
        ("SHS100x100x5", "geen I/H-profiel"),
        ("UNP200", "geen I/H-profiel"),
        ("L100x100x10", "geen I/H-profiel"),
        ("IPE999", "niet bekend in de EN 1993-profieldatabase"),
    ] {
        let r = check_beam(staaf("IPE300", Some(eind), 3000.0, &punten));
        assert!(r.checks.is_empty(), "{eind} hoort niet getoetst te worden");
        assert!(matches!(r.status, CheckStatus::NotApplicable));
        assert!(
            r.governing_check_id.contains(woord),
            "{eind}: reden was \"{}\"",
            r.governing_check_id
        );
    }
    // Een INP heeft toelopende flenzen: geen vaste t_f, dus geen gelast model.
    let r = check_beam(staaf("INP200", Some("INP300"), 3000.0, &punten));
    assert!(
        r.governing_check_id.contains("toelopende flenzen"),
        "reden: {}",
        r.governing_check_id
    );
}

#[test]
fn eigen_doorsnede_met_eindprofiel_wordt_geweigerd() {
    let punten = [(0.0, buiging(0.0)), (3000.0, buiging(50.0))];
    let mut invoer = staaf("eigen", Some("IPE200"), 3000.0, &punten);
    invoer.custom_section = Some(CustomSection {
        naam: "proef".to_string(),
        lamellen: vec![CustomLamella {
            b_mm: 200.0,
            t_mm: 10.0,
            y_mm: 0.0,
            z_mm: 0.0,
            alpha_rad: 0.0,
        }],
        gesloten_cellen: vec![],
        eigenschappen: None,
        vorm: CustomDoorsnedevorm::Onbekend,
    });
    let r = check_beam(invoer);
    assert!(r.governing_check_id.contains("eigen doorsnede"), "reden: {}", r.governing_check_id);
}
