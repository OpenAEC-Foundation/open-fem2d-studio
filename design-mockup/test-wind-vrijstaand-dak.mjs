// Windbelastinggenerator — vrijstaand dak (open overkapping), NEN-EN 1991-1-4
// §7.3: tabel 7.6 (lessenaarsdak) en tabel 7.7 (zadel- en kieldak), de
// blokkering φ, de zones A/B/C/D, de c_f-gevallen met hun aangrijpingspunt,
// de weigeringen, de combinaties — en het bewijs dat de gebouwgevallen
// byte-voor-byte hetzelfde bleven.
//
// AFGELEZEN TABELCELLEN (NEN-EN 1991-1-4:2005+C2:2011, uitgave met NB:2019;
// elk drietal = maximaal voor alle φ / minimaal φ = 0 / minimaal φ = 1)
//   tabel 7.6, α = 10°: c_f +0,5/−0,9/−1,4; A +1,2/−1,5/−1,6; B +2,4/−2,0/−2,6;
//                       C +1,6/−2,1/−2,7
//   tabel 7.6, α = 15°: c_f +0,7/−1,1/−1,4; A +1,4/−1,8/−1,6; C +1,8/−2,5/−3,0
//   tabel 7.6, α = 20°: c_f +0,8/−1,3/−1,4; A +1,7/−2,2/−1,6
//   tabel 7.7, α = +15°: c_f +0,4/−0,8/−1,3; A +0,9/−0,9/−1,3; B +1,9/−1,7/−2,2;
//                        C +1,4/−1,4/−1,6; D +0,4/−1,8/−2,1
//   tabel 7.7, α = −10°: D +1,1/−0,6/−0,6; C +0,8/−1,5/−2,6
//   tabel 7.7, α = −5°:  D +0,8/−0,6/−0,6; C +0,8/−1,6/−2,4
//
// HANDBEREKENING L — lessenaarsdak (carport)
//   Kolommen op x = 0 en x = 5,00 m, dak van (0; 3,000) naar
//   (5,000; 3,000 − 5·tan 10°) ⇒ α = 10°, d = 5,00 m, h = 3,00 m (model).
//   Windgebied II, terreincategorie III ⇒ z_e = 3,00 m < z_min = 5 m:
//     k_r = 0,19·(0,3/0,05)^0,07 = 0,21539 ; c_r = k_r·ln(5/0,3) = 0,60598
//     v_m = 0,60598·27,0 = 16,361 m/s ; I_v = 1/ln(5/0,3) = 0,35544
//     q_p = (1 + 7·0,35544)·½·1,25·16,361² = 583,59 N/m² = 0,58359 kN/m²
//     (de test haalt q_p uit berekenStuwdruk en controleert dit getal).
//   Tussenspant op y = 2,50 m, b = 6,00 m ⇒ y > b/10 = 0,60 m: geen zone B.
//   h.o.h. 2,50 m ⇒ belastingbreedte 2,50 m. φ = 0,50.
//   Zones langs het dak: C 0–0,50 m, A 0,50–4,50 m, C 4,50–5,00 m.
//   c_p,net neerwaarts: C +1,6 ⇒ q = 0,58359·1,6·2,5 = 2,33437 kN/m
//                       A +1,2 ⇒ q = 0,58359·1,2·2,5 = 1,75077 kN/m
//   c_p,net opwaarts (φ = 0,5): A −1,5 + 0,5·(−1,6 + 1,5) = −1,55; φ = 0: −1,5
//                       ⇒ −1,55 (ongunstigst) ⇒ q = −2,26142 kN/m
//                     C −2,1 + 0,5·(−2,7 + 2,1) = −2,40; φ = 0: −2,1 ⇒ −2,40
//                       ⇒ q = −3,50155 kN/m
//   c_f neerwaarts +0,5; van links over de loefhelft 0–2,50 m met 2·c_f:
//                       q = 0,58359·2·0,5·2,5 = 1,45898 kN/m
//     F = q_p·c_f·breedte·L, L = 5/cos 10° = 5,07713 m ⇒ F = 3,70372 kN,
//     zwaartepunt op x = 1,25 m = d/4 (figuur 7.16).
//   c_f opwaarts: −0,9 + 0,5·(−1,4 + 0,9) = −1,15 ⇒ q = −3,35565 kN/m,
//     F = −8,51855 kN.
//   Evenwicht, alleen het dak op scharnier (links) + rol (rechts), geval
//   c_f neerwaarts van links:
//     Σ reactie verticaal = F·cos α = 3,70372·0,98481 = 3,64745 kN
//     moment om de linkeroplegging: de kracht staat loodrecht op het dak op
//     L/4 = 1,26928 m ⇒ R_rechts·5,00 = F·L/4 ⇒ R_rechts = 0,94021 kN.
//
// HANDBEREKENING Z — zadeldak
//   Kolommen op x = 0 en 8,00 m (2,50 m hoog), nok op x = 4,00 m,
//   z = 2,50 + 4·tan 15° = 3,57180 m ⇒ α = +15°, d = 8,00 m, h = 3,57180 m.
//   Windgebied II, terreincategorie II, z_e = 3,57180 m:
//     c_r = 0,19·ln(3,5718/0,05) = 0,81107 ; v_m = 21,899 m/s
//     I_v = 1/ln(3,5718/0,05) = 0,23426
//     q_p = (1 + 7·0,23426)·½·1,25·21,899² = 791,22 N/m² = 0,79122 kN/m²
//   Tussenspant op 10 m, b = 20 m (> b/10 = 2 m), h.o.h. 4,00 m ⇒ breedte 4,00.
//   φ = 0. Zones: C 0–0,80; A 0,80–3,20; D 3,20–4,80; A 4,80–7,20; C 7,20–8,00.
//   Op staaf 3 (0 → nok): C fractie 0–0,2; A 0,2–0,8; D 0,8–1,0.
//   c_p,net neerwaarts: C 0,79122·1,4·4 = 4,43084 ; A ·0,9·4 = 2,84840 ;
//                       D ·0,4·4 = 1,26596 kN/m
//   c_p,net opwaarts (φ = 0): C −4,43084 ; A −2,84840 ; D ·(−1,8)·4 = −5,69680
//   c_f neerwaarts +0,4 per dakvlak: 1,26596 kN/m ; opwaarts −0,8: −2,53191 kN/m
//   Evenwicht c_f opwaarts, beide dakvlakken: verticaal per vlak
//     q·L·cos α = q·4,00 m ⇒ Σ = 2·(−2,53191)·4 = −20,25528 kN (opwaarts),
//     horizontaal heffen de twee vlakken elkaar op.
//
// Draaien met: npx tsx test-wind-vrijstaand-dak.mjs

import { createHash } from "node:crypto";

const {
  genereerWindbelasting, genereerWindCombinaties, STANDAARD_WIND_INSTELLINGEN,
  handtekeningVanGeneratie, handtekeningVanModel, vrijstaandDakUitgangspunten,
} = await import("./src/lib/wind/windGenerator.ts");
const { berekenStuwdruk, overkappingCoefficienten } = await import("./src/lib/wind/windEurocode.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(name, actual, expected, tolPct = 0.001) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(6)} ≈ ${expected}`); }
  else { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
function checkExact(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; log(`  ✓ ${name}: ${JSON.stringify(actual)}`); }
  else { failed++; log(`  ✗ ${name}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`); }
}
function checkTrue(name, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${name}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const graad = Math.PI / 180;
const som = (a) => a.reduce((x, y) => x + y, 0);
const lastenVan = (res, sleutel, beamId) =>
  res.lasten.filter((l) => l.gevalSleutel === sleutel && (beamId === undefined || l.beamId === beamId));
/** Tabelopzoeking: de coëfficiënt met deze naam. */
const co = (opz, naam) => opz.coefficienten.find((c) => c.naam === naam);

const gevallenG = [{ id: 1, name: "Eigen gewicht", type: "dead" }];
const vrij = {
  ...STANDAARD_WIND_INSTELLINGEN,
  vorm: "vrijstaandDak", combinatiesGenereren: false,
  stuwdrukBron: "berekend", windgebied: "II",
};

// ── Model L: lessenaarsdak α = 10° ────────────────────────────────────────
const riseL = 5000 * Math.tan(10 * graad);
const nodesL = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }, { id: 3, x: 0, z: 3000 }, { id: 4, x: 5000, z: 3000 - riseL }];
const beamsL = [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 }];
const instL = {
  ...vrij, vrijstaandDakvorm: "lessenaar", terreincategorie: "III", blokkering_phi: 0.5,
  hohSpant_m: 2.5, gebouwlengte_m: 6, afstandTotKopgevel_m: 2.5, positieSpant: "tussenspant",
};

// ── Model Z: zadeldak α = +15° ────────────────────────────────────────────
const riseZ = 4000 * Math.tan(15 * graad);
const nodesZ = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8000, z: 0 }, { id: 3, x: 0, z: 2500 }, { id: 4, x: 4000, z: 2500 + riseZ }, { id: 5, x: 8000, z: 2500 }];
const beamsZ = [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 5 }, { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 }];
const instZ = {
  ...vrij, vrijstaandDakvorm: "zadel", terreincategorie: "II", blokkering_phi: 0,
  hohSpant_m: 4, gebouwlengte_m: 20, afstandTotKopgevel_m: 10, positieSpant: "tussenspant",
};

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Tabelopzoeking — celwaarden, φ = 0 en φ = 1");
{
  const t = (vorm, a, phi) => overkappingCoefficienten(vorm, a, phi);
  // Losse cellen, overgetypt uit de tabel (niet uit de constante in de code).
  const a0 = t("lessenaar", 0, 0);
  checkExact("7.6 α=0°, zone B, maximaal", co(a0, "B").max, 1.8);
  checkExact("7.6 α=0°, c_f, minimaal φ=0", co(a0, "c_f").min0, -0.5);
  const a30 = t("lessenaar", 30, 1);
  checkExact("7.6 α=30°, zone B, minimaal φ=0", co(a30, "B").min0, -3.8);
  checkExact("7.6 α=30°, zone C, minimaal φ=1", co(a30, "C").min1, -2.7);
  const z20 = t("zadel", -20, 0);
  checkExact("7.7 α=−20°, zone D, maximaal", co(z20, "D").max, 1.7);
  checkExact("7.7 α=−20°, zone B, minimaal φ=1", co(z20, "B").min1, -2.4);
  const z30 = t("zadel", 30, 0);
  checkExact("7.7 α=+30°, zone B, minimaal φ=1", co(z30, "B").min1, -1.8);
  checkExact("7.7 α=+30°, c_f, maximaal", co(z30, "c_f").max, 0.9);
  const z5 = t("zadel", 5, 0);
  checkExact("7.7 α=+5°, zone D, minimaal φ=0", co(z5, "D").min0, -1.1);
  checkExact("7.7 tabel en bron", `${z5.tabel} | ${z5.bron}`, "7.7 | NEN-EN 1991-1-4 §7.3, tabel 7.7 (tweezijdig hellende overkapping)");
  checkExact("7.6 heeft geen zone D", t("lessenaar", 10, 0).coefficienten.map((c) => c.naam).join(","), "c_f,A,B,C");

  // φ = 0 en φ = 1 geven precies de regel "minimaal voor φ = 0" resp. "= 1".
  const p0 = t("lessenaar", 10, 0), p1 = t("lessenaar", 10, 1);
  checkExact("φ = 0 ⇒ rij 'minimaal voor φ = 0' (7.6 α=10°, zone C: −2,1)", co(p0, "C").minPhi, -2.1);
  checkExact("φ = 1 ⇒ rij 'minimaal voor φ = 1' (7.6 α=10°, zone C: −2,7)", co(p1, "C").minPhi, -2.7);
  checkExact("φ = 0 ⇒ c_f −0,9", co(p0, "c_f").minPhi, -0.9);
  checkExact("φ = 1 ⇒ c_f −1,4", co(p1, "c_f").minPhi, -1.4);
  checkExact("maximaal hangt niet van φ af (zone A +1,2 bij φ = 0 en 1)", `${co(p0, "A").max}/${co(p1, "A").max}`, "1.2/1.2");
  // φ = 0,5: lineair (§7.3(3)).
  check("φ = 0,5 ⇒ c_f = −0,9 + 0,5·(−1,4 + 0,9) = −1,15", co(t("lessenaar", 10, 0.5), "c_f").minPhi, -1.15);
  checkExact("op een tabelrij: rijOnder = rijBoven = 10", `${p0.rijOnder}/${p0.rijBoven}`, "10/10");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Interpolatie over de dakhelling");
{
  // 7.6 tussen α = 10° en 15°, α = 12,5° (f = 0,5):
  //   c_f max 0,5 + 0,5·(0,7 − 0,5) = 0,6 ; C max 1,6 + 0,5·(1,8 − 1,6) = 1,7
  //   A min φ=0: −1,5 + 0,5·(−1,8 + 1,5) = −1,65 ; A min φ=1: −1,6 (beide rijen)
  //   A bij φ = 0,5: −1,65 + 0,5·(−1,6 + 1,65) = −1,625
  const r = overkappingCoefficienten("lessenaar", 12.5, 0.5);
  checkTrue("12,5° ligt tussen de rijen 10° en 15°", r.ok && r.rijOnder === 10 && r.rijBoven === 15);
  check("7.6 α=12,5°: c_f maximaal = 0,6", co(r, "c_f").max, 0.6);
  check("7.6 α=12,5°: zone C maximaal = 1,7", co(r, "C").max, 1.7);
  check("7.6 α=12,5°: zone A minimaal φ=0 = −1,65", co(r, "A").min0, -1.65);
  check("7.6 α=12,5°: zone A bij φ=0,5 = −1,625", co(r, "A").minPhi, -1.625);
  // 7.7 tussen −10° en −5°, α = −7,5°: D max 1,1 + 0,5·(0,8 − 1,1) = 0,95 ;
  //   C min φ=0: −1,5 + 0,5·(−1,6 + 1,5) = −1,55
  const k = overkappingCoefficienten("zadel", -7.5, 0);
  check("7.7 α=−7,5°: zone D maximaal = 0,95", co(k, "D").max, 0.95);
  check("7.7 α=−7,5°: zone C minimaal φ=0 = −1,55", co(k, "C").min0, -1.55);
  // Weigeringen: buiten de tabel en tussen −5° en +5° niet interpoleren.
  checkTrue("7.7 α=+3° geweigerd (geen interpolatie tussen −5° en +5°)", !overkappingCoefficienten("zadel", 3, 0).ok);
  checkTrue("7.7 α=−4° geweigerd", !overkappingCoefficienten("zadel", -4, 0).ok);
  checkTrue("7.7 α=+31° geweigerd", !overkappingCoefficienten("zadel", 31, 0).ok);
  checkTrue("7.7 α=−21° geweigerd", !overkappingCoefficienten("zadel", -21, 0).ok);
  checkTrue("7.6 α=30,5° geweigerd", !overkappingCoefficienten("lessenaar", 30.5, 0).ok);
  checkTrue("φ = 1,2 geweigerd", !overkappingCoefficienten("lessenaar", 10, 1.2).ok);
  checkTrue("de reden noemt de tabel", (overkappingCoefficienten("zadel", 3, 0).reden ?? "").includes("Tabel 7.7"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Lessenaarsdak — handberekening L");
let resL = null;
{
  const res = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gevallenG }, instL);
  resL = res;
  checkTrue("generatie geslaagd", res.ok, res.meldingen.filter((m) => m.niveau === "fout").map((m) => m.tekst).join(" | "));
  const qp = berekenStuwdruk("II", "III", 3.0).qp_kNm2;
  check("q_p(z_e = 3,00 m; II; III) = 0,58359 kN/m²", qp, 0.58359, 0.01);
  check("de generator gebruikt die q_p", res.samenvatting.stuwdruk.qp_kNm2, qp, 1e-9);
  check("z_e = h = 3,00 m", res.samenvatting.stuwdruk.ze_m, 3.0);
  check("α uit de geometrie = 10°", res.geometrie.vrijstaand.alpha_graden, 10);
  check("d = 5,00 m", res.geometrie.d_m, 5.0);
  checkExact("zones C/A/C", res.geometrie.vrijstaand.zones.map((z) => `${z.zone}${z.van_m}-${z.tot_m}`).join(" "), "C0-0.5 A0.5-4.5 C4.5-5");
  checkExact("zes gevallen: c_p,net ↓↑ en c_f ↓↑ van links en van rechts",
    res.gevallen.map((g) => g.sleutel).join(","),
    "luifel:cpnet:max,luifel:cpnet:min,luifel:cf:max:links,luifel:cf:max:rechts,luifel:cf:min:links,luifel:cf:min:rechts");
  checkTrue("kolommen (staaf 1, 2) zijn niet belast", res.lasten.every((l) => l.beamId === 3));

  // Lokale +z van staaf 3 (links → rechts) wijst omhoog, dus neerwaarts = q < 0.
  const b = 2.5;
  const cpMax = lastenVan(res, "luifel:cpnet:max");
  checkExact("c_p,net neerwaarts: drie deellasten (C, A, C)", cpMax.length, 3);
  check("zone C neerwaarts: q = q_p·1,6·2,5 (2,33437 kN/m)", -cpMax[0].q, qp * 1.6 * b);
  check("  getal van de handberekening", -cpMax[0].q, 2.33437, 0.01);
  check("  zone C loopt van 0 tot 0,1 van de staaf", cpMax[0].endFrac, 0.1);
  check("zone A neerwaarts: q = q_p·1,2·2,5 (1,75077 kN/m)", -cpMax[1].q, qp * 1.2 * b);
  check("  getal van de handberekening", -cpMax[1].q, 1.75077, 0.01);
  const cpMin = lastenVan(res, "luifel:cpnet:min");
  check("zone C opwaarts: q = q_p·(−2,40)·2,5 (−3,50155 kN/m)", -cpMin[0].q, qp * -2.4 * b);
  check("  getal van de handberekening", -cpMin[0].q, -3.50155, 0.01);
  check("zone A opwaarts: q = q_p·(−1,55)·2,5 (−2,26142 kN/m)", -cpMin[1].q, qp * -1.55 * b);
  check("  getal van de handberekening", -cpMin[1].q, -2.26142, 0.01);

  const cfL = lastenVan(res, "luifel:cf:max:links");
  checkExact("c_f neerwaarts van links: één deellast op de loefhelft", cfL.length, 1);
  checkTrue("  van 0 tot 0,5 van de staaf", Math.abs(cfL[0].startFrac) < 1e-9 && Math.abs(cfL[0].endFrac - 0.5) < 1e-9);
  check("  q = q_p·2·0,5·2,5 (1,45898 kN/m)", -cfL[0].q, qp * 2 * 0.5 * b);
  check("  getal van de handberekening", -cfL[0].q, 1.45898, 0.01);
  const cfR = lastenVan(res, "luifel:cf:max:rechts");
  checkTrue("c_f van rechts: de loefhelft is de rechterhelft", Math.abs(cfR[0].startFrac - 0.5) < 1e-9 && Math.abs(cfR[0].endFrac - 1) < 1e-9);
  const cfMin = lastenVan(res, "luifel:cf:min:links");
  check("c_f opwaarts: q = q_p·2·(−1,15)·2,5 (−3,35565 kN/m)", -cfMin[0].q, qp * 2 * -1.15 * b);
  check("  getal van de handberekening", -cfMin[0].q, -3.35565, 0.01);

  const pg = (s) => res.samenvatting.perGeval.find((p) => p.sleutel === s);
  const L = 5 / Math.cos(10 * graad);
  check("resultante c_f ↓ van links: F = q_p·0,5·2,5·L (3,70372 kN)", pg("luifel:cf:max:links").resultanten[0].F_kN, qp * 0.5 * b * L);
  check("  getal van de handberekening", pg("luifel:cf:max:links").resultanten[0].F_kN, 3.70372, 0.01);
  check("  aangrijpingspunt x = d/4 = 1,25 m (figuur 7.16)", pg("luifel:cf:max:links").resultanten[0].x_m, 1.25);
  check("  van rechts: x = d − d/4 = 3,75 m", pg("luifel:cf:max:rechts").resultanten[0].x_m, 3.75);
  check("resultante c_f ↑: F = −8,51855 kN", pg("luifel:cf:min:links").resultanten[0].F_kN, -8.51855, 0.01);
  checkTrue("geen resultante bij de c_p,net-gevallen", pg("luifel:cpnet:max").resultanten === undefined);

  // Rapport: paragraaf, tabel, α, φ en coëfficiënt in de omschrijving.
  checkExact("omschrijving zone C", cpMin[0].omschrijving, "§7.3 tabel 7.6 (α = 10,0°, φ = 0,50): zone C, c_p,net = −2,40");
  checkTrue("omschrijving c_f noemt figuur 7.16", cfL[0].omschrijving.includes("c_f = +0,50") && cfL[0].omschrijving.includes("fig. 7.16"));
  checkTrue("melding noemt §7.3, tabel 7.6, α en φ",
    res.meldingen.some((m) => m.tekst.includes("§7.3") && m.tekst.includes("tabel 7.6") && m.tekst.includes("α = 10,0°") && m.tekst.includes("φ = 0,50")));
  checkTrue("melding over de niet-gegenereerde onderdelen (wrijving, tabel 7.8)",
    res.meldingen.some((m) => m.tekst.includes("§7.3(7)") && m.tekst.includes("tabel 7.8")));

  // De richtingsknoppen doen niet mee: beide c_f-richtingen blijven bestaan.
  const zonder = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gevallenG },
    { ...instL, richtingLinks: false, richtingRechts: false, richtingHaaks: false });
  checkExact("richtingen uit ⇒ nog steeds zes gevallen", zonder.ok ? zonder.gevallen.length : -1, 6);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Lessenaarsdak — evenwicht door de echte solver (c_f ↓ van links)");
{
  // Alleen het dak: scharnier links, rol (verticaal) rechts.
  const E = 11000, A = 7200, I = 60000000;
  const lasten = lastenVan(resL, "luifel:cf:max:links");
  const { perCase } = solveAllCases({
    nodes: nodesL.filter((n) => n.id >= 3),
    beams: [{ id: 3, from: 3, to: 4, E, A, I }],
    supports: [{ nodeId: 3, type: "pinned" }, { nodeId: 4, type: "zRoller" }],
    loads: lasten.map((l) => ({ beamId: 3, q: l.q, qDir: "z", qCoord: "local", caseId: 1, startFrac: l.startFrac, endFrac: l.endFrac })),
    cases: [{ id: 1, name: "c_f links" }],
  });
  const r = perCase.get(1);
  checkTrue("solver levert een resultaat", !!r);
  const fz = som([3, 4].map((id) => r.reactions.get(id)?.fz ?? 0)) / 1000;
  check("Σ reacties verticaal = F·cos α = 3,64745 kN", fz, 3.64745, 0.05);
  check("reactie rechts = F·(L/4)/d = 0,94021 kN — resultante op d/4", r.reactions.get(4).fz / 1000, 0.94021, 0.05);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Zadeldak — handberekening Z");
{
  const res = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, instZ);
  checkTrue("generatie geslaagd", res.ok, res.meldingen.filter((m) => m.niveau === "fout").map((m) => m.tekst).join(" | "));
  const h = 2.5 + 4 * Math.tan(15 * graad);
  const qp = berekenStuwdruk("II", "II", h).qp_kNm2;
  check("q_p(z_e = 3,5718 m; II; II) = 0,79122 kN/m²", qp, 0.79122, 0.01);
  check("z_e = h = 3,57180 m", res.samenvatting.stuwdruk.ze_m, 3.5718, 0.01);
  check("α = +15° (nok)", res.geometrie.vrijstaand.alpha_graden, 15);
  check("nok op x = 4,00 m", res.geometrie.vrijstaand.xNok_m, 4.0);
  checkExact("zones C/A/D/A/C",
    res.geometrie.vrijstaand.zones.map((z) => `${z.zone}${+z.van_m.toFixed(6)}-${+z.tot_m.toFixed(6)}`).join(" "),
    "C0-0.8 A0.8-3.2 D3.2-4.8 A4.8-7.2 C7.2-8");
  checkExact("acht gevallen", res.gevallen.map((g) => g.sleutel.replace("luifel:", "")).join(","),
    "cpnet:max,cpnet:min,cf:max:beide,cf:max:links,cf:max:rechts,cf:min:beide,cf:min:links,cf:min:rechts");

  const b = 4;
  const max3 = lastenVan(res, "luifel:cpnet:max", 3);
  checkExact("staaf 3: drie zones (C, A, D)", max3.length, 3);
  check("C ↓ q = q_p·1,4·4 (4,43084)", -max3[0].q, qp * 1.4 * b);
  check("  getal", -max3[0].q, 4.43084, 0.01);
  check("  C tot fractie 0,2", max3[0].endFrac, 0.2);
  check("A ↓ q = q_p·0,9·4 (2,84840)", -max3[1].q, qp * 0.9 * b);
  check("  getal", -max3[1].q, 2.84840, 0.01);
  check("D ↓ q = q_p·0,4·4 (1,26596)", -max3[2].q, qp * 0.4 * b);
  check("  getal", -max3[2].q, 1.26596, 0.01);
  check("  D vanaf fractie 0,8", max3[2].startFrac, 0.8);
  const min3 = lastenVan(res, "luifel:cpnet:min", 3);
  check("C ↑ q = q_p·(−1,4)·4", -min3[0].q, qp * -1.4 * b);
  check("D ↑ q = q_p·(−1,8)·4 (−5,69680)", -min3[2].q, qp * -1.8 * b);
  check("  getal", -min3[2].q, -5.69680, 0.01);
  // Staaf 4 loopt van de nok naar rechts: D ligt aan zijn begin.
  const max4 = lastenVan(res, "luifel:cpnet:max", 4);
  checkTrue("staaf 4: D eerst (0–0,2), C laatst (0,8–1)",
    Math.abs(max4[0].endFrac - 0.2) < 1e-9 && Math.abs(max4[2].startFrac - 0.8) < 1e-9);
  check("  staaf 4, D ↓ ook q_p·0,4·4", -max4[0].q, qp * 0.4 * b);

  const cfB = lastenVan(res, "luifel:cf:max:beide");
  checkExact("c_f ↓ beide dakvlakken: op staaf 3 en 4, elk over de hele staaf",
    cfB.map((l) => `${l.beamId}${l.startFrac === undefined ? "vol" : "deel"}`).join(","), "3vol,4vol");
  check("c_f ↓ q = q_p·0,4·4 (1,26596)", -cfB[0].q, qp * 0.4 * b);
  checkExact("c_f ↓ alleen linkerdakvlak: alleen staaf 3", lastenVan(res, "luifel:cf:max:links").map((l) => l.beamId).join(","), "3");
  checkExact("c_f ↓ alleen rechterdakvlak: alleen staaf 4", lastenVan(res, "luifel:cf:max:rechts").map((l) => l.beamId).join(","), "4");
  const cfMin = lastenVan(res, "luifel:cf:min:beide");
  check("c_f ↑ q = q_p·(−0,8)·4 (−2,53191)", -cfMin[0].q, qp * -0.8 * b);
  check("  getal", -cfMin[0].q, -2.53191, 0.01);
  const res3 = res.samenvatting.perGeval.find((p) => p.sleutel === "luifel:cf:max:links").resultanten[0];
  check("resultante linkerdakvlak in het midden: x = 2,00 m (figuur 7.17)", res3.x_m, 2.0);
  // Beide dakvlakken: één resultante per helling, F = q_p·0,4·4·(4/cos 15°).
  const beide = res.samenvatting.perGeval.find((p) => p.sleutel === "luifel:cf:max:beide").resultanten;
  checkExact("beide dakvlakken: twee resultanten", beide.length, 2);
  checkTrue("  op x = 2,00 en 6,00 m", Math.abs(beide[0].x_m - 2) < 1e-9 && Math.abs(beide[1].x_m - 6) < 1e-9);
  check("  F per dakvlak = q_p·0,4·4·4,14110 m", beide[0].F_kN, qp * 0.4 * 4 * 4 / Math.cos(15 * graad));
  checkTrue("omschrijving noemt tabel 7.7 en figuur 7.17",
    cfB[0].omschrijving.startsWith("§7.3 tabel 7.7 (α = 15,0°, φ = 0,00)") && cfB[0].omschrijving.includes("fig. 7.17"));

  // Evenwicht c_f ↑ beide vlakken: kolommen ingeklemd.
  const E = 210000, A = 3880, I = 16700000;
  const { perCase } = solveAllCases({
    nodes: nodesZ, beams: beamsZ.map((bm) => ({ ...bm, E, A, I })),
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: cfMin.map((l) => ({ beamId: l.beamId, q: l.q, qDir: "z", qCoord: "local", caseId: 1 })),
    cases: [{ id: 1, name: "c_f op" }],
  });
  const r = perCase.get(1);
  check("Σ reacties verticaal = 2·q·4,00 = −20,25528 kN", som([1, 2].map((id) => r.reactions.get(id).fz)) / 1000, -20.25528, 0.05);
  check("Σ reacties horizontaal = 0", som([1, 2].map((id) => r.reactions.get(id).fx)) / 1000 + 1, 1, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] φ = 1 en §7.3(4) — het opwaartse c_p,net-geval");
{
  // Zadeldak +15°, φ = 1: c_f,min = −1,3 (rij φ = 1).
  //   c_p,net ↑ per zone: min(φ=1, φ=0) — A min(−1,3; −0,9) = −1,3,
  //   C min(−1,6; −1,4) = −1,6, D min(−2,1; −1,8) = −2,1: hier telt de rij φ = 1.
  const res = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, { ...instZ, blokkering_phi: 1 });
  const v = res.samenvatting.vrijstaand;
  checkExact("7.7 +15°, φ = 1: c_f minimaal = −1,3", co(v.opzoeking, "c_f").minPhi, -1.3);
  checkExact("c_p,net ↑ A = −1,3 · C = −1,6 · D = −2,1", `${v.cpNetOpwaarts.A} · ${v.cpNetOpwaarts.C} · ${v.cpNetOpwaarts.D}`, "-1.3 · -1.6 · -2.1");
  const qp = res.samenvatting.stuwdruk.qp_kNm2;
  check("c_f ↑ lijnlast = q_p·(−1,3)·4", -lastenVan(res, "luifel:cf:min:beide", 3)[0].q, qp * -1.3 * 4);

  // Lessenaarsdak 20°, φ = 1: zone A minimaal φ = 1 is −1,6, maar φ = 0 geeft
  // −2,2. §7.3(4): aan de lijzijde van de blokkering geldt φ = 0 ⇒ −2,2.
  const rise20 = 5000 * Math.tan(20 * graad);
  const nodes20 = nodesL.map((n) => (n.id === 4 ? { ...n, z: 3000 - rise20 } : n));
  const r20 = genereerWindbelasting({ nodes: nodes20, beams: beamsL, loadCases: gevallenG }, { ...instL, blokkering_phi: 1 });
  checkTrue("20°, φ = 1: generatie geslaagd", r20.ok);
  checkExact("20°, φ = 1: c_p,net ↑ zone A = −2,2 (φ = 0, §7.3(4))", r20.samenvatting.vrijstaand.cpNetOpwaarts.A, -2.2);
  checkExact("20°, φ = 1: c_f ↑ = −1,4 (rij φ = 1, niet omhuld)", co(r20.samenvatting.vrijstaand.opzoeking, "c_f").minPhi, -1.4);
  checkTrue("melding §7.3(4) noemt zone A", r20.meldingen.some((m) => m.tekst.startsWith("§7.3(4)") && m.tekst.includes("A: −2,20")));
  const r20phi0 = genereerWindbelasting({ nodes: nodes20, beams: beamsL, loadCases: gevallenG }, { ...instL, blokkering_phi: 0 });
  checkExact("20°, φ = 0: c_p,net ↑ zone A = −2,2", r20phi0.samenvatting.vrijstaand.cpNetOpwaarts.A, -2.2);
  checkExact("20°, φ = 0: c_f ↑ = −1,3", co(r20phi0.samenvatting.vrijstaand.opzoeking, "c_f").minPhi, -1.3);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Zone B, kieldak, dakherkenning en weigeringen");
{
  // Kopgevelspant: y = 0 < b/10 ⇒ zone B over de hele breedte; breedte h.o.h./2.
  //   zadel +15°, B maximaal +1,9 ⇒ q = q_p·1,9·2,0.
  const kop = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, { ...instZ, positieSpant: "kopgevelspant" });
  checkTrue("kopgevelspant: in zone B", kop.ok && kop.geometrie.vrijstaand.inZoneB);
  const kB = lastenVan(kop, "luifel:cpnet:max", 3);
  checkExact("  één last over de hele staaf", kB.length === 1 && kB[0].startFrac === undefined, true);
  check("  q = q_p·1,9·2,0", -kB[0].q, kop.samenvatting.stuwdruk.qp_kNm2 * 1.9 * 2);

  // Kieldak −10°: V-vorm, laagste punt in het midden.
  const zak = 4000 * Math.tan(10 * graad);
  const nodesK = nodesZ.map((n) => (n.id === 4 ? { ...n, z: 2500 - zak } : n));
  const kiel = genereerWindbelasting({ nodes: nodesK, beams: beamsZ, loadCases: gevallenG }, instZ);
  checkTrue("kieldak herkend", kiel.ok, kiel.meldingen.filter((m) => m.niveau === "fout").map((m) => m.tekst).join(" | "));
  check("  α = −10°", kiel.geometrie.vrijstaand.alpha_graden, -10);
  // 7.7 α = −10°: D maximaal +1,1.
  check("  zone D ↓ = q_p·1,1·4", -lastenVan(kiel, "luifel:cpnet:max", 3)[2].q, kiel.samenvatting.stuwdruk.qp_kNm2 * 1.1 * 4);

  // Dakherkenning: een lessenaarsdak in twee stukken plus een schoor.
  const nodesS = [...nodesL.filter((n) => n.id !== 4), { id: 4, x: 5000, z: 3000 - riseL }, { id: 5, x: 2500, z: 3000 - riseL / 2 }, { id: 6, x: 0, z: 2000 }];
  const beamsS = [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 5 }, { id: 4, from: 5, to: 4 }, { id: 5, from: 6, to: 5 }];
  const s = genereerWindbelasting({ nodes: nodesS, beams: beamsS, loadCases: gevallenG }, instL);
  checkTrue("twee dakstukken belast, schoor en kolommen niet", s.ok && s.geometrie.vrijstaand.dakstaven.join(",") === "3,4",
    s.ok ? s.geometrie.vrijstaand.dakstaven.join(",") : s.meldingen.map((m) => m.tekst).join(" | "));
  check("  c_f ↓ van links: Σ q·lengte gelijk aan het ongedeelde dak",
    som(lastenVan(s, "luifel:cf:max:links").map((l) => -l.q * ((l.endFrac ?? 1) - (l.startFrac ?? 0)) * (5 / Math.cos(10 * graad) / 2))),
    -lastenVan(resL, "luifel:cf:max:links")[0].q * 0.5 * 5 / Math.cos(10 * graad));

  const fout = (res) => res.meldingen.filter((m) => m.niveau === "fout").map((m) => m.tekst).join(" | ");
  const zadelAlsLessenaar = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, { ...instZ, vrijstaandDakvorm: "lessenaar" });
  checkTrue("zadeldak als lessenaar gekozen ⇒ geweigerd", !zadelAlsLessenaar.ok && fout(zadelAlsLessenaar).includes("zadeldak"));
  const lessenaarAlsZadel = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gevallenG }, { ...instL, vrijstaandDakvorm: "zadel" });
  checkTrue("lessenaarsdak als zadel gekozen ⇒ geweigerd", !lessenaarAlsZadel.ok && fout(lessenaarAlsZadel).includes("lessenaarsdak"));
  const plat = 4000 * Math.tan(3 * graad);
  const zadel3 = genereerWindbelasting({ nodes: nodesZ.map((n) => (n.id === 4 ? { ...n, z: 2500 + plat } : n)), beams: beamsZ, loadCases: gevallenG }, instZ);
  checkTrue("zadeldak 3° ⇒ geweigerd met tabel 7.7", !zadel3.ok && fout(zadel3).includes("Tabel 7.7"));
  checkTrue("  en er is niets gegenereerd", zadel3.gevallen.length === 0 && zadel3.lasten.length === 0 && zadel3.combinaties.length === 0);
  const steil = 5000 * Math.tan(35 * graad);
  const l35 = genereerWindbelasting({ nodes: nodesL.map((n) => (n.id === 4 ? { ...n, z: 6000 - steil, } : n.id === 3 ? { ...n, z: 6000 } : n)), beams: beamsL, loadCases: gevallenG }, instL);
  checkTrue("lessenaarsdak 35° ⇒ geweigerd met tabel 7.6", !l35.ok && fout(l35).includes("Tabel 7.6"));

  // Alleen het dak getekend: h moet worden opgegeven.
  const alleenDak = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }], beams: [{ id: 1, from: 1, to: 2 }], loadCases: gevallenG };
  const zonderH = genereerWindbelasting(alleenDak, { ...instL });
  checkTrue("vlak dak zonder kolommen en zonder h ⇒ geweigerd", !zonderH.ok && fout(zonderH).includes("hoogte h"));
  const metH = genereerWindbelasting(alleenDak, { ...instL, vrijstaandHoogte_m: 2.6 });
  checkTrue("met h = 2,60 m ⇒ geslaagd, α = 0°", metH.ok && metH.geometrie.vrijstaand.alpha_graden === 0);
  check("  z_e = 2,60 m", metH.samenvatting.stuwdruk.ze_m, 2.6);
  // 7.6 α = 0°, zone C maximaal +1,1.
  check("  zone C ↓ = q_p·1,1·2,5", -lastenVan(metH, "luifel:cpnet:max", 1)[0].q, metH.samenvatting.stuwdruk.qp_kNm2 * 1.1 * 2.5);
  const teLaag = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gevallenG }, { ...instL, vrijstaandHoogte_m: 2 });
  checkTrue("h lager dan het model ⇒ geweigerd", !teLaag.ok && fout(teLaag).includes("lager dan het model"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Combinaties — dezelfde bouw als bij een gebouw, niets valt weg");
{
  const loadCases = [
    { id: 1, name: "Eigen gewicht", type: "dead" },
    { id: 2, name: "Q dak", type: "live", categorie: "H" },
    { id: 3, name: "Sneeuw", type: "snow" },
  ];
  const res = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases }, { ...instZ, combinatiesGenereren: true });
  const verwacht = genereerWindCombinaties(loadCases, res.gevallen);
  checkExact("aantal = genereerWindCombinaties over dezelfde gevallen", res.combinaties.length, verwacht.length);
  checkExact("identiek aan genereerWindCombinaties", JSON.stringify(res.combinaties), JSON.stringify(verwacht));
  const perSleutel = new Map(res.gevallen.map((g) => [g.sleutel, 0]));
  for (const c of res.combinaties) perSleutel.set(c.windSleutel, (perSleutel.get(c.windSleutel) ?? 0) + 1);
  const aantallen = [...perSleutel.values()];
  checkTrue("elk van de acht gevallen heeft evenveel combinaties (> 0)",
    aantallen.length === 8 && aantallen.every((n) => n > 0 && n === aantallen[0]), aantallen.join(","));
  checkTrue("UGT met blijvend gunstig voor het opwaartse geval",
    res.combinaties.some((c) => c.windSleutel === "luifel:cpnet:min" && c.naam.includes("blijvend gunstig")));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] Handtekening — de omschrijving telt mee bij een vrijstaand dak");
{
  const gev = resL.gevallen.map((g) => ({ sleutel: g.sleutel, naam: g.naam }));
  const h1 = handtekeningVanGeneratie(gev, resL.lasten, []);
  const anders = resL.lasten.map((l, i) => (i === 0 ? { ...l, omschrijving: l.omschrijving + " (x)" } : l));
  checkTrue("andere omschrijving ⇒ andere handtekening", handtekeningVanGeneratie(gev, anders, []) !== h1);
  // Terug uit een model: dezelfde handtekening (dan schrijft de store niets).
  const ids = new Map(resL.gevallen.map((g, i) => [g.sleutel, 100 + i]));
  const loadCases = resL.gevallen.map((g) => ({ id: ids.get(g.sleutel), name: g.naam, type: "wind", gegenereerd: { bron: "wind", sleutel: g.sleutel } }));
  const loads = resL.lasten.map((l, i) => ({
    id: i + 1, type: "lineLoad", caseId: ids.get(l.gevalSleutel), beamId: l.beamId, q: l.q, qDir: "z", qCoord: "local",
    ...(l.startFrac !== undefined ? { startFrac: l.startFrac, endFrac: l.endFrac } : {}),
    omschrijving: l.omschrijving, gegenereerdDoor: "wind",
  }));
  checkExact("model ⇄ generatie: gelijke handtekening", handtekeningVanModel(loadCases, loads, []), h1);

  // Rapport, uitgangspunten: paragraaf, tabel, alpha, phi en de gebruikte c_p,net per geval.
  const tekst = vrijstaandDakUitgangspunten(loadCases, loads);
  const regels = tekst.split("\n");
  checkExact("uitgangspunten: kopregel + een regel per geval", regels.length, 1 + resL.gevallen.length);
  checkTrue("kopregel noemt §7.3, tabel 7.6/7.7 en z_e = h", regels[0].includes("§7.3") && regels[0].includes("tabel 7.6") && regels[0].includes("z_e = h"));
  checkExact("regel c_p,net opwaarts: zones C en A, dubbele C één keer",
    regels[2],
    "Wind vrijstaand dak c_p,net opwaarts: §7.3 tabel 7.6 (α = 10,0°, φ = 0,50): zone C, c_p,net = −2,40; §7.3 tabel 7.6 (α = 10,0°, φ = 0,50): zone A, c_p,net = −1,55");
  checkExact("zonder vrijstaand dak: leeg", vrijstaandDakUitgangspunten([{ id: 1, name: "Wind links", gegenereerd: { bron: "wind", sleutel: "wind:links:cpi-0.30" } }], []), "");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[10] Gebouwgevallen bit-identiek aan de generator van vóór het vrijstaande dak");
{
  // Tien scenario's; per scenario de sha256 van JSON.stringify van het HELE
  // resultaat (meldingen, gevallen, lasten, combinaties, samenvatting,
  // geometrie). De referentiehashes zijn vastgelegd met de generator van
  // master d257219, vóór deze uitbreiding, met dezelfde scenario's. Een
  // andere hash betekent dat er in de gebouwroute iets is veranderd — ook een
  // extra veld of een andere volgorde.
  const portaal = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }, { id: 3, x: 0, z: 6000 }, { id: 4, x: 12000, z: 6000 }],
    beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 }] };
  const zadel = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }, { id: 3, x: 0, z: 5000 }, { id: 4, x: 6000, z: 7000 }, { id: 5, x: 12000, z: 5000 }, { id: 6, x: -800, z: 4733.33 }],
    beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 5 }, { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 }, { id: 5, from: 6, to: 3, loadRole: "overstek" }] };
  const kap = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 3000, z: 1500 }],
    beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 3, to: 2 }, { id: 3, from: 1, to: 2 }] };
  const gevallen = [{ id: 1, name: "Eigen gewicht", type: "dead" }, { id: 2, name: "Q dak", type: "live", categorie: "H" }, { id: 3, name: "Sneeuw", type: "snow" }];
  const S = STANDAARD_WIND_INSTELLINGEN;
  const scenarios = [
    ["portaal standaard", portaal, { ...S }, "614487dc0129e376c8af5a06f3c7a71da34ec72d81ecd9b7fcebe117007909b6"],
    ["portaal alle richtingen handmatig", portaal, { ...S, richtingHaaks: true, stuwdrukBron: "handmatig", qpHandmatig_kNm2: 0.8 }, "7697435882e9d019134f288c1d23bbffc2374513135d40a02393cce3937fda0e"],
    ["portaal kopgevelspant cpi plus", portaal, { ...S, positieSpant: "kopgevelspant", cpiKeuze: "plus", terreincategorie: "III" }, "b1cd0c46f567d1e5b8ef0f9fdb4b442f912079fcda437da75092a5d36b039398"],
    ["portaal override cpi handmatig", portaal, { ...S, belastingbreedteOverride_m: 3.3, cpiKeuze: "handmatig", cpiHandmatig: -0.1, afstandTotKopgevel_m: 2, windgebied: "I" }, "e80716c56113063fd4a42e870a2b6542210fccbc3ec189b3e91465d1479b2c3f"],
    ["portaal zonder combinaties", portaal, { ...S, combinatiesGenereren: false, cpiKeuze: "min" }, "d169f1a327a62453a3c30c913dc308b4803cf7763890d2bec0cce4fe628c4bd9"],
    ["zadel met overstek", zadel, { ...S, cpeDakLoef: -0.6, cpeDakLij: -0.4, cpeDakHaaks: -1.1, richtingHaaks: true }, "c469025a0db7b45ce9a802b27fe561e4d2e7f9a37f27c1bac207a4e67c891568"],
    ["kap zonder gevel", kap, { ...S, cpeDakLoef: 0.2, cpeDakLij: -0.4, gevelhoogte_m: 3 }, "be999b1846b7267e15f517c0a1c94016501704301dbfc9ebc62700bf7371925f"],
    ["kap zonder gevelhoogte", kap, { ...S, cpeDakLoef: 0.2, cpeDakLij: -0.4 }, "48330fadbb0c0505bf65c6b304665ade63e59e01e5560b5d60ffbef051797d68"],
    ["geen richting (fout)", portaal, { ...S, richtingLinks: false, richtingRechts: false }, "ebae140d7856e4d9e1498bd1c4ac36dbca2c81fd102c808c7200d394baff1618"],
  ];
  for (const [naam, m, inst, hash] of scenarios) {
    const r = genereerWindbelasting({ ...m, loadCases: gevallen }, inst);
    // Issue #49: bij een hellend dak draagt de geometrie een extra veld
    // `hellendDak` (vorm, α en de tabelopzoeking voor het venster). Met alle
    // c_pe ingevuld is dat het ENIGE verschil: zonder dat veld is het hele
    // resultaat nog steeds bit-identiek aan de hash van master d257219.
    if (r.geometrie?.hellendDak) {
      checkTrue(`${naam}: geometrie.hellendDak aanwezig (issue #49)`, r.geometrie.hellendDak.vorm !== undefined);
      delete r.geometrie.hellendDak;
    }
    checkExact(`${naam}: sha256 ongewijzigd`, createHash("sha256").update(JSON.stringify(r)).digest("hex"), hash);
  }
  // "zadel zonder cpe" weigerde tot issue #49 (hash c0e11cd6…); nu vult de
  // generator tabel 7.4a/7.4b zelf in. Dezelfde invoer slaagt daarom, met de
  // automatische zones — de rekenregels bewaakt test-wind-hellend-dak.mjs.
  {
    const r = genereerWindbelasting({ ...zadel, loadCases: gevallen }, { ...S });
    checkTrue("zadel zonder cpe: sinds issue #49 automatisch uit tabel 7.4a", r.ok
      && r.lasten.some((l) => /^§7\.2\.5 tabel 7\.4a /.test(l.omschrijving ?? "")));
  }
  // Instellingen van vóór de keuze (zonder `vorm`) rekenen als gebouw.
  const { vorm: _v, ...oud } = S;
  const r = genereerWindbelasting({ ...portaal, loadCases: gevallen }, oud);
  checkExact("instellingen zonder 'vorm' ⇒ gebouw, zelfde hash", createHash("sha256").update(JSON.stringify(r)).digest("hex"), scenarios[0][3]);
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
if (failed > 0) process.exit(1);
