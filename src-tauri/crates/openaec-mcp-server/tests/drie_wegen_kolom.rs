//! Drie-wegen-verificatie voor de KOLOMTOETS (NEN-EN 1992-1-1 §5.8, met de
//! detaillering van §9.5).
//!
//! DE REGEL
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` dat óók in
//!    `generate_handler!` staat (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. een gereedschap in deze MCP-server.
//!
//! `drie_wegen_kruistabel.rs` bewaakt of de NAAM langs alle drie de wegen
//! bestaat. Dit bestand bewaakt of zij ook hetzelfde ANTWOORD geven. Drie wegen
//! kunnen namelijk samen verschuiven; daarom staan er ankerwaarden bij die met
//! de hand uit de norm volgen en niet uit een vorige uitdraai.
//!
//! DE KOLOM
//! Vierkante kolom 300 × 300, C30/37, B500B, vrije lengte 4,000 m, korf 3Ø20
//! boven en onder met beugels Ø8-200 en 30 mm dekking. Constante drukkracht
//! N_Ed = −900 kN met een eerste-orde-moment dat van 40 naar 20 kNm loopt.
//!
//! DE ANKERWAARDEN
//! Twee grootheden volgen zuiver geometrisch uit de norm en zijn dus met de
//! hand na te rekenen, onafhankelijk van welke tak van §5.8.3.1 de kern kiest:
//!
//! * l₀ uit figuur 5.7. Vakje a) ScharnierendScharnierend geeft l₀ = l =
//!   4000 mm; vakje b) Console geeft l₀ = 2l = 8000 mm.
//! * λ = l₀/i uit (5.14), met i = √(I/A) = h/√12 voor een rechthoek. Dus
//!   i = 300/√12 = 86,6025 mm en λ = 4000/86,6025 = 46,188 respectievelijk
//!   λ = 92,376 voor de console.
//!
//! Die twee zijn de kern van de toets: zij bepalen of §5.8.3.1(1) de
//! tweede-orde-effecten laat vervallen. Loopt één van de drie wegen daarin uit
//! de pas, dan rekent de app met een andere kolom dan de MCP-cliënt.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");
const TOOL: &str = "concrete_column_check";
const L_M: f64 = 4.0;
const H_MM: f64 = 300.0;

/// i = h/√12 voor een rechthoek — de traagheidsstraal uit (5.14).
fn i_mm() -> f64 {
    H_MM / 12.0_f64.sqrt()
}

// ── De invoer ───────────────────────────────────────────────────────────────

/// De UGT-omhullende: constante druk van 900 kN, moment van 40 naar 20 kNm.
/// N drukt negatief, zoals `ForcePoint` het vraagt.
fn omhullende() -> Value {
    let stations = [0.0_f64, 2000.0, 4000.0];
    Value::Array(
        stations
            .iter()
            .map(|&x| {
                let t = x / (L_M * 1000.0);
                let m = 40.0 - 20.0 * t;
                json!({
                    "combination_id": 1,
                    "position_mm": x,
                    "forces": {
                        "n_ed": -900.0, "vy_ed": 0.0, "vz_ed": 0.0,
                        "mt_ed": 0.0, "my_ed": m, "mz_ed": 0.0
                    }
                })
            })
            .collect::<Vec<_>>(),
    )
}

/// Het verzoek. `column` bepaalt de schoring en het vakje uit figuur 5.7; de
/// rest van de kolom blijft gelijk, zodat een verschil in de uitkomst alleen
/// van die twee kan komen.
fn verzoek(bracing: &str, geval: &str) -> Value {
    json!({
        "beam_id": 12,
        "section": {
            "shape": "Rectangle", "b_mm": H_MM, "h_mm": H_MM,
            "b_w_mm": null, "h_f_mm": null, "flange_at_bottom": false
        },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0,
            "stirrup_diameter_mm": 8.0,
            "bottom": { "count": 3, "diameter_mm": 20.0 },
            "top": { "count": 3, "diameter_mm": 20.0 },
            "stirrup_spacing_mm": 200.0,
            "stirrup_legs": 2
        },
        "length_m": L_M,
        "column": {
            "bracing": bracing,
            "buckling_length": { "soort": "Figuur57", "geval": geval }
        },
        "forces_envelope": omhullende()
    })
}

/// Het gewone geval: geschoord, scharnierend-scharnierend.
fn verzoek_standaard() -> Value {
    verzoek("Geschoord", "ScharnierendScharnierend")
}

/// Hetzelfde verzoek, maar met een moment om de ZWAKKE as in de omhullende.
/// Dat maakt het een geval van §5.8.9, en de kern hoort dat dan te melden —
/// langs alle drie de wegen hetzelfde.
fn verzoek_dubbele_buiging() -> Value {
    let mut v = verzoek_standaard();
    for punt in v["forces_envelope"].as_array_mut().expect("omhullende") {
        punt["forces"]["mz_ed"] = json!(35.0);
    }
    v
}

// ── Weg 1: de rekengang achter het Tauri-command ────────────────────────────

/// Letterlijk de body van `concrete_column_check` uit `src-tauri/src/lib.rs`.
fn weg_tauri(invoer: &Value) -> Result<Value, String> {
    let req: concrete_check::ConcreteColumnCheckRequest =
        serde_json::from_value(invoer.clone()).expect("ConcreteColumnCheckRequest");
    let uit = concrete_check::column_check(req)?;
    Ok(serde_json::to_value(uit).expect("antwoord serialiseren"))
}

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

fn weg_toetsbrug(inputs: Value) -> Result<Value, String> {
    let v: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": TOOL, "inputs": inputs }))
            .expect("toetsbrug-verzoek");
    toetsbrug::behandel(v)
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
                "clientInfo": { "name": "drie-wegen-kolom", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Roep de tool aan. Bij succes `structuredContent`, bij een toolfout de
/// meldingstekst — want een fout is hier óók een uitkomst die moet kloppen.
async fn weg_mcp(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    argumenten: Value,
) -> Result<Value, String> {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": TOOL, "arguments": argumenten }
        }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    if !resp["error"].is_null() {
        return Err(resp["error"]["message"]
            .as_str()
            .unwrap_or_default()
            .to_string());
    }
    let result = &resp["result"];
    if result["isError"] == json!(true) {
        return Err(result["content"][0]["text"]
            .as_str()
            .unwrap_or_default()
            .to_string());
    }
    Ok(result["structuredContent"].clone())
}

// ── Vergelijking ────────────────────────────────────────────────────────────

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
                return Some(format!("{pad}: lengte {} tegen {}", la.len(), lb.len()));
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

// ── De tests ────────────────────────────────────────────────────────────────

/// Weg 1 bestaat: het command staat als `#[tauri::command]` in
/// `src-tauri/src/lib.rs` én in `generate_handler!`. Zonder dat tweede is het
/// voor de app onbereikbaar terwijl de functie er wél staat.
#[test]
fn weg_1_het_tauri_command_is_geregistreerd() {
    let bron = tauri_lib_bron();
    let start = bron
        .find("generate_handler![")
        .expect("`generate_handler!` staat niet in src-tauri/src/lib.rs");
    let handler = &bron[start..];
    let eind = handler.find(']').expect("`generate_handler!` is niet gesloten");
    let handler = &handler[..eind];

    assert!(
        bron.contains(&format!("async fn {TOOL}(")),
        "`{TOOL}` staat niet als functie in src-tauri/src/lib.rs"
    );
    assert!(
        handler.contains(TOOL),
        "`{TOOL}` staat niet in generate_handler! — de app kan hem niet aanroepen"
    );
}

/// Dezelfde kolom, drie wegen, één antwoord — veld voor veld, inclusief de
/// afleidingsteksten van elke toets.
#[tokio::test]
async fn de_drie_wegen_leveren_dezelfde_kolomtoets() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let inv = verzoek_standaard();
    let tauri = weg_tauri(&inv).expect("Tauri-weg");
    let brug = weg_toetsbrug(inv.clone()).expect("toetsbrug-weg");
    let mcp = weg_mcp(&mut stdin, &mut reader, 800, inv)
        .await
        .expect("MCP-weg");

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een tweede kolom — de console, ongeschoord — langs dezelfde drie wegen.
/// Eén geval bewijst dat de wegen dezelfde functie aanroepen; twee gevallen
/// bewijzen dat zij ook dezelfde INVOER doorgeven: een weg die `bracing` of
/// `geval` zou negeren, geeft hier hetzelfde antwoord als hierboven.
#[tokio::test]
async fn de_drie_wegen_lezen_ook_de_schoring_gelijk() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let inv = verzoek("Ongeschoord", "Console");
    let tauri = weg_tauri(&inv).expect("Tauri-weg");
    let brug = weg_toetsbrug(inv.clone()).expect("toetsbrug-weg");
    let mcp = weg_mcp(&mut stdin, &mut reader, 801, inv)
        .await
        .expect("MCP-weg");

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    let standaard = weg_tauri(&verzoek_standaard()).expect("Tauri-weg");
    assert_ne!(
        tauri["l0_mm"], standaard["l0_mm"],
        "een console hoort een andere kniklengte te geven dan een \
         scharnierend opgelegde kolom — leest de weg `geval` wel?"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// De uitkomst zelf, met ankerwaarden die uit de norm volgen:
///
/// * figuur 5.7 a): l₀ = l = 4000 mm;
/// * (5.14): λ = l₀/i met i = h/√12 = 86,6025 mm, dus λ = 46,188;
/// * figuur 5.7 b): l₀ = 2l = 8000 mm, en daarmee λ precies tweemaal zo groot.
///
/// Deze getallen zijn zuivere meetkunde en veranderen niet met de tak van
/// §5.8.3.1 die de kern kiest.
#[tokio::test]
async fn de_kniklengte_en_de_slankheid_staan_vast() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let uit = weg_mcp(&mut stdin, &mut reader, 802, verzoek_standaard())
        .await
        .expect("MCP-weg");

    assert_eq!(uit["beam_id"], json!(12), "het staafnummer reist mee");

    let l0 = uit["l0_mm"].as_f64().expect("l0_mm hoort een getal te zijn");
    assert!(
        (l0 - L_M * 1000.0).abs() < 1e-6,
        "figuur 5.7 a) geeft l₀ = l = {} mm, niet {l0}",
        L_M * 1000.0
    );

    let lambda = uit["lambda"]
        .as_f64()
        .expect("lambda hoort een getal te zijn");
    let verwacht = (L_M * 1000.0) / i_mm();
    assert!(
        (lambda - verwacht).abs() < 1e-6,
        "(5.14) geeft λ = l₀/i = {verwacht:.4}, niet {lambda:.4}"
    );

    // De console: l₀ = 2l, en λ dus exact tweemaal zo groot.
    let console = weg_mcp(
        &mut stdin,
        &mut reader,
        803,
        verzoek("Ongeschoord", "Console"),
    )
    .await
    .expect("MCP-weg");
    let l0_console = console["l0_mm"].as_f64().expect("l0_mm van de console");
    assert!(
        (l0_console - 2.0 * L_M * 1000.0).abs() < 1e-6,
        "figuur 5.7 b) geeft l₀ = 2l = {} mm, niet {l0_console}",
        2.0 * L_M * 1000.0
    );
    let lambda_console = console["lambda"].as_f64().expect("lambda van de console");
    assert!(
        (lambda_console - 2.0 * lambda).abs() < 1e-6,
        "l₀ verdubbelt, dus λ ook: {lambda_console:.4} tegen {:.4}",
        2.0 * lambda
    );

    // De poort van §5.8.3.1(1) is een vergelijking van die twee, en hoort dus
    // consistent te zijn met de getallen die er staan.
    if let (Some(lim), Some(verwaarloosbaar)) = (
        uit["lambda_lim"].as_f64(),
        uit["tweede_orde_verwaarloosbaar"].as_bool(),
    ) {
        assert_eq!(
            verwaarloosbaar,
            lambda < lim,
            "§5.8.3.1(1) laat de tweede orde vervallen als λ < λ_lim; \
             λ = {lambda:.4} en λ_lim = {lim:.4}"
        );
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Dubbele buiging: een moment om de zwakke as in de omhullende. De kern
/// rekent §5.8.9 niet, maar MELDT het — en die melding hoort langs alle drie
/// de wegen hetzelfde te zijn, mét dezelfde reden. Een weg die de omhullende
/// zou afvlakken tot M_y alleen, zou hier de melding kwijt zijn.
#[tokio::test]
async fn de_drie_wegen_melden_dubbele_buiging_gelijk() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let inv = verzoek_dubbele_buiging();
    let tauri = weg_tauri(&inv).expect("Tauri-weg");
    let brug = weg_toetsbrug(inv.clone()).expect("toetsbrug-weg");
    let mcp = weg_mcp(&mut stdin, &mut reader, 805, inv)
        .await
        .expect("MCP-weg");

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    let melding = tauri["checks"]
        .as_array()
        .expect("checks")
        .iter()
        .find(|c| c["kind"]["data"]["id"] == json!("5.8.9_dubbele_buiging"))
        .expect("een moment om de zwakke as hoort §5.8.9 te laten melden");
    assert_eq!(melding["kind"]["data"]["status"], json!("NotApplicable"));

    // En zónder M_z is de melding er niet — anders is hij ruis.
    let standaard = weg_tauri(&verzoek_standaard()).expect("Tauri-weg");
    assert!(
        !standaard["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["kind"]["data"]["id"] == json!("5.8.9_dubbele_buiging")),
        "zonder M_z hoort er geen §5.8.9-melding te zijn"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een vakje uit figuur 5.7 dat niet bij de opgegeven schoring past, hoort
/// langs alle drie de wegen de REDEN te geven en GEEN GETAL. Een console is per
/// definitie ongeschoord; hem geschoord noemen is een tegenstrijdige aanname,
/// en die stilzwijgend oplossen zou de gebruiker een kniklengte geven die hij
/// niet heeft gevraagd.
///
/// De kern kiest daarvoor niet de weg van een harde fout maar die van het
/// toetscontract: §5.8.3.1 komt terug met status `NotApplicable`, de reden in
/// `notes`, en λ, λ_lim en l₀ op null. Dat is de betere weg — de gebruiker ziet
/// in dezelfde tabel wat er niet kon en waarom — maar hij is alleen iets waard
/// als hij ook echt niets invult. Vandaar dat deze test op alle drie de nulls
/// staat: een weg die stiekem toch een l₀ zou melden, valt hier door de mand.
#[tokio::test]
async fn een_tegenstrijdige_aanname_levert_de_reden_en_geen_getal() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let inv = verzoek("Geschoord", "Console");
    let tauri = weg_tauri(&inv).expect("Tauri-weg");
    let brug = weg_toetsbrug(inv.clone()).expect("toetsbrug-weg");
    let mcp = weg_mcp(&mut stdin, &mut reader, 804, inv)
        .await
        .expect("MCP-weg");

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    for veld in ["l0_mm", "lambda", "lambda_lim", "tweede_orde_verwaarloosbaar"] {
        assert!(
            tauri[veld].is_null(),
            "{veld} hoort leeg te blijven als de aanname zichzelf tegenspreekt, \
             maar er staat {}",
            tauri[veld]
        );
    }

    let poort = tauri["checks"]
        .as_array()
        .expect("checks")
        .iter()
        .find(|c| c["kind"]["data"]["id"] == json!("5.8.3.1_slankheidsgrens"))
        .expect("§5.8.3.1 hoort in de tabel te staan, ook als hij niet kon");
    assert_eq!(
        poort["kind"]["data"]["status"],
        json!("NotApplicable"),
        "een toets die niet kon is niet groen en niet rood, maar niet van toepassing"
    );
    let reden = poort["kind"]["data"]["notes"][0]
        .as_str()
        .expect("de reden hoort in notes te staan");
    assert!(
        reden.contains("ongeschoord") && reden.contains("geschoord"),
        "de reden hoort te noemen dat de twee aannamen elkaar tegenspreken: {reden}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
