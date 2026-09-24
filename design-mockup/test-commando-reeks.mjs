// Tweelettercommando's op het tekenvlak: MV = verplaatsen, CO = kopiëren.
// En: kopiëren neemt een puntlast op een vrije positie op een staaf mee.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { verwerkToets, VENSTER_MS } = await import("./src/lib/commandoReeks.ts");
const { computeSelectionCopy } = await import("./src/hooks/useFemStore.ts");
const HIER = dirname(fileURLToPath(import.meta.url));
let geslaagd = 0, gefaald = 0;
const log = (s) => console.log(s);
const check = (naam, ok, detail = "") => { if (ok) { geslaagd++; log(`  ✓ ${naam}`); } else { gefaald++; log(`  ✗ ${naam}${detail ? " — " + detail : ""}`); } };
const reeks = (toetsen, dt = 100) => { let p = null, t = 1000, laatste; for (const k of toetsen) { laatste = verwerkToets(p, k, t); p = laatste.prefix; t += dt; } return laatste; };

log("[1] verwerkToets");
check("C dan O → kopiëren", reeks(["c", "o"]).tool === "copy");
check("hoofdletters werken ook", reeks(["C", "O"]).tool === "copy");
check("M dan V → verplaatsen (bestaand)", reeks(["m", "v"]).tool === "move");
check("C alleen zet een prefix en wordt verbruikt", reeks(["c"]).prefix?.key === "c" && reeks(["c"]).verbruikt && !reeks(["c"]).tool);
check("te laat (na het venster) → geen commando", reeks(["c", "o"], VENSTER_MS + 1).tool === undefined);
check("C dan X → geen commando, X niet verbruikt", reeks(["c", "x"]).tool === undefined && !reeks(["c", "x"]).verbruikt);
check("C dan M → nieuw prefix M", reeks(["c", "m"]).prefix?.key === "m");
check("C dan M dan V → verplaatsen", reeks(["c", "m", "v"]).tool === "move");
check("een gewone letter zonder prefix wordt niet verbruikt", !reeks(["g"]).verbruikt);

log("\n[2] kopiëren neemt een puntlast op een staafpositie mee");
const cur = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }, { id: 3, x: 5000, z: 0 }],
  beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 1, to: 3 }],
  supports: [{ id: 1, nodeId: 1, type: "fixed" }], plates: [],
  loads: [
    { id: 1, type: "pointForce", caseId: 1, beamId: 1, posFrac: 0.4, fx: 3, fz: 0 },
    { id: 2, type: "pointForce", caseId: 2, nodeId: 2, fx: 0, fz: -122 },
    { id: 3, type: "lineLoad", caseId: 3, beamId: 2, q: -5 },
  ],
};
const r = computeSelectionCopy(cur, { type: "beam", id: 1 }, 1000, 0);
const nieuwe = r.loads.slice(cur.loads.length);
check("puntlast op de staafpositie gaat mee, zelfde fractie en geval",
  nieuwe.some((l) => l.beamId === r.beamIdMap.get(1) && l.posFrac === 0.4 && l.caseId === 1 && l.fx === 3));
check("knooplast op de eindknoop (ander belastinggeval) gaat mee",
  nieuwe.some((l) => l.nodeId === r.nodeIdMap.get(2) && l.fz === -122 && l.caseId === 2));
check("last op een niet-geselecteerde staaf gaat niet mee", !nieuwe.some((l) => l.type === "lineLoad"));

log("\n[3] FemCanvas gebruikt de reeksen");
const c = readFileSync(join(HIER, "src", "components", "fem", "FemCanvas.tsx"), "utf8").replace(/\r\n/g, "\n");
check("de toetsafhandeling roept verwerkToets aan en zet het gereedschap", /verwerkToets\(keySeqRef\.current, e\.key, Date\.now\(\)\)[\s\S]{0,200}onToolChange\?\.\(r\.tool\)/.test(c));

log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald > 0 ? 1 : 0);
