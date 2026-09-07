#!/usr/bin/env node
/**
 * meet-oplossers.mjs — rekentijd tegen aantal vrijheidsgraden.
 *
 * Levert de meting die besluit B3 van
 * `docs/superpowers/plans/2026-09-07-beton-mnkappa-en-fysisch-nietlineaire-tweede-orde.md`
 * eist: de waarschuwingsdrempel voor "het model wordt te groot" moet GEMETEN
 * zijn, niet geraden.
 *
 * WAT ER GEMETEN WORDT
 *
 *  1. `stelsel`   — de kale oplostijd van K·u = F op één en dezelfde matrix,
 *                   voor drie vormen:
 *                     gauss    dichte Gauss-eliminatie met partiële pivotering
 *                     skyline  LDLᵀ over de variabele envelop
 *                     band     LDLᵀ over een VASTE band ter breedte b_max —
 *                              dezelfde code als skyline, andere envelop, zodat
 *                              het verschil tussen band en skyline een echte
 *                              tijdmeting is en geen schatting.
 *                   Daarnaast de structuurmaten van de matrix (b_max, gemiddelde
 *                   profielhoogte) en de relatieve asymmetrie.
 *
 *  2. `keten`     — de tijd van de hele analyse via `solveAllCases`, dus wat de
 *                   gebruiker werkelijk afwacht: opbouw + oplossing +
 *                   nabewerking. Alleen voor de twee oplossers die in de app
 *                   te kiezen zijn.
 *
 * HET MODEL
 *
 * Een raamwerk van `bays` × `storeys` met kolommen van 3,5 m en liggers van
 * 6,0 m, waarvan elke staaf in segmenten van `Ls` millimeter geknipt is —
 * precies de vertienvoudiging die de fysisch niet-lineaire tweede orde
 * meebrengt. `Ls` loopt af, het aantal vrijheidsgraden loopt op.
 *
 * TWEE KNOOPNUMMERINGEN, want dat bepaalt de bandbreedte:
 *
 *   aaneengesloten  de segmentknopen staan tussen de knoopknopen in, zoals een
 *                   met de hand netjes genummerd model.
 *   toegevoegd      eerst alle knoopknopen, daarna per staaf de segmentknopen
 *                   erachteraan. Dit is wat `Mesh.addNode` doet wanneer een
 *                   bestaand model achteraf wordt opgeknipt — de te verwachten
 *                   praktijk.
 *
 * GEBRUIK
 *   node node_modules/tsx/dist/cli.mjs scripts/meet-oplossers.mjs [opties]
 *
 *   --max-dofs=<n>   sla modellen groter dan n over (standaard 12000)
 *   --dicht-tot=<n>  meet de dichte oplosser alleen tot n vrijheidsgraden
 *                    (standaard 5000; daarboven duurt hij minuten)
 *   --band-tot=<n>   meet de vaste band alleen tot n vrijheidsgraden
 *                    (standaard 5000; b_max groeit hier mee met het model,
 *                    dus de vaste band wordt vanzelf net zo traag als dicht)
 *   --keten          meet ook de volledige analyseketen via solveAllCases
 *   --herhaal=<n>    aantal metingen per punt, laagste telt (standaard 1)
 */

import { Matrix } from "../src/core/math/Matrix.ts";
import { solveLinearSystem as solveGauss } from "../src/core/math/GaussElimination.ts";
import { solveSkyline, solveWithProfile, analyzeMatrix } from "../src/core/math/SkylineSolver.ts";
import { Mesh } from "../src/core/fem/Mesh.ts";
import { assembleGlobalStiffnessMatrix, getConstrainedDofs } from "../src/core/solver/Assembler.ts";

// ── Argumenten ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getal = (naam, standaard) => {
  const a = args.find((x) => x.startsWith(`--${naam}=`));
  return a ? Number(a.slice(naam.length + 3)) : standaard;
};
const MAX_DOFS = getal("max-dofs", 12000);
const DICHT_TOT = getal("dicht-tot", 5000);
const BAND_TOT = getal("band-tot", 5000);
const HERHAAL = getal("herhaal", 1);
const METEN_KETEN = args.includes("--keten");

// ── Modelopbouw ────────────────────────────────────────────────────────────
const KOLOM_H = 3500; // mm
const LIGGER_L = 6000; // mm
const E = 210000; // N/mm²
const A_SEC = 3880; // mm²  (HEA 160)
const I_SEC = 1.673e7; // mm⁴

/**
 * Bouwt het raamwerk als knopen + staven in mm, met `nSeg` segmenten per staaf.
 * `volgorde` bepaalt de knoopnummering: "aaneengesloten" of "toegevoegd".
 */
function bouwRaamwerk(bays, storeys, nSeg, volgorde) {
  const knopen = [];
  const staven = [];
  const idVan = new Map(); // "x,z" → knoop-id
  let volgend = 1;

  const knoop = (x, z) => {
    const sleutel = `${Math.round(x)},${Math.round(z)}`;
    let id = idVan.get(sleutel);
    if (id === undefined) {
      id = volgend++;
      idVan.set(sleutel, id);
      knopen.push({ id, x, z });
    }
    return id;
  };

  // Alle stramienknopen (kolomvoeten, verdiepingsknopen).
  const stramien = [];
  for (let i = 0; i <= bays; i++) {
    for (let v = 0; v <= storeys; v++) {
      stramien.push([i * LIGGER_L, v * KOLOM_H]);
    }
  }

  // Bij "toegevoegd" krijgen de stramienknopen eerst hun nummer; bij
  // "aaneengesloten" gebeurt dat vanzelf in de volgorde van de staven.
  if (volgorde === "toegevoegd") for (const [x, z] of stramien) knoop(x, z);

  let staafId = 1;
  const staaf = (x0, z0, x1, z1) => {
    let vorig = knoop(x0, z0);
    for (let s = 1; s <= nSeg; s++) {
      const t = s / nSeg;
      const id = knoop(x0 + t * (x1 - x0), z0 + t * (z1 - z0));
      staven.push({ id: staafId++, from: vorig, to: id, E, A: A_SEC, I: I_SEC });
      vorig = id;
    }
  };

  // Kolommen.
  for (let i = 0; i <= bays; i++) {
    for (let v = 0; v < storeys; v++) {
      staaf(i * LIGGER_L, v * KOLOM_H, i * LIGGER_L, (v + 1) * KOLOM_H);
    }
  }
  // Liggers.
  for (let v = 1; v <= storeys; v++) {
    for (let i = 0; i < bays; i++) {
      staaf(i * LIGGER_L, v * KOLOM_H, (i + 1) * LIGGER_L, v * KOLOM_H);
    }
  }

  const opleggingen = [];
  for (let i = 0; i <= bays; i++) opleggingen.push({ nodeId: knoop(i * LIGGER_L, 0), type: "fixed" });

  return { knopen, staven, opleggingen };
}

/** Zet het raamwerk om in een `Mesh` met dezelfde knoopvolgorde. */
function bouwMesh(model) {
  const mesh = new Mesh();
  const mat = mesh.addMaterial({ name: "S235", E: E * 1e6, nu: 0.3, density: 7850 });
  const meshIdVan = new Map();
  for (const n of model.knopen) {
    const mn = mesh.addNode(n.x / 1000, n.z / 1000);
    meshIdVan.set(n.id, mn.id);
  }
  const sectie = { A: A_SEC / 1e6, I: I_SEC / 1e12, h: 0.152 };
  for (const b of model.staven) {
    mesh.addBeamElement([meshIdVan.get(b.from), meshIdVan.get(b.to)], mat.id, { ...sectie });
  }
  for (const o of model.opleggingen) {
    const knoop = mesh.getNode(meshIdVan.get(o.nodeId));
    knoop.constraints = { x: true, y: true, rotation: true };
  }
  return mesh;
}

/** Stijfheidsmatrix mét penalty-randvoorwaarden, precies zoals de solver hem ziet. */
function bouwStelsel(mesh) {
  const K = assembleGlobalStiffnessMatrix(mesh, "frame");
  const { dofs } = getConstrainedDofs(mesh, "frame");
  const n = K.rows;
  const F = new Array(n).fill(0);
  // Horizontale eenheidslast op elke vrije knoop — een rechterlid dat elke
  // vrijheidsgraad aanspreekt, zodat de terugsubstitutie niet stiekem
  // grotendeels op nullen loopt.
  for (let i = 0; i < n; i += 3) F[i] = 1000;
  const penalty = 1e20;
  for (const d of dofs) {
    K.set(d, d, K.get(d, d) + penalty);
    F[d] = 0;
  }
  return { K, F };
}

function meet(fn) {
  let beste = Infinity;
  let uitkomst = null;
  for (let r = 0; r < HERHAAL; r++) {
    const t0 = performance.now();
    uitkomst = fn();
    const dt = performance.now() - t0;
    if (dt < beste) beste = dt;
  }
  return { ms: beste, uitkomst };
}

function maxAfwijking(a, b) {
  let afw = 0;
  let schaal = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > afw) afw = d;
    const m = Math.abs(a[i]);
    if (m > schaal) schaal = m;
  }
  return schaal > 0 ? afw / schaal : afw;
}

// ── Meetreeks ──────────────────────────────────────────────────────────────
// (bays, storeys, nSeg) → oplopend aantal vrijheidsgraden.
const REEKS = [
  [1, 1, 1],
  [2, 2, 1],
  [2, 2, 2],
  [3, 3, 2],
  [3, 3, 4],
  [3, 3, 7],
  [3, 3, 12],
  [3, 3, 20],
  [3, 3, 32],
  [3, 3, 50],
  [3, 3, 80],
  [3, 3, 125],
  [3, 3, 200],
  [3, 3, 320],
  [3, 3, 500],
];

const regels = [];

// De markdown-regel wordt METEEN geschreven, niet aan het eind. De grootste
// modellen kunnen op een geheugengrens stuklopen; dan is alles wat daarvóór
// gemeten is nog steeds bruikbaar.
console.log("| nummering | segm./staaf | elementen | DOF | dichte K (MB) | b_max | h_gem | Gauss (ms) | band (ms) | skyline (ms) |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");

for (const volgorde of ["aaneengesloten", "toegevoegd"]) {
  for (const [bays, storeys, nSeg] of REEKS) {
    const model = bouwRaamwerk(bays, storeys, nSeg, volgorde);
    const nDofs = model.knopen.length * 3;
    if (nDofs > MAX_DOFS) continue;

    const voorspeldMB = (nDofs * nDofs * 8) / 1024 / 1024;
    let mesh, stelsel;
    try {
      mesh = bouwMesh(model);
      stelsel = bouwStelsel(mesh);
    } catch (e) {
      console.log(
        `| ${volgorde} | ${nSeg} | ${model.staven.length} | ${nDofs} | ${voorspeldMB.toFixed(0)} | ` +
          `— | — | opbouw mislukt: ${e.message} | — | — |`,
      );
      continue;
    }
    const { K, F } = stelsel;
    const profiel = analyzeMatrix(K);
    const bMax = profiel.halfBandwidth;
    const vasteBand = new Int32Array(K.rows);
    for (let i = 0; i < K.rows; i++) vasteBand[i] = Math.max(0, i - bMax);

    const rij = {
      volgorde,
      nSeg,
      nDofs,
      elementen: model.staven.length,
      bMax,
      hGem: profiel.meanHeight,
      relAsym: profiel.relAsymmetry,
      geheugenMB: (K.rows * K.rows * 8) / 1024 / 1024,
    };

    const sky = meet(() => solveSkyline(K, F));
    rij.skylineMs = sky.ms;

    let band = null;
    if (nDofs <= BAND_TOT) {
      band = meet(() => solveWithProfile(K, F, vasteBand));
      rij.bandMs = band.ms;
    }

    if (nDofs <= DICHT_TOT) {
      const g = meet(() => solveGauss(K, F));
      rij.gaussMs = g.ms;
      rij.afwSkyline = maxAfwijking(g.uitkomst, sky.uitkomst);
      if (band) rij.afwBand = maxAfwijking(g.uitkomst, band.uitkomst);
    }

    regels.push(rij);
    const f = (v, d = 1) => (v === undefined ? "n.v.t." : v.toFixed(d));
    console.log(
      `| ${rij.volgorde} | ${rij.nSeg} | ${rij.elementen} | ${rij.nDofs} | ${rij.geheugenMB.toFixed(1)} | ` +
        `${rij.bMax} | ${rij.hGem.toFixed(1)} | ${f(rij.gaussMs)} | ${f(rij.bandMs)} | ${f(rij.skylineMs)} |`,
    );
  }
}

console.log("");
console.log("Afwijking t.o.v. de dichte oplosser (relatief t.o.v. max|u|):");
for (const r of regels) {
  if (r.afwSkyline === undefined) continue;
  console.log(
    `  ${r.volgorde.padEnd(15)} dofs=${String(r.nDofs).padStart(6)} ` +
      `skyline=${r.afwSkyline.toExponential(3)}  ` +
      `band=${r.afwBand === undefined ? "n.v.t." : r.afwBand.toExponential(3)}  ` +
      `rel.asym K=${r.relAsym.toExponential(3)}`,
  );
}

// ── Volledige analyseketen ─────────────────────────────────────────────────
if (METEN_KETEN) {
  const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
  const { setLinearSolver, resetLinearSolverStats, getLinearSolverStats } = await import(
    "../src/core/math/LinearSolver.ts"
  );

  console.log("");
  console.log("| nummering | DOF | keten Gauss (ms) | waarvan stelsel | keten skyline (ms) | waarvan stelsel |");
  console.log("|---|---:|---:|---:|---:|---:|");

  for (const volgorde of ["aaneengesloten", "toegevoegd"]) {
    for (const [bays, storeys, nSeg] of REEKS) {
      const model = bouwRaamwerk(bays, storeys, nSeg, volgorde);
      const nDofs = model.knopen.length * 3;
      if (nDofs > Math.min(MAX_DOFS, DICHT_TOT)) continue;

      const invoer = {
        nodes: model.knopen,
        beams: model.staven,
        supports: model.opleggingen,
        loads: model.staven.map((b) => ({ beamId: b.id, q: -10, caseId: 1 })),
        pointLoads: model.knopen
          .filter((n) => n.z > 0)
          .map((n) => ({ nodeId: n.id, fx: 100, caseId: 1 })),
        cases: [{ id: 1, name: "G" }],
      };

      const cel = {};
      for (const id of ["gauss", "skyline"]) {
        setLinearSolver(id);
        resetLinearSolverStats();
        const t0 = performance.now();
        solveAllCases(invoer);
        cel[id] = { totaal: performance.now() - t0, stelsel: getLinearSolverStats().totalMs };
      }
      setLinearSolver("gauss");
      console.log(
        `| ${volgorde} | ${nDofs} | ${cel.gauss.totaal.toFixed(1)} | ${cel.gauss.stelsel.toFixed(1)} | ` +
          `${cel.skyline.totaal.toFixed(1)} | ${cel.skyline.stelsel.toFixed(1)} |`,
      );
    }
  }
}
