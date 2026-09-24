// Standaardaansluitingen van een staafeinde: Momentvast (N, V, M vast) en
// Scharnier (M los, N en V vast); de rest blijft onder "Anders…".
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { standaardAansluitingVan, zetStandaardAansluiting } = await import("./src/lib/aansluiting.ts");
const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };
const J = JSON.stringify;

log("[1] herkennen");
check("niets ingesteld → momentvast", standaardAansluitingVan(undefined, undefined, "start") === "momentvast");
check("alleen M los aan de start → scharnier", standaardAansluitingVan({ startRy: true }, undefined, "start") === "scharnier");
check("…en het eind blijft momentvast", standaardAansluitingVan({ startRy: true }, undefined, "end") === "momentvast");
check("N los → anders", standaardAansluitingVan({ endTx: true }, undefined, "end") === "anders");
check("momentveer → anders", standaardAansluitingVan(undefined, { startRy: 5000 }, "start") === "anders");
check("M los én V-veer → anders", standaardAansluitingVan({ startRy: true }, { startTz: 100 }, "start") === "anders");

log("\n[2] zetten");
let w = zetStandaardAansluiting(undefined, undefined, "start", "scharnier");
check("scharnier zet alleen startRy", J(w.releases) === J({ startRy: true }) && w.veren === undefined, J(w));
w = zetStandaardAansluiting({ startRy: true, endRy: true }, { endTz: 50 }, "start", "momentvast");
check("momentvast aan de start laat het eind ongemoeid", J(w.releases) === J({ endRy: true }) && J(w.veren) === J({ endTz: 50 }), J(w));
w = zetStandaardAansluiting({ endTx: true }, { endRy: 5000, startTz: 7 }, "end", "scharnier");
check("scharnier aan het eind wist N-scharnier en M-veer daar, houdt de start", J(w.releases) === J({ endRy: true }) && J(w.veren) === J({ startTz: 7 }), J(w));
w = zetStandaardAansluiting({ startRy: true }, undefined, "start", "momentvast");
check("alles vast → geen velden meer (undefined)", w.releases === undefined && w.veren === undefined);

log("\n[3] component en vertalingen");
const bron = readFileSync(join(HIER, "src", "components", "fem", "AansluitingKeuze.tsx"), "utf8").replace(/\r\n/g, "\n");
check("knoppen Momentvast en Scharnier met aria-pressed", /\(\["momentvast", "scharnier"\] as const\)\.map/.test(bron) && /aria-pressed=/.test(bron));
check("regels per N/V/M alleen bij Anders of een afwijkende aansluiting", /\{toonRegels && AANSLUIT_DOFS\.map/.test(bron));
for (const taal of ["nl", "en", "de", "fr"]) {
  const c = JSON.parse(readFileSync(join(HIER, "src", "i18n", "locales", taal, "check.json"), "utf8")).connection?.standaard ?? {};
  check(`${taal}: alle teksten aanwezig`, ["label", "momentvast", "scharnier", "anders", "momentvastTitel", "scharnierTitel", "andersTitel"].every((k) => typeof c[k] === "string" && c[k].length > 0));
}

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
