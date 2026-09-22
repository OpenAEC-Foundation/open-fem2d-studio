/**
 * WAT HET EIGEN GEWICHT IS — voor het tekenvlak, de tabel en het rapport.
 *
 * Eén bron (issue #42, punt 3): de lasten die hier staan zijn LETTERLIJK de
 * uitvoer van `eigenGewichtLasten`, de functie waarmee `bouwMultiInput` de
 * rekengang voedt. Dit bestand rekent geen q uit; het zet er alleen de
 * afleiding naast (ρ, A, g) die een lezer nodig heeft om het getal na te
 * rekenen, uit dezelfde bouwstenen (`dichtheidVanMateriaal`, `resolveSection`,
 * `G`) als waar `eigenGewichtLasten` zelf uit put. Dat afleiding en last
 * overeenkomen bewaakt test-eigen-gewicht-geval.mjs (|q| = ρ·A·g/1000).
 *
 * Platen: de rekengang zet het plaatgewicht als ρ·g·t·A-knooplasten op de
 * meshknopen (engine → PlateLoads). Hier staat de vlaklast ρ·g·t in kN/m² met
 * dezelfde ρ (`bepaalPlaatStijfheid`) en dezelfde g (`STANDARD_GRAVITY`).
 */
import type { Beam, LoadCase, Node, Plate } from "../components/fem/femTypes";
import { STANDARD_GRAVITY } from "../core/fem/PlateLoads";
import { eigenGewichtDoel, eigenGewichtGeval, type EigenGewichtDoel } from "./eigenGewicht";
import { eigenGewichtLasten, plaatNaarSolverInput, staafLengteMm } from "./modelNaarSolverInput";
import { bepaalPlaatStijfheid } from "./plaatMateriaal";
import { bepaalVerloop, dichtheidVanMateriaal, G, resolveSection } from "./sectionResolver";

/** Eén gegenereerde lijnlast (of deellast bij een verlopend profiel). */
export interface EigenGewichtDeel {
  /** kN/m, negatief = omlaag — exact de waarde die de solver krijgt. */
  q: number;
  /** Fracties van de staaflengte; 0 en 1 bij een prismatische staaf. */
  startFrac: number;
  endFrac: number;
  /** Doorsnede-oppervlak waarmee dit deel weegt, in mm². */
  A_mm2: number;
}

export interface EigenGewichtStaaf {
  beamId: number;
  materiaal: string;
  profiel: string;
  /** Eindprofiel bij een verlopende staaf. */
  profielEind?: string;
  /** Volumieke massa in kg/m³. */
  rho: number;
  /** Staaflengte in mm. */
  lengteMm: number;
  /** De lasten; leeg als q verwaarloosbaar is (dan zet de rekengang er ook geen). */
  delen: EigenGewichtDeel[];
  /** Totaal gewicht van de staaf in kN (positief). */
  gewichtKN: number;
}

export interface EigenGewichtPlaat {
  plateId: number;
  materiaal: string;
  rho: number;
  dikteMm: number;
  /** Vlaklast ρ·g·t in kN/m², negatief = omlaag. */
  p: number;
}

export interface EigenGewichtOverzicht {
  /** De uitkomst van de regel, ook als de schakelaar uit staat. */
  doel: EigenGewichtDoel<LoadCase>;
  /** Het geval dat het eigen gewicht werkelijk krijgt; null = wordt niet meegerekend. */
  caseId: number | null;
  /** Valversnelling in m/s² zoals de rekengang hem gebruikt. */
  g: number;
  staven: EigenGewichtStaaf[];
  platen: EigenGewichtPlaat[];
  /** Aantal gegenereerde lasten: staaflasten + platen. Voor de teller op de tab. */
  aantalLasten: number;
  /** Totaal gewicht van alle staven in kN (platen niet: hun oppervlak volgt uit het mesh). */
  gewichtStavenKN: number;
}

/**
 * Het overzicht van het automatische eigen gewicht. Met de schakelaar uit (of
 * zonder geldig geval) zijn `staven` en `platen` leeg en is `caseId` null: er
 * wordt dan niets gegenereerd, dus er valt niets te tonen.
 */
export function eigenGewichtOverzicht(model: {
  nodes: readonly Node[];
  beams: readonly Beam[];
  plates: readonly Plate[];
  loadCases: readonly LoadCase[];
  selfWeightEnabled: boolean | undefined;
}): EigenGewichtOverzicht {
  const doel = eigenGewichtDoel(model.loadCases);
  const geval = eigenGewichtGeval(model.loadCases, model.selfWeightEnabled);
  const leeg: EigenGewichtOverzicht = {
    doel, caseId: null, g: G, staven: [], platen: [], aantalLasten: 0, gewichtStavenKN: 0,
  };
  if (!geval) return leeg;

  const staven: EigenGewichtStaaf[] = [];
  for (const b of model.beams) {
    const lengteMm = staafLengteMm(b, model.nodes);
    // DE bron: dezelfde aanroep als in `bouwMultiInput`.
    const lasten = eigenGewichtLasten(b, lengteMm, geval.id);
    const verlopend = bepaalVerloop(b.material, b.profile, b.profileEnd).status === "verlopend";
    const sec = resolveSection(b.material, b.profile);
    const rho = dichtheidVanMateriaal(b.material);
    const delen: EigenGewichtDeel[] = lasten.map((l) => ({
      q: l.q,
      startFrac: l.startFrac ?? 0,
      endFrac: l.endFrac ?? 1,
      // Prismatisch: de volle doorsnede (aBruto bij kruislaaghout), zoals
      // `eigenGewichtPerMeter`. Verlopend: het oppervlak volgt uit de last
      // zelf, want de segmenten dragen hun A niet mee naar buiten.
      A_mm2: verlopend ? (Math.abs(l.q) * 1000 / (rho * G)) * 1e6 : (sec.aBruto ?? sec.A),
    }));
    const gewichtKN = delen.reduce(
      (s, d) => s + Math.abs(d.q) * (d.endFrac - d.startFrac) * (lengteMm / 1000), 0);
    staven.push({
      beamId: b.id,
      materiaal: b.material ?? "S235",
      profiel: b.profile ?? "",
      ...(verlopend && b.profileEnd ? { profielEind: b.profileEnd } : {}),
      rho, lengteMm, delen, gewichtKN,
    });
  }

  const platen: EigenGewichtPlaat[] = [];
  for (const p of model.plates) {
    const invoer = plaatNaarSolverInput(p);
    const st = bepaalPlaatStijfheid(invoer);
    // Een plaat met een onbekend materiaal stopt de rekengang zelf al, met
    // reden; hier valt voor zo'n plaat niets te tonen.
    if (!st.ok) continue;
    platen.push({
      plateId: p.id,
      materiaal: (p.materiaal ?? "").trim(),
      rho: st.stijfheid.rho,
      dikteMm: invoer.thickness,
      p: -(st.stijfheid.rho * STANDARD_GRAVITY * (invoer.thickness / 1000)) / 1000,
    });
  }

  return {
    doel, caseId: geval.id, g: G, staven, platen,
    aantalLasten: staven.reduce((s, x) => s + x.delen.length, 0) + platen.length,
    gewichtStavenKN: staven.reduce((s, x) => s + x.gewichtKN, 0),
  };
}
