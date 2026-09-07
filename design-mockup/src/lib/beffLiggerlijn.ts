/**
 * beffLiggerlijn.ts — de liggerlijn van een betonstaaf uit het model afleiden,
 * zodat de kern er l₀ en b_eff uit kan bepalen (NEN-EN 1992-1-1 art. 5.3.2.1).
 *
 * WAAROM DIT HIER STAAT EN NIET IN DE KERN
 * De rekengang van 5.3.2.1 staat in de crate-lib
 * (`src-tauri/crates/nen-en-1992-1-1/src/beff.rs`) en is langs alle drie de
 * wegen bereikbaar (Tauri-command, toetsbrug, MCP-server). Die rekengang kent
 * ALLEEN de norm: haar invoer is een rij overspanningen met de twee uiteinden,
 * precies wat figuur 5.2 tekent. Wat zij niet kan weten is welke staven samen
 * één doorgaande ligger vormen en waar die op steunpunten rust — dat is
 * modeltopologie, en die zit in knopen, staven en opleggingen. Die staan
 * alleen hier. Vandaar de grens: topologie → liggerlijn hier, liggerlijn →
 * b_eff in de kern.
 *
 * Er wordt hier dus NIETS uit 5.3.2.1 gerekend. Geen tweede implementatie van
 * (5.7) in TypeScript: dan zou dezelfde doorsnede twee plausibele breedtes
 * kunnen krijgen.
 *
 * WAT EEN STEUNPUNT IS
 * Een knoop langs de lijn geldt als steunpunt zodra hij de dwarsverplaatsing
 * van de ligger tegenhoudt. Dat is het geval bij:
 *
 *  1. een oplegging die de richting LOODRECHT op de staafas vasthoudt, of
 *  2. een andere staaf die op die knoop aansluit en niet tot de liggerlijn
 *     hoort — in een portaal is dát het steunpunt, want daar staat geen
 *     oplegging (die zit onder aan de kolom).
 *
 * Alleen naar `supports` kijken zou in elk portaal de kolommen missen en de
 * hele ligger als één vrij overspannende balk lezen: één veldgebied, geen
 * steunpuntgebied, dus overal de grootste b_eff. Dat is precies de onveilige
 * kant.
 *
 * WAT GEEN STEUNPUNT IS
 * Een knoop waar de ligger alleen is doorgeknipt — dezelfde richting, hetzelfde
 * profiel, hetzelfde materiaal, verder niets aangesloten — is een maasknoop en
 * geen steunpunt. Die knopen worden juist samengevoegd tot één overspanning.
 *
 * WEIGEREN IN PLAATS VAN GOKKEN
 * Een onduidelijke topologie levert een reden en geen liggerlijn. Een verkeerde
 * b_eff is onzichtbaar en stuurt naast de sterkte ook I_c, M_cr en de tweede
 * orde, dus een aanname op deze plek is duurder dan een melding.
 */
import type { Beam, BeamReleases, Node, Support } from "../components/fem/femTypes";
import type { BeamLine } from "./types/concrete/BeamLine";
import type { BeffApplied } from "./types/concrete/BeffApplied";
import type { BeffZone } from "./types/concrete/BeffZone";
import type { EffectiveFlangeWidthResponse } from "./types/concrete/EffectiveFlangeWidthResponse";
import type { LineEnd } from "./types/concrete/LineEnd";
import { matchSupportedConcreteClass, parseConcreteSection } from "./betonCheckBuilder";

/** Richtingstolerantie op het uitwendig product van twee eenheidsrichtingen. */
const COLLINEAIR_TOL = 1e-6;
/** Ondergrens waaronder een richtingscomponent als nul telt. */
const RICHTING_TOL = 1e-9;

/** Eén staaf binnen de liggerlijn, met zijn plaats langs die lijn. */
export interface LiggerlijnStaaf {
  beamId: number;
  /** Afstand langs de lijn waar deze staaf begint, mm. */
  offsetMm: number;
  lengthMm: number;
  /**
   * Loopt de staaf van `from` naar `to` mee met de lijnrichting? Zo niet, dan
   * is de lokale x van de staaf gespiegeld ten opzichte van de lijn.
   */
  meeMetDeLijn: boolean;
}

export interface Liggerlijn {
  /** De staven op volgorde langs de lijn. */
  staven: LiggerlijnStaaf[];
  /** De knopen op volgorde langs de lijn (staven.length + 1 stuks). */
  knopen: number[];
  /**
   * De knopen die als steunpunt gelden, inclusief de twee uiteinden. De
   * overspanningen in `line.spans_mm` liggen tussen deze knopen.
   */
  steunpuntKnopen: number[];
  /** Wat de kern nodig heeft: de overspanningen plus de twee uiteinden. */
  line: BeamLine;
  /** Totale lengte van de lijn, mm. */
  totaleLengteMm: number;
  /** Keuzes en waarnemingen die de lezer moet kunnen nagaan. */
  meldingen: string[];
}

export type LiggerlijnResultaat =
  | { ok: true; lijn: Liggerlijn }
  | { ok: false; reden: string };

export interface BeffModelData {
  nodes: Node[];
  beams: Beam[];
  /**
   * De opleggingen. VERPLICHT: zonder de opleggingen is een tussensteunpunt
   * niet van een maasknoop te onderscheiden, en dan zou de hele ligger als één
   * overspanning worden gelezen — de onveilige kant. Een lege lijst is een
   * geldig model (een portaal ontleent zijn steunpunten aan de kolommen),
   * `undefined` is dat niet.
   */
  supports: Support[];
}

// ── Kleine meetkunde ────────────────────────────────────────────────────────

function knoop(nodes: Node[], id: number): Node | undefined {
  return nodes.find((n) => n.id === id);
}

/** Eenheidsrichting van een staaf, of `null` als de knopen ontbreken/samenvallen. */
export function staafRichting(
  beam: Beam,
  nodes: Node[],
): { x: number; z: number } | null {
  const a = knoop(nodes, beam.from);
  const b = knoop(nodes, beam.to);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  if (l <= 0) return null;
  return { x: dx / l, z: dz / l };
}

function staafLengteMm(beam: Beam, nodes: Node[]): number {
  const a = knoop(nodes, beam.from);
  const b = knoop(nodes, beam.to);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function collineair(
  d1: { x: number; z: number },
  d2: { x: number; z: number },
): boolean {
  return Math.abs(d1.x * d2.z - d1.z * d2.x) <= COLLINEAIR_TOL;
}

function zelfdeDoorsnede(a: Beam, b: Beam): boolean {
  return (a.profile ?? "") === (b.profile ?? "") && (a.material ?? "") === (b.material ?? "");
}

// ── Opleggingen ─────────────────────────────────────────────────────────────

/** Houdt deze opleggingsoort de globale x-richting vast? */
function houdtXVast(type: Support["type"]): boolean {
  return type === "pinned" || type === "fixed" || type === "xRoller" || type === "xSpring";
}

/** Houdt deze opleggingsoort de globale z-richting vast? */
function houdtZVast(type: Support["type"]): boolean {
  return type === "pinned" || type === "fixed" || type === "zRoller" || type === "zSpring";
}

/** Houdt deze opleggingsoort de hoekverdraaiing vast? */
function houdtRotatieVast(type: Support["type"]): boolean {
  return type === "fixed" || type === "rotSpring";
}

/**
 * Houdt de oplegging de richting LOODRECHT op de staafas vast? Voor een
 * horizontale ligger is dat z, voor een kolom x, en voor een schuine staaf
 * telt elke vastgehouden richting mee die een component loodrecht op de as
 * heeft.
 */
function houdtDwarsVast(
  support: Support,
  richting: { x: number; z: number },
): boolean {
  // Loodrecht op (dx, dz) staat (−dz, dx).
  const loodX = -richting.z;
  const loodZ = richting.x;
  if (houdtXVast(support.type) && Math.abs(loodX) > RICHTING_TOL) return true;
  if (houdtZVast(support.type) && Math.abs(loodZ) > RICHTING_TOL) return true;
  return false;
}

// ── De keten van collineaire staven ─────────────────────────────────────────

interface Keten {
  beamIds: number[];
  /** knopen.length === beamIds.length + 1 */
  knopen: number[];
}

/**
 * Alle staven die met `start` één doorgaande ligger vormen: dezelfde richting
 * (of exact tegengesteld), hetzelfde profiel en hetzelfde materiaal. De keten
 * loopt WÉL door over een steunpunt heen — dat is juist het geval van figuur
 * 5.2 — en stopt bij een knik, een andere doorsnede of een vrij einde.
 */
function bouwKeten(start: Beam, data: BeffModelData): Keten | { reden: string } {
  const richting = staafRichting(start, data.nodes);
  if (!richting) {
    return { reden: `staaf ${start.id} heeft geen lengte of mist een knoop` };
  }

  const beamIds = [start.id];
  const knopen = [start.from, start.to];
  const gebruikt = new Set<number>([start.id]);

  // Vooruit vanaf het laatste knooppunt, daarna achteruit vanaf het eerste.
  for (const vooruit of [true, false]) {
    for (;;) {
      const rand = vooruit ? knopen[knopen.length - 1] : knopen[0];
      const kandidaten = data.beams.filter((b) => {
        if (gebruikt.has(b.id)) return false;
        if (b.from !== rand && b.to !== rand) return false;
        if (!zelfdeDoorsnede(b, start)) return false;
        const d = staafRichting(b, data.nodes);
        return d !== null && collineair(richting, d);
      });
      if (kandidaten.length === 0) break;
      if (kandidaten.length > 1) {
        return {
          reden:
            `op knoop ${rand} sluiten ${kandidaten.length} staven in het verlengde aan ` +
            `(${kandidaten.map((b) => b.id).join(", ")}) met hetzelfde profiel en materiaal; ` +
            "welke de ligger voortzet is niet te bepalen",
        };
      }
      const volgende = kandidaten[0];
      const anderEind = volgende.from === rand ? volgende.to : volgende.from;
      if (knopen.includes(anderEind)) {
        return {
          reden: `de staven ${[...beamIds, volgende.id].join(", ")} vormen een gesloten lus; een liggerlijn heeft twee uiteinden`,
        };
      }
      gebruikt.add(volgende.id);
      if (vooruit) {
        beamIds.push(volgende.id);
        knopen.push(anderEind);
      } else {
        beamIds.unshift(volgende.id);
        knopen.unshift(anderEind);
      }
    }
  }

  return { beamIds, knopen };
}

// ── Steunpunten en uiteinden ────────────────────────────────────────────────

/** Staven die op deze knoop aansluiten maar niet tot de liggerlijn horen. */
function aansluitendeVreemdeStaven(
  knoopId: number,
  keten: Keten,
  beams: Beam[],
): number[] {
  const vanDeLijn = new Set(keten.beamIds);
  return beams
    .filter((b) => !vanDeLijn.has(b.id) && (b.from === knoopId || b.to === knoopId))
    .map((b) => b.id);
}

/** Is de hoekverdraaiing van deze staaf aan dit uiteinde vrijgelaten? */
function scharnierAanEind(releases: BeamReleases | undefined, bijFrom: boolean): boolean {
  if (!releases) return false;
  return bijFrom ? releases.startRy === true : releases.endRy === true;
}

// ── De hoofdfunctie ─────────────────────────────────────────────────────────

/**
 * De liggerlijn waar staaf `beamId` deel van uitmaakt, in de vorm die de kern
 * verwacht. Levert bij een onduidelijke topologie een reden en geen lijn.
 */
export function bepaalLiggerlijn(
  beamId: number,
  data: BeffModelData,
): LiggerlijnResultaat {
  const start = data.beams.find((b) => b.id === beamId);
  if (!start) return { ok: false, reden: `staaf ${beamId} bestaat niet in het model` };

  const richting = staafRichting(start, data.nodes);
  if (!richting) {
    return { ok: false, reden: `staaf ${beamId} heeft geen lengte of mist een knoop` };
  }

  const keten = bouwKeten(start, data);
  if ("reden" in keten) return { ok: false, reden: keten.reden };

  const meldingen: string[] = [];

  // Staven met hun plaats langs de lijn.
  const staven: LiggerlijnStaaf[] = [];
  let offset = 0;
  for (let i = 0; i < keten.beamIds.length; i++) {
    const b = data.beams.find((s) => s.id === keten.beamIds[i])!;
    const lengte = staafLengteMm(b, data.nodes);
    if (lengte <= 0) {
      return { ok: false, reden: `staaf ${b.id} in de liggerlijn heeft lengte 0` };
    }
    staven.push({
      beamId: b.id,
      offsetMm: offset,
      lengthMm: lengte,
      meeMetDeLijn: b.from === keten.knopen[i],
    });
    offset += lengte;
  }
  const totaleLengteMm = offset;

  // Positie van elke knoop langs de lijn.
  const knoopPositie = new Map<number, number>();
  knoopPositie.set(keten.knopen[0], 0);
  for (let i = 0; i < staven.length; i++) {
    knoopPositie.set(keten.knopen[i + 1], staven[i].offsetMm + staven[i].lengthMm);
  }

  const opleggingBij = (id: number) => data.supports.filter((s) => s.nodeId === id);

  // Binnenknopen indelen: steunpunt of maasknoop.
  const steunpuntKnopen: number[] = [keten.knopen[0]];
  for (let i = 1; i < keten.knopen.length - 1; i++) {
    const id = keten.knopen[i];
    const dwars = opleggingBij(id).some((s) => houdtDwarsVast(s, richting));
    const vreemd = aansluitendeVreemdeStaven(id, keten, data.beams);
    if (dwars || vreemd.length > 0) {
      steunpuntKnopen.push(id);
      if (!dwars) {
        meldingen.push(
          `Knoop ${id} telt als tussensteunpunt omdat staaf ${vreemd.join(", ")} daar ` +
            "aansluit; er staat geen oplegging. In een raamwerk is dat de kolom die de " +
            "ligger draagt.",
        );
      }
    }
  }
  steunpuntKnopen.push(keten.knopen[keten.knopen.length - 1]);

  // De uiteinden.
  const eersteStaaf = data.beams.find((b) => b.id === keten.beamIds[0])!;
  const laatsteStaaf = data.beams.find((b) => b.id === keten.beamIds[keten.beamIds.length - 1])!;
  const startEind = bepaalUiteinde(
    keten.knopen[0],
    eersteStaaf,
    keten,
    data,
    richting,
    meldingen,
  );
  const eindEind = bepaalUiteinde(
    keten.knopen[keten.knopen.length - 1],
    laatsteStaaf,
    keten,
    data,
    richting,
    meldingen,
  );

  // Overspanningen tussen de steunpunten.
  const spans_mm: number[] = [];
  for (let i = 0; i < steunpuntKnopen.length - 1; i++) {
    const a = knoopPositie.get(steunpuntKnopen[i])!;
    const b = knoopPositie.get(steunpuntKnopen[i + 1])!;
    spans_mm.push(b - a);
  }

  // Nergens een steunpunt: dan zweeft de liggerlijn. Doorgeven aan de kern zou
  // een uitkraging-zonder-overspanning of "beide uiteinden vrij" opleveren;
  // hier is de reden concreter te maken.
  const heeftHouvast =
    startEind !== "Free" ||
    eindEind !== "Free" ||
    steunpuntKnopen.length > 2;
  if (!heeftHouvast) {
    return {
      ok: false,
      reden:
        `de liggerlijn (staaf ${keten.beamIds.join(", ")}) heeft nergens een steunpunt: ` +
        "geen oplegging die de dwarsrichting vasthoudt en geen aansluitende staaf. " +
        "Zonder steunpunten is er geen geval uit figuur 5.2",
    };
  }

  if (staven.length > 1) {
    meldingen.push(
      `De liggerlijn bestaat uit ${staven.length} staven (${keten.beamIds.join(", ")}) met ` +
        "hetzelfde profiel en materiaal in elkaars verlengde; l0 gaat over de hele lijn, " +
        "niet over de losse staafdelen.",
    );
  }

  return {
    ok: true,
    lijn: {
      staven,
      knopen: keten.knopen,
      steunpuntKnopen,
      line: { spans_mm, start: startEind, end: eindEind },
      totaleLengteMm,
      meldingen,
    },
  };
}

/**
 * Het buitenuiteinde van de liggerlijn indelen in de drie gevallen die de kern
 * kent.
 *
 * ```text
 *   dwars vastgehouden + hoekverdraaiing vrij   → "Support"     (figuur 5.2 links)
 *   dwars vastgehouden + momentvast             → "Restrained"  (inklemming/knoop)
 *   niets                                       → "Free"        (uitkraging)
 * ```
 *
 * Een scharnier in de staaf zelf (`releases.startRy`/`endRy`) maakt het
 * uiteinde momentvrij, ook als de knoop is ingeklemd: de staaf voelt die
 * inklemming dan niet.
 */
function bepaalUiteinde(
  knoopId: number,
  buitensteStaaf: Beam,
  keten: Keten,
  data: BeffModelData,
  richting: { x: number; z: number },
  meldingen: string[],
): LineEnd {
  const opleggingen = data.supports.filter((s) => s.nodeId === knoopId);
  const dwars = opleggingen.some((s) => houdtDwarsVast(s, richting));
  const rotatieVast = opleggingen.some((s) => houdtRotatieVast(s.type));
  const vreemd = aansluitendeVreemdeStaven(knoopId, keten, data.beams);
  const bijFrom = buitensteStaaf.from === knoopId;
  const scharnier = scharnierAanEind(buitensteStaaf.releases, bijFrom);

  if (!dwars && vreemd.length === 0) {
    return "Free";
  }
  if (scharnier) {
    // De staaf hangt scharnierend aan de knoop; het moment is er nul, precies
    // het linker steunpunt van figuur 5.2.
    return "Support";
  }
  if (rotatieVast) return "Restrained";
  if (vreemd.length > 0) {
    meldingen.push(
      `Knoop ${knoopId} is het uiteinde van de liggerlijn en momentvast, omdat staaf ` +
        `${vreemd.join(", ")} daar aansluit. Figuur 5.2 tekent alleen vrij opgelegde ` +
        "buitensteunpunten; de kern leest dit als een tussensteunpunt met één " +
        "aangrenzende overspanning en meldt dat.",
    );
    return "Restrained";
  }
  // Wel dwars vastgehouden, geen momentvastheid: het vrij opgelegde
  // buitensteunpunt van figuur 5.2.
  return "Support";
}

// ── Van staafstation naar lijnpositie ───────────────────────────────────────

/**
 * De plaats langs de liggerlijn (mm vanaf het lijnbegin) van een station dat
 * in de LOKALE coördinaat van één staaf is gegeven.
 *
 * Hiermee krijgt elk staafsegment de b_eff van het gebied waarin het ligt:
 * neem het midden van het segment, reken het hiermee om naar een lijnpositie
 * en vraag de kern welk gebied daar geldt.
 */
export function lijnPositieMm(
  lijn: Liggerlijn,
  beamId: number,
  xLokaalMm: number,
): number | null {
  const s = lijn.staven.find((v) => v.beamId === beamId);
  if (!s) return null;
  return s.meeMetDeLijn
    ? s.offsetMm + xLokaalMm
    : s.offsetMm + (s.lengthMm - xLokaalMm);
}

// ── De koppeling met de segmentindeling van de tweede orde ──────────────────

/** b_eff van één staafsegment, met de herkomst erbij. */
export interface SegmentBeff {
  /** Volgnummer van het segment, gelijk aan `SegmentStiffness.index`. */
  index: number;
  /** Plaats van het segmentmidden langs de liggerlijn, mm. */
  xLijnMm: number;
  /** Het gebied uit figuur 5.2 waarin dat midden valt. */
  zoneIndex: number;
  l0Mm: number;
  bEffMm: number;
  /**
   * Loopt er een gebiedsgrens (een momentnulpunt) DÓÓR dit segment heen? Dan
   * springt de werkelijke b_eff binnen het segment terwijl het segment er maar
   * één krijgt. De sprong wordt dan tot op één segmentlengte nauwkeurig
   * weergegeven; kleinere segmenten maken hem scherper.
   */
  grensBinnenSegment: boolean;
}

/**
 * De b_eff van elk segment van één staaf, uit de verdeling die de kern
 * teruggaf.
 *
 * WAAROM PER SEGMENTMIDDEN
 * De segmentindeling van de fysisch niet-lineaire tweede orde
 * (`concrete-check/src/segments.rs`) verdeelt elke staaf in gelijke stukken en
 * dwingt evenwicht en compatibiliteit af in het MIDDEN van elk segment
 * (5.8.6(6)). Die indeling moet onafhankelijk blijven van het belastinggeval
 * en van de doorsnede — anders verschuift de mesh per combinatie en zijn twee
 * ronden niet meer vergelijkbaar. Daarom wordt de indeling hier NIET
 * verschoven naar de momentnulpunten; elk segment krijgt de b_eff van het
 * gebied waarin zijn eigen maatgevende doorsnede ligt.
 *
 * De prijs staat in `grensBinnenSegment`: op de segmenten waar een
 * momentnulpunt doorheen loopt is de sprong in b_eff tot op één segmentlengte
 * nauwkeurig geplaatst. Bij de standaard 400 mm is dat op een overspanning van
 * 6 m ongeveer 7 %. Wie het scherper wil, verkleint de doelsegmentlengte.
 *
 * WAAROM DIT GEEN TWEEDE IMPLEMENTATIE VAN DE NORM IS
 * Alle getallen — l₀, b_eff, de gebiedsgrenzen — komen ONVERANDERD uit
 * `verdeling`, die de kern heeft gerekend. Wat hier gebeurt is een
 * intervalopzoeking: in welk gebied valt deze x. De regel bij een grens is
 * dezelfde als in `BeffDistribution::zone_at_mm`: het linker gebied wint. Op
 * een grens zijn beide gebieden even geldig — daar ligt juist het
 * momentnulpunt — maar de keuze moet vast zijn, zodat twee aanroepen niet
 * verschillen.
 */
export function beffPerStaafsegment(
  lijn: Liggerlijn,
  verdeling: { zones: BeffZone[]; total_length_mm: number },
  beamId: number,
  segmentMiddensLokaalMm: number[],
  segmentLengteMm: number,
): SegmentBeff[] | null {
  const staaf = lijn.staven.find((s) => s.beamId === beamId);
  if (!staaf || verdeling.zones.length === 0) return null;

  const eps = 1e-9 * Math.max(verdeling.total_length_mm, 1);
  const zoekZone = (x: number): number => {
    for (let i = 0; i < verdeling.zones.length; i++) {
      if (x <= verdeling.zones[i].zone.x_end_mm + eps) return i;
    }
    return verdeling.zones.length - 1;
  };

  return segmentMiddensLokaalMm.map((xLokaal, index) => {
    const xLijn = lijnPositieMm(lijn, beamId, xLokaal)!;
    const zoneIndex = zoekZone(xLijn);
    const z = verdeling.zones[zoneIndex];
    const halve = segmentLengteMm / 2;
    const links = zoekZone(Math.max(0, xLijn - halve));
    const rechts = zoekZone(Math.min(verdeling.total_length_mm, xLijn + halve));
    return {
      index,
      xLijnMm: xLijn,
      zoneIndex,
      l0Mm: z.zone.l0_mm,
      bEffMm: z.b_eff_mm,
      grensBinnenSegment: links !== zoneIndex || rechts !== zoneIndex,
    };
  });
}

// ── Van model naar één b_eff per staaf ─────────────────────────────────────

/** De aanroep van de rekenkern, zoals `roepKern` in `stores/checkStore`. */
export type RoepKern = <T>(opdracht: string, inputs?: unknown) => Promise<T>;

/** Wat er nodig is om b_eff af te leiden: de topologie plus de opleggingen. */
export interface BeffStavenInvoer {
  nodes: Node[];
  beams: Beam[];
  /** Zonder opleggingen is een tussensteunpunt niet te herkennen; dan geen b_eff. */
  supports?: Support[];
}

/**
 * Alles wat het rapport van de b_eff-afleiding van één staaf moet kunnen
 * laten zien.
 *
 * WAAROM DIT MEER IS DAN ÉÉN GETAL. De gebruiker voert 4300 mm flensbreedte in
 * en er wordt met 2780 mm gerekend. Alleen de uitkomst doorgeven maakt van dat
 * verschil een getal dat uit de lucht valt: de doorsnedenaam in het resultaat
 * noemt de 2780 wel, maar niet welk geval van figuur 5.2 gold, uit welke
 * overspanningen l₀ volgde, of welke van de drie grenzen van (5.7a)/(5.7b) won.
 * Die staan in `applied.deelstappen`, uitgeschreven door de KERN — hier wordt
 * niets van de norm gerekend en niets naverteld.
 *
 * JSON-VEILIG. Dit type reist in het rapportsnapshot mee naar een losgekoppeld
 * rapportvenster (`components/report/reportSync.ts`). Geen Maps, geen Sets,
 * geen klassen — anders staat dat venster met een lege afleiding terwijl de
 * hoofdsessie hem wél heeft.
 */
export type BeffStaafUitkomst = BeffStaafAfleiding | BeffStaafMislukt;

export interface BeffStaafAfleiding {
  ok: true;
  beamId: number;
  /** De b_eff waarmee werkelijk gerekend is, mm. */
  bEffMm: number;
  /** De flensbreedte zoals de gebruiker hem intikte, mm. */
  ingevoerdeBreedteMm: number;
  /** Lijfbreedte b_w, mm. */
  bWMm: number;
  /** De uitkragende flensdelen b_i, mm (figuur 5.3). */
  bIMm: number[];
  /** De liggerlijn zoals de kern hem heeft gekregen. */
  line: BeamLine;
  /** De staven die samen de liggerlijn vormen, op volgorde. */
  staafIds: number[];
  /** De knopen die als steunpunt tellen, inclusief de twee uiteinden. */
  steunpuntKnopen: number[];
  /**
   * Waarnemingen over de topologie: welke knoop als steunpunt telt en waarom,
   * en of de lijn uit meer dan één staaf bestaat. Horen woordelijk in het
   * rapport — zonder deze regels is niet na te gaan hoe de overspanningen tot
   * stand kwamen.
   */
  meldingen: string[];
  /** Plaats van het staafmidden langs de liggerlijn, mm. */
  xLijnMm: number;
  /** De verdeling per gebied, onveranderd uit de kern. */
  zones: BeffZone[];
  totaleLengteMm: number;
  /** Keuzes die de kern zelf meldde bij deze verdeling. */
  verdelingMeldingen: string[];
  /** Het aangehouden gebied met de uitgeschreven afleiding. */
  applied: BeffApplied | null;
}

export interface BeffStaafMislukt {
  ok: false;
  beamId: number;
  /**
   * Waarom er geen b_eff is afgeleid. Stond vroeger alleen in de console; een
   * rapport dat de ingevoerde breedte gebruikt zonder te zeggen dát de
   * afleiding niet lukte, verzwijgt de belangrijkste mededeling.
   */
  reden: string;
  /** De breedte waarmee dan gerekend wordt: de ingevoerde flensbreedte, mm. */
  ingevoerdeBreedteMm: number;
}

/**
 * De b_eff-afleiding per T- of L-staaf (5.3.2.1).
 *
 * DRIE STAPPEN, EN GEEN ERVAN HIER GEREKEND
 *  1. `bepaalLiggerlijn` hierboven leidt uit knopen, staven en opleggingen af
 *     welke staven één doorgaande ligger vormen en waar de steunpunten
 *     liggen — de liggerlijn van figuur 5.2. Alleen topologie.
 *  2. De KERN rekent daaruit b_eff per gebied ((5.7), (5.7a), (5.7b)) via
 *     `concrete_effective_flange_width`, langs dezelfde weg als de toetsing,
 *     én schrijft de afleiding uit voor de plaats die hier wordt meegegeven.
 *  3. Hier wordt alleen die plaats gekozen: het MIDDEN van de staaf.
 *     5.3.2.1(4) staat een constante breedte over de overspanning toe en zegt
 *     dat de waarde van de VELDdoorsnede moet worden aangehouden; het midden
 *     van de staaf is de plaats die daar het dichtst bij ligt zonder aan te
 *     nemen welk deel van de lijn "het veld" is.
 *
 * WAAROM ÉÉN WAARDE PER STAAF EN NIET PER SEGMENT. `beffPerStaafsegment`
 * hierboven kan de verdeling wél per segment leveren, maar zowel
 * `ConcreteBeamCheckInput` als `SegmentStiffnessRequest` draagt één doorsnede
 * per staaf. Een b_eff die binnen de staaf springt, past dus niet in het
 * huidige contract; dat is een aparte stap en geen stille aanname hier. De
 * hele verdeling reist wél mee in `zones`, zodat het rapport kan laten zien
 * hoeveel het scheelt.
 *
 * DE UITKRAGENDE FLENSDELEN. De profielnaam draagt de flensbreedte b_f en de
 * lijfbreedte b_w, dus b_i volgt daaruit: bij een T twee keer (b_f − b_w)/2,
 * bij een L één keer b_f − b_w. Dat is figuur 5.3 met de maten die de
 * gebruiker heeft opgegeven; er wordt geen naastliggend lijf verzonnen.
 *
 * Lukt een staaf niet — geen opleggingen, geen liggerlijn, een topologie
 * buiten figuur 5.2, een kern die het verzoek weigert — dan komt hij als
 * `ok: false` MÉT reden terug en gaat de INGEVOERDE flensbreedte de berekening
 * in. Het rapport zegt dat dan met zoveel woorden.
 */
export async function bepaalBeffPerStaaf(
  data: BeffStavenInvoer,
  roep: RoepKern,
): Promise<BeffStaafUitkomst[]> {
  const uit: BeffStaafUitkomst[] = [];
  const supports = data.supports;
  if (!supports) return uit;

  for (const beam of data.beams) {
    if (!matchSupportedConcreteClass(beam.material?.trim() ?? "")) continue;
    const vorm = parseConcreteSection(beam.profile);
    if (!vorm.ok || vorm.doorsnede.shape === "Rectangle") continue;
    const d = vorm.doorsnede;
    const bW = d.b_w_mm;
    if (bW === null || !(bW > 0)) continue;

    const mislukt = (reden: string): BeffStaafMislukt => {
      console.info(
        `[b_eff] staaf ${beam.id}: ${reden} — er wordt gerekend met de ingevoerde ` +
          `flensbreedte van ${d.b_mm} mm.`,
      );
      return { ok: false, beamId: beam.id, reden, ingevoerdeBreedteMm: d.b_mm };
    };

    const lijn = bepaalLiggerlijn(beam.id, { nodes: data.nodes, beams: data.beams, supports });
    if (!lijn.ok) {
      uit.push(mislukt(`geen liggerlijn (${lijn.reden})`));
      continue;
    }
    const staaf = lijn.lijn.staven.find((s) => s.beamId === beam.id);
    if (!staaf) {
      uit.push(mislukt("de staaf zit niet in zijn eigen liggerlijn"));
      continue;
    }
    const xLijn = lijnPositieMm(lijn.lijn, beam.id, staaf.lengthMm / 2);
    if (xLijn === null) {
      uit.push(mislukt("het staafmidden is niet op de liggerlijn te plaatsen"));
      continue;
    }
    const overstek = d.b_mm - bW;
    const b_i_mm = d.shape === "Tee" ? [overstek / 2, overstek / 2] : [overstek];

    try {
      const antwoord = await roep<EffectiveFlangeWidthResponse>(
        "concrete_effective_flange_width",
        {
          beam_id: beam.id,
          line: lijn.lijn.line,
          flange: { b_w_mm: bW, b_i_mm },
          // De plaats waarvoor de kern de afleiding uitschrijft. Zonder dit
          // veld komt alleen de verdeling terug, en toont het rapport de
          // gebruikte b_eff wél maar kan het hem niet verantwoorden.
          x_mm: xLijn,
        },
      );
      const zones = antwoord.distribution.zones;
      const eps = 1e-9 * Math.max(antwoord.distribution.total_length_mm, 1);
      // De kern koos het gebied al (`applied`); de terugval bestaat alleen voor
      // een antwoord dat er geen draagt, en volgt dezelfde regel.
      const zone =
        (antwoord.applied ? zones[antwoord.applied.zone_index] : undefined) ??
        zones.find((z) => xLijn <= z.zone.x_end_mm + eps) ??
        zones[zones.length - 1];
      if (!zone) {
        uit.push(mislukt("de kern gaf geen enkel gebied terug"));
        continue;
      }
      uit.push({
        ok: true,
        beamId: beam.id,
        bEffMm: zone.b_eff_mm,
        ingevoerdeBreedteMm: d.b_mm,
        bWMm: bW,
        bIMm: b_i_mm,
        line: lijn.lijn.line,
        staafIds: lijn.lijn.staven.map((s) => s.beamId),
        steunpuntKnopen: lijn.lijn.steunpuntKnopen,
        meldingen: lijn.lijn.meldingen,
        xLijnMm: xLijn,
        zones,
        totaleLengteMm: antwoord.distribution.total_length_mm,
        verdelingMeldingen: antwoord.distribution.notes,
        applied: antwoord.applied,
      });
    } catch (e) {
      uit.push(
        mislukt(`de kern gaf geen b_eff (${e instanceof Error ? e.message : String(e)})`),
      );
    }
  }
  return uit;
}

/**
 * De gebruikte b_eff per staaf-id, mm — wat de doorsnedebouwers nodig hebben.
 *
 * Alleen de geslaagde afleidingen komen erin. Een staaf die er niet in staat,
 * rekent met de ingevoerde flensbreedte; `metBeff` in `betonCheckBuilder.ts`
 * regelt dat, en het rapport meldt de reden.
 */
export function bEffWaardenPerStaaf(
  uitkomsten: readonly BeffStaafUitkomst[],
): Map<number, number> {
  const uit = new Map<number, number>();
  for (const u of uitkomsten) {
    if (u.ok) uit.set(u.beamId, u.bEffMm);
  }
  return uit;
}
