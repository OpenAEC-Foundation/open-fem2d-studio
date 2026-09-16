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
 * 1. Een OPGEGEVEN waarde per staaf (§5.8-blok) gaat vóór alles: §5.8.4 hangt
 *    φ_ef uitdrukkelijk aan het element, dus een eigen waarde is de specifiekere.
 * 2. Dan de OPGEGEVEN projectwaarde.
 * 3. Dan de BEREKENDE waarde volgens bijlage B (B.1–B.9), per staaf uit de
 *    kern (`concrete_creep_coefficient`), met h₀ uit de doorsnede van die
 *    staaf en RH, t₀ en de cementklasse van het project. Een opgegeven waarde
 *    gaat voor, omdat de constructeur daarmee iets weet wat de kern niet weet
 *    (een gedeeltelijk uitdrogende omtrek, een andere verhardingstemperatuur).
 * Alle drie afwezig betekent NIET OPGEGEVEN, en dat is iets anders dan 0
 * ("geen kruip"): de kern meldt het dan en keurt een toets die kruip nodig
 * heeft niet goed.
 *
 * HET REKENWERK staat in de kern (`nen_en_1992_1_1::kruip`); deze module
 * verzamelt alleen de invoer per staaf en kiest welke waarde geldt.
 */
import type { Beam } from "../components/fem/femTypes";
import type { ConcreteColumnInput } from "./types/concrete/ConcreteColumnInput";
import type { CementClass } from "./types/concrete/CementClass";
import type { CreepCoefficientRequest } from "./types/concrete/CreepCoefficientRequest";
import type { CreepCoefficientResponse } from "./types/concrete/CreepCoefficientResponse";
import type { NationaleBijlage } from "./types/norm/NationaleBijlage";
import { matchSupportedConcreteClass, parseConcreteSection } from "./betonCheckBuilder";

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

/**
 * De φ(∞,t₀) van een staaf: eigen waarde, anders die van het project, anders
 * de berekende waarde volgens bijlage B (zie DE REGEL bovenaan).
 */
export function kruipcoefficientVanStaaf(
  eigen: number | undefined,
  project: number | null | undefined,
  berekend?: number,
): number | undefined {
  if (eigen !== undefined) return eigen;
  if (project !== null && project !== undefined) return project;
  return berekend;
}

/**
 * Het §5.8-blok zoals het naar de kolomtoets gaat: met de φ(∞,t₀) volgens
 * `kruipcoefficientVanStaaf`. Zonder blok blijft het `undefined` — de
 * projectwaarde maakt van een staaf geen kolom.
 */
export function kolomMetKruipcoefficient(
  kolom: ConcreteColumnInput | undefined,
  project: number | null | undefined,
  berekend?: number,
): ConcreteColumnInput | undefined {
  if (!kolom) return undefined;
  const phi = kruipcoefficientVanStaaf(kolom.phi_inf_t0, project, berekend);
  return phi === undefined ? kolom : { ...kolom, phi_inf_t0: phi };
}

// ── Bijlage B: de invoer van het project en de aanroep van de kern ─────────

/**
 * De projectinvoer voor φ(∞,t₀) volgens bijlage B. De fictieve dikte h₀ staat
 * er NIET in: die hoort bij de doorsnede van elke staaf (B.6).
 */
export interface KruipInvoerProject {
  /** Relatieve vochtigheid van de omgeving, % (bijvoorbeeld 50 binnen, 80 buiten). */
  rhProcent: number;
  /** Ouderdom van het beton bij belasten, dagen. */
  t0Dagen: number;
  /** Cementklasse volgens art. 3.1.2(6). */
  cementklasse: CementClass;
}

export const CEMENTKLASSEN: readonly CementClass[] = ["S", "N", "R"];

/**
 * De beginwaarden als de gebruiker bijlage B aanzet: het binnenmilieu van
 * figuur 3.1a (RH 50 %), belasten na 28 dagen, cement N. Het zijn zichtbare,
 * direct aan te passen invulwaarden en geen stille aanname: zolang bijlage B
 * uit staat, wordt er niets berekend.
 */
export const STANDAARD_KRUIPINVOER: KruipInvoerProject = {
  rhProcent: 50,
  t0Dagen: 28,
  cementklasse: "N",
};

/**
 * Is deze invoer bruikbaar, of komt hij uit een beschadigd of ouder bestand?
 * Alleen de VORM wordt hier bekeken; de grenzen (RH ≤ 100, t₀ > 0) bewaakt de
 * kern, met reden.
 */
export function leesKruipInvoer(waarde: unknown): KruipInvoerProject | null {
  if (!waarde || typeof waarde !== "object") return null;
  const w = waarde as Record<string, unknown>;
  if (typeof w.rhProcent !== "number" || !Number.isFinite(w.rhProcent)) return null;
  if (typeof w.t0Dagen !== "number" || !Number.isFinite(w.t0Dagen)) return null;
  if (!CEMENTKLASSEN.includes(w.cementklasse as CementClass)) return null;
  return {
    rhProcent: w.rhProcent,
    t0Dagen: w.t0Dagen,
    cementklasse: w.cementklasse as CementClass,
  };
}

/** Wat de kern per staaf opleverde. */
export interface KruipBerekening {
  /** Het volledige antwoord per staaf-id — de afleiding voor het rapport. */
  perStaaf: Map<number, CreepCoefficientResponse>;
  /** Staven waarvoor de kern weigerde, met zijn reden. */
  mislukt: { beamId: number; reden: string }[];
}

/** De vorm van `roepKern` uit `stores/checkStore`. */
type Roep = <T>(opdracht: string, inputs?: unknown) => Promise<T>;

/**
 * φ(∞,t₀) volgens bijlage B voor elke betonstaaf, uit de kern.
 *
 * Er wordt NIETS gevraagd — en de uitkomst is leeg — als er geen invoer is of
 * als het project een opgegeven φ(∞,t₀) heeft: die gaat voor, dus een
 * berekende waarde zou nergens gebruikt worden. Zo rekent een project zonder
 * de nieuwe invoer precies als voorheen.
 *
 * h₀ volgt uit de INGEVOERDE doorsnede met de hele omtrek (B.6), niet uit de
 * meewerkende flensbreedte: uitdroging gaat over het beton dat er is.
 */
export async function bepaalKruipPerStaaf(
  beams: readonly Pick<Beam, "id" | "material" | "profile">[],
  invoer: KruipInvoerProject | null | undefined,
  projectwaarde: number | null | undefined,
  roep: Roep,
  bijlage?: NationaleBijlage,
): Promise<KruipBerekening> {
  const perStaaf = new Map<number, CreepCoefficientResponse>();
  const mislukt: { beamId: number; reden: string }[] = [];
  if (!invoer || (projectwaarde !== null && projectwaarde !== undefined)) {
    return { perStaaf, mislukt };
  }
  for (const beam of beams) {
    const klasse = matchSupportedConcreteClass(beam.material?.trim() ?? "");
    if (!klasse) continue;
    const vorm = parseConcreteSection(beam.profile);
    if (!vorm.ok) continue; // de betonbouwer meldt deze staaf al met reden
    const verzoek = {
      ...(bijlage ? { bijlage } : {}),
      beam_id: beam.id,
      concrete_class: klasse,
      relative_humidity_pct: invoer.rhProcent,
      t0_days: invoer.t0Dagen,
      cement_class: invoer.cementklasse,
      section: vorm.doorsnede,
    } as CreepCoefficientRequest;
    try {
      perStaaf.set(
        beam.id,
        await roep<CreepCoefficientResponse>("concrete_creep_coefficient", verzoek),
      );
    } catch (e) {
      mislukt.push({ beamId: beam.id, reden: e instanceof Error ? e.message : String(e) });
    }
  }
  return { perStaaf, mislukt };
}

/**
 * Alleen de getallen: φ(∞,t₀) per staaf-id — uit een berekening, of uit de
 * lijst antwoorden die de toetsingsstore bewaart.
 */
export function kruipWaardenPerStaaf(
  berekening: KruipBerekening | readonly CreepCoefficientResponse[] | undefined,
): Map<number, number> {
  const uit = new Map<number, number>();
  if (!berekening) return uit;
  const antwoorden = Array.isArray(berekening)
    ? (berekening as readonly CreepCoefficientResponse[])
    : [...(berekening as KruipBerekening).perStaaf.values()];
  for (const a of antwoorden) uit.set(a.beam_id, a.uitkomst.phi_inf_t0);
  return uit;
}
