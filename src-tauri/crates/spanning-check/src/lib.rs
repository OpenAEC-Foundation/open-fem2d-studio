//! `spanning-check` — de vrije spanningstoets: een doorsnede, een materiaal
//! met alleen een toelaatbare spanning, en de vergelijkspanning van von Mises.
//!
//! # Waarom deze kern naast de normkernen bestaat
//!
//! De app heeft drie normkernen: EN 1993 (staal), EN 1995 (hout, inclusief
//! kruislaaghout) en EN 1992 (beton). Elk daarvan hoort bij één materiaal met
//! één normenkader. Wie een materiaal invoert dat in géén van die kaders
//! valt — natuursteen, een gietstuk, een kunststof, of gewoon "even staal op
//! spanning kijken" — kan daar niets mee.
//!
//! Deze kern is die vierde, NORM-ONAFHANKELIJKE route. Hij vraagt precies
//! twee dingen: een doorsnede en een toelaatbare spanning. Daarmee rekent hij
//! per station en per vezel over de hoogte de normaalspanning, de
//! schuifspanning en de vergelijkspanning uit, en levert hij naast de unity
//! check het volledige spanningsverloop terug, zodat de doorsnede mét dat
//! verloop getekend kan worden.
//!
//! # Wat hij NIET doet — en waarom dat expliciet is
//!
//! - Geen doorsnedeklassificatie, geen plooi. Er is geen norm die zegt hoe
//!   slank een wand van een onbekend materiaal mag zijn.
//! - Geen knik, kip of tweede-ordeeffecten. Die vragen om een
//!   materiaalgebonden knikkromme en imperfectiewaarde.
//! - Geen doorbuigingsgrens. Die is een gebruiksgrenstoestandsafspraak, geen
//!   spanningsvraag.
//! - Geen belastingduur- of klimaatfactoren.
//!
//! Wie die dingen nodig heeft, hoort in een normkern thuis. Dat staat als
//! notitie in elk resultaat, zodat het rapport het meedraagt.
//!
//! # Contract
//!
//! Zelfde vorm als de andere kernen: `NamedCheck { id, kind }` met daarin een
//! `ResistanceCalc` (uit `nen-en-1993-1-1-section`), zodat het
//! toetsingspaneel en het rapport er zonder vertakking mee overweg kunnen.

pub mod doorsnede;
pub mod input;
pub mod result;
pub mod toets;

pub use doorsnede::{Catalogus, Lagenmodel, Rechthoek, SpanningDoorsnede, SpanningLaag};
pub use input::SpanningBeamCheckInput;
pub use result::{
    SpanningBeamCheckResult, SpanningDoorsnedeResultaat, SpanningVerloop, SpanningVezel,
};
pub use toets::{check_all_spanning_beams, check_spanning_beam, sigma_eq};
