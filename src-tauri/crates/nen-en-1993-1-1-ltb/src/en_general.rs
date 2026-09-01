//! Algemene EN 1993-1-1-formule voor het kritieke kipmoment.
//!
//! Alternatief voor de Nederlandse NB-methode in [`crate::nb_annex`]. De
//! NB-methode is leidend voor toetsingen volgens NEN-EN 1993-1-1/NB:2016;
//! deze formule is bedoeld voor gevallen die buiten de NB-figuren vallen.

use std::f64::consts::PI;
use crate::nb_annex::{E_MPA, G_MPA};

/// Kritiek kipmoment voor een dubbelsymmetrisch profiel, belast op het
/// zwaartepunt, met vorkopleggingen:
///
/// M_cr = C₁ · π²·E·I_z / L_cr² · √( I_w/I_z + L_cr²·G·I_t / (π²·E·I_z) )
///
/// Resultaat in kNm.
pub fn m_cr_algemeen(c1: f64, l_cr_mm: f64, iz_mm4: f64, iw_mm6: f64, it_mm4: f64) -> f64 {
    if l_cr_mm <= 0.0 || iz_mm4 <= 0.0 { return 0.0; }
    let voorfactor = c1 * PI.powi(2) * E_MPA * iz_mm4 / l_cr_mm.powi(2);
    let onder_wortel = iw_mm6 / iz_mm4
        + l_cr_mm.powi(2) * G_MPA * it_mm4 / (PI.powi(2) * E_MPA * iz_mm4);
    voorfactor * onder_wortel.sqrt() * 1e-6
}

/// Keuze van de M_cr-methode.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum McrMethode {
    /// NEN-EN 1993-1-1/NB:2016 nl — NB.NB.2 e.v. (standaard).
    #[default]
    NederlandseBijlage,
    /// Algemene EN 1993-1-1-formule.
    AlgemeenEN,
}
