/**
 * resultScope — gedeelde combinatie-keuze van de resultaatsecties (R3).
 *
 * De drie resultaatsecties (krachtsverdeling, oplegreacties, verplaatsingen)
 * tonen resultaten "voor de gekozen combinatie". Die keuze leeft ÉÉN keer in
 * de reportStore (resultCombo) zodat de secties consistent hetzelfde
 * rekengeval laten zien. Dit bestand levert:
 *
 *  - useResultScope(): resolven van de keuze tegen wat er daadwerkelijk aan
 *    resultaten beschikbaar is (default: omhullende indien aanwezig, anders
 *    de eerste combinatie met resultaten; een verwijderde combinatie valt
 *    stil terug op de default);
 *  - <ScopeSelector/>: de dropdown — schermweergave alleen (verdwijnt in de
 *    print via .rpt-screen-only); de print toont de keuze als tekstregel
 *    (<ScopePrintLine/>) of in de tabelkoppen van de sectie zelf;
 *  - <NotComputedNote/>: de eerlijke "Nog niet berekend"-melding. De
 *    beschikbaarheid volgt de invalidatie in useFemStore: elke wijziging aan
 *    knopen/staven/opleggingen/lasten zet combinationResults/envelope op
 *    null, dus verouderde resultaten kunnen hier nooit stilzwijgend blijven
 *    staan.
 */
import { useTranslation } from "react-i18next";
import type { LoadCombination } from "../fem/solver/combinations";
import type { SolverResult } from "../fem/solver/types";
import { useReportStore } from "../../stores/reportStore";
import { useReportData } from "./ReportDataContext";

export interface ResultScope {
  /** True zodra er minstens één combinatie mét resultaat is. */
  hasResults: boolean;
  /** Combinaties waarvoor daadwerkelijk een SolverResult beschikbaar is. */
  combosWithResults: LoadCombination[];
  /** Is de omhullende beschikbaar als keuze? */
  envelopeAvailable: boolean;
  /** De opgeloste keuze: 'envelope' of een combinatie-id. */
  scope: "envelope" | number;
  /** De combinatie bij een numerieke scope (undefined bij 'envelope'). */
  combo?: LoadCombination;
  /** Het SolverResult bij een numerieke scope (undefined bij 'envelope'). */
  result?: SolverResult;
}

export function useResultScope(): ResultScope {
  const { combinations, combinationResults, envelope } = useReportData();
  const resultCombo = useReportStore((s) => s.resultCombo);

  const combosWithResults = combinationResults
    ? combinations.filter((c) => combinationResults.has(c.id))
    : [];
  const hasResults = combosWithResults.length > 0;
  const envelopeAvailable = hasResults && envelope !== null;

  let scope: "envelope" | number;
  if (!hasResults) {
    scope = "envelope"; // irrelevant — secties tonen de "nog niet berekend"-melding
  } else if (
    typeof resultCombo === "number" &&
    combosWithResults.some((c) => c.id === resultCombo)
  ) {
    scope = resultCombo;
  } else if (resultCombo === "envelope" && envelopeAvailable) {
    scope = "envelope";
  } else {
    // Automatisch (null) of een niet-meer-bestaande keuze:
    // omhullende indien beschikbaar, anders de eerste combinatie.
    scope = envelopeAvailable ? "envelope" : combosWithResults[0].id;
  }

  const combo =
    typeof scope === "number"
      ? combosWithResults.find((c) => c.id === scope)
      : undefined;
  const result =
    combo && combinationResults ? combinationResults.get(combo.id) : undefined;

  return { hasResults, combosWithResults, envelopeAvailable, scope, combo, result };
}

/** Weergavenaam van de opgeloste scope ("Omhullende …" of de combinatienaam). */
export function useScopeName(rs: ResultScope): string {
  const { t } = useTranslation("ribbon");
  if (rs.scope === "envelope") {
    return t("report.scopeEnvelope", "Omhullende (alle combinaties)");
  }
  return rs.combo?.name ?? String(rs.scope);
}

/**
 * Dropdown voor de combinatie-keuze — alleen op scherm (.rpt-screen-only).
 * In de print draagt de sectie zelf de keuze (ScopePrintLine of tabelkop).
 */
export function ScopeSelector({ rs }: { rs: ResultScope }) {
  const { t } = useTranslation("ribbon");
  const setResultCombo = useReportStore((s) => s.setResultCombo);
  if (!rs.hasResults) return null;

  const value = rs.scope === "envelope" ? "envelope" : String(rs.scope);
  return (
    <div className="rpt-scope rpt-screen-only">
      <label>
        <span className="rpt-scope-label">{t("report.scopeLabel", "Combinatie")}:</span>
        <select
          className="rpt-scope-select"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            setResultCombo(v === "envelope" ? "envelope" : Number(v));
          }}
        >
          {rs.envelopeAvailable && (
            <option value="envelope">
              {t("report.scopeEnvelope", "Omhullende (alle combinaties)")}
            </option>
          )}
          {rs.combosWithResults.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Print-tegenhanger van de dropdown: "Combinatie: <naam>" als tekstregel. */
export function ScopePrintLine({ rs }: { rs: ResultScope }) {
  const { t } = useTranslation("ribbon");
  const name = useScopeName(rs);
  if (!rs.hasResults) return null;
  return (
    <p className="rpt-note rpt-print-only">
      {t("report.scopeLabel", "Combinatie")}: {name}
    </p>
  );
}

/** De eerlijke lege-toestand van elke resultaatsectie. */
export function NotComputedNote() {
  const { t } = useTranslation("ribbon");
  return (
    <p className="rpt-empty-note">
      {t(
        "report.notComputed",
        "Nog niet berekend — voer de berekening uit via Berekenen. Na een modelwijziging vervallen eerdere resultaten automatisch.",
      )}
    </p>
  );
}
