//! Drie-wegen-verificatie voor de betontoetsing.
//!
//! DE REGEL
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. de MCP-server (deze crate).
//!
//! Drie wegen betekenen drie kansen dat er één uit de pas loopt: een weg die
//! een veld anders leest, een andere standaardwaarde invult, of een andere
//! functie aanroept. Dan geeft dezelfde doorsnede twee plausibele antwoorden en
//! is niet te zien welk van de twee klopt. Deze test sluit dat af: dezelfde
//! JSON-invoer gaat door alle drie de wegen en de antwoorden moeten
//! GELIJK zijn, veld voor veld.
//!
//! HOE ELKE WEG WORDT AANGESPROKEN
//! * **Weg 3 (MCP)** het echtst: de test start de werkelijke binary, doet de
//!   `initialize`-handshake en roept `tools/call` aan over stdio. Er wordt niets
//!   omzeild.
//! * **Weg 2 (toetsbrug)** roept `toetsbrug::behandel` aan — dezelfde functie
//!   die de binary op elke regel stdin uitvoert. Alleen het proces eromheen
//!   ontbreekt; de opdrachtnaam, het lezen van `inputs` en het antwoord zijn
//!   die van de echte toetsbrug.
//! * **Weg 1 (Tauri-command)** kan niet als command worden aangeroepen zonder de
//!   hele Tauri-runtime op te tuigen. Daarom twee dingen: de rekengang van het
//!   command wordt hier letterlijk uitgevoerd
//!   (`concrete_check::check_all_concrete_beams`, precies de body van
//!   `check_concrete_beams`), én de bedrading wordt gecontroleerd op de bron
//!   van `src-tauri/src/lib.rs`. Dat laatste is de enige plek waar deze weg
//!   kan breken zonder dat de rekengang verandert: een command dat niet in
//!   `generate_handler!` staat, bestaat voor de app niet.
//!
//! DE GETALLEN
//! De invoer is de referentiedoorsnede uit
//! `concrete-check/tests/referentie_balk.rs` en
//! `nen-en-1992-1-1/tests/handberekening.rs`: 300 × 500 mm, C30/37, B500B,
//! dekking 30 mm, beugel Ø8, onder 3Ø16, boven 2Ø12. Hier is geen getal
//! verzonnen. De ankerwaarden onderaan pinnen de uitkomst vast, zodat deze test
//! ook merkt dat alle drie de wegen tegelijk verschuiven.
//!
//! WEGLATEN IS OOK EEN TEST
//! De optionele velden (`n_strips`, `steel_branch`, `design_situation`,
//! `apply_min_eccentricity`) staan met opzet NIET in de invoer. Zo toont de
//! test aan dat de drie wegen dezelfde standaardwaarden invullen — een weg die
//! zijn eigen default zou kiezen, valt hier door de mand.
//!
//! STAAL HEEFT ZO'N TEST NOG NIET. Voor `check_steel_beam`/`check_steel_beams`
//! bestaat geen vergelijking tussen de drie wegen; `tests/schema_strikt.rs`
//! toetst alleen de MCP-weg. Deze test is naar vorm bruikbaar om die er alsnog
//! bij te maken.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

// ── De invoer ───────────────────────────────────────────────────────────────

/// De wapeningskorf van de referentiedoorsnede.
fn korf() -> Value {
    json!({
        "cover_mm": 30,
        "stirrup_diameter_mm": 8,
        "top": { "count": 2, "diameter_mm": 12 },
        "bottom": { "count": 3, "diameter_mm": 16 }
    })
}

/// Vrij opgelegde balk, veldmoment 100 kNm, geen normaalkracht.
fn invoer_balk() -> Value {
    json!({
        "beam_id": 7,
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "length_m": 5,
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 0,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 80, "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } },
            { "combination_id": 1, "position_mm": 2500,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0, "mt_ed": 0, "my_ed": 100, "mz_ed": 0 } },
            { "combination_id": 1, "position_mm": 5000,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": -80, "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } }
        ]
    })
}

/// Kolom onder 800 kN druk met een moment van 60 kNm. Andere tak van de
/// orchestrator dan de balk: het drukpunt telt mee en de minimale
/// excentriciteit van 6.1(4) kan het overnemen.
fn invoer_kolom() -> Value {
    json!({
        "beam_id": 3,
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "length_m": 3,
        "forces_envelope": [
            { "combination_id": 2, "position_mm": 0,
              "forces": { "n_ed": -800, "vy_ed": 0, "vz_ed": 20, "mt_ed": 0, "my_ed": 60, "mz_ed": 0 } },
            { "combination_id": 2, "position_mm": 3000,
              "forces": { "n_ed": -800, "vy_ed": 0, "vz_ed": -20, "mt_ed": 0, "my_ed": 20, "mz_ed": 0 } }
        ]
    })
}

/// **De T-ligger.** Dezelfde doorsnede als
/// `nen-en-1992-1-1/tests/vormen.rs::drukzone_in_het_lijf_handberekening`:
/// T 400 × 450 met een flens van 50 mm en een lijf van 200 mm, 4Ø20 onder.
/// Bij 150 kNm loopt het spanningsblok de flens uit, dus dit is precies het
/// geval waarin een rechthoekaanname zichtbaar het verkeerde antwoord geeft.
///
/// De korf hangt aan de VORM: 4Ø20 = 80 mm staal past in het lijf (binnenmaat
/// 200 − 2·38 = 124 mm), maar 8Ø20 zou dat niet doen. Dat de korfcontrole naar
/// de breedte op de hoogte van de rij kijkt, is dus onderdeel van deze weg.
fn korf_t() -> Value {
    json!({
        "cover_mm": 30,
        "stirrup_diameter_mm": 8,
        "top": { "count": 0, "diameter_mm": 0 },
        "bottom": { "count": 4, "diameter_mm": 20 }
    })
}

fn invoer_t_ligger() -> Value {
    json!({
        "beam_id": 9,
        "section": {
            "shape": "Tee",
            "b_mm": 400,
            "h_mm": 450,
            "b_w_mm": 200,
            "h_f_mm": 50
        },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf_t(),
        "length_m": 6,
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 0,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 100, "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } },
            { "combination_id": 1, "position_mm": 3000,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0, "mt_ed": 0, "my_ed": 150, "mz_ed": 0 } },
            { "combination_id": 1, "position_mm": 6000,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": -100, "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } }
        ]
    })
}

/// Dezelfde T als segmentstijfheidsverzoek, ronde 0: alleen de indeling en de
/// ongescheurde vergelijkingsstijfheid E_cd·I_c.
fn invoer_t_segmenten() -> Value {
    json!({
        "beam_id": 9,
        "section": {
            "shape": "Tee",
            "b_mm": 400,
            "h_mm": 450,
            "b_w_mm": 200,
            "h_f_mm": 50
        },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf_t(),
        "length_m": 6
    })
}

/// M-N-κ van dezelfde korf bij 800 kN druk.
fn invoer_mn_kappa() -> Value {
    json!({
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "n_ed_kn": -800,
        "interaction_points": 11
    })
}

/// Segmentstijfheden, ronde 0: geen krachten, dus alleen de indeling. Alle
/// instelbare velden zijn met opzet weggelaten — zo toont de test aan dat de
/// drie wegen dezelfde standaardwaarden invullen, inclusief de 400 mm van
/// besluit B3 en φ_ef = 0 van besluit B1.
fn invoer_segmenten_ronde0() -> Value {
    json!({
        "beam_id": 5,
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "length_m": 4.3
    })
}

/// Dezelfde staaf, nu mét de krachten van de vorige ronde. 11 segmenten (de
/// indeling van ronde 0), een kolom onder 800 kN druk met een moment dat naar
/// het midden toe oploopt.
fn invoer_segmenten_ronde1() -> Value {
    let momenten: Vec<f64> = (0..11)
        .map(|i| {
            // Parabolisch verloop met een top van 60 kNm in het midden.
            let x = (i as f64 + 0.5) / 11.0;
            60.0 * 4.0 * x * (1.0 - x)
        })
        .collect();
    let krachten: Vec<Value> = momenten
        .iter()
        .map(|m| json!({ "n_ed_kn": -800.0, "m_ed_knm": m }))
        .collect();
    let mut v = invoer_segmenten_ronde0();
    v["segment_forces"] = json!(krachten);
    v
}

// ── Weg 1: de rekengang achter het Tauri-command ────────────────────────────

/// Letterlijk de body van `check_concrete_beams` uit `src-tauri/src/lib.rs`.
fn weg_tauri_check(invoer: &Value) -> Value {
    let inputs: Vec<concrete_check::ConcreteBeamCheckInput> =
        serde_json::from_value(json!([invoer])).expect("ConcreteBeamCheckInput");
    let uit = concrete_check::check_all_concrete_beams(inputs);
    serde_json::to_value(&uit[0]).expect("resultaat serialiseren")
}

/// Letterlijk de body van `concrete_mn_kappa` uit `src-tauri/src/lib.rs`.
fn weg_tauri_mn_kappa(invoer: &Value) -> Value {
    let req: concrete_check::MnKappaRequest =
        serde_json::from_value(invoer.clone()).expect("MnKappaRequest");
    let uit = concrete_check::mn_kappa(req).expect("geldig verzoek");
    serde_json::to_value(uit).expect("resultaat serialiseren")
}

/// Letterlijk de body van `concrete_segment_stiffness` uit
/// `src-tauri/src/lib.rs`.
fn weg_tauri_segmenten(invoer: &Value) -> Value {
    let req: concrete_check::SegmentStiffnessRequest =
        serde_json::from_value(invoer.clone()).expect("SegmentStiffnessRequest");
    let uit = concrete_check::segment_stiffness(req).expect("geldig verzoek");
    serde_json::to_value(uit).expect("resultaat serialiseren")
}

/// De bron van het Tauri-pakket, om de bedrading te controleren.
fn tauri_lib_bron() -> String {
    let pad = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("src")
        .join("lib.rs");
    std::fs::read_to_string(&pad)
        .unwrap_or_else(|e| panic!("{} niet leesbaar: {e}", pad.display()))
}

// ── Weg 2: de toetsbrug ─────────────────────────────────────────────────────

/// Dezelfde functie die de toetsbrug-binary op zijn invoer uitvoert.
fn weg_toetsbrug(opdracht: &str, inputs: Value) -> Value {
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": opdracht, "inputs": inputs }))
            .expect("toetsbrug-verzoek");
    toetsbrug::behandel(verzoek).unwrap_or_else(|e| panic!("toetsbrug {opdracht}: {e}"))
}

// ── Weg 3: de MCP-server over stdio ─────────────────────────────────────────

async fn lees_bericht<R>(reader: &mut R) -> Value
where
    R: AsyncBufReadExt + Unpin,
{
    let mut regel = String::new();
    let n = timeout(Duration::from_secs(60), reader.read_line(&mut regel))
        .await
        .expect("timeout bij het wachten op een antwoord")
        .expect("read_line mislukt");
    assert!(n > 0, "EOF op stdout — de server is onverwacht gestopt");
    serde_json::from_str(regel.trim())
        .unwrap_or_else(|e| panic!("ongeldige JSON-RPC-regel {regel:?}: {e}"))
}

async fn schrijf(stdin: &mut ChildStdin, waarde: Value) {
    let mut regel = serde_json::to_string(&waarde).unwrap();
    regel.push('\n');
    stdin.write_all(regel.as_bytes()).await.unwrap();
    stdin.flush().await.unwrap();
}

async fn start_server() -> (Child, ChildStdin, BufReader<ChildStdout>) {
    let mut child = Command::new(BIN_PATH)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("server starten");
    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let mut reader = BufReader::new(stdout);

    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "drie-wegen-beton", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Roep één tool aan en geef `structuredContent` terug. Een toolfout laat de
/// test vallen met de melding erbij — een fout mag hier nooit als "leeg
/// resultaat" doorglippen.
async fn weg_mcp(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    tool: &str,
    argumenten: Value,
) -> Value {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": tool, "arguments": argumenten }
        }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    let result = &resp["result"];
    assert_eq!(
        result["isError"], false,
        "MCP-tool {tool} gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    result["structuredContent"].clone()
}

// ── Vergelijking ────────────────────────────────────────────────────────────

/// Eerste verschil tussen twee antwoorden, met het pad erbij. `None` = gelijk.
///
/// Bewust géén `assert_eq!` op de hele boom: die drukt bij een
/// betontoetsresultaat honderden regels JSON af en dan is niet te zien wélk
/// veld verschilt.
fn verschil(a: &Value, b: &Value, pad: &str) -> Option<String> {
    match (a, b) {
        (Value::Object(ma), Value::Object(mb)) => {
            for (k, va) in ma {
                match mb.get(k) {
                    Some(vb) => {
                        if let Some(v) = verschil(va, vb, &format!("{pad}.{k}")) {
                            return Some(v);
                        }
                    }
                    None => return Some(format!("{pad}.{k} ontbreekt aan de tweede kant")),
                }
            }
            for k in mb.keys() {
                if !ma.contains_key(k) {
                    return Some(format!("{pad}.{k} ontbreekt aan de eerste kant"));
                }
            }
            None
        }
        (Value::Array(la), Value::Array(lb)) => {
            if la.len() != lb.len() {
                return Some(format!(
                    "{pad}: lengte {} tegen {}",
                    la.len(),
                    lb.len()
                ));
            }
            for (i, (va, vb)) in la.iter().zip(lb).enumerate() {
                if let Some(v) = verschil(va, vb, &format!("{pad}[{i}]")) {
                    return Some(v);
                }
            }
            None
        }
        _ => {
            if a == b {
                None
            } else {
                Some(format!("{pad}: {a} tegen {b}"))
            }
        }
    }
}

fn eis_gelijk(naam_a: &str, a: &Value, naam_b: &str, b: &Value) {
    if let Some(v) = verschil(a, b, "") {
        panic!("{naam_a} en {naam_b} lopen uiteen — {v}");
    }
}

fn getal(v: &Value, pad: &[&str]) -> f64 {
    let mut cur = v;
    for p in pad {
        cur = &cur[*p];
    }
    cur.as_f64()
        .unwrap_or_else(|| panic!("{} is geen getal: {cur}", pad.join(".")))
}

// ── De tests ────────────────────────────────────────────────────────────────

/// Weg 1 bestaat: beide betoncommands staan als `#[tauri::command]` in
/// `src-tauri/src/lib.rs` én in `generate_handler!`. Zonder dat tweede is het
/// command voor de app onbereikbaar, terwijl de functie er wél staat — een
/// storing die geen enkele Rust-test opmerkt.
#[test]
fn weg_1_de_tauri_commands_zijn_geregistreerd() {
    let bron = tauri_lib_bron();
    let handler_start = bron
        .find("generate_handler![")
        .expect("`generate_handler!` staat niet in src-tauri/src/lib.rs");
    let handler = &bron[handler_start..];
    let handler_eind = handler.find(']').expect("`generate_handler!` is niet gesloten");
    let handler = &handler[..handler_eind];

    for command in [
        "check_concrete_beams",
        "concrete_mn_kappa",
        "concrete_segment_stiffness",
    ] {
        assert!(
            bron.contains(&format!("async fn {command}(")),
            "`{command}` staat niet als functie in src-tauri/src/lib.rs"
        );
        assert!(
            handler.contains(command),
            "`{command}` staat niet in generate_handler! — de app kan hem niet aanroepen"
        );
    }
}

/// De kern van deze taak: dezelfde staaf, drie wegen, één antwoord.
#[tokio::test]
async fn de_drie_wegen_toetsen_dezelfde_staaf_gelijk() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    for (naam, invoer) in [
        ("balk", invoer_balk()),
        ("kolom", invoer_kolom()),
        // De T hoort in dezelfde lus: een weg die de doorsnedevorm anders
        // leest — of hem stilzwijgend als rechthoek behandelt — valt hier door
        // de mand, en niet pas in de app.
        ("T-ligger", invoer_t_ligger()),
    ] {
        let tauri = weg_tauri_check(&invoer);
        let brug = weg_toetsbrug("check_concrete_beams", json!([invoer]));
        let brug = brug
            .as_array()
            .expect("de toetsbrug levert een lijst")
            .first()
            .expect("één staaf erin, één resultaat eruit")
            .clone();
        let mcp = weg_mcp(&mut stdin, &mut reader, 100, "check_concrete_beam", invoer).await;

        eis_gelijk(
            &format!("{naam}: Tauri-command"),
            &tauri,
            "toetsbrug",
            &brug,
        );
        eis_gelijk(&format!("{naam}: toetsbrug"), &brug, "MCP-server", &mcp);

        // De uitkomst is ook echt een toetsing en geen leeg omhulsel.
        assert!(
            !mcp["checks"].as_array().expect("checks").is_empty(),
            "{naam}: er is geen enkele toets uitgevoerd"
        );
        assert!(
            !mcp["governing_check_id"]
                .as_str()
                .unwrap_or("")
                .starts_with("ERROR"),
            "{naam}: {}",
            mcp["governing_check_id"]
        );
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Hetzelfde voor het M-N-κ-diagram.
#[tokio::test]
async fn de_drie_wegen_leveren_hetzelfde_mn_kappa_diagram() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    let invoer = invoer_mn_kappa();

    let tauri = weg_tauri_mn_kappa(&invoer);
    let brug = weg_toetsbrug("concrete_mn_kappa", invoer.clone());
    let mcp = weg_mcp(&mut stdin, &mut reader, 200, "concrete_mn_kappa", invoer).await;

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    assert!(
        mcp["diagram"]["points"].as_array().expect("points").len() > 10,
        "het diagram is leeg"
    );
    assert_eq!(mcp["interaction_positive"].as_array().unwrap().len(), 11);
    assert_eq!(mcp["interaction_negative"].as_array().unwrap().len(), 11);

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// **De segmentstijfheden langs de drie wegen.** Twee ronden: eerst de kale
/// indeling (ronde 0), daarna dezelfde staaf mét de krachten van de vorige
/// raamwerkronde. Alle instelbare velden zijn weggelaten, dus een weg die zijn
/// eigen standaardwaarde zou kiezen — een andere segmentlengte dan 400 mm, een
/// andere grenstoestand, een stilzwijgende φ_ef — valt hier door de mand.
#[tokio::test]
async fn de_drie_wegen_leveren_dezelfde_segmentstijfheden() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    for (naam, invoer, id) in [
        ("ronde 0 (alleen de indeling)", invoer_segmenten_ronde0(), 500),
        ("ronde 1 (met krachten)", invoer_segmenten_ronde1(), 501),
    ] {
        let tauri = weg_tauri_segmenten(&invoer);
        let brug = weg_toetsbrug("concrete_segment_stiffness", invoer.clone());
        let mcp = weg_mcp(
            &mut stdin,
            &mut reader,
            id,
            "concrete_segment_stiffness",
            invoer,
        )
        .await;

        eis_gelijk(&format!("{naam}: Tauri-command"), &tauri, "toetsbrug", &brug);
        eis_gelijk(&format!("{naam}: toetsbrug"), &brug, "MCP-server", &mcp);
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Ankerwaarden voor de segmentstijfheid. Gelijklopen is niet genoeg: drie
/// wegen kunnen samen verschuiven. Elk getal hieronder is uit de norm of uit
/// de invoer na te rekenen, en er is er geen verzonnen.
#[tokio::test]
async fn de_segmentstijfheden_zelf_staan_vast() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    // ── Ronde 0: de indeling ────────────────────────────────────────────────
    let r0 = weg_mcp(
        &mut stdin,
        &mut reader,
        510,
        "concrete_segment_stiffness",
        invoer_segmenten_ronde0(),
    )
    .await;

    // n = max(1; round(4300 / 400)) = round(10,75) = 11 segmenten van
    // 4300/11 = 390,909… mm. Besluit B3: 400 mm is de beginwaarde, dus een weg
    // die die default niet invult komt op iets anders uit.
    assert_eq!(r0["segment_count"], 11);
    assert!((getal(&r0, &["target_segment_length_mm"]) - 400.0).abs() < 1e-12);
    assert!((getal(&r0, &["segment_length_mm"]) - 4300.0 / 11.0).abs() < 1e-9);
    assert_eq!(r0["status"], "Layout");
    assert_eq!(r0["has_forces"], false);
    assert_eq!(r0["converged"], false);
    let segs = r0["segments"].as_array().expect("segments");
    assert_eq!(segs.len(), 11);
    assert!(getal(&segs[0], &["x_start_mm"]).abs() < 1e-12);
    assert!((getal(&segs[10], &["x_end_mm"]) - 4300.0).abs() < 1e-9);
    // Ronde 0 rekent niet: geen enkel getal dat als stijfheid gelezen kan worden.
    for s in segs {
        assert!(s["ei_knm2"].is_null(), "ronde 0 leverde tóch een stijfheid");
        assert!(s["kappa_per_m"].is_null());
        assert_eq!(s["status"], "Layout");
    }

    // Besluit B1: φ_ef = 0 en dat staat er met zoveel woorden bij.
    assert!((getal(&r0, &["phi_ef"])).abs() < 1e-12);
    assert_eq!(r0["creep_neglected"], true);
    let note = r0["creep_note"].as_str().expect("creep_note");
    assert!(note.contains("ZONDER kruip"), "{note}");
    assert!(note.contains("ONVEILIGE KANT"), "{note}");
    // Besluit B2: de variant is de UGT van 5.8.6(3) en staat er expliciet.
    assert_eq!(r0["limit_state"], "DesignValues");
    assert!(r0["limit_state_label"].as_str().unwrap().contains("UGT"));

    // ── Ronde 1: de stijfheden ──────────────────────────────────────────────
    let r1 = weg_mcp(
        &mut stdin,
        &mut reader,
        511,
        "concrete_segment_stiffness",
        invoer_segmenten_ronde1(),
    )
    .await;
    assert_eq!(r1["segment_count"], 11);
    assert_eq!(r1["has_forces"], true);
    assert_eq!(r1["failed_count"], 0);
    assert_eq!(r1["clamped_count"], 0);
    // Geen vorige ronde meegestuurd ⇒ convergentie is niet te beoordelen.
    assert_eq!(r1["status"], "NotConverged");
    assert!(r1["max_relative_change"].is_null());

    // f_cd = alpha_cc·f_ck/gamma_C = 1,0·30/1,5 = 20,0 N/mm² (NB bij 3.1.6(1)P),
    // E_cd = E_cm/gamma_cE = 33 000/1,2 = 27 500 N/mm² (5.20 met de NB-waarde
    // gamma_cE = 1,2), f_ctm = 2,9 N/mm² (tabel 3.1, C30/37).
    assert!((getal(&r1, &["f_c_mpa"]) - 20.0).abs() < 1e-9);
    assert!((getal(&r1, &["e_c_mpa"]) - 27_500.0).abs() < 1e-9);
    assert!((getal(&r1, &["f_ctm_mpa"]) - 2.9).abs() < 1e-9);
    // E_cd·I_c = 27 500 · 300·500³/12 · 10⁻⁹ = 85 937,5 kNm².
    assert!((getal(&r1, &["ei_uncracked_knm2"]) - 85_937.5).abs() < 1e-6);

    let segs = r1["segments"].as_array().expect("segments");
    // M_cr = (f_ctm − N/A_c)·W_c met A_c = 150 000 mm² en W_c = 12,5·10⁶ mm³:
    // (2,9 + 800 000/150 000)·12,5·10⁶ = 98,916… kNm.
    let m_cr = 2.9 * 12.5e6 * 1e-6 + 800_000.0 / 150_000.0 * 12.5e6 * 1e-6;
    for s in segs {
        assert!((getal(s, &["m_cr_knm"]) - m_cr).abs() < 1e-6, "M_cr = {}", s["m_cr_knm"]);
        // Alle momenten liggen onder M_cr, dus geen enkel segment is gescheurd.
        assert_eq!(s["cracked"], false);
        assert_eq!(s["status"], "Uncracked");
        assert_eq!(s["basis"], "DesignValues");
        // 5.8.6(5): geen tension stiffening in de UGT.
        assert!(s["zeta"].is_null());
        // M₀ ≠ 0: de korf is asymmetrisch (onder 3Ø16, boven 2Ø12) en de
        // 800 kN druk levert om h/2 zelf al een moment. Was M₀ nul, dan zou de
        // M₀-correctie ontbreken en zou EI = M/κ zijn.
        assert!(getal(s, &["m0_knm"]) < -1.0, "M₀ = {}", s["m0_knm"]);
    }
    // Het moment loopt naar het midden op, dus de stijfheid loopt af.
    let ei = |i: usize| getal(&segs[i], &["ei_knm2"]);
    println!(
        "segment-EI [MNm²]: {}",
        (0..11)
            .map(|i| format!("{:.1}", ei(i) * 1e-3))
            .collect::<Vec<_>>()
            .join(" ")
    );
    for i in 1..=5 {
        assert!(ei(i) < ei(i - 1), "segment {i}: EI stijgt");
    }
    // En hij blijft onder de ongescheurde vergelijkingswaarde: de doorsnede is
    // niet stijver dan beton dat is.
    for i in 0..11 {
        assert!(ei(i) > 0.0 && ei(i) < 1.1 * 85_937.5, "segment {i}: EI = {}", ei(i));
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// **Ankerwaarden voor de T-ligger.** Gelijklopen bewijst niet dat de vorm
/// werkelijk meedoet: drie wegen die de T alle drie als rechthoek van 400 ×
/// 450 lezen, lopen ook gelijk. Deze getallen zijn met de hand na te rekenen
/// en verschillen aantoonbaar van die rechthoekaanname.
#[tokio::test]
async fn de_t_ligger_rekent_als_een_t_en_niet_als_een_rechthoek() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    // ── De toetsing ─────────────────────────────────────────────────────────
    let mcp = weg_mcp(&mut stdin, &mut reader, 600, "check_concrete_beam", invoer_t_ligger()).await;
    assert_eq!(mcp["status"], "Ok");
    assert_eq!(mcp["section_name"], "T 400 x 450 (flens 400 x 50, lijf 200)");
    // d = 450 − 30 − 8 − 20/2 = 402 mm.
    assert!((getal(&mcp, &["d_mm"]) - 402.0).abs() < 1e-9);

    // M_Rd met de rechthoekige spanningsverdeling, met de hand (dezelfde
    // uitwerking als `nen-en-1992-1-1/tests/vormen.rs`):
    //   A_s = 4·π·10² = 1256,637 mm²;  F_s = A_s·f_yd = 546,364 kN
    //   blokoppervlak A_c = F_s/(η·f_cd) = 546 364/20 = 27 318,19 mm²
    //   flens 400·50 = 20 000 mm² < A_c ⇒ het blok loopt het lijf in over
    //   (27 318,19 − 20 000)/200 = 36,591 mm, dus λ·x = 86,591 en x = 108,239 mm
    //   zwaartepunt d_c = 36,598 mm onder de bovenrand
    //   M_Rd = F_s·(d − d_c) = 546 364·(402 − 36,598) = 199,64 kNm
    //   UC = 150/199,64 = 0,7514
    let uc_blok = mcp["checks"]
        .as_array()
        .expect("checks")
        .iter()
        .find(|c| c["id"] == "6.1_bending_stress_block")
        .expect("de spanningsblok-toets")["kind"]["data"]["uc"]["uc"]
        .as_f64()
        .expect("uc");
    assert!(
        (uc_blok - 150.0 / 199.64).abs() < 2e-3,
        "UC spanningsblok = {uc_blok}, met de hand 0,7514"
    );
    // Als rechthoek van 400 × 450 gerekend zou M_Rd hoger uitvallen (het
    // lijfdeel van het blok zou 400 mm breed zijn) en de UC dus LAGER — de
    // onveilige kant. Het verschil is klein maar het is er, en het moet de
    // goede kant op staan.
    assert!(uc_blok > 150.0 / 201.0, "de T rekent als een rechthoek van 400 mm breed");

    // De MODELKEUZE achter de splitsing reist mee als tekst, in beide toetsen.
    for c in mcp["checks"].as_array().unwrap() {
        let notes = format!("{}", c["kind"]["data"]["notes"]);
        assert!(notes.contains("MODELKEUZE"), "{}: {notes}", c["id"]);
        assert!(notes.contains("5.3.2.1(3)"), "{}: {notes}", c["id"]);
    }

    // ── De ongescheurde stijfheid ───────────────────────────────────────────
    // A = 400·50 + 200·400 = 100 000 mm²
    // z_g = (80 000·200 + 20 000·425)/100 000 = 245 mm
    // I  = 200·400³/12 + 80 000·45² + 400·50³/12 + 20 000·180²
    //    = 1 880 833 333,33 mm⁴
    // E_cd·I_c = 27 500 · 1 880 833 333,33 · 10⁻⁹ = 51 722,92 kNm².
    let seg = weg_mcp(
        &mut stdin,
        &mut reader,
        601,
        "concrete_segment_stiffness",
        invoer_t_segmenten(),
    )
    .await;
    let i_t = 200.0 * 400.0_f64.powi(3) / 12.0
        + 80_000.0 * 45.0_f64.powi(2)
        + 400.0 * 50.0_f64.powi(3) / 12.0
        + 20_000.0 * 180.0_f64.powi(2);
    let ei_t = 27_500.0 * i_t * 1e-9;
    assert!((ei_t - 51_722.9167).abs() < 1e-3, "handberekening: {ei_t}");
    assert!(
        (getal(&seg, &["ei_uncracked_knm2"]) - ei_t).abs() < 1e-6,
        "E_c·I_c = {} kNm², met de hand {ei_t}",
        seg["ei_uncracked_knm2"]
    );
    // De oude uitdrukking b·h³/12 met b = de flensbreedte zou 400·450³/12 =
    // 3,0375·10⁹ mm⁴ geven en dus 83 531 kNm² — ruim 60 % te stijf. Dat getal
    // stuurde niet alleen de vergelijkingswaarde maar ook de klemdrempel.
    let ei_fout = 27_500.0 * 400.0 * 450.0_f64.powi(3) / 12.0 * 1e-9;
    assert!(ei_fout / ei_t > 1.6, "de vergelijking bewijst niets: {ei_fout} tegen {ei_t}");
    assert!((getal(&seg, &["ei_uncracked_knm2"]) - ei_fout).abs() > 1.0);
    // De klemdrempel hangt aan diezelfde I.
    assert!((getal(&seg, &["min_ei_knm2"]) - 0.01 * ei_t).abs() < 1e-6);

    // Weg 1 en 2 leveren letterlijk hetzelfde.
    eis_gelijk(
        "T: Tauri-command",
        &weg_tauri_segmenten(&invoer_t_segmenten()),
        "MCP-server",
        &seg,
    );
    eis_gelijk(
        "T: toetsbrug",
        &weg_toetsbrug("concrete_segment_stiffness", invoer_t_segmenten()),
        "MCP-server",
        &seg,
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een doorsnede die niet klopt, is langs alle drie de wegen een fout met de
/// reden erbij — en nergens een stilzwijgende rechthoek.
#[tokio::test]
async fn een_onmogelijke_doorsnede_wordt_langs_alle_drie_de_wegen_geweigerd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    // Een T zonder lijfbreedte. De vorm zegt "Tee", dus stilzwijgend
    // terugvallen op een rechthoek van 400 × 450 zou een doorsnede opleveren
    // die niemand heeft ingevoerd — en een te hoge weerstand.
    let mut invoer = invoer_t_segmenten();
    invoer["section"]["b_w_mm"] = Value::Null;

    let req: concrete_check::SegmentStiffnessRequest =
        serde_json::from_value(invoer.clone()).expect("SegmentStiffnessRequest");
    let fout = concrete_check::segment_stiffness(req).unwrap_err();
    assert!(fout.contains("b_w_mm"), "{fout}");

    let verzoek: toetsbrug::Verzoek = serde_json::from_value(
        json!({ "opdracht": "concrete_segment_stiffness", "inputs": invoer.clone() }),
    )
    .expect("toetsbrug-verzoek");
    assert_eq!(toetsbrug::behandel(verzoek).unwrap_err(), fout);

    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 610, "method": "tools/call",
            "params": { "name": "concrete_segment_stiffness", "arguments": invoer }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(format!("{resp}").contains("b_w_mm"), "{resp}");

    // En andersom: flensmaten op een rechthoek. Ook dat is een fout en geen
    // genegeerd veld — de aanroeper bedoelde iets anders dan hij opschreef.
    let mut rechthoek = invoer_segmenten_ronde0();
    rechthoek["section"]["h_f_mm"] = json!(100);
    let e = concrete_check::segment_stiffness(
        serde_json::from_value(rechthoek).expect("SegmentStiffnessRequest"),
    )
    .unwrap_err();
    assert!(e.contains("geen flens"), "{e}");

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een onuitvoerbaar verzoek is langs alle drie de wegen een fout, en langs
/// geen enkele weg een half antwoord. De MCP-weg meldt hem als toolfout.
#[tokio::test]
async fn een_verkeerd_aantal_krachten_faalt_langs_alle_drie_de_wegen() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut invoer = invoer_segmenten_ronde0();
    // 11 segmenten, maar 3 krachtenparen.
    invoer["segment_forces"] = json!([
        { "n_ed_kn": 0.0, "m_ed_knm": 10.0 },
        { "n_ed_kn": 0.0, "m_ed_knm": 20.0 },
        { "n_ed_kn": 0.0, "m_ed_knm": 30.0 }
    ]);

    // Weg 1 en 2: de rekengang weigert.
    let req: concrete_check::SegmentStiffnessRequest =
        serde_json::from_value(invoer.clone()).expect("SegmentStiffnessRequest");
    let fout_tauri = concrete_check::segment_stiffness(req).unwrap_err();
    assert!(fout_tauri.contains("11 segmenten"), "{fout_tauri}");

    let verzoek: toetsbrug::Verzoek = serde_json::from_value(
        json!({ "opdracht": "concrete_segment_stiffness", "inputs": invoer.clone() }),
    )
    .expect("toetsbrug-verzoek");
    let fout_brug = toetsbrug::behandel(verzoek).unwrap_err();
    assert_eq!(fout_brug, fout_tauri);

    // Weg 3: een toolfout met dezelfde reden, geen leeg antwoord.
    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 520, "method": "tools/call",
            "params": { "name": "concrete_segment_stiffness", "arguments": invoer }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    let tekst = format!("{resp}");
    assert!(tekst.contains("11 segmenten"), "{tekst}");

    // En een onbekend veld wordt geweigerd (`deny_unknown_fields` +
    // `additionalProperties: false`), niet stilzwijgend genegeerd.
    let mut tikfout = invoer_segmenten_ronde0();
    tikfout["target_segment_length"] = json!(200); // moet `_mm` zijn
    let e = serde_json::from_value::<concrete_check::SegmentStiffnessRequest>(tikfout.clone())
        .unwrap_err()
        .to_string();
    assert!(e.contains("target_segment_length"), "{e}");
    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 521, "method": "tools/call",
            "params": { "name": "concrete_segment_stiffness", "arguments": tikfout }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(
        format!("{resp}").contains("target_segment_length"),
        "de MCP-weg slikte een onbekend veld: {resp}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// De twee lijsttools. De MCP-weg pakt de lijst in een object omdat
/// `structuredContent` een object moet zijn; de lijst erbinnen is dezelfde die
/// de andere twee wegen kaal teruggeven.
#[tokio::test]
async fn de_drie_wegen_kennen_dezelfde_sterkteklassen() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    for (tool, sleutel) in [
        ("list_concrete_classes", "classes"),
        ("list_reinforcement_grades", "grades"),
    ] {
        let brug = weg_toetsbrug(tool, Value::Null);
        let mcp = weg_mcp(&mut stdin, &mut reader, 300, tool, json!({})).await;
        eis_gelijk(
            &format!("{tool}: toetsbrug"),
            &brug,
            "MCP-server",
            &mcp[sleutel],
        );
        assert!(!brug.as_array().expect("lijst").is_empty(), "{tool} is leeg");
    }

    // Weg 1: de bron van de lijsten is dezelfde constante uit `nen-en-1992-1-1`
    // die het Tauri-command teruggeeft.
    let bron = tauri_lib_bron();
    assert!(bron.contains("nen_en_1992_1_1::CONCRETE_CLASSES.to_vec()"));
    assert!(bron.contains("nen_en_1992_1_1::REINFORCEMENT_GRADES.to_vec()"));

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Ankerwaarden. Gelijklopen is niet genoeg: drie wegen kunnen samen
/// verschuiven. Deze getallen komen uit de referentie-handberekening
/// (`nen-en-1992-1-1/tests/handberekening.rs`, M_Rd = 113,33 kNm bij deze korf)
/// en uit de kern zelf; ze pinnen de uitkomst van alle drie de wegen vast.
#[tokio::test]
async fn de_uitkomst_zelf_staat_vast() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    let mcp = weg_mcp(&mut stdin, &mut reader, 400, "check_concrete_beam", invoer_balk()).await;

    // Rekenwaarden: f_cd = alpha_cc · f_ck / gamma_C = 1,0 · 30 / 1,5 = 20,0
    // N/mm² (alpha_cc = 1,0 volgens de NB bij 3.1.6(1)P); f_yd = 500 / 1,15 =
    // 434,78 N/mm².
    assert!((getal(&mcp, &["f_cd_mpa"]) - 20.0).abs() < 1e-9);
    assert!((getal(&mcp, &["f_yd_mpa"]) - 434.7826).abs() < 1e-3);
    // Nuttige hoogte d = 500 − 30 − 8 − 16/2 = 454 mm.
    assert!((getal(&mcp, &["d_mm"]) - 454.0).abs() < 1e-9);
    // UC = 100 / 113,33 = 0,882 met het spanningsblok; de M-N-κ-tak komt daar
    // binnen 2 % bij uit, dus uc_max ligt tussen 0,85 en 0,92.
    let uc = getal(&mcp, &["uc_max"]);
    assert!(uc > 0.85 && uc < 0.92, "uc_max = {uc}");
    assert_eq!(mcp["status"], "Ok");
    assert_eq!(mcp["section_name"], "300 x 500");
    assert_eq!(
        mcp["reinforcement_summary"],
        "onder 3Ø16, boven 2Ø12, beugel Ø8, dekking 30 mm"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
