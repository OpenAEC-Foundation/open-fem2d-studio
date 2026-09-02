/**
 * useProjectInfo — leest de projectgegevens (instelling "projectInfo",
 * beheerd via ProjectSettingsDialog) en volgt wijzigingen live via het
 * plugin-store `onKeyChange`-event. In de browser (zonder Tauri) blijft de
 * lege fallback staan.
 */
import { useEffect, useState } from "react";
import { getSetting, onSettingChange } from "../../store";
import type { ProjectInfo } from "../project/ProjectSettingsDialog";

export const EMPTY_PROJECT_INFO: ProjectInfo = {
  name: "",
  projectNumber: "",
  engineer: "",
  company: "",
  date: "",
  description: "",
  notes: "",
  location: "",
};

export function useProjectInfo(): ProjectInfo {
  const [info, setInfo] = useState<ProjectInfo>(EMPTY_PROJECT_INFO);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    getSetting<ProjectInfo>("projectInfo", EMPTY_PROJECT_INFO).then((v) => {
      if (alive) setInfo(v);
    });
    onSettingChange<ProjectInfo>("projectInfo", (v) => {
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
