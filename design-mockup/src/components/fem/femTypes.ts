/**
 * Shared types for the FEM v2 app.
 *
 * Centralised here so the lifted state in App.tsx can be consumed by
 * FemCanvas (controlled rendering), FemProjectTree (live counts/leaves)
 * and FemProperties (reactive details) without circular imports.
 */
import type { ReinforcementCage } from "../../lib/types/concrete/ReinforcementCage";
import type { ReinforcementZones } from "../../lib/types/concrete/ReinforcementZones";
import type { SteelBranch } from "../../lib/types/concrete/SteelBranch";
import type { ExposureClass } from "../../lib/types/concrete/ExposureClass";
import type { StructuralClass } from "../../lib/types/concrete/StructuralClass";
import type { ConcreteColumnInput } from "../../lib/types/concrete/ConcreteColumnInput";

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
 * Verende aansluitingen per DOF aan een staafeinde — de derde keuze naast
 * star en scharnier. Een waarde is de veerstijfheid tussen het staafeinde
 * en de knoop: `Tx`/`Tz` (normaalkracht, dwarskracht) in kN/mm, `Ry`
 * (moment) in kNm/rad — "K5000" op een momentaansluiting is dus 5000
 * kNm/rad. Ontbreekt een veld of is het ≤ 0, dan geldt wat `releases` zegt
 * (star of scharnier). Staat op hetzelfde DOF óók een release, dan wint de
 * release: een losse aansluiting kan geen veer dragen.
 */
export interface BeamEindVeren {
  startTx?: number;
  startTz?: number;
  startRy?: number;
  endTx?: number;
  endTz?: number;
  endRy?: number;
}

/**
 * Per-staaf toetsconfiguratie voor de normtoetsing (EN 1993 staal,
 * EN 1995 hout en kruislaaghout, EN 1992 beton). Alle velden zijn optioneel: een ontbrekend veld betekent
 * "gebruik de gedocumenteerde default van de builder" (zie
 * steelCheckBuilder.ts / timberCheckBuilder.ts). De enum-vormen hier zijn
 * UI-vriendelijk; de builders mappen ze 1-op-1 op de ts-rs-typen die de
 * Rust-kern verwacht (DeflectionClass, ServiceClass, LoadDurationClass).
 */
export interface BeamCheckConfig {
  // Staal (EN 1993) en hout (EN 1995)
  /**
   * Kniklengte om de sterke y-as in m — knik IN het vlak van het model.
   *
   * In deze app is y altijd de as in het vlak: een staaf kent geen
   * doorsnederotatie en de oplosser rekent met I_y. Leeg = de kern houdt de
   * staaflengte aan en noemt dat in de toets "staaflengte (terugval)".
   */
  bucklingLengthY_m?: number;
  /**
   * Kniklengte om de zwakke z-as in m — knik UIT het vlak van het model.
   * Die richting ziet de raamwerkberekening nooit, ook niet tweede-orde; de
   * knikcontrole is daar altijd nodig.
   *
   * Leeg = de kern kiest: de grootste afstand tussen plaatsen waar een
   * kipsteun aan de boven- ÉN de onderflens zit (`lateralRestraints` en
   * `lateralRestraintsBottom` op dezelfde fractie), anders de staaflengte. De
   * herkomst staat in de toets; `lib/kniklengte.ts` voorspelt hem voor de
   * placeholder.
   */
  bucklingLengthZ_m?: number;
  /**
   * Kipsteunposities BOVENFLENS als fractie 0..1 van de staaflengte, gemeten
   * VANAF DE BEGINKNOOP — zelfde conventie als
   * LateralBracing.top_flange_positions in de Rust-kern (lambda_chi.rs
   * vermenigvuldigt met de staaflengte). De toetsing ziet ze in de
   * referentierichting van de staaf: bij een staaf die tegen die richting in
   * is getekend als 1 − f, en bij een staande staaf is de bovenflens de
   * LINKERflens. Zie `lib/referentierichting.ts`.
   *
   * Twee gebruikers: de KIP van staal (een steun aan de gedrukte flens telt),
   * en de kniklengte om z van staal én hout (alleen waar ook de onderflens —
   * bij hout de onderrand — op dezelfde plaats gesteund is). De kiptoets van
   * hout leidt er niets uit af; die heeft `ltbSupportSpacing_m`.
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
  /**
   * Doorbuigingsklasse; default "floor". De klasse kiest de NB-categorie van
   * NEN-EN 1990:2002/NB:2019 A1.4.3(3) voor de bijkomende doorbuiging w_add:
   *  - "floor"        → 3/1 000 · ℓ_rep (overige vloeren en daken die
   *                     intensief door personen worden gebruikt, 2e streepje);
   *  - "floorBrittle" → ℓ_rep/500 (vloeren die scheurgevoelige
   *                     scheidingswanden dragen, 1e streepje);
   *  - "roof"         → ℓ_rep/250 (overige daken, 3e streepje);
   *  - "cantilever"   → als "floor", maar met ℓ_rep = 2 × de uitkraaglengte;
   *  - "custom"       → de opgegeven n, voor w_fin én w_add.
   */
  deflectionClass?: "floor" | "floorBrittle" | "roof" | "cantilever" | "custom";
  /** Bij deflectionClass "custom": de n in L/n. */
  deflectionLimitNumerator?: number;
  /**
   * Losse noemer n voor de grenswaarde L/n van de BIJKOMENDE doorbuiging
   * w_add; leeg = de NB-waarde bij de klasse. Alleen door de staalkern
   * geconsumeerd (`deflection_add_limit_numerator`). Bedoeld om een externe
   * referentie-uitwerking met een vaste noemer na te rekenen; het rapport zegt
   * er dan bij dat de noemer is opgegeven en niet uit de norm volgt.
   */
  deflectionAddLimitNumerator?: number;
  /**
   * Zeeg (pre-camber) in mm, POSITIEF = OMHOOG: een zeeg tegen een
   * doorhangende ligger in is een positief getal. De staalkern rekent
   * w_fin = w_z + w_zeeg met de zakking in de referentierichting (negatief
   * omlaag), en laat de zeeg buiten w_add. Alleen bij een liggende staaf; bij
   * een staande staaf (75° of meer) verrekent de toetsing geen zeeg. Zie
   * `lib/referentierichting.ts`. Alleen door de staalkern geconsumeerd.
   */
  preCamber_mm?: number;
  // Hout (EN 1995)
  /** Klimaatklasse §2.3.1.3; default 1. */
  serviceClass?: 1 | 2 | 3;
  /** Belastingduurklasse §2.3.1.2; default "medium" (middellang). */
  loadDuration?: "permanent" | "long" | "medium" | "short" | "instantaneous";
  /**
   * Kipsteunafstand in m voor EN 1995-1-1 art. 6.3.3; default: de
   * staaflengte.
   *
   * Dit is de ℓ waarmee tabel 6.1 de meewerkende (effectieve) lengte l_ef
   * bepaalt: l_ef = verhouding · ℓ, waarbij de verhouding 1,0 / 0,9 / 0,8
   * is voor een ligger op twee steunpunten bij respectievelijk een constant
   * moment, een gelijkmatig verdeelde belasting en een puntlast in het
   * midden, en 0,5 / 0,8 voor een uitkraging. l_ef gaat vervolgens in de
   * kritieke buigspanning σ_m,crit van (6.31)/(6.32) en daarmee in k_crit
   * van (6.33)/(6.35). Een ligger met tussensteunen tegen kip heeft dus een
   * kleinere ℓ dan zijn systeemlengte, en daarmee een hogere σ_m,crit.
   *
   * WAAROM DIT EEN EIGEN VELD IS EN NIET UIT `lateralRestraints` VOLGT.
   * Die lijst is een STAALveld: fracties per FLENS, waar de EN 1993-kern de
   * boven- en onderflens afzonderlijk mee steunt. EN 1995 art. 6.3.3 kent
   * dat onderscheid niet en vraagt één afstand. Zou die uit de fracties
   * worden afgeleid, dan werd l_ef stilzwijgend kleiner — en dus de
   * toetsing gunstiger — op grond van invoer die over iets anders gaat.
   *
   * Leeg = de staaflengte. Dat is de veilige kant: de volle lengte geeft de
   * laagste σ_m,crit en dus de zwaarste kiptoets.
   */
  ltbSupportSpacing_m?: number;
  /**
   * Scheurfactor k_cr voor de dwarskrachttoets, b_ef = k_cr · b in
   * NEN-EN 1995-1-1 art. 6.1.7(2), verg. (6.13a). Bereik (0, 1]; leeg = 1,0.
   *
   * WAAROM 1,0 DE STANDAARD IS. Art. 6.1.7(2) beveelt in zijn OPMERKING 0,67
   * aan voor gezaagd en voor gelijmd gelamineerd hout, maar laat de keuze
   * uitdrukkelijk aan de nationale bijlage. NEN-EN 1995-1-1/NB:2013 bij 6.1.7
   * schrijft voor liggers met een prismatische (rechthoekige) doorsnede
   * k_cr = 1,0 voor; de 0,8 daar geldt alleen voor I-, T- en kokerprofielen
   * met een lijf dunner dan de halve flensbreedte, en die verhouding leest de
   * kern zelf uit een samengestelde doorsnede (`shear::k_cr_nb`). 1,0 is dus
   * de Nederlandse normwaarde en geen vereenvoudiging.
   *
   * Wie toch met de aanbevolen 0,67 wil rekenen (een opdrachtgever die de
   * Europese aanbeveling eist, een vergelijking met een berekening van
   * elders) zet dat hier expliciet; de toets vermeldt de gebruikte waarde met
   * bron. Buiten (0, 1] is geen scheurfactor: nul of negatief betekent geen
   * breedte, meer dan 1 meer breedte dan er is — dat wordt geweigerd, niet
   * stil gecorrigeerd.
   */
  kCr?: number;
  /**
   * Kiptoets van art. 6.3.3 uitvoeren; leeg = true.
   *
   * `false` betekent één ding: de gedrukte rand is over de volle lengte
   * zijdelings gesteund (bijvoorbeeld een balklaag met doorgaand dakbeschot of
   * een vloerplaat op de bovenrand) en de opleggingen laten geen torsie toe.
   * Dan mag k_crit = 1,0 worden genomen (art. 6.3.3(5)), en is de buiging al
   * getoetst in art. 6.1.6 en de druk in art. 6.3.2; (6.35) met k_crit = 1
   * kan daar niet strenger uitvallen. De toetsing laat de kiptoets dan NIET
   * stil weg: zij staat als "niet van toepassing" in het resultaat, met deze
   * reden in de notitie, zodat het rapport de aanname toont.
   */
  performLtbCheck?: boolean;
  /**
   * Aangrijpingspunt van de belasting voor tabel 6.1 (voetnoot a): bij een
   * last aan de DRUKzijde wordt l_ef vermeerderd met 2h, bij een last aan de
   * TREKzijde verminderd met 0,5h; in het zwaartepunt blijft l_ef = verhouding
   * · ℓ. Leeg = "centreOfGravity", het gedrag van vóór dit veld.
   *
   * Een dakbeschot of vloer op de bovenrand van een vrij opgelegde ligger is
   * een last aan de drukzijde: het aangrijpingspunt ligt boven het
   * dwarskrachtcentrum en versterkt het kippen. Dat is de ongunstige kant;
   * wie hem kiest, ziet l_ef in de kiptoets groeien. Dezelfde namen als de
   * Rust-enum `LtbLoadPosition`, in de spelling van dit object.
   */
  ltbLoadPosition?: "centreOfGravity" | "compressionEdge" | "tensionEdge";
  // Beton (EN 1992)
  /**
   * Wapeningskorf: dekking, beugel, boven- en onderwapening. Zonder korf
   * wordt een betonstaaf niet getoetst (met reden in het paneel) — er is
   * geen stille standaardkorf.
   */
  betonKorf?: ReinforcementCage;
  /**
   * Milieuklasse van tabel 4.1, voor de dekkingstoets van 4.4.1.2. Ontbreekt
   * hij, dan is de dekking NIET aan de norm getoetst — er is met opzet geen
   * standaardklasse, want die zou een dekking kunnen goedkeuren die bij het
   * werkelijke milieu ver te dun is.
   */
  betonMilieuklasse?: ExposureClass;
  /**
   * Constructieklasse van 4.4.1.2(5). Ontbreekt hij, dan S4 — de waarde die
   * de nationale bijlage voor een ontwerplevensduur van 50 jaar voorschrijft.
   */
  betonConstructieklasse?: StructuralClass;
  /** Wapeningsstaal; default "B500B". */
  betonStaalsoort?: string;
  /** Aantal stroken voor de M-N-κ-integratie van de doorsnede; default 50. */
  betonStroken?: number;
  /** Bovenste tak van het staaldiagram (3.2.7); default horizontaal. */
  betonStaaltak?: SteelBranch;
  /**
   * De §5.8-gegevens van een op DRUK belaste betonstaaf: geschoord of
   * ongeschoord, de kniklengte, de kruipcoëfficiënt en de twee keuzen die
   * §9.5 nodig heeft.
   *
   * EEN BLOK EN GEEN LOSSE VELDEN, precies zoals `betonKorf` er één is. De
   * bouwer geeft het als geheel door (`column: cfg.betonKolom`) en somt de
   * velden niet op; een bouwer die dat wél doet, laat een nieuw veld
   * stilzwijgend vallen, en dan rekent de kern met een andere kniklengte dan
   * de gebruiker heeft ingevoerd. Het type komt letterlijk uit de Rust-kern.
   *
   * ONTBREEKT HET VELD, dan wordt §5.8 niet getoetst en staat de reden in het
   * rapport. Er is met opzet geen standaardwaarde: §5.8.1 noemt geschoord
   * uitdrukkelijk een aanname in de BEREKENING en niet een eigenschap van de
   * constructie — een raamwerk met een windverband ziet er in dit 2D-model
   * niet anders uit dan hetzelfde raamwerk zonder — en het verschil is een
   * factor twee in de kniklengte. Dezelfde afspraak als bij
   * `betonMilieuklasse`: liever geen toets dan een aangenomen antwoord.
   */
  betonKolom?: ConcreteColumnInput;
  /**
   * De wapening die LANGS de staaf verandert: welke staaflaag van waar tot
   * waar loopt (§9.2.1.3) en waar de beugels dichter staan (§9.2.2). Maten in
   * mm vanaf de beginknoop; de toetsing en het betonvenster zien ze in de
   * referentierichting van de staaf (`lib/referentierichting.ts`).
   *
   * ONTBREEKT OF LEEG = het gedrag van vóór dit veld: `betonKorf` geldt dan
   * onveranderd over de hele staaf, de solver zet geen extra rekenknopen en de
   * dekkingslijn krijgt per zijde één bundel over [0, L].
   *
   * Staat het veld er wél, dan gebeuren er twee dingen tegelijk, en die horen
   * bij elkaar: de betontoetsing krijgt per snede de korf die daar werkelijk
   * ligt (`reinforcement_zones` in de toetsinvoer), en de solver legt op elke
   * zonegrens een rekenknoop (`extraSneden`, zie `lib/betonZoneSneden.ts`).
   * Zonder die tweede stap zou de omhullende geen punt hebben op de plaats waar
   * de weerstand SPRINGT, en zou de dekkingslijn daar een benodigde kracht van
   * elders naast een weerstand van hier zetten.
   */
  betonZones?: ReinforcementZones;
  // Vrije spanningstoets (geen norm)
  /**
   * Dwarsspanning σ_z in N/mm² voor de vergelijkspanning, bijvoorbeeld een
   * oplegdruk. Default 0: een staafelement kent alleen N, V en M en berekent
   * σ_z niet zelf, dus die waarde kan alleen van de gebruiker komen.
   */
  spanningSigmaZ?: number;
}

/**
 * STAAFTYPE van een staaf — wát het onderdeel in de constructie ís, en dus
 * welk belastingvlak het draagt. De windgenerator leest het staaftype om te
 * bepalen welke vormfactor en welke referentiehoogte bij een staaf horen;
 * zonder staaftype weet de generator niet of een verticale staaf een
 * gevelstijl is of een binnenkolom.
 *
 * De lijst is bewust fijn: de vormfactor van een LINKERgevel bij wind van
 * links (druk, zone D) verschilt van diezelfde gevel bij wind van rechts
 * (zuiging, zone E). Zie NEN-EN 1991-1-4 tabel 7.1.
 *
 * Uitbreidbaar: nieuwe staaftypen kunnen aan deze unie worden toegevoegd; de
 * generator negeert typen die hij niet kent en meldt dat.
 *
 * NAAMGEVING — de UI noemt dit "staaftype"; de code houdt de bestaande namen
 * (`BeamLoadRole`, `Beam.loadRole`, `bepaalStandaardRol`, `rolVanStaaf`) aan.
 * `loadRole` staat namelijk in opgeslagen projectbestanden en in de
 * MCP-modelvalidatie; hernoemen zou die bestanden breken.
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

/** Volgorde + NL-labels van de staaftypen, voor dropdowns en tabellen. */
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
  /** Verende aansluitingen per end (kN/mm, kNm/rad); zie BeamEindVeren. */
  veren?: BeamEindVeren;
  /** Per-staaf toetsconfiguratie; ontbreekt → builder-defaults. */
  checkConfig?: BeamCheckConfig;
  /**
   * Staaftype van deze staaf (in de UI: "staaftype"). ONTBREEKT het veld —
   * alle bestaande projectbestanden — dan geldt het uit de geometrie afgeleide
   * standaardtype (zie `bepaalStandaardRol`); de gebruiker kan dat altijd
   * overschrijven, en dan staat de keuze hier vast in het projectbestand.
   * De veldnaam blijft `loadRole` omdat hij zo op schijf staat.
   */
  loadRole?: BeamLoadRole;
  /**
   * Staaf op bedding (Winkler). ONTBREEKT het veld — alle bestaande
   * projectbestanden — dan ligt de staaf niet op een bedding.
   *
   * De rekenkern kent de bedding al (`onGrade`, veren kL/2 per knoop); de
   * adapter rekent uit `k · b` de lijnstijfheid en knipt de staaf fijn genoeg
   * op de karakteristieke lengte 1/λ = (4EI/(k·b))^¼, zodat de tussenknopen
   * samen de tributaire veerstijfheid dragen — precies wat referentie R26
   * met de hand doet.
   */
  bedding?: BeamBedding;
}

/** Bedding onder een staaf: beddingsconstante en contactbreedte. */
export interface BeamBedding {
  /** Beddingsconstante k in kN/m³ (typisch 10 000 – 100 000 voor grond). */
  k: number;
  /** Contactbreedte b in mm — de breedte van de staaf op de bedding. */
  b: number;
}

/**
 * Standaard-staaftype uit de geometrie: een (vrijwel) verticale staaf aan
 * de buitenrand is een gevel, de bovenste (vrijwel) horizontale of hellende
 * staven vormen het dak, overige horizontale staven zijn vloer en de rest is
 * binnenstaaf. Dit is een HULP, geen waarheid — de gebruiker overschrijft het
 * staaftype per staaf in de eigenschappen of in de tabel.
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

/** Staaftype: expliciet gezet, of anders afgeleid uit de geometrie. */
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

// ── Plaatrand-adressering: één regel voor engine, validatie, canvas en rapport ──
//
// WAAROM DIT HIER STAAT
// Een plaatrand had twee adressen die elk maar bij één plaatvorm werkten: een
// benoemde rand (`edge`: "bottom" … "right") bij een asgelijnde rechthoek en een
// rand-index (`edgeIndex`) bij een polygoon. Elke lezer vertaalde ze zelf, en
// dat ging in twee richtingen stil mis (gemeten, september 2026): een benoemde
// rand op een plaat die door slepen een polygoon werd verdween in elke
// rekenroute, en een rand-index op een plaat die een rechthoek werd, belastte
// via de app en de MCP de BOVENrand. Een last op de verkeerde rand ziet er in
// een resultaat volkomen normaal uit.
//
// DE OMZETTING, EXPLICIET
// Beide adressen worden hier omgezet naar één canonieke vorm: een HOEKPAAR
// (`hoekVan` → `hoekNaar`, indices in `Plate.nodeIds`). Fractie 0 langs de rand
// ligt op `hoekVan`, fractie 1 op `hoekNaar` — de betekenis van `startFrac`,
// `endFrac` en `posFrac` op een plaatrand, precies zoals bij een staaf vanaf
// zijn startknoop.
//   - `edgeIndex` i (de bron; werkt bij ELKE plaatvorm): hoek i → hoek i+1
//     (cyclisch). Bij een rechthoek moet dat paar een zijde van de omtrek zijn.
//   - `edge` (alias, alleen bij een asgelijnde rechthoek): de twee hoeken van
//     die zijde, geteld vanaf de kleinste coördinaat — onder- en bovenrand van
//     links naar rechts (kleinste x eerst), linker- en rechterrand van onder
//     naar boven (kleinste z eerst).
// Alles wat daarbuiten valt, wordt GEWEIGERD met een reden in plaats van
// benaderd: beide adressen tegelijk, geen adres, een index buiten bereik, een
// benoemde rand op een polygoon, en een rand-index die bij een rechthoek met
// hoeken buiten omtrekvolgorde een diagonaal zou zijn.

/** Benoemde rand van een asgelijnde rechthoekplaat, in modelassen. */
export type PlaatRandNaam = "bottom" | "top" | "left" | "right";

/** Nederlandse namen van de benoemde randen. */
export const PLAAT_RAND_NAAM_NL: Record<PlaatRandNaam, string> = {
  bottom: "onderrand", top: "bovenrand", left: "linkerrand", right: "rechterrand",
};

const PLAAT_RAND_NAMEN: readonly PlaatRandNaam[] = ["bottom", "top", "left", "right"];

/** Uitkomst van `bepaalPlaatRand`: de canonieke rand, of de reden van weigeren. */
export type PlaatRandUitkomst =
  | {
      ok: true;
      /** Rekenpad van de plaat: grid (rechthoek) of CDT-cache (polygoon). */
      soort: "rechthoek" | "polygoon";
      /** Hoekindex (in `Plate.nodeIds`) waar fractie 0 langs de rand ligt. */
      hoekVan: number;
      /** Hoekindex waar fractie 1 ligt. */
      hoekNaar: number;
      /** Coördinaten (mm) van `hoekVan` en `hoekNaar`. */
      van: PlaatPunt;
      naar: PlaatPunt;
      /** Randlengte in mm. */
      lengte: number;
      /** De zijde van het gridmesh — alleen bij een rechthoek. */
      naam?: PlaatRandNaam;
      /** De rand-index — alleen als de last hem zelf opgaf. */
      edgeIndex?: number;
    }
  | { ok: false; reden: string };

/**
 * Zet het randadres van een plaatlast om naar de canonieke rand (zie het
 * blokcommentaar hierboven). `punten` zijn de hoekcoördinaten in de volgorde
 * van `Plate.nodeIds`. Pure functie: dezelfde uitkomst voor engine, MCP-
 * validatie, canvas, eigenschappenpaneel, rapport en IFC-export.
 */
export function bepaalPlaatRand(
  punten: PlaatPunt[],
  adres: { edge?: string; edgeIndex?: number },
  tolMm = 1,
): PlaatRandUitkomst {
  const n = punten.length;
  const rechthoek = n === 4 && isAsgelijndeRechthoek(punten, tolMm);
  const soort = rechthoek ? "rechthoek" as const : "polygoon" as const;
  const heeftNaam = adres.edge !== undefined;
  const heeftIndex = adres.edgeIndex !== undefined;
  if (heeftNaam && heeftIndex) {
    return {
      ok: false,
      reden:
        "de last noemt zowel een benoemde rand (`edge`) als een rand-index " +
        "(`edgeIndex`). Geef er één: met twee adressen is niet te zeggen welke " +
        "rand bedoeld is en vanaf welke hoek de posities tellen.",
    };
  }
  if (!heeftNaam && !heeftIndex) {
    return {
      ok: false,
      reden:
        "de last noemt geen rand. Geef `edgeIndex` (rand i loopt van hoek i naar " +
        "hoek i+1) of, bij een asgelijnde rechthoek, `edge`.",
    };
  }
  if (n < 3) {
    return { ok: false, reden: `de plaat heeft ${n} hoeken; een rand bestaat pas vanaf drie.` };
  }

  if (heeftIndex) {
    const i = adres.edgeIndex!;
    if (!Number.isInteger(i) || i < 0 || i >= n) {
      return {
        ok: false,
        reden:
          `rand-index ${i} bestaat niet: de plaat heeft ${n} randen ` +
          `(edgeIndex 0 t/m ${n - 1}).`,
      };
    }
    const j = (i + 1) % n;
    const van = punten[i], naar = punten[j];
    const lengte = Math.hypot(naar.x - van.x, naar.z - van.z);
    if (!rechthoek) {
      return { ok: true, soort, hoekVan: i, hoekNaar: j, van, naar, lengte, edgeIndex: i };
    }
    // Rechthoek: het rekenmesh kent alleen de vier zijden. Een hoekpaar dat
    // geen zijde is (hoeken buiten omtrekvolgorde getekend) is een diagonaal
    // door de plaat en heeft dus geen randknopen.
    const xs = punten.map((p) => p.x), zs = punten.map((p) => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const op = (a: number, b: number) => Math.abs(a - b) <= tolMm;
    let naam: PlaatRandNaam | undefined;
    if (op(van.z, minZ) && op(naar.z, minZ)) naam = "bottom";
    else if (op(van.z, maxZ) && op(naar.z, maxZ)) naam = "top";
    else if (op(van.x, minX) && op(naar.x, minX)) naam = "left";
    else if (op(van.x, maxX) && op(naar.x, maxX)) naam = "right";
    if (!naam) {
      return {
        ok: false,
        reden:
          `rand ${i + 1} (edgeIndex ${i}, hoek ${i + 1} → hoek ${j + 1}) loopt niet ` +
          "langs de omtrek: de hoeken van deze rechthoek staan niet in " +
          "omtrekvolgorde, dus dit hoekpaar is een diagonaal. Kies de rand met " +
          "een benoemde rand (`edge`) of teken de plaat opnieuw in omtrekvolgorde.",
      };
    }
    return { ok: true, soort, hoekVan: i, hoekNaar: j, van, naar, lengte, naam, edgeIndex: i };
  }

  const naam = adres.edge as PlaatRandNaam;
  if (!PLAAT_RAND_NAMEN.includes(naam)) {
    return {
      ok: false,
      reden: `"${adres.edge}" is geen benoemde rand. Toegestaan: ${PLAAT_RAND_NAMEN.join(", ")}.`,
    };
  }
  if (!rechthoek) {
    return {
      ok: false,
      reden:
        `een benoemde rand ("${PLAAT_RAND_NAAM_NL[naam]}") bestaat alleen bij een ` +
        `asgelijnde rechthoek; deze plaat heeft ${n} hoeken die geen asgelijnde ` +
        "rechthoek vormen en rekent als polygoon. Kies de rand opnieuw met een " +
        "rand-index (`edgeIndex`: rand i loopt van hoek i naar hoek i+1).",
    };
  }
  const xs = punten.map((p) => p.x), zs = punten.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const [doelVan, doelNaar]: [PlaatPunt, PlaatPunt] =
    naam === "bottom" ? [{ x: minX, z: minZ }, { x: maxX, z: minZ }]
    : naam === "top" ? [{ x: minX, z: maxZ }, { x: maxX, z: maxZ }]
    : naam === "left" ? [{ x: minX, z: minZ }, { x: minX, z: maxZ }]
    : [{ x: maxX, z: minZ }, { x: maxX, z: maxZ }];
  const zoek = (d: PlaatPunt) =>
    punten.findIndex((p) => Math.abs(p.x - d.x) <= tolMm && Math.abs(p.z - d.z) <= tolMm);
  const hoekVan = zoek(doelVan), hoekNaar = zoek(doelNaar);
  // isAsgelijndeRechthoek garandeert dat elke bbox-hoek bezet is.
  const van = punten[hoekVan], naar = punten[hoekNaar];
  return {
    ok: true, soort, hoekVan, hoekNaar, van, naar,
    lengte: Math.hypot(naar.x - van.x, naar.z - van.z), naam,
  };
}

/**
 * Korte Nederlandse naam van een randadres, zoals de gebruiker hem invoerde:
 * "rand 3" bij een rand-index (1-based, zoals het canvas hem toont), anders de
 * benoemde rand. Zegt niets over geldigheid — daarvoor is `bepaalPlaatRand`.
 */
export function plaatRandLabel(adres: { edge?: string; edgeIndex?: number }): string {
  if (adres.edgeIndex !== undefined) return `rand ${adres.edgeIndex + 1}`;
  if (adres.edge !== undefined && (PLAAT_RAND_NAMEN as readonly string[]).includes(adres.edge)) {
    return PLAAT_RAND_NAAM_NL[adres.edge as PlaatRandNaam];
  }
  return "rand onbekend";
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

/**
 * NL-meervoud per lastsoort, voor zinnen als "alle lijnlasten in dit
 * belastinggeval". Bewust apart van het enkelvoudige label in het
 * eigenschappenpaneel: dáár staat de eenheid erbij ("Lijnlast (q)"), hier
 * moet de tekst in een menuregel en een melding passen.
 */
export const LOAD_SOORT_MEERVOUD: Record<LoadType, string> = {
  lineLoad:    "lijnlasten",
  pointForce:  "puntlasten",
  pointMoment: "momenten",
  thermal:     "temperatuurlasten",
  edgeLoad:    "randlasten",
};

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
   *
   * PUNTLAST OP EEN PLAATRAND: `pointForce` met `plateId`, een randadres
   * (`edge` of `edgeIndex`) en `posFrac` = fractie 0..1 langs die rand vanaf de
   * beginhoek (zie `bepaalPlaatRand`); `nodeId` en `beamId` blijven dan leeg.
   * Hier is `posFrac` VERPLICHT. De engine verdeelt de kracht consistent over
   * de twee randknopen van de elementrand waarop hij staat — geen nieuwe
   * rekenknoop, dus hetzelfde mesh in elk belastinggeval.
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
   *
   * Bij een RANDLAST (`edgeLoad`) hebben startFrac/endFrac/qStart/qEnd
   * dezelfde betekenis, langs de rand vanaf de beginhoek (zie
   * `bepaalPlaatRand`). De engine zet zo'n deel- of trapeziumlast om in
   * consistente knoopkrachten, ook als het belaste deel binnen een elementrand
   * begint of eindigt.
   */
  startFrac?: number;
  /** Deellast: einde van het belaste deel als fractie 0..1. Default 1. */
  endFrac?: number;
  deltaT?: number; // K
  /**
   * De plaat van een plaatlast: de randlast (`edgeLoad`) of de puntlast op een
   * plaatrand (`pointForce` met `plateId`). Aanwezig ⇒ ook een randadres.
   */
  plateId?: number;
  /**
   * Plaatrand, benoemd (alleen bij een ASGELIJNDE RECHTHOEK): "bottom" =
   * onderrand (kleinste z), "top" = bovenrand (grootste z), "left"/"right" =
   * kleinste/grootste x. Een alias: `bepaalPlaatRand` zet hem om naar het
   * hoekpaar van die zijde, geteld vanaf de kleinste coördinaat. Op een
   * polygoonplaat wordt hij GEWEIGERD (daar bestaat geen onder- of bovenrand),
   * en samen met `edgeIndex` ook — zie `bepaalPlaatRand`.
   *
   * Voor een randlast (`edgeLoad`) staat de lastgrootte p in `q` (kN/m langs de
   * randlengte) en de richting in `qDir` (GLOBALE assen, negatief = tegen de
   * +richting in — dezelfde tekenconventie als lijnlasten).
   */
  edge?: PlaatRandNaam;
  /**
   * Plaatrand als RAND-INDEX (de bron; werkt bij elke plaatvorm): rand i loopt
   * van hoek i naar hoek i+1 (cyclisch, 0-based, in de volgorde van
   * `Plate.nodeIds`). Fracties langs de rand tellen vanaf hoek i. Bij een
   * rechthoek moet dat hoekpaar een zijde zijn (hoeken in omtrekvolgorde),
   * anders volgt een weigering.
   */
  edgeIndex?: number;
  /**
   * Herkomst van deze last. ONTBREEKT het veld, dan is de last HANDMATIG
   * ingevoerd en raakt geen enkele generator hem aan. Staat er `"wind"`, dan
   * is de last door de windbelastinggenerator gemaakt en wordt hij bij een
   * volgende generatie vervangen. Zo blijft handwerk altijd behouden.
   */
  gegenereerdDoor?: "wind";
  /**
   * Vrije omschrijving van de gebruiker: waar komt deze last vandaan?
   * "sneeuw op overstek", "opslag magazijn", "reactie spant 3". Puur
   * documentatie — de solver leest dit veld NIET en er verandert geen enkel
   * getal door. Het bestaat voor de lastentabel in het rapport: een rij
   * `q = −4,50 kN/m op staaf 7` zegt niets, dezelfde rij met
   * "gevelbelasting" ernaast zegt alles.
   *
   * Optioneel — elk bestaand projectbestand mist het veld en laadt
   * ongewijzigd. Leeg of alleen witruimte wordt NIET opgeslagen (het veld
   * gaat dan terug naar `undefined`), zodat "geen omschrijving" precies één
   * vorm heeft en overal hetzelfde uitpakt.
   *
   * Nederlandse veldnaam, net als `gegenereerdDoor`: de Engelse namen op dit
   * type (`fx`, `qDir`, `startFrac`) zijn formulesymbolen uit de mechanica en
   * dit is er geen — het is domeintaal van de constructeur.
   */
  omschrijving?: string;
}

/**
 * Gebruikscategorie van een veranderlijke belasting, zoals de rijen van
 * NEN-EN 1990:2002/NB:2019 tabel NB.2–A1.1. De categorie bepaalt ψ₀, ψ₁ en ψ₂
 * (zie `PSI_GEBRUIK` in components/fem/solver/normcombinaties.ts).
 *
 * Categorie C staat er twee keer in omdat voetnoot a bij de tabel twee waarden
 * voor ψ₀ geeft: 0,6 voor delen die bij een calamiteit zwaar door een
 * mensenmenigte belast kunnen worden (vluchtroutes, trappen), en 0,4 voor de
 * overige delen. Die keuze hoort bij de gebruiker, niet bij de app.
 */
export type GebruiksCategorie =
  | "A" | "B" | "C" | "C-menigte" | "D" | "E" | "F" | "G" | "H"
  | "industrie-kort" | "industrie-lang";

/** Alle gebruikscategorieën, in de volgorde van tabel NB.2–A1.1. */
export const GEBRUIKSCATEGORIEEN: readonly GebruiksCategorie[] = [
  "A", "B", "C", "C-menigte", "D", "E", "F", "G", "H",
  "industrie-kort", "industrie-lang",
];

export interface LoadCase {
  id: number;
  name: string;
  type: "dead" | "live" | "snow" | "wind" | "other";
  /**
   * Gebruikscategorie volgens NB tabel NB.2–A1.1 — alleen betekenisvol bij
   * type "live". Ontbreekt het veld, dan geldt categorie A (woon- en
   * verblijfsruimtes); de formule van elke standaardcombinatie noemt de ψ die
   * daarbij hoort, zodat die aanname in het rapport zichtbaar is.
   */
  categorie?: GebruiksCategorie;
  /**
   * Herkomst van dit belastinggeval, met een STABIELE sleutel per geval
   * (bijvoorbeeld "wind:links:cpi+0.2"). De generator hergebruikt bij een
   * herhaalde generatie het id dat bij dezelfde sleutel hoort, zodat lasten,
   * combinaties en de actieve tab niet bij elke regeneratie verspringen.
   * Ontbreekt het veld → handmatig aangemaakt belastinggeval.
   */
  gegenereerd?: { bron: "wind"; sleutel: string };
}

/**
 * Het analysetype: wat de solver met de combinaties doet.
 *
 * Dit veld vervangt de booleaan `nonlinearEnabled`. Die kende twee standen, en
 * zodra de fysisch niet-lineaire variant erbij komt zijn dat er drie — een
 * derde stand in een booleaan persen (bijvoorbeeld "true met een tweede
 * vlaggetje ernaast") maakt onleesbaar welke berekening er gedraaid heeft.
 * Zie besluit B4 in het plandocument.
 *
 *  - `eersteOrde` — lineair, superpositie per combinatie. Het gedrag bij
 *    `nonlinearEnabled = false`.
 *  - `tweedeOrdeGeometrisch` — P-Δ per combinatie (geometrische stijfheid +
 *    iteratie). Het gedrag bij `nonlinearEnabled = true`; ONGEWIJZIGD.
 *  - `tweedeOrdeFysisch` — P-Δ én fysisch niet-lineair: de betonstaven
 *    krijgen per segment de secans-EI uit de rekenkern, in een lus die per
 *    combinatie apart draait (zie `lib/betonStijfheid.ts`). Alleen zinvol met
 *    betonstaven mét wapeningskorf in het model; staat er geen enkele, dan is
 *    de uitkomst gelijk aan `tweedeOrdeGeometrisch` en zegt de interface dat.
 */
export type Analysetype =
  | "eersteOrde"
  | "tweedeOrdeGeometrisch"
  | "tweedeOrdeFysisch";

/** Alle analysetypen in de volgorde waarin ze in de interface staan. */
export const ANALYSETYPEN: readonly Analysetype[] = [
  "eersteOrde",
  "tweedeOrdeGeometrisch",
  "tweedeOrdeFysisch",
] as const;

/** Korte naam voor de keuzelijst. */
export const ANALYSETYPE_LABEL: Record<Analysetype, string> = {
  eersteOrde: "1e orde",
  tweedeOrdeGeometrisch: "2e orde (P-Δ)",
  tweedeOrdeFysisch: "2e orde + fysisch",
};

/** Volledige omschrijving voor tooltip en rapport. */
export const ANALYSETYPE_OMSCHRIJVING: Record<Analysetype, string> = {
  eersteOrde:
    "Eerste orde, lineair: elke combinatie is de gewogen som van de belastinggevallen.",
  tweedeOrdeGeometrisch:
    "Tweede orde, geometrisch niet-lineair (P-Δ): elke combinatie wordt met " +
    "gefactoreerde lasten en geometrische stijfheid apart opgelost.",
  tweedeOrdeFysisch:
    "Tweede orde, geometrisch én fysisch niet-lineair: als P-Δ, maar de " +
    "betonstaven krijgen per segment de secans-EI uit de rekenkern " +
    "(NEN-EN 1992-1-1 5.8.6). Zonder betonstaven mét wapeningskorf is de " +
    "uitkomst gelijk aan 2e orde (P-Δ).",
};

/**
 * Terugleesbaarheid van het projectbestand: `analysetype` ontbreekt in elk
 * bestand van vóór deze wijziging, en dan telt de oude booleaan.
 * `true` → tweede orde (geometrisch), `false`/ontbrekend → eerste orde.
 *
 * Een ONBEKENDE waarde in het veld (een bestand uit een nieuwere versie, of
 * een tikfout) valt op dezelfde manier terug: raden welke van de drie bedoeld
 * was zou een andere berekening kunnen opleveren dan de gebruiker bewaarde.
 */
export function analysetypeUitBestand(
  analysetype: string | undefined,
  nonlinearEnabled: boolean | undefined,
): Analysetype {
  if (
    analysetype !== undefined &&
    (ANALYSETYPEN as readonly string[]).includes(analysetype)
  ) {
    return analysetype as Analysetype;
  }
  return nonlinearEnabled ? "tweedeOrdeGeometrisch" : "eersteOrde";
}

/**
 * De booleaan die het projectbestand blijft dragen, zodat een oudere versie
 * van de app een nieuw bestand nog kan lezen: beide tweede-orde-standen zijn
 * daar "niet-lineair aan".
 */
export function nonlinearVoorBestand(analysetype: Analysetype): boolean {
  return analysetype !== "eersteOrde";
}

export type Selection =
  | { type: "node"; id: number }
  | { type: "beam"; id: number }
  | { type: "plate"; id: number }
  | { type: "load"; id: number }
  | {
      type: "multi";
      nodeIds: number[];
      beamIds: number[];
      plateIds: number[];
      /**
       * Geselecteerde BELASTINGEN. Optioneel en standaard afwezig: alle
       * bestaande selectiepaden (kaderselectie, shift-klikken, de projectboom)
       * vullen dit veld niet en gedragen zich onveranderd. Gevuld wordt het
       * alleen door "selecteer alle lasten van deze soort" in het
       * canvas-contextmenu, zodat één Ctrl+C de hele set naar het klembord
       * neemt. Lasten hebben geen eigen knopen, dus verplaatsen/roteren/
       * spiegelen raakt ze niet — verwijderen wél (zie deleteSelected).
       */
      loadIds?: number[];
    }
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
