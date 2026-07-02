/**
 * Toast — lightweight top-right notification banners. Non-blocking (unlike
 * alert()). Rendered via a portal-like fixed container. Manage state through
 * the `notify.ts` helper so call-sites stay tiny.
 */
import { useEffect, useState } from "react";
import "./Toast.css";

export type ToastKind = "info" | "success" | "warning" | "soon";

export interface ToastData {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  duration?: number;   // ms, default 4500
}

let nextId = 1;
type Listener = (t: ToastData) => void;
const listeners = new Set<Listener>();

export function pushToast(t: Omit<ToastData, "id">): void {
  const data: ToastData = { id: nextId++, ...t };
  listeners.forEach(l => l(data));
}

/** React component — mount once near the root; it subscribes to `pushToast`. */
export default function ToastHost() {
  const [items, setItems] = useState<ToastData[]>([]);

  useEffect(() => {
    const onPush: Listener = (t) => {
      setItems(prev => [...prev, t]);
      const d = t.duration ?? 4500;
      window.setTimeout(() => {
        setItems(prev => prev.filter(x => x.id !== t.id));
      }, d);
    };
    listeners.add(onPush);
    return () => { listeners.delete(onPush); };
  }, []);

  const dismiss = (id: number) => setItems(prev => prev.filter(x => x.id !== id));

  if (items.length === 0) return null;

  return (
    <div className="toast-host">
      {items.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status">
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-text">{t.body}</div>}
          </div>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Sluiten">×</button>
        </div>
      ))}
    </div>
  );
}
