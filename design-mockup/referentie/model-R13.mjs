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
/**
 * Het profiel staat niet in de catalogus (414 Europese profielen). De bron
 * schrijft voor het dan "als aangepaste doorsnede met de opgegeven waarden"
 * in te voeren; in de app is dat een eigen doorsnede uit de profieleditor.
 * Zo rekent de app met precies de grootheden van de bron, in plaats van te
 * moeten terugvallen op een ander profiel.
 *
 * Iz, W_el,z, W_pl,z, I_t en I_w staan niet in de bron; ze spelen in dit
 * geval geen rol (geen normaalkracht, en kip is door de kipsteunen niet
 * maatgevend) en komen uit de gangbare catalogustabel voor dit profiel.
 */
export const EIGEN_NAAM = BRON_DOORSNEDE.naam;
export const EIGEN_PROFIEL = `EIGEN:${EIGEN_NAAM}`;
const IZ_MM4 = 2201e4;
export const EIGEN_DOORSNEDE = {
  id: "r13-533x210x92-ukb",
  naam: EIGEN_NAAM,
  ontwerp: { soort: "samenstelling", lamellen: [], catalogusdelen: [], celMeenemen: false, lassen: [] },
  eigenschappen: {
    area_mm2: BRON_DOORSNEDE.A,
    iy_mm4: BRON_DOORSNEDE.Iy,
    iz_mm4: IZ_MM4,
    wel_y_mm3: (2 * BRON_DOORSNEDE.Iy) / BRON_DOORSNEDE.h,
    wel_z_mm3: 2103e2,
    wpl_y_mm3: BRON_DOORSNEDE.Wply,
    wpl_z_mm3: 3286e2,
    av_y_mm2: 2 * BRON_DOORSNEDE.b * BRON_DOORSNEDE.tf,
    // A_v,z volgens 6.2.6(3)a: A − 2·b·t_f + (t_w + 2r)·t_f.
    av_z_mm2:
      BRON_DOORSNEDE.A -
      2 * BRON_DOORSNEDE.b * BRON_DOORSNEDE.tf +
      (BRON_DOORSNEDE.tw + 2 * BRON_DOORSNEDE.r) * BRON_DOORSNEDE.tf,
    it_mm4: 758e3,
    iw_mm6: 1.6e12,
    iy_radius_mm: Math.sqrt(BRON_DOORSNEDE.Iy / BRON_DOORSNEDE.A),
    iz_radius_mm: Math.sqrt(IZ_MM4 / BRON_DOORSNEDE.A),
    h_mm: BRON_DOORSNEDE.h, b_mm: BRON_DOORSNEDE.b,
    tw_mm: BRON_DOORSNEDE.tw, tf_mm: BRON_DOORSNEDE.tf, r_mm: BRON_DOORSNEDE.r,
  },
  vorm: "GelasteIDubbelsymmetrisch",
  motor: {
    methode: "lamellen", wpl_bepaald: false, iw_bepaald: false,
    schuifmiddelpunt_bepaald: false, it_onzekerheid: 0, a_gaten_mm2: 0,
    y_min_mm: -BRON_DOORSNEDE.b / 2, y_max_mm: BRON_DOORSNEDE.b / 2,
    z_min_mm: -BRON_DOORSNEDE.h / 2, z_max_mm: BRON_DOORSNEDE.h / 2,
    delen: [], meldingen: [],
  },
};

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
        profile: EIGEN_PROFIEL,
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
    eigenDoorsneden: [EIGEN_DOORSNEDE],
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
