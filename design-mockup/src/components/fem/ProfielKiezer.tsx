/**
 * ProfielKiezer — tweestaps profieldialoog voor een staaf.
 *
 * Stap 1: materiaalsoort (Staal / Hout / Beton / Aluminium / Overig —
 *         aluminium is zichtbaar maar eerlijk uitgeschakeld tot het bestaat).
 * Stap 2: het profiel BINNEN die soort, samen met de materiaalklasse:
 *         - staal: reeks (IPE/HEA/HEB/HEM/UNP/koker/buis) → maat → staalklasse;
 *         - hout: sterkteklasse (C/GL) → massief b×h, óf kruislaaghout als
 *           opbouw (voorinstelling of vrij: "CLT 40/20/40/20/40[:C16][b600]");
 *         - beton: betonklasse (C12/15 … C90/105) → doorsnede b×h; de
 *           wapeningskorf hoort bij de staafeigenschappen (tabblad Norm);
 *         - overig: een VRIJ materiaal — een doorsnede (rechthoek of een
 *           profiel uit de database) plus een naam, E, ρ en een toelaatbare
 *           spanning. Die staaf wordt niet aan een norm getoetst maar op de
 *           vergelijkspanning van von Mises (zie `spanningCheckBuilder.ts`).
 *           Er staan bewust GEEN standaardwaarden in de velden: een verzonnen
 *           E-modulus of toelaatbare spanning zou een uitkomst zonder invoer
 *           opleveren.
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
import { profileLookupKey } from "../../lib/steelCheckBuilder";
import { formatVrijMateriaal, parseVrijMateriaal } from "../../lib/vrijMateriaal";
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

/** Een combinatie die al ergens in het model staat, met het aantal staven. */
export interface ProfielInGebruik {
  material: string;
  profile: string;
  aantal: number;
}

/**
 * Wat er in het model al aan profielen staat, geteld per combinatie van
 * profiel en materiaal, in volgorde van staafnummer.
 *
 * Hier en niet bij de aanroeper, zodat elke aanroeper dezelfde telling krijgt
 * en er geen tweede manier van tellen ontstaat.
 */
export function profielenInGebruik(
  beams: Array<{ id: number; material?: string; profile?: string }>,
): ProfielInGebruik[] {
  const per = new Map<string, ProfielInGebruik>();
  for (const b of [...beams].sort((a, z) => a.id - z.id)) {
    const profile = b.profile ?? "";
    const material = b.material ?? "";
    if (!profile || !material) continue; // staaf zonder keuze telt niet mee
    const sleutel = `${profile}|${material}`;
    const bestaand = per.get(sleutel);
    if (bestaand) bestaand.aantal += 1;
    else per.set(sleutel, { material, profile, aantal: 1 });
  }
  return [...per.values()];
}

interface ProfielKiezerProps {
  open: boolean;
  onClose: () => void;
  /** Huidige waarden van de staaf — bepalen de startstap en voorselectie. */
  huidig?: Partial<ProfielKeuze>;
  onApply: (keuze: ProfielKeuze) => void;
  /**
   * Profielen die al in het project gebruikt worden. Staan bovenaan als
   * snelkeuze: in een raamwerk komt hetzelfde profiel meestal op meer dan één
   * staaf, en dan is opnieuw door de reeksen klikken verloren tijd.
   * Ontbreekt de lijst, dan valt het blok gewoon weg.
   */
  inGebruik?: ProfielInGebruik[];
}

type MateriaalSoort = "staal" | "eigen" | "hout" | "beton" | "aluminium" | "overig";

const SOORTEN: Array<{ id: MateriaalSoort; label: string; beschikbaar: boolean; hint: string }> = [
  { id: "staal", label: "Staal", beschikbaar: true, hint: "Walsprofielen uit de profieldatabase + staalklasse (EN 1993)" },
  { id: "eigen", label: "Eigen doorsnede", beschikbaar: true, hint: "Samenstellen uit platen en profielen, of een gat in een catalogusprofiel (staal, EN 1993)" },
  { id: "hout", label: "Hout", beschikbaar: true, hint: "Massief b×h of kruislaaghout (CLT) + sterkteklasse (EN 1995)" },
  { id: "beton", label: "Beton", beschikbaar: true, hint: "Rechthoekige doorsnede b×h + betonklasse (EN 1992); wapeningskorf bij de staafeigenschappen" },
  { id: "aluminium", label: "Aluminium", beschikbaar: false, hint: "Volgt later — nog geen profieldatabase en toetsing" },
  { id: "overig", label: "Overig", beschikbaar: true, hint: "Vrij materiaal: eigen naam, E, ρ en toelaatbare spanning; getoetst op de vergelijkspanning (von Mises), zonder norm" },
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

/** Tekstveld → getal; NaN wanneer het veld leeg of onzin is (geen terugval). */
function getalUit(tekst: string): number {
  const v = parseFloat(tekst.replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

export default function ProfielKiezer({ open, onClose, huidig, onApply, inGebruik }: ProfielKiezerProps) {
  const huidigVrij = parseVrijMateriaal(huidig?.material);
  const huidigIsBeton = !huidigVrij && matchSupportedConcreteClass(huidig?.material) !== null;
  const huidigIsHout =
    !huidigVrij && !huidigIsBeton && !!huidig?.material && (huidig.material in TIMBER_E_MEAN);
  const huidigIsClt = huidigIsHout && isCltProfiel(huidig?.profile);
  const huidigIsEigen =
    !huidigVrij && !huidigIsBeton && !huidigIsHout && isEigenProfiel(huidig?.profile);

  // ── Wizardstate ──────────────────────────────────────────────────────────
  const [soort, setSoort] = useState<MateriaalSoort | null>(
    huidig?.material
      ? huidigVrij ? "overig"
        : huidigIsBeton ? "beton"
        : huidigIsHout ? "hout"
        : huidigIsEigen ? "eigen"
        : "staal"
      : null,
  );

  // Eigen doorsnede: de bewaarde doorsneden staan hier in een lijst, en de
  // profieleditor opent in zijn eigen venster. Hij stond eerst ingebouwd in
  // deze dialoog, maar dan moet die dialoog meegroeien tot editorformaat —
  // precies de sprong in vensterafmeting die eruit moest.
  const eigenDoorsneden = useEigenDoorsneden((s) => s.items);
  // Escape sluit alleen het bovenste venster; dat regelt Modal zelf.
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

  // Overig-stap: doorsnede + vrij materiaal. De materiaalvelden beginnen LEEG
  // — er bestaat geen tabel om ze uit te vullen, en een verzonnen getal zou
  // een unity check opleveren die nergens op slaat.
  const huidigVrijRect = huidigVrij ? parseRechthoek(huidig?.profile) : null;
  const huidigVrijProfiel =
    huidigVrij && !huidigVrijRect && huidig?.profile && STEEL_SECTION_DIMS[profileLookupKey(huidig.profile)]
      ? profileLookupKey(huidig.profile)
      : "";
  const [overigVorm, setOverigVorm] = useState<"rechthoek" | "profiel">(
    huidigVrijProfiel ? "profiel" : "rechthoek",
  );
  const [overigB, setOverigB] = useState(huidigVrijRect?.b ?? 100);
  const [overigH, setOverigH] = useState(huidigVrijRect?.h ?? 300);
  const [overigProfiel, setOverigProfiel] = useState(huidigVrijProfiel);
  const [vrijNaam, setVrijNaam] = useState(huidigVrij?.naam ?? "");
  const [vrijE, setVrijE] = useState(huidigVrij ? String(huidigVrij.eMod) : "");
  const [vrijRho, setVrijRho] = useState(huidigVrij ? String(huidigVrij.dichtheid) : "");
  const [vrijF, setVrijF] = useState(huidigVrij ? String(huidigVrij.fToel) : "");
  const [vrijGamma, setVrijGamma] = useState(huidigVrij ? String(huidigVrij.gammaM) : "1");

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

  // ── Overig: doorsnede, materiaal en de afgeleide grootheden ─────────────
  const overigDims = overigVorm === "profiel" ? STEEL_SECTION_DIMS[overigProfiel] : undefined;
  const overigSectie = overigVorm === "profiel" ? STEEL_SECTIONS[overigProfiel] : undefined;
  const overigVorm2 = useMemo(
    () =>
      overigVorm === "profiel"
        ? shapeVanProfiel(overigProfiel)
        : overigB > 0 && overigH > 0
          ? ({ type: "rect", b: overigB, h: overigH } as const)
          : null,
    [overigVorm, overigProfiel, overigB, overigH],
  );
  const overigProfielnaam =
    overigVorm === "profiel" ? overigProfiel : `${overigB}x${overigH}`;
  const vrijMat = {
    naam: vrijNaam.trim(),
    eMod: getalUit(vrijE),
    dichtheid: getalUit(vrijRho),
    fToel: getalUit(vrijF),
    gammaM: vrijGamma.trim() === "" ? 1 : getalUit(vrijGamma),
  };
  const overigDoorsnedeGeldig =
    overigVorm === "profiel" ? !!overigDims : overigB > 0 && overigH > 0;
  const overigMateriaalGeldig =
    vrijMat.naam.length > 0 &&
    vrijMat.eMod > 0 &&
    vrijMat.dichtheid >= 0 &&
    vrijMat.fToel > 0 &&
    vrijMat.gammaM > 0;
  const overigGeldig = overigDoorsnedeGeldig && overigMateriaalGeldig;
  // A en I_y van de gekozen doorsnede — dezelfde getallen waarmee de solver
  // straks rekent (zie sectionResolver, bron "vrij").
  const overigA = overigSectie?.A ?? overigB * overigH;
  const overigI = overigSectie?.Iy ?? (overigB * overigH ** 3) / 12;

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
    } else if (soort === "overig" && overigGeldig) {
      // Het vrije materiaal reist als NAAM mee (zie vrijMateriaal.ts): zo
      // staat het in het projectbestand, de undo-historie en het rapport
      // zonder een tweede opslagplaats die uit de pas kan lopen.
      onApply({ material: formatVrijMateriaal(vrijMat), profile: overigProfielnaam });
      onClose();
    }
  };

  const toepassenUit =
    soort === "staal" ? !staalGeldig
    : soort === "hout" ? !houtGeldig
    : soort === "beton" ? !betonGeldig
    : soort === "overig" ? !overigGeldig
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
      {soort === null && inGebruik && inGebruik.length > 0 && (
        <div className="pk-gebruikt">
          <div className="pk-kolom-kop">In dit project</div>
          <div className="pk-gebruikt-rij">
            {inGebruik.map((g) => (
              <button
                key={`${g.profile}|${g.material}`}
                className="pk-gebruikt-knop"
                title={`${g.profile} in ${g.material}, nu op ${g.aantal} ${g.aantal === 1 ? "staaf" : "staven"}`}
                onClick={() => {
                  onApply({ material: g.material, profile: g.profile });
                  onClose();
                }}
              >
                <span className="pk-gebruikt-naam">{g.profile}</span>
                <span className="pk-rij-sub">{g.material} · {g.aantal}×</span>
              </button>
            ))}
          </div>
        </div>
      )}

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

      {soort === "overig" && (
        <div className="pk-stap2">
          <div className="pk-kolom pk-kolom-reeks">
            <div className="pk-kolom-kop">Doorsnede</div>
            <button
              className={`pk-rij${overigVorm === "rechthoek" ? " actief" : ""}`}
              onClick={() => setOverigVorm("rechthoek")}
            >
              Rechthoek <span className="pk-rij-sub">b × h</span>
            </button>
            <button
              className={`pk-rij${overigVorm === "profiel" ? " actief" : ""}`}
              onClick={() => setOverigVorm("profiel")}
            >
              Uit de database <span className="pk-rij-sub">IPE, HEA, koker, buis</span>
            </button>
            {overigVorm === "profiel" && (
              <>
                <div className="pk-kolom-kop">Reeks</div>
                <div className="pk-scroll">
                  {STAAL_REEKSEN.map((r) => (
                    <button
                      key={r.id}
                      className={`pk-rij${reeks === r.id ? " actief" : ""}`}
                      onClick={() => { setReeks(r.id); setOverigProfiel(""); }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="pk-kolom pk-kolom-maat">
            {overigVorm === "rechthoek" ? (
              <>
                <div className="pk-kolom-kop">Maten</div>
                <label className="pk-veld">
                  <span>Breedte b [mm]</span>
                  <input type="number" min={1} step={1} value={overigB}
                    onChange={(e) => setOverigB(Number(e.target.value))} />
                </label>
                <label className="pk-veld">
                  <span>Hoogte h [mm]</span>
                  <input type="number" min={1} step={1} value={overigH}
                    onChange={(e) => setOverigH(Number(e.target.value))} />
                </label>
              </>
            ) : (
              <>
                <div className="pk-kolom-kop">Profiel</div>
                <div className="pk-scroll">
                  {reeksProfielen.map((naam) => (
                    <button
                      key={naam}
                      className={`pk-rij${overigProfiel === naam ? " actief" : ""}`}
                      onClick={() => setOverigProfiel(naam)}
                    >
                      {naam}
                    </button>
                  ))}
                </div>
              </>
            )}
            {overigVorm2 && (
              <div className="pk-tekening">
                <ProfielMiniatuur
                  shape={overigVorm2}
                  titel={`Doorsnede ${overigProfielnaam}`}
                />
              </div>
            )}
          </div>

          <div className="pk-kolom pk-kolom-detail">
            <div className="pk-kolom-kop">Vrij materiaal</div>
            <label className="pk-veld">
              <span>Naam</span>
              <input type="text" value={vrijNaam} spellCheck={false}
                placeholder="bijv. Natuursteen"
                onChange={(e) => setVrijNaam(e.target.value)} />
            </label>
            <label className="pk-veld">
              <span>E-modulus [N/mm²]</span>
              <input type="number" min={1} step={100} value={vrijE}
                onChange={(e) => setVrijE(e.target.value)} />
            </label>
            <label className="pk-veld">
              <span>Volumieke massa ρ [kg/m³]</span>
              <input type="number" min={0} step={10} value={vrijRho}
                onChange={(e) => setVrijRho(e.target.value)} />
            </label>
            <label className="pk-veld">
              <span>Toelaatbare spanning f [N/mm²]</span>
              <input type="number" min={0} step={1} value={vrijF}
                onChange={(e) => setVrijF(e.target.value)} />
            </label>
            <label className="pk-veld">
              <span>Materiaalfactor γ_M [-]</span>
              <input type="number" min={0.1} step={0.05} value={vrijGamma}
                onChange={(e) => setVrijGamma(e.target.value)} />
            </label>
            <div className="pk-hint">
              Deze staaf wordt <strong>niet aan een norm</strong> getoetst, maar op de
              vergelijkspanning van von Mises:
              σ<sub>eq</sub> = √(σ<sub>x</sub>² + σ<sub>z</sub>² − σ<sub>x</sub>·σ<sub>z</sub>
              {" "}+ 3·τ²) ≤ f/γ<sub>M</sub>. Er is dus geen doorsnedeklassificatie en geen
              knik-, kip- of doorbuigingstoets. De velden hebben bewust geen
              standaardwaarden: vul de gegevens van je eigen materiaal in.
            </div>
            {overigDoorsnedeGeldig && (
              <div className="pk-eigenschappen">
                <div className="pk-eig-rij"><span>A</span><code>{nlGetal(overigA)} mm²</code></div>
                <div className="pk-eig-rij"><span>I_y</span><code>{nlGetal(overigI / 1e4)} cm⁴</code></div>
                {overigDims && (
                  <div className="pk-eig-rij"><span>h × b</span><code>{overigDims.h} × {overigDims.b} mm</code></div>
                )}
                {overigMateriaalGeldig && (
                  <div className="pk-eig-rij">
                    <span>f_d = f/γ_M</span>
                    <code>{nlGetal(vrijMat.fToel / vrijMat.gammaM, 2)} N/mm²</code>
                  </div>
                )}
              </div>
            )}
            <div className="pk-samenvatting">
              {overigGeldig
                ? <>Keuze: <strong>{overigProfielnaam} — {vrijMat.naam}</strong> (f = {nlGetal(vrijMat.fToel, 2)} N/mm²)</>
                : !overigDoorsnedeGeldig
                  ? "Kies of vul een geldige doorsnede in."
                  : "Vul naam, E, ρ en de toelaatbare spanning in."}
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
