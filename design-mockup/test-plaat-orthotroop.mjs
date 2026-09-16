// De ORTHOTROPE materiaalmatrix van het membraan (stap 3 van het platenspoor):
// `getConstitutiveMatrix` in core/fem/Triangle.ts, die Triangle (CST) en
// Quad4 delen.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] ISOTROOP VERANDERT NIET. Een materiaal ZONDER `orthotroop`-blok loopt
//       door exact dezelfde formules als voorheen. De verwachte matrix staat
//       hier met de hand uitgerekend (E = 210 000, ν = 0,3):
//           D11 = E/(1−ν²)      = 210000/0,91      = 230769,230769…
//           D12 = ν·E/(1−ν²)    = 0,3·230769,23…   =  69230,769230…
//           D33 = E/(2(1+ν))    = 210000/2,6       =  80769,230769…
//       en D11 − D12 = 2·D33 is de isotrope identiteit die daaruit volgt.
//   [2] ISOTROOP IS HET BIJZONDERE GEVAL VAN ORTHOTROOP. Vul in het
//       orthotrope blok E₁ = E₂ = E, ν₁₂ = ν en G₁₂ = E/(2(1+ν)) in, dan komt
//       er dezelfde matrix uit als in [1]. Dat is geen toeval maar algebra:
//       ν₂₁ = ν₁₂·E₂/E₁ = ν, dus 1 − ν₁₂ν₂₁ = 1 − ν² en de voorfactor wordt
//       E/(1−ν²). Gemeten tot op ≤ 1e-15 relatief (afrondruis van de deling).
//   [3] ISOTROPIE IS DRAAI-ONAFHANKELIJK. Dezelfde isotroop gevulde
//       orthotrope matrix, gedraaid over 37°, geeft weer dezelfde matrix.
//       Dat toetst de transformatie Tεᵀ·D·Tε zelf: een fout in T zou hier
//       meteen zichtbaar zijn, want isotroop materiaal mag niet van een
//       draaiing weten.
//   [4] 90° WISSELT DE HOOFDRICHTINGEN OM. D(E₁, E₂, θ = 90°) is
//       D(E₂, E₁, θ = 0°). Handmatig: met c = 0 en s = 1 is
//       Tε = [[0,1,0],[1,0,0],[0,0,−1]], en Tεᵀ·D·Tε verwisselt rij en kolom
//       1 en 2 terwijl het schuifblok (twee keer −1) op zijn plaats blijft.
//   [5] SYMMETRIE. D is symmetrisch bij elke hoek — dat volgt uit
//       ν₂₁·E₁ = ν₁₂·E₂, en de stijfheidsmatrix van de constructie is
//       daarvan afhankelijk.
//   [6] WEIGERINGEN. Vlakvervorming met een orthotroop materiaal en een
//       onmogelijke dwarscontractie (ν₁₂ν₂₁ ≥ 1) worden geweigerd met reden
//       in plaats van een matrix te leveren die er normaal uitziet.
//   [7] HOUT IN DE PRAKTIJK: C24 (E₀ = 11 000, E₉₀ = 370, G = 690, ν₁₂ = 0).
//       Met ν₁₂ = 0 is 1 − ν₁₂ν₂₁ = 1, dus D11 = E₁, D22 = E₂, D12 = 0 en
//       D33 = G — de normaalspanningen zijn ontkoppeld.
//
// Uitvoeren: npx tsx test-plaat-orthotroop.mjs   (vanuit design-mockup/)

const { getConstitutiveMatrix } = await import("./src/core/fem/Triangle.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * s;
  checkTrue(name, ok, `${Number(actual).toExponential(12)} ≈ ${Number(expected).toExponential(12)}`);
}
function weigert(name, f, patroon) {
  try { f(); checkTrue(name, false, "geen fout"); }
  catch (e) { checkTrue(name, patroon.test(e.message), e.message); }
}
/** Grootste relatieve afwijking tussen twee 3×3-matrices, geschaald op max|A|. */
function maxRel(A, B) {
  let schaal = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) schaal = Math.max(schaal, Math.abs(A.get(i, j)));
  let m = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    m = Math.max(m, Math.abs(A.get(i, j) - B.get(i, j)) / (schaal || 1));
  }
  return m;
}
const mat = (extra = {}) => ({
  id: 1, name: "proef", E: 210000, nu: 0.3, rho: 7850, color: "#000", ...extra,
});

const E = 210000, NU = 0.3;
const D11 = E / (1 - NU * NU);          // 230769,230769…
const D12 = NU * D11;                   //  69230,769230…
const D33 = E / (2 * (1 + NU));         //  80769,230769…

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Isotroop zonder orthotroop-blok: de matrix van vóór stap 3");
{
  const D = getConstitutiveMatrix(mat(), "plane_stress");
  checkRel("D11 = E/(1−ν²)", D.get(0, 0), D11, 0);
  checkRel("D22 = E/(1−ν²)", D.get(1, 1), D11, 0);
  checkRel("D12 = ν·E/(1−ν²)", D.get(0, 1), D12, 0);
  checkRel("D21 = D12 (symmetrisch)", D.get(1, 0), D12, 0);
  checkRel("D33 = E/(2(1+ν))", D.get(2, 2), D33, 1e-15);
  checkRel("D11 − D12 = 2·D33 (isotrope identiteit)", D.get(0, 0) - D.get(0, 1), 2 * D.get(2, 2), 1e-15);
  checkTrue("geen koppeling normaal–schuif", D.get(0, 2) === 0 && D.get(1, 2) === 0
    && D.get(2, 0) === 0 && D.get(2, 1) === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Isotroop ingevuld ORTHOTROOP blok geeft dezelfde matrix");
{
  const iso = getConstitutiveMatrix(mat(), "plane_stress");
  const ortho = getConstitutiveMatrix(
    mat({ orthotroop: { E1: E, E2: E, nu12: NU, G12: E / (2 * (1 + NU)), hoek: 0 } }),
    "plane_stress");
  const afw = maxRel(iso, ortho);
  checkTrue("orthotroop met isotrope getallen = de isotrope matrix", afw <= 1e-15,
    `max relatieve afwijking ${afw.toExponential(3)}`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Isotropie is draai-onafhankelijk (proef op de transformatie)");
for (const graden of [37, 90, 180, -45]) {
  const iso = getConstitutiveMatrix(mat(), "plane_stress");
  const gedraaid = getConstitutiveMatrix(
    mat({ orthotroop: { E1: E, E2: E, nu12: NU, G12: E / (2 * (1 + NU)), hoek: (graden * Math.PI) / 180 } }),
    "plane_stress");
  const afw = maxRel(iso, gedraaid);
  checkTrue(`isotroop over ${graden}° gedraaid blijft gelijk`, afw <= 1e-15,
    `max relatieve afwijking ${afw.toExponential(3)}`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] 90° wisselt E₁ en E₂ om");
{
  // C24 in het vlak: E₀ = 11000, E₉₀ = 370, G = 690, ν₁₂ = 0 (EN 338; de norm
  // geeft geen dwarscontractie voor hout, zie lib/plaatMateriaal.ts).
  const hout = { E1: 11000, E2: 370, nu12: 0, G12: 690 };
  const nul = getConstitutiveMatrix(mat({ orthotroop: { ...hout, hoek: 0 } }), "plane_stress");
  const negentig = getConstitutiveMatrix(
    mat({ orthotroop: { ...hout, hoek: Math.PI / 2 } }), "plane_stress");
  const omgewisseld = getConstitutiveMatrix(
    mat({ orthotroop: { E1: hout.E2, E2: hout.E1, nu12: 0, G12: hout.G12, hoek: 0 } }), "plane_stress");
  const afw = maxRel(omgewisseld, negentig);
  checkTrue("D(E₁,E₂,90°) = D(E₂,E₁,0°)", afw <= 1e-12,
    `max relatieve afwijking ${afw.toExponential(3)}`);
  checkRel("bij 0°: D11 = E₀ = 11000 (ν₁₂ = 0 ⇒ geen voorfactor)", nul.get(0, 0), 11000, 1e-15);
  checkRel("bij 0°: D22 = E₉₀ = 370", nul.get(1, 1), 370, 1e-15);
  checkRel("bij 0°: D12 = 0 (ontkoppeld)", nul.get(0, 1), 0, 0, 11000);
  checkRel("bij 0°: D33 = G = 690", nul.get(2, 2), 690, 1e-15);
  checkRel("bij 90°: D11 = E₉₀ = 370", negentig.get(0, 0), 370, 1e-12);
  checkRel("bij 90°: D22 = E₀ = 11000", negentig.get(1, 1), 11000, 1e-12);
  checkRel("bij 90°: D33 = G = 690 (afschuiving draait niet mee)", negentig.get(2, 2), 690, 1e-12);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Symmetrie bij elke hoek");
for (const graden of [0, 17, 45, 90, 123]) {
  const D = getConstitutiveMatrix(
    mat({ orthotroop: { E1: 11000, E2: 370, nu12: 0.02, G12: 690, hoek: (graden * Math.PI) / 180 } }),
    "plane_stress");
  let schaal = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) schaal = Math.max(schaal, Math.abs(D.get(i, j)));
  const asym = Math.max(
    Math.abs(D.get(0, 1) - D.get(1, 0)),
    Math.abs(D.get(0, 2) - D.get(2, 0)),
    Math.abs(D.get(1, 2) - D.get(2, 1)),
  ) / schaal;
  checkTrue(`symmetrisch bij ${graden}°`, asym <= 1e-15, `asymmetrie ${asym.toExponential(3)}`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Weigeringen in plaats van een matrix die er normaal uitziet");
weigert("vlakvervorming met orthotroop materiaal",
  () => getConstitutiveMatrix(
    mat({ orthotroop: { E1: 11000, E2: 370, nu12: 0, G12: 690, hoek: 0 } }), "plane_strain"),
  /alleen voor vlakspanning/);
// ν₁₂ = 6 met E₁ = 11000 en E₂ = 370 geeft ν₂₁ = 6·370/11000 = 0,2018…, dus
// ν₁₂·ν₂₁ = 1,211 ≥ 1: de materiaalmatrix zou niet positief-definiet zijn.
weigert("onmogelijke dwarscontractie (ν₁₂·ν₂₁ ≥ 1)",
  () => getConstitutiveMatrix(
    mat({ orthotroop: { E1: 11000, E2: 370, nu12: 6, G12: 690, hoek: 0 } }), "plane_stress"),
  /onmogelijk/);

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
