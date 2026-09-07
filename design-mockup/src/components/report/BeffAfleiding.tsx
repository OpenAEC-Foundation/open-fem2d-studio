/**
 * BeffAfleiding — de meewerkende flensbreedte, navertelbaar (NEN-EN 1992-1-1
 * art. 5.3.2.1).
 *
 * WAAROM DIT BLOK BESTAAT. De gebruiker voert `T 4300x450 bw=300 hf=100` in en
 * er wordt met 2780 mm gerekend. Die 2780 stond wel in de doorsnedenaam van het
 * resultaat, maar nergens stond waaróm: niet welk geval van figuur 5.2 gold,
 * niet uit welke overspanningen l₀ volgde, en niet welke van de drie grenzen
 * van (5.7a)/(5.7b) won. Dat stond in de console. Een rapport dat een
 * doorsnede toont die de gebruiker niet heeft ingevoerd en de reden verzwijgt,
 * is op dit punt onbruikbaar.
 *
 * WAT HIER WEL EN NIET GEBEURT. De keten (`applied.deelstappen`) is
 * UITGESCHREVEN DOOR DE KERN — `nen-en-1992-1-1/src/beff_deelstappen.rs` — en
 * wordt hier alleen weergegeven. Er wordt in dit bestand geen normformule
 * uitgerekend en geen artikelnummer bedacht; wat er staat komt uit het
 * kernantwoord. De topologie (welke staven één ligger vormen, welke knoop een
 * steunpunt is) komt uit `lib/beffLiggerlijn.ts`, want die kan de kern niet
 * kennen; haar waarnemingen staan hier woordelijk.
 *
 * De gebiedstabel staat er om één ding zichtbaar te maken dat anders
 * onzichtbaar blijft: b_eff verschilt per gebied, en er is één waarde per staaf
 * gekozen. Boven een steunpunt is b_eff kleiner dan in het veld, en met de
 * veldwaarde daar rekenen maakt de doorsnede te stijf — de onveilige kant voor
 * doorbuiging en tweede orde. 5.3.2.1(4) staat die vereenvoudiging toe; de
 * tabel laat zien wat zij kost.
 */
import { useTranslation } from "react-i18next";
import type { BeffStaafUitkomst } from "../../lib/beffLiggerlijn";
import type { BeffZone } from "../../lib/types/concrete/BeffZone";
import type { L0Case } from "../../lib/types/concrete/L0Case";
import type { LineEnd } from "../../lib/types/concrete/LineEnd";
import Deelstappen from "./Deelstappen";
import { fmtValue } from "./checkReportUtils";

/**
 * Korte aanduiding van een geval uit figuur 5.2 voor de gebiedstabel.
 *
 * De lange omschrijving staat in de keten die de kern levert; deze is alleen
 * een tabelkopje. Beide gaan over dezelfde `L0Case`, dus ze kunnen niet uit
 * elkaar lopen zonder dat de enum verandert.
 */
const GEVAL_KORT: Record<L0Case, string> = {
  EndSpan: "eindveld",
  InteriorSpan: "binnenveld",
  SingleSpan: "enkele overspanning",
  InteriorSupport: "tussensteunpunt",
  RestrainedEnd: "momentvast uiteinde",
  Cantilever: "uitkraging",
};

/** Het uiteinde van de liggerlijn, kort — voor de samenvattingsregel. */
const UITEINDE_KORT: Record<LineEnd, string> = {
  Support: "vrij opgelegd",
  Restrained: "momentvast",
  Free: "vrij (uitkraging)",
};

function mm(v: number): string {
  return fmtValue(v, 0);
}

/** De gebieden van figuur 5.2 met hun l₀ en b_eff, en welk gebied gold. */
function GebiedTabel({
  zones,
  gebruikt,
  ingevoerdMm,
}: {
  zones: BeffZone[];
  gebruikt: number | null;
  ingevoerdMm: number;
}) {
  const { t } = useTranslation("ribbon");
  if (zones.length === 0) return null;
  return (
    <table className="rpt-table rpt-beff-zones">
      <thead>
        <tr>
          <th>{t("report.beffZoneBereik", "Gebied langs de liggerlijn")}</th>
          <th>{t("report.beffZoneGeval", "Geval (figuur 5.2)")}</th>
          <th>
            l<sub>0</sub> [mm]
          </th>
          <th>
            b<sub>eff</sub> [mm]
          </th>
          <th>{t("report.beffZoneVanIngevoerd", "van de ingevoerde breedte")}</th>
        </tr>
      </thead>
      <tbody>
        {zones.map((z, i) => (
          <tr key={i} className={i === gebruikt ? "rpt-beff-zone-gebruikt" : undefined}>
            <td>
              {mm(z.zone.x_start_mm)} – {mm(z.zone.x_end_mm)}
              {i === gebruikt && (
                <span className="rpt-beff-gebruikt-mark">
                  ◂ {t("report.beffZoneAangehouden", "aangehouden")}
                </span>
              )}
            </td>
            <td>{GEVAL_KORT[z.zone.case]}</td>
            <td className="rpt-num">{mm(z.zone.l0_mm)}</td>
            <td className="rpt-num">{mm(z.b_eff_mm)}</td>
            <td className="rpt-num">
              {ingevoerdMm > 0 ? `${fmtValue((z.b_eff_mm / ingevoerdMm) * 100, 0)} %` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Het hele blok voor één staaf. `null` wanneer er niets over deze staaf te
 * vertellen valt (een rechthoek, of een run van vóór deze uitbreiding).
 */
export default function BeffAfleiding({ uitkomst }: { uitkomst: BeffStaafUitkomst | undefined }) {
  const { t } = useTranslation("ribbon");
  if (!uitkomst) return null;

  if (!uitkomst.ok) {
    // Geen afleiding. Dat is de belangrijkste mededeling van dit blok en niet
    // een reden om het weg te laten: er is met de INGEVOERDE flensbreedte
    // gerekend, en die kan een stuk gunstiger zijn dan de meewerkende.
    return (
      <div className="rpt-beff">
        <p className="rpt-bet-kopje">
          {t("report.beffKop", "Meewerkende flensbreedte b_eff (5.3.2.1)")}
        </p>
        <p className="rpt-beff-mislukt">
          {t("report.beffMislukt", {
            defaultValue:
              "De meewerkende flensbreedte is NIET afgeleid: {{reden}}. Er is gerekend met de ingevoerde flensbreedte van {{breedte}} mm. Volgens 5.3.2.1(3) is de meewerkende breedte hoogstens gelijk aan de werkelijke flensbreedte en doorgaans kleiner; met de volle breedte rekenen is daarmee de onveilige kant.",
            reden: uitkomst.reden,
            breedte: mm(uitkomst.ingevoerdeBreedteMm),
          })}
        </p>
      </div>
    );
  }

  const u = uitkomst;
  const overspanningen = u.line.spans_mm.map((l, i) => `l${i + 1} = ${mm(l)} mm`).join(", ");
  const gebruikt = u.applied ? u.applied.zone_index : null;

  return (
    <div className="rpt-beff">
      <p className="rpt-bet-kopje">
        {t("report.beffKop", "Meewerkende flensbreedte b_eff (5.3.2.1)")}
      </p>

      <p className="rpt-beff-inleiding">
        {t("report.beffInleiding", {
          defaultValue:
            "Ingevoerde flensbreedte {{ingevoerd}} mm; gerekend is met b_eff = {{beff}} mm. De liggerlijn waar deze staaf deel van uitmaakt heeft {{aantal}} overspanning(en) ({{spans}}), begin {{start}}, eind {{eind}}. Het staafmidden ligt op x = {{x}} mm langs die lijn.",
          ingevoerd: mm(u.ingevoerdeBreedteMm),
          beff: mm(u.bEffMm),
          aantal: u.line.spans_mm.length,
          spans: overspanningen,
          start: UITEINDE_KORT[u.line.start],
          eind: UITEINDE_KORT[u.line.end],
          x: mm(u.xLijnMm),
        })}
      </p>

      {/* Hoe de topologie tot deze liggerlijn leidde. Dit komt NIET uit de
          kern — die kent geen knopen — maar uit `beffLiggerlijn.ts`, en zonder
          deze regels is niet na te gaan waarom er staat wat er staat. */}
      {(u.staafIds.length > 1 || u.meldingen.length > 0) && (
        <ul className="rpt-beff-topologie">
          {u.staafIds.length > 1 && (
            <li>
              {t("report.beffStaven", {
                defaultValue:
                  "De liggerlijn bestaat uit de staven {{staven}}; de steunpunten liggen op de knopen {{knopen}}.",
                staven: u.staafIds.join(", "),
                knopen: u.steunpuntKnopen.join(", "),
              })}
            </li>
          )}
          {u.staafIds.length === 1 && (
            <li>
              {t("report.beffStaafEnkel", {
                defaultValue:
                  "De liggerlijn is deze ene staaf; de steunpunten liggen op de knopen {{knopen}}.",
                knopen: u.steunpuntKnopen.join(", "),
              })}
            </li>
          )}
          {/* Woordelijk: dit zijn waarnemingen over het model, geen
              rapporttekst die vrij te herformuleren is. */}
          {u.meldingen.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {/* De keten zoals de kern hem heeft uitgeschreven. */}
      <Deelstappen
        stappen={u.applied?.deelstappen ?? []}
        kop={t("report.beffKetenKop", "Afleiding volgens 5.3.2.1, stap voor stap:")}
      />

      <p className="rpt-beff-tabelkop">
        {t("report.beffZonesKop", "b_eff per gebied van figuur 5.2")}
      </p>
      <GebiedTabel zones={u.zones} gebruikt={gebruikt} ingevoerdMm={u.ingevoerdeBreedteMm} />
      <p className="rpt-beff-tabelnoot">
        {t("report.beffZonesNoot", {
          defaultValue:
            "b_eff verschilt per gebied. Deze staaf rekent met één waarde, die van het gebied waarin het staafmidden ligt; 5.3.2.1(4) staat een constante breedte per overspanning toe waarbij de waarde van de velddoorsnede wordt aangehouden. Boven een steunpunt is b_eff kleiner dan de aangehouden waarde, en daar is de doorsnede dus te stijf gerekend.",
        })}
      </p>
    </div>
  );
}

/** Stijlen van het b_eff-blok — papieropmaak, net als de rest van het rapport. */
export const BEFF_REPORT_CSS = `
.rpt-beff { margin: 3mm 0 2mm; }

.rpt-beff-inleiding {
  margin: 0 0 1.5mm;
  font-size: calc(var(--rpt-basis) * 0.85);
  color: #222;
}

.rpt-beff-mislukt {
  margin: 0;
  padding: 2mm 3mm;
  font-size: calc(var(--rpt-basis) * 0.82);
  border-left: 0.6mm solid #b45309;
  background: #fdf6ec;
  color: #222;
}

.rpt-beff-topologie {
  margin: 0 0 2mm;
  padding-left: 5mm;
  font-size: calc(var(--rpt-basis) * 0.8);
  color: #444;
}
.rpt-beff-topologie li { margin-bottom: 0.5mm; }

.rpt-beff-tabelkop {
  font-size: calc(var(--rpt-basis) * 0.85);
  font-weight: 600;
  margin: 2.5mm 0 1mm;
  color: #222;
  break-after: avoid;
}

.rpt-beff-zones { font-size: calc(var(--rpt-basis) * 0.8); }
.rpt-beff-zones th { white-space: nowrap; }
.rpt-beff-zones td.rpt-num { white-space: nowrap; }

/* Het aangehouden gebied: vet met een lichte achtergrond, zodat het ook in
   grijstinten te vinden is — zelfde greep als de maatgevende toetsrij. */
.rpt-beff-zone-gebruikt td { font-weight: 600; background: #eceff3; }

.rpt-beff-gebruikt-mark {
  font-style: italic;
  font-weight: 400;
  color: #7f1d1d;
  margin-left: 1mm;
  white-space: nowrap;
}

.rpt-beff-tabelnoot {
  margin: 1mm 0 0;
  font-size: calc(var(--rpt-basis) * 0.78);
  color: #555;
}
`;
