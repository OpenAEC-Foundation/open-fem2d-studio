/**
 * vrijMateriaal — een materiaal dat door geen enkele norm gedekt wordt, met
 * alleen een toelaatbare spanning.
 *
 * WAAR HET STAAT, EN WAAROM DAAR
 * ------------------------------
 * Een staaf draagt materiaal en profiel als NAMEN (`Beam.material`,
 * `Beam.profile`). Alles wat de app over een materiaal moet weten leidt zij
 * uit die naam af: "C24" → hout, "C30/37" → beton, "S355" → staal. Een vrij
 * materiaal heeft geen tabel om in op te zoeken, dus moeten de vier getallen
 * die het beschrijven ergens anders vandaan komen.
 *
 * Twee plekken kwamen in aanmerking:
 *
 *  1. `Beam.checkConfig` — waar ook de wapeningskorf staat. Nadeel: de
 *     stijfheid komt uit `resolveSection(material, profile)`, en die functie
 *     krijgt alleen de twee namen mee, niet de staaf. Een E-modulus in
 *     checkConfig zou de solver dus nooit bereiken, of `resolveSection` zou
 *     overal een derde argument moeten krijgen — een verbouwing door de hele
 *     app voor één materiaalsoort.
 *  2. De NAAM zelf, zoals kruislaaghout zijn hele opbouw in de profielnaam
 *     draagt ("CLT 40/20/40/20/40") en een eigen doorsnede zijn verwijzing
 *     ("EIGEN:<naam>").
 *
 * Het is (2) geworden. De naam reist daarmee automatisch mee in het
 * projectbestand, in de undo-historie, in de staventabel en in het rapport,
 * zonder een tweede opslagplaats die uit de pas kan lopen met het model. De
 * prijs is een langere materiaalnaam; die is leesbaar gehouden.
 *
 * GRAMMATICA (hoofdletterongevoelig voor het voorvoegsel en de sleutels)
 * ---------------------------------------------------------------------
 *
 *   VRIJ:<naam> E=<E> rho=<ρ> f=<f_toel>[ gM=<γ_M>]
 *
 *   VRIJ:Natuursteen E=60000 rho=2700 f=8
 *   VRIJ:Gietijzer E=100000 rho=7200 f=150 gM=1.5
 *
 * met E in N/mm², ρ in kg/m³, f_toel in N/mm² en γ_M dimensieloos (1 wanneer
 * hij ontbreekt). De naam mag spaties bevatten maar niet de tekst " E=".
 */

/** Een materiaal dat alleen door een toelaatbare spanning beschreven is. */
export interface VrijMateriaal {
  /** Naam zoals de gebruiker hem gaf, bijv. "Natuursteen". */
  naam: string;
  /** Elasticiteitsmodulus in N/mm² — stuurt de stijfheid in de solver. */
  eMod: number;
  /** Volumieke massa in kg/m³ — stuurt het eigen gewicht. */
  dichtheid: number;
  /** Toelaatbare spanning in N/mm². */
  fToel: number;
  /** Materiaalfactor γ_M; de rekenwaarde is f_toel/γ_M. Standaard 1. */
  gammaM: number;
}

/** Het voorvoegsel waaraan een vrij materiaal te herkennen is. */
export const VRIJ_PREFIX = "VRIJ:";

const PATROON =
  /^\s*VRIJ:\s*(.+?)\s+E\s*=\s*([\d.,]+)\s+rho\s*=\s*([\d.,]+)\s+f\s*=\s*([\d.,]+)(?:\s+gM\s*=\s*([\d.,]+))?\s*$/i;

/** Herkent een materiaalnaam als vrij materiaal (nog zonder te ontleden). */
export function isVrijMateriaal(material: string | undefined): boolean {
  return /^\s*VRIJ:/i.test(material ?? "");
}

function getal(tekst: string): number {
  return parseFloat(tekst.replace(",", "."));
}

/**
 * Materiaalnaam → vrij materiaal. `null` wanneer de naam geen vrij materiaal
 * is of niet volledig is — dan hoort de staaf bij de overgeslagen staven te
 * komen, met de reden erbij. Geen enkel getal wordt hier aangevuld: een
 * verzonnen E-modulus of toelaatbare spanning is precies wat we niet willen.
 */
export function parseVrijMateriaal(material: string | undefined): VrijMateriaal | null {
  const m = PATROON.exec(material ?? "");
  if (!m) return null;
  const naam = m[1].trim();
  const eMod = getal(m[2]);
  const dichtheid = getal(m[3]);
  const fToel = getal(m[4]);
  const gammaM = m[5] !== undefined ? getal(m[5]) : 1;
  if (!naam) return null;
  if (!(eMod > 0) || !(dichtheid >= 0) || !(fToel > 0) || !(gammaM > 0)) return null;
  return { naam, eMod, dichtheid, fToel, gammaM };
}

/** Getal als tekst met een punt als decimaalteken (de opslagvorm). */
function maat(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/**
 * Vrij materiaal → materiaalnaam. γ_M = 1 wordt weggelaten, zodat de kortste
 * vorm er ook na een rondreis door de kiezer hetzelfde uitziet.
 */
export function formatVrijMateriaal(m: VrijMateriaal): string {
  const basis = `${VRIJ_PREFIX}${m.naam.trim()} E=${maat(m.eMod)} rho=${maat(m.dichtheid)} f=${maat(m.fToel)}`;
  return m.gammaM !== 1 ? `${basis} gM=${maat(m.gammaM)}` : basis;
}

/** Korte weergave voor tabellen en kopregels: "Natuursteen (f = 8 N/mm²)". */
export function vrijMateriaalLabel(m: VrijMateriaal): string {
  const f = m.fToel.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  return `${m.naam} (f = ${f} N/mm²)`;
}

/**
 * Naam voor de kopregel van een staaf: de leesbare naam wanneer het een vrij
 * materiaal is, anders de naam ongewijzigd. Zo staat er "Natuursteen" in de
 * staventabel en niet de hele codering.
 */
export function materiaalWeergave(material: string | undefined): string {
  const vrij = parseVrijMateriaal(material);
  if (vrij) return vrijMateriaalLabel(vrij);
  return material ?? "—";
}
