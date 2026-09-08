/**
 * useSectieRelevantie — het oordeel "kan dit model dit hoofdstuk vullen?" voor
 * de hele sectieregistry, als afgeleide waarde.
 *
 * De regels zelf staan in lib/sectieRelevantie.ts en zijn zuiver. Deze hook
 * doet alleen het verzamelwerk: de modelstate komt als argument binnen (die
 * leeft in de useFemStore-instantie van App.tsx en reist via
 * ReportDataContext), de toetsresultaten en het segmentspoor komen uit hun
 * eigen zustand-stores.
 *
 * DE MODELSTATE ALS ARGUMENT EN NIET UIT DE CONTEXT
 * Twee afnemers, aan weerszijden van de provider: `ReportShell` staat eronder
 * en zou `useReportData()` kunnen gebruiken, maar `ReportPreview` — die de
 * zijbalk tekent — is juist de component die de provider ZET en kan zijn eigen
 * context dus niet lezen. Eén hook met de gegevens als argument bedient beide,
 * en garandeert dat de zijbalk precies dempt wat de schil weglaat.
 *
 * In het losgekoppelde rapportvenster zijn alle drie de bronnen gevuld door
 * reportSync (modelsnapshot, checkStore en betonStijfheidStore reizen mee), dus
 * daar valt het oordeel identiek uit.
 */
import { useMemo } from "react";
import { useCheckStore } from "../../stores/checkStore";
import { useBetonStijfheidStore } from "../../stores/betonStijfheidStore";
import { redenenPerSectie } from "../../lib/sectieRelevantie";
import { REPORT_SECTIONS } from "./reportSections";
import type { ReportData } from "./ReportDataContext";

/**
 * Reden per sectie-id, alléén voor de secties die dit model niet kan vullen.
 * Een lege map betekent: elk hoofdstuk is van toepassing.
 */
export function useSectieRelevantie(data: ReportData): Map<string, string> {
  const checkResults = useCheckStore((s) => s.results);
  const stijfheidCombinaties = useBetonStijfheidStore((s) => s.combinaties);
  const { beams, plates } = data;

  return useMemo(
    () =>
      redenenPerSectie(REPORT_SECTIONS, {
        beams,
        plates,
        checkResults,
        fysischeCombinaties: stijfheidCombinaties.length,
      }),
    [beams, plates, checkResults, stijfheidCombinaties.length],
  );
}
