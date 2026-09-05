/**
 * TransformPaneel — verplaatsen, roteren en spiegelen van de samenstelling.
 *
 * Werkt op de geselecteerde bouwsteen, of — als er niets geselecteerd is — op
 * het hele ontwerp. Naast de getalvelden hier starten de knoppen (en de
 * sneltoetsen G en R) een muismodus in het tekenvlak.
 */
import { useState } from "react";
import { fmtMaat, leesGetal } from "../../lib/profieleditor/format";
import type { Punt2 } from "../../lib/profieleditor/transformeren";
import GetalVeld from "./GetalVeld";

export type TransformSoort = "verplaats" | "roteer";

interface Props {
  /** Naam van de geselecteerde bouwsteen, of null voor het hele ontwerp. */
  doelNaam: string | null;
  /** Aantal bouwstenen in het ontwerp (0 = niets te verplaatsen). */
  aantal: number;
  /** Punt waar het hele ontwerp omheen draait en spiegelt. */
  draaipunt: Punt2;
  /** Komt het draaipunt uit de motor (zwaartepunt) of is het de oorsprong? */
  draaipuntUitMotor: boolean;
  /** Actieve muismodus, of null. */
  modus: TransformSoort | null;
  onVerplaats: (dy: number, dz: number) => void;
  onRoteer: (graden: number) => void;
  onSpiegel: () => void;
  onStart: (soort: TransformSoort) => void;
}

export default function TransformPaneel({
  doelNaam,
  aantal,
  draaipunt,
  draaipuntUitMotor,
  modus,
  onVerplaats,
  onRoteer,
  onSpiegel,
  onStart,
}: Props) {
  const [dy, setDy] = useState(0);
  const [dz, setDz] = useState(0);
  const [hoekTekst, setHoekTekst] = useState("90");

  const hoek = leesGetal(hoekTekst);
  const hoekGeldig = Number.isFinite(hoek);
  const leeg = aantal === 0;
  const heelOntwerp = doelNaam === null;
  const omschrijving = heelOntwerp
    ? draaipuntUitMotor
      ? `het zwaartepunt Z (${fmtMaat(draaipunt.y)}, ${fmtMaat(draaipunt.z)})`
      : "de oorsprong (0, 0) — de motor heeft nog geen zwaartepunt"
    : "zijn eigen hart";

  return (
    <>
      <div className="pe-kop">Verplaatsen, roteren, spiegelen</div>
      <div className="pe-hint">
        {leeg ? (
          "Nog geen bouwstenen om te verplaatsen."
        ) : heelOntwerp ? (
          <>
            Doel: <strong>het hele ontwerp</strong> ({aantal} bouwstenen). Klik een bouwsteen aan om
            alleen die te bewerken.
          </>
        ) : (
          <>
            Doel: <strong>{doelNaam}</strong>. Klik naast de doorsnede om de selectie op te heffen en
            het hele ontwerp te bewerken.
          </>
        )}
      </div>

      <div className="pe-velden pe-velden-3">
        <GetalVeld label="Δy" eenheid="mm" waarde={dy} onWijzig={setDy} />
        <GetalVeld label="Δz" eenheid="mm" waarde={dz} onWijzig={setDz} />
        <div className="pe-veld">
          <span>&nbsp;</span>
          <button
            className="pe-knop"
            disabled={leeg || (dy === 0 && dz === 0)}
            onClick={() => onVerplaats(dy, dz)}
            title="Verplaats het doel over Δy en Δz"
          >
            Verplaats
          </button>
        </div>
      </div>

      <div className="pe-velden pe-velden-3">
        <label className="pe-veld" title="Draaiing tegen de klok in, positief.">
          <span>φ [°]</span>
          <input
            type="text"
            inputMode="decimal"
            value={hoekTekst}
            onChange={(e) => setHoekTekst(e.target.value)}
          />
        </label>
        <div className="pe-veld">
          <span>&nbsp;</span>
          <button
            className="pe-knop"
            disabled={leeg || !hoekGeldig || hoek === 0}
            onClick={() => onRoteer(hoek)}
            title={`Draai het doel over φ om ${omschrijving}`}
          >
            Roteer
          </button>
        </div>
        <div className="pe-veld">
          <span>&nbsp;</span>
          <div className="pe-knoppen pe-knoppen-strak">
            <button
              className="pe-knop pe-knop-klein"
              disabled={leeg}
              onClick={() => onRoteer(90)}
              title="Een kwartslag tegen de klok in"
            >
              ⟲ 90°
            </button>
            <button
              className="pe-knop pe-knop-klein"
              disabled={leeg}
              onClick={() => onRoteer(-90)}
              title="Een kwartslag met de klok mee"
            >
              ⟳ 90°
            </button>
          </div>
        </div>
      </div>

      <div className="pe-knoppen">
        <button
          className={`pe-knop${modus === "verplaats" ? " pe-knop-primair" : ""}`}
          disabled={leeg}
          onClick={() => onStart("verplaats")}
          title="Verplaats met de muis; Enter bevestigt, Esc annuleert"
        >
          Verplaatsen met de muis (G)
        </button>
        <button
          className={`pe-knop${modus === "roteer" ? " pe-knop-primair" : ""}`}
          disabled={leeg}
          onClick={() => onStart("roteer")}
          title="Draai met de muis; Enter bevestigt, Esc annuleert"
        >
          Roteren met de muis (R)
        </button>
        <button
          className="pe-knop"
          disabled={leeg}
          onClick={onSpiegel}
          title={`Spiegel het doel om de verticale lijn door ${omschrijving}`}
        >
          Spiegelen (y → −y)
        </button>
      </div>
      <div className="pe-hint">Roteren en spiegelen gaan om {omschrijving}.</div>
    </>
  );
}
