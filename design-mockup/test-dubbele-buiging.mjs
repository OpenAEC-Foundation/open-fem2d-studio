// DUBBELE BUIGING BIJ KOLOMMEN (art. 5.8.9) — van invoerscherm tot rekenkern.
//
// WAT DEZE TEST BEWAAKT
// De rekenregels zelf staan in Rust en zijn daar tegen handberekeningen
// getest (`nen-en-1992-1-1/tests/kolom_5_8.rs`, module `tweede_as`, en
// `concrete-check/tests/kolomtoets.rs`). Hier gaat het om de KETEN die
// daarvóór en daarna ligt:
//
//   [1] `maakZConsistent` in components/beton/kolomgegevens: het vakje om de
//       z-as mag nooit in tegenspraak raken met de schoring om de z-as — ook
//       niet via de terugval op de keuze van het vlak;
//   [2] de modelpoort (`controleerVelden`): de drie velden om de z-as komen
//       erdoor, een tikfout erin niet;
//   [3] met de ECHTE rekenkern (toetsbrug-binary, als hij er is), met de hand
//       nagerekend: de imperfectie e_i van art. 5.2 met θ₀ = 1/300, de grens
//       van (5.38a), de exponent a van (5.39) op zijn drie ankerpunten, en dat
//       een kolom ZONDER normaaldruk geen art. 5.8.9 krijgt.
//
// WAAROM [3] ERTOE DOET. De raamwerkoplosser van deze app rekent in één vlak
// en levert M_z = 0. Vroeger verdween de tweede as daarmee geruisloos; nu hoort
// M_Ed,z er ALTIJD te zijn, met de imperfectie en de tweede orde om z erin.
//
// Draaien met: npx tsx test-dubbele-buiging.mjs
//          of: node scripts/run-tests.mjs --filter=dubbele-buiging
// Vereist voor [3]: cargo build --release -p toetsbrug   (in ../src-tauri)

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const TOETSBRUG = join(
  REPO, "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { maakZConsistent, effectieveSchoringZ, effectieveKniklengteZ } =
  await import("./src/components/beton/kolomgegevens.ts");
const { controleerVelden } = await import("./src/mcp/valideerModel.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
function eq(naam, gemeten, verwacht) {
  ok(`${naam}: ${JSON.stringify(gemeten)}`,
    JSON.stringify(gemeten) === JSON.stringify(verwacht),
    `verwacht ${JSON.stringify(verwacht)}`);
}
function dicht(naam, gemeten, verwacht, tolRel = 1e-6) {
  const schaal = Math.abs(verwacht) > 1e-12 ? Math.abs(verwacht) : 1;
  const rel = Math.abs(gemeten - verwacht) / schaal;
  ok(`${naam}: ${gemeten} ≈ ${verwacht}`, rel <= tolRel, `afwijking ${rel.toExponential(2)}`);
}

const A = { soort: "Figuur57", geval: "ScharnierendScharnierend" };
const CONSOLE = { soort: "Figuur57", geval: "Console" };

// ═══════════════════════════════════════════════════════════════════════════
log("[1] maakZConsistent — geen tegenspraak om de z-as");
// ═══════════════════════════════════════════════════════════════════════════
{
  const basis = { bracing: "Geschoord", buckling_length: A };
  eq("leeg blijft leeg als de keuze van het vlak past",
    maakZConsistent(basis), basis);
  eq("de terugval is de keuze van het vlak",
    [effectieveSchoringZ(basis), effectieveKniklengteZ(basis)], ["Geschoord", A]);

  // Eigen schoring om z die NIET bij de keuze van het vlak past: het vakje om z
  // krijgt een eigen waarde, het eerste van de nieuwe lijst (de console).
  const zOngeschoord = maakZConsistent({ ...basis, bracing_z: "Ongeschoord" });
  eq("ongeschoord om z bij vakje a) in het vlak → console om z",
    zOngeschoord.buckling_length_z, CONSOLE);
  ok("en de rest van het blok is onaangeroerd",
    zOngeschoord.bracing === "Geschoord" && zOngeschoord.bracing_z === "Ongeschoord");

  // Wisselt daarna de schoring in het VLAK naar ongeschoord, dan past het
  // eigen vakje om z nog steeds: er verandert niets.
  const vlakWisselt = maakZConsistent({ ...zOngeschoord, bracing: "Ongeschoord", buckling_length: CONSOLE });
  eq("een passend eigen vakje om z blijft staan", vlakWisselt.buckling_length_z, CONSOLE);

  // Omgekeerd: het vlak wisselt naar ongeschoord (console) terwijl z leeg is
  // en dus meeloopt — geen tegenspraak, want z volgt het vlak.
  const meelopen = maakZConsistent({ bracing: "Ongeschoord", buckling_length: CONSOLE });
  ok("z zonder eigen keuze loopt met het vlak mee", meelopen.buckling_length_z === undefined);

  // Maar wisselt het vlak naar ongeschoord terwijl z UITDRUKKELIJK geschoord
  // is en leeg meeloopt, dan zou de console om z "geschoord" heten: de kern
  // weigert dat, dus het scherm geeft z een eigen vakje a).
  const botsing = maakZConsistent({ bracing: "Ongeschoord", buckling_length: CONSOLE, bracing_z: "Geschoord" });
  eq("geschoord om z bij een console in het vlak → vakje a) om z",
    botsing.buckling_length_z, A);

  // Een opgegeven l₀,z is bij elke schoring geldig en wordt nooit gewist.
  const opgegeven = { ...basis, bracing_z: "Ongeschoord", buckling_length_z: { soort: "Opgegeven", l0_m: 4.2 } };
  eq("een opgegeven l₀,z overleeft elke schoring", maakZConsistent(opgegeven), opgegeven);

  // Idempotent.
  const eens = maakZConsistent({ ...basis, bracing_z: "Ongeschoord" });
  eq("idempotent", maakZConsistent(eens), eens);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] De modelpoort kent de drie velden om de z-as");
// ═══════════════════════════════════════════════════════════════════════════
{
  const KORF = {
    cover_mm: 30, stirrup_diameter_mm: 8, stirrup_spacing_mm: 200, stirrup_legs: 2,
    top: { count: 2, diameter_mm: 16 }, bottom: { count: 2, diameter_mm: 16 },
  };
  const rauw = (kolom) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }],
    beams: [{
      id: 1, from: 1, to: 2, material: "C30/37", profile: "300x300",
      checkConfig: { betonKorf: KORF, betonKolom: kolom },
    }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loadCases: [{ id: 1, name: "G" }],
  });

  eq("een volledig blok met de tweede as komt schoon door de poort",
    controleerVelden(rauw({
      bracing: "Geschoord", buckling_length: A,
      bracing_z: "Ongeschoord", buckling_length_z: CONSOLE, m0_edz_knm: 12.5,
    })), []);
  eq("een opgegeven l₀,z ook",
    controleerVelden(rauw({
      bracing: "Geschoord", buckling_length: A,
      buckling_length_z: { soort: "Opgegeven", l0_m: 6 },
    })), []);
  eq("M₀Ed,z mag nul en mag negatief zijn (het teken doet er niet toe)",
    controleerVelden(rauw({ bracing: "Geschoord", buckling_length: A, m0_edz_knm: -3 })), []);

  const tikfout = controleerVelden(rauw({ bracing: "Geschoord", buckling_length: A, bracing_zz: "Geschoord" }));
  ok("een tikfout in bracing_z wordt geweigerd en wijst naar het goede veld",
    tikfout.some((f) => f.includes("bracing_zz") && f.includes("bracing_z")),
    tikfout.join(" | ") || "geen enkele fout");
  const verkeerdeWaarde = controleerVelden(rauw({ bracing: "Geschoord", buckling_length: A, bracing_z: "Vrij" }));
  ok("een onbekende schoring om z wordt geweigerd",
    verkeerdeWaarde.some((f) => f.includes("bracing_z")), verkeerdeWaarde.join(" | ") || "geen enkele fout");
  const vakjeF = controleerVelden(rauw({
    bracing: "Geschoord", buckling_length: A,
    buckling_length_z: { soort: "Figuur57", geval: "GedeeltelijkIngeklemdGeschoord" },
  }));
  ok("vakje f) om z wordt geweigerd — het geeft een bereik, geen waarde",
    vakjeF.some((f) => f.includes("buckling_length_z.geval")), vakjeF.join(" | ") || "geen enkele fout");
  const geenGetal = controleerVelden(rauw({ bracing: "Geschoord", buckling_length: A, m0_edz_knm: "30" }));
  ok("M₀Ed,z als tekst wordt geweigerd",
    geenGetal.some((f) => f.includes("m0_edz_knm")), geenGetal.join(" | ") || "geen enkele fout");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] Met de ECHTE rekenkern, met de hand nagerekend");
// ═══════════════════════════════════════════════════════════════════════════
//
// Kolom 300 × 300, C30/37, B500B, 2Ø16 boven en 2Ø16 onder (vier hoekstaven),
// dekking 30, beugel Ø8.
//
//   A_c   = 90 000 mm²;  f_cd = 20 N/mm²;  f_yd = 434,7826 N/mm²
//   A_s   = 4 · π/4 · 16² = 804,2477 mm²
//   N_Rd  = A_c·f_cd + A_s·f_yd = 1 800 000 + 349 672,9 = 2 149,673 kN  (5.8.9(4))
//   i     = 300/√12 = 86,60254 mm (om beide assen)
//
// θ_i volgens (5.1) met θ₀ = 1/300 (NB): α_h = 2/√l, 2/3 ≤ α_h ≤ 1; α_m = 1.
//   l = 3 m:  α_h = 1,155 → 1;    θ_i = 1/300;  e_i (l₀ = 3 m) = 3000/600 = 5,0 mm
//   l = 12 m: α_h = 0,577 → 2/3;  θ_i = 1/450;  e_i (l₀ = 12 m) = 12 000/900 = 13,333 mm
if (!existsSync(TOETSBRUG)) {
  overgeslagen++;
  log(`  (overgeslagen: ${TOETSBRUG} ontbreekt — bouw hem met`);
  log("   cargo build --release -p toetsbrug  vanuit src-tauri)");
} else {
  const kern = (opdracht, inputs) => new Promise((res, rej) => {
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

  const N_RD_KN = (90000 * 20 + 4 * Math.PI * 64 * (500 / 1.15)) / 1000;
  const verzoek = ({ l_m = 3, n_kn, my = 0, mz = 0, kolom }) => ({
    beam_id: 1,
    section: { shape: "Rectangle", b_mm: 300, h_mm: 300, b_w_mm: null, h_f_mm: null, flange_at_bottom: false },
    concrete_class: "C30/37",
    reinforcement_grade: "B500B",
    cage: {
      cover_mm: 30, stirrup_diameter_mm: 8, stirrup_spacing_mm: 200, stirrup_legs: 2,
      top: { count: 2, diameter_mm: 16 }, bottom: { count: 2, diameter_mm: 16 },
    },
    length_m: l_m,
    column: { bracing: "Geschoord", buckling_length: A, ...kolom },
    forces_envelope: [0, l_m * 500, l_m * 1000].map((x) => ({
      combination_id: 1, position_mm: x,
      forces: { n_ed: -n_kn, vy_ed: 0, vz_ed: 0, mt_ed: 0, my_ed: my, mz_ed: mz },
    })),
  });
  const toets = (r, id) => r.checks.find((c) => c.id === id)?.kind?.data;
  const variabele = (t, symbool) => t.variables.find((v) => v.symbol === symbool)?.value;

  // ── 3a. Zonder normaaldruk is art. 5.8.9 niet aan de orde ─────────────
  {
    const r = await kern("concrete_column_check", verzoek({ n_kn: 0, my: 30, kolom: { m0_edz_knm: 30 } }));
    eq("de poort om y meldt dat 5.8 niet van toepassing is",
      toets(r, "5.8.3.1_slankheidsgrens").status, "NotApplicable");
    for (const id of ["5.8.3.1_slankheidsgrens_z", "5.8.9_moment_z", "5.8.9_dubbele_buiging"]) {
      ok(`${id} staat er zonder druk niet`, toets(r, id) === undefined);
    }
    ok("en de velden om z zijn leeg (null: serde schrijft None als null)", r.lambda_z == null && r.m_edz_knm == null);
  }

  // ── 3b. De imperfectie om z, met de hand ──────────────────────────────
  {
    const r = await kern("concrete_column_check", verzoek({ l_m: 3, n_kn: 600, my: 40 }));
    dicht("e_i (l = 3 m, l₀,z = 3 m) = θ_i·l₀/2 = 5,0 mm", r.e_i_z_mm, 5.0, 1e-9);
    const lang = await kern("concrete_column_check", verzoek({ l_m: 12, n_kn: 400, my: 20 }));
    dicht("e_i (l = 12 m) = (2/3)/300 · 12 000/2 = 13,333 mm", lang.e_i_z_mm, 12000 / 900, 1e-9);
    ok("bij λ_z = 138,6 wordt e₂ om z gerekend en is hij > 0",
      lang.tweede_orde_verwaarloosbaar_z === false && lang.e_2_z_mm > 0, `e₂ = ${lang.e_2_z_mm}`);
    dicht("M_Ed,z = N_Ed·(e_i + e₂) — en dat is NIET nul ondanks M_z = 0 uit het model",
      lang.m_edz_knm, 400 * (12000 / 900 + lang.e_2_z_mm) / 1000, 1e-9);
    ok("M_Ed,z ligt boven de ondergrens N_Ed·e₀ = 8,0 kNm van 6.1(4)", lang.m_edz_knm > 8.0);
    const mz = toets(lang, "5.8.9_moment_z");
    eq("de toets van het moment om z is groen", mz.status, "Ok");
    dicht("en zijn unity check is M_Ed,z/M_Rd,z", mz.uc.uc, lang.m_edz_knm / lang.m_rdz_knm, 1e-9);
    ok("de afleiding noemt art. 5.2(7) en de NB-waarde 1/300",
      mz.deelstappen.some((d) => d.article.includes("5.2(5)") && d.article.includes("1/300")));
  }

  // ── 3c. (5.38a) op de grens ───────────────────────────────────────────
  //
  // l₀,y = l = 3 m; l₀,z rechtstreeks 6,000 m → λ_z/λ_y = 2,000: vervuld.
  // 6,003 m → 2,001: niet vervuld, en dan is (5.39) vereist.
  {
    const wel = await kern("concrete_column_check", verzoek({
      n_kn: 600, my: 60, kolom: { buckling_length_z: { soort: "Opgegeven", l0_m: 6.0 } },
    }));
    dicht("λ_z/λ_y = 2,000 precies", wel.lambda_z / wel.lambda, 2.0, 1e-12);
    const db = toets(wel, "5.8.9_dubbele_buiging");
    ok("op de grens mag het apart: geen unity check, wel groen",
      db.status === "Ok" && db.uc == null, JSON.stringify(db.uc));
    ok("en de reden zegt dat geen verdere controle nodig is",
      db.notes.some((n) => n.includes("Geen verdere controle nodig")));

    const niet = await kern("concrete_column_check", verzoek({
      n_kn: 600, my: 60, kolom: { buckling_length_z: { soort: "Opgegeven", l0_m: 6.003 } },
    }));
    dicht("λ_z/λ_y = 2,001", niet.lambda_z / niet.lambda, 2.001, 1e-9);
    const db2 = toets(niet, "5.8.9_dubbele_buiging");
    ok("net erboven is (5.39) vereist: er is een unity check",
      db2.uc !== undefined && niet.interactie_5_39 > 0);
  }

  // ── 3d. De exponent a op de drie ankerpunten en ertussen ──────────────
  //
  //   N_Ed = 150 kN:  N_Ed/N_Rd = 0,0698 ≤ 0,1 → a = 1,0; λ_lim,z = 40,0 > λ = 34,6
  //                   → e₂ = 0 en M_Ed,z = 30 + 150·5,0/1000 = 30,75 kNm (exact)
  //   N_Ed = 0,7·N_Rd = 1504,771 kN → a = 1,5
  //   N_Ed = 600 kN:  0,279112 → a = 1 + (0,279112 − 0,1)/0,6·0,5 = 1,149260
  {
    const a10 = await kern("concrete_column_check", verzoek({ n_kn: 150, my: 30, kolom: { m0_edz_knm: 30 } }));
    const db = toets(a10, "5.8.9_dubbele_buiging");
    dicht("a = 1,0 bij N_Ed/N_Rd ≤ 0,1", variabele(db, "a"), 1.0, 1e-12);
    dicht("N_Rd = A_c·f_cd + A_s·f_yd", variabele(db, "N_Rd"), N_RD_KN, 1e-9);
    dicht("M_Ed,z = 30 + 150·5,0/1000 = 30,75 kNm (e₂ = 0: λ < λ_lim)", a10.m_edz_knm, 30.75, 1e-12);
    dicht("M_Rd,z = M_Rd,y: vier hoekstaven zijn om beide assen dezelfde korf",
      variabele(db, "M_Rdz"), variabele(db, "M_Rdy"), 1e-9);
    dicht("(5.39) met a = 1: (30,75 + 30)/M_Rd", db.uc.uc, 60.75 / variabele(db, "M_Rdz"), 1e-12);
    ok("en dat is hier maatgevend: de som ligt boven 1 terwijl elke richting apart eronder blijft",
      db.status === "NotOk" && db.uc.uc > 1 && toets(a10, "5.8.9_moment_z").uc.uc < 1);

    const a15 = await kern("concrete_column_check", verzoek({ n_kn: 0.7 * N_RD_KN, my: 30, kolom: { m0_edz_knm: 30 } }));
    dicht("a = 1,5 bij N_Ed/N_Rd = 0,7", variabele(toets(a15, "5.8.9_dubbele_buiging"), "a"), 1.5, 1e-9);
    ok("bij die druk wordt e₂ om z gerekend", a15.tweede_orde_verwaarloosbaar_z === false && a15.e_2_z_mm > 0);

    const ai = await kern("concrete_column_check", verzoek({ n_kn: 600, my: 30, kolom: { m0_edz_knm: 30 } }));
    dicht("a geïnterpoleerd bij N_Ed = 600 kN", variabele(toets(ai, "5.8.9_dubbele_buiging"), "a"),
      1 + (600 / N_RD_KN - 0.1) / 0.6 * 0.5, 1e-9);
  }

  // ── 3e. De schoring om z is een eigen gegeven ─────────────────────────
  {
    const r = await kern("concrete_column_check", verzoek({
      n_kn: 600, my: 40, kolom: { bracing_z: "Ongeschoord", buckling_length_z: CONSOLE },
    }));
    dicht("l₀,z = 2·l als console om z", r.l0_z_mm, 6000, 1e-12);
    dicht("λ_z = 2·λ_y", r.lambda_z, 2 * r.lambda, 1e-12);
    const pz = toets(r, "5.8.3.1_slankheidsgrens_z");
    ok("de poort om z zegt dat beide apart zijn opgegeven",
      pz.notes.some((n) => n.includes("apart opgegeven voor deze as")));
    ok("en heeft geen unity check: e₂ wordt zelf verwerkt, er valt niets af te keuren",
      pz.uc == null && pz.status === "Ok");

    const zonder = await kern("concrete_column_check", verzoek({ n_kn: 600, my: 40 }));
    ok("zonder eigen keuze meldt de kern de terugval op het vlak",
      toets(zonder, "5.8.3.1_slankheidsgrens_z").notes.some((n) => n.includes("overgenomen van het rekenvlak")));
  }
}

log(`\n${passed} geslaagd, ${failed} mislukt${overgeslagen ? `, ${overgeslagen} overgeslagen` : ""}`);
process.exit(failed === 0 ? 0 : 1);
