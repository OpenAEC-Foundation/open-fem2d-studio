//! Strikt schema en strikte invoer voor `check_steel_beam` en voor de
//! betontools (`check_concrete_beam`, `concrete_mn_kappa`).
//!
//! Waarom deze test bestaat: het oude schema zette `additionalProperties` op
//! `true` en verzweeg vijf velden met `#[serde(default)]`. Een client die dat
//! schema volgde liet `q_equiv_n_per_mm` en `z_a_mm` op nul vallen en toetste
//! kip daarmee **gunstiger** dan de app — onveilig aan de verkeerde kant. En
//! omdat nergens `deny_unknown_fields` stond, werd een tikfout in een veldnaam
//! volledig stil genegeerd: de toetsing liep door met een standaardwaarde.
//!
//! De test drijft de echte binary over stdio, net als `stdio_roundtrip.rs`.

use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

/// Lees één regel JSON-RPC en ontleed hem. Ruime timeout: de eerste aanroep
/// initialiseert de profielendatabase.
async fn lees_bericht<R>(reader: &mut R) -> Value
where
    R: AsyncBufReadExt + Unpin,
{
    let mut regel = String::new();
    let n = timeout(Duration::from_secs(30), reader.read_line(&mut regel))
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

/// Start de server en doe de `initialize`-handshake.
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
                "clientInfo": { "name": "schema-strikt-test", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert_eq!(resp["id"], 1);
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

/// Geldige invoer: het referentieportaal, kolom HEB160 S235 — dezelfde
/// getallen als `steel-check/tests/portal_beam2.rs`, zodat hier geen enkel
/// getal verzonnen is.
fn geldige_invoer() -> Value {
    json!({
        "beam_id": 2,
        "profile_name": "HEB160",
        "steel_grade": "S235",
        "length_m": 2.5,
        "forces_envelope": [
            { "combination_id": 22, "position_mm": 0.0,
              "forces": { "n_ed": -233.911, "vy_ed": 0.0, "vz_ed": 17.357,
                          "mt_ed": 0.0, "my_ed": -63.139, "mz_ed": 0.0 } },
            { "combination_id": 21, "position_mm": 0.0,
              "forces": { "n_ed": -232.435, "vy_ed": 0.0, "vz_ed": 19.817,
                          "mt_ed": 0.0, "my_ed": -66.036, "mz_ed": 0.0 } },
            { "combination_id": 11, "position_mm": 0.0,
              "forces": { "n_ed": -201.988, "vy_ed": 0.0, "vz_ed": 17.184,
                          "mt_ed": 0.0, "my_ed": -57.423, "mz_ed": 0.0 } }
        ],
        "lateral_bracing": { "top_flange_positions": [], "bottom_flange_positions": [] },
        "buckling_length_y_m": 2.5,
        "buckling_length_z_m": 2.5,
        "deflection_limit_class": "Floor",
        "deflection_limit_numerator": 333,
        "deflection_actual_max_mm": 0.0,
        "is_cantilever": false,
        "consequence_class": "CC1",
        "pre_camber_mm": 0.0,
        "deflection_permanent_mm": 0.0,
        "q_equiv_n_per_mm": 0.0,
        "z_a_mm": 0.0
    })
}

/// Roep één tool aan en geef het `result`-object terug.
async fn roep_tool_aan(
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
    resp["result"].clone()
}

async fn roep_check_aan(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    argumenten: Value,
) -> Value {
    roep_tool_aan(stdin, reader, id, "check_steel_beam", argumenten).await
}

/// Eén tooldefinitie uit `tools/list`.
async fn tooldefinitie(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    id: u32,
    naam: &str,
) -> Value {
    schrijf(
        stdin,
        json!({ "jsonrpc": "2.0", "id": id, "method": "tools/list", "params": {} }),
    )
    .await;
    let resp = lees_bericht(reader).await;
    resp["result"]["tools"]
        .as_array()
        .expect("tools is een array")
        .iter()
        .find(|t| t["name"] == naam)
        .unwrap_or_else(|| panic!("{naam} ontbreekt in tools/list"))
        .clone()
}

/// De foutmelding zoals de client hem te zien krijgt.
fn foutmelding(result: &Value) -> String {
    result["content"][0]["text"].as_str().unwrap_or("").to_string()
}

// ── 1. Het schema zelf ──────────────────────────────────────────────────────

#[tokio::test]
async fn schema_van_check_steel_beam_is_volledig_en_strikt() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    schrijf(
        &mut stdin,
        json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    let tools = resp["result"]["tools"].as_array().expect("tools is een array");
    let tool = tools
        .iter()
        .find(|t| t["name"] == "check_steel_beam")
        .expect("check_steel_beam ontbreekt in tools/list");
    let schema = &tool["inputSchema"];
    let props = &schema["properties"];

    // Onbekende velden worden geweigerd — spiegelt deny_unknown_fields.
    assert_eq!(
        schema["additionalProperties"], false,
        "check_steel_beam moet additionalProperties: false hebben"
    );

    // De velden met #[serde(default)] stonden niet in het oude schema.
    // `deflection_add_limit_numerator` kwam er in september 2026 bij, toen de
    // w_add-noemer van een vaste 150 naar de klassewaarde uit
    // NEN-EN 1990:2002/NB:2019 A1.4.3(3) ging; zonder dit veld in het schema
    // kan een client de referentie-noemer niet meer opgeven en wordt hij door
    // `additionalProperties: false` zelfs geweigerd.
    for veld in [
        "pre_camber_mm",
        "deflection_permanent_mm",
        "deflection_add_limit_numerator",
        "deflection_notes",
        "q_equiv_n_per_mm",
        "z_a_mm",
        "custom_section",
    ] {
        assert!(
            props[veld].is_object(),
            "veld '{veld}' ontbreekt in het schema; een client laat het dan op de standaardwaarde vallen"
        );
    }

    // Enums die de kern werkelijk kent. `FloorBrittlePartitions` hoort bij het
    // eerste gedachtestreepje van A1.4.3(3) (vloeren die scheurgevoelige
    // scheidingswanden dragen, w2 + w3 ≤ ℓ_rep/500).
    assert_eq!(
        props["deflection_limit_class"]["enum"],
        json!(["Floor", "FloorBrittlePartitions", "Roof", "Cantilever", "Custom"])
    );
    assert_eq!(props["consequence_class"]["enum"], json!(["CC1", "CC2", "CC3"]));
    assert_eq!(
        props["steel_grade"]["enum"],
        json!(["S235", "S275", "S355", "S420", "S460"])
    );

    // lateral_bracing: beide arrays verplicht, geen extra velden.
    let bracing = &props["lateral_bracing"];
    assert_eq!(bracing["additionalProperties"], false);
    assert_eq!(
        bracing["required"],
        json!(["top_flange_positions", "bottom_flange_positions"])
    );
    assert!(bracing["properties"]["top_flange_positions"]["items"].is_object());
    assert!(bracing["properties"]["bottom_flange_positions"]["items"].is_object());

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

// ── 2. Het gedrag van de server op geldige en ongeldige invoer ──────────────

#[tokio::test]
async fn geldige_invoer_wordt_gewoon_getoetst() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let result = roep_check_aan(&mut stdin, &mut reader, 10, geldige_invoer()).await;
    assert_eq!(
        result["isError"], false,
        "geldige invoer moet gewoon rekenen, kreeg: {}",
        foutmelding(&result)
    );
    let checks = result["structuredContent"]["checks"]
        .as_array()
        .expect("resultaat moet een 'checks'-array bevatten");
    assert!(!checks.is_empty(), "er is geen enkele toets uitgevoerd");

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn tikfout_in_veldnaam_wordt_geweigerd_in_plaats_van_stil_genegeerd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    // q_equiv_n_per_m in plaats van q_equiv_n_per_mm. Vóór deze fix rekende de
    // server door met q = 0 en viel de kiptoets gunstiger uit.
    let mut invoer = geldige_invoer();
    let obj = invoer.as_object_mut().unwrap();
    obj.remove("q_equiv_n_per_mm");
    obj.insert("q_equiv_n_per_m".to_string(), json!(12.5));

    let result = roep_check_aan(&mut stdin, &mut reader, 11, invoer).await;
    let melding = foutmelding(&result);
    assert_eq!(
        result["isError"], true,
        "een onbekend veld moet een fout geven, kreeg een resultaat: {result}"
    );
    assert!(
        melding.contains("q_equiv_n_per_m"),
        "de melding moet het onbekende veld noemen, kreeg: {melding}"
    );
    assert!(
        melding.contains("unknown field"),
        "de melding moet aangeven dat het veld onbekend is, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn leeg_lateral_bracing_geeft_een_begrijpelijke_fout() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut invoer = geldige_invoer();
    invoer["lateral_bracing"] = json!({});

    let result = roep_check_aan(&mut stdin, &mut reader, 12, invoer).await;
    let melding = foutmelding(&result);
    assert_eq!(
        result["isError"], true,
        "'lateral_bracing: {{}}' moet een fout geven, kreeg: {result}"
    );
    assert!(
        melding.contains("top_flange_positions"),
        "de melding moet zeggen welk veld ontbreekt, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn onbekend_veld_in_lateral_bracing_wordt_geweigerd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut invoer = geldige_invoer();
    // Enkelvoud in plaats van meervoud: zonder deny_unknown_fields zou dit
    // "missing field top_flange_positions" heten en niet de tikfout noemen.
    invoer["lateral_bracing"] = json!({
        "top_flange_position": [0.5],
        "bottom_flange_positions": []
    });

    let result = roep_check_aan(&mut stdin, &mut reader, 13, invoer).await;
    let melding = foutmelding(&result);
    assert_eq!(result["isError"], true, "kreeg: {result}");
    assert!(
        melding.contains("top_flange_position"),
        "de melding moet het onbekende veld noemen, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

// ── 3. De betontools ────────────────────────────────────────────────────────
//
// `ConcreteBeamCheckInput`, `MnKappaRequest`, `ReinforcementCage` en `RebarRow`
// staan alle vier op `#[serde(deny_unknown_fields)]`. Het schema moet dat
// spiegelen én alle velden noemen: laat een schema een veld met
// `#[serde(default)]` weg, dan wordt het door `additionalProperties: false`
// zelfs geweigerd en kan een client het niet meer opgeven.

/// De referentiedoorsnede: 300 × 500, C30/37, B500B, dekking 30, beugel Ø8,
/// onder 3Ø16, boven 2Ø12 — dezelfde als in `concrete-check/tests/`.
fn geldige_betoninvoer() -> Value {
    json!({
        "beam_id": 7,
        "section": { "b_mm": 300, "h_mm": 500 },
        "concrete_class": "C30/37",
        "reinforcement_grade": "B500B",
        "cage": {
            "cover_mm": 30,
            "stirrup_diameter_mm": 8,
            "top": { "count": 2, "diameter_mm": 12 },
            "bottom": { "count": 3, "diameter_mm": 16 }
        },
        "length_m": 5,
        "forces_envelope": [
            { "combination_id": 1, "position_mm": 2500,
              "forces": { "n_ed": 0, "vy_ed": 0, "vz_ed": 0,
                          "mt_ed": 0, "my_ed": 100, "mz_ed": 0 } }
        ]
    })
}

#[tokio::test]
async fn schema_van_check_concrete_beam_is_volledig_en_strikt() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let tool = tooldefinitie(&mut stdin, &mut reader, 20, "check_concrete_beam").await;
    let schema = &tool["inputSchema"];
    let props = &schema["properties"];

    assert_eq!(
        schema["additionalProperties"], false,
        "check_concrete_beam moet additionalProperties: false hebben"
    );

    // Elk veld van ConcreteBeamCheckInput, ook de tien met #[serde(default)].
    // De vijf voor `reinforcement_zones` horen bij de toetsen buiten 6.1
    // (dwarskracht, scheurbeheersing, slankheid, detaillering): ze zijn
    // optioneel, maar een client die ze niet in het schema ziet staan, stuurt
    // ze nooit mee - en dan blijft de halve toetsing ongedaan zonder dat
    // iemand het merkt. Voor `reinforcement_zones` geldt hetzelfde met een
    // ander gevolg: die client wordt stilzwijgend met EEN korf over de hele
    // staaf doorgerekend terwijl hij de wapening per zone heeft opgegeven.
    for veld in [
        "beam_id", "section", "concrete_class",
        "reinforcement_grade", "cage", "length_m", "forces_envelope",
        "n_strips", "steel_branch", "design_situation", "apply_min_eccentricity",
        "sls_frequent_envelope", "exposure_class", "structural_class",
        "aggregate_size_mm",
        "structural_system", "bar_spacing_mm", "reinforcement_zones",
        // §5.8. `column` draagt het ontwerpbesluit geschoord/ongeschoord en de
        // kniklengte; ontbreekt het in het schema, dan stuurt een client het
        // nooit mee en blijft de slankheidsgrens ongetoetst bij een staaf die
        // wél normaaldruk draagt — precies de toets die zegt of er nog een
        // tweede-orde-berekening moet volgen. `sls_quasi_permanent_envelope`
        // is de DERDE omhullende, alleen voor M₀Eqp in (5.19); zonder haar
        // blijft φ_ef onbekend en valt λ_lim terug op A = 0,7.
        "sls_quasi_permanent_envelope", "column",
    ] {
        assert!(
            props[veld].is_object(),
            "veld '{veld}' ontbreekt in het schema van check_concrete_beam"
        );
    }
    assert_eq!(
        props.as_object().unwrap().len(),
        20,
        "het schema kent een veld dat ConcreteBeamCheckInput weigert"
    );

    // HET KOLOMBLOK. `bracing` en `buckling_length` zijn er VERPLICHT zodra het
    // blok bestaat: §5.8.1 noemt geschoord uitdrukkelijk een aanname in de
    // berekening, en een standaardwaarde zou dat besluit stilzwijgend nemen.
    // De twee §9.5-keuzen zijn juist optioneel — hun toets komt dan als
    // NotApplicable terug in plaats van dat de ruimste tak wordt aangenomen.
    let kolom = &props["column"];
    assert_eq!(kolom["additionalProperties"], false);
    assert_eq!(kolom["required"], json!(["bracing", "buckling_length"]));
    assert_eq!(kolom["properties"]["bracing"]["enum"], json!(["Geschoord", "Ongeschoord"]));
    // De twee wegen naar l₀, en niet meer dan twee: de gevallen f) en g) van
    // figuur 5.7 vragen k = (θ/M)·(EI/l) en staan er bewust niet in.
    let l0 = &kolom["properties"]["buckling_length"]["oneOf"];
    assert_eq!(l0.as_array().unwrap().len(), 2);
    assert_eq!(l0[0]["properties"]["soort"]["const"], "Figuur57");
    assert_eq!(
        l0[0]["properties"]["geval"]["enum"],
        json!([
            "ScharnierendScharnierend",
            "Console",
            "IngeklemdScharnierend",
            "TweezijdigIngeklemdGeschoord",
            "TweezijdigIngeklemdOngeschoord"
        ]),
        "alleen de vijf vakjes van figuur 5.7 met een VASTE l₀; f) en g) geven een bereik"
    );
    assert_eq!(l0[1]["properties"]["soort"]["const"], "Opgegeven");

    // DE WAPENINGSZONES. Twee gescheiden lijsten, allebei optioneel en allebei
    // strikt: een tikfout in een zoneveld mag niet stil op een standaard
    // terugvallen. Zonder deze regels zou een schema dat het veld wel noemt
    // maar de lijsten niet, elke zone alsnog wegfilteren.
    let zones = &props["reinforcement_zones"];
    assert_eq!(zones["additionalProperties"], false);
    assert!(
        zones["required"].is_null(),
        "beide zonelijsten horen optioneel te zijn: leeg = de korf geldt over de hele staaf"
    );
    let langs = &zones["properties"]["longitudinal"]["items"];
    assert_eq!(langs["additionalProperties"], false);
    assert_eq!(
        langs["required"],
        json!(["side", "row", "x_start_mm", "x_end_mm"]),
        "zijde, rij en de twee maten zijn de dragende gegevens van een langswapeningszone"
    );
    assert_eq!(langs["properties"]["side"]["enum"], json!(["Bottom", "Top"]));
    // De twee UITVOERINGSgegevens van 8.4 die niemand kan afleiden.
    assert_eq!(
        langs["properties"]["bar_shape"]["enum"],
        json!(["Recht", "AndersDanRecht"])
    );
    assert_eq!(
        langs["properties"]["casting_position"]["enum"],
        json!(["Onderzijde", "Bovenzijde", "Glijbekisting", "GoedAangetoond"])
    );
    let beugel = &zones["properties"]["stirrups"]["items"];
    assert_eq!(beugel["additionalProperties"], false);
    assert_eq!(
        beugel["required"],
        json!(["x_start_mm", "x_end_mm", "spacing_mm", "legs", "diameter_mm"]),
        "in een beugelzone zijn alle vijf de gegevens verplicht - anders zou de \
         dwarskrachttoets op dat stuk stilzwijgend uitvallen"
    );

    // De frequente BGT-combinatie is een ANDERE combinatie dan de
    // UGT-omhullende, en het schema hoort dat te zeggen: een client die de
    // twee verwisselt krijgt een geloofwaardige maar verkeerde scheurwijdte.
    let bgt = props["sls_frequent_envelope"]["description"]
        .as_str()
        .expect("sls_frequent_envelope heeft een beschrijving");
    assert!(bgt.contains("6.15"), "de beschrijving noemt uitdrukking (6.15) niet: {bgt}");
    assert!(
        bgt.contains("NIET de UGT"),
        "de beschrijving waarschuwt niet voor de verwisseling met de UGT-omhullende"
    );

    // De doorsnede: een vorm met benoemde maten, en ook zij weigert onbekende
    // velden. `b_w_mm` en `h_f_mm` zijn niet in het schema verplicht — dat kan
    // een JSON-schema niet per vorm — maar ze moeten er wél in staan, anders
    // filtert `additionalProperties: false` een T weg voordat de kern hem ziet.
    let sec = &props["section"];
    assert_eq!(sec["additionalProperties"], false);
    assert_eq!(sec["required"], json!(["b_mm", "h_mm"]));
    assert_eq!(sec["properties"]["shape"]["enum"], json!(["Rectangle", "Tee", "Ell"]));
    for veld in ["shape", "b_mm", "h_mm", "b_w_mm", "h_f_mm", "flange_at_bottom"] {
        assert!(
            sec["properties"][veld].is_object(),
            "veld '{veld}' ontbreekt in het doorsnedeschema"
        );
    }
    assert_eq!(sec["properties"].as_object().unwrap().len(), 6);

    // De enums die de kern werkelijk kent (serde schrijft de varianten uit).
    assert_eq!(props["steel_branch"]["enum"], json!(["Horizontal", "Inclined"]));
    assert_eq!(
        props["design_situation"]["enum"],
        json!(["PersistentTransient", "Accidental"])
    );

    // De korf: geen standaardwaarden, dus de vier dragende velden verplicht.
    let cage = &props["cage"];
    assert_eq!(cage["additionalProperties"], false);
    assert_eq!(
        cage["required"],
        json!(["cover_mm", "stirrup_diameter_mm", "top", "bottom"])
    );
    for zijde in ["top", "bottom"] {
        let rij = &cage["properties"][zijde];
        assert_eq!(rij["additionalProperties"], false);
        assert_eq!(rij["required"], json!(["count", "diameter_mm"]));
    }
    // De beugelvelden staan er wél in, maar niet als verplicht: ze dragen
    // §6.2.3 en §9.2.2 en zouden door `additionalProperties: false` worden
    // weggefilterd als het schema ze niet noemde.
    for veld in [
        "stirrup_spacing_mm",
        "stirrup_legs",
        "stirrup_leg_spacing_mm",
        "stirrup_fywk_mpa",
    ] {
        assert!(
            cage["properties"][veld].is_object(),
            "veld '{veld}' ontbreekt in het korfschema"
        );
    }
    // De DEKKING PER ZIJDE (4.4.1.1(1)P) om dezelfde reden: optioneel, maar
    // wél in het schema. Zou hij ontbreken, dan filtert
    // `additionalProperties: false` de zijden weg en rekent de client
    // stilzwijgend met één dekking rondom — precies de fout waarvoor deze
    // velden zijn gemaakt.
    for veld in ["cover_top", "cover_bottom", "cover_sides"] {
        let zijde = &cage["properties"][veld];
        assert!(zijde.is_object(), "veld '{veld}' ontbreekt in het korfschema");
        assert_eq!(zijde["additionalProperties"], false, "{veld}");
        // `null` moet toegestaan blijven: zo zegt een client "deze zijde volgt
        // het element".
        assert_eq!(zijde["type"], json!(["object", "null"]), "{veld}");
        assert!(zijde["properties"]["cover_mm"].is_object(), "{veld}");
        assert!(zijde["properties"]["exposure_class"].is_object(), "{veld}");
        assert_eq!(zijde["properties"].as_object().unwrap().len(), 2, "{veld}");
        // Niets van een zijde is verplicht: alleen de dekking, alleen de
        // klasse of geen van beide zijn alle drie geldige opgaven.
        assert!(zijde.get("required").is_none(), "{veld}");
    }
    assert_eq!(cage["properties"].as_object().unwrap().len(), 11);

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn schema_van_concrete_mn_kappa_is_volledig_en_strikt() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let tool = tooldefinitie(&mut stdin, &mut reader, 21, "concrete_mn_kappa").await;
    let schema = &tool["inputSchema"];
    let props = &schema["properties"];

    assert_eq!(schema["additionalProperties"], false);
    for veld in [
        "section", "concrete_class", "reinforcement_grade",
        "cage", "n_ed_kn", "moment_sign", "n_strips", "steel_branch",
        "design_situation", "interaction_points",
    ] {
        assert!(
            props[veld].is_object(),
            "veld '{veld}' ontbreekt in het schema van concrete_mn_kappa"
        );
    }
    assert_eq!(
        props.as_object().unwrap().len(),
        10,
        "het schema kent een veld dat MnKappaRequest weigert"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn geldige_betoninvoer_wordt_gewoon_getoetst() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let result = roep_tool_aan(
        &mut stdin,
        &mut reader,
        22,
        "check_concrete_beam",
        geldige_betoninvoer(),
    )
    .await;
    assert_eq!(
        result["isError"], false,
        "geldige invoer moet gewoon rekenen, kreeg: {}",
        foutmelding(&result)
    );
    let checks = result["structuredContent"]["checks"]
        .as_array()
        .expect("resultaat moet een 'checks'-array bevatten");
    assert!(!checks.is_empty(), "er is geen enkele toets uitgevoerd");

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

#[tokio::test]
async fn tikfout_in_een_betonveld_wordt_geweigerd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    // n_stripes in plaats van n_strips: zonder deny_unknown_fields zou de
    // toetsing doorlopen met 50 stroken terwijl de aanroeper er 200 vroeg.
    let mut invoer = geldige_betoninvoer();
    invoer.as_object_mut().unwrap().insert("n_stripes".into(), json!(200));

    let result = roep_tool_aan(&mut stdin, &mut reader, 23, "check_concrete_beam", invoer).await;
    let melding = foutmelding(&result);
    assert_eq!(result["isError"], true, "kreeg een resultaat: {result}");
    assert!(
        melding.contains("n_stripes") && melding.contains("unknown field"),
        "de melding moet het onbekende veld noemen, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een korf zonder dekking is geen korf met dekking 0: `ReinforcementCage`
/// kent geen standaardwaarden, dus dit hoort een fout te zijn en geen
/// stilzwijgend gunstiger geplaatste wapening.
#[tokio::test]
async fn onvolledige_wapeningskorf_wordt_geweigerd() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let mut invoer = geldige_betoninvoer();
    invoer["cage"].as_object_mut().unwrap().remove("cover_mm");

    let result = roep_tool_aan(&mut stdin, &mut reader, 24, "check_concrete_beam", invoer).await;
    let melding = foutmelding(&result);
    assert_eq!(result["isError"], true, "kreeg een resultaat: {result}");
    assert!(
        melding.contains("cover_mm"),
        "de melding moet zeggen welk veld ontbreekt, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}

/// Een onbekende sterkteklasse in `concrete_mn_kappa` levert een toolfout met
/// de reden, en geen leeg diagram — leeg zou als "geen capaciteit" lezen.
#[tokio::test]
async fn onbekende_sterkteklasse_geeft_een_leesbare_fout() {
    let (mut child, mut stdin, mut reader) = start_server().await;

    let result = roep_tool_aan(
        &mut stdin,
        &mut reader,
        25,
        "concrete_mn_kappa",
        json!({
            "section": { "b_mm": 300, "h_mm": 500 },
            "concrete_class": "C24", "reinforcement_grade": "B500B",
            "cage": geldige_betoninvoer()["cage"]
        }),
    )
    .await;
    let melding = foutmelding(&result);
    assert_eq!(result["isError"], true, "kreeg een resultaat: {result}");
    assert!(
        melding.contains("C24"),
        "de melding moet de afgewezen klasse noemen, kreeg: {melding}"
    );

    drop(stdin);
    let _ = timeout(Duration::from_secs(5), child.wait()).await;
}
