/**
 * ProfielEditor — eigen doorsneden samenstellen, tekenen en van een gat
 * voorzien, met de eigenschappen live uit de Rust-doorsnedemotor.
 *
 * Drie tabbladen:
 *  - Samenstellen: lamellen (platen) en catalogusprofielen als bouwstenen;
 *  - Gat in profiel: een catalogusprofiel met gaten door lijf, flens of wand;
 *  - Bewaard: de opgeslagen eigen doorsneden (bewerken, verwijderen, kiezen).
 *
 * Een bewaarde doorsnede krijgt als profielnaam `EIGEN:<naam>` (zie
 * lib/profieleditor/eigenDoorsnedenStore.ts) en gaat via `custom_section`
 * naar de toetsing.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { CustomDoorsnedevorm } from "../../lib/types/steel/CustomDoorsnedevorm";
import { basisprofielVan } from "../../lib/profieleditor/catalogus";
import {
  profielnaamVan,
  useEigenDoorsneden,
} from "../../lib/profieleditor/eigenDoorsnedenStore";
import { fmtGroep, fmtMacht } from "../../lib/profieleditor/format";
import { controleerGat, snelleSchatting } from "../../lib/profieleditor/geometrie";
import { nieuwId } from "../../lib/profieleditor/id";
import { ontwerpIsLeeg, ontwerpNaarMotor } from "../../lib/profieleditor/motorInvoer";
import { VORM_LABEL, gaatAlsLamellen, maakEigenDoorsnede, stelVormVoor } from "../../lib/profieleditor/opslaan";
import type { DoorsnedeOntwerp, EigenDoorsnede } from "../../lib/profieleditor/types";
import { useMotorBerekening } from "../../lib/profieleditor/useMotorBerekening";
import Modal from "../Modal";
import DoorsnedeTekenvlak from "./DoorsnedeTekenvlak";
import EigenDoorsnedeTekening from "./EigenDoorsnedeTekening";
import EigenschappenPaneel from "./EigenschappenPaneel";
import GatPaneel from "./GatPaneel";
import SamenstellingPaneel from "./SamenstellingPaneel";
import "./ProfielEditor.css";

type Tab = "samenstelling" | "gat" | "bewaard";
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

  const ontwerp: DoorsnedeOntwerp = tab === "gat" ? gatOntwerp : samenstelling;

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
    (id: string, dy: number, dz: number, stap = 0) => {
      const s0 = sleepStart.current;
      if (!s0) return;
      // `stap` is de rasterstap waarop de nieuwe positie mag landen; 0 betekent
      // vrij schuiven (Shift), en dan blijft het bij hele millimeters.
      const rond = (v: number) => (stap > 0 ? Math.round(v / stap) * stap : Math.round(v));
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
        <button className={`pe-tab${tab === "samenstelling" ? " actief" : ""}`} onClick={() => { setTab("samenstelling"); setGeselecteerd(null); }}>
          Samenstellen
        </button>
        <button className={`pe-tab${tab === "gat" ? " actief" : ""}`} onClick={() => { setTab("gat"); setGeselecteerd(null); }}>
          Gat in profiel
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
                    ? `${d.ontwerp.basis.naam} met ${d.ontwerp.gaten.length} gat${d.ontwerp.gaten.length === 1 ? "" : "en"}`
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
      ) : (
        <div className="pe-kolommen">
          <div className="pe-kolom pe-kolom-links">
            {tab === "samenstelling" ? (
              <SamenstellingPaneel
                ontwerp={samenstelling}
                onWijzig={setSamenstelling}
                geselecteerd={geselecteerd}
                onSelecteer={setGeselecteerd}
              />
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
      )}

      {tab !== "bewaard" && (
        <div className="pe-voet">
          <label className="pe-naam pe-naam-breed">
            <span>Naam van de doorsnede{bewerkId ? " (bewerken)" : ""}</span>
            <input
              type="text"
              value={naam}
              placeholder={ontwerp.soort === "gat" ? `${ontwerp.basis.naam} met gat` : "Gelaste ligger"}
              onChange={(e) => setNaam(e.target.value)}
            />
          </label>
          <label className="pe-naam" title="Welk blad van tabel 5.2 de toetsing gebruikt als de doorsnede als eigenschappen meegaat.">
            <span>Vorm voor de toetsing{alsLamellen ? " (uit lamellen afgeleid)" : ""}</span>
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
            {melding && <span className="pe-hint" style={{ alignSelf: "center" }}>{melding}</span>}
            {bewerkId && <button className="pe-knop" onClick={nieuw}>Nieuw</button>}
            <button className="pe-knop" onClick={onClose}>Sluiten</button>
            <button className="pe-knop pe-knop-primair" disabled={!kanOpslaan} onClick={slaOp} title={kanOpslaan ? "Bewaar de doorsnede met de berekende eigenschappen" : "Geef een naam en wacht tot de motor klaar is"}>
              {bewerkId ? "Opslaan" : "Bewaren als eigen doorsnede"}
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
