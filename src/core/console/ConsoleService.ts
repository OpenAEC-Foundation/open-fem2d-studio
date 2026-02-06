export interface ConsoleEntry {
  id: number;
  timestamp: number;
  type: 'input' | 'output' | 'error' | 'system' | 'dispatch';
  language?: 'javascript' | 'python' | 'rust';
  content: string;
}

type ConsoleListener = (entries: ConsoleEntry[]) => void;

/** High-frequency actions excluded from dispatch logging */
const SILENT_ACTIONS = new Set([
  'SET_MOUSE_WORLD_POS',
  'SET_VIEW_STATE',
  'SET_CANVAS_SIZE',
  'SET_CANVAS_CAPTURE',
  'CLEAR_CANVAS_CAPTURES',
]);

class ConsoleServiceImpl {
  private entries: ConsoleEntry[] = [];
  private listeners = new Set<ConsoleListener>();
  private nextId = 1;

  getEntries(): ConsoleEntry[] {
    return this.entries;
  }

  subscribe(listener: ConsoleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snapshot = [...this.entries];
    this.listeners.forEach(fn => fn(snapshot));
  }

  private addEntry(entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) {
    this.entries.push({
      ...entry,
      id: this.nextId++,
      timestamp: Date.now(),
    });
    // Cap at 500 entries
    if (this.entries.length > 500) {
      this.entries = this.entries.slice(-400);
    }
    this.notify();
  }

  log(content: string, type: ConsoleEntry['type'] = 'system') {
    this.addEntry({ type, content });
  }

  logDispatch(actionType: string, payload?: unknown) {
    if (SILENT_ACTIONS.has(actionType)) return;
    let content = `dispatch: ${actionType}`;
    if (payload !== undefined) {
      try {
        const s = JSON.stringify(payload, (_k, v) => {
          if (v instanceof Map) return `Map(${v.size})`;
          if (v instanceof Set) return `Set(${v.size})`;
          if (typeof v === 'function') return '[Function]';
          return v;
        });
        if (s && s.length < 200) content += ` → ${s}`;
      } catch { /* ignore */ }
    }
    this.addEntry({ type: 'dispatch', content });
  }

  /** Execute JavaScript code with access to mesh, state, dispatch */
  executeJS(
    code: string,
    context: { mesh: any; state: any; dispatch: (action: any) => void }
  ) {
    this.addEntry({ type: 'input', language: 'javascript', content: code });

    try {
      // Build a function with named parameters for context
      const fn = new Function('mesh', 'state', 'dispatch', 'console', code);
      const consoleMock = {
        log: (...args: any[]) => {
          this.addEntry({ type: 'output', content: args.map(a => {
            try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
            catch { return String(a); }
          }).join(' ') });
        },
        error: (...args: any[]) => {
          this.addEntry({ type: 'error', content: args.map(String).join(' ') });
        },
        warn: (...args: any[]) => {
          this.addEntry({ type: 'output', content: `⚠ ${args.map(String).join(' ')}` });
        },
      };

      const result = fn(context.mesh, context.state, context.dispatch, consoleMock);
      if (result !== undefined) {
        let display: string;
        try {
          display = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
        } catch {
          display = String(result);
        }
        this.addEntry({ type: 'output', content: display });
      }
    } catch (err: any) {
      this.addEntry({ type: 'error', content: err.message || String(err) });
    }
  }

  /** Placeholder for Python / Rust */
  executePlaceholder(code: string, language: 'python' | 'rust') {
    this.addEntry({ type: 'input', language, content: code });
    this.addEntry({
      type: 'system',
      content: `${language.charAt(0).toUpperCase() + language.slice(1)} execution is not available in the browser. Use the Electron desktop app with the Python/Rust backend.`,
    });
  }

  clear() {
    this.entries = [];
    this.nextId = 1;
    this.notify();
  }
}

export const ConsoleService = new ConsoleServiceImpl();
