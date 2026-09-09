//! Drie-wegen-verificatie voor de betondekking (NEN-EN 1992-1-1 art. 4.4.1,
//! met de Nederlandse nationale bijlage).
//!
//! DE REGEL
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. de MCP-server (deze crate).
//!
//! Vergeet er één en de rekengang werkt maar in één omgeving. Deze test stuurt
//! dezelfde JSON door alle drie de wegen en eist veld voor veld hetzelfde
//! antwoord, plus ankerwaarden die met de hand uit tabel 4.4N en (4.1)/(4.2)
//! zijn nagerekend — drie wegen kunnen ook samen verschuiven.
//!
//! DE GETALLEN
//! Referentiebalk 300 × 500, beugel Ø8, onder 3Ø16 — dezelfde korf als de
//! overige betontests. Bij milieuklasse XD3 en constructieklasse S4 (de
//! NB-waarde voor 50 jaar):
//!
//! ```text
//!   c_min,dur = 40 mm            tabel 4.4N (NB-versie), rij S4, kolom XD3/XS3
//!   c_min,b   =  8 mm            tabel 4.2 — de beugel is de buitenste wapening
//!   c_min     = max{8; 40+0-0-0; 10} = 40 mm                            (4.2)
//!   c_nom     = 40 + 5 = 45 mm   Δc_dev = 5 mm volgens de NB            (4.1)
//! ```
//!
//! De 20 mm die de gebruiker in de proef invulde is dus fout, met UC = 2,25.
//!
//! WEGLATEN IS OOK EEN TEST
//! `beam_id` en `structural_class` staan met opzet NIET in de eerste invoer:
//! beide hebben `#[serde(default)]`, en een weg die daar zijn eigen waarde zou
//! invullen valt hier door de mand.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");
const TOOL: &str = "concrete_cover_check";
const LIJST_TOOL: &str = "list_exposure_classes";

// ── De invoer ───────────────────────────────────────────────────────────────

/// De referentiebalk in een parkeergarage-vloer: XD3, dekking 20 mm.
/// `structural_class` blijft weg en moet op S4 uitkomen.
fn invoer_xd3_te_dun() -> Value {
    json!({
        "exposure_class": "XD3",
        "cover_mm": 20.0,
        "stirrup_diameter_mm": 8.0,
        "max_bar_diameter_mm": 16.0
    })
}

/// Dezelfde balk binnen, XC1, met een gangbare dekking van 30 mm.
fn invoer_xc1_ruim() -> Value {
    json!({
        "beam_id": 12,
        "exposure_class": "XC1",
        "structural_class": "S4",
        "cover_mm": 30.0,
        "stirrup_diameter_mm": 8.0,
        "max_bar_diameter_mm": 16.0
    })
}

/// Een vorst/dooi-klasse: tabel 4.4N kent hem niet.
fn invoer_xf4() -> Value {
    json!({
        "exposure_class": "XF4",
        "cover_mm": 30.0,
        "stirrup_diameter_mm": 8.0,
        "max_bar_diameter_mm": 16.0
    })
}

/// De vloer met twee milieus: de bovenzijde binnen (XC1, 25 mm), de onderzijde
/// buiten (XC4, 40 mm). Twee verzoeken, elk met hun eigen zijde —
/// 4.4.1.1(1)P meet de dekking tot het DICHTSTBIJZIJNDE betonoppervlak, dus de
/// toets is er één per oppervlak.
fn invoer_bovenzijde_binnen() -> Value {
    json!({
        "beam_id": 31,
        "side": "Top",
        "exposure_class": "XC1",
        "cover_mm": 25.0,
        "stirrup_diameter_mm": 0.0,
        "max_bar_diameter_mm": 10.0
    })
}

fn invoer_onderzijde_buiten() -> Value {
    json!({
        "beam_id": 31,
        "side": "Bottom",
        "exposure_class": "XC4",
        "cover_mm": 40.0,
        "stirrup_diameter_mm": 0.0,
        "max_bar_diameter_mm": 12.0
    })
}

/// Onzin: een negatieve dekking. Moet langs alle drie de wegen een FOUT geven.
fn invoer_negatieve_dekking() -> Value {
    json!({
        "exposure_class": "XC1",
        "cover_mm": -5.0,
        "stirrup_diameter_mm": 8.0,
        "max_bar_diameter_mm": 16.0
    })
}

// ── Weg 1: de rekengang achter het Tauri-command ────────────────────────────

/// Letterlijk de body van `concrete_cover_check` uit `src-tauri/src/lib.rs`.
fn weg_tauri(invoer: &Value) -> Result<Value, String> {
    let req: nen_en_1992_1_1::ConcreteCoverRequest =
        serde_json::from_value(invoer.clone()).expect("ConcreteCoverRequest");
    let uit = nen_en_1992_1_1::dekking::concrete_cover_request(req)?;
    Ok(serde_json::to_value(uit).expect("resultaat serialiseren"))
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

fn weg_toetsbrug(opdracht: &str, inputs: Value) -> Result<Value, String> {
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(json!({ "opdracht": opdracht, "inputs": inputs }))
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
                "clientInfo": { "name": "drie-wegen-dekking", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Roep een tool aan. Bij succes `structuredContent`, bij een toolfout de
/// meldingstekst — want dat is hier óók een uitkomst die moet kloppen.
async fn weg_mcp(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    naam: &str,
    argumenten: Value,
) -> Result<Value, String> {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": naam, "arguments": argumenten }
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

/// Weg 1 bestaat: beide commands staan in `src-tauri/src/lib.rs` én in
/// `generate_handler!`. Zonder dat tweede zijn ze voor de app onbereikbaar
/// terwijl de functies er wél staan — een storing die geen enkele andere
/// Rust-test opmerkt.
#[test]
fn weg_1_de_tauri_commands_zijn_geregistreerd() {
    let bron = tauri_lib_bron();
    let handler_start = bron
        .find("generate_handler![")
        .expect("`generate_handler!` staat niet in src-tauri/src/lib.rs");
    let handler = &bron[handler_start..];
    let handler_eind = handler.find(']').expect("`generate_handler!` is niet gesloten");
    let handler = &handler[..handler_eind];

    assert!(
        bron.contains(&format!("async fn {TOOL}(")),
        "`{TOOL}` staat niet als functie in src-tauri/src/lib.rs"
    );
    assert!(
        bron.contains(&format!("fn {LIJST_TOOL}(")),
        "`{LIJST_TOOL}` staat niet als functie in src-tauri/src/lib.rs"
    );
    for naam in [TOOL, LIJST_TOOL] {
        assert!(
            handler.contains(naam),
            "`{naam}` staat niet in generate_handler! — de app kan hem niet aanroepen"
        );
    }
}

/// Dezelfde dekking, drie wegen, één antwoord.
#[tokio::test]
async fn de_drie_wegen_leveren_hetzelfde_oordeel() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    for (id, invoer) in [
        (700, invoer_xd3_te_dun()),
        (701, invoer_xc1_ruim()),
        (702, invoer_xf4()),
        // De twee zijden van dezelfde vloer: het veld `side` moet langs alle
        // drie de wegen dezelfde weg vinden, óók door het strikte
        // MCP-schema heen.
        (710, invoer_bovenzijde_binnen()),
        (711, invoer_onderzijde_buiten()),
    ] {
        let tauri = weg_tauri(&invoer).expect("Tauri-weg");
        let brug = weg_toetsbrug(TOOL, invoer.clone()).expect("toetsbrug-weg");
        let mcp = weg_mcp(&mut stdin, &mut reader, id, TOOL, invoer)
            .await
            .expect("MCP-weg");

        eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
        eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een vloer met de bovenzijde binnen en de onderzijde buiten levert twee
/// verschillende eisen op — het geval waarvoor de zijde bestaat.
///
/// XC1/S4 → c_min,dur = 15 mm → c_nom = 20 mm ≤ 25 mm: in orde.
/// XC4/S4 → c_min,dur = 30 mm → c_nom = 35 mm ≤ 40 mm: in orde.
/// Zou de onderzijde de 25 mm van de bovenzijde krijgen, dan is hij te dun.
#[tokio::test]
async fn twee_zijden_van_dezelfde_vloer_geven_twee_eisen() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let boven = weg_mcp(&mut stdin, &mut reader, 712, TOOL, invoer_bovenzijde_binnen())
        .await
        .expect("MCP-weg bovenzijde");
    assert_eq!(boven["side"], json!("Top"));
    assert_eq!(boven["c_min_dur_mm"], json!(15.0));
    assert_eq!(boven["c_nom_required_mm"], json!(20.0));
    assert_eq!(boven["status"], json!("Ok"));
    assert!(
        boven["notes"]
            .as_array()
            .expect("notes")
            .iter()
            .any(|n| n.as_str().is_some_and(|s| s.contains("bovenzijde"))),
        "de toelichting moet zeggen welke zijde is getoetst"
    );

    let onder = weg_mcp(&mut stdin, &mut reader, 713, TOOL, invoer_onderzijde_buiten())
        .await
        .expect("MCP-weg onderzijde");
    assert_eq!(onder["side"], json!("Bottom"));
    assert_eq!(onder["c_min_dur_mm"], json!(30.0));
    assert_eq!(onder["c_nom_required_mm"], json!(35.0));
    assert_eq!(onder["status"], json!("Ok"));

    // Dezelfde onderzijde met de dekking van de bovenzijde: afgekeurd.
    let mut te_dun = invoer_onderzijde_buiten();
    te_dun["cover_mm"] = json!(25.0);
    let uit = weg_mcp(&mut stdin, &mut reader, 714, TOOL, te_dun)
        .await
        .expect("MCP-weg te dun");
    assert_eq!(uit["status"], json!("NotOk"));

    // Zónder zijde verandert er geen getal — het veld is opschrift.
    let mut zonder = invoer_onderzijde_buiten();
    zonder["side"] = Value::Null;
    let kaal = weg_mcp(&mut stdin, &mut reader, 715, TOOL, zonder)
        .await
        .expect("MCP-weg zonder zijde");
    assert_eq!(kaal["side"], Value::Null);
    for veld in ["c_min_dur_mm", "c_min_mm", "c_nom_required_mm", "unity_check", "status"] {
        assert_eq!(kaal[veld], onder[veld], "{veld}");
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// De uitkomst zelf staat vast — de handberekening uit de moduletekst.
#[tokio::test]
async fn xd3_met_20_mm_wordt_afgekeurd_met_de_juiste_getallen() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let uit = weg_mcp(&mut stdin, &mut reader, 703, TOOL, invoer_xd3_te_dun())
        .await
        .expect("MCP-weg");

    assert_eq!(uit["structural_class"], json!("S4"), "NB-default voor 50 jaar");
    assert_eq!(uit["cover_column"], json!("XD3/XS3"));
    assert_eq!(uit["c_min_dur_mm"], json!(40.0));
    assert_eq!(uit["c_min_b_mm"], json!(8.0));
    assert_eq!(uit["c_min_mm"], json!(40.0));
    assert_eq!(uit["governed_by"], json!("Durability"));
    assert_eq!(uit["delta_c_dev_mm"], json!(5.0));
    assert_eq!(uit["c_nom_required_mm"], json!(45.0));
    assert_eq!(uit["c_nom_provided_mm"], json!(20.0));
    assert_eq!(uit["unity_check"], json!(2.25));
    assert_eq!(uit["status"], json!("NotOk"));
    // `beam_id` stond niet in de invoer en valt op 0 terug.
    assert_eq!(uit["beam_id"], json!(0));

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// XC1 met 30 mm is goed: c_min,dur = 15, c_nom,vereist = 20 mm.
#[tokio::test]
async fn xc1_met_30_mm_wordt_goedgekeurd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let uit = weg_mcp(&mut stdin, &mut reader, 704, TOOL, invoer_xc1_ruim())
        .await
        .expect("MCP-weg");
    assert_eq!(uit["beam_id"], json!(12));
    assert_eq!(uit["c_min_dur_mm"], json!(15.0));
    assert_eq!(uit["c_nom_required_mm"], json!(20.0));
    assert_eq!(uit["status"], json!("Ok"));

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Bij XF en XA geeft tabel 4.4N geen c_min,dur, en dat zegt het antwoord ook
/// — met de vindplaats erbij. Een verzonnen waarde zou hier het gevaarlijkst
/// zijn: XF4 is de zwaarste vorst/dooi-klasse die er is.
#[tokio::test]
async fn xf4_levert_geen_verzonnen_c_min_dur() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let uit = weg_mcp(&mut stdin, &mut reader, 705, TOOL, invoer_xf4())
        .await
        .expect("MCP-weg");
    assert_eq!(uit["c_min_dur_mm"], Value::Null);
    assert_eq!(uit["durability_term_mm"], Value::Null);
    assert_eq!(uit["cover_column"], Value::Null);
    assert_eq!(uit["c_min_mm"], json!(10.0));
    let notities = uit["notes"].as_array().expect("notes");
    assert!(
        notities.iter().any(|n| {
            let t = n.as_str().unwrap_or_default();
            t.contains("4.4.1.2(12)") && t.contains("EN 206-1")
        }),
        "de reden en de vindplaats ontbreken: {notities:?}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Onzinnige invoer is langs alle drie de wegen een FOUT met de reden, en
/// nergens een getal.
#[tokio::test]
async fn onzinnige_invoer_faalt_langs_alle_drie_de_wegen() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let invoer = invoer_negatieve_dekking();
    let tauri = weg_tauri(&invoer).unwrap_err();
    let brug = weg_toetsbrug(TOOL, invoer.clone()).unwrap_err();
    let mcp = weg_mcp(&mut stdin, &mut reader, 706, TOOL, invoer)
        .await
        .unwrap_err();

    for (weg, melding) in [("Tauri", &tauri), ("toetsbrug", &brug), ("MCP", &mcp)] {
        assert!(
            melding.contains("dekking"),
            "{weg} meldt niet wát er mis is: {melding}"
        );
    }
    assert_eq!(tauri, brug, "Tauri en toetsbrug melden verschillend");
    assert!(
        mcp.contains(&tauri),
        "de MCP-melding bevat de kernmelding niet:\n  MCP:   {mcp}\n  kern:  {tauri}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Tabel 4.1 gaat langs alle drie de wegen mee, met dezelfde achttien klassen
/// en dezelfde teksten. De MCP-weg pakt de lijst in een object in — dezelfde
/// keuze als bij `list_concrete_classes` — en dát is het enige verschil.
#[tokio::test]
async fn tabel_4_1_gaat_langs_alle_drie_de_wegen_mee() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let tauri = serde_json::to_value(nen_en_1992_1_1::EXPOSURE_CLASSES).expect("serialiseren");
    let brug = weg_toetsbrug(LIJST_TOOL, Value::Null).expect("toetsbrug-weg");
    let mcp = weg_mcp(&mut stdin, &mut reader, 707, LIJST_TOOL, json!({}))
        .await
        .expect("MCP-weg");

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp["classes"]);

    let klassen = tauri.as_array().expect("lijst");
    assert_eq!(klassen.len(), 18, "tabel 4.1 telt achttien milieuklassen");
    assert_eq!(klassen[0]["name"], json!("X0"));
    assert_eq!(klassen[7]["name"], json!("XD3"));
    assert_eq!(klassen[7]["description"], json!("Wisselend nat en droog"));
    assert_eq!(klassen[7]["cover_column"], json!("XD3/XS3"));
    // XF en XA hebben geen kolom in tabel 4.4N.
    for k in klassen.iter() {
        let naam = k["name"].as_str().unwrap();
        let heeft_kolom = !k["cover_column"].is_null();
        assert_eq!(
            heeft_kolom,
            !(naam.starts_with("XF") || naam.starts_with("XA")),
            "{naam} heeft de verkeerde kolomstatus in tabel 4.4N"
        );
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
