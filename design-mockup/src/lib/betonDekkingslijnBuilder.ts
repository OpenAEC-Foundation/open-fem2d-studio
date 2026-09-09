/**
 * betonDekkingslijnBuilder — de invoer voor de dekkingslijndienst uit de
 * stores.
 *
 * ── WAT DEZE BOUWER DOET ───────────────────────────────────────────────────
 *
 * Per betonstaaf één `DekkingslijnVerzoek`: de staaf zelf plus de vier keuzes
 * die de dekkingslijn kent en de doorsnedetoets niet (z, c_d, A_sl en cot θ).
 * De rekenkern maakt daar figuur 9.2 van §9.2.1.3 van als GETALLEN — per plaats
 * de benodigde en de aanwezige trekkracht, met het bewijs dat daar gold — plus
 * de dwarskrachtlijn van §6.2 en de steunpunteisen van §9.2.1.4/§9.2.1.5.
 *
 * ── WAAROM HIJ `buildBetonCheckInputs` HERGEBRUIKT ─────────────────────────
 *
 * Het verzoek draagt de betonstaaf in `beam`, en dat veld is van het type
 * `ConcreteBeamCheckInput` — precies wat `buildBetonCheckInputs` al bouwt. Die
 * bouwer doet meer dan velden overtypen: hij herkent de betonstaven aan
 * materiaal én profiel, meldt de niet-toetsbare staven mét reden, vult de
 * afgeleide meewerkende flensbreedte in (5.3.2.1) en stelt de omhullende samen
 * uit de UGT-combinaties. Dat allemaal een tweede keer opschrijven zou
 * betekenen dat de dekkingslijn een andere verzameling staven, een andere
 * b_eff of een andere omhullende kan krijgen dan de toetsing — en juist die
 * twee horen over dezelfde staaf hetzelfde te zeggen.
 *
 * Dit bestand is daarom kort met opzet: het roept die bouwer aan en hangt er de
 * dekkingslijnkeuzes aan. Zie ook de moduletekst van
 * `concrete-check/src/dekkingslijn.rs` voor waarom de Rust-kant hetzelfde
 * invoertype hergebruikt in plaats van een tweede, bijna gelijk type te dragen.
 *
 * ── DE ZONEGRENZEN MOETEN REKENKNOPEN ZIJN ─────────────────────────────────
 *
 * De weerstandslijn SPRINGT op elke zonegrens. Staat er op die plaats geen
 * station in de omhullende, dan zet de dekkingslijn daar een benodigde kracht
 * van elders naast een weerstand van hier. Dat wordt geregeld in
 * `lib/betonZoneSneden.ts`, dat `bouwMultiInput` de grenzen als
 * `SolverBeamInput.extraSneden` laat meegeven — dezelfde zonelijsten, één bron.
 * [`ontbrekendeZoneStations`] hieronder controleert dat het ook werkelijk zo is
 * uitgekomen, zodat een verzoek dat langs die weg is misgelopen niet als een
 * geloofwaardige lijn eindigt.
 *
 * ── ÉÉN STAAF PER AANROEP ──────────────────────────────────────────────────
 *
 * De dienst neemt één staaf, net als `concrete_mn_kappa`. Deze bouwer levert
 * dus een LIJST verzoeken en geen lijstverzoek; de aanroeper roept de kern per
 * staaf aan. Dat is met opzet: het venster dat de lijn tekent toont er één
 * tegelijk, en een staaf die faalt (een korf die niet past, zones met een gat)
 * mag de andere niet meeslepen.
 */
import type { Beam, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { CheckSkip } from "./checkTypes";
import type { DekkingslijnVerzoek } from "./types/concrete/DekkingslijnVerzoek";
import type { DekkingslijnAntwoord } from "./types/concrete/DekkingslijnAntwoord";
import type { ReinforcementZones } from "./types/concrete/ReinforcementZones";
import {
  buildBetonCheckInputs,
  type BetonStaafConfig,
} from "./betonCheckBuilder";
import { zoneGrenzenMm } from "./betonZoneSneden";

/**
 * De keuzes die de dekkingslijn kent en de doorsnedetoets niet, per staaf-id.
 *
 * Alle vier optioneel, en weglaten betekent overal NIET OPGEGEVEN. Er wordt er
 * hier geen enkele ingevuld: de kern meldt zelf wat zij bij een ontbrekend
 * gegeven heeft aangehouden, en dat staat dan in `notes` van het antwoord.
 */
export interface DekkingslijnKeuzes {
  /**
   * De inwendige hefboomsarm z in mm waarmee figuur 9.2 het moment op kracht
   * omrekent (F = M_Ed/z).
   *
   * Ontbreekt hij, dan houdt de kern z = 0,9·d per snede aan volgens 6.2.3(1)
   * — maar UITSLUITEND als er nergens een normaalkracht werkt. Werkt die er
   * wél, dan komt er een fout met die reden en géén lijn. Dat is de bedoelde
   * uitkomst: 6.2.3(1) staat de vereenvoudiging alleen toe "voor gewapend
   * beton zonder normaalkracht", en stilzwijgend 0,9·d invullen zou de
   * benodigde trekkracht te laag maken.
   */
  zMm?: number;
  /**
   * c_d volgens figuur 8.3 in mm. Ontbreekt hij, dan rekent de kern met c_d = 0
   * — de ONBEPAALDE waarde, waarbij alle alfa-factoren van tabel 8.2 op 1,0
   * uitkomen en l_bd maximaal is. Dat is de veilige kant.
   */
  cDMm?: number;
  /**
   * A_sl in mm² volgens 6.2.2(1). Ontbreekt hij, dan neemt de kern de trekrij
   * van de korf die op die plaats geldt, en meldt zij per punt óók welke
   * deelverzameling aantoonbaar ≥ (l_bd + d) naar beide kanten doorloopt.
   */
  aSlMm2?: number;
  /**
   * cot θ binnen 1,0 … 2,5 (NB bij 6.2.3(2)). Ontbreekt hij, dan kiest de
   * dwarskrachttoets θ per snede zelf en houdt de verschuiving a_l de
   * bovengrens aan — een grotere cot θ geeft volgens (9.2) een grotere a_l.
   */
  cotTheta?: number;
}

export interface DekkingslijnBuildData {
  nodes: Node[];
  beams: Beam[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
  /** Wapeningskorf en betoninstellingen per staaf-id — zelfde map als de toetsing. */
  korven: Map<number, BetonStaafConfig>;
  /** Runtime-lijst uit `list_concrete_classes` (namen); leeg → statische fallback. */
  supportedClasses?: string[];
  /** De afgeleide meewerkende flensbreedte b_eff per staaf-id, in mm (5.3.2.1). */
  bEffPerStaaf?: Map<number, number>;
  /** De dekkingslijnkeuzes per staaf-id; ontbreekt → alle vier niet opgegeven. */
  keuzes?: Map<number, DekkingslijnKeuzes>;
}

export interface DekkingslijnBuildResult {
  verzoeken: DekkingslijnVerzoek[];
  /** Betonstaven die herkend maar niet te tekenen zijn, met reden. */
  skipped: CheckSkip[];
}

/**
 * Bouw per betonstaaf één verzoek om de dekkingslijn.
 *
 * De staafherkenning, de overgeslagen staven met hun reden, de b_eff en de
 * omhullende komen ONVERANDERD uit `buildBetonCheckInputs`; hier komen alleen
 * de vier dekkingslijnkeuzes bij.
 */
export function bouwDekkingslijnVerzoeken(
  data: DekkingslijnBuildData,
): DekkingslijnBuildResult {
  const { inputs, skipped } = buildBetonCheckInputs({
    nodes: data.nodes,
    beams: data.beams,
    combinations: data.combinations,
    combinationResults: data.combinationResults,
    korven: data.korven,
    supportedClasses: data.supportedClasses,
    bEffPerStaaf: data.bEffPerStaaf,
  });

  const verzoeken = inputs.map((beam) => {
    const k = data.keuzes?.get(beam.beam_id);
    return {
      beam,
      // Alleen meesturen wat werkelijk is opgegeven. Een veld met `undefined`
      // zou door `deny_unknown_fields` heen komen maar wel in de JSON als
      // `null` kunnen belanden, en `null` is voor de kern iets anders dan
      // afwezig; expliciet weglaten houdt "niet opgegeven" ondubbelzinnig.
      ...(k?.zMm !== undefined && k.zMm > 0 ? { z_mm: k.zMm } : {}),
      ...(k?.cDMm !== undefined && k.cDMm >= 0 ? { c_d_mm: k.cDMm } : {}),
      ...(k?.aSlMm2 !== undefined && k.aSlMm2 >= 0 ? { a_sl_mm2: k.aSlMm2 } : {}),
      ...(k?.cotTheta !== undefined && k.cotTheta > 0 ? { cot_theta: k.cotTheta } : {}),
    } satisfies DekkingslijnVerzoek;
  });

  return { verzoeken, skipped };
}

/**
 * De zonegrenzen waar de OMHULLENDE geen station heeft, in mm.
 *
 * Waarom dit bestaat: de weerstand springt op elke zonegrens, en zonder station
 * op die plaats zet de dekkingslijn daar een benodigde kracht van elders naast
 * een weerstand van hier. `bouwMultiInput` zorgt via `extraSneden` dat die
 * knopen er komen, maar de adapter mag een snede laten vallen — hij weegt haar
 * tegen de dwingende fracties (plaatranden, staafpuntlasten, segmentgrenzen)
 * en tegen `MIN_SEGMENT_MM`, en in een model MET platen zet hij helemaal geen
 * extra sneden. Dat is daar terecht, maar het mag niet stilzwijgend gebeuren.
 *
 * Deze functie meldt dus wat er is misgelopen, zodat de aanroeper het kan
 * tonen in plaats van een lijn te tekenen die op die plaats niets waard is.
 * Een LEGE uitkomst betekent: elke zonegrens heeft een station.
 *
 * De speling is dezelfde `tolerantieMm` waarmee de aanroeper stations
 * vergelijkt; standaard 1 mm, ruim genoeg voor de afrondruis van een
 * stationspositie die uit een deling van de staaflengte komt en te krap om een
 * gemiste grens te verbergen.
 */
export function ontbrekendeZoneStations(
  zones: ReinforcementZones | undefined,
  verzoek: DekkingslijnVerzoek,
  tolerantieMm = 1.0,
): number[] {
  const lengteMm = verzoek.beam.length_m * 1000;
  const stations = verzoek.beam.forces_envelope.map((p) => p.position_mm);
  return zoneGrenzenMm(zones).filter(
    (x) =>
      x > tolerantieMm &&
      x < lengteMm - tolerantieMm &&
      !stations.some((s) => Math.abs(s - x) <= tolerantieMm),
  );
}

/** De vorm van `roepKern` uit `stores/checkStore`. */
export type RoepKern = <T>(opdracht: string, inputs?: unknown) => Promise<T>;

/**
 * Vraag de dekkingslijn van één staaf op bij de rekenkern.
 *
 * Dezelfde weg als de rest van de toetsing: in de desktop-app via Tauri, in de
 * browser via de toetsbrug van de dev-server. `roepKern` wordt DYNAMISCH
 * geïmporteerd, zodat een aanroeper met een eigen kernaanroep (de
 * testbatterij, die de toetsbrug als apart proces start) de Tauri-glue niet
 * meesleept — dezelfde constructie als in `lib/betonStijfheid.ts`.
 *
 * Er wordt hier NIETS opgevangen. Weigert de kern het verzoek — een korf die
 * niet past, zones met een gat, of z = 0,9·d terwijl er een normaalkracht
 * werkt — dan hoort die reden bij de gebruiker terecht te komen en niet in een
 * lege lijn te verdwijnen.
 */
export async function haalDekkingslijn(
  verzoek: DekkingslijnVerzoek,
  roep?: RoepKern,
): Promise<DekkingslijnAntwoord> {
  if (roep) return roep<DekkingslijnAntwoord>("concrete_dekkingslijn", verzoek);
  const { roepKern } = await import("../stores/checkStore");
  return roepKern<DekkingslijnAntwoord>("concrete_dekkingslijn", verzoek);
}

/**
 * De maatgevende unity checks van één antwoord, als één regel voor het paneel.
 *
 * Kort en zonder oordeel: de kern heeft de maatgevende punten al aangewezen
 * (bij de momentendekking BUITEN de eindzones, want daar geldt §9.2.1.4/
 * §9.2.1.5 en niet de vrije dekkingslijn), en hier wordt niets opnieuw
 * gezocht. Leeg = de kern kon geen unity check bepalen; dat is iets anders dan
 * "voldoet".
 */
export function dekkingslijnSamenvatting(a: DekkingslijnAntwoord): string {
  const delen: string[] = [];
  if (a.uc_moment_max !== undefined && a.uc_moment_max !== null) {
    delen.push(`momentdekking UC ${a.uc_moment_max.toFixed(2)}`);
  }
  if (a.uc_dwarskracht_max !== undefined && a.uc_dwarskracht_max !== null) {
    delen.push(`dwarskrachtdekking UC ${a.uc_dwarskracht_max.toFixed(2)}`);
  }
  if (delen.length === 0) return "geen unity check te bepalen — zie de toelichting";
  return delen.join(", ");
}
