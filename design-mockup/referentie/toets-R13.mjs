// R13 — narekening van de vrij opgelegde, kipvaste ligger 6,5 m met lijnlast
// en puntlast (533 × 210 × 92 UKB, S275), tegen de referentiewaarden uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md, geval R13.
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R13.mjs
//
// ── Wat dit script doet ─────────────────────────────────────────────────────
// 1. Het schrijft R13.femp (en dezelfde inhoud als R13.ifcfem2d, de extensie
//    die de bestandsdialoog van de app filtert) uit model-R13.mjs.
// 2. Het rekent het model door langs precies de route die de app zelf gebruikt:
//       bouwMultiInput  →  solveAllCases  →  combineResults
//    dus met de eenhedenconversie en de combinatiesuperpositie van de app.
// 3. Het draait onze EN 1993-1-1-toetsmodule (de Rust-kern) op het gevonden
//    krachtsverloop, via de stdio-sidecar `openaec-mcp-server`.
// 4. Het legt elke referentiewaarde uit het dossier naast onze uitkomst en
//    drukt de afwijking in procenten af.
//
// ── Eén aanname, expliciet ─────────────────────────────────────────────────
// Het profiel 533 × 210 × 92 UKB staat NIET in onze profieldatabase (414
// Europese profielen). Het dossier schrijft voor het dan "als aangepaste
// doorsnede met de opgegeven waarden" in te voeren; in de app is dat een
// EIGEN DOORSNEDE uit de profieleditor. Het model draagt hem in
// `eigenDoorsneden` en de staaf verwijst ernaar met `EIGEN:…`:
//   · voor de SOLVER : `resolveSection` leest A en I_y uit die doorsnede;
//   · voor de TOETSING: dezelfde grootheden gaan als
//     `custom_section.eigenschappen` mee (het inline-doorsnedepad D4.3).
// Er wordt dus met de brongrootheden gerekend, zonder terugval op een ander
// profiel. Tot september 2026 stond hier een terugval op HEA 160; die bestaat
// niet meer: een onbekende doorsnede stopt de berekening (basisaudit nr 4).
//
// LET OP bij het lezen van de toetsuitkomsten: op het inline-pad zijn A, Iy,
// Wpl,y én Av INVOER. Dat de toetsmodule Av = 5 723,6 mm² gebruikt, bewijst
// dus niets over onze Av-formule; wat het wél toetst zijn de classificatie
// (tabel 5.2), Vpl,Rd, Mc,Rd, de M-V-interactie (§6.2.8), de kipcontrole en de
// doorbuigingstoets. Ter informatie: onze eigen rolprofielcode
// (src-tauri/crates/section-properties/src/i_section.rs) berekent av_z met
// exact de §6.2.6(3)-uitdrukking A − 2·b·tf + (tw + 2r)·tf die de bron ook
// gebruikt; stond het profiel in de database, dan zou Av daar vandaan komen.
//
// ── Wat hier NIET getoetst wordt ───────────────────────────────────────────
// De lijfweerstand tegen dwarsbelasting (EN 1993-1-5 §6, F_Rd = 324 kN bij een
// oplegvlak van 50 mm) zit niet in onze toetsmodule. Alleen registreren, niet
// als afwijking scoren — zoals het dossier voorschrijft.

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { deserializeProject } = await import("../src/io/projectFile.ts");
// De eigen doorsnede in de opslag zetten — precies wat de app doet bij het
// openen van een project. Zonder deze stap kent `resolveSection` het profiel
// `EIGEN:…` niet en stopt de berekening met een melding.
const { importeer } = await import("../src/lib/profieleditor/eigenDoorsnedenStore.ts");
const {
  bouwModelR13, schrijfModelR13, BRON_DOORSNEDE, EIGEN_DOORSNEDE,
  GEVAL_G, GEVAL_Q, XI_GAMMA_G, GAMMA_Q, L_MM,
} = await import("./model-R13.mjs");

const log = (s = "") => process.stdout.write(s + "\n");
const hier = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(hier, "..", "..");

// ── Vergelijkingstabel ─────────────────────────────────────────────────────
// `soort` scheidt waar een regel vandaan komt:
//   "solver" — uit onze krachtsverdeling;
//   "toets"  — uit onze EN 1993-1-1-module;
//   "bron"   — nagerekend met de formule uit de norm op de brongegevens; dit
//              controleert de INTERNE CONSISTENTIE van de bron, niet onze app.
const rijen = [];

function vergelijk(naam, onze, referentie, tolPct, soort, eenheid = "") {
  const afw = referentie === 0 ? 0 : ((onze - referentie) / referentie) * 100;
  rijen.push({ naam, onze, referentie, afw, tolPct, soort, eenheid,
               ok: Number.isFinite(onze) && Math.abs(afw) <= tolPct });
}

const toon = (v, c = 2) => (Number.isFinite(v) ? v.toFixed(c).replace(".", ",") : "—");

// ═══════════════════════════════════════════════════════════════════════════
//  1. Model wegschrijven
// ═══════════════════════════════════════════════════════════════════════════
log("\n═══ R13 — vrij opgelegde ligger 6,5 m, lijnlast + puntlast, S275 ═══");
log("\n[1] Model wegschrijven");
const modelPaden = schrijfModelR13();
for (const p of modelPaden) log(`  · ${p}`);
// Terugleescontrole: het weggeschreven bestand moet exact het model bevatten
// dat hieronder wordt doorgerekend — anders levert dit script een bestand op
// dat iets ánders is dan wat het verifieert.
{
  const terug = deserializeProject(readFileSync(modelPaden[0], "utf8"));
  const gelijk =
    terug.nodes.length === 2 && terug.beams.length === 1 && terug.loads.length === 4 &&
    terug.supports.length === 2 && terug.selfWeightEnabled === false &&
    terug.nodes[1].x === L_MM &&
    terug.loads.every((l, i) => {
      const o = bouwModelR13().loads[i];
      return l.type === o.type && l.caseId === o.caseId &&
             (l.q ?? null) === (o.q ?? null) && (l.fz ?? null) === (o.fz ?? null) &&
             (l.posFrac ?? null) === (o.posFrac ?? null);
    }) &&
    (terug.combinations?.length ?? 0) === 2;
  log(`  · terugleescontrole: ${gelijk ? "bestand = doorgerekend model" : "AFWIJKING — niet vertrouwen!"}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. Doorrekenen langs de app-route
// ═══════════════════════════════════════════════════════════════════════════
importeer([EIGEN_DOORSNEDE]);
const model = bouwModelR13();

const UGT = { id: 1, name: "UGT 6.10b", type: "uls", formula: "0,925·1,35·G + 1,5·Q",
              factors: new Map([[GEVAL_G, XI_GAMMA_G], [GEVAL_Q, GAMMA_Q]]) };
const BGT = { id: 2, name: "BGT (alleen veranderlijk)", type: "sls", formula: "1,0·Q",
              factors: new Map([[GEVAL_G, 0], [GEVAL_Q, 1.0]]) };

/** Reken het model door, precies zoals de app een geopend bestand doorrekent. */
function rekenDoor() {
  const mi = bouwMultiInput(model);
  const perCase = solveAllCases(mi).perCase;
  return { doorsnede: mi.beams[0], ugt: combineResults(UGT, perCase), bgt: combineResults(BGT, perCase) };
}

log("\n[2] Doorrekenen langs de app-route");
const bronRoute = rekenDoor();

log(`  · doorsnede uit de eigen-doorsnedenopslag: A = ${toon(bronRoute.doorsnede.A, 0)} mm², ` +
    `Iy = ${toon(bronRoute.doorsnede.I / 1e4, 0)} cm⁴  (533 × 210 × 92 UKB)`);
// Dit is de controle die telt: de app rekent met de grootheden van de bron.
const A_ok = Math.abs(bronRoute.doorsnede.A - BRON_DOORSNEDE.A) < 1e-6;
const I_ok = Math.abs(bronRoute.doorsnede.I - BRON_DOORSNEDE.Iy) < 1e-6;
log(`  · gelijk aan de bron: A ${A_ok ? "ja" : "NEE"} · Iy ${I_ok ? "ja" : "NEE"}`);

const ef = bronRoute.ugt.elements.get(1);
const efBgt = bronRoute.bgt.elements.get(1);
const maxAbs = (arr) => arr.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);

// De adapter splitst de staaf op de lastpositie; er liggen dus twee stations
// op x = L/2. M is daar continu, V springt — het EERSTE van de twee is de
// dwarskracht net vóór de puntlast, precies wat de bron "Vc,Ed" noemt.
const iMid = ef.stations_mm.findIndex((x) => Math.abs(x - L_MM / 2) < 1e-6);
const M_Ed_kNm = ef.bendingMoment[iMid] / 1e6;
const V_Ed_kN  = Math.abs(ef.shearForce[0]) / 1000;
const Vc_Ed_kN = Math.abs(ef.shearForce[iMid]) / 1000;
const R_A_kN = (bronRoute.ugt.reactions.get(1)?.fz ?? NaN) / 1000;
const R_B_kN = (bronRoute.ugt.reactions.get(2)?.fz ?? NaN) / 1000;

// BGT-doorbuiging: ALLEEN de veranderlijke belastingen (Britse NB).
const w_bgt_mm = maxAbs(efBgt.deflection);            // teken: negatief = omlaag
const w_lim_mm = L_MM / model.beams[0].checkConfig.deflectionLimitNumerator;

// ═══════════════════════════════════════════════════════════════════════════
//  3. Doorsnedegrootheden — de norm toegepast op de brongegevens
//     [bron-consistentie], NIET onze toetsmodule.
// ═══════════════════════════════════════════════════════════════════════════
const { A, Wply, fy, b, tw, tf, r } = BRON_DOORSNEDE;
const gammaM0 = 1.0;                                     // Britse NB: γ_M0 = 1,0
const Av = A - 2 * b * tf + (tw + 2 * r) * tf;           // §6.2.6(3), gewalst I
const Vpl_Rd_bron_kN = (Av * fy / Math.sqrt(3)) / gammaM0 / 1000;
const Mc_Rd_bron_kNm = (Wply * fy / gammaM0) / 1e6;

// ═══════════════════════════════════════════════════════════════════════════
//  4. Onze EN 1993-1-1-toetsmodule draaien (Rust-kern via de stdio-sidecar)
// ═══════════════════════════════════════════════════════════════════════════
function zoekSidecar() {
  for (const smaak of ["release", "debug"]) {
    const p = join(repoRoot, "src-tauri", "target", smaak, "openaec-mcp-server.exe");
    if (existsSync(p)) return p;
    const q = join(repoRoot, "src-tauri", "target", smaak, "openaec-mcp-server");
    if (existsSync(q)) return q;
  }
  return null;
}

/** Eén JSON-RPC-tool-aanroep op de sidecar; geeft het resultaatobject terug. */
function roepToetsmodule(exe, invoer) {
  return new Promise((res, rej) => {
    const p = spawn(exe, { stdio: ["pipe", "pipe", "pipe"] });
    let buf = "", klaar = false;
    const stop = () => { if (!klaar) { klaar = true; try { p.stdin.end(); p.kill(); } catch {} } };
    p.on("error", rej);
    p.stderr.on("data", () => { /* tracing van de server; hoort niet in de uitvoer */ });
    p.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const regel = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!regel.trim()) continue;
        let bericht; try { bericht = JSON.parse(regel); } catch { continue; }
        if (bericht.id === 2) {
          stop();
          if (bericht.result?.isError) rej(new Error(bericht.result.content?.[0]?.text ?? "toetsfout"));
          else res(bericht.result?.structuredContent ?? null);
        }
      }
    });
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {},
                clientInfo: { name: "referentie-R13", version: "1" } } }) + "\n");
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "check_steel_beam", arguments: invoer } }) + "\n");
    setTimeout(() => { stop(); rej(new Error("time-out op de toetsmodule")); }, 30000);
  });
}

/** Alle 42 stations van de UGT-combinatie als krachtsenvelop voor de kern. */
function envelop() {
  const punten = [];
  for (let i = 0; i < ef.stations_mm.length; i++) {
    punten.push({
      combination_id: 1,
      position_mm: ef.stations_mm[i],
      forces: {
        n_ed: ef.normalForce[i] / 1000,          // kN
        vy_ed: 0,
        vz_ed: ef.shearForce[i] / 1000,          // kN
        mt_ed: 0,
        my_ed: ef.bendingMoment[i] / 1e6,        // kNm, doorhangen positief
        mz_ed: 0,
      },
    });
  }
  return punten;
}

const cfg = model.beams[0].checkConfig;
const toetsInvoer = {
  beam_id: 1,
  profile_name: BRON_DOORSNEDE.naam,
  steel_grade: BRON_DOORSNEDE.materiaal,
  length_m: L_MM / 1000,
  forces_envelope: envelop(),
  lateral_bracing: { top_flange_positions: cfg.lateralRestraints, bottom_flange_positions: [] },
  buckling_length_y_m: L_MM / 1000,
  buckling_length_z_m: L_MM / 1000,
  deflection_limit_class: "Custom",
  deflection_limit_numerator: cfg.deflectionLimitNumerator,
  deflection_actual_max_mm: w_bgt_mm,
  is_cantilever: false,
  consequence_class: "CC1",
  pre_camber_mm: 0,
  deflection_permanent_mm: 0,
  // Equivalente gelijkmatig verdeelde last in het kipveld (N/mm) en
  // lastaangrijping op de bovenflens — beide alleen van belang voor kip, dat
  // hier door de kipsteunen niet maatgevend is.
  q_equiv_n_per_mm: XI_GAMMA_G * 15 + GAMMA_Q * 30,
  z_a_mm: BRON_DOORSNEDE.h / 2,
  custom_section: {
    naam: BRON_DOORSNEDE.naam,
    lamellen: [],
    gesloten_cellen: [],
    // Catalogusprofiel één-op-één inline (pad D4.3). Iz/Wel,z/It/Iw zijn hier
    // niet uit de bron bekend; ze spelen in dit geval geen rol (geen
    // normaalkracht, geen kip door de kipsteunen) en zijn met de gangbare
    // catalogustabel voor dit profiel ingevuld. Zie de toelichting in de kop.
    eigenschappen: {
      area_mm2: A, iy_mm4: BRON_DOORSNEDE.Iy, iz_mm4: 2201e4,
      wel_y_mm3: 2 * BRON_DOORSNEDE.Iy / BRON_DOORSNEDE.h, wel_z_mm3: 2103e2,
      wpl_y_mm3: Wply, wpl_z_mm3: 3286e2,
      av_y_mm2: 2 * b * tf, av_z_mm2: Av,
      it_mm4: 758e3, iw_mm6: 1.6e12,
      iy_radius_mm: Math.sqrt(BRON_DOORSNEDE.Iy / A), iz_radius_mm: Math.sqrt(2201e4 / A),
      h_mm: BRON_DOORSNEDE.h, b_mm: b, tw_mm: tw, tf_mm: tf, r_mm: r,
    },
    vorm: "GelasteIDubbelsymmetrisch",
  },
};

log("\n[3] EN 1993-1-1-toetsmodule (Rust-kern via de stdio-sidecar)");
const exe = zoekSidecar();
let toets = null;
if (!exe) {
  log("  ! openaec-mcp-server niet gevonden — de toetsregels worden overgeslagen.");
  log("    Bouwen met:  cd src-tauri && cargo build -p openaec-mcp-server");
} else {
  log(`  · sidecar: ${exe}`);
  try {
    toets = await roepToetsmodule(exe, toetsInvoer);
    log(`  · doorsnedeklasse: ${toets.classification} · maatgevende toets: ` +
        `${toets.governing_check_id} · UC_max = ${toon(toets.uc_max, 3)} · ${toets.status}`);
  } catch (e) {
    log(`  ! toetsmodule gaf een fout: ${e.message}`);
  }
}

const toetsUc = (id) => {
  const c = toets?.checks?.find((x) => x.kind.data.id === id);
  return c ? c.kind.data.uc : null;
};

// ═══════════════════════════════════════════════════════════════════════════
//  5. Vergelijking met het dossier
// ═══════════════════════════════════════════════════════════════════════════
// Toleranties: de bron is een uitgewerkt rekenvoorbeeld dat op 3–4 cijfers
// afrondt → 1 % (dossier §1.5). Unity checks staan in de bron op 2 decimalen;
// het dossier hanteert daar 0,02 absoluut, hier omgerekend naar procenten.
vergelijk("M_Ed in het midden",        M_Ed_kNm,        539.5, 1.0, "solver", "kN·m");
vergelijk("V_Ed bij de oplegging",     V_Ed_kN,         269.5, 1.0, "solver", "kN");
vergelijk("V_c,Ed bij max. moment",    Vc_Ed_kN,         62.5, 1.0, "solver", "kN");
vergelijk("Oplegreactie A",            R_A_kN,          269.5, 1.0, "solver", "kN");
vergelijk("Oplegreactie B",            R_B_kN,          269.5, 1.0, "solver", "kN");
vergelijk("BGT-doorbuiging w",         Math.abs(w_bgt_mm), 8.5, 1.0, "solver", "mm");
vergelijk("Grenswaarde w_lim = L/360", w_lim_mm,         18.1, 1.0, "solver", "mm");

const ucV = toetsUc("6.2.6_shear_z");
const ucM = toetsUc("6.2.5_bending_y");
const ucMV = toetsUc("6.2.8_combined_mv");
const ucW = toetsUc("deflection_w_fin");
vergelijk("Vpl,Rd (toetsmodule)",      ucV?.rd,           909, 1.0, "toets", "kN");
vergelijk("UC dwarskracht",            ucV?.uc,          0.30, 6.7, "toets", "—");
vergelijk("Mc,Rd = Mpl,Rd (module)",   ucM?.rd,         649.0, 1.0, "toets", "kN·m");
vergelijk("UC buiging",                ucM?.uc,          0.83, 2.4, "toets", "—");
vergelijk("M+V (§6.2.8) → Mc,Rd",      ucMV?.rd,        649.0, 1.0, "toets", "kN·m");
vergelijk("w_lim in de toetsmodule",   ucW?.rd,          18.1, 1.0, "toets", "mm");

vergelijk("Av (§6.2.6(3))",            Av,             5723.6, 1.0, "bron", "mm²");
vergelijk("Vpl,Rd (§6.2.6(2))",        Vpl_Rd_bron_kN,    909, 1.0, "bron", "kN");
vergelijk("Mc,Rd (§6.2.5)",            Mc_Rd_bron_kNm,  649.0, 1.0, "bron", "kN·m");
vergelijk("0,5·Vpl,Rd (§6.2.8)",       0.5 * Vpl_Rd_bron_kN, 454.5, 1.0, "bron", "kN");

// ── Afdrukken ──────────────────────────────────────────────────────────────
const HERKOMST = { solver: "solver", toets: "toetsmodule", bron: "bron-consistentie" };
log("\n[4] Vergelijking met de referentiewaarden uit het dossier");
log("");
log("  " + "grootheid".padEnd(28) + "referentie".padStart(13) + "onze waarde".padStart(14) +
    "Δ %".padStart(9) + "  herkomst".padEnd(20) + " status");
log("  " + "─".repeat(94));
for (const r of rijen) {
  const c = Math.abs(r.referentie) < 10 ? 3 : (Math.abs(r.referentie) < 1000 ? 2 : 1);
  log("  " + r.naam.padEnd(28) +
      (toon(r.referentie, c) + " " + r.eenheid).padStart(13) +
      (toon(r.onze, c) + " " + r.eenheid).padStart(14) +
      toon(r.afw, 2).padStart(9) +
      "  " + HERKOMST[r.soort].padEnd(20) +
      (r.onze === null || r.onze === undefined ? " overgeslagen"
        : r.ok ? " binnen tolerantie" : ` BUITEN tolerantie (${toon(r.tolPct, 1)} %)`));
}

// ── Grootheden die we NIET vergelijken ─────────────────────────────────────
log("\n[5] Niet vergeleken — met reden");
const mvNotitie = toets?.checks?.find((c) => c.kind.data.id === "6.2.8_combined_mv")?.kind.data.notes ?? [];
log("  · Momentreductie door dwarskracht (§6.2.8). De bron: niet nodig, want");
log(`    0,5·Vpl,Rd = ${toon(0.5 * Vpl_Rd_bron_kN, 1)} kN > V_c,Ed = ${toon(Vc_Ed_kN, 1)} kN.`);
log("    Onze toetsmodule zegt: " + (mvNotitie[0] ?? "(module niet gedraaid)"));
log("  · Lijfweerstand tegen dwarsbelasting F_Rd = 324 kN bij F_Ed = 269,5 kN");
log("    (EN 1993-1-5 §6, oplegvlak 50 mm): niet in onze toetsmodule.");
log("    Alleen geregistreerd, niet als afwijking gescoord.");

// ── Hoe de ontbrekende doorsnede is opgelost ───────────────────────────────
log("\n[6] De doorsnede ontbreekt in de bibliotheek");
log("  533 × 210 × 92 UKB staat niet in de profieldatabase. Het bestand draagt");
log("  hem daarom als eigen doorsnede (`EIGEN:533x210x92 UKB`), met de");
log("  grootheden uit de bron — wat het dossier ook voorschrijft.");
log(`    A  = ${toon(bronRoute.doorsnede.A, 0)} mm²  (bron ${toon(BRON_DOORSNEDE.A, 0)})`);
log(`    Iy = ${toon(bronRoute.doorsnede.I / 1e4, 0)} cm⁴  (bron ${toon(BRON_DOORSNEDE.Iy / 1e4, 0)})`);
log("  Een onbekende doorsnede valt niet meer stil terug op een ander profiel;");
log("  de berekening stopt dan met een melding (basisaudit nr 4).");

// ── Eindoordeel ────────────────────────────────────────────────────────────
const onsEigen = rijen.filter((r) => r.soort !== "bron" && Number.isFinite(r.onze));
const buiten = onsEigen.filter((r) => !r.ok);
const grootste = onsEigen.reduce((m, r) => Math.max(m, Math.abs(r.afw)), 0);
log("\n[7] Samenvatting");
log(`  Vergeleken grootheden uit onze app : ${onsEigen.length} van ${rijen.filter(r => r.soort !== "bron").length}`);
log(`  Grootste afwijking                 : ${toon(grootste, 3)} %`);
log(`  Buiten tolerantie                  : ${buiten.length}`);
for (const r of buiten) log(`    ! ${r.naam}: Δ = ${toon(r.afw, 3)} %`);

writeFileSync(
  join(hier, "R13-resultaat.json"),
  JSON.stringify({
    kenmerk: "R13",
    gedraaid: new Date().toISOString(),
    aanname: "doorsnede 533x210x92 UKB ontbreekt in de profieldatabase; ingevoerd als eigen doorsnede met A/Iy/Wpl,y/Av uit de bron",
    doorsnedeklasse: toets?.classification ?? null,
    maatgevendeToets: toets?.governing_check_id ?? null,
    ucMax: toets?.uc_max ?? null,
    grootsteAfwijkingPct: grootste,
    rijen: rijen.map((r) => ({
      grootheid: r.naam, eenheid: r.eenheid, referentie: r.referentie, onze: r.onze,
      afwijkingPct: r.afw, tolerantiePct: r.tolPct, herkomst: r.soort, binnenTolerantie: r.ok,
    })),
  }, null, 2),
  "utf8",
);

process.exit(buiten.length > 0 ? 1 : 0);
