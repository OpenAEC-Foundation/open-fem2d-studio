//! De volledige kruistabel van de drie wegen — de bewaking op de projectregel
//! zelf.
//!
//! DE REGEL
//! Elke rekenkern in dit project hoort langs drie wegen bereikbaar te zijn:
//!
//! 1. een Tauri-command in `src-tauri/src/lib.rs` dat óók in
//!    `generate_handler!` staat (de desktop-app);
//! 2. een opdracht in `crates/toetsbrug` (de dev-server, `/api/toetsing`);
//! 3. een gereedschap in deze MCP-server.
//!
//! WAT ER TOT NU TOE ONTBRAK
//! Er was geen enkele bewaking op die tabel als geheel. Drie testbestanden
//! (`drie_wegen_beton.rs`, `drie_wegen_beff.rs`, `drie_wegen_dekking.rs`) kijken
//! wel naar `generate_handler!`, maar elk noemt met de hand een handvol
//! betonnamen. Een nieuwe rekenkern die maar twee wegen kreeg — precies wat er
//! met hout en kruislaaghout gebeurde — liep daar zonder één rood testresultaat
//! langs. Dit bestand houdt de drie NAMENLIJSTEN werkelijk tegen elkaar, en
//! valt in beide richtingen om: een command zonder toetsbrug-opdracht net zo
//! goed als een toetsbrug-opdracht zonder command.
//!
//! HOE DE DRIE LIJSTEN WORDEN GELEZEN
//! * **Weg 1** uit de BRON van `src-tauri/src/lib.rs`: de namen tussen
//!   `generate_handler![` en de sluithaak. Dat is de enige lijst die telt —
//!   een `#[tauri::command]` dat er niet in staat, bestaat voor de app niet.
//! * **Weg 2** uit de BRON van `crates/toetsbrug/src/lib.rs`: de patronen van
//!   de match-armen in `behandel`. Dat is letterlijk de lijst die de dev-server
//!   accepteert.
//! * **Weg 3** uit de DRAAIENDE server: de test start de werkelijke binary en
//!   vraagt `tools/list`. Er wordt niets nagebouwd.
//!
//! DE KOPPELTABEL IS MET OPZET HANDWERK
//! De namen lopen uiteen: het Tauri-command heet `check_steel_beams`
//! (meervoud, een lijst staven) terwijl het MCP-gereedschap `check_steel_beam`
//! heet (enkelvoud, één staaf); bij beton net zo. Een regex die dat verschil
//! wegpoetst — de eind-s eraf, of "beam" ~ "beams" — zou óók
//! `check_stress_beams` aan een niet-bestaand `check_stress_beam` koppelen en
//! daarmee een echt gat verbergen. Daarom staat elke koppeling hieronder
//! voluit, met alle drie de namen naast elkaar.
//!
//! WAT GEEN DRIE WEGEN HEEFT, STAAT IN [`UITZONDERINGEN`] MET REDEN
//! Stilzwijgend overslaan mag niet: dan is een openstaand gat niet te
//! onderscheiden van iets dat bewust maar één weg heeft. Elke onvolledige rij
//! draagt daarom een reden, en die reden zegt of het om programmawerk gaat dat
//! langs een andere weg geen betekenis heeft (een bestandspad bestaat in een
//! browser niet) of om een gat dat gewoon nog open staat.

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::time::timeout;

const BIN_PATH: &str = env!("CARGO_BIN_EXE_openaec-mcp-server");

// ── De koppeltabel ──────────────────────────────────────────────────────────

/// Eén rekenkern, met zijn naam langs elk van de drie wegen.
struct Rij {
    /// Het Tauri-command zoals het in `generate_handler!` staat.
    tauri: Option<&'static str>,
    /// De opdracht van `toetsbrug::behandel`.
    toetsbrug: Option<&'static str>,
    /// Het gereedschap in `tools/list` van deze server.
    mcp: Option<&'static str>,
    /// Waarom een weg ontbreekt. Leeg bij een volledige rij; verplicht — en
    /// een hele zin — bij een rij in [`UITZONDERINGEN`].
    reden: &'static str,
}

/// De rekenkernen die alle drie de wegen hebben.
///
/// De drie kolommen zijn drie los van elkaar gelezen namenlijsten; dat ze
/// hier op één regel staan is de enige plek waar de koppeling wordt
/// vastgelegd.
const KRUISTABEL: &[Rij] = &[
    Rij { tauri: Some("list_steel_profiles"), toetsbrug: Some("list_steel_profiles"), mcp: Some("list_steel_profiles"), reden: "" },
    Rij { tauri: Some("list_steel_grades"), toetsbrug: Some("list_steel_grades"), mcp: Some("list_steel_grades"), reden: "" },
    // VOETANGEL: meervoud tegen enkelvoud. Het command en de opdracht nemen
    // een lijst staven, het gereedschap één staaf. Het invoer- en het
    // uitvoertype zijn wél hetzelfde.
    Rij { tauri: Some("check_steel_beams"), toetsbrug: Some("check_steel_beams"), mcp: Some("check_steel_beam"), reden: "" },
    Rij { tauri: Some("list_timber_grades"), toetsbrug: Some("list_timber_grades"), mcp: Some("list_timber_grades"), reden: "" },
    Rij { tauri: Some("check_timber_beams"), toetsbrug: Some("check_timber_beams"), mcp: Some("check_timber_beams"), reden: "" },
    Rij { tauri: Some("list_clt_presets"), toetsbrug: Some("list_clt_presets"), mcp: Some("list_clt_presets"), reden: "" },
    Rij { tauri: Some("check_clt_beams"), toetsbrug: Some("check_clt_beams"), mcp: Some("check_clt_beams"), reden: "" },
    Rij { tauri: Some("list_concrete_classes"), toetsbrug: Some("list_concrete_classes"), mcp: Some("list_concrete_classes"), reden: "" },
    Rij { tauri: Some("list_reinforcement_grades"), toetsbrug: Some("list_reinforcement_grades"), mcp: Some("list_reinforcement_grades"), reden: "" },
    // Dezelfde voetangel als bij staal.
    Rij { tauri: Some("check_concrete_beams"), toetsbrug: Some("check_concrete_beams"), mcp: Some("check_concrete_beam"), reden: "" },
    Rij { tauri: Some("concrete_mn_kappa"), toetsbrug: Some("concrete_mn_kappa"), mcp: Some("concrete_mn_kappa"), reden: "" },
    Rij { tauri: Some("concrete_segment_stiffness"), toetsbrug: Some("concrete_segment_stiffness"), mcp: Some("concrete_segment_stiffness"), reden: "" },
    // De kolomtoets van §5.8: l₀, λ = l₀/i, de slankheidsgrens λ_lim waaronder
    // de tweede-orde-effecten mogen vervallen, φ_ef en de §9.5-detaillering.
    // Eén naam langs alle drie de wegen — hij neemt ÉÉN staaf, dus hier is geen
    // meervoud/enkelvoud-voetangel zoals bij `check_concrete_beams`. Dezelfde
    // rekengang (`concrete_check::kolomtoetsen`) draait óók binnen
    // `check_concrete_beams`; deze losse weg bestaat naast die toetsing om
    // dezelfde reden als `concrete_cover_check`: het invoerscherm moet λ en
    // λ_lim kunnen tonen terwijl de gebruiker typt.
    Rij { tauri: Some("concrete_column_check"), toetsbrug: Some("concrete_column_check"), mcp: Some("concrete_column_check"), reden: "" },
    // De dekkingslijn: §9.2.1.3 met figuur 9.2 voor de momenten en §6.2 voor de
    // dwarskracht, als gegevens. Eén naam langs alle drie de wegen — hij neemt
    // ÉÉN staaf, dus hier is geen meervoud/enkelvoud-voetangel zoals bij
    // `check_concrete_beams`.
    Rij { tauri: Some("concrete_dekkingslijn"), toetsbrug: Some("concrete_dekkingslijn"), mcp: Some("concrete_dekkingslijn"), reden: "" },
    Rij { tauri: Some("concrete_effective_flange_width"), toetsbrug: Some("concrete_effective_flange_width"), mcp: Some("concrete_effective_flange_width"), reden: "" },
    Rij { tauri: Some("list_exposure_classes"), toetsbrug: Some("list_exposure_classes"), mcp: Some("list_exposure_classes"), reden: "" },
    Rij { tauri: Some("concrete_cover_check"), toetsbrug: Some("concrete_cover_check"), mcp: Some("concrete_cover_check"), reden: "" },
];

/// Wat geen drie wegen heeft — met de reden erbij.
///
/// Twee soorten redenen, en het verschil is belangrijk:
/// - programmawerk dat langs een andere weg geen betekenis heeft (een pad naar
///   een bestand op schijf bestaat in een browser niet), en
/// - een gat dat gewoon nog open staat. Dat mag hier staan, maar niet
///   stilzwijgend.
const UITZONDERINGEN: &[Rij] = &[
    Rij {
        tauri: Some("check_stress_beams"),
        toetsbrug: Some("check_stress_beams"),
        mcp: None,
        reden: "Openstaand gat. De vrije spanningstoets (von Mises, geen norm) heeft geen MCP-gereedschap; er is geen belemmering, hij is alleen nog niet gemaakt.",
    },
    Rij {
        tauri: Some("check_fillet_welds"),
        toetsbrug: Some("check_fillet_welds"),
        mcp: None,
        reden: "Openstaand gat. De lastoets NEN-EN 1993-1-8 4.5.3.3 heeft geen MCP-gereedschap; er is geen belemmering, hij is alleen nog niet gemaakt.",
    },
    Rij {
        tauri: Some("bereken_doorsneden"),
        toetsbrug: None,
        mcp: None,
        reden: "De tweede weg loopt hier niet via de toetsbrug maar via de losse binary `doorsnedemotor`, die de dev-server op `/api/doorsnede` aanroept; beide voeren `section_properties::opdracht::reken` uit. De derde weg ontbreekt: er is geen MCP-gereedschap dat een vrij opgegeven geometrie doorrekent.",
    },
    Rij {
        tauri: Some("generate_steel_report_pdf"),
        toetsbrug: None,
        mcp: Some("generate_steel_report_pdf"),
        reden: "De toetsbrug spreekt JSON in en JSON uit, en een rapport is een reeks bytes. Het MCP-gereedschap lost dat op met base64; voor de dev-server is dat nog niet gedaan, dus in de browser is er geen rapport-PDF.",
    },
    Rij {
        tauri: None,
        toetsbrug: None,
        mcp: Some("compute_section_properties"),
        reden: "Alleen MCP. Rekent de doorsnedegrootheden opnieuw uit de CATALOGUSgeometrie van een profielnaam; de app heeft daar geen command voor omdat zij de catalogus zelf al draagt. Het verwante `bereken_doorsneden` is niet hetzelfde: dat neemt een vrij opgegeven geometrie.",
    },
    Rij {
        tauri: None,
        toetsbrug: None,
        mcp: Some("fem_solver_status"),
        reden: "Zuiver programmawerk van deze server: het meldt of er een Node-runtime is en of de ingebakken solverbundel bij de protocolversie past. De app en de dev-server draaien diezelfde solver in hun eigen runtime en hebben geen sidecar om te diagnosticeren.",
    },
    Rij {
        tauri: None,
        toetsbrug: None,
        mcp: Some("load_fem_project"),
        reden: "Zuiver programmawerk: het leest een .ifcfem2d van een pad op schijf. De app opent bestanden via haar eigen dialoog en een browser kent geen bestandspaden, dus langs die twee wegen heeft dit geen betekenis.",
    },
    Rij {
        tauri: None,
        toetsbrug: None,
        mcp: Some("validate_fem_model"),
        reden: "Geen rekenkern in Rust: de controle draait in de solverbundel, die in de app en op de dev-server al in de eigen runtime meedraait. Dit gereedschap is de weg naar diezelfde bundel voor een client buiten de app.",
    },
    Rij {
        tauri: None,
        toetsbrug: None,
        mcp: Some("solve_fem_model"),
        reden: "Geen rekenkern in Rust: de solve draait in de solverbundel, dezelfde die de app in haar eigen runtime uitvoert. Er is dus niets om als Tauri-command of toetsbrug-opdracht aan te bieden.",
    },
    Rij {
        tauri: None,
        toetsbrug: None,
        mcp: Some("check_fem_model"),
        reden: "Zelfde reden als `solve_fem_model`: de solve zit in de bundel. De toetsing die erop volgt gaat wél door de gedeelde kern `steel_check::check_all_beams`, en die is als `check_steel_beams` langs alle drie de wegen bereikbaar.",
    },
];

fn alle_rijen() -> Vec<&'static Rij> {
    KRUISTABEL.iter().chain(UITZONDERINGEN.iter()).collect()
}

// ── De drie lijsten lezen ───────────────────────────────────────────────────

fn bron(pad: &[&str]) -> String {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for deel in pad {
        p.push(deel);
    }
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{} niet leesbaar: {e}", p.display()))
}

/// Weg 1: de namen tussen `generate_handler![` en de sluithaak.
fn tauri_commands() -> Vec<String> {
    let bron = bron(&["..", "..", "src", "lib.rs"]);
    let start = bron
        .find("generate_handler![")
        .expect("`generate_handler!` staat niet in src-tauri/src/lib.rs");
    let na = &bron[start + "generate_handler![".len()..];
    let eind = na.find(']').expect("`generate_handler!` is niet gesloten");
    na[..eind]
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Weg 2: de patronen van de match-armen in `toetsbrug::behandel`.
///
/// Een arm is een regel die met een aanhalingsteken begint en verderop een
/// `=>` heeft; alles wat vóór die pijl tussen aanhalingstekens staat is een
/// opdrachtnaam, zodat ook een arm met meerdere patronen (`"a" | "b" =>`)
/// volledig wordt gelezen. De armen zijn de enige regels in dat bestand die zo
/// beginnen — een tekst binnen een uitdrukking staat altijd achter code.
fn toetsbrug_opdrachten() -> Vec<String> {
    let bron = bron(&["..", "toetsbrug", "src", "lib.rs"]);
    let mut namen = Vec::new();
    for regel in bron.lines() {
        let t = regel.trim();
        if !t.starts_with('"') {
            continue;
        }
        let Some(pijl) = t.find("=>") else { continue };
        let mut rest = &t[..pijl];
        while let Some(begin) = rest.find('"') {
            let na = &rest[begin + 1..];
            let Some(eind) = na.find('"') else { break };
            namen.push(na[..eind].to_owned());
            rest = &na[eind + 1..];
        }
    }
    assert!(
        !namen.is_empty(),
        "geen enkele opdracht gevonden in crates/toetsbrug/src/lib.rs — is `behandel` van vorm veranderd?"
    );
    namen
}

/// Weg 3: `tools/list` van de werkelijk draaiende server.
async fn mcp_gereedschappen() -> Vec<String> {
    let (mut child, mut stdin, mut reader) = start_server().await;
    schrijf(
        &mut stdin,
        json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "tools/list gaf een fout: {resp:?}");
    let namen: Vec<String> = resp["result"]["tools"]
        .as_array()
        .expect("tools/list levert een array")
        .iter()
        .map(|t| {
            t["name"]
                .as_str()
                .expect("elk gereedschap heeft een naam")
                .to_owned()
        })
        .collect();
    let _ = child.kill().await;
    namen
}

// ── De MCP-server over stdio ────────────────────────────────────────────────

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
                "clientInfo": { "name": "drie-wegen-kruistabel", "version": "0.0.0" }
            }
        }),
    )
    .await;
    let resp = lees_bericht(&mut reader).await;
    assert!(resp["error"].is_null(), "initialize gaf een fout: {resp:?}");

    (child, stdin, reader)
}

// ── Vergelijking ────────────────────────────────────────────────────────────

/// Houdt één kolom van de koppeltabel tegen één werkelijke namenlijst.
///
/// Valt in BEIDE richtingen om:
/// - een naam in de lijst die in geen enkele rij voorkomt (iemand heeft een
///   weg toegevoegd zonder de andere twee te regelen);
/// - een naam in de tabel die niet meer in de lijst staat (iemand heeft een weg
///   hernoemd of weggehaald).
fn vergelijk_kolom(
    kolom: &str,
    uit_de_tabel: impl Fn(&Rij) -> Option<&'static str>,
    werkelijk: &[String],
    waar: &str,
) {
    let mut tabel: BTreeMap<&str, usize> = BTreeMap::new();
    for rij in alle_rijen() {
        if let Some(naam) = uit_de_tabel(rij) {
            *tabel.entry(naam).or_insert(0) += 1;
        }
    }
    for (naam, aantal) in &tabel {
        assert_eq!(
            *aantal, 1,
            "`{naam}` staat {aantal} keer in de kolom {kolom} van de koppeltabel; \
             elke naam hoort bij precies één rekenkern"
        );
    }

    let ontbreekt_in_de_tabel: Vec<&String> = werkelijk
        .iter()
        .filter(|n| !tabel.contains_key(n.as_str()))
        .collect();
    assert!(
        ontbreekt_in_de_tabel.is_empty(),
        "{waar} kent {ontbreekt_in_de_tabel:?}, maar die staan niet in de koppeltabel van \
         tests/drie_wegen_kruistabel.rs. Zet ze in KRUISTABEL met hun naam langs alle drie de \
         wegen, of — als een weg bewust ontbreekt — in UITZONDERINGEN mét de reden."
    );

    let bestaat_niet_meer: Vec<&str> = tabel
        .keys()
        .filter(|n| !werkelijk.iter().any(|w| w == *n))
        .copied()
        .collect();
    assert!(
        bestaat_niet_meer.is_empty(),
        "de koppeltabel noemt {bestaat_niet_meer:?} in de kolom {kolom}, maar {waar} kent die \
         naam niet (meer). Hernoemd of weggehaald? Werk de tabel bij."
    );
}

// ── De tests ────────────────────────────────────────────────────────────────

/// De kern van dit bestand: de drie werkelijke namenlijsten tegen de
/// koppeltabel, kolom voor kolom en in beide richtingen.
#[tokio::test]
async fn de_drie_namenlijsten_dekken_elkaar() {
    let commands = tauri_commands();
    let opdrachten = toetsbrug_opdrachten();
    let gereedschappen = mcp_gereedschappen().await;

    vergelijk_kolom(
        "tauri",
        |r| r.tauri,
        &commands,
        "`generate_handler!` in src-tauri/src/lib.rs",
    );
    vergelijk_kolom(
        "toetsbrug",
        |r| r.toetsbrug,
        &opdrachten,
        "`behandel` in crates/toetsbrug/src/lib.rs",
    );
    vergelijk_kolom(
        "mcp",
        |r| r.mcp,
        &gereedschappen,
        "`tools/list` van de MCP-server",
    );
}

/// Een command dat wel als functie bestaat maar niet in `generate_handler!`
/// staat, bestaat voor de app niet — en geen enkele Rust-test merkt dat.
/// Andersom: een naam in `generate_handler!` zonder functie is een
/// compilatiefout, dus die kant hoeft hier niet.
#[test]
fn elk_geregistreerd_command_bestaat_ook_als_functie() {
    let bron = bron(&["..", "..", "src", "lib.rs"]);
    for command in tauri_commands() {
        assert!(
            bron.contains(&format!("fn {command}(")),
            "`{command}` staat in generate_handler! maar er is geen functie `{command}` in \
             src-tauri/src/lib.rs"
        );
    }
}

/// De indeling van de tabel klopt met zichzelf: in [`KRUISTABEL`] staan alleen
/// volledige rijen (en die dragen geen reden, want er valt niets uit te
/// leggen), in [`UITZONDERINGEN`] alleen onvolledige (en die dragen er wél
/// een).
///
/// Waarom dit een aparte test is: zonder deze controle zou een onvolledige rij
/// ongemerkt in KRUISTABEL kunnen belanden, en dan zou een ontbrekende weg er
/// als een volledige uitzien.
#[test]
fn de_tabel_scheidt_volledige_rijen_van_uitzonderingen() {
    for rij in KRUISTABEL {
        let naam = rij.tauri.or(rij.toetsbrug).or(rij.mcp).expect("lege rij");
        assert!(
            rij.tauri.is_some() && rij.toetsbrug.is_some() && rij.mcp.is_some(),
            "`{naam}` staat in KRUISTABEL maar mist een weg; hij hoort in UITZONDERINGEN"
        );
        assert!(
            rij.reden.is_empty(),
            "`{naam}` heeft alle drie de wegen, dus de reden hoort leeg te zijn"
        );
    }
    for rij in UITZONDERINGEN {
        let naam = rij.tauri.or(rij.toetsbrug).or(rij.mcp).expect("lege rij");
        assert!(
            rij.tauri.is_none() || rij.toetsbrug.is_none() || rij.mcp.is_none(),
            "`{naam}` heeft alle drie de wegen en hoort dus in KRUISTABEL"
        );
        // Een reden van drie woorden legt niets uit. De ondergrens is grof
        // gekozen; het gaat erom dat er een zin staat en geen streepje.
        assert!(
            rij.reden.len() >= 60,
            "`{naam}` mist een bruikbare reden; schrijf op of dit programmawerk is dat langs een \
             andere weg geen betekenis heeft, of een gat dat nog open staat"
        );
    }
}

/// Elke rekenkern staat onder één naam in de tabel, ook als die naam per weg
/// verschilt. Twee rijen die hetzelfde gereedschap claimen zou betekenen dat
/// een gat achter een dubbele koppeling wegvalt.
#[test]
fn geen_enkele_rij_is_helemaal_leeg() {
    for (i, rij) in alle_rijen().iter().enumerate() {
        assert!(
            rij.tauri.is_some() || rij.toetsbrug.is_some() || rij.mcp.is_some(),
            "rij {i} van de koppeltabel noemt geen enkele weg"
        );
    }
}

/// Hout en kruislaaghout waren het gat waarvoor dit bestand is gemaakt: vier
/// namen die wél in `generate_handler!` en in de toetsbrug stonden en niet in
/// de MCP-server, terwijl `generate_steel_report_pdf` daar al wel
/// `timber_check_results` accepteerde. Deze test pint dat vast, zodat de
/// koppeling niet stilletjes naar UITZONDERINGEN kan verhuizen.
#[test]
fn hout_en_kruislaaghout_staan_als_volledige_rijen_in_de_tabel() {
    for naam in [
        "list_timber_grades",
        "check_timber_beams",
        "list_clt_presets",
        "check_clt_beams",
    ] {
        let rij = KRUISTABEL
            .iter()
            .find(|r| r.tauri == Some(naam))
            .unwrap_or_else(|| panic!("`{naam}` staat niet als volledige rij in KRUISTABEL"));
        assert_eq!(rij.toetsbrug, Some(naam));
        assert_eq!(
            rij.mcp,
            Some(naam),
            "het MCP-gereedschap voor `{naam}` hoort net zo te heten; hout kreeg bewust niet de \
             enkelvoudsnaam die staal en beton hebben"
        );
    }
}
