//! Een niet-gevulde nationale bijlage wordt langs ALLE DRIE DE WEGEN geweigerd.
//!
//! # Waarom deze test bestaat
//!
//! De normnaad kan op precies één manier gevaarlijk zijn: een project dat een
//! andere bijlage noemt, maar met Nederlandse partiële factoren wordt
//! doorgerekend. Het rapport draagt dan een landnaam die niet bij de getallen
//! hoort, en niets in de uitkomst verraadt dat.
//!
//! De weigering hoort daarom niet bij één ingang thuis maar bij alle drie:
//!
//! 1. de rekengang achter het **Tauri-command** (de desktop-app),
//! 2. de **toetsbrug** (de dev-server, `/api/toetsing`),
//! 3. de **MCP-server** (deze crate).
//!
//! Alle drie lezen dezelfde invoertypen, dus alle drie horen dezelfde
//! Nederlandse melding te geven. Deze test toont dat aan met de werkelijke
//! rekengang, de werkelijke `toetsbrug::behandel` en de werkelijk gestarte
//! binary — er wordt niets nagebouwd.
//!
//! # En het omgekeerde
//!
//! Dat "NL" en "veld weggelaten" wél gewoon doorlopen, staat er ook in: een
//! weigering die álles weigert bewijst niets.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

/// Een bijlage die deze uitgave niet kent. Géén verzonnen rekenwaarden — alleen
/// de code, om te tonen dat hij wordt tegengehouden.
const NIET_GEVULD: &str = "DE";

// ── De invoer: één houten staaf, zo klein als de kern toelaat ───────────────

fn invoer_houten_staaf(bijlage: Option<&str>) -> Value {
    let mut v = json!({
        "beam_id": 1,
        "width_mm": 96.0,
        "height_mm": 450.0,
        "length_m": 5.0,
        "strength_class": "C24",
        "service_class": "Sc1",
        "load_duration": "MediumTerm",
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 0.0,
              "forces": { "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": 10.0, "mt_ed": 0.0, "my_ed": 0.0, "mz_ed": 0.0 } },
            { "combination_id": 1, "position_mm": 2500.0,
              "forces": { "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": 0.0, "mt_ed": 0.0, "my_ed": 12.5, "mz_ed": 0.0 } }
        ],
        "deflection_inst_mm": -10.0
    });
    if let Some(b) = bijlage {
        v["bijlage"] = json!(b);
    }
    v
}

/// De melding hoort te zeggen WAT er mis is. Alleen "error" is niet genoeg:
/// de gebruiker moet kunnen zien dat de bijlage bewust niet is gevuld.
fn is_de_juiste_weigering(tekst: &str) -> bool {
    tekst.contains("niet gevuld") && tekst.contains(NIET_GEVULD)
}

// ── Weg 1: de rekengang achter het Tauri-command ────────────────────────────

/// Letterlijk de eerste stap van `check_timber_beams` uit `src-tauri/src/lib.rs`:
/// de invoer wordt naar `Vec<TimberBeamCheckInput>` gelezen. Daar zit de
/// weigering, en daarom geldt zij voor elk command dat dit type leest.
fn weg_tauri(invoer: &Value) -> Result<(), String> {
    serde_json::from_value::<Vec<timber_check::TimberBeamCheckInput>>(json!([invoer]))
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// ── Weg 2: de toetsbrug ─────────────────────────────────────────────────────

fn weg_toetsbrug(invoer: &Value) -> Result<Value, String> {
    let verzoek: toetsbrug::Verzoek = serde_json::from_value(json!({
        "opdracht": "check_timber_beams",
        "inputs": [invoer]
    }))
    .expect("toetsbrug-verzoek");
    toetsbrug::behandel(verzoek)
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
                "clientInfo": { "name": "drie-wegen-bijlage", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Roep `check_timber_beams` aan en geef het hele `result`-object terug, ook
/// als het een fout is — juist die fout is hier het onderwerp.
async fn weg_mcp(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    invoer: &Value,
) -> Value {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": "check_timber_beams", "arguments": { "inputs": [invoer] } }
        }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    resp.clone()
}

// ── De tests ────────────────────────────────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
async fn een_niet_gevulde_bijlage_wordt_langs_alle_drie_de_wegen_geweigerd() {
    let invoer = invoer_houten_staaf(Some(NIET_GEVULD));

    // Weg 1 — de rekengang achter het Tauri-command.
    let fout1 = weg_tauri(&invoer).expect_err("weg 1 hoort te weigeren");
    assert!(is_de_juiste_weigering(&fout1), "weg 1 (Tauri-command): {fout1}");

    // Weg 2 — de toetsbrug.
    let fout2 = weg_toetsbrug(&invoer).expect_err("weg 2 hoort te weigeren");
    assert!(is_de_juiste_weigering(&fout2), "weg 2 (toetsbrug): {fout2}");

    // Weg 3 — de MCP-server, als proces.
    let (mut child, mut stdin, mut reader) = start_server().await;
    let resp = weg_mcp(&mut stdin, &mut reader, 2, &invoer).await;
    let tekst = format!("{resp}");
    assert!(
        is_de_juiste_weigering(&tekst),
        "weg 3 (MCP) hoort te weigeren met reden, kreeg: {tekst}"
    );
    let _ = child.kill().await;
}

/// En het omgekeerde: de gevulde bijlage, en de invoer zónder het veld, lopen
/// gewoon door. Zonder dit bewijst de weigering hierboven niets.
#[tokio::test(flavor = "multi_thread")]
async fn de_gevulde_bijlage_en_een_weggelaten_veld_lopen_gewoon_door() {
    for bijlage in [Some("NL"), None] {
        let invoer = invoer_houten_staaf(bijlage);
        weg_tauri(&invoer).unwrap_or_else(|e| panic!("weg 1 met {bijlage:?}: {e}"));
        let uit = weg_toetsbrug(&invoer).unwrap_or_else(|e| panic!("weg 2 met {bijlage:?}: {e}"));
        assert_eq!(
            uit.as_array().map(|a| a.len()),
            Some(1),
            "weg 2 met {bijlage:?} hoort één resultaat te geven"
        );
    }

    let (mut child, mut stdin, mut reader) = start_server().await;
    for (id, bijlage) in [(2u32, Some("NL")), (3, None)] {
        let invoer = invoer_houten_staaf(bijlage);
        let resp = weg_mcp(&mut stdin, &mut reader, id, &invoer).await;
        assert_eq!(
            resp["result"]["isError"], false,
            "weg 3 met {bijlage:?} gaf een fout: {}",
            resp["result"]["content"][0]["text"].as_str().unwrap_or("")
        );
    }
    let _ = child.kill().await;
}

/// De drie wegen weigeren met DEZELFDE reden. Een weg die zijn eigen
/// formulering verzint, laat de gebruiker raden waar de fout zit.
#[tokio::test(flavor = "multi_thread")]
async fn de_drie_wegen_geven_dezelfde_reden() {
    let invoer = invoer_houten_staaf(Some(NIET_GEVULD));
    let kern = format!("nationale bijlage \"{NIET_GEVULD}\" is niet gevuld");

    let fout1 = weg_tauri(&invoer).expect_err("weg 1");
    let fout2 = weg_toetsbrug(&invoer).expect_err("weg 2");
    assert!(fout1.contains(&kern), "weg 1: {fout1}");
    assert!(fout2.contains(&kern), "weg 2: {fout2}");

    let (mut child, mut stdin, mut reader) = start_server().await;
    let resp = weg_mcp(&mut stdin, &mut reader, 2, &invoer).await;
    // De JSON-tekst van het antwoord draagt de melding met ontsnapte
    // aanhalingstekens; daarom wordt hier op de kern zonder aanhalingstekens
    // gezocht.
    let tekst = format!("{resp}");
    assert!(
        tekst.contains("nationale bijlage") && tekst.contains("is niet gevuld"),
        "weg 3: {tekst}"
    );
    let _ = child.kill().await;
}
