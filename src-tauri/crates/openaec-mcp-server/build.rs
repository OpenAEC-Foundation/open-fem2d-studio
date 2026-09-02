//! Bouwpoort op de solverbundel.
//!
//! WAAROM DIT BESTAAT
//! `assets/fem-kernel.mjs` is een GEGENEREERD artefact dat toch in versiebeheer
//! staat, omdat `sidecar.rs` hem met `include_str!` in de binary bakt. Daardoor
//! kan er nooit een oude bundel naast een nieuwe binary staan — er is precies
//! één artefact. De keerzijde is dat juist dit bestand stil oud kan worden:
//! iemand past `engine.ts` aan, vergeet `npm run build:sidecar`, en de binary
//! rekent voort met de vorige rekenkern zonder dat iets dat meldt.
//!
//! Daar liggen drie sloten op. Dit is het EERSTE, en het enige dat al vóór een
//! commit toeslaat:
//!   1. deze bouwpoort — de build faalt lokaal zodra bundel en hashbestand niet
//!      bij elkaar horen;
//!   2. CI herbouwt de bundel en vergelijkt byte-voor-byte (taak T15);
//!   3. de runtime-handshake weigert een bundel met een andere hash.
//!
//! Deze poort vergelijkt bundel ↔ hashbestand. Hij kan NIET zien of de bundel
//! bij de huidige TypeScript-bron hoort — dat is wat slot 2 doet. Wie hier een
//! groene build ziet weet dus: de ingebakken bundel is de bundel waarvan de
//! hash naast hem ligt, niet meer en niet minder.

use sha2::{Digest, Sha256};
use std::path::Path;

fn main() {
    let map = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets");
    let bundel = map.join("fem-kernel.mjs");
    let hashbestand = map.join("fem-kernel.sha256");

    // Zonder deze twee regels draait de poort alleen bij een schone build en
    // glipt een gewijzigde bundel er ongemerkt langs.
    println!("cargo:rerun-if-changed={}", bundel.display());
    println!("cargo:rerun-if-changed={}", hashbestand.display());

    let bytes = std::fs::read(&bundel).unwrap_or_else(|fout| {
        paniek(&format!(
            "de solverbundel `{}` kon niet worden gelezen ({fout}).\n\
             Bouw hem met:  cd design-mockup && npm run build:sidecar",
            bundel.display()
        ))
    });

    let verwacht_ruw = std::fs::read_to_string(&hashbestand).unwrap_or_else(|fout| {
        paniek(&format!(
            "het hashbestand `{}` kon niet worden gelezen ({fout}).\n\
             Bouw de bundel opnieuw met:  cd design-mockup && npm run build:sidecar",
            hashbestand.display()
        ))
    });

    // sha256sum-formaat: "<hex>  <bestandsnaam>". Alleen het eerste veld telt.
    let verwacht = verwacht_ruw
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    if verwacht.len() != 64 || !verwacht.chars().all(|c| c.is_ascii_hexdigit()) {
        paniek(&format!(
            "`{}` bevat geen SHA-256 in sha256sum-formaat (\"<64 hex>  fem-kernel.mjs\").\n\
             Gevonden: {verwacht_ruw:?}",
            hashbestand.display()
        ));
    }

    let gevonden = hex(&Sha256::digest(&bytes));
    if gevonden != verwacht {
        paniek(&format!(
            "de ingebakken solverbundel hoort niet bij zijn hashbestand.\n\
             \n\
               bundel     : {} ({} bytes)\n\
               berekend   : {gevonden}\n\
               verwacht   : {verwacht}   (uit {})\n\
             \n\
             Dit betekent dat de bundel is gewijzigd zonder herbouw, of dat het\n\
             hashbestand achterloopt. De build stopt hier met opzet: een binary\n\
             met een onbekende rekenkern zou constructieve resultaten leveren die\n\
             niemand aan een bron kan koppelen.\n\
             \n\
             Herstellen:  cd design-mockup && npm run build:sidecar",
            bundel.display(),
            bytes.len(),
            hashbestand.display()
        ));
    }

    println!("cargo:rustc-env=OPENAEC_FEM_KERNEL_SHA256={gevonden}");
}

/// Laat de build stoppen met een leesbare, Nederlandse uitleg.
///
/// `panic!` in een build-script drukt de melding af als build-fout; het `\n`-
/// gebruik hierboven houdt hem leesbaar in de cargo-uitvoer.
fn paniek(melding: &str) -> ! {
    panic!("\n\nSOLVERBUNDEL AFGEKEURD\n\n{melding}\n\n");
}

fn hex(bytes: &[u8]) -> String {
    let mut uit = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write as _;
        let _ = write!(uit, "{b:02x}");
    }
    uit
}
