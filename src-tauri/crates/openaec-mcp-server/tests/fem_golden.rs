//! Gouden portaalmodel — LEZER 2 van 2: de MCP-tool (taak T13).
//!
//! WAAROM ER TWEE LEZERS ZIJN
//! `tests/golden/portaal.verwacht.json` beschrijft wat het referentieportaal uit
//! het implementatieplan §5.1 hoort op te leveren. De eerste lezer
//! (`design-mockup/test-golden.mjs`) toetst dat de BUNDEL dat oplevert; deze
//! toetst dat de MCP-TOOL het ook oplevert, over stdio, via de echte binary, met
//! het model uit een `.ifcfem2d`-bestand op schijf. Eén lezer zou alleen bewijzen
//! dat het bestand bij zichzelf past. Twee lezers langs verschillende wegen
//! bewijzen dat de hele keten hetzelfde antwoord geeft — en dat is de enige vorm
//! waarin een gouden bestand iets waard is.
//!
//! DE VERGELIJKING IS EXACT, EN DAT IS GEEN STRENGHEID MAAR EEN EIS
//! Plan §5.2 laag B: bundel en MCP-tool draaien in dezelfde runtime, dus de
//! MCP-laag mag geen cijfer aanraken. Elk verschil is per definitie een fout in
//! die laag en niet een afrondingsverschil. De tolerantie uit §5.2 laag C geldt
//! alleen tussen de app (WebView2-V8) en de sidecar (Node-V8), en die grens
//! wordt hier niet overgestoken.
//!
//! WAT DEZE TEST OVER DRIFT ZEGT
//! De gouden waarden zijn GEGENEREERD door `design-mockup/scripts/genereer-golden.mjs`
//! en nooit met de hand geschreven; de profieldata is tijdens dit traject al
//! gedrift (HEA 160 ging van A = 3877 naar A = 3880). Deze test houdt drie lagen
//! uit elkaar, zodat een drift verklaard wordt in plaats van stil overgenomen:
//!
//!   [1] herkomst   — noemt de catalogus nog dezelfde doorsnede als toen het
//!                    gouden bestand werd geschreven? Faalt deze test, dan is
//!                    daarmee elk verschil in [3] verklaard;
//!   [2] invarianten — ½·q·L, q·L²/8 en de superpositie, die niet van A en I
//!                    afhangen. Houden die stand terwijl [1] faalt, dan is er
//!                    profieldata gewijzigd en geen rekenfout;
//!   [3] waarden     — elke gegenereerde uitkomst, exact.
//!
//! Faalt [3], dan is de opdracht NOOIT om het gouden bestand met de hand bij te
//! werken: draai het generatiescript en beoordeel de diff die het uitschrijft.

use openaec_mcp_server::sidecar::{self, SidecarOpties};
use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");
const MODELPAD: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/golden/portaal.ifcfem2d");
const GOUDENPAD: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/golden/portaal.verwacht.json"
);

/// Hoe het gouden bestand opnieuw te maken is. Staat in elke faalmelding, zodat
/// niemand op het idee komt de verwachting met de hand bij te stellen.
const HERGENEREER: &str = "Werk het gouden bestand NIET met de hand bij. Draai \
     `node scripts/genereer-golden.mjs` in design-mockup/ en beoordeel de diff \
     die dat script zelf uitschrijft — het meldt de herkomst apart en als eerste.";

fn gouden() -> Value {
    let tekst = std::fs::read_to_string(GOUDENPAD).unwrap_or_else(|e| {
        panic!(
            "Het gouden bestand {GOUDENPAD} is niet te lezen ({e}). \
             Maak het met `node scripts/genereer-golden.mjs` in design-mockup/."
        )
    });
    serde_json::from_str(&tekst).expect("het gouden bestand moet geldige JSON zijn")
}

/// Als er geen Node ≥ 20 is, kán deze taak niet werken. Dat is geen reden om
/// stil over te slaan: Node is sinds dit ontwerp een harde eis voor de
/// FEM-tools, en een test die zichzelf uitzet bewijst niets.
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

// ── De MCP-server over stdio ────────────────────────────────────────────────

async fn lees_bericht<R>(reader: &mut R) -> Value
where
    R: AsyncBufReadExt + Unpin,
{
    let mut regel = String::new();
    let n = timeout(Duration::from_secs(120), reader.read_line(&mut regel))
        .await
        .expect("de server antwoordde niet binnen 120 s")
        .expect("read_line mislukte");
    assert!(n > 0, "EOF op stdout — de server stopte onverwacht");
    serde_json::from_str(regel.trim())
        .unwrap_or_else(|e| panic!("ongeldige JSON-RPC-regel {regel:?}: {e}"))
}

/// Roept één tool aan op een verse serverinstantie en geeft het `result` terug.
async fn roep_tool(naam: &str, argumenten: Value) -> Value {
    let mut kind = Command::new(BIN_PATH)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("de MCP-server starten");

    let mut stdin = kind.stdin.take().expect("stdin");
    let stdout = kind.stdout.take().expect("stdout");
    let mut reader = BufReader::new(stdout);

    let schrijf = |v: Value| {
        let mut s = serde_json::to_string(&v).unwrap();
        s.push('\n');
        s
    };

    for bericht in [
        schrijf(json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "fem-golden-test", "version": "0.0.0" }
            }
        })),
        schrijf(json!({
            "jsonrpc": "2.0", "method": "notifications/initialized", "params": {}
        })),
        schrijf(json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": { "name": naam, "arguments": argumenten }
        })),
    ] {
        stdin.write_all(bericht.as_bytes()).await.unwrap();
        stdin.flush().await.unwrap();
        // Het antwoord op `initialize` moet gelezen zijn voordat het volgende
        // bericht de pijp in gaat; anders loopt de leesvolgorde uit de pas.
        if bericht.contains("\"initialize\"") {
            let resp = lees_bericht(&mut reader).await;
            assert_eq!(resp["result"]["serverInfo"]["name"], "openaec-fem");
        }
    }

    let resp = lees_bericht(&mut reader).await;
    assert_eq!(resp["id"], 2);
    assert!(resp["error"].is_null(), "JSON-RPC-fout: {resp}");

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), kind.wait()).await;

    let result = resp["result"].clone();
    assert_eq!(
        result["isError"],
        json!(false),
        "de tool `{naam}` meldde een fout: {}",
        result["content"][0]["text"]
    );
    result
}

// ── Padwandeling en de vier operatoren van de invarianten ───────────────────
// Dezelfde vier als in `design-mockup/test-golden.mjs`, hier onafhankelijk
// geïmplementeerd: dat is precies wat "twee lezers" moet betekenen.

fn op_pad<'a>(waarde: &'a Value, pad: &[Value]) -> Option<&'a Value> {
    let mut hier = waarde;
    for stap in pad {
        hier = hier.get(stap.as_str()?)?;
    }
    Some(hier)
}

fn getallen(waarde: &Value) -> Vec<f64> {
    waarde
        .as_array()
        .unwrap_or_else(|| panic!("verwachtte een array met getallen, kreeg {waarde}"))
        .iter()
        .map(|v| v.as_f64().expect("elk element moet een getal zijn"))
        .collect()
}

fn evalueer_term(resultaat: &Value, term: &Value) -> f64 {
    let pad: Vec<Value> = term["pad"].as_array().cloned().unwrap_or_default();
    let leesbaar: Vec<String> = pad.iter().map(|p| p.to_string()).collect();
    let waarde = op_pad(resultaat, &pad)
        .unwrap_or_else(|| panic!("pad {} bestaat niet in het antwoord", leesbaar.join(".")));
    let factor = term["factor"].as_f64().expect("factor");
    let operator = term["operator"].as_str().expect("operator");
    let ruw = match operator {
        "waarde" => waarde.as_f64().expect("waarde moet een getal zijn"),
        "abs" => waarde.as_f64().expect("waarde moet een getal zijn").abs(),
        "max_abs" => getallen(waarde)
            .into_iter()
            .map(f64::abs)
            .fold(f64::NEG_INFINITY, f64::max),
        "min" => getallen(waarde).into_iter().fold(f64::INFINITY, f64::min),
        anders => panic!("onbekende operator `{anders}` in het gouden bestand"),
    };
    factor * ruw
}

/// Alle bladwaarden als `pad -> waarde`, zodat een verschil op één regel te
/// benoemen is in plaats van als "twee grote objecten zijn ongelijk".
fn bladeren(waarde: &Value, pad: &str, uit: &mut Vec<(String, Value)>) {
    match waarde {
        Value::Object(map) => {
            for (k, v) in map {
                let onder = if pad.is_empty() {
                    k.clone()
                } else {
                    format!("{pad}.{k}")
                };
                bladeren(v, &onder, uit);
            }
        }
        Value::Array(items) => {
            for (i, v) in items.iter().enumerate() {
                bladeren(v, &format!("{pad}.{i}"), uit);
            }
        }
        blad => uit.push((pad.to_owned(), blad.clone())),
    }
}

fn bladen(waarde: &Value) -> Vec<(String, Value)> {
    let mut uit = Vec::new();
    bladeren(waarde, "", &mut uit);
    uit.sort_by(|a, b| a.0.cmp(&b.0));
    uit
}

// ── [1] Herkomst ────────────────────────────────────────────────────────────

/// De profielcatalogus van de Rust-crate tegen de catalogus die in het gouden
/// bestand staat opgeschreven.
///
/// Deze test heeft géén Node nodig en is daarmee de goedkoopste manier om de
/// drift te zien die het plan §1.2 meldt. Hij faalt vóór alle andere, want hij
/// verklaart ze: schuift `area_mm2`, dan schuiven de zakkingen mee, en dan is de
/// vraag niet "waarom rekent de solver anders" maar "klopt de nieuwe
/// profieldata".
#[test]
fn herkomst_de_profielcatalogus_is_niet_gedrift() {
    let g = gouden();
    let profielen = g["herkomst"]["profielen"]
        .as_object()
        .expect("herkomst.profielen");
    assert!(!profielen.is_empty(), "de herkomst noemt geen enkel profiel");

    for (naam, verwacht) in profielen {
        let record = steel_profiles::db().find(naam).unwrap_or_else(|| {
            panic!(
                "Profiel `{naam}` staat niet meer in de catalogus van de crate \
                 steel-profiles. Het gouden model rekent ermee. {HERGENEREER}"
            )
        });

        assert_eq!(
            record.name,
            verwacht["catalogusnaam"].as_str().unwrap(),
            "de catalogusnaam van `{naam}` is gewijzigd. {HERGENEREER}"
        );

        for (veld, nu, toen) in [
            (
                "properties.area_mm2",
                record.properties.area_mm2,
                verwacht["area_mm2"].as_f64().unwrap(),
            ),
            (
                "properties.iy_mm4",
                record.properties.iy_mm4,
                verwacht["iy_mm4"].as_f64().unwrap(),
            ),
            (
                "properties.wpl_y_mm3",
                record.properties.wpl_y_mm3,
                verwacht["wpl_y_mm3"].as_f64().unwrap(),
            ),
            (
                "geometry.h",
                record.geometry.h,
                verwacht["h_mm"].as_f64().unwrap(),
            ),
            (
                "geometry.b",
                record.geometry.b,
                verwacht["b_mm"].as_f64().unwrap(),
            ),
        ] {
            assert_eq!(
                nu, toen,
                "PROFIELDRIFT: `{naam}` heeft nu {veld} = {nu}, het gouden bestand \
                 is geschreven met {toen}. Alle verschoven uitkomsten in de andere \
                 tests zijn hiermee verklaard; controleer eerst of de nieuwe \
                 doorsnedegegevens kloppen. {HERGENEREER}"
            );
        }
    }
}

/// De doorsnede waarmee de SOLVER rekent (uit `steelSections.generated.ts`,
/// vastgelegd in `herkomst.doorsneden`) tegen de doorsnede waarmee de TOETSING
/// rekent (de catalogus van deze crate).
///
/// Deze twee bronnen zijn niet dezelfde: de eerste is uit de tweede gegenereerd.
/// Lopen ze uiteen, dan wordt dezelfde staaf met de ene doorsnede berekend en
/// met de andere getoetst — en geen van beide kanten ziet dat zelf.
#[test]
fn herkomst_solverdoorsnede_en_toetsingsdoorsnede_zijn_dezelfde() {
    let g = gouden();
    let doorsneden = g["herkomst"]["doorsneden"]
        .as_object()
        .expect("herkomst.doorsneden");
    assert!(!doorsneden.is_empty(), "de herkomst noemt geen enkele staaf");

    for (staaf, d) in doorsneden {
        assert_eq!(
            d["bron"], "staal-db",
            "staaf {staaf} is in het gouden bestand vastgelegd met bron `{}`. \
             `default` betekent dat resolveSection het profiel niet vond en met \
             de TERUGVAL A = 3877, I = 1,673e7 rekende — een uitkomst die \
             volstrekt plausibel oogt. {HERGENEREER}",
            d["bron"]
        );

        let profiel = d["profile"].as_str().expect("profile");
        let record = steel_profiles::db()
            .find(profiel)
            .unwrap_or_else(|| panic!("profiel `{profiel}` ontbreekt in de catalogus"));

        assert_eq!(
            record.properties.area_mm2,
            d["A_mm2"].as_f64().unwrap(),
            "staaf {staaf} (`{profiel}`): de solver rekent met A = {} mm² \
             (src/lib/steelSections.generated.ts) en de toetsing met A = {} mm² \
             (steel-profiles/data/profiles.json). Genereer de tabel opnieuw met \
             `node scripts/genereer-staalprofielen.mjs`.",
            d["A_mm2"],
            record.properties.area_mm2
        );
        assert_eq!(
            record.properties.iy_mm4,
            d["I_mm4"].as_f64().unwrap(),
            "staaf {staaf} (`{profiel}`): solver I = {} mm⁴, toetsing I = {} mm⁴. \
             Genereer de tabel opnieuw met `node scripts/genereer-staalprofielen.mjs`.",
            d["I_mm4"],
            record.properties.iy_mm4
        );
    }
}

// ── [2] en [3] De MCP-tool ──────────────────────────────────────────────────

/// `solve_fem_model` op het gouden projectbestand: eerst de analytische
/// invarianten, dan elke waarde exact.
#[tokio::test]
async fn solve_fem_model_levert_het_gouden_resultaat() {
    eis_node().await;
    let g = gouden();

    let result = roep_tool(
        "solve_fem_model",
        json!({
            "project_path": MODELPAD,
            "detail": g["verzoek"]["detail"],
        }),
    )
    .await;
    let gemeten = &result["structuredContent"];

    // ── [2] Invarianten ─────────────────────────────────────────────────
    // Analytisch afgeleid uit q, L en de combinatiefactoren; onafhankelijk van
    // A en I. Ze staan hier vóór de exacte vergelijking omdat ze het onderscheid
    // dragen tussen "de profieldata is gewijzigd" en "de berekening is stuk".
    let controles = g["invarianten"]["controles"]
        .as_array()
        .expect("invarianten.controles");
    assert!(
        controles.len() >= 5,
        "het gouden bestand bevat maar {} invariant(en); dat is te weinig om een \
         rekenfout van een profieldrift te onderscheiden",
        controles.len()
    );

    for controle in controles {
        let naam = controle["naam"].as_str().unwrap_or("(naamloos)");
        let som: f64 = controle["termen"]
            .as_array()
            .expect("termen")
            .iter()
            .map(|t| evalueer_term(gemeten, t))
            .sum();
        let verwacht = controle["verwacht"].as_f64().expect("verwacht");
        let tolerantie = controle["tolerantie"].as_f64().expect("tolerantie");
        let afwijking = (som - verwacht).abs();
        assert!(
            afwijking <= tolerantie,
            "INVARIANT GEBROKEN — {naam}: {som} {eenheid}, verwacht {verwacht} \
             ({afleiding}); |Δ| = {afwijking:e} > {tolerantie}. Deze verwachting \
             volgt uit het model zelf en niet uit de profieldata: een wijziging in \
             A of I verklaart hem niet.",
            eenheid = controle["eenheid"].as_str().unwrap_or(""),
            afleiding = controle["afleiding"].as_str().unwrap_or("")
        );
    }

    // ── [3] Waarden, exact ──────────────────────────────────────────────
    // `solve_ms` is een klok; `bundle_hash` en `solver_version` veranderen bij
    // elke herbouw van de bundel ook als er geen getal verschuift. De
    // bundelidentiteit wordt bewaakt door `build.rs` en de handshake, niet hier.
    let mut kaal = gemeten.clone();
    let map = kaal.as_object_mut().expect("structuredContent is een object");
    for vluchtig in ["solve_ms", "bundle_hash", "solver_version"] {
        assert!(
            map.remove(vluchtig).is_some(),
            "`{vluchtig}` hoort in het tooluitvoer te staan; ontbreekt hij, dan is \
             de uitvoer van vorm veranderd en dekt deze test minder dan hij lijkt"
        );
    }

    let verwacht = bladen(&g["waarden"]);
    let nu = bladen(&kaal);

    let namen_verwacht: Vec<&String> = verwacht.iter().map(|(p, _)| p).collect();
    let namen_nu: Vec<&String> = nu.iter().map(|(p, _)| p).collect();
    let ontbreekt: Vec<&&String> = namen_verwacht
        .iter()
        .filter(|p| !namen_nu.contains(p))
        .collect();
    let extra: Vec<&&String> = namen_nu
        .iter()
        .filter(|p| !namen_verwacht.contains(p))
        .collect();
    assert!(
        ontbreekt.is_empty(),
        "velden uit het gouden bestand ontbreken in de tooluitvoer: {:?}. {HERGENEREER}",
        &ontbreekt[..ontbreekt.len().min(10)]
    );
    assert!(
        extra.is_empty(),
        "de tooluitvoer bevat velden die niet in het gouden bestand staan: {:?}. {HERGENEREER}",
        &extra[..extra.len().min(10)]
    );

    // Exact, niet op tolerantie: bundel en MCP-tool draaien in dezelfde runtime
    // (plan §5.2 laag B). Een verschil is dus een fout in de MCP-laag.
    let afwijkend: Vec<String> = verwacht
        .iter()
        .zip(nu.iter())
        .filter(|((_, a), (_, b))| a != b)
        .map(|((pad, a), (_, b))| format!("{pad}: {a} → {b}"))
        .collect();
    assert!(
        afwijkend.is_empty(),
        "{} van de {} gouden waarden wijken af. Eerste tien:\n  {}\n{HERGENEREER}",
        afwijkend.len(),
        verwacht.len(),
        afwijkend[..afwijkend.len().min(10)].join("\n  ")
    );

    // Een gouden bestand dat nergens over gaat, faalt nooit. Deze ondergrens
    // bewaakt dat de dekking niet stilletjes instort doordat de tooluitvoer
    // uitkleedt.
    assert!(
        verwacht.len() > 1000,
        "het gouden bestand legt maar {} waarde(n) vast; dat is te weinig om drift \
         op te merken",
        verwacht.len()
    );
}

/// `load_fem_project` op hetzelfde bestand: leest de MCP-server het gouden model
/// als het model dat het gouden bestand beschrijft?
///
/// Zonder deze test zou `portaal.ifcfem2d` stilletjes kunnen wijzigen — een last
/// erbij, een oplegging eraf — terwijl `portaal.verwacht.json` netjes mee wordt
/// gegenereerd. Beide lezers blijven dan groen op een model dat niemand meer
/// herkent.
#[tokio::test]
async fn load_fem_project_leest_het_gouden_model_ongewijzigd() {
    eis_node().await;
    let g = gouden();

    let result = roep_tool("load_fem_project", json!({ "path": MODELPAD })).await;
    let p = &result["structuredContent"];

    assert_eq!(p["counts"]["nodes"], 4, "het portaal heeft vier knopen");
    assert_eq!(p["counts"]["beams"], 3, "twee kolommen en een ligger");
    assert_eq!(p["counts"]["supports"], 2, "twee ingeklemde voeten");
    assert_eq!(p["counts"]["plates"], 0, "het portaal heeft geen platen");
    assert_eq!(p["counts"]["load_cases"], 2, "belastinggevallen G en Q");
    assert_eq!(p["counts"]["loads"], 2, "één lijnlast per belastinggeval");
    assert_eq!(p["counts"]["combinations"], 1, "één combinatie: 1,2·G + 1,5·Q");
    assert_eq!(
        p["nonlinear_enabled"],
        json!(false),
        "het gouden model rekent eerste orde; tweede orde zou andere getallen geven"
    );

    // De staven dragen de profielen waarvan de herkomst is vastgelegd.
    for beam in p["model"]["beams"].as_array().expect("beams") {
        let id = beam["id"].to_string();
        let vastgelegd = &g["herkomst"]["doorsneden"][&id];
        assert_eq!(
            beam["profile"], vastgelegd["profile"],
            "staaf {id} heeft profiel {} maar het gouden bestand is geschreven met {}. \
             Het model is gewijzigd zonder de verwachting opnieuw te genereren.",
            beam["profile"], vastgelegd["profile"]
        );
        assert_eq!(
            beam["material"], vastgelegd["material"],
            "staaf {id}: materiaal gewijzigd ten opzichte van het gouden bestand."
        );
    }
}
