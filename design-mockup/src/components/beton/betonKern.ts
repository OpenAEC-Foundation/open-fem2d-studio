/**
 * betonKern.ts — typed aanroepen van de betonopdrachten in de rekenkern.
 *
 * De aanroeplaag zelf staat NIET meer hier. `roepBetonKern` was een bewuste
 * kopie van `roepKern` in stores/checkStore.ts (in de desktop-app via Tauri's
 * `invoke`, in de browser via het eindpunt `/api/toetsing` van de dev-server),
 * met de afspraak dat de kopie zou verdwijnen zodra `roepKern` geëxporteerd
 * was. Dat is gebeurd: hieronder staat alleen nog een doorgeefluik onder de
 * oude naam, zodat de bestaande aanroepen ongewijzigd blijven werken.
 *
 * Opdrachten (zie src-tauri/crates/toetsbrug/src/main.rs):
 *  - list_concrete_classes      → ConcreteClass[]     (tabel 3.1, volledig)
 *  - list_reinforcement_grades  → ReinforcementGrade[] (bijlage C)
 *  - concrete_mn_kappa          → MnKappaResponse     (diagram voor één korf)
 *  - check_concrete_beams       → ConcreteBeamCheckResult[]
 *  - concrete_segment_stiffness → SegmentStiffnessResponse (de segment-EI's;
 *    de lus die daarmee rekent staat in lib/betonStijfheid.ts en roept
 *    `roepKern` rechtstreeks aan)
 *  - concrete_effective_flange_width → EffectiveFlangeWidthResponse
 *    (b_eff per gebied van figuur 5.2; de liggerlijn komt uit
 *    lib/beffLiggerlijn.ts)
 *  - list_exposure_classes      → ExposureClassInfo[]  (tabel 4.1, volledig)
 *  - concrete_cover_check       → ConcreteCoverResponse (4.4.1: c_min,dur uit
 *    tabel 4.4N van de nationale bijlage, c_min uit (4.2), c_nom uit (4.1))
 */
import { roepKern } from "../../stores/checkStore";
import type { ConcreteClass } from "../../lib/types/concrete/ConcreteClass";
import type { ReinforcementGrade } from "../../lib/types/concrete/ReinforcementGrade";
import type { MnKappaRequest } from "../../lib/types/concrete/MnKappaRequest";
import type { MnKappaResponse } from "../../lib/types/concrete/MnKappaResponse";
import type { ConcreteBeamCheckInput } from "../../lib/types/concrete/ConcreteBeamCheckInput";
import type { ConcreteBeamCheckResult } from "../../lib/types/concrete/ConcreteBeamCheckResult";
import type { EffectiveFlangeWidthRequest } from "../../lib/types/concrete/EffectiveFlangeWidthRequest";
import type { EffectiveFlangeWidthResponse } from "../../lib/types/concrete/EffectiveFlangeWidthResponse";
import type { ExposureClassInfo } from "../../lib/types/concrete/ExposureClassInfo";
import type { ConcreteCoverRequest } from "../../lib/types/concrete/ConcreteCoverRequest";
import type { ConcreteCoverResponse } from "../../lib/types/concrete/ConcreteCoverResponse";

/**
 * Doorgeefluik naar `roepKern`. Blijft bestaan omdat het paneel de aanroep
 * ook als prop kan krijgen (`berekenDiagram`) en die naam daar in gebruik is;
 * er zit geen eigen implementatie meer onder.
 */
export const roepBetonKern = roepKern;

// Module-level caches — de materiaaltabellen veranderen niet tijdens een sessie.
let betonklassenCache: ConcreteClass[] | null = null;
let staalsoortenCache: ReinforcementGrade[] | null = null;
let milieuklassenCache: ExposureClassInfo[] | null = null;

/** Tabel 3.1 uit de kern (alle kolommen), gecachet. */
export async function haalBetonklassen(): Promise<ConcreteClass[]> {
  if (betonklassenCache) return betonklassenCache;
  betonklassenCache = await roepBetonKern<ConcreteClass[]>("list_concrete_classes");
  return betonklassenCache;
}

/** Bijlage C uit de kern (B500A/B/C), gecachet. */
export async function haalWapeningsstaal(): Promise<ReinforcementGrade[]> {
  if (staalsoortenCache) return staalsoortenCache;
  staalsoortenCache = await roepBetonKern<ReinforcementGrade[]>("list_reinforcement_grades");
  return staalsoortenCache;
}

/** M-N-κ-diagram en interactiediagram voor één korf. */
export function berekenMnKappa(verzoek: MnKappaRequest): Promise<MnKappaResponse> {
  return roepBetonKern<MnKappaResponse>("concrete_mn_kappa", verzoek);
}

/** Toetsing van betonstaven (invoer uit betonCheckBuilder). */
export function toetsBetonstaven(inputs: ConcreteBeamCheckInput[]): Promise<ConcreteBeamCheckResult[]> {
  return roepBetonKern<ConcreteBeamCheckResult[]>("check_concrete_beams", inputs);
}

/**
 * De meewerkende flensbreedte b_eff per gebied van figuur 5.2 (5.3.2.1).
 *
 * De liggerlijn in het verzoek komt uit `lib/beffLiggerlijn.ts`: die leidt uit
 * knopen, staven en opleggingen af welke staven één doorgaande ligger vormen
 * en waar de steunpunten liggen. Hier wordt niets gerekend — de norm zelf
 * staat in de crate-lib en is langs alle drie de wegen bereikbaar.
 *
 * Een geval buiten figuur 5.2 — een losstaande uitkraging, een uitkraging
 * langer dan de halve aangrenzende overspanning, een overspanningsverhouding
 * buiten 2/3 … 1,5 — komt terug als een afgewezen belofte MET de reden, niet
 * als een getal.
 */
export function bepaalMeewerkendeFlensbreedte(
  verzoek: EffectiveFlangeWidthRequest,
): Promise<EffectiveFlangeWidthResponse> {
  return roepBetonKern<EffectiveFlangeWidthResponse>(
    "concrete_effective_flange_width",
    verzoek,
  );
}

/**
 * Tabel 4.1 uit de kern: de milieuklassen met hun omschrijving en de
 * informatieve voorbeelden, gecachet.
 *
 * De lijst komt uit de kern en staat niet in de frontend, om dezelfde reden
 * als tabel 3.1: een tweede lijst met normteksten loopt uit de pas met de
 * eerste, en dan staat er in de keuzelijst iets anders dan in het rapport.
 */
export async function haalMilieuklassen(): Promise<ExposureClassInfo[]> {
  if (milieuklassenCache) return milieuklassenCache;
  milieuklassenCache = await roepBetonKern<ExposureClassInfo[]>("list_exposure_classes");
  return milieuklassenCache;
}

/**
 * De dekkingstoets van 4.4.1: is de opgegeven c_nom genoeg voor de gekozen
 * milieuklasse?
 *
 * Er wordt hier niets gerekend — c_min,dur (tabel 4.4N in de versie van de
 * nationale bijlage), c_min (4.2) en c_nom (4.1) komen alle drie uit
 * `nen_en_1992_1_1::dekking`, langs dezelfde weg als de rest van de toetsing.
 */
export function toetsDekking(verzoek: ConcreteCoverRequest): Promise<ConcreteCoverResponse> {
  return roepBetonKern<ConcreteCoverResponse>("concrete_cover_check", verzoek);
}
