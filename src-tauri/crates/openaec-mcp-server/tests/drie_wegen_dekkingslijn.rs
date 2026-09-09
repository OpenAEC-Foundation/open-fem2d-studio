//! Drie-wegen-verificatie voor de DEKKINGSLIJN (NEN-EN 1992-1-1 §9.2.1.3 met
//! figuur 9.2, en §6.2 voor de dwarskracht).
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
//! bestaat. Dit bestand bewaakt of zij ook hetzelfde ANTWOORD geven, en of dat
//! antwoord de dingen bevat die een dekkingslijn moet dragen. Drie wegen kunnen
//! namelijk ook samen verschuiven; daarom staan er ankerwaarden bij die met de
//! hand uit de norm volgen.
//!
//! DE STAAF
//! Vrij opgelegde ligger van 6000 mm, doorsnede 300 × 600, C30/37, B500B.
//! Onderwapening gestaffeld 3Ø16 / 5Ø16 / 3Ø16 met grenzen op 1500 en 4500 mm,
//! bovenwapening 2Ø12 doorlopend, beugels Ø8 in drie zones (verdicht bij de
//! steunpunten). De omhullende is een parabolische momentenlijn zonder
//! normaalkracht, bemonsterd op de zonegrenzen én daartussen — precies zoals
//! de app hem levert nu `bouwMultiInput` op elke zonegrens een rekenknoop zet.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");
const TOOL: &str = "concrete_dekkingslijn";
const L_MM: f64 = 6000.0;

// ── De invoer ───────────────────────────────────────────────────────────────

fn langs(side: &str, count: u32, diameter: f64, x0: f64, x1: f64) -> Value {
    json!({
        "side": side,
        "row": { "count": count, "diameter_mm": diameter },
        "x_start_mm": x0,
        "x_end_mm": x1
    })
}

fn beugels(x0: f64, x1: f64, s: f64) -> Value {
    json!({ "x_start_mm": x0, "x_end_mm": x1, "spacing_mm": s, "legs": 2, "diameter_mm": 8.0 })
}

/// De omhullende: M(x) = 4·M_max·t·(1 − t) met M_max = 120 kNm, en V = dM/dx.
///
/// De stations liggen op de VIER zonegrenzen en daartussen. Dat is geen
/// versiering: op een zonegrens springt de weerstand, en zonder station daar
/// zou de lijn een benodigde kracht van elders naast een weerstand van hier
/// zetten. In de app zorgt `SolverBeamInput.extraSneden` daarvoor.
fn omhullende() -> Value {
    let stations = [
        0.0, 500.0, 1000.0, 1500.0, 2000.0, 2500.0, 3000.0, 3500.0, 4000.0, 4500.0, 5000.0,
        5500.0, L_MM,
    ];
    Value::Array(
        stations
            .iter()
            .map(|&x| {
                let t = x / L_MM;
                let m = 4.0 * 120.0 * t * (1.0 - t);
                let v = 4.0 * 120.0 * (1.0 - 2.0 * t) / (L_MM / 1000.0);
                json!({
                    "combination_id": 1,
                    "position_mm": x,
                    "forces": {
                        "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": v,
                        "mt_ed": 0.0, "my_ed": m, "mz_ed": 0.0
                    }
                })
            })
            .collect::<Vec<_>>(),
    )
}

fn staaf() -> Value {
    json!({
        "beam_id": 7,
        "section": {
            "shape": "Rectangle", "b_mm": 300.0, "h_mm": 600.0,
            "b_w_mm": null, "h_f_mm": null, "flange_at_bottom": false
        },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0,
            "stirrup_diameter_mm": 8.0,
            "bottom": { "count": 3, "diameter_mm": 16.0 },
            "top": { "count": 2, "diameter_mm": 12.0 },
            "stirrup_spacing_mm": 200.0,
            "stirrup_legs": 2
        },
        "reinforcement_zones": {
            "longitudinal": [
                langs("Bottom", 3, 16.0, 0.0, 1500.0),
                langs("Bottom", 5, 16.0, 1500.0, 4500.0),
                langs("Bottom", 3, 16.0, 4500.0, L_MM),
                langs("Top", 2, 12.0, 0.0, L_MM)
            ],
            "stirrups": [
                beugels(0.0, 1000.0, 100.0),
                beugels(1000.0, 5000.0, 200.0),
                beugels(5000.0, L_MM, 100.0)
            ]
        },
        "length_m": L_MM / 1000.0,
        "forces_envelope": omhullende()
    })
}

/// Het verzoek zoals de frontendbouwer het samenstelt: de staaf onder `beam`,
/// en géén van de vier keuzes ingevuld. Dat laatste is óók een test — een weg
/// die er zelf een z of een cot θ in zou zetten, valt hier door de mand.
fn verzoek() -> Value {
    json!({ "beam": staaf() })
}

// ── Weg 1: de rekengang achter het Tauri-command ────────────────────────────

/// Letterlijk de body van `concrete_dekkingslijn` uit `src-tauri/src/lib.rs`.
fn weg_tauri(invoer: &Value) -> Result<Value, String> {
    let req: concrete_check::DekkingslijnVerzoek =
        serde_json::from_value(invoer.clone()).expect("DekkingslijnVerzoek");
    let uit = concrete_check::dekkingslijn(req)?;
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
                "clientInfo": { "name": "drie-wegen-dekkingslijn", "version": "0.0.0" }
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

/// Dezelfde staaf, drie wegen, één antwoord — veld voor veld.
#[tokio::test]
async fn de_drie_wegen_leveren_dezelfde_dekkingslijn() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let inv = verzoek();
    let tauri = weg_tauri(&inv).expect("Tauri-weg");
    let brug = weg_toetsbrug(inv.clone()).expect("toetsbrug-weg");
    let mcp = weg_mcp(&mut stdin, &mut reader, 700, inv).await.expect("MCP-weg");

    eis_gelijk("Tauri-command", &tauri, "toetsbrug", &brug);
    eis_gelijk("toetsbrug", &brug, "MCP-server", &mcp);

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// De uitkomst zelf, met ankerwaarden die uit de norm volgen en niet uit een
/// vorige uitdraai:
///
/// * De staffeling 3/5/3 levert TWEE bundels in de zin van figuur 9.2 — de
///   doorgaande 3Ø16 over [0, L] en de bijgelegde 2Ø16 over [1500, 4500].
/// * Op elke zonegrens staan TWEE punten met dezelfde x, links en rechts van
///   de sprong (§9.2.1.3: de weerstand springt daar, en interpoleren over een
///   sprong heeft geen betekenis).
/// * De volle trekkracht springt op x = 1500 mm van 3 naar 5 staven, dus met
///   de verhouding 5/3.
/// * §9.2.1.4/§9.2.1.5 leveren aan BEIDE uiteinden een eis.
#[tokio::test]
async fn de_uitkomst_zelf_staat_vast() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    let uit = weg_mcp(&mut stdin, &mut reader, 701, verzoek())
        .await
        .expect("MCP-weg");

    assert_eq!(uit["beam_id"], json!(7), "het staafnummer reist mee");
    assert!(
        (uit["lengte_mm"].as_f64().unwrap() - L_MM).abs() < 1e-9,
        "de staaflengte hoort onveranderd terug te komen"
    );
    assert!(
        uit["a_l_artikel"].as_str().unwrap().contains("9.2.1.3(2)"),
        "met beugels berust a_l op (9.2): {}",
        uit["a_l_artikel"]
    );
    assert!(
        uit["a_l_mm"].as_f64().unwrap() > 0.0,
        "zonder verschuiving is regel B gelijk aan regel A"
    );

    let bundels = uit["onder"]["bundels"].as_array().expect("bundels");
    assert_eq!(
        bundels.len(),
        2,
        "staffeling 3/5/3 = doorgaande 3Ø16 plus bijgelegde 2Ø16, niet drie zones"
    );
    let bij = bundels
        .iter()
        .find(|b| b["aantal"] == json!(2))
        .expect("de bijgelegde bundel van 2Ø16");
    assert!((bij["x_start_mm"].as_f64().unwrap() - 1500.0).abs() < 1.0);
    assert!((bij["x_end_mm"].as_f64().unwrap() - 4500.0).abs() < 1.0);
    assert!(
        bij["l_bd_mm"].as_f64().unwrap() > 0.0
            && bij["verankering"]["f_bd_mpa"].as_f64().unwrap() > 0.0,
        "zonder l_bd en f_bd loopt de schuine tak van figuur 9.2 niet"
    );

    // Twee punten op elke langsgrens, en de volle trekkracht springt daar met
    // 5/3 — dat is zuivere staaftelling en dus een echte ankerwaarde.
    for grens in [1500.0_f64, 4500.0] {
        let op: Vec<&Value> = uit["onder"]["punten"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| (p["x_mm"].as_f64().unwrap() - grens).abs() < 1e-6)
            .collect();
        assert_eq!(op.len(), 2, "op x = {grens} mm horen twee punten te staan");
        assert!(op.iter().any(|p| p["zijde"] == json!("Links")));
        assert!(op.iter().any(|p| p["zijde"] == json!("Rechts")));
    }
    {
        let punten = uit["onder"]["punten"].as_array().unwrap();
        let vol = |zijde: &str| -> f64 {
            punten
                .iter()
                .find(|p| {
                    (p["x_mm"].as_f64().unwrap() - 1500.0).abs() < 1e-6 && p["zijde"] == json!(zijde)
                })
                .expect("punt op de zonegrens")["aanwezig_volledig_kn"]
                .as_f64()
                .unwrap()
        };
        let (links, rechts) = (vol("Links"), vol("Rechts"));
        assert!(
            (rechts / links - 5.0 / 3.0).abs() < 1e-9,
            "de volle trekkracht hoort met 5/3 te springen: {links} → {rechts} kN"
        );
    }

    // De beugelzones springen op 1000 en 5000 mm; ook daar hoort de lijn twee
    // punten te dragen.
    for grens in [1000.0_f64, 5000.0] {
        let op = uit["dwarskracht"]["punten"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| (p["x_mm"].as_f64().unwrap() - grens).abs() < 1e-6)
            .count();
        assert_eq!(op, 2, "op x = {grens} mm springt de beugelweerstand");
    }

    let steun = uit["steunpunten"].as_array().expect("steunpunten");
    assert_eq!(steun.len(), 2, "§9.2.1.5(1) geldt aan elk uiteinde");
    assert!(steun.iter().any(|s| s["uiteinde"] == json!("Begin")));
    assert!(steun.iter().any(|s| s["uiteinde"] == json!("Eind")));

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een normaalkracht ZONDER opgegeven z faalt langs alle drie de wegen, met
/// dezelfde reden: 6.2.3(1) staat z = 0,9·d uitsluitend toe "voor gewapend
/// beton zonder normaalkracht". Stilzwijgend 0,9·d invullen zou de benodigde
/// trekkracht te laag maken, en een te lage benodigde kracht is in een
/// dekkingslijn niet te zien.
#[tokio::test]
async fn normaalkracht_zonder_z_faalt_langs_alle_drie_de_wegen() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut inv = verzoek();
    for p in inv["beam"]["forces_envelope"].as_array_mut().unwrap() {
        p["forces"]["n_ed"] = json!(-250.0);
    }

    let tauri = weg_tauri(&inv).expect_err("de Tauri-weg hoort te falen");
    let brug = weg_toetsbrug(inv.clone()).expect_err("de toetsbrug hoort te falen");
    let mcp = weg_mcp(&mut stdin, &mut reader, 702, inv)
        .await
        .expect_err("de MCP-weg hoort te falen");

    for (weg, melding) in [("Tauri", &tauri), ("toetsbrug", &brug), ("MCP", &mcp)] {
        assert!(
            melding.contains("6.2.3(1)"),
            "de {weg}-weg hoort het artikel te noemen: {melding}"
        );
    }

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Dezelfde staaf MET een opgegeven z levert wél een lijn, en die z komt
/// onveranderd terug. Zonder deze test zou de weigering hierboven ook door een
/// verkeerde reden kunnen ontstaan.
#[tokio::test]
async fn met_opgegeven_z_komt_de_lijn_er_wel() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut inv = verzoek();
    for p in inv["beam"]["forces_envelope"].as_array_mut().unwrap() {
        p["forces"]["n_ed"] = json!(-250.0);
    }
    inv["z_mm"] = json!(500.0);

    let uit = weg_mcp(&mut stdin, &mut reader, 703, inv.clone())
        .await
        .expect("met opgegeven z hoort de lijn er te zijn");
    assert!((uit["z_voor_a_l_mm"].as_f64().unwrap() - 500.0).abs() < 1e-9);
    eis_gelijk(
        "MCP-server",
        &uit,
        "Tauri-command",
        &weg_tauri(&inv).expect("Tauri-weg"),
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een tikfout in een veldnaam wordt GEWEIGERD en niet stil genegeerd. Het
/// verzoektype staat op `deny_unknown_fields` en het MCP-schema op
/// `additionalProperties: false`; zonder die twee zou `z_m` in plaats van
/// `z_mm` stilzwijgend "niet opgegeven" betekenen en de lijn veranderen.
#[tokio::test]
async fn een_tikfout_in_een_veldnaam_wordt_geweigerd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut inv = verzoek();
    inv["z_m"] = json!(500.0);

    assert!(weg_toetsbrug(inv.clone()).is_err(), "de toetsbrug hoort dit te weigeren");
    assert!(
        weg_mcp(&mut stdin, &mut reader, 704, inv).await.is_err(),
        "de MCP-server hoort dit te weigeren"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
