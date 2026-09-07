/**
 * laatsteLastwaarden — onthoudt per lastsoort de waarde die je er als laatste
 * hebt ingevuld, en biedt die aan als startwaarde bij de volgende plaatsing.
 *
 * Waarom: wie tien lijnlasten van 8 kN/m plaatst, wil die 8 niet tien keer
 * intypen. Het formulier vult de vorige waarde alvast in; wijzigen mag altijd.
 *
 * Twee bewuste grenzen:
 *
 *  1. SESSIEGEHEUGEN, geen projectgegeven. De waarden staan in
 *     module-state — ze gaan niet mee in het projectbestand en niet naar de
 *     solver. Een project dat je morgen opent begint dus weer bij de
 *     ingebouwde beginwaarden. Dat is de bedoeling: het is invoergemak, geen
 *     modelinhoud.
 *  2. ZICHTBAAR, niet stiekem. `isOnthouden()` vertelt het formulier dat de
 *     voorgevulde waarde uit de vorige plaatsing komt, zodat het dat erbij
 *     kan zetten. Een last die ineens 8 kN/m is zonder dat je weet waarom is
 *     erger dan een last die je zelf hebt ingetypt.
 *
 * De sleutels volgen de gereedschappen uit de werkbalk, niet de lasttypen uit
 * het model: een verticale en een horizontale puntlast zijn allebei een
 * `pointForce`, maar je vult ze verschillend in en ze verdienen dus een eigen
 * geheugen.
 */

/** Lastsoort zoals de gebruiker hem plaatst (werkbalkgereedschap). */
export type LastSoort =
  | "lijnlast"
  | "puntlastV"
  | "puntlastH"
  | "moment"
  | "temperatuur"
  | "randlast";

/** Wat er per soort onthouden wordt. Alle velden optioneel per soort. */
export interface Lastwaarden {
  /** Lijnlast/randlast: q of p in kN/m. */
  q?: number;
  /** Lijnlast/randlast: richting in globale assen. */
  qDir?: "x" | "z";
  /** Puntlast: Fx in kN. */
  fx?: number;
  /** Puntlast: Fz in kN. */
  fz?: number;
  /** Moment: My in kNm. */
  my?: number;
  /** Temperatuurlast: ΔT in K. */
  deltaT?: number;
}

/**
 * Beginwaarden zoals de formulieren die altijd al toonden. Deze blijven de
 * eerste keer per sessie staan — het geheugen vervangt ze pas nadat je zelf
 * een last hebt geplaatst.
 */
export const STANDAARD_LASTWAARDEN: Record<LastSoort, Lastwaarden> = {
  lijnlast:     { q: -5, qDir: "z" },
  puntlastV:    { fx: 0, fz: -10 },
  puntlastH:    { fx: 10, fz: 0 },
  moment:       { my: 5 },
  temperatuur:  { deltaT: 20 },
  randlast:     { q: -5, qDir: "z" },
};

/** Sessiegeheugen — leeg tot de gebruiker zelf een last plaatst. */
const geheugen = new Map<LastSoort, Lastwaarden>();

/**
 * De startwaarden voor een nieuwe plaatsing: de laatst ingevulde waarden als
 * die er zijn, anders de ingebouwde beginwaarden.
 */
export function lastwaarden(soort: LastSoort): Lastwaarden {
  return geheugen.get(soort) ?? STANDAARD_LASTWAARDEN[soort];
}

/**
 * Komt de startwaarde van deze soort uit de vorige plaatsing? Het formulier
 * zet er dan een regel bij zodat de voorgevulde waarde verklaard is.
 */
export function isOnthouden(soort: LastSoort): boolean {
  return geheugen.has(soort);
}

/**
 * Leg vast wat er zojuist is ingevuld. Alleen eindige getallen worden
 * bewaard; een leeg of ongeldig veld laat de vorige waarde staan in plaats
 * van er `NaN` van te maken.
 */
export function onthoudLastwaarden(soort: LastSoort, waarden: Lastwaarden): void {
  const vorige = geheugen.get(soort) ?? {};
  const nieuw: Lastwaarden = { ...vorige };
  if (Number.isFinite(waarden.q))      nieuw.q = waarden.q;
  if (Number.isFinite(waarden.fx))     nieuw.fx = waarden.fx;
  if (Number.isFinite(waarden.fz))     nieuw.fz = waarden.fz;
  if (Number.isFinite(waarden.my))     nieuw.my = waarden.my;
  if (Number.isFinite(waarden.deltaT)) nieuw.deltaT = waarden.deltaT;
  if (waarden.qDir === "x" || waarden.qDir === "z") nieuw.qDir = waarden.qDir;
  geheugen.set(soort, nieuw);
}

/** Wis het geheugen — alleen voor tests en voor "nieuw project". */
export function vergeetLastwaarden(): void {
  geheugen.clear();
}
