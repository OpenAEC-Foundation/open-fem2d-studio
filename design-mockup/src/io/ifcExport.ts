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
 *    IfcRelAssignsToGroup. Puntlasten/momenten op een knoop:
 *    IfcStructuralPointAction met IfcStructuralLoadSingleForce (globale
 *    assen), gekoppeld aan de puntconnectie. Een puntlast op een VRIJE
 *    POSITIE op een staaf (posFrac) krijgt dezelfde actie, maar dan met een
 *    eigen IfcVertexPoint-representatie op de werkelijke plek en een
 *    koppeling aan de staaf — IfcStructuralActivity is een IfcProduct en mag
 *    dus zelf geometrie dragen. Uniforme lijnlasten over de volle lengte:
 *    IfcStructuralLinearAction (CONST, TRUE_LENGTH) met
 *    IfcStructuralLoadLinearForce. Trapeziumlasten (qStart ≠ qEnd) over de
 *    volle lengte: IfcStructuralCurveAction (LINEAR) met
 *    IfcStructuralLoadConfiguration van twee waarden op 0 en L. DEELLASTEN
 *    (startFrac/endFrac): IfcStructuralCurveAction (POLYGONAL) met een
 *    configuratie die buiten het belaste deel op nul staat — knikpunten op
 *    0, a, b en L. Thermische lasten: IfcStructuralLinearAction met
 *    IfcStructuralLoadTemperature (ΔT constant).
 *  - Lastrichting: alles wordt in GLOBAL_COORDS geschreven. Een lokale last
 *    (qCoord "local") wordt met de staafhoek θ exact naar wereldassen
 *    geprojecteerd — lokaal-x = (cosθ, sinθ), lokaal-z = (−sinθ, cosθ),
 *    dezelfde projectie als de rekenadapter (solver/engine.ts). Zo staat er
 *    geen richting in het bestand die van de IFC-lokale-assenconventie van
 *    de lezer afhangt.
 *  - Projectgegevens: naam, omschrijving, projectnummer en locatie uit de
 *    projectinstellingen komen in IfcProject (Name / Description / LongName)
 *    en IfcSite (Name). Ingenieur en bedrijf staan in de STEP-header
 *    (FILE_NAME author/organization) — de plek die ISO 10303-21 daarvoor
 *    heeft.
 *  - GlobalId's: deterministische 22-teken IFC-GUID's, afgeleid uit een
 *    inhoudelijke seed (bv. "knoop:3") via FNV-1a — geen Math.random, zodat
 *    twee exports van hetzelfde model byte-identiek zijn.
 *  - IfcOwnerHistory wordt weggelaten ($) — optioneel in IFC4, en een
 *    tijdstempel daarin zou het determinisme breken.
 *
 * Bekende beperkingen: `verzamelIfcBeperkingen()` levert ze als leesbare
 * regels op, zodat de IFC-weergave in beeld kan zeggen wat er NIET in het
 * bestand staat in plaats van het stil weg te laten.
 */
import type {
  Node, Beam, Support, Load, LoadCase,
} from "../components/fem/femTypes";
import { parseRechthoek } from "../lib/sectionResolver";
import { SUPPORTED_TIMBER_GRADES } from "../lib/timberCheckBuilder";
import {
  STEEL_SECTION_DIMS, type SteelSectionDims,
} from "../lib/steelSectionDims.generated";

// ── Invoertype ──────────────────────────────────────────────────────────────

/**
 * Projectgegevens zoals de gebruiker ze in de projectinstellingen invult
 * (ProjectSettingsDialog → instelling "projectInfo"). Alle velden optioneel:
 * een leeg veld wordt gewoon weggelaten uit het bestand.
 */
export interface IfcProjectGegevens {
  naam?: string;
  projectnummer?: string;
  ingenieur?: string;
  bedrijf?: string;
  locatie?: string;
  omschrijving?: string;
}

/** Modelstate voor de export — zelfde vormen als de gelifte App-state. */
export interface IfcRekenmodelInput {
  /**
   * Projectnaam als er geen projectinstellingen zijn (bv. de bestandsnaam
   * van het geopende project). `project.naam` gaat hier altijd vóór.
   */
  projectNaam?: string;
  /** Projectgegevens uit de projectinstellingen. */
  project?: IfcProjectGegevens;
  nodes: Node[];
  beams: Beam[];
  supports: Support[];
  loads: Load[];
  loadCases: LoadCase[];
  /**
   * Platen in het model. Ze worden NIET geëxporteerd (zie
   * verzamelIfcBeperkingen); alleen het aantal telt, om dat eerlijk te
   * kunnen melden.
   */
  plates?: { id: number }[];
  /** Staat de eigen-gewichtsberekening aan? Alleen voor de beperkingenlijst. */
  eigenGewicht?: boolean;
  /** Aantal belastingcombinaties. Alleen voor de beperkingenlijst. */
  aantalCombinaties?: number;
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
  /**
   * Alleen het draagsysteem: knopen, staven, profielen, materialen en
   * opleggingen — zonder belastinggevallen en belastingen. Voor de knop
   * "Export structureel", die het model naar een BIM-omgeving brengt waar de
   * belastingen niet thuishoren.
   */
  zonderLasten?: boolean;
}

// ── Staalprofiel-afmetingen (mm) ────────────────────────────────────────────
// Uit de GEDEELDE gegenereerde tabel (bron: de Rust-profieldatabase, dezelfde
// die de toetsing en de doorsnedetekening gebruiken). Eerder stond hier een
// eigen, met de hand bijgehouden uittreksel; dat liep achter op de
// bibliotheek, waardoor gangbare profielen — bijvoorbeeld SHS 60x60x4 —
// zonder doorsnede in het IFC-bestand terechtkwamen.

/** Zelfde normalisatie als de sleutels van STEEL_SECTION_DIMS. */
function normaliseerProfielnaam(naam: string): string {
  return naam.replace(/[\s\-.]/g, "").toUpperCase();
}

/** Afmetingen van een catalogusprofiel, of undefined als het onbekend is. */
function profielAfmetingen(profiel: string): SteelSectionDims | undefined {
  return STEEL_SECTION_DIMS[normaliseerProfielnaam(profiel)];
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
  /** Leeg/whitespace veld telt als "niet ingevuld". */
  const tekst = (v: string | undefined): string | undefined => {
    const s = v?.trim();
    return s ? s : undefined;
  };
  const projectNaam =
    tekst(model.project?.naam) ?? tekst(model.projectNaam) ?? "Rekenmodel";
  const projectOmschrijving = tekst(model.project?.omschrijving);
  const projectNummer = tekst(model.project?.projectnummer);
  const projectLocatie = tekst(model.project?.locatie);

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
  // Name = projectnaam, Description = omschrijving, LongName = projectnummer.
  const project = w.ent("IFCPROJECT",
    w.guid("project"), "$", stepString(projectNaam),
    projectOmschrijving !== undefined ? stepString(projectOmschrijving) : "$",
    "$",
    projectNummer !== undefined ? stepString(projectNummer) : "$",
    "$", lijst([context]), ref(eenheden));
  const terrein = w.ent("IFCSITE",
    w.guid("terrein"), "$",
    stepString(projectLocatie ?? "Terrein"),
    "$", "$", "$", "$", "$",
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
  const zonderLasten = opties.zonderLasten === true;
  const teExporterenLasten = zonderLasten ? [] : model.loads;
  const alleCases: LoadCase[] = zonderLasten ? [] : [...model.loadCases];
  // Lasten met een caseId zonder bijbehorend geval: synthetische groep.
  for (const last of teExporterenLasten) {
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
  const staafInfo = new Map<number, StaafInfo>();
  for (const staaf of model.beams) {
    const van = model.nodes.find(n => n.id === staaf.from);
    const naar = model.nodes.find(n => n.id === staaf.to);
    const vertexVan = vertexPerKnoop.get(staaf.from);
    const vertexNaar = vertexPerKnoop.get(staaf.to);
    if (!van || !naar || vertexVan === undefined || vertexNaar === undefined) {
      console.warn(`[ifcExport] Staaf ${staaf.id} verwijst naar ontbrekende knoop — overgeslagen.`);
      continue;
    }
    const lengteMm = Math.hypot(naar.x - van.x, naar.z - van.z);
    staafInfo.set(staaf.id, {
      lengteM: lengteMm / 1000,
      // Eenheidsvector van→naar; bij een staaf met lengte 0 (gedegenereerd
      // model) valt hij terug op +X, zodat er geen NaN in het bestand komt.
      ux: lengteMm > 0 ? (naar.x - van.x) / lengteMm : 1,
      uz: lengteMm > 0 ? (naar.z - van.z) / lengteMm : 0,
      xMmVan: van.x, zMmVan: van.z,
      xMmNaar: naar.x, zMmNaar: naar.z,
    });

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
  for (const last of teExporterenLasten) {
    const actie = schrijfLast(w, last, connectiePerKnoop, memberPerStaaf, staafInfo, context);
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
  // Auteur en organisatie: de ISO 10303-21-header is de plek voor "wie heeft
  // dit gemaakt". Leeg gelaten velden worden een lege string, zoals de norm
  // voorschrijft (de lijsten zelf zijn verplicht).
  const auteur = stepString(tekst(model.project?.ingenieur) ?? "");
  const organisatie = stepString(tekst(model.project?.bedrijf) ?? "");
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [StructuralAnalysisView]'),'2;1');",
    `FILE_NAME(${stepString(bestandsnaam)},${stepString(tijdstempel)},` +
      `(${auteur}),(${organisatie}),` +
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

/** Wat de lastroutine van een staaf moet weten: lengte, richting, eindpunten. */
interface StaafInfo {
  /** Staaflengte in m. */
  lengteM: number;
  /** Eenheidsvector van→naar in wereldassen (x rechts, z omhoog). */
  ux: number;
  uz: number;
  /** Eindpunten in mm (modelcoördinaten). */
  xMmVan: number; zMmVan: number;
  xMmNaar: number; zMmNaar: number;
}

/**
 * Componenten van een lijnlast in WERELDASSEN (kN/m). Een lokale last wordt
 * met de staafhoek geprojecteerd — exact dezelfde formules als de
 * rekenadapter (solver/engine.ts): lokaal-x = (cosθ, sinθ) axiaal,
 * lokaal-z = (−sinθ, cosθ) transversaal (90° CCW vanaf de as van→naar).
 */
function lastComponenten(
  q: number,
  qDir: "x" | "z",
  lokaal: boolean,
  staaf: StaafInfo | undefined,
): { qx: number; qz: number } {
  if (!lokaal || staaf === undefined) {
    return qDir === "x" ? { qx: q, qz: 0 } : { qx: 0, qz: q };
  }
  const c = staaf.ux, s = staaf.uz;
  return qDir === "x"
    ? { qx: q * c, qz: q * s }
    : { qx: -q * s, qz: q * c };
}

/**
 * Schrijft één last als structural action + koppeling aan knoop of staaf.
 * Retourneert het action-#id, of undefined als de last niet te exporteren is
 * (dat geval staat dan in `verzamelIfcBeperkingen`).
 */
function schrijfLast(
  w: SpfSchrijver,
  last: Load,
  connectiePerKnoop: Map<number, number>,
  memberPerStaaf: Map<number, number>,
  staafInfoPerStaaf: Map<number, StaafInfo>,
  context: number,
): number | undefined {
  if (last.type === "pointForce" || last.type === "pointMoment") {
    // kN → N, kNm → N·m
    const kracht = w.ent("IFCSTRUCTURALLOADSINGLEFORCE",
      stepString(`Last ${last.id}`),
      last.fx !== undefined ? `IFCFORCEMEASURE(${reeel(last.fx * 1e3)})` : "$",
      "$",
      last.fz !== undefined ? `IFCFORCEMEASURE(${reeel(last.fz * 1e3)})` : "$",
      "$",
      last.my !== undefined ? `IFCTORQUEMEASURE(${reeel(last.my * 1e3)})` : "$",
      "$");
    const naam = stepString(last.type === "pointMoment" ? `M ${last.id}` : `F ${last.id}`);

    // Knooplast: hangt aan de puntconnectie, geen eigen geometrie nodig.
    const connectie = last.nodeId !== undefined ? connectiePerKnoop.get(last.nodeId) : undefined;
    if (connectie !== undefined) {
      const actie = w.ent("IFCSTRUCTURALPOINTACTION",
        w.guid(`last:${last.id}`), "$", naam,
        "$", "$", "$", "$", ref(kracht), ".GLOBAL_COORDS.", "$");
      w.ent("IFCRELCONNECTSSTRUCTURALACTIVITY",
        w.guid(`lastrel:${last.id}`), "$", "$", "$", ref(connectie), ref(actie));
      return actie;
    }

    // Staafgebonden puntlast op een vrije positie (posFrac): de actie krijgt
    // een eigen IfcVertexPoint op de werkelijke plek — IfcStructuralActivity
    // is een IfcProduct en mag dus geometrie dragen — en wordt aan de staaf
    // gekoppeld.
    const staaf = last.beamId !== undefined ? staafInfoPerStaaf.get(last.beamId) : undefined;
    const member = last.beamId !== undefined ? memberPerStaaf.get(last.beamId) : undefined;
    if (staaf !== undefined && member !== undefined) {
      const f = Math.min(1, Math.max(0, last.posFrac ?? 0));
      const xMm = staaf.xMmVan + f * (staaf.xMmNaar - staaf.xMmVan);
      const zMm = staaf.zMmVan + f * (staaf.zMmNaar - staaf.zMmVan);
      const punt = w.ent("IFCCARTESIANPOINT", `(${meter(xMm)},0.,${meter(zMm)})`);
      const vertex = w.ent("IFCVERTEXPOINT", ref(punt));
      const topo = w.ent("IFCTOPOLOGYREPRESENTATION",
        ref(context), "'Reference'", "'Vertex'", lijst([vertex]));
      const vorm = w.ent("IFCPRODUCTDEFINITIONSHAPE", "$", "$", lijst([topo]));
      const actie = w.ent("IFCSTRUCTURALPOINTACTION",
        w.guid(`last:${last.id}`), "$", naam,
        "$", "$", "$", ref(vorm), ref(kracht), ".GLOBAL_COORDS.", "$");
      w.ent("IFCRELCONNECTSSTRUCTURALACTIVITY",
        w.guid(`lastrel:${last.id}`), "$", "$", "$", ref(member), ref(actie));
      return actie;
    }

    console.warn(`[ifcExport] Last ${last.id} verwijst naar ontbrekende knoop of staaf — overgeslagen.`);
    return undefined;
  }

  if (last.type === "lineLoad" || last.type === "thermal") {
    const member = last.beamId !== undefined ? memberPerStaaf.get(last.beamId) : undefined;
    if (member === undefined) {
      console.warn(`[ifcExport] Last ${last.id} verwijst naar ontbrekende staaf — overgeslagen.`);
      return undefined;
    }
    const staaf = last.beamId !== undefined ? staafInfoPerStaaf.get(last.beamId) : undefined;

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
      const lokaal = last.qCoord === "local";
      // kN/m → N/m, altijd in wereldassen (een lokale last is geprojecteerd).
      const lijnkracht = (q: number, naam: string): number => {
        const { qx, qz } = lastComponenten(q, richting, lokaal, staaf);
        // Globaal: alleen de aangewezen richting krijgt een waarde (ook een
        // nul-last blijft zo zichtbaar). Lokaal: beide componenten, voor
        // zover ze niet nul zijn.
        const toonX = lokaal ? qx !== 0 : richting === "x";
        const toonZ = lokaal ? qz !== 0 : richting === "z";
        return w.ent("IFCSTRUCTURALLOADLINEARFORCE",
          stepString(naam),
          toonX ? `IFCLINEARFORCEMEASURE(${reeel(qx * 1e3)})` : "$",
          "$",
          toonZ ? `IFCLINEARFORCEMEASURE(${reeel(qz * 1e3)})` : "$",
          "$", "$", "$");
      };

      const L = staaf?.lengteM ?? 0;
      // Deellast: het belaste deel loopt van a tot b (m vanaf de startknoop).
      const fA = Math.min(1, Math.max(0, last.startFrac ?? 0));
      const fB = Math.min(1, Math.max(fA, last.endFrac ?? 1));
      const deellast = fA > 0 || fB < 1;

      if (!deellast && qA === qB) {
        // Uniform over de volle lengte: IfcStructuralLinearAction, CONST.
        const qLast = lijnkracht(qA, `q ${last.id}`);
        actie = w.ent("IFCSTRUCTURALLINEARACTION",
          w.guid(`last:${last.id}`), "$", stepString(`q ${last.id}`), "$", "$",
          "$", "$", ref(qLast), ".GLOBAL_COORDS.", "$", ".TRUE_LENGTH.", ".CONST.");
      } else if (!deellast) {
        // Trapezium over de volle lengte: twee waarden op 0 en L.
        const q1 = lijnkracht(qA, `q ${last.id} begin`);
        const q2 = lijnkracht(qB, `q ${last.id} eind`);
        const config = w.ent("IFCSTRUCTURALLOADCONFIGURATION",
          stepString(`q ${last.id}`), lijst([q1, q2]),
          `((0.),(${reeel(L)}))`);
        actie = w.ent("IFCSTRUCTURALCURVEACTION",
          w.guid(`last:${last.id}`), "$", stepString(`q ${last.id}`), "$", "$",
          "$", "$", ref(config), ".GLOBAL_COORDS.", "$", ".TRUE_LENGTH.", ".LINEAR.");
      } else {
        // Deellast: knikpunten op 0 (nul), a (qA), b (qB) en L (nul). De
        // punten buiten het belaste deel vallen weg als a = 0 of b = L; de
        // lezer interpoleert lineair tussen de opgegeven posities, dus dit
        // is een exacte weergave van de belaste strook.
        const nul = lijnkracht(0, `q ${last.id} nul`);
        const waarden: number[] = [];
        const posities: string[] = [];
        const a = fA * L, b = fB * L;
        if (fA > 0) { waarden.push(nul); posities.push(reeel(0)); }
        waarden.push(lijnkracht(qA, `q ${last.id} begin`)); posities.push(reeel(a));
        waarden.push(lijnkracht(qB, `q ${last.id} eind`));  posities.push(reeel(b));
        if (fB < 1) { waarden.push(nul); posities.push(reeel(L)); }
        const config = w.ent("IFCSTRUCTURALLOADCONFIGURATION",
          stepString(`q ${last.id}`), lijst(waarden),
          `(${posities.map(p => `(${p})`).join(",")})`);
        actie = w.ent("IFCSTRUCTURALCURVEACTION",
          w.guid(`last:${last.id}`), "$", stepString(`q ${last.id}`), "$", "$",
          "$", "$", ref(config), ".GLOBAL_COORDS.", "$", ".TRUE_LENGTH.", ".POLYGONAL.");
      }
    }
    w.ent("IFCRELCONNECTSSTRUCTURALACTIVITY",
      w.guid(`lastrel:${last.id}`), "$", "$", "$", ref(member), ref(actie));
    return actie;
  }

  console.warn(`[ifcExport] Lasttype "${last.type}" wordt niet geëxporteerd — overgeslagen.`);
  return undefined;
}

// ── Wat er NIET in het bestand komt ─────────────────────────────────────────

/**
 * Leesbare regels over modelonderdelen die deze IFC-vorm niet draagt. De
 * IFC-weergave toont ze in beeld: liever eerlijk melden dan stilzwijgend
 * weglaten. Lege lijst = het hele model staat in het bestand.
 */
export function verzamelIfcBeperkingen(
  model: IfcRekenmodelInput,
  opties: IfcExportOpties = {},
): string[] {
  const regels: string[] = [];

  const platen = model.plates?.length ?? 0;
  if (platen > 0) {
    regels.push(
      `${platen} ${platen === 1 ? "plaat" : "platen"}: platen worden niet ` +
      "geëxporteerd. IFC4 heeft hiervoor IfcStructuralSurfaceMember; deze " +
      "export schrijft alleen het staafwerk.",
    );
  }

  const randlasten = model.loads.filter(l => l.type === "edgeLoad").length;
  if (randlasten > 0) {
    regels.push(
      `${randlasten} ${randlasten === 1 ? "randbelasting" : "randbelastingen"} op een plaat: ` +
      "hoort bij een plaat en valt dus met de platen buiten het bestand.",
    );
  }

  if (opties.zonderLasten === true) {
    if (model.loads.length > 0 || model.loadCases.length > 0) {
      regels.push(
        `Structurele export: ${model.loads.length} belasting${model.loads.length === 1 ? "" : "en"} ` +
        `en ${model.loadCases.length} belastinggeval${model.loadCases.length === 1 ? "" : "len"} ` +
        "zijn bewust weggelaten — dit bestand bevat alleen het draagsysteem.",
      );
    }
  } else {
    if (model.eigenGewicht === true) {
      regels.push(
        "Eigen gewicht staat aan, maar is in het model geen belasting; het " +
        "wordt niet als zelfgewichtsbelasting in het bestand gezet.",
      );
    }
    const combinaties = model.aantalCombinaties ?? 0;
    if (combinaties > 0) {
      regels.push(
        `${combinaties} belastingcombinatie${combinaties === 1 ? "" : "s"}: alleen de ` +
        "losse belastinggevallen worden geëxporteerd, niet de combinaties " +
        "met hun factoren.",
      );
    }
  }

  // Staven met een profiel waarvan de afmetingen niet bekend zijn: die
  // krijgen wel materiaal en naam, maar geen parametrische doorsnede.
  const zonderDoorsnede = new Set<string>();
  for (const staaf of model.beams) {
    const materiaal = staaf.material ?? "S235";
    const profiel = staaf.profile ?? "HEA160";
    const bekend = isHoutMateriaal(materiaal)
      ? parseRechthoek(profiel) !== null
      : profielAfmetingen(profiel) !== undefined || parseRechthoek(profiel) !== null;
    if (!bekend) zonderDoorsnede.add(profiel);
  }
  if (zonderDoorsnede.size > 0) {
    regels.push(
      `Doorsnede onbekend voor ${[...zonderDoorsnede].sort().join(", ")}: die staven ` +
      "krijgen wel materiaal en profielnaam, maar geen parametrische " +
      "doorsnede (IFC4 kent geen profiel zonder afmetingen).",
    );
  }

  // Staven of lasten die naar iets verwijzen dat niet bestaat.
  const knoopIds = new Set(model.nodes.map(n => n.id));
  const staafIds = new Set(model.beams.map(b => b.id));
  const losseStaven = model.beams.filter(b => !knoopIds.has(b.from) || !knoopIds.has(b.to));
  if (losseStaven.length > 0) {
    regels.push(
      `${losseStaven.length} staaf/staven verwijzen naar een knoop die niet bestaat ` +
      `(${losseStaven.map(b => b.id).join(", ")}) — die staven zijn overgeslagen.`,
    );
  }
  if (opties.zonderLasten !== true) {
    const losseLasten = model.loads.filter(l => {
      if (l.type === "edgeLoad") return false;
      if (l.nodeId !== undefined) return !knoopIds.has(l.nodeId);
      if (l.beamId !== undefined) return !staafIds.has(l.beamId);
      return true;
    });
    if (losseLasten.length > 0) {
      regels.push(
        `${losseLasten.length} belasting(en) verwijzen naar een knoop of staaf die niet ` +
        `bestaat (${losseLasten.map(l => l.id).join(", ")}) — die zijn overgeslagen.`,
      );
    }
  }

  return regels;
}

// ── Boomstructuur van het geëxporteerde model ───────────────────────────────

export interface IfcBoomKnoop {
  /** IFC-entiteitsnaam, bv. "IfcStructuralPointConnection". */
  type: string;
  /** Leesbare naam of waarde. */
  naam: string;
  /** Aantal onderliggende items, als dat iets zegt. */
  aantal?: number;
  kinderen?: IfcBoomKnoop[];
}

/** Getal met komma als decimaalteken, voor de Nederlandse weergave. */
function nl(v: number, decimalen = 3): string {
  return v.toFixed(decimalen).replace(".", ",");
}

/**
 * De hiërarchie zoals hij in het geëxporteerde bestand staat — dus met de
 * echte knopen, staven, opleggingen en belastinggevallen van het model.
 */
export function bouwIfcBoom(
  model: IfcRekenmodelInput,
  opties: IfcExportOpties = {},
): IfcBoomKnoop {
  const projectNaam =
    model.project?.naam?.trim() || model.projectNaam?.trim() || "Rekenmodel";
  const locatie = model.project?.locatie?.trim() || "Terrein";
  const knoopNaam = new Map(model.nodes.map(n => [n.id, `Knoop ${n.id}`]));

  const knopen: IfcBoomKnoop = {
    type: "IfcStructuralPointConnection",
    naam: "Knopen",
    aantal: model.nodes.length,
    kinderen: model.nodes.map(n => ({
      type: "IfcVertexPoint",
      naam: `Knoop ${n.id} — x ${nl(n.x / 1000)} m, z ${nl(n.z / 1000)} m`,
    })),
  };

  const staven: IfcBoomKnoop = {
    type: "IfcStructuralCurveMember",
    naam: "Staven",
    aantal: model.beams.length,
    kinderen: model.beams.map(b => ({
      type: "IfcMaterialProfile",
      naam: `Staaf ${b.id} — ${b.material ?? "S235"} ${b.profile ?? "HEA160"} ` +
        `(${knoopNaam.get(b.from) ?? `knoop ${b.from}?`} → ${knoopNaam.get(b.to) ?? `knoop ${b.to}?`})`,
    })),
  };

  const opleggingNaam: Record<string, string> = {
    pinned: "Scharnieroplegging", fixed: "Inklemming",
    xRoller: "Rol (X vast)", zRoller: "Rol (Z vast)",
    zSpring: "Veer Z", xSpring: "Veer X", rotSpring: "Draaiveer",
  };
  const opleggingen: IfcBoomKnoop = {
    type: "IfcBoundaryNodeCondition",
    naam: "Opleggingen",
    aantal: model.supports.length,
    kinderen: model.supports.map(s => ({
      type: "IfcBoundaryNodeCondition",
      naam: `Knoop ${s.nodeId} — ${opleggingNaam[s.type] ?? s.type}` +
        (s.k !== undefined ? ` (k = ${nl(s.k, 2)})` : ""),
    })),
  };

  const kinderenModel: IfcBoomKnoop[] = [knopen, staven, opleggingen];

  if (opties.zonderLasten !== true) {
    const perGeval = new Map<number, number>();
    for (const l of model.loads) {
      if (l.type === "edgeLoad") continue;
      perGeval.set(l.caseId, (perGeval.get(l.caseId) ?? 0) + 1);
    }
    for (const geval of model.loadCases) {
      kinderenModel.push({
        type: "IfcStructuralLoadGroup",
        naam: geval.name,
        aantal: perGeval.get(geval.id) ?? 0,
        kinderen: model.loads
          .filter(l => l.caseId === geval.id && l.type !== "edgeLoad")
          .map(l => ({
            type: l.type === "lineLoad"
              ? "IfcStructuralCurveAction"
              : l.type === "thermal"
                ? "IfcStructuralLinearAction"
                : "IfcStructuralPointAction",
            naam: omschrijfLast(l),
          })),
      });
    }
  }

  return {
    type: "IfcProject",
    naam: projectNaam,
    kinderen: [{
      type: "IfcSite",
      naam: locatie,
      kinderen: [{
        type: "IfcBuilding",
        naam: "Gebouw",
        kinderen: [{
          type: "IfcStructuralAnalysisModel",
          naam: `Rekenmodel ${projectNaam}`,
          kinderen: kinderenModel,
        }],
      }],
    }],
  };
}

/** Eenregelige omschrijving van een belasting, met eenheden. */
function omschrijfLast(l: Load): string {
  const doel = l.nodeId !== undefined
    ? `knoop ${l.nodeId}`
    : l.beamId !== undefined ? `staaf ${l.beamId}` : "?";
  switch (l.type) {
    case "pointForce": {
      const delen: string[] = [];
      if (l.fx !== undefined && l.fx !== 0) delen.push(`Fx ${nl(l.fx, 2)} kN`);
      if (l.fz !== undefined && l.fz !== 0) delen.push(`Fz ${nl(l.fz, 2)} kN`);
      const plek = l.posFrac !== undefined ? ` op ${nl(l.posFrac * 100, 0)}%` : "";
      return `Puntlast ${l.id} — ${delen.join(", ") || "0 kN"} op ${doel}${plek}`;
    }
    case "pointMoment":
      return `Moment ${l.id} — My ${nl(l.my ?? 0, 2)} kNm op ${doel}`;
    case "thermal":
      return `Temperatuur ${l.id} — ΔT ${nl(l.deltaT ?? 0, 1)} K op ${doel}`;
    case "lineLoad": {
      const qA = l.qStart ?? l.q ?? 0;
      const qB = l.qEnd ?? l.q ?? 0;
      const waarde = qA === qB ? `${nl(qA, 2)} kN/m` : `${nl(qA, 2)} → ${nl(qB, 2)} kN/m`;
      const deel = (l.startFrac ?? 0) > 0 || (l.endFrac ?? 1) < 1
        ? ` (deel ${nl((l.startFrac ?? 0) * 100, 0)}–${nl((l.endFrac ?? 1) * 100, 0)}%)`
        : "";
      const stelsel = l.qCoord === "local" ? " lokaal" : "";
      return `Lijnlast ${l.id} — ${waarde} ${l.qDir ?? "z"}${stelsel} op ${doel}${deel}`;
    }
    default:
      return `Belasting ${l.id} (${l.type}) op ${doel}`;
  }
}

// ── Validatie van het geschreven bestand ────────────────────────────────────

export interface IfcValidatie {
  fouten: string[];
  waarschuwingen: string[];
  /** Aantal entiteiten (#n=…) in de DATA-sectie. */
  entiteiten: number;
  regels: number;
}

const GUID_TEKENS_SET = new Set(IFC_GUID_TEKENS);

/**
 * De IfcRoot-afgeleiden die deze export schrijft. Alleen zij dragen een
 * GlobalId als eerste attribuut; bij de rest is het eerste attribuut een
 * gewone naam.
 */
const GEWORTELDE_ENTITEITEN = [
  "IFCPROJECT", "IFCSITE", "IFCBUILDING",
  "IFCSTRUCTURALANALYSISMODEL", "IFCSTRUCTURALLOADGROUP",
  "IFCSTRUCTURALPOINTCONNECTION", "IFCSTRUCTURALCURVEMEMBER",
  "IFCSTRUCTURALPOINTACTION", "IFCSTRUCTURALLINEARACTION",
  "IFCSTRUCTURALCURVEACTION",
  "IFCRELAGGREGATES", "IFCRELSERVICESBUILDINGS",
  "IFCRELCONNECTSSTRUCTURALMEMBER", "IFCRELCONNECTSSTRUCTURALACTIVITY",
  "IFCRELASSOCIATESMATERIAL", "IFCRELASSIGNSTOGROUP",
] as const;

/**
 * Controleert een geschreven IFC-bestand: STEP-omlijsting, regelvorm,
 * unieke #id's, referentie-integriteit, GlobalId-vorm en -uniciteit, en de
 * aanwezigheid van de entiteiten die een StructuralAnalysisView nodig heeft.
 * Puur tekstueel — geen schema-validator, maar wel de fouten die een export
 * in de praktijk maakt.
 */
export function valideerIfc(ifc: string): IfcValidatie {
  const fouten: string[] = [];
  const waarschuwingen: string[] = [];
  const regels = ifc.split("\n");

  if (!ifc.startsWith("ISO-10303-21;")) fouten.push("Bestand begint niet met ISO-10303-21;");
  if (!ifc.trimEnd().endsWith("END-ISO-10303-21;")) fouten.push("Bestand eindigt niet met END-ISO-10303-21;");
  if (!ifc.includes("\nHEADER;\n")) fouten.push("HEADER-sectie ontbreekt");
  if (!ifc.includes("\nDATA;\n")) fouten.push("DATA-sectie ontbreekt");
  if ((ifc.match(/^ENDSEC;$/gm) ?? []).length !== 2) fouten.push("Er horen precies twee ENDSEC;-regels te staan");
  if (!/FILE_SCHEMA\(\('IFC4[^']*'\)\);/.test(ifc)) fouten.push("FILE_SCHEMA noemt geen IFC4-schema");
  if (!/FILE_NAME\(/.test(ifc)) fouten.push("FILE_NAME ontbreekt in de header");
  if (!/FILE_DESCRIPTION\(/.test(ifc)) fouten.push("FILE_DESCRIPTION ontbreekt in de header");

  const gedefinieerd = new Set<string>();
  const dubbeleIds: string[] = [];
  let entiteiten = 0;
  const vormfouten: string[] = [];

  for (const regel of regels) {
    if (!regel.startsWith("#")) continue;
    entiteiten++;
    const m = /^#(\d+)=([A-Z][A-Z0-9_]*)\((.*)\);$/.exec(regel);
    if (!m) { vormfouten.push(regel.slice(0, 60)); continue; }
    if (gedefinieerd.has(m[1])) dubbeleIds.push(`#${m[1]}`);
    gedefinieerd.add(m[1]);
    // Haakjesbalans buiten strings.
    let diepte = 0, inString = false;
    const args = m[3];
    for (let i = 0; i < args.length; i++) {
      const c = args[i];
      if (inString) { if (c === "'") inString = false; continue; }
      if (c === "'") inString = true;
      else if (c === "(") diepte++;
      else if (c === ")") diepte--;
      if (diepte < 0) break;
    }
    if (diepte !== 0 || inString) vormfouten.push(`#${m[1]}: ongebalanceerde haakjes of string`);
  }
  if (vormfouten.length > 0) {
    fouten.push(`${vormfouten.length} regel(s) met een ongeldige entiteitsvorm: ${vormfouten.slice(0, 3).join(" | ")}`);
  }
  if (dubbeleIds.length > 0) fouten.push(`Dubbele entiteits-id's: ${dubbeleIds.slice(0, 5).join(", ")}`);

  const kapot: string[] = [];
  for (const regel of regels) {
    const eq = regel.indexOf("=");
    if (!regel.startsWith("#") || eq < 0) continue;
    for (const m of regel.slice(eq + 1).matchAll(/#(\d+)/g)) {
      if (!gedefinieerd.has(m[1])) kapot.push(`${regel.slice(0, eq)} → #${m[1]}`);
    }
  }
  if (kapot.length > 0) {
    fouten.push(`${kapot.length} verwijzing(en) naar een niet-bestaande entiteit: ${kapot.slice(0, 3).join(", ")}`);
  }

  // Alleen IfcRoot-afgeleiden dragen een GlobalId. Alle andere entiteiten
  // mogen een gewone naam als eerste attribuut hebben — die is geen GUID en
  // hoort dus niet mee te tellen.
  const guids = [...ifc.matchAll(
    new RegExp(`^#\\d+=(?:${[...GEWORTELDE_ENTITEITEN].join("|")})\\('([^']*)'`, "gm"),
  )].map(m => m[1]);
  const foutieveGuids = guids.filter(
    g => g.length !== 22 || [...g].some(c => !GUID_TEKENS_SET.has(c)),
  );
  if (foutieveGuids.length > 0) {
    fouten.push(`${foutieveGuids.length} GlobalId('s) met een ongeldige vorm (22 tekens IFC-base64 verwacht)`);
  }
  if (new Set(guids).size !== guids.length) fouten.push("Niet alle GlobalId's zijn uniek");

  if (/\bundefined\b/.test(ifc)) fouten.push("Het bestand bevat de tekst 'undefined'");
  if (/\bNaN\b/.test(ifc)) fouten.push("Het bestand bevat de tekst 'NaN'");

  for (const verplicht of [
    "IFCPROJECT", "IFCUNITASSIGNMENT", "IFCGEOMETRICREPRESENTATIONCONTEXT",
    "IFCSTRUCTURALANALYSISMODEL",
  ]) {
    if (!new RegExp(`^#\\d+=${verplicht}\\(`, "m").test(ifc)) {
      fouten.push(`Verplichte entiteit ${verplicht} ontbreekt`);
    }
  }

  if (!/^#\d+=IFCSTRUCTURALPOINTCONNECTION\(/m.test(ifc)) {
    waarschuwingen.push("Geen enkele knoop in het bestand — is er een model geopend?");
  }
  if (!/^#\d+=IFCSTRUCTURALCURVEMEMBER\(/m.test(ifc)) {
    waarschuwingen.push("Geen enkele staaf in het bestand.");
  }
  if (!/^#\d+=IFCBOUNDARYNODECONDITION\(/m.test(ifc)) {
    waarschuwingen.push("Geen enkele oplegging in het bestand — het model is niet gesteund.");
  }

  return { fouten, waarschuwingen, entiteiten, regels: regels.length };
}

/** Entiteitstelling per type, aflopend gesorteerd — voor "Statistieken". */
export function ifcStatistiek(ifc: string): Array<{ type: string; aantal: number }> {
  const telling = new Map<string, number>();
  for (const m of ifc.matchAll(/^#\d+=([A-Z][A-Z0-9_]*)\(/gm)) {
    telling.set(m[1], (telling.get(m[1]) ?? 0) + 1);
  }
  return [...telling.entries()]
    .map(([type, aantal]) => ({ type, aantal }))
    .sort((a, b) => b.aantal - a.aantal || a.type.localeCompare(b.type));
}

// ── Download-helper (browser) ───────────────────────────────────────────────

/** Biedt een tekstbestand aan als download (blob, zoals de CSV-export). */
export function downloadTekstbestand(
  inhoud: string,
  bestandsnaam: string,
  mimeType = "application/x-step",
): void {
  const blob = new Blob([inhoud], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaam;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Bouwt het IFC-bestand en biedt het aan als download. Bestandsnaam default:
 * "<projectNaam>.ifc". Retourneert de geschreven inhoud, zodat de aanroeper
 * hem kan valideren of tonen — wat wegschrijft en wat in beeld staat is
 * daarmee gegarandeerd dezelfde tekst.
 */
export function downloadIfc(
  model: IfcRekenmodelInput,
  bestandsnaam?: string,
  opties: IfcExportOpties = {},
): string {
  const standaardNaam = model.project?.naam?.trim() || model.projectNaam?.trim() || "rekenmodel";
  const veiligeNaam = (bestandsnaam ?? `${standaardNaam}.ifc`)
    .replace(/[\\/:*?"<>|]/g, "_");
  const naamMetExt = veiligeNaam.toLowerCase().endsWith(".ifc")
    ? veiligeNaam : `${veiligeNaam}.ifc`;
  const inhoud = bouwIfcRekenmodel(model, {
    ...opties,
    bestandsnaam: naamMetExt,
    tijdstempel: new Date().toISOString().slice(0, 19),
  });
  downloadTekstbestand(inhoud, naamMetExt);
  return inhoud;
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

  // Catalogusprofiel: h/b/tw/tf/r uit de gedeelde tabel. Bij SHS/RHS is
  // tw = tf = wanddikte en r de hoekstraal; bij CHS is h = b = uitwendige
  // diameter en tw = wanddikte.
  const dims = profielAfmetingen(profiel);
  if (dims) {
    switch (dims.kind) {
      case "ISection":
        return w.ent("IFCISHAPEPROFILEDEF",
          ".AREA.", naam, "$", meter(dims.b), meter(dims.h),
          meter(dims.tw), meter(dims.tf), meter(dims.r), "$", "$");
      case "Channel":
        return w.ent("IFCUSHAPEPROFILEDEF",
          ".AREA.", naam, "$", meter(dims.h), meter(dims.b),
          meter(dims.tw), meter(dims.tf), meter(dims.r), "$", "$");
      case "Shs":
      case "Rhs":
        return w.ent("IFCRECTANGLEHOLLOWPROFILEDEF",
          ".AREA.", naam, "$", meter(dims.b), meter(dims.h),
          meter(dims.tw), "$", dims.r > 0 ? meter(dims.r) : "$");
      case "Chs":
        return w.ent("IFCCIRCLEHOLLOWPROFILEDEF",
          ".AREA.", naam, "$", meter(dims.h / 2), meter(dims.tw));
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
