/**
 * scheurwijdteLijn — w_k(x) langs de staaf, uit de rekenkern zelf.
 *
 * ── WAAROM DIT ANDERS GAAT DAN DE ANDERE DRIE LAGEN ────────────────────────
 *
 * De momentendekking en de dwarskrachtdekking komen kant-en-klaar als LIJN uit
 * `concrete_dekkingslijn`. De scheurwijdte niet: `check_concrete_beams` bepaalt
 * §7.3.4 voor de MAATGEVENDE snede en levert één w_k met de afleiding erbij.
 * Dat is voor een rapport het juiste antwoord, maar het zegt niet wáár langs de
 * staaf de scheuren breed worden — en juist dat verandert op elke zonegrens,
 * omdat A_s daar springt en σ_s dus mee.
 *
 * ── HOE DE LIJN DAN TOCH UIT DE KERN KOMT ──────────────────────────────────
 *
 * Door de kern per SNEDE te vragen. §7.3.4 kijkt naar de doorsnede zelf: de
 * korf die op die plaats ligt en de staalspanning uit de frequente
 * BGT-combinatie op die plaats. Een toetsverzoek waarvan de omhullenden tot één
 * station zijn ingekort, levert daarom precies de scheurwijdte OP DAT STATION —
 * geen benadering en geen tweede formule, maar dezelfde kern op een kleinere
 * vraag. Alle verzoeken gaan in ÉÉN aanroep van `check_concrete_beams`, zodat
 * er één keer heen en weer wordt gepraat.
 *
 * De prijs staat er tegenover: de kern rekent per snede de hele staaftoetsing
 * door (M-N-κ en het interactiediagram incluis), en dat kost in de orde van
 * anderhalve tiende seconde per snede. Daarom staat deze laag standaard UIT en
 * wordt hij pas opgehaald wanneer de gebruiker hem aanzet, en daarom is het
 * aantal sneden begrensd — zie [`SNEDEN_STANDAARD`].
 *
 * ── WELKE SNEDEN ───────────────────────────────────────────────────────────
 *
 * De zonegrenzen liggen er ALTIJD in, en wel twee keer: net links en net rechts
 * ervan. Daar springt de wapening, en een lijn die de sprong overslaat mist
 * precies de plaats waarvoor deze laag bestaat. De rest van de sneden wordt
 * gelijkmatig over de resterende stations verdeeld.
 */
import type { ConcreteBeamCheckInput } from "../../../lib/types/concrete/ConcreteBeamCheckInput";
import type { ConcreteBeamCheckResult } from "../../../lib/types/concrete/ConcreteBeamCheckResult";
import type { ForcePoint } from "../../../lib/types/steel/ForcePoint";
import type { ReinforcementZones } from "../../../lib/types/concrete/ReinforcementZones";
import type { RoepKern } from "../../../lib/betonDekkingslijnBuilder";
import { zoneGrenzenMm } from "../../../lib/betonZoneSneden";
import type { LijnPunt } from "./dekkingLagen";

/** De toets-id die §7.3.4 in de kern draagt. */
const SCHEURTOETS_ID = "7.3.4_scheurwijdte";

/**
 * Hoeveel sneden er standaard worden opgevraagd.
 *
 * Een afweging tussen wachttijd en beeld, geen normwaarde. Bij ongeveer een
 * zesde seconde per snede is dit de grens waarboven de laag als traag gaat
 * voelen, terwijl 33 punten over een staaf ruim genoeg zijn om het verloop en
 * elke sprong te zien. De zonegrenzen komen er BOVENOP en worden nooit
 * weggelaten.
 */
export const SNEDEN_STANDAARD = 33;

/**
 * De afstand waarop de twee sneden rond een zonegrens worden gelegd, mm.
 *
 * De grens ZELF wordt niet bemonsterd, en dat is geen slordigheid maar de kern
 * van de zaak. `check_concrete_beams` deelt de staaf in VAKKEN tussen de
 * zonegrenzen en toetst elk vak met de korf van dat vak; een snede die precies
 * OP een grens ligt, hoort bij twee vakken tegelijk en wordt door de kern aan
 * één ervan toegewezen. Nagemeten gebeurt dat niet consequent aan dezelfde
 * kant: bij de ene grens levert x = grens de korf links, bij de volgende die
 * rechts. Welke van de twee is voor deze laag ook niet interessant — hij wil
 * ZE ALLEBEI zien.
 *
 * Eén millimeter naar weerszijden ligt ondubbelzinnig binnen één vak, en valt
 * in de tekening samen met de grens zelf: bij een staaf van zes meter op
 * duizend beeldpunten is dat een zesde beeldpunt.
 */
const SPRONG_DELTA_MM = 1;

export interface ScheurwijdteLijn {
  /** De lijn: `benodigd` is w_k, `aanwezig` is w_max, beide in mm. */
  punten: LijnPunt[];
  /** Hoeveel sneden er werkelijk bij de kern zijn opgevraagd. */
  aantalSneden: number;
  /**
   * Waarom er geen (volledige) lijn is, in de woorden van de kern zelf.
   * Leeg wanneer elke snede een scheurwijdte opleverde.
   */
  toelichting: string[];
}

/**
 * Vraag w_k per snede op bij de rekenkern.
 *
 * `invoer` is de toetsinvoer van DEZELFDE staaf die de dekkingslijn krijgt —
 * uit `buildBetonCheckInputs`, dus met dezelfde doorsnede, dezelfde korf,
 * dezelfde zones en dezelfde omhullenden. Een tweede bouwer zou hier een
 * andere b_eff of een andere combinatiekeuze kunnen opleveren dan de lijn
 * ernaast, en dan tonen twee lagen van hetzelfde venster twee verschillende
 * staven.
 */
export async function haalScheurwijdteLijn(
  invoer: ConcreteBeamCheckInput,
  zones: ReinforcementZones | undefined,
  roep: RoepKern,
  maxSneden = SNEDEN_STANDAARD,
): Promise<ScheurwijdteLijn> {
  const lengteMm = invoer.length_m * 1000;
  const sls = invoer.sls_frequent_envelope;
  if (sls.length === 0) {
    return {
      punten: [],
      aantalSneden: 0,
      toelichting: [
        "Er is geen frequente BGT-combinatie in het model. §7.3 vraagt de staalspanning in de gescheurde doorsnede onder die combinatie (NEN-EN 1990 (6.15)); uit de UGT-omhullende is zij niet af te leiden. Voeg een combinatie toe waarvan de naam \"frequent\" bevat.",
      ],
    };
  }

  const sneden = kiesSneden(sls, zones, lengteMm, maxSneden);
  const verzoeken: ConcreteBeamCheckInput[] = sneden.map((x, i) => ({
    ...invoer,
    // Het staafnummer is hier een VOLGNUMMER en geen staaf-id: elk verzoek is
    // dezelfde staaf op een andere snede. De antwoorden worden op volgorde
    // teruggelezen, en het nummer maakt in de foutmeldingen van de kern
    // zichtbaar welke snede het betrof.
    beam_id: i,
    forces_envelope: bijX(invoer.forces_envelope, x),
    sls_frequent_envelope: bijX(sls, x),
  }));

  const antwoorden = await roep<ConcreteBeamCheckResult[]>(
    "check_concrete_beams",
    verzoeken,
  );
  if (antwoorden.length !== sneden.length) {
    throw new Error(
      `De rekenkern gaf ${antwoorden.length} antwoorden op ${sneden.length} sneden; de lijn is niet betrouwbaar samen te stellen.`,
    );
  }

  const punten: LijnPunt[] = [];
  const redenen = new Set<string>();
  for (let i = 0; i < antwoorden.length; i++) {
    const toets = antwoorden[i].checks.find((c) => c.kind.data.id === SCHEURTOETS_ID);
    const data = toets?.kind.data;
    if (!data || data.uc === null) {
      // Geen scheurwijdte op deze snede. De reden komt van de kern zelf —
      // meestal een ontbrekende milieuklasse (dan is er geen w_max) of een
      // doorsnede die onder deze belasting niet scheurt.
      for (const n of data?.notes ?? []) redenen.add(n);
      continue;
    }
    punten.push({
      xMm: sneden[i],
      benodigd: data.value,
      aanwezig: data.uc.rd,
      uc: data.uc.uc,
      eindzone: false,
    });
  }
  if (punten.length === 0 && redenen.size === 0) {
    redenen.add(
      "De rekenkern gaf op geen enkele snede een scheurwijdte terug; §7.3.4 is hier niet uitgevoerd.",
    );
  }
  return { punten, aantalSneden: sneden.length, toelichting: [...redenen] };
}

/**
 * De sneden waarop w_k wordt opgevraagd: eerst de plaatsen die er MOETEN zijn
 * (de twee staafeinden en beide kanten van elke zonegrens), daarna de
 * resterende ruimte gelijkmatig opgevuld tot `maxSneden`.
 *
 * De volgorde is oplopend en er zitten geen doublures in; twee sneden die
 * minder dan een halve millimeter schelen zijn dezelfde snede.
 */
export function kiesSneden(
  omhullende: readonly ForcePoint[],
  zones: ReinforcementZones | undefined,
  lengteMm: number,
  maxSneden: number,
): number[] {
  const verplicht: number[] = [0, lengteMm];
  for (const g of zoneGrenzenMm(zones)) {
    // Aan WEERSZIJDEN van de grens, en niet erop — zie SPRONG_DELTA_MM.
    if (g > SPRONG_DELTA_MM && g < lengteMm - SPRONG_DELTA_MM) {
      verplicht.push(g - SPRONG_DELTA_MM, g + SPRONG_DELTA_MM);
    }
  }
  const stations = [...new Set(omhullende.map((p) => p.position_mm))].sort((a, b) => a - b);
  const ruimte = Math.max(0, maxSneden - verplicht.length);
  const gevuld: number[] = [];
  if (ruimte > 0 && stations.length > 0) {
    // Gelijkmatig over de STATIONS en niet over de lengte: op een station is
    // de kracht een rekenuitkomst en geen interpolatie, en de omhullende zet
    // er extra neer waar het model dat vraagt (deellastgrenzen, zonegrenzen).
    const stap = Math.max(1, Math.ceil(stations.length / ruimte));
    for (let i = 0; i < stations.length; i += stap) gevuld.push(stations[i]);
  }
  const alles = [...verplicht, ...gevuld].filter(
    (x) => Number.isFinite(x) && x >= 0 && x <= lengteMm,
  );
  alles.sort((a, b) => a - b);
  const uit: number[] = [];
  for (const x of alles) {
    if (uit.length === 0 || x - uit[uit.length - 1] > 0.5) uit.push(x);
  }
  return uit;
}

/**
 * De punten van een omhullende die op plaats `xMm` gelden.
 *
 * Ligt er een station precies op x, dan worden ALLE punten op dat station
 * meegenomen — bij een sprong staat het station dubbel en bij meerdere
 * combinaties staat er per combinatie een punt, en de toets hoort de
 * ongunstigste te kunnen kiezen. Ligt er geen station op x (de snede net links
 * van een zonegrens), dan komt het dichtstbijzijnde station mee; de krachten
 * verschillen daar over één millimeter verwaarloosbaar, terwijl de KORF er
 * juist wél verschilt — en dat is precies wat die snede moet laten zien.
 */
function bijX(omhullende: readonly ForcePoint[], xMm: number): ForcePoint[] {
  const precies = omhullende.filter((p) => Math.abs(p.position_mm - xMm) <= 0.5);
  if (precies.length > 0) return precies.map((p) => ({ ...p, position_mm: xMm }));
  let beste: ForcePoint | null = null;
  let afstand = Infinity;
  for (const p of omhullende) {
    const d = Math.abs(p.position_mm - xMm);
    if (d < afstand) {
      afstand = d;
      beste = p;
    }
  }
  return beste ? [{ ...beste, position_mm: xMm }] : [];
}
