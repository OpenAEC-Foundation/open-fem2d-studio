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

// ── Elke kern die een NDP gebruikt, niet alleen hout ────────────────────────
//
// De tests hierboven gebruiken één houten staaf. Sinds de betonkern de bijlage
// door haar rekengang draagt (γ_C/γ_S via `DesignMaterial::new`, tabel 4.4N en
// de Δc-toeslagen in de dekkingstoets, de coëfficiënt van λ_lim in de
// kolomtoets) hoort de weigering bij ELKE ingang van die kern te staan — en bij
// de plaattoets (γ_M0, γ_M hout, γ_C/γ_S) en de kruipcoëfficiënt, die hetzelfde
// veld dragen. Per kern: de werkelijke deserialisatie van het Tauri-command, de
// werkelijke `toetsbrug::behandel` en de werkelijk gestarte MCP-server.

/// Hoe één kern langs de drie wegen wordt aangeroepen.
struct Kern {
    /// Naam in de meldingen van deze test.
    naam: &'static str,
    /// Weg 1: de eerste stap van het Tauri-command — het lezen van het type.
    tauri: fn(&Value) -> Result<(), String>,
    /// Weg 2: de toetsbrug-opdracht.
    opdracht: &'static str,
    /// Weg 3: de MCP-tool.
    tool: &'static str,
    /// Een geldige invoer (zonder `bijlage`).
    invoer: fn() -> Value,
    /// Waar het veld `bijlage` in de invoer staat.
    zet_bijlage: fn(&mut Value, &str),
    /// Verzoekvorm voor de toetsbrug (`inputs`).
    toetsbrug_inputs: fn(Value) -> Value,
    /// Argumenten voor de MCP-tool.
    mcp_argumenten: fn(Value) -> Value,
}

fn als_lijst(v: Value) -> Value {
    json!([v])
}
fn als_zelf(v: Value) -> Value {
    v
}
fn als_inputs(v: Value) -> Value {
    json!({ "inputs": [v] })
}
fn bijlage_bovenin(v: &mut Value, b: &str) {
    v["bijlage"] = json!(b);
}
fn bijlage_in_beam(v: &mut Value, b: &str) {
    v["beam"]["bijlage"] = json!(b);
}

fn korf() -> Value {
    json!({
        "cover_mm": 30,
        "stirrup_diameter_mm": 8,
        "top": { "count": 2, "diameter_mm": 12 },
        "bottom": { "count": 3, "diameter_mm": 16 },
        "stirrup_spacing_mm": 200,
        "stirrup_legs": 2
    })
}

fn betonbalk() -> Value {
    json!({
        "beam_id": 7,
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "length_m": 5,
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 0,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 80, "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } },
            { "combination_id": 1, "position_mm": 2500,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0, "mt_ed": 0, "my_ed": 100, "mz_ed": 0 } },
            { "combination_id": 1, "position_mm": 5000,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": -80, "mt_ed": 0, "my_ed": 0, "mz_ed": 0 } }
        ]
    })
}

fn betonkolom() -> Value {
    let punt = |x: f64, m: f64| json!({
        "combination_id": 1, "position_mm": x,
        "forces": { "n_ed": -900.0, "vy_ed": 0.0, "vz_ed": 0.0, "mt_ed": 0.0, "my_ed": m, "mz_ed": 0.0 }
    });
    json!({
        "beam_id": 12,
        "section": { "shape": "Rectangle", "b_mm": 300.0, "h_mm": 300.0 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30.0, "stirrup_diameter_mm": 8.0,
            "bottom": { "count": 3, "diameter_mm": 20.0 },
            "top": { "count": 3, "diameter_mm": 20.0 },
            "stirrup_spacing_mm": 200.0, "stirrup_legs": 2
        },
        "length_m": 4.0,
        "column": {
            "bracing": "Geschoord",
            "buckling_length": { "soort": "Figuur57", "geval": "ScharnierendScharnierend" }
        },
        "forces_envelope": [punt(0.0, 40.0), punt(2000.0, 30.0), punt(4000.0, 20.0)]
    })
}

fn dekking() -> Value {
    json!({
        "beam_id": 1, "side": "Bottom", "exposure_class": "XC1",
        "cover_mm": 30.0, "stirrup_diameter_mm": 8.0, "max_bar_diameter_mm": 16.0
    })
}

fn mn_kappa() -> Value {
    json!({
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "n_ed_kn": -800,
        "interaction_points": 11
    })
}

fn segmenten() -> Value {
    json!({
        "beam_id": 5,
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": korf(),
        "length_m": 4.3
    })
}

fn dekkingslijn() -> Value {
    json!({ "beam": betonbalk() })
}

fn kruip() -> Value {
    json!({
        "concrete_class": "C30/37", "relative_humidity_pct": 50.0, "t0_days": 28.0,
        "cement_class": "N", "h0_mm": 150.0
    })
}

fn plaat() -> Value {
    json!({
        "plate_id": 1, "soort": "Staal", "materiaal": "S355", "thickness_mm": 50.0,
        "combinations": [
            { "combination_id": 4, "elements": [
                { "element_id": 0, "sigma_x_mpa": 150.0, "sigma_y_mpa": -80.0, "tau_xy_mpa": 60.0 }
            ] }
        ]
    })
}

fn lees<T: serde::de::DeserializeOwned>(v: &Value) -> Result<(), String> {
    serde_json::from_value::<T>(v.clone()).map(|_| ()).map_err(|e| e.to_string())
}

fn kernen() -> Vec<Kern> {
    vec![
        Kern {
            naam: "betonbalk",
            tauri: |v| lees::<Vec<concrete_check::ConcreteBeamCheckInput>>(&json!([v])),
            opdracht: "check_concrete_beams",
            tool: "check_concrete_beam",
            invoer: betonbalk,
            zet_bijlage: bijlage_bovenin,
            toetsbrug_inputs: als_lijst,
            mcp_argumenten: als_zelf,
        },
        Kern {
            naam: "kolomtoets",
            tauri: |v| lees::<concrete_check::ConcreteColumnCheckRequest>(v),
            opdracht: "concrete_column_check",
            tool: "concrete_column_check",
            invoer: betonkolom,
            zet_bijlage: bijlage_bovenin,
            toetsbrug_inputs: als_zelf,
            mcp_argumenten: als_zelf,
        },
        Kern {
            naam: "dekkingstoets",
            tauri: |v| lees::<nen_en_1992_1_1::ConcreteCoverRequest>(v),
            opdracht: "concrete_cover_check",
            tool: "concrete_cover_check",
            invoer: dekking,
            zet_bijlage: bijlage_bovenin,
            toetsbrug_inputs: als_zelf,
            mcp_argumenten: als_zelf,
        },
        Kern {
            naam: "M-N-κ",
            tauri: |v| lees::<concrete_check::MnKappaRequest>(v),
            opdracht: "concrete_mn_kappa",
            tool: "concrete_mn_kappa",
            invoer: mn_kappa,
            zet_bijlage: bijlage_bovenin,
            toetsbrug_inputs: als_zelf,
            mcp_argumenten: als_zelf,
        },
        Kern {
            naam: "segmentstijfheid",
            tauri: |v| lees::<concrete_check::SegmentStiffnessRequest>(v),
            opdracht: "concrete_segment_stiffness",
            tool: "concrete_segment_stiffness",
            invoer: segmenten,
            zet_bijlage: bijlage_bovenin,
            toetsbrug_inputs: als_zelf,
            mcp_argumenten: als_zelf,
        },
        Kern {
            naam: "dekkingslijn",
            tauri: |v| lees::<concrete_check::DekkingslijnVerzoek>(v),
            opdracht: "concrete_dekkingslijn",
            tool: "concrete_dekkingslijn",
            invoer: dekkingslijn,
            zet_bijlage: bijlage_in_beam,
            toetsbrug_inputs: als_zelf,
            mcp_argumenten: als_zelf,
        },
        Kern {
            naam: "kruipcoëfficiënt",
            tauri: |v| lees::<nen_en_1992_1_1::CreepCoefficientRequest>(v),
            opdracht: "concrete_creep_coefficient",
            tool: "concrete_creep_coefficient",
            invoer: kruip,
            zet_bijlage: bijlage_bovenin,
            toetsbrug_inputs: als_zelf,
            mcp_argumenten: als_zelf,
        },
        Kern {
            naam: "plaattoets",
            tauri: |v| lees::<Vec<plaat_check::PlateCheckInput>>(&json!([v])),
            opdracht: "check_plates",
            tool: "check_plates",
            invoer: plaat,
            zet_bijlage: bijlage_bovenin,
            toetsbrug_inputs: als_lijst,
            mcp_argumenten: als_inputs,
        },
    ]
}

fn weg_toetsbrug_kern(k: &Kern, invoer: Value) -> Result<Value, String> {
    let verzoek: toetsbrug::Verzoek = serde_json::from_value(json!({
        "opdracht": k.opdracht,
        "inputs": (k.toetsbrug_inputs)(invoer)
    }))
    .expect("toetsbrug-verzoek");
    toetsbrug::behandel(verzoek)
}

async fn weg_mcp_kern(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    k: &Kern,
    invoer: Value,
) -> Value {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": k.tool, "arguments": (k.mcp_argumenten)(invoer) }
        }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    resp
}

/// Voor ELKE kern die een nationaal bepaalde parameter gebruikt: een bijlage die
/// deze uitgave niet kent wordt langs alle drie de wegen geweigerd, met de
/// Nederlandse reden — en niet stil met Nederlandse factoren doorgerekend.
#[tokio::test(flavor = "multi_thread")]
async fn elke_kern_weigert_een_niet_gevulde_bijlage_langs_alle_drie_de_wegen() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    for (i, k) in kernen().iter().enumerate() {
        let mut invoer = (k.invoer)();
        (k.zet_bijlage)(&mut invoer, NIET_GEVULD);

        let fout1 = (k.tauri)(&invoer).expect_err(k.naam);
        assert!(is_de_juiste_weigering(&fout1), "{} weg 1 (Tauri-command): {fout1}", k.naam);

        let fout2 = weg_toetsbrug_kern(k, invoer.clone()).expect_err(k.naam);
        assert!(is_de_juiste_weigering(&fout2), "{} weg 2 (toetsbrug): {fout2}", k.naam);

        let resp = weg_mcp_kern(&mut stdin, &mut reader, 100 + i as u32, k, invoer).await;
        let tekst = format!("{resp}");
        assert!(
            tekst.contains("nationale bijlage") && tekst.contains("is niet gevuld"),
            "{} weg 3 (MCP) hoort te weigeren met reden, kreeg: {tekst}",
            k.naam
        );
    }
    let _ = child.kill().await;
}

/// En het omgekeerde, per kern: "NL" en een weggelaten veld lopen door, en
/// geven langs de toetsbrug PRECIES hetzelfde antwoord. Dat laatste is het
/// bewijs dat de bijlage die nu door de rekengang reist voor NL niets verandert.
#[tokio::test(flavor = "multi_thread")]
async fn elke_kern_rekent_met_nl_en_zonder_veld_hetzelfde() {
    let (mut child, mut stdin, mut reader) = start_server().await;
    for (i, k) in kernen().iter().enumerate() {
        let zonder = (k.invoer)();
        let mut met_nl = zonder.clone();
        (k.zet_bijlage)(&mut met_nl, "NL");

        (k.tauri)(&zonder).unwrap_or_else(|e| panic!("{} weg 1 zonder veld: {e}", k.naam));
        (k.tauri)(&met_nl).unwrap_or_else(|e| panic!("{} weg 1 met NL: {e}", k.naam));

        let a = weg_toetsbrug_kern(k, zonder.clone())
            .unwrap_or_else(|e| panic!("{} weg 2 zonder veld: {e}", k.naam));
        let b = weg_toetsbrug_kern(k, met_nl.clone())
            .unwrap_or_else(|e| panic!("{} weg 2 met NL: {e}", k.naam));
        assert_eq!(a, b, "{}: NL en een weggelaten veld horen hetzelfde antwoord te geven", k.naam);

        for (j, invoer) in [zonder, met_nl].into_iter().enumerate() {
            let resp = weg_mcp_kern(&mut stdin, &mut reader, 200 + (10 * i + j) as u32, k, invoer).await;
            assert!(resp["error"].is_null(), "{} weg 3: {resp}", k.naam);
            assert_eq!(
                resp["result"]["isError"], false,
                "{} weg 3 gaf een fout: {}",
                k.naam,
                resp["result"]["content"][0]["text"].as_str().unwrap_or("")
            );
        }
    }
    let _ = child.kill().await;
}

// ── `check_fem_model`: een losse bijlage in het verzoek (issue #17) ─────────
//
// `check_fem_model` bestaat alleen als MCP-tool (zie de kruistabel: de solve en
// de invoerbouw zitten in de bundel). De bijlage in het verzoek heeft voorrang
// boven het projectbestand; de voorrang zelf bewijst `test-normnaad.mjs` op de
// bundel, in beide standen. Hier: het schema, de weigering bij het lezen van de
// argumenten, en dat "NL" doorloopt tot in elke toetsinvoer.

fn ligger_c24() -> Value {
    json!({
        "nodes": [ { "id": 1, "x": 0, "z": 0 }, { "id": 2, "x": 5000, "z": 0 } ],
        "beams": [ { "id": 1, "from": 1, "to": 2, "material": "C24", "profile": "96x450" } ],
        "supports": [
            { "nodeId": 1, "type": "pinned" },
            { "nodeId": 2, "type": "zRoller" }
        ],
        "loadCases": [ { "id": 1, "name": "G", "type": "dead" } ],
        "loads": [ { "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 1, "q": -2 } ]
    })
}

async fn check_fem_model_aanroep(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    argumenten: Value,
) -> Value {
    schrijf(
        stdin,
        json!({
            "jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": { "name": "check_fem_model", "arguments": argumenten }
        }),
    )
    .await;
    // De solve kan even duren; `lees_bericht` wacht tot 60 s.
    let resp = lees_bericht(reader).await;
    assert_eq!(resp["id"], id);
    resp
}

#[tokio::test(flavor = "multi_thread")]
async fn check_fem_model_kent_bijlage_in_het_schema_en_weigert_een_niet_gevulde() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    schrijf(&mut stdin, json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).await;
    let lijst = lees_bericht(&mut reader).await;
    let tool = lijst["result"]["tools"]
        .as_array()
        .expect("tools")
        .iter()
        .find(|t| t["name"] == "check_fem_model")
        .expect("check_fem_model in tools/list")
        .clone();
    let veld = &tool["inputSchema"]["properties"]["bijlage"];
    assert_eq!(veld["type"], "string", "bijlage ontbreekt in het schema: {tool}");
    assert_eq!(veld["enum"], json!(nationale_bijlage::BIJLAGEN_GEVULD));
    assert_eq!(tool["inputSchema"]["additionalProperties"], false);

    let resp = check_fem_model_aanroep(
        &mut stdin,
        &mut reader,
        3,
        json!({ "model": ligger_c24(), "bijlage": NIET_GEVULD }),
    )
    .await;
    let tekst = format!("{resp}");
    assert!(
        tekst.contains("nationale bijlage") && tekst.contains("is niet gevuld") && tekst.contains(NIET_GEVULD),
        "check_fem_model hoort een niet-gevulde bijlage te weigeren met reden, kreeg: {tekst}"
    );
    let _ = child.kill().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn check_fem_model_met_bijlage_nl_rekent_als_zonder() {
    let status = openaec_mcp_server::sidecar::status(&Default::default()).await;
    assert!(status.available, "Deze test vereist Node.js: {:?}", status.reason);

    let (mut child, mut stdin, mut reader) = start_server().await;
    let zonder = check_fem_model_aanroep(&mut stdin, &mut reader, 4, json!({ "model": ligger_c24() })).await;
    let met = check_fem_model_aanroep(
        &mut stdin,
        &mut reader,
        5,
        json!({ "model": ligger_c24(), "bijlage": "NL" }),
    )
    .await;
    for (naam, r) in [("zonder", &zonder), ("met NL", &met)] {
        assert_eq!(
            r["result"]["isError"], false,
            "check_fem_model {naam}: {}",
            r["result"]["content"][0]["text"].as_str().unwrap_or("")
        );
    }
    let (a, b) = (&zonder["result"]["structuredContent"], &met["result"]["structuredContent"]);
    assert_eq!(a["timber_results"], b["timber_results"], "NL en weglaten horen dezelfde uitkomst te geven");
    let invoer = b["timber_check_inputs"].as_array().expect("timber_check_inputs");
    assert!(!invoer.is_empty(), "er is geen houtinvoer om iets aan te bewijzen: {b}");
    assert!(invoer.iter().all(|i| i["bijlage"] == "NL"), "{invoer:?}");
    let _ = child.kill().await;
}
