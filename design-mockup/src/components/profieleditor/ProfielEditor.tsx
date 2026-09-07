/**
 * ProfielEditor — eigen doorsneden samenstellen, tekenen en van een gat
 * voorzien, met de eigenschappen live uit de Rust-doorsnedemotor.
 *
 * Vier tabbladen:
 *  - Samenstellen: lamellen (platen), catalogusprofielen als bouwstenen en de
 *    lasnaden daartussen;
 *  - Gat in profiel: een catalogusprofiel met gaten door lijf, flens of wand;
 *  - Spanning: een moment, normaalkracht en dwarskracht op de doorsnede, met
 *    het spanningsverloop en de toetsing van de lasnaden;
 *  - Bewaard: de opgeslagen eigen doorsneden (bewerken, verwijderen, kiezen).
 *
 * Een bewaarde doorsnede krijgt als profielnaam `EIGEN:<naam>` (zie
 * lib/profieleditor/eigenDoorsnedenStore.ts) en gaat via `custom_section`
 * naar de toetsing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomDoorsnedevorm } from "../../lib/types/steel/CustomDoorsnedevorm";
import { basisprofielVan, profielLabel } from "../../lib/profieleditor/catalogus";
import {
  profielnaamVan,
  useEigenDoorsneden,
} from "../../lib/profieleditor/eigenDoorsnedenStore";
import { fmtGroep, fmtMaat, fmtMacht, leesGetal } from "../../lib/profieleditor/format";
import { controleerGat, snelleSchatting } from "../../lib/profieleditor/geometrie";
import { nieuwId } from "../../lib/profieleditor/id";
import { ontwerpIsLeeg, ontwerpNaarMotor } from "../../lib/profieleditor/motorInvoer";
import { VORM_LABEL, gaatAlsLamellen, maakEigenDoorsnede, stelVormVoor } from "../../lib/profieleditor/opslaan";
import {
  aantalBouwstenen,
  hartVan,
  naamVanBouwsteen,
  naamVanGat,
  normaliseerHoek,
  roteer,
  roteerGaten,
  spiegel,
  spiegelGaten,
  verplaats,
  verplaatsGaten,
  type GatBewerking,
  type Punt2,
} from "../../lib/profieleditor/transformeren";
import { VANG_NAAM, type VangSoort } from "../../lib/profieleditor/snappunten";
import type { DoorsnedeOntwerp, EigenDoorsnede } from "../../lib/profieleditor/types";
import { useMotorBerekening } from "../../lib/profieleditor/useMotorBerekening";
import Modal from "../Modal";
import DoorsnedeTekenvlak, { type TekenvlakModus } from "./DoorsnedeTekenvlak";
import EigenDoorsnedeTekening from "./EigenDoorsnedeTekening";
import EigenschappenPaneel from "./EigenschappenPaneel";
import GatPaneel from "./GatPaneel";
import GereedschapsBalk, { type TransformSoort } from "./GereedschapsBalk";
import LassenPaneel from "./LassenPaneel";
import SamenstellingPaneel from "./SamenstellingPaneel";
import SpanningPaneel, { STANDAARD_BELASTING, type Belasting } from "./SpanningPaneel";
import "./ProfielEditor.css";

type Tab = "samenstelling" | "gat" | "spanning" | "bewaard";
type Samenstelling = Extract<DoorsnedeOntwerp, { soort: "samenstelling" }>;
type GatOntwerp = Extract<DoorsnedeOntwerp, { soort: "gat" }>;

export interface ProfielEditorProps {
  open: boolean;
  onClose: () => void;
  /** Na opslaan: de bewaarde doorsnede (bijvoorbeeld om hem op de staaf te zetten). */
  onOpslaan?: (d: EigenDoorsnede) => void;
  /** Uit de lijst "Bewaard" gekozen (Gebruiken). */
  onKies?: (d: EigenDoorsnede) => void;
  /** Bestaande doorsnede om te bewerken. */
  bewerk?: EigenDoorsnede;
  /** false = zonder Modal-schil (losse pagina). Standaard true. */
  inModal?: boolean;
  /** Starttab. */
  startTab?: Tab;
}

const VORMEN: CustomDoorsnedevorm[] = [
  "Onbekend",
  "GelasteIDubbelsymmetrisch",
  "GelasteIMonosymmetrisch",
  "Koker",
  "RondeBuis",
];

function legeSamenstelling(): Samenstelling {
  return { soort: "samenstelling", lamellen: [], catalogusdelen: [], celMeenemen: true };
}

function standaardGatOntwerp(): GatOntwerp {
  const basis = basisprofielVan("IPE 300") ?? basisprofielVan("HEA 160");
  if (!basis) throw new Error("profieldatabase leeg");
  return { soort: "gat", basis, gaten: [] };
}

/** Rasterstappen waarop een muisdraaiing landt zolang Shift niet ingedrukt is. */
const HOEKSTAP_GRADEN = 15;

/**
 * Een lopende verplaats- of roteermodus (G/R), naar het voorbeeld van het
 * canvas: de muis stuurt, een getypt getal gaat vóór de muis, Enter bevestigt
 * en Escape zet `origineel` terug.
 *
 * Verplaatsen gaat in twee klikken, zoals in elk tekenpakket: eerst wijs je
 * het BASISPUNT aan (het punt dat je vastpakt), dan het DOELPUNT. Het verschil
 * tussen die twee is de verplaatsing. Beide klikken vangen op de punten van de
 * tekening, zodat een hoekpunt exact op een ander hoekpunt landt.
 */
interface Modus {
  soort: TransformSoort;
  /** Bouwsteen die meegaat; null = alle bouwstenen samen. */
  doelId: string | null;
  /** Het ontwerp bij de start; elke voorvertoning wordt hieruit opnieuw berekend. */
  origineel: Samenstelling;
  /** Draaipunt bij roteren, bevroren bij de start zodat het niet meeschuift. */
  anker: Punt2;
  /** Zwaartepunt bij de start; snappunt dat niet met de voorvertoning meeschuift. */
  ankerZwaartepunt: Punt2 | null;
  /** Verplaatsen: wijst de muis nu het basispunt aan of het doelpunt? */
  fase: "basispunt" | "doelpunt";
  /** Het vastgelegde basispunt, of null zolang het nog aangewezen wordt. */
  basis: Punt2 | null;
  /** Muis (model-mm) bij de eerste beweging in het tekenvlak (roteren). */
  muisStart: Punt2 | null;
  /** Laatste muispositie (model-mm), al gevangen door het tekenvlak. */
  muis: Punt2 | null;
  /** Waar die muispositie op vastklikte. */
  vang: VangSoort;
  /** Shift ingedrukt: niet vangen (en bij roteren: geen hoekstap). */
  vrij: boolean;
  /** Vergrendelde as bij verplaatsen. */
  asSlot: "y" | "z" | null;
  /** Getypt getal; zolang dit er staat telt de muis niet mee. */
  getypt: string | null;
  dy: number;
  dz: number;
  graden: number;
}

/**
 * Verplaatsing of hoek opnieuw afleiden uit de muis of het getypte getal.
 * Eén plek, zodat een aslock, een Shift of een extra cijfer allemaal langs
 * dezelfde weg lopen.
 *
 * De muispositie is hier al gevangen (het tekenvlak weet als enige hoe ver een
 * schermstraal in millimeters is); er wordt dus niets meer afgerond. Juist
 * daardoor klopt de uitkomst exact: doelpunt − basispunt, allebei coördinaten
 * uit de geometrie.
 */
function herbereken(m: Modus): Modus {
  const getal = m.getypt === null ? NaN : leesGetal(m.getypt);
  if (m.soort === "verplaats") {
    let dy = 0;
    let dz = 0;
    if (m.getypt !== null) {
      const v = Number.isFinite(getal) ? getal : 0;
      if (m.asSlot === "z") dz = v;
      else dy = v;
    } else if (m.fase === "doelpunt" && m.basis && m.muis) {
      dy = m.muis.y - m.basis.y;
      dz = m.muis.z - m.basis.z;
      if (m.asSlot === "y") dz = 0;
      if (m.asSlot === "z") dy = 0;
    }
    return { ...m, dy, dz };
  }
  let graden = 0;
  if (m.getypt !== null) {
    graden = Number.isFinite(getal) ? getal : 0;
  } else if (m.muisStart && m.muis) {
    const a0 = Math.atan2(m.muisStart.z - m.anker.z, m.muisStart.y - m.anker.y);
    const a1 = Math.atan2(m.muis.z - m.anker.z, m.muis.y - m.anker.y);
    graden = normaliseerHoek(((a1 - a0) * 180) / Math.PI);
    if (!m.vrij) graden = Math.round(graden / HOEKSTAP_GRADEN) * HOEKSTAP_GRADEN;
  }
  return { ...m, graden };
}

/** Het ontwerp zoals de modus het nú laat zien. */
function voorvertoning(m: Modus): Samenstelling {
  return m.soort === "verplaats"
    ? verplaats(m.origineel, m.doelId, m.dy, m.dz)
    : roteer(m.origineel, m.doelId, m.graden, m.anker);
}

export default function ProfielEditor({
  open,
  onClose,
  onOpslaan,
  onKies,
  bewerk,
  inModal = true,
  startTab,
}: ProfielEditorProps) {
  const items = useEigenDoorsneden((s) => s.items);
  const bewaar = useEigenDoorsneden((s) => s.bewaar);
  const verwijder = useEigenDoorsneden((s) => s.verwijder);

  const [tab, setTab] = useState<Tab>(startTab ?? (bewerk ? bewerk.ontwerp.soort : "samenstelling"));
  const [samenstelling, setSamenstelling] = useState<Samenstelling>(() =>
    bewerk?.ontwerp.soort === "samenstelling" ? bewerk.ontwerp : legeSamenstelling(),
  );
  const [gatOntwerp, setGatOntwerp] = useState<GatOntwerp>(() =>
    bewerk?.ontwerp.soort === "gat" ? bewerk.ontwerp : standaardGatOntwerp(),
  );
  const [naam, setNaam] = useState(bewerk?.naam ?? "");
  const [bewerkId, setBewerkId] = useState<string | null>(bewerk?.id ?? null);
  const [vormKeuze, setVormKeuze] = useState<CustomDoorsnedevorm | "auto">("auto");
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  /** Snedekrachten van het tabblad Spanning; horen bij de sessie, niet bij het ontwerp. */
  const [belasting, setBelasting] = useState<Belasting>(STANDAARD_BELASTING);

  /**
   * Welk van de twee ontwerpen er "aan" staat. Het tabblad Spanning en het
   * opslaan werken op het ontwerp waar je vandaan komt, dus dat volgt niet uit
   * `tab` alleen.
   */
  const [bron, setBron] = useState<"samenstelling" | "gat">(
    bewerk?.ontwerp.soort === "gat" ? "gat" : "samenstelling",
  );

  const ontwerp: DoorsnedeOntwerp = bron === "gat" ? gatOntwerp : samenstelling;

  // Gaten die niet in de plaat passen houden de motor tegen: een verkeerd
  // getal is erger dan even geen getal.
  const gatFouten = useMemo(
    () => (ontwerp.soort === "gat" ? ontwerp.gaten.map((g) => controleerGat(g, ontwerp.basis)).filter((f): f is string => !!f) : []),
    [ontwerp],
  );
  // De naam gaat bewust niet mee: typen in het naamveld hoeft de motor niet
  // opnieuw te laten rekenen.
  const invoer = useMemo(() => {
    if (tab === "bewaard" || ontwerpIsLeeg(ontwerp) || gatFouten.length > 0) return null;
    return ontwerpNaarMotor(ontwerp, "doorsnede");
  }, [tab, ontwerp, gatFouten]);
  const motor = useMotorBerekening(invoer);
  const schatting = useMemo(() => snelleSchatting(ontwerp), [ontwerp]);

  const vormVoorstel = useMemo(() => stelVormVoor(ontwerp), [ontwerp]);
  const vorm: CustomDoorsnedevorm = vormKeuze === "auto" ? vormVoorstel : vormKeuze;
  const alsLamellen = gaatAlsLamellen(ontwerp);

  // ── Slepen in het tekenvlak ─────────────────────────────────────────────
  const sleepStart = useRef<{ y: number; z: number; hoek: number } | null>(null);
  const zoekPositie = useCallback(
    (id: string): { y: number; z: number; hoek: number } | null => {
      if (ontwerp.soort === "samenstelling") {
        const l = ontwerp.lamellen.find((x) => x.id === id);
        if (l) return { y: l.y_mm, z: l.z_mm, hoek: 0 };
        const d = ontwerp.catalogusdelen.find((x) => x.id === id);
        if (d) return { y: d.y_mm, z: d.z_mm, hoek: 0 };
        return null;
      }
      const g = ontwerp.gaten.find((x) => x.id === id);
      return g ? { y: g.y, z: g.z, hoek: g.hoekGraden } : null;
    },
    [ontwerp],
  );
  const opSleepStart = useCallback((id: string) => {
    sleepStart.current = zoekPositie(id);
  }, [zoekPositie]);
  const opSleep = useCallback(
    (id: string, dy: number, dz: number, vrij = false) => {
      const s0 = sleepStart.current;
      if (!s0) return;
      // De verplaatsing is al gevangen op een snappunt of op het raster: hier
      // wordt alleen drijvendekommastof weggehaald, zodat een hoekpunt dat op
      // een ander hoekpunt landt ook echt dezelfde coördinaat krijgt. Met
      // Shift is er niets gevangen, en dan blijft het bij hele millimeters.
      const rond = (v: number) => (vrij ? Math.round(v) : Math.round(v * 1e4) / 1e4);
      if (ontwerp.soort === "samenstelling") {
        setSamenstelling((o) => ({
          ...o,
          lamellen: o.lamellen.map((l) => (l.id === id ? { ...l, y_mm: rond(s0.y + dy), z_mm: rond(s0.z + dz) } : l)),
          catalogusdelen: o.catalogusdelen.map((d) => (d.id === id ? { ...d, y_mm: rond(s0.y + dy), z_mm: rond(s0.z + dz) } : d)),
        }));
      } else {
        setGatOntwerp((o) => ({
          ...o,
          gaten: o.gaten.map((g) => {
            if (g.id !== id) return g;
            switch (g.plaats) {
              case "lijf":
                return { ...g, z: rond(s0.z + dz) };
              case "flensBoven":
              case "flensOnder":
                return { ...g, y: rond(s0.y + dy) };
              case "wand": {
                // Hoekpositie volgt de muis om het buismidden.
                const R = o.basis.h / 2;
                const rm = R - o.basis.tw / 2;
                const y = R + rm * Math.cos((s0.hoek * Math.PI) / 180) + dy;
                const z = R + rm * Math.sin((s0.hoek * Math.PI) / 180) + dz;
                const hoek = (Math.atan2(z - R, y - R) * 180) / Math.PI;
                return { ...g, hoekGraden: Math.round(hoek) };
              }
              case "vlak":
                return { ...g, y: rond(s0.y + dy), z: rond(s0.z + dz) };
            }
          }),
        }));
      }
    },
    [ontwerp.soort],
  );
  const opSleepEinde = useCallback(() => {
    sleepStart.current = null;
  }, []);

  // ── Verplaatsen, roteren en spiegelen ───────────────────────────────────
  // Doel is de geselecteerde bouwsteen; is er niets (of iets dat geen
  // bouwsteen van deze samenstelling is) geselecteerd, dan gaat het hele
  // ontwerp mee.
  const doelId = useMemo(
    () => (geselecteerd && hartVan(samenstelling, geselecteerd) ? geselecteerd : null),
    [geselecteerd, samenstelling],
  );
  const doelNaam = doelId ? naamVanBouwsteen(samenstelling, doelId) : null;
  const aantal = aantalBouwstenen(samenstelling);
  /**
   * Waar het hele ontwerp omheen draait en spiegelt: het zwaartepunt uit de
   * motor als dat er is, anders de oorsprong. Eén bouwsteen draait om zijn
   * eigen hart.
   */
  const zwaartepunt: Punt2 = useMemo(
    () =>
      tab === "samenstelling" && motor.uitvoer
        ? { y: motor.uitvoer.y_c_mm, z: motor.uitvoer.z_c_mm }
        : { y: 0, z: 0 },
    [tab, motor.uitvoer],
  );
  const draaipunt: Punt2 = (doelId ? hartVan(samenstelling, doelId) : null) ?? zwaartepunt;

  const [modus, setModus] = useState<Modus | null>(null);

  /** Modus bijwerken en de voorvertoning meteen in het ontwerp zetten. */
  const zetModus = useCallback((m: Modus) => {
    const n = herbereken(m);
    setModus(n);
    setSamenstelling(voorvertoning(n));
  }, []);

  const startModus = useCallback(
    (soort: TransformSoort) => {
      if (tab !== "samenstelling" || aantalBouwstenen(samenstelling) === 0) return;
      // Het toetsenbord stuurt de modus; een veld dat nog focus heeft zou de
      // cijfers opeten.
      (document.activeElement as HTMLElement | null)?.blur?.();
      setModus({
        soort,
        doelId,
        origineel: samenstelling,
        anker: draaipunt,
        ankerZwaartepunt: motor.uitvoer ? { y: motor.uitvoer.y_c_mm, z: motor.uitvoer.z_c_mm } : null,
        fase: "basispunt",
        basis: null,
        muisStart: null,
        muis: null,
        vang: "raster",
        vrij: false,
        asSlot: null,
        getypt: null,
        dy: 0,
        dz: 0,
        graden: 0,
      });
    },
    [tab, samenstelling, doelId, draaipunt, motor.uitvoer],
  );

  /**
   * Klikken in het tekenvlak (of Enter). Bij verplaatsen legt de eerste klik
   * het basispunt vast en voert de tweede de verplaatsing uit; bij roteren, en
   * zodra er een maat getypt is, bevestigt hij meteen.
   */
  const bevestigModus = useCallback(
    (punt?: Punt2) => {
      const m = modus;
      if (!m) return;
      if (m.soort === "verplaats" && m.fase === "basispunt" && m.getypt === null) {
        const p = punt ?? m.muis;
        if (!p) return;
        zetModus({ ...m, fase: "doelpunt", basis: p, muis: p });
        return;
      }
      setModus(null);
    },
    [modus, zetModus],
  );
  const annuleerModus = useCallback(() => {
    if (!modus) return;
    setSamenstelling(modus.origineel);
    setModus(null);
  }, [modus]);

  const opModusMuis = useCallback(
    (y: number, z: number, vang: VangSoort, shift: boolean) => {
      if (!modus) return;
      zetModus({
        ...modus,
        muis: { y, z },
        vang,
        vrij: shift,
        muisStart: modus.muisStart ?? { y, z },
      });
    },
    [modus, zetModus],
  );

  /**
   * Wat de laatste bewerking te melden had, kort, voor in de gereedschapsbalk:
   * de melding van een gat-bewerking ("Een gat in het lijf schuift alleen
   * omhoog en omlaag."), of de aantekening dat er om de oorsprong gedraaid is
   * omdat de motor nog geen zwaartepunt had.
   */
  const [transformMelding, setTransformMelding] = useState<string | null>(null);
  /** Melding zetten voor een draaiing of spiegeling om het ontwerp als geheel. */
  const meldAnker = useCallback(() => {
    setTransformMelding(
      doelId === null && !motor.uitvoer
        ? "Om de oorsprong (0, 0) — de motor had nog geen zwaartepunt."
        : null,
    );
  }, [doelId, motor.uitvoer]);

  // Directe bewerkingen uit de gereedschapsbalk (geen muismodus).
  const verplaatsNu = useCallback(
    (dy: number, dz: number) => {
      setTransformMelding(null);
      setSamenstelling((o) => verplaats(o, doelId, dy, dz));
    },
    [doelId],
  );
  const roteerNu = useCallback(
    (graden: number) => {
      const om = draaipunt;
      meldAnker();
      setSamenstelling((o) => roteer(o, doelId, graden, om));
    },
    [doelId, draaipunt, meldAnker],
  );
  const spiegelNu = useCallback(() => {
    const om = draaipunt;
    meldAnker();
    setSamenstelling((o) => spiegel(o, doelId, om));
  }, [doelId, draaipunt, meldAnker]);

  // ── Dezelfde bewerkingen op de gaten van een catalogusprofiel ───────────
  // Een gat is niet vrij: het zit vast aan zijn plaat of aan de omtrek. De
  // bewerkingen doen wat kan en zeggen wat niet kon; die melding komt kort in
  // de gereedschapsbalk te staan.
  const gatDoelId = useMemo(
    () => (geselecteerd && naamVanGat(gatOntwerp, geselecteerd) ? geselecteerd : null),
    [geselecteerd, gatOntwerp],
  );
  const pasGatBewerkingToe = useCallback((b: GatBewerking) => {
    setGatOntwerp((o) => ({ ...o, gaten: b.gaten }));
    setTransformMelding(b.melding);
  }, []);
  const verplaatsGatenNu = useCallback(
    (dy: number, dz: number) => pasGatBewerkingToe(verplaatsGaten(gatOntwerp, gatDoelId, dy, dz)),
    [gatOntwerp, gatDoelId, pasGatBewerkingToe],
  );
  const roteerGatenNu = useCallback(
    (graden: number) => pasGatBewerkingToe(roteerGaten(gatOntwerp, gatDoelId, graden)),
    [gatOntwerp, gatDoelId, pasGatBewerkingToe],
  );
  const spiegelGatenNu = useCallback(
    () => pasGatBewerkingToe(spiegelGaten(gatOntwerp, gatDoelId)),
    [gatOntwerp, gatDoelId, pasGatBewerkingToe],
  );

  // Een tabwissel laat een halve bewerking niet doorlopen.
  useEffect(() => {
    setModus(null);
    setTransformMelding(null);
  }, [tab]);

  // Sneltoetsen. De afhandeling staat in een ref zodat de luisteraar zelf
  // stabiel blijft en toch altijd de verse toestand ziet.
  const toetsRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  toetsRef.current = (e: KeyboardEvent) => {
    if (!open || tab !== "samenstelling") return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const doel = e.target as HTMLElement | null;
    const inVeld =
      !!doel &&
      (doel.tagName === "INPUT" || doel.tagName === "SELECT" || doel.tagName === "TEXTAREA" || doel.isContentEditable);
    const pak = () => {
      e.preventDefault();
      // Escape mag hier niet doorlopen naar Modal — die zou de hele editor sluiten.
      e.stopPropagation();
    };
    const m = modus;
    if (m) {
      if (e.key === "Escape") {
        pak();
        annuleerModus();
        return;
      }
      // Staat de aandacht in een invoerveld, dan is de gebruiker daar aan het
      // typen; alleen Escape onderbreekt dan de modus.
      if (inVeld) return;
      if (e.key === "Enter") {
        pak();
        bevestigModus();
        return;
      }
      if (m.soort === "verplaats" && (e.key === "y" || e.key === "Y" || e.key === "z" || e.key === "Z")) {
        pak();
        const as = e.key.toLowerCase() === "y" ? "y" : "z";
        zetModus({ ...m, asSlot: m.asSlot === as ? null : as });
        return;
      }
      if (/^[0-9]$/.test(e.key) || e.key === "-" || e.key === "," || e.key === ".") {
        pak();
        zetModus({ ...m, getypt: (m.getypt ?? "") + (e.key === "," ? "." : e.key) });
        return;
      }
      if (e.key === "Backspace") {
        pak();
        const rest = m.getypt && m.getypt.length > 1 ? m.getypt.slice(0, -1) : null;
        zetModus({ ...m, getypt: rest });
        return;
      }
      return;
    }
    if (inVeld) return;
    if (e.key === "g" || e.key === "G") {
      pak();
      startModus("verplaats");
      return;
    }
    if (e.key === "r" || e.key === "R") {
      pak();
      startModus("roteer");
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => toetsRef.current(e);
    // In de opvangfase, zodat Escape de Modal niet ook nog sluit.
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  /** Wat de modus in het tekenvlak laat zien. */
  const tekenvlakModus: TekenvlakModus | null = useMemo(() => {
    if (!modus) return null;
    const wat = modus.doelId ? (naamVanBouwsteen(samenstelling, modus.doelId) ?? "bouwsteen") : "hele ontwerp";
    const getypt = modus.getypt ? `  ⌨ ${modus.getypt}` : "";
    const gemeen = {
      snapOntwerp: modus.origineel,
      snapZwaartepunt: modus.ankerZwaartepunt,
    };
    if (modus.soort === "verplaats") {
      const slot = modus.asSlot ? `  [${modus.asSlot}-as]` : "";
      // Waar de aanwijzer nu op vastklikt; bij een getypte maat telt de muis
      // niet mee en heeft die aanduiding dus niets te zeggen.
      const op = modus.getypt === null ? `  ⊹ ${VANG_NAAM[modus.vang]}` : "";
      const punt = modus.muis
        ? `(${fmtMaat(modus.muis.y, 3)}, ${fmtMaat(modus.muis.z, 3)})`
        : "wijs aan";
      return {
        soort: "verplaats",
        regel:
          modus.fase === "basispunt" && modus.getypt === null
            ? `Verplaatsen (${wat}) · 1/2 basispunt ${punt}${op}`
            : `Verplaatsen (${wat}) · 2/2 doelpunt: Δy = ${fmtMaat(modus.dy, 3)} mm, ` +
              `Δz = ${fmtMaat(modus.dz, 3)} mm${slot}${getypt}${op}`,
        bediening:
          modus.fase === "basispunt" && modus.getypt === null
            ? "klik het punt dat je vastpakt · snap op hoekpunt, midden, hart en zwaartepunt · Shift = vrij · Esc annuleert"
            : "klik waar dat punt heen moet · cijfers typen = maat · Y of Z vergrendelt een as · Shift = vrij · Enter bevestigt · Esc annuleert",
        anker: modus.basis,
        asSlot: modus.asSlot,
        ...gemeen,
      };
    }
    return {
      soort: "roteer",
      regel: `Roteren (${wat}): φ = ${fmtMaat(modus.graden, 3)}°${getypt}`,
      bediening: `muis draait om het ankerpunt · cijfers typen = hoek · Shift = vrij (anders stappen van ${HOEKSTAP_GRADEN}°) · Enter bevestigt · Esc annuleert`,
      anker: modus.anker,
      ...gemeen,
    };
  }, [modus, samenstelling]);

  // ── Wat de gereedschapsbalk laat zien en aanroept ───────────────────────
  // De twee tabbladen delen de balk maar niet de wiskunde: een samenstelling
  // draait vrij om een punt, een gat zit vast aan zijn plaat. Alles wat per
  // tabblad verschilt — de naam van het doel, het ankerpunt en de reden waarom
  // iets niet kan — wordt hier bepaald en gaat als tekst mee naar de balk.
  const balk = (() => {
    if (tab === "gat") {
      const n = gatOntwerp.gaten.length;
      const naam = gatDoelId ? naamVanGat(gatOntwerp, gatDoelId) : null;
      const leegReden = n === 0 ? "Er is nog geen gat om te bewerken: voeg er links een toe." : null;
      return {
        doelKort: n === 0 ? "geen gaten" : (naam ?? `alle gaten (${n})`),
        doelTitel:
          leegReden ??
          (naam
            ? `Doel: ${naam}. Klik hier — of naast de doorsnede — om de selectie op te heffen en alle gaten tegelijk te bewerken.`
            : `Doel: alle ${n} gaten. Klik een gat in de tekening of in de lijst aan om alleen dat gat te bewerken.`),
        kanLoslaten: naam !== null,
        leegReden,
        ankerKort: "profielhartlijn",
        ankerUitleg:
          "Spiegelen gaat om de verticale hartlijn van het profiel. Een gat blijft verder in zijn eigen plaat: verplaatsen schuift het langs die plaat, draaien verschuift een gat in de buiswand langs de omtrek en draait een rechthoekig langsgat mee.",
        roteerOm:
          "elk gat volgt zijn eigen plaats — een gat in de buiswand schuift langs de omtrek, een rechthoekig langsgat draait mee, en wat niet kan meldt de balk",
        spiegelOm: "de verticale hartlijn van het profiel",
        spiegelExtra: "Een gat in het lijf ligt op die hartlijn en verandert daar niet van.",
        geenMuisModus:
          "De muismodi G en R werken op een samenstelling; een gat versleep je rechtstreeks in het tekenvlak.",
        onVerplaats: verplaatsGatenNu,
        onRoteer: roteerGatenNu,
        onSpiegel: spiegelGatenNu,
      };
    }
    const leegReden =
      aantal === 0 ? "Er is nog niets om te bewerken: kies eerst een startvorm of voeg een bouwsteen toe." : null;
    const zwaartepuntBekend = !!motor.uitvoer;
    const om = doelId
      ? "zijn eigen hart"
      : zwaartepuntBekend
        ? `het zwaartepunt Z (${fmtMaat(draaipunt.y)}, ${fmtMaat(draaipunt.z)})`
        : "de oorsprong (0, 0)";
    return {
      doelKort: aantal === 0 ? "geen bouwstenen" : (doelNaam ?? `hele ontwerp (${aantal})`),
      doelTitel:
        leegReden ??
        (doelNaam
          ? `Doel: ${doelNaam}. Klik hier — of naast de doorsnede — om de selectie op te heffen en weer het hele ontwerp te bewerken.`
          : `Doel: alle ${aantal} bouwstenen. Klik een bouwsteen in de tekening of in de lijst aan om alleen die te bewerken.`),
      kanLoslaten: doelNaam !== null,
      leegReden,
      ankerKort: doelId
        ? "eigen hart"
        : zwaartepuntBekend
          ? `Z (${fmtMaat(draaipunt.y)}, ${fmtMaat(draaipunt.z)})`
          : "oorsprong",
      ankerUitleg: `Roteren en spiegelen gaan om ${om}. Eén geselecteerde bouwsteen draait om zijn eigen hart; het hele ontwerp draait om het zwaartepunt uit de motor — of om de oorsprong zolang de motor nog niets heeft teruggegeven.`,
      roteerOm: `het doel draait om ${om}`,
      spiegelOm: om,
      spiegelExtra: "Een catalogusdeel klapt daarbij ook zelf om.",
      geenMuisModus: null,
      onVerplaats: verplaatsNu,
      onRoteer: roteerNu,
      onSpiegel: spiegelNu,
    };
  })();

  // ── Opslaan ─────────────────────────────────────────────────────────────
  const kanOpslaan = !!motor.uitvoer && !motor.verouderd && !motor.fout && naam.trim().length > 0 && invoer !== null;
  const slaOp = () => {
    if (!motor.uitvoer || !kanOpslaan) return;
    const schoon = naam.trim();
    const d = maakEigenDoorsnede(bewerkId ?? nieuwId(), schoon, ontwerp, motor.uitvoer, vorm);
    bewaar(d);
    setBewerkId(d.id);
    setMelding(`Bewaard als "${profielnaamVan(d)}".`);
    onOpslaan?.(d);
  };

  const laad = (d: EigenDoorsnede) => {
    if (d.ontwerp.soort === "samenstelling") setSamenstelling(d.ontwerp);
    else setGatOntwerp(d.ontwerp);
    setNaam(d.naam);
    setBewerkId(d.id);
    setVormKeuze(d.vorm === stelVormVoor(d.ontwerp) ? "auto" : d.vorm);
    setTab(d.ontwerp.soort);
    setBron(d.ontwerp.soort);
    setGeselecteerd(null);
    setMelding(null);
  };

  const nieuw = () => {
    setBewerkId(null);
    setNaam("");
    setVormKeuze("auto");
    setMelding(null);
    setGeselecteerd(null);
  };

  if (!open) return null;

  const inhoud = (
    <div className="pe-wortel">
      <div className="pe-tabs">
        <button className={`pe-tab${tab === "samenstelling" ? " actief" : ""}`} onClick={() => { setTab("samenstelling"); setBron("samenstelling"); setGeselecteerd(null); }}>
          Samenstellen
        </button>
        <button className={`pe-tab${tab === "gat" ? " actief" : ""}`} onClick={() => { setTab("gat"); setBron("gat"); setGeselecteerd(null); }}>
          Gat in profiel
        </button>
        <button
          className={`pe-tab${tab === "spanning" ? " actief" : ""}`}
          onClick={() => setTab("spanning")}
          title="Zet een moment, een normaalkracht en een dwarskracht op deze doorsnede en zie het spanningsverloop erover; de lasnaden worden er meteen op getoetst."
        >
          Spanning
        </button>
        <button className={`pe-tab${tab === "bewaard" ? " actief" : ""}`} onClick={() => setTab("bewaard")}>
          Bewaard ({items.length})
        </button>
      </div>

      {tab === "bewaard" ? (
        items.length === 0 ? (
          <div className="pe-bewaard-leeg">Nog geen eigen doorsneden bewaard.</div>
        ) : (
          <div className="pe-bewaard">
            {items.map((d) => (
              <div key={d.id} className="pe-bewaard-kaart">
                <div className="pe-bewaard-naam">{d.naam}</div>
                <EigenDoorsnedeTekening doorsnede={d} stijl="app" />
                <div className="pe-bewaard-sub">
                  A = {fmtGroep(d.eigenschappen.area_mm2, 0)} mm² · I_y = {fmtMacht(d.eigenschappen.iy_mm4, 6, 2)} mm⁴
                  <br />
                  {d.ontwerp.soort === "gat"
                    ? `${profielLabel(d.ontwerp.basis.naam)} met ${d.ontwerp.gaten.length} gat${d.ontwerp.gaten.length === 1 ? "" : "en"}`
                    : `${d.ontwerp.lamellen.length} lamellen, ${d.ontwerp.catalogusdelen.length} catalogusdelen`}
                  {" · "}
                  {gaatAlsLamellen(d.ontwerp) ? "toetsing uit geometrie" : VORM_LABEL[d.vorm].split(" — ")[0]}
                </div>
                <div className="pe-knoppen">
                  {onKies && (
                    <button className="pe-knop pe-knop-primair" onClick={() => onKies(d)}>Gebruiken</button>
                  )}
                  <button className="pe-knop" onClick={() => laad(d)}>Bewerken</button>
                  <button className="pe-knop pe-knop-gevaar" onClick={() => verwijder(d.id)}>Verwijderen</button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === "spanning" ? (
        <SpanningPaneel
          ontwerp={ontwerp}
          uitvoer={motor.uitvoer}
          belasting={belasting}
          onWijzig={setBelasting}
          geselecteerd={geselecteerd}
          onSelecteer={setGeselecteerd}
        />
      ) : (
        <>
          {/*
            De gereedschapsbalk staat over de volle breedte boven de drie
            kolommen: zo passen alle bewerkingen op één regel en houden de
            kolommen hun volle hoogte voor de bouwstenen en de eigenschappen.
          */}
          <GereedschapsBalk
            {...balk}
            modus={modus?.soort ?? null}
            melding={transformMelding}
            onStart={startModus}
            onLosLaten={() => setGeselecteerd(null)}
          />
          <div className="pe-kolommen">
            <div className="pe-kolom pe-kolom-links">
              {tab === "samenstelling" ? (
                <>
                  <SamenstellingPaneel
                    ontwerp={samenstelling}
                    onWijzig={setSamenstelling}
                    geselecteerd={geselecteerd}
                    onSelecteer={setGeselecteerd}
                  />
                  <LassenPaneel
                    ontwerp={samenstelling}
                    onWijzig={setSamenstelling}
                    geselecteerd={geselecteerd}
                    onSelecteer={setGeselecteerd}
                  />
                </>
              ) : (
                <GatPaneel
                  ontwerp={gatOntwerp}
                  onWijzig={setGatOntwerp}
                  geselecteerd={geselecteerd}
                  onSelecteer={setGeselecteerd}
                />
              )}
            </div>
            <div className="pe-kolom pe-kolom-midden">
              <DoorsnedeTekenvlak
                ontwerp={ontwerp}
                uitvoer={motor.uitvoer}
                verouderd={motor.verouderd}
                geselecteerd={geselecteerd}
                onSelecteer={setGeselecteerd}
                onSleepStart={opSleepStart}
                onSleep={opSleep}
                onSleepEinde={opSleepEinde}
                modus={tekenvlakModus}
                onModusMuis={opModusMuis}
                onModusBevestig={bevestigModus}
              />
            </div>
            <div className="pe-kolom pe-kolom-rechts">
              <EigenschappenPaneel
                uitvoer={invoer ? motor.uitvoer : null}
                verouderd={motor.verouderd}
                bezig={motor.bezig}
                fout={motor.fout ?? (gatFouten.length > 0 ? "Los eerst de gemelde gatfouten op." : null)}
                schatting={schatting}
              />
            </div>
          </div>
        </>
      )}

      {tab !== "bewaard" && (
        <div className="pe-voet">
          {/* Labels staan vóór het veld in plaats van erboven: één regel in
              plaats van twee, en de uitleg zit in de tooltip. */}
          <label
            className="pe-voet-veld pe-voet-veld-breed"
            title={bewerkId ? "Naam van de doorsnede die je nu bewerkt." : "Onder deze naam komt de doorsnede in de lijst en op de staaf."}
          >
            <span>Naam{bewerkId ? " (bewerken)" : ""}</span>
            <input
              type="text"
              value={naam}
              placeholder={ontwerp.soort === "gat" ? `${profielLabel(ontwerp.basis.naam)} met gat` : "Gelaste ligger"}
              onChange={(e) => setNaam(e.target.value)}
            />
          </label>
          <label
            className="pe-voet-veld"
            title={
              alsLamellen
                ? "De doorsnede gaat als geometrie naar de toetsing; die leidt de vorm zelf uit de lamellen af."
                : "Welk blad van tabel 5.2 de toetsing gebruikt als de doorsnede als eigenschappen meegaat."
            }
          >
            <span>Vorm{alsLamellen ? " (uit lamellen)" : ""}</span>
            <select
              value={vormKeuze}
              disabled={alsLamellen}
              onChange={(e) => setVormKeuze(e.target.value as CustomDoorsnedevorm | "auto")}
            >
              <option value="auto">Automatisch: {VORM_LABEL[vormVoorstel]}</option>
              {VORMEN.map((v) => <option key={v} value={v}>{VORM_LABEL[v]}</option>)}
            </select>
          </label>
          <div className="pe-voet-rechts">
            {melding && <span className="pe-voet-melding" title={melding}>{melding}</span>}
            {bewerkId && (
              <button className="pe-knop" onClick={nieuw} title="Begin een nieuwe doorsnede; de bewaarde blijft staan">
                Nieuw
              </button>
            )}
            <button className="pe-knop" onClick={onClose} title="Sluit de profieleditor">Sluiten</button>
            <button
              className="pe-knop pe-knop-primair"
              disabled={!kanOpslaan}
              onClick={slaOp}
              title={kanOpslaan ? "Bewaar de doorsnede met de berekende eigenschappen" : "Geef eerst een naam en wacht tot de motor klaar is"}
            >
              {bewerkId ? "Opslaan" : "Bewaren"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (!inModal) return inhoud;
  // Vaste maat, net als de profielkiezer: het venster hoort niet mee te
  // groeien met het aantal lamellen of met de tekening. Modal.css houdt hem
  // met max-height 90vh op een lage monitor binnen het scherm.
  return (
    <Modal open={open} onClose={onClose} title="Profieleditor — eigen doorsnede" width={1160} height={760}>
      {inhoud}
    </Modal>
  );
}
