/**
 * useProjectInfo — leest de projectgegevens (instelling "projectInfo",
 * beheerd via ProjectSettingsDialog) en volgt wijzigingen live via het
 * plugin-store `onKeyChange`-event. In de browser (zonder Tauri) blijft de
 * lege fallback staan.
 *
 * Daarnaast, alleen voor het RAPPORT: een tijdelijke overschrijving van de
 * kop (`zetRapportKopOverschrijving`), gebruikt door de export naar PDF via
 * het bedieningskanaal. Zie `useRapportProjectInfo` voor het waarom.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getSetting, onSettingChange } from "../../store";
import type { ProjectInfo } from "../project/ProjectSettingsDialog";

/**
 * Projectinfo + rapportspecifieke velden. De koptekst-regel wordt in
 * DEZELFDE "projectInfo"-setting opgeslagen (extra veld); het
 * ProjectSettingsDialog laat onbekende velden bij opslaan intact
 * (object-spread), dus de regel overleeft een dialoog-rondgang.
 */
export interface ReportProjectInfo extends ProjectInfo {
  /** Vrije koptekst-regel bovenaan het rapport (bedrijfsregel/briefhoofd). */
  reportHeader?: string;
}

export const EMPTY_PROJECT_INFO: ReportProjectInfo = {
  name: "",
  projectNumber: "",
  engineer: "",
  company: "",
  date: "",
  description: "",
  notes: "",
  location: "",
  reportHeader: "",
};

/**
 * Aantal hookinstanties waarvan de EERSTE lezing nog onderweg is. De export
 * naar PDF wacht hierop: een kop die pas na de laatste pagineerslag binnenkomt,
 * zou anders "Naamloos project" op papier zetten terwijl er wél een naam is.
 */
let openLaadacties = 0;
/** De laatst gelezen projectgegevens (voor het antwoord van de export). */
let laatstBekend: ReportProjectInfo = EMPTY_PROJECT_INFO;

export function projectInfoLaadtNog(): boolean {
  return openLaadacties > 0;
}

export function laatstBekendeProjectInfo(): ReportProjectInfo {
  return laatstBekend;
}

export function useProjectInfo(): ReportProjectInfo {
  const [info, setInfo] = useState<ReportProjectInfo>(EMPTY_PROJECT_INFO);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    let afgemeld = false;
    openLaadacties += 1;
    const meldAf = () => {
      if (afgemeld) return;
      afgemeld = true;
      openLaadacties -= 1;
    };

    getSetting<ReportProjectInfo>("projectInfo", EMPTY_PROJECT_INFO).then(
      (v) => {
        if (alive) {
          laatstBekend = v;
          setInfo(v);
        }
        meldAf();
      },
      meldAf,
    );
    onSettingChange<ReportProjectInfo>("projectInfo", (v) => {
      if (alive) {
        laatstBekend = v ?? EMPTY_PROJECT_INFO;
        setInfo(v ?? EMPTY_PROJECT_INFO);
      }
    }).then((u) => {
      if (!alive) u();
      else unlisten = u;
    });

    return () => {
      alive = false;
      meldAf();
      unlisten?.();
    };
  }, []);

  return info;
}

// ── De kop van één export ───────────────────────────────────────────────────

/** De velden van de kop die een export mag meegeven. */
export type RapportKop = Pick<
  ReportProjectInfo,
  "name" | "projectNumber" | "engineer" | "company" | "date"
>;

let kopOverschrijving: RapportKop | null = null;
const kopLuisteraars = new Set<() => void>();

/**
 * Zet (of wist, met null) de kop voor ÉÉN export.
 *
 * WAAROM NIET VIA DE INSTELLING. De projectgegevens staan in
 * `preferences.json` van de plugin-store: MACHINEBREED, over sessies heen, en
 * gedeeld met elke andere app-instantie. Bovendien draagt dezelfde instelling
 * de uitgangspunten, en de gevolgklasse daaruit stuurt de partiële factoren van
 * de combinaties (App.tsx → useFemStore). Wie de kop via die instelling zou
 * zetten, verandert dus blijvend de gegevens van de gebruiker — en loopt het
 * risico de berekening zelf ongeldig te maken. Deze overschrijving leeft
 * alleen in het geheugen van dit venster en raakt alleen de rapportkop.
 */
export function zetRapportKopOverschrijving(kop: RapportKop | null): void {
  kopOverschrijving = kop ? { ...kop } : null;
  kopLuisteraars.forEach((f) => f());
}

export function leesRapportKopOverschrijving(): RapportKop | null {
  return kopOverschrijving;
}

function abonneerKop(f: () => void): () => void {
  kopLuisteraars.add(f);
  return () => {
    kopLuisteraars.delete(f);
  };
}

/**
 * Pas een kopoverschrijving toe op de projectgegevens.
 *
 * Met een overschrijving komen ALLE tekstvelden van de kop uit de export: wat
 * de export niet noemt, blijft leeg. Anders zou een rapport voor project B de
 * omschrijving, locatie of koptekst-regel van het vorige project A dragen — de
 * instelling is machinebreed, zie hierboven. De UITGANGSPUNTEN (gevolgklasse,
 * levensduur, normkeuze) blijven wel die van de instelling: daarmee is
 * gerekend, en het rapport hoort te zeggen waarmee.
 */
export function kopMetOverschrijving(
  basis: ReportProjectInfo,
  kop: RapportKop | null,
): ReportProjectInfo {
  if (!kop) return basis;
  return {
    ...EMPTY_PROJECT_INFO,
    uitgangspunten: basis.uitgangspunten,
    name: kop.name,
    projectNumber: kop.projectNumber,
    engineer: kop.engineer,
    company: kop.company,
    date: kop.date,
  };
}

/**
 * De projectgegevens zoals het RAPPORT ze toont: de instelling, of — tijdens
 * een export met eigen kop — de overschrijving. Alleen voor weergave; wie
 * iets terugschrijft naar de instelling, gebruikt `useProjectInfo`.
 */
export function useRapportProjectInfo(): ReportProjectInfo {
  const basis = useProjectInfo();
  const kop = useSyncExternalStore(abonneerKop, leesRapportKopOverschrijving, leesRapportKopOverschrijving);
  return useMemo(() => kopMetOverschrijving(basis, kop), [basis, kop]);
}
