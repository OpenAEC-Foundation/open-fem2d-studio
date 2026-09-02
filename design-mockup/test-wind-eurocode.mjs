// Windbelasting volgens NEN-EN 1991-1-4 + NL NB — normwaarden en stuwdruk.
//
// Analytisch narekenbare referenties (met de hand voorgerekend in het
// verslag bij deze wijziging):
//
//   [1] Stuwdruk, windgebied II, terreincategorie II, z_e = 10 m
//         v_b,0 = 27,0 m/s                       (NEN-EN 1991-1-4/NB tab. NB.1)
//         v_b   = 1,0 · 1,0 · 27,0 = 27,0 m/s    (EN 1991-1-4 form. 4.1)
//         k_r   = 0,19·(0,05/0,05)^0,07 = 0,19   (form. 4.5)
//         ln(10/0,05) = ln 200 = 5,298317367
//         c_r   = 0,19 · 5,298317367 = 1,006680300
//         v_m   = 1,006680300 · 27,0 = 27,18036810 m/s
//         I_v   = 1 / 5,298317367 = 0,188738811   (form. 4.7)
//         q_p   = (1 + 7·0,188738811)·0,5·1,25·27,18036810²
//               = 2,321171676 · 461,7327597 = 1071,761 N/m²
//               = 1,071761 kN/m²                  (form. 4.8)
//
//   [2] Zelfde gebied, terreincategorie III (z_0 = 0,3 m), z_e = 10 m
//         k_r  = 0,19·(0,3/0,05)^0,07 = 0,19·6^0,07
//         6^0,07 = e^(0,07·1,791759469) = e^0,125423163 = 1,133627...
//         k_r  = 0,215389...
//         ln(10/0,3) = ln 33,33333 = 3,506557897
//         c_r  = 0,755272...  → v_m = 20,39235... m/s
//         I_v  = 1/3,506557897 = 0,285180...
//         q_p  = (1+1,996263)·0,625·415,8480... = 1245,89... N/m²
//       (de test rekent deze reeks zelf na uit de formules — de assertie is
//        dat de module exact dezelfde formules gebruikt, niet een tabel)
//
//   [3] Vormfactoren verticale wand bij h/d = 0,5 (tabel 7.1, lineair
//       geïnterpoleerd tussen de rijen h/d = 0,25 en h/d = 1):
//         f = (0,50 − 0,25)/(1,00 − 0,25) = 1/3
//         c_pe,D = 0,7 + (0,8 − 0,7)·1/3 = 0,733333
//         c_pe,E = −0,3 + (−0,5 + 0,3)·1/3 = −0,366667
//         c_pe,A/B/C blijven −1,2 / −0,8 / −0,5
//
// Draaien met: npx tsx test-wind-eurocode.mjs

const {
  WINDGEBIEDEN, TERREIN_CATEGORIEEN, RHO_LUCHT, C_DIR, C_SEASON, K_I, C_O, Z0_II,
  berekenStuwdruk, handmatigeStuwdruk, cpeWand, berekenE,
  CPE_PLAT_DAK, CPI_ONBEKEND, CSCD_GRENSHOOGTE_M, CPE10_MIN_OPPERVLAK_M2,
} = await import("./src/lib/wind/windEurocode.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.01) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-12;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual} ≈ ${expected}`); }
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

// ─────────────────────────────────────────────────────────────────────────
log("\n[0] Normwaarden staan vast en dragen een vindplaats");
checkExact("v_b,0 gebied I  (NB tabel NB.1)", WINDGEBIEDEN.I.vb0, 29.5);
checkExact("v_b,0 gebied II (NB tabel NB.1)", WINDGEBIEDEN.II.vb0, 27.0);
checkExact("v_b,0 gebied III(NB tabel NB.1)", WINDGEBIEDEN.III.vb0, 24.5);
checkExact("ρ (§4.5 opm. 2)", RHO_LUCHT, 1.25);
checkExact("c_dir", C_DIR, 1.0);
checkExact("c_season", C_SEASON, 1.0);
checkExact("k_I (§4.4)", K_I, 1.0);
checkExact("c_o (§4.3.3, vlak terrein)", C_O, 1.0);
checkExact("z_0,II (form. 4.5)", Z0_II, 0.05);
for (const [id, t] of Object.entries(TERREIN_CATEGORIEEN)) {
  checkTrue(`terrein ${id} draagt een bron`, /tabel 4\.1/.test(t.bron), t.bron);
}
checkExact("z_0 categorie 0   (tabel 4.1)", TERREIN_CATEGORIEEN["0"].z0, 0.003);
checkExact("z_0 categorie I   (tabel 4.1)", TERREIN_CATEGORIEEN.I.z0, 0.01);
checkExact("z_0 categorie II  (tabel 4.1)", TERREIN_CATEGORIEEN.II.z0, 0.05);
checkExact("z_0 categorie III (tabel 4.1)", TERREIN_CATEGORIEEN.III.z0, 0.3);
checkExact("z_0 categorie IV  (tabel 4.1)", TERREIN_CATEGORIEEN.IV.z0, 1.0);
checkExact("z_min categorie II", TERREIN_CATEGORIEEN.II.zmin, 2);
checkExact("z_min categorie III", TERREIN_CATEGORIEEN.III.zmin, 5);
checkExact("c_pe,10 plat dak F (tabel 7.2, scherpe rand)", CPE_PLAT_DAK.F, -1.8);
checkExact("c_pe,10 plat dak G", CPE_PLAT_DAK.G, -1.2);
checkExact("c_pe,10 plat dak H", CPE_PLAT_DAK.H, -0.7);
checkExact("c_pe,10 plat dak I (opwaarts genomen)", CPE_PLAT_DAK.I, -0.2);
checkExact("c_pi onbekend (§7.2.9)", [...CPI_ONBEKEND].join("/"), "0.2/-0.3");
checkExact("c_s·c_d-grenshoogte (§6.2(1)a)", CSCD_GRENSHOOGTE_M, 15);
checkExact("c_pe,10-ondergrens oppervlak (§7.2.1(1))", CPE10_MIN_OPPERVLAK_M2, 10);

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Stuwdruk gebied II / terrein II / z_e = 10 m — handberekening");
{
  const r = berekenStuwdruk("II", "II", 10);
  // Zie de kop van dit bestand voor de stap-voor-stap handberekening.
  check("q_p [kN/m²]", r.qp_kNm2, 1.071761, 0.01);
  checkTrue("afleiding bevat alle stappen", r.afleiding.length >= 10,
    `${r.afleiding.length} regels`);
  checkTrue("elke afleidingsregel draagt een bron",
    r.afleiding.every((x) => typeof x.bron === "string" && x.bron.length > 3));
  checkTrue("q_p-regel verwijst naar formule 4.8",
    r.afleiding.some((x) => x.symbool.startsWith("q_p") && /4\.8/.test(x.bron)));
  checkExact("niet als handmatig gemarkeerd", r.handmatig, false);
}

log("\n[2] Stuwdruk gebied II / terrein III / z_e = 10 m — formules opnieuw");
{
  const t = TERREIN_CATEGORIEEN.III;
  const vb = 27.0;
  const kr = 0.19 * Math.pow(t.z0 / 0.05, 0.07);
  const cr = kr * Math.log(10 / t.z0);
  const vm = cr * vb;
  const iv = 1 / Math.log(10 / t.z0);
  const verwacht = (1 + 7 * iv) * 0.5 * 1.25 * vm * vm / 1000;
  const r = berekenStuwdruk("II", "III", 10);
  check("q_p [kN/m²] volgt exact de formules", r.qp_kNm2, verwacht, 1e-9);
  checkTrue("bebouwd terrein geeft een lagere stuwdruk dan onbebouwd",
    r.qp_kNm2 < berekenStuwdruk("II", "II", 10).qp_kNm2,
    `${r.qp_kNm2.toFixed(4)} < ${berekenStuwdruk("II", "II", 10).qp_kNm2.toFixed(4)}`);
}

log("\n[3] z < z_min wordt op z_min gerekend (§4.3.2)");
{
  const opZmin = berekenStuwdruk("II", "III", 5);   // z_min = 5 m
  const eronder = berekenStuwdruk("II", "III", 2);  // onder z_min
  check("q_p(2 m) = q_p(z_min = 5 m)", eronder.qp_kNm2, opZmin.qp_kNm2, 1e-9);
  checkTrue("de afleiding meldt de terugval op z_min",
    eronder.afleiding.some((x) => x.symbool === "z_e" && /z_min/.test(x.waarde)));
}

log("\n[4] Monotonie: hoger gebied én hogere referentiehoogte = hogere stuwdruk");
{
  const q1 = berekenStuwdruk("I", "II", 10).qp_kNm2;
  const q2 = berekenStuwdruk("II", "II", 10).qp_kNm2;
  const q3 = berekenStuwdruk("III", "II", 10).qp_kNm2;
  checkTrue("gebied I > II > III", q1 > q2 && q2 > q3,
    `${q1.toFixed(4)} > ${q2.toFixed(4)} > ${q3.toFixed(4)}`);
  // Bij gelijk gebied schaalt q_p met v_b,0²·(profielterm); de verhouding
  // I/III moet ruwweg (29,5/24,5)² = 1,4498 zijn.
  check("q_p(I)/q_p(III) = (29,5/24,5)²", q1 / q3, Math.pow(29.5 / 24.5, 2), 1e-6);
  const q10 = berekenStuwdruk("II", "II", 10).qp_kNm2;
  const q20 = berekenStuwdruk("II", "II", 20).qp_kNm2;
  checkTrue("q_p(20 m) > q_p(10 m)", q20 > q10, `${q20.toFixed(4)} > ${q10.toFixed(4)}`);
}

log("\n[5] Handmatige stuwdruk wordt onveranderd doorgegeven");
{
  const r = handmatigeStuwdruk(0.93, 8);
  checkExact("q_p", r.qp_kNm2, 0.93);
  checkExact("gemarkeerd als handmatig", r.handmatig, true);
  checkTrue("de afleiding meldt de herkomst", /gebruiker/.test(r.afleiding[0].bron));
}

log("\n[6] Vormfactoren verticale wanden (tabel 7.1) + interpolatie");
{
  const r5 = cpeWand(5);
  checkExact("h/d = 5 → c_pe,D", r5.D, 0.8);
  checkExact("h/d = 5 → c_pe,E", r5.E, -0.7);
  const r1 = cpeWand(1);
  checkExact("h/d = 1 → c_pe,D", r1.D, 0.8);
  checkExact("h/d = 1 → c_pe,E", r1.E, -0.5);
  const r025 = cpeWand(0.25);
  check("h/d = 0,25 → c_pe,D", r025.D, 0.7, 1e-9);
  check("h/d = 0,25 → c_pe,E", r025.E, -0.3, 1e-9);
  // Handberekening [3] in de kop.
  const rHalf = cpeWand(0.5);
  check("h/d = 0,50 → c_pe,D = 0,733333", rHalf.D, 0.7333333333, 1e-6);
  check("h/d = 0,50 → c_pe,E = −0,366667", rHalf.E, -0.3666666667, 1e-6);
  checkExact("zijwandzone A blijft −1,2", rHalf.A, -1.2);
  checkExact("zijwandzone B blijft −0,8", rHalf.B, -0.8);
  checkExact("zijwandzone C blijft −0,5", rHalf.C, -0.5);
  // Buiten het tabelbereik klemmen op de uiterste rij.
  check("h/d = 12 klemt op de rij h/d = 5 (E)", cpeWand(12).E, -0.7, 1e-9);
  check("h/d = 0,05 klemt op de rij h/d = 0,25 (D)", cpeWand(0.05).D, 0.7, 1e-9);
  // Halverwege tussen h/d 1 en 5: c_pe,E = −0,5 + (−0,7+0,5)·(3−1)/(5−1)
  check("h/d = 3 → c_pe,E = −0,60", cpeWand(3).E, -0.6, 1e-9);
}

log("\n[7] e = min(b; 2h) (§7.2.2 / fig. 7.5)");
{
  checkExact("b = 30, h = 6 → e = 12", berekenE(30, 6), 12);
  checkExact("b = 8,  h = 6 → e = 8",  berekenE(8, 6), 8);
  checkExact("b = 12, h = 6 → e = 12", berekenE(12, 6), 12);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
