import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ForcePoint } from "../../lib/types/steel/ForcePoint";
import type { MnKappaRequest } from "../../lib/types/concrete/MnKappaRequest";
import type { MnKappaResponse } from "../../lib/types/concrete/MnKappaResponse";
import { vertaal } from "../../lib/vertaalbareTekst";
import { controleerKorfMelding, maat, type Wapeningskorf } from "./wapeningskorf";
import { berekenMnKappa } from "./betonKern";
import MNKappaGrafiek from "./MNKappaGrafiek";
import DoorsnedeTekening from "./DoorsnedeTekening";
import Modal from "../Modal";

/** Interpoleer alleen binnen dezelfde combinatie; nooit tussen omhullende-extremen. */
export function krachtenOpSnede(punten: readonly ForcePoint[], xMm: number) {
  return [...new Set(punten.map(p => p.combination_id))].flatMap(combinatie => {
    const p = punten.filter(p => p.combination_id === combinatie && Number.isFinite(p.position_mm) &&
      Number.isFinite(p.forces.n_ed) && Number.isFinite(p.forces.my_ed)).sort((a, b) => a.position_mm - b.position_mm);
    const exact = p.filter(p => Math.abs(p.position_mm - xMm) < 1e-6);
    if (exact.length) return exact.map(p => ({ combinatie, n: p.forces.n_ed, m: p.forces.my_ed, interpolatie: false }));
    const rechts = p.find(p => p.position_mm > xMm);
    const links = [...p].reverse().find(p => p.position_mm < xMm);
    if (!links || !rechts) return [];
    const f = (xMm - links.position_mm) / (rechts.position_mm - links.position_mm);
    return [{ combinatie, n: links.forces.n_ed + f * (rechts.forces.n_ed - links.forces.n_ed),
      m: links.forces.my_ed + f * (rechts.forces.my_ed - links.forces.my_ed), interpolatie: true }];
  }).filter((p, i, alle) => alle.findIndex(q => q.combinatie === p.combinatie && q.n === p.n && q.m === p.m) === i);
}

interface Props {
  korf: Wapeningskorf; xMm: number; forces: readonly ForcePoint[];
  bijlage: MnKappaRequest["bijlage"]; onSluiten: () => void;
}

export default function MnKappaDialoog(props: Props) {
  const vorigeFocus = useRef(document.activeElement);
  useEffect(() => () => {
    const el = vorigeFocus.current;
    if (el instanceof HTMLElement || el instanceof SVGElement) el.focus();
  }, []);
  // Bronwijziging is een nieuwe invoer, ook als de aanroeper niet remount.
  // Handmatige N en een lopende aanvraag mogen niet meeliften naar die bron.
  return <MnKappaInhoud key={JSON.stringify([props.korf, props.xMm, props.forces, props.bijlage])} {...props} />;
}

function MnKappaInhoud({ korf, xMm, forces, bijlage, onSluiten }: Props) {
  const { t } = useTranslation("check");
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const krachten = useMemo(() => krachtenOpSnede(forces, xMm), [forces, xMm]);
  const [bron, setBron] = useState(krachten.length === 1 ? "0" : "");
  const [n, setN] = useState(krachten.length === 1 ? String(krachten[0].n) : "");
  const [teken, setTeken] = useState(krachten.length === 1 && krachten[0].m < 0 ? -1 : 1);
  const [situatie, setSituatie] = useState<MnKappaRequest["design_situation"]>("PersistentTransient");
  const [resultaat, setResultaat] = useState<{ sleutel: string; antwoord?: MnKappaResponse; fout?: string; bezig?: boolean } | null>(null);
  const volgnummer = useRef(0);
  const melding = controleerKorfMelding(korf);
  const geldig = n.trim() !== "" && Number.isFinite(Number(n)) && !melding;
  const verzoek: MnKappaRequest = { bijlage, section: korf.doorsnede, concrete_class: korf.betonklasse,
    reinforcement_grade: korf.staalsoort, cage: korf.korf, n_ed_kn: Number(n), moment_sign: teken,
    n_strips: korf.aantalStroken, steel_branch: korf.staaltak, design_situation: situatie, interaction_points: 0 };
  const sleutel = JSON.stringify([verzoek, n, bron, forces, xMm]);
  const actueel = resultaat?.sleutel === sleutel && geldig ? resultaat : null;
  const title = t("concrete.sectionCurve.title", { x: maat(xMm) });
  useLayoutEffect(() => {
    const dialoog = ref.current?.closest<HTMLElement>(".modal-dialog");
    dialoog?.setAttribute("role", "dialog");
    dialoog?.setAttribute("aria-modal", "true");
    dialoog?.setAttribute("aria-label", title);
    ref.current?.querySelector<HTMLInputElement>('input[name="n-ed"]')?.focus();
  }, [title]);
  useEffect(() => {
    const toetsen = (e: KeyboardEvent) => {
      const dialoog = ref.current?.closest<HTMLElement>(".modal-dialog");
      if (!dialoog) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onSluiten(); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.stopImmediatePropagation();
        if (!(e.target instanceof HTMLElement && e.target.matches("input, textarea, [contenteditable=true]"))) e.preventDefault();
      }
      if (e.key === "Tab") {
        const velden = [...dialoog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
        const eerste = velden[0], laatste = velden[velden.length - 1];
        if (!dialoog.contains(document.activeElement) || (e.shiftKey ? document.activeElement === eerste : document.activeElement === laatste)) {
          e.preventDefault(); (e.shiftKey ? laatste : eerste)?.focus();
        }
      }
    };
    window.addEventListener("keydown", toetsen, true);
    return () => { window.removeEventListener("keydown", toetsen, true); };
  }, [onSluiten]);
  useEffect(() => {
    ++volgnummer.current;
    setResultaat(null);
    // Eén expliciete bron of een gekozen combinatie levert direct het diagram.
    const timer = bron !== "" && geldig ? window.setTimeout(() => { void bereken(); }, 0) : undefined;
    return () => { ++volgnummer.current; window.clearTimeout(timer); };
  }, [sleutel]);
  const bereken = async () => {
    if (!geldig) return;
    const nummer = ++volgnummer.current;
    setResultaat({ sleutel, bezig: true });
    try {
      const antwoord = await berekenMnKappa(verzoek);
      if (nummer === volgnummer.current) setResultaat({ sleutel, antwoord });
    } catch (e) {
      if (nummer === volgnummer.current) setResultaat({ sleutel, fout: e instanceof Error ? e.message : String(e) });
    }
  };
  return <Modal open onClose={onSluiten} title={title} width={760} className="dek-mnkappa">
    <div ref={ref} className="dek-mnkappa-body">
      <div><DoorsnedeTekening korf={korf} />
        <p>{t("concrete.sectionCurve.assumptions", { bijlage })}</p>
      </div>
      <form onSubmit={e => { e.preventDefault(); void bereken(); }}>
        {krachten.length > 0 && <label>{t("concrete.sectionCurve.source")}
          <select className="beton-invoer" value={bron} onChange={e => {
            setBron(e.target.value);
            const kracht = krachten[Number(e.target.value)];
            if (e.target.value !== "" && kracht) { setN(String(kracht.n)); setTeken(kracht.m < 0 ? -1 : 1); }
            else setN("");
          }}><option value="">{t("concrete.sectionCurve.manual")}</option>
            {krachten.map((p, i) => <option key={i} value={i}>{t("concrete.sectionCurve.combination", { id: p.combinatie })} · N = {maat(p.n)} kN{p.interpolatie ? ` · ${t("concrete.sectionCurve.interpolated")}` : ""}</option>)}
          </select></label>}
        <label htmlFor={`${id}-n`}>{t("concrete.sectionCurve.nLabel")}</label>
        <input className="beton-invoer" id={`${id}-n`} name="n-ed" type="number" step="any" value={n} required aria-describedby={`${id}-n-help`}
          onChange={e => { setN(e.target.value); setBron(""); }} />
        <p id={`${id}-n-help`}>{t(bron === "" ? "concrete.sectionCurve.enterN" : "concrete.sectionCurve.resultN")}</p>
        <label>{t("concrete.sectionCurve.direction")}<select className="beton-invoer" value={teken} onChange={e => setTeken(Number(e.target.value))}>
          <option value={1}>{t("concrete.zoneInteraction.bottom")}</option><option value={-1}>{t("concrete.zoneInteraction.top")}</option>
        </select></label>
        <label>{t("concrete.sectionCurve.situation")}<select className="beton-invoer" value={situatie} onChange={e => setSituatie(e.target.value as MnKappaRequest["design_situation"])}>
          <option value="PersistentTransient">{t("concrete.sectionCurve.persistent")}</option><option value="Accidental">{t("concrete.sectionCurve.accidental")}</option>
        </select></label>
        <button type="submit" className="dek-knop dek-knop-primair" disabled={!geldig || actueel?.bezig}>{t("concrete.sectionCurve.calculate")}</button>
        {melding && <p role="alert">{vertaal(t, melding)}</p>}
        {actueel?.bezig && <p role="status">{t("concrete.memberWindow.engineBusy")}</p>}
        {actueel?.fout && <p role="alert">{actueel.fout}</p>}
        <MNKappaGrafiek diagram={actueel?.antwoord?.diagram ?? null} />
      </form>
    </div>
  </Modal>;
}
