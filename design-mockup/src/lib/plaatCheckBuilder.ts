/**
 * plaatCheckBuilder — van het model naar de invoer van de plaattoets
 * (`check_plates`, Rust-kern `plaat-check`).
 *
 * WAT HIER GEBEURT
 * De bouwer rekent niets. Hij zoekt per plaat het materiaal op zoals de
 * stijfheid het al herkende (`bepaalPlaatStijfheid`), en zet de
 * elementspanningen van elke doorgerekende UGT-combinatie ongewijzigd in de
 * invoer: `sigmaX`, `sigmaY` en `tauXY` uit `combineResults`. De norm — de
 * sterkte, γ_M, het criterium en welke materialen getoetst worden — zit in de
 * kern, langs alle drie de wegen dezelfde.
 *
 * WAT NIET NAAR DE KERN GAAT, EN WAAROM
 * Een plaat zonder materiaal heeft geen sterkte: zij rekent met losse E, ν en
 * ρ, en een toets zou een staalsoort moeten aannemen. Een plaat waarvan het
 * materiaal niet herkend wordt, rekent niet eens. Beide komen met reden in
 * `skipped` — zichtbaar in paneel, rapport en MCP-antwoord.
 *
 * Een herkend materiaal dat de kern (nog) niet toetst — kruislaaghout, een
 * vrij materiaal — gaat WEL naar de kern, zodat de weigering met haar
 * normreden van één plek komt. Omdat die weigering niet van de spanningen
 * afhangt, gaan de spanningen dan niet mee: een wand van duizenden elementen
 * hoort niet door de brug te reizen om met een zin terug te komen.
 */
import { withPlateDefaults, type Plate } from "../components/fem/femTypes";
import { combinatiesVanSoort, type LoadCombination } from "../components/fem/solver/combinations";
import type { SolverResult } from "../components/fem/solver/types";
import type { PlateCheckInput } from "./types/plaat/PlateCheckInput";
import type { PlaatMateriaalSoort as KernSoort } from "./types/plaat/PlaatMateriaalSoort";
import type { PlaatCombinatie } from "./types/plaat/PlaatCombinatie";
import { bepaalPlaatStijfheid, type PlaatMateriaalSoort } from "./plaatMateriaal";
import { STANDAARD_BIJLAGE, type NationaleBijlageCode } from "./normAanduidingen";
import type { LoadCase } from "../components/fem/femTypes";
import type { ServiceClass } from "./types/timber/ServiceClass";
import { belastingduurPerCombinatie } from "./belastingduur";
import { plaatPlooiGeometrieFout } from "./plaatPlooi";
import type { Node } from "../components/fem/femTypes";

/** Een plaat die niet naar de kern ging, met de reden. */
export interface PlaatSkip {
  plateId: number;
  reason: string;
}

export interface PlaatBuildData {
  nodes?: readonly Pick<Node, "id" | "x" | "z">[];
  plates: readonly Plate[];
  combinations: readonly LoadCombination[];
  combinationResults: ReadonlyMap<number, SolverResult>;
  nationaleBijlage?: NationaleBijlageCode;
  /**
   * De belastinggevallen: daaruit volgt voor een HOUTEN plaat de
   * belastingduurklasse per UGT-combinatie (EN 1995-1-1 3.1.3(2),
   * `lib/belastingduur.ts`) — dezelfde afleiding als bij een houten staaf.
   * Ontbreekt de lijst, dan krijgt de kern geen klassen en weigert hij een
   * houten plaat met reden; er wordt geen duur aangenomen.
   */
  loadCases?: readonly Pick<LoadCase, "id" | "name" | "type" | "categorie">[];
  /** De gevallen met een werkzame last (sleutels van `perCase`); zie de houtbouwer. */
  gevallenMetLast?: readonly number[];
  /** Alleen deze plaatnummers; leeg of afwezig = alle platen. */
  plateIds?: readonly number[];
}

export interface PlaatBuildResult {
  inputs: PlateCheckInput[];
  skipped: PlaatSkip[];
}

const KERN_SOORT: Record<PlaatMateriaalSoort, KernSoort> = {
  staal: "Staal",
  hout: "Hout",
  clt: "Kruislaaghout",
  beton: "Beton",
  vrij: "Vrij",
};

/**
 * De soorten waarvoor de kern de SPANNINGEN nodig heeft. Een andere soort
 * weigert hij met een reden die niet van de spanningen afhangt. Dit is alleen
 * een besparing op wat er over de brug gaat: wat getoetst wordt, beslist de
 * kern.
 */
const SOORT_MET_SPANNINGEN: ReadonlySet<KernSoort> = new Set<KernSoort>(["Staal", "Hout", "Beton"]);

/** Klimaatklasse van een plaat → kernenum; ontbreekt = 1, zoals bij een houten staaf. */
function klimaatklasse(k: Plate["klimaatklasse"]): ServiceClass {
  return k === 2 ? "Sc2" : k === 3 ? "Sc3" : "Sc1";
}

/** Heeft deze plaat een ingevuld materiaal? */
export function plaatHeeftMateriaal(p: Pick<Plate, "materiaal">): boolean {
  return (p.materiaal ?? "").trim() !== "";
}

export function buildPlaatCheckInputs(data: PlaatBuildData): PlaatBuildResult {
  const inputs: PlateCheckInput[] = [];
  const skipped: PlaatSkip[] = [];
  const selectie = data.plateIds && data.plateIds.length > 0 ? new Set(data.plateIds) : null;
  const ugt = data.combinations.filter((c) => c.type === "uls");

  for (const plaat of data.plates) {
    if (selectie && !selectie.has(plaat.id)) continue;
    if (!plaatHeeftMateriaal(plaat)) {
      skipped.push({
        plateId: plaat.id,
        reason:
          "geen materiaal — de plaat rekent met losse E, ν en ρ en heeft daardoor geen sterkte; " +
          "kies een materiaal (bijvoorbeeld S355) om haar te toetsen",
      });
      continue;
    }
    const uitkomst = bepaalPlaatStijfheid(plaat);
    if (!uitkomst.ok) {
      skipped.push({ plateId: plaat.id, reason: `materiaal niet bruikbaar — ${uitkomst.reden}` });
      continue;
    }
    const s = uitkomst.stijfheid;
    if (s.soort === null) {
      // Kan niet: er is een materiaal. Toch niet stil doorlopen.
      skipped.push({ plateId: plaat.id, reason: "materiaalsoort onbekend — niet getoetst" });
      continue;
    }
    const soort = KERN_SOORT[s.soort];
    const combinaties: PlaatCombinatie[] = [];
    const notities: string[] = [];
    let expectedElementIds: number[] | undefined;
    let dekkingFout: string | undefined;
    let betonMeshIds: number[] | undefined;
    let betonMeshCombinatie: number | undefined;
    let betonMeshFout: string | undefined;
    /** De elementspanningen van één combinatie, of null zonder plaatspanningen. */
    const spanningen = (c: LoadCombination): PlaatCombinatie | null => {
      const pr = data.combinationResults.get(c.id)?.plateElements?.find((r) => r.plateId === plaat.id);
      if (soort === "Beton") {
        const ids = pr?.expectedElementIds;
        if (!ids?.length || new Set(ids).size !== ids.length ||
            ids.some(id => !Number.isInteger(id) || id < 0 || id > 0xffffffff)) {
          betonMeshFout ??= `Combinatie ${c.id}: onafhankelijke volledige meshset ontbreekt of is ongeldig; bereken opnieuw.`;
        } else {
          const gesorteerd = [...ids].sort((a, b) => a - b);
          const referentie = betonMeshIds;
          if (referentie && (gesorteerd.length !== referentie.length ||
              gesorteerd.some((id, i) => id !== referentie[i]))) {
            betonMeshFout ??= `Onafhankelijke meshsets van combinaties ${betonMeshCombinatie} en ${c.id} verschillen (UGT/BGT).`;
          } else if (!betonMeshIds) {
            betonMeshIds = gesorteerd;
            betonMeshCombinatie = c.id;
          }
        }
      }
      if (!pr || pr.elements.length === 0) return null;
      return {
        combination_id: c.id,
        elements: pr.elements.map((el) => ({
          element_id: el.elementId,
          sigma_x_mpa: el.sigmaX,
          sigma_y_mpa: el.sigmaY,
          tau_xy_mpa: el.tauXY,
        })),
      };
    };
    if (SOORT_MET_SPANNINGEN.has(soort)) {
      const zonder: string[] = [];
      for (const c of ugt) {
        const comb = spanningen(c);
        if (!comb) {
          if (data.combinationResults.has(c.id)) zonder.push(c.name);
          // Bij beton moet een ontbrekende UGT-combinatie
          // zichtbaar blijven voor de kern, ook als andere combinaties bestaan.
          if (plaat.plooi || soort === "Beton") combinaties.push({ combination_id: c.id, elements: [] });
          continue;
        }
        if (plaat.plooi) {
          const ids = data.combinationResults.get(c.id)?.plateElements?.find((r) => r.plateId === plaat.id)?.expectedElementIds;
          if (!ids?.length || new Set(ids).size !== ids.length) {
            dekkingFout = "onafhankelijke volledige mesh-elementset ontbreekt; bereken opnieuw met de actuele solver";
          } else if (expectedElementIds && (expectedElementIds.length !== ids.length || expectedElementIds.some((id, i) => id !== ids[i]))) {
            dekkingFout = "de onafhankelijke mesh-elementset verschilt tussen UGT-combinaties";
          } else {
            expectedElementIds = [...ids];
          }
        }
        combinaties.push(comb);
      }
      if (zonder.length > 0) {
        notities.push(
          `Zonder plaatspanningen in de doorgerekende combinatie(s) ${zonder.join(", ")}; die zijn niet getoetst.`,
        );
      }
    }
    // Hout: klimaatklasse, hoofdrichting en de belastingduur per combinatie.
    const hout =
      soort === "Hout"
        ? (() => {
            if (plaat.klimaatklasse === undefined) {
              notities.push(
                "Klimaatklasse niet opgegeven bij de plaat: klimaatklasse 1 aangehouden (2.3.1.3), " +
                  "net als bij een houten staaf zonder opgave.",
              );
            }
            if (!s.orthotroop) {
              notities.push(
                "De E-modulus van deze houten plaat is handmatig overschreven: de spanningen zijn " +
                  "isotroop berekend en daarna in de materiaalassen getoetst.",
              );
            }
            const gevuld = data.gevallenMetLast ? new Set(data.gevallenMetLast) : null;
            return {
              hoofdrichting_graden: s.hoekGraden,
              service_class: klimaatklasse(plaat.klimaatklasse),
              load_duration_per_combination: data.loadCases
                ? belastingduurPerCombinatie({
                    combinaties: ugt,
                    loadCases: data.loadCases,
                    gevuld: gevuld ? (id) => gevuld.has(id) : undefined,
                  })
                : [],
            };
          })()
        : {};
    const geometrieFout = plaatPlooiGeometrieFout(plaat, data.nodes) ?? dekkingFout;
    // Beton met ingevoerde wapening (issue #25): de wapening ongewijzigd, en
    // de spanningen van de FREQUENTE BGT-combinaties (6.15b) — daaronder laat
    // de nationale bijlage bij 7.3.1(5) de scheurwijdte toetsen. Herkend op
    // soort, zoals de betonbalkbouwer; een andere BGT-combinatie gaat niet mee.
    // Meshmetadata wordt voor alle betonplaten bewaakt, ook zonder wapening.
    const beton =
      soort === "Beton" && plaat.wapening
        ? {
            wapening_aanwezig: plaat.wapening,
            frequente_combinaties: combinatiesVanSoort(data.combinations, "6.15b")
              .map((c) => spanningen(c) ?? { combination_id: c.id, elements: [] }),
          }
        : {};
    inputs.push({
      bijlage: data.nationaleBijlage ?? STANDAARD_BIJLAGE,
      plate_id: plaat.id,
      soort,
      materiaal: s.naam,
      ...(plaat.plooi ? { plooi: {
        ...plaat.plooi,
        expected_element_ids: expectedElementIds ?? [],
        rechthoek_zonder_openingen: !geometrieFout,
        ...(geometrieFout ? { geometrie_fout: geometrieFout } : {}),
      } } : {}),
      ...hout,
      // Dezelfde aanvulling als de solverinvoer (`plaatNaarSolverInput`): de
      // spanningen zijn met deze dikte berekend.
      thickness_mm: withPlateDefaults(plaat).thickness!,
      ...(notities.length > 0 ? { notities } : {}),
      combinations: combinaties,
      ...beton,
      ...(soort === "Beton" ? {
        ...(betonMeshIds ? { expected_element_ids: betonMeshIds } : {}),
        ...(betonMeshFout !== undefined ? { mesh_fout: betonMeshFout } : {}),
      } : {}),
    });
  }
  return { inputs, skipped };
}
