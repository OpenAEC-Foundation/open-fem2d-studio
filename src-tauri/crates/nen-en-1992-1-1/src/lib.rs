//! NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020 — gewapend beton.
//!
//! Deze crate bevat de rekenregels voor de doorsnedeberekening van een
//! rechthoekige gewapend-betonnen doorsnede met een wapeningskorf:
//!
//! * [`data`] — tabel 3.1 (beton) en bijlage C tabel C.1 (wapeningsstaal);
//! * [`factors`] — partiële factoren (tabel 2.1N), α_cc (NB bij 3.1.6),
//!   rekenwaarden f_cd en f_yd, en de factoren λ en η van de rechthoekige
//!   spanningsverdeling (3.1.7(3));
//! * [`stress_strain`] — de spanning-rekrelaties. Twee betondiagrammen die
//!   naast elkaar bestaan en niet door elkaar mogen worden gehaald:
//!   parabool-rechthoek (3.1.7(1)) voor de **doorsnedetoetsing**, en
//!   vergelijking (3.14) van 3.1.5 voor de **niet-lineaire constructieve
//!   berekening** waarnaar 5.8.6(3) verwijst. Staal: bilineair (3.2.7);
//! * [`stiffness`] — de secante buigstijfheid EI = (M − M₀)/κ voor die
//!   constructieve berekening: het moment bij κ = 0, de omgekeerde weg van
//!   (N, M) naar κ, het scheurmoment uit f_ctm, en in de
//!   bruikbaarheidsgrenstoestand de tension stiffening van 7.4.3;
//! * [`section`] — de rechthoekige doorsnede en de wapeningskorf (dekking,
//!   beugel, boven- en onderwapening) → wapeningslagen met hun ligging;
//! * [`mnkappa`] — de M-N-κ-berekening: voor een gegeven normaalkracht en
//!   kromming de rekverdeling, de spanningen per strook en per laag en het
//!   resulterende moment; daaruit het M-κ-diagram bij vaste N tot bezwijken,
//!   en het N-M-interactiediagram;
//! * [`bending`] — de momentweerstand met de rechthoekige spanningsverdeling
//!   (de klassieke handberekening, 3.1.7(3));
//! * [`checks`] — de toetsen als [`ResistanceCalc`], met formule, variabelen
//!   en unity check, in hetzelfde contract als de staal- en houttoetsen.
//!
//! Tekenconventie aan de buitengrens (gelijk aan `mechanics`): N positief =
//! trek, M_y positief = trek in de onderste vezel. Inwendig rekent de
//! doorsnedeberekening met druk positief; de omzetting zit in [`mnkappa`] en
//! [`bending`] en nergens anders.
//!
//! Elke overgenomen normwaarde draagt zijn vindplaats in het commentaar.
//! De normtekst is gelezen uit de PDF-uitgave; de tekstextractie daarvan
//! hussselt lopende tekst door elkaar. Wat wél leesbaar was: alle tabellen
//! (2.1N, 3.1, C.1), de vergelijkingsnummers met hun geldigheidsbereik en de
//! NB-bepalingen ("De waarde van … moet gelijk aan … zijn genomen"). Wat
//! NIET leesbaar was, is per plek in het doc-commentaar gemeld; daar is de
//! gebruikte vorm de algemeen bekende vorm van de betreffende vergelijking en
//! is dat numeriek gecontroleerd (randwaarden, handberekening).
//!
//! TODO (gedeeld met de hout-crate): `ResistanceCalc`, `NamedValue`,
//! `UnityCheck` en `CheckStatus` wonen nu in `nen-en-1993-1-1-section`; ze
//! zijn materiaal-neutraal en horen in een gedeelde `check-core` crate.

pub mod bending;
pub mod checks;
pub mod data;
pub mod factors;
pub mod mnkappa;
pub mod section;
pub mod stiffness;
pub mod stress_strain;

pub use data::{
    concrete_class_by_name, reinforcement_grade_by_name, ConcreteClass, DuctilityClass,
    ReinforcementGrade, CONCRETE_CLASSES, REINFORCEMENT_GRADES,
};
pub use factors::{DesignSituation, ALPHA_CC, E_S, GAMMA_CE};
// De M-N-κ-motor op crate-niveau: `solve_state`, `internal_forces`,
// `exceeded_limit` en `MnKappaOptions` waren alleen via `mnkappa::…`
// bereikbaar. De stijfheidslaag gebruikt ze, en wie de kern van buiten
// aanroept ook.
pub use mnkappa::{
    axial_compression_capacity_kn, axial_tension_capacity_kn, exceeded_limit, interaction_diagram,
    internal_forces, mn_kappa_diagram, solve_eps0, solve_state, FailureMode, InteractionPoint,
    InternalForces, MnKappaDiagram, MnKappaOptions, MnKappaPoint, SectionState, DEFAULT_N_STRIPS,
    MAX_N_STRIPS,
};
pub use section::{RebarLayer, RebarRow, RectConcreteSection, ReinforcementCage};
pub use stiffness::{
    ei_secant, kappa_from_nm, m0_knm, m_cr_knm, KappaSolution, LoadDuration, SecantStiffness,
    SolveMethod, StiffnessError, StiffnessOptions, TensionStiffening,
};
pub use stress_strain::{
    ConcreteNonlinearCurve, ConcreteTension, DesignMaterial, NonlinearBasis, SteelBranch,
};

// Hergebruikte resultaattypen (zie TODO in de crate-doc).
pub use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};
