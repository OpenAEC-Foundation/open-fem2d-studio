/**
 * lassen — lasnaden tussen de platen van een samengestelde doorsnede: waar ze
 * zitten, hoe ze getekend worden, en welke schuifstroom er doorheen gaat.
 *
 * # Wat een las in een doorsnedetekening is
 *
 * Een lasnaad die je in een doorsnede ziet, loopt met de staaf mee: het is een
 * **langslas**. Hij draagt daarom geen kracht maar een kracht per strekkende
 * millimeter — de schuifstroom. Die volgt uit grootheden die er al zijn:
 *
 * ```text
 *   q = V_z,Ed · S / I_y            [N/mm]
 * ```
 *
 * met `S` het statisch moment, om de zwaartelijn van de hele doorsnede, van
 * het deel dat door díé naad wordt vastgehouden. Snijd je de naad door, dan
 * valt de doorsnede in twee stukken; `S` is het statisch moment van één van
 * die twee. Welk van de twee maakt niet uit: samen zijn ze om de zwaartelijn
 * nul, dus ze hebben dezelfde |S|. Dat is meteen een controle op het model.
 *
 * # Wanneer dat niet opgaat
 *
 * Zodra er méér dan één weg is waarlangs het afgesneden deel vastzit — een
 * gesloten koker met vier naden bijvoorbeeld — is de verdeling over die naden
 * statisch onbepaald en volgt hij niet uit `V·S/I`. Dan komt er hier geen
 * getal maar een reden. Hetzelfde geldt zodra er catalogusdelen in de
 * samenstelling zitten: die zijn geen platen, dus het afgesneden deel is niet
 * als som van platen te schrijven.
 *
 * De normkant (correlatiefactor, `f_vw,d`, weerstand per eenheidslengte, unity
 * check) staat NIET hier maar in de rekenkern
 * `src-tauri/crates/nen-en-1993-1-8-las`, zodat er één plek is waar
 * NEN-EN 1993-1-8 staat.
 */
import type { Lassoort } from "../types/las/Lassoort";
import { afstandUiteindenTotAs, lamelMiddellijn, rakenElkaar, radialen } from "./geometrie";
import type { Las, Lamel } from "./types";
import type { Punt2 } from "./transformeren";

/** De lassen van een samenstelling; ook oude ontwerpen zonder het veld. */
export function lassenVan(o: { lassen?: Las[] }): Las[] {
  return o.lassen ?? [];
}

export const LASSOORT_LABEL: Record<Lassoort, string> = {
  HoeklasEnkel: "hoeklas, enkelzijdig",
  HoeklasDubbel: "hoeklas, dubbelzijdig",
  StompVolledig: "stomp, volledig doorgelast",
};

export const LASSOORT_KORT: Record<Lassoort, string> = {
  HoeklasEnkel: "enkel",
  HoeklasDubbel: "dubbel",
  StompVolledig: "stomp",
};

/** Aantal meewerkende keeldoorsneden — spiegel van `Lassoort` in de kern. */
export function keeldoorsneden(soort: Lassoort): number {
  return soort === "HoeklasDubbel" ? 2 : soort === "HoeklasEnkel" ? 1 : 0;
}

// ── Waar de naden zitten ────────────────────────────────────────────────────

/** Twee platen die elkaar raken, als paar id's (a vóór b in de lijstvolgorde). */
export interface Naadkandidaat {
  aId: string;
  bId: string;
}

/**
 * Alle plaatparen die elkaar raken en nog geen las hebben. Dit is hetzelfde
 * criterium waarmee de gesloten cel herkend wordt: het uiteinde van de ene
 * plaat ligt tegen de middellijn van de andere.
 */
export function mogelijkeNaden(lamellen: Lamel[], lassen: Las[]): Naadkandidaat[] {
  const bezet = new Set(lassen.map((l) => sleutel(l.aId, l.bId)));
  const uit: Naadkandidaat[] = [];
  for (let i = 0; i < lamellen.length; i += 1) {
    for (let j = i + 1; j < lamellen.length; j += 1) {
      const a = lamellen[i];
      const b = lamellen[j];
      if (!rakenElkaar(a, b)) continue;
      if (bezet.has(sleutel(a.id, b.id))) continue;
      uit.push({ aId: a.id, bId: b.id });
    }
  }
  return uit;
}

function sleutel(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ── Meetkunde van de naad (voor de tekening) ────────────────────────────────

export interface Naadmeetkunde {
  /** Het punt op het oppervlak van de voetplaat waar de steel tegenaan komt. */
  punt: Punt2;
  /** Eenheidsvector langs de steel, wijzend van de naad wég (de plaat in). */
  langsA: Punt2;
  /** Eenheidsvector loodrecht op de steel. */
  dwarsA: Punt2;
  /** Dikte van de steel (mm). */
  tA: number;
}

/**
 * Waar de twee platen elkaar raken.
 *
 * Een naad tussen twee platen is een T: de ene plaat EINDIGT tegen de andere.
 * Welke van de twee dat is volgt uit de meetkunde en niet uit de volgorde
 * waarin de gebruiker ze aanwees — bij een gelaste ligger eindigt het lijf op
 * de flens, ook als de las als "flens–lijf" is aangemaakt. De rollen worden
 * hier daarom eerst goedgezet: de plaat waarvan een uiteinde het dichtst bij de
 * middellijn van de ander ligt, is de steel.
 *
 * Daarna wordt dat uiteinde op de middellijn van de voetplaat geprojecteerd en
 * een halve voetdikte teruggelegd, zodat het punt op het OPPERVLAK van de
 * voetplaat ligt — dáár zit de lasnaad, en dáár staat de hoeklas in de hoek.
 */
export function naadmeetkunde(steel: Lamel, voet: Lamel): Naadmeetkunde | null {
  let a = steel;
  let b = voet;
  if (afstandUiteindenTotAs(b, a) < afstandUiteindenTotAs(a, b)) {
    a = voet;
    b = steel;
  }
  const [b0, b1] = lamelMiddellijn(b);
  const ab: Punt2 = { y: b1[0] - b0[0], z: b1[1] - b0[1] };
  const l2 = ab.y * ab.y + ab.z * ab.z;
  let beste: { eind: Punt2; proj: Punt2; d: number } | null = null;
  for (const e of lamelMiddellijn(a)) {
    const eind: Punt2 = { y: e[0], z: e[1] };
    let proj: Punt2;
    if (l2 <= 0) {
      proj = { y: b0[0], z: b0[1] };
    } else {
      const s = Math.max(
        0,
        Math.min(1, ((eind.y - b0[0]) * ab.y + (eind.z - b0[1]) * ab.z) / l2),
      );
      proj = { y: b0[0] + s * ab.y, z: b0[1] + s * ab.z };
    }
    const d = Math.hypot(eind.y - proj.y, eind.z - proj.z);
    if (!beste || d < beste.d) beste = { eind, proj, d };
  }
  if (!beste) return null;

  // Eenheidsvector van de middellijn van b naar het uiteinde van a; valt het
  // uiteinde precies op die lijn, neem dan de richting van a zelf.
  const hoek = radialen(a.alphaGraden);
  let u: Punt2 = { y: beste.eind.y - beste.proj.y, z: beste.eind.z - beste.proj.z };
  const lu = Math.hypot(u.y, u.z);
  if (lu < 1e-9) {
    const richting: Punt2 = { y: Math.cos(hoek), z: Math.sin(hoek) };
    const naarEind =
      (beste.eind.y - a.y_mm) * richting.y + (beste.eind.z - a.z_mm) * richting.z;
    u = naarEind >= 0 ? richting : { y: -richting.y, z: -richting.z };
  } else {
    u = { y: u.y / lu, z: u.z / lu };
  }

  const punt: Punt2 = {
    y: beste.proj.y + u.y * (b.t_mm / 2),
    z: beste.proj.z + u.z * (b.t_mm / 2),
  };
  return { punt, langsA: u, dwarsA: { y: -u.z, z: u.y }, tA: a.t_mm };
}

// ── Schuifstroom ────────────────────────────────────────────────────────────

export interface Schuifstroom {
  /** Statisch moment van het afgesneden deel om de zwaartelijn (mm³). */
  s_mm3: number;
  /** Aantal platen in dat deel — handig om te zien wát er afgesneden is. */
  platen: number;
  /** Schuifstroom bij de opgegeven dwarskracht (N/mm). */
  q_n_per_mm: number;
}

/**
 * De schuifstroom door één naad, of een Nederlandse reden waarom hij niet uit
 * `V·S/I` volgt.
 *
 * `z_c_mm` en `iy_mm4` horen uit de doorsnedemotor te komen: dat zijn de
 * grootheden van de hele doorsnede, en het statisch moment hieronder is er om
 * die zwaartelijn gerekend.
 */
export function schuifstroomVanLas(
  las: Las,
  lamellen: Lamel[],
  alleLassen: Las[],
  z_c_mm: number,
  iy_mm4: number,
  vz_kn: number,
  aantalCatalogusdelen: number,
): Schuifstroom | string {
  if (aantalCatalogusdelen > 0) {
    return (
      "Er zitten catalogusdelen in de samenstelling. Het afgesneden deel is dan niet als som " +
      "van platen te schrijven, en daarmee volgt S niet uit dit model."
    );
  }
  const index = new Map(lamellen.map((l, i) => [l.id, i]));
  const ia = index.get(las.aId);
  const ib = index.get(las.bId);
  if (ia === undefined || ib === undefined) return "Een van de twee platen bestaat niet meer.";
  if (!(iy_mm4 > 0)) return "De motor heeft nog geen I_y gegeven.";

  // Verbindingsgraaf: platen die elkaar raken. Alleen de naad zelf wordt
  // doorgesneden; alle andere verbindingen blijven staan.
  const buren: number[][] = lamellen.map(() => []);
  for (let i = 0; i < lamellen.length; i += 1) {
    for (let j = i + 1; j < lamellen.length; j += 1) {
      if (!rakenElkaar(lamellen[i], lamellen[j])) continue;
      if ((i === ia && j === ib) || (i === ib && j === ia)) continue;
      buren[i].push(j);
      buren[j].push(i);
    }
  }
  // Bereikbaar vanaf a zonder de naad.
  const bereikt = new Set<number>([ia]);
  const stapel = [ia];
  while (stapel.length) {
    const k = stapel.pop() as number;
    for (const n of buren[k]) {
      if (!bereikt.has(n)) {
        bereikt.add(n);
        stapel.push(n);
      }
    }
  }
  if (bereikt.has(ib)) {
    const andere = alleLassen.length - 1;
    return (
      "Het afgesneden deel zit ook langs een andere weg vast (bijvoorbeeld een gesloten koker). " +
      `De schuifstroom verdeelt zich dan over meer naden en is statisch onbepaald; uit V·S/I_y ` +
      `alleen volgt hij niet${andere > 0 ? `, met ${alleLassen.length} naden in dit ontwerp` : ""}.`
    );
  }
  if (bereikt.size === lamellen.length) {
    return "De naad snijdt de doorsnede niet in tweeën; er is geen deel dat eraan hangt.";
  }

  let s = 0;
  for (const i of bereikt) {
    const l = lamellen[i];
    s += l.b_mm * l.t_mm * (l.z_mm - z_c_mm);
  }
  const sAbs = Math.abs(s);
  return {
    s_mm3: sAbs,
    platen: bereikt.size,
    q_n_per_mm: (Math.abs(vz_kn) * 1e3 * sAbs) / iy_mm4,
  };
}

/** Standaardkeeldikte voor een nieuwe naad: 0,7·t van de dunste plaat, op halve mm. */
export function voorgesteldeKeeldikte(a: Lamel, b: Lamel): number {
  const t = Math.min(a.t_mm, b.t_mm);
  return Math.max(3, Math.round(0.7 * t * 2) / 2);
}
