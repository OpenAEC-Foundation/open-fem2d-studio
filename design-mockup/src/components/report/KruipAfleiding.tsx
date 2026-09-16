/**
 * KruipAfleiding — φ(∞,t₀) volgens NEN-EN 1992-1-1 bijlage B, navertelbaar.
 *
 * WAAROM DIT BLOK BESTAAT. Staat bijlage B aan en geeft het project geen φ op,
 * dan rekent de kern de kruipcoëfficiënt per staaf uit, en die waarde stuurt de
 * BGT-stijfheid (7.20) en de kolomtoets (5.19). Een getal dat zo zwaar weegt,
 * hoort in het rapport met zijn herkomst te staan: welke RH, welke h₀, welke
 * tak van (B.3) en (B.8), welke aangepaste t₀.
 *
 * WAT HIER WEL EN NIET GEBEURT. De keten is UITGESCHREVEN DOOR DE KERN
 * (`nen-en-1992-1-1/src/kruip.rs`) en wordt hier alleen weergegeven; de
 * kanttekeningen komen woordelijk uit het kernantwoord. Er wordt in dit bestand
 * niets uitgerekend.
 */
import { useTranslation } from "react-i18next";
import type { CreepCoefficientResponse } from "../../lib/types/concrete/CreepCoefficientResponse";
import Deelstappen from "./Deelstappen";
import { fmtValue } from "./checkReportUtils";

export default function KruipAfleiding({
  antwoord,
}: {
  antwoord: CreepCoefficientResponse | undefined;
}) {
  const { t } = useTranslation("ribbon");
  if (!antwoord) return null;
  const u = antwoord.uitkomst;
  return (
    <div className="rpt-beff">
      <p className="rpt-bet-kopje">
        {t("report.kruipKop", "Kruipcoëfficiënt φ(∞,t₀) volgens bijlage B")}
      </p>
      <p className="rpt-beff-inleiding">
        {t("report.kruipInleiding", {
          defaultValue:
            "Berekend uit RH = {{rh}} %, h₀ = {{h0}} mm, t₀ = {{t0}} dagen en cementklasse {{cement}}: φ(∞,t₀) = {{phi}}. Met deze waarde rekenen de BGT-stijfheid en de kolomtoets van deze staaf, omdat er geen φ(∞,t₀) is opgegeven.",
          rh: fmtValue(u.relative_humidity_pct, 0),
          h0: fmtValue(u.h0_mm, 1),
          t0: fmtValue(u.t0_days, 1),
          cement: u.cement_class,
          phi: fmtValue(u.phi_inf_t0, 2),
        })}
      </p>
      <Deelstappen
        stappen={antwoord.deelstappen}
        kop={t("report.kruipKetenKop", "Afleiding volgens bijlage B, stap voor stap:")}
      />
      {antwoord.notes.length > 0 && (
        <ul className="rpt-beff-topologie">
          {antwoord.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
