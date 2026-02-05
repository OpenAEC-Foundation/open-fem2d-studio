import { useState } from 'react';
import { IMaterial } from '../../core/fem/types';
import {
  GENERIC_MATERIALS,
  STEEL_GRADES,
  REINFORCEMENT_STEEL,
  BOLT_QUALITIES,
  CONCRETE_GRADES,
  SOFTWOOD_CLASSES,
  HARDWOOD_CLASSES,
  GLULAM_CLASSES,
  WOOD_SPECIES,
  type SteelGrade,
  type ConcreteGrade,
  type WoodStrengthClass,
  type GenericMaterial,
} from '../../core/materials/MaterialLibrary';
import './MaterialsDialog.css';

interface MaterialsDialogProps {
  materials: IMaterial[];
  onAdd: (material: Omit<IMaterial, 'id'>) => void;
  onUpdate: (id: number, updates: Partial<IMaterial>) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

type MainTab = 'model' | 'library';
type LibraryTab = 'generiek' | 'staal' | 'beton' | 'hout';

function steelToMaterial(grade: SteelGrade): Omit<IMaterial, 'id'> {
  return {
    name: grade.name,
    E: grade.E * 1e6,
    nu: grade.nu,
    rho: grade.rho,
    alpha: grade.alpha,
    color: '#3b82f6',
  };
}

function concreteToMaterial(grade: ConcreteGrade): Omit<IMaterial, 'id'> {
  return {
    name: grade.name,
    E: grade.Ecm * 1e6,
    nu: grade.nu,
    rho: grade.rho,
    alpha: 10e-6,
    color: '#6b7280',
  };
}

function woodToMaterial(cls: WoodStrengthClass): Omit<IMaterial, 'id'> {
  return {
    name: cls.name,
    E: cls.E_0_mean * 1e6,
    nu: 0.3,
    rho: cls.rho_mean,
    alpha: 5e-6,
    color: '#92400e',
  };
}

function genericToMaterial(mat: GenericMaterial): Omit<IMaterial, 'id'> {
  return {
    name: mat.name,
    E: mat.E * 1e6,
    nu: mat.nu,
    rho: mat.rho,
    alpha: mat.alpha,
    color: mat.color,
  };
}

export function MaterialsDialog({ materials, onAdd, onUpdate, onDelete, onClose }: MaterialsDialogProps) {
  const [selectedId, setSelectedId] = useState<number | null>(materials.length > 0 ? materials[0].id : null);
  const [mainTab, setMainTab] = useState<MainTab>('model');
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('generiek');

  const selected = materials.find(m => m.id === selectedId);

  const handleAdd = () => {
    onAdd({
      name: 'New Material',
      E: 200e9,
      nu: 0.3,
      rho: 7800,
      color: '#10b981',
      alpha: 12e-6,
    });
  };

  const handleFieldChange = (field: keyof IMaterial, value: string) => {
    if (!selected) return;
    switch (field) {
      case 'name':
        onUpdate(selected.id, { name: value });
        break;
      case 'E':
        const e = parseFloat(value);
        if (!isNaN(e)) onUpdate(selected.id, { E: e * 1e9 });
        break;
      case 'nu':
        const nu = parseFloat(value);
        if (!isNaN(nu)) onUpdate(selected.id, { nu });
        break;
      case 'rho':
        const rho = parseFloat(value);
        if (!isNaN(rho)) onUpdate(selected.id, { rho });
        break;
      case 'alpha':
        const alpha = parseFloat(value);
        if (!isNaN(alpha)) onUpdate(selected.id, { alpha: alpha * 1e-6 });
        break;
      case 'color':
        onUpdate(selected.id, { color: value });
        break;
    }
  };

  const handleLibraryAdd = (mat: Omit<IMaterial, 'id'>) => {
    onAdd(mat);
    setMainTab('model');
  };

  // ---- Render helpers for library tabs ----

  const renderGenericTab = () => (
    <div className="library-content">
      <table className="library-table">
        <thead>
          <tr>
            <th>Naam</th>
            <th>E (MPa)</th>
            <th>&nu;</th>
            <th>&rho; (kg/m&sup3;)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {GENERIC_MATERIALS.map((mat, i) => (
            <tr key={i} className="library-row">
              <td>
                <span className="library-color-dot" style={{ backgroundColor: mat.color }} />
                {mat.name}
              </td>
              <td className="num">{mat.E.toLocaleString()}</td>
              <td className="num">{mat.nu}</td>
              <td className="num">{mat.rho}</td>
              <td>
                <button className="library-add-btn" onClick={() => handleLibraryAdd(genericToMaterial(mat))} title="Toevoegen aan model">+</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSteelTab = () => (
    <div className="library-content">
      <div className="library-section-title">Constructiestaal (EN 10025)</div>
      <table className="library-table">
        <thead>
          <tr>
            <th>Naam</th>
            <th>f<sub>y</sub> (t&le;40)</th>
            <th>f<sub>u</sub> (t&le;40)</th>
            <th>E (MPa)</th>
            <th>&rho;</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {STEEL_GRADES.map((g, i) => (
            <tr key={i} className="library-row">
              <td className="name-cell">{g.name}</td>
              <td className="num">{g.fy_t_le_40}</td>
              <td className="num">{g.fu_t_le_40}</td>
              <td className="num">{g.E.toLocaleString()}</td>
              <td className="num">{g.rho}</td>
              <td>
                <button className="library-add-btn" onClick={() => handleLibraryAdd(steelToMaterial(g))} title="Toevoegen aan model">+</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="library-section-title">Betonstaal</div>
      <table className="library-table">
        <thead>
          <tr>
            <th>Naam</th>
            <th>f<sub>yk</sub></th>
            <th>f<sub>tk</sub></th>
            <th>E<sub>s</sub></th>
          </tr>
        </thead>
        <tbody>
          {REINFORCEMENT_STEEL.map((r, i) => (
            <tr key={i} className="library-row">
              <td className="name-cell">{r.name}</td>
              <td className="num">{r.fyk}</td>
              <td className="num">{r.ftk}</td>
              <td className="num">{r.Es.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="library-section-title">Boutkwaliteiten</div>
      <table className="library-table">
        <thead>
          <tr>
            <th>Klasse</th>
            <th>f<sub>yb</sub></th>
            <th>f<sub>ub</sub></th>
          </tr>
        </thead>
        <tbody>
          {BOLT_QUALITIES.map((b, i) => (
            <tr key={i} className="library-row">
              <td className="name-cell">{b.name}</td>
              <td className="num">{b.fyb}</td>
              <td className="num">{b.fub}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderConcreteTab = () => (
    <div className="library-content">
      <div className="library-section-title">Betonsterkteklassen (EN 1992-1-1)</div>
      <table className="library-table">
        <thead>
          <tr>
            <th>Naam</th>
            <th>f<sub>ck</sub></th>
            <th>f<sub>cm</sub></th>
            <th>f<sub>ctm</sub></th>
            <th>E<sub>cm</sub></th>
            <th>&rho;</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {CONCRETE_GRADES.map((g, i) => (
            <tr key={i} className="library-row">
              <td className="name-cell">{g.name}</td>
              <td className="num">{g.fck}</td>
              <td className="num">{g.fcm}</td>
              <td className="num">{g.fctm}</td>
              <td className="num">{g.Ecm.toLocaleString()}</td>
              <td className="num">{g.rho}</td>
              <td>
                <button className="library-add-btn" onClick={() => handleLibraryAdd(concreteToMaterial(g))} title="Toevoegen aan model">+</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderWoodTable = (title: string, classes: WoodStrengthClass[]) => (
    <>
      <div className="library-section-title">{title}</div>
      <table className="library-table">
        <thead>
          <tr>
            <th>Naam</th>
            <th>f<sub>m,k</sub></th>
            <th>E<sub>0,mean</sub></th>
            <th>&rho;<sub>k</sub></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {classes.map((cls, i) => (
            <tr key={i} className="library-row">
              <td className="name-cell">{cls.name}</td>
              <td className="num">{cls.fm_k}</td>
              <td className="num">{cls.E_0_mean.toLocaleString()}</td>
              <td className="num">{cls.rho_k}</td>
              <td>
                <button className="library-add-btn" onClick={() => handleLibraryAdd(woodToMaterial(cls))} title="Toevoegen aan model">+</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );

  const renderWoodTab = () => (
    <div className="library-content">
      {renderWoodTable('Naaldhout (EN 338)', SOFTWOOD_CLASSES)}
      {renderWoodTable('Loofhout (EN 338)', HARDWOOD_CLASSES)}
      {renderWoodTable('Gelijmd gelamineerd (EN 14080)', GLULAM_CLASSES)}

      <div className="library-section-title">Houtsoorten</div>
      <table className="library-table">
        <thead>
          <tr>
            <th>Naam (NL)</th>
            <th>Naam (EN)</th>
            <th>Klasse</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {WOOD_SPECIES.map((sp, i) => (
            <tr key={i} className="library-row">
              <td className="name-cell">{sp.name}</td>
              <td>{sp.nameEn}</td>
              <td className="num">{sp.strengthClass}</td>
              <td>{sp.type === 'softwood' ? 'Naaldhout' : 'Loofhout'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderLibraryTab = () => {
    switch (libraryTab) {
      case 'generiek': return renderGenericTab();
      case 'staal': return renderSteelTab();
      case 'beton': return renderConcreteTab();
      case 'hout': return renderWoodTab();
    }
  };

  return (
    <div className="materials-overlay" onClick={onClose}>
      <div className="materials-dialog" onClick={e => e.stopPropagation()}>
        <div className="materials-header">
          <span>Materialen</span>
        </div>

        {/* Main tabs */}
        <div className="materials-tabs">
          <button
            className={`materials-tab ${mainTab === 'model' ? 'active' : ''}`}
            onClick={() => setMainTab('model')}
          >
            Model
          </button>
          <button
            className={`materials-tab ${mainTab === 'library' ? 'active' : ''}`}
            onClick={() => setMainTab('library')}
          >
            Bibliotheek
          </button>
        </div>

        {mainTab === 'model' ? (
          <>
            <div className="materials-body">
              <div className="materials-list">
                {materials.map(m => (
                  <div
                    key={m.id}
                    className={`material-item ${selectedId === m.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(m.id)}
                  >
                    <div className="material-color" style={{ backgroundColor: m.color }} />
                    <div className="material-info">
                      <div className="material-name">{m.name}</div>
                      <div className="material-details">
                        E = {(m.E / 1e9).toFixed(1)} GPa, &nu; = {m.nu.toFixed(2)}, &rho; = {m.rho} kg/m&sup3;
                      </div>
                    </div>
                    <button
                      className="material-delete-btn"
                      onClick={(e) => { e.stopPropagation(); onDelete(m.id); if (selectedId === m.id) setSelectedId(null); }}
                      title="Delete material"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {selected && (
                <div className="materials-edit-section">
                  <div className="materials-edit-title">Edit Material</div>
                  <div className="materials-edit-grid">
                    <label>Name</label>
                    <input
                      type="text"
                      defaultValue={selected.name}
                      key={`name-${selected.id}`}
                      onBlur={e => handleFieldChange('name', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />

                    <label>E (GPa)</label>
                    <input
                      type="text"
                      defaultValue={(selected.E / 1e9).toFixed(1)}
                      key={`E-${selected.id}`}
                      onBlur={e => handleFieldChange('E', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />

                    <label>&nu; (Poisson)</label>
                    <input
                      type="text"
                      defaultValue={selected.nu.toFixed(3)}
                      key={`nu-${selected.id}`}
                      onBlur={e => handleFieldChange('nu', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />

                    <label>&rho; (kg/m&sup3;)</label>
                    <input
                      type="text"
                      defaultValue={selected.rho.toString()}
                      key={`rho-${selected.id}`}
                      onBlur={e => handleFieldChange('rho', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />

                    <label>&alpha; (&times;10&sup6;/&deg;C)</label>
                    <input
                      type="text"
                      defaultValue={selected.alpha ? (selected.alpha * 1e6).toFixed(1) : '0'}
                      key={`alpha-${selected.id}`}
                      onBlur={e => handleFieldChange('alpha', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />

                    <label>Color</label>
                    <input
                      type="color"
                      value={selected.color}
                      key={`color-${selected.id}`}
                      onChange={e => handleFieldChange('color', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="materials-footer">
              <button className="materials-add-btn" onClick={handleAdd}>+ Add Material</button>
              <button className="materials-close-btn" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            {/* Library sub-tabs */}
            <div className="library-subtabs">
              {(['generiek', 'staal', 'beton', 'hout'] as LibraryTab[]).map(tab => (
                <button
                  key={tab}
                  className={`library-subtab ${libraryTab === tab ? 'active' : ''}`}
                  onClick={() => setLibraryTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="materials-body">
              {renderLibraryTab()}
            </div>
            <div className="materials-footer">
              <span className="library-hint">Klik + om materiaal aan het model toe te voegen</span>
              <button className="materials-close-btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
