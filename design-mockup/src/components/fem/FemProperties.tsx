/**
 * FemProperties — reactive Properties panel.
 *
 * Shows different content depending on selection:
 *   - null   : soft placeholder
 *   - node   : ID + editable X/Z coords + opleg-dropdown + reactions
 *   - beam   : ID, endpoints, length, angle, material, profile, BCs, loads
 *   - plate  : ID + corner list (read-only stub)
 *
 * Mutations dispatch through the store callbacks passed in by App.tsx.
 */
import { useState, useEffect, useRef } from "react";
import "./FemProperties.css";
import type {
  Node, Beam, Plate, Support, Load, Selection, SupportType,
} from "./femTypes";
import type { SolverResult } from "./solver/types";

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="fem-prop-section">
      <button className="fem-prop-section-header" onClick={() => setOpen(!open)}>
        <span className={`fem-prop-chevron${open ? " open" : ""}`}>
          <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
            <path d="M3 2l4 3-4 3z" />
          </svg>
        </span>
        <span>{title}</span>
      </button>
      {open && <div className="fem-prop-section-body">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fem-prop-row">
      <span className="fem-prop-row-label">{label}</span>
      <span className="fem-prop-row-value">{children}</span>
    </div>
  );
}

interface FemPropertiesProps {
  selection: Selection;
  nodes: Node[];
  beams: Beam[];
  plates: Plate[];
  supports: Support[];
  loads: Load[];
  updateNode: (id: number, x: number, z: number) => void;
  addSupport: (nodeId: number, type: SupportType, k?: number) => void;
  removeSupport: (nodeId: number) => void;
  /** Patch fields on a load (q / fx / fz / my / ΔT). */
  updateLoad?: (id: number, updates: Partial<Load>) => void;
  /** Cross-panel focus hint set by the canvas q-label clicks. */
  pendingLoadFocus?: { loadId: number; field: keyof Load } | null;
  clearPendingLoadFocus?: () => void;
  results: SolverResult | null;
}

export default function FemProperties(props: FemPropertiesProps) {
  const { selection, nodes, beams, plates, supports, loads,
    updateNode, addSupport, removeSupport, updateLoad,
    pendingLoadFocus, clearPendingLoadFocus, results } = props;

  if (!selection) {
    return (
      <div className="fem-properties">
        <div className="fem-prop-empty">
          Geen selectie — klik op een knoop of element in het canvas.
        </div>
      </div>
    );
  }

  if (selection.type === "node") {
    const n = nodes.find(nn => nn.id === selection.id);
    if (!n) {
      return <div className="fem-properties"><div className="fem-prop-empty">Knoop niet gevonden.</div></div>;
    }
    return <NodeProperties
      node={n}
      supports={supports}
      updateNode={updateNode}
      addSupport={addSupport}
      removeSupport={removeSupport}
      results={results}
    />;
  }

  if (selection.type === "beam") {
    const b = beams.find(bb => bb.id === selection.id);
    if (!b) {
      return <div className="fem-properties"><div className="fem-prop-empty">Balk niet gevonden.</div></div>;
    }
    const nFrom = nodes.find(n => n.id === b.from);
    const nTo = nodes.find(n => n.id === b.to);
    return <BeamProperties beam={b} nFrom={nFrom} nTo={nTo} loads={loads} />;
  }

  if (selection.type === "plate") {
    const p = plates.find(pp => pp.id === selection.id);
    if (!p) {
      return <div className="fem-properties"><div className="fem-prop-empty">Plaat niet gevonden.</div></div>;
    }
    return <PlateProperties plate={p} nodes={nodes} />;
  }
  if (selection.type === "load") {
    const ld = loads.find(l => l.id === selection.id);
    if (!ld) {
      return <div className="fem-properties"><div className="fem-prop-empty">Belasting niet gevonden.</div></div>;
    }
    return <LoadProperties
      load={ld} beams={beams} nodes={nodes} updateLoad={updateLoad}
      pendingFocus={pendingLoadFocus} clearPendingFocus={clearPendingLoadFocus}
    />;
  }
  if (selection.type === "multi") {
    const total = selection.nodeIds.length + selection.beamIds.length + selection.plateIds.length;
    return (
      <div className="fem-properties">
        <div className="fem-prop-empty" style={{ textAlign: "left" }}>
          <strong>{total} elementen geselecteerd</strong>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11 }}>
            {selection.nodeIds.length > 0 && <li>{selection.nodeIds.length} knopen</li>}
            {selection.beamIds.length > 0 && <li>{selection.beamIds.length} balken</li>}
            {selection.plateIds.length > 0 && <li>{selection.plateIds.length} platen</li>}
          </ul>
          <p style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
            Tip: druk <kbd>G</kbd> om te verplaatsen, <kbd>R</kbd> om te roteren of <kbd>Delete</kbd> om te verwijderen.
          </p>
        </div>
      </div>
    );
  }
  return null;
}

// ── Node properties ──────────────────────────────────────────────────────
function NodeProperties({ node, supports, updateNode, addSupport, removeSupport, results }: {
  node: Node;
  supports: Support[];
  updateNode: (id: number, x: number, z: number) => void;
  addSupport: (nodeId: number, type: SupportType, k?: number) => void;
  removeSupport: (nodeId: number) => void;
  results: SolverResult | null;
}) {
  const support = supports.find(s => s.nodeId === node.id);
  // Editable coord state (string for input control), reset on node change
  const [xStr, setXStr] = useState(String(node.x));
  const [zStr, setZStr] = useState(String(node.z));
  useEffect(() => { setXStr(String(node.x)); setZStr(String(node.z)); }, [node.id, node.x, node.z]);

  const commitX = () => {
    const v = Number(xStr);
    if (Number.isFinite(v) && v !== node.x) updateNode(node.id, v, node.z);
  };
  const commitZ = () => {
    const v = Number(zStr);
    if (Number.isFinite(v) && v !== node.z) updateNode(node.id, node.x, v);
  };

  const reaction = results?.reactions.get(node.id);

  const onChangeSupport = (val: string) => {
    if (val === "none") removeSupport(node.id);
    else addSupport(node.id, val as SupportType);
  };

  return (
    <div className="fem-properties">
      <div className="fem-prop-selection">
        <span className="fem-prop-selection-label">Selectie</span>
        <span className="fem-prop-selection-value">Knoop {node.id}</span>
      </div>
      <div className="fem-prop-tabs">
        <button className="fem-prop-tab active">Algemeen</button>
      </div>
      <div className="fem-prop-body">
        <Section title="Geometrie">
          <Row label="ID"><code>{node.id}</code></Row>
          <Row label="X (mm)">
            <input
              type="number" step="50" className="fem-prop-input fem-prop-input-mono"
              value={xStr}
              onChange={e => setXStr(e.target.value)}
              onBlur={commitX}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </Row>
          <Row label="Z (mm)">
            <input
              type="number" step="50" className="fem-prop-input fem-prop-input-mono"
              value={zStr}
              onChange={e => setZStr(e.target.value)}
              onBlur={commitZ}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </Row>
        </Section>

        <Section title="Oplegging">
          <Row label="Type">
            <select className="fem-prop-select" value={support?.type ?? "none"}
              onChange={e => onChangeSupport(e.target.value)}>
              <option value="none">Geen</option>
              <option value="pinned">Scharnier</option>
              <option value="fixed">Inklemming</option>
              <option value="xRoller">X-Rol</option>
              <option value="zRoller">Z-Rol</option>
              <option value="zSpring">Z-Veer</option>
              <option value="xSpring">X-Veer</option>
              <option value="rotSpring">Rot-Veer</option>
            </select>
          </Row>
          {support?.k !== undefined && (
            <Row label="k">
              <code>{support.k}</code>
            </Row>
          )}
        </Section>

        {reaction && (
          <Section title="Reactie">
            <Row label="Fx"><code>{reaction.fx.toFixed(0)} N</code></Row>
            <Row label="Fz"><code>{reaction.fz.toFixed(0)} N</code></Row>
            <Row label="My"><code>{reaction.my.toFixed(0)} N·mm</code></Row>
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Beam properties ──────────────────────────────────────────────────────
function BeamProperties({ beam, nFrom, nTo, loads }: {
  beam: Beam; nFrom?: Node; nTo?: Node; loads: Load[];
}) {
  const dx = nTo && nFrom ? nTo.x - nFrom.x : 0;
  const dz = nTo && nFrom ? nTo.z - nFrom.z : 0;
  const L = Math.hypot(dx, dz);
  const angDeg = (Math.atan2(dz, dx) * 180 / Math.PI);
  const beamLoads = loads.filter(l => l.beamId === beam.id);

  return (
    <div className="fem-properties">
      <div className="fem-prop-selection">
        <span className="fem-prop-selection-label">Selectie</span>
        <span className="fem-prop-selection-value">Balk {beam.id}</span>
      </div>
      <div className="fem-prop-tabs">
        <button className="fem-prop-tab active">Algemeen</button>
        <button className="fem-prop-tab">EN 1993</button>
      </div>
      <div className="fem-prop-body">
        <Section title="Geometrie">
          <Row label="ID"><code>{beam.id}</code></Row>
          <Row label="Type"><code>Balk</code></Row>
          <Row label="Knoop start">
            <code>{beam.from}{nFrom ? ` (${nFrom.x}, ${nFrom.z})` : ""}</code>
          </Row>
          <Row label="Knoop eind">
            <code>{beam.to}{nTo ? ` (${nTo.x}, ${nTo.z})` : ""}</code>
          </Row>
          <Row label="Lengte"><code>{L.toFixed(0)} mm</code></Row>
          <Row label="Hoek"><code>{angDeg.toFixed(1)}°</code></Row>
        </Section>

        <Section title="Materiaal">
          <Row label="Materiaal">
            <select className="fem-prop-select" defaultValue="S235">
              <option>S235</option>
              <option>S275</option>
              <option>S355</option>
              <option>S420</option>
              <option>S460</option>
            </select>
          </Row>
          <Row label="E"><code>210000 N/mm²</code></Row>
          <Row label="fy"><code>235 N/mm²</code></Row>
        </Section>

        <Section title="Profiel">
          <Row label="Profiel">
            <select className="fem-prop-select" defaultValue="HEA 160">
              <option>HEA 160</option>
              <option>HEA 200</option>
              <option>HEB 160</option>
              <option>HEB 300</option>
              <option>IPE 200</option>
              <option>IPE 360</option>
            </select>
          </Row>
          <Row label="A"><code>3877 mm²</code></Row>
          <Row label="Iy"><code>16730000 mm⁴</code></Row>
          <Row label="Wel,y"><code>220500 mm³</code></Row>
          <Row label="Wpl,y"><code>245100 mm³</code></Row>
        </Section>

        <Section title="Randvoorwaarden" defaultOpen={false}>
          <Row label="Start scharnierend">
            <input type="checkbox" className="fem-prop-checkbox" />
          </Row>
          <Row label="Eind scharnierend">
            <input type="checkbox" className="fem-prop-checkbox" />
          </Row>
        </Section>

        <Section title="Belastingen" defaultOpen={false}>
          {beamLoads.length === 0 ? (
            <Row label="—"><code>Geen lasten op deze balk</code></Row>
          ) : beamLoads.map(l => (
            <Row key={`bl${l.id}`} label={l.type}>
              <code>
                {l.q !== undefined && `q = ${l.q} kN/m`}
                {l.deltaT !== undefined && `ΔT = ${l.deltaT} K`}
              </code>
            </Row>
          ))}
        </Section>
      </div>
    </div>
  );
}

// ── Load properties ──────────────────────────────────────────────────────
const LOAD_TYPE_LABEL: Record<Load["type"], string> = {
  lineLoad:    "Lijnlast (q)",
  pointForce:  "Puntkracht",
  pointMoment: "Puntmoment",
  thermal:     "Temperatuur (ΔT)",
};

function LoadProperties({
  load, beams, nodes, updateLoad,
  pendingFocus, clearPendingFocus,
}: {
  load: Load;
  beams: Beam[];
  nodes: Node[];
  updateLoad?: (id: number, updates: Partial<Load>) => void;
  pendingFocus?: { loadId: number; field: keyof Load } | null;
  clearPendingFocus?: () => void;
}) {
  // Refs for the value inputs so a canvas click can request focus.
  const qRef      = useRef<HTMLInputElement>(null);
  const qStartRef = useRef<HTMLInputElement>(null);
  const qEndRef   = useRef<HTMLInputElement>(null);
  const fxRef     = useRef<HTMLInputElement>(null);
  const fzRef     = useRef<HTMLInputElement>(null);
  const myRef     = useRef<HTMLInputElement>(null);
  const dtRef     = useRef<HTMLInputElement>(null);
  const refByField: Partial<Record<keyof Load, React.RefObject<HTMLInputElement | null>>> = {
    q: qRef, qStart: qStartRef, qEnd: qEndRef,
    fx: fxRef, fz: fzRef, my: myRef, deltaT: dtRef,
  };

  useEffect(() => {
    if (!pendingFocus || pendingFocus.loadId !== load.id) return;
    const ref = refByField[pendingFocus.field];
    const el = ref?.current;
    if (el) {
      // Defer slightly so the input mounts after the conditional render
      // (e.g. trapezium toggle creates qStart/qEnd inputs on the fly).
      requestAnimationFrame(() => {
        el.focus();
        el.select();
      });
    }
    clearPendingFocus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocus, load.id]);
  // Editable per-field string state — committed onBlur / Enter.
  const [qStr, setQStr] = useState(String(load.q ?? ""));
  const [qStartStr, setQStartStr] = useState(String(load.qStart ?? ""));
  const [qEndStr, setQEndStr] = useState(String(load.qEnd ?? ""));
  const [fxStr, setFxStr] = useState(String(load.fx ?? ""));
  const [fzStr, setFzStr] = useState(String(load.fz ?? ""));
  const [myStr, setMyStr] = useState(String(load.my ?? ""));
  const [dtStr, setDtStr] = useState(String(load.deltaT ?? ""));
  useEffect(() => {
    setQStr(String(load.q ?? ""));
    setQStartStr(String(load.qStart ?? ""));
    setQEndStr(String(load.qEnd ?? ""));
    setFxStr(String(load.fx ?? ""));
    setFzStr(String(load.fz ?? ""));
    setMyStr(String(load.my ?? ""));
    setDtStr(String(load.deltaT ?? ""));
  }, [load.id, load.q, load.qStart, load.qEnd, load.fx, load.fz, load.my, load.deltaT]);

  // Trapezium detection: load is trapezium if qStart or qEnd set (regardless of q).
  const isTrap = load.qStart !== undefined || load.qEnd !== undefined;
  const toggleTrap = (on: boolean) => {
    if (!updateLoad) return;
    if (on) {
      // Convert uniform → trapezium: seed both ends with current q (default 0).
      const seed = load.q ?? 0;
      updateLoad(load.id, { qStart: seed, qEnd: seed });
    } else {
      // Collapse trapezium → uniform: average of the two ends becomes q.
      const avg = ((load.qStart ?? load.q ?? 0) + (load.qEnd ?? load.q ?? 0)) / 2;
      updateLoad(load.id, { q: avg, qStart: undefined, qEnd: undefined });
    }
  };

  const commitNumber = (raw: string, field: keyof Load) => {
    const v = Number(raw);
    if (Number.isFinite(v) && updateLoad) updateLoad(load.id, { [field]: v });
  };

  const beam = load.beamId !== undefined ? beams.find(b => b.id === load.beamId) : undefined;
  const node = load.nodeId !== undefined ? nodes.find(n => n.id === load.nodeId) : undefined;
  // Beam length for context on lineLoad
  let beamLen = 0;
  if (beam) {
    const nA = nodes.find(n => n.id === beam.from);
    const nB = nodes.find(n => n.id === beam.to);
    if (nA && nB) beamLen = Math.hypot(nB.x - nA.x, nB.z - nA.z);
  }

  return (
    <div className="fem-properties">
      <div className="fem-prop-selection">
        <span className="fem-prop-selection-label">Selectie</span>
        <span className="fem-prop-selection-value">Belasting {load.id}</span>
      </div>
      <div className="fem-prop-tabs">
        <button className="fem-prop-tab active">Algemeen</button>
      </div>
      <div className="fem-prop-body">
        <Section title="Algemeen">
          <Row label="ID"><code>{load.id}</code></Row>
          <Row label="Type"><code>{LOAD_TYPE_LABEL[load.type]}</code></Row>
          <Row label="Lastgeval"><code>{load.caseId}</code></Row>
          {beam && <Row label="Op balk"><code>{beam.id} ({beam.from}–{beam.to})</code></Row>}
          {node && <Row label="Op knoop"><code>{node.id}</code></Row>}
          {beamLen > 0 && load.type === "lineLoad" && (
            <Row label="Balklengte"><code>{(beamLen / 1000).toFixed(2)} m</code></Row>
          )}
        </Section>

        {load.type === "lineLoad" && (
          <Section title="Lijnlast">
            <Row label="Richting">
              <select
                className="fem-prop-select"
                value={load.qDir ?? "z"}
                onChange={e => updateLoad?.(load.id, { qDir: e.target.value as "x" | "z" })}
              >
                <option value="z">Verticaal (+Z, gravitatie)</option>
                <option value="x">Horizontaal (+X, wind)</option>
              </select>
            </Row>
            <Row label="Trapezium">
              <input
                type="checkbox" className="fem-prop-checkbox"
                checked={isTrap}
                onChange={e => toggleTrap(e.target.checked)}
              />
            </Row>
            {!isTrap ? (
              <Row label="q (kN/m)">
                <input
                  ref={qRef}
                  type="number" step="0.1" className="fem-prop-input fem-prop-input-mono"
                  value={qStr}
                  onChange={e => setQStr(e.target.value)}
                  onBlur={() => commitNumber(qStr, "q")}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              </Row>
            ) : (
              <>
                <Row label="q_start (kN/m)">
                  <input
                    ref={qStartRef}
                    type="number" step="0.1" className="fem-prop-input fem-prop-input-mono"
                    value={qStartStr}
                    onChange={e => setQStartStr(e.target.value)}
                    onBlur={() => commitNumber(qStartStr, "qStart")}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                </Row>
                <Row label="q_end (kN/m)">
                  <input
                    ref={qEndRef}
                    type="number" step="0.1" className="fem-prop-input fem-prop-input-mono"
                    value={qEndStr}
                    onChange={e => setQEndStr(e.target.value)}
                    onBlur={() => commitNumber(qEndStr, "qEnd")}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                </Row>
              </>
            )}
            {beamLen > 0 && (
              <Row label="Totaal">
                <code>
                  {(() => {
                    // Uniform: q·L. Trapezium: (qa+qb)/2 · L.
                    const qa = load.qStart ?? load.q ?? 0;
                    const qb = load.qEnd   ?? load.q ?? 0;
                    return ((qa + qb) / 2 * beamLen / 1000).toFixed(2);
                  })()} kN
                </code>
              </Row>
            )}
            <Row label="Richting"><code>Globale +Z (gravitatie: negatief)</code></Row>
          </Section>
        )}

        {load.type === "pointForce" && (
          <Section title="Puntkracht">
            <Row label="Fx (kN)">
              <input
                ref={fxRef}
                type="number" step="0.5" className="fem-prop-input fem-prop-input-mono"
                value={fxStr}
                onChange={e => setFxStr(e.target.value)}
                onBlur={() => commitNumber(fxStr, "fx")}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </Row>
            <Row label="Fz (kN)">
              <input
                ref={fzRef}
                type="number" step="0.5" className="fem-prop-input fem-prop-input-mono"
                value={fzStr}
                onChange={e => setFzStr(e.target.value)}
                onBlur={() => commitNumber(fzStr, "fz")}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </Row>
          </Section>
        )}

        {load.type === "pointMoment" && (
          <Section title="Puntmoment">
            <Row label="My (kNm)">
              <input
                ref={myRef}
                type="number" step="0.5" className="fem-prop-input fem-prop-input-mono"
                value={myStr}
                onChange={e => setMyStr(e.target.value)}
                onBlur={() => commitNumber(myStr, "my")}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </Row>
          </Section>
        )}

        {load.type === "thermal" && (
          <Section title="Temperatuur">
            <Row label="ΔT (K)">
              <input
                ref={dtRef}
                type="number" step="1" className="fem-prop-input fem-prop-input-mono"
                value={dtStr}
                onChange={e => setDtStr(e.target.value)}
                onBlur={() => commitNumber(dtStr, "deltaT")}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </Row>
            <Row label="α"><code>1.2·10⁻⁵ /K (staal)</code></Row>
          </Section>
        )}

        <Section title="Acties" defaultOpen={false}>
          <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--theme-text-faint)" }}>
            Druk <kbd>Delete</kbd> om deze belasting te verwijderen.
          </div>
        </Section>
      </div>
    </div>
  );
}

// ── Plate properties ─────────────────────────────────────────────────────
function PlateProperties({ plate, nodes }: { plate: Plate; nodes: Node[] }) {
  return (
    <div className="fem-properties">
      <div className="fem-prop-selection">
        <span className="fem-prop-selection-label">Selectie</span>
        <span className="fem-prop-selection-value">Plaat {plate.id}</span>
      </div>
      <div className="fem-prop-tabs">
        <button className="fem-prop-tab active">Algemeen</button>
      </div>
      <div className="fem-prop-body">
        <Section title="Geometrie">
          <Row label="ID"><code>{plate.id}</code></Row>
          <Row label="Hoeken"><code>{plate.nodeIds.length}</code></Row>
          {plate.nodeIds.map((id, i) => {
            const n = nodes.find(nn => nn.id === id);
            return <Row key={`pc${i}`} label={`Hoek ${i + 1}`}>
              <code>{id}{n ? ` (${n.x}, ${n.z})` : ""}</code>
            </Row>;
          })}
        </Section>
        <Section title="Materiaal">
          <Row label="Materiaal">
            <select className="fem-prop-select" defaultValue="S235"><option>S235</option></select>
          </Row>
          <Row label="Dikte"><code>20 mm</code></Row>
        </Section>
      </div>
    </div>
  );
}
