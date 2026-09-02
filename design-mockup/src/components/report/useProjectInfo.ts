/**
 * useProjectInfo — leest de projectgegevens (instelling "projectInfo",
 * beheerd via ProjectSettingsDialog) en volgt wijzigingen live via het
 * plugin-store `onKeyChange`-event. In de browser (zonder Tauri) blijft de
 * lege fallback staan.
 */
import { useEffect, useState } from "react";
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

export function useProjectInfo(): ReportProjectInfo {
  const [info, setInfo] = useState<ReportProjectInfo>(EMPTY_PROJECT_INFO);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    getSetting<ReportProjectInfo>("projectInfo", EMPTY_PROJECT_INFO).then((v) => {
      if (alive) setInfo(v);
    });
    onSettingChange<ReportProjectInfo>("projectInfo", (v) => {
      if (alive) setInfo(v ?? EMPTY_PROJECT_INFO);
    }).then((u) => {
      if (!alive) u();
      else unlisten = u;
    });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return info;
}
