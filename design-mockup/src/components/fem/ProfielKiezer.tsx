/**
 * ProfielKiezer — tweestaps profieldialoog voor een staaf.
 *
 * Stap 1: materiaalsoort (Staal / Hout / Beton / Aluminium / Overig — de
 *         laatste twee zichtbaar maar eerlijk uitgeschakeld tot ze bestaan).
 * Stap 2: het profiel BINNEN die soort, samen met de materiaalklasse:
 *         - staal: reeks (IPE/HEA/HEB/HEM/UNP/koker/buis) → maat → staalklasse;
 *         - hout: sterkteklasse (C/GL) → massief b×h, óf kruislaaghout als
 *           opbouw (voorinstelling of vrij: "CLT 40/20/40/20/40[:C16][b600]");
 *         - beton: betonklasse (C12/15 … C90/105) → doorsnede b×h; de
 *           wapeningskorf hoort bij de staafeigenschappen (tabblad Norm).
 * Het resultaat is de COMBINATIE { material, profile } die op de staaf landt —
 * precies de twee velden die resolveSection en de toetsing al lezen.
 */
import { useMemo, useState } from "react";
import { STEEL_SECTION_DIMS } from "../../lib/steelSectionDims.generated";
import { STEEL_SECTIONS } from "../../lib/steelSections.generated";
import { SUPPORTED_TIMBER_GRADES } from "../../lib/timberCheckBuilder";
import { STEEL_GRADES } from "./BarPropertiesDialog";
import { CONCRETE_E_CM, TIMBER_E_MEAN, parseRechthoek } from "../../lib/sectionResolver";
import {
  CLT_STROOKBREEDTE_MM,
  CLT_VOORINSTELLINGEN,
  cltHoogteMm,
  cltSolverDoorsnede,
  cltVanVoorinstelling,
  formatCltProfiel,
  isCltProfiel,
  parseCltProfiel,
} from "../../lib/cltCheckBuilder";
import {
  SUPPORTED_CONCRETE_CLASSES,
  matchSupportedConcreteClass,
} from "../../lib/betonCheckBuilder";
import type { CltPreset } from "../../lib/types/timber/CltPreset";
import type { EigenDoorsnede } from "../../lib/profieleditor/types";
import {
  isEigenProfiel,
  profielnaamVan,
  useEigenDoorsneden,
} from "../../lib/profieleditor/eigenDoorsnedenStore";
import ProfielEditor from "../profieleditor/ProfielEditor";
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

type MateriaalSoort = "staal" | "eigen" | "hout" | "beton" | "aluminium" | "overig";

const SOORTEN: Array<{ id: MateriaalSoort; label: string; beschikbaar: boolean; hint: string }> = [
  { id: "staal", label: "Staal", beschikbaar: true, hint: "Walsprofielen uit de profieldatabase + staalklasse (EN 1993)" },
  { id: "eigen", label: "Eigen doorsnede", beschikbaar: true, hint: "Samenstellen uit platen en profielen, of een gat in een catalogusprofiel (staal, EN 1993)" },
  { id: "hout", label: "Hout", beschikbaar: true, hint: "Massief b×h of kruislaaghout (CLT) + sterkteklasse (EN 1995)" },
  { id: "beton", label: "Beton", beschikbaar: true, hint: "Rechthoekige doorsnede b×h + betonklasse (EN 1992); wapeningskorf bij de staafeigenschappen" },
  { id: "aluminium", label: "Aluminium", beschikbaar: false, hint: "Volgt later — nog geen profieldatabase en toetsing" },
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

/**
 * Vaste maat van het venster, gelijk voor élke stap.
 *
 * De dialoog groeide en kromp eerder mee met zijn inhoud: de materiaalkeuze
 * was laag, de staalstap hoger, de CLT-stap hoger nog, en de eigen doorsnede
 * maakte hem tweemaal zo breed. Bij elke stap sprong het venster onder de
 * muis weg. Nu ligt de maat vast en schuift alleen de inhoud, zodat knoppen
 * op hun plek blijven staan.
 */
const VENSTER_BREEDTE = 720;
const VENSTER_HOOGTE = 560;

const HOUT_DOORSNEDE_DEFAULT = { b: 71, h: 171 };
const BETON_DOORSNEDE_DEFAULT = { b: 300, h: 500 };
/** Startopbouw voor kruislaaghout: de gangbare 5-laags 160. */
const CLT_PRESET_DEFAULT: CltPreset =
  CLT_VOORINSTELLINGEN.find((p) => p.name === "5-laags 160") ?? CLT_VOORINSTELLINGEN[0];

function nlGetal(v: number, decimalen = 0): string {
  return v.toLocaleString("nl-NL", { maximumFractionDigits: decimalen });
}

export default function ProfielKiezer({ open, onClose, huidig, onApply }: ProfielKiezerProps) {
  const huidigIsBeton = matchSupportedConcreteClass(huidig?.material) !== null;
  const huidigIsHout = !huidigIsBeton && !!huidig?.material && (huidig.material in TIMBER_E_MEAN);
  const huidigIsClt = huidigIsHout && isCltProfiel(huidig?.profile);
  const huidigIsEigen = !huidigIsBeton && !huidigIsHout && isEigenProfiel(huidig?.profile);

  // ── Wizardstate ──────────────────────────────────────────────────────────
  const [soort, setSoort] = useState<MateriaalSoort | null>(
    huidig?.material
      ? huidigIsBeton ? "beton" : huidigIsHout ? "hout" : huidigIsEigen ? "eigen" : "staal"
      : null,
  );

  // Eigen doorsnede: de bewaarde doorsneden staan hier in een lijst, en de
  // profieleditor opent in zijn eigen venster. Hij stond eerst ingebouwd in
  // deze dialoog, maar dan moet die dialoog meegroeien tot editorformaat —
  // precies de sprong in vensterafmeting die eruit moest.
  const eigenDoorsneden = useEigenDoorsneden((s) => s.items);
  const [editorOpen, setEditorOpen] = useState(false);
  const kiesEigen = (d: EigenDoorsnede) => {
    onApply({ material: staalKlasse, profile: profielnaamVan(d) });
    onClose();
  };

  // Staal-stap
  const eersteReeks = huidig?.profile
    ? STAAL_REEKSEN.find((r) => r.match(huidig.profile!.toUpperCase()))?.id ?? "HEA"
    : "HEA";
  const [reeks, setReeks] = useState(eersteReeks);
  const [staalProfiel, setStaalProfiel] = useState(huidig?.profile ?? "");
  const [staalKlasse, setStaalKlasse] = useState(
    huidig?.material && !huidigIsHout && !huidigIsBeton ? huidig.material : "S235",
  );

  // Hout-stap: massief b×h of een CLT-opbouw
  const huidigRect = huidigIsHout && !huidigIsClt ? parseRechthoek(huidig?.profile) : null;
  const [houtKlasse, setHoutKlasse] = useState(huidigIsHout ? huidig!.material! : "C24");
  const [houtType, setHoutType] = useState<"massief" | "clt">(huidigIsClt ? "clt" : "massief");
  const [houtB, setHoutB] = useState(huidigRect?.b ?? HOUT_DOORSNEDE_DEFAULT.b);
  const [houtH, setHoutH] = useState(huidigRect?.h ?? HOUT_DOORSNEDE_DEFAULT.h);
  // De opbouw als tekst, zodat hij ook vrij te bewerken is; een voorinstelling
  // schrijft de tekst, en de tekst is wat er op de staaf landt.
  const [cltTekst, setCltTekst] = useState(() =>
    huidigIsClt
      ? huidig!.profile!
      : formatCltProfiel(cltVanVoorinstelling(CLT_PRESET_DEFAULT, "C24"), "C24"),
  );

  // Beton-stap
  const huidigBetonRect = huidigIsBeton ? parseRechthoek(huidig?.profile) : null;
  const [betonKlasse, setBetonKlasse] = useState(huidigIsBeton ? huidig!.material! : "C30/37");
  const [betonB, setBetonB] = useState(huidigBetonRect?.b ?? BETON_DOORSNEDE_DEFAULT.b);
  const [betonH, setBetonH] = useState(huidigBetonRect?.h ?? BETON_DOORSNEDE_DEFAULT.h);

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
  const betonVorm = useMemo(
    () => (betonB > 0 && betonH > 0 ? ({ type: "rect", b: betonB, h: betonH } as const) : null),
    [betonB, betonH],
  );

  // CLT: de tekst geparsed met de gekozen klasse als standaard voor lagen
  // zonder eigen klasse; de solvergrootheden erbij, zodat de kiezer laat zien
  // wat de opbouw stijfheidstechnisch waard is.
  const cltLayup = useMemo(() => parseCltProfiel(cltTekst, houtKlasse), [cltTekst, houtKlasse]);
  const cltGeldig = !!cltLayup && cltLayup.layers.some((l) => l.orientation === "Longitudinal");
  const cltDoorsnede = useMemo(
    () => (cltLayup ? cltSolverDoorsnede(cltLayup, (k) => TIMBER_E_MEAN[k]) : null),
    [cltLayup],
  );
  const cltBreedte = cltLayup?.width_mm ?? CLT_STROOKBREEDTE_MM;

  const kiesCltVoorinstelling = (naam: string) => {
    const p = CLT_VOORINSTELLINGEN.find((x) => x.name === naam);
    if (!p) return;
    setCltTekst(formatCltProfiel(cltVanVoorinstelling(p, houtKlasse, cltBreedte), houtKlasse));
  };
  const zetCltBreedte = (breedte: number) => {
    if (!cltLayup || !(breedte > 0)) return;
    setCltTekst(formatCltProfiel({ ...cltLayup, width_mm: breedte }, houtKlasse));
  };
  /** Welke voorinstelling bij de huidige tekst hoort — of geen (vrij). */
  const actieveVoorinstelling =
    cltLayup
      ? CLT_VOORINSTELLINGEN.find(
          (p) =>
            p.thicknesses_mm.length === cltLayup.layers.length &&
            p.thicknesses_mm.every((t, i) => t === cltLayup.layers[i].thickness_mm),
        )?.name ?? ""
      : "";

  const houtGeldig = houtType === "clt" ? cltGeldig : houtB > 0 && houtH > 0;
  const staalGeldig = !!staalProfiel && !!STEEL_SECTION_DIMS[staalProfiel];
  const betonGeldig = betonB > 0 && betonH > 0;

  const pasToe = () => {
    if (soort === "staal" && staalGeldig) {
      onApply({ material: staalKlasse, profile: staalProfiel });
      onClose();
    } else if (soort === "hout" && houtGeldig) {
      onApply({
        material: houtKlasse,
        profile:
          houtType === "clt" && cltLayup
            ? formatCltProfiel(cltLayup, houtKlasse)
            : `${houtB}x${houtH}`,
      });
      onClose();
    } else if (soort === "beton" && betonGeldig) {
      onApply({ material: betonKlasse, profile: `${betonB}x${betonH}` });
      onClose();
    }
  };

  const toepassenUit =
    soort === "staal" ? !staalGeldig
    : soort === "hout" ? !houtGeldig
    : soort === "beton" ? !betonGeldig
    : true;

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={VENSTER_BREEDTE}
      height={VENSTER_HOOGTE}
      className="pk-modal"
      title={soort === null ? "Profiel toewijzen — kies materiaal" : `Profiel toewijzen — ${SOORTEN.find(s => s.id === soort)?.label}`}
    >
      <div className="pk-inhoud">
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
                {sectie && <div className="pk-eig-rij"><span>A</span><code>{nlGetal(sectie.A)} mm²</code></div>}
                {sectie && <div className="pk-eig-rij"><span>I_y</span><code>{nlGetal(sectie.Iy / 1e4)} cm⁴</code></div>}
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
            <div className="pk-kolom-kop">Vorm</div>
            <button
              className={`pk-rij${houtType === "massief" ? " actief" : ""}`}
              onClick={() => setHoutType("massief")}
            >
              Massief <span className="pk-rij-sub">b × h</span>
            </button>
            <button
              className={`pk-rij${houtType === "clt" ? " actief" : ""}`}
              onClick={() => setHoutType("clt")}
            >
              Kruislaaghout <span className="pk-rij-sub">CLT-opbouw</span>
            </button>
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

          {houtType === "massief" && (
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
                  <div className="pk-eig-rij"><span>A</span><code>{nlGetal(houtB * houtH)} mm²</code></div>
                  <div className="pk-eig-rij"><span>I_y</span><code>{nlGetal(houtB * houtH ** 3 / 12 / 1e4)} cm⁴</code></div>
                  <div className="pk-eig-rij"><span>E₀,mean</span><code>{TIMBER_E_MEAN[houtKlasse] ?? "—"} N/mm²</code></div>
                </div>
              )}
              <div className="pk-samenvatting">
                {houtGeldig
                  ? <>Keuze: <strong>{houtB}×{houtH} — {houtKlasse}</strong></>
                  : "Vul een geldige doorsnede in."}
              </div>
            </div>
          )}

          {houtType === "clt" && (
            <div className="pk-kolom pk-kolom-detail">
              <div className="pk-kolom-kop">Opbouw</div>
              <label className="pk-veld">
                <span>Voorinstelling</span>
                <select value={actieveVoorinstelling} onChange={(e) => kiesCltVoorinstelling(e.target.value)}>
                  <option value="">— vrij —</option>
                  {CLT_VOORINSTELLINGEN.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.thicknesses_mm.join("/")})
                    </option>
                  ))}
                </select>
              </label>
              <label className="pk-veld">
                <span>Strookbreedte b [mm]</span>
                <input type="number" min={10} step={10} value={cltBreedte}
                  onChange={(e) => zetCltBreedte(Number(e.target.value))} />
              </label>
              <label className="pk-veld">
                <span>Lagen (boven → beneden)</span>
                <input
                  type="text"
                  value={cltTekst}
                  onChange={(e) => setCltTekst(e.target.value)}
                  placeholder="CLT 40/20/40/20/40"
                  spellCheck={false}
                />
              </label>
              <div className="pk-hint">
                Dikten in mm, gescheiden door "/". Lagen wisselen lengte/dwars af,
                beginnend met een lengtelaag; optioneel L of D per laag en een
                eigen klasse, bijv. <code>40L:C24/20D:C16/40L</code>.
              </div>
              {cltLayup && (
                <div className="pk-eigenschappen">
                  {cltLayup.layers.map((l, i) => (
                    <div key={i} className="pk-eig-rij">
                      <span>laag {i + 1}</span>
                      <code>
                        {l.thickness_mm} mm · {l.orientation === "Longitudinal" ? "lengte" : "dwars"} · {l.strength_class}
                      </code>
                    </div>
                  ))}
                  <div className="pk-eig-rij"><span>h</span><code>{cltHoogteMm(cltLayup)} mm</code></div>
                  {cltDoorsnede && (
                    <div className="pk-eig-rij">
                      <span>(EI)_ef</span>
                      <code>{nlGetal((cltDoorsnede.E * cltDoorsnede.I) / 1e9, 1)} kNm²</code>
                    </div>
                  )}
                </div>
              )}
              <div className="pk-samenvatting">
                {cltGeldig && cltLayup
                  ? <>Keuze: <strong>{formatCltProfiel(cltLayup, houtKlasse)} — {houtKlasse}</strong></>
                  : cltLayup
                    ? "De opbouw heeft geen lengtelaag."
                    : "Geen geldige opbouw — zie de notatie hierboven."}
              </div>
            </div>
          )}
        </div>
      )}

      {soort === "beton" && (
        <div className="pk-stap2">
          <div className="pk-kolom pk-kolom-reeks">
            <div className="pk-kolom-kop">Betonklasse</div>
            <div className="pk-scroll">
              {SUPPORTED_CONCRETE_CLASSES.map((k) => (
                <button
                  key={k}
                  className={`pk-rij${betonKlasse === k ? " actief" : ""}`}
                  onClick={() => setBetonKlasse(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="pk-kolom pk-kolom-detail">
            <div className="pk-kolom-kop">Doorsnede</div>
            <label className="pk-veld">
              <span>Breedte b [mm]</span>
              <input type="number" min={50} step={10} value={betonB}
                onChange={(e) => setBetonB(Number(e.target.value))} />
            </label>
            <label className="pk-veld">
              <span>Hoogte h [mm]</span>
              <input type="number" min={50} step={10} value={betonH}
                onChange={(e) => setBetonH(Number(e.target.value))} />
            </label>
            {betonVorm && (
              <div className="pk-tekening">
                <ProfielMiniatuur shape={betonVorm} titel={`Doorsnede ${betonB}×${betonH} mm`} />
              </div>
            )}
            {betonGeldig && (
              <div className="pk-eigenschappen">
                <div className="pk-eig-rij"><span>A</span><code>{nlGetal(betonB * betonH)} mm²</code></div>
                <div className="pk-eig-rij"><span>I_y</span><code>{nlGetal(betonB * betonH ** 3 / 12 / 1e4)} cm⁴</code></div>
                <div className="pk-eig-rij"><span>E_cm</span><code>{CONCRETE_E_CM[betonKlasse] ?? "—"} N/mm²</code></div>
              </div>
            )}
            <div className="pk-hint">
              De wapeningskorf (dekking, beugel, staven) kies je bij de
              staafeigenschappen onder het tabblad Norm; zonder korf wordt de
              staaf niet getoetst.
            </div>
            <div className="pk-samenvatting">
              {betonGeldig
                ? <>Keuze: <strong>{betonB}×{betonH} — {betonKlasse}</strong></>
                : "Vul een geldige doorsnede in."}
            </div>
          </div>
        </div>
      )}

      {soort === "eigen" && (
        <div className="pk-eigen">
          <label className="pk-veld pk-veld-inline">
            <span>Staalklasse</span>
            <select value={staalKlasse} onChange={(e) => setStaalKlasse(e.target.value)}>
              {STEEL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>

          {eigenDoorsneden.length === 0 ? (
            <p className="pk-hint">
              Er zijn nog geen eigen doorsneden bewaard. Maak er een in de
              profieleditor: samenstellen uit platen en profielen, of een gat in
              een catalogusprofiel.
            </p>
          ) : (
            <div className="pk-scroll">
              {eigenDoorsneden.map((d) => (
                <button
                  key={d.id}
                  className="pk-rij pk-rij-eigen"
                  onClick={() => kiesEigen(d)}
                  title="Deze doorsnede op de staaf zetten"
                >
                  <span className="pk-rij-naam">{d.naam}</span>
                  <span className="pk-rij-sub">
                    A = {nlGetal(d.eigenschappen.area_mm2, 0)} mm² · I_y ={" "}
                    {nlGetal(d.eigenschappen.iy_mm4 / 1e6, 2)}·10⁶ mm⁴
                  </span>
                </button>
              ))}
            </div>
          )}

          <button className="pk-knop" onClick={() => setEditorOpen(true)}>
            Profieleditor openen…
          </button>
          <div className="pk-hint">
            De editor opent in een eigen venster. Wat je daar bewaart of kiest
            landt met de staalklasse hierboven op de staaf.
          </div>

          {editorOpen && (
            <ProfielEditor
              open
              onClose={() => setEditorOpen(false)}
              onKies={kiesEigen}
              onOpslaan={kiesEigen}
            />
          )}
        </div>
      )}
      </div>

      <div className="pk-voet">
        {soort !== null && (
          <button className="pk-knop" onClick={() => setSoort(null)}>← Materiaal</button>
        )}
        <div className="pk-voet-rechts">
          <button className="pk-knop" onClick={onClose}>Annuleren</button>
          {soort !== null && soort !== "eigen" && (
            <button
              className="pk-knop pk-knop-primair"
              disabled={toepassenUit}
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
