// Windbelastinggenerator — vrijstaand dak, uitbreiding (issue #16):
// wrijving (§7.3(7), §7.5, tabel 7.10), geschakelde overkappingen (§7.3(9),
// tabel 7.8) en wind op de kolommen (§7.6/§7.7) — met het bewijs dat de
// bestaande windgevallen bit-identiek bleven.
//
// AFGELEZEN TABELCELLEN (NEN-EN 1991-1-4:2005+C2:2011, uitgave met NB:2019,
// van de gerenderde tabelpagina's)
//   tabel 7.10 (c_fr): glad (staal, glad beton) 0,01 ; ruw (ruw beton,
//     beteerde boorden) 0,02 ; zeer ruw (rimpels, ribben, kronkelingen) 0,04
//   tabel 7.8 (ψ_mc, voor alle φ; op maximaal / op minimaal):
//     1 eerste overkapping 1,0 / 0,8 ; 2 tweede 0,9 / 0,7 ;
//     3 derde en volgende 0,7 / 0,7
//   figuur 7.18: rij van zeven overkappingen genummerd 1, 2, 3, 3, 3, 2, 1
//   figuur 7.22: vrijstaand dak A_fr = 2·d·b
//   §7.7(1) met NB-tekst: c_f,0 = 2 voor doorsneden met scherpe randen
//   figuur 7.23 (gelabelde punten, d/b → c_f,0): ≤0,2 → 2,0 ; 0,6 → 2,35 ;
//     0,7 → 2,4 ; 1 → 2,1 ; 2 → 1,65 ; 5 → 1,0 ; ≥10 → 0,9 (log-as)
//   figuur 7.24: ψ_r = 1,0 bij r/b = 0
//
// HANDBEREKENING W — wrijving op de carport L (lessenaarsdak α = 10°)
//   q_p(z_e = 3,00 m; II; III) = 0,58359 kN/m² (zie test-wind-vrijstaand-dak).
//   Zeer ruw, c_fr = 0,04; belastingbreedte 2,50 m; A_fr boven en onder:
//     q = c_fr·q_p·2·breedte = 0,04·0,58359·2·2,50 = 0,116718 kN/m langs de
//     dakstaaf; staaf 3 loopt van links naar rechts ⇒ +0,116718 (van links),
//     −0,116718 (van rechts).
//
// HANDBEREKENING G — geschakelde zadeldaken (model Z, α = +15°, φ = 0)
//   q_p(3,5718 m; II; II) = 0,79122 kN/m², breedte 4,00 m. Rij van 5, positie 2
//   ⇒ rang min(2; 5+1−2) = 2 ⇒ ψ_mc 0,9 (max) / 0,7 (min).
//   c_p,net zone A max +0,9 ⇒ 0,9·0,9 = 0,81 ⇒ |q| = 0,79122·0,81·4 = 2,56356
//   c_p,net zone D opwaarts −1,8 ⇒ −1,8·0,7 = −1,26 ⇒ |q| = 3,98776
//   c_f max +0,4 ⇒ 0,36 ⇒ |q| = 1,13936 ; c_f min −0,8 ⇒ −0,56 ⇒ |q| = 1,77234
//   (staaf 3 loopt van links omhoog: lokale +z wijst omhoog, dus neerwaarts
//   is q negatief en opwaarts positief)
//
// HANDBEREKENING K — kolommen van model Z (2,50 m hoog, tot op maaiveld)
//   z_e = bovenkant kolom = 2,50 m (§7.7(3)); II; II (z_min = 2 m):
//     c_r = 0,19·ln(2,5/0,05) = 0,74328 ; v_m = 0,74328·27,0 = 20,0686 m/s
//     I_v = 1/ln(50) = 0,25562
//     q_p = (1 + 7·0,25562)·½·1,25·20,0686² = 702,14 N/m² = 0,70214 kN/m²
//   Scherphoekig, b = 200 mm: q = 0,70214·2,0·0,200 = 0,280855 kN/m
//   Rechthoekig 200 × 300 mm (b = 200 loodrecht, d = 300 in de wind):
//     d/b = 1,5; tussen de gelabelde punten 1 → 2,1 en 2 → 1,65 op de log-as:
//     c_f,0 = 2,1 + (1,65 − 2,1)·ln(1,5)/ln(2) = 1,83677
//     q = 0,70214·1,83677·0,200 = 0,257932 kN/m
//   Plaatachtig 200 × 20 mm: d/b = 0,1 ⇒ c_f,0 = 2,0, §7.6(3) +25 % ⇒ 2,5
//   Met h = 6,00 m opgegeven: maaiveld 6,00 − 3,5718 = 2,4282 m onder de
//     modelvoet ⇒ z_e kolom = 4,9282 m ⇒ q_p = 0,87519 kN/m² ⇒
//     q = 0,87519·2,0·0,200 = 0,350078 kN/m
//
// EVENWICHT H — model Z, horizontaal geval van links (ruw + scherphoekig 200)
//   wrijving: 2 dakstaven, q = 0,02·0,79122·2·4 = 0,126596 kN/m langs de staaf,
//     horizontaal per staaf q·L·cos 15° = q·4,00 ⇒ Σ = 1,012764 kN
//   kolommen: 2·0,280855·2,50 = 1,404273 kN
//   Σ F_x = 2,417037 kN ⇒ Σ reacties horizontaal = −2,417037 kN
//   verticaal: wrijving op de twee hellingen heft elkaar op ⇒ Σ = 0
//
// HANDBEREKENING C — combinatie van carport L (issue #26): wind van links,
// c_f neerwaarts (φ = 0,5, α = 10° ⇒ c_f = +0,5), zeer ruw, kolommen
// rechthoekig 200 × 300 mm; UGT 6.10b zonder Q: 1,35·G + 1,5·W (G zonder
// lasten). Horizontaal, karakteristiek (+ = naar rechts):
//   dak c_f: F = q_p·c_f·breedte·L = 0,58359·0,5·2,5·5,077133 = 3,70372 kN
//     loodrecht op het naar rechts aflopende dak, neerwaarts ⇒
//     F_x = −F·sin 10° = −0,643143 kN
//   wrijving: 0,116718 kN/m langs L, F_x = 0,116718·L·cos 10° = 0,583592 kN
//   kolom 1 (0 … 3,00 m): q_p(3,00; III) = q_p(z_min = 5 m) = 0,58359;
//     q = 0,58359·1,83677·0,200 = 0,214384 kN/m ⇒ 0,643153 kN
//   kolom 2 (0 … 3,00 − 0,881635 = 2,118365 m): zelfde q_p ⇒ 0,454144 kN
//   Σ F_x = −0,643143 + 0,583592 + 0,643153 + 0,454144 = 1,037746 kN
//   UGT: 1,5·1,037746 = 1,556618 kN ⇒ Σ reacties horizontaal = −1,556618 kN
//   (dat dak- en kolomterm 1 bijna hetzelfde getal geven is toeval:
//   0,5·2,5·5,077133·sin 10° ≈ 1,83677·0,2·3,00)
//   Alleen het dak (vóór issue #26): 1,5·−0,643143 = −0,964715 kN aan
//   belasting ⇒ reactie +0,964715 kN — naar de verkeerde kant.
//
// Draaien met: npx tsx test-wind-vrijstaand-uitbreiding.mjs

import { createHash } from "node:crypto";

const {
  genereerWindbelasting, STANDAARD_WIND_INSTELLINGEN,
  handtekeningVanGeneratie, handtekeningVanModel, vrijstaandDakUitgangspunten,
} = await import("./src/lib/wind/windGenerator.ts");
const {
  berekenStuwdruk, TABEL_710_CFR, TABEL_78_PSI_MC, geschakeldeReductie,
  cf0Rechthoekig, FIGUUR_723_CF0, CF0_SCHERPHOEKIG,
} = await import("./src/lib/wind/windEurocode.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { windCombinatiesVoor, verouderdeWindCombinaties } = await import("./src/lib/combinatieBeheer.ts");

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
const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const fouten = (res) => res.meldingen.filter((m) => m.niveau === "fout").map((m) => m.tekst).join(" | ");

const gevallenG = [{ id: 1, name: "Eigen gewicht", type: "dead" }];
const vrij = {
  ...STANDAARD_WIND_INSTELLINGEN,
  vorm: "vrijstaandDak", combinatiesGenereren: false, stuwdrukBron: "berekend", windgebied: "II",
};

// Model L: lessenaarsdak α = 10° (als in test-wind-vrijstaand-dak.mjs).
const riseL = 5000 * Math.tan(10 * graad);
const nodesL = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }, { id: 3, x: 0, z: 3000 }, { id: 4, x: 5000, z: 3000 - riseL }];
const beamsL = [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 }];
const instL = {
  ...vrij, vrijstaandDakvorm: "lessenaar", terreincategorie: "III", blokkering_phi: 0.5,
  hohSpant_m: 2.5, gebouwlengte_m: 6, afstandTotKopgevel_m: 2.5, positieSpant: "tussenspant",
};
// Model Z: zadeldak α = +15°.
const riseZ = 4000 * Math.tan(15 * graad);
const nodesZ = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8000, z: 0 }, { id: 3, x: 0, z: 2500 }, { id: 4, x: 4000, z: 2500 + riseZ }, { id: 5, x: 8000, z: 2500 }];
const beamsZ = [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 5 }, { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 }];
const instZ = {
  ...vrij, vrijstaandDakvorm: "zadel", terreincategorie: "II", blokkering_phi: 0,
  hohSpant_m: 4, gebouwlengte_m: 20, afstandTotKopgevel_m: 10, positieSpant: "tussenspant",
};

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Tabelwaarden en opzoekingen");
{
  checkExact("tabel 7.10 glad", TABEL_710_CFR.glad, 0.01);
  checkExact("tabel 7.10 ruw", TABEL_710_CFR.ruw, 0.02);
  checkExact("tabel 7.10 zeer ruw", TABEL_710_CFR.zeerRuw, 0.04);
  checkExact("tabel 7.8 rij 1", JSON.stringify(TABEL_78_PSI_MC[0].max) + "/" + TABEL_78_PSI_MC[0].min, "1/0.8");
  checkExact("tabel 7.8 rij 2", TABEL_78_PSI_MC[1].max + "/" + TABEL_78_PSI_MC[1].min, "0.9/0.7");
  checkExact("tabel 7.8 rij 3", TABEL_78_PSI_MC[2].max + "/" + TABEL_78_PSI_MC[2].min, "0.7/0.7");
  checkExact("figuur 7.18: rij van 7 ⇒ 1,2,3,3,3,2,1",
    [1, 2, 3, 4, 5, 6, 7].map((p) => geschakeldeReductie(7, p).rang).join(","), "1,2,3,3,3,2,1");
  checkExact("rij van 2 ⇒ beide eerste", [1, 2].map((p) => geschakeldeReductie(2, p).rang).join(","), "1,1");
  checkTrue("aantal 1 is niet geschakeld", !geschakeldeReductie(1, 1).ok);
  checkTrue("positie buiten de rij geweigerd", !geschakeldeReductie(5, 6).ok);
  checkExact("§7.7 c_f,0 scherphoekig", CF0_SCHERPHOEKIG, 2.0);
  for (const [db, c] of FIGUUR_723_CF0) checkExact(`figuur 7.23 punt d/b = ${db}`, cf0Rechthoekig(db), c);
  checkExact("figuur 7.23 d/b = 0,1 ⇒ 2,0", cf0Rechthoekig(0.1), 2.0);
  checkExact("figuur 7.23 d/b = 50 ⇒ 0,9", cf0Rechthoekig(50), 0.9);
  check("figuur 7.23 d/b = 1,5 (log) = 1,83677", cf0Rechthoekig(1.5), 1.83677, 0.001);
  check("figuur 7.23 d/b = 3 (log) = 1,36237", cf0Rechthoekig(3), 1.36237, 0.001);
  // De gelabelde tussenpunten liggen op de rechte tussen de knikken van de
  // log-as — de reden voor logaritmisch interpoleren (afleestolerantie 0,05).
  const lijn = (x, [x0, y0], [x1, y1]) => y0 + (y1 - y0) * Math.log(x / x0) / Math.log(x1 / x0);
  checkTrue("2,35 bij 0,6 ligt op de lijn 0,2→0,7", Math.abs(lijn(0.6, [0.2, 2.0], [0.7, 2.4]) - 2.35) < 0.05);
  checkTrue("2,1 bij 1 ligt op de lijn 0,7→5", Math.abs(lijn(1, [0.7, 2.4], [5, 1.0]) - 2.1) < 0.05);
  checkTrue("1,65 bij 2 ligt op de lijn 0,7→5", Math.abs(lijn(2, [0.7, 2.4], [5, 1.0]) - 1.65) < 0.05);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Bestaande windgevallen bit-identiek (sha256)");
{
  // Referentie vastgelegd met de generator van master 2030b3e, vóór deze
  // uitbreiding: sha256 van JSON.stringify van het resultaat ZONDER de
  // meldingen (gevallen, lasten, combinaties, samenvatting, geometrie, ok).
  // De meldingen veranderden wél: de waarschuwing "Niet gegenereerd" noemt nu
  // de keuze in het venster in plaats van "voeg ze dan zelf toe". De
  // gebouwgevallen worden in test-wind-vrijstaand-dak.mjs [9] op het HELE
  // resultaat vergeleken.
  const g = Math.PI / 180;
  const rL = 5000 * Math.tan(10 * g), rZ = 4000 * Math.tan(15 * g), rK = 4000 * Math.tan(10 * g);
  const L = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }, { id: 3, x: 0, z: 3000 }, { id: 4, x: 5000, z: 3000 - rL }], beams: beamsL };
  const Z = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8000, z: 0 }, { id: 3, x: 0, z: 2500 }, { id: 4, x: 4000, z: 2500 + rZ }, { id: 5, x: 8000, z: 2500 }], beams: beamsZ };
  const K = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8000, z: 0 }, { id: 3, x: 0, z: 3000 }, { id: 4, x: 4000, z: 3000 - rK }, { id: 5, x: 8000, z: 3000 }], beams: beamsZ };
  const base = { ...STANDAARD_WIND_INSTELLINGEN, vorm: "vrijstaandDak" };
  const gev = [{ id: 1, name: "Eigen gewicht", type: "dead" }, { id: 2, name: "Q dak", type: "live" }];
  const scenarios = [
    ["L φ 0,5 TC III", L, { ...base, vrijstaandDakvorm: "lessenaar", terreincategorie: "III", blokkering_phi: 0.5, hohSpant_m: 2.5, gebouwlengte_m: 6, afstandTotKopgevel_m: 2.5 },
      "0177bf8e1b363bec7075b5c23b23513fe06384daedc972a12e7c8668bf6fad72"],
    ["L kopgevel, handmatig", L, { ...base, vrijstaandDakvorm: "lessenaar", positieSpant: "kopgevelspant", stuwdrukBron: "handmatig", qpHandmatig_kNm2: 0.8, blokkering_phi: 1 },
      "846a73765684c69dfcaeb93fe7017f5109d6aa8a42cfd90844a9bf7ea7db331a"],
    ["Z φ 0", Z, { ...base, vrijstaandDakvorm: "zadel", hohSpant_m: 4, gebouwlengte_m: 20, afstandTotKopgevel_m: 10 },
      "c72346acc7d4756b3aff4df82b3b199294893cb909c1e155d7ddaa54d7d64e54"],
    ["Z h opgegeven", Z, { ...base, vrijstaandDakvorm: "zadel", vrijstaandHoogte_m: 6, blokkering_phi: 0.3, combinatiesGenereren: false },
      "f820dbf8e529dcba5c85263b85e7f4b67411c4251aeffaf3be4c234cbff2923e"],
    ["K kieldak", K, { ...base, vrijstaandDakvorm: "zadel", blokkering_phi: 0.7 },
      "332fad8e6e2dead58360c9fc9c3807e5172eb5079c7ba82b982e2ef85b05f754"],
    ["Z als lessenaar (fout)", Z, { ...base, vrijstaandDakvorm: "lessenaar" },
      "d536b9b6c118a07ae98d7b458cd16e76d7ead4c785c5587acca46f471bc30de1"],
  ];
  for (const [naam, m, inst, hash] of scenarios) {
    const { meldingen: _m, ...r } = genereerWindbelasting({ ...m, loadCases: gev }, inst);
    checkExact(`${naam}: sha256 ongewijzigd`, sha(r), hash);
    // Instellingen van vóór deze keuzes (zonder de nieuwe velden): zelfde uitvoer.
    const { wrijving: _w, aantalOverkappingen: _a, positieOverkapping: _p, kolomDoorsnede: _k, kolomBreedte_mm: _b, kolomDiepte_mm: _d, ...oud } = inst;
    const { meldingen: _m2, ...r2 } = genereerWindbelasting({ ...m, loadCases: gev }, oud);
    checkExact(`${naam}: zonder de nieuwe velden ook`, sha(r2), hash);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Wrijving — handberekening W (lessenaarsdak)");
{
  const res = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gevallenG }, { ...instL, wrijving: "zeerRuw" });
  checkTrue("generatie geslaagd", res.ok, fouten(res));
  const qp = berekenStuwdruk("II", "III", 3).qp_kNm2;
  check("q_p = 0,58359 kN/m²", qp, 0.58359, 0.01);
  checkExact("acht gevallen: zes van het dak + twee horizontaal",
    res.gevallen.map((g) => g.sleutel.replace("luifel:", "")).slice(6).join(","), "horizontaal:links,horizontaal:rechts");
  checkExact("naam van links", res.gevallen[6].naam, "Wind vrijstaand dak wrijving, van links");
  const links = lastenVan(res, "luifel:horizontaal:links");
  const rechts = lastenVan(res, "luifel:horizontaal:rechts");
  checkExact("alleen de dakstaaf", links.map((l) => l.beamId).join(","), "3");
  check("q van links = +0,04·q_p·2·2,50 = 0,116718", links[0].q, 0.04 * qp * 2 * 2.5);
  check("q van links ≈ 0,116718 (handgetal)", links[0].q, 0.116718, 0.01);
  check("q van rechts = −0,116718", rechts[0].q, -0.116718, 0.01);
  checkExact("axiaal", links[0].richting, "axiaal");
  checkTrue("omschrijving noemt tabel 7.10, c_fr en figuur 7.22",
    links[0].omschrijving.includes("tabel 7.10") && links[0].omschrijving.includes("c_fr = 0,04") && links[0].omschrijving.includes("fig. 7.22"));
  checkTrue("dakgevallen dragen geen richting-veld", res.lasten.filter((l) => !l.gevalSleutel.includes("horizontaal")).every((l) => l.richting === undefined));
  checkTrue("melding: component haaks op het spant valt uit het vlak",
    res.meldingen.some((m) => m.niveau === "waarschuwing" && m.tekst.includes("uit het vlak") && m.tekst.includes("langsverband")));
  checkTrue("melding: §7.5(3)-uitsluiting niet toegepast, met reden",
    res.meldingen.some((m) => m.tekst.includes("§7.5(3)") && m.tekst.includes("dikte van het dak")));
  // Tot issue #26 een waarschuwing dat elke combinatie maar één windgeval
  // nam; nu neemt de combinatiebouw ze samen (zie [7]) en zegt de melding hoe.
  checkTrue("melding: horizontaal geval gaat mee met de dakgevallen van dezelfde richting",
    res.meldingen.some((m) => m.niveau === "info" && m.tekst.includes("neemt daarom het horizontale geval van dezelfde")));
  checkTrue("'Niet gegenereerd' noemt wrijving niet meer",
    !res.meldingen.some((m) => m.tekst.startsWith("Niet gegenereerd") && m.tekst.includes("wrijvingskracht")));

  // Handtekening: generatie ↔ model (qDir "x") gelijk; zonder de axiaal-markering niet.
  const idVan = new Map(res.gevallen.map((g, k) => [g.sleutel, 100 + k]));
  const cases = res.gevallen.map((g) => ({ id: idVan.get(g.sleutel), name: g.naam, type: "wind", gegenereerd: { bron: "wind", sleutel: g.sleutel } }));
  const loads = res.lasten.map((l, k) => ({
    id: k + 1, type: "lineLoad", caseId: idVan.get(l.gevalSleutel), beamId: l.beamId, q: l.q,
    qDir: l.richting === "axiaal" ? "x" : "z", qCoord: "local", startFrac: l.startFrac, endFrac: l.endFrac,
    omschrijving: l.omschrijving, gegenereerdDoor: "wind",
  }));
  const gen = handtekeningVanGeneratie(res.gevallen, res.lasten, []);
  checkTrue("handtekening model = generatie", handtekeningVanModel(cases, loads, []) === gen);
  checkTrue("een loodrechte last met hetzelfde getal is een andere handtekening",
    handtekeningVanModel(cases, loads.map((l) => ({ ...l, qDir: "z" })), []) !== gen);

  const tekst = vrijstaandDakUitgangspunten(cases, loads);
  checkTrue("uitgangspunten (rapport en PDF) noemen het wrijvingsgeval",
    tekst.includes("Wind vrijstaand dak wrijving, van links: §7.3(7)/§7.5 tabel 7.10: c_fr = 0,04"));

  const geen = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gevallenG }, instL);
  checkExact("zonder wrijving: zes gevallen", geen.gevallen.length, 6);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Geschakelde overkappingen — handberekening G");
{
  const qp = berekenStuwdruk("II", "II", 2.5 + 4 * Math.tan(15 * graad)).qp_kNm2;
  const res = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, { ...instZ, aantalOverkappingen: 5, positieOverkapping: 2 });
  checkTrue("generatie geslaagd", res.ok, fouten(res));
  checkExact("samenvatting: rang 2", res.samenvatting.vrijstaand.geschakeld.rang, 2);
  // Staaf 3: zone A is de fractie 0,2–0,8.
  const aMax = lastenVan(res, "luifel:cpnet:max", 3).find((l) => l.startFrac === 0.2);
  // Staaf 3 loopt van links omhoog: lokale +z wijst omhoog, neerwaarts is negatief.
  check("c_p,net A neerwaarts 0,9·0,9: q = −2,56356", aMax.q, -2.56356, 0.01);
  check("… = −q_p·0,81·4", aMax.q, -qp * 0.9 * 0.9 * 4);
  checkTrue("omschrijving noemt ψ_mc 0,9 en tabel 7.8",
    aMax.omschrijving.includes("c_p,net = +0,90 · ψ_mc 0,9 (tabel 7.8, tweede overkapping) = +0,81"), aMax.omschrijving);
  const dMin = lastenVan(res, "luifel:cpnet:min", 3).find((l) => l.startFrac !== undefined && Math.abs(l.endFrac - 1) < 1e-9);
  check("c_p,net D opwaarts −1,8·0,7: q = +3,98776 (omhoog)", dMin.q, 3.98776, 0.01);
  check("c_f neerwaarts 0,4·0,9: q = −1,13936", lastenVan(res, "luifel:cf:max:beide", 3)[0].q, -1.13936, 0.01);
  check("c_f opwaarts −0,8·0,7: q = +1,77234 (omhoog)", lastenVan(res, "luifel:cf:min:beide", 3)[0].q, 1.77234, 0.01);

  const midden = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, { ...instZ, aantalOverkappingen: 5, positieOverkapping: 3 });
  check("positie 3 van 5 ⇒ rang 3, c_f max 0,4·0,7", lastenVan(midden, "luifel:cf:max:beide", 3)[0].q, -qp * 0.4 * 0.7 * 4);
  const eind = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, { ...instZ, aantalOverkappingen: 5, positieOverkapping: 5 });
  check("positie 5 van 5 ⇒ eerste: c_f max ×1,0", lastenVan(eind, "luifel:cf:max:beide", 3)[0].q, -qp * 0.4 * 4);
  check("positie 5 van 5 ⇒ eerste: c_f min ×0,8", lastenVan(eind, "luifel:cf:min:beide", 3)[0].q, qp * 0.8 * 0.8 * 4);

  const buiten = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, { ...instZ, aantalOverkappingen: 5, positieOverkapping: 6 });
  checkTrue("positie buiten de rij ⇒ fout, niets gegenereerd", !buiten.ok && buiten.lasten.length === 0);
  const halve = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG }, { ...instZ, aantalOverkappingen: 2.5 });
  checkTrue("geen geheel aantal ⇒ fout", !halve.ok);

  // Lessenaarsdak: tabel 7.8 geldt niet ⇒ niet reduceren, wel melden.
  const lRij = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gevallenG }, { ...instL, aantalOverkappingen: 3, positieOverkapping: 2 });
  const lLos = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gevallenG }, instL);
  checkTrue("lessenaarsdak in een rij: lasten gelijk aan het losse dak", JSON.stringify(lRij.lasten) === JSON.stringify(lLos.lasten));
  checkTrue("lessenaarsdak in een rij: waarschuwing met reden",
    lRij.meldingen.some((m) => m.niveau === "waarschuwing" && m.tekst.includes("tabel 7.8") && m.tekst.includes("tweezijdig")));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Wind op de kolommen — handberekening K");
{
  check("q_p(2,50 m; II; II) = 0,70214 kN/m²", berekenStuwdruk("II", "II", 2.5).qp_kNm2, 0.70214, 0.01);
  const scherp = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG },
    { ...instZ, kolomDoorsnede: "scherphoekig", kolomBreedte_mm: 200 });
  checkTrue("generatie geslaagd", scherp.ok, fouten(scherp));
  const kl = lastenVan(scherp, "luifel:horizontaal:links");
  checkExact("naam", scherp.gevallen.find((g) => g.sleutel === "luifel:horizontaal:links").naam, "Wind vrijstaand dak kolommen, van links");
  checkExact("kolommen 1 en 2 belast, dak niet", kl.map((l) => l.beamId).join(","), "1,2");
  // Kolom 1 loopt omhoog: lokale +z wijst naar −x; kracht in +x ⇒ q negatief.
  check("kolom 1 van links: q = −0,280855 kN/m (kracht +x)", kl[0].q, -0.280855, 0.01);
  check("kolom 2 van links: q = −0,280855 kN/m", kl[1].q, -0.280855, 0.01);
  check("kolom 1 van rechts: +0,280855", lastenVan(scherp, "luifel:horizontaal:rechts", 1)[0].q, 0.280855, 0.01);
  checkTrue("loodrecht op de staaf (geen richting-veld)", kl.every((l) => l.richting === undefined));
  checkTrue("omschrijving: §7.7, c_f = 2,00, b en z_e",
    kl[0].omschrijving.startsWith("§7.7 (7.11): c_f = c_f,0·ψ_λ = 2,00·1,00 = 2,00, b = 200 mm, z_e = 2,50 m"), kl[0].omschrijving);
  checkTrue("melding noemt ψ_λ = 1,0 met reden", scherp.meldingen.some((m) => m.tekst.includes("ψ_λ = 1,0") && m.tekst.includes("figuur 7.36")));
  checkTrue("melding: cirkelvormig niet, met reden", scherp.meldingen.some((m) => m.tekst.includes("Cirkelvormige kolommen") && m.tekst.includes("figuur 7.28")));

  const recht = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG },
    { ...instZ, kolomDoorsnede: "rechthoekig", kolomBreedte_mm: 200, kolomDiepte_mm: 300 });
  check("rechthoekig 200×300: q = −0,257932", lastenVan(recht, "luifel:horizontaal:links", 1)[0].q, -0.257932, 0.01);
  checkTrue("omschrijving: d/b = 1,50 ⇒ c_f,0 = 1,837", lastenVan(recht, "luifel:horizontaal:links", 1)[0].omschrijving.includes("d/b = 1,50 ⇒ c_f,0 = 1,837"));

  const plaat = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG },
    { ...instZ, kolomDoorsnede: "rechthoekig", kolomBreedte_mm: 200, kolomDiepte_mm: 20 });
  check("plaatachtig d/b = 0,1: c_f = 2,0·1,25 ⇒ q = −0,70214·2,5·0,2", lastenVan(plaat, "luifel:horizontaal:links", 1)[0].q, -0.70214 * 2.5 * 0.2, 0.01);
  checkTrue("plaatachtig: melding §7.6(3)", plaat.meldingen.some((m) => m.tekst.includes("§7.6(3)")));

  const hoog = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG },
    { ...instZ, vrijstaandHoogte_m: 6, kolomDoorsnede: "scherphoekig", kolomBreedte_mm: 200 });
  check("h = 6,00 m: z_e kolom 4,9282 m ⇒ q = −0,350078", lastenVan(hoog, "luifel:horizontaal:links", 1)[0].q, -0.350078, 0.01);

  const hand = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG },
    { ...instZ, stuwdrukBron: "handmatig", qpHandmatig_kNm2: 0.9, kolomDoorsnede: "scherphoekig", kolomBreedte_mm: 150 });
  check("handmatige q_p 0,90: q = −0,9·2,0·0,15", lastenVan(hand, "luifel:horizontaal:links", 1)[0].q, -0.27);

  const zonderB = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG },
    { ...instZ, kolomDoorsnede: "rechthoekig", kolomBreedte_mm: 200, kolomDiepte_mm: 0 });
  checkTrue("rechthoekig zonder d ⇒ fout", !zonderB.ok);

  // Een schoor krijgt geen kolomwind, en dat wordt gemeld.
  const metSchoor = genereerWindbelasting({ nodes: nodesZ, beams: [...beamsZ, { id: 9, from: 1, to: 4 }], loadCases: gevallenG },
    { ...instZ, kolomDoorsnede: "scherphoekig", kolomBreedte_mm: 200 });
  checkTrue("schoor 9 niet belast", lastenVan(metSchoor, "luifel:horizontaal:links", 9).length === 0);
  checkTrue("schoor 9 gemeld", metSchoor.meldingen.some((m) => m.tekst.startsWith("Geen kolomwind op staaf 9")));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Evenwicht H — echte solver, horizontaal geval van links");
{
  const res = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gevallenG },
    { ...instZ, wrijving: "ruw", kolomDoorsnede: "scherphoekig", kolomBreedte_mm: 200 });
  checkTrue("generatie geslaagd", res.ok, fouten(res));
  checkExact("naam", res.gevallen.find((g) => g.sleutel === "luifel:horizontaal:links").naam, "Wind vrijstaand dak wrijving + kolommen, van links");
  const lasten = lastenVan(res, "luifel:horizontaal:links");
  check("wrijving staaf 3: q = 0,02·0,79122·2·4 = 0,126596", lasten.find((l) => l.beamId === 3).q, 0.126596, 0.01);
  const E = 210000, A = 3880, I = 16700000;
  const { perCase } = solveAllCases({
    nodes: nodesZ,
    beams: beamsZ.map((b) => ({ ...b, E, A, I })),
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: lasten.map((l) => ({ beamId: l.beamId, q: l.q, qDir: l.richting === "axiaal" ? "x" : "z", qCoord: "local", caseId: 1 })),
    cases: [{ id: 1, name: "horizontaal van links" }],
  });
  const r = perCase.get(1);
  checkTrue("solver levert een resultaat", !!r);
  const fx = som([1, 2].map((id) => r.reactions.get(id)?.fx ?? 0)) / 1000;
  const fz = som([1, 2].map((id) => r.reactions.get(id)?.fz ?? 0)) / 1000;
  check("Σ reacties horizontaal = −2,417037 kN", fx, -2.417037, 0.05);
  check("Σ reacties verticaal = 0", fz + 1, 1, 0.01);

  const F_lang = 0.02 * berekenStuwdruk("II", "II", 2.5 + 4 * Math.tan(15 * graad)).qp_kNm2 * 2 * 2 * Math.hypot(4, riseZ / 1000) * 20;
  check("wrijving uit het vlak: 0,02·q_p·2·8,282·20 = 5,24245 kN", F_lang, 5.24245, 0.01);
  checkTrue("… staat met dat getal in de melding", res.meldingen.some((m) => m.tekst.includes("= 5,242 kN")));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Combinaties: wrijving en kolomwind samen met de dakgevallen van dezelfde richting (issue #26)");
{
  const gev = [{ id: 1, name: "Eigen gewicht", type: "dead" }, { id: 2, name: "Q dak", type: "live", categorie: "H" }];
  const HOR = /^luifel:horizontaal:(links|rechts)$/;
  /** Per combinatie de windsleutels, gesorteerd. */
  const windVan = (c) => [c.windSleutel, ...(c.windMeeSleutels ?? [])];
  /** De windrichting van een dakgeval, of null als het voor alle richtingen geldt. */
  const controleer = (label, res, dakRichting) => {
    checkTrue(`${label}: generatie geslaagd`, res.ok, fouten(res));
    const dakCombi = res.combinaties.filter((c) => !HOR.test(c.windSleutel));
    checkExact(`${label}: geen combinatie waarin het horizontale geval leidt`, dakCombi.length, res.combinaties.length);
    let fout = 0, links = 0, rechts = 0;
    for (const c of res.combinaties) {
      const w = windVan(c);
      const hor = w.filter((k) => HOR.test(k));
      const dak = w.filter((k) => !HOR.test(k));
      const eigen = dakRichting(c.windSleutel);
      const ok = dak.length === 1 && hor.length === 1 && new Set(w).size === w.length
        && (eigen === null || hor[0] === `luifel:horizontaal:${eigen}`)
        && c.naam.includes(`van ${hor[0].endsWith("links") ? "links" : "rechts"}`)
        && !c.naam.includes(`van ${hor[0].endsWith("links") ? "rechts" : "links"}`);
      if (!ok) { fout++; if (fout <= 3) log(`    ${c.naam}: ${w.join(" + ")}`); }
      if (hor[0]?.endsWith("links")) links++; else rechts++;
    }
    checkExact(`${label}: elke combinatie = één dakgeval + het horizontale geval van dezelfde richting, niet van de andere`, fout, 0);
    checkExact(`${label}: evenveel combinaties van links als van rechts`, links, rechts);
    return dakCombi;
  };

  // Lessenaarsdak: c_f heeft een richting, c_p,net niet.
  const instC = { ...instL, combinatiesGenereren: true, wrijving: "zeerRuw", kolomDoorsnede: "rechthoekig", kolomBreedte_mm: 200, kolomDiepte_mm: 300 };
  const res = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gev }, instC);
  const richtingL = (k) => /^luifel:cf:(?:max|min):(links|rechts)$/.exec(k)?.[1] ?? null;
  controleer("lessenaar", res, richtingL);
  const zonder = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gev }, { ...instL, combinatiesGenereren: true });
  const perGeval = zonder.combinaties.length / zonder.gevallen.length;
  checkTrue("zonder wrijving: evenveel combinaties per geval", Number.isInteger(perGeval) && perGeval > 0, `${perGeval}`);
  // c_p,net max/min × links/rechts + c_f max/min × links/rechts (elk één) = 8 varianten.
  checkExact("lessenaar: 8 windvarianten × de combinaties per geval", res.combinaties.length, 8 * perGeval);
  checkTrue("c_f van links nooit met het horizontale geval van rechts",
    !res.combinaties.some((c) => c.windSleutel.endsWith("cf:max:links") && windVan(c).includes("luifel:horizontaal:rechts")));
  checkTrue("c_p,net neerwaarts komt met links én met rechts",
    ["links", "rechts"].every((r) => res.combinaties.some((c) => c.windSleutel === "luifel:cpnet:max" && windVan(c).includes(`luifel:horizontaal:${r}`))));
  checkTrue("naam met een eigen richting",
    res.combinaties.filter((c) => c.windSleutel === "luifel:cf:max:links")[0].naam
      .endsWith("UGT 6.10b — Wind vrijstaand dak c_f neerwaarts, van links + wrijving + kolommen leidend"));
  checkTrue("naam voor alle richtingen noemt de richting",
    res.combinaties.some((c) => c.naam.includes("Wind vrijstaand dak c_p,net opwaarts + wrijving + kolommen, van rechts leidend")));

  // De weg van de app: gevallen met id's, combinaties uit alleen de gevallen
  // (windCombinatiesVoor), handtekening model = generatie, niet verouderd.
  const idVan = new Map(res.gevallen.map((g, k) => [g.sleutel, 100 + k]));
  const cases = [...gev, ...res.gevallen.map((g) => ({ id: idVan.get(g.sleutel), name: g.naam, type: "wind", gegenereerd: { bron: "wind", sleutel: g.sleutel } }))];
  const afgeleid = windCombinatiesVoor(cases, "CC2");
  checkExact("windCombinatiesVoor: zelfde aantal", afgeleid.length, res.combinaties.length);
  const eerste = afgeleid.find((c) => c.name.includes("c_f neerwaarts, van links + wrijving") && c.type === "uls" && !c.name.includes("gunstig"));
  checkExact("factor c_f van links = 1,5", eerste.factors.get(idVan.get("luifel:cf:max:links")), 1.5);
  checkExact("factor horizontaal van links = 1,5", eerste.factors.get(idVan.get("luifel:horizontaal:links")), 1.5);
  checkTrue("geen factor op horizontaal van rechts", !eerste.factors.has(idVan.get("luifel:horizontaal:rechts")));
  const combis = afgeleid.map((c, k) => ({ id: 500 + k, ...c }));
  const loads = res.lasten.map((l, k) => ({
    id: k + 1, type: "lineLoad", caseId: idVan.get(l.gevalSleutel), beamId: l.beamId, q: l.q,
    qDir: l.richting === "axiaal" ? "x" : "z", qCoord: "local", startFrac: l.startFrac, endFrac: l.endFrac,
    omschrijving: l.omschrijving, gegenereerdDoor: "wind",
  }));
  checkTrue("handtekening model = generatie (geen onnodige herberekening)",
    handtekeningVanModel(cases, loads, combis) === handtekeningVanGeneratie(res.gevallen, res.lasten, res.combinaties));
  const zonderHor = combis.map((c) => ({ ...c, factors: new Map([...c.factors].filter(([id]) => id !== idVan.get("luifel:horizontaal:links") && id !== idVan.get("luifel:horizontaal:rechts"))) }));
  checkTrue("… en een combinatie zonder het horizontale geval is een andere handtekening",
    handtekeningVanModel(cases, loads, zonderHor) !== handtekeningVanGeneratie(res.gevallen, res.lasten, res.combinaties));
  checkExact("verouderdeWindCombinaties: de gegenereerde set is actueel", verouderdeWindCombinaties({ loadCases: cases, combinations: combis, gevolgklasse: "CC2" }), null);
  checkTrue("verouderdeWindCombinaties: de oude set (zonder horizontaal) is verouderd",
    verouderdeWindCombinaties({ loadCases: cases, combinations: zonderHor, gevolgklasse: "CC2" }) !== null);

  const tekst = vrijstaandDakUitgangspunten(cases, loads);
  checkTrue("uitgangspunten (rapport en PDF) leggen de combinatiekeuze uit",
    tekst.split("\n").at(-1).startsWith("Combinaties: wrijving en wind op de kolommen") && tekst.includes("§5.3(3)"));

  // Handberekening C met de echte solver: superpositie van de gevallen met de
  // factoren van de combinatie.
  const E = 210000, A = 3880, I = 16700000;
  const { perCase } = solveAllCases({
    nodes: nodesL,
    beams: beamsL.map((b) => ({ ...b, E, A, I })),
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: loads.map((l) => ({ beamId: l.beamId, q: l.q, qDir: l.qDir, qCoord: "local", caseId: l.caseId, startFrac: l.startFrac, endFrac: l.endFrac })),
    cases: res.gevallen.map((g) => ({ id: idVan.get(g.sleutel), name: g.naam })),
  });
  const fxVan = (factors) => som([...factors].map(([id, f]) => {
    const r = perCase.get(id);
    return r ? f * som([1, 2].map((n) => r.reactions.get(n)?.fx ?? 0)) / 1000 : 0;
  }));
  const qp = berekenStuwdruk("II", "III", 3).qp_kNm2;
  const sin10 = Math.sin(10 * graad), L = 5000 / Math.cos(10 * graad) / 1000;
  const col = qp * cf0Rechthoekig(1.5) * 0.2;
  const hand = -qp * 0.5 * 2.5 * L * sin10 + 0.04 * qp * 2 * 2.5 * 5 + col * 3 + col * (3 - riseL / 1000);
  check("handberekening Σ F_x karakteristiek = 1,037746 kN", hand, 1.037746, 0.001);
  check("UGT 6.10b c_f ↓ van links + wrijving + kolommen: Σ R_x = −1,5·1,037746 = −1,556618 kN", fxVan(eerste.factors), -1.556618, 0.01);
  check("  = −1,5·hand", fxVan(eerste.factors), -1.5 * hand, 0.05);
  const alleenDak = new Map([...eerste.factors].filter(([id]) => id !== idVan.get("luifel:horizontaal:links")));
  check("zonder het horizontale geval (vóór issue #26) was het +0,964715 kN", fxVan(alleenDak), 0.964715, 0.01);

  // Zadeldak: c_f geldt voor alle richtingen; `links`/`rechts` in de sleutel is het dakvlak.
  const resZ = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gev },
    { ...instZ, combinatiesGenereren: true, wrijving: "ruw", kolomDoorsnede: "scherphoekig", kolomBreedte_mm: 200 });
  controleer("zadel", resZ, () => null);
  const zonderZ = genereerWindbelasting({ nodes: nodesZ, beams: beamsZ, loadCases: gev }, { ...instZ, combinatiesGenereren: true });
  const perGevalZ = zonderZ.combinaties.length / zonderZ.gevallen.length;
  checkExact("zadel: 8 dakgevallen × 2 richtingen × de combinaties per geval", resZ.combinaties.length, 16 * perGevalZ);
  checkTrue("zadel: c_f alleen linkerdakvlak met wind van links én van rechts",
    ["links", "rechts"].every((r) => resZ.combinaties.some((c) => c.windSleutel === "luifel:cf:max:links" && windVan(c).includes(`luifel:horizontaal:${r}`))));

  // Alleen kolomwind (geen wrijving): zelfde koppeling.
  const kolomAlleen = genereerWindbelasting({ nodes: nodesL, beams: beamsL, loadCases: gev },
    { ...instL, combinatiesGenereren: true, kolomDoorsnede: "scherphoekig", kolomBreedte_mm: 200 });
  controleer("alleen kolommen", kolomAlleen, richtingL);

  // Zonder horizontale gevallen: combinaties precies als voorheen (één windgeval, geen extra veld).
  checkTrue("zonder wrijving/kolommen: geen windMeeSleutels", zonder.combinaties.every((c) => !("windMeeSleutels" in c)));
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
if (failed > 0) process.exit(1);
