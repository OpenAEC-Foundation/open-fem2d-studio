// R16 — modelbestand bouwen en wegschrijven.
//
// Vrij opgelegde, zijdelings ongesteunde ligger IPE 330 van 5,70 m, S235.
// Invoer letterlijk uit het dossier
// (docs/superpowers/plans/2026-09-02-referentieberekeningen.md, § R16).
//
// Dit script SCHRIJFT alleen; het rekent niet. `toets-R16.mjs` leest het
// weggeschreven bestand terug en rekent dát door, zodat de gecontroleerde
// invoer letterlijk het opgeslagen model is.
//
// Draaien met: npx tsx referentie/bouw-R16.mjs   (vanuit design-mockup/)

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { serializeProject } = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));

// ── Invoer uit het dossier ────────────────────────────────────────────────
// Overspanning 5,70 m; belastingbreedte (stramien) 2,50 m; vloerdikte 120 mm.
// Belasting:
//   eigen gewicht ligger  0,482 kN/m   → uit selfWeightEnabled (ρ·A·g)
//   vloerplaat            0,12 × 24 = 2,88 kN/m²
//   scheidingswanden      0,75 kN/m²
//   opgelegde belasting   2,50 kN/m²
//   Gk = 0,482 + (2,88 + 0,75)·2,50 = 9,56 kN/m
//   Qk = 2,50 × 2,50 = 6,25 kN/m
export const L_MM = 5700;
export const STRAMIEN_M = 2.50;
export const G_REST_KN_M = (0.12 * 24 + 0.75) * STRAMIEN_M; // 9,075 kN/m
export const Q_KN_M = 2.50 * STRAMIEN_M;                     // 6,25 kN/m

export const state = {
  nodes: [
    { id: 1, x: 0,    z: 0 },
    { id: 2, x: L_MM, z: 0 },
  ],
  beams: [
    {
      id: 1, from: 1, to: 2,
      material: "S235",
      profile: "IPE330",
      // Zijdelings uitsluitend bij de opleggingen gesteund: geen kipsteunen
      // in het veld. Kniklengtes = systeemlengte (niet maatgevend, N = 0).
      checkConfig: {
        lateralRestraints: [],
        lateralRestraintsBottom: [],
        deflectionClass: "floor",
      },
      loadRole: "vloer",
    },
  ],
  supports: [
    { nodeId: 1, type: "pinned" },  // scharnier
    { nodeId: 2, type: "zRoller" }, // rol (verticaal vast, horizontaal vrij)
  ],
  plates: [],
  loads: [
    // Permanent, zonder het eigen gewicht van de ligger — dat komt uit
    // selfWeightEnabled, zodat de app zelf ρ·A·g rekent (0,482 kN/m).
    { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -G_REST_KN_M },
    // Veranderlijk (opgelegde belasting).
    { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -Q_KN_M },
  ],
  loadCases: [
    { id: 1, name: "G — permanent", type: "dead" },
    { id: 2, name: "Q — opgelegd",  type: "live" },
  ],
  activeLoadCaseId: 1,
  // Eigen gewicht AAN: de bron rekent 0,482 kN/m mee in Gk.
  selfWeightEnabled: true,
  nonlinearEnabled: false,
  // De bron gebruikt EN 1990 vgl. 6.10 met de aanbevolen partiële factoren:
  // UGT 1,35·G + 1,50·Q en de karakteristieke BGT-combinatie G + Q.
  // De standaardcombinaties van de app (6.10a/6.10b met ψ-factoren) zijn
  // hier dus expliciet vervangen.
  combinations: [
    {
      id: 1, name: "UGT 6.10", type: "uls",
      formula: "1,35·G + 1,50·Q",
      factors: { 1: 1.35, 2: 1.5 },
    },
    {
      id: 2, name: "BGT Karakteristiek", type: "sls",
      formula: "G + Q",
      factors: { 1: 1.0, 2: 1.0 },
    },
  ],
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

const tekst = serializeProject(state);

mkdirSync(HIER, { recursive: true });
// .femp zoals de campagne het vraagt, én .ifcfem2d omdat de openen-dialoog
// van de app op die extensie filtert. Beide bestanden zijn identiek.
for (const naam of ["R16.femp", "R16.ifcfem2d"]) {
  writeFileSync(join(HIER, naam), tekst, "utf8");
  process.stdout.write(`geschreven: ${join(HIER, naam)}\n`);
}
