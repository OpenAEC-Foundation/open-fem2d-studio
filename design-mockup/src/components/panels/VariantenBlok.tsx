/**
 * VariantenBlok — de unity checks van naburige doorsneden, per staaf.
 *
 * WAAR DIT LANDT, EN WAAROM DAAR. Dit blok staat IN de staafkaart van het
 * toetsingspaneel, direct boven de afleidingen van de staaf zelf. Niet in een
 * eigen tabblad en niet als kolom in de staventabel:
 *
 *  - een eigen tabblad zou de vergelijking losmaken van het getal waarmee ze
 *    vergeleken moet worden; je leest een variant nooit zonder de huidige UC
 *    ernaast;
 *  - een kolom in de staventabel kan het niet dragen: bij beton zijn het acht
 *    varianten per staaf, en die passen niet in een cel;
 *  - hier staat de vergelijking precies waar de vraag ontstaat — de kaart is
 *    open omdat de gebruiker naar déze staaf kijkt.
 *
 * Het blok rekent pas op verzoek. Acht varianten per betonstaaf maal alle
 * staven zou elke toetsing merkbaar vertragen voor een vraag die per staaf
 * gesteld wordt.
 *
 * DE WAARSCHUWING STAAT BIJ DE GETALLEN. Is de constructie statisch onbepaald,
 * dan draagt élke regel in de kolom "Afwijking" wat er niet is herrekend en
 * welke kant het getoonde getal daardoor op zit — geen voetnoot onderaan. De
 * volledige zin staat in de tooltip van diezelfde cel en in de kopregel boven
 * de tabel.
 */
import { useState } from "react";
import { useVariantStore, type VariantRegel } from "../../stores/variantStore";
import { governingInfo } from "../report/checkReportUtils";
import CheckBlock from "./CheckBlock";
import "./VariantenBlok.css";

function ucClass(uc: number): string {
  if (uc > 1.0) return "vb-uc-fail";
  if (uc > 0.9) return "vb-uc-warn";
  return "vb-uc-ok";
}

const nl2 = (v: number) => v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * De stapaanduiding. Bij beton staan de wapeningsvarianten door elkaar — een
 * staaf erbij en een diametermaat erbij zijn allebei "+1" — dus krijgt de stap
 * daar het soort mee: "st" voor het aantal staven, "Ø" voor de maat.
 */
function stapLabel(regel: VariantRegel): string {
  const stap = regel.voorstel.stap;
  const teken = stap > 0 ? `+${stap}` : String(stap);
  if (regel.voorstel.soort === "wapeningAantal") return `${teken} st`;
  if (regel.voorstel.soort === "wapeningDiameter") return `${teken} Ø`;
  return teken;
}

/** Eén variantregel als tabelrij, met uitklapbare afleiding. */
function Rij({ regel }: { regel: VariantRegel }) {
  const [open, setOpen] = useState(false);
  const r = regel.resultaat;

  return (
    <>
      <tr
        className={`vb-rij${r ? " vb-klikbaar" : ""}`}
        onClick={r ? () => setOpen((v) => !v) : undefined}
      >
        <td className="vb-stap">{stapLabel(regel)}</td>
        <td className="vb-label">{regel.voorstel.label}</td>
        {r ? (
          <>
            <td className={`vb-uc ${ucClass(r.uc_max)}`}>{nl2(r.uc_max)}</td>
            <td className="vb-gov">{governingInfo(r).title}</td>
          </>
        ) : (
          <td className="vb-geen" colSpan={2}>
            {regel.reden ?? "geen resultaat"}
          </td>
        )}
        {/* Zonder getal valt er niets af te wijken; de afwijking hoort bij een
            unity check, niet bij een reden waarom die er niet is. */}
        <td className="vb-afwijking" title={r ? regel.afwijkingVol : undefined}>
          {r ? regel.afwijkingKort : ""}
        </td>
      </tr>
      {open && r && (
        <tr className="vb-afleiding">
          <td colSpan={5}>
            {[...r.checks]
              .sort((a, b) => (b.kind.data.uc?.uc ?? -1) - (a.kind.data.uc?.uc ?? -1))
              .map((named) => (
                <CheckBlock key={named.id} check={named.kind.data} />
              ))}
          </td>
        </tr>
      )}
    </>
  );
}

export default function VariantenBlok({ beamId }: { beamId: number }) {
  const tabel = useVariantStore((s) => s.tabellen[beamId]);
  const bezig = useVariantStore((s) => s.bezig.includes(beamId));
  const fout = useVariantStore((s) => s.fouten[beamId]);
  const bereken = useVariantStore((s) => s.bereken);

  if (!tabel && !bezig && !fout) {
    return (
      <div className="varianten-blok">
        <button className="vb-knop" onClick={() => bereken(beamId)}>
          Naburige doorsneden vergelijken
        </button>
        <span className="vb-knop-hint">
          Toetst dezelfde staaf nog eens met een profiel hoger en lager — alleen de
          weerstand, met dezelfde krachtsverdeling.
        </span>
      </div>
    );
  }

  if (bezig) {
    return <div className="varianten-blok vb-bezig">Varianten worden getoetst…</div>;
  }

  if (fout) {
    return (
      <div className="varianten-blok">
        <div className="vb-fout">{fout}</div>
        <button className="vb-knop" onClick={() => bereken(beamId)}>
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (!tabel) return null;

  const maat = tabel.regels.filter((r) => r.voorstel.soort === "maat");
  const wapening = tabel.regels.filter((r) => r.voorstel.soort !== "maat");

  /** De regel van de doorsnede waarmee werkelijk getoetst is. */
  const huidigeRij = (label: string) => (
    <tr className="vb-rij vb-huidig">
      <td className="vb-stap">0</td>
      <td className="vb-label">{label}</td>
      {tabel.huidigUc !== null ? (
        <>
          <td className={`vb-uc ${ucClass(tabel.huidigUc)}`}>{nl2(tabel.huidigUc)}</td>
          <td className="vb-gov">huidige doorsnede</td>
        </>
      ) : (
        <td className="vb-geen" colSpan={2}>
          geen toetsresultaat voor de huidige doorsnede
        </td>
      )}
      <td className="vb-afwijking">berekend</td>
    </tr>
  );

  const groep = (titel: string, regels: VariantRegel[], huidigLabel: string) => {
    if (regels.length === 0) return null;
    const negatief = regels.filter((r) => r.voorstel.stap < 0);
    const positief = regels.filter((r) => r.voorstel.stap > 0);
    return (
      <table className="vb-tabel" key={titel}>
        <thead>
          <tr>
            <th className="vb-stap">±</th>
            <th className="vb-label">{titel}</th>
            <th className="vb-uc">UC</th>
            <th className="vb-gov">Maatgevend</th>
            <th className="vb-afwijking">Afwijking</th>
          </tr>
        </thead>
        <tbody>
          {negatief.map((r) => (
            <Rij key={r.voorstel.id} regel={r} />
          ))}
          {huidigeRij(huidigLabel)}
          {positief.map((r) => (
            <Rij key={r.voorstel.id} regel={r} />
          ))}
        </tbody>
      </table>
    );
  };

  const onb = tabel.onbepaaldheid;

  return (
    <div className="varianten-blok">
      <div className="vb-kop">
        <span className="vb-titel">Naburige doorsneden</span>
        <button className="vb-herbereken" onClick={() => bereken(beamId)}>
          Opnieuw
        </button>
      </div>

      <div className={`vb-melding ${onb.statischBepaald ? "vb-melding-ok" : "vb-melding-let-op"}`}>
        <strong>{onb.statischBepaald ? "Statisch bepaald" : "Let op"}</strong> — {onb.toelichting}{" "}
        {onb.statischBepaald
          ? "De varianten hieronder toetsen alleen de weerstand opnieuw; dat is hier juist."
          : "De varianten hieronder toetsen alléén de weerstand opnieuw. De werkelijke unity " +
            "check van een variant wijkt daarvan af; de kolom “Afwijking” zegt per regel welke " +
            "kant op."}
      </div>

      {tabel.reden && <div className="vb-leeg">Geen varianten: {tabel.reden}.</div>}

      {groep(
        tabel.materiaal === "beton" ? "Hoogte" : "Doorsnede",
        maat,
        tabel.huidigLabel,
      )}
      {groep("Onderwapening", wapening, "huidige korf")}

      {tabel.regels.length > 0 && (
        <div className="vb-voet">
          Klik op een regel om de volledige afleiding van die variant te zien.
        </div>
      )}
    </div>
  );
}
