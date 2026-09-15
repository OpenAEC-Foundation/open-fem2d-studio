/**
 * kniklengte.ts — welke kniklengte de rekenkern gaat gebruiken, en waarom.
 *
 * DE KERN BESLIST, DIT BESTAND VOORSPELT
 * Sinds september 2026 kiest de Rust-kern zelf de kniklengte als de gebruiker
 * niets heeft ingevuld (`nen_en_1993_1_1_stability::kniklengte`), en zet hij
 * de herkomst in de toets: "opgegeven", "uit de kipsteunen" of "staaflengte
 * (terugval)". De invoerbouwers geven daarom 0 door voor een leeg veld.
 *
 * Het eigenschappenpaneel moet dat antwoord al laten zien vóórdat er getoetst
 * is: een leeg veld hoort de terugval als placeholder te tonen, niet als lege
 * doos. Daarvoor is deze spiegel van de regel. Hij rekent NIETS voor de
 * toetsing — die krijgt 0 en beslist zelf — en `test-zwakke-as.mjs` houdt hem
 * tegen de werkelijke kern (via de toetsbrug) aan, zodat placeholder en
 * rapport niet uit elkaar kunnen lopen.
 *
 * DE REGEL (uitgeschreven in de kern, hier alleen samengevat)
 *  - Een ingevulde waarde > 0 gaat altijd voor.
 *  - Om de z-as (uit het vlak): een plaats telt als steunpunt alleen als daar
 *    een kipsteun aan de boven- ÉN aan de onderflens zit (binnen 1 mm). L_cr,z
 *    is dan de grootste afstand tussen opeenvolgende steunpunten, de
 *    staafeinden meegeteld. Een steun aan één flens houdt de doorsnede niet
 *    als geheel vast en verkort niets (NEN-EN 1993-1-1 6.3.5.2(2), 6.3.1.4(5)).
 *  - Anders de staaflengte.
 */

export const HERKOMST_OPGEGEVEN = "opgegeven";
export const HERKOMST_STAAFLENGTE = "staaflengte (terugval)";
export const HERKOMST_KIPSTEUNEN = "uit de kipsteunen";

/** Zelfde tolerantie als `TOLERANTIE_STEUNPAAR_MM` in de kern. */
export const TOLERANTIE_STEUNPAAR_MM = 1;

export type KniklengteHerkomst =
  | typeof HERKOMST_OPGEGEVEN
  | typeof HERKOMST_STAAFLENGTE
  | typeof HERKOMST_KIPSTEUNEN;

export interface VoorspeldeKniklengte {
  lCrMm: number;
  herkomst: KniklengteHerkomst;
  /** Posities (mm) waar de doorsnede als geheel gesteund is. */
  steunpuntenMm: number[];
  /** Steunen aan maar één flens — tellen niet mee. */
  alleenBoven: number;
  alleenOnder: number;
}

/** Posities strikt tussen de einden, in mm, gesorteerd en ontdubbeld. */
function naarMm(fracties: readonly number[] | undefined, lengteMm: number): number[] {
  const mm = (fracties ?? [])
    .filter((f) => Number.isFinite(f) && f > 0 && f < 1)
    .map((f) => f * lengteMm)
    .sort((a, b) => a - b);
  const uit: number[] = [];
  for (const x of mm) {
    if (uit.length === 0 || Math.abs(x - uit[uit.length - 1]) > TOLERANTIE_STEUNPAAR_MM) {
      uit.push(x);
    }
  }
  return uit;
}

/** Spiegel van `steunpunten_hele_doorsnede` in de kern. */
export function steunpuntenHeleDoorsnede(
  lengteMm: number,
  boven?: readonly number[],
  onder?: readonly number[],
): { steunpuntenMm: number[]; lCrMm: number | null; alleenBoven: number; alleenOnder: number } {
  if (!(Number.isFinite(lengteMm) && lengteMm > 0)) {
    return { steunpuntenMm: [], lCrMm: null, alleenBoven: 0, alleenOnder: 0 };
  }
  const b = naarMm(boven, lengteMm);
  const o = naarMm(onder, lengteMm);
  const gebruikt = o.map(() => false);
  const punten: number[] = [];
  for (const x of b) {
    const j = o.findIndex((y, i) => !gebruikt[i] && Math.abs(x - y) <= TOLERANTIE_STEUNPAAR_MM);
    if (j >= 0) {
      gebruikt[j] = true;
      punten.push((x + o[j]) / 2);
    }
  }
  const alleenBoven = b.length - punten.length;
  const alleenOnder = o.length - gebruikt.filter(Boolean).length;
  if (punten.length === 0) return { steunpuntenMm: [], lCrMm: null, alleenBoven, alleenOnder };
  const grenzen = [0, ...punten, lengteMm];
  let lCr = 0;
  for (let i = 1; i < grenzen.length; i++) lCr = Math.max(lCr, grenzen[i] - grenzen[i - 1]);
  return { steunpuntenMm: punten, lCrMm: lCr, alleenBoven, alleenOnder };
}

/**
 * De kniklengte die de kern om deze as gaat gebruiken.
 *
 * `steunen` alleen meegeven voor de as UIT het vlak (z); om y leidt de kern
 * niets uit steunen af.
 */
export function voorspelKniklengte(
  opgegevenM: number | undefined,
  lengteMm: number,
  steunen?: { boven?: readonly number[]; onder?: readonly number[] },
): VoorspeldeKniklengte {
  const afleiding = steunen
    ? steunpuntenHeleDoorsnede(lengteMm, steunen.boven, steunen.onder)
    : { steunpuntenMm: [], lCrMm: null, alleenBoven: 0, alleenOnder: 0 };
  if (opgegevenM !== undefined && Number.isFinite(opgegevenM) && opgegevenM > 0) {
    return { ...afleiding, lCrMm: opgegevenM * 1000, herkomst: HERKOMST_OPGEGEVEN };
  }
  if (afleiding.lCrMm !== null) {
    return { ...afleiding, lCrMm: afleiding.lCrMm, herkomst: HERKOMST_KIPSTEUNEN };
  }
  return { ...afleiding, lCrMm: lengteMm, herkomst: HERKOMST_STAAFLENGTE };
}
