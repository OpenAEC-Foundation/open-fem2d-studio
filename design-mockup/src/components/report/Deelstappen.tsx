/**
 * Deelstappen — een uitgeschreven afleiding in het rapport, stap voor stap.
 *
 * WAAROM DIT EEN EIGEN BESTAND IS. Deze weergave stond als privé-component in
 * `sections/CheckDetailSection.tsx`, waar hij de kipketen van staal en de
 * doorsnedeketen van beton toont. De meewerkende flensbreedte krijgt nu ook een
 * keten (NEN-EN 1992-1-1 art. 5.3.2.1), en die staat in het BETONhoofdstuk en
 * niet bij de toetsingen. Twee renderers zouden betekenen dat twee ketens in
 * hetzelfde rapport er verschillend uitzien, en dat de ene een verbetering
 * krijgt die de andere mist.
 *
 * Elke stap toont de formule symbolisch, dezelfde formule met de getallen
 * ingevuld en de uitkomst, met het artikelnummer in de rechtermarge. De
 * ingevulde regel komt KANT-EN-KLAAR uit de rekenkern (`ingevuld_latex`) en
 * wordt hier dus niet via `vulGetallenIn` gemaakt; zie de docstring van
 * `Deelstap` voor waarom die tekstvervanging op zo'n keten stukloopt.
 *
 * Alleen een stap zónder formule toont haar grootheden als lijst — dat is de
 * uitgangspuntenstap. Bij de overige stappen staan diezelfde grootheden al
 * ingevuld in de formule, en zou een lijst eronder ze een tweede keer herhalen.
 */
import type { Deelstap } from "../../lib/types/steel/Deelstap";
import type { NamedValue } from "../../lib/types/steel/NamedValue";
import { deelstapRegels, fmtValue, renderLatexHtml } from "./checkReportUtils";

/**
 * Waarden die naast de afleiding horen, als één doorlopende regel.
 *
 * Dit stond eerder als een driekolomsraster (symbool, "=", waarde) onder de
 * formule. Dat leverde per toets een blokje tabel op en dat is precies wat het
 * referentie-rapport níét doet: daar loopt een toets als wiskunde door, met de
 * getallen ingevuld in de formule zelf en de losse grootheden achter elkaar op
 * één regel. Een reeks ingesprongen kolommetjes onder elke formule maakt van
 * een afleiding een opsomming.
 *
 * De waarden verdwijnen niet — een grootheid die niet in de formule ingevuld
 * kon worden, hoort zichtbaar te blijven — maar ze staan achter elkaar
 * gescheiden door een dunne spatie, zoals de krachtenregel erboven.
 */
export function Waarden({ kop, vars }: { kop?: string; vars: NamedValue[] }) {
  if (vars.length === 0) return null;
  return (
    <div className="rpt-chk-waarden">
      {kop && <span className="rpt-chk-waarden-kop">{kop}</span>}
      {vars.map((v, i) => (
        <span className="rpt-chk-waarde" key={i}>
          <span
            className="rpt-chk-waarde-symbool"
            dangerouslySetInnerHTML={{ __html: renderLatexHtml(v.symbol, false) }}
          />
          <span className="rpt-chk-waarde-eq">=</span>
          <span className="rpt-chk-waarde-getal">{fmtValue(v.value)}</span>
          {v.unit && v.unit !== "-" && (
            <span className="rpt-chk-waarde-eenheid">&nbsp;{v.unit}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * De keten die aan een uitkomst voorafgaat, stap voor stap.
 *
 * Waarom dit er is: een kiptoets is niet één formule maar een keten van
 * veertien, een betonnen doorsnedetoets een van ruim tien, en de meewerkende
 * flensbreedte een van zes. Tot de keten er was stond daarvan alleen de
 * uitkomstenrij in het rapport ("Tussenwaarden: S = 1406,4 mm  C = 3,388 …"),
 * of één formule met een getal — zonder de weg ertussen, en dus niet na te
 * rekenen. Het referentie-rapport schrijft zo'n keten voluit; dit blok doet dat
 * nu ook.
 */
export default function Deelstappen({
  stappen,
  kop,
}: {
  stappen: Deelstap[];
  kop: string;
}) {
  if (stappen.length === 0) return null;
  return (
    <div className="rpt-chk-keten">
      <p className="rpt-chk-keten-kop">{kop}</p>
      {stappen.map((d) => {
        const { formule, uitkomst } = deelstapRegels(d);
        return (
          <div className="rpt-chk-stap" key={d.id}>
            <div className="rpt-chk-stap-head">
              <h5 className="rpt-chk-stap-titel">{d.titel}</h5>
              <span className="rpt-chk-stap-article">{d.article}</span>
            </div>

            {formule && (
              <div
                className="rpt-chk-stap-regel"
                dangerouslySetInnerHTML={{ __html: renderLatexHtml(formule, true) }}
              />
            )}
            {uitkomst && (
              <div
                className="rpt-chk-stap-regel"
                dangerouslySetInnerHTML={{ __html: renderLatexHtml(uitkomst, true) }}
              />
            )}

            {!formule && <Waarden vars={d.variables} />}

            {d.notes.length > 0 && (
              <ul className="rpt-chk-stap-notes">
                {d.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
