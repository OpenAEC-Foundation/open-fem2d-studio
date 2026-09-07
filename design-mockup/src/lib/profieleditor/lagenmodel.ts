/**
 * lagenmodel — een getekende doorsnede omzetten in het **lagenmodel** dat de
 * spanningskern (`src-tauri/crates/spanning-check`) verwacht.
 *
 * # Waarom dit nodig is
 *
 * De spanningskern rekent het verloop van σ_x, τ en σ_eq over de hoogte uit.
 * Daarvoor heeft hij niet A en I_y nodig maar de **breedtefunctie** `b(z)`:
 * uit b(z) volgen A, het zwaartepunt, I_y én het statisch moment S(z), en
 * daarmee τ = V·S/(I·b). Een doorsnede die alleen als getal bekend is heeft
 * geen b(z) en dus geen spanningsverloop — dat is precies de reden waarom een
 * eigen doorsnede tot nu toe buiten die toets viel.
 *
 * Wat hier gebeurt is dus één ding: de getekende bouwstenen omzetten in een
 * stapel horizontale stroken met per strook de totale materiaalbreedte.
 *
 * # Waarom dat exact mag
 *
 *   A   = ∫ b(z) dz
 *   z_c = ∫ b(z)·z dz / A
 *   I_y = ∫ b(z)·(z − z_c)² dz
 *
 * Deze drie hangen uitsluitend van b(z) af, niet van hoe het materiaal
 * horizontaal verdeeld is. Voor rechthoekige platen — ook gedraaide — is de
 * strokenverdeling daarmee geen benadering maar een andere schrijfwijze van
 * dezelfde doorsnede. Alleen τ = V·S/(I·b) blijft de gebruikelijke aanname van
 * Jourawski: de schuifspanning gelijkmatig over de breedte op die hoogte.
 *
 * # Wat er wél benaderd wordt, en dat staat er ook bij
 *
 * - Een **gedraaide plaat** heeft een breedte die binnen een strook lineair
 *   verloopt; die stroken worden onderverdeeld (`SUBVERDELING`) en per
 *   substrook op de middenhoogte bemonsterd.
 * - Een **catalogusdeel** gaat als rechte platen mee (flens–lijf–flens), zonder
 *   walsuitrondingen — dezelfde vereenvoudiging die de spanningskern zelf voor
 *   een catalogusprofiel gebruikt. Het verschil met de exacte contour is
 *   meetbaar: de aanroeper zet A en I_y van dit model naast die van de
 *   doorsnedemotor en toont de afwijking.
 * - **Overlappende platen** tellen dubbel, precies zoals in het lamellenmodel
 *   van de motor: waar een flens en een lijf elkaar in de naad overlappen,
 *   telt dat stukje in beide mee. Dat is de gangbare dunwandige afspraak en
 *   houdt dit model en de motor onderling consistent.
 *
 * Wat NIET kan, krijgt geen getal maar een Nederlandse reden terug.
 */
import type { SpanningLaag } from "../types/spanning/SpanningLaag";
import type { SpanningDoorsnede } from "../types/spanning/SpanningDoorsnede";
import { deelZwaartepunt, lamelHoekpunten } from "./geometrie";
import { profielLabel } from "./catalogus";
import { STEEL_SECTION_DIMS } from "../steelSectionDims.generated";
import { profileLookupKey } from "../steelCheckBuilder";
import type { Catalogusdeel, DeelUitvoer, DoorsnedeOntwerp, Lamel } from "./types";

/** In hoeveel substroken een band wordt verdeeld zodra de breedte erin verloopt. */
const SUBVERDELING = 8;

/** Aantal stroken waarmee een ronde buiswand benaderd wordt — als in de kern. */
const CHS_STROKEN = 40;

/** Twee hoogten gelden als dezelfde strookgrens binnen deze marge (mm). */
const TOL = 1e-6;

/** Een strook dunner dan dit wordt overgeslagen (de kern eist dikte > 0). */
const MIN_DIKTE = 1e-4;

/**
 * Eén bouwsteen als breedtebron. `zMin`/`zMax` in modelcoördinaten (z omhoog);
 * `breedteOp` geeft buiten dat bereik 0.
 */
interface Bijdrage {
  zMin: number;
  zMax: number;
  breedteOp: (z: number) => number;
  /** Hoogten waar de breedtefunctie knikt (modelcoördinaten). */
  knikpunten: number[];
  /** Is de breedte tussen twee opeenvolgende knikpunten constant? */
  constant: boolean;
}

/** Horizontale koorde van een convexe vierhoek op hoogte z. */
function koorde(punten: Array<[number, number]>, z: number): number {
  let yMin = Infinity;
  let yMax = -Infinity;
  let raak = false;
  for (let i = 0; i < punten.length; i += 1) {
    const [y0, z0] = punten[i];
    const [y1, z1] = punten[(i + 1) % punten.length];
    if (Math.abs(z1 - z0) < 1e-12) {
      // Horizontale zijde: telt alleen mee als z er precies op ligt.
      if (Math.abs(z - z0) < 1e-9) {
        yMin = Math.min(yMin, y0, y1);
        yMax = Math.max(yMax, y0, y1);
        raak = true;
      }
      continue;
    }
    const t = (z - z0) / (z1 - z0);
    if (t < -1e-12 || t > 1 + 1e-12) continue;
    const y = y0 + t * (y1 - y0);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
    raak = true;
  }
  return raak && yMax > yMin ? yMax - yMin : 0;
}

/** Bijdrage van één plaat (lamel). */
function lamelBijdrage(l: Lamel): Bijdrage {
  const punten = lamelHoekpunten(l);
  const zs = punten.map((p) => p[1]);
  const hoek = ((l.alphaGraden % 90) + 90) % 90;
  // Liggend of staand: de koorde is dan binnen elke band constant.
  const recht = hoek < 1e-9 || Math.abs(hoek - 90) < 1e-9;
  return {
    zMin: Math.min(...zs),
    zMax: Math.max(...zs),
    breedteOp: (z) => koorde(punten, z),
    knikpunten: zs,
    constant: recht,
  };
}

/** Eén rechthoekige plaat van een catalogusdeel, in modelcoördinaten. */
function plaatBijdrage(zOnder: number, zBoven: number, breedte: number): Bijdrage {
  return {
    zMin: zOnder,
    zMax: zBoven,
    breedteOp: (z) => (z > zOnder - TOL && z < zBoven + TOL ? breedte : 0),
    knikpunten: [zOnder, zBoven],
    constant: true,
  };
}

/**
 * Catalogusdeel → rechte platen. Alleen voor een deel dat rechtop staat
 * (α een veelvoud van 180°); gedraaid is het geen stapel horizontale platen
 * meer en geeft deze functie een reden terug.
 *
 * De plaatverdeling is dezelfde als die van de spanningskern voor een
 * catalogusprofiel: flens–lijf–flens, koker wand–twee lijven–wand, buis in
 * stroken. Spiegelen doet er niet toe: dat verandert de breedte per hoogte niet.
 */
function deelBijdragen(d: Catalogusdeel, uit?: DeelUitvoer): Bijdrage[] | string {
  const hoek = ((d.alphaGraden % 360) + 360) % 360;
  if (Math.abs(hoek) > 1e-9 && Math.abs(hoek - 180) > 1e-9) {
    return (
      `Catalogusdeel "${profielLabel(d.profiel.naam)}" staat ${d.alphaGraden}° gedraaid. Een gedraaid ` +
      "profiel is geen stapel horizontale platen meer; zet het rechtop of bouw het uit lamellen op."
    );
  }
  const p = d.profiel;
  const [, zc] = deelZwaartepunt(d, uit);
  // Onderkant van het deel in modelcoördinaten.
  const z0 = d.z_mm - zc;
  const plaat = (van: number, tot: number, breedte: number) =>
    plaatBijdrage(z0 + van, z0 + tot, breedte);

  switch (p.soort) {
    case "ISection":
    case "Channel":
    case "ChannelSchuin":
      if (!(p.tf > 0) || !(p.tw > 0) || p.h <= 2 * p.tf) {
        return `Profiel "${p.naam}" heeft geen bruikbare flens- en lijfdikte.`;
      }
      return [
        plaat(0, p.tf, p.b),
        plaat(p.tf, p.h - p.tf, p.tw),
        plaat(p.h - p.tf, p.h, p.b),
      ];
    case "Shs":
    case "Rhs": {
      const t = p.tw > 0 ? p.tw : p.tf;
      if (!(t > 0) || p.h <= 2 * t) return `Profiel "${p.naam}" heeft geen bruikbare wanddikte.`;
      return [
        plaat(0, t, p.b),
        plaat(t, p.h - t, 2 * t),
        plaat(p.h - t, p.h, p.b),
      ];
    }
    case "Chs": {
      const t = p.tw > 0 ? p.tw : p.tf;
      const rUit = p.h / 2;
      const rIn = rUit - t;
      if (!(t > 0) || rIn <= 0) return `Profiel "${p.naam}" heeft geen bruikbare wanddikte.`;
      const dz = p.h / CHS_STROKEN;
      const uit2: Bijdrage[] = [];
      for (let k = 0; k < CHS_STROKEN; k += 1) {
        const van = k * dz;
        const tot = van + dz;
        const y = (van + tot) / 2 - rUit;
        const buiten = Math.sqrt(Math.max(0, rUit * rUit - y * y));
        const binnen = Math.sqrt(Math.max(0, rIn * rIn - y * y));
        const breedte = 2 * (buiten - binnen);
        if (breedte > MIN_DIKTE) uit2.push(plaat(van, tot, breedte));
      }
      return uit2;
    }
    case "Rechthoek":
      return [plaat(0, p.h, p.b)];
  }
}

/** Wat er uit een ontwerp komt: het lagenmodel plus wat erover te melden is. */
export interface LagenModel {
  /** Van boven naar beneden; `z` vanaf de bovenkant van de doorsnede. */
  lagen: SpanningLaag[];
  hoogte_mm: number;
  /** Zwaartelijn vanaf de bovenkant (mm). */
  z_c_mm: number;
  /** Oppervlakte van het strokenmodel (mm²). */
  a_mm2: number;
  /** Traagheidsmoment van het strokenmodel om zijn eigen zwaartelijn (mm⁴). */
  iy_mm4: number;
  /** Modelhoogte van de bovenkant (z omhoog); om terug te rekenen naar de tekening. */
  z_top_model_mm: number;
  meldingen: string[];
}

/** Statisch moment van het deel bóven `z` om de zwaartelijn (mm³). */
export function sBovenMm3(model: LagenModel, z: number): number {
  let q = 0;
  for (const l of model.lagen) {
    if (z <= l.z_top_mm) break;
    const za = l.z_top_mm;
    const zb = Math.min(z, l.z_bot_mm);
    q += l.breedte_mm * ((zb * zb - za * za) / 2 - model.z_c_mm * (zb - za));
  }
  return Math.abs(q);
}

/**
 * Strokenmodel van een samenstelling. Geeft een Nederlandse reden terug
 * (string) wanneer het niet kan.
 */
export function lagenVanSamenstelling(
  lamellen: Lamel[],
  catalogusdelen: Catalogusdeel[],
  delen: DeelUitvoer[] = [],
): LagenModel | string {
  const bijdragen: Bijdrage[] = [];
  const meldingen: string[] = [];

  for (const l of lamellen) {
    if (!(l.b_mm > 0) || !(l.t_mm > 0)) return "Elke plaat moet een positieve b en t hebben.";
    bijdragen.push(lamelBijdrage(l));
  }
  let gedraaideLamel = false;
  for (const l of lamellen) {
    const hoek = ((l.alphaGraden % 90) + 90) % 90;
    if (hoek > 1e-9 && Math.abs(hoek - 90) > 1e-9) gedraaideLamel = true;
  }
  for (let i = 0; i < catalogusdelen.length; i += 1) {
    const r = deelBijdragen(catalogusdelen[i], delen[i]);
    if (typeof r === "string") return r;
    bijdragen.push(...r);
  }
  if (bijdragen.length === 0) return "Er is nog niets getekend om spanningen in te bepalen.";

  if (catalogusdelen.length > 0) {
    meldingen.push(
      "Een catalogusdeel gaat als rechte platen mee (flens–lijf–flens), zonder walsuitrondingen. " +
      "Vergelijk A en I_y van het strokenmodel met die van de doorsnedemotor om te zien wat dat scheelt.",
    );
  }
  if (gedraaideLamel) {
    meldingen.push(
      `Een gedraaide plaat heeft een breedte die over de hoogte verloopt; die banden zijn in ` +
      `${SUBVERDELING} substroken verdeeld en per substrook op de middenhoogte bemonsterd.`,
    );
  }

  // Grenzen van alle banden.
  const grenzen: number[] = [];
  for (const b of bijdragen) grenzen.push(...b.knikpunten);
  grenzen.sort((a, b) => a - b);
  const uniek: number[] = [];
  for (const g of grenzen) {
    if (uniek.length === 0 || g - uniek[uniek.length - 1] > TOL) uniek.push(g);
  }
  if (uniek.length < 2) return "De doorsnede heeft geen hoogte.";

  const zTop = uniek[uniek.length - 1];
  const zBot = uniek[0];

  // Stroken opbouwen, van onder naar boven in modelcoördinaten.
  const stroken: Array<{ zOnder: number; zBoven: number; breedte: number }> = [];
  for (let i = 0; i < uniek.length - 1; i += 1) {
    const z0 = uniek[i];
    const z1 = uniek[i + 1];
    if (z1 - z0 < MIN_DIKTE) continue;
    const raakt = bijdragen.filter((b) => b.zMin < z1 - TOL && b.zMax > z0 + TOL);
    if (raakt.length === 0) {
      return (
        "De doorsnede valt uiteen in losse delen: tussen " +
        `z = ${z0.toFixed(1)} en z = ${z1.toFixed(1)} mm zit geen materiaal. Een spanningsverloop ` +
        "vraagt om één doorlopende doorsnede."
      );
    }
    const n = raakt.every((b) => b.constant) ? 1 : SUBVERDELING;
    const dz = (z1 - z0) / n;
    for (let k = 0; k < n; k += 1) {
      const a = z0 + k * dz;
      const b = a + dz;
      const breedte = bijdragen.reduce((s, x) => s + x.breedteOp((a + b) / 2), 0);
      if (!(breedte > MIN_DIKTE)) {
        return (
          `Op z = ${((a + b) / 2).toFixed(1)} mm is de doorsnede 0 mm breed; ` +
          "een spanningsverloop vraagt om één doorlopende doorsnede."
        );
      }
      stroken.push({ zOnder: a, zBoven: b, breedte });
    }
  }
  if (stroken.length === 0) return "De doorsnede heeft geen hoogte.";

  // Naar het stelsel van de kern: z vanaf de bovenkant, van boven naar beneden.
  const lagen: SpanningLaag[] = stroken
    .slice()
    .reverse()
    .map((s) => ({
      z_top_mm: zTop - s.zBoven,
      z_bot_mm: zTop - s.zOnder,
      breedte_mm: s.breedte,
    }));

  let a = 0;
  let az = 0;
  for (const l of lagen) {
    const t = l.z_bot_mm - l.z_top_mm;
    a += l.breedte_mm * t;
    az += l.breedte_mm * t * (l.z_top_mm + l.z_bot_mm) / 2;
  }
  const zC = az / a;
  let iy = 0;
  for (const l of lagen) {
    const t = l.z_bot_mm - l.z_top_mm;
    const arm = (l.z_top_mm + l.z_bot_mm) / 2 - zC;
    iy += (l.breedte_mm * t * t * t) / 12 + l.breedte_mm * t * arm * arm;
  }

  return {
    lagen,
    hoogte_mm: zTop - zBot,
    z_c_mm: zC,
    a_mm2: a,
    iy_mm4: iy,
    z_top_model_mm: zTop,
    meldingen,
  };
}

/**
 * Het ontwerp als doorsnede-invoer voor de spanningskern.
 *
 * Een catalogusprofiel met gaten gaat NIET mee: een gat in het lijf onderbreekt
 * de doorsnede en dat kan een stapel doorlopende stroken niet weergeven. Zonder
 * gaten is het gewoon het catalogusprofiel, en dat kent de kern zelf al —
 * inclusief A en I_y uit de profieldatabase.
 */
export function doorsnedeVanOntwerp(
  o: DoorsnedeOntwerp,
  delen: DeelUitvoer[] = [],
): { doorsnede: SpanningDoorsnede; model: LagenModel | null; naam: string } | string {
  if (o.soort === "gat") {
    if (o.gaten.length > 0) {
      return (
        `Deze doorsnede heeft ${o.gaten.length} gat${o.gaten.length === 1 ? "" : "en"}. ` +
        "Een gat door een plaat onderbreekt de doorsnede over de hoogte van dat gat, en het " +
        "lagenmodel achter het spanningsverloop kan alleen doorlopende stroken aan. Haal de " +
        "gaten weg om het verloop van het gave profiel te zien."
      );
    }
    if (!STEEL_SECTION_DIMS[profileLookupKey(o.basis.naam)]) {
      return `Profiel "${o.basis.naam}" staat niet in de profieldatabase.`;
    }
    return {
      doorsnede: { vorm: "Catalogus", maten: { naam: o.basis.naam } },
      model: null,
      naam: o.basis.naam,
    };
  }
  const model = lagenVanSamenstelling(o.lamellen, o.catalogusdelen, delen);
  if (typeof model === "string") return model;
  return {
    doorsnede: { vorm: "Lagen", maten: { lagen: model.lagen } },
    model,
    naam: "eigen doorsnede",
  };
}
