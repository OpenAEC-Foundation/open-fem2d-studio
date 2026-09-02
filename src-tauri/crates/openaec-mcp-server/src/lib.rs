//! Bibliotheekdeel van `openaec-mcp-server`.
//!
//! De server zelf is een binary (`src/main.rs`). Dit libdeel bestaat om één
//! reden: een integratietest in `tests/` kan niet bij een module van een
//! binary-crate. De aansturing van de solver-sidecar — het zoeken van Node, de
//! hashpoort op de bundel, de klok — is precies het stuk dat aantoonbaar
//! getest moet zijn, dus staat het hier waar `tests/sidecar.rs` erbij kan.
//!
//! Er is geen tweede implementatie: de binary gebruikt dezelfde module.

pub mod sidecar;
