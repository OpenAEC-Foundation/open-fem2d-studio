//! sidecar.rs — de Rust-kant van de solver-sidecar.
//!
//! WAT DIT WEL EN NIET DOET
//! Deze module rekent NIET. Ze start per aanroep een kortlevend Node-proces op
//! de ingebakken solverbundel en voert daarmee letterlijk dezelfde
//! `solveAllCases` / `solveAllCasesNonlinear` uit die de app aanroept. Er komt
//! geen tweede rekenkern bij: een tweede implementatie zou betekenen dat
//! hetzelfde model twee plausibele antwoorden kan geven, en in constructieve
//! software is dat een veiligheidsprobleem, geen onderhoudslast.
//!
//! De taakverdeling is daarmee:
//!   Rust  — proces, tijd, bestandstoegang, hashbewaking, foutcodes
//!   Node  — alle natuurkunde, eenheden en tekens
//!
//! PROCES PER AANROEP
//! Geen langlevend proces. Opstarten kost ~80–110 ms tegenover 4 ms tot enkele
//! seconden rekenen, en het schrapt levensduurbeheer, herstart, backpressure én
//! het risico dat module-globale toestand van model A naar model B lekt: elk
//! model krijgt een schone module-graaf.
//!
//! DE HASHKETEN — waarom hier zoveel aandacht naar uitgaat
//! De bundel zit met `include_str!` in de binary, dus er is per definitie één
//! artefact. Dat voordeel is precies één omgevingsvariabele breed: wie
//! `OPENAEC_FEM_KERNEL` naar een ander bestand mag wijzen, kan ongemerkt een
//! andere rekenkern onderschuiven. Daarom wordt de hash van dat bestand
//! GEVERIFIEERD vóór Node ook maar start, en geweigerd bij verschil — tenzij
//! `OPENAEC_FEM_STA_DRIFT_TOE=1` er los bij staat. Twee sloten daarnaast:
//! `build.rs` bewaakt bundel ↔ hashbestand tijdens de build, en de handshake
//! vergelijkt de hash die het Node-proces van zichzelf berekent met de onze —
//! dat vangt ook een omwisseling ná onze controle.
//!
//! FOUT ≠ REKENFOUT
//! Elke fout hier krijgt een eigen code en een Nederlandse remedie. Zonder dat
//! onderscheid leest "Node ontbreekt" voor een machine identiek aan "je
//! raamwerk is een mechanisme", en dat mag bij constructieve software niet.

use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

/// De solverbundel, ingebakken. Zie de moduledocumentatie voor het waarom.
const BUNDEL: &str = include_str!("../assets/fem-kernel.mjs");

/// Versie van het interne NDJSON-protocol; moet gelijk zijn aan
/// `SIDECAR_PROTOCOL` in `design-mockup/src/mcp/protocol.ts`.
pub const SIDECAR_PROTOCOL: u32 = 1;

/// Node 20 is de ondergrens: de bundel wordt met `--target=node20` gebouwd.
pub const MINIMALE_NODE_MAJOR: u64 = 20;

/// Standaardklok per aanroep, in seconden.
pub const STANDAARD_TIMEOUT_S: u64 = 60;

/// Bovengrens, gelijk aan `timeout_s.maximum` in het toolschema.
pub const MAXIMALE_TIMEOUT_S: u64 = 600;

/// Versie van deze binary; gaat mee in de statusuitvoer.
pub const BINARY_VERSIE: &str = env!("CARGO_PKG_VERSION");

// ── Foutcodes ───────────────────────────────────────────────────────────────
// Klein en vast. De MCP-laag beslist hierop welke remedie de gebruiker ziet,
// dus een nieuwe code is een wijziging van het contract, geen detail.

/// Geen bruikbare Node-runtime gevonden.
pub const NODE_ONTBREEKT: &str = "NODE_ONTBREEKT";
/// Node gevonden, maar ouder dan de ondergrens.
pub const NODE_TE_OUD: &str = "NODE_TE_OUD";
/// De aangewezen bundel heeft een andere hash dan de ingebakken bundel.
pub const BUNDEL_AFWIJKEND: &str = "BUNDEL_AFWIJKEND";
/// De bundel kon niet worden gelezen of klaargezet.
pub const BUNDEL_ONLEESBAAR: &str = "BUNDEL_ONLEESBAAR";
/// De sidecar spreekt een andere protocolversie dan deze binary.
pub const PROTOCOL_MISMATCH: &str = "PROTOCOL_MISMATCH";
/// De klok liep af; het proces is gedood.
pub const TIJD_OVERSCHREDEN: &str = "TIJD_OVERSCHREDEN";
/// Niet-nul exitcode, lege stdout of onleesbaar antwoord: per definitie crash.
pub const SIDECAR_GECRASHT: &str = "SIDECAR_GECRASHT";

// ── Fouttype ────────────────────────────────────────────────────────────────

/// Een fout op de weg naar of vanuit de sidecar.
///
/// `melding` en `remedie` zijn ALTIJD Nederlands en zijn voor een mens
/// geschreven; `code` is voor een machine. Die scheiding is de reden dat een
/// ontbrekende runtime niet op een rekenfout kan lijken.
#[derive(Debug, Clone, Serialize)]
pub struct SidecarFout {
    pub code: String,
    pub melding: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remedie: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Value>,
}

impl SidecarFout {
    fn nieuw(code: &str, melding: impl Into<String>, remedie: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            melding: melding.into(),
            remedie: Some(remedie.into()),
            detail: None,
        }
    }

    fn met_detail(mut self, detail: Value) -> Self {
        self.detail = Some(detail);
        self
    }
}

impl std::fmt::Display for SidecarFout {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.melding)?;
        if let Some(r) = &self.remedie {
            write!(f, " — {r}")?;
        }
        Ok(())
    }
}

impl std::error::Error for SidecarFout {}

// ── Opties ──────────────────────────────────────────────────────────────────

/// Alles wat het gedrag van een aanroep stuurt.
///
/// De omgeving wordt op ÉÉN plek gelezen (`uit_omgeving`) en daarna als waarde
/// doorgegeven. Dat is geen stijlkwestie: `std::env::set_var` is procesbreed en
/// racet met parallelle tests, dus een module die zelf overal de omgeving leest
/// is niet fatsoenlijk te testen — en juist de hashpoort hieronder moet
/// aantoonbaar getest zijn.
#[derive(Debug, Clone, Default)]
pub struct SidecarOpties {
    /// `OPENAEC_NODE` — expliciet pad naar de Node-runtime.
    pub node: Option<PathBuf>,
    /// `OPENAEC_FEM_KERNEL` — ontsnappingsklep naar een bundel op schijf.
    pub kernel: Option<PathBuf>,
    /// `OPENAEC_FEM_STA_DRIFT_TOE=1` — sta een afwijkende bundel bewust toe.
    pub drift_toegestaan: bool,
    /// `OPENAEC_MCP_SOLVE_TIMEOUT` — klok in seconden.
    pub timeout_s: Option<u64>,
}

impl SidecarOpties {
    /// Leest de omgevingsvariabelen. Lege waarden tellen als niet-gezet: een
    /// lege `OPENAEC_NODE` mag niet als "" naar `Command::new` doorlopen.
    pub fn uit_omgeving() -> Self {
        let pad = |naam: &str| {
            std::env::var_os(naam)
                .filter(|v| !v.is_empty())
                .map(PathBuf::from)
        };
        Self {
            node: pad("OPENAEC_NODE"),
            kernel: pad("OPENAEC_FEM_KERNEL"),
            drift_toegestaan: std::env::var("OPENAEC_FEM_STA_DRIFT_TOE")
                .map(|v| v.trim() == "1")
                .unwrap_or(false),
            timeout_s: std::env::var("OPENAEC_MCP_SOLVE_TIMEOUT")
                .ok()
                .and_then(|v| v.trim().parse::<u64>().ok())
                .filter(|s| *s > 0),
        }
    }

    /// De klok voor deze aanroep: expliciet argument > omgeving > standaard.
    fn klok(&self, expliciet: Option<u64>) -> Duration {
        let s = expliciet
            .or(self.timeout_s)
            .unwrap_or(STANDAARD_TIMEOUT_S)
            .clamp(1, MAXIMALE_TIMEOUT_S);
        Duration::from_secs(s)
    }
}

// ── Hash van de ingebakken bundel ───────────────────────────────────────────

/// SHA-256 van de ingebakken bundel, als `sha256:<hex>`.
///
/// Bewust berekend uit `BUNDEL.as_bytes()` en niet overgenomen uit
/// `fem-kernel.sha256`: zo hashen we wat er WERKELIJK in de binary zit. Het
/// hashbestand is de tweede lezer — `build.rs` vergelijkt die twee tijdens de
/// build, zodat een verschil daar al opvalt.
pub fn ingebakken_hash() -> &'static str {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| format!("sha256:{}", hex(&Sha256::digest(BUNDEL.as_bytes()))))
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut uit = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(uit, "{b:02x}");
    }
    uit
}

// ── Node zoeken ─────────────────────────────────────────────────────────────

/// Een bruikbare Node-runtime.
#[derive(Debug, Clone)]
pub struct NodeVondst {
    pub pad: PathBuf,
    /// Zoals `node --version` het meldt, inclusief de `v`.
    pub versie: String,
    pub major: u64,
}

/// Kandidaten in volgorde van voorrang.
///
/// Staat `OPENAEC_NODE`, dan is dat de ENIGE kandidaat. Terugvallen op PATH zou
/// een tikfout in die variabele onzichtbaar maken: de gebruiker denkt runtime A
/// te draaien en krijgt B.
fn node_kandidaten(opties: &SidecarOpties) -> Vec<PathBuf> {
    if let Some(pad) = &opties.node {
        return vec![pad.clone()];
    }

    let mut lijst = vec![PathBuf::from("node")];

    #[cfg(windows)]
    if let Some(pf) = std::env::var_os("ProgramFiles") {
        lijst.push(PathBuf::from(pf).join("nodejs").join("node.exe"));
    }
    #[cfg(not(windows))]
    {
        lijst.push(PathBuf::from("/opt/homebrew/bin/node"));
        lijst.push(PathBuf::from("/usr/local/bin/node"));
    }

    lijst
}

/// `vNN.M.P` → NN. Levert `None` bij een vorm die we niet herkennen; dan is de
/// runtime niet te beoordelen en wordt hij niet gebruikt.
fn major_uit_versie(uitvoer: &str) -> Option<u64> {
    uitvoer
        .trim()
        .trim_start_matches(['v', 'V'])
        .split('.')
        .next()?
        .parse::<u64>()
        .ok()
}

/// Zoekt de eerste Node die start én oud genoeg is.
///
/// Een kandidaat die niet start telt als "niet aanwezig" en de zoektocht gaat
/// door. Een kandidaat die WEL start maar te oud is, stopt de zoektocht met
/// `NODE_TE_OUD`: stilletjes doorlopen naar een andere Node zou betekenen dat
/// niemand meer weet welke runtime de constructie heeft doorgerekend.
pub async fn zoek_node(opties: &SidecarOpties) -> Result<NodeVondst, SidecarFout> {
    let kandidaten = node_kandidaten(opties);
    let mut geprobeerd: Vec<String> = Vec::new();

    for pad in &kandidaten {
        geprobeerd.push(pad.display().to_string());
        let uitkomst = Command::new(pad)
            .arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .output()
            .await;

        let Ok(uit) = uitkomst else { continue };
        if !uit.status.success() {
            continue;
        }
        let versie = String::from_utf8_lossy(&uit.stdout).trim().to_string();
        let Some(major) = major_uit_versie(&versie) else {
            continue;
        };
        if major < MINIMALE_NODE_MAJOR {
            return Err(SidecarFout::nieuw(
                NODE_TE_OUD,
                format!(
                    "De gevonden Node-runtime is {versie}; de FEM-tools vereisen \
                     versie {MINIMALE_NODE_MAJOR} of nieuwer."
                ),
                format!(
                    "Werk Node.js bij naar {MINIMALE_NODE_MAJOR} of nieuwer, of wijs met de \
                     omgevingsvariabele OPENAEC_NODE naar een nieuwere runtime. \
                     De vijf staaltools blijven ook zonder Node werken."
                ),
            )
            .met_detail(json!({
                "pad": pad.display().to_string(),
                "gevonden_versie": versie,
                "vereiste_major": MINIMALE_NODE_MAJOR,
            })));
        }
        return Ok(NodeVondst {
            pad: pad.clone(),
            versie,
            major,
        });
    }

    Err(SidecarFout::nieuw(
        NODE_ONTBREEKT,
        format!(
            "Geen bruikbare Node.js-runtime gevonden ({} pad(en) geprobeerd). \
             De FEM-tools rekenen in Node; zonder runtime kunnen ze niet rekenen.",
            geprobeerd.len()
        ),
        format!(
            "Installeer Node.js {MINIMALE_NODE_MAJOR} of nieuwer (nodejs.org) en zorg dat `node` \
             op PATH staat, of zet de omgevingsvariabele OPENAEC_NODE op het volledige \
             pad naar node(.exe). De vijf staaltools werken ook zonder Node."
        ),
    )
    .met_detail(json!({
        "geprobeerde_paden": geprobeerd,
        "vereiste_major": MINIMALE_NODE_MAJOR,
    })))
}

// ── Bundel klaarzetten ──────────────────────────────────────────────────────

/// Waar de bundel vandaan komt, voor de statusuitvoer en de logging.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Bundelbron {
    /// Uitgepakt uit de binary naar de cache. De normale weg.
    Ingebakken,
    /// Aangewezen met `OPENAEC_FEM_KERNEL`, hash gelijk aan de ingebakken bundel.
    AangewezenGelijk,
    /// Aangewezen met `OPENAEC_FEM_KERNEL`, hash afwijkend en bewust toegestaan.
    AangewezenAfwijkend,
}

/// De klaargezette bundel.
#[derive(Debug, Clone)]
pub struct Bundel {
    pub pad: PathBuf,
    pub bron: Bundelbron,
    /// `sha256:<hex>` van het bestand dat Node gaat laden.
    pub hash: String,
}

/// Waar de uitgepakte bundel mag staan.
///
/// `%LOCALAPPDATA%` op Windows, de gebruikelijke cachemap elders. Valt terug op
/// de tijdelijke map: een cache die niet te schrijven is mag geen reden zijn om
/// niet te kunnen rekenen.
fn cache_wortel() -> PathBuf {
    #[cfg(windows)]
    if let Some(v) = std::env::var_os("LOCALAPPDATA") {
        return PathBuf::from(v);
    }
    #[cfg(target_os = "macos")]
    if let Some(h) = std::env::var_os("HOME") {
        return PathBuf::from(h).join("Library").join("Caches");
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(v) = std::env::var_os("XDG_CACHE_HOME") {
            return PathBuf::from(v);
        }
        if let Some(h) = std::env::var_os("HOME") {
            return PathBuf::from(h).join(".cache");
        }
    }
    std::env::temp_dir()
}

fn bestandshash(pad: &Path) -> std::io::Result<String> {
    let bytes = std::fs::read(pad)?;
    Ok(format!("sha256:{}", hex(&Sha256::digest(&bytes))))
}

/// Zet de bundel klaar op schijf en levert het pad dat Node moet laden.
///
/// MEEGEVEN VIA DE COMMANDOREGEL KAN NIET: de bundel is enkele honderden kB en
/// de Windows-commandoregel houdt op bij ~32 kB. stdin is bezet door het
/// protocol. Uitpakken naar een bestand is daarmee geen keuze maar een gevolg.
///
/// Blokkerende bestandstoegang in een async-context, met opzet: het gaat om één
/// lees- of schrijfactie van enkele honderden kB die in de regel wordt
/// overgeslagen (de cache staat er al). Dat weegt niet op tegen het opstarten
/// van het Node-proces daarna, dat ~80–110 ms kost.
///
/// DE HASHPOORT. Wijst `OPENAEC_FEM_KERNEL` naar een bestand, dan wordt de hash
/// daarvan vergeleken met de ingebakken bundel en bij verschil GEWEIGERD.
/// Zonder die controle is de hele "één rekenkern"-claim met één
/// omgevingsvariabele te omzeilen: iemand schuift een andere kern onder, de
/// getallen ogen plausibel, en niets meldt dat er iets anders heeft gerekend.
/// Bewust toestaan kan — `OPENAEC_FEM_STA_DRIFT_TOE=1` — maar dan staat het
/// zwart op wit in het antwoord en in het log.
pub fn zet_bundel_klaar(opties: &SidecarOpties) -> Result<Bundel, SidecarFout> {
    let ingebakken = ingebakken_hash();

    if let Some(pad) = &opties.kernel {
        // Niet terugvallen op de ingebakken bundel als het aangewezen bestand
        // ontbreekt: dan zou een tikfout in het pad stilzwijgend iets ANDERS
        // laten rekenen dan de gebruiker aanwees.
        let gevonden = bestandshash(pad).map_err(|fout| {
            SidecarFout::nieuw(
                BUNDEL_ONLEESBAAR,
                format!(
                    "De met OPENAEC_FEM_KERNEL aangewezen solverbundel `{}` kon niet \
                     worden gelezen ({fout}).",
                    pad.display()
                ),
                "Controleer het pad en de leesrechten, of haal OPENAEC_FEM_KERNEL weg \
                 zodat de ingebakken bundel wordt gebruikt.",
            )
            .met_detail(json!({ "pad": pad.display().to_string() }))
        })?;

        if gevonden == ingebakken {
            return Ok(Bundel {
                pad: pad.clone(),
                bron: Bundelbron::AangewezenGelijk,
                hash: gevonden,
            });
        }

        if !opties.drift_toegestaan {
            return Err(SidecarFout::nieuw(
                BUNDEL_AFWIJKEND,
                format!(
                    "De met OPENAEC_FEM_KERNEL aangewezen solverbundel is NIET dezelfde \
                     als de bundel in deze binary. Er is niet gerekend.\n\
                     \x20 aangewezen : {gevonden}\n\
                     \x20 ingebakken : {ingebakken}"
                ),
                "Wijs de bundel aan die bij deze binary hoort, of haal OPENAEC_FEM_KERNEL \
                 weg. Wil je met opzet een andere rekenkern draaien — bijvoorbeeld om een \
                 wijziging te beproeven — zet er dan OPENAEC_FEM_STA_DRIFT_TOE=1 bij. \
                 Resultaten uit een afwijkende kern horen niet in een constructief dossier.",
            )
            .met_detail(json!({
                "pad": pad.display().to_string(),
                "aangewezen_hash": gevonden,
                "ingebakken_hash": ingebakken,
            })));
        }

        tracing::warn!(
            pad = %pad.display(),
            aangewezen = %gevonden,
            ingebakken = %ingebakken,
            "AFWIJKENDE SOLVERKERN bewust toegestaan via OPENAEC_FEM_STA_DRIFT_TOE=1"
        );
        return Ok(Bundel {
            pad: pad.clone(),
            bron: Bundelbron::AangewezenAfwijkend,
            hash: gevonden,
        });
    }

    // Normale weg: uitpakken naar de cache. De hash staat in de bestandsnaam,
    // dus een oudere binary en een nieuwere kunnen naast elkaar bestaan zonder
    // elkaars bundel te overschrijven.
    let hex_deel = ingebakken.trim_start_matches("sha256:");
    let map = cache_wortel().join("openaec-mcp");
    let doel = map.join(format!("sidecar-{hex_deel}.mjs"));

    // Bestaat hij al én klopt hij? Dan niets doen. De hash opnieuw controleren
    // is goedkoop en vangt een half weggeschreven of aangepast cachebestand —
    // de bestandsnaam alleen is geen bewijs van de inhoud.
    if matches!(bestandshash(&doel), Ok(h) if h == ingebakken) {
        return Ok(Bundel {
            pad: doel,
            bron: Bundelbron::Ingebakken,
            hash: ingebakken.to_owned(),
        });
    }

    std::fs::create_dir_all(&map).map_err(|fout| bundel_schrijffout(&map, fout))?;

    // Eerst naar een eigen tijdelijk bestand, dan hernoemen. Zo ziet een tweede
    // proces nooit een half geschreven bundel — en dat is hier geen theorie:
    // meerdere tool-aanroepen kunnen tegelijk starten.
    let tijdelijk = map.join(format!("sidecar-{hex_deel}.{}.tmp", std::process::id()));
    std::fs::write(&tijdelijk, BUNDEL.as_bytes())
        .map_err(|fout| bundel_schrijffout(&tijdelijk, fout))?;
    if let Err(fout) = std::fs::rename(&tijdelijk, &doel) {
        // Op Windows kan hernoemen falen terwijl een ander proces het doel open
        // heeft. Klopt de hash van dat doel, dan is er niets aan de hand.
        let _ = std::fs::remove_file(&tijdelijk);
        if !matches!(bestandshash(&doel), Ok(h) if h == ingebakken) {
            return Err(bundel_schrijffout(&doel, fout));
        }
    }

    Ok(Bundel {
        pad: doel,
        bron: Bundelbron::Ingebakken,
        hash: ingebakken.to_owned(),
    })
}

fn bundel_schrijffout(pad: &Path, fout: std::io::Error) -> SidecarFout {
    SidecarFout::nieuw(
        BUNDEL_ONLEESBAAR,
        format!(
            "De solverbundel kon niet worden klaargezet op `{}` ({fout}).",
            pad.display()
        ),
        "Controleer de schrijfrechten op de cachemap. Op een dichtgetimmerde machine \
         (virusscanner, AppLocker, alleen-lezen profiel) kun je de bundel zelf ergens \
         neerzetten en met OPENAEC_FEM_KERNEL aanwijzen; de hash moet dan wel kloppen.",
    )
    .met_detail(json!({ "pad": pad.display().to_string() }))
}

// ── Aanroep ─────────────────────────────────────────────────────────────────

/// Wat één geslaagde aanroep oplevert.
#[derive(Debug, Clone)]
pub struct SidecarUitvoer {
    /// Het `result` van de bewerking.
    pub result: Value,
    /// Het handshake-antwoord: protocol, node_version, bundle_version, bundle_hash.
    pub handshake: Value,
    pub node: NodeVondst,
    pub bundel: Bundel,
    pub duur_ms: u128,
}

/// Voert één bewerking uit in een vers Node-proces.
///
/// Het verloop, en waarom precies zo:
///   1. handshake en verzoek worden GEPIPELINED geschreven (twee regels ineens)
///      en stdin gaat meteen dicht — één rondgang in plaats van twee, en het
///      proces weet direct dat er niets meer komt;
///   2. beide antwoordregels worden gelezen binnen één klok;
///   3. de handshake wordt geverifieerd (protocolversie én bundelhash) vóór het
///      resultaat wordt gebruikt;
///   4. een niet-nul exitcode of te weinig antwoordregels telt als crash, niet
///      als rekenfout.
pub async fn roep_aan(
    op: &str,
    payload: Value,
    opties: &SidecarOpties,
    timeout_s: Option<u64>,
) -> Result<SidecarUitvoer, SidecarFout> {
    let node = zoek_node(opties).await?;
    let bundel = zet_bundel_klaar(opties)?;
    let klok = opties.klok(timeout_s);
    let start = Instant::now();

    let regels = format!(
        "{}\n{}\n",
        json!({ "v": SIDECAR_PROTOCOL, "id": 1, "op": "handshake", "payload": {} }),
        json!({ "v": SIDECAR_PROTOCOL, "id": 2, "op": op, "payload": payload }),
    );

    let mut kind = Command::new(&node.pad)
        .arg(&bundel.pad)
        .arg("--sidecar")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Sterft dit proces onverwacht, dan mag er geen Node blijven hangen.
        .kill_on_drop(true)
        .spawn()
        .map_err(|fout| {
            SidecarFout::nieuw(
                NODE_ONTBREEKT,
                format!(
                    "De Node-runtime `{}` kon niet worden gestart ({fout}).",
                    node.pad.display()
                ),
                "Controleer het pad in OPENAEC_NODE of de Node-installatie.",
            )
        })?;

    let mut stdin = kind.stdin.take().expect("stdin is piped");
    let stdout = kind.stdout.take().expect("stdout is piped");
    let stderr = kind.stderr.take().expect("stderr is piped");

    // stderr meteen leegtrekken: raakt die pipe vol, dan blokkeert het
    // Node-proces midden in het schrijven van een logregel en levert het nooit
    // een antwoord — een klemloop die als timeout zou worden gemeld.
    let stderr_taak = tokio::spawn(async move {
        let mut tekst = String::new();
        let mut lezer = BufReader::new(stderr);
        let _ = lezer.read_to_string(&mut tekst).await;
        tekst
    });

    let mut lezer = BufReader::new(stdout);
    let gesprek = async {
        stdin.write_all(regels.as_bytes()).await?;
        stdin.flush().await?;
        drop(stdin); // EOF: het proces mag afronden.
        let handshake = lees_regel(&mut lezer).await?;
        let antwoord = lees_regel(&mut lezer).await?;
        Ok::<_, std::io::Error>((handshake, antwoord))
    };

    let uitkomst = timeout(klok, gesprek).await;

    // Het proces netjes opruimen vóór we iets teruggeven. `kill` wacht ook op de
    // exit, zodat er geen zombie achterblijft en de klok echt de bovengrens is.
    let regels_uit = match uitkomst {
        Err(_) => {
            let _ = kind.kill().await;
            let log = stderr_taak.await.unwrap_or_default();
            return Err(SidecarFout::nieuw(
                TIJD_OVERSCHREDEN,
                format!(
                    "De berekening duurde langer dan {} s en is afgebroken; het \
                     Node-proces is gestopt. Er is GEEN gedeeltelijk resultaat: een half \
                     opgelost stelsel zou getallen opleveren die nergens bij horen.",
                    klok.as_secs()
                ),
                "Verhoog `timeout_s` bij de tool-aanroep of zet OPENAEC_MCP_SOLVE_TIMEOUT \
                 hoger. Loopt het model structureel vast, kijk dan naar het aantal \
                 plaatelementen: de oplossing schaalt kubisch met het aantal vrijheidsgraden.",
            )
            .met_detail(json!({
                "timeout_s": klok.as_secs(),
                "op": op,
                "stderr": staart(&log),
            })));
        }
        Ok(Err(fout)) => {
            let _ = kind.kill().await;
            let log = stderr_taak.await.unwrap_or_default();
            return Err(crash(
                format!("Het gesprek met de sidecar brak af ({fout})."),
                op,
                None,
                &log,
            ));
        }
        Ok(Ok(paar)) => paar,
    };

    let status = match timeout(Duration::from_secs(10), kind.wait()).await {
        Ok(Ok(s)) => Some(s),
        Ok(Err(_)) => None,
        Err(_) => {
            // Antwoorden binnen, maar het proces blijft hangen. Doden, niet wachten.
            let _ = kind.kill().await;
            None
        }
    };
    let log = stderr_taak.await.unwrap_or_default();

    // Niet-nul exit is per definitie een crash: de sidecar belooft exitcode 0,
    // ook wanneer élk verzoek een fout opleverde.
    if let Some(s) = status {
        if !s.success() {
            return Err(crash(
                format!("De sidecar eindigde met {s} in plaats van exitcode 0."),
                op,
                s.code(),
                &log,
            ));
        }
    }

    let handshake = ontleed_antwoord(&regels_uit.0, 1, op, &log)?;
    controleer_handshake(&handshake, &bundel, opties, op, &log)?;
    let resultaat = ontleed_antwoord(&regels_uit.1, 2, op, &log)?;

    Ok(SidecarUitvoer {
        result: resultaat,
        handshake,
        node,
        bundel,
        duur_ms: start.elapsed().as_millis(),
    })
}

/// Eén niet-lege regel. EOF is een crash, geen leeg antwoord.
async fn lees_regel<R>(lezer: &mut R) -> std::io::Result<String>
where
    R: AsyncBufReadExt + Unpin,
{
    loop {
        let mut regel = String::new();
        let n = lezer.read_line(&mut regel).await?;
        if n == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "stdout van de sidecar eindigde vóór het antwoord",
            ));
        }
        if regel.trim().is_empty() {
            continue;
        }
        return Ok(regel);
    }
}

/// Eén NDJSON-regel → het `result`, of een fout met de code van de sidecar.
fn ontleed_antwoord(regel: &str, id: i64, op: &str, log: &str) -> Result<Value, SidecarFout> {
    let waarde: Value = serde_json::from_str(regel.trim()).map_err(|fout| {
        let mut f = crash(
            format!("De sidecar gaf een regel terug die geen JSON is ({fout})."),
            op,
            None,
            log,
        );
        // De onleesbare regel ERBIJ zetten, niet in plaats van `op` en `stderr`:
        // zonder die twee is niet te zien welke bewerking het betrof.
        if let Some(Value::Object(map)) = f.detail.as_mut() {
            map.insert("regel".to_owned(), json!(staart(regel)));
        }
        f
    })?;

    if waarde.get("id").and_then(Value::as_i64) != Some(id) {
        return Err(crash(
            format!(
                "De sidecar antwoordde met id {:?} waar {id} werd verwacht; de \
                 antwoorden staan niet in de volgorde van de verzoeken.",
                waarde.get("id")
            ),
            op,
            None,
            log,
        ));
    }

    if waarde.get("ok").and_then(Value::as_bool) == Some(true) {
        return Ok(waarde.get("result").cloned().unwrap_or(Value::Null));
    }

    let fout = waarde.get("error").cloned().unwrap_or(Value::Null);
    let code = fout
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("INTERN")
        .to_owned();
    let melding = fout
        .get("melding")
        .and_then(Value::as_str)
        .unwrap_or("De sidecar meldde een fout zonder tekst.")
        .to_owned();
    Err(SidecarFout {
        remedie: Some(remedie_bij(&code)),
        detail: fout.get("detail").cloned(),
        code,
        melding,
    })
}

/// Nederlandse remedie per foutcode van de sidecar.
///
/// De sidecar levert de melding (wát er mis is); hier staat wat de gebruiker
/// eraan kan doen. Die scheiding houdt de remedie op één plek, ook als dezelfde
/// code uit meerdere bewerkingen komt.
fn remedie_bij(code: &str) -> String {
    match code {
        "INVOER_ONGELDIG" => "Kijk in `detail` welk veld wordt genoemd. Onbekende velden worden \
             geweigerd en niet genegeerd: een genegeerd veld levert een geslaagde \
             berekening op die bij een ánder model hoort."
            .to_owned(),
        "BESTAND_ONLEESBAAR" => "Controleer of het pad naar een .ifcfem2d-bestand wijst dat met \
             deze versie is opgeslagen."
            .to_owned(),
        "MODEL_ONOPLOSBAAR" => "Het model is niet doorgerekend. Controleer de opleggingen en de \
             samenhang van het raamwerk; `validate_fem_model` benoemt losse knopen, \
             mechanismen en staven met lengte nul."
            .to_owned(),
        "PROTOCOL_MISMATCH" => "Server en solverbundel horen niet bij elkaar. Herbouw de \
             MCP-server, of haal OPENAEC_FEM_KERNEL weg."
            .to_owned(),
        _ => "Meld deze fout met de inhoud van `detail`; de originele melding van de \
             rekenkern staat daarin onvertaald."
            .to_owned(),
    }
}

/// Bewaakt dat het proces dat antwoordde óók de kern draaide die we bedoelden.
///
/// Twee controles. De protocolversie vangt een binary en een bundel die uit
/// elkaar zijn gelopen. De zelf-hash vangt iets wat de controle in
/// `zet_bundel_klaar` niet kán vangen: een bestand dat ná onze hashcontrole en
/// vóór het laden door Node is omgewisseld.
///
/// Node onder 22.3 kent `process.getBuiltinModule` niet; de sidecar meldt dan
/// `bundle_hash: null`. Dat is geen fout — de bindende poort blijft dan de
/// controle op schijf — maar het wordt wel gelogd, zodat niemand denkt dat de
/// zelf-hash is nagekeken terwijl dat niet kon.
fn controleer_handshake(
    handshake: &Value,
    bundel: &Bundel,
    opties: &SidecarOpties,
    op: &str,
    log: &str,
) -> Result<(), SidecarFout> {
    let protocol = handshake.get("protocol").and_then(Value::as_u64);
    if protocol != Some(SIDECAR_PROTOCOL as u64) {
        return Err(SidecarFout::nieuw(
            PROTOCOL_MISMATCH,
            format!(
                "De solverbundel spreekt protocolversie {:?}; deze server spreekt \
                 {SIDECAR_PROTOCOL}. Er is niet gerekend.",
                protocol
            ),
            "Server en bundel horen bij elkaar en worden samen gebouwd. Herbouw de \
             MCP-server, of haal OPENAEC_FEM_KERNEL weg.",
        )
        .met_detail(json!({
            "verwacht": SIDECAR_PROTOCOL,
            "ontvangen": handshake.get("protocol"),
            "op": op,
            "stderr": staart(log),
        })));
    }

    match handshake.get("bundle_hash").and_then(Value::as_str) {
        Some(gemeld) if gemeld == bundel.hash => Ok(()),
        Some(gemeld) if opties.drift_toegestaan => {
            tracing::warn!(
                gemeld = %gemeld,
                verwacht = %bundel.hash,
                "de sidecar meldt een andere zelf-hash; toegestaan via OPENAEC_FEM_STA_DRIFT_TOE=1"
            );
            Ok(())
        }
        Some(gemeld) => Err(SidecarFout::nieuw(
            BUNDEL_AFWIJKEND,
            format!(
                "Het Node-proces laadde een andere solverbundel dan deze server \
                 klaarzette. Er is niet gerekend.\n\
                 \x20 geladen    : {gemeld}\n\
                 \x20 klaargezet : {}",
                bundel.hash
            ),
            "Het bundelbestand is tussen de controle en het laden gewijzigd. Controleer \
             wie er op de cachemap of op OPENAEC_FEM_KERNEL schrijft en probeer opnieuw.",
        )
        .met_detail(json!({
            "geladen_hash": gemeld,
            "klaargezette_hash": bundel.hash,
            "pad": bundel.pad.display().to_string(),
        }))),
        // `null` of afwezig: Node kan zichzelf niet hashen (vóór 22.3).
        _ => {
            tracing::debug!(
                "de sidecar meldde geen zelf-hash; de controle op schijf blijft de bindende poort"
            );
            Ok(())
        }
    }
}

fn crash(melding: String, op: &str, exitcode: Option<i32>, log: &str) -> SidecarFout {
    SidecarFout::nieuw(
        SIDECAR_GECRASHT,
        format!(
            "{melding} Een niet-nul exitcode of een uitgebleven antwoord telt als crash \
             en NOOIT als rekenuitkomst."
        ),
        "Zet OPENAEC_MCP_LOG=debug en bekijk stderr voor de oorzaak. Blijft het zich \
         voordoen, meld dan het model en de tekst uit `detail.stderr`.",
    )
    .met_detail(json!({
        "op": op,
        "exitcode": exitcode,
        "stderr": staart(log),
    }))
}

/// Laatste ~2 kB van een logtekst. Het hele stderr-log mee terugsturen zou een
/// foutantwoord onleesbaar maken; de oorzaak staat vrijwel altijd onderaan.
fn staart(tekst: &str) -> String {
    const MAX: usize = 2000;
    let opgeschoond = tekst.trim_end();
    if opgeschoond.len() <= MAX {
        return opgeschoond.to_owned();
    }
    let vanaf = opgeschoond
        .char_indices()
        .rev()
        .nth(MAX)
        .map(|(i, _)| i)
        .unwrap_or(0);
    format!("…{}", &opgeschoond[vanaf..])
}

// ── Status ──────────────────────────────────────────────────────────────────

/// Uitvoer van `fem_solver_status`: diagnose zonder rekenpoging.
///
/// Dit is de eerste stap in de README bij een storing. Daarom draait hij over
/// dezelfde weg als een echte aanroep — Node zoeken, bundel klaarzetten,
/// handshake — en niet over een kortere die iets anders zou kunnen zeggen.
#[derive(Debug, Clone, Serialize)]
pub struct SidecarStatus {
    pub available: bool,
    pub node_path: Option<String>,
    pub node_version: Option<String>,
    pub bundle_version: Option<String>,
    /// Hash van de bundel die deze binary bij zich draagt.
    pub bundle_hash: String,
    /// Hash van de bundel die Node werkelijk laadde; `null` als het niet zover kwam.
    pub loaded_bundle_hash: Option<String>,
    pub bundle_path: Option<String>,
    pub bundle_source: Option<Bundelbron>,
    pub protocol_version: u32,
    pub binary_version: &'static str,
    /// Nederlandse reden dat het niet werkt; `null` als het wél werkt.
    pub reason: Option<String>,
    /// Nederlandse remedie; `null` als het wél werkt.
    pub remedie: Option<String>,
    /// Machineleesbare foutcode; `null` als het wél werkt.
    pub error_code: Option<String>,
}

/// Diagnose. Faalt nooit: een storing IS het antwoord.
pub async fn status(opties: &SidecarOpties) -> SidecarStatus {
    let basis = SidecarStatus {
        available: false,
        node_path: None,
        node_version: None,
        bundle_version: None,
        bundle_hash: ingebakken_hash().to_owned(),
        loaded_bundle_hash: None,
        bundle_path: None,
        bundle_source: None,
        protocol_version: SIDECAR_PROTOCOL,
        binary_version: BINARY_VERSIE,
        reason: None,
        remedie: None,
        error_code: None,
    };

    // 20 s is ruim voor een handshake en houdt de diagnose kort, ook als er iets
    // anders mis is dan wat we hier kunnen benoemen.
    match roep_aan("handshake", json!({}), opties, Some(20)).await {
        Ok(uit) => SidecarStatus {
            available: true,
            node_path: Some(uit.node.pad.display().to_string()),
            node_version: Some(uit.node.versie.clone()),
            bundle_version: uit
                .result
                .get("bundle_version")
                .and_then(Value::as_str)
                .map(str::to_owned),
            loaded_bundle_hash: uit
                .result
                .get("bundle_hash")
                .and_then(Value::as_str)
                .map(str::to_owned),
            bundle_path: Some(uit.bundel.pad.display().to_string()),
            bundle_source: Some(uit.bundel.bron),
            ..basis
        },
        Err(fout) => SidecarStatus {
            reason: Some(fout.melding),
            remedie: fout.remedie,
            error_code: Some(fout.code),
            ..basis
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ingebakken_hash_heeft_de_juiste_vorm() {
        let h = ingebakken_hash();
        assert!(h.starts_with("sha256:"), "{h}");
        assert_eq!(h.len(), "sha256:".len() + 64, "{h}");
    }

    /// De ingebakken bundel moet dezelfde zijn als het hashbestand belooft.
    /// `build.rs` bewaakt dat al tijdens de build; deze test bewijst dat de
    /// waarde die de RUNTIME gebruikt dezelfde is — anders zou de handshake
    /// tegen een andere maatstaf vergelijken dan de bouwpoort.
    #[test]
    fn ingebakken_hash_komt_overeen_met_het_hashbestand() {
        let uit_build = env!("OPENAEC_FEM_KERNEL_SHA256");
        assert_eq!(ingebakken_hash(), format!("sha256:{uit_build}"));
    }

    #[test]
    fn major_uit_versie_leest_de_gebruikelijke_vormen() {
        assert_eq!(major_uit_versie("v24.11.1"), Some(24));
        assert_eq!(major_uit_versie("v20.0.0\n"), Some(20));
        assert_eq!(major_uit_versie("22.9.0"), Some(22));
        assert_eq!(major_uit_versie("geen versie"), None);
    }

    #[test]
    fn opties_kiezen_de_juiste_klok() {
        let leeg = SidecarOpties::default();
        assert_eq!(leeg.klok(None).as_secs(), STANDAARD_TIMEOUT_S);
        assert_eq!(leeg.klok(Some(5)).as_secs(), 5);

        let uit_omgeving = SidecarOpties { timeout_s: Some(120), ..Default::default() };
        assert_eq!(uit_omgeving.klok(None).as_secs(), 120);
        // Een expliciete waarde bij de tool-aanroep gaat vóór de omgeving.
        assert_eq!(uit_omgeving.klok(Some(7)).as_secs(), 7);
        // Buiten bereik wordt begrensd, niet afgewezen.
        assert_eq!(leeg.klok(Some(0)).as_secs(), 1);
        assert_eq!(leeg.klok(Some(99_999)).as_secs(), MAXIMALE_TIMEOUT_S);
    }

    #[test]
    fn expliciete_node_sluit_de_zoektocht_af() {
        let opties = SidecarOpties {
            node: Some(PathBuf::from("/verzin/een/node")),
            ..Default::default()
        };
        assert_eq!(node_kandidaten(&opties).len(), 1);
    }
}
