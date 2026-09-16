// Kruip en belastingduur in de fysisch niet-lineaire betonstijfheid.
//
// WAT DEZE TEST BEWAAKT
//
//   [1] β van (7.19) volgt uit de COMBINATIE — NEN-EN 1992-1-1 7.4.3(3) geeft
//       β = 1,0 voor "een enkele kortdurende belasting" en β = 0,5 voor
//       "aanhoudende belastingen of meervoudige cycli van zich herhalende
//       belastingen". Welke van de twee geldt, hangt aan de belasting en niet
//       aan de doorsnede.
//   [2] De kruipcoëfficiënt φ(∞,t₀) (art. 3.1.4) bereikt de staaf: per project
//       als terugval, per staaf uit het §5.8-blok, en de staaf gaat vóór.
//   [3] MET DE ECHTE KERN — de quasi-blijvende combinatie geeft de zakking
//       mét kruip, en de gevonden EI ligt binnen 1 % van een handberekening
//       die hieronder van begin tot eind wordt uitgeschreven.
//   [4] De gekozen β komt werkelijk bij de kern aan (`beta` in het antwoord).
//   [5] Een UGT-combinatie verandert NIET van β: 5.8.6(5) rekent zonder
//       betontrek, dus (7.18)/(7.19) spelen daar geen rol.
//   [6] Zonder opgegeven φ is de uitkomst niet stil: de lus noemt de staven,
//       de kern zet zijn vermelding met "ONVEILIGE KANT" in elk antwoord.
//   [7] De doorvoer in App.tsx blijft staan (bronteksttoets).
//
// ── DE HANDBEREKENING ──────────────────────────────────────────────────────
//
// Balk 300 × 500 mm, C30/37 (E_cm = 33 000 N/mm², tabel 3.1), B500B
// (E_s = 200 000 N/mm², art. 3.2.7(4)). Korf: onder 3Ø16, boven 2Ø12,
// dekking 30 mm, beugel Ø8.
//   A_s  = 3·¼π·16² = 603,19 mm²   d  = 500 − 30 − 8 − 8 = 454 mm
//   A_s' = 2·¼π·12² = 226,19 mm²   d' = 30 + 8 + 6       =  44 mm
//
// Kruip komt binnen via de effectieve elasticiteitsmodulus van (7.20):
//   E_c,eff = E_cm / (1 + φ(∞,t₀))                                   (7.20)
// Dat is dezelfde bewerking die 5.8.6(4) op het spanning-rekdiagram uitvoert
// (alle rekwaarden maal (1 + φ_ef)): de beginhelling f_c·k/ε_c1 wordt door
// (1 + φ_ef) gedeeld. De verhouding van de elasticiteitsmoduli is dan
//   α_e = E_s / E_c,eff
//
// VOLLEDIG GESCHEURDE TOESTAND (staat II). De hoogte van de drukzone x volgt
// uit het evenwicht van de statische momenten om de neutrale lijn:
//   b·x²/2 + (α_e − 1)·A_s'·(x − d') = α_e·A_s·(d − x)
// en daarmee
//   I_II = b·x³/3 + (α_e − 1)·A_s'·(x − d')² + α_e·A_s·(d − x)²
//
// ONGESCHEURDE TOESTAND (staat I), dezelfde getransformeerde doorsnede maar
// met de volle betondoorsnede mee:
//   A_t = b·h + (α_e − 1)·(A_s + A_s')
//   y   = [b·h·h/2 + (α_e − 1)·(A_s·d + A_s'·d')] / A_t        (vanaf boven)
//   I_I = b·h³/12 + b·h·(y − h/2)² + (α_e − 1)·[A_s·(d − y)² + A_s'·(y − d')²]
//
// INTERPOLEREN, 7.4.3(3):
//   α = ζ·α_II + (1 − ζ)·α_I                                         (7.18)
//   ζ = 1 − β·(σ_sr/σ_s)²  en de OPMERKING bij (7.19) staat toe
//       σ_sr/σ_s te vervangen door M_cr/M bij buiging                (7.19)
// De beschouwde parameter α is hier de KROMMING, dus met κ = M/EI:
//   1/EI_eff = ζ/EI_II + (1 − ζ)/EI_I
//
// Deze keten is niet verzonnen maar nagemeten tegen de kern, in drie standen
// van dezelfde balk (M = 67,5 kNm, M_cr = 36,25 kNm):
//
//   stand                   hand EI_eff    kern EI_eff    afwijking
//   φ = 0,   β = 1,0        24,28 MNm²     24,31 MNm²     0,11 %
//   φ = 0,   β = 0,5        20,98 MNm²     20,98 MNm²     < 0,05 %
//   φ = 2,0, β = 0,5        16,82 MNm²     16,92 MNm²     0,58 %
//
// De eerste rij is de stand waarin de app vóór deze reparatie ook de
// quasi-blijvende combinatie rekende; de laatste is die van 7.4.3(5). De rest
// van de afwijking bij φ = 2,0 komt uit het spanning-rekdiagram: de kern rekt
// de parabool van 3.1.5 met (1 + φ_ef) op (5.8.6(4)) en integreert die over
// de doorsnede, terwijl de hand de betondruk lineair-elastisch neemt.
//
// Voor dezelfde balk noemde het kruiponderzoek 16,86 MNm² (met ζ afgerond
// op 0,856). Die waarde ligt tussen de handketen hier en de kern in.
//
// Draaien met: npx tsx test-beton-kruip.mjs
//          of: node scripts/run-tests.mjs --filter=beton-kruip

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const TOETSBRUG = join(
  REPO, "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { losCombinatieFysischOp, betonStavenUitModel, belastingduurVanCombinatie } =
  await import("./src/lib/betonStijfheid.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s = "") => process.stdout.write(s + "\n");

function check(naam, gemeten, verwacht, tolRel) {
  const schaal = Math.abs(verwacht) > 1e-12 ? Math.abs(verwacht) : 1;
  const rel = Math.abs(gemeten - verwacht) / schaal;
  if (rel <= tolRel) {
    passed++;
    log(`  ✓ ${naam}: ${gemeten.toPrecision(8)} vs ${verwacht.toPrecision(8)} (afw ${(100 * rel).toFixed(3)} %)`);
  } else {
    failed++;
    log(`  ✗ ${naam}: ${gemeten.toPrecision(8)} vs ${verwacht.toPrecision(8)} (afw ${(100 * rel).toFixed(3)} % > ${(100 * tolRel).toFixed(3)} %)`);
  }
  return rel;
}

function checkWaar(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
  else { failed++; log(`  ✗ ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
}

// ── Doorsnede, korf en model ───────────────────────────────────────────────
const B_MM = 300, H_MM = 500, E_CM = 33000, E_S = 200000;
const I_C = (B_MM * H_MM ** 3) / 12, A_C = B_MM * H_MM;
const A_S = 3 * 0.25 * Math.PI * 16 ** 2;     // 603,19 mm²
const A_SA = 2 * 0.25 * Math.PI * 12 ** 2;    // 226,19 mm²
const D_MM = H_MM - 30 - 8 - 8;               // 454 mm, zwaartepunt onderwapening
const DA_MM = 30 + 8 + 6;                     //  44 mm, zwaartepunt bovenwapening

const KORF = {
  cover_mm: 30,
  stirrup_diameter_mm: 8,
  top: { count: 2, diameter_mm: 12 },
  bottom: { count: 3, diameter_mm: 16 },
};

const staaf = (beamId, lengteMm, phiInfT0) => ({
  beamId,
  doorsnede: { shape: "Rectangle", b_mm: B_MM, h_mm: H_MM, b_w_mm: null, h_f_mm: null, flange_at_bottom: false },
  betonklasse: "C30/37",
  staalsoort: "B500B",
  korf: KORF,
  lengteMm,
  aantalStroken: 50,
  staaltak: "Horizontal",
  ...(phiInfT0 === undefined ? {} : { phiInfT0 }),
});

const liggerInvoer = (L, q) => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
  beams: [{ id: 1, from: 1, to: 2, E: E_CM, A: A_C, I: I_C }],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  loads: [{ beamId: 1, q: -q, caseId: 1 }],
  pointLoads: [], beamPointLoads: [], thermalLoads: [], edgeLoads: [],
  cases: [{ id: 1, name: "G+psi2Q" }],
});

const COMBO_QP = { id: 1, name: "BGT quasi-blijvend 6.16b", type: "sls", factors: new Map([[1, 1]]) };
const COMBO_UGT = { id: 2, name: "UGT 6.10b", type: "uls", factors: new Map([[1, 1]]) };

const bijX = (el, reeks, x) => {
  for (let i = 0; i < el.stations_mm.length; i++) {
    if (Math.abs(el.stations_mm[i] - x) <= 1e-6) return el[reeks][i];
  }
  throw new Error("geen station op x = " + x);
};

// ── De handberekening, als functie zodat elke stap na te lezen is ──────────

/** x en I_II van de volledig gescheurde doorsnede bij deze α_e. */
function staatII(alphaE) {
  // b·x²/2 + (α_e − 1)·A_s'·(x − d') = α_e·A_s·(d − x)  →  a·x² + b·x + c = 0
  const a = B_MM / 2;
  const b = (alphaE - 1) * A_SA + alphaE * A_S;
  const c = -((alphaE - 1) * A_SA * DA_MM + alphaE * A_S * D_MM);
  const x = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  const i = (B_MM * x ** 3) / 3 + (alphaE - 1) * A_SA * (x - DA_MM) ** 2 + alphaE * A_S * (D_MM - x) ** 2;
  return { x, i };
}

/** y (vanaf boven) en I_I van de ongescheurde getransformeerde doorsnede. */
function staatI(alphaE) {
  const n = alphaE - 1;
  const at = B_MM * H_MM + n * (A_S + A_SA);
  const y = (B_MM * H_MM * (H_MM / 2) + n * (A_S * D_MM + A_SA * DA_MM)) / at;
  const i =
    (B_MM * H_MM ** 3) / 12 +
    B_MM * H_MM * (y - H_MM / 2) ** 2 +
    n * (A_S * (D_MM - y) ** 2 + A_SA * (y - DA_MM) ** 2);
  return { y, i };
}

/**
 * EI_eff volgens (7.18)/(7.19)/(7.20) in kNm², plus alle tussenstappen.
 * `mKnm` en `mCrKnm` komen uit de kern zelf — het scheurmoment is een
 * eigenschap van de doorsnede die hier niet nogmaals wordt afgeleid.
 */
function eiEffHand(phi, beta, mKnm, mCrKnm) {
  const ecEff = E_CM / (1 + phi);            // (7.20)
  const alphaE = E_S / ecEff;
  const ii = staatII(alphaE);
  const i1 = staatI(alphaE);
  const eiII = (ecEff * ii.i) / 1e9;         // N·mm² → kNm²
  const eiI = (ecEff * i1.i) / 1e9;
  const zeta = Math.max(0, 1 - beta * (mCrKnm / mKnm) ** 2);   // (7.19) met de OPMERKING
  const eiEff = 1 / (zeta / eiII + (1 - zeta) / eiI);          // (7.18) op de kromming
  return { ecEff, alphaE, x: ii.x, iII: ii.i, y: i1.y, iI: i1.i, eiII, eiI, zeta, eiEff };
}

// ═══════════════════════════════════════════════════════════════════════════
log("[1] β van (7.19) per combinatiesoort — art. 7.4.3(3)");
// ═══════════════════════════════════════════════════════════════════════════
{
  const gevallen = [
    ["BGT quasi-blijvend 6.16b", "sls", "Sustained"],
    ["BGT frequent 6.15b", "sls", "Sustained"],
    ["BGT karakteristiek 6.14b", "sls", "Sustained"],
    ["Eigen bruikbaarheidsgeval", "sls", "Sustained"],
    ["UGT 6.10a", "uls", "ShortTerm"],
    ["UGT 6.10b", "uls", "ShortTerm"],
  ];
  for (const [naam, type, verwacht] of gevallen) {
    const uit = belastingduurVanCombinatie({ name: naam, type });
    checkWaar(`"${naam}" → ${verwacht}`, uit.duur === verwacht, uit.reden.slice(0, 96));
  }
  // De gunstige kant mag nooit stil ontstaan: geen enkele BGT-combinatie
  // krijgt β = 1,0, ook niet als haar naam onherkenbaar is.
  checkWaar(
    "geen enkele BGT-combinatie krijgt stil β = 1,0",
    gevallen.filter(([, t]) => t === "sls")
      .every(([n, t]) => belastingduurVanCombinatie({ name: n, type: t }).duur === "Sustained"),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] φ(∞,t₀) bereikt de staaf — per project en per staaf");
// ═══════════════════════════════════════════════════════════════════════════
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 12000, z: 0 }];
  const beams = [
    { id: 1, from: 1, to: 2, material: "C30/37", profile: "300x500", checkConfig: { betonKorf: KORF } },
    {
      id: 2, from: 2, to: 3, material: "C30/37", profile: "300x500",
      // Een staaf met een §5.8-blok dat een eigen φ(∞,t₀) draagt.
      checkConfig: { betonKorf: KORF, betonKolom: { bracing: "Braced", phi_inf_t0: 1.4 } },
    },
  ];
  const zonder = betonStavenUitModel({ nodes, beams });
  checkWaar("zonder projectwaarde blijft staaf 1 zonder φ",
    zonder.staven.find((s) => s.beamId === 1).phiInfT0 === undefined);
  checkWaar("de eigen waarde van staaf 2 blijft ook zonder projectwaarde staan",
    zonder.staven.find((s) => s.beamId === 2).phiInfT0 === 1.4);

  const met = betonStavenUitModel({ nodes, beams, standaardPhiInfT0: 2.0 });
  checkWaar("de projectwaarde landt op de staaf zonder eigen waarde",
    met.staven.find((s) => s.beamId === 1).phiInfT0 === 2.0);
  checkWaar("de staaf met een eigen waarde gaat vóór het project",
    met.staven.find((s) => s.beamId === 2).phiInfT0 === 1.4,
    "art. 5.8.4 hangt φ_ef aan het element");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3–6] Met de ECHTE rekenkern");
// ═══════════════════════════════════════════════════════════════════════════
if (!existsSync(TOETSBRUG)) {
  overgeslagen++;
  log(`  (overgeslagen: ${TOETSBRUG} ontbreekt — bouw hem met`);
  log("   cargo build --release -p toetsbrug  vanuit src-tauri)");
} else {
  const echteKern = (opdracht, inputs) => new Promise((res, rej) => {
    const kind = spawn(TOETSBRUG, [], { stdio: ["pipe", "pipe", "pipe"] });
    let uit = "", fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("error", rej);
    kind.on("close", () => {
      let j;
      try { j = JSON.parse(uit); } catch { return rej(new Error(`kern gaf geen JSON: ${uit || fout}`)); }
      if (j && j.fout) return rej(new Error(j.fout));
      res(j);
    });
    kind.stdin.end(JSON.stringify({ opdracht, inputs }));
  });

  const L = 6000, Q = 15;                       // M(½L) = qL²/8 = 67,5 kNm
  const PHI = 2.0;

  /** De lus draaien zoals App.tsx hem draait: β uit de combinatie. */
  const draai = (combo, phiInfT0) =>
    losCombinatieFysischOp(liggerInvoer(L, Q), combo, [staaf(1, L, phiInfT0)], {
      roep: echteKern,
      grenstoestand: combo.type === "sls" ? "MeanValues" : "DesignValues",
      belastingduur: belastingduurVanCombinatie(combo).duur,
    });

  // ── [3] De quasi-blijvende combinatie mét kruip ─────────────────────────
  log("\n  [3] BGT quasi-blijvend, φ(∞,t₀) = 2,0 — de zakking mét kruip");
  const metKruip = await draai(COMBO_QP, PHI);
  const aMet = metKruip.laatsteRonde.get(1);
  const midMet = aMet.segments[Math.floor(aMet.segments.length / 2)];
  const dMet = bijX(metKruip.resultaat.elements.get(1), "deflection", L / 2);
  {
    const h = eiEffHand(PHI, aMet.beta, Math.abs(midMet.m_ed_knm), Math.abs(midMet.m_cr_knm));
    log(`      HAND: E_c,eff = E_cm/(1+φ) = ${h.ecEff.toFixed(0)} N/mm² (7.20), α_e = ${h.alphaE.toFixed(2)}`);
    log(`      HAND: staat II  x = ${h.x.toFixed(2)} mm, I_II = ${(h.iII / 1e8).toFixed(3)}·10⁸ mm⁴, EI_II = ${(h.eiII / 1000).toFixed(2)} MNm²`);
    log(`      HAND: staat I   y = ${h.y.toFixed(2)} mm, I_I  = ${(h.iI / 1e8).toFixed(3)}·10⁸ mm⁴, EI_I  = ${(h.eiI / 1000).toFixed(2)} MNm²`);
    log(`      HAND: M = ${Math.abs(midMet.m_ed_knm).toFixed(2)} kNm, M_cr = ${Math.abs(midMet.m_cr_knm).toFixed(2)} kNm, β = ${aMet.beta}, ζ = ${h.zeta.toFixed(4)} (7.19)`);
    log(`      HAND: EI_eff = ${(h.eiEff / 1000).toFixed(2)} MNm² (7.18 op de kromming)`);
    log(`      KERN: EI_eff = ${(midMet.ei_knm2 / 1000).toFixed(2)} MNm², ζ = ${midMet.zeta.toFixed(4)}, δ(½L) = ${dMet.toFixed(3)} mm`);

    check("ζ van de kern tegen (7.19) met M_cr/M", midMet.zeta, h.zeta, 0.01);
    check("EI in het midden tegen de handberekening", midMet.ei_knm2, h.eiEff, 0.01);
    checkWaar("de kern meldt dat er MÉT kruip is gerekend",
      aMet.creep_neglected === false && aMet.phi_ef === PHI,
      aMet.creep_note.slice(0, 110));
    checkWaar("er is niets te melden over een ontbrekende kruipcoëfficiënt",
      metKruip.zonderKruipcoefficient.length === 0);

    // De zakking zelf: met een EI die over de staaf varieert bestaat er geen
    // gesloten formule, maar hij moet wél tussen de twee uitersten liggen die
    // een CONSTANTE EI zou geven. Dat is een analytische omsluiting en geen
    // overgenomen getal.
    const eis = aMet.segments.map((s) => s.ei_knm2);
    const dBijEi = (ei) => -(5 * Q * L ** 4) / (384 * ei * 1e9);
    const onder = dBijEi(Math.min(...eis));     // slapste: grootste zakking
    const boven = dBijEi(Math.max(...eis));     // stijfste: kleinste zakking
    checkWaar("δ ligt tussen de twee uitersten van een constante EI",
      dMet <= boven && dMet >= onder,
      `${onder.toFixed(3)} ≤ ${dMet.toFixed(3)} ≤ ${boven.toFixed(3)} mm`);
  }

  // ── [3b] Wat de oude bedrading gaf, ter vergelijking ────────────────────
  log("\n  [3b] Dezelfde balk zoals de app hem vóór deze reparatie rekende");
  {
    const oud = await losCombinatieFysischOp(liggerInvoer(L, Q), COMBO_QP, [staaf(1, L)], {
      roep: echteKern, grenstoestand: "MeanValues", belastingduur: "ShortTerm",
    });
    const aOud = oud.laatsteRonde.get(1);
    const midOud = aOud.segments[Math.floor(aOud.segments.length / 2)];
    const dOud = bijX(oud.resultaat.elements.get(1), "deflection", L / 2);
    const hOud = eiEffHand(0, 1.0, Math.abs(midOud.m_ed_knm), Math.abs(midOud.m_cr_knm));
    log(`      oud (φ_ef = 0, β = 1,0): EI = ${(midOud.ei_knm2 / 1000).toFixed(2)} MNm², δ = ${dOud.toFixed(3)} mm`);
    log(`      hand bij φ = 0 en β = 1,0: EI = ${(hOud.eiEff / 1000).toFixed(2)} MNm²`);
    log(`      nieuw t.o.v. oud: ${(100 * (dMet / dOud - 1)).toFixed(1)} % meer zakking`);
    check("de oude stand klopt óók met dezelfde handketen", midOud.ei_knm2, hOud.eiEff, 0.01);
    checkWaar("de nieuwe bedrading geeft een GROTERE zakking dan de oude",
      Math.abs(dMet) > Math.abs(dOud),
      `${Math.abs(dMet).toFixed(3)} mm tegen ${Math.abs(dOud).toFixed(3)} mm`);
    checkWaar("de toename is aanzienlijk (> 40 %) en niet een afrondingsverschil",
      Math.abs(dMet) / Math.abs(dOud) > 1.4,
      `factor ${(Math.abs(dMet) / Math.abs(dOud)).toFixed(3)}`);
  }

  // ── [4] β komt werkelijk bij de kern aan ────────────────────────────────
  log("\n  [4] De gekozen β bereikt de kern");
  {
    checkWaar("de quasi-blijvende combinatie kwam met β = 0,5 aan",
      aMet.beta === 0.5 && aMet.load_duration === "Sustained");
    const kort = await losCombinatieFysischOp(liggerInvoer(L, Q), COMBO_QP, [staaf(1, L, PHI)], {
      roep: echteKern, grenstoestand: "MeanValues", belastingduur: "ShortTerm",
    });
    const midKort = kort.laatsteRonde.get(1).segments[Math.floor(aMet.segments.length / 2)];
    checkWaar("β = 1,0 geeft een HOGERE stijfheid dan β = 0,5 — (7.19) ζ = 1 − β(σ_sr/σ_s)²",
      midKort.ei_knm2 > midMet.ei_knm2,
      `${(midKort.ei_knm2 / 1000).toFixed(2)} MNm² tegen ${(midMet.ei_knm2 / 1000).toFixed(2)} MNm²`);
  }

  // ── [5] De UGT blijft ongewijzigd ───────────────────────────────────────
  log("\n  [5] Een UGT-combinatie verandert niet van β — 5.8.6(5)");
  {
    const ugtKort = await losCombinatieFysischOp(liggerInvoer(L, Q), COMBO_UGT, [staaf(1, L, PHI)], {
      roep: echteKern, grenstoestand: "DesignValues", belastingduur: "ShortTerm",
    });
    const ugtLang = await losCombinatieFysischOp(liggerInvoer(L, Q), COMBO_UGT, [staaf(1, L, PHI)], {
      roep: echteKern, grenstoestand: "DesignValues", belastingduur: "Sustained",
    });
    const eiKort = ugtKort.laatsteRonde.get(1).segments.map((s) => s.ei_knm2);
    const eiLang = ugtLang.laatsteRonde.get(1).segments.map((s) => s.ei_knm2);
    checkWaar("elke segment-EI is identiek, ongeacht β",
      eiKort.length === eiLang.length && eiKort.every((v, i) => v === eiLang[i]),
      `${eiKort.length} segmenten, EI midden ${(eiKort[Math.floor(eiKort.length / 2)] / 1000).toFixed(2)} MNm²`);
    checkWaar("de UGT-tak kent geen ζ (geen tension stiffening, 5.8.6(5))",
      ugtKort.laatsteRonde.get(1).segments.every((s) => s.zeta === null || s.zeta === undefined));
    // En de kruip werkt in de UGT juist WÉL door: 5.8.6(4).
    const ugtZonder = await losCombinatieFysischOp(liggerInvoer(L, Q), COMBO_UGT, [staaf(1, L)], {
      roep: echteKern, grenstoestand: "DesignValues", belastingduur: "ShortTerm",
    });
    const eiZonder = ugtZonder.laatsteRonde.get(1).segments.map((s) => s.ei_knm2);
    checkWaar("in de UGT verlaagt kruip de stijfheid wél — 5.8.6(4)",
      eiKort[Math.floor(eiKort.length / 2)] < eiZonder[Math.floor(eiZonder.length / 2)],
      `met φ ${(eiKort[Math.floor(eiKort.length / 2)] / 1000).toFixed(2)} MNm², zonder ${(eiZonder[Math.floor(eiZonder.length / 2)] / 1000).toFixed(2)} MNm²`);
  }

  // ── [6] Zonder φ: geen stille uitkomst ──────────────────────────────────
  log("\n  [6] Zonder opgegeven φ(∞,t₀) is de uitkomst niet stil");
  {
    const stil = await draai(COMBO_QP, undefined);
    const a = stil.laatsteRonde.get(1);
    checkWaar("de lus noemt de staaf zonder kruipcoëfficiënt",
      stil.zonderKruipcoefficient.length === 1 && stil.zonderKruipcoefficient[0] === 1);
    checkWaar("de kern meldt dat er zonder kruip is gerekend",
      a.creep_neglected === true && a.phi_ef === 0);
    checkWaar("de melding noemt de onveilige kant met zoveel woorden",
      a.creep_note.includes("ZONDER kruip") && a.creep_note.includes("ONVEILIGE KANT"),
      a.creep_note.slice(0, 140));
    checkWaar("elk antwoord draagt die melding, niet alleen het eerste",
      [...stil.laatsteRonde.values()].every((r) => r.creep_note.length > 0) &&
      [...stil.indeling.values()].every((r) => r.creep_note.length > 0));
    // En de β-reparatie werkt óók zonder kruipcoëfficiënt: de twee gebreken
    // waren onafhankelijk en zijn het nog.
    checkWaar("β = 0,5 geldt ook zonder kruipcoëfficiënt", a.beta === 0.5);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[7] De doorvoer in App.tsx (bronteksttoets)");
// ═══════════════════════════════════════════════════════════════════════════
{
  // Een bronteksttoets en geen gedragstest: de rekengang van App.tsx is een
  // React-hook die zonder DOM niet te draaien is. Wat hier bewaakt wordt, is
  // dat de drie draden blijven zitten — zonder één ervan valt de lus stil
  // terug op de standaarden (φ_ef = 0, β = 1,0) en is de fout terug.
  const app = readFileSync(join(HIER, "src", "App.tsx"), "utf8");
  checkWaar("App.tsx leidt de belastingduur uit de combinatie af",
    /belastingduurVanCombinatie\(combo\)/.test(app));
  checkWaar("App.tsx geeft die duur aan de stijfheidslus mee",
    /belastingduur:\s*duur\.duur/.test(app));
  checkWaar("App.tsx geeft de projectkruipcoëfficiënt aan de staven mee",
    /standaardPhiInfT0:\s*fem\.betonKruipcoefficient/.test(app));
  checkWaar("App.tsx meldt het wanneer er zonder kruip is gerekend",
    /zonderKruip\.size > 0/.test(app) && /i18next\.t\("common:app\.creep\.title"\)/.test(app) &&
      // De meldtekst loopt via i18n: de bron noemt de sleutel, de
      // Nederlandse locale de tekst die de gebruiker ziet.
      JSON.parse(readFileSync(join(HIER, "src", "i18n", "locales", "nl", "common.json"), "utf8"))
        .app?.creep?.title === "Zonder kruip gerekend");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n────────────────────────────────────────────────────────────");
log(`${passed} geslaagd, ${failed} gefaald${overgeslagen ? `, ${overgeslagen} blok overgeslagen` : ""}`);
process.exit(failed === 0 ? 0 : 1);
