/**
 * GereedschapsBalk — de bewerkingen van de samenstelling als knoppen, in één
 * balk boven het tekenvlak.
 *
 * Alles wat vroeger als alinea in het paneel stond, staat nu in de tooltip van
 * de knop of het veld waar het bij hoort: het blijft vindbaar, maar het staat
 * niet meer in de weg. In beeld blijven alleen de dingen die je tijdens het
 * tekenen moet kunnen aflezen:
 *
 *  - WAT er meegaat (het doel: één bouwsteen of het hele ontwerp);
 *  - WAAROMHEEN gedraaid en gespiegeld wordt (het ankerpunt);
 *  - een korte melding als een bewerking iets te zeggen had.
 *
 * De knoppen doen hetzelfde als de sneltoetsen G en R: ze starten een
 * muismodus in het tekenvlak. De getalvelden bewerken rechtstreeks.
 */
import { useState } from "react";
import { leesGetal } from "../../lib/profieleditor/format";

export type TransformSoort = "verplaats" | "roteer";

type IcoonNaam = "doel" | "verplaats" | "roteer" | "kwartLinks" | "kwartRechts" | "spiegel" | "anker";

/**
 * Gereedschapstekens als eigen SVG in plaats van als teken uit een font:
 * pijl- en draaitekens ontbreken in genoeg systeemfonts om het risico niet
 * waard te zijn, en zo hebben alle knoppen dezelfde lijndikte.
 */
function Icoon({ naam }: { naam: IcoonNaam }) {
  return (
    <svg
      className="pe-icoon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {naam === "doel" && <rect x="2.6" y="3.6" width="10.8" height="8.8" rx="1" strokeDasharray="2.4 1.8" />}
      {naam === "verplaats" && (
        <>
          <path d="M8 2v12M2 8h12" />
          <path d="M8 2 6.1 4.1M8 2l1.9 2.1M8 14l-1.9-2.1M8 14l1.9-2.1M2 8l2.1-1.9M2 8l2.1 1.9M14 8l-2.1-1.9M14 8l2.1 1.9" />
        </>
      )}
      {naam === "roteer" && (
        <>
          <path d="M10.5 3.7a5 5 0 1 1-5 0" />
          <path d="M9.4 1.8 10.5 3.7 8.3 3.7" />
          <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
        </>
      )}
      {naam === "kwartRechts" && (
        <>
          <path d="M10.5 3.7a5 5 0 1 1-5 0" />
          <path d="M9.4 1.8 10.5 3.7 8.3 3.7" />
        </>
      )}
      {naam === "kwartLinks" && (
        <>
          <path d="M5.5 3.7a5 5 0 1 0 5 0" />
          <path d="M6.6 1.8 5.5 3.7 7.7 3.7" />
        </>
      )}
      {naam === "spiegel" && (
        <>
          <path d="M8 1.6v12.8" strokeDasharray="2.2 1.8" />
          <path d="M6.1 4.6 1.9 8l4.2 3.4z" />
          <path d="M9.9 4.6 14.1 8l-4.2 3.4z" />
        </>
      )}
      {naam === "anker" && (
        <>
          <circle cx="8" cy="8" r="3.6" />
          <path d="M8 2.2v2.4M8 11.4v2.4M2.2 8h2.4M11.4 8h2.4" />
        </>
      )}
    </svg>
  );
}

/**
 * Smal getalveld voor in de balk: het symbool staat vóór het getal en de
 * eenheid erachter, allebei ín het vakje. Geen label erboven dus, en geen
 * uitleg ernaast — die zit in `titel`.
 */
function MiniVeld({
  teken,
  eenheid,
  waarde,
  onWijzig,
  titel,
  breed = 44,
}: {
  teken: string;
  eenheid: string;
  waarde: string;
  onWijzig: (v: string) => void;
  titel: string;
  breed?: number;
}) {
  return (
    <label className="pe-mini" title={titel}>
      <span className="pe-mini-teken">{teken}</span>
      <input
        type="text"
        inputMode="decimal"
        value={waarde}
        style={{ width: breed }}
        onChange={(e) => onWijzig(e.target.value)}
      />
      <span className="pe-mini-eenheid">{eenheid}</span>
    </label>
  );
}

interface Props {
  /** Wat er bewerkt wordt, kort — de tekst op de doelknop. */
  doelKort: string;
  /** Volledige uitleg bij het doel, voor de tooltip. */
  doelTitel: string;
  /** Is er een selectie die losgelaten kan worden? */
  kanLoslaten: boolean;
  /** Niets te bewerken: alle knoppen uit, met deze reden als tooltip. */
  leegReden: string | null;
  /** Korte aanduiding van waar draaien en spiegelen omheen gaan (in de balk). */
  ankerKort: string;
  /** Volledige uitleg bij die aanduiding, voor de tooltip. */
  ankerUitleg: string;
  /** Wat draaien met het doel doet; komt in de tooltip achter de dubbele punt. */
  roteerOm: string;
  /** Waar gespiegeld wordt; leest door na "Spiegelen om ". */
  spiegelOm: string;
  /** Extra zin bij de spiegelknop, of null. */
  spiegelExtra: string | null;
  /** Actieve muismodus, of null. */
  modus: TransformSoort | null;
  /** Waarom de muismodi hier niet kunnen, of null als ze wél kunnen. */
  geenMuisModus: string | null;
  /** Korte melding van de laatste bewerking, of null. */
  melding: string | null;
  onVerplaats: (dy: number, dz: number) => void;
  onRoteer: (graden: number) => void;
  onSpiegel: () => void;
  onStart: (soort: TransformSoort) => void;
  /** Selectie opheffen: alles wordt weer het doel. */
  onLosLaten: () => void;
}

export default function GereedschapsBalk({
  doelKort,
  doelTitel,
  kanLoslaten,
  leegReden,
  ankerKort,
  ankerUitleg,
  roteerOm,
  spiegelOm,
  spiegelExtra,
  modus,
  geenMuisModus,
  melding,
  onVerplaats,
  onRoteer,
  onSpiegel,
  onStart,
  onLosLaten,
}: Props) {
  const [dyTekst, setDyTekst] = useState("0");
  const [dzTekst, setDzTekst] = useState("0");
  const [hoekTekst, setHoekTekst] = useState("90");

  const dy = leesGetal(dyTekst);
  const dz = leesGetal(dzTekst);
  const hoek = leesGetal(hoekTekst);
  const verschuivingGeldig = Number.isFinite(dy) && Number.isFinite(dz) && (dy !== 0 || dz !== 0);
  const hoekGeldig = Number.isFinite(hoek) && hoek !== 0;

  const leeg = leegReden !== null;
  // Een knop die niets doet hoort uit te staan mét de reden erbij.
  const muisUit = leeg || geenMuisModus !== null;
  const muisReden = leegReden ?? geenMuisModus;

  return (
    <div className="pe-balk" role="toolbar" aria-label="Verplaatsen, roteren en spiegelen">
      <button
        type="button"
        className={`pe-doel${leeg ? " pe-doel-leeg" : ""}`}
        disabled={!kanLoslaten}
        onClick={onLosLaten}
        title={doelTitel}
      >
        <Icoon naam="doel" />
        <span className="pe-doel-naam">{doelKort}</span>
      </button>

      <span className="pe-balk-streep" aria-hidden="true" />

      <button
        type="button"
        className={`pe-tknop${modus === "verplaats" ? " actief" : ""}`}
        disabled={muisUit}
        onClick={() => onStart("verplaats")}
        title={
          muisReden ??
          "Verplaatsen met de muis. Cijfers typen geeft een exacte maat, Y of Z vergrendelt een as, Shift laat het raster los, Enter bevestigt en Esc zet alles terug."
        }
      >
        <Icoon naam="verplaats" />
        Verplaats
        <kbd className="pe-kbd">G</kbd>
      </button>

      <button
        type="button"
        className={`pe-tknop${modus === "roteer" ? " actief" : ""}`}
        disabled={muisUit}
        onClick={() => onStart("roteer")}
        title={
          muisReden ??
          `Roteren met de muis: ${roteerOm}. Cijfers typen geeft een exacte hoek, Shift laat het raster van 15° los, Enter bevestigt en Esc zet alles terug.`
        }
      >
        <Icoon naam="roteer" />
        Roteer
        <kbd className="pe-kbd">R</kbd>
      </button>

      {/* Twee kwartslagen: de richting zit in het teken, de maat in het woord —
          zonder dat "90°" zijn de twee knoppen op werkgrootte te veel op elkaar. */}
      <button
        type="button"
        className="pe-tknop pe-tknop-kwart"
        disabled={leeg}
        onClick={() => onRoteer(90)}
        title={leegReden ?? `Een kwartslag tegen de klok in (+90°): ${roteerOm}.`}
        aria-label="Een kwartslag tegen de klok in"
      >
        <Icoon naam="kwartLinks" />
        90°
      </button>

      <button
        type="button"
        className="pe-tknop pe-tknop-kwart"
        disabled={leeg}
        onClick={() => onRoteer(-90)}
        title={leegReden ?? `Een kwartslag met de klok mee (−90°): ${roteerOm}.`}
        aria-label="Een kwartslag met de klok mee"
      >
        <Icoon naam="kwartRechts" />
        90°
      </button>

      <button
        type="button"
        className="pe-tknop"
        disabled={leeg}
        onClick={onSpiegel}
        title={leegReden ?? `Spiegelen om ${spiegelOm} (y → −y).${spiegelExtra ? ` ${spiegelExtra}` : ""}`}
      >
        <Icoon naam="spiegel" />
        Spiegel
      </button>

      <span className="pe-balk-streep" aria-hidden="true" />

      <MiniVeld
        teken="Δy"
        eenheid="mm"
        waarde={dyTekst}
        onWijzig={setDyTekst}
        titel="Verplaatsing naar rechts, in millimeter. Negatief is naar links."
      />
      <MiniVeld
        teken="Δz"
        eenheid="mm"
        waarde={dzTekst}
        onWijzig={setDzTekst}
        titel="Verplaatsing omhoog, in millimeter. Negatief is omlaag."
      />
      <button
        type="button"
        className="pe-tknop pe-tknop-icoon pe-tknop-toepas"
        disabled={leeg || !verschuivingGeldig}
        onClick={() => onVerplaats(dy, dz)}
        title={
          leegReden ??
          (verschuivingGeldig ? "Verplaats het doel over Δy en Δz" : "Vul eerst een Δy of Δz in die niet nul is")
        }
        aria-label="Verplaats over Δy en Δz"
      >
        →
      </button>

      <MiniVeld
        teken="φ"
        eenheid="°"
        waarde={hoekTekst}
        onWijzig={setHoekTekst}
        titel="Draaiing in graden, tegen de klok in positief."
        breed={38}
      />
      <button
        type="button"
        className="pe-tknop pe-tknop-icoon pe-tknop-toepas"
        disabled={leeg || !hoekGeldig}
        onClick={() => onRoteer(hoek)}
        title={
          leegReden ??
          (hoekGeldig ? `Draai over φ: ${roteerOm}` : "Vul eerst een hoek in die niet nul is")
        }
        aria-label="Draai over φ"
      >
        →
      </button>

      <span className="pe-balk-streep" aria-hidden="true" />

      <span className="pe-balk-om" title={ankerUitleg}>
        <Icoon naam="anker" />
        {ankerKort}
      </span>

      {melding && (
        <span className="pe-balk-melding" title={melding}>
          {melding}
        </span>
      )}
    </div>
  );
}
