/**
 * WapeningskorfEditor — de invoervelden van de wapeningskorf.
 *
 * Doorsnede (vorm plus de maten die bij die vorm horen), betonsterkteklasse en
 * wapeningsstaal, dekking, beugel, boven- en onderwapening (aantal × Ø), het
 * aantal stroken voor de integratie en de vorm van het staaldiagram. Daarnaast
 * de normaalkracht waarbij het M-κ-diagram wordt getekend.
 *
 * De flensvelden verschijnen alleen bij een T of een L, en verdwijnen ook
 * weer: de kern weigert een rechthoek die een flensdikte meedraagt, omdat dat
 * betekent dat er iets anders bedoeld is dan er staat.
 *
 * De component is gecontroleerd: alle waarden komen via `waarde` binnen en
 * elke wijziging gaat via `onChange` terug. Geen eigen state, zodat de
 * aanroeper (het paneel, of later de staafeigenschappen) de bron van
 * waarheid blijft.
 *
 * De groep "Wapeningskorf" zelf — milieuklasse, dekking, beugel en de twee
 * rijen — staat in [`KorfVelden`], omdat de profielkiezer dezelfde velden
 * toont. Eén component, twee plaatsen, één gegeven; zie de tekst daar.
 */
import type { ConcreteClass } from "../../lib/types/concrete/ConcreteClass";
import type { ConcreteSectionInput } from "../../lib/types/concrete/ConcreteSectionInput";
import type { ConcreteShape } from "../../lib/types/concrete/ConcreteShape";
import type { ExposureClassInfo } from "../../lib/types/concrete/ExposureClassInfo";
import type { ReinforcementGrade } from "../../lib/types/concrete/ReinforcementGrade";
import type { SteelBranch } from "../../lib/types/concrete/SteelBranch";
import { SUPPORTED_CONCRETE_CLASSES, SUPPORTED_REINFORCEMENT_GRADES } from "../../lib/betonCheckBuilder";
import KorfVelden, { Getal } from "./KorfVelden";
import { nl, type Wapeningskorf } from "./wapeningskorf";
import "./beton.css";

interface Props {
  waarde: Wapeningskorf;
  onChange: (korf: Wapeningskorf) => void;
  /** Normaalkracht voor het diagram, kN (trek positief, druk negatief). */
  nEdKn: number;
  onNEdChange: (nEdKn: number) => void;
  /** Tabel 3.1 uit de kern; ontbreekt → alleen de namen. */
  betonklassen?: ConcreteClass[];
  /** Bijlage C uit de kern; ontbreekt → alleen de namen. */
  staalsoorten?: ReinforcementGrade[];
  /** Tabel 4.1 uit de kern; ontbreekt → alleen de aanduidingen. */
  milieuklassen?: ExposureClassInfo[];
}

export default function WapeningskorfEditor({
  waarde,
  onChange,
  nEdKn,
  onNEdChange,
  betonklassen,
  staalsoorten,
  milieuklassen,
}: Props) {
  const zet = (patch: Partial<Wapeningskorf>) => onChange({ ...waarde, ...patch });
  const d = waarde.doorsnede;
  const heeftFlens = d.shape !== "Rectangle";
  const zetDoorsnede = (patch: Partial<ConcreteSectionInput>) =>
    zet({ doorsnede: { ...d, ...patch } });
  /**
   * Van vorm wisselen. Naar een T of L toe worden de flensmaten aangevuld
   * met een maat die bij de doorsnede past — h/6 flensdikte, de helft van de
   * breedte als lijf — en niet met nul: nul zou de doorsnede meteen
   * ongeldig maken en de gebruiker een foutmelding geven op iets wat hij nog
   * niet heeft ingevuld. Terug naar een rechthoek worden ze WEGGEGOOID; de
   * kern weigert een rechthoek met flensmaten, en terecht.
   */
  const zetVorm = (shape: ConcreteShape) => {
    if (shape === "Rectangle") {
      zetDoorsnede({ shape, b_w_mm: null, h_f_mm: null, flange_at_bottom: false });
      return;
    }
    zetDoorsnede({
      shape,
      b_w_mm: d.b_w_mm ?? Math.max(50, Math.round(d.b_mm / 2 / 10) * 10),
      h_f_mm: d.h_f_mm ?? Math.max(20, Math.round(d.h_mm / 6 / 10) * 10),
    });
  };

  const klasseNamen = betonklassen && betonklassen.length > 0 ? betonklassen.map((c) => c.name) : [...SUPPORTED_CONCRETE_CLASSES];
  const staalNamen = staalsoorten && staalsoorten.length > 0 ? staalsoorten.map((g) => g.name) : [...SUPPORTED_REINFORCEMENT_GRADES];
  const klasse = betonklassen?.find((c) => c.name === waarde.betonklasse);
  const staal = staalsoorten?.find((g) => g.name === waarde.staalsoort);

  return (
    <div className="beton-form">
      <div className="beton-groep">
        <div className="beton-groep-kop">Doorsnede</div>
        <label className="beton-rij" htmlFor="beton-vorm">
          <span className="beton-label">Vorm</span>
          <select
            id="beton-vorm"
            className="beton-invoer"
            value={d.shape}
            onChange={(e) => zetVorm(e.target.value as ConcreteShape)}
          >
            <option value="Rectangle">rechthoek</option>
            <option value="Tee">T-ligger</option>
            <option value="Ell">L-ligger (randligger)</option>
          </select>
        </label>
        <Getal
          id="beton-b"
          label={heeftFlens ? "Flensbreedte b_eff" : "Breedte b"}
          eenheid="mm"
          waarde={d.b_mm}
          min={50}
          stap={10}
          onChange={(v) => zetDoorsnede({ b_mm: v })}
        />
        <Getal id="beton-h" label="Hoogte h" eenheid="mm" waarde={d.h_mm} min={50} stap={10} onChange={(v) => zetDoorsnede({ h_mm: v })} />
        {heeftFlens && (
          <>
            <Getal
              id="beton-bw"
              label="Lijfbreedte b_w"
              eenheid="mm"
              waarde={d.b_w_mm ?? 0}
              min={50}
              stap={10}
              onChange={(v) => zetDoorsnede({ b_w_mm: v })}
            />
            <Getal
              id="beton-hf"
              label="Flensdikte h_f"
              eenheid="mm"
              waarde={d.h_f_mm ?? 0}
              min={20}
              stap={10}
              onChange={(v) => zetDoorsnede({ h_f_mm: v })}
            />
            <label className="beton-rij" htmlFor="beton-flenszijde">
              <span className="beton-label">Flens ligt</span>
              <select
                id="beton-flenszijde"
                className="beton-invoer"
                value={d.flange_at_bottom ? "onder" : "boven"}
                onChange={(e) => zetDoorsnede({ flange_at_bottom: e.target.value === "onder" })}
              >
                <option value="boven">boven (ligger onder een vloer)</option>
                <option value="onder">onder (omgekeerde T)</option>
              </select>
            </label>
            <div className="beton-hint">
              De flensbreedte hoort de MEEWERKENDE breedte b<sub>eff</sub> te zijn — 5.3.2.1(3),
              vergelijking (5.7). Bij het toetsen van het model leidt de rekenkern hem af uit de
              liggerlijn en vervangt hij de waarde die hier staat; het resultaat noemt altijd de
              breedte waarmee gerekend is.
              {d.shape === "Ell" && (
                <>
                  {" "}
                  Een L rekent in dit uniaxiale model exact als een T; dat geldt alleen als de
                  zijdelingse kromming verhinderd is, bijvoorbeeld door een vloerschijf. Die
                  aanname staat in elk resultaat.
                </>
              )}
            </div>
          </>
        )}
        <label className="beton-rij" htmlFor="beton-klasse">
          <span className="beton-label">Betonkwaliteit</span>
          <select id="beton-klasse" className="beton-invoer" value={waarde.betonklasse} onChange={(e) => zet({ betonklasse: e.target.value })}>
            {klasseNamen.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {klasse && (
          <div className="beton-hint">
            f<sub>ck</sub> = {nl(klasse.f_ck, 0)} N/mm², f<sub>cd</sub> = {nl(klasse.f_ck / 1.5, 1)} N/mm² (α<sub>cc</sub> = 1,0; γ<sub>C</sub> = 1,5),
            E<sub>cm</sub> = {nl(klasse.e_cm / 1000, 0)} GPa, ε<sub>cu2</sub> = {nl(klasse.eps_cu2 * 1000, 1)} ‰
          </div>
        )}
        <label className="beton-rij" htmlFor="beton-staal">
          <span className="beton-label">Wapeningsstaal</span>
          <select id="beton-staal" className="beton-invoer" value={waarde.staalsoort} onChange={(e) => zet({ staalsoort: e.target.value })}>
            {staalNamen.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {staal && (
          <div className="beton-hint">
            f<sub>yk</sub> = {nl(staal.f_yk, 0)} N/mm², f<sub>yd</sub> = {nl(staal.f_yk / 1.15, 1)} N/mm² (γ<sub>S</sub> = 1,15),
            klasse {staal.ductility_class}, ε<sub>uk</sub> = {nl(staal.eps_uk * 100, 1)} %
          </div>
        )}
      </div>

      <div className="beton-groep">
        <div className="beton-groep-kop">Wapeningskorf</div>
        <KorfVelden
          idPrefix="beton"
          korf={waarde.korf}
          onKorfChange={(korf) => zet({ korf })}
          milieuklasse={waarde.milieuklasse}
          onMilieuklasseChange={(milieuklasse) => zet({ milieuklasse })}
          constructieklasse={waarde.constructieklasse}
          onConstructieklasseChange={(constructieklasse) => zet({ constructieklasse })}
          milieuklassen={milieuklassen}
          doorsnede={waarde.doorsnede}
        />
      </div>

      <div className="beton-groep">
        <div className="beton-groep-kop">Berekening</div>
        <Getal
          id="beton-stroken"
          label="Aantal stroken"
          waarde={waarde.aantalStroken}
          min={5}
          max={2000}
          stap={5}
          onChange={(v) => zet({ aantalStroken: Math.max(1, Math.round(v)) })}
        />
        <div className="beton-hint">
          In hoeveel delen de doorsnede voor de integratie van de betonspanning wordt opgeknipt.
          De fout neemt kwadratisch af; bij 50 stroken is hij kleiner dan 0,05 %.
        </div>
        <label className="beton-rij" htmlFor="beton-staaltak">
          <span className="beton-label">Staaldiagram</span>
          <select id="beton-staaltak" className="beton-invoer" value={waarde.staaltak} onChange={(e) => zet({ staaltak: e.target.value as SteelBranch })}>
            <option value="Horizontal">horizontale bovenste tak (3.2.7(2)b)</option>
            <option value="Inclined">hellende bovenste tak, ε_ud = 0,9·ε_uk (3.2.7(2)a)</option>
          </select>
        </label>
        <Getal id="beton-ned" label="N_Ed voor het diagram" eenheid="kN" waarde={nEdKn} stap={10} onChange={onNEdChange} />
        <div className="beton-hint">Druk negatief, trek positief.</div>
      </div>
    </div>
  );
}
