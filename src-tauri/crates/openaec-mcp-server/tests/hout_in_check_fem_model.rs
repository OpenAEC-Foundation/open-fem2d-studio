//! `check_fem_model` en houten staven — end-to-end over de echte binary.
//!
//! WAT HIER MISGING
//! Een portaal met een houten ligger (C24 96×450) tussen twee stalen kolommen
//! (HEA160 S235) gaf als antwoord `results` [1, 3], `skipped_beams` [] en
//! `warnings` [], met staaf 3 als "maatgevend" (UC 0,641). De houten ligger
//! stond nergens — terwijl hij apart getoetst UC 2,856 had (kip, 6.3.3). Dat
//! gat werd eerst gedicht met een verwijzing naar `check_timber_beams`; een
//! aanroeper moest daarna zelf omhullende en zakkingen samenstellen en k_mod
//! omzeilen.
//!
//! Sinds september 2026 TOETST `check_fem_model` hout en kruislaaghout zelf:
//! de bundel bouwt de invoer met dezelfde `buildTimberCheckInputs` en
//! `buildCltCheckInputs` als de app (inclusief de belastingduur per
//! UGT-combinatie, EN 1995-1-1 3.1.3(2)), en de server voert die door
//! dezelfde `check_all_timber_beams` en `check_all_clt_beams`.
//!
//! En een tweede weg naar hetzelfde gat: de staalbouwer herkende staal aan een
//! lijst profielvoorvoegsels (HEA, HEB, …, CHS). INP, DIE, DIL, DIN en L
//! stonden daar niet in, dus een S235-staaf op zo'n catalogusprofiel verdween
//! op dezelfde manier.
//!
//! WAT DEZE TEST VASTLEGT
//! - Elke gevraagde staaf staat in precies één van `results`, `timber_results`,
//!   `clt_results` of `skipped_beams` — nooit geen van beide, nooit dubbel.
//! - Het houtresultaat van `check_fem_model` is gelijk aan wat de app-route
//!   geeft: dezelfde invoer (`timber_check_inputs`) door `check_timber_beams`.
//! - De belastingduur per combinatie komt tot in het resultaat (k_mod 0,60 bij
//!   alleen blijvende belasting, 0,90 bij wind).
//! - `governing` gaat over alle materialen en noemt het materiaal.
//! - Een tikfout in `check_config` wordt geweigerd.
//! - Catalogusprofielen worden getoetst ongeacht hun voorvoegsel.
//!
//! LET OP: dit hangt af van de ingebakken solverbundel. Na een wijziging in de
//! bouwers eerst `npm run build:sidecar`, anders meet deze test de oude bundel.
//!
//! Node ≥ 20 is een harde eis; ontbreekt hij, dan faalt deze test met die
//! melding in plaats van zichzelf stil uit te zetten.

use openaec_mcp_server::sidecar::{self, SidecarOpties};
use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

async fn eis_node() {
    let status = sidecar::status(&SidecarOpties::default()).await;
    assert!(
        status.available,
        "Deze test vereist Node.js {} of nieuwer. Gemeld: [{}] {}",
        sidecar::MINIMALE_NODE_MAJOR,
        status.error_code.unwrap_or_default(),
        status.reason.unwrap_or_default()
    );
}

/// Het portaal uit het faalscenario: staaf 2 is de houten ligger.
fn portaal_met_houten_ligger() -> Value {
    json!({
        "nodes": [
            { "id": 1, "x": 0,    "z": 0 },
            { "id": 2, "x": 0,    "z": 4000 },
            { "id": 3, "x": 6000, "z": 4000 },
            { "id": 4, "x": 6000, "z": 0 }
        ],
        "beams": [
            { "id": 1, "from": 1, "to": 2, "material": "S235", "profile": "HEA160" },
            { "id": 2, "from": 2, "to": 3, "material": "C24",  "profile": "96x450" },
            { "id": 3, "from": 3, "to": 4, "material": "S235", "profile": "HEA160" }
        ],
        "supports": [
            { "nodeId": 1, "type": "fixed" },
            { "nodeId": 4, "type": "fixed" }
        ],
        "loadCases": [ { "id": 1, "name": "Permanent", "type": "dead" } ],
        "loads": [
            { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 2, "q": -5 }
        ]
    })
}

/// Meerdere tools in één serverproces; per aanroep het `result`.
async fn roep_tools(aanroepen: &[(&str, Value)]) -> Vec<Value> {
    let mut kind = Command::new(BIN_PATH)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("de MCP-server starten");
    let mut stdin = kind.stdin.take().expect("stdin");
    let mut reader = BufReader::new(kind.stdout.take().expect("stdout"));

    let mut berichten = vec![json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": { "name": "hout-check-fem", "version": "0.0.0" }
        }
    })];
    for (i, (naam, argumenten)) in aanroepen.iter().enumerate() {
        berichten.push(json!({
            "jsonrpc": "2.0", "id": 2 + i, "method": "tools/call",
            "params": { "name": naam, "arguments": argumenten }
        }));
    }
    for bericht in &berichten {
        let mut regel = serde_json::to_string(bericht).unwrap();
        regel.push('\n');
        stdin.write_all(regel.as_bytes()).await.unwrap();
        stdin.flush().await.unwrap();
    }

    let mut antwoorden = vec![Value::Null; aanroepen.len()];
    for _ in 0..berichten.len() {
        let mut regel = String::new();
        let n = timeout(Duration::from_secs(120), reader.read_line(&mut regel))
            .await
            .expect("de server antwoordde niet binnen 120 s")
            .expect("read_line mislukte");
        assert!(n > 0, "EOF op stdout — de server stopte onverwacht");
        let bericht: Value = serde_json::from_str(regel.trim())
            .unwrap_or_else(|e| panic!("ongeldige JSON-RPC-regel {regel:?}: {e}"));
        if let Some(id) = bericht["id"].as_u64() {
            if id >= 2 {
                antwoorden[(id - 2) as usize] = bericht["result"].clone();
            }
        }
    }
    drop(stdin);
    let _ = timeout(Duration::from_secs(10), kind.wait()).await;
    antwoorden
}

async fn roep_tool(naam: &str, argumenten: Value) -> Value {
    roep_tools(&[(naam, argumenten)]).await.remove(0)
}

fn ids(uit: &Value, veld: &str) -> Vec<i64> {
    let mut v: Vec<i64> = uit[veld]
        .as_array()
        .unwrap_or_else(|| panic!("`{veld}` ontbreekt: {uit}"))
        .iter()
        .filter_map(|r| r["beam_id"].as_i64())
        .collect();
    v.sort_unstable();
    v
}

fn reden(uit: &Value, beam_id: i64) -> Option<String> {
    uit["skipped_beams"]
        .as_array()?
        .iter()
        .find(|s| s["beam_id"] == json!(beam_id))?["reason"]
        .as_str()
        .map(str::to_owned)
}

/// Elke staaf precies één keer: getoetst (staal, hout of kruislaaghout) of
/// overgeslagen, nooit geen van alle en nooit twee keer.
fn eis_sluitend(uit: &Value, gevraagd: &[i64]) {
    let mut alle: Vec<i64> = ["results", "timber_results", "clt_results", "skipped_beams"]
        .iter()
        .flat_map(|veld| ids(uit, veld))
        .collect();
    alle.sort_unstable();
    assert_eq!(
        alle, gevraagd,
        "niet elke staaf is precies één keer verantwoord (results {:?}, timber {:?}, clt {:?}, skipped {:?})",
        ids(uit, "results"), ids(uit, "timber_results"), ids(uit, "clt_results"), ids(uit, "skipped_beams")
    );
}

fn geen_fout(result: &Value) -> &Value {
    assert_eq!(
        result["isError"], false,
        "de tool gaf een fout: {}",
        result["content"][0]["text"].as_str().unwrap_or("")
    );
    &result["structuredContent"]
}

#[tokio::test]
async fn check_fem_model_toetst_de_houten_ligger_zoals_de_app() {
    eis_node().await;

    let uit = roep_tool("check_fem_model", json!({ "model": portaal_met_houten_ligger() })).await;
    let uit = geen_fout(&uit).clone();

    assert_eq!(ids(&uit, "results"), vec![1, 3], "de twee stalen kolommen");
    assert_eq!(ids(&uit, "timber_results"), vec![2], "de houten ligger wordt nu zelf getoetst");
    assert!(ids(&uit, "clt_results").is_empty());
    assert!(reden(&uit, 2).is_none(), "de getoetste ligger hoort niet in skipped_beams: {uit}");
    eis_sluitend(&uit, &[1, 2, 3]);

    // De app-route: dezelfde invoer door `check_timber_beams`. Elk getal gelijk.
    let invoer = uit["timber_check_inputs"].clone();
    assert_eq!(invoer.as_array().map(|l| l.len()), Some(1), "{invoer}");
    let los = roep_tool("check_timber_beams", json!({ "inputs": invoer })).await;
    let los = geen_fout(&los);
    assert_eq!(uit["timber_results"][0], los["results"][0], "check_fem_model en de app-route lopen uiteen");

    // Alleen een blijvend geval: elke UGT-combinatie is blijvend, k_mod 0,60.
    let lijst = uit["timber_check_inputs"][0]["load_duration_per_combination"]
        .as_array()
        .expect("de bundel stuurt de belastingduur per combinatie mee");
    assert!(!lijst.is_empty());
    assert!(lijst.iter().all(|c| c["load_duration"] == "Permanent"), "{lijst:?}");
    let hout = &uit["timber_results"][0];
    assert_eq!(hout["load_duration"], "Permanent");
    assert_eq!(hout["k_mod_per_load_duration"][0]["k_mod"], json!(0.6));

    // Maatgevend over alle materialen, met het materiaal erbij.
    let gov = &uit["governing"];
    let uc_max = [&uit["results"], &uit["timber_results"]]
        .iter()
        .flat_map(|l| l.as_array().unwrap().iter())
        .map(|r| r["uc_max"].as_f64().unwrap())
        .fold(0.0_f64, f64::max);
    assert_eq!(gov["uc_max"].as_f64(), Some(uc_max), "{gov}");
    assert!(["staal", "hout", "kruislaaghout"].contains(&gov["material"].as_str().unwrap_or("")), "{gov}");
}

/// Met alleen de houten staaf gevraagd: een resultaat en een maatgevende —
/// vroeger een leeg antwoord.
#[tokio::test]
async fn alleen_de_houten_staaf_gevraagd_geeft_een_houtresultaat() {
    eis_node().await;

    let uit = roep_tool(
        "check_fem_model",
        json!({ "model": portaal_met_houten_ligger(), "beam_ids": [2] }),
    )
    .await;
    let uit = geen_fout(&uit);
    assert!(ids(uit, "results").is_empty());
    assert_eq!(ids(uit, "timber_results"), vec![2]);
    eis_sluitend(uit, &[2]);
    assert_eq!(uit["governing"]["beam_id"], json!(2));
    assert_eq!(uit["governing"]["material"], json!("hout"));
}

/// G en W op een houten ligger: de combinatie met alleen G is blijvend (0,60),
/// die met wind leidend kort (0,90) — NB tabel 2.2.
#[tokio::test]
async fn blijvend_en_wind_krijgen_elk_hun_eigen_k_mod() {
    eis_node().await;

    let model = json!({
        "nodes": [ { "id": 1, "x": 0, "z": 0 }, { "id": 2, "x": 4000, "z": 0 } ],
        "beams": [ { "id": 1, "from": 1, "to": 2, "material": "GL24h", "profile": "140x360" } ],
        "supports": [ { "nodeId": 1, "type": "pinned" }, { "nodeId": 2, "type": "zRoller" } ],
        "loadCases": [
            { "id": 1, "name": "G", "type": "dead" },
            { "id": 2, "name": "W", "type": "wind" }
        ],
        "loads": [
            { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 1, "q": -3 },
            { "id": 2, "type": "lineLoad", "caseId": 2, "beamId": 1, "q": -2 }
        ]
    });
    let uit = roep_tool("check_fem_model", json!({ "model": model })).await;
    let uit = geen_fout(&uit);
    let kmod: Vec<(String, f64)> = uit["timber_results"][0]["k_mod_per_load_duration"]
        .as_array()
        .expect("k_mod_per_load_duration")
        .iter()
        .map(|k| (k["load_duration"].as_str().unwrap().to_owned(), k["k_mod"].as_f64().unwrap()))
        .collect();
    assert_eq!(kmod, vec![("Permanent".to_owned(), 0.60), ("ShortTerm".to_owned(), 0.90)], "{uit}");
    let basis: Vec<&str> = uit["timber_check_inputs"][0]["load_duration_per_combination"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|c| c["basis"].as_str())
        .collect();
    assert!(basis.iter().any(|b| b.contains("wind (NB tabel 2.2)")), "{basis:?}");
}

/// Een gemengd model: staal, hout, kruislaaghout, beton en een gevraagd nummer
/// dat geen staaf is. Elke staaf precies één keer, en beton met een reden.
#[tokio::test]
async fn gemengd_model_elke_staaf_precies_een_keer() {
    eis_node().await;

    let model = json!({
        "nodes": [
            { "id": 1, "x": 0, "z": 0 }, { "id": 2, "x": 4000, "z": 0 },
            { "id": 3, "x": 0, "z": 1000 }, { "id": 4, "x": 4000, "z": 1000 },
            { "id": 5, "x": 0, "z": 2000 }, { "id": 6, "x": 4000, "z": 2000 },
            { "id": 7, "x": 0, "z": 3000 }, { "id": 8, "x": 4000, "z": 3000 }
        ],
        "beams": [
            { "id": 1, "from": 1, "to": 2, "material": "S235",   "profile": "IPE 200" },
            { "id": 2, "from": 3, "to": 4, "material": "C24",    "profile": "96x300" },
            { "id": 3, "from": 5, "to": 6, "material": "C24",    "profile": "CLT 40/20/40/20/40" },
            { "id": 4, "from": 7, "to": 8, "material": "C30/37", "profile": "300x500" }
        ],
        "supports": [
            { "nodeId": 1, "type": "pinned" }, { "nodeId": 2, "type": "zRoller" },
            { "nodeId": 3, "type": "pinned" }, { "nodeId": 4, "type": "zRoller" },
            { "nodeId": 5, "type": "pinned" }, { "nodeId": 6, "type": "zRoller" },
            { "nodeId": 7, "type": "pinned" }, { "nodeId": 8, "type": "zRoller" }
        ],
        "loadCases": [ { "id": 1, "name": "G", "type": "dead" } ],
        "loads": [
            { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 1, "q": -2 },
            { "id": 2, "type": "lineLoad", "caseId": 1, "beamId": 2, "q": -2 },
            { "id": 3, "type": "lineLoad", "caseId": 1, "beamId": 3, "q": -2 },
            { "id": 4, "type": "lineLoad", "caseId": 1, "beamId": 4, "q": -2 }
        ]
    });
    let uit = roep_tool("check_fem_model", json!({ "model": model, "beam_ids": [1, 2, 3, 4, 99] })).await;
    let uit = geen_fout(&uit);
    assert_eq!(ids(uit, "results"), vec![1]);
    assert_eq!(ids(uit, "timber_results"), vec![2]);
    assert_eq!(ids(uit, "clt_results"), vec![3]);
    assert!(reden(uit, 4).unwrap_or_default().contains("check_concrete_beam"), "{uit}");
    assert!(reden(uit, 99).unwrap_or_default().starts_with("bestaat niet in het model"), "{uit}");
    eis_sluitend(uit, &[1, 2, 3, 4, 99]);
    let skipped = ids(uit, "skipped_beams");
    let mut uniek = skipped.clone();
    uniek.dedup();
    assert_eq!(skipped, uniek, "skipped_beams bevat een staaf dubbel: {}", uit["skipped_beams"]);
}

/// Een tikfout in `check_config` is een invoerfout, geen stille terugval: tot
/// september 2026 werd dit argument zonder keuring samengevoegd.
#[tokio::test]
async fn een_tikfout_in_check_config_wordt_geweigerd() {
    eis_node().await;

    let antwoorden = roep_tools(&[
        (
            "check_fem_model",
            json!({ "model": portaal_met_houten_ligger(), "check_config": { "2": { "ltbSupportSpacing": 1.5 } } }),
        ),
        (
            "check_fem_model",
            json!({ "model": portaal_met_houten_ligger(), "check_config": { "7": { "serviceClass": 2 } } }),
        ),
        (
            "check_fem_model",
            json!({ "model": portaal_met_houten_ligger(), "check_config": { "2": { "ltbSupportSpacing_m": 1.5, "loadDuration": "short" } } }),
        ),
    ])
    .await;
    // De losse fouten staan in `structuredContent.detail.fouten`; de tekst van
    // `content` draagt de samenvatting. Gezocht wordt daarom in het hele antwoord.
    for (i, a) in antwoorden.iter().take(2).enumerate() {
        assert_eq!(a["isError"], true, "aanroep {i} hoort geweigerd te worden: {a}");
        assert_eq!(a["structuredContent"]["error_code"], json!("INVOER_ONGELDIG"), "aanroep {i}: {a}");
        assert!(a.to_string().contains("check_config"), "aanroep {i}: {a}");
    }
    assert!(
        antwoorden[0].to_string().contains("ltbSupportSpacing_m"),
        "de melding hoort de bedoelde veldnaam te noemen: {}",
        antwoorden[0]
    );
    assert!(
        antwoorden[1].to_string().contains("check_config.7"),
        "een nummer dat geen staaf is, hoort genoemd te worden: {}",
        antwoorden[1]
    );
    // Geldig: de kipsteunafstand komt door, en een opgegeven "kort" maakt de
    // combinatie met alleen G niet kort (ondergrens).
    let goed = geen_fout(&antwoorden[2]);
    let inp = &goed["timber_check_inputs"][0];
    assert_eq!(inp["ltb_segment_length_m"], json!(1.5));
    assert!(
        inp["load_duration_per_combination"].as_array().unwrap().iter().all(|c| c["load_duration"] == "Permanent"),
        "{inp}"
    );
}

/// De unity check van één toets uit een houtresultaat; `None` als de toets
/// geen UC heeft (niet van toepassing).
fn uc_van(hout: &Value, id: &str) -> Option<f64> {
    let check = hout["checks"]
        .as_array()
        .expect("checks")
        .iter()
        .find(|c| c["id"] == json!(id))
        .unwrap_or_else(|| panic!("toets {id} ontbreekt: {hout}"));
    check["kind"]["data"]["uc"]["uc"].as_f64()
}

fn toets_van<'a>(hout: &'a Value, id: &str) -> &'a Value {
    hout["checks"]
        .as_array()
        .expect("checks")
        .iter()
        .find(|c| c["id"] == json!(id))
        .unwrap_or_else(|| panic!("toets {id} ontbreekt: {hout}"))
}

/// De drie houtkeuzen van `check_config` — `kCr`, `performLtbCheck` en
/// `ltbLoadPosition` — werken door tot in het resultaat van `check_fem_model`,
/// en onzin wordt door dezelfde poort geweigerd.
///
/// Tot september 2026 zette de bundel k_cr = 1,0, kiptoets aan en zwaartepunt
/// vast; wie de tabellenpagina met k_cr = 0,67 en een balklaag zonder kiptoets
/// wilde narekenen, moest om de app heen. De richting van elke verandering is
/// een handberekening: k_cr schaalt τ met 1/k_cr (6.13a), dus de
/// dwarskracht-UC met 0,67 is 1/0,67 keer die met 1,0; een last aan de
/// drukzijde maakt l_ef 2h langer (tabel 6.1) en de kiptoets zwaarder; kiptoets
/// uit zet de toets als "niet van toepassing" met de reden in de notitie.
#[tokio::test]
async fn k_cr_kiptoets_en_lastpositie_uit_check_config_werken_door() {
    eis_node().await;

    let model = portaal_met_houten_ligger();
    let antwoorden = roep_tools(&[
        ("check_fem_model", json!({ "model": model, "beam_ids": [2] })),
        ("check_fem_model", json!({ "model": model, "beam_ids": [2], "check_config": { "2": { "kCr": 0.67 } } })),
        ("check_fem_model", json!({ "model": model, "beam_ids": [2], "check_config": { "2": { "performLtbCheck": false } } })),
        ("check_fem_model", json!({ "model": model, "beam_ids": [2], "check_config": { "2": { "ltbLoadPosition": "compressionEdge" } } })),
        // Onzin: elk apart geweigerd, met de veldnaam in de melding.
        ("check_fem_model", json!({ "model": model, "check_config": { "2": { "kCr": 1.5 } } })),
        ("check_fem_model", json!({ "model": model, "check_config": { "2": { "kCr": 0 } } })),
        ("check_fem_model", json!({ "model": model, "check_config": { "2": { "ltbLoadPosition": "bovenrand" } } })),
        ("check_fem_model", json!({ "model": model, "check_config": { "2": { "performLtbCheck": "nee" } } })),
        ("check_fem_model", json!({ "model": model, "check_config": { "2": { "k_cr": 0.67 } } })),
    ])
    .await;

    let basis = geen_fout(&antwoorden[0]).clone();
    let met_kcr = geen_fout(&antwoorden[1]).clone();
    let zonder_kip = geen_fout(&antwoorden[2]).clone();
    let drukzijde = geen_fout(&antwoorden[3]).clone();

    // Standaard: de kerninvoer draagt de oude vaste waarden.
    let inp = &basis["timber_check_inputs"][0];
    // `as_f64`: de bundel schrijft 1 en niet 1.0, en serde_json onderscheidt die.
    assert_eq!(inp["k_cr"].as_f64(), Some(1.0), "{inp}");
    assert_eq!(inp["perform_ltb_check"], json!(true), "{inp}");
    assert_eq!(inp["ltb_load_position"], json!("CentreOfGravity"), "{inp}");

    // k_cr 0,67: in de kerninvoer, en de dwarskracht-UC 1/0,67 keer zo hoog.
    assert_eq!(met_kcr["timber_check_inputs"][0]["k_cr"].as_f64(), Some(0.67));
    let uc_basis = uc_van(&basis["timber_results"][0], "6.1.7_shear").expect("dwarskracht-UC");
    let uc_kcr = uc_van(&met_kcr["timber_results"][0], "6.1.7_shear").expect("dwarskracht-UC");
    assert!(uc_basis > 0.0, "de ligger draagt q = 5 kN/m, dus er is dwarskracht");
    assert!(
        (uc_kcr / uc_basis - 1.0 / 0.67).abs() < 1e-6,
        "dwarskracht-UC hoort met 1/0,67 te schalen: {uc_kcr} / {uc_basis}"
    );
    let noot = toets_van(&met_kcr["timber_results"][0], "6.1.7_shear")["kind"]["data"]["notes"].to_string();
    assert!(noot.contains("0,67") && noot.contains("opgegeven"), "{noot}");

    // Kiptoets uit: de toets blijft in de lijst, als niet van toepassing, met de
    // reden — en is niet langer maatgevend.
    assert_eq!(zonder_kip["timber_check_inputs"][0]["perform_ltb_check"], json!(false));
    let kip = toets_van(&zonder_kip["timber_results"][0], "6.3.3_beam_stability");
    assert_eq!(kip["kind"]["data"]["status"], json!("NotApplicable"), "{kip}");
    assert!(uc_van(&zonder_kip["timber_results"][0], "6.3.3_beam_stability").is_none());
    let noot = kip["kind"]["data"]["notes"].to_string();
    assert!(noot.contains("overgeslagen") && noot.contains("6.3.3(5)"), "{noot}");
    assert_ne!(zonder_kip["timber_results"][0]["governing_check_id"], json!("6.3.3_beam_stability"));
    assert_eq!(
        zonder_kip["timber_results"][0]["checks"].as_array().unwrap().len(),
        basis["timber_results"][0]["checks"].as_array().unwrap().len(),
        "er verdwijnt geen toets uit de lijst"
    );

    // Drukzijde: l_ef + 2h, dus een zwaardere kiptoets, met het aangrijpingspunt
    // in de notitie.
    assert_eq!(drukzijde["timber_check_inputs"][0]["ltb_load_position"], json!("CompressionEdge"));
    let uc_kip_basis = uc_van(&basis["timber_results"][0], "6.3.3_beam_stability").expect("kip-UC");
    let uc_kip_druk = uc_van(&drukzijde["timber_results"][0], "6.3.3_beam_stability").expect("kip-UC");
    assert!(uc_kip_druk > uc_kip_basis, "drukzijde hoort zwaarder te toetsen: {uc_kip_druk} > {uc_kip_basis}");
    let noot = toets_van(&drukzijde["timber_results"][0], "6.3.3_beam_stability")["kind"]["data"]["notes"].to_string();
    assert!(noot.contains("DRUKzijde") && noot.contains("+ 2 · 450"), "{noot}");

    // De weigeringen: INVOER_ONGELDIG met de veldnaam.
    for (i, veld) in [(4, "kCr"), (5, "kCr"), (6, "ltbLoadPosition"), (7, "performLtbCheck"), (8, "kCr")] {
        let a = &antwoorden[i];
        assert_eq!(a["isError"], true, "aanroep {i} hoort geweigerd te worden: {a}");
        assert_eq!(a["structuredContent"]["error_code"], json!("INVOER_ONGELDIG"), "aanroep {i}: {a}");
        assert!(a.to_string().contains(veld), "aanroep {i} hoort `{veld}` te noemen: {a}");
    }
}

/// Catalogusprofielen buiten de oude voorvoegsellijst worden getoetst. Het
/// faalscenario van de audit: vier vrij opgelegde liggers S235 van 5 m met
/// q = 5 kN/m op IPE 200, INP 200, DIN 20 en L 100x100x10. Hier wordt geen
/// unity check vastgelegd — alleen dat alle vier de kern bereiken en een
/// uitslag hebben.
#[tokio::test]
async fn catalogusprofielen_buiten_de_oude_voorvoegsellijst_worden_getoetst() {
    eis_node().await;

    let profielen = ["IPE 200", "INP 200", "DIN 20", "L 100x100x10"];
    let mut nodes = Vec::new();
    let mut beams = Vec::new();
    let mut supports = Vec::new();
    let mut loads = Vec::new();
    for (k, profiel) in profielen.iter().enumerate() {
        let (a, b, x0) = (2 * k + 1, 2 * k + 2, (k * 10_000) as f64);
        nodes.push(json!({ "id": a, "x": x0, "z": 0 }));
        nodes.push(json!({ "id": b, "x": x0 + 5000.0, "z": 0 }));
        beams.push(json!({ "id": k + 1, "from": a, "to": b, "material": "S235", "profile": profiel }));
        supports.push(json!({ "nodeId": a, "type": "pinned" }));
        supports.push(json!({ "nodeId": b, "type": "zRoller" }));
        loads.push(json!({ "id": k + 1, "type": "lineLoad", "caseId": 1, "beamId": k + 1, "q": -5 }));
    }
    let model = json!({
        "nodes": nodes, "beams": beams, "supports": supports, "loads": loads,
        "loadCases": [ { "id": 1, "name": "G", "type": "dead" } ]
    });

    let result = roep_tool("check_fem_model", json!({ "model": model })).await;
    let uit = geen_fout(&result);
    assert_eq!(
        ids(uit, "results"),
        vec![1, 2, 3, 4],
        "alle vier de catalogusprofielen horen getoetst te worden: skipped = {}",
        uit["skipped_beams"]
    );
    for r in uit["results"].as_array().unwrap() {
        let gov = r["governing_check_id"].as_str().unwrap_or("");
        assert!(
            !gov.starts_with("ERROR"),
            "staaf {} ({}) is niet werkelijk getoetst: {gov}",
            r["beam_id"], r["profile_name"]
        );
        assert!(!r["checks"].as_array().unwrap().is_empty());
    }
    eis_sluitend(uit, &[1, 2, 3, 4]);
}
