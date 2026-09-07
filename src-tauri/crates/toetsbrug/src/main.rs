//! `toetsbrug` — de binary. Alleen stdin/stdout; de opdrachtafhandeling zelf
//! staat in het libdeel (`lib.rs`), zodat een test erbij kan zonder een proces
//! te starten. Zie de crate-doc daar voor de achtergrond.
//!
//! ```text
//! echo '{"opdracht":"check_steel_beams","inputs":[…]}' | toetsbrug
//! ```
//!
//! Invoer op stdin, uitvoer op stdout, beide JSON. Een fout komt terug als
//! `{"fout": "…"}` met afsluitcode 1; de aanroeper hoeft stderr niet te lezen.

use std::io::{Read, Write};

use serde_json::{json, Value};
use toetsbrug::{behandel, Verzoek};

fn main() {
    let mut ruw = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut ruw) {
        klaar(Err(format!("stdin niet leesbaar: {e}")));
    }

    let verzoek: Verzoek = match serde_json::from_str(&ruw) {
        Ok(v) => v,
        Err(e) => klaar(Err(format!("verzoek niet te lezen: {e}"))),
    };

    klaar(behandel(verzoek));
}

/// Schrijf het antwoord en stop. Een fout gaat als JSON naar stdout, zodat de
/// aanroeper altijd hetzelfde formaat krijgt.
fn klaar(uitkomst: Result<Value, String>) -> ! {
    let (tekst, code) = match uitkomst {
        Ok(v) => (v.to_string(), 0),
        Err(f) => (json!({ "fout": f }).to_string(), 1),
    };
    let mut uit = std::io::stdout();
    let _ = uit.write_all(tekst.as_bytes());
    let _ = uit.flush();
    std::process::exit(code);
}
