/**
 * ProjectSection — rapportkop met projectgegevens.
 *
 * Leest live uit de projectinfo-instelling (Instellingen → Projectgegevens);
 * wijzig je die, dan rendert de kop direct mee (useProjectInfo abonneert op
 * het plugin-store event).
 *
 * Koptekst-regel (R2): vrije tekst bovenaan het rapport (bedrijfsregel/
 * briefhoofd), direct in het rapport te bewerken. Het invoerveld is
 * scherm-chrome: bij print rendert alleen de tekst (of niets als hij leeg
 * is). Opslag: extra veld `reportHeader` in de projectinfo-setting.
 * Logo-upload is bewust R5+ — nu alleen tekst.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { setSetting } from "../../../store";
import { useCheckStore } from "../../../stores/checkStore";
import {
  normenInModel,
  normenUitToetsen,
  normenVoorRapport,
} from "../../../lib/normenInRapport";
import { usedNorms } from "../checkReportUtils";
import { useReportData } from "../ReportDataContext";
import { useProjectInfo, useRapportProjectInfo } from "../useProjectInfo";
import {
  DEFAULT_UITGANGSPUNTEN,
  K_FI,
  LEVENSDUUR_OMSCHRIJVING,
} from "../../project/ProjectSettingsDialog";
import { PARTIELE_FACTOREN } from "../../fem/solver/normcombinaties";
import { vrijstaandDakUitgangspunten } from "../../../lib/wind/windGenerator";
import { aanduidingen, bijlageUitBestand, STANDAARD_BIJLAGE } from "../../../lib/normAanduidingen";

/** yyyy-mm-dd → nl-notatie; alles wat niet parsebaar is blijft zoals het is. */
/**
 * Wat er bij "Nationale bijlage" in het rapport komt te staan.
 *
 * De naam van het land komt uit `lib/normAanduidingen.ts`, dezelfde rij die de
 * normaanduidingen levert — zodat de vermelde bijlage en de vermelde uitgaven
 * niet uit elkaar kunnen lopen. Een code die deze uitgave niet kent, wordt
 * LETTERLIJK genoemd met de melding erbij; stil "Nederland" neerzetten zou het
 * rapport onwaar maken.
 */
function bijlageTekst(code: string | undefined): string {
  try {
    const gekozen = bijlageUitBestand(code) ?? STANDAARD_BIJLAGE;
    return aanduidingen(gekozen).land;
  } catch (e) {
    return `${String(code)} — niet gevuld in deze uitgave (${(e as Error).message})`;
  }
}

function formatDate(raw: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * De scheefstandafleiding als blok: elke regel van `scheefstandToelichting`
 * op een eigen regel, in dezelfde volgorde en met dezelfde woorden.
 *
 * Regel voor regel en niet als één stuk tekst, om dezelfde reden als in de
 * PDF-uitdraai (`report::extend_with_uitgangspunten`): de tussenwaarden zijn
 * uitgelijnd op hun symbool, en een regel die met "!" begint is daar een
 * WAARSCHUWING — die hoort op te vallen en niet in dezelfde grijze kleur te
 * verdwijnen als de getallen eromheen. Zo zeggen het scherm en het papier
 * hetzelfde, in dezelfde vorm.
 */
function ScheefstandBlok({ tekst }: { tekst: string }) {
  return (
    <div className="rpt-scheefstand">
      {tekst.split("\n").map((regel, i) =>
        regel.trim() === "" ? (
          <div key={i} className="rpt-scheefstand-wit" />
        ) : (
          <div
            key={i}
            className={
              regel.startsWith("!") ? "rpt-scheefstand-waarschuwing" : "rpt-scheefstand-regel"
            }
          >
            {regel}
          </div>
        ),
      )}
    </div>
  );
}

export default function ProjectSection() {
  const { t } = useTranslation("ribbon");
  // Twee lezingen, met opzet. `opgeslagen` is de instelling zelf: alleen die
  // mag terug naar de instelling (de koptekst-regel hieronder). `info` is wat
  // het rapport TOONT — tijdens een export via het bedieningskanaal met de kop
  // die de export meegaf (zie useRapportProjectInfo). Schreef de koptekst-regel
  // `info` terug, dan kwam de kop van één export blijvend in de instellingen.
  const opgeslagen = useProjectInfo();
  const info = useRapportProjectInfo();
  // De normenregel is een samenspel van drie bronnen: waarop getoetst is, wat
  // de gebruiker zelf heeft aangevinkt, en wat er aan materiaal in het model
  // zit. De regels en de reden staan in lib/normenInRapport; hier alleen de
  // drie ingrediënten. Kort: een getoetste norm staat er altijd, een door de
  // gebruiker aangevinkte norm ook (hij mag vooruitlopen op wat hij gaat
  // tekenen), en voor de rest volgt de regel het model.
  const gebruikt = usedNorms(useCheckStore((s) => s.results));
  // `scheefstandToelichting` is de afleiding van φ zoals App.tsx hem heeft
  // bepaald — dezelfde tekst die de PDF-uitdraai in haar hoofdstuk
  // Uitgangspunten zet. Hier wordt niets herrekend: stond er geen scheefstand
  // op de lasten, dan is de tekst leeg en zwijgt ook dit blok erover.
  const { beams, scheefstandToelichting, analyseToelichting, combinations, loads, loadCases } = useReportData();

  // Koptekst-regel: lokale draft tijdens het typen; commit (blur/Enter) →
  // projectinfo-setting. In de browser (zonder Tauri) faalt setSetting stil
  // en blijft de regel alleen voor deze sessie staan — in de desktop-app
  // persisteert hij en volgt useProjectInfo het store-event.
  const [headerDraft, setHeaderDraft] = useState<string | null>(null);
  const [sessionHeader, setSessionHeader] = useState<string | null>(null);
  useEffect(() => {
    // Zodra de setting daadwerkelijk verandert, wint de opgeslagen waarde.
    setSessionHeader(null);
  }, [info.reportHeader]);
  const headerValue = headerDraft ?? sessionHeader ?? info.reportHeader ?? "";

  const commitHeader = () => {
    if (headerDraft === null) return;
    const value = headerDraft.trim();
    setHeaderDraft(null);
    setSessionHeader(value);
    void setSetting("projectInfo", { ...opgeslagen, reportHeader: value });
  };

  const rows: Array<{ label: string; value: string }> = [
    { label: t("report.fieldProjectNumber", "Projectnummer"), value: info.projectNumber || "—" },
    { label: t("report.fieldEngineer", "Constructeur"), value: info.engineer || "—" },
    { label: t("report.fieldCompany", "Bedrijf"), value: info.company || "—" },
    { label: t("report.fieldDate", "Datum"), value: formatDate(info.date) },
  ];

  return (
    <header className="rpt-project rpt-block">
      {/* Koptekst-regel: op scherm een subtiel invoerveld, in de print
          alleen de tekst (leeg → niets). */}
      <input
        className="rpt-header-input rpt-screen-only"
        type="text"
        value={headerValue}
        placeholder={t("report.headerPlaceholder", "Koptekst-regel (klik om te bewerken)")}
        onChange={(e) => setHeaderDraft(e.target.value)}
        onBlur={commitHeader}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setHeaderDraft(null);
        }}
        aria-label={t("report.headerLine", "Koptekst")}
      />
      {headerValue.trim() !== "" && (
        <div className="rpt-header-line rpt-print-only">{headerValue}</div>
      )}
      <div className="rpt-doc-kind">{t("report.docKind", "Rekenrapport")}</div>
      <h1 className="rpt-project-title">
        {info.name || t("report.unnamedProject", "Naamloos project")}
      </h1>
      {info.location && <div className="rpt-project-location">{info.location}</div>}
      <table className="rpt-meta-table">
        <tbody>
          {rows.map(({ label, value }) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {info.description && <p className="rpt-project-description">{info.description}</p>}

      {/* Uitgangspunten: toegepaste normen, gevolgklasse en ontwerplevensduur.
          Horen vooraan in elk rekenrapport, vóór de invoergegevens. */}
      {(() => {
        const u = info.uitgangspunten ?? DEFAULT_UITGANGSPUNTEN;
        const toon = normenVoorRapport(
          u,
          normenInModel(beams),
          normenUitToetsen(gebruikt),
        );
        const normen = [
          toon.en1993 && "Eurocode 3 — Staal (EN 1993-1-1)",
          toon.en1995 && "Eurocode 5 — Hout (EN 1995-1-1)",
          toon.en1992 && "Eurocode 2 — Beton (EN 1992-1-1)",
        ].filter(Boolean) as string[];
        const kfi = K_FI[u.gevolgklasse].toFixed(2).replace(".", ",");
        // Wat er met de klasse GEBEURT, niet alleen welke het is. Tot
        // september 2026 stond hier "CCx (K_FI = …)" terwijl de combinaties
        // altijd met de CC2-factoren rekenden. Nu kiest de klasse de factoren
        // van de standaardcombinaties; een eigen UGT-combinatie volgt hem niet,
        // en dat hoort de lezer ook te weten.
        const pf = PARTIELE_FACTOREN[u.gevolgklasse];
        const n = (x: number) => String(x).replace(".", ",");
        const eigenUgt = combinations.filter((c) => c.type === "uls" && !c.standaard).length;
        const gevolgklasseTekst =
          `${u.gevolgklasse} (K_FI = ${kfi}), verwerkt in de partiële factoren van de ` +
          `standaardcombinaties volgens NEN-EN 1990 ${pf.bron}: 6.10a γ_G = ${n(pf.gGsup610a)}, ` +
          `6.10b γ_G = ${n(pf.gGsup610b)}, γ_Q = ${n(pf.gQ)}; K_FI is niet nog eens toegepast` +
          (eigenUgt > 0
            ? `. ${eigenUgt} UGT-combinatie(s) zijn eigen combinaties en volgen de gevolgklasse niet`
            : "");
        const levensduur = LEVENSDUUR_OMSCHRIJVING[u.levensduurklasse]
          .replace(/^Klasse \d+ — /, "");
        const rijen: Array<[string, ReactNode]> = [
          [t("report.fieldNormen", "Toegepaste normen"), normen.length > 0 ? normen.join("; ") : "—"],
          // Het land komt uit de normnaad en niet meer als los woord uit deze
          // regel: de uitgave van elke norm in dit rapport hoort bij dezelfde
          // bijlage. Een bijlage die deze uitgave niet kent, wordt hier
          // benoemd in plaats van stil op Nederland uit te komen.
          [t("report.fieldNationaleBijlage", "Nationale bijlage"), bijlageTekst(u.nationaleBijlage)],
          [t("report.fieldGevolgklasse", "Gevolgklasse"), gevolgklasseTekst],
          [t("report.fieldLevensduur", "Ontwerplevensduur"), levensduur],
        ];
        // De vierde rij: de initiële scheefstand, woordelijk zoals zij is
        // toegepast. Zij hoort hier en niet bij de resultaten — zij is een
        // eigenschap van de constructie en zit als H = φ·V in élke kracht
        // waarop hieronder is getoetst. Staat de schakelaar uit, dan is de
        // tekst leeg en blijft de rij weg; dan is er niets toegepast om te
        // melden, en de PDF-uitdraai laat haar hoofdstuk om dezelfde reden weg.
        // Het analysetype en α_cr per combinatie (basisaudit nr 27): welke
        // berekening er is gedaan en of NEN-EN 1993-1-1 5.2.1(3) die toestaat.
        // Zelfde blokvorm: een "!"-regel is een waarschuwing of fout.
        if (analyseToelichting.trim() !== "") {
          rijen.push([
            t("report.fieldAnalyse", "Berekening en stabiliteit"),
            <ScheefstandBlok tekst={analyseToelichting} />,
          ]);
        }
        // Wind op een vrijstaand dak (§7.3): tabel, α, φ en de gebruikte
        // c_p,net/c_f, uit de omschrijving van de gegenereerde lasten. Staat
        // er geen vrijstaand dak in het model, dan blijft de rij weg.
        const windVrijstaand = vrijstaandDakUitgangspunten(loadCases, loads);
        if (windVrijstaand !== "") {
          rijen.push([
            t("report.fieldWindVrijstaand", "Windbelasting vrijstaand dak"),
            <ScheefstandBlok tekst={windVrijstaand} />,
          ]);
        }
        if (scheefstandToelichting.trim() !== "") {
          rijen.push([
            t("report.fieldScheefstand", "Initiële scheefstand"),
            <ScheefstandBlok tekst={scheefstandToelichting} />,
          ]);
        }
        return (
          <>
            <div className="rpt-uitgangspunten-kop">
              {t("report.uitgangspunten", "Uitgangspunten")}
            </div>
            <table className="rpt-meta-table">
              <tbody>
                {rijen.map(([label, waarde]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td>{waarde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        );
      })()}
    </header>
  );
}
