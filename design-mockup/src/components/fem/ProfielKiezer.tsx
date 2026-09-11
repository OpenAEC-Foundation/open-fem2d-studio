/**
 * ProfielKiezer — tweestaps profieldialoog voor een staaf.
 *
 * Stap 1: materiaalsoort (Staal / Hout / Beton / Aluminium / Overig —
 *         aluminium is zichtbaar maar eerlijk uitgeschakeld tot het bestaat).
 * Stap 2: het profiel BINNEN die soort, samen met de materiaalklasse:
 *         - staal: reeks (IPE/HEA/HEB/HEM/UNP/koker/buis) → maat → staalklasse;
 *         - hout: sterkteklasse (C/GL) → massief b×h, óf kruislaaghout als
 *           opbouw. Die opbouw stel je samen in de rijeneditor, kies je uit de
 *           voorinstellingen of uit je eigen bewaarde opbouwen, of typ je als
 *           profielnaam. Grammatica van die naam, met de haakjes op de plek
 *           waar ze horen: "CLT 40[L][:C24]/20[D][:C16]/40 [b600]" — `L`/`D`
 *           (richting) en `:klasse` horen bij ÉÉN LAAG en mogen per laag
 *           verschillen; alleen `b…` geldt voor de hele strook. Een opbouw
 *           mag dus asymmetrisch zijn en per laag een eigen sterkteklasse
 *           hebben (zie `parseCltProfiel`);
 *         - beton: betonklasse (C12/15 … C90/105) → doorsnede b×h, plus de
 *           wapeningskorf en de milieuklasse. Die laatste twee staan hier
 *           én bij de staafeigenschappen, maar het zijn dezelfde velden
 *           (`KorfVelden`) die naar hetzelfde gegeven schrijven
 *           (`checkConfig.betonKorf`); zie de tekst bij die component;
 *         - overig: een VRIJ materiaal — een doorsnede (rechthoek of een
 *           profiel uit de database) plus een naam, E, ρ en een toelaatbare
 *           spanning. Die staaf wordt niet aan een norm getoetst maar op de
 *           vergelijkspanning van von Mises (zie `spanningCheckBuilder.ts`).
 *           Er staan bewust GEEN standaardwaarden in de velden: een verzonnen
 *           E-modulus of toelaatbare spanning zou een uitkomst zonder invoer
 *           opleveren.
 * Het resultaat is de COMBINATIE { material, profile } die op de staaf landt —
 * precies de twee velden die resolveSection en de toetsing al lezen — plus,
 * bij beton, de korf en de milieuklasse voor `checkConfig`.
 *
 * DE DEKKING PER ZIJDE reist mee in de KORF (`cover_top`, `cover_bottom`,
 * `cover_sides`) en niet als apart veld naast de korf. Dat is niet toevallig:
 * 4.4.1.1(1)P koppelt de dekking aan een betonoppervlak en (4.2) koppelt de
 * milieuklasse aan diezelfde dekking, dus de twee horen in één gegeven. Het
 * gevolg hier is dat de betonstap er niets extra's voor hoeft te doen —
 * `KorfVelden` toont de velden en `betonKorf` draagt ze naar `checkConfig`,
 * langs precies dezelfde weg als de beugelgegevens. Wat de stap er wél bij
 * toont is de tweede nuttige hoogte: met een eigen dekking boven en onder is
 * d aan de trekzijde boven niet meer h − d.
 */
import { useEffect, useMemo, useState } from "react";
import { STEEL_SECTION_DIMS } from "../../lib/steelSectionDims.generated";
import { STEEL_SECTIONS } from "../../lib/steelSections.generated";
import { SUPPORTED_TIMBER_GRADES, matchSupportedTimberGrade } from "../../lib/timberCheckBuilder";
import { STEEL_GRADES } from "./BarPropertiesDialog";
import {
  CONCRETE_E_CM,
  TIMBER_E_MEAN,
  parseRechthoek,
  resolveSection,
} from "../../lib/sectionResolver";
import { formatConcreteSection, parseConcreteSection } from "../../lib/betonCheckBuilder";
import type { ConcreteSectionInput } from "../../lib/types/concrete/ConcreteSectionInput";
import type { ConcreteShape } from "../../lib/types/concrete/ConcreteShape";
import type { ExposureClass } from "../../lib/types/concrete/ExposureClass";
import type { ExposureClassInfo } from "../../lib/types/concrete/ExposureClassInfo";
import type { ReinforcementCage } from "../../lib/types/concrete/ReinforcementCage";
import type { StructuralClass } from "../../lib/types/concrete/StructuralClass";
import KorfVelden from "../beton/KorfVelden";
import { haalMilieuklassen } from "../beton/betonKern";
import {
  STANDAARD_KORF,
  controleerKorf,
  dekkingIsRondomGelijk,
  korfSamenvatting,
  nuttigeHoogteBovenMm,
  nuttigeHoogteMm,
  rijOppervlakMm2,
  type Wapeningskorf,
} from "../beton/wapeningskorf";
import DoorsnedeTekening from "../beton/DoorsnedeTekening";
import {
  CLT_STROOKBREEDTE_MM,
  CLT_VOORINSTELLINGEN,
  cltHoogteMm,
  cltMechanica,
  cltOpbouwSleutel,
  cltVanVoorinstelling,
  formatCltProfiel,
  isCltProfiel,
  parseCltProfiel,
  richtingLabel,
  standaardRichting,
} from "../../lib/cltCheckBuilder";
import {
  SUPPORTED_CONCRETE_CLASSES,
  matchSupportedConcreteClass,
} from "../../lib/betonCheckBuilder";
import { profileLookupKey } from "../../lib/steelCheckBuilder";
import { formatVrijMateriaal, parseVrijMateriaal } from "../../lib/vrijMateriaal";
import type { CltPreset } from "../../lib/types/timber/CltPreset";
import type { CltLayer } from "../../lib/types/timber/CltLayer";
import type { CltLayerOrientation } from "../../lib/types/timber/CltLayerOrientation";
import type { CltLayup } from "../../lib/types/timber/CltLayup";
import type { EigenDoorsnede } from "../../lib/profieleditor/types";
import {
  isEigenProfiel,
  profielnaamVan,
} from "../../lib/profieleditor/eigenDoorsnedenStore";
import { useEigenDoorsneden } from "../../lib/profieleditor/useEigenDoorsneden";
import { useCltOpbouwen } from "../../lib/profieleditor/useCltOpbouwen";
import { nieuwId } from "../../lib/profieleditor/id";
import {
  REEKSEN,
  profielLabel,
  profielenVanReeks,
  reeksVanProfiel,
} from "../../lib/profieleditor/catalogus";
import ProfielEditor from "../profieleditor/ProfielEditor";
import Modal from "../Modal";
import CltOpbouwTekening, { CLT_THEMA_KLEUREN } from "../clt/CltOpbouwTekening";
import ProfielMiniatuur from "../shared/ProfielMiniatuur";
import { shapeVanProfiel } from "../shared/profielVorm";
import "./ProfielKiezer.css";
// Klik op een rijlabel in de doorsnedetekening → aantal en diameter invullen,
// dezelfde invoer als in het betonvenster.
import RijBewerker from "../beton/RijBewerker";

/**
 * De betonkant van de keuze: de wapeningskorf en de duurzaamheidsgegevens.
 *
 * Reist apart van `material`/`profile` mee omdat hij niet op de staaf zelf
 * landt maar in `checkConfig`; de aanroeper voegt hem daar samen met de
 * overige toetsinstellingen van díe staaf, zodat kniklengtes en kipsteunen
 * blijven staan.
 */
export interface BetonKorfKeuze {
  korf: ReinforcementCage;
  /** Milieuklasse van tabel 4.1; `null` = niet gekozen, dus niet getoetst. */
  milieuklasse: ExposureClass | null;
  /** Constructieklasse; `null` = S4 (nationale bijlage, 50 jaar). */
  constructieklasse: StructuralClass | null;
}

export interface ProfielKeuze {
  material: string;
  profile: string;
  /** Alleen gevuld wanneer de gekozen soort beton is. */
  beton?: BetonKorfKeuze;
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
  /**
   * De korf en de milieuklasse die al op de staaf staan. Ontbreken ze, dan
   * begint de betonstap met [`STANDAARD_KORF`] — maar ZONDER milieuklasse,
   * want die kan de app niet raden.
   */
  huidigBeton?: Partial<BetonKorfKeuze>;
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
  { id: "beton", label: "Beton", beschikbaar: true, hint: "Rechthoek, T- of L-ligger + betonklasse (EN 1992); wapeningskorf bij de staafeigenschappen" },
  { id: "aluminium", label: "Aluminium", beschikbaar: false, hint: "Volgt later — nog geen profieldatabase en toetsing" },
  { id: "overig", label: "Overig", beschikbaar: true, hint: "Vrij materiaal: eigen naam, E, ρ en toelaatbare spanning; getoetst op de vergelijkspanning (von Mises), zonder norm" },
];

/**
 * Reeks-indeling van de staaldatabase: dezelfde lijst als de profieleditor
 * (`lib/profieleditor/catalogus.ts`), zodat een reeks die daar bijkomt — UPE,
 * de oude Differdinger reeksen, INP — hier niet vergeten kan worden. Deze
 * dialoog had eerder een eigen, kortere lijst en liet daardoor UPE en de
 * oude reeksen niet zien terwijl ze wel in de database zaten.
 */
const STAAL_REEKSEN = REEKSEN;

/**
 * Vaste maat van het venster, gelijk voor élke stap.
 *
 * De dialoog groeide en kromp eerder mee met zijn inhoud: de materiaalkeuze
 * was laag, de staalstap hoger, de CLT-stap hoger nog, en de eigen doorsnede
 * maakte hem tweemaal zo breed. Bij elke stap sprong het venster onder de
 * muis weg. Nu ligt de maat vast en schuift alleen de inhoud, zodat knoppen
 * op hun plek blijven staan.
 */
// Sinds de betonstap er de wapeningskorf en de milieuklasse bij kreeg, staan
// er in die stap drie kolommen naast elkaar en past 720 niet meer. De maat
// blijft voor élke stap dezelfde — dát was de afspraak, niet het getal.
const VENSTER_BREEDTE = 880;
const VENSTER_HOOGTE = 600;

const HOUT_DOORSNEDE_DEFAULT = { b: 71, h: 171 };
const BETON_DOORSNEDE_DEFAULT = { b: 300, h: 500, bw: 300, hf: 200 };
/** Startopbouw voor kruislaaghout: de gangbare 5-laags 160. */
const CLT_PRESET_DEFAULT: CltPreset =
  CLT_VOORINSTELLINGEN.find((p) => p.name === "5-laags 160") ?? CLT_VOORINSTELLINGEN[0];
/**
 * Minder dan drie lagen is geen kruislaaghout: `parseCltProfiel` weigert zo'n
 * naam. De rijeneditor mag dus niet onder dit aantal komen — anders maakt hij
 * zijn eigen invoer onleesbaar.
 */
const CLT_MIN_LAGEN = 3;
/**
 * Voorvoegsel waarmee een eigen opbouw zich in de keuzelijst onderscheidt van
 * een voorinstelling. Alleen een `<option value>`; er komt niets van in de
 * profielnaam of in het model terecht.
 */
const EIGEN_OPBOUW_WAARDE = "eigen:";

function nlGetal(v: number, decimalen = 0): string {
  return v.toLocaleString("nl-NL", { maximumFractionDigits: decimalen });
}

/**
 * Waaróm een ingetypte CLT-opbouw niet leesbaar is — in plaats van een halve
 * tekening.
 *
 * `parseCltProfiel` blijft de rechter: dit wordt alleen aangeroepen wanneer die
 * al null heeft gezegd, en zoekt dan de eerste plek waar het misgaat, zodat de
 * melding naar díe plek wijst en niet naar "ongeldig".
 */
function cltOpbouwReden(tekst: string): string {
  const t = tekst.trim();
  if (!t) return "Nog geen opbouw ingevuld.";
  if (!/^clt\b/i.test(t)) return 'Begin met "CLT", bijvoorbeeld CLT 40/20/40.';
  const [lagen = "", ...rest] = t.replace(/^clt\s*/i, "").split(/\s+/);
  const tokens = lagen ? lagen.split("/") : [];
  if (tokens.length < 3) return "Een opbouw heeft minstens drie lagen, bijvoorbeeld 40/20/40.";
  // Een lege plek tussen twee schuine strepen is de gewone tussenstand tijdens
  // het typen; die verdient een eigen zin in plaats van een leeg citaat.
  if (tokens.some((x) => x.trim() === "")) return "Er staat nog een lege laag in de rij.";
  const fout = tokens.find((x) => !/^\d+(?:[.,]\d+)?[LD]?(?::[A-Za-z]+\d+[A-Za-z]*)?$/i.test(x));
  if (fout !== undefined) {
    return `"${fout}" is geen laag: een dikte in mm, eventueel met L of D en een klasse (40L:C24).`;
  }
  if (rest.length > 0) {
    return "Achter de lagen past alleen een strookbreedte, bijvoorbeeld b=600.";
  }
  return "De opbouw is niet te lezen; zie de notatie hierboven.";
}

/** Tekstveld → getal; NaN wanneer het veld leeg of onzin is (geen terugval). */
function getalUit(tekst: string): number {
  const v = parseFloat(tekst.replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

export default function ProfielKiezer({
  open,
  onClose,
  huidig,
  huidigBeton,
  onApply,
  inGebruik,
}: ProfielKiezerProps) {
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
  const eersteReeks = (huidig?.profile ? reeksVanProfiel(huidig.profile) : null) ?? "HEA";
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

  // Beton-stap. De doorsnede wordt uit de HUIDIGE profielnaam gelezen met
  // dezelfde parser als de toetsing, zodat een T die er al stond niet bij het
  // heropenen van de kiezer stilzwijgend een rechthoek wordt.
  const huidigBetonProfiel = huidigIsBeton ? parseConcreteSection(huidig?.profile) : null;
  const huidigBetonD = huidigBetonProfiel?.ok ? huidigBetonProfiel.doorsnede : null;
  const [betonKlasse, setBetonKlasse] = useState(huidigIsBeton ? huidig!.material! : "C30/37");
  const [betonShapeKeuze, setBetonShapeKeuze] = useState<ConcreteShape>(
    huidigBetonD?.shape ?? "Rectangle",
  );
  const [betonB, setBetonB] = useState(huidigBetonD?.b_mm ?? BETON_DOORSNEDE_DEFAULT.b);
  const [betonH, setBetonH] = useState(huidigBetonD?.h_mm ?? BETON_DOORSNEDE_DEFAULT.h);
  const [betonBw, setBetonBw] = useState(huidigBetonD?.b_w_mm ?? BETON_DOORSNEDE_DEFAULT.bw);
  const [betonHf, setBetonHf] = useState(huidigBetonD?.h_f_mm ?? BETON_DOORSNEDE_DEFAULT.hf);
  const [betonFlensOnder, setBetonFlensOnder] = useState(
    huidigBetonD?.flange_at_bottom ?? false,
  );
  // De wapeningskorf en de duurzaamheidsgegevens. Dezelfde velden als bij de
  // staafeigenschappen (`KorfVelden`), en ze schrijven naar hetzelfde gegeven.
  const [betonKorf, setBetonKorf] = useState<ReinforcementCage>(
    huidigBeton?.korf ?? STANDAARD_KORF.korf,
  );
  /** Welke rij van de korf staat open in de rij-invoer onder de tekening. */
  const [betonBewerkRij, setBetonBewerkRij] = useState<"top" | "bottom" | null>(null);
  const [betonMilieuklasse, setBetonMilieuklasse] = useState<ExposureClass | null>(
    huidigBeton?.milieuklasse ?? null,
  );
  const [betonConstructieklasse, setBetonConstructieklasse] =
    useState<StructuralClass | null>(huidigBeton?.constructieklasse ?? null);
  // Tabel 4.1 komt uit de kern; zonder kern blijven de aanduidingen over.
  const [milieuklassen, setMilieuklassen] = useState<ExposureClassInfo[] | undefined>(
    undefined,
  );
  useEffect(() => {
    let actief = true;
    haalMilieuklassen()
      .then((m) => actief && setMilieuklassen(m))
      .catch(() => undefined);
    return () => {
      actief = false;
    };
  }, []);

  const betonHeeftFlens = betonShapeKeuze !== "Rectangle";
  /** De doorsnede zoals de kern hem verwacht — een beschrijving, geen tweede. */
  const betonDoorsnede: ConcreteSectionInput = {
    shape: betonShapeKeuze,
    b_mm: betonB,
    h_mm: betonH,
    b_w_mm: betonHeeftFlens ? betonBw : null,
    h_f_mm: betonHeeftFlens ? betonHf : null,
    flange_at_bottom: betonHeeftFlens ? betonFlensOnder : false,
  };

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

  // Op maat gesorteerd, met de decimaal erin: "DIN 42.5" hoort tussen 40 en 45.
  const reeksProfielen = useMemo(() => profielenVanReeks(reeks), [reeks]);

  const dims = staalProfiel ? STEEL_SECTION_DIMS[staalProfiel] : undefined;
  const sectie = staalProfiel ? STEEL_SECTIONS[staalProfiel] : undefined;
  const staalVorm = useMemo(() => shapeVanProfiel(staalProfiel), [staalProfiel]);
  const houtVorm = useMemo(
    () => (houtB > 0 && houtH > 0 ? ({ type: "rect", b: houtB, h: houtH } as const) : null),
    [houtB, houtH],
  );
  // De tekening en de solvergrootheden komen allebei uit dezelfde doorsnede
  // die straks het verzoek in gaat; A en I zijn dus letterlijk die waarmee de
  // solver rekent (sectionResolver, bron "beton-bxh" of "beton-vorm").
  const betonNaam = formatConcreteSection(betonDoorsnede);
  const betonSectie = useMemo(
    () => resolveSection(betonKlasse, betonNaam),
    [betonKlasse, betonNaam],
  );

  // CLT: de tekst geparsed met de gekozen klasse als standaard voor lagen
  // zonder eigen klasse; de solvergrootheden erbij, zodat de kiezer laat zien
  // wat de opbouw stijfheidstechnisch waard is.
  const cltLayup = useMemo(() => parseCltProfiel(cltTekst, houtKlasse), [cltTekst, houtKlasse]);
  const cltGeldig = !!cltLayup && cltLayup.layers.some((l) => l.orientation === "Longitudinal");
  // Zwaartelijn en (EI)_ef in één keer: `cltMechanica` is de bron van beide, en
  // de zwaartelijn hoort in de tekening — bij een niet-symmetrische opbouw ligt
  // die niet op halve hoogte.
  const cltMech = useMemo(
    () => (cltLayup ? cltMechanica(cltLayup, (k) => TIMBER_E_MEAN[k]) : null),
    [cltLayup],
  );
  const cltBreedte = cltLayup?.width_mm ?? CLT_STROOKBREEDTE_MM;

  /**
   * De opbouw op het scherm zetten.
   *
   * De TEKST blijft de enige bron van waarheid: de rijeneditor is een lezing
   * van `cltLayup`, en `cltLayup` is een lezing van `cltTekst`. Elke bewerking
   * — rijen én voorinstellingen — schrijft daarom terug naar de tekst, en de
   * rijen volgen vanzelf. Zo kunnen de twee invoerwijzen niet uit de pas
   * lopen: er is er maar één.
   */
  const zetCltLayup = (layup: CltLayup, klasse: string = houtKlasse) => {
    setCltTekst(formatCltProfiel(layup, klasse));
  };
  /**
   * Een complete opbouw kiezen (voorinstelling of bewaarde opbouw).
   *
   * Heeft die opbouw één sterkteklasse voor alle lagen, dan wordt dát ook de
   * sterkteklasse van de staaf. Anders staat de staaf op C24 terwijl de opbouw
   * uit C18 bestaat, en schrijft de naam bij élke laag ":C18" — twee verhalen
   * over hetzelfde hout. Bij een opbouw met gemengde klassen blijft de klasse
   * van de staaf staan; die is dan alleen nog de terugval voor lagen zonder
   * eigen klasse.
   */
  const kiesCltLayup = (layup: CltLayup) => {
    const klassen = [...new Set(layup.layers.map((l) => l.strength_class))];
    const enige = klassen.length === 1 ? matchSupportedTimberGrade(klassen[0]) : null;
    const klasse = enige ?? houtKlasse;
    if (klasse !== houtKlasse) setHoutKlasse(klasse);
    zetCltLayup(layup, klasse);
  };
  const zetCltBreedte = (breedte: number) => {
    if (!cltLayup || !(breedte > 0)) return;
    zetCltLayup({ ...cltLayup, width_mm: breedte });
  };

  // ── Rijeneditor: één laag per rij ────────────────────────────────────────
  // Elke bewerking maakt een nieuwe opbouw en schrijft die als tekst terug.
  const wijzigCltLaag = (index: number, wijziging: Partial<CltLayer>) => {
    if (!cltLayup) return;
    zetCltLayup({
      ...cltLayup,
      layers: cltLayup.layers.map((l, i) => (i === index ? { ...l, ...wijziging } : l)),
    });
  };
  const voegCltLaagToe = () => {
    if (!cltLayup) return;
    // De nieuwe laag erft dikte en klasse van de onderste laag en krijgt de
    // richting die op zijn plaats hoort (afwisselend); dat is bijna altijd wat
    // je wilt en anders één klik verder aan te passen.
    const onderste = cltLayup.layers[cltLayup.layers.length - 1];
    zetCltLayup({
      ...cltLayup,
      layers: [
        ...cltLayup.layers,
        {
          thickness_mm: onderste.thickness_mm,
          orientation: standaardRichting(cltLayup.layers.length),
          strength_class: onderste.strength_class,
        },
      ],
    });
  };
  const verwijderCltLaag = (index: number) => {
    // Onder de drie lagen is het geen kruislaaghout meer en weigert
    // `parseCltProfiel` de naam; dan zou de editor zichzelf onleesbaar maken.
    if (!cltLayup || cltLayup.layers.length <= CLT_MIN_LAGEN) return;
    zetCltLayup({ ...cltLayup, layers: cltLayup.layers.filter((_, i) => i !== index) });
  };
  const verplaatsCltLaag = (van: number, naar: number) => {
    if (!cltLayup || van === naar) return;
    if (naar < 0 || naar >= cltLayup.layers.length) return;
    const layers = [...cltLayup.layers];
    const [laag] = layers.splice(van, 1);
    layers.splice(naar, 0, laag);
    zetCltLayup({ ...cltLayup, layers });
  };
  /** Rij die op dit moment versleept wordt; null = er wordt niet gesleept. */
  const [cltSleepIndex, setCltSleepIndex] = useState<number | null>(null);

  // ── Eigen opbouwen: de bibliotheek van de gebruiker ──────────────────────
  const cltOpbouwen = useCltOpbouwen((s) => s.items);
  const bewaarCltOpbouw = useCltOpbouwen((s) => s.bewaar);
  const verwijderCltOpbouw = useCltOpbouwen((s) => s.verwijder);
  const [cltNieuweNaam, setCltNieuweNaam] = useState("");
  // Twee opbouwen zijn dezelfde opbouw wanneer hun canonieke sleutel gelijk
  // is — dikte, richting, klasse én strookbreedte, niet alleen de dikten.
  const cltSleutel = useMemo(() => (cltLayup ? cltOpbouwSleutel(cltLayup) : null), [cltLayup]);
  /** De bewaarde opbouw die exact op het scherm staat — of geen. */
  const cltBewaardAls = useMemo(
    () =>
      cltSleutel === null
        ? undefined
        : cltOpbouwen.find((o) => cltOpbouwSleutel(o.layup) === cltSleutel),
    [cltSleutel, cltOpbouwen],
  );
  const cltNaamBestaat = cltOpbouwen.some(
    (o) => o.naam.toLowerCase() === cltNieuweNaam.trim().toLowerCase(),
  );
  const bewaarHuidigeCltOpbouw = () => {
    const naam = cltNieuweNaam.trim();
    if (!naam || !cltLayup || !cltGeldig) return;
    // Bestaat de naam al, dan houdt de opbouw zijn id en zijn oorspronkelijke
    // schrijfwijze: dit is een wijziging van dezelfde bibliotheekregel en geen
    // tweede regel die er bijna hetzelfde uitziet.
    const bestaand = cltOpbouwen.find((o) => o.naam.toLowerCase() === naam.toLowerCase());
    bewaarCltOpbouw({
      id: bestaand?.id ?? nieuwId(),
      naam: bestaand?.naam ?? naam,
      layup: cltLayup,
      bewaardOp: new Date().toISOString(),
    });
    setCltNieuweNaam("");
  };

  /**
   * Welke voorinstelling bij de huidige opbouw hoort — of geen (vrij).
   *
   * Vergelijkt de HELE opbouw en niet alleen de laagdikten. Op de dikten
   * alleen werd "CLT 40D/20L/40D" als "3-laags 120" aangewezen, en één klik in
   * de keuzelijst gooide dan richting én per-laag klassen weg zonder dat er
   * iets over veranderde.
   */
  const actieveVoorinstelling =
    cltSleutel === null
      ? ""
      : CLT_VOORINSTELLINGEN.find(
          (p) => cltOpbouwSleutel(cltVanVoorinstelling(p, houtKlasse, cltBreedte)) === cltSleutel,
        )?.name ?? "";
  /**
   * Wat er in de keuzelijst geselecteerd staat: een voorinstelling op naam,
   * een eigen opbouw als `EIGEN_OPBOUW_WAARDE + id`, of niets (vrij).
   */
  const cltKeuzeWaarde =
    actieveVoorinstelling !== ""
      ? actieveVoorinstelling
      : cltBewaardAls
        ? `${EIGEN_OPBOUW_WAARDE}${cltBewaardAls.id}`
        : "";
  const kiesUitCltLijst = (waarde: string) => {
    if (waarde.startsWith(EIGEN_OPBOUW_WAARDE)) {
      const o = cltOpbouwen.find((x) => x.id === waarde.slice(EIGEN_OPBOUW_WAARDE.length));
      if (o) kiesCltLayup(o.layup);
      return;
    }
    const p = CLT_VOORINSTELLINGEN.find((x) => x.name === waarde);
    // De strookbreedte hoort bij de plaat en niet bij de voorinstelling, dus
    // die blijft staan als je van opbouw wisselt.
    if (p) kiesCltLayup(cltVanVoorinstelling(p, houtKlasse, cltBreedte));
  };

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
  const betonDoorsnedeGeldig =
    betonB > 0 &&
    betonH > 0 &&
    (!betonHeeftFlens ||
      (betonBw > 0 && betonHf > 0 && betonBw < betonB && betonHf < betonH));
  /**
   * De korf zoals de controle én de tekening hem zien: één object, zodat er
   * geen tweede plaats is waar de doorsnede of de staven anders kunnen
   * uitpakken. De velden die deze stap niet kent — staalsoort, aantal stroken,
   * staaltak — komen uit [`STANDAARD_KORF`]; die spelen in de meetkunde en in
   * `controleerKorf` geen rol en reizen pas bij het toetsen mee.
   */
  const betonKorfGeheel: Wapeningskorf = useMemo(
    () => ({
      ...STANDAARD_KORF,
      doorsnede: betonDoorsnede,
      betonklasse: betonKlasse,
      korf: betonKorf,
    }),
    // betonDoorsnede is elke render een nieuw object; betonNaam is de
    // tekstvorm ervan en verandert precies wanneer de doorsnede verandert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [betonNaam, betonKlasse, betonKorf],
  );
  /**
   * De korf langs dezelfde controle als het korfpaneel en de rekenkern — zo
   * krijgt de gebruiker de reden hier te zien in plaats van bij het toetsen.
   * `null` = in orde.
   */
  const betonKorfFout = useMemo(
    () => (betonDoorsnedeGeldig ? controleerKorf(betonKorfGeheel) : null),
    [betonDoorsnedeGeldig, betonKorfGeheel],
  );
  // Een korf die niet past wordt niet toegepast: de rekenkern zou hem toch
  // weigeren, en dan komt de melding pas bij het toetsen — ver van de plaats
  // waar je hem kunt verhelpen.
  const betonGeldig = betonDoorsnedeGeldig && betonKorfFout === null;
  const aOnder = rijOppervlakMm2(betonKorf.bottom);
  const aBoven = rijOppervlakMm2(betonKorf.top);
  // Twee nuttige hoogtes, want er zijn twee trekzijden en sinds de dekking per
  // betonoppervlak mag verschillen (4.4.1.1(1)P) zijn het ook twee
  // verschillende getallen. Bij één dekking rondom is d' gewoon h − d en
  // vertelt de tweede regel niets nieuws; bij een vloer met de bovenzijde
  // binnen en de onderzijde buiten is het verschil precies waar het om gaat,
  // en dan moet je het hier zien staan en niet pas in het rapport.
  const betonNuttigeHoogte = nuttigeHoogteMm(betonKorf, betonH);
  const betonNuttigeHoogteBoven = nuttigeHoogteBovenMm(betonKorf, betonH);
  const betonDekkingRondomGelijk = dekkingIsRondomGelijk(betonKorf);

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
      onApply({
        material: betonKlasse,
        profile: betonNaam,
        beton: {
          korf: betonKorf,
          milieuklasse: betonMilieuklasse,
          constructieklasse: betonConstructieklasse,
        },
      });
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
      {/* De materiaalkeuze is één lopende lijst en mag als geheel schuiven;
          de stappen daarna hebben kolommen die elk hun eigen kop houden. */}
      {soort === null && (
        <div className="pk-start">
      {inGebruik && inGebruik.length > 0 && (
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
                  {profielLabel(naam)}
                </button>
              ))}
            </div>
          </div>
          <div className="pk-kolom pk-kolom-detail">
            <div className="pk-kolom-kop">Materiaalklasse</div>
            <div className="pk-kolom-body">
            <select value={staalKlasse} onChange={(e) => setStaalKlasse(e.target.value)}>
              {STEEL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {/* Tekening van het gekozen profiel — zelfde contourwiskunde als
                het rapport (mét walsuitrondingen), compact en thema-volgend. */}
            {staalVorm && (
              <div className="pk-tekening">
                <ProfielMiniatuur
                  shape={staalVorm}
                  materiaal="staal"
                  titel={`Doorsnede ${staalProfiel}`}
                />
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
            </div>
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
              <div className="pk-kolom-body">
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
                  <ProfielMiniatuur
                    shape={houtVorm}
                    materiaal="hout"
                    titel={`Doorsnede ${houtB}×${houtH} mm`}
                  />
                </div>
              )}
              {houtGeldig && (
                <div className="pk-eigenschappen">
                  <div className="pk-eig-rij"><span>A</span><code>{nlGetal(houtB * houtH)} mm²</code></div>
                  <div className="pk-eig-rij"><span>I_y</span><code>{nlGetal(houtB * houtH ** 3 / 12 / 1e4)} cm⁴</code></div>
                  <div className="pk-eig-rij"><span>E₀,mean</span><code>{TIMBER_E_MEAN[houtKlasse] ?? "—"} N/mm²</code></div>
                </div>
              )}
              </div>
              <div className="pk-samenvatting">
                {houtGeldig
                  ? <>Keuze: <strong>{houtB}×{houtH} — {houtKlasse}</strong></>
                  : "Vul een geldige doorsnede in."}
              </div>
            </div>
          )}

          {houtType === "clt" && (
            <>
            {/* Kolom 1 — de opbouw SAMENSTELLEN. De rijeneditor en het
                tekstveld zijn twee vensters op dezelfde opbouw: de tekst is de
                bron, de rijen zijn de lezing ervan, en elke rijbewerking
                schrijft de tekst terug. Ze kunnen dus niet uit elkaar lopen. */}
            <div className="pk-kolom pk-kolom-detail pk-kolom-clt">
              <div className="pk-kolom-kop">Opbouw</div>
              <div className="pk-kolom-body">
              <label className="pk-veld">
                <span>Kies een opbouw</span>
                <select value={cltKeuzeWaarde} onChange={(e) => kiesUitCltLijst(e.target.value)}>
                  <option value="">— vrij —</option>
                  {cltOpbouwen.length > 0 && (
                    <optgroup label="Eigen opbouwen">
                      {cltOpbouwen.map((o) => (
                        <option key={o.id} value={`${EIGEN_OPBOUW_WAARDE}${o.id}`}>
                          {o.naam} ({o.layup.layers.map((l) => l.thickness_mm).join("/")})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Voorinstellingen">
                    {CLT_VOORINSTELLINGEN.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({p.thicknesses_mm.join("/")})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label className="pk-veld">
                <span>Strookbreedte b [mm]</span>
                <input type="number" min={10} step={10} value={cltBreedte}
                  onChange={(e) => zetCltBreedte(Number(e.target.value))} />
              </label>

              <div className="pk-kolom-kop">Lagen (boven → beneden)</div>
              {cltLayup ? (
                <div className="pk-clt-rijen">
                  {cltLayup.layers.map((l, i) => (
                    <div
                      key={i}
                      className={`pk-clt-rij${cltSleepIndex === i ? " pk-clt-rij-sleept" : ""}`}
                      // Alleen een drop toestaan wanneer er ook echt een rij
                      // gesleept wordt; anders vangt de rij ook bestanden van
                      // buiten de app op.
                      onDragOver={(e) => { if (cltSleepIndex !== null) e.preventDefault(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (cltSleepIndex !== null) verplaatsCltLaag(cltSleepIndex, i);
                        setCltSleepIndex(null);
                      }}
                    >
                      {/* De greep is het enige dat sleept; zat `draggable` op de
                          hele rij, dan kon je geen tekst meer selecteren in het
                          diktevak. */}
                      <span
                        className="pk-clt-greep"
                        draggable
                        title="Versleep om de laag te verplaatsen"
                        onDragStart={() => setCltSleepIndex(i)}
                        onDragEnd={() => setCltSleepIndex(null)}
                      >
                        ⠿
                      </span>
                      <span className="pk-clt-nr">{i + 1}</span>
                      <input
                        className="pk-clt-dikte"
                        type="number"
                        min={1}
                        step={5}
                        value={l.thickness_mm}
                        title="Laagdikte in mm"
                        // Een dikte van 0 of leeg maakt de opbouw onleesbaar en
                        // laat de rijen verdwijnen terwijl je aan het typen
                        // bent; zo'n tussenstand nemen we niet over.
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0) wijzigCltLaag(i, { thickness_mm: v });
                        }}
                      />
                      <select
                        className="pk-clt-richting"
                        value={l.orientation}
                        title="Vezelrichting: lengte draagt in de spanrichting, dwars niet"
                        onChange={(e) =>
                          wijzigCltLaag(i, { orientation: e.target.value as CltLayerOrientation })
                        }
                      >
                        <option value="Longitudinal">{richtingLabel("Longitudinal")}</option>
                        <option value="Transverse">{richtingLabel("Transverse")}</option>
                      </select>
                      <select
                        className="pk-clt-klasse"
                        value={l.strength_class}
                        title="Sterkteklasse van de lamellen in deze laag"
                        onChange={(e) => wijzigCltLaag(i, { strength_class: e.target.value })}
                      >
                        {SUPPORTED_TIMBER_GRADES.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                        {/* Een klasse die uit het tekstveld komt en niet in de
                            lijst staat mag niet stil in een andere veranderen:
                            hij blijft zichtbaar, met de reden erbij. */}
                        {matchSupportedTimberGrade(l.strength_class) === null && (
                          <option value={l.strength_class}>{l.strength_class} (onbekend)</option>
                        )}
                      </select>
                      <button
                        className="pk-clt-knopje"
                        title="Laag omhoog"
                        disabled={i === 0}
                        onClick={() => verplaatsCltLaag(i, i - 1)}
                      >↑</button>
                      <button
                        className="pk-clt-knopje"
                        title="Laag omlaag"
                        disabled={i === cltLayup.layers.length - 1}
                        onClick={() => verplaatsCltLaag(i, i + 1)}
                      >↓</button>
                      <button
                        className="pk-clt-knopje"
                        title={
                          cltLayup.layers.length <= CLT_MIN_LAGEN
                            ? `Een opbouw heeft minstens ${CLT_MIN_LAGEN} lagen`
                            : "Laag verwijderen"
                        }
                        disabled={cltLayup.layers.length <= CLT_MIN_LAGEN}
                        onClick={() => verwijderCltLaag(i)}
                      >×</button>
                    </div>
                  ))}
                  <button className="pk-knop pk-knop-klein" onClick={voegCltLaagToe}>
                    + Laag onderaan
                  </button>
                </div>
              ) : (
                <div className="pk-clt-rijen-leeg">{cltOpbouwReden(cltTekst)}</div>
              )}

              <label className="pk-veld">
                <span>Als profielnaam</span>
                <input
                  type="text"
                  value={cltTekst}
                  onChange={(e) => setCltTekst(e.target.value)}
                  placeholder="CLT 40/20/40/20/40"
                  spellCheck={false}
                />
              </label>
              <div className="pk-hint">
                Dit is de naam die op de staaf landt, en tegelijk het snelle
                invoerveld: wat je hier typt verschijnt hierboven als rijen.
                Dikten in mm, gescheiden door "/", van boven naar beneden. Lagen
                wisselen lengte/dwars af, beginnend met een lengtelaag; per laag
                mag je daarvan afwijken met <code>L</code> of <code>D</code> en
                met een eigen klasse — <code>40L:C24/20D:C16/40L</code>. Alleen
                de strookbreedte (<code>b600</code>) geldt voor de hele plaat.
              </div>

              <div className="pk-kolom-kop">Eigen opbouwen</div>
              {cltBewaardAls ? (
                <div className="pk-clt-bewaard">
                  <span>In je bibliotheek als <strong>{cltBewaardAls.naam}</strong></span>
                  <button
                    className="pk-knop pk-knop-klein"
                    title="Uit de bibliotheek halen; de staaf en de opbouw op dit scherm veranderen er niet van"
                    onClick={() => verwijderCltOpbouw(cltBewaardAls.id)}
                  >
                    Verwijderen
                  </button>
                </div>
              ) : (
                <div className="pk-clt-bewaren">
                  <input
                    type="text"
                    value={cltNieuweNaam}
                    placeholder="Naam, bijv. Vloer begane grond"
                    onChange={(e) => setCltNieuweNaam(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); bewaarHuidigeCltOpbouw(); }
                    }}
                  />
                  <button
                    className="pk-knop pk-knop-klein"
                    disabled={!cltGeldig || cltNieuweNaam.trim() === ""}
                    onClick={bewaarHuidigeCltOpbouw}
                  >
                    {cltNaamBestaat ? "Overschrijven" : "Bewaren"}
                  </button>
                </div>
              )}
              <div className="pk-hint">
                Een bewaarde opbouw staat in de keuzelijst bovenaan, blijft over
                projecten heen bestaan en reist mee in het projectbestand. De
                staaf krijgt de OPBOUW als profielnaam en niet de naam uit je
                bibliotheek: een project rekent dus ook door op een machine die
                deze bibliotheek niet kent.
              </div>
              </div>
            </div>

            {/* Kolom 2 — wat die opbouw is. */}
            <div className="pk-kolom pk-kolom-detail">
              <div className="pk-kolom-kop">Doorsnede</div>
              <div className="pk-kolom-body">
              {/* De opbouw als tekening — bij kruislaaghout bepaalt de
                  laagrichting het gedrag, en dat lees je niet af aan een rij
                  getallen. Dezelfde component als de rapportfiguur, maar zonder
                  spanningen (hier is nog niets berekend) en in de themakleuren,
                  want dit is een scherm dat ook donker kan staan. */}
              {cltLayup ? (
                <div className="pk-tekening pk-tekening-clt">
                  <CltOpbouwTekening
                    lagen={cltLayup.layers.map((l) => ({
                      dikte: l.thickness_mm,
                      richting: l.orientation,
                      klasse: l.strength_class,
                    }))}
                    breedteMm={cltLayup.width_mm}
                    z0Mm={cltMech?.z0}
                    kleuren={CLT_THEMA_KLEUREN}
                    titel={`Opbouw ${formatCltProfiel(cltLayup, houtKlasse)}`}
                  />
                </div>
              ) : (
                <div className="pk-tekening pk-tekening-leeg">{cltOpbouwReden(cltTekst)}</div>
              )}
              {cltLayup && (
                <div className="pk-eigenschappen">
                  <div className="pk-eig-rij"><span>lagen</span><code>{cltLayup.layers.length}</code></div>
                  <div className="pk-eig-rij"><span>h</span><code>{cltHoogteMm(cltLayup)} mm</code></div>
                  {cltMech && (
                    <>
                      {/* Bij een asymmetrische opbouw ligt de zwaartelijn niet
                          op halve hoogte, en dát is precies waarom hij hier
                          staat: het is de eerste plek waar je ziet dat je
                          opbouw niet symmetrisch is. */}
                      <div className="pk-eig-rij">
                        <span>z₀ (v.a. boven)</span>
                        <code>{nlGetal(cltMech.z0, 1)} mm</code>
                      </div>
                      <div className="pk-eig-rij">
                        <span>(EI)_ef</span>
                        <code>{nlGetal(cltMech.eiEf / 1e9, 1)} kNm²</code>
                      </div>
                    </>
                  )}
                </div>
              )}
              </div>
              <div className="pk-samenvatting">
                {cltGeldig && cltLayup
                  ? <>Keuze: <strong>{formatCltProfiel(cltLayup, houtKlasse)} — {houtKlasse}</strong></>
                  : cltLayup
                    ? "De opbouw heeft geen lengtelaag."
                    : "Geen geldige opbouw — zie de notatie hierboven."}
              </div>
            </div>
            </>
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
            <div className="pk-kolom-body">
              <label className="pk-veld">
                <span>Vorm</span>
                <select
                  value={betonShapeKeuze}
                  onChange={(e) => setBetonShapeKeuze(e.target.value as ConcreteShape)}
                >
                  <option value="Rectangle">rechthoek</option>
                  <option value="Tee">T-ligger</option>
                  <option value="Ell">L-ligger (randligger)</option>
                </select>
              </label>
              <label className="pk-veld">
                <span>{betonHeeftFlens ? "Flensbreedte b_eff [mm]" : "Breedte b [mm]"}</span>
                <input type="number" min={50} step={10} value={betonB}
                  onChange={(e) => setBetonB(Number(e.target.value))} />
              </label>
              <label className="pk-veld">
                <span>Hoogte h [mm]</span>
                <input type="number" min={50} step={10} value={betonH}
                  onChange={(e) => setBetonH(Number(e.target.value))} />
              </label>
              {betonHeeftFlens && (
                <>
                  <label className="pk-veld">
                    <span>Lijfbreedte b_w [mm]</span>
                    <input type="number" min={50} step={10} value={betonBw}
                      onChange={(e) => setBetonBw(Number(e.target.value))} />
                  </label>
                  <label className="pk-veld">
                    <span>Flensdikte h_f [mm]</span>
                    <input type="number" min={20} step={10} value={betonHf}
                      onChange={(e) => setBetonHf(Number(e.target.value))} />
                  </label>
                  <label className="pk-veld">
                    <span>Flens ligt</span>
                    <select
                      value={betonFlensOnder ? "onder" : "boven"}
                      onChange={(e) => setBetonFlensOnder(e.target.value === "onder")}
                    >
                      <option value="boven">boven</option>
                      <option value="onder">onder (omgekeerde T)</option>
                    </select>
                  </label>
                </>
              )}
              {/* De doorsnede MET de korf erin: dezelfde tekening als bij de
                  staafeigenschappen (`beton/DoorsnedeTekening`), geen tweede
                  tekenkant. Wat er rechts in de kolom "Wapening en milieu"
                  wordt ingevuld, staat hier meteen in beeld.

                  Klopt de korf niet — en tijdens het typen klopt hij geregeld
                  even niet — dan tekent hij alleen het beton en staat de reden
                  eronder. Verzonnen staven zijn erger dan geen staven: ze zien
                  er hetzelfde uit als een korf die er wél zo ligt. */}
              {betonDoorsnedeGeldig && (
                <div className="pk-tekening pk-tekening-beton">
                  <DoorsnedeTekening
                    korf={betonKorfGeheel}
                    wapening={betonKorfFout === null}
                    onRij={betonKorfFout === null ? (zijde) => setBetonBewerkRij(zijde) : undefined}
                  />
                  {betonBewerkRij && (
                    <RijBewerker
                      zijde={betonBewerkRij}
                      rij={betonKorf[betonBewerkRij]}
                      onOpslaan={(rij) => {
                        setBetonKorf((k) => ({ ...k, [betonBewerkRij]: rij }));
                        setBetonBewerkRij(null);
                      }}
                      onSluiten={() => setBetonBewerkRij(null)}
                    />
                  )}
                  {betonKorfFout !== null && (
                    <div className="pk-tekening-reden">
                      Alleen de omtrek: de wapening is zo niet te tekenen — zie
                      de melding onderaan deze kolom.
                    </div>
                  )}
                </div>
              )}
              {betonDoorsnedeGeldig && (
                <div className="pk-eigenschappen">
                  <div className="pk-eig-rij"><span>A_c</span><code>{nlGetal(betonSectie.A)} mm²</code></div>
                  <div className="pk-eig-rij"><span>I_y,c</span><code>{nlGetal(betonSectie.I / 1e4)} cm⁴</code></div>
                  <div className="pk-eig-rij"><span>E_cm</span><code>{CONCRETE_E_CM[betonKlasse] ?? "—"} N/mm²</code></div>
                </div>
              )}
              {/* Waarom hier "A_c" en niet "A" staat: deze drie beschrijven de
                  ONGESCHEURDE betondoorsnede zónder wapening — precies wat
                  `sectionResolver` de solver meegeeft. Ze bewegen dus NIET mee
                  met de korf hiernaast, en dat moet er staan: anders leest een
                  I_y als de buigstijfheid waarmee straks gerekend wordt,
                  terwijl de toetsing met de gescheurde doorsnede en de
                  wapening erin werkt (M-N-κ bij de staafeigenschappen). */}
              {betonDoorsnedeGeldig && (
                <div className="pk-hint">
                  A<sub>c</sub>, I<sub>y,c</sub> en E<sub>cm</sub> zijn van de
                  ongescheurde betondoorsnede zónder wapening — de stijfheid
                  waarmee de solver rekent. Ze bewegen dus niet mee met de korf
                  hiernaast; de toetsing rekent met de gescheurde doorsnede
                  inclusief de wapening.
                </div>
              )}
              {betonHeeftFlens && (
                <div className="pk-hint">
                  De flensbreedte hoort de meewerkende breedte b<sub>eff</sub> te
                  zijn (5.3.2.1(3)); bij het toetsen leidt de rekenkern hem af uit
                  de liggerlijn en vervangt hij de waarde die hier staat.
                </div>
              )}
            </div>
            <div className="pk-samenvatting">
              {betonGeldig
                ? <>Keuze: <strong>{betonNaam} — {betonKlasse}</strong></>
                : !betonDoorsnedeGeldig
                  ? betonHeeftFlens
                    ? "De lijfbreedte moet kleiner zijn dan de flensbreedte, en de flensdikte kleiner dan de hoogte."
                    : "Vul een geldige doorsnede in."
                  : betonKorfFout}
            </div>
          </div>

          {/* De wapeningskorf en de milieuklasse. Dit zijn LETTERLIJK dezelfde
              velden als op het tabblad Norm van de staafeigenschappen: één
              component, dat naar hetzelfde gegeven schrijft. */}
          <div className="pk-kolom pk-kolom-korf">
            <div className="pk-kolom-kop">Wapening en milieu</div>
            <div className="pk-kolom-body">
              <KorfVelden
                idPrefix="pk-beton"
                korf={betonKorf}
                onKorfChange={setBetonKorf}
                milieuklasse={betonMilieuklasse}
                onMilieuklasseChange={setBetonMilieuklasse}
                constructieklasse={betonConstructieklasse}
                onConstructieklasseChange={setBetonConstructieklasse}
                milieuklassen={milieuklassen}
                doorsnede={betonDoorsnede}
              />
              {betonKorfFout && (
                <div className="beton-fout" role="alert">{betonKorfFout}</div>
              )}
              {!betonKorfFout && betonDoorsnedeGeldig && (
                <div className="pk-eigenschappen">
                  <div className="pk-eig-rij"><span>A_s,onder</span><code>{nlGetal(aOnder)} mm²</code></div>
                  <div className="pk-eig-rij"><span>A_s,boven</span><code>{nlGetal(aBoven)} mm²</code></div>
                  <div className="pk-eig-rij">
                    <span>{betonDekkingRondomGelijk ? "d" : "d (trek onder)"}</span>
                    <code>{nlGetal(betonNuttigeHoogte)} mm</code>
                  </div>
                  {/* De tweede nuttige hoogte alleen als hij een eigen verhaal
                      heeft: bij één dekking rondom is hij uit d en h af te
                      lezen, bij een dekking per zijde niet. */}
                  {!betonDekkingRondomGelijk && (
                    <div className="pk-eig-rij">
                      <span>d (trek boven)</span>
                      <code>{nlGetal(betonNuttigeHoogteBoven)} mm</code>
                    </div>
                  )}
                </div>
              )}
              <div className="pk-hint">
                {korfSamenvatting(betonKorf)}. Het M-N-κ-diagram bij deze korf
                staat bij de staafeigenschappen, tabblad Norm — daar zijn dit
                dezelfde velden.
              </div>
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
                      {profielLabel(naam)}
                    </button>
                  ))}
                </div>
              </>
            )}
            {overigVorm2 && (
              <div className="pk-tekening">
                <ProfielMiniatuur
                  shape={overigVorm2}
                  materiaal="vrij"
                  titel={`Doorsnede ${overigProfielnaam}`}
                />
              </div>
            )}
          </div>

          <div className="pk-kolom pk-kolom-detail">
            <div className="pk-kolom-kop">Vrij materiaal</div>
            <div className="pk-kolom-body">
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
            </div>
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
