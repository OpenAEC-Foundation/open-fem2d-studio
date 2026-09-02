/**
 * TableView — de Tabel-hoofdweergave: model en lasten als bewerkbare
 * tabellen, resultaten als alleen-lezen tabellen. Vergelijkbaar met de
 * tabelinvoer van klassieke 2D-raamwerkprogramma's.
 *
 * - De actieve dataset wordt gekozen via de ribbon-tab "Tabel" (App.tsx
 *   houdt de keuze in state en geeft hem hier door).
 * - Bewerkingen lopen via dezelfde store-mutators als canvas/eigenschappen
 *   (updateNode/updateBeam/updateLoad/…), dus undo/redo werkt gewoon.
 * - Rij-klik zet de selectie (setSelection) zodat canvas en het
 *   eigenschappenpaneel meevolgen.
 * - Resultaat-tabellen hebben een combinatie-dropdown (omhullende waar
 *   zinvol) en tonen "Nog niet berekend" zolang er geen resultaten zijn.
 * - Export CSV / Kopiëren (TSV) / Filter-focus worden door de ribbon
 *   aangeroepen via de geregistreerde TableViewApi.
 */
import { useState, useRef, useEffect, type ReactNode, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  withPlateDefaults,
  type Node, type Beam, type Plate, type Support, type Load, type LoadCase,
  type Selection, type SupportType,
} from "../fem/femTypes";
import type { SolverResult } from "../fem/solver/types";
import type { LoadCombination, Envelope } from "../fem/solver/combinations";
import { STEEL_GRADES, PROFILE_SUGGESTIONS } from "../fem/BarPropertiesDialog";
import { SUPPORTED_TIMBER_GRADES } from "../../lib/timberCheckBuilder";
import { notifySuccess, notifyWarning } from "../../io/notify";
import { NumCell, SelectCell, CheckCell, TextCell, fmtNum } from "./cells";
import type { TableDataset, TableViewApi } from "./tableTypes";
import "./TableView.css";

// ── Spec-typen: één uniforme beschrijving per dataset ───────────────────────
interface RowSpec {
  key: string;
  /** De <td>-reeks van de rij (zonder de acties-kolom). */
  cells: ReactNode;
  /** Tekstwaarden per kolom — gebruikt voor CSV/TSV-export én het filter. */
  exportCells: string[];
  onSelect?: () => void;
  selected?: boolean;
  onDelete?: () => void;
}

interface TableSpec {
  columns: string[];
  rows: RowSpec[];
  /** True → acties-kolom (prullenbak) tonen. */
  editable: boolean;
  onAddRow?: () => void;
  emptyText: string;
}

interface TableViewProps {
  dataset: TableDataset;
  /** App.tsx houdt hier een ref op zodat de ribbon-knoppen kunnen werken. */
  apiRef: MutableRefObject<TableViewApi | null>;
  // Model
  nodes: Node[];
  beams: Beam[];
  plates: Plate[];
  supports: Support[];
  loads: Load[];
  loadCases: LoadCase[];
  activeLoadCaseId: number;
  selection: Selection;
  setSelection: (s: Selection) => void;
  // Mutators (allemaal snapshot-bewust via useFemStore)
  addNode: (x: number, z: number) => number;
  updateNode: (id: number, x: number, z: number) => void;
  removeNode: (id: number) => void;
  addBeam: (fromId: number, toId: number) => number | null;
  updateBeam: (id: number, updates: Partial<Beam>) => void;
  removeBeam: (id: number) => void;
  /** Patch rekenvelden op een plaat (dikte, E, ν, ρ, meshSize) — P5.1. */
  updatePlate: (id: number, updates: Partial<Plate>) => void;
  removePlate: (id: number) => void;
  addSupport: (nodeId: number, type: SupportType, k?: number) => void;
  removeSupport: (nodeId: number) => void;
  addLoad: (l: Omit<Load, "id">) => void;
  updateLoad: (id: number, updates: Partial<Load>) => void;
  removeLoad: (id: number) => void;
  // Resultaten
  combinations: LoadCombination[];
  combinationResults: Map<number, SolverResult> | null;
  /** Per-belastinggeval-resultaten — dragen de `plateElements` (P5.1). */
  caseResults: Map<number, SolverResult> | null;
  envelope: Envelope | null;
}

/** Bestandsnaam-slug per dataset voor de CSV-export. */
const DATASET_SLUG: Record<TableDataset, string> = {
  nodes: "knopen",
  elements: "elementen",
  plates: "platen",
  pointLoads: "puntlasten",
  lineLoads: "lijnlasten",
  thermalLoads: "temperatuurlasten",
  reactions: "oplegreacties",
  displacements: "verplaatsingen",
  forces: "staafkrachten",
};

const trashIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

export default function TableView(props: TableViewProps) {
  const {
    dataset, apiRef,
    nodes, beams, plates, supports, loads, loadCases, activeLoadCaseId,
    selection, setSelection,
    addNode, updateNode, removeNode,
    addBeam, updateBeam, removeBeam, updatePlate, removePlate,
    addSupport, removeSupport,
    addLoad, updateLoad, removeLoad,
    combinations, combinationResults, caseResults, envelope,
  } = props;
  const { t } = useTranslation("ribbon");

  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  // Combinatie-keuze voor de resultaat-tabellen; null = automatisch
  // (omhullende indien beschikbaar, anders de eerste combinatie).
  const [scope, setScope] = useState<"envelope" | number | null>(null);

  // ── Gedeelde helpers ──────────────────────────────────────────────────────
  const beamLength = (b: Beam): number => {
    const a = nodes.find((n) => n.id === b.from);
    const c = nodes.find((n) => n.id === b.to);
    return a && c ? Math.hypot(c.x - a.x, c.z - a.z) : 0;
  };

  const supportOptions = [
    { value: "none",      label: t("table.supportNone") },
    { value: "pinned",    label: t("table.supportPinned") },
    { value: "fixed",     label: t("table.supportFixed") },
    { value: "xRoller",   label: t("table.supportXRoller") },
    { value: "zRoller",   label: t("table.supportZRoller") },
    { value: "zSpring",   label: t("table.supportZSpring") },
    { value: "xSpring",   label: t("table.supportXSpring") },
    { value: "rotSpring", label: t("table.supportRotSpring") },
  ];
  const supportLabel = (type?: string) =>
    supportOptions.find((o) => o.value === (type ?? "none"))?.label ?? String(type);

  const nodeOptions = nodes.map((n) => ({ value: String(n.id), label: String(n.id) }));
  const beamOptions = beams.map((b) => ({
    value: String(b.id), label: `${b.id} (${b.from}–${b.to})`,
  }));
  const caseOptions = loadCases.map((c) => ({ value: String(c.id), label: c.name }));
  const caseName = (id: number) => loadCases.find((c) => c.id === id)?.name ?? String(id);

  const selNodeId = selection?.type === "node" ? selection.id : null;
  const selBeamId = selection?.type === "beam" ? selection.id : null;
  const selPlateId = selection?.type === "plate" ? selection.id : null;
  const selLoadId = selection?.type === "load" ? selection.id : null;

  // ── Resultaat-scope (zelfde gedachte als de rapport-resultaatsecties,
  //    maar lokaal: omhullende indien beschikbaar, anders eerste combinatie;
  //    een verdwenen keuze valt stil terug op de default). ──────────────────
  const combosWithResults = combinationResults
    ? combinations.filter((c) => combinationResults.has(c.id))
    : [];
  const hasResults = combosWithResults.length > 0;
  const envelopeAvailable = hasResults && envelope !== null;
  // Verplaatsingen kennen geen omhullende-tabel (de envelope bewaart geen
  // per-knoop-extremen), dus daar alleen combinaties.
  const allowEnvelope = dataset === "reactions" || dataset === "forces";
  let resolvedScope: "envelope" | number | null = null;
  if (hasResults) {
    if (scope === "envelope" && envelopeAvailable && allowEnvelope) {
      resolvedScope = "envelope";
    } else if (typeof scope === "number" && combosWithResults.some((c) => c.id === scope)) {
      resolvedScope = scope;
    } else {
      resolvedScope = allowEnvelope && envelopeAvailable
        ? "envelope"
        : combosWithResults[0].id;
    }
  }
  const scopeResult: SolverResult | undefined =
    typeof resolvedScope === "number" && combinationResults
      ? combinationResults.get(resolvedScope)
      : undefined;
  const comboName = (id: number) => combinations.find((c) => c.id === id)?.name ?? String(id);

  // ── Dataset-specifieke specs ──────────────────────────────────────────────

  const buildNodesSpec = (): TableSpec => ({
    columns: [
      t("table.colId"), t("table.colX"), t("table.colZ"),
      t("table.colSupport"), t("table.colSpringK"),
    ],
    editable: true,
    emptyText: t("table.noRows"),
    onAddRow: () => {
      const id = addNode(0, 0);
      setSelection({ type: "node", id });
    },
    rows: nodes.map((n) => {
      const sup = supports.find((s) => s.nodeId === n.id);
      const isSpring = sup && (sup.type === "zSpring" || sup.type === "xSpring" || sup.type === "rotSpring");
      return {
        key: `n${n.id}`,
        selected: selNodeId === n.id,
        onSelect: () => setSelection({ type: "node", id: n.id }),
        onDelete: () => removeNode(n.id),
        exportCells: [
          String(n.id), fmtNum(n.x), fmtNum(n.z),
          supportLabel(sup?.type), isSpring ? fmtNum(sup?.k) : "",
        ],
        cells: (
          <>
            <td className="ftable-id">{n.id}</td>
            <td><NumCell value={n.x} onCommit={(v) => updateNode(n.id, v, n.z)} /></td>
            <td><NumCell value={n.z} onCommit={(v) => updateNode(n.id, n.x, v)} /></td>
            <td>
              <SelectCell
                value={sup?.type ?? "none"}
                options={supportOptions}
                onCommit={(v) => {
                  if (v === "none") removeSupport(n.id);
                  else addSupport(n.id, v as SupportType, sup?.k);
                }}
              />
            </td>
            <td>
              {isSpring ? (
                <NumCell
                  value={sup?.k}
                  title="Veerstijfheid: kN/mm (translatie) of kNm/rad (rotatie)"
                  onCommit={(v) => {
                    if (v <= 0) return false; // veerstijfheid moet positief zijn
                    addSupport(n.id, sup!.type, v);
                  }}
                />
              ) : (
                <span className="ftable-muted">—</span>
              )}
            </td>
          </>
        ),
      };
    }),
  });

  const buildElementsSpec = (): TableSpec => {
    const materialGroups = (current: string) => {
      const known = [...STEEL_GRADES, ...SUPPORTED_TIMBER_GRADES].includes(current);
      return {
        // Onbekend materiaal (vrije tekst) als losse optie behouden zodat de
        // select de huidige waarde blijft tonen.
        options: known ? undefined : [{ value: current, label: current }],
        groups: [
          { label: t("table.materialSteel"), options: STEEL_GRADES.map((g) => ({ value: g, label: g })) },
          { label: t("table.materialTimber"), options: SUPPORTED_TIMBER_GRADES.map((g) => ({ value: g, label: g })) },
        ],
      };
    };
    return {
      columns: [
        t("table.colId"), t("table.colFrom"), t("table.colTo"), t("table.colLength"),
        t("table.colMaterial"), t("table.colProfile"),
        t("table.colHingeStart"), t("table.colHingeEnd"),
      ],
      editable: true,
      emptyText: t("table.noRows"),
      onAddRow: () => {
        if (nodes.length < 2) {
          notifyWarning(t("table.needTwoNodes"));
          return;
        }
        // Eerste nog niet verbonden knooppaar zoeken (modelvolgorde).
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i].id, b = nodes[j].id;
            const dup = beams.some((bb) =>
              (bb.from === a && bb.to === b) || (bb.from === b && bb.to === a));
            if (!dup) {
              const id = addBeam(a, b);
              if (id !== null) setSelection({ type: "beam", id });
              return;
            }
          }
        }
        notifyWarning(t("table.allPairsConnected"));
      },
      rows: beams.map((b) => {
        const material = b.material ?? "S235";
        const profile = b.profile ?? "HEA160";
        const mat = materialGroups(material);
        return {
          key: `b${b.id}`,
          selected: selBeamId === b.id,
          onSelect: () => setSelection({ type: "beam", id: b.id }),
          onDelete: () => removeBeam(b.id),
          exportCells: [
            String(b.id), String(b.from), String(b.to), fmtNum(beamLength(b), 0),
            material, profile,
            b.releases?.startRy ? "x" : "", b.releases?.endRy ? "x" : "",
          ],
          cells: (
            <>
              <td className="ftable-id">{b.id}</td>
              <td>
                <SelectCell
                  value={String(b.from)} options={nodeOptions}
                  onCommit={(v) => {
                    const id = Number(v);
                    if (id !== b.to) updateBeam(b.id, { from: id }); // zelfde knoop 2× = ongeldig
                  }}
                />
              </td>
              <td>
                <SelectCell
                  value={String(b.to)} options={nodeOptions}
                  onCommit={(v) => {
                    const id = Number(v);
                    if (id !== b.from) updateBeam(b.id, { to: id });
                  }}
                />
              </td>
              <td className="ftable-num">{fmtNum(beamLength(b), 0)}</td>
              <td>
                <SelectCell
                  value={material}
                  options={mat.options}
                  groups={mat.groups}
                  onCommit={(v) => updateBeam(b.id, { material: v })}
                />
              </td>
              <td>
                <TextCell
                  value={profile} listId="ftable-profile-list"
                  onCommit={(v) => updateBeam(b.id, { profile: v })}
                />
              </td>
              <td className="ftable-center">
                <CheckCell
                  checked={b.releases?.startRy ?? false}
                  onCommit={(v) => updateBeam(b.id, { releases: { ...b.releases, startRy: v } })}
                />
              </td>
              <td className="ftable-center">
                <CheckCell
                  checked={b.releases?.endRy ?? false}
                  onCommit={(v) => updateBeam(b.id, { releases: { ...b.releases, endRy: v } })}
                />
              </td>
            </>
          ),
        };
      }),
    };
  };

  // ── Meshstatistiek per plaat: aantal meshknopen/-elementen uit het laatste
  //    resultaat (elk belastinggeval/combinatie draagt hetzelfde mesh — de
  //    eerste treffer volstaat; de per-case-resultaten dragen de
  //    plateElements, combinatieresultaten defensief als tweede bron), of —
  //    defensief — uit een eventuele meshcache op de plaat (het async
  //    CDT-pad voor polygonen, parallel in ontwikkeling); zonder alles
  //    blijft de cel leeg ("—"). ─────────────────────────────────────────────
  const plateMeshStats = (p: Plate): { nodes?: number; elems?: number } => {
    for (const bron of [caseResults, combinationResults]) {
      if (!bron) continue;
      for (const res of bron.values()) {
        const pr = res.plateElements?.find((r) => r.plateId === p.id);
        if (pr && pr.elements.length > 0) {
          // Unieke hoekpunten van de elementvlakken = de meshknopen van de
          // plaat (elke meshknoop is hoekpunt van minstens één element).
          const uniek = new Set<string>();
          for (const el of pr.elements) {
            for (const c of el.corners) {
              uniek.add(`${Math.round(c.x * 1000)}|${Math.round(c.z * 1000)}`);
            }
          }
          return { nodes: uniek.size, elems: pr.elements.length };
        }
      }
    }
    // Meshcache op de plaat (polygonen-pad) — veldvorm defensief lezen zodat
    // dit blijft werken ongeacht de exacte cache-structuur.
    const cache = (p as unknown as Record<string, unknown>).meshCache;
    if (cache && typeof cache === "object") {
      const c = cache as Record<string, unknown>;
      const nodes = Array.isArray(c.nodes) ? c.nodes.length : undefined;
      const elems = Array.isArray(c.triangles) ? c.triangles.length
        : Array.isArray(c.elements) ? c.elements.length : undefined;
      if (nodes !== undefined || elems !== undefined) return { nodes, elems };
    }
    return {};
  };

  const buildPlatesSpec = (): TableSpec => ({
    columns: [
      t("table.colId"), t("table.colCorners"),
      "t [mm]", "E [N/mm²]", "ν [—]", "ρ [kg/m³]",
      t("table.colMeshSize"), t("table.colMeshNodes"), t("table.colMeshElems"),
    ],
    editable: true,
    emptyText: t("table.noPlates"),
    // Bewust géén onAddRow: een plaat ontstaat op het canvas (hoekknopen
    // aanklikken met de plaattool); een lege tabelrij zou een plaat zonder
    // geldige geometrie opleveren.
    rows: plates.map((p) => {
      const d = withPlateDefaults(p);
      const stats = plateMeshStats(p);
      const statCell = (v: number | undefined) =>
        v !== undefined ? v : <span className="ftable-muted">—</span>;
      return {
        key: `p${p.id}`,
        selected: selPlateId === p.id,
        onSelect: () => setSelection({ type: "plate", id: p.id }),
        onDelete: () => removePlate(p.id),
        exportCells: [
          String(p.id), p.nodeIds.join(", "),
          fmtNum(d.thickness), fmtNum(d.E), fmtNum(d.nu), fmtNum(d.rho),
          fmtNum(d.meshSize),
          stats.nodes !== undefined ? String(stats.nodes) : "",
          stats.elems !== undefined ? String(stats.elems) : "",
        ],
        cells: (
          <>
            <td className="ftable-id">{p.id}</td>
            <td>{p.nodeIds.join(", ")}</td>
            <td>
              <NumCell
                value={d.thickness}
                title="Plaatdikte t in mm — spanningen schalen omgekeerd evenredig (t ×2 → σ ×0,5)"
                onCommit={(v) => {
                  if (v <= 0) return false; // dikte moet positief zijn
                  updatePlate(p.id, { thickness: v });
                }}
              />
            </td>
            <td>
              <NumCell
                value={d.E}
                title="Elasticiteitsmodulus in N/mm² (staal 210000, beton ~30000)"
                onCommit={(v) => {
                  if (v <= 0) return false;
                  updatePlate(p.id, { E: v });
                }}
              />
            </td>
            <td>
              <NumCell
                value={d.nu}
                title="Dwarscontractiecoëfficiënt (0 ≤ ν < 0,5; staal 0,3, beton 0,2)"
                onCommit={(v) => {
                  if (v < 0 || v >= 0.5) return false;
                  updatePlate(p.id, { nu: v });
                }}
              />
            </td>
            <td>
              <NumCell
                value={d.rho}
                title="Volumieke massa in kg/m³ — gebruikt voor het eigengewicht (staal 7850, beton 2500)"
                onCommit={(v) => {
                  if (v < 0) return false;
                  updatePlate(p.id, { rho: v });
                }}
              />
            </td>
            <td>
              <NumCell
                value={d.meshSize}
                title="Gewenste elementgrootte van het rekenmesh in mm; kleiner = nauwkeuriger maar zwaarder (limiet ±4000 vrijheidsgraden)"
                onCommit={(v) => {
                  if (v < 10) return false; // te fijn mesh → DOF-limiet
                  updatePlate(p.id, { meshSize: v });
                }}
              />
            </td>
            <td className="ftable-num">{statCell(stats.nodes)}</td>
            <td className="ftable-num">{statCell(stats.elems)}</td>
          </>
        ),
      };
    }),
  });

  const buildPointLoadsSpec = (): TableSpec => {
    const rows = loads.filter((l) => l.type === "pointForce" || l.type === "pointMoment");
    return {
      columns: [
        t("table.colId"), t("table.colType"), t("table.colCase"), t("table.colNode"),
        "Fx [kN]", "Fz [kN]", "My [kNm]",
      ],
      editable: true,
      emptyText: t("table.noRows"),
      onAddRow: () => {
        if (nodes.length === 0) {
          notifyWarning(t("table.needNode"));
          return;
        }
        // Zelfde default als de canvas-popover: verticale puntlast −10 kN.
        addLoad({ type: "pointForce", caseId: activeLoadCaseId, nodeId: nodes[0].id, fx: 0, fz: -10 });
      },
      rows: rows.map((l) => {
        const isMoment = l.type === "pointMoment";
        return {
          key: `l${l.id}`,
          selected: selLoadId === l.id,
          onSelect: () => setSelection({ type: "load", id: l.id }),
          onDelete: () => removeLoad(l.id),
          exportCells: [
            String(l.id),
            isMoment ? t("table.typeMoment") : t("table.typeForce"),
            caseName(l.caseId), String(l.nodeId ?? ""),
            isMoment ? "" : fmtNum(l.fx ?? 0),
            isMoment ? "" : fmtNum(l.fz ?? 0),
            isMoment ? fmtNum(l.my ?? 0) : "",
          ],
          cells: (
            <>
              <td className="ftable-id">{l.id}</td>
              <td>{isMoment ? t("table.typeMoment") : t("table.typeForce")}</td>
              <td>
                <SelectCell
                  value={String(l.caseId)} options={caseOptions}
                  onCommit={(v) => updateLoad(l.id, { caseId: Number(v) })}
                />
              </td>
              <td>
                <SelectCell
                  value={String(l.nodeId ?? "")} options={nodeOptions}
                  onCommit={(v) => updateLoad(l.id, { nodeId: Number(v) })}
                />
              </td>
              <td>
                {isMoment ? <span className="ftable-muted">—</span> : (
                  <NumCell value={l.fx ?? 0} onCommit={(v) => updateLoad(l.id, { fx: v })} />
                )}
              </td>
              <td>
                {isMoment ? <span className="ftable-muted">—</span> : (
                  <NumCell value={l.fz ?? 0} onCommit={(v) => updateLoad(l.id, { fz: v })} />
                )}
              </td>
              <td>
                {isMoment ? (
                  <NumCell value={l.my ?? 0} onCommit={(v) => updateLoad(l.id, { my: v })} />
                ) : <span className="ftable-muted">—</span>}
              </td>
            </>
          ),
        };
      }),
    };
  };

  const buildLineLoadsSpec = (): TableSpec => {
    const rows = loads.filter((l) => l.type === "lineLoad");
    const dirOptions = [
      { value: "z", label: t("table.dirZ") },
      { value: "x", label: t("table.dirX") },
    ];
    // Trapezium → uniform terugvouwen: gemiddelde van beide uiteinden wordt q
    // (zelfde regel als het eigenschappenpaneel).
    const clearTrap = (l: Load) => {
      const avg = ((l.qStart ?? l.q ?? 0) + (l.qEnd ?? l.q ?? 0)) / 2;
      updateLoad(l.id, { q: avg, qStart: undefined, qEnd: undefined });
    };
    return {
      columns: [
        t("table.colId"), t("table.colCase"), t("table.colBeam"), t("table.colDir"),
        "q [kN/m]", "q₁ [kN/m]", "q₂ [kN/m]",
        t("table.colStartFrac"), t("table.colEndFrac"),
      ],
      editable: true,
      emptyText: t("table.noRows"),
      onAddRow: () => {
        if (beams.length === 0) {
          notifyWarning(t("table.needBeam"));
          return;
        }
        addLoad({ type: "lineLoad", caseId: activeLoadCaseId, beamId: beams[0].id, q: -5 });
      },
      rows: rows.map((l) => {
        const isTrap = l.qStart !== undefined || l.qEnd !== undefined;
        const fracA = l.startFrac ?? 0;
        const fracB = l.endFrac ?? 1;
        return {
          key: `l${l.id}`,
          selected: selLoadId === l.id,
          onSelect: () => setSelection({ type: "load", id: l.id }),
          onDelete: () => removeLoad(l.id),
          exportCells: [
            String(l.id), caseName(l.caseId), String(l.beamId ?? ""),
            (l.qDir ?? "z") === "z" ? t("table.dirZ") : t("table.dirX"),
            isTrap ? "" : fmtNum(l.q ?? 0),
            isTrap ? fmtNum(l.qStart) : "",
            isTrap ? fmtNum(l.qEnd) : "",
            fmtNum(fracA, 3), fmtNum(fracB, 3),
          ],
          cells: (
            <>
              <td className="ftable-id">{l.id}</td>
              <td>
                <SelectCell
                  value={String(l.caseId)} options={caseOptions}
                  onCommit={(v) => updateLoad(l.id, { caseId: Number(v) })}
                />
              </td>
              <td>
                <SelectCell
                  value={String(l.beamId ?? "")} options={beamOptions}
                  onCommit={(v) => updateLoad(l.id, { beamId: Number(v) })}
                />
              </td>
              <td>
                <SelectCell
                  value={l.qDir ?? "z"} options={dirOptions}
                  onCommit={(v) => updateLoad(l.id, { qDir: v as "x" | "z" })}
                />
              </td>
              <td>
                {/* Uniforme q — invullen terwijl er een trapezium staat maakt
                    de last weer uniform. */}
                <NumCell
                  value={isTrap ? undefined : (l.q ?? 0)}
                  placeholder={isTrap ? "—" : undefined}
                  onCommit={(v) => updateLoad(l.id, { q: v, qStart: undefined, qEnd: undefined })}
                />
              </td>
              <td>
                {/* Trapezium-beginwaarde; wissen (leeg) vouwt terug naar uniform. */}
                <NumCell
                  value={l.qStart}
                  placeholder={isTrap ? undefined : "—"}
                  onClear={isTrap ? () => clearTrap(l) : undefined}
                  onCommit={(v) => updateLoad(l.id, { qStart: v, qEnd: l.qEnd ?? l.q ?? v })}
                />
              </td>
              <td>
                <NumCell
                  value={l.qEnd}
                  placeholder={isTrap ? undefined : "—"}
                  onClear={isTrap ? () => clearTrap(l) : undefined}
                  onCommit={(v) => updateLoad(l.id, { qEnd: v, qStart: l.qStart ?? l.q ?? v })}
                />
              </td>
              <td>
                {/* Deellast: begin/einde als fractie 0..1 van de staaflengte. */}
                <NumCell
                  value={fracA} decimals={3}
                  title="Begin van het belaste deel als fractie van de staaflengte (0 = startknoop)"
                  onCommit={(v) => {
                    if (v < 0 || v >= fracB || v >= 1) return false;
                    updateLoad(l.id, { startFrac: v <= 0 && fracB >= 1 ? undefined : v });
                  }}
                />
              </td>
              <td>
                <NumCell
                  value={fracB} decimals={3}
                  title="Einde van het belaste deel als fractie van de staaflengte (1 = eindknoop)"
                  onCommit={(v) => {
                    if (v <= fracA || v > 1) return false;
                    updateLoad(l.id, { endFrac: v >= 1 && fracA <= 0 ? undefined : v });
                  }}
                />
              </td>
            </>
          ),
        };
      }),
    };
  };

  const buildThermalSpec = (): TableSpec => {
    const rows = loads.filter((l) => l.type === "thermal");
    return {
      columns: [t("table.colId"), t("table.colCase"), t("table.colBeam"), "ΔT [K]"],
      editable: true,
      emptyText: t("table.noRows"),
      onAddRow: () => {
        if (beams.length === 0) {
          notifyWarning(t("table.needBeam"));
          return;
        }
        // Zelfde default als de canvas-popover: ΔT = 20 K.
        addLoad({ type: "thermal", caseId: activeLoadCaseId, beamId: beams[0].id, deltaT: 20 });
      },
      rows: rows.map((l) => ({
        key: `l${l.id}`,
        selected: selLoadId === l.id,
        onSelect: () => setSelection({ type: "load", id: l.id }),
        onDelete: () => removeLoad(l.id),
        exportCells: [
          String(l.id), caseName(l.caseId), String(l.beamId ?? ""), fmtNum(l.deltaT ?? 0),
        ],
        cells: (
          <>
            <td className="ftable-id">{l.id}</td>
            <td>
              <SelectCell
                value={String(l.caseId)} options={caseOptions}
                onCommit={(v) => updateLoad(l.id, { caseId: Number(v) })}
              />
            </td>
            <td>
              <SelectCell
                value={String(l.beamId ?? "")} options={beamOptions}
                onCommit={(v) => updateLoad(l.id, { beamId: Number(v) })}
              />
            </td>
            <td>
              <NumCell value={l.deltaT ?? 0} onCommit={(v) => updateLoad(l.id, { deltaT: v })} />
            </td>
          </>
        ),
      })),
    };
  };

  // ── Resultaat-tabellen (alleen-lezen; eenheden zoals elders in de UI:
  //    solver rekent in N/N·mm → hier kN/kNm; verplaatsingen mm, φ in mrad) ──

  const buildReactionsSpec = (): TableSpec => {
    if (!hasResults || resolvedScope === null) {
      return { columns: [], rows: [], editable: false, emptyText: t("table.notComputed") };
    }
    if (resolvedScope === "envelope" && envelope) {
      const entries = [...envelope.reactions.entries()].sort((a, b) => a[0] - b[0]);
      return {
        columns: [t("table.colNode"), "Fx,min [kN]", "Fx,max [kN]", "Fz,min [kN]", "Fz,max [kN]"],
        editable: false,
        emptyText: t("table.noRows"),
        rows: entries.map(([nid, r]) => {
          const vals = [r.fx_min / 1e3, r.fx_max / 1e3, r.fz_min / 1e3, r.fz_max / 1e3];
          return {
            key: `r${nid}`,
            selected: selNodeId === nid,
            onSelect: () => setSelection({ type: "node", id: nid }),
            exportCells: [String(nid), ...vals.map((v) => fmtNum(v))],
            cells: (
              <>
                <td className="ftable-id">{nid}</td>
                {vals.map((v, i) => <td key={i} className="ftable-num">{fmtNum(v)}</td>)}
              </>
            ),
          };
        }),
      };
    }
    const entries = scopeResult ? [...scopeResult.reactions.entries()].sort((a, b) => a[0] - b[0]) : [];
    return {
      columns: [t("table.colNode"), "Fx [kN]", "Fz [kN]", "My [kNm]"],
      editable: false,
      emptyText: t("table.noRows"),
      rows: entries.map(([nid, r]) => {
        const vals = [r.fx / 1e3, r.fz / 1e3, r.my / 1e6];
        return {
          key: `r${nid}`,
          selected: selNodeId === nid,
          onSelect: () => setSelection({ type: "node", id: nid }),
          exportCells: [String(nid), ...vals.map((v) => fmtNum(v))],
          cells: (
            <>
              <td className="ftable-id">{nid}</td>
              {vals.map((v, i) => <td key={i} className="ftable-num">{fmtNum(v)}</td>)}
            </>
          ),
        };
      }),
    };
  };

  const buildDisplacementsSpec = (): TableSpec => {
    if (!hasResults || resolvedScope === null || !scopeResult) {
      return { columns: [], rows: [], editable: false, emptyText: t("table.notComputed") };
    }
    const entries = [...scopeResult.displacements.entries()].sort((a, b) => a[0] - b[0]);
    return {
      columns: [t("table.colNode"), "ux [mm]", "uz [mm]", "φy [mrad]"],
      editable: false,
      emptyText: t("table.noRows"),
      rows: entries.map(([nid, d]) => {
        const vals = [d.ux, d.uz, d.ry * 1000];
        return {
          key: `d${nid}`,
          selected: selNodeId === nid,
          onSelect: () => setSelection({ type: "node", id: nid }),
          exportCells: [String(nid), ...vals.map((v) => fmtNum(v))],
          cells: (
            <>
              <td className="ftable-id">{nid}</td>
              {vals.map((v, i) => <td key={i} className="ftable-num">{fmtNum(v)}</td>)}
            </>
          ),
        };
      }),
    };
  };

  const buildForcesSpec = (): TableSpec => {
    if (!hasResults || resolvedScope === null) {
      return { columns: [], rows: [], editable: false, emptyText: t("table.notComputed") };
    }
    if (resolvedScope === "envelope" && envelope) {
      const entries = [...envelope.elements.entries()].sort((a, b) => a[0] - b[0]);
      return {
        columns: [
          t("table.colBeam"),
          "N,min [kN]", "N,max [kN]", "V,min [kN]", "V,max [kN]",
          "M,min [kNm]", "M,max [kNm]", t("table.colGoverning"),
        ],
        editable: false,
        emptyText: t("table.noRows"),
        rows: entries.map(([bid, e]) => {
          const vals = [
            e.N_min / 1e3, e.N_max / 1e3, e.V_min / 1e3, e.V_max / 1e3,
            e.M_min / 1e6, e.M_max / 1e6,
          ];
          const gov = comboName(e.governingCombinationId);
          return {
            key: `f${bid}`,
            selected: selBeamId === bid,
            onSelect: () => setSelection({ type: "beam", id: bid }),
            exportCells: [String(bid), ...vals.map((v) => fmtNum(v)), gov],
            cells: (
              <>
                <td className="ftable-id">{bid}</td>
                {vals.map((v, i) => <td key={i} className="ftable-num">{fmtNum(v)}</td>)}
                <td>{gov}</td>
              </>
            ),
          };
        }),
      };
    }
    const entries = scopeResult ? [...scopeResult.elements.entries()].sort((a, b) => a[0] - b[0]) : [];
    return {
      columns: [
        t("table.colBeam"), "N [kN]", "V [kN]",
        "M,begin [kNm]", "M,eind [kNm]", "|M|max [kNm]",
      ],
      editable: false,
      emptyText: t("table.noRows"),
      rows: entries.map(([bid, e]) => {
        // |M|max over de stations (veldmoment kan groter zijn dan de eindmomenten).
        const mAbsMax = e.bendingMoment.length > 0
          ? e.bendingMoment.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
          : Math.max(Math.abs(e.M_start), Math.abs(e.M_end));
        const vals = [e.N / 1e3, e.V / 1e3, e.M_start / 1e6, e.M_end / 1e6, mAbsMax / 1e6];
        return {
          key: `f${bid}`,
          selected: selBeamId === bid,
          onSelect: () => setSelection({ type: "beam", id: bid }),
          exportCells: [String(bid), ...vals.map((v) => fmtNum(v))],
          cells: (
            <>
              <td className="ftable-id">{bid}</td>
              {vals.map((v, i) => <td key={i} className="ftable-num">{fmtNum(v)}</td>)}
            </>
          ),
        };
      }),
    };
  };

  const spec: TableSpec = (() => {
    switch (dataset) {
      case "nodes":         return buildNodesSpec();
      case "elements":      return buildElementsSpec();
      case "plates":        return buildPlatesSpec();
      case "pointLoads":    return buildPointLoadsSpec();
      case "lineLoads":     return buildLineLoadsSpec();
      case "thermalLoads":  return buildThermalSpec();
      case "reactions":     return buildReactionsSpec();
      case "displacements": return buildDisplacementsSpec();
      case "forces":        return buildForcesSpec();
    }
  })();

  const datasetTitle = t(`table.${dataset === "forces" ? "internalForces"
    : dataset === "lineLoads" ? "distLoads"
    : dataset}`);

  // ── Filter ────────────────────────────────────────────────────────────────
  const f = filter.trim().toLowerCase();
  const visibleRows = f === ""
    ? spec.rows
    : spec.rows.filter((r) => r.exportCells.join(" ").toLowerCase().includes(f));

  // ── Export / kopiëren (op de gefilterde rijen, zoals getoond) ────────────
  const exportCsv = () => {
    if (spec.columns.length === 0) return;
    const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const text = [spec.columns, ...visibleRows.map((r) => r.exportCells)]
      .map((row) => row.map(esc).join(";"))
      .join("\r\n");
    // BOM zodat Excel de UTF-8-kolomkoppen (Δ, φ, ₁) goed leest.
    const blob = new Blob([String.fromCharCode(0xfeff) + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tabel-${DATASET_SLUG[dataset]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyTable = () => {
    if (spec.columns.length === 0) return;
    // TSV zodat plakken in Excel netjes in kolommen valt.
    const text = [spec.columns, ...visibleRows.map((r) => r.exportCells)]
      .map((row) => row.join("\t"))
      .join("\n");
    // Fallback voor contexts zonder Clipboard-API-permissie (bv. embedded
    // webviews): onzichtbaar textarea + execCommand("copy").
    const legacyCopy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) notifySuccess(t("table.copied"), t("table.copiedBody"));
        else notifyWarning(t("table.copyFailed"));
      } catch {
        notifyWarning(t("table.copyFailed"));
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => notifySuccess(t("table.copied"), t("table.copiedBody")),
        legacyCopy,
      );
    } else {
      legacyCopy();
    }
  };

  // API registreren voor de ribbon-knoppen — elke render opnieuw zodat de
  // closures altijd de actuele dataset/filter zien.
  useEffect(() => {
    apiRef.current = {
      exportCsv,
      copyTable,
      focusFilter: () => {
        filterRef.current?.focus();
        filterRef.current?.select();
      },
    };
    return () => { apiRef.current = null; };
  });

  const isResultDataset =
    dataset === "reactions" || dataset === "displacements" || dataset === "forces";

  return (
    <div className="ftable-view">
      <div className="ftable-toolbar">
        <span className="ftable-title">{datasetTitle}</span>
        {isResultDataset && hasResults && (
          <label className="ftable-scope">
            <span>{t("table.combination")}:</span>
            <select
              className="ftable-select"
              value={resolvedScope === "envelope" ? "envelope" : String(resolvedScope)}
              onChange={(e) => {
                const v = e.target.value;
                setScope(v === "envelope" ? "envelope" : Number(v));
              }}
            >
              {allowEnvelope && envelopeAvailable && (
                <option value="envelope">{t("table.envelope")}</option>
              )}
              {combosWithResults.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <input
          ref={filterRef}
          className="ftable-filter"
          type="search"
          placeholder={t("table.filterPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {spec.onAddRow && (
          <button className="ftable-add-btn" onClick={spec.onAddRow} title={t("table.addRow")}>
            + {t("table.addRow")}
          </button>
        )}
      </div>

      <div className="ftable-scroll">
        {spec.columns.length > 0 && visibleRows.length > 0 ? (
          <table className="ftable">
            <thead>
              <tr>
                {spec.columns.map((c, i) => <th key={i}>{c}</th>)}
                {spec.editable && <th className="ftable-actions-col" aria-label={t("table.deleteRow")} />}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={r.key}
                  className={r.selected ? "selected" : undefined}
                  onClick={r.onSelect}
                >
                  {r.cells}
                  {spec.editable && (
                    <td className="ftable-actions">
                      {r.onDelete && (
                        <button
                          className="ftable-delete-btn"
                          title={t("table.deleteRow")}
                          onClick={(e) => { e.stopPropagation(); r.onDelete!(); }}
                        >
                          {trashIcon}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ftable-empty">
            {spec.rows.length > 0 && f !== ""
              ? t("table.noRowsFiltered")
              : spec.emptyText}
          </div>
        )}
      </div>

      {/* Profiel-suggesties voor de profiel-cellen (Elementen-tabel). */}
      <datalist id="ftable-profile-list">
        {PROFILE_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
      </datalist>
    </div>
  );
}
