/**
 * scheefstandNorm — de initiële scheefstand φ volgens de norm, in plaats van
 * één vast getal uit de interface.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HET PROBLEEM DAT DEZE MODULE OPLOST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * De app zette tot nu toe H = φ·V op elke verticale lastcomponent met een
 * φ = 1/noemer die de gebruiker intikt, standaard 1/200. Dat getal is de
 * BASISWAARDE van de norm en niet de scheefstand zelf: alle drie de
 * betrokken Eurocodes vermenigvuldigen die basiswaarde met factoren die met
 * de hoogte van de constructie en met het aantal dragende verticale elementen
 * meelopen, en die maken de scheefstand kleiner. Rekenen met de kale
 * basiswaarde is dus veilig maar niet de norm.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WELKE NORM GELDT IN EEN GEMENGD MODEL — DE KNOOP, EN HOE HIJ IS DOORGEHAKT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * De drie normen geven verschillende getallen voor dezelfde constructie (zie
 * de tabel verderop). In een model met zowel stalen als houten staven is aan
 * de staaf niet af te lezen welke van de drie geldt — en dat is ook logisch,
 * want de scheefstand is geen eigenschap van een STAAF maar van de hele
 * CONSTRUCTIE: hij beschrijft hoe scheef het geheel gebouwd staat. Eén
 * bouwwerk heeft één scheefstand.
 *
 * Daarom is dit een PROJECTINSTELLING met een expliciete keuze
 * (`ScheefstandBron`), geen afleiding per staaf. De app draagt aan welke
 * normen op het model van toepassing zijn (`toepasselijkeScheefstandNormen`,
 * uit de materialen van de staven), toont van de gekozen norm alle
 * tussenwaarden, en kent daarnaast de stand `"ongunstigste"`: die rekent alle
 * toepasselijke normen door en neemt de grootste φ. Dat is de stand voor wie
 * niet wil kiezen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BESTAANDE PROJECTEN VERANDEREN NIET STIL — DE HARDE EIS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * De beginstand is `"vast"`: precies het oude gedrag, φ = 1/noemer uit de
 * interface. Een projectbestand zonder `scheefstandBron` (élk bestand van vóór
 * deze module) leest als `"vast"` en rekent dus tot op de laatste decimaal
 * hetzelfde als voordien. De normberekening is een KEUZE die de gebruiker
 * aanzet.
 *
 * De reden dat dit geen "verbetering" is die je stilzwijgend uitrolt: α_h en
 * α_m zijn allebei ≤ 1, dus de norm maakt de scheefstand ALTIJD kleiner dan
 * de basiswaarde — tot 2/3 · 0,707 ≈ 47 % ervan. Een bestand dat na een
 * update ineens met de helft van zijn scheefstand rekent, geeft kleinere
 * momenten in de kolomvoeten en een gunstiger toets, zonder dat iemand daar
 * om heeft gevraagd. Een scheefstand die te groot is kost staal; een die
 * stilzwijgend kleiner is geworden kost het bouwwerk.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DE DRIE NORMEN, ZOALS GELEZEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NEN-EN 1993-1-1 §5.3.2(3)a, formule (5.5) — staal
 *     φ = φ₀ · α_h · α_m
 *     φ₀ = 1/200                      (basiswaarde)
 *     α_h = 2/√h,  met 2/3 ≤ α_h ≤ 1,0
 *     h  = de hoogte van de constructie, in meter
 *     α_m = √(0,5·(1 + 1/m))
 *     m  = het aantal kolommen in een rij, met inbegrip van alleen die
 *          kolommen die een verticale kracht N_Ed dragen die niet kleiner is
 *          dan 50 % van de gemiddelde waarde van alle verticale krachten op
 *          de kolommen in het beschouwde verticale vlak.
 *
 * NEN-EN 1992-1-1 §5.2(5), formule (5.1) — beton
 *     θ_i = θ₀ · α_h · α_m
 *     θ₀ = 1/300                      volgens de Nederlandse nationale
 *                                     bijlage; de aanbevolen EN-waarde 1/200
 *                                     is daarin doorgehaald en vervangen door
 *                                     de zin "De waarde van θ₀ moet gelijk
 *                                     aan 1/300 zijn genomen."
 *     α_h = 2/√l,  met 2/3 ≤ α_h ≤ 1
 *     α_m = √(0,5·(1 + 1/m))
 *     l en m volgen uit §5.2(6). Voor het geval dat hier speelt — het effect
 *     op de SCHORENDE CONSTRUCTIE, oftewel het raamwerk als geheel — geldt:
 *     l = de hoogte van het gebouw, m = het aantal verticale elementen dat
 *     bijdraagt aan de horizontale kracht op de schorende constructie.
 *
 * NEN-EN 1995-1-1 §5.4.4(2), formule (5.1) — hout
 *     φ = 0,005                voor h ≤ 5 m
 *     φ = 0,005 · √(5/h)       voor h > 5 m
 *     h = de hoogte van de constructie of de lengte van het element, in m.
 *     Er is GEEN α_m: het aantal elementen komt in deze norm niet voor, en de
 *     hoogtereductie kent ook geen ondergrens 2/3. De norm zegt "behoort
 *     minimaal gelijk te zijn aan", dus dit is een ondergrens en niet een
 *     voorgeschreven waarde.
 *
 * WAT DAT VOOR EEN GETAL SCHEELT (h = 9 m, m = 2):
 *     EN 1993:  1/200 · 0,667 · 0,866 = 1/346
 *     EN 1992:  1/300 · 0,667 · 0,866 = 1/519
 *     EN 1995:  0,005 · √(5/9)        = 1/268
 * Bij hout is de reductie het kleinst (geen α_m, geen ondergrens op de
 * hoogtefactor); bij beton het grootst (θ₀ = 1/300). Vandaar dat
 * `"ongunstigste"` het maximum neemt en niet zomaar één norm aanwijst.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAT DEZE MODULE NIET DOET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  - De vervangende horizontale kracht zelf. Dat blijft het werk van de motor
 *    (`solver/engine.ts`): die krijgt φ als getal binnen en zet H = φ·V op
 *    elke verticale lastcomponent. Deze module bepaalt alleen wélk getal.
 *  - Het 50 %-criterium van EN 1993-1-1 5.3.2(3)a op m. Zie de uitleg bij
 *    `leidScheefstandGeometrieAf`; het staat als waarschuwing in de afleiding.
 *  - De lokale vooruitbuigingen e₀ (EN 1993-1-1 (5.6)/tabel 5.1, EN 1995-1-1
 *    (5.2)). Dat is een imperfectie per STAAF en geen scheefstand van de
 *    constructie; die hoort bij de knik- en kiptoets van het element.
 *  - EN 1993-1-1 (5.7): de vrijstelling H_Ed ≥ 0,15·V_Ed, waarbij de
 *    scheefstand mag worden verwaarloosd. Dat vraagt de doorgerekende
 *    combinatie en is dus geen invoerbeslissing.
 *  - Onderscheid tussen de grenstoestanden. EN 1992-1-1 §5.2(2)P en (3)
 *    plaatsen de imperfectie in de UITERSTE grenstoestand en zeggen expliciet
 *    dat zij in de bruikbaarheidsgrenstoestand niet in beschouwing hoeft te
 *    worden genomen. De app zet de vervangende horizontale kracht op élke
 *    combinatie, ook de BGT-combinaties; dat is de veilige kant (grotere
 *    zijdelingse uitwijking), maar het is strenger dan de norm eist.
 *  - De koppeling met het analysetype. EN 1993-1-1 §5.3.2(3) richt zich op
 *    raamwerken die gevoelig zijn voor knik in een ongesteunde ('sway')
 *    knikvorm, en EN 1995-1-1 §5.4.4(2) noemt zijn φ in één adem met een
 *    lineair-elastische berekening van de TWEEDE orde. De app dwingt dat
 *    verband niet af: de scheefstand werkt ook in een eerste-orde-berekening.
 *    Ook dat is de veilige kant — de imperfectie voegt belasting toe — maar de
 *    tweede-orde-uitvergroting die de norm erbij veronderstelt, ontbreekt dan.
 *
 * Puur: geen React, geen DOM, geen Tauri — zodat de tests hem los kunnen
 * draaien.
 */
import type { Beam } from "../components/fem/femTypes";
import { normenInModel, type NormSleutel } from "./normenInRapport";

// ── Keuze en opslag ─────────────────────────────────────────────────────────

/**
 * Waar φ vandaan komt. `"vast"` is de beginstand én de stand van elk bestand
 * dat het veld niet kent — zie de kop van dit bestand.
 */
export type ScheefstandBron =
  | "vast"
  | "en1993"
  | "en1992"
  | "en1995"
  | "ongunstigste";

/**
 * Alle geldige bronnen, in de volgorde waarin ze op het scherm staan. Bestaat
 * apart van het type omdat het INLEZEN van een projectbestand moet kunnen
 * toetsen of een string een geldige bron is; een onbekende waarde valt dan
 * terug op `"vast"` in plaats van door te lekken.
 */
export const SCHEEFSTAND_BRONNEN = [
  "vast",
  "en1993",
  "en1992",
  "en1995",
  "ongunstigste",
] as const;

/** De normsleutels die als bron kunnen dienen (dus zonder `"vast"`). */
export const SCHEEFSTAND_NORMEN = ["en1993", "en1992", "en1995"] as const;

export type ScheefstandNorm = (typeof SCHEEFSTAND_NORMEN)[number];

export const SCHEEFSTAND_BRON_LABEL: Record<ScheefstandBron, string> = {
  vast: "vaste noemer",
  en1993: "EN 1993-1-1 (5.5)",
  en1992: "EN 1992-1-1 (5.1)",
  en1995: "EN 1995-1-1 (5.1)",
  ongunstigste: "ongunstigste van toepassing",
};

/**
 * De scheefstandinstelling zoals ze in het projectbestand staat. Alle velden
 * behalve `noemer` mogen ontbreken; dan geldt de oude stand.
 */
export interface ScheefstandKeuze {
  /** Waar φ vandaan komt; ontbreekt → `"vast"`. */
  bron?: ScheefstandBron;
  /** Noemer x in φ = 1/x — de stand `"vast"`, en de terugval bij twijfel. */
  noemer: number;
  /**
   * Handmatige hoogte h in m. `null`/ontbrekend = de uit het model afgeleide
   * waarde. De norm laat h aan de constructeur; de app leidt hem af als HULP.
   */
  hoogteM?: number | null;
  /**
   * Handmatig aantal dragende verticale elementen m. `null`/ontbrekend = de
   * afgeleide waarde. Verlagen mag altijd: kleinere m → grotere α_m → grotere
   * φ, dus de veilige kant.
   */
  aantalElementen?: number | null;
}

// ── De afleiding uit het model ──────────────────────────────────────────────

/**
 * Vanaf welke hoek met de horizontaal een staaf als VERTICAAL dragend element
 * telt. Bewust dezelfde 75° als `bepaalStandaardRol` in femTypes: "verticaal"
 * hoort in de hele app één ding te betekenen, anders is een staaf in het ene
 * scherm een kolom en in het andere niet.
 */
export const VERTICAAL_VANAF_GRADEN = 75;

/** Eén kolomlijn: alle op elkaar staande verticale staven samen. */
export interface Kolomlijn {
  /** De staaf-ids waaruit deze lijn bestaat, oplopend. */
  staafIds: number[];
  /** Laagste en hoogste knoop van de lijn, in mm. */
  voetZmm: number;
  topZmm: number;
  /** x van de voet, in mm — waar de lijn in het model staat. */
  voetXmm: number;
}

export interface ScheefstandGeometrie {
  /** h (of l) in meter: van de voet tot de bovenkant van de constructie. */
  hoogteM: number;
  /** m: het aantal kolomlijnen. */
  aantalElementen: number;
  kolomlijnen: Kolomlijn[];
  /**
   * `false` wanneer het model geen verticale staaf of geen hoogte heeft; dan
   * zijn h en m een terugval en geen afleiding, en dat hoort op het scherm.
   */
  afleidbaar: boolean;
  /** De afleiding in gewone zinnen, bedoeld om te tonen. */
  afleiding: string[];
}

/** Nederlandse getalweergave: komma als decimaalteken. */
function getal(x: number, decimalen: number): string {
  return x.toFixed(decimalen).replace(".", ",");
}

/**
 * h en m uit het model afleiden.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WAT DE NORM MET "HOOGTE" BEDOELT — VAN DE VOET TOT WAAR?
 * ─────────────────────────────────────────────────────────────────────────
 * EN 1993-1-1 figuur 5.2 tekent h van het OPLEGNIVEAU tot de bovenkant van
 * het raamwerk, voor zowel een verdiepingsraamwerk als een portaal met
 * schoren. EN 1992-1-1 §5.2(6) noemt het voor de schorende constructie "de
 * hoogte van het gebouw". Het is dus de hoogte van het geheel en niet de
 * lengte van een kolom of een verdiepingshoogte.
 *
 * Daarom: h = de hoogste knoop van het model min het niveau van de VOET, en
 * de voet is de laagste OPLEGGING. Zonder opleggingen (een model in aanbouw)
 * valt de voet terug op de laagste knoop, want dan is er geen ander begin.
 * Een uitkragende console onder het opleggingsniveau telt zo niet mee in h,
 * en dat klopt: die hangt aan de constructie, hij draagt hem niet.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WAT DE NORM MET "AANTAL VERTICALE ELEMENTEN" BEDOELT
 * ─────────────────────────────────────────────────────────────────────────
 * EN 1993-1-1 zegt "het aantal kolommen in een rij"; EN 1992-1-1 zegt "het
 * aantal verticale elementen dat bijdraagt aan het totale effect". Het gaat
 * dus om KOLOMMEN, niet om staven — en dat verschil is precies waar een
 * portaal en een rij kolommen uiteenlopen:
 *
 *   - Een kolom die door meerdere verdiepingen loopt is in het model een
 *     reeks staven boven elkaar, maar hij is één kolom. Een tweelaags portaal
 *     heeft dus m = 2 en niet m = 4.
 *   - Twee poten van één portaal staan NIET boven elkaar; ze zijn twee
 *     kolommen, en m = 2.
 *
 * De afleiding maakt daarom samenhangende ketens van verticale staven: staven
 * die een knoop delen horen bij dezelfde kolomlijn. Dat heeft geen tolerantie
 * nodig, verdraagt tussenknopen en deelstaven, en houdt een schuine schoor
 * (< 75° met de horizontaal) er vanzelf buiten.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WAT DE AFLEIDING NIET KAN, EN WAAROM DAT ERBIJ STAAT
 * ─────────────────────────────────────────────────────────────────────────
 * EN 1993-1-1 5.3.2(3)a telt alleen kolommen mee die minstens 50 % van de
 * GEMIDDELDE verticale kolomkracht dragen. Die krachten volgen uit de
 * berekening, en de berekening heeft φ nodig — de kip-en-ei die maakt dat dit
 * niet vooraf te bepalen is. De afleiding telt daarom álle kolomlijnen.
 *
 * Dat is de ONVEILIGE kant, en daarom staat het als waarschuwing in de
 * afleiding: α_m = √(0,5(1+1/m)) daalt met m, dus een kolomlijn die volgens
 * het criterium had moeten afvallen maakt m te groot en φ te klein. Een licht
 * belaste stijl (een gevelstijl die alleen zichzelf draagt) hoort met de hand
 * uit m gehaald te worden.
 *
 * Wandschijven (platen) tellen bewust NIET mee in m. Een schijf is meestal
 * het schorende deel en niet het geschoorde, en meetellen zou m verhogen en
 * φ dus verlagen — de verkeerde kant om bij twijfel. Draagt een wand in dit
 * model wél verticaal mee, dan hoort m met de hand omhoog.
 */
export function leidScheefstandGeometrieAf(model: {
  nodes: { id: number; x: number; z: number }[];
  beams: { id: number; from: number; to: number }[];
  supports: { nodeId: number }[];
}): ScheefstandGeometrie {
  const afleiding: string[] = [];
  const knoopById = new Map(model.nodes.map((n) => [n.id, n]));

  // ── h ────────────────────────────────────────────────────────────────────
  const alleZ = model.nodes.map((n) => n.z);
  const topZ = alleZ.length > 0 ? Math.max(...alleZ) : 0;
  const opleggingZ = model.supports
    .map((s) => knoopById.get(s.nodeId)?.z)
    .filter((z): z is number => typeof z === "number");
  const heeftOpleggingen = opleggingZ.length > 0;
  const voetZ = heeftOpleggingen
    ? Math.min(...opleggingZ)
    : alleZ.length > 0
      ? Math.min(...alleZ)
      : 0;
  const hoogteM = Math.max(0, (topZ - voetZ) / 1000);

  afleiding.push(
    `h = ${getal(hoogteM, 3)} m — van de voet (${
      heeftOpleggingen
        ? `laagste oplegging, z = ${getal(voetZ, 0)} mm`
        : `geen opleggingen in het model, dus de laagste knoop, z = ${getal(voetZ, 0)} mm`
    }) tot de bovenkant van de constructie (z = ${getal(topZ, 0)} mm). ` +
      "EN 1993-1-1 figuur 5.2 meet h vanaf het opleggingsniveau; " +
      "EN 1992-1-1 §5.2(6) noemt het voor de schorende constructie de hoogte " +
      "van het gebouw.",
  );

  // ── m ────────────────────────────────────────────────────────────────────
  const minSinus = Math.sin((VERTICAAL_VANAF_GRADEN * Math.PI) / 180);
  const verticaal: { id: number; from: number; to: number }[] = [];
  for (const b of model.beams) {
    const a = knoopById.get(b.from);
    const c = knoopById.get(b.to);
    if (!a || !c) continue;
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-9) continue;
    if (Math.abs(dz) / L >= minSinus) verticaal.push({ id: b.id, from: b.from, to: b.to });
  }

  // Samenhangende ketens van verticale staven = kolomlijnen. Union-find over
  // de knopen: twee verticale staven die een knoop delen staan op elkaar en
  // vormen één kolom, hoe vaak de kolom ook is opgeknipt.
  const ouder = new Map<number, number>();
  const wortel = (x: number): number => {
    let r = x;
    while (ouder.get(r) !== r) r = ouder.get(r)!;
    // Padcompressie, zodat een lange kolom niet in een lange keten ontaardt.
    let k = x;
    while (ouder.get(k) !== r) {
      const volgende = ouder.get(k)!;
      ouder.set(k, r);
      k = volgende;
    }
    return r;
  };
  for (const b of verticaal) {
    for (const n of [b.from, b.to]) if (!ouder.has(n)) ouder.set(n, n);
  }
  for (const b of verticaal) {
    const ra = wortel(b.from);
    const rb = wortel(b.to);
    if (ra !== rb) ouder.set(ra, rb);
  }

  const perWortel = new Map<number, number[]>();
  for (const b of verticaal) {
    const r = wortel(b.from);
    const lijst = perWortel.get(r);
    if (lijst) lijst.push(b.id);
    else perWortel.set(r, [b.id]);
  }

  const kolomlijnen: Kolomlijn[] = [];
  for (const staafIds of perWortel.values()) {
    const knopen = new Set<number>();
    for (const id of staafIds) {
      const b = verticaal.find((v) => v.id === id)!;
      knopen.add(b.from);
      knopen.add(b.to);
    }
    const pts = [...knopen]
      .map((n) => knoopById.get(n))
      .filter((n): n is { id: number; x: number; z: number } => !!n);
    if (pts.length === 0) continue;
    const voet = pts.reduce((laagste, p) => (p.z < laagste.z ? p : laagste), pts[0]);
    kolomlijnen.push({
      staafIds: [...staafIds].sort((a, b) => a - b),
      voetZmm: voet.z,
      topZmm: Math.max(...pts.map((p) => p.z)),
      voetXmm: voet.x,
    });
  }
  // Van links naar rechts, zodat de opsomming leest zoals het model eruitziet.
  kolomlijnen.sort((a, b) => a.voetXmm - b.voetXmm || a.voetZmm - b.voetZmm);

  const aantalElementen = Math.max(1, kolomlijnen.length);

  if (kolomlijnen.length === 0) {
    afleiding.push(
      "m = 1 (terugval) — dit model bevat geen enkele staaf die steiler staat " +
        `dan ${VERTICAAL_VANAF_GRADEN}° met de horizontaal, dus er is geen kolomlijn te tellen. ` +
        "m = 1 geeft α_m = 1,00: de grootste waarde die de formule kan " +
        "aannemen, en dus de veilige terugval.",
    );
  } else {
    afleiding.push(
      `m = ${aantalElementen} — ${aantalElementen} kolomlijn${aantalElementen === 1 ? "" : "en"}: ` +
        kolomlijnen
          .map(
            (k, i) =>
              `(${i + 1}) x = ${getal(k.voetXmm, 0)} mm, staaf ${k.staafIds.join("+")}`,
          )
          .join("; ") +
        `. Een staaf telt als verticaal vanaf ${VERTICAAL_VANAF_GRADEN}° met de horizontaal; ` +
        "staven die een knoop delen vormen samen één kolom, zodat een kolom " +
        "door meerdere verdiepingen éénmaal telt.",
    );
  }

  afleiding.push(
    "LET OP bij m: EN 1993-1-1 5.3.2(3)a telt alleen kolommen mee die " +
      "minstens 50 % van de gemiddelde verticale kolomkracht dragen. Die " +
      "krachten volgen uit de berekening en de berekening heeft φ nodig, dus " +
      "dat criterium is hier niet toegepast — álle kolomlijnen tellen mee. " +
      "Een licht belaste stijl hoort er met de hand uit: kleinere m geeft " +
      "grotere α_m en dus grotere φ, de veilige kant.",
  );
  afleiding.push(
    "Wandschijven tellen niet mee in m: een schijf schoort meestal in plaats " +
      "van geschoord te worden, en meetellen zou m verhogen en φ verlagen. " +
      "Draagt een wand hier wél verticaal mee, verhoog m dan met de hand.",
  );

  return {
    hoogteM,
    aantalElementen,
    kolomlijnen,
    afleidbaar: kolomlijnen.length > 0 && hoogteM > 0,
    afleiding,
  };
}

// ── De formules ─────────────────────────────────────────────────────────────

/** Eén tussenwaarde van (5.5)/(5.1), voor op het scherm en in het rapport. */
export interface ScheefstandRegel {
  /** Bijvoorbeeld `"α_h"`. */
  symbool: string;
  /** Als tekst, met een komma als decimaalteken. */
  waarde: string;
  /** Het normartikel waar deze waarde vandaan komt. */
  artikel: string;
  /** Waarom die waarde dit is. */
  uitleg: string;
}

/** α_h volgens EN 1993-1-1 (5.5) en EN 1992-1-1 (5.1): 2/√h, 2/3 ≤ α_h ≤ 1. */
export function alphaH(hoogteM: number): { waarde: number; begrensd: "onder" | "boven" | null } {
  // h = 0 zou 2/√0 = ∞ geven; de bovengrens 1,0 vangt dat af en is inhoudelijk
  // juist — zonder hoogte is er geen hoogtereductie.
  const ruw = hoogteM > 0 ? 2 / Math.sqrt(hoogteM) : Number.POSITIVE_INFINITY;
  if (ruw > 1) return { waarde: 1, begrensd: "boven" };
  if (ruw < 2 / 3) return { waarde: 2 / 3, begrensd: "onder" };
  return { waarde: ruw, begrensd: null };
}

/** α_m volgens EN 1993-1-1 (5.5) en EN 1992-1-1 (5.1): √(0,5·(1 + 1/m)). */
export function alphaM(aantalElementen: number): number {
  const m = Math.max(1, Math.floor(aantalElementen));
  return Math.sqrt(0.5 * (1 + 1 / m));
}

/** De basiswaarde φ₀ (θ₀) per norm, met het artikel waar hij vandaan komt. */
const BASISWAARDE: Record<ScheefstandNorm, { waarde: number; noemer: number; artikel: string; uitleg: string }> = {
  en1993: {
    waarde: 1 / 200,
    noemer: 200,
    artikel: "EN 1993-1-1 §5.3.2(3)a",
    uitleg: "φ₀ is de basiswaarde: φ₀ = 1/200.",
  },
  en1992: {
    waarde: 1 / 300,
    noemer: 300,
    artikel: "EN 1992-1-1 §5.2(5) + NB",
    uitleg:
      "θ₀ is de basiswaarde. De Nederlandse nationale bijlage haalt de " +
      "aanbevolen EN-waarde 1/200 door en schrijft 1/300 voor.",
  },
  en1995: {
    waarde: 0.005,
    noemer: 200,
    artikel: "EN 1995-1-1 §5.4.4(2)",
    uitleg: "φ = 0,005 rad voor h ≤ 5 m; deze norm kent geen losse basiswaarde.",
  },
};

export interface NormUitkomst {
  norm: ScheefstandNorm;
  phi: number;
  regels: ScheefstandRegel[];
}

/**
 * φ volgens één norm, met alle tussenwaarden erbij.
 *
 * `hoogteM` in meter en `aantalElementen` als geheel getal ≥ 1; de functie
 * begrenst zelf, zodat een lege of ontaarde invoer geen NaN oplevert.
 */
export function phiVolgensNorm(
  norm: ScheefstandNorm,
  hoogteM: number,
  aantalElementen: number,
): NormUitkomst {
  const h = Number.isFinite(hoogteM) && hoogteM > 0 ? hoogteM : 0;
  const m = Math.max(1, Math.floor(Number.isFinite(aantalElementen) ? aantalElementen : 1));
  const basis = BASISWAARDE[norm];
  const regels: ScheefstandRegel[] = [];

  if (norm === "en1995") {
    // EN 1995-1-1 (5.1): geen α_m, geen ondergrens op de hoogtereductie. De
    // norm zegt "behoort minimaal gelijk te zijn aan" — een ondergrens dus.
    const phi = h > 5 ? 0.005 * Math.sqrt(5 / h) : 0.005;
    regels.push({
      symbool: "h",
      waarde: `${getal(h, 3)} m`,
      artikel: "EN 1995-1-1 §5.4.4(2)",
      uitleg: "de hoogte van de constructie of de lengte van het element, in m.",
    });
    regels.push({
      symbool: "φ",
      waarde: `${getal(phi, 5)} rad = 1/${getal(1 / phi, 0)}`,
      artikel: "EN 1995-1-1 (5.1)",
      uitleg:
        h > 5
          ? `h > 5 m, dus φ = 0,005·√(5/h) = 0,005·√(5/${getal(h, 3)}).`
          : "h ≤ 5 m, dus φ = 0,005 rad. Deze norm kent geen α_m en geen " +
            "ondergrens op de hoogtereductie.",
    });
    return { norm, phi, regels };
  }

  const ah = alphaH(h);
  const am = alphaM(m);
  const phi = basis.waarde * ah.waarde * am;
  const symbool = norm === "en1992" ? "θ" : "φ";
  const artikelFormule = norm === "en1992" ? "EN 1992-1-1 (5.1)" : "EN 1993-1-1 (5.5)";

  regels.push({
    symbool: `${symbool}₀`,
    waarde: `1/${basis.noemer} = ${getal(basis.waarde, 5)}`,
    artikel: basis.artikel,
    uitleg: basis.uitleg,
  });
  regels.push({
    symbool: "h",
    waarde: `${getal(h, 3)} m`,
    artikel: artikelFormule,
    uitleg:
      norm === "en1992"
        ? "l is de hoogte van het gebouw; §5.2(6), geval 'effect op de schorende constructie'."
        : "h is de hoogte van de constructie, in meter (figuur 5.2).",
  });
  regels.push({
    symbool: "α_h",
    waarde: getal(ah.waarde, 4),
    artikel: artikelFormule,
    uitleg:
      `α_h = 2/√h = 2/√${getal(h, 3)}` +
      (ah.begrensd === "boven"
        ? " en wordt begrensd door de bovengrens 1,0."
        : ah.begrensd === "onder"
          ? " en wordt begrensd door de ondergrens 2/3."
          : ", binnen 2/3 ≤ α_h ≤ 1,0."),
  });
  regels.push({
    symbool: "m",
    waarde: String(m),
    artikel: artikelFormule,
    uitleg:
      norm === "en1992"
        ? "m is het aantal verticale elementen dat bijdraagt aan de horizontale kracht op de schorende constructie."
        : "m is het aantal kolommen in een rij (alleen die met N_Ed ≥ 50 % van het gemiddelde).",
  });
  regels.push({
    symbool: "α_m",
    waarde: getal(am, 4),
    artikel: artikelFormule,
    uitleg: `α_m = √(0,5·(1 + 1/m)) = √(0,5·(1 + 1/${m})).`,
  });
  regels.push({
    symbool: norm === "en1992" ? "θ_i" : "φ",
    waarde: `${getal(phi, 5)} rad = 1/${getal(1 / phi, 0)}`,
    artikel: artikelFormule,
    uitleg:
      `${symbool}₀ · α_h · α_m = ${getal(basis.waarde, 5)} · ${getal(ah.waarde, 4)} · ${getal(am, 4)}.`,
  });

  return { norm, phi, regels };
}

// ── Welke normen gelden hier ────────────────────────────────────────────────

/**
 * De normen die op dit model van toepassing zijn, uit de materialen van de
 * staven. Dezelfde regels als de normregel van het rapport
 * (`normenInRapport.normenInModel`), zodat het scherm en het rapport niet
 * ieder een eigen antwoord geven op dezelfde vraag.
 *
 * Een staaf met een vrij materiaal of een onbekende doorsnede brengt geen norm
 * mee: daar geeft de gebruiker zelf de getallen en is er geen norm om aan te
 * refereren.
 */
export function toepasselijkeScheefstandNormen(beams: Beam[]): ScheefstandNorm[] {
  const vlaggen = normenInModel(beams);
  return SCHEEFSTAND_NORMEN.filter((n) => vlaggen[n as NormSleutel]);
}

// ── Het antwoord ────────────────────────────────────────────────────────────

export interface ScheefstandUitkomst {
  /** De scheefstand die de motor in gaat. */
  phi: number;
  /** 1/φ, afgerond — alleen om te tonen. */
  noemer: number;
  /** De stand waarmee dit is gerekend (kan afwijken van de keuze, zie `waarschuwingen`). */
  bron: ScheefstandBron;
  /** De norm die het getal heeft geleverd; `null` bij de vaste noemer. */
  norm: ScheefstandNorm | null;
  /** De gebruikte h en m — na een eventuele handmatige overschrijving. */
  hoogteM: number;
  aantalElementen: number;
  /** Of h en m van de gebruiker komen in plaats van uit het model. */
  hoogteHandmatig: boolean;
  aantalHandmatig: boolean;
  /** Alle tussenwaarden van de gekozen norm. */
  regels: ScheefstandRegel[];
  /** Bij `"ongunstigste"`: wat elke toepasselijke norm gaf. */
  vergelijking: NormUitkomst[];
  /** Wat de gebruiker hierover hoort te weten. Leeg = niets aan de hand. */
  waarschuwingen: string[];
}

/**
 * De scheefstand die deze berekening in gaat.
 *
 * `keuze.bron` ontbreekt of is `"vast"` → φ = 1/noemer, precies als voorheen.
 * Dat is met opzet de eerste tak: een bestand dat de nieuwe velden niet kent
 * mag geen enkele andere weg door deze functie nemen.
 */
export function bepaalScheefstand(
  keuze: ScheefstandKeuze,
  geometrie: ScheefstandGeometrie,
  toepasselijk: ScheefstandNorm[],
): ScheefstandUitkomst {
  const noemer = Number.isFinite(keuze.noemer) && keuze.noemer > 0 ? keuze.noemer : 200;
  const bron = keuze.bron ?? "vast";
  const waarschuwingen: string[] = [];

  const vast = (extraWaarschuwing?: string): ScheefstandUitkomst => {
    if (extraWaarschuwing) waarschuwingen.push(extraWaarschuwing);
    return {
      phi: 1 / noemer,
      noemer,
      bron: "vast",
      norm: null,
      hoogteM: geometrie.hoogteM,
      aantalElementen: geometrie.aantalElementen,
      hoogteHandmatig: false,
      aantalHandmatig: false,
      regels: [
        {
          symbool: "φ",
          waarde: `1/${getal(noemer, 0)} = ${getal(1 / noemer, 5)}`,
          artikel: "opgegeven waarde",
          uitleg:
            "Vaste noemer uit de projectinstellingen; de reductiefactoren α_h " +
            "en α_m van de norm zijn NIET toegepast. Dit is de basiswaarde en " +
            "daarmee de veilige bovengrens.",
        },
      ],
      vergelijking: [],
      waarschuwingen,
    };
  };

  if (bron === "vast") return vast();

  // h en m: de afleiding, tenzij de gebruiker ze heeft overschreven.
  const hoogteHandmatig =
    typeof keuze.hoogteM === "number" && Number.isFinite(keuze.hoogteM) && keuze.hoogteM > 0;
  const aantalHandmatig =
    typeof keuze.aantalElementen === "number" &&
    Number.isFinite(keuze.aantalElementen) &&
    keuze.aantalElementen >= 1;
  const hoogteM = hoogteHandmatig ? (keuze.hoogteM as number) : geometrie.hoogteM;
  const aantalElementen = aantalHandmatig
    ? Math.floor(keuze.aantalElementen as number)
    : geometrie.aantalElementen;

  if (!geometrie.afleidbaar && !(hoogteHandmatig && aantalHandmatig)) {
    waarschuwingen.push(
      "h en/of m zijn niet uit het model af te leiden (geen verticale staaf, " +
        "of geen hoogte). Controleer ze en geef ze zo nodig zelf op.",
    );
  }
  if (hoogteM <= 0) {
    waarschuwingen.push(
      "De constructie heeft geen hoogte, dus α_h valt op zijn bovengrens 1,0. " +
        "Een scheefstand op een vlak model is een keuze van de gebruiker en " +
        "geen normvoorschrift.",
    );
  }

  // Welke normen doen mee. Bij een expliciete normkeuze telt die keuze, ook
  // als het materiaal er (nog) niet in zit — de gebruiker kan vooruitlopen op
  // wat er nog getekend wordt. Alleen `"ongunstigste"` leunt op het model.
  let normen: ScheefstandNorm[];
  if (bron === "ongunstigste") {
    if (toepasselijk.length === 0) {
      return vast(
        "Geen van de drie normen is op dit model van toepassing (alle staven " +
          "hebben een vrij of onbekend materiaal). De vaste noemer blijft " +
          `gelden: φ = 1/${getal(noemer, 0)}.`,
      );
    }
    normen = toepasselijk;
  } else {
    normen = [bron];
    if (toepasselijk.length > 0 && !toepasselijk.includes(bron)) {
      waarschuwingen.push(
        `${SCHEEFSTAND_BRON_LABEL[bron]} is gekozen, maar dit model bevat geen ` +
          `materiaal dat onder die norm valt (wel: ${toepasselijk
            .map((n) => SCHEEFSTAND_BRON_LABEL[n])
            .join(", ")}).`,
      );
    }
  }

  const vergelijking = normen.map((n) => phiVolgensNorm(n, hoogteM, aantalElementen));
  // De ongunstigste = de GROOTSTE φ: een grotere scheefstand geeft grotere
  // vervangende horizontale krachten en dus de zwaardere belasting.
  const gekozen = vergelijking.reduce((a, b) => (b.phi > a.phi ? b : a));

  if (bron === "ongunstigste" && vergelijking.length > 1) {
    waarschuwingen.push(
      "Ongunstigste van " +
        vergelijking
          .map((v) => `${SCHEEFSTAND_BRON_LABEL[v.norm]} → 1/${getal(1 / v.phi, 0)}`)
          .join(", ") +
        `. Gekozen: ${SCHEEFSTAND_BRON_LABEL[gekozen.norm]}.`,
    );
  }

  return {
    phi: gekozen.phi,
    noemer: 1 / gekozen.phi,
    bron,
    norm: gekozen.norm,
    hoogteM,
    aantalElementen,
    hoogteHandmatig,
    aantalHandmatig,
    regels: gekozen.regels,
    vergelijking,
    waarschuwingen,
  };
}

/**
 * De hele afleiding als tekstblok — voor de tooltip in de balk en, later, voor
 * het rekenrapport. Eén bron voor "wat staat er op het scherm", zodat het
 * scherm en het rapport niet uit elkaar kunnen lopen.
 */
export function scheefstandToelichting(
  uitkomst: ScheefstandUitkomst,
  geometrie: ScheefstandGeometrie,
): string {
  const regels: string[] = [];
  regels.push(
    uitkomst.norm === null
      ? "Scheefstand: vaste noemer uit de projectinstellingen."
      : `Scheefstand volgens ${SCHEEFSTAND_BRON_LABEL[uitkomst.norm]}.`,
  );
  regels.push("");
  for (const r of uitkomst.regels) {
    regels.push(`${r.symbool} = ${r.waarde}   [${r.artikel}]`);
    regels.push(`    ${r.uitleg}`);
  }
  if (uitkomst.norm !== null) {
    regels.push("");
    regels.push(
      uitkomst.hoogteHandmatig
        ? `h is handmatig opgegeven: ${getal(uitkomst.hoogteM, 3)} m.`
        : geometrie.afleiding[0] ?? "",
    );
    regels.push(
      uitkomst.aantalHandmatig
        ? `m is handmatig opgegeven: ${uitkomst.aantalElementen}.`
        : geometrie.afleiding[1] ?? "",
    );
    for (const r of geometrie.afleiding.slice(2)) regels.push(r);
  }
  if (uitkomst.waarschuwingen.length > 0) {
    regels.push("");
    for (const w of uitkomst.waarschuwingen) regels.push(`! ${w}`);
  }
  return regels.filter((r) => r !== undefined).join("\n");
}
