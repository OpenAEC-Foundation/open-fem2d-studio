// De normnaad aan de kant van de app: de nationale bijlage van het project
// reist mee naar elke toetsinvoer, en een bijlage die deze uitgave niet kent
// wordt GEWEIGERD in plaats van stil als Nederlands doorgerekend.
//
// WAT HIER VASTLIGT, EN WAAROM
//
// `projectInfo.nationaleBijlage` stond al in het projectbestand, maar werd door
// niemand gelezen: de keuze bestond alleen op papier. Wie hem op iets anders
// zette, kreeg gewoon een Nederlandse berekening terug — met een rapport dat
// een ander land noemt. Dat is de gevaarlijkste vorm van fout die deze app kan
// maken: er is geen getal dat het verraadt.
//
// Vier dingen worden hier bewezen:
//
//  1. Elke toetsinvoer die de bouwers opleveren DRAAGT het veld `bijlage`.
//     Laat een bouwer het vallen, dan rekent die kern met zijn eigen
//     standaardwaarde en is de keuze van het project stil verdwenen.
//  2. Een bijlage die deze uitgave niet kent, wordt door de sidecar (de
//     MCP-weg) geweigerd met de reden erbij.
//  3. "NL" en een ONTBREKEND veld lopen gewoon door — een weigering die alles
//     weigert bewijst niets, en projectbestanden van vóór de naad hebben het
//     veld niet.
//  4. De TS-rij van de aanduidingen weigert dezelfde codes als de Rust-rij, en
//     valt niet terug.
//
// Draaien met: npx tsx test-normnaad.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));

const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const {
  BIJLAGEN_GEVULD,
  STANDAARD_BIJLAGE,
  aanduidingen,
  bijlageUitBestand,
} = await import("./src/lib/normAanduidingen.ts");

let geslaagd = 0;
let gefaald = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(naam, voorwaarde, extra = "") {
  if (voorwaarde) {
    geslaagd++;
    log(`  ✓ ${naam}${extra ? " — " + extra : ""}`);
  } else {
    gefaald++;
    log(`  ✗ ${naam}${extra ? " — " + extra : ""}`);
  }
}

/** Het houten raamwerk uit de referentiemap, als tekst. */
const PROJECT = readFileSync(join(HIER, "referentie", "R19.femp"), "utf8");

/** Hetzelfde project met een andere (of weggelaten) bijlage in de uitgangspunten. */
function projectMetBijlage(code) {
  const b = JSON.parse(PROJECT);
  b.projectInfo = b.projectInfo ?? {};
  b.projectInfo.uitgangspunten = { ...(b.projectInfo.uitgangspunten ?? {}) };
  if (code === null) delete b.projectInfo.uitgangspunten.nationaleBijlage;
  else b.projectInfo.uitgangspunten.nationaleBijlage = code;
  return JSON.stringify(b);
}

let id = 1;
function toets(tekst, extra = {}) {
  return verwerkVerzoek({
    v: 1,
    id: id++,
    op: "check",
    payload: { project: { inhoud: tekst }, ...extra },
  });
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De TS-rij van de naad weigert een bijlage die niet gevuld is");
{
  check("er is precies één gevulde bijlage", BIJLAGEN_GEVULD.length === 1, BIJLAGEN_GEVULD.join(", "));
  check("de standaardbijlage is er één van", BIJLAGEN_GEVULD.includes(STANDAARD_BIJLAGE));
  check("de gevulde bijlage heeft aanduidingen", aanduidingen(STANDAARD_BIJLAGE).land.length > 0,
    aanduidingen(STANDAARD_BIJLAGE).land);

  let fout = null;
  try { bijlageUitBestand("DE"); } catch (e) { fout = e.message; }
  check("een niet-gevulde code gooit met reden", fout !== null && /niet gevuld/.test(fout), fout ?? "geen fout");
  check("en noemt de code", fout !== null && fout.includes("DE"));
  // Weglaten is iets anders dan een verkeerde keuze: null, geen fout.
  check("een ontbrekende waarde is null en geen fout", bijlageUitBestand(undefined) === null);
  check("een lege tekst ook", bijlageUitBestand("") === null);
  check("een tikfout in de code wordt niet stilzwijgend NL", (() => {
    try { bijlageUitBestand("nl"); return false; } catch { return true; }
  })());
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Elke toetsinvoer draagt de bijlage van het project");
{
  const a = toets(projectMetBijlage("NL"));
  check("de toetsing slaagt", a.ok === true, a.ok ? "" : JSON.stringify(a.fout ?? a).slice(0, 300));
  if (a.ok) {
    const soorten = [
      ["staal", a.result.steel_check_inputs],
      ["hout", a.result.timber_check_inputs],
      ["kruislaaghout", a.result.clt_check_inputs],
      ["beton", a.result.concrete_check_inputs],
    ];
    let gezien = 0;
    for (const [naam, lijst] of soorten) {
      if (!Array.isArray(lijst) || lijst.length === 0) continue;
      gezien += lijst.length;
      check(
        `${naam}: alle ${lijst.length} invoer(en) dragen bijlage "NL"`,
        lijst.every((i) => i.bijlage === "NL"),
        JSON.stringify(lijst.map((i) => i.bijlage)),
      );
    }
    check("er is minstens één toetsinvoer om iets aan te bewijzen", gezien > 0, `${gezien} invoer(en)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Een niet-gevulde bijlage wordt geweigerd, niet stil als NL gerekend");
{
  const a = toets(projectMetBijlage("DE"));
  const tekst = JSON.stringify(a);
  check("de toetsing slaagt NIET", a.ok !== true, a.ok === true ? "hij rekende gewoon door" : "");
  check("en de reden staat erbij", /niet gevuld/.test(tekst), tekst.slice(0, 300));
  check("met de gevraagde code erin", tekst.includes("DE"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Zonder het veld loopt een bestand van vóór de naad gewoon door");
{
  const a = toets(projectMetBijlage(null));
  check("de toetsing slaagt", a.ok === true, a.ok ? "" : JSON.stringify(a.fout ?? a).slice(0, 300));
  if (a.ok) {
    const staal = a.result.steel_check_inputs ?? [];
    const hout = a.result.timber_check_inputs ?? [];
    const alle = [...staal, ...hout];
    check(
      "en de invoer draagt de enige gevulde bijlage",
      alle.length > 0 && alle.every((i) => i.bijlage === STANDAARD_BIJLAGE),
      JSON.stringify(alle.map((i) => i.bijlage)),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Issue #17: `check_fem_model` kan een losse `bijlage` meegeven. Die heeft
// VOORRANG boven het projectbestand (wie hem uitdrukkelijk meegeeft, bedoelt
// deze), en wordt met dezelfde reden geweigerd als hij niet gevuld is.
log("\n[5] Een bijlage in het verzoek gaat voor het projectbestand, met dezelfde weigering");
{
  const zonder = toets(projectMetBijlage(null));
  const metNl = toets(projectMetBijlage(null), { bijlage: "NL" });
  check("verzoek NL: de toetsing slaagt", metNl.ok === true, metNl.ok ? "" : JSON.stringify(metNl).slice(0, 300));
  check("verzoek NL geeft exact dezelfde toetsinvoer als zonder verzoek",
    metNl.ok && zonder.ok &&
      JSON.stringify(metNl.result.steel_check_inputs) === JSON.stringify(zonder.result.steel_check_inputs) &&
      JSON.stringify(metNl.result.timber_check_inputs) === JSON.stringify(zonder.result.timber_check_inputs));
  check("en dezelfde combinatieresultaten",
    metNl.ok && zonder.ok &&
      JSON.stringify(metNl.result.combinations) === JSON.stringify(zonder.result.combinations));

  const vreemdVerzoek = toets(projectMetBijlage("NL"), { bijlage: "DE" });
  const tekst = JSON.stringify(vreemdVerzoek);
  check("verzoek DE boven een NL-bestand: geweigerd, niet stil NL", vreemdVerzoek.ok !== true);
  check("met de reden", /niet gevuld/.test(tekst) && tekst.includes("DE"), tekst.slice(0, 300));

  const voorrang = toets(projectMetBijlage("DE"), { bijlage: "NL" });
  check("verzoek NL boven een bestand met DE: het verzoek wint en de toetsing slaagt",
    voorrang.ok === true, voorrang.ok ? "" : JSON.stringify(voorrang).slice(0, 300));
  if (voorrang.ok) {
    const alle = [...(voorrang.result.steel_check_inputs ?? []), ...(voorrang.result.timber_check_inputs ?? [])];
    check("en elke toetsinvoer draagt de bijlage van het verzoek",
      alle.length > 0 && alle.every((i) => i.bijlage === "NL"), JSON.stringify(alle.map((i) => i.bijlage)));
  }
  const leeg = toets(projectMetBijlage(null), { bijlage: "" });
  check("een lege bijlage in het verzoek is een invoerfout, geen stille terugval",
    leeg.ok !== true, JSON.stringify(leeg).slice(0, 200));
}

log("");
log(gefaald === 0 ? `✅ ${geslaagd} geslaagd, 0 gefaald` : `❌ ${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);
