/**
 * sectionResolver — vertaalt (materiaal, profiel) van een staaf naar de
 * stijfheidsgrootheden die de solver nodig heeft: E (N/mm²), A (mm²), Iy (mm⁴).
 *
 * Zonder deze vertaling rekende de solver élke staaf met zijn ingebouwde
 * default (HEA 160 / S235), waardoor profiel- en materiaalkeuze geen enkel
 * effect hadden op doorbuigingen en (bij statisch onbepaalde systemen) op de
 * krachtsverdeling.
 *
 * - Staal: A/Iy uit de gegenereerde tabel (bron: de Rust-profieldatabase),
 *   E = 210000 N/mm².
 * - Hout: rechthoek b×h uit de profielnaam ("96x450", "60x100 GL"),
 *   A = b·h, Iy = b·h³/12, E = E_0,mean per sterkteklasse (EN 338 / EN 14080).
 *   De TOETSING gebruikt de Rust-kern als bron; deze E-tabel stuurt alleen de
 *   stijfheid in de solver.
 * - Vrij materiaal ("VRIJ:… E=… rho=… f=…"): E en ρ komen uit de naam zelf,
 *   de doorsnede uit het profiel (rechthoek of catalogusprofiel). Geen norm,
 *   geen tabel — de gebruiker geeft de getallen.
 */
import { STEEL_SECTIONS } from "./steelSections.generated";
import { SUPPORTED_TIMBER_GRADES } from "./timberCheckBuilder";
import { cltSolverDoorsnede, isCltProfiel, parseCltProfiel } from "./cltCheckBuilder";
import { zoekEigenDoorsnede } from "./profieleditor/eigenDoorsnedenStore";
import { parseVrijMateriaal } from "./vrijMateriaal";

/** E_0,mean in N/mm² per sterkteklasse — EN 338 (C) en EN 14080 (GL). */
export const TIMBER_E_MEAN: Record<string, number> = {
  C14: 7000, C16: 8000, C18: 9000, C20: 9500, C22: 10000,
  C24: 11000, C27: 11500, C30: 12000, C35: 13000,
  GL24h: 11500, GL28h: 12600, GL32h: 14200, GL36h: 14700,
};

export const E_STAAL = 210000;

/** ρ_mean in kg/m³ per sterkteklasse — EN 338 tabel 1 (C) en EN 14080 (GL). */
export const TIMBER_RHO_MEAN: Record<string, number> = {
  C14: 350, C16: 370, C18: 380, C20: 390, C22: 410,
  C24: 420, C27: 450, C30: 460, C35: 480,
  GL24h: 420, GL28h: 460, GL32h: 490, GL36h: 500,
};

/**
 * E_cm per betonsterkteklasse in N/mm² — NEN-EN 1992-1-1 tabel 3.1, dezelfde
 * waarden als de kern (nen-en-1992-1-1/data.rs). Voor de solverstijfheid van
 * een betonstaaf; de toetsing rekent in de kern met f_cd en f_yd uit dezelfde
 * tabel.
 */
export const CONCRETE_E_CM: Record<string, number> = {
  "C12/15": 27000, "C16/20": 29000, "C20/25": 30000, "C25/30": 31000,
  "C30/37": 33000, "C35/45": 34000, "C40/50": 35000, "C45/55": 36000,
  "C50/60": 37000, "C55/67": 38000, "C60/75": 39000, "C70/85": 41000,
  "C80/95": 42000, "C90/105": 44000,
};

/** ρ van gewapend beton in kg/m³ — EN 1991-1-1 tabel A.1 (25 kN/m³). */
export const RHO_BETON = 2500;

/** ρ van staal in kg/m³ — EN 1991-1-1 tabel A.4. */
export const RHO_STAAL = 7850;

/** Valversnelling in m/s². */
export const G = 9.81;

export interface ResolvedSection {
  E: number;      // N/mm²
  A: number;      // mm²
  I: number;      // mm⁴ (Iy, sterke as)
  bron: "staal-db" | "eigen" | "hout-bxh" | "clt" | "beton-bxh" | "vrij" | "default";
  /**
   * Volle doorsnede in mm² voor het eigen gewicht, waar die van `A` afwijkt.
   * Bij kruislaaghout is `A` de meewerkende doorsnede van de lengtelagen; de
   * dwarslagen wegen wél mee maar dragen niet in de spanrichting.
   */
  aBruto?: number;
}

/** "96x450", "96 x 450", "60x100 GL" → { b, h } in mm; anders null. */
export function parseRechthoek(profiel: string | undefined): { b: number; h: number } | null {
  if (!profiel) return null;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/.exec(profiel);
  if (!m) return null;
  const b = parseFloat(m[1].replace(",", "."));
  const h = parseFloat(m[2].replace(",", "."));
  if (!(b > 0 && h > 0)) return null;
  return { b, h };
}

function normaliseer(naam: string): string {
  return naam.toUpperCase().split("").filter(c => c !== " " && c !== "-" && c !== ".").join("");
}

export function resolveSection(material: string | undefined, profile: string | undefined): ResolvedSection {
  const mat = material ?? "S235";
  const isHout = (SUPPORTED_TIMBER_GRADES as readonly string[]).includes(mat) || mat in TIMBER_E_MEAN;

  // Vrij materiaal: de E-modulus komt uit de materiaalnaam, de doorsnede uit
  // het profiel. Dat kan een rechthoek zijn of een catalogusprofiel — "even
  // staal op spanning toetsen" is dezelfde route als natuursteen, alleen met
  // een andere f_toel. Past het profiel bij geen van beide, dan valt de staaf
  // door naar de waarschuwing onderaan; de spanningstoets meldt hem apart met
  // reden bij de overgeslagen staven.
  const vrij = parseVrijMateriaal(material);
  if (vrij) {
    const rect = parseRechthoek(profile);
    if (rect) {
      const { b, h } = rect;
      return { E: vrij.eMod, A: b * h, I: (b * h * h * h) / 12, bron: "vrij" };
    }
    const sec = STEEL_SECTIONS[normaliseer(profile ?? "")];
    if (sec) return { E: vrij.eMod, A: sec.A, I: sec.Iy, bron: "vrij" };
  }

  if (mat in CONCRETE_E_CM) {
    // Beton: ongescheurde rechthoekige doorsnede met E_cm. De wapening telt
    // niet mee in de stijfheid — de gebruikelijke lineaire aanname voor de
    // krachtsverdeling; de doorsnedetoetsing zelf zit in de kern.
    const rect = parseRechthoek(profile);
    if (rect) {
      const { b, h } = rect;
      return { E: CONCRETE_E_CM[mat], A: b * h, I: (b * h * h * h) / 12, bron: "beton-bxh" };
    }
  } else if (isHout) {
    // Kruislaaghout: E·A en E·I van de samengestelde doorsnede (alleen de
    // lengtelagen dragen), uitgedrukt in de E van de bovenste lengtelaag.
    if (isCltProfiel(profile)) {
      const layup = parseCltProfiel(profile, mat);
      const d = layup ? cltSolverDoorsnede(layup, (k) => TIMBER_E_MEAN[k]) : null;
      if (d) return { E: d.E, A: d.A, I: d.I, bron: "clt", aBruto: d.aBruto };
    }
    const rect = parseRechthoek(profile);
    if (rect) {
      const { b, h } = rect;
      return {
        E: TIMBER_E_MEAN[mat] ?? 11000,
        A: b * h,
        I: (b * h * h * h) / 12,
        bron: "hout-bxh",
      };
    }
  } else {
    // Eigen doorsnede uit de profieleditor (`EIGEN:<naam>`): de motor heeft
    // A en I_y al exact bepaald; eigen doorsneden zijn staal.
    const eigen = zoekEigenDoorsnede(profile);
    if (eigen) {
      return {
        E: E_STAAL,
        A: eigen.eigenschappen.area_mm2,
        I: eigen.eigenschappen.iy_mm4,
        bron: "eigen",
      };
    }
    const sec = STEEL_SECTIONS[normaliseer(profile ?? "")];
    if (sec) return { E: E_STAAL, A: sec.A, I: sec.Iy, bron: "staal-db" };
  }

  // Onbekende combinatie: val terug op de solver-default en zeg dat hardop —
  // stil doorrekenen met een verzonnen doorsnede is precies wat we niet willen.
  console.warn(
    `[solver] Doorsnede onbekend voor materiaal "${material}" + profiel "${profile}" — ` +
    `reken met default HEA 160 / S235. Controleer de staafeigenschappen.`,
  );
  return { E: E_STAAL, A: 3877, I: 1.673e7, bron: "default" };
}

/**
 * Eigen gewicht van een staaf als verdeelde last in kN/m, negatief omdat de
 * zwaartekracht in −Z werkt.
 *
 *   q = ρ · A · g
 *
 * De doorsnede komt uit dezelfde `resolveSection` als de stijfheid, zodat het
 * eigen gewicht niet van een ander profiel kan zijn dan waar de solver mee
 * rekent. Een houten balk krijgt de dichtheid van zijn sterkteklasse, geen
 * staaldichtheid.
 */
export function eigenGewichtPerMeter(
  material: string | undefined,
  profile: string | undefined,
): number {
  const { A, aBruto } = resolveSection(material, profile);
  const mat = material ?? "S235";
  const vrij = parseVrijMateriaal(material);
  const rho =
    vrij?.dichtheid ??
    TIMBER_RHO_MEAN[mat] ??
    (mat in CONCRETE_E_CM ? RHO_BETON : RHO_STAAL);
  // A in mm² → m²; resultaat N/m → kN/m. Voor het gewicht telt de volle
  // doorsnede, niet alleen het meewerkende deel.
  return -(rho * ((aBruto ?? A) * 1e-6) * G) / 1000;
}
