/**
 * zoneModel — de wapeningszones zoals het venster onderin ze leest en schrijft.
 *
 * ── WAT HIER STAAT, EN WAT NIET ────────────────────────────────────────────
 *
 * Dit bestand is de TypeScript-spiegel van drie dingen uit
 * `nen-en-1992-1-1/src/section.rs`: `ReinforcementZones::cage_at_mm`,
 * `boundaries_mm` (die staat al in `lib/betonZoneSneden.ts` en wordt hier
 * hergebruikt) en de regels 2 t/m 4 van `ReinforcementZones::validate`.
 *
 * Waarom die spiegel er MAG zijn, terwijl een tweede versie van een regel
 * meestal juist het probleem is: de kern is de enige die rekent, en zij wijst
 * een verkeerde zone-indeling ook zonder deze module af. Wat hier staat is er
 * uitsluitend om de gebruiker het antwoord EERDER te geven — tijdens het typen,
 * naast de tekening — en om de doorsnedetekening te kunnen laten zien welke
 * korf op de aangewezen plaats ligt. De kern blijft de scheidsrechter; deze
 * module mag nooit een indeling goedkeuren die de kern afwijst, en om die reden
 * is elke regel hieronder letterlijk uit `section.rs` overgenomen, met het
 * regelnummer erbij.
 *
 * ── DE VIJFDE REGEL WORDT NIET NAGEBOUWD ───────────────────────────────────
 *
 * Regel 5 van `validate` vraagt of de korf die op elk stuk uit `cage_at_mm`
 * rolt, in de doorsnede past. Die vraag is al beantwoord door
 * `controleerKorf` in `wapeningskorf.ts` — de spiegel van
 * `ReinforcementCage::validate`. Hier wordt dus niet nóg een derde versie van
 * de pasvorm geschreven maar diezelfde functie aangeroepen, per stuk, met de
 * plaats in de melding. Zie [`controleerZones`].
 */
import type { ConcreteSectionInput } from "../../../lib/types/concrete/ConcreteSectionInput";
import type { LongitudinalZone } from "../../../lib/types/concrete/LongitudinalZone";
import type { RebarRow } from "../../../lib/types/concrete/RebarRow";
import type { RebarSide } from "../../../lib/types/concrete/RebarSide";
import type { ReinforcementCage } from "../../../lib/types/concrete/ReinforcementCage";
import type { ReinforcementZones } from "../../../lib/types/concrete/ReinforcementZones";
import type { StirrupZone } from "../../../lib/types/concrete/StirrupZone";
import { ZONE_TOLERANTIE_MM, zoneGrenzenMm } from "../../../lib/betonZoneSneden";
import { controleerKorfMelding, maat, type Wapeningskorf } from "../wapeningskorf";
import { vt, type VertaalbareTekst } from "../../../lib/vertaalbareTekst";

/**
 * De twee WAPENINGSzijden, in de volgorde waarin de kern ze afloopt.
 *
 * Bewust niet `ZIJDEN`: `wapeningskorf.ts` heeft die naam al voor de drie
 * DEKKINGSzijden van 4.4.1.1(1)P (boven, onder, zijkanten). Dat zijn andere
 * zijden met een andere betekenis, en twee gelijknamige lijsten in dezelfde
 * map zouden vroeg of laat verwisseld worden.
 */
export const WAPENINGSZIJDEN: readonly RebarSide[] = ["Bottom", "Top"] as const;

/** Nederlandse aanduiding per zijde, voor de tabelkop en de meldingen. */
export const ZIJDE_NAAM: Record<RebarSide, string> = {
  Bottom: "onder",
  Top: "boven",
};

export interface ZoneSelectie { soort: "langs" | "beugel"; index: number }

/** Bedieningsresolutie, geen normminimum of ontwerpregel. */
export const MIN_ZONE_BEDIENING_MM = 1;

/** Verplaats één grens en de aansluitende buur; de invoer blijft onaangeroerd. */
export function verplaatsZoneGrens(
  zones: ReinforcementZones, selectie: ZoneSelectie, einde: "start" | "end", xMm: number, lengteMm: number,
): ReinforcementZones {
  if (!Number.isFinite(xMm) || !Number.isFinite(lengteMm) || lengteMm <= 0) return zones;
  const langs = selectie.soort === "langs";
  const lijst = langs ? zones.longitudinal : zones.stirrups;
  const zone = lijst[selectie.index];
  if (!zone) return zones;
  const start = einde === "start";
  const veld = start ? "x_start_mm" : "x_end_mm";
  const buurveld = start ? "x_end_mm" : "x_start_mm";
  const buurIndex = lijst.findIndex((z, i) => i !== selectie.index &&
    (!langs || (z as LongitudinalZone).side === (zone as LongitudinalZone).side) &&
    Math.abs(z[buurveld] - zone[veld]) <= ZONE_TOLERANTIE_MM);
  const buur = lijst[buurIndex];
  // Het bestaande beugelcontract kent geen lege zone. Buitenranden blijven vast.
  if (!langs && !buur) return zones;
  const min = start ? (buur ? buur.x_start_mm + MIN_ZONE_BEDIENING_MM : 0) : zone.x_start_mm + MIN_ZONE_BEDIENING_MM;
  const max = start ? zone.x_end_mm - MIN_ZONE_BEDIENING_MM : (buur ? buur.x_end_mm - MIN_ZONE_BEDIENING_MM : lengteMm);
  if (min > max) return zones;
  let x = Math.max(min, Math.min(max, xMm));
  if (!buur && Math.abs(x - zone[veld]) < MIN_ZONE_BEDIENING_MM) x = zone[veld];
  if (x === zone[veld]) return zones;
  const vervang = <T extends LongitudinalZone | StirrupZone>(rijen: T[]): T[] => rijen.map((z, i) =>
    i === selectie.index ? { ...z, [veld]: x } : i === buurIndex ? { ...z, [buurveld]: x } : z);
  if (!langs) return { ...zones, stirrups: vervang(zones.stirrups) };
  const longitudinal = vervang(zones.longitudinal);
  if (!buur && (start ? x > zone[veld] : x < zone[veld])) {
    const z = zone as LongitudinalZone;
    longitudinal.push({ ...z, row: { ...z.row, count: 0 },
      x_start_mm: start ? z.x_start_mm : x, x_end_mm: start ? x : z.x_end_mm });
  }
  return { ...zones, longitudinal };
}

/**
 * De lengte van een staaf uit zijn twee UI-knopen, in mm.
 *
 * UI-knopen staan in MILLIMETERS (`femTypes.Node`: "model coords (mm)"); de
 * rekenkern werkt in meters, en die twee werelden lopen precies op de
 * adaptergrens uit elkaar. Deze functie bestaat omdat het betonvenster de
 * lengte eerst met ×1000 berekende — de kern-gewoonte, toegepast op
 * UI-coördinaten — waardoor een staaf van 6 m in het venster 6 000 000 mm
 * lang was: standaardzones tot 6 000 000, "L = 6.000,00 m" in de titel, en
 * zones die naar de kern gingen ver buiten de staaf. Eén plek, mét test.
 */
export function staafLengteMm(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Zijn beide lijsten leeg? Dan geldt de korf van de staaf over de hele lengte. */
export function zonesZijnLeeg(zones: ReinforcementZones | undefined): boolean {
  return !zones || (zones.longitudinal.length === 0 && zones.stirrups.length === 0);
}

/**
 * De zone die op plaats `xMm` geldt — letterlijk `kies_zone` uit
 * `section.rs`: van de zones die op of vóór `xMm` beginnen, die met het
 * GROOTSTE begin, mits `xMm` niet voorbij haar einde ligt.
 *
 * Daardoor hoort een grens tussen twee aansluitende zones bij de zone die
 * daar BEGINT, en hoort x = L nog bij de laatste. De volgorde in de lijst
 * doet niet ter zake — dat is precies waarom er niet gewoon een `find` staat.
 */
export function kiesZone<T extends { x_start_mm: number; x_end_mm: number }>(
  zones: readonly T[],
  xMm: number,
): T | undefined {
  let beste: T | undefined;
  for (const z of zones) {
    if (xMm + ZONE_TOLERANTIE_MM < z.x_start_mm || xMm > z.x_end_mm + ZONE_TOLERANTIE_MM) continue;
    if (beste === undefined || z.x_start_mm > beste.x_start_mm) beste = z;
  }
  return beste;
}

/**
 * De korf die op plaats `xMm` werkelijk ligt — de spiegel van
 * `ReinforcementZones::cage_at_mm`.
 *
 * Zegt geen enkele zone iets over een zijde, dan blijft de rij van de
 * BASISKORF staan; dat is de reden dat een lege zonelijst het gedrag van vóór
 * de zones oplevert. Dezelfde afspraak geldt voor de beugelvelden.
 *
 * De doorsnedetekening naast de aanzicht wordt hiermee gevoed. Zou zij de
 * basiskorf tonen terwijl de dekkingslijn met de zonekorf rekent, dan laat het
 * venster op één plaats twee verschillende balken zien.
 */
export function korfOpX(
  basis: ReinforcementCage,
  zones: ReinforcementZones | undefined,
  xMm: number,
): ReinforcementCage {
  if (!zones) return basis;
  const uit: ReinforcementCage = { ...basis };
  for (const zijde of WAPENINGSZIJDEN) {
    const geldend = kiesZone(
      zones.longitudinal.filter((z) => z.side === zijde),
      xMm,
    );
    if (!geldend) continue;
    if (zijde === "Bottom") uit.bottom = geldend.row;
    else uit.top = geldend.row;
  }
  const beugel = kiesZone(zones.stirrups, xMm);
  if (beugel) {
    uit.stirrup_diameter_mm = beugel.diameter_mm;
    uit.stirrup_spacing_mm = beugel.spacing_mm;
    uit.stirrup_legs = beugel.legs;
  }
  return uit;
}

/**
 * Een startindeling uit de korf van de staaf: één langszone per zijde en één
 * beugelzone, allemaal over de volle lengte.
 *
 * Dit is met opzet een indeling die REKENKUNDIG NIETS VERANDERT — hij levert
 * op elke plaats dezelfde korf als de staaf al had. Zo is het aanmaken van
 * zones geen ingreep in de berekening maar alleen het openzetten van de
 * lengte-as: pas als de gebruiker een zone splitst en er staven uit haalt,
 * verandert er iets. Zou de knop meteen een staffeling verzinnen, dan stond er
 * wapening in het model die niemand heeft ingevoerd.
 *
 * De beugelzone komt er alleen als de korf werkelijk beugelgegevens draagt:
 * `StirrupZone` eist s, n en Ø alle drie positief, en een zone met een halve
 * opgave zou de dwarskrachttoets op dat stuk stilzwijgend uitzetten.
 */
export function standaardZonesUitKorf(
  korf: ReinforcementCage,
  lengteMm: number,
): ReinforcementZones {
  const langs = (side: RebarSide, row: RebarRow): LongitudinalZone => ({
    side,
    row,
    x_start_mm: 0,
    x_end_mm: lengteMm,
    bar_shape: "Recht",
    casting_position: "Onderzijde",
  });
  const s = korf.stirrup_spacing_mm;
  const n = korf.stirrup_legs;
  const beugelCompleet =
    korf.stirrup_diameter_mm > 0 &&
    s !== undefined && s !== null && s > 0 &&
    n !== undefined && n !== null && n >= 1;
  return {
    longitudinal: [langs("Bottom", korf.bottom), langs("Top", korf.top)],
    stirrups: beugelCompleet
      ? [
          {
            x_start_mm: 0,
            x_end_mm: lengteMm,
            spacing_mm: s as number,
            legs: n as number,
            diameter_mm: korf.stirrup_diameter_mm,
          },
        ]
      : [],
  };
}

/**
 * Splits de zone die op `xMm` ligt in tweeën, op die plaats.
 *
 * Dit is de bewerking waarmee een staffeling ontstaat: zet de aanwijzer waar
 * de momentenlijn ruimte laat, splits, en haal uit één helft staven weg. De
 * twee helften erven alle overige velden van het origineel, dus vlak na het
 * splitsen ligt er nog exact dezelfde wapening als ervoor — de indeling
 * verandert, de constructie niet.
 *
 * Ligt `xMm` op of vlak bij een bestaande grens, dan gebeurt er niets: een
 * zone van nul lengte is geen zone (regel 2 van `validate`), en stilzwijgend
 * een millimeter opschuiven zou de gebruiker een grens geven die hij niet
 * heeft aangewezen. De aanroeper meldt dat zelf.
 */
export function splitsOpX(
  zones: ReinforcementZones,
  soort: "langs" | "beugel",
  index: number,
  xMm: number,
): ReinforcementZones | null {
  const lijst = soort === "langs" ? zones.longitudinal : zones.stirrups;
  const z = lijst[index];
  if (!z) return null;
  if (xMm <= z.x_start_mm + ZONE_TOLERANTIE_MM) return null;
  if (xMm >= z.x_end_mm - ZONE_TOLERANTIE_MM) return null;
  const links = { ...z, x_end_mm: xMm };
  const rechts = { ...z, x_start_mm: xMm };
  const nieuw = [...lijst.slice(0, index), links, rechts, ...lijst.slice(index + 1)];
  return soort === "langs"
    ? { ...zones, longitudinal: nieuw as LongitudinalZone[] }
    : { ...zones, stirrups: nieuw as StirrupZone[] };
}

/**
 * Voeg een zone samen met haar rechterbuur binnen dezelfde reeks (dezelfde
 * zijde bij langswapening, de beugellijst bij beugels).
 *
 * De VELDEN van de linkerzone blijven staan en het bereik wordt verlengd tot
 * het einde van de rechter. Er wordt dus niet gemiddeld of gekozen: wie twee
 * verschillende zones samenvoegt, houdt de wapening van de linker over de hele
 * lengte, en dat is in de tekening onmiddellijk te zien. `null` = er is geen
 * rechterbuur die eraan grenst, en dan zou samenvoegen een gat maken.
 */
export function voegSamenMetRechts(
  zones: ReinforcementZones,
  soort: "langs" | "beugel",
  index: number,
): ReinforcementZones | null {
  const lijst = soort === "langs" ? zones.longitudinal : zones.stirrups;
  const z = lijst[index];
  if (!z) return null;
  const zelfdeReeks = (k: LongitudinalZone | StirrupZone) =>
    soort === "beugel" || (k as LongitudinalZone).side === (z as LongitudinalZone).side;
  let buurIndex = -1;
  for (let i = 0; i < lijst.length; i++) {
    if (i === index) continue;
    const k = lijst[i];
    if (!zelfdeReeks(k)) continue;
    if (Math.abs(k.x_start_mm - z.x_end_mm) <= ZONE_TOLERANTIE_MM) {
      buurIndex = i;
      break;
    }
  }
  if (buurIndex < 0) return null;
  const samen = { ...z, x_end_mm: lijst[buurIndex].x_end_mm };
  const nieuw = lijst
    .map((k, i) => (i === index ? samen : k))
    .filter((_, i) => i !== buurIndex);
  return soort === "langs"
    ? { ...zones, longitudinal: nieuw as LongitudinalZone[] }
    : { ...zones, stirrups: nieuw as StirrupZone[] };
}

/**
 * Controleer de zone-indeling zoals `ReinforcementZones::validate` dat doet —
 * regels 2 t/m 4 letterlijk, regel 5 via `controleerKorf`. `null` = in orde.
 *
 * Er wordt NIETS gerepareerd. Een gat dichttrekken zou wapening aannemen die
 * niemand heeft ingevoerd; een overlap laten staan zou de uitkomst van de
 * volgorde in de lijst laten afhangen. Allebei zijn erger dan een melding,
 * want allebei zijn in de tekening niet terug te zien.
 */
export function controleerZones(
  zones: ReinforcementZones | undefined,
  basis: ReinforcementCage,
  doorsnede: ConcreteSectionInput,
  lengteMm: number,
  restKorf: Omit<Wapeningskorf, "korf" | "doorsnede">,
): string | null {
  return controleerZonesMelding(zones, basis, doorsnede, lengteMm, restKorf)?.tekst ?? null;
}

/**
 * `controleerZones` in vertaalbare vorm (issue #33): de zone-editor toont de
 * melding in de gekozen taal; `tekst` is de Nederlandse melding.
 */
export function controleerZonesMelding(
  zones: ReinforcementZones | undefined,
  basis: ReinforcementCage,
  doorsnede: ConcreteSectionInput,
  lengteMm: number,
  restKorf: Omit<Wapeningskorf, "korf" | "doorsnede">,
): VertaalbareTekst | null {
  // Regel 1 — beide lijsten leeg is in orde; dat is het gedrag van vóór de
  // zones en er valt niets te controleren.
  if (zonesZijnLeeg(zones) || !zones) return null;
  if (!(lengteMm > 0)) {
    return vt("check:concrete.zoneCheck.zeroLength", "De staaflengte is nul; zonder lengte is er geen zone-indeling.");
  }

  // Regel 2 — elke zone heeft een positieve lengte en ligt binnen [0, L].
  const bereik = (
    aanduiding: VertaalbareTekst,
    x0: number,
    x1: number,
  ): VertaalbareTekst | null => {
    const a = aanduiding.tekst;
    if (!Number.isFinite(x0) || !Number.isFinite(x1)) {
      return vt("check:concrete.zoneCheck.notANumber", `${a}: de begin- of eindmaat is geen getal.`, { aanduiding });
    }
    if (!(x1 > x0)) {
      return vt("check:concrete.zoneCheck.endBeforeStart",
        `${a}: het einde (${maat(x1)} mm) ligt niet voorbij het begin (${maat(x0)} mm).`,
        { aanduiding, eind: maat(x1), begin: maat(x0) });
    }
    if (x0 < -ZONE_TOLERANTIE_MM || x1 > lengteMm + ZONE_TOLERANTIE_MM) {
      return vt("check:concrete.zoneCheck.outsideMember",
        `${a}: ${maat(x0)}…${maat(x1)} mm valt buiten de staaf van 0 tot ${maat(lengteMm)} mm.`,
        { aanduiding, begin: maat(x0), eind: maat(x1), lengte: maat(lengteMm) });
    }
    return null;
  };

  for (const z of zones.longitudinal) {
    const rij = rijTekst(z.row);
    const aanduiding = vt(`check:concrete.zoneCheck.subject.longitudinal.${z.side}`,
      `De ${ZIJDE_NAAM[z.side]}wapening ${rij.tekst}`, { rij });
    const fout = bereik(aanduiding, z.x_start_mm, z.x_end_mm);
    if (fout) return fout;
  }
  for (const z of zones.stirrups) {
    const aanduiding = vt("check:concrete.zoneCheck.subject.stirrupZone",
      `De beugelzone Ø${maat(z.diameter_mm)}-${maat(z.spacing_mm)}`,
      { diameter: maat(z.diameter_mm), afstand: maat(z.spacing_mm) });
    const fout = bereik(aanduiding, z.x_start_mm, z.x_end_mm);
    if (fout) return fout;
  }

  // Regel 4 — een beugelzone heeft een positieve s, een positieve Ø en ten
  // minste één been. Anders dan in de korf mag hier NIETS leeg zijn: wie een
  // stuk staaf apart benoemt, zegt daarmee wat er ligt.
  for (const z of zones.stirrups) {
    if (!(z.spacing_mm > 0) || !(z.diameter_mm > 0) || !(z.legs >= 1)) {
      return vt("check:concrete.zoneCheck.stirrupZoneIncomplete",
        `De beugelzone ${maat(z.x_start_mm)}…${maat(z.x_end_mm)} mm is onvolledig: s, Ø en het aantal benen moeten alle drie zijn ingevuld.`,
        { begin: maat(z.x_start_mm), eind: maat(z.x_end_mm) });
    }
  }

  // Regel 3 — per reeks aaneensluitend, samen precies [0, L]. Bij de
  // langswapening is dat PER ZIJDE, want boven en onder korten los van elkaar
  // in. Een stuk zonder wapening is een zone met een lege rij, geen gat.
  for (const zijde of WAPENINGSZIJDEN) {
    const reeks = zones.longitudinal.filter((z) => z.side === zijde);
    if (reeks.length === 0) continue;
    const fout = controleerAaneensluiting(
      vt(`check:concrete.zoneCheck.series.longitudinal.${zijde}`, `de ${ZIJDE_NAAM[zijde]}wapening`), reeks, lengteMm);
    if (fout) return fout;
  }
  if (zones.stirrups.length > 0) {
    const fout = controleerAaneensluiting(
      vt("check:concrete.zoneCheck.series.stirrups", "de beugelzones"), zones.stirrups, lengteMm);
    if (fout) return fout;
  }

  // Regel 5 — past de korf op elk stuk in de doorsnede? Tussen twee grenzen
  // verandert er niets, dus het midden van elk stuk volstaat. De pasvorm zelf
  // wordt niet hier overgeschreven maar aan `controleerKorf` gevraagd, de
  // spiegel van `ReinforcementCage::validate`.
  const grenzen = zoneGrenzenMm(zones);
  for (let i = 0; i + 1 < grenzen.length; i++) {
    const x = 0.5 * (grenzen[i] + grenzen[i + 1]);
    const fout = controleerKorfMelding({
      ...restKorf,
      doorsnede,
      korf: korfOpX(basis, zones, x),
    });
    if (fout) {
      return vt("check:concrete.zoneCheck.cageDoesNotFitAt",
        `Op x = ${maat(x)} mm past de wapening niet: ${fout.tekst}`, { x: maat(x), fout });
    }
  }
  return null;
}

/** "3Ø16" of "zonder staven" — voor de meldingen van de zonecontrole. */
function rijTekst(rij: RebarRow): VertaalbareTekst {
  if (rij.count <= 0 || rij.diameter_mm <= 0) return vt("check:concrete.zoneCheck.noBars", "zonder staven");
  const tekst = `${rij.count}Ø${maat(rij.diameter_mm)}`;
  return vt("check:concrete.zoneCheck.bars", tekst, { rij: tekst });
}

/**
 * Regel 3 van `validate`: de zones van één reeks sluiten aaneen aan en
 * beslaan samen precies [0, L].
 */
function controleerAaneensluiting(
  reeksNaam: VertaalbareTekst,
  reeks: readonly { x_start_mm: number; x_end_mm: number }[],
  lengteMm: number,
): VertaalbareTekst | null {
  const a = reeksNaam.tekst;
  const op = [...reeks].sort((p, q) => p.x_start_mm - q.x_start_mm);
  if (Math.abs(op[0].x_start_mm) > ZONE_TOLERANTIE_MM) {
    return vt("check:concrete.zoneCheck.firstZoneNotAtZero",
      `Bij ${a} begint de eerste zone op ${maat(op[0].x_start_mm)} mm; zij moet op 0 mm beginnen.`,
      { reeks: reeksNaam, begin: maat(op[0].x_start_mm) });
  }
  for (let i = 1; i < op.length; i++) {
    const gat = op[i].x_start_mm - op[i - 1].x_end_mm;
    if (Math.abs(gat) <= ZONE_TOLERANTIE_MM) continue;
    if (gat > 0) {
      return vt("check:concrete.zoneCheck.gap",
        `Bij ${a} zit een gat van ${maat(gat)} mm tussen ${maat(op[i - 1].x_end_mm)} en ${maat(op[i].x_start_mm)} mm. Een stuk zonder wapening is een zone met nul staven, geen gat.`,
        { reeks: reeksNaam, gat: maat(gat), van: maat(op[i - 1].x_end_mm), tot: maat(op[i].x_start_mm) });
    }
    return vt("check:concrete.zoneCheck.overlap",
      `Bij ${a} overlappen twee zones tussen ${maat(op[i].x_start_mm)} en ${maat(op[i - 1].x_end_mm)} mm.`,
      { reeks: reeksNaam, van: maat(op[i].x_start_mm), tot: maat(op[i - 1].x_end_mm) });
  }
  const eind = op[op.length - 1].x_end_mm;
  if (Math.abs(eind - lengteMm) > ZONE_TOLERANTIE_MM) {
    return vt("check:concrete.zoneCheck.lastZoneShort",
      `Bij ${a} eindigt de laatste zone op ${maat(eind)} mm; zij moet tot ${maat(lengteMm)} mm doorlopen.`,
      { reeks: reeksNaam, eind: maat(eind), lengte: maat(lengteMm) });
  }
  return null;
}
