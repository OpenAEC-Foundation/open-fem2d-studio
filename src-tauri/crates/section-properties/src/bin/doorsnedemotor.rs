//! `doorsnedemotor` — de doorsnedemotor als los programma.
//!
//! Alleen de schil: lezen van stdin of een bestand, `opdracht::reken` erop
//! loslaten, schrijven naar stdout of een bestand. De rekengang zelf staat in
//! `section_properties::opdracht`, zodat het generatiescript, de dev-server en
//! de desktop-app alle drie dezelfde code gebruiken. Zie die module voor het
//! invoerformaat.
//!
//! ```text
//! cargo run -q -p section-properties --bin doorsnedemotor -- invoer.json uitvoer.json
//! ```
//!
//! Zonder argumenten leest hij stdin en schrijft hij stdout. Een fout gaat
//! naar stderr met afsluitcode 2.

use std::io::{Read, Write};

use section_properties::opdracht::{reken, Invoer};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let bron = match args.first() {
        Some(p) => std::fs::read_to_string(p).unwrap_or_else(|e| {
            eprintln!("kan {p} niet lezen: {e}");
            std::process::exit(2);
        }),
        None => {
            let mut s = String::new();
            std::io::stdin().read_to_string(&mut s).expect("stdin");
            s
        }
    };

    let invoer: Vec<Invoer> = serde_json::from_str(&bron).unwrap_or_else(|e| {
        eprintln!("invoer is geen geldige JSON-array van geometrieën: {e}");
        std::process::exit(2);
    });

    let mut uit = Vec::with_capacity(invoer.len());
    for i in &invoer {
        match reken(i) {
            Ok(u) => uit.push(u),
            Err(e) => {
                eprintln!("{}: {e}", naam_van(i));
                std::process::exit(2);
            }
        }
    }

    let tekst = serde_json::to_string(&uit).expect("serialiseren");
    match args.get(1) {
        Some(p) => std::fs::write(p, tekst).unwrap_or_else(|e| {
            eprintln!("kan {p} niet schrijven: {e}");
            std::process::exit(2);
        }),
        None => {
            let stdout = std::io::stdout();
            let mut l = stdout.lock();
            l.write_all(tekst.as_bytes()).expect("stdout");
            l.write_all(b"\n").expect("stdout");
        }
    }
}

/// Naam van een geometrie voor een foutregel; leeg blijft leeg.
fn naam_van(i: &Invoer) -> &str {
    i.naam()
}
