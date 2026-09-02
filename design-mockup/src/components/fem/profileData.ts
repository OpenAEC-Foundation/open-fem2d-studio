/**
 * profileData.ts — materiaalgegevens die niet uit de profieldatabase komen.
 *
 * Hier stonden ook doorsnede-oppervlakken en plastische weerstandsmomenten
 * van 45 profielen, met eigen-gewicht- en toetsingsberekeningen daarbovenop.
 * Die tabel is weg. Ze was een tweede bron van waarheid naast de echte
 * profieldatabase (416 profielen, gedeeld met de Rust-kern) en week daar
 * ook van af — bij UNP 220 en UNP 240 stond Wpl;y respectievelijk 3,3 en
 * 5,2 procent te laag. Erger was de terugval: elk profiel dat níét in die
 * korte lijst stond, werd stilzwijgend als HEA 160 doorgerekend.
 *
 * Doorsnede-eigenschappen komen nu uit `resolveSection` (lib/sectionResolver),
 * die de volledige database gebruikt en hardop waarschuwt bij een onbekende
 * combinatie. Het eigen gewicht loopt via `eigenGewichtPerMeter` uit
 * datzelfde bestand.
 */

/** Vloeigrens f_y in N/mm² per staalsoort — EN 1993-1-1 tabel 3.1. */
export const STEEL_FY: Record<string, number> = {
  S235: 235, S275: 275, S355: 355, S420: 420, S460: 460,
};
