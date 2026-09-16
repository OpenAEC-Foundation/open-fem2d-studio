//! Drie-wegen-verificatie voor de plaattoets (`check_plates`).
//!
//! Zelfde opzet als `drie_wegen_hout.rs`:
//! * **Weg 3 (MCP)**: de werkelijke binary over stdio;
//! * **Weg 2 (toetsbrug)**: `toetsbrug::behandel`;
//! * **Weg 1 (Tauri-command)**: de body van `check_plates` uit
//!   `src-tauri/src/lib.rs` letterlijk; dat het command geregistreerd is,
//!   bewaakt `drie_wegen_kruistabel.rs`.
//!
//! DE GETALLEN
//! Het anker is de combinatie uit `plaat-check/tests/handberekening_staal.rs`:
//! S355, t = 50 mm (tabel 3.1: f_y = 335 N/mm²), σ_x = 150, σ_z = −80, τ = 60
//! → σ_eq = √51700 = 227,3763 N/mm², UC = 0,678735. Een tweede element met
//! alleen τ = 100 geeft √3·100/335 = 0,517030 en is dus niet maatgevend. Een
//! tweede plaat van kruislaaghout moet langs alle drie de wegen met dezelfde
//! reden geweigerd worden.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

fn invoer() -> Value {
    json!([
        {
            "plate_id": 1,
            "soort": "Staal",
            "materiaal": "S355",
            "thickness_mm": 50.0,
            "combinations": [
                { "combination_id": 4, "elements": [
                    { "element_id": 0, "sigma_x_mpa": 150.0, "sigma_y_mpa": -80.0, "tau_xy_mpa": 60.0 },
                    { "element_id": 1, "sigma_x_mpa": 0.0, "sigma_y_mpa": 0.0, "tau_xy_mpa": 100.0 }
                ] }
            ]
        },
        {
            "plate_id": 2,
            "soort": "Kruislaaghout",
            "materiaal": "CLT C24 40/20/40",
            "thickness_mm": 100.0,
            "combinations": [
                { "combination_id": 4, "elements": [
                    { "element_id": 0, "sigma_x_mpa": 1.0, "sigma_y_mpa": 0.0, "tau_xy_mpa": 0.0 }
                ] }
            ]
        }
    ])
}

fn weg_tauri(invoer: &Value) -> Value {
    let inputs: Vec<plaat_check::PlateCheckInput> =
        serde_json::from_value(invoer.clone()).expect("PlateCheckInput");
    serde_json::to_value(plaat_check::check_all_plates(inputs)).expect("serialiseren")
}

fn weg_toetsbrug(inputs: Value) -> Result<Value, String> {
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": "check_plates", "inputs": inputs }))
            .expect("toetsbrug-verzoek");
    toetsbrug::behandel(verzoek)
}

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
    serde_json::from_str(regel.trim()).unwrap_or_else(|e| panic!("ongeldige JSON {regel:?}: {e}"))
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
    let mut reader = BufReader::new(child.stdout.take().expect("stdout"));
    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "drie-wegen-plaat", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");
    (child, stdin, reader)
}

async fn roep(stdin: &mut ChildStdin, reader: &mut BufReader<ChildStdout>, id: u32, args: Value) -> Value {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": "check_plates", "arguments": args }
        }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    resp
}

#[tokio::test]
async fn de_drie_wegen_toetsen_dezelfde_platen_gelijk() {
    let tauri = weg_tauri(&invoer());
    let brug = weg_toetsbrug(invoer()).expect("toetsbrug");
    let (mut child, mut stdin, mut reader) = start_server().await;
    let resp = roep(&mut stdin, &mut reader, 2, json!({ "inputs": invoer() })).await;
    assert_eq!(resp["result"]["isError"], false, "{resp}");
    let mcp = resp["result"]["structuredContent"]["results"].clone();

    // Byte voor byte: dezelfde functie, dezelfde serialisatie.
    assert_eq!(serde_json::to_string(&tauri).unwrap(), serde_json::to_string(&brug).unwrap());
    assert_eq!(serde_json::to_string(&tauri).unwrap(), serde_json::to_string(&mcp).unwrap());

    // Het anker uit de handberekening.
    let staal = &mcp[0];
    let uc = staal["uc_max"].as_f64().unwrap();
    assert!((uc - 0.678_735).abs() < 1e-6, "UC {uc}");
    assert_eq!(staal["governing_element_id"], 0);
    assert_eq!(staal["governing_combination_id"], 4);
    assert_eq!(staal["status"], "Ok");
    assert_eq!(staal["elementen"].as_array().unwrap().len(), 2);
    let uc1 = staal["elementen"][1]["uc"].as_f64().unwrap();
    assert!((uc1 - 0.517_030).abs() < 1e-6, "UC element 1 {uc1}");
    assert!(staal["niet_getoetst"].as_array().unwrap().iter().any(|n| n["id"] == "en1993_1_5_plooi"));

    // Kruislaaghout: geweigerd, met reden, zonder UC die als "voldoet" leest.
    let clt = &mcp[1];
    assert_eq!(clt["status"], "NotApplicable");
    assert!(clt["geweigerd"].as_str().unwrap().contains("kruislaaghout"));
    assert!(clt["checks"].as_array().unwrap().is_empty());

    let _ = child.kill().await;
}

#[tokio::test]
async fn een_onbekend_veld_wordt_langs_alle_wegen_geweigerd() {
    let mut fout = invoer();
    fout[0]["dikte_mm"] = json!(10.0);
    assert!(serde_json::from_value::<Vec<plaat_check::PlateCheckInput>>(fout.clone()).is_err());
    let brug = weg_toetsbrug(fout.clone()).unwrap_err();
    assert!(brug.contains("dikte_mm"), "{brug}");
    let (mut child, mut stdin, mut reader) = start_server().await;
    let resp = roep(&mut stdin, &mut reader, 3, json!({ "inputs": fout })).await;
    let tekst = resp.to_string();
    assert!(tekst.contains("dikte_mm"), "{tekst}");
    assert!(resp["result"]["structuredContent"]["results"].is_null(), "{resp}");
    let _ = child.kill().await;
}
