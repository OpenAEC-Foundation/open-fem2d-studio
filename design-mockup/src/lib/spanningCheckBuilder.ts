/**
 * spanningCheckBuilder.ts — de vrije spanningstoets in het model: welke
 * staven eraan meedoen, en hoe hun doorsnede en krachtsverloop naar de
 * kern-opdracht `check_stress_beams` gaan.
 *
 * HERKENNING IN HET DATAMODEL
 * ---------------------------
 * Een staaf gaat naar deze kern wanneer zijn MATERIAAL een vrij materiaal is
 * (`VRIJ:… E=… rho=… f=…`, zie `vrijMateriaal.ts`). Het profiel bepaalt de
 * doorsnede en mag van alles zijn — juist dat is de bedoeling: "ik wil gewoon
 * even staal toetsen op spanning" is dezelfde route als "ik wil natuursteen
 * toetsen", alleen met een ander profiel en een andere f_toel.
 *
 * Ondersteunde doorsneden:
 *  - rechthoek b × h uit de profielnaam ("300x500");
 *  - een catalogusprofiel uit de staaldatabase ("HEA 200", "IPE 300", koker,
 *    buis) — de kern haalt A en I_y daar op en bouwt het lagenmodel voor
 *    S(z) en b(z);
 *  - een vrij lagenmodel; dat kan de kern aan, maar het model kent er (nog)
 *    geen invoervorm voor, dus deze bouwer maakt hem niet.
 *
 * Niet ondersteund, met expliciete reden bij de overgeslagen staven:
 *  - kruislaaghout ("CLT …"): de lagen hebben elk hun eigen E-modulus, dus
 *    één toelaatbare spanning over de hele doorsnede zou onzin zijn;
 *  - een eigen doorsnede uit de profieleditor ("EIGEN:…"): daarvan is A en
 *    I_y bekend, maar niet de breedte b(z) over de hoogte, en zonder b(z) is
 *    er geen schuifspanning en dus geen vergelijkspanning.
 *
 * WAT DE KERN ERVAN MAAKT staat in `src-tauri/crates/spanning-check`: de
 * vergelijkspanning van von Mises per vezel over de hoogte, met de kruisterm
 * −σ_x·σ_z, en het volledige spanningsverloop terug voor de tekening.
 */
import type { Beam, Node } from "../components/fem/femTypes";
import type { SolverResult } from "../components/fem/solver/types";
import type { LoadCombination } from "../components/fem/solver/combinations";
import type { SpanningBeamCheckInput } from "./types/spanning/SpanningBeamCheckInput";
import type { SpanningBeamCheckResult } from "./types/spanning/SpanningBeamCheckResult";
import type { SpanningDoorsnede } from "./types/spanning/SpanningDoorsnede";
import type { CheckSkip, MemberCheckResult } from "./checkTypes";
import { beamLengthMm, buildForcesEnvelope, profileLookupKey } from "./steelCheckBuilder";
import { isCltProfiel } from "./cltCheckBuilder";
import { parseRechthoek } from "./sectionResolver";
import { STEEL_SECTION_DIMS } from "./steelSectionDims.generated";
import { isVrijMateriaal, parseVrijMateriaal } from "./vrijMateriaal";

export interface SpanningBuildData {
  nodes: Node[];
  beams: Beam[];
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult>;
}

export interface SpanningBuildResult {
  inputs: SpanningBeamCheckInput[];
  /** Staven met een vrij materiaal die niet toetsbaar zijn, met reden. */
  skipped: CheckSkip[];
}

/** Doorsnede-invoer uit de profielnaam; een string is de reden van afkeur. */
export function doorsnedeVanProfiel(profile: string | undefined): SpanningDoorsnede | string {
  const naam = profile?.trim() ?? "";
  if (!naam) {
    return "de staaf heeft geen profiel — kies een rechthoek (b×h) of een catalogusprofiel";
  }
  if (isCltProfiel(naam)) {
    return (
      `profiel "${naam}" is kruislaaghout: elke laag heeft zijn eigen E-modulus, ` +
      "dus één toelaatbare spanning over de hele doorsnede is niet zinvol — " +
      "toets deze staaf via EN 1995 (materiaal C24, GL28h, …)"
    );
  }
  const rect = parseRechthoek(naam);
  if (rect) {
    return { vorm: "Rechthoek", maten: { b_mm: rect.b, h_mm: rect.h } };
  }
  if (STEEL_SECTION_DIMS[profileLookupKey(naam)]) {
    return { vorm: "Catalogus", maten: { naam } };
  }
  if (/^\s*EIGEN:/i.test(naam)) {
    return (
      `profiel "${naam}" is een eigen doorsnede uit de profieleditor: daarvan zijn A en I_y ` +
      "bekend, maar niet de breedte b(z) over de hoogte — zonder b(z) is er geen " +
      "schuifspanning en dus geen vergelijkspanning te bepalen"
    );
  }
  return (
    `profiel "${naam}" is geen rechthoek (b×h) en staat niet in de profieldatabase — ` +
    "de spanningstoets heeft een doorsnede met een echte geometrie nodig"
  );
}

/**
 * Bouwt SpanningBeamCheckInput[] voor alle staven met een vrij materiaal.
 *
 * Gedocumenteerde standaardwaarden voor ontbrekende invoer:
 *  - σ_z = 0 wanneer `checkConfig.spanningSigmaZ` ontbreekt. Een staafelement
 *    berekent geen dwarsspanning; wie een oplegdruk wil meenemen vult hem
 *    daar zelf in.
 *  - 21 rekenpunten over de hoogte (elke laag krijgt er in de kern minstens
 *    drie, zodat de parabool in een lijf niet vervlakt).
 *  - γ_M komt uit de materiaalnaam; ontbreekt hij daar, dan 1,0 — dan is
 *    f_toel zelf de rekenwaarde.
 */
export function buildSpanningCheckInputs(data: SpanningBuildData): SpanningBuildResult {
  const inputs: SpanningBeamCheckInput[] = [];
  const skipped: CheckSkip[] = [];
  const ulsCombos = data.combinations.filter((c) => c.type === "uls");

  for (const beam of data.beams) {
    if (!isVrijMateriaal(beam.material)) continue;

    const vrij = parseVrijMateriaal(beam.material);
    if (!vrij) {
      skipped.push({
        beamId: beam.id,
        reason:
          `materiaal "${beam.material}" is een vrij materiaal zonder complete gegevens — ` +
          "de vorm is VRIJ:<naam> E=<N/mm²> rho=<kg/m³> f=<N/mm²> [gM=<factor>], " +
          "bijvoorbeeld \"VRIJ:Natuursteen E=60000 rho=2700 f=8\"",
      });
      continue;
    }

    const doorsnede = doorsnedeVanProfiel(beam.profile);
    if (typeof doorsnede === "string") {
      skipped.push({ beamId: beam.id, reason: doorsnede });
      continue;
    }

    const lengthMm = beamLengthMm(beam, data.nodes);
    if (lengthMm <= 0) {
      skipped.push({ beamId: beam.id, reason: "staaflengte is 0 — knopen ontbreken" });
      continue;
    }

    const hasAnyResult = ulsCombos.some((c) =>
      data.combinationResults.get(c.id)?.elements.has(beam.id),
    );
    if (!hasAnyResult) {
      skipped.push({
        beamId: beam.id,
        reason: "geen krachtsverloop in de UGT-combinaties — reken het model eerst door",
      });
      continue;
    }

    inputs.push({
      beam_id: beam.id,
      section: doorsnede,
      material_name: vrij.naam,
      f_toel_mpa: vrij.fToel,
      gamma_m: vrij.gammaM,
      sigma_z_mpa: beam.checkConfig?.spanningSigmaZ ?? 0,
      length_m: lengthMm / 1000,
      forces_envelope: buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults),
      fiber_count: 21,
    });
  }

  return { inputs, skipped };
}

/**
 * Type-guard: alleen een spanningsresultaat draagt een toelaatbare spanning.
 * Het resultaat past verder in het gedeelde NamedCheck-contract, dus het
 * loopt zonder vertakking door het toetsingsoverzicht en "Toetsing per
 * staaf"; deze guard haalt het eruit voor de doorsnedetekening.
 */
export function isSpanningCheckResult(
  r: MemberCheckResult | SpanningBeamCheckResult,
): r is SpanningBeamCheckResult {
  return "f_toel_mpa" in r;
}
