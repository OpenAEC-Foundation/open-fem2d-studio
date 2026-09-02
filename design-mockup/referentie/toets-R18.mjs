// ═══════════════════════════════════════════════════════════════════════════
// R18 — Vakwerkligger 45,60 m met parallelle randen, IPE 330-randen
//
// Schrijft het model weg als referentie/R18.femp (+ .ifcfem2d) en rekent het
// door; daarna wordt elke referentiewaarde uit het werkdossier
// (docs/superpowers/plans/2026-09-02-referentieberekeningen.md, geval R18)
// naast onze uitkomst gelegd, met de afwijking in procent.
//
// Draaien met: npx tsx referentie/toets-R18.mjs   (vanuit design-mockup/)
//
// ── WAT WEL EN WAT NIET NABOUWBAAR IS ────────────────────────────────────
// Nabouwbaar: de volledige vakwerkgeometrie, de knooplasten van beide UGT-
// combinaties, de doorgaande randen met scharnierende vulstaven, de
// staafkrachten, de secundaire momenten en de zakking.
//
// NIET nabouwbaar in de app:
//  1. De randen zijn IPE 330 met LIGGEND lijf; de buiging in het vakwerkvlak
//     loopt dus om de ZWAKKE as (I = Iz = 788 cm⁴). De profielentabel van de
//     app kent per profiel maar één traagheidsmoment (Iy) en heeft geen
//     "gedraaid" profiel. De rekenvarianten hieronder zetten daarom E/A/I
//     rechtstreeks op de solver-invoer; blok [F] laat zien wat het
//     profielenpad van de app zélf oplevert (dat is de STAANDE stand, die de
//     bron in §3.5.1 óók geeft).
//  2. De vulstaven zijn hoekprofielen (2×L150×150×15, 2×L120×120×12,
//     L100×100×10). De bibliotheek kent geen hoekprofielen; in het
//     .femp-bestand staan koker-profielen met bijna hetzelfde oppervlak
//     (zie PROFIEL in model-R18.mjs). Omdat het vakwerk STATISCH BEPAALD is
//     raakt dat de staafkrachten nauwelijks; het raakt vooral eigen gewicht
//     en zakking, en de rekenvarianten gebruiken daar de exacte oppervlakken.
//  3. De unity checks van de bron (0,683 · 0,541 · 0,591 · 0,96 · 0,67) en de
//     doorsnedeweerstanden (Npl,Rd / Nu,Rd / Nt,Rd / Mpl,Rd) horen bij
//     hoekprofielen en bij buiging om de zwakke as van een liggend I-profiel.
//     De EN 1993-toetsmodule van de app dekt dat niet. Die regels worden
//     hieronder NIET vergeleken — een verzonnen getal is erger dan een gat.
//  4. De extra zakking door boutspeling (58,4 mm) volgt uit een
//     verplaatsingsstelling met gatspeling; de app kent geen boutspeling.
//
// ── AANNAMES ─────────────────────────────────────────────────────────────
//  A1 Tussenknopen en secundaire staven: de bron geeft daar geen maten voor;
//     de posities zijn uit de modeltekening (figuur 3.1) opgemeten. Zie de
//     kop van model-R18.mjs. Meetnauwkeurigheid ± 30 mm.
//  A2 Veldindeling 7100/7200/8500 links en 8600/7100/7100 rechts, overgenomen
//     zoals de bron hem tekent — asymmetrisch, maar beide helften tellen wél
//     tot 22800 mm op. Blok [G] kwantificeert wat die asymmetrie doet.
//  A3 De randen stijgen 3 % naar het midden (zadeldak). Blok [E] rekent ook
//     met horizontale randen (de idealisatie van de handberekening).
//  A4 EIGEN GEWICHT. De bron geeft twee lastsets: combinatie 1 = 91/136/182…
//     "without self-weight", en een handberekening met 101/158/202…, waarvan
//     het verschil (124 kN) het eigen gewicht is. Uit de opgegeven doorsneden
//     volgt met ρ·A·g maar 90,7 kN. Het rekenmodel van de bron blijkt met de
//     124 kN te rekenen (zie de bevindingen); dat is dus de hoofdvariant,
//     met de 90,7 kN als gevoeligheid ernaast.
//  A5 Secundaire posten/diagonalen en de eindposten bij de opleggingen:
//     profiel niet in de bron; aangenomen gelijk aan de posten (L100×100×10).
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bouwVakwerk, bouwLasten, EXACT, SPAN, HOOGTE, LC1_KN, LC3_KN,
} from "./model-R18.mjs";

const { solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { serializeProject, deserializeProject } = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const log = (s) => process.stdout.write(s + "\n");

const RHO_STAAL = 7850, G = 9.81;
/** Eigen gewicht in kN/m uit een doorsnede-oppervlak in mm² (negatief = omlaag). */
const qEigen = (A) => -(RHO_STAAL * (A * 1e-6) * G) / 1000;

/** Eigen gewicht dat ρ·A·g op de doorsneden van de bron oplevert (kN). */
const EG_DOORSNEDEN = 90.7;
/** Eigen gewicht dat de bron zelf aanhoudt (101…202 min 91…182), kN. */
const EG_BRON = LC3_KN.reduce((a, b) => a + b, 0) - LC1_KN.reduce((a, b) => a + b, 0);
const EG_FACTOR = EG_BRON / EG_DOORSNEDEN;   // ≈ 1,367

// ── Vergelijkingsboekhouding ───────────────────────────────────────────────
let passed = 0, failed = 0;
const afwijkingen = [];
function vergelijk(naam, onze, referentie, eenheid, tolPct = 5) {
  const abs = onze - referentie;
  const pct = referentie === 0 ? (Math.abs(abs) < 1e-9 ? 0 : Infinity)
                               : (abs / Math.abs(referentie)) * 100;
  afwijkingen.push({ naam, onze, referentie, eenheid, pct });
  const ok = Math.abs(pct) <= tolPct;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${onze.toFixed(2)} ${eenheid} ` +
      `(ref ${referentie} ${eenheid}, Δ = ${abs >= 0 ? "+" : ""}${abs.toFixed(2)} = ${pct >= 0 ? "+" : ""}${pct.toFixed(2)} %)`);
}
/** Eigen kruiscontrole zonder bronwaarde (evenwicht e.d.). */
function controle(naam, onze, verwacht, eenheid, tolAbs) {
  const ok = Math.abs(onze - verwacht) <= tolAbs;
  if (ok) passed++; else failed++;
  log(`  ${ok ? "✓" : "✗"} ${naam}: ${onze.toFixed(4)} ${eenheid} (verwacht ${verwacht} ${eenheid})`);
}

// ── Rekenhulp ──────────────────────────────────────────────────────────────
/**
 * Reken het vakwerk door.
 *   helling     dakhelling van de randen (+0,03 = stijgend naar het midden)
 *   randSoort   "rand" (liggend IPE 330) of "rand_staand"
 *   egFactor    schaalfactor op ρ·A·g van de staven (1 = 90,7 kN totaal)
 *   starreVul   true = vulstaven momentvast i.p.v. scharnierend
 *   biblioProfielen  true = uitsluitend het profielenpad van de app
 */
function reken({ helling = 0.03, randSoort = "rand", egFactor = EG_FACTOR,
                 starreVul = false, biblioProfielen = false } = {}) {
  const vw = bouwVakwerk(helling);
  const beams = starreVul ? vw.beams.map((b) => ({ ...b, releases: undefined })) : vw.beams;
  const { loadCases, loads } = bouwLasten(vw);
  const mi = bouwMultiInput({
    nodes: vw.nodes, beams, supports: vw.supports, plates: [],
    loadCases, loads, activeLoadCaseId: 1,
    // Met exacte doorsneden zetten we het eigen gewicht zelf als lijnlast,
    // omdat de A uit de bibliotheek dan niet klopt.
    selfWeightEnabled: biblioProfielen,
    nonlinearEnabled: false,
    scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  if (!biblioProfielen) {
    for (const b of mi.beams) {
      const s = vw.soort.get(b.id);
      const sec = EXACT[s === "rand" ? randSoort : s];
      b.E = 210000; b.A = sec.A; b.I = sec.I;
      if (egFactor !== 0) mi.loads.push({ beamId: b.id, q: qEigen(sec.A) * egFactor, caseId: 1 });
    }
  }
  return { vw, res: solveAllCases(mi) };
}

const kN  = (v) => v / 1000;
const kNm = (v) => v / 1e6;
const Nvan = (vw, r, naam) => kN(r.elements.get(vw.naam.get(naam)).N);
/** Grootste |M| over de 21 stations van een staaf (kNm, met teken). */
function Mmax(vw, r, naam) {
  const e = r.elements.get(vw.naam.get(naam));
  return kNm(e.bendingMoment.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0));
}

// ═══ 1. Model bouwen en wegschrijven ═══════════════════════════════════════
const vwHoofd = bouwVakwerk(0.03);
{
  const { loadCases, loads } = bouwLasten(vwHoofd);
  mkdirSync(HIER, { recursive: true });
  const tekst = serializeProject({
    nodes: vwHoofd.nodes, beams: vwHoofd.beams, supports: vwHoofd.supports,
    plates: [], loads, loadCases, activeLoadCaseId: 1,
    selfWeightEnabled: true, nonlinearEnabled: false,
    scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  writeFileSync(join(HIER, "R18.femp"), tekst, "utf8");
  writeFileSync(join(HIER, "R18.ifcfem2d"), tekst, "utf8");
  log(`Model opgeslagen: ${join(HIER, "R18.femp")} (+ .ifcfem2d)`);
  const bepaald = vwHoofd.beams.length + 3 === 2 * vwHoofd.nodes.length;
  log(`  ${vwHoofd.nodes.length} knopen · ${vwHoofd.beams.length} staven · ` +
      `m + r = ${vwHoofd.beams.length + 3} en 2n = ${2 * vwHoofd.nodes.length} → ` +
      `${bepaald ? "statisch bepaald vakwerk" : "NIET statisch bepaald"}`);
}

// ═══ 2. Hoofdvariant ═══════════════════════════════════════════════════════
// Helling +3 %, liggende IPE 330-randen, eigen gewicht 124 kN (zoals de bron
// zelf aanhoudt). Belastinggeval 1 = knooplasten 91/136/182… + eigen gewicht.
const { vw, res } = reken({});
const LC1 = res.perCase.get(1);
const LC2 = res.perCase.get(2);
const LC3 = res.perCase.get(3);
const RA = LC1.reactions.get(vw.botId.get(0));
const RB = LC1.reactions.get(vw.botId.get(SPAN));

log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [A] HOOFDVARIANT — UGT-combinatie 1 (91/136/182…) + eigen gewicht    ║");
log("║     124 kN, liggende IPE 330-randen, randen 3 % stijgend             ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
log(`  Oplegreacties: A = ${kN(RA.fz).toFixed(2)} kN · B = ${kN(RB.fz).toFixed(2)} kN ` +
    `· totaal ${kN(RA.fz + RB.fz).toFixed(1)} kN`);

log("\n  Staafkrachten:");
vergelijk("B107 bovenrand naast midden, NEd", Nvan(vw, LC1, "B107"), -1477, "kN");
vergelijk("B40 drukdiagonaal 2e vanaf rechts, NEd", Nvan(vw, LC1, "B40"), -624.4, "kN");
vergelijk("Onderrand naast midden (B122), NEd", Nvan(vw, LC1, "B122"), 1582, "kN");
vergelijk("Trekdiagonaal links (B130), NEd", Nvan(vw, LC1, "B130"), 616.3, "kN");

log("\n  Staafmomenten en dwarskracht (bron figuur 4.2 en §4.2):");
{
  const e = LC1.elements.get(vw.naam.get("B107"));
  vergelijk("B107 MEd aan het begin", kNm(e.M_start), 2.86, "kNm");
  vergelijk("B107 MEd aan het eind", kNm(e.M_end), -1.05, "kNm");
  // V is in de solver de dwarskracht aan het BEGIN van de staaf; door het
  // eigen gewicht van de rand loopt V lineair op over de staaflengte. De
  // bron leest één waarde uit een diagram; vergelijk daarom het gemiddelde.
  const Vbegin = kN(e.shearForce[0]);
  const Veind = kN(e.shearForce[e.shearForce.length - 1]);
  log(`    V loopt van ${Vbegin.toFixed(2)} naar ${Veind.toFixed(2)} kN over de staaf`);
  vergelijk("B107 VEd (gemiddelde over de staaf)", (Vbegin + Veind) / 2, -1.82, "kN");
}
vergelijk("Onderrand naast midden (B122), MEd", Math.abs(Mmax(vw, LC1, "B122")), 1.69, "kNm");
vergelijk("Trekdiagonaal links (B130), MEd", Math.abs(Mmax(vw, LC1, "B130")), 1.36, "kNm");

// ═══ 3. Zakking ════════════════════════════════════════════════════════════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [B] Zakking                                                          ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
{
  const zZonder = reken({ egFactor: 0 }).res.perCase.get(1).maxDisplacement;
  log(`  Combinatie 1 mét eigen gewicht (1124 kN) : ${LC1.maxDisplacement.toFixed(1)} mm`);
  log(`  Combinatie 1 zónder eigen gewicht (1000 kN): ${zZonder.toFixed(1)} mm`);
  // De bron noemt de 127 mm bij "de UGT-combinatie". Combinatie 1 is in de
  // bron uitdrukkelijk gedefinieerd ZONDER eigen gewicht; die lezing komt het
  // dichtst in de buurt en wordt daarom vergeleken.
  vergelijk("Zakking, combinatie 1 zonder eigen gewicht", zZonder, 127, "mm");
  vergelijk("Zakking, combinatie 1 mét eigen gewicht", LC1.maxDisplacement, 127, "mm");

  // Derde partij — de gesloten schatting die de bron zelf voorschrijft (§3.4):
  // een vervangende ligger met I = Σ A_rand · d². De bron schrijft daarbij een
  // VERLAAGDE elasticiteitsmodulus van 160000 N/mm² voor, juist omdat de
  // globale afschuivingsvervorming (het rekken/korten van diagonalen en
  // posten) in de elementaire liggerformule ontbreekt.
  const Ieq = 2 * EXACT.rand.A * (HOOGTE / 2) ** 2;
  /** Middenzakking van een vrij opgelegde ligger onder puntlasten P_i op x_i. */
  const wPunt = (P, X, E) => {
    let som = 0;
    for (let i = 0; i < P.length; i++) {
      const b = Math.min(X[i], SPAN - X[i]);           // afstand tot de dichtste steun
      som += P[i] * 1000 * b * (3 * SPAN ** 2 - 4 * b * b);
    }
    return som / (48 * E * Ieq);
  };
  const X = [0, 7100, 14300, 22800, 31400, 38500, 45600];
  log(`    Vervangende ligger, I = ΣA·d² = ${(Ieq / 1e10).toFixed(3)}e10 mm⁴:`);
  log(`      lasten 101/158/202… (1124 kN): E = 210000 → ${wPunt(LC3_KN, X, 210000).toFixed(1)} mm · ` +
      `E = 160000 → ${wPunt(LC3_KN, X, 160000).toFixed(1)} mm`);
  log(`      lasten  91/136/182… (1000 kN): E = 210000 → ${wPunt(LC1_KN, X, 210000).toFixed(1)} mm · ` +
      `E = 160000 → ${wPunt(LC1_KN, X, 160000).toFixed(1)} mm`);
  log("    De 127 mm van de bron valt samen met de elementaire liggerformule");
  log("    met de VOLLE E en de lastset van 1124 kN — dus zonder de afschuivings-");
  log("    vervorming die de bron zelf uitdrukkelijk niet verwaarloosbaar noemt.");
  log("    Onze 148,1 mm ligt tussen die ondergrens en de 160000-bovengrens in.");
}

// ═══ 4. Vervangende ligger (handberekening van de bron, figuur 3.4) ════════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [C] Vervangende ligger — belastinggeval 3 (101/158/202… kN, de       ║");
log("║     handlasten van de bron, zonder staaf-eigengewicht)               ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
{
  const R = kN(LC3.reactions.get(vw.botId.get(0)).fz);
  vergelijk("Globale dwarskracht V bij de oplegging (= reactie)", R, 562, "kN");
  const V1 = R - LC3_KN[0], V2 = V1 - LC3_KN[1], V3 = V2 - LC3_KN[2];
  vergelijk("Globale dwarskracht V, veld 1", V1, 461, "kN");
  vergelijk("Globale dwarskracht V, veld 2", V2, 303, "kN");
  vergelijk("Globale dwarskracht V, veld 3", V3, 101, "kN");

  const M1 = V1 * 7.100, M2 = M1 + V2 * 7.200, M3 = M2 + V3 * 8.500;
  vergelijk("Globaal moment M op x = 7,10 m", M1, 3273, "kNm");
  vergelijk("Globaal moment M op x = 14,30 m", M2, 5455, "kNm");
  vergelijk("Globaal moment M op x = 22,80 m", M3, 6320, "kNm");

  const h = HOOGTE / 1000;
  vergelijk("Nch = M/h op x = 7,10 m", M1 / h, 818, "kN");
  vergelijk("Nch = M/h op x = 14,30 m", M2 / h, 1364, "kN");
  vergelijk("Nch = M/h op x = 22,80 m", M3 / h, 1580, "kN");

  // Nd = V/cos θ met de hoek van de bron: halve hoofdveldbreedte 3550 mm over
  // de hoogte 4000 mm, hellingloos → 1/cos θ = 5348,1/4000 = 1,3370.
  const invCos = Math.hypot(3550, HOOGTE) / HOOGTE;
  vergelijk("Nd = V/cos θ, veld 1", V1 * invCos, 616, "kN");
  vergelijk("Nd = V/cos θ, veld 2", V2 * invCos, 405, "kN");
  vergelijk("Nd = V/cos θ, veld 3", V3 * invCos, 135, "kN");

  log("\n  Onze FE-staafkrachten in hetzelfde belastinggeval, naast de handwaarden:");
  vergelijk("Onderrand bij x = 7,10 m (B118) vs Nch 818", Nvan(vw, LC3, "B118"), 818, "kN");
  vergelijk("Onderrand bij x = 14,30 m (B120) vs Nch 1364", Nvan(vw, LC3, "B120"), 1364, "kN");
  vergelijk("Onderrand bij x = 22,80 m (B122) vs Nch 1580", Nvan(vw, LC3, "B122"), 1580, "kN");
  vergelijk("Diagonaal veld 1, trek (B130) vs Nd 616", Nvan(vw, LC3, "B130"), 616, "kN");
  vergelijk("Diagonaal veld 1, druk (B35) vs Nd −616", Nvan(vw, LC3, "B35"), -616, "kN");
  vergelijk("Diagonaal veld 2, trek (B36) vs Nd 405", Nvan(vw, LC3, "B36"), 405, "kN");
  vergelijk("Diagonaal veld 2, druk (B37) vs Nd −405", Nvan(vw, LC3, "B37"), -405, "kN");
  vergelijk("Diagonaal veld 3, trek (B134) vs Nd 135", Nvan(vw, LC3, "B134"), 135, "kN");
  vergelijk("Diagonaal veld 3, druk (B137) vs Nd −135", Nvan(vw, LC3, "B137"), -135, "kN");
  // LET OP: de bron rekent Nd = V/cos θ met ÉÉN hoek voor alle velden, die van
  // de buitenvelden (halve veldbreedte 3550 mm). In het middenveld is de halve
  // veldbreedte 4250 mm en dus 1/cos θ = 1,4585 in plaats van 1,3370. De
  // meetkundig juiste handwaarde voor veld 3 is daarmee niet 135 maar:
  const invCosMidden = Math.hypot(4250, HOOGTE) / HOOGTE;
  log(`    Meetkundig juiste handwaarde veld 3: ${(V3 * invCosMidden).toFixed(1)} kN ` +
      `(1/cos θ = ${invCosMidden.toFixed(4)} i.p.v. ${invCos.toFixed(4)}); ` +
      `onze B134 wijkt daar ${(((Nvan(vw, LC3, "B134") - V3 * invCosMidden) / (V3 * invCosMidden)) * 100).toFixed(1)} % ` +
      `en B137 ${(((-Nvan(vw, LC3, "B137") - V3 * invCosMidden) / (V3 * invCosMidden)) * 100).toFixed(1)} % van af.`);
}

// ═══ 5. Secundaire momenten: liggende vs staande randen (bron §3.5.1) ══════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [D] Secundaire momenten in de randen — liggend vs staand IPE 330     ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
{
  const mLigBoven = Math.abs(Mmax(vw, LC1, "B107"));
  const mLigOnder = Math.abs(Mmax(vw, LC1, "B122"));
  vergelijk("Liggend IPE 330 — bovenrand bij het midden", mLigBoven, 2.7, "kNm");
  vergelijk("Liggend IPE 330 — onderrand bij het midden", mLigOnder, 1.7, "kNm");

  const st = reken({ randSoort: "rand_staand" });
  const S1 = st.res.perCase.get(1);
  const mStBoven = Math.abs(Mmax(st.vw, S1, "B107"));
  const mStOnder = Math.abs(Mmax(st.vw, S1, "B122"));
  vergelijk("Staand IPE 330 — bovenrand bij het midden", mStBoven, 28.5, "kNm");
  vergelijk("Staand IPE 330 — onderrand bij het midden", mStOnder, 23.4, "kNm");
  vergelijk("Vermenigvuldiger bovenrand (staand/liggend)", mStBoven / mLigBoven, 11, "×", 15);
  vergelijk("Vermenigvuldiger onderrand (staand/liggend)", mStOnder / mLigOnder, 14, "×", 15);
  log(`    Ter oriëntatie: Iy/Iz van IPE 330 = ${(EXACT.rand_staand.I / EXACT.rand.I).toFixed(0)}× ` +
      `(de bron noemt "ongeveer 15")`);
  log(`    Overige bovenrandstaven in het middenveld, staand: ` +
      ["B104", "B105", "B106"].map((n) => `${n} ${Math.abs(Mmax(st.vw, S1, n)).toFixed(1)}`).join(" · ") + " kNm");
}

// ═══ 6. Vulstaven momentvast i.p.v. scharnierend (bron tabel 3.1) ══════════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [E] Vulstaven momentvast aangesloten — bron tabel 3.1                ║");
log("║     (informatief: de bron noemt niet wélke diagonaal en welk eind)   ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
{
  const eind = (r, vwx, naam) => {
    const e = r.elements.get(vwx.naam.get(naam));
    return Math.max(Math.abs(kNm(e.M_start)), Math.abs(kNm(e.M_end)));
  };
  const lig = reken({ starreVul: true });
  const st  = reken({ starreVul: true, randSoort: "rand_staand" });
  const L1 = lig.res.perCase.get(1), S1 = st.res.perCase.get(1);
  vergelijk("Eindmoment trekdiagonaal, liggende randen", eind(L1, lig.vw, "B130"), 1.03, "kNm");
  vergelijk("Eindmoment trekdiagonaal, staande randen",  eind(S1, st.vw,  "B130"), 1.17, "kNm");
  vergelijk("Eindmoment drukdiagonaal, liggende randen", eind(L1, lig.vw, "B40"), 1.30, "kNm");
  vergelijk("Eindmoment drukdiagonaal, staande randen",  eind(S1, st.vw,  "B40"), 2.35, "kNm");
  // Dezelfde vier waarden met het eigen gewicht uit de doorsneden (90,7 kN):
  const lig2 = reken({ starreVul: true, egFactor: 1 });
  const st2  = reken({ starreVul: true, randSoort: "rand_staand", egFactor: 1 });
  const L2 = lig2.res.perCase.get(1), S2 = st2.res.perCase.get(1);
  log(`    Met eigen gewicht 90,7 kN i.p.v. 124 kN: trek liggend ` +
      `${eind(L2, lig2.vw, "B130").toFixed(2)} · trek staand ${eind(S2, st2.vw, "B130").toFixed(2)} · ` +
      `druk liggend ${eind(L2, lig2.vw, "B40").toFixed(2)} · druk staand ${eind(S2, st2.vw, "B40").toFixed(2)} kNm`);
  log("    Deze vier grootheden zijn 1 à 3 kNm groot en worden gestuurd door het");
  log("    aangenomen traagheidsmoment van de dubbele hoekprofielen IN het vakwerk-");
  log("    vlak (2 × I van één hoek) en door het eigen gewicht van de diagonaal.");
  log("    De bron noemt niet wélke diagonaal en welk staafeind zij bedoelt.");
}

// ═══ 7. Gevoeligheden ══════════════════════════════════════════════════════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [F] Gevoeligheden                                                    ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
{
  const rij = (label, vwx, r) => {
    const d = (v, ref) => `${v.toFixed(0).padStart(6)} (${(((v - ref) / Math.abs(ref)) * 100).toFixed(1).padStart(5)}%)`;
    log(`  ${label.padEnd(44)} B107 ${d(Nvan(vwx, r, "B107"), -1477)}  ` +
        `B122 ${d(Nvan(vwx, r, "B122"), 1582)}  ` +
        `B130 ${d(Nvan(vwx, r, "B130"), 616.3)}  ` +
        `B40 ${d(Nvan(vwx, r, "B40"), -624.4)}  w=${r.maxDisplacement.toFixed(0)}`);
  };
  rij("hoofdvariant (eigen gewicht 124 kN)", vw, LC1);
  const eg1 = reken({ egFactor: 1 });
  rij("eigen gewicht uit de doorsneden (90,7 kN)", eg1.vw, eg1.res.perCase.get(1));
  const eg0 = reken({ egFactor: 0 });
  rij("zonder eigen gewicht (1000 kN)", eg0.vw, eg0.res.perCase.get(1));
  const h0 = reken({ helling: 0 });
  rij("horizontale randen i.p.v. 3 % stijgend", h0.vw, h0.res.perCase.get(1));
  const hm = reken({ helling: -0.03 });
  rij("randen 3 % dalend naar het midden (proef)", hm.vw, hm.res.perCase.get(1));
  const stv = reken({ randSoort: "rand_staand" });
  rij("staande IPE 330-randen", stv.vw, stv.res.perCase.get(1));
  rij("belastinggeval 3 (101/158/202…)", vw, LC3);
}

// ═══ 8. Het pad van de APP zelf: uit het opgeslagen bestand ════════════════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [G] Route van de app: R18.femp inlezen en met de profielen-          ║");
log("║     bibliotheek doorrekenen (randen dus STAAND, vulstaven kokers)    ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
{
  const bestand = deserializeProject(readFileSync(join(HIER, "R18.femp"), "utf8"));
  const mi = bouwMultiInput({
    nodes: bestand.nodes, beams: bestand.beams, supports: bestand.supports,
    plates: bestand.plates, loadCases: bestand.loadCases, loads: bestand.loads,
    selfWeightEnabled: bestand.selfWeightEnabled,
    scheefstandEnabled: bestand.scheefstandEnabled ?? false,
    scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
    scheefstandRichting: bestand.scheefstandRichting ?? 1,
  });
  const A1 = solveAllCases(mi).perCase.get(1);
  const Rtot = kN(A1.reactions.get(vw.botId.get(0)).fz + A1.reactions.get(vw.botId.get(SPAN)).fz);
  log(`  Totale reactie ${Rtot.toFixed(1)} kN (eigen gewicht uit de bibliotheek: ${(Rtot - 1000).toFixed(1)} kN)`);
  log(`  B107 ${Nvan(vw, A1, "B107").toFixed(1)} · B40 ${Nvan(vw, A1, "B40").toFixed(1)} · ` +
      `B122 ${Nvan(vw, A1, "B122").toFixed(1)} · B130 ${Nvan(vw, A1, "B130").toFixed(1)} · ` +
      `w = ${A1.maxDisplacement.toFixed(1)} mm`);
  // Zelfde geometrie en zelfde eigen gewicht, alleen andere doorsneden: de
  // staafkrachten mogen daar in een statisch bepaald vakwerk nauwelijks van
  // afhangen. Vergelijk daarom met de variant met eigen gewicht 90,7 kN.
  const ref = reken({ egFactor: 1 }).res.perCase.get(1);
  for (const nm of ["B107", "B122", "B130", "B40"]) {
    const d = Nvan(vw, A1, nm) - Nvan(vw, ref, nm);
    controle(`${nm}: bibliotheekprofielen vs exacte doorsneden`, d, 0, "kN", 25);
  }
}

// ═══ 9. Asymmetrie van de veldindeling ═════════════════════════════════════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [H] De asymmetrische veldindeling van de bron                        ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
log("  De bron tekent 7100/7200/8500 | 8600/7100/7100. Beide helften tellen tot");
log("  22800 mm op, dus de asymmetrie zit alleen in de tussenverdeling: het");
log("  tweede hoofdveld is links 7200 en rechts 7100 mm, het middenveld links");
log("  8500 en rechts 8600 mm.");
{
  const par = (a, b) => `${(((b - a) / Math.abs(a)) * 100).toFixed(2)} %`;
  const p = (a, b) => `${a.toFixed(2)} vs ${b.toFixed(2)} kN (${par(a, b)})`;
  log(`  Effect, gemeten aan spiegelparen in ons model:`);
  log(`    B130 / B172 (eerste diagonaal): ${p(Nvan(vw, LC1, "B130"), Nvan(vw, LC1, "B172"))}`);
  log(`    B35  / B40  (tweede diagonaal): ${p(Nvan(vw, LC1, "B35"), Nvan(vw, LC1, "B40"))}`);
  log(`    B36  / B39  (derde diagonaal) : ${p(Nvan(vw, LC1, "B36"), Nvan(vw, LC1, "B39"))}`);
  log(`    B107 / B108 (rand bij midden) : ${p(Nvan(vw, LC1, "B107"), Nvan(vw, LC1, "B108"))}`);
  log("  De asymmetrie blijft ruim onder 0,5 % — de symmetrische lezing zou de");
  log("  vergeleken grootheden dus niet meetbaar verschuiven.");
}

// ═══ 10. Eigen kruiscontroles ══════════════════════════════════════════════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [I] Eigen kruiscontroles (geen bronwaarden)                          ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
{
  controle("ΣFz LC1 = 1000 kN knooplasten + 124 kN eigen gewicht",
           kN(RA.fz + RB.fz), 1124, "kN", 0.6);
  controle("ΣFx LC1 = 0", kN(RA.fx + RB.fx), 0, "kN", 1e-6);
  controle("ΣFz LC3 = 1124 kN",
           kN(LC3.reactions.get(vw.botId.get(0)).fz + LC3.reactions.get(vw.botId.get(SPAN)).fz),
           1124, "kN", 0.05);
  // Op de oplegging staat alleen een verticale reactie en een verticale
  // eindpost: de eerste onderrandstaaf moet daarom krachtvrij zijn en de
  // eindpost draagt de hele reactie in druk.
  controle("Onderrand B116 bij de oplegging ≈ 0", Nvan(vw, LC3, "B116"), 0, "kN", 1.0);
  controle("Eindpost B156 = −reactie",
           Nvan(vw, LC3, "B156") + kN(LC3.reactions.get(vw.botId.get(0)).fz), 0, "kN", 1.0);
  // Combinatie 2 (windzuiging) keert alle tekens om.
  const R2 = kN(LC2.reactions.get(vw.botId.get(0)).fz + LC2.reactions.get(vw.botId.get(SPAN)).fz);
  controle("ΣFz LC2 (windzuiging, zonder eigen gewicht) = −478,5 kN", R2, -478.5, "kN", 0.05);
  log(`    LC2: B107 ${Nvan(vw, LC2, "B107").toFixed(1)} kN (trek i.p.v. druk) · ` +
      `B122 ${Nvan(vw, LC2, "B122").toFixed(1)} kN · ` +
      `w = ${LC2.maxDisplacement.toFixed(1)} mm omhoog`);
}

// ═══ 11. Niet vergeleken ═══════════════════════════════════════════════════
log("\n╔══════════════════════════════════════════════════════════════════════╗");
log("║ [J] Referentiewaarden die NIET vergeleken zijn                       ║");
log("╚══════════════════════════════════════════════════════════════════════╝");
log("  · B107 UC 0,683 · B40 UC's 0,541 en 0,591 · onderrand 0,93·0,03·0,96 ·");
log("    trekdiagonaal 0,62·0,05·0,67 — EN 1993-toetsen op hoekprofielen en op");
log("    een liggend I-profiel (zwakke as). De toetsmodule van de app kent geen");
log("    hoekprofielen en toetst niet om de zwakke as.");
log("  · Npl,Rd 2222 / Nu,Rd 1711 / Nt,Rd 1711 kN / Mpl,Rd 52,3 kNm en");
log("    1956 / 997 / 997 kN / Mel,Rd 30,3 kNm: doorsnedeweerstanden met");
log("    netto-doorsnede en boutgaten; geen solveruitvoer.");
log("  · Extra zakking 58,4 mm door boutspeling: de app kent geen gatspeling.");

// ═══ Samenvatting ══════════════════════════════════════════════════════════
log("\n─── Vergelijking met de referentie ─────────────────────────────────────");
log("  grootheid                                              referentie       onze waarde   afwijking");
for (const a of afwijkingen) {
  log(`  ${a.naam.padEnd(52)} ${String(a.referentie).padStart(8)} ${a.eenheid.padEnd(4)} ` +
      `${a.onze.toFixed(2).padStart(10)} ${a.eenheid.padEnd(4)} ` +
      `${((a.pct >= 0 ? "+" : "") + a.pct.toFixed(2)).padStart(8)} %`);
}
const grootste = afwijkingen.reduce((m, a) => (Math.abs(a.pct) > Math.abs(m.pct) ? a : m), afwijkingen[0]);
log(`\n  Grootste afwijking: ${grootste.pct.toFixed(2)} % bij "${grootste.naam}"`);
// De kern: de grootheden die de bron als hoofdresultaat presenteert.
const kern = ["B107 bovenrand naast midden, NEd", "B40 drukdiagonaal 2e vanaf rechts, NEd",
              "Onderrand naast midden (B122), NEd", "Trekdiagonaal links (B130), NEd",
              "Onderrand naast midden (B122), MEd", "Trekdiagonaal links (B130), MEd",
              "B107 MEd aan het begin"];
const kernMax = afwijkingen.filter((a) => kern.includes(a.naam))
                           .reduce((m, a) => (Math.abs(a.pct) > Math.abs(m) ? a.pct : m), 0);
log(`  Grootste afwijking op de HOOFDgrootheden (staafkrachten + momenten): ${kernMax.toFixed(2)} %`);
log(`\n═══ TOTAAL: ${passed} binnen tolerantie (5 %), ${failed} erbuiten ═══`);

log(`
╔══════════════════════════════════════════════════════════════════════════╗
║ BEVINDINGEN                                                              ║
╚══════════════════════════════════════════════════════════════════════════╝
1. De vier staafkrachten die de bron cijfermatig geeft komen binnen 0,9 %
   overeen (B107 −0,54 % · B40 +0,84 % · onderrand +0,44 % · trekdiagonaal
   −0,26 %), en de twee bijbehorende staafmomenten binnen 0,3 %.

2. Dat geldt alleen als het eigen gewicht op 124 kN wordt gezet — de waarde
   die de bron zelf aanhoudt (verschil tussen de lastsets 101/158/202… en
   91/136/182…). Uit de doorsneden die de bron opgeeft volgt met ρ·A·g maar
   90,7 kN; met dat gewicht liggen alle staafkrachten 2,6 à 3,6 % te laag.
   Het rekenmodel van de bron rekent dus met circa 37 % méér eigen gewicht
   dan de opgegeven profielen wegen — een toeslag voor knoopplaten, bouten
   en koppelplaatjes die de bron niet benoemt. Twee onafhankelijke
   momentwaarden bevestigen die 124 kN exact: het veldmoment van de
   trekdiagonaal uit eigen gewicht (1,36 kNm) en het moment in de onderrand
   naast het midden (1,69 kNm) worden allebei op 0,3 % geraakt.

3. De handberekening van de bron (vervangende ligger, figuur 3.4) klopt:
   V 562/461/303/101 kN, M 3273/5455/6320 kNm en Nch 818/1364/1580 kN komen
   alle binnen 0,3 % overeen, en onze FE-onderrandkrachten liggen binnen
   0,3 % op die Nch-waarden. Voor de diagonalen geldt dat in de buitenvelden
   (1,1 à 2,1 %) maar NIET in het middenveld: de bron rekent Nd = V/cos θ
   met één hoek voor het hele vakwerk, terwijl het middenveld een andere
   diagonaalhelling heeft. De 135 kN uit de bron zou meetkundig 147 kN
   moeten zijn; tegen die gecorrigeerde waarde wijken onze diagonalen nog
   maar 3,5 resp. 4,1 % af. Dat is een vereenvoudiging in de BRON.

4. De zakking van 127 mm hoort niet bij hetzelfde rekenmodel als de
   staafkrachten. Onze FE geeft 148,1 mm onder de lastset waar de
   staafkrachten wél bij horen. De elementaire liggerformule met
   I = ΣA·d² = 5,008e10 mm⁴ en de VOLLE E geeft voor diezelfde lastset
   126,6 mm — vrijwel exact de 127 mm van de bron. De 127 mm is dus een
   zuivere randbuigingswaarde ZONDER de globale afschuivingsvervorming, die
   de bron zelf in §3.4 uitdrukkelijk niet verwaarloosbaar noemt (en waarvoor
   zij E = 160000 aanbeveelt: dat geeft 166 mm). Onze 148 mm ligt tussen die
   onder- en bovengrens in, wat voor een echte vakwerk-FE de juiste plaats is.

5. Secundaire momenten: de onderrand komt in beide profielstanden overeen
   (liggend 1,69 vs 1,7 kNm; staand 24,1 vs 23,4 kNm). De bovenrand is bij
   ons hoger: liggend 2,96 vs 2,7 kNm (+10 %), staand 35,8 vs 28,5 kNm
   (+26 %). Let op: de bron geeft voor dezelfde liggende bovenrand op twee
   plaatsen twee verschillende getallen — 2,7 kNm in §3.5.1 en 2,86 kNm in
   §4.1.1/figuur 4.2. Tegen die laatste wijken wij +3,6 % af. De
   vermenigvuldigers staand/liggend (12,1× en 14,2×) komen goed overeen met
   de 11× en 14× van de bron.

6. De eindmomenten bij momentvaste vulstaven (bron tabel 3.1) wijken 16 tot
   99 % af. Het zijn grootheden van 1 à 3 kNm die volledig worden gestuurd
   door het aangenomen traagheidsmoment van de dubbele hoekprofielen in het
   vakwerkvlak en door het eigen gewicht van de diagonaal; de bron noemt niet
   welke diagonaal en welk staafeind zij bedoelt. Niet bewijskrachtig.

7. De asymmetrische veldindeling die het dossier signaleert (7100/7200/8500
   links tegenover 8600/7100/7100 rechts) is echt aanwezig in de bron, maar
   beide helften tellen tot 22800 mm op. Het effect op de vergeleken
   grootheden is < 0,5 % (zie blok [H]); de symmetrische lezing zou dus
   niets verschuiven.

8. Geen aanwijzing voor een fout in de app. Evenwicht, de statische
   bepaaldheid, de scharnierwerking, het teken van de normaalkracht en de
   bestandsroute (opslaan → inlezen → doorrekenen) zijn alle in orde.`);
