/**
 * transformeren — verplaatsen, roteren en spiegelen van een samengestelde
 * doorsnede: één bouwsteen, of alle bouwstenen tegelijk.
 *
 * Alle drie de bewerkingen werken om een opgegeven punt `om`. Voor het hele
 * ontwerp is dat het zwaartepunt (of de oorsprong), voor één bouwsteen zijn
 * eigen hart — en dan valt de verplaatsing vanzelf weg, zodat er alleen een
 * hoekverandering overblijft.
 *
 * Draaien over φ om `(y_c, z_c)`:
 *   y' = y_c + (y − y_c)·cos φ − (z − z_c)·sin φ
 *   z' = z_c + (y − y_c)·sin φ + (z − z_c)·cos φ
 *   α' = α + φ
 *
 * Spiegelen om de verticale lijn y = y_c (`y → −y` om dat punt):
 *   y' = 2·y_c − y,  z' = z
 *   lamel:          α' = 180° − α   (de rechthoek valt daarmee op zichzelf)
 *   catalogusdeel:  α' = −α  én  `gespiegeld` omgeklapt
 * Dat laatste volgt uit de opbouw van het deel — `translate · rotate(α) ·
 * scale(±1, 1)` in de tekening, en dezelfde volgorde in de motor — want
 * S(−1,1)·R(α) = R(−α)·S(−1,1).
 */
import type { DoorsnedeOntwerp } from "./types";

export type Samenstelling = Extract<DoorsnedeOntwerp, { soort: "samenstelling" }>;

/** Punt in het modelstelsel (mm, y naar rechts, z omhoog). */
export interface Punt2 {
  y: number;
  z: number;
}

/**
 * cos en sin van een hoek in graden, exact op de vier rechte hoeken.
 * `Math.cos(Math.PI / 2)` is 6,1·10⁻¹⁷ en niet 0; zonder deze uitzondering
 * levert een kwartslag coördinaten met een staartje op (89,999 in plaats van
 * 90, en een lamel die 0,00000001 mm naast het raster landt).
 */
export function cosSinGraden(graden: number): [number, number] {
  const rest = ((graden % 360) + 360) % 360;
  if (rest === 0) return [1, 0];
  if (rest === 90) return [0, 1];
  if (rest === 180) return [-1, 0];
  if (rest === 270) return [0, -1];
  const r = (rest * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

/**
 * Afronden op 0,0001 (mm of graad): ruim onder elke maatvoering, maar genoeg
 * om drijvendekommastof uit de invoervelden te houden. Ruimt ook −0 op.
 */
function net(v: number): number {
  const r = Math.round(v * 1e4) / 1e4;
  return r === 0 ? 0 : r;
}

/** Hoek terug naar het bereik (−180°, 180°], zodat α niet oploopt tot 450°. */
export function normaliseerHoek(graden: number): number {
  let r = ((((graden + 180) % 360) + 360) % 360) - 180;
  if (r <= -180) r = 180;
  return net(r);
}

/** Hart van een bouwsteen (lamel of catalogusdeel), of null als hij er niet is. */
export function hartVan(o: Samenstelling, id: string): Punt2 | null {
  const l = o.lamellen.find((x) => x.id === id);
  if (l) return { y: l.y_mm, z: l.z_mm };
  const d = o.catalogusdelen.find((x) => x.id === id);
  return d ? { y: d.y_mm, z: d.z_mm } : null;
}

/** Naam waaronder een bouwsteen in het paneel staat, of null als hij er niet is. */
export function naamVanBouwsteen(o: Samenstelling, id: string): string | null {
  const i = o.lamellen.findIndex((x) => x.id === id);
  if (i >= 0) return `Lamel ${i + 1}`;
  const j = o.catalogusdelen.findIndex((x) => x.id === id);
  if (j >= 0) return `Deel ${j + 1} (${o.catalogusdelen[j].profiel.naam})`;
  return null;
}

export function aantalBouwstenen(o: Samenstelling): number {
  return o.lamellen.length + o.catalogusdelen.length;
}

/** `doelId === null` = alle bouwstenen; anders alleen die ene. */
function hoort(doelId: string | null, id: string): boolean {
  return doelId === null || doelId === id;
}

/** Verplaatst één bouwsteen of het hele ontwerp over (dy, dz) mm. */
export function verplaats(
  o: Samenstelling,
  doelId: string | null,
  dy: number,
  dz: number,
): Samenstelling {
  return {
    ...o,
    lamellen: o.lamellen.map((l) =>
      hoort(doelId, l.id) ? { ...l, y_mm: net(l.y_mm + dy), z_mm: net(l.z_mm + dz) } : l,
    ),
    catalogusdelen: o.catalogusdelen.map((d) =>
      hoort(doelId, d.id) ? { ...d, y_mm: net(d.y_mm + dy), z_mm: net(d.z_mm + dz) } : d,
    ),
  };
}

/**
 * Draait één bouwsteen of het hele ontwerp over `graden` om het punt `om`.
 * Voor één bouwsteen hoort `om` zijn eigen hart te zijn; dan blijft er alleen
 * een hoekverandering over.
 */
export function roteer(
  o: Samenstelling,
  doelId: string | null,
  graden: number,
  om: Punt2,
): Samenstelling {
  const [c, s] = cosSinGraden(graden);
  const draai = (y: number, z: number): [number, number] => [
    net(om.y + (y - om.y) * c - (z - om.z) * s),
    net(om.z + (y - om.y) * s + (z - om.z) * c),
  ];
  return {
    ...o,
    lamellen: o.lamellen.map((l) => {
      if (!hoort(doelId, l.id)) return l;
      const [y, z] = draai(l.y_mm, l.z_mm);
      return { ...l, y_mm: y, z_mm: z, alphaGraden: normaliseerHoek(l.alphaGraden + graden) };
    }),
    catalogusdelen: o.catalogusdelen.map((d) => {
      if (!hoort(doelId, d.id)) return d;
      const [y, z] = draai(d.y_mm, d.z_mm);
      return { ...d, y_mm: y, z_mm: z, alphaGraden: normaliseerHoek(d.alphaGraden + graden) };
    }),
  };
}

/** Spiegelt om de verticale lijn door `om` (y → −y om dat punt). */
export function spiegel(o: Samenstelling, doelId: string | null, om: Punt2): Samenstelling {
  const spiegelY = (y: number) => net(2 * om.y - y);
  return {
    ...o,
    lamellen: o.lamellen.map((l) =>
      hoort(doelId, l.id)
        ? { ...l, y_mm: spiegelY(l.y_mm), alphaGraden: normaliseerHoek(180 - l.alphaGraden) }
        : l,
    ),
    catalogusdelen: o.catalogusdelen.map((d) =>
      hoort(doelId, d.id)
        ? {
            ...d,
            y_mm: spiegelY(d.y_mm),
            alphaGraden: normaliseerHoek(-d.alphaGraden),
            gespiegeld: !d.gespiegeld,
          }
        : d,
    ),
  };
}
