//! NEN-EN 1995-1-1:2005+A2:2014+NB:2013 — toetsing van houten staven.
//!
//! De aanduiding hierboven stond tot september 2026 als
//! "NEN-EN 1995-1-1+C1+A1:2011/NB:2013" in deze regel: de aanduiding van de
//! nationale bijlage alléén, en van vóór A2:2014. Ze hoort gelijk te zijn aan
//! `nationale_bijlage::Aanduidingen::norm_hout_vol`, de enige plek waar de
//! aanduiding werkelijk wordt bepaald.
//!
//! Alle formules zijn losse, herbruikbare functies. Elke toets levert een
//! [`ResistanceCalc`] of [`StabilityCalc`] met volledige afleiding
//! (variabelen, tussenwaarden, unity check), hetzelfde contract als de
//! staaltoetsen zodat het rapport één weergavepad houdt.
//!
//! TODO: `ResistanceCalc`, `StabilityCalc`, `NamedValue`, `UnityCheck` en
//! `CheckStatus` worden hergebruikt uit `nen-en-1993-1-1-section` /
//! `nen-en-1993-1-1-stability`. Die typen zijn materiaal-neutraal maar wonen
//! nu in staal-crates; verhuis ze later naar een gedeelde `check-core` crate.
//!
//! Verificatiestatus: de geïmplementeerde formules zijn per stuk getoetst
//! tegen de referentie-uitwerking (houten raamwerk, C24 96x450) of tegen de
//! normtekst zoals die letterlijk in de referentie-uitwerking is afgedrukt.
//! Onderdelen die niet tegen een van beide konden worden onderbouwd, zijn in
//! hun doc-comment expliciet als NIET-GEVERIFIEERD gemarkeerd.

/// De nationaal bepaalde parameters bij NEN-EN 1995-1-1, uit de normnaad.
///
/// γ_M (2.4.1), k_cr (6.1.7) en de doorbuigingsnoemers (7.2) zijn nationaal
/// bepaald en staan daarom bij elkaar in de crate `nationale-bijlage`, met het
/// NB-artikel erbij. k_mod (tabel 3.1) en k_def (tabel 3.2) horen daar juist
/// NIET bij: die legt de Eurocode zelf vast en ze blijven in `factors`.
pub(crate) const NDP: nationale_bijlage::Ndp1995 =
    nationale_bijlage::Ndp1995::voor(nationale_bijlage::NationaleBijlage::NL);

pub mod data;
pub mod factors;
pub mod section;
pub mod compression;
pub mod bending;
pub mod shear;
pub mod stability;
pub mod deflection;
pub mod clt; pub mod clt_toets; // kruislaaghout: doorsnedemodel + toetsing per lamel

pub use data::{strength_class_by_name, strength_class_names, StrengthClass};
pub use factors::{
    beta_c, design_strength, gamma_m, k_def, k_h, k_m, k_mod, k_sys,
    LoadDurationClass, ServiceClass, TimberType,
};
pub use section::TimberSection;

// Hergebruikte resultaattypen (zie TODO in de crate-doc).
pub use nen_en_1993_1_1_section::{CheckStatus, NamedValue, ResistanceCalc, UnityCheck};
pub use nen_en_1993_1_1_stability::StabilityCalc;
