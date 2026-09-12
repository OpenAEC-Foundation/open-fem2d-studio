/**
 * ifcExport.ts — IFC4-export van het rekenmodel (Structural Analysis Domain)
 * MÉT het bouwkundige model dat ernaast hoort.
 *
 * Schrijft een geldig STEP Physical File (ISO 10303-21, "SPF") zonder externe
 * dependencies. Er staan TWEE modellen in het bestand, aan elkaar geknoopt:
 *
 *  1. het ANALYTISCHE model — knopen, staven, profielen, materialen,
 *     opleggingen en lasten (IfcStructuralAnalysisModel en wat daaronder
 *     hangt);
 *  2. het BOUWKUNDIGE model — IfcBeam en IfcColumn met hun werkelijke
 *     doorsnede als geëxtrudeerd lichaam, en bij een betonstaaf met
 *     wapeningskorf de IfcReinforcingBar's daarin.
 *
 * De koppeling tussen beide is IfcRelAssignsToProduct: de rekenstaaf wijst
 * naar het bouwkundige element dat hij voorstelt. Dat is de weg die IFC4
 * daarvoor heeft; zonder die relatie zijn het twee losse modellen in één
 * bestand en moet de lezer maar raden welke staaf bij welke ligger hoort.
 *
 * Waarom het bouwkundige model erbij hoort: een bestand met alleen het
 * rekenmodel laat de constructie mét haar lasten zien, maar niet WAARMEE ze
 * gebouwd is. Een ontvanger ziet dan een lijnenspel zonder doorsnede, zonder
 * wapening en zonder de uitslag van de toetsing.
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
 *    Verende aansluitingen (Beam.veren) gaan dezelfde weg, als stijfheids-
 *    maat op het DOF (IfcLinearStiffnessMeasure N/m, IfcRotationalStiffness-
 *    Measure N·m/rad); bedding staat als BeddingK/BeddingBreedte in de set
 *    OpenFEM2D_Staaf, want IFC4 heeft daar geen eigen entiteit voor in dit
 *    domein.
 *  - Eigen doorsneden ("EIGEN:<naam>"): een samenstelling wordt een
 *    IfcCompositeProfileDef van rechthoeken (lamellen, elk op zijn plaats en
 *    hoek) en parametrische catalogusdelen; een catalogusprofiel met gaten
 *    blijft het parametrische basisprofiel met de gaten in de vormaanduiding.
 *    h, b en de doorsnedegrootheden komen uit de bewaarde motoruitkomst.
 *  - Belastingcombinaties: één IfcStructuralLoadGroup (LOAD_COMBINATION) per
 *    combinatie, met per belastinggeval een IfcRelAssignsToGroupByFactor die
 *    de factor draagt; UGT/BGT staat in Purpose.
 *  - Platen (wandschijven): IfcStructuralSurfaceMember (SHELL) met de dikte
 *    op het lid, een IfcFaceSurface in het rekenvlak met de hoekknopen als
 *    IfcPolyLoop, IfcRelConnectsStructuralMember naar elke hoekknoop, en de
 *    set OpenFEM2D_Plaat (dikte, E, ν, ρ, meshgrootte). Randlasten op een
 *    plaat: IfcStructuralLinearAction met de rand (IfcEdge van de twee
 *    hoekknopen) als eigen topologie, gekoppeld aan het vlaklid.
 *  - Stramien: IfcGrid (RECTANGULAR) in het gebouw, de x-assen als UAxes en
 *    de z-assen als VAxes, elk een IfcGridAxis met het aslabel en een lijn
 *    over de omhullende van het model. Rekeninstellingen (analysetype,
 *    scheefstand met noemer, richting en bron) staan als set
 *    OpenFEM2D_Analyse op het IfcStructuralAnalysisModel.
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
 *  - EIGENSCHAPPENSETS. Elke staaf krijgt drie sets: `OpenFEM2D_Doorsnede`
 *    (profielnaam, materiaal, vorm, h/b, A, I, E), `OpenFEM2D_Staaf`
 *    (staafnummer, staaftype, ligger/kolom, lengte, helling, scharnieren) en
 *    — zodra er een toetsuitslag is — `OpenFEM2D_Toetsing` (norm,
 *    maatgevende toets, normartikel, unity check, voldoet ja/nee). Dezelfde
 *    set hangt via één IfcRelDefinesByProperties aan zowel de rekenstaaf als
 *    het bouwkundige element.
 *
 *    WAAROM EIGEN NAMEN EN GEEN Pset_*: de Pset-namen van IFC4 zijn
 *    genormeerd en hun eigenschapsnamen ook. Voor "welke unity check haalt
 *    deze staaf onder welk normartikel" bestaat er geen genormeerde set; een
 *    bestaande naam oprekken zou een lezer een betekenis voorspiegelen die
 *    er niet is. Alleen waar de standaard wél past worden standaardnamen
 *    gebruikt: Pset_BeamCommon/Pset_ColumnCommon (Reference, LoadBearing) en
 *    Qto_BeamBaseQuantities/Qto_ColumnBaseQuantities (Length,
 *    CrossSectionArea, GrossVolume).
 *  - BOUWKUNDIG MODEL. Per staaf één IfcBeam of IfcColumn — de scheiding is
 *    de 75°-grens van `isOverwegendVerticaal` (steelCheckBuilder.ts), exact
 *    dezelfde grens die `bepaalStandaardRol` (femTypes.ts) voor het
 *    staaftype hanteert; twee drempels in één app zou betekenen dat dezelfde
 *    staaf in de tabel een kolom is en in het IFC-bestand een ligger. Het
 *    lichaam is een IfcExtrudedAreaSolid van dezelfde IfcProfileDef die het
 *    rekenmodel gebruikt, geplaatst met lokaal-z langs de staafas en
 *    lokaal-y in het rekenvlak loodrecht daarop (de hoogterichting van de
 *    doorsnede). De elementen hangen met IfcRelContainedInSpatialStructure in
 *    het gebouw. Zonder profieldefinitie (onbekend profiel) komt er GEEN
 *    bouwkundig element — een ligger zonder doorsnede is geen ligger.
 *  - WAPENING. Bij een betonstaaf met wapeningskorf komt de langswapening
 *    als één IfcReinforcingBar per staaf (.MAIN.) op zijn werkelijke plaats
 *    in de doorsnede, met diameter, oppervlakte en lengte. De beugels komen
 *    als één IfcReinforcingBar (.LIGATURE.) die de hele beugelreeks
 *    voorstelt, met aantal en hart-op-hart in de eigen set
 *    `OpenFEM2D_Beugels` — losse beugelstaven zouden bij s = 100 mm over een
 *    lange ligger honderden entiteiten per staaf opleveren. Dat de beugels
 *    zo zijn samengevat staat in `verzamelIfcBeperkingen`. De staven hangen
 *    met IfcRelAggregates in het bouwkundige element.
 *
 * Bekende beperkingen: `verzamelIfcBeperkingen()` levert ze als leesbare
 * regels op, zodat de IFC-weergave in beeld kan zeggen wat er NIET in het
 * bestand staat in plaats van het stil weg te laten.
 */
import type {
  Node, Beam, Support, Load, LoadCase,
} from "../components/fem/femTypes";
import { rolVanStaaf, BEAM_LOAD_ROLE_LABEL } from "../components/fem/femTypes";
import {
  parseRechthoek, resolveSection, CONCRETE_E_CM,
} from "../lib/sectionResolver";
import { isOverwegendVerticaal } from "../lib/steelCheckBuilder";
import { parseConcreteSection } from "../lib/betonCheckBuilder";
import { isCltProfiel, parseCltProfiel } from "../lib/cltCheckBuilder";
import { SUPPORTED_TIMBER_GRADES } from "../lib/timberCheckBuilder";
import {
  STEEL_SECTION_DIMS,
  type SteelSectionDims, type SteelSectionProps,
} from "../lib/steelSectionDims.generated";
import type { MemberCheckResult } from "../lib/checkTypes";
import { isEigenProfiel, zoekEigenDoorsnede } from "../lib/profieleditor/eigenDoorsnedenStore";
import type { EigenDoorsnede } from "../lib/profieleditor/types";
import {
  normLabel, sectionLabel, gradeLabel,
  isSteelCheckResult, isConcreteCheckResult,
} from "../lib/checkTypes";
import type { ReinforcementCage } from "../lib/types/concrete/ReinforcementCage";

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
   * Platen in het model. Een plaat mét hoekknopen (`nodeIds`, minstens
   * drie) wordt een IfcStructuralSurfaceMember (SHELL) met zijn dikte,
   * verbonden aan de puntconnecties van zijn hoeken, en met de set
   * OpenFEM2D_Plaat (dikte, E, ν, ρ, meshgrootte). Een plaat zonder
   * hoekknopen kan niet getekend worden en wordt alleen geteld, zodat de
   * beperkingenlijst hem eerlijk meldt.
   */
  plates?: { id: number; nodeIds?: number[]; thickness?: number; E?: number; nu?: number; rho?: number; meshSize?: number }[];
  /** Staat de eigen-gewichtsberekening aan? Alleen voor de beperkingenlijst. */
  eigenGewicht?: boolean;
  /** Aantal belastingcombinaties. Alleen voor de beperkingenlijst. */
  aantalCombinaties?: number;
  /**
   * De belastingcombinaties: elk wordt een IfcStructuralLoadGroup met
   * PredefinedType LOAD_COMBINATION, en per belastinggeval een
   * IfcRelAssignsToGroupByFactor met de factor. Ontbreekt het veld, dan
   * blijven de combinaties uit het bestand (en de beperkingenlijst zegt dat).
   */
  combinations?: { id: number; name: string; type: "uls" | "sls"; factors: Map<number, number> }[];
  /**
   * Het stramien: als IfcGrid (RECTANGULAR) in het gebouw, met de x-assen
   * als UAxes en de z-assen als VAxes, elk een IfcGridAxis met label en een
   * lijn over de omhullende van het model. Alleen als het stramien aan staat
   * en minstens één as heeft.
   */
  structuralGrid?: { enabled: boolean; xAxes: { id: string; label: string; position: number }[]; zAxes: { id: string; label: string; position: number }[] };
  /** Rekeninstellingen voor de set OpenFEM2D_Analyse op het analysemodel. */
  analysetype?: string;
  scheefstand?: { enabled: boolean; noemer: number; richting: 1 | -1; bron?: string };
  /**
   * De uitslag van de normtoetsing per staaf (checkStore.results), als die er
   * is. ONTBREEKT het veld of is de lijst leeg — er is nog niet getoetst, of
   * de aanroeper geeft ze niet mee — dan blijft de set `OpenFEM2D_Toetsing`
   * eenvoudig weg en verandert er verder niets aan het bestand. Zo valt de
   * export nooit om op een model dat nog niet getoetst is.
   */
  toetsresultaten?: MemberCheckResult[];
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
  /**
   * Laat het BOUWKUNDIGE model weg: geen IfcBeam/IfcColumn, geen
   * IfcReinforcingBar, geen hoeveelheden — alleen het analytische model met
   * zijn eigenschappensets. Voor een ontvanger die uitsluitend de
   * StructuralAnalysisView leest en fysieke elementen als ruis ziet.
   * Standaard `false`: het bouwkundige model gaat mee.
   */
  zonderBouwkundig?: boolean;
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

/**
 * Herkenning betonsterkteklasse — dezelfde tabel als de solverstijfheid
 * (NEN-EN 1992-1-1 tabel 3.1, via `CONCRETE_E_CM`). Let op de volgorde bij
 * het gebruik: "C24" is hout en "C24/30" beton, dus hout wordt eerst
 * gevraagd; de betonklassen dragen altijd een schuine streep.
 */
function isBetonMateriaal(mat: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONCRETE_E_CM, mat.trim());
}

/**
 * IfcMaterial.Category — de gangbare aanduidingen uit de IFC-praktijk.
 * "concrete", "steel" en "wood" zijn geen enum maar een IfcLabel; ze staan
 * hier zodat een ontvanger het materiaal kan filteren zonder de naam te
 * hoeven ontleden.
 */
function materiaalCategorie(mat: string): string {
  if (isHoutMateriaal(mat)) return "wood";
  if (isBetonMateriaal(mat)) return "concrete";
  return "steel";
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

  // Plaatsingsketen terrein → gebouw → element. Het rekenmodel heeft hem niet
  // nodig (topologie draagt zijn eigen coördinaten), het bouwkundige model
  // wel: IfcBeam en IfcColumn hangen met hun IfcLocalPlacement aan het
  // gebouw, zoals elk fysiek element in IFC. Allebei op de oorsprong — het
  // model kent geen terreinverschuiving.
  const plaatsingTerrein = w.ent("IFCLOCALPLACEMENT", "$", ref(wereldAssen));
  const plaatsingGebouw = w.ent("IFCLOCALPLACEMENT",
    ref(plaatsingTerrein), ref(wereldAssen));

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
    "$", "$", ref(plaatsingTerrein), "$", "$",
    ".ELEMENT.", "$", "$", "$", "$", "$");
  const gebouw = w.ent("IFCBUILDING",
    w.guid("gebouw"), "$", "'Gebouw'", "$", "$", ref(plaatsingGebouw), "$", "$",
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

  // ── Belastingcombinaties ───────────────────────────────────────────────
  // Eén IfcStructuralLoadGroup (LOAD_COMBINATION) per combinatie, met per
  // belastinggeval een IfcRelAssignsToGroupByFactor die het geval mét zijn
  // factor in de combinatie zet — de weg die IFC4 daarvoor heeft. UGT en BGT
  // krijgen ActionType/ActionSource "USERDEFINED" met de soort in Purpose,
  // want de combinatie is geen enkelvoudige belastingsoort meer. Alleen
  // gevallen die ook echt in het bestand staan doen mee.
  const combinatieGroepen: number[] = [];
  const combinaties = zonderLasten ? [] : (model.combinations ?? []);
  for (const combo of combinaties) {
    const groep = w.ent("IFCSTRUCTURALLOADGROUP",
      w.guid(`combinatie:${combo.id}`), "$", stepString(combo.name), "$", "$",
      ".LOAD_COMBINATION.", ".USERDEFINED.", ".USERDEFINED.", "$",
      stepString(combo.type === "uls" ? "UGT" : "BGT"));
    combinatieGroepen.push(groep);
    const factoren = [...combo.factors.entries()]
      .filter(([caseId, f]) => f !== 0 && groepPerCase.has(caseId))
      .sort((a, b) => a[0] - b[0]);
    for (const [caseId, factor] of factoren) {
      w.ent("IFCRELASSIGNSTOGROUPBYFACTOR",
        w.guid(`combinatie:${combo.id}:geval:${caseId}`), "$", "$", "$",
        lijst([groepPerCase.get(caseId)!]), "$", ref(groep), reeel(factor));
    }
  }

  // ── Analysemodel (2D, XZ-vlak) ───────────────────────────────────────────
  // As van het rekenvlak = (0,-1,0) met refrichting (1,0,0): lokaal-x =
  // globaal-X, lokaal-y = globaal-Z (omhoog), rechtsdraaiend.
  const richtingMinY = w.ent("IFCDIRECTION", "(0.,-1.,0.)");
  const vlakAssen = w.ent("IFCAXIS2PLACEMENT3D",
    ref(oorsprong), ref(richtingMinY), ref(richtingX));
  const groepIds = [...groepPerCase.values(), ...combinatieGroepen];
  const analyseModel = w.ent("IFCSTRUCTURALANALYSISMODEL",
    w.guid("analysemodel"), "$", stepString(`Rekenmodel ${projectNaam}`), "$", "$",
    ".IN_PLANE_LOADING_2D.", ref(vlakAssen),
    groepIds.length > 0 ? lijst(groepIds) : "$", "$", "$");
  w.ent("IFCRELSERVICESBUILDINGS",
    w.guid("dienst:model-gebouw"), "$", "$", "$", ref(analyseModel), lijst([gebouw]));

  // ── Rekeninstellingen op het analysemodel ──────────────────────────────
  // Analysetype en scheefstand horen bij het rekenmodel als geheel; ze
  // staan als set OpenFEM2D_Analyse op het IfcStructuralAnalysisModel.
  {
    const eig: Eigenschap[] = [];
    if (model.analysetype) eig.push(eLabel("Analysetype", model.analysetype));
    if (model.scheefstand) {
      eig.push(eJaNee("Scheefstand", model.scheefstand.enabled));
      if (model.scheefstand.enabled) {
        eig.push(eGeheel("ScheefstandNoemer", model.scheefstand.noemer));
        eig.push(eLabel("ScheefstandRichting", model.scheefstand.richting > 0 ? "+x" : "-x"));
        if (model.scheefstand.bron) eig.push(eLabel("ScheefstandBron", model.scheefstand.bron));
      }
    }
    schrijfEigenschappen(w, "OpenFEM2D_Analyse", "analyse", eig, [analyseModel]);
  }

  // ── Stramien: IfcGrid in het gebouw ────────────────────────────────────
  // De x-assen (verticale lijnen op x = positie) als UAxes, de z-assen als
  // VAxes; elke as loopt over de omhullende van het model met wat marge,
  // zodat de lijn in een viewer iets buiten de constructie uitsteekt.
  // IfcGrid vraagt UAxes én VAxes; met maar één richting is er geen grid.
  const stramien = model.structuralGrid;
  if (stramien?.enabled && stramien.xAxes.length > 0 && stramien.zAxes.length > 0 && model.nodes.length > 0) {
    const xs = model.nodes.map((n) => n.x), zs = model.nodes.map((n) => n.z);
    const marge = 1000;
    const xMin = Math.min(...xs, ...stramien.xAxes.map((a) => a.position)) - marge;
    const xMax = Math.max(...xs, ...stramien.xAxes.map((a) => a.position)) + marge;
    const zMin = Math.min(...zs, ...stramien.zAxes.map((a) => a.position)) - marge;
    const zMax = Math.max(...zs, ...stramien.zAxes.map((a) => a.position)) + marge;
    const as = (label: string, p1: [number, number], p2: [number, number]) => {
      const a = w.ent("IFCCARTESIANPOINT", `(${meter(p1[0])},0.,${meter(p1[1])})`);
      const b = w.ent("IFCCARTESIANPOINT", `(${meter(p2[0])},0.,${meter(p2[1])})`);
      const lijn = w.ent("IFCPOLYLINE", lijst([a, b]));
      return w.ent("IFCGRIDAXIS", stepString(label), ref(lijn), ".T.");
    };
    const uAssen = stramien.xAxes.map((a) => as(a.label, [a.position, zMin], [a.position, zMax]));
    const vAssen = stramien.zAxes.map((a) => as(a.label, [xMin, a.position], [xMax, a.position]));
    const grid = w.ent("IFCGRID",
      w.guid("stramien"), "$", "'Stramien'", "$", "$", "$", "$",
      lijst(uAssen), lijst(vAssen), "$", ".RECTANGULAR.");
    w.ent("IFCRELCONTAINEDINSPATIALSTRUCTURE",
      w.guid("bevat:stramien"), "$", "$", "$", lijst([grid]), ref(gebouw));
  }

  // ── Knopen: puntconnecties + opleggingen ─────────────────────────────────
  const steunPerKnoop = new Map<number, Support>();
  for (const s of model.supports) steunPerKnoop.set(s.nodeId, s);

  const connectiePerKnoop = new Map<number, number>();
  const vertexPerKnoop = new Map<number, number>();
  const puntPerKnoop = new Map<number, number>();
  for (const kn of model.nodes) {
    const punt = w.ent("IFCCARTESIANPOINT",
      `(${meter(kn.x)},0.,${meter(kn.z)})`);
    const vertex = w.ent("IFCVERTEXPOINT", ref(punt));
    vertexPerKnoop.set(kn.id, vertex);
    puntPerKnoop.set(kn.id, punt);
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
  /** De staven die het bestand werkelijk haalden, in modelvolgorde. */
  const verwerkteStaven: VerwerkteStaaf[] = [];
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
    verwerkteStaven.push({
      staaf, materiaal, profiel, member,
      lengteMm, ux: lengteMm > 0 ? (naar.x - van.x) / lengteMm : 1,
      uz: lengteMm > 0 ? (naar.z - van.z) / lengteMm : 0,
      xMmVan: van.x, zMmVan: van.z,
      // Hoek met de horizontaal in radialen, 0..π/2 — dezelfde grootheid als
      // `hellingGradenVanStaaf` (steelCheckBuilder.ts), maar in de eenheid
      // die IfcPlaneAngleMeasure hier heeft (RADIAN in de eenhedenlijst).
      hellingRad: Math.atan2(
        Math.abs(naar.z - van.z), Math.abs(naar.x - van.x)),
      kolom: isOverwegendVerticaal(staaf, model.nodes),
      staaftype: BEAM_LOAD_ROLE_LABEL[rolVanStaaf(staaf, model.nodes)],
    });

    // Verbinding met beide knopen; releases én veren als expliciete
    // randvoorwaarde op de eindverbinding: een los DOF = IfcBoolean(.F.),
    // een veer = stijfheidsmaat (kN/mm → N/m ×1e6, kNm/rad → N·m/rad ×1e3),
    // star = IfcBoolean(.T.). Een release wint van een veer, net als in de
    // rekenkern.
    const veer = staaf.veren ?? {};
    const einden: Array<["start" | "eind", number, boolean?, boolean?, boolean?, number?, number?, number?]> = [
      ["start", connectiePerKnoop.get(staaf.from)!, rel.startTx, rel.startTz, rel.startRy, veer.startTx, veer.startTz, veer.startRy],
      ["eind",  connectiePerKnoop.get(staaf.to)!,   rel.endTx,   rel.endTz,   rel.endRy,   veer.endTx,   veer.endTz,   veer.endRy],
    ];
    for (const [kant, connectie, losTx, losTz, losRy, kTx, kTz, kRy] of einden) {
      let conditie: number | undefined;
      const veerTx = losTx !== true && kTx !== undefined && kTx > 0;
      const veerTz = losTz !== true && kTz !== undefined && kTz > 0;
      const veerRy = losRy !== true && kRy !== undefined && kRy > 0;
      if (losTx === true || losTz === true || losRy === true || veerTx || veerTz || veerRy) {
        const dof = (los: boolean | undefined, veer: boolean, k: number | undefined, draai: boolean) =>
          los === true ? "IFCBOOLEAN(.F.)"
            : veer ? (draai ? `IFCROTATIONALSTIFFNESSMEASURE(${reeel(k! * 1e3)})` : `IFCLINEARSTIFFNESSMEASURE(${reeel(k! * 1e6)})`)
              : "IFCBOOLEAN(.T.)";
        conditie = w.ent("IFCBOUNDARYNODECONDITION",
          stepString(veerTx || veerTz || veerRy ? "Verende aansluiting" : "Scharnier"),
          dof(losTx, veerTx, kTx, false), "$",
          dof(losTz, veerTz, kTz, false), "$",
          dof(losRy, veerRy, kRy, true), "$");
      }
      w.ent("IFCRELCONNECTSSTRUCTURALMEMBER",
        w.guid(`staafrel:${staaf.id}:${kant}`), "$", "$", "$",
        ref(member), ref(connectie),
        conditie !== undefined ? ref(conditie) : "$", "$", "$", "$");
    }
  }

  // ── Materiaal + profiel per unieke combinatie ────────────────────────────
  // De koppelrelatie zelf volgt verderop: het bouwkundige model moet er
  // eerst zijn, zodat IfcBeam en IfcColumn aan dezelfde koppeling hangen.
  const combos = schrijfMaterialenEnProfielen(w, model.beams, memberPerStaaf);

  // ── Platen: IfcStructuralSurfaceMember (SHELL) ────────────────────────
  // Topologie: één IfcFaceSurface in het rekenvlak met de hoekknopen als
  // IfcPolyLoop — dezelfde punten als de puntconnecties, zodat een lezer de
  // plaat aan de knopen kan hangen. De dikte staat op het lid zelf; E, ν, ρ
  // en de meshgrootte in de set OpenFEM2D_Plaat, want een wandschijf zonder
  // materiaalnaam heeft geen IfcMaterialProfile.
  const plaatInfo = new Map<number, PlaatInfo>();
  const knoopPerId = new Map<number, Node>(model.nodes.map((n) => [n.id, n]));
  for (const plaat of model.plates ?? []) {
    const ids = (plaat.nodeIds ?? []).filter((id) => puntPerKnoop.has(id));
    if (ids.length < 3) continue;
    const lus = w.ent("IFCPOLYLOOP", lijst(ids.map((id) => puntPerKnoop.get(id)!)));
    const rand = w.ent("IFCFACEOUTERBOUND", ref(lus), ".T.");
    const vlak = w.ent("IFCPLANE", ref(vlakAssen));
    const vlakStuk = w.ent("IFCFACESURFACE", lijst([rand]), ref(vlak), ".T.");
    const topo = w.ent("IFCTOPOLOGYREPRESENTATION",
      ref(context), "'Reference'", "'Face'", lijst([vlakStuk]));
    const vorm = w.ent("IFCPRODUCTDEFINITIONSHAPE", "$", "$", lijst([topo]));
    const dikteMm = plaat.thickness ?? 20;
    const member = w.ent("IFCSTRUCTURALSURFACEMEMBER",
      w.guid(`plaat:${plaat.id}`), "$", stepString(`Plaat ${plaat.id}`),
      stepString(`wandschijf t = ${nl(dikteMm, 0)} mm`), "$", "$", ref(vorm),
      ".SHELL.", `IFCPOSITIVELENGTHMEASURE(${reeel(dikteMm / 1000)})`);
    for (const id of ids) {
      w.ent("IFCRELCONNECTSSTRUCTURALMEMBER",
        w.guid(`plaatrel:${plaat.id}:${id}`), "$", "$", "$",
        ref(member), ref(connectiePerKnoop.get(id)!), "$", "$", "$", "$");
    }
    const eig: Eigenschap[] = [
      eGeheel("Plaatnummer", plaat.id),
      eMaat("Dikte", "IFCPOSITIVELENGTHMEASURE", dikteMm / 1000),
      eMaat("Elasticiteitsmodulus", "IFCMODULUSOFELASTICITYMEASURE", (plaat.E ?? 210000) * 1e6),
      eMaat("Dwarscontractiecoefficient", "IFCRATIOMEASURE", plaat.nu ?? 0.3),
      eMaat("Dichtheid", "IFCMASSDENSITYMEASURE", plaat.rho ?? 7850),
      eMaat("Meshgrootte", "IFCPOSITIVELENGTHMEASURE", (plaat.meshSize ?? 500) / 1000),
      eLabel("Hoekknopen", ids.join(", ")),
    ];
    schrijfEigenschappen(w, "OpenFEM2D_Plaat", `plaat:${plaat.id}`, eig, [member]);
    plaatInfo.set(plaat.id, { member, nodeIds: ids, knopen: knoopPerId, vertexPerKnoop });
  }

  // ── Lasten ───────────────────────────────────────────────────────────────
  const actiesPerGroep = new Map<number, number[]>();
  for (const last of teExporterenLasten) {
    const actie = schrijfLast(w, last, connectiePerKnoop, memberPerStaaf, staafInfo, context, plaatInfo);
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

  // ── Bouwkundig model: IfcBeam / IfcColumn en de wapening ─────────────────
  const bouwkundig = opties.zonderBouwkundig === true
    ? new Map<number, number>()
    : schrijfBouwkundigModel(w, {
      staven: verwerkteStaven, combos, context,
      plaatsingGebouw, gebouw, richtingZ, richtingY, oorsprong,
    });

  // ── Materiaalkoppeling: rekenstaaf én bouwkundig element ─────────────────
  for (const staafje of verwerkteStaven) {
    const element = bouwkundig.get(staafje.staaf.id);
    if (element === undefined) continue;
    combos.get(comboSleutel(staafje.materiaal, staafje.profiel))?.objecten.push(element);
  }
  schrijfMateriaalkoppelingen(w, combos);

  // ── Eigenschappensets per staaf ──────────────────────────────────────────
  schrijfStaafEigenschappen(w, verwerkteStaven, combos, bouwkundig, model.toetsresultaten);

  // ── Leden van het analysemodel ───────────────────────────────────────────
  const leden = [
    ...connectiePerKnoop.values(),
    ...memberPerStaaf.values(),
    ...[...plaatInfo.values()].map((p) => p.member),
  ];
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
  // FILE_DESCRIPTION draagt de MVD-aanduiding plus, waar het bouwkundige
  // model meegaat, één eigen zin die zegt wat er nog meer in staat. Die zin
  // is met opzet GEEN tweede ViewDefinition-naam: de MVD-namen zijn
  // genormeerd en er bestaat er geen die "rekenmodel plus staven en wapening"
  // dekt. Een verzonnen naam zou een ontvanger een contract voorspiegelen.
  const beschrijving = [
    "'ViewDefinition [StructuralAnalysisView]'",
    ...(opties.zonderBouwkundig === true ? [] : [
      "'Rekenmodel met bouwkundige staven (IfcBeam/IfcColumn) en wapening'",
    ]),
  ].join(",");
  return [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION((${beschrijving}),'2;1');`,
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

/** Alles wat één (materiaal, profiel)-combinatie in het bestand oplevert. */
interface ComboInfo {
  materiaal: string;
  profiel: string;
  /** #id van de IfcMaterial. */
  materiaalDef: number;
  /** Waar IfcRelAssociatesMaterial naar wijst: profielsetgebruik of materiaal. */
  koppeling: number;
  doorsnede: DoorsnedeInfo;
  /** Alles wat aan deze combinatie hangt: rekenstaven én bouwkundige elementen. */
  objecten: number[];
}

/** Sleutel van een (materiaal, profiel)-combinatie; ook de naam van de set. */
function comboSleutel(materiaal: string, profiel: string): string {
  return `${materiaal} ${profiel}`;
}

/**
 * Eén IfcMaterial per klasse en één profielset per unieke
 * (materiaal, profiel)-combinatie.
 *
 * De IfcRelAssociatesMaterial wordt hier NIET geschreven: het bouwkundige
 * model bestaat op dit punt nog niet, en IfcBeam en IfcColumn horen aan
 * dezelfde koppeling te hangen als de rekenstaaf die ze voorstellen. Zie
 * `schrijfMateriaalkoppelingen`, dat de relatie legt zodra alle objecten er
 * zijn — één relatie per combinatie in plaats van twee.
 */
function schrijfMaterialenEnProfielen(
  w: SpfSchrijver,
  staven: Beam[],
  memberPerStaaf: Map<number, number>,
): Map<string, ComboInfo> {
  const materiaalIds = new Map<string, number>();
  const materiaalId = (naam: string): number => {
    const bestaand = materiaalIds.get(naam);
    if (bestaand !== undefined) return bestaand;
    const id = w.ent("IFCMATERIAL",
      stepString(naam), "$", stepString(materiaalCategorie(naam)));
    materiaalIds.set(naam, id);
    return id;
  };

  // Groepeer staven per (materiaal, profiel)
  const rauw = new Map<string, { materiaal: string; profiel: string; members: number[] }>();
  for (const staaf of staven) {
    const member = memberPerStaaf.get(staaf.id);
    if (member === undefined) continue;
    const materiaal = staaf.material ?? "S235";
    const profiel = staaf.profile ?? "HEA160";
    const sleutel = comboSleutel(materiaal, profiel);
    const combo = rauw.get(sleutel) ?? { materiaal, profiel, members: [] };
    combo.members.push(member);
    rauw.set(sleutel, combo);
  }

  const combos = new Map<string, ComboInfo>();
  for (const [sleutel, { materiaal, profiel, members }] of rauw) {
    const materiaalDef = materiaalId(materiaal);
    const doorsnede = schrijfDoorsnede(w, materiaal, profiel);

    let koppeling: number;
    if (doorsnede.profielDef !== undefined) {
      const matProfiel = w.ent("IFCMATERIALPROFILE",
        stepString(profiel), "$", ref(materiaalDef), ref(doorsnede.profielDef), "$", "$");
      const profielSet = w.ent("IFCMATERIALPROFILESET",
        stepString(sleutel), "$", lijst([matProfiel]), "$");
      koppeling = w.ent("IFCMATERIALPROFILESETUSAGE", ref(profielSet), "$", "$");
    } else {
      // Onbekend profiel: IFC4 kent geen concreet naam-zonder-geometrie-
      // profiel (IfcProfileDef is abstract) — koppel alleen het materiaal.
      // De profielnaam blijft behouden in de Description van de staaf.
      console.warn(`[ifcExport] Profiel "${profiel}" onbekend — alleen materiaal gekoppeld.`);
      koppeling = materiaalDef;
    }
    combos.set(sleutel, {
      materiaal, profiel, materiaalDef, koppeling, doorsnede,
      objecten: [...members],
    });
  }
  return combos;
}

/** Eén IfcRelAssociatesMaterial per combinatie, over alles wat eraan hangt. */
function schrijfMateriaalkoppelingen(w: SpfSchrijver, combos: Map<string, ComboInfo>): void {
  for (const { materiaal, profiel, koppeling, objecten } of combos.values()) {
    if (objecten.length === 0) continue;
    w.ent("IFCRELASSOCIATESMATERIAL",
      w.guid(`matkoppeling:${materiaal}:${profiel}`), "$", "$", "$",
      lijst(objecten), ref(koppeling));
  }
}

// ── Eigenschappensets ───────────────────────────────────────────────────────

/**
 * Eén eigenschap in een IfcPropertySet: de naam plus de VOLLEDIG GETYPEERDE
 * STEP-waarde, bijvoorbeeld `IFCLABEL('S235')`. Het type staat er expliciet
 * bij omdat IfcPropertySingleValue.NominalValue een SELECT is: zonder
 * typenaam weet een lezer niet of `0.15` een lengte, een verhouding of een
 * gewoon getal is.
 */
interface Eigenschap {
  naam: string;
  waarde: string;
}

const eLabel = (naam: string, v: string): Eigenschap =>
  ({ naam, waarde: `IFCLABEL(${stepString(v)})` });
const eTekst = (naam: string, v: string): Eigenschap =>
  ({ naam, waarde: `IFCTEXT(${stepString(v)})` });
const eKenmerk = (naam: string, v: string): Eigenschap =>
  ({ naam, waarde: `IFCIDENTIFIER(${stepString(v)})` });
const eJaNee = (naam: string, v: boolean): Eigenschap =>
  ({ naam, waarde: `IFCBOOLEAN(${v ? ".T." : ".F."})` });
const eGeheel = (naam: string, v: number): Eigenschap =>
  ({ naam, waarde: `IFCINTEGER(${Math.round(v)})` });
/** Getypeerde meetwaarde; `type` is de IFC4-maatnaam, bv. IFCAREAMEASURE. */
const eMaat = (naam: string, type: string, v: number): Eigenschap =>
  ({ naam, waarde: `${type}(${reeel(v)})` });

/**
 * Schrijft een eigenschappenset en hangt hem aan de opgegeven objecten.
 * Lege set of geen objecten: er komt niets in het bestand. Zo valt de export
 * niet om op een model dat de gegevens niet heeft.
 */
function schrijfEigenschappen(
  w: SpfSchrijver,
  setNaam: string,
  seed: string,
  eigenschappen: Eigenschap[],
  objecten: number[],
): void {
  if (eigenschappen.length === 0 || objecten.length === 0) return;
  const ids = eigenschappen.map(e => w.ent("IFCPROPERTYSINGLEVALUE",
    stepString(e.naam), "$", e.waarde, "$"));
  const set = w.ent("IFCPROPERTYSET",
    w.guid(`pset:${seed}`), "$", stepString(setNaam), "$", lijst(ids));
  w.ent("IFCRELDEFINESBYPROPERTIES",
    w.guid(`psetrel:${seed}`), "$", "$", "$", lijst(objecten), ref(set));
}

// ── Bouwkundig model ────────────────────────────────────────────────────────

/** Eén staaf zoals hij het bestand haalde, met wat het vervolg nodig heeft. */
interface VerwerkteStaaf {
  staaf: Beam;
  materiaal: string;
  profiel: string;
  /** #id van de IfcStructuralCurveMember van deze staaf. */
  member: number;
  /** Staaflengte in mm (modelmaat). */
  lengteMm: number;
  /** Eenheidsvector van→naar in wereldassen (x rechts, z omhoog). */
  ux: number;
  uz: number;
  /** Beginknoop in mm. */
  xMmVan: number;
  zMmVan: number;
  /** Hoek met de horizontaal in radialen, 0..π/2. */
  hellingRad: number;
  /** Overwegend verticaal (≥ 75°) → kolom; anders ligger. */
  kolom: boolean;
  /** Staaftype-label uit femTypes (BEAM_LOAD_ROLE_LABEL). */
  staaftype: string;
}

/** Wat het bouwkundige model uit de hoofdopbouw meekrijgt. */
interface BouwkundigeInvoer {
  staven: VerwerkteStaaf[];
  combos: Map<string, ComboInfo>;
  /** De 'Model'-context waaronder de 'Body'-subcontext komt te hangen. */
  context: number;
  plaatsingGebouw: number;
  gebouw: number;
  /** IfcDirection (0,0,1) — de extrusierichting in het lokale assenstelsel. */
  richtingZ: number;
  /** IfcDirection (0,1,0) — de referentierichting van elk staafassenstelsel. */
  richtingY: number;
  /** IfcCartesianPoint (0,0,0). */
  oorsprong: number;
}

/**
 * Schrijft per staaf een IfcBeam of IfcColumn met zijn werkelijke doorsnede,
 * koppelt hem aan de rekenstaaf en hangt er de wapening in. Levert per
 * staaf-id het #id van het bouwkundige element.
 *
 * ASSENSTELSEL VAN EEN STAAF. Het lichaam is een extrusie langs de lokale z;
 * de plaatsing zet lokaal-z op de staafas (van→naar) en lokaal-x op de
 * globale +Y, de normaal op het rekenvlak. Lokaal-y = z × x volgt dan als
 * (−u_z, 0, u_x): voor een horizontale ligger is dat recht omhoog, voor een
 * kolom is het de richting in het rekenvlak. Dat is precies goed: de
 * doorsnede staat met haar HOOGTE in het vlak waarin gerekend wordt, dus het
 * lijf van een I-profiel ligt in het buigingsvlak — bij een ligger én bij een
 * kolom.
 *
 * Een staaf zonder profieldefinitie of met lengte nul krijgt GEEN bouwkundig
 * element: een ligger zonder doorsnede is geen ligger, en een extrusie met
 * diepte 0 is in IFC geen geldige IfcPositiveLengthMeasure. Beide gevallen
 * staan in `verzamelIfcBeperkingen`.
 */
function schrijfBouwkundigModel(
  w: SpfSchrijver,
  invoer: BouwkundigeInvoer,
): Map<number, number> {
  const uit = new Map<number, number>();
  const bruikbaar = invoer.staven.filter(s =>
    s.lengteMm > 0 &&
    invoer.combos.get(comboSleutel(s.materiaal, s.profiel))?.doorsnede.profielDef !== undefined);
  if (bruikbaar.length === 0) return uit;

  // Aparte 'Body'-subcontext voor de vaste geometrie: de bestaande
  // 'Reference'-representaties van het rekenmodel dragen topologie (punten en
  // randen) en horen niet met vaste lichamen door elkaar te lopen.
  const lichaamContext = w.ent("IFCGEOMETRICREPRESENTATIONSUBCONTEXT",
    "'Body'", "'Model'", "*", "*", "*", "*",
    ref(invoer.context), "$", ".MODEL_VIEW.", "$");
  // Assenstelsel op de oorsprong met de standaardrichtingen. Dient twee
  // doelen: de Position van elke extrusie en de plaatsing van elke
  // wapeningsstaaf ten opzichte van zijn element.
  const nulAssen = w.ent("IFCAXIS2PLACEMENT3D", ref(invoer.oorsprong), "$", "$");

  const elementen: number[] = [];
  const wapeningPerSoort = new Map<string, number[]>();

  for (const s of bruikbaar) {
    const combo = invoer.combos.get(comboSleutel(s.materiaal, s.profiel));
    const profielDef = combo?.doorsnede.profielDef;
    if (combo === undefined || profielDef === undefined) continue;
    const lengteM = s.lengteMm / 1000;

    const punt = w.ent("IFCCARTESIANPOINT",
      `(${meter(s.xMmVan)},0.,${meter(s.zMmVan)})`);
    const staafAs = w.ent("IFCDIRECTION", `(${reeel(s.ux)},0.,${reeel(s.uz)})`);
    const assen = w.ent("IFCAXIS2PLACEMENT3D",
      ref(punt), ref(staafAs), ref(invoer.richtingY));
    const plaatsing = w.ent("IFCLOCALPLACEMENT",
      ref(invoer.plaatsingGebouw), ref(assen));

    const lichaam = w.ent("IFCEXTRUDEDAREASOLID",
      ref(profielDef), ref(nulAssen), ref(invoer.richtingZ), reeel(lengteM));
    const weergave = w.ent("IFCSHAPEREPRESENTATION",
      ref(lichaamContext), "'Body'", "'SweptSolid'", lijst([lichaam]));
    const vorm = w.ent("IFCPRODUCTDEFINITIONSHAPE", "$", "$", lijst([weergave]));

    const soort = s.kolom ? "Kolom" : "Ligger";
    const element = w.ent(s.kolom ? "IFCCOLUMN" : "IFCBEAM",
      w.guid(`element:${s.staaf.id}`), "$",
      stepString(`${soort} ${s.staaf.id}`),
      stepString(comboSleutel(s.materiaal, s.profiel)), "$",
      ref(plaatsing), ref(vorm), stepString(String(s.staaf.id)),
      s.kolom ? ".COLUMN." : ".BEAM.");
    uit.set(s.staaf.id, element);
    elementen.push(element);

    // De brug tussen beide modellen: deze rekenstaaf stelt dit element voor.
    w.ent("IFCRELASSIGNSTOPRODUCT",
      w.guid(`rekenkoppeling:${s.staaf.id}`), "$", "$", "$",
      lijst([s.member]), "$", ref(element));

    schrijfHoeveelheden(w, s, element, lengteM);

    // Pset_BeamCommon / Pset_ColumnCommon: de twee eigenschappen waarvan de
    // betekenis in IFC4 vaststaat en die dit model werkelijk weet. De rest
    // van die sets (FireRating, IsExternal, ThermalTransmittance) kent het
    // model niet en blijft dus weg — een verzonnen waarde is erger dan geen.
    schrijfEigenschappen(w,
      s.kolom ? "Pset_ColumnCommon" : "Pset_BeamCommon",
      `gemeen:${s.staaf.id}`,
      [eKenmerk("Reference", s.profiel), eJaNee("LoadBearing", true)],
      [element]);

    const staven = schrijfWapening(w, s, element, plaatsing, nulAssen,
      lichaamContext, combo.doorsnede);
    if (staven.length > 0) {
      const soortStaal = wapeningsstaal(s.staaf);
      const lijstje = wapeningPerSoort.get(soortStaal) ?? [];
      lijstje.push(...staven);
      wapeningPerSoort.set(soortStaal, lijstje);
    }
  }

  if (elementen.length > 0) {
    w.ent("IFCRELCONTAINEDINSPATIALSTRUCTURE",
      w.guid("bevat:gebouw"), "$", "$", "$", lijst(elementen), ref(invoer.gebouw));
  }
  for (const [soortStaal, staven] of wapeningPerSoort) {
    const mat = w.ent("IFCMATERIAL", stepString(soortStaal), "$", "'steel'");
    w.ent("IFCRELASSOCIATESMATERIAL",
      w.guid(`wapeningmateriaal:${soortStaal}`), "$", "$", "$",
      lijst(staven), ref(mat));
  }
  return uit;
}

/**
 * Qto_BeamBaseQuantities / Qto_ColumnBaseQuantities met de drie hoeveelheden
 * die uit de geometrie volgen: lengte, doorsnede-oppervlak en bruto inhoud.
 * De oppervlakte- en inhoudsmaten blijven weg zodra de doorsnede onbekend is
 * (`bron === "default"`, de terugval op HEA 160): dan zou er een hoeveelheid
 * staan die bij een ander profiel hoort dan de gebruiker koos.
 */
function schrijfHoeveelheden(
  w: SpfSchrijver,
  s: VerwerkteStaaf,
  element: number,
  lengteM: number,
): void {
  const sectie = resolveSection(s.materiaal, s.profiel);
  const hoeveelheden = [w.ent("IFCQUANTITYLENGTH",
    "'Length'", "$", "$", reeel(lengteM), "$")];
  // Bruto doorsnede: bij kruislaaghout is `A` de meewerkende oppervlakte van
  // de lengtelagen, terwijl de INHOUD van het element de volle strook is.
  const aM2 = (sectie.aBruto ?? sectie.A) / 1e6;
  if (sectie.bron !== "default" && aM2 > 0) {
    hoeveelheden.push(w.ent("IFCQUANTITYAREA",
      "'CrossSectionArea'", "$", "$", reeel(aM2), "$"));
    hoeveelheden.push(w.ent("IFCQUANTITYVOLUME",
      "'GrossVolume'", "$", "$", reeel(aM2 * lengteM), "$"));
  }
  const set = w.ent("IFCELEMENTQUANTITY",
    w.guid(`hoeveelheden:${s.staaf.id}`), "$",
    s.kolom ? "'Qto_ColumnBaseQuantities'" : "'Qto_BeamBaseQuantities'",
    "$", "$", lijst(hoeveelheden));
  w.ent("IFCRELDEFINESBYPROPERTIES",
    w.guid(`hoeveelhedenrel:${s.staaf.id}`), "$", "$", "$",
    lijst([element]), ref(set));
}

/** Wapeningsstaal van een staaf; ontbreekt het veld, dan de builder-default. */
function wapeningsstaal(staaf: Beam): string {
  return staaf.checkConfig?.betonStaalsoort ?? "B500B";
}

/** "3Ø16" — de gangbare notatie voor een rij hoofdwapening. */
function rijNotatie(aantal: number, diameterMm: number): string {
  return `${aantal}Ø${diameterMm}`;
}

/**
 * De wapeningskorf van een betonstaaf als IfcReinforcingBar's, geplaatst in
 * het lokale assenstelsel van het bouwkundige element (lokaal-x = breedte,
 * lokaal-y = hoogte, lokaal-z = langs de staaf vanaf de beginknoop).
 *
 * De ligging volgt uit de korf zoals §4.4.1 hem beschrijft: de nominale
 * dekking c_nom ligt op de BEUGEL, dus de hartlijn van een hoofdstaaf ligt
 * op c_nom + Ø_beugel + Ø/2 van de rand. De staven van een rij liggen
 * gelijkmatig over de beschikbare breedte binnen de beugel.
 *
 * De beugels worden NIET als losse staven geschreven maar als één
 * IfcReinforcingBar (.LIGATURE.) die de hele reeks voorstelt, met aantal en
 * hart-op-hart in de eigen set `OpenFEM2D_Beugels`. Bij s = 100 mm over een
 * ligger van 12 m zou een staaf-per-beugel 121 entiteiten per ligger kosten,
 * en dat maal elke ligger in het model.
 *
 * Geen korf, geen betonmateriaal, of een doorsnede waarvan de maten niet
 * bekend zijn → lege lijst, en verder verandert er niets aan het bestand.
 */
function schrijfWapening(
  w: SpfSchrijver,
  s: VerwerkteStaaf,
  element: number,
  plaatsingElement: number,
  nulAssen: number,
  lichaamContext: number,
  doorsnede: DoorsnedeInfo,
): number[] {
  const korf: ReinforcementCage | undefined = s.staaf.checkConfig?.betonKorf;
  if (korf === undefined || !isBetonMateriaal(s.materiaal)) return [];
  const hMm = doorsnede.hMm;
  const bwMm = doorsnede.bwMm;
  if (hMm === undefined || bwMm === undefined || hMm <= 0 || bwMm <= 0) return [];

  // Dekking per zijde. Sinds de korf per oppervlak een eigen c_nom kan
  // dragen (4.4.1.1(1)P meet tot het DICHTSTBIJZIJNDE betonoppervlak) is de
  // dekking van de bovenzijde niet meer per se die van de onderzijde. Leeg =
  // de dekking van het element, precies zoals `cover_at_mm` in de kern het
  // leest; oude projectbestanden zonder deze velden krijgen dus onveranderd
  // c_nom rondom.
  const cElementMm = Math.max(0, korf.cover_mm);
  const cBovenMm = Math.max(0, korf.cover_top?.cover_mm ?? cElementMm);
  const cOnderMm = Math.max(0, korf.cover_bottom?.cover_mm ?? cElementMm);
  const cZijMm = Math.max(0, korf.cover_sides?.cover_mm ?? cElementMm);
  const beugelMm = Math.max(0, korf.stirrup_diameter_mm);
  const soortStaal = wapeningsstaal(s.staaf);
  const staven: number[] = [];

  /** Eén staaf met zijn eigen lichaam, plaatsing en gegevens. */
  const schrijfStaaf = (
    seed: string, naam: string, toelichting: string,
    punten: Array<[number, number, number]>, gesloten: boolean,
    diameterMm: number, lengteMm: number, soort: string,
  ): number => {
    const puntIds = punten.map(([x, y, z]) =>
      w.ent("IFCCARTESIANPOINT", `(${meter(x)},${meter(y)},${meter(z)})`));
    const lijn = w.ent("IFCPOLYLINE",
      lijst(gesloten ? [...puntIds, puntIds[0]] : puntIds));
    // IfcSweptDiskSolid: een cirkelvormige doorsnede langs de hartlijn. Bij
    // een gesloten hartlijn blijven StartParam en EndParam weg, zoals IFC4
    // voorschrijft.
    const lichaam = w.ent("IFCSWEPTDISKSOLID",
      ref(lijn), meter(diameterMm / 2), "$", "$", "$");
    const weergave = w.ent("IFCSHAPEREPRESENTATION",
      ref(lichaamContext), "'Body'", "'AdvancedSweptSolid'", lijst([lichaam]));
    const vorm = w.ent("IFCPRODUCTDEFINITIONSHAPE", "$", "$", lijst([weergave]));
    const plaatsing = w.ent("IFCLOCALPLACEMENT",
      ref(plaatsingElement), ref(nulAssen));
    const oppervlakteM2 = (Math.PI / 4) * (diameterMm / 1000) ** 2;
    return w.ent("IFCREINFORCINGBAR",
      w.guid(`wapening:${s.staaf.id}:${seed}`), "$",
      stepString(naam), stepString(toelichting), "$",
      ref(plaatsing), ref(vorm), stepString(`${s.staaf.id}-${seed}`),
      stepString(soortStaal), meter(diameterMm), reeel(oppervlakteM2),
      meter(lengteMm), soort,
      // Geribde wapening (B500-reeks); een gladde staaf zou .PLAIN. zijn.
      ".TEXTURED.");
  };

  // ── Langswapening (§9.2.1) ───────────────────────────────────────────────
  const rijen: Array<{ zijde: string; rij: typeof korf.top; teken: 1 | -1; cMm: number }> = [
    { zijde: "onder", rij: korf.bottom, teken: -1, cMm: cOnderMm },
    { zijde: "boven", rij: korf.top, teken: 1, cMm: cBovenMm },
  ];
  for (const { zijde, rij, teken, cMm } of rijen) {
    if (!(rij.count > 0 && rij.diameter_mm > 0)) continue;
    // Hartlijn van de staaf: c_nom ligt op de beugel, de hoofdstaaf ligt
    // daarachter. Bij een dekking die groter is dan de halve doorsnede
    // (onmogelijke invoer) valt de staaf op de as in plaats van erbuiten.
    const yMm = teken * Math.max(0, hMm / 2 - cMm - beugelMm - rij.diameter_mm / 2);
    // Zijdelings geldt de dekking van de ZIJKANTEN, niet die van boven of
    // onder: die bepaalt de binnenmaat waarin de rij moet passen (8.2(2)).
    const halveSpreiding = Math.max(0,
      bwMm / 2 - cZijMm - beugelMm - rij.diameter_mm / 2);
    for (let i = 0; i < rij.count; i++) {
      const xMm = rij.count === 1
        ? 0
        : -halveSpreiding + (2 * halveSpreiding * i) / (rij.count - 1);
      staven.push(schrijfStaaf(
        `${zijde}:${i + 1}`,
        `Staaf ${s.staaf.id} ${zijde} ${i + 1}/${rij.count}`,
        `${rijNotatie(rij.count, rij.diameter_mm)} ${zijde}wapening`,
        [[xMm, yMm, 0], [xMm, yMm, s.lengteMm]], false,
        rij.diameter_mm, s.lengteMm, ".MAIN.",
      ));
    }
  }

  // ── Beugels (§9.2.2) ─────────────────────────────────────────────────────
  // De beugel loopt van onder naar boven; hij ligt dus tussen de dekking van
  // de onderzijde en die van de bovenzijde. Zijn hartlijn zit daarmee niet
  // meer per se op halve hoogte, en dat is het punt van de zijde-eigen
  // dekking.
  const xs = bwMm / 2 - cZijMm - beugelMm / 2;
  const yOnder = -hMm / 2 + Math.min(hMm / 2, cOnderMm + beugelMm / 2);
  const yBoven = hMm / 2 - Math.min(hMm / 2, cBovenMm + beugelMm / 2);
  const ys = (yBoven - yOnder) / 2;
  const yMidden = (yBoven + yOnder) / 2;
  // Een beugel die door de dekking heen valt (een dekking groter dan de halve
  // breedte of hoogte) is geen beugel; hem toch schrijven zou een lichaam met
  // samenvallende punten opleveren en een BarLength van 0 — allebei ongeldig
  // voor de IfcPositiveLengthMeasure die IFC4 hier eist.
  if (beugelMm > 0 && xs > 0 && ys > 0) {
    const omtrekMm = 2 * (2 * xs + 2 * ys);
    const beugel = schrijfStaaf(
      "beugel",
      `Staaf ${s.staaf.id} beugel`,
      `Beugel Ø${beugelMm}` +
      (korf.stirrup_spacing_mm !== undefined && korf.stirrup_spacing_mm !== null
        ? ` h.o.h. ${korf.stirrup_spacing_mm} mm` : ""),
      [
        [-xs, yMidden - ys, 0], [xs, yMidden - ys, 0],
        [xs, yMidden + ys, 0], [-xs, yMidden + ys, 0],
      ], true,
      beugelMm, omtrekMm, ".LIGATURE.",
    );
    staven.push(beugel);

    const eigenschappen: Eigenschap[] = [
      eMaat("Diameter", "IFCPOSITIVELENGTHMEASURE", beugelMm / 1000),
      eTekst("Toelichting",
        "Deze staaf stelt de HELE beugelreeks van de staaf voor; hij is " +
        "getekend op de plaats van de eerste beugel. Aantal en hart-op-hart " +
        "staan hieronder."),
    ];
    const hoh = korf.stirrup_spacing_mm;
    if (hoh !== undefined && hoh !== null && hoh > 0) {
      eigenschappen.push(eMaat("HartOpHart", "IFCPOSITIVELENGTHMEASURE", hoh / 1000));
      eigenschappen.push(eGeheel("Aantal", Math.floor(s.lengteMm / hoh) + 1));
    }
    if (korf.stirrup_legs !== undefined && korf.stirrup_legs !== null) {
      eigenschappen.push(eGeheel("AantalBenen", korf.stirrup_legs));
    }
    schrijfEigenschappen(w, "OpenFEM2D_Beugels",
      `beugels:${s.staaf.id}`, eigenschappen, [beugel]);
  }

  if (staven.length > 0) {
    // De wapening zit IN het element; IfcRelAggregates is in IFC4 de relatie
    // die dat uitdrukt. De staven horen daarom NIET ook nog eens rechtstreeks
    // in het gebouw te hangen — een object hoort bij één geheel.
    w.ent("IFCRELAGGREGATES",
      w.guid(`wapeningkorf:${s.staaf.id}`), "$", "$", "$",
      ref(element), lijst(staven));

    // Samenvatting van de korf op het element zelf, zodat een lezer die niet
    // in de losse staven duikt toch ziet waarmee gewapend is.
    const samenvatting: Eigenschap[] = [
      eLabel("Wapeningsstaal", soortStaal),
      eMaat("Betondekking", "IFCPOSITIVELENGTHMEASURE", cElementMm / 1000),
    ];
    if (korf.bottom.count > 0 && korf.bottom.diameter_mm > 0) {
      samenvatting.push(eLabel("Onderwapening",
        rijNotatie(korf.bottom.count, korf.bottom.diameter_mm)));
    }
    if (korf.top.count > 0 && korf.top.diameter_mm > 0) {
      samenvatting.push(eLabel("Bovenwapening",
        rijNotatie(korf.top.count, korf.top.diameter_mm)));
    }
    if (beugelMm > 0) {
      samenvatting.push(eMaat("Beugeldiameter", "IFCPOSITIVELENGTHMEASURE",
        beugelMm / 1000));
    }
    schrijfEigenschappen(w, "OpenFEM2D_Wapeningskorf",
      `korf:${s.staaf.id}`, samenvatting, [element]);
  }
  return staven;
}

// ── Eigenschappensets per staaf ─────────────────────────────────────────────

/**
 * De drie sets die elke staaf draagt: `OpenFEM2D_Doorsnede`,
 * `OpenFEM2D_Staaf` en — alleen als er een toetsuitslag is —
 * `OpenFEM2D_Toetsing`. Elke set hangt via ÉÉN IfcRelDefinesByProperties aan
 * zowel de rekenstaaf als het bouwkundige element: het is dezelfde staaf, en
 * twee kopieën van dezelfde eigenschappen zouden uit elkaar kunnen lopen.
 *
 * Alle grootheden staan in SI, zoals de rest van het bestand: m, m², m⁴, Pa.
 */
function schrijfStaafEigenschappen(
  w: SpfSchrijver,
  staven: VerwerkteStaaf[],
  combos: Map<string, ComboInfo>,
  bouwkundig: Map<number, number>,
  toetsresultaten: MemberCheckResult[] | undefined,
): void {
  const uitslagPerStaaf = new Map<number, MemberCheckResult>();
  for (const r of toetsresultaten ?? []) uitslagPerStaaf.set(r.beam_id, r);

  for (const s of staven) {
    const doelen = [s.member];
    const element = bouwkundig.get(s.staaf.id);
    if (element !== undefined) doelen.push(element);
    const doorsnede = combos.get(comboSleutel(s.materiaal, s.profiel))?.doorsnede;
    const sectie = resolveSection(s.materiaal, s.profiel);
    const bekend = sectie.bron !== "default";

    // ── Doorsnede ──────────────────────────────────────────────────────────
    const dEig: Eigenschap[] = [
      eLabel("Profielnaam", s.profiel),
      eLabel("Materiaal", s.materiaal),
      eLabel("Materiaalsoort", materiaalCategorie(s.materiaal)),
      eLabel("Doorsnedevorm", doorsnede?.vorm ?? "onbekend"),
    ];
    if (doorsnede?.hMm !== undefined && doorsnede.hMm > 0) {
      dEig.push(eMaat("Hoogte", "IFCPOSITIVELENGTHMEASURE", doorsnede.hMm / 1000));
    }
    if (doorsnede?.bMm !== undefined && doorsnede.bMm > 0) {
      dEig.push(eMaat("Breedte", "IFCPOSITIVELENGTHMEASURE", doorsnede.bMm / 1000));
    }
    if (bekend && sectie.A > 0) {
      dEig.push(eMaat("Oppervlakte", "IFCAREAMEASURE", sectie.A / 1e6));
    }
    if (bekend && sectie.I > 0) {
      dEig.push(eMaat("TraagheidsmomentY", "IFCMOMENTOFINERTIAMEASURE", sectie.I / 1e12));
    }
    if (bekend && sectie.E > 0) {
      // N/mm² → Pa. De eenhedenlijst van dit bestand is SI, dus ook de
      // E-modulus staat er in pascal en niet in de N/mm² van het scherm.
      dEig.push(eMaat("Elasticiteitsmodulus", "IFCMODULUSOFELASTICITYMEASURE",
        sectie.E * 1e6));
    }
    const props = doorsnede?.props;
    if (props) {
      dEig.push(eMaat("TraagheidsmomentZ", "IFCMOMENTOFINERTIAMEASURE", props.iz / 1e12));
      dEig.push(eMaat("WeerstandsmomentElastischY", "IFCSECTIONMODULUSMEASURE", props.welY / 1e9));
      dEig.push(eMaat("WeerstandsmomentPlastischY", "IFCSECTIONMODULUSMEASURE", props.wplY / 1e9));
      dEig.push(eMaat("Torsietraagheidsmoment", "IFCMOMENTOFINERTIAMEASURE", props.it / 1e12));
    }
    schrijfEigenschappen(w, "OpenFEM2D_Doorsnede",
      `doorsnede:${s.staaf.id}`, dEig, doelen);

    // ── Staaf ──────────────────────────────────────────────────────────────
    const rel = s.staaf.releases ?? {};
    const sEig: Eigenschap[] = [
      eGeheel("Staafnummer", s.staaf.id),
      eLabel("Staaftype", s.staaftype),
      eLabel("Onderdeel", s.kolom ? "Kolom" : "Ligger"),
      eMaat("HellingMetDeHorizontaal", "IFCPLANEANGLEMEASURE", s.hellingRad),
      eJaNee("ScharnierBegin", rel.startRy === true),
      eJaNee("ScharnierEind", rel.endRy === true),
    ];
    // Verende aansluitingen en bedding als leesbare eigenschappen naast de
    // randvoorwaarde-entiteiten: wie het bestand als tabel leest, ziet ze
    // ook. Eenheden SI: N/m, N·m/rad, N/m³ (kN/m³ ×1e3), m.
    const veer = s.staaf.veren ?? {};
    const veerEig = (naam: string, k: number | undefined, draai: boolean) => {
      if (k === undefined || !(k > 0)) return;
      sEig.push(draai
        ? eMaat(naam, "IFCROTATIONALSTIFFNESSMEASURE", k * 1e3)
        : eMaat(naam, "IFCLINEARSTIFFNESSMEASURE", k * 1e6));
    };
    veerEig("VeerNBegin", rel.startTx ? undefined : veer.startTx, false);
    veerEig("VeerVBegin", rel.startTz ? undefined : veer.startTz, false);
    veerEig("VeerMBegin", rel.startRy ? undefined : veer.startRy, true);
    veerEig("VeerNEind", rel.endTx ? undefined : veer.endTx, false);
    veerEig("VeerVEind", rel.endTz ? undefined : veer.endTz, false);
    veerEig("VeerMEind", rel.endRy ? undefined : veer.endRy, true);
    if (s.staaf.bedding && s.staaf.bedding.k > 0 && s.staaf.bedding.b > 0) {
      sEig.push(eMaat("BeddingK", "IFCMODULUSOFSUBGRADEREACTIONMEASURE", s.staaf.bedding.k * 1e3));
      sEig.push(eMaat("BeddingBreedte", "IFCPOSITIVELENGTHMEASURE", s.staaf.bedding.b / 1000));
    }
    if (s.lengteMm > 0) {
      sEig.splice(3, 0,
        eMaat("Lengte", "IFCPOSITIVELENGTHMEASURE", s.lengteMm / 1000));
    }
    schrijfEigenschappen(w, "OpenFEM2D_Staaf", `staaf:${s.staaf.id}`, sEig, doelen);

    // ── Toetsing ───────────────────────────────────────────────────────────
    const uitslag = uitslagPerStaaf.get(s.staaf.id);
    if (uitslag === undefined) continue;
    // De maatgevende toets staat in `checks` onder `governing_check_id`;
    // vindt hij zichzelf niet (een fout uit de kern), dan is het id zelf de
    // eerlijkste tekst die er is.
    const maatgevend = uitslag.checks.find(c => c.id === uitslag.governing_check_id)?.kind.data;
    const tEig: Eigenschap[] = [
      eLabel("Norm", normLabel(uitslag)),
      eLabel("MaatgevendeToets", maatgevend?.title ?? uitslag.governing_check_id),
      eMaat("UnityCheck", "IFCRATIOMEASURE", uitslag.uc_max),
      eLabel("GetoetsteDoorsnede", sectionLabel(uitslag)),
      eLabel("Sterkteklasse", gradeLabel(uitslag)),
    ];
    if (maatgevend?.article) {
      tEig.splice(2, 0, eLabel("Normartikel", maatgevend.article));
    }
    // NotApplicable is géén "voldoet niet": er is niet getoetst. Dan blijft
    // de eigenschap weg in plaats van er een onwaar antwoord neer te zetten.
    if (uitslag.status !== "NotApplicable") {
      tEig.push(eJaNee("Voldoet", uitslag.status === "Ok"));
    }
    if (isSteelCheckResult(uitslag)) {
      tEig.push(eLabel("Doorsnedeklasse",
        uitslag.classification.replace("Class", "klasse ")));
    }
    if (isConcreteCheckResult(uitslag) && uitslag.reinforcement_summary) {
      tEig.push(eTekst("Wapening", uitslag.reinforcement_summary));
    }
    schrijfEigenschappen(w, "OpenFEM2D_Toetsing",
      `toetsing:${s.staaf.id}`, tEig, doelen);
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
/** Een geëxporteerde plaat, voor de randlasten die eraan hangen. */
interface PlaatInfo {
  member: number;
  nodeIds: number[];
  knopen: Map<number, Node>;
  vertexPerKnoop: Map<number, number>;
}

/**
 * De twee hoekknopen van een plaatrand. Een polygoonplaat noemt de rand met
 * een index (rand i loopt van hoek i naar hoek i+1); een rechthoek met een
 * naam, en die wordt uit de coördinaten gelezen: onder = de twee laagste
 * knopen, boven = de twee hoogste, links/rechts idem in x.
 */
function randKnopen(info: PlaatInfo, last: Load): [number, number] | undefined {
  const n = info.nodeIds.length;
  if (last.edgeIndex !== undefined) {
    if (last.edgeIndex < 0 || last.edgeIndex >= n) return undefined;
    return [info.nodeIds[last.edgeIndex], info.nodeIds[(last.edgeIndex + 1) % n]];
  }
  if (!last.edge) return undefined;
  const punten = info.nodeIds
    .map((id) => { const k = info.knopen.get(id); return k ? { id, x: k.x, z: k.z } : undefined; })
    .filter((p): p is { id: number; x: number; z: number } => p !== undefined);
  const sorteer = (kies: (p: { x: number; z: number }) => number, hoogste: boolean) =>
    [...punten].sort((a, b) => (hoogste ? kies(b) - kies(a) : kies(a) - kies(b))).slice(0, 2).map((p) => p.id);
  const paar = last.edge === "bottom" ? sorteer((p) => p.z, false)
    : last.edge === "top" ? sorteer((p) => p.z, true)
      : last.edge === "left" ? sorteer((p) => p.x, false)
        : sorteer((p) => p.x, true);
  return paar.length === 2 ? [paar[0], paar[1]] : undefined;
}

function schrijfLast(
  w: SpfSchrijver,
  last: Load,
  connectiePerKnoop: Map<number, number>,
  memberPerStaaf: Map<number, number>,
  staafInfoPerStaaf: Map<number, StaafInfo>,
  context: number,
  plaatInfo: Map<number, PlaatInfo> = new Map(),
): number | undefined {
  // De vrije omschrijving van de gebruiker ("sneeuw op overstek", "reactie
  // spant 3") gaat mee als Description van de actie — het IFC-veld dat
  // daarvoor is. Zonder omschrijving blijft het $; een lege string zou een
  // ontvanger een omschrijving voorspiegelen die er niet is.
  const toelichting = last.omschrijving?.trim()
    ? stepString(last.omschrijving.trim()) : "$";

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
        toelichting, "$", "$", "$", ref(kracht), ".GLOBAL_COORDS.", "$");
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
        toelichting, "$", "$", ref(vorm), ref(kracht), ".GLOBAL_COORDS.", "$");
      w.ent("IFCRELCONNECTSSTRUCTURALACTIVITY",
        w.guid(`lastrel:${last.id}`), "$", "$", "$", ref(member), ref(actie));
      return actie;
    }

    console.warn(`[ifcExport] Last ${last.id} verwijst naar ontbrekende knoop of staaf — overgeslagen.`);
    return undefined;
  }

  if (last.type === "edgeLoad") {
    // Randlast op een plaat: een lijnlast langs één rand, als
    // IfcStructuralLinearAction met een eigen randtopologie (de twee
    // hoekknopen), gekoppeld aan het vlaklid. Altijd in wereldassen: qDir
    // "x" of "z", kN/m → N/m.
    const info = last.plateId !== undefined ? plaatInfo.get(last.plateId) : undefined;
    const paar = info ? randKnopen(info, last) : undefined;
    if (!info || !paar) {
      console.warn(`[ifcExport] Randlast ${last.id} verwijst naar een plaat of rand die niet in het bestand staat — overgeslagen.`);
      return undefined;
    }
    const q = (last.q ?? 0) * 1e3;
    const kracht = w.ent("IFCSTRUCTURALLOADLINEARFORCE",
      stepString(`q ${last.id}`),
      last.qDir === "x" ? `IFCLINEARFORCEMEASURE(${reeel(q)})` : "$", "$",
      last.qDir === "x" ? "$" : `IFCLINEARFORCEMEASURE(${reeel(q)})`,
      "$", "$", "$");
    const rand = w.ent("IFCEDGE", ref(info.vertexPerKnoop.get(paar[0])!), ref(info.vertexPerKnoop.get(paar[1])!));
    const topo = w.ent("IFCTOPOLOGYREPRESENTATION", ref(context), "'Reference'", "'Edge'", lijst([rand]));
    const vorm = w.ent("IFCPRODUCTDEFINITIONSHAPE", "$", "$", lijst([topo]));
    const actie = w.ent("IFCSTRUCTURALLINEARACTION",
      w.guid(`last:${last.id}`), "$", stepString(`q ${last.id} (plaatrand)`), toelichting, "$",
      "$", ref(vorm), ref(kracht), ".GLOBAL_COORDS.", "$", ".TRUE_LENGTH.", ".CONST.");
    w.ent("IFCRELCONNECTSSTRUCTURALACTIVITY",
      w.guid(`lastrel:${last.id}`), "$", "$", "$", ref(info.member), ref(actie));
    return actie;
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
        w.guid(`last:${last.id}`), "$", stepString(`dT ${last.id}`), toelichting, "$",
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
          w.guid(`last:${last.id}`), "$", stepString(`q ${last.id}`), toelichting, "$",
          "$", "$", ref(qLast), ".GLOBAL_COORDS.", "$", ".TRUE_LENGTH.", ".CONST.");
      } else if (!deellast) {
        // Trapezium over de volle lengte: twee waarden op 0 en L.
        const q1 = lijnkracht(qA, `q ${last.id} begin`);
        const q2 = lijnkracht(qB, `q ${last.id} eind`);
        const config = w.ent("IFCSTRUCTURALLOADCONFIGURATION",
          stepString(`q ${last.id}`), lijst([q1, q2]),
          `((0.),(${reeel(L)}))`);
        actie = w.ent("IFCSTRUCTURALCURVEACTION",
          w.guid(`last:${last.id}`), "$", stepString(`q ${last.id}`), toelichting, "$",
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
          w.guid(`last:${last.id}`), "$", stepString(`q ${last.id}`), toelichting, "$",
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

  // Platen mét hoekknopen gaan als IfcStructuralSurfaceMember mee; een
  // plaat zonder (een oude aanroeper die alleen id's geeft) kan niet
  // getekend worden en wordt gemeld.
  const geexporteerdePlaten = new Set(
    (model.plates ?? []).filter((p) => (p.nodeIds?.length ?? 0) >= 3).map((p) => p.id),
  );
  const platen = (model.plates?.length ?? 0) - geexporteerdePlaten.size;
  if (platen > 0) {
    regels.push(
      `${platen} ${platen === 1 ? "plaat" : "platen"} zonder hoekknopen: die ` +
      "kunnen niet als IfcStructuralSurfaceMember getekend worden en staan " +
      "niet in het bestand.",
    );
  }

  const randlasten = model.loads.filter(
    (l) => l.type === "edgeLoad" && !(l.plateId !== undefined && geexporteerdePlaten.has(l.plateId)),
  ).length;
  if (randlasten > 0) {
    regels.push(
      `${randlasten} ${randlasten === 1 ? "randbelasting" : "randbelastingen"} op een plaat: ` +
      "hoort bij een plaat die niet in het bestand staat en valt dus mee weg.",
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
    if (combinaties > 0 && !model.combinations) {
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
    // Dezelfde vormbepaling als de export zelf gebruikt — zie `bepaalVorm`.
    if (bepaalVorm(materiaal, profiel).soort === "onbekend") zonderDoorsnede.add(profiel);
  }
  if (zonderDoorsnede.size > 0) {
    regels.push(
      `Doorsnede onbekend voor ${[...zonderDoorsnede].sort().join(", ")}: die staven ` +
      "krijgen wel materiaal en profielnaam, maar geen parametrische " +
      "doorsnede (IFC4 kent geen profiel zonder afmetingen)" +
      (opties.zonderBouwkundig === true
        ? "."
        : ", en dus ook geen IfcBeam of IfcColumn — een ligger zonder " +
          "doorsnede is geen ligger."),
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

  // ── Bouwkundig model en wapening ─────────────────────────────────────────
  if (opties.zonderBouwkundig === true) {
    if (model.beams.length > 0) {
      regels.push(
        "Bouwkundig model bewust weggelaten: er staan geen IfcBeam, IfcColumn " +
        "of IfcReinforcingBar in het bestand — alleen het rekenmodel met zijn " +
        "eigenschappensets.",
      );
    }
  } else {
    const nulLengte = model.beams.filter(b => {
      const van = model.nodes.find(n => n.id === b.from);
      const naar = model.nodes.find(n => n.id === b.to);
      return van !== undefined && naar !== undefined &&
        Math.hypot(naar.x - van.x, naar.z - van.z) === 0;
    });
    if (nulLengte.length > 0) {
      regels.push(
        `${nulLengte.length} staaf/staven met lengte nul (${nulLengte.map(b => b.id).join(", ")}): ` +
        "die krijgen geen bouwkundig element, want een extrusie met diepte 0 " +
        "is geen geldige IfcPositiveLengthMeasure.",
      );
    }

    const clt = new Set<string>();
    const lVormig = new Set<string>();
    const betonZonderKorf: number[] = [];
    let metKorf = 0;
    for (const staaf of model.beams) {
      const materiaal = staaf.material ?? "S235";
      const profiel = staaf.profile ?? "HEA160";
      if (isHoutMateriaal(materiaal) && isCltProfiel(profiel)) clt.add(profiel);
      if (!isBetonMateriaal(materiaal)) continue;
      if (staaf.checkConfig?.betonKorf) metKorf++;
      else betonZonderKorf.push(staaf.id);
      const uitkomst = parseConcreteSection(profiel);
      if (uitkomst.ok && uitkomst.doorsnede.shape === "Ell") lVormig.add(profiel);
    }
    if (clt.size > 0) {
      regels.push(
        `Kruislaaghout (${[...clt].sort().join(", ")}): het bouwkundige element is de ` +
        "volle strook b × Σt als massieve rechthoek. De laagopbouw met haar " +
        "afwisselende vezelrichting staat er niet in; daarvoor kent IFC4 " +
        "alleen een gelaagd materiaal, en dat is een andere beschrijving dan " +
        "de doorsnede waarmee hier gerekend is.",
      );
    }
    if (lVormig.size > 0) {
      regels.push(
        `L-vormige betondoorsnede (${[...lVormig].sort().join(", ")}): het lijf is aan de ` +
        "LINKERzijde getekend. Het model legt niet vast aan welke rand de " +
        "flens uitkraagt — alleen dát er één uitkragend deel is.",
      );
    }
    if (betonZonderKorf.length > 0) {
      regels.push(
        `${betonZonderKorf.length} betonstaaf/staven zonder wapeningskorf ` +
        `(${betonZonderKorf.join(", ")}): daar staat geen IfcReinforcingBar bij. ` +
        "Er is met opzet geen standaardkorf.",
      );
    }
    if (metKorf > 0) {
      regels.push(
        `Beugels van ${metKorf} betonstaaf/staven: elke reeks staat als ÉÉN ` +
        "IfcReinforcingBar (.LIGATURE.) in het bestand, met aantal en " +
        "hart-op-hart in de set OpenFEM2D_Beugels — niet als losse beugels.",
      );
    }
  }

  // ── Toetsing ─────────────────────────────────────────────────────────────
  if (model.beams.length > 0) {
    const getoetst = new Set((model.toetsresultaten ?? []).map(r => r.beam_id));
    const zonder = model.beams.filter(b => !getoetst.has(b.id));
    if (getoetst.size === 0) {
      regels.push(
        "Geen toetsresultaten in het bestand: er is niet getoetst, of de " +
        "uitslag is niet meegegeven. Draai de toetsing vóór de export, dan " +
        "krijgt elke staaf de set OpenFEM2D_Toetsing met de maatgevende " +
        "toets, het normartikel en de unity check.",
      );
    } else if (zonder.length > 0) {
      regels.push(
        `${zonder.length} van de ${model.beams.length} staven hebben geen toetsuitslag ` +
        `(${zonder.map(b => b.id).join(", ")}): die dragen geen set ` +
        "OpenFEM2D_Toetsing. Zie het toetsingspaneel voor de reden per staaf.",
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

  const platenInBoom = (model.plates ?? []).filter((p) => (p.nodeIds?.length ?? 0) >= 3);
  const platen: IfcBoomKnoop = {
    type: "IfcStructuralSurfaceMember",
    naam: "Platen",
    aantal: platenInBoom.length,
    kinderen: platenInBoom.map((p) => ({
      type: "IfcFaceSurface",
      naam: `Plaat ${p.id} — t = ${nl(p.thickness ?? 20, 0)} mm, hoeken ${(p.nodeIds ?? []).join(", ")}`,
    })),
  };
  const kinderenModel: IfcBoomKnoop[] = platenInBoom.length > 0
    ? [knopen, staven, platen, opleggingen]
    : [knopen, staven, opleggingen];

  if (opties.zonderLasten !== true) {
    const perGeval = new Map<number, number>();
    for (const l of model.loads) {
      perGeval.set(l.caseId, (perGeval.get(l.caseId) ?? 0) + 1);
    }
    for (const geval of model.loadCases) {
      kinderenModel.push({
        type: "IfcStructuralLoadGroup",
        naam: geval.name,
        aantal: perGeval.get(geval.id) ?? 0,
        kinderen: model.loads
          .filter(l => l.caseId === geval.id)
          .map(l => ({
            type: l.type === "lineLoad"
              ? "IfcStructuralCurveAction"
              : l.type === "thermal" || l.type === "edgeLoad"
                ? "IfcStructuralLinearAction"
                : "IfcStructuralPointAction",
            naam: omschrijfLast(l),
          })),
      });
    }
  }

  // Het bouwkundige model hangt náást het rekenmodel in het gebouw, precies
  // zoals in het bestand: IfcBeam en IfcColumn zijn gebouwelementen, geen
  // onderdelen van het analysemodel.
  const kinderenGebouw: IfcBoomKnoop[] = [{
    type: "IfcStructuralAnalysisModel",
    naam: `Rekenmodel ${projectNaam}`,
    kinderen: kinderenModel,
  }];
  if (opties.zonderBouwkundig !== true) {
    const uitslagPerStaaf = new Map(
      (model.toetsresultaten ?? []).map(r => [r.beam_id, r]));
    const elementen: IfcBoomKnoop[] = [];
    for (const b of model.beams) {
      const materiaal = b.material ?? "S235";
      const profiel = b.profile ?? "HEA160";
      const van = model.nodes.find(n => n.id === b.from);
      const naar = model.nodes.find(n => n.id === b.to);
      if (!van || !naar) continue;
      const lengteMm = Math.hypot(naar.x - van.x, naar.z - van.z);
      if (lengteMm === 0) continue;
      const kolom = isOverwegendVerticaal(b, model.nodes);
      const uitslag = uitslagPerStaaf.get(b.id);
      const staart = uitslag !== undefined
        ? ` — UC ${nl(uitslag.uc_max, 2)} (${normLabel(uitslag)})`
        : "";
      const kinderen: IfcBoomKnoop[] = [];
      const korf = b.checkConfig?.betonKorf;
      if (korf && isBetonMateriaal(materiaal)) {
        const delen: string[] = [];
        if (korf.bottom.count > 0) delen.push(`onder ${korf.bottom.count}Ø${korf.bottom.diameter_mm}`);
        if (korf.top.count > 0) delen.push(`boven ${korf.top.count}Ø${korf.top.diameter_mm}`);
        if (korf.stirrup_diameter_mm > 0) delen.push(`beugel Ø${korf.stirrup_diameter_mm}`);
        kinderen.push({
          type: "IfcReinforcingBar",
          naam: `Wapening — ${delen.join(", ") || "geen staven"}`,
          aantal: korf.bottom.count + korf.top.count + (korf.stirrup_diameter_mm > 0 ? 1 : 0),
        });
      }
      elementen.push({
        type: kolom ? "IfcColumn" : "IfcBeam",
        naam: `${kolom ? "Kolom" : "Ligger"} ${b.id} — ${materiaal} ${profiel}, ` +
          `${nl(lengteMm / 1000)} m${staart}`,
        kinderen: kinderen.length > 0 ? kinderen : undefined,
      });
    }
    if (elementen.length > 0) {
      kinderenGebouw.push({
        type: "IfcBeam",
        naam: "Bouwkundige staven",
        aantal: elementen.length,
        kinderen: elementen,
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
        kinderen: kinderenGebouw,
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
export const GEWORTELDE_ENTITEITEN = [
  "IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCGRID",
  "IFCSTRUCTURALANALYSISMODEL", "IFCSTRUCTURALLOADGROUP",
  "IFCSTRUCTURALPOINTCONNECTION", "IFCSTRUCTURALCURVEMEMBER", "IFCSTRUCTURALSURFACEMEMBER",
  "IFCSTRUCTURALPOINTACTION", "IFCSTRUCTURALLINEARACTION",
  "IFCSTRUCTURALCURVEACTION",
  // Bouwkundig model, eigenschappen en hoeveelheden
  "IFCBEAM", "IFCCOLUMN", "IFCREINFORCINGBAR",
  "IFCPROPERTYSET", "IFCELEMENTQUANTITY",
  "IFCRELAGGREGATES", "IFCRELSERVICESBUILDINGS",
  "IFCRELCONNECTSSTRUCTURALMEMBER", "IFCRELCONNECTSSTRUCTURALACTIVITY",
  "IFCRELASSOCIATESMATERIAL", "IFCRELASSIGNSTOGROUP", "IFCRELASSIGNSTOGROUPBYFACTOR",
  "IFCRELASSIGNSTOPRODUCT", "IFCRELDEFINESBYPROPERTIES",
  "IFCRELCONTAINEDINSPATIALSTRUCTURE",
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
  const leegteFouten: string[] = [];
  const legeLijsten: string[] = [];

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

    // Lege parameters. STEP kent geen weggelaten attribuut: een niet
    // ingevulde waarde is "$" (of "*" voor een afgeleide). Twee komma's op
    // een rij — of een komma tegen een haakje — betekent dat er een attribuut
    // is overgeslagen, en dan schuiven alle volgende attributen een plaats
    // op. Dat is de fout die een export in de praktijk maakt en die geen
    // enkele lezer als fout meldt: hij leest gewoon de verkeerde waarde.
    let kaal = "";
    let inTekst = false;
    for (const c of args) {
      if (inTekst) { if (c === "'") inTekst = false; continue; }
      if (c === "'") { inTekst = true; kaal += "x"; continue; }
      kaal += c;
    }
    if (/,,|\(,|,\)/.test(`(${kaal})`)) leegteFouten.push(`#${m[1]}`);
    if (kaal.includes("()")) legeLijsten.push(`#${m[1]}`);
  }
  if (vormfouten.length > 0) {
    fouten.push(`${vormfouten.length} regel(s) met een ongeldige entiteitsvorm: ${vormfouten.slice(0, 3).join(" | ")}`);
  }
  if (leegteFouten.length > 0) {
    fouten.push(
      `${leegteFouten.length} entiteit(en) met een LEGE parameter (hoort "$" te zijn): ` +
      leegteFouten.slice(0, 5).join(", "),
    );
  }
  if (legeLijsten.length > 0) {
    waarschuwingen.push(
      `${legeLijsten.length} entiteit(en) met een lege lijst "()": in IFC4 eist bijna ` +
      "elke verzameling ten minste één element — " + legeLijsten.slice(0, 5).join(", "),
    );
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
 * Wat er van een doorsnede bekend is nadat hij is weggeschreven.
 *
 * `profielDef` is het #id van de IfcProfileDef; ontbreekt hij, dan kent deze
 * export de vorm niet en komt er ook geen bouwkundig element (een ligger
 * zonder doorsnede is geen ligger). De maten staan er in MILLIMETERS bij —
 * ze zijn er voor de eigenschappensets en voor het plaatsen van de wapening,
 * en dat rekent in modelmaten.
 */
interface DoorsnedeInfo {
  profielDef?: number;
  /** Leesbare vormaanduiding voor de eigenschappenset. */
  vorm: string;
  /** Totale hoogte h in mm, waar die bekend is. */
  hMm?: number;
  /** Grootste breedte b in mm, waar die bekend is. */
  bMm?: number;
  /**
   * Lijfbreedte b_w in mm bij een T- of L-betondoorsnede; bij de overige
   * vormen gelijk aan `bMm`. Dit is de breedte waarbinnen de beugels en de
   * hoofdwapening liggen.
   */
  bwMm?: number;
  /** Aanvullende grootheden, alleen bij een catalogusprofiel. */
  props?: SteelSectionProps;
}

/**
 * De doorsnede zoals hij UIT DE INVOER volgt, zonder dat er iets geschreven
 * wordt. Deze functie is de enige plaats waar wordt vastgesteld wélke vorm
 * een (materiaal, profiel)-combinatie heeft; `schrijfDoorsnede` maakt er een
 * IfcProfileDef van en `verzamelIfcBeperkingen` vraagt hem of de vorm bekend
 * is. Twee plaatsen die die vraag apart beantwoorden lopen uit elkaar — dat
 * gebeurde: de beperkingenlijst meldde een T-vormige betondoorsnede als
 * "onbekend" terwijl het bestand hem gewoon droeg.
 */
type Vormbeschrijving =
  | {
    soort: "rechthoek";
    /** Waar de rechthoek vandaan komt, voor de eigenschappenset. */
    vorm: "rechthoek" | "kruislaaghout-strook";
    bMm: number; hMm: number;
  }
  | { soort: "catalogus"; dims: SteelSectionDims }
  | { soort: "eigen"; doorsnede: EigenDoorsnede }
  | {
    soort: "betonvorm";
    tee: boolean;
    bMm: number; hMm: number; bwMm: number; hfMm: number;
    flensOnder: boolean;
  }
  | { soort: "onbekend" };

/** Vormbepaling uit materiaal en profielnaam. Schrijft niets. */
function bepaalVorm(materiaal: string, profiel: string): Vormbeschrijving {
  if (isHoutMateriaal(materiaal)) {
    // Kruislaaghout: de plaatstrook als massieve rechthoek b × Σt. De
    // laagopbouw zelf is in IFC4 alleen met een gelaagd materiaal uit te
    // drukken en zit hier niet in; dat staat in de beperkingenlijst.
    if (isCltProfiel(profiel)) {
      const layup = parseCltProfiel(profiel, materiaal);
      if (layup) {
        const h = layup.layers.reduce((som, l) => som + l.thickness_mm, 0);
        if (layup.width_mm > 0 && h > 0) {
          return {
            soort: "rechthoek", vorm: "kruislaaghout-strook",
            bMm: layup.width_mm, hMm: h,
          };
        }
      }
    }
    const rect = parseRechthoek(profiel);
    if (rect) return { soort: "rechthoek", vorm: "rechthoek", bMm: rect.b, hMm: rect.h };
    return { soort: "onbekend" };
  }

  // Beton: rechthoek, T of L.
  if (isBetonMateriaal(materiaal)) {
    const uitkomst = parseConcreteSection(profiel);
    if (uitkomst.ok) {
      const d = uitkomst.doorsnede;
      if (d.shape === "Rectangle") {
        return { soort: "rechthoek", vorm: "rechthoek", bMm: d.b_mm, hMm: d.h_mm };
      }
      const bw = d.b_w_mm ?? d.b_mm;
      const hf = d.h_f_mm ?? 0;
      if (bw > 0 && hf > 0 && hf < d.h_mm) {
        return {
          soort: "betonvorm", tee: d.shape === "Tee",
          bMm: d.b_mm, hMm: d.h_mm, bwMm: bw, hfMm: hf,
          flensOnder: d.flange_at_bottom,
        };
      }
    }
  }

  // Eigen doorsnede uit de profieleditor ("EIGEN:<naam>"): de bewaarde
  // doorsnede draagt haar bouwstenen, en die zijn als profiel te schrijven.
  if (isEigenProfiel(profiel)) {
    const d = zoekEigenDoorsnede(profiel);
    if (d) return { soort: "eigen", doorsnede: d };
  }

  // Catalogusprofiel uit de gedeelde tabel.
  const dims = profielAfmetingen(profiel);
  if (dims) return { soort: "catalogus", dims };

  // Laatste redmiddel: rechthoek-notatie in de naam ("100x200") — ook bij
  // niet-houtmaterialen een eerlijke massieve rechthoek.
  const rect = parseRechthoek(profiel);
  if (rect) return { soort: "rechthoek", vorm: "rechthoek", bMm: rect.b, hMm: rect.h };
  return { soort: "onbekend" };
}

/**
 * IFC-profiel voor een (materiaal, profiel)-combinatie. Afmetingen mm → m.
 * Levert altijd een `DoorsnedeInfo`; bij een onbekende vorm zonder
 * `profielDef` en met vorm "onbekend".
 *
 * Bij SHS/RHS is tw = tf = wanddikte en r de hoekstraal; bij CHS is
 * h = b = uitwendige diameter en tw = wanddikte.
 *
 * De T en de L worden als polygoon geschreven
 * (IfcArbitraryClosedProfileDef); IfcTShapeProfileDef zou de omgekeerde T
 * alleen met een gedraaid assenstelsel aankunnen en IfcLShapeProfileDef is
 * een hoekstaal met ÉÉN wanddikte voor beide benen — dat is niet de vorm die
 * hier ligt.
 */
function schrijfDoorsnede(
  w: SpfSchrijver,
  materiaal: string,
  profiel: string,
): DoorsnedeInfo {
  const naam = stepString(profiel);
  const beschrijving = bepaalVorm(materiaal, profiel);

  switch (beschrijving.soort) {
    case "rechthoek":
      return {
        profielDef: w.ent("IFCRECTANGLEPROFILEDEF", ".AREA.", naam, "$",
          meter(beschrijving.bMm), meter(beschrijving.hMm)),
        vorm: beschrijving.vorm,
        hMm: beschrijving.hMm, bMm: beschrijving.bMm, bwMm: beschrijving.bMm,
      };
    case "betonvorm":
      return {
        profielDef: schrijfBetonPolygoon(w, naam, beschrijving),
        vorm: beschrijving.tee ? "T-vorm" : "L-vorm",
        hMm: beschrijving.hMm, bMm: beschrijving.bMm, bwMm: beschrijving.bwMm,
      };
    case "catalogus": {
      const dims = beschrijving.dims;
      const p = parametrischProfiel(w, naam, dims, "$");
      if (!p) return { vorm: "onbekend" };
      return { hMm: dims.h, bMm: dims.b, bwMm: dims.b, props: dims.props, profielDef: p.profielDef, vorm: p.vorm };
    }
    case "eigen":
      return schrijfEigenDoorsnede(w, naam, beschrijving.doorsnede);
    case "onbekend":
      return { vorm: "onbekend" };
  }
}

/**
 * Het parametrische IFC-profiel van een catalogusprofiel, met een
 * plaatsing (`positie`: "$" voor het profiel zelf, een IfcAxis2Placement2D
 * voor een deel van een samenstelling).
 *
 * Toelopende flens (INP 14 %, UNP 8 %): IFC4 kent daarvoor FlangeSlope
 * (IfcPlaneAngleMeasure, hier in radialen) en de flenstipafronding
 * FlangeEdgeRadius/EdgeRadius. De tipstraal staat niet in de database; hij
 * volgt uit de walsnorm: 0,6·r bij DIN 1025-1, r/2 bij DIN 1026-1 —
 * dezelfde verhoudingen als de tekening en de doorsnedemotor.
 */
function parametrischProfiel(
  w: SpfSchrijver,
  naam: string,
  dims: SteelSectionDims,
  positie: string,
): { profielDef: number; vorm: string } | undefined {
  const helling = dims.flensHelling ?? 0;
  const flensHoek = helling > 0 ? reeel(Math.atan(helling)) : "$";
  switch (dims.kind) {
    case "ISection":
      return {
        vorm: "I-profiel",
        profielDef: w.ent("IFCISHAPEPROFILEDEF",
          ".AREA.", naam, positie, meter(dims.b), meter(dims.h),
          meter(dims.tw), meter(dims.tf), meter(dims.r),
          helling > 0 ? meter(0.6 * dims.r) : "$", flensHoek),
      };
    case "Channel":
      return {
        vorm: "U-profiel",
        profielDef: w.ent("IFCUSHAPEPROFILEDEF",
          ".AREA.", naam, positie, meter(dims.h), meter(dims.b),
          meter(dims.tw), meter(dims.tf), meter(dims.r),
          helling > 0 ? meter(dims.r / 2) : "$", flensHoek),
      };
    case "Shs":
    case "Rhs":
      return {
        vorm: "koker",
        profielDef: w.ent("IFCRECTANGLEHOLLOWPROFILEDEF",
          ".AREA.", naam, positie, meter(dims.b), meter(dims.h),
          meter(dims.tw), "$", dims.r > 0 ? meter(dims.r) : "$"),
      };
    case "Chs":
      return {
        vorm: "buis",
        profielDef: w.ent("IFCCIRCLEHOLLOWPROFILEDEF",
          ".AREA.", naam, positie, meter(dims.h / 2), meter(dims.tw)),
      };
  }
  return undefined;
}

/**
 * Een eigen doorsnede uit de profieleditor als IFC-profiel.
 *
 * Een SAMENSTELLING wordt een IfcCompositeProfileDef: elke lamel een
 * IfcRectangleProfileDef op zijn eigen IfcAxis2Placement2D (plaats en hoek),
 * elk catalogusdeel het parametrische profiel op zijn plaats. Het
 * assenstelsel is dat van de profieleditor: y naar rechts, z omhoog, in m —
 * dezelfde x/y van het IFC-profielvlak als bij de andere profielen. Een
 * spiegeling van een catalogusdeel is niet uit te drukken in een plaatsing
 * en staat in de Description.
 *
 * Een catalogusprofiel MET GATEN blijft het parametrische basisprofiel: de
 * I-, U- en kokerprofielen van IFC4 kennen geen uitsparingen, en een
 * willekeurig profiel met gaten zou de walsuitrondingen verliezen. De gaten
 * staan in de Description en in de eigenschappenset.
 *
 * h, b en de doorsnedegrootheden komen uit de bewaarde motoruitkomst, zodat
 * de eigenschappenset OpenFEM2D_Doorsnede dezelfde getallen draagt als de
 * toetsing.
 */
function schrijfEigenDoorsnede(w: SpfSchrijver, naam: string, d: EigenDoorsnede): DoorsnedeInfo {
  const e = d.eigenschappen;
  const props = Number.isFinite(e.iz_mm4)
    ? {
        iz: e.iz_mm4, welY: e.wel_y_mm3, welZ: e.wel_z_mm3, wplY: e.wpl_y_mm3, wplZ: e.wpl_z_mm3,
        avZ: e.av_z_mm2, it: e.it_mm4, iw: e.iw_mm6, iRadY: e.iy_radius_mm, iRadZ: e.iz_radius_mm,
      }
    : undefined;
  const gemeen = {
    hMm: Number.isFinite(e.h_mm) && e.h_mm > 0 ? e.h_mm : undefined,
    bMm: Number.isFinite(e.b_mm) && e.b_mm > 0 ? e.b_mm : undefined,
    bwMm: Number.isFinite(e.b_mm) && e.b_mm > 0 ? e.b_mm : undefined,
    props,
  };
  const plaatsing = (yMm: number, zMm: number, hoekGraden: number): number => {
    const punt = w.ent("IFCCARTESIANPOINT", `(${meter(yMm)},${meter(zMm)})`);
    const rad = (hoekGraden * Math.PI) / 180;
    // cos(90°) is 6e-17 in floating point; dat hoort als 0. in het bestand.
    const netjes = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
    const richting = w.ent("IFCDIRECTION", `(${reeel(netjes(Math.cos(rad)))},${reeel(netjes(Math.sin(rad)))})`);
    return w.ent("IFCAXIS2PLACEMENT2D", ref(punt), ref(richting));
  };

  if (d.ontwerp.soort === "gat") {
    const basis = d.ontwerp.basis;
    const dims = profielAfmetingen(basis.naam);
    const p = dims ? parametrischProfiel(w, naam, dims, "$") : undefined;
    const gaten = d.ontwerp.gaten.length;
    return {
      ...gemeen,
      vorm: p ? `${p.vorm} met ${gaten} gat${gaten === 1 ? "" : "en"} (niet in het profiel)` : "onbekend",
      ...(p ? { profielDef: p.profielDef } : {}),
    };
  }

  const delen: number[] = [];
  let deelnamen: string[] = [];
  for (const l of d.ontwerp.lamellen) {
    delen.push(w.ent("IFCRECTANGLEPROFILEDEF",
      ".AREA.", stepString(`lamel ${l.b_mm}x${l.t_mm}`), ref(plaatsing(l.y_mm, l.z_mm, l.alphaGraden)),
      meter(l.b_mm), meter(l.t_mm)));
    deelnamen.push(`lamel ${l.b_mm}x${l.t_mm}`);
  }
  for (const c of d.ontwerp.catalogusdelen) {
    const dims = profielAfmetingen(c.profiel.naam);
    if (!dims) continue;
    const p = parametrischProfiel(w, stepString(c.profiel.naam), dims,
      ref(plaatsing(c.y_mm, c.z_mm, c.alphaGraden)));
    if (!p) continue;
    delen.push(p.profielDef);
    deelnamen.push(`${c.profiel.naam}${c.gespiegeld ? " (gespiegeld)" : ""}`);
  }
  if (delen.length === 0) return { ...gemeen, vorm: "onbekend" };
  deelnamen = deelnamen.slice(0, 12);
  const composiet = w.ent("IFCCOMPOSITEPROFILEDEF",
    ".AREA.", naam, lijst(delen), stepString(deelnamen.join(", ")));
  return { ...gemeen, vorm: `samenstelling van ${delen.length} delen`, profielDef: composiet };
}

/**
 * De omtrek van een T- of L-betondoorsnede als IfcArbitraryClosedProfileDef.
 *
 * Assenstelsel van het profiel: x naar rechts (breedte), y omhoog (hoogte),
 * oorsprong in het MIDDEN van de omhullende rechthoek b × h. Dat is dezelfde
 * afspraak als bij IfcRectangleProfileDef en IfcIShapeProfileDef, zodat de
 * hartlijn van de staaf in alle vormen op dezelfde plek ligt.
 *
 * Bij een T ligt het lijf midden onder de flens; bij een L (randligger) ligt
 * het lijf tegen de LINKERrand. Welke rand dat in werkelijkheid is, zegt het
 * model niet — `FlangeGeometry.b_i_mm` heeft bij een L één uitkragend deel
 * maar geen zijde. Die keuze staat in de beperkingenlijst.
 */
function schrijfBetonPolygoon(
  w: SpfSchrijver,
  naam: string,
  vorm: Extract<Vormbeschrijving, { soort: "betonvorm" }>,
): number {
  const { bMm, hMm, bwMm, hfMm } = vorm;
  const b2 = bMm / 2, h2 = hMm / 2, bw2 = bwMm / 2;
  // Flens boven: van de linkerbovenhoek met de klok mee terug naar het begin.
  const hoeken: Array<[number, number]> = vorm.tee
    ? [
      [-b2, h2], [b2, h2], [b2, h2 - hfMm], [bw2, h2 - hfMm],
      [bw2, -h2], [-bw2, -h2], [-bw2, h2 - hfMm], [-b2, h2 - hfMm],
    ]
    : [
      [-b2, h2], [b2, h2], [b2, h2 - hfMm], [-b2 + bwMm, h2 - hfMm],
      [-b2 + bwMm, -h2], [-b2, -h2],
    ];
  // Flens onder (omgekeerde T): spiegelen om de x-as.
  const punten = (vorm.flensOnder ? hoeken.map(([x, y]) => [x, -y] as [number, number]) : hoeken)
    .map(([x, y]) => w.ent("IFCCARTESIANPOINT", `(${meter(x)},${meter(y)})`));
  // Een gesloten polylijn herhaalt zijn eerste punt als laatste.
  const lijn = w.ent("IFCPOLYLINE", lijst([...punten, punten[0]]));
  return w.ent("IFCARBITRARYCLOSEDPROFILEDEF", ".AREA.", naam, ref(lijn));
}
