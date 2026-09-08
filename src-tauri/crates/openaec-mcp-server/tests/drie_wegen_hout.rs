//! Drie-wegen-verificatie voor hout en kruislaaghout (NEN-EN 1995-1-1).
//!
//! DE REGEL
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. de MCP-server (deze crate).
//!
//! Voor hout bestonden alleen de eerste twee: `list_timber_grades`,
//! `check_timber_beams`, `list_clt_presets` en `check_clt_beams` stonden in
//! `generate_handler!` en in de toetsbrug, maar de MCP-server kende ze niet —
//! terwijl zijn `generate_steel_report_pdf` wél `timber_check_results`
//! accepteert. De rapportweg beloofde dus hout dat langs die weg niet te maken
//! was. Deze test toont aan dat de derde weg er nu is en hetzelfde antwoord
//! geeft als de andere twee, veld voor veld.
//!
//! HOE ELKE WEG WORDT AANGESPROKEN — gelijk aan `drie_wegen_beton.rs`
//! * **Weg 3 (MCP)** het echtst: de test start de werkelijke binary, doet de
//!   `initialize`-handshake en roept `tools/call` aan over stdio.
//! * **Weg 2 (toetsbrug)** roept `toetsbrug::behandel` aan — dezelfde functie
//!   die de binary op elke regel stdin uitvoert.
//! * **Weg 1 (Tauri-command)** kan niet als command worden aangeroepen zonder
//!   de hele Tauri-runtime op te tuigen; daarom wordt de rekengang van het
//!   command hier letterlijk uitgevoerd. Dat het command ook gerégistreerd is,
//!   bewaakt `drie_wegen_kruistabel.rs`.
//!
//! DE GETALLEN
//! De twee houten staven zijn die uit
//! `timber-check/tests/referentie_raamwerk.rs`: het houten raamwerk met C24
//! 96 x 450, klimaatklasse 1, duurklasse middellang. De CLT-plaat is de
//! vijflaagse 40/20/40/20/40 uit de eigen test van `timber-check/src/clt.rs`.
//! Hier is geen getal verzonnen; de ankerwaarden onderaan zijn die van de
//! referentie, zodat deze test ook merkt dat alle drie de wegen tegelijk
//! verschuiven.
//!
//! WEGLATEN IS OOK EEN TEST
//! De velden met een standaardwaarde (`k_cr`, `load_sharing`, `ltb_load_case`,
//! `ltb_load_position`, `deflection_limit_fin`, `deflection_limit_add`) staan
//! met opzet NIET in de invoer, behalve waar de referentie ervan afwijkt. Een
//! weg die zijn eigen standaardwaarde zou kiezen, valt hier door de mand.

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

/// Staaf 2 van de referentie — de ligger, L = 6342 mm, envelop van
/// combinatie 1.2. Maatgevend is de kiptoets 6.3.3 met UC 2,40.
fn invoer_ligger() -> Value {
    json!({
        "beam_id": 2,
        "width_mm": 96.0,
        "height_mm": 450.0,
        "strength_class": "C24",
        "service_class": "Sc1",
        "load_duration": "MediumTerm",
        "length_m": 6.342,
        "forces_envelope": [
            punt(0.0, -57.64, 75.568, -67.176),
            punt(1034.0, -57.64, 54.384, 0.0),
            punt(3688.0, -57.64, 0.0, 72.170),
            punt(6342.0, -57.64, -54.488, -0.515)
        ],
        "buckling_length_y_m": 6.342,
        "buckling_length_z_m": 1.268,
        "ltb_segment_length_m": 1.268,
        // De referentie rekent feitelijk met l_ef = de kipsteunafstand; daarom
        // hier expliciet, net als in de Rust-test.
        "ltb_effective_length_override_m": 1.268,
        "deflection_inst_mm": -24.5,
        "deflection_quasi_perm_mm": -24.5,
        "deflection_permanent_mm": -24.5
    })
}

/// Staaf 1 van de referentie — de schuine kolom, L = 3313 mm. Andere tak van
/// de orchestrator dan de ligger: de kiptoets blijft weg en 6.3.2 is
/// maatgevend met UC 1,74.
fn invoer_kolom() -> Value {
    json!({
        "beam_id": 1,
        "width_mm": 96.0,
        "height_mm": 450.0,
        "strength_class": "C24",
        "service_class": "Sc1",
        "load_duration": "MediumTerm",
        "length_m": 3.313,
        "forces_envelope": [
            punt(0.0, -93.532, -20.125, -0.143),
            punt(3313.0, -92.812, 20.463, -66.964)
        ],
        "buckling_length_y_m": 3.313,
        "buckling_length_z_m": 3.313,
        "perform_ltb_check": false,
        "deflection_inst_mm": -4.3,
        "deflection_quasi_perm_mm": -4.3,
        "deflection_permanent_mm": -4.3
    })
}

/// De vijflaagse CLT-plaat 40/20/40/20/40 in C24, strook van 1000 mm,
/// M_max = 20 kNm in het veld en V_max = 10 kN bij de oplegging, L = 5 m.
fn invoer_clt() -> Value {
    let laag = |t: f64, richting: &str| {
        json!({ "thickness_mm": t, "orientation": richting, "strength_class": "C24" })
    };
    json!({
        "beam_id": 7,
        "layup": {
            "width_mm": 1000.0,
            "layers": [
                laag(40.0, "Longitudinal"),
                laag(20.0, "Transverse"),
                laag(40.0, "Longitudinal"),
                laag(20.0, "Transverse"),
                laag(40.0, "Longitudinal")
            ]
        },
        "service_class": "Sc1",
        "load_duration": "MediumTerm",
        "length_m": 5.0,
        "forces_envelope": [
            punt(0.0, 0.0, 10.0, 0.0),
            punt(2500.0, 0.0, 0.0, 20.0),
            punt(5000.0, 0.0, -10.0, 0.0)
        ]
    })
}

// ── Weg 1: de rekengang achter het Tauri-command ────────────────────────────

/// Letterlijk de body van `check_timber_beams` uit `src-tauri/src/lib.rs`.
fn weg_tauri_hout(invoer: &Value) -> Value {
    let inputs: Vec<timber_check::TimberBeamCheckInput> =
        serde_json::from_value(json!([invoer])).expect("TimberBeamCheckInput");
    let uit = timber_check::check_all_timber_beams(inputs);
    serde_json::to_value(&uit[0]).expect("resultaat serialiseren")
}

/// Letterlijk de body van `check_clt_beams` uit `src-tauri/src/lib.rs`.
fn weg_tauri_clt(invoer: &Value) -> Value {
    let inputs: Vec<timber_check::clt::CltBeamCheckInput> =
        serde_json::from_value(json!([invoer])).expect("CltBeamCheckInput");
    let uit = timber_check::clt::check_all_clt_beams(inputs);
    serde_json::to_value(&uit[0]).expect("resultaat serialiseren")
}

// ── Weg 2: de toetsbrug ─────────────────────────────────────────────────────

/// Dezelfde functie die de toetsbrug-binary op zijn invoer uitvoert.
fn weg_toetsbrug(opdracht: &str, inputs: Option<Value>) -> Value {
    let mut verzoek = json!({ "opdracht": opdracht });
    if let Some(i) = inputs {
        verzoek["inputs"] = i;
    }
    let verzoek: toetsbrug::Verzoek =
        serde_json::from_value(verzoek).expect("toetsbrug-verzoek");
    toetsbrug::behandel(verzoek).unwrap_or_else(|e| panic!("toetsbrug {opdracht}: {e}"))
}

/// De eerste (en enige) staaf uit een toetsbrug-antwoord.
fn eerste(antwoord: &Value) -> Value {
    antwoord
        .as_array()
        .expect("de toetsbrug levert een lijst")
        .first()
        .expect("één staaf erin, één resultaat eruit")
        .clone()
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
                "clientInfo": { "name": "drie-wegen-hout", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Roep één gereedschap aan en geef `structuredContent` terug. Een toolfout
/// laat de test vallen met de melding erbij — een fout mag hier nooit als "leeg
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
        "MCP-gereedschap {tool} gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    result["structuredContent"].clone()
}

// ── Vergelijking ────────────────────────────────────────────────────────────

/// Eerste verschil tussen twee antwoorden, met het pad erbij. `None` = gelijk.
///
/// Bewust géén `assert_eq!` op de hele boom: die drukt bij een houtresultaat
/// honderden regels JSON af en dan is niet te zien wélk veld verschilt.
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

fn getal(v: &Value, sleutel: &str) -> f64 {
    v[sleutel]
        .as_f64()
        .unwrap_or_else(|| panic!("{sleutel} is geen getal: {}", v[sleutel]))
}

// ── De tests ────────────────────────────────────────────────────────────────

/// De kern: dezelfde houten staaf, drie wegen, één antwoord.
#[tokio::test]
async fn de_drie_wegen_toetsen_dezelfde_houten_staaf_gelijk() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    for (naam, invoer, uc_verwacht, maatgevend) in [
        ("ligger", invoer_ligger(), 2.40, "6.3.3_beam_stability"),
        // De kolom hoort in dezelfde lus: `perform_ltb_check: false` laat een
        // toets weg, en een weg die die vlag anders leest zou hier een ANDERE
        // maatgevende toets opleveren.
        ("kolom", invoer_kolom(), 1.74, "6.3.2_column_stability"),
    ] {
        let tauri = weg_tauri_hout(&invoer);
        let brug = eerste(&weg_toetsbrug("check_timber_beams", Some(json!([invoer]))));
        let mcp = weg_mcp(
            &mut stdin,
            &mut reader,
            10,
            "check_timber_beams",
            json!({ "inputs": [invoer] }),
        )
        .await;
        let mcp = mcp["results"]
            .as_array()
            .expect("het gereedschap levert `results`")
            .first()
            .expect("één staaf erin, één resultaat eruit")
            .clone();

        eis_gelijk(
            &format!("{naam}: het Tauri-command"),
            &tauri,
            "de toetsbrug",
            &brug,
        );
        eis_gelijk(
            &format!("{naam}: het Tauri-command"),
            &tauri,
            "de MCP-server",
            &mcp,
        );

        // Ankerwaarden van de referentie-uitwerking: als alle drie de wegen
        // tegelijk verschuiven, merkt de vergelijking hierboven niets.
        assert!(
            (getal(&mcp, "uc_max") - uc_verwacht).abs() / uc_verwacht < 5e-3,
            "{naam}: uc_max {} wijkt af van de referentie {uc_verwacht}",
            getal(&mcp, "uc_max")
        );
        assert_eq!(mcp["governing_check_id"], json!(maatgevend), "{naam}");
        assert_eq!(mcp["section_name"], json!("96 x 450"), "{naam}");
        assert_eq!(mcp["strength_class"], json!("C24"), "{naam}");
    }

    let _ = child.kill().await;
}

/// Dezelfde CLT-plaat, drie wegen, één antwoord — inclusief de toets per lamel
/// en de uitgewerkte opbouw.
#[tokio::test]
async fn de_drie_wegen_toetsen_dezelfde_clt_plaat_gelijk() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    let invoer = invoer_clt();

    let tauri = weg_tauri_clt(&invoer);
    let brug = eerste(&weg_toetsbrug("check_clt_beams", Some(json!([invoer]))));
    let mcp = weg_mcp(
        &mut stdin,
        &mut reader,
        20,
        "check_clt_beams",
        json!({ "inputs": [invoer] }),
    )
    .await;
    let mcp = mcp["results"]
        .as_array()
        .expect("het gereedschap levert `results`")
        .first()
        .expect("één staaf erin, één resultaat eruit")
        .clone();

    eis_gelijk("het Tauri-command", &tauri, "de toetsbrug", &brug);
    eis_gelijk("het Tauri-command", &tauri, "de MCP-server", &mcp);

    // Ankerwaarden uit de handberekening in `timber-check/src/clt.rs`.
    assert_eq!(mcp["governing_check_id"], json!("clt_6.1.6_laag_1"));
    assert!((getal(&mcp, "uc_max") - 0.3563).abs() / 0.3563 < 1e-3);
    assert!((getal(&mcp["layup"], "ei_ef_knm2") - 3344.0).abs() < 1e-6);
    assert_eq!(
        mcp["section_name"],
        json!("CLT 40/20/40/20/40 (h = 160 mm, b = 1000 mm)")
    );
    // Acht toetsen: 3 lengtelagen x 2 + 2 dwarslagen x 1 informatieve regel.
    assert_eq!(mcp["checks"].as_array().expect("checks").len(), 8);

    let _ = child.kill().await;
}

/// De twee lijsten langs de drie wegen. De MCP-weg pakt ze in een object in
/// (`structuredContent` moet een object zijn); de lijst daarbinnen hoort
/// byte-voor-byte te zijn wat de andere twee wegen kaal teruggeven.
#[tokio::test]
async fn de_drie_wegen_leveren_dezelfde_lijsten() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    // Sterkteklassen: de kern levert ze via `strength_class_names`, dezelfde
    // functie langs alle drie de wegen.
    let tauri = serde_json::to_value(nen_en_1995_1_1::strength_class_names()).unwrap();
    let brug = weg_toetsbrug("list_timber_grades", None);
    let mcp = weg_mcp(&mut stdin, &mut reader, 30, "list_timber_grades", json!({})).await;
    eis_gelijk("het Tauri-command", &tauri, "de toetsbrug", &brug);
    eis_gelijk("het Tauri-command", &tauri, "de MCP-server", &mcp["grades"]);
    // C24 en GL28h zijn de klassen waarop de referentie-uitwerkingen rusten;
    // een lijst zonder die twee maakt de houttoetsing onbruikbaar.
    for klasse in ["C24", "GL28h"] {
        assert!(
            tauri.as_array().unwrap().iter().any(|v| v == klasse),
            "`{klasse}` ontbreekt in de sterkteklassen"
        );
    }

    // CLT-voorinstellingen.
    let tauri = serde_json::to_value(nen_en_1995_1_1::clt::clt_presets()).unwrap();
    let brug = weg_toetsbrug("list_clt_presets", None);
    let mcp = weg_mcp(&mut stdin, &mut reader, 31, "list_clt_presets", json!({})).await;
    eis_gelijk("het Tauri-command", &tauri, "de toetsbrug", &brug);
    eis_gelijk("het Tauri-command", &tauri, "de MCP-server", &mcp["presets"]);
    assert!(!tauri.as_array().unwrap().is_empty());

    let _ = child.kill().await;
}

/// Het omhulsel van de toetstools is strikt: `beams` in plaats van `inputs`
/// levert een FOUT en geen lege toetsing. Zonder dat zou een verkeerd
/// geschreven aanroep als "geen staven, dus niets mis" lezen.
#[tokio::test]
async fn een_verkeerde_sleutel_is_een_fout_en_geen_lege_toetsing() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    schrijf(
        &mut stdin,
        json!({
            "jsonrpc": "2.0", "id": 40, "method": "tools/call",
            "params": {
                "name": "check_timber_beams",
                "arguments": { "beams": [invoer_ligger()] }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    let result = &resp["result"];
    assert_eq!(
        result["isError"], true,
        "een onbekende argumentsleutel hoort een fout te zijn, niet een leeg antwoord"
    );
    assert_eq!(
        result["structuredContent"]["error_code"],
        json!("ARGUMENT_ONGELDIG")
    );

    let _ = child.kill().await;
}
