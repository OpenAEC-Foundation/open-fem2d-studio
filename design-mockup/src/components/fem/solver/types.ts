/**
 * Solver types — plane-frame 2D static linear analysis.
 *
 * Coordinate system (matches FemCanvas model coords):
 *   x  : horizontal (mm, right positive)
 *   z  : vertical   (mm, up positive)
 *   ry : rotation about the y-axis (rad, counter-clockwise positive when looking from +y)
 *
 * Per-node DOFs: (ux, uz, ry) — 3 per node.
 * Per-element 2-node beam → 6 DOF local stiffness matrix.
 *
 * Units throughout: N, mm, rad, N·mm. Distributed load q is N/mm
 * (negative q = gravity-down on a horizontal beam).
 */
export interface SolverNodeInput {
  id: number;
  x: number;
  z: number;
}

/**
 * Eén segment van een staaf met een EIGEN buigstijfheid (fase D, stap 10).
 *
 * BEDOELING. Een fysisch niet-lineaire berekening geeft elke doorsnede langs
 * een staaf zijn eigen secans-EI: gescheurd beton is bij het veldmoment
 * slapper dan bij de steunpunten. De rekenkern kan dat al — `Mesh.addBeamElement`
 * geeft élk element zijn eigen `section`, en `Assembler`/`BeamForces` lezen
 * `element.section.I` per element. Dit veld is het contract waarmee de
 * aanroeper die indeling aan de adapter doorgeeft; de adapter knipt de staaf
 * op de segmentgrenzen en geeft elk deelelement zijn eigen I.
 *
 * EENHEDEN OP DEZE GRENS. Zoals de rest van de solverinvoer: lengtes in mm,
 * I in mm⁴. `tStart`/`tEnd` zijn dimensieloze FRACTIES 0..1 van de staaflengte,
 * gemeten vanaf de startknoop (`from`); de bijbehorende lengte in mm is dus
 * t·L. De adapter rekent I zelf om naar m⁴ (×1e-12) voordat de kern hem ziet.
 *
 * WAT NIET PER SEGMENT VARIEERT. Alleen I. E hoort bij de staaf (één
 * materiaal per staaf — de adapter maakt één mesh-materiaal per unieke
 * E-waarde) en A blijft de staaf-A: de normaalkrachtstijfheid EA varieert in
 * deze stap niet mee. Wie dat later wél wil, breidt dit type uit; de
 * adapterlus is er op ingericht (de doorsnede wordt per deelelement gebouwd).
 *
 * MINIMALE SEGMENTLENGTE. Een segmentgrens die vlak naast een al bestaande
 * splitsfractie ligt (plaatrandknoop of staafpuntlast) zou een element met
 * bijna lengte nul opleveren; zie MIN_SEGMENT_MM in engine.ts voor de regel
 * en de motivatie. De adapter laat zo'n grens vallen — de bestaande
 * splitsfractie wint altijd — en het samengevoegde element krijgt de I van het
 * segment waarin zijn MIDDEN valt.
 */
export interface SolverBeamSegmentInput {
  /** Beginfractie 0..1 van de staaflengte vanaf de startknoop (dimensieloos). */
  tStart: number;
  /** Eindfractie 0..1, strikt groter dan `tStart` (dimensieloos). */
  tEnd: number;
  /** Traagheidsmoment van dit segment (mm⁴). */
  I: number;
  /**
   * Doorsnede van dit segment (mm²), voor de rekstijfheid E·A. ONTBREEKT het
   * veld, dan geldt de A van de staaf — het pad van de fysisch niet-lineaire
   * betonlus, die alleen I per segment laat variëren. Een verlopend profiel
   * (lib/modelNaarSolverInput) vult hem wél: daar verandert A mee met de
   * maten, en een verlopende kolom of trekband hoort dat in E·A terug te
   * zien.
   */
  A?: number;
}

export interface SolverBeamInput {
  id: number;
  from: number;          // node id
  to: number;            // node id
  E?: number;            // N/mm²   default 210000
  A?: number;            // mm²     default 3877  (HEA 160)
  I?: number;            // mm⁴     default 1.673e7 (HEA 160 Iy)
  /**
   * Staaf op bedding: lijnstijfheid k·b in N/mm² (N per mm zakking, per mm
   * staaflengte). De adapter knipt de staaf op 1/λ en zet op elk mesh-element
   * de Winkler-bedding van de kern; zie `beddingSplitsFracties`.
   */
  bedding?: { kLijn: number };
  /**
   * Optionele segmentindeling met een eigen I per segment (mm⁴) — zie
   * SolverBeamSegmentInput. ONTBREEKT het veld, dan rekent de staaf precies
   * zoals hij dat zonder segmenten deed: één doorsnede over de volle lengte.
   *
   * De segmenten moeten een sluitende, niet-overlappende PARTITIE van [0, 1]
   * vormen (oplopend, tStart[0] = 0, tEnd[n−1] = 1, tEnd[i] = tStart[i+1]);
   * de adapter weigert anders met een Nederlandse melding in plaats van stil
   * met een verkeerde I te rekenen. `I` overschrijft `SolverBeamInput.I` voor
   * het betreffende stuk en een opgegeven `A` doet hetzelfde met
   * `SolverBeamInput.A`; `E` blijft van de staaf zelf.
   */
  segmenten?: SolverBeamSegmentInput[];
  /**
   * Extra SNEDEN op de staaf: fracties 0..1 vanaf de startknoop waar de
   * aanroeper een station wil hebben omdat de krachten- of de weerstandslijn
   * daar knikt of springt.
   *
   * WAARVOOR. Elk rekenelement levert een vast aantal stations (21). Een
   * grootheid die tússen twee stations knikt of springt, wordt door de
   * omhullende en door elke lijn die op die stations wordt getekend
   * weggeïnterpoleerd. De solver zet zelf al sneden op de grenzen van elke
   * DEELLAST (daar knikt V); dit veld is er voor knikken die de solver niet
   * kan zien. De eerste gebruiker zijn de grenzen van de wapeningszones van
   * een betonstaaf: daar verandert het aantal staven en springt de
   * opneembare weerstand, zodat de dekkingslijn er links en rechts een
   * eigen waarde moet kunnen tonen.
   *
   * WAT HET MET DE UITKOMST DOET. Een extra snede maakt een echte rekenknoop
   * en daarmee twee rekenelementen; op de snede staat het station dus
   * DUBBEL. Voor een Euler-Bernoulli-staaf met consistente knooplasten is de
   * oplossing in de knopen exact, dus reacties, knoopverplaatsingen en de
   * krachtenlijn zelf veranderen niet — alleen het raster waarop ze worden
   * uitgelezen wordt fijner.
   *
   * REGELS. Fracties buiten (0, 1) vervallen (daar zit al een eindknoop);
   * een fractie binnen MIN_SEGMENT_MM (zie engine.ts) van een uiteinde, van
   * een plaatrand- of puntlastfractie, van een segmentgrens of van een al
   * aanvaarde extra snede vervalt eveneens — anders ontstaat er een
   * flinterelement waarvan de stijfheidsmatrix slecht geconditioneerd is.
   * De volgorde in de lijst maakt niet uit; de fracties worden oplopend
   * afgelopen. Ligt er op de snedepositie al een knoop, dan vervalt de snede
   * eveneens: de adapter zou die knoop anders aan de staaf lassen en zo het
   * model veranderen in plaats van het fijner uit te lezen.
   *
   * BEVAT HET MODEL PLATEN, dan zet de adapter GEEN extra sneden — ook niet
   * uit dit veld. Staaf- en plaatknopen worden binnen 1 mm aan elkaar
   * geknoopt, en een extra snede zou daar ongevraagd een verbinding kunnen
   * leggen of juist een losse knoop achterlaten. Modellen met platen rekenen
   * dus precies zoals voorheen.
   */
  extraSneden?: number[];
  /**
   * Scharnier-aansluiting per uiteinde:
   *  - 'fixed' (default): rigid moment-resisting joint to the next element.
   *  - 'hinge': moment-free joint — the solver condenses M = 0 at that end.
   * Useful for typical column-beam connections in 2D plane frames.
   */
  startConnection?: 'fixed' | 'hinge';
  endConnection?:   'fixed' | 'hinge';
  /**
   * Volledige release-set per uiteinde, in LOKALE staafassen:
   *  - Tx: axiaal los (normaalkrachthuls — het element draagt daar geen N)
   *  - Tz: dwars los (dwarskrachthuls — het element draagt daar geen V)
   *  - Ry: buigscharnier (equivalent aan start/endConnection 'hinge')
   * Dezelfde translatie aan BEIDE einden lossen koppelt het element in die
   * richting volledig los; hangt een knoop daardoor nergens meer aan, dan
   * meldt de solver een singulier stelsel.
   */
  releases?: {
    startTx?: boolean; startTz?: boolean; startRy?: boolean;
    endTx?: boolean; endTz?: boolean; endRy?: boolean;
  };
  /**
   * Verende aansluitingen per DOF aan een staafeinde, in canonieke eenheden:
   * Tx/Tz in N/mm, Ry in N·mm/rad. Alleen velden > 0 tellen; een release op
   * hetzelfde DOF gaat vóór (dan is het een scharnier, geen veer).
   */
  veren?: {
    startTx?: number; startTz?: number; startRy?: number;
    endTx?: number; endTz?: number; endRy?: number;
  };
}

export type SupportType =
  | "pinned" | "fixed" | "xRoller" | "zRoller"
  | "zSpring" | "xSpring" | "rotSpring";

export interface SolverSupportInput {
  nodeId: number;
  type: SupportType;
  /**
   * Spring stiffness — required for `zSpring` / `xSpring` (N/mm) and
   * `rotSpring` (N·mm/rad). Ignored for rigid support types.
   * If omitted or non-positive on a spring type, the solver treats the
   * support as fully constrained ("rigid") to keep the system non-singular.
   */
  k?: number;
}

export interface SolverDistLoadInput {
  beamId: number;
  q: number;             // N/mm (negative = down in z, applied perpendicular to global z on the beam)
  /** Trapezoidal start value (optional). When omitted, q is uniform along the beam. */
  qStart?: number;
  /** Trapezoidal end value (optional). When omitted, q is uniform along the beam. */
  qEnd?: number;
  /** Direction of the load in GLOBAL axes. Default "z" = vertical (gravity). "x" = horizontal (wind). */
  qDir?: "x" | "z";
  /**
   * Assenstelsel van qDir. Default "global" (bestaand gedrag). Bij "local"
   * is qDir "z" = loodrecht op de staafas (positief = lokale +y: 90° CCW
   * vanaf de as from→to) en qDir "x" = axiaal langs de staaf. q blijft
   * per lengte-eenheid STAAFLENGTE. De adapter projecteert lokale lasten
   * exact naar globale componenten (rechte staven) vóórdat de core rekent;
   * de scheefstand-companion werkt daardoor op de echte verticale component.
   */
  qCoord?: "global" | "local";
  /**
   * Deellast: begin van het belaste deel als FRACTIE 0..1 van de staaflengte,
   * gemeten vanaf de startknoop. Default 0 (last begint bij de startknoop).
   * Bij een trapezium (qStart/qEnd) lopen de waarden lineair over het
   * BELASTE interval [startFrac·L, endFrac·L].
   */
  startFrac?: number;
  /** Deellast: einde van het belaste deel als fractie 0..1. Default 1. */
  endFrac?: number;
}

/** Point force/moment applied directly on a node — added in step 1c. */
export interface SolverPointLoadInput {
  nodeId: number;
  fx?: number;   // N
  fz?: number;   // N
  my?: number;   // N·mm
}

/**
 * Puntlast op een VRIJE POSITIE op een staaf (niet op een knoop).
 *
 * REKENAANPAK — staaf splitsen, niet inklemmingskrachten. De adapter voegt de
 * lastpositie toe aan de splitsfracties van de staaf (exact dezelfde mechaniek
 * als het splitsen op plaatrandknopen, P2.4: 1 UI-staaf → n mesh-staven,
 * waarvan convertResult de stations weer aaneenrijgt) en zet de kracht als
 * gewone knooplast op de tussenknoop. Waarom niet de klassieke
 * vaste-inklemmingskrachten (R_A = P·b²(3a+b)/L³ e.d.) op de staafeinden?
 * Die geven wel exacte reacties, maar de krachtsherleiding binnen het element
 * zou de last niet "zien": V zou geen sprong maken en M geen knik op de
 * lastpositie — de N/V/M/w-diagrammen en daarmee de toetsing zouden fout zijn.
 * Splitsen is exact voor álle grootheden en hergebruikt bestaande, geteste
 * code. De splitsing is bewust LASTGEVAL-ONAFHANKELIJK (alle beamPointLoads
 * splitsen mee, ook die met factor 0), zodat elk belastinggeval hetzelfde
 * stationsraster krijgt en combinatie-superpositie geldig blijft.
 *
 * posFrac 0 of 1 valt samen met een eindknoop: er wordt dan NIET gesplitst en
 * de last landt op de bestaande eindknoop — bit-identiek aan een knooplast.
 */
export interface SolverBeamPointLoadInput {
  beamId: number;
  /** Positie als fractie 0..1 van de staaflengte vanaf de startknoop. */
  posFrac: number;
  fx?: number;   // N
  fz?: number;   // N
  my?: number;   // N·mm
}

/**
 * Randlast op een plaatrand (P3.3): een lijnlast p langs één rand van een
 * wandschijf. De engine zet de last om in consistente knooplasten op de
 * mesh-randknopen — ΣF = p·L exact.
 *
 * ADRESSERING: precies één van `edge` en `edgeIndex`, en desgewenst
 * `openingId` om een rand van een OPENING aan te wijzen in plaats van de
 * omtrek; omgezet door `femTypes.bepaalPlaatlastRand` (de enige regel
 * daarvoor). Elk ander geval wordt door de engine GEWEIGERD met een reden —
 * nooit stil een andere of geen rand.
 */
export interface SolverEdgeLoadInput {
  /** UI-plaat-id (SolverPlateInput.id). */
  plateId: number;
  /**
   * Benoemde rand, alleen bij een asgelijnde rechthoek: "bottom" = kleinste z,
   * "top" = grootste z, "left"/"right" = kleinste/grootste x. Fracties tellen
   * vanaf de kleinste coördinaat van die zijde. Op een polygoonplaat: weigering.
   */
  edge?: "bottom" | "top" | "left" | "right";
  /**
   * Rand-index: rand van hoek i naar hoek i+1 (cyclisch, 0-based in
   * SolverPlateInput.nodeIds-volgorde). Werkt bij elke plaatvorm; fracties
   * tellen vanaf hoek i.
   */
  edgeIndex?: number;
  /**
   * De last staat op de rand van een OPENING: het `id` van die opening
   * (`SolverPlateInput.openingen`). Ontbreekt → de OMTREK, precies als
   * voorheen. Samen met `edgeIndex`: rand j van de opening loopt van
   * openingshoek j naar hoek j+1, en de fracties tellen vanaf hoek j. Een
   * benoemde rand (`edge`) bestaat bij een opening niet; een onbekend of dubbel
   * id, of een ontbrekende/te grote `edgeIndex`: weigering met reden.
   */
  openingId?: number;
  /** Lastgrootte per meter randlengte (N/mm = kN/m); negatief = tegen de +richting in. */
  p: number;
  /**
   * Trapezium: lastgrootte aan het BEGIN van het belaste deel (N/mm = kN/m).
   * Ontbreekt → `p`. Dezelfde betekenis als `qStart` bij een staaf.
   */
  pStart?: number;
  /** Trapezium: lastgrootte aan het EINDE van het belaste deel. Ontbreekt → `p`. */
  pEnd?: number;
  /**
   * Deellast: begin van het belaste deel als fractie 0..1 langs de rand, gemeten
   * vanaf de beginhoek (`edgeIndex` i: hoek i; `edge`: de kleinste coördinaat).
   * Ontbreekt → 0. De engine weigert een deel dat niet binnen de rand ligt of
   * waarvan het begin niet vóór het einde ligt.
   */
  startFrac?: number;
  /** Deellast: einde van het belaste deel als fractie 0..1. Ontbreekt → 1. */
  endFrac?: number;
  /** Richting in GLOBALE assen: "z" = verticaal (default), "x" = horizontaal. */
  dir?: "x" | "z";
}

/**
 * Puntlast op een plaatrand: een kracht op een positie langs één rand van een
 * wandschijf, adres zoals bij een randlast (precies één van `edge` en
 * `edgeIndex`, via `femTypes.bepaalPlaatRand`).
 *
 * REKENAANPAK — consistente verdeling, geen nieuwe knoop. De kracht gaat naar
 * de twee randknopen van de elementrand waarop hij staat, gewogen met de
 * lineaire vormfuncties van die rand (PlateLoads.verdeelRandpuntlastConsistent).
 * Exact voor lineaire randen (CST en Quad4), en het rekenmesh blijft in elk
 * belastinggeval gelijk — de combinaties tellen plaatspanningen per
 * elementindex op en zijn daar op aangewezen.
 */
export interface SolverEdgePointLoadInput {
  /** UI-plaat-id (SolverPlateInput.id). */
  plateId: number;
  edge?: "bottom" | "top" | "left" | "right";
  edgeIndex?: number;
  /**
   * De rand van een OPENING in plaats van de omtrek — zie
   * `SolverEdgeLoadInput.openingId`.
   */
  openingId?: number;
  /**
   * Positie als fractie 0..1 langs de rand vanaf de beginhoek. Verplicht: een
   * ontbrekende of onmogelijke positie wordt geweigerd, niet op 0 gezet.
   */
  posFrac?: number;
  fx?: number;   // N
  fz?: number;   // N
}

/** Uniform temperature change on a beam — added in step 2b. */
export interface SolverThermalLoadInput {
  beamId: number;
  deltaT: number;        // K
  /** Linear expansion coefficient (1/K). Default α = 1.2e-5 (steel). */
  alpha?: number;
}

/**
 * Scheefstand / initiële imperfectie (EN 1993-1-1 §5.3.2-aanpak):
 * elke VERTICALE last krijgt een equivalente horizontale metgezel
 * H = φ·V in de gekozen richting (knooplast fz → fx-companion,
 * lijnlast in z → qx-companion over hetzelfde belaste deel).
 * Lineair in de last, dus factoren/combinaties schalen automatisch mee —
 * ook in het 2e-orde-pad, waar de imperfectie er het meest toe doet.
 * φ zelf (φ₀·αh·αm, basis 1/200) bepaalt de aanroeper; de motor past
 * alleen toe. Thermische lasten en momenten krijgen geen companion.
 */
export interface ScheefstandInput {
  /** Scheefstand als verhouding, bv. 1/200 = 0.005. */
  phi: number;
  /** Richting van de equivalente horizontale krachten: +1 = +x, -1 = −x. */
  richting: 1 | -1;
}

/**
 * Wandschijf (plaat in het vlak, membraan/plane stress) — fase P2.
 * De adapter meshet een asgelijnde rechthoek (4 hoekknopen) met een
 * quad-grid (elementgrootte ≈ meshSize); elke andere geldige polygoon
 * (n ≥ 3 hoeken, P4.2) rekent met CST-driehoeken uit de vooraf gegenereerde
 * CDT-cache. Beide lossen op met `mixed_beam_plate`. Eenheden zoals de rest
 * van de invoer: mm en N/mm².
 */
export interface SolverPlateInput {
  id: number;
  /**
   * De hoekknopen (UI-node-ids, klikvolgorde): 4 asgelijnde hoeken =
   * rechthoekpad (grid), anders polygonpad (CDT-cache vereist).
   */
  nodeIds: number[];
  /**
   * CDT-meshcache voor het polygonpad (P4.2) — platte data in mm, zie
   * femTypes.PlaatMeshCache. Verplicht voor een polygoonplaat en de ENIGE bron:
   * `bouwMultiInput` en het canvas geven hem allebei door, zodat canvas, app en
   * MCP met hetzelfde mesh rekenen. De signature wordt tegen de actuele
   * hoekcoördinaten + meshSize gevalideerd; ontbreken, mismatch of een
   * beschadigde cache → nette NL-fout.
   */
  meshCache?: import("../femTypes").PlaatMeshCache;
  /**
   * Elementkeuze (stap 2): "driehoeken" (CST) of "vierhoeken" (Quad4).
   * Ontbreekt = de standaard voor de vorm — rasterpad vierhoeken, CDT-pad
   * driehoeken — zie femTypes.effectiefPlaatMeshType.
   */
  meshType?: import("../femTypes").PlaatMeshType;
  /**
   * Openingen (stap 2): polygonen in mm binnen de omtrek. Bij een asgelijnde
   * rechthoek met asgelijnde rechthoekige openingen meshet de adapter zelf
   * (rasterpad, ook in de sidecar); elke andere combinatie vereist een
   * meshCache waarvan de handtekening óók de openingen dekt.
   */
  openingen?: import("../femTypes").PlaatOpening[];
  /** Plaatdikte (mm). */
  thickness: number;
  /**
   * Materiaal van de plaat (stap 3), zelfde grammatica als bij een staaf:
   * staalsoort, betonklasse, houtsterkteklasse, "CLT <klasse> <opbouw>" of
   * "VRIJ:… E=… rho=… f=…". Ontbreekt → de plaat rekent isotroop met `E`,
   * `nu` en `rho` hieronder, precies zoals vóór stap 3. Een naam die niet
   * herkend wordt levert een weigering met reden op.
   */
  materiaal?: string;
  /**
   * Hoofdrichting van een richtingsafhankelijk materiaal in GRADEN, tegen de
   * klok in vanaf de globale x-as. Ontbreekt → 0°.
   */
  hoofdrichting?: number;
  /**
   * Elasticiteitsmodulus (N/mm²). Verplicht zolang er geen `materiaal` is;
   * mét materiaal is het de expliciete overschrijving van E₁ én E₂ (en
   * daarmee rekent de plaat isotroop).
   */
  E?: number;
  /** Dwarscontractiecoëfficiënt ν — met materiaal: de overschrijving van ν₁₂. */
  nu?: number;
  /** Volumieke massa (kg/m³) — voor eigengewicht; met materiaal: de overschrijving van ρ. */
  rho?: number;
  /** Gewenste elementgrootte van het quad-grid (mm). */
  meshSize: number;
  /**
   * Eigengewicht (P2.3): wanneer gezet, krijgt DIT belastinggeval de
   * ρ·g·t-knooplasten van de plaat (analoog aan het staaf-eigengewicht dat
   * App.tsx in het dead-geval stopt). Ontbreekt het veld → geen eigengewicht.
   */
  selfWeightCaseId?: number;
}

export interface SolverInput {
  nodes: SolverNodeInput[];
  beams: SolverBeamInput[];
  supports: SolverSupportInput[];
  loads: SolverDistLoadInput[];
  /** Optional concentrated forces on nodes. */
  pointLoads?: SolverPointLoadInput[];
  /** Optionele puntlasten op een vrije positie op een staaf. */
  beamPointLoads?: SolverBeamPointLoadInput[];
  /** Optional uniform temperature changes on beams. */
  thermalLoads?: SolverThermalLoadInput[];
  /** Optionele randlasten op plaatranden (P3.3). */
  edgeLoads?: SolverEdgeLoadInput[];
  /** Optionele puntlasten op een plaatrand. */
  edgePointLoads?: SolverEdgePointLoadInput[];
  /** Optionele wandschijven — aanwezig ⇒ analyse in `mixed_beam_plate`. */
  plates?: SolverPlateInput[];
  /** Optional load-case tag for traceability (used by multi-LC variant). */
  caseId?: number;
  /** Optionele scheefstand — zie ScheefstandInput. */
  scheefstand?: ScheefstandInput;
}

// ── Multi-load-case + combinations (step 2c–2e) ──────────────────────────────
export interface MultiInput {
  nodes: SolverNodeInput[];
  beams: SolverBeamInput[];
  supports: SolverSupportInput[];
  /** Distributed loads tagged by caseId — the solver splits internally. */
  loads: (SolverDistLoadInput & { caseId: number })[];
  pointLoads?: (SolverPointLoadInput & { caseId: number })[];
  /** Puntlasten op een vrije positie op een staaf, per belastinggeval. */
  beamPointLoads?: (SolverBeamPointLoadInput & { caseId: number })[];
  thermalLoads?: (SolverThermalLoadInput & { caseId: number })[];
  /** Randlasten op plaatranden, per belastinggeval (P3.3). */
  edgeLoads?: (SolverEdgeLoadInput & { caseId: number })[];
  /**
   * Puntlasten op een plaatrand, per belastinggeval. Alleen aanwezig als het
   * model er één heeft: een model zonder blijft byte-gelijk aan voorheen.
   */
  edgePointLoads?: (SolverEdgePointLoadInput & { caseId: number })[];
  /** Optionele wandschijven — lastonafhankelijk model, net als beams. */
  plates?: SolverPlateInput[];
  /** All load cases referenced by the loads above. */
  cases: { id: number; name: string }[];
  /** Optionele scheefstand — zie ScheefstandInput. */
  scheefstand?: ScheefstandInput;
}

export interface MultiLcResult {
  /** caseId → SolverResult for that case in isolation. */
  perCase: Map<number, SolverResult>;
}

export interface NodalDisp {
  ux: number;   // mm
  uz: number;   // mm
  ry: number;   // rad
}

export interface NodalReaction {
  fx: number;   // N
  fz: number;   // N
  my: number;   // N·mm
}

/**
 * Uitkomst per REKENSTUK van een gesegmenteerde staaf (fase D, stap 10).
 *
 * Eén record per element waarmee werkelijk gerekend is — dus per stuk met een
 * eigen I. Dat is niet altijd één-op-één het invoersegment: binnen een segment
 * kan nog geknipt zijn op een staafpuntlast of een plaatrandknoop (dan liggen
 * er meerdere records met dezelfde `segmentIndex` achter elkaar), en een
 * segmentgrens die op een bestaande splitsfractie is samengevoegd levert één
 * record dat twee invoersegmenten overspant (`segmentIndex` is dan die van het
 * segment waarin het midden van het stuk valt). De records liggen op volgorde
 * langs de staaf en sluiten aaneen: `xEnd[i] = xStart[i+1]`, `xStart[0] = 0`
 * en `xEnd[laatste] = L_mm`.
 *
 * De x-coördinaten liggen in hetzelfde assenstelsel als `stations_mm`, zodat
 * een aanroeper de stationsreeks per stuk kan snijden.
 *
 * Eenheden: mm, mm⁴, N en N·mm — zoals de rest van de grens. Tekenconventies
 * eveneens: N TREK POSITIEF, M sagging-positief.
 */
export interface BeamSegmentForces {
  /** Beginpositie langs de staaf vanaf de startknoop (mm). */
  xStart: number;
  /** Eindpositie langs de staaf (mm). */
  xEnd: number;
  /** Traagheidsmoment waarmee dit stuk gerekend heeft (mm⁴). */
  I: number;
  /**
   * Doorsnede waarmee dit stuk gerekend heeft (mm²) — alleen aanwezig als het
   * invoersegment een eigen `A` droeg (verlopend profiel); anders gold de A
   * van de staaf en blijft het veld weg.
   */
  A?: number;
  /** Index in `SolverBeamInput.segmenten` waarvan die I komt. */
  segmentIndex: number;
  /** Normaalkracht aan het begin resp. het eind van het stuk (N, trek positief). */
  N_start: number;
  N_end: number;
  /** Buigend moment aan het begin resp. het eind van het stuk (N·mm, sagging +). */
  M_start: number;
  M_end: number;
  /**
   * Het station binnen dit stuk met de grootste |M|, mét teken (N·mm), en de
   * normaalkracht op datzelfde station (N, trek positief). Dat is het
   * (N, M)-paar waarmee een M-N-κ-orakel de volgende secans-EI bepaalt.
   */
  M_max: number;
  N_bij_M_max: number;
}

/**
 * Krachtsverloop van één staaf in LOKALE staafassen: x van de beginknoop
 * ("from") naar de eindknoop, +y 90° tegen de klok in vanaf die as. De tekens
 * van M, w en u — en de volgorde van de stations — hangen dus aan de
 * tekenrichting: dezelfde doorhangende ligger geeft een positief veldmoment
 * als hij van links naar rechts is getekend en een negatief andersom.
 *
 * Alles wat hieruit een uitspraak over "boven" of "onder" doet — de
 * toetsbouwers, het betonvenster, de figuren in het rapport, de labels op het
 * canvas — leest dit via `lib/referentierichting.ts`, dat de staaf in zijn
 * referentierichting zet (liggend van links naar rechts, staand van voet naar
 * kop). Lees hier nooit rechtstreeks een wereldzijde af.
 */
export interface ElementForces {
  N: number;        // N   (axial, tension +ve at end A)
  V: number;        // N   (shear, end-A local convention)
  M_start: number;  // N·mm at node "from"
  M_end: number;    // N·mm at node "to"

  /** Beam length (mm) — needed for diagram x-axis scaling. */
  L_mm: number;

  /**
   * 21 sample positions x along the beam from start to end (mm).
   * Same length as the three force arrays below.
   */
  stations_mm: number[];

  /**
   * Axial force N(x) at each station (N, tension positive).
   * Used to draw a real N-diagram (varies if axial loads are applied),
   * instead of linear interpolation between endpoints.
   */
  normalForce: number[];

  /**
   * Shear V(x) at each station (N, sagging-positive engineering convention).
   * Linear under UDL, stepwise under point loads.
   */
  shearForce: number[];

  /**
   * Bending moment M(x) at each station (N·mm, sagging-positive).
   * Parabolic under UDL, linear under point loads — drawn station-per-station.
   */
  bendingMoment: number[];

  /**
   * Veldzakking w(x) op dezelfde stations (mm, LOKALE assen): transversale
   * verplaatsing loodrecht op de staafas, positief in lokale +y (90° CCW
   * vanaf de as from→to). Voor een horizontale staaf is +y omhoog — dezelfde
   * conventie als de knoop-uz; doorhangen onder gravitatie geeft dus
   * NEGATIEVE waarden (consistent met sagging-positieve M: veldmoment > 0
   * hoort bij w < 0). Bevat het Hermite-homogene deel op de eind-DOF's plus
   * de particuliere oplossing van de elementbelasting (volledige-lengte
   * uniforme + trapezium-q; partiële q wordt alleen homogeen benaderd).
   */
  deflection: number[];

  /**
   * Axiale verplaatsing u(x) op dezelfde stations (mm, lokaal, positief
   * richting "to"-knoop). Lineair homogeen deel + particuliere oplossing
   * voor verdeelde axiale q.
   */
  axialDisp: number[];

  /**
   * Hoekverdraaiing θ(x) op dezelfde stations (rad, LOKAAL): de helling
   * dw/dx van de veldzakking hierboven. ANALYTISCH afgeleid uit dezelfde
   * Hermite-vormfuncties plus particuliere oplossing waaruit `deflection`
   * volgt — géén numerieke differentie van dat array (die verliest juist bij
   * de staafeinden nauwkeurigheid, waar θ doorgaans het grootst is).
   *
   * TEKEN: w is positief in lokale +y en x loopt van "from" naar "to", dus
   * positieve θ draait tegen de klok in (CCW) — dezelfde draairichting als
   * de knooprotatie `ry`. In 2D is de rotatie-DOF invariant onder de
   * assentransformatie; bij een STIJVE aansluiting geldt daarom exact
   * θ(0) = ry van de "from"-knoop en θ(L) = ry van de "to"-knoop. Bij een
   * scharnier verschilt de element-eindrotatie van de knooprotatie en maakt
   * θ daar dus een sprong. Doorhangen onder gravitatie (w < 0 in het veld)
   * geeft θ(0) < 0 en θ(L) > 0.
   *
   * Eenheid rad, net als `NodalDisp.ry`; de UI toont hem in mrad.
   * Optioneel omdat resultaten van vóór deze uitbreiding het veld missen.
   */
  rotation?: number[];

  /**
   * Segmentuitkomsten — ALLEEN aanwezig wanneer de invoerstaaf een
   * `segmenten`-veld droeg (zie SolverBeamSegmentInput). Zonder segmenten
   * ontbreekt het veld en is het resultaat identiek aan het bestaande gedrag.
   * Zie BeamSegmentForces voor de inhoud.
   */
  segmenten?: BeamSegmentForces[];
}

/** Min/max van één spannings-/krachtcomponent over de elementen van een plaat. */
export interface PlateStressRange {
  min: number;
  max: number;
}

/**
 * Spanningen en membraankrachten van één plaat-element (CST of Quad4),
 * elementgemiddeld (constante-rek-elementen). Eenheden voor de UI:
 * spanningen N/mm², membraankrachten kN/m, hoek rad.
 */
export interface PlateElementStress {
  /** Element-id in het rekenmesh (stabiel binnen één solve). */
  elementId: number;
  /** Hoekcoördinaten in modelassen (mm), 3 (driehoek) of 4 (quad) punten. */
  corners: { x: number; z: number }[];
  sigmaX: number;    // N/mm²
  sigmaY: number;    // N/mm² (verticale in-vlak-richting = model-z)
  tauXY: number;     // N/mm²
  vonMises: number;  // N/mm²
  sigma1: number;    // N/mm² — grootste hoofdspanning
  sigma2: number;    // N/mm² — kleinste hoofdspanning
  /** Richting van hoofdspanning 1 t.o.v. de +x-as (rad). */
  angle: number;
  nx: number;        // kN/m — membraankracht = σx·t
  ny: number;        // kN/m
  nxy: number;       // kN/m
  /**
   * Dezelfde spanning in de MATERIAALASSEN (N/mm²): σ₁ langs hoofdrichting 1
   * (de vezel, bij kruislaaghout de lengtelagen), σ₂ loodrecht daarop en τ₁₂.
   * Een houttoets vraagt de spanning langs en dwars op de vezel, niet in de
   * globale assen. ALLEEN aanwezig bij een richtingsafhankelijke plaat (hout,
   * kruislaaghout); bij een isotrope plaat heeft een hoofdrichting geen
   * betekenis en ontbreekt het veld, zodat dat resultaat ongewijzigd blijft.
   * Niet te verwarren met `sigma1`/`sigma2` hierboven: dat zijn de
   * HOOFDSPANNINGEN, waarvan de richting per element verschilt.
   */
  materiaalassen?: PlateMaterialAxisStress;
}

/** Spanning in de materiaalassen van een plaat — zie `PlateElementStress.materiaalassen`. */
export interface PlateMaterialAxisStress {
  sigma1: number;    // N/mm² — langs hoofdrichting 1
  sigma2: number;    // N/mm² — loodrecht op hoofdrichting 1, in het vlak
  tau12: number;     // N/mm²
}

/** Resultaat per plaat: elementspanningen + min/max-ranges voor de legenda. */
export interface PlateResult {
  plateId: number;
  elements: PlateElementStress[];
  ranges: {
    sigmaX: PlateStressRange;
    sigmaY: PlateStressRange;
    tauXY: PlateStressRange;
    vonMises: PlateStressRange;
    nx: PlateStressRange;
    ny: PlateStressRange;
    nxy: PlateStressRange;
  };
  /**
   * Alleen bij een richtingsafhankelijke plaat: de hoofdrichting waarin
   * `elements[].materiaalassen` is uitgedrukt (graden tegen de klok in vanaf
   * de globale x-as, dezelfde hoek als `Plate.hoofdrichting`) en de min/max
   * van σ₁, σ₂ en τ₁₂ over de elementen.
   */
  materiaalassen?: {
    hoekGraden: number;
    ranges: {
      sigma1: PlateStressRange;
      sigma2: PlateStressRange;
      tau12: PlateStressRange;
    };
  };
}

export interface SolverResult {
  displacements: Map<number, NodalDisp>;
  reactions: Map<number, NodalReaction>;
  elements: Map<number, ElementForces>;
  /**
   * Largest |u_x| or |u_z| across all nodes (mm) — used to auto-scale
   * on-screen deflection. Mét platen tellen ook de mesh-knopen van de
   * platen mee (id ≥ 1000 in de core).
   */
  maxDisplacement: number;
  /** Plaatspanningen per plaat — alleen aanwezig wanneer het model platen bevat. */
  plateElements?: PlateResult[];
}

// HEA 160 defaults — same numbers the v2 Properties panel hardcodes.
export const DEFAULT_E = 210000;        // N/mm²
export const DEFAULT_A = 3877;          // mm²
export const DEFAULT_I = 1.673e7;       // mm⁴
