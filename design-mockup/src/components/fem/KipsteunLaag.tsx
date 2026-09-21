/**
 * KipsteunLaag — de kipsteunen als symbolen langs de staaf, en bij selectie of
 * hover de kipveldlengtes als maatketting (issue #40).
 *
 * WAT ER GETEKEND WORDT komt volledig uit `lib/kipsteunBeeld.ts`; dit bestand
 * rekent niets uit over kipsteunen, het zet alleen punten om naar het scherm.
 * Daardoor tekent het tekenvlak (px, thema-kleuren via CSS) en de
 * constructieschets van het rapport (viewBox-eenheden, vaste inkt) met precies
 * dezelfde laag; alleen `naarScherm`, de maat en de variant verschillen.
 *
 * DE SYMBOLEN
 *  - kipsteun aan één flens: een gevuld driehoekje aan DIE zijde van de staaf,
 *    met de punt naar de staaf — de steun drukt tegen de flens;
 *  - aan beide flenzen: aan weerszijden een driehoekje;
 *  - steun uit de kipsteunafstand van hout: een open ruitje óp de staafas —
 *    art. 6.3.3 steunt de gedrukte rand en zegt niet welke dat is;
 *  - gaffel aan een staafeind: een vorkje dwars op de staaf, open naar de staaf
 *    toe. Alleen waar de toetsing een gaffel aanneemt; een vrij of doorlopend
 *    eind krijgt niets, want daar gaat de toets juist NIET van een steun uit.
 *
 * "Boven" is de zijde die de toetsing boven noemt: bij een ligger het
 * bovenvlak, bij een staande staaf de linkerzijde (`lib/referentierichting.ts`).
 */
import { useTranslation } from "react-i18next";
import type { KipsteunBeeld, KipsteunOpTekening } from "../../lib/kipsteunBeeld";
import { puntOpStaaf } from "../../lib/kipsteunBeeld";
import { kipveldLabelMm, type Kipveldketting } from "../../lib/kipsteunen";

interface SchermPunt {
  x: number;
  y: number;
}

interface Props {
  beelden: KipsteunBeeld[];
  /** Wereld (mm, z omhoog) → scherm. */
  naarScherm: (x: number, z: number) => SchermPunt;
  /** Hoogte van een symbool in schermeenheden. */
  maat: number;
  /**
   * `canvas`: kleuren en letters uit FemCanvas.css (licht en donker thema).
   * `rapport`: vaste inkt, want het rapport is papier.
   */
  variant: "canvas" | "rapport";
  /** Modelstaven waarvan de maatketting getoond wordt (selectie en hover). */
  kettingVoor?: ReadonlySet<number>;
  onHover?: (staafId: number | null) => void;
  onKlik?: (staafId: number, e: React.MouseEvent) => void;
}

/** Inkt van het rapport — zelfde waarden als INK en DIM in reportGeometry. */
const RAPPORT_INKT = "#1a1a1a";
const RAPPORT_MAAT = "#444";

const punten = (ps: SchermPunt[]): string => ps.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

/** De schermassen van een beeld: `u` langs de staaf, `n` naar "boven". */
function assen(beeld: KipsteunBeeld, naarScherm: Props["naarScherm"]) {
  const p0 = naarScherm(beeld.begin.x, beeld.begin.z);
  const p1 = naarScherm(beeld.eind.x, beeld.eind.z);
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (!(len > 0)) return null;
  const u = { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len };
  // Een punt één staaflengte naar "boven": het verschil op het scherm wijst
  // naar boven, wat `naarScherm` ook met de z-as doet.
  const q = naarScherm(beeld.begin.x + beeld.boven.x * beeld.lengteMm, beeld.begin.z + beeld.boven.z * beeld.lengteMm);
  const nl = Math.hypot(q.x - p0.x, q.y - p0.y);
  if (!(nl > 0)) return null;
  return { p0, p1, len, u, n: { x: (q.x - p0.x) / nl, y: (q.y - p0.y) / nl } };
}

export default function KipsteunLaag({
  beelden, naarScherm, maat, variant, kettingVoor, onHover, onKlik,
}: Props) {
  const { t } = useTranslation("common");
  const rapport = variant === "rapport";
  const lijnDikte = rapport ? 1.5 : 1.2;
  // Afstand tussen de staafas en de punt van het driehoekje: net vrij van de
  // staaflijn, zodat het symbool de lijn niet dikker maakt.
  const spleet = maat * 0.3;
  // Hoe ver het vorkje van de gaffel binnen het staafeind staat.
  const eindInzet = rapport ? 20 : 18;

  return (
    <g className="fem-kipsteunen">
      {beelden.map((beeld) => {
        const as = assen(beeld, naarScherm);
        // Een staaf die op het scherm te kort is voor twee vorkjes met drie
        // symbolen ertussen, krijgt er geen: ze zouden over elkaar en over de
        // knopen vallen. Inzoomen brengt ze terug.
        if (!as || as.len < 3 * maat + 2 * eindInzet) return null;
        const { u, n } = as;
        const staand = beeld.staafstand === "Staand";
        const deel = beeld.soort === "hout" ? "Edge" : "Flange";
        const zijdeTekst = (flens: KipsteunOpTekening["flens"]): string => {
          if (flens === "gedrukt") return t("canvas.kipsteun.sideCompressed");
          const welke = flens === "beide" ? "Both" : flens === "boven" ? (staand ? "Left" : "Top") : staand ? "Right" : "Bottom";
          return t(`canvas.kipsteun.side${welke}${staand && flens === "beide" ? "Standing" : ""}${deel}`);
        };
        const vanaf = staand ? t("canvas.kipsteun.fromFoot") : t("canvas.kipsteun.fromLeft");

        const driehoek = (p: SchermPunt, teken: 1 | -1): SchermPunt[] => [
          { x: p.x + n.x * spleet * teken, y: p.y + n.y * spleet * teken },
          { x: p.x + n.x * (spleet + maat) * teken + u.x * maat * 0.55, y: p.y + n.y * (spleet + maat) * teken + u.y * maat * 0.55 },
          { x: p.x + n.x * (spleet + maat) * teken - u.x * maat * 0.55, y: p.y + n.y * (spleet + maat) * teken - u.y * maat * 0.55 },
        ];
        const ruit = (p: SchermPunt): SchermPunt[] => [
          { x: p.x + n.x * maat * 0.8, y: p.y + n.y * maat * 0.8 },
          { x: p.x + u.x * maat * 0.5, y: p.y + u.y * maat * 0.5 },
          { x: p.x - n.x * maat * 0.8, y: p.y - n.y * maat * 0.8 },
          { x: p.x - u.x * maat * 0.5, y: p.y - u.y * maat * 0.5 },
        ];
        // Vorkje: een dwarslijn over de staaf met twee tanden naar het staafeind
        // toe. Niet óp de knoop maar er net binnen: daar liggen het
        // knoopbolletje, de oplegging en (op 11 px) een eventueel
        // scharnierbolletje, en daaronder zou het vorkje verdwijnen.
        const gaffel = (eind: SchermPunt, naarBinnen: 1 | -1): string => {
          const h = maat * 1.1;
          const tand = -maat * 0.7 * naarBinnen;
          const p = { x: eind.x + u.x * eindInzet * naarBinnen, y: eind.y + u.y * eindInzet * naarBinnen };
          const a = { x: p.x + n.x * h, y: p.y + n.y * h };
          const b = { x: p.x - n.x * h, y: p.y - n.y * h };
          return (
            `M ${(a.x + u.x * tand).toFixed(2)} ${(a.y + u.y * tand).toFixed(2)} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} ` +
            `L ${b.x.toFixed(2)} ${b.y.toFixed(2)} L ${(b.x + u.x * tand).toFixed(2)} ${(b.y + u.y * tand).toFixed(2)}`
          );
        };

        const vulling = rapport ? { fill: RAPPORT_INKT, stroke: RAPPORT_INKT, strokeWidth: 1 } : {};
        const open = rapport ? { fill: "#fff", stroke: RAPPORT_INKT, strokeWidth: lijnDikte } : {};
        const lijn = rapport ? { fill: "none", stroke: RAPPORT_INKT, strokeWidth: lijnDikte } : {};

        const toonKetting = !!kettingVoor && beeld.staafIds.some((id) => kettingVoor.has(id));

        return (
          <g key={`kip${beeld.toetsId}`} data-kipsteun-staaf={beeld.toetsId}>
            {(["begin", "eind"] as const).map((welk) => {
              if (beeld.einden[welk] !== "Gaffel") return null;
              // Op een staaf zonder kipsteunen alleen samen met de ketting: een
              // vorkje aan elk eind van elke staaf vult de tekening zonder iets
              // te zeggen. Zodra er een steun staat of de ketting zichtbaar is,
              // begrenst de gaffel een kipveld en hoort hij erbij.
              if (beeld.steunen.length === 0 && !toonKetting) return null;
              const staafId = beeld.eindStaafIds[welk];
              return (
                <path
                  key={welk}
                  d={gaffel(welk === "begin" ? as.p0 : as.p1, welk === "begin" ? 1 : -1)}
                  className="fem-kipsteun-gaffel"
                  data-kipsteun="gaffel"
                  {...lijn}
                  onMouseEnter={onHover ? () => onHover(staafId) : undefined}
                  onMouseLeave={onHover ? () => onHover(null) : undefined}
                  onClick={onKlik ? (e) => onKlik(staafId, e) : undefined}
                >
                  <title>{t("canvas.kipsteun.fork", { staaf: beeld.toetsId })}</title>
                </path>
              );
            })}
            {beeld.steunen.map((s, i) => {
              const p = naarScherm(s.x, s.z);
              const titel = t(s.herkomst === "afstand" ? "canvas.kipsteun.supportSpacing" : "canvas.kipsteun.support", {
                zijde: zijdeTekst(s.flens),
                x: kipveldLabelMm(s.xMm),
                vanaf,
                staaf: beeld.toetsId,
              });
              return (
                <g
                  key={i}
                  data-kipsteun={s.flens}
                  onMouseEnter={onHover ? () => onHover(s.staafId) : undefined}
                  onMouseLeave={onHover ? () => onHover(null) : undefined}
                  onClick={onKlik ? (e) => onKlik(s.staafId, e) : undefined}
                >
                  <title>{titel}</title>
                  {s.flens === "gedrukt" ? (
                    <polygon points={punten(ruit(p))} className="fem-kipsteun-open" {...open} />
                  ) : (
                    <>
                      {s.flens !== "onder" && (
                        <polygon points={punten(driehoek(p, 1))} className="fem-kipsteun" {...vulling} />
                      )}
                      {s.flens !== "boven" && (
                        <polygon points={punten(driehoek(p, -1))} className="fem-kipsteun" {...vulling} />
                      )}
                    </>
                  )}
                </g>
              );
            })}
            {toonKetting && beeld.kettingen.map((k) => (
              <Maatketting
                key={k.zijde}
                beeld={beeld} ketting={k} as={as} naarScherm={naarScherm} maat={maat} rapport={rapport}
                bijschrift={
                  k.zijde === "kip"
                    ? t("canvas.kipsteun.chainTimber", { lengte: kipveldLabelMm(k.toetsLengteMm ?? beeld.lengteMm) })
                    : k.zijde === "beide"
                      ? t("canvas.kipsteun.chainBoth")
                      : t(`canvas.kipsteun.chain${k.zijde === "boven" ? (staand ? "Left" : "Top") : staand ? "Right" : "Bottom"}`)
                }
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/**
 * De kipveldlengtes als maatketting evenwijdig aan de staaf. De ketting van de
 * onderflens staat aan de onderzijde, alle andere aan de bovenzijde — zo staat
 * elke ketting bij de flens waar zij over gaat.
 */
function Maatketting({
  beeld, ketting, as, naarScherm, maat, rapport, bijschrift,
}: {
  beeld: KipsteunBeeld;
  ketting: Kipveldketting;
  as: NonNullable<ReturnType<typeof assen>>;
  naarScherm: Props["naarScherm"];
  maat: number;
  rapport: boolean;
  bijschrift: string;
}) {
  const { u, n } = as;
  const teken = ketting.zijde === "onder" ? -1 : 1;
  // Letterhoogte: op het tekenvlak die van `.fem-kipveld-tekst`, in het rapport
  // die van de overige maatvoering in de constructieschets.
  const letter = rapport ? 14 : 10;
  // De maatlijn staat vrij van de symbolen (spleet + hoogte) en, aan de
  // bovenzijde, van de profielnaam die daar vlak langs de staaf loopt. Aan de
  // onderzijde staan de opleggingen; daar gaat de ketting nog iets verder uit.
  const afstand = (maat * 1.3 + letter * (teken < 0 ? 3.2 : 1.6)) * teken;
  const streep = letter * 0.4;
  const opLijn = (xMm: number): SchermPunt => {
    const w = puntOpStaaf(beeld, xMm);
    const p = naarScherm(w.x, w.z);
    return { x: p.x + n.x * afstand, y: p.y + n.y * afstand };
  };
  // Tekst meegedraaid met de staaf, nooit ondersteboven — zelfde regel als de
  // profielnaam.
  let hoek = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  if (hoek > 90) hoek -= 180;
  if (hoek < -90) hoek += 180;
  const tekstAfstand = letter * 0.85 * teken;
  const bijschriftAfstand = letter * 2.1 * teken;
  const kleur = rapport ? { stroke: RAPPORT_MAAT, fill: "none" } : {};
  const tekstKleur = rapport ? { fill: RAPPORT_MAAT, fontSize: letter } : {};
  const g = ketting.grenzenMm.map(opLijn);
  const eerste = g[0];
  const laatste = g[g.length - 1];
  const midden = { x: (eerste.x + laatste.x) / 2, y: (eerste.y + laatste.y) / 2 };

  return (
    <g className="fem-kipveld-ketting" data-kipveld-ketting={ketting.zijde} pointerEvents="none">
      <line x1={eerste.x} y1={eerste.y} x2={laatste.x} y2={laatste.y} className="fem-kipveld-lijn" strokeWidth={1} {...kleur} />
      {g.map((p, i) => (
        <line
          key={`s${i}`}
          x1={p.x - n.x * streep} y1={p.y - n.y * streep} x2={p.x + n.x * streep} y2={p.y + n.y * streep}
          className="fem-kipveld-lijn" strokeWidth={1} {...kleur}
        />
      ))}
      {ketting.lengtesMm.map((l, i) => {
        const a = g[i], b = g[i + 1];
        const label = kipveldLabelMm(l);
        // Een veld dat op het scherm smaller is dan zijn getal, krijgt er geen:
        // cijfers die over elkaar vallen zijn erger dan een ontbrekend getal, en
        // inzoomen brengt het terug.
        if (Math.hypot(b.x - a.x, b.y - a.y) < label.length * letter * 0.62 + 4) return null;
        const tx = (a.x + b.x) / 2 + n.x * tekstAfstand;
        const ty = (a.y + b.y) / 2 + n.y * tekstAfstand;
        return (
          <text
            key={`t${i}`} x={tx} y={ty} className="fem-kipveld-tekst" data-kipveld={label}
            textAnchor="middle" dominantBaseline="central"
            transform={`rotate(${hoek.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})`}
            {...tekstKleur}
          >{label}</text>
        );
      })}
      <text
        x={midden.x + n.x * bijschriftAfstand} y={midden.y + n.y * bijschriftAfstand}
        className="fem-kipveld-bijschrift" textAnchor="middle" dominantBaseline="central"
        transform={`rotate(${hoek.toFixed(2)} ${(midden.x + n.x * bijschriftAfstand).toFixed(2)} ${(midden.y + n.y * bijschriftAfstand).toFixed(2)})`}
        {...tekstKleur}
      >{bijschrift}</text>
    </g>
  );
}
