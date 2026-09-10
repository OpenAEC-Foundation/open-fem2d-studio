//! `gui_control` — het bedieningskanaal van de app.
//!
//! Alleen actief wanneer de app is gestart met `OPENAEC_GUI_CONTROL=1`. Dan
//! luistert deze module op `127.0.0.1:<vrije poort>`, met een sessietoken, en
//! schrijft hij `gui-control.json` (`{pid, poort, token, versie}`) in de
//! app-datamap zodat een client hem kan vinden. Zonder die variabele bestaat
//! er geen luisteraar, geen bestand en geen token — de commands hieronder
//! antwoorden dan alleen "niet actief".
//!
//! # Wat het kanaal is, en wat niet
//!
//! Een client stuurt `POST /opdracht` met `{naam, args}` en
//! `Authorization: Bearer <token>`. Drie soorten opdrachten:
//!
//! * **Paginaopdrachten** — het overgrote deel. Rust zet ze als event
//!   (`gui-control:opdracht`) op het hoofdvenster; de pagina voert ze uit met
//!   haar eigen acties (`bediening/bediening.ts`) en meldt de uitkomst terug
//!   via het command `gui_control_antwoord`. De HTTP-aanroep wacht daarop,
//!   met een tijdslimiet. Verloopt die, dan een fout mét de opdrachtnaam — er
//!   blijft nooit een verbinding stil hangen.
//! * **`screenshot`** — doet Rust zelf: `PrintWindow` op het venster met het
//!   opgegeven Tauri-label, naar een PNG. Echte pixels, ook van het canvas.
//!   Met `dom: true` gaat hij alsnog naar de pagina (html2canvas), als
//!   terugval.
//! * **`model_laden`** — leest het bestand in Rust en geeft de TEKST door aan
//!   de pagina. De pagina zelf mag namelijk niet elk pad lezen: de
//!   fs-scope van Tauri kent alleen paden die via een dialoog zijn gekozen.
//!
//! Dit is een API van acties, geen muis- of toetsenbordautomatisering. Er is
//! geen luisteraar op een ander adres dan loopback, geen kanaal zonder token,
//! en het staat niet standaard aan. Zolang het aanstaat, toont de statusbalk
//! van de app dat.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

/// De omgevingsvariabele die het kanaal aanzet.
pub const OMGEVINGSVARIABELE: &str = "OPENAEC_GUI_CONTROL";
/// De naam van het vindbestand in de app-datamap.
pub const BESTANDSNAAM: &str = "gui-control.json";
/// Het event waarmee een paginaopdracht het hoofdvenster in gaat.
const EVENT_OPDRACHT: &str = "gui-control:opdracht";
/// Het venster waarin `bediening.ts` luistert.
const HOOFDVENSTER: &str = "main";
const STANDAARD_TIJDSLIMIET_S: u64 = 60;
const MAX_TIJDSLIMIET_S: u64 = 600;

/// Antwoorden van de pagina, op opdracht-id. `None` = nog onderweg.
type Wachtkamer = Arc<(Mutex<HashMap<u64, Option<Value>>>, Condvar)>;

/// De toestand van het kanaal, beheerd door Tauri (`app.manage`).
pub struct GuiControl {
    actief: bool,
    token: String,
    bestand: Option<PathBuf>,
    volgende_id: Mutex<u64>,
    wachtkamer: Wachtkamer,
}

impl GuiControl {
    /// Een kanaal dat er niet is. De commands antwoorden "niet actief".
    fn uit() -> Self {
        GuiControl {
            actief: false,
            token: String::new(),
            bestand: None,
            volgende_id: Mutex::new(0),
            wachtkamer: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
        }
    }

    pub fn is_actief(&self) -> bool {
        self.actief
    }

    /// Verwijder het vindbestand. Bij afsluiten aangeroepen; een achtergebleven
    /// bestand zou een client naar een poort sturen waar niets meer luistert.
    pub fn opruimen(&self) {
        if let Some(pad) = &self.bestand {
            let _ = fs::remove_file(pad);
        }
    }

    fn nieuw_id(&self) -> u64 {
        let mut n = self.volgende_id.lock().unwrap();
        *n += 1;
        *n
    }
}

/// Zet het kanaal op, of niet — afhankelijk van de omgevingsvariabele.
///
/// Wordt in `setup` aangeroepen; de teruggegeven waarde gaat in `app.manage`.
/// Fouten bij het opzetten (poort, bestand) zijn geen reden om de app niet te
/// starten: ze worden gelogd en het kanaal blijft uit.
pub fn start(app: &AppHandle) -> Arc<GuiControl> {
    let aan = std::env::var(OMGEVINGSVARIABELE)
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if !aan {
        return Arc::new(GuiControl::uit());
    }
    match start_luisteraar(app) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[gui_control] niet gestart: {e}");
            Arc::new(GuiControl::uit())
        }
    }
}

fn start_luisteraar(app: &AppHandle) -> Result<Arc<GuiControl>, String> {
    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|e| format!("kan niet luisteren op 127.0.0.1: {e}"))?;
    let poort = match server.server_addr() {
        tiny_http::ListenAddr::IP(a) => a.port(),
        #[allow(unreachable_patterns)]
        _ => return Err("onverwacht luisteradres".into()),
    };

    let token = maak_token();
    let versie = app.package_info().version.to_string();

    let map = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app-datamap onbekend: {e}"))?;
    fs::create_dir_all(&map).map_err(|e| format!("app-datamap niet aan te maken: {e}"))?;
    let bestand = map.join(BESTANDSNAAM);
    let inhoud = json!({
        "pid": std::process::id(),
        "poort": poort,
        "token": token,
        "versie": versie,
    });
    fs::write(&bestand, serde_json::to_string_pretty(&inhoud).unwrap())
        .map_err(|e| format!("vindbestand niet te schrijven: {e}"))?;

    let control = Arc::new(GuiControl {
        actief: true,
        token: token.clone(),
        bestand: Some(bestand),
        volgende_id: Mutex::new(0),
        wachtkamer: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
    });

    let app = app.clone();
    let c = Arc::clone(&control);
    std::thread::Builder::new()
        .name("gui-control".into())
        .spawn(move || lus(server, app, c, versie))
        .map_err(|e| format!("luisterdraad niet te starten: {e}"))?;

    eprintln!("[gui_control] actief op 127.0.0.1:{poort}");
    Ok(control)
}

fn maak_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ── De luisterlus ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Opdracht {
    naam: String,
    #[serde(default)]
    args: Value,
    /// Per opdracht te verhogen (toetsen kan lang duren); begrensd.
    #[serde(default)]
    tijdslimiet_s: Option<u64>,
}

fn lus(server: tiny_http::Server, app: AppHandle, control: Arc<GuiControl>, versie: String) {
    for mut req in server.incoming_requests() {
        let pad = req.url().to_string();
        let methode = req.method().as_str().to_string();

        let (status, body) = match (methode.as_str(), pad.as_str()) {
            ("GET", "/status") => (200, json!({ "versie": versie, "gereed": true })),
            ("POST", "/opdracht") => {
                if !geautoriseerd(&req, &control.token) {
                    (401, json!({ "ok": false, "fout": "ontbrekend of onjuist token" }))
                } else {
                    let mut tekst = String::new();
                    if let Err(e) = req.as_reader().read_to_string(&mut tekst) {
                        (400, json!({ "ok": false, "fout": format!("body onleesbaar: {e}") }))
                    } else {
                        match serde_json::from_str::<Opdracht>(&tekst) {
                            Err(e) => (400, json!({ "ok": false, "fout": format!("opdracht onleesbaar: {e}") })),
                            Ok(o) => match voer_uit(&app, &control, o) {
                                Ok(uitkomst) => (200, json!({ "ok": true, "uitkomst": uitkomst })),
                                Err(fout) => (200, json!({ "ok": false, "fout": fout })),
                            },
                        }
                    }
                }
            }
            _ => (404, json!({ "ok": false, "fout": format!("onbekend: {methode} {pad}") })),
        };

        let antwoord = tiny_http::Response::from_string(body.to_string())
            .with_status_code(status)
            .with_header(
                tiny_http::Header::from_bytes("Content-Type", "application/json; charset=utf-8")
                    .expect("geldige header"),
            );
        let _ = req.respond(antwoord);
    }
}

fn geautoriseerd(req: &tiny_http::Request, token: &str) -> bool {
    req.headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .map(|h| h.value.as_str() == format!("Bearer {token}"))
        .unwrap_or(false)
}

/// Eén opdracht: zelf afhandelen, of doorgeven aan de pagina en wachten.
fn voer_uit(app: &AppHandle, control: &Arc<GuiControl>, o: Opdracht) -> Result<Value, String> {
    let tijdslimiet = Duration::from_secs(
        o.tijdslimiet_s
            .unwrap_or(STANDAARD_TIJDSLIMIET_S)
            .clamp(1, MAX_TIJDSLIMIET_S),
    );
    match o.naam.as_str() {
        "screenshot" => {
            let dom = o.args.get("dom").and_then(Value::as_bool).unwrap_or(false);
            if dom {
                // Terugval: de pagina tekent zichzelf met html2canvas en geeft
                // een data-URL; wij schrijven het bestand.
                let uit = naar_pagina(app, control, "screenshot_dom", o.args.clone(), tijdslimiet)?;
                let data = uit
                    .get("dataUrl")
                    .and_then(Value::as_str)
                    .ok_or("screenshot_dom gaf geen dataUrl")?;
                let pad = pad_uit_args(&o.args)?;
                schrijf_data_url(data, &pad)?;
                Ok(json!({ "pad": pad, "bron": "dom" }))
            } else {
                let label = o
                    .args
                    .get("venster")
                    .and_then(Value::as_str)
                    .unwrap_or(HOOFDVENSTER);
                let pad = pad_uit_args(&o.args)?;
                capture::naar_png(app, label, &pad)?;
                Ok(json!({ "pad": pad, "bron": "venster", "venster": label }))
            }
        }
        // Netjes afsluiten: via `AppHandle::exit`, zodat `RunEvent::Exit`
        // loopt en het vindbestand wordt opgeruimd. Een client die het proces
        // zou doden, laat dat bestand achter — en dan wijst het naar niets.
        // Eerst antwoorden, dan sluiten: anders ziet de client een verbroken
        // verbinding in plaats van een bevestiging.
        "afsluiten" => {
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(300));
                app.exit(0);
            });
            Ok(json!({ "afgesloten": true }))
        }
        "model_laden" => {
            let pad = o
                .args
                .get("pad")
                .and_then(Value::as_str)
                .ok_or("model_laden vraagt om `pad`")?;
            let tekst = fs::read_to_string(pad).map_err(|e| format!("{pad}: {e}"))?;
            naar_pagina(
                app,
                control,
                "model_laden",
                json!({ "tekst": tekst, "pad": pad }),
                tijdslimiet,
            )
        }
        naam => naar_pagina(app, control, naam, o.args, tijdslimiet),
    }
}

/// Zet de opdracht als event op het hoofdvenster en wacht op het antwoord.
fn naar_pagina(
    app: &AppHandle,
    control: &Arc<GuiControl>,
    naam: &str,
    args: Value,
    tijdslimiet: Duration,
) -> Result<Value, String> {
    let id = control.nieuw_id();
    {
        let (slot, _) = &*control.wachtkamer;
        slot.lock().unwrap().insert(id, None);
    }
    app.emit_to(HOOFDVENSTER, EVENT_OPDRACHT, json!({ "id": id, "naam": naam, "args": args }))
        .map_err(|e| format!("event naar het hoofdvenster mislukt: {e}"))?;

    let (slot, wekker) = &*control.wachtkamer;
    let deadline = Instant::now() + tijdslimiet;
    let mut kamer = slot.lock().unwrap();
    loop {
        if let Some(Some(antwoord)) = kamer.get(&id) {
            let antwoord = antwoord.clone();
            kamer.remove(&id);
            return uitkomst_uit_antwoord(antwoord);
        }
        let nu = Instant::now();
        if nu >= deadline {
            kamer.remove(&id);
            return Err(format!(
                "geen antwoord van de pagina op `{naam}` binnen {} s — luistert `bediening.ts` wel \
                 (is de app met OPENAEC_GUI_CONTROL=1 gestart en volledig geladen)?",
                tijdslimiet.as_secs()
            ));
        }
        let (k, _) = wekker.wait_timeout(kamer, deadline - nu).unwrap();
        kamer = k;
    }
}

/// De pagina antwoordt `{ok, uitkomst}` of `{ok: false, fout}`.
fn uitkomst_uit_antwoord(a: Value) -> Result<Value, String> {
    if a.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(a.get("uitkomst").cloned().unwrap_or(Value::Null))
    } else {
        Err(a
            .get("fout")
            .and_then(Value::as_str)
            .unwrap_or("de pagina meldde een fout zonder tekst")
            .to_string())
    }
}

fn pad_uit_args(args: &Value) -> Result<String, String> {
    args.get("pad")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "screenshot vraagt om `pad` (waar de PNG moet komen)".to_string())
}

fn schrijf_data_url(data: &str, pad: &str) -> Result<(), String> {
    let b64 = data
        .strip_prefix("data:image/png;base64,")
        .ok_or("dataUrl is geen PNG")?;
    let bytes = base64_decode(b64)?;
    if let Some(ouder) = std::path::Path::new(pad).parent() {
        let _ = fs::create_dir_all(ouder);
    }
    fs::write(pad, bytes).map_err(|e| format!("{pad}: {e}"))
}

/// Base64 zonder extra crate: de app-crate heeft er geen, en dit is de enige plek.
fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    fn waarde(c: u8) -> Result<u32, String> {
        Ok(match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a' + 26) as u32,
            b'0'..=b'9' => (c - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            _ => return Err(format!("ongeldig base64-teken {c}")),
        })
    }
    let schoon: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace() && *b != b'=').collect();
    let mut uit = Vec::with_capacity(schoon.len() * 3 / 4);
    for blok in schoon.chunks(4) {
        let mut acc = 0u32;
        for (i, &c) in blok.iter().enumerate() {
            acc |= waarde(c)? << (18 - 6 * i);
        }
        let n = blok.len();
        if n >= 2 { uit.push((acc >> 16) as u8); }
        if n >= 3 { uit.push((acc >> 8) as u8); }
        if n == 4 { uit.push(acc as u8); }
    }
    Ok(uit)
}

// ── Het antwoord van de pagina ──────────────────────────────────────────────
// De Tauri-commands zelf staan in lib.rs (dun); dit is wat ze aanroepen.

impl GuiControl {
    /// Lever het antwoord van de pagina af bij de wachtende HTTP-aanroep.
    pub fn antwoord(&self, id: u64, uitkomst: Value) -> Result<(), String> {
        let (slot, wekker) = &*self.wachtkamer;
        let mut kamer = slot.lock().unwrap();
        match kamer.get_mut(&id) {
            Some(plek) => {
                *plek = Some(uitkomst);
                wekker.notify_all();
                Ok(())
            }
            None => Err(format!("onbekend of verlopen opdracht-id {id}")),
        }
    }
}

// ── Screenshot: echte pixels van een Tauri-venster ──────────────────────────

mod capture {
    use super::*;

    #[cfg(windows)]
    pub fn naar_png(app: &AppHandle, label: &str, pad: &str) -> Result<(), String> {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        use windows::Win32::Foundation::{HWND, RECT};
        // `PrintWindow` staat in de Windows-metadata onder Storage::Xps (feature
        // `Win32_Storage_Xps`), niet onder WindowsAndMessaging waar winuser.h hem
        // declareert — nagekeken in de crate-bron van windows 0.61.3.
        use windows::Win32::Graphics::Gdi::{
            CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
            SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS,
        };
        use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
        use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

        let venster = app.get_webview_window(label).ok_or_else(|| {
            // Welke vensters er wél zijn, zodat een client meteen ziet of het
            // label verkeerd is of het venster nooit is ontstaan.
            let bekend: Vec<String> = app.webview_windows().keys().cloned().collect();
            format!("geen venster met label `{label}` — bekende vensters: {bekend:?}")
        })?;
        let handle = venster
            .window_handle()
            .map_err(|e| format!("vensterhandle: {e}"))?;
        let hwnd_raw = match handle.as_raw() {
            RawWindowHandle::Win32(h) => h.hwnd.get(),
            _ => return Err("geen Win32-venster".into()),
        };
        let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);

        // PW_RENDERFULLCONTENT (2): zonder deze vlag blijft een WebView2 zwart.
        // Empirisch bevestigd op de geïnstalleerde app vóór deze module bestond.
        const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

        let (breedte, hoogte, rgba) = unsafe {
            let mut r = RECT::default();
            GetWindowRect(hwnd, &mut r).map_err(|e| format!("GetWindowRect: {e}"))?;
            let w = r.right - r.left;
            let h = r.bottom - r.top;
            if w <= 0 || h <= 0 {
                return Err(format!("venster `{label}` heeft geen oppervlak ({w}×{h})"));
            }

            let hdc_scherm = GetDC(None);
            let hdc = CreateCompatibleDC(Some(hdc_scherm));
            let mut bmi = BITMAPINFO::default();
            bmi.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0, // BI_RGB
                ..Default::default()
            };
            let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
            let hbm = CreateDIBSection(Some(hdc), &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
                .map_err(|e| format!("CreateDIBSection: {e}"))?;
            let oud = SelectObject(hdc, hbm.into());
            let ok = PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT).as_bool();

            let n = (w as usize) * (h as usize) * 4;
            let bron = std::slice::from_raw_parts(bits as *const u8, n);
            let mut rgba = Vec::with_capacity(n);
            for px in bron.chunks_exact(4) {
                rgba.extend_from_slice(&[px[2], px[1], px[0], 255]);
            }

            SelectObject(hdc, oud);
            let _ = DeleteObject(hbm.into());
            let _ = DeleteDC(hdc);
            ReleaseDC(None, hdc_scherm);

            if !ok {
                return Err("PrintWindow gaf false — het venster is mogelijk geminimaliseerd".into());
            }
            (w as u32, h as u32, rgba)
        };

        if let Some(ouder) = std::path::Path::new(pad).parent() {
            fs::create_dir_all(ouder).map_err(|e| format!("{}: {e}", ouder.display()))?;
        }
        let bestand = fs::File::create(pad).map_err(|e| format!("{pad}: {e}"))?;
        let mut enc = png::Encoder::new(std::io::BufWriter::new(bestand), breedte, hoogte);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut schrijver = enc.write_header().map_err(|e| format!("png: {e}"))?;
        schrijver
            .write_image_data(&rgba)
            .map_err(|e| format!("png: {e}"))?;
        Ok(())
    }

    #[cfg(not(windows))]
    pub fn naar_png(_app: &AppHandle, _label: &str, _pad: &str) -> Result<(), String> {
        Err("venster-capture is alleen op Windows gebouwd; gebruik `dom: true`".into())
    }
}
