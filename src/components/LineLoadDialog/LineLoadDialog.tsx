import { useState, useCallback, useEffect } from 'react';
import { Lock, Unlock, CloudDownload, Loader2, AlertCircle, Check } from 'lucide-react';
import './LineLoadDialog.css';

// -- OpenReport integration types & helper --

interface OpenReportLoad {
  name: string;
  value: number;
  unit: string;
}

interface OpenReportState {
  visible: boolean;
  baseUrl: string;
  projectRef: string;
  loading: boolean;
  error: string | null;
  loads: OpenReportLoad[];
  selectedIndex: number | null;
}

const OPENREPORT_DEFAULT_URL = 'http://localhost:8080';

async function fetchOpenReportLoads(
  baseUrl: string,
  projectRef: string,
): Promise<OpenReportLoad[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/loads?project=${encodeURIComponent(projectRef)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.loads || !Array.isArray(data.loads)) {
      throw new Error('Invalid response: expected { loads: [...] }');
    }
    return data.loads as OpenReportLoad[];
  } finally {
    clearTimeout(timeoutId);
  }
}

interface LineLoadDialogProps {
  initialQx: number;
  initialQy: number;
  initialQxEnd?: number;
  initialQyEnd?: number;
  initialStartT?: number;
  initialEndT?: number;
  initialCoordSystem?: 'local' | 'global';
  initialDescription?: string;
  beamLength?: number; // beam length in meters
  loadCases: { id: number; name: string }[];
  activeLoadCase: number;
  onApply: (qx: number, qy: number, lcId: number, startT: number, endT: number, coordSystem: 'local' | 'global', qxEnd?: number, qyEnd?: number, description?: string) => void;
  onCancel: () => void;
  /** Called on every value change so the canvas can show a live preview of the load arrows */
  onPreview?: (qx: number, qy: number, coordSystem: 'local' | 'global', startT: number, endT: number, qxEnd?: number, qyEnd?: number) => void;
  edgeMode?: boolean;
  edgeId?: number;
  edgeLength?: number;
}

export function LineLoadDialog({
  initialQx,
  initialQy,
  initialQxEnd,
  initialQyEnd,
  initialStartT,
  initialEndT,
  initialCoordSystem,
  initialDescription,
  beamLength,
  loadCases,
  activeLoadCase,
  onApply,
  onCancel,
  onPreview,
  edgeMode,
  // edgeId not used internally — available via props for potential future use
  edgeLength,
}: LineLoadDialogProps) {
  const [qy, setQy] = useState((initialQy / 1000).toString());
  const [qx, setQx] = useState((initialQx / 1000).toString());
  const [selectedLC, setSelectedLC] = useState(activeLoadCase);
  const [coordSystem, setCoordSystem] = useState<'local' | 'global'>(initialCoordSystem ?? (edgeMode ? 'global' : 'local'));
  const [description, setDescription] = useState(initialDescription ?? '');

  // Variable load (trapezoidal): q1 = start, q2 = end
  const isInitiallyVariable = initialQyEnd !== undefined && initialQyEnd !== initialQy;
  const [variableUnlocked, setVariableUnlocked] = useState(isInitiallyVariable);
  const [qyEnd, setQyEnd] = useState(
    isInitiallyVariable ? ((initialQyEnd!) / 1000).toString() : (initialQy / 1000).toString()
  );
  const [qxEnd, setQxEnd] = useState(
    ((initialQxEnd ?? initialQx) / 1000).toString()
  );

  // -- OpenReport integration state --
  const [openReport, setOpenReport] = useState<OpenReportState>({
    visible: false,
    baseUrl: OPENREPORT_DEFAULT_URL,
    projectRef: '',
    loading: false,
    error: null,
    loads: [],
    selectedIndex: null,
  });

  const toggleOpenReport = () => {
    setOpenReport(prev => ({
      ...prev,
      visible: !prev.visible,
      error: null,
    }));
  };

  const handleOpenReportFetch = useCallback(async () => {
    if (!openReport.projectRef.trim()) {
      setOpenReport(prev => ({ ...prev, error: 'Please enter a project reference.' }));
      return;
    }
    setOpenReport(prev => ({ ...prev, loading: true, error: null, loads: [], selectedIndex: null }));
    try {
      const loads = await fetchOpenReportLoads(openReport.baseUrl, openReport.projectRef);
      if (loads.length === 0) {
        setOpenReport(prev => ({ ...prev, loading: false, error: 'No loads found for this project.' }));
      } else {
        setOpenReport(prev => ({ ...prev, loading: false, loads }));
      }
    } catch (err: unknown) {
      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Request timed out. Is the OpenReport service running?'
          : err instanceof TypeError && (err.message === 'Failed to fetch' || err.message.includes('NetworkError'))
            ? 'Could not connect to OpenReport service. Check the URL and make sure the service is running.'
            : err instanceof Error
              ? err.message
              : 'Unknown error while contacting OpenReport.';
      setOpenReport(prev => ({ ...prev, loading: false, error: message }));
    }
  }, [openReport.baseUrl, openReport.projectRef]);

  const handleOpenReportSelect = (index: number) => {
    const load = openReport.loads[index];
    if (!load) return;
    setOpenReport(prev => ({ ...prev, selectedIndex: index }));
    // Convert the load value to kN/m for the qy field.
    // OpenReport returns values in kN/m by default; if the unit differs we note it.
    let valueKNm = load.value;
    if (load.unit === 'N/m') {
      valueKNm = load.value / 1000;
    } else if (load.unit === 'kN/m' || load.unit === 'kN/m\'') {
      valueKNm = load.value;
    }
    // Fill the qy (qz) start value; if variable is unlocked, also fill end
    setQy(valueKNm.toString());
    if (!variableUnlocked) {
      setQyEnd(valueKNm.toString());
    }
  };

  // Store positions as absolute mm values when beam length is known
  const effectiveLength = edgeMode ? edgeLength : beamLength;
  const L = effectiveLength ?? 1;
  const hasLength = effectiveLength !== undefined && effectiveLength > 0;
  const [startMm, setStartMm] = useState(
    hasLength ? ((initialStartT ?? 0) * L * 1000).toFixed(0) : (initialStartT ?? 0).toString()
  );
  const [loadLengthMm, setLoadLengthMm] = useState(
    hasLength
      ? (((initialEndT ?? 1) - (initialStartT ?? 0)) * L * 1000).toFixed(0)
      : ((initialEndT ?? 1) - (initialStartT ?? 0)).toString()
  );

  // Live preview: update beam arrows on canvas as user types
  useEffect(() => {
    if (!onPreview) return;
    const valQy = parseFloat(qy);
    const valQx = parseFloat(qx);
    if (isNaN(valQy) && isNaN(valQx)) return;
    const qxVal = isNaN(valQx) ? 0 : valQx * 1000;
    const qyVal = isNaN(valQy) ? 0 : valQy * 1000;

    let startT: number;
    let endT: number;
    if (hasLength) {
      const sv = parseFloat(startMm);
      const lv = parseFloat(loadLengthMm);
      startT = isNaN(sv) ? 0 : Math.max(0, Math.min(1, (sv / 1000) / L));
      endT = isNaN(lv) ? 1 : Math.max(startT, Math.min(1, startT + (lv / 1000) / L));
    } else {
      startT = parseFloat(startMm);
      endT = startT + parseFloat(loadLengthMm);
      if (isNaN(startT)) startT = 0;
      if (isNaN(endT)) endT = 1;
      startT = Math.max(0, Math.min(1, startT));
      endT = Math.max(startT, Math.min(1, endT));
    }

    if (variableUnlocked) {
      const valQyEnd = parseFloat(qyEnd);
      const valQxEnd = parseFloat(qxEnd);
      onPreview(
        qxVal, qyVal, coordSystem, startT, endT,
        isNaN(valQxEnd) ? qxVal : valQxEnd * 1000,
        isNaN(valQyEnd) ? qyVal : valQyEnd * 1000,
      );
    } else {
      onPreview(qxVal, qyVal, coordSystem, startT, endT);
    }
  }, [qy, qx, qyEnd, qxEnd, variableUnlocked, coordSystem, startMm, loadLengthMm, hasLength, L, onPreview]);

  const handleApply = () => {
    const valQy = parseFloat(qy);
    const valQx = parseFloat(qx);
    let startT: number;
    let endT: number;

    if (hasLength) {
      const startVal = parseFloat(startMm);
      const lengthVal = parseFloat(loadLengthMm);
      startT = isNaN(startVal) ? 0 : Math.max(0, Math.min(1, (startVal / 1000) / L));
      endT = isNaN(lengthVal) ? 1 : Math.max(startT, Math.min(1, startT + (lengthVal / 1000) / L));
    } else {
      startT = parseFloat(startMm);
      endT = startT + parseFloat(loadLengthMm);
      if (isNaN(startT)) startT = 0;
      if (isNaN(endT)) endT = 1;
      startT = Math.max(0, Math.min(1, startT));
      endT = Math.max(startT, Math.min(1, endT));
    }

    if (!isNaN(valQy)) {
      const qxVal = isNaN(valQx) ? 0 : valQx * 1000;
      const qyVal = valQy * 1000;

      const desc = description.trim() || undefined;
      if (variableUnlocked) {
        const valQyEnd = parseFloat(qyEnd);
        const valQxEnd = parseFloat(qxEnd);
        onApply(
          qxVal,
          qyVal,
          selectedLC,
          startT,
          endT,
          coordSystem,
          isNaN(valQxEnd) ? qxVal : valQxEnd * 1000,
          isNaN(valQyEnd) ? qyVal : valQyEnd * 1000,
          desc,
        );
      } else {
        onApply(qxVal, qyVal, selectedLC, startT, endT, coordSystem, undefined, undefined, desc);
      }
    }
  };

  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleApply();
    if (e.key === 'Escape') onCancel();
  };

  const toggleVariable = () => {
    if (!variableUnlocked) {
      // Unlocking: initialize end values to match start values
      setQyEnd(qy);
      setQxEnd(qx);
    }
    setVariableUnlocked(!variableUnlocked);
  };

  return (
    <div className="line-load-dialog-overlay" onClick={onCancel}>
      <div className="line-load-dialog" onClick={e => e.stopPropagation()}>
        <div className="line-load-dialog-header">{edgeMode ? 'Edge Load' : 'Distributed Load'}</div>
        <div className="line-load-dialog-body">
          <label>
            <span>Load Case</span>
            <select
              value={selectedLC}
              onChange={e => setSelectedLC(parseInt(e.target.value))}
            >
              {loadCases.map(lc => (
                <option key={lc.id} value={lc.id}>{lc.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Description</span>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Self-weight, Wind load..."
              onKeyDown={keyHandler}
            />
          </label>

          <div className="line-load-variable-section">
            <div className="line-load-variable-header">
              <span className="line-load-subsection-title">Load Intensity</span>
              <button
                className={`line-load-lock-btn ${variableUnlocked ? 'unlocked' : ''}`}
                onClick={toggleVariable}
                title={variableUnlocked ? 'Lock: uniform load' : 'Unlock: variable (trapezoidal) load'}
              >
                {variableUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
                <span>{variableUnlocked ? 'Variable' : 'Uniform'}</span>
              </button>
            </div>

            <div className="line-load-row">
              <label>
                <span>{variableUnlocked ? 'q\u2081 (kN/m)' : 'qz (kN/m)'}</span>
                <input
                  type="text"
                  value={qy}
                  onChange={e => {
                    setQy(e.target.value);
                    if (!variableUnlocked) setQyEnd(e.target.value);
                  }}
                  autoFocus
                  onFocus={e => e.target.select()}
                  onKeyDown={keyHandler}
                />
              </label>
              {variableUnlocked && (
                <label>
                  <span>q{'\u2082'} (kN/m)</span>
                  <input
                    type="text"
                    value={qyEnd}
                    onChange={e => setQyEnd(e.target.value)}
                    onFocus={e => e.target.select()}
                    onKeyDown={keyHandler}
                  />
                </label>
              )}
            </div>

            <div className="line-load-row">
              <label>
                <span>{variableUnlocked ? 'qx\u2081 (kN/m)' : 'qx (kN/m)'}</span>
                <input
                  type="text"
                  value={qx}
                  onChange={e => {
                    setQx(e.target.value);
                    if (!variableUnlocked) setQxEnd(e.target.value);
                  }}
                  onKeyDown={keyHandler}
                />
              </label>
              {variableUnlocked && (
                <label>
                  <span>qx{'\u2082'} (kN/m)</span>
                  <input
                    type="text"
                    value={qxEnd}
                    onChange={e => setQxEnd(e.target.value)}
                    onFocus={e => e.target.select()}
                    onKeyDown={keyHandler}
                  />
                </label>
              )}
            </div>
          </div>

          <p className="line-load-hint">Negative qz = downward (e.g. -5 kN/m){variableUnlocked ? `. start = begin of ${edgeMode ? 'edge' : 'beam'}, end = end of ${edgeMode ? 'edge' : 'beam'}.` : ''}</p>

          {/* -- OpenReport Integration -- */}
          <div className="line-load-openreport-section">
            <button
              className={`line-load-openreport-toggle ${openReport.visible ? 'active' : ''}`}
              onClick={toggleOpenReport}
              type="button"
            >
              <CloudDownload size={13} />
              <span>Import from OpenReport</span>
            </button>

            {openReport.visible && (
              <div className="line-load-openreport-panel">
                <label>
                  <span>API Base URL</span>
                  <input
                    type="text"
                    value={openReport.baseUrl}
                    onChange={e =>
                      setOpenReport(prev => ({ ...prev, baseUrl: e.target.value }))
                    }
                    placeholder="http://localhost:8080"
                  />
                </label>
                <label>
                  <span>Project Reference</span>
                  <input
                    type="text"
                    value={openReport.projectRef}
                    onChange={e =>
                      setOpenReport(prev => ({ ...prev, projectRef: e.target.value }))
                    }
                    placeholder="e.g. PRJ-001"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleOpenReportFetch();
                      }
                    }}
                  />
                </label>
                <button
                  className="line-load-openreport-fetch-btn"
                  onClick={handleOpenReportFetch}
                  disabled={openReport.loading}
                  type="button"
                >
                  {openReport.loading ? (
                    <>
                      <Loader2 size={12} className="line-load-spinner" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <span>Fetch Loads</span>
                  )}
                </button>

                {openReport.error && (
                  <div className="line-load-openreport-error">
                    <AlertCircle size={12} />
                    <span>{openReport.error}</span>
                  </div>
                )}

                {openReport.loads.length > 0 && (
                  <div className="line-load-openreport-results">
                    <span className="line-load-openreport-results-title">
                      Available Loads ({openReport.loads.length})
                    </span>
                    <ul className="line-load-openreport-list">
                      {openReport.loads.map((load, i) => (
                        <li
                          key={i}
                          className={`line-load-openreport-item ${openReport.selectedIndex === i ? 'selected' : ''}`}
                          onClick={() => handleOpenReportSelect(i)}
                        >
                          <span className="line-load-openreport-item-name">{load.name}</span>
                          <span className="line-load-openreport-item-value">
                            {load.value} {load.unit}
                          </span>
                          {openReport.selectedIndex === i && <Check size={12} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="line-load-subsection">
            <span className="line-load-subsection-title">Load Position</span>
            <div className="line-load-row">
              <label>
                <span>{hasLength ? 'Start (mm)' : 'Start Position (0-1)'}</span>
                <input
                  type="text"
                  value={startMm}
                  onChange={e => setStartMm(e.target.value)}
                  onKeyDown={keyHandler}
                />
              </label>
              <label>
                <span>{hasLength ? 'Length (mm)' : 'Load Length (0-1)'}</span>
                <input
                  type="text"
                  value={loadLengthMm}
                  onChange={e => setLoadLengthMm(e.target.value)}
                  onKeyDown={keyHandler}
                />
              </label>
            </div>
            {hasLength && (
              <p className="line-load-hint">{edgeMode ? 'Edge' : 'Beam'} length: {(L * 1000).toFixed(0)} mm</p>
            )}
          </div>

          {!edgeMode && (
            <div className="line-load-subsection">
              <span className="line-load-subsection-title">Direction</span>
              <div className="line-load-radio-group">
                <label className="line-load-radio-label">
                  <input
                    type="radio"
                    name="coordSystem"
                    value="local"
                    checked={coordSystem === 'local'}
                    onChange={() => setCoordSystem('local')}
                  />
                  <span>Perpendicular to beam</span>
                </label>
                <label className="line-load-radio-label">
                  <input
                    type="radio"
                    name="coordSystem"
                    value="global"
                    checked={coordSystem === 'global'}
                    onChange={() => setCoordSystem('global')}
                  />
                  <span>Global Z-axis</span>
                </label>
              </div>
            </div>
          )}
        </div>
        <div className="line-load-dialog-footer">
          <button className="line-load-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="line-load-btn confirm" onClick={handleApply}>OK</button>
        </div>
      </div>
    </div>
  );
}
