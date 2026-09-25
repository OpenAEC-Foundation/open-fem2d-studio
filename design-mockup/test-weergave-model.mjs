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
const model = /setShowLoads=\{\(v\) => \{[\s\S]{0,600}?\n {10}\}\}/.exec(app)?.[0] ?? "";
check("de tab Model zet de resultaten uit", /if \(!v\) \{[\s\S]*setDisplayFlags\(zonderResultaten\)/.test(model), model.slice(0, 80));
check("de tab Model zet de verkenner terug op Project", /if \(!v\) \{[\s\S]*setTreeTab\("project"\)/.test(model));
check("de tab Model sluit het toetsingspaneel naast het tekenvlak", /if \(!v\) \{[\s\S]*if \(activeView === "check"\) setActiveView\("default"\)/.test(model));
check("het blok Toetsing rechts staat er alleen buiten de tab Model", /\{fem\.showLoads && \(\s*<CheckPanelToggle/.test(app));
const res = /onShowResults=\{\(\) => \{[\s\S]{0,700}?\}\}/.exec(app)?.[0] ?? "";
check("de tab Resultaten zet M, V, N, doorbuiging, reacties en UC weer aan", ["M: true", "V: true", "N: true", "deflection: true", "reactions: true", "uc: true"].every((x) => res.includes(x)), res.slice(0, 80));
check("de tab Resultaten zet de verkenner op Resultaten", /setTreeTab\("results"\)/.test(res));

log("\n[3] FemCanvas");
const canvas = readFileSync(join(HIER, "src", "components", "fem", "FemCanvas.tsx"), "utf8").replace(/\r\n/g, "\n");
const banner = /const bannerText[\s\S]*?\}, \[[^\]]*\]\);/.exec(canvas)?.[0] ?? "";
check("de resultaatregel bovenaan verdwijnt in de modelweergave", /if \(!showLoads\) return null;/.test(banner));
check("…en hangt van showLoads af", /showLoads\]\);$/.test(banner));
check("diagrammen en omhullende blijven onderdrukt in de modelweergave",
  /\{showLoads && overlayResult && \(/.test(canvas) && /\{showLoads && \(\s*<g className="fem-envelope-overlay"/.test(canvas));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
