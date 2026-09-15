/**
 * rekenPoort — wat er in de app gebeurt vlak vóór en vlak ná een rekengang,
 * als pure functies.
 *
 * WAAROM DIT APART STAAT
 * De drie beslissingen hieronder zaten in `App.tsx`, verweven met React-state,
 * en daar gingen ze stil mis:
 *
 *  1. Het multi-LC-pad (combinaties, omhullende, toetsing, rapport) draaide
 *     GEEN modelcontrole; alleen het canvas deed dat. Een staaf van lengte nul
 *     gaf daardoor "Model niet doorgerekend" in het canvas en tegelijk
 *     "Berekend om" in de statusbalk, met getoetste krachten van een ander
 *     model.
 *  2. Een fout van het multi-LC-pad ging alleen naar de console. Ook de
 *     knikmelding van de tweede orde ("belasting op of boven de kritieke
 *     (knik)waarde") bereikte de gebruiker niet.
 *  3. Het canvaspad rekent altijd eerste orde en slaagt dus vaak waar het
 *     multi-LC-pad faalt. Zijn geslaagde uitkomst zette de statusbalk daarna
 *     alsnog op "Berekend om".
 *
 * Zonder React en zonder DOM, zodat de regels te testen zijn
 * (`test-modelcontrole.mjs`).
 */
import type { SolverStatus } from "../components/StatusBar";
import { beeldKernfoutAf } from "../mcp/fouten";
import { controleerModel, type ControleModel } from "./modelControle";

/**
 * De modelcontrole van het canvas, nu ook als poort voor het multi-LC-pad.
 * Gooit bij blokkerende bevindingen, met de bevindingen zelf in de melding —
 * het multi-LC-pad heeft geen controlepaneel om naar te verwijzen.
 */
export function controleerVoorRekenen(model: ControleModel): void {
  const blokkerend = controleerModel(model).filter((b) => b.ernst === "fout");
  if (blokkerend.length === 0) return;
  const eerste = blokkerend.slice(0, 3).map((b) => b.tekst);
  const rest = blokkerend.length - eerste.length;
  throw new Error(
    `Model niet doorgerekend — ${blokkerend.length} ` +
      `${blokkerend.length === 1 ? "onderdeel is" : "onderdelen zijn"} niet goed ` +
      `aangesloten. ${eerste.join(" ")}` +
      (rest > 0 ? ` En nog ${rest} andere; zie de modelcontrole.` : ""),
  );
}

/**
 * De tekst die de gebruiker te zien krijgt bij een mislukte rekengang.
 *
 * Een bekende kernmelding wordt vertaald met dezelfde tabel die de MCP-weg
 * gebruikt (`mcp/fouten.ts`), zodat app en MCP-client hetzelfde zeggen. Een
 * onbekende melding komt ONGEWIJZIGD door — de MCP-tekst "de sidecar kent deze
 * melding niet" zou in de app nergens op slaan, en een eigen vertaling
 * verzinnen zou een oorzaak suggereren die niemand heeft vastgesteld.
 */
export function leesbareRekenfout(e: unknown): string {
  const origineel = e instanceof Error ? e.message : String(e);
  const afgebeeld = beeldKernfoutAf(origineel);
  return afgebeeld.herkend ? afgebeeld.melding : origineel;
}

/**
 * De status na de canvasberekening.
 *
 * Een geslaagde canvasberekening mag de status alleen op "Berekend om" zetten
 * als de rekengang (het multi-LC-pad) óók slaagde. Faalde die, dan blijft de
 * foutstatus staan — anders meldt de statusbalk succes bij een model waarvan
 * de combinaties, de omhullende en de toetsing ontbreken.
 *
 * `null` = laat de status zoals hij is (bijvoorbeeld: invalidatie zonder
 * nieuwe uitkomst).
 */
export function statusNaCanvasSolve(
  canvasGeslaagd: boolean,
  rekenfout: string | null,
  nu: number,
): SolverStatus | null {
  if (!canvasGeslaagd) return null;
  if (rekenfout !== null) return { kind: "error" };
  return { kind: "solved", at: nu };
}
