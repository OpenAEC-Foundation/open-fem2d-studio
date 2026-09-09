// DE BEWAKING TEGEN UITEENLOPEN (kruislaaghout) — de TS-kant leest hier de
// GEDEELDE referentie, dezelfde die de Rust-kant leest.
//
// De mechanica van een CLT-opbouw staat twee keer in dit project:
//   src-tauri/crates/nen-en-1995-1-1/src/clt.rs   (CltMechanics — de kern)
//   design-mockup/src/lib/cltCheckBuilder.ts       (cltMechanica — de spiegel)
// De tweede is geen tekenhulpje: via sectionResolver.ts levert hij de E, A en I
// waarmee de SOLVER rekent, en hij tekent het spanningsverloop op het scherm.
// Loopt hij weg van de kern, dan rekent het model met een andere plaat dan er
// getoetst wordt.
//
// Sinds het houthoofdstuk tekent de PDF diezelfde figuur ook na
// (src-tauri/crates/report/src/houtfiguren.rs). Twee tekeningen van hetzelfde
// ding lopen uit elkaar — daarom staan de verwachte waarden op één plaats:
//   src-tauri/crates/report/tests/golden/cltmeetkunde-referentie.json
// De andere lezer is
//   src-tauri/crates/report/tests/cltmeetkunde_referentie.rs
// Geen van beide tests draagt eigen getallen. Verschuift één implementatie een
// laaggrens, een arm of een monsterpunt, dan valt die kant om.
//
// Hoe je de referentie BEWUST bijwerkt staat in het JSON-bestand zelf onder
// `bijwerken`; de korte versie:
//
//   node node_modules/tsx/dist/cli.mjs test-cltmeetkunde-referentie.mjs --schrijf
//
// schrijft `mechanica`, `lagen` en `tau_verloop` opnieuw uit de TS-kant en laat
// alle tekstvelden staan. Daarna is DEZE test per definitie groen en zit het
// bewijs in `cargo test -p report --test cltmeetkunde_referentie`.
//
// Draaien met: node node_modules/tsx/dist/cli.mjs test-cltmeetkunde-referentie.mjs
//          (of: node scripts/run-tests.mjs --filter=cltmeetkunde-referentie)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const REFERENTIE = join(
  REPO,
  "src-tauri",
  "crates",
  "report",
  "tests",
  "golden",
  "cltmeetkunde-referentie.json",
);

const clt = await import("./src/lib/cltCheckBuilder.ts");
// Alleen voor de tabelcontrole hieronder: dit is de TWEEDE, met de hand
// overgetypte E-tabel (de eerste staat in nen-en-1995-1-1/src/data.rs).
const { TIMBER_E_MEAN } = await import("./src/lib/sectionResolver.ts");

const schrijfstand = process.argv.includes("--schrijf");

let passed = 0,
  failed = 0;
const log = (s) => process.stdout.write(s + "\n");

const referentie = JSON.parse(readFileSync(REFERENTIE, "utf8"));
const { absoluut: ABS, relatief: REL } = referentie.tolerantie;
const E_UIT_REFERENTIE = referentie.e0_mean_mpa;

/** De E-kaart die de referentie voorschrijft; INVOER voor `cltMechanica`. */
const eVanKlasse = (k) => E_UIT_REFERENTIE[k];

/**
 * Vergelijking op WAARDE met een expliciete marge, niet op een grens. Waarom
 * de marge zo klein mag zijn, staat in het JSON-bestand onder `tolerantie`.
 */
const gelijk = (werkelijk, verwacht) =>
  Number.isFinite(werkelijk) && Math.abs(werkelijk - verwacht) <= ABS + REL * Math.abs(verwacht);

function checkTrue(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) {
    passed++;
    log(`  ✓ ${naam}`);
  } else {
    failed++;
    log(`  ✗ ${naam}${toelichting ? `: ${toelichting}` : ""}`);
  }
}

function checkWaarde(naam, werkelijk, verwacht) {
  checkTrue(naam, gelijk(werkelijk, verwacht), `${werkelijk} in plaats van ${verwacht}`);
}

/** De mechanica van één geval, of een luide fout — een geval dat niet rekent
 *  bewaakt niets. */
function mechanicaVan(geval) {
  const m = clt.cltMechanica(geval.opbouw, eVanKlasse);
  if (!m) throw new Error(`${geval.naam}: de opbouw uit de referentie rekent niet`);
  return m;
}

// ── Schrijfstand: de referentie naschrijven uit de TS-kant ────────────────
//
// Bewust GEEN onderdeel van de testronde: naschrijven maakt deze test per
// definitie groen, dus het bewijs verschuift dan naar de Rust-kant. Daarom een
// aparte vlag, en daarom blijven de tekstvelden (`waarom`, `afleiding`) staan —
// die moeten met de hand mee.
if (schrijfstand) {
  for (const geval of referentie.gevallen) {
    const mech = mechanicaVan(geval);
    const { my_ed_knm: M, vz_ed_kn: V, k_cr: KCR } = geval.krachten;
    geval.mechanica = {
      hoogte_mm: mech.hoogte,
      z0_mm: mech.z0,
      ei_ef_nmm2: mech.eiEf,
      ea_ef_n: mech.eaEf,
      i_ef_net_mm4: clt.cltIEfNetMm4(mech),
      lagen_zelfde_e: clt.cltLagenZelfdeE(mech),
    };
    const sigma = clt.cltSigmaVerloop(mech, M);
    geval.lagen = clt.cltLaagStijfheden(mech).map((x, i) => ({
      index: x.index,
      z_top_mm: mech.lagen[i].zBoven,
      z_bot_mm: mech.lagen[i].zOnder,
      e_mpa: x.e,
      a_mm2: x.a,
      i_eigen_mm4: x.iEigen,
      arm_mm: x.arm,
      steiner_mm4: x.steiner,
      sigma_top_mpa: sigma[i][0].v,
      sigma_bot_mpa: sigma[i][1].v,
    }));
    geval.tau_verloop = clt.cltTauVerloop(mech, V, KCR).map((p) => [p.z, p.v]);
  }
  writeFileSync(REFERENTIE, netjes(referentie) + "\n", "utf8");
  log(`Referentie herschreven uit de TS-kant: ${REFERENTIE}`);
  log("Loop nu de `afleiding` van elk geraakt geval na, en draai daarna");
  log("  cargo test -p report --test cltmeetkunde_referentie");
  log("Blijft die rood, dan is de Rust-kant niet meegegaan.");
  process.exit(0);
}

// ── 0. De E-tabel ─────────────────────────────────────────────────────────
//
// E_0,mean staat twee keer met de hand overgetypt. Wijkt de TS-tabel af van de
// referentie, dan zou dat verschil hieronder in ELK getal meelopen zonder dat
// je ziet waar het vandaan komt.
log("0. E_0,mean uit sectionResolver tegen de gedeelde referentie");
for (const [klasse, e] of Object.entries(E_UIT_REFERENTIE)) {
  checkTrue(
    `${klasse}: E_0,mean = ${e} N/mm²`,
    TIMBER_E_MEAN[klasse] === e,
    `TIMBER_E_MEAN heeft ${TIMBER_E_MEAN[klasse]}`,
  );
}

// ── 1. Zwaartelijn en effectieve stijfheden ───────────────────────────────
log(`\n1. Zwaartelijn en stijfheden (${referentie.gevallen.length} opbouwen)`);

for (const geval of referentie.gevallen) {
  const mech = mechanicaVan(geval);
  const v = geval.mechanica;
  checkWaarde(`${geval.naam}: h`, mech.hoogte, v.hoogte_mm);
  checkWaarde(`${geval.naam}: z₀`, mech.z0, v.z0_mm);
  checkWaarde(`${geval.naam}: (EI)_ef`, mech.eiEf, v.ei_ef_nmm2);
  checkWaarde(`${geval.naam}: (EA)_ef`, mech.eaEf, v.ea_ef_n);
  checkWaarde(`${geval.naam}: I_ef,net`, clt.cltIEfNetMm4(mech), v.i_ef_net_mm4);
  checkTrue(
    `${geval.naam}: lengtelagen zelfde E = ${v.lagen_zelfde_e}`,
    clt.cltLagenZelfdeE(mech) === v.lagen_zelfde_e,
  );
}

// ── 2. De opbouw van I_y per laag ─────────────────────────────────────────
//
// A_i, I_i, a_i en de Steiner-term: de vier getallen waaruit (EI)_ef is
// opgebouwd en die in de uitdraai regel voor regel staan. Verschuift een
// laaggrens, dan verschuift de arm mee en valt dit blok om.
log("\n2. Opbouw van I_y per laag");

for (const geval of referentie.gevallen) {
  const mech = mechanicaVan(geval);
  const rijen = clt.cltLaagStijfheden(mech);
  const sigma = clt.cltSigmaVerloop(mech, geval.krachten.my_ed_knm);
  checkTrue(
    `${geval.naam}: ${geval.lagen.length} lagen`,
    rijen.length === geval.lagen.length,
    `${rijen.length} lagen`,
  );
  if (rijen.length !== geval.lagen.length) continue;
  for (let i = 0; i < rijen.length; i++) {
    const w = rijen[i];
    const v = geval.lagen[i];
    const velden = [
      ["index", w.index, v.index],
      ["z_boven", mech.lagen[i].zBoven, v.z_top_mm],
      ["z_onder", mech.lagen[i].zOnder, v.z_bot_mm],
      ["E_i", w.e, v.e_mpa],
      ["A_i", w.a, v.a_mm2],
      ["I_i", w.iEigen, v.i_eigen_mm4],
      ["a_i", w.arm, v.arm_mm],
      ["A_i·a_i²", w.steiner, v.steiner_mm4],
      ["σ boven", sigma[i][0].v, v.sigma_top_mpa],
      ["σ onder", sigma[i][1].v, v.sigma_bot_mpa],
    ];
    const mis = velden.filter(([, a, b]) => !gelijk(a, b));
    checkTrue(
      `${geval.naam}: laag ${v.index} — A_i, I_i, a_i, Steiner en σ`,
      mis.length === 0,
      mis.map(([n, a, b]) => `${n} is ${a} in plaats van ${b}`).join("; "),
    );
  }
  // De somregel uit de uitdraai moet ook echt de som zijn.
  const som = rijen.reduce((s, x) => s + (x.draagt ? x.iTotaal : 0), 0);
  const somEi = rijen.reduce((s, x) => s + x.eiBijdrage, 0);
  checkWaarde(`${geval.naam}: Σ E_i·(I_i + A_i·a_i²) = (EI)_ef`, somEi, geval.mechanica.ei_ef_nmm2);
  if (geval.mechanica.lagen_zelfde_e) {
    checkWaarde(
      `${geval.naam}: Σ(I_i + A_i·a_i²) = I_ef,net (alle lengtelagen zelfde E)`,
      som,
      geval.mechanica.i_ef_net_mm4,
    );
  } else {
    checkTrue(
      `${geval.naam}: Σ(I_i + A_i·a_i²) ≠ I_ef,net (verschillende E per laag)`,
      !gelijk(som, geval.mechanica.i_ef_net_mm4),
      `beide ${som}`,
    );
  }
}

// ── 3. Het bemonsterde τ-verloop ──────────────────────────────────────────
//
// De VOLGORDE telt mee: dezelfde punten in een andere volgorde tekenen een
// andere lijn, en beide kanten moeten hetzelfde pad lopen.
log("\n3. Bemonsterd τ-verloop");

for (const geval of referentie.gevallen) {
  const mech = mechanicaVan(geval);
  const { vz_ed_kn: V, k_cr: KCR } = geval.krachten;
  const werkelijk = clt.cltTauVerloop(mech, V, KCR);
  const verwacht = geval.tau_verloop;
  checkTrue(
    `${geval.naam}: ${verwacht.length} monsterpunten`,
    werkelijk.length === verwacht.length,
    `${werkelijk.length} punten`,
  );
  if (werkelijk.length !== verwacht.length) continue;
  const afwijkend = werkelijk
    .map((p, i) => (gelijk(p.z, verwacht[i][0]) && gelijk(p.v, verwacht[i][1]) ? null : i))
    .filter((i) => i !== null);
  checkTrue(
    `${geval.naam}: elk monsterpunt op zijn plaats en op zijn waarde`,
    afwijkend.length === 0,
    afwijkend
      .map((i) => `punt ${i} is (${werkelijk[i].z}, ${werkelijk[i].v}) in plaats van (${verwacht[i]})`)
      .join("; "),
  );
  // De piek die de figuur tekent MOET de τ_d halen die de tabel ernaast
  // toont. Dat is de fout waarvoor dit bestand in de eerste plaats bestaat.
  const piek = Math.max(...werkelijk.map((p) => p.v));
  const perLaag = mech.lagen.map((l) => {
    const kandidaten = [l.zBoven, l.zOnder];
    if (l.e > 0 && mech.z0 > l.zBoven && mech.z0 < l.zOnder) kandidaten.push(mech.z0);
    return Math.max(...kandidaten.map((z) => clt.cltTauOpZ(mech, z, V, KCR)));
  });
  const tauD = Math.max(...perLaag);
  checkTrue(
    `${geval.naam}: getekende piek haalt τ_d van de toets (${tauD.toFixed(6)})`,
    gelijk(piek, tauD),
    `piek ${piek}`,
  );
}

// ── 4. De referentie zelf ─────────────────────────────────────────────────
//
// Zonder deze controles verdwijnt de bewaking door het weghalen van een geval,
// en blijft alles groen. Dezelfde eisen staan aan de Rust-kant.
log("\n4. Dekking van de referentie");

const gevallen = referentie.gevallen;
const heeft = (f) => gevallen.some(f);
checkTrue(`minstens vijf opbouwen (${gevallen.length})`, gevallen.length >= 5);
const richtingen = (g) => g.opbouw.layers.map((l) => l.orientation);
checkTrue(
  "een symmetrische opbouw (z₀ op halve hoogte)",
  heeft((g) => gelijk(g.mechanica.z0_mm, g.mechanica.hoogte_mm / 2)),
);
checkTrue(
  "een ASYMMETRISCHE opbouw waarin z₀ binnen een lengtelaag valt maar NIET op een gelijkmatig monsterpunt",
  heeft((g) => {
    const mech = mechanicaVan(g);
    const laag = mech.lagen.find((l) => l.e > 0 && mech.z0 > l.zBoven && mech.z0 < l.zOnder);
    if (!laag) return false;
    const stap = (laag.zOnder - laag.zBoven) / (clt.CLT_TAU_MONSTERS_LENGTELAAG - 1);
    const rest = ((mech.z0 - laag.zBoven) / stap) % 1;
    return rest > 1e-6 && rest < 1 - 1e-6;
  }),
);
checkTrue(
  "een opbouw waarin z₀ in een DWARSlaag valt (daar mag hij géén extra monsterpunt worden)",
  heeft((g) => {
    const mech = mechanicaVan(g);
    return mech.lagen.some((l) => l.e === 0 && mech.z0 > l.zBoven && mech.z0 < l.zOnder);
  }),
);
checkTrue(
  "een opbouw met verschillende sterkteklassen in de lengtelagen",
  heeft((g) => !g.mechanica.lagen_zelfde_e),
);
checkTrue(
  "een opbouw met een dwarslaag als buitenlaag",
  heeft((g) => richtingen(g)[0] === "Transverse"),
);
checkTrue("een geval met k_cr ≠ 1", heeft((g) => g.krachten.k_cr !== 1));
checkTrue("een geval met een negatief moment", heeft((g) => g.krachten.my_ed_knm < 0));
checkTrue(
  "een geval met het kleinste toegestane aantal lagen (3)",
  heeft((g) => g.opbouw.layers.length === 3),
);
// Elke opbouw uit de referentie moet ook door de bouwer van de app komen: een
// proefopbouw die de app zou weigeren, bewaakt een tekening die nooit
// getekend wordt.
for (const geval of gevallen) {
  const naam = clt.formatCltProfiel(geval.opbouw, "C24");
  const terug = clt.parseCltProfiel(naam, "C24");
  checkTrue(
    `${geval.naam}: profielnaam "${naam}" leest terug tot dezelfde opbouw`,
    JSON.stringify(terug) === JSON.stringify(geval.opbouw),
    JSON.stringify(terug),
  );
}

// ── Opmaak van het referentiebestand ──────────────────────────────────────

/**
 * `JSON.stringify` met inspringing zet elk getal op een eigen regel; een
 * τ-verloop van 27 punten wordt dan honderd regels en is niet meer te lezen.
 * Korte objecten en getallenparen gaan daarom terug op één regel — dezelfde
 * opmaak als in `test-betonfiguren-referentie.mjs`, zodat `--schrijf` geen
 * opmaakruis in de diff zet.
 */
function netjes(doc) {
  let tekst = JSON.stringify(doc, null, 2);
  const opEenRegel = (m) => {
    if (!m.includes("\n")) return m;
    const een = m.replace(/\s*\n\s*/g, " ");
    return een.length <= 200 ? een : m;
  };
  // 1. Getallenreeksen. Het uitsluiten van het aanhalingsteken houdt de
  //    tekstlijsten (`waarom`, `afleiding`) juist wél meerregelig — die zijn
  //    om te lézen.
  tekst = tekst.replace(/\[[^[\]{}"]*\]/g, (m) => {
    const een = opEenRegel(m);
    return een === m ? m : een.replace(/^\[\s+/, "[").replace(/\s+]$/, "]");
  });
  // 2. Objecten, van binnen naar buiten.
  for (let ronde = 0; ronde < 3; ronde++) {
    tekst = tekst.replace(/\{[^{}[\]]*\}/g, opEenRegel);
  }
  return tekst.replace(/\{(?:[^{}[\]]|\{[^{}[\]\n]*\})*\}/g, opEenRegel);
}

// ── Slot ──────────────────────────────────────────────────────────────────
log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) {
  log("");
  log("Een verschil hier betekent dat de TS-mechanica van de gedeelde referentie");
  log("is afgeweken. Is dat BEWUST, pas dan ook de Rust-kant aan en werk de");
  log("referentie bij — zie `bijwerken` in");
  log(`  ${REFERENTIE}`);
  process.exit(1);
}
