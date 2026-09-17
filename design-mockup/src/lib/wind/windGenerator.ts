/**
 * Windbelastinggenerator — van 2D-raamwerk + projectgegevens naar
 * belastinggevallen, lijnlasten en belastingcombinaties.
 *
 * PURE MODULE: geen React, geen store, geen DOM. Invoer erin, resultaat
 * eruit — daardoor volledig testbaar (test-wind-*.mjs) en DETERMINISTISCH:
 * dezelfde constructie + dezelfde instellingen geeft byte-voor-byte dezelfde
 * uitvoer, inclusief volgorde. Die eigenschap draagt de idempotentie van het
 * automatisch opnieuw genereren (zie windStore.ts).
 *
 * ROLVERDELING
 *  • windEurocode.ts — de normwaarden en de stuwdruk, elk met vindplaats.
 *  • dit bestand     — geometrie, zone-indeling, tekens en de vertaling naar
 *                      lijnlasten/combinaties.
 *  • windStore.ts    — koppeling met de model-store (id's, vervangen,
 *                      automatisch opnieuw draaien).
 *
 * TEKENCONVENTIE van de gegenereerde lijnlasten
 *  Alle windlasten worden weggeschreven als `qCoord: "local", qDir: "z"`:
 *  loodrecht op de staafas, positief langs de lokale +z-as, die 90° tegen de
 *  klok in staat op de as van `from` naar `to` (zie Load.qCoord in femTypes).
 *  Een positieve DRUK w duwt tegen het vlak in, dus tegengesteld aan de
 *  buitennormaal n:  q_lokaal = −w · (n · t)  met t de lokale +z-eenheids-
 *  vector. Deze formulering is onafhankelijk van de tekenrichting waarin de
 *  gebruiker de staaf heeft getekend.
 */
import type { Beam, Load, LoadCase, Node } from "../../components/fem/femTypes";
import { rolVanStaaf, type BeamLoadRole } from "../../components/fem/femTypes";
import {
  begeleidendeOpstellingen, partieleFactoren, psiBron, psiKlimaat,
  STANDAARD_GEVOLGKLASSE, type GevalInvoer, type Gevolgklasse, type PsiWaarden,
} from "../../components/fem/solver/normcombinaties";
import { STANDAARD_BIJLAGE, type NationaleBijlageCode } from "../normAanduidingen";
import {
  berekenE, berekenStuwdruk, handmatigeStuwdruk, cpeWand,
  CPE_PLAT_DAK, CPE_PLAT_DAK_BRON, CPI_BRON, CPI_ONBEKEND, CPE10_BRON,
  CPE10_MIN_OPPERVLAK_M2, CSCD_BRON, CSCD_GRENSHOOGTE_M, MELDING_ZONE_I,
  TABEL_71_BRON, ZMAX_M, overkappingCoefficienten,
  CF0_SCHERPHOEKIG, GESCHAKELD_BRON, KOLOM_BRON, PLAATACHTIG_GRENS_DB, PLAATACHTIG_TOESLAG,
  TABEL_710_CFR, TABEL_710_OMSCHRIJVING, WRIJVING_BRON, cf0Rechthoekig, geschakeldeReductie,
  type GeschakeldeReductie, type KolomDoorsnede, type Oppervlakteruwheid,
  type OverkappingDakvorm, type OverkappingOpzoeking, type OverkappingZone,
  type StuwdrukResultaat, type TerreinCategorie, type Windgebied,
} from "./windEurocode";

// ── Instellingen ─────────────────────────────────────────────────────────

/**
 * "alle" = een geval dat niet bij één windrichting hoort: de c_p,net- en
 * c_f-waarden van een vrijstaand dak gelden voor alle windrichtingen
 * (NEN-EN 1991-1-4 §7.3(3)).
 */
export type Windrichting = "links" | "rechts" | "haaks" | "alle";

export interface WindInstellingen {
  // Uit de projectgegevens (ProjectSettingsDialog → Uitgangspunten).
  windgebied: Windgebied;
  terreincategorie: TerreinCategorie;
  /** "berekend" = EN 1991-1-4 §4; "handmatig" = waarde uit de NB-tabel. */
  stuwdrukBron: "berekend" | "handmatig";
  qpHandmatig_kNm2: number;

  // Windrichtingen die belastinggevallen opleveren.
  richtingLinks: boolean;
  richtingRechts: boolean;
  /** Wind haaks op het spant (op de kopgevel) — zie de meldingen. */
  richtingHaaks: boolean;

  /** Inwendige druk: "beide" = +0,2 én −0,3 als aparte gevallen (§7.2.9). */
  cpiKeuze: "beide" | "plus" | "min" | "handmatig";
  cpiHandmatig: number;

  /** Hart-op-hart-afstand van de spanten in m. */
  hohSpant_m: number;
  /** Tussenspant → belastingbreedte = h.o.h.; kopgevelspant → h.o.h./2. */
  positieSpant: "tussenspant" | "kopgevelspant";
  /** Wanneer gezet: overschrijft de uit h.o.h. afgeleide belastingbreedte. */
  belastingbreedteOverride_m: number | null;

  /** Gebouwlengte haaks op het spant, in m (nodig voor e = min(b; 2h)). */
  gebouwlengte_m: number;
  /** Afstand van dit spant tot de dichtstbijzijnde kopgevel, in m. */
  afstandTotKopgevel_m: number;

  /** c_pe,10 loefdakvlak bij hellend dak — tabel 7.4a, door de gebruiker. */
  cpeDakLoef: number | null;
  /** c_pe,10 lijdakvlak bij hellend dak — tabel 7.4a, door de gebruiker. */
  cpeDakLij: number | null;
  /** c_pe,10 hellend dak bij wind haaks — tabel 7.4b, door de gebruiker. */
  cpeDakHaaks: number | null;

  /** Ook belastingcombinaties aanmaken (EN 1990 6.10a/6.10b/EQU/6.14b). */
  combinatiesGenereren: boolean;

  /**
   * Kap zonder gevel: de gevels staan niet in het model (een kapspant dat op
   * gemetselde wanden rust), en dit is de hoogte van de onderkant van de kap
   * boven maaiveld, in m. De referentiehoogte wordt dan gevelhoogte +
   * kaphoogte, want de stuwdruk hoort bij de werkelijke bouwhoogte en niet
   * bij de hoogte van wat er toevallig getekend is. `null` = niet van
   * toepassing (de gevels staan in het model, of de kap staat op de grond).
   */
  gevelhoogte_m: number | null;

  /**
   * "gebouw" = gevels en dak met c_pe/c_pi (§7.2); "vrijstaandDak" = een open
   * overkapping zonder blijvende gevels — luifel, carport, kapschuur — met
   * c_p,net en c_f uit §7.3. Ontbreekt het veld (instellingen van vóór deze
   * keuze), dan is het een gebouw.
   */
  vorm: "gebouw" | "vrijstaandDak";
  /** Vrijstaand dak: lessenaarsdak (tabel 7.6) of zadeldak/kieldak (tabel 7.7). */
  vrijstaandDakvorm: OverkappingDakvorm;
  /**
   * Blokkering φ onder het vrijstaande dak, 0…1 (§7.3(2), figuur 7.15): de
   * verhouding tussen de oppervlakte van de obstakels eronder (opgeslagen hout,
   * een auto, goederen) en de oppervlakte onder het dak, beide loodrecht op de
   * wind. 0 = leeg, 1 = aan de lijzijde volledig dichtgezet.
   */
  blokkering_phi: number;
  /**
   * Hoogte h van het vrijstaande dak boven maaiveld in m (figuur 7.16/7.17),
   * tevens z_e (§7.3(8)). `null` = de hoogte van het model zelf, voor een model
   * waarin de kolommen tot op de grond getekend zijn.
   */
  vrijstaandHoogte_m: number | null;
  /**
   * Vrijstaand dak, wrijving (§7.3(7), §7.5): de oppervlakteruwheid van het
   * dak voor c_fr uit tabel 7.10, of "geen" (niet genereren). Ontbreekt het
   * veld (instellingen van vóór deze keuze), dan "geen".
   */
  wrijving?: "geen" | Oppervlakteruwheid;
  /**
   * Vrijstaand dak, geschakelde overkappingen (§7.3(9), tabel 7.8): het aantal
   * overkappingen in de rij (1 = los dak, geen reductie) en de positie van de
   * overkapping waar dit spant onder staat, geteld van één kant (1…aantal).
   */
  aantalOverkappingen?: number;
  positieOverkapping?: number;
  /**
   * Vrijstaand dak, wind op de kolommen: de doorsnedevorm voor c_f,0 (§7.7
   * scherphoekig of §7.6 rechthoekig), of "geen". b = breedte loodrecht op de
   * wind, d = diepte in de windrichting, beide in mm.
   */
  kolomDoorsnede?: "geen" | KolomDoorsnede;
  kolomBreedte_mm?: number;
  kolomDiepte_mm?: number;
}

export const STANDAARD_WIND_INSTELLINGEN: WindInstellingen = {
  windgebied: "II",
  terreincategorie: "II",
  stuwdrukBron: "berekend",
  qpHandmatig_kNm2: 1.0,
  richtingLinks: true,
  richtingRechts: true,
  richtingHaaks: false,
  cpiKeuze: "beide",
  cpiHandmatig: 0.2,
  hohSpant_m: 5,
  positieSpant: "tussenspant",
  belastingbreedteOverride_m: null,
  gebouwlengte_m: 30,
  afstandTotKopgevel_m: 15,
  cpeDakLoef: null,
  cpeDakLij: null,
  cpeDakHaaks: null,
  combinatiesGenereren: true,
  gevelhoogte_m: null,
  vorm: "gebouw",
  vrijstaandDakvorm: "lessenaar",
  blokkering_phi: 0,
  vrijstaandHoogte_m: null,
  wrijving: "geen",
  aantalOverkappingen: 1,
  positieOverkapping: 1,
  kolomDoorsnede: "geen",
  kolomBreedte_mm: 200,
  kolomDiepte_mm: 200,
};

// ── Uitvoer ──────────────────────────────────────────────────────────────

export type MeldingNiveau = "info" | "waarschuwing" | "fout";

export interface WindMelding {
  niveau: MeldingNiveau;
  tekst: string;
}

/** Eén gegenereerd belastinggeval; `sleutel` is stabiel over generaties. */
export interface GegenereerdGeval {
  sleutel: string;
  naam: string;
  richting: Windrichting;
  cpi: number;
}

/** Eén gegenereerde lijnlast, nog zonder id en met een case-SLEUTEL. */
export interface GegenereerdeLast {
  gevalSleutel: string;
  beamId: number;
  /** Lijnlast in kN per meter staaflengte, lokale z-richting. */
  q: number;
  startFrac?: number;
  endFrac?: number;
  /** Regel voor de controlelijst: welke zone, welke c_pe, welke druk. */
  toelichting: string;
  /**
   * Korte omschrijving voor de lastentabel van het rapport (Load.omschrijving).
   * Alleen bij een vrijstaand dak: daar noemt hij paragraaf, tabel, α, φ en de
   * gebruikte coëfficiënt. De gebouwgevallen dragen hem niet, zodat hun
   * uitvoer ongewijzigd blijft.
   */
  omschrijving?: string;
  /**
   * "axiaal" = de last werkt langs de staafas (Load.qDir "x", lokaal), zoals
   * de wrijving langs een dakvlak (§7.3(7)). Ontbreekt = loodrecht op de staaf
   * (lokaal z) — alle andere windlasten, zodat hun uitvoer ongewijzigd blijft.
   */
  richting?: "axiaal";
}

export interface GegenereerdeCombinatie {
  naam: string;
  type: "uls" | "sls";
  formule: string;
  /** Factoren voor BESTAANDE (niet door de generator gemaakte) gevallen. */
  factorenPerCaseId: [number, number][];
  /** Sleutel van het gegenereerde windgeval waar deze combinatie bij hoort. */
  windSleutel: string;
  windFactor: number;
  /**
   * Vrijstaand dak: de windgevallen die met `windSleutel` samen de wind uit
   * één richting vormen (wrijving en kolomwind, §7.3(7), §5.3(3)) en daarom
   * met dezelfde factor meedoen. Ontbreekt bij een gebouw en bij een dak
   * zonder horizontale gevallen, zodat die uitvoer ongewijzigd blijft. Zie
   * `windVarianten`.
   */
  windMeeSleutels?: string[];
}

export interface VlakRegel {
  beamId: number;
  rol: BeamLoadRole;
  zone: string;
  cpe: number;
  cpi: number;
  /** Netto druk w = q_p·(c_pe − c_pi) in kN/m². */
  w_kNm2: number;
  q_kNm: number;
  bron: string;
  /** Deellast: fracties langs de staaf vanaf de startknoop; leeg = hele staaf. */
  startFrac?: number;
  endFrac?: number;
  /**
   * Richting van de kracht (eenheidsvector, modelstelsel) voor de tekening,
   * wanneer die niet uit de normaal van het vlak volgt: wrijving langs het dak
   * en wind op een kolom. Ontbreekt = druk of zuiging op het vlak.
   */
  krachtRichting?: { x: number; z: number };
}

export interface WindSamenvatting {
  hoogte_m: number;
  spanwijdte_m: number;
  hOverD: number;
  belastingbreedte_m: number;
  stuwdruk: StuwdrukResultaat;
  /** Per belastinggeval de vlakken met hun vormfactoren. */
  perGeval: {
    sleutel: string; naam: string; regels: VlakRegel[];
    /**
     * Vrijstaand dak, c_f-geval: de resultante zoals figuur 7.16/7.17 hem
     * plaatst — voor de tekening. x/z in m (modelstelsel), F in kN, positief =
     * neerwaarts.
     */
    resultanten?: { x_m: number; z_m: number; F_kN: number }[];
  }[];
  /** Alleen bij een vrijstaand dak: de tabelopzoeking en wat daarvan is gebruikt. */
  vrijstaand?: VrijstaandDakSamenvatting;
}

export interface VrijstaandDakSamenvatting {
  dakvorm: OverkappingDakvorm;
  alpha_graden: number;
  phi: number;
  opzoeking: OverkappingOpzoeking;
  /**
   * c_p,net voor het opwaartse geval per zone: de waarde bij φ, maar nooit
   * minder ongunstig dan die bij φ = 0 — §7.3(4), zie de generator.
   */
  cpNetOpwaarts: Partial<Record<OverkappingZone, number>>;
  /** Alleen bij geschakelde tweezijdig hellende overkappingen: ψ_mc uit tabel 7.8. */
  geschakeld?: { aantal: number; positie: number } & GeschakeldeReductie;
}

/** Eén staaf van het spant zoals de schematekening hem nodig heeft, in m. */
export interface WindSchemaStaaf {
  beamId: number;
  rol: BeamLoadRole;
  x1: number; z1: number; x2: number; z2: number;
}

/**
 * Wat er van de constructie is afgeleid vóór er ook maar iets is gerekend:
 * de maten en de rollen die de tekening in het venster laat zien. Staat er
 * ook wanneer de generatie op een ontbrekende invoer strandt, zodat het
 * venster de constructie kan tonen terwijl het om die invoer vraagt.
 */
export interface WindGeometrie {
  /** Bouwhoogte in m — inclusief de gevelhoogte bij een kap zonder gevel. */
  h_m: number;
  /** Hoogte van het model zelf in m. */
  modelhoogte_m: number;
  /** Spanwijdte tussen de gevels (of de omhullende van het model) in m. */
  d_m: number;
  xLinks_m: number;
  xRechts_m: number;
  /** Er zijn staven met rol hellend dak. */
  heeftHellendDak: boolean;
  /** Er zijn gevelstaven in het model. */
  heeftGevels: boolean;
  /** Kap zonder gevel: geen gevelstaven én een gevelhoogte opgegeven. */
  kapZonderGevel: boolean;
  /** Grootste dakhelling in graden (0 bij een plat dak). */
  dakhelling_graden: number;
  staven: WindSchemaStaaf[];
  /** Alleen bij een vrijstaand dak (het veld ontbreekt bij een gebouw). */
  vrijstaand?: VrijstaandDakGeometrie;
}

export interface VrijstaandDakGeometrie {
  dakvorm: OverkappingDakvorm;
  /** Dakhelling in graden; negatief bij een kieldak (tabel 7.7). */
  alpha_graden: number;
  phi: number;
  /** Lengte b van de overkapping haaks op het spant, in m. */
  b_m: number;
  /** Afstand van dit spant tot het dichtstbijzijnde kopse eind, in m. */
  y_m: number;
  /** Het spant ligt binnen b/10 van het kopse eind: zone B over de hele breedte. */
  inZoneB: boolean;
  /** Nok (zadeldak) of kiel (kieldak) in m; null bij een lessenaarsdak. */
  xNok_m: number | null;
  /** De zones langs het spant, in m in het modelstelsel, van links naar rechts. */
  zones: { zone: OverkappingZone; van_m: number; tot_m: number }[];
  /** Id's van de staven die als dakvlak belast zijn. */
  dakstaven: number[];
}

export interface WindGeneratieResultaat {
  /** false ⇒ er is NIETS gegenereerd; zie de meldingen met niveau "fout". */
  ok: boolean;
  meldingen: WindMelding[];
  gevallen: GegenereerdGeval[];
  lasten: GegenereerdeLast[];
  combinaties: GegenereerdeCombinatie[];
  samenvatting: WindSamenvatting | null;
  /** De constructie zoals de generator haar las; null als er geen is. */
  geometrie: WindGeometrie | null;
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────

const nl = (v: number, d: number) => v.toFixed(d).replace(".", ",");

const RICHTING_LABEL: Record<Windrichting, string> = {
  links: "wind van links",
  rechts: "wind van rechts",
  haaks: "wind haaks op het spant",
  alle: "alle windrichtingen",
};

/** Geometrie van één staaf in modelcoördinaten (mm), plus lokale assen. */
interface StaafGeo {
  beam: Beam;
  rol: BeamLoadRole;
  x1: number; z1: number; x2: number; z2: number;
  L_mm: number;
  /** Eenheidsvector van de staafas (from → to). */
  ax: number; az: number;
  /** Lokale +z (transversaal): 90° tegen de klok in op de as. */
  tx: number; tz: number;
  /** Hellingshoek t.o.v. horizontaal in graden (0..90). */
  helling: number;
}

function staafGeo(beam: Beam, nodes: Node[]): StaafGeo | null {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-9) return null;
  const ax = dx / L, az = dz / L;
  return {
    beam, rol: rolVanStaaf(beam, nodes),
    x1: a.x, z1: a.z, x2: b.x, z2: b.z, L_mm: L,
    ax, az, tx: -az, tz: ax,
    helling: Math.atan2(Math.abs(dz), Math.abs(dx)) * 180 / Math.PI,
  };
}

/**
 * Zet een netto druk w (kN/m², positief = drukkend tegen het vlak) om in een
 * lijnlast in de LOKALE z-richting van de staaf, in kN/m staaflengte.
 * `nx,nz` is de buitennormaal van het vlak.
 */
function drukNaarLokaleLijnlast(
  w_kNm2: number, breedte_m: number, geo: StaafGeo, nx: number, nz: number,
): number {
  const nt = nx * geo.tx + nz * geo.tz;
  return -w_kNm2 * breedte_m * nt;
}

/** Buitennormaal van een dakvlak: de transversale as met een positieve z. */
function dakNormaal(geo: StaafGeo): { nx: number; nz: number } {
  return geo.tz >= 0 ? { nx: geo.tx, nz: geo.tz } : { nx: -geo.tx, nz: -geo.tz };
}

/** Zonegrenzen van een plat dak langs de windrichting (§7.2.3, fig. 7.6). */
interface DakZoneBand { van_m: number; tot_m: number; zone: "F" | "G" | "H" | "I" }

function platDakBanden(e_m: number, d_m: number, randzoneF: boolean): DakZoneBand[] {
  const grens1 = Math.min(e_m / 10, d_m);
  const grens2 = Math.min(e_m / 2, d_m);
  const banden: DakZoneBand[] = [];
  if (grens1 > 0) banden.push({ van_m: 0, tot_m: grens1, zone: randzoneF ? "F" : "G" });
  if (grens2 > grens1) banden.push({ van_m: grens1, tot_m: grens2, zone: "H" });
  if (d_m > grens2) banden.push({ van_m: grens2, tot_m: d_m, zone: "I" });
  // De buitenste banden lopen door tot buiten het dak, zodat een dakstaaf die
  // iets vóór de loefgevel begint of achter de lijgevel eindigt (afronding,
  // dakrandprofiel) toch volledig belast wordt in plaats van deels leeg.
  if (banden.length > 0) {
    banden[0].van_m = Number.NEGATIVE_INFINITY;
    banden[banden.length - 1].tot_m = Number.POSITIVE_INFINITY;
  }
  return banden;
}

// ── De generator ─────────────────────────────────────────────────────────

export interface WindModelInvoer {
  nodes: Node[];
  beams: Beam[];
  /** Bestaande belastinggevallen — nodig voor de combinatiefactoren. */
  loadCases: LoadCase[];
  /**
   * Gevolgklasse van het project; bepaalt γ_G en γ_Q volgens NB tabel NB.4
   * (CC2) en NB.5 (CC1, CC3). Ontbreekt → CC2.
   */
  gevolgklasse?: Gevolgklasse;
  /**
   * Nationale bijlage van het project (normnaad); bepaalt de tabellen waar γ
   * en ψ uit komen. Ontbreekt → de enige gevulde bijlage.
   */
  bijlage?: NationaleBijlageCode;
}

/**
 * De factoren van de gegenereerde combinaties komen uit DEZELFDE tabellen als
 * de standaardcombinaties (`components/fem/solver/normcombinaties.ts`):
 *   γ  — NEN-EN 1990:2002/NB:2019 tabel NB.4 (CC2) of NB.5 (CC1/CC3),
 *        met γ_G,inf = 0,9 uit de kolom "Gunstig" van diezelfde tabellen;
 *   ψ  — tabel NB.2–A1.1: wind 0 / 0,2 / 0, sneeuw 0 / 0,2 / 0, en voor
 *        veranderlijke belasting de waarden van de gebruikscategorie van het
 *        geval (zonder categorie: A, 0,4 / 0,5 / 0,3).
 * Tot september 2026 stonden hier de door EN 1990 AANBEVOLEN waarden uit
 * tabel A1.1 (ψ₀ = 0,6 / 0,7 / 0,5) met vaste CC2-factoren, terwijl het rapport
 * de Nederlandse bijlage noemt.
 */

/** Naamvoorvoegsel waaraan gegenereerde combinaties herkenbaar zijn. */
export const WIND_COMBI_PREFIX = "Wind-gen · ";

export function genereerWindbelasting(
  model: WindModelInvoer,
  inst: WindInstellingen,
): WindGeneratieResultaat {
  const meldingen: WindMelding[] = [];
  let geometrie: WindGeometrie | null = null;
  const fout = (tekst: string): WindGeneratieResultaat => {
    meldingen.push({ niveau: "fout", tekst });
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null, geometrie };
  };

  // ── Geometrie ──────────────────────────────────────────────────────────
  if (model.nodes.length < 2 || model.beams.length === 0) {
    return fout("Er is nog geen constructie om wind op te zetten.");
  }
  const geos = model.beams
    .map((b) => staafGeo(b, model.nodes))
    .filter((g): g is StaafGeo => g !== null)
    .sort((a, b) => a.beam.id - b.beam.id); // vaste volgorde ⇒ deterministisch

  // Vrijstaand dak (§7.3): een eigen route — geen gevels, geen c_pi, andere
  // tabellen. Alles hieronder is de gebouwroute en blijft daarvoor ongewijzigd.
  if (inst.vorm === "vrijstaandDak") return genereerVrijstaandDak(model, inst, geos, meldingen);

  const zs = model.nodes.map((n) => n.z);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const modelhoogte_m = (maxZ - minZ) / 1000;
  if (modelhoogte_m <= 0) return fout("De constructie heeft geen hoogte — wind is niet te bepalen.");

  // Spanwijdte d: afstand tussen de GEVELS, niet de omhullende van het model
  // (een overstek steekt buiten de gevel uit en mag d niet vergroten).
  const gevelL = geos.filter((g) => g.rol === "gevelLinks");
  const gevelR = geos.filter((g) => g.rol === "gevelRechts");
  const xsAlles = model.nodes.map((n) => n.x);
  const xLinks = gevelL.length > 0
    ? Math.min(...gevelL.flatMap((g) => [g.x1, g.x2]))
    : Math.min(...xsAlles);
  const xRechts = gevelR.length > 0
    ? Math.max(...gevelR.flatMap((g) => [g.x1, g.x2]))
    : Math.max(...xsAlles);
  const d_m = (xRechts - xLinks) / 1000;
  if (d_m <= 0) return fout("De constructie heeft geen breedte — wind is niet te bepalen.");

  // Kap zonder gevel: de gevels staan niet in het model maar bestaan wel
  // (een kapspant op gemetselde wanden). De bouwhoogte — en daarmee de
  // referentiehoogte van de stuwdruk en h/d van de wandzones — is dan de
  // gevelhoogte plus de hoogte van de kap, niet de hoogte van de kap alleen.
  const heeftGevels = gevelL.length > 0 || gevelR.length > 0;
  const kapZonderGevel = !heeftGevels && inst.gevelhoogte_m !== null && inst.gevelhoogte_m > 0;
  const h_m = modelhoogte_m + (kapZonderGevel ? inst.gevelhoogte_m! : 0);
  const heeftHellendDak = geos.some((g) => g.rol === "dakHellend");
  geometrie = {
    h_m, modelhoogte_m, d_m,
    xLinks_m: xLinks / 1000, xRechts_m: xRechts / 1000,
    heeftHellendDak, heeftGevels, kapZonderGevel,
    dakhelling_graden: Math.max(0, ...geos.filter((g) => g.rol === "dakHellend").map((g) => g.helling)),
    staven: geos.map((g) => ({
      beamId: g.beam.id, rol: g.rol,
      x1: g.x1 / 1000, z1: g.z1 / 1000, x2: g.x2 / 1000, z2: g.z2 / 1000,
    })),
  };

  if (kapZonderGevel) {
    meldingen.push({
      niveau: "info",
      tekst: `Kap zonder gevel: de gevels staan niet in het model. Bouwhoogte h = ` +
        `${nl(inst.gevelhoogte_m!, 2)} m (gevel) + ${nl(modelhoogte_m, 2)} m (kap) = ` +
        `${nl(h_m, 2)} m. De windlast op de gevels zelf is niet gegenereerd; die valt ` +
        "op de wanden en niet op dit spant.",
    });
  } else if (!heeftGevels) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "Geen enkele staaf heeft het belastingtype linker- of rechtergevel. " +
        "Staan de gevels wel in het model, controleer dan de belastingtypen in de " +
        "staafeigenschappen. Is dit een kap op wanden die niet getekend zijn, vul " +
        "dan de gevelhoogte in: de stuwdruk hoort bij de werkelijke bouwhoogte.",
    });
  }

  // ── Instellingen valideren ─────────────────────────────────────────────
  if (!(inst.hohSpant_m > 0)) return fout("Vul een h.o.h.-afstand van de spanten in (> 0 m).");
  if (!(inst.gebouwlengte_m > 0)) return fout("Vul de gebouwlengte haaks op het spant in (> 0 m).");
  if (!inst.richtingLinks && !inst.richtingRechts && !inst.richtingHaaks) {
    return fout("Kies minstens één windrichting.");
  }
  const breedte_m = inst.belastingbreedteOverride_m !== null && inst.belastingbreedteOverride_m > 0
    ? inst.belastingbreedteOverride_m
    : (inst.positieSpant === "kopgevelspant" ? inst.hohSpant_m / 2 : inst.hohSpant_m);

  if (heeftHellendDak) {
    // Vormfactoren van hellende daken (tabel 7.4a/7.4b) worden BEWUST niet
    // automatisch ingevuld — zie de kop van windEurocode.ts.
    if (inst.cpeDakLoef === null || inst.cpeDakLij === null) {
      return fout(
        "Er zijn staven met belastingtype “hellend dak”, maar de vormfactoren voor " +
        "het loef- en lijdakvlak zijn niet ingevuld. Deze generator vult tabel 7.4a " +
        "van NEN-EN 1991-1-4 niet zelf in: de waarden hangen af van de dakhelling " +
        "en de windrichting. Lees c_pe,10 op in tabel 7.4a en vul beide velden in.",
      );
    }
    if (inst.richtingHaaks && inst.cpeDakHaaks === null) {
      return fout(
        "Wind haaks op het spant met een hellend dak vraagt de vormfactor uit " +
        "NEN-EN 1991-1-4 tabel 7.4b (θ = 90°). Vul die in, of zet de windrichting " +
        "“haaks” uit.",
      );
    }
  }

  // ── Stuwdruk ───────────────────────────────────────────────────────────
  const ze_m = h_m; // referentiehoogte, zie melding hieronder
  const stuwdruk = inst.stuwdrukBron === "handmatig"
    ? handmatigeStuwdruk(inst.qpHandmatig_kNm2, ze_m)
    : berekenStuwdruk(inst.windgebied, inst.terreincategorie, ze_m);
  if (inst.stuwdrukBron === "handmatig" && !(inst.qpHandmatig_kNm2 > 0)) {
    return fout("Vul een stuwdruk groter dan 0 kN/m² in, of kies “berekenen”.");
  }
  meldingen.push(stuwdrukMelding(stuwdruk));
  meldingen.push({
    niveau: "info",
    tekst: `Referentiehoogte z_e = ${nl(ze_m, 2)} m (bouwhoogte) voor ALLE vlakken. ` +
      "Volgens NEN-EN 1991-1-4 §7.2.2 (figuur 7.4) mag dat wanneer h ≤ b; bij een " +
      "hoger gebouw is één strook op z_e = h de veilige kant, want de stuwdruk is " +
      "daar het grootst.",
  });
  if (ze_m > ZMAX_M) {
    meldingen.push({
      niveau: "fout",
      tekst: `De bouwhoogte (${nl(ze_m, 1)} m) ligt boven z_max = ${ZMAX_M} m; ` +
        "de snelheidsprofielformules van §4.3.2 gelden daar niet meer.",
    });
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null, geometrie };
  }
  if (h_m >= CSCD_GRENSHOOGTE_M) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `De bouwhoogte is ${nl(h_m, 1)} m. De generator rekent met c_s·c_d = 1,0; ` +
        `dat mag zonder meer alleen onder ${CSCD_GRENSHOOGTE_M} m (${CSCD_BRON}). ` +
        "Bepaal c_s·c_d volgens §6.3 en verhoog de lasten zo nodig zelf.",
    });
  }
  if (h_m > inst.gebouwlengte_m) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "De bouwhoogte is groter dan de gebouwlengte (h > b). NEN-EN 1991-1-4 " +
        "§7.2.2 verdeelt de loefgevel dan in stroken met een lagere stuwdruk " +
        "onderin; de generator houdt conservatief één strook op z_e = h aan.",
    });
  }

  const cpeW = cpeWand(h_m / d_m);
  const e_inVlak = berekenE(inst.gebouwlengte_m, h_m); // wind in het vlak van het spant
  const e_haaks = berekenE(d_m, h_m);                  // wind haaks op het spant

  // ── Nokpositie (voor loef-/lijdakvlak bij hellend dak) ─────────────────
  const dakGeos = geos.filter((g) => g.rol === "dakPlat" || g.rol === "dakHellend");
  let xNok = (xLinks + xRechts) / 2;
  if (dakGeos.length > 0) {
    const hoogsteZ = Math.max(...dakGeos.flatMap((g) => [g.z1, g.z2]));
    const toppen = dakGeos.flatMap((g) => [
      { x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 },
    ]).filter((p) => Math.abs(p.z - hoogsteZ) < 1);
    if (toppen.length > 0) xNok = toppen.reduce((s, p) => s + p.x, 0) / toppen.length;
  }

  // ── Belastinggevallen ──────────────────────────────────────────────────
  const cpiWaarden: number[] =
    inst.cpiKeuze === "beide" ? [...CPI_ONBEKEND]
      : inst.cpiKeuze === "plus" ? [0.2]
        : inst.cpiKeuze === "min" ? [-0.3]
          : [inst.cpiHandmatig];
  if (inst.cpiKeuze === "beide") {
    meldingen.push({ niveau: "info", tekst: `Inwendige druk: beide waarden ±. ${CPI_BRON}` });
  } else if (inst.cpiKeuze === "handmatig") {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `Inwendige druk handmatig op c_pi = ${nl(inst.cpiHandmatig, 2)}. Dat is ` +
        "alleen juist wanneer de openingsverhouding μ van het gebouw bekend is " +
        "(§7.2.9); anders is “beide (+0,2 en −0,3)” de norm-conforme keuze.",
    });
  }

  const richtingen: Windrichting[] = [
    ...(inst.richtingLinks ? ["links" as const] : []),
    ...(inst.richtingRechts ? ["rechts" as const] : []),
    ...(inst.richtingHaaks ? ["haaks" as const] : []),
  ];
  if (inst.richtingHaaks) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "Wind haaks op het spant belast het spant uitsluitend met ZUIGING op " +
        "beide gevels (zones A/B/C, tabel 7.1) en op het dak. De zone-indeling " +
        "loopt daarbij in de lengterichting van het gebouw; de generator houdt " +
        "per vlak de ongunstigste zone aan die het spant raakt en verdeelt niet " +
        "verder over de spanwijdte. Dat is de veilige kant, maar grover dan de norm.",
    });
  }

  const gevallen: GegenereerdGeval[] = [];
  const lasten: GegenereerdeLast[] = [];
  const perGeval: WindSamenvatting["perGeval"] = [];
  let zoneIGebruikt = false;
  let kleinOppervlak = false;

  for (const richting of richtingen) {
    for (const cpi of cpiWaarden) {
      const sleutel = `wind:${richting}:cpi${cpi >= 0 ? "+" : ""}${cpi.toFixed(2)}`;
      const naam = `Wind ${RICHTING_LABEL[richting].replace("wind ", "")} (c_pi = ${nl(cpi, 2)})`;
      gevallen.push({ sleutel, naam, richting, cpi });
      const regels: VlakRegel[] = [];

      for (const g of geos) {
        const opp_m2 = breedte_m * (g.L_mm / 1000);
        if (opp_m2 < CPE10_MIN_OPPERVLAK_M2 && g.rol !== "vloer" && g.rol !== "binnen") {
          kleinOppervlak = true;
        }
        const push = (
          zone: string, cpe: number, bron: string,
          nx: number, nz: number, cpiHier: number,
          startFrac?: number, endFrac?: number,
        ) => {
          const w = stuwdruk.qp_kNm2 * (cpe - cpiHier);
          const q = drukNaarLokaleLijnlast(w, breedte_m, g, nx, nz);
          const deel = startFrac !== undefined
            ? ` (${nl(startFrac, 2)}–${nl(endFrac ?? 1, 2)} van de staaf)` : "";
          // De regel gaat ALTIJD de samenvatting in — ook een netto nul, want
          // dat is voor de controlerende constructeur informatie. De LAST
          // zelf slaan we bij nul over: een lijnlast van 0 kN/m in het model
          // is ruis.
          regels.push({
            beamId: g.beam.id, rol: g.rol, zone: zone + deel, cpe, cpi: cpiHier,
            w_kNm2: w, q_kNm: q, bron,
            ...(startFrac !== undefined ? { startFrac, endFrac } : {}),
          });
          if (Math.abs(q) < 1e-12) return;
          lasten.push({
            gevalSleutel: sleutel, beamId: g.beam.id, q,
            ...(startFrac !== undefined ? { startFrac, endFrac } : {}),
            toelichting:
              `Staaf ${g.beam.id}, zone ${zone}${deel}: c_pe = ${nl(cpe, 2)}, ` +
              `c_pi = ${nl(cpiHier, 2)}, w = ${nl(stuwdruk.qp_kNm2, 3)}·(${nl(cpe, 2)} − ` +
              `${nl(cpiHier, 2)}) = ${nl(w, 3)} kN/m², q = w·${nl(breedte_m, 2)} m = ` +
              `${nl(Math.abs(q), 3)} kN/m`,
          });
        };

        // ── Gevels ────────────────────────────────────────────────────────
        if (g.rol === "gevelLinks" || g.rol === "gevelRechts") {
          const nx = g.rol === "gevelLinks" ? -1 : 1;
          let zone: string, cpe: number;
          if (richting === "haaks") {
            // Zijgevel: zone A/B/C op basis van de afstand tot de (dichtstbij-
            // zijnde, dus ongunstigste) kopgevel. Tabel 7.1.
            const y = inst.afstandTotKopgevel_m;
            if (y < e_haaks / 5) { zone = "A"; cpe = cpeW.A; }
            else if (y < e_haaks) { zone = "B"; cpe = cpeW.B; }
            else { zone = "C"; cpe = cpeW.C; }
          } else {
            const loef = (richting === "links" && g.rol === "gevelLinks")
              || (richting === "rechts" && g.rol === "gevelRechts");
            zone = loef ? "D" : "E";
            cpe = loef ? cpeW.D : cpeW.E;
          }
          push(zone, cpe, TABEL_71_BRON, nx, 0, cpi);
          continue;
        }

        // ── Daken ─────────────────────────────────────────────────────────
        if (g.rol === "dakPlat" || g.rol === "dakHellend") {
          const n = dakNormaal(g);
          if (richting === "haaks") {
            // Eén (ongunstigste) zone over de volle spanwijdte — zie melding.
            if (g.rol === "dakHellend") {
              push("dak θ=90°", inst.cpeDakHaaks!, "NEN-EN 1991-1-4 tabel 7.4b (door de gebruiker ingevuld)", n.nx, n.nz, cpi);
            } else {
              const y = inst.afstandTotKopgevel_m;
              const zone = y < e_haaks / 10 ? "F" : y < e_haaks / 2 ? "H" : "I";
              if (zone === "I") zoneIGebruikt = true;
              push(zone, CPE_PLAT_DAK[zone], CPE_PLAT_DAK_BRON, n.nx, n.nz, cpi);
            }
            continue;
          }
          if (g.rol === "dakHellend") {
            const midX = (g.x1 + g.x2) / 2;
            const linkervlak = midX < xNok;
            const loef = (richting === "links" && linkervlak) || (richting === "rechts" && !linkervlak);
            const cpe = loef ? inst.cpeDakLoef! : inst.cpeDakLij!;
            push(loef ? "loefdakvlak" : "lijdakvlak", cpe,
              "NEN-EN 1991-1-4 tabel 7.4a (door de gebruiker ingevuld)", n.nx, n.nz, cpi);
            continue;
          }
          // Plat dak: zonebanden langs de windrichting, als deellasten.
          const randzoneF = inst.positieSpant === "kopgevelspant"
            || inst.afstandTotKopgevel_m <= e_inVlak / 4;
          const banden = platDakBanden(e_inVlak, d_m, randzoneF);
          // x' = afstand tot de loefrand, in m.
          const xAccent = (xMm: number) => richting === "links"
            ? (xMm - xLinks) / 1000
            : (xRechts - xMm) / 1000;
          const p1 = xAccent(g.x1), p2 = xAccent(g.x2);
          const lo = Math.min(p1, p2), hi = Math.max(p1, p2);
          if (hi - lo < 1e-9) {
            // Verticale of degenerate dakstaaf: één zone op de middenpositie.
            const zone = banden.find((b) => lo >= b.van_m && lo <= b.tot_m)?.zone ?? "H";
            if (zone === "I") zoneIGebruikt = true;
            push(zone, CPE_PLAT_DAK[zone], CPE_PLAT_DAK_BRON, n.nx, n.nz, cpi);
            continue;
          }
          for (const band of banden) {
            const van = Math.max(lo, band.van_m), tot = Math.min(hi, band.tot_m);
            if (tot - van <= 1e-9) continue;
            // Fracties langs de staaf, gemeten vanaf de startknoop (from).
            const fracVan = (p1 <= p2) ? (van - p1) / (p2 - p1) : (p1 - tot) / (p1 - p2);
            const fracTot = (p1 <= p2) ? (tot - p1) / (p2 - p1) : (p1 - van) / (p1 - p2);
            const a = Math.max(0, Math.min(1, fracVan));
            const b = Math.max(0, Math.min(1, fracTot));
            if (b - a <= 1e-9) continue;
            const vol = a <= 1e-9 && b >= 1 - 1e-9;
            if (band.zone === "I") zoneIGebruikt = true;
            push(band.zone, CPE_PLAT_DAK[band.zone], CPE_PLAT_DAK_BRON, n.nx, n.nz, cpi,
              vol ? undefined : a, vol ? undefined : b);
          }
          continue;
        }

        // ── Overstek (§7.2.6) ─────────────────────────────────────────────
        if (g.rol === "overstek") {
          const n = dakNormaal(g);
          const midX = (g.x1 + g.x2) / 2;
          // Bovenzijde: de dakzone op deze positie. Onderzijde: de druk op de
          // gevel eronder. Beide zijn UITWENDIG, dus c_pi speelt niet mee.
          let cpeBoven: number, zoneBoven: string, bronBoven: string;
          if (g.helling > 5 && heeftHellendDak) {
            const linkervlak = midX < xNok;
            const loef = (richting === "links" && linkervlak) || (richting === "rechts" && !linkervlak);
            cpeBoven = loef ? inst.cpeDakLoef! : inst.cpeDakLij!;
            zoneBoven = loef ? "loefdakvlak" : "lijdakvlak";
            bronBoven = "NEN-EN 1991-1-4 tabel 7.4a (door de gebruiker ingevuld)";
          } else {
            const xAcc = richting === "rechts" ? (xRechts - midX) / 1000 : (midX - xLinks) / 1000;
            const randzoneF = inst.positieSpant === "kopgevelspant"
              || inst.afstandTotKopgevel_m <= e_inVlak / 4;
            const banden = platDakBanden(e_inVlak, d_m, randzoneF);
            const z = banden.find((b) => xAcc >= b.van_m && xAcc <= b.tot_m)?.zone
              ?? (xAcc < 0 ? (randzoneF ? "F" : "G") : "I");
            zoneBoven = z; cpeBoven = CPE_PLAT_DAK[z]; bronBoven = CPE_PLAT_DAK_BRON;
            if (z === "I") zoneIGebruikt = true;
          }
          const aanLinkerzijde = midX < (xLinks + xRechts) / 2;
          let cpeOnder: number, zoneOnder: string;
          if (richting === "haaks") {
            const y = inst.afstandTotKopgevel_m;
            if (y < e_haaks / 5) { zoneOnder = "A"; cpeOnder = cpeW.A; }
            else if (y < e_haaks) { zoneOnder = "B"; cpeOnder = cpeW.B; }
            else { zoneOnder = "C"; cpeOnder = cpeW.C; }
          } else {
            const loef = (richting === "links" && aanLinkerzijde)
              || (richting === "rechts" && !aanLinkerzijde);
            zoneOnder = loef ? "D" : "E";
            cpeOnder = loef ? cpeW.D : cpeW.E;
          }
          // Netto vormfactor = boven − onder; c_pi valt weg (§7.2.6).
          push(`overstek ${zoneBoven} boven / ${zoneOnder} onder`, cpeBoven - cpeOnder,
            `NEN-EN 1991-1-4 §7.2.6 (onderzijde = wanddruk) met ${bronBoven}`,
            n.nx, n.nz, 0);
          continue;
        }
        // vloer / binnen: geen windvlak.
      }

      perGeval.push({ sleutel, naam, regels });
    }
  }

  if (zoneIGebruikt) meldingen.push({ niveau: "waarschuwing", tekst: MELDING_ZONE_I });
  if (kleinOppervlak) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `Minstens één belast vlak is kleiner dan ${CPE10_MIN_OPPERVLAK_M2} m² ` +
        `(belastingbreedte × staaflengte). ${CPE10_BRON} schrijft dan c_pe,1 of een ` +
        "logaritmische overgang voor; de generator gebruikt overal c_pe,10 en kan " +
        "voor die kleine vlakken dus te laag zitten.",
    });
  }
  if (lasten.length === 0) {
    return fout(
      "Er is geen enkele staaf met een belastingtype dat wind draagt (gevel, dak of " +
      "overstek). Stel de belastingtypen in bij de staafeigenschappen.",
    );
  }

  // ── Combinaties ────────────────────────────────────────────────────────
  const combinaties = combinatiesMetMeldingen(model, inst, gevallen, meldingen);

  return {
    ok: true,
    meldingen,
    gevallen,
    lasten,
    combinaties,
    samenvatting: {
      hoogte_m: h_m, spanwijdte_m: d_m, hOverD: h_m / d_m,
      belastingbreedte_m: breedte_m, stuwdruk, perGeval,
    },
    geometrie,
  };
}

// ── Vrijstaand dak — NEN-EN 1991-1-4 §7.3 ────────────────────────────────

/** Sleutelvoorvoegsel van de gevallen van een vrijstaand dak. */
export const VRIJSTAAND_SLEUTEL_PREFIX = "luifel:";

/** Sleutel van het horizontale geval (wrijving en kolomwind) van één richting. */
const HORIZONTAAL_SLEUTEL = /^luifel:horizontaal:(links|rechts)$/;

/**
 * Hoe de horizontale gevallen in de combinaties komen: melding van de
 * generator én regel in de uitgangspunten van rapport en PDF.
 */
export const HORIZONTAAL_COMBINATIE_UITLEG =
  "Combinaties: wrijving en wind op de kolommen horen bij dezelfde wind als de druk op het dak " +
  "(§7.3(7); §5.3(3): de krachten uit één windrichting samen). Elke gegenereerde combinatie " +
  "met een dakgeval (c_p,net of c_f) neemt daarom het horizontale geval van dezelfde " +
  "windrichting met dezelfde factor mee: bij c_f van een lessenaarsdak, dat een eigen " +
  "richting heeft (figuur 7.16), alleen dat van die richting; bij een dakgeval voor alle " +
  "richtingen (c_p,net, c_f van een zadel- of kieldak) een combinatie met dat van links en " +
  "een met dat van rechts. Het horizontale geval leidt nooit alleen en komt nooit samen met " +
  "dat van de andere richting in een combinatie.";

/**
 * Kop van de uitgangspunten voor het rapport: wat er bij een vrijstaand dak
 * is aangehouden. De getallen per geval staan in de omschrijving van de
 * lasten; deze tekst zegt waar ze vandaan komen.
 */
export const VRIJSTAAND_UITGANGSPUNT =
  "Wind op een vrijstaand dak (open overkapping) volgens NEN-EN 1991-1-4 §7.3: " +
  "referentiehoogte z_e = h (§7.3(8)); nettodrukcoëfficiënten c_p,net en globale " +
  "krachtcoëfficiënten c_f uit tabel 7.6 (lessenaarsdak) of 7.7 (zadel- of kieldak), " +
  "lineair geïnterpoleerd tussen φ = 0 en φ = 1 (§7.3(3)); c_f aangrijpend zoals " +
  "figuur 7.16/7.17 (§7.3(6)). Positief = netto neerwaarts.";

/**
 * De uitgangspunten van een vrijstaand dak voor het rapport, afgeleid uit wat
 * er IN HET MODEL staat: de gegenereerde gevallen en de omschrijving van hun
 * lasten (paragraaf, tabel, α, φ en coëfficiënt). Leeg als er geen vrijstaand
 * dak is gegenereerd. Eén regel per geval, dubbele omschrijvingen één keer —
 * dezelfde regelvorm als de andere tekstblokken van de uitgangspunten.
 */
export function vrijstaandDakUitgangspunten(
  loadCases: readonly { id: number; name: string; gegenereerd?: { bron: string; sleutel: string } }[],
  loads: readonly { caseId: number; gegenereerdDoor?: string; omschrijving?: string }[],
): string {
  const gevallen = loadCases.filter((c) => c.gegenereerd?.bron === "wind"
    && c.gegenereerd.sleutel.startsWith(VRIJSTAAND_SLEUTEL_PREFIX));
  if (gevallen.length === 0) return "";
  const regels = [VRIJSTAAND_UITGANGSPUNT];
  for (const c of gevallen) {
    const teksten = [...new Set(loads
      .filter((l) => l.caseId === c.id && l.gegenereerdDoor === "wind" && (l.omschrijving ?? "").trim() !== "")
      .map((l) => l.omschrijving!.trim()))];
    regels.push(`${c.name}: ${teksten.length > 0 ? teksten.join("; ") : "geen lasten"}`);
  }
  // Issue #26: zonder deze regel leest het rapport de wrijving en de
  // kolomwind als een los geval, terwijl de combinaties ze samen met de
  // dakgevallen van dezelfde richting nemen.
  if (gevallen.some((c) => HORIZONTAAL_SLEUTEL.test(c.gegenereerd!.sleutel))) {
    regels.push(HORIZONTAAL_COMBINATIE_UITLEG);
  }
  return regels.join("\n");
}

/**
 * De gevallen van een vrijstaand dak (open overkapping, §7.3).
 *
 * WELKE GEVALLEN
 *  1. c_p,net neerwaarts en c_p,net opwaarts, per zone (tabel 7.6/7.7, zones
 *     A/B/C en bij tabel 7.7 D). §7.3(5): c_p,net is "het maximale lokale
 *     drukverschil voor alle windrichtingen" en hoort bij dakbedekking en
 *     bevestigingen. Voor het spant is het een omhullende over de zones.
 *  2. c_f neerwaarts en c_f opwaarts (§7.3(5): de resulterende kracht), zoals
 *     §7.3(6) voorschrijft:
 *      • lessenaarsdak — het aangrijpingspunt op d/4 van de loefrand
 *        (figuur 7.16), dus per windrichting (van links, van rechts) een
 *        eigen geval. Beide richtingen worden altijd gemaakt: tabel 7.6 geldt
 *        voor alle richtingen, en één weglaten zou het excentrische geval van
 *        de andere kant stil laten vallen.
 *      • zadel- of kieldak — de kracht in het midden van elk dakvlak
 *        (figuur 7.17), en "aanvullend" één dakvlak belast met het andere
 *        onbelast: drie gevallen per teken.
 *
 * HOE DE RESULTANTE OP DE STAAF KOMT (een modelkeuze, geen normwaarde)
 *  F = q_p · c_f · A_ref met A_ref het dakoppervlak (belastingbreedte ×
 *  staaflengte). Op één staaf moet die kracht als lijnlast. Bij het
 *  lessenaarsdak geeft een gelijkmatige last 2·q_p·c_f over de loefhelft
 *  (0…d/2) precies dezelfde kracht F met het zwaartepunt op d/4 — resultante
 *  én aangrijpingspunt van figuur 7.16 kloppen dus exact. Bij het zadeldak is
 *  een gelijkmatige last q_p·c_f per dakvlak al in het midden van dat vlak.
 *  De verdeling binnen het dakvlak zegt de norm niet; lokale pieken dekken de
 *  c_p,net-gevallen.
 *
 *  3. Geschakelde overkappingen (§7.3(9), tabel 7.8) — op verzoek: ψ_mc op
 *     c_p,net en c_f van een tweezijdig hellende overkapping in een rij.
 *  4. Horizontaal, van links en van rechts — op verzoek: de wrijving langs het
 *     dak (§7.3(7), §7.5, tabel 7.10) en de wind op de kolommen (§7.6/§7.7),
 *     samen in één geval per richting omdat ze bij dezelfde wind tegelijk
 *     werken. De combinaties nemen dat geval samen met de dakgevallen van
 *     dezelfde richting (`windVarianten`).
 *
 * WAT NIET
 *  Geen c_pi (een netto coëfficiënt omvat boven- en onderkant, §7.3(3)); geen
 *  dubbele huid (§7.3(6)); geen cirkelvormige kolommen (§7.9); geen
 *  componenten haaks op het spant (die vallen uit het vlak van het 2D-model).
 *  Elk staat in een melding.
 */
function genereerVrijstaandDak(
  model: WindModelInvoer,
  inst: WindInstellingen,
  geos: StaafGeo[],
  meldingen: WindMelding[],
): WindGeneratieResultaat {
  let geometrie: WindGeometrie | null = null;
  const fout = (tekst: string): WindGeneratieResultaat => {
    meldingen.push({ niveau: "fout", tekst });
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null, geometrie };
  };
  const graden = (a: number) => `${nl(a, 1).replace("-", "−")}°`;
  const teken = (v: number, d: number) => (v < 0 ? "−" : "+") + nl(Math.abs(v), d);

  // ── Dakstaven ─────────────────────────────────────────────────────────
  // Een expliciet belastingtype wint. Zonder expliciet type is een staaf dak
  // als hij niet (bijna) verticaal is en bovenaan ligt: geen andere niet-
  // verticale staaf loopt op zijn middenpositie hoger. Het afgeleide type van
  // het gebouw ("dak = raakt de nokhoogte") werkt hier niet: bij een in stukken
  // getekend lessenaarsdak raakt alleen het hoogste stuk de nokhoogte, en een
  // schoor onder het dak moet juist géén wind krijgen.
  const DAKROLLEN: BeamLoadRole[] = ["dakPlat", "dakHellend", "overstek"];
  const nietVerticaal = geos.filter((g) => g.helling < 75);
  const isDak = (g: StaafGeo): boolean => {
    if (g.beam.loadRole !== undefined) return DAKROLLEN.includes(g.beam.loadRole);
    if (g.helling >= 75) return false;
    const xm = (g.x1 + g.x2) / 2, zm = (g.z1 + g.z2) / 2;
    return !nietVerticaal.some((o) => {
      if (o === g) return false;
      const lo = Math.min(o.x1, o.x2), hi = Math.max(o.x1, o.x2);
      if (xm < lo - 1 || xm > hi + 1 || hi - lo < 1e-9) return false;
      const zo = o.z1 + (o.z2 - o.z1) * ((xm - o.x1) / (o.x2 - o.x1));
      return zo > zm + 5; // 5 mm: afronding van getekende knopen
    });
  };
  const dak = geos.filter(isDak);
  if (dak.length === 0) {
    return fout(
      "Er is geen dakstaaf gevonden: geen niet-verticale staaf bovenin het model, en " +
      "geen staaf met belastingtype dak of overstek.",
    );
  }
  const dakIds = new Set(dak.map((g) => g.beam.id));
  const xL = Math.min(...dak.flatMap((g) => [g.x1, g.x2]));
  const xR = Math.max(...dak.flatMap((g) => [g.x1, g.x2]));
  const d_m = (xR - xL) / 1000;
  if (d_m <= 0) return fout("Het dak heeft geen breedte — wind is niet te bepalen.");

  const zs = model.nodes.map((n) => n.z);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const modelhoogte_m = (maxZ - minZ) / 1000;

  // ── Dakvorm en helling ────────────────────────────────────────────────
  // Stijging van links naar rechts per dakstaaf, in graden (+ = oplopend).
  const stijging = (g: StaafGeo) => {
    const [xa, za, xb, zb] = g.x1 <= g.x2 ? [g.x1, g.z1, g.x2, g.z2] : [g.x2, g.z2, g.x1, g.z1];
    return Math.atan2(zb - za, xb - xa) * 180 / Math.PI;
  };
  const midX = (g: StaafGeo) => (g.x1 + g.x2) / 2;
  const HELLING_TOL = 0.5;   // graden: daaronder telt een staaf als vlak
  const SPREIDING_TOL = 2.0; // graden: grotere verschillen in één dakvlak ⇒ weigeren
  let alpha: number;
  let xNok: number | null = null;
  const dakvorm = inst.vrijstaandDakvorm;
  if (dakvorm === "lessenaar") {
    const hellend = dak.filter((g) => Math.abs(stijging(g)) > HELLING_TOL);
    if (hellend.some((g) => stijging(g) > 0) && hellend.some((g) => stijging(g) < 0)) {
      return fout(
        "Het dak loopt deels op en deels af: dat is geen lessenaarsdak. Kies “zadeldak” " +
        "(tabel 7.7) als het een nok of kiel heeft.",
      );
    }
    const hellingen = dak.map((g) => Math.abs(stijging(g)));
    if (Math.max(...hellingen) - Math.min(...hellingen) > SPREIDING_TOL) {
      return fout(
        `De dakstaven hebben hellingen van ${graden(Math.min(...hellingen))} tot ` +
        `${graden(Math.max(...hellingen))}. Tabel 7.6 kent één dakhelling α per overkapping; ` +
        "een geknikt dak staat er niet in.",
      );
    }
    alpha = Math.max(...hellingen);
  } else {
    // Nok: het hoogste punt ligt binnen het dak, links loopt op en rechts af.
    // Kiel: het laagste punt ligt binnen, links loopt af en rechts op.
    const punten = dak.flatMap((g) => [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }]);
    const zTop = Math.max(...punten.map((p) => p.z));
    const zBodem = Math.min(...punten.map((p) => p.z));
    const gemX = (ps: { x: number }[]) => ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const xTop = gemX(punten.filter((p) => Math.abs(p.z - zTop) < 1));
    const xBodem = gemX(punten.filter((p) => Math.abs(p.z - zBodem) < 1));
    const rand = (xR - xL) * 0.05;
    const vlakken = (x: number) => ({
      links: dak.filter((g) => midX(g) < x), rechts: dak.filter((g) => midX(g) > x),
    });
    const past = (x: number, tekenLinks: 1 | -1) => {
      if (x - xL <= rand || xR - x <= rand) return false;
      const v = vlakken(x);
      return v.links.length > 0 && v.rechts.length > 0
        && v.links.every((g) => Math.sign(stijging(g)) === tekenLinks && Math.abs(stijging(g)) > HELLING_TOL)
        && v.rechts.every((g) => Math.sign(stijging(g)) === -tekenLinks && Math.abs(stijging(g)) > HELLING_TOL);
    };
    let tekenAlpha: 1 | -1;
    if (past(xTop, 1)) { xNok = xTop; tekenAlpha = 1; }
    else if (past(xBodem, -1)) { xNok = xBodem; tekenAlpha = -1; }
    else {
      return fout(
        "Voor een zadeldak (tabel 7.7) moet het dak uit twee dakvlakken bestaan die naar " +
        "een nok oplopen of naar een kiel aflopen. Dat is in dit model niet te vinden; " +
        "kies “lessenaarsdak” (tabel 7.6) als het dak één kant op helt.",
      );
    }
    const v = vlakken(xNok);
    const hL = v.links.map((g) => Math.abs(stijging(g)));
    const hR = v.rechts.map((g) => Math.abs(stijging(g)));
    const alle = [...hL, ...hR];
    if (Math.max(...alle) - Math.min(...alle) > SPREIDING_TOL) {
      return fout(
        `De dakvlakken hebben hellingen van ${graden(Math.min(...alle))} tot ${graden(Math.max(...alle))}. ` +
        "Tabel 7.7 gaat uit van één dakhelling α voor beide dakvlakken; een ongelijk of " +
        "geknikt zadeldak staat er niet in.",
      );
    }
    alpha = tekenAlpha * Math.max(...alle);
  }

  // ── Hoogte, afmetingen, spantpositie ──────────────────────────────────
  const hInvoer = inst.vrijstaandHoogte_m;
  const h_m = hInvoer !== null && hInvoer > 0 ? hInvoer : modelhoogte_m;
  const b_m = inst.gebouwlengte_m;
  const y_m = inst.positieSpant === "kopgevelspant" ? 0 : inst.afstandTotKopgevel_m;
  const inZoneB = y_m < b_m / 10;

  // Zonegrenzen langs het spant (horizontaal, zoals de plattegrond van tabel
  // 7.6/7.7): C over d/10 aan beide dakranden, bij tabel 7.7 D over d/5 rond de
  // nok of kiel, A daartussen. Ligt het spant binnen b/10 van het kopse eind,
  // dan ligt het in zone B, en die loopt over de volle d door.
  const d_mm = xR - xL;
  const zoneOp = (x: number): OverkappingZone => {
    if (inZoneB) return "B";
    if (x - xL < d_mm / 10 || xR - x < d_mm / 10) return "C";
    if (xNok !== null && Math.abs(x - xNok) < d_mm / 10) return "D";
    return "A";
  };
  const grenzen = [...new Set([
    xL, xR, xL + d_mm / 10, xR - d_mm / 10,
    ...(xNok !== null ? [xNok - d_mm / 10, xNok + d_mm / 10] : []),
  ].filter((x) => x >= xL && x <= xR))].sort((p, q) => p - q);
  const zones: { zone: OverkappingZone; van: number; tot: number }[] = [];
  for (let k = 0; k < grenzen.length - 1; k++) {
    if (grenzen[k + 1] - grenzen[k] < 1e-6) continue;
    const zone = zoneOp((grenzen[k] + grenzen[k + 1]) / 2);
    const laatste = zones[zones.length - 1];
    if (laatste && laatste.zone === zone) laatste.tot = grenzen[k + 1];
    else zones.push({ zone, van: grenzen[k], tot: grenzen[k + 1] });
  }

  geometrie = {
    h_m, modelhoogte_m, d_m,
    xLinks_m: xL / 1000, xRechts_m: xR / 1000,
    heeftHellendDak: Math.abs(alpha) > 5, heeftGevels: false, kapZonderGevel: false,
    dakhelling_graden: Math.abs(alpha),
    // In de tekening is een niet-dakstaaf (kolom, schoor) geen gevel: hij
    // krijgt de grijze kleur van een binnenstaaf.
    staven: geos.map((g) => ({
      beamId: g.beam.id,
      rol: dakIds.has(g.beam.id) ? (g.helling > 5 ? "dakHellend" : "dakPlat") : "binnen",
      x1: g.x1 / 1000, z1: g.z1 / 1000, x2: g.x2 / 1000, z2: g.z2 / 1000,
    })),
    vrijstaand: {
      dakvorm, alpha_graden: alpha, phi: inst.blokkering_phi, b_m, y_m, inZoneB,
      xNok_m: xNok !== null ? xNok / 1000 : null,
      zones: zones.map((z) => ({ zone: z.zone, van_m: z.van / 1000, tot_m: z.tot / 1000 })),
      dakstaven: dak.map((g) => g.beam.id),
    },
  };

  // ── Invoer controleren ────────────────────────────────────────────────
  if (!(inst.hohSpant_m > 0)) return fout("Vul een h.o.h.-afstand van de spanten in (> 0 m).");
  if (!(b_m > 0)) return fout("Vul de lengte b van de overkapping haaks op het spant in (> 0 m).");
  if (!(h_m > 0)) {
    return fout(
      "Het model heeft geen hoogte (alleen het dak is getekend). Vul de hoogte h van het " +
      "dak boven maaiveld in; die is ook de referentiehoogte z_e (§7.3(8)).",
    );
  }
  if (hInvoer !== null && hInvoer > 0 && hInvoer < modelhoogte_m - 1e-6) {
    return fout(
      `De opgegeven hoogte h = ${nl(hInvoer, 2)} m is lager dan het model zelf ` +
      `(${nl(modelhoogte_m, 2)} m). Vul de hoogte van het dak boven maaiveld in, of laat ` +
      "het veld leeg als de kolommen tot op de grond getekend zijn.",
    );
  }
  const opz = overkappingCoefficienten(dakvorm, alpha, inst.blokkering_phi);
  if (!opz.ok) return fout(opz.reden!);
  // Keuzes uit issue #16. Een ontbrekend veld is de oude stand: niets extra
  // genereren, zodat oude instellingen dezelfde uitvoer geven.
  const ruwheid = inst.wrijving ?? "geen";
  const aantalOverkappingen = inst.aantalOverkappingen ?? 1;
  const positieOverkapping = inst.positieOverkapping ?? 1;
  const kolomVorm = inst.kolomDoorsnede ?? "geen";
  const kolomB_mm = inst.kolomBreedte_mm ?? 0;
  const kolomD_mm = inst.kolomDiepte_mm ?? 0;
  if (!Number.isInteger(aantalOverkappingen) || aantalOverkappingen < 1) {
    return fout("Vul het aantal overkappingen in de rij in als geheel getal van 1 of meer (1 = een los dak).");
  }
  let mc: GeschakeldeReductie | null = null;
  if (aantalOverkappingen > 1 && dakvorm === "zadel") {
    const r = geschakeldeReductie(aantalOverkappingen, positieOverkapping);
    if (!r.ok) return fout(r.reden!);
    mc = r;
  }
  if (kolomVorm !== "geen") {
    if (!(kolomB_mm > 0)) return fout("Vul de breedte b van de kolom loodrecht op de wind in (> 0 mm).");
    if (kolomVorm === "rechthoekig" && !(kolomD_mm > 0)) {
      return fout("Vul de diepte d van de kolom in de windrichting in (> 0 mm); c_f,0 hangt af van d/b (figuur 7.23).");
    }
  }
  const breedte_m = inst.belastingbreedteOverride_m !== null && inst.belastingbreedteOverride_m > 0
    ? inst.belastingbreedteOverride_m
    : (inst.positieSpant === "kopgevelspant" ? inst.hohSpant_m / 2 : inst.hohSpant_m);

  // ── Stuwdruk op z_e = h (§7.3(8)) ─────────────────────────────────────
  if (inst.stuwdrukBron === "handmatig" && !(inst.qpHandmatig_kNm2 > 0)) {
    return fout("Vul een stuwdruk groter dan 0 kN/m² in, of kies “berekenen”.");
  }
  if (h_m > ZMAX_M) {
    return fout(`De hoogte (${nl(h_m, 1)} m) ligt boven z_max = ${ZMAX_M} m; ` +
      "de snelheidsprofielformules van §4.3.2 gelden daar niet meer.");
  }
  const stuwdruk = inst.stuwdrukBron === "handmatig"
    ? handmatigeStuwdruk(inst.qpHandmatig_kNm2, h_m)
    : berekenStuwdruk(inst.windgebied, inst.terreincategorie, h_m);
  const qp = stuwdruk.qp_kNm2;

  const tabelTekst = `§7.3 tabel ${opz.tabel} (α = ${graden(alpha)}, φ = ${nl(inst.blokkering_phi, 2)})`;
  const rijTekst = opz.rijOnder === opz.rijBoven
    ? `rij α = ${graden(opz.rijOnder)}`
    : `lineair tussen de rijen α = ${graden(opz.rijOnder)} en ${graden(opz.rijBoven)}`;
  meldingen.push({
    niveau: "info",
    tekst: `Vrijstaand dak (open overkapping, NEN-EN 1991-1-4 §7.3): ` +
      `${dakvorm === "lessenaar" ? "lessenaarsdak, tabel 7.6" : `${alpha < 0 ? "kieldak" : "zadeldak"}, tabel 7.7`}, ` +
      `α = ${graden(alpha)} (${rijTekst}), φ = ${nl(inst.blokkering_phi, 2)}. ` +
      `Referentiehoogte z_e = h = ${nl(h_m, 2)} m (§7.3(8))` +
      (hInvoer !== null && hInvoer > 0 ? " — opgegeven." : " — de hoogte van het model."),
  });
  meldingen.push(stuwdrukMelding(stuwdruk));
  if (h_m >= CSCD_GRENSHOOGTE_M) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `De hoogte is ${nl(h_m, 1)} m. De generator rekent met c_s·c_d = 1,0; ` +
        `dat mag zonder meer alleen onder ${CSCD_GRENSHOOGTE_M} m (${CSCD_BRON}). ` +
        "Bepaal c_s·c_d volgens §6.3 en verhoog de lasten zo nodig zelf.",
    });
  }
  meldingen.push({
    niveau: "info",
    tekst: inZoneB
      ? `Het spant ligt op ${nl(y_m, 2)} m van het kopse eind, binnen b/10 = ${nl(b_m / 10, 2)} m: ` +
        "de c_p,net-gevallen gebruiken zone B over de hele breedte."
      : `Het spant ligt op ${nl(y_m, 2)} m van het kopse eind, voorbij b/10 = ${nl(b_m / 10, 2)} m: ` +
        `zone C over d/10 = ${nl(d_m / 10, 2)} m aan beide dakranden` +
        (xNok !== null ? `, zone D over d/5 = ${nl(d_m / 5, 2)} m rond de ${alpha < 0 ? "kiel" : "nok"}` : "") +
        ", zone A daartussen.",
  });
  meldingen.push({
    niveau: "info",
    tekst: "c_p,net en c_f uit tabel 7.6/7.7 gelden voor alle windrichtingen (§7.3(3)); de " +
      "knoppen voor de windrichting en de inwendige druk c_pi doen bij een vrijstaand dak " +
      "niet mee. c_p,net is het grootste lokale drukverschil en hoort bij dakbedekking en " +
      "bevestigingen, c_f bij de resulterende kracht (§7.3(5)); de generator maakt beide.",
  });
  {
    const niet: string[] = [];
    if (ruwheid === "geen") niet.push("de wrijvingskracht langs het dak (§7.3(7), §7.5) — kies de oppervlakteruwheid");
    if (aantalOverkappingen === 1) niet.push("de reductie van geschakelde overkappingen (§7.3(9), tabel 7.8) — vul het aantal in als dit dak in een rij staat");
    if (kolomVorm === "geen") niet.push("de wind op de kolommen (§7.6/§7.7) — kies de doorsnedevorm van de kolom");
    niet.push("een dubbele huid (§7.3(6): de doorlatende laag met 1/3 c_p,net) — die geldt voor dakbedekking en bevestigingen, niet voor het spant");
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `Niet gegenereerd: ${niet.join("; ")}.`,
    });
  }

  // ── Coëfficiënten ─────────────────────────────────────────────────────
  const coef = new Map(opz.coefficienten.map((c) => [c.naam, c]));
  const cf = coef.get("c_f")!;
  // §7.3(4): "aan lijzijde van de positie van maximale blokkering behoren
  // c_p,net-waarden voor φ = 0 te zijn gebruikt". Waar de blokkering staat
  // weet de generator niet — elk deel van het dak kan dus aan de lijzijde
  // ervan liggen. Het opwaartse c_p,net-geval neemt daarom per zone de
  // ongunstigste van de waarde bij φ en die bij φ = 0. c_f blijft de waarde bij
  // φ: dat is de resultante van het hele dak, en §7.3(4) noemt c_p,net.
  const cpNetOpwaarts: Partial<Record<OverkappingZone, number>> = {};
  const aangepast: string[] = [];
  for (const c of opz.coefficienten) {
    if (c.naam === "c_f") continue;
    cpNetOpwaarts[c.naam] = Math.min(c.minPhi, c.min0);
    if (c.min0 < c.minPhi - 1e-12) aangepast.push(`${c.naam}: ${teken(c.min0, 2)} i.p.v. ${teken(c.minPhi, 3)}`);
  }
  if (aangepast.length > 0) {
    meldingen.push({
      niveau: "info",
      tekst: "§7.3(4): aan de lijzijde van de blokkering gelden de c_p,net-waarden voor φ = 0. " +
        "Omdat niet bekend is waar de blokkering staat, gebruikt het opwaartse c_p,net-geval " +
        `per zone de ongunstigste van beide — zone ${aangepast.join("; ")}.`,
    });
  }
  // §7.3(9), tabel 7.8: ψ_mc op de maximale (neerwaartse) en minimale
  // (opwaartse) kracht- en drukcoëfficiënten. §7.3(6) en (9) noemen het
  // uitdrukkelijk voor TWEEZIJDIG hellende overkappingen (tabel 7.7, figuur
  // 7.18); voor een lessenaarsdak geeft de norm geen reductie, en dan wordt
  // er ook niet gereduceerd — dat ligt aan de veilige kant.
  if (aantalOverkappingen > 1 && dakvorm === "lessenaar") {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `Er staan ${aantalOverkappingen} overkappingen in de rij, maar tabel 7.8 geldt volgens ` +
        "§7.3(6) en (9) voor tweezijdig hellende overkappingen (figuur 7.18). Bij een lessenaarsdak " +
        "wordt niet gereduceerd; de coëfficiënten van tabel 7.6 blijven onverminderd (veilig).",
    });
  }
  if (mc) {
    meldingen.push({
      niveau: "info",
      tekst: `Geschakelde overkappingen (${GESCHAKELD_BRON}): overkapping ${positieOverkapping} van ` +
        `${aantalOverkappingen}, geteld van beide kanten zoals figuur 7.18 (1, 2, 3, …, 3, 2, 1) ⇒ ` +
        `${mc.locatie} (rij ${mc.rang}). ψ_mc = ${nl(mc.psiMax, 1)} op de neerwaartse en ` +
        `${nl(mc.psiMin, 1)} op de opwaartse c_p,net en c_f.`,
    });
  }
  /** ψ_mc voor neerwaarts ("max") of opwaarts ("min"); 1 zonder reductie. */
  const psiMc = (soort: "max" | "min") => (mc ? (soort === "max" ? mc.psiMax : mc.psiMin) : 1);
  /** De reductie als tekst achter de tabelwaarde; leeg zonder reductie. */
  const mcTekst = (soort: "max" | "min", c0: number) => (mc
    ? ` · ψ_mc ${nl(psiMc(soort), 1)} (tabel 7.8, ${mc.locatie}) = ${teken(c0 * psiMc(soort), 2)}`
    : "");

  // ── Gevallen en lasten ────────────────────────────────────────────────
  const gevallen: GegenereerdGeval[] = [];
  const lasten: GegenereerdeLast[] = [];
  const perGeval: WindSamenvatting["perGeval"] = [];
  const dakRol = (g: StaafGeo): BeamLoadRole => (g.helling > 5 ? "dakHellend" : "dakPlat");

  /** Het deel [van, tot] (in x, mm) van staaf g als fracties vanaf de startknoop. */
  const deel = (g: StaafGeo, van: number, tot: number): [number, number] | null => {
    const lo = Math.min(g.x1, g.x2), hi = Math.max(g.x1, g.x2);
    if (hi - lo < 1e-9) return van <= lo && lo <= tot ? [0, 1] : null;
    const a = Math.max(lo, van), b = Math.min(hi, tot);
    if (b - a <= 1e-9) return null;
    const f = (x: number) => (x - g.x1) / (g.x2 - g.x1);
    const fa = Math.max(0, Math.min(1, Math.min(f(a), f(b))));
    const fb = Math.max(0, Math.min(1, Math.max(f(a), f(b))));
    return fb - fa <= 1e-9 ? null : [fa, fb];
  };

  const maakGeval = (
    sleutel: string, naam: string, richting: Windrichting,
    belast: { g: StaafGeo; van: number; tot: number; zone: string; c: number; factor: number; bron: string; omschrijving: string }[],
  ) => {
    gevallen.push({ sleutel, naam, richting, cpi: 0 });
    const regels: VlakRegel[] = [];
    // Resultante per dakvlak: bij een zadeldak een per helling (figuur 7.17).
    const res = new Map<string, { F: number; Fx: number; Fz: number }>();
    for (const s of belast) {
      const fr = deel(s.g, s.van, s.tot);
      if (!fr) continue;
      const [a, b] = fr;
      const vol = a <= 1e-9 && b >= 1 - 1e-9;
      const n = dakNormaal(s.g);
      // Positieve c = netto neerwaarts = druk tegen de bovenkant van het dak.
      const w = qp * s.c * s.factor;
      const q = drukNaarLokaleLijnlast(w, breedte_m, s.g, n.nx, n.nz);
      const deelTekst = vol ? "" : ` (${nl(a, 2)}–${nl(b, 2)} van de staaf)`;
      regels.push({
        beamId: s.g.beam.id, rol: dakRol(s.g), zone: s.zone + deelTekst, cpe: s.c, cpi: 0,
        w_kNm2: w, q_kNm: q, bron: s.bron, ...(vol ? {} : { startFrac: a, endFrac: b }),
      });
      // Resultante voor de tekening: kracht en zwaartepunt van dit deel.
      const lengte_m = (s.g.L_mm / 1000) * (b - a);
      const kracht = w * breedte_m * lengte_m;
      const fm = (a + b) / 2;
      const vlakSleutel = xNok === null ? "dak" : midX(s.g) < xNok ? "links" : "rechts";
      const r = res.get(vlakSleutel) ?? { F: 0, Fx: 0, Fz: 0 };
      r.F += kracht;
      r.Fx += kracht * (s.g.x1 + (s.g.x2 - s.g.x1) * fm) / 1000;
      r.Fz += kracht * (s.g.z1 + (s.g.z2 - s.g.z1) * fm) / 1000;
      res.set(vlakSleutel, r);
      if (Math.abs(q) < 1e-12) continue;
      lasten.push({
        gevalSleutel: sleutel, beamId: s.g.beam.id, q,
        ...(vol ? {} : { startFrac: a, endFrac: b }),
        toelichting:
          `Staaf ${s.g.beam.id}, ${s.zone}${deelTekst}: ` +
          `w = ${nl(qp, 3)}·${s.factor !== 1 ? `${nl(s.factor, 0)}·` : ""}(${teken(s.c, 3)}) = ${teken(w, 3)} kN/m², ` +
          `q = w·${nl(breedte_m, 2)} m = ${nl(Math.abs(q), 3)} kN/m ${w >= 0 ? "neerwaarts" : "opwaarts"}`,
        omschrijving: s.omschrijving,
      });
    }
    const resultanten = [...res.values()]
      .filter((r) => Math.abs(r.F) > 1e-12)
      .map((r) => ({ x_m: r.Fx / r.F, z_m: r.Fz / r.F, F_kN: r.F }))
      .sort((p, q) => p.x_m - q.x_m);
    perGeval.push({
      sleutel, naam, regels,
      ...(sleutel.includes(":cf:") && resultanten.length > 0 ? { resultanten } : {}),
    });
  };

  // 1. c_p,net per zone.
  const zoneBelasting = (opwaarts: boolean) => dak.flatMap((g) => zones.map((z) => {
    const c0 = opwaarts ? cpNetOpwaarts[z.zone]! : coef.get(z.zone)!.max;
    const soort = opwaarts ? "min" : "max";
    const c = mc ? c0 * psiMc(soort) : c0;
    // De buitenste zones lopen door tot buiten het dak (afronding van knopen).
    const van = z === zones[0] ? Number.NEGATIVE_INFINITY : z.van;
    const tot = z === zones[zones.length - 1] ? Number.POSITIVE_INFINITY : z.tot;
    return {
      g, van, tot, zone: `zone ${z.zone}`, c, factor: 1,
      bron: `NEN-EN 1991-1-4 ${tabelTekst}, zone ${z.zone}, c_p,net ${opwaarts ? "minimaal" : "maximaal"}` +
        (opwaarts ? " (§7.3(3)/(4))" : "") + (mc ? `; ψ_mc ${nl(psiMc(soort), 1)} (${GESCHAKELD_BRON})` : ""),
      omschrijving: `${tabelTekst}: zone ${z.zone}, c_p,net = ${teken(c0, 2)}${mcTekst(soort, c0)}`,
    };
  }));
  const NAAM = "Wind vrijstaand dak";
  maakGeval(`${VRIJSTAAND_SLEUTEL_PREFIX}cpnet:max`, `${NAAM} c_p,net neerwaarts`, "alle", zoneBelasting(false));
  maakGeval(`${VRIJSTAAND_SLEUTEL_PREFIX}cpnet:min`, `${NAAM} c_p,net opwaarts`, "alle", zoneBelasting(true));

  // 2. c_f — maximaal (neerwaarts, alle φ) en minimaal (opwaarts, bij φ).
  for (const [soort, c, woord] of [["max", cf.max, "neerwaarts"], ["min", cf.minPhi, "opwaarts"]] as const) {
    if (dakvorm === "lessenaar") {
      for (const richting of ["links", "rechts"] as const) {
        // Loefhelft: van de loefrand tot d/2; 2·c_f daarover legt F op d/4.
        const [van, tot] = richting === "links"
          ? [Number.NEGATIVE_INFINITY, xL + d_mm / 2]
          : [xR - d_mm / 2, Number.POSITIVE_INFINITY];
        maakGeval(
          `${VRIJSTAAND_SLEUTEL_PREFIX}cf:${soort}:${richting}`,
          `${NAAM} c_f ${woord}, van ${richting}`,
          richting,
          dak.map((g) => ({
            g, van, tot, zone: "loefhelft, 2·c_f", c, factor: 2,
            bron: `NEN-EN 1991-1-4 ${tabelTekst}, c_f ${soort === "max" ? "maximaal" : "minimaal"}; ` +
              "resultante op d/4 van de loefrand (figuur 7.16) als 2·c_f over de loefhelft",
            omschrijving: `${tabelTekst}: c_f = ${teken(c, 2)}, resultante op d/4 van de loefrand (fig. 7.16)`,
          })),
        );
      }
    } else {
      const cf0 = c;
      const cfz = mc ? cf0 * psiMc(soort) : cf0;
      const vlak = (kant: "beide" | "links" | "rechts") => dak
        .filter((g) => kant === "beide" || (kant === "links" ? midX(g) < xNok! : midX(g) > xNok!))
        .map((g) => ({
          g, van: Number.NEGATIVE_INFINITY, tot: Number.POSITIVE_INFINITY,
          zone: midX(g) < xNok! ? "linkerdakvlak, c_f" : "rechterdakvlak, c_f", c: cfz, factor: 1,
          bron: `NEN-EN 1991-1-4 ${tabelTekst}, c_f ${soort === "max" ? "maximaal" : "minimaal"}; ` +
            "resultante in het midden van het dakvlak (§7.3(6), figuur 7.17)" +
            (mc ? `; ψ_mc ${nl(psiMc(soort), 1)} (${GESCHAKELD_BRON})` : ""),
          omschrijving: `${tabelTekst}: c_f = ${teken(cf0, 2)}${mcTekst(soort, cf0)}, in het midden van het dakvlak (fig. 7.17)`,
        }));
      maakGeval(`${VRIJSTAAND_SLEUTEL_PREFIX}cf:${soort}:beide`, `${NAAM} c_f ${woord}, beide dakvlakken`, "alle", vlak("beide"));
      maakGeval(`${VRIJSTAAND_SLEUTEL_PREFIX}cf:${soort}:links`, `${NAAM} c_f ${woord}, alleen linkerdakvlak`, "alle", vlak("links"));
      maakGeval(`${VRIJSTAAND_SLEUTEL_PREFIX}cf:${soort}:rechts`, `${NAAM} c_f ${woord}, alleen rechterdakvlak`, "alle", vlak("rechts"));
    }
  }

  // 4. Horizontaal: wrijving langs het dak en wind op de kolommen.
  //
  // WAT HET 2D-MODEL KAN DRAGEN. Het spant ligt in het x-z-vlak. Wind in de
  // richting van het spant (van links of van rechts) geeft een wrijvingskracht
  // langs de dakstaven en een horizontale last op de kolommen: beide in het
  // vlak, dus als lastgeval. Wind in de lengterichting van de overkapping
  // (haaks op het spant) geeft dezelfde wrijving en kolomlast in y-richting:
  // die valt uit het vlak en hoort bij het langsverband. Daarvan komt alleen
  // de grootte in een melding.
  //
  // WAAROM ÉÉN GEVAL PER RICHTING: wrijving en kolomlast horen bij dezelfde
  // wind en werken dus tegelijk. Dat geval leidt nooit alleen: de
  // combinatiebouw neemt het samen met elk dakgeval van dezelfde richting
  // (`windVarianten`, issue #26). Als eigen geval blijft het zichtbaar in de
  // lastentabel en de tekening, met zijn eigen afleiding.
  const cfr = ruwheid === "geen" ? null : TABEL_710_CFR[ruwheid];
  const kolommen = kolomVorm === "geen"
    ? []
    : geos.filter((g) => !dakIds.has(g.beam.id) && g.helling >= 89);
  let cfKolom = 0;
  let kolomAfleiding = "";
  if (kolomVorm !== "geen") {
    const toeslag = kolomVorm === "rechthoekig" && kolomD_mm / kolomB_mm < PLAATACHTIG_GRENS_DB
      ? PLAATACHTIG_TOESLAG : 1;
    // ψ_r = 1,0: figuur 7.24 bij r/b = 0 (scherpe hoeken). Afgeronde hoeken
    // mogen lager, maar de hoekstraal kent de generator niet — 1,0 is de
    // bovengrens van de figuur en ligt dus aan de veilige kant.
    // ψ_λ = 1,0: figuur 7.36 geeft ψ_λ ≤ 1,0 als indicatieve krommen zonder
    // gelabelde celwaarden op de slankheden van een kolom; 1,0 is de
    // bovengrens (veilig), zie de melding.
    if (kolomVorm === "scherphoekig") {
      cfKolom = CF0_SCHERPHOEKIG;
      kolomAfleiding = `§7.7 (7.11): c_f = c_f,0·ψ_λ = ${nl(CF0_SCHERPHOEKIG, 2)}·1,00 = ${nl(cfKolom, 2)}`;
    } else {
      const db = kolomD_mm / kolomB_mm;
      const cf0 = cf0Rechthoekig(db);
      cfKolom = cf0 * toeslag;
      kolomAfleiding = `§7.6 (7.9), fig. 7.23: d/b = ${nl(db, 2)} ⇒ c_f,0 = ${nl(cf0, 3)}; ` +
        `c_f = c_f,0·ψ_r·ψ_λ${toeslag !== 1 ? "·1,25 (§7.6(3))" : ""} = ${nl(cfKolom, 3)}`;
    }
  }
  if (cfr !== null || kolommen.length > 0) {
    // Maaiveld: het model staat met zijn bovenkant op hoogte h (§7.3(8)).
    const zGrond = maxZ - h_m * 1000;
    for (const [richting, teken1] of [["links", 1], ["rechts", -1]] as const) {
      const sleutel = `${VRIJSTAAND_SLEUTEL_PREFIX}horizontaal:${richting}`;
      const delen = [...(cfr !== null ? ["wrijving"] : []), ...(kolommen.length > 0 ? ["kolommen"] : [])];
      const naam = `${NAAM} ${delen.join(" + ")}, van ${richting}`;
      gevallen.push({ sleutel, naam, richting, cpi: 0 });
      const regels: VlakRegel[] = [];
      if (cfr !== null) {
        // F_fr = c_fr·q_p(z_e)·A_fr (5.7), A_fr = 2·d·b (figuur 7.22: boven- én
        // onderzijde van het dak). Per spant en per meter dakstaaf:
        // c_fr·q_p·2·belastingbreedte, langs het dakvlak in de zin van de wind.
        // Bij een hellend dak is het oppervlak de werkelijke dakvlaklengte maal
        // b; figuur 7.22 tekent een vlak dak, waar die lengte d is.
        const w = cfr * qp * 2;
        for (const g of dak) {
          const zin = teken1 * Math.sign(g.ax);
          const q = zin * w * breedte_m;
          regels.push({
            beamId: g.beam.id, rol: dakRol(g), zone: "wrijving", cpe: cfr, cpi: 0,
            w_kNm2: w, q_kNm: q, bron: WRIJVING_BRON,
            krachtRichting: { x: zin * g.ax, z: zin * g.az },
          });
          lasten.push({
            gevalSleutel: sleutel, beamId: g.beam.id, q, richting: "axiaal",
            toelichting:
              `Staaf ${g.beam.id}, wrijving: q = c_fr·q_p·2·breedte = ${nl(cfr, 2)}·${nl(qp, 3)}·2·` +
              `${nl(breedte_m, 2)} m = ${nl(Math.abs(q), 4)} kN/m langs de staaf, van ${richting}`,
            omschrijving: `§7.3(7)/§7.5 tabel 7.10: c_fr = ${nl(cfr, 2)} (${TABEL_710_OMSCHRIJVING[ruwheid as Oppervlakteruwheid]}), ` +
              `A_fr = boven- en onderzijde (fig. 7.22), langs het dak, wind van ${richting}`,
          });
        }
      }
      for (const g of kolommen) {
        // §7.6(2)/§7.7(3): z_e = de hoogste punt van de kolom boven maaiveld.
        const zTop_m = (Math.max(g.z1, g.z2) - zGrond) / 1000;
        const qpK = inst.stuwdrukBron === "handmatig"
          ? inst.qpHandmatig_kNm2
          : berekenStuwdruk(inst.windgebied, inst.terreincategorie, zTop_m).qp_kNm2;
        const w = qpK * cfKolom;
        // Kracht in +x bij wind van links; q in lokale z = F·(e_x · t).
        const q = teken1 * w * (kolomB_mm / 1000) * g.tx;
        regels.push({
          beamId: g.beam.id, rol: "binnen", zone: "kolom", cpe: cfKolom, cpi: 0,
          w_kNm2: w, q_kNm: q, bron: KOLOM_BRON[kolomVorm as KolomDoorsnede],
          krachtRichting: { x: teken1, z: 0 },
        });
        lasten.push({
          gevalSleutel: sleutel, beamId: g.beam.id, q,
          toelichting:
            `Staaf ${g.beam.id}, kolom: q = q_p(z_e = ${nl(zTop_m, 2)} m)·c_f·b = ${nl(qpK, 3)}·` +
            `${nl(cfKolom, 3)}·${nl(kolomB_mm / 1000, 3)} m = ${nl(Math.abs(q), 4)} kN/m, van ${richting}`,
          omschrijving: `${kolomAfleiding}, b = ${nl(kolomB_mm, 0)} mm, z_e = ${nl(zTop_m, 2)} m, wind van ${richting}`,
        });
      }
      perGeval.push({ sleutel, naam, regels });
    }
    meldingen.push({ niveau: "info", tekst: HORIZONTAAL_COMBINATIE_UITLEG });
  }
  if (cfr !== null) {
    // De werkelijke dakvlaklengte langs de staven; bij een vlak dak is dat d.
    const dakLengte_m = dak.reduce((som, g) => som + g.L_mm, 0) / 1000;
    const F_spant = cfr * qp * 2 * dakLengte_m * breedte_m;
    const F_lang = cfr * qp * 2 * dakLengte_m * b_m;
    meldingen.push({
      niveau: "info",
      tekst: `Wrijving (${WRIJVING_BRON}): c_fr = ${nl(cfr, 2)}, ${TABEL_710_OMSCHRIJVING[ruwheid as Oppervlakteruwheid]}. ` +
        `F_fr = c_fr·q_p(z_e)·A_fr (5.7) met A_fr = 2·d·b (boven- en onderzijde, figuur 7.22; bij een ` +
        `hellend dak de dakvlaklengte ${nl(dakLengte_m, 3)} m in plaats van d) en ` +
        `z_e = h (§7.3(8), §7.5(4)). In het vlak van dit spant: ${nl(cfr, 2)}·${nl(qp, 3)}·2·${nl(dakLengte_m, 3)}·` +
        `${nl(breedte_m, 2)} = ${nl(F_spant, 3)} kN langs de dakstaven, per windrichting een geval. ` +
        "De uitsluiting van §7.5(3) (geen wrijving binnen min(2·b; 4·h) van de loefrand) is niet " +
        "toegepast: h is in figuur 7.22 de dikte van het dak, die het model niet kent; over het hele " +
        "dak rekenen ligt aan de veilige kant.",
    });
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "Wind in de lengterichting van de overkapping (haaks op het spant) geeft een " +
        `wrijvingskracht van ${nl(cfr, 2)}·${nl(qp, 3)}·2·${nl(dakLengte_m, 3)}·${nl(b_m, 2)} = ${nl(F_lang, 3)} kN ` +
        "op het hele dak. Die werkt uit het vlak van dit 2D-model en wordt niet gegenereerd: " +
        "het langsverband moet hem opnemen.",
    });
  }
  if (kolomVorm !== "geen") {
    const nietVerticaal = geos.filter((g) => !dakIds.has(g.beam.id) && g.helling < 89);
    meldingen.push({
      niveau: kolommen.length > 0 ? "info" : "waarschuwing",
      tekst: kolommen.length > 0
        ? `Wind op de kolommen (${KOLOM_BRON[kolomVorm as KolomDoorsnede]}): staaf ` +
          `${kolommen.map((g) => g.beam.id).join(", ")}; ${kolomAfleiding}. q = q_p(z_e)·c_f·b met ` +
          `b = ${nl(kolomB_mm, 0)} mm loodrecht op de wind en z_e = de bovenkant van de kolom boven ` +
          "maaiveld (§7.6(2)/§7.7(3)); A_ref = ℓ·b. Beide kolommen krijgen de volle last: afscherming " +
          "door een kolom ervoor kent §7.6/§7.7 niet. ψ_λ = 1,0: figuur 7.36 geeft alleen " +
          "indicatieve krommen met ψ_λ ≤ 1,0 en is niet per cel af te lezen; 1,0 ligt aan de veilige " +
          "kant." + (kolomVorm === "rechthoekig" ? " ψ_r = 1,0: figuur 7.24 bij scherpe hoeken " +
          "(r/b = 0); afgeronde hoeken mogen lager, zie figuur 7.24." : "")
        : "Er is geen verticale kolom gevonden (een niet-dakstaaf binnen 1° van verticaal); er is " +
          "geen wind op kolommen gegenereerd.",
    });
    if (kolommen.length > 0 && kolomVorm === "rechthoekig" && kolomD_mm / kolomB_mm < PLAATACHTIG_GRENS_DB) {
      meldingen.push({
        niveau: "info",
        tekst: `d/b = ${nl(kolomD_mm / kolomB_mm, 2)} < 0,2: een plaatachtige doorsnede kan volgens §7.6(3) ` +
          "tot 25 % hogere c_f geven; de generator rekent die toename mee.",
      });
    }
    if (nietVerticaal.length > 0) {
      meldingen.push({
        niveau: "info",
        tekst: `Geen kolomwind op staaf ${nietVerticaal.map((g) => g.beam.id).join(", ")}: niet verticaal ` +
          "(schoor of schuine stijl). Voor een schuin element volgt de last niet rechtstreeks uit §7.6/§7.7.",
      });
    }
    meldingen.push({
      niveau: "info",
      tekst: "Wind haaks op het spant belast de kolommen uit het vlak (om hun andere as); dat valt " +
        "buiten dit 2D-model. Cirkelvormige kolommen (§7.9.2) genereert de generator niet: c_f,0 staat " +
        "daar alleen als grafiek en formule in figuur 7.28 (afhankelijk van het reynoldsgetal en k/b), " +
        "zonder vermeld geldigheidsbereik per formule.",
    });
  }

  const overig = geos.filter((g) => !dakIds.has(g.beam.id));
  if (overig.length > 0) {
    meldingen.push({
      niveau: "info",
      tekst: `Als dak belast: staaf ${dak.map((g) => g.beam.id).join(", ")}. Niet belast ` +
        `(kolom, schoor of ander onderdeel): staaf ${overig.map((g) => g.beam.id).join(", ")}.`,
    });
  }
  if (lasten.length === 0) return fout("Er is geen enkele windlast ontstaan op de dakstaven.");

  const combinaties = combinatiesMetMeldingen(model, inst, gevallen, meldingen);
  return {
    ok: true,
    meldingen,
    gevallen,
    lasten,
    combinaties,
    samenvatting: {
      hoogte_m: h_m, spanwijdte_m: d_m, hOverD: h_m / d_m,
      belastingbreedte_m: breedte_m, stuwdruk, perGeval,
      vrijstaand: {
        dakvorm, alpha_graden: alpha, phi: inst.blokkering_phi, opzoeking: opz, cpNetOpwaarts,
        ...(mc ? { geschakeld: { aantal: aantalOverkappingen, positie: positieOverkapping, ...mc } } : {}),
      },
    },
    geometrie,
  };
}

/**
 * De combinaties bij de gegenereerde gevallen plus de meldingen die erbij
 * horen — één route voor het gebouw en het vrijstaande dak, zodat een
 * vrijstaand dak precies dezelfde combinatiebouw krijgt.
 */
function combinatiesMetMeldingen(
  model: WindModelInvoer, inst: WindInstellingen,
  gevallen: readonly GegenereerdGeval[], meldingen: WindMelding[],
): GegenereerdeCombinatie[] {
  const combinaties: GegenereerdeCombinatie[] = [];
  if (inst.combinatiesGenereren) {
    const eigen = model.loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
    const klasse = model.gevolgklasse ?? STANDAARD_GEVOLGKLASSE;
    const bijlage = model.bijlage ?? STANDAARD_BIJLAGE;
    const f = partieleFactoren(klasse, bijlage);
    const overig = eigen.filter((c) => c.type === "other");
    if (overig.length > 0) {
      meldingen.push({
        niveau: "waarschuwing",
        tekst: `De belastinggevallen ${overig.map((c) => `“${c.name}”`).join(", ")} hebben ` +
          "type “overig”. De generator kent daar geen ψ₀ bij en laat ze uit de " +
          "gegenereerde combinaties. Geef ze een type, of neem ze handmatig op.",
      });
    }
    combinaties.push(...genereerWindCombinaties(model.loadCases, gevallen, klasse, bijlage));
    meldingen.push({
      niveau: "info",
      tekst: `De gegenereerde combinaties gebruiken gevolgklasse ${klasse}: γ uit NEN-EN 1990 ` +
        `${f.bron}, ψ uit tabel NB.2–A1.1. De betrouwbaarheidsfactor K_FI zit daarmee in ` +
        "de partiële factoren zelf en wordt nergens nog eens toegepast.",
    });
  }
  return combinaties;
}

/** De melding over de herkomst van de stuwdruk — gebouw en vrijstaand dak. */
function stuwdrukMelding(stuwdruk: StuwdrukResultaat): WindMelding {
  if (stuwdruk.handmatig) {
    return {
      niveau: "info",
      tekst: `De stuwdruk is handmatig opgegeven (${nl(stuwdruk.qp_kNm2, 3)} kN/m²); ` +
        "de generator heeft hem niet zelf afgeleid.",
    };
  }
  return {
    niveau: "waarschuwing",
    tekst: "De stuwdruk is berekend met de ruwheidslengtes uit EN 1991-1-4 tabel 4.1. " +
      "De Nederlandse nationale bijlage geeft de extreme stuwdruk ook rechtstreeks " +
      "in tabelvorm per windgebied, terreinsoort en hoogte; die waarde kan " +
      "afwijken. Houdt u die tabel aan, kies dan “stuwdruk handmatig” en voer de " +
      "waarde uit de nationale bijlage in.",
  };
}

/**
 * De combinaties bij de gegenereerde windgevallen — zonder lasten, zonder
 * geometrie en zonder generatorinstellingen. Ze hangen alleen af van:
 *  - de NIET-gegenereerde belastinggevallen (type en gebruikscategorie), want
 *    die bepalen G en de begeleidende veranderlijke belastingen;
 *  - de gegenereerde windgevallen (sleutel en naam);
 *  - de gevolgklasse (γ uit NB tabel NB.4/NB.5).
 *
 * WAAROM LOS VAN `genereerWindbelasting`: `lib/combinatieBeheer` houdt de
 * gegenereerde combinaties hiermee bij zodra er een belastinggeval bijkomt,
 * van type verandert of de gevolgklasse wijzigt — ook als de generator zelf
 * niet actief is, en na het openen van een project staat hij uit. Gemeten in
 * september 2026: portaal 12 × 6 m, wind gegenereerd, daarna een veranderlijk
 * geval "Q dak 2" erbij. De windcombinaties bleven zonder 0,6·Q dak 2, en vier
 * N–M-toestanden aan de kolomvoet werden door geen enkele combinatie gedekt,
 * zonder melding. Eén functie voor de generator én voor het bijhouden, zodat
 * die twee niet uit elkaar kunnen lopen.
 */
export function genereerWindCombinaties(
  loadCases: readonly GevalInvoer[],
  windGevallen: readonly { sleutel: string; naam: string }[],
  gevolgklasse: Gevolgklasse = STANDAARD_GEVOLGKLASSE,
  bijlage: NationaleBijlageCode = STANDAARD_BIJLAGE,
): GegenereerdeCombinatie[] {
  const combinaties: GegenereerdeCombinatie[] = [];
  {
    const eigen = loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
    const f = partieleFactoren(gevolgklasse, bijlage);
    const G = eigen.filter((c) => c.type === "dead").map((c) => c.id);
    /** Afronden op 1e-9: 1,5 · 0,4 is in drijvende komma 0,6000000000000001. */
    const r = (x: number) => Math.round(x * 1e9) / 1e9;
    const bron = `γ: NEN-EN 1990 ${f.bron}; ${psiBron(bijlage)}`;

    for (const gv of windVarianten(windGevallen)) {
      // Wind leidt in elke combinatie van zijn eigen geval. Begeleidend telt
      // wind met ψ₀,W = 0 (NB.2) en dus niet; ook sneeuw begeleidt met
      // ψ₀,S = ψ₂,S = 0. Om dezelfde reden is er geen 6.10a per windgeval
      // meer: in 6.10a krijgt ook de belangrijkste veranderlijke belasting ψ₀
      // (NB.4, "1,5 ψ₀,1 Q_k,1"), dus wind telt daar voor 0 en de combinatie
      // valt samen met de 6.10a van de standaardset. Tot september 2026, met
      // ψ₀,W = 0,6, maakte de generator er per windgeval een.
      // De begeleidende veranderlijke gevallen komen in elke opstelling: elk
      // aan- of afwezig, net als in de standaardset (normcombinaties.ts,
      // EN 1991-1-1 6.2.1(1)P). Een veranderlijke last die gunstig werkt telt
      // zo voor 0, en een per veld verdeelde vloerlast kan op één veld staan.
      const sets: {
        naam: string; type: "uls" | "sls"; formule: string;
        wind: number; g: number; begeleidend: (psi: PsiWaarden) => number;
      }[] = [
        {
          naam: `UGT 6.10b — ${gv.naam} leidend`, type: "uls",
          formule: `${nl(f.gGsup610b, 2)}·G + ${nl(f.gQ, 2)}·W + ${nl(f.gQ, 2)}·ψ₀,Q·Q + ${nl(f.gQ, 2)}·ψ₀,S·S`,
          g: f.gGsup610b, wind: f.gQ, begeleidend: (psi) => r(f.gQ * psi.psi0),
        },
        {
          // STR/GEO met gunstig werkende blijvende belasting: de kolom
          // "Gunstig 0,9 G_k,j,inf" van NB.4/NB.5. Dit is GEEN EQU (NB.3
          // hanteert daar 1,1/0,9 voor het statisch evenwicht); tot september
          // 2026 heette deze combinatie ten onrechte zo. Tot dezelfde maand
          // stond er geen begeleidende last in; de opstelling zonder
          // begeleidende gevallen is precies die oude combinatie.
          naam: `UGT 6.10b — ${gv.naam} leidend, blijvend gunstig`, type: "uls",
          formule: `${nl(f.gGinf, 2)}·G + ${nl(f.gQ, 2)}·W + ${nl(f.gQ, 2)}·ψ₀,Q·Q + ${nl(f.gQ, 2)}·ψ₀,S·S`,
          g: f.gGinf, wind: f.gQ, begeleidend: (psi) => r(f.gQ * psi.psi0),
        },
        {
          naam: `BGT karakteristiek 6.14b — ${gv.naam} leidend`, type: "sls",
          formule: "G + W + ψ₀,Q·Q + ψ₀,S·S",
          g: 1.0, wind: 1.0, begeleidend: (psi) => psi.psi0,
        },
        {
          // 6.15b met wind leidend (ψ₁,W = 0,2): de scheurwijdte van beton
          // leest de frequente combinatie, en zonder deze regel zou een
          // gegenereerde windlast daar nooit in voorkomen.
          naam: `BGT frequent 6.15b — ${gv.naam} leidend`, type: "sls",
          formule: "G + ψ₁,W·W + ψ₂,Q·Q + ψ₂,S·S",
          g: 1.0, wind: psiKlimaat("wind", bijlage).psi1, begeleidend: (psi) => psi.psi2,
        },
      ];
      for (const s of sets) {
        for (const o of begeleidendeOpstellingen(eigen, "W", s.begeleidend, bijlage)) {
          const zonder = o.zonder.map((d) => d.naam).join(", ");
          combinaties.push({
            naam: WIND_COMBI_PREFIX + s.naam + (zonder ? `, zonder ${zonder}` : ""),
            type: s.type,
            formule: `${s.formule}${zonder ? ` (zonder ${zonder})` : ""}   [${bron}]`,
            factorenPerCaseId: [
              ...G.map((id) => [id, s.g] as [number, number]),
              ...o.factoren,
            ],
            windSleutel: gv.sleutel,
            windFactor: s.wind,
            ...(gv.mee.length > 0 ? { windMeeSleutels: gv.mee } : {}),
          });
        }
      }
    }
  }
  return combinaties;
}

/**
 * De windbelastingen waarvan de combinatiebouw er per combinatie één laat
 * leiden. Bij een gebouw: elk gegenereerd geval op zich, zoals altijd.
 *
 * VRIJSTAAND DAK MET WRIJVING OF KOLOMWIND (issue #26). De wrijving (§7.3(7),
 * §7.5) en de wind op de kolommen (§7.6/§7.7) van één richting staan samen in
 * één horizontaal geval per richting. Ze werken tegelijk met de druk op het
 * dak bij diezelfde wind (§5.3(3): de krachten uit één windrichting samen).
 * Het horizontale geval gaat daarom mee in elke variant met een dakgeval van
 * dezelfde richting, en leidt nooit alleen — anders ontbrak in die combinatie
 * de dakdruk van diezelfde wind:
 *  - c_f van een lessenaarsdak heeft een richting (aangrijpingspunt op d/4
 *    van de loefrand, figuur 7.16; sleutel `cf:max|min:links|rechts`): alleen
 *    het horizontale geval van die richting;
 *  - c_p,net, en c_f van een zadel- of kieldak, gelden voor alle richtingen
 *    (§7.3(3)): een variant met het geval van links en een met dat van
 *    rechts. Bij het zadeldak betekenen `links`/`rechts` in de sleutel het
 *    dakvlak, niet de wind; het zadeldak is te herkennen aan het geval
 *    `cf:…:beide`, dat alleen tabel 7.7 kent.
 *
 * WAAROM IN DE COMBINATIEBOUW EN NIET IN DE GEVALLEN. De lasten van de
 * dakgevallen blijven bit-identiek, het horizontale geval houdt zijn eigen
 * afleiding in lastentabel en tekening, er ontstaan geen dubbele gevallen
 * voor links en rechts, en de combinaties blijven af te leiden uit alleen de
 * sleutels en namen van de gevallen (`windCombinatiesVoor` houdt ze daarmee bij
 * na een nieuw belastinggeval). Zonder horizontaal geval is de uitkomst precies
 * die van vóór issue #26. Dubbeltelling kan niet: elke variant bevat hooguit
 * één horizontaal geval, en dat één keer.
 */
export function windVarianten(
  windGevallen: readonly { sleutel: string; naam: string }[],
): { sleutel: string; naam: string; mee: string[] }[] {
  const horizontaal = new Map<string, { sleutel: string; naam: string }>();
  for (const g of windGevallen) {
    const m = HORIZONTAAL_SLEUTEL.exec(g.sleutel);
    if (m) horizontaal.set(m[1], g);
  }
  if (horizontaal.size === 0) return windGevallen.map((g) => ({ sleutel: g.sleutel, naam: g.naam, mee: [] }));
  const zadel = windGevallen.some((g) => /^luifel:cf:(max|min):beide$/.test(g.sleutel));
  const NAAM_KOP = "Wind vrijstaand dak ";
  const uit: { sleutel: string; naam: string; mee: string[] }[] = [];
  for (const g of windGevallen) {
    if (HORIZONTAAL_SLEUTEL.test(g.sleutel)) continue;
    if (!g.sleutel.startsWith(VRIJSTAAND_SLEUTEL_PREFIX)) {
      uit.push({ sleutel: g.sleutel, naam: g.naam, mee: [] });
      continue;
    }
    const eigen = zadel ? null : (/^luifel:cf:(?:max|min):(links|rechts)$/.exec(g.sleutel)?.[1] ?? null);
    let ontbreekt = false;
    for (const richting of eigen !== null ? [eigen] : ["links", "rechts"]) {
      const h = horizontaal.get(richting);
      if (!h) { ontbreekt = true; continue; }
      // "Wind vrijstaand dak wrijving + kolommen, van links" ⇒ "wrijving + kolommen";
      // de richting komt achteraan als het dakgeval hem nog niet noemt.
      const achter = `, van ${richting}`;
      let deel = h.naam.startsWith(NAAM_KOP) ? h.naam.slice(NAAM_KOP.length) : h.naam;
      if (deel.endsWith(achter)) deel = deel.slice(0, -achter.length);
      uit.push({
        sleutel: g.sleutel,
        naam: `${g.naam} + ${deel}${eigen === null ? achter : ""}`,
        mee: [h.sleutel],
      });
    }
    // Het horizontale geval van een richting ontbreekt in het model (met de
    // hand verwijderd): dan het dakgeval eenmaal zonder, zoals vóór issue #26,
    // in plaats van het stil weg te laten.
    if (ontbreekt) uit.push({ sleutel: g.sleutel, naam: g.naam, mee: [] });
  }
  return uit;
}

// ── Handtekening voor idempotentie ───────────────────────────────────────

/**
 * Canonieke handtekening van een generatie-uitkomst. Twee generaties met
 * dezelfde handtekening zijn inhoudelijk identiek; de store schrijft dan
 * NIETS weg en er volgt dus ook geen nieuwe berekening. Id's doen bewust niet
 * mee (die kent de generator niet), afgeronde getallen wel.
 */
export function handtekeningVanGeneratie(
  gevallen: { sleutel: string; naam: string }[],
  lasten: GegenereerdeLast[],
  combinaties: { naam: string; type: string; windSleutel: string; windFactor: number; windMeeSleutels?: string[]; factorenPerCaseId: [number, number][] }[],
): string {
  const r = (v: number) => Number(v.toPrecision(12)).toString();
  const g = gevallen.map((c) => `${c.sleutel}|${c.naam}`).join(";");
  // De omschrijving telt mee wanneer hij er is (vrijstaand dak): een andere
  // φ of α met toevallig dezelfde getallen moet de tekst in het rapport ook
  // bijwerken. Zonder omschrijving blijft de handtekening zoals hij was.
  const l = lasten
    .map((x) => `${x.gevalSleutel}|${x.beamId}|${r(x.q)}|${x.startFrac !== undefined ? r(x.startFrac) : "-"}|${x.endFrac !== undefined ? r(x.endFrac) : "-"}${x.omschrijving !== undefined ? `|${x.omschrijving}` : ""}${x.richting !== undefined ? `|${x.richting}` : ""}`)
    .join(";");
  const c = combinaties
    // Samengaande windgevallen (issue #26) gesorteerd achter elkaar; met één
    // windgeval staat er alleen die sleutel, zoals vóór die uitbreiding.
    .map((x) => `${x.naam}|${x.type}|${[x.windSleutel, ...(x.windMeeSleutels ?? [])].sort().join("+")}|${r(x.windFactor)}|${[...x.factorenPerCaseId].sort((p, q) => p[0] - q[0]).map(([id, f]) => `${id}:${r(f)}`).join(",")}`)
    .join(";");
  return `G[${g}]L[${l}]C[${c}]`;
}

/** Handtekening van wat er OP DIT MOMENT in het model staat (vergelijkbaar). */
export function handtekeningVanModel(
  loadCases: LoadCase[],
  loads: Load[],
  combinaties: { id: number; name: string; type: string; factors: Map<number, number> }[],
): string {
  const gevallen = loadCases
    .filter((c) => c.gegenereerd?.bron === "wind")
    .map((c) => ({ id: c.id, sleutel: c.gegenereerd!.sleutel, naam: c.name }));
  const sleutelVanId = new Map(gevallen.map((c) => [c.id, c.sleutel]));
  const gegenereerdeIds = new Set(gevallen.map((c) => c.id));
  const gLasten: GegenereerdeLast[] = loads
    .filter((l) => l.gegenereerdDoor === "wind")
    .map((l) => ({
      gevalSleutel: sleutelVanId.get(l.caseId) ?? `?${l.caseId}`,
      beamId: l.beamId ?? -1,
      q: l.q ?? 0,
      startFrac: l.startFrac,
      endFrac: l.endFrac,
      toelichting: "",
      // Alleen bij de gevallen van een vrijstaand dak — daar schrijft de
      // generator zelf een omschrijving; een omschrijving die de gebruiker bij
      // een gegenereerde gebouwlast zette, verandert de handtekening niet.
      ...(l.omschrijving !== undefined && (sleutelVanId.get(l.caseId) ?? "").startsWith(VRIJSTAAND_SLEUTEL_PREFIX)
        ? { omschrijving: l.omschrijving } : {}),
      // Een axiale windlast (wrijving langs het dak) is een andere last dan
      // een loodrechte met hetzelfde getal.
      ...(l.qDir === "x" ? { richting: "axiaal" as const } : {}),
    }));
  const gCombi = combinaties
    .filter((c) => c.name.startsWith(WIND_COMBI_PREFIX))
    .map((c) => {
      const windEntries = [...c.factors.entries()].filter(([id]) => gegenereerdeIds.has(id));
      const windEntry = windEntries[0];
      return {
        naam: c.name, type: c.type,
        windSleutel: windEntry ? (sleutelVanId.get(windEntry[0]) ?? "?") : "",
        // Samengaande windgevallen hebben dezelfde factor; wijkt er een af,
        // dan klopt de handtekening bewust niet (NaN).
        windFactor: windEntry ? (windEntries.every(([, f]) => f === windEntry[1]) ? windEntry[1] : Number.NaN) : 0,
        ...(windEntries.length > 1
          ? { windMeeSleutels: windEntries.slice(1).map(([id]) => sleutelVanId.get(id) ?? "?") } : {}),
        factorenPerCaseId: [...c.factors.entries()]
          .filter(([id]) => !gegenereerdeIds.has(id)) as [number, number][],
      };
    });
  return handtekeningVanGeneratie(gevallen.map((c) => ({ sleutel: c.sleutel, naam: c.naam })), gLasten, gCombi);
}
