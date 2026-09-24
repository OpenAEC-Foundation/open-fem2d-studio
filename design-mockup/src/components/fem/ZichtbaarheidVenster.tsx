/**
 * ZichtbaarheidVenster — alle weergave-instellingen van de modelweergave bij
 * elkaar (issue #47), in drie groepen: Labels, Geometrie en Resultaten.
 *
 * Het venster heeft GEEN eigen toestand: elke schakelaar leest en zet dezelfde
 * vlag in `displayFlags` als de schakelaar in de verkenner (Resultaten →
 * Weergave op canvas), en het tekenvlak volgt direct. Welke rijen er zijn en
 * wat er onthouden wordt, staat in lib/zichtbaarheid.ts.
 *
 * Bereikbaar via het lint (tab Inzicht → Zichtbaarheid) en via het tandwiel
 * bij "Weergave op canvas" in de verkenner.
 */
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import "./FemProjectTree.css";
import "./ZichtbaarheidVenster.css";
import { DEFAULT_DISPLAY_FLAGS, type DisplayFlags } from "./FemResultsOverlay";
import { useResultaatInfoStore } from "../../stores/resultaatInfoStore";
import {
  WEERGAVE_VOORKEUREN,
  ZICHTBAARHEID,
  ZICHTBAARHEID_GROEPEN,
  vlagAan,
  zetVlag,
  type ZichtbaarheidRij,
} from "../../lib/zichtbaarheid";

interface Props {
  open: boolean;
  onClose: () => void;
  displayFlags: DisplayFlags;
  setDisplayFlags: React.Dispatch<React.SetStateAction<DisplayFlags>>;
  /** Het stramien van het project (structuralGrid.enabled); ontbreekt = rij weg. */
  stramienAan?: boolean;
  setStramienAan?: (aan: boolean) => void;
  /** Heeft het model platen? Dan staat de plaatcontour erbij. */
  hasPlates?: boolean;
}

const GROEP_TITEL = {
  labels: "zichtbaarheid.groepLabels",
  geometrie: "zichtbaarheid.groepGeometrie",
  resultaten: "zichtbaarheid.groepResultaten",
} as const;

export default function ZichtbaarheidVenster({
  open, onClose, displayFlags, setDisplayFlags, stramienAan, setStramienAan, hasPlates = false,
}: Props) {
  const { t } = useTranslation("common");
  // Zelfde regel als de verkenner: EI alleen met segmentuitkomsten.
  const heeftSegmentStijfheid = useResultaatInfoStore((s) => s.heeftSegmentStijfheid);

  const rijen = (groep: keyof typeof ZICHTBAARHEID) =>
    ZICHTBAARHEID[groep].filter((r) =>
      !(r.alleenMetPlaten && !hasPlates) && !(r.sleutel === "stramien" && stramienAan === undefined));

  const standaard = () =>
    setDisplayFlags((f) => {
      let uit = f;
      for (const k of WEERGAVE_VOORKEUREN) uit = zetVlag(uit, k, DEFAULT_DISPLAY_FLAGS[k]);
      return uit;
    });

  const renderRij = (r: ZichtbaarheidRij) => {
    const stramien = r.sleutel === "stramien";
    const aan = stramien ? stramienAan === true : vlagAan(displayFlags, r.sleutel as Exclude<typeof r.sleutel, "stramien">);
    const bovenUit = r.onder !== undefined && !vlagAan(displayFlags, r.onder);
    const reden = r.sleutel === "EI" && !heeftSegmentStijfheid ? t("tree.rowEIDisabled") : undefined;
    const label = r.letterlijk ?? t(r.label);
    const wissel = () => {
      if (reden) return;
      if (stramien) setStramienAan?.(!aan);
      else setDisplayFlags((f) => zetVlag(f, r.sleutel as Exclude<typeof r.sleutel, "stramien">, !aan));
    };
    return (
      <div key={r.sleutel} className={`fem-results-row${r.onder ? " zichtbaarheid-sub" : ""}`}>
        <button
          type="button"
          role="switch"
          aria-checked={aan}
          data-vlag={r.sleutel}
          className={`fem-results-toggle${aan && !reden ? " active" : ""}${reden ? " disabled" : ""}${bovenUit ? " zichtbaarheid-gedempt" : ""}`}
          onClick={wissel}
          disabled={!!reden}
          title={reden ?? t(r.hint)}
        >
          <span className="fem-results-toggle-label">{label}</span>
          <span className={`fem-switch${aan && !reden ? " on" : ""}`} aria-hidden="true">
            <span className="fem-switch-dot" />
          </span>
        </button>
        {bovenUit && (
          <div className="zichtbaarheid-noot">{t("zichtbaarheid.alleenMetAanzicht")}</div>
        )}
        {stramien && <div className="zichtbaarheid-noot">{t("zichtbaarheid.stramienProject")}</div>}
      </div>
    );
  };

  const footer = (
    <>
      <span className="zichtbaarheid-onthouden">{t("zichtbaarheid.onthouden")}</span>
      <button type="button" className="zichtbaarheid-knop" onClick={standaard} data-actie="standaard">
        {t("zichtbaarheid.standaard")}
      </button>
      <button type="button" className="zichtbaarheid-knop primair" onClick={onClose} data-actie="sluiten">
        {t("close")}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={t("zichtbaarheid.titel")} width={680} className="zichtbaarheid-venster" footer={footer}>
      <div className="zichtbaarheid-groepen">
        {ZICHTBAARHEID_GROEPEN.map((g) => (
          <section key={g} className="zichtbaarheid-groep" data-groep={g}>
            <div className="fem-results-section-title">{t(GROEP_TITEL[g])}</div>
            {g === "resultaten" && <div className="zichtbaarheid-noot">{t("zichtbaarheid.resultatenNoot")}</div>}
            <div className="fem-results-toggle-list">{rijen(g).map(renderRij)}</div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
