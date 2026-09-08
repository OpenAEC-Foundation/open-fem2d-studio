//! Uitgewerkte handberekeningen bij §7.4.2 — de grenswaarde van de slankheid.
//!
//! Elk getal in dit bestand is MET DE HAND uitgerekend uit de normtekst, en de
//! rekengang staat er in het commentaar bij. Er wordt nergens een uitkomst van
//! de code als verwachting gebruikt: een test die de code met zichzelf
//! vergelijkt bewaakt niets.
//!
//! Twee betonsterkteklassen komen steeds terug, en dat is met opzet:
//!
//! * **C25/30** — f_ck = 25, dus √f_ck = 5 PRECIES en ρ₀ = 10⁻³·5 = 0,005
//!   precies. Daarmee is (7.16) met de hand exact uit te rekenen, tot op de
//!   laatste decimaal.
//! * **C30/37** — de klasse waarvoor de norm zélf getallen geeft: de OPMERKING
//!   bij tabel 7.4N zegt dat de kolommen "beton onder hoge/lage spanning" zijn
//!   berekend voor C30/37, σ_s = 310 MPa, ρ = 1,5 % en ρ = 0,5 %. Daarmee is
//!   (7.16) tegen de norm zelf na te rekenen — zie
//!   [`tabel_7_4n_regel_voor_regel`].
//!
//! Vindplaatsen: NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020, §7.4.1 en
//! §7.4.2, met tabel 7.4N in de door de nationale bijlage normatief verklaarde
//! versie.

use nen_en_1992_1_1::slankheid::{
    check_span_depth_ratio, deflection_limits, rho_0, span_depth_limit, SlendernessEquation,
    SlendernessRequest, StructuralSystem, STRUCTURAL_SYSTEMS,
};
use nen_en_1992_1_1::CheckStatus;

use approx::assert_relative_eq;
use mechanics::ForceStateSnapshot;

/// Een rechthoekige balk zonder enige correctie: alle optionele gegevens leeg
/// behalve die welke de test zelf zet.
fn balk(
    system: StructuralSystem,
    f_ck: f64,
    rho: f64,
    span_mm: f64,
    d_mm: f64,
    b_mm: f64,
) -> SlendernessRequest {
    SlendernessRequest {
        beam_id: 1,
        system,
        f_ck_mpa: f_ck,
        span_mm,
        d_mm,
        rho,
        rho_prime: 0.0,
        sigma_s_mpa: None,
        f_yk_mpa: None,
        a_s_req_mm2: None,
        a_s_prov_mm2: None,
        b_flange_mm: b_mm,
        b_web_mm: b_mm,
        l_eff_mm: None,
        carries_brittle_partitions: Some(false),
        n_ed_kn: Some(0.0),
    }
}

fn factor(r: &nen_en_1992_1_1::slankheid::SlendernessResponse, id: &str) -> f64 {
    r.corrections.iter().find(|c| c.id == id).expect("correctie ontbreekt").factor
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Vrij opgelegde rechthoekige balk — (7.16.a), geen enkele correctie
// ───────────────────────────────────────────────────────────────────────────

/// Vrij opgelegde balk 300 × 500 mm, C25/30, d = 450 mm, l = 6,0 m,
/// ρ = 0,4 % vereiste trekwapening, geen drukwapening.
///
/// HANDBEREKENING
/// ```text
/// √f_ck  = √25                                   = 5
/// ρ₀     = 10⁻³ · 5                              = 0,005
/// ρ      = 0,004 ≤ ρ₀ = 0,005  →  (7.16.a)
/// ρ₀/ρ   = 0,005/0,004                           = 1,25
/// term 2 = 1,5 · 5 · 1,25                        = 9,375
/// term 3 = 3,2 · 5 · (1,25 − 1)^{3/2}
///        = 16 · 0,25 · √0,25 = 16 · 0,125        = 2,000
/// (l/d)  = K · (11 + 9,375 + 2,000), K = 1,0     = 22,375
///
/// correcties: geen — rechthoek (b_flens/b_rib = 1),
///             l_eff = 6 m ≤ 7 m, σ_s niet opgegeven
/// grens  = 22,375
/// l/d    = 6000/450                              = 13,333333…
/// UC     = 13,333333…/22,375                     = 0,595903166
///
/// grenswaarden 7.4.1: 6000/250 = 24,0 mm en 6000/500 = 12,0 mm
/// ```
#[test]
fn vrij_opgelegde_balk_c25_zonder_correcties() {
    let r = span_depth_limit(&balk(
        StructuralSystem::SimplySupported,
        25.0,
        0.004,
        6000.0,
        450.0,
        300.0,
    ))
    .unwrap();

    assert_relative_eq!(rho_0(25.0), 0.005, max_relative = 1e-15);
    assert_eq!(r.equation, SlendernessEquation::Eq716a);
    assert_relative_eq!(r.k, 1.0, max_relative = 1e-15);
    assert_relative_eq!(r.base_l_over_d, 22.375, max_relative = 1e-12);

    // Alle drie de correcties staan in het antwoord — juist ook nu ze geen
    // van alle gelden. Een correctie die stilzwijgend verdwijnt, is niet van
    // een vergeten correctie te onderscheiden.
    assert_eq!(r.corrections.len(), 3);
    assert!(r.corrections.iter().all(|c| !c.applied));
    assert!(r.corrections.iter().all(|c| (c.factor - 1.0).abs() < 1e-15));
    assert!(r.corrections.iter().all(|c| !c.reason.is_empty()));
    // Elke correctie draagt haar eigen ingevulde formuleregel: zonder die
    // regel staat in het rapport wel de factor maar niet waar hij vandaan
    // komt. Ook de niet toegepaste correcties tonen hun drempelvergelijking.
    assert!(r.corrections.iter().all(|c| !c.filled_latex.is_empty()));

    assert_relative_eq!(r.limit_l_over_d, 22.375, max_relative = 1e-12);
    assert_relative_eq!(r.actual_l_over_d, 13.333_333_333_333_334, max_relative = 1e-12);
    assert_relative_eq!(r.unity_check, 0.595_903_165_735_568, max_relative = 1e-12);
    assert_eq!(r.status, CheckStatus::Ok);

    assert_relative_eq!(r.deflection_limits.appearance_mm, 24.0, max_relative = 1e-12);
    assert_relative_eq!(r.deflection_limits.damage_mm, 12.0, max_relative = 1e-12);
    assert_eq!(r.deflection_limits.combination, "quasi-blijvend");
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Tussenoverspanning T-ligger — alle drie de correcties tegelijk
// ───────────────────────────────────────────────────────────────────────────

/// Tussenoverspanning van een T-ligger, C30/37, l = 10,0 m, d = 600 mm.
/// Flens 1500 mm, lijf 250 mm. ρ = 1,5 %, ρ' = 0. Wapening precies zoals
/// vereist (A_s,req = A_s,prov = 1500 mm²), f_yk = 500 MPa. Het element draagt
/// kwetsbare scheidingswanden.
///
/// HANDBEREKENING
/// ```text
/// ρ₀     = 10⁻³·√30 = 0,005477225575…
/// ρ      = 0,015 > ρ₀  →  (7.16.b), met ρ' = 0
/// term 2 = 1,5·√30 · ρ₀/(ρ − ρ')
///        = 1,5·√30 · (10⁻³·√30)/0,015
///        = 1,5 · 30 · 10⁻³ / 0,015                    = 3,000  EXACT
/// term 3 = (1/12)·√30 · √(0/ρ₀)                       = 0
/// (l/d)  = K · (11 + 3,000), K = 1,5                  = 21,000
///
/// (7.17): 310/σ_s = 500/(500 · 1500/1500) = 500/500   = 1,000
/// flens:  1500/250 = 6 > 3                            = 0,800
/// lengte: l_eff = 10 m > 7 m, draagt wanden → 7/10     = 0,700
/// grens  = 21,000 · 1,000 · 0,800 · 0,700             = 11,760  EXACT
/// l/d    = 10000/600                                  = 16,666667
/// UC     = 16,666667/11,760                           = 1,417234  → VOLDOET NIET
/// ```
///
/// Dat de toets hier afkeurt, is de bedoeling van het voorbeeld: 7.4.2(1)P
/// zegt dat een element dat buiten deze grenzen ligt niet is afgekeurd maar
/// zorgvuldiger moet worden gecontroleerd — langs 7.4.3.
#[test]
fn t_ligger_met_alle_drie_de_correcties() {
    let mut req = balk(StructuralSystem::InteriorSpan, 30.0, 0.015, 10_000.0, 600.0, 250.0);
    req.b_flange_mm = 1500.0;
    req.b_web_mm = 250.0;
    req.f_yk_mpa = Some(500.0);
    req.a_s_req_mm2 = Some(1500.0);
    req.a_s_prov_mm2 = Some(1500.0);
    req.l_eff_mm = Some(10_000.0);
    req.carries_brittle_partitions = Some(true);

    let r = span_depth_limit(&req).unwrap();
    assert_eq!(r.equation, SlendernessEquation::Eq716b);
    assert_relative_eq!(r.base_l_over_d, 21.0, max_relative = 1e-12);
    assert_relative_eq!(factor(&r, "sigma_s"), 1.0, max_relative = 1e-12);
    assert_relative_eq!(factor(&r, "flens"), 0.8, max_relative = 1e-15);
    assert_relative_eq!(factor(&r, "lange_overspanning"), 0.7, max_relative = 1e-12);
    assert_relative_eq!(r.limit_l_over_d, 11.76, max_relative = 1e-12);
    assert_relative_eq!(r.actual_l_over_d, 16.666_666_666_666_668, max_relative = 1e-12);
    assert_relative_eq!(r.unity_check, 1.417_233_560_090_703, max_relative = 1e-12);
    assert_eq!(r.status, CheckStatus::NotOk);
    // De doorverwijzing naar 7.4.3 hoort in het antwoord te staan; zonder haar
    // leest een afkeuring als een definitief oordeel, en dat is zij niet.
    assert!(r.notes.iter().any(|n| n.contains("7.4.2(1)P") && n.contains("7.4.3")));
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Uitkraging — K = 0,4
// ───────────────────────────────────────────────────────────────────────────

/// Uitkraging 2,0 m, C25/30, d = 250 mm, ρ = 0,4 %.
///
/// HANDBEREKENING
/// ```text
/// (7.16.a) bij C25/30 en ρ = 0,004 levert 22,375 (zie test 1)
/// K = 0,4  →  0,4 · 22,375                       = 8,950  EXACT
/// l/d = 2000/250                                 = 8,000
/// UC  = 8,000/8,950                              = 0,893855
/// ```
///
/// Bij een uitkraging is de maatgevende doorsnede volgens 7.4.2(2) niet het
/// midden van de overspanning maar de OPLEGGING; ρ hoort daar te zijn bepaald.
#[test]
fn uitkraging_k_is_0_4() {
    let r =
        span_depth_limit(&balk(StructuralSystem::Cantilever, 25.0, 0.004, 2000.0, 250.0, 300.0))
            .unwrap();
    assert_relative_eq!(r.k, 0.4, max_relative = 1e-15);
    assert_relative_eq!(r.limit_l_over_d, 8.95, max_relative = 1e-12);
    assert_relative_eq!(r.actual_l_over_d, 8.0, max_relative = 1e-15);
    assert_relative_eq!(r.unity_check, 0.893_854_748_603_352, max_relative = 1e-12);
    assert_eq!(r.status, CheckStatus::Ok);
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Vlakke plaatvloer — de 8,5 m-regel, en de eenhedenval
// ───────────────────────────────────────────────────────────────────────────

/// Vlakke plaatvloer, C30/37, grootste overspanning 12,0 m, d = 700 mm,
/// ρ = 0,5 %, draagt kwetsbare scheidingswanden.
///
/// HANDBEREKENING
/// ```text
/// ρ₀     = 10⁻³·√30 = 0,005477225575…
/// ρ      = 0,005 ≤ ρ₀  →  (7.16.a)
/// ρ₀/ρ   = √30/5                                 = 1,095445115…
/// term 2 = 1,5·√30 · √30/5 = 1,5·30/5            = 9,000  EXACT
/// term 3 = 3,2·√30 · (0,095445115…)^{3/2}        = 0,516822204…
/// (l/d)  = K · (11 + 9,000 + 0,516822…), K = 1,2 = 24,620186645…
/// lengte: vlakke plaatvloer, l_eff = 12 m > 8,5 m,
///         draagt wanden → 8,5/12                 = 0,708333333…
/// grens  = 24,620186645… · 8,5/12                = 17,439298874…
/// l/d    = 12000/700                             = 17,142857143…
/// UC     = 17,142857…/17,439299…                 = 0,983001511
/// ```
///
/// DE EENHEDENVAL: was l_eff per ongeluk in mm ingevuld, dan zou 8,5/12000 =
/// 0,000708 de grenswaarde op 0,0174 zetten — duizend keer te streng, en toch
/// plausibel omdat de toets gewoon afkeurt. De test pint daarom ook de
/// ORDEGROOTTE vast.
#[test]
fn vlakke_plaatvloer_met_de_8_5_m_regel() {
    let mut req = balk(StructuralSystem::FlatSlab, 30.0, 0.005, 12_000.0, 700.0, 1000.0);
    req.l_eff_mm = Some(12_000.0);
    req.carries_brittle_partitions = Some(true);

    let r = span_depth_limit(&req).unwrap();
    assert_relative_eq!(r.k, 1.2, max_relative = 1e-15);
    assert_relative_eq!(r.base_l_over_d, 24.620_186_645_245_38, max_relative = 1e-12);
    assert_relative_eq!(factor(&r, "lange_overspanning"), 8.5 / 12.0, max_relative = 1e-12);
    assert_relative_eq!(r.limit_l_over_d, 17.439_298_873_715_48, max_relative = 1e-12);
    assert_relative_eq!(r.unity_check, 0.983_001_510_954_942_5, max_relative = 1e-12);
    assert_eq!(r.status, CheckStatus::Ok);

    // Ordegrootte: de factor hoort tussen 0,5 en 1 te liggen. Bij mm in plaats
    // van m zou hij 0,0007 zijn.
    let f = factor(&r, "lange_overspanning");
    assert!(f > 0.5 && f < 1.0, "l_eff in mm ingevuld? factor = {f}");

    // En de 7 m-regel geldt hier NIET: hij is voor "balken en platen, andere
    // dan vlakke plaatvloeren". Bij 8,0 m gebeurt er bij deze plaatvloer dus
    // niets, terwijl een tussenoverspanning bij diezelfde 8,0 m 7/8 krijgt.
    req.l_eff_mm = Some(8000.0);
    req.span_mm = 8000.0;
    let r = span_depth_limit(&req).unwrap();
    assert_relative_eq!(factor(&r, "lange_overspanning"), 1.0, max_relative = 1e-15);

    let mut balkje = balk(StructuralSystem::InteriorSpan, 30.0, 0.005, 8000.0, 700.0, 300.0);
    balkje.l_eff_mm = Some(8000.0);
    balkje.carries_brittle_partitions = Some(true);
    let r = span_depth_limit(&balkje).unwrap();
    assert_relative_eq!(factor(&r, "lange_overspanning"), 7.0 / 8.0, max_relative = 1e-12);
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Tabel 7.4N, regel voor regel, nagerekend uit (7.16)
// ───────────────────────────────────────────────────────────────────────────

/// De vijf regels van tabel 7.4N, met de twee kolommen die de norm zelf geeft.
///
/// De OPMERKING bij de tabel noemt de gebruikte gevallen: C30/37,
/// σ_s = 310 MPa, ρ = 0,5 % en ρ = 1,5 %. Met ρ₀ = 10⁻³·√f_ck reproduceert
/// (7.16) die kolommen; dat is tegelijk de numerieke bevestiging van ρ₀, want
/// die definitieregel is in de geraadpleegde PDF-uitgave door overliggende
/// tekst weggedrukt en met het oog niet te lezen.
///
/// HANDBEREKENING bij K = 1,0
/// ```text
/// ρ = 1,5 % : (7.16.b), ρ' = 0
///     1,5·√30 · (10⁻³√30)/0,015 = 1,5·30·10⁻³/0,015 = 3,000 EXACT
///     l/d = 11 + 3,000 = 14,000                     tabel: 14   ✔ exact
/// ρ = 0,5 % : (7.16.a)
///     1,5·√30 · (√30/5) = 1,5·30/5 = 9,000          EXACT
///     3,2·√30 · (√30/5 − 1)^{3/2} = 0,516822204…
///     l/d = 20,516822204…                           tabel: 20   ✔ afgerond
/// ```
///
/// Alle andere regels zijn diezelfde twee getallen maal K:
/// ```text
///   K      ρ = 1,5 %              ρ = 0,5 %
///  1,0   1,0·14,000 = 14,000 (14)  1,0·20,5168 = 20,517 (20)
///  1,3   1,3·14,000 = 18,200 (18)  1,3·20,5168 = 26,672 (26)
///  1,5   1,5·14,000 = 21,000 (20)  1,5·20,5168 = 30,775 (30)
///  1,2   1,2·14,000 = 16,800 (17)  1,2·20,5168 = 24,620 (24)
///  0,4   0,4·14,000 =  5,600 ( 6)  0,4·20,5168 =  8,207 ( 8)
/// ```
///
/// Negen van de tien tabelwaarden volgen door afronden. De tiende — K = 1,5
/// bij ρ = 1,5 %: 21,0 tegen tabel 20 — is naar beneden afgerond, en
/// OPMERKING 1 bij de tabel zegt precies dat: "De gegeven waarden zijn zo
/// gekozen dat ze in het algemeen conservatief zijn". De tabelgetallen zijn
/// dus ORIËNTATIE en geen invoer; de rekengang gebruikt K plus (7.16).
#[test]
fn tabel_7_4n_regel_voor_regel() {
    // De verwachtingen hieronder zijn de handberekening, niet de code.
    const HOOG: f64 = 14.0; // ρ = 1,5 %, K = 1,0 — exact
    const LAAG: f64 = 20.516_822_204_371_15; // ρ = 0,5 %, K = 1,0

    let bij = |rho: f64, system: StructuralSystem| {
        span_depth_limit(&balk(system, 30.0, rho, 6000.0, 400.0, 300.0))
            .unwrap()
            .base_l_over_d
    };

    assert_relative_eq!(bij(0.015, StructuralSystem::SimplySupported), HOOG, max_relative = 1e-12);
    assert_relative_eq!(bij(0.005, StructuralSystem::SimplySupported), LAAG, max_relative = 1e-12);

    let rijen: [(StructuralSystem, f64, f64, f64); 5] = [
        (StructuralSystem::SimplySupported, 1.0, 14.0, 20.0),
        (StructuralSystem::EndSpan, 1.3, 18.0, 26.0),
        (StructuralSystem::InteriorSpan, 1.5, 20.0, 30.0),
        (StructuralSystem::FlatSlab, 1.2, 17.0, 24.0),
        (StructuralSystem::Cantilever, 0.4, 6.0, 8.0),
    ];
    for (system, k, tabel_hoog, tabel_laag) in rijen {
        assert_relative_eq!(system.k(), k, max_relative = 1e-15);
        let info = system.info();
        assert_relative_eq!(info.basic_high_stress, tabel_hoog, max_relative = 1e-15);
        assert_relative_eq!(info.basic_low_stress, tabel_laag, max_relative = 1e-15);
        assert_relative_eq!(bij(0.015, system), k * HOOG, max_relative = 1e-12);
        assert_relative_eq!(bij(0.005, system), k * LAAG, max_relative = 1e-12);
        // Het verschil met de tabel is een afronding, nooit meer dan 1,0.
        assert!((bij(0.015, system) - tabel_hoog).abs() <= 1.0);
        assert!((bij(0.005, system) - tabel_laag).abs() <= 1.0);
    }
    assert_eq!(STRUCTURAL_SYSTEMS.len(), 5);
}

// ───────────────────────────────────────────────────────────────────────────
// 6. (7.17) — de correctie voor een doorsnede die zwaarder is gewapend
// ───────────────────────────────────────────────────────────────────────────

/// (7.17): 310/σ_s = 500/(f_yk · A_s,req/A_s,prov).
///
/// HANDBEREKENING, telkens met f_yk = 500 MPa
/// ```text
/// A_s,req/A_s,prov = 1200/1200 = 1,00 → 500/(500·1,00) = 1,00
/// A_s,req/A_s,prov =  800/1000 = 0,80 → 500/(500·0,80) = 1,25
/// A_s,req/A_s,prov =  600/1200 = 0,50 → 500/(500·0,50) = 2,00
/// ```
/// De laatste factor is groter dan 1,5. De norm zet daar géén bovengrens op,
/// dus wordt er ook geen afkapping aangebracht — wél een aantekening, want de
/// hele grenswaarde leunt dan op de meerwapening.
#[test]
fn correctie_7_17_drie_gevallen() {
    let gevallen: [(f64, f64, f64); 3] =
        [(1200.0, 1200.0, 1.0), (800.0, 1000.0, 1.25), (600.0, 1200.0, 2.0)];
    for (a_req, a_prov, verwacht) in gevallen {
        let mut req = balk(StructuralSystem::SimplySupported, 25.0, 0.004, 6000.0, 450.0, 300.0);
        req.f_yk_mpa = Some(500.0);
        req.a_s_req_mm2 = Some(a_req);
        req.a_s_prov_mm2 = Some(a_prov);
        let r = span_depth_limit(&req).unwrap();
        assert_relative_eq!(factor(&r, "sigma_s"), verwacht, max_relative = 1e-12);
        // 22,375 is de basiswaarde uit test 1.
        assert_relative_eq!(r.limit_l_over_d, 22.375 * verwacht, max_relative = 1e-12);
        let c = r.corrections.iter().find(|c| c.id == "sigma_s").unwrap();
        assert!(c.applied);
        if verwacht > 1.5 {
            assert!(c.reason.contains("geen bovengrens"), "{}", c.reason);
        }
    }

    // Een andere staalsoort telt door: f_yk = 600, A_s,req = A_s,prov
    //   500/(600 · 1,0) = 0,833333…
    let mut req = balk(StructuralSystem::SimplySupported, 25.0, 0.004, 6000.0, 450.0, 300.0);
    req.f_yk_mpa = Some(600.0);
    req.a_s_req_mm2 = Some(900.0);
    req.a_s_prov_mm2 = Some(900.0);
    let r = span_depth_limit(&req).unwrap();
    assert_relative_eq!(factor(&r, "sigma_s"), 500.0 / 600.0, max_relative = 1e-12);
}

// ───────────────────────────────────────────────────────────────────────────
// 7. De grenswaarden van 7.4.1(4) en (5)
// ───────────────────────────────────────────────────────────────────────────

/// 7.4.1(4): overspanning/250 voor het uiterlijk en de algehele
/// bruikbaarheid — de berekende zakking onder de QUASI-BLIJVENDE belastingen,
/// ten opzichte van de opleggingen. Een in de bekisting aangebrachte opbuiging
/// behoort in het algemeen niet groter te zijn dan diezelfde overspanning/250.
///
/// 7.4.1(5): overspanning/500 voor doorbuigingen NA DE BOUW die aansluitende
/// constructiedelen kunnen beschadigen, eveneens quasi-blijvend.
///
/// HANDBEREKENING
/// ```text
///  4000 mm : /250 = 16,0 mm   /500 =  8,0 mm
///  6000 mm : /250 = 24,0 mm   /500 = 12,0 mm
///  7500 mm : /250 = 30,0 mm   /500 = 15,0 mm
/// 12000 mm : /250 = 48,0 mm   /500 = 24,0 mm
/// ```
#[test]
fn grenswaarden_7_4_1() {
    let gevallen: [(f64, f64, f64); 4] =
        [(4000.0, 16.0, 8.0), (6000.0, 24.0, 12.0), (7500.0, 30.0, 15.0), (12_000.0, 48.0, 24.0)];
    for (l, w250, w500) in gevallen {
        let g = deflection_limits(l);
        assert_relative_eq!(g.span_mm, l, max_relative = 1e-15);
        assert_relative_eq!(g.appearance_mm, w250, max_relative = 1e-12);
        assert_relative_eq!(g.damage_mm, w500, max_relative = 1e-12);
        // De zeeg deelt de grens van 7.4.1(4).
        assert_relative_eq!(g.precamber_max_mm, w250, max_relative = 1e-12);
        assert_eq!(g.combination, "quasi-blijvend");
    }
}

// ───────────────────────────────────────────────────────────────────────────
// 8. Wat de toets weigert, en wat zij vertelt als zij niet kan
// ───────────────────────────────────────────────────────────────────────────

/// Normaaldruk valt buiten tabel 7.4N ("elementen ZONDER NORMAALDRUK"). De
/// norm noemt geen drempel waaronder een normaaldruk mag worden
/// verwaarloosd, dus wordt er geen aangenomen: de toets weigert met een reden
/// en verwijst naar 7.4.3.
#[test]
fn buiten_het_toepassingsgebied() {
    let mut req = balk(StructuralSystem::SimplySupported, 25.0, 0.004, 6000.0, 450.0, 300.0);
    req.n_ed_kn = Some(-45.0);
    let fout = span_depth_limit(&req).unwrap_err();
    assert!(fout.contains("ZONDER NORMAALDRUK"), "{fout}");
    assert!(fout.contains("7.4.3"), "{fout}");

    // Als de toets weigert, komt er geen getal maar een NotApplicable met de
    // reden onverkort in het rapport.
    let calc = check_span_depth_ratio(
        &req,
        ForceStateSnapshot { combination_id: 2, position_mm: 3000.0, forces: Default::default() },
    );
    assert_eq!(calc.status, CheckStatus::NotApplicable);
    assert!(calc.uc.is_none());
    assert!(calc.notes.iter().any(|n| n.contains("ZONDER NORMAALDRUK")));

    // ρ' ≥ ρ laat (7.16.b) door nul delen. Geen aftopping, maar een weigering.
    let mut req = balk(StructuralSystem::SimplySupported, 25.0, 0.012, 6000.0, 450.0, 300.0);
    req.rho_prime = 0.012;
    assert!(span_depth_limit(&req).unwrap_err().contains("ρ − ρ'"));
}

// ───────────────────────────────────────────────────────────────────────────
// 9. De afleiding zoals de gebruiker haar terugziet
// ───────────────────────────────────────────────────────────────────────────

/// De toets als [`nen_en_1992_1_1::ResistanceCalc`]: unity check,
/// artikelverwijzing, formule in LaTeX en een reeks deelstappen met per stap
/// een vindplaats — hetzelfde contract als de buig- en de M-N-κ-toets.
#[test]
fn de_afleiding_is_na_te_rekenen() {
    let mut req = balk(StructuralSystem::EndSpan, 30.0, 0.005, 7500.0, 500.0, 300.0);
    req.f_yk_mpa = Some(500.0);
    req.a_s_req_mm2 = Some(1000.0);
    req.a_s_prov_mm2 = Some(1000.0);
    let calc = check_span_depth_ratio(
        &req,
        ForceStateSnapshot { combination_id: 5, position_mm: 3750.0, forces: Default::default() },
    );

    // HANDBEREKENING: 1,3 · 20,516822204… = 26,671868866…; (7.17) geeft 1,000;
    // geen flens; l_eff = l = 7,5 m > 7 m maar het element draagt geen
    // kwetsbare scheidingswanden, dus geen lengtecorrectie.
    //   grens = 26,671868866…    l/d = 7500/500 = 15,0
    //   UC    = 15,0/26,671868866…                       = 0,562390288
    assert_relative_eq!(calc.value, 26.671_868_865_682_494, max_relative = 1e-12);
    let uc = calc.uc.as_ref().unwrap();
    assert_relative_eq!(uc.ed, 15.0, max_relative = 1e-15);
    assert_relative_eq!(uc.uc, 0.562_390_287_517_491_2, max_relative = 1e-12);
    assert_eq!(calc.status, CheckStatus::Ok);
    assert_eq!(calc.unit, "-");
    assert!(calc.article.contains("tabel 7.4N"));
    assert_eq!(calc.force_state.combination_id, 5);

    // De keten die de lezer moet kunnen navertellen, in deze volgorde.
    let ids: Vec<&str> = calc.deelstappen.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(
        ids,
        vec![
            "toepassingsgebied",
            "rho_0",
            "takkeuze",
            "k_tabel_7_4n",
            "basis_l_d",
            "correctie_sigma_s",
            "correctie_flens",
            "correctie_lange_overspanning",
            "grenswaarde",
            "unity_check",
            "doorbuigingsgrenzen",
        ]
    );
    // Geen stap zonder vindplaats, en geen stap zonder toelichting.
    for s in &calc.deelstappen {
        assert!(!s.article.is_empty(), "stap {} heeft geen vindplaats", s.id);
        assert!(!s.notes.is_empty(), "stap {} heeft geen toelichting", s.id);
    }
    // De NB-bepaling bij tabel 7.4N hoort zichtbaar te zijn: zij maakt de
    // tabel normatief en dat is de enige NBP in heel §7.4.
    let k_stap = calc.deelstappen.iter().find(|s| s.id == "k_tabel_7_4n").unwrap();
    assert!(k_stap.notes.iter().any(|n| n.contains("normatief")));
    // En de grenzen waarvoor de toets in de plaats komt, met de combinatie.
    assert!(calc
        .notes
        .iter()
        .any(|n| n.contains("QUASI-BLIJVENDE") || n.contains("quasi-blijvende")));
}
