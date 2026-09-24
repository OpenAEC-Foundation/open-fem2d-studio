// Terug naar de tab Model sluit de resultaten; de tab Resultaten zet ze terug.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { zonderResultaten, RESULTAATLAGEN } = await import("./src/lib/weergaveModel.ts");
const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };

log("[1] zonderResultaten");
const aan = { M: true, V: true, N: true, deflection: true, rotation: true, EI: true, reactions: true, uc: true,
  reactieX: true, knoopWaarden: true, showExtremes: true, snedeTekens: true, kipsteunen: true, scaleM: 2.5 };
const uit = zonderResultaten(aan);
for (const k of RESULTAATLAGEN) check(`${k} uit`, uit[k] === false);
check("deelopties en schalen blijven staan", uit.reactieX && uit.knoopWaarden && uit.showExtremes && uit.snedeTekens && uit.scaleM === 2.5);
check("modellaag kipsteunen blijft staan", uit.kipsteunen === true);
check("het origineel is niet gewijzigd", aan.M === true && aan.uc === true);

log("\n[2] App.tsx");
const app = readFileSync(join(HIER, "src", "App.tsx"), "utf8").replace(/\r\n/g, "\n");
check("de tab Model zet de resultaten uit", /setShowLoads=\{\(v\) => \{[\s\S]{0,300}if \(!v\) setDisplayFlags\(zonderResultaten\)/.test(app));
const res = /onShowResults=\{\(\) => \{[\s\S]{0,500}?\}\}/.exec(app)?.[0] ?? "";
check("de tab Resultaten zet M, V, N, doorbuiging, reacties en UC weer aan", ["M: true", "V: true", "N: true", "deflection: true", "reactions: true", "uc: true"].every((x) => res.includes(x)), res.slice(0, 80));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
