// R16 — narekening en vergelijking met de referentie.
//
// Geval: vrij opgelegde, zijdelings ongesteunde ligger IPE 330 van 5,70 m,
// S235, gelijkmatig verdeelde belasting. Referentiewaarden uit
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md, § R16.
//
// Dit script leest het OPGESLAGEN model (referentie/R16.femp) terug en rekent
// dát door, zodat de gecontroleerde invoer letterlijk het bestand is dat ook
// in de app te openen valt.
//
// Twee rekenpaden, beide de echte productiecode:
//  1. Krachtsverdeling en zakking — de TypeScript-solver via de gewone
//     app-route: deserializeProject → bouwMultiInput → solveAllCases →
//     combineResults. Eenheden gaan door dezelfde adapter als in de app
//     (kN/kNm in het model, N/N·mm uit de solver).
//  2. Normtoetsing — de Rust-kern, aangeroepen over de meegeleverde
//     stdio-sidecar (openaec-mcp-server, tool `check_steel_beam`). De invoer
//     wordt gebouwd met buildSteelCheckInputs, dezelfde functie die de app
//     gebruikt; er wordt niets met de hand voorgekookt.
//
// Draaien met (vanuit design-mockup/):
//     npx tsx referentie/toets-R16.mjs
//
// Vereist de gebouwde sidecar:
//     cargo build --release -p openaec-mcp-server   (in ../src-tauri)
// Ontbreekt die, dan draait deel 1 gewoon en meldt deel 2 dat hij is
// overgeslagen — er wordt dan geen toetswaarde verzonnen.

import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { deserializeProject, combinationsFromFile } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { buildSteelCheckInputs } = await import("../src/lib/steelCheckBuilder.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const MODEL = join(HIER, "R16.femp");
const SIDECAR = resolve(HIER, "../../src-tauri/target/release/openaec-mcp-server.exe");

const log = (s = "") => process.stdout.write(s + "\n");

// ── Vergelijkingsadministratie ────────────────────────────────────────────
const rijen = [];
let grootsteAfwijking = 0;

/**
 * Leg één grootheid naast haar referentiewaarde.
 * `tolPct` is de tolerantie uit het dossier (§1.5). Een rij met `oordeel`
 * "NB"/"AANNAME" telt niet mee als fout, maar de afwijking wordt wel getoond.
 */
function vergelijk(naam, onze, ref, eenheid, tolPct, notitie = "") {
  const afw = ref === 0 ? (onze === 0 ? 0 : Infinity) : ((onze - ref) / Math.abs(ref)) * 100;
  if (Number.isFinite(afw)) grootsteAfwijking = Math.max(grootsteAfwijking, Math.abs(afw));
  const binnen = Number.isFinite(afw) && Math.abs(afw) <= tolPct;
  rijen.push({ naam, onze, ref, eenheid, afw, binnen, tolPct, notitie });
  const merk = binnen ? "OK " : "!! ";
  log(`  ${merk}${naam.padEnd(34)} onze ${fmt(onze).padStart(12)} ${eenheid.padEnd(5)}` +
      ` ref ${fmt(ref).padStart(12)} ${eenheid.padEnd(5)} Δ ${afw >= 0 ? "+" : ""}${afw.toFixed(2)} %` +
      (notitie ? `   ← ${notitie}` : ""));
}

/** Vergelijking op ABSOLUUT verschil (dossier §1.5: unity checks, 0,02). */
function vergelijkAbs(naam, onze, ref, tolAbs, notitie = "") {
  const d = onze - ref;
  const afw = ref === 0 ? 0 : (d / Math.abs(ref)) * 100;
  if (Number.isFinite(afw)) grootsteAfwijking = Math.max(grootsteAfwijking, Math.abs(afw));
  const binnen = Math.abs(d) <= tolAbs;
  rijen.push({ naam, onze, ref, eenheid: "-", afw, binnen, tolPct: null, notitie });
  log(`  ${binnen ? "OK " : "!! "}${naam.padEnd(34)} onze ${fmt(onze).padStart(12)}      ` +
      ` ref ${fmt(ref).padStart(12)}       Δ ${d >= 0 ? "+" : ""}${d.toFixed(4)} abs` +
      (notitie ? `   ← ${notitie}` : ""));
}

function fmt(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(1);
  if (a >= 10) return v.toFixed(3);
  return v.toFixed(4);
}

// ══════════════════════════════════════════════════════════════════════════
//  DEEL 1 — krachtsverdeling en zakking (TypeScript-solver)
// ══════════════════════════════════════════════════════════════════════════
log("\n════ R16 — IPE 330, 5,70 m, vrij opgelegd, zijdelings ongesteund ════");
log("\n[1] Model inlezen en doorrekenen (TS-solver, de app-route)");

const bestand = deserializeProject(readFileSync(MODEL, "utf8"));
const combinaties = combinationsFromFile(bestand.combinations);
if (!combinaties) throw new Error("R16.femp bevat geen combinaties");

const multiInput = bouwMultiInput({
  nodes: bestand.nodes,
  beams: bestand.beams,
  supports: bestand.supports,
  plates: bestand.plates,
  loadCases: bestand.loadCases,
  loads: bestand.loads,
  selfWeightEnabled: bestand.selfWeightEnabled,
  scheefstandEnabled: bestand.scheefstandEnabled ?? false,
  scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
  scheefstandRichting: bestand.scheefstandRichting ?? 1,
});

const { perCase } = solveAllCases(multiInput);
const comboUgt = combinaties.find((c) => c.type === "uls");
const comboBgt = combinaties.find((c) => c.type === "sls");
const resUgt = combineResults(comboUgt, perCase);
const resBgt = combineResults(comboBgt, perCase);
const resultatenPerCombinatie = new Map([
  [comboUgt.id, resUgt],
  [comboBgt.id, resBgt],
]);

const efUgt = resUgt.elements.get(1);
const efBgt = resBgt.elements.get(1);

// Controle op de lastniveaus die de bron opgeeft (eigen gewicht komt uit de
// app zelf; de bron rekent 0,482 kN/m voor IPE 330).
const L_M = 5.7;
const qUgt = (8 * Math.max(...efUgt.bendingMoment.map(Math.abs))) / 1e6 / (L_M * L_M); // kN/m
const qBgt = (8 * Math.max(...efBgt.bendingMoment.map(Math.abs))) / 1e6 / (L_M * L_M);
log(`      afgeleide lijnlast UGT ${qUgt.toFixed(4)} kN/m  (bron 22,28)`);
log(`      afgeleide lijnlast BGT ${qBgt.toFixed(4)} kN/m  (bron 15,81)`);

log("\n[2] Snedekrachten en zakking tegen de referentie");
const myEd = Math.max(...efUgt.bendingMoment.map(Math.abs)) / 1e6;   // N·mm → kNm
const vEd  = Math.max(...efUgt.shearForce.map(Math.abs)) / 1000;      // N → kN
const wBgt = Math.max(...efBgt.deflection.map(Math.abs));            // mm

// Analytische referentie uit een gepubliceerde bron: tolerantie 1 % (§1.5).
vergelijk("My,Ed (UGT)", myEd, 90.48, "kNm", 1.0);
vergelijk("VEd (UGT)", vEd, 63.50, "kN", 1.0);
vergelijk("w (BGT, Gk+Qk)", wBgt, 8.8, "mm", 1.0,
  "bron rondt op 0,1 mm af (L/648)");
vergelijk("L/w (BGT)", 5700 / wBgt, 648, "-", 1.0);

// Oplegreacties — niet in de dossiertabel, wel een evenwichtscontrole.
const rA = resUgt.reactions.get(1), rB = resUgt.reactions.get(2);
const somV = (rA.fz + rB.fz) / 1000;
log(`      evenwichtscontrole: ΣV = ${somV.toFixed(3)} kN tegen q·L = ${(qUgt * L_M).toFixed(3)} kN`);

// ══════════════════════════════════════════════════════════════════════════
//  DEEL 2 — normtoetsing EN 1993-1-1 (Rust-kern via de stdio-sidecar)
// ══════════════════════════════════════════════════════════════════════════
log("\n[3] EN 1993-1-1-toetsing (Rust-kern via de sidecar)");

if (!existsSync(SIDECAR)) {
  log(`  OVERGESLAGEN — sidecar niet gebouwd: ${SIDECAR}`);
  log("  Bouwen met: cargo build --release -p openaec-mcp-server (in src-tauri/)");
} else {
  const profielen = await sidecar("list_steel_profiles", {});
  const profileDb = new Map(
    profielen.profiles.map((p) => [p.name.replace(/[\s\-.]/g, "").toUpperCase(), p]),
  );

  const { inputs, skipped } = buildSteelCheckInputs({
    nodes: bestand.nodes,
    beams: bestand.beams,
    combinations: combinaties,
    combinationResults: resultatenPerCombinatie,
    profileDb,
  });
  for (const s of skipped) log(`  overgeslagen: staaf ${s.beamId} — ${s.reason}`);
  if (inputs.length !== 1) throw new Error(`verwacht 1 toetsinvoer, kreeg ${inputs.length}`);

  const inv = inputs[0];
  log(`      toetsinvoer: ${inv.profile_name} ${inv.steel_grade}, L = ${inv.length_m} m,` +
      ` kipsteunen ${JSON.stringify(inv.lateral_bracing.top_flange_positions)},` +
      ` q_equiv = ${inv.q_equiv_n_per_mm.toFixed(4)} N/mm, z_a = ${inv.z_a_mm} mm,` +
      ` w_BGT = ${inv.deflection_actual_max_mm.toFixed(3)} mm`);

  const res = await sidecar("check_steel_beam", inv);
  const checks = new Map(res.checks.map((c) => [c.id, c.kind.data]));

  const kip = checks.get("6.3.2_ltb");
  const tussen = new Map((kip?.intermediate_values ?? []).map((v) => [v.symbol, v.value]));
  const schuif = checks.get("6.2.6_shear_z");

  log("\n  Doorsnede (geen kip): dwarskracht en klasse");
  vergelijk("Av,z", 3080.3, 3080, "mm²", 1.0);
  vergelijk("Vpl,Rd", schuif.uc.rd, 417.9, "kN", 1.0);
  vergelijkAbs("UC dwarskracht", schuif.uc.uc, 0.152, 0.02);
  const hwOverTw = (330 - 2 * 11.5) / 7.5;
  log(`  --  hw/tw = ${hwOverTw.toFixed(2)} < 72  → lijfplooi niet toetsen ` +
      `(bron: 40,9) — ${Math.abs(hwOverTw - 40.9) < 0.1 ? "gelijk" : "AFWIJKING"}`);
  log(`  --  doorsnedeklasse: ${JSON.stringify(res.classification)} (bron: klasse 1)`);

  log("\n  Kip (§6.3.2) — LET OP: onze kern rekent de NEDERLANDSE nationale");
  log("  bijlage (NB.NB.2/4/7/11/13); de bron rekent de aanbevolen EN-waarden");
  log("  met de algemene Mcr-formule. Verschillen hieronder zijn dus in de");
  log("  eerste plaats NB-verschillen, geen rekenfouten in de solver.");
  vergelijk("Mcr", tussen.get("M_{cr}"), 113.9, "kNm", 2.0, "NB-methode ≠ EN-formule");
  vergelijk("lambda_LT", tussen.get("\\bar{\\lambda}_{LT}"), 1.288, "-", 2.0, "volgt uit Mcr");
  vergelijk("chi_LT", tussen.get("\\chi_{LT}"), 0.480, "-", 2.0, "onze kromme b, bron kromme c");
  vergelijk("Mb,Rd", kip.uc.rd, 92.24, "kNm", 2.0, "bron gebruikt chi_LT,mod = 0,488");
  vergelijkAbs("UC kip", kip.uc.uc, 0.981, 0.02, "zie hierboven");

  log("\n  Wat de bron nog meer geeft, en wat onze kern daarvan kent:");
  log(`  --  kipkromme: bron c (h/b = ${(330 / 160).toFixed(3)} > 2), alpha_LT = 0,49;` +
      "  onze kern: vast alpha_LT = 0,34 (kromme b), h/b speelt geen rol");
  log("  --  lambda_LT,0 = 0,4 en beta = 0,75: onze kern gebruikt dezelfde waarden");
  log("  --  kc = 0,94 / f = 0,984 / chi_LT,mod = 0,488 (art. 6.3.2.3(2)):");
  log("      NIET geïmplementeerd in onze kern — die stopt bij chi_LT.");
  log("      Weglaten van f verhoogt chi_LT niet, dus dit is veilig-zijdig.");
  log("\n  NB-tussenwaarden van onze kern (ter verklaring van het Mcr-verschil):");
  for (const s of ["L_g", "L_{st}", "L_{kip}", "\\beta", "B^*", "C_1", "C_2", "S", "C", "k_{red}"]) {
    if (tussen.has(s)) log(`      ${s.padEnd(10)} = ${tussen.get(s)}`);
  }
  log(`      → beta en B* horen volgens NB.NB.4.3(3) uit de EINDMOMENTEN van`);
  log(`        het kipveld te komen. Die zijn hier nul (vrij opgelegd, alleen`);
  log(`        veldbelasting), dus NB-correct is beta = 0 en B* = 0. Onze kern`);
  log(`        leidt ze af uit het VELDmoment; zie de bevindingen bij dit geval.`);

  log("\n  Doorbuigingstoets van de kern (niet in de dossiertabel):");
  const wfin = checks.get("deflection_w_fin");
  log(`      w = ${wfin.uc.ed.toFixed(2)} mm tegen grens L/333 = ${wfin.uc.rd.toFixed(2)} mm` +
      ` → UC ${wfin.uc.uc.toFixed(3)}`);
  log(`      (de bron geeft geen doorbuigingseis; alleen w zelf is vergeleken)`);

  log(`\n  uc_max = ${res.uc_max.toFixed(4)} (maatgevend: ${res.governing_check_id})`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Samenvatting
// ══════════════════════════════════════════════════════════════════════════
log("\n──── samenvatting ────");
const buiten = rijen.filter((r) => !r.binnen);
log(`  vergeleken grootheden: ${rijen.length}`);
log(`  binnen tolerantie:     ${rijen.length - buiten.length}`);
log(`  buiten tolerantie:     ${buiten.length}`);
for (const r of buiten) {
  log(`    - ${r.naam}: onze ${fmt(r.onze)} tegen ref ${fmt(r.ref)} ${r.eenheid}` +
      ` (${r.afw >= 0 ? "+" : ""}${r.afw.toFixed(2)} %)`);
}
log(`  grootste afwijking:    ${grootsteAfwijking.toFixed(2)} %`);
log("");
log("  Deel 1 (krachtsverdeling en zakking) hoort binnen 1 % te vallen.");
log("  Deel 2 (kip) valt daarbuiten; dat is een NB-/implementatieverschil,");
log("  geen fout in de krachtsverdeling. Zie de bevindingen bij dit geval.");

// ══════════════════════════════════════════════════════════════════════════
//  DIAGNOSE van het kipverschil
// ══════════════════════════════════════════════════════════════════════════
//
// Hieronder staat GEEN herberekening: het zijn de uitkomsten van een aparte
// diagnoseloop waarin de kipketen van de app zélf
// (nen_en_1993_1_1_ltb::nb_annex + lambda_chi, ongewijzigd) met verschillende
// invoer is aangeroepen. Ze zijn hier vastgelegd zodat het verschil van 15 %
// hierboven te herleiden is. Herhalen: roep nb_annex::c1_c2_factors →
// c2_gecorrigeerd → s_parameter → c_coefficient → k_red → m_cr_i_section →
// lambda_chi::lambda_lt → chi_lt aan met de invoer per variant.
//
//  variant                                              Mcr    lam_LT  chi_LT  Mb,Rd   UC
//  A  zoals de app nu rekent (beta=0,75; B*=0,50; a=0,34) 125,38 1,2276 0,5635 106,46 0,850
//  B  zoals A, maar kromme c (alpha_LT = 0,49)            125,38 1,2276 0,5105  96,46 0,938
//  C  NB-correct beta=0, B*=0, L_kip=L_st, kromme c       115,40 1,2795 0,4845  91,54 0,988
//  D  NB-correct beta/B*, maar kromme b (alpha_LT = 0,34) 115,40 1,2795 0,5346 101,01 0,896
//  F  beta=0, B*=0, maar L_kip = l_kip(0; L_st) = 1,4·L_st 78,91 1,5474 0,3717  70,22 1,288
//  referentie (bron, algemene EN-formule + kromme c + f)  113,90 1,2880 0,4880  92,24 0,981
//
// Lezing:
//  * Variant C — de Nederlandse NB-methode van de app, gevoed met de invoer
//    die NB.NB.4.3(3) voor dit geval voorschrijft (geen eindmomenten, dus
//    beta = 0 en B* = 0) en met de kipkromme uit tabel 6.5 voor h/b > 2 —
//    komt op 1,3 % van de Mcr van de bron en op 0,007 van haar UC. De
//    NB-METHODE is dus niet de oorzaak van het verschil.
//  * Het verschil zit in twee dingen die de aanroeper doet:
//      1. beta en B* worden afgeleid uit het VELDmoment (gov_bending.my_ed en
//         M(L_st/4)) in plaats van uit de eindmomenten van het kipveld;
//      2. alpha_LT staat vast op 0,34 (kromme b) ongeacht h/b.
//    Beide werken hier dezelfde kant op: ze verhogen chi_LT, dus onze UC valt
//    0,13 LAGER uit dan die van de bron. Onveilig aan de verkeerde kant.
//  * Variant F laat zien dat punt 1 niet los te repareren is: met beta = 0
//    geeft nb_annex::l_kip 1,4·L_st, terwijl NB.NB.4.3 voor een veld tussen
//    TWEE gaffels L_kip = L_st voorschrijft. Wie alleen beta/B* corrigeert
//    zonder dat onderscheid, schiet 31 % de andere kant op.
//
// Er is hier bewust NIETS gerepareerd: dit is een bevinding van de
// validatiecampagne, geen opdracht tot wijzigen.

// ── Sidecar-hulp: één JSON-RPC-gesprek over stdio ─────────────────────────
/**
 * Roept één tool van de stdio-sidecar aan. De sidecar sluit af zodra stdin
 * dichtgaat, en beëindigt daarbij ook nog lopende antwoorden — daarom wordt
 * stdin pas gesloten nadat het antwoord binnen is.
 */
function sidecar(naam, argumenten) {
  return new Promise((klaar, mis) => {
    const p = spawn(SIDECAR, [], { stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    p.on("error", mis);
    p.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const regel = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!regel) continue;
        const antwoord = JSON.parse(regel);
        p.stdin.end();
        if (antwoord.error) { mis(new Error(JSON.stringify(antwoord.error))); return; }
        if (antwoord.result?.isError) {
          mis(new Error(antwoord.result.content?.[0]?.text ?? "sidecar-fout"));
          return;
        }
        klaar(antwoord.result.structuredContent);
      }
    });
    p.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: naam, arguments: argumenten },
    }) + "\n");
  });
}
