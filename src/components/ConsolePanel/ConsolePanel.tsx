import { useState, useEffect, useRef, useCallback } from 'react';
import { useFEM } from '../../context/FEMContext';
import { ConsoleService, ConsoleEntry } from '../../core/console/ConsoleService';
import { X, Trash2 } from 'lucide-react';
import './ConsolePanel.css';

interface ConsolePanelProps {
  onClose: () => void;
}

export function ConsolePanel({ onClose }: ConsolePanelProps) {
  const { state, dispatch } = useFEM();
  const [entries, setEntries] = useState<ConsoleEntry[]>(() => ConsoleService.getEntries());
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<'javascript' | 'python' | 'rust'>('javascript');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return ConsoleService.subscribe(setEntries);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries]);

  // Log welcome message on first mount
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (entries.length === 0) {
        ConsoleService.log('Console ready. Access mesh, state, dispatch in JS. Type help() for commands.');
      }
    }
  }, []);

  const execute = useCallback(() => {
    const code = input.trim();
    if (!code) return;

    setHistory(prev => [...prev.filter(h => h !== code), code]);
    setHistoryIndex(-1);
    setInput('');

    if (language === 'javascript') {
      // Built-in help command
      if (code === 'help()' || code === 'help') {
        ConsoleService.log(
          'Available objects:\n' +
          '  mesh    — Mesh instance (nodes, beamElements, elements, materials, sections)\n' +
          '  state   — Full FEM state (result, loadCases, viewMode, ...)\n' +
          '  dispatch({ type, payload }) — Dispatch FEM actions\n' +
          '  console.log(...)  — Print to console\n\n' +
          'Examples:\n' +
          '  mesh.nodes.size\n' +
          '  mesh.getBeamCount()\n' +
          '  Array.from(mesh.beamElements.values()).map(b => b.profileName)\n' +
          '  state.result?.maxVonMises\n' +
          '  dispatch({ type: "REFRESH_MESH" })',
          'output'
        );
        return;
      }

      // Wrap expression in return if it doesn't contain statements
      let execCode = code;
      if (!code.includes(';') && !code.startsWith('var ') && !code.startsWith('let ') && !code.startsWith('const ') && !code.startsWith('if') && !code.startsWith('for') && !code.startsWith('function')) {
        execCode = `return (${code})`;
      }

      ConsoleService.executeJS(execCode, { mesh: state.mesh, state, dispatch });
    } else {
      ConsoleService.executePlaceholder(code, language);
    }
  }, [input, language, state, dispatch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      execute();
    } else if (e.key === 'ArrowUp') {
      if (history.length === 0) return;
      e.preventDefault();
      const newIndex = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInput(history[newIndex]);
    } else if (e.key === 'ArrowDown') {
      if (historyIndex < 0) return;
      e.preventDefault();
      if (historyIndex >= history.length - 1) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="console-panel">
      <div className="console-panel-header">
        <div className="console-header-left">
          <span>Console</span>
          <select
            className="console-lang-select"
            value={language}
            onChange={e => setLanguage(e.target.value as any)}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="rust">Rust</option>
          </select>
        </div>
        <div className="console-header-right">
          <button className="console-header-btn" onClick={() => ConsoleService.clear()} title="Clear console">
            <Trash2 size={14} />
          </button>
          <button className="console-header-btn" onClick={onClose} title="Close console">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="console-body" ref={bodyRef}>
        {entries.length === 0 ? (
          <div className="console-empty">
            <p>No output yet.<br />Type a JS expression and press Enter.</p>
          </div>
        ) : (
          entries.map(entry => (
            <div key={entry.id} className={`console-entry console-entry-${entry.type}`}>
              <span className="console-entry-timestamp">{formatTime(entry.timestamp)}</span>
              {entry.content}
            </div>
          ))
        )}
      </div>

      <div className="console-input-area">
        <div className="console-input-wrapper">
          <span className="console-prompt">&gt;</span>
          <textarea
            ref={inputRef}
            className="console-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={language === 'javascript' ? 'mesh.nodes.size' : `${language} expression...`}
            rows={1}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
