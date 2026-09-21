/**
 * MaatgevendMarkering — de maatgevende positie op een staaf, op het tekenvlak
 * (issue #41).
 *
 * Een ring met een richtkruis op de plek x die de rekenkern bij de
 * maatgevende toets noemt, met de maat erbij in mm. Wordt gezet vanuit het
 * toetsingspaneel (`stores/maatgevendMarkeringStore`).
 *
 * Getoond ALLEEN zolang het tekenvlak de combinatie toont waarbij de positie
 * hoort en de toetsronde nog dezelfde is: de plek is een uitspraak over die
 * ene combinatie in die ene ronde. Wisselt de gebruiker van combinatie of is
 * er opnieuw gerekend, dan zegt de markering niets meer en blijft zij weg.
 */
import { useTranslation } from "react-i18next";
import { useCheckStore } from "../../stores/checkStore";
import { isAfgeleideCombinatie } from "../../lib/maatgevend";
import { puntOpStaaf, useMaatgevendMarkeringStore } from "../../stores/maatgevendMarkeringStore";

interface Props {
  nodes: readonly { id: number; x: number; z: number }[];
  beams: readonly { id: number; from: number; to: number }[];
  worldToScreen: (x: number, z: number) => { x: number; y: number };
  activeCombinationId: number | null | undefined;
}

export default function MaatgevendMarkering({ nodes, beams, worldToScreen, activeCombinationId }: Props) {
  const { t } = useTranslation("check");
  const m = useMaatgevendMarkeringStore((s) => s.markering);
  const lastRunAt = useCheckStore((s) => s.lastRunAt);
  if (!m || m.rondeVan !== lastRunAt || m.combinatieId !== activeCombinationId) return null;
  const punt = puntOpStaaf(beams.find((b) => b.id === m.beamId), nodes, m.positieMm);
  if (!punt) return null;
  const p = worldToScreen(punt.x, punt.z);
  const x = m.positieMm.toLocaleString("nl-NL", { maximumFractionDigits: 0 });
  // Een afgeleide combinatie (scheefstand, eindtoestand) heeft een verschoven id
  // dat de gebruiker niet kent; dan alleen de maat. Het tekenvlak toont de
  // combinatie zelf al.
  const tekst = isAfgeleideCombinatie(m.combinatieId)
    ? t("maatgevend.markeringZonderCombinatie", { x })
    : t("maatgevend.markering", { x, combinatie: m.combinatieId });
  const breedte = tekst.length * 6.4 + 14;
  return (
    <g className="fem-maatgevend-markering" pointerEvents="none">
      <title>{tekst}</title>
      <circle cx={p.x} cy={p.y} r={9} className="fem-maatgevend-ring" />
      <line x1={p.x - 14} y1={p.y} x2={p.x + 14} y2={p.y} className="fem-maatgevend-kruis" />
      <line x1={p.x} y1={p.y - 14} x2={p.x} y2={p.y + 14} className="fem-maatgevend-kruis" />
      <rect x={p.x - breedte / 2} y={p.y - 36} width={breedte} height={18} rx={4} className="fem-maatgevend-label" />
      <text x={p.x} y={p.y - 23.5} className="fem-maatgevend-tekst">{tekst}</text>
    </g>
  );
}
