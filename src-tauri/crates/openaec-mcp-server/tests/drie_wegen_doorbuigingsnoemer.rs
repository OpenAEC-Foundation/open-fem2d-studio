//! Issue #9 langs de drie wegen: een doorbuigingsnoemer van 0 of kleiner wordt
//! bij staal, hout en kruislaaghout geweigerd met reden — nooit status Ok
//! zonder toets.
//!
//! HOE ELKE WEG WORDT AANGESPROKEN — gelijk aan `drie_wegen_hout.rs`
//! * **Weg 1 (Tauri-command)**: de body van `check_steel_beams`,
//!   `check_timber_beams` en `check_clt_beams` uit `src-tauri/src/lib.rs`,
//!   letterlijk uitgevoerd (inlezen in de Rust-typen, dan de kern).
//! * **Weg 2 (toetsbrug)**: `toetsbrug::behandel`, de functie die de binary
//!   op zijn invoer uitvoert.
//! * **Weg 3 (MCP)**: de werkelijke binary over stdio, `tools/call`.
//!
//! Een negatieve staalnoemer is hier ook een test van het TYPE: tot deze
//! wijziging was `deflection_limit_numerator` een `u32`, en dan liep een
//! negatief getal vast bij het inlezen — voor de hele aanroep, met alle staven.
//! Nu komt hij de kern in en wordt alleen déze staaf geweigerd.
//!
//! Het MCP-modelpad (`check_fem_model`) keurt `checkConfig` al in
//! `valideerModel` en weigert daar 0 en negatief; dat bewaakt
//! `design-mockup/test-doorbuigingsnoemer.mjs`.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

// ── De invoer ───────────────────────────────────────────────────────────────

fn punt(x_mm: f64, n: f64, vz: f64, my: f64) -> Value {
    json!({
        "combination_id": 12,
        "position_mm": x_mm,
        "forces": { "n_ed": n, "vy_ed": 0.0, "vz_ed": vz, "mt_ed": 0.0, "my_ed": my, "mz_ed": 0.0 }
    })
}

/// De kolom HEB160 uit `portal_beam2.rs`, met een zakking erbij.
fn staal(klasse: &str, noemer: i64, noemer_add: f64) -> Value {
    json!({
        "beam_id": 2,
        "profile_name": "HEB160",
        "steel_grade": "S235",
        "length_m": 2.5,
        "forces_envelope": [punt(0.0, -233.911, 17.357, -63.139)],
        "lateral_bracing": { "top_flange_positions": [], "bottom_flange_positions": [] },
        "buckling_length_y_m": 2.5,
        "buckling_length_z_m": 2.5,
        "deflection_limit_class": klasse,
        "deflection_limit_numerator": noemer,
        "deflection_actual_max_mm": -3.0,
        "is_cantilever": false,
        "consequence_class": "CC1",
        "pre_camber_mm": 0.0,
        "deflection_permanent_mm": 0.0,
        "deflection_add_limit_numerator": noemer_add,
        "q_equiv_n_per_mm": 0.0,
        "z_a_mm": 0.0
    })
}

fn hout(veld: &str, n: f64) -> Value {
    let mut v = json!({
        "beam_id": 3,
        "width_mm": 96.0,
        "height_mm": 450.0,
        "strength_class": "C24",
        "service_class": "Sc1",
        "load_duration": "MediumTerm",
        "length_m": 5.0,
        "forces_envelope": [punt(0.0, 0.0, 10.0, 0.0), punt(2500.0, 0.0, 0.0, 12.0), punt(5000.0, 0.0, -10.0, 0.0)],
        "buckling_length_y_m": 5.0,
        "buckling_length_z_m": 5.0,
        "deflection_inst_mm": -5.0,
        "deflection_quasi_perm_mm": -3.0,
        "deflection_permanent_mm": -3.0
    });
    v[veld] = json!(n);
    v
}

fn clt(veld: &str, n: f64) -> Value {
    let laag = |t: f64, richting: &str| {
        json!({ "thickness_mm": t, "orientation": richting, "strength_class": "C24" })
    };
    let mut v = json!({
        "beam_id": 7,
        "layup": {
            "width_mm": 1000.0,
            "layers": [
                laag(40.0, "Longitudinal"), laag(20.0, "Transverse"), laag(40.0, "Longitudinal"),
                laag(20.0, "Transverse"), laag(40.0, "Longitudinal")
            ]
        },
        "service_class": "Sc1",
        "load_duration": "MediumTerm",
        "length_m": 5.0,
        "forces_envelope": [punt(0.0, 0.0, 10.0, 0.0), punt(2500.0, 0.0, 0.0, 20.0), punt(5000.0, 0.0, -10.0, 0.0)],
        "k_def": 0.8,
        "k_def_bron": "testwaarde",
        "deflection_inst_mm": -5.0,
        "deflection_quasi_perm_mm": -3.0,
        "deflection_permanent_mm": -3.0
    });
    v[veld] = json!(n);
    v
}

// ── Weg 1: de rekengang achter de Tauri-commands ────────────────────────────

fn weg_tauri_staal(invoer: &Value) -> Value {
    let inputs: Vec<steel_check::BeamCheckInput> =
        serde_json::from_value(json!([invoer])).expect("BeamCheckInput");
    serde_json::to_value(&steel_check::check_all_beams(inputs)[0]).unwrap()
}

fn weg_tauri_hout(invoer: &Value) -> Value {
    let inputs: Vec<timber_check::TimberBeamCheckInput> =
        serde_json::from_value(json!([invoer])).expect("TimberBeamCheckInput");
    serde_json::to_value(&timber_check::check_all_timber_beams(inputs)[0]).unwrap()
}

fn weg_tauri_clt(invoer: &Value) -> Value {
    let inputs: Vec<timber_check::clt::CltBeamCheckInput> =
        serde_json::from_value(json!([invoer])).expect("CltBeamCheckInput");
    serde_json::to_value(&timber_check::clt::check_all_clt_beams(inputs)[0]).unwrap()
}

// ── Weg 2: de toetsbrug ─────────────────────────────────────────────────────

fn weg_toetsbrug(opdracht: &str, invoer: &Value) -> Value {
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": opdracht, "inputs": [invoer] })).unwrap();
    let antwoord = toetsbrug::behandel(verzoek).unwrap_or_else(|e| panic!("toetsbrug {opdracht}: {e}"));
    antwoord.as_array().expect("een lijst")[0].clone()
}

// ── Weg 3: de MCP-server over stdio ─────────────────────────────────────────

async fn lees_bericht<R: AsyncBufReadExt + Unpin>(reader: &mut R) -> Value {
    let mut regel = String::new();
    let n = timeout(Duration::from_secs(60), reader.read_line(&mut regel))
        .await
        .expect("timeout bij het wachten op een antwoord")
        .expect("read_line mislukt");
    assert!(n > 0, "EOF op stdout — de server is onverwacht gestopt");
    serde_json::from_str(regel.trim()).unwrap()
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
    let mut stdin = child.stdin.take().unwrap();
    let mut reader = BufReader::new(child.stdout.take().unwrap());
    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "drie-wegen-doorbuigingsnoemer", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");
    (child, stdin, reader)
}

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
    assert_eq!(
        resp["result"]["isError"], false,
        "{tool} gaf een fout in plaats van een weigering per staaf: {resp}"
    );
    resp["result"]["structuredContent"].clone()
}

// ── De eis ──────────────────────────────────────────────────────────────────

/// Geen toetsen, status NotApplicable, en een reden die het veld noemt.
fn eis_geweigerd(r: &Value, trefwoord: &str, wat: &str) {
    assert_eq!(r["status"], json!("NotApplicable"), "{wat}: status in {r}");
    assert_eq!(r["checks"], json!([]), "{wat}: er is toch getoetst");
    let reden = r["governing_check_id"].as_str().unwrap_or("");
    assert!(
        reden.starts_with("ERROR: ") && reden.contains(trefwoord) && reden.contains("niet getoetst"),
        "{wat}: reden ontbreekt of is onduidelijk: {reden:?}"
    );
}

#[tokio::test]
async fn staal_custom_noemer_nul_en_negatief_langs_de_drie_wegen() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    let mut id = 10;
    let gevallen = [
        (staal("Custom", 0, 0.0), "'Custom'", "Custom, noemer 0"),
        (staal("Custom", -300, 0.0), "'Custom'", "Custom, noemer -300"),
        (staal("Floor", 333, -150.0), "w_add", "Floor, w_add-noemer -150"),
    ];
    for (invoer, trefwoord, wat) in gevallen {
        id += 1;
        let tauri = weg_tauri_staal(&invoer);
        let brug = weg_toetsbrug("check_steel_beams", &invoer);
        let mcp = weg_mcp(&mut stdin, &mut reader, id, "check_steel_beam", invoer.clone()).await;
        eis_geweigerd(&tauri, trefwoord, &format!("Tauri, {wat}"));
        eis_geweigerd(&brug, trefwoord, &format!("toetsbrug, {wat}"));
        eis_geweigerd(&mcp, trefwoord, &format!("MCP, {wat}"));
        assert_eq!(tauri, brug, "{wat}: Tauri en toetsbrug lopen uiteen");
        assert_eq!(tauri, mcp, "{wat}: Tauri en MCP lopen uiteen");
    }
    let _ = child.kill().await;
}

/// Eén foute staaf laat de andere staven in dezelfde aanroep ongemoeid.
#[tokio::test]
async fn een_foute_staalnoemer_neemt_de_andere_staven_niet_mee() {
    let goed = staal("Floor", 333, 0.0);
    let fout = staal("Custom", -1, 0.0);
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": "check_steel_beams", "inputs": [goed, fout] }))
            .unwrap();
    let antwoord = toetsbrug::behandel(verzoek).expect("de aanroep als geheel slaagt");
    let lijst = antwoord.as_array().unwrap();
    assert_eq!(lijst.len(), 2);
    assert_ne!(lijst[0]["status"], json!("NotApplicable"), "de goede staaf is getoetst");
    eis_geweigerd(&lijst[1], "'Custom'", "tweede staaf, noemer -1");
}

#[tokio::test]
async fn hout_en_clt_noemer_nul_en_negatief_langs_de_drie_wegen() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    let mut id = 100;
    for (veld, trefwoord) in [("deflection_limit_fin", "w_fin"), ("deflection_limit_add", "w_add")] {
        for n in [0.0, -250.0] {
            id += 1;
            let wat = format!("hout, {veld} = {n}");
            let invoer = hout(veld, n);
            let tauri = weg_tauri_hout(&invoer);
            let brug = weg_toetsbrug("check_timber_beams", &invoer);
            let mcp = weg_mcp(&mut stdin, &mut reader, id, "check_timber_beams", json!({ "inputs": [invoer] }))
                .await["results"][0]
                .clone();
            for (weg, r) in [("Tauri", &tauri), ("toetsbrug", &brug), ("MCP", &mcp)] {
                eis_geweigerd(r, trefwoord, &format!("{weg}, {wat}"));
            }
            assert_eq!(tauri, brug, "{wat}");
            assert_eq!(tauri, mcp, "{wat}");

            id += 1;
            let wat = format!("CLT, {veld} = {n}");
            let invoer = clt(veld, n);
            let tauri = weg_tauri_clt(&invoer);
            let brug = weg_toetsbrug("check_clt_beams", &invoer);
            let mcp = weg_mcp(&mut stdin, &mut reader, id, "check_clt_beams", json!({ "inputs": [invoer] }))
                .await["results"][0]
                .clone();
            for (weg, r) in [("Tauri", &tauri), ("toetsbrug", &brug), ("MCP", &mcp)] {
                eis_geweigerd(r, trefwoord, &format!("{weg}, {wat}"));
            }
            assert_eq!(tauri, brug, "{wat}");
            assert_eq!(tauri, mcp, "{wat}");
        }
    }
    let _ = child.kill().await;
}
