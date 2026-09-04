/**
 * WapeningskorfEditor — de invoervelden van de wapeningskorf.
 *
 * Doorsnede (b, h), betonsterkteklasse en wapeningsstaal, dekking, beugel,
 * boven- en onderwapening (aantal × Ø), het aantal stroken voor de
 * integratie en de vorm van het staaldiagram. Daarnaast de normaalkracht
 * waarbij het M-κ-diagram wordt getekend.
 *
 * De component is gecontroleerd: alle waarden komen via `waarde` binnen en
 * elke wijziging gaat via `onChange` terug. Geen eigen state, zodat de
 * aanroeper (het paneel, of later de staafeigenschappen) de bron van
 * waarheid blijft.
 */
import type { ConcreteClass } from "../../lib/types/concrete/ConcreteClass";
import type { ReinforcementGrade } from "../../lib/types/concrete/ReinforcementGrade";
import type { RebarRow } from "../../lib/types/concrete/RebarRow";
import type { SteelBranch } from "../../lib/types/concrete/SteelBranch";
import { SUPPORTED_CONCRETE_CLASSES, SUPPORTED_REINFORCEMENT_GRADES } from "../../lib/betonCheckBuilder";
import { BEUGELDIAMETERS, STAAFDIAMETERS, nl, type Wapeningskorf } from "./wapeningskorf";
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
}

function Getal({
  id,
  label,
  eenheid,
  waarde,
  onChange,
  min,
  max,
  stap,
}: {
  id: string;
  label: string;
  eenheid?: string;
  waarde: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  stap?: number;
}) {
  return (
    <label className="beton-rij" htmlFor={id}>
      <span className="beton-label">{label}</span>
      <span className="beton-invoer-met-eenheid">
        <input
          id={id}
          className="beton-invoer"
          type="number"
          value={Number.isFinite(waarde) ? waarde : ""}
          min={min}
          max={max}
          step={stap ?? 1}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        {eenheid && <span className="beton-eenheid">{eenheid}</span>}
      </span>
    </label>
  );
}

function Rij({
  id,
  label,
  rij,
  onChange,
}: {
  id: string;
  label: string;
  rij: RebarRow;
  onChange: (rij: RebarRow) => void;
}) {
  return (
    <div className="beton-rij">
      <span className="beton-label">{label}</span>
      <span className="beton-invoer-groep">
        <input
          id={`${id}-aantal`}
          className="beton-invoer beton-invoer-kort"
          type="number"
          min={0}
          max={30}
          step={1}
          value={rij.count}
          aria-label={`${label}: aantal staven`}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v) && v >= 0) onChange({ ...rij, count: v });
          }}
        />
        <span className="beton-eenheid">×</span>
        <select
          id={`${id}-diameter`}
          className="beton-invoer beton-invoer-kort"
          value={rij.diameter_mm}
          aria-label={`${label}: staafdiameter`}
          onChange={(e) => onChange({ ...rij, diameter_mm: parseFloat(e.target.value) })}
        >
          {STAAFDIAMETERS.map((d) => (
            <option key={d} value={d}>
              Ø{d}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

export default function WapeningskorfEditor({
  waarde,
  onChange,
  nEdKn,
  onNEdChange,
  betonklassen,
  staalsoorten,
}: Props) {
  const zet = (patch: Partial<Wapeningskorf>) => onChange({ ...waarde, ...patch });
  const zetKorf = (patch: Partial<Wapeningskorf["korf"]>) => onChange({ ...waarde, korf: { ...waarde.korf, ...patch } });

  const klasseNamen = betonklassen && betonklassen.length > 0 ? betonklassen.map((c) => c.name) : [...SUPPORTED_CONCRETE_CLASSES];
  const staalNamen = staalsoorten && staalsoorten.length > 0 ? staalsoorten.map((g) => g.name) : [...SUPPORTED_REINFORCEMENT_GRADES];
  const klasse = betonklassen?.find((c) => c.name === waarde.betonklasse);
  const staal = staalsoorten?.find((g) => g.name === waarde.staalsoort);

  return (
    <div className="beton-form">
      <div className="beton-groep">
        <div className="beton-groep-kop">Doorsnede</div>
        <Getal id="beton-b" label="Breedte b" eenheid="mm" waarde={waarde.breedteMm} min={50} stap={10} onChange={(v) => zet({ breedteMm: v })} />
        <Getal id="beton-h" label="Hoogte h" eenheid="mm" waarde={waarde.hoogteMm} min={50} stap={10} onChange={(v) => zet({ hoogteMm: v })} />
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
        <Getal id="beton-dekking" label="Dekking c_nom" eenheid="mm" waarde={waarde.korf.cover_mm} min={0} max={100} stap={5} onChange={(v) => zetKorf({ cover_mm: v })} />
        <label className="beton-rij" htmlFor="beton-beugel">
          <span className="beton-label">Beugel</span>
          <select
            id="beton-beugel"
            className="beton-invoer"
            value={waarde.korf.stirrup_diameter_mm}
            onChange={(e) => zetKorf({ stirrup_diameter_mm: parseFloat(e.target.value) })}
          >
            {BEUGELDIAMETERS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "geen" : `Ø${d}`}
              </option>
            ))}
          </select>
        </label>
        <Rij id="beton-boven" label="Bovenwapening" rij={waarde.korf.top} onChange={(top) => zetKorf({ top })} />
        <Rij id="beton-onder" label="Onderwapening" rij={waarde.korf.bottom} onChange={(bottom) => zetKorf({ bottom })} />
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
