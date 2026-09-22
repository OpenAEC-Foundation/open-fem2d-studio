/**
 * LoadsSection — belastinggevallen met per geval een tabel van de lasten:
 * type, staaf/knoop, waarde (q, F, M of ΔT), richting en bij deellasten het
 * belaste bereik in m vanaf de startknoop. Plus het automatische eigen gewicht
 * in het geval dat het krijgt, met de afleiding q = ρ·A·g per staaf. Het geval
 * én de getallen komen uit `eigenGewichtOverzicht` — dezelfde regel
 * (lib/eigenGewicht) en dezelfde functie (`eigenGewichtLasten`) als de solver.
 * Zonder geldig geval rekent de solver het eigen gewicht niet mee, en zegt dit
 * rapport dat.
 */
import { useTranslation } from "react-i18next";
import type { Load, LoadCase } from "../../fem/femTypes";
import { plaatRandTekst, bepaalPlaatlastRand } from "../../fem/femTypes";
import { beamLengthMm } from "../../../lib/steelCheckBuilder";
import { useReportData } from "../ReportDataContext";
import { fmtNum } from "../reportFormat";
import { eigenGewichtOverzicht } from "../../../lib/eigenGewichtOverzicht";

const CASE_TYPE_LABELS: Record<LoadCase["type"], string> = {
  dead: "Permanent",
  live: "Variabel",
  snow: "Sneeuw",
  wind: "Wind",
  other: "Overig",
};

export default function LoadsSection() {
  const { t } = useTranslation("ribbon");
  const { beams, nodes, plates, loads, loadCases, selfWeightEnabled } = useReportData();

  /**
   * Randlengte (m) van een plaatlast, langs `bepaalPlaatlastRand` — dezelfde regel
   * als de rekenkern, zodat "1,25 – 2,50 m" in het rapport dezelfde meters
   * zijn als waarmee gerekend is. `null` bij een ongeldig adres; de tabel
   * valt dan terug op fracties.
   */
  const randLengteM = (l: Load): number | null => {
    const plaat = l.plateId !== undefined ? plates.find((p) => p.id === l.plateId) : undefined;
    if (!plaat) return null;
    const hoeken = plaat.nodeIds.map((id) => nodes.find((n) => n.id === id));
    if (hoeken.some((h) => h === undefined)) return null;
    const rand = bepaalPlaatlastRand(
      hoeken.map((h) => ({ x: h!.x, z: h!.z })), plaat.openingen, l);
    return rand.ok ? rand.lengte / 1000 : null;
  };

  // Zelfde regel én zelfde lasten als de solver (bouwMultiInput): het geval
  // met het kenmerk `eigenGewicht`, en zonder kenmerk het eerste "dead"-geval.
  // Zonder geldig geval rekent de solver het eigen gewicht NIET mee. Tot
  // september 2026 viel het dan stil in het eerste geval, met de factoren van
  // dát type, en noemde dit rapport dat geval; nu staat er dat het eigen
  // gewicht ontbreekt (ruw 7 van de basisaudit).
  const eigenGewicht = eigenGewichtOverzicht({ nodes, beams, plates, loadCases, selfWeightEnabled });
  const selfWeightCase = eigenGewicht.caseId !== null
    ? loadCases.find((c) => c.id === eigenGewicht.caseId)
    : undefined;

  // De omschrijvingskolom verschijnt alleen als er érgens in het model een
  // omschrijving staat — anders zou elk rapport een lege kolom met streepjes
  // meedragen. De keuze geldt voor het HELE hoofdstuk, niet per geval: tabellen
  // met wisselende kolomindelingen onder elkaar lezen als een fout.
  const toontOmschrijving = loads.some((l) => (l.omschrijving ?? "").trim() !== "");

  const typeLabel = (l: Load): string => {
    switch (l.type) {
      case "pointForce": return t("home.pointLoad", "Puntlast");
      case "pointMoment": return t("home.moment", "Moment");
      case "lineLoad": return t("home.lineLoad", "Lijnlast");
      case "thermal": return t("home.temp", "Temperatuur");
      case "edgeLoad": return t("report.edgeLoad", "Randlast");
    }
  };

  /** NL-labels voor de benoemde plaatranden (edgeLoad, P3.3). */
  const EDGE_LABELS: Record<NonNullable<Load["edge"]>, string> = {
    bottom: t("report.edgeBottom", "onderrand"),
    top: t("report.edgeTop", "bovenrand"),
    left: t("report.edgeLeft", "linkerrand"),
    right: t("report.edgeRight", "rechterrand"),
  };

  /**
   * De rand zoals ingevoerd. Een rand-index heet "rand i+1"; alleen een
   * benoemde rand krijgt zijn naam, en een last op een openingsrand noemt zijn
   * opening ("rand 3 van opening 2"). Hier stond `EDGE_LABELS[l.edge ?? "top"]`,
   * waardoor een randlast op een polygoonrand in het rapport als "bovenrand"
   * verscheen.
   */
  const randTekst = (l: Load): string =>
    l.edge !== undefined && l.edgeIndex === undefined && l.openingId === undefined
      ? EDGE_LABELS[l.edge]
      : plaatRandTekst(l, t);

  const targetText = (l: Load): string => {
    if (l.plateId !== undefined && (l.type === "edgeLoad" || l.type === "pointForce")) {
      const basis = `${t("report.plateWord", "plaat")} ${l.plateId}, ${randTekst(l)}`;
      if (l.type !== "pointForce") return basis;
      // Puntlast op een plaatrand: de positie in m vanaf de beginhoek van de
      // rand (of als fractie, als de rand niet te bepalen is).
      const L = randLengteM(l);
      const frac = l.posFrac ?? 0;
      return L !== null
        ? `${basis}, ${t("report.atPosition", "op")} ${fmtNum(frac * L, 2)} m`
        : `${basis}, ${t("report.atPosition", "op")} ${fmtNum(frac, 2)}·L`;
    }
    if (l.beamId !== undefined) return `${t("report.beamWord", "staaf")} ${l.beamId}`;
    if (l.nodeId !== undefined) return `${t("report.nodeWord", "knoop")} ${l.nodeId}`;
    return "—";
  };

  const valueText = (l: Load): string => {
    switch (l.type) {
      case "lineLoad": {
        const hasTrapezoid = l.qStart !== undefined || l.qEnd !== undefined;
        if (hasTrapezoid) {
          const q1 = l.qStart ?? l.q ?? 0;
          const q2 = l.qEnd ?? l.q ?? 0;
          return `q = ${fmtNum(q1, 2)} → ${fmtNum(q2, 2)} kN/m`;
        }
        return `q = ${fmtNum(l.q ?? 0, 2)} kN/m`;
      }
      case "pointForce": {
        const parts: string[] = [];
        if (l.fx !== undefined && l.fx !== 0) parts.push(`Fx = ${fmtNum(l.fx, 2)} kN`);
        if (l.fz !== undefined && l.fz !== 0) parts.push(`Fz = ${fmtNum(l.fz, 2)} kN`);
        return parts.length > 0 ? parts.join("; ") : "F = 0 kN";
      }
      case "pointMoment":
        return `My = ${fmtNum(l.my ?? 0, 2)} kNm`;
      case "thermal":
        return `ΔT = ${fmtNum(l.deltaT ?? 0, 1)} K`;
      case "edgeLoad": {
        // Trapezium langs de rand: dezelfde velden als bij een staaf.
        if (l.qStart !== undefined || l.qEnd !== undefined) {
          const p1 = l.qStart ?? l.q ?? 0;
          const p2 = l.qEnd ?? l.q ?? 0;
          return `p = ${fmtNum(p1, 2)} → ${fmtNum(p2, 2)} kN/m`;
        }
        return `p = ${fmtNum(l.q ?? 0, 2)} kN/m`;
      }
    }
  };

  const directionText = (l: Load): string => {
    if (l.type !== "lineLoad" && l.type !== "edgeLoad") return "—";
    return (l.qDir ?? "z") === "z"
      ? t("report.dirVertical", "z (verticaal)")
      : t("report.dirHorizontal", "x (horizontaal)");
  };

  /**
   * Deellast-bereik in m vanaf de startknoop (staaf) of de beginhoek
   * (plaatrand); volle lengte → "volledige lengte".
   */
  const rangeText = (l: Load): string => {
    const opStaaf = l.type === "lineLoad" && l.beamId !== undefined;
    const opRand = l.type === "edgeLoad" && l.plateId !== undefined;
    if (!opStaaf && !opRand) return "—";
    const start = l.startFrac ?? 0;
    const end = l.endFrac ?? 1;
    if (start <= 0 && end >= 1) {
      return opRand
        ? t("report.fullEdge", "volledige rand")
        : t("report.fullLength", "volledige lengte");
    }
    let lenM: number | null = null;
    if (opStaaf) {
      const beam = beams.find((b) => b.id === l.beamId);
      lenM = beam ? beamLengthMm(beam, nodes) / 1000 : null;
    } else {
      lenM = randLengteM(l);
    }
    if (lenM === null) return `${fmtNum(start, 2)}·L – ${fmtNum(end, 2)}·L`;
    return `${fmtNum(start * lenM, 2)} – ${fmtNum(end * lenM, 2)} m`;
  };

  return (
    <div className="rpt-block">
      <h2 className="rpt-h2">{t("report.sectionLoads", "Belastinggevallen")}</h2>

      {loadCases.length === 0 ? (
        <p className="rpt-empty-note">
          {t("report.noLoadCases", "Geen belastinggevallen in het model.")}
        </p>
      ) : (
        loadCases.map((lc) => {
          const caseLoads = loads.filter((l) => l.caseId === lc.id);
          const carriesSelfWeight = selfWeightCase?.id === lc.id;
          // Type-tag weglaten als de gevalnaam het type al noemt
          // ("Permanent (G)" + tag "Permanent" leest dubbelop).
          const gevalType = t(`report.caseType_${lc.type}`, CASE_TYPE_LABELS[lc.type]);
          const tagToont = !lc.name.toLowerCase().includes(gevalType.toLowerCase());
          return (
            <div className="rpt-loadcase-block" key={lc.id}>
              <h3 className="rpt-h3">
                {lc.name}
                {tagToont && <span className="rpt-h3-tag">{gevalType}</span>}
              </h3>
              {caseLoads.length === 0 && !carriesSelfWeight ? (
                <p className="rpt-note">
                  {t("report.noLoadsInCase", "Geen lasten in dit geval.")}
                </p>
              ) : (
                <>
                  {caseLoads.length > 0 && (
                    <table className="rpt-table">
                      <thead>
                        <tr>
                          <th>{t("report.colLoadType", "Type")}</th>
                          {toontOmschrijving && (
                            <th>{t("report.colDescription", "Omschrijving")}</th>
                          )}
                          <th>{t("report.colTarget", "Op")}</th>
                          <th>{t("report.colValue", "Waarde")}</th>
                          <th>{t("report.colDirection", "Richting")}</th>
                          <th>{t("report.colRange", "Bereik")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caseLoads.map((l) => (
                          <tr key={l.id}>
                            <td>{typeLabel(l)}</td>
                            {toontOmschrijving && (
                              <td>{(l.omschrijving ?? "").trim() || "—"}</td>
                            )}
                            <td>{targetText(l)}</td>
                            <td>{valueText(l)}</td>
                            <td>{directionText(l)}</td>
                            <td>{rangeText(l)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {carriesSelfWeight && (
                    <>
                      <p className="rpt-note" style={{ marginTop: "1.5mm" }}>
                        {t(
                          "report.selfWeightIncluded",
                          "Eigen gewicht van alle staven wordt in dit geval automatisch meegenomen (q = ρ·A·g per staaf).",
                        )}
                        {" "}
                        {t("report.selfWeightG", "g = {{g}} m/s².", { g: fmtNum(eigenGewicht.g, 2) })}
                      </p>
                      {eigenGewicht.staven.some((s) => s.delen.length > 0) && (
                        <table className="rpt-table" data-testid="rpt-eigen-gewicht">
                          <thead>
                            <tr>
                              <th>{t("report.selfWeightColBeam", "Staaf")}</th>
                              <th>{t("report.selfWeightColMaterial", "Materiaal")}</th>
                              <th>{t("report.selfWeightColProfile", "Profiel")}</th>
                              <th>ρ [kg/m³]</th>
                              <th>A [mm²]</th>
                              <th>{t("report.selfWeightColRange", "Bereik")}</th>
                              <th>q = ρ·A·g [kN/m]</th>
                            </tr>
                          </thead>
                          <tbody>
                            {eigenGewicht.staven.flatMap((s) => s.delen.map((d, i) => (
                              <tr key={`${s.beamId}-${i}`}>
                                <td>{s.beamId}</td>
                                <td>{s.materiaal}</td>
                                <td>{s.profielEind ? `${s.profiel} → ${s.profielEind}` : s.profiel}</td>
                                <td>{fmtNum(s.rho, 0)}</td>
                                <td>{fmtNum(d.A_mm2, 0)}</td>
                                <td>
                                  {d.startFrac <= 0 && d.endFrac >= 1
                                    ? t("report.fullLength", "volledige lengte")
                                    : `${fmtNum(d.startFrac * s.lengteMm / 1000, 2)} – ${fmtNum(d.endFrac * s.lengteMm / 1000, 2)} m`}
                                </td>
                                <td>{fmtNum(d.q, 3)}</td>
                              </tr>
                            )))}
                          </tbody>
                        </table>
                      )}
                      {eigenGewicht.platen.length > 0 && (
                        <table className="rpt-table" data-testid="rpt-eigen-gewicht-platen">
                          <thead>
                            <tr>
                              <th>{t("report.selfWeightColPlate", "Plaat")}</th>
                              <th>{t("report.selfWeightColMaterial", "Materiaal")}</th>
                              <th>ρ [kg/m³]</th>
                              <th>t [mm]</th>
                              <th>p = ρ·g·t [kN/m²]</th>
                            </tr>
                          </thead>
                          <tbody>
                            {eigenGewicht.platen.map((pl) => (
                              <tr key={pl.plateId}>
                                <td>{pl.plateId}</td>
                                <td>{pl.materiaal || "—"}</td>
                                <td>{fmtNum(pl.rho, 0)}</td>
                                <td>{fmtNum(pl.dikteMm, 0)}</td>
                                <td>{fmtNum(pl.p, 3)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })
      )}

      {loadCases.length > 0 && selfWeightEnabled && !selfWeightCase && (
        <p className="rpt-note rpt-melding-fout" style={{ marginTop: "3mm" }}>
          {eigenGewicht.doel.soort === "kenmerkNietBlijvend"
            ? t(
                "report.selfWeightCaseNotDead",
                "Eigen gewicht staat aan, maar het belastinggeval met het kenmerk “eigen gewicht” is niet van type “Permanent”: het eigen gewicht is NIET in de berekening meegenomen.",
              )
            : t(
                "report.selfWeightNoDeadCase",
                "Eigen gewicht staat aan, maar er is geen belastinggeval van type “Permanent”: het eigen gewicht is NIET in de berekening meegenomen.",
              )}
        </p>
      )}

      {loadCases.length > 0 && !selfWeightEnabled && (
        <p className="rpt-note" style={{ marginTop: "3mm" }}>
          {t("report.selfWeightOff", "Eigen gewicht is uitgeschakeld — niet in de berekening meegenomen.")}
        </p>
      )}
    </div>
  );
}
