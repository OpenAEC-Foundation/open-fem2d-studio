/**
 * PlaatMesher — vierhoeken, driehoeken en openingen in wandschijven
 * (platenspoor stap 2, september 2026).
 *
 * WAT HIER STAAT, EN WAAROM HIER
 *  - `genereerRasterMesh`: een gestructureerd rekenmesh voor een asgelijnde
 *    rechthoek met asgelijnde rechthoekige openingen. Gridlijnen lopen door
 *    elke openingsrand; de vakken binnen een opening vallen weg. Zuiver
 *    TypeScript, synchroon en deterministisch — daarmee rekent de MCP-sidecar
 *    dezelfde plaat zonder meshcache, precies zoals de rechthoek zonder
 *    opening dat al deed. De vakken worden vierhoeken (Quad4) of, per vak in
 *    twee gesplitst, driehoeken (CST).
 *  - `koppelTotVierhoeken`: koppelt driehoeken van een randconform
 *    CDT-mesh (polygoonplaten, uit de WASM-mesher in het canvas) tot
 *    vierhoeken. Wat niet netjes te koppelen is, blijft driehoek: het net is
 *    dan "gemengd", en dat staat er ook bij. Een vervormde vierhoek geeft in
 *    de kern een negatieve Jacobiaan; daarom wordt elk gevormd element hier
 *    op convexiteit en hoeken gekeurd vóór het meegaat.
 *  - `keurPlatMesh`: de poort waar élk rekenmesh doorheen gaat voordat de
 *    engine er kernelementen van maakt — ook een cache uit een projectbestand
 *    of via de MCP. Indices binnen bereik, geen dubbele hoekpunten, echte
 *    oppervlakte, convexe vierhoeken, en de knopenlijsten van de randen van
 *    hoek tot hoek. Een fout mesh wordt geweigerd met reden; het wordt nooit
 *    stilzwijgend "zo goed mogelijk" gebruikt.
 *
 * Dit bestand mag GEEN TriangleService of PlateRegion importeren: die trekken
 * de WASM-mesher en `window.location` de sidecarbundel in (zie
 * scripts/bouw-sidecar.mjs). Het praat alleen met TriToQuad (pure meetkunde).
 *
 * Coördinaten: modelassen in mm, x naar rechts en z omhoog — dezelfde vorm als
 * de plaathoeken in de UI en als `PlaatMeshCache.points`. De engine deelt door
 * 1000 bij het aanmaken van de kernknopen (mesh-y = model-z).
 */

import { pairTrianglesToQuads } from '../mesher/TriToQuad';

/** Punt in modelcoördinaten (mm; z omhoog). */
export interface PlatMeshPunt { x: number; z: number }

/** Soort rekenmesh, zoals de meshcache hem ook meldt. */
export type PlaatMeshSoort = 'driehoeken' | 'vierhoeken' | 'gemengd';

/** De elementkeuze van de gebruiker per plaat. */
export type PlaatMeshType = 'driehoeken' | 'vierhoeken';

/**
 * Een plat rekenmesh: punten plus elementen als indexlijsten. Dezelfde vorm
 * als `PlaatMeshCache` in de UI (zonder de handtekening), zodat het rasterpad
 * en het cachepad in de engine door één en dezelfde omzetting gaan.
 */
export interface PlatMesh {
  points: PlatMeshPunt[];
  /** CST-driehoeken, tegen de klok in (x rechts, z omhoog). */
  triangles: [number, number, number][];
  /** Quad4-vierhoeken, tegen de klok in en convex. */
  quads: [number, number, number, number][];
  /**
   * Per omtrekrand (rand i loopt van hoek i naar hoek i+1, cyclisch) de
   * puntindices van de meshknopen op die rand, van hoek tot hoek.
   */
  edgeNodeIndices: number[][];
  /**
   * Per opening, per openingsrand (rand j van openingshoek j naar j+1) de
   * puntindices van de meshknopen op die rand. Leeg zonder openingen.
   */
  openingEdgeNodeIndices: number[][][];
  meshSoort: PlaatMeshSoort;
}

/**
 * Minimale afstand (mm) tussen een opening en de omtrek, en tussen openingen
 * onderling. Een strook smaller dan dit draagt in een constructie niets en
 * geeft in het rekenmesh flinterelementen; zo'n opening "raakt" de rand en
 * wordt geweigerd. Bewust ruimer dan de tekentolerantie van 1 mm.
 */
export const PLAAT_OPENING_MIN_AFSTAND_MM = 10;

// ── Meetkunde-hulpjes ────────────────────────────────────────────────────────

/** Tweemaal de getekende oppervlakte van een polygoon (positief = tegen de klok). */
export function getekendeOppervlakte2(p: PlatMeshPunt[]): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    s += p[j].x * p[i].z - p[i].x * p[j].z;
  }
  return s;
}

/** Ligt (x, z) binnen de polygoon (straalmethode; randpunten onbepaald)? */
export function puntInPolygoon(x: number, z: number, poly: PlatMeshPunt[]): boolean {
  let binnen = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) binnen = !binnen;
  }
  return binnen;
}

/** Afstand van punt p tot lijnstuk a–b. */
export function afstandTotLijnstuk(p: PlatMeshPunt, a: PlatMeshPunt, b: PlatMeshPunt): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.z - a.z);
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/**
 * De puntindices die op lijnstuk a→b liggen (afstand ≤ tol, projectie binnen
 * het stuk), geordend van a naar b. Gebruikt om de knopen op een rand van
 * een opening of omtrek uit een mesh te halen.
 */
export function zoekPuntenOpLijnstuk(
  points: PlatMeshPunt[], a: PlatMeshPunt, b: PlatMeshPunt, tolMm: number,
): number[] {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  if (L === 0) return [];
  const rij: { i: number; t: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const q = points[i];
    const t = ((q.x - a.x) * dx + (q.z - a.z) * dz) / L;
    if (t < -tolMm || t > L + tolMm) continue;
    const d = Math.abs((q.x - a.x) * dz - (q.z - a.z) * dx) / L;
    if (d <= tolMm) rij.push({ i, t });
  }
  rij.sort((p, q) => p.t - q.t);
  return rij.map((r) => r.i);
}

// ── Rastermesh (rechthoek met rechthoekige openingen) ───────────────────────

export interface RasterMeshInvoer {
  /** Asgelijnde rechthoek van de plaat (mm). */
  minX: number; maxX: number; minZ: number; maxZ: number;
  /**
   * Asgelijnde rechthoekige openingen, elk als polygoon van vier hoeken (de
   * volgorde van de gebruiker; de randlijsten volgen die volgorde).
   */
  openingen: PlatMeshPunt[][];
  /** Gewenste elementgrootte (mm). */
  meshSize: number;
  meshType: PlaatMeshType;
  /**
   * Extra dwingende gridlijnen (mm): de x- en z-coördinaten van knopen waar
   * iets aan hangt (oplegging, puntlast, staafeinde) binnen de plaat. Zonder
   * openingen is het raster uniform en liggen zulke knopen op een gridlijn
   * of worden ze geweigerd — dat gedrag blijft. Mét openingen verschuiven de
   * gridlijnen (elk tussenstuk wordt apart verdeeld); een knoop die vóór de
   * opening op een gridlijn lag, zou er dan stil naast komen te liggen en
   * geweigerd worden. Daarom worden die knopen hier gridlijn: een opening
   * verandert nooit of een oplegging op de plaat aansluit.
   */
  dwingendX?: number[];
  dwingendZ?: number[];
}

/**
 * De coördinaten van knopen binnen (of op) de rechthoek, als dwingende
 * gridlijnen voor `genereerRasterMesh`. Gedeeld door engine en canvas-preview,
 * zodat beide hetzelfde raster laten zien.
 */
export function dwingendeLijnenUitKnopen(
  knopen: Iterable<PlatMeshPunt>,
  r: { minX: number; maxX: number; minZ: number; maxZ: number },
  tolMm: number,
): { x: number[]; z: number[] } {
  const x: number[] = [], z: number[] = [];
  for (const k of knopen) {
    if (k.x < r.minX - tolMm || k.x > r.maxX + tolMm || k.z < r.minZ - tolMm || k.z > r.maxZ + tolMm) continue;
    x.push(k.x);
    z.push(k.z);
  }
  return { x, z };
}

/**
 * Gridlijnen tussen `lo` en `hi`: de dwingende posities (randen van
 * openingen) worden altijd gridlijn, en elk interval ertussen wordt in
 * round(lengte/meshSize) gelijke delen verdeeld (minstens één). Zonder
 * dwingende posities is dit precies de oude indeling lo + (k/n)·(hi−lo).
 */
export function rasterLijnen(lo: number, hi: number, dwingend: number[], meshSize: number): number[] {
  const vast = [lo, hi, ...dwingend.filter((v) => v > lo && v < hi)]
    .sort((a, b) => a - b)
    .filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-9);
  const uit: number[] = [];
  for (let k = 0; k + 1 < vast.length; k++) {
    const a = vast[k], b = vast[k + 1];
    const n = Math.max(1, Math.round((b - a) / meshSize));
    for (let i = 0; i < n; i++) uit.push(a + (i / n) * (b - a));
  }
  uit.push(hi);
  return uit;
}

/**
 * De dwingende knooplijnen die NIET binnen 1 mm van de plaatrand, van een
 * openingsrand of van een eerdere knooplijn liggen.
 *
 * WAAROM. Het rekenmesh voegt punten binnen 1 mm samen (de knooptolerantie
 * van `findNodeAt`, dezelfde als `TOL_MM` in de engine). Een knoop op 1000,5
 * naast een openingsrand op 1000 gaf daardoor twee gridlijnen die tot één
 * knooprij samenvielen: een vak met oppervlak nul en een weigering "schijf-
 * element … is niet op te bouwen" (gemeten, issue #13). Zo'n knoop ligt
 * binnen de tolerantie OP die rand; de randkoppeling van de engine hangt hem
 * daar aan, dus een eigen gridlijn is overbodig. Lijnen die verder dan 1 mm
 * van elkaar liggen blijven ongemoeid, zodat elk mesh dat vandaag bestaat
 * bit-gelijk blijft.
 */
function knoopLijnenBuitenTol(lo: number, hi: number, openingLijnen: number[], knoopLijnen: number[] | undefined): number[] {
  const TOL = 1;
  const genomen = [lo, hi, ...openingLijnen];
  const uit: number[] = [];
  for (const v of [...(knoopLijnen ?? [])].sort((a, b) => a - b)) {
    if (genomen.some((w) => Math.abs(w - v) <= TOL && w !== v)) continue;
    genomen.push(v);
    uit.push(v);
  }
  return uit;
}

/** Asgelijnde bbox van een polygoon. */
function bbox(p: PlatMeshPunt[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = p.map((q) => q.x), zs = p.map((q) => q.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Rastermesh met de vier benoemde zijden erbij (voor het rechthoekpad van de engine). */
export interface RasterMesh extends PlatMesh {
  /** Gridlijnen (mm) in x en z — ook de splitsposities van randstaven. */
  xs: number[];
  zs: number[];
  /**
   * De vier zijden van de rechthoek als puntindices: onder en boven van
   * links naar rechts, links en rechts van onder naar boven — dezelfde
   * telrichting als `bepaalPlaatRand` voor een benoemde rand.
   */
  randen: { bottom: number[]; top: number[]; left: number[]; right: number[] };
}

/**
 * Gestructureerd rekenmesh van een asgelijnde rechthoek met asgelijnde
 * rechthoekige openingen. Elementvolgorde: rij voor rij van onder naar boven,
 * binnen een rij van links naar rechts (zoals het oude rechthoekgrid).
 * Vierhoek: [linksonder, rechtsonder, rechtsboven, linksboven] (tegen de
 * klok). Driehoeken per vak: [LO, RO, RB] en [LO, RB, LB].
 *
 * De openingen moeten vooraf gekeurd zijn (`valideerPlaatOpeningen` in
 * femTypes): binnen de omtrek, los van elkaar en van de rand.
 */
export function genereerRasterMesh(inv: RasterMeshInvoer): RasterMesh {
  const { minX, maxX, minZ, maxZ, meshSize, meshType } = inv;
  const openingRects = inv.openingen.map(bbox);
  const openingX = openingRects.flatMap((r) => [r.minX, r.maxX]);
  const openingZ = openingRects.flatMap((r) => [r.minZ, r.maxZ]);
  const xs = rasterLijnen(minX, maxX, [...openingX, ...knoopLijnenBuitenTol(minX, maxX, openingX, inv.dwingendX)], meshSize);
  const zs = rasterLijnen(minZ, maxZ, [...openingZ, ...knoopLijnenBuitenTol(minZ, maxZ, openingZ, inv.dwingendZ)], meshSize);
  const nx = xs.length - 1, nz = zs.length - 1;

  // Welke vakken bestaan: het midden van het vak mag in geen opening liggen.
  // De openingsranden zijn gridlijnen, dus een vak ligt óf helemaal binnen
  // óf helemaal buiten een opening.
  const vakBestaat = (i: number, j: number): boolean => {
    const xc = (xs[i] + xs[i + 1]) / 2, zc = (zs[j] + zs[j + 1]) / 2;
    return !openingRects.some((r) => xc > r.minX && xc < r.maxX && zc > r.minZ && zc < r.maxZ);
  };

  // Alleen knopen die aan minstens één vak hangen; genummerd rij voor rij.
  const points: PlatMeshPunt[] = [];
  const index = new Map<number, number>(); // j*(nx+1)+i → puntindex
  const sleutel = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const gebruikt =
        (i > 0 && j > 0 && vakBestaat(i - 1, j - 1)) ||
        (i < nx && j > 0 && vakBestaat(i, j - 1)) ||
        (i > 0 && j < nz && vakBestaat(i - 1, j)) ||
        (i < nx && j < nz && vakBestaat(i, j));
      if (!gebruikt) continue;
      index.set(sleutel(i, j), points.length);
      points.push({ x: xs[i], z: zs[j] });
    }
  }
  const idx = (i: number, j: number): number => {
    const v = index.get(sleutel(i, j));
    if (v === undefined) throw new Error(`rastermesh: knoop (${i}, ${j}) ontbreekt`);
    return v;
  };

  const triangles: [number, number, number][] = [];
  const quads: [number, number, number, number][] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!vakBestaat(i, j)) continue;
      const lo = idx(i, j), ro = idx(i + 1, j), rb = idx(i + 1, j + 1), lb = idx(i, j + 1);
      if (meshType === 'vierhoeken') quads.push([lo, ro, rb, lb]);
      else triangles.push([lo, ro, rb], [lo, rb, lb]);
    }
  }

  const bottom: number[] = [], top: number[] = [], left: number[] = [], right: number[] = [];
  for (let i = 0; i <= nx; i++) { bottom.push(idx(i, 0)); top.push(idx(i, nz)); }
  for (let j = 0; j <= nz; j++) { left.push(idx(0, j)); right.push(idx(nx, j)); }

  // Openingsranden: per rand van de opening (in de volgorde van de gebruiker)
  // de gridknopen erop, van hoek tot hoek.
  const openingEdgeNodeIndices = inv.openingen.map((op) =>
    op.map((a, k) => zoekPuntenOpLijnstuk(points, a, op[(k + 1) % op.length], 1e-6)));

  return {
    points, triangles, quads,
    // Omtrekranden per hoekpaar vult de engine zelf in uit `randen`, want die
    // kent de hoekvolgorde van de gebruiker; hier alleen de benoemde zijden.
    edgeNodeIndices: [],
    openingEdgeNodeIndices,
    meshSoort: meshType,
    xs, zs,
    randen: { bottom, top, left, right },
  };
}

// ── Driehoeken koppelen tot vierhoeken (CDT-pad) ─────────────────────────────

/**
 * Koppelt aangrenzende driehoeken tot vierhoeken (gretig op kwaliteit, zie
 * TriToQuad). Wat overblijft, blijft driehoek — de uitkomst is dan een
 * "gemengd" net. Er komen géén knopen bij, dus de randlijsten van het
 * driehoeksmesh blijven geldig. Elke gevormde vierhoek is convex en tegen de
 * klok in (TriToQuad keurt dat; `keurPlatMesh` controleert het nogmaals).
 */
export function koppelTotVierhoeken(
  points: PlatMeshPunt[], triangles: [number, number, number][],
): { triangles: [number, number, number][]; quads: [number, number, number, number][]; meshSoort: PlaatMeshSoort } {
  const r = pairTrianglesToQuads({
    points: points.map((p) => ({ x: p.x, y: p.z })),
    triangles,
  });
  const meshSoort: PlaatMeshSoort =
    r.quads.length === 0 ? 'driehoeken' : r.remainingTriangles.length === 0 ? 'vierhoeken' : 'gemengd';
  return { triangles: r.remainingTriangles, quads: r.quads, meshSoort };
}

/** Splits vierhoeken langs de diagonaal 0–2 in twee driehoeken (voor vergelijkingen en tests). */
export function splitsVierhoekenInDriehoeken(
  quads: [number, number, number, number][],
): [number, number, number][] {
  const uit: [number, number, number][] = [];
  for (const [a, b, c, d] of quads) uit.push([a, b, c], [a, c, d]);
  return uit;
}

// ── Keuring van een plat mesh ────────────────────────────────────────────────

export interface PlatMeshKeuring {
  /** De elementen, met de hoekvolgorde genormaliseerd naar tegen de klok in. */
  triangles: [number, number, number][];
  quads: [number, number, number, number][];
  meshSoort: PlaatMeshSoort;
}

/**
 * Keur een plat mesh en normaliseer de omloopzin. Gooit een Error met een
 * Nederlandse reden bij elke fout; de aanroeper zet er "Plaat N: de meshcache
 * is beschadigd — …" omheen.
 *
 * Regels:
 *  - elk element verwijst naar bestaande punten, zonder dubbele hoekpunten;
 *  - een driehoek heeft echte oppervlakte; de omloopzin wordt tegen de klok
 *    in gezet (een spiegelbeeld is hetzelfde element, geen fout);
 *  - een vierhoek is strikt convex (alle vier de kruisproducten hetzelfde
 *    teken en geen nul): dan is de Jacobiaan van Quad4 overal positief. Een
 *    niet-convexe of gedegenereerde vierhoek geeft in de kern een negatieve
 *    Jacobiaan en wordt hier geweigerd;
 *  - er is minstens één element.
 */
export function keurPlatMesh(
  points: PlatMeshPunt[],
  triangles: unknown,
  quads: unknown,
): PlatMeshKeuring {
  const n = points.length;
  if (n < 3) throw new Error('het mesh heeft minder dan drie punten');
  const geldigeIndex = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;

  const tris: [number, number, number][] = [];
  if (triangles !== undefined) {
    if (!Array.isArray(triangles)) throw new Error('`triangles` is geen lijst');
    triangles.forEach((t, k) => {
      if (!Array.isArray(t) || t.length !== 3 || !t.every(geldigeIndex)) {
        throw new Error(`driehoek ${k + 1} verwijst naar punten die niet bestaan`);
      }
      const [a, b, c] = t as [number, number, number];
      if (a === b || b === c || a === c) throw new Error(`driehoek ${k + 1} heeft twee gelijke hoekpunten`);
      const opp2 = getekendeOppervlakte2([points[a], points[b], points[c]]);
      if (Math.abs(opp2) < 1e-9) throw new Error(`driehoek ${k + 1} heeft geen oppervlakte`);
      tris.push(opp2 > 0 ? [a, b, c] : [a, c, b]);
    });
  }

  const qs: [number, number, number, number][] = [];
  if (quads !== undefined) {
    if (!Array.isArray(quads)) throw new Error('`quads` is geen lijst');
    quads.forEach((q, k) => {
      if (!Array.isArray(q) || q.length !== 4 || !q.every(geldigeIndex)) {
        throw new Error(`vierhoek ${k + 1} verwijst naar punten die niet bestaan`);
      }
      const ids = q as [number, number, number, number];
      if (new Set(ids).size !== 4) throw new Error(`vierhoek ${k + 1} heeft twee gelijke hoekpunten`);
      const p = ids.map((i) => points[i]);
      let pos = 0, neg = 0;
      for (let i = 0; i < 4; i++) {
        const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
        const kr = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (kr > 1e-9) pos++;
        else if (kr < -1e-9) neg++;
      }
      if (pos + neg < 4 || (pos > 0 && neg > 0)) {
        throw new Error(
          `vierhoek ${k + 1} is niet convex of gedegenereerd (de Jacobiaan van het ` +
          'Quad4-element wordt dan negatief)');
      }
      qs.push(neg === 4 ? [ids[0], ids[3], ids[2], ids[1]] : ids);
    });
  }

  if (tris.length + qs.length === 0) throw new Error('het mesh bevat geen elementen');
  const meshSoort: PlaatMeshSoort =
    qs.length === 0 ? 'driehoeken' : tris.length === 0 ? 'vierhoeken' : 'gemengd';
  return { triangles: tris, quads: qs, meshSoort };
}

/**
 * Keur een randknopenlijst: minstens de twee hoeken, alle punten óp de rand
 * a→b (afstand ≤ tol) en de lijst reikt van hoek tot hoek. Gooit bij een
 * fout; `wat` noemt de rand in de melding ("rand 2", "rand 1 van opening 3").
 */
export function keurRandKnopen(
  points: PlatMeshPunt[], rand: unknown, a: PlatMeshPunt, b: PlatMeshPunt, tolMm: number, wat: string,
): void {
  const n = points.length;
  if (!Array.isArray(rand) || rand.length < 2
      || !rand.every((k) => Number.isInteger(k) && k >= 0 && k < n)) {
    throw new Error(`${wat} heeft geen geldige lijst randknopen (minstens de twee hoeken)`);
  }
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  let tMin = Infinity, tMax = -Infinity;
  for (const k of rand as number[]) {
    const q = points[k];
    const t = ((q.x - a.x) * (b.x - a.x) + (q.z - a.z) * (b.z - a.z)) / L;
    const d = Math.abs((q.x - a.x) * (b.z - a.z) - (q.z - a.z) * (b.x - a.x)) / L;
    if (!(d <= tolMm) || t < -tolMm || t > L + tolMm) {
      throw new Error(`punt ${k} van ${wat} ligt niet op die rand`);
    }
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  if (tMin > tolMm || tMax < L - tolMm) {
    throw new Error(`de randknopen van ${wat} reiken niet van hoek tot hoek`);
  }
}
