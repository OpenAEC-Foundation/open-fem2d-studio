// De tekeningen van het windvenster: de doorsnede van het spant met de
// windpijl en de druk-/zuigpijlen per staaf, en de plattegrond met de
// spanten, het uitgelichte spant en de windrichtingen. Gerenderd met
// react-dom/server en teruggelezen uit de SVG.
//
// Uitvoeren: npx tsx test-wind-schema.mjs

const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { DoorsnedeSchema, PlattegrondSchema, KLEUR_DRUK, KLEUR_ZUIGING, ROL_KLEUR } =
  await import("./src/lib/wind/WindSchema.tsx");
const { genereerWindbelasting, STANDAARD_WIND_INSTELLINGEN } =
  await import("./src/lib/wind/windGenerator.ts");

let geslaagd = 0;
let gefaald = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(voorwaarde, omschrijving, toelichting = "") {
  if (voorwaarde) { geslaagd += 1; log(`  ok   ${omschrijving}`); }
  else { gefaald += 1; log(`  FOUT ${omschrijving}${toelichting ? ` — ${toelichting}` : ""}`); }
}
const tel = (svg, re) => (svg.match(re) ?? []).length;

// ── Portaal met plat dak, wind van links, c_pi = −0,30 ─────────────────────
const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }, { id: 3, x: 0, z: 6000 }, { id: 4, x: 12000, z: 6000 }];
const beams = [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 }];
const inst = {
  ...STANDAARD_WIND_INSTELLINGEN, stuwdrukBron: "handmatig", qpHandmatig_kNm2: 1.0,
  richtingLinks: true, richtingRechts: false, richtingHaaks: false, cpiKeuze: "min", combinatiesGenereren: false,
};
const res = genereerWindbelasting({ nodes, beams, loadCases: [] }, inst);
ok(res.ok && res.geometrie !== null, "de generator levert een geometrie voor de tekening");

log("\n1. Doorsnede — constructie, wind en pijlen");
{
  const geval = res.samenvatting.perGeval[0];
  const svg = renderToStaticMarkup(React.createElement(DoorsnedeSchema, {
    geometrie: res.geometrie, richting: "links", regels: geval.regels, gevelhoogte_m: null,
  }));
  ok(tel(svg, /class="wgd-staaf wgd-rol-gevelLinks"/g) === 1 && tel(svg, /class="wgd-staaf wgd-rol-gevelRechts"/g) === 1
    && tel(svg, /class="wgd-staaf wgd-rol-dakPlat"/g) === 1, "drie staven, elk met hun rol");
  ok(svg.includes(`stroke="${ROL_KLEUR.gevelLinks}"`) && svg.includes(`stroke="${ROL_KLEUR.dakPlat}"`), "gevel en dak in hun eigen kleur");
  ok(tel(svg, /class="wgd-wind"/g) === 1, "één windpijl bij wind van links");
  const nietNul = geval.regels.filter((r) => Math.abs(r.w_kNm2) > 1e-9);
  const druk = nietNul.filter((r) => r.w_kNm2 > 0).length;
  const zuiging = nietNul.length - druk;
  ok(tel(svg, /class="wgd-druk"/g) === druk, `evenveel drukpijlen als vlakken met w > 0 (${druk})`, `${tel(svg, /class="wgd-druk"/g)}`);
  ok(tel(svg, /class="wgd-zuiging"/g) === zuiging, `evenveel zuigpijlen als vlakken met w < 0 (${zuiging})`, `${tel(svg, /class="wgd-zuiging"/g)}`);
  ok(svg.includes(`stroke="${KLEUR_DRUK}"`) && svg.includes(`stroke="${KLEUR_ZUIGING}"`), "druk blauw, zuiging rood");
  ok(svg.includes("d = 12,00 m") && svg.includes("h = 6,00 m"), "de maten d en h staan erbij");
  ok(!svg.includes("wgd-gedachte-gevel"), "geen gedachte gevels bij een portaal met gevels");
  const haaks = renderToStaticMarkup(React.createElement(DoorsnedeSchema, { geometrie: res.geometrie, richting: "haaks", regels: [] }));
  ok(haaks.includes("Wind haaks op het spant"), "wind haaks: het teken 'het vlak in' met uitleg");
  const leeg = renderToStaticMarkup(React.createElement(DoorsnedeSchema, { geometrie: res.geometrie, richting: null, regels: [] }));
  ok(!leeg.includes("wgd-wind") && !leeg.includes("wgd-druk"), "zonder richting en regels alleen de constructie");
}

log("\n2. Doorsnede — kap zonder gevel tekent de gedachte gevels");
{
  const kapNodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 3000, z: 1500 }];
  const kapBeams = [{ id: 1, from: 1, to: 3 }, { id: 2, from: 3, to: 2 }, { id: 3, from: 1, to: 2 }];
  const kap = genereerWindbelasting({ nodes: kapNodes, beams: kapBeams, loadCases: [] },
    { ...inst, cpeDakLoef: 0.2, cpeDakLij: -0.4, gevelhoogte_m: 3 });
  ok(kap.ok && kap.geometrie.kapZonderGevel, "kap zonder gevel met gevelhoogte 3 m");
  const svg = renderToStaticMarkup(React.createElement(DoorsnedeSchema, {
    geometrie: kap.geometrie, richting: "links", regels: kap.samenvatting.perGeval[0].regels, gevelhoogte_m: 3,
  }));
  ok(svg.includes("wgd-gedachte-gevel") && svg.includes("gevel 3,00 m"), "de gevels staan gestreept onder de kap, met hun hoogte");
  ok(svg.includes("h = 4,50 m"), "de hoogtemaat is gevel + kap");
  ok(tel(svg, /class="wgd-staaf wgd-rol-dakHellend"/g) === 2 && tel(svg, /class="wgd-staaf wgd-rol-vloer"/g) === 1, "twee dakstaven en een trekband");
}

log("\n3. Plattegrond — spanten, het gekozen spant en de windrichtingen");
{
  const basis = { gebouwlengte_m: 30, d_m: 12, hoh_m: 5, positie: "tussenspant", afstandTotKopgevel_m: 15, richtingLinks: true, richtingRechts: true, richtingHaaks: false, e_m: 12 };
  const svg = renderToStaticMarkup(React.createElement(PlattegrondSchema, basis));
  ok(tel(svg, /class="wgd-spant"/g) === 7, "30 m op h.o.h. 5 m geeft zeven spantlijnen", `${tel(svg, /class="wgd-spant"/g)}`);
  ok(tel(svg, /class="wgd-dit-spant"/g) === 1 && svg.includes("Tussenspant op 15,0 m"), "het gekozen spant is uitgelicht op 15 m");
  ok(tel(svg, /class="wgd-wind"/g) === 2, "twee windpijlen: van links en van rechts");
  ok(tel(svg, /<rect /g) === 3, "de randzone e/4 aan beide kopgevels plus de omtrek");
  ok(svg.includes("b = 30,0 m") && svg.includes("d = 12,0 m"), "b en d staan erbij");
  const kop = renderToStaticMarkup(React.createElement(PlattegrondSchema, { ...basis, positie: "kopgevelspant", richtingHaaks: true, richtingRechts: false, e_m: undefined }));
  ok(kop.includes("Kopgevelspant") && tel(kop, /class="wgd-wind"/g) === 2, "kopgevelspant: op de rand, met wind van links en haaks");
  ok(tel(kop, /<rect /g) === 1, "zonder e geen randzone");
}

log("\n4. Vrijstaand dak (§7.3) — zones, resultante, blokkering");
{
  const { BlokkeringSchema, KLEUR_RESULTANTE } = await import("./src/lib/wind/WindSchema.tsx");
  // Zadeldak 8 m breed, nok op 4 m, α = 15°, kolommen 2,5 m.
  const rise = 4000 * Math.tan(15 * Math.PI / 180);
  const zNodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8000, z: 0 }, { id: 3, x: 0, z: 2500 }, { id: 4, x: 4000, z: 2500 + rise }, { id: 5, x: 8000, z: 2500 }];
  const zBeams = [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 5 }, { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 }];
  const vInst = { ...inst, vorm: "vrijstaandDak", vrijstaandDakvorm: "zadel", blokkering_phi: 0, gebouwlengte_m: 20, afstandTotKopgevel_m: 10, hohSpant_m: 4 };
  const z = genereerWindbelasting({ nodes: zNodes, beams: zBeams, loadCases: [] }, vInst);
  ok(z.ok && z.geometrie.vrijstaand, "de generator levert een vrijstaand-dakgeometrie");
  const cpnet = z.samenvatting.perGeval.find((p) => p.sleutel === "luifel:cpnet:max");
  const svg = renderToStaticMarkup(React.createElement(DoorsnedeSchema, {
    geometrie: z.geometrie, richting: "alle", regels: cpnet.regels, resultanten: cpnet.resultanten ?? [],
  }));
  // C, A, D, A, C boven het dak.
  ok(tel(svg, /class="wgd-zone wgd-zone-C"/g) === 2 && tel(svg, /class="wgd-zone wgd-zone-A"/g) === 2
    && tel(svg, /class="wgd-zone wgd-zone-D"/g) === 1, "zoneband C·A·D·A·C boven het dak");
  ok(tel(svg, /class="wgd-wind"/g) === 1 && svg.includes("Alle windrichtingen"), "één dubbele windpijl: alle richtingen");
  ok(tel(svg, /class="wgd-druk"/g) === 6, "c_p,net neerwaarts: zes drukpijlen (drie zones per dakvlak)", `${tel(svg, /class="wgd-druk"/g)}`);
  ok(tel(svg, /class="wgd-staaf wgd-rol-binnen"/g) === 2, "de kolommen zijn geen gevel in de tekening");
  ok(!svg.includes("wgd-resultante"), "geen resultante bij een c_p,net-geval");
  ok(!svg.includes("wgd-gedachte-gevel"), "geen gedachte gevels bij een vrijstaand dak");

  const cf = z.samenvatting.perGeval.find((p) => p.sleutel === "luifel:cf:min:links");
  const svgCf = renderToStaticMarkup(React.createElement(DoorsnedeSchema, {
    geometrie: z.geometrie, richting: "alle", regels: cf.regels, resultanten: cf.resultanten,
  }));
  ok(tel(svgCf, /class="wgd-resultante"/g) === 1 && svgCf.includes(`stroke="${KLEUR_RESULTANTE}"`), "c_f alleen linkerdakvlak: één resultante");
  ok(tel(svgCf, /class="wgd-zuiging"/g) === 1 && tel(svgCf, /class="wgd-druk"/g) === 0, "…en één zuigpijl, op het linkerdakvlak");

  // Alleen het dak getekend, h opgegeven: de kolommen gestreept tot maaiveld.
  const alleenDak = genereerWindbelasting({ nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }], beams: [{ id: 1, from: 1, to: 2 }], loadCases: [] },
    { ...vInst, vrijstaandDakvorm: "lessenaar", vrijstaandHoogte_m: 2.6 });
  const svgH = renderToStaticMarkup(React.createElement(DoorsnedeSchema, { geometrie: alleenDak.geometrie, richting: "alle", regels: [] }));
  ok(svgH.includes("wgd-gedachte-kolom") && svgH.includes("h = 2,60 m"), "alleen het dak: gestreepte kolommen en h = 2,60 m");
  ok(tel(svgH, /class="wgd-zone wgd-zone-/g) === 3, "lessenaarsdak: zoneband C·A·C", `${tel(svgH, /class="wgd-zone wgd-zone-/g)}`);

  const plan = renderToStaticMarkup(React.createElement(PlattegrondSchema, {
    gebouwlengte_m: 20, d_m: 8, hoh_m: 4, positie: "tussenspant", afstandTotKopgevel_m: 10,
    richtingLinks: true, richtingRechts: true, richtingHaaks: false, e_m: 7, vrijstaand: { nokFractie: 0.5 },
  }));
  ok(tel(plan, /class="wgd-zone wgd-zone-B"/g) === 2 && tel(plan, /class="wgd-zone wgd-zone-C"/g) === 2
    && tel(plan, /class="wgd-zone wgd-zone-D"/g) === 1 && tel(plan, /class="wgd-zone wgd-zone-A"/g) === 1,
  "plattegrond: B aan de kopse einden, C langs de dakranden, D rond de nok, A");
  ok(!plan.includes("wgd-randzone"), "plattegrond vrijstaand dak: geen randzone e/4");

  const leeg = renderToStaticMarkup(React.createElement(BlokkeringSchema, { phi: 0, dakvorm: "lessenaar" }));
  const vol = renderToStaticMarkup(React.createElement(BlokkeringSchema, { phi: 1, dakvorm: "zadel" }));
  ok(tel(leeg, /class="wgd-blok"/g) === 0 && leeg.includes("φ = 0 — leeg"), "blokkering φ = 0: geen stapel");
  ok(tel(vol, /class="wgd-blok"/g) === 4 && vol.includes("φ = 1,00"), "blokkering φ = 1: de stapel aan de lijzijde");
}

log("");
log(`${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);
