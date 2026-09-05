/**
 * OntwerpMiniatuur — silhouet van een ontwerp in een paar tientallen pixels.
 *
 * Alleen de contour: geen maatlijnen, geen assen, geen tekst. Bedoeld als
 * beeldmerk op de startvormknoppen, zodat de omschrijving naar de tooltip kan
 * en de knop zelf één regel blijft.
 *
 * Dezelfde contourwiskunde als het tekenvlak (lib/profieleditor/tekening.ts);
 * catalogusdelen worden zonder motoruitvoer getekend en vallen dan terug op
 * het geometrische midden van het profiel — voor een silhouet nauwkeurig
 * genoeg.
 */
import { omhullende } from "../../lib/profieleditor/geometrie";
import { tekenItems } from "../../lib/profieleditor/tekening";
import type { DoorsnedeOntwerp } from "../../lib/profieleditor/types";

interface Props {
  ontwerp: DoorsnedeOntwerp;
  /** Tekenveld in px; het silhouet wordt daarbinnen passend geschaald. */
  breedte?: number;
  hoogte?: number;
}

export default function OntwerpMiniatuur({ ontwerp, breedte = 32, hoogte = 28 }: Props) {
  const kader = omhullende(ontwerp);
  const items = tekenItems(ontwerp);
  if (!kader || items.length === 0) return null;

  const bw = Math.max(kader.yMax - kader.yMin, 1);
  const bh = Math.max(kader.zMax - kader.zMin, 1);
  const marge = 1.5;
  const s = Math.min((breedte - 2 * marge) / bw, (hoogte - 2 * marge) / bh);
  const ox = (breedte - bw * s) / 2 - kader.yMin * s;
  const oy = (hoogte - bh * s) / 2 + kader.zMax * s;

  return (
    <svg
      className="pe-miniatuur"
      viewBox={`0 0 ${breedte} ${hoogte}`}
      width={breedte}
      height={hoogte}
      aria-hidden="true"
    >
      <g transform={`translate(${ox} ${oy}) scale(${s} ${-s})`}>
        {items.map((it) => (
          <path
            key={`${it.soort}-${it.id}`}
            d={it.d}
            transform={it.transform}
            fillRule={it.fillRule}
          />
        ))}
      </g>
    </svg>
  );
}
