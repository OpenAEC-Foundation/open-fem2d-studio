// De toelichting in "Doorsnede voor de stabiliteitstoetsen" blijft op het vel (issue #30).
//
// ── WAAROM DEZE TEST BESTAAT ───────────────────────────────────────────────
//
// In het rapport van een verlopende staaf liep de toelichtingskolom van de
// tabel "Doorsnede voor de stabiliteitstoetsen" rechts van de pagina af: elke
// rij hield op aan de paginarand, midden in een woord, en de kop "Reden" was
// niet te zien. Het rapport (live én via Afdrukken/PDF en
// `gui_export_report_pdf`, die hetzelfde live rapport printen) zet die tabel
// met CHECK_REPORT_CSS. Oorzaak: `.rpt-verloop-tabel td { white-space: nowrap;
// text-align: right }` is specifieker dan `.rpt-verloop-reden { white-space:
// normal }`, dus de zin brak nooit af en de kop stond rechts uitgelijnd voorbij
// de rand.
//
//   [1] markup  — de rapportcomponent zet de klasse op de cel ÉN op de kop.
//   [2] cascade — met de echte CHECK_REPORT_CSS: welke declaratie wint er voor
//                 de kop- en de toelichtingscel (specificiteit, dan volgorde)?
//                 white-space moet afbreken toestaan, tekst links.
//   [3] layout  — de gerenderde tabel in een echte browser (Edge of Chrome,
//                 headless) op de tekstbreedte van A4 staand (180 mm): geen
//                 element steekt buiten het vel en de toelichting beslaat
//                 meer dan één regel. Zonder browser faalt dit deel met reden;
//                 zet OPENAEC_BROWSER naar een Chromium-exe.
//
// Uitvoeren: npx tsx test-rapport-verloop-reden.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=rapport-verloop-reden

import { spawnSync } from "node:child_process";
import { startBrowser } from "./scripts/headlessBrowser.mjs";
import { register } from "node:module";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// De rapportmodules importeren stylesheets (KaTeX); Node kent die niet.
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function load(url, ctx, next) {" +
        " if (url.split('?')[0].endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };" +
        " return next(url, ctx); }",
    ),
);
await import("./scripts/i18n-voor-tests.mjs");
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { VerloopBlok } = await import("./src/components/report/sections/CheckDetailSection.tsx");
const { CHECK_REPORT_CSS } = await import("./src/components/report/checkReportUtils.ts");
const postcss = (await import("postcss")).default;

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

// Het verloop van de ligger uit het issue (IPE270 → IPE500, 6 m), met de
// toelichting zoals de staalkern (steel-check/src/verlopend.rs) hem schrijft.
const maten = (h, b, tw, tf) => ({ h_mm: h, b_mm: b, tw_mm: tw, tf_mm: tf });
const reden =
  "VERLOPEND PROFIEL. Stabiliteit wordt veilig-zijdig met de KLEINSTE doorsnede in het " +
  "beschouwde veld gerekend (ontwerpbesluit 15-09-2026). Alle 2 kandidaatdoorsneden op de " +
  "veldgrenzen (x = 0 mm, 6.000 mm) zijn doorgerekend; maatgevend is x = 0 mm met h 270,0 · " +
  "b 135,0 · t_w 6,6 · t_f 10,2. De doorsnede telt daarbij als GELAST I-profiel: knikkromme " +
  "uit tabel 6.2 en kipkromme uit tabel 6.5 voor gelaste profielen, zonder afrondingsstraal.";
const doorsnede = (x) => {
  const t = x / 6000;
  return {
    x_mm: x, t,
    maten: maten(270 + 230 * t, 135 + 65 * t, 6.6 + 3.6 * t, 10.2 + 5.8 * t),
    area_mm2: 4590 + 7010 * t, w_y_mm3: 484000 + 1710000 * t, klasse: "Class1",
    toetsen: [{ id: "6.2.5", uc: 0.4 }],
  };
};
const verloop = {
  begin_naam: "IPE270", eind_naam: "IPE500",
  begin: maten(270, 135, 6.6, 10.2), eind: maten(500, 200, 10.2, 16),
  aantal_rekenpunten: 401,
  toetsdoorsneden: [0, 1200, 2400, 3600, 4800, 6000].map(doorsnede),
  maatgevend: { doorsnede: doorsnede(1935), toets_id: "6.2.5", uc: 0.52 },
  stabiliteit: ["6.3.2.2", "6.3.3"].map((id) => ({
    toets_id: id, veld: "", x_mm: 0, maten: maten(270, 135, 6.6, 10.2),
    area_mm2: 4590, w_y_mm3: 484000, reden,
  })),
  notities: [],
};
const html = renderToStaticMarkup(React.createElement(VerloopBlok, { verloop }));

// ── [1] markup ──────────────────────────────────────────────────────────────
log("\n[1] markup");
const stabTabel = html.split('class="rpt-verloop-tabel"')[2] ?? "";
check("de tabel voor de stabiliteitstoetsen is gerenderd", stabTabel.length > 0);
check("de kop van de toelichtingskolom draagt de klasse (en heet Reden)",
  /<th class="rpt-verloop-reden">Reden<\/th>/.test(stabTabel), stabTabel.slice(0, 400));
check("elke toelichtingscel draagt de klasse",
  (stabTabel.match(/<td class="rpt-verloop-reden">/g) ?? []).length === 2);

// ── [2] cascade ─────────────────────────────────────────────────────────────
log("\n[2] cascade met CHECK_REPORT_CSS");

/** Specificiteit van een eenvoudige selector: [id, klasse/pseudo, element]. */
function specificiteit(sel) {
  const id = (sel.match(/#[\w-]+/g) ?? []).length;
  const kl = (sel.match(/\.[\w-]+|:[\w-]+|\[[^\]]*\]/g) ?? []).length;
  const el = (sel.replace(/[#.:][\w-]+|\[[^\]]*\]/g, " ").match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  return id * 10000 + kl * 100 + el;
}
/** Past één samengestelde selector (`td.x:first-child`) op een element? */
function pastCompound(c, e) {
  if (/[#[]/.test(c)) return false; // komt in deze CSS niet voor op deze tabel
  const tag = /^[a-zA-Z][\w-]*/.exec(c)?.[0];
  if (tag && tag.toLowerCase() !== e.tag) return false;
  for (const k of c.match(/\.[\w-]+/g) ?? []) if (!e.klassen.includes(k.slice(1))) return false;
  for (const p of c.match(/:[\w-]+/g) ?? []) {
    if (p === ":first-child" && e.index !== 1) return false;
    else if (p === ":last-child" && !e.laatste) return false;
    else if (p !== ":first-child" && p !== ":last-child") return false;
  }
  return true;
}
/** Past een complexe selector (afstammeling en `>`) op het laatste element van de keten? */
function pastSelector(sel, keten) {
  const delen = sel.trim().replace(/\s*>\s*/g, " > ").split(/\s+/);
  const ga = (di, ki) => {
    if (!pastCompound(delen[di], keten[ki])) return false;
    if (di === 0) return true;
    if (delen[di - 1] === ">") return ki > 0 && ga(di - 2, ki - 1);
    for (let j = ki - 1; j >= 0; j--) if (ga(di - 1, j)) return true;
    return false;
  };
  return ga(delen.length - 1, keten.length - 1);
}
/** De winnende waarde van `prop` voor het laatste element van `keten`. */
function winnaar(prop, keten) {
  let beste = null;
  postcss.parse(CHECK_REPORT_CSS).walkRules((regel) => {
    for (const sel of regel.selectors) {
      if (!pastSelector(sel, keten)) continue;
      regel.walkDecls(prop, (d) => {
        const s = specificiteit(sel);
        // Gelijke specificiteit: de latere regel wint.
        if (!beste || s >= beste.s) beste = { s, waarde: d.value, sel };
      });
    }
  });
  return beste;
}
const el = (tag, klassen = [], index = 1, laatste = false) => ({ tag, klassen, index, laatste });
const ketenBasis = [el("div", ["rpt-verloop"]), el("table", ["rpt-verloop-tabel"], 2)];
const redenTd = [...ketenBasis, el("tbody", [], 2, true), el("tr", [], 1), el("td", ["rpt-verloop-reden"], 4, true)];
const redenTh = [...ketenBasis, el("thead", [], 1), el("tr", [], 1, true), el("th", ["rpt-verloop-reden"], 4, true)];
const gewoneTd = [...ketenBasis, el("tbody", [], 2, true), el("tr", [], 1), el("td", [], 2)];

for (const [naam, keten] of [["toelichtingscel", redenTd], ["kop Reden", redenTh]]) {
  const ws = winnaar("white-space", keten);
  check(`${naam}: white-space laat afbreken toe`,
    ws && !/nowrap|pre$/.test(ws.waarde), ws ? `${ws.waarde} uit "${ws.sel}"` : "geen regel");
  const ta = winnaar("text-align", keten);
  check(`${naam}: tekst links uitgelijnd`,
    ta && ta.waarde === "left", ta ? `${ta.waarde} uit "${ta.sel}"` : "geen regel");
}
{
  // Tegenproef: de matcher ziet de nowrap van de gewone cellen wél — anders
  // bewijzen de twee regels hierboven niets.
  const ws = winnaar("white-space", gewoneTd);
  check("tegenproef: een gewone cel van dezelfde tabel blijft nowrap",
    ws?.waarde === "nowrap", ws ? `${ws.waarde} uit "${ws.sel}"` : "geen regel");
}

// ── [3] layout in een echte browser ─────────────────────────────────────────
log("\n[3] layout in een browser, tekstbreedte 180 mm");
const kandidaten = [
  process.env.OPENAEC_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/microsoft-edge",
].filter(Boolean);
const browser = kandidaten.find((p) => existsSync(p));
if (!browser) {
  check("een Chromium-browser voor de layoutmeting (zet OPENAEC_BROWSER)", false, kandidaten.join(", "));
} else {
  const map = mkdtempSync(join(tmpdir(), "verloop-reden-"));
  try {
    const pagina = `<!doctype html><html><head><meta charset="utf-8"><style>
      body { margin: 0; font-family: "Liberation Sans", Arial, sans-serif; }
      #vel { width: 180mm; --rpt-basis: 10pt; font-size: 10pt; line-height: 1.45; }
      ${CHECK_REPORT_CSS}
    </style></head><body><div id="vel">${html}</div><pre id="uitslag"></pre><script>
      const vel = document.getElementById("vel").getBoundingClientRect();
      let buiten = 0, verste = vel.right;
      for (const e of document.querySelectorAll("#vel *")) {
        const r = e.getBoundingClientRect();
        if (r.right > vel.right + 0.5) { buiten++; verste = Math.max(verste, r.right); }
      }
      const cel = document.querySelectorAll("td.rpt-verloop-reden")[0];
      const regel = parseFloat(getComputedStyle(cel).lineHeight) || 14;
      const kop = document.querySelector("th.rpt-verloop-reden").getBoundingClientRect();
      document.getElementById("uitslag").textContent = JSON.stringify({
        velBreedte: vel.width, buiten, verste, kopRechts: kop.right,
        celHoogte: cel.getBoundingClientRect().height, regel,
      });
    </script></body></html>`;
    const bestand = join(map, "blok.html");
    writeFileSync(bestand, pagina, "utf8");
    const r = startBrowser(browser, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${join(map, "profiel")}`, "--virtual-time-budget=3000", "--dump-dom",
      pathToFileURL(bestand).href,
    ], { encoding: "utf8", timeout: 180_000 });
    const m = /<pre id="uitslag">([^<]*)<\/pre>/.exec(r.stdout ?? "");
    const u = m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
    check("de browser heeft gemeten", !!u, (r.stderr ?? "").slice(0, 300) || (r.error?.message ?? ""));
    if (u) {
      log(`    vel ${u.velBreedte.toFixed(0)} px, cel ${u.celHoogte.toFixed(0)} px hoog, regel ${u.regel.toFixed(1)} px`);
      check("geen element steekt rechts buiten de tekstbreedte",
        u.buiten === 0, `${u.buiten} element(en), tot ${u.verste.toFixed(0)} px bij een vel van ${u.velBreedte.toFixed(0)} px`);
      check("de kop Reden staat binnen het vel", u.kopRechts <= u.velBreedte + 0.5, `${u.kopRechts}`);
      check("de toelichting breekt af over meer dan één regel", u.celHoogte > 2 * u.regel, JSON.stringify(u));
    }
  } finally {
    rmSync(map, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
