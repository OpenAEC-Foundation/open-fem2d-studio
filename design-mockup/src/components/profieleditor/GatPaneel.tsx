/**
 * GatPaneel — een gat maken in een bestaand catalogusprofiel: basisprofiel
 * kiezen en gaten toevoegen (door het lijf, door een flens, door de
 * buiswand), rond of rechthoekig.
 */
import { REEKSEN, basisprofielVan, profielenVanReeks, reeksVanProfiel } from "../../lib/profieleditor/catalogus";
import {
  controleerGat,
  plaatsLabel,
  standaardGat,
  toegestanePlaatsen,
  vrijePlaatbereiken,
} from "../../lib/profieleditor/geometrie";
import { fmtMaat } from "../../lib/profieleditor/format";
import { nieuwId } from "../../lib/profieleditor/id";
import type { DoorsnedeOntwerp, Gat, GatPlaats } from "../../lib/profieleditor/types";
import GetalVeld from "./GetalVeld";

type GatOntwerp = Extract<DoorsnedeOntwerp, { soort: "gat" }>;

interface Props {
  ontwerp: GatOntwerp;
  onWijzig: (o: GatOntwerp) => void;
  geselecteerd: string | null;
  onSelecteer: (id: string | null) => void;
}

export default function GatPaneel({ ontwerp, onWijzig, geselecteerd, onSelecteer }: Props) {
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
      <div className="pe-kop">Basisprofiel</div>
      <div className="pe-profielkeuze">
        <select
          value={reeks}
          onChange={(e) => {
            const eerste = profielenVanReeks(e.target.value)[0];
            if (eerste) kiesProfiel(eerste);
          }}
        >
          {REEKSEN.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <select value={basis.naam} onChange={(e) => kiesProfiel(e.target.value)}>
          {profielenVanReeks(reeks).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="pe-hint">
        h = {fmtMaat(basis.h)} · b = {fmtMaat(basis.b)} · t_w = {fmtMaat(basis.tw)} · t_f = {fmtMaat(basis.tf)} · r = {fmtMaat(basis.r)} mm
      </div>

      <div className="pe-kop">Gaten</div>
      <div className="pe-hint">
        Een gat door een plaat laat in het doorsnedevlak een spleet over de volle plaatdikte achter:
        de netto doorsnede ter plaatse van het gat. Een lijfgat splitst de doorsnede in twee T's
        (I_w vervalt dan; I_t telt op).
      </div>
      <div className="pe-lijst">
        {ontwerp.gaten.map((g, i) => {
          const fout = controleerGat(g, basis);
          const bereik = vrijePlaatbereiken(basis, g.plaats)
            .map(([a, b]) => `${fmtMaat(a)}–${fmtMaat(b)}`)
            .join(" of ");
          return (
            <div
              key={g.id}
              className={`pe-item${geselecteerd === g.id ? " actief" : ""}`}
              onClick={() => onSelecteer(g.id)}
            >
              <div className="pe-item-kop">
                <span>
                  Gat {i + 1} <span className="pe-item-sub">{plaatsLabel(g.plaats, basis)}</span>
                </span>
                <button className="pe-knop pe-knop-klein pe-knop-gevaar" onClick={(e) => { e.stopPropagation(); verwijder(g.id); }} title="Verwijderen">
                  ✕
                </button>
              </div>
              <div className="pe-velden">
                <label className="pe-veld">
                  <span>plaats</span>
                  <select
                    value={g.plaats}
                    onChange={(e) => {
                      const nieuw = standaardGat(basis, e.target.value as GatPlaats, g.id);
                      zetGat(g.id, { ...nieuw, vorm: g.vorm, d: g.d, b: g.b, h: g.h });
                    }}
                  >
                    {plaatsen.map((p) => <option key={p} value={p}>{plaatsLabel(p, basis)}</option>)}
                  </select>
                </label>
                <label className="pe-veld">
                  <span>vorm</span>
                  <select value={g.vorm} onChange={(e) => zetGat(g.id, { vorm: e.target.value as Gat["vorm"] })}>
                    <option value="rond">rond</option>
                    <option value="rechthoek">rechthoekig</option>
                  </select>
                </label>
                {g.vorm === "rond" ? (
                  <GetalVeld label="diameter d" eenheid="mm" waarde={g.d} min={0.1} onWijzig={(v) => zetGat(g.id, { d: v })} />
                ) : (
                  <>
                    <GetalVeld
                      label={g.plaats === "vlak" ? "breedte b (langs y)" : "langs de plaat"}
                      eenheid="mm"
                      waarde={g.plaats === "vlak" ? g.b : g.h}
                      min={0.1}
                      onWijzig={(v) => zetGat(g.id, g.plaats === "vlak" ? { b: v } : { h: v })}
                    />
                    {g.plaats === "vlak" && (
                      <GetalVeld label="hoogte h (langs z)" eenheid="mm" waarde={g.h} min={0.1} onWijzig={(v) => zetGat(g.id, { h: v })} />
                    )}
                  </>
                )}
                {g.plaats === "lijf" && (
                  <GetalVeld label="hoogte z (midden)" eenheid="mm" waarde={g.z} titel={`Vrij lijf: z = ${bereik} mm`} onWijzig={(v) => zetGat(g.id, { z: v })} />
                )}
                {(g.plaats === "flensBoven" || g.plaats === "flensOnder") && (
                  <GetalVeld label="positie y (midden)" eenheid="mm" waarde={g.y} titel={`Vrije flens: y = ${bereik} mm`} onWijzig={(v) => zetGat(g.id, { y: v })} />
                )}
                {g.plaats === "wand" && (
                  <GetalVeld label="hoekpositie φ" eenheid="°" waarde={g.hoekGraden} stap={15} titel="0° = rechts, 90° = boven" onWijzig={(v) => zetGat(g.id, { hoekGraden: v })} />
                )}
                {g.plaats === "vlak" && (
                  <>
                    <GetalVeld label="y (midden)" eenheid="mm" waarde={g.y} onWijzig={(v) => zetGat(g.id, { y: v })} />
                    <GetalVeld label="z (midden)" eenheid="mm" waarde={g.z} onWijzig={(v) => zetGat(g.id, { z: v })} />
                    {g.vorm === "rechthoek" && (
                      <GetalVeld label="draaiing" eenheid="°" waarde={g.hoekGraden} stap={15} onWijzig={(v) => zetGat(g.id, { hoekGraden: v })} />
                    )}
                  </>
                )}
              </div>
              {fout && <div className="pe-melding pe-melding-fout" style={{ marginTop: 6 }}>{fout}</div>}
            </div>
          );
        })}
      </div>
      <div className="pe-knoppen">
        {plaatsen.map((p) => (
          <button key={p} className="pe-knop" onClick={() => voegToe(p)}>
            ＋ Gat {plaatsLabel(p, basis)}
          </button>
        ))}
      </div>
    </>
  );
}
