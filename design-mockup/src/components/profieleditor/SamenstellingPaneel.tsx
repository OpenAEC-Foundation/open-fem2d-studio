/**
 * SamenstellingPaneel — bouwstenen van een samengestelde doorsnede:
 * lamellen (rechthoekige platen), catalogusprofielen als deel, en de
 * herkenning van een gesloten cel voor de torsie.
 */
import { REEKSEN, basisprofielVan, profielenVanReeks, reeksVanProfiel } from "../../lib/profieleditor/catalogus";
import { herkenGeslotenCel } from "../../lib/profieleditor/geometrie";
import { nieuwId } from "../../lib/profieleditor/id";
import { PRESETS } from "../../lib/profieleditor/presets";
import type { Catalogusdeel, DoorsnedeOntwerp, Lamel } from "../../lib/profieleditor/types";
import GetalVeld from "./GetalVeld";

type Samenstelling = Extract<DoorsnedeOntwerp, { soort: "samenstelling" }>;

interface Props {
  ontwerp: Samenstelling;
  onWijzig: (o: Samenstelling) => void;
  geselecteerd: string | null;
  onSelecteer: (id: string | null) => void;
}

export default function SamenstellingPaneel({ ontwerp, onWijzig, geselecteerd, onSelecteer }: Props) {
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

  return (
    <>
      <div className="pe-kop">Startvormen</div>
      <div className="pe-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="pe-preset"
            onClick={() => {
              const o = p.maak();
              if (o.soort === "samenstelling") onWijzig(o);
              onSelecteer(null);
            }}
            title={p.omschrijving}
          >
            {p.label}
            <small>{p.omschrijving}</small>
          </button>
        ))}
      </div>

      <div className="pe-kop">Lamellen (platen)</div>
      <div className="pe-hint">
        Positie = zwaartepunt van de plaat; b langs de plaat, t de dikte; α = 0 liggend, 90 staand.
        Slepen in het tekenvlak verplaatst een plaat.
      </div>
      <div className="pe-lijst">
        {ontwerp.lamellen.map((l, i) => (
          <div
            key={l.id}
            className={`pe-item${geselecteerd === l.id ? " actief" : ""}`}
            onClick={() => onSelecteer(l.id)}
          >
            <div className="pe-item-kop">
              <span>
                Lamel {i + 1} <span className="pe-item-sub">{l.b_mm} × {l.t_mm}</span>
              </span>
              <span className="pe-knoppen">
                <button className="pe-knop pe-knop-klein" onClick={(e) => { e.stopPropagation(); dupliceer(l); }} title="Kopie erboven">
                  ⧉
                </button>
                <button className="pe-knop pe-knop-klein pe-knop-gevaar" onClick={(e) => { e.stopPropagation(); verwijder(l.id); }} title="Verwijderen">
                  ✕
                </button>
              </span>
            </div>
            <div className="pe-velden pe-velden-3">
              <GetalVeld label="b" eenheid="mm" waarde={l.b_mm} min={0.1} onWijzig={(v) => zetLamel(l.id, { b_mm: v })} />
              <GetalVeld label="t" eenheid="mm" waarde={l.t_mm} min={0.1} stap={0.5} onWijzig={(v) => zetLamel(l.id, { t_mm: v })} />
              <GetalVeld label="α" eenheid="°" waarde={l.alphaGraden} stap={15} onWijzig={(v) => zetLamel(l.id, { alphaGraden: v })} />
              <GetalVeld label="y" eenheid="mm" waarde={l.y_mm} onWijzig={(v) => zetLamel(l.id, { y_mm: v })} />
              <GetalVeld label="z" eenheid="mm" waarde={l.z_mm} onWijzig={(v) => zetLamel(l.id, { z_mm: v })} />
            </div>
          </div>
        ))}
      </div>
      <div className="pe-knoppen">
        <button className="pe-knop" onClick={voegLamelToe}>＋ Lamel</button>
      </div>

      <div className="pe-kop">Catalogusprofielen als deel</div>
      <div className="pe-hint">
        Geplaatst op het zwaartepunt van het deel. Met catalogusdelen is W_pl niet bepaald en gaat
        de doorsnede als eigenschappen (niet als geometrie) naar de toetsing.
      </div>
      <div className="pe-lijst">
        {ontwerp.catalogusdelen.map((d, i) => {
          const reeks = reeksVanProfiel(d.profiel.naam) ?? REEKSEN[0].id;
          return (
            <div
              key={d.id}
              className={`pe-item${geselecteerd === d.id ? " actief" : ""}`}
              onClick={() => onSelecteer(d.id)}
            >
              <div className="pe-item-kop">
                <span>Deel {i + 1} <span className="pe-item-sub">{d.profiel.naam}</span></span>
                <button className="pe-knop pe-knop-klein pe-knop-gevaar" onClick={(e) => { e.stopPropagation(); verwijder(d.id); }} title="Verwijderen">
                  ✕
                </button>
              </div>
              <div className="pe-profielkeuze" style={{ marginTop: 6 }}>
                <select
                  value={reeks}
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
                  onChange={(e) => {
                    const p = basisprofielVan(e.target.value);
                    if (p) zetDeel(d.id, { profiel: p });
                  }}
                >
                  {profielenVanReeks(reeks).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="pe-velden pe-velden-3">
                <GetalVeld label="y" eenheid="mm" waarde={d.y_mm} onWijzig={(v) => zetDeel(d.id, { y_mm: v })} />
                <GetalVeld label="z" eenheid="mm" waarde={d.z_mm} onWijzig={(v) => zetDeel(d.id, { z_mm: v })} />
                <GetalVeld label="α" eenheid="°" waarde={d.alphaGraden} stap={15} onWijzig={(v) => zetDeel(d.id, { alphaGraden: v })} />
                <label className="pe-veld pe-veld-vink">
                  <input type="checkbox" checked={d.gespiegeld} onChange={(e) => zetDeel(d.id, { gespiegeld: e.target.checked })} />
                  gespiegeld (y → −y)
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="pe-knoppen">
        <button className="pe-knop" onClick={voegDeelToe}>＋ Catalogusdeel</button>
      </div>

      <div className="pe-kop">Torsie</div>
      <label className="pe-veld pe-veld-vink">
        <input
          type="checkbox"
          checked={ontwerp.celMeenemen}
          onChange={(e) => onWijzig({ ...ontwerp, celMeenemen: e.target.checked })}
        />
        gesloten cel meenemen (Bredt)
      </label>
      <div className="pe-hint">
        {cel
          ? `Gesloten cel herkend uit ${cel.lamellen.length} platen. ${ontwerp.celMeenemen ? "Wordt met de formule van Bredt meegenomen." : "Uit: I_t wordt met de open formule ⅓·Σb·t³ bepaald en onderschat de koker sterk."}`
          : "Geen gesloten cel herkend: de lamellen vormen geen enkelvoudige ring (open doorsnede)."}
      </div>
    </>
  );
}
