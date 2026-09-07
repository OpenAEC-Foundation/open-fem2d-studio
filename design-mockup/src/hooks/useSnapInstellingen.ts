/**
 * useSnapInstellingen — welke snaps staan aan, gedeeld door het canvas en de
 * statusbalk.
 *
 * WAAROM EEN EIGEN WINKELTJE EN GEEN PROP
 * De knopjes staan in de statusbalk onderin (`components/StatusBar.tsx`) en de
 * snap zelf zit in `FemCanvas`. Die twee zijn in de boom broer en zus, met
 * `App.tsx` ertussen; de instelling erdoorheen prop-drillen zou App.tsx nog een
 * stuk canvas-toestand geven die daar niets te zoeken heeft. Dit is bewust een
 * piepklein extern winkeltje op `useSyncExternalStore`: geen bibliotheek, geen
 * context-provider, en beide kanten lezen exact dezelfde waarde.
 *
 * De instelling is VLUCHTIG (leeft zolang het venster leeft) en hoort niet in
 * het projectbestand: het is een tekenhulp, geen modelgegeven.
 */
import { useSyncExternalStore } from "react";

/** De snapsoorten, in de volgorde waarin ze voorrang hebben. */
export const SNAP_SOORTEN = ["knoop", "stramien", "raster"] as const;
export type SnapSoort = (typeof SNAP_SOORTEN)[number];

export interface SnapInstellingen {
  /** Vangen op een bestaande knoop — de sterkste snap. */
  knoop: boolean;
  /** Vangen op een stramienas (verticale as of niveaulijn). */
  stramien: boolean;
  /** Vangen op het achtergrondraster — de zwakste snap. */
  raster: boolean;
}

/** NL-labels + uitleg voor de knopjes in de statusbalk. */
export const SNAP_LABELS: Record<SnapSoort, { kort: string; uitleg: string }> = {
  knoop: {
    kort: "Knoop",
    uitleg: "Vangen op bestaande knopen. Wint van stramien en raster.",
  },
  stramien: {
    kort: "Stramien",
    uitleg: "Vangen op stramienassen en niveaulijnen. Wint van het raster.",
  },
  raster: {
    kort: "Raster",
    uitleg: "Vangen op het achtergrondraster — de zwakste snap.",
  },
};

const BEGINSTAND: SnapInstellingen = { knoop: true, stramien: true, raster: true };

let stand: SnapInstellingen = BEGINSTAND;
const luisteraars = new Set<() => void>();

function meld() {
  for (const l of luisteraars) l();
}

function abonneer(l: () => void): () => void {
  luisteraars.add(l);
  return () => { luisteraars.delete(l); };
}

function lees(): SnapInstellingen {
  return stand;
}

/** Zet één snapsoort aan of uit. */
export function zetSnap(soort: SnapSoort, aan: boolean): void {
  if (stand[soort] === aan) return;
  stand = { ...stand, [soort]: aan };
  meld();
}

/** Wissel één snapsoort. */
export function wisselSnap(soort: SnapSoort): void {
  zetSnap(soort, !stand[soort]);
}

/** Zet alle snaps in één keer aan of uit. */
export function zetAlleSnaps(aan: boolean): void {
  if (SNAP_SOORTEN.every((s) => stand[s] === aan)) return;
  stand = { knoop: aan, stramien: aan, raster: aan };
  meld();
}

/** Huidige stand buiten React om (voor tests en niet-reactieve lezers). */
export function leesSnapInstellingen(): SnapInstellingen {
  return stand;
}

/** Terug naar de beginstand — alleen voor tests. */
export function herstelSnapBeginstand(): void {
  stand = BEGINSTAND;
  meld();
}

/** React-hook: leest de actuele stand en hertekent bij elke wijziging. */
export function useSnapInstellingen(): SnapInstellingen {
  return useSyncExternalStore(abonneer, lees, lees);
}
