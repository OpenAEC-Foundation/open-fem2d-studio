import { Mesh } from '../core/fem/Mesh';
import { IBeamElement, ISolverResult } from '../core/fem/types';
import { calculateBeamLength } from '../core/fem/Beam';
import {
  buildForcesEnvelope,
  extractMaxDeflection,
  isSteelProfile,
} from './steelCheckBuilder';
import type { TimberBeamCheckInput } from './types/timber/TimberBeamCheckInput';

/**
 * Sterkteklassen die de Rust EN 1995-kern kent (nen-en-1995-1-1/data.rs):
 * EN 338 naaldhout C14–C35 en EN 14080 gelamineerd hout GL24h–GL36h.
 * Moet overeenkomen met het Tauri-command `list_timber_grades`.
 */
export const SUPPORTED_TIMBER_GRADES = [
  'C14', 'C16', 'C18', 'C20', 'C22', 'C24', 'C27', 'C30', 'C35',
  'GL24h', 'GL28h', 'GL32h', 'GL36h',
] as const;

/**
 * Houtklassen die de frontend-materiaalbibliotheek wél kent maar waarvoor de
 * normkern (nog) geen data heeft: EN 338 loofhout. Deze worden herkend als
 * hout maar bewust overgeslagen met een melding, in plaats van getoetst met
 * verzonnen eigenschappen.
 */
const UNSUPPORTED_TIMBER_GRADES = ['D30', 'D35', 'D40', 'D50', 'D60', 'D70'];

/**
 * Generieke houtmaterialen (MaterialLibrary "Generic") zonder sterkteklasse.
 * Herkenbaar als hout, maar zonder klasse is geen normtoetsing mogelijk.
 */
const GENERIC_TIMBER_NAMES = ['timber (softwood)', 'timber (hardwood)', 'wood'];

/** Match een materiaalnaam op een door de kern ondersteunde sterkteklasse. */
export function matchSupportedTimberGrade(materialName: string | undefined): string | null {
  if (!materialName) return null;
  const trimmed = materialName.trim();
  const hit = SUPPORTED_TIMBER_GRADES.find(
    g => g.toLowerCase() === trimmed.toLowerCase(),
  );
  return hit ?? null;
}

/**
 * Herken een rechthoekige houtdoorsnede b × h (mm).
 *
 * Bron 1: de profielnaam uit de houtbibliotheek van de doorsnede-dialoog,
 * bijv. "38x89 SLS", "60x100 GL" of een kale "96x450" (conventie: b×h).
 * Bron 2: de doorsnede-eigenschappen zelf, mits b en h bekend zijn en
 * A ≈ b·h én I ≈ b·h³/12 — dan is de doorsnede aantoonbaar een rechthoek.
 * Steelprofielen (b/h van bijv. een HEA) vallen hier bewust doorheen omdat
 * hun A en I niet aan de rechthoek-identiteit voldoen.
 */
export function parseTimberRectMm(beam: IBeamElement): { bMm: number; hMm: number } | null {
  const name = beam.profileName?.trim();
  if (name) {
    const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s+(?:SLS|EU|CLS|GL))?$/i.exec(name);
    if (m) {
      const bMm = parseFloat(m[1].replace(',', '.'));
      const hMm = parseFloat(m[2].replace(',', '.'));
      if (bMm > 0 && hMm > 0) return { bMm, hMm };
    }
  }

  // Terugval: rechthoek-identiteit op de doorsnede-eigenschappen (SI-eenheden).
  const { A, I, b, h } = beam.section;
  if (b && h && A > 0 && I > 0) {
    const aRect = b * h;
    const iRect = (b * h * h * h) / 12.0;
    const aOk = Math.abs(A - aRect) / aRect < 0.02;
    const iOk = Math.abs(I - iRect) / iRect < 0.02;
    if (aOk && iOk) return { bMm: b * 1000.0, hMm: h * 1000.0 };
  }

  return null;
}

export interface TimberSkip {
  beamId: number;
  reason: string;
}

export interface TimberBuildResult {
  inputs: TimberBeamCheckInput[];
  /** Staven die als hout herkend zijn maar niet toetsbaar, met reden. */
  skipped: TimberSkip[];
}

/**
 * Bouw TimberBeamCheckInput[] uit mesh + solver-resultaat voor het Tauri-
 * command `check_timber_beams` — spiegel van buildSteelCheckInputs.
 *
 * Herkenning: een staaf is hout wanneer zijn materiaal (mesh.materials via
 * beam.materialId) een EN 338/EN 14080-sterkteklasse als naam heeft ("C24",
 * "GL28h", ...) — zo komen ze uit de materiaalbibliotheek. De doorsnede moet
 * een aantoonbare rechthoek b × h zijn (houtprofielnaam of rechthoek-
 * identiteit op A en I). Ontbreekt één van beide, dan wordt de staaf
 * overgeslagen met een expliciete reden — géén stille aannames.
 *
 * Gedocumenteerde aannames (nog niet per staaf instelbaar in de UI):
 * - Klimaatklasse 1 en belastingduurklasse "middellang" (maatgevend voor de
 *   gebruikelijke UGT-combinatie met veranderlijke vloerbelasting).
 * - Kniklengte = systeemlengte om beide assen; kipsteunafstand = staaflengte;
 *   belastinggeval "gelijkmatig verdeeld", aangrijpend in het zwaartepunt.
 * - k_cr = 1,0 (conform de referentie-uitwerking; A1 adviseert 0,67).
 * - Doorbuiging: de opgeloste combinatie geldt als karakteristiek én
 *   quasi-blijvend (volledige kruip — veilig-zijdig); blijvend deel 0, dus
 *   w_add = w_fin (eveneens veilig-zijdig, zelfde keuze als bij staal).
 */
export function buildTimberCheckInputs(
  mesh: Mesh,
  result: ISolverResult | null,
): TimberBuildResult {
  if (!result) return { inputs: [], skipped: [] };

  const combinationId = result.combinationId ?? result.loadCaseId ?? 1;
  const inputs: TimberBeamCheckInput[] = [];
  const skipped: TimberSkip[] = [];

  for (const beam of mesh.beamElements.values()) {
    const material = mesh.materials.get(beam.materialId);
    const materialName = material?.name?.trim() ?? '';
    const grade = matchSupportedTimberGrade(materialName);

    if (!grade) {
      // Wel hout, maar niet toetsbaar → expliciet melden. Al het overige
      // (staal, beton, generiek) is geen zaak van deze builder.
      const lower = materialName.toLowerCase();
      if (UNSUPPORTED_TIMBER_GRADES.some(g => g.toLowerCase() === lower)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" (loofhout) wordt nog niet ondersteund door de EN 1995-kern`,
        });
      } else if (GENERIC_TIMBER_NAMES.includes(lower)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" heeft geen sterkteklasse — kies bijv. C24 of GL28h uit de materiaalbibliotheek`,
        });
      }
      continue;
    }

    // Staalprofiel + houtmateriaal is een inconsistent model: de staaltoets
    // pakt deze staaf al op (via profielnaam). Niet dubbel toetsen.
    if (isSteelProfile(beam.profileName)) {
      skipped.push({
        beamId: beam.id,
        reason: `materiaal "${materialName}" is hout maar het profiel "${beam.profileName}" is een staalprofiel — staaf wordt als staal getoetst`,
      });
      continue;
    }

    const rect = parseTimberRectMm(beam);
    if (!rect) {
      skipped.push({
        beamId: beam.id,
        reason: `doorsnede is geen herkenbare rechthoek b×h — kies een houtprofiel (bijv. "60x100 GL") in de doorsnede-dialoog`,
      });
      continue;
    }

    const n1 = mesh.nodes.get(beam.nodeIds[0]);
    const n2 = mesh.nodes.get(beam.nodeIds[1]);
    if (!n1 || !n2) continue;

    const lengthM = calculateBeamLength(n1, n2); // metres

    const forcesEnvelope = buildForcesEnvelope(beam.id, result, combinationId);

    // Zakking uit de opgeloste combinatie (mm, negatief = omlaag conform de
    // tekenconventie van de kern; extractMaxDeflection levert |w|).
    const wInstMm = -extractMaxDeflection(beam, mesh, result);

    inputs.push({
      beam_id: beam.id,
      width_mm: rect.bMm,
      height_mm: rect.hMm,
      strength_class: grade,
      service_class: 'Sc1',
      load_duration: 'MediumTerm',
      length_m: lengthM,
      forces_envelope: forcesEnvelope,
      buckling_length_y_m: lengthM,
      buckling_length_z_m: lengthM,
      ltb_segment_length_m: 0, // 0 → staaflengte
      ltb_load_case: 'UniformLoad',
      ltb_load_position: 'CentreOfGravity',
      ltb_effective_length_override_m: 0,
      perform_ltb_check: true,
      k_cr: 1.0,
      load_sharing: false,
      deflection_inst_mm: wInstMm,
      // Volledige last als quasi-blijvend: maximale kruiptoeslag (veilig-zijdig).
      deflection_quasi_perm_mm: wInstMm,
      // Blijvend deel onbekend → 0, dus w_add = w_fin (veilig-zijdig).
      deflection_permanent_mm: 0,
      deflection_limit_fin: 250,
      deflection_limit_add: 333,
    });
  }

  return { inputs, skipped };
}
