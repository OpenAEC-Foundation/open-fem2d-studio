/**
 * SamenstellingPaneel — de bouwstenen van een samengestelde doorsnede:
 * lamellen (rechthoekige platen), catalogusprofielen als deel, en de
 * herkenning van een gesloten cel voor de torsie.
 *
 * Het paneel is een lijst met knoppen, geen handleiding: startvormen zijn
 * silhouetten met hun naam, de uitleg over lamellen, catalogusdelen en de
 * gesloten cel zit in de tooltip van de knop of het veld waar hij bij hoort.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { REEKSEN, basisprofielVan, profielLabel, profielenVanReeks, reeksVanProfiel } from "../../lib/profieleditor/catalogus";
import { herkenGeslotenCel } from "../../lib/profieleditor/geometrie";
import { nieuwId } from "../../lib/profieleditor/id";
import { PRESETS } from "../../lib/profieleditor/presets";
import type { Catalogusdeel, DoorsnedeOntwerp, Lamel } from "../../lib/profieleditor/types";
import GetalVeld from "./GetalVeld";
import OntwerpMiniatuur from "./OntwerpMiniatuur";

type Samenstelling = Extract<DoorsnedeOntwerp, { soort: "samenstelling" }>;

interface Props {
  ontwerp: Samenstelling;
  onWijzig: (o: Samenstelling) => void;
  geselecteerd: string | null;
  onSelecteer: (id: string | null) => void;
}

export default function SamenstellingPaneel({ ontwerp, onWijzig, geselecteerd, onSelecteer }: Props) {
  const { t } = useTranslation("check");
  const LAMEL_UITLEG = t("profileEditor.assembly.plateHelp");
  const DEEL_UITLEG = t("profileEditor.assembly.partHelp");
  // Eén keer per paneel: de startvormen als tekenbare geometrie, voor de
  // silhouetten op de knoppen. `maak()` deelt bij elke aanroep nieuwe id's uit,
  // dus dit hoort niet elke render opnieuw te gebeuren.
  const startvormen = useMemo(() => PRESETS.map((p) => ({ preset: p, vorm: p.maak() })), []);

  const zetLamel = (id: string, patch: Partial<Lamel>) =>
    onWijzig({ ...ontwerp, lamellen: ontwerp.lamellen.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const zetDeel = (id: string, patch: Partial<Catalogusdeel>) =>
    onWijzig({
      ...ontwerp,
      catalogusdelen: ontwerp.catalogusdelen.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });

  const voegLamelToe = () => {
    const laatste = ontwerp.lamellen[ontwerp.lamellen.length - 1];
    const nieuw: Lamel = {
      id: nieuwId(),
      b_mm: laatste?.b_mm ?? 200,
      t_mm: laatste?.t_mm ?? 10,
      y_mm: laatste?.y_mm ?? 0,
      z_mm: laatste ? laatste.z_mm + 50 : 0,
      alphaGraden: 0,
    };
    onWijzig({ ...ontwerp, lamellen: [...ontwerp.lamellen, nieuw] });
    onSelecteer(nieuw.id);
  };

  const voegDeelToe = () => {
    const p = basisprofielVan("HEA 200") ?? basisprofielVan(profielenVanReeks("HEA")[0] ?? "");
    if (!p) return;
    const nieuw: Catalogusdeel = { id: nieuwId(), profiel: p, y_mm: 0, z_mm: 0, alphaGraden: 0, gespiegeld: false };
    onWijzig({ ...ontwerp, catalogusdelen: [...ontwerp.catalogusdelen, nieuw] });
    onSelecteer(nieuw.id);
  };

  const verwijder = (id: string) => {
    onWijzig({
      ...ontwerp,
      lamellen: ontwerp.lamellen.filter((l) => l.id !== id),
      catalogusdelen: ontwerp.catalogusdelen.filter((d) => d.id !== id),
    });
    if (geselecteerd === id) onSelecteer(null);
  };

  const dupliceer = (l: Lamel) => {
    const kopie: Lamel = { ...l, id: nieuwId(), z_mm: l.z_mm + l.t_mm + 10 };
    onWijzig({ ...ontwerp, lamellen: [...ontwerp.lamellen, kopie] });
    onSelecteer(kopie.id);
  };

  const cel = herkenGeslotenCel(ontwerp.lamellen);
  const aantal = ontwerp.lamellen.length + ontwerp.catalogusdelen.length;

  // De hele celuitleg in één tooltip; in beeld blijft alleen de uitkomst.
  const celTitel = cel
    ? ontwerp.celMeenemen
      ? t("profileEditor.assembly.cellIncluded", { count: cel.lamellen.length })
      : t("profileEditor.assembly.cellExcluded", { count: cel.lamellen.length })
    : t("profileEditor.assembly.cellNone");
  const celStatus = cel ? t("profileEditor.assembly.cellPlates", { count: cel.lamellen.length }) : t("profileEditor.assembly.cellStatusNone");

  return (
    <>
      <div className="pe-kop" title={t("profileEditor.assembly.presetsTitle")}>
        {t("profileEditor.assembly.presets")}
      </div>
      <div className="pe-presets">
        {startvormen.map(({ preset, vorm }) => (
          <button
            key={preset.id}
            type="button"
            className="pe-preset"
            onClick={() => {
              const o = preset.maak();
              if (o.soort === "samenstelling") onWijzig(o);
              onSelecteer(null);
            }}
            title={`${preset.label} — ${preset.omschrijving}`}
          >
            <OntwerpMiniatuur ontwerp={vorm} />
            <span className="pe-preset-naam">{preset.label}</span>
          </button>
        ))}
      </div>

      <div className="pe-kop pe-kop-rij">
        <span title={t("profileEditor.assembly.blocksTitle")}>
          {t("profileEditor.assembly.blocks")}{aantal > 0 ? ` (${aantal})` : ""}
        </span>
        <span className="pe-knoppen">
          <button type="button" className="pe-tknop pe-tknop-mini" onClick={voegLamelToe} title={t("profileEditor.assembly.addPlateTitle", { help: LAMEL_UITLEG })}>
            {t("profileEditor.assembly.addPlate")}
          </button>
          <button type="button" className="pe-tknop pe-tknop-mini" onClick={voegDeelToe} title={t("profileEditor.assembly.addPartTitle", { help: DEEL_UITLEG })}>
            {t("profileEditor.assembly.addPart")}
          </button>
        </span>
      </div>

      {aantal === 0 && <div className="pe-leeg">{t("profileEditor.assembly.empty")}</div>}

      <div className="pe-lijst">
        {ontwerp.lamellen.map((l, i) => (
          <div
            key={l.id}
            className={`pe-item${geselecteerd === l.id ? " actief" : ""}`}
            onClick={() => onSelecteer(l.id)}
            title={LAMEL_UITLEG}
          >
            <div className="pe-item-kop">
              <span>
                {t("profileEditor.assembly.plateN", { n: i + 1 })} <span className="pe-item-sub">{l.b_mm} × {l.t_mm}</span>
              </span>
              <span className="pe-knoppen">
                <button type="button" className="pe-tknop pe-tknop-mini" onClick={(e) => { e.stopPropagation(); dupliceer(l); }} title={t("profileEditor.assembly.duplicateTitle")}>
                  ⧉
                </button>
                <button type="button" className="pe-tknop pe-tknop-mini pe-tknop-gevaar" onClick={(e) => { e.stopPropagation(); verwijder(l.id); }} title={t("profileEditor.assembly.deletePlateTitle")}>
                  ✕
                </button>
              </span>
            </div>
            <div className="pe-velden pe-velden-3">
              <GetalVeld label="b" eenheid="mm" waarde={l.b_mm} min={0.1} titel={t("profileEditor.assembly.bTitle")} onWijzig={(v) => zetLamel(l.id, { b_mm: v })} />
              <GetalVeld label="t" eenheid="mm" waarde={l.t_mm} min={0.1} stap={0.5} titel={t("profileEditor.assembly.tTitle")} onWijzig={(v) => zetLamel(l.id, { t_mm: v })} />
              <GetalVeld label="α" eenheid="°" waarde={l.alphaGraden} stap={15} titel={t("profileEditor.assembly.alphaTitle")} onWijzig={(v) => zetLamel(l.id, { alphaGraden: v })} />
              <GetalVeld label="y" eenheid="mm" waarde={l.y_mm} titel={t("profileEditor.assembly.plateYTitle")} onWijzig={(v) => zetLamel(l.id, { y_mm: v })} />
              <GetalVeld label="z" eenheid="mm" waarde={l.z_mm} titel={t("profileEditor.assembly.plateZTitle")} onWijzig={(v) => zetLamel(l.id, { z_mm: v })} />
            </div>
          </div>
        ))}

        {ontwerp.catalogusdelen.map((d, i) => {
          const reeks = reeksVanProfiel(d.profiel.naam) ?? REEKSEN[0].id;
          return (
            <div
              key={d.id}
              className={`pe-item${geselecteerd === d.id ? " actief" : ""}`}
              onClick={() => onSelecteer(d.id)}
              title={DEEL_UITLEG}
            >
              <div className="pe-item-kop">
                <span>{t("profileEditor.assembly.partN", { n: i + 1 })} <span className="pe-item-sub">{profielLabel(d.profiel.naam)}</span></span>
                <button type="button" className="pe-tknop pe-tknop-mini pe-tknop-gevaar" onClick={(e) => { e.stopPropagation(); verwijder(d.id); }} title={t("profileEditor.assembly.deletePartTitle")}>
                  ✕
                </button>
              </div>
              <div className="pe-profielkeuze" style={{ marginTop: 6 }}>
                <select
                  value={reeks}
                  title={t("profileEditor.assembly.seriesTitle")}
                  onChange={(e) => {
                    const eerste = profielenVanReeks(e.target.value)[0];
                    const p = eerste ? basisprofielVan(eerste) : undefined;
                    if (p) zetDeel(d.id, { profiel: p });
                  }}
                >
                  {REEKSEN.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <select
                  value={d.profiel.naam}
                  title={t("profileEditor.assembly.sizeTitle")}
                  onChange={(e) => {
                    const p = basisprofielVan(e.target.value);
                    if (p) zetDeel(d.id, { profiel: p });
                  }}
                >
                  {profielenVanReeks(reeks).map((n) => <option key={n} value={n}>{profielLabel(n)}</option>)}
                </select>
              </div>
              <div className="pe-velden pe-velden-3">
                <GetalVeld label="y" eenheid="mm" waarde={d.y_mm} titel={t("profileEditor.assembly.partYTitle")} onWijzig={(v) => zetDeel(d.id, { y_mm: v })} />
                <GetalVeld label="z" eenheid="mm" waarde={d.z_mm} titel={t("profileEditor.assembly.partZTitle")} onWijzig={(v) => zetDeel(d.id, { z_mm: v })} />
                <GetalVeld label="α" eenheid="°" waarde={d.alphaGraden} stap={15} titel={t("profileEditor.assembly.partAlphaTitle")} onWijzig={(v) => zetDeel(d.id, { alphaGraden: v })} />
                <label className="pe-veld pe-veld-vink" title={t("profileEditor.assembly.mirroredTitle")}>
                  <input type="checkbox" checked={d.gespiegeld} onChange={(e) => zetDeel(d.id, { gespiegeld: e.target.checked })} />
                  {t("profileEditor.assembly.mirrored")}
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <label className="pe-schakelaar" title={celTitel}>
        <input
          type="checkbox"
          checked={ontwerp.celMeenemen}
          onChange={(e) => onWijzig({ ...ontwerp, celMeenemen: e.target.checked })}
        />
        <span>{t("profileEditor.assembly.closedCell")}</span>
        <span className={`pe-schakelaar-status${cel ? " pe-aan" : ""}`}>{celStatus}</span>
      </label>
    </>
  );
}
