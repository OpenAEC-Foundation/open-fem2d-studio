// Een klik op een last selecteert de last, niet de knoop of staaf eronder,
// en versleept niets. Aanleiding: een puntlast op een kolomkop was nauwelijks
// te selecteren en een klik met een paar pixels handbeweging versleepte de kolom.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { lastIdVanKlik, LAST_SELECTOR } = await import("./src/lib/klikOpLast.ts");
const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };

log("[1] lastIdVanKlik");
const groep = (id) => ({ getAttribute: (n) => (n === "data-last-id" ? id : null) });
const doel = (g) => ({ closest: (s) => (s === LAST_SELECTOR ? g : null) });
check("puntlast- of lijnlastgroep met id → het id", lastIdVanKlik(doel(groep("8"))) === 8);
check("buiten een last → null", lastIdVanKlik(doel(null)) === null);
check("groep zonder id → null", lastIdVanKlik(doel(groep(null))) === null && lastIdVanKlik(doel(groep(""))) === null);
check("geen doel of geen closest → null", lastIdVanKlik(null) === null && lastIdVanKlik({}) === null);
check("de selector dekt punt- en lijnlasten", LAST_SELECTOR.includes(".fem-pointload-group") && LAST_SELECTOR.includes(".fem-lineload-group"));

log("\n[2] FemCanvas");
const c = readFileSync(join(HIER, "src", "components", "fem", "FemCanvas.tsx"), "utf8").replace(/\r\n/g, "\n");
check("elke last-groep draagt data-last-id", (c.match(/className=\{`fem-(point|line)load-group\$\{isSel \? " selected" : ""\}`\}\n\s*data-last-id=\{l\.id\}/g) ?? []).length === 4);
const b = c.indexOf('if (e.button === 0 && tool === "select" && !popover) {');
const romp = c.slice(b, b + 1200);
const iLast = romp.indexOf("lastIdVanKlik(e.target"), iKnoop = romp.indexOf("findSnapNode(sx, sy)");
check("de last wordt vóór de knoop-/staafzoektocht herkend", iLast > 0 && iKnoop > iLast);
check("en al bij het indrukken geselecteerd, zonder te slepen", /setSelection\(\{ type: "load", id: lastId \}\);\s*return;/.test(romp));

check("het getal bij een puntlast is klikbaar en focust Fz of Fx",
  /className="fem-load-text fem-load-text-clickable"[\s\S]{0,400}field: Math\.abs\(fz\) >= Math\.abs\(fx\) \? "fz" : "fx"[\s\S]{0,120}\{mag\.toFixed\(1\)\} kN<\/text>/.test(c));
const css = readFileSync(join(HIER, "src", "components", "fem", "FemCanvas.css"), "utf8").replace(/\r\n/g, "\n");
check("de klikstrook langs de pijl is 18 px breed", /\.fem-pointload-hit \{[\s\S]{0,200}stroke-width: 18;/.test(css));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
