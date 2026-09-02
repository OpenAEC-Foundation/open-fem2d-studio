// ═══════════════════════════════════════════════════════════════════════════
// R18 — Vakwerkligger 45,60 m met (nagenoeg) parallelle randen.
//
// Dit bestand BOUWT alleen de geometrie; `toets-R18.mjs` schrijft het weg als
// R18.femp en rekent het door.
//
// Bron: Europese ontwerpgidsreeks voor eenlaagse stalen gebouwen, deel 5
// "Detailed Design of Trusses" (2010), hoofdstuk 2 t/m 4. Zie het werkdossier
// docs/superpowers/plans/2026-09-02-referentieberekeningen.md, geval R18.
//
// ── GEOMETRIE, en hoe die is vastgesteld ──────────────────────────────────
// Het dossier geeft alleen de zeven belaste punten (velden 7100 / 7200 / 8500 /
// 8600 / 7100 / 7100 mm) en de systeemhoogte 4000 mm. Het aantal en de plaats
// van de TUSSENknopen (waar diagonalen en posten op de randen aangrijpen) en
// van de secundaire staven in de middenvelden staan niet in maten in de bron.
// Die zijn afgeleid uit de modeltekening in de bron (figuur 3.1, links- en
// rechterhelft) door de verticale staven pixelsgewijs op te meten en met de
// bekende belastingpunten te ijken. Uitkomst (± 30 mm meetnauwkeurigheid):
//
//   bovenrandknopen: 0 · 3550 · 7100 · 10700 · 14300 · 16425 · 18550 · 20675
//                    22800 · 24950 · 27100 · 29250 · 31400 · 34950 · 38500
//                    42050 · 45600
//   onderrandknopen: 0 · 3550 · 7100 · 10700 · 14300 · 18550 · 22800 · 27100
//                    31400 · 34950 · 38500 · 42050 · 45600
//
// Dat is: elk hoofdveld tussen twee belaste punten is in TWEEËN gedeeld door
// een post; de twee middenvelden (8500 resp. 8600 mm) zijn op de BOVENRAND
// bovendien in vieren gedeeld door secundaire posten en diagonalen die alleen
// de bovenste helft van het veld vullen — precies zoals de bron beschrijft
// ("in the central panels, secondary diagonals and posts ... reduce the
// buckling length" van de bovenrand).
//
// Vakwerkpatroon (Warren mét posten): de diagonalen zigzaggen, met op elke
// randknoop een post. Van links naar rechts:
//   post(0) · diag T0→U3550 · post(3550) · diag U3550→T7100 · post(7100) ·
//   diag T7100→U10700 · post(10700) · diag U10700→T14300 · post(14300) ·
//   diag T14300→U18550 (gedeeld op 16425) · post(18550) ·
//   diag U18550→T22800 (gedeeld op 20675) · post(22800) · …spiegelbeeld…
//
// Een gedeelde hoofddiagonaal is ÉÉN doorgaande staaf die door de secundaire
// knoop loopt; de twee segmenten zijn daar dus momentvast aan elkaar (anders
// zou die knoop rotatievrij zijn en het stelsel singulier).
//
// Statische bepaaldheid: 65 staven + 3 reacties = 68 = 2 × 34 knopen. Het
// vakwerk is dus STATISCH BEPAALD; de staafkrachten hangen niet van de
// doorsneden af (de doorgaande randen geven daar een kleine storing op).
//
// ── DAKHELLING ────────────────────────────────────────────────────────────
// De bron: symmetrisch zadeldak, 3 % naar beide zijden, randen evenwijdig.
// De nok ligt dus op het midden en beide randen stijgen 3 % naar het midden.
// De hoogte 4000 mm is de (constante) verticale afstand tussen de randen.
// De parameter `helling` maakt varianten mogelijk (zie toets-R18.mjs):
//   +0.03 = randen stijgen naar het midden (de werkelijke daksituatie)
//    0    = horizontale randen (de idealisatie van de handberekening)
//   -0.03 = randen dalen naar het midden (alleen als gevoeligheidsproef)
// ═══════════════════════════════════════════════════════════════════════════

export const SPAN = 45600;      // mm
export const HOOGTE = 4000;     // mm, verticale systeemhoogte

/** Bovenrandknopen (x in mm). */
export const TOP_X = [
  0, 3550, 7100, 10700, 14300, 16425, 18550, 20675, 22800,
  24950, 27100, 29250, 31400, 34950, 38500, 42050, 45600,
];

/** Onderrandknopen (x in mm) — géén knoop op de secundaire punten. */
export const BOT_X = [
  0, 3550, 7100, 10700, 14300, 18550, 22800, 27100, 31400,
  34950, 38500, 42050, 45600,
];

/** De zeven belaste bovenrandknopen (x in mm), uit figuur 3.4 van de bron. */
export const LAST_X = [0, 7100, 14300, 22800, 31400, 38500, 45600];

/** UGT-combinatie 1 — zwaartekracht, ZONDER eigen gewicht (kN, omlaag). */
export const LC1_KN = [91, 136, 182, 182, 182, 136, 91];
/** UGT-combinatie 2 — windzuiging, opwaarts (kN). */
export const LC2_KN = [43.50, 65.25, 87, 87, 87, 65.25, 43.50];
/** Knooplasten van de HANDberekening, inclusief eigen gewicht (kN, omlaag). */
export const LC3_KN = [101, 158, 202, 202, 202, 158, 101];

/**
 * Doorsnedegrootheden uit de bron (E = 210000 N/mm² voor alle staven).
 *  - rand: IPE 330 met LIGGEND lijf, dus buiging in het vakwerkvlak om de
 *    ZWAKKE as: A = 6260 mm², I = Iz = 788 cm⁴.
 *  - rand_staand: dezelfde IPE 330 rechtop (I = Iy = 11770 cm⁴) — de variant
 *    die de bron in §3.5.1 doorrekent om de secundaire momenten te tonen.
 *  - drukdiagonaal 2 × L150×150×15: A = 8600 mm²; I in het vakwerkvlak
 *    = 2 × 898,1 = 1796 cm⁴ (de spleet van 10 mm telt daar niet in mee).
 *  - trekdiagonaal 2 × L120×120×12: A = 5510 mm²; I in het vlak
 *    = 2 × 368,3 = 736,6 cm⁴.
 *  - post enkel L100×100×10: A = 1920 mm², I = 176,7 cm⁴.
 */
export const EXACT = {
  rand:          { A: 6260, I: 7.88e6 },
  rand_staand:   { A: 6260, I: 1.177e8 },
  drukdiagonaal: { A: 8600, I: 1.796e7 },
  trekdiagonaal: { A: 5510, I: 7.366e6 },
  post:          { A: 1920, I: 1.767e6 },
};

/**
 * Profielnamen uit de bibliotheek van de app die het dichtst bij de
 * doorsnede-OPPERVLAKKEN van de bron liggen. De app kent geen hoekprofielen
 * en kan een geroteerd I-profiel niet uitdrukken; deze namen zijn dus
 * PLAATSVERVANGERS, uitsluitend gekozen op A (het enige wat er in een
 * statisch bepaald vakwerk toe doet: eigen gewicht en zakking).
 *   rand           IPE 330            A = 6260   (exact; maar I = Iy, staand)
 *   drukdiagonaal  SHS 150×150×16     A = 8301   (−3,5 %)
 *   trekdiagonaal  SHS 150×150×10     A = 5493   (−0,3 %)
 *   post           SHS 70×70×8        A = 1915   (−0,2 %)
 */
export const PROFIEL = {
  rand:          "IPE330",
  drukdiagonaal: "SHS150x150x16",
  trekdiagonaal: "SHS150x150x10",
  post:          "SHS70x70x8",
};

/**
 * Bouw knopen + staven voor een gegeven dakhelling.
 * Geeft ook een naamtabel terug zodat de toetsing de staven van de bron
 * (B107, B40, B130, …) kan terugvinden.
 */
export function bouwVakwerk(helling = 0.03) {
  /** Hoogteligging van de ONDERrand op x (mm). */
  const zOnder = (x) => helling * Math.min(x, SPAN - x);
  const zBoven = (x) => zOnder(x) + HOOGTE;

  const nodes = [];
  const topId = new Map();   // x → knoop-id bovenrand
  const botId = new Map();   // x → knoop-id onderrand
  let nid = 1;
  for (const x of TOP_X) { topId.set(x, nid); nodes.push({ id: nid++, x, z: zBoven(x) }); }
  for (const x of BOT_X) { botId.set(x, nid); nodes.push({ id: nid++, x, z: zOnder(x) }); }

  const beams = [];
  const soort = new Map();   // staaf-id → soort (rand/post/trekdiagonaal/…)
  const naam  = new Map();   // staaf-id → naam in de bron (B107, B40, …)
  let bid = 1;
  const HINGE = { startRy: true, endRy: true };

  const staaf = (from, to, s, bronnaam, releases) => {
    const id = bid++;
    beams.push({ id, from, to, material: "S355", profile: PROFIEL[s], ...(releases ? { releases } : {}) });
    soort.set(id, s);
    if (bronnaam) naam.set(bronnaam, id);
    return id;
  };

  // ── Randen: doorgaand, momentvast in de knopen ──────────────────────────
  // Nummering van de bron: bovenrand B100…B115 van links naar rechts,
  // onderrand B116…B122 links en B123… rechts.
  for (let i = 0; i < TOP_X.length - 1; i++) {
    staaf(topId.get(TOP_X[i]), topId.get(TOP_X[i + 1]), "rand", `B${100 + i}`);
  }
  const ONDERNAAM = ["B116", "B118", "B119", "B120", "B121", "B122",
                     "B123", "B124", "B125", "B126", "B127", "B128"];
  for (let i = 0; i < BOT_X.length - 1; i++) {
    staaf(botId.get(BOT_X[i]), botId.get(BOT_X[i + 1]), "rand", ONDERNAAM[i]);
  }

  // ── Posten op elke onderrandknoop, scharnierend aangesloten ─────────────
  const POSTNAAM = {
    0: "B156", 3550: "B23", 7100: "B24", 10700: "B25", 14300: "B26",
    18550: "B27", 22800: "B33", 27100: "B28", 31400: "B29", 34950: "B30",
    38500: "B31", 42050: "B32", 45600: "B173",
  };
  for (const x of BOT_X) {
    staaf(topId.get(x), botId.get(x), "post", POSTNAAM[x], HINGE);
  }

  // ── Hoofddiagonalen ────────────────────────────────────────────────────
  // Elke diagonaal: [x_boven, x_onder, soort, naam(en)]. Waar de diagonaal
  // door een secundaire knoop loopt staan twee namen: het bovenste en het
  // onderste segment.
  //
  // Trek/druk volgt uit de dwarskrachtrichting: links van het midden is een
  // diagonaal die naar RECHTS DAALT (bovenrand aan de steunpuntzijde) trek,
  // en een die naar rechts stijgt druk; rechts van het midden andersom.
  const diagonalen = [
    // linkerhelft
    { top: 0,     bot: 3550,  s: "trekdiagonaal", n: ["B130"] },
    { top: 7100,  bot: 3550,  s: "drukdiagonaal", n: ["B35"] },
    { top: 7100,  bot: 10700, s: "trekdiagonaal", n: ["B36"] },
    { top: 14300, bot: 10700, s: "drukdiagonaal", n: ["B37"] },
    { top: 14300, bot: 18550, s: "trekdiagonaal", n: ["B134", "B135"], split: 16425 },
    { top: 22800, bot: 18550, s: "drukdiagonaal", n: ["B137", "B136"], split: 20675 },
    // rechterhelft
    { top: 22800, bot: 27100, s: "drukdiagonaal", n: ["B138", "B139"], split: 24950 },
    { top: 31400, bot: 27100, s: "trekdiagonaal", n: ["B141", "B140"], split: 29250 },
    { top: 31400, bot: 34950, s: "drukdiagonaal", n: ["B58"] },
    { top: 38500, bot: 34950, s: "trekdiagonaal", n: ["B39"] },
    { top: 38500, bot: 42050, s: "drukdiagonaal", n: ["B40"] },
    { top: 45600, bot: 42050, s: "trekdiagonaal", n: ["B172"] },
  ];

  /** x → knoop-id van de secundaire knoop op een gedeelde diagonaal. */
  const midId = new Map();

  for (const d of diagonalen) {
    const tN = topId.get(d.top), bN = botId.get(d.bot);
    if (d.split === undefined) {
      // Ongedeeld: scharnierend aan beide einden.
      staaf(tN, bN, d.s, d.n[0], HINGE);
    } else {
      // Gedeeld door een secundaire knoop op het MIDDEN van de diagonaal.
      const zt = zBoven(d.top), zb = zOnder(d.bot);
      const xm = d.split, zm = (zt + zb) / 2;
      const mN = nid++;
      nodes.push({ id: mN, x: xm, z: zm });
      midId.set(xm, mN);
      // Twee segmenten van ÉÉN doorgaande diagonaal: scharnier alleen aan de
      // buitenste einden, momentvast aan elkaar in de secundaire knoop.
      staaf(tN, mN, d.s, d.n[0], { startRy: true });
      staaf(mN, bN, d.s, d.n[1], { endRy: true });
    }
  }

  // ── Secundaire posten en diagonalen in de vier middenpanelen ───────────
  // Per gedeelde diagonaal: een korte post van de bovenrand naar de
  // secundaire knoop, en een secundaire diagonaal van die knoop naar de
  // bovenrandknoop aan de andere kant van het paneel.
  const secundair = [
    { post: 16425, mid: 16425, diagNaarTop: 18550, nPost: "B50", nDiag: "B54" },
    { post: 20675, mid: 20675, diagNaarTop: 18550, nPost: "B51", nDiag: "B55" },
    { post: 24950, mid: 24950, diagNaarTop: 27100, nPost: "B52", nDiag: "B56" },
    { post: 29250, mid: 29250, diagNaarTop: 27100, nPost: "B53", nDiag: "B57" },
  ];
  for (const s of secundair) {
    const mN = midId.get(s.mid);
    staaf(topId.get(s.post), mN, "post", s.nPost, HINGE);
    staaf(topId.get(s.diagNaarTop), mN, "post", s.nDiag, HINGE);
  }

  const supports = [
    { nodeId: botId.get(0), type: "pinned" },     // scharnier
    { nodeId: botId.get(SPAN), type: "zRoller" }, // rol: verticaal vast, horizontaal vrij
  ];

  return { nodes, beams, supports, soort, naam, topId, botId, midId, zOnder, zBoven };
}

/** Belastinggevallen en knooplasten voor een gebouwd vakwerk. */
export function bouwLasten(vw) {
  const loadCases = [
    { id: 1, name: "UGT-combinatie 1 — zwaartekracht", type: "dead" },
    { id: 2, name: "UGT-combinatie 2 — windzuiging (opwaarts)", type: "wind" },
    { id: 3, name: "Handberekening incl. eigen gewicht", type: "other" },
  ];
  const loads = [];
  let lid = 1;
  LAST_X.forEach((x, i) => {
    const n = vw.topId.get(x);
    loads.push({ id: lid++, type: "pointForce", caseId: 1, nodeId: n, fz: -LC1_KN[i] });
    loads.push({ id: lid++, type: "pointForce", caseId: 2, nodeId: n, fz: +LC2_KN[i] });
    loads.push({ id: lid++, type: "pointForce", caseId: 3, nodeId: n, fz: -LC3_KN[i] });
  });
  return { loadCases, loads };
}
