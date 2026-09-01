/**
 * notify.ts — non-blocking notification helper. Uses the ToastHost that
 * mounts near the app root. Falls back to alert() if the ToastHost hasn't
 * mounted yet (edge case; first paint of an error).
 */
import { pushToast } from "../components/feedback/Toast";

/** Toon "binnenkort beschikbaar" voor een feature die nog niet werkt. */
export function comingSoon(label: string, note?: string): void {
  try {
    pushToast({
      kind: "soon",
      title: `${label} — binnenkort`,
      body: note ?? "Deze functie zit op de roadmap voor een volgende release.",
      duration: 5500,
    });
  } catch {
    alert(`${label} is nog niet beschikbaar in v2.\n\n${note ?? ""}`);
  }
}

/** Eenvoudige info-notificatie. */
export function notifyInfo(title: string, body?: string): void {
  try {
    pushToast({ kind: "info", title, body });
  } catch {
    alert(body ? `${title}\n\n${body}` : title);
  }
}

/** Succes-notificatie (groen). */
export function notifySuccess(title: string, body?: string): void {
  try {
    pushToast({ kind: "success", title, body });
  } catch {
    alert(body ? `${title}\n\n${body}` : title);
  }
}

/** Waarschuwing (amber). */
export function notifyWarning(title: string, body?: string): void {
  try {
    pushToast({ kind: "warning", title, body });
  } catch {
    alert(body ? `${title}\n\n${body}` : title);
  }
}
