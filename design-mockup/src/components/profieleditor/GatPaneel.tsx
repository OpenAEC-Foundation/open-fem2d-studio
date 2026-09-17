/**
 * GatPaneel — een gat maken in een bestaand catalogusprofiel: basisprofiel
 * kiezen en gaten toevoegen (door het lijf, door een flens, door de
 * buiswand), rond of rechthoekig.
 */
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { REEKSEN, basisprofielVan, profielLabel, profielenVanReeks, reeksLabel, reeksVanProfiel } from "../../lib/profieleditor/catalogus";
import { vertaalWaarde } from "../../lib/vertaalbareTekst";
import {
  controleerGat,
  plaatsSleutel,
  standaardGat,
  toegestanePlaatsen,
  vrijePlaatbereiken,
} from "../../lib/profieleditor/geometrie";
import { fmtMaat } from "../../lib/profieleditor/format";
import { nieuwId } from "../../lib/profieleditor/id";
import type { Basisprofiel, DoorsnedeOntwerp, Gat, GatPlaats } from "../../lib/profieleditor/types";
import GetalVeld from "./GetalVeld";

type GatOntwerp = Extract<DoorsnedeOntwerp, { soort: "gat" }>;

/** Volledige plaats, bv. "door het lijf" — voor de tooltip en de gatkaart. */
function plaatsTekst(plaats: GatPlaats, basis: Basisprofiel): string {
  return i18next.t(`check:profileEditor.holes.place.${plaatsSleutel(plaats, basis)}`);
}

/**
 * Knopnaam voor een plaats: zonder voorzetsel, zodat de drie ＋-knoppen naast
 * de kop passen. De volledige plaats staat in de tooltip en op de gatkaart zelf.
 */
function knopNaam(plaats: GatPlaats, basis: Basisprofiel): string {
  if (plaats === "vlak") return i18next.t("check:profileEditor.holes.longHole");
  return i18next.t(`check:profileEditor.holes.placeShort.${plaatsSleutel(plaats, basis)}`);
}

interface Props {
  ontwerp: GatOntwerp;
  onWijzig: (o: GatOntwerp) => void;
  geselecteerd: string | null;
  onSelecteer: (id: string | null) => void;
}

export default function GatPaneel({ ontwerp, onWijzig, geselecteerd, onSelecteer }: Props) {
  const { t } = useTranslation("check");
  const GAT_UITLEG = t("profileEditor.holes.help");
  const basis = ontwerp.basis;
  const reeks = reeksVanProfiel(basis.naam) ?? REEKSEN[0].id;
  const plaatsen = toegestanePlaatsen(basis);

  const kiesProfiel = (naam: string) => {
    const p = basisprofielVan(naam);
    if (!p) return;
    // Gaten die door de nieuwe maten niet meer passen laten we staan; de
    // controle hieronder meldt dat, zodat de gebruiker ze zelf verschuift.
    onWijzig({ ...ontwerp, basis: p, gaten: ontwerp.gaten.filter((g) => plaatsen.includes(g.plaats) || toegestanePlaatsen(p).includes(g.plaats)) });
  };

  const zetGat = (id: string, patch: Partial<Gat>) =>
    onWijzig({ ...ontwerp, gaten: ontwerp.gaten.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

  const voegToe = (plaats: GatPlaats) => {
    const g = standaardGat(basis, plaats, nieuwId());
    onWijzig({ ...ontwerp, gaten: [...ontwerp.gaten, g] });
    onSelecteer(g.id);
  };

  const verwijder = (id: string) => {
    onWijzig({ ...ontwerp, gaten: ontwerp.gaten.filter((g) => g.id !== id) });
    if (geselecteerd === id) onSelecteer(null);
  };

  return (
    <>
      <div className="pe-kop">{t("profileEditor.holes.baseProfile")}</div>
      <div className="pe-profielkeuze">
        <select
          value={reeks}
          title={t("profileEditor.holes.seriesTitle")}
          onChange={(e) => {
            const eerste = profielenVanReeks(e.target.value)[0];
            if (eerste) kiesProfiel(eerste);
          }}
        >
          {REEKSEN.map((r) => <option key={r.id} value={r.id}>{vertaalWaarde(t, reeksLabel(r))}</option>)}
        </select>
        <select value={basis.naam} title={t("profileEditor.holes.sizeTitle")} onChange={(e) => kiesProfiel(e.target.value)}>
          {profielenVanReeks(reeks).map((n) => <option key={n} value={n}>{profielLabel(n)}</option>)}
        </select>
      </div>
      <div className="pe-maatregel" title={t("profileEditor.holes.dimensionsTitle")}>
        h = {fmtMaat(basis.h)} · b = {fmtMaat(basis.b)} · t_w = {fmtMaat(basis.tw)} · t_f = {fmtMaat(basis.tf)} · r = {fmtMaat(basis.r)} mm
      </div>

      {/*
        De uitleg over wat een gat met de doorsnede doet staat in de tooltip
        van de kop én van elke ＋-knop: uit beeld, niet uit de app.
      */}
      <div className="pe-kop pe-kop-rij">
        <span title={GAT_UITLEG}>{t("profileEditor.holes.holes")}{ontwerp.gaten.length > 0 ? ` (${ontwerp.gaten.length})` : ""}</span>
        <span className="pe-knoppen">
          {plaatsen.map((p) => (
            <button
              key={p}
              type="button"
              className="pe-tknop pe-tknop-mini"
              onClick={() => voegToe(p)}
              title={t("profileEditor.holes.addTitle", { plaats: plaatsTekst(p, basis), help: GAT_UITLEG })}
            >
              ＋ {knopNaam(p, basis)}
            </button>
          ))}
        </span>
      </div>

      {ontwerp.gaten.length === 0 && <div className="pe-leeg">{t("profileEditor.holes.empty")}</div>}

      <div className="pe-lijst">
        {ontwerp.gaten.map((g, i) => {
          const fout = controleerGat(g, basis);
          const bereik = vrijePlaatbereiken(basis, g.plaats)
            .map(([a, b]) => `${fmtMaat(a)}–${fmtMaat(b)}`)
            .join(t("profileEditor.holes.rangeOr"));
          return (
            <div
              key={g.id}
              className={`pe-item${geselecteerd === g.id ? " actief" : ""}`}
              onClick={() => onSelecteer(g.id)}
            >
              <div className="pe-item-kop">
                <span>
                  {t("profileEditor.holes.holeN", { n: i + 1 })} <span className="pe-item-sub">{plaatsTekst(g.plaats, basis)}</span>
                </span>
                <button type="button" className="pe-tknop pe-tknop-mini pe-tknop-gevaar" onClick={(e) => { e.stopPropagation(); verwijder(g.id); }} title={t("profileEditor.holes.deleteTitle")}>
                  ✕
                </button>
              </div>
              <div className="pe-velden">
                <label className="pe-veld">
                  <span>{t("profileEditor.holes.position")}</span>
                  <select
                    value={g.plaats}
                    onChange={(e) => {
                      const nieuw = standaardGat(basis, e.target.value as GatPlaats, g.id);
                      zetGat(g.id, { ...nieuw, vorm: g.vorm, d: g.d, b: g.b, h: g.h });
                    }}
                  >
                    {plaatsen.map((p) => <option key={p} value={p}>{plaatsTekst(p, basis)}</option>)}
                  </select>
                </label>
                <label className="pe-veld">
                  <span>{t("profileEditor.holes.shape")}</span>
                  <select value={g.vorm} onChange={(e) => zetGat(g.id, { vorm: e.target.value as Gat["vorm"] })}>
                    <option value="rond">{t("profileEditor.holes.round")}</option>
                    <option value="rechthoek">{t("profileEditor.holes.rectangular")}</option>
                  </select>
                </label>
                {g.vorm === "rond" ? (
                  <GetalVeld label={t("profileEditor.holes.diameter")} eenheid="mm" waarde={g.d} min={0.1} onWijzig={(v) => zetGat(g.id, { d: v })} />
                ) : (
                  <>
                    <GetalVeld
                      label={g.plaats === "vlak" ? t("profileEditor.holes.widthB") : t("profileEditor.holes.alongPlate")}
                      eenheid="mm"
                      waarde={g.plaats === "vlak" ? g.b : g.h}
                      min={0.1}
                      onWijzig={(v) => zetGat(g.id, g.plaats === "vlak" ? { b: v } : { h: v })}
                    />
                    {g.plaats === "vlak" && (
                      <GetalVeld label={t("profileEditor.holes.heightH")} eenheid="mm" waarde={g.h} min={0.1} onWijzig={(v) => zetGat(g.id, { h: v })} />
                    )}
                  </>
                )}
                {g.plaats === "lijf" && (
                  <GetalVeld label={t("profileEditor.holes.heightZ")} eenheid="mm" waarde={g.z} titel={t("profileEditor.holes.webRange", { bereik })} onWijzig={(v) => zetGat(g.id, { z: v })} />
                )}
                {(g.plaats === "flensBoven" || g.plaats === "flensOnder") && (
                  <GetalVeld label={t("profileEditor.holes.positionY")} eenheid="mm" waarde={g.y} titel={t("profileEditor.holes.flangeRange", { bereik })} onWijzig={(v) => zetGat(g.id, { y: v })} />
                )}
                {g.plaats === "wand" && (
                  <GetalVeld label={t("profileEditor.holes.anglePosition")} eenheid="°" waarde={g.hoekGraden} stap={15} titel={t("profileEditor.holes.angleTitle")} onWijzig={(v) => zetGat(g.id, { hoekGraden: v })} />
                )}
                {g.plaats === "vlak" && (
                  <>
                    <GetalVeld label={t("profileEditor.holes.yMid")} eenheid="mm" waarde={g.y} onWijzig={(v) => zetGat(g.id, { y: v })} />
                    <GetalVeld label={t("profileEditor.holes.zMid")} eenheid="mm" waarde={g.z} onWijzig={(v) => zetGat(g.id, { z: v })} />
                    {g.vorm === "rechthoek" && (
                      <GetalVeld label={t("profileEditor.holes.rotation")} eenheid="°" waarde={g.hoekGraden} stap={15} onWijzig={(v) => zetGat(g.id, { hoekGraden: v })} />
                    )}
                  </>
                )}
              </div>
              {fout && <div className="pe-melding pe-melding-fout" style={{ marginTop: 6 }}>{fout}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
