//! NEN-EN 1992-1-1:2005+A1:2015+NB:2016+A1:2020 — gewapend beton.
//!
//! Deze crate bevat de rekenregels voor de doorsnedeberekening van een
//! gewapend-betonnen doorsnede — rechthoek, T of L — met een wapeningskorf:
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
//! * [`section`] — de doorsnede en de wapeningskorf (dekking, beugel, boven-
//!   en onderwapening) → wapeningslagen met hun ligging. De doorsnede is
//!   intern een kleine reeks horizontale BANDEN met elk een breedte en een
//!   hoogtebereik; twee banden volstaan voor rechthoek, T en L. De vorm
//!   ([`ConcreteShape`]) is een etiket voor het rapport, geen rekengegeven —
//!   b(z) van een T en een L zijn in dit uniaxiale model identiek. Wat dat
//!   voor de L betekent, levert [`ConcreteSection::assumptions`] als tekst mee;
//! * [`mnkappa`] — de M-N-κ-berekening: voor een gegeven normaalkracht en
//!   kromming de rekverdeling, de spanningen per strook en per laag en het
//!   resulterende moment; daaruit het M-κ-diagram bij vaste N tot bezwijken,
//!   en het N-M-interactiediagram;
//! * [`bending`] — de momentweerstand met de rechthoekige spanningsverdeling
//!   (de klassieke handberekening, 3.1.7(3));
//! * [`checks`] — de toetsen als [`ResistanceCalc`], met formule, variabelen
//!   en unity check, in hetzelfde contract als de staal- en houttoetsen;
//! * [`deelstappen`] — diezelfde toetsen als UITGESCHREVEN AFLEIDING: per stap
//!   de formule symbolisch, de ingevulde waarden, de uitkomst, de vindplaats en
//!   de aannamen die eronder liggen. De module rekent niets opnieuw uit; zij
//!   schrijft op wat [`bending`] en [`mnkappa`] al bepaald hebben;
//! * [`beff`] — de meewerkende flensbreedte van 5.3.2.1: l₀ per gebied uit
//!   figuur 5.2 en b_eff uit (5.7)/(5.7a)/(5.7b);
//! * [`beff_deelstappen`] — diezelfde afleiding UITGESCHREVEN, in hetzelfde
//!   patroon als [`deelstappen`] en met dezelfde regel: niets wordt opnieuw
//!   uitgerekend. Zonder die keten staat er in het rapport wel de gebruikte
//!   b_eff maar niet waarom hij kleiner is dan de ingevoerde flensbreedte;
//! * [`dekking`] — de betondekking van 4.4.1: de milieuklassen van tabel 4.1,
//!   c_min,dur uit de door de nationale bijlage voorgeschreven tabel 4.4N, en
//!   daaruit c_min (4.2) en de vereiste c_nom (4.1). De dekking was tot dan
//!   toe alleen een geometrisch gegeven voor de nuttige hoogte d.
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

pub mod beff;
pub mod beff_deelstappen;
pub mod bending;
pub mod checks;
pub mod data;
pub mod deelstappen;
pub mod dekking;
pub mod factors;
pub mod mnkappa;
pub mod section;
pub mod stiffness;
pub mod stress_strain;

// De meewerkende flensbreedte (5.3.2.1). Op crate-niveau omdat de drie wegen
// — Tauri-command, toetsbrug en MCP-server — hem alle drie rechtstreeks
// aanroepen; zie `beff`.
pub use beff::{
    beff_distribution, effective_flange_width, effective_flange_width_request, l0_zones, BeamLine,
    BeffApplied, BeffAtL0, BeffBound, BeffDistribution, BeffError, BeffPart, BeffZone,
    EffectiveFlangeWidthRequest, EffectiveFlangeWidthResponse, FlangeGeometry, L0Case, L0Zone,
    LineEnd,
};
pub use beff_deelstappen::beff_deelstappen;
pub use data::{
    concrete_class_by_name, reinforcement_grade_by_name, ConcreteClass, DuctilityClass,
    ReinforcementGrade, CONCRETE_CLASSES, REINFORCEMENT_GRADES,
};
// De betondekking (4.4.1). Op crate-niveau om dezelfde reden als `beff`: de
// drie wegen roepen hem alle drie rechtstreeks aan.
pub use dekking::{
    c_min_dur_mm, concrete_cover_request, ConcreteCoverRequest, ConcreteCoverResponse,
    CoverGovernedBy, ExposureClass, ExposureClassInfo, StructuralClass, EXPOSURE_CLASSES,
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
pub use section::{
    mirrored_layers, Band, ConcreteSection, ConcreteSectionInput, ConcreteShape, RebarLayer,
    RebarRow, RectConcreteSection, ReinforcementCage,
};
pub use stiffness::{
    ei_secant, kappa_from_nm, m0_knm, m_cr_knm, KappaSolution, LoadDuration, SecantStiffness,
    SolveMethod, StiffnessError, StiffnessOptions, TensionStiffening,
};
pub use stress_strain::{
    ConcreteNonlinearCurve, ConcreteTension, DesignMaterial, NonlinearBasis, SteelBranch,
};

// Hergebruikte resultaattypen (zie TODO in de crate-doc). `Deelstap` hoort in
// dat rijtje thuis: hij is materiaal-neutraal en draagt bij zowel de kipketen
// van EN 1993 als de doorsnedeketen van EN 1992 één stap van een afleiding.
pub use nen_en_1993_1_1_section::{
    CheckStatus, Deelstap, NamedValue, ResistanceCalc, UnityCheck,
};
