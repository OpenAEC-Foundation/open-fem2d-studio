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
  Node, Beam, Plate, Support, Load, Selection, SupportType, BeamCheckConfig,
  BeamLoadRole,
} from "./femTypes";
import {
  withPlateDefaults, bepaalStandaardRol, BEAM_LOAD_ROLES, BEAM_LOAD_ROLE_LABEL,
} from "./femTypes";
import type { SolverResult } from "./solver/types";
import { SUPPORTED_TIMBER_GRADES } from "../../lib/timberCheckBuilder";
import ProfielKiezer from "./ProfielKiezer";

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
  /** Patch fields on a beam (material, profile, releases, …). */
  updateBeam?: (id: number, updates: Partial<Beam>) => void;
  /** Patch rekenvelden op een plaat (dikte, E, ν, ρ, meshSize) — P3.1. */
  updatePlate?: (id: number, updates: Partial<Plate>) => void;
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
    updateNode, updateBeam, updatePlate, addSupport, removeSupport, updateLoad,
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
    return <BeamProperties beam={b} nFrom={nFrom} nTo={nTo} nodes={nodes} loads={loads} updateBeam={updateBeam} />;
  }

  if (selection.type === "plate") {
    const p = plates.find(pp => pp.id === selection.id);
    if (!p) {
      return <div className="fem-properties"><div className="fem-prop-empty">Plaat niet gevonden.</div></div>;
    }
    return <PlateProperties plate={p} nodes={nodes} updatePlate={updatePlate} />;
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
function BeamProperties({ beam, nFrom, nTo, nodes, loads, updateBeam }: {
  beam: Beam; nFrom?: Node; nTo?: Node; nodes: Node[]; loads: Load[];
  updateBeam?: (id: number, updates: Partial<Beam>) => void;
}) {
  const dx = nTo && nFrom ? nTo.x - nFrom.x : 0;
  const dz = nTo && nFrom ? nTo.z - nFrom.z : 0;
  const L = Math.hypot(dx, dz);
  const angDeg = (Math.atan2(dz, dx) * 180 / Math.PI);
  const beamLoads = loads.filter(l => l.beamId === beam.id);

  const material = beam.material ?? "S235";
  const profile = beam.profile ?? "HEA160";
  const isHout = (SUPPORTED_TIMBER_GRADES as readonly string[]).includes(material);
  // Staalsterkte volgt uit de naam (S235 → 235); voor hout tonen we geen
  // verzonnen getallen — de rekenwaarden komen uit de toetsing zelf.
  const fyStaal = /^S(\d+)$/.exec(material)?.[1];
  // ProfielKiezer-wizard: profiel + materiaal zijn één combinatie. Conditioneel
  // gemount zodat elke keer openen met de actuele staafwaarden voorselecteert.
  const [kiezerOpen, setKiezerOpen] = useState(false);

  const setRelease = (key: "startRy" | "endRy", checked: boolean) => {
    updateBeam?.(beam.id, { releases: { ...beam.releases, [key]: checked } });
  };

  // Norm-tabblad: de toetsconfiguratie per staaf (kniklengtes, kipsteunen,
  // doorbuiging, en voor hout klimaatklasse/belastingduur). De tabs waren
  // hardcoded knoppen zonder state — de EN-tab deed dus niets.
  const [propTab, setPropTab] = useState<"algemeen" | "norm">("algemeen");
  const cfg = beam.checkConfig ?? {};
  /** Schrijf één veld in checkConfig; lege/ongeldige waarde wist het veld. */
  const setCfg = (patch: Partial<BeamCheckConfig>) => {
    const nieuw: BeamCheckConfig = { ...cfg, ...patch };
    for (const k of Object.keys(nieuw) as (keyof BeamCheckConfig)[]) {
      const v = nieuw[k];
      if (v === undefined || (Array.isArray(v) && v.length === 0)) delete nieuw[k];
    }
    updateBeam?.(beam.id, { checkConfig: Object.keys(nieuw).length > 0 ? nieuw : undefined });
  };
  // Ruwe tekst van het kipsteunen-veld apart, zodat tussentijds typen
  // ("0.25, ") niet door de parser wordt teruggeschreven. Synchroniseert
  // wanneer je een andere staaf selecteert.
  const [kipsteunenTekst, setKipsteunenTekst] = useState(cfg.lateralRestraints?.join(", ") ?? "");
  const [kipsteunenOnderTekst, setKipsteunenOnderTekst] = useState(
    cfg.lateralRestraintsBottom?.join(", ") ?? "",
  );
  const vorigeBeamId = useRef(beam.id);
  useEffect(() => {
    if (vorigeBeamId.current !== beam.id) {
      vorigeBeamId.current = beam.id;
      setKipsteunenTekst(beam.checkConfig?.lateralRestraints?.join(", ") ?? "");
      setKipsteunenOnderTekst(beam.checkConfig?.lateralRestraintsBottom?.join(", ") ?? "");
    }
  }, [beam.id, beam.checkConfig]);

  // Uit de geometrie afgeleide rol — de "Automatisch"-optie toont hem, zodat
  // de gebruiker ziet wat er gebeurt als hij niets kiest.
  const afgeleideRol = bepaalStandaardRol(beam, nodes);
  /** "0.25, 0.5" → [0.25, 0.5]; alleen waarden strikt tussen 0 en 1. */
  const parseKipsteunen = (tekst: string): number[] =>
    tekst
      .split(/[,;\s]+/)
      .map((s) => parseFloat(s.replace(",", ".")))
      .filter((v) => Number.isFinite(v) && v > 0 && v < 1)
      .sort((a, b) => a - b);
  const systeemlengteM = (L / 1000).toFixed(2);

  return (
    <div className="fem-properties">
      <div className="fem-prop-selection">
        <span className="fem-prop-selection-label">Selectie</span>
        <span className="fem-prop-selection-value">Balk {beam.id}</span>
      </div>
      <div className="fem-prop-tabs">
        <button
          className={`fem-prop-tab${propTab === "algemeen" ? " active" : ""}`}
          onClick={() => setPropTab("algemeen")}
        >
          Algemeen
        </button>
        <button
          className={`fem-prop-tab${propTab === "norm" ? " active" : ""}`}
          onClick={() => setPropTab("norm")}
        >
          {isHout ? "EN 1995" : "EN 1993"}
        </button>
      </div>
      {propTab === "norm" && (
        <div className="fem-prop-body">
          {!isHout && (
            <>
              <Section title="Kniklengtes">
                <Row label="L_cr,y [m]">
                  <input
                    type="number" className="fem-prop-input" step="0.1" min="0"
                    placeholder={systeemlengteM}
                    value={cfg.bucklingLengthY_m ?? ""}
                    onChange={(e) => setCfg({
                      bucklingLengthY_m: e.target.value === "" ? undefined : Number(e.target.value),
                    })}
                  />
                </Row>
                <Row label="L_cr,z [m]">
                  <input
                    type="number" className="fem-prop-input" step="0.1" min="0"
                    placeholder={systeemlengteM}
                    value={cfg.bucklingLengthZ_m ?? ""}
                    onChange={(e) => setCfg({
                      bucklingLengthZ_m: e.target.value === "" ? undefined : Number(e.target.value),
                    })}
                  />
                </Row>
                <div className="fem-prop-hint">Leeg = systeemlengte ({systeemlengteM} m).</div>
              </Section>

              {/* Kipsteunen per flens. Meestal wil je er gewoon n gelijk
                  verdeeld: vul het aantal in en de posities volgen. Wie een
                  onregelmatige verdeling nodig heeft, past het positieveld
                  daarna aan (het aantal volgt dan mee). */}
              {([
                ["boven", "Kipsteunen bovenflens", "lateralRestraints" as const, kipsteunenTekst, setKipsteunenTekst],
                ["onder", "Kipsteunen onderflens", "lateralRestraintsBottom" as const, kipsteunenOnderTekst, setKipsteunenOnderTekst],
              ] as const).map(([sleutel, titel, veld, tekst, setTekst]) => {
                const huidig = (cfg[veld] ?? []) as number[];
                return (
                  <Section key={sleutel} title={titel} defaultOpen={sleutel === "boven"}>
                    <Row label="Aantal">
                      <input
                        type="number" className="fem-prop-input" min="0" max="20" step="1"
                        placeholder="0"
                        value={huidig.length || ""}
                        onChange={(e) => {
                          const n = Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0)));
                          // n steunen gelijk verdeeld over de staaflengte:
                          // op 1/(n+1), 2/(n+1), … n/(n+1).
                          const posities = Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
                          setTekst(posities.map((f) => f.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")).join(", "));
                          setCfg({ [veld]: posities } as Partial<BeamCheckConfig>);
                        }}
                      />
                    </Row>
                    <Row label="Posities">
                      <input
                        type="text" className="fem-prop-input"
                        placeholder="0.25, 0.5, 0.75"
                        value={tekst}
                        onChange={(e) => {
                          // Ruwe tekst in lokale state (zodat "0.25, " typen
                          // mag), geparseerde fracties meteen naar het model.
                          setTekst(e.target.value);
                          setCfg({ [veld]: parseKipsteunen(e.target.value) } as Partial<BeamCheckConfig>);
                        }}
                        spellCheck={false}
                      />
                    </Row>
                    {huidig.length > 0 && L > 0 && (
                      <div className="fem-prop-hint">
                        Op {huidig.map((f) => ((f * L) / 1000).toFixed(2).replace(".", ",")).join(" · ")} m
                        vanaf de startknoop.
                      </div>
                    )}
                    {huidig.length === 0 && (
                      <div className="fem-prop-hint">
                        Vul een aantal in voor gelijke verdeling, of typ zelf fracties (0–1).
                      </div>
                    )}
                  </Section>
                );
              })}
            </>
          )}

          {isHout && (
            <Section title="Klimaat en belastingduur">
              <Row label="Klimaatklasse">
                <select
                  className="fem-prop-select"
                  value={cfg.serviceClass ?? 1}
                  onChange={(e) => setCfg({ serviceClass: Number(e.target.value) as 1 | 2 | 3 })}
                >
                  <option value={1}>1 — verwarmd binnen</option>
                  <option value={2}>2 — overdekt buiten</option>
                  <option value={3}>3 — onbeschermd buiten</option>
                </select>
              </Row>
              <Row label="Belastingduur">
                <select
                  className="fem-prop-select"
                  value={cfg.loadDuration ?? "medium"}
                  onChange={(e) => setCfg({
                    loadDuration: e.target.value as NonNullable<BeamCheckConfig["loadDuration"]>,
                  })}
                >
                  <option value="permanent">Permanent</option>
                  <option value="long">Lang</option>
                  <option value="medium">Middellang</option>
                  <option value="short">Kort</option>
                  <option value="instantaneous">Momentaan</option>
                </select>
              </Row>
              <div className="fem-prop-hint">Bepaalt k_mod en k_def in de houttoetsing.</div>
            </Section>
          )}

          <Section title="Doorbuiging (BGT)">
            <Row label="Klasse">
              <select
                className="fem-prop-select"
                value={cfg.deflectionClass ?? "floor"}
                onChange={(e) => setCfg({
                  deflectionClass: e.target.value as NonNullable<BeamCheckConfig["deflectionClass"]>,
                })}
              >
                <option value="floor">Vloer (L/300)</option>
                <option value="roof">Dak (L/250)</option>
                <option value="cantilever">Uitkraging (L/150)</option>
                <option value="custom">Aangepast (L/n)</option>
              </select>
            </Row>
            {cfg.deflectionClass === "custom" && (
              <Row label="n in L/n">
                <input
                  type="number" className="fem-prop-input" step="1" min="1"
                  placeholder="333"
                  value={cfg.deflectionLimitNumerator ?? ""}
                  onChange={(e) => setCfg({
                    deflectionLimitNumerator: e.target.value === "" ? undefined : Number(e.target.value),
                  })}
                />
              </Row>
            )}
            {!isHout && (
              <Row label="Zeeg [mm]">
                <input
                  type="number" className="fem-prop-input" step="1"
                  placeholder="0"
                  value={cfg.preCamber_mm ?? ""}
                  onChange={(e) => setCfg({
                    preCamber_mm: e.target.value === "" ? undefined : Number(e.target.value),
                  })}
                />
              </Row>
            )}
          </Section>
        </div>
      )}
      {propTab === "algemeen" && (
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

        {/* Belastingtype: wát deze staaf constructief is, en dus welk
            belastingvlak hij draagt. De windgenerator leest dit veld. De
            keuze "Automatisch" laat de rol uit de geometrie volgen; elke
            andere keuze legt hem vast in het projectbestand. */}
        <Section title="Belastingtype">
          <Row label="Rol">
            <select
              className="fem-prop-select"
              value={beam.loadRole ?? ""}
              onChange={(e) => updateBeam?.(beam.id, {
                loadRole: e.target.value === "" ? undefined : e.target.value as BeamLoadRole,
              })}
              title={"Bepaalt welk belastingvlak deze staaf draagt.\n"
                + "Gevel en dak krijgen windbelasting; vloer en binnenstaaf niet."}
            >
              <option value="">Automatisch — {BEAM_LOAD_ROLE_LABEL[afgeleideRol]}</option>
              {BEAM_LOAD_ROLES.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </Row>
          <div className="fem-prop-hint">
            {beam.loadRole
              ? "Handmatig vastgelegd — de windgenerator gebruikt deze rol."
              : `Volgt uit de geometrie (${angDeg.toFixed(0)}° t.o.v. horizontaal). `
                + "Kies zelf een rol om dit vast te leggen."}
          </div>
        </Section>

        {/* Profiel en materiaal zijn één combinatie — geen losse velden.
            De knop opent de ProfielKiezer-wizard met de huidige waarden
            voorgeselecteerd; Toepassen schrijft beide velden in één keer. */}
        <Section title="Doorsnede">
          <Row label="Profiel">
            <code>{profile} — {material}</code>
          </Row>
          {isHout ? (
            <Row label="Norm"><code>EN 338 / EN 1995-1-1</code></Row>
          ) : (
            <>
              <Row label="E"><code>210000 N/mm²</code></Row>
              {fyStaal && <Row label="fy"><code>{fyStaal} N/mm²</code></Row>}
            </>
          )}
          <div className="fem-prop-kiezer-row">
            <button
              className="fem-prop-kiezer-btn"
              onClick={() => setKiezerOpen(true)}
              title="Kies profiel én materiaal in één stap (wizard)"
            >
              Profiel kiezen…
            </button>
          </div>
          {kiezerOpen && (
            <ProfielKiezer
              open
              onClose={() => setKiezerOpen(false)}
              huidig={{ material, profile }}
              onApply={(keuze) => updateBeam?.(beam.id, keuze)}
            />
          )}
        </Section>

        <Section title="Randvoorwaarden" defaultOpen={false}>
          <Row label="Start scharnierend">
            <input
              type="checkbox" className="fem-prop-checkbox"
              checked={beam.releases?.startRy ?? false}
              onChange={(e) => setRelease("startRy", e.target.checked)}
            />
          </Row>
          <Row label="Eind scharnierend">
            <input
              type="checkbox" className="fem-prop-checkbox"
              checked={beam.releases?.endRy ?? false}
              onChange={(e) => setRelease("endRy", e.target.checked)}
            />
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
      )}
    </div>
  );
}

// ── Load properties ──────────────────────────────────────────────────────
const LOAD_TYPE_LABEL: Record<Load["type"], string> = {
  lineLoad:    "Lijnlast (q)",
  pointForce:  "Puntkracht",
  pointMoment: "Puntmoment",
  thermal:     "Temperatuur (ΔT)",
  edgeLoad:    "Randlast (plaatrand)",
};

/** NL-labels voor de benoemde plaatranden (edgeLoad, P3.3). */
const EDGE_LABEL: Record<NonNullable<Load["edge"]>, string> = {
  bottom: "onderrand", top: "bovenrand", left: "linkerrand", right: "rechterrand",
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

  // ── Deellast (begin/eind) — invoer in m vanaf de startknoop, intern
  //    opgeslagen als fracties 0..1 (Load.startFrac/endFrac). ──────────────
  const lenM = beamLen / 1000;
  const fracA = Math.min(1, Math.max(0, load.startFrac ?? 0));
  const fracB = Math.min(1, Math.max(0, load.endFrac ?? 1));
  const [beginStr, setBeginStr] = useState((fracA * lenM).toFixed(2));
  const [endStr, setEndStr]     = useState((fracB * lenM).toFixed(2));
  useEffect(() => {
    setBeginStr((Math.min(1, Math.max(0, load.startFrac ?? 0)) * lenM).toFixed(2));
    setEndStr((Math.min(1, Math.max(0, load.endFrac ?? 1)) * lenM).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.id, load.startFrac, load.endFrac, lenM]);
  /** Commit begin/eind (m) → fracties; ongeldig bereik wordt genegeerd
   *  (validatie: 0 ≤ begin < eind ≤ L) en de invoer springt terug. */
  const commitRange = (rawBegin: string, rawEnd: string) => {
    if (!updateLoad || lenM <= 0) return;
    const b0 = Number(rawBegin), b1 = Number(rawEnd);
    const valid = Number.isFinite(b0) && Number.isFinite(b1)
      && b0 >= 0 && b0 < b1 && b1 <= lenM + 1e-9;
    if (!valid) {
      // terugspringen naar de huidige (geldige) waarden
      setBeginStr((fracA * lenM).toFixed(2));
      setEndStr((fracB * lenM).toFixed(2));
      return;
    }
    const aF = b0 / lenM;
    const bF = Math.min(1, b1 / lenM);
    const isFull = aF <= 0 && bF >= 1;
    updateLoad(load.id, {
      startFrac: isFull ? undefined : aF,
      endFrac:   isFull ? undefined : bF,
    });
  };
  const isPartial = fracA > 0 || fracB < 1;

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
          {/* Puntlast op een vrije positie op de staaf: positie achteraf
              bij te stellen, in meters vanaf de startknoop. */}
          {beam && load.type === "pointForce" && load.posFrac !== undefined && beamLen > 0 && (
            <Row label="Positie [m]">
              <input
                type="number"
                className="fem-prop-input"
                step="0.05"
                min="0"
                max={(beamLen / 1000).toFixed(3)}
                value={((load.posFrac * beamLen) / 1000).toFixed(3)}
                onChange={(e) => {
                  const meters = Number(e.target.value);
                  if (!Number.isFinite(meters) || beamLen <= 0) return;
                  const frac = Math.min(1, Math.max(0, (meters * 1000) / beamLen));
                  updateLoad?.(load.id, { posFrac: frac });
                }}
              />
            </Row>
          )}
          {load.type === "edgeLoad" && load.plateId !== undefined && (
            <Row label="Op plaat"><code>{load.plateId} ({EDGE_LABEL[load.edge ?? "top"]})</code></Row>
          )}
          {beamLen > 0 && load.type === "lineLoad" && (
            <Row label="Balklengte"><code>{(beamLen / 1000).toFixed(2)} m</code></Row>
          )}
        </Section>

        {load.type === "lineLoad" && (
          <Section title="Lijnlast">
            <Row label="Assenstelsel">
              <select
                className="fem-prop-select"
                value={load.qCoord ?? "global"}
                onChange={e => updateLoad?.(load.id, { qCoord: e.target.value as "global" | "local" })}
                title={"Globaal: de last werkt in wereldassen (verticaal/horizontaal), ongeacht de staafhelling.\nLokaal: de last draait met de staaf mee (loodrecht op of langs de staafas).\nq blijft altijd per meter staaflengte."}
              >
                <option value="global">Globaal (wereldassen)</option>
                <option value="local">Lokaal (staafassen)</option>
              </select>
            </Row>
            <Row label="Richting">
              <select
                className="fem-prop-select"
                value={load.qDir ?? "z"}
                onChange={e => updateLoad?.(load.id, { qDir: e.target.value as "x" | "z" })}
                title={(load.qCoord ?? "global") === "local"
                  ? "Lokale z: loodrecht op de staafas. Lokale x: axiaal langs de staaf."
                  : "Wereld-Z: verticaal (negatief = omlaag). Wereld-X: horizontaal (wind)."}
              >
                {(load.qCoord ?? "global") === "local" ? (
                  <>
                    <option value="z">Loodrecht op staaf (lokale z)</option>
                    <option value="x">Axiaal langs staaf (lokale x)</option>
                  </>
                ) : (
                  <>
                    <option value="z">Verticaal (+Z, gravitatie)</option>
                    <option value="x">Horizontaal (+X, wind)</option>
                  </>
                )}
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
              <>
                <Row label="Begin (m)">
                  <input
                    type="number" step="0.1" min="0" max={lenM}
                    className="fem-prop-input fem-prop-input-mono"
                    value={beginStr}
                    onChange={e => setBeginStr(e.target.value)}
                    onBlur={() => commitRange(beginStr, endStr)}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    title={`Afstand vanaf de startknoop (0 – ${lenM.toFixed(2)} m); 0 t/m ${lenM.toFixed(2)} = volle lengte`}
                  />
                </Row>
                <Row label="Einde (m)">
                  <input
                    type="number" step="0.1" min="0" max={lenM}
                    className="fem-prop-input fem-prop-input-mono"
                    value={endStr}
                    onChange={e => setEndStr(e.target.value)}
                    onBlur={() => commitRange(beginStr, endStr)}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    title={`Afstand vanaf de startknoop (0 – ${lenM.toFixed(2)} m)`}
                  />
                </Row>
                {isPartial && (
                  <Row label="Belast deel">
                    <code>{((fracB - fracA) * lenM).toFixed(2)} m</code>
                  </Row>
                )}
                <Row label="Totaal">
                  <code>
                    {(() => {
                      // Uniform: q·L_belast. Trapezium: (qa+qb)/2 · L_belast.
                      const qa = load.qStart ?? load.q ?? 0;
                      const qb = load.qEnd   ?? load.q ?? 0;
                      return ((qa + qb) / 2 * (fracB - fracA) * lenM).toFixed(2);
                    })()} kN
                  </code>
                </Row>
              </>
            )}
            <Row label="Werkt in">
              <code>
                {(load.qCoord ?? "global") === "local"
                  ? ((load.qDir ?? "z") === "z" ? "Loodrecht op de staaf" : "Axiaal langs de staaf")
                  : ((load.qDir ?? "z") === "z" ? "Wereld-Z (negatief = omlaag)" : "Wereld-X (horizontaal)")}
              </code>
            </Row>
          </Section>
        )}

        {load.type === "edgeLoad" && (
          <Section title="Randlast">
            <Row label="Rand"><code>{EDGE_LABEL[load.edge ?? "top"]}</code></Row>
            <Row label="Richting">
              <select
                className="fem-prop-select"
                value={load.qDir ?? "z"}
                onChange={e => updateLoad?.(load.id, { qDir: e.target.value as "x" | "z" })}
                title={"Wereld-Z: verticaal (negatief = omlaag). Wereld-X: horizontaal.\np blijft per meter randlengte."}
              >
                <option value="z">Verticaal (+Z, gravitatie)</option>
                <option value="x">Horizontaal (+X, wind)</option>
              </select>
            </Row>
            <Row label="p (kN/m)">
              <input
                ref={qRef}
                type="number" step="0.1" className="fem-prop-input fem-prop-input-mono"
                value={qStr}
                onChange={e => setQStr(e.target.value)}
                onBlur={() => commitNumber(qStr, "q")}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </Row>
            <Row label="Werkt in">
              <code>
                {(load.qDir ?? "z") === "z"
                  ? "Wereld-Z (negatief = omlaag)" : "Wereld-X (horizontaal)"}
              </code>
            </Row>
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
/**
 * Bewerkbare plaateigenschappen (P3.1): dikte, E, ν, ρ en meshSize gaan via
 * `updatePlate` de store in (één history-snapshot per commit → undo/redo per
 * wijziging). De solver-invalidatie loopt via de bestaande trigger-route:
 * elke plaatmutatie wist de resultaten, waarna Berekenen opnieuw rekent —
 * identiek aan staafwijzigingen (materiaal/profiel).
 */
function PlateProperties({ plate, nodes, updatePlate }: {
  plate: Plate; nodes: Node[];
  updatePlate?: (id: number, updates: Partial<Plate>) => void;
}) {
  // Weergavewaarden mét defaults — een oude plaat zonder rekenvelden toont
  // dus de PLATE_DEFAULTS in plaats van lege invoervelden.
  const d = withPlateDefaults(plate);
  // String-state per veld; commit onBlur/Enter (zelfde patroon als
  // NodeProperties). Ongeldige invoer springt terug naar de huidige waarde.
  const [dikteStr, setDikteStr] = useState(String(d.thickness));
  const [eStr, setEStr]         = useState(String(d.E));
  const [nuStr, setNuStr]       = useState(String(d.nu));
  const [rhoStr, setRhoStr]     = useState(String(d.rho));
  const [meshStr, setMeshStr]   = useState(String(d.meshSize));
  useEffect(() => {
    setDikteStr(String(d.thickness));
    setEStr(String(d.E));
    setNuStr(String(d.nu));
    setRhoStr(String(d.rho));
    setMeshStr(String(d.meshSize));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate.id, plate.thickness, plate.E, plate.nu, plate.rho, plate.meshSize]);

  type PlaatRekenveld = "thickness" | "E" | "nu" | "rho" | "meshSize";
  const commitVeld = (
    raw: string, veld: PlaatRekenveld,
    geldig: (v: number) => boolean,
    terug: () => void,
  ) => {
    const v = Number(raw);
    if (!Number.isFinite(v) || !geldig(v) || !updatePlate) { terug(); return; }
    if (v !== d[veld]) updatePlate(plate.id, { [veld]: v });
    else terug(); // ongewijzigd — invoer terug in het nette formaat
  };
  const inputProps = {
    type: "number" as const,
    className: "fem-prop-input fem-prop-input-mono",
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    },
  };

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
          <Row label="Type"><code>Wandschijf (in het vlak)</code></Row>
          {plate.nodeIds.map((id, i) => {
            const n = nodes.find(nn => nn.id === id);
            return <Row key={`pc${i}`} label={`Hoek ${i + 1}`}>
              <code>{id}{n ? ` (${n.x}, ${n.z})` : ""}</code>
            </Row>;
          })}
        </Section>
        <Section title="Materiaal en dikte">
          <Row label="Dikte (mm)">
            <input
              {...inputProps} step="1" min="0.1" value={dikteStr}
              onChange={e => setDikteStr(e.target.value)}
              onBlur={() => commitVeld(dikteStr, "thickness",
                v => v > 0, () => setDikteStr(String(d.thickness)))}
              title="Plaatdikte t — spanningen schalen omgekeerd evenredig (t ×2 → σ ×0,5)"
            />
          </Row>
          <Row label="E (N/mm²)">
            <input
              {...inputProps} step="1000" min="1" value={eStr}
              onChange={e => setEStr(e.target.value)}
              onBlur={() => commitVeld(eStr, "E",
                v => v > 0, () => setEStr(String(d.E)))}
              title="Elasticiteitsmodulus (staal 210000, beton ~30000)"
            />
          </Row>
          <Row label="ν (—)">
            <input
              {...inputProps} step="0.05" min="0" max="0.49" value={nuStr}
              onChange={e => setNuStr(e.target.value)}
              onBlur={() => commitVeld(nuStr, "nu",
                v => v >= 0 && v < 0.5, () => setNuStr(String(d.nu)))}
              title="Dwarscontractiecoëfficiënt (0 ≤ ν < 0,5; staal 0,3, beton 0,2)"
            />
          </Row>
          <Row label="ρ (kg/m³)">
            <input
              {...inputProps} step="50" min="0" value={rhoStr}
              onChange={e => setRhoStr(e.target.value)}
              onBlur={() => commitVeld(rhoStr, "rho",
                v => v >= 0, () => setRhoStr(String(d.rho)))}
              title="Volumieke massa — gebruikt voor het eigengewicht (staal 7850, beton 2500)"
            />
          </Row>
        </Section>
        <Section title="Rekenmesh">
          <Row label="Meshgrootte (mm)">
            <input
              {...inputProps} step="50" min="10" value={meshStr}
              onChange={e => setMeshStr(e.target.value)}
              onBlur={() => commitVeld(meshStr, "meshSize",
                v => v >= 10, () => setMeshStr(String(d.meshSize)))}
              title="Gewenste elementgrootte van het quad-grid; kleiner = nauwkeuriger maar zwaarder (limiet ±4000 vrijheidsgraden)"
            />
          </Row>
          <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--theme-text-faint)" }}>
            Wijzigingen maken de resultaten ongeldig — klik <strong>Berekenen</strong> om
            opnieuw te rekenen.
          </div>
        </Section>
      </div>
    </div>
  );
}
