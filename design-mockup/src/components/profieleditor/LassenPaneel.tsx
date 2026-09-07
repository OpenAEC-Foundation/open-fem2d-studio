/**
 * LassenPaneel — de lasnaden tussen de platen van een samenstelling.
 *
 * Zelfde stijl als de rest van de editor: een lijst met knoppen, weinig tekst
 * in beeld, uitleg in de tooltip. Wat een naad DOET (schuifstroom en toetsing)
 * staat niet hier maar op het tabblad Spanning, want daar staat de dwarskracht.
 */
import { useMemo } from "react";
import { nieuwId } from "../../lib/profieleditor/id";
import {
  LASSOORT_LABEL,
  lassenVan,
  mogelijkeNaden,
  voorgesteldeKeeldikte,
} from "../../lib/profieleditor/lassen";
import type { Lassoort } from "../../lib/types/las/Lassoort";
import type { DoorsnedeOntwerp, Las } from "../../lib/profieleditor/types";
import GetalVeld from "./GetalVeld";

type Samenstelling = Extract<DoorsnedeOntwerp, { soort: "samenstelling" }>;

interface Props {
  ontwerp: Samenstelling;
  onWijzig: (o: Samenstelling) => void;
  geselecteerd: string | null;
  onSelecteer: (id: string | null) => void;
}

const SOORTEN: Lassoort[] = ["HoeklasDubbel", "HoeklasEnkel", "StompVolledig"];

const PANEEL_UITLEG =
  "Een lasnaad in een doorsnede is een langslas: hij loopt met de staaf mee en draagt de " +
  "schuifstroom q = V·S/I_y tussen de platen over. Er hoort dus geen laslengte bij — de lengte " +
  "is de staaflengte. Wat de naad moet doorstaan zie je op het tabblad Spanning. " +
  "Het lasmateriaal telt NIET mee in A, I_y en de andere doorsnedegrootheden: de " +
  "doorsnedemotor rekent met de platen, zoals gebruikelijk bij een gelaste doorsnede.";

export default function LassenPaneel({ ontwerp, onWijzig, geselecteerd, onSelecteer }: Props) {
  const lassen = lassenVan(ontwerp);
  const perId = useMemo(
    () => new Map(ontwerp.lamellen.map((l, i) => [l.id, { lamel: l, nummer: i + 1 }])),
    [ontwerp.lamellen],
  );
  const kandidaten = useMemo(
    () => mogelijkeNaden(ontwerp.lamellen, lassen),
    [ontwerp.lamellen, lassen],
  );

  const zet = (nieuw: Las[]) => onWijzig({ ...ontwerp, lassen: nieuw });

  const voegToe = () => {
    const k = kandidaten[0];
    if (!k) return;
    const a = perId.get(k.aId)?.lamel;
    const b = perId.get(k.bId)?.lamel;
    if (!a || !b) return;
    const las: Las = {
      id: nieuwId(),
      aId: k.aId,
      bId: k.bId,
      soort: "HoeklasDubbel",
      a_mm: voorgesteldeKeeldikte(a, b),
    };
    zet([...lassen, las]);
    onSelecteer(las.id);
  };

  const allemaal = () => {
    const extra = kandidaten
      .map((k) => {
        const a = perId.get(k.aId)?.lamel;
        const b = perId.get(k.bId)?.lamel;
        if (!a || !b) return null;
        return {
          id: nieuwId(),
          aId: k.aId,
          bId: k.bId,
          soort: "HoeklasDubbel" as Lassoort,
          a_mm: voorgesteldeKeeldikte(a, b),
        };
      })
      .filter((x): x is Las => x !== null);
    if (extra.length) zet([...lassen, ...extra]);
  };

  const wijzig = (id: string, patch: Partial<Las>) =>
    zet(lassen.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const verwijder = (id: string) => {
    zet(lassen.filter((l) => l.id !== id));
    if (geselecteerd === id) onSelecteer(null);
  };

  const naam = (id: string) => {
    const p = perId.get(id);
    return p ? `Lamel ${p.nummer}` : "verwijderd";
  };

  const geenPlaten = ontwerp.lamellen.length < 2;

  return (
    <>
      <div className="pe-kop pe-kop-rij">
        <span title={PANEEL_UITLEG}>Lassen{lassen.length > 0 ? ` (${lassen.length})` : ""}</span>
        <span className="pe-knoppen">
          <button
            type="button"
            className="pe-tknop pe-tknop-mini"
            onClick={voegToe}
            disabled={kandidaten.length === 0}
            title={
              geenPlaten
                ? "Er zijn nog geen twee platen om een naad tussen te leggen."
                : kandidaten.length === 0
                  ? "Elke naad tussen twee rakende platen heeft al een las."
                  : `Las leggen op de eerste vrije naad (${kandidaten.length} beschikbaar). ${PANEEL_UITLEG}`
            }
          >
            ＋ Las
          </button>
          <button
            type="button"
            className="pe-tknop pe-tknop-mini"
            onClick={allemaal}
            disabled={kandidaten.length < 2}
            title={
              kandidaten.length < 2
                ? "Er is hoogstens één vrije naad; gebruik ＋ Las."
                : `Op alle ${kandidaten.length} vrije naden een dubbelzijdige hoeklas leggen.`
            }
          >
            ⧉ Alle
          </button>
        </span>
      </div>

      {lassen.length === 0 && (
        <div className="pe-leeg" title={PANEEL_UITLEG}>
          {geenPlaten
            ? "Twee platen die elkaar raken hebben een naad; leg daar een las."
            : kandidaten.length === 0
              ? "Geen twee platen raken elkaar, dus er is geen naad."
              : `${kandidaten.length} naad${kandidaten.length === 1 ? "" : "en"} zonder las.`}
        </div>
      )}

      <div className="pe-lijst">
        {lassen.map((las, i) => (
          <div
            key={las.id}
            className={`pe-item${geselecteerd === las.id ? " actief" : ""}`}
            onClick={() => onSelecteer(las.id)}
            title={PANEEL_UITLEG}
          >
            <div className="pe-item-kop">
              <span>
                Las {i + 1}{" "}
                <span className="pe-item-sub">
                  {naam(las.aId)} – {naam(las.bId)}
                </span>
              </span>
              <button
                type="button"
                className="pe-tknop pe-tknop-mini pe-tknop-gevaar"
                onClick={(e) => {
                  e.stopPropagation();
                  verwijder(las.id);
                }}
                title="Deze las verwijderen"
              >
                ✕
              </button>
            </div>
            <div className="pe-profielkeuze" style={{ marginTop: 6 }}>
              <select
                value={las.soort}
                title={
                  "Dubbelzijdig: aan weerszijden van de plaat een hoeklas — twee keeldoorsneden. " +
                  "Enkelzijdig: één. Stomp volledig doorgelast: NEN-EN 1993-1-8 4.7.1 geeft de las " +
                  "de weerstand van het zwakste verbonden onderdeel, dus geen aparte lastoets."
                }
                onChange={(e) => wijzig(las.id, { soort: e.target.value as Lassoort })}
              >
                {SOORTEN.map((s) => (
                  <option key={s} value={s}>
                    {LASSOORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            {las.soort !== "StompVolledig" && (
              <div className="pe-velden pe-velden-3">
                <GetalVeld
                  label="a"
                  eenheid="mm"
                  waarde={las.a_mm}
                  min={0.1}
                  stap={0.5}
                  titel="Keeldikte van één las. NEN-EN 1993-1-8 4.5.2(2): niet kleiner dan 3 mm."
                  onWijzig={(v) => wijzig(las.id, { a_mm: v })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
