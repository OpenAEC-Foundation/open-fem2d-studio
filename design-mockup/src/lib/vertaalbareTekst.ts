/**
 * vertaalbareTekst — een melding die zowel Nederlands als via i18n bestaat.
 *
 * WAAROM TWEE VORMEN (issue #33)
 *  Een aantal meldingen en labels ontstaat in .ts-bestanden die geen i18n
 *  laden: ze zitten in de sidecarbundel (MCP), gaan het rapport of de
 *  IFC-export in, of worden door tests en de bediening letterlijk
 *  teruggegeven. Die plekken zijn per ontwerp Nederlands. De interface moet
 *  dezelfde melding in de gekozen taal tonen.
 *
 *  Een `VertaalbareTekst` draagt daarom beide: `tekst` is de Nederlandse
 *  melding zoals die altijd al was, `sleutel` + `waarden` zijn wat de
 *  component vertaalt. Het .ts-bestand schrijft ze op één plek naast elkaar;
 *  test-i18n-meldteksten legt vast dat de Nederlandse vertaling van de
 *  sleutel letterlijk gelijk is aan `tekst`, zodat de twee niet uit elkaar
 *  kunnen lopen.
 *
 *  Een waarde mag zelf een `VertaalbareTekst` zijn (een zijde, een rij, een
 *  deelmelding) of een lijst daarvan met een scheidingsteken; `vertaal`
 *  vertaalt die eerst. Een getal onder de naam `count` stuurt het meervoud
 *  van i18next (`_one`/`_other`).
 *
 * Dit bestand importeert geen i18n: de vertaalfunctie komt van de aanroeper.
 */

export type TekstWaarde = string | number | VertaalbareTekst | TekstLijst;

export interface VertaalbareTekst {
  /** i18n-sleutel met naamruimte, bijvoorbeeld `"check:concrete.zoneCheck.gap"`. */
  sleutel: string;
  /** Waarden voor de plaatshouders; getallen staan er al opgemaakt in. */
  waarden?: Record<string, TekstWaarde>;
  /** De Nederlandse tekst — voor kern, MCP, rapportnoten en tests. */
  tekst: string;
}

/** Een opsomming van delen die elk vertaald en daarna samengevoegd worden. */
export interface TekstLijst {
  lijst: TekstWaarde[];
  scheiding: string;
}

export type Vertaalfunctie = (sleutel: string, waarden?: Record<string, string | number>) => string;

/** Maak een vertaalbare tekst; `tekst` is de Nederlandse vorm. */
export function vt(
  sleutel: string,
  tekst: string,
  waarden?: Record<string, TekstWaarde>,
): VertaalbareTekst {
  return waarden ? { sleutel, waarden, tekst } : { sleutel, tekst };
}

/** Is dit een vertaalbare tekst (en geen gewone string of getal)? */
export function isVertaalbareTekst(w: unknown): w is VertaalbareTekst {
  return typeof w === "object" && w !== null && typeof (w as VertaalbareTekst).sleutel === "string";
}

function isTekstLijst(w: unknown): w is TekstLijst {
  return typeof w === "object" && w !== null && Array.isArray((w as TekstLijst).lijst);
}

/** Vertaal een vertaalbare tekst, met geneste waarden eerst. */
export function vertaal(t: Vertaalfunctie, v: VertaalbareTekst): string {
  if (!v.waarden) return t(v.sleutel);
  const w: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(v.waarden)) {
    w[k] = typeof x === "object" ? vertaalWaarde(t, x) : x;
  }
  return t(v.sleutel, w);
}

/** Een tekst, lijst of vertaalbare tekst als tekst in de gekozen taal. */
export function vertaalWaarde(t: Vertaalfunctie, w: TekstWaarde): string {
  if (isVertaalbareTekst(w)) return vertaal(t, w);
  if (isTekstLijst(w)) return w.lijst.map((x) => vertaalWaarde(t, x)).join(w.scheiding);
  return String(w);
}

/** De Nederlandse vorm van een waarde, zonder vertaalfunctie. */
export function nederlands(w: TekstWaarde): string {
  if (isVertaalbareTekst(w)) return w.tekst;
  if (isTekstLijst(w)) return w.lijst.map(nederlands).join(w.scheiding);
  return String(w);
}
