/**
 * Welke φ(∞,t₀) geldt voor een betonstaaf — één regel voor de BGT-stijfheidslus
 * en de kolomtoets.
 *
 * WAAROM DIT EEN EIGEN MODULE IS
 * De eindkruipcoëfficiënt (NEN-EN 1992-1-1 art. 3.1.4) kan op twee plaatsen
 * worden opgegeven: als PROJECTWAARDE (`betonKruipcoefficient`, opgeslagen in
 * het projectbestand) en PER STAAF in het §5.8-blok (`betonKolom.phi_inf_t0`).
 * Twee rekengangen lezen hem: de fysisch niet-lineaire lus
 * (`betonStijfheid.ts`, §5.8.6(4)) en de kolomtoets in de kern (§5.8.3.1 A en
 * §5.8.4 (5.19)). Zouden ze elk hun eigen voorrangsregel hebben, dan kan de
 * krachtsverdeling met de ene φ zijn gerekend en de slankheidstoets met een
 * andere — of met geen, en dan viel de kolomtoets om de z-as vroeger stil terug
 * op φ_ef = 0. De gebruiker geeft φ één keer op; deze module zegt voor beide
 * welke waarde dat is.
 *
 * DE REGEL
 * Per staaf gaat vóór per project: §5.8.4 hangt φ_ef uitdrukkelijk aan het
 * element, dus een eigen waarde is de specifiekere. Allebei afwezig betekent
 * NIET OPGEGEVEN, en dat is iets anders dan 0 ("geen kruip"): de kern meldt het
 * dan en keurt een toets die kruip nodig heeft niet goed.
 */
import type { Beam } from "../components/fem/femTypes";
import type { ConcreteColumnInput } from "./types/concrete/ConcreteColumnInput";
import { matchSupportedConcreteClass } from "./betonCheckBuilder";

/**
 * Bevat het model een betonstaaf (materiaal met een volledige sterkteklasse,
 * "C30/37")? Met of zonder korf: een staaf zonder korf wordt vandaag
 * overgeslagen, maar krijgt hij er een, dan rekent de projectwaarde meteen mee.
 */
export function modelHeeftBetonstaaf(beams: readonly Pick<Beam, "material">[]): boolean {
  return beams.some((b) => matchSupportedConcreteClass(b.material?.trim()) !== null);
}

/**
 * Wanneer het invoerveld voor de projectwaarde van φ(∞,t₀) zichtbaar is.
 *
 * WAAROM NIET ALLEEN BIJ DE FYSISCH NIET-LINEAIRE STAND. De projectwaarde
 * voedt twee rekengangen: de BGT-stijfheid (§5.8.6(4), alleen in die stand) én
 * de kolomtoets (§5.8.3.1 A, §5.8.4 (5.19)), die bij ELK analysetype loopt.
 * Een veld dat verdwijnt terwijl zijn waarde meerekent, is een stille invloed
 * op de uitkomst. Daarom: zichtbaar zodra het model een betonstaaf bevat, en
 * ook zolang er een waarde staat — zodat een ingevulde waarde altijd te zien
 * en te wissen is.
 */
export function kruipveldZichtbaar(
  heeftBetonstaaf: boolean,
  projectwaarde: number | null | undefined,
): boolean {
  return heeftBetonstaaf || (projectwaarde !== null && projectwaarde !== undefined);
}

/** De φ(∞,t₀) van een staaf: eigen waarde, anders die van het project. */
export function kruipcoefficientVanStaaf(
  eigen: number | undefined,
  project: number | null | undefined,
): number | undefined {
  if (eigen !== undefined) return eigen;
  return project ?? undefined;
}

/**
 * Het §5.8-blok zoals het naar de kolomtoets gaat: met de φ(∞,t₀) volgens
 * `kruipcoefficientVanStaaf`. Zonder blok blijft het `undefined` — de
 * projectwaarde maakt van een staaf geen kolom.
 */
export function kolomMetKruipcoefficient(
  kolom: ConcreteColumnInput | undefined,
  project: number | null | undefined,
): ConcreteColumnInput | undefined {
  if (!kolom) return undefined;
  const phi = kruipcoefficientVanStaaf(kolom.phi_inf_t0, project);
  return phi === undefined ? kolom : { ...kolom, phi_inf_t0: phi };
}
