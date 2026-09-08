/**
 * variantStore — de unity checks van naburige doorsneden.
 *
 * WAT DIT DOET. Na een toetsing kan de constructeur per staaf vragen: wat wordt
 * de unity check met een profiel hoger of lager? Deze store bouwt voor elke
 * variant DEZELFDE toetsinvoer als de gewone toetsing — via dezelfde bouwers
 * (`steelCheckBuilder`, `timberCheckBuilder`, `betonCheckBuilder`) en dezelfde
 * route naar de rekenkern (`roepKern`) — met als enige verschil de doorsnede.
 * Er is dus geen tweede toetsketen: wie de norm in de kern wijzigt, wijzigt de
 * varianten mee.
 *
 * DE AANNAME — alleen de weerstand wordt opnieuw bepaald, de krachtsverdeling
 * blijft staan — en alles wat daaruit volgt (de richting van de fout bij een
 * statisch onbepaalde constructie, het niet-herrekende eigen gewicht, de
 * schaling van de doorbuiging) staat in `lib/variantInvoer.ts`. Dáár hoort ze
 * ook: het is rekeninhoud, geen toestandsbeheer, en zo is ze zonder store te
 * testen.
 */
import { create } from "zustand";
import type { MemberCheckResult } from "../lib/checkTypes";
import type { BeamCheckResult } from "../lib/types/steel/BeamCheckResult";
import type { TimberBeamCheckResult } from "../lib/types/timber/TimberBeamCheckResult";
import type { ConcreteBeamCheckResult } from "../lib/types/concrete/ConcreteBeamCheckResult";
import type { BeamCheckInput } from "../lib/types/steel/BeamCheckInput";
import type { TimberBeamCheckInput } from "../lib/types/timber/TimberBeamCheckInput";
import type { ConcreteBeamCheckInput } from "../lib/types/concrete/ConcreteBeamCheckInput";
import {
  getConcreteClasses,
  getProfileDb,
  getTimberGrades,
  korvenUitStaven,
  roepKern,
  useCheckStore,
} from "./checkStore";
import { buildSteelCheckInputs } from "../lib/steelCheckBuilder";
import { buildTimberCheckInputs } from "../lib/timberCheckBuilder";
import { buildBetonCheckInputs, parseConcreteSection } from "../lib/betonCheckBuilder";
import { bEffWaardenPerStaaf } from "../lib/beffLiggerlijn";
import {
  afwijkingTekst,
  materiaalVanStaaf,
  schaalDoorbuiging,
  staafMetVariant,
} from "../lib/variantInvoer";
import {
  bepaalOnbepaaldheid,
  type OnbepaaldheidUitkomst,
} from "../lib/statischeOnbepaaldheid";
import {
  betonVarianten,
  houtVarianten,
  staalVarianten,
  type VariantVoorstel,
  type VariantenVoorStaaf,
} from "../lib/profielVarianten";
import { STAAFDIAMETERS, STANDAARD_KORF, controleerKorf } from "../components/beton/wapeningskorf";

// ═══════════════════════════════════════════════════════════════════════════
// Het contract naar de interface
// ═══════════════════════════════════════════════════════════════════════════

/** Eén regel in de variantentabel van een staaf. */
export interface VariantRegel {
  voorstel: VariantVoorstel;
  /** Het toetsresultaat van deze variant; `null` wanneer er geen is. */
  resultaat: MemberCheckResult | null;
  /** Waarom er geen resultaat is; `null` wanneer er wél een is. */
  reden: string | null;
  /**
   * De afwijking die bij DEZE regel hoort, kort genoeg om naast het getal te
   * staan. Leeg wanneer er niets af te wijken valt (statisch bepaald én even
   * zwaar) — dat komt in de praktijk alleen voor bij een wapeningsvariant.
   */
  afwijkingKort: string;
  /** Dezelfde afwijking voluit, voor de tooltip en het rapport. */
  afwijkingVol: string;
}

/** De variantentabel van één staaf. */
export interface VariantTabel {
  beamId: number;
  materiaal: "staal" | "hout" | "beton";
  /** De doorsnede waarmee getoetst is, met haar unity check als ijkpunt. */
  huidigLabel: string;
  huidigUc: number | null;
  onbepaaldheid: OnbepaaldheidUitkomst;
  regels: VariantRegel[];
  /** Waarom de tabel leeg is; `null` wanneer er regels zijn. */
  reden: string | null;
}

interface VariantState {
  /** Per staaf-id de berekende tabel. */
  tabellen: Record<number, VariantTabel>;
  /** Staaf-ids waarvoor op dit moment gerekend wordt. */
  bezig: number[];
  /** Fout per staaf-id (de kern onbereikbaar, een onverwachte uitkomst). */
  fouten: Record<number, string>;

  /** Bereken (of herbereken) de varianten van één staaf. */
  bereken: (beamId: number) => Promise<void>;
  /** Wis alles — bijvoorbeeld wanneer de toetsing opnieuw draait. */
  wis: () => void;
}

/** De korfcontrole uit de betoneditor, in de vorm die `betonVarianten` vraagt. */
const controleerDoorsnede = (
  d: Parameters<typeof betonVarianten>[1],
  k: Parameters<typeof betonVarianten>[2],
): string | null => controleerKorf({ ...STANDAARD_KORF, doorsnede: d, korf: k });

// ═══════════════════════════════════════════════════════════════════════════
// De store
// ═══════════════════════════════════════════════════════════════════════════

export const useVariantStore = create<VariantState>((set, get) => ({
  tabellen: {},
  bezig: [],
  fouten: {},

  wis: () => set({ tabellen: {}, bezig: [], fouten: {} }),

  bereken: async (beamId: number) => {
    if (get().bezig.includes(beamId)) return;

    const check = useCheckStore.getState();
    const data = check.lastRunData;
    if (!data) {
      set((s) => ({
        fouten: {
          ...s.fouten,
          [beamId]: "Er is nog geen toetsing gedraaid in dit venster — voer eerst de toetsing uit.",
        },
      }));
      return;
    }
    const beam = data.beams.find((b) => b.id === beamId);
    if (!beam) {
      set((s) => ({ fouten: { ...s.fouten, [beamId]: `Staaf ${beamId} staat niet in het model.` } }));
      return;
    }

    set((s) => ({ bezig: [...s.bezig, beamId], fouten: { ...s.fouten, [beamId]: "" } }));

    try {
      const onbepaaldheid = bepaalOnbepaaldheid(
        data.nodes,
        data.beams,
        data.supports,
        data.combinationResults.values(),
      );
      const huidigResultaat = check.results.find((r) => r.beam_id === beamId) ?? null;
      const soort = materiaalVanStaaf(beam);

      const leg = (materiaal: VariantTabel["materiaal"], label: string, reden: string) => {
        set((s) => ({
          tabellen: {
            ...s.tabellen,
            [beamId]: {
              beamId,
              materiaal,
              huidigLabel: label,
              huidigUc: huidigResultaat?.uc_max ?? null,
              onbepaaldheid,
              regels: [],
              reden,
            },
          },
        }));
      };

      if (soort === "clt" || soort === "vrij" || soort === "onbekend") {
        leg(
          "staal",
          beam.profile ?? "—",
          soort === "clt"
            ? "Voor kruislaaghout bestaat geen maatreeks van naburige opbouwen — de laagopbouw " +
                "is een ontwerpkeuze, geen catalogusmaat."
            : soort === "vrij"
              ? "Een vrij materiaal met een eigen doorsnede staat in geen enkele maatreeks."
              : "Deze staaf is niet als staal, hout of beton herkend; er is geen maatreeks om " +
                "een buurdoorsnede uit te kiezen.",
        );
        return;
      }

      // ── De varianten kiezen ───────────────────────────────────────────────
      let keuze: VariantenVoorStaaf;
      if (soort === "staal") {
        const db = await getProfileDb();
        keuze = staalVarianten(beamId, beam.profile ?? "", [...db.values()]);
      } else if (soort === "hout") {
        keuze = houtVarianten(beamId, beam.profile);
      } else {
        const vorm = parseConcreteSection(beam.profile);
        const korf = beam.checkConfig?.betonKorf;
        if (!vorm.ok) {
          leg("beton", beam.profile ?? "—", vorm.reden);
          return;
        }
        if (!korf) {
          leg(
            "beton",
            beam.profile ?? "—",
            "deze betonstaaf heeft geen wapeningskorf; zonder korf is er niets om varianten " +
              "van af te leiden",
          );
          return;
        }
        keuze = betonVarianten(
          beamId,
          vorm.doorsnede,
          korf,
          STAAFDIAMETERS,
          controleerDoorsnede,
        );
      }

      if (keuze.voorstellen.length === 0) {
        leg(keuze.materiaal, keuze.huidig.label, keuze.reden ?? "geen varianten beschikbaar");
        return;
      }

      // ── De invoer per variant bouwen, via de bestaande bouwers ────────────
      const toetsbaar = keuze.voorstellen.filter((v) => v.onmogelijk === null);
      const inputs: (BeamCheckInput | TimberBeamCheckInput | ConcreteBeamCheckInput)[] = [];
      /** Loopt gelijk op met `inputs`: index i hoort bij voorstel i. */
      const gebouwd: VariantVoorstel[] = [];
      const bouwFout = new Map<string, string>();

      const bEff = bEffWaardenPerStaaf(check.beff);

      for (const voorstel of toetsbaar) {
        const variantBeam = staafMetVariant(beam, voorstel);
        const gedeeld = {
          nodes: data.nodes,
          beams: [variantBeam],
          supports: data.supports,
          combinations: data.combinations,
          combinationResults: data.combinationResults,
        };

        if (soort === "staal") {
          const bouw = buildSteelCheckInputs({ ...gedeeld, profileDb: await getProfileDb() });
          if (bouw.inputs.length === 0) {
            bouwFout.set(voorstel.id, bouw.skipped[0]?.reason ?? "de toetsbouwer leverde geen invoer");
            continue;
          }
          inputs.push(
            schaalDoorbuiging(
              { ...bouw.inputs[0] },
              ["deflection_actual_max_mm"],
              keuze.huidig.iMm4,
              voorstel.iMm4,
            ),
          );
          gebouwd.push(voorstel);
        } else if (soort === "hout") {
          const bouw = buildTimberCheckInputs({
            ...gedeeld,
            supportedGrades: await getTimberGrades(),
          });
          if (bouw.inputs.length === 0) {
            bouwFout.set(voorstel.id, bouw.skipped[0]?.reason ?? "de toetsbouwer leverde geen invoer");
            continue;
          }
          inputs.push(
            schaalDoorbuiging(
              { ...bouw.inputs[0] },
              ["deflection_inst_mm", "deflection_quasi_perm_mm"],
              keuze.huidig.iMm4,
              voorstel.iMm4,
            ),
          );
          gebouwd.push(voorstel);
        } else {
          const bouw = buildBetonCheckInputs({
            nodes: data.nodes,
            beams: [variantBeam],
            combinations: data.combinations,
            combinationResults: data.combinationResults,
            korven: korvenUitStaven([variantBeam]),
            supportedClasses: await getConcreteClasses(),
            // De meewerkende flensbreedte volgt uit de liggerlijn (de
            // overspanningen en de opleggingen) en niet uit de hoogte; de
            // waarde van de laatste toetsing geldt dus onverkort.
            bEffPerStaaf: bEff,
          });
          if (bouw.inputs.length === 0) {
            bouwFout.set(voorstel.id, bouw.skipped[0]?.reason ?? "de toetsbouwer leverde geen invoer");
            continue;
          }
          // De betonkern kent geen doorbuigingstoets, dus er valt niets te schalen.
          inputs.push({ ...bouw.inputs[0] });
          gebouwd.push(voorstel);
        }
      }

      // Elke variant een EIGEN staaf-id, anders levert de kern meerdere
      // resultaten met hetzelfde id terug en is niet meer te zeggen welke bij
      // welke variant hoort. De ids zijn synthetisch en verlaten deze functie
      // niet; de tabel toont de variantnaam, niet dit nummer.
      const perSyntheticId = new Map<number, VariantVoorstel>();
      inputs.forEach((invoer, i) => {
        invoer.beam_id = i + 1;
        perSyntheticId.set(i + 1, gebouwd[i]);
      });

      // ── De kern aanroepen — dezelfde opdracht als de gewone toetsing ──────
      let uitkomsten: MemberCheckResult[] = [];
      if (inputs.length > 0) {
        if (soort === "staal") {
          uitkomsten = await roepKern<BeamCheckResult[]>(
            "check_steel_beams",
            inputs as BeamCheckInput[],
          );
        } else if (soort === "hout") {
          uitkomsten = await roepKern<TimberBeamCheckResult[]>(
            "check_timber_beams",
            inputs as TimberBeamCheckInput[],
          );
        } else {
          uitkomsten = await roepKern<ConcreteBeamCheckResult[]>(
            "check_concrete_beams",
            inputs as ConcreteBeamCheckInput[],
          );
        }
      }
      const perVoorstel = new Map<string, MemberCheckResult>();
      for (const r of uitkomsten) {
        const voorstel = perSyntheticId.get(r.beam_id);
        if (voorstel) perVoorstel.set(voorstel.id, r);
      }

      // ── De tabel samenstellen ────────────────────────────────────────────
      const regels: VariantRegel[] = keuze.voorstellen
        .slice()
        .sort((a, b) => a.stap - b.stap)
        .map((voorstel) => {
          const afwijking = afwijkingTekst(voorstel, keuze.huidig, onbepaaldheid.statischBepaald);
          return {
            voorstel,
            resultaat: perVoorstel.get(voorstel.id) ?? null,
            reden:
              voorstel.onmogelijk ??
              bouwFout.get(voorstel.id) ??
              (perVoorstel.has(voorstel.id) ? null : "de rekenkern gaf geen resultaat voor deze variant"),
            afwijkingKort: afwijking.kort,
            afwijkingVol: afwijking.vol,
          };
        });

      set((s) => ({
        tabellen: {
          ...s.tabellen,
          [beamId]: {
            beamId,
            materiaal: keuze.materiaal,
            huidigLabel: keuze.huidig.label,
            huidigUc: huidigResultaat?.uc_max ?? null,
            onbepaaldheid,
            regels,
            reden: null,
          },
        },
      }));
    } catch (e) {
      set((s) => ({ fouten: { ...s.fouten, [beamId]: String(e) } }));
    } finally {
      set((s) => ({ bezig: s.bezig.filter((id) => id !== beamId) }));
    }
  },
}));

/**
 * Een nieuwe toetsing maakt elke variantentabel ongeldig: ze hoort bij een
 * krachtsverdeling die er niet meer is. Wissen in plaats van laten staan —
 * een variant-UC naast een verse toetsing die uit een ander model komt, is
 * precies het soort stille onwaarheid dat deze functie moet voorkomen.
 *
 * De abonnering staat HIER en niet in `checkStore`: de checkStore mag niets
 * van de varianten weten (dat zou een kringverwijzing maken), de varianten
 * wél van de toetsing.
 */
useCheckStore.subscribe((nu, vorig) => {
  if (nu.lastRunAt !== vorig.lastRunAt) useVariantStore.getState().wis();
});
