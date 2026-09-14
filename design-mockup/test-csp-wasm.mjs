// Het CSP van de desktop-app moet WebAssembly toestaan.
//
// WAAROM DEZE TEST BESTAAT. De polygonplaat wordt gemeshd met een CDT die als
// WebAssembly draait (`core/mesher/TriangleService.ts`). Chromium - en dus ook
// de WebView2 waarin de app draait - weigert ELKE WebAssembly-compilatie
// wanneer `script-src` (of bij ontbreken daarvan `default-src`) geen
// 'wasm-unsafe-eval' bevat. De melding luidt dan:
//
//   "Compiling or instantiating WebAssembly module violates the following
//    Content Security policy directive because 'unsafe-eval' is not an
//    allowed source of script"
//
// Het gevolg is verraderlijk, want het treft maar de HELFT van de platen: een
// rechthoekige plaat gaat in FemCanvas langs het grid-pad en raakt de wasm
// nooit, terwijl elke andere vorm langs de CDT gaat. In de dev-server is er
// bovendien GEEN CSP, dus daar werkt alles. De fout bestaat dus alleen in de
// gebouwde app en alleen bij een niet-rechthoekige plaat - precies de
// combinatie die je bij het testen mist.
//
// 'wasm-unsafe-eval' is de NAUWE toestemming: hij staat het compileren van
// WebAssembly toe en NIET het uitvoeren van eval() op JavaScript. Daarom staat
// hij op een eigen `script-src` in plaats van op `default-src` - zo verruimt
// hij alleen scripts en niet img, style of connect.
//
// Deze test leest de configuratie rechtstreeks; hij raakt de solver niet.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const CONF = join(hier, "..", "src-tauri", "tauri.conf.json");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) { passed++; log(`  \u2713 ${naam}`); }
  else { failed++; log(`  \u2717 ${naam}${toelichting ? " - " + toelichting : ""}`); }
}

const conf = JSON.parse(readFileSync(CONF, "utf8"));
const csp = conf?.app?.security?.csp;

log("[1] Het CSP staat in de configuratie");
check("app.security.csp is een tekst", typeof csp === "string" && csp.length > 0,
  `gevonden: ${JSON.stringify(csp)}`);

if (typeof csp !== "string") {
  log(`\n\u274c ${passed} geslaagd, ${failed} gefaald`);
  process.exit(1);
}

// Splits het CSP in richtlijnen: "naam bron bron; naam bron" -> Map(naam -> [bron]).
const richtlijnen = new Map();
for (const deel of csp.split(";")) {
  const stukken = deel.trim().split(/\s+/).filter(Boolean);
  if (stukken.length === 0) continue;
  richtlijnen.set(stukken[0], stukken.slice(1));
}

log("\n[2] WebAssembly is toegestaan");
// Chromium kijkt naar script-src en valt bij ontbreken terug op default-src.
const scriptBronnen = richtlijnen.get("script-src") ?? richtlijnen.get("default-src") ?? [];
check("script-src (of default-src) bevat 'wasm-unsafe-eval'",
  scriptBronnen.includes("'wasm-unsafe-eval'") || scriptBronnen.includes("'unsafe-eval'"),
  `de geldende bronnen zijn: ${scriptBronnen.join(" ") || "(geen)"} - zonder deze ` +
  `toestemming mislukt elke polygonplaat in de gebouwde app`);

log("\n[3] De toestemming blijft zo nauw mogelijk");
// 'unsafe-eval' zou ook eval() op JavaScript toestaan; dat is ruimer dan nodig.
check("geen 'unsafe-eval' op script-src", !scriptBronnen.includes("'unsafe-eval'"),
  "'wasm-unsafe-eval' volstaat voor WebAssembly en laat eval() geblokkeerd");
// De ruimte hoort op script-src te staan, niet op default-src, zodat img-src,
// style-src en connect-src er niet door verruimd worden.
const standaardBronnen = richtlijnen.get("default-src") ?? [];
check("'wasm-unsafe-eval' staat niet op default-src",
  !standaardBronnen.includes("'wasm-unsafe-eval'"),
  "op default-src verruimt hij ook richtlijnen die geen script zijn");

log(`\n${failed === 0 ? "\u2705" : "\u274c"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
