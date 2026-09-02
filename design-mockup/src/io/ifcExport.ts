/**
 * ifcExport.ts — IFC4-export van het REKENMODEL (Structural Analysis Domain).
 *
 * Schrijft een geldig STEP Physical File (ISO 10303-21, "SPF") zonder externe
 * dependencies. Geëxporteerd wordt het analytische model — knopen, staven,
 * profielen, materialen, opleggingen en lasten — níét de fysieke geometrie.
 *
 * Schema-keuzes (gedocumenteerd, zie ook het testbestand test-ifc-export.mjs):
 *  - IfcStructuralAnalysisModel met PredefinedType IN_PLANE_LOADING_2D:
 *    het rekenvlak is het globale XZ-vlak. As-conventie: model-X → IFC-X,
 *    model-Z (omhoog) → IFC-Z; alle punten krijgen Y = 0. Het
 *    OrientationOf2DPlane-assenstelsel heeft as (0,-1,0) en refrichting
 *    (1,0,0), zodat lokaal-x = globaal-X en lokaal-y = globaal-Z (omhoog).
 *  - Eenheden: SI via IfcUnitAssignment (METRE, NEWTON, PASCAL, RADIAN, …).
 *    Modelcoördinaten zijn mm → geschreven in m; krachten kN → N;
 *    lijnlasten kN/m → N/m; veerstijfheden kN/mm → N/m en kNm/rad → N·m/rad.
 *  - Knopen: IfcStructuralPointConnection met IfcVertexPoint-topologie.
 *    Opleggingen als IfcBoundaryNodeCondition op de connectie; alleen de
 *    drie in-het-vlak-vrijheidsgraden (X, Z, RY) worden gezet — star =
 *    IfcBoolean(.T.), vrij = IfcBoolean(.F.), veer = stijfheidsmaat.
 *    De drie uit-het-vlak-vrijheidsgraden blijven $ (niet gespecificeerd,
 *    want betekenisloos in een 2D-model).
 *  - Staven: IfcStructuralCurveMember (RIGID_JOINED_MEMBER) met
 *    IfcEdge-topologie en IfcRelConnectsStructuralMember naar beide knopen.
 *    Momentscharnieren (BeamReleases): een staaf met Ry-release aan BEIDE
 *    einden wordt PIN_JOINED_MEMBER; elke release wordt daarnaast altijd
 *    expliciet als IfcBoundaryNodeCondition op de eindverbinding gezet
 *    (vrijgegeven DOF = IfcBoolean(.F.)) — expliciet wint van impliciet.
 *  - Profiel + materiaal: IfcRelAssociatesMaterial →
 *    IfcMaterialProfileSetUsage → IfcMaterialProfileSet → IfcMaterialProfile
 *    met IfcMaterial (naam = klasse, bv. S235/C24) en een parametrisch
 *    profiel: I-profielen IfcIShapeProfileDef, U-profielen
 *    IfcUShapeProfileDef, kokers IfcRectangleHollowProfileDef, buizen
 *    IfcCircleHollowProfileDef (afmetingen uit de ingebedde tabel hieronder,
 *    gegenereerd uit de profieldatabase), hout-rechthoeken
 *    IfcRectangleProfileDef via parseRechthoek. Onbekende profielen: IFC4
 *    kent géén concreet "naam-zonder-geometrie"-profiel (IfcProfileDef is
 *    abstract), dus die staven krijgen alleen de IfcMaterial-koppeling; de
 *    profielnaam blijft behouden in de Description van de staaf.
 *  - Lasten: per belastinggeval een IfcStructuralLoadGroup (LOAD_CASE) +
 *    IfcRelAssignsToGroup. Puntlasten/momenten: IfcStructuralPointAction met
 *    IfcStructuralLoadSingleForce (globale assen). Uniforme lijnlasten:
 *    IfcStructuralLinearAction (CONST, TRUE_LENGTH) met
 *    IfcStructuralLoadLinearForce. Trapeziumlasten (qStart ≠ qEnd):
 *    IfcStructuralCurveAction (LINEAR) met IfcStructuralLoadConfiguration
 *    van twee waarden op posities 0 en L. Thermische lasten:
 *    IfcStructuralLinearAction met IfcStructuralLoadTemperature (ΔT
 *    constant). Globaal vs lokaal via GlobalOrLocal: een last met
 *    qCoord === "local"/"lokaal" (veld nog niet in femTypes — defensief
 *    gelezen) wordt LOCAL_COORDS, anders GLOBAL_COORDS (qDir is globaal).
 *  - GlobalId's: deterministische 22-teken IFC-GUID's, afgeleid uit een
 *    inhoudelijke seed (bv. "knoop:3") via FNV-1a — geen Math.random, zodat
 *    twee exports van hetzelfde model byte-identiek zijn.
 *  - IfcOwnerHistory wordt weggelaten ($) — optioneel in IFC4.
 *
 * Bekende beperkingen (bewust, zie rapport):
 *  - Platen (Plate) worden niet geëxporteerd (geen IfcStructuralSurfaceMember).
 *  - Eigen gewicht (selfWeight-vlag) is geen Load in het model en wordt niet
 *    als IfcStructuralLoadCase.SelfWeightCoefficients geschreven.
 *  - Deellasten over een deel van de staaf kent femTypes (nog) niet; een
 *    trapezium loopt dus altijd over de volledige staaflengte.
 */
import type {
  Node, Beam, Support, Load, LoadCase,
} from "../components/fem/femTypes";
import { parseRechthoek } from "../lib/sectionResolver";
import { SUPPORTED_TIMBER_GRADES } from "../lib/timberCheckBuilder";

// ── Invoertype ──────────────────────────────────────────────────────────────

/** Modelstate voor de export — zelfde vormen als de gelifte App-state. */
export interface IfcRekenmodelInput {
  /** Projectnaam (IfcProject.Name + bestandsnaamsuggestie). */
  projectNaam?: string;
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  loads: Load[];
  loadCases: LoadCase[];
}

export interface IfcExportOpties {
  /** Bestandsnaam in de FILE_NAME-header. Default: "<projectNaam>.ifc". */
  bestandsnaam?: string;
  /**
   * Tijdstempel in de FILE_NAME-header. Default leeg, zodat de export
   * deterministisch is (twee exports van hetzelfde model zijn identiek);
   * downloadIfc geeft hier de echte kloktijd door.
   */
  tijdstempel?: string;
}

// ── Staalprofiel-afmetingen (mm) ────────────────────────────────────────────
// GEGENEREERD uit src-tauri/crates/steel-profiles/data/profiles.json — de
// bron van waarheid die ook de Rust-toetsing gebruikt. Sleutels genormaliseerd
// zoals in sectionResolver (hoofdletters, zonder spaties/koppeltekens/punten).
// NB: bedoeld om t.z.t. vervangen te worden door een gedeelde
// src/lib/steelSectionDims.generated.ts zodra die bestaat.

type ProfielAfmeting =
  | { soort: "I" | "U"; h: number; b: number; tw: number; tf: number; r: number }
  | { soort: "koker"; h: number; b: number; t: number; r: number }
  | { soort: "buis"; d: number; t: number };

const STAALPROFIEL_AFMETINGEN: Record<string, ProfielAfmeting> = {
  "HEB160": { soort: "I", h: 160, b: 160, tw: 8, tf: 13, r: 15 },
  "HEB300": { soort: "I", h: 300, b: 300, tw: 11, tf: 19, r: 27 },
  "UNP350": { soort: "U", h: 350, b: 100, tw: 14, tf: 16, r: 16 },
  "HFRHS200X200X16": { soort: "koker", h: 200, b: 200, t: 16, r: 24 },
  "IPE80": { soort: "I", h: 80, b: 46, tw: 3.8, tf: 5.2, r: 5 },
  "IPE100": { soort: "I", h: 100, b: 55, tw: 4.1, tf: 5.7, r: 7 },
  "IPE120": { soort: "I", h: 120, b: 64, tw: 4.4, tf: 6.3, r: 7 },
  "IPE140": { soort: "I", h: 140, b: 73, tw: 4.7, tf: 6.9, r: 7 },
  "IPE160": { soort: "I", h: 160, b: 82, tw: 5, tf: 7.4, r: 9 },
  "IPE180": { soort: "I", h: 180, b: 91, tw: 5.3, tf: 8, r: 9 },
  "IPE200": { soort: "I", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
  "IPE220": { soort: "I", h: 220, b: 110, tw: 5.9, tf: 9.2, r: 12 },
  "IPE240": { soort: "I", h: 240, b: 120, tw: 6.2, tf: 9.8, r: 15 },
  "IPE270": { soort: "I", h: 270, b: 135, tw: 6.6, tf: 10.2, r: 15 },
  "IPE300": { soort: "I", h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15 },
  "IPE330": { soort: "I", h: 330, b: 160, tw: 7.5, tf: 11.5, r: 18 },
  "IPE360": { soort: "I", h: 360, b: 170, tw: 8, tf: 12.7, r: 18 },
  "IPE400": { soort: "I", h: 400, b: 180, tw: 8.6, tf: 13.5, r: 21 },
  "IPE450": { soort: "I", h: 450, b: 190, tw: 9.4, tf: 14.6, r: 21 },
  "IPE500": { soort: "I", h: 500, b: 200, tw: 10.2, tf: 16, r: 21 },
  "IPE550": { soort: "I", h: 550, b: 210, tw: 11.1, tf: 17.2, r: 24 },
  "IPE600": { soort: "I", h: 600, b: 220, tw: 12, tf: 19, r: 24 },
  "HEA100": { soort: "I", h: 96, b: 100, tw: 5, tf: 8, r: 12 },
  "HEA120": { soort: "I", h: 114, b: 120, tw: 5, tf: 8, r: 12 },
  "HEA140": { soort: "I", h: 133, b: 140, tw: 5.5, tf: 8.5, r: 12 },
  "HEA160": { soort: "I", h: 152, b: 160, tw: 6, tf: 9, r: 15 },
  "HEA180": { soort: "I", h: 171, b: 180, tw: 6, tf: 9.5, r: 15 },
  "HEA200": { soort: "I", h: 190, b: 200, tw: 6.5, tf: 10, r: 18 },
  "HEA220": { soort: "I", h: 210, b: 220, tw: 7, tf: 11, r: 18 },
  "HEA240": { soort: "I", h: 230, b: 240, tw: 7.5, tf: 12, r: 21 },
  "HEA260": { soort: "I", h: 250, b: 260, tw: 7.5, tf: 12.5, r: 24 },
  "HEA280": { soort: "I", h: 270, b: 280, tw: 8, tf: 13, r: 24 },
  "HEA300": { soort: "I", h: 290, b: 300, tw: 8.5, tf: 14, r: 27 },
  "HEA320": { soort: "I", h: 310, b: 300, tw: 9, tf: 15.5, r: 27 },
  "HEA340": { soort: "I", h: 330, b: 300, tw: 9.5, tf: 16.5, r: 27 },
  "HEA360": { soort: "I", h: 350, b: 300, tw: 10, tf: 17.5, r: 27 },
  "HEA400": { soort: "I", h: 390, b: 300, tw: 11, tf: 19, r: 27 },
  "HEB100": { soort: "I", h: 100, b: 100, tw: 6, tf: 10, r: 12 },
  "HEB120": { soort: "I", h: 120, b: 120, tw: 6.5, tf: 11, r: 12 },
  "HEB140": { soort: "I", h: 140, b: 140, tw: 7, tf: 12, r: 12 },
  "HEB180": { soort: "I", h: 180, b: 180, tw: 8.5, tf: 14, r: 15 },
  "HEB200": { soort: "I", h: 200, b: 200, tw: 9, tf: 15, r: 18 },
  "HEB220": { soort: "I", h: 220, b: 220, tw: 9.5, tf: 16, r: 18 },
  "HEB240": { soort: "I", h: 240, b: 240, tw: 10, tf: 17, r: 21 },
  "HEB260": { soort: "I", h: 260, b: 260, tw: 10, tf: 17.5, r: 24 },
  "HEB280": { soort: "I", h: 280, b: 280, tw: 10.5, tf: 18, r: 24 },
  "HEB320": { soort: "I", h: 320, b: 300, tw: 11.5, tf: 20.5, r: 27 },
  "HEB340": { soort: "I", h: 340, b: 300, tw: 12, tf: 21.5, r: 27 },
  "HEB360": { soort: "I", h: 360, b: 300, tw: 12.5, tf: 22.5, r: 27 },
  "HEB400": { soort: "I", h: 400, b: 300, tw: 13.5, tf: 24, r: 27 },
  "HEM100": { soort: "I", h: 120, b: 106, tw: 12, tf: 20, r: 12 },
  "HEM120": { soort: "I", h: 140, b: 126, tw: 12.5, tf: 21, r: 12 },
  "HEM140": { soort: "I", h: 160, b: 146, tw: 13, tf: 22, r: 12 },
  "HEM160": { soort: "I", h: 180, b: 166, tw: 14, tf: 23, r: 15 },
  "HEM180": { soort: "I", h: 200, b: 186, tw: 14.5, tf: 24, r: 15 },
  "HEM200": { soort: "I", h: 220, b: 206, tw: 15, tf: 25, r: 18 },
  "HEM220": { soort: "I", h: 240, b: 226, tw: 15.5, tf: 26, r: 18 },
  "HEM240": { soort: "I", h: 270, b: 248, tw: 18, tf: 32, r: 21 },
  "HEM260": { soort: "I", h: 290, b: 268, tw: 18, tf: 32.5, r: 24 },
  "HEM280": { soort: "I", h: 310, b: 288, tw: 18.5, tf: 33, r: 24 },
  "HEM300": { soort: "I", h: 340, b: 310, tw: 21, tf: 39, r: 27 },
  "SHS80X80X4": { soort: "koker", h: 80, b: 80, t: 4, r: 4 },
  "SHS100X100X5": { soort: "koker", h: 100, b: 100, t: 5, r: 5 },
  "SHS120X120X5": { soort: "koker", h: 120, b: 120, t: 5, r: 5 },
  "SHS150X150X6": { soort: "koker", h: 150, b: 150, t: 6, r: 6 },
  "SHS200X200X8": { soort: "koker", h: 200, b: 200, t: 8, r: 8 },
  "SHS250X250X10": { soort: "koker", h: 250, b: 250, t: 10, r: 10 },
  "SHS300X300X10": { soort: "koker", h: 300, b: 300, t: 10, r: 10 },
  "RHS100X50X4": { soort: "koker", h: 100, b: 50, t: 4, r: 4 },
  "RHS120X60X5": { soort: "koker", h: 120, b: 60, t: 5, r: 5 },
  "RHS150X100X6": { soort: "koker", h: 150, b: 100, t: 6, r: 6 },
  "RHS200X100X8": { soort: "koker", h: 200, b: 100, t: 8, r: 8 },
  "RHS250X150X8": { soort: "koker", h: 250, b: 150, t: 8, r: 8 },
  "RHS300X200X10": { soort: "koker", h: 300, b: 200, t: 10, r: 10 },
  "CHS424X32": { soort: "buis", d: 42.4, t: 3.2 },
  "CHS483X32": { soort: "buis", d: 48.3, t: 3.2 },
  "CHS603X40": { soort: "buis", d: 60.3, t: 4 },
  "CHS761X50": { soort: "buis", d: 76.1, t: 5 },
  "CHS889X50": { soort: "buis", d: 88.9, t: 5 },
  "CHS1143X63": { soort: "buis", d: 114.3, t: 6.3 },
  "CHS1397X80": { soort: "buis", d: 139.7, t: 8 },
  "CHS1683X80": { soort: "buis", d: 168.3, t: 8 },
  "CHS2191X10": { soort: "buis", d: 219.1, t: 10 },
  "CHS273X10": { soort: "buis", d: 273, t: 10 },
  "CHS3239X125": { soort: "buis", d: 323.9, t: 12.5 },
  "CHS4064X16": { soort: "buis", d: 406.4, t: 16 },
  "UNP80": { soort: "U", h: 80, b: 45, tw: 6, tf: 8, r: 8 },
  "UNP100": { soort: "U", h: 100, b: 50, tw: 6, tf: 8.5, r: 8.5 },
  "UNP120": { soort: "U", h: 120, b: 55, tw: 7, tf: 9, r: 9 },
  "UNP140": { soort: "U", h: 140, b: 60, tw: 7, tf: 10, r: 10 },
  "UNP160": { soort: "U", h: 160, b: 65, tw: 7.5, tf: 10.5, r: 10.5 },
  "UNP180": { soort: "U", h: 180, b: 70, tw: 8, tf: 11, r: 11 },
  "UNP200": { soort: "U", h: 200, b: 75, tw: 8.5, tf: 11.5, r: 11.5 },
  "UNP220": { soort: "U", h: 220, b: 80, tw: 9, tf: 12.5, r: 12.5 },
  "UNP240": { soort: "U", h: 240, b: 85, tw: 9.5, tf: 13, r: 13 },
  "UNP260": { soort: "U", h: 260, b: 90, tw: 10, tf: 14, r: 14 },
  "UNP280": { soort: "U", h: 280, b: 95, tw: 10, tf: 15, r: 15 },
  "UNP300": { soort: "U", h: 300, b: 100, tw: 10, tf: 16, r: 16 },
};

/** Zelfde normalisatie als sectionResolver (die exporteert hem niet). */
function normaliseerProfielnaam(naam: string): string {
  return naam.toUpperCase().split("").filter(c => c !== " " && c !== "-" && c !== ".").join("");
}

/** Herkenning hout-sterkteklasse (EN 338 / EN 14080) — incl. D-klassen. */
function isHoutMateriaal(mat: string): boolean {
  if ((SUPPORTED_TIMBER_GRADES as readonly string[]).includes(mat)) return true;
  return /^(C\d{2}|D\d{2}|GL\d{2}[a-z]?)$/i.test(mat.trim());
}

// ── STEP-primitieven ────────────────────────────────────────────────────────

/**
 * Reëel getal in STEP-notatie: altijd met decimale punt ("12.", "0.0075"),
 * exponentvorm alleen bij extreme waarden ("1.5E-9").
 */
function reeel(v: number): string {
  if (!Number.isFinite(v) || Object.is(v, -0)) v = 0;
  // 10 significante cijfers dempen float-ruis (bv. 0.1520000000000001)
  let s = String(Number(v.toPrecision(10)));
  const e = s.toLowerCase().indexOf("e");
  if (e >= 0) {
    let m = s.slice(0, e);
    if (!m.includes(".")) m += ".";
    return m + "E" + s.slice(e + 1).replace("+", "");
  }
  if (!s.includes(".")) s += ".";
  return s;
}

/** mm → m als STEP-reëel. */
function meter(mm: number): string {
  return reeel(mm / 1000);
}

/**
 * STEP-string: apostrof verdubbeld, backslash verdubbeld, tekens buiten
 * ISO 8859-1 basis-ASCII als \X2\…\X0\ (UTF-16 hex) — zodat namen met
 * bv. accenten geldig blijven.
 */
function stepString(s: string): string {
  let uit = "";
  let inX2 = false;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code <= 0x7e) {
      if (inX2) { uit += "\\X0\\"; inX2 = false; }
      if (ch === "'") uit += "''";
      else if (ch === "\\") uit += "\\\\";
      else uit += ch;
    } else {
      if (!inX2) { uit += "\\X2\\"; inX2 = true; }
      uit += code.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  if (inX2) uit += "\\X0\\";
  return `'${uit}'`;
}

// ── Deterministische IFC-GUID's ─────────────────────────────────────────────

const IFC_GUID_TEKENS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** FNV-1a 32-bit over een string, met instelbare beginwaarde. */
function fnv1a32(tekst: string, basis: number): number {
  let h = basis >>> 0;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministische 22-teken IFC-GUID uit een inhoudelijke seed.
 * 128 bits = 4 × FNV-1a met verschillende beginwaarden; codering volgens de
 * IFC base64-variant (eerste teken 2 bits, daarna 21 × 6 bits).
 */
function ifcGuid(seed: string): string {
  const basissen = [0x811c9dc5, 0x9747b28c, 0x2f0e5761, 0x6c62272e];
  let n = 0n;
  for (let i = 0; i < 4; i++) {
    n = (n << 32n) | BigInt(fnv1a32(`${seed} ${i}`, basissen[i]));
  }
  let uit = IFC_GUID_TEKENS[Number(n >> 126n)];
  for (let i = 20; i >= 0; i--) {
    uit += IFC_GUID_TEKENS[Number((n >> BigInt(i * 6)) & 63n)];
  }
  return uit;
}

// ── SPF-schrijver ───────────────────────────────────────────────────────────

class SpfSchrijver {
  private regels: string[] = [];
  private volgendId = 1;
  private guids = new Set<string>();

  /** Voeg een entiteit toe; retourneert het #id. */
  ent(naam: string, ...attrs: string[]): number {
    const id = this.volgendId++;
    this.regels.push(`#${id}=${naam}(${attrs.join(",")});`);
    return id;
  }

  /** Unieke deterministische GUID als STEP-string-attribuut. */
  guid(seed: string): string {
    let g = ifcGuid(seed);
    let poging = 2;
    while (this.guids.has(g)) g = ifcGuid(`${seed}~${poging++}`); // botsing — praktisch onmogelijk
    this.guids.add(g);
    return `'${g}'`;
  }

  data(): string {
    return this.regels.join("\n");
  }
}

const ref = (id: number) => `#${id}`;
const lijst = (ids: number[]) => `(${ids.map(ref).join(",")})`;

// ── Hoofdopbouw ─────────────────────────────────────────────────────────────

/** Bouwt het volledige IFC4 SPF-bestand (string) uit het rekenmodel. */
export function bouwIfcRekenmodel(
  model: IfcRekenmodelInput,
  opties: IfcExportOpties = {},
): string {
  const w = new SpfSchrijver();
  const projectNaam = model.projectNaam?.trim() || "Rekenmodel";

  // ── Eenheden (SI) ────────────────────────────────────────────────────────
  const uLengte = w.ent("IFCSIUNIT", "*", ".LENGTHUNIT.", "$", ".METRE.");
  const uOpp    = w.ent("IFCSIUNIT", "*", ".AREAUNIT.", "$", ".SQUARE_METRE.");
  const uInhoud = w.ent("IFCSIUNIT", "*", ".VOLUMEUNIT.", "$", ".CUBIC_METRE.");
  const uHoek   = w.ent("IFCSIUNIT", "*", ".PLANEANGLEUNIT.", "$", ".RADIAN.");
  const uKracht = w.ent("IFCSIUNIT", "*", ".FORCEUNIT.", "$", ".NEWTON.");
  const uDruk   = w.ent("IFCSIUNIT", "*", ".PRESSUREUNIT.", "$", ".PASCAL.");
  const uMassa  = w.ent("IFCSIUNIT", "*", ".MASSUNIT.", ".KILO.", ".GRAM.");
  const uTijd   = w.ent("IFCSIUNIT", "*", ".TIMEUNIT.", "$", ".SECOND.");
  const uTemp   = w.ent("IFCSIUNIT", "*", ".THERMODYNAMICTEMPERATUREUNIT.", "$", ".KELVIN.");
  const eenheden = w.ent("IFCUNITASSIGNMENT",
    lijst([uLengte, uOpp, uInhoud, uHoek, uKracht, uDruk, uMassa, uTijd, uTemp]));

  // ── Geometrische context ─────────────────────────────────────────────────
  const oorsprong = w.ent("IFCCARTESIANPOINT", "(0.,0.,0.)");
  const richtingZ = w.ent("IFCDIRECTION", "(0.,0.,1.)");
  const richtingX = w.ent("IFCDIRECTION", "(1.,0.,0.)");
  const wereldAssen = w.ent("IFCAXIS2PLACEMENT3D",
    ref(oorsprong), ref(richtingZ), ref(richtingX));
  const context = w.ent("IFCGEOMETRICREPRESENTATIONCONTEXT",
    "$", "'Model'", "3", "1.E-5", ref(wereldAssen), "$");

  // ── Project → terrein → gebouw ───────────────────────────────────────────
  const project = w.ent("IFCPROJECT",
    w.guid("project"), "$", stepString(projectNaam), "$", "$", "$", "$",
    lijst([context]), ref(eenheden));
  const terrein = w.ent("IFCSITE",
    w.guid("terrein"), "$", "'Terrein'", "$", "$", "$", "$", "$",
    ".ELEMENT.", "$", "$", "$", "$", "$");
  const gebouw = w.ent("IFCBUILDING",
    w.guid("gebouw"), "$", "'Gebouw'", "$", "$", "$", "$", "$",
    ".ELEMENT.", "$", "$", "$");
  w.ent("IFCRELAGGREGATES",
    w.guid("agg:project-terrein"), "$", "$", "$", ref(project), lijst([terrein]));
  w.ent("IFCRELAGGREGATES",
    w.guid("agg:terrein-gebouw"), "$", "$", "$", ref(terrein), lijst([gebouw]));

  // ── Belastinggroepen (één per belastinggeval) ────────────────────────────
  // ActionType/ActionSource volgens Eurocode-aard van het geval.
  const groepPerCase = new Map<number, number>();
  const soortNaarActie: Record<LoadCase["type"], [string, string]> = {
    dead: [".PERMANENT_G.", ".DEAD_LOAD_G."],
    live: [".VARIABLE_Q.", ".LIVE_LOAD_Q."],
    snow: [".VARIABLE_Q.", ".SNOW_S."],
    wind: [".VARIABLE_Q.", ".WIND_W."],
    other: [".NOTDEFINED.", ".NOTDEFINED."],
  };
  const alleCases: LoadCase[] = [...model.loadCases];
  // Lasten met een caseId zonder bijbehorend geval: synthetische groep.
  for (const last of model.loads) {
    if (!alleCases.some(c => c.id === last.caseId)) {
      alleCases.push({ id: last.caseId, name: `BG ${last.caseId}`, type: "other" });
    }
  }
  for (const geval of alleCases) {
    const [actieType, actieBron] = soortNaarActie[geval.type] ?? soortNaarActie.other;
    const groep = w.ent("IFCSTRUCTURALLOADGROUP",
      w.guid(`lastgroep:${geval.id}`), "$", stepString(geval.name), "$", "$",
      ".LOAD_CASE.", actieType, actieBron, "$", "$");
    groepPerCase.set(geval.id, groep);
  }

  // ── Analysemodel (2D, XZ-vlak) ───────────────────────────────────────────
  // As van het rekenvlak = (0,-1,0) met refrichting (1,0,0): lokaal-x =
  // globaal-X, lokaal-y = globaal-Z (omhoog), rechtsdraaiend.
  const richtingMinY = w.ent("IFCDIRECTION", "(0.,-1.,0.)");
  const vlakAssen = w.ent("IFCAXIS2PLACEMENT3D",
    ref(oorsprong), ref(richtingMinY), ref(richtingX));
  const groepIds = [...groepPerCase.values()];
  const analyseModel = w.ent("IFCSTRUCTURALANALYSISMODEL",
    w.guid("analysemodel"), "$", stepString(`Rekenmodel ${projectNaam}`), "$", "$",
    ".IN_PLANE_LOADING_2D.", ref(vlakAssen),
    groepIds.length > 0 ? lijst(groepIds) : "$", "$", "$");
  w.ent("IFCRELSERVICESBUILDINGS",
    w.guid("dienst:model-gebouw"), "$", "$", "$", ref(analyseModel), lijst([gebouw]));

  // ── Knopen: puntconnecties + opleggingen ─────────────────────────────────
  const steunPerKnoop = new Map<number, Support>();
  for (const s of model.supports) steunPerKnoop.set(s.nodeId, s);

  const connectiePerKnoop = new Map<number, number>();
  const vertexPerKnoop = new Map<number, number>();
  for (const kn of model.nodes) {
    const punt = w.ent("IFCCARTESIANPOINT",
      `(${meter(kn.x)},0.,${meter(kn.z)})`);
    const vertex = w.ent("IFCVERTEXPOINT", ref(punt));
    vertexPerKnoop.set(kn.id, vertex);
    const topo = w.ent("IFCTOPOLOGYREPRESENTATION",
      ref(context), "'Reference'", "'Vertex'", lijst([vertex]));
    const vorm = w.ent("IFCPRODUCTDEFINITIONSHAPE", "$", "$", lijst([topo]));

    const steun = steunPerKnoop.get(kn.id);
    const conditie = steun !== undefined ? schrijfOplegging(w, steun) : undefined;
    const connectie = w.ent("IFCSTRUCTURALPOINTCONNECTION",
      w.guid(`knoop:${kn.id}`), "$", stepString(`Knoop ${kn.id}`), "$", "$",
      "$", ref(vorm), conditie !== undefined ? ref(conditie) : "$", "$");
    connectiePerKnoop.set(kn.id, connectie);
  }

  // ── Staven: curve-members + eindverbindingen ─────────────────────────────
  const richtingY = w.ent("IFCDIRECTION", "(0.,1.,0.)"); // normaal op het rekenvlak
  const memberPerStaaf = new Map<number, number>();
  const staafLengteM = new Map<number, number>();
  for (const staaf of model.beams) {
    const van = model.nodes.find(n => n.id === staaf.from);
    const naar = model.nodes.find(n => n.id === staaf.to);
    const vertexVan = vertexPerKnoop.get(staaf.from);
    const vertexNaar = vertexPerKnoop.get(staaf.to);
    if (!van || !naar || vertexVan === undefined || vertexNaar === undefined) {
      console.warn(`[ifcExport] Staaf ${staaf.id} verwijst naar ontbrekende knoop — overgeslagen.`);
      continue;
    }
    staafLengteM.set(staaf.id,
      Math.hypot(naar.x - van.x, naar.z - van.z) / 1000);

    const rand = w.ent("IFCEDGE", ref(vertexVan), ref(vertexNaar));
    const topo = w.ent("IFCTOPOLOGYREPRESENTATION",
      ref(context), "'Reference'", "'Edge'", lijst([rand]));
    const vorm = w.ent("IFCPRODUCTDEFINITIONSHAPE", "$", "$", lijst([topo]));

    const rel = staaf.releases ?? {};
    const beideEindenScharnier = rel.startRy === true && rel.endRy === true;
    const materiaal = staaf.material ?? "S235";
    const profiel = staaf.profile ?? "HEA160";
    const member = w.ent("IFCSTRUCTURALCURVEMEMBER",
      w.guid(`staaf:${staaf.id}`), "$", stepString(`Staaf ${staaf.id}`),
      stepString(`${materiaal} ${profiel}`), "$", "$", ref(vorm),
      beideEindenScharnier ? ".PIN_JOINED_MEMBER." : ".RIGID_JOINED_MEMBER.",
      ref(richtingY));
    memberPerStaaf.set(staaf.id, member);

    // Verbinding met beide knopen; releases als expliciete randvoorwaarde.
    const einden: Array<["start" | "eind", number, boolean?, boolean?, boolean?]> = [
      ["start", connectiePerKnoop.get(staaf.from)!, rel.startTx, rel.startTz, rel.startRy],
      ["eind",  connectiePerKnoop.get(staaf.to)!,   rel.endTx,   rel.endTz,   rel.endRy],
    ];
    for (const [kant, connectie, losTx, losTz, losRy] of einden) {
      let conditie: number | undefined;
      if (losTx === true || losTz === true || losRy === true) {
        conditie = w.ent("IFCBOUNDARYNODECONDITION",
          "'Scharnier'",
          `IFCBOOLEAN(${losTx === true ? ".F." : ".T."})`, "$",
          `IFCBOOLEAN(${losTz === true ? ".F." : ".T."})`, "$",
          `IFCBOOLEAN(${losRy === true ? ".F." : ".T."})`, "$");
      }
      w.ent("IFCRELCONNECTSSTRUCTURALMEMBER",
        w.guid(`staafrel:${staaf.id}:${kant}`), "$", "$", "$",
        ref(member), ref(connectie),
        conditie !== undefined ? ref(conditie) : "$", "$", "$", "$");
    }
  }

  // ── Materiaal + profiel per unieke combinatie ────────────────────────────
  schrijfMaterialenEnProfielen(w, model.beams, memberPerStaaf);

  // ── Lasten ───────────────────────────────────────────────────────────────
  const actiesPerGroep = new Map<number, number[]>();
  for (const last of model.loads) {
    const actie = schrijfLast(w, last, connectiePerKnoop, memberPerStaaf, staafLengteM);
    if (actie === undefined) continue;
    const groep = groepPerCase.get(last.caseId);
    if (groep !== undefined) {
      const lijstje = actiesPerGroep.get(groep) ?? [];
      lijstje.push(actie);
      actiesPerGroep.set(groep, lijstje);
    }
  }
  for (const [groep, acties] of actiesPerGroep) {
    w.ent("IFCRELASSIGNSTOGROUP",
      w.guid(`toekenning:groep:${groep}`), "$", "$", "$",
      lijst(acties), "$", ref(groep));
  }

  // ── Leden van het analysemodel ───────────────────────────────────────────
  const leden = [...connectiePerKnoop.values(), ...memberPerStaaf.values()];
  if (leden.length > 0) {
    w.ent("IFCRELASSIGNSTOGROUP",
      w.guid("toekenning:model"), "$", "$", "$",
      lijst(leden), "$", ref(analyseModel));
  }

  // ── Omlijsting (ISO 10303-21) ────────────────────────────────────────────
  const bestandsnaam = opties.bestandsnaam ?? `${projectNaam}.ifc`;
  const tijdstempel = opties.tijdstempel ?? "";
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [StructuralAnalysisView]'),'2;1');",
    `FILE_NAME(${stepString(bestandsnaam)},${stepString(tijdstempel)},(''),(''),` +
      "'Open FEM2D Studio','Open FEM2D Studio','');",
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    w.data(),
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

// ── Opleggingen ─────────────────────────────────────────────────────────────

/**
 * IfcBoundaryNodeCondition voor een oplegging. Alleen de in-het-vlak-DOF's
 * (X, Z, RY) worden gezet; uit-het-vlak blijft $.
 * Veerstijfheden: kN/mm → N/m (×1e6), kNm/rad → N·m/rad (×1e3).
 */
function schrijfOplegging(w: SpfSchrijver, steun: Support): number {
  const vast = "IFCBOOLEAN(.T.)";
  const vrij = "IFCBOOLEAN(.F.)";
  const veer = (kNperM: number) => `IFCLINEARSTIFFNESSMEASURE(${reeel(kNperM)})`;
  const draaiveer = (kNmPerRad: number) => `IFCROTATIONALSTIFFNESSMEASURE(${reeel(kNmPerRad)})`;
  const k = steun.k ?? 0;

  let naam = "Oplegging";
  let dx = vrij, dz = vrij, ry = vrij;
  switch (steun.type) {
    case "pinned":  naam = "Scharnieroplegging"; dx = vast; dz = vast; ry = vrij; break;
    case "fixed":   naam = "Inklemming";         dx = vast; dz = vast; ry = vast; break;
    case "xRoller": naam = "Rol (X vast)";       dx = vast; dz = vrij; ry = vrij; break;
    case "zRoller": naam = "Rol (Z vast)";       dx = vrij; dz = vast; ry = vrij; break;
    case "zSpring": naam = "Veer Z";             dx = vrij; dz = veer(k * 1e6); ry = vrij; break;
    case "xSpring": naam = "Veer X";             dx = veer(k * 1e6); dz = vrij; ry = vrij; break;
    case "rotSpring": naam = "Draaiveer";        dx = vrij; dz = vrij; ry = draaiveer(k * 1e3); break;
  }
  return w.ent("IFCBOUNDARYNODECONDITION",
    stepString(naam), dx, "$", dz, "$", ry, "$");
}

// ── Materialen en profielen ─────────────────────────────────────────────────

/**
 * Eén IfcMaterial per klasse en één profielset per unieke
 * (materiaal, profiel)-combinatie; alle staven met die combinatie hangen aan
 * dezelfde IfcRelAssociatesMaterial.
 */
function schrijfMaterialenEnProfielen(
  w: SpfSchrijver,
  staven: Beam[],
  memberPerStaaf: Map<number, number>,
): void {
  const materiaalIds = new Map<string, number>();
  const materiaalId = (naam: string): number => {
    const bestaand = materiaalIds.get(naam);
    if (bestaand !== undefined) return bestaand;
    const categorie = isHoutMateriaal(naam) ? "'wood'" : "'steel'";
    const id = w.ent("IFCMATERIAL", stepString(naam), "$", categorie);
    materiaalIds.set(naam, id);
    return id;
  };

  // Groepeer staven per (materiaal, profiel)
  const combos = new Map<string, { materiaal: string; profiel: string; members: number[] }>();
  for (const staaf of staven) {
    const member = memberPerStaaf.get(staaf.id);
    if (member === undefined) continue;
    const materiaal = staaf.material ?? "S235";
    const profiel = staaf.profile ?? "HEA160";
    const sleutel = `${materiaal} ${profiel}`;
    const combo = combos.get(sleutel) ?? { materiaal, profiel, members: [] };
    combo.members.push(member);
    combos.set(sleutel, combo);
  }

  for (const { materiaal, profiel, members } of combos.values()) {
    const mat = materiaalId(materiaal);
    const profielDef = schrijfProfiel(w, materiaal, profiel);

    let koppeling: number;
    if (profielDef !== undefined) {
      const matProfiel = w.ent("IFCMATERIALPROFILE",
        stepString(profiel), "$", ref(mat), ref(profielDef), "$", "$");
      const profielSet = w.ent("IFCMATERIALPROFILESET",
        stepString(`${materiaal} ${profiel}`), "$", lijst([matProfiel]), "$");
      koppeling = w.ent("IFCMATERIALPROFILESETUSAGE", ref(profielSet), "$", "$");
    } else {
      // Onbekend profiel: IFC4 kent geen concreet naam-zonder-geometrie-
      // profiel (IfcProfileDef is abstract) — koppel alleen het materiaal.
      // De profielnaam blijft behouden in de Description van de staaf.
      console.warn(`[ifcExport] Profiel "${profiel}" onbekend — alleen materiaal gekoppeld.`);
      koppeling = mat;
    }
    w.ent("IFCRELASSOCIATESMATERIAL",
      w.guid(`matkoppeling:${materiaal}:${profiel}`), "$", "$", "$",
      lijst(members), ref(koppeling));
  }
}

// ── Lasten ──────────────────────────────────────────────────────────────────

/**
 * Schrijft één last als structural action + koppeling aan knoop of staaf.
 * Retourneert het action-#id, of undefined als de last niet te exporteren is.
 */
function schrijfLast(
  w: SpfSchrijver,
  last: Load,
  connectiePerKnoop: Map<number, number>,
  memberPerStaaf: Map<number, number>,
  staafLengteM: Map<number, number>,
): number | undefined {
  // Globaal tenzij het (toekomstige) qCoord-veld expliciet lokaal zegt.
  const qCoord = (last as { qCoord?: string }).qCoord;
  const lokaal = qCoord === "local" || qCoord === "lokaal";
  const stelsel = lokaal ? ".LOCAL_COORDS." : ".GLOBAL_COORDS.";

  if (last.type === "pointForce" || last.type === "pointMoment") {
    const connectie = last.nodeId !== undefined ? connectiePerKnoop.get(last.nodeId) : undefined;
    if (connectie === undefined) {
      console.warn(`[ifcExport] Last ${last.id} verwijst naar ontbrekende knoop — overgeslagen.`);
      return undefined;
    }
    // kN → N, kNm → N·m
    const kracht = w.ent("IFCSTRUCTURALLOADSINGLEFORCE",
      stepString(`Last ${last.id}`),
      last.fx !== undefined ? `IFCFORCEMEASURE(${reeel(last.fx * 1e3)})` : "$",
      "$",
      last.fz !== undefined ? `IFCFORCEMEASURE(${reeel(last.fz * 1e3)})` : "$",
      "$",
      last.my !== undefined ? `IFCTORQUEMEASURE(${reeel(last.my * 1e3)})` : "$",
      "$");
    const actie = w.ent("IFCSTRUCTURALPOINTACTION",
      w.guid(`last:${last.id}`), "$",
      stepString(last.type === "pointMoment" ? `M ${last.id}` : `F ${last.id}`),
      "$", "$", "$", "$", ref(kracht), stelsel, "$");
    w.ent("IFCRELCONNECTSSTRUCTURALACTIVITY",
      w.guid(`lastrel:${last.id}`), "$", "$", "$", ref(connectie), ref(actie));
    return actie;
  }

  if (last.type === "lineLoad" || last.type === "thermal") {
    const member = last.beamId !== undefined ? memberPerStaaf.get(last.beamId) : undefined;
    if (member === undefined) {
      console.warn(`[ifcExport] Last ${last.id} verwijst naar ontbrekende staaf — overgeslagen.`);
      return undefined;
    }

    let actie: number;
    if (last.type === "thermal") {
      // ΔT constant over de staaf; assenstelsel is voor temperatuur niet
      // relevant — LOCAL_COORDS (staafgebonden werking).
      const tLast = w.ent("IFCSTRUCTURALLOADTEMPERATURE",
        stepString(`dT ${last.id}`),
        `IFCTHERMODYNAMICTEMPERATUREMEASURE(${reeel(last.deltaT ?? 0)})`, "$", "$");
      actie = w.ent("IFCSTRUCTURALLINEARACTION",
        w.guid(`last:${last.id}`), "$", stepString(`dT ${last.id}`), "$", "$",
        "$", "$", ref(tLast), ".LOCAL_COORDS.", "$", "$", ".CONST.");
    } else {
      const qA = last.qStart ?? last.q ?? 0; // kN/m
      const qB = last.qEnd ?? last.q ?? 0;
      const richting = last.qDir ?? "z";
      // kN/m → N/m; richting in globale assen via qDir
      const lijnkracht = (q: number, naam: string): number => w.ent(
        "IFCSTRUCTURALLOADLINEARFORCE",
        stepString(naam),
        richting === "x" ? `IFCLINEARFORCEMEASURE(${reeel(q * 1e3)})` : "$",
        "$",
        richting === "z" ? `IFCLINEARFORCEMEASURE(${reeel(q * 1e3)})` : "$",
        "$", "$", "$");

      if (qA === qB) {
        // Uniform: IfcStructuralLinearAction, per definitie CONST.
        const qLast = lijnkracht(qA, `q ${last.id}`);
        actie = w.ent("IFCSTRUCTURALLINEARACTION",
          w.guid(`last:${last.id}`), "$", stepString(`q ${last.id}`), "$", "$",
          "$", "$", ref(qLast), stelsel, "$", ".TRUE_LENGTH.", ".CONST.");
      } else {
        // Trapezium: IfcStructuralCurveAction (LINEAR) met een
        // lastconfiguratie van twee waarden op 0 en L (volledige staaf).
        const L = staafLengteM.get(last.beamId!) ?? 0;
        const q1 = lijnkracht(qA, `q ${last.id} begin`);
        const q2 = lijnkracht(qB, `q ${last.id} eind`);
        const config = w.ent("IFCSTRUCTURALLOADCONFIGURATION",
          stepString(`q ${last.id}`), lijst([q1, q2]),
          `((0.),(${reeel(L)}))`);
        actie = w.ent("IFCSTRUCTURALCURVEACTION",
          w.guid(`last:${last.id}`), "$", stepString(`q ${last.id}`), "$", "$",
          "$", "$", ref(config), stelsel, "$", ".TRUE_LENGTH.", ".LINEAR.");
      }
    }
    w.ent("IFCRELCONNECTSSTRUCTURALACTIVITY",
      w.guid(`lastrel:${last.id}`), "$", "$", "$", ref(member), ref(actie));
    return actie;
  }

  console.warn(`[ifcExport] Lasttype "${last.type}" wordt niet geëxporteerd — overgeslagen.`);
  return undefined;
}

// ── Download-helper (browser) ───────────────────────────────────────────────

/**
 * Bouwt het IFC-bestand en biedt het aan als download (blob, zoals de
 * CSV-export van de matrijzen). Bestandsnaam default: "<projectNaam>.ifc".
 */
export function downloadIfc(model: IfcRekenmodelInput, bestandsnaam?: string): void {
  const veiligeNaam = (bestandsnaam ?? `${model.projectNaam?.trim() || "rekenmodel"}.ifc`)
    .replace(/[\\/:*?"<>|]/g, "_");
  const naamMetExt = veiligeNaam.toLowerCase().endsWith(".ifc")
    ? veiligeNaam : `${veiligeNaam}.ifc`;
  const inhoud = bouwIfcRekenmodel(model, {
    bestandsnaam: naamMetExt,
    tijdstempel: new Date().toISOString().slice(0, 19),
  });
  const blob = new Blob([inhoud], { type: "application/x-step" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = naamMetExt;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Profieldefinities ───────────────────────────────────────────────────────

/**
 * Parametrisch IFC-profiel voor een (materiaal, profiel)-combinatie.
 * Afmetingen mm → m. Retourneert undefined bij een onbekend profiel.
 */
function schrijfProfiel(
  w: SpfSchrijver,
  materiaal: string,
  profiel: string,
): number | undefined {
  const naam = stepString(profiel);

  if (isHoutMateriaal(materiaal)) {
    const rect = parseRechthoek(profiel);
    if (rect) {
      return w.ent("IFCRECTANGLEPROFILEDEF",
        ".AREA.", naam, "$", meter(rect.b), meter(rect.h));
    }
    return undefined;
  }

  const dims = STAALPROFIEL_AFMETINGEN[normaliseerProfielnaam(profiel)];
  if (dims) {
    switch (dims.soort) {
      case "I":
        return w.ent("IFCISHAPEPROFILEDEF",
          ".AREA.", naam, "$", meter(dims.b), meter(dims.h),
          meter(dims.tw), meter(dims.tf), meter(dims.r), "$", "$");
      case "U":
        return w.ent("IFCUSHAPEPROFILEDEF",
          ".AREA.", naam, "$", meter(dims.h), meter(dims.b),
          meter(dims.tw), meter(dims.tf), meter(dims.r), "$", "$");
      case "koker":
        return w.ent("IFCRECTANGLEHOLLOWPROFILEDEF",
          ".AREA.", naam, "$", meter(dims.b), meter(dims.h),
          meter(dims.t), "$", dims.r > 0 ? meter(dims.r) : "$");
      case "buis":
        return w.ent("IFCCIRCLEHOLLOWPROFILEDEF",
          ".AREA.", naam, "$", meter(dims.d / 2), meter(dims.t));
    }
  }

  // Laatste redmiddel: rechthoek-notatie in de naam ("100x200") — ook bij
  // niet-houtmaterialen een eerlijke massieve rechthoek.
  const rect = parseRechthoek(profiel);
  if (rect) {
    return w.ent("IFCRECTANGLEPROFILEDEF",
      ".AREA.", naam, "$", meter(rect.b), meter(rect.h));
  }
  return undefined;
}
