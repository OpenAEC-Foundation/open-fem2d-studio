/**
 * maatgevendMarkeringStore — de plek op een staaf die het toetsingspaneel op
 * het tekenvlak aanwijst (issue #41).
 *
 * Wie in het toetsingspaneel op de maatgevende regel klikt, zet het tekenvlak
 * op de combinatie van die toets en krijgt de positie x op de staaf
 * gemarkeerd. Het paneel en het tekenvlak zijn twee takken van de boom; een
 * kleine store is de kortste weg ertussen, net als bij de toetsuitslag zelf.
 *
 * De markering draagt het tijdstip van de toetsronde waaruit zij komt
 * (`rondeVan`). Het tekenvlak toont haar alleen zolang dat de LOPENDE ronde
 * is: na een herberekening kan de maatgevende plek verschoven zijn, en een
 * oude markering zou dan een positie aanwijzen die de kern niet meer noemt.
 */
import { create } from "zustand";

export interface MaatgevendMarkering {
  beamId: number;
  /** Positie langs de staaf in mm vanaf de beginknoop, zoals de kern hem gaf. */
  positieMm: number;
  /** De combinatie waarbij de positie hoort. */
  combinatieId: number;
  /** `lastRunAt` van de toetsronde waaruit de positie komt. */
  rondeVan: number | null;
}

interface MarkeringState {
  markering: MaatgevendMarkering | null;
  zet: (m: MaatgevendMarkering) => void;
  wis: () => void;
}

export const useMaatgevendMarkeringStore = create<MarkeringState>((set) => ({
  markering: null,
  zet: (markering) => set({ markering }),
  wis: () => set({ markering: null }),
}));

/**
 * Het punt op de staaf, in modelcoördinaten (mm). `null` als de staaf of een
 * van zijn knopen niet (meer) bestaat, of de staaf geen lengte heeft. Een
 * positie buiten de staaf wordt op het dichtstbijzijnde eind gezet: de
 * markering hoort óp de staaf te liggen.
 */
export function puntOpStaaf(
  beam: { from: number; to: number } | undefined,
  nodes: readonly { id: number; x: number; z: number }[],
  positieMm: number,
): { x: number; z: number } | null {
  if (!beam) return null;
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return null;
  const lengte = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(lengte > 0) || !Number.isFinite(positieMm)) return null;
  const t = Math.min(1, Math.max(0, positieMm / lengte));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}
