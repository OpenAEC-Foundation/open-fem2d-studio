import { useFEM } from '../../context/FEMContext';
import { Tool, AnalysisType } from '../../core/fem/types';
import { solve } from '../../core/solver/Solver';
import './Toolbar.css';

export function Toolbar() {
  const { state, dispatch } = useFEM();
  const { selectedTool, mesh, analysisType, showMoment, showShear, showNormal } = state;

  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: 'select', label: 'Selecteer', icon: '⊙' },
    { id: 'addNode', label: 'Knoop', icon: '●' },
    { id: 'addBeam', label: 'Balk', icon: '━' },
    { id: 'addElement', label: 'Element', icon: '△' },
    { id: 'addConstraint', label: 'Oplegging', icon: '▽' },
    { id: 'addLoad', label: 'Belasting', icon: '↓' },
    { id: 'delete', label: 'Verwijder', icon: '✕' },
    { id: 'pan', label: 'Pan', icon: '✥' },
  ];

  const diagramOptions: { id: string; label: string; active: boolean; action: string }[] = [
    { id: 'moment', label: 'M', active: showMoment, action: 'SET_SHOW_MOMENT' },
    { id: 'shear', label: 'V', active: showShear, action: 'SET_SHOW_SHEAR' },
    { id: 'normal', label: 'N', active: showNormal, action: 'SET_SHOW_NORMAL' },
  ];

  const handleSolve = () => {
    try {
      const result = solve(mesh, { analysisType });
      dispatch({ type: 'SET_RESULT', payload: result });
      dispatch({ type: 'SET_SHOW_DEFORMED', payload: true });
      if (analysisType === 'frame') {
        dispatch({ type: 'SET_SHOW_MOMENT', payload: true });
      } else {
        dispatch({ type: 'SET_SHOW_STRESS', payload: true });
      }
    } catch (e) {
      alert(`Solver fout: ${(e as Error).message}`);
    }
  };

  const handleClear = () => {
    if (confirm('Model wissen?')) {
      mesh.clear();
      dispatch({ type: 'REFRESH_MESH' });
      dispatch({ type: 'SET_RESULT', payload: null });
      dispatch({ type: 'CLEAR_SELECTION' });
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(mesh.toJSON(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fem-model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const { Mesh: MeshClass } = await import('../../core/fem/Mesh');
        const newMesh = MeshClass.fromJSON(data);
        dispatch({ type: 'SET_MESH', payload: newMesh });
      } catch (err) {
        alert('Import mislukt');
      }
    };
    input.click();
  };

  const handleNewDemo = () => {
    // Maak een nieuw demo model
    mesh.clear();

    // Ligger op twee steunpunten: 6 meter overspanning
    const n1 = mesh.addNode(0, 0);
    const n2 = mesh.addNode(3, 0);
    const n3 = mesh.addNode(6, 0);

    // Opleggingen
    mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
    mesh.updateNode(n3.id, { constraints: { x: false, y: true, rotation: false } });

    // Puntlast
    mesh.updateNode(n2.id, { loads: { fx: 0, fy: -10000, moment: 0 } });

    // Balken
    const ipe200 = { A: 28.5e-4, I: 1940e-8, h: 0.200 };
    mesh.addBeamElement([n1.id, n2.id], 1, ipe200);
    mesh.addBeamElement([n2.id, n3.id], 1, ipe200);

    dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
    dispatch({ type: 'REFRESH_MESH' });
    dispatch({ type: 'SET_RESULT', payload: null });
  };

  const handleNewContinuousBeam = () => {
    mesh.clear();

    // Doorlopende ligger op 3 steunpunten
    const n1 = mesh.addNode(0, 0);
    const n2 = mesh.addNode(4, 0);
    const n3 = mesh.addNode(8, 0);

    // Opleggingen
    mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
    mesh.updateNode(n2.id, { constraints: { x: false, y: true, rotation: false } });
    mesh.updateNode(n3.id, { constraints: { x: false, y: true, rotation: false } });

    // Distributed load on first span
    const ipe300 = { A: 53.8e-4, I: 8360e-8, h: 0.300 };
    const beam1 = mesh.addBeamElement([n1.id, n2.id], 1, ipe300);
    mesh.addBeamElement([n2.id, n3.id], 1, ipe300);

    // Add distributed load
    if (beam1) {
      mesh.updateBeamElement(beam1.id, {
        distributedLoad: { qx: 0, qy: -5000 }  // 5 kN/m downward
      });
    }

    dispatch({ type: 'SET_ANALYSIS_TYPE', payload: 'frame' });
    dispatch({ type: 'REFRESH_MESH' });
    dispatch({ type: 'SET_RESULT', payload: null });
  };

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <span className="toolbar-title">Open FEM Studio</span>
      </div>

      <div className="toolbar-section">
        <label className="toolbar-label">Analyse:</label>
        <select
          className="toolbar-select"
          value={analysisType}
          onChange={(e) => {
            dispatch({ type: 'SET_ANALYSIS_TYPE', payload: e.target.value as AnalysisType });
            dispatch({ type: 'SET_RESULT', payload: null });
          }}
        >
          <option value="frame">Raamwerk (balken)</option>
          <option value="plane_stress">Vlakspanning</option>
          <option value="plane_strain">Vlakke rek</option>
        </select>
      </div>

      <div className="toolbar-section toolbar-tools">
        {tools.map(tool => (
          <button
            key={tool.id}
            className={`tool-button ${selectedTool === tool.id ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', payload: tool.id })}
            title={tool.label}
          >
            <span className="tool-icon">{tool.icon}</span>
            <span className="tool-label">{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-section">
        <button className="action-button solve" onClick={handleSolve}>
          ▶ Bereken
        </button>
      </div>

      {analysisType === 'frame' && (
        <div className="toolbar-section">
          <label className="toolbar-label">Diagram:</label>
          <div className="diagram-buttons">
            {diagramOptions.map(opt => (
              <button
                key={opt.id}
                className={`diagram-button ${opt.active ? 'active' : ''}`}
                onClick={() => dispatch({ type: opt.action as any, payload: !opt.active })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar-section">
        <button className="action-button" onClick={handleNewDemo} title="Nieuwe ligger op 2 steunpunten">
          Demo 1
        </button>
        <button className="action-button" onClick={handleNewContinuousBeam} title="Doorlopende ligger">
          Demo 2
        </button>
      </div>

      <div className="toolbar-section">
        <button className="action-button" onClick={handleImport}>
          Import
        </button>
        <button className="action-button" onClick={handleExport}>
          Export
        </button>
        <button className="action-button danger" onClick={handleClear}>
          Wis
        </button>
      </div>
    </div>
  );
}
