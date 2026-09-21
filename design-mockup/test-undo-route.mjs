// Ctrl+Z / Ctrl+Y: vrije tekst houdt de tekst-undo van de browser, al het andere
// (ook getalvelden) gaat naar de modelhistorie.
//   [1] de route per soort element
//   [2] App.tsx gebruikt de route, legt een veld eerst vast en wacht een tik
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { undoRoute, moetEerstVastleggen } = await import("./src/lib/undoRoute.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };

log("[1] de route");
check("getalveld (coördinaat in het eigenschappenpaneel) → model", undoRoute({ tagName: "INPUT", type: "number" }) === "model");
check("keuzelijst → model", undoRoute({ tagName: "SELECT" }) === "model");
check("vinkje → model", undoRoute({ tagName: "INPUT", type: "checkbox" }) === "model");
check("schuifregelaar → model", undoRoute({ tagName: "INPUT", type: "range" }) === "model");
check("knop of tekenvlak → model", undoRoute({ tagName: "BUTTON" }) === "model" && undoRoute({ tagName: "svg" }) === "model");
check("geen doel → model", undoRoute(null) === "model");
check("tekstveld → veld", undoRoute({ tagName: "INPUT", type: "text" }) === "veld");
check("invoer zonder type → veld", undoRoute({ tagName: "INPUT" }) === "veld");
check("zoekveld → veld", undoRoute({ tagName: "INPUT", type: "search" }) === "veld");
check("tekstvlak → veld", undoRoute({ tagName: "TEXTAREA" }) === "veld");
check("contenteditable → veld", undoRoute({ tagName: "DIV", isContentEditable: true }) === "veld");
check("een invoerveld legt eerst vast", moetEerstVastleggen({ tagName: "INPUT" }));
check("een keuzelijst of knop hoeft niet vast te leggen", !moetEerstVastleggen({ tagName: "SELECT" }) && !moetEerstVastleggen({ tagName: "BUTTON" }));

log("\n[2] App.tsx");
const app = readFileSync(join(HIER, "src", "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const blok = /\/\/ Keyboard: Ctrl\+Z \/ Ctrl\+Y[\s\S]*?window\.removeEventListener\("keydown", onKey\);/.exec(app)?.[0] ?? "";
check("de sneltoetshandler is gevonden", blok.length > 300, `lengte ${blok.length}`);
check("hij vraagt de route op", /undoRoute\(/.test(blok) && /=== "veld"\) return;/.test(blok));
check("hij sluit invoervelden niet meer in het algemeen uit", !/tagName === "INPUT" \|\|/.test(blok));
check("een veld wordt eerst vastgelegd (blur)", /moetEerstVastleggen\(t\)[\s\S]*\.blur\(\)/.test(blok));
check("undo wacht een tik en gebruikt de actuele undo (ref)", /setTimeout\(voerUit, 0\)/.test(blok) && /undoRedoRef\.current\.undo\(\)/.test(blok));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
