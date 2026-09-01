/**
 * DockSplitter — width/height persistence hook for SidePanel docks.
 *
 * Wraps Tauri Store under a stable key namespace so dock dimensions survive
 * window reloads. Falls back to localStorage when not running under Tauri so
 * the panels still feel sticky in browser-mode (Vite dev) preview.
 *
 * Returns `[value, setValue]` with the live width. SetValue debounces
 * persistence writes to avoid hammering the store during drag.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const STORE_FILE = "fem2d-ui.json";

type Loader = (key: string, fallback: number) => Promise<number>;
type Saver = (key: string, value: number) => Promise<void>;

let _loader: Loader | null = null;
let _saver: Saver | null = null;

async function ensureBackend(): Promise<{ load: Loader; save: Saver }> {
  if (_loader && _saver) return { load: _loader, save: _saver };

  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    // load() or create lazily on first call
    const store = await Store.load(STORE_FILE, { defaults: {} });
    _loader = async (key, fallback) => {
      const v = await store.get<number>(key);
      return typeof v === "number" ? v : fallback;
    };
    _saver = async (key, value) => {
      await store.set(key, value);
      await store.save();
    };
  } catch {
    // Browser/dev fallback — localStorage with the same key namespace.
    _loader = async (key, fallback) => {
      const raw = localStorage.getItem(`fem2d-dock.${key}`);
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };
    _saver = async (key, value) => {
      localStorage.setItem(`fem2d-dock.${key}`, String(value));
    };
  }
  return { load: _loader!, save: _saver! };
}

/**
 * usePersistedDockSize — read/write a dock dimension to Tauri Store.
 *
 * @example
 *   const [w, setW] = usePersistedDockSize("rightPanelWidth", 280);
 */
export function usePersistedDockSize(key: string, defaultValue: number) {
  const [value, setValue] = useState<number>(defaultValue);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    ensureBackend().then(({ load }) => {
      load(key, defaultValue).then((v) => {
        if (!cancelled) setValue(v);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, defaultValue]);

  // Debounced persistence on every update after initial load.
  const update = useCallback(
    (next: number) => {
      setValue(next);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        ensureBackend().then(({ save }) => save(key, next).catch(() => {}));
      }, 250);
    },
    [key]
  );

  return [value, update] as const;
}

/**
 * Well-known dock keys (kept stable across the app so Phase 8 can audit).
 */
export const DOCK_KEYS = {
  leftPanelWidth: "leftPanelWidth",
  rightPanelWidth: "rightPanelWidth",
  bottomPanelHeight: "bottomPanelHeight",
} as const;
