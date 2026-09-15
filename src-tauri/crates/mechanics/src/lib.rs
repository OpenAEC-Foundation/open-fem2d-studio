//! Mechanics primitives — force/moment structures, beam axis, force envelopes.
//! Used as foundation by all higher crates. No application-specific deps.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Internal forces at a point along a beam.
/// Sign convention: N positive = tension; My positive = bottom fibre tension.
/// Units: kN (forces), kNm (moments).
///
/// "Onder" is hier een LOKAAL begrip: de zijde tegenover lokaal +y, dat 90°
/// tegen de klok in vanaf de staafas staat. Het wordt pas een wereldbegrip
/// doordat de aanroeper elke staaf in zijn REFERENTIERICHTING aanlevert —
/// een liggende staaf van links naar rechts, een staande staaf (75° of meer
/// met de horizontaal) van voet naar kop; zie
/// `design-mockup/src/lib/referentierichting.ts`. Bij een liggende staaf is
/// "onder" dan letterlijk de onderzijde. Bij een staande staaf ligt "onder"
/// aan de RECHTERzijde en "boven" aan de linkerzijde; [`Staafstand`] laat de
/// afleiding dat in wereldtermen zeggen.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct InternalForces {
    pub n_ed: f64,
    pub vy_ed: f64,
    pub vz_ed: f64,
    pub mt_ed: f64,
    pub my_ed: f64,
    pub mz_ed: f64,
}

/// Beam local axis frame.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct BeamAxis {
    pub length_m: f64,
    pub orientation_rad: f64,
}

/// One sample point along a beam: position (mm from start) + governing
/// internal forces at that location for some load combination.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct ForcePoint {
    pub combination_id: u32,
    pub position_mm: f64,
    pub forces: InternalForces,
}

/// Snapshot of force state at a single check location — used in derivation reports.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub struct ForceStateSnapshot {
    pub combination_id: u32,
    pub position_mm: f64,
    pub forces: InternalForces,
}

impl ForceStateSnapshot {
    pub fn from_point(p: &ForcePoint) -> Self {
        Self {
            combination_id: p.combination_id,
            position_mm: p.position_mm,
            forces: p.forces,
        }
    }
}

/// Hoe een staaf in het vlak van het model staat. Rekent nergens mee: het
/// bepaalt alleen hoe een afleiding de zijden van de doorsnede benoemt.
///
/// WAAROM. De krachten komen in de referentierichting van de staaf binnen
/// (zie [`InternalForces`]). Bij een liggende staaf zijn "boven" en "onder"
/// daarmee wereldtermen. Bij een staande staaf zijn ze dat niet: gerekend van
/// voet naar kop ligt de lokale onderzijde — waar een positief moment trek
/// geeft, waar de onderwapening en de onderflens zitten — aan de RECHTERzijde
/// van de staaf zoals hij in het model staat, en de bovenzijde links. Een
/// afleiding die dan "onderwapening" of "BOVENflens gedrukt" schrijft, hoort
/// erbij te zeggen welke kant dat is.
///
/// De grens van 75° is die van `isOverwegendVerticaal` in de frontend, die op
/// zijn beurt dezelfde is als die van het staaftype; er is geen derde regel.
///
/// Ontbreekt het veld in een invoer, dan geldt [`Staafstand::Liggend`]: dat is
/// het gedrag van vóór dit type, en de benaming boven/onder is dan letterlijk.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../design-mockup/src/lib/types/steel/")]
pub enum Staafstand {
    /// Minder dan 75° met de horizontaal; gerekend van links naar rechts.
    #[default]
    Liggend,
    /// 75° of meer met de horizontaal; gerekend van voet naar kop. "Onder" is
    /// dan de rechterzijde, "boven" de linkerzijde.
    Staand,
}
