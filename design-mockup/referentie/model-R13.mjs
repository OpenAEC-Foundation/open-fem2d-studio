// R13 — model van de vrij opgelegde, kipvaste ligger 6,5 m met lijnlast en
// puntlast (S275, 533 × 210 × 92 UKB).
//
// Dit bestand is de ENIGE bron van het model: het schrijft R13.femp weg én
// levert dezelfde toestand aan toets-R13.mjs, zodat het bestand dat in de app
// geopend wordt gegarandeerd hetzelfde model is als het doorgerekende.
//
// Invoer letterlijk uit het dossier
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md, geval R13:
//   L = 6500 mm, puntlast in het midden (3250 mm van elke oplegging)
//   Permanent   g1 = 15 kN/m (incl. eigen gewicht) · G2 = 40 kN
//   Veranderlijk q1 = 30 kN/m                      · Q2 = 50 kN
//   UGT: Britse NB bij EN 1990, ALLEEN uitdrukking (6.10b):
//        ξ·γ_G = 0,925 · 1,35 = 1,24875 en γ_Q = 1,50
//   BGT: ALLEEN de veranderlijke belastingen (factor 1,0 op q1 en Q2,
//        factor 0 op het permanente geval) — zo schrijft de Britse NB het voor.
//
// Eigen gewicht staat UIT: de bron heeft het al in g1 = 15 kN/m zitten.
//
// Draaien (schrijft alleen het bestand weg): npx tsx referentie/model-R13.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { serializeProject } = await import("../src/io/projectFile.ts");

// ── Doorsnede uit de bron ────────────────────────────────────────────────
// 533 × 210 × 92 UKB staat NIET in onze profieldatabase (414 profielen,
// uitsluitend Europese series). De app kent ook geen handmatig ingevoerde
// doorsnede. De profielnaam blijft daarom staan zoals de bron hem noemt —
// zie de toelichting in toets-R13.mjs — en de rekengrootheden worden in de
// toetsing expliciet op de bronwaarden gezet.
export const BRON_DOORSNEDE = {
  naam: "533x210x92 UKB",
  materiaal: "S275",
  fy: 275,          // N/mm² (t ≤ 16 mm)
  E: 210000,        // N/mm²
  A: 117e2,         // mm²   (117 cm²)
  Iy: 55200e4,      // mm⁴   (55 200 cm⁴)
  Wply: 2360e3,     // mm³   (2 360 cm³)
  h: 533.1, b: 209.3, tw: 10.1, tf: 15.6, r: 12.7, d: 476.5, // mm
};

// ── Belastinggevallen ────────────────────────────────────────────────────
export const GEVAL_G = 1;   // permanent
export const GEVAL_Q = 2;   // veranderlijk

// ── Combinatiefactoren (Britse NB, uitsluitend 6.10b) ────────────────────
export const XI_GAMMA_G = 0.925 * 1.35;   // = 1,24875
export const GAMMA_Q = 1.5;

export const L_MM = 6500;

/**
 * De volledige modeltoestand zoals de store hem bewaart. Eenheden van de
 * store: geometrie in mm, krachten in kN, lijnlasten in kN/m.
 */
export function bouwModelR13() {
  return {
    nodes: [
      { id: 1, x: 0,     z: 0 },   // scharnieroplegging
      { id: 2, x: L_MM,  z: 0 },   // roloplegging (verticaal gesteund)
    ],
    beams: [
      {
        id: 1, from: 1, to: 2,
        material: BRON_DOORSNEDE.materiaal,
        profile: BRON_DOORSNEDE.naam,
        // Over de volle lengte zijdelings gesteund → geen kip. Dat leggen we
        // vast als een dichte reeks kipsteunen; de doorbuigingsklasse is
        // "custom" met noemer 360 omdat de Britse NB L/360 voorschrijft.
        checkConfig: {
          lateralRestraints: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
          deflectionClass: "custom",
          deflectionLimitNumerator: 360,
        },
        loadRole: "vloer",
      },
    ],
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: 2, type: "zRoller" },
    ],
    plates: [],
    loads: [
      // Permanent: lijnlast incl. eigen gewicht + puntlast in het midden.
      { id: 1, type: "lineLoad",   caseId: GEVAL_G, beamId: 1, q: -15 },
      { id: 2, type: "pointForce", caseId: GEVAL_G, beamId: 1, posFrac: 0.5, fz: -40 },
      // Veranderlijk: lijnlast + puntlast in het midden.
      { id: 3, type: "lineLoad",   caseId: GEVAL_Q, beamId: 1, q: -30 },
      { id: 4, type: "pointForce", caseId: GEVAL_Q, beamId: 1, posFrac: 0.5, fz: -50 },
    ],
    loadCases: [
      { id: GEVAL_G, name: "G — permanent (g1 = 15 kN/m, G2 = 40 kN)", type: "dead" },
      { id: GEVAL_Q, name: "Q — veranderlijk (q1 = 30 kN/m, Q2 = 50 kN)", type: "live" },
    ],
    activeLoadCaseId: GEVAL_G,
    selfWeightEnabled: false,   // eigen gewicht zit al in g1 = 15 kN/m
    nonlinearEnabled: false,
    combinations: [
      {
        id: 1,
        name: "UGT 6.10b",
        type: "uls",
        formula: "0,925·1,35·G + 1,50·Q",
        factors: { [GEVAL_G]: XI_GAMMA_G, [GEVAL_Q]: GAMMA_Q },
      },
      {
        id: 2,
        name: "BGT — alleen veranderlijk",
        type: "sls",
        formula: "1,0·Q",
        factors: { [GEVAL_G]: 0, [GEVAL_Q]: 1.0 },
      },
    ],
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
  };
}

/** Schrijf het model weg als projectbestand; geeft de geschreven paden terug. */
export function schrijfModelR13() {
  const hier = dirname(fileURLToPath(import.meta.url));
  const tekst = serializeProject(bouwModelR13());
  const paden = [join(hier, "R13.femp"), join(hier, "R13.ifcfem2d")];
  for (const p of paden) writeFileSync(p, tekst, "utf8");
  return paden;
}

// Rechtstreeks aangeroepen → alleen het bestand wegschrijven.
if (import.meta.url === `file://${process.argv[1]?.split("\\").join("/")}` ||
    process.argv[1]?.endsWith("model-R13.mjs")) {
  for (const p of schrijfModelR13()) process.stdout.write(`geschreven: ${p}\n`);
}
