//! Handberekeningen bij [`nen_en_1992_1_1::kolom`] — §5.8 (kniklengte,
//! slankheid, λ_lim, φ_ef) en §9.5 (kolomdetaillering).
//!
//! Elke verwachte waarde hieronder is MET DE HAND uitgerekend; het rekenwerk
//! staat uitgeschreven in het commentaar bij de test. Geen enkele verwachting
//! is uit de code afgeleid — dat zou de test tot een echoput maken.
//!
//! Vier dingen worden hier bewaakt die in de module zelf niet passen:
//!
//! 1. **Hele kolommen doorrekenen** met de materiaalgegevens uit de crate
//!    (tabel 3.1, tabel C.1, tabel 2.1N) in plaats van met losse getallen, zodat
//!    het opvalt als iemand aan f_cd of γ_S komt.
//! 2. **Het verschil geschoord/ongeschoord vastpinnen.** Dat is de kern van dit
//!    spoor: dezelfde kolom, hetzelfde beton, dezelfde wapening, en toch een
//!    andere kniklengte én een andere slankheidsgrens.
//! 3. **De NB-uitspraken vastpinnen** die in de moduledoc staan: dat §5.8.4 niet
//!    door de nationale bijlage is gewijzigd, en dat A_s,max voor een kolom
//!    zónder overlappingslassen in Nederland het DUBBELE is van de
//!    EN-aanbeveling.
//! 4. **Weigeren in plaats van gokken.** Een trekstaaf, omgekeerde
//!    eindmomenten, een knikgeval dat niet bij de opgegeven schoring past — daar
//!    hoort een leesbare fout uit te komen en geen getal.

use approx::assert_relative_eq;

use mechanics::{ForceStateSnapshot, InternalForces};
use nen_en_1992_1_1::factors::{f_cd, f_yd, gamma_c, gamma_s, ALPHA_CC};
use nen_en_1992_1_1::kolom::{
    aantal_beugels_las_9_5_3, as_max_9_5_2_mm2, as_min_9_5_2_mm2, factor_a, factor_b, grondslag_c,
    hoekstaven_9_5_2, k_begrensd, kolom_deelstappen, kolomdetailleringstoetsen, kolomslankheid,
    kruip_verwaarloosbaar_5_8_4_4, l0_ondergrens_8_11_mm, opgesloten_staven_9_5_3,
    l0_geschoord_5_15, l0_ongeschoord_5_16, l0_uit_knikbelasting_5_17, lambda_lim_5_13n,
    min_diameter_dwarswapening_9_5_3_mm, niet_getoetste_9_5_eisen, omega, phi_ef_5_19,
    s_cl_tmax_9_5_3_mm, slankheid_5_14, traagheidsstraal_rechthoek_mm, Beugelzone, Cgrondslag,
    Knikgeval, Kniklengtebepaling, KolomInvoer, KolomdetailleringInvoer, Overlappingssituatie,
    Schoring, ScltmaxTak,
};
use nen_en_1992_1_1::{concrete_class_by_name, reinforcement_grade_by_name, CheckStatus,
    ConcreteSection, DesignSituation, RebarRow, ReinforcementCage};

// ───────────────────────────────────────────────────────────────────────────
// Gedeelde uitgangspunten: één kolom die in bijna alle tests terugkomt.
//
// Rechthoekige kolom 300 × 300 mm, C30/37, B500B, vier staven Ø20.
//   A_c  = 300 · 300                     =  90 000 mm²
//   f_cd = α_cc·f_ck/γ_C = 1,0·30/1,5    =      20   N/mm²
//   f_yd = f_yk/γ_S = 500/1,15           =     434,7826 N/mm²
//   A_s  = 4 · π/4 · 20²  = 4 · 314,1593 =    1256,637 mm²
//   i    = h/√12 = 300/3,464102          =      86,60254 mm
// ───────────────────────────────────────────────────────────────────────────

const A_C_MM2: f64 = 90_000.0;
const H_MM: f64 = 300.0;
const L_MM: f64 = 4000.0;

/// f_cd uit de crate zelf, zodat de test breekt als tabel 3.1, α_cc of γ_C
/// verandert. Verwacht: 1,0 · 30 / 1,5 = 20 N/mm².
fn f_cd_c30() -> f64 {
    let beton = concrete_class_by_name("C30/37").unwrap();
    let gamma_c = gamma_c(DesignSituation::PersistentTransient);
    assert_relative_eq!(gamma_c, 1.5, max_relative = 1e-12);
    let waarde = f_cd(beton.f_ck, ALPHA_CC, gamma_c);
    assert_relative_eq!(waarde, 20.0, max_relative = 1e-12);
    waarde
}

/// f_yd uit de crate zelf. Verwacht: 500 / 1,15 = 434,782609 N/mm².
fn f_yd_b500() -> f64 {
    let staal = reinforcement_grade_by_name("B500B").unwrap();
    let gamma_s = gamma_s(DesignSituation::PersistentTransient);
    assert_relative_eq!(gamma_s, 1.15, max_relative = 1e-12);
    let waarde = f_yd(staal.f_yk, gamma_s);
    assert_relative_eq!(waarde, 434.782_608_695_652_2, max_relative = 1e-12);
    waarde
}

/// Vier staven Ø20: 4 · π/4 · 400 = 400π = 1256,6371 mm².
fn a_s_4o20() -> f64 {
    4.0 * std::f64::consts::PI * 100.0
}

fn kolom(schoring: Schoring, kniklengte: Kniklengtebepaling, n_ed_kn: f64) -> KolomInvoer {
    KolomInvoer {
        l_mm: L_MM,
        kniklengte,
        l0_opgegeven_mm: None,
        schoring,
        i_mm: traagheidsstraal_rechthoek_mm(H_MM),
        a_c_mm2: A_C_MM2,
        a_s_mm2: a_s_4o20(),
        f_cd_mpa: f_cd_c30(),
        f_yd_mpa: f_yd_b500(),
        n_ed_kn,
        m0_ed_knm: None,
        m0_eqp_knm: None,
        phi_inf_t0: None,
        h_mm: Some(H_MM),
        eindmomenten_knm: None,
        eerste_orde_vooral_imperfecties_of_dwarsbelasting: false,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.3.2 — de kniklengte
// ═══════════════════════════════════════════════════════════════════════════

/// Figuur 5.7 a) t/m e) hebben een vaste l₀; f) en g) niet.
///
/// Bijschriften uit de figuur, met l = 4000 mm:
///   a) l₀ = l      → 4000 mm
///   b) l₀ = 2l     → 8000 mm
///   c) l₀ = 0,7l   → 2800 mm
///   d) l₀ = l/2    → 2000 mm
///   e) l₀ = l      → 4000 mm
///   f) l/2 < l₀ < l   — een bereik, geen waarde
///   g) l₀ > 2l        — idem
#[test]
fn figuur_5_7_geeft_vijf_vaste_kniklengten_en_twee_bereiken() {
    let gevallen = [
        (Knikgeval::ScharnierendScharnierend, Some(4000.0)),
        (Knikgeval::Console, Some(8000.0)),
        (Knikgeval::IngeklemdScharnierend, Some(2800.0)),
        (Knikgeval::TweezijdigIngeklemdGeschoord, Some(2000.0)),
        (Knikgeval::TweezijdigIngeklemdOngeschoord, Some(4000.0)),
        (Knikgeval::GedeeltelijkIngeklemdGeschoord, None),
        (Knikgeval::GedeeltelijkIngeklemdOngeschoord, None),
    ];
    for (geval, verwacht_l0) in gevallen {
        match (geval.l0_factor(), verwacht_l0) {
            (Some(f), Some(l0)) => assert_relative_eq!(f * L_MM, l0, max_relative = 1e-12),
            (None, None) => {}
            (a, b) => panic!("figuur 5.7 {}): {a:?} tegenover {b:?}", geval.letter()),
        }
    }
}

/// Figuur 5.7 tekent a), c), d) en f) met een zijdelings gehouden bovenste
/// einde, en b), e) en g) met een einde dat kan verplaatsen — bij b) is er
/// bovenaan zelfs helemaal geen oplegging. Die indeling moet kloppen, want zij
/// beslist welke van (5.15) en (5.16) geldt en of C = 0,7 wordt afgedwongen.
/// Zij is een lezing van de tekening en geen zin uit de normtekst; daarom staat
/// zij hier vastgepind.
#[test]
fn de_knikgevallen_horen_bij_de_juiste_schoring() {
    assert_eq!(Knikgeval::ScharnierendScharnierend.schoring(), Schoring::Geschoord);
    assert_eq!(
        Knikgeval::Console.schoring(),
        Schoring::Ongeschoord,
        "een console houdt zichzelf overeind en is dus een schorend element"
    );
    assert_eq!(Knikgeval::IngeklemdScharnierend.schoring(), Schoring::Geschoord);
    assert_eq!(Knikgeval::TweezijdigIngeklemdGeschoord.schoring(), Schoring::Geschoord);
    assert_eq!(Knikgeval::GedeeltelijkIngeklemdGeschoord.schoring(), Schoring::Geschoord);
    assert_eq!(Knikgeval::TweezijdigIngeklemdOngeschoord.schoring(), Schoring::Ongeschoord);
    assert_eq!(Knikgeval::GedeeltelijkIngeklemdOngeschoord.schoring(), Schoring::Ongeschoord);
}

/// Een console: l₀ = 2·l en C = 0,7, want een ongeschoord element krijgt die
/// waarde in het algemeen. Handberekening met dezelfde kolom 300×300:
///   l₀ = 2 · 4000 = 8000 mm  →  λ = 8000/86,60254 = 92,3760
///   λ_lim = 20·0,7·1,267703·0,7/√0,5 = 17,5695
/// λ = 92,4 ≫ λ_lim = 17,6: bij een console is tweede orde vrijwel altijd
/// maatgevend, en dat hoort er ook uit te komen.
#[test]
fn een_console_is_ongeschoord_en_haalt_de_slankheidsgrens_ruim_niet() {
    let inv =
        kolom(Schoring::Ongeschoord, Kniklengtebepaling::Standaardgeval(Knikgeval::Console), -900.0);
    let k = kolomslankheid(&inv).unwrap();
    assert_relative_eq!(k.l0_mm, 8000.0, max_relative = 1e-12);
    assert_relative_eq!(k.lambda, 92.376_043, max_relative = 1e-6);
    assert_relative_eq!(k.lambda_lim, 17.569_468, max_relative = 1e-6);
    assert!(!k.tweede_orde_verwaarloosbaar);
}

/// (5.15) met k₁ = 0,4 en k₂ = 0,8 en l = 3600 mm.
///
/// Handberekening:
///   1 + k₁/(0,45 + k₁) = 1 + 0,4/0,85 = 1 + 0,4705882 = 1,4705882
///   1 + k₂/(0,45 + k₂) = 1 + 0,8/1,25 = 1 + 0,64      = 1,6400000
///   product                                            = 2,4117647
///   √2,4117647                                         = 1,5529857
///   l₀ = 0,5 · 3600 · 1,5529857                        = 2795,374 mm
///
/// Ter controle van de plausibiliteit: 2795 mm ligt tussen 0,5·l = 1800 mm en
/// l = 3600 mm, precies het bereik dat het bijschrift van figuur 5.7 f) noemt.
#[test]
fn vergelijking_5_15_handberekening() {
    let l0 = l0_geschoord_5_15(0.4, 0.8, 3600.0);
    assert_relative_eq!(l0, 2795.374, max_relative = 1e-6);
    assert!(l0 > 0.5 * 3600.0 && l0 < 3600.0, "buiten het bereik van figuur 5.7 f)");
}

/// (5.16) met dezelfde k₁ = 0,4, k₂ = 0,8 en l = 3600 mm.
///
/// Handberekening — de norm schrijft het MAXIMUM van twee takken voor:
///   wortel-tak:  √(1 + 10·k₁k₂/(k₁+k₂)) = √(1 + 10·0,32/1,2)
///                                       = √(1 + 2,6666667) = √3,6666667
///                                       = 1,9148542
///   product-tak: (1 + 0,4/1,4)·(1 + 0,8/1,8) = 1,2857143 · 1,4444444
///                                            = 1,8571429
///   max = 1,9148542  →  l₀ = 3600 · 1,9148542 = 6893,475 mm
///
/// **En let op:** 6893 mm is KLEINER dan 2·l = 7200 mm, terwijl het bijschrift
/// van figuur 5.7 g) "l₀ > 2l" luidt. Dat is geen tegenspraak: het bijschrift
/// hoort bij de GETEKENDE situatie in dat vakje en is geen ondergrens voor
/// (5.16). De formule zelf loopt van l₀ = l (bij k₁ = k₂ = 0) tot oneindig. Wie
/// het bijschrift als eis leest, zou hier ten onrechte een fout vermoeden.
#[test]
fn vergelijking_5_16_handberekening_en_het_bijschrift_van_figuur_5_7_g() {
    let l0 = l0_ongeschoord_5_16(0.4, 0.8, 3600.0);
    assert_relative_eq!(l0, 6893.475, max_relative = 1e-6);
    assert!(l0 < 2.0 * 3600.0, "de formule kan wel degelijk onder 2l uitkomen");
    // Ondergrens van de formule zelf: k₁ = k₂ = 0 geeft l₀ = l.
    assert_relative_eq!(l0_ongeschoord_5_16(0.0, 0.0, 3600.0), 3600.0, max_relative = 1e-12);
}

/// (5.17): l₀ = π·√(EI/N_B).
///
/// Handberekening met een Euler-geval dat we los kennen: een tweezijdig
/// scharnierende staaf met EI = 1,0·10¹² N·mm² en l = 4000 mm heeft
/// N_B = π²EI/l² = 9,8696044·10¹²/16·10⁶ = 616 850,3 N. Terugrekenen met (5.17)
/// moet dan weer 4000 mm geven — dat is de definitie van de effectieve lengte
/// uit §5.8.1: "de lengte van een kolom met scharnierende uiteinden … die
/// dezelfde dwarsdoorsnede en knikbelasting heeft als het werkelijke element".
#[test]
fn vergelijking_5_17_is_de_omkering_van_de_eulerbelasting() {
    let ei = 1.0e12;
    let l = 4000.0;
    let n_b = std::f64::consts::PI.powi(2) * ei / (l * l);
    assert_relative_eq!(n_b, 616_850.275, max_relative = 1e-6);
    let l0 = l0_uit_knikbelasting_5_17(ei, n_b).unwrap();
    assert_relative_eq!(l0, l, max_relative = 1e-12);
}

/// De aanbevolen ondergrens van 0,1 uit de OPMERKING bij §5.8.3.2(3) wordt
/// toegepast en gemeld — een aanbeveling die stilzwijgend wordt toegepast is
/// net zo erg als een die wordt overgeslagen.
#[test]
fn de_ondergrens_van_k_wordt_gemeld_in_de_kanttekeningen() {
    let inv = kolom(
        Schoring::Geschoord,
        Kniklengtebepaling::Raamwerk { k1: 0.02, k2: 0.5 },
        -900.0,
    );
    let k = kolomslankheid(&inv).unwrap();
    assert_eq!(k.k_gebruikt, Some((0.1, 0.5)));
    assert_eq!(k.k_opgehoogd, (true, false));
    assert!(
        k.kanttekeningen.iter().any(|t| t.contains("minimumwaarde van 0,1")),
        "de toegepaste aanbeveling hoort in de kanttekeningen te staan"
    );
    // Handberekening van l₀ met k₁ = 0,1 en k₂ = 0,5:
    //   1 + 0,1/0,55 = 1,1818182 ; 1 + 0,5/0,95 = 1,5263158
    //   product = 1,1818182 · 1,5263158 = 1,8038278 ; √ = 1,3430665
    //   l₀ = 0,5 · 4000 · 1,3430665 = 2686,133 mm
    assert_relative_eq!(k.l0_mm, 2686.1331, max_relative = 1e-6);
    assert_eq!(k_begrensd(0.02), (0.1, true));
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.3.1 — λ_lim, en het verschil dat geschoord/ongeschoord maakt
// ═══════════════════════════════════════════════════════════════════════════

/// De volledige gang voor een GESCHOORDE kolom 300×300, C30/37, 4 Ø20,
/// N_Ed = 900 kN druk, l = 4000 mm, knikgeval c) (onder ingeklemd, boven
/// scharnierend), met eerste-orde-eindmomenten M₀₁ = 30 en M₀₂ = 60 kNm die aan
/// dezelfde zijde trek geven.
///
/// Handberekening:
///   l₀ = 0,7 · 4000                                  = 2800     mm
///   i  = 300/√12                                     =   86,60254 mm
///   λ  = 2800/86,60254                               =   32,3316
///   ω  = A_s·f_yd/(A_c·f_cd)
///      = 1256,637 · 434,7826 / (90 000 · 20)
///      = 546 363,9 / 1 800 000                       =    0,303536
///   n  = N_Ed/(A_c·f_cd) = 900 000/1 800 000         =    0,5
///   A  = 0,7        (φ_ef onbekend — §5.8.3.1(1) staat die standaardwaarde toe)
///   B  = √(1 + 2·0,303536) = √1,607071               =    1,267703
///   r_m = M₀₁/M₀₂ = 30/60 = 0,5  →  C = 1,7 − 0,5    =    1,2
///   λ_lim = 20·0,7·1,267703·1,2/√0,5
///         = 21,29741/0,7071068                       =   30,1191
///
/// λ = 32,33 ≥ λ_lim = 30,12: de tweede-orde-effecten mogen NIET worden
/// verwaarloosd. Nét niet — en dat is precies waarom deze toets bestaat.
#[test]
fn geschoorde_kolom_volledige_handberekening() {
    let mut inv = kolom(
        Schoring::Geschoord,
        Kniklengtebepaling::Standaardgeval(Knikgeval::IngeklemdScharnierend),
        -900.0,
    );
    inv.eindmomenten_knm = Some((30.0, 60.0));
    let k = kolomslankheid(&inv).unwrap();

    assert_relative_eq!(k.l0_mm, 2800.0, max_relative = 1e-12);
    assert_relative_eq!(k.i_mm, 86.602_540_378, max_relative = 1e-9);
    assert_relative_eq!(k.lambda, 32.331_615, max_relative = 1e-6);
    assert_relative_eq!(k.omega, 0.303_535_5, max_relative = 1e-6);
    assert_relative_eq!(k.n, 0.5, max_relative = 1e-12);
    assert_relative_eq!(k.a, 0.7, max_relative = 1e-12);
    assert!(k.a_standaard, "φ_ef is niet opgegeven, dus A = 0,7 is de standaardwaarde");
    assert_relative_eq!(k.b, 1.267_703_06, max_relative = 1e-6);
    assert!(!k.b_standaard, "ω is bekend, dus B mag niet de standaardwaarde 1,1 zijn");
    assert_relative_eq!(k.c, 1.2, max_relative = 1e-12);
    assert_relative_eq!(k.lambda_lim, 30.119_088, max_relative = 1e-6);
    assert!(!k.tweede_orde_verwaarloosbaar);
}

/// Dezelfde kolom, dezelfde wapening, dezelfde normaalkracht — maar nu als
/// ONGESCHOORD opgegeven, met knikgeval e) (beide einden ingeklemd, bovenaan
/// zijdelings vrij).
///
/// Handberekening:
///   l₀ = l = 4000 mm  →  λ = 4000/86,60254 = 46,1880
///   C  = 0,7, want §5.8.3.1(1) schrijft r_m = 1,0 voor "voor niet-geschoorde
///        elementen in het algemeen" — de bekende eindmomenten doen daar niets
///        aan af.
///   λ_lim = 20·0,7·1,267703·0,7/√0,5 = 12,42349/0,7071068 = 17,5695
///
/// Twee dingen tegelijk: λ gaat met een factor 4000/2800 = 1,43 omhoog en
/// λ_lim met een factor 0,7/1,2 = 0,58 omlaag. De verhouding λ/λ_lim springt
/// daarmee van 1,07 naar 2,63. Dat is de reden dat "geschoord" geen veld is dat
/// je met een standaardwaarde kunt invullen.
#[test]
fn dezelfde_kolom_ongeschoord_valt_ruim_twee_keer_zo_ongunstig_uit() {
    let mut inv = kolom(
        Schoring::Ongeschoord,
        Kniklengtebepaling::Standaardgeval(Knikgeval::TweezijdigIngeklemdOngeschoord),
        -900.0,
    );
    inv.eindmomenten_knm = Some((30.0, 60.0));
    let k = kolomslankheid(&inv).unwrap();

    assert_relative_eq!(k.l0_mm, 4000.0, max_relative = 1e-12);
    assert_relative_eq!(k.lambda, 46.188_022, max_relative = 1e-6);
    assert_eq!(k.c_grondslag, Cgrondslag::OngeschoordInHetAlgemeen);
    assert_relative_eq!(k.c, 0.7, max_relative = 1e-12);
    assert_relative_eq!(k.lambda_lim, 17.569_468, max_relative = 1e-6);
    assert!(!k.tweede_orde_verwaarloosbaar);

    // λ/λ_lim: geschoord 32,3316/30,1191 = 1,0735 ; ongeschoord
    // 46,1880/17,5695 = 2,6288.
    assert_relative_eq!(k.lambda / k.lambda_lim, 2.628_84, max_relative = 1e-4);
}

/// C = 0,7 wordt óók voor een GESCHOORD element voorgeschreven zodra de
/// eerste-orde-effecten alleen of voornamelijk uit imperfecties of
/// dwarsbelasting komen (§5.8.3.1(1)). De bekende eindmomenten tellen dan niet.
#[test]
fn geschoord_uit_imperfecties_krijgt_ook_c_is_nul_komma_zeven() {
    let g = grondslag_c(Schoring::Geschoord, true, Some((-40.0, 80.0))).unwrap();
    assert_eq!(g, Cgrondslag::GeschoordUitImperfectiesOfDwarsbelasting);
    assert_relative_eq!(g.c(), 0.7, max_relative = 1e-12);
}

/// De twee standaardwaarden van §5.8.3.1(1) — A = 0,7 als φ_ef onbekend is en
/// B = 1,1 als ω onbekend is — en de getallen waar ze bij horen.
///
/// Handberekening van die "verborgen" getallen:
///   A = 0,7  ⇔  1/(1+0,2φ_ef) = 0,7  ⇔  φ_ef = (1/0,7 − 1)/0,2 = 2,142857
///   B = 1,1  ⇔  √(1+2ω) = 1,1        ⇔  ω = (1,21 − 1)/2 = 0,105
/// Ze zijn dus geen veilige kant maar een middenwaarde; dat staat ook in de
/// kanttekeningen van de module.
#[test]
fn de_standaardwaarden_van_a_en_b_horen_bij_bekende_getallen() {
    assert_eq!(factor_a(None), (0.7, true));
    assert_eq!(factor_b(None), (1.1, true));
    let (a, standaard) = factor_a(Some(2.142_857_142_857_143));
    assert!(!standaard);
    assert_relative_eq!(a, 0.7, max_relative = 1e-12);
    let (b, standaard) = factor_b(Some(0.105));
    assert!(!standaard);
    assert_relative_eq!(b, 1.1, max_relative = 1e-12);
}

/// ω met de materiaalgegevens uit de crate: 1256,637·434,7826/(90 000·20).
///   teller = 546 363,88 → ω = 0,3035355
#[test]
fn omega_handberekening() {
    let w = omega(a_s_4o20(), f_yd_b500(), A_C_MM2, f_cd_c30()).unwrap();
    assert_relative_eq!(w, 0.303_535_522, max_relative = 1e-9);
}

/// λ = l₀/i met de traagheidsstraal van een rechthoek: 2800/(300/√12).
#[test]
fn slankheid_handberekening() {
    let i = traagheidsstraal_rechthoek_mm(300.0);
    assert_relative_eq!(i, 86.602_540_378_443_9, max_relative = 1e-12);
    assert_relative_eq!(slankheid_5_14(2800.0, i).unwrap(), 32.331_615_07, max_relative = 1e-9);
}

/// λ_lim = 20·A·B·C/√n, los nagerekend met de vier factoren uit de
/// geschoorde handberekening.
#[test]
fn lambda_lim_handberekening() {
    let v = lambda_lim_5_13n(0.7, 1.267_703_058_358_676, 1.2, 0.5).unwrap();
    assert_relative_eq!(v, 30.119_088_017_6, max_relative = 1e-9);
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.4 — kruip
// ═══════════════════════════════════════════════════════════════════════════

/// (5.19) φ_ef = φ(∞,t₀)·M₀Eqp/M₀Ed, met φ(∞,t₀) = 2,5, M₀Eqp = 40 kNm en
/// M₀Ed = 65 kNm.
///
/// Handberekening: 40/65 = 0,6153846 → φ_ef = 2,5·0,6153846 = 1,5384615.
/// En daarmee A = 1/(1 + 0,2·1,5384615) = 1/1,3076923 = 0,7647059 — merkbaar
/// GUNSTIGER dan de standaardwaarde 0,7, want deze kruip is lichter dan de
/// φ_ef ≈ 2,14 waar die 0,7 bij hoort.
#[test]
fn phi_ef_handberekening_en_de_bijbehorende_factor_a() {
    let p = phi_ef_5_19(2.5, 40.0, 65.0).unwrap();
    assert_relative_eq!(p, 1.538_461_538_5, max_relative = 1e-9);
    let (a, standaard) = factor_a(Some(p));
    assert!(!standaard);
    assert_relative_eq!(a, 0.764_705_882_4, max_relative = 1e-9);
    assert!(a > 0.7, "lichtere kruip dan φ_ef ≈ 2,14 hoort een gunstiger A te geven");
}

/// §5.8.4(4) — φ_ef = 0 mag alleen als ALLE DRIE de voorwaarden gelden.
///
/// Handberekening van de derde: e₀ = M₀Ed/N_Ed = 50 kNm/400 kN
///   = 50·10⁶ N·mm / 400·10³ N = 125 mm. Met h = 300 mm is 125 < 300: de
/// voorwaarde M₀Ed/N_Ed ≥ h is NIET vervuld en kruip mag dus niet worden
/// verwaarloosd, ook al zijn de andere twee in orde.
///
/// Met M₀Ed = 150 kNm wordt e₀ = 375 mm ≥ 300 mm en mag het wel.
#[test]
fn kruip_verwaarlozing_valt_op_de_excentriciteitseis() {
    let te_klein =
        kruip_verwaarloosbaar_5_8_4_4(1.8, 60.0, 50.0, 400.0, 300.0, Some(0.30)).unwrap();
    assert!(te_klein.kruipcoefficient_ten_hoogste_2);
    assert!(te_klein.slankheid_ten_hoogste_75);
    assert!(!te_klein.excentriciteit_ten_minste_h);
    assert_relative_eq!(te_klein.e0_mm, 125.0, max_relative = 1e-12);
    assert!(!te_klein.toegestaan);

    let groot_genoeg =
        kruip_verwaarloosbaar_5_8_4_4(1.8, 60.0, 150.0, 400.0, 300.0, Some(0.30)).unwrap();
    assert_relative_eq!(groot_genoeg.e0_mm, 375.0, max_relative = 1e-12);
    assert!(groot_genoeg.toegestaan);
    assert!(
        groot_genoeg.waarschuwing.is_none(),
        "bij ω = 0,30 ≥ 0,25 speelt de OPMERKING bij §5.8.4(4) niet"
    );
}

/// De twee andere voorwaarden van §5.8.4(4), elk apart, en de waarschuwing uit
/// de OPMERKING bij dat lid als ω kleiner is dan 0,25.
#[test]
fn kruip_verwaarlozing_kent_drie_voorwaarden_en_een_waarschuwing() {
    // φ(∞,t₀) = 2,4 > 2 → eerste voorwaarde valt af.
    let zware_kruip =
        kruip_verwaarloosbaar_5_8_4_4(2.4, 60.0, 150.0, 400.0, 300.0, Some(0.30)).unwrap();
    assert!(!zware_kruip.kruipcoefficient_ten_hoogste_2);
    assert!(!zware_kruip.toegestaan);

    // λ = 80 > 75 → tweede voorwaarde valt af.
    let slank =
        kruip_verwaarloosbaar_5_8_4_4(1.8, 80.0, 150.0, 400.0, 300.0, Some(0.30)).unwrap();
    assert!(!slank.slankheid_ten_hoogste_75);
    assert!(!slank.toegestaan);

    // ω = 0,20 < 0,25 → de OPMERKING bij §5.8.4(4) hoort te worden gemeld.
    let mager =
        kruip_verwaarloosbaar_5_8_4_4(1.8, 60.0, 150.0, 400.0, 300.0, Some(0.20)).unwrap();
    assert!(mager.toegestaan);
    let waarschuwing = mager.waarschuwing.expect("de OPMERKING hoort hier te worden gemeld");
    assert!(waarschuwing.contains("0,25"));
}

/// Wordt §5.8.4(4) niet nagegaan, dan hoort dat met zoveel woorden in de
/// kanttekeningen te staan. Een stilzwijgende φ_ef = 0 is een aanname die zich
/// als normuitspraak voordoet.
#[test]
fn een_niet_nagegane_kruipvoorwaarde_wordt_gemeld() {
    let inv = kolom(
        Schoring::Geschoord,
        Kniklengtebepaling::Standaardgeval(Knikgeval::ScharnierendScharnierend),
        -900.0,
    );
    let k = kolomslankheid(&inv).unwrap();
    assert!(k.kruip.is_none());
    assert!(
        k.kanttekeningen.iter().any(|t| t.contains("5.8.4(4)")),
        "de kanttekeningen moeten melden dat §5.8.4(4) niet is nagegaan"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Weigeren in plaats van gokken
// ═══════════════════════════════════════════════════════════════════════════

/// Een staaf op trek is geen knikgeval; λ_lim heeft √n in de noemer en bestaat
/// daar niet. De invoer draagt N in de conventie van de buitengrens
/// (positief = trek), dus +900 kN betekent trek.
#[test]
fn een_trekstaaf_wordt_geweigerd_en_niet_stilzwijgend_doorgerekend() {
    let inv = kolom(
        Schoring::Geschoord,
        Kniklengtebepaling::Standaardgeval(Knikgeval::ScharnierendScharnierend),
        900.0,
    );
    let fout = kolomslankheid(&inv).unwrap_err();
    assert!(fout.contains("DRUK"), "de melding moet het tekenprobleem benoemen: {fout}");
}

/// Een knikgeval uit figuur 5.7 dat niet bij de opgegeven schoring past, is een
/// tegenspraak in de invoer en wordt afgewezen — niet stilzwijgend doorgerekend.
#[test]
fn een_knikgeval_dat_niet_bij_de_schoring_past_wordt_afgewezen() {
    let inv = kolom(
        Schoring::Geschoord,
        Kniklengtebepaling::Standaardgeval(Knikgeval::TweezijdigIngeklemdOngeschoord),
        -900.0,
    );
    let fout = kolomslankheid(&inv).unwrap_err();
    assert!(fout.contains("ongeschoord"), "melding: {fout}");
}

/// De gevallen f) en g) hebben geen vaste l₀; wie ze als standaardgeval opgeeft,
/// krijgt een melding die naar (5.15) respectievelijk (5.16) verwijst.
#[test]
fn een_bereikgeval_als_standaardgeval_verwijst_naar_de_juiste_vergelijking() {
    let inv = kolom(
        Schoring::Geschoord,
        Kniklengtebepaling::Standaardgeval(Knikgeval::GedeeltelijkIngeklemdGeschoord),
        -900.0,
    );
    let fout = kolomslankheid(&inv).unwrap_err();
    assert!(fout.contains("(5.15)"), "melding: {fout}");
}

// ═══════════════════════════════════════════════════════════════════════════
// De afleiding
// ═══════════════════════════════════════════════════════════════════════════

/// De afleiding moet de hele keten tonen, in volgorde, elk met een vindplaats.
/// Een afleiding zonder artikelnummer is in een rekenrapport waardeloos.
#[test]
fn de_afleiding_toont_zeven_stappen_met_hun_vindplaats() {
    let mut inv = kolom(
        Schoring::Geschoord,
        Kniklengtebepaling::Raamwerk { k1: 0.4, k2: 0.8 },
        -900.0,
    );
    inv.eindmomenten_knm = Some((30.0, 60.0));
    inv.phi_inf_t0 = Some(2.5);
    inv.m0_eqp_knm = Some(40.0);
    inv.m0_ed_knm = Some(65.0);
    let k = kolomslankheid(&inv).unwrap();
    let stappen = kolom_deelstappen(&k);

    let ids: Vec<&str> = stappen.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["schoring", "l0", "lambda", "n_omega", "phi_ef", "abc", "lambda_lim"]);
    for s in &stappen {
        assert!(!s.article.is_empty(), "stap {} mist een vindplaats", s.id);
        assert!(!s.notes.is_empty(), "stap {} mist kanttekeningen", s.id);
    }
    // De l₀-stap moet naar (5.15) verwijzen, want de kolom is geschoord.
    let l0 = stappen.iter().find(|s| s.id == "l0").unwrap();
    assert!(l0.article.contains("5.15"), "artikel: {}", l0.article);
    // De λ_lim-stap moet de nationale bijlage noemen.
    let lim = stappen.iter().find(|s| s.id == "lambda_lim").unwrap();
    assert!(lim.article.contains("NB"), "artikel: {}", lim.article);
}

// ═══════════════════════════════════════════════════════════════════════════
// §9.5 — kolomdetaillering
// ═══════════════════════════════════════════════════════════════════════════

fn punt() -> ForceStateSnapshot {
    ForceStateSnapshot {
        combination_id: 1,
        position_mm: 0.0,
        forces: InternalForces::default(),
    }
}

/// De korf van de kolom 300 x 300: 2 O20 onder, 2 O20 boven, dekking 30 mm,
/// beugel O8. Vier staven, alle vier in een hoek.
///
/// De asafstand is 30 + 8 + 20/2 = 48 mm, dus de vier harten liggen op
/// (x, z) = (+/-102, 48) en (+/-102, 252) ten opzichte van de hartlijn en de
/// onderrand.
fn korf_4o20() -> ReinforcementCage {
    ReinforcementCage {
        cover_mm: 30.0,
        stirrup_diameter_mm: 8.0,
        stirrup_legs: Some(2),
        top: RebarRow { count: 2, diameter_mm: 20.0 },
        bottom: RebarRow { count: 2, diameter_mm: 20.0 },
        ..ReinforcementCage::default()
    }
}

fn detaillering() -> KolomdetailleringInvoer {
    let doorsnede = ConcreteSection::new(H_MM, H_MM);
    KolomdetailleringInvoer {
        force_state: punt(),
        h_mm: H_MM,
        b_mm: H_MM,
        a_c_mm2: A_C_MM2,
        a_s_mm2: a_s_4o20(),
        phi_l_min_mm: 20.0,
        phi_l_max_mm: 20.0,
        phi_dwars_mm: Some(8.0),
        s_dwars_mm: Some(250.0),
        n_beugelbenen: Some(2),
        zone: Beugelzone::Regulier,
        overlapping: Overlappingssituatie::GeenLassen,
        n_ed_druk_kn: 900.0,
        f_yd_mpa: f_yd_b500(),
        staafposities: korf_4o20().staafposities(&doorsnede),
    }
}

/// NB bij §9.5.2(2), (9.12N) — A_s,min = max{0,10·N_Ed/f_yd ; 0,002·A_c}.
///
/// Handberekening voor de kolom 300×300 met N_Ed = 900 kN druk:
///   krachtterm: 0,10 · 900 000 N / 434,7826 N/mm² = 90 000/434,7826 = 207,0 mm²
///   oppervlakteterm: 0,002 · 90 000                                 = 180,0 mm²
///   A_s,min = max{207,0 ; 180,0}                                    = 207,0 mm²
///
/// Bij N_Ed = 500 kN wordt de krachtterm 50 000/434,7826 = 115,0 mm² en wint de
/// oppervlakteterm met 180 mm². Beide takken worden dus echt gebruikt.
#[test]
fn as_min_9_5_2_handberekening_beide_takken() {
    let f_yd = f_yd_b500();
    assert_relative_eq!(
        as_min_9_5_2_mm2(900.0e3, f_yd, A_C_MM2).unwrap(),
        207.0,
        max_relative = 1e-9
    );
    assert_relative_eq!(
        as_min_9_5_2_mm2(500.0e3, f_yd, A_C_MM2).unwrap(),
        180.0,
        max_relative = 1e-9
    );
    // 0,10·500 000/434,7826 = 115,0 mm², dus de oppervlakteterm is maatgevend.
    assert_relative_eq!(0.10 * 500.0e3 / f_yd, 115.0, max_relative = 1e-9);
}

/// NB bij §9.5.2(3) — hier wijkt de nationale bijlage INHOUDELIJK af.
///
/// * EN-aanbeveling (doorgehaald): 0,04·A_c buiten overlappingsgebieden.
/// * NB (eis): **0,08·A_c voor een kolom waarin geen overlappingslassen
///   voorkomen** — het dubbele.
///
/// Voor A_c = 90 000 mm²: 0,04·A_c = 3600 mm² tegenover 0,08·A_c = 7200 mm².
/// Een kolom met 12 Ø25 (5890 mm²) en zonder lassen voldoet in Nederland dus
/// wél en volgens de EN-aanbeveling niet.
#[test]
fn as_max_9_5_2_is_voor_een_kolom_zonder_lassen_het_dubbele_van_de_en_waarde() {
    assert_relative_eq!(
        as_max_9_5_2_mm2(A_C_MM2, Overlappingssituatie::GeenLassen),
        7200.0,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        as_max_9_5_2_mm2(A_C_MM2, Overlappingssituatie::LassenBuitenDezeDoorsnede),
        3600.0,
        max_relative = 1e-12
    );
    assert_relative_eq!(
        as_max_9_5_2_mm2(A_C_MM2, Overlappingssituatie::TerPlaatseVanLas),
        7200.0,
        max_relative = 1e-12
    );
    // 12 Ø25 = 12 · π/4 · 625 = 5890,49 mm².
    let a_s = 12.0 * std::f64::consts::PI * 156.25;
    assert_relative_eq!(a_s, 5_890.486_225, max_relative = 1e-9);
    assert!(a_s < as_max_9_5_2_mm2(A_C_MM2, Overlappingssituatie::GeenLassen));
    assert!(a_s > as_max_9_5_2_mm2(A_C_MM2, Overlappingssituatie::LassenBuitenDezeDoorsnede));
}

/// NB bij §9.5.3(3) — s_cl,tmax is de kleinste van drie takken, en §9.5.3(4)
/// vermenigvuldigt die met 0,6.
///
/// Handberekening voor de kolom 300×300 met Ø20 langsstaven:
///   20 · Φ_l,min = 20 · 20      = 400 mm
///   kleinste kolomafmeting      = 300 mm   ← maatgevend
///   plafond                     = 400 mm
///   s_cl,tmax                   = 300 mm
///   in de zone van §9.5.3(4)    = 0,6 · 300 = 180 mm
///
/// Met Ø12 langsstaven wordt de eerste tak 240 mm en neemt die het over — de
/// tak die wint hangt dus echt van de invoer af.
#[test]
fn s_cl_tmax_9_5_3_handberekening_met_en_zonder_reductie() {
    let (s, tak) = s_cl_tmax_9_5_3_mm(20.0, 300.0, Beugelzone::Regulier).unwrap();
    assert_relative_eq!(s, 300.0, max_relative = 1e-12);
    assert_eq!(tak, ScltmaxTak::KleinsteKolomafmeting);

    let (s_gereduceerd, _) = s_cl_tmax_9_5_3_mm(20.0, 300.0, Beugelzone::BijBalkOfPlaat).unwrap();
    assert_relative_eq!(s_gereduceerd, 180.0, max_relative = 1e-12);

    let (s_dun, tak_dun) = s_cl_tmax_9_5_3_mm(12.0, 300.0, Beugelzone::Regulier).unwrap();
    assert_relative_eq!(s_dun, 240.0, max_relative = 1e-12);
    assert_eq!(tak_dun, ScltmaxTak::TwintigMaalDiameter);

    // Een brede kolom laat het plafond van 400 mm winnen: 20·Ø25 = 500,
    // afmeting 600, plafond 400.
    let (s_breed, tak_breed) = s_cl_tmax_9_5_3_mm(25.0, 600.0, Beugelzone::Regulier).unwrap();
    assert_relative_eq!(s_breed, 400.0, max_relative = 1e-12);
    assert_eq!(tak_breed, ScltmaxTak::Plafond400);
}

/// §9.5.3(1) — Φ_sw ≥ max{6 mm ; Φ_l,max/4}.
///
/// Handberekening: bij Ø20 langsstaven is Φ_l,max/4 = 5 mm en wint de absolute
/// ondergrens 6 mm; bij Ø32 is Φ_l,max/4 = 8 mm en wint die.
#[test]
fn min_diameter_dwarswapening_9_5_3_handberekening() {
    assert_relative_eq!(min_diameter_dwarswapening_9_5_3_mm(20.0), 6.0, max_relative = 1e-12);
    assert_relative_eq!(min_diameter_dwarswapening_9_5_3_mm(32.0), 8.0, max_relative = 1e-12);
}

/// De tien §9.5-toetsen op een rij voor een kolom die aan alles voldoet.
///
/// Negen staan op `Ok`. De tiende — §9.5.3(4)ii, het aantal beugels over een
/// overlappingslas — hoort op `NotApplicable` te staan: deze doorsnede ligt niet
/// nabij een las, en een eis die niet geldt hoort geen groen vinkje te krijgen.
#[test]
fn een_deugdelijke_kolom_haalt_alle_toetsen_die_op_hem_van_toepassing_zijn() {
    let toetsen = kolomdetailleringstoetsen(&detaillering());
    assert_eq!(toetsen.len(), 10);
    for t in &toetsen {
        let verwacht = if t.id == "9.5.3_aantal_beugels_las" {
            CheckStatus::NotApplicable
        } else {
            CheckStatus::Ok
        };
        assert_eq!(t.status, verwacht, "toets {} ({})", t.id, t.title);
        assert!(!t.article.is_empty(), "toets {} mist een vindplaats", t.id);
    }
}

/// Een te smalle kolom valt op de NB-eis van 200 mm, en een te platte op de
/// grens h ≤ 4b van §9.5.1(1) — dan is het voor de norm een wand.
#[test]
fn een_te_smalle_en_een_te_platte_kolom_vallen_op_de_juiste_eis() {
    let mut inv = detaillering();
    inv.b_mm = 150.0;
    inv.h_mm = 600.0;
    inv.a_c_mm2 = 150.0 * 600.0;
    let toetsen = kolomdetailleringstoetsen(&inv);

    let breedte = toetsen.iter().find(|t| t.id == "9.5.1_min_dwarsafmeting").unwrap();
    assert_eq!(breedte.status, CheckStatus::NotOk);
    // uc bij een minimumeis: vereist/aanwezig = 200/150 = 1,3333.
    assert_relative_eq!(breedte.uc.as_ref().unwrap().uc, 1.333_333_3, max_relative = 1e-6);

    // 600 ≤ 4·150 = 600 — precies op de grens, dus nog nét een kolom.
    let gebied = toetsen.iter().find(|t| t.id == "9.5.1_toepassingsgebied").unwrap();
    assert_eq!(gebied.status, CheckStatus::Ok);

    inv.h_mm = 700.0;
    let gebied = kolomdetailleringstoetsen(&inv)
        .into_iter()
        .find(|t| t.id == "9.5.1_toepassingsgebied")
        .unwrap();
    assert_eq!(gebied.status, CheckStatus::NotOk, "700 > 4·150 = 600: dit is een wand");
}

/// Ontbrekende gegevens leveren [`CheckStatus::NotApplicable`] met een reden —
/// nooit een stilzwijgend groen vinkje.
#[test]
fn ontbrekende_beugelgegevens_leveren_geen_stilzwijgend_groen_vinkje() {
    let mut inv = detaillering();
    inv.phi_dwars_mm = None;
    inv.s_dwars_mm = None;
    let toetsen = kolomdetailleringstoetsen(&inv);
    for id in ["9.5.3_min_diameter_dwars", "9.5.3_s_cl_tmax"] {
        let t = toetsen.iter().find(|t| t.id == id).unwrap();
        assert_eq!(t.status, CheckStatus::NotApplicable, "toets {id}");
        assert!(t.uc.is_none(), "toets {id} hoort geen unity check te hebben");
        assert!(
            t.notes.iter().any(|n| n.contains("Niet te toetsen")),
            "toets {id} moet de reden noemen"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// §9.5.3(4)ii — het AANTAL beugels over een overlappingslas
// ═══════════════════════════════════════════════════════════════════════════

/// (8.11) — l₀,min ≥ max{0,3·α₆·l_b,rqd ; 15Φ ; 200 mm}, waarvan hier de twee
/// takken overblijven die zonder l_b,rqd te vullen zijn.
///
/// Handberekening:
///   Ø12: 15·12 = 180 mm  <  200 mm  → de absolute tak van 200 mm wint
///   Ø20: 15·20 = 300 mm  >  200 mm  → de diametertak wint
///   Ø32: 15·32 = 480 mm             → idem
#[test]
fn de_ondergrens_van_de_overlappingslengte_kent_beide_takken() {
    assert_relative_eq!(l0_ondergrens_8_11_mm(12.0), 200.0, max_relative = 1e-12);
    assert_relative_eq!(l0_ondergrens_8_11_mm(20.0), 300.0, max_relative = 1e-12);
    assert_relative_eq!(l0_ondergrens_8_11_mm(32.0), 480.0, max_relative = 1e-12);
}

/// De eis geldt alleen nabij een las én bij Φ_l,max > 14 mm. Buiten die twee
/// hoort er GEEN groen vinkje te staan: er is niets nagegaan.
#[test]
fn het_beugelaantal_geldt_alleen_nabij_een_las_met_dikke_staven() {
    // Reguliere doorsnede: geen las, dus geen eis.
    let t = aantal_beugels_las_9_5_3(&detaillering());
    assert_eq!(t.status, CheckStatus::NotApplicable);
    assert!(t.uc.is_none(), "zonder eis hoort er geen unity check te staan");
    assert!(
        t.notes.iter().any(|n| n.contains("Niet van toepassing")),
        "de reden hoort erbij: {:?}",
        t.notes
    );

    // Wél een las, maar met Ø14 — de drempel van §9.5.3(4)ii is "groter dan
    // 14 mm", dus precies 14 telt niet mee.
    let mut inv = detaillering();
    inv.zone = Beugelzone::BijOverlappingslas;
    inv.phi_l_min_mm = 14.0;
    inv.phi_l_max_mm = 14.0;
    let t = aantal_beugels_las_9_5_3(&inv);
    assert_eq!(t.status, CheckStatus::NotApplicable);
    assert!(
        t.notes.iter().any(|n| n.contains("14")),
        "de drempel hoort in de reden te staan: {:?}",
        t.notes
    );
}

/// Handberekening bij Ø20 langsstaven nabij een las:
///   l₀ ≥ max{15·20 ; 200} = 300 mm         (8.11)
///   drie beugels gelijkmatig over l₀ → twee tussenruimten → s ≤ l₀/2 = 150 mm
///   s = 100 mm → UC = 100/150 = 0,6667 → voldoet
///   s = 150 mm → UC = 1,0 → voldoet nog net
#[test]
fn drie_beugels_passen_zodra_s_binnen_de_helft_van_de_ondergrens_blijft() {
    let mut inv = detaillering();
    inv.zone = Beugelzone::BijOverlappingslas;

    inv.s_dwars_mm = Some(100.0);
    let t = aantal_beugels_las_9_5_3(&inv);
    assert_eq!(t.status, CheckStatus::Ok, "{:?}", t.notes);
    assert_relative_eq!(t.value, 150.0, max_relative = 1e-12);
    assert_relative_eq!(t.uc.as_ref().unwrap().uc, 0.666_666_7, max_relative = 1e-6);

    inv.s_dwars_mm = Some(150.0);
    let t = aantal_beugels_las_9_5_3(&inv);
    assert_eq!(t.status, CheckStatus::Ok, "precies op de grens hoort te voldoen");
    assert_relative_eq!(t.uc.as_ref().unwrap().uc, 1.0, max_relative = 1e-9);
}

/// Boven die helft is er NIETS bewezen — en dat is iets anders dan afgekeurd.
/// De werkelijke l₀ van §8.7.3 is doorgaans een veelvoud van de ondergrens, dus
/// een `NotOk` zou een kolom afkeuren die de norm niet afkeurt.
#[test]
fn boven_de_ondergrens_wordt_er_niet_afgekeurd_maar_gemeld() {
    let mut inv = detaillering();
    inv.zone = Beugelzone::BijOverlappingslas;
    inv.s_dwars_mm = Some(250.0);
    let t = aantal_beugels_las_9_5_3(&inv);
    assert_eq!(t.status, CheckStatus::NotApplicable, "{:?}", t.notes);
    assert!(t.uc.is_none(), "een onbeslist geval hoort geen unity check te dragen");
    assert!(
        t.notes.iter().any(|n| n.contains("geen afkeuring")),
        "de melding moet zeggen dat dit geen afkeuring is: {:?}",
        t.notes
    );
}

/// De dunste staaf bepaalt de ondergrens, niet de dikste: met Ø12 tussenstaven
/// naast Ø20 hoekstaven wordt 15·12 = 180 mm, en dan wint de absolute tak van
/// 200 mm. s_max wordt 100 mm in plaats van de 150 mm bij enkel Ø20.
#[test]
fn de_dunste_langsstaaf_bepaalt_de_ondergrens_van_de_overlappingslengte() {
    let mut inv = detaillering();
    inv.zone = Beugelzone::BijOverlappingslas;
    inv.phi_l_min_mm = 12.0;
    inv.phi_l_max_mm = 20.0;
    inv.s_dwars_mm = Some(100.0);
    let t = aantal_beugels_las_9_5_3(&inv);
    assert_eq!(t.status, CheckStatus::Ok, "{:?}", t.notes);
    assert_relative_eq!(t.value, 100.0, max_relative = 1e-12);
}

/// Zonder h.o.h.-afstand is er niets te toetsen — en dus geen vinkje.
#[test]
fn zonder_beugelafstand_blijft_het_beugelaantal_onbeslist() {
    let mut inv = detaillering();
    inv.zone = Beugelzone::BijOverlappingslas;
    inv.s_dwars_mm = None;
    let t = aantal_beugels_las_9_5_3(&inv);
    assert_eq!(t.status, CheckStatus::NotApplicable);
    assert!(t.uc.is_none());
    assert!(
        t.notes.iter().any(|n| n.contains("Niet te toetsen")),
        "de reden hoort erbij: {:?}",
        t.notes
    );
}

/// Wat §9.5 wél eist maar deze module niet toetst, hoort opgesomd te worden.
/// Een detailleringshoofdstuk dat zwijgt over wat het niet heeft nagekeken,
/// wekt de indruk dat het alles heeft nagekeken.
#[test]
fn de_niet_getoetste_eisen_worden_met_reden_opgesomd() {
    let lijst = niet_getoetste_9_5_eisen();
    assert_eq!(lijst.len(), 2);
    for eis in &lijst {
        assert!(eis.starts_with("§9.5"), "elke regel begint met het artikel: {eis}");
    }
    // §9.5.2(4), §9.5.3(6) en §9.5.3(4)ii staan er NIET meer in: die worden
    // werkelijk getoetst — de eerste twee sinds de korf staven per zijde kent,
    // de derde sinds `aantal_beugels_las_9_5_3`. Zou een van drieën hier
    // terugkomen, dan zegt het rapport twee dingen tegelijk — dat de eis niet
    // is nagekeken, terwijl er een uitkomst in de tabel staat.
    for artikel in ["9.5.2(4)", "9.5.3(6)", "9.5.3(4)ii"] {
        assert!(
            !lijst.iter().any(|e| e.contains(artikel)),
            "{artikel} wordt getoetst en hoort niet in de lijst van niet-getoetste eisen"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// §9.5.2(4) en §9.5.3(6) — de twee eisen die de LIGGING van de staven vragen
// ═══════════════════════════════════════════════════════════════════════════

/// Een kolomdetaillering met een eigen korf en doorsnede, zodat de twee
/// nieuwe toetsen op werkelijk verschillende korven zijn na te rekenen.
fn detaillering_met(korf: &ReinforcementCage, b_mm: f64, h_mm: f64) -> KolomdetailleringInvoer {
    let doorsnede = ConcreteSection::new(b_mm, h_mm);
    KolomdetailleringInvoer {
        h_mm,
        b_mm,
        a_c_mm2: b_mm * h_mm,
        a_s_mm2: korf.a_s_total_mm2(),
        phi_dwars_mm: if korf.stirrup_diameter_mm > 0.0 {
            Some(korf.stirrup_diameter_mm)
        } else {
            None
        },
        n_beugelbenen: korf.stirrup_legs,
        staafposities: korf.staafposities(&doorsnede),
        ..detaillering()
    }
}

/// §9.5.2(4) — "ten minste één staaf in iedere hoek". Met de hand: een korf
/// met twee staven onder en twee boven bezet alle vier de hoeken; een korf met
/// één staaf onder en één boven bezet er geen enkele, want een enkele staaf
/// staat in het MIDDEN van zijn rij.
#[test]
fn hoekstaven_9_5_2_telt_de_vier_hoeken_en_niet_de_staven() {
    let goed = hoekstaven_9_5_2(&detaillering_met(&korf_4o20(), H_MM, H_MM));
    assert_eq!(goed.status, CheckStatus::Ok);
    assert_relative_eq!(goed.value, 4.0, max_relative = 1e-12);

    let midden = ReinforcementCage {
        top: RebarRow { count: 1, diameter_mm: 20.0 },
        bottom: RebarRow { count: 1, diameter_mm: 20.0 },
        ..korf_4o20()
    };
    let fout = hoekstaven_9_5_2(&detaillering_met(&midden, H_MM, H_MM));
    assert_eq!(fout.status, CheckStatus::NotOk, "twee staven op de hartlijn bezetten geen hoek");
    assert_relative_eq!(fout.value, 0.0, max_relative = 1e-12);
    // uc bij een minimumeis is vereist/aanwezig; met nul hoekstaven is dat
    // oneindig, en dat hoort een afkeuring te zijn en geen deling door nul.
    assert!(fout.uc.as_ref().unwrap().uc.is_infinite());
}

/// Zijstaven zijn géén hoekstaven: zij liggen per definitie tussen de hoeken
/// in. Een korf met zijstaven mag dus niet meer hoeken gaan tellen.
#[test]
fn zijstaven_tellen_niet_als_hoekstaaf() {
    let met_zij = ReinforcementCage {
        sides: Some(RebarRow { count: 2, diameter_mm: 16.0 }),
        ..korf_4o20()
    };
    let toets = hoekstaven_9_5_2(&detaillering_met(&met_zij, H_MM, 600.0));
    assert_eq!(toets.status, CheckStatus::Ok);
    assert_relative_eq!(toets.value, 4.0, max_relative = 1e-12);
    // 2 onder + 2 boven + 2 x 2 opzij = 8 langsstaven, waarvan 4 in een hoek.
    let n_langs = toets.variables.iter().find(|v| v.symbol == "n_langs").unwrap().value;
    assert_relative_eq!(n_langs, 8.0, max_relative = 1e-12);
}

/// §9.5.3(6), tweede zin — 150 mm, net wel en net niet.
///
/// Handberekening. Dekking 30 mm, beugel Ø8, staven Ø20: de asafstand tot elke
/// rand is 30 + 8 + 10 = 48 mm. Met drie staven in een rij ligt de middelste op
/// de hartlijn en liggen de buitenste op b/2 − 48 daarvandaan. Die afstand is
/// precies wat de norm begrenst:
///
///   b = 396 mm → 396/2 − 48 = 150,0 mm  → uc = 150/150 = 1,00 → voldoet
///   b = 400 mm → 400/2 − 48 = 152,0 mm  → uc = 152/150 = 1,0133 → voldoet niet
#[test]
fn de_150_mm_regel_van_9_5_3_6_net_wel_en_net_niet() {
    let drie = ReinforcementCage {
        top: RebarRow { count: 3, diameter_mm: 20.0 },
        bottom: RebarRow { count: 3, diameter_mm: 20.0 },
        ..korf_4o20()
    };
    let net_wel = opgesloten_staven_9_5_3(&detaillering_met(&drie, 396.0, 300.0));
    assert_relative_eq!(net_wel.value, 150.0, max_relative = 1e-9);
    assert_eq!(net_wel.status, CheckStatus::Ok);
    assert_relative_eq!(net_wel.uc.as_ref().unwrap().uc, 1.0, max_relative = 1e-9);

    let net_niet = opgesloten_staven_9_5_3(&detaillering_met(&drie, 400.0, 300.0));
    assert_relative_eq!(net_niet.value, 152.0, max_relative = 1e-9);
    assert_eq!(net_niet.status, CheckStatus::NotOk);
    assert_relative_eq!(net_niet.uc.as_ref().unwrap().uc, 152.0 / 150.0, max_relative = 1e-9);
}

/// §9.5.3(6), eerste zin — zonder beugel wordt geen enkele hoekstaaf op zijn
/// plaats gehouden. Dat is een AFKEURING en geen ontbrekend gegeven: de
/// beugeldiameter 0 zegt dat er niets ligt.
#[test]
fn zonder_beugel_is_geen_staaf_opgesloten() {
    let kaal = ReinforcementCage { stirrup_diameter_mm: 0.0, stirrup_legs: None, ..korf_4o20() };
    let toets = opgesloten_staven_9_5_3(&detaillering_met(&kaal, H_MM, H_MM));
    assert_eq!(toets.status, CheckStatus::NotOk);
    assert!(toets.notes.iter().any(|n| n.contains("AFGEKEURD op de eerste zin")));
}

/// Meer dan twee beugelbenen: er zijn tussenbeugels of haarspelden, en hun
/// ligging is geen invoer. Dan geen oordeel — maar wél de gemeten afstand,
/// zodat de lezer ziet waar het om gaat.
#[test]
fn meer_dan_twee_beugelbenen_levert_geen_oordeel_maar_wel_de_maat() {
    let breed = ReinforcementCage {
        stirrup_legs: Some(4),
        top: RebarRow { count: 3, diameter_mm: 20.0 },
        bottom: RebarRow { count: 3, diameter_mm: 20.0 },
        ..korf_4o20()
    };
    let toets = opgesloten_staven_9_5_3(&detaillering_met(&breed, 400.0, 300.0));
    assert_eq!(toets.status, CheckStatus::NotApplicable);
    assert!(toets.uc.is_none(), "zonder oordeel hoort geen unity check");
    assert_relative_eq!(toets.value, 152.0, max_relative = 1e-9);
    assert!(toets.notes.iter().any(|n| n.contains("Niet te toetsen")));
}

/// Zonder bekende staafplaatsen: geen groen vinkje, maar `NotApplicable` met
/// de reden — dezelfde afspraak als bij de ontbrekende beugelgegevens.
#[test]
fn zonder_bekende_staafplaatsen_geen_stilzwijgend_groen_vinkje() {
    let inv = KolomdetailleringInvoer { staafposities: Vec::new(), ..detaillering() };
    for toets in [hoekstaven_9_5_2(&inv), opgesloten_staven_9_5_3(&inv)] {
        assert_eq!(toets.status, CheckStatus::NotApplicable, "toets {}", toets.id);
        assert!(toets.uc.is_none(), "toets {} hoort geen unity check te hebben", toets.id);
        assert!(
            toets.notes.iter().any(|n| n.contains("Niet te toetsen")),
            "toets {} moet de reden noemen",
            toets.id
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.2 — de imperfectie als excentriciteit, en §5.8.9 — dubbele buiging.
//
// Elke verwachte waarde is met de hand uitgerekend; het rekenwerk staat bij de
// test. De formules zijn van de gerenderde bladzijden 68, 95 en 96 gelezen.
// ═══════════════════════════════════════════════════════════════════════════
mod tweede_as {
    use approx::assert_relative_eq;
    use nen_en_1992_1_1::kolom::{
        dubbele_buiging_deelstappen, e_i_5_2_mm, exponent_a_5_39, interactie_5_39,
        moment_tweede_as_deelstappen, n_rd_5_39_n, scheefstand_5_1, voorwaarde_5_38a,
        voorwaarde_5_38b, AlphaHGrens, DubbeleBuiging, ExponentAGrondslag, MomentTweedeAs,
        TweedeOrdeDeel, EXPONENT_A_ROND_5_39, EXPONENT_A_TABEL_5_39, THETA_0_NB,
    };
    use nen_en_1992_1_1::{ConcreteSection, RebarRow, ReinforcementCage};

    /// De NB bij §5.2(5): θ₀ = 1/300, en niet de EN-aanbeveling 1/200.
    #[test]
    fn theta_0_is_de_waarde_van_de_nationale_bijlage() {
        assert_relative_eq!(THETA_0_NB, 1.0 / 300.0, max_relative = 1e-15);
        assert!(THETA_0_NB < 1.0 / 200.0, "1/300 is kleiner dan de EN-aanbeveling 1/200");
    }

    /// α_h = 2/√l met 2/3 ≤ α_h ≤ 1, en α_m = √(0,5·(1 + 1/m)).
    ///
    /// ```text
    ///   l = 4 m:  2/√4  = 1,0000 — precies op de bovengrens, niet begrensd
    ///   l = 1 m:  2/√1  = 2 > 1  → α_h = 1,      begrensd boven
    ///   l = 9 m:  2/√9  = 0,6667 — precies op de ondergrens, niet begrensd
    ///   l = 25 m: 2/√25 = 0,4    → α_h = 2/3,    begrensd onder
    ///   l = 6 m:  2/√6  = 0,816497
    ///   m = 1: α_m = √(0,5·2) = 1;  m = 3: α_m = √(0,5·(1 + 1/3)) = 0,816497
    /// ```
    #[test]
    fn alpha_h_en_alpha_m_handberekend() {
        let s4 = scheefstand_5_1(4.0, 1).unwrap();
        assert_relative_eq!(s4.alpha_h, 1.0, max_relative = 1e-12);
        assert_eq!(s4.alpha_h_grens, None);

        let s1 = scheefstand_5_1(1.0, 1).unwrap();
        assert_relative_eq!(s1.alpha_h, 1.0, max_relative = 1e-12);
        assert_eq!(s1.alpha_h_grens, Some(AlphaHGrens::Boven));

        let s9 = scheefstand_5_1(9.0, 1).unwrap();
        assert_relative_eq!(s9.alpha_h, 2.0 / 3.0, max_relative = 1e-12);
        assert_eq!(s9.alpha_h_grens, None);

        let s25 = scheefstand_5_1(25.0, 1).unwrap();
        assert_relative_eq!(s25.alpha_h, 2.0 / 3.0, max_relative = 1e-12);
        assert_eq!(s25.alpha_h_grens, Some(AlphaHGrens::Onder));

        let s6 = scheefstand_5_1(6.0, 1).unwrap();
        assert_relative_eq!(s6.alpha_h, 0.816_496_580_927_726, max_relative = 1e-12);
        assert_relative_eq!(s6.alpha_m, 1.0, max_relative = 1e-12);
        // θ_i = θ₀·α_h·α_m = 0,816497/300 = 0,00272166
        assert_relative_eq!(s6.theta_i, 0.002_721_655_269_759, max_relative = 1e-9);

        let s6m3 = scheefstand_5_1(6.0, 3).unwrap();
        assert_relative_eq!(s6m3.alpha_m, 0.816_496_580_927_726, max_relative = 1e-12);

        assert!(scheefstand_5_1(0.0, 1).is_err());
        assert!(scheefstand_5_1(6.0, 0).is_err());
    }

    /// (5.2): e_i = θ_i·l₀/2. Kolom van 6 m, l₀ = l (figuur 5.7 a):
    /// e_i = 0,00272166 · 6000 / 2 = 8,16497 mm. Met de EN-waarde 1/200 zou
    /// het 12,247 mm zijn; de vereenvoudiging l₀/400 zou 15 mm geven.
    #[test]
    fn e_i_handberekend() {
        let s = scheefstand_5_1(6.0, 1).unwrap();
        let e_i = e_i_5_2_mm(s.theta_i, 6000.0).unwrap();
        assert_relative_eq!(e_i, 8.164_965_809_277_26, max_relative = 1e-9);
        assert!(e_i < 6000.0 / 400.0, "de vereenvoudiging l₀/400 hoort bij θ₀ = 1/200");
        assert!(e_i_5_2_mm(s.theta_i, 0.0).is_err());
        assert!(e_i_5_2_mm(-1.0, 6000.0).is_err());
    }

    /// N_Rd = A_c·f_cd + A_s·f_yd voor 300 × 300, C30/37, B500B, 4Ø16:
    ///   90 000 · 20 + 804,2477 · 434,7826 = 1 800 000 + 349 672,9 = 2 149 672,9 N
    #[test]
    fn n_rd_handberekend() {
        let a_s = 4.0 * std::f64::consts::PI * 64.0;
        let n_rd = n_rd_5_39_n(90_000.0, 20.0, a_s, 500.0 / 1.15).unwrap();
        assert_relative_eq!(n_rd, 2_149_672.921_443_04, max_relative = 1e-9);
        assert!(n_rd_5_39_n(0.0, 20.0, a_s, 434.8).is_err());
        assert!(n_rd_5_39_n(90_000.0, 20.0, -1.0, 434.8).is_err());
    }

    /// De tabel bij (5.39) en de lineaire interpolatie ertussen.
    ///
    /// ```text
    ///   N_Ed/N_Rd = 0,1  → a = 1,0        (ankerpunt)
    ///               0,4  → 1,0 + (0,3/0,6)·0,5 = 1,25
    ///               0,7  → 1,5        (ankerpunt)
    ///               0,85 → 1,5 + (0,15/0,3)·0,5 = 1,75
    ///               1,0  → 2,0        (ankerpunt)
    ///               0,05 → onder de tabel: 1,0 aangehouden (de strengste)
    ///               1,2  → boven de tabel: 2,0, en N_Ed > N_Rd
    /// ```
    #[test]
    fn exponent_a_tabel_en_interpolatie() {
        assert_eq!(EXPONENT_A_TABEL_5_39, [(0.1, 1.0), (0.7, 1.5), (1.0, 2.0)]);
        assert_relative_eq!(EXPONENT_A_ROND_5_39, 2.0);
        let n_rd = 1000.0;
        let a = |n: f64| exponent_a_5_39(n, n_rd).unwrap();
        assert_relative_eq!(a(100.0).0, 1.0, max_relative = 1e-12);
        assert_relative_eq!(a(400.0).0, 1.25, max_relative = 1e-12);
        assert_eq!(a(400.0).1, ExponentAGrondslag::Geinterpoleerd);
        assert_relative_eq!(a(700.0).0, 1.5, max_relative = 1e-12);
        assert_relative_eq!(a(850.0).0, 1.75, max_relative = 1e-12);
        assert_relative_eq!(a(1000.0).0, 2.0, max_relative = 1e-12);
        assert_eq!(a(50.0), (1.0, ExponentAGrondslag::OnderTabel));
        assert_eq!(a(1200.0), (2.0, ExponentAGrondslag::BovenTabel));
        assert!(exponent_a_5_39(100.0, 0.0).is_err());
        assert!(exponent_a_5_39(-1.0, 1000.0).is_err());
    }

    /// (5.38a) precies op de grens: λ_z/λ_y = 2 voldoet, 2,001 niet.
    #[test]
    fn voorwaarde_5_38a_op_de_grens() {
        let net_wel = voorwaarde_5_38a(34.641, 69.282).unwrap();
        assert_relative_eq!(net_wel.z_door_y, 2.0, max_relative = 1e-12);
        assert!(net_wel.voldaan);
        let net_niet = voorwaarde_5_38a(34.641, 69.282 * 1.0005).unwrap();
        assert!(net_niet.z_door_y > 2.0 && !net_niet.voldaan);
        // Symmetrisch: de andere kant om ook.
        assert!(!voorwaarde_5_38a(69.282 * 1.0005, 34.641).unwrap().voldaan);
        assert!(voorwaarde_5_38a(0.0, 10.0).is_err());
    }

    /// (5.38b) met de kolom van referentie R29: 300 × 300, N_Ed = 600 kN,
    /// M_Edy = 40 kNm, M_Edz = 35 kNm.
    ///
    /// ```text
    ///   i_y = i_z = 300/√12 = 86,6025 mm → b_eq = h_eq = 300 mm
    ///   e_y = M_Edz/N_Ed = 35/600 = 58,333 mm;  e_y/h_eq = 0,19444
    ///   e_z = M_Edy/N_Ed = 40/600 = 66,667 mm;  e_z/b_eq = 0,22222
    ///   (e_y/h_eq)/(e_z/b_eq) = 0,875;  omgekeerd 1,143 → geen van beide ≤ 0,2
    ///   met M_Edz = 5 kNm: e_y = 8,333 mm; 0,02778/0,22222 = 0,125 ≤ 0,2 → voldaan
    /// ```
    #[test]
    fn voorwaarde_5_38b_handberekend() {
        let i = 300.0 / 12.0_f64.sqrt();
        let v = voorwaarde_5_38b(35.0 / 600.0 * 1e3, 40.0 / 600.0 * 1e3, i, i).unwrap();
        assert_relative_eq!(v.b_eq_mm, 300.0, max_relative = 1e-12);
        assert_relative_eq!(v.h_eq_mm, 300.0, max_relative = 1e-12);
        assert_relative_eq!(v.e_y_rel, 0.194_444_444, max_relative = 1e-8);
        assert_relative_eq!(v.e_z_rel, 0.222_222_222, max_relative = 1e-8);
        assert_relative_eq!(v.y_door_z, 0.875, max_relative = 1e-9);
        assert!(!v.voldaan);

        let klein = voorwaarde_5_38b(5.0 / 600.0 * 1e3, 40.0 / 600.0 * 1e3, i, i).unwrap();
        assert_relative_eq!(klein.y_door_z, 0.125, max_relative = 1e-9);
        assert!(klein.voldaan);

        // Enkelvoudige buiging: e_y = 0 → de verhouding is 0 en niet "deling
        // door nul"; de voorwaarde is vervuld.
        let enkel = voorwaarde_5_38b(0.0, 66.667, i, i).unwrap();
        assert!(enkel.voldaan);
        assert_relative_eq!(enkel.y_door_z, 0.0);
        assert!(enkel.z_door_y.is_infinite());
        // Zuivere druk: allebei nul, ook vervuld.
        assert!(voorwaarde_5_38b(0.0, 0.0, i, i).unwrap().voldaan);
        // Het teken doet er niet toe.
        let neg = voorwaarde_5_38b(-58.333, 66.667, i, i).unwrap();
        assert_relative_eq!(neg.e_y_mm, 58.333);
        assert!(voorwaarde_5_38b(1.0, 1.0, 0.0, i).is_err());
    }

    /// (5.39): (30/60)^1,5 + (20/50)^1,5 = 0,3535534 + 0,2529822 = 0,6065356.
    #[test]
    fn interactie_5_39_handberekend() {
        let som = interactie_5_39(30.0, 60.0, 20.0, 50.0, 1.5).unwrap();
        assert_relative_eq!(som, 0.606_535_6, max_relative = 1e-7);
        // a = 1: gewoon de som van de twee verhoudingen.
        assert_relative_eq!(interactie_5_39(30.0, 60.0, 20.0, 50.0, 1.0).unwrap(), 0.9);
        // Het teken van de momenten doet er niet toe.
        assert_relative_eq!(interactie_5_39(-30.0, 60.0, -20.0, 50.0, 1.0).unwrap(), 0.9);
        assert!(interactie_5_39(30.0, 0.0, 20.0, 50.0, 1.0).is_err());
        assert!(interactie_5_39(30.0, 60.0, 20.0, 50.0, 0.5).is_err());
    }

    /// I_z van een rechthoek: 300 × 600 → h·b³/12 = 600·300³/12 = 1,35·10⁹ mm⁴,
    /// en i_z = √(I_z/A) = 300/√12.
    #[test]
    fn i_z_van_een_rechthoek() {
        let s = ConcreteSection::rectangle(300.0, 600.0);
        assert_relative_eq!(s.i_z_centroid_mm4(), 1.35e9, max_relative = 1e-12);
        assert_relative_eq!(s.i_centroid_mm4(), 5.4e9, max_relative = 1e-12);
        let i_z = (s.i_z_centroid_mm4() / s.area_mm2()).sqrt();
        assert_relative_eq!(i_z, 300.0 / 12.0_f64.sqrt(), max_relative = 1e-12);
    }

    /// De staven in lagen over de breedte, voor het M-N-κ-diagram om z.
    ///
    /// 300 × 300, dekking 30, beugel Ø8, 3Ø20 onder en 3Ø20 boven, 1Ø12 per
    /// zijkant. Halve binnenmaat van de Ø20-rijen: 150 − 30 − 8 − 10 = 102 mm,
    /// dus x = −102, 0, +102; van de zijstaven 150 − 30 − 8 − 6 = 106 mm.
    /// Gedraaid (b wordt de hoogte): lagen op x + 150 =
    ///   44 (1Ø12), 48 (2Ø20), 150 (2Ø20), 252 (2Ø20), 256 (1Ø12).
    #[test]
    fn lagen_om_z_groeperen_op_x() {
        let korf = ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 3, diameter_mm: 20.0 },
            bottom: RebarRow { count: 3, diameter_mm: 20.0 },
            sides: Some(RebarRow { count: 1, diameter_mm: 12.0 }),
            ..ReinforcementCage::default()
        };
        let s = ConcreteSection::rectangle(300.0, 300.0);
        let (gedraaid, lagen) = korf.lagen_om_z(&s).unwrap();
        assert_relative_eq!(gedraaid.b_mm, 300.0);
        assert_relative_eq!(gedraaid.h_mm, 300.0);
        let o20 = std::f64::consts::PI * 100.0;
        let o12 = std::f64::consts::PI * 36.0;
        let verwacht = [(44.0, o12), (48.0, 2.0 * o20), (150.0, 2.0 * o20), (252.0, 2.0 * o20), (256.0, o12)];
        assert_eq!(lagen.len(), verwacht.len(), "{lagen:?}");
        for (laag, (z, opp)) in lagen.iter().zip(verwacht) {
            assert_relative_eq!(laag.z_mm, z, max_relative = 1e-12);
            assert_relative_eq!(laag.area_mm2, opp, max_relative = 1e-12);
        }
        // Het totale oppervlak blijft dat van de korf.
        let som: f64 = lagen.iter().map(|l| l.area_mm2).sum();
        assert_relative_eq!(som, korf.a_s_total_mm2(), max_relative = 1e-12);

        // Een niet-vierkante rechthoek draait mee: 300 breed × 600 hoog wordt
        // 600 breed × 300 hoog.
        let (gedraaid2, _) = korf.lagen_om_z(&ConcreteSection::rectangle(300.0, 600.0)).unwrap();
        assert_relative_eq!(gedraaid2.b_mm, 600.0);
        assert_relative_eq!(gedraaid2.h_mm, 300.0);
    }

    #[test]
    fn lagen_om_z_weigert_een_t_met_reden() {
        let korf = ReinforcementCage {
            cover_mm: 30.0,
            stirrup_diameter_mm: 8.0,
            top: RebarRow { count: 2, diameter_mm: 16.0 },
            bottom: RebarRow { count: 2, diameter_mm: 16.0 },
            ..ReinforcementCage::default()
        };
        let t = ConcreteSection::tee(600.0, 150.0, 300.0, 500.0).unwrap();
        let fout = korf.lagen_om_z(&t).unwrap_err();
        assert!(fout.contains("rechthoek"), "{fout}");
        assert!(fout.contains("5.8.9(4)"), "{fout}");
    }

    /// De afleidingen noemen de vindplaatsen en dragen de ingevulde getallen.
    #[test]
    fn de_deelstappen_noemen_de_artikelen() {
        let s = scheefstand_5_1(6.0, 1).unwrap();
        let m = MomentTweedeAs {
            n_ed_druk_kn: 600.0,
            m0_knm: 35.0,
            scheefstand: s,
            l0_mm: 6000.0,
            e_i_mm: 8.165,
            tweede_orde: TweedeOrdeDeel::Gerekend {
                e_2_mm: 18.6,
                kappa_per_m: 0.0248,
                c: 8.0,
                iteraties: 7,
                phi_ef: 0.0,
                lambda: 69.3,
                lambda_lim: 23.5,
            },
            e_0_mm: 20.0,
            e_0_bindend: false,
            m_ed_knm: 51.06,
            m_rd_knm: Some(117.1),
        };
        let stappen = moment_tweede_as_deelstappen(&m);
        let ids: Vec<&str> = stappen.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(ids, ["theta_i", "e_i", "e_2", "m_ed_tweede_as", "m_rd_tweede_as"]);
        assert!(stappen[0].article.contains("5.2(5)") && stappen[0].article.contains("1/300"));
        assert!(stappen[1].article.contains("5.2(7)"));
        assert!(stappen[2].article.contains("5.8.6(6)"));
        assert!(stappen[2].notes.iter().any(|n| n.contains("c = 8")));
        assert!(stappen[3].article.contains("6.1(4)"));
        assert_relative_eq!(stappen[3].value.unwrap(), 51.06);

        let d = DubbeleBuiging {
            voorwaarde_a: voorwaarde_5_38a(69.3, 69.3).unwrap(),
            voorwaarde_b: voorwaarde_5_38b(58.3, 66.7, 86.6, 86.6).unwrap(),
            apart_toegestaan: false,
            n_ed_druk_kn: 600.0,
            n_rd_kn: 2619.5,
            a_c_mm2: 90_000.0,
            a_s_mm2: 1885.0,
            f_cd_mpa: 20.0,
            f_yd_mpa: 434.8,
            n_verhouding: 0.229,
            a: 1.1075,
            a_grondslag: ExponentAGrondslag::Geinterpoleerd,
            m_edy_knm: 40.0,
            m_rdy_knm: 142.0,
            m_edz_knm: 51.06,
            m_rdz_knm: 117.1,
            interactie: 0.644,
        };
        let stappen = dubbele_buiging_deelstappen(&d);
        let ids: Vec<&str> = stappen.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(
            ids,
            ["voorwaarde_5_38a", "voorwaarde_5_38b", "n_rd", "exponent_a", "interactie_5_39"]
        );
        assert!(stappen[0].article.contains("(5.38a)"));
        assert!(stappen[1].article.contains("(5.38b)"));
        assert!(stappen[1].notes.iter().any(|n| n.contains("NIET vervuld")));
        assert!(stappen[3].notes.iter().any(|n| n.contains("lineaire interpolatie")));
        assert!(stappen[4].article.contains("(5.39)"));
        assert_relative_eq!(stappen[4].value.unwrap(), 0.644);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// §5.8.3.1(1) — de terugval voor A alleen waar zij aan de veilige kant ligt
// ═══════════════════════════════════════════════════════════════════════════

/// A MET GRONDSLAG. §5.8.3.1(1): A = 1/(1 + 0,2·φ_ef), "als φ_ef onbekend is
/// mag A = 0,7 zijn gebruikt". 0,7 hoort bij φ_ef ≈ 2,142857.
///
/// ```text
///   (5.19) bekend, φ_ef = 1,0            → A = 1/1,2 = 0,8333333   (formule)
///   onbekend, φ(∞,t₀) niet opgegeven     → A = 0,7                  (standaard)
///   onbekend, φ(∞,t₀) = 2,0              → 1/1,4 = 0,714 ≥ 0,7 → A = 0,7
///   onbekend, φ(∞,t₀) = 3,0              → 1/1,6 = 0,625 < 0,7 → A = 0,625
///   onbekend, φ(∞,t₀) = 2,142857 (grens) → 1/1,4285714 = 0,7 → A = 0,7
/// ```
#[test]
fn factor_a_neemt_de_terugval_alleen_aan_de_veilige_kant() {
    use nen_en_1992_1_1::kolom::{factor_a_met_grondslag, AGrondslag};

    let (a, g) = factor_a_met_grondslag(Some(1.0), Some(2.0));
    assert_relative_eq!(a, 1.0 / 1.2, max_relative = 1e-12);
    assert_eq!(g, AGrondslag::UitPhiEf);

    assert_eq!(
        factor_a_met_grondslag(None, None),
        (0.7, AGrondslag::Standaardwaarde { phi_inf_t0: None })
    );
    assert_eq!(
        factor_a_met_grondslag(None, Some(2.0)),
        (0.7, AGrondslag::Standaardwaarde { phi_inf_t0: Some(2.0) })
    );
    let (a, g) = factor_a_met_grondslag(None, Some(3.0));
    assert_relative_eq!(a, 0.625, max_relative = 1e-12);
    assert_eq!(g, AGrondslag::BovengrensKruip { phi_inf_t0: 3.0 });
    let (a, _) = factor_a_met_grondslag(None, Some(1.0 / 0.7 / 0.2 - 5.0));
    assert_relative_eq!(a, 0.7, max_relative = 1e-12);
}

/// KOLOMSLANKHEID met φ(∞,t₀) = 3,0 maar zonder M₀Eqp — de geschoorde
/// handberekening van hierboven (λ_lim = 30,119 met A = 0,7), nu met
/// A = 0,625:
///
/// ```text
///   λ_lim = 30,119088 · 0,625/0,7 = 26,892043
/// ```
///
/// De kanttekening zegt dat A NIET uit (5.19) komt en waarom 0,7 niet is
/// genomen.
#[test]
fn kolomslankheid_met_kruipcoefficient_zonder_m0eqp_neemt_de_bovengrens() {
    use nen_en_1992_1_1::kolom::AGrondslag;
    let mut inv = kolom(
        Schoring::Geschoord,
        Kniklengtebepaling::Standaardgeval(Knikgeval::IngeklemdScharnierend),
        -900.0,
    );
    inv.eindmomenten_knm = Some((30.0, 60.0));
    inv.phi_inf_t0 = Some(3.0);
    inv.m0_ed_knm = Some(60.0);
    let k = kolomslankheid(&inv).unwrap();
    assert!(k.phi_ef.is_none());
    assert!(!k.a_standaard);
    assert_eq!(k.a_grondslag, AGrondslag::BovengrensKruip { phi_inf_t0: 3.0 });
    assert_relative_eq!(k.a, 0.625, max_relative = 1e-12);
    assert_relative_eq!(k.lambda_lim, 30.119_088 * 0.625 / 0.7, max_relative = 1e-6);
    let tekst = k.kanttekeningen.join(" ");
    assert!(tekst.contains("WAARSCHUWING — A niet uit (5.19)"), "{tekst}");
    assert!(tekst.contains("M₀Eqp uit de quasi-blijvende BGT-combinatie ontbreekt"), "{tekst}");
    let abc = kolom_deelstappen(&k).into_iter().find(|s| s.id == "abc").unwrap();
    assert!(abc.notes.iter().any(|n| n.contains("groter dan 2,14")), "{:?}", abc.notes);
}
