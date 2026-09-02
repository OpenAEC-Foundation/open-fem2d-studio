//! fout_paden.rs — het foutpad van de MCP-server (taak T11).
//!
//! WAAROM DEZE TESTS BESTAAN
//! Een toolfout gaat per MCP-spec terug als een *geslaagd* JSON-RPC-resultaat
//! met `isError: true`, zodat het model de fout kan lezen. Daarbij ging tot nu
//! toe alleen de meldingstekst mee: de foutcode en `data` verdampten. Voor een
//! client las "Node ontbreekt" daarmee identiek aan "je raamwerk is een
//! mechanisme" — een ontbrekende runtime en een constructieve bevinding werden
//! ononderscheidbaar. Bij rekensoftware voor constructies is dat geen
//! ergernis maar een fout: de eerste vraagt een installatie, de tweede vraagt
//! een ander ontwerp.
//!
//! De tests hieronder bewijzen twee dingen die samen moeten kloppen:
//!   1. de machineleesbare foutcode overleeft de MCP-grens, en
//!   2. de twee soorten storing krijgen aantoonbaar een ANDERE code.
//!
//! Daarnaast dekken ze de JSON-RPC-foutpaden `-32700`, `-32601` en `-32602`,
//! die tot nu toe helemaal ongetest waren.

use openaec_mcp_server::sidecar::NODE_ONTBREEKT;
use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

/// Code die de sidecar geeft als de rekenkern het model weigert.
const MODEL_ONOPLOSBAAR: &str = "MODEL_ONOPLOSBAAR";

// ── Aansturing van de server ────────────────────────────────────────────────

/// Een draaiende server plus zijn stdio, met een teller voor de verzoek-id's.
struct Server {
    kind: Child,
    stdin: ChildStdin,
    stdout: BufReader<tokio::process::ChildStdout>,
    volgende_id: i64,
}

impl Server {
    /// Start de server. `node` is de waarde van `OPENAEC_NODE`; `None` laat de
    /// omgeving met rust, zodat de server Node gewoon op PATH vindt.
    async fn start(node: Option<&str>) -> Self {
        let mut cmd = Command::new(BIN_PATH);
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // De klok kort houden: geen van deze tests hoort te rekenen, en een
        // vastlopende sidecar moet hier als fout opvallen en niet als 60 s wachten.
        cmd.env("OPENAEC_MCP_SOLVE_TIMEOUT", "20");
        if let Some(pad) = node {
            cmd.env("OPENAEC_NODE", pad);
        }
        let mut kind = cmd.spawn().expect("server starten");
        let stdin = kind.stdin.take().expect("stdin");
        let stdout = BufReader::new(kind.stdout.take().expect("stdout"));
        let mut server = Self { kind, stdin, stdout, volgende_id: 1 };
        // Handshake; het antwoord doet er hier niet toe, alleen dat hij er is.
        let _ = server.verzoek("initialize", json!({})).await;
        server
    }

    /// Schrijft één ruwe regel en leest één antwoordregel.
    async fn ruwe_regel(&mut self, regel: &str) -> Value {
        self.stdin
            .write_all(format!("{regel}\n").as_bytes())
            .await
            .expect("schrijven naar stdin");
        self.stdin.flush().await.expect("stdin doorspoelen");
        let mut lijn = String::new();
        let n = timeout(Duration::from_secs(60), self.stdout.read_line(&mut lijn))
            .await
            .expect("wachten op antwoord duurde te lang")
            .expect("lezen van stdout");
        assert!(n > 0, "einde-bestand op stdout — de server stopte onverwacht");
        serde_json::from_str(lijn.trim())
            .unwrap_or_else(|e| panic!("ongeldige JSON-RPC-regel {lijn:?}: {e}"))
    }

    /// Eén JSON-RPC-verzoek met een oplopende id.
    async fn verzoek(&mut self, methode: &str, params: Value) -> Value {
        let id = self.volgende_id;
        self.volgende_id += 1;
        let bericht = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": methode,
            "params": params,
        });
        let antwoord = self.ruwe_regel(&serde_json::to_string(&bericht).unwrap()).await;
        assert_eq!(antwoord["id"], json!(id), "antwoord hoort bij een ander verzoek");
        antwoord
    }

    /// Roept een tool aan en geeft het `result`-object terug. Een JSON-RPC-fout
    /// is hier een testfout: toolfouten horen in `result` te staan.
    async fn tool(&mut self, naam: &str, argumenten: Value) -> Value {
        let antwoord = self
            .verzoek("tools/call", json!({ "name": naam, "arguments": argumenten }))
            .await;
        assert!(
            antwoord["error"].is_null(),
            "een toolfout hoort in `result` te staan, niet als JSON-RPC-fout: {antwoord}"
        );
        antwoord["result"].clone()
    }

    async fn stop(mut self) {
        drop(self.stdin);
        let _ = timeout(Duration::from_secs(5), self.kind.wait()).await;
    }
}

/// Het `structuredContent` van een mislukte toolaanroep, met de vaste eisen die
/// voor ELKE toolfout gelden: `isError`, een code, een melding, en een
/// `remedie`-sleutel die er ook is als hij leeg is.
fn foutinhoud(resultaat: &Value) -> Value {
    assert_eq!(
        resultaat["isError"],
        json!(true),
        "deze aanroep had moeten mislukken: {resultaat}"
    );
    let inhoud = resultaat["structuredContent"].clone();
    assert!(
        inhoud.is_object(),
        "een toolfout hoort machineleesbaar terug te komen in `structuredContent`, \
         niet alleen als tekst: {resultaat}"
    );
    assert!(
        inhoud["error_code"].is_string(),
        "`error_code` ontbreekt of is geen tekst: {inhoud}"
    );
    assert!(
        inhoud["melding"].is_string(),
        "`melding` ontbreekt of is geen tekst: {inhoud}"
    );
    assert!(
        inhoud.get("remedie").is_some(),
        "de sleutel `remedie` hoort er altijd te staan, desnoods op null: {inhoud}"
    );
    // De tekstregel voor een mens blijft er ook: de code vervángt hem niet.
    assert!(
        resultaat["content"][0]["text"].is_string(),
        "de leesbare melding hoort te blijven: {resultaat}"
    );
    inhoud
}

// ── Modellen ────────────────────────────────────────────────────────────────

/// Een ligger van 6 m zonder ÉÉN oplegging: vrij zwevend, dus onoplosbaar.
/// Bewust een model dat verder helemaal deugt — knopen, staaf, profiel en last
/// kloppen — zodat de fout aantoonbaar uit de rekenkern komt en niet uit de
/// argumentcontrole ervoor.
fn model_zonder_opleggingen() -> Value {
    json!({
        "nodes": [
            { "id": 1, "x": 0,    "z": 0 },
            { "id": 2, "x": 6000, "z": 0 }
        ],
        "beams": [
            { "id": 1, "from": 1, "to": 2, "material": "S235", "profile": "IPE300" }
        ],
        "supports": [],
        "plates": [],
        "loadCases": [{ "id": 1, "name": "G", "type": "dead" }],
        "loads": [{ "id": 1, "type": "lineLoad", "caseId": 1, "beamId": 1, "q": -10 }],
        "selfWeightEnabled": false,
        "scheefstandEnabled": false,
        "scheefstandNoemer": 200,
        "scheefstandRichting": 1
    })
}

// ── 1. Ontbrekende runtime houdt zijn eigen code ────────────────────────────

#[tokio::test]
async fn ontbrekende_node_geeft_node_ontbreekt_in_structuredcontent() {
    let mut server = Server::start(Some("/bestaat/niet/node")).await;

    let resultaat = server
        .tool("solve_fem_model", json!({ "model": model_zonder_opleggingen() }))
        .await;
    let fout = foutinhoud(&resultaat);

    assert_eq!(
        fout["error_code"], json!(NODE_ONTBREEKT),
        "de code van de sidecar hoort de MCP-grens te overleven: {fout}"
    );

    // Melding en remedie zijn Nederlands en wijzen de uitweg. Zonder de remedie
    // weet de gebruiker wél dát het misging maar niet wat hij eraan kan doen.
    let melding = fout["melding"].as_str().unwrap_or_default();
    let remedie = fout["remedie"].as_str().unwrap_or_default();
    assert!(melding.contains("Node.js"), "melding: {melding}");
    assert!(remedie.contains("OPENAEC_NODE"), "remedie: {remedie}");

    // `detail` gaat onaangetast mee: het geprobeerde pad is het enige dat een
    // gebruiker met een dichtgetimmerde machine verder helpt.
    assert_eq!(
        fout["detail"]["geprobeerde_paden"], json!(["/bestaat/niet/node"]),
        "detail: {}", fout["detail"]
    );

    server.stop().await;
}

// ── 2. Een onoplosbaar model krijgt een ANDERE code ─────────────────────────

#[tokio::test]
async fn onoplosbaar_model_krijgt_een_andere_code_dan_een_ontbrekende_runtime() {
    let mut server = Server::start(None).await;

    // Deze test rekent echt en vereist dus Node. Stil overslaan zou hier het
    // ergste zijn wat er kan: de test die bewijst dat een rekenfout er anders
    // uitziet dan een storing, zou zichzelf uitzetten zodra er een storing is.
    let status = server.tool("fem_solver_status", json!({})).await;
    let status = &status["structuredContent"];
    assert_eq!(
        status["available"], json!(true),
        "deze test vereist een werkende Node-runtime. Gemeld: [{}] {}",
        status["error_code"], status["reason"]
    );

    let resultaat = server
        .tool("solve_fem_model", json!({ "model": model_zonder_opleggingen() }))
        .await;
    let fout = foutinhoud(&resultaat);

    assert_eq!(
        fout["error_code"], json!(MODEL_ONOPLOSBAAR),
        "een model dat de rekenkern weigert hoort MODEL_ONOPLOSBAAR te geven: {fout}"
    );
    // Dit is de kern van T11: de twee soorten storing zijn machineleesbaar te
    // onderscheiden. Zonder deze ongelijkheid moet een client op tekst matchen.
    assert_ne!(fout["error_code"], json!(NODE_ONTBREEKT));

    let melding = fout["melding"].as_str().unwrap_or_default();
    assert!(
        melding.contains("opleggingen"),
        "de melding hoort in het Nederlands te zeggen wat er mis is: {melding}"
    );
    // De originele Engelse kernmelding blijft in `detail` staan; zonder die is
    // een afbeelding die stilletjes verkeerd gaat niet meer te herleiden.
    assert_eq!(
        fout["detail"]["originele_melding"],
        json!("Model has no constraints - add boundary conditions"),
        "detail: {}", fout["detail"]
    );

    server.stop().await;
}

// ── 3. Terugvalcode voor tools die zelf geen `data` meegeven ────────────────

#[tokio::test]
async fn tools_zonder_eigen_foutdata_krijgen_een_afgeleide_code() {
    // Zonder Node, want geen van beide aanroepen hoort te rekenen; zo bewijst
    // deze test meteen dat de staaltools ook zonder runtime blijven werken.
    let mut server = Server::start(Some("/bestaat/niet/node")).await;

    // Onbekende toolnaam → de aanroeper vroeg iets dat niet bestaat.
    let fout = foutinhoud(&server.tool("bestaat_niet", json!({})).await);
    assert_eq!(fout["error_code"], json!("TOOL_ONBEKEND"), "{fout}");

    // Ondeugdelijk argument bij een staaltool: de tool geeft zelf geen `data`
    // mee, dus valt de code terug op de JSON-RPC-code -32602.
    let fout = foutinhoud(
        &server
            .tool("compute_section_properties", json!({ "profile_name": "GEENPROFIEL" }))
            .await,
    );
    assert_eq!(fout["error_code"], json!("ARGUMENT_ONGELDIG"), "{fout}");
    assert_eq!(
        fout["remedie"], Value::Null,
        "zonder bekende remedie hoort de sleutel op null te staan, niet te ontbreken: {fout}"
    );

    server.stop().await;
}

// ── 4. De JSON-RPC-foutpaden zelf ───────────────────────────────────────────

#[tokio::test]
async fn jsonrpc_foutpaden_geven_de_juiste_codes() {
    let mut server = Server::start(Some("/bestaat/niet/node")).await;

    // -32700 — onleesbare regel. De server mag hierop niet stilvallen: het
    // antwoord komt met id `null`, want er valt geen id uit te lezen.
    let antwoord = server.ruwe_regel("{dit is geen JSON").await;
    assert_eq!(antwoord["error"]["code"], json!(-32700), "{antwoord}");
    assert_eq!(antwoord["id"], Value::Null, "{antwoord}");
    assert!(antwoord["result"].is_null(), "{antwoord}");

    // -32601 — onbekende JSON-RPC-methode (niet: onbekende tool; dat is 3).
    let antwoord = server.verzoek("bestaat/niet", json!({})).await;
    assert_eq!(antwoord["error"]["code"], json!(-32601), "{antwoord}");
    assert!(antwoord["result"].is_null(), "{antwoord}");

    // -32602 — `tools/call` zonder toolnaam.
    let antwoord = server.verzoek("tools/call", json!({ "arguments": {} })).await;
    assert_eq!(antwoord["error"]["code"], json!(-32602), "{antwoord}");
    assert!(antwoord["result"].is_null(), "{antwoord}");

    // -32600 — een verzoek dat zich niet als JSON-RPC 2.0 aanmeldt.
    let antwoord = server
        .ruwe_regel(r#"{"jsonrpc":"1.0","id":99,"method":"ping","params":{}}"#)
        .await;
    assert_eq!(antwoord["error"]["code"], json!(-32600), "{antwoord}");
    assert_eq!(antwoord["id"], json!(99), "{antwoord}");

    // Na vier foutieve verzoeken doet de server het gewoon nog: een foutpad mag
    // de stdio-lus niet slopen.
    let antwoord = server.verzoek("ping", json!({})).await;
    assert!(antwoord["error"].is_null(), "{antwoord}");
    assert!(antwoord["result"].is_object(), "{antwoord}");

    server.stop().await;
}
