import { useState, useRef, useEffect, type CSSProperties } from "react";
import "./ThemedSelect.css";

export interface Option {
  value: string;
  label: string;
}

export interface ThemedSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: CSSProperties;
}

/**
 * Custom dropdown select that uses the theme CSS variables.
 * Outside-click closes the menu.
 */
export function ThemedSelect({ value, options, onChange, style }: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="themed-select" ref={ref} style={style}>
      <button className="themed-select-trigger" onClick={() => setOpen(!open)}>
        <span className="themed-select-label">{selected?.label ?? value}</span>
        <svg className="themed-select-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="themed-select-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`themed-select-item${value === opt.value ? " active" : ""}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ThemedSelect;
