/**
 * TocSection — de inhoudsopgave IN het rapport.
 *
 * Toont de hoofdstukken (en desgewenst de subsecties) met hun echte
 * paginanummers. Die nummers komen niet uit een gok maar uit de paginering
 * zelf: paginate.ts leest na elke slag af op welk vel elke kop begint en
 * geeft dat door aan toc.ts (zie daar voor de terugkoppeling en de
 * convergentiebewaking).
 *
 * De kop is bewust ONGENUMMERD (`.rpt-h2-vrij`): een inhoudsopgave is
 * voorwerk, net als het titelblad, en telt dus niet mee in de
 * hoofdstuknummering — anders zou de lijst zelf hoofdstuk 1 zijn.
 *
 * Op scherm is elke regel een sprong-link naar het hoofdstuk. Dat werkt ook
 * op het gekloonde vel: de klik wordt doorgespeeld naar dit echte element
 * (zie koppelBedieningsDoorgifte in paginate.ts). In de print is het gewoon
 * een regel tekst.
 */
import { useTranslation } from "react-i18next";
import { useReportStore } from "../../../stores/reportStore";
import { useInhoudsopgave } from "../toc";
import { scrollNaarKop } from "../paginate";

export default function TocSection() {
  const { t } = useTranslation("ribbon");
  const regels = useInhoudsopgave();
  const diepte = useReportStore((s) => s.inhoudsopgaveDiepte);

  const zichtbaar = regels.filter((r) => r.niveau <= diepte + 1);

  return (
    <div className="rpt-block rpt-toc">
      <h2 className="rpt-h2 rpt-h2-vrij">
        {t("report.sectionToc", "Inhoudsopgave")}
      </h2>

      {zichtbaar.length === 0 ? (
        <p className="rpt-empty-note">
          {t(
            "report.tocLeeg",
            "Nog geen hoofdstukken — zet secties aan in de zijbalk.",
          )}
        </p>
      ) : (
        <div className="rpt-toc-lijst">
          {zichtbaar.map((r) => (
            <button
              key={r.nummer}
              type="button"
              className={`rpt-toc-regel rpt-toc-niveau${r.niveau}`}
              onClick={() => scrollNaarKop(r.nummer)}
              title={t("report.jumpTo", "Spring naar dit hoofdstuk")}
            >
              <span className="rpt-toc-nummer">{r.nummer}</span>
              <span className="rpt-toc-titel">{r.titel}</span>
              <span className="rpt-toc-stippel" aria-hidden="true" />
              <span className="rpt-toc-pagina">{r.pagina}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
