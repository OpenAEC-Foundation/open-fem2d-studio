/**
 * motorInvoer — van het ontwerp in de editor naar de JSON die de
 * doorsnedemotor leest. Eén vertaalslag, zodat de editor, het opslaan en een
 * eventuele herberekening precies dezelfde invoer sturen.
 */
import { gatNaarMotor, herkenGeslotenCel, radialen } from "./geometrie";
import type { MotorInvoer } from "./motorClient";
import type { DoorsnedeOntwerp, GeslotenCelDef } from "./types";

/** De gesloten cel die meegaat (of null): herkend én door de gebruiker gewild. */
export function celVoorOntwerp(o: DoorsnedeOntwerp): GeslotenCelDef | null {
  if (o.soort !== "samenstelling" || !o.celMeenemen) return null;
  return herkenGeslotenCel(o.lamellen);
}

export function ontwerpNaarMotor(o: DoorsnedeOntwerp, naam: string): MotorInvoer {
  if (o.soort === "gat") {
    const b = o.basis;
    return {
      naam,
      soort: b.soort,
      h: b.h,
      b: b.b,
      tw: b.tw,
      tf: b.tf,
      t: b.tw,
      r: b.r,
      gaten: o.gaten.map((g) => gatNaarMotor(g, b)),
    };
  }
  const cel = celVoorOntwerp(o);
  return {
    naam,
    soort: "Samenstelling",
    lamellen: o.lamellen.map((l) => ({
      b_mm: l.b_mm,
      t_mm: l.t_mm,
      y_mm: l.y_mm,
      z_mm: l.z_mm,
      alpha_rad: radialen(l.alphaGraden),
    })),
    catalogusdelen: o.catalogusdelen.map((d) => ({
      soort: d.profiel.soort,
      h: d.profiel.h,
      b: d.profiel.b,
      tw: d.profiel.tw,
      tf: d.profiel.tf,
      r: d.profiel.r,
      y_mm: d.y_mm,
      z_mm: d.z_mm,
      alpha_rad: radialen(d.alphaGraden),
      gespiegeld: d.gespiegeld,
    })),
    gesloten_cellen: cel ? [cel] : [],
  };
}

/** Is er iets te berekenen? */
export function ontwerpIsLeeg(o: DoorsnedeOntwerp): boolean {
  return o.soort === "samenstelling" && o.lamellen.length === 0 && o.catalogusdelen.length === 0;
}
