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
    as_max_9_5_2_mm2, as_min_9_5_2_mm2, factor_a, factor_b, grondslag_c, k_begrensd,
    kolom_deelstappen, kolomdetailleringstoetsen, kolomslankheid, kruip_verwaarloosbaar_5_8_4_4,
    l0_geschoord_5_15, l0_ongeschoord_5_16, l0_uit_knikbelasting_5_17, lambda_lim_5_13n,
    min_diameter_dwarswapening_9_5_3_mm, niet_getoetste_9_5_eisen, omega, phi_ef_5_19,
    s_cl_tmax_9_5_3_mm, slankheid_5_14, traagheidsstraal_rechthoek_mm, Beugelzone, Cgrondslag,
    Knikgeval, Kniklengtebepaling, KolomInvoer, KolomdetailleringInvoer, Overlappingssituatie,
    Schoring, ScltmaxTak,
};
use nen_en_1992_1_1::{concrete_class_by_name, reinforcement_grade_by_name, CheckStatus,
    DesignSituation};

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

fn detaillering() -> KolomdetailleringInvoer {
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
        zone: Beugelzone::Regulier,
        overlapping: Overlappingssituatie::GeenLassen,
        n_ed_druk_kn: 900.0,
        f_yd_mpa: f_yd_b500(),
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

/// De zeven §9.5-toetsen op een rij voor een kolom die aan alles voldoet.
#[test]
fn een_deugdelijke_kolom_haalt_alle_zeven_de_toetsen() {
    let toetsen = kolomdetailleringstoetsen(&detaillering());
    assert_eq!(toetsen.len(), 7);
    for t in &toetsen {
        assert_eq!(t.status, CheckStatus::Ok, "toets {} ({}) faalt", t.id, t.title);
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

/// Wat §9.5 wél eist maar deze module niet toetst, hoort opgesomd te worden.
/// Een detailleringshoofdstuk dat zwijgt over wat het niet heeft nagekeken,
/// wekt de indruk dat het alles heeft nagekeken.
#[test]
fn de_niet_getoetste_eisen_worden_met_reden_opgesomd() {
    let lijst = niet_getoetste_9_5_eisen();
    assert_eq!(lijst.len(), 5);
    for eis in &lijst {
        assert!(eis.starts_with("§9.5"), "elke regel begint met het artikel: {eis}");
    }
    assert!(lijst.iter().any(|e| e.contains("9.5.2(4)")));
    assert!(lijst.iter().any(|e| e.contains("9.5.3(6)")));
}
