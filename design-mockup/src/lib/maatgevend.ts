/**
 * maatgevend.ts — wat is maatgevend: welke toets, in welke combinatie, waar.
 *
 * WAAROM (issue #41). Het toetsingspaneel zette alle toetsen van een staaf
 * onder elkaar met hun unity check. Wat er knelt — welke toets, in welke
 * belastingcombinatie en op welke plaats langs de staaf — moest de gebruiker
 * zelf uit de lijst opmaken. Dit bestand maakt daar per toetsresultaat één
 * overzicht van, voor elke rekenkern dezelfde vorm, zodat het paneel, de
 * plaatkaart en het live rapport hetzelfde antwoord tonen.
 *
 * ER WORDT NIETS VERZONNEN. Alle gegevens komen woordelijk uit het antwoord
 * van de kern:
 *
 *  - de unity check en de status per toets uit `NamedCheck`;
 *  - combinatie en positie uit `force_state` van die toets. Alle staafkernen
 *    (staal, hout, kruislaaghout, beton, vrije spanningstoets) vullen dat met
 *    het krachtenpunt waarop de toets is gerekend. De kern kent daar geen
 *    "geen combinatie": hij schrijft dan `combination_id: 0` (de
 *    doorbuigingstoetsen, een detailleringseis zonder krachtenpunt, een lege
 *    omhullende). Combinaties in de app tellen vanaf 1, dus 0 betekent hier
 *    "de kern levert geen combinatie" — en dan wordt er ook GEEN positie
 *    getoond: x = 0 mm zou als uitkomst lezen terwijl het een lege waarde is;
 *  - een plaat heeft geen positie x maar een element. De kern geeft het
 *    element alleen voor de maatgevende toets van de plaat
 *    (`governing_element_id`); bij de overige toetsen blijft het weg.
 *
 * WAT MEETELT. Een toets telt mee als maatgevend wanneer hij een unity check
 * heeft EN zijn status niet "n.v.t." is — dezelfde regel als `uc_of` in de
 * orchestrators van de kernen. Een toets die niet meetelt blijft in de lijst
 * staan, met zijn notities (daar zet de kern de reden neer), maar kan nooit
 * de maatgevende zijn.
 *
 * GELIJKE UNITY CHECKS. De kernen nemen bij gelijke UC de EERSTE in hun eigen
 * volgorde (`if uc > uc_max`). Dat doet deze afleiding ook. Noemt de kern in
 * `governing_check_id` zelf een van de toetsen met de hoogste UC, dan wint die
 * — zo spreken scherm en kern elkaar nooit tegen.
 *
 * Puur: geen React, geen store, geen vertalingen. De component vertaalt.
 */
import type { CheckSoort, MemberCheckResult } from "./checkTypes";
import { checkSoort } from "./checkTypes";
import type { CheckStatus } from "./types/steel/CheckStatus";
import type { NamedCheck } from "./types/steel/NamedCheck";
import type { PlateCheckResult } from "./types/plaat/PlateCheckResult";

/** Uit welke kern een overzicht komt; de plaattoets is een zesde soort. */
export type MaatgevendSoort = CheckSoort | "plaat";

/** Vaste volgorde van de soorten in het modeloverzicht. */
export const SOORT_VOLGORDE: readonly MaatgevendSoort[] = [
  "staal", "hout", "clt", "beton", "spanning", "plaat",
];

/** Waarom een toets niet meetelt. */
export type NietMeeReden =
  /** Status "n.v.t.": niet van toepassing of niet uitgevoerd. */
  | "nvt"
  /** Wel een status, maar geen unity check om te vergelijken. */
  | "geenUc";

/** Eén toets in het overzicht. */
export interface ToetsRegel {
  id: string;
  /** Titel en artikel woordelijk uit de kern. */
  titel: string;
  artikel: string;
  status: CheckStatus;
  /** `null` = de toets heeft geen unity check. */
  uc: number | null;
  /** Telt deze toets mee als kandidaat voor "maatgevend"? */
  teltMee: boolean;
  /** Alleen gezet als `teltMee` onwaar is. */
  nietMeeReden: NietMeeReden | null;
  /**
   * De notities van een toets die NIET meetelt: daar staat de reden, in de
   * bewoording van de kern. Leeg bij een toets die wel meetelt (zijn notities
   * staan bij de afleiding).
   */
  redenen: string[];
  /** Combinatie waaruit de UC komt; `null` = de kern levert er geen. */
  combinatieId: number | null;
  /** Positie langs de staaf in mm vanaf het begin; `null` = niet geleverd. */
  positieMm: number | null;
  /** Alleen bij een plaat, en alleen bij haar maatgevende toets. */
  elementId: number | null;
  /** Plaats in de volgorde van de kern (de normvolgorde), vanaf 0. */
  normIndex: number;
  maatgevend: boolean;
}

/** Het overzicht van één staaf of één plaat. */
export interface MaatgevendOverzicht {
  /** `null` = een resultaatvorm die `checkSoort` niet kent. */
  soort: MaatgevendSoort | null;
  isPlaat: boolean;
  /** Staaf- of plaatnummer. */
  objectId: number;
  /** De hoogste UC zoals de kern hem opgeeft. */
  ucMax: number;
  status: CheckStatus;
  /** De maatgevende toets; `null` als geen enkele toets meetelt. */
  maatgevend: ToetsRegel | null;
  /**
   * Wat de kern in `governing_check_id` schreef als dat GEEN toets-id is: bij
   * een geweigerde staaf staat daar de reden ("NIET TOETSBAAR: …"). `null`
   * als het veld gewoon een toets aanwijst of leeg is.
   */
  kernMelding: string | null;
  /** Alle toetsen, in de volgorde van de kern. */
  regels: ToetsRegel[];
  /** Hoeveel toetsen niet meetellen. */
  aantalTeltNietMee: number;
}

/** 0 is bij de kernen "geen combinatie"; combinaties tellen vanaf 1. */
function combinatieOfNiets(id: number | null | undefined): number | null {
  return typeof id === "number" && Number.isFinite(id) && id > 0 ? id : null;
}

function bruikbareUc(uc: number | null | undefined): number | null {
  return typeof uc === "number" && !Number.isNaN(uc) ? uc : null;
}

function regelUitToets(named: NamedCheck, normIndex: number, isPlaat: boolean): ToetsRegel {
  const d = named.kind.data;
  const uc = bruikbareUc(d.uc?.uc);
  const nvt = d.status === "NotApplicable";
  const teltMee = uc !== null && !nvt;
  // De combinatie is "waaruit de UC komt". Een toets zonder UC heeft er dus
  // geen, ook al draagt zijn `force_state` een krachtenpunt: de kern vult dat
  // bij een niet-toepasselijke druktoets met het eerste punt van de omhullende,
  // en "comb. 1, x = 0 mm" zou daar als herkomst van een uitkomst lezen.
  const combinatieId = teltMee ? combinatieOfNiets(d.force_state?.combination_id) : null;
  return {
    id: named.id,
    titel: d.title,
    artikel: d.article,
    status: d.status,
    // Een toets met status n.v.t. kan een UC-veld dragen dat niets betekent;
    // de kernen tellen hem dan als 0. Hier blijft hij leeg: er is niets
    // vergeleken.
    uc: teltMee ? uc : null,
    teltMee,
    nietMeeReden: teltMee ? null : nvt ? "nvt" : "geenUc",
    redenen: teltMee ? [] : [...(d.notes ?? [])],
    combinatieId,
    // Zonder combinatie is er geen krachtenpunt, en dus geen positie. Een
    // plaat heeft nooit een positie langs een staaf.
    positieMm:
      !isPlaat && combinatieId !== null && Number.isFinite(d.force_state.position_mm)
        ? d.force_state.position_mm
        : null,
    elementId: null,
    normIndex,
    maatgevend: false,
  };
}

/**
 * Kies de maatgevende regel: hoogste UC onder de meetellende toetsen; bij
 * gelijke UC de toets die de kern noemt, anders de eerste in normvolgorde.
 */
function kiesMaatgevend(regels: ToetsRegel[], kernId: string): ToetsRegel | null {
  let beste: ToetsRegel | null = null;
  for (const r of regels) {
    if (!r.teltMee || r.uc === null) continue;
    if (beste === null || r.uc > (beste.uc as number)) beste = r;
  }
  if (beste === null) return null;
  const kern = regels.find((r) => r.id === kernId && r.teltMee && r.uc === beste!.uc);
  return kern ?? beste;
}

function bouwOverzicht(
  basis: Pick<MaatgevendOverzicht, "soort" | "isPlaat" | "objectId" | "ucMax" | "status">,
  regels: ToetsRegel[],
  kernId: string,
): MaatgevendOverzicht {
  const gekozen = kiesMaatgevend(regels, kernId);
  if (gekozen) gekozen.maatgevend = true;
  const wijstToetsAan = regels.some((r) => r.id === kernId);
  return {
    ...basis,
    maatgevend: gekozen,
    kernMelding: !wijstToetsAan && kernId.trim().length > 0 ? kernId : null,
    regels,
    aantalTeltNietMee: regels.filter((r) => !r.teltMee).length,
  };
}

/** Het overzicht van één staaf — staal, hout, kruislaaghout, beton of spanning. */
export function maatgevendVanStaaf(r: MemberCheckResult): MaatgevendOverzicht {
  const regels = (r.checks ?? []).map((c, i) => regelUitToets(c, i, false));
  return bouwOverzicht(
    { soort: checkSoort(r), isPlaat: false, objectId: r.beam_id, ucMax: r.uc_max, status: r.status },
    regels,
    r.governing_check_id ?? "",
  );
}

/**
 * Het overzicht van één plaat. Wat de kern in `niet_getoetst` zet (met reden)
 * komt als regel zonder unity check in dezelfde lijst, zodat "niet getoetst"
 * bij een plaat op dezelfde plek staat als bij een staaf.
 */
export function maatgevendVanPlaat(r: PlateCheckResult): MaatgevendOverzicht {
  const regels = (r.checks ?? []).map((c, i) => regelUitToets(c, i, true));
  for (const n of r.niet_getoetst ?? []) {
    if (regels.some((x) => x.id === n.id)) continue;
    regels.push({
      id: n.id,
      titel: n.titel,
      artikel: "",
      status: "NotApplicable",
      uc: null,
      teltMee: false,
      nietMeeReden: "nvt",
      redenen: [n.reden],
      combinatieId: null,
      positieMm: null,
      elementId: null,
      normIndex: regels.length,
      maatgevend: false,
    });
  }
  const overzicht = bouwOverzicht(
    { soort: "plaat", isPlaat: true, objectId: r.plate_id, ucMax: r.uc_max, status: r.status },
    regels,
    r.governing_check_id ?? "",
  );
  // Element en combinatie van de plaat als geheel horen bij de toets die de
  // KERN maatgevend noemt. Alleen als dat dezelfde toets is, gaan ze mee.
  const m = overzicht.maatgevend;
  if (m && m.id === r.governing_check_id) {
    if (typeof r.governing_element_id === "number") m.elementId = r.governing_element_id;
    m.combinatieId = combinatieOfNiets(r.governing_combination_id) ?? m.combinatieId;
  }
  return overzicht;
}

// ─────────────────────────────────────────────────────────────────────────
// Volgorde van de lijst
// ─────────────────────────────────────────────────────────────────────────

/** "uc" = hoogste unity check eerst (standaard); "norm" = volgorde van de kern. */
export type ToetsVolgorde = "uc" | "norm";

/**
 * De regels in de gevraagde volgorde. Op UC: meetellende toetsen aflopend, de
 * maatgevende vooraan bij gelijke UC, verder de normvolgorde; toetsen die niet
 * meetellen onderaan, in normvolgorde. Geeft altijd een nieuwe lijst terug.
 */
export function sorteerRegels(regels: readonly ToetsRegel[], volgorde: ToetsVolgorde): ToetsRegel[] {
  const uit = [...regels];
  if (volgorde === "norm") return uit.sort((a, b) => a.normIndex - b.normIndex);
  return uit.sort((a, b) => {
    if (a.teltMee !== b.teltMee) return a.teltMee ? -1 : 1;
    if (a.teltMee && b.teltMee && a.uc !== b.uc) return (b.uc as number) - (a.uc as number);
    if (a.maatgevend !== b.maatgevend) return a.maatgevend ? -1 : 1;
    return a.normIndex - b.normIndex;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Unity check als balkje
// ─────────────────────────────────────────────────────────────────────────

/** De drie klassen die de app al voor een UC gebruikt. */
export type UcKlasse = "goed" | "letop" | "overschreden";

/** ≤ 0,90 goed; tot en met 1,00 let op; daarboven overschreden. */
export function ucKlasse(uc: number): UcKlasse {
  if (uc > 1.0) return "overschreden";
  if (uc > 0.9) return "letop";
  return "goed";
}

/** Het balkje loopt van 0 tot 1,5; de grens UC = 1,0 ligt dus op twee derde. */
export const UC_BALK_BEREIK = 1.5;

export interface UcBalk {
  klasse: UcKlasse;
  /** Gevuld deel van het spoor, 0–100 %. */
  vullingPct: number;
  /** Waar het streepje UC = 1,0 staat, in % van het spoor. */
  grensPct: number;
  /** De UC is groter dan het bereik: het balkje is vol en afgekapt. */
  afgekapt: boolean;
}

/** Maten van het balkje voor één unity check. */
export function ucBalk(uc: number): UcBalk {
  const waarde = Number.isFinite(uc) ? Math.max(0, uc) : uc > 0 ? Infinity : 0;
  const afgekapt = waarde > UC_BALK_BEREIK;
  const vulling = Math.min(waarde, UC_BALK_BEREIK) / UC_BALK_BEREIK;
  return {
    klasse: ucKlasse(waarde),
    vullingPct: Math.round(vulling * 1000) / 10,
    grensPct: Math.round((1 / UC_BALK_BEREIK) * 1000) / 10,
    afgekapt,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Het hele model
// ─────────────────────────────────────────────────────────────────────────

export interface ModelMaatgevend {
  /** Het maatgevende onderdeel van het hele model; `null` als niets meetelt. */
  model: MaatgevendOverzicht | null;
  /** Per soort het maatgevende onderdeel, in `SOORT_VOLGORDE`; alleen soorten die voorkomen. */
  perSoort: { soort: MaatgevendSoort; overzicht: MaatgevendOverzicht }[];
  /** Staven en platen zonder één meetellende toets: die doen hier niet mee. */
  aantalZonderMaatgevend: number;
}

/** Hoger is zwaarder; bij gelijke UC eerst staven, dan het laagste nummer. */
function zwaarder(a: MaatgevendOverzicht, b: MaatgevendOverzicht): boolean {
  const ua = a.maatgevend!.uc as number;
  const ub = b.maatgevend!.uc as number;
  if (ua !== ub) return ua > ub;
  if (a.isPlaat !== b.isPlaat) return !a.isPlaat;
  return a.objectId < b.objectId;
}

/**
 * Het maatgevende onderdeel van het model en per soort. Een onderdeel doet
 * mee zodra het een meetellende toets heeft; vergeleken wordt de UC van die
 * toets. Een geweigerde staaf of plaat (geen enkele toets met een UC) doet
 * niet mee en wordt geteld in `aantalZonderMaatgevend`.
 */
export function modelMaatgevend(
  staven: readonly MemberCheckResult[],
  platen: readonly PlateCheckResult[] = [],
): ModelMaatgevend {
  const alle = [...staven.map(maatgevendVanStaaf), ...platen.map(maatgevendVanPlaat)];
  let model: MaatgevendOverzicht | null = null;
  const beste = new Map<MaatgevendSoort, MaatgevendOverzicht>();
  let zonder = 0;
  for (const o of alle) {
    if (!o.maatgevend) { zonder++; continue; }
    if (model === null || zwaarder(o, model)) model = o;
    if (o.soort !== null) {
      const huidig = beste.get(o.soort);
      if (!huidig || zwaarder(o, huidig)) beste.set(o.soort, o);
    }
  }
  return {
    model,
    perSoort: SOORT_VOLGORDE.filter((s) => beste.has(s)).map((s) => ({ soort: s, overzicht: beste.get(s)! })),
    aantalZonderMaatgevend: zonder,
  };
}
