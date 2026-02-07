import { useState, useCallback, useEffect } from 'react';
import { useFEM } from '../../context/FEMContext';
import type { IProjectInfo } from '../../context/FEMContext';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './ProjectInfoDialog.css';

// Fix Leaflet default marker icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Component to handle map view changes
function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

interface ProjectInfoDialogProps {
  onClose: () => void;
}

interface ErpProject {
  name: string;
  project_name: string;
  customer?: string;
  status?: string;
  company?: string;
}

export function ProjectInfoDialog({ onClose }: ProjectInfoDialogProps) {
  const { state, dispatch } = useFEM();

  const [name, setName] = useState(state.projectInfo.name);
  const [projectNumber, setProjectNumber] = useState(state.projectInfo.projectNumber || '');
  const [engineer, setEngineer] = useState(state.projectInfo.engineer);
  const [company, setCompany] = useState(state.projectInfo.company);
  const [date, setDate] = useState(state.projectInfo.date);
  const [description, setDescription] = useState(state.projectInfo.description);
  const [notes, setNotes] = useState(state.projectInfo.notes);
  const [location, setLocation] = useState(state.projectInfo.location);
  const [latitude, setLatitude] = useState<number | undefined>(state.projectInfo.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(state.projectInfo.longitude);
  const [geocoding, setGeocoding] = useState(false);

  // Default map center: Netherlands
  const defaultLat = 52.1326;
  const defaultLon = 5.2913;
  const mapLat = latitude ?? defaultLat;
  const mapLon = longitude ?? defaultLon;
  const mapZoom = latitude != null ? 14 : 7;
  const mapCenter: [number, number] = [mapLat, mapLon];

  const handleGeocode = useCallback(async () => {
    if (!location.trim()) return;
    setGeocoding(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await resp.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        setLatitude(lat);
        setLongitude(lon);
      }
    } catch {
      // geocoding failed silently
    } finally {
      setGeocoding(false);
    }
  }, [location]);

  // ERPNext linking
  const [showErpSearch, setShowErpSearch] = useState(false);
  const [erpSearch, setErpSearch] = useState('');
  const [erpResults, setErpResults] = useState<ErpProject[]>([]);
  const [erpLoading, setErpLoading] = useState(false);
  const [erpError, setErpError] = useState<string | null>(null);

  const handleApply = () => {
    const updated: IProjectInfo = { name, projectNumber, engineer, company, date, description, notes, location, latitude, longitude };
    dispatch({ type: 'SET_PROJECT_INFO', payload: updated });
    onClose();
  };

  const searchErpProjects = async () => {
    setErpLoading(true);
    setErpError(null);
    try {
      const resp = await fetch(`/api/erpnext/projects?search=${encodeURIComponent(erpSearch)}`);
      const data = await resp.json();
      if (data.error) {
        setErpError(data.error);
        setErpResults([]);
      } else {
        setErpResults(data.data || []);
      }
    } catch (e) {
      setErpError((e as Error).message);
      setErpResults([]);
    } finally {
      setErpLoading(false);
    }
  };

  const importErpProject = async (proj: ErpProject) => {
    setName(proj.project_name || proj.name);
    if (proj.company) setCompany(proj.company);
    // Fetch full details for description
    try {
      const resp = await fetch(`/api/erpnext/project/${encodeURIComponent(proj.name)}`);
      const data = await resp.json();
      if (data.data) {
        const d = data.data;
        if (d.notes) setDescription(d.notes);
        if (d.company) setCompany(d.company);
      }
    } catch { /* ignore */ }
    setShowErpSearch(false);
  };

  return (
    <div className="proj-info-overlay" onClick={onClose}>
      <div className="proj-info-dialog" onClick={e => e.stopPropagation()}>
        <div className="proj-info-header">
          Project Settings
          <button
            className="proj-info-erp-btn"
            onClick={() => setShowErpSearch(!showErpSearch)}
            title="Link with ERPNext project"
          >
            ERPNext
          </button>
        </div>

        {showErpSearch && (
          <div className="erp-search-section">
            <div className="erp-search-row">
              <input
                type="text"
                placeholder="Search ERPNext projects..."
                value={erpSearch}
                onChange={e => setErpSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchErpProjects(); }}
              />
              <button onClick={searchErpProjects} disabled={erpLoading}>
                {erpLoading ? '...' : 'Search'}
              </button>
            </div>
            {erpError && <div className="erp-error">{erpError}</div>}
            {erpResults.length > 0 && (
              <div className="erp-results">
                {erpResults.map(p => (
                  <button key={p.name} className="erp-result-item" onClick={() => importErpProject(p)}>
                    <span className="erp-result-name">{p.project_name || p.name}</span>
                    <span className="erp-result-meta">{p.customer || p.company || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="proj-info-body">
          <label className="proj-info-field">
            <span>Project Number</span>
            <input
              type="text"
              value={projectNumber}
              onChange={e => setProjectNumber(e.target.value)}
              autoFocus
              onFocus={e => e.target.select()}
              placeholder="e.g. PRJ-2026-001"
            />
          </label>
          <label className="proj-info-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={e => e.target.select()}
            />
          </label>
          <label className="proj-info-field">
            <span>Engineer</span>
            <input
              type="text"
              value={engineer}
              onChange={e => setEngineer(e.target.value)}
              onFocus={e => e.target.select()}
            />
          </label>
          <label className="proj-info-field">
            <span>Company</span>
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              onFocus={e => e.target.select()}
            />
          </label>
          <label className="proj-info-field">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </label>
          <label className="proj-info-field">
            <span>Location</span>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Amsterdam, Netherlands"
              onFocus={e => e.target.select()}
            />
          </label>
          <div className="proj-info-map-section">
            <div className="proj-info-map-controls">
              <button
                className="proj-info-map-btn"
                onClick={handleGeocode}
                disabled={geocoding || !location.trim()}
              >
                {geocoding ? 'Searching...' : 'Show on Map'}
              </button>
              {latitude != null && longitude != null && (
                <span className="proj-info-coords">
                  {latitude.toFixed(4)}, {longitude.toFixed(4)}
                </span>
              )}
            </div>
            <div className="proj-info-map-container">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                scrollWheelZoom={true}
                style={{ height: '200px', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapUpdater center={mapCenter} zoom={mapZoom} />
                {latitude != null && longitude != null && (
                  <Marker position={[latitude, longitude]} />
                )}
              </MapContainer>
            </div>
            <div className="proj-info-coord-fields">
              <label className="proj-info-field">
                <span>Latitude</span>
                <input type="text" value={latitude != null ? latitude.toFixed(6) : ''} readOnly />
              </label>
              <label className="proj-info-field">
                <span>Longitude</span>
                <input type="text" value={longitude != null ? longitude.toFixed(6) : ''} readOnly />
              </label>
            </div>
          </div>
          <label className="proj-info-field proj-info-field--tall">
            <span>Description</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </label>
          <label className="proj-info-field proj-info-field--tall">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </label>
        </div>
        <div className="proj-info-footer">
          <button className="proj-info-btn cancel" onClick={onClose}>Cancel</button>
          <button className="proj-info-btn confirm" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
