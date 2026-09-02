//! Integratietests op de sidecar-aansturing (taak T9).
//!
//! WAT HIER BEWEZEN MOET WORDEN
//! De Rust-kant rekent niet; ze bepaalt alleen WELKE rekenkern draait, hoe lang
//! die mag draaien, en hoe een storing eruitziet. Drie dingen kunnen daarbij
//! stilzwijgend misgaan, en die drie staan hieronder:
//!
//!   1. de HASHPOORT — `OPENAEC_FEM_KERNEL` mag geen ongecontroleerde bundel
//!      accepteren. Zou hij dat wel doen, dan is de hele "één rekenkern"-claim
//!      met één omgevingsvariabele te omzeilen: een andere kern rekent, de
//!      getallen ogen plausibel, en niets meldt het. De tests hieronder tonen
//!      dat een afwijkende bundel wordt geweigerd VÓÓRDAT Node start, en dat de
//!      bewuste ontsnapping (`OPENAEC_FEM_STA_DRIFT_TOE=1`) wél werkt;
//!   2. de GETALLEN — het referentieportaal uit het implementatieplan §5.1,
//!      met analytische controles (½qL, qL²/8, superpositie). Deze getallen
//!      staan in het plan en zijn daar analytisch gestaafd; wijkt de keten
//!      ervan af, dan is dat een bevinding en geen reden om de verwachting bij
//!      te stellen;
//!   3. de KLOK — een aanroep die niet terugkomt moet aflopen én het
//!      Node-proces echt opruimen. Dat laatste wordt niet op ons woord
//!      geloofd: het testproces schrijft een hartslag naar een bestand, en na
//!      de afbreking mag dat bestand niet meer groeien.
//!
//! GEEN OMGEVINGSVARIABELEN IN DE TESTS. `std::env::set_var` is procesbreed en
//! racet met parallel draaiende tests. Alles loopt daarom via `SidecarOpties`,
//! precies zoals de productiecode het na `uit_omgeving()` ook ziet.

use openaec_mcp_server::sidecar::{
    self, Bundelbron, SidecarOpties, BUNDEL_AFWIJKEND, BUNDEL_ONLEESBAAR, NODE_ONTBREEKT,
    TIJD_OVERSCHREDEN,
};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

const BUNDELPAD: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/assets/fem-kernel.mjs");

// ── Hulpjes ─────────────────────────────────────────────────────────────────

/// Eigen tijdelijke map per test; wordt aan het eind opgeruimd.
fn tijdelijke_map(naam: &str) -> PathBuf {
    let map = std::env::temp_dir().join(format!("openaec-t9-{}-{naam}", std::process::id()));
    let _ = std::fs::remove_dir_all(&map);
    std::fs::create_dir_all(&map).expect("tijdelijke map aanmaken");
    map
}

/// Een pad als JS-stringliteral. `serde_json` escapet de backslashes van een
/// Windows-pad correct; met de hand samenstellen gaat daar mis.
fn js_string(pad: &Path) -> String {
    serde_json::to_string(&pad.display().to_string()).unwrap()
}

fn getal(waarde: &Value, pad: &[&str]) -> f64 {
    let mut hier = waarde;
    for stap in pad {
        hier = hier
            .get(stap)
            .unwrap_or_else(|| panic!("veld `{stap}` ontbreekt in {hier}"));
    }
    hier.as_f64()
        .unwrap_or_else(|| panic!("veld {pad:?} is geen getal maar {hier}"))
}

fn dichtbij(naam: &str, actueel: f64, verwacht: f64, tol: f64) {
    let afwijking = (actueel - verwacht).abs();
    assert!(
        afwijking <= tol,
        "{naam}: {actueel} wijkt {afwijking:e} af van de verwachte {verwacht} (tolerantie {tol})"
    );
}

/// Grootste absolute waarde in een JSON-array van getallen.
fn max_abs(waarde: &Value, veld: &str) -> f64 {
    waarde
        .get(veld)
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("veld `{veld}` is geen array in {waarde}"))
        .iter()
        .map(|v| v.as_f64().expect("getal").abs())
        .fold(f64::NEG_INFINITY, f64::max)
}

fn min_van(waarde: &Value, veld: &str) -> f64 {
    waarde
        .get(veld)
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("veld `{veld}` is geen array in {waarde}"))
        .iter()
        .map(|v| v.as_f64().expect("getal"))
        .fold(f64::INFINITY, f64::min)
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

// ── Het referentieportaal, implementatieplan §5.1 ───────────────────────────
// Portaal 6 x 4 m: kolommen HEA160, ligger IPE300, beide voeten ingeklemd.
// LC1 "G": q = -10 N/mm op de ligger; LC2 "Q": q = -6 N/mm.
// Combinatie: 1,2*G + 1,5*Q.

fn portaal() -> Value {
    json!({
        "nodes": [
            { "id": 1, "x": 0,    "z": 0    },
            { "id": 2, "x": 0,    "z": 4000 },
            { "id": 3, "x": 6000, "z": 4000 },
            { "id": 4, "x": 6000, "z": 0    }
        ],
        "beams": [
            { "id": 1, "from": 1, "to": 2, "material": "S235", "profile": "HEA160" },
            { "id": 2, "from": 2, "to": 3, "material": "S235", "profile": "IPE300" },
            { "id": 3, "from": 3, "to": 4, "material": "S235", "profile": "HEA160" }
        ],
        "supports": [
            { "nodeId": 1, "type": "fixed" },
            { "nodeId": 4, "type": "fixed" }
        ],
        "plates": [],
        "loadCases": [
            { "id": 1, "name": "G", "type": "dead" },
            { "id": 2, "name": "Q", "type": "live" }
        ],
        "loads": [
            { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 2, "q": -10 },
            { "id": 2, "type": "lineLoad", "caseId": 2, "beamId": 2, "q": -6  }
        ],
        "selfWeightEnabled": false,
        "scheefstandEnabled": false,
        "scheefstandNoemer": 200,
        "scheefstandRichting": 1
    })
}

fn combinatie_12g_15q() -> Value {
    json!([{
        "id": 1,
        "name": "1,2·G + 1,5·Q",
        "type": "uls",
        "formula": "1,2·G + 1,5·Q",
        "factors": { "1": 1.2, "2": 1.5 }
    }])
}

// ── 1. Node ontbreekt ───────────────────────────────────────────────────────

#[tokio::test]
async fn ontbrekende_node_geeft_available_false_en_geen_rekenfout() {
    let opties = SidecarOpties {
        node: Some(PathBuf::from("/bestaat/niet/node")),
        ..Default::default()
    };

    let status = sidecar::status(&opties).await;
    assert!(!status.available, "status moet available:false melden");
    assert_eq!(status.error_code.as_deref(), Some(NODE_ONTBREEKT));
    assert!(status.node_version.is_none());

    // De reden en de remedie zijn Nederlands en noemen de uitweg. Zonder dat
    // leest "Node ontbreekt" voor een machine hetzelfde als "je raamwerk is een
    // mechanisme", en dat mag bij constructieve software niet.
    let reden = status.reason.unwrap_or_default();
    let remedie = status.remedie.unwrap_or_default();
    assert!(reden.contains("Node.js"), "reden: {reden}");
    assert!(remedie.contains("OPENAEC_NODE"), "remedie: {remedie}");

    // De ingebakken hash wordt óók zonder Node gemeld: dat is het enige dat de
    // binary over zichzelf zeker weet.
    assert_eq!(status.bundle_hash, sidecar::ingebakken_hash());
    assert!(status.loaded_bundle_hash.is_none());

    // Een echte aanroep faalt met dezelfde code, niet met een rekenuitkomst.
    let fout = sidecar::roep_aan("solve", json!({ "model": portaal() }), &opties, Some(10))
        .await
        .expect_err("zonder Node mag er geen resultaat komen");
    assert_eq!(fout.code, NODE_ONTBREEKT);
}

// ── 2. De hashpoort op OPENAEC_FEM_KERNEL ───────────────────────────────────

/// Een nagemaakte solverkern: hij praat het protocol, maar rekent niet. Schrijft
/// bij het starten een merkbestand, zodat een test kan zien of hij ÜBERHAUPT is
/// uitgevoerd.
fn schrijf_nepkern(map: &Path, merk: &Path) -> PathBuf {
    let pad = map.join("nepkern.mjs");
    let script = format!(
        r#"import {{ writeFileSync }} from "node:fs";
writeFileSync({merk}, "gestart\n");
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (brok) => {{
  buffer += brok;
  let grens;
  while ((grens = buffer.indexOf("\n")) >= 0) {{
    const regel = buffer.slice(0, grens);
    buffer = buffer.slice(grens + 1);
    if (!regel.trim()) continue;
    const v = JSON.parse(regel);
    const result = v.op === "handshake"
      ? {{ protocol: 1, node_version: "v0.0.0", bundle_version: "0.0.0-nep", bundle_hash: null }}
      : {{ verzonnen: true }};
    process.stdout.write(JSON.stringify({{ v: 1, id: v.id, ok: true, result }}) + "\n");
  }}
}});
process.stdin.resume();
"#,
        merk = js_string(merk)
    );
    std::fs::write(&pad, script).expect("nepkern schrijven");
    pad
}

#[tokio::test]
async fn afwijkende_kernel_wordt_geweigerd_voordat_node_start() {
    let map = tijdelijke_map("nepkern-geweigerd");
    let merk = map.join("is-gestart.txt");
    let nep = schrijf_nepkern(&map, &merk);

    let opties = SidecarOpties {
        kernel: Some(nep),
        drift_toegestaan: false,
        ..Default::default()
    };

    let fout = sidecar::roep_aan("handshake", json!({}), &opties, Some(20))
        .await
        .expect_err("een afwijkende bundel moet geweigerd worden");

    assert_eq!(fout.code, BUNDEL_AFWIJKEND, "melding: {}", fout.melding);
    // De melding noemt beide hashes, zodat te zien is WAT er anders is.
    assert!(fout.melding.contains(sidecar::ingebakken_hash()), "{}", fout.melding);
    let remedie = fout.remedie.clone().unwrap_or_default();
    assert!(
        remedie.contains("OPENAEC_FEM_STA_DRIFT_TOE"),
        "de remedie moet de bewuste uitweg noemen: {remedie}"
    );

    // Het bewijs dat de poort vóór de uitvoering ligt: de nepkern heeft nooit
    // gedraaid. Weigeren ná het rekenen zou betekenen dat een andere kern het
    // model al heeft gezien.
    assert!(
        !merk.exists(),
        "de afwijkende kern is uitgevoerd; de hashcontrole hoort dat te voorkomen"
    );

    let _ = std::fs::remove_dir_all(&map);
}

#[tokio::test]
async fn afwijkende_kernel_mag_wel_met_expliciete_toestemming() {
    let map = tijdelijke_map("nepkern-toegestaan");
    let merk = map.join("is-gestart.txt");
    let nep = schrijf_nepkern(&map, &merk);

    let opties = SidecarOpties {
        kernel: Some(nep),
        drift_toegestaan: true,
        ..Default::default()
    };

    let uit = sidecar::roep_aan("solve", json!({}), &opties, Some(20))
        .await
        .expect("met OPENAEC_FEM_STA_DRIFT_TOE=1 mag een andere kern draaien");

    assert_eq!(uit.result, json!({ "verzonnen": true }));
    assert_eq!(uit.bundel.bron, Bundelbron::AangewezenAfwijkend);
    assert_ne!(uit.bundel.hash, sidecar::ingebakken_hash());
    assert!(merk.exists(), "de toegestane kern hoort wél te draaien");

    let _ = std::fs::remove_dir_all(&map);
}

#[tokio::test]
async fn aangewezen_kernel_met_gelijke_hash_wordt_aanvaard() {
    eis_node().await;
    let map = tijdelijke_map("kernel-gelijk");
    let kopie = map.join("fem-kernel-kopie.mjs");
    std::fs::copy(BUNDELPAD, &kopie).expect("bundel kopiëren");

    let opties = SidecarOpties {
        kernel: Some(kopie.clone()),
        ..Default::default()
    };

    let uit = sidecar::roep_aan("handshake", json!({}), &opties, Some(30))
        .await
        .expect("een bit-identieke bundel op een ander pad hoort gewoon te werken");

    assert_eq!(uit.bundel.bron, Bundelbron::AangewezenGelijk);
    assert_eq!(uit.bundel.hash, sidecar::ingebakken_hash());
    assert_eq!(uit.bundel.pad, kopie);
    assert_eq!(uit.result["protocol"].as_u64(), Some(1));

    let _ = std::fs::remove_dir_all(&map);
}

#[tokio::test]
async fn ontbrekende_kernel_valt_niet_stil_terug_op_de_ingebakken_bundel() {
    let opties = SidecarOpties {
        kernel: Some(std::env::temp_dir().join("openaec-t9-bestaat-niet.mjs")),
        ..Default::default()
    };

    let fout = sidecar::roep_aan("handshake", json!({}), &opties, Some(20))
        .await
        .expect_err("een tikfout in het pad mag niet stil iets anders laten rekenen");
    assert_eq!(fout.code, BUNDEL_ONLEESBAAR, "melding: {}", fout.melding);
}

// ── 3. Het referentieportaal ────────────────────────────────────────────────

#[tokio::test]
async fn referentieportaal_geeft_de_gouden_getallen() {
    eis_node().await;
    let opties = SidecarOpties::default();

    let uit = sidecar::roep_aan(
        "solve",
        json!({
            "model": portaal(),
            "combinations": combinatie_12g_15q(),
            "detail": "stations"
        }),
        &opties,
        Some(60),
    )
    .await
    .expect("het referentieportaal hoort door te rekenen");

    // De keten heeft de ingebakken bundel gebruikt, niet iets anders.
    assert_eq!(uit.bundel.bron, Bundelbron::Ingebakken);
    assert_eq!(uit.bundel.hash, sidecar::ingebakken_hash());
    assert_eq!(
        uit.handshake["bundle_hash"].as_str(),
        Some(sidecar::ingebakken_hash()),
        "de zelf-hash van het Node-proces hoort gelijk te zijn aan de ingebakken hash"
    );

    let r = &uit.result;
    assert_eq!(r["units"]["kracht"], "kN");
    assert_eq!(r["units"]["moment"], "kNm");
    assert_eq!(r["cases_solved"], json!([1, 2]));
    assert_eq!(r["cases_skipped_empty"], json!([]));

    // ── Reacties: ½qL en qL ──────────────────────────────────────────────
    let lc1_r1 = getal(r, &["per_case", "1", "reactions", "1", "fz"]);
    let lc1_r4 = getal(r, &["per_case", "1", "reactions", "4", "fz"]);
    dichtbij("LC1 R1.fz (= ½qL)", lc1_r1, 30.0, 1e-4);
    dichtbij("LC1 R4.fz (= ½qL)", lc1_r4, 30.0, 1e-4);
    dichtbij("LC1 ΣFz (= qL = 60 kN)", lc1_r1 + lc1_r4, 60.0, 1e-4);

    let lc2_som = getal(r, &["per_case", "2", "reactions", "1", "fz"])
        + getal(r, &["per_case", "2", "reactions", "4", "fz"]);
    dichtbij("LC2 ΣFz (= 6·6 = 36 kN)", lc2_som, 36.0, 1e-4);

    let combi_som = getal(r, &["combinations", "1", "reactions", "1", "fz"])
        + getal(r, &["combinations", "1", "reactions", "4", "fz"]);
    dichtbij(
        "Combi ΣFz (= (1,2·10 + 1,5·6)·6 = 126 kN)",
        combi_som,
        126.0,
        1e-4,
    );

    // ── Momenten in de ligger: qL²/8-identiteit ──────────────────────────
    let ligger1 = &r["per_case"]["1"]["elements"]["2"];
    assert_eq!(
        ligger1["stations_mm"].as_array().map(Vec::len),
        Some(21),
        "de ligger hoort 21 stations te leveren"
    );
    let m_start = ligger1["M_start"].as_f64().expect("M_start");
    let max_m1 = max_abs(ligger1, "M_x");
    dichtbij("LC1 ligger M_start", m_start, -11.2324, 5e-4);
    dichtbij("LC1 ligger max|M|", max_m1, 33.7676, 5e-4);
    dichtbij(
        "LC1 identiteit M_veld + |M_steun| = qL²/8 = 45 kNm",
        max_m1 + m_start.abs(),
        45.0,
        1e-3,
    );

    let max_m2 = max_abs(&r["per_case"]["2"]["elements"]["2"], "M_x");
    let ligger_c = &r["combinations"]["1"]["elements"]["2"];
    let max_mc = max_abs(ligger_c, "M_x");
    dichtbij("Combi ligger max|M|", max_mc, 70.912, 1e-3);
    dichtbij(
        "Combi = 1,2·LC1 + 1,5·LC2 (superpositie)",
        max_mc,
        1.2 * max_m1 + 1.5 * max_m2,
        1e-9,
    );
    dichtbij(
        "Combi max zakking ligger",
        min_van(ligger_c, "w_x"),
        -14.4485,
        5e-4,
    );

    // Een NaN of oneindig zou als `null` wegschrijven en als nul kunnen worden
    // gelezen; de sidecar waarschuwt daarover en die waarschuwing hoort er niet
    // te staan.
    let waarschuwingen = r["warnings"].as_array().cloned().unwrap_or_default();
    assert!(
        !waarschuwingen.iter().any(|w| w.as_str().unwrap_or("").contains("NaN")),
        "onverwachte NaN-waarschuwing: {waarschuwingen:?}"
    );
}

// ── 4. De klok ──────────────────────────────────────────────────────────────

/// Een kern die het protocol nooit beantwoordt en elke 40 ms een hartslag naar
/// een bestand schrijft. Die hartslag is het bewijsmiddel: groeit het bestand
/// na de afbreking niet meer, dan is het proces echt weg.
fn schrijf_hangende_kern(map: &Path, hartslag: &Path) -> PathBuf {
    let pad = map.join("hangt.mjs");
    let script = format!(
        r#"import {{ appendFileSync }} from "node:fs";
const HARTSLAG = {hartslag};
setInterval(() => {{ try {{ appendFileSync(HARTSLAG, "x"); }} catch {{}} }}, 40);
process.stdin.setEncoding("utf8");
process.stdin.on("data", () => {{}});
process.stdin.resume();
"#,
        hartslag = js_string(hartslag)
    );
    std::fs::write(&pad, script).expect("hangende kern schrijven");
    pad
}

#[tokio::test]
async fn overschreden_klok_breekt_af_en_ruimt_het_proces_op() {
    let map = tijdelijke_map("klok");
    let hartslag = map.join("hartslag.bin");
    let hangt = schrijf_hangende_kern(&map, &hartslag);

    let opties = SidecarOpties {
        kernel: Some(hangt),
        // Een kern die niets teruggeeft is per definitie afwijkend; zonder deze
        // toestemming zou de hashpoort al eerder toeslaan en zouden we de klok
        // niet testen maar de poort.
        drift_toegestaan: true,
        ..Default::default()
    };

    let begonnen = std::time::Instant::now();
    let fout = sidecar::roep_aan("solve", json!({ "model": portaal() }), &opties, Some(1))
        .await
        .expect_err("een kern die niet antwoordt moet aflopen");
    let verstreken = begonnen.elapsed();

    assert_eq!(fout.code, TIJD_OVERSCHREDEN, "melding: {}", fout.melding);
    assert!(
        verstreken < Duration::from_secs(20),
        "de klok van 1 s liep pas na {verstreken:?} af"
    );
    assert!(
        fout.melding.contains("GEEN gedeeltelijk resultaat"),
        "een halve oplossing mag nooit als uitkomst gelden: {}",
        fout.melding
    );

    // Het proces moet echt gedood zijn, niet alleen losgelaten.
    let na_afbreken = std::fs::metadata(&hartslag).map(|m| m.len()).unwrap_or(0);
    assert!(
        na_afbreken > 0,
        "de hangende kern heeft nooit gedraaid; deze test bewijst dan niets"
    );
    tokio::time::sleep(Duration::from_millis(500)).await;
    let later = std::fs::metadata(&hartslag).map(|m| m.len()).unwrap_or(0);
    assert_eq!(
        na_afbreken, later,
        "de hartslag groeit door ({na_afbreken} → {later} bytes): het Node-proces leeft nog"
    );

    let _ = std::fs::remove_dir_all(&map);
}

// ── 5. Status op de normale weg ─────────────────────────────────────────────

#[tokio::test]
async fn status_meldt_een_werkende_keten() {
    eis_node().await;
    let status = sidecar::status(&SidecarOpties::default()).await;

    assert!(status.available);
    assert_eq!(status.error_code, None);
    assert_eq!(status.reason, None);
    assert_eq!(status.protocol_version, sidecar::SIDECAR_PROTOCOL);
    assert_eq!(status.bundle_hash, sidecar::ingebakken_hash());
    assert_eq!(status.loaded_bundle_hash.as_deref(), Some(sidecar::ingebakken_hash()));
    assert_eq!(status.bundle_source, Some(Bundelbron::Ingebakken));
    assert!(status.bundle_version.is_some(), "bundle_version ontbreekt");

    let versie = status.node_version.unwrap_or_default();
    assert!(versie.starts_with('v'), "node_version: {versie}");

    // De uitgepakte bundel staat op schijf en is bit-identiek aan de ingebakken.
    let pad = PathBuf::from(status.bundle_path.expect("bundle_path"));
    assert!(pad.exists(), "{} ontbreekt", pad.display());
    assert_eq!(
        std::fs::read(&pad).expect("uitgepakte bundel lezen").len(),
        std::fs::read(BUNDELPAD).expect("bronbundel lezen").len()
    );
}
