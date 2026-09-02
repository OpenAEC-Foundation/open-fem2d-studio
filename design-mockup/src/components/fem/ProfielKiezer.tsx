/**
 * ProfielKiezer — tweestaps profieldialoog voor een staaf.
 *
 * Stap 1: materiaalsoort (Staal / Hout / Aluminium / Beton / Overig — de
 *         laatste drie zichtbaar maar eerlijk uitgeschakeld tot ze bestaan).
 * Stap 2: het profiel BINNEN die soort, samen met de materiaalklasse:
 *         - staal: reeks (IPE/HEA/HEB/HEM/UNP/koker/buis) → maat → staalklasse;
 *         - hout: sterkteklasse (C/GL) → doorsnede b×h.
 * Het resultaat is de COMBINATIE { material, profile } die op de staaf landt —
 * precies de twee velden die resolveSection en de toetsing al lezen.
 */
import { useMemo, useState } from "react";
import { STEEL_SECTION_DIMS } from "../../lib/steelSectionDims.generated";
import { STEEL_SECTIONS } from "../../lib/steelSections.generated";
import { SUPPORTED_TIMBER_GRADES } from "../../lib/timberCheckBuilder";
import { STEEL_GRADES } from "./BarPropertiesDialog";
import { TIMBER_E_MEAN, parseRechthoek } from "../../lib/sectionResolver";
import Modal from "../Modal";
import ProfielMiniatuur from "../shared/ProfielMiniatuur";
import { shapeVanProfiel } from "../shared/profielVorm";
import "./ProfielKiezer.css";

export interface ProfielKeuze {
  material: string;
  profile: string;
}

interface ProfielKiezerProps {
  open: boolean;
  onClose: () => void;
  /** Huidige waarden van de staaf — bepalen de startstap en voorselectie. */
  huidig?: Partial<ProfielKeuze>;
  onApply: (keuze: ProfielKeuze) => void;
}

type MateriaalSoort = "staal" | "hout" | "aluminium" | "beton" | "overig";

const SOORTEN: Array<{ id: MateriaalSoort; label: string; beschikbaar: boolean; hint: string }> = [
  { id: "staal", label: "Staal", beschikbaar: true, hint: "Walsprofielen uit de profieldatabase + staalklasse (EN 1993)" },
  { id: "hout", label: "Hout", beschikbaar: true, hint: "Rechthoekige doorsnede b×h + sterkteklasse (EN 1995)" },
  { id: "aluminium", label: "Aluminium", beschikbaar: false, hint: "Volgt later — nog geen profieldatabase en toetsing" },
  { id: "beton", label: "Beton", beschikbaar: false, hint: "Volgt later — nog geen doorsneden en toetsing" },
  { id: "overig", label: "Overig", beschikbaar: false, hint: "Volgt later — vrije E/A/I-invoer" },
];

/** Reeks-indeling van de staaldatabase op naamprefix. */
const STAAL_REEKSEN: Array<{ id: string; label: string; match: (naam: string) => boolean }> = [
  { id: "IPE", label: "IPE", match: (n) => n.startsWith("IPE") },
  { id: "HEA", label: "HEA", match: (n) => n.startsWith("HEA") },
  { id: "HEB", label: "HEB", match: (n) => n.startsWith("HEB") },
  { id: "HEM", label: "HEM", match: (n) => n.startsWith("HEM") },
  { id: "UNP", label: "UNP", match: (n) => n.startsWith("UNP") },
  { id: "KOKER", label: "Koker (SHS/RHS)", match: (n) => n.startsWith("SHS") || n.startsWith("RHS") || n.startsWith("HFRHS") },
  { id: "CHS", label: "Buis (CHS)", match: (n) => n.startsWith("CHS") },
];

/** Sorteersleutel: eerste getal in de naam (maat), daarna alfabetisch. */
function maatVan(naam: string): number {
  const m = /(\d+)/.exec(naam);
  return m ? parseInt(m[1], 10) : 0;
}

const HOUT_DOORSNEDE_DEFAULT = { b: 71, h: 171 };

export default function ProfielKiezer({ open, onClose, huidig, onApply }: ProfielKiezerProps) {
  const huidigIsHout = !!huidig?.material && (huidig.material in TIMBER_E_MEAN);

  // ── Wizardstate ──────────────────────────────────────────────────────────
  const [soort, setSoort] = useState<MateriaalSoort | null>(
    huidig?.material ? (huidigIsHout ? "hout" : "staal") : null,
  );

  // Staal-stap
  const eersteReeks = huidig?.profile
    ? STAAL_REEKSEN.find((r) => r.match(huidig.profile!.toUpperCase()))?.id ?? "HEA"
    : "HEA";
  const [reeks, setReeks] = useState(eersteReeks);
  const [staalProfiel, setStaalProfiel] = useState(huidig?.profile ?? "");
  const [staalKlasse, setStaalKlasse] = useState(
    huidig?.material && !huidigIsHout ? huidig.material : "S235",
  );

  // Hout-stap
  const huidigRect = huidigIsHout ? parseRechthoek(huidig?.profile) : null;
  const [houtKlasse, setHoutKlasse] = useState(huidigIsHout ? huidig!.material! : "C24");
  const [houtB, setHoutB] = useState(huidigRect?.b ?? HOUT_DOORSNEDE_DEFAULT.b);
  const [houtH, setHoutH] = useState(huidigRect?.h ?? HOUT_DOORSNEDE_DEFAULT.h);

  const reeksProfielen = useMemo(() => {
    const r = STAAL_REEKSEN.find((x) => x.id === reeks);
    if (!r) return [];
    return Object.keys(STEEL_SECTION_DIMS)
      .filter((naam) => r.match(naam))
      .sort((a, b) => maatVan(a) - maatVan(b) || a.localeCompare(b));
  }, [reeks]);

  const dims = staalProfiel ? STEEL_SECTION_DIMS[staalProfiel] : undefined;
  const sectie = staalProfiel ? STEEL_SECTIONS[staalProfiel] : undefined;
  const staalVorm = useMemo(() => shapeVanProfiel(staalProfiel), [staalProfiel]);
  const houtVorm = useMemo(
    () => (houtB > 0 && houtH > 0 ? ({ type: "rect", b: houtB, h: houtH } as const) : null),
    [houtB, houtH],
  );

  const houtGeldig = houtB > 0 && houtH > 0;
  const staalGeldig = !!staalProfiel && !!STEEL_SECTION_DIMS[staalProfiel];

  const pasToe = () => {
    if (soort === "staal" && staalGeldig) {
      onApply({ material: staalKlasse, profile: staalProfiel });
      onClose();
    } else if (soort === "hout" && houtGeldig) {
      onApply({ material: houtKlasse, profile: `${houtB}x${houtH}` });
      onClose();
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title={soort === null ? "Profiel toewijzen — kies materiaal" : `Profiel toewijzen — ${SOORTEN.find(s => s.id === soort)?.label}`}
    >
      {soort === null && (
        <div className="pk-soorten">
          {SOORTEN.map((s) => (
            <button
              key={s.id}
              className={`pk-soort${s.beschikbaar ? "" : " pk-soort-uit"}`}
              disabled={!s.beschikbaar}
              title={s.hint}
              onClick={() => s.beschikbaar && setSoort(s.id)}
            >
              <span className="pk-soort-naam">{s.label}</span>
              <span className="pk-soort-hint">{s.hint}</span>
            </button>
          ))}
        </div>
      )}

      {soort === "staal" && (
        <div className="pk-stap2">
          <div className="pk-kolom pk-kolom-reeks">
            <div className="pk-kolom-kop">Reeks</div>
            {STAAL_REEKSEN.map((r) => (
              <button
                key={r.id}
                className={`pk-rij${reeks === r.id ? " actief" : ""}`}
                onClick={() => { setReeks(r.id); setStaalProfiel(""); }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="pk-kolom pk-kolom-maat">
            <div className="pk-kolom-kop">Profiel</div>
            <div className="pk-scroll">
              {reeksProfielen.map((naam) => (
                <button
                  key={naam}
                  className={`pk-rij${staalProfiel === naam ? " actief" : ""}`}
                  onClick={() => setStaalProfiel(naam)}
                >
                  {naam}
                </button>
              ))}
            </div>
          </div>
          <div className="pk-kolom pk-kolom-detail">
            <div className="pk-kolom-kop">Materiaalklasse</div>
            <select value={staalKlasse} onChange={(e) => setStaalKlasse(e.target.value)}>
              {STEEL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {/* Tekening van het gekozen profiel — zelfde contourwiskunde als
                het rapport (mét walsuitrondingen), compact en thema-volgend. */}
            {staalVorm && (
              <div className="pk-tekening">
                <ProfielMiniatuur shape={staalVorm} titel={`Doorsnede ${staalProfiel}`} />
              </div>
            )}
            {dims && (
              <div className="pk-eigenschappen">
                <div className="pk-kolom-kop">Eigenschappen</div>
                <div className="pk-eig-rij"><span>h × b</span><code>{dims.h} × {dims.b} mm</code></div>
                <div className="pk-eig-rij"><span>t_w / t_f</span><code>{dims.tw} / {dims.tf} mm</code></div>
                {sectie && <div className="pk-eig-rij"><span>A</span><code>{sectie.A.toLocaleString("nl-NL")} mm²</code></div>}
                {sectie && <div className="pk-eig-rij"><span>I_y</span><code>{(sectie.Iy / 1e4).toLocaleString("nl-NL", { maximumFractionDigits: 0 })} cm⁴</code></div>}
              </div>
            )}
            <div className="pk-samenvatting">
              {staalGeldig
                ? <>Keuze: <strong>{staalProfiel} — {staalKlasse}</strong></>
                : "Kies een profiel uit de lijst."}
            </div>
          </div>
        </div>
      )}

      {soort === "hout" && (
        <div className="pk-stap2">
          <div className="pk-kolom pk-kolom-reeks">
            <div className="pk-kolom-kop">Sterkteklasse</div>
            <div className="pk-scroll">
              {SUPPORTED_TIMBER_GRADES.map((g) => (
                <button
                  key={g}
                  className={`pk-rij${houtKlasse === g ? " actief" : ""}`}
                  onClick={() => setHoutKlasse(g)}
                >
                  {g} <span className="pk-rij-sub">{g.startsWith("GL") ? "gelamineerd" : "gezaagd"}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pk-kolom pk-kolom-detail">
            <div className="pk-kolom-kop">Doorsnede</div>
            <label className="pk-veld">
              <span>Breedte b [mm]</span>
              <input type="number" min={10} step={1} value={houtB}
                onChange={(e) => setHoutB(Number(e.target.value))} />
            </label>
            <label className="pk-veld">
              <span>Hoogte h [mm]</span>
              <input type="number" min={10} step={1} value={houtH}
                onChange={(e) => setHoutH(Number(e.target.value))} />
            </label>
            {houtVorm && (
              <div className="pk-tekening">
                <ProfielMiniatuur shape={houtVorm} titel={`Doorsnede ${houtB}×${houtH} mm`} />
              </div>
            )}
            {houtGeldig && (
              <div className="pk-eigenschappen">
                <div className="pk-eig-rij"><span>A</span><code>{(houtB * houtH).toLocaleString("nl-NL")} mm²</code></div>
                <div className="pk-eig-rij"><span>I_y</span><code>{(houtB * houtH ** 3 / 12 / 1e4).toLocaleString("nl-NL", { maximumFractionDigits: 0 })} cm⁴</code></div>
                <div className="pk-eig-rij"><span>E₀,mean</span><code>{TIMBER_E_MEAN[houtKlasse] ?? "—"} N/mm²</code></div>
              </div>
            )}
            <div className="pk-samenvatting">
              {houtGeldig
                ? <>Keuze: <strong>{houtB}×{houtH} — {houtKlasse}</strong></>
                : "Vul een geldige doorsnede in."}
            </div>
          </div>
        </div>
      )}

      <div className="pk-voet">
        {soort !== null && (
          <button className="pk-knop" onClick={() => setSoort(null)}>← Materiaal</button>
        )}
        <div className="pk-voet-rechts">
          <button className="pk-knop" onClick={onClose}>Annuleren</button>
          {soort !== null && (
            <button
              className="pk-knop pk-knop-primair"
              disabled={soort === "staal" ? !staalGeldig : soort === "hout" ? !houtGeldig : true}
              onClick={pasToe}
            >
              Toepassen
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
