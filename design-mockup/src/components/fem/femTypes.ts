/**
 * Shared types for the FEM v2 app.
 *
 * Centralised here so the lifted state in App.tsx can be consumed by
 * FemCanvas (controlled rendering), FemProjectTree (live counts/leaves)
 * and FemProperties (reactive details) without circular imports.
 */

export type Tool =
  | "select"
  | "addNode"
  | "addBeam"
  | "addSubNode"
  | "addPlate"
  | "addPinned"
  | "addFixed"
  | "addXRoller"
  | "addZRoller"
  | "addZSpring"
  | "addXSpring"
  | "addRotSpring"
  | "addPointLoad"          // verticale puntlast (default Fz)
  | "addPointLoadH"         // horizontale puntlast (default Fx, voor o.a. wind)
  | "addMoment"
  | "addLineLoad"
  | "addThermal"
  | "move"
  | "copy"
  | "rotate"
  | "mirror";

export interface Node {
  id: number;
  x: number; // model coords (mm)
  z: number;
}

/** Per-DOF release flags — `true` = vrijheidsgraad ontkoppeld (scharnier). */
export interface BeamReleases {
  startTx?: boolean;
  startTz?: boolean;
  startRy?: boolean;
  endTx?: boolean;
  endTz?: boolean;
  endRy?: boolean;
}

/**
 * Per-staaf toetsconfiguratie voor de normtoetsing (EN 1993 staal /
 * EN 1995 hout). Alle velden zijn optioneel: een ontbrekend veld betekent
 * "gebruik de gedocumenteerde default van de builder" (zie
 * steelCheckBuilder.ts / timberCheckBuilder.ts). De enum-vormen hier zijn
 * UI-vriendelijk; de builders mappen ze 1-op-1 op de ts-rs-typen die de
 * Rust-kern verwacht (DeflectionClass, ServiceClass, LoadDurationClass).
 */
export interface BeamCheckConfig {
  // Staal (EN 1993)
  /** Kniklengte sterke as in m; default: systeemlengte. */
  bucklingLengthY_m?: number;
  /** Kniklengte zwakke as in m; default: systeemlengte. */
  bucklingLengthZ_m?: number;
  /**
   * Kipsteunposities BOVENFLENS als fractie 0..1 van de staaflengte —
   * zelfde conventie als LateralBracing.top_flange_positions in de
   * Rust-kern (lambda_chi.rs vermenigvuldigt met de staaflengte).
   */
  lateralRestraints?: number[];
  /**
   * Kipsteunposities ONDERFLENS, zelfde conventie
   * (LateralBracing.bottom_flange_positions in de Rust-kern). Relevant waar
   * het moment de onderflens op druk zet, bijvoorbeeld boven een
   * tussensteunpunt van een doorgaande ligger.
   */
  lateralRestraintsBottom?: number[];
  // Doorbuiging (beide normen)
  /** Doorbuigingsklasse; default "floor". */
  deflectionClass?: "floor" | "roof" | "cantilever" | "custom";
  /** Bij deflectionClass "custom": de n in L/n. */
  deflectionLimitNumerator?: number;
  /** Zeeg (pre-camber) in mm, zelfde tekenconventie als de zakking
   *  (negatief = omlaag). Alleen door de staalkern geconsumeerd. */
  preCamber_mm?: number;
  // Hout (EN 1995)
  /** Klimaatklasse §2.3.1.3; default 1. */
  serviceClass?: 1 | 2 | 3;
  /** Belastingduurklasse §2.3.1.2; default "medium" (middellang). */
  loadDuration?: "permanent" | "long" | "medium" | "short" | "instantaneous";
}

/**
 * BELASTINGTYPE (constructieve rol) van een staaf — wát het onderdeel in de
 * constructie ís, en dus welk belastingvlak het draagt. De windgenerator
 * leest deze rol om te bepalen welke vormfactor en welke referentiehoogte bij
 * een staaf horen; zonder rol weet de generator niet of een verticale staaf
 * een gevelstijl is of een binnenkolom.
 *
 * De lijst is bewust fijn: de vormfactor van een LINKERgevel bij wind van
 * links (druk, zone D) verschilt van diezelfde gevel bij wind van rechts
 * (zuiging, zone E). Zie NEN-EN 1991-1-4 tabel 7.1.
 *
 * Uitbreidbaar: nieuwe rollen kunnen aan deze unie worden toegevoegd; de
 * generator negeert rollen die hij niet kent en meldt dat.
 */
export type BeamLoadRole =
  /** Linker (langs)gevel — verticaal buitenvlak aan de linkerzijde. */
  | "gevelLinks"
  /** Rechter (langs)gevel — verticaal buitenvlak aan de rechterzijde. */
  | "gevelRechts"
  /** Plat dak (dakhelling ≤ 5°) — NEN-EN 1991-1-4 §7.2.3. */
  | "dakPlat"
  /** Hellend dakvlak (dakhelling > 5°) — NEN-EN 1991-1-4 §7.2.5. */
  | "dakHellend"
  /** Dakoverstek / luifel — wind werkt op boven- én onderzijde (§7.2.6). */
  | "overstek"
  /** Vloer- of verdiepingsbalk — draagt vloerbelasting, geen windvlak. */
  | "vloer"
  /** Binnenstaaf (binnenkolom, schoor, trekband) — draagt geen windvlak. */
  | "binnen";

/** Volgorde + NL-labels van de belastingtypen, voor dropdowns en tabellen. */
export const BEAM_LOAD_ROLES: { id: BeamLoadRole; label: string; kort: string }[] = [
  { id: "gevelLinks",  label: "Linkergevel",          kort: "Gevel L" },
  { id: "gevelRechts", label: "Rechtergevel",         kort: "Gevel R" },
  { id: "dakPlat",     label: "Plat dak (≤ 5°)",      kort: "Dak plat" },
  { id: "dakHellend",  label: "Hellend dak (> 5°)",   kort: "Dak hellend" },
  { id: "overstek",    label: "Overstek / luifel",    kort: "Overstek" },
  { id: "vloer",       label: "Vloer",                kort: "Vloer" },
  { id: "binnen",      label: "Binnenstaaf (geen windvlak)", kort: "Binnen" },
];

export const BEAM_LOAD_ROLE_LABEL: Record<BeamLoadRole, string> =
  Object.fromEntries(BEAM_LOAD_ROLES.map((r) => [r.id, r.label])) as Record<BeamLoadRole, string>;

export interface Beam {
  id: number;
  from: number; // node id
  to: number;
  /** Material name (default: "S235" for steel). */
  material?: string;
  /** Profile name (default: "HEA160"). */
  profile?: string;
  /** DOF releases per end (default: all rigid = no releases). */
  releases?: BeamReleases;
  /** Per-staaf toetsconfiguratie; ontbreekt → builder-defaults. */
  checkConfig?: BeamCheckConfig;
  /**
   * Belastingtype (constructieve rol) van deze staaf. ONTBREEKT het veld —
   * alle bestaande projectbestanden — dan geldt de uit de geometrie afgeleide
   * standaardrol (zie `bepaalStandaardRol`); de gebruiker kan die altijd
   * overschrijven, en dan staat de keuze hier vast in het projectbestand.
   */
  loadRole?: BeamLoadRole;
}

/**
 * Standaard-belastingtype uit de geometrie: een (vrijwel) verticale staaf aan
 * de buitenrand is een gevel, de bovenste (vrijwel) horizontale of hellende
 * staven vormen het dak, overige horizontale staven zijn vloer en de rest is
 * binnenstaaf. Dit is een HULP, geen waarheid — de gebruiker overschrijft de
 * rol per staaf in de eigenschappen of in de tabel.
 *
 * Pure functie (geen React/DOM) zodat de generator én de tests hem delen.
 */
export function bepaalStandaardRol(
  beam: { from: number; to: number },
  nodes: { id: number; x: number; z: number }[],
): BeamLoadRole {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b || nodes.length === 0) return "binnen";
  const xs = nodes.map((n) => n.x), zs = nodes.map((n) => n.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-9) return "binnen";
  // Hellingshoek t.o.v. horizontaal, 0°..90°.
  const helling = Math.abs(Math.atan2(Math.abs(dz), Math.abs(dx)) * 180 / Math.PI);
  // Tolerantie voor "op de rand" / "aan de bovenkant": 2% van de omhullende
  // maat, met een ondergrens van 1 mm zodat degeneraties niet exploderen.
  const tolX = Math.max(1, (maxX - minX) * 0.02);
  const tolZ = Math.max(1, (maxZ - minZ) * 0.02);

  if (helling >= 75) {
    // Vrijwel verticaal → gevelstijl als hij op de linker- of rechterrand
    // van het model staat, anders een binnenkolom.
    const xMid = (a.x + b.x) / 2;
    if (Math.abs(xMid - minX) <= tolX) return "gevelLinks";
    if (Math.abs(xMid - maxX) <= tolX) return "gevelRechts";
    return "binnen";
  }
  // Niet verticaal → dak wanneer de staaf tot de bovenste rand van het model
  // behoort (minstens één uiteinde op de nok-/dakrandhoogte).
  const opDakhoogte = Math.abs(Math.max(a.z, b.z) - maxZ) <= tolZ;
  if (opDakhoogte) return helling <= 5 ? "dakPlat" : "dakHellend";
  return helling <= 5 ? "vloer" : "binnen";
}

/** Rol van een staaf: expliciet gezet, of anders afgeleid uit de geometrie. */
export function rolVanStaaf(
  beam: Beam,
  nodes: { id: number; x: number; z: number }[],
): BeamLoadRole {
  return beam.loadRole ?? bepaalStandaardRol(beam, nodes);
}

/**
 * Gecachet CDT-rekenmesh van een polygonplaat (P4.2). De CDT (triangle-wasm)
 * is async én tussen versies niet bit-identiek; daarom wordt het mesh bij
 * aanmaken/wijzigen van de plaat gegenereerd, hier als platte data op de
 * Plate gecachet en mee-geserialiseerd in het projectbestand (optioneel
 * veld — oude bestanden laden ongewijzigd). De solve blijft synchroon en
 * gebruikt uitsluitend deze cache.
 */
export interface PlaatMeshCache {
  /**
   * Handtekening van de geometrie (hoekcoördinaten in mm) + meshSize
   * waarvoor deze cache geldt — zie berekenPlaatMeshSignatuur. Wijkt de
   * actuele geometrie/meshSize af, dan is de cache verouderd: het canvas
   * regenereert en de engine weigert met een NL-melding.
   */
  signature: string;
  /** Meshknopen in modelcoördinaten (mm; z omhoog, zoals Node). */
  points: { x: number; z: number }[];
  /** CST-driehoeken als drietallen puntindices (0-based in `points`). */
  triangles: [number, number, number][];
  /**
   * Per polygonrand (index i = rand van hoek i naar hoek i+1, cyclisch):
   * de puntindices van de meshknopen op die rand, geordend langs de rand.
   * Gebruikt voor randlasten via rand-index (P4.3).
   */
  edgeNodeIndices: number[][];
}

export interface Plate {
  id: number;
  /**
   * Hoekknopen in klikvolgorde. Een asgelijnde rechthoek (4 hoeken, zie
   * isAsgelijndeRechthoek) rekent via het deterministische quad-grid; elke
   * andere geldige polygoon (n ≥ 3 hoeken, P4.2) via de CDT-cache hieronder.
   */
  nodeIds: number[];
  // Rekenvelden (P2.1) — optioneel zodat oude projectbestanden zonder deze
  // velden blijven laden; ontbrekende velden krijgen de PLATE_DEFAULTS.
  /** Plaatdikte in mm (default 20). */
  thickness?: number;
  /** Elasticiteitsmodulus in N/mm² (default 210000 — staal). */
  E?: number;
  /** Dwarscontractiecoëfficiënt ν (default 0,3). */
  nu?: number;
  /** Volumieke massa in kg/m³ (default 7850 — staal), voor eigengewicht. */
  rho?: number;
  /** Gewenste elementgrootte van het rekenmesh in mm (default 500). */
  meshSize?: number;
  /**
   * CDT-meshcache (alleen polygonplaten, P4.2). Reist automatisch mee met
   * de plates-array in projectbestand én undo-history; wordt door het
   * canvas (re)gegenereerd wanneer de signature niet meer klopt.
   */
  meshCache?: PlaatMeshCache;
}

/** Defaults voor de optionele rekenvelden van een plaat (staal, 20 mm). */
export const PLATE_DEFAULTS = {
  thickness: 20,     // mm
  E: 210000,         // N/mm²
  nu: 0.3,           // —
  rho: 7850,         // kg/m³
  meshSize: 500,     // mm
} as const;

/**
 * Vul ontbrekende plaat-rekenvelden aan met de defaults. Gebruikt bij het
 * laden van (oude) projectbestanden; `addPlate` in de store zet de defaults
 * al bij aanmaken.
 */
export function withPlateDefaults(p: Plate): Plate {
  return {
    ...p,
    thickness: p.thickness ?? PLATE_DEFAULTS.thickness,
    E: p.E ?? PLATE_DEFAULTS.E,
    nu: p.nu ?? PLATE_DEFAULTS.nu,
    rho: p.rho ?? PLATE_DEFAULTS.rho,
    meshSize: p.meshSize ?? PLATE_DEFAULTS.meshSize,
  };
}

// ── Plaatgeometrie: rechthoek-/polygonclassificatie en -validatie (P4) ─────
// Pure functies (unit-testbaar, geen React/DOM) — gedeeld door de tekentool
// (FemCanvas), de engine-adapter (solver/engine.ts) en de tests.

/** Punt in modelcoördinaten (mm; z omhoog) — de vorm van een plaathoek. */
export interface PlaatPunt { x: number; z: number }

/**
 * Is dit vierpuntenstel een asgelijnde rechthoek (binnen `tolMm`)? Zelfde
 * bezettingsregel als de P2.2-adaptervalidatie: elk van de vier
 * (minX/maxX)×(minZ/maxZ)-hoeken moet door precies één punt bezet zijn, en
 * de rechthoek moet echte afmetingen hebben. Bepaalt de splitsing tussen het
 * deterministische quad-grid-pad (rechthoek) en het CDT-polygonpad (P4.2).
 */
export function isAsgelijndeRechthoek(punten: PlaatPunt[], tolMm = 1): boolean {
  if (punten.length !== 4) return false;
  const xs = punten.map((p) => p.x), zs = punten.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  if (maxX - minX < tolMm || maxZ - minZ < tolMm) return false;
  const doelen: [number, number][] = [
    [minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ],
  ];
  const bezet = [false, false, false, false];
  for (const p of punten) {
    const hit = doelen.findIndex(([tx, tz], i) =>
      !bezet[i] && Math.abs(p.x - tx) <= tolMm && Math.abs(p.z - tz) <= tolMm);
    if (hit < 0) return false;
    bezet[hit] = true;
  }
  return true;
}

/** Kruisproduct (b−a)×(c−a) — teken = oriëntatie van c t.o.v. lijn a→b. */
function kruis(a: PlaatPunt, b: PlaatPunt, c: PlaatPunt): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

/** Snijden de open segmenten a–b en c–d elkaar (echte kruising)? */
function segmentenSnijden(a: PlaatPunt, b: PlaatPunt, c: PlaatPunt, d: PlaatPunt): boolean {
  const d1 = kruis(c, d, a);
  const d2 = kruis(c, d, b);
  const d3 = kruis(a, b, c);
  const d4 = kruis(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // Collineaire overlap: projectie-intervallen op de dominante as overlappen.
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
    const horizontaal = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
    const key = horizontaal ? "x" as const : "z" as const;
    const lo1 = Math.min(a[key], b[key]), hi1 = Math.max(a[key], b[key]);
    const lo2 = Math.min(c[key], d[key]), hi2 = Math.max(c[key], d[key]);
    return Math.max(lo1, lo2) < Math.min(hi1, hi2);
  }
  return false;
}

/**
 * Validatie van een plaatpolygoon (P4.3, pure functie): minstens 3 hoeken,
 * geen (vrijwel) samenvallende hoeken, geen terugvouwende rand (spike),
 * echte oppervlakte en geen zelfsnijding (vlinder). Retourneert een
 * NL-foutmelding, of null wanneer de vorm geldig is. Beide windingsrichtingen
 * (met/tegen de klok) zijn toegestaan — spiegelen mag.
 */
export function valideerPlaatPolygoon(punten: PlaatPunt[], tolMm = 1): string | null {
  const n = punten.length;
  if (n < 3) return "Een plaat heeft minstens drie hoeken nodig.";
  // Dubbele (samenvallende) hoeken — ook niet-aangrenzende.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(punten[i].x - punten[j].x) <= tolMm &&
          Math.abs(punten[i].z - punten[j].z) <= tolMm) {
        return `Hoek ${i + 1} en hoek ${j + 1} vallen (vrijwel) samen — kies verschillende hoekpunten.`;
      }
    }
  }
  // Zelfsnijding (vlinder) VÓÓR de oppervlaktecheck: bij een symmetrische
  // vlinder heffen de shoelace-lobben elkaar op (netto oppervlakte ≈ 0) en
  // zou de oppervlaktemelding de échte oorzaak maskeren.
  for (let i = 0; i < n; i++) {
    const a = punten[i], b = punten[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Aangrenzende randen (delen een hoek) overslaan.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = punten[j], d = punten[(j + 1) % n];
      if (segmentenSnijden(a, b, c, d)) {
        return `De omtrek snijdt zichzelf (rand ${i + 1} kruist rand ${j + 1}) — teken een enkelvoudige polygoon.`;
      }
    }
  }
  // Oppervlakte (shoelace): collineaire hoekensets en slivers weigeren.
  let opp2 = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    opp2 += punten[j].x * punten[i].z - punten[i].x * punten[j].z;
  }
  if (Math.abs(opp2) / 2 < 1000) { // < 1000 mm² is voor een constructie-schijf degeneraat
    return "De hoeken liggen (vrijwel) op één lijn — de plaat heeft geen oppervlakte.";
  }
  // Terugvouwende rand (spike): aangrenzende randen collineair én dezelfde
  // kant op (de omtrek loopt uit en over dezelfde lijn terug).
  for (let i = 0; i < n; i++) {
    const p0 = punten[(i + n - 1) % n], p1 = punten[i], p2 = punten[(i + 1) % n];
    const cr = kruis(p1, p0, p2);
    const dot = (p0.x - p1.x) * (p2.x - p1.x) + (p0.z - p1.z) * (p2.z - p1.z);
    const l1 = Math.hypot(p0.x - p1.x, p0.z - p1.z);
    const l2 = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (l1 > 0 && l2 > 0 && Math.abs(cr) <= tolMm * Math.max(l1, l2) && dot > 0) {
      return `De rand vouwt bij hoek ${i + 1} op zichzelf terug — teken een echte omtrek.`;
    }
  }
  return null;
}

/**
 * Handtekening van plaatgeometrie + meshSize voor de CDT-cache (P4.2).
 * Elke wijziging van een hoekcoördinaat of de meshSize verandert de string
 * en invalideert daarmee de cache; materiaal-/diktewijzigingen bewust níét
 * (die staan los van de meshgeometrie).
 */
export function berekenPlaatMeshSignatuur(punten: PlaatPunt[], meshSizeMm: number): string {
  return `m${meshSizeMm}|${punten.map((p) => `${p.x},${p.z}`).join(";")}`;
}

// ── Doorgeefluik plaat-solvegegevens (P4.2/P4.3) ───────────────────────────
// De multi-LC-invoer wordt in App.tsx veld-voor-veld opgebouwd en kent de
// CDT-cache en de rand-index van polygonrandlasten (nog) niet; App.tsx valt
// buiten deze fase. De store registreert daarom beide hier (module-globaal),
// en de engine-adapter leest ze als fallback wanneer de invoer ze niet
// draagt. De cache wordt bij het lezen ALTIJD tegen de actuele
// geometrie-signatuur gevalideerd, dus een verouderde registratie kan nooit
// stil verkeerde resultaten geven.

/** Randlast op een polygonrand zoals de store hem registreert. */
export interface PolygoonRandlast {
  plateId: number;
  /** Rand-index: rand van hoek i naar hoek i+1 (cyclisch, 0-based). */
  edgeIndex: number;
  /** Lastgrootte in kN/m (= N/mm), zelfde tekenconventie als Load.q. */
  p: number;
  /** Richting in globale assen: "z" verticaal, "x" horizontaal. */
  dir: "x" | "z";
  caseId: number;
}

const meshCacheRegister = new Map<number, PlaatMeshCache>();
let polygoonRandlastRegister: PolygoonRandlast[] = [];

/** Vervang de volledige meshcache-registratie (store-sync op `plates`). */
export function registreerPlaatMeshCaches(perPlaat: Iterable<[number, PlaatMeshCache]>): void {
  meshCacheRegister.clear();
  for (const [plateId, cache] of perPlaat) meshCacheRegister.set(plateId, cache);
}

/** Cache van één plaat (engine-fallback; signatuurvalidatie doet de lezer). */
export function leesPlaatMeshCache(plateId: number): PlaatMeshCache | undefined {
  return meshCacheRegister.get(plateId);
}

/** Vervang de volledige polygonrandlast-registratie (store-sync op `loads`). */
export function registreerPolygoonRandlasten(lasten: PolygoonRandlast[]): void {
  polygoonRandlastRegister = [...lasten];
}

/** Alle geregistreerde polygonrandlasten van één plaat. */
export function leesPolygoonRandlasten(plateId: number): PolygoonRandlast[] {
  return polygoonRandlastRegister.filter((l) => l.plateId === plateId);
}

// Terugkanaal voor mesh-REGENERATIE (P4.2): het canvas regenereert de CDT-
// cache bij een geometrie-/meshSize-wijziging, maar krijgt van App.tsx geen
// store-mutator daarvoor aangereikt (App.tsx valt buiten deze fase). De
// store registreert daarom zijn setPlateMeshCache hier; het canvas commit er
// doorheen. Bij het AANMAKEN van een polygonplaat is dit niet nodig — daar
// gaat de cache direct met addPlate mee.
let meshCacheCommitter: ((plateId: number, cache: PlaatMeshCache | undefined) => void) | null = null;

/** Store-registratie van de meshcache-mutator (useFemStore, éénmalig per mount). */
export function registreerPlaatMeshCacheCommitter(
  fn: ((plateId: number, cache: PlaatMeshCache | undefined) => void) | null,
): void {
  meshCacheCommitter = fn;
}

/** Commit een geregenereerde meshcache naar de store (no-op zonder store). */
export function commitPlaatMeshCache(plateId: number, cache: PlaatMeshCache | undefined): void {
  meshCacheCommitter?.(plateId, cache);
}

export type SupportType =
  | "pinned"
  | "fixed"
  | "xRoller"
  | "zRoller"
  | "zSpring"
  | "xSpring"
  | "rotSpring";

export interface Support {
  nodeId: number;
  type: SupportType;
  /** Spring stiffness (kN/mm for translational, kNm/rad for rot). */
  k?: number;
}

export type LoadType = "pointForce" | "pointMoment" | "lineLoad" | "thermal" | "edgeLoad";

export interface Load {
  id: number;
  type: LoadType;
  caseId: number;
  /** node target for pointForce / pointMoment */
  nodeId?: number;
  fx?: number; // kN
  fz?: number; // kN
  my?: number; // kNm
  /** beam target for lineLoad / thermal — én voor een STAAFGEBONDEN puntlast
   *  (pointForce met `posFrac`, zie hieronder). */
  beamId?: number;
  /**
   * Puntlast op een VRIJE POSITIE op een staaf: positie als FRACTIE 0..1 van
   * de staaflengte, gemeten vanaf de startknoop (`Beam.from`) — dezelfde
   * conventie als de deellast-fracties startFrac/endFrac. Aanwezig ⇒ de last
   * is staafgebonden (`beamId` gezet, `nodeId` leeg); ontbreekt het veld
   * (alle bestaande projectbestanden) dan is het gedrag ongewijzigd: de
   * puntlast hangt aan `nodeId`. posFrac 0 of 1 valt exact samen met de
   * start- respectievelijk eindknoop en levert hetzelfde resultaat als een
   * knooplast daar.
   *
   * Rekenroute: de engine-adapter SPLITST de staaf op deze fractie (dezelfde
   * mechaniek als het splitsen op plaatrandknopen, P2.4) en zet de kracht op
   * de tussenknoop — exact, inclusief de sprong in V en de knik in M op de
   * lastpositie. Zie solver/engine.ts.
   */
  posFrac?: number;
  q?: number; // kN/m (uniform)
  qStart?: number;
  qEnd?: number;
  /** Direction of the line load in GLOBAL axes. Default "z" = vertical (gravity-style).
   *  "x" = horizontal (wind-style). Affects projection to local-axial + local-transverse. */
  qDir?: "x" | "z";
  /**
   * Assenstelsel van de lijnlast. Default (en ontbrekend veld, dus ook alle
   * oude projectbestanden) = "global" — het bestaande gedrag.
   *
   * SEMANTIEK — q is ALTIJD in kN per meter STAAFLENGTE:
   *  - "global" + qDir "z": verticaal in wereldassen (negatief = omlaag,
   *    gravitatie — het huidige rekengedrag);
   *  - "global" + qDir "x": horizontaal in wereldassen (wind-stijl);
   *  - "local"  + qDir "z": loodrecht op de staafas (lokale z; positief =
   *    lokale +y van de core: 90° CCW vanaf de as from→to — voor een
   *    horizontale staaf van links naar rechts identiek aan globaal-z);
   *  - "local"  + qDir "x": axiaal, langs de staafas (positief richting de
   *    to-knoop).
   * De adapter (solver/engine.ts) projecteert lokale lasten exact naar
   * globale componenten per staafhoek; de core rekent altijd globaal.
   */
  qCoord?: "global" | "local";
  /**
   * Deellast (partiële lijnlast): begin van het belaste deel als FRACTIE
   * 0..1 van de staaflengte, gemeten vanaf de startknoop (`Beam.from`).
   * Ontbreekt het veld (oude bestanden) dan geldt de volle lengte (0).
   * De UI voert dit in als afstand in m vanaf de startknoop en rekent om.
   * Bij een trapezium (qStart/qEnd) lopen de waarden lineair over het
   * BELASTE interval.
   */
  startFrac?: number;
  /** Deellast: einde van het belaste deel als fractie 0..1. Default 1. */
  endFrac?: number;
  deltaT?: number; // K
  /** edgeLoad (P3.3): de plaat waarvan een rand belast wordt. */
  plateId?: number;
  /**
   * edgeLoad (P3.3): de belaste rand van de asgelijnde plaat, benoemd in
   * modelassen — "bottom" = onderrand (kleinste z), "top" = bovenrand
   * (grootste z), "left"/"right" = kleinste/grootste x. Dezelfde namen als
   * de randen van het rekenmesh (PlateRegion.edges), zodat de engine 1-op-1
   * doorverwijst. De lastgrootte p staat in `q` (kN/m langs de randlengte)
   * en de richting in `qDir` (GLOBALE assen, negatief = tegen de +richting
   * in — dezelfde tekenconventie als lijnlasten).
   */
  edge?: "bottom" | "top" | "left" | "right";
  /**
   * edgeLoad op een POLYGONplaat (P4.3): rand-index in plaats van benoemde
   * rand — rand i loopt van hoek i naar hoek i+1 (cyclisch, 0-based, in de
   * klikvolgorde van Plate.nodeIds). `edge` blijft dan leeg: de vier namen
   * kunnen de n randen van een polygoon niet adresseren. Bewust een APART
   * veld (geen verbreding van `edge`): het EDGE_LABEL-Record in
   * FemProperties typografeert op de vier namen.
   */
  edgeIndex?: number;
  /**
   * Herkomst van deze last. ONTBREEKT het veld, dan is de last HANDMATIG
   * ingevoerd en raakt geen enkele generator hem aan. Staat er `"wind"`, dan
   * is de last door de windbelastinggenerator gemaakt en wordt hij bij een
   * volgende generatie vervangen. Zo blijft handwerk altijd behouden.
   */
  gegenereerdDoor?: "wind";
}

export interface LoadCase {
  id: number;
  name: string;
  type: "dead" | "live" | "snow" | "wind" | "other";
  /**
   * Herkomst van dit belastinggeval, met een STABIELE sleutel per geval
   * (bijvoorbeeld "wind:links:cpi+0.2"). De generator hergebruikt bij een
   * herhaalde generatie het id dat bij dezelfde sleutel hoort, zodat lasten,
   * combinaties en de actieve tab niet bij elke regeneratie verspringen.
   * Ontbreekt het veld → handmatig aangemaakt belastinggeval.
   */
  gegenereerd?: { bron: "wind"; sleutel: string };
}

export type Selection =
  | { type: "node"; id: number }
  | { type: "beam"; id: number }
  | { type: "plate"; id: number }
  | { type: "load"; id: number }
  | { type: "multi"; nodeIds: number[]; beamIds: number[]; plateIds: number[] }
  | null;

// ── Structural grid (stramien) ───────────────────────────────────────────
/**
 * One vertical or horizontal axis line of a structural grid (stramien).
 * Conventions:
 *  - vertical lines run top-to-bottom and are positioned by their `x` coord (mm).
 *  - horizontal lines run left-to-right and are positioned by `z` (mm).
 * Labels are typically letters (A, B, …) for x-axes and numbers (1, 2, …) for z-axes.
 */
export interface GridAxisLine {
  id: string;
  label: string;
  /** mm — x for vertical axis, z for horizontal axis */
  position: number;
}

export interface StructuralGrid {
  enabled: boolean;
  /** vertical lines, varying x */
  xAxes: GridAxisLine[];
  /** horizontal lines, varying z */
  zAxes: GridAxisLine[];
}

export const DEFAULT_STRUCTURAL_GRID: StructuralGrid = {
  enabled: true,
  xAxes: [
    { id: "A", label: "A", position: 0 },
    { id: "B", label: "B", position: 12000 },
  ],
  zAxes: [
    { id: "1", label: "1", position: 0 },
    { id: "2", label: "2", position: 5000 },
  ],
};

/** Canvas pan/zoom state. */
export interface ViewTransform {
  scale: number; // px per mm
  offsetX: number; // px
  offsetY: number; // px
}

/** Grid display settings (lifted to App.tsx so Grids dialog can mutate). */
export interface GridSettings {
  show: boolean;
  showLines: boolean;
  spacingMm: number;
}

/** Snapshot used for undo/redo. */
export interface Snapshot {
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  plates: Plate[];
  loads: Load[];
}

export const DEFAULT_VIEW: ViewTransform = {
  scale: 1 / 25,
  offsetX: 0,
  offsetY: 0,
};

export const DEFAULT_GRID: GridSettings = {
  show: true,
  showLines: true,
  spacingMm: 500,
};
