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
  berekenE, berekenStuwdruk, handmatigeStuwdruk, cpeWand,
  CPE_PLAT_DAK, CPE_PLAT_DAK_BRON, CPI_BRON, CPI_ONBEKEND, CPE10_BRON,
  CPE10_MIN_OPPERVLAK_M2, CSCD_BRON, CSCD_GRENSHOOGTE_M, MELDING_ZONE_I,
  TABEL_71_BRON, ZMAX_M,
  type StuwdrukResultaat, type TerreinCategorie, type Windgebied,
} from "./windEurocode";

// ── Instellingen ─────────────────────────────────────────────────────────

export type Windrichting = "links" | "rechts" | "haaks";

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
}

export interface WindSamenvatting {
  hoogte_m: number;
  spanwijdte_m: number;
  hOverD: number;
  belastingbreedte_m: number;
  stuwdruk: StuwdrukResultaat;
  /** Per belastinggeval de vlakken met hun vormfactoren. */
  perGeval: { sleutel: string; naam: string; regels: VlakRegel[] }[];
}

export interface WindGeneratieResultaat {
  /** false ⇒ er is NIETS gegenereerd; zie de meldingen met niveau "fout". */
  ok: boolean;
  meldingen: WindMelding[];
  gevallen: GegenereerdGeval[];
  lasten: GegenereerdeLast[];
  combinaties: GegenereerdeCombinatie[];
  samenvatting: WindSamenvatting | null;
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────

const nl = (v: number, d: number) => v.toFixed(d).replace(".", ",");

const RICHTING_LABEL: Record<Windrichting, string> = {
  links: "wind van links",
  rechts: "wind van rechts",
  haaks: "wind haaks op het spant",
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
}

/**
 * ψ₀-factoren voor de gegenereerde combinaties.
 * Bron: NEN-EN 1990 tabel A1.1.
 *   • wind op gebouwen                              ψ₀ = 0,6
 *   • opgelegde belasting gebouwen, categorie A–D   ψ₀ = 0,7
 *   • sneeuw, plaatsen op hoogte H ≤ 1000 m         ψ₀ = 0,5
 * Belastingfactoren: γ_G,sup = 1,35 (6.10a) resp. 1,20 (6.10b) en γ_Q = 1,50
 * volgens NEN-EN 1990 tabel A1.2(B); γ_G,inf = 0,90 volgens tabel A1.2(A)
 * (EQU) voor het gunstig werkende eigen gewicht bij opwaartse wind.
 */
const PSI0 = { wind: 0.6, veranderlijk: 0.7, sneeuw: 0.5 } as const;
const PSI0_BRON = "NEN-EN 1990 tabel A1.1";
const GAMMA_BRON = "NEN-EN 1990 tabel A1.2(B) (6.10a/6.10b) en tabel A1.2(A) (EQU)";

/** Naamvoorvoegsel waaraan gegenereerde combinaties herkenbaar zijn. */
export const WIND_COMBI_PREFIX = "Wind-gen · ";

export function genereerWindbelasting(
  model: WindModelInvoer,
  inst: WindInstellingen,
): WindGeneratieResultaat {
  const meldingen: WindMelding[] = [];
  const fout = (tekst: string): WindGeneratieResultaat => {
    meldingen.push({ niveau: "fout", tekst });
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null };
  };

  // ── Geometrie ──────────────────────────────────────────────────────────
  if (model.nodes.length < 2 || model.beams.length === 0) {
    return fout("Er is nog geen constructie om wind op te zetten.");
  }
  const geos = model.beams
    .map((b) => staafGeo(b, model.nodes))
    .filter((g): g is StaafGeo => g !== null)
    .sort((a, b) => a.beam.id - b.beam.id); // vaste volgorde ⇒ deterministisch

  const zs = model.nodes.map((n) => n.z);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const h_m = (maxZ - minZ) / 1000;
  if (h_m <= 0) return fout("De constructie heeft geen hoogte — wind is niet te bepalen.");

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

  if (gevelL.length === 0 && gevelR.length === 0) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "Geen enkele staaf heeft het belastingtype linker- of rechtergevel. " +
        "Controleer de belastingtypen in de staafeigenschappen — zonder gevelvlak " +
        "krijgt het spant geen horizontale windbelasting.",
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

  const heeftHellendDak = geos.some((g) => g.rol === "dakHellend");
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
  if (stuwdruk.handmatig) {
    meldingen.push({
      niveau: "info",
      tekst: `De stuwdruk is handmatig opgegeven (${nl(stuwdruk.qp_kNm2, 3)} kN/m²); ` +
        "de generator heeft hem niet zelf afgeleid.",
    });
  } else {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "De stuwdruk is berekend met de ruwheidslengtes uit EN 1991-1-4 tabel 4.1. " +
        "De Nederlandse nationale bijlage geeft de extreme stuwdruk ook rechtstreeks " +
        "in tabelvorm per windgebied, terreinsoort en hoogte; die waarde kan " +
        "afwijken. Houdt u die tabel aan, kies dan “stuwdruk handmatig” en voer de " +
        "waarde uit de nationale bijlage in.",
    });
  }
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
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null };
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
  const combinaties: GegenereerdeCombinatie[] = [];
  if (inst.combinatiesGenereren) {
    const eigen = model.loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
    const G = eigen.filter((c) => c.type === "dead").map((c) => c.id);
    const Q = eigen.filter((c) => c.type === "live").map((c) => c.id);
    const S = eigen.filter((c) => c.type === "snow").map((c) => c.id);
    const overig = eigen.filter((c) => c.type === "other");
    if (overig.length > 0) {
      meldingen.push({
        niveau: "waarschuwing",
        tekst: `De belastinggevallen ${overig.map((c) => `“${c.name}”`).join(", ")} hebben ` +
          "type “overig”. De generator kent daar geen ψ₀ bij en laat ze uit de " +
          "gegenereerde combinaties. Geef ze een type, of neem ze handmatig op.",
      });
    }
    const mix = (paren: [number[], number][]): [number, number][] =>
      paren.flatMap(([ids, f]) => ids.map((id) => [id, f] as [number, number]));

    for (const gv of gevallen) {
      const sets: {
        naam: string; type: "uls" | "sls"; formule: string;
        wind: number; g: number; q: number; s: number;
      }[] = [
        {
          naam: `UGT 6.10a — ${gv.naam}`, type: "uls",
          formule: "1,35·G + 1,5·ψ₀,W·W + 1,5·ψ₀,Q·Q + 1,5·ψ₀,S·S",
          g: 1.35, wind: 1.5 * PSI0.wind, q: 1.5 * PSI0.veranderlijk, s: 1.5 * PSI0.sneeuw,
        },
        {
          naam: `UGT 6.10b — ${gv.naam} leidend`, type: "uls",
          formule: "1,2·G + 1,5·W + 1,5·ψ₀,Q·Q + 1,5·ψ₀,S·S",
          g: 1.2, wind: 1.5, q: 1.5 * PSI0.veranderlijk, s: 1.5 * PSI0.sneeuw,
        },
        {
          naam: `UGT EQU — ${gv.naam}, gunstig eigen gewicht`, type: "uls",
          formule: "0,9·G + 1,5·W",
          g: 0.9, wind: 1.5, q: 0, s: 0,
        },
        {
          naam: `BGT karakteristiek — ${gv.naam} leidend`, type: "sls",
          formule: "G + W + ψ₀,Q·Q + ψ₀,S·S",
          g: 1.0, wind: 1.0, q: PSI0.veranderlijk, s: PSI0.sneeuw,
        },
      ];
      for (const s of sets) {
        combinaties.push({
          naam: WIND_COMBI_PREFIX + s.naam,
          type: s.type,
          formule: `${s.formule}   [${GAMMA_BRON}; ψ₀ uit ${PSI0_BRON}]`,
          factorenPerCaseId: mix([[G, s.g], [Q, s.q], [S, s.s]]).filter(([, f]) => f !== 0),
          windSleutel: gv.sleutel,
          windFactor: s.wind,
        });
      }
    }
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "De gegenereerde combinaties passen de betrouwbaarheidsfactor K_FI van de " +
        "gevolgklasse NIET toe — net als de standaardcombinaties van dit programma. " +
        "Bij gevolgklasse CC3 moet u de factoren zelf verhogen.",
    });
  }

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
  };
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
  combinaties: { naam: string; type: string; windSleutel: string; windFactor: number; factorenPerCaseId: [number, number][] }[],
): string {
  const r = (v: number) => Number(v.toPrecision(12)).toString();
  const g = gevallen.map((c) => `${c.sleutel}|${c.naam}`).join(";");
  const l = lasten
    .map((x) => `${x.gevalSleutel}|${x.beamId}|${r(x.q)}|${x.startFrac !== undefined ? r(x.startFrac) : "-"}|${x.endFrac !== undefined ? r(x.endFrac) : "-"}`)
    .join(";");
  const c = combinaties
    .map((x) => `${x.naam}|${x.type}|${x.windSleutel}|${r(x.windFactor)}|${[...x.factorenPerCaseId].sort((p, q) => p[0] - q[0]).map(([id, f]) => `${id}:${r(f)}`).join(",")}`)
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
    }));
  const gCombi = combinaties
    .filter((c) => c.name.startsWith(WIND_COMBI_PREFIX))
    .map((c) => {
      const windEntry = [...c.factors.entries()].find(([id]) => gegenereerdeIds.has(id));
      return {
        naam: c.name, type: c.type,
        windSleutel: windEntry ? (sleutelVanId.get(windEntry[0]) ?? "?") : "",
        windFactor: windEntry ? windEntry[1] : 0,
        factorenPerCaseId: [...c.factors.entries()]
          .filter(([id]) => !gegenereerdeIds.has(id)) as [number, number][],
      };
    });
  return handtekeningVanGeneratie(gevallen.map((c) => ({ sleutel: c.sleutel, naam: c.naam })), gLasten, gCombi);
}
